class GroundPlanePicker {
    constructor(app, camEntity) {
        this._app = app
        this._cam = camEntity
        this._points = []
        this._svg = null
        this._updateFn = null
        this._buildSVG()
    }
    _buildSVG() {
        const canvas = this._app.graphicsDevice.canvas
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;z-index:500;pointer-events:none;`
        canvas.parentElement.appendChild(svg)
        this._svg = svg
    }


    _w2s(worldPos) {
        const out = new Vec3()
        this._cam.camera.worldToScreen(worldPos, out)
        return { x: out.x, y: out.y }
    }

    _localToWorld(localPts) {
        if (!modelEntity) return localPts.map((p) => new Vec3(p.x, p.y, p.z))
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        return localPts.map((p) => {
            const w = new Vec3()
            worldMatrix.transformPoint(p, w)
            return w
        })
    }

    findNearestPointIndex(screenX, screenY, radius = 18) {
        const worldPts = this._localToWorld(this._points)
        let bestDist = radius
        let bestIdx = -1
        worldPts.forEach((p, i) => {
            const s = this._w2s(p)
            const d = Math.sqrt((s.x - screenX) ** 2 + (s.y - screenY) ** 2)
            if (d < bestDist) {
                bestDist = d
                bestIdx = i
            }
        })
        return bestIdx
    }
    handleClick(localPoint, screenX, screenY) {
        if (this._points.length < 3) {
            const nearIdx = this.findNearestPointIndex(screenX, screenY)
            if (nearIdx !== -1) {
                this._points.splice(nearIdx, 1)
            } else {
                this._points.push(new Vec3(localPoint.x, localPoint.y, localPoint.z))
            }
        }
        this._redraw()
        return this._points.length
    }
    getLocalPoints() {
        return this._points
    }

    reset() {
        this._points = []
        this._svg.innerHTML = ''
    }
    setContext(modelCentroid, originRot) {
        this._modelCentroid = modelCentroid
        this._originRot = originRot
    }
    _redraw() {
        this._svg.innerHTML = ''
        if (this._points.length === 0) return
        const pts = this._localToWorld(this._points)
        const COLORS = ['#ff4444', '#44ff44', '#4488ff']

        if (pts.length >= 3) {
            const s0 = this._w2s(pts[0])
            const s1 = this._w2s(pts[1])
            const s2 = this._w2s(pts[2])

            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
            poly.setAttribute('points', `${s0.x},${s0.y} ${s1.x},${s1.y} ${s2.x},${s2.y}`)
            poly.setAttribute('fill', 'rgba(100,180,255,0.18)')
            poly.setAttribute('stroke', 'rgba(100,180,255,0.5)')
            poly.setAttribute('stroke-width', '1')
            this._svg.appendChild(poly)

        }

        // ── Lines ──
        if (pts.length >= 2) {
            const indices = pts.length >= 3 ? [0, 1, 1, 2, 2, 0] : [0, 1]
            for (let k = 0; k < indices.length; k += 2) {
                const a = this._w2s(pts[indices[k]])
                const b = this._w2s(pts[indices[k + 1]])
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
                line.setAttribute('x1', a.x)
                line.setAttribute('y1', a.y)
                line.setAttribute('x2', b.x)
                line.setAttribute('y2', b.y)
                line.setAttribute('stroke', 'rgba(255,255,255,0.6)')
                line.setAttribute('stroke-width', '1.5')
                line.setAttribute('stroke-dasharray', '4 3')
                this._svg.appendChild(line)
            }
        }

        // ── Dots + labels ──
        pts.forEach((p, i) => {
            const s = this._w2s(p)
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            dot.setAttribute('cx', s.x)
            dot.setAttribute('cy', s.y)
            dot.setAttribute('r', '5')
            dot.setAttribute('fill', COLORS[i])
            this._svg.appendChild(dot)
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            txt.setAttribute('x', s.x + 16)
            txt.setAttribute('y', s.y + 5)
            txt.setAttribute('fill', COLORS[i])
            txt.setAttribute('font-size', '13')
            txt.setAttribute('font-weight', 'bold')
            txt.textContent = `P${i + 1}`
            this._svg.appendChild(txt)
        })
    }

    enable() {
        this._svg.style.display = ''
        this._updateFn = () => this._redraw()
        this._app.on('update', this._updateFn)
    }

    disable() {
        this._svg.style.display = 'none'
        this.reset()
        if (this._updateFn) {
            this._app.off('update', this._updateFn)
            this._updateFn = null
        }
    }
}
