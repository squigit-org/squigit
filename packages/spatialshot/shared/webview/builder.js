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
 * shared/webview-builder.js
 *
 * createWebview(src, preferences={}, opts={})
 * - returns { container, webview }
 * - the container includes a loading overlay that acts as a canvas-level splash
 * - webview gets: _safeReload(), showSplash(), hideSplash(), initialRenderDone flag
 */

export class WebviewBuilder {
  static defaultOverlayHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
    </div>
  `;

  /**
   * Create a wrapped webview (container + overlay).
   * opts:
   *  - overlay: true|false (default true)
   *  - overlayHTML: custom inner HTML for overlay
   *  - maxInitialTimeout: number ms to auto-hide if nothing happens (default 8000)
   *  - blockInputsOnSplash: boolean (default true)
   */
  static createWebview(src, preferences = {}, opts = {}) {
    const {
      partition = null,
      overlay = true,
      overlayHTML = WebviewBuilder.defaultOverlayHTML,
      maxInitialTimeout = 8000,
      blockInputsOnSplash = true,
    } = opts;

    const container = document.createElement('div');
    container.className = 'web-container';

    let overlayEl = null;
    if (overlay) {
      overlayEl = document.createElement('div');
      overlayEl.className = 'loading-overlay';
      overlayEl.innerHTML = overlayHTML;
      overlayEl.style.pointerEvents = blockInputsOnSplash ? 'auto' : 'none';

      container.appendChild(overlayEl);
    }

    const webview = document.createElement('webview');
    webview.src = src;
    if (partition) {
      webview.setAttribute('partition', partition);
    }
    webview.className = 'web-container';
    webview.setAttribute('allowpopups', '');
    webview.setAttribute('webpreferences', 'contextIsolation=no');

    Object.keys(preferences).forEach(key => {
      webview.setAttribute(key, preferences[key]);
    });

    container.appendChild(webview);

    attachSharedBehavior(webview, overlayEl, { maxInitialTimeout, blockInputsOnSplash });

    return { container, webview };
  }

  static createLensWebview() {
    return this.createWebview(
      'https://lens.google.com/search?ep=subb&re=df&s=4&hl=en&gl=US',
      {},
      { overlay: true, partition: 'persist:google' }
    );
  }

  static createAIWebview() {
    return this.createWebview(
      'https://www.google.com/search?udm=50&aep=11&hl=en',
      {},
      { overlay: false, partition: 'persist:google' }
    );
  }
}

/**
 * attachSharedBehavior(webview, overlayEl, opts)
 * - sets up dom-ready / did-first-paint / did-finish-load handlers
 * - provides _safeReload (shows overlay then reloads)
 * - exposes showSplash() / hideSplash() helpers
 */
export function attachSharedBehavior(webview, overlayEl = null, opts = {}) {
  const { maxInitialTimeout = 8000, blockInputsOnSplash = true } = opts;

  webview.initialRenderDone = false;
  webview._isReloading = false;

  webview._clearCache = async function () {
    const partition = webview.getAttribute('partition');
    if (partition) {
      return await window.electronAPI.clearWebviewCache(partition);
    }
    return false;
  };

  webview.showSplash = function () {
    if (!overlayEl) return;
    overlayEl.classList.add('active');
    overlayEl.style.opacity = '1';
    overlayEl.style.display = 'flex';
    overlayEl.style.pointerEvents = blockInputsOnSplash ? 'auto' : 'none';
  };

  webview.hideSplash = function () {
    if (!overlayEl) return;
    if (!overlayEl.classList.contains('active')) return;
    overlayEl.classList.remove('active');
    overlayEl.style.opacity = '0';
    setTimeout(() => {
      overlayEl.style.display = 'none';
      overlayEl.style.pointerEvents = 'none';
    }, 300);
  };

  webview._safeReload = function () {
    webview._isReloading = true;
    webview.showSplash();
    try {
      webview.reload();
    } catch (err) {
      webview.src = webview.getAttribute('src') || webview.src;
    }
  };

  webview.showSplash();

  const timeoutId = setTimeout(() => {
    if (!webview.initialRenderDone) {
      webview.hideSplash();
      webview.initialRenderDone = true;
      webview._isReloading = false;
    }
  }, maxInitialTimeout);

  function onFirstRender() {
    if (!webview.initialRenderDone || webview._isReloading) {
      webview.hideSplash();
      webview.initialRenderDone = true;
      webview._isReloading = false;
      clearTimeout(timeoutId);
    }
  }

  webview.addEventListener('dom-ready', () => {
    onFirstRender();
  });

  webview.addEventListener('did-first-paint', () => {
    onFirstRender();
  });

  webview.addEventListener('did-finish-load', () => {
    onFirstRender();
  });

}
