# IPC Security Foundation

> Status: **TBD** — IPC capability contract not yet ratified.
>
> Purpose: define trust assumptions and guarantees across Electron, N-API, and Rust.

## Provisional foundation claim

The goal is not an “unbeatable” channel. The goal is a small, explicit, testable capability boundary:

```text
Electron renderer -> preload API -> Electron main IPC -> N-API -> Rust
```

Every transition treats inputs as untrusted, validates them at the receiving boundary, exposes only named capabilities, and returns bounded typed results. A renderer compromise must not automatically become arbitrary filesystem access, arbitrary native invocation, or disclosure of every local secret.

## This document owns

- renderer-to-preload capability exposure;
- Electron IPC command registration, sender validation, and argument schemas;
- N-API serialization, type conversion, ownership, concurrency, and cancellation;
- Rust panic/error isolation at the native boundary;
- least privilege, secret return paths, and sensitive operations;
- protocol/version compatibility and test strategy across language boundaries.

## It does not own

- Google/browser identity semantics: [`AUTHENTICATION.md`](./AUTHENTICATION.md);
- cryptographic algorithms and keys: [`CRYPTOGRAPHY.md`](./CRYPTOGRAPHY.md);
- OCR/STT child-process protocols and external systems: [`TRUST_BOUNDARIES.md`](./TRUST_BOUNDARIES.md);
- feature-level message catalogs: [`../05-api-reference/IPC_PROTOCOL.md`](../05-api-reference/IPC_PROTOCOL.md).

## Invariants to ratify

- [ ] Preload exposes named methods, never a renderer-controlled generic invoke primitive.
- [ ] Main validates the sender, frame, command, arguments, paths, sizes, and authorization context.
- [ ] Rust validates again at the native trust boundary.
- [ ] Renderer input cannot select arbitrary filesystem paths or native commands.
- [ ] Plaintext secrets remain in the most trusted process that can perform the operation.
- [ ] Every long-running operation has one owner, an attempt/request ID, cancellation, deadline, and cleanup rule.
- [ ] Native panics and malformed return values cannot crash or corrupt the host process silently.
- [ ] Payloads, queues, streams, and callbacks are bounded and backpressured.
- [ ] IPC compatibility is versioned and tested across packaged builds.

## TBD outline

1. **Process and language topology** — TBD
2. **Capability model** — TBD
3. **Preload API contract** — TBD
4. **Electron main validation** — TBD
5. **N-API boundary contract** — TBD
6. **Ownership, concurrency, and cancellation** — TBD
7. **Secrets and filesystem capabilities** — TBD
8. **Error and panic containment** — TBD
9. **Protocol versioning** — TBD
10. **Adversarial test matrix** — TBD

## Open decisions

- [ ] Which current renderer operations can become backend-owned opaque capabilities?
- [ ] How are IPC schemas generated or shared across TypeScript and Rust?
- [ ] Which calls are restricted to the active profile rather than a caller-provided profile ID?
- [ ] What is the Rust-panic policy at every exported N-API function?
- [ ] What renderer sandbox blockers remain, if any?

## Decision log

| Date | Decision | Status |
| --- | --- | --- |
| TBD | Ratify the renderer-to-Rust capability model | Proposed |
