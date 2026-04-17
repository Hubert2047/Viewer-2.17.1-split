class EntityRotatable {
    constructor(entity, events) {
        this._entity = entity
        this._events = events
    }
    getPosition() {
        return this._entity.getPosition()
    }
    getRotation() {
        return this._entity.getRotation()
    }
    applyRotation(quatDelta) {
        const cur = this._entity.getRotation()
        const next = new Quat().mul2(quatDelta, cur).normalize()
        this._entity.setRotation(next)
    }
    getEuler() {
        return this._entity.getLocalEulerAngles(new Vec3())
    }
    onRotate(data) {
        this._events.fire('orientation:eulersynced', data)
    }
}
