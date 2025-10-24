
import logging
import os
import subprocess
import sys
from typing import List, Tuple

# --- Constants ---
LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"
PACKAGES = ["ycaptool", "squiggle", "spatialshot", "orchestrator"]

# --- Logger Setup ---
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT)
logger = logging.getLogger(__name__)


def stream_command(
    package: str, command: List[str], cwd: str
) -> Tuple[bool, str, str]:
    """
    Executes a command and streams its output to the console in real-time.

    Args:
        package: The name of the package being built.
        command: The command to execute as a list of strings.
        cwd: The directory to execute the command in.

    Returns:
        A tuple containing:
        - A boolean indicating success or failure.
        - The stdout of the command.
        - The stderr of the command.
    """
    logger.info(f"Building {package}...")
    try:
        process = subprocess.Popen(
            command,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        stdout_output = []
        stderr_output = []

        # Stream stdout
        for line in process.stdout:
            print(line, end="")
            stdout_output.append(line)

        # Stream stderr
        for line in process.stderr:
            print(line, end="", file=sys.stderr)
            stderr_output.append(line)

        process.communicate()

        if process.returncode != 0:
            logger.error(f"Failed to build {package}.")
            return False, "".join(stdout_output), "".join(stderr_output)

        logger.info(f"Successfully built {package}.")
        return True, "".join(stdout_output), "".join(stderr_output)

    except FileNotFoundError:
        logger.error(f"Command not found for {package}. Make sure it's installed and in your PATH.")
        return False, "", f"Command not found: {command[0]}"
    except Exception as e:
        logger.error(f"An unexpected error occurred while building {package}: {e}")
        return False, "", str(e)


def build_ycaptool(base_path: str) -> bool:
    """Builds the ycaptool package."""
    path = os.path.join(base_path, "packages", "ycaptool")
    return stream_command("ycaptool", ["./build.sh"], cwd=path)[0]


def build_squiggle(base_path: str) -> bool:
    """Builds the squiggle package."""
    path = os.path.join(base_path, "packages", "squiggle")
    return stream_command("squiggle", ["./build.sh"], cwd=path)[0]


def build_spatialshot(base_path: str) -> bool:
    """Builds the spatialshot package."""
    path = os.path.join(base_path, "packages", "spatialshot")
    install_success, _, _ = stream_command(
        "spatialshot (npm install)", ["npm", "install"], cwd=path
    )
    if not install_success:
        return False
    stream_command("spatialshot (npm run build:css)", ["npm", "run", "build:css"], cwd=path)[0]
    return stream_command("spatialshot (npm run build)", ["npm", "run", "build"], cwd=path)[0]


def build_orchestrator(base_path: str) -> bool:
    """Builds the orchestrator package."""
    path = os.path.join(base_path, "packages", "orchestrator")
    return stream_command(
        "orchestrator", ["cargo", "build", "--release"], cwd=path
    )[0]


def main():
    """Main function to build all packages."""
    base_path = os.path.dirname(os.path.abspath(__file__))
    failed_packages = []

    build_functions = {
        "ycaptool": build_ycaptool,
        "squiggle": build_squiggle,
        "spatialshot": build_spatialshot,
        "orchestrator": build_orchestrator,
    }

    for package in PACKAGES:
        if not build_functions[package](base_path):
            failed_packages.append(package)

    if failed_packages:
        logger.error(
            f"The following packages failed to build: {', '.join(failed_packages)}"
        )
        sys.exit(1)
    else:
        logger.info("All packages built successfully!")


if __name__ == "__main__":
    main()
