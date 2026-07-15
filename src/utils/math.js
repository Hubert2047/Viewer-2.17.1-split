function hasDimensionsData(dimensions) {
    return (
        dimensions &&
        dimensions.size &&
        (dimensions.size.x > 0 || dimensions.size.y > 0 || dimensions.size.z > 0) &&
        dimensions.realSize &&
        (dimensions.realSize.x > 0 || dimensions.realSize.y > 0 || dimensions.realSize.z > 0)
    )
}

function hasCalibrationData(calibration) {
    if (!calibration) return false
    const { distance, points } = calibration
    return distance > 0 && points.length >= 2
}
function handleCapturePicture({ app, captureSize = 960, name = 'picture', format = 'png' }) {
    const device = app.graphicsDevice
    const gl = device.gl
    const canvas = device.canvas
    const originalWidth = canvas.width
    const originalHeight = canvas.height
    const originalAspect = originalWidth / originalHeight

    let renderWidth, renderHeight
    if (originalAspect >= 1) {
        renderWidth = captureSize
        renderHeight = Math.round(captureSize / originalAspect)
    } else {
        renderHeight = captureSize
        renderWidth = Math.round(captureSize * originalAspect)
    }

    device.setResolution(renderWidth, renderHeight)

    app.render()

    const pixels = new Uint8Array(renderWidth * renderHeight * 4)
    gl.readPixels(0, 0, renderWidth, renderHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    const offscreen = document.createElement('canvas')
    offscreen.width = renderWidth
    offscreen.height = renderHeight
    const ctx = offscreen.getContext('2d')
    const imageData = ctx.createImageData(renderWidth, renderHeight)

    for (let y = 0; y < renderHeight; y++) {
        for (let x = 0; x < renderWidth; x++) {
            const src = ((renderHeight - 1 - y) * renderWidth + x) * 4
            const dst = (y * renderWidth + x) * 4
            imageData.data[dst] = pixels[src]
            imageData.data[dst + 1] = pixels[src + 1]
            imageData.data[dst + 2] = pixels[src + 2]
            imageData.data[dst + 3] = pixels[src + 3]
        }
    }
    ctx.putImageData(imageData, 0, 0)

    let dataUrl
    switch (format) {
        case 'jpg':
            dataUrl = offscreen.toDataURL('image/jpeg', 0.95)
            break
        case 'webp':
            dataUrl = offscreen.toDataURL('image/webp', 0.95)
            break
        default:
            dataUrl = offscreen.toDataURL('image/png')
    }

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `${name}.${format}`
    link.click()

    device.setResolution(originalWidth, originalHeight)
    app.render()
}
function calRealSizeFromMeasurement(size) {
    const calib = settings.measurement.calibration
    const p = calib.points
    const dx = p[1].x - p[0].x
    const dy = p[1].y - p[0].y
    const dz = p[1].z - p[0].z
    const modelDist = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (modelDist > 0 && calib.distance > 0) {
        const ratio = calib.distance / modelDist
        const s = size
        const newReal = {
            x: s.x * ratio,
            y: s.y * ratio,
            z: s.z * ratio,
            useMeasurementData: true,
        }
        return { realSize: newReal, unit: calib.unit }
    }
    return { realSize: new Vec3(0, 0, 0), unit: 'cm' }
}

async function ecb(encryptedBase64) {
    try {
        const p1 = 'SU?p!;zJ'
        const p2 = atob('Y0Y2ZFZqYUA=')
        const p3 = ['g%d>Co$c'].join('')
        const p4 = String.fromCharCode(71, 57, 35, 36, 109, 87, 117, 42)
        const encryptedBytes = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0))
        const keyBytes = new TextEncoder().encode(p1 + p2 + p3 + p4)
        const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt'])
        const zeroIV = new Uint8Array(16)
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: zeroIV }, cryptoKey, encryptedBytes)
        return new TextDecoder().decode(decrypted)
    } catch (e) {
        return 0
    }
}

function isWithinTime(utcTimestamp, time = 60) {
    const ts = Number(utcTimestamp)
    if (isNaN(ts)) return false
    const now = Math.floor(Date.now() / 1000)
    return Math.abs(now - ts) <= time
}
function degToRad(d) {
    return (d * Math.PI) / 180
}
function radToDeg(r) {
    return (r * 180) / Math.PI
}
function isSameVec3(v1, v2, precision = 1e-5) {
    return Math.abs(v1.x - v2.x) < precision && Math.abs(v1.y - v2.y) < precision && Math.abs(v1.z - v2.z) < precision
}
function isSameQuat(q1, q2, precision = 1e-5) {
    const dot = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w
    return Math.abs(Math.abs(dot) - 1) < precision
}
function isSameFloat(a, b, eps = 1e-4) {
    return Math.abs(a - b) < eps
}
function localToWorld(pos) {
    const worldMatrix = modelEntity.getWorldTransform()
    const worldPos = new Vec3()
    worldMatrix.transformPoint(pos, worldPos)
    return worldPos
}
function getSpinAxes(r) {
    const quat = new Quat().setFromEulerAngles(r.x, r.y, r.z)
    const lx = quat.transformVector(new Vec3(1, 0, 0))
    const ly = quat.transformVector(new Vec3(0, 1, 0))
    const lz = quat.transformVector(new Vec3(0, 0, 1))
    return {
        x: { x: lx.x, y: lx.y, z: lx.z },
        y: { x: ly.x, y: ly.y, z: ly.z },
        z: { x: lz.x, y: lz.y, z: lz.z },
    }
}
let visiblePoints = null

async function setVisiblePoints(removedSplats) {
    visiblePoints = getVisiblePointsAsync({ modelEntity, removedSplats })
}
function updateVisiblePoints(newVisiblePoints) {
    visiblePoints = newVisiblePoints
}
async function resolveVisiblePoints() {
    if (visiblePoints instanceof Promise) {
        visiblePoints = await visiblePoints
    }
    return visiblePoints
}
async function getUpdateBoxSize(rotation, removedSplats) {
    if (!visiblePoints) {
        await setVisiblePoints(removedSplats)
    }
    await resolveVisiblePoints()
    const result = await getBoxSize(visiblePoints, rotation)
    return result
}

function getVisiblePointsAsync({
    modelEntity,
    removedSplats,
    chunkSize = 150000,
    opacityThreshold = OPACITY_THRESHOLD,
}) {
    return new Promise((resolve) => {
        const gsplatInstance = modelEntity.gsplat.instance.meshInstance.gsplatInstance
        const gsplatData = gsplatInstance.resource.gsplatData
        const count = gsplatData.numSplats

        const p = new Vec3()
        const r = new Quat()
        const s = new Vec3()
        const c = new Vec4()
        const iter = gsplatData.createIter(p, r, s, c)

        const deletedSet = new Set(removedSplats || [])
        const visibleCenters = []
        let i = 0

        function step() {
            const end = Math.min(i + chunkSize, count)
            for (; i < end; i++) {
                if (deletedSet.has(i)) continue
                iter.read(i)
                if (c.w > opacityThreshold) {
                    visibleCenters.push(p.x, p.y, p.z)
                }
            }
            if (i < count) {
                requestAnimationFrame(step)
            } else {
                resolve(new Float32Array(visibleCenters))
            }
        }
        step()
    })
}
function getModelWeight(modelEntity, removedSplats) {
    const gsplatData = modelEntity.gsplat.instance.meshInstance.gsplatInstance.resource.gsplatData
    const count = gsplatData.numSplats
    const p = new Vec3()
    const r = new Quat()
    const s = new Vec3()
    const c = new Vec4()
    const iter = gsplatData.createIter(p, r, s, c)
    const deletedSet = new Set(removedSplats || [])
    let wx = 0,
        wy = 0,
        wz = 0,
        totalWeight = 0
    for (let i = 0; i < count; i++) {
        if (deletedSet.has(i)) continue
        iter.read(i)
        if (c.w > OPACITY_THRESHOLD) {
            wx += p.x * c.w
            wy += p.y * c.w
            wz += p.z * c.w
            totalWeight += c.w
        }
    }

    return new Vec3(wx / totalWeight, wy / totalWeight, wz / totalWeight)
}
function calBbox({ modelEntity, removedSplats, opacityThreshold = OPACITY_THRESHOLD }) {
    const gsplatData = modelEntity.gsplat.instance.meshInstance.gsplatInstance.resource.gsplatData
    const count = gsplatData.numSplats
    const p = new Vec3()
    const r = new Quat()
    const s = new Vec3()
    const c = new Vec4()
    const iter = gsplatData.createIter(p, r, s, c)
    const deletedSet = new Set(removedSplats || [])

    let minX = Infinity,
        minY = Infinity,
        minZ = Infinity
    let maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity

    for (let i = 0; i < count; i++) {
        if (deletedSet.has(i)) continue
        iter.read(i)
        if (c.w > opacityThreshold) {
            minX = Math.min(minX, p.x)
            maxX = Math.max(maxX, p.x)
            minY = Math.min(minY, p.y)
            maxY = Math.max(maxY, p.y)
            minZ = Math.min(minZ, p.z)
            maxZ = Math.max(maxZ, p.z)
        }
    }
    const bbox = {
        center: new Vec3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2),
        halfExtents: new Vec3((maxX - minX) / 2, (maxY - minY) / 2, (maxZ - minZ) / 2),
    }

    return { bbox }
}
function pickModelLocalPoint({ x, y, camera, removedSplats = [], preciseMode = false }) {
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
    const deletedSet = new Set(removedSplats || [])
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
        if (deletedSet.has(i)) continue
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
        if (deletedSet.has(i)) continue
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
    const merged = {
        ...JSON.parse(JSON.stringify(defaultSettings)),
        ...settings,
    }
    if (!['cylindrical', 'spherical', 'hemispherical'].includes(merged.model)) {
        merged.model = 'spherical'
    }
    merged.setupStep = Math.max(Math.min(merged.setupStep, MAX_STEP), MIN_STEP)
    return merged
}
function getOBBInfo(rx, ry, rz, count, points) {
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
    const midX = (minX + maxX) / 2
    const midY = (minY + maxY) / 2
    const midZ = (minZ + maxZ) / 2
    const cx = midX * axisX.x + midY * axisY.x + midZ * axisZ.x
    const cy = midX * axisX.y + midY * axisY.y + midZ * axisZ.y
    const cz = midX * axisX.z + midY * axisY.z + midZ * axisZ.z

    return { volume, size: { x: sx, y: sy, z: sz }, position: { x: cx, y: cy, z: cz } }
}

function getBoxSize(points, initialRotation) {
    const count = points.length / 3
    const { x: rx0, y: ry0, z: rz0 } = initialRotation
    const { size, position } = getOBBInfo(rx0, ry0, rz0, count, points)
    return Promise.resolve({ rotation: initialRotation, position, size })
}
