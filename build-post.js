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
    'src/libs/custome-engine.js',
    'src/libs/engine-1.js',
    'src/libs/engine-2.js',
    'src/libs/engine-3.js',
    'src/global-variables.js',
    'src/default-settings.js',
    'src/utils/math.js',
    'src/libs/engine-4.js',
    'src/components/rotation-gizmo.js',
    'src/components/entity-rotatable.js',
    'src/components/dimensions/dimension-rotatable.js',
    'src/components/position-gizmo.js',
    'src/utils/index.js',
    'src/components/loading.js',
    'src/components/ground-plane-picker.js',
    'src/components/ui.js',
    'src/components/selections.js',
    'src/camera/ortery-controller.js',
    'src/components/dimensions/dimensions.js',
    'src/components/point-eraser.js',
    'src/components/measurement/measure-tool.js',
    'src/components/measurement/measurement.js',
    'src/components/pivot-dot.js',
    'src/components/messages/message-button.js',
    'src/components/messages/message.js',
    'src/components/messages/message-manager.js',
    'src/components/messages/message-editor-ui.js',
    'src/components/orientation/manual.js',
    'src/components/orientation/ground.js',
    'src/components/orientation/orientation.js',
    'src/components/sidebar.js',
    'src/main.js',
]

function build() {
    try {
        const js = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
        fs.mkdirSync('dist', { recursive: true })

        if (isProduction) {
            const playcanvasLicense = `/**\n * ${[
                'Copyright (c) 2011-2026 PlayCanvas Ltd.',
                '',
                'Permission is hereby granted, free of charge, to any person obtaining a copy',
                'of this software and associated documentation files (the "Software"), to deal',
                'in the Software without restriction, including without limitation the rights',
                'to use, copy, modify, merge, publish, distribute, sublicense, and/or sell',
                'copies of the Software, and to permit persons to whom the Software is',
                'furnished to do so, subject to the following conditions:',
                '',
                'The above copyright notice and this permission notice shall be included in all',
                'copies or substantial portions of the Software.',
                '',
                'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR',
                'IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,',
                'FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE',
                'AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER',
                'LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,',
                'OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE',
                'SOFTWARE.',
            ].join('\n * ')}\n */\n`

            // obfuscate JS
            const obfuscated = JavaScriptObfuscator.obfuscate(js, {
                compact: true,
                controlFlowFlattening: true,
                deadCodeInjection: false,
                stringArray: false,
                stringArrayEncoding: ['rc4'],
                stringArrayRotate: true,
                stringArrayShuffle: true,
                stringArrayThreshold: 0.75,
                numbersToExpressions: true,
                simplify: false,
                renameGlobals: true,
                selfDefending: true,
                transformObjectKeys: true,
            })
            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
            const now = new Date()
            const built = now.toDateString() + ' ' + now.toTimeString().split(' ')[0]
            const header = `/**\n * @Software: 3D Model Viewer\n * @PackageVersion: ${pkg.version}\n * @Built: ${built}\n * @Copyright (c) 2025-${new Date().getFullYear()} Ortery Technologies Inc.\n * @All rights reserved.\n */\n`
            fs.writeFileSync('dist/viewer.js', header + obfuscated.getObfuscatedCode() + '\n\n' + playcanvasLicense)

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
