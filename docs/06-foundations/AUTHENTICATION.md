# Authentication Foundation

Status: **schema 2, Google OIDC PKCE, desktop loopback flow**

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
google_<first 32 hex chars of BLAKE3(canonical_iss + "\0" + sub)>
```

Email, name, and avatar are display attributes. They can change and are never used as the stable account key.

## System Pieces

### Native Auth Crate

`crates/squigit-auth/` owns the local authentication model.

Important files:

- `src/auth/callback_server.rs`: auth settings, localhost loopback server, hosted status page URL selection, and HTTP 302 redirect response.
- `src/auth/credentials.rs`: Google OAuth credential loading and validation.
- `src/auth/google.rs`: PKCE generation, Google authorization URL construction, callback validation, token exchange, ID token validation, profile creation/update, avatar hydration.
- `src/store/profile_store.rs`: `auth.json`, `profiles.json`, `keys.json`, active profile state, profile CRUD, schema validation.
- `src/types/profile.rs`: schema constants, profile identity, profile id derivation, `LastLogin`.
- `src/security/api_keys.rs` and `src/security/crypto.rs`: profile-scoped BYOK validation and encrypted key storage.
- `build.rs`: embeds OAuth credentials into the Rust build when configured.

### NAPI Bridge

`crates/napi-bridge/src/profile.rs` exposes auth/profile functions to Electron:

- `start_google_auth`
- `cancel_google_auth`
- `get_profile_snapshot`
- `set_active_profile`
- `delete_profile`
- `hydrate_avatar`
- `encrypt_and_save_api_key`
- `get_decrypted_key`

`start_google_auth` is the main bridge between the renderer and `squigit-auth`.

### Desktop IPC

`apps/desktop/src/ipc/features/profiles.ts` maps Electron IPC commands to NAPI exports.

`apps/renderer/src/platform/electron/commands.ts` wraps those IPC calls for React. It also normalizes native profile field names so renderer code can safely consume `avatar_base64` and `avatar_url`.

### Hosted Auth Status Page

The hosted page lives in:

```text
squigit-org.github.io/login/popup-google-auth/index.html
squigit-org.github.io/src/auth-popup/main.tsx
squigit-org.github.io/src/auth-popup/styles.css
```

The Vite website build registers this route as the `authPopup` entry in `squigit-org.github.io/vite.config.ts`.

In the current desktop flow, the hosted page is status UI only. It receives one of these fragments:

```text
#complete
#cancelled
#invalid
#unavailable
```

It does not need OAuth `code`, `state`, ID tokens, access tokens, refresh tokens, or profile data.

The file still contains a `handoff` branch for a direct `?code&state` web callback shape. The desktop loopback flow does not use that branch.

### Renderer Auth Surfaces

Auth UI is split across several renderer files:

- `AuthButton.tsx`: reusable Google sign-in button with redirecting, retry, success, and cancel states.
- `AccountSwitcher.tsx`: active account avatar, account switcher dropdown, add-account action, sign-out action, profile deletion, and in-progress auth indicator.
- `AuthStep.tsx`: first-run wizard auth step. Starts Google sign-in, waits for the native result, switches to the returned profile, and shows success/error state.
- `useSystemAuth.ts`: starts/cancels native auth from React and retries after stale in-progress state.
- `useSystemSync.ts`: loads profile snapshots, hydrates avatars, loads profile-scoped API keys, switches profiles, signs out, deletes profiles.
- `TitleBar.tsx`: chooses between `AuthButton` and `AccountSwitcher` depending on whether an active profile exists.
- `useApp.ts`: after `system.addAccount()` returns a profile id, switches the app to that profile and resets the session when needed.

## End-to-End Sign-In Flow

1. The user clicks a Google sign-in entry point.

   This can happen from:

   - `AuthButton` in the title bar when no profile is active.
   - `AccountSwitcher` via "Add another account".
   - `AuthStep` during onboarding.

2. React calls `system.addAccount()`.

   `useSystemSync` exposes `addAccount` from `useSystemAuth`.

3. `useSystemAuth.addAccount()` marks `switchingProfileId` as `creating_account`.

   This gives the UI a single shared "auth is in progress" state. `AccountSwitcher` can use this to show a spinner or cancel affordance.

4. `useSystemAuth.addAccount()` calls `commands.startGoogleAuth()`.

   In Electron, this invokes IPC command `start_google_auth`, which calls NAPI export `start_google_auth`.

5. NAPI creates a temporary loopback server.

   `LoopbackAuthServer::bind()` listens on:

   ```text
   http://127.0.0.1:<random_port>
   ```

   The port is allocated by the OS. This prevents fixed-port collisions and allows cancellation/retry to recover cleanly.

6. NAPI injects the loopback URL into `AuthFlowSettings.redirect_uri`.

   The authorization request uses the exact loopback redirect URI for the current attempt.

7. `begin_google_auth_flow()` creates a Google authorization URL.

   It generates:

   - `state`
   - `nonce`
   - `code_verifier`
   - S256 `code_challenge`

   The authorization URL includes:

   ```text
   response_type=code
   scope=openid profile email
   access_type=online
   prompt=select_account
   state=<random>
   nonce=<random>
   code_challenge=<S256(code_verifier)>
   code_challenge_method=S256
   redirect_uri=http://127.0.0.1:<random_port>
   ```

8. The native opener launches the system browser.

   On Linux, NAPI uses `xdg-open` with Electron-related environment variables removed. On other platforms it uses the `webbrowser` crate.

9. The user completes Google sign-in in the browser.

10. Google redirects the same browser tab to the loopback URL.

    The callback looks like:

    ```text
    http://127.0.0.1:<random_port>/?state=<state>&code=<code>&scope=...
    ```

    The local server accepts only requests whose scheme, host, port, and path match the active loopback redirect URI.

11. Rust completes the provider login before responding to the browser.

    `complete_google_auth_flow()`:

    - verifies the callback URL matches the expected redirect URI;
    - checks `state`;
    - extracts the authorization code;
    - exchanges the code with Google using `code_verifier`;
    - validates the Google ID token;
    - creates or updates the local profile;
    - writes `auth.json` and `profiles.json`;
    - returns `AuthSuccessData` to NAPI.

12. Rust redirects the browser tab to the hosted status page.

    After Rust finishes the token exchange and local persistence, it sends:

    ```http
    HTTP/1.1 302 Found
    Location: https://squigit-org.github.io/login/popup-google-auth/#complete
    Connection: close
    Cache-Control: no-store
    Referrer-Policy: no-referrer
    ```

    If `squigit.app` is available, the status URL becomes:

    ```text
    https://squigit.app/login/popup-google-auth/#complete
    ```

    For cancellation and failure states, the fragment is `#cancelled` or `#invalid`.

    This makes the existing OAuth tab navigate in place to Squigit's hosted page. The hosted page never receives the OAuth code.

13. NAPI resolves `start_google_auth()`.

    On success it returns:

    ```ts
    {
      id: string;
      name: string;
      email: string;
      avatarBase64?: string;
      avatarUrl?: string;
    }
    ```

14. React switches to the returned profile.

    `useApp.handleAddAccount()` calls `system.switchProfile(result.id)` unless the wizard is already handling the transition. Switching profiles is local state. It is not a fresh Google authentication.

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

or:

```json
{
  "web": {
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
4. `apps/desktop/src/data/credentials.json`

`credentials.example.json` intentionally contains placeholders and is rejected by `is_placeholder_config`.

The current product should use a Google OAuth **Desktop app** client. The Google client must allow loopback redirect URIs. The local auth flow uses a dynamic `127.0.0.1` port for each attempt.

If Google credentials include a `client_secret`, Squigit stores it only as part of the local credentials configuration. The token exchange first uses public-client PKCE fields. If Google refuses and the error mentions `client_secret`, Squigit retries with the configured secret. Do not treat this secret as a strong desktop-app secret.

## Local Storage Contract

`ProfileStore::new()` uses the app config directory from `squigit-storage`.

Root files:

```text
{base_dir}/auth.json
{base_dir}/profiles.json
{base_dir}/keys.json
{base_dir}/threads/
```

Writes are atomic: JSON is written to a temp file, synced, and renamed into place.

### auth.json

`auth.json` stores active auth state and the last successful provider login proof. It is not an OAuth token vault.

Example:

```json
{
  "schema": 2,
  "auth_mode": "google_oidc_pkce",
  "active_profile_id": "google_3d09c4f2b64a1b0e9b35d7f5d9c01a77",
  "last_login": {
    "profile_id": "google_3d09c4f2b64a1b0e9b35d7f5d9c01a77",
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

- `schema`: local auth schema version. Current value is `2`.
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
  "google_3d09c4f2b64a1b0e9b35d7f5d9c01a77": {
    "id": "google_3d09c4f2b64a1b0e9b35d7f5d9c01a77",
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

- `identity` is the stable account key.
- `name`, `email`, `avatar_base64`, and `avatar_url` are display data.
- `created_at` is preserved when a profile is re-authenticated.
- `last_used_at` updates when a profile is used, switched to, or logged into.
- Profiles are listed newest-first in storage APIs and sorted by name in the renderer.

### keys.json

`keys.json` stores profile-scoped BYOK credentials. Google OAuth tokens do not belong here.

Shape:

```json
{
  "<profile-id>": {
    "google ai studio": {
      "version": 1,
      "algo": "aes-256-gcm",
      "sha256": "<plaintext-sha256>",
      "salt": "<base64>",
      "iv": "<base64>",
      "tag": "<base64>",
      "ciphertext": "<base64>"
    }
  }
}
```

The encryption key is derived locally with PBKDF2-HMAC-SHA256 from a stable passphrase based on the user's home directory path. This is device-local protection for BYOK values, not a replacement for OS keychain isolation.

Deleting a profile removes that profile's keys from `keys.json`.

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

It resets `auth.json` to schema 2 defaults:

```json
{
  "schema": 2,
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

## Renderer Behavior

### AuthButton

`AuthButton.tsx` is a reusable visual control.

States:

- `idle`: starts sign-in on click.
- `redirecting`: shows redirecting state while native auth is in progress.
- `awaiting`: disabled state used by the wizard after auth returns while profile switching completes.
- `success`: button is inert.
- `error`: can show retry when hovered.

Outside the wizard, hovering during `redirecting` can expose cancel behavior. The wizard uses a separate custom action for cancel/retry.

### useSystemAuth

`useSystemAuth.ts` owns the renderer-side start/cancel wrapper.

`addAccount()`:

- increments a global attempt id;
- sets `switchingProfileId` to `creating_account`;
- cancels a previous background flow before retrying;
- calls `commands.startGoogleAuth()`;
- retries after errors that look like stale in-progress auth or port binding failure;
- logs missing credential configuration only once;
- clears `switchingProfileId` only if the attempt is still current.

`cancelAuth()`:

- calls `commands.cancelGoogleAuth()`;
- clears `switchingProfileId`.

The `auth-failure` listener exists for compatibility with event-based surfaces. The current Electron path primarily uses the `startGoogleAuth()` promise result.

### AuthStep

`AuthStep.tsx` is the onboarding step.

Flow:

1. Starts at `success` if `app.system.activeProfile` already exists, otherwise `idle`.
2. On login, sets state to `redirecting`.
3. Calls `app.system.addAccount()`.
4. If native auth returns a profile, sets state to `awaiting`.
5. Switches to `result.id`.
6. Shows "Logged in as ..." and transitions to `success`.
7. If auth returns no result, shows `error`.

The wizard uses `setCustomAction` to expose Cancel, Retry, or disabled Next actions depending on auth state.

### AccountSwitcher

`AccountSwitcher.tsx` appears when an active profile exists.

It:

- shows the active profile avatar;
- lists all local profiles;
- switches to another profile;
- starts "Add another account";
- shows in-progress auth state while `switchingProfileId === "creating_account"`;
- supports canceling Google sign-in from the trigger hover state;
- signs out without deleting profiles;
- deletes non-active profiles through a confirmation dialog.

The active profile cannot be deleted from the row because that row shows the active check icon instead of a delete button.

### useSystemSync

`useSystemSync.ts` binds profile storage to app state.

On startup:

- loads preferences;
- loads profile snapshot;
- applies active profile to UI state;
- loads profile-scoped BYOK keys for the active profile;
- clears keys if there is no active profile;
- hydrates missing avatars in the background.

On profile switch:

- sets switching state;
- writes `active_profile_id`;
- reloads profile data;
- refreshes wizard agreement state;
- clears switching state.

On logout:

- clears active profile through IPC;
- clears active profile UI state;
- clears BYOK key state;
- resets startup image and session title.

The `auth-success` listener exists for event-based auth completion. The current Electron flow uses the returned `startGoogleAuth()` result through `handleAddAccount()`.

## Hosted Status Page Behavior

The hosted status page uses the URL hash to choose copy and icon:

- `#complete`: Google login was accepted and Squigit is finishing locally or has finished locally.
- `#cancelled`: user denied/cancelled Google sign-in.
- `#invalid`: the callback reached Squigit but local auth failed.
- `#unavailable`: no meaningful status was provided.
- `handoff`: legacy/direct web callback shape when `?code` or `?error` appears with `state`.

In the current desktop loopback flow, Squigit's local server redirects to the hosted page after local auth work is done. Therefore the hosted page should normally see only hash fragments, not OAuth query parameters.

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
https://squigit.app/login/popup-google-auth/#complete
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
   https://squigit.app/login/popup-google-auth/#complete
   https://squigit.app/login/popup-google-auth/#cancelled
   https://squigit.app/login/popup-google-auth/#invalid
   ```

8. Start a desktop Google login and verify the final browser tab URL is:

   ```text
   https://squigit.app/login/popup-google-auth/#complete
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
   #complete
   #cancelled
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
4. Remove the legacy `handoff` branch from `src/auth-popup/main.tsx` if no web redirect flow uses it.
5. Remove `appCallbackUrl = 'org.squigit.app:/oauth2redirect/google'` from the hosted popup when the `handoff` branch is removed.
6. Remove renderer `auth-success` and `auth-failure` listeners if no active platform emits those events.
7. Decide whether `credentials.rs` should continue accepting both `installed` and `web`; for the current desktop client, `installed` is the expected production shape.

### Migration Verification Checklist

After the domain change:

- `https://squigit.app/` returns a non-5xx response.
- `https://squigit.app/login/popup-google-auth/#complete` renders the status page.
- The desktop app opens Google sign-in normally.
- Google redirects to loopback.
- The loopback response is a `302` to `https://squigit.app/login/popup-google-auth/#complete`.
- The final browser tab URL contains no OAuth `code` or `state`.
- `auth.json` contains schema 2 login metadata and no tokens.
- `profiles.json` contains the expected `issuer` and `subject`.
- Sign out clears only active auth state.
- Switching profiles does not change `last_login`.
- Deleting a non-last profile removes profile metadata and profile-scoped keys.

## Current Cleanup Roadmap

These are cleanup candidates for auth maintainers. They are not required for the current working flow.

1. Make the status page URL explicit.

   The `.app` HEAD probe plus GitHub Pages fallback is useful during pre-domain development, but production should prefer a deterministic configured URL.

2. Remove unused event listeners.

   The current Electron auth path resolves `startGoogleAuth()` directly. `auth-success` and `auth-failure` listeners are present in renderer hooks but are not the main completion mechanism.

3. Remove legacy hosted-page handoff code.

   The current desktop flow does not send OAuth query params to the hosted page. If no future web flow needs `?code&state`, remove `handoffUrl`, `oauthCallbackParams`, and the custom-scheme `appCallbackUrl`.

4. Decide credential shape policy.

   Keeping `installed` and `web` support is flexible, but the current architecture expects a desktop OAuth client. If future agents refactor credentials, they should not change the loopback OAuth architecture without updating this document.

5. Tighten hosted-page copy.

   Because the local 302 happens after Rust finishes local auth, `#complete` can safely say the sign-in is complete rather than still finishing.

## Reference Map For Agents

Read these files before changing auth:

```text
crates/squigit-auth/src/auth/callback_server.rs
crates/squigit-auth/src/auth/credentials.rs
crates/squigit-auth/src/auth/google.rs
crates/squigit-auth/src/store/profile_store.rs
crates/squigit-auth/src/types/profile.rs
crates/napi-bridge/src/profile.rs
apps/desktop/src/ipc/features/profiles.ts
apps/renderer/src/platform/electron/commands.ts
apps/renderer/src/hooks/system/useSystemAuth.ts
apps/renderer/src/hooks/system/useSystemSync.ts
apps/renderer/src/app/layout/frame/AuthButton.tsx
apps/renderer/src/app/layout/frame/AccountSwitcher.tsx
apps/renderer/src/app/router/routes/WizardRoute/steps/AuthStep/AuthStep.tsx
squigit-org.github.io/login/popup-google-auth/index.html
squigit-org.github.io/src/auth-popup/main.tsx
squigit-org.github.io/vite.config.ts
```

Do not infer auth behavior from the hosted page alone. The security boundary is in the native loopback callback and Rust token exchange.
