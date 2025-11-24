// --- TRAFFIC LIGHTS SETUP ---

export function setupTrafficLights() {
  document.querySelector(".close-btn").addEventListener("click", () => {
    window.electron.closeWindow();
  });

  document.querySelector(".minimize-btn").addEventListener("click", () => {
    window.electron.minimizeWindow();
  });

  document.querySelector(".maximize-btn").addEventListener("click", () => {
    window.electron.maximizeWindow();
  });
}

// --- THEME HANDLING SETUP ---

export function setupThemeHandling() {
  if (window.electron && window.electron.onThemeChanged) {
    window.electron.onThemeChanged((theme) => {
      document.documentElement.classList.remove("dark-theme", "light-theme");
      document.documentElement.classList.add(`${theme}-theme`);

      if (window.electron.themeApplied) {
        window.electron.themeApplied();
      }
    });
  }
}
