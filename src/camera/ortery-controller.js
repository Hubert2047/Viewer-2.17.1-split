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
        this.isSphericalRot = this.model === 'spherical'
        this.originModel = this.model
        this.initviewPose = settings.initview.pose ?? null
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
        this.events.on('orientation:edit', () => this.startEditModelOrientation())
        this.events.on('orientation:save', () => this.saveModelOrientation())
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
                focus: this.getActualFocus(f),
                position: new Vec3(p.x, p.y, p.z),
                rotation: new Quat(r.x, r.y, r.z, r.w),
                distance: this.clampDistance(this.getActualDistance(d)),
                yaw,
                pitch,
            }
            this.setupTransition({ targetPose, startPose, lerpDuration, onTransitionFinished })
        })
    }
    getCustomCenterPivot(pos) {
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        const worldPivotPos = new Vec3()
        worldMatrix.transformPoint(pos, worldPivotPos)
        return worldPivotPos
    }
    resetInertia() {
        this.inertiaVelX = 0
        this.inertiaVelY = 0
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
        if (!pose) pose = this.resetPose
        v$2.copy(pose.forward)
        if (!this.originDistance) this.originDistance = pose.distance
        if (!this.originFocus) this.originFocus = new Vec33().copy(v$2).mulScalar(pose.distance).add(pose.position)

        const isFirstInit = !this.hasInitializedFocus
        if (isFirstInit) this.hasInitializedFocus = true
        let startFocus, startDistance
        let startYaw = 0,
            startPitch = 0
        let targetYaw = 0,
            targetPitch = 0

        if (isFirstInit) {
            if (this.initviewPose) {
                targetYaw = startYaw = this.initviewPose.yaw
                targetPitch = startPitch = this.initviewPose.pitch
            }
        } else {
            startFocus = this.focus.clone()
            startDistance = this.distance
            startYaw = this.currentYaw
            startPitch = this.currentPitch
            if (this.initviewPose) {
                targetYaw = this.initviewPose.yaw
                targetPitch = this.initviewPose.pitch
            }
        }

        let distance
        if (this.initviewPose) {
            const { focus: f, distanceScale: d } = this.initviewPose
            this.focus.copy(this.getActualFocus(f))
            distance = isMobile
                ? Math.max(pose.distance, this.clampDistance(this.getActualDistance(d)))
                : this.clampDistance(this.getActualDistance(d))
            if (!this.initviewDistance) this.initviewDistance = distance
            if (!this.initviewFocus) this.initviewFocus = this.focus.clone()
        } else {
            distance = this.clampDistance(pose.distance)
            this.focus.copy(pose.focus)
            if (!this.initviewDistance) this.initviewDistance = distance
            if (!this.initviewFocus) this.initviewFocus = this.focus.clone()
        }

        if (!startFocus) startFocus = this.focus.clone()
        if (!startDistance) startDistance = distance

        this.rotation = Quat3.lookRotation(v$2.clone().mulScalar(-1), Vec33.UP)
        this.distance = distance

        if (modelEntity && !this.originEntityRotation) {
            this.originEntityRotation = modelEntity.localRotation.clone()
            this.originEntityPos = modelEntity.localPosition.clone()
        }
        if (modelEntity && this.originEntityRotation) {
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
                    focus: this.initviewFocus,
                    rotation: this.originEntityRotation.clone(),
                    position: this.originEntityPos.clone(),
                    distance: this.initviewDistance,
                    yaw: targetYaw,
                    pitch: targetPitch,
                },
                onTransitionFinished: () => {
                    this.isResetting = false
                },
                lerpDuration: HOTSPOT_FADE_TIME,
            })
        }
    }
    initView() {
        const pose = this.getEntityInfo()
        this.initviewPose = pose
        this.originEntityRotation = modelEntity.localRotation.clone()
        this.originEntityPos = modelEntity.localPosition.clone()
        this.initviewFocus = this.focus.clone()
        this.initviewDistance = this.distance
        return pose
    }
    resetInitView() {
        this.initviewPose = null
        this.originEntityRotation = this.baseRotation.clone()
        this.originEntityPos = this.basePosition.clone()
        this.initviewDistance = this.resetPose.distance
        this.initviewFocus = this.resetPose.focus.clone()
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
        return (radius / Math.sin(minFovRad / 2)) * 1.1
    }
    onEnter(camera) {
        const distance = this.getDeafultDistance()
        this.maxDistance = Math.max(distance, 200)
        const pitchRad = (camera.angles.x * Math.PI) / 180
        const yawRad = (camera.angles.y * Math.PI) / 180
        const forward = new Vec33(
            -Math.sin(yawRad) * Math.cos(pitchRad),
            Math.sin(pitchRad),
            -Math.cos(yawRad) * Math.cos(pitchRad),
        ).normalize()
        this.resetPose = {
            ...camera,
            distance,
            forward,
            focus: this.bbox.center.clone(),
        }
        if (this.initviewPose) {
            const { position: p, rotation: r } = this.initviewPose
            this.storeDistance = distance
            modelEntity.setLocalPosition(p.x, p.y, p.z)
            modelEntity.setLocalRotation(r.x, r.y, r.z, r.w)
        }
        this.reset(this.resetPose)
    }

    resetToInitView() {
        if (!this.initviewPose) return
        const { position: p, rotation: r, focus: f, distanceScale: d, yaw, pitch } = this.initviewPose

        this.focus.copy(this.getActualFocus(f))
        this.distance = this.getActualDistance(d)

        modelEntity.setLocalPosition(p.x, p.y, p.z)
        modelEntity.setLocalRotation(r.x, r.y, r.z, r.w)

        if (this.model !== 'spherical') {
            this.currentYaw = yaw || 0
            this.currentPitch = pitch || 0
            this.hemisphericalRot(this.currentYaw, this.currentPitch)
        }

        this.updateModelRotation()
        this.syncHierarchyAndRender()

        this.initviewFocus = this.focus.clone()
        this.initviewDistance = this.distance
        this.originEntityRotation = modelEntity.localRotation.clone()
        this.originEntityPos = modelEntity.localPosition.clone()
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
    resetPivot() {
        settings.pivotPos = null
        this.centerPivot = this.originPivot
        this.events.fire('inputEvent', 'frame')
    }
    savePivot(pos) {
        settings.pivotPos = pos
        this.centerPivot = this.getCustomCenterPivot(settings.pivotPos)
    }
    setupTransition({ targetPose, startPose, onTransitionFinished, lerpDuration }) {
        this.targetPose = targetPose
        this.startPose = startPose
        this.onTransitionFinished = onTransitionFinished
        this.lerpTime = 0
        this.lerpDuration = lerpDuration
    }
    startEditModelOrientation() {
        this.model = 'spherical'
        this.updateModelRotation()
        if (this._gizmo) {
            this._gizmo.saveSnapshot()
            this._gizmo.enable()
        }
    }
    saveModelOrientation() {
        if (this._gizmo) this._gizmo.disable()
        this.baseRotation = modelEntity.localRotation.clone()
        this.basePosition = modelEntity.localPosition.clone()
        settings.orientation = {
            rotation: this.baseRotation,
            position: this.basePosition,
        }
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
        if (this.isSphericalRot) {
            modelEntity.localRotation = Quat3.slerp(this.startPose.rotation, this.targetPose.rotation, t)
        } else {
            this.currentYaw = this.lerp(this.startPose.yaw, this.targetPose.yaw, t)
            this.currentPitch = this.lerp(this.startPose.pitch, this.targetPose.pitch, t)
            this.hemisphericalRot(this.currentYaw, this.currentPitch)
        }
        if (t >= 0.99 && this.onTransitionFinished) {
            this.onTransitionFinished()
            this.onTransitionFinished = null
        }
        if (t >= 1) {
            this.focus.copy(this.targetPose.focus)
            this.distance = this.clampDistance(this.targetPose.distance, t)
            modelEntity.localPosition.copy(this.targetPose.position)
            if (this.isSphericalRot) modelEntity.localRotation.copy(this.targetPose.rotation)
            else {
                this.currentYaw = this.targetPose.yaw
                this.currentPitch = this.targetPose.pitch
                this.hemisphericalRot(this.currentYaw, this.currentPitch)
            }
            this.updateModelRotation()
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
        const aspect = this.app.graphicsDevice.width / this.app.graphicsDevice.height
        return {
            rotation: modelEntity.localRotation.clone(),
            position: modelEntity.localPosition.clone(),
            distanceScale: this.getCurrentDistanceScale(),
            focus: {
                x: (this.focus.x - this.originFocus.x) / aspect,
                y: (this.focus.y - this.originFocus.y) / aspect,
                z: (this.focus.z - this.originFocus.z) / aspect,
                aspect,
                distance: this.originDistance,
            },
            pitch: this.currentPitch,
            yaw: this.currentYaw,
        }
    }
    getCurrentDistanceScale() {
        return this.distance / this.originDistance
    }
    getActualFocus(f) {
        const aspect = this.app.graphicsDevice.width / this.app.graphicsDevice.height
        const aspectScale = aspect > f.aspect ? f.aspect : aspect
        const distanceScale = aspect > f.aspect ? 1 : this.originDistance / f.distance
        return new Vec3(
            this.originFocus.x + f.x * distanceScale * aspectScale,
            this.originFocus.y + f.y * distanceScale * aspectScale,
            this.originFocus.z + f.z * distanceScale * aspectScale,
        )
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
            this.centerPivot = settings.pivotPos ? this.getCustomCenterPivot(settings.pivotPos) : this.originPivot
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
                didRotate = true
            }
        }
        if (didRotate) {
            this.events.fire('hotspot:hide-all')
        }
        if (isZooming || isPanning || didRotate) {
            this.events.fire('hotspot:stop-auto')
            this.updateModelRotation()
            this.targetPose = null
            this.startPose = null
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
        modelEntity.localRotation.copy(rotateQuat.mul(this.modelRotation).normalize())
        this.modelRotation.copy(modelEntity.localRotation)
    }
    hemisphericalRot(yaw, pitch) {
        const up = new Vec3(0, 1, 0)
        this.baseRotation.transformVector(up, up)
        up.normalize()
        if (up.dot(Vec3.UP) < 0) up.mulScalar(-1)
        const quatYaw = new Quat3().setFromAxisAngle(up, yaw)
        const quatPitch = new Quat3().setFromAxisAngle(this.rightCam, pitch)
        const combinedRotateQuat = quatPitch.mul(quatYaw).normalize()
        const offset = this.basePosition.clone().sub(this.centerPivot)
        const rotatedOffset = this.rotateOffsetByQuat(offset, combinedRotateQuat)
        modelEntity.localPosition.copy(this.centerPivot.clone().add(rotatedOffset))
        modelEntity.localRotation.copy(combinedRotateQuat.mul(this.baseRotation).normalize())
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
