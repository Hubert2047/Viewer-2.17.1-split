const v$2 = new Vec33()
class OtherController {
    focus = new Vec33()
    rotation = new Quat3()
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
    minDistance
    maxDistance = 200
    resetPose = null
    inertiaVelX = 0
    inertiaVelY = 0
    inertiaDamping = 0.93
    inertiaMinSpeed = 0.0005
    pointerMoveHistory = []
    isFlick = false
    inertiaFlickThreshold = 0.005
    constructor({ global, bbox, minDistance }) {
        const { app, events, settings } = global
        this.app = app
        this.bbox = bbox
        this.minDistance = minDistance
        this.events = events
        this.settings = settings
        if (['spherical', 'hemispherical', 'cylindrical'].includes(settings.model)) {
            this.model = settings.model
        } else if (!params.spherical) {
            this.model = 'hemispherical'
        } else {
            this.model = 'spherical'
        }
        this.originModel = this.model
        this.initviewPose = settings.initview.pose
        if (settings.orientation) {
            const { rotation: r, position: p } = settings.orientation
            this.baseRotation = new Quat(r.x, r.y, r.z, r.w)
            this.basePosition = new Vec33(p.x, p.y, p.z)
        } else {
            this.baseRotation = modelEntity.localRotation.clone()
            this.basePosition = modelEntity.localPosition.clone()
        }
        this.originPivot = this.bbox.center.clone()
        this.listenEvents()
    }
    listenEvents() {
        this.events.on('hotspot:editing', (isEdit) => {
            this.isEditHotspot = isEdit
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

        this.events.on('viewer:save-initview', () => this.initView())
        this.events.on('viewer:remove-saved-view', () => this.removeInitview())

        this.events.on('pivot:positionsynced', (position) => this.syncPivotPoint(position))
        this.events.on('pivot:delete', () => {
            this.applyAabbPivot()
            this.reset()
        })
        this.events.on('pivot:use', (data) => this.usePivotPoint(data))
        this.events.on('pivot:save', () => {
            this.initView()
        })

        this.events.on('orientation:edit', () => this.startEditModelOrientation())
        this.events.on('orientation:save', () => this.saveModelOrientation())
        this.events.on('orientation:cancel', () => this.cancelOrientation())
        this.events.on('orientation:eulerchange', () => {
            const quat = new Quat()
            quat.setFromEulerAngles(x, y, z)
            modelEntity.setLocalRotation(quat)
            this.updateModelRotation()
            this.syncHierarchyAndRender()
        })

        this.events.on('ortery-controller:transition', ({ entityInfo, lerpDuration, onTransitionFinished }) => {
            const { position: p, focus: f, rotation: r, distanceScale: d, yaw, pitch } = entityInfo
            const startPose = {
                focus: this.focus.clone(),
                position: new Vec3(
                    modelEntity.localPosition.x,
                    modelEntity.localPosition.y,
                    modelEntity.localPosition.z,
                ),
                rotation: modelEntity.localRotation.clone(),
                distance: this.distance,
                yaw: this.currentYaw,
                pitch: this.currentPitch,
            }
            const targetPose = {
                focus: new Vec3(f.x, f.y, f.z),
                position: new Vec3(p.x, p.y, p.z),
                rotation: new Quat(r.x, r.y, r.z, r.w),
                distance: this.clampDistance(this.getActualDistance(d)),
                yaw,
                pitch,
            }
            this.setupTransition({ targetPose, startPose, lerpDuration, onTransitionFinished })
        })
    }
    resetPivot() {
        this.isResetPivot = true
    }
    usePivotPoint({ enabled, position }) {
        if (enabled) {
            this.syncPivotPoint(position)
        } else {
            this.applyAabbPivot()
        }
    }
    applyAabbPivot() {
        const worldOrigin = this.originPivot.clone()
        this.centerPivot = worldOrigin
        this.basePosition = this.calcBasePositionFromPivot(worldOrigin)
    }

    syncPivotPoint(position) {
        if (!this.settings.pivot.enabled || !position) return
        const newCenterPivot = this.getWorldCenterPivot(position)
        this.centerPivot = newCenterPivot
        this.basePosition = this.calcBasePositionFromPivot(newCenterPivot)
    }
    getWorldCenterPivot(pos) {
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        const worldPivotPos = new Vec3()
        worldMatrix.transformPoint(pos, worldPivotPos)
        return worldPivotPos
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
    reset(pose) {
        if (this.isResetting) return
        this.events.fire('hotspot:hide-all')
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
        if (!this.originFocus) this.originFocus = new Vec33().copy(v$2).mulScalar(pose.distance).add(pose.position)

        this.rightCam = Vec33.RIGHT.clone().transformQuat(this.rotation).normalize()
        this.upCam = Vec33.UP.clone().transformQuat(this.rotation).normalize()

        const isFirstInit = !this.hasInitializedFocus
        if (isFirstInit) this.hasInitializedFocus = true

        let startFocus, startDistance, startYaw, startPitch
        let targetFocus, targetDistance, targetYaw, targetPitch
        let targetPosition, targetRotation

        if (this.initviewPose) {
            targetFocus = new Vec3(this.initviewPose.focus.x, this.initviewPose.focus.y, this.initviewPose.focus.z)
            targetDistance = isMobile
                ? Math.max(pose.distance, this.clampDistance(this.getActualDistance(this.initviewPose.distanceScale)))
                : this.clampDistance(this.getActualDistance(this.initviewPose.distanceScale))
            targetYaw = this.initviewPose.yaw || 0
            targetPitch = this.initviewPose.pitch || 0
            targetPosition = new Vec3(
                this.initviewPose.position.x,
                this.initviewPose.position.y,
                this.initviewPose.position.z,
            )
            targetRotation = new Quat(
                this.initviewPose.rotation.x,
                this.initviewPose.rotation.y,
                this.initviewPose.rotation.z,
                this.initviewPose.rotation.w,
            )
        } else {
            targetFocus = pose.focus.clone()
            targetDistance = this.clampDistance(pose.distance)
            targetYaw = 0
            targetPitch = 0
            targetPosition = this.originEntityPos ? this.originEntityPos.clone() : this.basePosition.clone()
            targetRotation = this.originEntityRotation ? this.originEntityRotation.clone() : this.baseRotation.clone()
        }

        if (isFirstInit) {
            startFocus = targetFocus.clone()
            startDistance = targetDistance
            startYaw = targetYaw
            startPitch = targetPitch
        } else {
            startFocus = this.focus.clone()
            startDistance = this.distance
            startYaw = this.currentYaw
            startPitch = this.currentPitch
        }

        this.focus.copy(targetFocus)
        this.distance = targetDistance
        this.currentYaw = targetYaw
        this.currentPitch = targetPitch
        this.rotation = Quat3.lookRotation(v$2.clone().mulScalar(-1), Vec33.UP)

        this.rightCam = Vec33.RIGHT.clone().transformQuat(this.rotation).normalize()
        this.upCam = Vec33.UP.clone().transformQuat(this.rotation).normalize()
        if (modelEntity && !this.originEntityRotation) {
            this.originEntityRotation = modelEntity.localRotation.clone()
            this.originEntityPos = modelEntity.localPosition.clone()
        }
        if (isFirstInit) {
            modelEntity.localPosition.copy(targetPosition)
            modelEntity.localRotation.copy(targetRotation)
            this.modelRotation = targetRotation.clone()

            if (this.settings.pivot.enabled && this.settings.pivot.position) {
                this.centerPivot = this.getWorldCenterPivot(this.settings.pivot.position)
                this.basePosition = this.calcBasePositionFromPivot(this.centerPivot)
            } else {
                this.centerPivot = this.bbox.center.clone()
                this.basePosition = this.calcBasePositionFromPivot(this.centerPivot)
            }

            this.syncHierarchyAndRender()
            return
        }

        this.isResetting = true
        this.setupTransition({
            startPose: {
                focus: startFocus,
                rotation: modelEntity.localRotation.clone(),
                position: modelEntity.localPosition.clone(),
                distance: startDistance,
                yaw: startYaw,
                pitch: startPitch,
            },
            targetPose: {
                focus: targetFocus,
                rotation: targetRotation,
                position: targetPosition,
                distance: targetDistance,
                yaw: targetYaw,
                pitch: targetPitch,
            },
            onTransitionFinished: () => {
                this.isResetting = false
                this.updateModelRotation()
                if (this.settings.pivot.enabled && this.settings.pivot.position) {
                    this.centerPivot = this.getWorldCenterPivot(this.settings.pivot.position)
                    this.basePosition = this.calcBasePositionFromPivot(this.centerPivot)
                }
                this.syncHierarchyAndRender()
            },
            lerpDuration: HOTSPOT_FADE_TIME,
        })
    }
    calcBasePositionFromPivot(centerPivot) {
        if (!centerPivot) return this.basePosition.clone()
        if (!this.rightCam) {
            this.rightCam = Vec33.RIGHT.clone()
        }
        if (!this.upCam) {
            this.upCam = Vec33.UP.clone()
        }
        const combinedQuat = this.buildCombinedQuat(this.currentYaw || 0, this.currentPitch || 0)
        const invQuat = new Quat3(-combinedQuat.x, -combinedQuat.y, -combinedQuat.z, combinedQuat.w)
        const currentOffset = modelEntity.localPosition.clone().sub(centerPivot)
        const baseOffset = this.rotateOffsetByQuat(currentOffset, invQuat)
        return centerPivot.clone().add(baseOffset)
    }
    initView() {
        const pose = this.getEntityInfo()
        this.initviewPose = pose
        this.settings.initview = { pose }
        this.initviewPose.basePosition = this.basePosition.clone()
        showToast('✓ Initial view updated', {
            duration: 1000,
            type: 'success',
        })
    }

    removeInitview() {
        this.initviewPose = null
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
        return (radius / Math.sin(minFovRad / 2))
    }
    onEnter(camera) {
        const distance = this.getDeafultDistance()
        this.maxDistance = Math.max(distance, 200)

        let forward
        if (camera.angles && typeof camera.angles.x === 'number' && typeof camera.angles.y === 'number') {
            const pitchRad = (camera.angles.x * Math.PI) / 180
            const yawRad = (camera.angles.y * Math.PI) / 180
            forward = new Vec33(
                -Math.sin(yawRad) * Math.cos(pitchRad),
                Math.sin(pitchRad),
                -Math.cos(yawRad) * Math.cos(pitchRad),
            ).normalize()
        } else {
            forward = new Vec33(0, 0, -1)
        }

        const focusPoint = this.bbox.center.clone()

        this.resetPose = {
            ...camera,
            distance,
            forward,
            focus: focusPoint,
        }

        this.reset(this.resetPose)
    }
    onExit() {}
    applyInertia() {
        if (this.isEditHotspot || this.targetPose || !modelEntity || !this.modelRotation) return
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
            this.setPitchYaw(dx, dy)
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
    startEditModelOrientation() {
        this.preEditRotation = modelEntity.localRotation.clone()
        this.preEditPosition = modelEntity.localPosition.clone()
        this.preDistance = this.distance
        this.prefocus = this.focus.clone()
        this.updateModelRotation()
    }
    cancelOrientation() {
        if (!this.preEditRotation) return
        this.model = 'spherical'
        this.updateModelRotation()
        const startPose = {
            focus: this.focus.clone(),
            rotation: modelEntity.localRotation.clone(),
            position: modelEntity.localPosition.clone(),
            distance: this.distance,
            yaw: this.currentYaw,
            pitch: this.currentPitch,
        }

        const targetPose = {
            focus: this.prefocus.clone(),
            rotation: this.preEditRotation,
            position: this.preEditPosition,
            distance: this.preDistance,
            yaw: this.currentYaw,
            pitch: this.currentPitch,
        }

        this.setupTransition({
            startPose,
            targetPose,
            lerpDuration: HOTSPOT_FADE_TIME,
            onTransitionFinished: () => {
                this.model = this.originModel
                this.preEditRotation = null
                this.preEditPosition = null
                this.preDistance = null
                this.prefocus = null
                if (this.model === 'cylindrical') {
                    this.minPitch = 0
                    this.maxPitch = 0
                } else if (this.model === 'hemispherical') {
                    this.minPitch = 0
                    this.maxPitch = Math.PI / 2
                }
            },
        })
    }
    saveModelOrientation() {
        this.preSaveBaseRotation = this.baseRotation.clone()
        this.preSaveBasePosition = this.basePosition.clone()
        this.preSaveEntityRotation = modelEntity.localRotation.clone()
        this.preSaveEntityPosition = modelEntity.localPosition.clone()
        this.preSaveDistance = this.distance
        this.preSaveFocus = this.focus.clone()
        this.preSaveOrientation = this.settings.orientation ? { ...this.settings.orientation } : null
        this.baseRotation = modelEntity.localRotation.clone()
        this.basePosition = modelEntity.localPosition.clone()
        this.settings.orientation = { rotation: this.baseRotation, position: this.basePosition }
        this.currentYaw = 0
        this.currentPitch = 0
        this.updateModelRotation()
        this.model = this.originModel
        if (this.model === 'cylindrical') {
            this.minPitch = 0
            this.maxPitch = 0
        } else if (this.model === 'hemispherical') {
            this.minPitch = 0
            this.maxPitch = Math.PI / 2
        }
        if (this.initviewPose) this.initView()
    }
    lerp(a, b, t) {
        return a + (b - a) * t
    }
    updateModelEntity(dt) {
        if (!this.targetPose || !modelEntity) return
        this.lerpTime += dt
        let t = Math.min(this.lerpTime / this.lerpDuration, 1)
        t = t * t * (3 - 2 * t)
        this.distance = this.clampDistance(this.lerp(this.startPose.distance, this.targetPose.distance, t))
        this.focus.copy(this.startPose.focus).lerp(this.targetPose.focus, t)
        const newPos = new Vec33(this.startPose.position.x, this.startPose.position.y, this.startPose.position.z).lerp(
            this.targetPose.position,
            t,
        )
        modelEntity.localPosition.copy({ x: newPos.x, y: newPos.y, z: newPos.z })
        const r = Quat3.slerp(this.startPose.rotation, this.targetPose.rotation, t)
        modelEntity.localRotation.set(r.x, r.y, r.z, r.w)

        if (t >= 1) {
            this.focus.copy(this.targetPose.focus)
            this.distance = this.clampDistance(this.targetPose.distance)
            modelEntity.localPosition.copy(this.targetPose.position)
            modelEntity.localRotation.copy(this.targetPose.rotation)

            if (this.onTransitionFinished) {
                this.onTransitionFinished()
                this.onTransitionFinished = null
            }
            this.updateModelRotation()
            this.currentYaw = this.targetPose.yaw
            this.currentPitch = this.targetPose.pitch
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
    getEntityInfo() {
        return {
            rotation: modelEntity.localRotation.clone(),
            position: modelEntity.localPosition.clone(),
            distanceScale: this.getCurrentDistanceScale(),
            focus: this.focus.clone(),
            pitch: this.currentPitch,
            yaw: this.currentYaw,
        }
    }
    getCurrentDistanceScale() {
        return this.distance / this.originDistance
    }
    getActualDistance(distanceScale) {
        return this.originDistance * distanceScale
    }
    clampDistance(distance) {
        if (!this.settings.lockZoomIn.locked) return Math.min(this.maxDistance, Math.max(this.minDistance, distance))
        return Math.min(this.maxDistance, Math.max(this.getActualDistance(this.settings.lockZoomIn.value), distance))
    }
    move(move, rotate) {
        if (this.isEditHotspot) return
        if (this._gizmo?.isDragging) return
        const [x, y, z] = move
        this.rightCam = Vec33.RIGHT.clone().transformQuat(this.rotation).normalize()
        this.upCam = Vec33.UP.clone().transformQuat(this.rotation).normalize()
        this.distance = this.clampDistance(this.distance + this.distance * move[2])
        if (x !== 0 || y !== 0 || z !== 0) {
            v$2.copy(this.rightCam).mulScalar(move[0])
            this.focus.add(v$2)
            v$2.copy(this.upCam).mulScalar(move[1])
            this.focus.add(v$2)
        }
        const isZooming = z !== 0
        const isPanning = x !== 0 || y !== 0

        let didRotate = false
        if (!this.initPivot) {
            if (this.settings.pivot.enabled && this.settings.pivot.position) {
                this.centerPivot = this.getWorldCenterPivot(this.settings.pivot.position)
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
                if (this.targetPose) return
                if (this.settings.inertia) {
                    this.inertiaVelX = this.inertiaVelX * 0.6 + deltaX * 0.4
                    this.inertiaVelY = this.inertiaVelY * 0.6 + deltaY * 0.4
                }
                if (this.model === 'spherical') this.sphericalRot(deltaX, deltaY)
                else {
                    if (this.cameraElevation === undefined) {
                        if (!settings.orientation) {
                            this.cameraElevation = this.getCameraElevation()
                            if (this.model === 'cylindrical') {
                                this.maxPitch = this.cameraElevation
                                this.minPitch = this.cameraElevation
                            } else {
                                this.minPitch -= this.cameraElevation
                                this.maxPitch -= this.cameraElevation
                            }
                        } else this.cameraElevation = 0
                    }
                    this.setPitchYaw(deltaX, deltaY)
                    this.hemisphericalRot(this.currentYaw, this.currentPitch)
                }
                this.syncHierarchyAndRender()
                const euler = modelEntity.getLocalEulerAngles(new Vec3())
                this.events.fire('orientation:eulersynced', { x: euler.x, y: euler.y, z: euler.z })
                didRotate = true
            }
        }
        if (didRotate) {
            this.events.fire('hotspot:hide-all')
        }
        if (isZooming || isPanning || didRotate) {
            this.events.fire('hotspot:stop-auto')
            this.updateModelRotation()
        }
    }
    getCameraElevation() {
        const forward = Vec33.FORWARD.clone().transformQuat(this.rotation).normalize()
        const camPos = this.focus.clone().sub(forward.mulScalar(this.distance))
        const dir = new Vec3(
            camPos.x - this.centerPivot.x,
            camPos.y - this.centerPivot.y,
            camPos.z - this.centerPivot.z,
        )
        return Math.atan2(dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z))
    }
    setPitchYaw(deltaX, deltaY) {
        const maxDelta = 30
        const magnitude = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
        const scale = magnitude > maxDelta ? maxDelta / magnitude : 1
        const safeDeltaX = deltaX * scale
        const safeDeltaY = deltaY * scale
        this.currentYaw =
            ((((this.currentYaw + safeDeltaX * this.rotateSpeed + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) %
                (2 * Math.PI)) -
            Math.PI
        this.currentPitch += safeDeltaY * this.rotateSpeed
        this.currentPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.currentPitch))
    }

    sphericalRot(deltaX, deltaY) {
        const yawQuat = new Quat3().setFromAxisAngle(this.upCam, deltaX * this.rotateSpeed)
        const pitchQuat = new Quat3().setFromAxisAngle(this.rightCam, deltaY * this.rotateSpeed)
        const rotateQuat = yawQuat.mul(pitchQuat).normalize()
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
    buildCombinedQuat(yaw, pitch) {
        if (!this.baseRotation) {
            this.baseRotation = new Quat3()
        }

        const up = new Vec3(0, 1, 0)
        this.baseRotation.transformVector(up, up)
        up.normalize()
        if (up.dot(Vec3.UP) < 0) up.mulScalar(-1)

        const rightAxis = this.rightCam ? this.rightCam.clone() : Vec33.RIGHT.clone()

        const quatYaw = new Quat3().setFromAxisAngle(up, yaw)
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
        const { focus, rotation, smoothDamp } = this
        const { value, target } = smoothDamp
        focus.toArray(target, 0)
        const dot = value[3] * rotation.x + value[4] * rotation.y + value[5] * rotation.z + value[6] * rotation.w
        const sign = dot < 0 ? -1 : 1
        target[3] = rotation.x * sign
        target[4] = rotation.y * sign
        target[5] = rotation.z * sign
        target[6] = rotation.w * sign
        target[7] = this.distance
        smoothDamp.update(dt)
        const q = new Quat3(value[3], value[4], value[5], value[6]).normalize()
        value[3] = q.x
        value[4] = q.y
        value[5] = q.z
        value[6] = q.w
    }
    getPose(pose) {
        const forward = Vec33.FORWARD.clone().transformQuat(this.rotation).normalize()
        const newPos = this.focus.clone().sub(forward.mulScalar(this.distance))
        pose.position = newPos
        pose.distance = this.distance
    }
}
