const dimensionWorldToLocal = (worldPos, rotation) => {
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
const dimensionLocalToWorld = (localPos, rotation) => {
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

    // Compute centroid
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

    // Compute covariance (XZ plane)
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

    // Compute AABB for a given rotation angle
    const computeBounds = (a) => {
        const cosA = Math.cos(a),
            sinA = Math.sin(a)
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
            const lz = -sinA * dx + cosA * dz
            if (lx < minX) minX = lx
            if (lx > maxX) maxX = lx
            if (dy < minY) minY = dy
            if (dy > maxY) maxY = dy
            if (lz < minZ) minZ = lz
            if (lz > maxZ) maxZ = lz
        }
        return { cosA, sinA, minX, maxX, minY, maxY, minZ, maxZ }
    }

    let bounds = computeBounds(angle)

    // If Z extent is larger than X, rotate 90° to align the longer axis with X
    if (bounds.maxZ - bounds.minZ > bounds.maxX - bounds.minX) {
        angle += Math.PI / 2
        bounds = computeBounds(angle)
    }

    while (angle > Math.PI) angle -= Math.PI * 2
    while (angle < -Math.PI) angle += Math.PI * 2

    const { cosA, sinA, minX, maxX, minY, maxY, minZ, maxZ } = bounds
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const midZ = (minZ + maxZ) / 2

    return {
        rotation: { x: 0, y: calRota ? -(angle * (180 / Math.PI)) : 0, z: 0 },
        position: {
            x: cx + cosA * midX - sinA * midZ,
            y: cy + midY,
            z: cz + sinA * midX + cosA * midZ,
        },
        size: {
            x: maxX - minX,
            y: maxY - minY,
            z: maxZ - minZ,
        },
    }
}
function getVisiblePoints(modelEntity) {
    const gsplatInstance = modelEntity.gsplat.instance.meshInstance.gsplatInstance
    const resource = gsplatInstance.resource
    const gsplatData = resource.gsplatData
    const count = gsplatData.numSplats
    const p = new Vec3()
    const r = new Quat()
    const s = new Vec3()
    const c = new Vec4()
    const iter = gsplatData.createIter(p, r, s, c)
    const OPACITY_THRESHOLD = 0.1
    const visibleCenters = []
    for (let i = 0; i < count; i++) {
        iter.read(i)
        if (c.w > OPACITY_THRESHOLD) {
            visibleCenters.push(p.x, p.y, p.z)
        }
    }
    return new Float32Array(visibleCenters)
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

    const OPACITY_THRESHOLD = 0.1
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
function pickModelLocalPoint(x, y, camera) {
    const from = camera.screenToWorld(x, y, camera.nearClip)
    const to = camera.screenToWorld(x, y, camera.farClip)
    const worldRay = new Ray(from, to.clone().sub(from).normalize())

    const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
    const invWorldMatrix = new Mat4().copy(worldMatrix).invert()

    const localRayOrigin = new Vec3()
    invWorldMatrix.transformPoint(worldRay.origin, localRayOrigin)
    const localRayDirection = new Vec3()
    invWorldMatrix.transformVector(worldRay.direction, localRayDirection)
    localRayDirection.normalize()
    const localRay = new Ray(localRayOrigin, localRayDirection)

    const gsplatInstance = modelEntity.gsplat.instance.meshInstance.gsplatInstance
    const gsplatData = gsplatInstance.resource.gsplatData
    const count = gsplatData.numSplats
    const p = new Vec3(),
        r = new Quat(),
        s = new Vec3(),
        c = new Vec4()
    const iter = gsplatData.createIter(p, r, s, c)
    const OPACITY_THRESHOLD = 0.1

    const splatRadii = [0.03, 0.05, 0.1]
    const candidates = new Array(splatRadii.length).fill(null).map(() => ({ dist: Infinity, pos: null }))

    for (let i = 0; i < count; i++) {
        iter.read(i)
        if (c.w <= OPACITY_THRESHOLD) continue

        const localPos = new Vec3(p.x, p.y, p.z)
        const distToSplat = localRay.direction.dot(localPos.clone().sub(localRay.origin))
        if (distToSplat <= 0) continue

        const pointOnRay = localRay.getPoint(distToSplat)
        const dist = pointOnRay.distance(localPos)

        for (let k = 0; k < splatRadii.length; k++) {
            if (dist < splatRadii[k] && distToSplat < candidates[k].dist) {
                candidates[k].dist = distToSplat
                candidates[k].pos = localPos.clone()
            }
        }
    }

    const hit = candidates.find((c) => c.pos !== null)
    if (hit?.pos) {
        const zTarget = hit.pos.z
        const t = (zTarget - localRay.origin.z) / localRay.direction.z
        return localRay.getPoint(t)
    }

    const visiblePoints = []
    const iter2 = gsplatData.createIter(p, r, s, c)
    for (let i = 0; i < count; i++) {
        iter2.read(i)
        if (c.w > OPACITY_THRESHOLD) visiblePoints.push(p.x, p.y, p.z)
    }
    return findFallbackIntersectionPoint(localRay, new Float32Array(visiblePoints), invWorldMatrix)
}

function findFallbackIntersectionPoint(localRay, centers, invWorldMatrix) {
    const nearestPoint = findNearestSplatCenter(localRay, centers)
    if (nearestPoint) return nearestPoint
    const bboxIntersection = intersectBoundingBoxCenterPlane(localRay, invWorldMatrix)
    if (bboxIntersection) return bboxIntersection

    return localRay.getPoint(5.0)
}

function findNearestSplatCenter(localRay, centers) {
    let bestT = null
    let bestDistSq = Infinity

    for (let i = 0; i < centers.length; i += 3) {
        const p = new Vec3(centers[i], centers[i + 1], centers[i + 2])
        const v = p.clone().sub(localRay.origin)
        const t = v.dot(localRay.direction)

        if (t < 0) continue

        const pointOnRay = localRay.getPoint(t)
        const dx = pointOnRay.x - p.x
        const dy = pointOnRay.y - p.y
        const dz = pointOnRay.z - p.z
        const distSq = dx * dx + dy * dy + dz * dz
        if (distSq < bestDistSq) {
            bestDistSq = distSq
            bestT = t
        }
    }
    return bestT !== null ? localRay.getPoint(bestT) : null
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
