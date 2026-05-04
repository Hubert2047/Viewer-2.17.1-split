function makeGroundPanel(events, global) {
    const panel = document.createElement('div')
    panel.style.cssText = 'display:none; flex-direction:column; gap:8px; min-height:82px;'

    const groundPicker = new GroundPlanePicker(global.app, global.camera)
    let pickingActive = false
    let pickedPoints = []
    const MAX_POINTS = 3

    const hint = document.createElement('div')
    hint.style.cssText = 'font-size:12px; color:var(--text-main); height:28px;'

    const pickRow = makeRow('Set ground plane')
    
    const pickActionRow = document.createElement('div')
    pickActionRow.style.cssText = 'display:flex; gap:6px;'

    const pickBtn = document.createElement('button')
    pickBtn.classList.add('btn', 'pick-ground-btn')
    pickBtn.innerHTML = ICONS.crosshair
    pickBtn.title = 'Pick ground plane'

    const btnCancelGround = document.createElement('button')
    btnCancelGround.classList.add('btn', 'cancel-btn')
    btnCancelGround.style.cssText = 'height:30px; display:none;'
    btnCancelGround.innerHTML = ICONS.x
    btnCancelGround.title = 'Cancel'

    pickActionRow.appendChild(pickBtn)
    pickActionRow.appendChild(btnCancelGround)
    pickRow.appendChild(pickActionRow)
    // const flipRow = document.createElement('div')
    // flipRow.classList.add('section-group-row')

    // const flipLabel = document.createElement('span')
    // flipLabel.textContent = 'Flip Model'

    // const flipActions = document.createElement('div')
    // flipActions.style.cssText = 'display:flex; gap:4px; flex-shrink:0;'

    // const flipBtn = makeIconBtn(ICONS.flipMirror, 'Flip up')
    // flipActions.appendChild(flipBtn)
    // flipBtn.onclick = () => events.fire('orientation:flip-model')
    // flipRow.appendChild(flipLabel)
    // flipRow.appendChild(flipActions)

    const pointInputsWrap = document.createElement('div')
    pointInputsWrap.style.cssText = 'display:none; flex-direction:column; gap:4px; margin-top:4px;'
    const pointInputRows = [1, 2, 3].map((n) => {
        const { row, setValues } = makeVec3Inputs({
            title: `Point ${n}`,
            disabled: false,
            onChange: ({ x, y, z }) => {
                const idx = n - 1
                if (pickedPoints[idx]) {
                    pickedPoints[idx] = { x, y, z }
                    groundPicker._points[idx] = new Vec3(x, y, z)
                    groundPicker._redraw()
                }
            },
        })
        return { row, setValues }
    })
    pointInputRows.forEach(({ row }) => pointInputsWrap.appendChild(row))

    const syncPointInputs = () => {
        pointInputRows.forEach(({ row, setValues }, i) => {
            if (pickingActive && i < pickedPoints.length) {
                setValues({ x: pickedPoints[i].x, y: pickedPoints[i].y, z: pickedPoints[i].z })
                row.style.display = 'flex'
            } else {
                row.style.display = 'none'
            }
        })
        pointInputsWrap.style.display = pickingActive && pickedPoints.length > 0 ? 'flex' : 'none'
    }

    const updatePickState = () => {
        if (!pickingActive) {
            pickBtn.style.display = 'flex'
            document.body.style.cursor = 'default'
            btnCancelGround.style.display = 'none'
        } else if (pickedPoints.length < MAX_POINTS) {
            document.body.style.cursor = 'crosshair'
            pickBtn.style.display = 'none'
            btnCancelGround.style.display = 'flex'
        } else {
            document.body.style.cursor = 'default'
            pickBtn.style.display = 'none'
            btnCancelGround.style.display = 'flex'
        }
        syncPointInputs()
    }

    const updateHintText = () => {
        const remaining = MAX_POINTS - pickedPoints.length
        hint.innerHTML =
            remaining > 0
                ? `Click <span class="highlight">${remaining}</span> point${remaining > 1 ? 's' : ''} on the <span class="highlight">ground surface</span> to auto-align the model.`
                : `Click <span class="highlight">Apply</span> to auto-align the model, or click <span class="highlight cancel">✕</span> to cancel.`
    }

    const stopPicking = () => {
        pickingActive = false
        pickedPoints = []
        groundPicker.disable()
        groundPicker.reset()
        updatePickState()
        updateHintText()
    }

    pickBtn.onclick = () => {
        pickedPoints = []
        pickingActive = true
        groundPicker.enable()
        groundPicker.reset()
        updatePickState()
    }
    btnCancelGround.onclick = () => stopPicking()

    const canvas = global.app.graphicsDevice.canvas
    canvas.addEventListener('pointerdown', (e) => {
        if (!pickingActive || e.button !== 0 || pickedPoints.length >= MAX_POINTS) return
        const localPoint = pickModelLocalPoint(e.offsetX, e.offsetY, global.camera.camera, true)
        if (!localPoint) {
            showToast('Please try again!', { duration: 1000, type: 'warning' })
            return
        }
        groundPicker.handleClick(localPoint, e.offsetX, e.offsetY)
        pickedPoints = groundPicker.getLocalPoints().map((p) => ({ x: p.x, y: p.y, z: p.z }))
        updateHintText()
        updatePickState()
    })

    panel.appendChild(hint)
    panel.appendChild(pickRow)
    panel.appendChild(pointInputsWrap)
    // panel.appendChild(flipRow)

    updateHintText()

    return {
        panel,
        stopPicking,
        getPoints: () => pickedPoints,
        MAX_POINTS,
    }
}
