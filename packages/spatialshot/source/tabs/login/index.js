

let isActivated = false;

function onAppStart() {
  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.style.display = 'flex';
  }
  const contentContainer = document.getElementById('content-container');
  if (contentContainer) {
    for (const child of contentContainer.children) {
      if (child.id !== 'welcome-screen') {
        child.style.display = 'none';
      }
    }
  }
}

function onActivate(activateAiTab, skipAuth = false) {
  if (skipAuth) {
    isActivated = true;
    const welcomeScreen = document.getElementById('welcome-screen');
    if (welcomeScreen) {
      welcomeScreen.style.display = 'none';
    }
    activateAiTab();
    return;
  }

  isActivated = true;
  const welcomeScreen = document.getElementById('welcome-screen');
  if (welcomeScreen) {
    welcomeScreen.style.display = 'none';
  }
  activateAiTab();
}

function onTabClick(tabId) {
  return isActivated;
}

export { onAppStart, onActivate, onTabClick };
