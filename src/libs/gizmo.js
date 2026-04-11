class RotationGizmo {
    _enabled    = false
    _dragging   = false
    _activeAxis = null
    _prevAngle  = 0
    _svg        = null
    _paths      = {}
    _app        = null
    _camEntity  = null
    _canvas     = null
    _snapshot   = null
    _modelEntity = null

    static SCREEN_RADIUS = 70
    static COLORS = { x: '#ff4d4d', y: '#4dff4d', z: '#4d4dff' }
    static LABELS = { x: 'X', y: 'Y', z: 'Z' }
    // Mỗi trục chiếm 120 độ, lệch nhau 120 độ
    static ANGLES = {
        x: { start: -60, end: 60 },    // -60° -> 60°
        y: { start: 60, end: 180 },    // 60° -> 180°
        z: { start: 180, end: 300 }    // 180° -> 300°
    }

    constructor(app, camEntity, events, modelEntity) {
        this._app = app
        this._camEntity = camEntity
        this._events = events
        this._canvas = app.graphicsDevice.canvas
        this._modelEntity = modelEntity
        this._buildSVG()
        this._svg.style.display = 'none'
        console.log('RotationGizmo initialized with modelEntity', modelEntity)
    }

    _buildSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
            z-index: 500;
            pointer-events: none;
        `
        this._canvas.parentElement.appendChild(svg)
        this._svg = svg

        for (const axis of ['x', 'y', 'z']) {
            const color = RotationGizmo.COLORS[axis]
            const label = RotationGizmo.LABELS[axis]
            const angles = RotationGizmo.ANGLES[axis]

            // Đường cong (cung tròn)
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            path.setAttribute('fill', 'none')
            path.setAttribute('stroke', color)
            path.setAttribute('stroke-width', '3')
            path.setAttribute('stroke-linecap', 'round')

            // Vùng hit (dày hơn)
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            hit.setAttribute('fill', 'none')
            hit.setAttribute('stroke', 'transparent')
            hit.setAttribute('stroke-width', '20')
            hit.style.cursor = 'grab'
            hit.style.pointerEvents = 'stroke'

            // Nhãn
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            text.textContent = label
            text.setAttribute('fill', color)
            text.setAttribute('font-size', '13')
            text.setAttribute('font-family', 'monospace')
            text.setAttribute('font-weight', 'bold')
            text.setAttribute('text-anchor', 'middle')
            text.setAttribute('dominant-baseline', 'central')
            text.style.pointerEvents = 'none'
            text.style.userSelect = 'none'

            svg.appendChild(path)
            svg.appendChild(hit)
            svg.appendChild(text)

            // Hover
            hit.addEventListener('mouseenter', () => {
                if (this._dragging) return
                path.setAttribute('stroke-width', '5')
                this._highlightOnly(axis)
            })
            hit.addEventListener('mouseleave', () => {
                if (this._dragging) return
                this._resetStyle()
            })

            // Drag start
            hit.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return
                e.preventDefault()
                e.stopPropagation()
                this._startDrag(axis, e.clientX, e.clientY)
            })

            this._paths[axis] = { path, hit, text, angles }
        }

        window.addEventListener('mousemove', (e) => {
            if (!this._dragging) return
            e.preventDefault()
            this._onDrag(e.clientX, e.clientY)
        })
        window.addEventListener('mouseup', () => {
            if (!this._dragging) return
            this._endDrag()
        })
    }

    _w2s(wx, wy, wz) {
        const sc = new Vec3()
        this._camEntity.camera.worldToScreen(new Vec3(wx, wy, wz), sc)
        return { x: sc.x, y: sc.y }
    }

    _computeArcPath(worldCenter, axis, angles) {
        const R = this._worldRadius()
        const cx = worldCenter.x, cy = worldCenter.y, cz = worldCenter.z
        let u, v
        if (axis === 'x') { u = new Vec3(0, 1, 0); v = new Vec3(0, 0, 1) }
        if (axis === 'y') { u = new Vec3(1, 0, 0); v = new Vec3(0, 0, 1) }
        if (axis === 'z') { u = new Vec3(1, 0, 0); v = new Vec3(0, 1, 0) }

        const startRad = angles.start * Math.PI / 180
        const endRad = angles.end * Math.PI / 180
        const steps = 48
        let points = []
        for (let i = 0; i <= steps; i++) {
            const t = startRad + (i / steps) * (endRad - startRad)
            const px = cx + (Math.cos(t) * u.x + Math.sin(t) * v.x) * R
            const py = cy + (Math.cos(t) * u.y + Math.sin(t) * v.y) * R
            const pz = cz + (Math.cos(t) * u.z + Math.sin(t) * v.z) * R
            const screen = this._w2s(px, py, pz)
            points.push(screen)
        }
        if (points.length < 2) return ''
        let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
        for (let i = 1; i < points.length; i++) d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`
        return d
    }

    _worldRadius() {
        if (!this._modelEntity) return 1
        const worldPos = this._modelEntity.getPosition()
        const camPos = this._camEntity.getPosition()
        const dist = new Vec3().copy(worldPos).sub(camPos).length()
        const cam = this._camEntity.camera
        const ch = this._app.graphicsDevice.clientRect.height
        const fovRad = (cam.fov * Math.PI) / 180
        const ppu = (ch / 2) / Math.tan(fovRad / 2) / dist
        return RotationGizmo.SCREEN_RADIUS / ppu
    }

    _update() {
        if (!this._enabled || !this._modelEntity) return
        const worldPos = this._modelEntity.getPosition()
        for (const axis of ['x', 'y', 'z']) {
            const { path, hit, text, angles } = this._paths[axis]
            const pathData = this._computeArcPath(worldPos, axis, angles)
            path.setAttribute('d', pathData)
            hit.setAttribute('d', pathData)

            // Vị trí nhãn: ở giữa cung, cách tâm một đoạn = R + 15
            const midAngle = (angles.start + angles.end) / 2 * Math.PI / 180
            const R = this._worldRadius() + 15
            let u, v
            if (axis === 'x') { u = new Vec3(0, 1, 0); v = new Vec3(0, 0, 1) }
            if (axis === 'y') { u = new Vec3(1, 0, 0); v = new Vec3(0, 0, 1) }
            if (axis === 'z') { u = new Vec3(1, 0, 0); v = new Vec3(0, 1, 0) }
            const px = worldPos.x + (Math.cos(midAngle) * u.x + Math.sin(midAngle) * v.x) * R
            const py = worldPos.y + (Math.cos(midAngle) * u.y + Math.sin(midAngle) * v.y) * R
            const pz = worldPos.z + (Math.cos(midAngle) * u.z + Math.sin(midAngle) * v.z) * R
            const labelPos = this._w2s(px, py, pz)
            text.setAttribute('x', labelPos.x.toFixed(1))
            text.setAttribute('y', labelPos.y.toFixed(1))
        }
        this._app.renderNextFrame = true
    }

    _startDrag(axis, cx, cy) {
        if (!this._modelEntity) return
        this._dragging = true
        this._activeAxis = axis
        const worldPos = this._modelEntity.getPosition()
        const center = this._w2s(worldPos.x, worldPos.y, worldPos.z)
        this._prevAngle = Math.atan2(cy - center.y, cx - center.x)
        for (const [id, { path }] of Object.entries(this._paths)) {
            path.setAttribute('stroke-width', id === axis ? '5' : '2')
            path.setAttribute('stroke-opacity', id === axis ? '1' : '0.3')
        }
    }

    _onDrag(cx, cy) {
        if (!this._dragging || !this._modelEntity) return
        const worldPos = this._modelEntity.getPosition()
        const center = this._w2s(worldPos.x, worldPos.y, worldPos.z)
        const angle = Math.atan2(cy - center.y, cx - center.x)
        let delta = angle - this._prevAngle
        this._prevAngle = angle
        delta *= 1.5 // độ nhạy

        console.log(`Dragging ${this._activeAxis} - delta:`, delta) // Kiểm tra console

        const sign = this._axisSign(this._activeAxis)
        const axisVec = new Vec3(
            this._activeAxis === 'x' ? 1 : 0,
            this._activeAxis === 'y' ? 1 : 0,
            this._activeAxis === 'z' ? 1 : 0,
        )
        const rot = new Quat().setFromAxisAngle(axisVec, delta * sign * 50)
        const pivot = this._modelEntity.getPosition()

        const curRot = this._modelEntity.localRotation.clone()
        const newRot = rot.clone().mul(curRot).normalize()
        this._modelEntity.localRotation.copy(newRot)

        // Nếu muốn xoay quanh tâm model (không làm thay đổi vị trí)
        // Không cần cập nhật localPosition nếu xoay quanh tâm
        // Dòng dưới giữ nguyên vị trí
        this._modelEntity.localPosition.copy(pivot)

        this._modelEntity.syncHierarchy()
        this._app.renderNextFrame = true
    }

    _axisSign(axis) {
        const camPos = this._camEntity.getPosition()
        const modelPos = this._modelEntity.getPosition()
        const dir = new Vec3().copy(camPos).sub(modelPos).normalize()
        if (axis === 'x') return dir.x >= 0 ? 1 : -1
        if (axis === 'y') return dir.y >= 0 ? 1 : -1
        return dir.z >= 0 ? 1 : -1
    }

    _endDrag() {
        this._dragging = false
        this._activeAxis = null
        this._resetStyle()
    }

    _highlightOnly(activeAxis) {
        for (const [id, { path }] of Object.entries(this._paths)) {
            path.setAttribute('stroke-width', id === activeAxis ? '5' : '2.5')
            path.setAttribute('stroke-opacity', id === activeAxis ? '1' : '0.4')
        }
    }

    _resetStyle() {
        for (const { path } of Object.values(this._paths)) {
            path.setAttribute('stroke-width', '3')
            path.setAttribute('stroke-opacity', '0.85')
        }
    }

    get isDragging() { return this._dragging }

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
    }

    saveSnapshot() {
        if (!this._modelEntity) return
        this._snapshot = {
            rot: this._modelEntity.localRotation.clone(),
            pos: this._modelEntity.localPosition.clone()
        }
    }

    restoreSnapshot() {
        if (!this._modelEntity || !this._snapshot) return
        this._modelEntity.localRotation.copy(this._snapshot.rot)
        this._modelEntity.localPosition.copy(this._snapshot.pos)
        this._modelEntity.syncHierarchy()
        this._app.renderNextFrame = true
        this._snapshot = null
    }
}