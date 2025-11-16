
function createAiModeTab() {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';
  container.style.height = '100%';
  container.textContent = 'this is aimode tab';
  return container;
}

export { createAiModeTab };
