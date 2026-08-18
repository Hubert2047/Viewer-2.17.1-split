function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildToastHtml(segments) {
    return segments
        .map((seg) => {
            const escaped = escapeHtml(seg.text)
            return seg.bold ? `<b>${escaped}</b>` : escaped
        })
        .join('')
}
function applyPointMapping({ modelEntity, deletedSet }) {
    const gsplatComp = modelEntity.gsplat
    const numSplats = gsplatComp.resource.numSplats
    const kept = []
    for (let i = 0; i < numSplats; i++) {
        if (!deletedSet.has(i)) kept.push(i)
    }
    gsplatComp._instance.sorter.setMapping(new Uint32Array(kept))
}
function getWaveAnim(elapsedSec, delaySec) {
    const duration = 0.9
    const t = ((((elapsedSec - delaySec) % duration) + duration) % duration) / duration
    if (t <= 0.6) {
        const p = t / 0.6
        return { scale: 0.6 + 0.7 * p, opacity: 1 - 0.3 * p }
    }
    const p = (t - 0.6) / 0.4
    return { scale: 1.3 + 0.3 * p, opacity: 0.7 - 0.7 * p }
}

function drawFromOrigin(ctx, originX, originY, scale, draw) {
    ctx.save()
    ctx.translate(originX, originY)
    ctx.scale(scale, scale)
    ctx.translate(-originX, -originY)
    draw()
    ctx.restore()
}
function blurPoster(poster, progress) {
    poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`
}
function normalizeColor(input, alpha = 1) {
    let rgb
    if (Array.isArray(input)) {
        if (input[0] > 1 || input[1] > 1 || input[2] > 1) {
            rgb = input.slice(0, 3).map((v) => v / 255)
        } else {
            rgb = input.slice(0, 3)
        }
    } else if (typeof input === 'string' && input.startsWith('#')) {
        let hex = input.replace('#', '')
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((c) => c + c)
                .join('')
        }
        rgb = [
            parseInt(hex.substring(0, 2), 16) / 255,
            parseInt(hex.substring(2, 4), 16) / 255,
            parseInt(hex.substring(4, 6), 16) / 255,
        ]
    } else if (typeof input === 'string' && input.startsWith('rgb')) {
        const nums = input.match(/\d+/g).map(Number)
        rgb = [nums[0] / 255, nums[1] / 255, nums[2] / 255]
    } else {
        const temp = document.createElement('div')
        temp.style.color = input
        document.body.appendChild(temp)
        const rgbStr = getComputedStyle(temp).color
        document.body.removeChild(temp)
        const nums = rgbStr.match(/\d+/g).map(Number)
        rgb = [nums[0] / 255, nums[1] / 255, nums[2] / 255]
    }
    return [...rgb, alpha]
}

function showToast(content, opts = {}) {
    const duration = typeof opts.duration === 'number' ? opts.duration : 1500
    const type = opts.type || 'default'
    let toast = document.getElementById('toast')
    if (!toast) {
        toast = document.createElement('div')
        toast.id = 'toast'
        document.body.appendChild(toast)
    }

    const isChar = !opts.html && content.length === 1
    toast.classList.toggle('char', isChar)
    toast.classList.remove('success', 'warning', 'error')
    if (type === 'success' || type === 'warning' || type === 'error') {
        toast.classList.add(type)
    }

    toast.innerHTML = ''

    if (isChar) {
        toast.textContent = content
    } else {
        if (ICONS[type]) {
            const icon = document.createElement('div')
            icon.className = 'toast-icon'
            icon.innerHTML = ICONS[type]
            toast.appendChild(icon)
        }

        const text = document.createElement('div')
        text.className = 'toast-text'
        if (opts.html) {
            text.innerHTML = opts.html
        } else {
            text.textContent = content
        }
        toast.appendChild(text)

        const closeBtn = document.createElement('div')
        closeBtn.className = 'toast-close'
        closeBtn.innerHTML = ICONS.cancel
        closeBtn.addEventListener('click', () => hideToast(toast))
        toast.appendChild(closeBtn)
    }

    toast.classList.add('show')
    if (toast._hideTimeout) clearTimeout(toast._hideTimeout)
    toast._hideTimeout = setTimeout(() => hideToast(toast), duration)
}

function hideToast(toast) {
    toast.classList.remove('show')
    if (toast._hideTimeout) {
        clearTimeout(toast._hideTimeout)
        toast._hideTimeout = null
    }
}
function showNotSupportWebGL() {
    document.getElementById('loading-overlay')?.classList.add('hidden')
    document.body.innerHTML = `
		<div class="webgl-error">
		<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.5">
		<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
		<line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
		</svg>
		<h2>WebGL Not Supported</h2>
		<p>Your browser does not support WebGL, which is required to display 3D content.</p>
		<p class="hint">This is usually caused by hardware acceleration being disabled in your browser settings.</p>
		</div>
	`
}
function checkWebGL() {
    const testCanvas = document.createElement('canvas')
    const gl = testCanvas.getContext('webgl2')
    return !!gl
}
function isEqual(a, b) {
    if (a === b) return true
    if (a === null || b === null) return a === b
    if (typeof a !== typeof b) return false
    if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => isEqual(v, b[i]))
    if (typeof a === 'object') {
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)
        return keysA.length === keysB.length && keysA.every((k) => isEqual(a[k], b[k]))
    }
    return false
}
function stripDefaults(settings, defaults = defaultSettings) {
    const result = { ...settings }
    for (const key of Object.keys(defaults)) {
        if (!(key in result)) continue
        const eq = isEqual(result[key], defaults[key])
        if (eq) delete result[key]
    }
    return result
}
function exportPly(modelEntity, removedSplats, filename = 'export.ply') {
    const gsplatInstance = modelEntity.gsplat.instance.meshInstance.gsplatInstance
    const gsplatData = gsplatInstance.resource.gsplatData
    const numSplats = gsplatData.numSplats
    const deletedSet = new Set(removedSplats || [])

    const vertexEl = gsplatData.getElement('vertex')
    const props = vertexEl.properties.filter((p) => p.storage)

    const keepIndices = []
    for (let i = 0; i < numSplats; i++) {
        if (!deletedSet.has(i)) keepIndices.push(i)
    }
    const numKeep = keepIndices.length

    const propLines = props
        .map((p) => {
            const typeName =
                p.storage instanceof Float32Array
                    ? 'float'
                    : p.storage instanceof Int32Array
                      ? 'int'
                      : p.storage instanceof Uint8Array
                        ? 'uchar'
                        : 'float'
            return `property ${typeName} ${p.name}`
        })
        .join('\n')

    const header =
        ['ply', 'format binary_little_endian 1.0', `element vertex ${numKeep}`, propLines, 'end_header'].join('\n') +
        '\n'

    const bytesPerProp = props.map((p) =>
        p.storage instanceof Float32Array
            ? 4
            : p.storage instanceof Int32Array
              ? 4
              : p.storage instanceof Uint8Array
                ? 1
                : 4,
    )
    const bytesPerSplat = bytesPerProp.reduce((a, b) => a + b, 0)

    const headerBytes = new TextEncoder().encode(header)
    const dataBuffer = new ArrayBuffer(numKeep * bytesPerSplat)
    const dataView = new DataView(dataBuffer)

    let offset = 0
    for (const idx of keepIndices) {
        for (let pi = 0; pi < props.length; pi++) {
            const storage = props[pi].storage
            const byteSize = bytesPerProp[pi]
            if (byteSize === 4 && !(storage instanceof Uint8Array)) {
                dataView.setFloat32(offset, storage[idx], true)
            } else {
                dataView.setUint8(offset, storage[idx])
            }
            offset += byteSize
        }
    }

    const blob = new Blob([headerBytes, dataBuffer], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}
async function exportHtml(name, global) {
    const settings = global.settings
    const copySettings = JSON.parse(JSON.stringify(settings))
    const hasPivot = copySettings.pivot?.position
    const hasRemovedSplats = copySettings.removedSplats?.length > 0
    const hasOrientation = copySettings.orientation?.pose
    const STEP_REQUIREMENTS = [
        { step: 2, condition: hasRemovedSplats },
        { step: 3, condition: hasPivot },
        { step: 4, condition: hasOrientation },
    ]
    const setupStep = STEP_REQUIREMENTS.reduce((currentStep, { step, condition }) => {
        return condition && currentStep < step ? step : currentStep
    }, copySettings.setupStep)
    const newVersion = (copySettings.v ?? 0) + 1
    const strippedSettings = stripDefaults({
        ...copySettings,
        v: newVersion,
        messages: copySettings.messages.map((m) => {
            if (m.audio) {
                return { ...m, audio: { ...m.audio, src: '' } }
            }
            return m
        }),
        setupStep,
    })
    delete strippedSettings.ref
    const orderedSettings = {
        ref: '',
        model: strippedSettings.model,
        contentUrl: strippedSettings.contentUrl,
        ...strippedSettings,
    }

    const injectedScript = `<script>window.sse = { "settings": ${JSON.stringify(orderedSettings)} }<\/script>`
    const template = getHtmlTemplate(newVersion)
    const html = template.replace('<!-- INJECT_SCRIPT -->', injectedScript)

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()

    URL.revokeObjectURL(url)
    global.dataDirty = false
}
function getHtmlTemplate(version) {
    return `
    <!doctype html>
    <html lang="en">
    <head>
        <title>3D Model Viewer</title>
        <meta charset="UTF-8" />
        <meta property="og:description" content=" " />
        <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <base href />
        <link rel="icon" href="data:," />
        <link rel="stylesheet" href="./data/viewer.css?v=${version}" />
        <script>
            const params = new URLSearchParams(window.location.search)
            const currentV = params.get('v')
            if (!currentV) {
                const now = Date.now()
                const url = new URL(window.location.href)
                url.searchParams.set('v', now)
                window.location.replace(url.toString())
            } else {
                const stored = sessionStorage.getItem('page-v')
                const now = Date.now()
                if (!stored) {
                    sessionStorage.setItem('page-v', currentV)
                } else if (now - parseInt(currentV) > 60000) {
                    const url = new URL(window.location.href)
                    url.searchParams.set('v', now)
                    sessionStorage.setItem('page-v', now)
                    window.location.replace(url.toString())
                }
            }
        </script>
    </head>
    <body>
        <canvas id="application-canvas"></canvas>
        <div id="ui">
            <div id="poster"></div>
        </div>
        <div id="tooltip"></div>
        <div id="spinnerWrap">
        <svg class="progress-ring" viewBox="0 0 200 200">
            <circle class="progress-ring-bg" cx="100" cy="100" r="86" fill="none" />
            <circle
                id="progressRingFg"
                class="progress-ring-fg"
                cx="100"
                cy="100"
                r="86"
                fill="none"
                stroke-dasharray="540.35"
                stroke-dashoffset="540.35" />
            </svg>
            <span id="spinnerPercent" class="spinner-percent">0%</span>
        </div>
    </body>
    <!-- INJECT_SCRIPT -->
    <script src="./data/viewer.js?v=${version}"></script>
    </html> 
    `
}

function makeControlItems(items) {
    return items.map(({ action, key, cls }) => {
        const div = document.createElement('div')
        div.className = 'control-item' + (cls ? ' ' + cls : '')
        div.innerHTML = `
      <span class="control-action">${action}</span>
      <span class="control-key">${key}</span>
    `
        return div
    })
}

function makeTabPanel(id, items, hidden = false) {
    const panel = document.createElement('div')
    panel.id = id
    if (hidden) panel.className = 'hidden'
    makeControlItems(items).forEach((el) => panel.appendChild(el))
    return panel
}

function makeControlBotGroup(global, tooltip, dom) {
    const { settings, events, dimensionsBox, isEditMeasurement, isSpin360 } = global
    const group = document.createElement('div')
    group.className = 'buttonGroup'
    // buttons: [id, iconKey,label,create, show, event, toggle]
    const {
        dimensions,
        measurement,
        spin: { enabled: hasSpin },
    } = settings
    const hasDimension = !!dimensions
    const isShowDimensions = dimensionsBox?.show && dimensionsBox?.type !== 'axis'
    const hasMeasurement =
        measurement &&
        !isEditMeasurement &&
        ((!measurement.calibration.useDimensionData && hasCalibrationData(measurement.calibration)) ||
            (measurement.calibration.useDimensionData && hasDimensionsData(dimensions)))
    const showStartSpin = !isSpin360
    const buttons = [
        ['startSpin', 'startSpin', 'Start Spin (S)', hasSpin, showStartSpin, '360spin-start'],
        ['stopSpin', 'stopSpin', 'Stop Spin (S)', hasSpin, !showStartSpin, '360spin-stop'],
        ['resetCamera', 'resetCamera', 'Reset Camera (R)', true, true, 'inputEvent:r'],
        ['measure', 'measure', 'Measurement (M)', hasMeasurement, hasMeasurement, 'inputEvent:m'],
        [
            'showDimension',
            'showDimension',
            'Show Dimensions (D)',
            hasDimension,
            !isShowDimensions,
            'inputEvent:show-dimensions',
            'hideDimension',
        ],
        [
            'hideDimension',
            'hideDimension',
            'Hide Dimensions (D)',
            hasDimension,
            isShowDimensions,
            'inputEvent:hide-dimensions',
            'showDimension',
        ],
    ]

    buttons.forEach(([id, icon, label, create, show, eventName, toggleId]) => {
        if (!create) return
        const btn = makeButton({
            id,
            icon: ICONS[icon],
            className: 'control-btn',
            onClick: (e) => {
                events.fire(eventName, e)
                if (toggleId) {
                    const toggleBtn = group.querySelector(`#${toggleId}`)
                    if (toggleBtn) {
                        btn.classList.add('hidden')
                        toggleBtn.classList.remove('hidden')
                    }
                }
            },
        })
        dom[id] = btn
        group.appendChild(btn)
        tooltip.register(btn, label, 'top')
        if (show) btn.classList.remove('hidden')
        else btn.classList.add('hidden')
    })
    return group
}
function makeMessageActionGroup(global, tooltip, events, dom) {
    const group = document.createElement('div')
    group.id = 'messageActionGroup'
    dom['messageActionGroup'] = group
    group.className = 'buttonGroup'
    // buttons: [id, iconKey, label, defaultShow, event]
    const showStopPlayMessages = global.isAutoPlayMessages
    const hideMessages = global.isShowMessageNavigation || (global.isShowMessageNavigation === undefined && !isMobile)
    const buttons = [
        ['stopMessage', 'stopPlay', 'Story Stop Play (P)', showStopPlayMessages, 'stop-auto'],
        ['startMessage', 'startPlay', 'Story Auto Play (P)', !showStopPlayMessages, 'start-auto'],
        [
            'hideMessageButton',
            'hideMessageButton',
            'Hide Message Navigation (T)',
            hideMessages,
            'hide-message-navigation',
        ],
        [
            'showMessageButton',
            'showMessageButton',
            'Show Message Navigation (T)',
            !hideMessages,
            'show-message-navigation',
        ],
    ]
    buttons.forEach(([id, icon, label, defaultShow, eventname, toggleId]) => {
        const el = makeButton({
            id,
            icon: ICONS[icon],
            className: 'control-btn',
            onClick: (e) => {
                tooltip.hide()
                events.fire(`message:${eventname}`)
            },
        })
        dom[id] = el
        if (defaultShow) el.classList.remove('hidden')
        else el.classList.add('hidden')
        group.appendChild(el)
        tooltip.register(el, label, 'top')
    })
    return group
}
function makeControlsWrap(global, tooltip, dom, events) {
    const wrap = document.createElement('div')
    wrap.id = 'controlsWrap'
    dom[wrap.id] = wrap
    wrap.className = 'hidden'
    wrap.addEventListener('contextmenu', (e) => {
        e.preventDefault()
    })

    const container = document.createElement('div')
    container.id = 'buttonsContainer'
    dom[container.id] = container

    const messageContainer = document.createElement('div')
    messageContainer.id = 'messageContainer'
    dom.messageContainer = messageContainer
    messageContainer.addEventListener('wheel', (e) => {
        e.stopPropagation()
    })
    let mobileNav = null

    if (isMobile) {
        mobileNav = document.createElement('div')
        mobileNav.id = 'mobileMessageNav'

        const makeNavBtn = (dir) => {
            const btn = document.createElement('button')
            btn.innerHTML =
                dir === 'prev'
                    ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`
                    : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`
            btn.style.cssText = `
    width: 30px; height: 30px; border-radius: 50%; border: none;
    display: flex; align-items: center;
    justify-content: center; cursor: pointer; flex-shrink: 0; padding: 0;
    transition: background 0.15s;
    visibility: ${global.settings.messages.length > 1 ? 'visible' : 'hidden'};
`
            btn.addEventListener('click', () => {
                events.fire('message:mobile-navigation', dir)
            })
            return btn
        }

        mobileNav.appendChild(makeNavBtn('prev'))
        mobileNav.appendChild(messageContainer)
        mobileNav.appendChild(makeNavBtn('next'))
        wrap.appendChild(mobileNav)
    } else {
        wrap.appendChild(messageContainer)
    }

    const render = () => {
        container.innerHTML = ''
        container.appendChild(makeControlBotGroup(global, tooltip, dom))
        if (global.settings.messages.length > 0) {
            container.appendChild(makeMessageActionGroup(global, tooltip, events, dom))
        }
        if (mobileNav) {
            const isVisible = global.isShowMessageNavigation
            mobileNav.style.display = isVisible ? 'flex' : 'none'
        }
    }

    render()
    global.events.on('re-render:control-wrap', render)
    wrap.appendChild(container)

    const canvas = global.app.graphicsDevice.canvas
    wrap.addEventListener('pointerdown', (e) => {
        if (e.target === wrap || e.target === container || e.target === messageContainer) {
            canvas.dispatchEvent(new PointerEvent('pointerdown', e))
        }
    })

    return wrap
}
function makeGroupWrapper(title) {
    const group = document.createElement('div')
    group.className = 'optionGroup'

    const groupTitle = document.createElement('div')
    groupTitle.className = 'option-title'
    groupTitle.textContent = title

    group.appendChild(groupTitle)
    return group
}

function makeEditGroup(events, cancelAllEvents = []) {
    const members = new Map() // name -> { cancel }
    cancelAllEvents.forEach((event) => {
        events.on(event, () => cancelAll())
    })
    function cancelAll() {
        members.forEach((member, key) => {
            member.cancel()
        })
    }
    return {
        register(name, { cancel }) {
            members.set(name, { cancel })
        },
        startEdit(name) {
            members.forEach((member, key) => {
                if (key !== name) member.cancel()
            })
            events.fire('editGroup:changed', name)
        },
    }
}
function checkPerformance(app, global) {
    let benchFrames = 0
    let benchStart = performance.now()
    let benchDone = false
    const BENCH_DURATION = 1000

    const benchHandle = app.on('frameend', () => {
        if (benchDone) return
        benchFrames++
        app.renderNextFrame = true
        const elapsed = performance.now() - benchStart
        if (elapsed >= BENCH_DURATION) {
            benchDone = true
            benchHandle.off()
            app.renderNextFrame = false
            const avgFps = ((benchFrames / elapsed) * 1000).toFixed(1)
            if (avgFps <= 10) {
                global.modal.open(
                    'Performance Warning',
                    'Your device seems to be running slowly.<br>' +
                        'You can go to <strong>View Options</strong> and select a lower quality setting for better performance.',
                    'top',
                    {
                        showCancel: false,
                    },
                )
            }
        }
    })
}
function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2))
    ctx.beginPath()
    ctx.moveTo(x + radius, y)
    ctx.lineTo(x + w - radius, y)
    ctx.arcTo(x + w, y, x + w, y + radius, radius)
    ctx.lineTo(x + w, y + h - radius)
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
    ctx.lineTo(x + radius, y + h)
    ctx.arcTo(x, y + h, x, y + h - radius, radius)
    ctx.lineTo(x, y + radius)
    ctx.arcTo(x, y, x + radius, y, radius)
    ctx.closePath()
}

function wrapCanvasText(ctx, text, maxWidth) {
    const paragraphs = String(text ?? '').split('\n')
    const lines = []
    for (const paragraph of paragraphs) {
        const words = paragraph.split(' ')
        let current = ''
        for (const word of words) {
            const test = current ? `${current} ${word}` : word
            if (current && ctx.measureText(test).width > maxWidth) {
                lines.push(current)
                current = word
            } else {
                current = test
            }
        }
        lines.push(current)
    }
    return lines
}
function transparentColor(color, alpha = 0.5) {
    if (!color) return ''
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
    if (hex) {
        const full =
            hex[1].length === 3
                ? hex[1]
                      .split('')
                      .map((c) => c + c)
                      .join('')
                : hex[1]
        const r = parseInt(full.slice(0, 2), 16)
        const g = parseInt(full.slice(2, 4), 16)
        const b = parseInt(full.slice(4, 6), 16)
        return `rgba(${r},${g},${b},${alpha})`
    }
    return color
}
function dimensionsSetup(app, camera, config) {
    let currentDim = null
    const AXIS_COLORS = { x: '#e85555', y: '#55cc55', z: '#5588ff' }
    const layers = app.scene.layers
    const worldLayer = layers.getLayerByName('World')
    const layerBBox = new Layer({ name: 'BBox' })
    const worldIndex = layers.getOpaqueIndex(worldLayer)
    layers.insert(layerBBox, worldIndex)
    camera.camera.layers = [...camera.camera.layers, layerBBox.id]
    const lineMesh = new Mesh(app.graphicsDevice)

    let lineMat = new StandardMaterial()
    lineMat.diffuse = new Color(0, 0, 0)
    lineMat.blendType = BLEND_NORMAL
    lineMat.depthTest = true
    lineMat.depthWrite = true
    lineMat.useLighting = false
    lineMat.cull = CULLFACE_NONE
    lineMat.emissive = new Color(normalizeColor('#00ffcc'))
    lineMat.depthBias = -0.1
    lineMat.slopeDepthBias = -0.1
    lineMat.alphaToCoverage = true
    lineMat.update()

    const bboxEntity = new Entity('bbox')
    app.root.addChild(bboxEntity)
    const mi = new MeshInstance(lineMesh, lineMat)
    mi.cull = false
    bboxEntity.addComponent('render', {
        layers: [layerBBox.id],
        meshInstances: [mi],
    })

    const canvas = app.graphicsDevice.canvas

    const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svgOverlay.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:998;overflow:visible;'
    document.body.appendChild(svgOverlay)

    const elements = {}
    for (const axis of ['x', 'y', 'z']) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('stroke-width', '1.5')
        line.setAttribute('stroke-dasharray', '4,3')
        line.style.display = 'none'
        svgOverlay.appendChild(line)

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        dot.setAttribute('r', '3')
        dot.style.display = 'none'
        svgOverlay.appendChild(dot)

        const label = document.createElement('div')
        label.classList.add('dimension-label')
        document.body.appendChild(label)

        elements[axis] = { line, dot, label }
    }

    const worldToScreen = (wx, wy, wz) => {
        const sp = camera.camera.worldToScreen(new Vec3(wx, wy, wz))
        const rect = canvas.getBoundingClientRect()
        return {
            x: rect.left + sp.x,
            y: rect.top + sp.y,
        }
    }

    const getWorldCorners = (dim) => {
        const { position, rotation, size } = dim
        const center = new Vec3(position.x, position.y, position.z)
        const he = { x: size.x / 2, y: size.y / 2, z: size.z / 2 }
        const localCorners = [
            new Vec3(-he.x, -he.y, -he.z),
            new Vec3(he.x, -he.y, -he.z),
            new Vec3(-he.x, he.y, -he.z),
            new Vec3(he.x, he.y, -he.z),
            new Vec3(-he.x, -he.y, he.z),
            new Vec3(he.x, -he.y, he.z),
            new Vec3(-he.x, he.y, he.z),
            new Vec3(he.x, he.y, he.z),
        ]

        const quat = new Quat().setFromEulerAngles(rotation.x, rotation.y, rotation.z)
        const worldMatrix = modelEntity.getWorldTransform()

        return localCorners.map((local) => {
            const rotated = quat.clone().transformVector(local)
            const worldPos = new Vec3(center.x + rotated.x, center.y + rotated.y, center.z + rotated.z)
            const final = new Vec3()
            worldMatrix.transformPoint(worldPos, final)
            return final
        })
    }
    const getBestEdgeMidpoint = (corners, axis, cameraDir) => {
        const axisEdges = {
            x: [
                [0, 1],
                [2, 3],
                [4, 5],
                [6, 7],
            ],
            y: [
                [0, 2],
                [1, 3],
                [4, 6],
                [5, 7],
            ],
            z: [
                [0, 4],
                [1, 5],
                [2, 6],
                [3, 7],
            ],
        }

        let bestMid = null
        let bestScore = -Infinity

        for (const [i, j] of axisEdges[axis]) {
            const p1 = corners[i]
            const p2 = corners[j]
            const mid = new Vec3((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)

            const toCamera = new Vec3(
                camera.getPosition().x - mid.x,
                camera.getPosition().y - mid.y,
                camera.getPosition().z - mid.z,
            ).normalize()

            const edgeDir = new Vec3(p2.x - p1.x, p2.y - p1.y, p2.z - p1.z).normalize()
            const perpendicularity = Math.abs(edgeDir.dot(toCamera))
            const dist = camera.getPosition().distance(mid)
            const distanceScore = 1 / (dist + 0.1)
            const score = perpendicularity * 2 + distanceScore

            if (score > bestScore) {
                bestScore = score
                bestMid = mid
            }
        }

        return bestMid
    }

    const updateLineToLabelCenter = (line, edgeScreen, labelElement) => {
        const rect = labelElement.getBoundingClientRect()

        const labelCenter = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
        }

        const dx = edgeScreen.x - labelCenter.x
        const dy = edgeScreen.y - labelCenter.y

        if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
            line.setAttribute('x1', edgeScreen.x)
            line.setAttribute('y1', edgeScreen.y)
            line.setAttribute('x2', labelCenter.x)
            line.setAttribute('y2', labelCenter.y)
            return
        }

        const halfW = rect.width / 2
        const halfH = rect.height / 2

        const txPos = dx !== 0 ? halfW / Math.abs(dx) : Infinity
        const tyPos = dy !== 0 ? halfH / Math.abs(dy) : Infinity

        const tHit = Math.min(txPos, tyPos)
        const edgeX = labelCenter.x + dx * tHit
        const edgeY = labelCenter.y + dy * tHit

        line.setAttribute('x1', edgeScreen.x)
        line.setAttribute('y1', edgeScreen.y)
        line.setAttribute('x2', edgeX)
        line.setAttribute('y2', edgeY)
    }
    function getRealSize(dim, useMeasurementData) {
        if (useMeasurementData && hasCalibrationData(settings.measurement?.calibration)) {
            return calRealSizeFromMeasurement(dim.size)
        }
        return { realSize: dim.realSize, unit: dim.unit }
    }
    function getLabelText(dim, axis) {
        switch (dim.type) {
            case 'axis':
                return axis
            case 'dimensions':
            default:
                const { useMeasurementData } = dim
                const { realSize, unit } = getRealSize(dim, useMeasurementData)
                const value = realSize[axis]
                const unitText = { mm: 'mm', cm: 'cm', m: 'm', inch: '"' }[unit] || unit
                const mainText = `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${unitText}`
                if (!config.editable) return mainText
                return `${getDimensionLabel(axis)}: ${mainText}`
            // const fullText = `${getDimensionLabel(axis)}: ${mainText}`
            // return `<span style="color:${AXIS_COLORS[axis]}">${fullText}</span>`
        }
    }
    function getDimensionLabel(axis) {
        switch (axis) {
            case 'x':
                return 'Dimension A'
            case 'y':
                return 'Dimension B'
            default:
                return 'Dimension C'
        }
    }
    const updateLabels = (corners, dim) => {
        if (!dim || !dim.size) return
        const cameraDir = new Vec3(0, 0, -1)
        camera.getRotation().transformVector(cameraDir, cameraDir)
        const screenCorners = corners.map((c) => worldToScreen(c.x, c.y, c.z))
        const screenMinX = Math.min(...screenCorners.map((c) => c.x))
        const screenMaxX = Math.max(...screenCorners.map((c) => c.x))
        const screenMinY = Math.min(...screenCorners.map((c) => c.y))
        const screenMaxY = Math.max(...screenCorners.map((c) => c.y))
        const screenCenterX = (screenMinX + screenMaxX) / 2
        const screenCenterY = (screenMinY + screenMaxY) / 2
        for (const axis of ['x', 'y', 'z']) {
            const midpoint = getBestEdgeMidpoint(corners, axis, cameraDir)
            if (!midpoint) continue
            const edgeScreen = worldToScreen(midpoint.x, midpoint.y, midpoint.z)
            const dx = edgeScreen.x - screenCenterX
            const dy = edgeScreen.y - screenCenterY
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            const { line, dot, label } = elements[axis]
            label.innerHTML = getLabelText(dim, axis)
            label.style.display = 'block'
            label.style.fontSize = config.editable ? '14px' : '16px'
            label.style.left = '-9999px'
            label.style.top = '-9999px'
            const lw = label.offsetWidth
            const lh = label.offsetHeight
            const MARGIN = 16
            let ox = dx / len
            let oy = dy / len
            let extraOffset = 8
            if (ox > 0)
                extraOffset = Math.max(
                    extraOffset,
                    screenMaxX - edgeScreen.x + lw / 2 + MARGIN - (screenMaxX - edgeScreen.x),
                )
            if (ox < 0)
                extraOffset = Math.max(
                    extraOffset,
                    edgeScreen.x - screenMinX + lw / 2 + MARGIN - (edgeScreen.x - screenMinX),
                )
            if (oy > 0)
                extraOffset = Math.max(
                    extraOffset,
                    screenMaxY - edgeScreen.y + lh / 2 + MARGIN - (screenMaxY - edgeScreen.y),
                )
            if (oy < 0)
                extraOffset = Math.max(
                    extraOffset,
                    edgeScreen.y - screenMinY + lh / 2 + MARGIN - (edgeScreen.y - screenMinY),
                )
            const offset = Math.max(40, extraOffset)
            const labelCX = edgeScreen.x + ox * offset
            const labelCY = edgeScreen.y + oy * offset
            const SCREEN_MARGIN = 8
            const clampedX = Math.max(
                SCREEN_MARGIN + lw / 2,
                Math.min(window.innerWidth - SCREEN_MARGIN - lw / 2, labelCX),
            )
            const clampedY = Math.max(
                SCREEN_MARGIN + lh / 2,
                Math.min(window.innerHeight - SCREEN_MARGIN - lh / 2, labelCY),
            )
            label.style.left = clampedX - lw / 2 + 'px'
            label.style.top = clampedY - lh / 2 + 'px'

            dot.setAttribute('cx', edgeScreen.x)
            dot.setAttribute('cy', edgeScreen.y)
            dot.style.display = 'block'

            updateLineToLabelCenter(line, edgeScreen, label)
            line.style.display = 'block'
        }
    }

    const hideLabels = () => {
        for (const axis of ['x', 'y', 'z']) {
            elements[axis].line.style.display = 'none'
            elements[axis].dot.style.display = 'none'
            elements[axis].label.style.display = 'none'
        }
    }

    let visible = false
    let currentCorners = null

    const edges = [
        [0, 1],
        [1, 3],
        [3, 2],
        [2, 0],
        [4, 5],
        [5, 7],
        [7, 6],
        [6, 4],
        [0, 4],
        [1, 5],
        [2, 6],
        [3, 7],
    ]

    const updateColor = (dim) => {
        lineMat.emissive = new Color(normalizeColor(dim.boxColor))
        lineMat.update()
        app.renderNextFrame = true
        const backgroundColor = transparentColor(dim.background.color, dim.background.alpha)
        for (const axis of ['x', 'y', 'z']) {
            elements[axis].line.setAttribute('stroke', dim.foregroundColor)
            elements[axis].dot.setAttribute('stroke', dim.foregroundColor)
            elements[axis].dot.setAttribute('fill', dim.foregroundColor)
            elements[axis].label.style.color = dim.foregroundColor
            elements[axis].label.style.backgroundColor = backgroundColor
        }
    }

    const drawCorners = (corners) => {
        const pos = []
        for (const [i, j] of edges) {
            pos.push(corners[i].x, corners[i].y, corners[i].z)
            pos.push(corners[j].x, corners[j].y, corners[j].z)
        }
        lineMesh.setPositions(pos)
        lineMesh.update(PRIMITIVE_LINES, false)
        app.renderNextFrame = true
    }

    const getCorners = (dim) => {
        if (!dim) return null
        return getWorldCorners(dim)
    }

    const drawDimensionBox = (dim) => {
        if (!modelEntity) return
        const renderComp = modelEntity.render
        if (renderComp) {
            renderComp.enabled = false
        }
        currentDim = dim
        updateColor(dim)
        const corners = getCorners(dim)
        if (!corners) return
        currentCorners = corners
        visible = true
        bboxEntity.enabled = true
        drawCorners(corners)
        updateLabels(corners, dim)
    }
    let colorRafId = null
    const updateColorOnly = (dim) => {
        currentDim = dim
        if (colorRafId) return
        colorRafId = requestAnimationFrame(() => {
            colorRafId = null
            updateColor(currentDim)
        })
    }
    const hideDimensionBox = () => {
        if (!visible) return
        visible = false
        bboxEntity.enabled = false
        currentCorners = null
        hideLabels()
        app.renderNextFrame = true
    }

    window.addEventListener('resize', () => {
        if (visible && currentCorners) {
            updateLabels(currentCorners, currentDim)
        }
    })

    app.on('postrender', () => {
        if (!visible || currentDim === null) return
        if (!modelEntity) return
        const corners = getCorners(currentDim)
        if (corners) {
            currentCorners = corners
            drawCorners(corners)
            updateLabels(corners, currentDim)
        }
    })

    return {
        get show() {
            return visible
        },
        get type() {
            return currentDim?.type
        },
        get center() {
            return modelEntity?.gsplat?.customAabb?.center ?? new Vec3()
        },
        get halfExtents() {
            return modelEntity?.gsplat?.customAabb?.halfExtents ?? new Vec3(1, 1, 1)
        },
        draw: drawDimensionBox,
        updateColorOnly,
        hide: hideDimensionBox,
    }
}
function showDimensions({ global, config }) {
    if (!global.dimensionsBox) global.dimensionsBox = dimensionsSetup(global.app, global.camera, config)
    global.dimensionsBox.draw(global.settings.dimensions)
}
function hideDimensions({ global }) {
    if (!global.dimensionsBox) return
    global.dimensionsBox.hide()
}
function initDimensions({ global, events, config }) {
    events.on('inputEvent:show-dimensions', () => {
        showDimensions({ global, config })
    })
    events.on('inputEvent:hide-dimensions', () => {
        hideDimensions({ global })
    })
    events.on('dimensions:color-change', (dim) => {
        global.dimensionsBox.updateColorOnly(dim)
    })
    events.on('inputEvent:d', () => {
        if (!global.settings.dimensions) return
        if (!global.dimensionsBox?.show) showDimensions({ global })
        else hideDimensions({ global })
    })
}
function initMeasurement({ global, dom, events }) {
    events.on('inputEvent:m', () => {
        if (!global.settings.measurement) return
        if (!global.measureTool) {
            global.measureTool = new MeasureTool(global)
        }
        const tool = global.measureTool
        tool.activate()
        if (dom.measure) dom.measure.classList.toggle('active', tool.active)
    })
}
