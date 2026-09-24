# Squigit guide

Squigit captures part of a screen, extracts text locally with PaddleOCR, and can ask Gemini to explain the image. A full image thread begins with a capture or pasted image. Side Chat begins with a text question and does not have an initial screenshot. The desktop app and CLI share one local store, but their interfaces differ.

## Start an image thread

On Home, choose **Squiggle it** to capture a region, **Paste an image** to use the clipboard, or drop an image on the page. A supported screenshot can also be pasted from another snipping tool. The new thread keeps the original image; follow up in its composer to ask about specific details. Squigit generates a short title for the image. If OCR is enabled and its engine is installed, the image gets a selectable text layer. OCR works locally even without an AI key. The initial AI analysis requires a configured Google AI Studio key.

The global Capture shortcut is shown in **Settings → Keyboard Shortcuts**. On Linux the setup wizard also names **Super + Shift + A**. The capture tool can draw a region in traditional or Squiggle mode; change that under **Settings → General → Capture type**.

## Side Chat

Use **Open Side Chat** on Home for a quick text question. Its first message starts the conversation and supplies the title. Side Chat has no original image, but the composer can attach files or images. To discuss an entire screenshot from the start, create an image thread from Home instead.

## Composer and attachments

Type in the composer and send. The **+** menu offers **Add photos or files**, **Keep Progress** for another capture into the current conversation, and mention options when a thread is active. You can paste or drop supported files. Attachments show a preparation state before send. A failed attachment needs to be removed or retried before the message can go out. The model picker changes the model and effort for the conversation; **Settings → General → AI features** changes defaults for later sessions. The web search option in the composer requests current sources for a particular message. Stop interrupts an in-progress answer.

Uploaded media is stored locally as a content-addressed object and sent directly to Google AI Studio through its Files API for AI questions. The provider's file handle expires, so Squigit can upload again when a later message needs the file. Local text attachments can be read without a Files API upload. The attachment list in a thread helps Squigit refer back to files by name and brief. An image thread includes its original screenshot in that list.

## Optional skill catalog

Type `@skills` in a message to see the installed catalog. Include `@skill/ID` in a question to request one named skill, for example `@skill/bug-triage`. Squigit reads only requested skill files for that turn. The catalog includes guidance for screen reading, documents, troubleshooting, and Windows, macOS, and Linux.

## Threads, gallery, and navigation

The Explorer lists image threads, workspaces, and Side Chats. A workspace groups threads and provides directories for file mentions. The gallery shows captured images. Rename, pin, group, fork, and delete controls are available through the related thread or Explorer menus. A fork preserves the conversation history at the fork point. When a tab has been closed, use the restore closed tab command shown in Keyboard Shortcuts.

## Settings

- **General:** tray icon, open on startup, image OCR, capture style, default AI model and effort, OCR language.
- **Appearance:** light, dark, or system theme; code editor theme and minimap; terminal color theme.
- **API Keys:** configure the Google AI Studio key used for Gemini and the optional ImgBB key used by reverse image search. The key is encrypted locally and can only be revealed through the dedicated control.
- **Models:** download or remove OCR language models. OCR engine installation is offered from General when needed.
- **Persona:** shared personal instructions stored locally in `RULES.md`.
- **Keyboard Shortcuts:** authoritative list of current global, app, editor, and composer keys. Check this screen instead of guessing a platform shortcut.
- **Send Feedback:** app feedback entry point.

## Privacy and troubleshooting

Conversation history, OCR annotations, and attachment metadata live on the user's device. OCR runs on the device. AI prompts and files go directly to the selected provider when AI features are used; Squigit does not operate a prompt proxy. Reverse image search is different: it uses ImgBB to create a public image URL for Google Lens, so avoid it for sensitive images. If Gemini cannot answer, check the active profile and Google AI Studio key in API Keys, network access, and the selected model. A provider rate limit or high-demand response may require another model or waiting for quota recovery. If OCR is unavailable, use the install control in General and verify that an OCR language model is present under Models.

## CLI

The CLI uses the same local profiles, settings, threads, CAS objects, and OCR data. Start it with `squigit`; `squigit --home PATH` selects an isolated application root. `/model` changes the session model, effort, or OCR language; `/settings` changes persisted defaults. Entering ordinary text without an image thread starts or continues a Side Chat. File mentions are resolved when the message is sent. The CLI has no Electron-only capture UI.
