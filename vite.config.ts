import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api/': 'http://localhost:8788',
      '/authorize': 'http://localhost:8788',
      '/.well-known/': 'http://localhost:8788',
    }
  }
})