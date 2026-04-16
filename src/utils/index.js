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
function pickModelLocalPoint(x, y, camera) {
    const from = camera.screenToWorld(x, y, camera.nearClip)
    const to = camera.screenToWorld(x, y, camera.farClip)
    const worldRay = new Ray(from, to.clone().sub(from).normalize())

    let closestHitLocal = null
    let closestDist = Infinity

    const gsplatInstance = modelEntity.gsplat.instance.meshInstance.gsplatInstance
    const localCenters = gsplatInstance.resource.centers
    const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
    const invWorldMatrix = new Mat4().copy(worldMatrix).invert()

    const localRayOrigin = new Vec3()
    invWorldMatrix.transformPoint(worldRay.origin, localRayOrigin)
    const localRayDirection = new Vec3()
    invWorldMatrix.transformVector(worldRay.direction, localRayDirection)
    localRayDirection.normalize()
    const localRay = new Ray(localRayOrigin, localRayDirection)

    const splatRadius = [0.03, 0.05, 0.1]

    for (let k = 0; k < splatRadius.length; k++) {
        for (let i = 0; i < localCenters.length; i += 3) {
            const localPos = new Vec3(localCenters[i], localCenters[i + 1], localCenters[i + 2])
            const distToSplat = localRay.direction.dot(localPos.clone().sub(localRay.origin))

            if (distToSplat > 0) {
                const pointOnRay = localRay.getPoint(distToSplat)
                const dist = pointOnRay.distance(localPos)

                if (dist < splatRadius[k]) {
                    if (distToSplat < closestDist) {
                        closestDist = distToSplat
                        closestHitLocal = localPos.clone()
                    }
                }
            }
        }
        if (closestHitLocal) break
    }

    if (closestHitLocal) {
        const zTarget = closestHitLocal.z
        const t = (zTarget - localRay.origin.z) / localRay.direction.z
        return localRay.getPoint(t)
    }

    return findFallbackIntersectionPoint(localRay, localCenters, invWorldMatrix)
}

function findFallbackIntersectionPoint(localRay, centers, invWorldMatrix) {
    const nearestPoint = findNearestSplatCenter(localRay, centers)
    if (nearestPoint) return nearestPoint
    const bboxIntersection = intersectBoundingBoxCenterPlane(localRay, invWorldMatrix)
    if (bboxIntersection) return bboxIntersection

    return localRay.getPoint(5.0)
}

function findNearestSplatCenter(localRay, centers) {
    let bestT = null
    let bestDistSq = Infinity

    for (let i = 0; i < centers.length; i += 3) {
        const p = new Vec3(centers[i], centers[i + 1], centers[i + 2])
        const v = p.clone().sub(localRay.origin)
        const t = v.dot(localRay.direction)

        if (t < 0) continue

        const pointOnRay = localRay.getPoint(t)
        const dx = pointOnRay.x - p.x
        const dy = pointOnRay.y - p.y
        const dz = pointOnRay.z - p.z
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq < bestDistSq) {
            bestDistSq = distSq
            bestT = t
        }
    }
    return bestT !== null ? localRay.getPoint(bestT) : null
}

function intersectBoundingBoxCenterPlane(localRay, invWorldMatrix) {
    const meshInstance = modelEntity.gsplat.instance.meshInstance
    const aabbWorld = meshInstance.aabb
    const bboxCenterWorld = aabbWorld.center.clone()
    const bboxCenterLocal = new Vec3()
    invWorldMatrix.transformPoint(bboxCenterWorld, bboxCenterLocal)

    const planeNormal = localRay.direction.clone()
    return intersectRayPlane(localRay, bboxCenterLocal, planeNormal)
}

function intersectRayPlane(ray, planePoint, planeNormal) {
    const denom = planeNormal.dot(ray.direction)
    if (Math.abs(denom) < 1e-6) return null

    const t = planeNormal.dot(planePoint.clone().sub(ray.origin)) / denom
    if (t < 0) return null

    return ray.getPoint(t)
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
const SVG_ICONS = {
    resetCamera: {
        size: '28',
        vb: '0 0 24 24',
        fill: 'currentColor',
        d: 'M7.59843 4.48666C7.86525 3.17678 9.03088 2.25 10.3663 2.25H13.6337C14.9691 2.25 16.1347 3.17678 16.4016 4.48666C16.4632 4.78904 16.7371 5.01086 17.022 5.01086C17.0329 5.01086 17.0439 5.0111 17.0548 5.01157C18.4582 5.07294 19.5362 5.24517 20.4362 5.83558C21.0032 6.20757 21.4909 6.68617 21.871 7.24464C22.3439 7.93947 22.5524 8.73694 22.6524 9.70145C22.75 10.6438 22.75 11.825 22.75 13.3211V13.4062C22.75 14.9023 22.75 16.0835 22.6524 17.0258C22.5524 17.9903 22.3439 18.7878 21.871 19.4826C21.4909 20.0411 21.0032 20.5197 20.4362 20.8917C19.7327 21.3532 18.9262 21.5567 17.948 21.6544C16.9903 21.75 15.789 21.75 14.2634 21.75H9.73657C8.21098 21.75 7.00967 21.75 6.05196 21.6544C5.07379 21.5567 4.26731 21.3532 3.56385 20.8917C2.99682 20.5197 2.50905 20.0411 2.12899 19.4826C1.65612 18.7878 1.44756 17.9903 1.34762 17.0258C1.24998 16.0835 1.24999 14.9023 1.25 13.4062V13.3211C1.24999 11.825 1.24998 10.6438 1.34762 9.70145C1.44756 8.73694 1.65612 7.93947 2.12899 7.24464C2.50905 6.68617 2.99682 6.20757 3.56385 5.83558C4.46383 5.24517 5.5418 5.07294 6.94523 5.01157C6.95615 5.0111 6.96707 5.01086 6.978 5.01086C7.26288 5.01086 7.53683 4.78905 7.59843 4.48666ZM10.3663 3.75C9.72522 3.75 9.18905 4.19299 9.06824 4.78607C8.87258 5.74659 8.021 6.50186 6.99633 6.51078C5.64772 6.57069 4.92536 6.73636 4.38664 7.08978C3.98309 7.35452 3.63752 7.6941 3.36906 8.08857C3.09291 8.49435 2.92696 9.01325 2.83963 9.85604C2.75094 10.7121 2.75 11.8156 2.75 13.3636C2.75 14.9117 2.75094 16.0152 2.83963 16.8712C2.92696 17.714 3.09291 18.2329 3.36906 18.6387C3.63752 19.0332 3.98309 19.3728 4.38664 19.6375C4.80417 19.9114 5.33844 20.0756 6.20104 20.1618C7.07549 20.2491 8.20193 20.25 9.77778 20.25H14.2222C15.7981 20.25 16.9245 20.2491 17.799 20.1618C18.6616 20.0756 19.1958 19.9114 19.6134 19.6375C20.0169 19.3728 20.3625 19.0332 20.6309 18.6387C20.9071 18.2329 21.073 17.714 21.1604 16.8712C21.2491 16.0152 21.25 14.9117 21.25 13.3636C21.25 11.8156 21.2491 10.7121 21.1604 9.85604C21.073 9.01325 20.9071 8.49435 20.6309 8.08857C20.3625 7.6941 20.0169 7.35452 19.6134 7.08978C19.0746 6.73636 18.3523 6.57069 17.0037 6.51078C15.979 6.50186 15.1274 5.74659 14.9318 4.78607C14.8109 4.19299 14.2748 3.75 13.6337 3.75H10.3663ZM14.5197 8.25C14.9339 8.25 15.2697 8.58579 15.2697 9V10.6799C15.2697 11.0346 15.0213 11.3408 14.6742 11.4138L13.1545 11.7339C12.7492 11.8193 12.3514 11.5599 12.2661 11.1546C12.1928 10.8065 12.3737 10.4641 12.6828 10.3202C11.8617 10.0792 10.9379 10.2825 10.2902 10.9303C9.34597 11.8745 9.34597 13.4053 10.2902 14.3495C11.2343 15.2937 12.7652 15.2937 13.7094 14.3495C14.112 13.9469 14.3422 13.4396 14.4019 12.9152C14.4487 12.5037 14.8203 12.208 15.2319 12.2548C15.6434 12.3016 15.9391 12.6732 15.8923 13.0848C15.7957 13.9341 15.421 14.7592 14.77 15.4101C13.24 16.9401 10.7595 16.9401 9.2295 15.4101C7.69953 13.8802 7.69953 11.3996 9.2295 9.86963C10.4581 8.64105 12.2996 8.39903 13.7697 9.14355V9C13.7697 8.58579 14.1055 8.25 14.5197 8.25Z',
    },

    info: {
        size: '24',
        vb: '0 -960 960 960',
        fill: 'currentColor',
        d: 'M440-280h80v-240h-80v240Zm40-320q17 0 28.5-11.5T520-640q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640q0 17 11.5 28.5T480-600Zm0 520q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
    },

    settings: {
        size: '24',
        vb: '0 0 24 24',
        fill: 'currentColor',
        d: [
            'M12 8C14.2091 8 16 9.79086 16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 9.7998 12 8ZM12 9.7998C10.785 9.7998 9.7998 10.785 9.7998 12C9.7998 13.215 10.785 14.2002 12 14.2002C13.215 14.2002 14.2002 13.215 14.2002 12C14.2002 10.785 13.215 9.7998 12 9.7998Z',
            'M12.7119 2.2002C13.1961 2.20028 13.6296 2.49055 13.8164 2.93066L13.8506 3.02051L14.3652 4.56641C14.7875 4.70091 15.1932 4.87075 15.5801 5.07129L17.042 4.3418L17.1299 4.30176C17.5436 4.13502 18.017 4.21245 18.3564 4.50195L18.4268 4.56641L19.4336 5.57324C19.7985 5.93836 19.8889 6.49621 19.6582 6.95801L18.9268 8.41895C19.1274 8.80592 19.2971 9.21159 19.4316 9.63379L20.9795 10.1504C21.4693 10.3138 21.7997 10.7717 21.7998 11.2881V12.7119C21.7997 13.2284 21.4695 13.6873 20.9795 13.8506L19.4316 14.3652C19.2971 14.7875 19.1274 15.1932 18.9268 15.5801L19.6582 17.042C19.8889 17.5038 19.7985 18.0616 19.4336 18.4268L18.4268 19.4336C18.0616 19.7985 17.5038 19.8889 17.042 19.6582L15.5801 18.9268C15.1932 19.1274 14.7875 19.2971 14.3652 19.4316L13.8506 20.9795C13.6873 21.4695 13.2284 21.7997 12.7119 21.7998H11.2881C10.7717 21.7997 10.3138 21.4693 10.1504 20.9795L9.63379 19.4316C9.21159 19.2971 8.80592 19.1274 8.41895 18.9268L6.95801 19.6582C6.49621 19.8889 5.93836 19.7985 5.57324 19.4336L4.56641 18.4268C4.20146 18.0617 4.1112 17.5038 4.3418 17.042L5.07129 15.5801C4.87075 15.1932 4.70091 14.7875 4.56641 14.3652L3.02051 13.8506C2.53057 13.6873 2.20029 13.2283 2.2002 12.7119V11.2881C2.20024 10.7718 2.53076 10.3139 3.02051 10.1504L4.56641 9.63379C4.70094 9.21149 4.86966 8.80498 5.07031 8.41797L4.3418 6.95801C4.11113 6.49617 4.20145 5.93834 4.56641 5.57324L5.57324 4.56641C5.93834 4.20145 6.49617 4.11113 6.95801 4.3418L8.41797 5.07031C8.80498 4.86966 9.21149 4.70094 9.63379 4.56641L10.1504 3.02051L10.1836 2.92969C10.3706 2.49001 10.8042 2.20023 11.2881 2.2002H12.7119ZM11.0186 5.4707L10.8809 5.88477L10.458 5.99316C9.88479 6.13982 9.34317 6.36768 8.84473 6.66309L8.46875 6.88477L8.0791 6.69043L6.50098 5.90137L5.90137 6.50098L6.69043 8.0791L6.88477 8.46875L6.66309 8.84473C6.36768 9.34317 6.13982 9.88479 5.99316 10.458L5.88477 10.8809L5.4707 11.0186L3.7998 11.5762V12.4229L5.4707 12.9805L5.88477 13.1182L5.99316 13.541C6.13969 14.1141 6.36763 14.6556 6.66309 15.1543L6.88477 15.5303L6.69043 15.9199L5.90137 17.498L6.50098 18.0977L8.0791 17.3086L8.46875 17.1133L8.84473 17.3359C9.34314 17.6314 9.88463 17.8591 10.458 18.0059L10.8809 18.1143L11.0186 18.5283L11.5771 20.2002H12.4229L13.1182 18.1143L13.541 18.0059C14.1143 17.8593 14.6556 17.6314 15.1543 17.3359L15.5303 17.1143L15.9199 17.3086L17.498 18.0977L18.0977 17.498L17.3086 15.9199L17.1143 15.5303L17.3359 15.1543C17.6314 14.6556 17.8593 14.1143 18.0059 13.541L18.1143 13.1182L20.2002 12.4229V11.5762L18.1143 10.8809L18.0059 10.458C17.8591 9.88463 17.6314 9.34314 17.3359 8.84473L17.1133 8.46875L17.3086 8.0791L18.0977 6.50098L17.498 5.90137L15.9199 6.69043L15.5303 6.88477L15.1543 6.66309C14.6556 6.36763 14.1141 6.13969 13.541 5.99316L13.1182 5.88477L12.9805 5.4707L12.4229 3.7998H11.5762L11.0186 5.4707Z',
        ],
    },
    stopHotspot: {
        size: '24',
        vb: '0 0 24 24',
        fill: 'currentColor',
        d: ['M6 19h4V5H6v14zm8-14v14h4V5h-4z'],
    },
    startHotspot: {
        size: '24',
        vb: '0 0 24 24',
        fill: 'currentColor',
        d: ['M8 5v14l11-7z'],
    },
    showHotspotButton: {
        size: '24',
        vb: '0 0 24 24',
        fill: 'currentColor',
        d: ['M4 20h2.5l1-3h9l1 3H20L13.5 4h-3L4 20zm4.6-5 2.4-6.4L13.4 15H8.6z'],
    },
    hideHotspotButton: {
        size: '24',
        vb: '0 0 24 24',
        fill: 'currentColor',
        d: ['M4 20h2.5l1-3h9l1 3H20L13.5 4h-3L4 20zm4.6-5 2.4-6.4L13.4 15H8.6z'],
    },
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
function createControlBotGroup() {
    const group = document.createElement('div')
    group.className = 'buttonGroup'
    // buttons: [id, iconKey]
    const buttons = [
        ['resetCamera', 'resetCamera'],
        ['info', 'info'],
        ['settings', 'settings'],
    ]

    buttons.forEach(([id, icon]) => group.appendChild(createButton(id, icon)))
    return group
}
function createHotspotActionGroup(tooltip, events, dom) {
    const group = document.createElement('div')
    group.id = 'hotspotActionGroup'
    dom['hotspotActionGroup'] = group
    group.className = 'buttonGroup'
    // buttons: [id, iconKey, label, defaultShow, event]
    const buttons = [
        ['stopHotspot', 'stopHotspot', 'Stop Auto Play', false, 'stop-auto'],
        ['startHotspot', 'startHotspot', 'Auto Play', true, 'start-auto'],
        ['hideHotspotButton', 'hideHotspotButton', 'Message Disable', !isMobile, 'hide-hotspot-btns'],
        ['showHotspotButton', 'showHotspotButton', 'Message Enable', isMobile, 'show-hotspot-btns'],
    ]
    buttons.forEach(([id, icon, label, defaultShow, eventname]) => {
        const el = createButton(id, icon)
        dom[id] = el
        el.addEventListener('click', () => {
            events.fire(`hotspot:${eventname}`)
        })
        if (defaultShow) el.classList.remove('hidden')
        else el.classList.add('hidden')
        group.appendChild(el)
        tooltip.register(el, label, 'top')
    })
    return group
}
function createControlsWrap() {
    const wrap = document.createElement('div')
    wrap.id = 'controlsWrap'
    wrap.className = 'hidden'

    const container = document.createElement('div')
    container.id = 'buttonsContainer'

    container.appendChild(createControlBotGroup())
    wrap.appendChild(container)
    const hotspotcontainer = document.createElement('div')
    hotspotcontainer.id = 'hotspotContainer'
    wrap.appendChild(hotspotcontainer)
    return wrap
}
function createSettingsPanel() {
    const panel = document.createElement('div')
    panel.id = 'settingsPanel'
    panel.classList.add('setting-panel', 'hidden')

    const viewOptionHeader = document.createElement('div')
    viewOptionHeader.className = 'view-option-header'
    viewOptionHeader.textContent = 'View Options'

    const viewOptionContent = document.createElement('div')
    viewOptionContent.className = 'view-option-content'

    const optionGroup = document.createElement('div')
    optionGroup.className = 'optionGroup'

    const optionTitle = document.createElement('div')
    optionTitle.className = 'option-title'
    optionTitle.textContent = 'Quality'

    const qualityOptions = document.createElement('div')
    qualityOptions.className = 'quality-options'

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

        labelEl.appendChild(input)
        labelEl.append(` ${label}`)
        qualityOptions.appendChild(labelEl)
    })

    optionGroup.appendChild(optionTitle)
    optionGroup.appendChild(qualityOptions)
    viewOptionContent.appendChild(optionGroup)
    panel.appendChild(viewOptionHeader)
    panel.appendChild(viewOptionContent)
    return panel
}
function createVec3Inputs({ title = '', defaultValues = { x: 0, y: 0, z: 0 }, step = '1', onChange } = {}) {
    const AXIS = ['x', 'y', 'z']
    const COLORS = { x: '#e85555', y: '#55cc55', z: '#5588ff' }
    const inputEls = {}

    const row = document.createElement('div')
    row.classList.add('orientation-inputs')

    AXIS.forEach((axis) => {
        const col = document.createElement('div')
        col.classList.add('axis-col')

        const label = document.createElement('span')
        label.classList.add('axis-label')
        label.textContent = axis.toUpperCase()
        label.style.color = COLORS[axis]

        const input = document.createElement('input')
        input.type = 'number'
        input.value = defaultValues[axis].toFixed(1)
        input.step = step
        input.disabled = true

        input.addEventListener('input', () => {
            onChange?.({
                x: parseFloat(inputEls.x.value) || 0,
                y: parseFloat(inputEls.y.value) || 0,
                z: parseFloat(inputEls.z.value) || 0,
            })
        })

        col.appendChild(label)
        col.appendChild(input)
        row.appendChild(col)
        inputEls[axis] = input
    })

    const setEditable = (on) => {
        AXIS.forEach((axis) => {
            const el = inputEls[axis]
            el.disabled = !on
            el.style.border = on ? `0.5px solid ${COLORS[axis]}88` : '0.5px solid rgba(0,0,0,0.13)'
            el.style.background = on ? '#fff' : 'rgba(0,0,0,0.04)'
            el.style.color = on ? '#2d3748' : 'rgba(0,0,0,0.3)'
            el.style.cursor = on ? 'text' : 'not-allowed'
        })
    }

    const setValues = ({ x, y, z }) => {
        inputEls.x.value = x.toFixed(1)
        inputEls.y.value = y.toFixed(1)
        inputEls.z.value = z.toFixed(1)
    }
    const wrapper = document.createElement('div')
    wrapper.classList.add('section-group-row')

    if (title) {
        const titleEl = document.createElement('span')
        titleEl.textContent = title
        titleEl.classList.add('vec3-input-label')
        wrapper.appendChild(titleEl)
    }

    wrapper.appendChild(row)

    return { row: wrapper, setEditable, setValues }
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
                // viewer.setSHBands(0)
                // dom.lowQuality.checked = true
                global.modal.open(
                    'Performance Warning',
                    'Your device seems to be running slowly.<br>' +
                        'You can go to <strong>View Options</strong> and select a lower quality setting for better performance.',
                        'top'
                )
            }
        }
    })
}
