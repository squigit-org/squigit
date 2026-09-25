# Squigit repository guide

Squigit is a Rust workspace containing the public core, a terminal product, and the native OCR source. The desktop GUI lives in a separate private repository. Treat this repository as the source of truth for the public Rust crates and the OCR build inputs.

## Architecture

All product shells must enter the Rust backend through `squigit-rs`. The facade library keeps the crate name `squigit`; `squigit-cli` depends only on that facade. Do not bypass the facade from a shell by importing an implementation crate directly.

The dependency flow is:

```text
squigit-cli
    -> squigit-rs (crate name: squigit)
        -> squigit-storage
        -> squigit-auth
        -> squigit-harness
        -> squigit-brain
        -> squigit-ocr
```

```text
squigit-desktop (private)
     -> backend/
    │   ├── build.rs
    │   ├── Cargo.toml
    │   ├── index.d.ts
    │   ├── index.js
    │   ├── package.json
    │   ├── runtime/
    │   │   ├── build.rs
    │   │   ├── Cargo.toml
    │   │   ├── assets/
    │   │   │   └── secrets/
    │   │   │       ├── credentials.example.json
    │   │   │       └── pub.example.pem
    │   │   └── src/
    │   │       ├── compositor.rs
    │   │       ├── lib.rs
    │   │       ├── media.rs
    │   │       ├── platform.rs
    │   │       ├── secrets.rs
    │   │       ├── compositor/
    │   │       │   ├── kwin.rs
    │   │       │   ├── mutter.rs
    │   │       │   ├── window.rs
    │   │       │   ├── kwin/
    │   │       │   └── mutter/
    │   │       ├── media/
    │   │       │   ├── clipboard.rs
    │   │       │   └── dialog_alert.rs
    │   │       └── platform/
    │   │           ├── ibus_warning.rs
    │   │           ├── machine_info.rs
    │   │           └── system_theme.rs
    │   └── src/
    │       ├── auth.rs
    │       ├── host.rs
    │       ├── lib.rs
    │       ├── shell.rs
    │       ├── types.rs
    │       ├── auth/
    │       │   ├── api_keys.rs
    │       │   └── profile.rs
    │       ├── host/
    │       │   ├── file_index.rs
    │       │   ├── media.rs
    │       │   ├── platform.rs
    │       │   ├── update.rs
    │       │   └── urls.rs
    │       └── shell/
    │           ├── composer.rs
    │           ├── explorer.rs
    │           ├── settings.rs
    │           └── thread.rs
    └── squigit/
        └── src/
            └── electron/
                └── preload/
                    └── napi.ts
```

The workspace components have these responsibilities:

- `squigit-rs/` is the public product facade shared by the CLI and the desktop N-API backend. Preserve backend-facing types, serialized field names, and service behavior when changing it.
- `crates/squigit-storage/` owns config roots, profiles, encrypted key records, CAS objects, workspaces, image threads, side-chat threads, OCR annotations, version records, and their serialized schemas.
- `crates/squigit-auth/` owns Google OAuth, API-key validation, encryption, OS-vault binding, reveal authorization, and process-only contributor credentials.
- `crates/squigit-harness/` converts supported documents and expands canonical text attachments before model submission.
- `crates/squigit-brain/` owns Gemini model planning, title generation, attachment preparation, upload reuse, and submission preflight.
- `squigit-ocr/src/` is the publishable Rust library for installed-executable discovery, OCR execution, model management, downloads, and annotation persistence.
- `squigit-cli/` is the Ratatui product. It must keep the same persisted threads, attachments, profiles, settings, and OCR data that the GUI understands.
- `xtask/` is the repository command surface for development, validation, and product builds.

Persisted schema versions, profile identity derivation, cryptographic domain strings, provider IDs, model IDs, CAS hashes, remote IDs, and N-API JSON names are compatibility boundaries. A Cargo package version change does not reset any of them. Do not add legacy readers or compatibility wrappers during a refactor unless the task explicitly asks for migration support.

## Repository commands

Use the root task runner instead of inventing one-off build commands:

```bash
cargo xtask dev
cargo xtask dev --demo
cargo xtask fmt
cargo xtask fmt --all
cargo xtask doctor
cargo xtask build --cli
cargo xtask build --ocr
```

`cargo xtask doctor` performs source hygiene, formatting, and workspace compilation. It compiles the CLI through its credential-free demo build path. Do not add tests unless the user explicitly asks for them.

`cargo xtask dev` stores development boundary logs under the repository `logs/` directory. A normally installed CLI does not create those logs unless `SQUIGIT_LOG_DIR` is explicitly set.

`SQUIGIT_HOME=/path cargo xtask dev` and `squigit --home /path` select a CLI config root. `SQUIGIT_CONFIG_DIR` is the lower-level shared override honored by the Rust crates.

## Facade release workflow

Facade changes (anything under `squigit-rs/`, `crates/`, or `squigit-ocr/src/`) reach the desktop only through crates.io. The desktop N-API backend (`backend/Cargo.toml` in the private repository) is the single external consumer: `squigit = { package = "squigit-rs", version = "x.y.z" }`. Never give the desktop a path dependency into this repository.

The end-to-end sequence for a facade change is:

```bash
cargo xtask bump --squigit <VERSION>   # required when any published crate source changed
git add <files> && git commit -m "..." # release requires a clean tree
git push origin main                   # release requires HEAD == origin/main
cargo xtask release --facade --yes
# then, in the desktop repo: bump the version requirement in
# backend/Cargo.toml, update the lockfile, and verify the bridge:
cargo update -p squigit-rs --precise <VERSION>
cargo check -p squigit-backend --locked
```

Notes:

- `cargo xtask release --facade` validates crates.io auth first (presence of the `cargo login` token or `CARGO_REGISTRY_TOKEN`; validity itself is proven by the real `cargo publish`, because crates.io forbids token auth on read-only probes). Doctor and tests run after the auth preflight.
- Doctor/test results are cached per commit in the ignored `.xtask-cache/` directory: a clean tree at an already-validated `HEAD` skips re-running. Dirty trees always re-run and never poison the cache.
- Release is idempotent across retries: already-published versions are detected via crates.io and skipped, so a rate-limit (`429`) or network failure only needs a rerun of the same command. Never bump versions to work around a failed publish; retry the same versions.

### Versioning law (strict)

- A crate `version` is independent from its dependency requirements. Bumping `squigit-storage 0.1.0 -> 0.2.0` never means bumping dependents to `0.2.0`. Example: if `office2pdf` goes `0.6.5 -> 0.7.0`, this workspace goes `0.2.0 -> 0.2.1`, never `0.7.0`. Never align versions across the workspace for uniformity.
- Only bump crates with a functional source change under their own directory (`.rs`, assets, `src/`). A `Cargo.toml` requirement rewrite performed by `cargo xtask bump` is not a functional change.
- Dependency-floor-only crates (manifest requirement rewritten by xtask, no source change) get a `patch` bump only: `0.1.0 -> 0.1.1`. Functional breaking/feature crates get `minor` on `0.x`: `0.1.x -> 0.2.0`.
- `cargo xtask bump` prints `Choose and apply new versions before release` for dependents. That is a requirement to republish updated metadata, not permission to copy the dependency version. Pick the smallest increment per rule above.
- `squigit-cli` is not in the facade (`LIBRARY_IDS` is storage/auth/harness/ocr/brain/squigit). Do not bump `--cli` for a facade release unless the CLI itself changed.
- crates.io publishes are immutable: a published number can never be deleted, overwritten, or reused. `yank` only hides it and breaks dependents. A wrong bump cannot be undone, only moved forward.

## CLI credentials and contributor mode

Production CLI builds embed Google OAuth application credentials from `squigit-cli/secrets/credentials.json`. That file is ignored and must never be printed, inspected in logs, staged, or committed. `squigit-cli/secrets/credentials.example.json` documents the expected shape and contains placeholders only. The CLI build script copies the private JSON into Cargo `OUT_DIR`; runtime startup registers it through the facade before authentication begins.

A normal `cargo xtask dev` or `cargo xtask build --cli` must fail if production OAuth credentials are missing or still contain placeholders. Contributors without those credentials use:

```bash
cp .env.example .env
cargo xtask dev --demo
```

Demo mode reads non-empty `GEMINI_API_KEY` and `IMGBB_API_KEY` values from the process environment first, then from the ignored root `.env`. Both values are optional:

- With neither key, the CLI runs as a guest for local and OCR workflows.
- With either key, it activates the deterministic `contributor@squigit.app` profile.
- Gemini features require `GEMINI_API_KEY`; Lens requires `IMGBB_API_KEY`.

Demo keys are validated, held in zeroizing process memory, and never written to the encrypted profile key store or OS vault. Login, logout, profile switching, key configuration, and key reveal commands stay hidden and rejected in demo mode.

Unless the contributor supplies `SQUIGIT_HOME`, `SQUIGIT_CONFIG_DIR`, or `--home`, demo state is isolated under the ignored repository directory `squigit-demo/`. This directory may contain config, profiles, threads, CAS data, OCR annotations, and caches, so it must remain untracked.

## Terminal interface behavior

Ratatui owns the alternate screen and redraws frames from application state. Background workers must report through the task channel. They must not print progress to stdout or stderr while `SQUIGIT_TUI_ACTIVE` is set, because uncontrolled output corrupts the terminal screen.

Slash commands are parsed from the composer and filtered by the current mode and thread kind. Text entered without an active image thread creates or continues a side-chat-backed thread, but the CLI presents it as a normal chat. Image-only commands remain unavailable there.

File mentions are visual tokens only while typing. The CLI resolves `@file` paths and converts them to the same canonical Markdown attachment links used by the GUI only after send. Attachment preparation, CAS storage, conversion, and upload also begin after send. Do not move those operations into mention selection or keystroke handling.

Session choices under `/model` affect the next messages in the running process. Defaults under `/settings` persist to `config.toml` and control later CLI launches, including image arguments and automatic OCR.

## OCR boundary and build pipeline

`squigit-ocr/` contains two deliberately isolated systems:

```text
squigit-ocr/src/       publishable Rust crate
squigit-ocr/native/    Python/Paddle native executable source
squigit-ocr/build.rs   end-to-end native build orchestrator imported by xtask
```

The crate manifest has `build = false` and excludes `native/**` from its crates.io package. Cargo must not run the native pipeline merely because another crate depends on `squigit-ocr`.

The native build is expensive and fragile. `cargo xtask build --ocr` creates the Python environment, installs the pinned dependency sets, applies the ordered Paddle/PaddleX patches, downloads the bundled models, runs the Python smoke check, invokes PyInstaller, validates the packaged executable, measures the final runtime, and stages it under `binaries/`.

Do not casually change PaddlePaddle flags, pinned versions, patch order, excluded dependencies, model layout, PyInstaller mode, dynamic-library handling, or platform paths. The macOS ARM OpenMP layout, Linux runtime libraries, and Windows archive shape were established through shipping tests and are sensitive to small changes.

`.github/workflows/ocr-build-matrix.yml` runs Ubuntu x64, Fedora x64, macOS ARM, and Windows x64 as four parallel matrix branches. Each branch builds the one-file baseline and final one-directory runtime, verifies its version, runs the packaged executable against a generated image, validates the JSON, records runtime size, and uploads the actual distribution payload.

This source repository owns OCR compilation and smoke validation. The separate `squigit-org/distribution` repository owns release assembly and publication to Winget, Homebrew, APT, and DNF. Keep artifact names, target triples, directory layouts, checksums, and version inputs aligned across that repository boundary. Do not duplicate package-manager release logic here.

## Change rules

- Preserve the public/private repository boundary. Never reference private desktop paths, ignored backup crates, local credentials, or developer home paths from tracked source.
- Keep the facade as the only shell-facing Rust API. Add a facade operation when the CLI and GUI need implementation-crate behavior.
- Keep secrets out of Git and command output. Review staged paths before every credential-related commit.
- Add `// Copyright 2026 a7mddra` and `// SPDX-License-Identifier: Apache-2.0` to every new Rust source file.
- Do not add tests unless the founder asks for them. Use the verification scope requested for the current task.
- Do not introduce warning suppressions, placeholder methods, legacy formats, or broad compatibility layers to hide incomplete refactors.
- Make focused incremental commits and leave unrelated worktree changes untouched.
- Never bump crate versions unprompted. When a change touches published crate sources, tell the founder a bump is needed and propose the exact crates and versions — then wait for approval before running `cargo xtask bump`. A session may still grow into a larger refactor that changes what the correct bump is.
