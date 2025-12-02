# Continuous Integration & Deployment Architecture

## 1\. Design Philosophy

The SpatialShot CI/CD pipeline is architected around a **Component-Based Matrix Strategy**. Unlike monolithic pipelines that build an entire application in a single pass, this system treats the application's three layers (CaptureKit, Orchestrator, SpatialShot) as independent build artifacts.

This modularity allows for:

1. **Parallel Execution:** All components across all operating systems are built simultaneously, significantly reducing total pipeline runtime.
2. **Environment Isolation:** Each component is built within a context strictly defined by its specific toolchain requirements (Rust/Cargo, CMake/Qt, Node.js).
3. **Composite Reusability:** The build logic is encapsulated in local **Composite Actions**, abstracting complex setup steps from the main workflow files.

The pipeline is divided into two distinct workflows:

* **`distribute.yml`**: Triggered on version tags (`v*`). Builds and releases the core application binaries.
* **`installers.yml`**: Triggered manually. Builds the "Bootstrap Installers" that ingest the binaries produced by the distribution workflow.

-----

## 2\. Reusable Composite Actions

The build logic is decoupled from the workflow configuration and resides in `.github/actions/`.

### 2.1 Action: `build-capturekit`

**Context:** C++ / Qt6
**Path:** `.github/actions/build-capturekit/action.yml`

This action handles the complexity of cross-platform C++ compilation and dependency resolution.

* **Linux Dynamic Resolution:** It parses the `packages/capturekit/PKGBUILD` bash script using `awk` to extract specific XCB library names (`XCB_LIB_BASENAMES`) and installs them via `apt-file` and `apt-get`. This ensures the CI environment matches the runtime requirements defined in the source.
* **Windows Environment:** Automates the installation of `CMake` and `Ninja` via `winget` and initializes the MSVC Developer Command Prompt.
* **Output:** Generates a platform-specific ZIP archive (e.g., `capturekit-linux-x64.zip`) containing the compiled binaries and local library bundles.

### 2.2 Action: `build-orchestrator`

**Context:** Rust
**Path:** `.github/actions/build-orchestrator/action.yml`

* **Linux Static Linking:** Explicitly installs `musl-tools` and targets `x86_64-unknown-linux-musl`. This produces a statically linked binary, ensuring the middleware runs on any Linux distribution without glibc version conflicts.
* **Standard Compilation:** Uses `cargo build --release` for Windows and macOS.
* **Output:** A ZIP archive containing the single executable `spatialshot-orchestrator`.

### 2.3 Action: `build-spatialshot`

**Context:** Node.js / Electron / Vite
**Path:** `.github/actions/build-spatialshot/action.yml`

This action acts as the assembly line for the final application container.

1. **Frontend Compilation:** Builds the React Core package (`packages/core`).
2. **Asset Transplantation:** Copies the compiled Core assets (`dist/`) into the Electron View directory (`packages/spatialshot/source/renderer/view`).
3. **Secrets Injection:** Injects the `GOOGLE_CREDENTIALS_JSON` secret into `source/auth/credentials.json` at build time.
4. **Metadata Patching:** Updates `package.json` repository URLs to match the current git context.
5. **Electron Packaging:** Executes the platform-specific build script (e.g., `npm run build:win`), which invokes `electron-builder`.

-----

## 3\. Workflow: Distribution Pipeline

**File:** `.github/workflows/distribute.yml`
**Trigger:** Git Tag push (`v*`)

This workflow implements a **Fan-Out / Fan-In** pattern. It fans out to 9 parallel jobs (3 components × 3 OSs) and fans in to a single release step.

### Artifact Aggregation

The `publish-binaries` job waits for all build matrix jobs to complete. It downloads all produced artifacts and uploads them to the GitHub Release associated with the triggering tag. This results in a release containing:

* `capturekit-{os}-x64.zip` (x3)
* `orchestrator-{os}-x64.zip` (x3)
* `spatialshot-{os}-x64.zip` (x3)

-----

## 4\. Workflow: Installer Bootstrap

**File:** `.github/workflows/installers.yml`
**Trigger:** Manual (`workflow_dispatch`)
**Target Release:** Tag named `installers`

This workflow builds the "Thin Client" installers. These binaries do not change with every version of the application. Instead, they are permanently pointed at the `latest` endpoint of the repository.

### Build Logic

* **Windows:** Installs `NSIS` via Chocolatey and compiles `installer.nsi`.
* **Linux:** Sets up Go 1.21 and builds the static Go binary.
* **macOS:** Executes the manual `PKGBUILD` script which downloads `Platypus` and generates the `.dmg`.

### Permanent Release Strategy

This workflow overwrites the assets of a specific tag named `installers`. This provides a stable permalink for download buttons (e.g., on a website or README), while the installers themselves dynamically fetch the bleeding-edge version of the app from the `distribute.yml` output.
