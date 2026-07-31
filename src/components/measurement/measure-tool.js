class MeasureTool {
    constructor(global) {
        const { app, camera, settings, events } = global
        this._app = app
        this._cam = camera
        this.settings = settings
        this.events = events
        this.global = global
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
            textBackground: {
                color: settings.measurement.textBackground.color ?? 'rgba(0,0,0,0.65)',
                alpha: settings.measurement.textBackground.alpha ?? 0.8,
            },
        }
        this._dimensions = settings.dimensions
        this._buildSVG()
        this._buildGizmos()
        this._events = global.events
        this._calibMode = false
        this._calibPoints = [null, null]
        this._calibPickedCount = 0
        this._calibClickHandler = null
        this._calibFrameHandle = null
        this.handles = [
            events.on('dimensions:change', (dim) => {
                this._dimensions = dim
                this._render()
            }),
            events.on('measurement:calibration-set-input-point', ({ idx, pos }) => {
                this.setCalibFromInputPoint(idx, pos)
            }),
            events.on('measurement:calibration-pick-start', () => {
                this.startCalibrationPick()
            }),
            events.on('measurement:calibration-cancel', () => {
                this.cancelCalibrationPick()
            }),
            events.on('measurement:calibration-reset', () => {
                this.resetCalib()
            }),
            events.on('measurement:calibration-restore-points', (points) => {
                if (!points || points.length < 2) return
                if (this._active) this.deactivate()
                this._gizmos.forEach((g) => g.disable())
                if (this._calibFrameHandle) {
                    this._calibFrameHandle.off()
                    this._calibFrameHandle = null
                }

                this._calibMode = true
                this._calibPickedCount = 2
                this._calibPoints = [
                    new Vec3(points[0].x, points[0].y, points[0].z),
                    new Vec3(points[1].x, points[1].y, points[1].z),
                ]

                this._svg.style.display = ''

                this._gizmos.forEach((g, i) => {
                    g.setPosition(this._calibPoints[i])
                    g.enable()
                })
                this._activeGizmoIdx = -1

                this._calibFrameHandle = this._app.on('update', () => {
                    if (!this._calibMode) return
                    this._renderCalib()
                })
            }),
            events.on('setup-reset', () => {
                this.deactivate()
                this.resetCalib()
            }),
        ]
    }
    cleanup() {
        this.handles.forEach((h) => this.events.offByHandle(h))
    }

    setConfig(config) {
        Object.assign(this._config, config)
        this._applyLabelStyle()
        this._render()
    }

    _applyLabelStyle() {
        const {
            textColor,
            textBackground: { color, alpha },
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
            'position:absolute;z-index:99;font-size:13px;padding:3px 8px;border-radius:6px;pointer-events:none;display:none;white-space:nowrap;transform:translate(-50%,-50%);'
        canvas.parentElement.appendChild(label)
        this._label = label
        this._applyLabelStyle()
    }

    _buildGizmos() {
        for (let i = 0; i < 2; i++) {
            const idx = i
            const gizmo = new PointGizmo(this._app, this._cam, modelEntity, {
                showAxes: false,
                dotFillOpacity: 0,
                onDragStart: () => {
                    this._events.fire('measurement:drag', true)
                },
                onDragEnd: () => {
                    this._events.fire('measurement:drag', false)
                },
                onMove: (localPos) => {
                    if (this._calibMode) {
                        this._calibPoints[idx] = new Vec3(localPos.x, localPos.y, localPos.z)
                        this._events.fire('measurement:calibration-point-moved', {
                            idx,
                            pos: { x: localPos.x, y: localPos.y, z: localPos.z },
                        })
                    } else {
                        this._points[idx] = new Vec3(localPos.x, localPos.y, localPos.z)
                        this._render()
                    }
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

    _renderLine(sp0, sp1, labelText = null) {
        const { lineColor } = this._config
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        line.setAttribute('x1', sp0.x)
        line.setAttribute('y1', sp0.y)
        line.setAttribute('x2', sp1.x)
        line.setAttribute('y2', sp1.y)
        line.setAttribute('stroke', lineColor)
        line.setAttribute('stroke-width', '2')
        line.setAttribute('stroke-dasharray', '6 3')
        this._svg.appendChild(line)

        if (labelText != null) {
            const midX = (sp0.x + sp1.x) / 2
            const midY = (sp0.y + sp1.y) / 2
            const dx = sp1.x - sp0.x
            const dy = sp1.y - sp0.y
            const len = Math.hypot(dx, dy) || 1
            let perpX = -dy / len
            let perpY = dx / len
            if (perpY > 0) {
                perpX = -perpX
                perpY = -perpY
            }
            const offset = 30 + 20 * (1 - Math.abs(perpY))
            this._label.style.left = midX + perpX * offset + 'px'
            this._label.style.top = midY + perpY * offset + 'px'
            this._label.innerHTML = `<span>${labelText}</span>`
            this._label.style.display = 'block'
        }
    }

    _renderDot(sp, label = null) {
        const { lineColor } = this._config
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        circle.setAttribute('cx', sp.x)
        circle.setAttribute('cy', sp.y)
        circle.setAttribute('r', 7)
        circle.setAttribute('fill', 'transparent')
        circle.setAttribute('stroke', lineColor)
        circle.setAttribute('stroke-width', '2')
        this._svg.appendChild(circle)

        if (label != null) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            text.setAttribute('x', sp.x + 10)
            text.setAttribute('y', sp.y - 10)
            text.setAttribute('fill', lineColor)
            text.setAttribute('font-size', '13')
            text.setAttribute('font-weight', '600')
            text.setAttribute('font-family', 'system-ui, sans-serif')
            text.textContent = label
            this._svg.appendChild(text)
        }
    }

    _render() {
        if (!this._active) return
        this._svg.innerHTML = ''
        this._label.style.display = 'none'

        const worldPts = this._points.map((p) => this._localToWorld(p))
        const screenPts = worldPts.map((p) => this._w2s(p))

        const isPreview = worldPts.length === 1 && this._hoverPoint
        const previewWorldPt = isPreview ? this._localToWorld(this._hoverPoint) : null
        const linePts = isPreview ? [screenPts[0], this._w2s(previewWorldPt)] : screenPts

        if (linePts.length === 2) {
            const dist = isPreview ? worldPts[0].distance(previewWorldPt) : worldPts[0].distance(worldPts[1])
            this._renderLine(linePts[0], linePts[1], this._getDistanceText(dist))
        }

        screenPts.forEach((sp) => this._renderDot(sp))
    }

    _renderCalib() {
        this._svg.innerHTML = ''
        this._label.style.display = 'none'

        const pts = this._calibPoints.filter(Boolean)
        if (pts.length === 0) return

        const worldPts = pts.map((p) => this._localToWorld(p))
        const screenPts = worldPts.map((p) => this._w2s(p))

        const isPreview = worldPts.length === 1 && this._hoverPoint
        const previewWorldPt = isPreview ? this._localToWorld(this._hoverPoint) : null
        const linePts = isPreview ? [screenPts[0], this._w2s(previewWorldPt)] : screenPts

        if (linePts.length === 2) {
            const { calibration } = this.global.settings.measurement
            const labelText =
                calibration?.distance != null ? `${calibration.distance} ${calibration.unit ?? 'cm'}` : null
            this._renderLine(linePts[0], linePts[1], labelText)
        }

        screenPts.forEach((sp, i) => this._renderDot(sp, i === 0 ? 'A' : 'B'))
    }

    _getDistanceText(worldDist) {
        const { calibration } = this.global.settings.measurement
        const { useDimensionData, points, unit, distance } = calibration

        if (!useDimensionData && hasCalibrationData(calibration)) {
            const calibWorldDist = this._localToWorld(points[0]).distance(this._localToWorld(points[1]))
            if (calibWorldDist === 0) return
            const calibScale = distance / calibWorldDist
            return `${(worldDist * calibScale).toFixed(2)} ${unit ?? 'cm'}`
        }

        if (useDimensionData && hasDimensionsData(this._dimensions)) {
            const dim = this._dimensions
            const scaleX = dim.size.x > 0 ? dim.realSize.x / dim.size.x : 0
            const scaleY = dim.size.y > 0 ? dim.realSize.y / dim.size.y : 0
            const scaleZ = dim.size.z > 0 ? dim.realSize.z / dim.size.z : 0
            const validScales = [scaleX, scaleY, scaleZ].filter((s) => s > 0)
            if (validScales.length > 0) {
                const avgScale = validScales.reduce((a, b) => a + b, 0) / validScales.length
                return `${(worldDist * avgScale).toFixed(2)} ${dim.unit ?? 'cm'}`
            }
        }

        return `${worldDist.toFixed(3)} ${calibration.unit ?? 'cm'}`
    }

    activate() {
        if (this._active) {
            this.deactivate()
            return
        }
        document.body.style.cursor = 'crosshair'
        this._active = true
        this._points = []
        this._hoverPoint = null
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
        this._mouseMoveHandler = (e) => {
            if (this._points.length !== 1) return
            const localPt = pickModelLocalPoint({
                x: e.offsetX,
                y: e.offsetY,
                camera: this._cam.camera,
                preciseMode: false,
                removedSplats: this.settings.removedSplats,
            })
            this._hoverPoint = localPt ?? null
        }

        const canvas = this._app.graphicsDevice.canvas
        canvas.addEventListener('pointerdown', this._pointerDownHandler)
        canvas.addEventListener('click', this._clickHandler)
        canvas.addEventListener('mousemove', this._mouseMoveHandler)

        this._frameHandle = this._app.on('update', () => {
            if (!this._active) return
            this._gizmos.forEach((g, i) => {
                if (g._enabled && g._localPos && this._points[i]) {
                    this._points[i].copy(g._localPos)
                }
            })
            this._render()
        })
    }

    deactivate() {
        this._active = false
        this._activeGizmoIdx = -1
        this._hoverPoint = null
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
        if (this._mouseMoveHandler) {
            canvas.removeEventListener('mousemove', this._mouseMoveHandler)
            this._mouseMoveHandler = null
        }
        if (this._frameHandle) {
            this._frameHandle.off()
            this._frameHandle = null
        }
    }

    get active() {
        return this._active
    }

    _onCanvasClick(e) {
        if (this._gizmos.some((g) => g.isDragging)) return
        if (this._points.length >= 2) return

        const localPt = pickModelLocalPoint({
            x: e.offsetX,
            y: e.offsetY,
            camera: this._cam.camera,
            preciseMode: true,
            removedSplats: this.settings.removedSplats,
        })
        if (!localPt) {
            showToast('Please click again!', { duration: 1000, type: 'warning' })
            return
        }
        this._points.push(localPt)
        if (this._points.length === 2) {
            this._gizmos.forEach((g, i) => {
                g.setPosition(this._points[i])
                g.enable()
            })
            this._activeGizmoIdx = -1
            document.body.style.cursor = 'default'
        }
        this._render()
    }

    startCalibrationPick() {
        if (this._active) this.deactivate()
        this._gizmos.forEach((g) => g.disable())
        this._calibMode = true
        this._calibPoints = [null, null]
        this._calibPickedCount = 0
        this._activeGizmoIdx = -1
        this._hoverPoint = null

        document.body.style.cursor = 'crosshair'
        this._svg.style.display = ''
        this._pointerDownPos = null

        this._pointerDownHandler = (e) => {
            this._pointerDownPos = { x: e.clientX, y: e.clientY }
        }
        this._calibClickHandler = (e) => {
            if (this._pointerDownPos) {
                const dx = e.clientX - this._pointerDownPos.x
                const dy = e.clientY - this._pointerDownPos.y
                if (Math.hypot(dx, dy) > 5) return
            }
            this._onCalibClick(e)
        }
        this._mouseMoveHandler = (e) => {
            if (this._calibPickedCount !== 1) return
            const localPt = pickModelLocalPoint({
                x: e.offsetX,
                y: e.offsetY,
                camera: this._cam.camera,
                preciseMode: false,
                removedSplats: this.settings.removedSplats,
            })
            this._hoverPoint = localPt ?? null
        }

        const canvas = this._app.graphicsDevice.canvas
        canvas.addEventListener('pointerdown', this._pointerDownHandler)
        canvas.addEventListener('click', this._calibClickHandler)
        canvas.addEventListener('mousemove', this._mouseMoveHandler)

        this._calibFrameHandle = this._app.on('update', () => {
            if (!this._calibMode) return
            this._renderCalib()
        })
    }

    _onCalibClick(e) {
        if (this._gizmos.some((g) => g.isDragging)) return
        if (this._calibPickedCount >= 2) return

        const localPt = pickModelLocalPoint({
            x: e.offsetX,
            y: e.offsetY,
            camera: this._cam.camera,
            preciseMode: true,
            removedSplats: this.settings.removedSplats,
        })
        if (!localPt) {
            showToast('Please click again!', { duration: 1000, type: 'warning' })
            return
        }

        const idx = this._calibPickedCount
        this._calibPoints[idx] = localPt
        this._gizmos[idx].setPosition(localPt)
        this._gizmos[idx].enable()
        this._activeGizmoIdx = idx
        this._calibPickedCount++

        this._events.fire('measurement:calibration-point-moved', {
            idx,
            pos: { x: localPt.x, y: localPt.y, z: localPt.z },
        })

        if (this._calibPickedCount === 2) {
            document.body.style.cursor = ''
            const canvas = this._app.graphicsDevice.canvas
            if (this._pointerDownHandler) {
                canvas.removeEventListener('pointerdown', this._pointerDownHandler)
                this._pointerDownHandler = null
            }
            if (this._calibClickHandler) {
                canvas.removeEventListener('click', this._calibClickHandler)
                this._calibClickHandler = null
            }
            this._events.fire('measurement:calibration-picked', [
                { x: this._calibPoints[0].x, y: this._calibPoints[0].y, z: this._calibPoints[0].z },
                { x: this._calibPoints[1].x, y: this._calibPoints[1].y, z: this._calibPoints[1].z },
            ])
        }
    }

    _nearestCalibPointIdx(screenX, screenY, radius = 20) {
        let best = -1,
            bestD = radius
        this._calibPoints.forEach((p, i) => {
            if (!p) return
            const s = this._w2s(this._localToWorld(p))
            const d = Math.hypot(s.x - screenX, s.y - screenY)
            if (d < bestD) {
                bestD = d
                best = i
            }
        })
        return best
    }

    cancelCalibrationPick() {
        this._calibMode = false
        this._calibPickedCount = 0
        this._calibPoints = []
        const canvas = this._app.graphicsDevice.canvas
        if (this._calibClickHandler) {
            canvas.removeEventListener('click', this._calibClickHandler)
            this._calibClickHandler = null
        }
        if (this._calibFrameHandle) {
            this._calibFrameHandle.off()
            this._calibFrameHandle = null
        }
        this.deactivate()
    }

    setCalibFromInputPoint(idx, pos) {
        if (!this._calibMode) return
        this._calibPoints[idx] = new Vec3(pos.x, pos.y, pos.z)
        this._gizmos[idx].setPosition(this._calibPoints[idx])
        this._gizmos[idx].enable()
        this._renderCalib()
    }

    resetCalib() {
        this._calibMode = false
        this._calibPoints = []
        this._calibPickedCount = 0
        const canvas = this._app.graphicsDevice.canvas
        if (this._calibClickHandler) {
            canvas.removeEventListener('click', this._calibClickHandler)
            this._calibClickHandler = null
        }
        if (this._calibFrameHandle) {
            this._calibFrameHandle.off()
            this._calibFrameHandle = null
        }
        this.deactivate()
    }
    _setGizmoSelected(idx, selected) {
        const dot = this._gizmos[idx]._dot
        if (selected) {
            dot.setAttribute('fill', 'rgba(255, 210, 0, 0.9)')
            dot.setAttribute('stroke', '#ff9900')
            dot.setAttribute('stroke-width', '2.5')
        } else {
            dot.setAttribute('fill', `rgba(255, 255, 255, ${this._gizmos[idx].dotFillOpacity})`)
            dot.setAttribute('stroke', 'rgba(0,0,0,0.4)')
            dot.setAttribute('stroke-width', '1.5')
        }
    }
}
