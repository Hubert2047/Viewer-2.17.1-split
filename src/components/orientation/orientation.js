function renderOrientation(group, global, editGroup) {
    const { events, settings } = global
    editGroup.register('orientation', { cancel: () => onCancelOrientation() })

    events.on('hotspot:active', () => onCancelOrientation())
    events.on('sidebar:clicked', () => onCancelOrientation())

    let isEditing = false
    let currentMethod = 'manual'

    const container = document.createElement('div')
    container.classList.add('orientation-btn-wrap')

    // ── Readonly rotation row ──
    const { row: readonlyRotationRow, setValues: setReadonlyValues } = createVec3Inputs({
        title: 'Rotation',
        editable: false,
        onChange: () => {},
    })

    const syncValues = (val) => setReadonlyValues(val)

    events.on('modelEntity:loaded', () => {
        if (settings.orientation.pose) {
            const { rotation: r } = settings.orientation.pose
            syncValues(new Quat(r.x, r.y, r.z, r.w).getEulerAngles())
        } else {
            syncValues(modelEntity.getLocalEulerAngles(new Vec3()))
        }
    })
    events.on('orientation:aligned-model', ({ x, y, z }) => syncValues({ x, y, z }))
    events.on('ortery:rotate', () => {
        if (!isEditing) return
        syncValues(modelEntity.getLocalEulerAngles(new Vec3()))
    })

    // ── Sub-panels ──
    const { panel: manualPanel, showHorizon } = renderManualPanel(events)
    const { panel: groundPanel, stopPicking, getPoints, MAX_POINTS } = renderGroundPanel(events, global)

    // ── Method wrap ──
    const methodWrap = document.createElement('div')
    methodWrap.style.cssText = 'display:none; flex-direction:column; gap:12px;'

    const methodRow = document.createElement('div')
    methodRow.classList.add('section-group-row')
    const methodLabel = document.createElement('span')
    methodLabel.textContent = 'Method'
    const methodBtns = document.createElement('div')
    methodBtns.classList.add('hotspot-style-row')
    methodBtns.style.cssText = 'width:170px; flex-shrink:0;'
    const btnManual = document.createElement('div')
    btnManual.classList.add('hotspot-style-btn')
    btnManual.textContent = 'Manual'
    const btnGround = document.createElement('div')
    btnGround.classList.add('hotspot-style-btn')
    btnGround.textContent = 'Ground plane'
    methodBtns.appendChild(btnManual)
    methodBtns.appendChild(btnGround)
    methodRow.appendChild(methodLabel)
    methodRow.appendChild(methodBtns)

    const switchMethod = (method) => {
        currentMethod = method
        btnManual.classList.toggle('active', method === 'manual')
        btnGround.classList.toggle('active', method === 'ground')
        manualPanel.style.display = method === 'manual' ? 'flex' : 'none'
        groundPanel.style.display = method === 'ground' ? 'flex' : 'none'
        if (method === 'manual') {
            stopPicking()
        }
        if (method === 'ground') showHorizon(false)
        events.fire('orientation:switch-method', currentMethod)
    }

    btnManual.onclick = () => switchMethod('manual')
    btnGround.onclick = () => switchMethod('ground')

    methodWrap.appendChild(methodRow)
    methodWrap.appendChild(manualPanel)
    methodWrap.appendChild(groundPanel)

    // ── Orientation btn row ──
    const orientBtnRow = document.createElement('div')
    orientBtnRow.classList.add('btn-row')

    const onCancelOrientation = () => {
        if (!isEditing) return
        isEditing = false
        stopPicking()
        showHorizon(false)
        methodWrap.style.display = 'none'
        if (settings.orientation.pose) {
            const { rotation: r } = settings.orientation.pose
            syncValues(new Quat(r.x, r.y, r.z, r.w).getEulerAngles())
        } else {
            syncValues(modelEntity.getLocalEulerAngles(new Vec3()))
        }
        renderOrientBtns()
        events.fire('orientation:cancel')
    }

    const renderOrientBtns = () => {
        orientBtnRow.innerHTML = ''
        if (isEditing) {
            readonlyRotationRow.style.display = 'none'
            methodWrap.style.display = 'flex'

            const btnCancel = document.createElement('button')
            btnCancel.classList.add('btn', 'cancel-btn')
            btnCancel.textContent = 'Cancel'
            btnCancel.onclick = () => onCancelOrientation()

            const btnSave = document.createElement('button')
            btnSave.classList.add('btn', 'confirm-btn')
            btnSave.textContent = 'Apply'
            btnSave.onclick = () => {
                if (currentMethod === 'ground') {
                    const pts = getPoints()
                    if (pts.length < MAX_POINTS) {
                        showToast('Not enough points selected!', { duration: 1000, type: 'warning' })
                        return
                    }
                    stopPicking()
                    events.fire('orientation:groundplane', pts)
                } else {
                    events.fire('orientation:manual-apply')
                    showHorizon(false)
                }
                isEditing = false
                methodWrap.style.display = 'none'
                renderOrientBtns()
            }

            orientBtnRow.appendChild(btnCancel)
            orientBtnRow.appendChild(btnSave)
        } else {
            readonlyRotationRow.style.display = 'flex'
            methodWrap.style.display = 'none'

            const btnEdit = document.createElement('button')
            btnEdit.classList.add('btn', 'orientation-btn')
            btnEdit.textContent = 'Edit'
            btnEdit.onclick = () => {
                editGroup.startEdit('orientation')
                isEditing = true
                switchMethod(currentMethod)
                events.fire('orientation:edit', currentMethod)
                renderOrientBtns()
            }
            orientBtnRow.appendChild(btnEdit)
        }
    }

    // ── Camera limits (pitch offset) ──
    const PITCH_MIN_DEG = -90
    const PITCH_MAX_DEG = 90
    let isEditingPitch = false
    let pitchDraftDeg = 0
    const clampPitch = (v) => Math.max(PITCH_MIN_DEG, Math.min(PITCH_MAX_DEG, v))

    const cameraLimitsGroup = document.createElement('div')
    cameraLimitsGroup.classList.add('section-group')
    const cameraLimitsTitle = document.createElement('div')
    cameraLimitsTitle.classList.add('section-group-title')
    cameraLimitsTitle.textContent = 'Camera'
    cameraLimitsGroup.appendChild(cameraLimitsTitle)

    const pitchReadonlyRow = document.createElement('div')
    pitchReadonlyRow.classList.add('section-group-row')
    const pitchReadonlyLabel = document.createElement('span')
    pitchReadonlyLabel.textContent = 'Pitch offset'
    const pitchReadonlyRight = document.createElement('div')
    pitchReadonlyRight.style.cssText = 'display:flex; align-items:center; gap:4px;'
    const pitchReadonlyVal = document.createElement('div')
    pitchReadonlyVal.style.cssText = [
        'width:56px',
        'height:28px',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'background:rgba(0,0,0,0.04)',
        'border:0.5px solid rgba(0,0,0,0.1)',
        'border-radius:5px',
        'font-size:12px',
        'color:rgba(0,0,0,0.3)',
    ].join(';')
    pitchReadonlyRight.appendChild(pitchReadonlyVal)
    pitchReadonlyRow.appendChild(pitchReadonlyLabel)
    pitchReadonlyRow.appendChild(pitchReadonlyRight)

    const pitchEditWrap = document.createElement('div')
    pitchEditWrap.style.cssText = 'display:none; flex-direction:column; gap:8px;'

    const pitchInputRow = document.createElement('div')
    pitchInputRow.classList.add('section-group-row')
    const pitchInputLabel = document.createElement('span')
    pitchInputLabel.textContent = 'Pitch offset'
    const pitchInputRight = document.createElement('div')
    pitchInputRight.style.cssText = 'display:flex; align-items:center; gap:4px;'
    const pitchInput = document.createElement('input')
    pitchInput.type = 'number'
    pitchInput.min = PITCH_MIN_DEG
    pitchInput.max = PITCH_MAX_DEG
    pitchInput.step = '1'
    pitchInput.style.cssText = [
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
    pitchInputRight.appendChild(pitchInput)
    pitchInputRow.appendChild(pitchInputLabel)
    pitchInputRow.appendChild(pitchInputRight)

    const pitchSliderRow = document.createElement('div')
    pitchSliderRow.style.cssText = 'display:flex; align-items:center; gap:6px;'
    const pitchSliderMin = document.createElement('span')
    pitchSliderMin.style.cssText = 'font-size:10px; color:var(--text-muted); min-width:24px;'
    pitchSliderMin.textContent = '-90°'
    const pitchSlider = document.createElement('input')
    pitchSlider.type = 'range'
    pitchSlider.min = PITCH_MIN_DEG
    pitchSlider.max = PITCH_MAX_DEG
    pitchSlider.step = '1'
    pitchSlider.classList.add('pitch-slider')
    pitchSlider.style.cssText = 'flex:1;'
    const pitchSliderMax = document.createElement('span')
    pitchSliderMax.style.cssText = 'font-size:10px; color:var(--text-muted); min-width:24px; text-align:right;'
    pitchSliderMax.textContent = '90°'
    pitchSliderRow.appendChild(pitchSliderMin)
    pitchSliderRow.appendChild(pitchSlider)
    pitchSliderRow.appendChild(pitchSliderMax)

    const setPitchDraft = (deg) => {
        pitchDraftDeg = clampPitch(deg)
        const rounded = Math.round(pitchDraftDeg)
        pitchInput.value = rounded
        pitchSlider.value = rounded
        events.fire('orientation:pitchoffset', { value: degToRad(pitchDraftDeg) })
    }
    pitchInput.addEventListener('input', () => setPitchDraft(parseFloat(pitchInput.value) || 0))
    pitchSlider.addEventListener('input', () => setPitchDraft(parseFloat(pitchSlider.value)))

    pitchEditWrap.appendChild(pitchInputRow)
    pitchEditWrap.appendChild(pitchSliderRow)

    const pitchBtnRow = document.createElement('div')
    pitchBtnRow.classList.add('btn-row')

    const syncPitchReadonly = () => {
        pitchReadonlyVal.textContent = Math.round(radToDeg(settings.orientation.pitchOffset ?? 0)) + ''
    }

    const onCancelPitch = () => {
        if (!isEditingPitch) return
        isEditingPitch = false
        events.fire('orientation:cancel-pitchoffset')
        syncPitchReadonly()
        renderPitchBtns()
    }

    const renderPitchBtns = () => {
        pitchBtnRow.innerHTML = ''
        if (isEditingPitch) {
            pitchReadonlyRow.style.display = 'none'
            pitchEditWrap.style.display = 'flex'

            const btnCancel = document.createElement('button')
            btnCancel.classList.add('btn', 'cancel-btn')
            btnCancel.textContent = 'Cancel'
            btnCancel.onclick = () => onCancelPitch()

            const btnApply = document.createElement('button')
            btnApply.classList.add('btn', 'confirm-btn')
            btnApply.textContent = 'Apply'
            btnApply.onclick = () => {
                events.fire('orientation:save-pitchoffset', { value: degToRad(pitchDraftDeg) })
                isEditingPitch = false
                syncPitchReadonly()
                renderPitchBtns()
            }

            pitchBtnRow.appendChild(btnCancel)
            pitchBtnRow.appendChild(btnApply)
        } else {
            pitchReadonlyRow.style.display = 'flex'
            pitchEditWrap.style.display = 'none'

            const btnEdit = document.createElement('button')
            btnEdit.classList.add('btn')
            btnEdit.textContent = 'Edit'
            btnEdit.onclick = () => {
                isEditingPitch = true
                setPitchDraft(radToDeg(settings.orientation.pitchOffset ?? 0))
                renderPitchBtns()
            }
            pitchBtnRow.appendChild(btnEdit)
        }
    }

    cameraLimitsGroup.appendChild(pitchReadonlyRow)
    cameraLimitsGroup.appendChild(pitchEditWrap)
    cameraLimitsGroup.appendChild(pitchBtnRow)

    // ── Assemble ──
    container.appendChild(readonlyRotationRow)
    container.appendChild(methodWrap)
    container.appendChild(orientBtnRow)
    group.appendChild(container)

    syncPitchReadonly()
    renderOrientBtns()
    renderPitchBtns()

    return { cameraLimitsGroup }
}
