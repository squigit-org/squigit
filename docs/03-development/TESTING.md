# Developer Tests

`cargo xtask test` runs deterministic, non-interactive tests written by developers. Environment and health checks belong to `doctor`. Anything that asks for input, requires workflow flags, opens UI, or simulates a user flow belongs under `cargo xtask live` and must not be placed in an ordinary component test directory.

## Running tests

From the repository root, run every registered Rust and Node component without confirmation:

```sh
cargo xtask test
```

Targeting a component from the repository root is equivalent to changing into that component first. Both forms preserve selectors:

```sh
cargo xtask test crates/squigit-auth i 2
cargo xtask crates/squigit-auth test --skip 1
```

Inside a component, bare `cargo xtask test` lists the available entries and asks for confirmation. Explicit selectors never prompt.

- `i` delegates inline/unit-test discovery to the framework.
- `1..N` select the numbered files from the component's configured test directory.
- `cargo xtask test i 1 3` runs inline tests and files 1 and 3.
- `cargo xtask test --skip i 2` runs every numbered file except 2 and omits inline tests.

## Test placement

Each component declares its selectable test root and include globs in `xtask.toml`.

- Rust integration-test entrypoints belong under `tests/`. Cargo metadata determines which matching files are real test targets, so nested helper modules are not numbered independently.
- Rust selector `i` runs library and binary unit tests such as `#[cfg(test)]` modules without running integration or documentation tests.
- Node selectable tests belong under `tests/` and use `.test.ts` or `.test.tsx` names.
- Node selector `i` delegates `src/**/*.test.ts` and `src/**/*.test.tsx` to Node's test runner through the `tsx` loader.

Do not put interactive or live tests under these roots. Live tests are implemented by the Rust workflows behind `xtask/src/commands/live.rs`.

## Non-interactive guarantee

Test processes receive closed stdin. Their stdout and stderr are streamed normally, and every emitted chunk resets a ten-second inactivity timer. Cargo compilation is not timed; the timer starts when Cargo begins executing a test binary. A silent test process is terminated and reported as failed after ten seconds.

Python and C++ sidecar checks are live workflows, not ordinary test suites. Invoking ordinary tests for those components prints the matching `live` guidance instead of running pytest or CMake tests.
