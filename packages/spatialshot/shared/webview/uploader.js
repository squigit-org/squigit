/**
 * Copyright (C) 2025  a7mddra-spatialshot
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
**/

/**
 * @file webview-uploader.js
 * @brief Auto image upload helpers for Electron <webview> pages (clipboard + paste emulation).
 *
 * These helpers automate the "paste to upload" flow inside webview guests:
 * - Host-side helpers that emulate user paste (Ctrl+V) into the focused webview
 * - Continuous paste automation until upload is detected and completed
 *
 * The module is intentionally focused on *image upload automation* (not generic clipboard utilities).
 *
 * Usage:
 * ```js
 * import {
 *   LENS_AUTOMATION_SCRIPT,
 *   sendPasteKeyEvents
 * } from './webview-uploader.js';
 *
 * webview.addEventListener('dom-ready', () => {
 *   // For Lens: inject page script to open upload UI
 *   webview.executeJavaScript(LENS_AUTOMATION_SCRIPT);
 *   
 *   // For AI Overview: continuous paste until upload completes
 *   startContinuousPasteUntilUploadComplete(webview);
 * });
 * ```
 */

/**
 * @constant LENS_AUTOMATION_SCRIPT
 * @description
 * Script injected into Google Lens pages to open the paste/upload UI and attempt an in-guest paste.
 *
 * Notes:
 * - Targets Lens-specific paste button (`.Vd9M6`) when present.
 * - Attempts `navigator.clipboard.read()` then falls back to `document.execCommand('paste')`.
 * - Small timeout gives the page time to wire up event handlers.
 *
 * This script aims to *trigger the upload dialog/paste flow inside the guest page* — it does not
 * manipulate the host clipboard or perform native paste; that is the host's responsibility.
 */
export const LENS_AUTOMATION_SCRIPT = `
  setTimeout(() => {
    const pasteButton = document.querySelector('.Vd9M6');
    if (pasteButton) pasteButton.click();
    try {
      navigator.clipboard.read().then(items => {
        document.execCommand('paste');
      }).catch(err => console.log('Clipboard read failed:', err));
    } catch (e) {
      console.log('Paste failed:', e);
    }
  }, 500);
`;

/**
 * @function sendPasteKeyEvents
 * @description
 * Emulates a user paste (Ctrl+V) inside an Electron <webview> by sending native input events to the webview.
 * This is used for continuous paste automation until upload is detected and completed.
 *
 * Important: before calling this, ensure the webview (and the guest upload input) is focused and that
 * the system clipboard contains actual image data (not just a path string).
 *
 * @param {Electron.WebviewTag} webview - The target webview element to receive key events.
 * @param {number} [delay=0] - Milliseconds to wait before sending the key sequence.
 *
 * @example
 * // Continuous paste loop for AI Overview automation
 * setInterval(() => sendPasteKeyEvents(webview), 500);
 */
export function sendPasteKeyEvents(webview, delay = 0) {
  const doPaste = () => {
    try {
      webview.focus();
      webview.sendInputEvent({ type: 'keyDown', keyCode: 'Control' });
      webview.sendInputEvent({ type: 'keyDown', keyCode: 'V', modifiers: ['control'] });
      webview.sendInputEvent({ type: 'char', keyCode: 'v', modifiers: ['control'] });
      webview.sendInputEvent({ type: 'keyUp', keyCode: 'V', modifiers: ['control'] });
      webview.sendInputEvent({ type: 'keyUp', keyCode: 'Control' });
    } catch (e) {
      console.error('Failed to send paste key events:', e);
    }
  };

  if (delay > 0) {
    setTimeout(doPaste, delay);
  } else {
    doPaste();
  }
}
