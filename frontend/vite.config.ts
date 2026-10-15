import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Bản build ghi thẳng vào package Go nhúng nó (internal/webui), nên binary phục vụ luôn giao diện.
// Vite xoá thư mục trước khi build; plugin này đặt lại tệp .gitkeep mà //go:embed cần.
const keepPlaceholder: Plugin = {
  name: 'keep-gitkeep',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: '.gitkeep', source: '' })
  },
}

// Khi phát triển: `npm run dev` ở cổng 5173, proxy /api sang backend.
// Đổi đích bằng BEMAAS_API=http://host:port npm run dev.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const target = env.BEMAAS_API || 'http://localhost:8080'
  return {
    plugins: [react(), tailwindcss(), keepPlaceholder],
    build: { outDir: '../internal/webui/dist', emptyOutDir: true },
    server: {
      port: 5173,
      proxy: { '/api': target, '/healthz': target },
    },
  }
})
