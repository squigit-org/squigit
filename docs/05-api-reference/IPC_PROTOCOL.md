# SpatialShot IPC Protocol

The `spatialshot` package uses Electron's Inter-Process Communication (IPC) to communicate between the main process and renderer processes. There are two main preload scripts that set up the IPC bridges:

1. **`source/preload.js`**: This is the primary preload script for the main `BrowserWindow`. It exposes two bridge objects: `window.electron` and `window.electronAPI`.
2. **`source/spaload.js`**: This is the preload script for the `BrowserView` that hosts the main single-page application (SPA) interface. It exposes a single bridge object, `window.ipc`.

All IPC handlers in the main process are modularized and located in the `source/ipc-handlers/` directory.

---

## Main Bridge (`preload.js`)

This bridge connects the main renderer process (the top-level window chrome and login UI) to the main process.

### `window.electron`

#### Theme

- **`onThemeChanged: (callback) => void`**: Listens for theme changes from the main process. The callback receives the new theme (`"light"` or `"dark"`).
- **`themeApplied: () => void`**: Notifies the main process that the theme has been applied, which is a signal to show the window.
- **`toggleSettings: () => void`**: Sends a request to toggle the visibility of the settings panel in the SPA view.

#### Image Handling

- **`onImagePath: (callback) => void`**: Receives the path to an image file from the main process.
- **`onImageData: (callback) => void`**: (Not implemented in preload, but may be used elsewhere) Receives image data.
- **`sendImagePath: (path) => void`**: Sends the path of a user-selected image file to the main process.
- **`openFileDialog: () => Promise<string>`**: Invokes a native file open dialog and returns the selected image path.

#### Window Controls

- **`closeWindow: () => void`**: Closes the window.
- **`minimizeWindow: () => void`**: Minimizes the window.
- **`maximizeWindow: () => void`**: Maximizes or un-maximizes the window.
- **`setMainViewBounds: (rect) => void`**: Tells the main process to set the bounds of the SPA `BrowserView`.
- **`hideMainView: () => void`**: Tells the main process to hide the SPA `BrowserView`.

#### Authentication

- **`startAuth: () => void`**: Initiates the Google OAuth2 authentication flow.
- **`onAuthResult: (callback) => void`**: Listens for the result of the authentication process. The callback receives a `{ success: boolean, error?: string }` object.
- **`checkAuthStatus: () => Promise<boolean>`**: Checks if the user is already authenticated (i.e., if key and profile files exist).
- **`byokLogin: () => void`**: Signals a successful "Bring Your Own Key" login.
- **`checkFileExists: (fileName) => Promise<boolean>`**: Checks if a file exists in the user data directory.
- **`openExternalUrl: (url) => void`**: Opens a URL in the user's default browser.

#### Bring Your Own Key (BYOK)

- **`startClipboardWatcher: () => Promise<any>`**: Starts watching the clipboard for an API key.
- **`stopClipboardWatcher: () => Promise<void>`**: Stops the clipboard watcher.
- **`onClipboardText: (callback) => void`**: Listens for clipboard text that matches an API key format.
- **`encryptAndSave: (data) => Promise<any>`**: Sends a plaintext key to be encrypted and saved. `data` is `{ plaintext: string, provider: 'gemini' | 'imgbb' }`.

### `window.electronAPI`

This is a secondary bridge for less critical or more focused APIs.

- **`toggleTheme: () => void`**: Sends a request to toggle the theme.
- **`clearCache: () => void`**: Clears the Electron session cache.
- **`logout: () => void`**: Logs the user out, deleting credentials and resetting the view.
- **`resetAPIKey: () => void`**: Deletes the saved API key file.
- **`getUserData: () => Promise<object|null>`**: Retrieves user profile information from `profile.json`.
- **`openExternal: (url) => void`**: Opens an external URL.

---

## SPA Bridge (`spaload.js`)

This bridge connects the main application view (the SPA loaded in a `BrowserView`) to the main process.

### `window.ipc`

#### Image and Session

- **`onImagePath: (callback) => void`**: Receives the current image path from the main process.
- **`readImageFile: (path) => Promise<{ base64: string, mimeType: string }>`**: Requests the main process to read an image file and return its Base64-encoded content and MIME type.
- **`getSessionPath: () => Promise<string>`**: Gets the image path from the current session.
- **`getUserData: () => Promise<object|null>`**: Gets the current user's profile data.

#### Prompts, Models, and API Keys

- **`getPrompt: () => Promise<string>`**: Gets the current default prompt.
- **`savePrompt: (prompt) => Promise<void>`**: Saves a new default prompt.
- **`resetPrompt: () => Promise<string>`**: Resets the prompt to its default value.
- **`getModel: () => Promise<string>`**: Gets the current model.
- **`saveModel: (model) => Promise<void>`**: Saves a new default model.
- **`resetModel: () => Promise<string>`**: Resets the model to its default value.
- **`getApiKey: () => Promise<string>`**: Requests the decrypted Gemini API key.

#### UI and Feedback

- **`onToggleSettings: (callback) => void`**: Listens for the event to toggle the settings panel.
- **`onShowFeedbackFromMain: (callback) => void`**: Receives feedback messages (e.g., "cache cleared") to be displayed in the UI.
- **`setTheme: (theme) => void`**: Sends a request to change the application theme.
- **`onThemeChanged: (callback) => void`**: Listens for theme changes.

#### System and External

- **`logout: () => void`**: Triggers the logout process.
- **`resetAPIKey: () => Promise<void>`**: Triggers the API key reset process.
- **`clearCache: () => void`**: Triggers clearing the cache.
- **`openExternalUrl: (url) => void`**: Opens an external URL.
- **`showUnsavedChangesAlert: () => Promise<'save'|'dont-save'>`**: Shows a dialog to confirm saving unsaved changes.
- **`triggerLensSearch: () => Promise<void>`**: Initiates the "Open in Lens" feature, which involves uploading the image to ImgBB and opening a Google Lens URL.
