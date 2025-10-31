# SPATIALSHOT Orchestrator

The orchestrator is a small, single-file Rust program that coordinates capture, composition, and hand-off steps for SpatialShot across Linux, macOS, and Windows. It embeds the platform helper script (`core.sh` / `core.ps1`) at compile time and temporarily writes that script to disk to execute it inside the interactive user session. The orchestrator is intended to be triggered via a hotkey and not run as a long-lived background service.

## Linux Flow

When the Rust program (a single-file ELF binary) is executed on Linux:

1. **Path Setup and Cleanup**: The program determines the user's home directory and sets up paths for the temporary directory (`${XDG_CACHE_HOME:-$HOME/.cache}/spatialshot/tmp`) and a temporary location for the core script (`${XDG_DATA_HOME:-$HOME/.local/share}/spatialshot/`core.sh``). It creates these directories if needed. The `core.sh` script is bundled inside the ELF binary as a compile-time string via `include_str!` in the Rust code (no separate file in the bundle; it's embedded in the executable). However, to execute it as a bash script, the program writes this embedded string content to the temporary `core.sh` path on disk (making it executable with chmod 0o755). This step is necessary because bash requires a file path to interpret; the script can't be executed directly from memory without writing it out. Simultaneously, it kills any running processes named "scgrabber-bin", "drawview-bin", or "spatialshot" using sysinfo for process enumeration and termination. Additionally, at startup, it scans for any other running instances of the Rust orchestrator binary itself (by comparing process executable paths and PIDs via sysinfo, excluding its own PID) and kills them to prevent duplicates, as the orchestrator is intended to be triggered singly via hotkey.

2. **Core Affinity**: It retrieves available CPU cores and pins the main thread to the first core (if available) for parallel processing.

3. **Grab Screen Initiation**: With the `core.sh` now on disk, it identifies the active user session using `loginctl` to find the session, extracts environment variables (DISPLAY, XAUTHORITY, DBUS_SESSION_BUS_ADDRESS, and WAYLAND_DISPLAY if on Wayland) from the session leader's `/proc/<pid>/environ`. Using `su -l <user> -c`, it runs `bash core.sh grab-screen` in the user's interactive session with the extracted env vars prefixed. This captures screenshots of all monitors into the tmp dir (after clearing it).

4. **Monitoring Thread Spawn**: A new thread is spawned and pinned to the second core (if available). This thread:
   - Gets the initial monitor count by running `bash core.sh count-monitors` via su in the user session and parsing the output.
   - Uses a notify watcher on the tmp dir to monitor for file creations.
   - Loops every 100ms, counting PNG files in tmp dir. When the count matches the monitor count (all screens captured), it runs `bash core.sh draw-view` via su in the user session.
   - Then continues monitoring for files like "o1.png", "o2.png", etc. (output from draw-view). Once detected, it runs `bash core.sh spatialshot <path/to/oN.png>` via su and exits the Rust process successfully.

5. **Safety Thread Spawn**: Another thread is spawned and pinned to the third core (if available). This thread:
   - Gets the initial monitor count.
   - Loops every 100ms: Checks if elapsed time exceeds 60 seconds (timeout) or if the current monitor count (re-queried via `core.sh`) has changed (e.g., due to plugging/unplugging displays). If either condition is true, it kills running packages and exits the Rust process with code 1.

6. **Error Handling**: If any command via su fails (non-zero exit), it propagates as an error. The program ensures GUI-dependent operations run in the interactive user session to avoid issues in background/system contexts.

## macOS (Darwin) Flow

When the Rust program (a single-file Mach-O binary) is executed on macOS:

1. **Path Setup and Cleanup**: The program uses the home directory to set up paths for the temporary directory (`$HOME/Library/Caches/spatialshot/tmp`) and a temporary location for the core script (`$HOME/Library/Application Support/spatialshot/`core.sh``). It creates these if needed. The `core.sh` script is bundled inside the Mach-O binary as a compile-time string via `include_str!` (embedded directly in the executable code). To execute it, the program writes this string to the temporary `core.sh` path on disk (making it executable with chmod 0o755), as bash needs a file to run the script. It also kills any running processes named "scgrabber-bin", "drawview-bin", or "spatialshot" using sysinfo. At startup, it additionally checks for and kills any other running instances of the Rust orchestrator binary (by matching executable paths and excluding its own PID via sysinfo) to ensure only one instance runs, given hotkey triggering.

2. **Core Affinity**: Retrieves available CPU cores and pins the main thread to the first core (if available).

3. **Grab Screen Initiation**: With `core.sh` on disk, it identifies the active user and UID using `stat -f %Su /dev/console` and `id -u`. Using `launchctl asuser <uid> sh -c`, it runs `bash core.sh grab-screen` in the user's interactive session. This captures screenshots into the tmp dir (after clearing it).

4. **Monitoring Thread Spawn**: A new thread is spawned and pinned to the second core (if available). This thread:
   - Gets the monitor count by running `bash core.sh count-monitors` via launchctl and parsing the output.
   - Watches the tmp dir with notify for file creations.
   - Loops every 100ms, counting files. When matching the monitor count, runs `bash core.sh draw-view` via launchctl.
   - Then monitors for "o*.png" files. On detection, runs `bash core.sh spatialshot <path/to/oN.png>` via launchctl and exits successfully.

5. **Safety Thread Spawn**: Spawned and pinned to the third core (if available). It:
   - Gets initial monitor count.
   - Loops every 100ms: Checks for 60-second timeout or monitor count change (re-queried via `core.sh`). If triggered, kills packages and exits with code 1.

6. **Error Handling**: launchctl commands check for success; failures propagate. This setup ensures access to the GUI session via launchctl for interactive execution.

## Windows (Win32) Flow

When the Rust program (a single-file EXE binary) is executed on Windows:

1. **Path Setup and Cleanup**: Uses %LOCALAPPDATA% to set up the temporary directory (`%LOCALAPPDATA%\spatialshot\tmp`) and a temporary location for the core script (`%LOCALAPPDATA%\spatialshot\`core.ps1``). Creates them if needed. The `core.ps1` script is bundled inside the EXE as a compile-time string via `include_str!` (embedded in the binary). To execute it, the program writes this string to the temporary `core.ps1` path on disk, as PowerShell requires a file path for the -File parameter. It kills processes named "scgrabber-bin.exe", "drawview.exe", or "spatialshot.exe" using sysinfo. At startup, it also detects and kills any other running instances of the Rust orchestrator EXE (by comparing process executable paths via sysinfo and excluding its own PID) to prevent multiple instances from hotkey triggers.

2. **Core Affinity**: Pins the main thread to the first core (if available).

3. **Grab Screen Initiation**: With `core.ps1` on disk, finds the active console session ID using WTSGetActiveConsoleSessionId (or enumerates if needed). Queries the user token with WTSQueryUserToken, duplicates it. Creates an environment block with CreateEnvironmentBlock. Uses CreateProcessAsUserW to launch "powershell -File `core.ps1` grab-screen" as the user, with the token, env block, and hidden window. This captures screenshots using nircmd into the tmp dir (after safety checks and clearing).

4. **Monitoring Thread Spawn**: Spawned and pinned to the second core. This thread:
   - Gets monitor count by running "powershell -File `core.ps1` count-monitors" via CreateProcessAsUserW (with output capture) and parses it.
   - Watches tmp dir with notify.
   - Loops every 100ms, counts files. On match, runs "powershell -File `core.ps1` draw-view" via CreateProcessAsUserW.
   - Then watches for "o*.png". On detection, runs "powershell -File `core.ps1` spatialshot <path/to/oN.png>" and exits.

5. **Safety Thread Spawn**: Pinned to the third core. It:
   - Gets initial count.
   - Loops every 100ms: Checks timeout or count change (re-run via CreateProcessAsUserW). If yes, kills packages and exits with 1.

6. **Error Handling**: WinAPI calls check for success; failures bail. For sync runs, captures stdout/stderr and checks exit code. This impersonates the interactive session to access GUI elements.
