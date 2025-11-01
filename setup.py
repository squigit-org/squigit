'''
SpatialShot Setup and Build Automation Script

This script provides a comprehensive, cross-platform solution for building the entire
SpatialShot application suite. It is designed for internal, development, and CI/CD
use, ensuring a consistent and reliable build process.

The script performs the following actions:
1.  **Platform Detection**: Identifies the host operating system (Windows, macOS, or Linux).
2.  **Dependency Verification**: (Placeholder) Ensures necessary build tools are present.
3.  **Component Compilation**: Executes the specific build commands for each sub-package:
    - `capturekit`: The C++/Qt-based screen capture utility.
    - `orchestrator`: The Rust-based core logic and process manager.
    - `spatialshot`: The Node.js/Electron-based user interface.
4.  **Testing**: Runs the automated test suite using pytest.

This script is engineered to be robust, with detailed logging, error handling, and
clear separation of concerns, adhering to high-quality software engineering standards.

Usage:
    python setup.py
'''

import logging
import os
import platform
import subprocess
import sys
import datetime  # <-- Moved import to the top
from typing import Dict, List, Optional, Callable

# --- Constants and Configuration ---

# Root directory of the project
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

# Logging configuration
LOG_FORMAT = "[%(asctime)s] [%(levelname)-8s] [%(module)s.%(funcName)s:%(lineno)d] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, stream=sys.stdout)

# Type alias for environment variables
EnvVars = Optional[Dict[str, str]]


class BuildError(Exception):
    """Custom exception for build failures."""
    def __init__(self, message: str, component: str):
        self.component = component
        super().__init__(f"[{component}] Build failed: {message}")


def _log_command(command: List[str], cwd: str, env: EnvVars = None):
    """Logs the details of a command to be executed."""
    logging.info(f"Executing command: `{' '.join(command)}`")
    logging.info(f"  in directory: {cwd}")
    if env:
        logging.debug(f"  with environment: {env}")


def _log_process_output(output: str, log_func: Callable, prefix: str):
    """Helper to log multi-line process output with a prefix, respecting log format."""
    if not output.strip():
        return
    for line in output.strip().splitlines():
        log_func(f"{prefix} {line}")


def _execute_command(command: List[str], cwd: str, component: str, env: EnvVars = None) -> None:
    """
    Executes a shell command and handles logging and error reporting.

    Args:
        command: The command to execute as a list of strings.
        cwd: The working directory for the command.
        component: The name of the component being built (for logging).
        env: Optional dictionary of environment variables.

    Raises:
        BuildError: If the command returns a non-zero exit code.
    """
    _log_command(command, cwd, env)
    try:
        process = subprocess.run(
            command,
            cwd=cwd,
            check=True,
            capture_output=True,
            text=True,
            env={**os.environ, **env} if env else None,
        )
        
        # Log STDOUT and STDERR line by line to respect log formatting
        _log_process_output(process.stdout, logging.info, f"[{component}] STDOUT |")
        _log_process_output(process.stderr, logging.warning, f"[{component}] STDERR |")

        logging.info(f"[{component}] Command completed successfully.")
    except subprocess.CalledProcessError as e:
        error_message = f"Command failed with exit code {e.returncode}.\n"
        # Also log the output here for easier debugging on failure
        _log_process_output(e.stdout, logging.error, f"[{component}] FAILED STDOUT |")
        _log_process_output(e.stderr, logging.error, f"[{component}] FAILED STDERR |")
        raise BuildError(error_message, component)
    except FileNotFoundError:
        raise BuildError(f"Command `{command[0]}` not found. Please ensure it is installed and in the system's PATH.", component)


def build_capturekit_windows():
    """Builds the 'capturekit' component on Windows."""
    logging.info("--- Building Component: capturekit (Windows) ---")
    script_path = os.path.join(ROOT_DIR, "packages", "capturekit", "PKGBUILD.ps1")
    command = ["pwsh", "-File", script_path]
    _execute_command(command, os.path.dirname(script_path), "capturekit")


def build_capturekit_unix(platform_name: str):
    """Builds the 'capturekit' component on Linux or macOS."""
    logging.info(f"--- Building Component: capturekit ({platform_name}) ---")
    script_path = os.path.join(ROOT_DIR, "packages", "capturekit", "PKGBUILD")
    command = ["bash", script_path]
    _execute_command(command, os.path.dirname(script_path), "capturekit")

def build_orchestrator():
    """Builds the 'orchestrator' component using Cargo."""
    logging.info("--- Building Component: orchestrator (Rust) ---")
    project_path = os.path.join(ROOT_DIR, "packages", "orchestrator")
    command = ["cargo", "build", "--release"]
    _execute_command(command, project_path, "orchestrator")

def build_spatialshot_windows():
    """Builds the 'spatialshot' Node.js component on Windows."""
    logging.info("--- Building Component: spatialshot (Node.js/Windows) ---")
    project_path = os.path.join(ROOT_DIR, "packages", "spatialshot")
    
    # 1. Install dependencies
    _execute_command(["npm", "install"], project_path, "spatialshot-npm-install")
    
    # 2. Build CSS
    _execute_command(["npm", "run", "build:css"], project_path, "spatialshot-build-css")

    # 3. Build Electron app for Windows
    _execute_command(["npm", "run", "build:win"], project_path, "spatialshot-build-win")

def build_spatialshot_unix(platform_name: str):
    """Builds the 'spatialshot' Node.js component on Linux or macOS."""
    logging.info(f"--- Building Component: spatialshot (Node.js/{platform_name}) ---")
    project_path = os.path.join(ROOT_DIR, "packages", "spatialshot")
    
    # 1. Install dependencies
    _execute_command(["npm", "install"], project_path, "spatialshot-npm-install")

    # 2. Build CSS
    _execute_command(["npm", "run", "build:css"], project_path, "spatialshot-build-css")

    # 3. Build Electron app for the target platform
    build_script = f"build:{platform_name.lower()}"
    _execute_command(["npm", "run", build_script], project_path, f"spatialshot-{build_script}")

def run_tests():
    """Runs the pytest test suite."""
    logging.info("--- Running Test Suite ---")
    command = ["pytest"]
    _execute_command(command, ROOT_DIR, "pytest")

def main():
    """
    Main function to orchestrate the entire build and test process.
    """
    start_time = datetime.datetime.now()
    logging.info("==================================================")
    logging.info("  Starting SpatialShot Full Build and Test Cycle  ")
    logging.info("==================================================")

    try:
        system = platform.system()
        if system == "Windows":
            logging.info("Detected Operating System: Windows")
            build_capturekit_windows()
            build_orchestrator()
            build_spatialshot_windows()
        elif system == "Linux":
            logging.info("Detected Operating System: Linux")
            build_capturekit_unix("Linux")
            build_orchestrator()
            build_spatialshot_unix("Linux")
        elif system == "Darwin":
            logging.info("Detected Operating System: macOS")
            build_capturekit_unix("macOS")
            build_orchestrator()
            build_spatialshot_unix("macOS")
        else:
            raise BuildError(f"Unsupported operating system: {system}", "setup")

        run_tests()

    except BuildError as e:
        logging.error("A critical error occurred during the build process.")
        logging.error(str(e))
        sys.exit(1)
    except Exception as e:
        logging.error("An unexpected error occurred.", exc_info=True)
        sys.exit(1)
    finally:
        # No import needed here anymore
        end_time = datetime.datetime.now()
        duration = end_time - start_time
        # Fixed: Changed .toSeconds() to .total_seconds()
        logging.info(f"Total execution time: {duration.total_seconds()} seconds.")
        logging.info("==================================================")
        logging.info("  SpatialShot Build and Test Cycle Finished       ")
        logging.info("==================================================")

if __name__ == "__main__":
    # This check prevents the main function from running when the script is imported.
    # In a real-world scenario, this allows for the reuse of functions in other scripts.
    main()
