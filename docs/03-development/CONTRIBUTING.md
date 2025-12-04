# Contributing to Spatialshot

Thank you for your interest in contributing to Spatialshot! This document provides a complete guide to contributing, from setting up your development environment to submitting a pull request.

We welcome all contributions, from reporting bugs and improving documentation to adding new features. Every contributor is valued.

## Our Pledge & Your First Steps

All contributors are expected to adhere to our [Code of Conduct](../06-policies/CODE_OF_CONDUCT.md). Please read it before participating.

Before you start working on a significant change, we encourage you to:
1.**Check the [Issue Tracker](https://github.com/a7mddra/spatialshot/issues)** to see if your idea is already being discussed or if there are `good first issue` labels.
2. **Open an Issue** to propose a new feature or discuss a bug fix. This allows the maintainers and community to provide feedback before you invest significant time.

## The Spatialshot Development Philosophy: Engineered Isolation

Spatialshot is a polyglot monorepo built with **7+ programming languages and 5+ frameworks**. This presents a sophisticated debugging challenge but is engineered to create an optimal path for contributors through **strict separation of concerns**.

A React developer can enhance the user interface without understanding low-level system APIs for screen capture. A systems programmer can optimize the capture engine without delving into React state management. This guide will help you navigate directly to the component you wish to improve.

## Setting Up Your Development Environment

### Prerequisites

Ensure you have these foundational tools installed:

* **Git** for version control.
* **Python 3.8+** for build orchestration.
* **Node.js 18+** and npm for frontend development.
* **(Optional) Rust toolchain** (`rustup`) for Orchestrator work.
* **(Optional) C++ compiler & Qt6 libraries** for CaptureKit development.

### Choose Your Development Path

We offer two primary paths to match your contribution focus.

#### 🛠️ Path 1: Full Source Build (For Core Contributors & Build Modifications)

Use this path if you are modifying the build system, working across multiple components, or need to compile everything from source.

Run the unified build orchestrator from the repository root:

```bash
python3 setup.py
```

This script performs a complete, deterministic build:

1. Sanitizes environment (permissions, PowerShell policies).
2. Compiles **CaptureKit** (C++/Qt6) and **Orchestrator** (Rust).
3. Bundles the **Core** React frontend with Vite.
4. Injects frontend assets into the Electron container.
5. Runs the integration test suite.

> **Refer to [Build Architecture](../02-architecture/BUILD.md) for in-depth details and troubleshooting.**

#### ⚡ Path 2: Prebuilt Binary Development (For Specialized Contributors)

Use this path to focus on a single component (e.g., only the React UI or the Electron logic) without the overhead of compiling the entire stack.

1. **Download Binaries**: Get the latest prebuilt artifacts from the [GitHub Releases](https://github.com/a7mddra/spatialshot/releases/latest) page:
    * `capturekit-{os}-x64.zip`
    * `orchestrator-{os}-x64.zip`
    * `spatialshot-{os}-x64.zip`
2. **Extract to Project Structure**:
    * Place CaptureKit binaries in `packages/capturekit/dist/`
    * Place the Orchestrator binary in `packages/orchestrator/target/release/`
    * Place Spatialshot binaries in `packages/spatialshot/dist/`
3. **Develop in Isolation**: You can now run the app and modify your chosen component, using the stable prebuilt binaries for all other parts.

## Component-Specific Workflow Guide

### 🎨 Frontend (React/TypeScript) - `packages/core/`

**Typical Contributor**: UI/UX designer, web developer.

```bash
cd packages/core
npm install
npm run dev # Dev server at http://localhost:5173
```

* **Workflow**: Standard React 19 + Vite with HMR. Develop the UI as a pure web app.
* **Integration**: Run `npm run build` to compile assets. The main `setup.py` or Electron app will inject these into the renderer.

### 📦 Electron Application - `packages/spatialshot/`

**Typical Contributor**: JavaScript/Node.js developer, desktop app integrator.

```bash
cd packages/spatialshot
npm install
npm start
```

* **Key Directories**:
  * `source/main.js`: Main process entry point.
  * `source/ipc-handlers/`: Modular IPC channels.
  * `source/renderer/`: Shell window management.
* **Debugging**: Use `--inspect` flag for main process debugging. Renderer DevTools are available (`Ctrl+Shift+I`).

### ⚙️ Orchestrator (Rust) - `packages/orchestrator/`

**Typical Contributor**: Systems programmer, middleware developer.

```bash
cd packages/orchestrator
cargo build
cargo run
```

* **Architecture**: Manages the application lifecycle via a file-system state machine. Platform-specific logic is in `src/platform/`.
* **Debugging**: Use `RUST_LOG=debug` environment variable for detailed logs.

### 🖥️ CaptureKit (C++/Qt6) - `packages/capturekit/`

**Typical Contributor**: C++ developer, graphics/systems engineer.

```bash
cd packages/capturekit
mkdir build && cd build
cmake -GNinja ..
ninja
# Test a component directly
./dist/scgrabber
./dist/drawview /path/to/test.png
```

* **Platform Notes**: Requires Qt6 development libraries. Linux needs XCB libs. The build uses custom `PKGBUILD` scripts for deployment.

## Making & Submitting Your Changes

### 1. Create a Topic Branch

Always branch from the `main` branch.

```bash
git checkout -b type/descriptive-name
```

Use prefixes like `feat/`, `fix/`, `docs/`, or `refactor/`.

### 2. Develop and Test Your Changes

* **Follow Architecture**: Respect component boundaries. Use existing IPC channels and the file-system state machine for inter-component communication.
* **Test Thoroughly**:
  * Test your component in isolation using the guides above.
  * If possible, run the full test suite with `pytest` to ensure no regressions.
  * Test on the target operating system if your change is platform-specific.

### 3. Commit Your Changes

Write clear, concise commit messages in the imperative mood.

```plaintext
feat(ui): add high-contrast theme toggle
^    ^   ^
|    |   |__ Summary in present tense
|    |______ Scope (component affected)
|___________ Type: feat, fix, docs, style, refactor, test, chore
```

### 4. Submit a Pull Request (PR)

1. Push your branch to your fork: `git push origin your-branch-name`.
2. Open a PR against the `a7mddra/spatialshot` `main` branch.
3. **Fill out the PR template completely**:

* Describe the change and its motivation.
* Link to any related issues.
* Detail the testing you performed.
* Note any breaking changes or required documentation updates.

### PR Review Process

A maintainer will review your PR. They may suggest changes. This collaborative process ensures code quality and alignment with project goals. Please be responsive to feedback.

## Getting Help

* **Documentation**: The [`/docs`](../README.md) directory is the source of truth for architecture and guides.
* **Issues**: Search and discuss in the [GitHub Issues](https://github.com/a7mddra/spatialshot/issues).
* **Discussions**: Use GitHub Discussions for broader questions or design ideas.

Thank you for helping to build Spatialshot. Your contributions are what make this project possible.
