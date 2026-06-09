class DimensionRotatable {
    constructor(app, dimensions, onRotate) {
        this.dimensions = dimensions
        this._app = app
        this._onRotate = onRotate
        this._quat = new Quat()
        this._syncQuat()
    }
    _syncQuat() {
        if (!this.dimensions) return
        this._quat.setFromEulerAngles(
            this.dimensions.rotation.x,
            this.dimensions.rotation.y,
            this.dimensions.rotation.z,
        )
    }
    syncFromExternal(dimentions) {
        this.dimensions = dimentions
        this._syncQuat()
    }
    getPosition() {
        if (!this.dimensions || !modelEntity) return null
        const wd = modelEntity.getWorldTransform().data
        const p = this.dimensions.position
        return new Vec3(
            wd[0] * p.x + wd[4] * p.y + wd[8] * p.z + wd[12],
            wd[1] * p.x + wd[5] * p.y + wd[9] * p.z + wd[13],
            wd[2] * p.x + wd[6] * p.y + wd[10] * p.z + wd[14],
        )
    }
    getRotation() {
        if (!modelEntity) return this._quat.clone()
        const modelQuat = new Quat()
        modelQuat.setFromMat4(modelEntity.getWorldTransform())
        return new Quat().mul2(modelQuat, this._quat).normalize()
    }
    applyRotation(quatDelta) {
        if (modelEntity) {
            const modelQuat = new Quat().setFromMat4(modelEntity.getWorldTransform())
            const invModelQuat = modelQuat.clone().invert()
            quatDelta = new Quat().mul2(invModelQuat, quatDelta).mul(modelQuat)
        }
        this._quat = new Quat().mul2(quatDelta, this._quat).normalize()
        if (!this.dimensions) return
        const euler = this._quat.getEulerAngles()
        this.dimensions.rotation = { x: euler.x, y: euler.y, z: euler.z }
        this._onRotate(this.dimensions.rotation)
    }
    getEuler() {
        return this._quat.getEulerAngles()
    }
    onRotate(data) {
        this._onRotate(data)
    }
}
