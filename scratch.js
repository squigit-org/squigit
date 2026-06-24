const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(file);
    }
  });
  return results;
}

const rendererFiles = walk('./apps/renderer/src');
const invokes = new Set();
const invokeRegex = /\.invoke(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/g;

rendererFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = invokeRegex.exec(content)) !== null) {
    invokes.add(match[1]);
  }
});

const ipcContent = fs.readFileSync('./apps/desktop/src/ipc.ts', 'utf8');
const handles = new Set();
const handleRegex = /ipcMain\.handle\(\s*['"]([^'"]+)['"]/g;
let match;
while ((match = handleRegex.exec(ipcContent)) !== null) {
  handles.add(match[1]);
}

const missing = Array.from(invokes).filter(cmd => !handles.has(cmd));

console.log("Found " + invokes.size + " invoked commands in frontend.");
console.log("Found " + handles.size + " handled commands in backend.");
console.log("Missing commands in backend:");
console.log(missing.join('\n'));
