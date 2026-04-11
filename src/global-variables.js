const version$1 = '2.17.1'
const TRACEID_GPU_TIMINGS = 'GpuTimings'
const AUTO_PLAY_LERP_TIME = 1.5
const HOTSPOT_FADE_TIME = 0.5
const revision = 'b60756b'
let modelEntity = null
const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
const LARGE_AUDIO_THRESHOLD_MB  = 2