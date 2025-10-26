#!/usr/bin/env python3

"""
                   ◆ SpatialShot Development Launcher ◆
                                     
          This script is the primary entry point for developers,
     designed to simulate and test the complete application workflow.
                                     
           It orchestrates the platform-specific screen capture,
      the C++/Qt drawing interface, and the final Electron UI panel.
        This facilitates rapid development and integration testing
              without requiring the final Rust orchestrator.
                                     
       NOTE: Binaries must be compiled (run setup.py) or downloaded.
                    HACK: View latest GitHub Release ↴
          https://github.com/a7mddra/spatialshot/releases/latest
"""

from __future__ import annotations

import os
import platform
import subprocess
import logging
import shutil
import sys
import time
import re
import signal
from pathlib import Path
from typing import Optional, List, Tuple

# Constants and Path Setup
HOME = Path.home()
SCRIPT_PATH = Path(__file__).resolve()
DIR_PATH = SCRIPT_PATH.parent
PRJKT_ROOT = DIR_PATH.parent
PKGS_PATH = PRJKT_ROOT / "packages"
PLATFORM_PATH = PKGS_PATH / "orchestrator" / "src" / "platform"

# Temporary Directory
def get_tmp_path() -> Path:
    """
    Returns the platform-specific temporary directory path.
    """
    tmp = Path("spatialshot") / "tmp"
    system = platform.system()
    if system == "Windows":
        return Path(os.environ.get("LOCALAPPDATA")) / tmp
    elif system == "Darwin":
        return Path.home() / "Library" / "Caches" / tmp
    else:
        return Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / tmp

TMP_PATH = get_tmp_path()

# Binary Paths
UNIXCAPTOOL_BINARY = PKGS_PATH / "unixcaptool" / "dist" / "unixcaptool"
SQUIGGLE_BINARY    = ".exe" if platform.system() == "Windows" else ""
SQUIGGLE_BINARY    = f"squiggle{SQUIGGLE_BINARY}"
SQUIGGLE_BINARY    = PKGS_PATH / "squiggle" / "dist" / SQUIGGLE_BINARY
ELECTRON_NODE      = PKGS_PATH / "spatialshot"

# Scripts Paths
SC_grabber_WIN    = PLATFORM_PATH / "windows" / "sc-grabber.ps1"
SC_grabber_MAC    = PLATFORM_PATH / "darwin"  / "sc-grabber.sh"
SC_grabber_X11    = PLATFORM_PATH / "linux"   / "sc-grabber.sh"
HM_MONITORS_WIN   = PLATFORM_PATH / "windows" / "hm-monitors.ps1"
HM_MONITORS_MAC   = PLATFORM_PATH / "darwin"  / "hm-monitors.sh"
HM_MONITORS_LINUX = PLATFORM_PATH / "linux"   / "hm-monitors.sh"


# Logging Setup
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] (%(name)s) %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("spatialshot.dev")


# Environment Detection
def identify_display_environment() -> str:
    """
    Identifies the host OS and display server.
    """
    system_name = platform.system().lower()
    if system_name == "windows":
        return "win32"
    if system_name == "darwin":
        return "darwin"
    if system_name == "linux":
        xdg = os.environ.get("XDG_SESSION_TYPE", "").lower()
        if os.environ.get("WAYLAND_DISPLAY") or xdg == "wayland":
            return "wayland"
        if os.environ.get("DISPLAY") or xdg == "x11":
            return "x11"
        logger.warning("Unknown Linux display environment. Falling back to wayland.")
        return "wayland"
    return "unknown"


def get_monitor_count() -> int:
    """
    Executes the native script for the host OS to get the monitor count.
    """
    env = identify_display_environment()
    script_path = None
    command = []

    if env == "win32":
        script_path = HM_MONITORS_WIN
        command = ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(script_path)]
    elif env == "darwin":
        script_path = HM_MONITORS_MAC
        command = ["/bin/bash", str(script_path)]
    elif env in ("x11", "wayland"):
        script_path = HM_MONITORS_LINUX
        command = ["/bin/bash", str(script_path)]
    else:
        logger.warning("Unsupported environment for monitor count. Defaulting to 1.")
        return 1

    if not script_path or not script_path.exists():
        logger.warning("Monitor script not found: %s. Defaulting to 1.", script_path)
        return 1

    success, stdout, _ = _run_process(command)
    if not success:
        logger.warning("Failed to get monitor count. Defaulting to 1.")
        return 1
    try:
        count = int(stdout.strip())
        logger.info("Detected %d monitor(s).", count)
        return count if count >= 1 else 1
    except (ValueError, FileNotFoundError) as e:
        logger.error("Failed to parse monitor count from script: %s. Defaulting to 1.", e)
        return 1


# Core Utility Functions
def _run_process(
    command: List[str],
    cwd: Optional[Path] = None,
    env: Optional[dict] = None
) -> Tuple[bool, str, str]:
    """
    Runs a subprocess and logs its execution.
    """
    cmd_str = " ".join(f'"'"{c}"'"' if " " in c else c for c in command)
    logger.debug("Running command: %s", cmd_str)
    
    process_env = os.environ.copy()
    if env:
        process_env.update(env)

    try:
        process = subprocess.run(
            command,
            cwd=str(cwd) if cwd is not None else None,
            env=process_env,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        logger.info("Command succeeded: %s", command[0])
        return True, process.stdout, process.stderr
    except subprocess.CalledProcessError as exc:
        logger.error("Command failed (rc=%d): %s", exc.returncode, command[0])
        if exc.stdout: logger.error("STDOUT: %s", exc.stdout.strip())
        if exc.stderr: logger.error("STDERR: %s", exc.stderr.strip())
        return False, exc.stdout, exc.stderr
    except FileNotFoundError:
        logger.error("Command not found: %s", command[0])
        return False, "", "File not found"


def clear_tmp() -> Path:
    """
    Clears and recreates the temporary directory for this run.
    """
    tmp = TMP_PATH
    if tmp.exists():
        try:
            shutil.rmtree(tmp)
            logger.info("Removed existing tmp directory: %s", tmp)
        except Exception as exc:
            logger.warning("Could not remove tmp directory %s: %s", tmp, exc)
    try:
        tmp.mkdir(parents=True, exist_ok=True)
        logger.info("Created clean tmp directory: %s", tmp)
    except Exception as exc:
        logger.error("Failed to create tmp directory %s: %s", tmp, exc)
        raise
    return tmp


def wait_for_file(file_path: Path, timeout_sec: int = 5) -> bool:
    """
    Waits for a specific file to be created.
    """
    start_time = time.time()
    logger.info("Waiting for file: %s", file_path.name)
    while not file_path.exists():
        if time.time() - start_time > timeout_sec:
            logger.error("Timeout: File not found after %d sec", timeout_sec)
            return False
        time.sleep(0.1)
    logger.info("File found: %s", file_path.name)
    return True


# Application Lifecycle Functions
def run_screenshot_capture(
    env: str,
    monitor_count: int
) -> Tuple[bool, int]:
    """
    Runs the native screenshot script for the current platform.
    """
    if env == "wayland":
        logger.info("Initiating capture: Linux (Wayland)")
        if not UNIXCAPTOOL_BINARY.exists():
            logger.error("ycaptool binary not found: %s", UNIXCAPTOOL_BINARY)
            return False, 0
        success, _, _ = _run_process([str(UNIXCAPTOOL_BINARY)])
        return success, monitor_count

    script_path = None
    command = []

    if env == "win32":
        script_path = SC_grabber_WIN
        command = ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(script_path)]
    elif env == "darwin":
        script_path = SC_grabber_MAC
        command = ["/bin/bash", str(script_path)]
    elif env == "x11":
        script_path = SC_grabber_X11
        command = ["/bin/bash", str(script_path)]
    else:
        logger.error("Unsupported environment: %s", env)
        return False, 0

    if not script_path or not script_path.exists():
        logger.error("Screenshot script missing: %s", script_path)
        return False, 0

    success, _, _ = _run_process(command)
    return success, monitor_count


def launch_squiggle() -> bool:
    """
    Launches the Squiggle (C++/Qt) application. Returns True on success.
    """
    if not SQUIGGLE_BINARY.exists():
        logger.error("Squiggle binary not found: %s", SQUIGGLE_BINARY)
        return False
    
    logger.info("Launching Squiggle...")
    command = [str(SQUIGGLE_BINARY)]
    success, _, _ = _run_process(command)

    if not success:
        logger.error("Squiggle application failed or was cancelled.")
        return False
    
    return True


def launch_electron(output_png: Path) -> bool:
    """
    Launches the Electron application in development mode.
    """
    if not ELECTRON_NODE.exists() or not (ELECTRON_NODE / "package.json").exists():
        logger.error("Electron project not found: %s", ELECTRON_NODE)
        return False

    welcome_css = ELECTRON_NODE / "pages" / "welcome" / "style.css"
    if not welcome_css.exists():
        logger.info("Welcome CSS not found. Running one-time Sass build...")
        build_command = ["npm", "run", "build:css"]
        success, _, _ = _run_process(build_command, cwd=ELECTRON_NODE)
        if not success or not welcome_css.exists():
            logger.error("Sass build failed.")
            return False
        logger.info("Sass build complete.")

    logger.info("Starting Electron (npm start) for: %s", output_png.name)
    command = ["npm", "start", "--", str(output_png)]
    success, _, _ = _run_process(command, cwd=ELECTRON_NODE)
    return success


# Main Orchestrator
def main() -> None:
    logger.info("SpatialShot Development Launcher Started")

    def signal_handler(sig, frame):
        logger.info("Shutting down SpatialShot...")
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    env = identify_display_environment()
    if env == "unknown":
        logger.error("Unsupported OS.")
        sys.exit(1)

    monitors = get_monitor_count()
    logger.info("Detected: %s with %d monitor(s)", env.upper(), monitors)

    tmp_path = clear_tmp()

    success, expected_png_count = run_screenshot_capture(env, monitors)
    if not success:
        logger.error("Screenshot capture phase failed.")
        sys.exit(1)

    logger.info("Waiting for %d screenshot(s)...", expected_png_count)
    all_found = all(wait_for_file(tmp_path / f"{i}.png") for i in range(1, expected_png_count + 1))
    if not all_found:
        logger.error("Failed to find all required screenshots.")
        sys.exit(1)
            
    logger.info("All screenshots captured!")

    if not launch_squiggle():
        logger.error("Squiggle capture phase failed.")
        sys.exit(1)
    
    logger.info("Waiting for Squiggle output (o*.png)...")
    output = None
    start_time = time.time()
    while time.time() - start_time < 5:
        for f in tmp_path.glob("o*.png"):
            match = re.search(r"^o(\d+)\.png$", f.name)
            if match:
                monitor_num = int(match.group(1))
                logger.info("Found Squiggle output: %s for monitor %d", f.name, monitor_num)
                output = f, monitor_num
                break
        if output:
            break
        time.sleep(0.1)

    if not output:
        logger.error("Timeout: Squiggle did not produce an output file.")
        sys.exit(1)
    
    output_path, _ = output
    logger.info("Squiggle capture complete: %s", output_path)

    if not launch_electron(output_path):
        logger.error("Failed to launch Electron.")
        sys.exit(1)

    logger.info("Development session launched successfully!")


if __name__ == "__main__":
    main()
