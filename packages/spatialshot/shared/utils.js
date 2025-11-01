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

export function showFeedbackMessage(message, type) {
  const feedbackMessage = document.getElementById("feedbackMessage");
  feedbackMessage.textContent = message;
  feedbackMessage.className = "feedback-message";
  feedbackMessage.classList.add(type, "show");

  setTimeout(() => {
    feedbackMessage.classList.remove("show");
  }, 3000);
}