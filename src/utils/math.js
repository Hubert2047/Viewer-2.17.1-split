function degToRad(d) {
    return (d * Math.PI) / 180
}
function radToDeg(r) {
    return (r * 180) / Math.PI
}
function dimensionWorldToLocal(worldPos, rotation) {
    const q = new Quat().setFromEulerAngles(rotation.x, rotation.y, rotation.z)
    const right = q.transformVector(new Vec3(1, 0, 0))
    const up = q.transformVector(new Vec3(0, 1, 0))
    const forward = q.transformVector(new Vec3(0, 0, 1))
    return {
        x: worldPos.x * right.x + worldPos.y * right.y + worldPos.z * right.z,
        y: worldPos.x * up.x + worldPos.y * up.y + worldPos.z * up.z,
        z: worldPos.x * forward.x + worldPos.y * forward.y + worldPos.z * forward.z,
    }
}
function dimensionLocalToWorld(localPos, rotation) {
    const q = new Quat().setFromEulerAngles(rotation.x, rotation.y, rotation.z)
    const right = q.transformVector(new Vec3(1, 0, 0))
    const up = q.transformVector(new Vec3(0, 1, 0))
    const forward = q.transformVector(new Vec3(0, 0, 1))
    const { x, y, z } = localPos
    return {
        x: x * right.x + y * up.x + z * forward.x,
        y: x * right.y + y * up.y + z * forward.y,
        z: x * right.z + y * up.z + z * forward.z,
    }
}
function getDimensionsInfo(localCenters, calRota = false) {
    const count = localCenters.length / 3

    let cx = 0,
        cy = 0,
        cz = 0
    for (let i = 0; i < count; i++) {
        cx += localCenters[i * 3]
        cy += localCenters[i * 3 + 1]
        cz += localCenters[i * 3 + 2]
    }
    cx /= count
    cy /= count
    cz /= count

    let cxx = 0,
        cxz = 0,
        czz = 0
    for (let i = 0; i < count; i++) {
        const dx = localCenters[i * 3] - cx
        const dz = localCenters[i * 3 + 2] - cz
        cxx += dx * dx
        cxz += dx * dz
        czz += dz * dz
    }
    cxx /= count
    cxz /= count
    czz /= count

    let angle = calRota ? 0.5 * Math.atan2(2 * cxz, cxx - czz) : 0

    let cosA = Math.cos(angle)
    let sinA = Math.sin(angle)

    let minX = Infinity,
        maxX = -Infinity
    let minY = Infinity,
        maxY = -Infinity
    let minZ = Infinity,
        maxZ = -Infinity
    for (let i = 0; i < count; i++) {
        const dx = localCenters[i * 3] - cx
        const dy = localCenters[i * 3 + 1] - cy
        const dz = localCenters[i * 3 + 2] - cz
        const lx = cosA * dx + sinA * dz
        const ly = dy
        const lz = -sinA * dx + cosA * dz
        if (lx < minX) minX = lx
        if (lx > maxX) maxX = lx
        if (ly < minY) minY = ly
        if (ly > maxY) maxY = ly
        if (lz < minZ) minZ = lz
        if (lz > maxZ) maxZ = lz
    }
    if (maxZ - minZ > maxX - minX) {
        angle += Math.PI / 2
        cosA = Math.cos(angle)
        sinA = Math.sin(angle)
        minX = Infinity
        maxX = -Infinity
        minY = Infinity
        maxY = -Infinity
        minZ = Infinity
        maxZ = -Infinity
        for (let i = 0; i < count; i++) {
            const dx = localCenters[i * 3] - cx
            const dy = localCenters[i * 3 + 1] - cy
            const dz = localCenters[i * 3 + 2] - cz
            const lx = cosA * dx + sinA * dz
            const ly = dy
            const lz = -sinA * dx + cosA * dz
            if (lx < minX) minX = lx
            if (lx > maxX) maxX = lx
            if (ly < minY) minY = ly
            if (ly > maxY) maxY = ly
            if (lz < minZ) minZ = lz
            if (lz > maxZ) maxZ = lz
        }
    }

    while (angle > Math.PI) angle -= Math.PI * 2
    while (angle < -Math.PI) angle += Math.PI * 2

    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const midZ = (minZ + maxZ) / 2

    const position = {
        x: cx + cosA * midX - sinA * midZ,
        y: cy + midY,
        z: cz + sinA * midX + cosA * midZ,
    }

    const size = {
        x: maxX - minX,
        y: maxY - minY,
        z: maxZ - minZ,
    }

    const rotation = {
        x: 0,
        y: calRota ? -(angle * (180 / Math.PI)) : 0,
        z: 0,
    }

    return { rotation, position, size }
}
let visiblePoints
function getVisiblePoints(modelEntity) {
    if (visiblePoints) return visiblePoints
    const gsplatInstance = modelEntity.gsplat.instance.meshInstance.gsplatInstance
    const resource = gsplatInstance.resource
    const gsplatData = resource.gsplatData
    const count = gsplatData.numSplats
    const p = new Vec3()
    const r = new Quat()
    const s = new Vec3()
    const c = new Vec4()
    const iter = gsplatData.createIter(p, r, s, c)
    const visibleCenters = []
    for (let i = 0; i < count; i++) {
        iter.read(i)
        if (c.w > OPACITY_THRESHOLD) {
            visibleCenters.push(p.x, p.y, p.z)
        }
    }
    visiblePoints = new Float32Array(visibleCenters)
    return visiblePoints
}
function getPivotCenter(modelEntity) {
    const gsplatInstance = modelEntity.gsplat.instance.meshInstance.gsplatInstance
    const resource = gsplatInstance.resource
    const gsplatData = resource.gsplatData
    const count = gsplatData.numSplats
    const p = new Vec3()
    const r = new Quat()
    const s = new Vec3()
    const c = new Vec4()
    const iter = gsplatData.createIter(p, r, s, c)

    let wx = 0,
        wy = 0,
        wz = 0,
        totalWeight = 0

    for (let i = 0; i < count; i++) {
        iter.read(i)
        if (c.w > OPACITY_THRESHOLD) {
            wx += p.x * c.w
            wy += p.y * c.w
            wz += p.z * c.w
            totalWeight += c.w
        }
    }
    if (totalWeight === 0) return global.bbox.center.clone()

    return new Vec3(wx / totalWeight, wy / totalWeight, wz / totalWeight)
}
function pickModelLocalPoint(x, y, camera, preciseMode = false) {
    const from = camera.screenToWorld(x, y, camera.nearClip)
    const to = camera.screenToWorld(x, y, camera.farClip)
    const worldRay = new Ray(from, to.clone().sub(from).normalize())
    const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
    const invWorldMatrix = new Mat4().copy(worldMatrix).invert()
    const localRayOrigin = new Vec3()
    const localRayDirection = new Vec3()
    invWorldMatrix.transformPoint(worldRay.origin, localRayOrigin)
    invWorldMatrix.transformVector(worldRay.direction, localRayDirection)
    localRayDirection.normalize()
    const localRay = new Ray(localRayOrigin, localRayDirection)

    const gsplatData = modelEntity.gsplat.instance.meshInstance.gsplatInstance.resource.gsplatData
    const count = gsplatData.numSplats

    const p = new Vec3(),
        r = new Quat(),
        s = new Vec3(),
        c = new Vec4()
    const iter = gsplatData.createIter(p, r, s, c)

    const dp = new Vec3(),
        dr = new Quat(),
        ds = new Vec3(),
        dc = new Vec4()
    const detectIter = gsplatData.createIter(dp, dr, ds, dc)
    let negCount = 0,
        totalSeen = 0
    for (let i = 0; i < Math.min(count, 200); i++) {
        detectIter.read(i)
        if (dc.w < 0.1) continue
        if (ds.x < 0 || ds.y < 0 || ds.z < 0) negCount++
        totalSeen++
    }
    const useExpScale = totalSeen > 0 && negCount / totalSeen > 0.5

    const OPACITY_THRESHOLD = 0.1
    const candidates = []
    const oc = new Vec3()

    for (let i = 0; i < count; i++) {
        iter.read(i)
        if (c.w <= OPACITY_THRESHOLD) continue

        oc.set(p.x - localRay.origin.x, p.y - localRay.origin.y, p.z - localRay.origin.z)
        const t = oc.dot(localRay.direction)
        if (t < 0) continue

        const closestX = localRay.origin.x + t * localRay.direction.x - p.x
        const closestY = localRay.origin.y + t * localRay.direction.y - p.y
        const closestZ = localRay.origin.z + t * localRay.direction.z - p.z
        const distSq = closestX * closestX + closestY * closestY + closestZ * closestZ

        const sx = useExpScale ? Math.exp(s.x) : Math.abs(s.x)
        const sy = useExpScale ? Math.exp(s.y) : Math.abs(s.y)
        const sz = useExpScale ? Math.exp(s.z) : Math.abs(s.z)
        const maxScale = Math.max(sx, sy, sz)

        if (distSq > maxScale * maxScale * 4) continue

        candidates.push({ t, opacity: c.w, pos: p.clone(), scale: new Vec3(sx, sy, sz), rot: r.clone() })
    }

    if (candidates.length === 0) {
        if (preciseMode) return null
        return findFallbackIntersectionPoint(localRay, invWorldMatrix)
    }

    candidates.sort((a, b) => a.t - b.t)

    if (!preciseMode) {
        let accumulated = 0
        for (const cand of candidates) {
            accumulated += cand.opacity * (1 - accumulated)
            if (accumulated > 0.5) {
                return new Vec3(
                    localRay.origin.x + cand.t * localRay.direction.x,
                    localRay.origin.y + cand.t * localRay.direction.y,
                    localRay.origin.z + cand.t * localRay.direction.z,
                )
            }
        }
        return new Vec3(
            localRay.origin.x + candidates[0].t * localRay.direction.x,
            localRay.origin.y + candidates[0].t * localRay.direction.y,
            localRay.origin.z + candidates[0].t * localRay.direction.z,
        )
    }

    const medianScale = computeMedianSplatScale(gsplatData, useExpScale)
    const SPLAT_RADIUS_MULTIPLIER = Math.max(1.5, Math.min(5.0, 0.15 / medianScale))
    let bestT = null
    let bestScore = Infinity
    const ocLocal = new Vec3()
    const dLocal = new Vec3()

    for (const cand of candidates.slice(0, 50)) {
        const { x: sx, y: sy, z: sz } = cand.scale
        if (sx < 1e-6 || sy < 1e-6 || sz < 1e-6) continue

        const invRot = new Quat(-cand.rot.x, -cand.rot.y, -cand.rot.z, cand.rot.w)

        ocLocal.set(localRay.origin.x - cand.pos.x, localRay.origin.y - cand.pos.y, localRay.origin.z - cand.pos.z)
        invRot.transformVector(ocLocal, ocLocal)
        invRot.transformVector(localRay.direction, dLocal)

        const rsx = sx * SPLAT_RADIUS_MULTIPLIER
        const rsy = sy * SPLAT_RADIUS_MULTIPLIER
        const rsz = sz * SPLAT_RADIUS_MULTIPLIER

        const oex = ocLocal.x / rsx,
            oey = ocLocal.y / rsy,
            oez = ocLocal.z / rsz
        const dex = dLocal.x / rsx,
            dey = dLocal.y / rsy,
            dez = dLocal.z / rsz

        const a = dex * dex + dey * dey + dez * dez
        const b = 2 * (oex * dex + oey * dey + oez * dez)
        const cv = oex * oex + oey * oey + oez * oez - 1.0
        const disc = b * b - 4 * a * cv
        if (disc < 0) continue

        const t1 = (-b - Math.sqrt(disc)) / (2 * a)
        const t2 = (-b + Math.sqrt(disc)) / (2 * a)
        const tHit = t1 >= 0 ? t1 : t2 >= 0 ? t2 : null
        if (tHit === null) continue

        const score = tHit - cand.opacity * 0.01
        if (score < bestScore) {
            bestScore = score
            bestT = tHit
        }
    }
    if (bestT !== null) {
        return new Vec3(
            localRay.origin.x + bestT * localRay.direction.x,
            localRay.origin.y + bestT * localRay.direction.y,
            localRay.origin.z + bestT * localRay.direction.z,
        )
    }

    return null
}
function computeMedianSplatScale(gsplatData, useExpScale) {
    const count = gsplatData.numSplats
    const p = new Vec3(),
        r = new Quat(),
        s = new Vec3(),
        c = new Vec4()
    const iter = gsplatData.createIter(p, r, s, c)
    const maxScales = []
    for (let i = 0; i < count; i++) {
        iter.read(i)
        if (c.w < 0.1) continue
        const sx = useExpScale ? Math.exp(s.x) : Math.abs(s.x)
        const sy = useExpScale ? Math.exp(s.y) : Math.abs(s.y)
        const sz = useExpScale ? Math.exp(s.z) : Math.abs(s.z)
        maxScales.push(Math.max(sx, sy, sz))
    }
    if (maxScales.length === 0) return 0.05
    maxScales.sort((a, b) => a - b)
    return maxScales[Math.floor(maxScales.length / 2)]
}

function findFallbackIntersectionPoint(localRay, invWorldMatrix) {
    const aabbHit = intersectRayAABB(localRay, invWorldMatrix)
    if (aabbHit) return aabbHit

    const bboxIntersection = intersectBoundingBoxCenterPlane(localRay, invWorldMatrix)
    if (bboxIntersection) return bboxIntersection

    return localRay.getPoint(5.0)
}

function intersectBoundingBoxCenterPlane(localRay, invWorldMatrix) {
    const meshInstance = modelEntity.gsplat.instance.meshInstance
    const aabbWorld = meshInstance.aabb
    const bboxCenterWorld = aabbWorld.center.clone()
    const bboxCenterLocal = new Vec3()
    invWorldMatrix.transformPoint(bboxCenterWorld, bboxCenterLocal)

    const planeNormal = localRay.direction.clone()
    return intersectRayPlane(localRay, bboxCenterLocal, planeNormal)
}
function intersectRayPlane(ray, planePoint, planeNormal) {
    const denom = planeNormal.dot(ray.direction)
    if (Math.abs(denom) < 1e-6) return null

    const t = planeNormal.dot(planePoint.clone().sub(ray.origin)) / denom
    if (t < 0) return null

    return ray.getPoint(t)
}
function intersectRayAABB(localRay, invWorldMatrix) {
    const meshInstance = modelEntity.gsplat.instance.meshInstance
    const aabbWorld = meshInstance.aabb

    const minWorld = new Vec3(
        aabbWorld.center.x - aabbWorld.halfExtents.x,
        aabbWorld.center.y - aabbWorld.halfExtents.y,
        aabbWorld.center.z - aabbWorld.halfExtents.z,
    )
    const maxWorld = new Vec3(
        aabbWorld.center.x + aabbWorld.halfExtents.x,
        aabbWorld.center.y + aabbWorld.halfExtents.y,
        aabbWorld.center.z + aabbWorld.halfExtents.z,
    )
    const minLocal = new Vec3()
    const maxLocal = new Vec3()
    invWorldMatrix.transformPoint(minWorld, minLocal)
    invWorldMatrix.transformPoint(maxWorld, maxLocal)

    const bMin = new Vec3(
        Math.min(minLocal.x, maxLocal.x),
        Math.min(minLocal.y, maxLocal.y),
        Math.min(minLocal.z, maxLocal.z),
    )
    const bMax = new Vec3(
        Math.max(minLocal.x, maxLocal.x),
        Math.max(minLocal.y, maxLocal.y),
        Math.max(minLocal.z, maxLocal.z),
    )

    const o = localRay.origin
    const d = localRay.direction
    const EPSILON = 1e-8

    let tMin = -Infinity
    let tMax = Infinity

    for (const axis of ['x', 'y', 'z']) {
        if (Math.abs(d[axis]) < EPSILON) {
            if (o[axis] < bMin[axis] || o[axis] > bMax[axis]) return null
        } else {
            const t1 = (bMin[axis] - o[axis]) / d[axis]
            const t2 = (bMax[axis] - o[axis]) / d[axis]
            tMin = Math.max(tMin, Math.min(t1, t2))
            tMax = Math.min(tMax, Math.max(t1, t2))
        }
    }
    if (tMax < 0 || tMin > tMax) return null
    const t = tMin >= 0 ? tMin : tMax
    if (t < 0) return null

    return localRay.getPoint(t)
}
function jacobiEigen3(A) {
    const a = A.map((row) => [...row])
    let v = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
    ]
    const MAX_ITER = 50
    for (let iter = 0; iter < MAX_ITER; iter++) {
        let maxVal = 0,
            p = 0,
            q = 1
        for (let i = 0; i < 3; i++) {
            for (let j = i + 1; j < 3; j++) {
                if (Math.abs(a[i][j]) > maxVal) {
                    maxVal = Math.abs(a[i][j])
                    p = i
                    q = j
                }
            }
        }
        if (maxVal < 1e-10) break
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta) / (Math.abs(theta) + Math.sqrt(1 + theta * theta))
        const c = 1 / Math.sqrt(1 + t * t)
        const s = t * c
        const app = a[p][p],
            aqq = a[q][q],
            apq = a[p][q]
        a[p][p] = app - t * apq
        a[q][q] = aqq + t * apq
        a[p][q] = 0
        a[q][p] = 0

        for (let r = 0; r < 3; r++) {
            if (r !== p && r !== q) {
                const arp = a[r][p],
                    arq = a[r][q]
                a[r][p] = c * arp - s * arq
                a[p][r] = a[r][p]
                a[r][q] = s * arp + c * arq
                a[q][r] = a[r][q]
            }
        }

        for (let r = 0; r < 3; r++) {
            const vrp = v[r][p],
                vrq = v[r][q]
            v[r][p] = c * vrp - s * vrq
            v[r][q] = s * vrp + c * vrq
        }
    }
    const values = [a[0][0], a[1][1], a[2][2]]
    const indices = [0, 1, 2].sort((i, j) => values[i] - values[j])

    return {
        values: indices.map((i) => values[i]),
        vectors: indices.map((i) => [v[0][i], v[1][i], v[2][i]]),
    }
}
function fitPlaneNormal(points) {
    //PCA
    const n = points.length
    if (n < 3) return null

    // centroid
    let cx = 0,
        cy = 0,
        cz = 0
    for (const p of points) {
        cx += p.x
        cy += p.y
        cz += p.z
    }
    cx /= n
    cy /= n
    cz /= n

    let xx = 0,
        xy = 0,
        xz = 0
    let yy = 0,
        yz = 0,
        zz = 0

    for (const p of points) {
        const dx = p.x - cx
        const dy = p.y - cy
        const dz = p.z - cz
        xx += dx * dx
        xy += dx * dy
        xz += dx * dz
        yy += dy * dy
        yz += dy * dz
        zz += dz * dz
    }

    const cov = [
        [xx, xy, xz],
        [xy, yy, yz],
        [xz, yz, zz],
    ]

    const { vectors } = jacobiEigen3(cov)

    const normal = vectors[0]

    const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2)
    if (len < 1e-6) return null

    return new Vec3(normal[0] / len, normal[1] / len, normal[2] / len)
}

function quatFromTo(from, to) {
    const q = new Quat()
    const dot = from.dot(to)
    if (dot >= 1.0 - 1e-6) {
        q.set(0, 0, 0, 1)
        return q
    }

    if (dot <= -1.0 + 1e-6) {
        let perp = new Vec3().cross(from, new Vec3(1, 0, 0))
        if (perp.length() < 0.01) {
            perp = new Vec3().cross(from, new Vec3(0, 0, 1))
        }
        perp.normalize()
        q.setFromAxisAngle(perp, 180)
        return q
    }
    const axis = new Vec3().cross(from, to)
    axis.normalize()
    const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI)
    q.setFromAxisAngle(axis, angle)
    return q
}
function mergeSettings(settings, defaultSettings) {
    if (settings.setupStep === 3 || (settings.model === 'shperical' && setupStep) === 2) {
        return { ...JSON.parse(JSON.stringify(defaultSettings)), ...settings }
    }
    if (settings.pivot?.position) {
        const setupStep = settings.model === 'hemispherical' ? 3 : 2
        return { ...JSON.parse(JSON.stringify(defaultSettings)), ...settings, setupStep }
    }
    if (settings.orientation?.pose) {
        return { ...JSON.parse(JSON.stringify(defaultSettings)), ...settings, setupStep: 2 }
    }
    return { ...JSON.parse(JSON.stringify(defaultSettings)), ...settings }
}
function snapToFitOBB(points, initialRotation, options = {}) {
    const {
        maxIterations = 200,
        learningRate = 0.5,
        minLearningRate = 0.001,
        decay = 0.95,
        convergenceThreshold = 0.0001,
    } = options

    const count = points.length / 3

    function getOBBInfo(rx, ry, rz) {
        const q = new Quat().setFromEulerAngles(rx, ry, rz)
        const axisX = q.transformVector(new Vec3(1, 0, 0))
        const axisY = q.transformVector(new Vec3(0, 1, 0))
        const axisZ = q.transformVector(new Vec3(0, 0, 1))

        let minX = Infinity,
            maxX = -Infinity
        let minY = Infinity,
            maxY = -Infinity
        let minZ = Infinity,
            maxZ = -Infinity

        for (let i = 0; i < count; i++) {
            const px = points[i * 3],
                py = points[i * 3 + 1],
                pz = points[i * 3 + 2]
            const lx = px * axisX.x + py * axisX.y + pz * axisX.z
            const ly = px * axisY.x + py * axisY.y + pz * axisY.z
            const lz = px * axisZ.x + py * axisZ.y + pz * axisZ.z
            if (lx < minX) minX = lx
            if (lx > maxX) maxX = lx
            if (ly < minY) minY = ly
            if (ly > maxY) maxY = ly
            if (lz < minZ) minZ = lz
            if (lz > maxZ) maxZ = lz
        }

        const sx = maxX - minX,
            sy = maxY - minY,
            sz = maxZ - minZ
        const volume = sx * sy * sz

        // Center world space
        const midX = (minX + maxX) / 2
        const midY = (minY + maxY) / 2
        const midZ = (minZ + maxZ) / 2
        const cx = midX * axisX.x + midY * axisY.x + midZ * axisZ.x
        const cy = midX * axisX.y + midY * axisY.y + midZ * axisZ.y
        const cz = midX * axisX.z + midY * axisY.z + midZ * axisZ.z

        return { volume, size: { x: sx, y: sy, z: sz }, position: { x: cx, y: cy, z: cz } }
    }

    let rx = initialRotation.x
    let ry = initialRotation.y
    let rz = initialRotation.z
    let lr = learningRate
    let prevVolume = Infinity

    for (let iter = 0; iter < maxIterations; iter++) {
        const eps = 0.1
        const v0 = getOBBInfo(rx, ry, rz).volume
        const gx = (getOBBInfo(rx + eps, ry, rz).volume - v0) / eps
        const gz = (getOBBInfo(rx, ry, rz + eps).volume - v0) / eps
        const gy = (getOBBInfo(rx, ry + eps, rz).volume - v0) / eps

        rx -= lr * gx
        ry -= lr * gy
        rz -= lr * gz

        lr *= decay

        if (Math.abs(prevVolume - v0) < convergenceThreshold) break
        prevVolume = v0
        if (lr < minLearningRate) break
    }

    const { size, position } = getOBBInfo(rx, ry, rz)
    return {
        rotation: { x: rx, y: ry, z: rz },
        position,
        size,
    }
}
