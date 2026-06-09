const v$2 = new Vec33()
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

    constructor({ global, bbox }) {
        this.global = global
        const { app, events } = global
        this.app = app
        this.bbox = bbox
        this.cameraEntity = global.camera
        this.events = events
        this.global = global
        this.settings = global.settings
        this.model = global.settings.model
        this.initialModelRotation = modelEntity.localRotation.clone()
        this.initialModelPosition = modelEntity.localPosition.clone()
        this.originModel = this.model
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
        if (this.model === 'cylindrical' && this.settings.cameras.length > 0) {
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
        this.originBboxPivot = this.bbox.center.clone()
        this.listenEvents()
    }
    listenEvents() {
        this.events.on('measurement:drag', (isDrag) => {
            this.isMeasurementDrag = isDrag
        })
        this.events.on('message:editing', (isEdit) => {
            this.isEditMessage = isEdit
            this.stopSpin360()
        })
        this.events.on('message:editing', (isEdit) => {
            this.isEditMessage = isEdit
            this.stopSpin360()
        })
        this.events.on('sidebar:active', () => {
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
            this.global.isSpin360 = true
            this.isSpin360Loop = this.settings.spin.continuous
            this.spinSpeed = this.settings.spin.speed
            this.spin360({ model: this.model })
            this.targetPose = null
        })
        this.events.on('360spin-stop', () => {
            this.stopSpin360()
        })
        this.events.on('spin:enabled', (v) => this.stopSpin360())
        this.events.on('spin-speed', (v) => (this.spinSpeed = v))
        this.events.on('spin-continuous', (v) => (this.isSpin360Loop = v))

        this.events.on('setup-reset', () => this.reset())

        this.events.on('viewer:inertia', (value) => this.resetInertia())
        this.events.on('viewer:save-initview', () => this.saveInitview())
        this.events.on('viewer:remove-saved-view', () => this.removeInitview())
        this.events.on('viewer:lock-zoom-in', (value) => {
            const lockZoomIn = {
                locked: value,
                value: value ? this.getDistanceScale(this.originModel === 'cylindrical') : this.minDistance,
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
        this.events.on('orientation:spin', ({ speed }) => {
            this.spinSpeed = speed
            this.spin360()
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
        this.events.on('orientation:eulerchange', ({ x, y, z }) => {
            const quat = new Quat()
            quat.setFromEulerAngles(x, y, z)
            const currentRot = modelEntity.localRotation.clone()
            const invCurrent = currentRot.clone().invert()
            const deltaQuat = quat.clone().mul(invCurrent)
            const offset = modelEntity.localPosition.clone().sub(this.centerPivot)
            const rotatedOffset = this.rotateOffsetByQuat(offset, deltaQuat)
            modelEntity.localPosition.copy(this.centerPivot.clone().add(rotatedOffset))
            modelEntity.localRotation.copy(quat)
            this.updateModelRotation()
            this.syncHierarchyAndRender()
        })
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
            this.setupTransition({ targetPose, startPose, lerpDuration, onTransitionFinished })
        })
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
    reset({ pose, useInitview = true, onResetFinished } = {}) {
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
        if (!this.originFocus) this.originFocus = new Vec33().copy(v$2).mulScalar(pose.distance).add(pose.position)
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
            if (this.settings.spin.enabled && this.settings.spin.autoStart) {
                this.global.isSpin360 = true
                this.isSpin360Loop = this.settings.spin.continuous
                this.spinSpeed = this.settings.spin.speed
                this.spin360({ model: this.model })
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
        if (this.isEditingOrientation) {
            this.model = 'spherical'
        }
        if (this.isEditPivot) {
            this.basePosition = this.originEntityPos.clone()
            this.baseRotation = this.originEntityRotation.clone()
        }
        this.setupTransition({
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
                this.model = this.originModel
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
        const currentOffset = modelEntity.localPosition.clone().sub(centerPivot)
        const baseOffset = this.rotateOffsetByQuat(currentOffset, invQuat)
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
        const fovDeg = 50
        let verticalFovRad
        if (this.app.graphicsDevice.width > this.app.graphicsDevice.height) {
            const hFovRad = (fovDeg * Math.PI) / 180
            verticalFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / aspect)
        } else {
            verticalFovRad = (fovDeg * Math.PI) / 180
        }
        const horizontalFovRad = 2 * Math.atan(Math.tan(verticalFovRad / 2) * aspect)
        const minFovRad = Math.min(verticalFovRad, horizontalFovRad)
        const h = this.bbox.halfExtents
        const radius = Math.sqrt(h.x * h.x + h.y * h.y + h.z * h.z)
        return radius / Math.sin(minFovRad / 2)
    }
    onEnter(camera) {
        this.originCameraPosition = camera.position.clone()
        this.originCameraAnglesX = camera.angles.x
        this.pitchRad = degToRad(camera.angles.x)
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
    setupTransition({ targetPose, startPose, onTransitionFinished, lerpDuration }) {
        this.targetPose = targetPose
        this.startPose = startPose
        this.onTransitionFinished = onTransitionFinished
        this.lerpTime = 0
        this.lerpDuration = lerpDuration
        this.inertiaVelX = 0
        this.inertiaVelY = 0
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
            this.lerpAnglesX = undefined
            this.reset({ useInitview: false })
        }

        this.updateModelRotation()
    }

    cancelOrientation() {
        this.hideHorizontalLine()

        if (this._preEditCenterPivot) this.centerPivot = this._preEditCenterPivot.clone()
        if (this._preEditBasePosition) this.basePosition = this._preEditBasePosition.clone()

        this._snapCameraToOrigin = true
        this.lerpPositionY = undefined
        this.lerpAnglesX = undefined

        this._preEditBasePosition = null
        this._preEditCenterPivot = null
        this._preEditFocus = null

        this.isEditingOrientation = false
        this.orientationEditMethod = undefined
        this.updateModelRotation()
        this.reset({ useInitview: false })
    }
    stopSpin360() {
        if (!this._autoRotating) return
        this.global.isSpin360 = false
        this._autoRotating = false
        this._autoRotateTick = null
        this.isSpin360Loop = false
        this.spinSpeed = 5
        this.events.fire('re-render:control-wrap')
    }
    spin360({ onStop, model = 'axis' } = {}) {
        if (!modelEntity) return
        if (this._autoRotating || this._pitchRotating) return
        this.events.fire('re-render:control-wrap')
        this.updateModelRotation()
        this._autoRotating = true

        const totalAngle = Math.PI * 2
        let rotated = 0

        const initialYaw = this.currentYaw
        const initialPitch = this.currentPitch
        const initialRotation = this.cameraRotation.clone()

        const tick = (dt) => {
            if (!this._autoRotating) return

            const delta = this.isSpin360Loop
                ? this.spinSpeed * 0.001
                : Math.min(this.spinSpeed * 0.001, totalAngle - rotated)
            rotated += delta

            switch (model) {
                case 'axis': {
                    const forward = Vec33.FORWARD.clone().transformQuat(this.cameraRotation).normalize()
                    const spinSign = forward.z >= 0 ? 1 : -1
                    const step = (delta / this.rotateSpeed) * spinSign
                    this.sphericalAxisRot(step, 0)
                    break
                }
                case 'spherical': {
                    const modelUp = new Vec33(0, 1, 0).transformQuat(modelEntity.localRotation).normalize()
                    const dotY = modelUp.y
                    const sign = dotY >= 0 ? 1 : -1
                    const quatYaw = new Quat3().setFromAxisAngle(modelUp, -delta * sign)

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
                    this.currentYaw = this.clampYaw(this.currentYaw - delta)
                    this.hemisphericalRot(this.currentYaw, this.currentPitch)
                    break
            }

            if (rotated >= totalAngle) {
                if (this.isSpin360Loop) {
                    rotated -= totalAngle
                } else {
                    this.stopSpin360()
                    onStop?.()
                    return
                }
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
        this.model = 'spherical'
        this.setupTransition({
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
            onTransitionFinished: () => {
                this.model = this.originModel
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

        this._snapCameraToOrigin = true
        this.lerpPositionY = undefined
        this.lerpAnglesX = undefined

        this._preEditBasePosition = null
        this._preEditCenterPivot = null
        this._preEditFocus = null

        this.isEditingOrientation = false
        this.orientationEditMethod = undefined

        this.hemisphericalRot(this.currentYaw, this.minPitch)
        const pose = this.getEntityInfo()
        this.currentPitch = this.minPitch
        this.syncHierarchyAndRender()
        this.saveInitview({ isShowToast: false, defaultDistance: true })
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
        const modelCentroid = localToWorld(getPivotCenter(modelEntity))
        const toModelCenter = new Vec3().copy(modelCentroid).sub(pickCentroidWorld).normalize()
        if (normalInWorld.dot(toModelCenter) > 0) {
            normalInWorld.mulScalar(-1)
        }

        const correctionQuat = quatFromTo(normalInWorld, new Vec3(0, -1, 0))
        const newBaseRotation = new Quat()
        newBaseRotation.mul2(correctionQuat, this.initialModelRotation)

        const currentPosition = modelEntity.localPosition.clone()
        const pivot = this.centerPivot.clone()
        const offsetToPivot = pivot.clone().sub(currentPosition)
        const currentRotation = modelEntity.localRotation.clone()
        const invCurrentRot = currentRotation.clone().invert()
        const deltaQuat = new Quat().mul2(newBaseRotation, invCurrentRot)
        const rotatedOffsetToPivot = this.rotateOffsetByQuat(offsetToPivot, deltaQuat)
        const newPosition = pivot.clone().sub(rotatedOffsetToPivot)

        this.baseRotation = newBaseRotation
        this.basePosition = newPosition
        this.originEntityRotation = this.baseRotation
        this.originEntityPos = this.basePosition
        this.centerPivot = pivot

        this.settings.orientation.pose = { rotation: newBaseRotation, position: newPosition }

        this._preEditBasePosition = null
        this._preEditCenterPivot = null
        this._preEditFocus = null
        this.isEditingOrientation = false
        this.orientationEditMethod = undefined

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
        this.model = 'spherical'
        this.setupTransition({
            targetPose,
            startPose,
            lerpDuration: NORMAL_FADE_TIME,
            onTransitionFinished: () => {
                this.saveInitview({ isShowToast: false, defaultDistance: true })
                this.model = this.originModel
                this.currentPitch = this.minPitch
            },
        })
    }
    lerp(a, b, t) {
        return a + (b - a) * t
    }
    updateModelEntity(dt) {
        if (!this.targetPose || !modelEntity) return
        this.lerpTime += dt
        let t = Math.min(this.lerpTime / this.lerpDuration, 1)
        t = t * t * (3 - 2 * t)
        if (this.originModel === 'cylindrical') {
            this.fov = this.clampFov(this.lerp(this.startPose.fov, this.targetPose.fov, t))
        }
        this.distance = this.clampDistance(this.lerp(this.startPose.distance, this.targetPose.distance, t))
        this.focus.copy(this.startPose.focus).lerp(this.targetPose.focus, t)
        if (this.model === 'spherical') {
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
            if (this.model === 'spherical') {
                modelEntity.localPosition.copy(this.targetPose.position)
                modelEntity.localRotation.copy(this.targetPose.rotation)
                this.updateModelRotation()
            } else {
                this.currentYaw = this.targetPose.yaw
                this.currentPitch = this.targetPose.pitch
                this.hemisphericalRot(this.currentYaw, this.currentPitch)
            }
            if (this.onTransitionFinished) {
                this.onTransitionFinished()
                this.onTransitionFinished = null
            }
            this.targetPose = null
            this.startPose = null
        }
        this.syncHierarchyAndRender()
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
        const isCylindrical = this.originModel === 'cylindrical'
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
        if (this.isEditMessage || this.isMeasurementDrag) return
        const [x, y, z] = move
        if (move[2] !== 0) {
            if (this.model === 'cylindrical' && !this.isEditingOrientation) {
                this.fov = this.clampFov(this.fov + this.fov * move[2] * 0.75)
            } else {
                this.distance = this.clampDistance(this.distance + this.distance * move[2])
            }
        }
        if (x !== 0 || y !== 0 || z !== 0) {
            if (this.isEditingOrientation && this.orientationEditMethod === 'manual') {
                const deltaY = move[1] * 0.75
                const deltaX = move[0] * 0.75

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
                const speed = this.model === 'cylindrical' ? 2 : 1
                v$2.copy(this.rightCam).mulScalar(move[0] * speed)
                this.focus.add(v$2)
                v$2.copy(this.upCam).mulScalar(move[1] * speed)
                this.focus.add(v$2)
            }
        }
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
        const yawQuat = new Quat3().setFromAxisAngle(this.upCam, deltaX * this.rotateSpeed)
        const pitchQuat = new Quat3().setFromAxisAngle(this.rightCam, deltaY * this.rotateSpeed)
        const rotateQuat = pitchQuat.mul(yawQuat).normalize()
        v$2.copy(modelEntity.localPosition).sub(this.centerPivot)
        v$2.transformQuat(rotateQuat)
        modelEntity.localPosition.copy(this.centerPivot).add(v$2)
        const result = rotateQuat.mul(this.modelRotation).normalize()
        modelEntity.localRotation.set(result.x, result.y, result.z, result.w)
        this.modelRotation.copy(modelEntity.localRotation)
    }

    hemisphericalRot(yaw, pitch) {
        const combinedRotateQuat = this.buildCombinedQuat(yaw, pitch)
        const offset = this.basePosition.clone().sub(this.centerPivot)
        const rotatedOffset = this.rotateOffsetByQuat(offset, combinedRotateQuat)
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

    rotateOffsetByQuat(offset, q) {
        const vx = offset.x,
            vy = offset.y,
            vz = offset.z
        const qx = q.x,
            qy = q.y,
            qz = q.z,
            qw = q.w
        const ix = qw * vx + qy * vz - qz * vy
        const iy = qw * vy + qz * vx - qx * vz
        const iz = qw * vz + qx * vy - qy * vx
        const iw = -qx * vx - qy * vy - qz * vz
        return new Vec3(
            ix * qw + iw * -qx + iy * -qz - iz * -qy,
            iy * qw + iw * -qy + iz * -qx - ix * -qz,
            iz * qw + iw * -qz + ix * -qy - iy * -qx,
        )
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
            pose.angles.x = this.originCameraAnglesX ?? pose.angles.x
            this.lerpPositionY = undefined
            this.lerpAnglesX = undefined
            return
        }

        if (isManualOrientation) {
            const speed = 1 - Math.pow(0.00001, dt)
            if (this.lerpPositionY === undefined) this.lerpPositionY = pose.position.y
            if (this.lerpAnglesX === undefined) this.lerpAnglesX = pose.angles.x

            this.lerpPositionY += (0 - this.lerpPositionY) * speed
            this.lerpAnglesX += (0 - this.lerpAnglesX) * speed

            pose.position.y = Math.abs(this.lerpPositionY) < 0.01 ? 0 : this.lerpPositionY
            pose.angles.x = Math.abs(this.lerpAnglesX) < 0.01 ? 0 : this.lerpAnglesX
            if (Math.abs(this.lerpPositionY) < 0.3 && Math.abs(this.lerpAnglesX) < 0.3) {
                this.drawHorizontalLine()
            }
        } else if (this.lerpPositionY !== undefined || this.lerpAnglesX !== undefined) {
            const targetY = this.originCameraPosition?.y ?? pose.position.y
            const targetAnglesX = this.originCameraAnglesX ?? pose.angles.x

            const speed = 1 - Math.pow(0.00001, dt)

            this.lerpPositionY += (targetY - this.lerpPositionY) * speed
            this.lerpAnglesX += (targetAnglesX - this.lerpAnglesX) * speed

            const doneY = Math.abs(this.lerpPositionY - targetY) < 0.001
            const doneA = Math.abs(this.lerpAnglesX - targetAnglesX) < 0.001

            pose.position.y = doneY ? targetY : this.lerpPositionY
            pose.angles.x = doneA ? targetAnglesX : this.lerpAnglesX

            if (doneY && doneA) {
                this.lerpPositionY = undefined
                this.lerpAnglesX = undefined
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
    }
    drawHorizontalLine() {
        if (!this.horizontalLineEntity) {
            this.initHorizontalLine()
        }
        if (this.lastLineDistance === this.distance) return
        this.lastLineDistance = this.distance
        const canvasWidth = this.app.graphicsDevice.width
        const canvasHeight = this.app.graphicsDevice.height
        const fovRad = (50 * Math.PI) / 180

        const worldHeightAtDist = 4 * this.distance * Math.tan(fovRad / 2)
        const worldWidthAtDist = worldHeightAtDist * (canvasWidth / canvasHeight)
        const size = worldWidthAtDist / 2

        const right = Vec33.RIGHT.clone().transformQuat(this.cameraRotation).normalize()

        const offset1 = right.clone().mulScalar(-size)
        const offset2 = right.clone().mulScalar(size)

        offset1.y = 0
        offset2.y = 0

        const positions = [offset1.x, offset1.y, offset1.z, offset2.x, offset2.y, offset2.z]

        this.horizontalLineMesh.setPositions(positions)
        this.horizontalLineMesh.update(PRIMITIVE_LINES)

        this.horizontalLineEntity.localPosition.set(0, 0, 0)
        this.horizontalLineEntity.localRotation.set(0, 0, 0, 1)
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
