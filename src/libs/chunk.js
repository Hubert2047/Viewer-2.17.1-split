function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = src
        s.onload = () => {
            resolve()
            s.remove()
        }
        s.onerror = () => reject(new Error('Error ' + src))
        document.body.appendChild(s)
    })
}
const CHUNK_COUNT = window.sse.settings.chunkCount

async function boot() {
    const spinnerPercent = document.getElementById('spinnerPercent')
    const progressRingFg = document.getElementById('progressRingFg')
    const radius = 86
    const circumference = 2 * Math.PI * radius
    progressRingFg.style.strokeDasharray = `${circumference} ${circumference}`
    const START_PCT = 1
    const CHUNK_MAX_PCT = 65
    const FAKE_CEILING = CHUNK_MAX_PCT - 1
    const FAKE_TICK_MS = 450
    const FAKE_IDLE_MS = 500
    const FAKE_STEP_MIN = 0.2
    const FAKE_STEP_MAX = 0.6
    let displayedPct = START_PCT
    let lastRealUpdate = Date.now()
    const setProgress = (pct) => {
        spinnerPercent.textContent = Math.round(pct) + '%'
        const offset = circumference * (1 - pct / 100)
        progressRingFg.style.strokeDashoffset = offset
    }
    setProgress(displayedPct)
    const fakeTimer = setInterval(() => {
        const idleTime = Date.now() - lastRealUpdate
        if (idleTime > FAKE_IDLE_MS && displayedPct < FAKE_CEILING) {
            const step = FAKE_STEP_MIN + Math.random() * (FAKE_STEP_MAX - FAKE_STEP_MIN)
            displayedPct = Math.min(FAKE_CEILING, displayedPct + step)
            setProgress(displayedPct)
        }
    }, FAKE_TICK_MS)
    window.__orteryChunks = []
    let loaded = 0
    const updateProgress = () => {
        loaded++
        lastRealUpdate = Date.now()
        const realPct = START_PCT + (loaded / CHUNK_COUNT) * (CHUNK_MAX_PCT - START_PCT)
        displayedPct = Math.max(displayedPct, realPct)
        setProgress(displayedPct)
    }
    const tasks = []
    for (let i = 0; i < CHUNK_COUNT; i++) {
        tasks.push(loadScript(`data/data${i}.js`).then(updateProgress))
    }
    await Promise.all(tasks)
    clearInterval(fakeTimer)
    displayedPct = CHUNK_MAX_PCT
    setProgress(displayedPct)

    const base64 = window.__orteryChunks.join('')
    delete window.__orteryChunks
    return base64
}
if (CHUNK_COUNT > 0) window.__orteryBootPromise = boot()
