# Authentication Foundation

> Status: **TBD** — foundational contract not yet ratified.
>
> Purpose: one canonical, agent-readable account of Squigit's identity model.

## Provisional foundation claim

Squigit uses **federated identity to bootstrap a local identity**.

Google is the external Identity Provider. Squigit is an Electron public client and OpenID Connect relying party. Google authenticates the person; Squigit receives an authorization code through the system browser, protects the exchange with PKCE, validates Google's OIDC identity assertion, and keys the local profile by the stable provider subject.

After that proof is validated, normal Squigit operation is local: the selected profile, settings, threads, and BYOK credentials are managed on the device. Squigit is not a cloud account system and does not currently require Google to participate in each app launch or local profile switch.

This is the same broad desktop pattern as tools that delegate sign-in to GitHub or Microsoft, with one Squigit-specific choice: the post-verification workspace/session remains local unless a future feature explicitly requires an online provider session.

The distinctions are deliberate:

- OAuth authorizes access to identity scopes; OIDC supplies the authentication assertion.
- PKCE protects the authorization code from interception; it does not prove who the user is.
- Google authenticates the user; Squigit must still validate signature, issuer, audience, expiry, nonce, and subject.
- A local profile is not a continuously validated Google session. Provider revocation cannot instantly lock local data unless Squigit deliberately adds revalidation.

## This document owns

- why Squigit uses federated identity;
- the Google OAuth 2.0 Authorization Code + PKCE flow;
- OIDC proof validation and stable identity (`iss` + `sub`);
- browser callback and attempt lifecycle invariants;
- local profile provisioning, selection, session, logout, disconnect, and deletion semantics;
- the line between identity proof and local authorization.

## It does not own

- algorithm and key-lifecycle details: [`CRYPTOGRAPHY.md`](./CRYPTOGRAPHY.md);
- renderer, Electron, N-API, and Rust capability design: [`IPC_SECURITY.md`](./IPC_SECURITY.md);
- system and sidecar boundaries: [`TRUST_BOUNDARIES.md`](./TRUST_BOUNDARIES.md);
- the historical finding register, retained for now: [`../02-architecture/AUTH.md`](../02-architecture/AUTH.md).

## Invariants to ratify

- [ ] External system browser only; no embedded OAuth webview.
- [ ] Electron is treated as a public client; no guarantee depends on a bundled client secret.
- [ ] Every authorization-code exchange uses attempt-specific PKCE S256.
- [ ] Callback attempts use loopback-only ephemeral ports and cannot consume one another.
- [ ] `state` binds the response, and OIDC `nonce` binds the ID token, to the attempt.
- [ ] ID tokens are validated before any profile is provisioned or activated.
- [ ] Provider identity uses `iss` + `sub`; email, name, and avatar are mutable attributes.
- [ ] OAuth tokens are retained only when a documented feature requires them.
- [ ] Local profile activation is never mislabeled as fresh provider authentication.
- [ ] Logout, disconnect, revoke, and delete-local-data have distinct semantics.

## TBD outline

1. **Goals and non-goals** — TBD
2. **Actors and terminology** — TBD
3. **Federated identity protocol** — TBD
4. **PKCE and callback lifecycle** — TBD
5. **OIDC validation contract** — TBD
6. **Local handoff and profile lifecycle** — TBD
7. **Authorization semantics** — TBD
8. **Failure, cancellation, and recovery** — TBD
9. **Privacy, retention, and revocation** — TBD
10. **Verification matrix** — TBD

## Open decisions

- [ ] Does switching an existing local profile ever require Google reauthentication?
- [ ] Is authentication freshness recorded or enforced for any action?
- [ ] Are access/refresh tokens always transient, or will a future feature require retention?
- [ ] What exact user experience distinguishes logout, disconnect, and deletion?
- [ ] What migration moves existing email-derived profile IDs to provider subjects?

## Normative references to ratify

- [RFC 8252: OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
- [RFC 9700: Best Current Practice for OAuth 2.0 Security](https://datatracker.ietf.org/doc/html/rfc9700)
- [RFC 7636: Proof Key for Code Exchange](https://datatracker.ietf.org/doc/html/rfc7636)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-18.html)
- [Google OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)

## Decision log

| Date | Decision                                                             | Status   |
| ---- | -------------------------------------------------------------------- | -------- |
| TBD  | Ratify federated bootstrap followed by a local profile/session model | Proposed |
