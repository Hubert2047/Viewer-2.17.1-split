class MeasureTool {
    constructor(global) {
        const { app, camera, settings, events } = global
        this._app = app
        this._cam = camera
        this._active = false
        this._points = []
        this._svg = null
        this._label = null
        this._clickHandler = null
        this._frameHandle = null
        this._gizmos = []
        this._config = {
            lineColor: settings.measurement.lineColor ?? 'f95f4d',
            textColor: settings.measurement.textColor ?? '#ffffff',
            background: {
                color: settings.measurement.background.color ?? 'rgba(0,0,0,0.65)',
                alpha: settings.measurement.background.alpha ?? 0.8,
            },
        }
        this._dimensions = settings.dimensions ?? null
        this._buildSVG()
        this._buildGizmos()

        events.on('dimensions:change', (dim) => {
            this._dimensions = dim
            this._render()
        })
    }
    setConfig(config) {
        Object.assign(this._config, config)
        this._applyLabelStyle()
        this._render()
    }
    _applyLabelStyle() {
        const {
            textColor,
            background: { color, alpha },
        } = this._config
        this._label.style.background = transparentColor(color, alpha)
        this._label.style.color = textColor
    }

    _buildSVG() {
        const canvas = this._app.graphicsDevice.canvas
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;z-index:600;pointer-events:none;display:none;'
        canvas.parentElement.appendChild(svg)
        this._svg = svg

        const label = document.createElement('div')
        label.style.cssText =
            'position:absolute;z-index:99;font-size:13px;padding:3px 8px;border-radius:6px;pointer-events:none;display:none;white-space:nowrap;transform:translate(-50%,-130%);'
        canvas.parentElement.appendChild(label)
        this._label = label
        this._applyLabelStyle()
    }

    _buildGizmos() {
        for (let i = 0; i < 2; i++) {
            const idx = i
            const gizmo = new PointGizmo(this._app, this._cam, modelEntity, {
                onMove: (localPos) => {
                    this._points[idx] = new Vec3(localPos.x, localPos.y, localPos.z)
                    this._render()
                },
            })
            this._gizmos.push(gizmo)
            this._activeGizmoIdx = -1
        }
    }

    _localToWorld(localPt) {
        if (!modelEntity) return localPt.clone()
        const w = new Vec3()
        modelEntity.gsplat.instance.meshInstance.node.getWorldTransform().transformPoint(localPt, w)
        return w
    }

    _w2s(worldPt) {
        const out = new Vec3()
        this._cam.camera.worldToScreen(worldPt, out)
        return { x: out.x, y: out.y }
    }

    _nearestPointIdx(screenX, screenY, radius = 20) {
        let best = -1,
            bestD = radius
        this._points.forEach((p, i) => {
            const s = this._w2s(this._localToWorld(p))
            const d = Math.hypot(s.x - screenX, s.y - screenY)
            if (d < bestD) {
                bestD = d
                best = i
            }
        })
        return best
    }

    _render() {
        if (!this._active) return
        this._svg.innerHTML = ''
        this._label.style.display = 'none'

        const worldPts = this._points.map((p) => this._localToWorld(p))
        const screenPts = worldPts.map((p) => this._w2s(p))
        const { lineColor } = this._config
        if (worldPts.length === 2) {
            const [sp0, sp1] = screenPts
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
            line.setAttribute('x1', sp0.x)
            line.setAttribute('y1', sp0.y)
            line.setAttribute('x2', sp1.x)
            line.setAttribute('y2', sp1.y)
            line.setAttribute('stroke', lineColor)
            line.setAttribute('stroke-width', '2')
            line.setAttribute('stroke-dasharray', '6 3')
            this._svg.appendChild(line)

            const dist = worldPts[0].distance(worldPts[1])
            const text = this._getDistanceText(dist)
            const midX = (sp0.x + sp1.x) / 2
            const midY = (sp0.y + sp1.y) / 2
            this._label.innerHTML = `
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style="margin-right:4px;vertical-align:middle">
        <path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4" 
              stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span>${text}</span>
`
            this._label.style.left = midX + 'px'
            this._label.style.top = midY + 'px'
            this._label.style.display = 'block'
        }

        screenPts.forEach((sp) => {
            const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            outer.setAttribute('cx', sp.x)
            outer.setAttribute('cy', sp.y)
            outer.setAttribute('r', 7)
            outer.setAttribute('fill', '#ffffff')
            outer.setAttribute('stroke', lineColor)
            outer.setAttribute('stroke-width', '2')
            this._svg.appendChild(outer)

            const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            inner.setAttribute('cx', sp.x)
            inner.setAttribute('cy', sp.y)
            inner.setAttribute('r', 3.5)
            inner.setAttribute('fill', lineColor)
            this._svg.appendChild(inner)
        })
    }

    _onCanvasClick(e) {
        if (this._gizmos.some((g) => g.isDragging)) return

        if (this._points.length < 2) {
            const localPt = pickModelLocalPoint(e.offsetX, e.offsetY, this._cam.camera, true)
            if (!localPt) return
            this._points.push(localPt)
            if (this._points.length === 2) {
                this._gizmos.forEach((g) => g.disable())
                this._activeGizmoIdx = -1
            }
            this._render()
            return
        }

        const idx = this._nearestPointIdx(e.offsetX, e.offsetY)

        if (idx === -1) {
            if (this._activeGizmoIdx !== -1) {
                this._gizmos[this._activeGizmoIdx].disable()
                this._activeGizmoIdx = -1
            }
            return
        }

        if (this._activeGizmoIdx === idx) {
            this._gizmos[idx].disable()
            this._activeGizmoIdx = -1
            return
        }

        if (this._activeGizmoIdx !== -1) {
            this._gizmos[this._activeGizmoIdx].disable()
        }
        this._gizmos[idx].setPosition(this._points[idx])
        this._gizmos[idx].enable()
        this._activeGizmoIdx = idx
    }
    activate() {
        if (this._active) {
            this.deactivate()
            return
        }
        document.body.style.cursor = 'crosshair'
        this._active = true
        this._points = []
        this._activeGizmoIdx = -1
        this._svg.style.display = ''
        this._pointerDownPos = null
        this._pointerDownHandler = (e) => {
            this._pointerDownPos = { x: e.clientX, y: e.clientY }
        }
        this._clickHandler = (e) => {
            if (this._pointerDownPos) {
                const dx = e.clientX - this._pointerDownPos.x
                const dy = e.clientY - this._pointerDownPos.y
                if (Math.hypot(dx, dy) > 5) return
            }
            this._onCanvasClick(e)
        }

        const canvas = this._app.graphicsDevice.canvas
        canvas.addEventListener('pointerdown', this._pointerDownHandler)
        canvas.addEventListener('click', this._clickHandler)

        this._frameHandle = this._app.on('update', () => {
            if (!this._active) return
            this._gizmos.forEach((g, i) => {
                if (g._enabled && g._pivotLocal && this._points[i]) {
                    this._points[i].copy(g._pivotLocal)
                }
            })
            this._render()
        })
    }

    deactivate() {
        this._active = false
        this._activeGizmoIdx = -1
        document.body.style.cursor = 'default'
        this._points = []
        this._svg.style.display = 'none'
        this._label.style.display = 'none'
        this._svg.innerHTML = ''
        this._gizmos.forEach((g) => g.disable())

        const canvas = this._app.graphicsDevice.canvas
        if (this._pointerDownHandler) {
            canvas.removeEventListener('pointerdown', this._pointerDownHandler)
            this._pointerDownHandler = null
        }
        if (this._clickHandler) {
            canvas.removeEventListener('click', this._clickHandler)
            this._clickHandler = null
        }
        if (this._frameHandle) {
            this._frameHandle.off()
            this._frameHandle = null
        }
    }

    get active() {
        return this._active
    }
    _getDistanceText(worldDist) {
        const dim = this._dimensions

        if (dim && dim.size && dim.realSize) {
            const scaleX = dim.size.x > 0 ? dim.realSize.x / dim.size.x : 0
            const scaleY = dim.size.y > 0 ? dim.realSize.y / dim.size.y : 0
            const scaleZ = dim.size.z > 0 ? dim.realSize.z / dim.size.z : 0

            const validScales = [scaleX, scaleY, scaleZ].filter((s) => s > 0)
            if (validScales.length === 0) return this._fallbackText(worldDist, dim.unit)

            const avgScale = validScales.reduce((a, b) => a + b, 0) / validScales.length
            const realDist = worldDist * avgScale
            const unit = dim.unit ?? 'cm'
            return `${realDist.toFixed(2)} ${unit}`
        }

        return this._fallbackText(worldDist, dim.unit)
    }

    _fallbackText(worldDist, unit = 'cm') {
        return `${worldDist.toFixed(3)} ${unit}`
    }
}
