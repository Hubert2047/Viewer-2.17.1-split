class Vec33 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x
        this.y = y
        this.z = z
    }
    copy(v) {
        this.x = v.x
        this.y = v.y
        this.z = v.z
        return this
    }
    set(x, y, z) {
        this.x = x
        this.y = y
        this.z = z
        return this
    }
    add(v) {
        this.x += v.x
        this.y += v.y
        this.z += v.z
        return this
    }
    sub(v) {
        this.x -= v.x
        this.y -= v.y
        this.z -= v.z
        return this
    }
    mulScalar(s) {
        this.x *= s
        this.y *= s
        this.z *= s
        return this
    }
    lerp(target, t) {
        this.x += (target.x - this.x) * t
        this.y += (target.y - this.y) * t
        this.z += (target.z - this.z) * t
        return this
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
    }
    normalize() {
        const len = this.length()
        if (len > 0) {
            this.mulScalar(1 / len)
        }
        return this
    }
    cross(v) {
        const x = this.y * v.z - this.z * v.y
        const y = this.z * v.x - this.x * v.z
        const z = this.x * v.y - this.y * v.x
        this.x = x
        this.y = y
        this.z = z
        return this
    }
    toArray(arr, offset = 0) {
        arr[offset] = this.x
        arr[offset + 1] = this.y
        arr[offset + 2] = this.z
    }
    fromArray(arr, offset = 0) {
        this.x = arr[offset]
        this.y = arr[offset + 1]
        this.z = arr[offset + 2]
        return this
    }
    transformQuat(q) {
        const x = this.x,
            y = this.y,
            z = this.z
        const qx = q.x,
            qy = q.y,
            qz = q.z,
            qw = q.w
        const ix = qw * x + qy * z - qz * y
        const iy = qw * y + qz * x - qx * z
        const iz = qw * z + qx * y - qy * x
        const iw = -qx * x - qy * y - qz * z
        this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy
        this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz
        this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx
        return this
    }
    cloneTransformQuat(q) {
        const v = this.clone()
        v.transformQuat(q)
        return v
    }
    static get FORWARD() {
        return new Vec33(0, 0, -1)
    }
    static get UP() {
        return new Vec33(0, 1, 0)
    }
    static get RIGHT() {
        return new Vec33(1, 0, 0)
    }
    clone() {
        return new Vec33(this.x, this.y, this.z)
    }
}
class Quat3 {
    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x
        this.y = y
        this.z = z
        this.w = w
    }
    set(x, y, z, w) {
        this.x = x
        this.y = y
        this.z = z
        this.w = w
        return this
    }
    copy(q) {
        this.x = q.x
        this.y = q.y
        this.z = q.z
        this.w = q.w
        return this
    }
    clone() {
        return new Quat3(this.x, this.y, this.z, this.w)
    }
    static slerp(a, b, t) {
        let cosHalfTheta = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
        if (cosHalfTheta < 0) {
            b = new Quat3(-b.x, -b.y, -b.z, -b.w)
            cosHalfTheta = -cosHalfTheta
        }
        if (cosHalfTheta > 0.9995) {
            return new Quat3(
                a.x + t * (b.x - a.x),
                a.y + t * (b.y - a.y),
                a.z + t * (b.z - a.z),
                a.w + t * (b.w - a.w),
            ).normalize()
        }
        const halfTheta = Math.acos(cosHalfTheta)
        const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta)
        const ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta
        const ratioB = Math.sin(t * halfTheta) / sinHalfTheta
        return new Quat3(
            a.x * ratioA + b.x * ratioB,
            a.y * ratioA + b.y * ratioB,
            a.z * ratioA + b.z * ratioB,
            a.w * ratioA + b.w * ratioB,
        )
    }
    normalize() {
        const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w)
        if (len > 0) {
            const invLen = 1 / len
            this.x *= invLen
            this.y *= invLen
            this.z *= invLen
            this.w *= invLen
        }
        return this
    }
    mul(q) {
        const ax = this.x,
            ay = this.y,
            az = this.z,
            aw = this.w
        const bx = q.x,
            by = q.y,
            bz = q.z,
            bw = q.w
        this.x = aw * bx + ax * bw + ay * bz - az * by
        this.y = aw * by - ax * bz + ay * bw + az * bx
        this.z = aw * bz + ax * by - ay * bx + az * bw
        this.w = aw * bw - ax * bx - ay * by - az * bz
        return this
    }
    setFromAxisAngle(axis, angleRad) {
        const halfAngle = angleRad * 0.5
        const s = Math.sin(halfAngle)
        this.x = axis.x * s
        this.y = axis.y * s
        this.z = axis.z * s
        this.w = Math.cos(halfAngle)
        return this
    }
    setFromEulerAngles(euler) {
        const yaw = (euler.y * Math.PI) / 180
        const pitch = (euler.x * Math.PI) / 180
        const roll = (euler.z * Math.PI) / 180
        const cy = Math.cos(yaw * 0.5)
        const sy = Math.sin(yaw * 0.5)
        const cp = Math.cos(pitch * 0.5)
        const sp = Math.sin(pitch * 0.5)
        const cr = Math.cos(roll * 0.5)
        const sr = Math.sin(roll * 0.5)
        this.w = cr * cp * cy + sr * sp * sy
        this.x = sr * cp * cy - cr * sp * sy
        this.y = cr * sp * cy + sr * cp * sy
        this.z = cr * cp * sy - sr * sp * cy
        return this
    }
    transformVector(vec) {
        return vec.clone().transformQuat(this)
    }
    static lookRotation(forward, up) {
        const z = forward.clone().normalize()
        const x = up.clone().cross(z).normalize()
        const y = z.clone().cross(x)
        const m00 = x.x,
            m01 = y.x,
            m02 = z.x
        const m10 = x.y,
            m11 = y.y,
            m12 = z.y
        const m20 = x.z,
            m21 = y.z,
            m22 = z.z
        const trace = m00 + m11 + m22
        const q = new Quat3()
        if (trace > 0) {
            const s = 0.5 / Math.sqrt(trace + 1)
            q.w = 0.25 / s
            q.x = (m21 - m12) * s
            q.y = (m02 - m20) * s
            q.z = (m10 - m01) * s
        } else if (m00 > m11 && m00 > m22) {
            const s = 2 * Math.sqrt(1 + m00 - m11 - m22)
            q.w = (m21 - m12) / s
            q.x = 0.25 * s
            q.y = (m01 + m10) / s
            q.z = (m02 + m20) / s
        } else if (m11 > m22) {
            const s = 2 * Math.sqrt(1 + m11 - m00 - m22)
            q.w = (m02 - m20) / s
            q.x = (m01 + m10) / s
            q.y = 0.25 * s
            q.z = (m12 + m21) / s
        } else {
            const s = 2 * Math.sqrt(1 + m22 - m00 - m11)
            q.w = (m10 - m01) / s
            q.x = (m02 + m20) / s
            q.y = (m12 + m21) / s
            q.z = 0.25 * s
        }
        return q.normalize()
    }
}
class SmoothDamp3 {
    constructor(initialValue) {
        this.value = initialValue.slice()
        this.target = initialValue.slice()
        this.velocity = new Array(initialValue.length).fill(0)
        this.smoothTime = 0
    }
    update(dt) {
        const smoothTime = Math.max(this.smoothTime, 1e-6)
        const omega = 2 / smoothTime
        const x = omega * dt
        const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)
        for (let i = 0; i < this.value.length; i++) {
            const v = this.velocity[i]
            const t = this.target[i]
            let x0 = this.value[i]
            let xDiff = x0 - t
            const temp = (v + omega * xDiff) * dt
            this.velocity[i] = (v - omega * temp) * exp
            this.value[i] = t + (xDiff + temp) * exp
        }
    }
}