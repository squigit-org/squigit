"""
                   ◆ SpatialShot Build & Test Orchestrator ◆
                                        
           This script automates the complete build pipeline for all
       SpatialShot components — Engine, Orchestrator, and UI layers.
                                        
       It ensures proper environment setup, handles cross-platform builds
      (Windows, Linux, macOS), and executes the full test suite afterward.
                                        
          Each component is built in isolation with detailed logging,
        allowing partial rebuilds and granular error tracking for CI/CD.
                                        
       NOTE: Requires system dependencies like Cargo, Node.js, and Bash.
            For Windows users, PowerShell (pwsh) must be installed.
                       HACK: View latest GitHub Release ↴
             https://github.com/a7mddra/spatialshot/releases/latest
"""

import logging
import os
import platform
import subprocess
import sys
import shutil
import datetime
import stat
from typing import Dict, List, Optional, Callable

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

LOG_FORMAT = "[%(levelname)s] %(message)s"
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT, stream=sys.stdout)

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

        _log_process_output(process.stdout, logging.info, f"[{component}] STDOUT |")
        _log_process_output(process.stderr, logging.warning, f"[{component}] STDERR |")

        logging.info(f"[{component}] Command completed successfully.")
    except subprocess.CalledProcessError as e:
        error_message = f"Command failed with exit code {e.returncode}.\n"
        _log_process_output(e.stdout, logging.error, f"[{component}] FAILED STDOUT |")
        _log_process_output(e.stderr, logging.error, f"[{component}] FAILED STDERR |")
        raise BuildError(error_message, component)
    except FileNotFoundError:
        raise BuildError(f"Command `{command[0]}` not found. Please ensure it is installed and in the system's PATH.", component)


def set_script_permissions(system: str):
    """
    Sets executable permissions for .sh files on Unix
    and unblocks .ps1 files on Windows.

    Raises:
        BuildError: If the permission command fails (e.g., pwsh not found).
    """
    if system == "Windows":
        logging.info("--- Setting Up Permissions: Unblocking PowerShell Scripts ---")
        command = ["pwsh", "-Command", f"Get-ChildItem -Recurse -Path '{ROOT_DIR}' -Filter *.ps1 | Unblock-File"]
        try:
            _execute_command(command, ROOT_DIR, "unblock-ps1")
            logging.info("Successfully unblocked PowerShell scripts.")
        except BuildError as e:
            logging.warning(f"Could not unblock PowerShell scripts: {e}")
            logging.warning("This may cause 'engine' build to fail on Windows.")
            raise

    elif system in ("Linux", "Darwin"):
        logging.info("--- Setting Up Permissions: Setting Executable bit on .sh Files ---")
        
        scripts_to_make_executable = []
        for root, dirs, files in os.walk(ROOT_DIR):
            for file in files:
                if file.endswith(".sh"):
                    scripts_to_make_executable.append(os.path.join(root, file))

        known_scripts = [
            os.path.join(ROOT_DIR, "packages", "engine", "PKGBUILD")
        ]
        for script_path in known_scripts:
            if os.path.exists(script_path):
                scripts_to_make_executable.append(script_path)
            else:
                logging.debug(f"Known script not found, skipping chmod: {script_path}")

        file_count = 0
        for file_path in set(scripts_to_make_executable):
            try:
                st = os.stat(file_path)
                mode = st.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH
                os.chmod(file_path, mode)
                file_count += 1
            except OSError as e:
                logging.warning(f"Failed to set executable bit on {file_path}: {e}")
        
        if file_count > 0:
            logging.info(f"Set executable permissions for {file_count} script files.")
        else:
            logging.info("No script files found or processed for executable permissions.")
    
    else:
        logging.info(f"Skipping script permission setup for unrecognized system: {system}")


def build_engine_windows():
    """Builds the 'engine' component on Windows."""
    logging.info("--- Building Component: engine (Windows) ---")
    script_path = os.path.join(ROOT_DIR, "packages", "engine", "PKGBUILD.ps1")
    command = ["pwsh", "-File", script_path]
    _execute_command(command, os.path.dirname(script_path), "engine")


def build_engine_unix(platform_name: str):
    """Builds the 'engine' component on Linux or macOS."""
    logging.info(f"--- Building Component: engine ({platform_name}) ---")
    script_path = os.path.join(ROOT_DIR, "packages", "engine", "PKGBUILD")
    command = ["bash", script_path]
    _execute_command(command, os.path.dirname(script_path), "engine")

def build_orchestrator():
    """Builds the 'orchestrator' component using Cargo."""
    logging.info("--- Building Component: orchestrator (Rust) ---")
    project_path = os.path.join(ROOT_DIR, "packages", "orchestrator")
    command = ["cargo", "build", "--release"]
    _execute_command(command, project_path, "orchestrator")

def build_spatialshot(system: str):
    """Builds the 'spatialshot' Node.js component."""
    logging.info(f"--- Building Component: spatialshot (Node.js/{system}) ---")
    core_path = os.path.join(ROOT_DIR, "packages", "core")
    project_path = os.path.join(ROOT_DIR, "packages", "spatialshot")
    view_path = os.path.join(project_path, "source", "renderer", "view")

    _execute_command(["npm", "install"], core_path, "core-npm-install")
    _execute_command(["npm", "install"], project_path, "spatialshot-npm-install")

    _execute_command(["npm", "run", "build"], core_path, "core-build")

    logging.info(f"[{'spatialshot'}] Removing old view directory: {view_path}")
    shutil.rmtree(view_path, ignore_errors=True)
    
    logging.info(f"[{'spatialshot'}] Copying core dist to view directory: {view_path}")
    shutil.copytree(os.path.join(core_path, "dist"), view_path)

    gitignore_path = os.path.join(view_path, ".gitignore")
    gitignore_content = """# Automatically generated by SpatialShot
# Attention: this directory is the output dist of the core package 
* 
!.gitignore 
"""
    logging.info(f"[{'spatialshot'}] Creating .gitignore in view directory: {gitignore_path}")
    with open(gitignore_path, "w") as f:
        f.write(gitignore_content)

    platform_name = system.lower()
    if platform_name == "darwin":
        platform_name = "mac"

    build_script = f"build:{platform_name}"
    _execute_command(["npm", "run", build_script], project_path, f"spatialshot-{build_script}")

def run_tests():
    """Runs the pytest test suite."""
    logging.info("--- Running Test Suite ---")
    command = ["pytest"]
    _execute_command(command, ROOT_DIR, "pytest")

def main():
    """
    Main function to orchestrate the entire build and test process.
    Build steps will attempt to continue even if a prior step fails.
    """
    start_time = datetime.datetime.now()
    logging.info("==================================================")
    logging.info("  Starting SpatialShot Full Build and Test Cycle  ")
    logging.info("==================================================")

    build_failed_components = []
    build_succeeded_components = []
    skipped_components = {}
    system = platform.system()
    logging.info(f"Detected Operating System: {system}")

    try:
        logging.info(">>> STEP 0: Setting Script Permissions <<<")
        try:
            set_script_permissions(system)
        except BuildError as e:
            logging.error(f"[{e.component}] Permission setup FAILED.")
            logging.error(str(e))
            build_failed_components.append(e.component)

        logging.info(">>> STEP 1: Building Engine <<<")
        try:
            if system == "Windows":
                build_engine_windows()
            elif system == "Linux":
                build_engine_unix("Linux")
            elif system == "Darwin":
                build_engine_unix("macOS")
            else:
                raise BuildError(f"Unsupported operating system: {system}", "setup")
            build_succeeded_components.append("engine")
        except BuildError as e:
            logging.error(f"[{e.component}] Build FAILED.")
            logging.error(str(e))
            build_failed_components.append(e.component)

        logging.info(">>> STEP 2: Building Orchestrator <<<")
        try:
            build_orchestrator()
            build_succeeded_components.append("orchestrator")
        except BuildError as e:
            logging.error(f"[{e.component}] Build FAILED. (e.g., Rust/cargo not installed?)")
            logging.error(str(e))
            build_failed_components.append(e.component)

        logging.info(">>> STEP 3: Building SpatialShot <<<")
        try:
            build_spatialshot(system)
            build_succeeded_components.append("spatialshot")
        except BuildError as e:
            logging.error(f"[{e.component}] Build FAILED. (e.g., Node.js/npm not installed?)")
            logging.error(str(e))
            build_failed_components.append(e.component)

        logging.info(">>> STEP 4: Running Tests <<<")
        if not build_failed_components:
            try:
                run_tests()
                build_succeeded_components.append("tests")
            except BuildError as e:
                logging.error(f"[{e.component}] Tests FAILED.")
                logging.error(str(e))
                build_failed_components.append(e.component)
        else:
            reason = f"build failures in: {', '.join(sorted(list(set(build_failed_components))))}"
            logging.warning("Skipping test suite due to " + reason)
            skipped_components['tests'] = reason

    except Exception as e:
        logging.error("An unexpected error occurred outside of a build step.", exc_info=True)
        sys.exit(2)
    finally:
        end_time = datetime.datetime.now()
        duration = end_time - start_time
        logging.info(f"Total execution time: {duration.total_seconds():.2f} seconds.")

        logging.info("--- Build & Test Summary ---")
        if build_succeeded_components:
            logging.info(f"Success: {', '.join(build_succeeded_components)}")
        
        failed_unique = sorted(list(set(build_failed_components)))
        if failed_unique:
            logging.warning(f"Failed: {', '.join(failed_unique)}")

        if skipped_components:
            skipped_list = [f"{name} (reason: {reason})" for name, reason in skipped_components.items()]
            logging.info(f"Skipped: {', '.join(skipped_list)}")
        logging.info("--------------------------")

        logging.info("==================================================")

        if build_failed_components:
            logging.warning("  Build and Test Cycle Finished with FAILURES  ")
            logging.warning(f"Failed components: {', '.join(failed_unique)}")
            logging.info("==================================================")
            sys.exit(1)
        else:
            logging.info("  SpatialShot Build and Test Cycle Finished Successfully  ")
            logging.info("==================================================")

if __name__ == "__main__":
    main()
