function makeManualPanel(events) {
    const panel = document.createElement('div')
    panel.style.cssText = 'display:none; flex-direction:column; gap:10px;'

    const hint = document.createElement('p')
    hint.style.cssText = `
    margin: 0 0 4px 0;
    font-size: 13px;
    color: var(--text-main);
`
    hint.textContent =
        'The red line marks the ground. Align the bottom of the model flat on it — spin it around to check every angle. You can drag with left click to rotate, right click to adjust the height, or use the Height and Lean buttons to fine-tune until it looks right.'

    const spinRow = makeRow({ title: 'Auto Spin 360°' })
    const spinRight = document.createElement('div')
    spinRight.style.cssText = 'display:flex; align-items:center; gap:6px;'

    const spinSlowLabel = document.createElement('span')
    spinSlowLabel.style.cssText = 'font-size:10px; color:var(--text-muted);'
    spinSlowLabel.textContent = 'slow'

    const spinSpeedSlider = makeSlider({
        min: 10,
        max: 20,
        step: 1,
        value: 15,
        className: 'pitch-slider',
    })
    spinSpeedSlider.style.cssText = 'width:72px;'

    const spinFastLabel = document.createElement('span')
    spinFastLabel.style.cssText = 'font-size:10px; color:var(--text-muted);'
    spinFastLabel.textContent = 'fast'

    const startSpin = makeButton({
        icon: ICONS.startPlay,
        title: 'Auto Spin 360°',
        className: 'orientation-btn',
        onClick: () => {
            updateSpinState(false)
            events.fire('orientation:spin', { speed: parseFloat(spinSpeedSlider.value) })
        },
    })
    const stopSpin = makeButton({
        icon: ICONS.stopPlay,
        title: 'Auto Spin 360°',
        className: 'orientation-btn hidden',
        onClick: () => {
            updateSpinState(true)
            events.fire('360spin-stop')
        },
    })
    spinRight.appendChild(spinSlowLabel)
    spinRight.appendChild(spinSpeedSlider)
    spinRight.appendChild(spinFastLabel)
    spinRight.appendChild(startSpin)
    spinRight.appendChild(stopSpin)
    spinRow.appendChild(spinRight)
    function updateSpinState(spin) {
        if (spin) {
            startSpin.classList.remove('hidden')
            stopSpin.classList.add('hidden')
        } else {
            stopSpin.classList.remove('hidden')
            startSpin.classList.add('hidden')
        }
    }
    const yawStepInput = makeInput({ type: 'number', value: 5, step: 1, min: 0, className: 'orientation-step-input' })
    const getYawStep = () => parseFloat(yawStepInput.value) || 5
    // ── Yaw row
    const yawRow = makeRow({ title: 'Spin' })
    const yawRight = document.createElement('div')
    yawRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnYawLeft = makeButton({
        icon: ICONS.yawCCW,
        title: 'Spin left',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => {
            events.fire('orientation:yaw-step', { deg: -getYawStep() })
            updateSpinState(true)
        },
    })
    const btnYawRight = makeButton({
        icon: ICONS.yawCW,
        title: 'Spin right',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => {
            events.fire('orientation:yaw-step', { deg: getYawStep() })
            updateSpinState(true)
        },
    })
    yawRight.appendChild(btnYawLeft)
    yawRight.appendChild(yawStepInput)
    yawRight.appendChild(btnYawRight)
    yawRow.appendChild(yawRight)

    // ── Y Position row
    const yPosStepInput = makeInput({ type: 'number', value: 0.5, step: 0.5, min: 0, className: 'orientation-step-input' })
    const getYPosStep = () => parseFloat(yPosStepInput.value) || 0.1

    const yPosRow = makeRow({ title: 'Height' })
    const yPosRight = document.createElement('div')
    yPosRight.style.cssText = 'display:flex; align-items:center; gap:6px;'

    const btnYPosDown = makeButton({
        icon: ICONS.arrowDown,
        title: 'Move down',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => {
            events.fire('orientation:translate-y', { delta: -getYPosStep() })
            updateSpinState(true)
        },
    })
    const btnYPosUp = makeButton({
        icon: ICONS.arrowUp,
        title: 'Move up',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => {
            events.fire('orientation:translate-y', { delta: getYPosStep() })
            updateSpinState(true)
        },
    })

    yPosRight.appendChild(btnYPosDown)
    yPosRight.appendChild(yPosStepInput)
    yPosRight.appendChild(btnYPosUp)
    yPosRow.appendChild(yPosRight)

    // ── Pitch ──
    const pitchStepInput = makeInput({ type: 'number', value: 0.5, step: 0.1, min: 0, className: 'orientation-step-input' })
    const getPitchStep = () => parseFloat(pitchStepInput.value) || 5

    const pitchRow = makeRow({ title: 'Tilt Up / Down' })
    const pitchRight = document.createElement('div')
    pitchRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnPitchUp = makeButton({
        icon: ICONS.arrowUp,
        title: 'Tilt up',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => events.fire('orientation:pitch-step', { deg: -getPitchStep() }),
    })
    const btnPitchDown = makeButton({
        icon: ICONS.arrowDown,
        title: 'Tilt down',
        onHold: true,
        className: 'orientation-btn',
        onClick: () => events.fire('orientation:pitch-step', { deg: getPitchStep() }),
    })
    pitchRight.appendChild(btnPitchDown)
    pitchRight.appendChild(pitchStepInput)
    pitchRight.appendChild(btnPitchUp)
    pitchRow.appendChild(pitchRight)

    // ── Roll ──
    const rollStepInput = makeInput({ type: 'number', value: 0.5, step: 0.1, min: 0, className: 'orientation-step-input' })
    const getRollStep = () => parseFloat(rollStepInput.value) || 0.5

    const rollRow = makeRow({ title: 'Lean Left / Right' })
    const rollRight = document.createElement('div')
    rollRight.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const btnRollCCW = makeButton({
        icon: ICONS.rollCCW,
        title: 'Lean Left',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => {
            events.fire('orientation:roll', { deg: -getRollStep() })
            updateSpinState(true)
        },
    })
    const btnRollCW = makeButton({
        icon: ICONS.rollCW,
        title: 'Lean Right',
        className: 'orientation-btn',
        onHold: true,
        onClick: () => {
            events.fire('orientation:roll', { deg: getRollStep() })
            updateSpinState(true)
        },
    })
    rollRight.appendChild(btnRollCCW)
    rollRight.appendChild(rollStepInput)
    rollRight.appendChild(btnRollCW)
    rollRow.appendChild(rollRight)

    panel.appendChild(hint)
    panel.appendChild(spinRow)
    panel.appendChild(yawRow)
    panel.appendChild(yPosRow)
    panel.appendChild(pitchRow)
    panel.appendChild(rollRow)

    return {
        panel,
    }
}
