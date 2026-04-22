function formatFileSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
function updateProgress(loaded, total, initPoster) {
    const loadingText = document.getElementById('loadingText')
    const fileSizeInfo = document.getElementById('fileSizeInfo')
    const loadingBar = document.getElementById('loadingBar')
    const progress = (loaded / total) * 100
    if (total > 0) {
        if (progress === 100) modelLoaded = true
        const displayProgress = progress
        const loadedSize = formatFileSize(loaded)
        const totalSize = formatFileSize(total)
        if (fileSizeInfo) fileSizeInfo.textContent = `${loadedSize} / ${totalSize}`
        if (loadingText) loadingText.textContent = `${Math.round(displayProgress)}%`
        if (loadingBar)
            loadingBar.style.backgroundImage = `linear-gradient(90deg, #F60 0%, #F60 ${displayProgress}%, white ${displayProgress}%, white 100%)`
    } else {
        if (fileSizeInfo) fileSizeInfo.textContent = 'Loading...'
        if (loadingText) loadingText.textContent = '0%'
    }
    if (initPoster) {
        const poster = document.getElementById('poster')
        blurPoster(poster, progress)
    }
}
function blurPoster(poster, progress) {
    poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`
}
function normalizeColor(input) {
    if (Array.isArray(input)) {
        if (input[0] > 1 || input[1] > 1 || input[2] > 1) {
            return input.slice(0, 3).map((v) => v / 255)
        }
        return input.slice(0, 3)
    }
    if (typeof input === 'string' && input.startsWith('#')) {
        let hex = input.replace('#', '')
        if (hex.length === 3) {
            hex = hex
                .split('')
                .map((c) => c + c)
                .join('')
        }
        const r = parseInt(hex.substring(0, 2), 16)
        const g = parseInt(hex.substring(2, 4), 16)
        const b = parseInt(hex.substring(4, 6), 16)
        return [r / 255, g / 255, b / 255]
    }
    if (input.startsWith('rgb')) {
        const nums = input.match(/\d+/g).map(Number)
        return [nums[0] / 255, nums[1] / 255, nums[2] / 255]
    }
    const temp = document.createElement('div')
    temp.style.color = input
    document.body.appendChild(temp)
    const rgb = getComputedStyle(temp).color
    document.body.removeChild(temp)
    const nums = rgb.match(/\d+/g).map(Number)
    return [nums[0] / 255, nums[1] / 255, nums[2] / 255]
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
    toast.textContent = content
    if (content.length === 1) {
        toast.classList.add('char')
    } else {
        toast.classList.remove('char')
    }
    toast.classList.remove('success', 'warning', 'error')

    if (type === 'success') toast.classList.add('success')
    else if (type === 'warning') toast.classList.add('warning')
    else if (type === 'error') toast.classList.add('error')
    toast.classList.add('show')
    if (toast._hideTimeout) clearTimeout(toast._hideTimeout)
    toast._hideTimeout = setTimeout(() => {
        toast.classList.remove('show')
        toast._removeTimeout = setTimeout(() => {}, 300)
    }, duration)
}
function showNotSupportWebGL() {
    document.getElementById('loadingWrap').classList.add('hidden')
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
async function exportHtml(name, data, fileAudioStore) {
    const newVersion = (data.settings.v ?? 0) + 1

    const updatedSettings = {
        ...data.settings,
        v: newVersion,
    }
    const hotspots = await Promise.all(
        (updatedSettings.hotspots ?? []).map(async (h) => {
            if (!h.audio) return h
            const audio = { ...h.audio }
            let src = ''
            if (audio.embed && fileAudioStore) {
                const file = fileAudioStore.get(audio.fileId)
                if (!file) {
                    console.warn('Missing audio file:', h.id)
                    return h
                }
                src = await new Promise((resolve, reject) => {
                    const reader = new FileReader()
                    reader.onload = () => resolve(reader.result)
                    reader.onerror = reject
                    reader.readAsDataURL(file)
                })
            }
            delete audio.fileId
            return {
                ...h,
                audio: {
                    ...audio,
                    src,
                },
            }
        }),
    )
    delete updatedSettings.fileAudioStore
    const payload = {
        ...data,
        settings: {
            ...updatedSettings,
            hotspots,
        },
    }
    const injectedScript = `<script>
        window.sse = ${JSON.stringify(payload)}
    <\/script>`
    const template = getHtmlTemplate(newVersion)
    const html = template.replace('<!-- INJECT_SCRIPT -->', injectedScript)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
}
function getHtmlTemplate(version) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <title>3D Model Viewer</title>
    <meta charset="UTF-8">
    <meta property="og:title" content="3D Model Viewer" />
    <meta property="og:description" content=" " />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
     <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
    <base href>
    <link rel="icon" href="data:," >
    <link rel="stylesheet" href="viewer.css?v=${version}">
    <link
            href="https://fonts.googleapis.com/css2?family=Roboto&family=Chiron+Sung+HK&family=BBH+Sans+Bartle&family=Poppins&family=Lato&family=Montserrat&family=Open+Sans&family=Raleway&family=Playfair+Display&family=Merriweather&family=Nunito&family=Inter&display=swap"
            rel="stylesheet" />
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
            <div id="loadingWrap">
                <div id="fileSizeInfo"></div>
                <div id="loadingText"></div>
                <div id="loadingBar"></div>
            </div>
            <div id="tooltip"></div>
        </div>
</body>
<!-- INJECT_SCRIPT -->
<script src="./viewer.js?v=${version}"><\/script>
</html>`
}

function createControlItems(items) {
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

function createTabPanel(id, items, hidden = false) {
    const panel = document.createElement('div')
    panel.id = id
    if (hidden) panel.className = 'hidden'
    createControlItems(items).forEach((el) => panel.appendChild(el))
    return panel
}

function createInfoPanel(settings, events) {
    const baseDesktop = [
        { action: 'Rotate', key: 'Left Mouse' },
        { action: 'Pan', key: 'Right Mouse' },
        { action: 'Zoom', key: 'Mouse Wheel' },
        { action: 'Reset Camera', key: 'R / Camera Icon' },
    ]
    const baseTouch = [
        { action: 'Rotate', key: 'One Finger Drag' },
        { action: 'Pan', key: 'Two Finger Drag' },
        { action: 'Zoom', key: 'Pinch' },
        { action: 'Reset Camera', key: 'Camera Icon' },
    ]
    const hotspotDesktop = [
        { action: 'Auto Play', key: 'P / Triangle icon', cls: 'autoPlay-info' },
        { action: 'Messages Disable', key: 'T / Text Icon', cls: 'messages-info' },
    ]
    const hotspotTouch = [
        { action: 'Auto Play', key: 'Triangle icon', cls: 'autoPlay-info' },
        { action: 'Messages Disable', key: 'Text Icon', cls: 'messages-info' },
    ]

    const getControls = () => ({
        desktop: settings.hotspots?.length ? [...baseDesktop, ...hotspotDesktop] : baseDesktop,
        touch: settings.hotspots?.length ? [...baseTouch, ...hotspotTouch] : baseTouch,
    })

    const wrapper = document.createElement('div')
    wrapper.id = 'infoPanel'
    wrapper.className = 'hidden'

    const content = document.createElement('div')
    content.id = 'infoPanelContent'
    content.addEventListener('pointerdown', (e) => e.stopPropagation())

    const tabs = document.createElement('div')
    tabs.id = 'tabs'
    tabs.innerHTML = `
        <div id="desktopTab" class="tab active">Desktop</div>
        <div id="touchTab" class="tab">Touch</div>
    `

    const panels = document.createElement('div')
    panels.id = 'infoPanels'

    const rebuild = () => {
        const controls = getControls()
        panels.innerHTML = ''
        panels.appendChild(createTabPanel('desktopInfoPanel', controls.desktop))
        panels.appendChild(createTabPanel('touchInfoPanel', controls.touch, true))
    }

    rebuild()
    content.append(tabs, panels)
    wrapper.appendChild(content)

    events.on('hotspot:rebuild-info', rebuild)

    return wrapper
}

function createSVG({ size, vb, fill, attr = {}, d }) {
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('width', size + 'px')
    svg.setAttribute('height', size + 'px')
    svg.setAttribute('viewBox', vb)
    svg.setAttribute('fill', fill)
    svg.setAttribute('xmlns', ns)

    const paths = Array.isArray(d) ? d : [d]
    paths.forEach((pathD) => {
        const path = document.createElementNS(ns, 'path')
        path.setAttribute('d', pathD)
        Object.entries(attr).forEach(([k, v]) => path.setAttribute(k, v))
        svg.appendChild(path)
    })
    return svg
}

function createButton(id, iconKey) {
    const btn = document.createElement('button')
    btn.id = id
    btn.className = 'controlButton'
    btn.appendChild(createSVG(SVG_ICONS[iconKey]))
    return btn
}
function createControlBotGroup(settings, tooltip, events, dom) {
    const group = document.createElement('div')
    group.className = 'buttonGroup'
    // buttons: [id, iconKey,tooltip, show, event, toggle]
    const hasDimension = !!settings.dimensions
    const buttons = [
        ['resetCamera', 'resetCamera', 'Reset Camera', true, 'inputEvent:reset'],
        [
            'showDimension',
            'showDimension',
            'Show Dimensions',
            hasDimension,
            true,
            'inputEvent:show-dimensions',
            'hideDimension',
        ],
        [
            'hideDimension',
            'hideDimension',
            'HideDimensions',
            hasDimension,
            false,
            'inputEvent:hide-dimensions',
            'showDimension',
        ],
        ['info', 'info', 'Controls Guide', true, true, 'inputEvent:toggle-help'],
        ['settings', 'settings', 'Settings', true, true, 'inputEvent:setting-panel'],
    ]

    buttons.forEach(([id, icon, label, create, show, eventName, toggleId]) => {
        if (!create) return
        const btn = createButton(id, icon)
        dom[id] = btn
        group.appendChild(btn)
        tooltip.register(btn, label, 'top')
        btn.addEventListener('click', (e) => {
            events.fire(eventName, e)
            if (toggleId) {
                const toggleBtn = group.querySelector(`#${toggleId}`)
                if (toggleBtn) {
                    btn.classList.add('hidden')
                    toggleBtn.classList.remove('hidden')
                }
            }
        })
        if (show) btn.classList.remove('hidden')
        else btn.classList.add('hidden')
    })
    return group
}
function createHotspotActionGroup(tooltip, events, dom) {
    const group = document.createElement('div')
    group.id = 'hotspotActionGroup'
    dom['hotspotActionGroup'] = group
    group.className = 'buttonGroup'
    // buttons: [id, iconKey, label, defaultShow, event]
    const buttons = [
        ['stopHotspot', 'stopHotspot', 'Stop Auto Play', false, 'stop-auto', 'startHotspot'],
        ['startHotspot', 'startHotspot', 'Auto Play', true, 'start-auto', 'stopHotspot'],
        ['hideHotspotButton', 'hideHotspotButton', 'Message Disable', !isMobile, 'hide-hotspot-btns'],
        ['showHotspotButton', 'showHotspotButton', 'Message Enable', isMobile, 'show-hotspot-btns'],
    ]
    buttons.forEach(([id, icon, label, defaultShow, eventname]) => {
        const el = createButton(id, icon)
        dom[id] = el
        el.addEventListener('click', () => {
            events.fire(`hotspot:${eventname}`)
            if (toggleId) {
                const toggleBtn = group.querySelector(`#${toggleId}`)
                if (toggleBtn) {
                    btn.classList.add('hidden')
                    toggleBtn.classList.remove('hidden')
                }
            }
        })
        if (defaultShow) el.classList.remove('hidden')
        else el.classList.add('hidden')
        group.appendChild(el)
        tooltip.register(el, label, 'top')
    })
    return group
}
function createControlsWrap(settings, tooltip, events, dom) {
    const wrap = document.createElement('div')
    wrap.id = 'controlsWrap'
    dom[wrap.id] = wrap
    wrap.className = 'hidden'
    const container = document.createElement('div')
    container.id = 'buttonsContainer'
    dom[container.id] = container
    const render = () => {
        container.innerHTML = ''
        container.appendChild(createControlBotGroup(settings, tooltip, events, dom))
    }
    render()
    events.on('ui:re-render-control-wrap', render)
    wrap.appendChild(container)
    const hotspotcontainer = document.createElement('div')
    hotspotcontainer.id = 'hotspotContainer'
    dom[hotspotcontainer.id] = hotspotcontainer
    wrap.appendChild(hotspotcontainer)

    return wrap
}
function createGroupWrapper(title) {
    const group = document.createElement('div')
    group.className = 'optionGroup'

    const groupTitle = document.createElement('div')
    groupTitle.className = 'option-title'
    groupTitle.textContent = title

    group.appendChild(groupTitle)
    return group
}

function createQualityGroup(app) {
    const group = createGroupWrapper('Quality')
    const optionsEl = document.createElement('div')
    optionsEl.className = 'quality-options'
    const qualities = [
        { id: 'lowQuality', value: '0', label: 'Low' },
        { id: '', value: '1', label: 'Medium' },
        { id: '', value: '2', label: 'High' },
        { id: '', value: '3', label: 'Ultra', checked: true },
    ]
    qualities.forEach(({ id, value, label, checked }) => {
        const labelEl = document.createElement('label')
        labelEl.className = 'option-item'

        const input = document.createElement('input')
        input.type = 'radio'
        input.name = 'quality'
        input.value = value
        if (id) input.id = id
        if (checked) input.checked = true

        input.addEventListener('change', (e) => {
            const bands = parseInt(e.target.value)
            const coeffs = bands > 0 ? (bands + 1) * (bands + 1) - 1 : 0

            app.root.findComponents('gsplat').forEach((gsplatComp) => {
                const instance = gsplatComp.instance
                const meshInstance = instance?.meshInstance
                if (!meshInstance) return

                const material = meshInstance.material
                material.setDefine('SH_BANDS', bands)
                material.setDefine('SH_COEFFS', coeffs)
                material.clearVariants()
                material.update()
                meshInstance.clearShaders()
            })

            app.renderNextFrame = true
        })

        labelEl.appendChild(input)
        labelEl.append(` ${label}`)
        optionsEl.appendChild(labelEl)
    })

    group.appendChild(optionsEl)
    return group
}

function createSettingsPanel(app) {
    const panel = document.createElement('div')
    panel.id = 'settingsPanel'
    panel.classList.add('setting-panel', 'hidden')

    const viewOptionHeader = document.createElement('div')
    viewOptionHeader.className = 'view-option-header'
    viewOptionHeader.textContent = 'View Options'

    const viewOptionContent = document.createElement('div')
    viewOptionContent.className = 'view-option-content'

    viewOptionContent.appendChild(createQualityGroup(app))

    panel.appendChild(viewOptionHeader)
    panel.appendChild(viewOptionContent)
    return panel
}

function createEditGroup(events) {
    const members = new Map() // name -> { cancel }

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
