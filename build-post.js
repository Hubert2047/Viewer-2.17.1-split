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

function collectGlobalNames(files) {
    const names = new Set()
    for (const { file } of files) {
        const src = fs.readFileSync(file, 'utf8')
        for (const line of src.split('\n')) {
            const f = line.match(/^function\s+(\w+)/)
            if (f) names.add(f[1])
            const v = line.match(/^(?:const|let|var)\s+(\w+)/)
            if (v) names.add(v[1])
            const c = line.match(/^class\s+(\w+)/)
            if (c) names.add(c[1])
        }
    }
    return [...names].filter((n) => n.length > 1 && /^[a-zA-Z_$]/.test(n)).map((n) => `^${n}$`)
}

const OBFUSCATE_PRESETS = {
    engine: {
        compact: true,
        stringArray: false,
        stringArrayThreshold: 0.5,
        stringArrayEncoding: ['base64'],
        renameGlobals: false,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        numbersToExpressions: false,
        simplify: true,
        selfDefending: false,
        transformObjectKeys: false,
        identifierNamesGenerator: 'mangled',
    },
    default: {
        compact: true,
        stringArrayEncoding: ['rc4'],
        controlFlowFlattening: true,
        deadCodeInjection: true,
        stringArray: true,
        numbersToExpressions: true,
        simplify: true,
        renameGlobals: true,
        selfDefending: true,
        transformObjectKeys: true,
    },
}

const files = [
    { file: 'src/libs/chunk.js', preset: 'default' },
    { file: 'src/libs/custome-engine.js', preset: 'engine' },
    { file: 'src/libs/engine-1.js', preset: 'engine' },
    { file: 'src/libs/engine-2.js', preset: 'engine' },
    { file: 'src/libs/engine-3.js', preset: 'engine' },
    { file: 'src/libs/engine-4.js', preset: 'engine' },
    { file: 'src/global-variables.js', preset: 'default' },
    { file: 'src/default-settings.js', preset: 'default' },
    { file: 'src/utils/math.js', preset: 'engine' },
    { file: 'src/utils/index.js', preset: 'default' },
    { file: 'src/libs/oobworker.js', preset: 'engine' },
    { file: 'src/components/rotation-gizmo.js', preset: 'default' },
    { file: 'src/components/entity-rotatable.js', preset: 'default' },
    { file: 'src/components/dimensions/box-rotatable.js', preset: 'default' },
    { file: 'src/components/position-gizmo.js', preset: 'default' },
    { file: 'src/components/loading.js', preset: 'default' },
    { file: 'src/components/ground-plane-picker.js', preset: 'default' },
    { file: 'src/components/ui.js', preset: 'default' },
    { file: 'src/components/selections.js', preset: 'default' },
    { file: 'src/camera/ortery-controller.js', preset: 'default' },
    { file: 'src/components/dimensions/dimensions.js', preset: 'default' },
    { file: 'src/components/point-eraser.js', preset: 'default' },
    { file: 'src/components/measurement/measure-tool.js', preset: 'default' },
    { file: 'src/components/measurement/measurement.js', preset: 'default' },
    { file: 'src/components/pivot-dot.js', preset: 'default' },
    { file: 'src/components/messages/message-button.js', preset: 'default' },
    { file: 'src/components/messages/message.js', preset: 'default' },
    { file: 'src/components/messages/message-manager.js', preset: 'default' },
    { file: 'src/components/messages/message-editor-ui.js', preset: 'default' },
    { file: 'src/components/orientation/manual.js', preset: 'default' },
    { file: 'src/components/orientation/ground.js', preset: 'default' },
    { file: 'src/components/orientation/orientation.js', preset: 'default' },
    { file: 'src/components/viewer-section.js', preset: 'default' },
    { file: 'src/components/sidebar.js', preset: 'default' },
    { file: 'src/components/record-video.js', preset: 'default' },
    { file: 'src/main.js', preset: 'engine' },
]

function build() {
    try {
        fs.mkdirSync('dist', { recursive: true })

        if (isProduction) {
            const defaultFiles = files.filter((f) => f.preset === 'default')
            const reservedNames = [...collectGlobalNames(defaultFiles), 'ecb', 'exportHtml', 'boot']
            console.log(`✓ Reserved ${reservedNames.length} global names`)

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
            const engineFiles = files.filter((f) => f.preset === 'engine' && f.file !== 'src/main.js')
            const engineSrc = engineFiles.map(({ file }) => fs.readFileSync(file, 'utf8')).join('\n')
            const engineObfuscated = JavaScriptObfuscator.obfuscate(
                engineSrc,
                OBFUSCATE_PRESETS.engine,
            ).getObfuscatedCode()

            const defaultObfuscated = defaultFiles.map(({ file }) => {
                const src = fs.readFileSync(file, 'utf8')
                return JavaScriptObfuscator.obfuscate(src, {
                    ...OBFUSCATE_PRESETS.default,
                    reservedNames,
                }).getObfuscatedCode()
            })

            const mainSrc = fs.readFileSync('src/main.js', 'utf8')
            const mainObfuscated = JavaScriptObfuscator.obfuscate(mainSrc, OBFUSCATE_PRESETS.engine).getObfuscatedCode()

            const obfuscatedCode = [engineObfuscated, ...defaultObfuscated, mainObfuscated].join('\n')

            const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
            const now = new Date()
            const built = now.toDateString() + ' ' + now.toTimeString().split(' ')[0]
            const header = `/**\n * @Software: 3D Model Viewer\n * @PackageVersion: ${pkg.version}\n * @Built: ${built}\n * @Copyright (c) 2025-${new Date().getFullYear()} Ortery Technologies Inc.\n * @All rights reserved.\n */\n`
            fs.writeFileSync('dist/data/viewer.js', header + obfuscatedCode + '\n\n' + playcanvasLicense)

            const css = fs.readFileSync('src/assets/viewer.css', 'utf8')
            fs.writeFileSync('dist/data/viewer.css', minifyCss(css))

            console.log('✓ Production build: obfuscated + minified CSS')
        } else {
            const js = files.map(({ file }) => fs.readFileSync(file, 'utf8')).join('\n')
            fs.writeFileSync('dist/data/viewer.js', js)
            fs.copyFileSync('src/assets/viewer.css', 'dist/data/viewer.css')

            fs.mkdirSync('dist/data', { recursive: true })

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
