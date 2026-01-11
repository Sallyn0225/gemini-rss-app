import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        // Fix: `__dirname` is not available in all module contexts. Using `process.cwd()`
        // is a reliable alternative to get the project root directory.
        '@': path.resolve(process.cwd(), '.'),
      }
    }
  };
});