export function showFeedbackMessage(
  message: string,
  type: "success" | "done" | "error",
  state: "default" | "custom" = "default"
) {
  const feedbackMessage = document.getElementById("feedbackMessage");
  if (!feedbackMessage) return;

  const existingTimerId = Number(feedbackMessage.dataset.timerId);
  if (existingTimerId) {
    clearTimeout(existingTimerId);
  }

  feedbackMessage.textContent = message;
  feedbackMessage.classList.remove("success", "done", "error");
  feedbackMessage.classList.add(type, "show");

  const newTimerId = window.setTimeout(() => {
    feedbackMessage.classList.remove("show");
  }, 3000);
  feedbackMessage.dataset.timerId = String(newTimerId);
}
