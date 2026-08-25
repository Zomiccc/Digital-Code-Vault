import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (command === 'build' && !env.VITE_API_URL) {
    // eslint-disable-next-line no-console
    console.warn(
      '\n[build warning] VITE_API_URL is not set.\n' +
      '  The app will fall back to a relative "/api/v1" path, which is only\n' +
      '  correct if this admin dashboard is served from the SAME origin as the\n' +
      '  API (e.g. behind a reverse proxy like the bundled Caddyfile).\n' +
      '  If the API is deployed on a different domain, set VITE_API_URL to the\n' +
      '  full API base URL (e.g. https://api.yourdomain.com/api/v1) before building.\n',
    );
  }
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': 'http://localhost:3000',
      },
      allowedHosts: true,
    },
  };
});
