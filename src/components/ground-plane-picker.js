class GroundPlanePicker {
    constructor(app, camEntity) {
        this._app = app
        this._cam = camEntity
        this._points = [] // local space Vec3, tối đa 3
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
        if (!modelEntity) return localPts.map(p => new Vec3(p.x, p.y, p.z))
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        return localPts.map(p => {
            const w = new Vec3()
            worldMatrix.transformPoint(p, w)
            return w
        })
    }

    // Trả về index điểm gần click nhất trên screen, hoặc -1 nếu không có điểm nào trong radius
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

    // Thêm điểm mới (< 3) hoặc replace điểm gần nhất trên screen (đã đủ 3)
    handleClick(localPoint, screenX, screenY) {
        if(this._points.length>=3)return
        if (this._points.length < 3) {
            // Kiểm tra có click vào điểm cũ không → xóa
            const nearIdx = this.findNearestPointIndex(screenX, screenY)
            if (nearIdx !== -1) {
                this._points.splice(nearIdx, 1)
            } else {
                this._points.push(new Vec3(localPoint.x, localPoint.y, localPoint.z))
            }
        } 
        // else {
        //     // Đủ 3 điểm: click vào dot → xóa, click vào chỗ khác → replace điểm gần nhất
        //     const nearIdx = this.findNearestPointIndex(screenX, screenY)
        //     if (nearIdx !== -1) {
        //         // Click vào dot cũ → xóa điểm đó
        //         this._points.splice(nearIdx, 1)
        //     } else {
        //         // Click chỗ khác → tìm điểm gần click nhất để replace
        //         const worldPts = this._localToWorld(this._points)
        //         let bestDist = Infinity
        //         let replaceIdx = 0
        //         worldPts.forEach((p, i) => {
        //             const s = this._w2s(p)
        //             const d = Math.sqrt((s.x - screenX) ** 2 + (s.y - screenY) ** 2)
        //             if (d < bestDist) { bestDist = d; replaceIdx = i }
        //         })
        //         this._points[replaceIdx] = new Vec3(localPoint.x, localPoint.y, localPoint.z)
        //     }
        // }
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

    _redraw() {
        this._svg.innerHTML = ''
        if (this._points.length === 0) return

        const pts = this._localToWorld(this._points)
        const COLORS = ['#ff4444', '#44ff44', '#4488ff']

        // Lines
        if (pts.length >= 2) {
            const indices = pts.length >= 3 ? [0,1, 1,2, 2,0] : [0,1]
            for (let k = 0; k < indices.length; k += 2) {
                const a = this._w2s(pts[indices[k]])
                const b = this._w2s(pts[indices[k+1]])
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
                line.setAttribute('x1', a.x); line.setAttribute('y1', a.y)
                line.setAttribute('x2', b.x); line.setAttribute('y2', b.y)
                line.setAttribute('stroke', 'rgba(255,255,255,0.6)')
                line.setAttribute('stroke-width', '1.5')
                line.setAttribute('stroke-dasharray', '4 3')
                this._svg.appendChild(line)
            }
        }

        // Normal arrow khi đủ 3 điểm
        if (pts.length >= 3) {
            const ab = new Vec3(pts[1].x-pts[0].x, pts[1].y-pts[0].y, pts[1].z-pts[0].z)
            const ac = new Vec3(pts[2].x-pts[0].x, pts[2].y-pts[0].y, pts[2].z-pts[0].z)
            const normal = new Vec3().cross(ab, ac)
            const nlen = Math.sqrt(normal.x**2 + normal.y**2 + normal.z**2)
            if (nlen > 0.0001) {
                normal.x /= nlen; normal.y /= nlen; normal.z /= nlen
                if (normal.y < 0) { normal.x *= -1; normal.y *= -1; normal.z *= -1 }

                const cx = (pts[0].x + pts[1].x + pts[2].x) / 3
                const cy = (pts[0].y + pts[1].y + pts[2].y) / 3
                const cz = (pts[0].z + pts[1].z + pts[2].z) / 3
                const ARROW_LEN = 0.3
                const center = new Vec3(cx, cy, cz)
                const tip = new Vec3(cx + normal.x*ARROW_LEN, cy + normal.y*ARROW_LEN, cz + normal.z*ARROW_LEN)

                const sc = this._w2s(center)
                const st = this._w2s(tip)

                const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'line')
                arrow.setAttribute('x1', sc.x); arrow.setAttribute('y1', sc.y)
                arrow.setAttribute('x2', st.x); arrow.setAttribute('y2', st.y)
                arrow.setAttribute('stroke', '#ffff00')
                arrow.setAttribute('stroke-width', '2.5')
                this._svg.appendChild(arrow)

                const dx = st.x - sc.x, dy = st.y - sc.y
                const slen = Math.sqrt(dx*dx + dy*dy) || 1
                const ux = dx/slen, uy = dy/slen
                const AH = 8
                const head = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
                head.setAttribute('points',
                    `${st.x},${st.y} ${st.x-ux*AH+(-uy)*4},${st.y-uy*AH+(ux)*4} ${st.x-ux*AH-(-uy)*4},${st.y-uy*AH-(ux)*4}`)
                head.setAttribute('fill', '#ffff00')
                this._svg.appendChild(head)

                const upTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text')
                upTxt.setAttribute('x', st.x + 8); upTxt.setAttribute('y', st.y + 4)
                upTxt.setAttribute('fill', '#ffff00')
                upTxt.setAttribute('font-size', '12')
                upTxt.setAttribute('font-weight', 'bold')
                upTxt.textContent = 'UP'
                this._svg.appendChild(upTxt)
            }
        }

        // Dots + labels
        pts.forEach((p, i) => {
            const s = this._w2s(p)

            const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            ring.setAttribute('cx', s.x); ring.setAttribute('cy', s.y)
            ring.setAttribute('r', '12'); ring.setAttribute('fill', 'none')
            ring.setAttribute('stroke', COLORS[i]); ring.setAttribute('stroke-width', '2')
            this._svg.appendChild(ring)

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
            dot.setAttribute('cx', s.x); dot.setAttribute('cy', s.y)
            dot.setAttribute('r', '5'); dot.setAttribute('fill', COLORS[i])
            this._svg.appendChild(dot)

            // Hint xóa
            const xHint = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            xHint.setAttribute('x', s.x - 4); xHint.setAttribute('y', s.y + 4)
            xHint.setAttribute('fill', 'rgba(255,255,255,0.5)')
            xHint.setAttribute('font-size', '10')
            xHint.textContent = '×'
            this._svg.appendChild(xHint)

            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            txt.setAttribute('x', s.x + 16); txt.setAttribute('y', s.y + 5)
            txt.setAttribute('fill', COLORS[i])
            txt.setAttribute('font-size', '13'); txt.setAttribute('font-weight', 'bold')
            txt.textContent = `P${i+1}`
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