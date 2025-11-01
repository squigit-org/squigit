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

/**
 * Injects detailed prompt after image upload is complete
 */
export function injectAIPrompt(webview) {
  const promptScript = `
    (function() {
      const DETAILED_PROMPT = "Provide a comprehensive overview of this image. Describe the main subjects, composition, text content (if any), and overall context. Be detailed and analytical in your assessment.";
      
      function injectPrompt() {
        const selectors = [
          'textarea[aria-label*="Ask"]',
          'textarea[placeholder*="ask"]', 
          'textarea[role="textbox"]',
          'input[type="text"]',
          'textarea'
        ];
        
        let input = null;
        for (const selector of selectors) {
          input = document.querySelector(selector);
          if (input) break;
        }
        
        if (input) {
          input.focus();
          input.value = DETAILED_PROMPT;
          
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          
          const form = input.closest('form');
          if (form) {
            form.submit();
          } else {
            input.dispatchEvent(new KeyboardEvent('keydown', { 
              key: 'Enter', 
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true 
            }));
          }
          
          console.log('AI prompt injected successfully');
          return true;
        }
        return false;
      }
      
      let attempts = 0;
      const maxAttempts = 10;
      
      function attemptInjection() {
        attempts++;
        if (injectPrompt()) {
          return true;
        } else if (attempts < maxAttempts) {
          setTimeout(attemptInjection, 500 + (attempts * 200));
        } else {
          console.log('Failed to inject prompt after', maxAttempts, 'attempts');
          return false;
        }
      }
      
      setTimeout(attemptInjection, 1000);
    })();
  `;
  
  webview.executeJavaScript(promptScript)
    .catch(err => console.warn('Prompt injection failed:', err));
}
