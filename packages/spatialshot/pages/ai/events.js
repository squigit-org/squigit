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

import { CaptchaDetector } from '../../shared/captcha-detector.js';
import { uploadImage } from './uploader.js';

/**
 * Sets up event listeners
 */
export function setupAIEvents(webview, overlay) {
  let pasteStarted = false;

  const startPaste = () => {
    if (pasteStarted) return;
    pasteStarted = true;
    uploadImage(webview, overlay);
  };

  webview.addEventListener('dom-ready', () => {
    console.log('AI Overview page ready');
    startPaste();
  });

  webview.addEventListener('did-finish-load', () => {
    console.log('AI Overview fully loaded');
    startPaste();
  });

  const stopMonitoring = CaptchaDetector.monitorForCaptcha(webview, (hasCaptcha, captchaType) => {
    if (hasCaptcha) {
      console.log(`Captcha detected: ${captchaType}`);
      overlay.hide();
    } else {
      console.log('Captcha solved or gone');
      overlay.show();
      webview.reload();
    }
  });

  webview.addEventListener('close', () => {
    stopMonitoring();
  });
}
