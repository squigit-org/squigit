const fs = require('fs');
const vite = require('vite');

async function test() {
  const result = await vite.build({
    root: 'apps/renderer',
    build: { lib: { entry: 'src/app/layout/frame/AuthButton.module.css', formats: ['es'] }, write: false }
  });
  console.log(result[0].output[0].code);
}
test();
