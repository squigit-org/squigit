import { protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';

export function registerProtocols() {
  protocol.handle('squigit-asset', (request) => {
    // The URL will be squigit-asset://<encoded-path>
    // So we need to strip squigit-asset://
    const urlStr = request.url.replace(/^squigit-asset:\/\//i, '');
    const decodedPath = decodeURIComponent(urlStr);
    
    // Resolve absolute path
    const absolutePath = path.resolve(decodedPath);
    
    return net.fetch(`file://${absolutePath}`).then(res => {
      const ext = path.extname(absolutePath).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.pdf') contentType = 'application/pdf';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.svg') contentType = 'image/svg+xml';
      else if (ext === '.gif') contentType = 'image/gif';
      
      const newHeaders = new Headers(res.headers);
      newHeaders.set('Content-Type', contentType);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      
      try {
        const stats = fs.statSync(absolutePath);
        newHeaders.set('Content-Length', stats.size.toString());
      } catch (e) {
        // Ignore stat errors
      }
      
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: newHeaders
      });
    });
  });
}
