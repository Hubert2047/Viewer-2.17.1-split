import fs from 'fs'
import path from 'path'

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath)
        } else {
            fs.copyFileSync(srcPath, destPath)
        }
    }
}

const files = [
    'src/libs/global-variables.js',
    'src/libs/engine/engine-1.js',
    'src/libs/engine/engine-2.js',
    'src/libs/engine/engine-3.js',
    'src/libs/engine/engine-4.js',
    'src/utils/index.js',
    'src/components/confirm-dialog.js',
    'src/components/hotspots/hotspot.js',
    'src/components/hotspots/hotspot-manager.js',
    'src/components/hotspots/hotspot-editor-ui.js',
    'src/main.js',
]

function build() {
    try {
        const js = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
        fs.mkdirSync('dist', { recursive: true })
        fs.writeFileSync('dist/viewer.js', js)
        fs.copyFileSync('src/assets/viewer.css', 'dist/viewer.css')
        if (fs.existsSync('public')) {
            copyDir('public', 'dist')
            console.log('✓ Copied public/')
        }
        let html = fs.readFileSync('index.html', 'utf8')
        html = html.replace(
            '<script type="module" src="./src/main.js"></script>',
            '<script src="./viewer.js"></script>',
        )
        fs.writeFileSync('dist/index.html', html)
        console.log('✓ Built:', files.length, 'files → dist/viewer.js', 'at', new Date().toLocaleTimeString())
    } catch (e) {
        console.error('Build error:', e.message)
    }
}

build()

if (process.argv.includes('--watch')) {
    console.log('👀 Watching for changes...')
    let timeout = null
    const rebuild = (filename) => {
        clearTimeout(timeout)
        timeout = setTimeout(() => {
            console.log(`  changed: ${filename}`)
            build()
        }, 100)
    }
    fs.watch('src', { recursive: true }, (event, filename) => rebuild(filename))
    fs.watch('index.html', () => rebuild('index.html'))
}
