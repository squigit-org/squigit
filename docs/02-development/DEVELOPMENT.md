# Development

Run repository workflows from the workspace root through `cargo xtask`. The task runner is the supported interface for development, validation, cleanup, version changes, builds, and releases.

```text
cargo xtask dev [--demo] [-- <squigit arguments>]
cargo xtask fmt [--all]
cargo xtask doctor
cargo xtask test [-- <cargo test arguments>]
cargo xtask clean (--target | --paddlex | --all)
cargo xtask build (--cli | --ocr)
cargo xtask bump <target> [<OCR kind>] <VERSION>
cargo xtask release (--ocr | --cli | --facade) [--dry-run] [--yes]
```

`cargo xtask help` prints the command list. Every command also supports `--help`. Invalid arguments exit with status 2. A task or child-process failure exits with status 1. Successful commands exit with status 0.

## Development sessions

Start the terminal application with:

```bash
cargo xtask dev
```

The normal development command builds and runs `squigit-cli` with its embedded Google OAuth application credentials. It fails before compilation when `squigit-cli/secrets/credentials.json` is missing or contains placeholders.

Arguments after `--` are passed to the `squigit` executable unchanged:

```bash
cargo xtask dev -- image.png
cargo xtask dev -- --home "$HOME/.squigit-dev" image.png
SQUIGIT_HOME="$HOME/.squigit-dev" cargo xtask dev
```

Development boundary logs are written under the repository `logs/` directory. An installed CLI does not create these logs unless `SQUIGIT_LOG_DIR` is explicitly set.

### Contributor demo mode

Contributors without the private OAuth application credentials use:

```bash
cp .env.example .env
cargo xtask dev --demo
```

Demo mode reads `GEMINI_API_KEY` and `IMGBB_API_KEY` from the process environment, then from the ignored root `.env`. Both keys are optional. With neither key, the CLI supports guest and OCR workflows. With either key, it activates the process-only `contributor@squigit.app` profile. Authentication and persisted credential-management commands remain unavailable.

Unless `SQUIGIT_HOME`, `SQUIGIT_CONFIG_DIR`, or `--home` selects another location, demo state is stored in the ignored repository directory `squigit-demo/`.

## Formatting

Format files changed in the current Git worktree with:

```bash
cargo xtask fmt
```

The default scope combines staged changes, unstaged changes, and nonignored untracked files. Deleted files are skipped. This keeps routine formatting focused on the work being prepared for a commit.

Format every recognized tracked or nonignored source file in the repository with:

```bash
cargo xtask fmt --all
```

Rust uses rustfmt. Python uses a pinned Ruff environment stored under the Cargo target directory. Markdown, YAML, JSON, JavaScript, TypeScript, CSS, HTML, and GraphQL use the pinned Prettier version invoked through `npx`. Python 3 is required when the selected files include Python; Node.js with `npx` is required when they include a Prettier format. The formatter dependencies download on first use and are reused afterward.

Ignored credentials, demo state, logs, build output, Python environments, downloaded models, and generated distribution payloads are outside both formatting scopes.

## Repository validation

Run the repository doctor before committing:

```bash
cargo xtask doctor
```

Doctor performs these checks in order:

1. Rust source copyright and SPDX headers.
2. Forbidden private-repository and developer-machine path references.
3. Locked Cargo workspace metadata.
4. Publishable package metadata, package exclusions, and internal dependency path/version consistency.
5. OCR source, build entry point, and workflow layout consistency without building PaddlePaddle.
6. `cargo fmt --all -- --check`.
7. `cargo check --locked --workspace` through the credential-free CLI build path.

Doctor does not run tests, build the native OCR executable, modify source files, or contact release services.

## Rust tests

Run all Rust tests and targets with:

```bash
cargo xtask test
```

This runs the equivalent of:

```bash
cargo test --locked --workspace --all-targets
```

The test command uses the credential-free CLI build path. Arguments after `--` are forwarded to Cargo:

```bash
cargo xtask test -- thread_storage
cargo xtask test -- --nocapture
```

Native Python, PaddlePaddle, packaged-executable, and installed-package smoke checks are part of the OCR build and distribution workflows rather than this command.

## Cleaning generated files

Clean Cargo output with:

```bash
cargo xtask clean --target
```

The target directory is discovered through Cargo metadata, so a configured target location is honored.

Clean repository-local PaddleX and OCR build output with:

```bash
cargo xtask clean --paddlex
```

This removes only generated paths owned by the native OCR pipeline:

- `squigit-ocr/native/venv/`
- `squigit-ocr/native/build/`
- `squigit-ocr/native/dist/`
- `squigit-ocr/native/models/`
- Python `__pycache__/` directories and `.pyc` files under `squigit-ocr/native/`
- Staged `binaries/paddle-ocr-*` runtimes.
- OCR transfer and runtime-size output under the Cargo target directory.

Clean both sets with:

```bash
cargo xtask clean --all
```

Clean canonicalizes every deletion target and refuses to remove a path outside the repository. It never removes global Cargo, Python, Paddle, Hugging Face, Homebrew, package-manager, or user model caches. It also preserves `.env`, embedded credentials, `squigit-demo/`, logs, Cargo.lock, source models, requirements, patches, and release metadata.

## Product builds

Build the release CLI for the current platform with:

```bash
cargo xtask build --cli
```

This builds the `squigit-cli` package in release mode. Production OAuth credentials must be present and valid. The command prints the final executable path.

Build the native OCR runtime for the current platform with:

```bash
cargo xtask build --ocr
```

The OCR build creates or refreshes its virtual environment, installs pinned dependencies, applies the ordered Paddle/PaddleX patches, downloads bundled models, runs the Python runtime smoke check, invokes PyInstaller, validates the packaged executable, and stages the distributable runtime under `binaries/paddle-ocr-<target>/`.

Set `SQUIGIT_OCR_RECREATE_VENV=1` to discard the existing native environment before building. Set `SQUIGIT_OCR_MEASURE_SIZE=1` to write a runtime-size report under `target/ocr-size/`.

`build --ocr` is a local platform build. The four-platform distribution payloads are produced by `.github/workflows/ocr-build-matrix.yml`.

## Versioning

Versions are selected manually. Xtask validates and applies a requested version; it never decides whether a change is major, minor, or patch.

Only stable numeric semantic versions are accepted:

```text
MAJOR.MINOR.PATCH
```

The requested version must be greater than the target's current local version. While a package is below `1.0.0`, a compatible fix increments the patch component and a breaking public contract increments the minor component. Persisted data compatibility is part of that public contract.

The Rust packages have independent versions:

| Command target   | Package                                             |
| ---------------- | --------------------------------------------------- |
| `--storage`      | `squigit-storage`                                   |
| `--auth`         | `squigit-auth`                                      |
| `--harness`      | `squigit-harness`                                   |
| `--brain`        | `squigit-brain`                                     |
| `--squigit`      | `squigit-rs`, whose library crate name is `squigit` |
| `--cli`          | `squigit-cli`                                       |
| `--ocr --crate`  | The Rust `squigit-ocr` package.                     |
| `--ocr --engine` | The native OCR product.                             |

Examples:

```bash
cargo xtask bump --storage 0.1.1
cargo xtask bump --auth 0.2.0
cargo xtask bump --squigit 0.1.2
cargo xtask bump --cli 0.2.0
cargo xtask bump --ocr --crate 0.1.1
cargo xtask bump --ocr --engine 0.1.2
```

When `--ocr` is used without `--crate` or `--engine` in an interactive terminal, xtask asks which version to change:

```bash
cargo xtask bump --ocr 0.1.2
```

Noninteractive use must specify the OCR kind explicitly.

A Rust package bump updates its package manifest and Cargo.lock. Internal dependencies retain both a local `path` and a registry `version`; local workspace builds use the path and packaged crates resolve the version from crates.io.

Bumping storage, auth, harness, brain, or the OCR crate also updates that package's minimum version in `squigit-rs/Cargo.toml`. The facade manifest change requires a separately chosen `squigit-rs` version bump before release. Unrelated implementation crates keep their existing versions.

For example, an auth-only fix uses:

```bash
cargo xtask bump --auth 0.1.1
cargo xtask bump --squigit 0.1.1
```

The resulting facade release contains only:

```text
squigit-auth  0.1.0 -> 0.1.1
squigit-rs    0.1.0 -> 0.1.1
```

When an implementation bump falls outside another implementation crate's compatible dependency range, xtask updates the affected requirement and lists every downstream package whose manifest now requires a separately chosen version bump. Xtask never chooses those versions. Release refuses a changed publishable package whose version was not bumped, and it refuses pending implementation crates without a pending facade version.

An OCR engine bump updates the native engine's canonical version and every version-bearing build or workflow input. The Rust `squigit-ocr` crate and native OCR engine remain independently versioned.

Bump does not run validation, commit, tag, push, publish, or dispatch a workflow. Review its diff, run doctor and tests, and commit the version change normally.

## Releases

Release commands are maintainer operations. A release uses versions already committed in the repository; it never chooses or changes a version.

Every release requires:

- A clean worktree, including no untracked files.
- The `main` branch checked out.
- An updated `origin/main` reference.
- Local `HEAD` exactly equal to `origin/main`.
- No changed publishable package left at an already published version.
- A local version greater than the latest published version for every pending target.
- Successful doctor and Rust test commands.
- Valid authentication for the destination service.

`--dry-run` performs local validation, registry and GitHub reads, package preparation, and an action summary without publishing, tagging, pushing, or dispatching workflows:

```bash
cargo xtask release --facade --dry-run
cargo xtask release --ocr --dry-run
cargo xtask release --cli --dry-run
```

After all guards pass, every release prints a final plan before its first external mutation. The plan shows the source commit, every relevant component's published and local versions, skipped components, and the ordered tasks that will run. Versions use the form `0.1.0 -> 0.1.1`; a first release uses `unpublished -> 0.1.0`.

A facade plan follows this shape:

```text
Facade release
Source: 0123456789abcdef0123456789abcdef01234567

Versions:
  squigit-storage  0.1.0 -> 0.1.0  skip
  squigit-auth     0.1.0 -> 0.1.1  publish
  squigit-harness  0.1.0 -> 0.1.0  skip
  squigit-ocr      0.1.0 -> 0.1.0  skip
  squigit-brain    0.1.0 -> 0.1.0  skip
  squigit-rs       0.1.0 -> 0.1.1  publish

Tasks:
  1. Package and verify squigit-auth 0.1.1
  2. Publish squigit-auth 0.1.1
  3. Wait for crates.io to expose squigit-auth 0.1.1
  4. Package and verify squigit-rs 0.1.1
  5. Publish squigit-rs 0.1.1
  6. Confirm the completed facade graph on crates.io

Continue? [Y/n]
```

OCR and CLI plans use the same format and include their distribution workflow, release tag, platforms, and package-manager channels. Pressing Enter, `Y`, or `y` begins the release. Entering `N` or `n` cancels without making an external change. Any other response asks again.

`--yes` accepts the final prompt for an unattended invocation. It does not hide the plan or bypass any guard. `--dry-run` prints the complete plan and exits without asking for confirmation.

Xtask never prints registry tokens, GitHub tokens, embedded OAuth credentials, `.env` values, or API keys.

### Rust facade graph

Publish locally bumped Rust libraries with:

```bash
cargo xtask release --facade
```

This command treats the facade dependency graph as one resumable release transaction. It queries crates.io for all six library packages and skips exact versions that are already published. An implementation release always ends with a newly bumped facade. A small fix in `squigit-auth`, for example, publishes the new auth version followed by the new `squigit-rs` version; storage, harness, OCR, and brain remain untouched.

Pending packages are published in dependency order:

```text
squigit-storage
    -> squigit-auth
    -> squigit-harness
    -> squigit-ocr

squigit-storage + squigit-auth + squigit-harness
    -> squigit-brain

squigit-storage + squigit-auth + squigit-harness + squigit-brain + squigit-ocr
    -> squigit-rs
```

Before each upload, xtask verifies the package contents, normalized manifest, archive size, license and repository metadata, and registry-resolvable internal dependencies. It runs Cargo's publish dry run with verification enabled. It does not use `--no-verify`.

After publishing a package, xtask waits until that exact version is visible through crates.io before continuing to a dependent package. If an upload times out, xtask queries the registry before reporting failure because the upload may already have succeeded.

There is no rollback for a crates.io upload. The release is idempotent: rerunning it skips confirmed versions and resumes with the first unpublished package. It stops at the first unresolved dependency, registry rejection, or verification failure.

The release keeps local path dependencies in source control. Cargo removes those paths from packaged manifests and uses their registry version requirements for consumers.

### Native OCR product

Release the native OCR product with:

```bash
cargo xtask release --ocr
```

The command reads the native OCR engine version and verifies it is newer than the latest `ocr-v<VERSION>` release in `squigit-org/distribution`. After confirmation, it creates an immutable `ocr-v<VERSION>` tag at the displayed source commit, pushes that tag to the public source repository, and passes the tag to the distribution workflow. A matching remote tag is reused only when it resolves to the same commit. A full release enables Homebrew, Winget, APT, and DNF lanes and requests the Winget submission.

The distribution workflow calls this repository's four-platform OCR build matrix, obtains the measured runtime archives, publishes the distribution release, updates package-manager metadata, and runs its installed-product checks. Xtask reports the workflow URL and waits for its final result. Native Paddle compilation does not run on the maintainer's machine during release.

### CLI product

Release the CLI product with:

```bash
cargo xtask release --cli
```

The command reads the `squigit-cli` version and verifies it is newer than the latest CLI release in `squigit-org/distribution`. After confirmation, it creates an immutable `cli-v<VERSION>` tag at the displayed source commit, pushes that tag to the public source repository, and passes the tag to the CLI release workflow. A matching remote tag is reused only when it resolves to the same commit. Xtask reports the workflow URL and waits for completion.

The product release verifies that the packaged CLI resolves `squigit-rs` and its transitive libraries from crates.io. Local path dependencies remain available for workspace development but are not the dependency source used for a shipped product.

The CLI release command refuses to dispatch until every required facade package version is available from crates.io and the distribution repository exposes the expected CLI workflow contract.

## Release authentication

Facade publication uses Cargo's standard crates.io authentication. Authenticate before releasing with `cargo login` or provide `CARGO_REGISTRY_TOKEN` through the process environment.

Product dispatch uses the GitHub CLI. `gh auth status` must show an account allowed to run workflows in `squigit-org/distribution`; unattended environments may provide `GH_TOKEN`.

Authentication material must remain outside tracked files and must never be passed as a visible command-line argument.
