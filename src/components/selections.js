class BrushStrategy {
    constructor({ centers, numSplats, texWidth, texHeight, camera, stateData, onChanged, gsplatComp, overlay }) {
        this.centers = centers
        this.numSplats = numSplats
        this.texWidth = texWidth
        this.texHeight = texHeight
        this.camera = camera
        this.radius = 24
        this._isDown = false
        this._x = 0
        this._y = 0
        this._worldPos = new Vec3()
        this._screenPos = new Vec3()
        this._stateData = stateData
        this.onChanged = onChanged
        this.gsplatComp = gsplatComp
        this._paintCanvas = document.createElement('canvas')
        this._paintCanvas.width = overlay.width
        this._paintCanvas.height = overlay.height
        this._paintCtx = this._paintCanvas.getContext('2d')
    }

    onPointerDown(x, y) {
        this._isDown = true
        this._x = x
        this._y = y
        this._paintPoints = []
        this._paint(x, y)
        this._paintPoints.push({ x, y })
    }

    onPointerMove(x, y) {
        this._x = x
        this._y = y
        if (this._isDown) {
            this._paint(x, y)
            this._paintPoints.push({ x, y })
        }
    }

    onPointerUp() {
        if (!this._isDown) return
        this._isDown = false
        this._select()
        this._paintCtx.clearRect(0, 0, this._paintCanvas.width, this._paintCanvas.height)
        this._paintPoints = []
    }

    onPointerLeave() {
        this._isDown = false
        this._paintCtx.clearRect(0, 0, this._paintCanvas.width, this._paintCanvas.height)
    }

    _paint(x, y) {
        const ctx = this._paintCtx
        ctx.beginPath()
        ctx.arc(x, y, this.radius, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 220, 0, 0.25)'
        ctx.fill()
    }

    draw(ctx, overlayW, overlayH) {
        ctx.clearRect(0, 0, overlayW, overlayH)
        ctx.drawImage(this._paintCanvas, 0, 0)
        ctx.beginPath()
        ctx.arc(this._x, this._y, this.radius, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 220, 0, 0.9)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = 'rgba(255, 220, 0, 0.06)'
        ctx.fill()
    }

    _select() {
        const imageData = this._paintCtx.getImageData(0, 0, this._paintCanvas.width, this._paintCanvas.height)
        const data = imageData.data
        const w = this._paintCanvas.width
        const h = this._paintCanvas.height
        const worldTransform = this.gsplatComp.entity.getWorldTransform()

        let changed = false
        const selectedSet = new Set()
        for (let i = 0; i < this.numSplats; i++) {
            this._worldPos.set(this.centers[i * 3], this.centers[i * 3 + 1], this.centers[i * 3 + 2])
            worldTransform.transformPoint(this._worldPos, this._worldPos)
            this.camera.camera.worldToScreen(this._worldPos, this._screenPos)
            if (this._screenPos.z < 0) continue

            const px = Math.round(this._screenPos.x)
            const py = Math.round(this._screenPos.y)
            if (px < 0 || py < 0 || px >= w || py >= h) continue

            const tx = i % this.texWidth
            const ty = Math.floor(i / this.texWidth)
            if (data[(py * w + px) * 4 + 3] > 0) {
                selectedSet.add(i)
                this._stateData[ty * this.texWidth + tx] = 255
                changed = true
            } else {
                this._stateData[ty * this.texWidth + tx] = 0
            }
        }
        if (changed) this.onChanged(selectedSet)
    }

    setRadius(r) {
        this.radius = r
    }

    destroy() {
        this._paintCanvas = null
        this._paintCtx = null
    }
}
class RectStrategy {
    constructor({ centers, numSplats, texWidth, texHeight, camera, stateData, gsplatComp, onChanged }) {
        this.centers = centers
        this.numSplats = numSplats
        this.texWidth = texWidth
        this.texHeight = texHeight
        this.camera = camera
        this._isDown = false
        this._startX = 0
        this._startY = 0
        this._curX = 0
        this._curY = 0
        this._worldPos = new Vec3()
        this._screenPos = new Vec3()
        this._stateData = stateData
        this.gsplatComp = gsplatComp
        this.onChanged = onChanged
    }

    onPointerDown(x, y) {
        this._isDown = true
        this._startX = x
        this._startY = y
        this._curX = x
        this._curY = y
    }

    onPointerMove(x, y) {
        this._curX = x
        this._curY = y
    }

    onPointerUp() {
        if (!this._isDown) return
        this._isDown = false
        this._selectInRect()
    }

    onPointerLeave() {
        this._isDown = false
    }

    draw(ctx, overlayW, overlayH) {
        ctx.clearRect(0, 0, overlayW, overlayH)
        if (!this._isDown) return
        const x = Math.min(this._startX, this._curX)
        const y = Math.min(this._startY, this._curY)
        const w = Math.abs(this._curX - this._startX)
        const h = Math.abs(this._curY - this._startY)
        ctx.strokeStyle = 'rgba(255,220,0,0.9)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.strokeRect(x, y, w, h)
        ctx.fillStyle = 'rgba(255,220,0,0.06)'
        ctx.fillRect(x, y, w, h)
        ctx.setLineDash([])
    }

    _selectInRect() {
        const minX = Math.min(this._startX, this._curX)
        const maxX = Math.max(this._startX, this._curX)
        const minY = Math.min(this._startY, this._curY)
        const maxY = Math.max(this._startY, this._curY)
        const worldTransform = this.gsplatComp.entity.getWorldTransform()
        const selectedSet = new Set()
        const { centers, numSplats, _worldPos, _screenPos } = this
        let changed = false
        for (let i = 0; i < numSplats; i++) {
            _worldPos.set(centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2])
            worldTransform.transformPoint(this._worldPos, this._worldPos)
            this.camera.camera.worldToScreen(_worldPos, _screenPos)
            if (_screenPos.z < 0) continue
            const tx = i % this.texWidth
            const ty = Math.floor(i / this.texWidth)
            if (_screenPos.x >= minX && _screenPos.x <= maxX && _screenPos.y >= minY && _screenPos.y <= maxY) {
                selectedSet.add(i)
                this._stateData[ty * this.texWidth + tx] = 255
                changed = true
            } else {
                this._stateData[ty * this.texWidth + tx] = 0
            }
        }
        if (changed) this.onChanged(selectedSet)
    }

    destroy() {}
}

class LassoStrategy {
    constructor({ centers, numSplats, texWidth, texHeight, camera, stateData, gsplatComp, onChanged }) {
        this.centers = centers
        this.numSplats = numSplats
        this.texWidth = texWidth
        this.texHeight = texHeight
        this.camera = camera
        this._isDown = false
        this._points = []
        this._worldPos = new Vec3()
        this._screenPos = new Vec3()
        this._stateData = stateData
        this.gsplatComp = gsplatComp
        this.onChanged = onChanged
    }

    onPointerDown(x, y) {
        this._isDown = true
        this._points = [{ x, y }]
    }

    onPointerMove(x, y) {
        if (!this._isDown) return
        this._points.push({ x, y })
    }

    onPointerUp() {
        if (!this._isDown) return
        this._isDown = false
        if (this._points.length > 2) this._selectInLasso()
        this._points = []
    }

    onPointerLeave() {
        this._isDown = false
        this._points = []
    }

    draw(ctx, overlayW, overlayH) {
        ctx.clearRect(0, 0, overlayW, overlayH)
        if (this._points.length < 2) return
        ctx.beginPath()
        ctx.moveTo(this._points[0].x, this._points[0].y)
        for (let i = 1; i < this._points.length; i++) ctx.lineTo(this._points[i].x, this._points[i].y)
        ctx.closePath()
        ctx.strokeStyle = 'rgba(255,220,0,0.9)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.fillStyle = 'rgba(255,220,0,0.06)'
        ctx.fill()
        ctx.setLineDash([])
    }

    _selectInLasso() {
        const poly = this._points
        let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity
        for (const p of poly) {
            if (p.x < minX) minX = p.x
            if (p.x > maxX) maxX = p.x
            if (p.y < minY) minY = p.y
            if (p.y > maxY) maxY = p.y
        }

        const worldTransform = this.gsplatComp.entity.getWorldTransform()
        const { centers, numSplats, _worldPos, _screenPos } = this
        const selectedSet = new Set()
        let changed = false

        for (let i = 0; i < numSplats; i++) {
            _worldPos.set(centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2])
            worldTransform.transformPoint(_worldPos, _worldPos)
            this.camera.camera.worldToScreen(_worldPos, _screenPos)

            const tx = i % this.texWidth
            const ty = Math.floor(i / this.texWidth)
            const idx = ty * this.texWidth + tx

            let inside = false
            if (
                _screenPos.z >= 0 &&
                _screenPos.x >= minX &&
                _screenPos.x <= maxX &&
                _screenPos.y >= minY &&
                _screenPos.y <= maxY
            ) {
                inside = pointInPolygon(_screenPos.x, _screenPos.y, poly)
            }

            const newVal = inside ? 255 : 0
            if (this._stateData[idx] !== newVal) {
                this._stateData[idx] = newVal
                changed = true
            }
            if (inside) selectedSet.add(i)
        }

        if (changed) this.onChanged(selectedSet)
    }

    destroy() {}
}

class PolygonStrategy {
    constructor({ centers, numSplats, texWidth, texHeight, camera, stateData, gsplatComp, onChanged }) {
        this.centers = centers
        this.numSplats = numSplats
        this.texWidth = texWidth
        this.texHeight = texHeight
        this.camera = camera
        this._vertices = []
        this._mouseX = 0
        this._mouseY = 0
        this._worldPos = new Vec3()
        this._screenPos = new Vec3()
        this.gsplatComp = gsplatComp
        this._stateData = stateData
        this.onChanged = onChanged
        this._closeThreshold = 12
    }

    onPointerDown(x, y, e) {
        if (e.button === 2) {
            this._closeAndSelect()
            return
        }
        if (e.detail === 2 && this._vertices.length > 2) {
            this._vertices.pop()
            this._closeAndSelect()
            return
        }

        if (this._vertices.length >= 3) {
            const first = this._vertices[0]
            const dx = x - first.x
            const dy = y - first.y
            if (Math.sqrt(dx * dx + dy * dy) <= this._closeThreshold) {
                this._closeAndSelect()
                return
            }
        }

        this._vertices.push({ x, y })
    }

    onPointerMove(x, y) {
        this._mouseX = x
        this._mouseY = y
    }

    onPointerUp() {}
    onPointerLeave() {}

    draw(ctx, overlayW, overlayH) {
        ctx.clearRect(0, 0, overlayW, overlayH)
        if (this._vertices.length === 0) return

        ctx.beginPath()
        ctx.moveTo(this._vertices[0].x, this._vertices[0].y)
        for (let i = 1; i < this._vertices.length; i++) ctx.lineTo(this._vertices[i].x, this._vertices[i].y)
        ctx.lineTo(this._mouseX, this._mouseY)
        ctx.strokeStyle = 'rgba(255,220,0,0.9)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        this._vertices.forEach((v, idx) => {
            ctx.beginPath()
            ctx.arc(v.x, v.y, 4, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(255,220,0,0.9)'
            ctx.fill()

            if (idx === 0 && this._vertices.length >= 3) {
                const dx = this._mouseX - v.x
                const dy = this._mouseY - v.y
                if (Math.sqrt(dx * dx + dy * dy) <= this._closeThreshold) {
                    ctx.beginPath()
                    ctx.arc(v.x, v.y, this._closeThreshold, 0, Math.PI * 2)
                    ctx.strokeStyle = 'rgba(0,255,120,0.9)'
                    ctx.lineWidth = 2
                    ctx.stroke()
                }
            }
        })
    }

    _closeAndSelect() {
        if (this._vertices.length < 3) {
            this._vertices = []
            return
        }
        const poly = [...this._vertices]
        const { centers, numSplats, _worldPos, _screenPos, gsplatComp } = this
        const worldTransform = gsplatComp.entity.getWorldTransform()
        const selectedSet = new Set()
        let changed = false

        for (let i = 0; i < numSplats; i++) {
            _worldPos.set(centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2])
            worldTransform.transformPoint(_worldPos, _worldPos)
            this.camera.camera.worldToScreen(_worldPos, _screenPos)

            const tx = i % this.texWidth
            const ty = Math.floor(i / this.texWidth)
            const idx = ty * this.texWidth + tx

            const inside = _screenPos.z >= 0 && pointInPolygon(_screenPos.x, _screenPos.y, poly)
            const newVal = inside ? 255 : 0

            if (this._stateData[idx] !== newVal) {
                this._stateData[idx] = newVal
                changed = true
            }
            if (inside) selectedSet.add(i)
        }

        this._vertices = []
        if (changed) this.onChanged(selectedSet)
    }

    destroy() {}
}

function pointInPolygon(px, py, poly) {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x,
            yi = poly[i].y
        const xj = poly[j].x,
            yj = poly[j].y
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
}

class SelectionController {
    constructor({ canvas, camera, gsplatComp, events, app }) {
        this.canvas = canvas
        this.camera = camera
        this.gsplatComp = gsplatComp
        this.events = events
        this.app = app

        const res = gsplatComp.resource
        this.centers = res.centers
        this.numSplats = res.numSplats
        this.texWidth = Math.ceil(Math.sqrt(this.numSplats))
        this.texHeight = Math.ceil(this.numSplats / this.texWidth)
        this.settings = settings
        this._history = []
        this._historyIndex = -1
        this._stateTex = new Texture(app.graphicsDevice, {
            name: 'splatState',
            width: this.texWidth,
            height: this.texHeight,
            format: PIXELFORMAT_R8,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
        })

        this._selectedSet = new Set()
        this._stateData = new Uint8Array(this.texWidth * this.texHeight)
        this._initOverlay()
        this._initMouseEvents()
        this._initAppEvents()

        this._strategyCtx = {
            centers: this.centers,
            numSplats: this.numSplats,
            texWidth: this.texWidth,
            texHeight: this.texHeight,
            camera: this.camera,
            stateData: this._stateData,
            gsplatComp: this.gsplatComp,
            overlay: this._overlay,
            onChanged: (selectedSet) => this._upload(selectedSet),
        }
        this._pushHistory()
        this._activeStrategy = null
        this._active = false
    }

    _initOverlay() {
        const overlay = document.createElement('canvas')
        overlay.style.cssText = `position:fixed; pointer-events:none; z-index:10;`
        document.body.appendChild(overlay)
        this._overlay = overlay
        this._ctx = overlay.getContext('2d')
        this._resizeOverlay()
        this._resizeObserver = new ResizeObserver(() => this._resizeOverlay())
        this._resizeObserver.observe(this.canvas)
        this._upload()
    }

    _resizeOverlay() {
        const r = this.canvas.getBoundingClientRect()
        this._overlay.style.left = r.left + 'px'
        this._overlay.style.top = r.top + 'px'
        this._overlay.style.width = r.width + 'px'
        this._overlay.style.height = r.height + 'px'
        this._overlay.width = r.width
        this._overlay.height = r.height
    }

    _clearOverlay() {
        this._ctx.clearRect(0, 0, this._overlay.width, this._overlay.height)
    }

    _initMouseEvents() {
        const cvs = this.canvas

        this._onPointerDown = (e) => {
            if (!this._active || !this._activeStrategy) return
            const { x, y } = this._rel(e)
            cvs.setPointerCapture(e.pointerId)
            this._activeStrategy.onPointerDown(x, y, e)
            this._redraw()
        }

        this._onPointerMove = (e) => {
            if (!this._active || !this._activeStrategy) return
            const { x, y } = this._rel(e)
            this._activeStrategy.onPointerMove(x, y, e)
            this._redraw()
        }

        this._onPointerUp = (e) => {
            if (!this._active || !this._activeStrategy) return
            const { x, y } = this._rel(e)
            this._activeStrategy.onPointerUp(x, y, e)
            this._redraw()
        }

        this._onPointerLeave = () => {
            if (!this._active || !this._activeStrategy) return
            this._activeStrategy?.onPointerLeave()
            this._clearOverlay()
        }

        this._onContextMenu = (e) => e.preventDefault()

        cvs.addEventListener('pointerdown', this._onPointerDown)
        cvs.addEventListener('pointermove', this._onPointerMove)
        cvs.addEventListener('pointerup', this._onPointerUp)
        cvs.addEventListener('pointerleave', this._onPointerLeave)
        cvs.addEventListener('contextmenu', this._onContextMenu)
    }

    _rel(e) {
        const r = this._overlay.getBoundingClientRect()
        return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    _redraw() {
        this._activeStrategy.draw(this._ctx, this._overlay.width, this._overlay.height)
    }

    _upload(selectedSet) {
        const pixels = this._stateTex.lock()
        pixels.set(this._stateData)
        this._stateTex.unlock()
        if (selectedSet) this._selectedSet = selectedSet
        this.gsplatComp.material.setParameter('splatState', this._stateTex)
        this.gsplatComp.material.setParameter('splatStateSize', new Float32Array([this.texWidth, this.texHeight]))
        this.app.renderNextFrame = true
        if (selectedSet) this._pushHistory()
        this.events.fire('point-selection', selectedSet)
    }

    _initAppEvents() {
        this.events.on('point-eraser:brush-size', (r) => {
            if (this._activeStrategy?.setRadius) this._activeStrategy.setRadius(r)
        })
        this.events.on('point-eraser:cancel', () => this._onCancel())
        this.events.on('point-eraser:undo', () => this._onUndo())
        this.events.on('point-eraser:redo', () => this._onRedo())
        this.events.on('point-eraser:commit-delete', () => {
            this._pushHistory()
        })
    }

    setMode(mode) {
        this._activeStrategy?.destroy()
        this._activeStrategy = null
        this._clearOverlay()
        if (mode === null) {
            this.setActive(false)
            return
        }
        const StrategyClass = {
            brush: BrushStrategy,
            rect: RectStrategy,
            lasso: LassoStrategy,
            polygon: PolygonStrategy,
        }[mode]
        if (!StrategyClass) throw new Error(`Unknown mode: ${mode}`)
        this._activeStrategy = new StrategyClass(this._strategyCtx)
        this.setActive(true)
    }

    _onCancel() {
        this._clearSelection()
    }

    _clearSelection() {
        this._selectedSet.forEach((i) => {
            const tx = i % this.texWidth
            const ty = Math.floor(i / this.texWidth)
            this._stateData[ty * this.texWidth + tx] = 0
        })
        this._selectedSet.clear()
        this._upload()
    }

    _onUndo() {}

    setActive(v) {
        this._active = v
        if (!v) this._clearOverlay()
    }

    destroy() {
        const cvs = this.canvas
        cvs.removeEventListener('pointerdown', this._onPointerDown)
        cvs.removeEventListener('pointermove', this._onPointerMove)
        cvs.removeEventListener('pointerup', this._onPointerUp)
        cvs.removeEventListener('pointerleave', this._onPointerLeave)
        cvs.removeEventListener('contextmenu', this._onContextMenu)
        this._resizeObserver.disconnect()
        this._overlay.remove()
        this._stateTex.destroy()
        this._activeStrategy?.destroy()
    }
    _pushHistory() {
        this._history = this._history.slice(0, this._historyIndex + 1)
        this._history.push(this._snapshot())
        this._historyIndex++
        const MAX = 50
        if (this._history.length > MAX) {
            this._history.shift()
            this._historyIndex--
        }
    }
    _snapshot() {
        return {
            stateData: this._stateData.slice(), // copy
            selectedSet: new Set(this._selectedSet),
            deletedSet: new Set(this.settings.removedSplats || []),
        }
    }
    _restoreSnapshot(snap) {
        this._stateData.set(snap.stateData)
        this._selectedSet = new Set(snap.selectedSet)
        this.settings.removedSplats = [...snap.deletedSet]

        applyPointMapping({ modelEntity: this.gsplatComp.entity, deletedSet: new Set(snap.deletedSet) })

        const pixels = this._stateTex.lock()
        pixels.set(this._stateData)
        this._stateTex.unlock()
        this.gsplatComp.material.setParameter('splatState', this._stateTex)
        this.gsplatComp.material.setParameter('splatStateSize', new Float32Array([this.texWidth, this.texHeight]))
        this.app.renderNextFrame = true

        this.events.fire('point-selection', this._selectedSet)
        this.events.fire('point-eraser:deleted-changed', this.settings.removedSplats)
    }
    _onUndo() {
        if (this._historyIndex <= 0) return
        this._historyIndex--
        this._restoreSnapshot(this._history[this._historyIndex])
    }

    _onRedo() {
        if (this._historyIndex >= this._history.length - 1) return
        this._historyIndex++
        this._restoreSnapshot(this._history[this._historyIndex])
    }
    _clearSelectionStateOnly() {
        this._stateData.fill(0)
        this._selectedSet = new Set()
        const pixels = this._stateTex.lock()
        pixels.set(this._stateData)
        this._stateTex.unlock()
        this.gsplatComp.material.setParameter('splatState', this._stateTex)
        this.app.renderNextFrame = true
    }
}
