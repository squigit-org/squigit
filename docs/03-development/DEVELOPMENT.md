# Development Guide for SpatialShot

The fragility of having a monorepo with 7+ programming languages and 5+ frameworks makes it a sophisticated challenge for debugging but creates an optimal path for contributors. In this project, we have meticulously engineered the separation of concerns such that a React web developer doesn't need to understand how we hijack low-level system APIs to capture screens, freeze the desktop, or enable drawing capabilities. A web developer can contribute to the React section and improve our user interface without touching Rust or C++ code. Similarly, a systems programmer can optimize the capture engine without understanding React state management or Electron IPC protocols.

This document provides comprehensive guidance for contributors at all technical levels, from user interface designers to systems engineers.

## Development Environment Setup

### Prerequisites

The SpatialShot ecosystem requires the following foundational tools:

- **Git**: Version control system
- **Python 3.8+**: Build orchestration and scripting
- **Node.js 18+**: Frontend development and Electron packaging
- **Rust toolchain**: Orchestrator development (install via `rustup`)
- **C++ compiler**: CaptureKit development (platform-specific)
- **Qt6 development libraries**: Required for CaptureKit compilation

Platform-specific requirements are detailed in the respective build documentation.

## Quickstart Development Paths

### Path 1: Full Source Build (Recommended for Core Contributors)

For contributors working across multiple layers or modifying the build infrastructure, the comprehensive build orchestrator provides deterministic builds across all platforms.

Execute the following command from the repository root:

```bash
python3 setup.py
```

The build orchestrator performs the following sequential operations:

1. **Environment Sanitization**: Corrects execution permissions on Unix systems and unblocks PowerShell scripts on Windows
2. **Native Compilation**: Builds CaptureKit (C++/Qt6) and Orchestrator (Rust) using platform-specific toolchains
3. **Frontend Bundling**: Compiles the React Core application via Vite
4. **Artifact Injection**: Transfers compiled Core distribution assets to the Electron renderer directory
5. **Integration Testing**: Executes the pytest suite to validate component interoperability

Refer to `docs/BUILD.md` for detailed architecture and troubleshooting guidance.

### Path 2: Prebuilt Binary Development (Recommended for Specialized Contributors)

For contributors focusing on specific components without requiring full compilation capabilities.

1. **Download Prebuilt Binaries**:
   - Navigate to the [latest GitHub Release](https://github.com/a7mddra/spatialshot/releases/latest)
   - Download the platform-specific archives for:
     - `capturekit-{os}-x64.zip`
     - `orchestrator-{os}-x64.zip`
     - `spatialshot-{os}-x64.zip`

2. **Extract to Appropriate Locations**:
   - Place CaptureKit binaries in `packages/capturekit/dist/`
   - Place Orchestrator binary in `packages/orchestrator/target/release/`
   - Place SpatialShot binaries in `packages/spatialshot/dist/`

3. **Develop Specialized Components**:
   - **React Developers**: Work in `packages/core/` using standard React development workflows
   - **Electron Developers**: Work in `packages/spatialshot/source/` with hot-reload capabilities
   - **Systems Developers**: Work in `packages/orchestrator/src/` or `packages/capturekit/src/` with component-specific toolchains

4. **Integration Testing**:
   - Use the prebuilt binaries for the components you are not modifying
   - Test your modified components against the stable binaries

## Component-Specific Development Workflows

### Frontend Development (React/TypeScript)

**Location**: `packages/core/`

The Core package is a standard React 19 application with Vite tooling.

```bash
cd packages/core
npm install
npm run dev
```

Development features:
- Hot module replacement enabled
- TypeScript strict mode
- Tailwind CSS with JIT compilation
- Component library in `packages/core/components/`

The development server runs on `http://localhost:5173`. To test within the Electron container after making changes, rebuild the Core package:

```bash
npm run build
```

The build artifacts will be automatically injected into the Electron application on the next launch.

### Electron Application Development

**Location**: `packages/spatialshot/`

The Electron application serves as the container for the React frontend.

```bash
cd packages/spatialshot
npm install
npm start
```

Development features:
- Main process debugging with `--inspect` flag
- Renderer process DevTools accessible via `Ctrl+Shift+I`
- IPC handler hot-reload not supported; restart required for main process changes

Key development directories:
- `source/main.js`: Electron main process entry point
- `source/ipc-handlers/`: Modular IPC communication handlers
- `source/renderer/`: Shell interface and view management

### Orchestrator Development (Rust)

**Location**: `packages/orchestrator/`

The Orchestrator is a Rust binary managing system-level coordination.

```bash
cd packages/orchestrator
cargo build
cargo run
```

Development features:
- Standard Rust toolchain with cargo
- Platform-specific modules in `src/platform/`
- Integration tests in `tests/integration/`

Debugging considerations:
- The binary runs without a console window by default (Windows subsystem setting)
- Use `RUST_LOG=debug` environment variable for verbose logging
- Platform-specific debugging may require attaching to spawned child processes

### CaptureKit Development (C++/Qt6)

**Location**: `packages/capturekit/`

The CaptureKit consists of two C++ binaries for screen capture and overlay rendering.

**Development Environment Setup**:
```bash
cd packages/capturekit
mkdir build && cd build
cmake -GNinja ..
ninja
```

Platform-specific considerations:
- **Linux**: Requires XCB development libraries and Qt6 modules
- **Windows**: Requires MSVC compiler and Qt6 installation (or use aqtinstall)
- **macOS**: Requires Xcode command line tools and Qt6 via Homebrew

Testing individual components:
```bash
# Test screen grabber
./dist/scgrabber

# Test draw view with test image
./dist/drawview /path/to/test.png
```

## Debugging Strategies

### Component Isolation

Each component can be developed and tested independently:

1. **CaptureKit**: Test with static images without Orchestrator coordination
2. **Orchestrator**: Test with mock file system events without actual capture
3. **Core**: Test as standard web application without Electron container
4. **SpatialShot**: Test with prebuilt binaries for other components

### Integration Testing

The repository includes a comprehensive test suite:

```bash
# Run all tests
pytest

# Run specific test categories
pytest tests/unit/
pytest tests/integration/
```

### Logging and Diagnostics

- **Electron**: Use `electron-log` for main/renderer process logging
- **Orchestrator**: Use Rust's `env_logger` with `RUST_LOG` environment variable
- **CaptureKit**: Use Qt's `qDebug()` with `QT_LOGGING_RULES` environment variable
- **Cross-component**: Check `~/.local/share/spatialshot/logs/` (platform-dependent)

## Contribution Workflow

### Code of Conduct

This project adheres to the Contributor Covenant Code of Conduct. All participants are expected to maintain a respectful and inclusive environment. Please review the complete Code of Conduct in `CODE_OF_CONDUCT.md` before contributing.

### Contribution Process

1. **Fork and Clone**: Create a personal fork of the repository and clone it locally
2. **Create Branch**: Use descriptive branch names (`feature/`, `fix/`, `docs/` prefixes)
3. **Develop Changes**: Follow the component-specific development workflows above
4. **Test Thoroughly**:
   - Verify changes work with both build paths (source and prebuilt)
   - Test on target platform if making system-specific modifications
   - Run existing test suite and add tests for new functionality
5. **Submit Pull Request**:
   - Reference related issues or discussion
   - Provide clear description of changes and testing performed
   - Ensure code follows existing style and architecture patterns

### Architecture Compliance

When contributing, maintain the established architectural boundaries:

1. **IPC Communication**: Use existing IPC channels; do not create direct dependencies between components
2. **File System State**: Follow the file-based state machine pattern for inter-component communication
3. **Platform Abstraction**: Keep platform-specific code isolated in designated modules
4. **Dependency Management**: Do not add dependencies without considering cross-platform compatibility

## Project Roadmap and Tasks

Refer to `TODO.md` for current development priorities and feature backlog. The TODO document is maintained as a living roadmap with categorized tasks including:

- High-priority bug fixes and stability improvements
- Feature enhancements and user experience refinements
- Performance optimizations and resource utilization
- Documentation improvements and example expansions
- Testing coverage expansion and quality assurance

Contributors are encouraged to review the TODO document to identify areas where their expertise can provide the most value to the project.

## Getting Help

- **Documentation**: Comprehensive architecture documents in `docs/` directory
- **Issue Tracker**: Search existing issues before reporting new problems
- **Discussion**: Use GitHub Discussions for design questions and architectural decisions
- **Maintainers**: Contact project maintainers for critical issues or security concerns

The separation of concerns in SpatialShot enables contributors to engage at their comfort level, from superficial UI improvements to deep systems programming. Each component maintains clear interfaces and contracts, allowing focused development without requiring expertise across the entire technology stack.
