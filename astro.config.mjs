import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import alpinejs from '@astrojs/alpinejs'

export default defineConfig({
  integrations: [alpinejs({ entrypoint: '/src/entrypoint.ts' })],
  vite: {
    plugins: [tailwindcss()],
  },
})
