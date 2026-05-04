function makeManualPanel(events) {
    const panel = document.createElement('div')
    panel.style.cssText = 'display:none; flex-direction:column; gap:10px;'

    const makeSectionLabel = (text) => {
        const el = document.createElement('div')
        el.style.cssText =
            'font-size:12px; font-weight:600; color:var(--primary); text-transform:uppercase; letter-spacing:0.05em; padding-top:2px;'
        el.textContent = text
        return el
    }
    // ── Horizon line overlay ──
    let horizonOverlay = document.getElementById('horizon-overlay')
    let horizonLine = document.getElementById('horizon-line')
    if (!horizonOverlay && !horizonLine) {
        horizonOverlay = document.createElement('div')
        horizonOverlay.id = 'horizon-overlay'
        horizonOverlay.style.cssText =
            'position:fixed; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:999; display:none;'
        const horizonSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        horizonSVG.setAttribute('width', '100%')
        horizonSVG.setAttribute('height', '100%')
        horizonLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        horizonLine.id = 'horizon-line'
        horizonLine.setAttribute('x1', '0')
        horizonLine.setAttribute('x2', '100%')
        horizonLine.setAttribute('stroke', 'var(--primary)')
        horizonLine.setAttribute('stroke-width', '1.5')
        horizonLine.setAttribute('stroke-dasharray', '8 6')
        horizonSVG.appendChild(horizonLine)
        horizonOverlay.appendChild(horizonSVG)
        document.body.appendChild(horizonOverlay)
    }

    let horizonActive = false
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
    // ─────────────────────────────────────────
    // SECTION 1: SPIN PREVIEW
    // ─────────────────────────────────────────

    const spinRow = makeRow('Spin 360°')
    const spinRight = document.createElement('div')
    spinRight.style.cssText = 'display:flex; align-items:center; gap:6px;'

    const spinSlowLabel = document.createElement('span')
    spinSlowLabel.style.cssText = 'font-size:10px; color:var(--text-muted);'
    spinSlowLabel.textContent = 'slow'

    const spinSpeedSlider = makeSlider({
        min: 4,
        max: 15,
        step: 1,
        value: 9,
        className: 'pitch-slider',
    })
    spinSpeedSlider.style.cssText = 'width:72px;'

    const spinFastLabel = document.createElement('span')
    spinFastLabel.style.cssText = 'font-size:10px; color:var(--text-muted);'
    spinFastLabel.textContent = 'fast'

    const btnSpin = makeButton({
        icon: ICONS.spin,
        title: 'Spin 360°',
        className: 'orientation-btn',
        onClick: () => events.fire('orientation:spin', { speed: parseFloat(spinSpeedSlider.value) || 5 }),
    })
    spinRight.appendChild(spinSlowLabel)
    spinRight.appendChild(spinSpeedSlider)
    spinRight.appendChild(spinFastLabel)
    spinRight.appendChild(btnSpin)
    spinRow.appendChild(spinRight)

    const yawStepInput = makeInput('number', 5, { step: 1, min: 0, className: 'orientation-step-input' })
    const getYawStep = () => parseFloat(yawStepInput.value) || 5
    // ── Yaw row
    const yawRow = makeRow('Yaw')
    const yawRight = document.createElement('div')
    yawRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnYawLeft = makeButton({
        icon: ICONS.yawCCW,
        title: 'Yaw left',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => events.fire('orientation:yaw-step', { deg: -getYawStep() }),
    })
    const btnYawRight = makeButton({
        icon: ICONS.yawCW,
        title: 'Yaw right',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => events.fire('orientation:yaw-step', { deg: getYawStep() }),
    })
    yawRight.appendChild(yawStepInput)
    yawRight.appendChild(btnYawLeft)
    yawRight.appendChild(btnYawRight)
    yawRow.appendChild(yawRight)

    // ─────────────────────────────────────────
    // SECTION 2: ADJUST
    // ─────────────────────────────────────────

    // ── Pitch ──
    const pitchStepInput = makeInput('number', 5, { step: 1, min: 0, className: 'orientation-step-input' })
    const getPitchStep = () => parseFloat(pitchStepInput.value) || 5

    const pitchRow = makeRow('Pitch')
    const pitchRight = document.createElement('div')
    pitchRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnPitchUp = makeButton({
        icon: ICONS.arrowUp,
        title: 'Pitch up',
        className: 'orientation-btn',
        onClick: () => events.fire('orientation:pitch-step', { deg: -getPitchStep() }),
    })
    const btnPitchDown = makeButton({
        icon: ICONS.arrowDown,
        title: 'Pitch down',
        className: 'orientation-btn',
        onClick: () => events.fire('orientation:pitch-step', { deg: getPitchStep() }),
    })
    pitchRight.appendChild(pitchStepInput)
    pitchRight.appendChild(btnPitchUp)
    pitchRight.appendChild(btnPitchDown)
    pitchRow.appendChild(pitchRight)

    // ── Roll ──
    const rollStepInput = makeInput('number', 1, { step: 0.1, min: 0, className: 'orientation-step-input' })
    const getRollStep = () => parseFloat(rollStepInput.value) || 0.5

    const rollRow = makeRow('Roll')
    const rollRight = document.createElement('div')
    rollRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnRollCCW = makeButton({
        icon: ICONS.rollCCW,
        title: 'Roll counter-clockwise',
        className: 'orientation-btn',
        onClick: () => events.fire('orientation:roll', { deg: -getRollStep() }),
    })
    const btnRollCW = makeButton({
        icon: ICONS.rollCW,
        title: 'Roll clockwise',
        className: 'orientation-btn',
        onClick: () => events.fire('orientation:roll', { deg: getRollStep() }),
    })
    rollRight.appendChild(rollStepInput)
    rollRight.appendChild(btnRollCCW)
    rollRight.appendChild(btnRollCW)
    rollRow.appendChild(rollRight)

    // ─────────────────────────────────────────
    // SECTION 3: HORIZON LINE
    // ─────────────────────────────────────────

    const horizonRow = makeRow('Show')
    const horizonToggle = makeToggle(horizonActive, (value) => {
        horizonToggle.classList.toggle('active', !horizonActive)
        setHorizonVisible(!horizonActive)
    })
    horizonRow.appendChild(horizonToggle)

    // ─────────────────────────────────────────
    // ASSEMBLE
    // ─────────────────────────────────────────
    function showHorizon(show) {
        horizonToggle.setValue(show)
        if (!show) horizonToggle.classList.remove('active')
        else horizonToggle.classList.add('active')
        setHorizonVisible(show)
    }
    // panel.appendChild(makeDivider())
    panel.appendChild(makeSectionLabel('Spin preview'))
    panel.appendChild(spinRow)
    panel.appendChild(yawRow)

    // panel.appendChild(makeDivider())

    panel.appendChild(makeSectionLabel('Adjust'))
    panel.appendChild(pitchRow)
    panel.appendChild(rollRow)

    // panel.appendChild(makeDivider())

    panel.appendChild(makeSectionLabel('Horizon line'))
    panel.appendChild(horizonRow)
    // panel.appendChild(makeDivider())

    return {
        panel,
        showHorizon,
    }
}
