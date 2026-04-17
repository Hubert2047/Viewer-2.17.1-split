import fs from 'fs'
import path from 'path'
import JavaScriptObfuscator from 'javascript-obfuscator'

const isProduction = process.argv.includes('--production')

function minifyCss(css) {
    return css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*{\s*/g, '{')
        .replace(/\s*}\s*/g, '}')
        .replace(/\s*:\s*/g, ':')
        .replace(/\s*;\s*/g, ';')
        .replace(/\s*,\s*/g, ',')
        .trim()
}
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
    'src/global-variables.js',
    'src/libs/engine-1.js',
    'src/libs/engine-2.js',
    'src/libs/engine-3.js',
    'src/default-settings.js',
    'src/libs/engine-4.js',
    'src/libs/custome-engine.js',
    'src/libs/rotation-gizmo.js',
    'src/libs/entity-rotatable.js',
    'src/libs/position-gizmo.js',
    'src/utils/index.js',
    'src/components/dialogs/confirm-dialog.js',
    'src/components/dialogs/modal-dialog.js',
    'src/camera/ortery-controller.js',
    'src/components/pivot/pivot-dot.js',
    'src/components/hotspots/hotspot-button.js',
    'src/components/hotspots/hotspot.js',
    'src/components/hotspots/hotspot-manager.js',
    'src/components/hotspots/hotspot-editor-ui.js',
    'src/main.js',
]

function build() {
    try {
        const js = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
        fs.mkdirSync('dist', { recursive: true })

        if (isProduction) {
            // obfuscate JS
            const obfuscated = JavaScriptObfuscator.obfuscate(js, {
                compact: true,
                controlFlowFlattening: false,
                deadCodeInjection: false,
                stringArray: true,
                stringArrayEncoding: ['base64'],
                stringArrayThreshold: 0.75,
                renameGlobals: false,
                selfDefending: false,
            })
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
            const now = new Date()
            const built = now.toDateString() + ' ' + now.toTimeString().split(' ')[0]
            const header = `/**\n * @Software: 3D Model Viewer\n * @PackageVersion: ${pkg.version}\n * @Built: ${built}\n * @Copyright (c) 2025-${new Date().getFullYear()} Ortery Technologies Inc.\n * @All rights reserved.\n */\n`
            fs.writeFileSync('dist/viewer.js', header + obfuscated.getObfuscatedCode())

            // minify CSS
            const css = fs.readFileSync('src/assets/viewer.css', 'utf8')
            fs.writeFileSync('dist/viewer.css', minifyCss(css))

            console.log('✓ Production build: obfuscated + minified CSS')
        } else {
            fs.writeFileSync('dist/viewer.js', js)
            fs.copyFileSync('src/assets/viewer.css', 'dist/viewer.css')
            console.log('✓ Dev build')
        }

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

    const copyHtml = () => {
        let html = fs.readFileSync('index.html', 'utf8')
        html = html.replace(
            '<script type="module" src="./src/main.js"></script>',
            '<script src="./viewer.js"></script>',
        )
        fs.writeFileSync('dist/index.html', html)
        console.log('✓ Copied index.html at', new Date().toLocaleTimeString())
    }

    const rebuild = (filename) => {
        clearTimeout(timeout)
        timeout = setTimeout(() => {
            console.log(`  changed: ${filename}`)
            build()
            copyHtml()
        }, 100)
    }

    fs.watch('src', { recursive: true }, (event, filename) => rebuild(filename))
    fs.watch('index.html', () => copyHtml())
}
