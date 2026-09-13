# Authentication Foundation

Status: **schema 1, Google OIDC with PKCE, shared loopback flow**

Squigit uses Google sign-in to prove an identity and stores that identity as a local profile. The desktop and CLI reach authentication through `squigit-rs`; provider logic lives in `squigit-auth`, and persistence lives in `squigit-storage`.

## Identity model

Google is the identity provider, not the database for local Squigit data. A profile is keyed by:

```text
provider + canonical issuer + subject
```

For Google:

```text
google + https://accounts.google.com + <Google sub>
```

The filesystem-safe profile ID is:

```text
ggl-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx
```

The four hexadecimal groups come from the first 32 lowercase characters of:

```text
BLAKE3(canonical_issuer + "\0" + subject)
```

Email, name, and avatar are mutable display attributes. They do not identify the account.

## Ownership

`crates/squigit-auth/` owns:

- Google OAuth credential parsing and validation;
- PKCE, state, nonce, authorization URL, and token exchange;
- JWKS and ID-token validation;
- profile values and avatar hydration;
- API-key validation, encryption, reveal authorization, and vault access;
- credential-bound CAS remote identities.

`crates/squigit-storage/src/profiles/` owns the schema-1 `auth.json` and `keys.json` formats, `profiles.json`, advisory key-store locking, private permissions, and atomic persistence.

`squigit-rs/src/profile.rs` is the shell-facing service. It injects host credentials, owns one active login attempt, opens the browser, runs the loopback exchange, exposes profile snapshots, and applies the product rules for login, cancellation, switching, logout, and deletion.

Product hosts supply OAuth application credentials through the facade:

- The CLI build script embeds `squigit-cli/secrets/credentials.json` into the compiled CLI and the CLI passes that JSON to `set_google_credentials_json` at startup.
- The desktop runtime injects its credential JSON through the same facade API.
- Contributor demo mode does not configure OAuth and hides authentication commands.

There is no auth-crate build script, OTA verification module, or embedded credential asset in `squigit-auth`.

## OAuth flow

Squigit is a desktop public client. It cannot keep an OAuth client secret confidential because the executable runs on the user's machine. PKCE protects the authorization-code exchange:

1. The facade binds a one-shot HTTP server to `127.0.0.1` on an available port.
2. Auth generates high-entropy state, nonce, and `code_verifier` values.
3. It sends `BASE64URL(SHA256(code_verifier))` as the S256 code challenge.
4. The user's default browser opens the Google authorization URL.
5. Google redirects to the exact loopback origin used for that attempt.
6. Squigit accepts only the expected loopback host and path, verifies state, and exchanges the code with the original verifier.
7. Squigit validates the ID token before changing local state.
8. The loopback response redirects the browser to the hosted status page with `#success` or `#invalid`.

The facade allows one login attempt at a time. Cancellation marks the active attempt, and the attempt also observes its configured timeout. State, nonce, authorization code, verifier, access token, and raw ID token remain process-only.

If a desktop-client credential contains `client_secret`, token exchange begins with the public-client PKCE fields. Auth retries with the supplied secret only when Google rejects the first exchange with a client-secret-related error. The embedded value is not treated as a protected secret.

## ID-token validation

Before writing profile state, Squigit checks:

- algorithm `RS256`;
- a key ID present in Google's JWKS;
- signature validity;
- issuer `https://accounts.google.com` or `accounts.google.com`;
- audience equal to the configured client ID;
- required `exp`, `iss`, `aud`, and `sub` claims;
- nonce equality with the active attempt;
- a nonempty subject;
- an email-verification claim that is not explicitly false.

The stored issuer is canonicalized to `https://accounts.google.com`. Missing email, name, or picture claims can be completed from Google UserInfo when an access token is available. A UserInfo response is accepted only when its subject matches the validated ID token.

The access token and ID token are never persisted.

## OAuth credential sources

The accepted JSON wrapper contains either `installed` or `web`:

```json
{
  "installed": {
    "client_id": "...apps.googleusercontent.com",
    "client_secret": "...",
    "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
    "token_uri": "https://oauth2.googleapis.com/token"
  }
}
```

`CredentialsSource` has two variants:

- `RawJson`, used by product hosts that already loaded or embedded the credential document;
- `Auto`, which reads `SQUIGIT_GOOGLE_CREDENTIALS_JSON`, then the path in `SQUIGIT_GOOGLE_CREDENTIALS_PATH`.

Empty documents, missing `installed`/`web` objects, and placeholder client IDs are rejected. Production CLI builds require `squigit-cli/secrets/credentials.json`. `cargo xtask dev --demo` replaces the embedded file with an empty build-time placeholder and never enables login.

The OAuth client should be configured as a Google Desktop application with loopback redirects.

## Local profile files

All paths below are relative to the shared application root described in [Machine Store Architecture](../01-architecture/MACHINE_STORE.md).

### `auth.json`

`auth.json` records local active-profile state and the last successful provider proof. It is not a token store.

```json
{
  "schema": 1,
  "auth_mode": "google_oidc_pkce",
  "active_profile_id": "ggl-3d09c4f2-b64a1b0e-9b35d7f5-d9c01a77",
  "last_login": {
    "profile_id": "ggl-3d09c4f2-b64a1b0e-9b35d7f5-d9c01a77",
    "provider": "google",
    "issuer": "https://accounts.google.com",
    "subject": "<google-sub>",
    "authenticated_at": "2026-07-15T23:18:21.732394903Z",
    "audience": "<google-client-id>",
    "scope": ["openid", "profile", "email"],
    "pkce_method": "S256",
    "id_token_issued_at": "2026-07-15T23:18:16Z",
    "id_token_expires_at": "2026-07-16T00:18:16Z"
  }
}
```

Local profile switching does not update `last_login`. Logout writes schema-1 defaults with both `active_profile_id` and `last_login` set to `null`.

### `profiles.json`

`profiles.json` maps canonical profile IDs to identity and display metadata:

```json
{
  "ggl-3d09c4f2-b64a1b0e-9b35d7f5-d9c01a77": {
    "id": "ggl-3d09c4f2-b64a1b0e-9b35d7f5-d9c01a77",
    "identity": {
      "provider": "google",
      "issuer": "https://accounts.google.com",
      "subject": "<google-sub>"
    },
    "name": "Example User",
    "email": "user@example.com",
    "avatar_base64": "data:image/png;base64,...",
    "avatar_url": "https://lh3.googleusercontent.com/...",
    "created_at": "2026-07-15T23:18:21.700000000Z",
    "last_used_at": "2026-07-15T23:18:21.732394903Z"
  }
}
```

On reauthentication, `created_at` is preserved, display metadata is refreshed, a usable cached avatar is retained when no replacement is available, and `last_used_at` advances. Missing cached avatars are hydrated in background threads when profile snapshots are loaded.

### `keys.json`

`keys.json` stores profile-scoped BYOK records, not Google OAuth tokens:

```json
{
  "schema": 1,
  "last_trusted_reveal": null,
  "profiles": {
    "<profile-id>": {
      "google-ai-studio": {
        "cipher": "aes-256-gcm",
        "width": 39,
        "kdf": "hkdf-sha256",
        "salt": "<32-byte-base64url-no-pad>",
        "nonce": "<12-byte-base64url-no-pad>",
        "ciphertext": "<ciphertext-with-gcm-tag>"
      }
    }
  }
}
```

The record fields are strict. The root file validates schema and typed profile records. Cryptographic details are defined in [Cryptography Foundation](CRYPTOGRAPHY.md).

## Profile operations

Successful authentication creates or refreshes the profile, activates it, records the last-login proof, invalidates reveal grace, and returns a complete profile snapshot.

Switching requires an existing profile, updates `active_profile_id`, advances `last_used_at`, invalidates reveal grace, and leaves `last_login` unchanged.

Logout enters Guest mode. It clears active and last-login state while preserving profiles, encrypted keys, threads, objects, and settings.

Profile deletion has two guards:

- the facade refuses to delete the active profile;
- storage refuses to delete the final remaining profile.

Deleting an eligible inactive profile removes its metadata, profile directory when present, and encrypted key records. It also invalidates reveal grace. The user must switch or log out before deleting the profile that was active.

## Contributor demo mode

`cargo xtask dev --demo` initializes process-only API-key state from `GEMINI_API_KEY` and `IMGBB_API_KEY`. The command reads the process environment first and then the ignored root `.env`.

Both keys are optional. With no key, the CLI runs as Guest for local and OCR workflows. With either key, it creates and activates the deterministic local `contributor@squigit.app` profile. The supplied keys are validated and held in zeroizing process memory; they are not written to `keys.json` or the OS vault. Authentication and persistent credential-management commands remain hidden.

Demo data defaults to the ignored `squigit-demo/` root. `--home`, `SQUIGIT_HOME`, or `SQUIGIT_CONFIG_DIR` can select another isolated root.

## Hosted status page

The status page is maintained in the `squigit-org.github.io` repository:

```text
site/login/popup-google-auth/index.html
src/features/auth-popup/main.tsx
src/features/auth-popup/styles.css
```

The loopback flow redirects it with one of these fragments:

```text
#success
#invalid
#unavailable
```

It does not receive the authorization code, state, ID token, access token, refresh token, or profile data from the loopback flow. The page also contains a separate direct-web-callback branch for `?code&state` and `?error`; Squigit's current native flow does not use that branch.

The loopback redirect response includes `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and `Connection: close`.

## Future domain migration to `squigit.app`

The `squigit.app` domain has not been purchased or deployed. The following work remains a future migration plan.

### Prepared application behavior

Auth currently defines:

```text
https://squigit.app/login/popup-google-auth/
https://squigit-org.github.io/login/popup-google-auth/
```

At runtime it sends a two-second HEAD probe to `https://squigit.app/`. A response below HTTP 500 selects the future domain; connection failure or a server error selects GitHub Pages. Once the domain is owned and serves the expected route, existing clients can prefer it without changing the loopback OAuth redirect.

### Hosting work

1. Purchase `squigit.app`.
2. Point its DNS at the selected host and enable HTTPS.
3. Serve `/login/popup-google-auth/` with the current hash states and strict CSP.
4. If GitHub Pages remains the host, configure the custom domain and publish a `CNAME` containing `squigit.app`.
5. If the site moves to Vercel or Next.js, preserve the route as a static client page and keep its hash behavior independent of server auth state.
6. Keep the GitHub Pages URL available during migration for older clients and fallback behavior.

### Google configuration

The native OAuth redirect remains the dynamic `http://127.0.0.1:<port>` loopback origin. The hosted status page is not Google's redirect URI in this flow.

After purchasing the domain:

1. Add or verify `squigit.app` as an authorized domain when required by the Google consent configuration.
2. Keep the OAuth client type as Desktop application.
3. Preserve the `openid profile email` scopes and the app's JWKS, issuer, audience, nonce, and state validation.
4. If Google issues a new client ID, update each product host's credential JSON and rebuild that product.

### Migration verification

- `https://squigit.app/` responds successfully over HTTPS.
- `/login/popup-google-auth/#success`, `#invalid`, and `#unavailable` render correctly.
- The loopback callback still receives and consumes Google's code locally.
- The final browser URL contains only the hosted status fragment.
- `auth.json` contains schema-1 login metadata and no tokens.
- Existing GitHub Pages fallback behavior still works while it remains supported.

After the future domain is stable, a later cleanup can remove the direct callback/deep-link branch and GitHub Pages fallback. That cleanup should be a deliberate protocol change, not part of the domain launch itself.

## Source map

```text
crates/squigit-auth/src/auth/callback_server.rs
crates/squigit-auth/src/auth/credentials.rs
crates/squigit-auth/src/auth/google.rs
crates/squigit-auth/src/security/
crates/squigit-storage/src/profiles/store.rs
crates/squigit-storage/src/profiles/types.rs
squigit-rs/src/profile.rs
squigit-rs/src/cli.rs
squigit-cli/build.rs
squigit-cli/src/secrets.rs
```
