import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // Deployment base path. Defaults to root ('/') so the dashboard can be
    // served from the domain root; set VITE_BASE_PATH (e.g. '/app/') to
    // deploy under a subdirectory without changing any code.
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      react(),
      nodePolyfills({
        // The generated contract bindings (packages/types) import "buffer"
        // directly; resolving it to the real npm package (hoisted by npm)
        // avoids the plugin's alias shim, which does not resolve for files
        // outside the dashboard root.
        exclude: ['buffer'],
      }),
      // Bundle size analysis: `npm run analyze` (vite build --mode analyze)
      // emits dist/stats.html with a treemap of the production bundle.
      mode === 'analyze' &&
        visualizer({
          filename: 'dist/stats.html',
          template: 'treemap',
          gzipSize: true,
          brotliSize: true,
        }),
    ],
  },
  define: {
    global: 'globalThis',
  },
  build: {
    chunkSizeWarningLimit: 1100,
    // No `manualChunks` is defined on purpose: the Analytics page (and its
    // charting library) is loaded via React.lazy(() => import(...)), so
    // Rollup's default behaviour emits it as a separate on-demand chunk
    // instead of inlining it into the initial bundle. Forcing all vendor
    // code into one chunk would defeat that split. Verify with
    // `npm run analyze` (dist/stats.html) that the charting library lives in
    // its own chunk.
    // Files in public/ (robots.txt, sitemap.xml, favicons, …) are copied
    // verbatim to the build output root by Vite's default behaviour.
    // The explicit `publicDir` declaration below makes this intent clear and
    // ensures the setting is not accidentally overridden.
  },
  // Explicitly declare the public assets directory so it is obvious which
  // static files (robots.txt, sitemap.xml, …) will be copied to dist/.
  publicDir: 'public',
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  }
})
