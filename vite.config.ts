/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { inkFileApi } from './server/vitePlugin';

export default defineConfig({
  plugins: [react(), inkFileApi()],
  resolve: {
    // CodeMirror breaks ("Unrecognized extension value") when two copies of its core packages load; keep one.
    dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language', '@lezer/common', '@lezer/highlight'],
  },
  optimizeDeps: {
    include: ['@codemirror/state', '@codemirror/view', '@codemirror/language', '@lezer/common', '@lezer/highlight', '@uiw/react-codemirror', '@mavnn/codemirror-lang-ink'],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
