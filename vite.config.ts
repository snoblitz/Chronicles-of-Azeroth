import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` matters for GitHub Pages project sites because the bundle is served
// from /<repo-name>/ instead of /. CI sets COA_BASE=/Chronicles-of-Azeroth/.
// Local dev defaults to `/` so http://localhost:5180 works unchanged.
const base = process.env.COA_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
});
