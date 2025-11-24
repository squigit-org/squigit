import { setupTrafficLights, setupThemeHandling } from "./utils.js";

setupTrafficLights();
setupThemeHandling();

const contentContainer = document.getElementById("content-container");
const loginViewFrame = document.getElementById("login-view");
const settingsBtn = document.getElementById("settings-btn");

settingsBtn.addEventListener("click", () => {
  window.electron.toggleSettings();
});

window.addEventListener("DOMContentLoaded", () => {
  window.electron.checkAuthStatus().then((isAuthenticated) => {
    if (isAuthenticated) {
      loginViewFrame.style.display = "none";
      initializeSPA();
    } else {
      loginViewFrame.style.display = "block";
      window.electron.hideMainView();
    }
  });
});

window.electron.onAuthResult((result) => {
  if (result.success) {
    loginViewFrame.style.display = "none";
    initializeSPA();
  }
});

function initializeSPA() {
    const rect = contentContainer.getBoundingClientRect();
    const viewBounds = {
      x: Math.floor(rect.left),
      y: Math.floor(rect.top),
      width: Math.floor(rect.width),
      height: Math.floor(rect.height),
    };
    window.electron.setMainViewBounds(viewBounds);
}
