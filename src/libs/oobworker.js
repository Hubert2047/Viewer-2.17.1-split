const OOBB_WORKER = `
self.onmessage = function({ data }) {
    const { pointsBuffer, orientQuat } = data
    const localPoints = new Float32Array(pointsBuffer)

    const rotation = getDimensionsRotation(localPoints)
    const result = snapToFitOBB(localPoints, rotation)

    self.postMessage({ result, orientQuat })
}

function getDimensionsRotation(localCenters) {
    const count = localCenters.length / 3
    let cx = 0, cz = 0
    for (let i = 0; i < count; i++) { cx += localCenters[i*3]; cz += localCenters[i*3+2] }
    cx /= count; cz /= count
    let cxx=0, cxz=0, czz=0
    for (let i = 0; i < count; i++) {
        const dx = localCenters[i*3]-cx, dz = localCenters[i*3+2]-cz
        cxx += dx*dx; cxz += dx*dz; czz += dz*dz
    }
    cxx/=count; cxz/=count; czz/=count
    let angle = 0.5 * Math.atan2(2*cxz, cxx-czz)
    const cosA = Math.cos(angle), sinA = Math.sin(angle)
    let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity
    for (let i = 0; i < count; i++) {
        const dx = localCenters[i*3]-cx, dz = localCenters[i*3+2]-cz
        const lx = cosA*dx+sinA*dz, lz = -sinA*dx+cosA*dz
        if (lx<minX) minX=lx; if (lx>maxX) maxX=lx
        if (lz<minZ) minZ=lz; if (lz>maxZ) maxZ=lz
    }
    if (maxZ-minZ > maxX-minX) angle += Math.PI/2
    while (angle > Math.PI) angle -= Math.PI*2
    while (angle < -Math.PI) angle += Math.PI*2
    return { x: 0, y: angle*(180/Math.PI), z: 0 }
}

function transformVec(qx,qy,qz,qw, vx,vy,vz) {
    const ix =  qw*vx + qy*vz - qz*vy
    const iy =  qw*vy + qz*vx - qx*vz
    const iz =  qw*vz + qx*vy - qy*vx
    const iw = -qx*vx - qy*vy - qz*vz
    return [
        ix*qw + iw*(-qx) + iy*(-qz) - iz*(-qy),
        iy*qw + iw*(-qy) + iz*(-qx) - ix*(-qz),
        iz*qw + iw*(-qz) + ix*(-qy) - iy*(-qx),
    ]
}

function getOBBInfo(rx, ry, rz, count, points) {
    const toRad = d => d * Math.PI / 180
    const ex=toRad(rx), ey=toRad(ry), ez=toRad(rz)
    const cx=Math.cos(ex/2), sx=Math.sin(ex/2)
    const cy=Math.cos(ey/2), sy=Math.sin(ey/2)
    const cz=Math.cos(ez/2), sz=Math.sin(ez/2)
    const qx=sx*cy*cz+cx*sy*sz, qy=cx*sy*cz-sx*cy*sz
    const qz=cx*cy*sz+sx*sy*cz, qw=cx*cy*cz-sx*sy*sz

    const [ax,ay,az] = transformVec(qx,qy,qz,qw, 1,0,0)
    const [bx,by,bz] = transformVec(qx,qy,qz,qw, 0,1,0)
    const [fx,fy,fz] = transformVec(qx,qy,qz,qw, 0,0,1)

    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity
    for (let i=0; i<count; i++) {
        const px=points[i*3], py=points[i*3+1], pz=points[i*3+2]
        const lx=px*ax+py*ay+pz*az
        const ly=px*bx+py*by+pz*bz
        const lz=px*fx+py*fy+pz*fz
        if(lx<minX)minX=lx; if(lx>maxX)maxX=lx
        if(ly<minY)minY=ly; if(ly>maxY)maxY=ly
        if(lz<minZ)minZ=lz; if(lz>maxZ)maxZ=lz
    }
    const sx2=maxX-minX, sy2=maxY-minY, sz2=maxZ-minZ
    const volume=sx2*sy2*sz2
    const midX=(minX+maxX)/2, midY=(minY+maxY)/2, midZ=(minZ+maxZ)/2
    return {
        volume,
        size: { x:sx2, y:sy2, z:sz2 },
        position: {
            x: midX*ax+midY*bx+midZ*fx,
            y: midX*ay+midY*by+midZ*fy,
            z: midX*az+midY*bz+midZ*fz,
        }
    }
}

function snapToFitOBB(points, initialRotation) {
    const count = points.length / 3
    const rx0=0, rz0=0
    let bestRy=0, bestVol=Infinity

    for (let deg=0; deg<=180; deg+=5) {
        const { volume } = getOBBInfo(rx0, deg, rz0, count, points)
        if (volume < bestVol) { bestVol=volume; bestRy=deg }
    }
    let bestRy2=bestRy, bestVol2=bestVol
    for (let dy=-5; dy<=5; dy+=0.5) {
        const { volume } = getOBBInfo(rx0, bestRy+dy, rz0, count, points)
        if (volume < bestVol2) { bestVol2=volume; bestRy2=bestRy+dy }
    }
    let bestRy3=bestRy2, bestVol3=bestVol2
    for (let dy=-0.5; dy<=0.5; dy+=0.05) {
        const { volume } = getOBBInfo(rx0, bestRy2+dy, rz0, count, points)
        if (volume < bestVol3) { bestVol3=volume; bestRy3=bestRy2+dy }
    }
    const { size, position } = getOBBInfo(rx0, bestRy3, rz0, count, points)
    return { rotation: { x:rx0, y:bestRy3, z:rz0 }, position, size }
}
`

class OOBBWorker {
    constructor({ global }) {
        this.global = global
        const blob = new Blob([OOBB_WORKER], { type: 'application/javascript' })
        this._url = URL.createObjectURL(blob)
        this._worker = new Worker(this._url)
    }

    run(localPoints, orientQuat) {
        return new Promise((resolve) => {
            this._worker.onmessage = ({ data }) => resolve(data)
            const buffer = localPoints.buffer
            this._worker.postMessage(
                {
                    pointsBuffer: buffer,
                    orientQuat: { x: orientQuat.x, y: orientQuat.y, z: orientQuat.z, w: orientQuat.w },
                },
                [buffer],
            )
        })
    }
    _applyResult({ result, orientQuat: oq }) {
        const invOrientQuat = new Quat(oq.x, oq.y, oq.z, oq.w).clone().invert()
        const posInLocal = new Vec3()
        invOrientQuat.transformVector(new Vec3(result.position.x, result.position.y, result.position.z), posInLocal)
        const finalQuat = new Quat().mul2(
            invOrientQuat,
            new Quat().setFromEulerAngles(result.rotation.x, result.rotation.y, result.rotation.z),
        )
        this.global.oobbInfo = { finalQuat, posInLocal, size: result.size }
    }

    async runOOBB() {
        this.global.oobbInfo = null
        const orientPose = settings.orientation.pose
        const orientQuat = orientPose
            ? new Quat(orientPose.rotation.x, orientPose.rotation.y, orientPose.rotation.z, orientPose.rotation.w)
            : new Quat(0, 0, 0, 1)
        const localPoints = await getVisiblePointsAsync({
            modelEntity,
            rotation: orientQuat,
            removedSplats: settings.removedSplats,
        })
        this.global.oobbInfoPromise = this.run(localPoints, orientQuat).then((data) => this._applyResult(data))
    }
    destroy() {
        this._worker.terminate()
        URL.revokeObjectURL(this._url)
    }
}
