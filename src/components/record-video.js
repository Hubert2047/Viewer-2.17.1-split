function makeRecordSection(el, global) {
    const { events, app } = global
    const container = makeSectionWrap()
    let fps = 60
    let isRegionVisible = false
    let filename = 'recording'
    let isRecording = false

    const srcCanvas = app.graphicsDevice.canvas

    const getCanvasRect = () => srcCanvas.getBoundingClientRect()

    const DEFAULT_REGION_WIDTH = 1920
    const DEFAULT_REGION_HEIGHT = 1080

    const getFullRegion = () => {
        const rect = getCanvasRect()
        const width = Math.min(DEFAULT_REGION_WIDTH, rect.width)
        const height = Math.min(DEFAULT_REGION_HEIGHT, rect.height)
        const x = (rect.width - width) / 2
        const y = (rect.height - height) / 2
        return { x, y, width, height }
    }

    const clampRegion = (r) => {
        const rect = getCanvasRect()
        const width = Math.min(Math.max(r.width, 0), rect.width)
        const height = Math.min(Math.max(r.height, 0), rect.height)
        const x = Math.min(Math.max(r.x, 0), rect.width - width)
        const y = Math.min(Math.max(r.y, 0), rect.height - height)
        return { x, y, width, height }
    }

    let region = getFullRegion()

    let overlayRoot = null
    let frame = null
    let dimTop = null
    let dimBottom = null
    let dimLeft = null
    let dimRight = null
    let sizeLabel = null
    let dragState = null
    let pattern = 'none'

    let recordTimerInterval = null
    let recordStartTime = 0

    const formatDuration = (ms) => {
        const totalSeconds = Math.floor(ms / 1000)
        const minutes = Math.floor(totalSeconds / 60)
        const seconds = totalSeconds % 60
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    }

    const startRecordTimer = () => {
        recordStartTime = Date.now()
        timerLabel.textContent = '00:00'
        timerLabel.style.display = ''
        recordTimerInterval = setInterval(() => {
            timerLabel.textContent = formatDuration(Date.now() - recordStartTime)
        }, 1000)
    }

    const stopRecordTimer = () => {
        if (recordTimerInterval) {
            clearInterval(recordTimerInterval)
            recordTimerInterval = null
        }
        timerLabel.style.display = 'none'
    }

    const renderOverlay = () => {
        if (!overlayRoot) return
        const rect = getCanvasRect()
        const { x, y, width, height } = region

        frame.style.left = `${x}px`
        frame.style.top = `${y}px`
        frame.style.width = `${width}px`
        frame.style.height = `${height}px`
        sizeLabel.textContent = `${Math.round(width)} × ${Math.round(height)}`

        dimTop.style.left = '0px'
        dimTop.style.top = '0px'
        dimTop.style.width = `${rect.width}px`
        dimTop.style.height = `${y}px`

        dimBottom.style.left = '0px'
        dimBottom.style.top = `${y + height}px`
        dimBottom.style.width = `${rect.width}px`
        dimBottom.style.height = `${rect.height - y - height}px`

        dimLeft.style.left = '0px'
        dimLeft.style.top = `${y}px`
        dimLeft.style.width = `${x}px`
        dimLeft.style.height = `${height}px`

        dimRight.style.left = `${x + width}px`
        dimRight.style.top = `${y}px`
        dimRight.style.width = `${rect.width - x - width}px`
        dimRight.style.height = `${height}px`
    }

    const syncInputsFromRegion = () => {
        widthInputEl.value = Math.round(region.width)
        heightInputEl.value = Math.round(region.height)
    }

    const setRegion = (next, { fromInput } = {}) => {
        region = clampRegion(next)
        renderOverlay()
        if (!fromInput) syncInputsFromRegion()
    }

    const onPointerMove = (e) => {
        if (!dragState) return
        const dx = e.clientX - dragState.startX
        const dy = e.clientY - dragState.startY
        const s = dragState.startRegion
        let next = { ...s }

        if (dragState.dir === 'move') {
            next.x = s.x + dx
            next.y = s.y + dy
        } else {
            if (dragState.dir.includes('e')) next.width = s.width + dx
            if (dragState.dir.includes('s')) next.height = s.height + dy
            if (dragState.dir.includes('w')) {
                next.x = s.x + dx
                next.width = s.width - dx
            }
            if (dragState.dir.includes('n')) {
                next.y = s.y + dy
                next.height = s.height - dy
            }
        }
        setRegion(next)
    }
    const onPointerUp = () => {
        dragState = null
    }
    const onPointerDown = (e, dir) => {
        if (global.recording) {
            showToast('This action is unavailable while recording.', {
                duration: 1500,
                type: 'warning',
            })
            return
        }
        e.preventDefault()
        e.stopPropagation()
        dragState = { dir, startX: e.clientX, startY: e.clientY, startRegion: { ...region } }
    }

    const handleDefs = [
        { dir: 'nw', cursor: 'nwse-resize', top: '0%', left: '0%' },
        { dir: 'n', cursor: 'ns-resize', top: '0%', left: '50%' },
        { dir: 'ne', cursor: 'nesw-resize', top: '0%', left: '100%' },
        { dir: 'e', cursor: 'ew-resize', top: '50%', left: '100%' },
        { dir: 'se', cursor: 'nwse-resize', top: '100%', left: '100%' },
        { dir: 's', cursor: 'ns-resize', top: '100%', left: '50%' },
        { dir: 'sw', cursor: 'nesw-resize', top: '100%', left: '0%' },
        { dir: 'w', cursor: 'ew-resize', top: '50%', left: '0%' },
    ]

    const onWindowResize = () => {
        if (!overlayRoot) return
        const rect = getCanvasRect()
        overlayRoot.style.left = `${rect.left}px`
        overlayRoot.style.top = `${rect.top}px`
        overlayRoot.style.width = `${rect.width}px`
        overlayRoot.style.height = `${rect.height}px`
        region = clampRegion(region)
        renderOverlay()
        syncInputsFromRegion()
    }

    const mountOverlay = () => {
        if (overlayRoot) return
        const rect = getCanvasRect()

        overlayRoot = document.createElement('div')
        overlayRoot.style.cssText = `
            position:fixed; left:${rect.left}px; top:${rect.top}px;
            width:${rect.width}px; height:${rect.height}px;
            overflow:hidden; z-index:1001; pointer-events:none;
            background:transparent;
        `

        const makeDim = () => {
            const d = document.createElement('div')
            d.style.cssText = 'position:absolute; background:rgba(0,0,0,0.45); pointer-events:auto;'
            return d
        }
        dimTop = makeDim()
        dimBottom = makeDim()
        dimLeft = makeDim()
        dimRight = makeDim()

        frame = document.createElement('div')
        frame.style.cssText = `
            position:absolute; border:1px solid var(--primary);
            background:transparent;
            cursor:move; box-sizing:border-box; pointer-events:auto;
        `
        sizeLabel = document.createElement('div')
        sizeLabel.style.cssText = `
            position:absolute; top:4px; left:6px; font-size:0.6875rem;
            color:#fff; background:rgba(0,0,0,0.6);
            padding:1px 6px; border-radius:0.25rem; pointer-events:none;
        `
        frame.appendChild(sizeLabel)

        handleDefs.forEach(({ dir, cursor, top, left }) => {
            const h = document.createElement('div')
            h.style.cssText = `
                position:absolute; width:9px; height:9px; background:var(--primary);
                border-radius:2px; transform:translate(-50%,-50%);
                top:${top}; left:${left}; cursor:${cursor};
            `
            h.addEventListener('pointerdown', (e) => onPointerDown(e, dir))
            frame.appendChild(h)
        })

        frame.addEventListener('pointerdown', (e) => {
            if (e.target === frame || e.target === sizeLabel) onPointerDown(e, 'move')
        })

        overlayRoot.appendChild(dimTop)
        overlayRoot.appendChild(dimBottom)
        overlayRoot.appendChild(dimLeft)
        overlayRoot.appendChild(dimRight)
        overlayRoot.appendChild(frame)
        document.body.appendChild(overlayRoot)

        overlayRoot.style.display = isRegionVisible ? '' : 'none'

        region = clampRegion(region)
        renderOverlay()
        syncInputsFromRegion()

        window.addEventListener('pointermove', onPointerMove)
        window.addEventListener('pointerup', onPointerUp)
        window.addEventListener('resize', onWindowResize)
    }

    const unmountOverlay = () => {
        if (isRecording) cancelRecordingWithoutDownload()
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('resize', onWindowResize)
        dragState = null
        if (overlayRoot) {
            overlayRoot.remove()
            overlayRoot = null
            frame = null
            dimTop = dimBottom = dimLeft = dimRight = null
            sizeLabel = null
        }
    }

    const getActualRegion = () => {
        const rect = getCanvasRect()
        const scaleX = srcCanvas.width / rect.width
        const scaleY = srcCanvas.height / rect.height
        return {
            x: Math.round(region.x * scaleX),
            y: Math.round(region.y * scaleY),
            width: Math.round(region.width * scaleX),
            height: Math.round(region.height * scaleY),
            outputWidth: Math.round(region.width),
            outputHeight: Math.round(region.height),
        }
    }

    const settingsGroup = makeSectionGroup('Settings')

    // const fpsRow = makeRow({ title: 'Frame Rate' })
    // const fpsSegment = makeSegmentRow({
    //     defaultValue: fps,
    //     options: [
    //         { label: '30', value: 30 },
    //         { label: '60', value: 60 },
    //     ],
    //     onChange: (value) => {
    //         fps = value
    //     },
    // })
    // fpsRow.el.appendChild(fpsSegment)

    const showRegionRow = makeRow({ title: 'Show Region' })
    const showRegionToggle = makeToggle({
        initialValue: isRegionVisible,
        onChange: (value) => {
            isRegionVisible = value
            if (overlayRoot) overlayRoot.style.display = isRegionVisible ? '' : 'none'
        },
    })
    showRegionRow.el.appendChild(showRegionToggle)

    const fileNameRow = makeRow({ title: 'File Name', className: 'record-filename' })
    const fileNameInput = makeInput({
        type: 'text',
        value: filename,
        placeholder: 'recording',
        className: 'record-filename-input',
        onChange: (value) => {
            filename = value.trim() || 'recording'
        },
    })
    fileNameRow.el.appendChild(fileNameInput)

    const regionRow = makeRow({ title: 'Region', className: 'record-region' })
    const regionWrap = document.createElement('div')
    regionWrap.style.cssText = 'display:flex; align-items:center; gap:0.25rem;'

    const widthInput = makeInput({
        type: 'number',
        value: Math.round(region.width),
        placeholder: 'W',
        className: 'record-region-input',
        onChange: (value) => {
            const n = parseInt(value, 10)
            const rect = getCanvasRect()
            const maxWidth = Math.round(rect.width)
            const clamped = Number.isFinite(n) ? Math.min(Math.max(n, 1), maxWidth) : 1
            setRegion({ ...region, width: clamped }, { fromInput: true })
            syncInputsFromRegion()
        },
    })

    const separator = document.createElement('span')
    separator.textContent = '×'
    separator.style.cssText = 'color:var(--text-muted); font-size:0.875rem;'

    const heightInput = makeInput({
        type: 'number',
        value: Math.round(region.height),
        placeholder: 'H',
        className: 'record-region-input',
        onChange: (value) => {
            const n = parseInt(value, 10)
            const rect = getCanvasRect()
            const maxHeight = Math.round(rect.height)
            const clamped = Number.isFinite(n) ? Math.min(Math.max(n, 1), maxHeight) : 1
            setRegion({ ...region, height: clamped }, { fromInput: true })
            syncInputsFromRegion()
        },
    })

    regionWrap.appendChild(widthInput)
    regionWrap.appendChild(separator)
    regionWrap.appendChild(heightInput)
    regionRow.el.appendChild(regionWrap)

    const widthInputEl = regionWrap.querySelectorAll('.record-region-input')[0]
    const heightInputEl = regionWrap.querySelectorAll('.record-region-input')[1]
    const patternRow = makeRow({ title: 'Pattern' })
    const patternSelect = makeSelect({
        options: [
            { value: 'none', label: 'None' },
            { value: 'spin', label: 'One Full Spin' },
            { value: 'story', label: 'One Full Story' },
        ],
        value: pattern,
        onChange: (v) => {
            pattern = v
        },
        name: 'record-pattern',
        className: 'record-pattern',
    })
    patternRow.el.appendChild(patternSelect.el)

    settingsGroup.appendChild(fileNameRow.el)
    // settingsGroup.appendChild(fpsRow.el)
    settingsGroup.appendChild(patternRow.el)
    settingsGroup.appendChild(regionRow.el)
    settingsGroup.appendChild(showRegionRow.el)

    const recordGroup = makeSectionGroup('Record')
    const statusBox = document.createElement('div')
    statusBox.style.cssText = `
        display:flex; align-items:center; gap:0.625rem;
        border:0.5px solid var(--border);
        border-radius:0.375rem; padding:0.625rem 0.75rem; margin-bottom:0.5rem;
    `
    const dot = document.createElement('div')
    dot.style.cssText =
        'width:0.625rem;height:0.625rem;border-radius:50%;background:var(--primary);flex-shrink:0;transition:opacity 0.3s;'
    const statusTexts = document.createElement('div')
    const statusTitle = document.createElement('div')
    statusTitle.style.cssText = 'font-size:0.875rem;font-weight:500;color:var(--text-main);'
    statusTitle.textContent = 'Ready'
    const statusSub = document.createElement('div')
    statusSub.style.cssText = 'font-size:0.75rem;color:var(--text-muted);'
    statusSub.textContent = 'Press record to start capturing'
    statusTexts.appendChild(statusTitle)
    statusTexts.appendChild(statusSub)

    const timerLabel = document.createElement('div')
    timerLabel.style.cssText = `
        font-size:0.8125rem; font-weight:600; color:var(--primary);
        font-family:monospace; margin-left:auto; display:none;
    `

    statusBox.appendChild(dot)
    statusBox.appendChild(statusTexts)
    statusBox.appendChild(timerLabel)

    const startBtn = makeButton({
        icon: ICONS.startRecord,
        label: 'Start recording',
        variant: 'full',
        show: true,
        className: 'primary',
        onClick: () => {
            global.dataDirty = true
            events.fire('record-setup', { fps, filename, region: getActualRegion(), pattern })
            startBtn.disabled = true
        },
    })

    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')

    const stopBtn = makeButton({
        icon: ICONS.stopRecord,
        label: 'Stop & Download',
        show: false,
        variant: 'full',
        className: 'confirm-btn',
        onClick: () => events.fire('record-stop'),
    })

    const cancelBtn = makeButton({
        icon: ICONS.cancelRecord,
        label: 'Cancel',
        title: 'Cancel',
        show: false,
        className: 'cancel-btn',
        onClick: () => cancelRecordingWithoutDownload(),
    })

    btnRow.appendChild(cancelBtn)
    btnRow.appendChild(stopBtn)

    recordGroup.appendChild(statusBox)
    recordGroup.appendChild(startBtn)
    recordGroup.appendChild(btnRow)

    container.appendChild(settingsGroup)
    container.appendChild(recordGroup)
    el.appendChild(container)

    function cancelRecordingWithoutDownload() {
        if (!isRecording) return
        events.fire('record-stop', { discard: true })
        isRecording = false
        statusTitle.textContent = 'Ready'
        statusSub.textContent = 'Press record to start capturing'
        stopBtn.setShow(false)
        startBtn.setShow(true)
        stopRecordTimer()
    }

    function setDisableUI(disabled) {
        fileNameInput.disabled = disabled
        widthInput.disabled = disabled
        heightInput.disabled = disabled
        patternSelect.setDisabled(disabled)
        showRegionToggle.setDisabled(disabled)
        fpsSegment.setDisabled(disabled)
    }
    function updatePatternOptions() {
        const hasStory = global.settings.messages?.length > 0
        const hasSpin = global.settings.spin?.enabled

        patternSelect.setOptions([
            { value: 'none', label: 'None' },
            { value: 'spin', label: 'One Full Spin', disabled: !hasSpin },
            { value: 'story', label: 'One Full Story', disabled: !hasStory },
        ])
    }
    const handles = [
        events.on('sidebar:clicked', ({ id, open }) => {
            if (id !== 'record' && global.recordActive) {
                cancelRecordingWithoutDownload()
                unmountOverlay()
                global.recordActive = false
                return
            }
            global.recordActive = id === 'record' && open
            if (global.recordActive) {
                updatePatternOptions()
                mountOverlay()
                events.fire('record-section:active')
            } else unmountOverlay()
        }),
        events.on('record-start', () => {
            setDisableUI(true)
            isRecording = true
            statusTitle.textContent = 'Recording...'
            statusSub.textContent = pattern === 'none' ? 'Press stop when finished' : 'Wait for the recording to finish'
            stopBtn.setShow(true)
            cancelBtn.setShow(true)
            startBtn.setShow(false)
            startRecordTimer()
        }),
        events.on('record-end', () => {
            setDisableUI(false)
            isRecording = false
            statusTitle.textContent = 'Ready'
            statusSub.textContent = 'Press record to start capturing'
            stopBtn.setShow(false)
            cancelBtn.setShow(false)
            startBtn.setShow(true)
            events.fire('show-ui')
            startBtn.disabled = false
            stopRecordTimer()
        }),
    ]
    el.cleanup = () => {
        handles.forEach((h) => events.offByHandle(h))
        cancelRecordingWithoutDownload()
        unmountOverlay()
        global.recordActive = false
    }
}
