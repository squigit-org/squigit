export function preventWindowFileDrops() {
  if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
      window.addEventListener('dragover', (e: any) => {
        e.preventDefault();
      });

      window.addEventListener('dragleave', (e: any) => {
        e.preventDefault();
      });

      window.addEventListener('drop', (e: any) => {
        e.preventDefault();
      });
    });
  }
}
