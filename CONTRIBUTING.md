# Contributing to SpatialShot

First off, thank you for considering contributing to SpatialShot. We are excited to have you. Every contribution, from a small typo fix to a major new feature, is valuable and appreciated.

This document provides a set of guidelines for contributing to SpatialShot. These are mostly guidelines, not strict rules. Use your best judgment, and feel free to propose changes to this document in a pull request.

## Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior.

## How Can I Contribute?

There are many ways to contribute, including reporting bugs, suggesting enhancements, improving documentation, or writing code.

* **Reporting Bugs:** If you find a bug, please open an issue and provide a detailed description, including your operating system, steps to reproduce, and any relevant logs.
* **Suggesting Enhancements:** If you have an idea for a new feature or an improvement to an existing one, open an issue to start a discussion.
* **Writing Code:** If you're ready to write some code, you can start by looking through issues labeled `good first issue` or `help wanted`.

## Getting Started: Your Development Environment

SpatialShot has a modular architecture, allowing developers to work on specific parts of the application without needing a complex, full-system build environment. We offer two main paths for setting up your development environment.

### Path 1: The Quickstart (UI, Orchestration, and General Development)

This is the recommended path for most contributors, especially those working on the Electron UI (`spatialshot`), the Python launcher (`QUICKRUN`), or general scripting. This path **does not require you to compile C++, Qt, or Rust code**.

1.  **Fork & Clone:** Fork the repository on GitHub and clone your fork locally:

    ```bash
    git clone https://github.com/YOUR-USERNAME/spatialshot.git
    cd spatialshot
    ```

2.  **Install Dependencies:** Ensure you have `python3` and `npm` installed on your system.

3.  **Download Binaries:** Go to the [**latest GitHub Release**](https://github.com/a7mddra/spatialshot/releases/latest). Download the pre-compiled binary archives for your operating system (e.g., `squiggle-linux.tar.gz`, `ycaptool-linux.tar.gz`).

4.  **Place Binaries:** Extract the archives and place the executable files in their correct locations within the project structure:

      * Place the `squiggle` executable in: `packages/squiggle/dist/`
      * Place the `ycaptool` executables in: `packages/ycaptool/dist/` (if using Linux)

5.  **Run the Launcher:** Now that the binaries are in place, you can run the development launcher to test the full application flow.

    ```bash
    python3 QUICKRUN/launcher.py
    ```

### Path 2: The Core Contributor Setup (Low-Level Development)

This path is for contributors working on the low-level packages themselves, such as `squiggle` (C++/Qt) or `ycaptool` (Python/C++/Gtk). This requires a full build environment.

1.  **Fork & Clone:** Clone your fork of the repository.
2.  **Install Build Dependencies:** You will need the specific toolchains for the package you are working on. This may include:
    * A C++ compiler (g++, clang, or MSVC)
    * A static build of the Qt6 framework
    * Python 3 and `pip`
    * Node.js and `npm`
    * The Rust toolchain (`cargo`)
3.  **Run the Build Orchestrator:** The `setup.py` script is the main build tool that compiles all the necessary binaries from source.
    ```bash
    python3 setup.py
    ```
    Once the build is complete, you can run `QUICKRUN/launcher.py` to test the full application using your locally compiled binaries.

## Project Architecture

SpatialShot is composed of several independent packages orchestrated to work together:

* `packages/orchestrator`: The final, production-ready **Rust** binary that manages the entire application flow in a lightweight, high-performance manner.
* `packages/squiggle`: The **C++/Qt** application responsible for the "freeze" overlay and drawing interface. It is optimized for speed to provide an instant, native feel.
* `packages/ycaptool`: A specialized **C++/Qt6** utility for handling screen capture on Linux (Wayland), which has strict security protocols.
* `packages/spatialshot` (formerly `panel`): The main user interface, an **Electron/Node.js** application that displays the results from the Gemini and Lens APIs.
* `platform`: Contains platform-specific shell scripts (`.sh`, `.ps1`) for native OS interactions like screen capture on Windows, macOS, and X11.
* `QUICKRUN`: The **Python** development launcher used for integration testing and providing a simple entry point for contributors.
* `packaging` & `setup.py`: Scripts and configuration for building and packaging all the components.

## Submitting Contributions

Please follow the standard GitHub pull request workflow.

1.  **Create a Branch:** Create a new branch from `main` for your feature or bugfix.
    ```bash
    git checkout -b feature/your-awesome-feature
    ```
2.  **Make Your Changes:** Write your code and ensure it follows the existing style of the project.
3.  **Test Your Changes:** Run the `QUICKRUN/launcher.py` to ensure that your changes have not broken the end-to-end workflow. If you are adding new logic, consider adding relevant automated tests in the `tests/` directory.
4.  **Commit Your Changes:** Use a clear and descriptive commit message.
5.  **Push and Open a Pull Request:** Push your branch to your fork and open a pull request against the `main` branch of the official SpatialShot repository.
6.  **Provide Context:** In your pull request description, explain the "what" and "why" of your changes. If it resolves an existing issue, be sure to link it (e.g., "Closes #123").

Your pull request will be reviewed by a maintainer, who may suggest some changes or improvements. We appreciate your patience and collaboration during the review process.

Thank you again for your interest in making SpatialShot better!
