import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

function preloadDisplayFont(): Plugin {
  return {
    name: 'preload-display-font',
    transformIndexHtml: {
      order: 'post',
      handler(html, context) {
        const bundle = context.bundle
        if (!bundle) return html
        const fontFile = Object.keys(bundle).find((name) =>
          /schibsted-grotesk-latin-wght-normal[^/]*\.woff2$/.test(name),
        )
        if (!fontFile) return html
        const tag = `<link rel="preload" href="/${fontFile}" as="font" type="font/woff2" crossorigin>`
        return html.replace('</head>', `${tag}\n</head>`)
      },
    },
  }
}

export default defineConfig({
  plugins: [preloadDisplayFont()],
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: resolve(projectRoot, 'index.html'),
        de: resolve(projectRoot, 'de/index.html'),
        impressum: resolve(projectRoot, 'impressum/index.html'),
        datenschutz: resolve(projectRoot, 'datenschutz/index.html'),
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
