# Cryptography Foundation

> Status: **TBD** — cryptographic contract and key lifecycle not yet ratified.
>
> Purpose: one canonical inventory of every cryptographic primitive, key, proof, and signed artifact in Squigit.

## Provisional foundation claim

Cryptography in Squigit must be explicit, versioned, and attached to a precise security property. Algorithm names alone are not guarantees: key origin, custody, rotation, canonical encoding, failure behavior, and verification order are part of the design.

This file owns algorithms and key mechanics, not the product flows that consume them.

## This document owns

- BYOK encryption at rest and master-key custody;
- OS keychain/credential-vault integration and fallback behavior;
- AES-GCM envelope format, nonces, salt, associated data, and migration;
- OTA Ed25519 signing, verification, key IDs, rotation, and rollback/replay policy;
- cryptographically secure randomness;
- PKCE verifier/challenge construction as a primitive;
- hashes, deterministic identifiers, integrity checks, and domain separation;
- secret zeroization, logging, and in-memory exposure limits.

## It does not own

- federated identity and OAuth semantics: [`AUTHENTICATION.md`](./AUTHENTICATION.md);
- which renderer capabilities may request cryptographic operations: [`IPC_SECURITY.md`](./IPC_SECURITY.md);
- whether a process or transport is trusted: [`TRUST_BOUNDARIES.md`](./TRUST_BOUNDARIES.md);
- public user promises and policy language: [`../07-policies/`](../07-policies/).

## Invariants to ratify

- [ ] No custom cryptographic constructions when a reviewed standard construction exists.
- [ ] Every key has a documented generator, owner, storage location, scope, rotation path, and destruction path.
- [ ] Random values that carry security properties use the OS CSPRNG.
- [ ] Encryption envelopes and signed payloads are versioned and canonically encoded.
- [ ] Verification fails closed before an artifact, identity, or plaintext is used.
- [ ] Secret material never enters URLs, logs, crash messages, telemetry, or renderer state without an explicit need.
- [ ] Local encryption keys are not derived only from predictable filesystem or user metadata.
- [ ] Hashes used as identifiers are not presented as authentication or integrity proofs.

## TBD outline

1. **Asset and key inventory** — TBD
2. **Security properties and attacker capabilities** — TBD
3. **BYOK encryption envelope** — TBD
4. **Master-key custody and OS integration** — TBD
5. **OTA signing and verification** — TBD
6. **PKCE and randomness primitives** — TBD
7. **Hashing and identifiers** — TBD
8. **Rotation and format migration** — TBD
9. **Failure and recovery rules** — TBD
10. **Test vectors and verification matrix** — TBD

## Open decisions

- [ ] Which OS secure-storage abstraction owns the random BYOK master key?
- [ ] What is the honest fallback when a secure credential store is unavailable?
- [ ] How are OTA verification keys rotated without accepting downgrade or replay?
- [ ] Which payload fields are authenticated as AES-GCM associated data?
- [ ] Which current hashes are identifiers, fingerprints, cache keys, or security checks?

## Decision log

| Date | Decision | Status |
| --- | --- | --- |
| TBD | Ratify the cryptographic inventory and key hierarchy | Proposed |
