import { protocol, net } from 'electron';
import path from 'path';

export function registerProtocols() {
  protocol.handle('squigit-asset', (request) => {
    // The URL will be squigit-asset://<encoded-path>
    // So we need to strip squigit-asset://
    const urlStr = request.url.replace(/^squigit-asset:\/\//i, '');
    const decodedPath = decodeURIComponent(urlStr);
    
    // Resolve absolute path
    const absolutePath = path.resolve(decodedPath);
    
    // Convert to file:// URL for net.fetch
    return net.fetch(`file://${absolutePath}`);
  });
}
