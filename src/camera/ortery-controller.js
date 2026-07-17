const v$2 = new Vec33()
const QUALITY_BITS_PER_PIXEL = { standard: 0.07, high: 0.1, ultra: 0.15 }
const MIN_BITRATE = 2_500_000
const MAX_BITRATE = 20_000_000
class OtherController {
    focus = new Vec33()
    cameraRotation = new Quat3()
    smoothDamp = new SmoothDamp3(new Array(8).fill(0))
    distance = 1
    rotateSpeed = 0.04
    lerpDuration = 1.5
    lerpTime = 0
    targetPose = null
    startPose = null
    modelRotation = null
    originDistance
    currentYaw = 0
    currentPitch = 0
    minPitch = 0
    maxPitch = Math.PI / 2
    model = 'spherical'
    minDistance = 11
    maxDistance = 200
    resetPose = null
    inertiaVelX = 0
    inertiaVelY = 0
    inertiaDamping = 0.93
    inertiaMinSpeed = 0.0005
    pointerMoveHistory = []
    isFlick = false
    inertiaFlickThreshold = 0.005
    index = 0
    isSpin360Loop = false
    spinSpeed = 5
    fov = 50
    maxFov = 100
    minFov = 5
    spinDirection = 'cw'

    constructor({ global, bbox }) {
        this.global = global
        const { app, events, camera, settings, model } = global
        this.app = app
        this.bbox = bbox
        this.cameraEntity = camera
        this.events = events
        this.settings = settings
        this.model = settings.model
        this.initialModelRotation = modelEntity.localRotation.clone()
        this.initialModelPosition = modelEntity.localPosition.clone()
        if (this.settings.orientation.pose) {
            const { rotation: r, position: p } = this.settings.orientation.pose
            this.baseRotation = new Quat(r.x, r.y, r.z, r.w)
            this.basePosition = new Vec33(p.x, p.y, p.z)
            this.originEntityRotation = new Quat(r.x, r.y, r.z, r.w)
            this.originEntityPos = new Vec3(p.x, p.y, p.z)
        } else {
            this.baseRotation = modelEntity.localRotation.clone()
            this.basePosition = modelEntity.localPosition.clone()
            this.originEntityRotation = modelEntity.localRotation.clone()
            this.originEntityPos = modelEntity.localPosition.clone()
        }
        if (this.model === 'cylindrical' && Array.isArray(this.settings.cameras) && this.settings.cameras.length > 0) {
            const f = this.settings.cameras[0]
            if (
                typeof f.x === 'number' &&
                typeof f.alt === 'number' &&
                typeof f.y === 'number' &&
                !Number.isNaN(f.x) &&
                !Number.isNaN(f.alt) &&
                !Number.isNaN(f.y)
            ) {
                this.cylindricalCamPos = new Vec3(-f.x, f.alt, f.y)
            }
        }
        this.originModel = this.model
        this.originBboxPivot = this.bbox.center.clone()
        this.listenEvents()
        if (this.model === 'spherical') {
        }
    }
    startRecording({
        fps = 60,
        filename,
        region,
        onStarted,
        includeAudio = false,
        includeMessage = false,
        quality = 'high',
    }) {
        const srcCanvas = this.app.graphicsDevice.canvas
        const cropCanvas = document.createElement('canvas')
        const ctx = cropCanvas.getContext('2d', { alpha: false })

        const desiredWidth = region?.outputWidth ?? region?.width ?? srcCanvas.width
        const desiredHeight = region?.outputHeight ?? region?.height ?? srcCanvas.height

        const getRegion = () => {
            if (region?.width > 0 && region?.height > 0) {
                return { x: region.x ?? 0, y: region.y ?? 0, width: region.width, height: region.height }
            }
            return { x: 0, y: 0, width: srcCanvas.width, height: srcCanvas.height }
        }

        cropCanvas.width = desiredWidth
        cropCanvas.height = desiredHeight

        this.global.recording = true
        this.events.fire('record-start')

        const probeStream = cropCanvas.captureStream(0)
        const probeTrack = probeStream.getVideoTracks()[0]
        const supportsManualFrame = typeof probeTrack.requestFrame === 'function'

        let videoStream
        if (supportsManualFrame) {
            videoStream = probeStream
        } else {
            probeTrack.stop()
            videoStream = cropCanvas.captureStream(fps)
        }
        const videoTrack = videoStream.getVideoTracks()[0]

        this._includeAudio = includeAudio
        let combinedStream = videoStream

        if (includeAudio) {
            this._recordAudioCtx = new (window.AudioContext || window.webkitAudioContext)()
            const destination = this._recordAudioCtx.createMediaStreamDestination()
            this._recordAudioDestination = destination
            this._recordAudioSources = new Map()

            const silentOsc = this._recordAudioCtx.createOscillator()
            const silentGain = this._recordAudioCtx.createGain()
            silentGain.gain.value = 0
            silentOsc.connect(silentGain).connect(destination)
            silentOsc.start()
            this._silentOsc = silentOsc

            combinedStream = new MediaStream([...videoStream.getVideoTracks(), ...destination.stream.getAudioTracks()])
        }

        let accumulator = 0
        const frameInterval = 1 / fps
        const drawFrame = () => {
            const r = getRegion()
            ctx.drawImage(srcCanvas, r.x, r.y, r.width, r.height, 0, 0, cropCanvas.width, cropCanvas.height)
            if (includeMessage && this.global.recordPattern === 'story')
                this.drawActiveMessage(ctx, cropCanvas, srcCanvas, r)
            if (supportsManualFrame) videoTrack.requestFrame()
        }
        this._drawFrame = drawFrame

        const onPostRender = () => {
            accumulator += this._lastDt ?? frameInterval
            while (accumulator >= frameInterval) {
                drawFrame()
                accumulator -= frameInterval
            }
            if (this._includeAudio) this.connectActiveMessageAudio()
        }
        const onFrameEnd = () => {
            if (this.global.recording) {
                this.app.renderNextFrame = true
            }
        }

        this.app.on('postrender', onPostRender)
        this.app.on('frameend', onFrameEnd)
        this._stopPostRender = () => {
            this.app.off('postrender', onPostRender)
            this.app.off('frameend', onFrameEnd)
            this._drawFrame = null
            this._silentOsc?.stop()
            this._silentOsc = null
            this._recordAudioSources?.forEach((node) => node.disconnect())
            this._recordAudioSources?.clear()
            this._recordAudioSources = null
            this._recordAudioDestination = null
            this._recordAudioCtx?.close()
            this._recordAudioCtx = null
        }

        const hasAudioTrack = combinedStream.getAudioTracks().length > 0
        const mimeTypes = hasAudioTrack
            ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm']
            : ['video/webm;codecs=vp8', 'video/webm']
        const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) || ''
        const bitsPerPixel = QUALITY_BITS_PER_PIXEL[quality] ?? QUALITY_BITS_PER_PIXEL.high
        const targetBitrate = Math.round(desiredWidth * desiredHeight * fps * bitsPerPixel)
        const videoBitsPerSecond = Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, targetBitrate))

        const options = { videoBitsPerSecond }
        if (mimeType) options.mimeType = mimeType
        if (mimeType) options.mimeType = mimeType

        this.mediaRecorder = new MediaRecorder(combinedStream, options)
        const chunks = []
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data)
        }
        this.mediaRecorder.onstart = () => {
            onStarted?.()
        }
        this.mediaRecorder.onstop = () => {
            this.global.recording = false
            const blob = new Blob(chunks, { type: this.mediaRecorder.mimeType })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${filename}.webm`
            a.click()
            URL.revokeObjectURL(url)
        }
        this.mediaRecorder.start(500)
    }
    connectActiveMessageAudio() {
        const mm = this.global.messagesManager
        const audioEl = mm?.activeMessage?._audio
        if (!audioEl || !this._recordAudioDestination) return
        if (this._recordAudioSources.has(audioEl)) return
        try {
            const source = this._recordAudioCtx.createMediaElementSource(audioEl)
            source.connect(this._recordAudioDestination)
            source.connect(this._recordAudioCtx.destination)
            this._recordAudioSources.set(audioEl, source)
        } catch (e) {
            console.error('[PROD] createMediaElementSource error:', e)
        }
    }

    stopRecording({ discard = false } = {}) {
        if (this._stopPostRender) {
            this._stopPostRender()
            this._stopPostRender = null
        }
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            if (discard) this.mediaRecorder.onstop = null
            this.mediaRecorder.stop()
        }
        this._includeAudio = false
        this.global.recording = false
        this.global.recordPattern = null

        const activeMessage = this.global.messagesManager?.activeMessage
        if (activeMessage) {
            activeMessage.setAudioRecordEnabled(true)
            activeMessage.setLiveHidden(false)
        }

        this.events.fire('record-end')
    }
    drawActiveMessage(ctx, cropCanvas, srcCanvas, region) {
        const mm = this.global.messagesManager
        const message = mm?.activeMessage
        if (!message || !message.isDisplay) return
        if (mm.isTranslating) return
        if (message.div.style.display === 'none') return
        const containerRect = mm.dom.ui.getBoundingClientRect()
        if (!containerRect.width || !containerRect.height) return

        const scaleToSrcX = srcCanvas.width / containerRect.width
        const scaleToSrcY = srcCanvas.height / containerRect.height
        const scaleToCropX = cropCanvas.width / region.width
        const scaleToCropY = cropCanvas.height / region.height
        const scaleLenX = scaleToSrcX * scaleToCropX
        const scaleLenY = scaleToSrcY * scaleToCropY
        const toCanvas = (cssX, cssY) => ({
            x: (cssX * scaleToSrcX - region.x) * scaleToCropX,
            y: (cssY * scaleToSrcY - region.y) * scaleToCropY,
        })
        const relRect = (rect) => ({
            left: rect.left - containerRect.left,
            top: rect.top - containerRect.top,
            width: rect.width,
            height: rect.height,
        })

        const rootFontSize = 18

        const divRect = relRect(message.div.getBoundingClientRect())
        const boxTL = toCanvas(divRect.left, divRect.top)
        const boxW = divRect.width * scaleLenX
        const boxH = divRect.height * scaleLenY
        const textData = message.data.text

        ctx.save()
        ctx.fillStyle = transparentColor(textData.background, textData.backgroundAlpha)
        roundRectPath(ctx, boxTL.x, boxTL.y, boxW, boxH, 0.1875 * rootFontSize * scaleLenX)
        ctx.fill()
        ctx.restore()

        ctx.save()
        const fontSize = (parseFloat(message.div.style.fontSize) || textData.fontSize || 16) * scaleLenY
        const fontWeight = textData.bold ? 'bold' : 'normal'
        const fontStyle = textData.italic ? 'italic' : 'normal'
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
        ctx.fillStyle = textData.color || '#000'
        ctx.textBaseline = 'top'
        const padding = 0.5 * rootFontSize * scaleLenX
        const maxTextWidth = Math.max(0, boxW - padding * 2)
        const lines = wrapCanvasText(ctx, textData.content, maxTextWidth)
        const lineHeight = fontSize * 1.3
        let textY = boxTL.y + (boxH - lines.length * lineHeight) / 2
        ctx.textAlign = textData.align === 'left' ? 'left' : textData.align === 'right' ? 'right' : 'center'
        const textX =
            textData.align === 'left'
                ? boxTL.x + padding
                : textData.align === 'right'
                  ? boxTL.x + boxW - padding
                  : boxTL.x + boxW / 2
        for (const line of lines) {
            ctx.fillText(line, textX, textY)
            textY += lineHeight
        }
        ctx.restore()

        if (message.dot.style.display !== 'none') {
            const dotRect = relRect(message.dot.getBoundingClientRect())
            const dotTL = toCanvas(dotRect.left, dotRect.top)
            const dotW = dotRect.width * scaleLenX
            const dotH = dotRect.height * scaleLenY
            const cx = dotTL.x + dotW / 2
            const cy = dotTL.y + dotH / 2
            const { style, stroke, strokeColor } = message.data.dot
            ctx.save()
            ctx.beginPath()
            ctx.ellipse(cx, cy, Math.max(dotW, 0) / 2, Math.max(dotH, 0) / 2, 0, 0, Math.PI * 2)
            if (style === 'circle') {
                ctx.strokeStyle = strokeColor
                ctx.lineWidth = Math.max(1, stroke * scaleLenX)
                ctx.stroke()
            } else {
                ctx.fillStyle = strokeColor
                ctx.fill()
            }
            ctx.restore()

            if (message.line.style.display !== 'none') {
                const x1 = parseFloat(message.line.getAttribute('x1'))
                const y1 = parseFloat(message.line.getAttribute('y1'))
                const x2 = parseFloat(message.line.getAttribute('x2'))
                const y2 = parseFloat(message.line.getAttribute('y2'))
                if (!Number.isNaN(x1) && !Number.isNaN(x2)) {
                    const p1 = toCanvas(x1 - containerRect.left, y1 - containerRect.top)
                    const p2 = toCanvas(x2 - containerRect.left, y2 - containerRect.top)
                    ctx.save()
                    ctx.strokeStyle = message.data.dot.strokeColor
                    ctx.lineWidth = Math.max(1, scaleLenX)
                    ctx.beginPath()
                    ctx.moveTo(p1.x, p1.y)
                    ctx.lineTo(p2.x, p2.y)
                    ctx.stroke()
                    ctx.restore()
                }
            }
        }

        if (message._audioBtn && message.data.audio?.show && message._audioBtnWrapper.style.display !== 'none') {
            const btnRect = relRect(message._audioBtn.getBoundingClientRect())
            const btnTL = toCanvas(btnRect.left, btnRect.top)
            const bw = btnRect.width * scaleLenX
            const bh = btnRect.height * scaleLenY
            const cx = btnTL.x + bw / 2
            const cy = btnTL.y + bh / 2
            const boxSize = Math.min(bw, bh)

            ctx.save()
            ctx.beginPath()
            ctx.ellipse(cx, cy, bw / 2, bh / 2, 0, 0, Math.PI * 2)
            ctx.fillStyle = transparentColor(message.data.audio.bgColor, message.data.audio.bgAlpha)
            ctx.fill()
            ctx.restore()

            const ringScale = boxSize / 36
            const ringR = 16 * ringScale
            ctx.save()
            ctx.beginPath()
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'
            ctx.lineWidth = 4.5 * ringScale
            ctx.stroke()

            ctx.beginPath()
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2)
            ctx.strokeStyle = 'rgba(0,0,0,0.3)'
            ctx.lineWidth = 3 * ringScale
            ctx.stroke()

            const pct =
                message._audio && message._audio.duration ? message._audio.currentTime / message._audio.duration : 0
            if (pct > 0) {
                const startAngle = -Math.PI / 2
                const endAngle = startAngle + Math.PI * 2 * pct
                ctx.beginPath()
                ctx.arc(cx, cy, ringR, startAngle, endAngle)
                ctx.strokeStyle = '#4CAF50'
                ctx.lineWidth = 2.5 * ringScale
                ctx.lineCap = 'round'
                ctx.stroke()
            }
            ctx.restore()

            const iconScale = boxSize / 28
            ctx.save()
            ctx.translate(cx - 7 * iconScale, cy - 7 * iconScale)
            ctx.scale(iconScale, iconScale)
            ctx.strokeStyle = message.data.audio.iconColor
            ctx.lineWidth = 1.2
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'

            ctx.beginPath()
            ctx.moveTo(2, 5)
            ctx.lineTo(4.5, 5)
            ctx.lineTo(7.5, 2.5)
            ctx.lineTo(7.5, 11.5)
            ctx.lineTo(4.5, 9)
            ctx.lineTo(2, 9)
            ctx.closePath()
            ctx.stroke()

            if (message._isPlaying) {
                ctx.beginPath()
                ctx.moveTo(9.5, 5)
                ctx.bezierCurveTo(10.3, 5.6, 10.8, 6.2, 10.8, 7)
                ctx.bezierCurveTo(10.8, 7.8, 10.3, 8.4, 9.5, 9)
                ctx.stroke()

                ctx.beginPath()
                ctx.moveTo(11, 3.8)
                ctx.bezierCurveTo(12.3, 4.7, 13, 5.8, 13, 7)
                ctx.bezierCurveTo(13, 8.2, 12.3, 9.3, 11, 10.2)
                ctx.stroke()
            } else {
                ctx.beginPath()
                ctx.moveTo(10, 4.5)
                ctx.lineTo(12.5, 9.5)
                ctx.stroke()

                ctx.beginPath()
                ctx.moveTo(12.5, 4.5)
                ctx.lineTo(10, 9.5)
                ctx.stroke()
            }
            ctx.restore()
        }
    }
    listenEvents() {
        this.events.on('record-setup', (data) => {
            const { pattern, includeMessage = false, includeAudio = false } = data
            this.events.fire('hide-ui')
            this.global.recordPattern = pattern
            this.global.recordIncludeMessage = includeMessage
            this.global.recordIncludeAudio = includeAudio
            switch (pattern) {
                case 'none':
                    this.startRecording(data)
                    break
                case 'spin':
                    this.reset({
                        onResetFinished: () => {
                            this.setSpinSettings()
                            this.isSpin360Loop = false
                            this.isRecordSpin = true
                            this.startRecording({
                                ...data,
                                onStarted: () => {
                                    this._drawFrame?.()
                                    this.spin360({
                                        model: this.model,
                                        onStop: () => {
                                            this.stopRecording()
                                            this.isRecordSpin = false
                                        },
                                    })
                                },
                            })
                        },
                    })
                    break
                case 'story':
                    this.isRecordStory = true
                    this.events.fire('message:goto-first', {
                        hideMessages: true,
                        onReady: () => {
                            this.startRecording({
                                ...data,
                                onStarted: () => {
                                    this._drawFrame?.()
                                    this.events.fire('message:start-auto', {
                                        onFinished: () => {
                                            this.stopRecording()
                                            this.isRecordStory = false
                                        },
                                        loop: false,
                                        hideMessages: true,
                                    })
                                },
                            })
                        },
                    })
                    break
            }
        })
        this.events.on('record-stop', ({ discard } = {}) => {
            if (this.isRecordSpin) this.stopSpin360()
            if (this.isRecordStory) this.events.fire('message:stop-auto', { hideMessages: true })
            this.stopRecording({ discard })
        })
        this.events.on('spin:toggle-play', () => {
            if (!this.global.settings.spin.enabled) return
            if (!this.global.isSpin360) {
                this.spin360({ model: this.originModel })
            } else {
                this.stopSpin360()
            }
        })
        this.events.on('inputEvent:reset-camera', () => {
            this.reset()
        })
        this.events.on('measurement:drag', (isDrag) => {
            this.isMeasurementDrag = isDrag
        })
        this.events.on('message:editing', (isEdit) => {
            this.isEditMessage = isEdit
            this.stopSpin360()
        })
        this.events.on('point-eraser:active', (active) => {
            this.isPointEraserActive = active
        })
        this.events.on('message:editing', (isEdit) => {
            this.isEditMessage = isEdit
            this.stopSpin360()
        })
        this.events.on('message:selected', () => {
            this.stopSpin360()
        })
        this.events.on('inputEvent', (eventName, event) => {
            switch (eventName) {
                case 'pointermove':
                    this.savePointerMoveHistory(event)
                    break
                case 'pointerdown':
                    this.closeInertia()
                    break
                case 'pointerup':
                    this.calcInertia()
                    break
            }
        })
        this.events.on('ortery:rotate', () => {
            this.stopSpin360()
        })

        //spin
        this.events.on('360spin-start', () => {
            this.setSpinSettings()
            this.spin360({ model: this.model })
            this.targetPose = null
        })
        this.events.on('360spin-stop', () => {
            this.stopSpin360()
        })
        this.events.on('spin:enabled', (v) => {
            if (v) this.setSpinSettings()
            this.stopSpin360()
        })
        this.events.on('spin-speed', (v) => (this.spinSpeed = v))
        this.events.on('spin-continuous', (v) => (this.isSpin360Loop = v))
        this.events.on('spin-axis', (v) => {
            if (this.originModel === 'spherical' && this.settings.spin.rotation) {
                const axes = getSpinAxes(this.settings.spin.rotation)
                const localAxis = axes[v]
                this.spinRotationAxis = modelEntity.localRotation.transformVector(
                    new Vec3(localAxis.x, localAxis.y, localAxis.z),
                )
            }
        })
        this.events.on('spin-direction', (v) => (this.spinDirection = v))

        this.events.on('setup-reset', () => this.reset())

        this.events.on('viewer:inertia', (value) => this.resetInertia())
        this.events.on('viewer:save-initview', () => this.saveInitview())
        this.events.on('viewer:remove-saved-view', () => this.removeInitview())
        this.events.on('viewer:lock-zoom-in', (value) => {
            const isCylindrical = this.model === 'cylindrical' && !!this.cylindricalCamPos
            const lockZoomIn = {
                locked: value,
                value: value ? this.getDistanceScale(isCylindrical) : this.minDistance,
            }
            this.settings.lockZoomIn = lockZoomIn
        })

        this.events.on('pivot:positionsynced', (position) => this.syncPivotPoint(position))
        this.events.on('pivot:edit', () => (this.isEditPivot = true))
        this.events.on('pivot:delete', () => {
            this.settings.pivot.position = null
            this.applyAabbPivot()
            this.isEditPivot = true
            this.reset({
                onResetFinished: () => {
                    this.saveInitview({ isShowToast: false, defaultDistance: true })
                },
            })
        })

        this.events.on('orientation:translate-y', ({ delta }) => {
            if (!this.isEditingOrientation) return
            this.stopSpin360()
            modelEntity.localPosition.y += delta
            this.basePosition.y += delta
            this.centerPivot.y += delta
            this.updateModelRotation()
            this.syncHierarchyAndRender()
        })
        this.events.on('orientation:spin', ({ speed, onStop }) => {
            this.spinSpeed = speed
            this.spin360({ onStop })
        })
        this.events.on('orientation:yaw-step', ({ deg }) => {
            if (!this.isEditingOrientation) return
            this.stopSpin360()
            const rad = degToRad(deg)
            const step = rad / this.rotateSpeed
            this.sphericalAxisRot(step, 0)
            this.updateModelRotation()
            this.syncHierarchyAndRender()
        })
        this.events.on('orientation:pitch-step', ({ deg }) => {
            if (!this.isEditingOrientation) return
            this.stopSpin360()
            const rad = degToRad(deg)
            const step = rad / this.rotateSpeed
            this.sphericalAxisRot(0, step)
            this.updateModelRotation()
            this.syncHierarchyAndRender()
        })
        this.events.on('orientation:roll', ({ deg }) => {
            if (!this.isEditingOrientation) return
            this.stopSpin360()
            const rad = degToRad(deg)
            this.axisRoll(rad)
            this.updateModelRotation()
            this.syncHierarchyAndRender()
        })
        this.events.on('orientation:reset', () => this.resetOrientation())
        this.events.on('orientation:groundplane', (points) => this.applyGroundPlaneOrientation(points))
        this.events.on('orientation:manual-apply', () => this.applyManualOrientation())
        this.events.on('orientation:switch-method', (currentMethod) => this.editOrientation(currentMethod))
        this.events.on('orientation:cancel', () => this.cancelOrientation())
        this.events.on('orientation:eulersynced', () => this.updateModelRotation())

        this.events.on('ortery-controller:transition', ({ entityInfo, lerpDuration, onTransitionFinished }) => {
            const { position: p, focus: f, rotation: r, distanceScale: d, yaw, pitch, isFullyInView } = entityInfo
            const startPose = {
                focus: this.focus.clone(),
                position: new Vec3(
                    modelEntity.localPosition.x,
                    modelEntity.localPosition.y,
                    modelEntity.localPosition.z,
                ),
                rotation: modelEntity.localRotation.clone(),
                distance: this.distance,
                fov: this.fov,
                yaw: this.currentYaw,
                pitch: this.currentPitch,
            }
            const targetPose = {
                focus: new Vec3(f.x, f.y, f.z),
                position: new Vec3(p.x, p.y, p.z),
                rotation: new Quat(r.x, r.y, r.z, r.w),
                distance: this.clampDistance(this.getActualDistance(d, isFullyInView)),
                fov: this.clampFov(this.getActualFov(d, isFullyInView)),
                yaw,
                pitch,
            }
            this.setupTransition({
                targetPose,
                startPose,
                lerpDuration,
                onTransitionFinished,
                transitionMode: this.originModel,
            })
        })
        this.events.on('point-eraser:commit-delete', (removedSplats) => {
            const {
                bbox: { center, halfExtents },
            } = calBbox({ modelEntity, removedSplats })
            this.syncPivotPoint(center)
            const sceneBound = new BoundingBox()
            sceneBound.center.copy(center)
            sceneBound.halfExtents.copy(halfExtents)
            sceneBound.setFromTransformedAabb(sceneBound, modelEntity.getWorldTransform())
            this.recalBoundingBox(sceneBound)
        })
        this.events.on('point-eraser:completed', () => {
            this.reset({
                onResetFinished: () => {
                    this.originEntityPos = modelEntity.localPosition.clone()
                    this.originEntityRotation = modelEntity.localRotation.clone()
                },
            })
        })
        this.events.on('point-eraser:reset', () => {
            const originTransform = new Mat4().setTRS(
                this.initialModelPosition,
                this.initialModelRotation,
                modelEntity.getLocalScale(),
            )
            const sceneBound = new BoundingBox()
            const gsplatBbox = modelEntity.gsplat.customAabb
            sceneBound.setFromTransformedAabb(gsplatBbox, originTransform)
            this.baseRotation = this.initialModelRotation.clone()
            this.basePosition = this.initialModelPosition.clone()
            this.originEntityPos = this.initialModelPosition.clone()
            this.originEntityRotation = this.initialModelRotation.clone()
            this.currentYaw = 0
            this.currentPitch = this.minPitch ?? 0
            this.centerPivot = sceneBound.center.clone()
            this.recalBoundingBox(sceneBound)
            this.reset()
        })
    }
    recalBoundingBox(sceneBound) {
        this.bbox = sceneBound
        let distance = this.getDeafultDistance(sceneBound.halfExtents)
        const result = new Camera()
        result.look(new Vec3(2, 0, 2).normalize().mulScalar(distance).add(sceneBound.center), sceneBound.center)
        let forward, fov
        if (this.originModel === 'cylindrical' && this.cylindricalCamPos) {
            result.position = this.cylindricalCamPos
            this.cameraEntity.setPosition(this.cylindricalCamPos)
            distance = this.cylindricalCamPos.distance(sceneBound.center)
            fov = this.calFitFOV()
            forward = sceneBound.center.clone().sub(this.cylindricalCamPos).normalize()
        } else {
            forward = sceneBound.center.clone().sub(result.position).normalize()
            fov = this.fov
        }
        this.originDistance = distance
        this.originFocus = sceneBound.center.clone()
        this.originBboxPivot = sceneBound.center.clone()
        this.originFov = fov
        this.resetPose = {
            ...result,
            distance,
            forward,
            fov,
            focus: sceneBound.center.clone(),
        }
    }
    applyAabbPivot() {
        this.centerPivot = this.originBboxPivot.clone()
        this.basePosition = this.originEntityPos ? this.originEntityPos.clone() : this.basePosition.clone()
    }

    syncPivotPoint(position) {
        if (!position) return
        const newCenterPivot = localToWorld(position)
        this.centerPivot = newCenterPivot
        this.basePosition = this.calcBasePositionFromPivot(newCenterPivot)
    }
    savePointerMoveHistory(event) {
        this.pointerMoveHistory.push({ t: performance.now(), x: event.clientX, y: event.clientY })
        if (this.pointerMoveHistory.length > 20) this.pointerMoveHistory.shift()
    }
    calcInertia() {
        const now = performance.now()
        const recent = this.pointerMoveHistory.filter((e) => now - e.t <= 80)
        let isFlick = false
        if (recent.length >= 2) {
            const first = recent[0]
            const last = recent[recent.length - 1]
            const dt = last.t - first.t || 1
            const dist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2)
            isFlick = dist / dt > 0.5
        }
        this.isFlick = isFlick
        if (!isFlick) {
            this.nertiaVelX = 0
            this.inertiaVelY = 0
        }
        this.pointerMoveHistory = []
    }
    closeInertia() {
        this.pointerMoveHistory = []
        this.isFlick = false
    }
    reset({ pose, useInitview = true, onResetFinished, transitionMode } = {}) {
        if (this._autoRotating) {
            this.stopSpin360()
        }
        if (this.isResetting) return
        this.events.fire('ortery:reset')
        if (!pose) pose = this.resetPose
        let forward
        if (pose.forward) {
            forward = pose.forward.clone()
        } else if (pose.position && pose.focus) {
            forward = pose.focus.clone().sub(pose.position).normalize()
        } else {
            forward = new Vec33(0, 0, -1)
        }
        v$2.copy(forward)

        if (!this.originDistance) this.originDistance = pose.distance
        if (!this.originFov) this.originFov = pose.fov
        if (!this.originFocus) this.originFocus = pose.focus
        this.cameraRotation = Quat3.lookRotation(v$2.clone().mulScalar(-1), Vec33.UP)
        this.rightCam = Vec33.RIGHT.clone().transformQuat(this.cameraRotation).normalize()
        this.upCam = Vec33.UP.clone().transformQuat(this.cameraRotation).normalize()

        const isFirstInit = !this.hasInitializedFocus
        if (isFirstInit) this.hasInitializedFocus = true

        let startFocus, startDistance, startFov, startYaw, startPitch
        let targetFocus, targetDistance, targetFov, targetYaw, targetPitch
        let targetPosition, targetRotation

        const initviewPose = this.settings.initview.pose
        if (initviewPose && useInitview) {
            const { position: p, rotation: r, focus: f, distanceScale: d, yaw, pitch, isFullyInView } = initviewPose
            targetFocus = new Vec3(f.x, f.y, f.z)
            targetDistance = isMobile
                ? Math.max(pose.distance, this.clampDistance(this.getActualDistance(d, isFullyInView)))
                : this.clampDistance(this.getActualDistance(d, isFullyInView))
            targetFov = isMobile
                ? Math.max(pose.fov, this.clampFov(this.getActualFov(d, isFullyInView)))
                : this.clampFov(this.getActualFov(d, isFullyInView))
            targetYaw = yaw || 0
            targetPitch = pitch || 0
            targetPosition = new Vec3(p.x, p.y, p.z)
            targetRotation = new Quat(r.x, r.y, r.z, r.w)
        } else {
            targetFocus = pose.focus.clone()
            targetDistance = this.clampDistance(pose.distance)
            targetFov = this.clampFov(pose.fov)
            targetYaw = 0
            targetPitch = 0
            targetPosition = this.originEntityPos ? this.originEntityPos.clone() : this.basePosition.clone()
            targetRotation = this.originEntityRotation ? this.originEntityRotation.clone() : this.baseRotation.clone()
        }
        if (isFirstInit) {
            startFocus = targetFocus.clone()
            startDistance = targetDistance
            startFov = targetFov
            startYaw = targetYaw
            startPitch = targetPitch
            if (this.settings.spin.enabled) {
                this.setSpinSettings()
                if (this.settings.spin.autoStart) {
                    this.spin360({ model: this.model })
                }
            }
        } else {
            startFocus = this.focus.clone()
            startDistance = this.distance
            startFov = this.fov
            startYaw = this.currentYaw
            startPitch = this.currentPitch
        }

        this.focus.copy(targetFocus)
        this.distance = targetDistance
        this.fov = targetFov

        if (isFirstInit) {
            modelEntity.localPosition.copy(targetPosition)
            modelEntity.localRotation.copy(targetRotation)
            this.modelRotation = targetRotation.clone()
            this.currentYaw = targetYaw
            this.currentPitch = targetPitch
            if (this.settings.pivot.position) {
                this.centerPivot = localToWorld(this.settings.pivot.position)
                this.basePosition = this.calcBasePositionFromPivot(this.centerPivot)
            } else {
                this.centerPivot = this.bbox.center.clone()
                this.basePosition = this.calcBasePositionFromPivot(this.centerPivot)
            }

            this.syncHierarchyAndRender()
            return
        }
        this.isResetting = true
        if (this.isEditPivot) {
            this.basePosition = this.originEntityPos.clone()
            this.baseRotation = this.originEntityRotation.clone()
        }

        this.setupTransition({
            transitionMode: transitionMode ?? this.originModel,
            startPose: {
                focus: startFocus,
                rotation: modelEntity.localRotation.clone(),
                position: modelEntity.localPosition.clone(),
                distance: startDistance,
                fov: startFov,
                yaw: this.currentYaw,
                pitch: this.currentPitch,
            },
            targetPose: {
                focus: targetFocus,
                rotation: targetRotation,
                position: targetPosition,
                distance: targetDistance,
                fov: targetFov,
                yaw: targetYaw,
                pitch: targetPitch,
            },
            onTransitionFinished: () => {
                this.isResetting = false
                this.isEditPivot = false
                this.updateModelRotation()
                if (this.settings.pivot.position) {
                    this.centerPivot = localToWorld(this.settings.pivot.position)
                    this.basePosition = this.calcBasePositionFromPivot(this.centerPivot)
                }
                this.syncHierarchyAndRender()
                onResetFinished?.()
            },
            lerpDuration: NORMAL_FADE_TIME,
        })
    }
    calcBasePositionFromPivot(centerPivot) {
        if (!centerPivot) return this.basePosition.clone()
        const combinedQuat = this.buildCombinedQuat(this.currentYaw || 0, this.currentPitch || 0)
        const invQuat = new Quat3(-combinedQuat.x, -combinedQuat.y, -combinedQuat.z, combinedQuat.w)
        const { x, y, z } = modelEntity.localPosition.clone().sub(centerPivot)
        const baseOffset = new Vec33(x, y, z).transformQuat(invQuat)
        return centerPivot.clone().add(baseOffset)
    }
    saveInitview({ isShowToast = true, defaultDistance = false } = {}) {
        const pose = this.getEntityInfo()
        if (defaultDistance) {
            this.settings.initview = { pose: { ...pose, distanceScale: 1 } }
        } else {
            this.settings.initview = { pose }
        }
        if (isShowToast)
            showToast('✓ Initial view updated', {
                duration: 1000,
                type: 'success',
            })
    }
    removeInitview() {
        this.settings.initview = { pose: null }

        if (this.originEntityRotation) {
            this.baseRotation = this.originEntityRotation.clone()
        }
        if (this.originEntityPos) {
            this.basePosition = this.originEntityPos.clone()
        }

        this.reset()
        showToast('✓ Switched to default view', {
            duration: 1000,
            type: 'success',
        })
    }
    update(dt, inputFrame, camera) {
        this._lastDt = dt
        const { move, rotate } = inputFrame.read()
        this.move(move, rotate)
        this.smooth(dt)
        this.updateModelEntity(dt)
        if (this.settings.inertia && this.isFlick) this.applyInertia()
        if (this._autoRotateTick) {
            this._autoRotateTick(dt)
        }
        this.getPose(camera)
    }
    getDeafultDistance() {
        const aspect = this.app.graphicsDevice.width / this.app.graphicsDevice.height
        let verticalFovRad
        if (this.app.graphicsDevice.width > this.app.graphicsDevice.height) {
            const hFovRad = (this.fov * Math.PI) / 180
            verticalFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / aspect)
        } else {
            verticalFovRad = (this.fov * Math.PI) / 180
        }
        const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * aspect)
        const minFovRad = Math.min(verticalFovRad, horizontalFovRad)
        const { x, y, z } = this.bbox.halfExtents
        const radius = Math.sqrt(x * x + y * y + z * z)
        return radius / Math.sin(minFovRad / 2)
    }
    onEnter(camera) {
        let forward
        let distance
        const focusPoint = this.bbox.center.clone()
        const isCylindrical = this.originModel === 'cylindrical'
        this.minPitch = 0
        this.maxPitch = isCylindrical ? 0 : Math.PI / 2
        if (isCylindrical && this.cylindricalCamPos) {
            this.cameraEntity.setPosition(this.cylindricalCamPos)
            this.fov = this.calFitFOV()
            forward = focusPoint.clone().sub(this.cylindricalCamPos).normalize()
            distance = this.cylindricalCamPos.distance(this.bbox.center)
        } else {
            forward = focusPoint.clone().sub(camera.position).normalize()
            distance = this.getDeafultDistance()
        }
        this.maxDistance = Math.max(distance, this.maxDistance)
        this.resetPose = {
            ...camera,
            distance,
            forward,
            fov: this.fov,
            focus: focusPoint,
        }
        this.originCameraPosition = this.cameraEntity.position.clone()
        this.reset()
    }
    onExit() {}
    applyInertia() {
        if (this.isEditMessage || this.targetPose || !modelEntity || !this.modelRotation) return
        if (this.isEditingOrientation) return
        const speed = Math.sqrt(this.inertiaVelX ** 2 + this.inertiaVelY ** 2)
        if (speed < this.inertiaMinSpeed) {
            this.inertiaVelX = 0
            this.inertiaVelY = 0
            return
        }
        const dx = this.inertiaVelX
        const dy = this.inertiaVelY
        const speedNorm = Math.min(speed / 0.05, 1)
        const damping = 0.68 + speedNorm * (this.inertiaDamping - 0.68)

        this.inertiaVelX *= damping
        this.inertiaVelY *= damping

        if (this.model === 'spherical') {
            this.sphericalRot(dx, dy)
        } else {
            this.setHemiPitchYaw(dx, dy)
            this.hemisphericalRot(this.currentYaw, this.currentPitch)
        }
        this.syncHierarchyAndRender()
    }
    setupTransition({ targetPose, startPose, onTransitionFinished, lerpDuration, transitionMode }) {
        this.targetPose = targetPose
        this.startPose = startPose
        this.onTransitionFinished = onTransitionFinished
        this.lerpTime = 0
        this.lerpDuration = lerpDuration
        this.inertiaVelX = 0
        this.inertiaVelY = 0
        this.transitionMode = transitionMode ?? this.originModel
    }
    editOrientation(currentMethod) {
        const prevMethod = this.orientationEditMethod

        if (!this.isEditingOrientation) {
            this._preEditBasePosition = this.basePosition.clone()
            this._preEditCenterPivot = this.centerPivot.clone()
            this._preEditFocus = this.focus.clone()
            this._preEditBaseRotation = this.baseRotation.clone()
            this._preEditEntityPosition = modelEntity.localPosition.clone()
            this._preEditEntityRotation = modelEntity.localRotation.clone()
        }

        this.isEditingOrientation = true
        this.orientationEditMethod = currentMethod

        if (prevMethod) {
            if (prevMethod === 'manual') this.hideHorizontalLine()
            this.centerPivot = this._preEditCenterPivot.clone()
            this.basePosition = this._preEditBasePosition.clone()
            this.baseRotation = this._preEditBaseRotation.clone()
            this.focus.copy(this._preEditFocus)
        }

        if (currentMethod === 'manual') {
            const currentPosition = modelEntity.localPosition.clone()
            const currentRotation = modelEntity.localRotation.clone()
            this.updateModelRotation()

            this.centerPivot = this._preEditCenterPivot.clone()
            this.basePosition = this._preEditBasePosition.clone()
            this.baseRotation = this._preEditBaseRotation.clone()

            if (this.targetPose) {
                this.startPose.position = currentPosition
                this.startPose.rotation = currentRotation
            }
        } else {
            this._snapCameraToOrigin = true
            this.lerpPositionY = undefined
            this.centerPivot = this.originBboxPivot.clone()
            this.basePosition = this.originEntityPos.clone()
            this.baseRotation = this.originEntityRotation.clone()
            this.reset({ useInitview: false, transitionMode: 'spherical' })
        }
        this.currentYaw = 0
        this.currentPitch = 0

        this.updateModelRotation()
    }

    cancelOrientation() {
        this.hideHorizontalLine()
        if (this._preEditCenterPivot) this.centerPivot = this._preEditCenterPivot.clone()
        if (this._preEditBasePosition) this.basePosition = this._preEditBasePosition.clone()
        this.clearPrevEditOrientation()
        this.updateModelRotation()
        this.reset({
            transitionMode: 'spherical',
            useInitview: false,
            onResetFinished: () => {
                this.currentYaw = 0
                this.currentPitch = 0
            },
        })
    }
    clearPrevEditOrientation() {
        this._snapCameraToOrigin = true
        this.lerpPositionY = undefined
        this._preEditBasePosition = null
        this._preEditCenterPivot = null
        this._preEditFocus = null
        this._preEditBaseRotation = null
        this._preEditEntityPosition = null
        this._preEditEntityRotation = null
        this.isEditingOrientation = false
        this.orientationEditMethod = undefined
    }
    stopSpin360() {
        if (!this._autoRotating) return
        this.global.isSpin360 = false
        this._autoRotating = false
        this._autoRotateTick = null
        this.isSpin360Loop = false
        this.spinSpeed = 5
        this.events.fire('ortery:stop-spin')
        this.events.fire('re-render:control-wrap')
    }
    setSpinSettings() {
        this.isSpin360Loop = this.settings.spin.continuous
        this.spinSpeed = this.settings.spin.speed
        this.spinDirection = this.settings.spin.direction
        if (this.originModel === 'spherical' && this.settings.spin.rotation) {
            const axes = getSpinAxes(this.settings.spin.rotation)
            const localAxis = axes[this.settings.spin.axis]
            this.spinRotationAxis = modelEntity.localRotation.transformVector(
                new Vec3(localAxis.x, localAxis.y, localAxis.z),
            )
        }
    }

    spin360({ onStop, model = 'axis' } = {}) {
        if (!modelEntity || this._autoRotating) return

        this.global.isSpin360 = true
        this.events.fire('re-render:control-wrap')
        this.updateModelRotation()
        this._autoRotating = true
        const totalAngle = Math.PI * 2
        const startRotation = this.modelRotation.clone()
        const startPosition = modelEntity.localPosition.clone()
        const startYaw = this.currentYaw
        let rotated = 0
        const tick = (dt) => {
            if (!this._autoRotating) return
            const baseRate = this.global.recording ? this.spinSpeed * 0.06 * dt : this.spinSpeed * 0.001
            const remaining = totalAngle - rotated
            const isLastTick = !this.isSpin360Loop && baseRate >= remaining
            const delta = this.isSpin360Loop ? baseRate : Math.min(baseRate, remaining)
            rotated += delta

            const clockwise = this.spinDirection === 'cw'
            let dirSign = 1

            if (isLastTick) {
                switch (model) {
                    case 'axis':
                    case 'spherical':
                        modelEntity.localPosition.copy(startPosition)
                        modelEntity.localRotation.copy(startRotation)
                        this.modelRotation.copy(startRotation)
                        break
                    case 'hemispherical':
                    case 'cylindrical':
                        this.currentYaw = this.clampYaw(startYaw)
                        this.hemisphericalRot(this.currentYaw, this.currentPitch)
                        break
                }
                this.stopSpin360()
                this.syncHierarchyAndRender()
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        this._drawFrame?.()
                        onStop?.()
                    })
                })
                return
            }

            switch (model) {
                case 'axis': {
                    const forward = Vec33.FORWARD.clone().transformQuat(this.cameraRotation).normalize()
                    const facingPositive = forward.z >= 0
                    dirSign = facingPositive === clockwise ? 1 : -1
                    const step = (delta / this.rotateSpeed) * dirSign
                    this.sphericalAxisRot(step, 0)
                    break
                }
                case 'spherical': {
                    dirSign = clockwise ? 1 : -1
                    const angle = delta * dirSign
                    const axis = new Vec33(
                        this.spinRotationAxis.x,
                        this.spinRotationAxis.y,
                        this.spinRotationAxis.z,
                    ).normalize()
                    const quatYaw = new Quat3().setFromAxisAngle(axis, angle)
                    v$2.copy(modelEntity.localPosition).sub(this.centerPivot)
                    v$2.transformQuat(quatYaw)
                    modelEntity.localPosition.copy(this.centerPivot).add(v$2)
                    const result = quatYaw.mul(this.modelRotation).normalize()
                    modelEntity.localRotation.set(result.x, result.y, result.z, result.w)
                    this.modelRotation.copy(modelEntity.localRotation)
                    break
                }
                case 'hemispherical':
                case 'cylindrical':
                    dirSign = clockwise ? 1 : -1
                    this.currentYaw = this.clampYaw(this.currentYaw - delta * dirSign)
                    this.hemisphericalRot(this.currentYaw, this.currentPitch)
                    break
            }
            if (rotated >= totalAngle && this.isSpin360Loop) {
                rotated -= totalAngle
            }
            this.syncHierarchyAndRender()
        }
        this._autoRotateTick = tick
    }
    resetOrientation() {
        this.settings.orientation.pose = null
        this.settings.initview.pose = null
        this.baseRotation = this.initialModelRotation.clone()
        this.basePosition = this.initialModelPosition.clone()
        this.originEntityRotation = this.initialModelRotation.clone()
        this.originEntityPos = this.initialModelPosition.clone()

        const euler = this.baseRotation.getEulerAngles()
        this.events.fire('orientation:aligned-model', { x: euler.x, y: euler.y, z: euler.z })
        this.setupTransition({
            transitionMode: 'spherical',
            startPose: {
                focus: this.focus.clone(),
                rotation: modelEntity.localRotation.clone(),
                position: modelEntity.localPosition.clone(),
                fov: this.fov,
                distance: this.distance,
            },
            targetPose: {
                focus: this.resetPose.focus.clone(),
                rotation: this.initialModelRotation.clone(),
                position: this.initialModelPosition.clone(),
                distance: this.resetPose.distance,
                fov: this.resetPose.fov,
                yaw: 0,
                pitch: 0,
            },
            lerpDuration: NORMAL_FADE_TIME,
        })
    }
    applyManualOrientation() {
        this.hideHorizontalLine()
        this.baseRotation = modelEntity.localRotation.clone()

        const offsetFromPivot = modelEntity.localPosition.clone().sub(this.centerPivot)
        this.centerPivot = this.originBboxPivot.clone()
        this.basePosition = this.originBboxPivot.clone().add(offsetFromPivot)

        modelEntity.localPosition.copy(this.basePosition)

        this.originEntityRotation = this.baseRotation.clone()
        this.originEntityPos = this.basePosition.clone()

        const euler = this.baseRotation.getEulerAngles()
        this.events.fire('orientation:aligned-model', { x: euler.x, y: euler.y, z: euler.z })

        this.settings.orientation.pose = {
            rotation: this.baseRotation,
            position: this.basePosition,
        }

        this.clearPrevEditOrientation()
        this.hemisphericalRot(this.currentYaw, 0)
        this.currentPitch = 0
        this.syncHierarchyAndRender()
        this.saveInitview({ isShowToast: false, defaultDistance: true })
        this.events.fire('orientation:added')
    }
    applyGroundPlaneOrientation(points) {
        const localNormal = fitPlaneNormal(points)
        const normalInWorld = new Vec3()
        this.initialModelRotation.transformVector(localNormal, normalInWorld)
        normalInWorld.normalize()

        const pickCentroid = new Vec3(
            (points[0].x + points[1].x + points[2].x) / 3,
            (points[0].y + points[1].y + points[2].y) / 3,
            (points[0].z + points[1].z + points[2].z) / 3,
        )
        const pickCentroidWorld = new Vec3()
        this.initialModelRotation.transformVector(pickCentroid, pickCentroidWorld)
        const weight = getModelWeight(modelEntity, this.settings.removedSplats)
        const modelCentroid = localToWorld(weight)
        const toModelCenter = new Vec3().copy(modelCentroid).sub(pickCentroidWorld).normalize()
        if (normalInWorld.dot(toModelCenter) > 0) {
            normalInWorld.mulScalar(-1)
        }

        const correctionQuat = quatFromTo(normalInWorld, new Vec3(0, -1, 0))
        const newBaseRotation = new Quat()
        newBaseRotation.mul2(correctionQuat, this.initialModelRotation)

        const currentPosition = modelEntity.localPosition.clone()
        const centerPivot = this.centerPivot.clone()
        const { x, y, z } = centerPivot.clone().sub(currentPosition)
        const currentRotation = modelEntity.localRotation.clone()
        const invCurrentRot = currentRotation.clone().invert()
        const deltaQuat = new Quat().mul2(newBaseRotation, invCurrentRot)
        const rotatedOffsetToPivot = new Vec33(x, y, z).transformQuat(deltaQuat)
        const newPosition = centerPivot.clone().sub(rotatedOffsetToPivot)

        this.baseRotation = newBaseRotation
        this.basePosition = newPosition
        this.originEntityRotation = this.baseRotation
        this.originEntityPos = this.basePosition
        this.centerPivot = centerPivot

        this.settings.orientation.pose = { rotation: newBaseRotation, position: newPosition }

        this.clearPrevEditOrientation()

        const euler = newBaseRotation.getEulerAngles()
        this.events.fire('orientation:aligned-model', { x: euler.x, y: euler.y, z: euler.z })

        this.hemisphericalRot(this.currentYaw, this.minPitch)
        const targetPosition = modelEntity.localPosition.clone()
        const targetRotation = modelEntity.localRotation.clone()
        const startPose = {
            focus: this.focus.clone(),
            position: currentPosition,
            rotation: currentRotation,
            distance: this.distance,
            yaw: this.currentYaw,
            pitch: this.currentPitch,
            fov: this.fov,
        }
        const targetPose = {
            focus: this.centerPivot.clone(),
            position: targetPosition,
            rotation: targetRotation,
            distance: this.distance,
            yaw: this.currentYaw,
            pitch: this.minPitch,
            fov: this.fov,
        }
        this.setupTransition({
            transitionMode: 'spherical',
            targetPose,
            startPose,
            lerpDuration: NORMAL_FADE_TIME,
            onTransitionFinished: () => {
                this.saveInitview({ isShowToast: false, defaultDistance: true })
                this.currentPitch = this.minPitch
            },
        })
        this.events.fire('orientation:added')
    }
    lerp(a, b, t) {
        return a + (b - a) * t
    }
    updateModelEntity(dt) {
        if (!this.targetPose || !modelEntity) return
        this.lerpTime += dt
        let t = Math.min(this.lerpTime / this.lerpDuration, 1)
        // t = t * t * (3 - 2 * t)
        if (this.originModel === 'cylindrical') {
            this.fov = this.clampFov(this.lerp(this.startPose.fov, this.targetPose.fov, t))
        }
        this.distance = this.clampDistance(this.lerp(this.startPose.distance, this.targetPose.distance, t))
        this.focus.copy(this.startPose.focus).lerp(this.targetPose.focus, t)
        if (this.transitionMode === 'spherical') {
            const newPos = new Vec33(
                this.startPose.position.x,
                this.startPose.position.y,
                this.startPose.position.z,
            ).lerp(this.targetPose.position, t)
            modelEntity.localPosition.copy({ x: newPos.x, y: newPos.y, z: newPos.z })
            const r = Quat3.slerp(this.startPose.rotation, this.targetPose.rotation, t)
            modelEntity.localRotation.set(r.x, r.y, r.z, r.w)
        } else {
            const startYaw = this.startPose.yaw
            const startPitch = this.startPose.pitch
            const targetYaw = this.targetPose.yaw
            const targetPitch = this.targetPose.pitch

            let yawDiff = targetYaw - startYaw
            if (yawDiff > Math.PI) yawDiff -= Math.PI * 2
            if (yawDiff < -Math.PI) yawDiff += Math.PI * 2
            const lerpedYaw = startYaw + yawDiff * t

            const lerpedPitch = startPitch + (targetPitch - startPitch) * t

            this.currentYaw = lerpedYaw
            this.currentPitch = lerpedPitch
            this.hemisphericalRot(lerpedYaw, lerpedPitch)
        }

        if (t >= 1) {
            this.focus.copy(this.targetPose.focus)
            this.distance = this.clampDistance(this.targetPose.distance)
            this.fov = this.clampFov(this.targetPose.fov)
            if (this.transitionMode === 'spherical') {
                modelEntity.localPosition.copy(this.targetPose.position)
                modelEntity.localRotation.copy(this.targetPose.rotation)
                this.updateModelRotation()
            } else {
                this.currentYaw = this.targetPose.yaw
                this.currentPitch = this.targetPose.pitch
                this.hemisphericalRot(this.currentYaw, this.currentPitch)
            }
            this.targetPose = null
            this.startPose = null
        }
        this.syncHierarchyAndRender()
        if (t >= 1 && this.onTransitionFinished) {
            const cb = this.onTransitionFinished
            this.onTransitionFinished = null
            cb()
        }
    }
    updateModelRotation() {
        this.modelRotation = modelEntity.localRotation.clone()
    }
    syncHierarchyAndRender() {
        modelEntity.syncHierarchy()
        modelEntity._dirtyLocal = true
        modelEntity._dirtyWorld = true
        this.app.renderNextFrame = true
    }
    resetInertia() {
        this.inertiaVelX = 0
        this.inertiaVelY = 0
    }
    getEntityInfo() {
        const isCylindrical = this.originModel === 'cylindrical' && this.cylindricalCamPos
        return {
            rotation: modelEntity.localRotation.clone(),
            position: modelEntity.localPosition.clone(),
            isFullyInView: this.isFullyVisibleInCamera(isCylindrical),
            distanceScale: this.getDistanceScale(isCylindrical),
            focus: this.focus.clone(),
            pitch: this.currentPitch,
            yaw: this.currentYaw,
        }
    }
    getDistanceScale(isCylindrical) {
        return isCylindrical ? this.getCurrentFovScale() : this.getCurrentDistanceScale()
    }
    getCurrentDistanceScale() {
        return this.distance / this.originDistance
    }
    getActualDistance(distanceScale, isFullyInView = false) {
        const actual = this.originDistance * distanceScale
        if (isFullyInView) return Math.max(this.originDistance, actual)
        return actual
    }
    clampDistance(distance) {
        if (!this.settings.lockZoomIn.locked) return Math.min(this.maxDistance, Math.max(this.minDistance, distance))
        return Math.min(this.maxDistance, Math.max(this.getActualDistance(this.settings.lockZoomIn.value), distance))
    }

    getCurrentFovScale() {
        return this.fov - this.originFov
    }
    getActualFov(fovOffset, isFullyInView = false) {
        const actual = this.originFov + fovOffset
        if (isFullyInView) return Math.max(this.originFov * 0.8, actual)
        return actual
    }

    isFullyVisibleInCamera(isCylindrical) {
        if (isCylindrical) {
            return this.originFov * 0.8 <= this.fov
        }
        return this.originDistance <= this.distance
    }
    clampFov(fov) {
        if (!this.settings.lockZoomIn.locked) return Math.min(this.maxFov, Math.max(this.minFov, fov))
        return Math.min(this.maxFov, Math.max(this.getActualFov(this.settings.lockZoomIn.value), fov))
    }

    move(move, rotate) {
        if (
            this.isEditMessage ||
            this.isMeasurementDrag ||
            (this.global.recording && this.global.recordPattern !== 'none')
        )
            return
        const [x, y, z] = move
        if (z !== 0) {
            if (this.model === 'cylindrical' && !!this.cylindricalCamPos && !this.isEditingOrientation) {
                this.fov = this.clampFov(this.fov + this.fov * z * 0.75)
            } else {
                this.distance = this.clampDistance(this.distance + this.distance * z)
            }
        }
        if (x !== 0 || y !== 0 || z !== 0) {
            if (this.isEditingOrientation && this.orientationEditMethod === 'manual') {
                const deltaX = x * 0.75
                const deltaY = y * 0.75

                modelEntity.localPosition.y -= deltaY
                this.basePosition.y -= deltaY
                this.centerPivot.y -= deltaY
                if (this.cachePositionY !== undefined) {
                    this.cachePositionY -= deltaY
                }

                const rightOffset = this.rightCam.clone().mulScalar(deltaX)
                modelEntity.localPosition.x -= rightOffset.x
                modelEntity.localPosition.z -= rightOffset.z
                this.basePosition.x -= rightOffset.x
                this.basePosition.z -= rightOffset.z
                this.centerPivot.x -= rightOffset.x
                this.centerPivot.z -= rightOffset.z

                this.updateModelRotation()
                this.syncHierarchyAndRender()
            } else {
                v$2.copy(this.rightCam).mulScalar(x)
                this.focus.add(v$2)
                v$2.copy(this.upCam).mulScalar(y)
                this.focus.add(v$2)
            }
            this.events.fire('camera:moved')
        }
        if (this.isPointEraserActive) return
        const isZooming = z !== 0
        const isPanning = x !== 0 || y !== 0
        let didRotate = false
        if (!this.initPivot) {
            if (this.settings.pivot.position) {
                this.centerPivot = localToWorld(this.settings.pivot.position)
                this.basePosition = this.calcBasePositionFromPivot(this.centerPivot)
            } else {
                this.centerPivot = this.bbox.center.clone()
                this.basePosition = this.calcBasePositionFromPivot(this.centerPivot)
            }
            this.initPivot = true
        }
        if (modelEntity && this.modelRotation) {
            const deltaX = rotate[0]
            const deltaY = rotate[1]
            if (deltaX !== 0 || deltaY !== 0) {
                if (this.settings.inertia) {
                    this.inertiaVelX = this.inertiaVelX * 0.6 + deltaX * 0.4
                    this.inertiaVelY = this.inertiaVelY * 0.6 + deltaY * 0.4
                }
                if (this.targetPose) {
                    this.targetPose = null
                    this.isResetting = false
                }
                if (this.isEditingOrientation) {
                    this.sphericalAxisRot(deltaX, deltaY)
                } else if (this.model === 'spherical') {
                    this.updateModelRotation()
                    this.sphericalRot(deltaX, deltaY)
                } else {
                    this.setHemiPitchYaw(deltaX, deltaY)
                    this.hemisphericalRot(this.currentYaw, this.currentPitch)
                }
                this.syncHierarchyAndRender()
                didRotate = true
            }
        }
        if (didRotate) {
            this.events.fire('ortery:rotate')
        }
        if (isZooming || isPanning || didRotate) {
            this.events.fire('ortery:interaction')
            this.updateModelRotation()
        }
    }
    clampYaw(yaw) {
        return ((((yaw + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI
    }

    clampPitch(pitch) {
        return Math.max(this.minPitch, Math.min(this.maxPitch, pitch))
    }

    hemiClampDelta(deltaX, deltaY, maxDelta = 30) {
        const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        const scale = magnitude > maxDelta ? maxDelta / magnitude : 1
        return { x: deltaX * scale, y: deltaY * scale }
    }

    setHemiPitchYaw(deltaX, deltaY) {
        const { x: safeDeltaX, y: safeDeltaY } = this.hemiClampDelta(deltaX, deltaY)
        this.currentYaw = this.clampYaw(this.currentYaw + safeDeltaX * this.rotateSpeed)
        this.currentPitch = this.clampPitch(this.currentPitch + safeDeltaY * this.rotateSpeed)
    }

    clampHemiRawPitch(yaw, pitch) {
        return {
            yaw: this.clampYaw(yaw),
            pitch: this.clampPitch(pitch),
        }
    }
    sphericalRot(deltaX, deltaY) {
        const quatYaw = new Quat3().setFromAxisAngle(this.upCam, deltaX * this.rotateSpeed)
        const quatpitch = new Quat3().setFromAxisAngle(this.rightCam, deltaY * this.rotateSpeed)
        const rotateQuat = quatpitch.mul(quatYaw).normalize()
        v$2.copy(modelEntity.localPosition).sub(this.centerPivot)
        v$2.transformQuat(rotateQuat)
        modelEntity.localPosition.copy(this.centerPivot).add(v$2)
        const result = rotateQuat.mul(this.modelRotation).normalize()
        modelEntity.localRotation.set(result.x, result.y, result.z, result.w)
        this.modelRotation.copy(modelEntity.localRotation)
    }

    hemisphericalRot(yaw, pitch) {
        const combinedRotateQuat = this.buildCombinedQuat(yaw, pitch)
        const { x, y, z } = this.basePosition.clone().sub(this.centerPivot)
        const rotatedOffset = new Vec33(x, y, z).transformQuat(combinedRotateQuat)
        modelEntity.localPosition.copy(this.centerPivot.clone().add(rotatedOffset))
        const result = combinedRotateQuat.mul(this.baseRotation).normalize()
        modelEntity.localRotation.set(result.x, result.y, result.z, result.w)
    }

    sphericalAxisRot(deltaX, deltaY) {
        const worldUp = new Vec33(0, 1, 0)
        const quatYaw = new Quat3().setFromAxisAngle(worldUp, deltaX * this.rotateSpeed)
        const rightAxis = this.rightCam ? this.rightCam.clone() : Vec33.RIGHT.clone()
        const quatPitch = new Quat3().setFromAxisAngle(rightAxis, deltaY * this.rotateSpeed)

        const rotateQuat = quatPitch.mul(quatYaw).normalize()
        v$2.copy(modelEntity.localPosition).sub(this.centerPivot)
        v$2.transformQuat(rotateQuat)
        modelEntity.localPosition.copy(this.centerPivot).add(v$2)
        const result = rotateQuat.mul(this.modelRotation).normalize()
        modelEntity.localRotation.set(result.x, result.y, result.z, result.w)
        this.modelRotation.copy(modelEntity.localRotation)
    }
    buildCombinedQuat(yaw, pitch) {
        const worldUp = new Vec33(0, 1, 0)
        const quatYaw = new Quat3().setFromAxisAngle(worldUp, yaw)
        const rightAxis = this.rightCam ? this.rightCam.clone() : Vec33.RIGHT.clone()
        const quatPitch = new Quat3().setFromAxisAngle(rightAxis, pitch)
        return quatPitch.mul(quatYaw).normalize()
    }
    smooth(dt) {
        const { focus, cameraRotation: r, smoothDamp } = this
        const { value, target } = smoothDamp
        focus.toArray(target, 0)
        const dot = value[3] * r.x + value[4] * r.y + value[5] * r.z + value[6] * r.w
        const sign = dot < 0 ? -1 : 1
        target[3] = r.x * sign
        target[4] = r.y * sign
        target[5] = r.z * sign
        target[6] = r.w * sign
        target[7] = this.distance
        smoothDamp.update(dt)
        const q = new Quat3(value[3], value[4], value[5], value[6]).normalize()
        value[3] = q.x
        value[4] = q.y
        value[5] = q.z
        value[6] = q.w
    }

    getPose(pose, dt = 1 / 60) {
        const isManualOrientation = this.isEditingOrientation && this.orientationEditMethod === 'manual'
        pose.distance = this.distance

        if (!isManualOrientation && this.originModel === 'cylindrical' && this.cylindricalCamPos) {
            pose.position = this.cylindricalCamPos
            const dir = new Vec3().sub2(this.focus, pose.position).normalize()
            const pitchRad = Math.asin(dir.y)
            const yawRad = Math.atan2(-dir.x, -dir.z)
            pose.angles = new Vec3(pitchRad * (180 / Math.PI), yawRad * (180 / Math.PI), 0)
            pose.fov = this.fov
            pose.distance = 100
            return
        }
        const forward = Vec33.FORWARD.clone().transformQuat(this.cameraRotation).normalize()
        const newPos = this.focus.clone().sub(forward.mulScalar(this.distance))
        pose.position = newPos
        pose.fov = 50
        if (this._snapCameraToOrigin) {
            this._snapCameraToOrigin = false
            this.lerpPositionY = undefined
            this.lerpPitchRad = undefined
            return
        }

        if (isManualOrientation) {
            const speed = 1 - Math.pow(0.00000001, dt)

            if (this.lerpPositionY === undefined) this.lerpPositionY = pose.position.y
            this.lerpPositionY += (0 - this.lerpPositionY) * speed
            pose.position.y = Math.abs(this.lerpPositionY) < 0.01 ? 0 : this.lerpPositionY

            const horizLenSq = forward.x * forward.x + forward.z * forward.z
            const currentPitchRad = Math.asin(Math.max(-1, Math.min(1, forward.y)))
            let currentYawRad = 0
            if (horizLenSq > 1e-8) {
                currentYawRad = Math.atan2(-forward.x, -forward.z)
            }

            if (this.lerpPitchRad === undefined) this.lerpPitchRad = currentPitchRad
            this.lerpPitchRad += (0 - this.lerpPitchRad) * speed
            const finalPitchRad = Math.abs(this.lerpPitchRad) < 0.001 ? 0 : this.lerpPitchRad

            pose.angles = new Vec3(finalPitchRad * (180 / Math.PI), currentYawRad * (180 / Math.PI), 0)
            if (Math.abs(this.lerpPositionY) < 0.05 && Math.abs(this.lerpPitchRad) < 0.05) {
                this.drawHorizontalLine()
            }
        } else if (this.lerpPositionY !== undefined) {
            const targetY = this.originCameraPosition?.y ?? pose.position.y
            const speed = 1 - Math.pow(0.00001, dt)
            this.lerpPositionY += (targetY - this.lerpPositionY) * speed
            const doneY = Math.abs(this.lerpPositionY - targetY) < 0.001
            pose.position.y = doneY ? targetY : this.lerpPositionY
            if (doneY) {
                this.lerpPositionY = undefined
                this.lerpPitchRad = undefined
            }
        }
    }
    axisRoll(rad) {
        const forwardCam = Vec33.FORWARD.clone().transformQuat(this.cameraRotation).normalize()
        const quatRoll = new Quat3().setFromAxisAngle(forwardCam, rad)

        v$2.copy(modelEntity.localPosition).sub(this.centerPivot)
        v$2.transformQuat(quatRoll)
        modelEntity.localPosition.copy(this.centerPivot).add(v$2)

        const result = quatRoll.mul(this.modelRotation).normalize()
        modelEntity.localRotation.set(result.x, result.y, result.z, result.w)
        this.modelRotation.copy(modelEntity.localRotation)
    }
    initHorizontalLine() {
        const layers = this.app.scene.layers
        const worldLayer = layers.getLayerByName('World')
        const layerBBox = new Layer({ name: 'horizontalLine' })
        const worldIndex = layers.getTransparentIndex(worldLayer)
        layers.insert(layerBBox, worldIndex + 1)
        this.cameraEntity.camera.layers = [...this.cameraEntity.camera.layers, layerBBox.id]
        const lineMesh = new Mesh(this.app.graphicsDevice)
        const lineMat = new StandardMaterial()
        const color = new Color()
        color.fromString('#f71a02')
        lineMat.emissive = color
        lineMat.cull = CULLFACE_NONE
        lineMat.useLighting = false
        lineMat.depthTest = false
        lineMat.update()

        this.horizontalLineEntity = new Entity('horizontalLine')
        this.app.root.addChild(this.horizontalLineEntity)

        const mi = new MeshInstance(lineMesh, lineMat)
        mi.cull = false
        this.horizontalLineEntity.addComponent('render', {
            layers: [layerBBox.id],
            meshInstances: [mi],
        })
        this.horizontalLineMesh = lineMesh
        this.horizontalLineEntity.localPosition.set(0, 0, 0)
        this.horizontalLineEntity.localRotation.set(0, 0, 0, 1)
    }
    drawHorizontalLine() {
        if (!this.horizontalLineEntity) {
            this.initHorizontalLine()
        }
        if (this.lastLineDistance === this.distance) return
        this.lastLineDistance = this.distance

        const camRot = this.cameraEntity.getRotation()
        const right = Vec33.RIGHT.clone().transformQuat(camRot).normalize()

        const canvasWidth = this.app.graphicsDevice.width
        const canvasHeight = this.app.graphicsDevice.height
        const fovRad = (this.fov * Math.PI) / 180
        const worldHeightAtDist = 2 * this.distance * Math.tan(fovRad / 2)
        const worldWidthAtDist = worldHeightAtDist * (canvasWidth / canvasHeight)
        const size = worldWidthAtDist * 10
        const rightFlat = new Vec33(right.x, 0, right.z).normalize()
        const center = new Vec33(0, 0, 0)
        const p1 = center.clone().sub(rightFlat.clone().mulScalar(size))
        const p2 = center.clone().add(rightFlat.clone().mulScalar(size))
        const positions = [p1.x, 0, p1.z, p2.x, 0, p2.z]
        this.horizontalLineMesh.setPositions(positions)
        this.horizontalLineMesh.update(PRIMITIVE_LINES)

        this.horizontalLineEntity.enabled = true
    }
    hideHorizontalLine() {
        if (this.horizontalLineEntity) {
            this.horizontalLineEntity.enabled = false
        }
        this.lastLineDistance = undefined
    }
    calFitFOV() {
        if (!this.bbox) return this.fov
        const cameraPos = this.cameraEntity.getPosition()
        const bboxCenter = this.bbox.center.clone()
        const halfExtents = this.bbox.halfExtents

        const forward = new Vec3().sub2(bboxCenter, cameraPos).normalize()
        const worldUp = new Vec3(0, 1, 0)
        const right = new Vec3().cross(forward, worldUp).normalize()
        const up = new Vec3().cross(right, forward).normalize()

        const width = this.app.graphicsDevice.width
        const height = this.app.graphicsDevice.height
        const aspect = width / height
        const isHorizontalFov = width > height

        const signs = [
            [1, 1, 1],
            [-1, 1, 1],
            [1, -1, 1],
            [-1, -1, 1],
            [1, 1, -1],
            [-1, 1, -1],
            [1, -1, -1],
            [-1, -1, -1],
        ]

        let maxUp = -Infinity,
            maxDown = -Infinity
        let maxLeft = -Infinity,
            maxRight = -Infinity

        for (const [sx, sy, sz] of signs) {
            const corner = new Vec3(
                bboxCenter.x + halfExtents.x * sx,
                bboxCenter.y + halfExtents.y * sy,
                bboxCenter.z + halfExtents.z * sz,
            )
            const toCorner = new Vec3().sub2(corner, cameraPos)
            const depth = toCorner.dot(forward)
            if (depth <= 0) continue

            const projV = toCorner.dot(up)
            const projH = toCorner.dot(right)

            if (projV >= 0) maxUp = Math.max(maxUp, Math.atan(projV / depth))
            else maxDown = Math.max(maxDown, Math.atan(-projV / depth))
            if (projH >= 0) maxRight = Math.max(maxRight, Math.atan(projH / depth))
            else maxLeft = Math.max(maxLeft, Math.atan(-projH / depth))
        }

        const vertSpan = radToDeg(maxUp + maxDown)
        const horizSpan = radToDeg(maxLeft + maxRight)

        let requiredFOV
        if (isHorizontalFov) {
            const vertAsHoriz = radToDeg(2 * Math.atan(Math.tan(degToRad(vertSpan / 2)) * aspect))
            requiredFOV = Math.max(horizSpan, vertAsHoriz)
        } else {
            const horizAsVert = radToDeg(2 * Math.atan(Math.tan(degToRad(horizSpan / 2)) / aspect))
            requiredFOV = Math.max(vertSpan, horizAsVert)
        }

        return requiredFOV / 0.8
    }
}
