const fs = require('fs');

const dtsContent = fs.readFileSync('./crates/napi-bridge/index.d.ts', 'utf8');
const napiExports = new Set();
const exportRegex = /export declare function ([a-zA-Z0-9_]+)\(/g;

let match;
while ((match = exportRegex.exec(dtsContent)) !== null) {
  napiExports.add(match[1]);
}

const ipcContent = fs.readFileSync('./apps/desktop/src/ipc.ts', 'utf8');
const handledNapi = new Set();
const callRegex = /addon\.([a-zA-Z0-9_]+)\??\(/g;

while ((match = callRegex.exec(ipcContent)) !== null) {
  handledNapi.add(match[1]);
}

const unusedNapi = Array.from(napiExports).filter(func => !handledNapi.has(func));

console.log("Found " + napiExports.size + " NAPI exports.");
console.log("Found " + handledNapi.size + " NAPI methods called in ipc.ts.");
console.log("Unused NAPI exports (likely need to be added to ipc.ts):");
console.log(unusedNapi.join('\n'));

