/**
 * @license
 * Copyright 2026 a7mddra
 * SPDX-License-Identifier: Apache-2.0
 */

export { AppLogo } from "./icons/AppLogo";
export { default as updateIcon } from "./icons/emoji_u1f4e6.png";
export { default as welcomeIcon } from "./icons/emoji_u1f6e0.png";

export { default as linuxInstruction } from "./instructions/linux.md?raw";
export { default as macosInstruction } from "./instructions/macos.md?raw";
export { default as windowsInstruction } from "./instructions/windows.md?raw";

export function playWarning() {
  const audio = new Audio();
  audio.src = "./dialog-warning.mp3";
  audio.volume = 1.0;
  void audio.play();
}
