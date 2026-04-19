class DimensionRotatable {
    constructor(app, getDimension, onRotate) {
        this._getDimension = getDimension
        this._app = app
        this._onRotate = onRotate
        this._quat = new Quat()
        this._syncQuat()
    }
    _syncQuat() {
        const dim = this._getDimension()
        if (!dim) return
        this._quat.setFromEulerAngles(dim.rotation.x, dim.rotation.y, dim.rotation.z)
    }
    syncFromExternal() {
        this._syncQuat()
    }
    getPosition() {
        const dim = this._getDimension()
        if (!dim || !modelEntity) return null
        const wd = modelEntity.getWorldTransform().data
        const p = dim.position
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
        const dim = this._getDimension()
        if (!dim) return
        const euler = this._quat.getEulerAngles()
        dim.rotation = { x: euler.x, y: euler.y, z: euler.z }
        this._onRotate(dim.rotation)
    }
    getEuler() {
        return this._quat.getEulerAngles()
    }
    onRotate(data) {
        this._onRotate(data)
    }
}
