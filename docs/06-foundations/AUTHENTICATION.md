# Authentication Foundation

> Status: **Ratified for schema 2**
>
> Purpose: canonical account of Squigit's local-first federated identity model.

## Summary

Squigit uses Google only to bootstrap a local profile identity. The app is an Electron public client and OpenID Connect relying party: it opens the system browser, receives an authorization code through an app callback, protects the exchange with PKCE S256, validates Google's signed ID token, and keys the local profile by Google issuer plus subject.

After validation, normal app use is local. Profiles, settings, chats, and BYOK credentials stay on the device. Squigit does not store Google access tokens, refresh tokens, or raw ID tokens for the current product surface.

This is a fresh schema break. Old `auth.json` and `profiles.json` files are not migrated, normalized, or read as legacy data. Users with old local auth files must delete the Squigit config folder or reinstall before using the new auth model.

## Storage Contract

`auth.json` is the active-profile and last-provider-login lock. It is not a profile directory and not an OAuth token vault.

```json
{
  "schema": 2,
  "auth_mode": "google_oidc_pkce",
  "active_profile_id": "google_3d09c4f2b64a1b0e9b35d7f5d9c01a77",
  "last_login": {
    "profile_id": "google_3d09c4f2b64a1b0e9b35d7f5d9c01a77",
    "provider": "google",
    "issuer": "https://accounts.google.com",
    "subject": "10769150350006150715113082367",
    "authenticated_at": "2026-07-15T12:00:00Z",
    "audience": "<google-client-id>",
    "scope": ["openid", "profile", "email"],
    "pkce_method": "S256",
    "id_token_issued_at": "2026-07-15T12:00:00Z",
    "id_token_expires_at": "2026-07-15T13:00:00Z"
  }
}
```

`profiles.json` stores display metadata and immutable provider identity. Profile ids are filesystem-safe OIDC ids:

```text
google_<first 32 hex chars of BLAKE3(canonical_iss + "\0" + sub)>
```

Email, name, and avatar are display attributes only. They are never profile keys.

`keys.json` stores encrypted BYOK credentials by profile id and provider. Google OAuth tokens never belong there.

## Auth Flow

Each Google attempt generates:

- `state` to bind the callback to the browser attempt.
- `nonce` to bind the ID token to the attempt.
- `code_verifier` and S256 `code_challenge` for PKCE.

The authorization request uses:

- `response_type=code`
- `scope=openid profile email`
- `access_type=online`
- `prompt=select_account`
- `code_challenge_method=S256`
- `redirect_uri=org.squigit.app:/oauth2redirect/google` when `squigit.app` resolves
- `redirect_uri=com.googleusercontent.apps.<client-id-prefix>:/oauth2redirect/google` when `squigit.app` does not resolve yet

The token exchange sends `client_id`, authorization `code`, `redirect_uri`, `grant_type=authorization_code`, and `code_verifier`. A bundled `client_secret` may exist in downloaded Google credentials, but Squigit does not rely on it because desktop apps are public clients.

The hosted status page prefers `https://squigit.app/login/popup-google-auth/` when `squigit.app` resolves and falls back to `https://squigit-org.github.io/login/popup-google-auth/` otherwise. It is status UI only and never receives OAuth codes, state, ID tokens, access tokens, or refresh tokens.

## Validation

Before creating or activating a profile, Squigit validates the Google ID token locally:

- signature against Google's JWKS;
- `alg=RS256`;
- `iss` is Google;
- `aud` matches the configured client id;
- `exp` is valid;
- `nonce` matches the current attempt;
- `sub` is present and non-empty;
- `email` is present, and `email_verified` is not explicitly false.

Display claims come from the ID token. OIDC UserInfo is used only as a transient fallback when display claims are missing, and its `sub` must match the validated ID token.

## Local Semantics

Google login creates or updates the matching local profile, records `last_login`, and sets `active_profile_id`.

Switching profiles is local state. It updates `active_profile_id` and must not be described as fresh Google authentication.

Logout clears `active_profile_id` and `last_login`. It preserves local profiles, chats, and BYOK credentials.

Deleting a profile removes that profile metadata and its BYOK keys. Shared chats remain global/local according to storage design and are not scoped by Google identity.

## References

- [Google OAuth 2.0 for Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [RFC 8252: OAuth 2.0 for Native Apps](https://datatracker.ietf.org/doc/html/rfc8252)
- [RFC 7636: Proof Key for Code Exchange](https://datatracker.ietf.org/doc/html/rfc7636)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0-18.html)
