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

    getPosition() {
        const dim = this._getDimension()
        if (!dim) return new Vec3()
        const gsplatEntity = this._app.root.findByName('gsplat')
        if (!gsplatEntity) return new Vec3()
        const wd = gsplatEntity.getWorldTransform().data
        const p = dim.position
        return new Vec3(
            wd[0]*p.x + wd[4]*p.y + wd[8]*p.z  + wd[12],
            wd[1]*p.x + wd[5]*p.y + wd[9]*p.z  + wd[13],
            wd[2]*p.x + wd[6]*p.y + wd[10]*p.z + wd[14],
        )
    }

    getRotation() {
        return this._quat.clone()
    }

    applyRotation(quatDelta) {
        this._quat = new Quat().mul2(quatDelta, this._quat).normalize()
        const euler = this._quat.getEulerAngles()
        const dim = this._getDimension()
        if (!dim) return
        dim.rotation = { x: euler.x, y: euler.y, z: euler.z }
        this._onRotate({ x: euler.x, y: euler.y, z: euler.z })
    }

    getEuler() {
        return this._quat.getEulerAngles()
    }

    onRotate(data) {
        this._onRotate(data)
    }
}