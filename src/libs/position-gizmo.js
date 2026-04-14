class PointGizmo {
    _enabled = false
    _dragging = false
    _activeAxis = null
    _svg = null
    _axes = {}
    _dot = null
    _pivotLocal = null
    _updateFn = null
    _prevMouse = null
    _dragAxisWorld = null

    static CONFIG = {
        colors: { x: '#e85555', y: '#55cc55', z: '#5588ff' }, // Axis colors for X, Y, Z
        axisLength: 90, // Axis line length in screen pixels
        lineWidth: 4, // Default stroke width of axis line
        lineOpacity: 0.9, // Default opacity of axis line
        hitWidth: 16, // Invisible hit area width for pointer events
        arrowSizeNormal: 11, // Arrowhead size in default state
        arrowSizeActive: 15, // Arrowhead size when hovered or dragging
        dotRadius: 5, // Radius of the center origin dot
        lineWidthActive: 4, // Stroke width when axis is active/hovered
        lineOpacityInactive: 0.25, // Opacity of inactive axes during hover/drag
        fontSize: 12, // Font size of axis labels (X, Y, Z)
    }

    constructor(app, camEntity, modelEntity, { onMove, onEnd } = {}) {
        this._app = app
        this._camEntity = camEntity
        this._modelEntity = modelEntity
        this._canvas = app.graphicsDevice.canvas
        this._onMove = onMove
        this._onEnd = onEnd
        this._buildSVG()
        this._svg.style.display = 'none'
    }

    _buildSVG() {
        const cfg = PointGizmo.CONFIG
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;z-index:501;pointer-events:none;`
        this._canvas.parentElement.appendChild(svg)
        this._svg = svg

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        dot.setAttribute('r', cfg.dotRadius)
        dot.setAttribute('fill', 'white')
        dot.setAttribute('stroke', 'rgba(0,0,0,0.4)')
        dot.setAttribute('stroke-width', '1.5')
        dot.style.pointerEvents = 'none'
        svg.appendChild(dot)
        this._dot = dot

        for (const axis of ['x', 'y', 'z']) {
            const color = PointGizmo.CONFIG.colors[axis]

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
            line.setAttribute('stroke', color)
            line.setAttribute('stroke-width', cfg.lineWidth)
            line.setAttribute('stroke-opacity', cfg.lineOpacity)
            line.setAttribute('stroke-linecap', 'round')

            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'line')
            hit.setAttribute('stroke', 'transparent')
            hit.setAttribute('stroke-width', cfg.hitWidth)
            hit.style.cursor = 'grab'
            hit.style.pointerEvents = 'stroke'

            const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
            arrow.setAttribute('fill', color)
            arrow.style.pointerEvents = 'none'

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            text.textContent = axis.toUpperCase()
            text.setAttribute('fill', color)
            text.setAttribute('font-size', cfg.fontSize)
            text.setAttribute('font-family', 'system-ui, sans-serif')
            text.setAttribute('font-weight', '600')
            text.setAttribute('text-anchor', 'middle')
            text.setAttribute('dominant-baseline', 'central')
            text.style.pointerEvents = 'none'
            text.style.userSelect = 'none'

            svg.appendChild(line)
            svg.appendChild(arrow)
            svg.appendChild(hit)
            svg.appendChild(text)

            hit.addEventListener('pointerenter', () => {
                if (this._dragging) return
                this._highlightOnly(axis)
            })
            hit.addEventListener('pointerleave', () => {
                if (this._dragging) return
                this._resetStyle()
            })
            hit.addEventListener('pointerdown', (e) => {
                if (e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()
                hit.setPointerCapture(e.pointerId)
                this._startDrag(axis, e.clientX, e.clientY)
            })
            hit.addEventListener('pointermove', (e) => {
                if (!this._dragging || this._activeAxis !== axis) return
                e.preventDefault()
                this._onDrag(e.clientX, e.clientY)
            })
            hit.addEventListener('pointerup', () => {
                if (!this._dragging) return
                this._endDrag()
            })

            this._axes[axis] = { line, hit, arrow, text }
        }
    }

    _w2s(v3) {
        const out = new Vec3()
        this._camEntity.camera.worldToScreen(v3, out)
        return { x: out.x, y: out.y }
    }

    _worldAxisDir(axis) {
        const dirs = { x: new Vec3(1, 0, 0), y: new Vec3(0, 1, 0), z: new Vec3(0, 0, 1) }
        const dir = dirs[axis]
        this._modelEntity.getRotation().transformVector(dir, dir)
        return dir.normalize()
    }

    _pivotWorldPos() {
        if (!this._pivotLocal) return null
        const worldPos = new Vec3()
        this._modelEntity.getWorldTransform().transformPoint(this._pivotLocal, worldPos)
        return worldPos
    }

    _axisLength() {
        const worldPos = this._pivotWorldPos()
        if (!worldPos) return 1
        const camPos = this._camEntity.getPosition()
        const dist = new Vec3().copy(worldPos).sub(camPos).length()
        const fovRad = (this._camEntity.camera.fov * Math.PI) / 180
        const ppu = this._canvas.clientHeight / 2 / Math.tan(fovRad / 2) / dist
        return PointGizmo.CONFIG.axisLength / ppu
    }

    _update() {
        if (!this._enabled || !this._pivotLocal) return
        const worldPos = this._pivotWorldPos()
        if (!worldPos) return
        const cfg = PointGizmo.CONFIG
        const center = this._w2s(worldPos)
        this._dot.setAttribute('cx', center.x.toFixed(1))
        this._dot.setAttribute('cy', center.y.toFixed(1))

        const len = this._axisLength()

        for (const axis of ['x', 'y', 'z']) {
            const { line, hit, arrow, text } = this._axes[axis]
            const dir = this._worldAxisDir(axis)
            const tipWorld = new Vec3(worldPos.x + dir.x * len, worldPos.y + dir.y * len, worldPos.z + dir.z * len)
            const tip = this._w2s(tipWorld)

            line.setAttribute('x1', center.x.toFixed(1))
            line.setAttribute('y1', center.y.toFixed(1))
            line.setAttribute('x2', tip.x.toFixed(1))
            line.setAttribute('y2', tip.y.toFixed(1))

            hit.setAttribute('x1', center.x.toFixed(1))
            hit.setAttribute('y1', center.y.toFixed(1))
            hit.setAttribute('x2', tip.x.toFixed(1))
            hit.setAttribute('y2', tip.y.toFixed(1))

            const dx = tip.x - center.x
            const dy = tip.y - center.y
            const dlen = Math.sqrt(dx * dx + dy * dy) || 1
            const nx = dx / dlen
            const ny = dy / dlen
            const px = -ny
            const py = nx
            const as =
                this._activeHover === axis || this._activeAxis === axis ? cfg.arrowSizeActive : cfg.arrowSizeNormal
            arrow.setAttribute(
                'points',
                [
                    `${(tip.x + nx * as).toFixed(1)},${(tip.y + ny * as).toFixed(1)}`,
                    `${(tip.x - nx * as * 0.3 + px * as * 0.5).toFixed(1)},${(tip.y - ny * as * 0.3 + py * as * 0.5).toFixed(1)}`,
                    `${(tip.x - nx * as * 0.3 - px * as * 0.5).toFixed(1)},${(tip.y - ny * as * 0.3 - py * as * 0.5).toFixed(1)}`,
                ].join(' '),
            )
        }

        this._app.renderNextFrame = true
    }

    _startDrag(axis, cx, cy) {
        if (!this._pivotLocal) return
        this._dragging = true
        this._activeAxis = axis
        this._prevMouse = { x: cx, y: cy }
        this._dragAxisWorld = this._worldAxisDir(axis)
        this._highlightOnly(axis)
        document.body.style.cursor = 'grabbing'
    }

    _onDrag(cx, cy) {
        if (!this._dragging || !this._pivotLocal) return
        const dx = cx - this._prevMouse.x
        const dy = cy - this._prevMouse.y
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return

        const worldPos = this._pivotWorldPos()
        const center = this._w2s(worldPos)
        const axisDir = this._dragAxisWorld

        const tipScr = this._w2s(new Vec3(worldPos.x + axisDir.x, worldPos.y + axisDir.y, worldPos.z + axisDir.z))
        const axScr = { x: tipScr.x - center.x, y: tipScr.y - center.y }
        const axLen = Math.sqrt(axScr.x ** 2 + axScr.y ** 2) || 1
        const axNorm = { x: axScr.x / axLen, y: axScr.y / axLen }
        const dot = dx * axNorm.x + dy * axNorm.y

        const invWorld = new Mat4().copy(this._modelEntity.getWorldTransform()).invert()
        const axisLocal = new Vec3()
        invWorld.transformVector(axisDir, axisLocal)
        const localScale = axisLocal.length()
        axisLocal.normalize()

        const delta = dot / axLen / localScale
        this._pivotLocal.x += axisLocal.x * delta
        this._pivotLocal.y += axisLocal.y * delta
        this._pivotLocal.z += axisLocal.z * delta

        this._prevMouse = { x: cx, y: cy }
        this._onMove?.({ x: this._pivotLocal.x, y: this._pivotLocal.y, z: this._pivotLocal.z })
        this._app.renderNextFrame = true
    }

    _endDrag() {
        this._dragging = false
        this._activeAxis = null
        this._prevMouse = null
        this._dragAxisWorld = null
        this._resetStyle()
        document.body.style.cursor = ''
        if (this._pivotLocal) {
            this._onEnd?.({ x: this._pivotLocal.x, y: this._pivotLocal.y, z: this._pivotLocal.z })
        }
    }

    _highlightOnly(activeAxis) {
        const cfg = PointGizmo.CONFIG
        this._activeHover = activeAxis
        for (const [id, { line, arrow }] of Object.entries(this._axes)) {
            const active = id === activeAxis
            line.setAttribute('stroke-width', active ? cfg.lineWidthActive : cfg.lineWidth)
            line.setAttribute('stroke-opacity', active ? cfg.lineOpacity : cfg.lineOpacityInactive)
            arrow.setAttribute('opacity', active ? '1' : cfg.lineOpacityInactive)
        }
    }

    _resetStyle() {
        const cfg = PointGizmo.CONFIG
        this._activeHover = null
        for (const { line, arrow } of Object.values(this._axes)) {
            line.setAttribute('stroke-width', cfg.lineWidth)
            line.setAttribute('stroke-opacity', cfg.lineOpacity)
            arrow.setAttribute('opacity', '1')
        }
    }

    get isDragging() {
        return this._dragging
    }

    get position() {
        return this._pivotLocal ? { x: this._pivotLocal.x, y: this._pivotLocal.y, z: this._pivotLocal.z } : null
    }

    setPosition(localPos) {
        this._pivotLocal = localPos ? new Vec3(localPos.x, localPos.y, localPos.z) : null
    }

    enable() {
        this._enabled = true
        this._svg.style.display = ''
        this._updateFn = () => this._update()
        this._app.on('update', this._updateFn)
    }

    disable() {
        this._enabled = false
        this._dragging = false
        this._svg.style.display = 'none'
        if (this._updateFn) this._app.off('update', this._updateFn)
        document.body.style.cursor = ''
    }
}
