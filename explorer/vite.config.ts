import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function resolveWorkspaceDependency(...segments: string[]) {
  const localPath = path.resolve(__dirname, 'node_modules', ...segments)
  if (existsSync(localPath)) return localPath
  return path.resolve(__dirname, '..', 'node_modules', ...segments)
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Force single React instance — prevents react-pdf from bundling its own copy
      react: resolveWorkspaceDependency('react'),
      'react-dom': resolveWorkspaceDependency('react-dom'),
    },
  },
  server: {
    port: 3200,
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
