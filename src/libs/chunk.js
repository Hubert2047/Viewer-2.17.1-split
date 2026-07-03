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
async function boot() {
    const spinnerPercent = document.getElementById('spinnerPercent')
    const progressRingFg = document.getElementById('progressRingFg')
    const radius = 86
    const circumference = 2 * Math.PI * radius
    progressRingFg.style.strokeDasharray = `${circumference} ${circumference}`
    progressRingFg.style.strokeDashoffset = circumference

    const CHUNK_COUNT = window.sse.settings.chunkCount
    window.__orteryChunks = []
    for (let i = 0; i < CHUNK_COUNT; i++) {
        await loadScript(`data/data${i}.js`)
        const pct = Math.round(((i + 1) / CHUNK_COUNT) * 100)
        spinnerPercent.textContent = pct + '%'
        const offset = circumference * (1 - pct / 100)
        if (pct >= 100) {
            progressRingFg.style.strokeDashoffset = 0
        } else {
            progressRingFg.style.strokeDashoffset = offset
        }
        await new Promise(requestAnimationFrame)
    }
    window.sse.settings.base64 = window.__orteryChunks.join('')
    delete window.__orteryChunks
    await loadScript(window.sse.settings.v ? `./viewer.js?v=${window.sse.settings.v}` : './viewer.js')
}
boot()
