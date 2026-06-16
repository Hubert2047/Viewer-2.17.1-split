const WORKER = `
self.onmessage = function({ data }) {
    const { type, numSplats, texWidth, screenPositions, payload, deletedMask } = data

    const stateData = new Uint8Array(texWidth * Math.ceil(numSplats / texWidth))
    const selectedArr = []

    if (type === 'brush') {
        const { paintPixels, paintWidth, paintHeight } = payload
        for (let i = 0; i < numSplats; i++) {
            if (deletedMask && deletedMask[i]) continue
            const sx = Math.round(screenPositions[i * 2])
            const sy = Math.round(screenPositions[i * 2 + 1])
            const tx = i % texWidth
            const ty = Math.floor(i / texWidth)
            let inside = false
            if (sx >= 0 && sy >= 0 && sx < paintWidth && sy < paintHeight) {
                inside = paintPixels[(sy * paintWidth + sx) * 4 + 3] > 0
            }
            stateData[ty * texWidth + tx] = inside ? 255 : 0
            if (inside) selectedArr.push(i)
        }
    } else if (type === 'rect') {
        const { minX, maxX, minY, maxY } = payload
        for (let i = 0; i < numSplats; i++) {
            if (deletedMask && deletedMask[i]) continue
            const sx = screenPositions[i * 2]
            const sy = screenPositions[i * 2 + 1]
            const tx = i % texWidth
            const ty = Math.floor(i / texWidth)
            const inside = sx >= 0 && sx >= minX && sx <= maxX && sy >= minY && sy <= maxY
            stateData[ty * texWidth + tx] = inside ? 255 : 0
            if (inside) selectedArr.push(i)
        }
    } else if (type === 'lasso' || type === 'polygon') {
        const { poly } = payload
        let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity
        for (const p of poly) {
            if (p.x < bMinX) bMinX = p.x
            if (p.x > bMaxX) bMaxX = p.x
            if (p.y < bMinY) bMinY = p.y
            if (p.y > bMaxY) bMaxY = p.y
        }
        function pointInPolygon(px, py) {
            let inside = false
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].x, yi = poly[i].y
                const xj = poly[j].x, yj = poly[j].y
                if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside
            }
            return inside
        }
        for (let i = 0; i < numSplats; i++) {
            if (deletedMask && deletedMask[i]) continue
            const sx = screenPositions[i * 2]
            const sy = screenPositions[i * 2 + 1]
            const tx = i % texWidth
            const ty = Math.floor(i / texWidth)
            let inside = false
            if (sx >= 0 && sx >= bMinX && sx <= bMaxX && sy >= bMinY && sy <= bMaxY) {
                inside = pointInPolygon(sx, sy)
            }
            stateData[ty * texWidth + tx] = inside ? 255 : 0
            if (inside) selectedArr.push(i)
        }
    }

    self.postMessage({ stateData, selectedArr }, [stateData.buffer])
}
`

class SelectionWorker {
    constructor() {
        const blob = new Blob([WORKER], { type: 'application/javascript' })
        this._url = URL.createObjectURL(blob)
        this._worker = new Worker(this._url)
        this._pending = false
    }

    run(type, numSplats, texWidth, screenPositions, payload, deletedMask) {
        return new Promise((resolve) => {
            this._worker.onmessage = ({ data }) => {
                this._pending = false
                resolve(data)
            }
            this._pending = true
            const transfers = [screenPositions.buffer]
            if (payload.paintPixels) transfers.push(payload.paintPixels.buffer)
            this._worker.postMessage({ type, numSplats, texWidth, screenPositions, payload, deletedMask }, transfers)
        })
    }

    destroy() {
        this._worker.terminate()
        URL.revokeObjectURL(this._url)
    }
}
class BaseStrategy {
    constructor({ centers, numSplats, texWidth, texHeight, camera, stateData, onChanged, gsplatComp, getDeletedSet }) {
        this.centers = centers
        this.numSplats = numSplats
        this.texWidth = texWidth
        this.texHeight = texHeight
        this.camera = camera
        this._stateData = stateData
        this.onChanged = onChanged
        this.gsplatComp = gsplatComp
        this._screenPositions = new Float32Array(numSplats * 2)
        this._projDirty = true
        this.getDeletedSet = getDeletedSet
        this._worker = new SelectionWorker()
    }

    _projectAll() {
        const worldTransform = this.gsplatComp.entity.getWorldTransform()
        const wp = new Vec3()
        const sp = new Vec3()
        for (let i = 0; i < this.numSplats; i++) {
            wp.set(this.centers[i * 3], this.centers[i * 3 + 1], this.centers[i * 3 + 2])
            worldTransform.transformPoint(wp, wp)
            this.camera.camera.worldToScreen(wp, sp)
            this._screenPositions[i * 2] = sp.z < 0 ? -1 : sp.x
            this._screenPositions[i * 2 + 1] = sp.z < 0 ? -1 : sp.y
        }
        this._projDirty = false
    }

    _buildDeletedMask() {
        const deletedSet = this.getDeletedSet ? this.getDeletedSet() : null
        if (!deletedSet || deletedSet.size === 0) return null
        const mask = new Uint8Array(this.numSplats)
        deletedSet.forEach((i) => {
            if (i >= 0 && i < this.numSplats) mask[i] = 1
        })
        return mask
    }

    async _runWorker(type, payload) {
        if (this._projDirty) this._projectAll()
        const screenCopy = new Float32Array(this._screenPositions)
        const deletedMask = this._buildDeletedMask()
        const { stateData, selectedArr } = await this._worker.run(
            type,
            this.numSplats,
            this.texWidth,
            screenCopy,
            payload,
            deletedMask,
        )
        this._stateData.set(stateData)
        this.onChanged(new Set(selectedArr))
    }

    destroy() {
        this._worker.destroy()
    }
}

class BrushStrategy extends BaseStrategy {
    constructor(opts) {
        super(opts)
        this.radius = 24
        this._isDown = false
        this._x = 0
        this._y = 0

        this._paintCanvas = document.createElement('canvas')
        this._paintCanvas.width = opts.overlay.width
        this._paintCanvas.height = opts.overlay.height
        this._paintCtx = this._paintCanvas.getContext('2d')

        this._strokeCanvas = document.createElement('canvas')
        this._strokeCanvas.width = opts.overlay.width
        this._strokeCanvas.height = opts.overlay.height
        this._strokeCtx = this._strokeCanvas.getContext('2d')
        this._setupStrokeCtx()
    }

    _setupStrokeCtx() {
        const ctx = this._strokeCtx
        ctx.strokeStyle = 'rgba(255, 220, 0, 1)'
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.lineWidth = this.radius * 2
    }

    onPointerDown(x, y, e) {
        if (e.button !== 0) return
        this._isDown = true
        this._x = x
        this._y = y
        const ctx = this._strokeCtx
        ctx.beginPath()
        ctx.arc(x, y, this.radius, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 220, 0, 1)'
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(x, y)

        const pctx = this._paintCtx
        pctx.beginPath()
        pctx.arc(x, y, this.radius, 0, Math.PI * 2)
        pctx.fillStyle = 'rgba(255,255,255,1)'
        pctx.fill()

        pctx.beginPath()
        pctx.moveTo(x, y)
    }

    onPointerMove(x, y) {
        this._x = x
        this._y = y
        if (!this._isDown) return

        const ctx = this._strokeCtx
        ctx.lineWidth = this.radius * 2
        ctx.lineTo(x, y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x, y)

        const pctx = this._paintCtx
        pctx.lineWidth = this.radius * 2
        pctx.strokeStyle = 'rgba(255,255,255,1)'
        pctx.lineCap = 'round'
        pctx.lineJoin = 'round'
        pctx.lineTo(x, y)
        pctx.stroke()
        pctx.beginPath()
        pctx.moveTo(x, y)
    }

    async onPointerUp() {
        if (!this._isDown) return
        this._isDown = false

        const imageData = this._paintCtx.getImageData(0, 0, this._paintCanvas.width, this._paintCanvas.height)
        const paintPixels = new Uint8ClampedArray(imageData.data)

        this._paintCtx.clearRect(0, 0, this._paintCanvas.width, this._paintCanvas.height)
        this._strokeCtx.clearRect(0, 0, this._strokeCanvas.width, this._strokeCanvas.height)

        await this._runWorker('brush', {
            paintPixels,
            paintWidth: this._paintCanvas.width,
            paintHeight: this._paintCanvas.height,
        })
    }

    onPointerLeave() {
        this._isDown = false
        this._paintCtx.clearRect(0, 0, this._paintCanvas.width, this._paintCanvas.height)
        this._strokeCtx.clearRect(0, 0, this._strokeCanvas.width, this._strokeCanvas.height)
    }

    draw(ctx, overlayW, overlayH) {
        ctx.clearRect(0, 0, overlayW, overlayH)
        ctx.globalAlpha = 0.25
        ctx.drawImage(this._strokeCanvas, 0, 0)
        ctx.globalAlpha = 1
        ctx.beginPath()
        ctx.arc(this._x, this._y, this.radius, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255, 220, 0, 0.9)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = 'rgba(255, 220, 0, 0.06)'
        ctx.fill()
    }

    setRadius(r) {
        this.radius = r
        this._setupStrokeCtx()
    }

    destroy() {
        super.destroy()
        this._paintCanvas = null
        this._paintCtx = null
        this._strokeCanvas = null
        this._strokeCtx = null
    }
}

class RectStrategy extends BaseStrategy {
    constructor(opts) {
        super(opts)
        this._isDown = false
        this._startX = 0
        this._startY = 0
        this._curX = 0
        this._curY = 0
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

    async onPointerUp() {
        if (!this._isDown) return
        this._isDown = false
        await this._runWorker('rect', {
            minX: Math.min(this._startX, this._curX),
            maxX: Math.max(this._startX, this._curX),
            minY: Math.min(this._startY, this._curY),
            maxY: Math.max(this._startY, this._curY),
        })
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

    destroy() {
        super.destroy()
    }
}

class LassoStrategy extends BaseStrategy {
    constructor(opts) {
        super(opts)
        this._isDown = false
        this._points = []
    }

    onPointerDown(x, y) {
        this._isDown = true
        this._points = [{ x, y }]
    }

    onPointerMove(x, y) {
        if (!this._isDown) return
        this._points.push({ x, y })
    }

    async onPointerUp() {
        if (!this._isDown) return
        this._isDown = false
        const points = this._points
        this._points = []
        if (points.length > 2) await this._runWorker('lasso', { poly: points })
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

    destroy() {
        super.destroy()
    }
}

class PolygonStrategy extends BaseStrategy {
    constructor(opts) {
        super(opts)
        this._vertices = []
        this._mouseX = 0
        this._mouseY = 0
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
            const dx = x - first.x,
                dy = y - first.y
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

    async _closeAndSelect() {
        if (this._vertices.length < 3) {
            this._vertices = []
            return
        }
        const poly = [...this._vertices]
        this._vertices = []
        await this._runWorker('polygon', { poly })
    }

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
                const dx = this._mouseX - v.x,
                    dy = this._mouseY - v.y
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

    destroy() {
        super.destroy()
    }
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
    constructor({ canvas, camera, gsplatComp, events, app, settings }) {
        this.canvas = canvas
        this.camera = camera
        this.gsplatComp = gsplatComp
        this.events = events
        this.app = app
        this._brushRadius = 24
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
            getDeletedSet: () => new Set(this.settings.removedSplats || []),
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
        this._appEventHandles = [
            this.events.on('point-eraser:brush-size', (r) => {
                this._brushRadius = r
                if (this._activeStrategy?.setRadius) this._activeStrategy.setRadius(r)
            }),
            this.events.on('point-eraser:cancel', () => this._onCancel()),
            this.events.on('point-eraser:undo', () => this._onUndo()),
            this.events.on('point-eraser:redo', () => this._onRedo()),
            this.events.on('point-eraser:commit-delete', () => this._pushHistory()),
            this.events.on('camera:moved', () => {
                if (this._activeStrategy) this._activeStrategy._projDirty = true
            }),
        ]
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
        if (this._activeStrategy.setRadius) {
            this._activeStrategy.setRadius(this._brushRadius)
        }
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
        this._appEventHandles?.forEach((h) => this.events.offByHandle(h))
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
            stateData: this._stateData.slice(),
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
    clearSelectionStateOnly() {
        this._stateData.fill(0)
        this._selectedSet = new Set()
        const pixels = this._stateTex.lock()
        pixels.set(this._stateData)
        this._stateTex.unlock()
        this.gsplatComp.material.setParameter('splatState', this._stateTex)
        this.app.renderNextFrame = true
    }
    resetHistory() {
        this._historyIndex = -1
        this._history = []
    }
}
