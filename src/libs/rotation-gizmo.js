class EntityRotatable {
    constructor(entity) {
        this._entity = entity
    }
    getPosition() { return this._entity.getPosition() }
    getRotation() { return this._entity.getRotation() }
    applyRotation(quatDelta) {
        const cur = this._entity.getRotation()
        const next = new Quat().mul2(quatDelta, cur).normalize()
        this._entity.setRotation(next)
    }
    getEuler() { return this._entity.getLocalEulerAngles(new Vec3()) }
}
class RotationGizmo {
    _enabled = false
    _dragging = false
    _activeAxis = null
    _prevAngle = 0
    _svg = null
    _rings = {}
    _app = null
    _camEntity = null
    _canvas = null
    _snapshot = null
    _target = null
    _eventName = ""

    static SCREEN_RADIUS = 80
    static COLORS = { x: '#e85555', y: '#55cc55', z: '#5588ff' }
    static LABELS = { x: 'X', y: 'Y', z: 'Z' }
    static STEPS = 64

    static PLANE = {
        x: { u: new Vec3(0, 1, 0), v: new Vec3(0, 0, 1) },
        y: { u: new Vec3(1, 0, 0), v: new Vec3(0, 0, 1) },
        z: { u: new Vec3(1, 0, 0), v: new Vec3(0, 1, 0) },
    }

    constructor(app, camEntity, events) {
        this._app = app
        this._camEntity = camEntity
        this._events = events
        this._canvas = app.graphicsDevice.canvas
        this._buildSVG()
        this._svg.style.display = 'none'
    }

    _buildSVG() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;z-index:500;pointer-events:none;`
        this._canvas.parentElement.appendChild(svg)
        this._svg = svg

        for (const axis of ['z', 'x', 'y']) {
            const color = RotationGizmo.COLORS[axis]

            const ringBg = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            ringBg.setAttribute('fill', 'none')
            ringBg.setAttribute('stroke', color)
            ringBg.setAttribute('stroke-width', '2')
            ringBg.setAttribute('stroke-opacity', '0.2')
            ringBg.setAttribute('stroke-linecap', 'round')

            const ring = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            ring.setAttribute('fill', 'none')
            ring.setAttribute('stroke', color)
            ring.setAttribute('stroke-width', '2.5')
            ring.setAttribute('stroke-opacity', '0.85')
            ring.setAttribute('stroke-linecap', 'round')

            // Hit area
            const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            hit.setAttribute('fill', 'none')
            hit.setAttribute('stroke', 'transparent')
            hit.setAttribute('stroke-width', '18')
            hit.style.cursor = 'grab'
            hit.style.pointerEvents = 'stroke'

            // Label
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            text.textContent = axis.toUpperCase()
            text.setAttribute('fill', color)
            text.setAttribute('font-size', '12')
            text.setAttribute('font-family', 'system-ui, sans-serif')
            text.setAttribute('font-weight', '600')
            text.setAttribute('text-anchor', 'middle')
            text.setAttribute('dominant-baseline', 'central')
            text.style.pointerEvents = 'none'
            text.style.userSelect = 'none'

            svg.appendChild(ringBg)
            svg.appendChild(ring)
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

            this._rings[axis] = { ring, ringBg, hit, text }
        }
    }
    _getPlaneVectors(axis) {
        const modelRot = this._target.getRotation()
        const localX = new Vec3(1, 0, 0)
        const localY = new Vec3(0, 1, 0)
        const localZ = new Vec3(0, 0, 1)
        modelRot.transformVector(localX, localX)
        modelRot.transformVector(localY, localY)
        modelRot.transformVector(localZ, localZ)

        return {
            x: { u: localY, v: localZ },
            y: { u: localX, v: localZ },
            z: { u: localX, v: localY },
        }[axis]
    }
    _w2s(v3) {
        const out = new Vec3()
        this._camEntity.camera.worldToScreen(v3, out)
        return { x: out.x, y: out.y }
    }

    _worldRadius() {
        if (!this._target) return 1
        const worldPos = this._target.getPosition()
        const camPos = this._camEntity.getPosition()
        const dist = new Vec3().copy(worldPos).sub(camPos).length()
        const cam = this._camEntity.camera
        const ch = this._canvas.clientHeight
        const fovRad = (cam.fov * Math.PI) / 180
        const ppu = ch / 2 / Math.tan(fovRad / 2) / dist
        return RotationGizmo.SCREEN_RADIUS / ppu
    }

    _computeRingPoints(worldCenter, axis) {
        const R = this._worldRadius()
        const { u, v } = this._getPlaneVectors(axis)
        const steps = RotationGizmo.STEPS
        const camPos = this._camEntity.getPosition()
        const toCam = new Vec3().copy(camPos).sub(worldCenter).normalize()

        const points = []
        for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * Math.PI * 2
            const wx = worldCenter.x + (Math.cos(t) * u.x + Math.sin(t) * v.x) * R
            const wy = worldCenter.y + (Math.cos(t) * u.y + Math.sin(t) * v.y) * R
            const wz = worldCenter.z + (Math.cos(t) * u.z + Math.sin(t) * v.z) * R
            const s = this._w2s(new Vec3(wx, wy, wz))
            const toPoint = new Vec3(wx - worldCenter.x, wy - worldCenter.y, wz - worldCenter.z).normalize()
            const visible = toPoint.dot(toCam) > -0.1
            points.push({ ...s, visible })
        }
        return points
    }

    _pointsToPath(points, visibleOnly) {
        let d = ''
        let penDown = false
        for (const p of points) {
            if (visibleOnly && !p.visible) {
                penDown = false
                continue
            }
            if (!penDown) {
                d += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} `
                penDown = true
            } else {
                d += `L ${p.x.toFixed(1)} ${p.y.toFixed(1)} `
            }
        }
        return d
    }

    _update() {
        if (!this._enabled || !this._target) return
        const worldPos = this._target.getPosition()

        for (const axis of ['x', 'y', 'z']) {
            const { ring, ringBg, hit, text } = this._rings[axis]
            const points = this._computeRingPoints(worldPos, axis)

            const frontPath = this._pointsToPath(points, true)
            ring.setAttribute('d', frontPath)
            hit.setAttribute('d', frontPath)

            const fullPath = this._pointsToPath(points, false)
            ringBg.setAttribute('d', fullPath)

            const center = this._w2s(worldPos)
            let maxDist = -1,
                labelPt = points[0]
            for (const p of points) {
                if (!p.visible) continue
                const d = Math.sqrt((p.x - center.x) ** 2 + (p.y - center.y) ** 2)
                if (d > maxDist) {
                    maxDist = d
                    labelPt = p
                }
            }
            const dx = labelPt.x - center.x,
                dy = labelPt.y - center.y
            const len = Math.sqrt(dx * dx + dy * dy) || 1
            text.setAttribute('x', (labelPt.x + (dx / len) * 14).toFixed(1))
            text.setAttribute('y', (labelPt.y + (dy / len) * 14).toFixed(1))
        }

        this._app.renderNextFrame = true
    }

    _screenAngle(axis, cx, cy) {
        const worldPos = this._modelEntity.getPosition()
        const center = this._w2s(worldPos)
        const R = this._worldRadius()
        const { u, v } = this._dragging ? this._dragPlane : this._getPlaneVectors(axis)

        const pu = this._w2s(new Vec3(worldPos.x + u.x * R, worldPos.y + u.y * R, worldPos.z + u.z * R))
        const pv = this._w2s(new Vec3(worldPos.x + v.x * R, worldPos.y + v.y * R, worldPos.z + v.z * R))

        const screenU = { x: pu.x - center.x, y: pu.y - center.y }
        const screenV = { x: pv.x - center.x, y: pv.y - center.y }
        const mx = cx - center.x,
            my = cy - center.y
        const dotU = mx * screenU.x + my * screenU.y
        const dotV = mx * screenV.x + my * screenV.y
        return Math.atan2(dotV, dotU)
    }

    _onDrag(cx, cy) {
        if (!this._dragging || !this._target) return

        const prev = this._prevMouse
        if (!prev) {
            this._prevMouse = { x: cx, y: cy }
            return
        }

        const dx = cx - prev.x
        const dy = cy - prev.y
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return

        const SENSITIVITY = 0.4
        const { worldAxis, sign } = this._getDragAxis(this._activeAxis, dx, dy)
        const rot = new Quat().setFromAxisAngle(worldAxis, sign * SENSITIVITY)
        this._target.applyRotation(rot)
        this._app.renderNextFrame = true

        const euler = this._target.getEuler()
        if (euler) this._events.fire(this._eventName, { x: euler.x, y: euler.y, z: euler.z })
        this._prevMouse = { x: cx, y: cy }
    }

    _getDragAxis(axis, dx, dy) {
        const worldAxis = this._dragAxisSnapshot[axis].clone()
        const worldPos = this._target.getPosition()
        const center = this._w2s(worldPos)

        const tip = new Vec3().copy(worldPos).add(worldAxis)
        const tipScr = this._w2s(tip)
        const axScr = { x: tipScr.x - center.x, y: tipScr.y - center.y }
        const axLen = Math.sqrt(axScr.x ** 2 + axScr.y ** 2) || 1

        const tangent = { x: -axScr.y / axLen, y: axScr.x / axLen }
        const dot = dx * tangent.x + dy * tangent.y
        const sign = dot > 0 ? 1 : -1
        const mag = Math.sqrt(dx * dx + dy * dy)

        return { worldAxis, sign: sign * mag }
    }

    _startDrag(axis, cx, cy) {
        if (!this._target) return
        this._dragging = true
        this._activeAxis = axis
        this._prevMouse = { x: cx, y: cy }
        const rot = this._target.getRotation()
        const lx = new Vec3(1, 0, 0)
        rot.transformVector(lx, lx)
        const ly = new Vec3(0, 1, 0)
        rot.transformVector(ly, ly)
        const lz = new Vec3(0, 0, 1)
        rot.transformVector(lz, lz)
        this._dragAxisSnapshot = { x: lx, y: ly, z: lz }
        this._highlightOnly(axis)
        document.body.style.cursor = 'grabbing'
    }

    _endDrag() {
        this._dragging = false
        this._activeAxis = null
        this._prevMouse = null
        this._dragAxisSnapshot = null
        this._resetStyle()
        document.body.style.cursor = ''

        const euler = this._target?.getEuler()
        if (euler) this._events.fire(this._eventName, { x: euler.x, y: euler.y, z: euler.z })
    }

    _highlightOnly(activeAxis) {
        for (const [id, { ring, ringBg }] of Object.entries(this._rings)) {
            const active = id === activeAxis
            ring.setAttribute('stroke-width', active ? '4' : '1.5')
            ring.setAttribute('stroke-opacity', active ? '1' : '0.25')
            ringBg.setAttribute('stroke-opacity', active ? '0.15' : '0.08')
        }
    }

    _resetStyle() {
        for (const { ring, ringBg } of Object.values(this._rings)) {
            ring.setAttribute('stroke-width', '2.5')
            ring.setAttribute('stroke-opacity', '0.85')
            ringBg.setAttribute('stroke-opacity', '0.2')
        }
    }

    get isDragging() {
        return this._dragging
    }

    enable(rotatable, eventName) {
        if (!rotatable || !eventName) return
        this._eventName = eventName
        this._target = rotatable
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

    saveSnapshot() {
        if (!this._target) return
        const entity = this._target._entity
        this._snapshot = {
            rot: entity.localRotation.clone(),
            pos: entity.localPosition.clone(),
        }
    }

    restoreSnapshot() {
        if (!this._target || !this._snapshot) return
        const entity = this._target._entity
        entity.localRotation.copy(this._snapshot.rot)
        entity.localPosition.copy(this._snapshot.pos)
        entity.syncHierarchy()
        this._app.renderNextFrame = true
        this._snapshot = null
    }
}
