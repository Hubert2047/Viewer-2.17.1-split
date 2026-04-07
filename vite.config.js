import { defineConfig } from 'vite'
import fs from 'fs'

function postBuildPlugin() {
  return {
    name: 'post-build',
    closeBundle() {
      fs.copyFileSync('index.html', 'dist/index.html')
      fs.copyFileSync('src/viewer.css', 'dist/viewer.css')

      let html = fs.readFileSync('dist/index.html', 'utf8')
      html = html.replace(
        '<script type="module" src="./src/main.js"></script>',
        '<script src="./viewer.js"></script>'
      )
      fs.writeFileSync('dist/index.html', html)
      console.log('✓ HTML + CSS copied')
    }
  }
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/main.js',
      output: {
        format: 'iife',
        entryFileNames: 'viewer.js',
        dir: 'dist',
        generatedCode: {
          constBindings: true,
        },
      },
      treeshake: false,
    },
    minify: false,
    cssCodeSplit: false,
  },
})