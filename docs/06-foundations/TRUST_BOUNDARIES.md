# Trust Boundaries Foundation

> Status: **TBD** — system threat boundaries and channel guarantees not yet ratified.
>
> Purpose: map every place where data, authority, or authenticity changes across Squigit's systems.

## Provisional foundation claim

Squigit is not one trust domain. Its desktop app, OCR sidecar, and STT sidecar are separate executable systems, and the app also crosses browser, provider, filesystem, update, and renderer boundaries.

Spawning a child process does not make its output trustworthy. A defensible channel also requires trusted binary provenance, constrained invocation, explicit framing, strict validation, bounded resources, lifecycle ownership, and safe failure behavior.

## Boundary map to ratify

```text
System browser <-> Google Identity
       |
Electron renderer <-> preload <-> Electron main
                                      |
                                   N-API
                                      |
                                  Rust core
                             /         |         \
                      OCR sidecar   STT sidecar   Filesystem
                         |              |             |
                    one-shot JSON   JSONL streams   local data
                                      |
                         Gemini / ImgBB / update sources
```

For every edge, this document must answer:

1. Who starts and owns the channel?
2. What data and authority cross it?
3. How is the peer or artifact authenticated?
4. How are messages framed, validated, and size-bounded?
5. What if the peer lies, hangs, crashes, replays, or floods?
6. How is cancellation, shutdown, and cleanup enforced?

## This document owns

- the complete trust-boundary and data-authority map;
- OCR and STT binary discovery, provenance, invocation, stdio protocols, and lifecycle;
- filesystem, system-browser, OAuth-provider, AI-provider, image-host, and OTA-source boundaries;
- cross-boundary threat assumptions, mitigations, accepted risks, and verification evidence;
- how compromise of one component is contained from the others.

## It does not own

- the detailed federated identity protocol: [`AUTHENTICATION.md`](./AUTHENTICATION.md);
- primitive/key mechanics: [`CRYPTOGRAPHY.md`](./CRYPTOGRAPHY.md);
- detailed renderer/main/N-API capability design: [`IPC_SECURITY.md`](./IPC_SECURITY.md).

## Invariants to ratify

- [ ] Every executable and downloaded artifact has a defined provenance and integrity policy.
- [ ] Child processes inherit only the environment, handles, paths, and permissions they need.
- [ ] Every protocol is framed, typed, versioned, size-bounded, and strict about malformed input.
- [ ] Stdout protocol data is separated from diagnostics.
- [ ] Timeouts, cancellation, backpressure, process death, and orphan cleanup are defined per channel.
- [ ] Untrusted paths and URLs are canonicalized and constrained before use.
- [ ] Compromise of the renderer or one sidecar does not imply unrestricted compromise of the others.
- [ ] External-service responses are validated before they influence local authority or persistent state.

## TBD outline

1. **Assets, actors, and attacker capabilities** — TBD
2. **Boundary inventory and data-flow diagram** — TBD
3. **Electron application boundaries** — TBD
4. **OCR process channel** — TBD
5. **STT streaming channel** — TBD
6. **Filesystem and local storage** — TBD
7. **Browser and cloud-service boundaries** — TBD
8. **OTA and executable provenance** — TBD
9. **Compromise containment and accepted risks** — TBD
10. **Verification matrix** — TBD

## Open decisions

- [ ] Are OCR/STT binaries signed and verified immediately before execution?
- [ ] Can sidecars run with reduced OS privileges or sandboxing?
- [ ] What protocol versions, maximum messages, timeouts, and backpressure rules apply?
- [ ] How are noisy stdout, partial JSON, replayed events, and unexpected child exits handled?
- [ ] Which filesystem roots and network destinations may each component access?

## Decision log

| Date | Decision | Status |
| --- | --- | --- |
| TBD | Ratify the complete boundary inventory and channel guarantees | Proposed |
