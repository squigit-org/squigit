# Squigit — Tauri Shell (Frozen at v0.1.1)

> ⚠️ **This is a frozen Proof of Concept.**
> Active development has moved to the Electron shell.
> Any attempt to build this shell without `xtask` will fail.

## Building

All Tauri operations must go through the monorepo build system:

```bash
cargo xtask dev --tauri
cargo xtask build tauri <COMMIT_SHA>
```

On first run, `xtask` will automatically download the frozen `v0.1.1` dependencies
(renderer dist, Qt capture binary, Rust crate sources) from the
[tauri-v0-archive](https://github.com/squigit-org/tauri-v0-archive) repository.
