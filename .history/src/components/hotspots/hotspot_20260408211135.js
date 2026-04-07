class Hotspot {
    constructor(camera, dom, data) {
        this.camera = camera
        this.dom = dom
        this.data = data
        this.id = data.id
        this.isDisplay = true
        this.isEdit = false
        this.hotspotBtn = null
        this.dragging = false
        this.resizing = false
        this.resizeEdge = null

        if (data.focus.position && !(data.focus.position instanceof Vec3)) {
            this.data.focus.position = new Vec3(data.focus.position.x, data.focus.position.y, data.focus.position.z)
        }
        if (data.text.topLeft && !(data.text.topLeft instanceof Vec3)) {
            this.data.text.topLeft = new Vec3(data.text.topLeft.x, data.text.topLeft.y, data.text.topLeft.z)
        }
        if (data.text.botRight && !(data.text.botRight instanceof Vec3)) {
            this.data.text.botRight = new Vec3(data.text.botRight.x, data.text.botRight.y, data.text.botRight.z)
        }

        this.createDiv()
        this.createLine()
        this.createDot()
        this.addDotDragEvents()
        this.addContentDragEvents()
    }

    setHotspotBtn(btn) {
        this.hotspotBtn = btn
    }

    // ── DOM creation ─────────────────────────
    createDot() {
        this.dot = document.createElement('div')
        this.dot.classList.add('hotspotDot')
        this.dot.style.cssText = 'position:absolute; border-radius:50%; cursor:grab;'
        this.dom.ui.appendChild(this.dot)
    }

    createLine() {
        const svgNS = 'http://www.w3.org/2000/svg'
        this.lineSvg = document.createElementNS(svgNS, 'svg')
        this.lineSvg.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;'
        this.line = document.createElementNS(svgNS, 'line')
        this.line.setAttribute('stroke-width', '1')
        this.lineSvg.appendChild(this.line)
        this.dom.ui.appendChild(this.lineSvg)
    }

    createDiv() {
        this.div = document.createElement('div')
        this.div.classList.add('hotspot')
        this.div.style.position = 'absolute'
        this.div.innerHTML = `<span>${this.data.text.content}</span>`
        this.textContentSpan = this.div.querySelector('span')
        this.div.style.color = this.data.textColor
        this.dom.ui.appendChild(this.div)
    }

    // ── Update loop ──────────────────────────
    update(updateContent = true, dotSize) {
        if (!modelEntity?.gsplat?.instance?.meshInstance?.node) return
        const containerRect = this.dom.ui.getBoundingClientRect()
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        const invWorldMatrix = new Mat4().copy(worldMatrix).invert()
        const focusWorldPos = new Vec3()
        worldMatrix.transformPoint(this.data.focus.position, focusWorldPos)
        const focusScreenPos = this.camera.worldToScreen(focusWorldPos)
        this.updateDotLocalBounds(focusWorldPos, invWorldMatrix, dotSize)
        this.updateTextContent(focusScreenPos, worldMatrix, containerRect, updateContent)
        this.updateDot(worldMatrix, focusScreenPos)
        this.updateLine(focusScreenPos)
    }

    updateDotLocalBounds(focusWorldPos, invWorldMatrix, size) {
        if (!size && this.data.dot.topLeft && this.data.dot.botRight) {
            if (!(this.data.dot.topLeft instanceof Vec3)) {
                this.data.dot.topLeft = new Vec3(
                    this.data.dot.topLeft.x,
                    this.data.dot.topLeft.y,
                    this.data.dot.topLeft.z,
                )
                this.data.dot.botRight = new Vec3(
                    this.data.dot.botRight.x,
                    this.data.dot.botRight.y,
                    this.data.dot.botRight.z,
                )
            }
            return
        }
        const focusScreenPos = this.camera.worldToScreen(focusWorldPos)
        const half = (size ?? this.data.dot.size ?? 30) / 2
        const cameraPos = this.camera.entity.getPosition()
        const zDepth = focusWorldPos.distance(cameraPos)
        const tl = new Vec3(focusScreenPos.x - half, focusScreenPos.y - half, zDepth)
        const br = new Vec3(focusScreenPos.x + half, focusScreenPos.y + half, zDepth)
        const worldTL = this.camera.screenToWorld(tl.x, tl.y, tl.z)
        const worldBR = this.camera.screenToWorld(br.x, br.y, br.z)
        const localTL = new Vec3()
        const localBR = new Vec3()
        invWorldMatrix.transformPoint(worldTL, localTL)
        invWorldMatrix.transformPoint(worldBR, localBR)
        this.data.dot.topLeft = localTL
        this.data.dot.botRight = localBR
    }

    updateDot(worldMatrix, focusScreenPos) {
        const dotWorldTL = new Vec3()
        const dotWorldBR = new Vec3()
        worldMatrix.transformPoint(this.data.dot.topLeft, dotWorldTL)
        worldMatrix.transformPoint(this.data.dot.botRight, dotWorldBR)
        const dotScreenTL = this.camera.worldToScreen(dotWorldTL)
        const dotScreenBR = this.camera.worldToScreen(dotWorldBR)
        const dotSize = Math.abs(dotScreenBR.x - dotScreenTL.x)

        this.dot.style.width = dotSize + 'px'
        this.dot.style.height = dotSize + 'px'

        const { style, stroke, strokeColor } = this.data.dot
        if (style === 'circle') {
            this.dot.style.background = 'transparent'
            this.dot.style.border = `${stroke}px solid ${strokeColor}`
        } else {
            this.dot.style.background = strokeColor
            this.dot.style.border = 'none'
        }

        this.dot.style.left = focusScreenPos.x - this.dot.offsetWidth / 2 + 'px'
        this.dot.style.top = focusScreenPos.y - this.dot.offsetHeight / 2 + 'px'
    }

    updateLine(focusScreenPos) {
        const divRect = this.div.getBoundingClientRect()
        const cx = divRect.left + divRect.width / 2
        const cy = divRect.top + divRect.height / 2
        const px = focusScreenPos.x
        const py = focusScreenPos.y
        const radius = this.dot.offsetWidth / 2
        const borderWidth = parseFloat(getComputedStyle(this.dot).borderWidth) || 0
        const edgeOffset = borderWidth * 0.5
        const dx = cx - px,
            dy = cy - py
        const dist = Math.sqrt(dx * dx + dy * dy)
        const dotInside = px >= divRect.left && px <= divRect.right && py >= divRect.top && py <= divRect.bottom
        const contentInDot = dist <= radius - edgeOffset

        if (dotInside || contentInDot) {
            this.line.style.display = 'none'
            return
        }

        this.line.style.display = 'block'
        let x2, y2
        if (py < divRect.top) {
            x2 = cx
            y2 = divRect.top
        } else if (py > divRect.bottom) {
            x2 = cx
            y2 = divRect.bottom
        } else if (px < divRect.left) {
            x2 = divRect.left
            y2 = cy
        } else {
            x2 = divRect.right
            y2 = cy
        }

        const dx2 = x2 - px,
            dy2 = y2 - py
        const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)
        const scale = (radius - edgeOffset) / dist2
        this.line.setAttribute('x1', px + dx2 * scale)
        this.line.setAttribute('y1', py + dy2 * scale)
        this.line.setAttribute('x2', x2)
        this.line.setAttribute('y2', y2)
        this.line.setAttribute('stroke', this.data.dot.strokeColor)
    }

    updateTextContent(focusScreenPos, worldMatrix, containerRect, updateContent) {
        this.textContentSpan.textContent = this.data.text.content
        this.textContentSpan.style.textAlign = this.data.text.align
        const contentWorldTL = new Vec3()
        const contentWorldBR = new Vec3()
        worldMatrix.transformPoint(this.data.text.topLeft, contentWorldTL)
        worldMatrix.transformPoint(this.data.text.botRight, contentWorldBR)
        const contentScreenTL = this.camera.worldToScreen(contentWorldTL)
        const contentScreenBR = this.camera.worldToScreen(contentWorldBR)
        const width = Math.abs(contentScreenBR.x - contentScreenTL.x)
        const height = Math.abs(contentScreenBR.y - contentScreenTL.y)
        this.div.style.fontWeight = this.data.text.bold ? 'bold' : 'normal'
        this.div.style.fontStyle = this.data.text.italic ? 'italic' : 'normal'
        this.div.style.backgroundColor = this.transparentColor(
            this.data.text.background,
            this.data.text.backgroundAlpha,
        )
        this.div.style.fontFamily = `"${this.data.text.font}", sans-serif`
        if (this.data.text.originHeight) {
            let fontSize = this.data.text.fontSize || 16
            const fontScaleX = width / this.data.text.originWidth
            const fontScaleY = height / this.data.text.originHeight
            const fontScale = Math.min(fontScaleX, fontScaleY, hotspotMaxScale)
            const minFontSize = Math.min(16, fontSize)
            fontSize = Math.max(minFontSize, Math.round(fontSize * fontScale))
            this.div.style.fontSize = fontSize + 'px'
        }
        if (updateContent && this.isDisplay) {
            const dotRect = this.dot.getBoundingClientRect()
            const dotWidth = dotRect.width
            const dotHeight = dotRect.height
            const dotPartiallyOutside =
                focusScreenPos.x + dotWidth / 2 < 0 ||
                focusScreenPos.y + dotHeight / 2 < 0 ||
                focusScreenPos.x - dotWidth / 2 > containerRect.width ||
                focusScreenPos.y - dotHeight / 2 > containerRect.height ||
                focusScreenPos.y - dotHeight / 2 < 0 ||
                focusScreenPos.x - dotWidth / 2 < 0
            if (dotPartiallyOutside) {
                this.div.style.display = 'none'
                this.div.style.visibility = 'hidden'
                this.lineSvg.style.display = 'none'
                this.dot.style.display = 'none'
                delete this.initialDx
                delete this.initialDy
                delete this.div.hasAdjusted
                return
            } else {
                this.div.style.display = 'flex'
                this.div.style.visibility = 'hidden'
                this.lineSvg.style.display = 'block'
                this.dot.style.display = 'block'
            }
            let scaleWidth = Math.max(100, Math.min(width, this.data.text.originWidth * hotspotMaxScale))
            let scaleHeight = Math.max(32, Math.min(height, this.data.text.originHeight * hotspotMaxScale))
            let finalLeft = Math.min(Math.max(contentScreenTL.x, 0), containerRect.width - scaleWidth - 20)
            let finalTop = Math.min(Math.max(contentScreenTL.y, 0), containerRect.height - scaleHeight - 20)
            const dotCenterX = dotRect.left + dotRect.width / 2
            const dotCenterY = dotRect.top + dotRect.height / 2
            const margin = 20
            const willOverlap = (l, t) =>
                l < dotRect.right &&
                l + scaleWidth > dotRect.left &&
                t < dotRect.bottom &&
                t + scaleHeight > dotRect.top
            const initiallyOverlap = willOverlap(finalLeft, finalTop)
            if (initiallyOverlap && !this.div.hasAdjusted) {
                let divCenterY = finalTop + scaleHeight / 2
                if (divCenterY < dotCenterY) {
                    finalTop = dotRect.top - scaleHeight - margin
                    if (finalTop < 0 && dotRect.bottom + scaleHeight + margin < containerRect.height)
                        finalTop = dotRect.bottom + margin
                } else {
                    finalTop = dotRect.bottom + margin
                    if (finalTop + scaleHeight > containerRect.height && dotRect.top - scaleHeight - margin > 0)
                        finalTop = dotRect.top - scaleHeight - margin
                }
                if (willOverlap(finalLeft, finalTop)) {
                    if (dotRect.right + scaleWidth + margin < containerRect.width) {
                        finalLeft = dotRect.right + margin
                    } else if (dotRect.left - scaleWidth - margin > 0) {
                        finalLeft = dotRect.left - scaleWidth - margin
                    }
                }
                this.initialDx = finalLeft + scaleWidth / 2 - dotCenterX
                this.initialDy = finalTop + scaleHeight / 2 - dotCenterY
                this.div.hasAdjusted = true
            } else if (this.div.hasAdjusted) {
                finalLeft = dotCenterX + this.initialDx - scaleWidth / 2
                finalTop = dotCenterY + this.initialDy - scaleHeight / 2
                finalLeft = Math.min(Math.max(finalLeft, 0), containerRect.width - scaleWidth)
                finalTop = Math.min(Math.max(finalTop, 0), containerRect.height - scaleHeight)
                if (!initiallyOverlap && !willOverlap(finalLeft, finalTop)) {
                    delete this.div.hasAdjusted
                    delete this.initialDx
                    delete this.initialDy
                    finalLeft = Math.min(Math.max(contentScreenTL.x, 0), containerRect.width - scaleWidth)
                    finalTop = Math.min(Math.max(contentScreenTL.y, 0), containerRect.height - scaleHeight)
                }
            } else {
                delete this.div.hasAdjusted
                delete this.initialDx
                delete this.initialDy
            }
            finalLeft = Math.min(Math.max(finalLeft, 0), containerRect.width - scaleWidth)
            finalTop = Math.min(Math.max(finalTop, 0), containerRect.height - scaleHeight)
            this.div.style.left = finalLeft + 'px'
            this.div.style.top = finalTop + 'px'
            this.div.style.width = scaleWidth + 'px'
            this.div.style.height = scaleHeight + 'px'
            const _cw = this.dom.ui.offsetWidth || containerRect.width
            const _ch = this.dom.ui.offsetHeight || containerRect.height
            const actualW = this.div.offsetWidth
            const actualH = this.div.offsetHeight
            let adjLeft = parseFloat(this.div.style.left)
            let adjTop = parseFloat(this.div.style.top)
            adjLeft = Math.min(Math.max(adjLeft, 0), _cw - actualW - 4)
            adjTop = Math.min(Math.max(adjTop, 0), (this.dom.ui.offsetHeight || containerRect.height) - actualH - 4)
            const dotCX = focusScreenPos.x
            const dotCY = focusScreenPos.y
            const dotR = this.dot.offsetWidth / 2 + 8
            const overlapsX = adjLeft < dotCX + dotR && adjLeft + actualW > dotCX - dotR
            const overlapsY = adjTop < dotCY + dotR && adjTop + actualH > dotCY - dotR

            if (overlapsX && overlapsY) {
                const tryTop = dotCY - dotR - actualH - 4
                const tryBottom = dotCY + dotR + 4

                if (tryTop >= 0) {
                    adjTop = tryTop
                } else if (tryBottom + actualH <= _ch) {
                    adjTop = tryBottom
                } else {
                    adjTop = Math.min(Math.max(adjTop, 0), _ch - actualH - 4)
                }
            }
            this.div.style.left = adjLeft + 'px'
            this.div.style.top = adjTop + 'px'
            this.div.style.visibility = 'visible'
        }
    }

    // ── Show / Hide / Destroy ─────────────────
    show(data) {
        if(data){
            this.data = data
            this.update(true, this.data.dot.size)
        }
        this.isDisplay = true
        this.div.style.display = 'flex'
        this.lineSvg.style.display = 'block'
        this.dot.style.display = 'block'
        if (this.hotspotBtn) this.hotspotBtn.setActiveColor()
    }

    hide() {
        console.log("run in")
        this.isDisplay = false
        this.div.style.display = 'none'
        this.lineSvg.style.display = 'none'
        this.dot.style.display = 'none'
        if (this.hotspotBtn) this.hotspotBtn.setUnactiveColor()
    }

    destroy() {
        this.div.remove()
        this.dot.remove()
        this.lineSvg.remove()
    }

    // ── Drag events ──────────────────────────
    addDotDragEvents() {
        let dragging = false
        let startX = 0,
            startY = 0

        this.dot.addEventListener('pointerdown', (e) => {
            e.stopPropagation()
            dragging = true
            this.dot.setPointerCapture(e.pointerId)
            startX = e.clientX
            startY = e.clientY
            this.dot.style.cursor = 'grabbing'
        })

        this.dot.addEventListener('pointermove', (e) => {
            if (!dragging) return
            const newLeft = parseFloat(this.dot.style.left) + (e.clientX - startX)
            const newTop = parseFloat(this.dot.style.top) + (e.clientY - startY)
            this.dot.style.left = newLeft + 'px'
            this.dot.style.top = newTop + 'px'
            startX = e.clientX
            startY = e.clientY
            const r = this.dot.getBoundingClientRect()
            this.updateLine({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
        })

        this.dot.addEventListener('pointerup', (e) => {
            if (!dragging) return
            dragging = false
            this.dot.releasePointerCapture(e.pointerId)
            this.dot.style.cursor = 'grab'
            const screenX = parseFloat(this.dot.style.left) + this.dot.offsetWidth / 2
            const screenY = parseFloat(this.dot.style.top) + this.dot.offsetHeight / 2
            const newPos = pickModelLocalPoint(screenX, screenY, this.camera)
            if (newPos) this.data.focus.position = newPos.clone()
        })
    }

    addContentDragEvents() {
        const edgeSize = 8,
            minSize = 20

        this.div.addEventListener('pointermove', (e) => {
            if (this.dragging || this.resizing) return
            const rect = this.div.getBoundingClientRect()
            const onL = e.clientX < rect.left + edgeSize
            const onR = e.clientX > rect.right - edgeSize
            const onT = e.clientY < rect.top + edgeSize
            const onB = e.clientY > rect.bottom - edgeSize
            if ((onL && onT) || (onR && onB)) this.div.style.cursor = 'nwse-resize'
            else if ((onR && onT) || (onL && onB)) this.div.style.cursor = 'nesw-resize'
            else if (onL || onR) this.div.style.cursor = 'ew-resize'
            else if (onT || onB) this.div.style.cursor = 'ns-resize'
            else this.div.style.cursor = 'grab'
        })

        this.div.addEventListener('pointerdown', (e) => {
            e.stopPropagation()
            const rect = this.div.getBoundingClientRect()
            const onL = e.clientX < rect.left + edgeSize
            const onR = e.clientX > rect.right - edgeSize
            const onT = e.clientY < rect.top + edgeSize
            const onB = e.clientY > rect.bottom - edgeSize
            if (onL && onT) this.resizeEdge = 'top-left'
            else if (onR && onT) this.resizeEdge = 'top-right'
            else if (onL && onB) this.resizeEdge = 'bottom-left'
            else if (onR && onB) this.resizeEdge = 'bottom-right'
            else if (onL) this.resizeEdge = 'left'
            else if (onR) this.resizeEdge = 'right'
            else if (onT) this.resizeEdge = 'top'
            else if (onB) this.resizeEdge = 'bottom'

            if (this.resizeEdge) {
                this.resizing = true
                this.startX = e.clientX
                this.startY = e.clientY
                this.startWidth = this.div.offsetWidth
                this.startHeight = this.div.offsetHeight
                this.startLeft = this.div.offsetLeft
                this.startTop = this.div.offsetTop
            } else {
                this.dragging = true
                this.startX = e.clientX - this.div.offsetLeft
                this.startY = e.clientY - this.div.offsetTop
            }
            this.div.setPointerCapture(e.pointerId)
        })

        this.div.addEventListener('pointermove', (e) => {
            if (!this.dragging && !this.resizing) return
            if (this.dragging) {
                this.div.style.left = e.clientX - this.startX + 'px'
                this.div.style.top = e.clientY - this.startY + 'px'
            } else {
                const dx = e.clientX - this.startX
                const dy = e.clientY - this.startY
                let newL = this.startLeft,
                    newT = this.startTop
                let newW = this.startWidth,
                    newH = this.startHeight
                if (this.resizeEdge.includes('left')) {
                    newL = this.startLeft + dx
                    newW = this.startWidth - dx
                }
                if (this.resizeEdge.includes('right')) newW = this.startWidth + dx
                if (this.resizeEdge.includes('top')) {
                    newT = this.startTop + dy
                    newH = this.startHeight - dy
                }
                if (this.resizeEdge.includes('bottom')) newH = this.startHeight + dy
                if (newW >= minSize) {
                    this.div.style.left = newL + 'px'
                    this.div.style.width = newW + 'px'
                }
                if (newH >= minSize) {
                    this.div.style.top = newT + 'px'
                    this.div.style.height = newH + 'px'
                }
            }
            this.update(false)
        })

        this.div.addEventListener('pointerup', (e) => {
            this.isEdit = false
            this.dragging = false
            this.resizing = false
            this.resizeEdge = null
            this.div.releasePointerCapture(e.pointerId)
            this.div.style.cursor = 'default'
            const { topLeft, botRight, originWidth, originHeight } = this.getLocalContentPosByDiv()
            this.data.text.topLeft = topLeft
            this.data.text.botRight = botRight
            this.data.text.originWidth = originWidth
            this.data.text.originHeight = originHeight
        })
    }
    getLocalContentPosByDiv() {
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        const invWorldMatrix = new Mat4().copy(worldMatrix).invert()

        const left = parseFloat(this.div.style.left)
        const top = parseFloat(this.div.style.top)
        const right = left + this.div.offsetWidth
        const bottom = top + this.div.offsetHeight

        const focusWorldPos = new Vec3()
        worldMatrix.transformPoint(this.data.focus.position, focusWorldPos)
        const cameraPos = this.camera.entity.getPosition()
        const zDepth = focusWorldPos.distance(cameraPos)

        const contentWorldTL = this.camera.screenToWorld(left, top, zDepth)
        const contentWorldBR = this.camera.screenToWorld(right, bottom, zDepth)

        const contentLocalTL = new Vec3()
        const contentLocalBR = new Vec3()
        invWorldMatrix.transformPoint(contentWorldTL, contentLocalTL)
        invWorldMatrix.transformPoint(contentWorldBR, contentLocalBR)

        const contentScreenTL = this.camera.worldToScreen(contentWorldTL)
        const contentScreenBR = this.camera.worldToScreen(contentWorldBR)
        const originWidth = Math.abs(contentScreenBR.x - contentScreenTL.x)
        const originHeight = Math.abs(contentScreenBR.y - contentScreenTL.y)

        return {
            topLeft: contentLocalTL,
            botRight: contentLocalBR,
            originWidth,
            originHeight,
        }
    }

    transparentColor(color, alpha = 0.5) {
        if (!color) return ''
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (m) return `rgba(${m[1]},${m[2]},${m[3]},${alpha})`
        const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
        if (hex) {
            const full =
                hex[1].length === 3
                    ? hex[1]
                          .split('')
                          .map((c) => c + c)
                          .join('')
                    : hex[1]
            const r = parseInt(full.slice(0, 2), 16)
            const g = parseInt(full.slice(2, 4), 16)
            const b = parseInt(full.slice(4, 6), 16)
            return `rgba(${r},${g},${b},${alpha})`
        }
        return color
    }
}
