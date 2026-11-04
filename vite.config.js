import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// In development the /api/*.js handlers run inside Vite, through the same plain
// Node (req, res) interface Vercel gives them in production.
function devApi() {
  return {
    name: 'sceneshare-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/([a-z-]+)(?:[/?]|$)/.exec(req.url || '')
        if (!m) return next()
        try {
          // Endpoints grouped into one Vercel function live in api/_routes/.
          const mod = await server.ssrLoadModule(`/api/_routes/${m[1]}.js`).catch(() => server.ssrLoadModule(`/api/${m[1]}.js`))
          await mod.default(req, res)
        } catch (e) {
          if (/Failed to load url|Cannot find module/.test(String(e?.message))) {
            res.statusCode = 404
            return res.end(JSON.stringify({ ok: false, error: 'not_found' }))
          }
          console.error(e)
          res.statusCode = 500
          res.end(JSON.stringify({ ok: false, error: 'dev_error', message: String(e?.message || e) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), devApi()],
    server: { watch: { ignored: ['**/.data/**'] } },
    ssr: { external: ['sharp'] },
    // mapbox-gl (~520 kB gzip) is its own chunk, loaded only when a map is on screen.
    build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 2000 },
  }
})
