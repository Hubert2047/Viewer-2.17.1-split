function renderManualPanel(events) {
    const panel = document.createElement('div')
    panel.style.cssText = 'display:none; flex-direction:column; gap:10px;'

    const inputStyle = [
        'width:56px',
        'height:28px',
        'padding:0 6px',
        'border-radius:5px',
        'border:0.5px solid rgba(0,0,0,0.13)',
        'color:var(--text-main)',
        'font-size:12px',
        'text-align:center',
        'outline:none',
        'font-family:inherit',
    ].join(';')

    const makeSectionLabel = (text) => {
        const el = document.createElement('div')
        el.style.cssText =
            'font-size:12px; font-weight:600; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; padding-top:2px;'
        el.textContent = text
        return el
    }
    // ── Horizon line overlay ──
    const horizonOverlay = document.createElement('div')
    horizonOverlay.style.cssText =
        'position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:999; display:none;'
    const horizonSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    horizonSVG.setAttribute('width', '100%')
    horizonSVG.setAttribute('height', '100%')
    const horizonLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    horizonLine.setAttribute('x1', '0')
    horizonLine.setAttribute('x2', '100%')
    horizonLine.setAttribute('stroke', 'var(--primary)')
    horizonLine.setAttribute('stroke-width', '1.5')
    horizonLine.setAttribute('stroke-dasharray', '8 6')
    horizonSVG.appendChild(horizonLine)
    horizonOverlay.appendChild(horizonSVG)
    document.body.appendChild(horizonOverlay)

    let horizonActive = true
    const setHorizonVisible = (visible) => {
        horizonActive = visible
        horizonOverlay.style.display = visible ? 'block' : 'none'
    }
    events.on('orientation:update-horizon', ({ y }) => {
        if (y === null) return
        horizonLine.setAttribute('y1', y)
        horizonLine.setAttribute('y2', y)
        showHorizon(true)
    })
    const makeStepInput = (defaultVal = 5, step = 1, min =0) => {
        const input = document.createElement('input')
        input.type = 'number'
        input.min = min
        input.max = '90'
        input.step = step
        input.value = defaultVal
        input.style.cssText = inputStyle
        return input
    }
    // ─────────────────────────────────────────
    // SECTION 1: SPIN PREVIEW
    // ─────────────────────────────────────────

    const spinRow = makeRow('Spin 360°')
    const spinRight = document.createElement('div')
    spinRight.style.cssText = 'display:flex; align-items:center; gap:6px;'

    const spinSlowLabel = document.createElement('span')
    spinSlowLabel.style.cssText = 'font-size:10px; color:var(--text-muted);'
    spinSlowLabel.textContent = 'slow'

    const spinSpeedSlider = document.createElement('input')
    spinSpeedSlider.type = 'range'
    spinSpeedSlider.min = '1'
    spinSpeedSlider.max = '15'
    spinSpeedSlider.step = '1'
    spinSpeedSlider.value = '8'
    spinSpeedSlider.classList.add('pitch-slider')
    spinSpeedSlider.style.cssText = 'width:72px;'

    const spinFastLabel = document.createElement('span')
    spinFastLabel.style.cssText = 'font-size:10px; color:var(--text-muted);'
    spinFastLabel.textContent = 'fast'

    const btnSpin = makeIconBtn(ORIENT_ICONS.spin, 'Spin 360°')
    btnSpin.onclick = () => events.fire('orientation:spin', { speed: parseFloat(spinSpeedSlider.value) || 5 })
    spinRight.appendChild(spinSlowLabel)
    spinRight.appendChild(spinSpeedSlider)
    spinRight.appendChild(spinFastLabel)
    spinRight.appendChild(btnSpin)
    spinRow.appendChild(spinRight)

    const yawStepInput = makeStepInput(5)
    const getYawStep = () => parseFloat(yawStepInput.value) || 5
    // ── Yaw row
    const yawRow = makeRow('Yaw')
    const yawRight = document.createElement('div')
    yawRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnYawLeft = makeIconBtn(ORIENT_ICONS.yawCCW, 'Yaw left')
    const btnYawRight = makeIconBtn(ORIENT_ICONS.yawCW, 'Yaw right')
    btnYawLeft.onclick = () => events.fire('orientation:yaw-step', { deg: -getYawStep() })
    btnYawRight.onclick = () => events.fire('orientation:yaw-step', { deg: getYawStep() })
    yawRight.appendChild(yawStepInput)
    yawRight.appendChild(btnYawLeft)
    yawRight.appendChild(btnYawRight)
    yawRow.appendChild(yawRight)

    // ─────────────────────────────────────────
    // SECTION 2: ADJUST
    // ─────────────────────────────────────────

    // ── Pitch ──
    const pitchStepInput = makeStepInput(5)
    const getPitchStep = () => parseFloat(pitchStepInput.value) || 5

    const pitchRow = makeRow('Pitch')
    const pitchRight = document.createElement('div')
    pitchRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnPitchUp = makeIconBtn(ORIENT_ICONS.arrowUp, 'Pitch up')
    const btnPitchDown = makeIconBtn(ORIENT_ICONS.arrowDown, 'Pitch down')
    btnPitchUp.onclick = () => events.fire('orientation:pitch-step', { deg: -getPitchStep() })
    btnPitchDown.onclick = () => events.fire('orientation:pitch-step', { deg: getPitchStep() })
    pitchRight.appendChild(pitchStepInput)
    pitchRight.appendChild(btnPitchUp)
    pitchRight.appendChild(btnPitchDown)
    pitchRow.appendChild(pitchRight)

    // ── Roll ──
    const rollStepInput = makeStepInput(1)
    const getRollStep = () => parseFloat(rollStepInput.value) || 0.5

    const rollRow = makeRow('Roll')
    const rollRight = document.createElement('div')
    rollRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnRollCCW = makeIconBtn(ORIENT_ICONS.rollCCW, 'Roll counter-clockwise')
    const btnRollCW = makeIconBtn(ORIENT_ICONS.rollCW, 'Roll clockwise')
    btnRollCCW.onclick = () => events.fire('orientation:roll', { deg: -getRollStep() })
    btnRollCW.onclick = () => events.fire('orientation:roll', { deg: getRollStep() })
    rollRight.appendChild(rollStepInput)
    rollRight.appendChild(btnRollCCW)
    rollRight.appendChild(btnRollCW)
    rollRow.appendChild(rollRight)

    // ─────────────────────────────────────────
    // SECTION 3: HORIZON LINE
    // ─────────────────────────────────────────

    const horizonRow = makeRow('Show')
    const horizonToggle = document.createElement('div')
    horizonToggle.classList.add('toggle')
    const horizonKnob = document.createElement('div')
    horizonKnob.classList.add('toggle-knob')
    horizonToggle.appendChild(horizonKnob)
    horizonToggle.addEventListener('click', () => {
        horizonToggle.classList.toggle('active', !horizonActive)
        setHorizonVisible(!horizonActive)
    })
    horizonRow.appendChild(horizonToggle)

    // ─────────────────────────────────────────
    // ASSEMBLE
    // ─────────────────────────────────────────
    function showHorizon(show) {
        if (!show) horizonToggle.classList.remove('active')
        else horizonToggle.classList.add('active')
        setHorizonVisible(show)
    }
    panel.appendChild(makeDivider())
    panel.appendChild(makeSectionLabel('Spin preview'))
    panel.appendChild(spinRow)
    panel.appendChild(yawRow)

    panel.appendChild(makeDivider())

    panel.appendChild(makeSectionLabel('Adjust'))
    panel.appendChild(pitchRow)
    panel.appendChild(rollRow)

    panel.appendChild(makeDivider())

    panel.appendChild(makeSectionLabel('Horizon line'))
    panel.appendChild(horizonRow)
    panel.appendChild(makeDivider())

    return {
        panel,
        showHorizon,
    }
}
