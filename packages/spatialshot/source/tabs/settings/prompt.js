

export function createPromptView(panel, electronAPI, showFeedbackMessage) {
  const promptView = document.createElement('div');
  promptView.className = 'prompt-view';
  promptView.id = 'promptView';

  const promptHeader = document.createElement('div');
  promptHeader.className = 'prompt-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'back-btn';
  backBtn.id = 'backPromptBtn';
  const backIcon = document.createElement('i');
  backIcon.className = 'fas fa-arrow-left';
  backBtn.appendChild(backIcon);

  const promptTitle = document.createElement('h2');
  promptTitle.textContent = 'Edit Prompt';

  promptHeader.appendChild(backBtn);
  promptHeader.appendChild(promptTitle);

  const promptContent = document.createElement('div');
  promptContent.className = 'prompt-content';

  const promptTextarea = document.createElement('textarea');
  promptTextarea.className = 'prompt-textarea';
  promptTextarea.id = 'promptTextarea';
  promptTextarea.placeholder = 'Write a prompt...';
  promptTextarea.value = 'Analyze this image and provide a detailed description focusing on the main subjects, colors, composition, and any notable details or patterns.';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.id = 'savePromptBtn';
  const saveIcon = document.createElement('i');
  saveIcon.className = 'fas fa-save';
  saveBtn.appendChild(saveIcon);
  saveBtn.appendChild(document.createTextNode(' Save Prompt'));

  promptContent.appendChild(promptTextarea);
  promptContent.appendChild(saveBtn);

  promptView.appendChild(promptHeader);
  promptView.appendChild(promptContent);

  // Event listeners
  backBtn.addEventListener('click', () => {
    promptView.classList.remove('active');
    panel.classList.remove('subview-active');
  });

  saveBtn.addEventListener('click', () => {
    //electronAPI.saveCustomPrompt(promptText);
    showFeedbackMessage('Prompt saved', 'done');
    promptView.classList.remove('active');
    panel.classList.remove('subview-active');
  });

  return promptView;
}
