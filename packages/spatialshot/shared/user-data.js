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

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function getProfilePath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'profile.json');
}

function saveUserData(data) {
  try {
    const profilePath = getProfilePath();
    const userDataPath = path.dirname(profilePath);
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(profilePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Failed to save user data:', error);
  }
}

function getUserData() {
  try {
    const profilePath = getProfilePath();
    if (fs.existsSync(profilePath)) {
      const data = fs.readFileSync(profilePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to read user data:', error);
  }
  return null;
}

function clearUserData() {
  try {
    const profilePath = getProfilePath();
    if (fs.existsSync(profilePath)) {
      fs.unlinkSync(profilePath);
    }
  } catch (error) {
    console.error('Failed to clear user data:', error);
  }
}

module.exports = {
  saveUserData,
  getUserData,
  clearUserData,
};
