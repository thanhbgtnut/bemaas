import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Bản build ra web/dist và được nhúng vào binary Go (web/embed.go).
// Khi phát triển: `npm run dev` ở cổng 5173, proxy /api sang backend ở 8080.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
})
