# SpatialShot Configuration

The `spatialshot` package offers several configuration options, from build-time settings to user-specific preferences that are managed dynamically at runtime.

## Runtime Configuration Files

At runtime, SpatialShot creates and manages several configuration and data files in the user's data directory. The location of this directory varies by operating system:

- **Windows**: `%LOCALAPPDATA%\\Spatialshot`
- **macOS**: `~/Library/Application Support/Spatialshot`
- **Linux**: `~/.local/share/spatialshot`

### `preferences.json`

This file stores user-specific preferences. It is created and managed by the functions in `source/utilities.js`.

- **`theme`**: The application theme. Can be `"light"` or `"dark"`.
- **`prompt`**: The default prompt to use for analysis.
- **`model`**: The Gemini model to use (e.g., `"gemini-2.5-flash"`).

The application has default values for these settings, which are defined in `source/constants.js`:

```javascript
module.exports = {
  APP_DEFAULTS: {
    theme: "dark",
    language: "en-US",
    prompt:
      "Analyze this image and provide a detailed description.",
    model: "gemini-2.5-flash",
  },
};
```

### `session.json`

This file stores temporary session information, primarily the path to the last image that was being viewed.

- **`imagePath`**: The absolute path to the last image file opened.

### Key Storage (`*_key.json`)

API keys are stored in encrypted files within the user data directory. The encryption uses `AES-256-GCM` with a key derived from a stable, machine-specific passphrase.

- **`gemini_key.json`**: Stores the encrypted Google Gemini API key.
- **`imgbb_key.json`**: Stores the encrypted ImgBB API key, used for the "Open in Lens" feature.

### User Profile (`profile.json`)

When a user authenticates with Google, their basic profile information is stored here to maintain the session.

- **`name`**: The user's display name.
- **`email`**: The user's email address.
- **`avatar`**: A URL to the user's profile picture.
