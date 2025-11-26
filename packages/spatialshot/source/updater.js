/**
 * @license
 * Copyright 2025 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

const { app } = require('electron');
const axios = require('axios');

const CHANGELOG_URL = 'https://raw.githubusercontent.com/a7mddra/spatialshot/main/CHANGELOG.md';

function checkForUpdates(dialogs) {
  const currentVersion = app.getVersion(); 
  
  const urlWithCacheBuster = `${CHANGELOG_URL}?t=${Date.now()}`;

  axios.get(urlWithCacheBuster)
    .then(response => {
      const text = response.data;
      const versionRegex = /^##\s+v?(\d+\.\d+\.\d+)/m;
      const match = text.match(versionRegex);

      if (match && match[1]) {
        const remoteVersion = match[1];
        
        console.log(`Local: ${currentVersion} | Remote: ${remoteVersion}`);

        if (isNewerVersion(remoteVersion, currentVersion)) {
           dialogs.showUpdateDialog(remoteVersion, currentVersion);
        } else {
            console.log('You are on the latest version.');
        }
      } else {
        console.warn('Update check: Could not find a version number in Changelog.');
      }
    })
    .catch(err => console.error('Update check failed:', err));
}

function isNewerVersion(remote, local) {
  const remoteParts = remote.split('.').map(Number);
  const localParts = local.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (remoteParts[i] > localParts[i]) return true;
    if (remoteParts[i] < localParts[i]) return false;
  }
  return false;
}

module.exports = { checkForUpdates };
