class Hotspot {
    constructor(camera, dom, data) {
        this.camera = camera
        this.dom = dom
        this.data = data
        this.id = data.id
        this.isDisplay = true
        this.isEdit = false
        this.hotspotBtn = null
        this.dragging = false
        this.resizing = false
        this.resizeEdge = null

        this.data.focus.position = new Vec3(data.focus.position.x, data.focus.position.y, data.focus.position.z)

        this.createDiv()
        this.createLine()
        this.createDot()
        this.addDotDragEvents()
        this.addContentDragEvents()
        // this.update()
    }

    setHotspotBtn(btn) {
        this.hotspotBtn = btn
    }

    // ── DOM creation ─────────────────────────
    createDot() {
        this.dot = document.createElement('div')
        this.dot.classList.add('hotspotDot')
        this.dot.style.cssText = 'position:absolute; border-radius:50%; cursor:grab;'
        this.dom.ui.appendChild(this.dot)
    }

    createLine() {
        const svgNS = 'http://www.w3.org/2000/svg'
        this.lineSvg = document.createElementNS(svgNS, 'svg')
        this.lineSvg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;'
        this.line = document.createElementNS(svgNS, 'line')
        this.line.setAttribute('stroke-width', '1')
        this.lineSvg.appendChild(this.line)
        this.dom.ui.appendChild(this.lineSvg)
    }

    createDiv() {
        this.div = document.createElement('div')
        this.div.classList.add('hotspot')
        this.div.style.position = 'absolute'
        this.div.innerHTML = `<span>${this.data.text.content}</span>`
        this.textContentSpan = this.div.querySelector('span')
        this.div.style.color = this.data.textColor
        this.dom.ui.appendChild(this.div)
    }

    // ── Update loop ──────────────────────────
    update(updateContent = true, dotSize) {
        if (!modelEntity?.gsplat?.instance?.meshInstance?.node) return

        const containerRect = this.dom.ui.getBoundingClientRect()
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        const invWorldMatrix = new Mat4().copy(worldMatrix).invert()
        const focusWorldPos = new Vec3()
        worldMatrix.transformPoint(this.data.focus.position, focusWorldPos)
        const focusScreenPos = this.camera.worldToScreen(focusWorldPos, containerRect.width, containerRect.height)

        this.updateDotLocalBounds(focusWorldPos, invWorldMatrix, dotSize)
        this.updateTextLocalBounds(focusWorldPos, invWorldMatrix)
        this.updateDot(worldMatrix, focusScreenPos, containerRect)
        this.updateTextContent(focusScreenPos, worldMatrix, containerRect, updateContent)
        this.updateLine(focusScreenPos)
    }

    updateTextLocalBounds(focusWorldPos, invWorldMatrix) {
        if (this.data.text?.topLeft instanceof Vec3) return

        if (this.data.text?.topLeft) {
            this.data.text.topLeft = new Vec3(
                this.data.text.topLeft.x,
                this.data.text.topLeft.y,
                this.data.text.topLeft.z,
            )
            this.data.text.botRight = new Vec3(
                this.data.text.botRight.x,
                this.data.text.botRight.y,
                this.data.text.botRight.z,
            )
            return
        }

        const focusScreenPos = this.camera.worldToScreen(focusWorldPos, window.innerWidth, window.innerHeight)
        const px = 50,
            py = 50
        const tl = new Vec3(focusScreenPos.x + 20, focusScreenPos.y - py * 2, focusScreenPos.z)
        const br = new Vec3(focusScreenPos.x + 20 + px * 3, focusScreenPos.y - py, focusScreenPos.z)
        const worldTL = this.camera.screenToWorld(tl.x, tl.y, tl.z)
        const worldBR = this.camera.screenToWorld(br.x, br.y, br.z)
        const localTL = new Vec3()
        const localBR = new Vec3()
        invWorldMatrix.transformPoint(worldTL, localTL)
        invWorldMatrix.transformPoint(worldBR, localBR)
        this.data.text.originWidth = Math.abs(br.x - tl.x)
        this.data.text.originHeight = Math.abs(br.y - tl.y)
        this.data.text.topLeft = localTL
        this.data.text.botRight = localBR
    }

    updateDotLocalBounds(focusWorldPos, invWorldMatrix, size) {
        if (!size && this.data.dot.topLeft && this.data.dot.botRight) {
            if (!(this.data.dot.topLeft instanceof Vec3)) {
                this.data.dot.topLeft = new Vec3(
                    this.data.dot.topLeft.x,
                    this.data.dot.topLeft.y,
                    this.data.dot.topLeft.z,
                )
                this.data.dot.botRight = new Vec3(
                    this.data.dot.botRight.x,
                    this.data.dot.botRight.y,
                    this.data.dot.botRight.z,
                )
            }
            return
        }
        const focusScreenPos = this.camera.worldToScreen(focusWorldPos, window.innerWidth, window.innerHeight)
        const half = (size ?? this.data.size ?? 30) / 2
        const tl = new Vec3(focusScreenPos.x - half, focusScreenPos.y - half, focusScreenPos.z)
        const br = new Vec3(focusScreenPos.x + half, focusScreenPos.y + half, focusScreenPos.z)
        const worldTL = this.camera.screenToWorld(tl.x, tl.y, tl.z)
        const worldBR = this.camera.screenToWorld(br.x, br.y, br.z)
        const localTL = new Vec3()
        const localBR = new Vec3()
        invWorldMatrix.transformPoint(worldTL, localTL)
        invWorldMatrix.transformPoint(worldBR, localBR)
        this.data.dot.topLeft = localTL
        this.data.dot.botRight = localBR
    }

    updateDot(worldMatrix, focusScreenPos, containerRect) {
        const dotWorldTL = new Vec3()
        const dotWorldBR = new Vec3()
        worldMatrix.transformPoint(this.data.dot.topLeft, dotWorldTL)
        worldMatrix.transformPoint(this.data.dot.botRight, dotWorldBR)
        const dotScreenTL = this.camera.worldToScreen(dotWorldTL, containerRect.width, containerRect.height)
        const dotScreenBR = this.camera.worldToScreen(dotWorldBR, containerRect.width, containerRect.height)
        const dotSize = Math.abs(dotScreenBR.x - dotScreenTL.x)

        this.dot.style.width = dotSize + 'px'
        this.dot.style.height = dotSize + 'px'

        const { style, stroke, strokeColor } = this.data.dot
        if (style === 'circle') {
            this.dot.style.background = 'transparent'
            this.dot.style.border = `${stroke}px solid ${strokeColor}`
        } else {
            this.dot.style.background = strokeColor
            this.dot.style.border = 'none'
        }

        this.dot.style.left = focusScreenPos.x - this.dot.offsetWidth / 2 + 'px'
        this.dot.style.top = focusScreenPos.y - this.dot.offsetHeight / 2 + 'px'
    }

    updateLine(focusScreenPos) {
        const divRect = this.div.getBoundingClientRect()
        const cx = divRect.left + divRect.width / 2
        const cy = divRect.top + divRect.height / 2
        const px = focusScreenPos.x
        const py = focusScreenPos.y
        const radius = this.dot.offsetWidth / 2
        const borderWidth = parseFloat(getComputedStyle(this.dot).borderWidth) || 0
        const edgeOffset = borderWidth * 0.5
        const dx = cx - px,
            dy = cy - py
        const dist = Math.sqrt(dx * dx + dy * dy)
        const dotInside = px >= divRect.left && px <= divRect.right && py >= divRect.top && py <= divRect.bottom
        const contentInDot = dist <= radius - edgeOffset

        if (dotInside || contentInDot) {
            this.line.style.display = 'none'
            return
        }

        this.line.style.display = 'block'
        let x2, y2
        if (py < divRect.top) {
            x2 = cx
            y2 = divRect.top
        } else if (py > divRect.bottom) {
            x2 = cx
            y2 = divRect.bottom
        } else if (px < divRect.left) {
            x2 = divRect.left
            y2 = cy
        } else {
            x2 = divRect.right
            y2 = cy
        }

        const dx2 = x2 - px,
            dy2 = y2 - py
        const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
        const scale = (radius - edgeOffset) / dist2
        this.line.setAttribute('x1', px + dx2 * scale)
        this.line.setAttribute('y1', py + dy2 * scale)
        this.line.setAttribute('x2', x2)
        this.line.setAttribute('y2', y2)
        this.line.setAttribute('stroke', this.data.dot.strokeColor)
    }

    updateTextContent(focusScreenPos, worldMatrix, containerRect, updateContent) {
        if (!this.data.text?.topLeft || !this.data.text?.botRight) return
        this.textContentSpan.innerHTML = this.data.text.content
        this.textContentSpan.style.textAlign = this.data.text.align || 'center'
        this.textContentSpan.style.color = this.data.text.color
        const contentWorldTL = new Vec3()
        const contentWorldBR = new Vec3()
        worldMatrix.transformPoint(this.data.text.topLeft, contentWorldTL)
        worldMatrix.transformPoint(this.data.text.botRight, contentWorldBR)
        const sTL = this.camera.worldToScreen(contentWorldTL, containerRect.width, containerRect.height)
        const sBR = this.camera.worldToScreen(contentWorldBR, containerRect.width, containerRect.height)
        const width = Math.abs(sBR.x - sTL.x)
        const height = Math.abs(sBR.y - sTL.y)

        this.div.style.fontWeight = this.data.text.bold ? 'bold' : 'normal'
        this.div.style.fontStyle = this.data.text.italic ? 'italic' : 'normal'
        this.div.style.fontFamily = `"${this.data.text.font}", sans-serif`
        this.div.style.backgroundColor = this.transparentColor(
            this.data.text.background,
            this.data.text.backgroundAlpha,
        )

        if (this.data.text.originHeight) {
            const fontSize = this.data.text.fontSize || 16
            const fontScale = Math.min(width / this.data.text.originWidth, height / this.data.text.originHeight, 2)
            this.div.style.fontSize = Math.max(Math.min(16, fontSize), Math.round(fontSize * fontScale)) + 'px'
        }

        if (!updateContent || !this.isDisplay) return

        const dotRect = this.dot.getBoundingClientRect()
        const outOfView =
            focusScreenPos.x + dotRect.width / 2 < 0 ||
            focusScreenPos.y + dotRect.height / 2 < 0 ||
            focusScreenPos.x - dotRect.width / 2 > window.innerWidth ||
            focusScreenPos.y - dotRect.height / 2 > window.innerHeight

        if (outOfView) {
            this.div.style.display = 'none'
            this.lineSvg.style.display = 'none'
            this.dot.style.display = 'none'
            return
        }

        const scaleWidth = Math.max(100, Math.min(width, (this.data.text.originWidth || 100) * 2))
        const scaleHeight = Math.max(32, Math.min(height, (this.data.text.originHeight || 32) * 2))
        this.div.style.left = Math.min(Math.max(sTL.x, 0), window.innerWidth - scaleWidth - 20) + 'px'
        this.div.style.top = Math.min(Math.max(sTL.y, 0), window.innerHeight - scaleHeight - 20) + 'px'
        this.div.style.width = scaleWidth + 'px'
        this.div.style.height = scaleHeight + 'px'
        this.div.style.display = 'flex'
        this.div.style.visibility = 'visible'
        this.lineSvg.style.display = 'block'
        this.dot.style.display = 'block'
    }

    // ── Show / Hide / Destroy ─────────────────
    show() {
        this.isDisplay = true
        this.div.style.display = 'flex'
        this.lineSvg.style.display = 'block'
        this.dot.style.display = 'block'
        if (this.hotspotBtn) this.hotspotBtn.setActiveColor()
        this.update()
    }

    hide() {
        this.isDisplay = false
        this.div.style.display = 'none'
        this.lineSvg.style.display = 'none'
        this.dot.style.display = 'none'
        if (this.hotspotBtn) this.hotspotBtn.setUnactiveColor()
    }

    destroy() {
        this.div.remove()
        this.dot.remove()
        this.lineSvg.remove()
    }

    // ── Drag events ──────────────────────────
    addDotDragEvents() {
        let dragging = false
        let startX = 0,
            startY = 0

        this.dot.addEventListener('pointerdown', (e) => {
            e.stopPropagation()
            dragging = true
            this.dot.setPointerCapture(e.pointerId)
            startX = e.clientX
            startY = e.clientY
            this.dot.style.cursor = 'grabbing'
        })

        this.dot.addEventListener('pointermove', (e) => {
            if (!dragging) return
            const newLeft = parseFloat(this.dot.style.left) + (e.clientX - startX)
            const newTop = parseFloat(this.dot.style.top) + (e.clientY - startY)
            this.dot.style.left = newLeft + 'px'
            this.dot.style.top = newTop + 'px'
            startX = e.clientX
            startY = e.clientY
            const r = this.dot.getBoundingClientRect()
            this.updateLine({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
        })

        this.dot.addEventListener('pointerup', (e) => {
            if (!dragging) return
            dragging = false
            this.dot.releasePointerCapture(e.pointerId)
            this.dot.style.cursor = 'grab'
            const screenX = parseFloat(this.dot.style.left) + this.dot.offsetWidth / 2
            const screenY = parseFloat(this.dot.style.top) + this.dot.offsetHeight / 2
            const newPos = pickModelLocalPoint(screenX, screenY, this.camera)
            if (newPos) this.data.focus.position = newPos.clone()
        })
    }

    addContentDragEvents() {
        const edgeSize = 8,
            minSize = 20

        this.div.addEventListener('pointermove', (e) => {
            if (this.dragging || this.resizing) return
            const rect = this.div.getBoundingClientRect()
            const onL = e.clientX < rect.left + edgeSize
            const onR = e.clientX > rect.right - edgeSize
            const onT = e.clientY < rect.top + edgeSize
            const onB = e.clientY > rect.bottom - edgeSize
            if ((onL && onT) || (onR && onB)) this.div.style.cursor = 'nwse-resize'
            else if ((onR && onT) || (onL && onB)) this.div.style.cursor = 'nesw-resize'
            else if (onL || onR) this.div.style.cursor = 'ew-resize'
            else if (onT || onB) this.div.style.cursor = 'ns-resize'
            else this.div.style.cursor = 'grab'
        })

        this.div.addEventListener('pointerdown', (e) => {
            e.stopPropagation()
            const rect = this.div.getBoundingClientRect()
            const onL = e.clientX < rect.left + edgeSize
            const onR = e.clientX > rect.right - edgeSize
            const onT = e.clientY < rect.top + edgeSize
            const onB = e.clientY > rect.bottom - edgeSize
            if (onL && onT) this.resizeEdge = 'top-left'
            else if (onR && onT) this.resizeEdge = 'top-right'
            else if (onL && onB) this.resizeEdge = 'bottom-left'
            else if (onR && onB) this.resizeEdge = 'bottom-right'
            else if (onL) this.resizeEdge = 'left'
            else if (onR) this.resizeEdge = 'right'
            else if (onT) this.resizeEdge = 'top'
            else if (onB) this.resizeEdge = 'bottom'

            if (this.resizeEdge) {
                this.resizing = true
                this.startX = e.clientX
                this.startY = e.clientY
                this.startWidth = this.div.offsetWidth
                this.startHeight = this.div.offsetHeight
                this.startLeft = this.div.offsetLeft
                this.startTop = this.div.offsetTop
            } else {
                this.dragging = true
                this.startX = e.clientX - this.div.offsetLeft
                this.startY = e.clientY - this.div.offsetTop
            }
            this.div.setPointerCapture(e.pointerId)
        })

        this.div.addEventListener('pointermove', (e) => {
            if (!this.dragging && !this.resizing) return
            if (this.dragging) {
                this.div.style.left = e.clientX - this.startX + 'px'
                this.div.style.top = e.clientY - this.startY + 'px'
            } else {
                const dx = e.clientX - this.startX
                const dy = e.clientY - this.startY
                let newL = this.startLeft,
                    newT = this.startTop
                let newW = this.startWidth,
                    newH = this.startHeight
                if (this.resizeEdge.includes('left')) {
                    newL = this.startLeft + dx
                    newW = this.startWidth - dx
                }
                if (this.resizeEdge.includes('right')) newW = this.startWidth + dx
                if (this.resizeEdge.includes('top')) {
                    newT = this.startTop + dy
                    newH = this.startHeight - dy
                }
                if (this.resizeEdge.includes('bottom')) newH = this.startHeight + dy
                if (newW >= minSize) {
                    this.div.style.left = newL + 'px'
                    this.div.style.width = newW + 'px'
                }
                if (newH >= minSize) {
                    this.div.style.top = newT + 'px'
                    this.div.style.height = newH + 'px'
                }
            }
            this.update(false)
        })

        this.div.addEventListener('pointerup', () => {
            this.dragging = false
            this.resizing = false
            this.resizeEdge = null
        })
    }

    transparentColor(color, alpha = 0.5) {
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
}
class HotspotManager {
    constructor({ camera, events, dom, editor, editable }) {
        this.camera = camera
        this.events = events
        this.editor = editor
        this.dom = dom
        this.editable = editable
        this.hotspots = []
        this.hotspotData = []

        this.activeHotspot = null
        this.activeData = null
        this.restoreData = null

        this.isAutoPlay = false
        this.intervalID = null
        this.listenEvents()
    }

    listenEvents() {
        this.events.on('hotspot:add', ({ position, entityInfo }) => {
            const data = this.createDefault(position, entityInfo)
            this.hotspotData.push(data)
            const h = new Hotspot(this.camera, this.dom, data)
            this.hotspots.push(h)
            this.events.fire('hotspot:editor-selected', data)
        })
        this.events.on('hotspot:editor-selected', (selected) => {
            this.activeData = selected
            this.activeHotspot = selected === null ? null : this.hotspots.find((h) => h.id === selected.id)
            this.update(true)
        })
        this.events.on('hotspot:editor-changed', (data) => {
            this.activeData = data
            this.update()
        })

        this.events.on('hotspot:delete', (id) => {
            const idx = this.hotspots.findIndex((h) => h.id === id)
            if (idx < 0) return
            this.hotspots[idx].destroy()
            if (this.activeHotspot?.id === id) this.activeHotspot = null
            this.hotspots.splice(idx, 1)
        })

        this.events.on('hotspot:reset', (id) => {
            const h = this.hotspots.find((h) => h.id === id)
            if (!h) return
            h.data.dot.topLeft = null
            h.data.dot.botRight = null
            h.update()
        })
    }
    createDefault(position, entityInfo) {
        return {
            id: guid.create(),
            autoPlay: {
                time: 3000,
            },
            button: {
                title: 'hotspot',
            },
            text: {
                color: 'black',
                bold: false,
                italic: false,
                align: 'center',
                content: 'hotspot',
                font: 'Lato',
                background: '#ffffff',
                backgroundAlpha: 0.8,
                originWidth: 0,
                originHeight: 0,
                topLeft: null,
                botRight: null,
                fontSize: 16,
            },
            focus: {
                position,
            },
            dot: {
                style: 'circle',
                strokeColor: 'white',
                stroke: 1,
                size: 30,
                topLeft: position,
                botRight: null,
            },
            entityInfo,
        }
    }
    setActive(hotspot, lerpDuration = 1.5) {
        if (!hotspot) return
        if (this.activeHotspot?.id !== hotspot.id) {
            this.activeHotspot?.hide()
        }
        this.activeHotspot = hotspot
        // this.orbitCamera.setupTransition({
        //     targetPose: this.getTargetPose(hotspot),
        //     startPose: this.getStartPose(),
        //     onTransitionFinished: () => hotspot.show(),
        //     lerpDuration,
        // })
    }

    setActiveById(id) {
        const h = this.hotspots.find((h) => h.id === id)
        if (h) this.setActive(h, HOTSPOT_FADE_TIME)
    }

    autoPlay() {
        if (this.hotspots.length === 0) return
        this.isAutoPlay = true
        const currentIdx = this.activeHotspot ? this.hotspots.findIndex((h) => h.id === this.activeHotspot.id) : -1
        const nextIdx = (currentIdx + 1) % this.hotspots.length
        const next = this.hotspots[nextIdx]
        this.setActive(next, AUTO_PLAY_LERP_TIME)
        this.intervalID = setTimeout(() => this.autoPlay(), next.data.autoPlay.time + AUTO_PLAY_LERP_TIME * 1000)
    }

    stopAutoPlay() {
        if (this.intervalID) {
            clearTimeout(this.intervalID)
            this.intervalID = null
        }
        this.isAutoPlay = false
    }

    hideAll() {
        this.hotspots.forEach((h) => h.hide())
        this.activeHotspot = null
    }

    update(updateEditor = false) {
        if (updateEditor) {
            const data = this.hotspotData.map((h) => {
                if (h.id === this.activeData?.id) return this.activeData
                return h
            })
            this.editor.render(data, this.activeData?.id)
        }
        this.hotspots.forEach((h) => {
            if (h.id === this.activeData?.id) {
                h.data = this.activeData
                h.show()
                h.update()
            } else {
                h.hide()
            }
        })
    }

    getStartPose() {
        return {
            focus: this.orbitCamera.focus.clone(),
            position: new Vec3(modelEntity.localPosition.x, modelEntity.localPosition.y, modelEntity.localPosition.z),
            rotation: modelEntity.localRotation.clone(),
            distance: this.orbitCamera.distance,
            yaw: this.orbitCamera.currentYaw,
            pitch: this.orbitCamera.currentPitch,
        }
    }

    getTargetPose(hotspot) {
        const { position: p, focus: f, rotation: r, distanceScale: d, yaw, pitch } = hotspot.data.entityInfo
        return {
            focus: this.orbitCamera.getActualFocus(f),
            position: new Vec3(p.x, p.y, p.z),
            rotation: new Quat(r.x, r.y, r.z, r.w),
            distance: this.orbitCamera.getActualDistance(d),
            yaw,
            pitch,
        }
    }
}
class HotspotEditorUI {
    isCreatingHotspot = false
    controllers = null
    constructor(body, { events, dom, state, camera }) {
        this.body = body
        this.camera = camera
        this.dom = dom
        this.events = events
        this.state = state
        this.expandedId = null
        this.listEl = null
        this.countEl = null
        events.on('controllers:created', (controllers) => {
            this.controllers = controllers
        })
    }

    mount() {
        this.renderHeader()
        this.listEl = document.createElement('div')
        this.listEl.classList.add('hotspot-list')
        this.body.appendChild(this.listEl)
        // this.render()
    }

    // ── Header ───────────────────────────────
    renderHeader() {
        const header = document.createElement('div')
        header.classList.add('hotspot-section-header')

        const titleGroup = document.createElement('div')
        const title = document.createElement('div')
        title.classList.add('hotspot-title')
        title.textContent = 'Product Hotspots'

        this.countEl = document.createElement('div')
        this.countEl.classList.add('hotspot-count')
        titleGroup.appendChild(title)
        titleGroup.appendChild(this.countEl)

        const addBtn = document.createElement('button')
        addBtn.classList.add('hotspot-add-btn')
        addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg> Add`
        addBtn.addEventListener('click', () => this.onAdd())

        header.appendChild(titleGroup)
        header.appendChild(addBtn)
        this.body.appendChild(header)
    }

    // ── Actions ──────────────────────────────
    onAdd() {
        document.body.style.cursor = 'crosshair'
        this.isCreatingHotspot = true
        this.events.on('pointerup', (e) => {
            if (!this.isCreatingHotspot) return
            const rect = this.dom.ui.getBoundingClientRect()
            const mouseX = e.clientX - rect.left
            const mouseY = e.clientY - rect.top
            const position = pickModelLocalPoint(mouseX, mouseY, this.camera.camera)
            const entityInfo = this.controllers[this.state.cameraMode].getEntityInfo()
            this.events.fire('hotspot:add', { position, entityInfo })
            document.body.style.cursor = 'default'
            this.isCreatingHotspot = false
        })
    }

    onDelete(id) {
        this.store.remove(id)
        if (this.expandedId === id) this.expandedId = null
        this.events.fire('hotspot:delete', id)
        // this.render()
    }

    onApply(draft) {
        this.store.update(draft.id, draft)
        this.events.fire('hotspot:update', draft)
        this.expandedId = draft.id
        // this.render()
    }

    // ── Render list ──────────────────────────
    render(hotspots, expandedId) {
        this.expandedId = expandedId
        this.listEl.innerHTML = ''
        this.countEl.textContent = `${hotspots.length} hotspot${hotspots.length !== 1 ? 's' : ''} configured`
        let editData = null
        hotspots.forEach((h) => {
            const isExpanded = this.expandedId === h.id
            const item = document.createElement('div')
            item.classList.add('hotspot-item')
            if (isExpanded) item.classList.add('expanded')
            item.appendChild(this.renderItemHeader(h, isExpanded))
            if (isExpanded) {
                editData = h
                item.appendChild(this.renderEditPanel(h))
            }
            this.listEl.appendChild(item)
        })
    }

    renderItemHeader(h, isExpanded) {
        const row = document.createElement('div')
        row.classList.add('hotspot-header')

        const name = document.createElement('div')
        name.classList.add('hotspot-header-name')
        name.textContent = h.button?.title || 'Hotspot'

        const actions = document.createElement('div')
        actions.classList.add('hotspot-header-actions')

        const editBtn = this.makeIconBtn(
            `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
        )
        if (isExpanded) editBtn.classList.add('active')
        editBtn.title = 'Edit'
        editBtn.addEventListener('click', () => {
            this.events.fire('hotspot:editor-selected', isExpanded ? null : h)
        })

        const resetBtn = this.makeIconBtn(
            `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 6.5A4.5 4.5 0 0 1 10.5 3.5M11 6.5A4.5 4.5 0 0 1 2.5 9.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M8.5 3H11V5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 10H2V7.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        )
        resetBtn.title = 'Reset'
        resetBtn.addEventListener('click', () => this.events.fire('hotspot:reset', h.id))

        const delBtn = this.makeIconBtn(
            `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3H10.5M4.5 3V2H7.5V3M2.5 3L3 10H9L9.5 3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            'del',
        )
        delBtn.title = 'Delete'
        delBtn.addEventListener('click', () => this.onDelete(h.id))

        actions.appendChild(editBtn)
        actions.appendChild(resetBtn)
        actions.appendChild(delBtn)
        row.appendChild(name)
        row.appendChild(actions)
        return row
    }
    renderEditPanel(h) {
        const draft = JSON.parse(JSON.stringify(h))
        const panel = document.createElement('div')
        panel.classList.add('hotspot-edit-panel')
        const applyDraft = () => {
            this.events.fire('hotspot:editor-changed', { ...draft })
        }
        // GROUP: Text
        const textGroup = this.makeGroup('Text')
        const labelField = this.makeField('Label')
        const formatRow = document.createElement('div')
        formatRow.classList.add('hotspot-label-row')
        formatRow.appendChild(this.makeFormatBtn('<b>B</b>', 'bold', draft, applyDraft))
        formatRow.appendChild(this.makeFormatBtn('<i>I</i>', 'italic', draft, applyDraft))

        const alignIcons = {
            left: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="0" y="1" width="14" height="2" rx="1"/>
                <rect x="0" y="5" width="9" height="2" rx="1"/>
                <rect x="0" y="9" width="12" height="2" rx="1"/>
            </svg>`,
            center: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="0" y="1" width="14" height="2" rx="1"/>
                <rect x="2.5" y="5" width="9" height="2" rx="1"/>
                <rect x="1" y="9" width="12" height="2" rx="1"/>
            </svg>`,
            right: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="0" y="1" width="14" height="2" rx="1"/>
                <rect x="5" y="5" width="9" height="2" rx="1"/>
                <rect x="2" y="9" width="12" height="2" rx="1"/>
            </svg>`,
        }

        ;['left', 'center', 'right'].forEach((align) => {
            const btn = document.createElement('button')
            btn.classList.add('fmt-btn')
            btn.innerHTML = alignIcons[align]
            if ((draft.text.align || 'center') === align) btn.classList.add('active')
            btn.dataset.align = align
            btn.addEventListener('click', () => {
                draft.text.align = align
                formatRow.querySelectorAll('.fmt-btn[data-align]').forEach((b) => b.classList.remove('active'))
                btn.classList.add('active')
                applyDraft()
            })
            formatRow.appendChild(btn)
        })

        const labelRow = document.createElement('div')
        labelRow.classList.add('hotspot-label-row')
        labelRow.appendChild(
            this.makeTextarea(draft.text.content, {
                placeholder: 'Enter label...',
                classname: 'hotspot-text',
                name: h.text.content,
                onChange: (v) => {
                    draft.text.content = v
                    applyDraft()
                },
            }),
        )

        labelField.appendChild(formatRow)
        labelField.appendChild(labelRow)
        textGroup.appendChild(labelField)

        const colorGrid = this.makeGrid(3)
        colorGrid.style.marginTop = '7px'
        const colorField = this.makeField('Color')
        colorField.appendChild(
            this.makeColorSwatch(draft.text.color, (v) => {
                draft.text.color = v
                applyDraft()
            }),
        )
        const bgField = this.makeField('Background')
        bgField.appendChild(
            this.makeColorSwatch(draft.text.background, (v) => {
                draft.text.background = v
                applyDraft()
            }),
        )
        const alphaField = this.makeField('Alpha')
        alphaField.appendChild(
            this.makeInput('number', draft.text.backgroundAlpha, {
                min: 0,
                max: 1,
                step: 0.1,
                name: 'anpha',
                onChange: (v) => {
                    draft.text.backgroundAlpha = parseFloat(v)
                    applyDraft()
                },
            }),
        )
        colorGrid.appendChild(colorField)
        colorGrid.appendChild(bgField)
        colorGrid.appendChild(alphaField)
        textGroup.appendChild(colorGrid)

        const fontGrid = this.makeGrid(2)
        fontGrid.style.marginTop = '7px'
        const fontSizeField = this.makeField('Font size')
        fontSizeField.appendChild(
            this.makeInput('number', draft.text.fontSize, {
                min: 8,
                max: 72,
                name: 'font-size',
                onChange: (v) => {
                    draft.text.fontSize = parseInt(v)
                    applyDraft()
                },
            }),
        )
        const fontFamilyField = this.makeField('Font')
        fontFamilyField.appendChild(
            this.makeSelect(
                ['Lato', 'Roboto', 'Open Sans', 'Montserrat'],
                draft.text.font,
                (v) => {
                    draft.text.font = v
                    applyDraft()
                },
                {
                    name: 'font-family',
                },
            ),
        )
        fontGrid.appendChild(fontSizeField)
        fontGrid.appendChild(fontFamilyField)
        textGroup.appendChild(fontGrid)
        panel.appendChild(textGroup)

        // GROUP: Hotspot
        const hotspotGroup = this.makeGroup('Hotspot')
        const styleField = this.makeField('Style')
        const styleRow = document.createElement('div')
        styleRow.classList.add('hotspot-style-row')
        ;['circle', 'dot'].forEach((opt) => {
            const btn = document.createElement('div')
            btn.classList.add('hotspot-style-btn')
            if (draft.dot.style === opt) btn.classList.add('active')
            btn.textContent = opt.charAt(0).toUpperCase() + opt.slice(1)
            btn.addEventListener('click', () => {
                draft.dot.style = opt
                styleRow.querySelectorAll('.hotspot-style-btn').forEach((b) => b.classList.toggle('active', b === btn))
                applyDraft()
            })
            styleRow.appendChild(btn)
        })
        styleField.appendChild(styleRow)
        hotspotGroup.appendChild(styleField)

        const dotGrid = this.makeGrid(2)
        dotGrid.style.marginTop = '7px'
        const sizeField = this.makeField('Size (px)')
        sizeField.appendChild(
            this.makeInput('number', draft.dot.size, {
                min: 10,
                max: 80,
                name: 'dot-size',
                onChange: (v) => {
                    draft.dot.size = parseInt(v)
                    applyDraft()
                },
            }),
        )
        const strokeField = this.makeField('Stroke width')
        strokeField.appendChild(
            this.makeInput('number', draft.dot.stroke, {
                min: 0,
                max: 10,
                step: 0.5,
                name: 'stroke-width',
                onChange: (v) => {
                    draft.dot.stroke = parseFloat(v)
                    applyDraft()
                },
            }),
        )
        dotGrid.appendChild(sizeField)
        dotGrid.appendChild(strokeField)
        hotspotGroup.appendChild(dotGrid)

        const strokeColorField = this.makeField('Stroke color')
        strokeColorField.style.marginTop = '7px'
        strokeColorField.appendChild(
            this.makeColorSwatch(draft.dot.strokeColor, (v) => {
                draft.dot.strokeColor = v
                applyDraft()
            }),
        )
        hotspotGroup.appendChild(strokeColorField)
        panel.appendChild(hotspotGroup)

        // GROUP: Auto Play + Button
        const bottomGrid = document.createElement('div')
        bottomGrid.classList.add('hotspot-autoplay')

        const autoPlayGroup = this.makeGroup('Auto Play')
        const timeField = this.makeField('Time (ms)')
        timeField.appendChild(
            this.makeInput('number', draft.autoPlay.time, {
                min: 0,
                step: 500,
                name: 'play-time',
                onChange: (v) => {
                    draft.autoPlay.time = parseInt(v)
                    applyDraft()
                },
            }),
        )
        autoPlayGroup.appendChild(timeField)

        const buttonGroup = this.makeGroup('Button')
        const btnTitleField = this.makeField('Title')
        btnTitleField.appendChild(
            this.makeInput('text', draft.button.title, {
                placeholder: 'Title...',
                name: 'button-title',
                onChange: (v) => {
                    draft.button.title = v
                    applyDraft()
                },
            }),
        )
        buttonGroup.appendChild(btnTitleField)

        bottomGrid.appendChild(autoPlayGroup)
        bottomGrid.appendChild(buttonGroup)
        panel.appendChild(bottomGrid)

        // Apply / Cancel
        // const applyRow = document.createElement('div')
        // applyRow.style.cssText = 'display:flex; gap:6px;'

        // const cancelBtn = document.createElement('button')
        // cancelBtn.classList.add('hotspot-cancel-btn')
        // cancelBtn.style.flex = '1'
        // cancelBtn.textContent = 'Cancel'
        // cancelBtn.addEventListener('click', () => {
        //     this.expandedId = null
        //     this.render()
        // })

        // const applyBtn = document.createElement('button')
        // applyBtn.classList.add('hotspot-apply-btn')
        // applyBtn.style.flex = '1'
        // applyBtn.textContent = 'Apply'
        // applyBtn.addEventListener('click', () => this.onApply(draft))

        // applyRow.appendChild(applyBtn)
        // applyRow.appendChild(cancelBtn)
        // panel.appendChild(applyRow)
        return panel
    }
    makeTextarea(value, opts = {}) {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.classList.add('textarea-field')
        const autoResize = () => {
            textarea.style.height = 'auto'
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
        }
        textarea.addEventListener('input', () => {
            autoResize()
            if (opts.onChange) opts.onChange(textarea.value)
        })

        requestAnimationFrame(autoResize)
        if (opts.name) textarea.name = opts.name
        if (opts.classname) textarea.classList.add(opts.classname)
        if (opts.placeholder) textarea.placeholder = opts.placeholder
        return textarea
    }
    makeGroup(title) {
        const g = document.createElement('div')
        g.classList.add('hotspot-group')
        const t = document.createElement('div')
        t.classList.add('hotspot-group-title')
        t.textContent = title
        g.appendChild(t)
        return g
    }

    makeField(label) {
        const wrap = document.createElement('div')
        wrap.classList.add('hotspot-field')
        const lbl = document.createElement('div')
        lbl.classList.add('hotspot-label')
        lbl.textContent = label
        wrap.appendChild(lbl)
        return wrap
    }

    makeGrid(variant) {
        const grid = document.createElement('div')
        grid.classList.add(variant === 3 ? 'hotspot-grid-3' : 'hotspot-grid-2')
        return grid
    }

    makeInput(type, value, opts = {}) {
        const input = document.createElement('input')
        input.type = type
        input.value = value
        input.classList.add('input-field')
        if (opts.min !== undefined) input.min = opts.min
        if (opts.name) input.name = opts.name
        if (opts.max !== undefined) input.max = opts.max
        if (opts.step !== undefined) input.step = opts.step
        if (opts.placeholder) input.placeholder = opts.placeholder
        if (opts.onChange)
            input.addEventListener('input', (e) => {
                e.stopPropagation()
                opts.onChange(input.value)
            })
        return input
    }

    makeSelect(options, value, onChange, opts = {}) {
        const select = document.createElement('select')
        select.classList.add('input-field', 'select-field')
        if (opts.name) select.name = opts.name
        options.forEach((opt) => {
            const el = document.createElement('option')
            el.value = el.textContent = opt
            if (opt === value) el.selected = true
            select.appendChild(el)
        })
        select.addEventListener('change', () => onChange(select.value))
        return select
    }

    makeColorSwatch(value, onChange) {
        const label = document.createElement('label')
        label.classList.add('color-swatch')
        label.style.background = value
        const input = document.createElement('input')
        input.type = 'color'
        input.value = value
        input.style.cssText =
            'position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);opacity:0;cursor:pointer;'
        input.addEventListener('input', () => {
            label.style.background = input.value
            onChange(input.value)
        })
        label.appendChild(input)
        return label
    }

    makeFormatBtn(char, key, draft, onChange) {
        const btn = document.createElement('button')
        btn.classList.add('fmt-btn')
        if (draft.text[key]) btn.classList.add('active')
        btn.innerHTML = char
        btn.addEventListener('click', () => {
            draft.text[key] = !draft.text[key]
            btn.classList.toggle('active', draft.text[key])
            onChange()
        })
        return btn
    }

    makeIconBtn(svgPath, variant = '') {
        const btn = document.createElement('button')
        btn.classList.add('icon-btn')
        if (variant) btn.classList.add(variant)
        btn.innerHTML = svgPath
        return btn
    }
}
