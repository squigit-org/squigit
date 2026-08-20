# Authentication Foundation

Status: **schema 1, Google OIDC PKCE, desktop loopback flow**

This document is the reference for Squigit authentication. It explains what happens without requiring a reader to inspect the code first.

## Mental Model

Squigit uses Google sign-in to prove a user identity, then turns that identity into a local Squigit profile.

Google is not the account database for local app data. The durable local account key is:

```text
provider + canonical issuer + subject
```

For Google, that is:

```text
google + https://accounts.google.com + <Google sub>
```

The profile id is a filesystem-safe hash of that identity:

```text
ggl-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx
```

Each hexadecimal group is eight characters from the first 32 lowercase hexadecimal characters of
`BLAKE3(canonical_iss + "\0" + sub)`.

Email, name, and avatar are display attributes. They can change and are never used as the stable account key.

## System Pieces

### Native Auth Crate

`crates/squigit-auth/` owns local authentication behavior: OAuth flow state, provider validation, profile value creation, avatar hydration policy, API key validation, encryption/decryption, and OTA verification.

Important files:

- `src/auth/callback_server.rs`: auth settings, localhost loopback server, hosted status page URL selection, and HTTP 302 redirect response.
- `src/auth/credentials.rs`: Google OAuth credential loading and validation.
- `src/auth/google.rs`: PKCE generation, Google authorization URL construction, callback validation, token exchange, ID token validation, profile creation/update, avatar hydration.
- `src/security/api_keys.rs`, `src/security/crypto.rs`, and `src/security/vault.rs`: profile-scoped BYOK validation, OS-vault custody, record encryption, and credential-bound CAS identities.
- `build.rs`: embeds OAuth credentials into the Rust build when configured.

`crates/squigit-storage/src/profiles/` owns profile types and the persisted profile/auth/key storage contract: `auth.json`, `profiles.json`, `keys.json`, active profile state, profile CRUD, schema validation, and atomic writes.

### Hosted Auth Status Page

The hosted page lives in:

```text
squigit-org.github.io/site/login/popup-google-auth/index.html
squigit-org.github.io/src/features/auth-popup/main.tsx
squigit-org.github.io/src/features/auth-popup/styles.css
```

The Vite website build uses `site/` as its root and registers this route as the `authPopup` entry in `squigit-org.github.io/vite.config.ts`. The source path is `site/login/popup-google-auth/index.html`; the served URL remains:

```text
/login/popup-google-auth/
```

In the current desktop flow, the hosted page is status UI only. It receives one of these fragments:

```text
#success
#invalid
#unavailable
```

It does not need OAuth `code`, `state`, ID tokens, access tokens, refresh tokens, or profile data.

The page also supports a direct web callback shape. If it receives `?code&state`, it renders the success state and its "Open Squigit" button builds an `org.squigit.app:/oauth2redirect/google` deep link from the current query string. If it receives `?error`, it renders the invalid state. The desktop loopback flow does not use that branch.

## PKCE

Squigit is a desktop public client. A public client cannot keep a meaningful OAuth client secret because the app binary runs on user machines.

PKCE protects the authorization code flow:

1. Squigit generates a high-entropy `code_verifier`.
2. Squigit derives `code_challenge = BASE64URL(SHA256(code_verifier))`.
3. The browser authorization request sends only the `code_challenge`.
4. The token exchange sends the original `code_verifier`.
5. Google issues tokens only if the verifier matches the earlier challenge.

This prevents a stolen authorization code from being exchanged without the verifier generated inside the app process.

Squigit records `pkce_method: "S256"` in `auth.json` as metadata for the last successful login.

## State And Nonce

`state` binds the loopback callback to the active browser attempt. A callback with the wrong state is rejected.

`nonce` binds the ID token to the active OIDC attempt. A validly signed ID token with the wrong nonce is rejected.

Both values are generated per sign-in attempt and are not stored after completion.

## Google ID Token Validation

Squigit validates the ID token locally before writing profile state.

Validation checks:

- JWT header algorithm must be `RS256`.
- JWT key id must exist in Google's JWKS.
- Signature must verify against Google's JWKS.
- Issuer must be `https://accounts.google.com` or `accounts.google.com`.
- Audience must match the configured Google client id.
- Required claims must include `exp`, `iss`, `aud`, and `sub`.
- `nonce` must match the current attempt.
- `sub` must be present and non-empty.
- `email_verified` must not be explicitly false.

After validation, Squigit canonicalizes Google's issuer to:

```text
https://accounts.google.com
```

Display claims come from the ID token when present. If email, name, or picture is missing and an access token was returned, Squigit calls OIDC UserInfo as a transient fallback. UserInfo is accepted only if its `sub` matches the validated ID token `sub`.

The Google access token and ID token are not persisted.

## OAuth Credentials

`credentials.rs` accepts Google credentials in either wrapper shape:

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

Runtime credential source order:

1. `CredentialsSource::RawJson`
2. `CredentialsSource::File`
3. `CredentialsSource::Auto`, which checks:
   - `SQUIGIT_GOOGLE_CREDENTIALS_JSON`
   - `SQUIGIT_GOOGLE_CREDENTIALS_PATH`
   - embedded build-time credentials

Build-time embedding is handled by `crates/squigit-auth/build.rs`.

Build-time credential source order:

1. `SQUIGIT_GOOGLE_CREDENTIALS_JSON`
2. `SQUIGIT_GOOGLE_CREDENTIALS_PATH`
3. `crates/squigit-auth/assets/oauth/credentials.json`

`credentials.example.json` intentionally contains placeholders and is rejected by `is_placeholder_config`.

The current product should use a Google OAuth **Desktop app** client. The Google client must allow loopback redirect URIs. The local auth flow uses a dynamic `127.0.0.1` port for each attempt.

If Google credentials include a `client_secret`, Squigit stores it only as part of the local credentials configuration. The token exchange first uses public-client PKCE fields. If Google refuses and the error mentions `client_secret`, Squigit retries with the configured secret. Do not treat this secret as a strong desktop-app secret.

## Local Storage Contract

`ProfileStore::new()` lives in `squigit-storage` and uses the app config directory from `squigit-storage`.

Root files:

```text
{base_dir}/auth.json
{base_dir}/profiles.json
{base_dir}/keys.json
{base_dir}/threads/
```

Storage owns filenames, paths, JSON read/write, and atomic writes. Auth creates values and passes them to typed storage APIs.

Writes are atomic: JSON is written to a temp file, synced, and renamed into place.

### auth.json

`auth.json` stores active auth state and the last successful provider login proof. It is not an OAuth token vault.

Example:

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
    "scope": [
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
      "https://www.googleapis.com/auth/userinfo.profile"
    ],
    "pkce_method": "S256",
    "id_token_issued_at": "2026-07-15T23:18:16Z",
    "id_token_expires_at": "2026-07-16T00:18:16Z"
  }
}
```

Fields:

- `schema`: local auth schema version. Current value is `1`.
- `auth_mode`: current value is `google_oidc_pkce`.
- `active_profile_id`: local profile id selected for the app.
- `last_login`: metadata from the last successful Google authentication. This is not updated by local profile switching.
- `audience`: Google OAuth client id.
- `scope`: scopes granted by Google during the token exchange.
- `id_token_issued_at` and `id_token_expires_at`: timestamps copied from the validated ID token.

If `auth.json` has an unsupported schema or auth mode, `ProfileStore` rejects it and the renderer logs guidance to reset the local config. The current code does not migrate legacy auth files.

### profiles.json

`profiles.json` stores profile metadata keyed by local profile id.

Example:

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

Rules:

- The map key and nested `id` must be the same canonical
  `ggl-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx` value derived from `identity`.
- `identity` is the stable account key.
- `name`, `email`, `avatar_base64`, and `avatar_url` are display data.
- `created_at` is preserved when a profile is re-authenticated.
- `last_used_at` updates when a profile is used, switched to, or logged into.
- Profiles are listed newest-first in storage APIs and sorted by name in the renderer.
- Old profile ID formats are rejected and are not migrated.

### keys.json

`keys.json` stores profile-scoped BYOK credentials. Google OAuth tokens do not belong here. Schema 1 is a clean replacement; older formats are rejected and are not migrated.

Shape:

```json
{
  "schema": 1,
  "profiles": {
    "<profile-id>": {
      "google-ai-studio": {
        "cipher": "aes-256-gcm",
        "kdf": "hkdf-sha256",
        "salt": "<32-byte-base64url-no-pad>",
        "nonce": "<12-byte-base64url-no-pad>",
        "ciphertext": "<ciphertext-with-gcm-tag>"
      }
    }
  }
}
```

Each record uses AES-256-GCM and a key derived with HKDF-SHA256 from the random `record-encryption-master-v1` value held by the OS vault. Profile and provider placement are authenticated. The file stores no plaintext-derived fingerprint, credential revision, or master-key marker.

`squigit-auth` owns key validation, encryption, decryption, vault access, and CAS credential bindings. `squigit-storage` owns strict persistence, locking, permissions, and atomic replacement.

Deleting a profile explicitly removes that profile's keys from `keys.json`. Deleting the final credential also removes the record-encryption master but retains the independent CAS binding key.

Future database migrations should stay isolated in `squigit-storage`: `profiles.json` can become profile rows and `keys.json` can become encrypted-key rows while auth continues to use typed storage methods. `auth.json` remains a separate JSON file unless a later refactor explicitly changes that contract.

## Profile Operations

### Create Or Refresh Profile

Successful Google authentication creates or updates the profile for the validated issuer and subject.

If the profile already exists:

- `created_at` is preserved.
- avatar cache is preserved when the new profile data does not include a replacement.
- `last_used_at` is updated.
- `auth.json.last_login` is replaced with the new login metadata.
- `auth.json.active_profile_id` is set to the authenticated profile.

### Switch Profile

Switching profile calls `set_active_profile_id`.

It:

- requires the target profile to exist;
- updates `auth.json.active_profile_id`;
- touches `last_used_at`;
- loads profile-scoped BYOK keys in the renderer;
- does not update `last_login`.

### Sign Out

Sign out calls `clear_active_profile_id`.

It resets `auth.json` to schema 1 defaults:

```json
{
  "schema": 1,
  "auth_mode": "google_oidc_pkce",
  "active_profile_id": null,
  "last_login": null
}
```

It preserves `profiles.json`, `keys.json`, threads, and local data.

### Delete Profile

Deleting a profile:

- refuses to delete the last remaining profile;
- removes the profile from `profiles.json`;
- removes the profile directory if present;
- removes profile-scoped keys from `keys.json`;
- changes `active_profile_id` to the newest remaining profile if needed;
- clears `last_login` if it belonged to the deleted profile.

## Hosted Status Page Behavior

The hosted status page uses the URL hash to choose copy and icon:

- `#success`: Google login was accepted, Rust finished local auth, and the browser can show the success page.
- `#invalid`: the callback reached Squigit but local auth failed.
- `#unavailable`: no meaningful status was provided.

In the current desktop loopback flow, Squigit's local server redirects to the hosted page after local auth work is done. Therefore the hosted page should normally see only hash fragments, not OAuth query parameters.

The page also has direct callback behavior for a web redirect shape: `?code&state` renders success and can open Squigit through `org.squigit.app:/oauth2redirect/google`; `?error` renders invalid.

The page has a strict CSP in `index.html`:

```text
default-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
font-src 'self' data:;
img-src 'self' data:;
connect-src 'self' ws: http:;
base-uri 'none';
form-action 'none';
frame-ancestors 'none'
```

The page is safe to host on GitHub Pages, Vercel, Next.js, or another static route as long as the path and hash behavior remain available.

## Security Properties

What is persisted:

- local profile identity metadata;
- active profile id;
- last login metadata;
- profile display data;
- encrypted BYOK keys.

What is not persisted:

- Google authorization code;
- Google access token;
- Google refresh token;
- raw Google ID token;
- PKCE verifier;
- OIDC nonce;
- OAuth state.

The hosted status page receives no code because Rust consumes the callback first and redirects with only a hash fragment.

The loopback redirect response includes:

```text
Cache-Control: no-store
Referrer-Policy: no-referrer
Connection: close
```

The local loopback server is one-shot for the active auth attempt and accepts only its expected callback path.

## Domain Migration: Moving To squigit.app

Goal: keep the same UX and flow, but replace GitHub Pages fallback URLs with the final `squigit.app` URL.

### Current Domain Selection

`callback_server.rs` currently has:

```text
SQUIGIT_APP_STATUS_PAGE_URL = https://squigit.app/login/popup-google-auth/
GITHUB_PAGES_STATUS_PAGE_URL = https://squigit-org.github.io/login/popup-google-auth/
```

At runtime, `google_auth_status_page_url()` does a HEAD probe to:

```text
https://squigit.app/
```

If the response is below HTTP 500, Squigit uses the `.app` status page. Otherwise it falls back to GitHub Pages.

This means that once `squigit.app` is live and serving HTTPS, the desktop app should automatically prefer:

```text
https://squigit.app/login/popup-google-auth/#success
```

without changing the OAuth redirect URI, because OAuth still redirects to localhost first.

### GitHub Pages Roadmap

If the existing website remains on GitHub Pages:

1. Buy `squigit.app`.
2. In the DNS provider, configure the records GitHub Pages requires for an apex domain and/or `www`.
3. In the `squigit-org.github.io` repository settings, set the Pages custom domain to `squigit.app`.
4. Enable "Enforce HTTPS" after DNS validation completes.
5. Commit a `CNAME` file at the Pages publish root containing:

   ```text
   squigit.app
   ```

6. Deploy the site.
7. Verify:

   ```text
   https://squigit.app/
   https://squigit.app/login/popup-google-auth/#success
   https://squigit.app/login/popup-google-auth/#invalid
   https://squigit.app/login/popup-google-auth/#unavailable
   ```

8. Start a desktop Google login and verify the final browser tab URL is:

   ```text
   https://squigit.app/login/popup-google-auth/#success
   ```

### Vercel Or Next.js Roadmap

If the landing page moves to Vercel or Next.js:

1. Add `squigit.app` to the hosting project.
2. Configure DNS records requested by the host.
3. Ensure the route exists exactly at:

   ```text
   /login/popup-google-auth/
   ```

4. Preserve hash-only status behavior:

   ```text
   #success
   #invalid
   #unavailable
   ```

5. Ensure this route can be served as a static/client route without server-only auth state.
6. Keep the page CSP strict.
7. Verify direct loads of all four hash states.
8. Verify the desktop auth flow.

### Google Cloud Roadmap

The desktop OAuth callback remains loopback:

```text
http://127.0.0.1:<dynamic_port>
```

Do not change the desktop app OAuth flow to a hosted web redirect unless the native flow is intentionally redesigned.

When `squigit.app` is purchased:

1. In the Google Cloud OAuth consent screen, add/verify `squigit.app` as an authorized domain if required by the consent configuration.
2. Update app homepage, privacy policy, and terms URLs to the final domain.
3. Keep the OAuth client type as Desktop app for the current architecture.
4. Ensure the credentials used by Squigit still contain:

   ```json
   {
     "installed": {
       "client_id": "...apps.googleusercontent.com",
       "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
       "token_uri": "https://oauth2.googleapis.com/token"
     }
   }
   ```

5. If a new OAuth client id is created, update the credentials source and rebuild the app so `build.rs` embeds the new credentials.

### Code Change Roadmap

Minimum code change after `squigit.app` is live:

- No code change is required if the final route remains `/login/popup-google-auth/` and `https://squigit.app/` responds below HTTP 500.

Recommended code cleanup after the domain is stable:

1. Replace the runtime HEAD probe with an explicit configuration value:

   ```text
   SQUIGIT_AUTH_STATUS_URL=https://squigit.app/login/popup-google-auth/
   ```

   or a build-time constant.

2. Remove `GITHUB_PAGES_STATUS_PAGE_URL` fallback from production builds.
3. Keep a development override for local or preview status-page testing.
4. Remove the direct web-callback branch from `src/features/auth-popup/main.tsx` if no web redirect flow uses it.
5. Remove `appCallbackUrl = 'org.squigit.app:/oauth2redirect/google'` from the hosted popup when the direct web-callback branch is removed.
6. Remove renderer `auth-success` and `auth-failure` listeners if no active host emits those events.
7. Decide whether `credentials.rs` should continue accepting both `installed` and `web`; for the current desktop client, `installed` is the expected production shape.

### Migration Verification Checklist

After the domain change:

- `https://squigit.app/` returns a non-5xx response.
- `https://squigit.app/login/popup-google-auth/#success` renders the status page.
- The desktop app opens Google sign-in normally.
- Google redirects to loopback.
- The loopback response is a `302` to `https://squigit.app/login/popup-google-auth/#success`.
- The final browser tab URL contains no OAuth `code` or `state`.
- `auth.json` contains schema 3 login metadata and no tokens.
- `profiles.json` contains the expected `issuer` and `subject`.
- Sign out clears only active auth state.
- Switching profiles does not change `last_login`.
- Deleting a non-last profile removes profile metadata and profile-scoped keys.

## Reference Map For Agents

Read these files before changing auth:

```text
crates/squigit-auth/src/auth/callback_server.rs
crates/squigit-auth/src/auth/credentials.rs
crates/squigit-auth/src/auth/google.rs
crates/squigit-auth/src/security/crypto.rs
crates/squigit-storage/src/profile/store.rs
crates/squigit-storage/src/profile/types.rs
backend/src/profile.rs
squigit-org.github.io/site/login/popup-google-auth/index.html
squigit-org.github.io/src/features/auth-popup/main.tsx
squigit-org.github.io/vite.config.ts
```

Do not infer auth behavior from the hosted page alone. The security boundary is in the native loopback callback and Rust token exchange.
