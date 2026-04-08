import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

function resolveWorkspaceDependency(...segments: string[]) {
  const localPath = path.resolve(__dirname, 'node_modules', ...segments)
  if (existsSync(localPath)) return localPath
  return path.resolve(__dirname, '..', 'node_modules', ...segments)
}

/**
 * Dev-only plugin: serve repo-root `data/*.csv` as `/data/*` so the
 * DuckDB SQL tab works without the Express API server running.
 * In production, Express handles this route instead.
 */
function serveDataDir(): Plugin {
  const dataDir = path.resolve(__dirname, '..', 'data')
  return {
    name: 'serve-data-dir',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/data/')) return next()
        const relative = req.url.slice('/data/'.length).split('?')[0]
        // Only allow simple filenames — no path traversal
        if (relative.includes('..') || relative.includes('/')) return next()
        const filePath = path.join(dataDir, relative)
        if (!existsSync(filePath)) return next()

        const content = readFileSync(filePath)
        if (relative.endsWith('.csv')) {
          res.setHeader('Content-Type', 'text/csv; charset=utf-8')
        } else if (relative.endsWith('.json') || relative.endsWith('.geojson')) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
        }
        res.setHeader('Cache-Control', 'public, max-age=3600')
        res.end(content)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serveDataDir()],
  resolve: {
    alias: {
      // Force single React instance — prevents react-pdf from bundling its own copy
      react: resolveWorkspaceDependency('react'),
      'react-dom': resolveWorkspaceDependency('react-dom'),
    },
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm'],
  },
  server: {
    port: 3200,
    fs: {
      allow: [
        // DuckDB-WASM + apache-arrow deps may be hoisted to the repo root node_modules
        path.resolve(__dirname, '..'),
      ],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3201',
        changeOrigin: true,
      },
      '/research-demo': {
        target: 'http://localhost:3201',
        changeOrigin: true,
      },
    },
  },
})
