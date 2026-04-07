let modelEntity = null
const AUTO_PLAY_LERP_TIME = 1.5
const TRACEID_GPU_TIMINGS = 'GpuTimings'
const hotspotMaxScale = 1.5
const HOTSPOT_FADE_TIME = 0.5
let maxDistance = 200
let minDistance = 11
const version$1 = '2.17.1'
const revision = 'b60756b'
let orterySettings = {
    lockZoomIn: {
        value: minDistance,
        locked: false,
    },
    pivotPos: null,
    initview: {
        pose: null,
    },
    orientation: null,
    backgroundColor: '#ffffff',

}