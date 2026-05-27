import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Aftertale ships from Cloudflare Pages at https://aftertale.gg (apex), so
// base is `/`. Kept overridable via env so a one-off GitHub Pages mirror
// would still work if we ever rebuild that.
const base = process.env.AT_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
});
