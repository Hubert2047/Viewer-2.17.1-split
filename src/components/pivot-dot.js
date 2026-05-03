class PivotDot {
    _enabled = false
    _svg = null
    _dot = null
    _ring = null
    _pivotLocal = null

    constructor(app, camEntity, modelEntity) {
        this._app = app
        this._camEntity = camEntity
        this._canvas = app.graphicsDevice.canvas
        this._modelEntity = modelEntity
        this._buildSVG()
        this._svg.style.display = 'none'
    }

    _buildSVG() {
        const canvas = this._app.graphicsDevice.canvas
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;z-index:499;pointer-events:none;`
        canvas.parentElement.appendChild(svg)
        this._svg = svg

        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        ring.setAttribute('r', '12')
        ring.setAttribute('fill', 'none')
        ring.setAttribute('stroke', 'rgba(255,255,255,0.8)')
        ring.setAttribute('stroke-width', '1.5')
        svg.appendChild(ring)
        this._ring = ring

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
        dot.setAttribute('r', '6')
        dot.setAttribute('fill', 'white')
        dot.setAttribute('stroke', 'rgba(0,0,0,0.5)')
        dot.setAttribute('stroke-width', '1')
        svg.appendChild(dot)
        this._dot = dot
    }

    _w2s(v3) {
        const out = new Vec3()
        this._camEntity.camera.worldToScreen(v3, out)
        return { x: out.x, y: out.y }
    }

    _update() {
        if (!this._enabled || !this._pivotLocal) return
        const worldMatrix = this._modelEntity.getWorldTransform()
        const worldPos = new Vec3()
        worldMatrix.transformPoint(this._pivotLocal, worldPos)
        const s = this._w2s(worldPos)
        this._dot.setAttribute('cx', s.x.toFixed(1))
        this._dot.setAttribute('cy', s.y.toFixed(1))
        this._ring.setAttribute('cx', s.x.toFixed(1))
        this._ring.setAttribute('cy', s.y.toFixed(1))
        this._app.renderNextFrame = true
    }

    setPivot(localPos) {
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
        this._svg.style.display = 'none'
        if (this._updateFn) this._app.off('update', this._updateFn)
    }
}