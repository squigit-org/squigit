import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    minify: process.env.NODE_ENV === 'production',
    target: 'node22',
    lib: {
      entry: {
        main: path.resolve(__dirname, 'src/main.ts'),
        preload: path.resolve(__dirname, 'src/preload.ts'),
        ipc: path.resolve(__dirname, 'src/ipc/index.ts'),
        protocol: path.resolve(__dirname, 'src/protocol.ts')
      },
      formats: ['cjs']
    },
    rollupOptions: {
      external: [
        'electron',
        'napi-bridge',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`)
      ],
      output: {
        entryFileNames: '[name].js'
      }
    },
    emptyOutDir: true
  }
});
