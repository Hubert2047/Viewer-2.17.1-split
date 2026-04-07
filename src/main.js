const initPoster = (events) => {
    const poster = document.getElementById('poster')
    events.on('loaded:changed', () => {
        poster.style.display = 'none'
        document.documentElement.style.setProperty('--canvas-opacity', '1')
    })
    const blur = (progress) => {
        poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`
    }
    events.on('progress:changed', blur)
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

function initHotspotSection(body, global, dom) {
    const editor = new HotspotEditorUI(body, { dom, global })
    editor.mount()
    const manager = new HotspotManager({ global, editor, dom: dom })

    return manager
}

function createSection({ id, title, body: renderBody, classname = '' }) {
    const section = document.createElement('div')
    section.classList.add('section')
    const header = document.createElement('div')
    header.classList.add('section-header')
    const titleEl = document.createElement('span')
    titleEl.textContent = title
    const chevron = document.createElement('span')
    chevron.classList.add('section-icon')
    header.appendChild(titleEl)
    header.appendChild(chevron)
    const body = document.createElement('div')
    body.classList.add('section-body', classname)
    body.id = `sidebar-section-${id}`
    renderBody(body)
    body.style.display = 'none'
    header.addEventListener('click', () => {
        const isOpen = body.style.display !== 'none'
        document.querySelectorAll('[data-sidebar-body]').forEach((el) => {
            el.style.display = 'none'
        })
        document.querySelectorAll('[data-sidebar-chevron]').forEach((el) => {
            el.style.transform = ''
        })
        if (!isOpen) {
            body.style.display = 'block'
            chevron.style.transform = 'rotate(90deg)'
        }
    })
    body.dataset.sidebarBody = id
    chevron.dataset.sidebarChevron = id
    section.appendChild(header)
    section.appendChild(body)
    return section
}

function initviewSection(el, global) {}
function exportSection(el) {
    const filenameField = document.createElement('div')
    filenameField.classList.add('hotspot-field')

    const label = document.createElement('div')
    label.classList.add('hotspot-label')
    label.textContent = 'File Name'

    const inputWrap = document.createElement('div')
    inputWrap.classList.add('export-input-wrap')

    const input = document.createElement('input')
    input.type = 'text'
    input.value = 'index'
    input.id = 'export-filename'
    input.classList.add('input-field')

    const ext = document.createElement('span')
    ext.classList.add('export-ext')
    ext.textContent = '.html'

    inputWrap.appendChild(input)
    inputWrap.appendChild(ext)
    filenameField.appendChild(label)
    filenameField.appendChild(inputWrap)
    el.appendChild(filenameField)

    const btn = document.createElement('button')
    btn.classList.add('export-btn')
    btn.textContent = 'Export HTML'
    btn.addEventListener('click', () => {
        const filename = (input.value.trim() || 'index') + '.html'
        exportHtml(filename, window.sse)
    })
    el.appendChild(btn)
}

function createSidebar(global, dom) {
    const SIDEBAR_WIDTH = '360px'
    const sidebar = document.createElement('div')
    sidebar.id = 'app-sidebar'
    sidebar.classList.add('sidebar')
    sidebar.style.cssText = `width: ${SIDEBAR_WIDTH}`
    const header = document.createElement('div')
    header.classList.add('sidebar-header')
    header.textContent = 'Settings'
    sidebar.appendChild(header)
    sidebar.appendChild(
        createSection({
            id: 'initview',
            title: 'Initview',
            classname: 'initview-section',
            body: (el) => initviewSection(el, global),
        }),
    )
    sidebar.appendChild(
        createSection({
            id: 'hotspot',
            title: 'Hotspots',
            classname: 'hotspot-section',
            body: (el) => initHotspotSection(el, global, dom),
        }),
    )
    sidebar.appendChild(
        createSection({
            id: 'export',
            title: 'Export',
            classname: 'export-section',
            body: (el) => exportSection(el),
        }),
    )
    document.body.appendChild(sidebar)
    const canvas = global.app.graphicsDevice.canvas
    canvas.style.width = `calc(100% - ${SIDEBAR_WIDTH})`
    document.getElementById('ui').style.width = `calc(100% - ${SIDEBAR_WIDTH})`
}
const initUI = (global) => {
    const { config, events, state, settings } = global
    const dom = [
        'ui',
        'resetCamera',
        'controlsWrap',
        'info',
        'infoPanel',
        'desktopTab',
        'touchTab',
        'desktopInfoPanel',
        'touchInfoPanel',
        'handle',
        'time',
        'buttonContainer',
        'play',
        'pause',
        'settings',
        'settingsPanel',
        'reset',
        'frame',
        'loadingText',
        'loadingBar',
        'tooltip',
    ].reduce((acc, id) => {
        acc[id] = document.getElementById(id)
        return acc
    }, {})
    // Remove focus from buttons after click so keyboard input isn't captured by the UI
    dom.ui.addEventListener('click', () => {
        document.activeElement?.blur()
    })
    // Forward wheel events from UI overlays to the canvas so the camera zooms
    // instead of the page scrolling (e.g. annotation nav, tooltips, hotspots)
    const canvas = global.app.graphicsDevice.canvas
    canvas.addEventListener('pointerup', (event) => {
        events.fire('pointerup', event)
    })
    dom.ui.addEventListener(
        'wheel',
        (event) => {
            event.preventDefault()
            canvas.dispatchEvent(new WheelEvent(event.type, event))
        },
        { passive: false },
    )
    // Handle loading progress updates
    events.on('progress:changed', (progress) => {
        dom.loadingText.textContent = `${progress}%`
        if (progress < 100) {
            dom.loadingBar.style.backgroundImage = `linear-gradient(90deg, #F60 0%, #F60 ${progress}%, white ${progress}%, white 100%)`
        } else {
            dom.loadingBar.style.backgroundImage = 'linear-gradient(90deg, #F60 0%, #F60 100%)'
        }
    })
    // Hide loading bar once loaded
    events.on('loaded:changed', () => {
        document.getElementById('loadingWrap').classList.add('hidden')
    })
    // Info panel
    const updateInfoTab = (tab) => {
        if (tab === 'desktop') {
            dom.desktopTab.classList.add('active')
            dom.touchTab.classList.remove('active')
            dom.desktopInfoPanel.classList.remove('hidden')
            dom.touchInfoPanel.classList.add('hidden')
        } else {
            dom.desktopTab.classList.remove('active')
            dom.touchTab.classList.add('active')
            dom.desktopInfoPanel.classList.add('hidden')
            dom.touchInfoPanel.classList.remove('hidden')
        }
    }
    dom.desktopTab.addEventListener('click', () => {
        updateInfoTab('desktop')
    })
    dom.touchTab.addEventListener('click', () => {
        updateInfoTab('touch')
    })
    const toggleHelp = () => {
        updateInfoTab(state.inputMode)
        dom.infoPanel.classList.toggle('hidden')
    }
    dom.info.addEventListener('click', toggleHelp)
    dom.infoPanel.addEventListener('pointerdown', () => {
        dom.infoPanel.classList.add('hidden')
    })
    events.on('inputEvent', (event) => {
        if (event === 'toggleHelp') {
            toggleHelp()
        } else if (event === 'cancel') {
            // close info panel on cancel
            dom.infoPanel.classList.add('hidden')
            dom.settingsPanel.classList.add('hidden')
        } else if (event === 'interrupt') {
            dom.settingsPanel.classList.add('hidden')
        }
    })
    // fade ui controls after 5 seconds of inactivity
    events.on('controlsHidden:changed', (value) => {
        dom.controlsWrap.classList.toggle('faded-out', value)
        dom.controlsWrap.classList.toggle('faded-in', !value)
    })
    // show the ui and start a timer to hide it again
    let uiTimeout = null
    let annotationVisible = false
    const showUI = () => {
        if (uiTimeout) {
            clearTimeout(uiTimeout)
        }
        state.controlsHidden = false
        uiTimeout = setTimeout(() => {
            uiTimeout = null
            if (!annotationVisible && settings.autoHideUI) {
                state.controlsHidden = true
            }
        }, 4000)
    }
    // Show controls once loaded
    events.on('loaded:changed', () => {
        dom.controlsWrap.classList.remove('hidden')
        showUI()
    })
    events.on('inputEvent', showUI)
    // keep UI visible while an annotation tooltip is shown
    events.on('annotation.activate', () => {
        annotationVisible = true
        showUI()
    })
    events.on('annotation.deactivate', () => {
        annotationVisible = false
        showUI()
    })
    dom.settings.addEventListener('click', () => {
        dom.settingsPanel.classList.toggle('hidden')
    })
    dom.reset.addEventListener('click', (event) => {
        events.fire('inputEvent', 'reset', event)
    })
    dom.frame.addEventListener('click', (event) => {
        events.fire('inputEvent', 'frame', event)
    })
    // Initialize annotation navigator
    // initAnnotationNav(dom, events, state, global.settings.annotations)
    // Hide all UI (poster, loading bar, controls)
    if (config.noui) {
        dom.ui.classList.add('hidden')
    }
    // tooltips
    const tooltip = new Tooltip(dom.tooltip)
    tooltip.register(dom.resetCamera, 'Reset Camera', 'top')
    tooltip.register(dom.settings, 'Settings', 'top')
    tooltip.register(dom.info, 'Controls', 'top')
    const isThirdPartyEmbedded = () => {
        try {
            return window.location.hostname !== window.parent.location.hostname
        } catch (e) {
            // cross-origin iframe — parent location is inaccessible
            return true
        }
    }
    if (window.parent !== window && isThirdPartyEmbedded()) {
        const viewUrl = new URL(window.location.href)
        if (viewUrl.pathname === '/s') {
            viewUrl.pathname = '/view'
        }
    }
    if (config.editable) {
        createSidebar(global, dom)
    }
}

// clamp the vertices of the hotspot so it is never clipped by the near or far plane
const depthClampGlsl = `
    float f = gl_Position.z / gl_Position.w;
    if (f > 1.0) {
        gl_Position.z = gl_Position.w;
    } else if (f < -1.0) {
        gl_Position.z = -gl_Position.w;
    }
`
const depthClampWgsl = `
    let f = output.position.z / output.position.w;
    if (f > 1.0) {
        output.position.z = output.position.w;
    } else if (f < -1.0) {
        output.position.z = -output.position.w;
    }
`
const vec$2 = new Vec3()
/**
 * A script for creating interactive 3D annotations in a scene. Each annotation consists of:
 *
 * - A 3D hotspot that maintains constant screen-space size. The hotspot is rendered with muted
 * appearance when obstructed by geometry but is still clickable. The hotspot relies on an
 * invisible DOM element that matches the hotspot's size and position to detect clicks.
 * - An annotation panel that shows title and description text.
 */
class Annotation extends Script {
    static scriptName = 'annotation'
    static hotspotSize = 25
    static hotspotColor = new Color(0.8, 0.8, 0.8)
    static hoverColor = new Color(1.0, 0.4, 0.0)
    static parentDom = null
    static styleSheet = null
    static camera = null
    static tooltipDom = null
    static titleDom = null
    static textDom = null
    static layers = []
    static mesh = null
    static activeAnnotation = null
    static hoverAnnotation = null
    static opacity = 1.0
    /**
     * @attribute
     */
    label
    /**
     * @attribute
     */
    title
    /**
     * @attribute
     */
    text
    /**
     * @private
     */
    hotspotDom = null
    /**
     * @private
     */
    texture = null
    /**
     * @private
     */
    materials = []
    /**
     * Injects required CSS styles into the document.
     * @param {number} size - The size of the hotspot in screen pixels.
     * @private
     */
    static _injectStyles(size) {
        const css = `
            .pc-annotation {
                display: block;
                position: absolute;
                background-color: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px;
                border-radius: 4px;
                font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
                pointer-events: none;
                max-width: 200px;
                word-wrap: break-word;
                overflow-x: visible;
                white-space: normal;
                width: fit-content;
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
                visibility: hidden;
            }

            .pc-annotation-title {
                font-weight: bold;
                margin-bottom: 4px;
            }

            /* Tooltip arrow */
            .pc-annotation.arrow-right::before,
            .pc-annotation.arrow-left::before {
                content: "";
                position: absolute;
                top: var(--arrow-top, 50%);
                transform: translateY(-50%);
                border-top: 8px solid transparent;
                border-bottom: 8px solid transparent;
            }

            .pc-annotation.arrow-right::before {
                left: -8px;
                border-right: 8px solid rgba(0, 0, 0, 0.8);
            }

            .pc-annotation.arrow-left::before {
                right: -8px;
                border-left: 8px solid rgba(0, 0, 0, 0.8);
            }

            .pc-annotation-hotspot {
                display: none;
                position: absolute;
                width: ${size + 5}px;
                height: ${size + 5}px;
                opacity: 0;
                cursor: pointer;
                transform: translate(-50%, -50%);
            }
        `
        const style = document.createElement('style')
        style.textContent = css
        document.head.appendChild(style)
        Annotation.styleSheet = style
    }
    /**
     * Initialize static resources.
     * @param {AppBase} app - The application instance
     * @private
     */
    static _initializeStatic(app) {
        if (Annotation.styleSheet) {
            return
        }
        Annotation._injectStyles(Annotation.hotspotSize)
        if (Annotation.parentDom === null) {
            Annotation.parentDom = document.body
        }
        const { layers } = app.scene
        const worldLayer = layers.getLayerByName('World')
        const createLayer = (name, semitrans) => {
            const layer = new Layer({ name: name })
            const idx = semitrans ? layers.getTransparentIndex(worldLayer) : layers.getOpaqueIndex(worldLayer)
            layers.insert(layer, idx + 1)
            return layer
        }
        Annotation.layers = [createLayer('HotspotBase', false), createLayer('HotspotOverlay', true)]
        if (Annotation.camera === null) {
            Annotation.camera = app.root.findComponent('camera').entity
        }
        Annotation.camera.camera.layers = [
            ...Annotation.camera.camera.layers,
            ...Annotation.layers.map((layer) => layer.id),
        ]
        Annotation.mesh = Mesh.fromGeometry(
            app.graphicsDevice,
            new PlaneGeometry({
                widthSegments: 1,
                lengthSegments: 1,
            }),
        )
        // Initialize tooltip dom
        Annotation.tooltipDom = document.createElement('div')
        Annotation.tooltipDom.className = 'pc-annotation'
        Annotation.titleDom = document.createElement('div')
        Annotation.titleDom.className = 'pc-annotation-title'
        Annotation.tooltipDom.appendChild(Annotation.titleDom)
        Annotation.textDom = document.createElement('div')
        Annotation.textDom.className = 'pc-annotation-text'
        Annotation.tooltipDom.appendChild(Annotation.textDom)
        Annotation.parentDom.appendChild(Annotation.tooltipDom)
    }
    /**
     * Creates a circular hotspot texture.
     * @param {AppBase} app - The PlayCanvas AppBase
     * @param {string} label - Label text to draw on the hotspot
     * @param {number} [size] - The texture size (should be power of 2)
     * @param {number} [borderWidth] - The border width in pixels
     * @returns {Texture} The hotspot texture
     * @private
     */
    static _createHotspotTexture(app, label, size = 64, borderWidth = 6) {
        // Create canvas for hotspot texture
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        // First clear with stroke color at zero alpha
        ctx.fillStyle = 'white'
        ctx.globalAlpha = 0
        ctx.fillRect(0, 0, size, size)
        ctx.globalAlpha = 1.0
        // Draw dark circle with light border
        const centerX = size / 2
        const centerY = size / 2
        const radius = size / 2 - 4 // Leave space for border
        // Draw main circle
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.fillStyle = 'black'
        ctx.fill()
        // Draw border
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
        ctx.lineWidth = borderWidth
        ctx.strokeStyle = 'white'
        ctx.stroke()
        // Draw text
        ctx.font = 'bold 32px Arial'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = 'white'
        ctx.fillText(label, Math.floor(canvas.width / 2), Math.floor(canvas.height / 2) + 1)
        // get pixel data
        const imageData = ctx.getImageData(0, 0, size, size)
        const data = imageData.data
        // set the color channel of semitransparent pixels to white so the blending at
        // the edges is correct
        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3]
            if (a < 255) {
                data[i] = 255
                data[i + 1] = 255
                data[i + 2] = 255
            }
        }
        const texture = new Texture(app.graphicsDevice, {
            width: size,
            height: size,
            format: PIXELFORMAT_RGBA8,
            magFilter: FILTER_LINEAR,
            minFilter: FILTER_LINEAR,
            mipmaps: false,
            levels: [new Uint8Array(data.buffer)],
        })
        return texture
    }
    /**
     * Creates a material for hotspot rendering.
     * @param {Texture} texture - The texture to use for emissive and opacity
     * @param {object} [options] - Material options
     * @param {number} [options.opacity] - Base opacity multiplier
     * @param {boolean} [options.depthTest] - Whether to perform depth testing
     * @param {boolean} [options.depthWrite] - Whether to write to depth buffer
     * @returns {StandardMaterial} The configured material
     * @private
     */
    static _createHotspotMaterial(texture, { opacity = 1, depthTest = true, depthWrite = true } = {}) {
        const material = new StandardMaterial()
        // Base properties
        material.diffuse = Color.BLACK
        material.emissive.copy(Annotation.hotspotColor)
        material.emissiveMap = texture
        material.opacityMap = texture
        // Alpha properties
        material.opacity = opacity
        material.alphaTest = 0.01
        material.blendState = new BlendState(
            true,
            BLENDEQUATION_ADD,
            BLENDMODE_SRC_ALPHA,
            BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD,
            BLENDMODE_ONE,
            BLENDMODE_ONE,
        )
        // Depth properties
        material.depthTest = depthTest
        material.depthWrite = depthWrite
        // Rendering properties
        material.cull = CULLFACE_NONE
        material.useLighting = false
        material.shaderChunks.glsl.add({
            litUserMainEndVS: depthClampGlsl,
        })
        material.shaderChunks.wgsl.add({
            litUserMainEndVS: depthClampWgsl,
        })
        material.update()
        return material
    }
    initialize() {
        // Ensure static resources are initialized
        Annotation._initializeStatic(this.app)
        // Create texture
        this.texture = Annotation._createHotspotTexture(this.app, this.label)
        // Create material the base and overlay material
        this.materials = [
            Annotation._createHotspotMaterial(this.texture, {
                opacity: 1,
                depthTest: true,
                depthWrite: true,
            }),
            Annotation._createHotspotMaterial(this.texture, {
                opacity: 0.25,
                depthTest: false,
                depthWrite: false,
            }),
        ]
        const base = new Entity('base')
        const baseMi = new MeshInstance(Annotation.mesh, this.materials[0])
        baseMi.cull = false
        base.addComponent('render', {
            layers: [Annotation.layers[0].id],
            meshInstances: [baseMi],
        })
        const overlay = new Entity('overlay')
        const overlayMi = new MeshInstance(Annotation.mesh, this.materials[1])
        overlayMi.cull = false
        overlay.addComponent('render', {
            layers: [Annotation.layers[1].id],
            meshInstances: [overlayMi],
        })
        this.entity.addChild(base)
        this.entity.addChild(overlay)
        // Create hotspot dom
        this.hotspotDom = document.createElement('div')
        this.hotspotDom.className = 'pc-annotation-hotspot'
        // Add click handlers
        this.hotspotDom.addEventListener('click', (e) => {
            e.stopPropagation()
            this.showTooltip()
        })
        const leave = () => {
            if (Annotation.hoverAnnotation === this) {
                Annotation.hoverAnnotation = null
                this.setHover(false)
            }
        }
        const enter = () => {
            if (Annotation.hoverAnnotation !== null) {
                Annotation.hoverAnnotation.setHover(false)
            }
            Annotation.hoverAnnotation = this
            this.setHover(true)
        }
        this.hotspotDom.addEventListener('pointerenter', enter)
        this.hotspotDom.addEventListener('pointerleave', leave)
        document.addEventListener('click', () => {
            if (Annotation.activeAnnotation === this) {
                this.hideTooltip()
            }
        })
        Annotation.parentDom.appendChild(this.hotspotDom)
        // Clean up on entity destruction
        this.on('destroy', () => {
            this.hotspotDom.remove()
            if (Annotation.activeAnnotation === this) {
                this.hideTooltip()
            }
            this.materials.forEach((mat) => mat.destroy())
            this.materials = []
            this.texture.destroy()
            this.texture = null
        })
        this.app.on('prerender', () => {
            this._update()
        })
    }
    /**
     * Update screen-space elements and materials for this annotation. Called each frame from the
     * prerender callback, and also directly from showTooltip to ensure the tooltip is positioned
     * correctly even when the camera hasn't moved (e.g. annotations sharing the same camera pose).
     * @private
     */
    _update() {
        if (!Annotation.camera) return
        const position = this.entity.getPosition()
        const screenPos = Annotation.camera.camera.worldToScreen(position)
        const { viewMatrix } = Annotation.camera.camera
        viewMatrix.transformPoint(position, vec$2)
        if (vec$2.z >= 0) {
            this._hideElements()
            return
        }
        this._updatePositions(screenPos)
        this._updateRotationAndScale(-vec$2.z)
        // update material opacity and also directly on the uniform so we
        // can avoid a full material update
        this.materials[0].opacity = Annotation.opacity
        this.materials[1].opacity = 0.25 * Annotation.opacity
        this.materials[0].setParameter('material_opacity', Annotation.opacity)
        this.materials[1].setParameter('material_opacity', 0.25 * Annotation.opacity)
    }
    /**
     * Set the hover state of the annotation.
     * @param hover - Whether the annotation is hovered
     * @private
     */
    setHover(hover) {
        this.materials.forEach((material) => {
            material.emissive.copy(hover ? Annotation.hoverColor : Annotation.hotspotColor)
            material.update()
        })
        this.fire('hover', hover)
    }
    /**
     * @private
     */
    showTooltip() {
        Annotation.activeAnnotation = this
        Annotation.tooltipDom.style.visibility = 'visible'
        Annotation.tooltipDom.style.opacity = '1'
        Annotation.titleDom.textContent = this.title
        Annotation.textDom.textContent = this.text
        // Immediately update incase the camera doesn't move
        this._update()
        this.fire('show', this)
    }
    /**
     * @private
     */
    hideTooltip() {
        Annotation.activeAnnotation = null
        Annotation.tooltipDom.style.opacity = '0'
        // Wait for fade out before hiding
        setTimeout(() => {
            if (Annotation.tooltipDom.style.opacity === '0') {
                Annotation.tooltipDom.style.visibility = 'hidden'
                this.fire('hide')
            }
        }, 200) // Match the transition duration
    }
    /**
     * Hide all elements when annotation is behind camera.
     * @private
     */
    _hideElements() {
        this.hotspotDom.style.display = 'none'
        if (Annotation.activeAnnotation === this) {
            Annotation.tooltipDom.style.visibility = 'hidden'
            Annotation.tooltipDom.style.opacity = '0'
        }
    }
    /**
     * Update screen-space positions of HTML elements.
     * @param {Vec3} screenPos - Screen coordinate
     * @private
     */
    _updatePositions(screenPos) {
        // Show and position hotspot
        this.hotspotDom.style.display = 'block'
        this.hotspotDom.style.left = `${screenPos.x}px`
        this.hotspotDom.style.top = `${screenPos.y}px`
        // Re-show tooltip if it was hidden while behind camera
        if (Annotation.activeAnnotation === this) {
            Annotation.tooltipDom.style.visibility = 'visible'
            Annotation.tooltipDom.style.opacity = '1'
        }
        // Position tooltip, clamped to viewport
        if (Annotation.activeAnnotation === this) {
            const tooltip = Annotation.tooltipDom
            const margin = 8
            const arrowOffset = 25
            const tw = tooltip.offsetWidth
            const th = tooltip.offsetHeight
            const vw = window.innerWidth
            const vh = window.innerHeight
            // Default position: to the right of hotspot, vertically centered
            let left = screenPos.x + arrowOffset
            let top = screenPos.y - th / 2
            let flipped = false
            // If tooltip overflows right edge, flip to left side of hotspot
            if (left + tw > vw - margin) {
                left = screenPos.x - arrowOffset - tw
                flipped = true
            }
            // Clamp horizontal
            left = Math.max(margin, Math.min(left, vw - tw - margin))
            // Clamp vertical
            top = Math.max(margin, Math.min(top, vh - th - margin))
            // Position arrow to point at the hotspot, clamped within the tooltip
            const arrowY = Math.max(16, Math.min(screenPos.y - top, th - 16))
            tooltip.style.setProperty('--arrow-top', `${arrowY}px`)
            tooltip.classList.toggle('arrow-right', !flipped)
            tooltip.classList.toggle('arrow-left', flipped)
            tooltip.style.transform = 'none'
            tooltip.style.left = `${left}px`
            tooltip.style.top = `${top}px`
        }
    }
    /**
     * Update 3D rotation and scale of hotspot planes.
     * @param {number} viewDepth - The view-space depth (positive distance along the camera's forward direction)
     * @private
     */
    _updateRotationAndScale(viewDepth) {
        // Copy camera rotation to align with view plane
        const cameraRotation = Annotation.camera.getRotation()
        this._updateHotspotTransform(this.entity, cameraRotation)
        // Calculate scale based on view depth to maintain constant screen size
        const scale = this._calculateScreenSpaceScale(viewDepth)
        this.entity.setLocalScale(scale, scale, scale)
    }
    /**
     * Update rotation of a single hotspot entity.
     * @param {Entity} hotspot - The hotspot entity to update
     * @param {Quat} cameraRotation - The camera's current rotation
     * @private
     */
    _updateHotspotTransform(hotspot, cameraRotation) {
        hotspot.setRotation(cameraRotation)
        hotspot.rotateLocal(90, 0, 0)
    }
    /**
     * Calculate scale factor to maintain constant screen-space size.
     * @param {number} viewDepth - The view-space depth (positive distance along the camera's forward direction)
     * @returns {number} The scale to apply to hotspot entities
     * @private
     */
    _calculateScreenSpaceScale(viewDepth) {
        // Use the canvas's CSS/client height instead of graphics device height
        const canvas = this.app.graphicsDevice.canvas
        const screenHeight = canvas.clientHeight
        // Use view-space depth (not Euclidean distance) to match the projection matrix
        const projMatrix = Annotation.camera.camera.projectionMatrix
        const worldSize = (Annotation.hotspotSize / screenHeight) * ((2 * viewDepth) / projMatrix.data[5])
        return worldSize
    }
}

class Annotations {
    annotations = []
    parentDom
    constructor(global, hasCameraFrame) {
        // create dom parent
        const parentDom = document.createElement('div')
        parentDom.id = 'annotations'
        Annotation.parentDom = parentDom
        document.querySelector('#ui').appendChild(parentDom)
        global.events.on('controlsHidden:changed', (value) => {
            parentDom.style.display = value ? 'none' : 'block'
            Annotation.opacity = value ? 0.0 : 1.0
            if (this.annotations.length > 0) {
                global.app.renderNextFrame = true
            }
        })
        this.annotations = global.settings.annotations
        this.parentDom = parentDom
        if (hasCameraFrame) {
            Annotation.hotspotColor.gamma()
            Annotation.hoverColor.gamma()
        }
        // create annotation entities
        const parent = global.app.root
        const scriptMap = new Map()
        for (let i = 0; i < this.annotations.length; i++) {
            const ann = this.annotations[i]
            const entity = new Entity()
            entity.addComponent('script')
            entity.script.create(Annotation)
            const script = entity.script
            script.annotation.label = (i + 1).toString()
            script.annotation.title = ann.title
            script.annotation.text = ann.text
            entity.setPosition(ann.position[0], ann.position[1], ann.position[2])
            parent.addChild(entity)
            scriptMap.set(ann, script.annotation)
            // handle an annotation being activated/shown
            script.annotation.on('show', () => {
                global.events.fire('annotation.activate', ann)
            })
            script.annotation.on('hide', () => {
                global.events.fire('annotation.deactivate')
            })
            // re-render if hover state changes
            script.annotation.on('hover', (hover) => {
                global.app.renderNextFrame = true
            })
        }
        // handle navigator requesting an annotation to be shown
        global.events.on('annotation.navigate', (ann) => {
            const script = scriptMap.get(ann)
            if (script) {
                script.showTooltip()
            }
        })
    }
}

/**
 * Creates a rotation animation track
 *
 * @param position - Starting location of the camera.
 * @param target - Target point around which to rotate
 * @param fov - The camera field of view.
 * @param keys - The number of keys in the animation.
 * @param duration - The duration of the animation in seconds.
 * @returns - The animation track object containing position and target keyframes.
 */
const createRotateTrack = (position, target, fov, keys = 12, duration = 20) => {
    const times = new Array(keys).fill(0).map((_, i) => (i / keys) * duration)
    const positions = []
    const targets = []
    const fovs = new Array(keys).fill(fov)
    const dx = position.x - target.x
    const dy = position.y - target.y
    const dz = position.z - target.z
    const horizontalRadius = Math.sqrt(dx * dx + dz * dz)
    const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    // when the offset is nearly vertical, use a fraction of the total distance
    // as the orbit radius so the camera actually moves in a circle
    const minRadius = totalDist * 0.3
    const radius = Math.max(horizontalRadius, minRadius)
    const startAngle = Math.atan2(dx, dz)
    for (let i = 0; i < keys; ++i) {
        const angle = startAngle - (i / keys) * Math.PI * 2
        positions.push(target.x + radius * Math.sin(angle))
        positions.push(target.y + dy)
        positions.push(target.z + radius * Math.cos(angle))
        targets.push(target.x)
        targets.push(target.y)
        targets.push(target.z)
    }
    return {
        name: 'rotate',
        duration,
        frameRate: 1,
        loopMode: 'repeat',
        interpolation: 'spline',
        smoothness: 1,
        keyframes: {
            times,
            values: {
                position: positions,
                target: targets,
                fov: fovs,
            },
        },
    }
}

class CubicSpline {
    // control times
    times
    // control data: in-tangent, point, out-tangent
    knots
    // dimension of the knot points
    dim
    constructor(times, knots) {
        this.times = times
        this.knots = knots
        this.dim = knots.length / times.length / 3
    }
    evaluate(time, result) {
        const { times } = this
        const last = times.length - 1
        if (time <= times[0]) {
            this.getKnot(0, result)
        } else if (time >= times[last]) {
            this.getKnot(last, result)
        } else {
            let seg = 0
            while (time >= times[seg + 1]) {
                seg++
            }
            this.evaluateSegment(seg, (time - times[seg]) / (times[seg + 1] - times[seg]), result)
        }
    }
    getKnot(index, result) {
        const { knots, dim } = this
        const idx = index * 3 * dim
        for (let i = 0; i < dim; ++i) {
            result[i] = knots[idx + i * 3 + 1]
        }
    }
    // evaluate the spline segment at the given normalized time t
    evaluateSegment(segment, t, result) {
        const { knots, dim } = this
        const t2 = t * t
        const twot = t + t
        const omt = 1 - t
        const omt2 = omt * omt
        let idx = segment * dim * 3 // each knot has 3 values: tangent in, value, tangent out
        for (let i = 0; i < dim; ++i) {
            const p0 = knots[idx + 1] // p0
            const m0 = knots[idx + 2] // outgoing tangent
            const m1 = knots[idx + dim * 3] // incoming tangent
            const p1 = knots[idx + dim * 3 + 1] // p1
            idx += 3
            result[i] = p0 * ((1 + twot) * omt2) + m0 * (t * omt2) + p1 * (t2 * (3 - twot)) + m1 * (t2 * (t - 1))
        }
    }
    // calculate cubic spline knots from points
    // times: time values for each control point
    // points: control point values to be interpolated (n dimensional)
    // smoothness: 0 = linear, 1 = smooth
    static calcKnots(times, points, smoothness) {
        const n = times.length
        const dim = points.length / n
        const knots = new Array(n * dim * 3)
        for (let i = 0; i < n; i++) {
            const t = times[i]
            for (let j = 0; j < dim; j++) {
                const idx = i * dim + j
                const p = points[idx]
                let tangent
                if (i === 0) {
                    tangent = (points[idx + dim] - p) / (times[i + 1] - t)
                } else if (i === n - 1) {
                    tangent = (p - points[idx - dim]) / (t - times[i - 1])
                } else {
                    tangent = (points[idx + dim] - points[idx - dim]) / (times[i + 1] - times[i - 1])
                }
                // convert to derivatives w.r.t normalized segment parameter
                const inScale = i > 0 ? times[i] - times[i - 1] : times[1] - times[0]
                const outScale = i < n - 1 ? times[i + 1] - times[i] : times[i] - times[i - 1]
                knots[idx * 3] = tangent * inScale * smoothness
                knots[idx * 3 + 1] = p
                knots[idx * 3 + 2] = tangent * outScale * smoothness
            }
        }
        return knots
    }
    static fromPoints(times, points, smoothness = 1) {
        return new CubicSpline(times, CubicSpline.calcKnots(times, points, smoothness))
    }
    // create a looping spline by duplicating animation points at the end and beginning
    static fromPointsLooping(length, times, points, smoothness = 1) {
        if (times.length < 2) {
            return CubicSpline.fromPoints(times, points)
        }
        const dim = points.length / times.length
        const newTimes = times.slice()
        const newPoints = points.slice()
        // append first two points
        newTimes.push(length + times[0], length + times[1])
        newPoints.push(...points.slice(0, dim * 2))
        // prepend last two points
        newTimes.splice(0, 0, times[times.length - 2] - length, times[times.length - 1] - length)
        newPoints.splice(0, 0, ...points.slice(points.length - dim * 2))
        return CubicSpline.fromPoints(newTimes, newPoints, smoothness)
    }
}

/**
 * Damping function to smooth out transitions.
 *
 * @param damping - Damping factor (0 < damping < 1).
 * @param dt - Delta time in seconds.
 * @returns - Damping factor adjusted for the delta time.
 */
const damp = (damping, dt) => 1 - Math.pow(damping, dt * 1000)
/**
 * Easing function for smooth transitions.
 *
 * @param x - Input value in the range [0, 1].
 * @returns - Output value in the range [0, 1].
 */
const easeOut = (x) => (1 - 2 ** (-10 * x)) / (1 - 2 ** -10)
/**
 * Modulus function that handles negative values correctly.
 *
 * @param n - The number to be modulated.
 * @param m - The modulus value.
 * @returns - The result of n mod m, adjusted to be non-negative.
 */
const mod = (n, m) => ((n % m) + m) % m
const nearlyEquals = (a, b, epsilon = 1e-4) => {
    return !a.some((v, i) => Math.abs(v - b[i]) >= epsilon)
}
const vecToAngles = (result, vec) => {
    const radToDeg = 180 / Math.PI
    const horizLenSq = vec.x * vec.x + vec.z * vec.z
    result.x = Math.asin(Math.max(-1, Math.min(1, vec.y))) * radToDeg
    result.y = horizLenSq > 1e-8 ? Math.atan2(-vec.x, -vec.z) * radToDeg : 0
    result.z = 0
    return result
}

// track an animation cursor with support for repeat and ping-pong loop modes
class AnimCursor {
    duration = 0
    loopMode = 'none'
    timer = 0
    cursor = 0
    constructor(duration, loopMode) {
        this.reset(duration, loopMode)
    }
    update(deltaTime) {
        // update animation timer
        this.timer += deltaTime
        // update the track cursor
        this.cursor += deltaTime
        if (this.cursor >= this.duration) {
            switch (this.loopMode) {
                case 'none':
                    this.cursor = this.duration
                    break
                case 'repeat':
                    this.cursor %= this.duration
                    break
                case 'pingpong':
                    this.cursor %= this.duration * 2
                    break
            }
        }
    }
    reset(duration, loopMode) {
        this.duration = duration
        this.loopMode = loopMode
        this.timer = 0
        this.cursor = 0
    }
    set value(value) {
        this.cursor = mod(value, this.duration)
    }
    get value() {
        return this.cursor > this.duration ? 2 * this.duration - this.cursor : this.cursor
    }
}

// manage the state of a camera animation track
class AnimState {
    spline
    cursor = new AnimCursor(0, 'none')
    frameRate
    result = []
    position = new Vec3()
    target = new Vec3()
    fov = 90
    constructor(spline, duration, loopMode, frameRate) {
        this.spline = spline
        this.cursor.reset(duration, loopMode)
        this.frameRate = frameRate
    }
    // update given delta time
    update(dt) {
        const { cursor, result, spline, frameRate, position, target } = this
        // update the animation cursor
        cursor.update(dt)
        // evaluate the spline
        spline.evaluate(cursor.value * frameRate, result)
        if (result.every(isFinite)) {
            position.set(result[0], result[1], result[2])
            target.set(result[3], result[4], result[5])
            this.fov = result[6]
        }
    }
    // construct an animation from a settings track
    static fromTrack(track) {
        const { keyframes, duration, frameRate, loopMode, smoothness } = track
        const { times, values } = keyframes
        const { position, target, fov } = values
        // construct the points array containing position, target and fov
        const points = []
        for (let i = 0; i < times.length; i++) {
            points.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2])
            points.push(target[i * 3], target[i * 3 + 1], target[i * 3 + 2])
            points.push(fov[i])
        }
        const extra = duration === times[times.length - 1] / frameRate ? 1 : 0
        const spline = CubicSpline.fromPointsLooping((duration + extra) * frameRate, times, points, smoothness)
        return new AnimState(spline, duration, loopMode, frameRate)
    }
}

class AnimController {
    animState
    constructor(animTrack) {
        this.animState = AnimState.fromTrack(animTrack)
        this.animState.update(0)
    }
    onEnter(camera) {
        camera.look(this.animState.position, this.animState.target)
        camera.fov = this.animState.fov
    }
    update(deltaTime, inputFrame, camera) {
        this.animState.update(deltaTime)
        camera.look(this.animState.position, this.animState.target)
        camera.fov = this.animState.fov
        inputFrame.read()
    }
    onExit(camera) {}
}

const rotation$1 = new Quat()
const avec = new Vec3()
const bvec = new Vec3()
class Camera {
    position = new Vec3()
    angles = new Vec3()
    distance = 1
    fov = 60
    constructor(other) {
        if (other) {
            this.copy(other)
        }
    }
    copy(source) {
        this.position.copy(source.position)
        this.angles.copy(source.angles)
        this.distance = source.distance
        this.fov = source.fov
    }
    lerp(a, b, t) {
        a.calcFocusPoint(avec)
        b.calcFocusPoint(bvec)
        this.position.lerp(a.position, b.position, t)
        avec.lerp(avec, bvec, t).sub(this.position)
        this.distance = avec.length()
        vecToAngles(this.angles, avec.mulScalar(1.0 / this.distance))
        this.fov = math.lerp(a.fov, b.fov, t)
    }
    look(from, to) {
        this.position.copy(from)
        this.distance = from.distance(to)
        const dir = avec.sub2(to, from).normalize()
        vecToAngles(this.angles, dir)
    }
    calcFocusPoint(result) {
        rotation$1
            .setFromEulerAngles(this.angles)
            .transformVector(Vec3.FORWARD, result)
            .mulScalar(this.distance)
            .add(this.position)
    }
}

/** Radius of the camera collision sphere (meters) */
const CAMERA_RADIUS = 0.2
const p$1 = new Pose()
/** Pre-allocated push-out vector for sphere collision */
const pushOut = { x: 0, y: 0, z: 0 }
class FlyController {
    controller
    fov = 90
    /** Optional voxel collider for sphere collision with sliding */
    collider = null
    constructor() {
        this.controller = new FlyController$1()
        this.controller.pitchRange = new Vec2(-90, 90)
        this.controller.rotateDamping = 0.97
        this.controller.moveDamping = 0.97
    }
    onEnter(camera) {
        p$1.position.copy(camera.position)
        p$1.angles.copy(camera.angles)
        p$1.distance = camera.distance
        this.controller.attach(p$1, false)
    }
    update(deltaTime, inputFrame, camera) {
        const pose = this.controller.update(inputFrame, deltaTime)
        camera.angles.copy(pose.angles)
        camera.distance = pose.distance
        if (this.collider) {
            // Resolve collision on _targetPose first. The engine's update() already
            // applied input to _targetPose and lerped _pose toward it. By correcting
            // _targetPose now, we ensure next frame's lerp interpolates toward a safe
            // position, preventing the camera from overshooting into the wall.
            const target = this.controller._targetPose
            const tvx = -target.position.x
            const tvy = -target.position.y
            const tvz = target.position.z
            if (this.collider.querySphere(tvx, tvy, tvz, CAMERA_RADIUS, pushOut)) {
                target.position.x += -pushOut.x
                target.position.y += -pushOut.y
                target.position.z += pushOut.z
            }
            // Now resolve collision on the interpolated pose (_pose).
            const vx = -pose.position.x
            const vy = -pose.position.y
            const vz = pose.position.z
            if (this.collider.querySphere(vx, vy, vz, CAMERA_RADIUS, pushOut)) {
                pose.position.x += -pushOut.x
                pose.position.y += -pushOut.y
                pose.position.z += pushOut.z
            }
        }
        camera.position.copy(pose.position)
        camera.fov = this.fov
    }
    onExit(camera) {}
    goto(pose) {
        this.controller.attach(pose, true)
    }
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
    if (type === 'success') {
        toast.classList.add('success')
    } else {
        toast.classList.remove('success')
    }
    toast.classList.add('show')
    if (toast._hideTimeout) clearTimeout(toast._hideTimeout)
    toast._hideTimeout = setTimeout(() => {
        toast.classList.remove('show')
        toast._removeTimeout = setTimeout(() => {}, 300)
    }, duration)
}
class Vec33 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x
        this.y = y
        this.z = z
    }
    copy(v) {
        this.x = v.x
        this.y = v.y
        this.z = v.z
        return this
    }
    set(x, y, z) {
        this.x = x
        this.y = y
        this.z = z
        return this
    }
    add(v) {
        this.x += v.x
        this.y += v.y
        this.z += v.z
        return this
    }
    sub(v) {
        this.x -= v.x
        this.y -= v.y
        this.z -= v.z
        return this
    }
    mulScalar(s) {
        this.x *= s
        this.y *= s
        this.z *= s
        return this
    }
    lerp(target, t) {
        this.x += (target.x - this.x) * t
        this.y += (target.y - this.y) * t
        this.z += (target.z - this.z) * t
        return this
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
    }
    normalize() {
        const len = this.length()
        if (len > 0) {
            this.mulScalar(1 / len)
        }
        return this
    }
    cross(v) {
        const x = this.y * v.z - this.z * v.y
        const y = this.z * v.x - this.x * v.z
        const z = this.x * v.y - this.y * v.x
        this.x = x
        this.y = y
        this.z = z
        return this
    }
    toArray(arr, offset = 0) {
        arr[offset] = this.x
        arr[offset + 1] = this.y
        arr[offset + 2] = this.z
    }
    fromArray(arr, offset = 0) {
        this.x = arr[offset]
        this.y = arr[offset + 1]
        this.z = arr[offset + 2]
        return this
    }
    transformQuat(q) {
        const x = this.x,
            y = this.y,
            z = this.z
        const qx = q.x,
            qy = q.y,
            qz = q.z,
            qw = q.w
        const ix = qw * x + qy * z - qz * y
        const iy = qw * y + qz * x - qx * z
        const iz = qw * z + qx * y - qy * x
        const iw = -qx * x - qy * y - qz * z
        this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy
        this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz
        this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx
        return this
    }
    cloneTransformQuat(q) {
        const v = this.clone()
        v.transformQuat(q)
        return v
    }
    static get FORWARD() {
        return new Vec33(0, 0, -1)
    }
    static get UP() {
        return new Vec33(0, 1, 0)
    }
    static get RIGHT() {
        return new Vec33(1, 0, 0)
    }
    clone() {
        return new Vec33(this.x, this.y, this.z)
    }
}
class Quat3 {
    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x
        this.y = y
        this.z = z
        this.w = w
    }
    set(x, y, z, w) {
        this.x = x
        this.y = y
        this.z = z
        this.w = w
        return this
    }
    copy(q) {
        this.x = q.x
        this.y = q.y
        this.z = q.z
        this.w = q.w
        return this
    }
    clone() {
        return new Quat3(this.x, this.y, this.z, this.w)
    }
    static slerp(a, b, t) {
        let cosHalfTheta = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
        if (cosHalfTheta < 0) {
            b = new Quat3(-b.x, -b.y, -b.z, -b.w)
            cosHalfTheta = -cosHalfTheta
        }
        if (cosHalfTheta > 0.9995) {
            return new Quat3(
                a.x + t * (b.x - a.x),
                a.y + t * (b.y - a.y),
                a.z + t * (b.z - a.z),
                a.w + t * (b.w - a.w),
            ).normalize()
        }
        const halfTheta = Math.acos(cosHalfTheta)
        const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta)
        const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta
        const ratioB = Math.sin(t * halfTheta) / sinHalfTheta
        return new Quat3(
            a.x * ratioA + b.x * ratioB,
            a.y * ratioA + b.y * ratioB,
            a.z * ratioA + b.z * ratioB,
            a.w * ratioA + b.w * ratioB,
        )
    }
    normalize() {
        const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w)
        if (len > 0) {
            const invLen = 1 / len
            this.x *= invLen
            this.y *= invLen
            this.z *= invLen
            this.w *= invLen
        }
        return this
    }
    mul(q) {
        const ax = this.x,
            ay = this.y,
            az = this.z,
            aw = this.w
        const bx = q.x,
            by = q.y,
            bz = q.z,
            bw = q.w
        this.x = aw * bx + ax * bw + ay * bz - az * by
        this.y = aw * by - ax * bz + ay * bw + az * bx
        this.z = aw * bz + ax * by - ay * bx + az * bw
        this.w = aw * bw - ax * bx - ay * by - az * bz
        return this
    }
    setFromAxisAngle(axis, angleRad) {
        const halfAngle = angleRad * 0.5
        const s = Math.sin(halfAngle)
        this.x = axis.x * s
        this.y = axis.y * s
        this.z = axis.z * s
        this.w = Math.cos(halfAngle)
        return this
    }
    setFromEulerAngles(euler) {
        const yaw = (euler.y * Math.PI) / 180
        const pitch = (euler.x * Math.PI) / 180
        const roll = (euler.z * Math.PI) / 180
        const cy = Math.cos(yaw * 0.5)
        const sy = Math.sin(yaw * 0.5)
        const cp = Math.cos(pitch * 0.5)
        const sp = Math.sin(pitch * 0.5)
        const cr = Math.cos(roll * 0.5)
        const sr = Math.sin(roll * 0.5)
        this.w = cr * cp * cy + sr * sp * sy
        this.x = sr * cp * cy - cr * sp * sy
        this.y = cr * sp * cy + sr * cp * sy
        this.z = cr * cp * sy - sr * sp * cy
        return this
    }
    transformVector(vec) {
        return vec.clone().transformQuat(this)
    }
    static lookRotation(forward, up) {
        const z = forward.clone().normalize()
        const x = up.clone().cross(z).normalize()
        const y = z.clone().cross(x)
        const m00 = x.x,
            m01 = y.x,
            m02 = z.x
        const m10 = x.y,
            m11 = y.y,
            m12 = z.y
        const m20 = x.z,
            m21 = y.z,
            m22 = z.z
        const trace = m00 + m11 + m22
        const q = new Quat3()
        if (trace > 0) {
            const s = 0.5 / Math.sqrt(trace + 1)
            q.w = 0.25 / s
            q.x = (m21 - m12) * s
            q.y = (m02 - m20) * s
            q.z = (m10 - m01) * s
        } else if (m00 > m11 && m00 > m22) {
            const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
            q.w = (m21 - m12) / s
            q.x = 0.25 * s
            q.y = (m01 + m10) / s
            q.z = (m02 + m20) / s
        } else if (m11 > m22) {
            const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
            q.w = (m02 - m20) / s
            q.x = (m01 + m10) / s
            q.y = 0.25 * s
            q.z = (m12 + m21) / s
        } else {
            const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
            q.w = (m10 - m01) / s
            q.x = (m02 + m20) / s
            q.y = (m12 + m21) / s
            q.z = 0.25 * s
        }
        return q.normalize()
    }
}
class SmoothDamp3 {
    constructor(initialValue) {
        this.value = initialValue.slice()
        this.target = initialValue.slice()
        this.velocity = new Array(initialValue.length).fill(0)
        this.smoothTime = 0
    }
    update(dt) {
        const smoothTime = Math.max(this.smoothTime, 1e-6)
        const omega = 2 / smoothTime
        const x = omega * dt
        const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
        for (let i = 0; i < this.value.length; i++) {
            const v = this.velocity[i]
            const t = this.target[i]
            let x0 = this.value[i]
            let xDiff = x0 - t
            const temp = (v + omega * xDiff) * dt
            this.velocity[i] = (v - omega * temp) * exp
            this.value[i] = t + (xDiff + temp) * exp
        }
    }
}
const v$2 = new Vec33()
class OtherController {
    focus = new Vec33()
    rotation = new Quat3()
    smoothDamp = new SmoothDamp3(new Array(8).fill(0))
    distance = 1
    rotateSpeed = 0.04
    lerpDuration = 1.5
    lerpTime = 0
    targetPose = null
    startPose = null
    modelRotation = null
    originDistance
    startTransitionDistance
    currentYaw = 0
    currentPitch = 0
    minPitch = 0
    maxPitch = Math.PI / 2
    inertiaVelX = 0
    inertiaVelY = 0
    inertiaDamping = 0.93
    inertiaMinSpeed = 0.0005
    constructor(app, bbox, events, entity) {
        this.app = app
        this.bbox = bbox
        this.events = events
        this.entity = entity
        if (['spherical', 'hemispherical', 'cylindrical'].includes(window.sse.settings.model)) {
            this.model = window.sse.settings.model
        } else if (!params.spherical) {
            this.model = 'hemispherical'
        } else {
            this.model = 'spherical'
        }
        this.isSphericalRot = this.model === 'spherical'
        this.originModel = this.model
        this.initviewPose = orterySettings.initview.pose ?? null
        if (orterySettings.orientation) {
            const { rotation: r, position: p } = orterySettings.orientation
            this.baseRotation = new Quat(r.x, r.y, r.z, r.w)
            this.basePosition = new Vec33(p.x, p.y, p.z)
        } else {
            this.baseRotation = modelEntity.localRotation.clone()
            this.basePosition = modelEntity.localPosition.clone()
        }
        this.originPivot = this.bbox.center.clone()
        this.listenEvents()
    }
    listenEvents() {
        this.events.on('hotspot:editing', (isEdit) => {
            this.isEditHotspot = isEdit
        })
        this.events.on('ortery-controller:transition', ({ entityInfo, lerpDuration, onTransitionFinished }) => {
            const { position: p, focus: f, rotation: r, distanceScale: d, yaw, pitch } = entityInfo
            const startPose = {
                focus: this.focus.clone(),
                position: new Vec3(
                    modelEntity.localPosition.x,
                    modelEntity.localPosition.y,
                    modelEntity.localPosition.z,
                ),
                rotation: modelEntity.localRotation.clone(),
                distance: this.distance,
                yaw: this.currentYaw,
                pitch: this.currentPitch,
            }
            const targetPose = {
                focus: this.getActualFocus(f),
                position: new Vec3(p.x, p.y, p.z),
                rotation: new Quat(r.x, r.y, r.z, r.w),
                distance: this.getActualDistance(d),
                yaw,
                pitch,
            }
            this.setupTransition({ targetPose, startPose, lerpDuration, onTransitionFinished })
        })
    }
    getCustomCenterPivot(pos) {
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        const worldPivotPos = new Vec3()
        worldMatrix.transformPoint(pos, worldPivotPos)
        return worldPivotPos
    }
    setInitviewPose() {
        if (this.initviewPose) {
            const { position: p, rotation: r } = this.initviewPose
            modelEntity.setLocalPosition(p.x, p.y, p.z)
            modelEntity.setLocalRotation(r.x, r.y, r.z, r.w)
        }
    }
    reset(pose) {
        if (!this.originDistance) this.originDistance = pose.distance
        if (!this.originFocus) this.originFocus = this.bbox.center.clone()

        const isFirstInit = !this.hasInitializedFocus
        if (isFirstInit) this.hasInitializedFocus = true
        let startFocus, startDistance
        let startYaw = 0,
            startPitch = 0
        let targetYaw = 0,
            targetPitch = 0

        if (isFirstInit) {
            if (this.initviewPose) {
                targetYaw = startYaw = this.initviewPose.yaw
                targetPitch = startPitch = this.initviewPose.pitch
            }
        } else {
            startFocus = this.focus.clone()
            startDistance = this.distance
            startYaw = this.currentYaw
            startPitch = this.currentPitch
            if (this.initviewPose) {
                targetYaw = this.initviewPose.yaw
                targetPitch = this.initviewPose.pitch
            }
        }

        let distance
        if (this.initviewPose) {
            const { focus: f, distanceScale: d } = this.initviewPose
            this.focus.copy(this.getActualFocus(f))
            distance = isMobile ? Math.max(pose.distance, this.getActualDistance(d)) : this.getActualDistance(d)
            if (!this.initviewDistance) this.initviewDistance = distance
            if (!this.initviewFocus) this.initviewFocus = this.focus.clone()
        } else {
            const aspect = this.app.graphicsDevice.width / this.app.graphicsDevice.height
            const fovDeg = 50
            let verticalFovRad
            if (this.app.graphicsDevice.width > this.app.graphicsDevice.height) {
                const hFovRad = (fovDeg * Math.PI) / 180
                verticalFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / aspect)
            } else {
                verticalFovRad = (fovDeg * Math.PI) / 180
            }
            const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * aspect)
            const minFovRad = Math.min(verticalFovRad, horizontalFovRad)
            const h = this.bbox.halfExtents
            const radius = Math.sqrt(h.x * h.x + h.y * h.y + h.z * h.z)
            distance = (radius / Math.sin(minFovRad / 2)) * 1.1
            maxDistance = Math.max(distance, 200)

            this.focus.copy(this.bbox.center)
            if (!this.initviewDistance) this.initviewDistance = distance
            if (!this.initviewFocus) this.initviewFocus = this.focus.clone()
        }

        if (!startFocus) startFocus = this.focus.clone()
        if (!startDistance) startDistance = distance

        const dir = new Vec33(
            pose.position.x - this.focus.x,
            pose.position.y - this.focus.y,
            pose.position.z - this.focus.z,
        ).normalize()
        this.rotation = Quat3.lookRotation(dir, Vec33.UP)
        this.distance = distance

        if (modelEntity && !this.originEntityRotation) {
            this.originEntityRotation = modelEntity.localRotation.clone()
            this.originEntityPos = modelEntity.localPosition.clone()
        }
        if (modelEntity && this.originEntityRotation) {
            this.setupTransition({
                startPose: {
                    focus: startFocus,
                    rotation: modelEntity.localRotation.clone(),
                    position: modelEntity.localPosition.clone(),
                    distance: startDistance,
                    yaw: startYaw,
                    pitch: startPitch,
                },
                targetPose: {
                    focus: this.initviewFocus,
                    rotation: this.originEntityRotation.clone(),
                    position: this.originEntityPos.clone(),
                    distance: this.initviewDistance,
                    yaw: targetYaw,
                    pitch: targetPitch,
                },
                onTransitionFinished: null,
                lerpDuration: HOTSPOT_FADE_TIME,
            })
        }
    }
    initView() {
        settings.initview.pose = this.getEntityInfo()
        this.initviewPose = settings.initview.pose
        this.originEntityRotation = modelEntity.localRotation.clone()
        this.originEntityPos = modelEntity.localPosition.clone()
        this.initviewFocus = this.focus.clone()
        this.initviewDistance = this.distance
        showToast('✓ Initial view updated', { duration: 1000, type: 'success' })
    }
    update(dt, inputFrame, camera) {
        const { move, rotate } = inputFrame.read()
        this.move(move, rotate)
        this.getPose(camera)
        this.smooth(dt)
        this.updateModelEntity(dt)
        // this.applyInertia()
    }
    onEnter(camera) {
        this.reset(camera)
    }
    onExit() {}
    applyInertia() {
        if (this.isEditHotspot || this.targetPose || !modelEntity || !this.modelRotation) return
        const speed = Math.sqrt(this.inertiaVelX ** 2 + this.inertiaVelY ** 2)
        if (speed < this.inertiaMinSpeed) {
            this.inertiaVelX = 0
            this.inertiaVelY = 0
            return
        }
        const dx = this.inertiaVelX
        const dy = this.inertiaVelY
        const speedNorm = Math.min(speed / 0.05, 1)
        const damping = 0.68 + speedNorm * (this.inertiaDamping - 0.68)

        this.inertiaVelX *= damping
        this.inertiaVelY *= damping

        if (this.model === 'spherical') {
            this.sphericalRot(dx, dy)
        } else {
            this.setPitchYaw(dx, dy)
            this.hemisphericalRot(this.currentYaw, this.currentPitch)
        }
        this.syncHierarchyAndRender()
    }
    resetPivot() {
        settings.pivotPos = null
        this.centerPivot = this.originPivot
        this.events.fire('inputEvent', 'frame')
    }
    savePivot(pos) {
        settings.pivotPos = pos
        this.centerPivot = this.getCustomCenterPivot(settings.pivotPos)
    }
    resetModelType() {
        this.model = this.originModel
    }
    setupTransition({ targetPose, startPose, onTransitionFinished, lerpDuration }) {
        this.targetPose = targetPose
        this.startPose = startPose
        this.onTransitionFinished = onTransitionFinished
        this.lerpTime = 0
        this.lerpDuration = lerpDuration
    }
    saveModelOrientation() {
        this.baseRotation = modelEntity.localRotation.clone()
        this.basePosition = modelEntity.localPosition.clone()
        settings.orientation = {
            rotation: this.baseRotation,
            position: this.basePosition,
        }
        this.currentYaw = 0
        this.currentPitch = 0
        this.updateModelRotation()
        this.resetModelType()
        if (this.mode === 'cylindrical') {
            this.minPitch = 0
            this.maxPitch = 0
        } else if (this.model === 'hemispherical') {
            this.minPitch = 0
            this.maxPitch = Math.PI / 2
        }
        if (this.initviewPose) {
            this.initView()
        }
    }
    lerp(a, b, t) {
        return a + (b - a) * t
    }
    updateModelEntity(dt) {
        if (!this.targetPose || !modelEntity) return
        this.lerpTime += dt
        let t = Math.min(this.lerpTime / this.lerpDuration, 1)
        t = t * t * (3 - 2 * t)
        this.distance = this.clampDistance(this.lerp(this.startPose.distance, this.targetPose.distance, t))
        this.focus.copy(this.startPose.focus).lerp(this.targetPose.focus, t)
        const newPos = new Vec33(this.startPose.position.x, this.startPose.position.y, this.startPose.position.z).lerp(
            this.targetPose.position,
            t,
        )
        modelEntity.localPosition.copy({ x: newPos.x, y: newPos.y, z: newPos.z })
        if (this.isSphericalRot) {
            modelEntity.localRotation = Quat3.slerp(this.startPose.rotation, this.targetPose.rotation, t)
        } else {
            this.currentYaw = this.lerp(this.startPose.yaw, this.targetPose.yaw, t)
            this.currentPitch = this.lerp(this.startPose.pitch, this.targetPose.pitch, t)
            this.hemisphericalRot(this.currentYaw, this.currentPitch)
        }
        if (t >= 0.99 && this.onTransitionFinished) this.onTransitionFinished()
        if (t >= 1) {
            this.focus.copy(this.targetPose.focus)
            this.distance = this.clampDistance(this.targetPose.distance, t)
            modelEntity.localPosition.copy(this.targetPose.position)
            if (this.isSphericalRot) modelEntity.localRotation.copy(this.targetPose.rotation)
            else {
                this.currentYaw = this.targetPose.yaw
                this.currentPitch = this.targetPose.pitch
                this.hemisphericalRot(this.currentYaw, this.currentPitch)
            }
            this.updateModelRotation()
            this.targetPose = null
            this.startPose = null
        }
        this.syncHierarchyAndRender()
    }
    updateModelRotation() {
        this.modelRotation = modelEntity.localRotation.clone()
    }
    syncHierarchyAndRender() {
        modelEntity.syncHierarchy()
        modelEntity._dirtyLocal = true
        modelEntity._dirtyWorld = true
        this.app.renderNextFrame = true
    }
    getEntityInfo() {
        const aspect = this.app.graphicsDevice.width / this.app.graphicsDevice.height
        return {
            rotation: modelEntity.localRotation.clone(),
            position: modelEntity.localPosition.clone(),
            distanceScale: this.distance / this.originDistance,
            focus: {
                x: (this.focus.x - this.originFocus.x) / aspect,
                y: (this.focus.y - this.originFocus.y) / aspect,
                z: (this.focus.z - this.originFocus.z) / aspect,
                aspect,
                distance: this.originDistance,
            },
            pitch: this.currentPitch,
            yaw: this.currentYaw,
        }
    }
    getActualFocus(f) {
        const aspect = this.app.graphicsDevice.width / this.app.graphicsDevice.height
        const aspectScale = aspect > f.aspect ? f.aspect : aspect
        const distanceScale = aspect > f.aspect ? 1 : this.originDistance / f.distance
        return new Vec3(
            this.originFocus.x + f.x * distanceScale * aspectScale,
            this.originFocus.y + f.y * distanceScale * aspectScale,
            this.originFocus.z + f.z * distanceScale * aspectScale,
        )
    }
    getActualDistance(distanceScale) {
        return this.originDistance * distanceScale
    }
    clampDistance(distance) {
        if (!orterySettings.lockZoomIn.locked) return Math.min(maxDistance, Math.max(minDistance, distance))
        return Math.min(maxDistance, Math.max(this.getActualDistance(orterySettings.lockZoomIn.value), distance))
    }
    move(move, rotate) {
        if (this.isEditHotspot) return
        const [x, y, z] = move
        const isZooming = z !== 0
        const isPanning = x !== 0 || y !== 0
        this.rightCam = Vec33.RIGHT.clone().transformQuat(this.rotation).normalize()
        this.upCam = Vec33.UP.clone().transformQuat(this.rotation).normalize()
        this.distance = this.clampDistance(this.distance + this.distance * move[2])
        v$2.copy(this.rightCam).mulScalar(move[0])
        this.focus.add(v$2)
        v$2.copy(this.upCam).mulScalar(move[1])
        this.focus.add(v$2)
        let didRotate = false
        if (!this.initPivot) {
            this.centerPivot = settings.pivotPos ? this.getCustomCenterPivot(settings.pivotPos) : this.originPivot
            this.initPivot = true
        }
        if (modelEntity && this.modelRotation) {
            const deltaX = rotate[0]
            const deltaY = rotate[1]
            if (deltaX !== 0 || deltaY !== 0) {
                this.inertiaVelX = this.inertiaVelX * 0.6 + deltaX * 0.4
                this.inertiaVelY = this.inertiaVelY * 0.6 + deltaY * 0.4
                if (this.model === 'spherical') this.sphericalRot(deltaX, deltaY)
                else {
                    if (this.cameraElevation === undefined) {
                        if (!settings.orientation) {
                            this.cameraElevation = this.getCameraElevation()
                            if (this.model === 'cylindrical') {
                                this.maxPitch = this.cameraElevation
                                this.minPitch = this.cameraElevation
                            } else {
                                this.minPitch -= this.cameraElevation
                                this.maxPitch -= this.cameraElevation
                            }
                        } else this.cameraElevation = 0
                    }
                    this.setPitchYaw(deltaX, deltaY)
                    this.hemisphericalRot(this.currentYaw, this.currentPitch)
                }
                this.syncHierarchyAndRender()
                didRotate = true
            }
        }
        if (didRotate) {
            this.events.fire('hotspot:hide-all')
        }
        if (isZooming || isPanning || didRotate) {
            // this.hotspotManager.stopAutoPlay()
            this.updateModelRotation()
            this.targetPose = null
            this.startPose = null
        }
    }
    getCameraElevation() {
        const forward = Vec33.FORWARD.clone().transformQuat(this.rotation).normalize()
        const camPos = this.focus.clone().sub(forward.mulScalar(this.distance))
        const dir = new Vec3(
            camPos.x - this.centerPivot.x,
            camPos.y - this.centerPivot.y,
            camPos.z - this.centerPivot.z,
        )
        return Math.atan2(dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z))
    }
    setPitchYaw(deltaX, deltaY) {
        const maxDelta = 30
        const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        const scale = magnitude > maxDelta ? maxDelta / magnitude : 1
        const safeDeltaX = deltaX * scale
        const safeDeltaY = deltaY * scale
        this.currentYaw =
            ((((this.currentYaw + safeDeltaX * this.rotateSpeed + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) %
                (2 * Math.PI)) -
            Math.PI
        this.currentPitch += safeDeltaY * this.rotateSpeed
        this.currentPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.currentPitch))
    }
    sphericalRot(deltaX, deltaY) {
        const yawQuat = new Quat3().setFromAxisAngle(this.upCam, deltaX * this.rotateSpeed)
        const pitchQuat = new Quat3().setFromAxisAngle(this.rightCam, deltaY * this.rotateSpeed)
        const rotateQuat = yawQuat.mul(pitchQuat).normalize()
        v$2.copy(modelEntity.localPosition).sub(this.centerPivot)
        v$2.transformQuat(rotateQuat)
        modelEntity.localPosition.copy(this.centerPivot).add(v$2)
        modelEntity.localRotation.copy(rotateQuat.mul(this.modelRotation).normalize())
        this.modelRotation.copy(modelEntity.localRotation)
    }
    hemisphericalRot(yaw, pitch) {
        const up = new Vec3(0, 1, 0)
        this.baseRotation.transformVector(up, up)
        up.normalize()
        if (up.dot(Vec3.UP) < 0) up.mulScalar(-1)
        const quatYaw = new Quat3().setFromAxisAngle(up, yaw)
        const quatPitch = new Quat3().setFromAxisAngle(this.rightCam, pitch)
        const combinedRotateQuat = quatPitch.mul(quatYaw).normalize()
        const offset = this.basePosition.clone().sub(this.centerPivot)
        const rotatedOffset = this.rotateOffsetByQuat(offset, combinedRotateQuat)
        modelEntity.localPosition.copy(this.centerPivot.clone().add(rotatedOffset))
        modelEntity.localRotation.copy(combinedRotateQuat.mul(this.baseRotation).normalize())
    }
    rotateOffsetByQuat(offset, q) {
        const vx = offset.x,
            vy = offset.y,
            vz = offset.z
        const qx = q.x,
            qy = q.y,
            qz = q.z,
            qw = q.w
        const ix = qw * vx + qy * vz - qz * vy
        const iy = qw * vy + qz * vx - qx * vz
        const iz = qw * vz + qx * vy - qy * vx
        const iw = -qx * vx - qy * vy - qz * vz
        return new Vec3(
            ix * qw + iw * -qx + iy * -qz - iz * -qy,
            iy * qw + iw * -qy + iz * -qx - ix * -qz,
            iz * qw + iw * -qz + ix * -qy - iy * -qx,
        )
    }
    smooth(dt) {
        const { focus, rotation, smoothDamp } = this
        const { value, target } = smoothDamp
        focus.toArray(target, 0)
        target[3] = rotation.x
        target[4] = rotation.y
        target[5] = rotation.z
        target[6] = rotation.w
        target[7] = this.distance
        smoothDamp.update(dt)
        const q = new Quat3(value[3], value[4], value[5], value[6]).normalize()
        value[3] = q.x
        value[4] = q.y
        value[5] = q.z
        value[6] = q.w
    }
    getPose(pose) {
        const forward = Vec33.FORWARD.clone().transformQuat(this.rotation).normalize()
        pose.position = this.focus.clone().sub(forward.mulScalar(this.distance))
        pose.distance = this.distance
    }
}
const p = new Pose()
class OrbitController {
    controller
    fov = 90
    constructor() {
        this.controller = new OrbitController$1()
        this.controller.zoomRange = new Vec2(0.01, Infinity)
        this.controller.pitchRange = new Vec2(-90, 0)
        this.controller.rotateDamping = 0.97
        this.controller.moveDamping = 0.97
        this.controller.zoomDamping = 0.97
    }
    onEnter(camera) {
        p.position.copy(camera.position)
        p.angles.copy(camera.angles)
        p.distance = camera.distance
        this.controller.attach(p, false)
    }
    update(deltaTime, inputFrame, camera) {
        const pose = this.controller.update(inputFrame, deltaTime)
        camera.position.copy(pose.position)
        camera.angles.copy(pose.angles)
        camera.distance = pose.distance
        camera.fov = this.fov
    }
    onExit(camera) {}
    goto(camera) {
        p.position.copy(camera.position)
        p.angles.copy(camera.angles)
        p.distance = camera.distance
        this.fov = camera.fov
        this.controller.attach(p, false)
    }
}

const FIXED_DT = 1 / 60
const MAX_SUBSTEPS = 10
/** Pre-allocated push-out vector for capsule collision */
const out = { x: 0, y: 0, z: 0 }
const v = new Vec3()
const d = new Vec3()
const forward = new Vec3()
const right$1 = new Vec3()
const moveStep = [0, 0, 0]
const offset = new Vec3()
const rotation = new Quat()
/**
 * First-person camera controller with spring-damper suspension over voxel terrain.
 *
 * Movement is constrained to the horizontal plane (XZ) relative to the camera yaw.
 * Vertical positioning uses a spring-damper system that hovers the capsule above the
 * voxel surface, filtering out terrain noise for smooth camera motion. Capsule
 * collision handles walls and obstacles. When airborne, normal gravity applies.
 */
class WalkController {
    /**
     * Optional voxel collider for capsule collision with sliding
     */
    collider = null
    /**
     * Field of view in degrees for walk mode.
     */
    fov = 96
    /**
     * Total capsule height in meters (default: human proportion)
     */
    capsuleHeight = 1.5
    /**
     * Capsule radius in meters
     */
    capsuleRadius = 0.2
    /**
     * Camera height from the bottom of the capsule in meters
     */
    eyeHeight = 1.3
    /**
     * Gravity acceleration in m/s^2
     */
    gravity = 9.8
    /**
     * Jump velocity in m/s
     */
    jumpSpeed = 4
    /**
     * Movement speed in m/s when grounded
     */
    moveGroundSpeed = 7
    /**
     * Movement speed in m/s when in the air (for air control)
     */
    moveAirSpeed = 1
    /**
     * Movement damping factor (0 = no damping, 1 = full damping)
     */
    moveDamping = 0.97
    /**
     * Rotation damping factor (0 = no damping, 1 = full damping)
     */
    rotateDamping = 0.97
    /**
     * Velocity damping factor when grounded (0 = no damping, 1 = full damping)
     */
    velocityDampingGround = 0.99
    /**
     * Velocity damping factor when in the air (0 = no damping, 1 = full damping)
     */
    velocityDampingAir = 0.998
    /**
     * Target clearance from capsule bottom to ground surface in meters.
     * The capsule hovers this far above terrain to avoid bouncing on noisy voxels.
     */
    hoverHeight = 0.2
    /**
     * Spring stiffness for ground-following suspension (higher = stiffer tracking).
     */
    springStiffness = 800
    /**
     * Damping coefficient for ground-following suspension.
     * Critical damping is approximately 2 * sqrt(springStiffness).
     */
    springDamping = 57
    /**
     * Maximum downward raycast distance to search for ground below the capsule.
     */
    groundProbeRange = 1.0
    _position = new Vec3()
    _prevPosition = new Vec3()
    _angles = new Vec3()
    _velocity = new Vec3()
    _pendingMove = [0, 0, 0]
    _accumulator = 0
    _grounded = false
    _jumping = false
    _jumpHeld = false
    onEnter(camera) {
        this.goto(camera)
        if (this.collider) {
            const groundY = this._probeGround(this._position)
            if (groundY !== null) {
                this._grounded = true
                this._velocity.y = 0
                this._position.y = groundY + this.hoverHeight + this.eyeHeight
                this._prevPosition.copy(this._position)
            }
        }
    }
    update(deltaTime, inputFrame, camera) {
        const { move, rotate } = inputFrame.read()
        // apply rotation at display rate for responsive mouse look
        this._angles.add(v.set(-rotate[1], -rotate[0], 0))
        this._angles.x = math.clamp(this._angles.x, -90, 90)
        // accumulate movement input so frames without a physics step don't lose input
        this._pendingMove[0] += move[0]
        this._pendingMove[1] = this._pendingMove[1] || move[1]
        this._pendingMove[2] += move[2]
        this._accumulator = Math.min(this._accumulator + deltaTime, MAX_SUBSTEPS * FIXED_DT)
        const numSteps = Math.floor(this._accumulator / FIXED_DT)
        if (numSteps > 0) {
            const invSteps = 1 / numSteps
            moveStep[0] = this._pendingMove[0] * invSteps
            moveStep[1] = this._pendingMove[1]
            moveStep[2] = this._pendingMove[2] * invSteps
            for (let i = 0; i < numSteps; i++) {
                this._prevPosition.copy(this._position)
                this._step(FIXED_DT, moveStep)
                this._accumulator -= FIXED_DT
            }
            this._pendingMove[0] = 0
            this._pendingMove[1] = 0
            this._pendingMove[2] = 0
        }
        const alpha = this._accumulator / FIXED_DT
        camera.position.lerp(this._prevPosition, this._position, alpha)
        camera.angles.set(this._angles.x, this._angles.y, 0)
        camera.fov = this.fov
    }
    _step(dt, move) {
        // ground probe: cast a ray downward to find the terrain surface
        const groundY = this._probeGround(this._position)
        const hasGround = groundY !== null
        // jump (require release before re-triggering)
        if (this._velocity.y < 0) {
            this._jumping = false
        }
        if (move[1] && !this._jumping && this._grounded && !this._jumpHeld) {
            this._jumping = true
            this._velocity.y = this.jumpSpeed
            this._grounded = false
        }
        this._jumpHeld = !!move[1]
        // vertical force: spring-damper when ground is detected, gravity when airborne
        if (hasGround && !this._jumping) {
            const targetY = groundY + this.hoverHeight + this.eyeHeight
            const displacement = this._position.y - targetY
            if (displacement > 0.1) {
                // well above target (jump/ledge): freefall, snap to rest height on arrival
                this._velocity.y -= this.gravity * dt
                const nextY = this._position.y + this._velocity.y * dt
                if (nextY <= targetY) {
                    this._position.y = targetY
                    this._velocity.y = 0
                }
                this._grounded = false
            } else {
                // at or near target (walking/slopes): spring tracks terrain
                const springForce = -this.springStiffness * displacement - this.springDamping * this._velocity.y
                this._velocity.y += springForce * dt
                this._grounded = true
            }
        } else {
            this._velocity.y -= this.gravity * dt
            this._grounded = false
        }
        // move
        rotation.setFromEulerAngles(0, this._angles.y, 0)
        rotation.transformVector(Vec3.FORWARD, forward)
        rotation.transformVector(Vec3.RIGHT, right$1)
        offset.set(0, 0, 0)
        offset.add(forward.mulScalar(move[2]))
        offset.add(right$1.mulScalar(move[0]))
        this._velocity.add(offset.mulScalar(this._grounded ? this.moveGroundSpeed : this.moveAirSpeed))
        const dampFactor = this._grounded ? this.velocityDampingGround : this.velocityDampingAir
        const alpha = damp(dampFactor, dt)
        this._velocity.x = math.lerp(this._velocity.x, 0, alpha)
        this._velocity.z = math.lerp(this._velocity.z, 0, alpha)
        this._position.add(v.copy(this._velocity).mulScalar(dt))
        // capsule collision: walls, ceiling, and fallback floor contact
        this._checkCollision(this._position, d)
    }
    onExit(_camera) {
        // nothing to clean up
    }
    /**
     * Teleport the controller to a given camera state (used for transitions).
     *
     * @param camera - The camera state to jump to.
     */
    goto(camera) {
        // position
        this._position.copy(camera.position)
        this._prevPosition.copy(this._position)
        // angles (clamp pitch to avoid gimbal lock)
        this._angles.set(camera.angles.x, camera.angles.y, 0)
        // reset velocity and state
        this._velocity.set(0, 0, 0)
        this._grounded = false
        this._jumping = false
        this._pendingMove[0] = 0
        this._pendingMove[1] = 0
        this._pendingMove[2] = 0
        this._accumulator = 0
    }
    /**
     * Cast multiple rays downward to find the average ground surface height.
     * Uses 5 rays (center + 4 cardinal at capsule radius) to spatially filter
     * noisy voxel heights, giving the spring a smoother target.
     *
     * @param pos - Eye position in PlayCanvas world space.
     * @returns Average ground surface Y in PlayCanvas space, or null if no ground found.
     */
    _probeGround(pos) {
        if (!this.collider) return null
        const vy = -(pos.y - this.eyeHeight)
        const r = this.capsuleRadius
        const range = this.groundProbeRange
        let totalY = 0
        let hitCount = 0
        for (let i = 0; i < 5; i++) {
            let vx = -pos.x
            let vz = pos.z
            if (i === 1) vx -= r
            else if (i === 2) vx += r
            else if (i === 3) vz += r
            else if (i === 4) vz -= r
            const hit = this.collider.queryRay(vx, vy, vz, 0, 1, 0, range)
            if (hit) {
                totalY += -hit.y
                hitCount++
            }
        }
        return hitCount > 0 ? totalY / hitCount : null
    }
    /**
     * Check for capsule collision and apply push-out displacement.
     * Handles walls, ceiling hits, and fallback floor contact when airborne.
     *
     * @param pos - Eye position in PlayCanvas world space.
     * @param disp - Pre-allocated vector to receive the collision push-out displacement.
     */
    _checkCollision(pos, disp) {
        const center = pos.y - this.eyeHeight + this.capsuleHeight * 0.5
        const half = this.capsuleHeight * 0.5 - this.capsuleRadius
        // convert to voxel space (negate X, negate Y, keep Z)
        const vx = -pos.x
        const vy = -center
        const vz = pos.z
        if (this.collider.queryCapsule(vx, vy, vz, half, this.capsuleRadius, out)) {
            disp.set(-out.x, -out.y, out.z)
            pos.add(disp)
            // ceiling collision: cancel upward velocity
            if (disp.y < 0 && this._velocity.y > 0) {
                this._velocity.y = 0
            }
            // airborne floor collision: transition to grounded as a fallback safety net
            if (!this._grounded && disp.y > 0 && this._velocity.y < 0) {
                this._velocity.y = 0
                this._grounded = true
            }
        }
    }
}

const RAD_TO_DEG = 180 / Math.PI
/** XZ distance below which the walker considers itself arrived */
const ARRIVAL_DIST = 0.5
/** Minimum XZ speed (m/s) to not count as blocked */
const BLOCKED_SPEED = 0.6
/** Seconds of continuous low-progress before stopping the walk */
const BLOCKED_DURATION = 0.2
/**
 * Generates synthetic move/rotate input to auto-walk toward a target position.
 *
 * Designed to feed into WalkController's existing update path so there is no
 * duplicated physics. Each frame it appends yaw-rotation and forward-movement
 * deltas to the shared CameraFrame, and monitors arrival / blocked conditions.
 */
class WalkSource {
    /**
     * Forward input scale (matches InputController.moveSpeed for consistent
     * speed with regular WASD walking).
     */
    walkSpeed = 4
    /**
     * Maximum yaw turn rate in degrees per second.
     */
    maxTurnRate = 192
    /**
     * Proportional gain mapping yaw error (degrees) to desired turn rate.
     * Below maxTurnRate / turnGain degrees the turn rate scales linearly;
     * above that it is capped at maxTurnRate. The rate filter is
     * automatically critically damped so there is no overshoot.
     */
    turnGain = 5
    /**
     * Callback fired when an auto-walk completes (arrival or obstacle).
     */
    onComplete = null
    _target = null
    _yawRate = 0
    _blockedTime = 0
    _prevDist = Infinity
    get isWalking() {
        return this._target !== null
    }
    /**
     * Begin auto-walking toward a world-space target position.
     *
     * @param target - The destination (XZ used for navigation).
     */
    walkTo(target) {
        if (!this._target) {
            this._target = new Vec3()
        }
        this._target.copy(target)
        this._blockedTime = 0
        this._prevDist = Infinity
    }
    /**
     * Cancel any active auto-walk.
     */
    cancelWalk() {
        if (this._target) {
            this._target = null
            this._yawRate = 0
            this._blockedTime = 0
            this.onComplete?.()
        }
    }
    /**
     * Compute walk deltas and append them to the frame. Must be called
     * before* the camera controller reads the frame.
     *
     * @param dt - Frame delta time in seconds.
     * @param cameraPosition - Camera world position (previous frame output).
     * @param cameraAngles - Camera Euler angles in degrees (previous frame output).
     * @param frame - The shared CameraFrame to append deltas to.
     */
    update(dt, cameraPosition, cameraAngles, frame) {
        if (!this._target) return
        const target = this._target
        const dx = target.x - cameraPosition.x
        const dz = target.z - cameraPosition.z
        const xzDist = Math.sqrt(dx * dx + dz * dz)
        // arrival
        if (xzDist < ARRIVAL_DIST) {
            this.cancelWalk()
            return
        }
        // blocked detection: compare with previous frame's distance
        if (this._prevDist !== Infinity && dt > 0) {
            const speed = (this._prevDist - xzDist) / dt
            if (speed < BLOCKED_SPEED) {
                this._blockedTime += dt
                if (this._blockedTime >= BLOCKED_DURATION) {
                    this.cancelWalk()
                    return
                }
            } else {
                this._blockedTime = 0
            }
        }
        this._prevDist = xzDist
        // yaw toward target with smoothed turn rate
        const targetYaw = Math.atan2(-dx, -dz) * RAD_TO_DEG
        let yawDiff = targetYaw - cameraAngles.y
        yawDiff = (((yawDiff % 360) + 540) % 360) - 180
        const desiredRate = Math.max(-this.maxTurnRate, Math.min(yawDiff * this.turnGain, this.maxTurnRate))
        const smoothing = 1 - Math.exp(-4 * this.turnGain * dt)
        this._yawRate += (desiredRate - this._yawRate) * smoothing
        // WalkController applies: _angles.y += -rotate[0]
        frame.deltas.rotate.append([-(this._yawRate * dt), 0, 0])
        // scale forward speed by alignment: turn in place first, then accelerate
        const alignment = Math.max(0, Math.cos((yawDiff * Math.PI) / 180))
        frame.deltas.move.append([0, 0, this.walkSpeed * dt * alignment])
    }
}

const tmpCamera = new Camera()
const tmpv = new Vec3()
const createCamera = (position, target, fov) => {
    const result = new Camera()
    result.look(position, target)
    result.fov = fov
    return result
}
const createFrameCamera = (bbox, fov) => {
    const sceneSize = bbox.halfExtents.length()
    const distance = sceneSize / Math.sin((fov / 180) * Math.PI * 0.5)
    return createCamera(new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center), bbox.center, fov)
}
class CameraManager {
    update
    controllers
    // holds the camera state
    camera = new Camera()
    constructor(global, bbox, app, entity, collider = null) {
        const { events, settings, state } = global
        const defaultFov = 50
        const resetCamera = createFrameCamera(bbox, defaultFov)
        const getAnimTrack = (initial, isObjectExperience) => {
            const { animTracks } = settings
            // extract the camera animation track from settings
            if (animTracks?.length > 0 && settings.startMode === 'animTrack') {
                // use the first animTrack
                return animTracks[0]
            } else if (isObjectExperience) {
                // create basic rotation animation if no anim track is specified
                initial.calcFocusPoint(tmpv)
                return createRotateTrack(initial.position, tmpv, initial.fov)
            }
            return null
        }
        // object experience starts outside the bounding box
        const isObjectExperience = !bbox.containsPoint(resetCamera.position)
        const animTrack = getAnimTrack(resetCamera, isObjectExperience)
        this.controllers = {
            orbit: new OrbitController(),
            fly: new FlyController(),
            walk: new WalkController(),
            anim: animTrack ? new AnimController(animTrack) : null,
            ortery: new OtherController(app, bbox, events, entity),
        }
        events.fire('controllers:created', this.controllers)
        this.controllers.orbit.fov = resetCamera.fov
        this.controllers.fly.fov = resetCamera.fov
        this.controllers.fly.collider = collider
        this.controllers.walk.collider = collider
        const walkSource = new WalkSource()
        walkSource.onComplete = () => {
            events.fire('walkComplete')
        }
        const getController = (cameraMode) => {
            return this.controllers[cameraMode]
        }
        // set the global animation flag
        state.hasAnimation = !!this.controllers.anim
        state.animationDuration = this.controllers.anim ? this.controllers.anim.animState.cursor.duration : 0
        // initialize camera mode and initial camera position
        // state.cameraMode =
        //     state.hasAnimation && !config.noanim ? 'anim' : isObjectExperience ? 'orbit' : collider ? 'walk' : 'fly'
        state.cameraMode = 'ortery'
        this.camera.copy(resetCamera)
        const target = new Camera(this.camera) // the active controller updates this
        const from = new Camera(this.camera) // stores the previous camera state during transition
        const defaultMode = isObjectExperience ? 'orbit' : collider ? 'walk' : 'fly'
        let fromMode = defaultMode
        // tracks the mode to restore when exiting walk
        let preWalkMode = isObjectExperience ? 'orbit' : 'fly'
        // enter the initial controller
        getController(state.cameraMode).onEnter(this.camera)
        // transition state
        const transitionSpeed = 1.0
        let transitionTimer = 1
        // start a new camera transition from the current pose
        const startTransition = () => {
            from.copy(this.camera)
            transitionTimer = 0
        }
        // application update
        this.update = (deltaTime, frame) => {
            // use dt of 0 if animation is paused
            const dt = state.cameraMode === 'anim' && state.animationPaused ? 0 : deltaTime
            // update transition timer
            transitionTimer = Math.min(1, transitionTimer + deltaTime * transitionSpeed)
            const controller = getController(state.cameraMode)
            if (state.cameraMode === 'walk') {
                walkSource.update(dt, this.camera.position, this.camera.angles, frame)
            }
            controller.update(dt, frame, target)
            if (transitionTimer < 1) {
                // lerp away from previous camera during transition
                this.camera.lerp(from, target, easeOut(transitionTimer))
            } else {
                this.camera.copy(target)
            }
            // update animation timeline
            if (state.cameraMode === 'anim') {
                state.animationTime = this.controllers.anim.animState.cursor.value
            }
        }
        // handle input events
        events.on('inputEvent', (eventName, event) => {
            switch (eventName) {
                case 'frame':
                    state.cameraMode = 'orbit'
                    this.controllers.orbit.goto(frameCamera)
                    startTransition()
                    break
                case 'reset':
                    state.cameraMode = 'orbit'
                    this.controllers.orbit.goto(resetCamera)
                    startTransition()
                    break
                case 'playPause':
                    if (state.hasAnimation) {
                        if (state.cameraMode === 'anim') {
                            state.animationPaused = !state.animationPaused
                        } else {
                            state.cameraMode = 'anim'
                            state.animationPaused = false
                        }
                    }
                    break
                case 'requestFirstPerson':
                    state.cameraMode = 'fly'
                    break
                case 'toggleWalk':
                    if (collider) {
                        if (state.cameraMode === 'walk') {
                            state.cameraMode = preWalkMode
                        } else {
                            preWalkMode = state.cameraMode
                            state.cameraMode = 'walk'
                        }
                    }
                    break
                case 'exitWalk':
                    if (state.cameraMode === 'walk') {
                        state.cameraMode = preWalkMode
                    }
                    break
                case 'cancel':
                    if (state.cameraMode === 'anim') {
                        state.cameraMode = fromMode
                    }
                    break
                case 'interrupt':
                    if (state.cameraMode === 'anim') {
                        state.cameraMode = fromMode
                    }
                    break
            }
        })
        // handle camera mode switching
        events.on('cameraMode:changed', (value, prev) => {
            if (prev === 'walk') {
                walkSource.cancelWalk()
            }
            // snapshot the current pose before any controller mutation
            startTransition()
            target.copy(this.camera)
            fromMode = prev
            // exit the old controller
            const prevController = getController(prev)
            prevController.onExit(this.camera)
            // enter new controller
            const newController = getController(value)
            newController.onEnter(this.camera)
        })
        // handle user scrubbing the animation timeline
        events.on('scrubAnim', (time) => {
            // switch to animation camera if we're not already there
            state.cameraMode = 'anim'
            // set time
            this.controllers.anim.animState.cursor.value = time
        })
        // handle user picking in the scene
        events.on('pick', (position) => {
            // switch to orbit camera on pick
            state.cameraMode = 'orbit'
            // construct camera
            tmpCamera.copy(this.camera)
            tmpCamera.look(this.camera.position, position)
            this.ontrollers.orbit.goto(tmpCamera)
            startTransition()
        })
        events.on('annotation.activate', (annotation) => {
            // switch to orbit camera on pick
            state.cameraMode = 'orbit'
            const { initial } = annotation.camera
            // construct camera
            tmpCamera.fov = initial.fov
            tmpCamera.look(new Vec3(initial.position), new Vec3(initial.target))
            this.controllers.orbit.goto(tmpCamera)
            startTransition()
        })
        // tap-to-walk: start auto-walking toward a picked 3D position
        events.on('walkTo', (position, normal) => {
            if (state.cameraMode === 'walk') {
                walkSource.walkTo(position)
                events.fire('walkTarget:set', position, normal)
            }
        })
        // cancel any active auto-walk
        events.on('walkCancel', () => {
            walkSource.cancelWalk()
            events.fire('walkTarget:clear')
        })
        events.on('walkComplete', () => {
            events.fire('walkTarget:clear')
        })
    }
}

// override global pick to pack depth instead of meshInstance id
const pickDepthGlsl = /* glsl */ `
uniform vec4 camera_params;     // 1/far, far, near, isOrtho
vec4 getPickOutput() {
    float linearDepth = 1.0 / gl_FragCoord.w;
    float normalizedDepth = (linearDepth - camera_params.z) / (camera_params.y - camera_params.z);
    return vec4(gaussianColor.a * normalizedDepth, 0.0, 0.0, gaussianColor.a);
}
`
const pickDepthWgsl = /* wgsl */ `
    uniform camera_params: vec4f;       // 1/far, far, near, isOrtho
    fn getPickOutput() -> vec4f {
        let linearDepth = 1.0 / pcPosition.w;
        let normalizedDepth = (linearDepth - uniform.camera_params.z) / (uniform.camera_params.y - uniform.camera_params.z);
        let a = f32(gaussianColor.a);
        return vec4f(a * normalizedDepth, 0.0, 0.0, a);
    }
`
const vec$1 = new Vec3()
const vecb = new Vec3()
const ray = new Ray()
const clearColor = new Color(0, 0, 0, 1)
// Shared buffer for half-to-float conversion
const float32 = new Float32Array(1)
const uint32 = new Uint32Array(float32.buffer)
// Convert 16-bit half-float to 32-bit float using bit manipulation
const half2Float = (h) => {
    const sign = (h & 0x8000) << 16 // Move sign to bit 31
    const exponent = (h & 0x7c00) >> 10 // Extract 5-bit exponent
    const mantissa = h & 0x03ff // Extract 10-bit mantissa
    if (exponent === 0) {
        if (mantissa === 0) {
            // Zero
            uint32[0] = sign
        } else {
            // Denormalized: convert to normalized float32
            let e = -1
            let m = mantissa
            do {
                e++
                m <<= 1
            } while ((m & 0x0400) === 0)
            uint32[0] = sign | ((127 - 15 - e) << 23) | ((m & 0x03ff) << 13)
        }
    } else if (exponent === 31) {
        // Infinity or NaN
        uint32[0] = sign | 0x7f800000 | (mantissa << 13)
    } else {
        // Normalized: adjust exponent bias from 15 to 127
        uint32[0] = sign | ((exponent + 127 - 15) << 23) | (mantissa << 13)
    }
    return float32[0]
}
// get the normalized world-space ray starting at the camera position
// facing the supplied screen position
// works for both perspective and orthographic cameras
const getRay = (camera, screenX, screenY, ray) => {
    const cameraPos = camera.getPosition()
    // create the pick ray in world space
    if (camera.camera.projection === PROJECTION_ORTHOGRAPHIC) {
        camera.camera.screenToWorld(screenX, screenY, -1, vec$1)
        camera.camera.screenToWorld(screenX, screenY, 1.0, vecb)
        vecb.sub(vec$1).normalize()
        ray.set(vec$1, vecb)
    } else {
        camera.camera.screenToWorld(screenX, screenY, 1.0, vec$1)
        vec$1.sub(cameraPos).normalize()
        ray.set(cameraPos, vec$1)
    }
}
class Picker {
    pick
    release
    constructor(app, camera) {
        const { graphicsDevice } = app
        // register pick depth shader chunks
        ShaderChunks.get(graphicsDevice, 'glsl').set('pickPS', pickDepthGlsl)
        ShaderChunks.get(graphicsDevice, 'wgsl').set('pickPS', pickDepthWgsl)
        let colorBuffer
        let renderTarget
        let renderPass
        const emptyMap = new Map()
        const init = (width, height) => {
            colorBuffer = new Texture(graphicsDevice, {
                format: PIXELFORMAT_RGBA16F,
                width: width,
                height: height,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
                name: 'picker',
            })
            renderTarget = new RenderTarget({
                colorBuffer,
                depth: false, // not needed - gaussians are rendered back to front
            })
            renderPass = new RenderPassPicker(graphicsDevice, app.renderer)
            // RGB: additive depth accumulation (ONE, ONE_MINUS_SRC_ALPHA)
            // Alpha: multiplicative transmittance (ZERO, ONE_MINUS_SRC_ALPHA) -> T = T * (1 - alpha)
            renderPass.blendState = new BlendState(
                true,
                BLENDEQUATION_ADD,
                BLENDMODE_ONE,
                BLENDMODE_ONE_MINUS_SRC_ALPHA, // RGB blend
                BLENDEQUATION_ADD,
                BLENDMODE_ZERO,
                BLENDMODE_ONE_MINUS_SRC_ALPHA, // Alpha blend (transmittance)
            )
        }
        this.pick = async (x, y) => {
            const width = Math.floor(graphicsDevice.width)
            const height = Math.floor(graphicsDevice.height)
            // convert from [0,1] to pixel coordinates
            const screenX = Math.floor(x * graphicsDevice.width)
            const screenY = Math.floor(y * graphicsDevice.height)
            // flip Y for texture read on WebGL (texture origin is bottom-left)
            const texX = screenX
            const texY = graphicsDevice.isWebGL2 ? height - screenY - 1 : screenY
            // construct picker on demand
            if (!renderPass) {
                init(width, height)
            } else {
                renderTarget.resize(width, height)
            }
            // render scene
            renderPass.init(renderTarget)
            renderPass.setClearColor(clearColor)
            renderPass.update(camera.camera, app.scene, [app.scene.layers.getLayerByName('World')], emptyMap, false)
            renderPass.render()
            // read pixel using texture coordinates
            const pixels = await colorBuffer.read(texX, texY, 1, 1, { renderTarget, immediate: true })
            // convert half-float values to floats
            // R channel: accumulated depth * alpha
            // A channel: transmittance (1 - alpha), values near 0 have better half-float precision
            const r = half2Float(pixels[0])
            const transmittance = half2Float(pixels[3])
            const alpha = 1 - transmittance
            // check alpha first (transmittance close to 1 means nothing visible)
            if (alpha < 1e-6) {
                return null
            }
            // get camera near/far for denormalization
            const near = camera.camera.nearClip
            const far = camera.camera.farClip
            // divide by alpha to get normalized depth, then denormalize to linear depth
            const normalizedDepth = r / alpha
            const depth = normalizedDepth * (far - near) + near
            // get the ray from camera through the screen point (using pixel coords)
            getRay(
                camera,
                Math.floor(x * graphicsDevice.canvas.offsetWidth),
                Math.floor(y * graphicsDevice.canvas.offsetHeight),
                ray,
            )
            // convert linear depth (view-space z distance) to ray distance
            const forward = camera.forward
            const t = depth / ray.direction.dot(forward)
            // world position = ray origin + ray direction * t
            return ray.origin.clone().add(ray.direction.clone().mulScalar(t))
        }
        this.release = () => {
            renderPass?.destroy()
            renderTarget?.destroy()
            colorBuffer?.destroy()
        }
    }
}

/* Vec initialisation to avoid recurrent memory allocation */
const tmpV1 = new Vec3()
const tmpV2 = new Vec3()
const mouseRotate = new Vec3()
const flyMove = new Vec3()
const flyTouchPan = new Vec3()
const pinchMove = new Vec3()
const orbitRotate = new Vec3()
const flyRotate = new Vec3()
const stickMove = new Vec3()
const stickRotate = new Vec3()
/** Maximum accumulated touch movement (px) to still count as a tap */
const TAP_EPSILON = 15
/**
 * Displacement-based inputs (mouse, touch, wheel, pinch) return accumulated pixel
 * offsets that already scale with frame time. This factor converts rate-based speed
 * constants (tuned for degrees-per-second) to work with per-frame displacements,
 * making them frame-rate-independent.
 */
const DISPLACEMENT_SCALE = 1 / 60
/**
 * Converts screen space mouse deltas to world space pan vector.
 *
 * @param camera - The camera component.
 * @param dx - The mouse delta x value.
 * @param dy - The mouse delta y value.
 * @param dz - The world space zoom delta value.
 * @param out - The output vector to store the pan result.
 * @returns - The pan vector in world space.
 * @private
 */
const screenToWorld = (camera, dx, dy, dz, out = new Vec3()) => {
    const { system, fov, aspectRatio, horizontalFov, projection, orthoHeight } = camera
    const { width, height } = system.app.graphicsDevice.clientRect
    // normalize deltas to device coord space
    out.set(-(dx / width) * 2, (dy / height) * 2, 0)
    // calculate half size of the view frustum at the current distance
    const halfSize = tmpV2.set(0, 0, 0)
    if (projection === PROJECTION_PERSPECTIVE) {
        const halfSlice = dz * Math.tan(0.5 * fov * math.DEG_TO_RAD)
        if (horizontalFov) {
            halfSize.set(halfSlice, halfSlice / aspectRatio, 0)
        } else {
            halfSize.set(halfSlice * aspectRatio, halfSlice, 0)
        }
    } else {
        halfSize.set(orthoHeight * aspectRatio, orthoHeight, 0)
    }
    // scale by device coord space
    out.mul(halfSize)
    return out
}
// patch keydown and keyup to ignore events with meta key otherwise
// keys can get stuck on macOS.
const patchKeyboardMeta = (desktopInput) => {
    const origOnKeyDown = desktopInput._onKeyDown
    desktopInput._onKeyDown = (event) => {
        if (event.key === 'Meta') {
            desktopInput._keyNow.fill(0)
        } else if (!event.metaKey) {
            origOnKeyDown(event)
        }
    }
    const origOnKeyUp = desktopInput._onKeyUp
    desktopInput._onKeyUp = (event) => {
        if (event.key === 'Meta') {
            desktopInput._keyNow.fill(0)
        } else if (!event.metaKey) {
            origOnKeyUp(event)
        }
    }
}
class InputController {
    _state = {
        axis: new Vec3(),
        mouse: [0, 0, 0],
        shift: 0,
        ctrl: 0,
        jump: 0,
        touches: 0,
    }
    _desktopInput = new KeyboardMouseSource()
    _orbitInput = new MultiTouchSource()
    _gamepadInput = new GamepadSource()
    global
    frame = new InputFrame({
        move: [0, 0, 0],
        rotate: [0, 0, 0],
    })
    // Touch joystick input values [x, y] (-1 to 1)
    _touchJoystick = [0, 0]
    // Accumulated forward/backward velocity from pinch gesture (-1 to 1)
    _pinchVelocity = 0
    // Accumulated strafe/vertical velocity from two-finger pan [x, y] (-1 to 1)
    _panVelocity = [0, 0]
    // Sensitivity for pinch delta → velocity conversion
    pinchVelocitySensitivity = 0.006
    // Sensitivity for two-finger pan delta → velocity conversion
    panVelocitySensitivity = 0.005
    // Tap-to-jump state (uses existing MultiTouchSource count/touch deltas)
    _tapTouches = 0
    _tapDelta = 0
    _tapJump = false
    // Screen coordinates of the last pointer start (for click/tap-to-walk picking)
    _lastPointerOffsetX = 0
    _lastPointerOffsetY = 0
    // Desktop click-to-walk tracking
    _mouseClickTracking = false
    _mouseClickDelta = 0
    _picker = null
    collider = null
    moveSpeed = 4
    orbitSpeed = 18
    pinchSpeed = 0.4
    wheelSpeed = 0.06
    mouseRotateSensitivity = 0.5
    touchRotateSensitivity = 1.5
    touchPinchMoveSensitivity = 1.5
    gamepadRotateSensitivity = 1.0
    constructor(global) {
        const { app, camera, events, state } = global
        const canvas = app.graphicsDevice.canvas
        patchKeyboardMeta(this._desktopInput)
        this._desktopInput.attach(canvas)
        this._orbitInput.attach(canvas)
        // Listen for joystick input from the UI (touch joystick element)
        events.on('joystickInput', (value) => {
            this._touchJoystick[0] = value.x
            this._touchJoystick[1] = value.y
        })
        this.global = global
        const updateCanvasCursor = () => {
            if (state.cameraMode === 'walk' && !state.gamingControls && state.inputMode === 'desktop') {
                canvas.style.cursor = this._mouseClickTracking ? 'default' : 'pointer'
            } else {
                canvas.style.cursor = ''
            }
        }
        // Generate input events
        ;['wheel', 'pointerdown', 'contextmenu', 'keydown'].forEach((eventName) => {
            canvas.addEventListener(eventName, (event) => {
                events.fire('inputEvent', 'interrupt', event)
            })
        })
        canvas.addEventListener('pointermove', (event) => {
            events.fire('inputEvent', 'interact', event)
        })
        // Detect double taps manually because iOS doesn't send dblclick events
        const lastTap = { time: 0, x: 0, y: 0 }
        canvas.addEventListener('pointerdown', (event) => {
            // Store coordinates for click/tap-to-walk picking
            this._lastPointerOffsetX = event.offsetX
            this._lastPointerOffsetY = event.offsetY
            // Start desktop click-to-walk tracking
            if (event.pointerType !== 'touch' && event.button === 0) {
                this._mouseClickTracking = true
                this._mouseClickDelta = 0
                updateCanvasCursor()
            }
            const now = Date.now()
            const delay = Math.max(0, now - lastTap.time)
            if (delay < 300 && Math.abs(event.clientX - lastTap.x) < 8 && Math.abs(event.clientY - lastTap.y) < 8) {
                events.fire('inputEvent', 'dblclick', event)
                lastTap.time = 0
            } else {
                lastTap.time = now
                lastTap.x = event.clientX
                lastTap.y = event.clientY
            }
        })
        // Desktop click-to-walk: accumulate displacement during mouse drag
        canvas.addEventListener('pointermove', (event) => {
            if (this._mouseClickTracking && event.pointerType !== 'touch') {
                const prev = this._mouseClickDelta
                this._mouseClickDelta += Math.abs(event.movementX) + Math.abs(event.movementY)
                if (prev < TAP_EPSILON && this._mouseClickDelta >= TAP_EPSILON) {
                    if (state.cameraMode === 'walk' && !state.gamingControls) {
                        events.fire('walkCancel')
                    }
                }
            }
        })
        // Desktop click-to-walk: detect click (low displacement) on mouse button release
        canvas.addEventListener('pointerup', (event) => {
            if (this._mouseClickTracking && event.pointerType !== 'touch' && event.button === 0) {
                this._mouseClickTracking = false
                updateCanvasCursor()
                if (this._mouseClickDelta < TAP_EPSILON && state.cameraMode === 'walk' && !state.gamingControls) {
                    const result = this._pickVoxel(this._lastPointerOffsetX, this._lastPointerOffsetY)
                    if (result) {
                        events.fire('walkTo', result.position, result.normal)
                    }
                }
            }
        })
        // update input mode based on pointer event
        ;['pointerdown', 'pointermove'].forEach((eventName) => {
            window.addEventListener(eventName, (event) => {
                state.inputMode = event.pointerType === 'touch' ? 'touch' : 'desktop'
            })
        })
        let recentlyExitedWalk = false
        // handle keyboard events
        window.addEventListener('keydown', (event) => {
            const tag = document.activeElement?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable)
                return
            if (event.key === 'Escape') {
                if (recentlyExitedWalk);
                else if (state.cameraMode === 'walk' && state.gamingControls && state.inputMode === 'desktop') {
                    state.gamingControls = false
                } else if (state.cameraMode === 'walk') {
                    events.fire('inputEvent', 'exitWalk', event)
                } else {
                    events.fire('inputEvent', 'cancel', event)
                }
            } else if (!event.ctrlKey && !event.altKey && !event.metaKey) {
                switch (event.key) {
                    case 'f':
                        // events.fire('inputEvent', 'frame', event)
                        break
                    case 'r':
                        // events.fire('inputEvent', 'reset', event)
                        break
                }
            }
        })
        const activatePointerLock = () => {
            this._desktopInput._pointerLock = true
            canvas.requestPointerLock()
        }
        const deactivatePointerLock = () => {
            this._desktopInput._pointerLock = false
            if (document.pointerLockElement === canvas) {
                document.exitPointerLock()
            }
        }
        // Pointer lock management for walk mode on desktop (gaming controls only)
        events.on('cameraMode:changed', (value, prev) => {
            if (value === 'walk' && state.inputMode === 'desktop' && state.gamingControls) {
                activatePointerLock()
            } else if (prev === 'walk') {
                deactivatePointerLock()
            }
            updateCanvasCursor()
        })
        // Toggle pointer lock when gaming controls changes while in walk mode
        events.on('gamingControls:changed', (value) => {
            if (state.cameraMode === 'walk' && state.inputMode === 'desktop') {
                if (value) {
                    activatePointerLock()
                } else {
                    deactivatePointerLock()
                }
            }
            updateCanvasCursor()
        })
        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement && state.cameraMode === 'walk' && state.gamingControls) {
                recentlyExitedWalk = true
                requestAnimationFrame(() => {
                    recentlyExitedWalk = false
                })
                if (state.inputMode === 'desktop') {
                    state.gamingControls = false
                } else {
                    events.fire('inputEvent', 'exitWalk')
                }
            }
        })
        // Pointer lock request rejected (e.g., no user gesture, document hidden).
        // Revert to avoid being stuck in walk mode without mouse capture.
        document.addEventListener('pointerlockerror', () => {
            this._desktopInput._pointerLock = false
            if (state.inputMode === 'desktop') {
                state.gamingControls = false
            } else {
                events.fire('inputEvent', 'exitWalk')
            }
        })
    }
    _pickVoxel(offsetX, offsetY) {
        if (!this.collider) return null
        const { camera } = this.global
        const cameraPos = camera.getPosition()
        camera.camera.screenToWorld(offsetX, offsetY, 1.0, tmpV1)
        tmpV1.sub(cameraPos).normalize()
        // PlayCanvas → voxel space: negate X and Y
        const hit = this.collider.queryRay(
            -cameraPos.x,
            -cameraPos.y,
            cameraPos.z,
            -tmpV1.x,
            -tmpV1.y,
            tmpV1.z,
            camera.camera.farClip,
        )
        if (!hit) return null
        const rdx = -tmpV1.x
        const rdy = -tmpV1.y
        const rdz = tmpV1.z
        const sn = this.collider.querySurfaceNormal(hit.x, hit.y, hit.z, rdx, rdy, rdz)
        return {
            position: new Vec3(-hit.x, -hit.y, hit.z),
            normal: new Vec3(-sn.nx, -sn.ny, sn.nz),
        }
    }
    /**
     * @param dt - delta time in seconds
     * @param state - the current state of the app
     * @param state.cameraMode - the current camera mode
     * @param distance - the distance to the camera target
     */
    update(dt, distance) {
        const { keyCode } = KeyboardMouseSource
        const { key, button, mouse, wheel } = this._desktopInput.read()
        const { touch, pinch, count } = this._orbitInput.read()
        const { leftStick, rightStick } = this._gamepadInput.read()
        const { state, events } = this.global
        const { camera } = this.global.camera
        // update state
        const isOrtery = state.cameraMode === 'ortery'
        this._state.axis.add(
            tmpV1.set(
                isOrtery ? 0 : key[keyCode.D] - key[keyCode.A] + (key[keyCode.RIGHT] - key[keyCode.LEFT]),
                isOrtery ? 0 : key[keyCode.E] - key[keyCode.Q],
                isOrtery ? 0 : key[keyCode.W] - key[keyCode.S] + (key[keyCode.UP] - key[keyCode.DOWN]),
            ),
        )
        // if(!isOrtery) this._state.jump += key[keyCode.SPACE]
        this._state.touches += count[0]
        for (let i = 0; i < button.length; i++) {
            this._state.mouse[i] += button[i]
        }
        // this._state.shift += key[keyCode.SHIFT]
        // this._state.ctrl += key[keyCode.CTRL]
        const isWalk = state.cameraMode === 'walk'
        // Cancel any active auto-walk when the user provides WASD/arrow input
        if (isWalk && (this._state.axis.x !== 0 || this._state.axis.z !== 0)) {
            events.fire('walkCancel')
        }
        // Tap detection using existing MultiTouchSource deltas
        if (isWalk) {
            const prevTaps = this._tapTouches
            this._tapTouches = Math.max(0, this._tapTouches + count[0])
            // Touch just started (0 → 1+)
            if (prevTaps === 0 && this._tapTouches > 0) {
                this._tapDelta = 0
            }
            // Accumulate movement while touch is active
            if (this._tapTouches > 0) {
                const prevDelta = this._tapDelta
                this._tapDelta += Math.abs(touch[0]) + Math.abs(touch[1])
                if (prevDelta < TAP_EPSILON && this._tapDelta >= TAP_EPSILON) {
                    if (!state.gamingControls) {
                        events.fire('walkCancel')
                    }
                }
            }
            // Touch just ended (1+ → 0): check if it was a tap
            if (prevTaps > 0 && this._tapTouches === 0) {
                if (this._tapDelta < TAP_EPSILON) {
                    if (!state.gamingControls) {
                        const result = this._pickVoxel(this._lastPointerOffsetX, this._lastPointerOffsetY)
                        if (result && state.cameraMode === 'walk' && !state.gamingControls) {
                            events.fire('walkTo', result.position, result.normal)
                        }
                    } else {
                        this._tapJump = true
                    }
                }
            }
        } else {
            this._tapTouches = 0
        }
        const isFirstPerson = state.cameraMode === 'fly' || isWalk
        // Accumulate pinch and pan deltas into velocity when not in gaming controls
        // pinch[0] = oldDist - newDist: negative when spreading, positive when closing
        // Spreading = forward → subtract pinch delta
        if (isFirstPerson && !state.gamingControls && this._state.touches > 1) {
            this._pinchVelocity -= pinch[0] * this.pinchVelocitySensitivity
            this._pinchVelocity = math.clamp(this._pinchVelocity, -1, 1.0)
            this._panVelocity[0] += touch[0] * this.panVelocitySensitivity
            this._panVelocity[0] = math.clamp(this._panVelocity[0], -1, 1.0)
            this._panVelocity[1] += touch[1] * this.panVelocitySensitivity
            this._panVelocity[1] = math.clamp(this._panVelocity[1], -1, 1.0)
        } else if (isFirstPerson && this._state.touches <= 1) {
            this._pinchVelocity = 0
            this._panVelocity[0] = 0
            this._panVelocity[1] = 0
        }
        if (!isFirstPerson && this._state.axis.length() > 0) {
            events.fire('inputEvent', 'requestFirstPerson')
        }
        const orbit = +(state.cameraMode === 'orbit' || state.cameraMode === 'ortery')
        const fly = +isFirstPerson
        const double = +(this._state.touches > 1)
        const pan = this._state.mouse[2] || +(button[2] === -1) || double
        const orbitFactor = fly ? camera.fov / 120 : 1
        const dragInvert = isFirstPerson && !state.gamingControls ? -1 : 1
        const { deltas } = this.frame
        // desktop move
        const v = tmpV1.set(0, 0, 0)
        const keyMove = this._state.axis.clone()
        if (isWalk) {
            // In walk mode, normalize only horizontal axes so jump doesn't reduce speed
            keyMove.y = 0
        }
        keyMove.normalize()
        const shiftMul = isWalk ? 2 : 4
        const ctrlMul = isWalk ? 0.5 : 0.25
        const speed = this.moveSpeed * (this._state.shift ? shiftMul : this._state.ctrl ? ctrlMul : 1)
        v.add(keyMove.mulScalar(fly * speed * dt))
        if (isWalk) {
            // Pass jump signal as raw Y; WalkController uses move[1] > 0 as boolean trigger
            v.y = this._state.jump > 0 ? 1 : 0
        }
        const panMove = screenToWorld(camera, mouse[0], mouse[1], distance)
        v.add(panMove.mulScalar(pan))
        const wheelMove = new Vec3(0, 0, -wheel[0])
        v.add(wheelMove.mulScalar(this.wheelSpeed * DISPLACEMENT_SCALE))
        // FIXME: need to flip z axis for orbit camera
        deltas.move.append([v.x, v.y, orbit ? -v.z : v.z])
        // desktop rotate
        v.set(0, 0, 0)
        mouseRotate.set(mouse[0], mouse[1], 0)
        v.add(
            mouseRotate.mulScalar(
                (1 - pan) * this.orbitSpeed * orbitFactor * this.mouseRotateSensitivity * DISPLACEMENT_SCALE,
            ),
        )
        deltas.rotate.append([v.x, v.y, v.z])
        // mobile move
        v.set(0, 0, 0)
        const orbitMove = screenToWorld(camera, touch[0], touch[1], distance)
        v.add(orbitMove.mulScalar(orbit * pan))
        if (state.gamingControls) {
            // Use touch joystick values for fly movement (X = strafe, Y = forward/backward)
            flyMove.set(this._touchJoystick[0], 0, -this._touchJoystick[1])
            v.add(flyMove.mulScalar(fly * this.moveSpeed * dt))
        } else {
            // Pan velocity → strafe (X) and vertical (Y, fly only — walk uses gravity)
            flyTouchPan.set(this._panVelocity[0], isWalk ? 0 : -this._panVelocity[1], 0)
            v.add(flyTouchPan.mulScalar(fly * this.touchPinchMoveSensitivity * this.moveSpeed * dt))
            // Pinch velocity → forward/backward
            flyMove.set(0, 0, this._pinchVelocity)
            v.add(flyMove.mulScalar(fly * this.touchPinchMoveSensitivity * this.moveSpeed * dt))
        }
        pinchMove.set(0, 0, pinch[0])
        v.add(pinchMove.mulScalar(orbit * double * this.pinchSpeed * DISPLACEMENT_SCALE))
        // Tap-to-jump for mobile walk mode
        if (isWalk && this._tapJump) {
            v.y = 1
            this._tapJump = false
        }
        deltas.move.append([v.x, v.y, v.z])
        // mobile rotate
        v.set(0, 0, 0)
        orbitRotate.set(touch[0], touch[1], 0)
        v.add(
            orbitRotate.mulScalar(
                orbit * (1 - pan) * this.orbitSpeed * this.touchRotateSensitivity * DISPLACEMENT_SCALE,
            ),
        )
        // In fly mode, use single touch for look-around (inverted direction)
        // Exclude multi-touch (double) to avoid interference with pinch/strafe gestures
        flyRotate.set(touch[0] * dragInvert, touch[1] * dragInvert, 0)
        v.add(
            flyRotate.mulScalar(
                fly * (1 - double) * this.orbitSpeed * orbitFactor * this.touchRotateSensitivity * DISPLACEMENT_SCALE,
            ),
        )
        deltas.rotate.append([v.x, v.y, v.z])
        // gamepad move
        v.set(0, 0, 0)
        stickMove.set(leftStick[0], 0, -leftStick[1])
        v.add(stickMove.mulScalar(this.moveSpeed * dt))
        deltas.move.append([v.x, v.y, v.z])
        // gamepad rotate
        v.set(0, 0, 0)
        stickRotate.set(rightStick[0], rightStick[1], 0)
        v.add(stickRotate.mulScalar(this.orbitSpeed * orbitFactor * this.gamepadRotateSensitivity * dt))
        deltas.rotate.append([v.x, v.y, v.z])
    }
}

// ---------------------------------------------------------------------------
// WGSL compute shader: ray-march through the sparse voxel octree per pixel
// ---------------------------------------------------------------------------
const voxelOverlayWGSL = /* wgsl */ `

// Solid leaf sentinel: childMask=0xFF, baseOffset=0
const SOLID_LEAF_MARKER: u32 = 0xFF000000u;

// Maximum DDA steps to prevent infinite loops
const MAX_STEPS: u32 = 512u;

// Target wireframe edge width in pixels
const EDGE_PIXELS: f32 = 1.5;

// Wireframe edge alpha
const EDGE_ALPHA: f32 = 0.85;

// Interior fill alpha (subtle orientation tint)
const FILL_ALPHA: f32 = 0.12;

struct Uniforms {
    invVP: mat4x4<f32>,
    screenWidth: u32,
    screenHeight: u32,
    gridMinX: f32,
    gridMinY: f32,
    gridMinZ: f32,
    voxelRes: f32,
    numVoxelsX: u32,
    numVoxelsY: u32,
    numVoxelsZ: u32,
    leafSize: u32,
    treeDepth: u32,
    projScaleY: f32,
    displayMode: u32,
    pad2: u32
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> nodes: array<u32>;
@group(0) @binding(2) var<storage, read> leafData: array<u32>;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>;

// ---- helpers ----

// Traverse the octree for block (bx, by, bz). Returns vec2u(result, emptyLevel):
//   result: 0 = empty, 1 = solid, 2+ = mixed leaf (2 + leafDataIndex)
//   emptyLevel: octree level at which emptiness was detected (only meaningful when result == 0)
fn queryBlock(bx: i32, by: i32, bz: i32) -> vec2u {
    let depth = uniforms.treeDepth;
    var nodeIndex: u32 = 0u;

    for (var level: u32 = depth - 1u; ; ) {
        let node = nodes[nodeIndex];

        // Solid leaf sentinel
        if (node == SOLID_LEAF_MARKER) {
            return vec2u(1u, 0u);
        }

        let childMask = (node >> 24u) & 0xFFu;

        // childMask == 0 means this is a mixed leaf node
        if (childMask == 0u) {
            let leafIdx = node & 0x00FFFFFFu;
            return vec2u(2u + leafIdx, 0u);
        }

        // Determine octant at this level
        let bitX = (u32(bx) >> level) & 1u;
        let bitY = (u32(by) >> level) & 1u;
        let bitZ = (u32(bz) >> level) & 1u;
        let octant = (bitZ << 2u) | (bitY << 1u) | bitX;

        // Check if child exists
        if ((childMask & (1u << octant)) == 0u) {
            return vec2u(0u, level);
        }

        // Compute child index
        let baseOffset = node & 0x00FFFFFFu;
        let prefix = (1u << octant) - 1u;
        let childOffset = countOneBits(childMask & prefix);
        nodeIndex = baseOffset + childOffset;

        if (level == 0u) { break; }
        level -= 1u;
    }

    // Reached leaf level
    let node = nodes[nodeIndex];
    if (node == SOLID_LEAF_MARKER) {
        return vec2u(1u, 0u);
    }
    let leafIdx = node & 0x00FFFFFFu;
    return vec2u(2u + leafIdx, 0u);
}

// Ray-AABB intersection returning (tNear, tFar). If tNear > tFar → miss.
fn intersectAABB(ro: vec3f, invDir: vec3f, bmin: vec3f, bmax: vec3f) -> vec2f {
    let t1 = (bmin - ro) * invDir;
    let t2 = (bmax - ro) * invDir;
    let tmin = min(t1, t2);
    let tmax = max(t1, t2);
    let tNear = max(max(tmin.x, tmin.y), tmin.z);
    let tFar  = min(min(tmax.x, tmax.y), tmax.z);
    return vec2f(tNear, tFar);
}

// Compute wireframe edge factor (0 = interior, 1 = on edge) for a hit point on a voxel cube.
// Uses the median of the three per-axis face distances so it works on ANY face.
fn edgeFactor(hitPos: vec3f, voxMin: vec3f, voxSize: f32, edgeWidth: f32) -> f32 {
    let local = (hitPos - voxMin) / voxSize;

    // Distance to nearest face boundary for each axis
    let fx = min(local.x, 1.0 - local.x);
    let fy = min(local.y, 1.0 - local.y);
    let fz = min(local.z, 1.0 - local.z);

    // Median of three values = second smallest = edge distance.
    // On a face, one of fx/fy/fz is ~0 (the face normal axis).
    // The median gives the smaller of the other two = distance to nearest edge.
    let edgeDist = max(min(fx, fy), min(max(fx, fy), fz));

    return 1.0 - smoothstep(0.0, edgeWidth, edgeDist);
}

// Shade a voxel hit, returning premultiplied RGBA
fn shadeVoxelHit(hitPos: vec3f, voxMin: vec3f, voxelRes: f32, ro: vec3f, isSolid: bool) -> vec4f {
    let dist = length(hitPos - ro);
    let pixelWorld = 2.0 * dist / (f32(uniforms.screenHeight) * uniforms.projScaleY);
    let ew = clamp(EDGE_PIXELS * pixelWorld / voxelRes, 0.01, 0.5);

    let ef = edgeFactor(hitPos, voxMin, voxelRes, ew);
    let distFade = clamp(1.0 - dist * 0.01, 0.2, 1.0);

    let local = (hitPos - voxMin) / voxelRes;
    let fx = min(local.x, 1.0 - local.x);
    let fy = min(local.y, 1.0 - local.y);
    let fz = min(local.z, 1.0 - local.z);

    var faceAxis: u32 = 0u;
    if (fy <= fx && fy <= fz) {
        faceAxis = 1u;
    } else if (fz <= fx) {
        faceAxis = 2u;
    }

    var baseColor: vec3f;
    if (isSolid) {
        if (faceAxis == 0u) { baseColor = vec3f(1.0, 0.25, 0.2); }
        else if (faceAxis == 1u) { baseColor = vec3f(0.8, 0.15, 0.1); }
        else { baseColor = vec3f(0.55, 0.08, 0.05); }
    } else {
        if (faceAxis == 0u) { baseColor = vec3f(0.7, 0.7, 0.72); }
        else if (faceAxis == 1u) { baseColor = vec3f(0.5, 0.5, 0.52); }
        else { baseColor = vec3f(0.33, 0.33, 0.35); }
    }

    let alpha = mix(FILL_ALPHA, EDGE_ALPHA, ef) * distFade;

    return vec4f(mix(baseColor, vec3f(0.0), alpha) * alpha, alpha);
}

// Blue (0) -> Cyan (0.25) -> Green (0.5) -> Yellow (0.75) -> Red (1.0)
fn heatmap(t: f32) -> vec3f {
    let c = clamp(t, 0.0, 1.0);
    let r = clamp(min(c - 0.5, 1.0) * 2.0, 0.0, 1.0);
    let g = select(clamp(c * 4.0, 0.0, 1.0), clamp((1.0 - c) * 4.0, 0.0, 1.0), c > 0.5);
    let b = clamp(1.0 - c * 2.0, 0.0, 1.0);
    return vec3f(r, g, b);
}

// ---- main ----

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let px = i32(gid.x);
    let py = i32(gid.y);
    let sw = i32(uniforms.screenWidth);
    let sh = i32(uniforms.screenHeight);

    if (px >= sw || py >= sh) {
        return;
    }

    // Reconstruct world-space ray from pixel coordinates
    let ndcX = (f32(px) + 0.5) / f32(sw) * 2.0 - 1.0;
    let ndcY = -((f32(py) + 0.5) / f32(sh) * 2.0 - 1.0);

    let clipNear = vec4f(ndcX, ndcY, 0.0, 1.0);
    let clipFar  = vec4f(ndcX, ndcY, 1.0, 1.0);

    var worldNear = uniforms.invVP * clipNear;
    worldNear = worldNear / worldNear.w;
    var worldFar = uniforms.invVP * clipFar;
    worldFar = worldFar / worldFar.w;

    // Convert from PlayCanvas world space to voxel space (negate X and Y)
    let ro = vec3f(-worldNear.x, -worldNear.y, worldNear.z);
    let rd = normalize(vec3f(-(worldFar.x - worldNear.x), -(worldFar.y - worldNear.y), worldFar.z - worldNear.z));

    // Grid AABB
    let gridMin = vec3f(uniforms.gridMinX, uniforms.gridMinY, uniforms.gridMinZ);
    let gridMax = gridMin + vec3f(
        f32(uniforms.numVoxelsX),
        f32(uniforms.numVoxelsY),
        f32(uniforms.numVoxelsZ)
    ) * uniforms.voxelRes;

    let invDir = 1.0 / rd;
    let gridHit = intersectAABB(ro, invDir, gridMin, gridMax);

    if (gridHit.x > gridHit.y) {
        textureStore(outputTexture, vec2i(px, py), vec4f(0.0));
        return;
    }

    let tEntry = max(gridHit.x, 0.0) + 0.0001;

    // Entry point in voxel-index space
    let entryWorld = ro + rd * tEntry;
    let voxelRes = uniforms.voxelRes;
    let lsf = f32(uniforms.leafSize);
    let blockRes = voxelRes * lsf;
    let leafSz = i32(uniforms.leafSize);

    // Block-level DDA setup
    let entryBlock = (entryWorld - gridMin) / blockRes;
    let numBlocksX = i32(uniforms.numVoxelsX / uniforms.leafSize);
    let numBlocksY = i32(uniforms.numVoxelsY / uniforms.leafSize);
    let numBlocksZ = i32(uniforms.numVoxelsZ / uniforms.leafSize);

    var bx = clamp(i32(floor(entryBlock.x)), 0, numBlocksX - 1);
    var by = clamp(i32(floor(entryBlock.y)), 0, numBlocksY - 1);
    var bz = clamp(i32(floor(entryBlock.z)), 0, numBlocksZ - 1);

    let stepX = select(-1, 1, rd.x >= 0.0);
    let stepY = select(-1, 1, rd.y >= 0.0);
    let stepZ = select(-1, 1, rd.z >= 0.0);

    let tDeltaX = abs(blockRes / rd.x);
    let tDeltaY = abs(blockRes / rd.y);
    let tDeltaZ = abs(blockRes / rd.z);

    // tMax: t value to reach next block boundary along each axis
    let blockMinWorld = gridMin + vec3f(f32(bx), f32(by), f32(bz)) * blockRes;
    let nextBoundX = select(blockMinWorld.x, blockMinWorld.x + blockRes, rd.x >= 0.0);
    let nextBoundY = select(blockMinWorld.y, blockMinWorld.y + blockRes, rd.y >= 0.0);
    let nextBoundZ = select(blockMinWorld.z, blockMinWorld.z + blockRes, rd.z >= 0.0);

    var tMaxX = (nextBoundX - ro.x) / rd.x;
    var tMaxY = (nextBoundY - ro.y) / rd.y;
    var tMaxZ = (nextBoundZ - ro.z) / rd.z;

    var totalWork: u32 = 0u;

    for (var step: u32 = 0u; step < MAX_STEPS; step++) {
        totalWork += 1u;

        let qResult = queryBlock(bx, by, bz);
        let blockResult = qResult.x;
        let emptyLevel = qResult.y;

        if (blockResult == 0u && emptyLevel >= 1u) {
            // Large empty region: advance the block DDA past the empty cell
            let cellBlocks = i32(1u << emptyLevel);
            let cellMask = ~(cellBlocks - 1);
            let cellXMin = bx & cellMask;
            let cellYMin = by & cellMask;
            let cellZMin = bz & cellMask;

            for (var skip: u32 = 0u; skip < 128u; skip++) {
                totalWork += 1u;

                if (tMaxX < tMaxY && tMaxX < tMaxZ) {
                    bx += stepX;
                    tMaxX += tDeltaX;
                    if (bx < cellXMin || bx >= cellXMin + cellBlocks) { break; }
                } else if (tMaxY < tMaxZ) {
                    by += stepY;
                    tMaxY += tDeltaY;
                    if (by < cellYMin || by >= cellYMin + cellBlocks) { break; }
                } else {
                    bz += stepZ;
                    tMaxZ += tDeltaZ;
                    if (bz < cellZMin || bz >= cellZMin + cellBlocks) { break; }
                }
            }
        } else {
            if (blockResult != 0u) {
                let blockOrigin = gridMin + vec3f(f32(bx), f32(by), f32(bz)) * blockRes;

                let blockMax = blockOrigin + vec3f(blockRes);
                let bHit = intersectAABB(ro, invDir, blockOrigin, blockMax);
                let tBlockEntry = max(bHit.x, 0.0);

                // Voxel-level DDA within the block
                let entryVoxWorld = ro + rd * (tBlockEntry + 0.0001);
                let entryLocal = (entryVoxWorld - blockOrigin) / voxelRes;
                var vx = clamp(i32(floor(entryLocal.x)), 0, leafSz - 1);
                var vy = clamp(i32(floor(entryLocal.y)), 0, leafSz - 1);
                var vz = clamp(i32(floor(entryLocal.z)), 0, leafSz - 1);

                let vTDeltaX = abs(voxelRes / rd.x);
                let vTDeltaY = abs(voxelRes / rd.y);
                let vTDeltaZ = abs(voxelRes / rd.z);

                let voxOrigin = blockOrigin + vec3f(f32(vx), f32(vy), f32(vz)) * voxelRes;
                let vNextX = select(voxOrigin.x, voxOrigin.x + voxelRes, rd.x >= 0.0);
                let vNextY = select(voxOrigin.y, voxOrigin.y + voxelRes, rd.y >= 0.0);
                let vNextZ = select(voxOrigin.z, voxOrigin.z + voxelRes, rd.z >= 0.0);

                var vTMaxX = (vNextX - ro.x) / rd.x;
                var vTMaxY = (vNextY - ro.y) / rd.y;
                var vTMaxZ = (vNextZ - ro.z) / rd.z;

                var maskLo: u32 = 0u;
                var maskHi: u32 = 0u;
                if (blockResult > 1u) {
                    let leafIdx = blockResult - 2u;
                    maskLo = leafData[leafIdx * 2u];
                    maskHi = leafData[leafIdx * 2u + 1u];
                }

                for (var vStep: u32 = 0u; vStep < 12u; vStep++) {
                    totalWork += 1u;

                    var isSolid = false;

                    if (blockResult == 1u) {
                        isSolid = true;
                    } else {
                        let bitIndex = u32(vz) * 16u + u32(vy) * 4u + u32(vx);
                        isSolid = select(
                            (maskHi & (1u << (bitIndex - 32u))) != 0u,
                            (maskLo & (1u << bitIndex)) != 0u,
                            bitIndex < 32u
                        );
                    }

                    if (isSolid) {
                        if (uniforms.displayMode == 0u) {
                            let voxMin = blockOrigin + vec3f(f32(vx), f32(vy), f32(vz)) * voxelRes;
                            let vHit = intersectAABB(ro, invDir, voxMin, voxMin + vec3f(voxelRes));
                            let hitPos = ro + rd * max(vHit.x, 0.0);
                            let result = shadeVoxelHit(hitPos, voxMin, voxelRes, ro, blockResult == 1u);
                            textureStore(outputTexture, vec2i(px, py), result);
                        } else {
                            let effort = f32(totalWork) / 256.0;
                            let color = heatmap(effort);
                            textureStore(outputTexture, vec2i(px, py), vec4f(color, 1.0));
                        }
                        return;
                    }

                    // Advance voxel DDA
                    if (vTMaxX < vTMaxY && vTMaxX < vTMaxZ) {
                        vx += stepX;
                        vTMaxX += vTDeltaX;
                        if (vx < 0 || vx >= leafSz) { break; }
                    } else if (vTMaxY < vTMaxZ) {
                        vy += stepY;
                        vTMaxY += vTDeltaY;
                        if (vy < 0 || vy >= leafSz) { break; }
                    } else {
                        vz += stepZ;
                        vTMaxZ += vTDeltaZ;
                        if (vz < 0 || vz >= leafSz) { break; }
                    }
                }
            }

            // Advance block DDA
            if (tMaxX < tMaxY && tMaxX < tMaxZ) {
                bx += stepX;
                tMaxX += tDeltaX;
            } else if (tMaxY < tMaxZ) {
                by += stepY;
                tMaxY += tDeltaY;
            } else {
                bz += stepZ;
                tMaxZ += tDeltaZ;
            }
        }

        if (bx < 0 || by < 0 || bz < 0 ||
            bx >= numBlocksX || by >= numBlocksY || bz >= numBlocksZ) {
            break;
        }
    }

    if (uniforms.displayMode == 0u) {
        textureStore(outputTexture, vec2i(px, py), vec4f(0.0));
    } else {
        let effort = f32(totalWork) / 256.0;
        let color = heatmap(effort);
        textureStore(outputTexture, vec2i(px, py), vec4f(color, 1.0));
    }
}
`
// ---------------------------------------------------------------------------
// VoxelDebugOverlay class
// ---------------------------------------------------------------------------
class VoxelDebugOverlay {
    app
    camera
    compute
    storageTexture
    overlayMaterial
    nodesBuffer
    leafDataBuffer
    collider
    currentWidth = 0
    currentHeight = 0
    invVP = new Mat4()
    vpTemp = new Mat4()
    /** Whether the overlay is currently rendering. */
    enabled = false
    /** Display mode: 'overlay' for wireframe debug, 'heatmap' for effort visualization. */
    mode = 'overlay'
    constructor(app, collider, camera) {
        this.app = app
        this.camera = camera
        this.collider = collider
        const device = app.graphicsDevice
        // Upload SVO node array as a read-only storage buffer
        const nodesData = collider.nodes
        const nodesByteSize = Math.max(nodesData.byteLength, 4)
        this.nodesBuffer = new StorageBuffer(device, nodesByteSize, BUFFERUSAGE_COPY_DST)
        if (nodesData.byteLength > 0) {
            this.nodesBuffer.write(0, nodesData, 0, nodesData.length)
        }
        // Upload leaf data as a read-only storage buffer
        const leafDataArr = collider.leafData
        const leafByteSize = Math.max(leafDataArr.byteLength, 4)
        this.leafDataBuffer = new StorageBuffer(device, leafByteSize, BUFFERUSAGE_COPY_DST)
        if (leafDataArr.byteLength > 0) {
            this.leafDataBuffer.write(0, leafDataArr, 0, leafDataArr.length)
        }
        // Create the initial storage texture (will be resized on first update)
        this.currentWidth = Math.max(device.width, 1)
        this.currentHeight = Math.max(device.height, 1)
        this.storageTexture = this.createStorageTexture(this.currentWidth, this.currentHeight)
        // Create compute shader
        const shaderDefinition = {
            name: 'VoxelDebugOverlay',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: voxelOverlayWGSL,
            computeUniformBufferFormats: {
                uniforms: new UniformBufferFormat(device, [
                    new UniformFormat('invVP', UNIFORMTYPE_MAT4),
                    new UniformFormat('screenWidth', UNIFORMTYPE_UINT),
                    new UniformFormat('screenHeight', UNIFORMTYPE_UINT),
                    new UniformFormat('gridMinX', UNIFORMTYPE_FLOAT),
                    new UniformFormat('gridMinY', UNIFORMTYPE_FLOAT),
                    new UniformFormat('gridMinZ', UNIFORMTYPE_FLOAT),
                    new UniformFormat('voxelRes', UNIFORMTYPE_FLOAT),
                    new UniformFormat('numVoxelsX', UNIFORMTYPE_UINT),
                    new UniformFormat('numVoxelsY', UNIFORMTYPE_UINT),
                    new UniformFormat('numVoxelsZ', UNIFORMTYPE_UINT),
                    new UniformFormat('leafSize', UNIFORMTYPE_UINT),
                    new UniformFormat('treeDepth', UNIFORMTYPE_UINT),
                    new UniformFormat('projScaleY', UNIFORMTYPE_FLOAT),
                    new UniformFormat('displayMode', UNIFORMTYPE_UINT),
                    new UniformFormat('pad2', UNIFORMTYPE_UINT),
                ]),
            },
            computeBindGroupFormat: new BindGroupFormat(device, [
                new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
                new BindStorageBufferFormat('nodes', SHADERSTAGE_COMPUTE, true),
                new BindStorageBufferFormat('leafData', SHADERSTAGE_COMPUTE, true),
                new BindStorageTextureFormat('outputTexture', PIXELFORMAT_RGBA8, TEXTUREDIMENSION_2D),
            ]),
        }
        const shader = new Shader(device, shaderDefinition)
        // Create compute instance
        this.compute = new Compute(device, shader, 'VoxelDebugOverlay')
        // Create overlay material with premultiplied alpha blending and a custom
        // fragment shader that preserves the texture's alpha channel (the built-in
        // getTextureShaderDesc hardcodes alpha = 1.0, which prevents blending).
        this.overlayMaterial = new ShaderMaterial()
        this.overlayMaterial.cull = CULLFACE_NONE
        this.overlayMaterial.blendType = BLEND_PREMULTIPLIED
        this.overlayMaterial.depthTest = false
        this.overlayMaterial.depthWrite = false
        this.overlayMaterial.setParameter('colorMap', this.storageTexture)
        this.overlayMaterial.shaderDesc = {
            uniqueName: 'VoxelOverlayComposite',
            vertexGLSL: /* glsl */ `
                attribute vec2 vertex_position;
                uniform mat4 matrix_model;
                varying vec2 uv0;
                void main(void) {
                    gl_Position = matrix_model * vec4(vertex_position, 0, 1);
                    uv0 = vertex_position.xy + 0.5;
                }
            `,
            vertexWGSL: /* wgsl */ `
                attribute vertex_position: vec2f;
                uniform matrix_model: mat4x4f;
                varying uv0: vec2f;
                @vertex fn vertexMain(input: VertexInput) -> VertexOutput {
                    var output: VertexOutput;
                    output.position = uniform.matrix_model * vec4f(input.vertex_position, 0.0, 1.0);
                    output.uv0 = input.vertex_position.xy + vec2f(0.5);
                    return output;
                }
            `,
            fragmentGLSL: /* glsl */ `
                varying vec2 uv0;
                uniform sampler2D colorMap;
                void main(void) {
                    gl_FragColor = texture2D(colorMap, uv0);
                }
            `,
            fragmentWGSL: /* wgsl */ `
                varying uv0: vec2f;
                var colorMap: texture_2d<f32>;
                var colorMapSampler: sampler;
                @fragment fn fragmentMain(input: FragmentInput) -> FragmentOutput {
                    var output: FragmentOutput;
                    output.color = textureSample(colorMap, colorMapSampler, input.uv0);
                    return output;
                }
            `,
            attributes: { vertex_position: SEMANTIC_POSITION },
        }
        this.overlayMaterial.update()
    }
    createStorageTexture(width, height) {
        return new Texture(this.app.graphicsDevice, {
            name: 'VoxelOverlay-Storage',
            width,
            height,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
            addressU: 3, // ADDRESS_CLAMP_TO_EDGE
            addressV: 3, // ADDRESS_CLAMP_TO_EDGE
            storage: true,
        })
    }
    update() {
        if (!this.enabled) return
        const { app, camera, compute, collider } = this
        const device = app.graphicsDevice
        const width = device.width
        const height = device.height
        if (width <= 0 || height <= 0) return
        // Resize storage texture if screen dimensions changed
        if (width !== this.currentWidth || height !== this.currentHeight) {
            this.storageTexture.destroy()
            this.currentWidth = width
            this.currentHeight = height
            this.storageTexture = this.createStorageTexture(width, height)
            // Update the overlay material to reference the new texture
            this.overlayMaterial.setParameter('colorMap', this.storageTexture)
            this.overlayMaterial.update()
        }
        // Compute inverse view-projection matrix
        const cam = camera.camera
        this.vpTemp.mul2(cam.projectionMatrix, cam.viewMatrix)
        this.invVP.copy(this.vpTemp).invert()
        // Set compute uniforms
        compute.setParameter('invVP', this.invVP.data)
        compute.setParameter('screenWidth', width)
        compute.setParameter('screenHeight', height)
        compute.setParameter('gridMinX', collider.gridMinX)
        compute.setParameter('gridMinY', collider.gridMinY)
        compute.setParameter('gridMinZ', collider.gridMinZ)
        compute.setParameter('voxelRes', collider.voxelResolution)
        compute.setParameter('numVoxelsX', collider.numVoxelsX)
        compute.setParameter('numVoxelsY', collider.numVoxelsY)
        compute.setParameter('numVoxelsZ', collider.numVoxelsZ)
        compute.setParameter('leafSize', collider.leafSize)
        compute.setParameter('treeDepth', collider.treeDepth)
        compute.setParameter('projScaleY', cam.projectionMatrix.data[5])
        compute.setParameter('displayMode', this.mode === 'heatmap' ? 1 : 0)
        compute.setParameter('pad2', 0)
        // Set storage buffers and output texture
        compute.setParameter('nodes', this.nodesBuffer)
        compute.setParameter('leafData', this.leafDataBuffer)
        compute.setParameter('outputTexture', this.storageTexture)
        // Dispatch compute shader
        const workgroupsX = Math.ceil(width / 8)
        const workgroupsY = Math.ceil(height / 8)
        compute.setupDispatch(workgroupsX, workgroupsY, 1)
        device.computeDispatch([compute], 'VoxelDebugOverlay')
        // Composite overlay on top of the scene
        app.drawTexture(0, 0, 2, 2, null, this.overlayMaterial)
    }
    destroy() {
        this.nodesBuffer?.destroy()
        this.leafDataBuffer?.destroy()
        this.storageTexture?.destroy()
    }
}

const SVGNS = 'http://www.w3.org/2000/svg'
const NUM_SAMPLES = 12
const CIRCLE_OUTER_RADIUS = 0.2
const CIRCLE_INNER_RADIUS = 0.17
const BEZIER_K = 1 / 6
const NORMAL_SMOOTH_FACTOR = 0.25
const tmpV = new Vec3()
const tmpScreen = new Vec3()
const tangent = new Vec3()
const bitangent = new Vec3()
const worldPt = new Vec3()
const up = new Vec3(0, 1, 0)
const right = new Vec3(1, 0, 0)
const buildBezierRing = (sx, sy) => {
    const n = sx.length
    let p = `M${sx[0].toFixed(1)},${sy[0].toFixed(1)}`
    for (let i = 0; i < n; i++) {
        const i0 = (i - 1 + n) % n
        const i1 = i
        const i2 = (i + 1) % n
        const i3 = (i + 2) % n
        const cp1x = sx[i1] + (sx[i2] - sx[i0]) * BEZIER_K
        const cp1y = sy[i1] + (sy[i2] - sy[i0]) * BEZIER_K
        const cp2x = sx[i2] - (sx[i3] - sx[i1]) * BEZIER_K
        const cp2y = sy[i2] - (sy[i3] - sy[i1]) * BEZIER_K
        p += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${sx[i2].toFixed(1)},${sy[i2].toFixed(1)}`
    }
    return `${p} Z`
}
class WalkCursor {
    svg
    cursorPath
    targetPath
    app
    camera
    collider
    canvas
    active = false
    walking = false
    targetPos = null
    targetNormal = null
    smoothNx = 0
    smoothNy = 1
    smoothNz = 0
    hasSmoothedNormal = false
    onPointerMove
    onPointerLeave
    scratchX = new Float64Array(NUM_SAMPLES)
    scratchY = new Float64Array(NUM_SAMPLES)
    outerX = new Float64Array(NUM_SAMPLES)
    outerY = new Float64Array(NUM_SAMPLES)
    innerX = new Float64Array(NUM_SAMPLES)
    innerY = new Float64Array(NUM_SAMPLES)
    constructor(app, camera, collider, events, state) {
        this.app = app
        this.camera = camera
        this.collider = collider
        this.canvas = app.graphicsDevice.canvas
        this.svg = document.createElementNS(SVGNS, 'svg')
        this.svg.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1'
        this.canvas.parentElement.appendChild(this.svg)
        // Hover cursor: thick ring
        this.cursorPath = document.createElementNS(SVGNS, 'path')
        this.cursorPath.setAttribute('fill', 'white')
        this.cursorPath.setAttribute('fill-opacity', '0.6')
        this.cursorPath.setAttribute('fill-rule', 'evenodd')
        this.cursorPath.setAttribute('stroke', 'none')
        this.svg.appendChild(this.cursorPath)
        // Walk target: filled circle
        this.targetPath = document.createElementNS(SVGNS, 'path')
        this.targetPath.setAttribute('fill', 'white')
        this.targetPath.setAttribute('fill-opacity', '0.5')
        this.targetPath.setAttribute('stroke', 'none')
        this.targetPath.style.display = 'none'
        this.svg.appendChild(this.targetPath)
        this.svg.style.display = 'none'
        this.onPointerMove = (e) => {
            if (e.pointerType === 'touch') return
            if (e.buttons) {
                this.cursorPath.style.display = 'none'
                this.hasSmoothedNormal = false
                return
            }
            this.updateCursor(e.offsetX, e.offsetY)
        }
        this.onPointerLeave = () => {
            this.cursorPath.style.display = 'none'
            this.hasSmoothedNormal = false
        }
        this.canvas.addEventListener('pointermove', this.onPointerMove)
        this.canvas.addEventListener('pointerleave', this.onPointerLeave)
        const updateActive = () => {
            this.active = state.cameraMode === 'walk' && !state.gamingControls
            if (!this.active) {
                this.svg.style.display = 'none'
            }
        }
        events.on('gamingControls:changed', updateActive)
        events.on('walkTo', () => {
            this.walking = true
            this.cursorPath.style.display = 'none'
            this.hasSmoothedNormal = false
        })
        events.on('walkCancel', () => {
            this.walking = false
            this.clearTarget()
        })
        events.on('walkComplete', () => {
            this.walking = false
            this.clearTarget()
        })
        events.on('walkTarget:set', (pos, normal) => {
            this.setTarget(pos, normal)
        })
        events.on('walkTarget:clear', () => {
            this.clearTarget()
        })
        app.on('prerender', () => {
            this.updateTarget()
        })
        updateActive()
    }
    setTarget(pos, normal) {
        this.targetPos = pos.clone()
        this.targetNormal = normal.clone()
    }
    clearTarget() {
        this.targetPos = null
        this.targetNormal = null
        this.targetPath.style.display = 'none'
    }
    projectCircle(px, py, pz, nx, ny, nz, radius, outX, outY) {
        const normal = tmpV.set(nx, ny, nz)
        if (Math.abs(normal.y) < 0.99) {
            tangent.cross(normal, up).normalize()
        } else {
            tangent.cross(normal, right).normalize()
        }
        bitangent.cross(normal, tangent)
        const cam = this.camera.camera
        const angleStep = (2 * Math.PI) / NUM_SAMPLES
        for (let i = 0; i < NUM_SAMPLES; i++) {
            const theta = i * angleStep
            const ct = Math.cos(theta)
            const st = Math.sin(theta)
            const tx = ct * tangent.x + st * bitangent.x
            const ty = ct * tangent.y + st * bitangent.y
            const tz = ct * tangent.z + st * bitangent.z
            worldPt.set(px + tx * radius, py + ty * radius, pz + tz * radius)
            cam.worldToScreen(worldPt, tmpScreen)
            outX[i] = tmpScreen.x
            outY[i] = tmpScreen.y
        }
    }
    updateCursor(offsetX, offsetY) {
        if (!this.active || this.walking) {
            this.cursorPath.style.display = 'none'
            this.hasSmoothedNormal = false
            return
        }
        const { camera, collider } = this
        const cameraPos = camera.getPosition()
        camera.camera.screenToWorld(offsetX, offsetY, 1.0, tmpV)
        tmpV.sub(cameraPos).normalize()
        const hit = collider.queryRay(
            -cameraPos.x,
            -cameraPos.y,
            cameraPos.z,
            -tmpV.x,
            -tmpV.y,
            tmpV.z,
            camera.camera.farClip,
        )
        if (!hit) {
            this.cursorPath.style.display = 'none'
            this.hasSmoothedNormal = false
            return
        }
        const px = -hit.x
        const py = -hit.y
        const pz = hit.z
        const rdx = -tmpV.x
        const rdy = -tmpV.y
        const rdz = tmpV.z
        const sn = collider.querySurfaceNormal(hit.x, hit.y, hit.z, rdx, rdy, rdz)
        let nx = -sn.nx
        let ny = -sn.ny
        let nz = sn.nz
        if (this.hasSmoothedNormal) {
            const t = NORMAL_SMOOTH_FACTOR
            nx = this.smoothNx + (nx - this.smoothNx) * t
            ny = this.smoothNy + (ny - this.smoothNy) * t
            nz = this.smoothNz + (nz - this.smoothNz) * t
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
            if (len > 1e-6) {
                const invLen = 1.0 / len
                nx *= invLen
                ny *= invLen
                nz *= invLen
            }
        }
        this.smoothNx = nx
        this.smoothNy = ny
        this.smoothNz = nz
        this.hasSmoothedNormal = true
        this.projectCircle(px, py, pz, nx, ny, nz, CIRCLE_OUTER_RADIUS, this.outerX, this.outerY)
        this.projectCircle(px, py, pz, nx, ny, nz, CIRCLE_INNER_RADIUS, this.innerX, this.innerY)
        this.cursorPath.setAttribute(
            'd',
            `${buildBezierRing(this.outerX, this.outerY)} ${buildBezierRing(this.innerX, this.innerY)}`,
        )
        this.cursorPath.style.display = ''
        this.svg.style.display = ''
    }
    updateTarget() {
        if (!this.active || !this.targetPos || !this.targetNormal) {
            return
        }
        const camPos = this.camera.getPosition()
        const dist = camPos.distance(this.targetPos)
        if (dist < 2.0) {
            this.targetPath.style.display = 'none'
            return
        }
        this.projectCircle(
            this.targetPos.x,
            this.targetPos.y,
            this.targetPos.z,
            this.targetNormal.x,
            this.targetNormal.y,
            this.targetNormal.z,
            CIRCLE_OUTER_RADIUS,
            this.scratchX,
            this.scratchY,
        )
        this.targetPath.setAttribute('d', buildBezierRing(this.scratchX, this.scratchY))
        this.targetPath.style.display = ''
        this.svg.style.display = ''
    }
    destroy() {
        this.canvas.removeEventListener('pointermove', this.onPointerMove)
        this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
        this.svg.remove()
    }
}

const gammaChunkGlsl = `
vec3 prepareOutputFromGamma(vec3 gammaColor) {
    return gammaColor;
}
`
const gammaChunkWgsl = `
fn prepareOutputFromGamma(gammaColor: vec3f) -> vec3f {
    return gammaColor;
}
`
const tonemapTable = {
    none: TONEMAP_NONE,
    linear: TONEMAP_LINEAR,
    filmic: TONEMAP_FILMIC,
    hejl: TONEMAP_HEJL,
    aces: TONEMAP_ACES,
    aces2: TONEMAP_ACES2,
    neutral: TONEMAP_NEUTRAL,
}
const applyPostEffectSettings = (cameraFrame, settings) => {
    if (settings.sharpness.enabled) {
        cameraFrame.rendering.sharpness = settings.sharpness.amount
    } else {
        cameraFrame.rendering.sharpness = 0
    }
    const { bloom } = cameraFrame
    if (settings.bloom.enabled) {
        bloom.intensity = settings.bloom.intensity
        bloom.blurLevel = settings.bloom.blurLevel
    } else {
        bloom.intensity = 0
    }
    const { grading } = cameraFrame
    if (settings.grading.enabled) {
        grading.enabled = true
        grading.brightness = settings.grading.brightness
        grading.contrast = settings.grading.contrast
        grading.saturation = settings.grading.saturation
        grading.tint = new Color().fromArray(settings.grading.tint)
    } else {
        grading.enabled = false
    }
    const { vignette } = cameraFrame
    if (settings.vignette.enabled) {
        vignette.intensity = settings.vignette.intensity
        vignette.inner = settings.vignette.inner
        vignette.outer = settings.vignette.outer
        vignette.curvature = settings.vignette.curvature
    } else {
        vignette.intensity = 0
    }
    const { fringing } = cameraFrame
    if (settings.fringing.enabled) {
        fringing.intensity = settings.fringing.intensity
    } else {
        fringing.intensity = 0
    }
}
const anyPostEffectEnabled = (settings) => {
    return (
        (settings.sharpness.enabled && settings.sharpness.amount > 0) ||
        (settings.bloom.enabled && settings.bloom.intensity > 0) ||
        settings.grading.enabled ||
        (settings.vignette.enabled && settings.vignette.intensity > 0) ||
        (settings.fringing.enabled && settings.fringing.intensity > 0)
    )
}
const vec = new Vec3()
// store the original isColorBufferSrgb so the override in updatePostEffects is idempotent
const origIsColorBufferSrgb = RenderTarget.prototype.isColorBufferSrgb
class Viewer {
    global
    cameraFrame
    inputController
    cameraManager
    annotations
    forceRenderNextFrame = false
    voxelOverlay = null
    walkCursor = null
    origChunks
    constructor(global, gsplatLoad, skyboxLoad, voxelLoad, dom) {
        this.global = global
        const { app, settings, config, events, state, camera } = global
        const { graphicsDevice } = app
        // enable anonymous CORS for image loading in safari
        app.loader.getHandler('texture').imgParser.crossOrigin = 'anonymous'
        // render skybox as plain equirect
        const glsl = ShaderChunks.get(graphicsDevice, 'glsl')
        glsl.set('skyboxPS', glsl.get('skyboxPS').replace('mapRoughnessUv(uv, mipLevel)', 'uv'))
        const wgsl = ShaderChunks.get(graphicsDevice, 'wgsl')
        wgsl.set('skyboxPS', wgsl.get('skyboxPS').replace('mapRoughnessUv(uv, uniform.mipLevel)', 'uv'))
        this.origChunks = {
            glsl: {
                gsplatOutputVS: glsl.get('gsplatOutputVS'),
                skyboxPS: glsl.get('skyboxPS'),
            },
            wgsl: {
                gsplatOutputVS: wgsl.get('gsplatOutputVS'),
                skyboxPS: wgsl.get('skyboxPS'),
            },
        }
        // disable auto render, we'll render only when camera changes
        app.autoRender = false
        // configure the camera
        this.configureCamera(settings)
        // reconfigure camera when entering/exiting XR
        app.xr.on('start', () => this.configureCamera(settings))
        app.xr.on('end', () => this.configureCamera(settings))
        // construct debug ministats
        if (config.ministats) {
            const options = MiniStats.getDefaultOptions()
            options.cpu.enabled = false
            options.stats = options.stats.filter((s) => s.name !== 'DrawCalls')
            options.stats.push(
                {
                    name: 'VRAM',
                    stats: ['vram.tex'],
                    decimalPlaces: 1,
                    multiplier: 1 / (1024 * 1024),
                    unitsName: 'MB',
                    watermark: 1024,
                },
                {
                    name: 'Splats',
                    stats: ['frame.gsplats'],
                    decimalPlaces: 3,
                    multiplier: 1 / 1000000,
                    unitsName: 'M',
                    watermark: 5,
                },
            )
            // eslint-disable-next-line no-new
            new MiniStats(app, options)
        }
        const prevProj = new Mat4()
        const prevWorld = new Mat4()
        const sceneBound = new BoundingBox()
        // track the camera state and trigger a render when it changes
        app.on('framerender', () => {
            const world = camera.getWorldTransform()
            const proj = camera.camera.projectionMatrix
            if (!app.renderNextFrame) {
                if (
                    config.ministats ||
                    !nearlyEquals(world.data, prevWorld.data) ||
                    !nearlyEquals(proj.data, prevProj.data)
                ) {
                    app.renderNextFrame = true
                }
            }
            // suppress rendering till we're ready
            if (!state.readyToRender) {
                app.renderNextFrame = false
            }
            if (this.forceRenderNextFrame) {
                app.renderNextFrame = true
            }
            if (app.renderNextFrame) {
                prevWorld.copy(world)
                prevProj.copy(proj)
            }
        })
        const applyCamera = (camera) => {
            const cameraEntity = global.camera
            cameraEntity.setPosition(camera.position)
            cameraEntity.setEulerAngles(camera.angles)
            cameraEntity.camera.fov = camera.fov
            cameraEntity.camera.horizontalFov = graphicsDevice.width > graphicsDevice.height
            // fit clipping planes to bounding box
            const boundRadius = sceneBound.halfExtents.length()
            // calculate the forward distance between the camera to the bound center
            vec.sub2(sceneBound.center, camera.position)
            const dist = vec.dot(cameraEntity.forward)
            const far = Math.max(dist + boundRadius, 1e-2)
            const near = Math.max(dist - boundRadius, far / (1024 * 16))
            cameraEntity.camera.farClip = far
            cameraEntity.camera.nearClip = near
        }
        // handle application update
        app.on('update', (deltaTime) => {
            // in xr mode we leave the camera alone
            if (app.xr.active) {
                return
            }
            if (this.inputController && this.cameraManager) {
                // update inputs
                this.inputController.update(deltaTime, this.cameraManager.camera.distance)
                // update cameras
                this.cameraManager.update(deltaTime, this.inputController.frame)
                // apply to the camera entity
                applyCamera(this.cameraManager.camera)
            }
        })
        // Render voxel debug overlay
        app.on('prerender', () => {
            this.voxelOverlay?.update()
        })
        // update state on first frame
        events.on('firstFrame', () => {
            state.loaded = true
            state.animationPaused = !!config.noanim
        })
        // wait for the model to load
        Promise.all([gsplatLoad, skyboxLoad, voxelLoad]).then((results) => {
            const gsplat = results[0].gsplat
            const collider = results[2]
            // get scene bounding box
            const gsplatBbox = gsplat.customAabb
            if (gsplatBbox) {
                sceneBound.setFromTransformedAabb(gsplatBbox, results[0].getWorldTransform())
            }
            // if (!config.noui) {
            //     this.annotations = new Annotations(global, this.cameraFrame != null)
            // }
            this.inputController = new InputController(global)
            this.inputController.collider = collider ?? null
            state.hasCollision = !!collider
            // Create voxel debug overlay in WebGPU only
            if (collider && config.webgpu) {
                this.voxelOverlay = new VoxelDebugOverlay(app, collider, camera)
                this.voxelOverlay.mode = config.heatmap ? 'heatmap' : 'overlay'
                state.hasVoxelOverlay = true
                events.on('voxelOverlayEnabled:changed', (value) => {
                    this.voxelOverlay.enabled = value
                    app.renderNextFrame = true
                })
            }
            this.cameraManager = new CameraManager(global, sceneBound, app, camera, collider)
            applyCamera(this.cameraManager.camera)
            if (collider) {
                this.walkCursor = new WalkCursor(app, camera, collider, events, state)
            }
            const { instance } = gsplat
            if (instance) {
                // kick off gsplat sorting immediately now that camera is in position
                instance.sort(camera)
                // listen for sorting updates to trigger first frame events
                instance.sorter?.on('updated', () => {
                    // request frame render when sorting changes
                    app.renderNextFrame = true
                    if (!state.readyToRender) {
                        // we're ready to render once the first sort has completed
                        state.readyToRender = true
                        // wait for the first valid frame to complete rendering
                        app.once('frameend', () => {
                            events.fire('firstFrame')
                            // emit first frame event on window
                            window.firstFrame?.()
                        })
                    }
                })
            } else {
                const { gsplat } = app.scene
                // quality ranges
                const ranges = {
                    mobile: {
                        low: 1,
                        high: 2,
                    },
                    desktop: {
                        low: 2,
                        high: 4,
                    },
                }
                const quality = platform.mobile ? ranges.mobile : ranges.desktop
                // start by streaming in low lod
                const lodLevels = results[0].gsplat.resource?.octree?.lodLevels
                if (lodLevels) {
                    gsplat.lodRangeMax = gsplat.lodRangeMin = lodLevels - 1
                }
                // these two allow LOD behind camera to drop, saves lots of splats
                gsplat.lodUpdateAngle = 90
                gsplat.lodBehindPenalty = 5
                // same performance, but rotating on slow devices does not give us unsorted splats on sides
                gsplat.radialSorting = true
                const eventHandler = app.systems.gsplat
                // idle timer: force continuous rendering until 4s of inactivity
                let idleTime = 0
                this.forceRenderNextFrame = true
                app.on('update', (dt) => {
                    idleTime += dt
                    this.forceRenderNextFrame = idleTime < 4
                })
                events.on('inputEvent', (type) => {
                    if (type !== 'interact') {
                        idleTime = 0
                    }
                })
                eventHandler.on('frame:ready', (_camera, _layer, ready, loading) => {
                    if (loading > 0 || !ready) {
                        idleTime = 0
                    }
                })
                let current = 0
                let watermark = 1
                const readyHandler = (camera, layer, ready, loading) => {
                    if (ready && loading === 0) {
                        // scene is done loading
                        eventHandler.off('frame:ready', readyHandler)
                        state.readyToRender = true
                        // handle quality mode changes
                        const updateLod = () => {
                            const settings = state.retinaDisplay ? quality.high : quality.low
                            results[0].gsplat.splatBudget = settings * 1000000
                            gsplat.lodRangeMin = 0
                            gsplat.lodRangeMax = 1000
                        }
                        events.on('retinaDisplay:changed', updateLod)
                        updateLod()
                        // debug colorize lods
                        gsplat.colorizeLod = config.colorize
                        gsplat.gpuSorting = config.gpusort
                        // wait for the first valid frame to complete rendering
                        app.once('frameend', () => {
                            events.fire('firstFrame')
                            // emit first frame event on window
                            window.firstFrame?.()
                        })
                    }
                    // update loading status
                    if (loading !== current) {
                        watermark = Math.max(watermark, loading)
                        current = watermark - loading
                        state.progress = Math.trunc((current / watermark) * 100)
                    }
                }
                eventHandler.on('frame:ready', readyHandler)
            }
        })
    }
    // configure camera based on application mode and post process settings
    configureCamera(settings) {
        const { global } = this
        const { app, config, camera } = global
        settings.tonemapping = settings.tonemapping || 'none'
        const postEffectSettings = settings.postEffectSettings || {
            sharpness: { enabled: false, amount: 0 },
            bloom: { enabled: false, intensity: 1, blurLevel: 2 },
            grading: { enabled: false, brightness: 0, contrast: 1, saturation: 1, tint: [1, 1, 1] },
            vignette: { enabled: false, intensity: 0.5, inner: 0.3, outer: 0.75, curvature: 1 },
            fringing: { enabled: false, intensity: 0.5 },
        }
        const { background } = settings
        // hpr override takes precedence over settings.highPrecisionRendering
        const highPrecisionRendering = config.hpr ?? settings.highPrecisionRendering
        const enableCameraFrame =
            !app.xr.active && !config.nofx && (anyPostEffectEnabled(postEffectSettings) || highPrecisionRendering)
        if (enableCameraFrame) {
            // create instance
            if (!this.cameraFrame) {
                this.cameraFrame = new CameraFrame(app, camera.camera)
            }
            const { cameraFrame } = this
            cameraFrame.enabled = true
            cameraFrame.rendering.toneMapping = tonemapTable[settings.tonemapping]
            cameraFrame.rendering.renderFormats = highPrecisionRendering
                ? [PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F]
                : []
            applyPostEffectSettings(cameraFrame, postEffectSettings)
            cameraFrame.update()
            // force gsplat shader to write gamma-space colors
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('gsplatOutputVS', gammaChunkGlsl)
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('gsplatOutputVS', gammaChunkWgsl)
            // force skybox shader to write gamma-space colors (inline pow replaces the
            // gammaCorrectOutput call which is a no-op under CameraFrame's GAMMA_NONE)
            ShaderChunks.get(app.graphicsDevice, 'glsl').set(
                'skyboxPS',
                this.origChunks.glsl.skyboxPS.replace(
                    'gammaCorrectOutput(toneMap(processEnvironment(linear)))',
                    'pow(toneMap(processEnvironment(linear)) + 0.0000001, vec3(1.0 / 2.2))',
                ),
            )
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set(
                'skyboxPS',
                this.origChunks.wgsl.skyboxPS.replace(
                    'gammaCorrectOutput(toneMap(processEnvironment(linear)))',
                    'pow(toneMap(processEnvironment(linear)) + 0.0000001, vec3f(1.0 / 2.2))',
                ),
            )
            // ensure the final compose blit doesn't perform linear->gamma conversion.
            RenderTarget.prototype.isColorBufferSrgb = function (index) {
                return this === app.graphicsDevice.backBuffer ? true : origIsColorBufferSrgb.call(this, index)
            }
            camera.camera.clearColor = new Color(background.color)
        } else {
            // no post effects needed, destroy camera frame if it exists
            if (this.cameraFrame) {
                this.cameraFrame.destroy()
                this.cameraFrame = null
            }
            // restore shader chunks to engine defaults
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('gsplatOutputVS', this.origChunks.glsl.gsplatOutputVS)
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('gsplatOutputVS', this.origChunks.wgsl.gsplatOutputVS)
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('skyboxPS', this.origChunks.glsl.skyboxPS)
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('skyboxPS', this.origChunks.wgsl.skyboxPS)
            // restore original isColorBufferSrgb behavior
            RenderTarget.prototype.isColorBufferSrgb = origIsColorBufferSrgb
            if (!app.xr.active) {
                camera.camera.toneMapping = tonemapTable[settings.tonemapping]
                camera.camera.clearColor = new Color(background.color)
            }
        }
    }
}

/**
 * Solid leaf node marker: childMask = 0xFF, baseOffset = 0.
 * Unambiguous because BFS layout guarantees children always come after their parent,
 * so baseOffset = 0 is never valid for an interior node.
 */
const SOLID_LEAF_MARKER = 0xff000000 >>> 0
/** Minimum penetration depth to report a collision (avoids floating-point noise at corners) */
const PENETRATION_EPSILON = 1e-4
/** Half-extent of the flatness sampling patch (5x5 when R=2). */
const FLAT_R = 2
/** 1/sqrt(2), used to normalise 45-degree diagonal normals. */
const INV_SQRT2 = 1 / Math.sqrt(2)
/**
 * Surface normal candidate directions for querySurfaceNormal.
 * Each entry: [dx, dy, dz, t1x, t1y, t1z, t2x, t2y, t2z]
 *   (dx,dy,dz) = canonical normal direction (components 0 or +/-1)
 *   (t1,t2) = orthogonal tangent vectors spanning the perpendicular sampling plane
 */
const SURFACE_CANDIDATES = [
    // Axis-aligned
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    [0, 1, 0, 1, 0, 0, 0, 0, 1],
    [0, 0, 1, 1, 0, 0, 0, 1, 0],
    // XZ diagonals (vertical walls at 45 degrees)
    [1, 0, 1, 0, 1, 0, -1, 0, 1],
    [1, 0, -1, 0, 1, 0, 1, 0, 1],
    // XY diagonals (walls tilted from vertical)
    [1, 1, 0, 0, 0, 1, -1, 1, 0],
    [1, -1, 0, 0, 0, 1, 1, 1, 0],
    // YZ diagonals (sloped floors/ceilings)
    [0, 1, 1, 1, 0, 0, 0, -1, 1],
    [0, 1, -1, 1, 0, 0, 0, 1, 1],
]
/**
 * Score a surface candidate direction by sampling a 5x5 patch at three depth layers
 * shifted along the step direction. Returns the best (maximum) layer score. A "surface
 * hit" at each sample is a solid voxel whose neighbour in the step direction is empty.
 *
 * @param collider - The voxel collider instance.
 * @param ix - Voxel X index of the surface point.
 * @param iy - Voxel Y index of the surface point.
 * @param iz - Voxel Z index of the surface point.
 * @param sx - Step X component (camera-facing direction).
 * @param sy - Step Y component.
 * @param sz - Step Z component.
 * @param t1x - First tangent vector X.
 * @param t1y - First tangent vector Y.
 * @param t1z - First tangent vector Z.
 * @param t2x - Second tangent vector X.
 * @param t2y - Second tangent vector Y.
 * @param t2z - Second tangent vector Z.
 * @returns The best score across the three depth layers.
 */
function scoreSurfaceCandidate(collider, ix, iy, iz, sx, sy, sz, t1x, t1y, t1z, t2x, t2y, t2z) {
    let best = 0
    for (let depth = 1; depth >= -1; depth--) {
        let s = 0
        for (let da = -FLAT_R; da <= FLAT_R; da++) {
            for (let db = -FLAT_R; db <= FLAT_R; db++) {
                const px = ix + da * t1x + db * t2x - sx * depth
                const py = iy + da * t1y + db * t2y - sy * depth
                const pz = iz + da * t1z + db * t2z - sz * depth
                if (collider.isVoxelSolid(px, py, pz) && !collider.isVoxelSolid(px + sx, py + sy, pz + sz)) {
                    s++
                }
            }
        }
        if (s > best) best = s
    }
    return best
}
/**
 * Count the number of set bits in a 32-bit integer.
 *
 * @param n - 32-bit integer.
 * @returns Number of bits set to 1.
 */
function popcount(n) {
    n >>>= 0
    n -= (n >>> 1) & 0x55555555
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
    return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}
/**
 * Runtime sparse voxel octree collider.
 *
 * Loads the two-file format (.voxel.json + .voxel.bin) produced by
 * splat-transform's writeVoxel and provides point and sphere collision queries.
 */
class VoxelCollider {
    /** Grid-aligned bounds (min xyz) */
    _gridMinX
    _gridMinY
    _gridMinZ
    /** Number of voxels along each axis */
    _numVoxelsX
    _numVoxelsY
    _numVoxelsZ
    /** Size of each voxel in world units */
    _voxelResolution
    /** Voxels per leaf dimension (always 4) */
    _leafSize
    /** Maximum tree depth (number of octree levels above the leaf level) */
    _treeDepth
    /** Flat Laine-Karras node array */
    _nodes
    /** Leaf voxel masks: pairs of (lo, hi) Uint32 per mixed leaf */
    _leafData
    /** Pre-allocated scratch push-out vector to avoid per-frame allocations */
    _push = { x: 0, y: 0, z: 0 }
    /** Pre-allocated result for querySurfaceNormal to avoid per-call allocation */
    _normalResult = { nx: 0, ny: 0, nz: 0 }
    /** Pre-allocated constraint normals for iterative corner resolution (max 3 walls) */
    _constraintNormals = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
    ]
    constructor(metadata, nodes, leafData) {
        this._gridMinX = metadata.gridBounds.min[0]
        this._gridMinY = metadata.gridBounds.min[1]
        this._gridMinZ = metadata.gridBounds.min[2]
        const res = metadata.voxelResolution
        this._numVoxelsX = Math.round((metadata.gridBounds.max[0] - metadata.gridBounds.min[0]) / res)
        this._numVoxelsY = Math.round((metadata.gridBounds.max[1] - metadata.gridBounds.min[1]) / res)
        this._numVoxelsZ = Math.round((metadata.gridBounds.max[2] - metadata.gridBounds.min[2]) / res)
        this._voxelResolution = res
        this._leafSize = metadata.leafSize
        this._treeDepth = metadata.treeDepth
        this._nodes = nodes
        this._leafData = leafData
    }
    /**
     * Grid-aligned bounds minimum X in world units.
     *
     * @returns {number} The minimum X coordinate.
     */
    get gridMinX() {
        return this._gridMinX
    }
    /**
     * Grid-aligned bounds minimum Y in world units.
     *
     * @returns {number} The minimum Y coordinate.
     */
    get gridMinY() {
        return this._gridMinY
    }
    /**
     * Grid-aligned bounds minimum Z in world units.
     *
     * @returns {number} The minimum Z coordinate.
     */
    get gridMinZ() {
        return this._gridMinZ
    }
    /**
     * Number of voxels along the X axis.
     *
     * @returns {number} The voxel count on X.
     */
    get numVoxelsX() {
        return this._numVoxelsX
    }
    /**
     * Number of voxels along the Y axis.
     *
     * @returns {number} The voxel count on Y.
     */
    get numVoxelsY() {
        return this._numVoxelsY
    }
    /**
     * Number of voxels along the Z axis.
     *
     * @returns {number} The voxel count on Z.
     */
    get numVoxelsZ() {
        return this._numVoxelsZ
    }
    /**
     * Size of each voxel in world units.
     *
     * @returns {number} The voxel resolution.
     */
    get voxelResolution() {
        return this._voxelResolution
    }
    /**
     * Voxels per leaf dimension (always 4).
     *
     * @returns {number} The leaf size.
     */
    get leafSize() {
        return this._leafSize
    }
    /**
     * Maximum tree depth (number of octree levels above the leaf level).
     *
     * @returns {number} The tree depth.
     */
    get treeDepth() {
        return this._treeDepth
    }
    /**
     * Flat Laine-Karras node array (read-only access for GPU upload).
     *
     * @returns {Uint32Array} The node array.
     */
    get nodes() {
        return this._nodes
    }
    /**
     * Leaf voxel masks: pairs of (lo, hi) Uint32 per mixed leaf (read-only access for GPU upload).
     *
     * @returns {Uint32Array} The leaf data array.
     */
    get leafData() {
        return this._leafData
    }
    /**
     * Load a VoxelCollider from a .voxel.json URL.
     * The corresponding .voxel.bin is inferred by replacing the extension.
     *
     * @param jsonUrl - URL to the .voxel.json metadata file.
     * @returns A promise resolving to a VoxelCollider instance.
     */
    static async load(jsonUrl) {
        // Fetch metadata
        const metaResponse = await fetch(jsonUrl)
        if (!metaResponse.ok) {
            throw new Error(`Failed to fetch voxel metadata: ${metaResponse.statusText}`)
        }
        const metadata = await metaResponse.json()
        // Fetch binary data
        const binUrl = jsonUrl.replace('.voxel.json', '.voxel.bin')
        const binResponse = await fetch(binUrl)
        if (!binResponse.ok) {
            throw new Error(`Failed to fetch voxel binary: ${binResponse.statusText}`)
        }
        const buffer = await binResponse.arrayBuffer()
        const view = new Uint32Array(buffer)
        const nodes = view.slice(0, metadata.nodeCount)
        const leafData = view.slice(metadata.nodeCount, metadata.nodeCount + metadata.leafDataCount)
        return new VoxelCollider(metadata, nodes, leafData)
    }
    /**
     * Query whether a world-space point lies inside a solid voxel.
     *
     * @param x - World X coordinate.
     * @param y - World Y coordinate.
     * @param z - World Z coordinate.
     * @returns True if the point is inside a solid voxel.
     */
    queryPoint(x, y, z) {
        const ix = Math.floor((x - this.gridMinX) / this.voxelResolution)
        const iy = Math.floor((y - this.gridMinY) / this.voxelResolution)
        const iz = Math.floor((z - this.gridMinZ) / this.voxelResolution)
        return this.isVoxelSolid(ix, iy, iz)
    }
    /**
     * Compute a stable surface normal at a world-space position using flatness-probability
     * sampling. Tests 9 candidate directions: 3 axis-aligned and 6 diagonal (45-degree in
     * each pair of axes). For each camera-facing candidate a 5x5 patch of voxels in the
     * perpendicular plane is sampled: a voxel counts as a "surface hit" if it is solid and
     * the adjacent voxel toward the camera is empty. The candidate with the highest hit
     * count is the surface orientation.
     *
     * @param x - World X coordinate of the surface point.
     * @param y - World Y coordinate of the surface point.
     * @param z - World Z coordinate of the surface point.
     * @param rdx - Ray direction X (toward the surface, in voxel space).
     * @param rdy - Ray direction Y.
     * @param rdz - Ray direction Z.
     * @returns Object with nx, ny, nz components of the surface normal.
     */
    querySurfaceNormal(x, y, z, rdx, rdy, rdz) {
        // Nudge the query point slightly along the ray direction so that a hit point
        // sitting exactly on a voxel face boundary resolves to the solid voxel rather
        // than the adjacent empty one. Uses Math.sign so the nudge is independent of
        // ray vector magnitude.
        const nudge = this._voxelResolution * 0.25
        const ix = Math.floor((x + Math.sign(rdx) * nudge - this._gridMinX) / this._voxelResolution)
        const iy = Math.floor((y + Math.sign(rdy) * nudge - this._gridMinY) / this._voxelResolution)
        const iz = Math.floor((z + Math.sign(rdz) * nudge - this._gridMinZ) / this._voxelResolution)
        const result = this._normalResult
        let bestScore = -1
        let bestNx = 0
        let bestNy = 1
        let bestNz = 0
        for (let c = 0; c < SURFACE_CANDIDATES.length; c++) {
            const cand = SURFACE_CANDIDATES[c]
            const dx = cand[0]
            const dy = cand[1]
            const dz = cand[2]
            const dot = rdx * dx + rdy * dy + rdz * dz
            if (Math.abs(dot) < 1e-6) continue
            const sign = dot < 0 ? 1 : -1
            const sx = dx * sign
            const sy = dy * sign
            const sz = dz * sign
            const score = scoreSurfaceCandidate(
                this,
                ix,
                iy,
                iz,
                sx,
                sy,
                sz,
                cand[3],
                cand[4],
                cand[5],
                cand[6],
                cand[7],
                cand[8],
            )
            if (score > bestScore) {
                bestScore = score
                const mag = Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1 ? INV_SQRT2 : 1
                bestNx = sx * mag
                bestNy = sy * mag
                bestNz = sz * mag
            }
        }
        result.nx = bestNx
        result.ny = bestNy
        result.nz = bestNz
        return result
    }
    /**
     * Cast a ray through the voxel grid using 3D-DDA and return the entry point on the first
     * solid voxel hit. Coordinates are in voxel world space (the same frame used by queryPoint).
     *
     * @param ox - Ray origin X.
     * @param oy - Ray origin Y.
     * @param oz - Ray origin Z.
     * @param dx - Ray direction X (must be normalized).
     * @param dy - Ray direction Y (must be normalized).
     * @param dz - Ray direction Z (must be normalized).
     * @param maxDist - Maximum ray distance.
     * @returns The entry point on the first solid voxel, or null if no hit.
     */
    queryRay(ox, oy, oz, dx, dy, dz, maxDist) {
        if (this._nodes.length === 0) {
            return null
        }
        const res = this._voxelResolution
        const gMinX = this._gridMinX
        const gMinY = this._gridMinY
        const gMinZ = this._gridMinZ
        const gMaxX = gMinX + this._numVoxelsX * res
        const gMaxY = gMinY + this._numVoxelsY * res
        const gMaxZ = gMinZ + this._numVoxelsZ * res
        const EPS = 1e-12
        // Ray-AABB slab intersection to find the range [tNear, tFar]
        let tNear = 0
        let tFar = maxDist
        if (Math.abs(dx) > EPS) {
            let t1 = (gMinX - ox) / dx
            let t2 = (gMaxX - ox) / dx
            if (t1 > t2) {
                const tmp = t1
                t1 = t2
                t2 = tmp
            }
            if (t1 > tNear) {
                tNear = t1
            }
            tFar = Math.min(tFar, t2)
            if (tNear > tFar) return null
        } else if (ox < gMinX || ox >= gMaxX) {
            return null
        }
        if (Math.abs(dy) > EPS) {
            let t1 = (gMinY - oy) / dy
            let t2 = (gMaxY - oy) / dy
            if (t1 > t2) {
                const tmp = t1
                t1 = t2
                t2 = tmp
            }
            if (t1 > tNear) {
                tNear = t1
            }
            tFar = Math.min(tFar, t2)
            if (tNear > tFar) return null
        } else if (oy < gMinY || oy >= gMaxY) {
            return null
        }
        if (Math.abs(dz) > EPS) {
            let t1 = (gMinZ - oz) / dz
            let t2 = (gMaxZ - oz) / dz
            if (t1 > t2) {
                const tmp = t1
                t1 = t2
                t2 = tmp
            }
            if (t1 > tNear) {
                tNear = t1
            }
            tFar = Math.min(tFar, t2)
            if (tNear > tFar) return null
        } else if (oz < gMinZ || oz >= gMaxZ) {
            return null
        }
        // Entry point on the grid AABB (or origin if already inside)
        const entryX = ox + dx * tNear
        const entryY = oy + dy * tNear
        const entryZ = oz + dz * tNear
        // Convert to voxel indices, clamping to valid range for boundary cases
        let ix = Math.max(0, Math.min(Math.floor((entryX - gMinX) / res), this._numVoxelsX - 1))
        let iy = Math.max(0, Math.min(Math.floor((entryY - gMinY) / res), this._numVoxelsY - 1))
        let iz = Math.max(0, Math.min(Math.floor((entryZ - gMinZ) / res), this._numVoxelsZ - 1))
        // DDA setup
        const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0
        const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0
        const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0
        const invDx = Math.abs(dx) > EPS ? 1.0 / dx : 0
        const invDy = Math.abs(dy) > EPS ? 1.0 / dy : 0
        const invDz = Math.abs(dz) > EPS ? 1.0 / dz : 0
        let tMaxX = Math.abs(dx) > EPS ? (gMinX + (ix + (dx > 0 ? 1 : 0)) * res - ox) * invDx : Infinity
        let tMaxY = Math.abs(dy) > EPS ? (gMinY + (iy + (dy > 0 ? 1 : 0)) * res - oy) * invDy : Infinity
        let tMaxZ = Math.abs(dz) > EPS ? (gMinZ + (iz + (dz > 0 ? 1 : 0)) * res - oz) * invDz : Infinity
        const tDeltaX = Math.abs(dx) > EPS ? res * Math.abs(invDx) : Infinity
        const tDeltaY = Math.abs(dy) > EPS ? res * Math.abs(invDy) : Infinity
        const tDeltaZ = Math.abs(dz) > EPS ? res * Math.abs(invDz) : Infinity
        let currentT = tNear
        const maxSteps = this._numVoxelsX + this._numVoxelsY + this._numVoxelsZ
        for (let step = 0; step < maxSteps; step++) {
            if (this.isVoxelSolid(ix, iy, iz)) {
                return {
                    x: ox + dx * currentT,
                    y: oy + dy * currentT,
                    z: oz + dz * currentT,
                }
            }
            // Advance along the axis with the smallest tMax
            if (tMaxX < tMaxY) {
                if (tMaxX < tMaxZ) {
                    currentT = tMaxX
                    ix += stepX
                    tMaxX += tDeltaX
                } else {
                    currentT = tMaxZ
                    iz += stepZ
                    tMaxZ += tDeltaZ
                }
            } else if (tMaxY < tMaxZ) {
                currentT = tMaxY
                iy += stepY
                tMaxY += tDeltaY
            } else {
                currentT = tMaxZ
                iz += stepZ
                tMaxZ += tDeltaZ
            }
            if (
                ix < 0 ||
                iy < 0 ||
                iz < 0 ||
                ix >= this._numVoxelsX ||
                iy >= this._numVoxelsY ||
                iz >= this._numVoxelsZ ||
                currentT > maxDist
            ) {
                return null
            }
        }
        return null
    }
    /**
     * Query a sphere against the voxel grid and write a push-out vector to resolve penetration.
     * Uses iterative single-voxel resolution: each iteration finds the deepest penetrating voxel,
     * resolves it, then re-checks. This avoids over-push from summing multiple voxels and
     * naturally handles corners (2 iterations) and flat walls (1 iteration).
     *
     * @param cx - Sphere center X in world units.
     * @param cy - Sphere center Y in world units.
     * @param cz - Sphere center Z in world units.
     * @param radius - Sphere radius in world units.
     * @param out - Object to receive the push-out vector.
     * @returns True if a collision was detected and out was written.
     */
    querySphere(cx, cy, cz, radius, out) {
        if (this.nodes.length === 0) {
            return false
        }
        const maxIterations = 4
        let resolvedX = cx
        let resolvedY = cy
        let resolvedZ = cz
        let totalPushX = 0
        let totalPushY = 0
        let totalPushZ = 0
        let hadCollision = false
        const push = this._push
        // Constraint normals from previous iterations - prevents oscillation at corners
        // by ensuring subsequent pushes don't undo previous ones
        const normals = this._constraintNormals
        let numNormals = 0
        for (let iter = 0; iter < maxIterations; iter++) {
            if (!this.resolveDeepestPenetration(resolvedX, resolvedY, resolvedZ, radius)) {
                break
            }
            hadCollision = true
            let px = push.x
            let py = push.y
            let pz = push.z
            // Project out components that contradict previous constraint normals
            for (let i = 0; i < numNormals; i++) {
                const n = normals[i]
                const dot = px * n.x + py * n.y + pz * n.z
                if (dot < 0) {
                    px -= dot * n.x
                    py -= dot * n.y
                    pz -= dot * n.z
                }
            }
            // Record this push direction as a constraint normal
            const len = Math.sqrt(push.x * push.x + push.y * push.y + push.z * push.z)
            if (len > PENETRATION_EPSILON && numNormals < 3) {
                const invLen = 1.0 / len
                const n = normals[numNormals]
                n.x = push.x * invLen
                n.y = push.y * invLen
                n.z = push.z * invLen
                numNormals++
            }
            resolvedX += px
            resolvedY += py
            resolvedZ += pz
            totalPushX += px
            totalPushY += py
            totalPushZ += pz
        }
        // Only report collision if the total push is meaningful
        const totalPushSq = totalPushX * totalPushX + totalPushY * totalPushY + totalPushZ * totalPushZ
        const hasSignificantPush = hadCollision && totalPushSq > PENETRATION_EPSILON * PENETRATION_EPSILON
        if (hasSignificantPush) {
            out.x = totalPushX
            out.y = totalPushY
            out.z = totalPushZ
        }
        return hasSignificantPush
    }
    /**
     * Query a vertical capsule against the voxel grid and write a push-out vector to resolve
     * penetration. The capsule is a line segment from (cx, cy - halfHeight, cz) to
     * (cx, cy + halfHeight, cz) swept by radius. Uses the same iterative deepest-penetration
     * approach as querySphere.
     *
     * @param cx - Capsule center X in world units.
     * @param cy - Capsule center Y in world units.
     * @param cz - Capsule center Z in world units.
     * @param halfHeight - Half-height of the capsule's inner line segment in world units.
     * @param radius - Capsule radius in world units.
     * @param out - Object to receive the push-out vector.
     * @returns True if a collision was detected and out was written.
     */
    queryCapsule(cx, cy, cz, halfHeight, radius, out) {
        if (this.nodes.length === 0) {
            return false
        }
        const maxIterations = 4
        let resolvedX = cx
        let resolvedY = cy
        let resolvedZ = cz
        let totalPushX = 0
        let totalPushY = 0
        let totalPushZ = 0
        let hadCollision = false
        const push = this._push
        // Constraint normals from previous iterations - prevents oscillation at corners
        // by ensuring subsequent pushes don't undo previous ones
        const normals = this._constraintNormals
        let numNormals = 0
        for (let iter = 0; iter < maxIterations; iter++) {
            if (!this.resolveDeepestPenetrationCapsule(resolvedX, resolvedY, resolvedZ, halfHeight, radius)) {
                break
            }
            hadCollision = true
            let px = push.x
            let py = push.y
            let pz = push.z
            // Project out components that contradict previous constraint normals
            for (let i = 0; i < numNormals; i++) {
                const n = normals[i]
                const dot = px * n.x + py * n.y + pz * n.z
                if (dot < 0) {
                    px -= dot * n.x
                    py -= dot * n.y
                    pz -= dot * n.z
                }
            }
            // Record this push direction as a constraint normal
            const len = Math.sqrt(push.x * push.x + push.y * push.y + push.z * push.z)
            if (len > PENETRATION_EPSILON && numNormals < 3) {
                const invLen = 1.0 / len
                const n = normals[numNormals]
                n.x = push.x * invLen
                n.y = push.y * invLen
                n.z = push.z * invLen
                numNormals++
            }
            resolvedX += px
            resolvedY += py
            resolvedZ += pz
            totalPushX += px
            totalPushY += py
            totalPushZ += pz
        }
        // Only report collision if the total push is meaningful
        const totalPushSq = totalPushX * totalPushX + totalPushY * totalPushY + totalPushZ * totalPushZ
        const hasSignificantPush = hadCollision && totalPushSq > PENETRATION_EPSILON * PENETRATION_EPSILON
        if (hasSignificantPush) {
            out.x = totalPushX
            out.y = totalPushY
            out.z = totalPushZ
        }
        return hasSignificantPush
    }
    /**
     * Find the single deepest penetrating voxel for the given sphere.
     * Writes the push-out vector into this._push.
     *
     * @param cx - Sphere center X.
     * @param cy - Sphere center Y.
     * @param cz - Sphere center Z.
     * @param radius - Sphere radius.
     * @returns True if a penetrating voxel was found.
     */
    resolveDeepestPenetration(cx, cy, cz, radius) {
        const { voxelResolution, gridMinX, gridMinY, gridMinZ } = this
        const radiusSq = radius * radius
        // Compute bounding box of the sphere in voxel indices
        const ixMin = Math.floor((cx - radius - gridMinX) / voxelResolution)
        const iyMin = Math.floor((cy - radius - gridMinY) / voxelResolution)
        const izMin = Math.floor((cz - radius - gridMinZ) / voxelResolution)
        const ixMax = Math.floor((cx + radius - gridMinX) / voxelResolution)
        const iyMax = Math.floor((cy + radius - gridMinY) / voxelResolution)
        const izMax = Math.floor((cz + radius - gridMinZ) / voxelResolution)
        let bestPushX = 0
        let bestPushY = 0
        let bestPushZ = 0
        let bestPenetration = PENETRATION_EPSILON
        let found = false
        for (let iz = izMin; iz <= izMax; iz++) {
            for (let iy = iyMin; iy <= iyMax; iy++) {
                for (let ix = ixMin; ix <= ixMax; ix++) {
                    if (!this.isVoxelSolid(ix, iy, iz)) {
                        continue
                    }
                    // Compute the world-space AABB of this voxel
                    const vMinX = gridMinX + ix * voxelResolution
                    const vMinY = gridMinY + iy * voxelResolution
                    const vMinZ = gridMinZ + iz * voxelResolution
                    const vMaxX = vMinX + voxelResolution
                    const vMaxY = vMinY + voxelResolution
                    const vMaxZ = vMinZ + voxelResolution
                    // Find the nearest point on the voxel AABB to the sphere center
                    const nearX = Math.max(vMinX, Math.min(cx, vMaxX))
                    const nearY = Math.max(vMinY, Math.min(cy, vMaxY))
                    const nearZ = Math.max(vMinZ, Math.min(cz, vMaxZ))
                    // Vector from nearest point to sphere center
                    const dx = cx - nearX
                    const dy = cy - nearY
                    const dz = cz - nearZ
                    const distSq = dx * dx + dy * dy + dz * dz
                    if (distSq >= radiusSq) {
                        continue
                    }
                    let px
                    let py
                    let pz
                    let penetration
                    if (distSq > 1e-12) {
                        // Center is outside the voxel: push radially outward
                        const dist = Math.sqrt(distSq)
                        penetration = radius - dist
                        const invDist = 1.0 / dist
                        px = dx * invDist * penetration
                        py = dy * invDist * penetration
                        pz = dz * invDist * penetration
                    } else {
                        // Center is inside the voxel: push to nearest face + radius
                        // so the sphere surface ends up flush with the face
                        const distNegX = cx - vMinX
                        const distPosX = vMaxX - cx
                        const distNegY = cy - vMinY
                        const distPosY = vMaxY - cy
                        const distNegZ = cz - vMinZ
                        const distPosZ = vMaxZ - cz
                        const escapeX = distNegX < distPosX ? -(distNegX + radius) : distPosX + radius
                        const escapeY = distNegY < distPosY ? -(distNegY + radius) : distPosY + radius
                        const escapeZ = distNegZ < distPosZ ? -(distNegZ + radius) : distPosZ + radius
                        const absX = Math.abs(escapeX)
                        const absY = Math.abs(escapeY)
                        const absZ = Math.abs(escapeZ)
                        px = 0
                        py = 0
                        pz = 0
                        if (absX <= absY && absX <= absZ) {
                            px = escapeX
                            penetration = absX
                        } else if (absY <= absZ) {
                            py = escapeY
                            penetration = absY
                        } else {
                            pz = escapeZ
                            penetration = absZ
                        }
                    }
                    if (penetration > bestPenetration) {
                        bestPenetration = penetration
                        bestPushX = px
                        bestPushY = py
                        bestPushZ = pz
                        found = true
                    }
                }
            }
        }
        if (found) {
            this._push.x = bestPushX
            this._push.y = bestPushY
            this._push.z = bestPushZ
        }
        return found
    }
    /**
     * Find the single deepest penetrating voxel for the given vertical capsule.
     * The capsule is a line segment from (cx, cy - halfHeight, cz) to (cx, cy + halfHeight, cz)
     * swept by radius. For each voxel, the closest point on the segment to the AABB is found,
     * then a sphere-AABB penetration test is performed from that point.
     * Writes the push-out vector into this._push.
     *
     * @param cx - Capsule center X.
     * @param cy - Capsule center Y.
     * @param cz - Capsule center Z.
     * @param halfHeight - Half-height of the capsule's inner line segment.
     * @param radius - Capsule radius.
     * @returns True if a penetrating voxel was found.
     */
    resolveDeepestPenetrationCapsule(cx, cy, cz, halfHeight, radius) {
        const { voxelResolution, gridMinX, gridMinY, gridMinZ } = this
        const radiusSq = radius * radius
        const segBottomY = cy - halfHeight
        const segTopY = cy + halfHeight
        // Compute bounding box of the capsule in voxel indices
        const ixMin = Math.floor((cx - radius - gridMinX) / voxelResolution)
        const iyMin = Math.floor((segBottomY - radius - gridMinY) / voxelResolution)
        const izMin = Math.floor((cz - radius - gridMinZ) / voxelResolution)
        const ixMax = Math.floor((cx + radius - gridMinX) / voxelResolution)
        const iyMax = Math.floor((segTopY + radius - gridMinY) / voxelResolution)
        const izMax = Math.floor((cz + radius - gridMinZ) / voxelResolution)
        let bestPushX = 0
        let bestPushY = 0
        let bestPushZ = 0
        let bestPenetration = PENETRATION_EPSILON
        let found = false
        for (let iz = izMin; iz <= izMax; iz++) {
            for (let iy = iyMin; iy <= iyMax; iy++) {
                for (let ix = ixMin; ix <= ixMax; ix++) {
                    if (!this.isVoxelSolid(ix, iy, iz)) {
                        continue
                    }
                    // Compute the world-space AABB of this voxel
                    const vMinX = gridMinX + ix * voxelResolution
                    const vMinY = gridMinY + iy * voxelResolution
                    const vMinZ = gridMinZ + iz * voxelResolution
                    const vMaxX = vMinX + voxelResolution
                    const vMaxY = vMinY + voxelResolution
                    const vMaxZ = vMinZ + voxelResolution
                    // Find the closest Y on the capsule segment to this AABB.
                    // For a vertical segment, X and Z are fixed so we only optimize Y.
                    let segY
                    if (segTopY < vMinY) {
                        // segment entirely below AABB
                        segY = segTopY
                    } else if (segBottomY > vMaxY) {
                        // segment entirely above AABB
                        segY = segBottomY
                    } else {
                        // ranges overlap - pick segment Y closest to AABB center
                        const aabbCenterY = (vMinY + vMaxY) * 0.5
                        segY = Math.max(segBottomY, Math.min(segTopY, aabbCenterY))
                    }
                    // Now do sphere-AABB penetration from (cx, segY, cz)
                    const nearX = Math.max(vMinX, Math.min(cx, vMaxX))
                    const nearY = Math.max(vMinY, Math.min(segY, vMaxY))
                    const nearZ = Math.max(vMinZ, Math.min(cz, vMaxZ))
                    // Vector from nearest point to sphere center on segment
                    const dx = cx - nearX
                    const dy = segY - nearY
                    const dz = cz - nearZ
                    const distSq = dx * dx + dy * dy + dz * dz
                    if (distSq >= radiusSq) {
                        continue
                    }
                    let px
                    let py
                    let pz
                    let penetration
                    if (distSq > 1e-12) {
                        // Sphere center is outside the voxel: push radially outward
                        const dist = Math.sqrt(distSq)
                        penetration = radius - dist
                        const invDist = 1.0 / dist
                        px = dx * invDist * penetration
                        py = dy * invDist * penetration
                        pz = dz * invDist * penetration
                    } else {
                        // Segment point is inside the voxel: push to nearest face + radius
                        // so the capsule surface ends up flush with the face
                        const distNegX = cx - vMinX
                        const distPosX = vMaxX - cx
                        const distNegY = segY - vMinY
                        const distPosY = vMaxY - segY
                        const distNegZ = cz - vMinZ
                        const distPosZ = vMaxZ - cz
                        const escapeX = distNegX < distPosX ? -(distNegX + radius) : distPosX + radius
                        const escapeY = distNegY <= distPosY ? -(distNegY + radius) : distPosY + radius
                        const escapeZ = distNegZ < distPosZ ? -(distNegZ + radius) : distPosZ + radius
                        const absX = Math.abs(escapeX)
                        const absY = Math.abs(escapeY)
                        const absZ = Math.abs(escapeZ)
                        px = 0
                        py = 0
                        pz = 0
                        if (absY <= absX && absY <= absZ) {
                            py = escapeY
                            penetration = absY
                        } else if (absX <= absZ) {
                            px = escapeX
                            penetration = absX
                        } else {
                            pz = escapeZ
                            penetration = absZ
                        }
                    }
                    if (penetration > bestPenetration) {
                        bestPenetration = penetration
                        bestPushX = px
                        bestPushY = py
                        bestPushZ = pz
                        found = true
                    }
                }
            }
        }
        // Column-based Y fallback: the per-voxel sphere test loses Y information
        // when the capsule segment passes through a voxel (segY lands inside the
        // AABB, zeroing dy). Recover it by finding the topmost solid voxel in the
        // capsule-center column and computing a direct capsule-bottom push.
        if (found && Math.abs(bestPushY) <= PENETRATION_EPSILON) {
            const icx = Math.floor((cx - gridMinX) / voxelResolution)
            const icz = Math.floor((cz - gridMinZ) / voxelResolution)
            const capsuleBottom = segTopY + radius
            for (let iy = iyMin; iy <= iyMax; iy++) {
                if (this.isVoxelSolid(icx, iy, icz)) {
                    const surfaceY = gridMinY + iy * voxelResolution
                    if (capsuleBottom > surfaceY + PENETRATION_EPSILON) {
                        bestPushY = surfaceY - capsuleBottom
                    }
                    break
                }
            }
        }
        if (found) {
            this._push.x = bestPushX
            this._push.y = bestPushY
            this._push.z = bestPushZ
        }
        return found
    }
    /**
     * Test whether a voxel at the given grid indices is solid.
     *
     * @param ix - Global voxel X index.
     * @param iy - Global voxel Y index.
     * @param iz - Global voxel Z index.
     * @returns True if the voxel is solid.
     */
    isVoxelSolid(ix, iy, iz) {
        if (
            this.nodes.length === 0 ||
            ix < 0 ||
            iy < 0 ||
            iz < 0 ||
            ix >= this.numVoxelsX ||
            iy >= this.numVoxelsY ||
            iz >= this.numVoxelsZ
        ) {
            return false
        }
        const { leafSize, treeDepth } = this
        // Convert voxel indices to block coordinates
        const blockX = Math.floor(ix / leafSize)
        const blockY = Math.floor(iy / leafSize)
        const blockZ = Math.floor(iz / leafSize)
        // Traverse octree from root to leaf
        let nodeIndex = 0
        for (let level = treeDepth - 1; level >= 0; level--) {
            const node = this.nodes[nodeIndex] >>> 0
            // Check for solid leaf sentinel first (has nonzero high byte)
            if (node === SOLID_LEAF_MARKER) {
                return true
            }
            const childMask = (node >>> 24) & 0xff
            // If childMask is 0, this is a mixed leaf node
            if (childMask === 0) {
                return this.checkLeafByIndex(node, ix, iy, iz)
            }
            // Determine which octant the block falls into at this level
            const bitX = (blockX >>> level) & 1
            const bitY = (blockY >>> level) & 1
            const bitZ = (blockZ >>> level) & 1
            const octant = (bitZ << 2) | (bitY << 1) | bitX
            // Check if this octant has a child
            if ((childMask & (1 << octant)) === 0) {
                return false
            }
            // Calculate child offset using popcount of lower bits
            const baseOffset = node & 0x00ffffff
            const prefix = (1 << octant) - 1
            const childOffset = popcount(childMask & prefix)
            nodeIndex = baseOffset + childOffset
        }
        // We've reached the leaf level
        const node = this.nodes[nodeIndex] >>> 0
        if (node === SOLID_LEAF_MARKER) {
            return true
        }
        return this.checkLeafByIndex(node, ix, iy, iz)
    }
    /**
     * Check a mixed leaf node using voxel grid indices.
     * The solid leaf sentinel must be checked before calling this method.
     *
     * @param node - The mixed leaf node value (lower 24 bits = leafData index).
     * @param ix - Global voxel X index.
     * @param iy - Global voxel Y index.
     * @param iz - Global voxel Z index.
     * @returns True if the voxel is solid.
     */
    checkLeafByIndex(node, ix, iy, iz) {
        const leafDataIndex = node & 0x00ffffff
        // Compute voxel coordinates within the 4x4x4 block
        const vx = ix & 3
        const vy = iy & 3
        const vz = iz & 3
        // Bit index within the 64-bit mask: z * 16 + y * 4 + x
        const bitIndex = vz * 16 + vy * 4 + vx
        // Read the appropriate 32-bit word (lo or hi)
        if (bitIndex < 32) {
            const lo = this.leafData[leafDataIndex * 2] >>> 0
            return ((lo >>> bitIndex) & 1) === 1
        }
        const hi = this.leafData[leafDataIndex * 2 + 1] >>> 0
        return ((hi >>> (bitIndex - 32)) & 1) === 1
    }
}

/** @import { XrInputSource } from 'playcanvas' */

/**
 * Automatically loads and displays WebXR controller models (hands or gamepads) based on the
 * WebXR Input Profiles specification. The script fetches controller models from the WebXR
 * Input Profiles asset repository and updates their transforms each frame to match the
 * tracked input sources.
 *
 * Features:
 * - Automatic controller model loading from WebXR Input Profiles repository
 * - Support for both hand tracking and gamepad controllers
 * - Automatic cleanup on input source removal or XR session end
 * - Visibility control for integration with other XR scripts
 * - Fires events for controller lifecycle coordination
 *
 * This script should be attached to a parent entity (typically the same entity as XrSession).
 * Use it in conjunction with the `XrNavigation` and `XrMenu` scripts.
 *
 * @example
 * // Add to camera parent entity
 * cameraParent.addComponent('script');
 * cameraParent.script.create(XrControllers, {
 *     properties: {
 *         basePath: 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets/dist/profiles'
 *     }
 * });
 */
class XrControllers extends Script {
    static scriptName = 'xrControllers'

    /**
     * The base URL for fetching the WebXR input profiles.
     *
     * @attribute
     * @type {string}
     */
    basePath = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets/dist/profiles'

    /**
     * Map of input sources to their controller data (entity, joint mappings, and asset).
     *
     * @type {Map<XrInputSource, { entity: import('playcanvas').Entity, jointMap: Map, asset: import('playcanvas').Asset }>}
     */
    controllers = new Map()

    /**
     * Set of input sources currently being loaded (to handle race conditions).
     *
     * @type {Set<XrInputSource>}
     * @private
     */
    _pendingInputSources = new Set()

    /**
     * Whether controller models are currently visible.
     *
     * @type {boolean}
     * @private
     */
    _visible = true

    /**
     * Bound event handlers for proper cleanup.
     *
     * @type {{ onAdd: (inputSource: XrInputSource) => void, onRemove: (inputSource: XrInputSource) => void, onXrEnd: () => void } | null}
     * @private
     */
    _handlers = null

    initialize() {
        if (!this.app.xr) {
            console.error('XrControllers script requires XR to be enabled on the application')
            return
        }

        // Create bound handlers for proper cleanup
        this._handlers = {
            onAdd: this._onInputSourceAdd.bind(this),
            onRemove: this._onInputSourceRemove.bind(this),
            onXrEnd: this._onXrEnd.bind(this),
        }

        // Listen for input source changes
        this.app.xr.input.on('add', this._handlers.onAdd)
        this.app.xr.input.on('remove', this._handlers.onRemove)

        // Listen for XR session end to clean up all controllers
        this.app.xr.on('end', this._handlers.onXrEnd)

        // Clean up on script destroy
        this.once('destroy', () => {
            this._onDestroy()
        })
    }

    /**
     * Cleans up all resources when the script is destroyed.
     *
     * @private
     */
    _onDestroy() {
        if (this._handlers && this.app.xr) {
            this.app.xr.input.off('add', this._handlers.onAdd)
            this.app.xr.input.off('remove', this._handlers.onRemove)
            this.app.xr.off('end', this._handlers.onXrEnd)
        }

        // Destroy all controller entities
        this._destroyAllControllers()

        this._handlers = null
        this._pendingInputSources.clear()
    }

    /**
     * Handles XR session end by cleaning up all controllers.
     *
     * @private
     */
    _onXrEnd() {
        this._destroyAllControllers()
        this._pendingInputSources.clear()
    }

    /**
     * Destroys a single controller and its associated resources.
     *
     * @param {XrInputSource} inputSource - The input source to destroy.
     * @private
     */
    _destroyController(inputSource) {
        const controller = this.controllers.get(inputSource)
        if (!controller) return

        controller.entity.destroy()

        if (controller.asset) {
            this.app.assets.remove(controller.asset)
            controller.asset.unload()
        }

        this.controllers.delete(inputSource)
        this.app.fire('xr:controller:remove', inputSource)
    }

    /**
     * Destroys all controller entities and clears the map.
     *
     * @private
     */
    _destroyAllControllers() {
        for (const inputSource of this.controllers.keys()) {
            this._destroyController(inputSource)
        }
    }

    /**
     * Tries to load profiles sequentially, returning the first successful result.
     *
     * @param {XrInputSource} inputSource - The input source.
     * @param {string[]} profiles - Array of profile IDs to try.
     * @param {number} [index=0] - Current index in the profiles array.
     * @returns {Promise<{ profileId: string, asset: import('playcanvas').Asset } | null>} The result or null.
     * @private
     */
    async _tryLoadProfiles(inputSource, profiles, index = 0) {
        if (index >= profiles.length) return null
        if (!this._pendingInputSources.has(inputSource)) return null

        const result = await this._loadProfile(inputSource, profiles[index])
        if (result) return result

        return this._tryLoadProfiles(inputSource, profiles, index + 1)
    }

    /**
     * Called when an input source is added.
     *
     * @param {XrInputSource} inputSource - The input source that was added.
     * @private
     */
    async _onInputSourceAdd(inputSource) {
        if (!inputSource.profiles?.length) {
            console.warn('XrControllers: No profiles available for input source')
            return
        }

        // Track this input source as pending to handle race conditions
        this._pendingInputSources.add(inputSource)

        // Load profiles sequentially and stop on first success
        const successfulResult = await this._tryLoadProfiles(inputSource, inputSource.profiles)

        // Check if input source was removed during loading
        if (!this._pendingInputSources.has(inputSource)) {
            // Clean up the loaded asset if we got one
            if (successfulResult?.asset) {
                this.app.assets.remove(successfulResult.asset)
                successfulResult.asset.unload()
            }
            return
        }

        // Remove from pending set
        this._pendingInputSources.delete(inputSource)

        if (successfulResult) {
            const { asset } = successfulResult
            const container = asset.resource
            const entity = container.instantiateRenderEntity()
            this.app.root.addChild(entity)

            // Apply current visibility state
            entity.enabled = this._visible

            // Build joint map for hand tracking
            const jointMap = new Map()
            if (inputSource.hand) {
                for (const joint of inputSource.hand.joints) {
                    const jointEntity = entity.findByName(joint.id)
                    if (jointEntity) {
                        jointMap.set(joint, jointEntity)
                    }
                }
            }

            this.controllers.set(inputSource, { entity, jointMap, asset })

            // Fire event for other scripts to coordinate
            this.app.fire('xr:controller:add', inputSource, entity)
        } else {
            console.warn('XrControllers: No compatible profiles found for input source')
        }
    }

    /**
     * Loads a single profile and its model.
     *
     * @param {XrInputSource} inputSource - The input source.
     * @param {string} profileId - The profile ID to load.
     * @returns {Promise<{ profileId: string, asset: import('playcanvas').Asset } | null>} The result or null on failure.
     * @private
     */
    async _loadProfile(inputSource, profileId) {
        const profileUrl = `${this.basePath}/${profileId}/profile.json`

        try {
            const response = await fetch(profileUrl)
            if (!response.ok) {
                return null
            }

            const profile = await response.json()
            const layoutPath = profile.layouts[inputSource.handedness]?.assetPath || ''
            const assetPath = `${this.basePath}/${profile.profileId}/${inputSource.handedness}${layoutPath.replace(/^\/?(left|right)/, '')}`

            // Load the model
            const asset = await new Promise((resolve, reject) => {
                this.app.assets.loadFromUrl(assetPath, 'container', (err, asset) => {
                    if (err) reject(err)
                    else resolve(asset)
                })
            })

            return { profileId, asset }
        } catch (error) {
            // Silently fail for individual profiles - we'll try the next one
            return null
        }
    }

    /**
     * Called when an input source is removed.
     *
     * @param {XrInputSource} inputSource - The input source that was removed.
     * @private
     */
    _onInputSourceRemove(inputSource) {
        // Remove from pending set if still loading
        this._pendingInputSources.delete(inputSource)
        this._destroyController(inputSource)
    }

    /**
     * Sets the visibility state of controller models.
     *
     * @type {boolean}
     */
    set visible(value) {
        if (this._visible === value) return

        this._visible = value

        for (const [, controller] of this.controllers) {
            controller.entity.enabled = value
        }
    }

    /**
     * Gets the visibility state of controller models.
     *
     * @type {boolean}
     */
    get visible() {
        return this._visible
    }

    update(dt) {
        if (!this.app.xr?.active || !this._visible) return

        for (const [inputSource, { entity, jointMap }] of this.controllers) {
            if (inputSource.hand) {
                // Update hand joint positions
                for (const [joint, jointEntity] of jointMap) {
                    jointEntity.setPosition(joint.getPosition())
                    jointEntity.setRotation(joint.getRotation())
                }
            } else {
                // Update controller position
                const position = inputSource.getPosition()
                const rotation = inputSource.getRotation()
                if (position) entity.setPosition(position)
                if (rotation) entity.setRotation(rotation)
            }
        }
    }
}

/** @import { XrInputSource } from 'playcanvas' */

/**
 * Handles VR navigation with support for teleportation, smooth locomotion, and snap vertical movement.
 * All methods can be enabled simultaneously, allowing users to choose their preferred
 * navigation method on the fly.
 *
 * Teleportation: Point and teleport using trigger/pinch gestures
 * Smooth Locomotion: Use left thumbstick for XZ movement
 * Snap Turn: Use right thumbstick X-axis for snap turning
 * Snap Vertical: Use right thumbstick Y-axis to snap up/down (right grip for larger jumps)
 *
 * This script should be attached to a parent entity of the camera entity used for the XR
 * session. The entity hierarchy should be: XrNavigationEntity > CameraEntity for proper
 * locomotion handling. Use it in conjunction with the `XrControllers` script.
 */
class XrNavigation extends Script {
    static scriptName = 'xrNavigation'

    /**
     * Enable teleportation navigation using trigger/pinch gestures.
     * @attribute
     */
    enableTeleport = true

    /**
     * Enable smooth locomotion using thumbsticks.
     * @attribute
     */
    enableMove = true

    /**
     * Speed of smooth locomotion movement in meters per second.
     * @attribute
     * @range [0.1, 10]
     * @enabledif {enableMove}
     */
    movementSpeed = 1.5

    /**
     * Angle in degrees for each snap turn.
     * @attribute
     * @range [15, 180]
     * @enabledif {enableMove}
     */
    rotateSpeed = 45

    /**
     * Thumbstick deadzone threshold for movement.
     * @attribute
     * @range [0, 0.5]
     * @precision 0.01
     * @enabledif {enableMove}
     */
    movementThreshold = 0.1

    /**
     * Thumbstick threshold to trigger snap turning.
     * @attribute
     * @range [0.1, 1]
     * @precision 0.01
     * @enabledif {enableMove}
     */
    rotateThreshold = 0.5

    /**
     * Thumbstick threshold to reset snap turn state.
     * @attribute
     * @range [0.05, 0.5]
     * @precision 0.01
     * @enabledif {enableMove}
     */
    rotateResetThreshold = 0.25

    /**
     * Maximum distance for teleportation in meters.
     * @attribute
     * @range [1, 50]
     * @enabledif {enableTeleport}
     */
    maxTeleportDistance = 10

    /**
     * Radius of the teleport target indicator circle.
     * @attribute
     * @range [0.1, 2]
     * @precision 0.1
     * @enabledif {enableTeleport}
     */
    teleportIndicatorRadius = 0.2

    /**
     * Number of segments for the teleport indicator circle.
     * @attribute
     * @range [8, 64]
     * @enabledif {enableTeleport}
     */
    teleportIndicatorSegments = 16

    /**
     * Color for valid teleportation areas.
     * @attribute
     * @enabledif {enableTeleport}
     */
    validTeleportColor = new Color(0, 1, 0)

    /**
     * Color for invalid teleportation areas.
     * @attribute
     * @enabledif {enableTeleport}
     */
    invalidTeleportColor = new Color(1, 0, 0)

    /**
     * Color for controller rays.
     * @attribute
     * @enabledif {enableMove}
     */
    controllerRayColor = new Color(1, 1, 1)

    /**
     * Enable snap vertical movement using right thumbstick Y (controllers only).
     * @attribute
     */
    enableSnapVertical = true

    /**
     * Height in meters for each vertical snap.
     * @attribute
     * @range [0.1, 2]
     * @precision 0.1
     * @enabledif {enableSnapVertical}
     */
    snapVerticalHeight = 0.5

    /**
     * Height in meters for each vertical snap when holding right grip (boost).
     * @attribute
     * @range [0.5, 10]
     * @precision 0.5
     * @enabledif {enableSnapVertical}
     */
    snapVerticalBoostHeight = 2.0

    /**
     * Thumbstick Y threshold to trigger vertical snap.
     * @attribute
     * @range [0.1, 1]
     * @precision 0.01
     * @enabledif {enableSnapVertical}
     */
    snapVerticalThreshold = 0.5

    /**
     * Thumbstick Y threshold to reset vertical snap state.
     * @attribute
     * @range [0.05, 0.5]
     * @precision 0.01
     * @enabledif {enableSnapVertical}
     */
    snapVerticalResetThreshold = 0.25

    /** @type {Set<XrInputSource>} */
    inputSources = new Set()

    /** @type {Map<XrInputSource, boolean>} */
    activePointers = new Map()

    /** @type {Map<XrInputSource, { handleSelectStart: Function, handleSelectEnd: Function }>} */
    inputHandlers = new Map()

    // Rotation state for snap turning
    lastRotateValue = 0

    // Vertical state for snap vertical movement
    lastVerticalValue = 0

    // Pre-allocated objects for performance (object pooling)
    tmpVec2A = new Vec2()

    tmpVec2B = new Vec2()

    tmpVec3A = new Vec3()

    tmpVec3B = new Vec3()

    // Color objects
    validColor = new Color()

    invalidColor = new Color()

    rayColor = new Color()

    // Camera reference for movement calculations
    /** @type {import('playcanvas').Entity | null} */
    cameraEntity = null

    initialize() {
        if (!this.app.xr) {
            console.error('XrNavigation script requires XR to be enabled on the application')
            return
        }

        // Log enabled navigation methods
        const methods = []
        if (this.enableTeleport) methods.push('teleportation')
        if (this.enableMove) methods.push('smooth movement')
        if (this.enableSnapVertical) methods.push('snap vertical')

        if (!this.enableTeleport && !this.enableMove && !this.enableSnapVertical) {
            console.warn('XrNavigation: All navigation methods are disabled. Navigation will not work.')
        }

        // Initialize color objects from Color attributes
        this.validColor.copy(this.validTeleportColor)
        this.invalidColor.copy(this.invalidTeleportColor)
        this.rayColor.copy(this.controllerRayColor)

        // Find camera entity - should be a child of this entity
        const cameraComponent = this.entity.findComponent('camera')
        this.cameraEntity = cameraComponent ? cameraComponent.entity : null

        if (!this.cameraEntity) {
            console.warn('XrNavigation: Camera entity not found. Looking for camera in children...')

            // First try to find by name - cast to Entity since we know it should be one
            const foundByName = this.entity.findByName('camera')
            this.cameraEntity = /** @type {import('playcanvas').Entity | null} */ (foundByName)

            // If not found, search children for entity with camera component
            if (!this.cameraEntity) {
                for (const child of this.entity.children) {
                    const childEntity = /** @type {import('playcanvas').Entity} */ (child)
                    if (childEntity.camera) {
                        this.cameraEntity = childEntity
                        break
                    }
                }
            }

            if (!this.cameraEntity) {
                console.error('XrNavigation: No camera entity found. Movement calculations may not work correctly.')
            }
        }

        this.app.xr.input.on('add', (inputSource) => {
            const handleSelectStart = () => {
                this.activePointers.set(inputSource, true)
            }

            const handleSelectEnd = () => {
                this.activePointers.set(inputSource, false)
                this.tryTeleport(inputSource)
            }

            // Attach the handlers
            inputSource.on('selectstart', handleSelectStart)
            inputSource.on('selectend', handleSelectEnd)

            // Store the handlers in the map
            this.inputHandlers.set(inputSource, { handleSelectStart, handleSelectEnd })
            this.inputSources.add(inputSource)
        })

        this.app.xr.input.on('remove', (inputSource) => {
            const handlers = this.inputHandlers.get(inputSource)
            if (handlers) {
                inputSource.off('selectstart', handlers.handleSelectStart)
                inputSource.off('selectend', handlers.handleSelectEnd)
                this.inputHandlers.delete(inputSource)
            }
            this.activePointers.delete(inputSource)
            this.inputSources.delete(inputSource)
        })
    }

    findPlaneIntersection(origin, direction) {
        // Find intersection with y=0 plane
        if (Math.abs(direction.y) < 0.00001) return null // Ray is parallel to plane

        const t = -origin.y / direction.y
        if (t < 0) return null // Intersection is behind the ray

        return new Vec3(origin.x + direction.x * t, 0, origin.z + direction.z * t)
    }

    tryTeleport(inputSource) {
        const origin = inputSource.getOrigin()
        const direction = inputSource.getDirection()

        const hitPoint = this.findPlaneIntersection(origin, direction)
        if (hitPoint) {
            // Adjust for camera's local XZ offset so the user's head ends up at the target
            if (this.cameraEntity) {
                const cameraLocalPos = this.cameraEntity.getLocalPosition()
                hitPoint.x -= cameraLocalPos.x
                hitPoint.z -= cameraLocalPos.z
            }

            const cameraY = this.entity.getPosition().y
            hitPoint.y = cameraY
            this.entity.setPosition(hitPoint)
        }
    }

    update(dt) {
        // Handle smooth locomotion and snap turning
        if (this.enableMove) {
            this.handleSmoothLocomotion(dt)
        }

        // Handle snap vertical movement (controllers only)
        if (this.enableSnapVertical) {
            this.handleSnapVertical()
        }

        // Handle teleportation
        if (this.enableTeleport) {
            this.handleTeleportation()
        }

        // Always show controller rays for debugging/visualization
        this.renderControllerRays()
    }

    handleSmoothLocomotion(dt) {
        if (!this.cameraEntity) return

        for (const inputSource of this.inputSources) {
            // Only process controllers with gamepads
            if (!inputSource.gamepad) continue

            // Left controller - movement
            if (inputSource.handedness === 'left') {
                // Get thumbstick input (axes[2] = X, axes[3] = Y)
                this.tmpVec2A.set(inputSource.gamepad.axes[2], inputSource.gamepad.axes[3])

                // Check if input exceeds deadzone
                if (this.tmpVec2A.length() > this.movementThreshold) {
                    this.tmpVec2A.normalize()

                    // Calculate camera-relative movement direction
                    const forward = this.cameraEntity.forward
                    this.tmpVec2B.x = forward.x
                    this.tmpVec2B.y = forward.z
                    this.tmpVec2B.normalize()

                    // Calculate rotation angle based on camera yaw
                    const rad = Math.atan2(this.tmpVec2B.x, this.tmpVec2B.y) - Math.PI / 2

                    // Apply rotation to movement vector
                    const t = this.tmpVec2A.x * Math.sin(rad) - this.tmpVec2A.y * Math.cos(rad)
                    this.tmpVec2A.y = this.tmpVec2A.y * Math.sin(rad) + this.tmpVec2A.x * Math.cos(rad)
                    this.tmpVec2A.x = t

                    // Scale by movement speed and delta time
                    this.tmpVec2A.mulScalar(this.movementSpeed * dt)

                    // Apply movement to camera parent (this entity)
                    this.entity.translate(this.tmpVec2A.x, 0, this.tmpVec2A.y)
                }
            } else if (inputSource.handedness === 'right') {
                // Right controller - snap turning
                this.handleSnapTurning(inputSource)
            }
        }
    }

    handleSnapTurning(inputSource) {
        // Get rotation input from right thumbstick X-axis
        const rotate = -inputSource.gamepad.axes[2]

        // Hysteresis system to prevent multiple rotations from single gesture
        if (this.lastRotateValue > 0 && rotate < this.rotateResetThreshold) {
            this.lastRotateValue = 0
        } else if (this.lastRotateValue < 0 && rotate > -this.rotateResetThreshold) {
            this.lastRotateValue = 0
        }

        // Only rotate when thumbstick crosses threshold from neutral position
        if (this.lastRotateValue === 0 && Math.abs(rotate) > this.rotateThreshold) {
            this.lastRotateValue = Math.sign(rotate)

            if (this.cameraEntity) {
                // Rotate around camera position, not entity origin
                this.tmpVec3A.copy(this.cameraEntity.getLocalPosition())
                this.entity.translateLocal(this.tmpVec3A)
                this.entity.rotateLocal(0, Math.sign(rotate) * this.rotateSpeed, 0)
                this.entity.translateLocal(this.tmpVec3A.mulScalar(-1))
            }
        }
    }

    /**
     * Handles snap vertical movement using right thumbstick Y.
     * Uses hysteresis to prevent multiple snaps from a single gesture.
     * Hold right grip for larger snap height (boost).
     *
     * @private
     */
    handleSnapVertical() {
        // Find right controller
        let rightController = null

        for (const inputSource of this.inputSources) {
            if (!inputSource.gamepad) continue
            if (inputSource.handedness === 'right') {
                rightController = inputSource
                break
            }
        }

        if (!rightController || !rightController.gamepad) return

        // Get vertical input from right thumbstick Y axis (negative = up on stick)
        const vertical = -rightController.gamepad.axes[3]

        // Hysteresis system to prevent multiple snaps from single gesture
        if (this.lastVerticalValue > 0 && vertical < this.snapVerticalResetThreshold) {
            this.lastVerticalValue = 0
        } else if (this.lastVerticalValue < 0 && vertical > -this.snapVerticalResetThreshold) {
            this.lastVerticalValue = 0
        }

        // Only snap when thumbstick crosses threshold from neutral position
        if (this.lastVerticalValue === 0 && Math.abs(vertical) > this.snapVerticalThreshold) {
            this.lastVerticalValue = Math.sign(vertical)

            // Check if right grip is held for boost
            const rightGripPressed = rightController.gamepad.buttons[1]?.pressed
            const snapHeight = rightGripPressed ? this.snapVerticalBoostHeight : this.snapVerticalHeight

            // Apply vertical snap (positive = up, negative = down)
            this.entity.translate(0, Math.sign(vertical) * snapHeight, 0)
        }
    }

    handleTeleportation() {
        for (const inputSource of this.inputSources) {
            // Only show teleportation ray when trigger/select is pressed
            if (!this.activePointers.get(inputSource)) continue

            const start = inputSource.getOrigin()
            const direction = inputSource.getDirection()

            const hitPoint = this.findPlaneIntersection(start, direction)

            if (hitPoint && this.isValidTeleportDistance(hitPoint)) {
                // Draw line to intersection point
                this.app.drawLine(start, hitPoint, this.validColor)
                this.drawTeleportIndicator(hitPoint)
            } else {
                // Draw full length ray if no intersection or invalid distance
                this.tmpVec3B.copy(direction).mulScalar(this.maxTeleportDistance).add(start)
                this.app.drawLine(start, this.tmpVec3B, this.invalidColor)
            }
        }
    }

    renderControllerRays() {
        // Only render controller rays when smooth movement is enabled
        // (teleport rays are handled separately in handleTeleportation)
        if (!this.enableMove) return

        for (const inputSource of this.inputSources) {
            // Skip if currently teleporting (handled by handleTeleportation)
            if (this.activePointers.get(inputSource)) continue

            const start = inputSource.getOrigin()
            this.tmpVec3B.copy(inputSource.getDirection()).mulScalar(2).add(start)
            this.app.drawLine(start, this.tmpVec3B, this.rayColor)
        }
    }

    isValidTeleportDistance(hitPoint) {
        const distance = hitPoint.distance(this.entity.getPosition())
        return distance <= this.maxTeleportDistance
    }

    drawTeleportIndicator(point) {
        // Draw a circle at the teleport point using configurable attributes
        const segments = this.teleportIndicatorSegments
        const radius = this.teleportIndicatorRadius

        for (let i = 0; i < segments; i++) {
            const angle1 = (i / segments) * Math.PI * 2
            const angle2 = ((i + 1) / segments) * Math.PI * 2

            const x1 = point.x + Math.cos(angle1) * radius
            const z1 = point.z + Math.sin(angle1) * radius
            const x2 = point.x + Math.cos(angle2) * radius
            const z2 = point.z + Math.sin(angle2) * radius

            // Use pre-allocated vectors to avoid garbage collection
            this.tmpVec3A.set(x1, 0.01, z1) // Slightly above ground to avoid z-fighting
            this.tmpVec3B.set(x2, 0.01, z2)

            this.app.drawLine(this.tmpVec3A, this.tmpVec3B, this.validColor)
        }
    }
}

// On entering/exiting AR, we need to set the camera clear color to transparent black
const initXr = (global) => {
    const { app, events, state, camera } = global
    state.hasAR = app.xr.isAvailable('immersive-ar')
    state.hasVR = app.xr.isAvailable('immersive-vr')
    // initialize ar/vr
    app.xr.on('available:immersive-ar', (available) => {
        state.hasAR = available
    })
    app.xr.on('available:immersive-vr', (available) => {
        state.hasVR = available
    })
    const parent = camera.parent
    const clearColor = new Color()
    const parentPosition = new Vec3()
    const parentRotation = new Quat()
    const cameraPosition = new Vec3()
    const cameraRotation = new Quat()
    const angles = new Vec3()
    parent.addComponent('script')
    parent.script.create(XrControllers)
    parent.script.create(XrNavigation)
    app.xr.on('start', () => {
        app.autoRender = true
        // cache original camera rig positions and rotations
        parentPosition.copy(parent.getPosition())
        parentRotation.copy(parent.getRotation())
        cameraPosition.copy(camera.getPosition())
        cameraRotation.copy(camera.getRotation())
        cameraRotation.getEulerAngles(angles)
        // copy transform to parent to XR/VR mode starts in the right place
        parent.setPosition(cameraPosition.x, 0, cameraPosition.z)
        parent.setEulerAngles(0, angles.y, 0)
        if (app.xr.type === 'immersive-ar') {
            clearColor.copy(camera.camera.clearColor)
            camera.camera.clearColor = new Color(0, 0, 0, 0)
        }
    })
    app.xr.on('end', () => {
        app.autoRender = false
        // restore camera to pre-XR state
        parent.setPosition(parentPosition)
        parent.setRotation(parentRotation)
        camera.setPosition(cameraPosition)
        camera.setRotation(cameraRotation)
        if (app.xr.type === 'immersive-ar') {
            camera.camera.clearColor = clearColor
        }
        // Restore the canvas to the correct position in the DOM after exiting XR. In
        // some browsers (e.g. Chrome on Android) the canvas is moved to a new root
        // during XR, and needs to be moved back on exit.
        requestAnimationFrame(() => {
            document.body.prepend(app.graphicsDevice.canvas)
            app.renderNextFrame = true
        })
    })
    const start = (type) => {
        camera.camera.nearClip = 0.01
        camera.camera.farClip = 1000
        app.xr.start(app.root.findComponent('camera'), type, 'local-floor')
    }
    events.on('startAR', () => start('immersive-ar'))
    events.on('startVR', () => start('immersive-vr'))
    events.on('inputEvent', (event) => {
        if (event === 'cancel' && app.xr.active) {
            app.xr.end()
        }
    })
}

const loadGsplat = async (app, config, progressCallback) => {
    const { contents, contentUrl, unified, aa } = config
    const c = contents
    const filename = new URL(contentUrl, location.href).pathname.split('/').pop()
    const data = filename.toLowerCase() === 'meta.json' ? await (await contents).json() : undefined
    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data)
    return new Promise((resolve, reject) => {
        asset.on('load', () => {
            const entity = new Entity('gsplat')
            entity.setLocalEulerAngles(0, 0, 180)
            entity.addComponent('gsplat', {
                unified: unified || filename.toLowerCase().endsWith('lod-meta.json'),
                asset,
            })
            const material = entity.gsplat.unified ? app.scene.gsplat.material : entity.gsplat.material
            material.setDefine('GSPLAT_AA', aa)
            material.setParameter('alphaClip', 1 / 255)
            app.root.addChild(entity)
            modelEntity = entity
            resolve(entity)
        })
        let watermark = 0
        asset.on('progress', (received, length) => {
            const progress = Math.min(1, received / length) * 100
            if (progress > watermark) {
                watermark = progress
                progressCallback(Math.trunc(watermark))
            }
        })
        asset.on('error', (err) => {
            console.log(err)
            reject(err)
        })
        app.assets.add(asset)
        app.assets.load(asset)
    })
}
const loadSkybox = (app, url) => {
    return new Promise((resolve, reject) => {
        const asset = new Asset(
            'skybox',
            'texture',
            {
                url,
            },
            {
                type: 'rgbp',
                mipmaps: false,
                addressu: 'repeat',
                addressv: 'clamp',
            },
        )
        asset.on('load', () => {
            resolve(asset)
        })
        asset.on('error', (err) => {
            console.log(err)
            reject(err)
        })
        app.assets.add(asset)
        app.assets.load(asset)
    })
}
const createApp = async (canvas, config) => {
    // Create the graphics device
    const device = await createGraphicsDevice(canvas, {
        deviceTypes: config.webgpu ? ['webgpu'] : [],
        antialias: false,
        depth: true,
        stencil: false,
        xrCompatible: !config.webgpu,
        powerPreference: 'high-performance',
    })
    // Set maxPixelRatio so the XR framebuffer scale factor is computed correctly.
    // Regular rendering bypasses maxPixelRatio via the custom initCanvas sizing.
    device.maxPixelRatio = window.devicePixelRatio
    // Create the application
    const app = new App(canvas, {
        graphicsDevice: device,
        mouse: new Mouse(canvas),
        touch: new TouchDevice(canvas),
        keyboard: new Keyboard(window),
    })
    // Create entity hierarchy
    const cameraRoot = new Entity('camera root')
    app.root.addChild(cameraRoot)
    const camera = new Entity('camera')
    cameraRoot.addChild(camera)
    const light = new Entity('light')
    light.setEulerAngles(35, 45, 0)
    light.addComponent('light', {
        color: new Color(1.0, 0.98, 0.957),
        intensity: 1,
    })
    app.root.addChild(light)
    app.scene.ambientLight.set(0.51, 0.55, 0.65)
    return { app, camera }
}
// initialize canvas size and resizing
const initCanvas = (global) => {
    const { app, events, state } = global
    const { canvas } = app.graphicsDevice
    // maximum pixel dimension we will allow along the shortest screen dimension based on platform
    const maxPixelDim = platform.mobile ? 1080 : 2160
    // cap pixel ratio to limit resolution on high-DPI devices
    const calcPixelRatio = () => Math.min(maxPixelDim / Math.min(screen.width, screen.height), window.devicePixelRatio)
    // last known device pixel size (full resolution, before any quality scaling)
    const deviceSize = { width: 0, height: 0 }
    const set = (width, height) => {
        const ratio = calcPixelRatio()
        deviceSize.width = width * ratio
        deviceSize.height = height * ratio
    }
    const apply = () => {
        // don't resize the canvas during XR - the XR system manages its own framebuffers
        // and resetting canvas dimensions can invalidate the XRWebGLLayer
        if (app.xr?.active) return
        const s = state.retinaDisplay ? 1.0 : 0.5
        const w = Math.ceil(deviceSize.width * s)
        const h = Math.ceil(deviceSize.height * s)
        if (w !== canvas.width || h !== canvas.height) {
            canvas.width = w
            canvas.height = h
        }
    }
    const resizeObserver = new ResizeObserver((entries) => {
        const e = entries[0]?.contentBoxSize?.[0]
        if (e) {
            set(e.inlineSize, e.blockSize)
            app.renderNextFrame = true
        }
    })
    resizeObserver.observe(canvas)
    events.on('retinaDisplay:changed', () => {
        app.renderNextFrame = true
    })
    // Resize canvas before render() so the swap chain texture is acquired at the correct size.
    app.on('framerender', apply)
    // Disable the engine's built-in canvas resize — we handle it via ResizeObserver
    // @ts-ignore
    app._allowResize = false
    set(canvas.clientWidth, canvas.clientHeight)
    apply()
}
// === Config / Settings (originally in <head>) ===
const createImage = (url) => {
    const img = new Image()
    img.src = url
    return img
}
const createProgressFetch = async (input) => {
    try {
        const response = await fetch(input)
        if (!response.ok) throw new Error('HTTP error')

        const total = Number(response.headers.get('content-length')) || 0
        if (!response.body || total <= 0) return response

        const reader = response.body.getReader()
        const stream = new ReadableStream({
            start(controller) {
                let loaded = 0
                function pump() {
                    return reader.read().then(({ done, value }) => {
                        if (done) {
                            controller.close()
                            return
                        }
                        loaded += value.length
                        controller.enqueue(value)
                        return pump()
                    })
                }
                return pump()
            },
        })

        return new Response(stream, {
            headers: response.headers,
            status: response.status,
            statusText: response.statusText,
        })
    } catch (e) {
        return fetch(input)
    }
}
const url = new URL(location.href)
const posterUrl = url.searchParams.get('poster')
const skyboxUrl = url.searchParams.get('skybox')
const voxelUrl = url.searchParams.get('voxel')
const { settings } = window.sse
const config = {
    poster: posterUrl && createImage(posterUrl),
    skyboxUrl,
    voxelUrl,
    contentUrl: settings.contentUrl,
    contents: createProgressFetch(settings.contentUrl),
    noui: url.searchParams.has('noui'),
    editable: url.searchParams.get('edit') === 'true' && window.location.protocol !== 'https:',
    noanim: true,
    nofx: url.searchParams.has('nofx'),
    hpr: url.searchParams.has('hpr') ? ['', '1', 'true', 'enable'].includes(url.searchParams.get('hpr')) : undefined,
    ministats: url.searchParams.has('ministats'),
    colorize: url.searchParams.has('colorize'),
    unified: url.searchParams.has('unified'),
    webgpu: url.searchParams.has('webgpu'),
    gpusort: url.searchParams.has('gpusort'),
    aa: url.searchParams.has('aa'),
    heatmap: url.searchParams.has('heatmap'),
}

const main = async (canvas, settingsJson, config) => {
    const { app, camera } = await createApp(canvas, config)
    // create events
    const events = new EventHandler()
    const state = observe(events, {
        loaded: false,
        readyToRender: false,
        retinaDisplay: platform.mobile
            ? localStorage.getItem('retinaDisplay') === 'true'
            : localStorage.getItem('retinaDisplay') !== 'false',
        progress: 0,
        inputMode: platform.mobile ? 'touch' : 'desktop',
        cameraMode: 'orbit',
        hasAnimation: false,
        animationDuration: 0,
        animationTime: 0,
        animationPaused: true,
        hasAR: false,
        hasVR: false,
        hasCollision: false,
        hasVoxelOverlay: false,
        voxelOverlayEnabled: false,
        isFullscreen: false,
        controlsHidden: false,
        gamingControls: localStorage.getItem('gamingControls') === 'true',
    })
    const confirmDialog = new ConfirmDialog()
    const global = {
        app,
        settings: importSettings(settingsJson),
        config,
        state,
        events,
        camera,
        confirmDialog,
    }
    initCanvas(global)
    // start the application
    app.start()
    // Initialize the load-time poster
    if (config.poster) {
        initPoster(events)
    }
    camera.addComponent('camera')
    // Initialize XR support
    if (!config.webgpu) {
        initXr(global)
    }
    // Initialize user interface
    const dom = initUI(global)
    // Load model
    const gsplatLoad = loadGsplat(app, config, (progress) => {
        state.progress = progress
    })
    // Load skybox
    const skyboxLoad =
        config.skyboxUrl &&
        loadSkybox(app, config.skyboxUrl).then((asset) => {
            app.scene.envAtlas = asset.resource
        })
    // Load voxel collision data
    const voxelLoad =
        config.voxelUrl &&
        VoxelCollider.load(config.voxelUrl).catch((err) => {
            console.warn('Failed to load voxel data:', err)
            return null
        })
    // Load and play sound
    if (global.settings.soundUrl) {
        const sound = new Audio(global.settings.soundUrl)
        sound.crossOrigin = 'anonymous'
        document.body.addEventListener(
            'click',
            () => {
                if (sound) {
                    sound.play()
                }
            },
            {
                capture: true,
                once: true,
            },
        )
    }
    // Create the viewer
    return new Viewer(global, gsplatLoad, skyboxLoad, voxelLoad, dom)
}
const { poster } = config
// Show the poster image
if (poster) {
    const element = document.getElementById('poster')
    element.style.setProperty('--poster-url', `url(${poster.src})`)
    element.style.display = 'block'
    element.style.filter = 'blur(40px)'

    // hide the canvas
    document.documentElement.style.setProperty('--canvas-opacity', '0')
}

document.addEventListener('DOMContentLoaded', async () => {
    const canvas = document.getElementById('application-canvas')
    const settingsJson = await settings
    const viewer = await main(canvas, settingsJson, config)
    // const bboxSetup = (() => {
    //     const app = viewer.global.app
    //     const layers = app.scene.layers
    //     const worldLayer = layers.getLayerByName('World')

    //     const layerBBox = new Layer({ name: 'BBox' })
    //     const worldIndex = layers.getOpaqueIndex(worldLayer)
    //     layers.insert(layerBBox, worldIndex)

    //     const cam = viewer.global.camera
    //     cam.camera.layers = [...cam.camera.layers, layerBBox.id]

    //     const lineMesh = new Mesh(app.graphicsDevice)

    //     const createLineMat = (opacity) => {
    //         const mat = new StandardMaterial()
    //         mat.emissive = new Color(0, 1, 0.6)
    //         mat.diffuse = new Color(0, 0, 0)
    //         mat.opacity = opacity
    //         mat.blendType = BLEND_NORMAL
    //         mat.depthTest = true
    //         mat.depthWrite = true
    //         mat.useLighting = false
    //         mat.cull = CULLFACE_NONE
    //         mat.update()
    //         return mat
    //     }

    //     const matBBox = createLineMat(1.0)
    //     const bboxEntity = new Entity('bbox')
    //     app.root.addChild(bboxEntity)

    //     const mi = new MeshInstance(lineMesh, matBBox)
    //     mi.cull = false

    //     bboxEntity.addComponent('render', {
    //         layers: [layerBBox.id],
    //         meshInstances: [mi],
    //     })

    //     const updateMesh = (gsplatEntity) => {
    //         const aabb = gsplatEntity.gsplat.customAabb
    //         if (!aabb) return

    //         const c = aabb.center
    //         const he = aabb.halfExtents
    //         const wd = gsplatEntity.getWorldTransform().data

    //         const transformPoint = (p) => [
    //             wd[0] * p[0] + wd[4] * p[1] + wd[8] * p[2] + wd[12],
    //             wd[1] * p[0] + wd[5] * p[1] + wd[9] * p[2] + wd[13],
    //             wd[2] * p[0] + wd[6] * p[1] + wd[10] * p[2] + wd[14],
    //         ]

    //         const corners = [
    //             [-he.x, -he.y, -he.z],
    //             [he.x, -he.y, -he.z],
    //             [-he.x, he.y, -he.z],
    //             [he.x, he.y, -he.z],
    //             [-he.x, -he.y, he.z],
    //             [he.x, -he.y, he.z],
    //             [-he.x, he.y, he.z],
    //             [he.x, he.y, he.z],
    //         ].map((p) => transformPoint([c.x + p[0], c.y + p[1], c.z + p[2]]))

    //         const edges = [
    //             [0, 1],
    //             [1, 3],
    //             [3, 2],
    //             [2, 0],
    //             [4, 5],
    //             [5, 7],
    //             [7, 6],
    //             [6, 4],
    //             [0, 4],
    //             [1, 5],
    //             [2, 6],
    //             [3, 7],
    //         ]

    //         const pos = []
    //         for (const [i, j] of edges) {
    //             pos.push(...corners[i], ...corners[j])
    //         }

    //         lineMesh.setPositions(pos)
    //         lineMesh.update(PRIMITIVE_LINES, false)
    //     }

    //     app.on('update', () => {
    //         const gsplatEntity = app.root.findByName('gsplat')
    //         if (!gsplatEntity || !gsplatEntity.gsplat) return
    //         updateMesh(gsplatEntity)
    //         app.renderNextFrame = true
    //     })
    // })()
})
