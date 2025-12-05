Since you are writing the bootstrapper logic yourself in Go or Rust, here is the algorithmic logic for adding an executable to the OS startup sequence without requiring admin privileges (User Scope).

### 1. Windows: The Registry Method
To make your app appear in the **"Startup Apps"** list (Task Manager > Startup), you must manipulate the Windows Registry.

**The Concept:**
Windows checks a specific Registry key for the Current User (`HKCU`) during login to see what programs to launch.

**The Logic Steps:**
1.  **Resolve Paths:** Get the absolute path of your installed `key_listener.exe`.
2.  **Open Registry Key:** Open the following Registry path with **Write** permissions:
    * Root: `HKEY_CURRENT_USER` (often abbreviated as HKCU).
    * Path: `Software\Microsoft\Windows\CurrentVersion\Run`
3.  **Set Value:**
    * Create (or update) a **String Value** (`REG_SZ`).
    * **Name:** `SpatialshotListener` (This is what shows up in Task Manager).
    * **Data:** The absolute path to your executable (e.g., `"C:\Users\Name\...\key_listener.exe"`). NOTE: If the path has spaces, wrap the string in quotes.
4.  **Close:** Close the registry handle.
5.  **Immediate Start:** The registry only handles *future* reboots. Your bootstrapper must manually spawn `key_listener.exe` immediately after setting the registry key so it works for the current session.

---

### 2. macOS: The Launch Agent Method
macOS does not use a registry. Instead, it uses the `launchd` system. To run an app at login without root, you create a **Launch Agent**.

**The Concept:**
You create a specific XML configuration file (`.plist`) in the user's library folder.

**The Logic Steps:**
1.  **Target Directory:** Locate the user's Launch Agents folder: `~/Library/LaunchAgents/`.
2.  **Construct XML Content:** Generate a text string (XML format) containing:
    * **Label:** A unique ID (e.g., `com.spatialshot.keylistener`).
    * **ProgramArguments:** An array containing the absolute path to your `key_listener` binary.
    * **RunAtLoad:** Set to `true` (Start immediately when loaded).
    * **KeepAlive:** Set to `true` (Restart if it crashes).
3.  **Write File:** Save this XML string as a file named `com.spatialshot.keylistener.plist` inside the `~/Library/LaunchAgents/` directory.
4.  **Register (The crucial step):** Writing the file isn't enough; you must tell the OS to read it.
    * Execute the system command: `launchctl bootstrap gui/<USER_UID> <PATH_TO_PLIST>`
    * *(Note: Older guides say `launchctl load`, but `bootstrap` is the modern standard. Either usually works).*
5.  **Immediate Start:** Because you set `RunAtLoad` to true, the `launchctl` command usually starts it immediately. You don't need to manually spawn the binary separately.

### Summary Checklist for your Code
* **Windows:** Write `HKCU` Registry Key -> Spawn Process manually.
* **macOS:** Write `.plist` to `~/Library/LaunchAgents` -> Run `launchctl` command.