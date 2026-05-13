function makeOrientationGroup(global, editGroup) {
    const { events, settings } = global
    const group = makeSectionGroup('transform')
    editGroup.register('orientation', { cancel: () => onCancelOrientation() })

    let isEditing = false
    let currentMethod = 'ground'

    const container = document.createElement('div')
    container.classList.add('orientation-btn-wrap')

    const { row: readonlyRotationRow, setValues: setReadonlyValues } = makeVec3Inputs({
        title: 'Rotation',
        disabled: true,
        onChange: () => {},
    })

    if (settings.orientation.pose) {
        const { rotation: r } = settings.orientation.pose
        setReadonlyValues(new Quat(r.x, r.y, r.z, r.w).getEulerAngles())
    } else if (modelEntity) {
        const r = global.cameraManager.controllers.ortery.initialModelRotation
        setReadonlyValues(new Quat(r.x, r.y, r.z, r.w).getEulerAngles())
    }
    events.on('orientation:aligned-model', ({ x, y, z }) => setReadonlyValues({ x, y, z }))

    const { panel: manualPanel } = makeManualPanel(events)
    const { panel: groundPanel, stopPicking, getPoints, MAX_POINTS } = makeGroundPanel(events, global)

    const methodWrap = document.createElement('div')
    methodWrap.style.cssText = 'display:none; flex-direction:column; gap:12px;'

    const methodRow = makeRow('Method')
    const methodBtns = makeSegmentRow({
        options: [
            { label: 'Ground plane', value: 'ground' },
            { label: 'Manual', value: 'manual' },
        ],
        defaultValue: 'ground',
        className: 'orientation-method-btns',
        onChange: (val) => switchMethod(val),
    })
    methodRow.appendChild(methodBtns)

    const switchMethod = (method) => {
        currentMethod = method
        manualPanel.style.display = method === 'manual' ? 'flex' : 'none'
        groundPanel.style.display = method === 'ground' ? 'flex' : 'none'
        if (method === 'manual') {
            stopPicking()
        } else {
        }
        events.fire('orientation:switch-method', currentMethod)
    }
    methodWrap.appendChild(methodRow)
    methodWrap.appendChild(manualPanel)
    methodWrap.appendChild(groundPanel)

    const orientBtnRow = document.createElement('div')
    orientBtnRow.classList.add('btn-row')

    const onCancelOrientation = () => {
        if (!isEditing) return
        isEditing = false
        stopPicking()
        methodWrap.style.display = 'none'
        currentMethod = 'ground'
        methodBtns.setValue('ground')
        if (settings.orientation.pose) {
            const { rotation: r } = settings.orientation.pose
            setReadonlyValues(new Quat(r.x, r.y, r.z, r.w).getEulerAngles())
        } else {
            setReadonlyValues(modelEntity.getLocalEulerAngles(new Vec3()))
        }
        renderOrientBtns()
        events.fire('orientation:cancel')
    }

    const renderOrientBtns = () => {
        orientBtnRow.innerHTML = ''
        if (isEditing) {
            readonlyRotationRow.style.display = 'none'
            methodWrap.style.display = 'flex'

            const btnCancel = makeButton({ title: 'Cancel', className: 'cancel-btn', onClick: onCancelOrientation })
            const btnSave = makeButton({
                className: 'confirm-btn',
                title: 'Apply',
                onClick: () => {
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
                    }
                    isEditing = false
                    currentMethod = 'ground'
                    methodBtns.setValue('ground')
                    methodWrap.style.display = 'none'
                    renderOrientBtns()
                },
            })

            orientBtnRow.appendChild(btnCancel)
            orientBtnRow.appendChild(btnSave)
        } else {
            readonlyRotationRow.style.display = 'flex'
            methodWrap.style.display = 'none'

            const btnEdit = makeButton({
                className: 'edit-btn',
                title: 'Edit',
                onClick: () => {
                    editGroup.startEdit('orientation')
                    isEditing = true
                    switchMethod(currentMethod)
                    events.fire('orientation:edit', currentMethod)
                    renderOrientBtns()
                },
            })
            const btnDelete = makeButton({
                title: 'Reset',
                icon: ICONS.reset,
                className: 'reset-btn',
                onClick: async () => {
                    const ok = await global.confirmDialog.ask({
                        title: 'Reset Transform',
                        message: 'This will reset your current transform settings. Do you want to reset?',
                        variant: 'delete',
                        position: 'top',
                        confirmText: 'Reset',
                    })
                    if (ok) {
                        events.fire('orientation:reset')
                        renderOrientBtns()
                    }
                },
            })
            orientBtnRow.appendChild(btnEdit)
            if (settings.orientation.pose) orientBtnRow.appendChild(btnDelete)
        }
    }

    container.appendChild(readonlyRotationRow)
    container.appendChild(methodWrap)
    container.appendChild(orientBtnRow)
    group.appendChild(container)

    renderOrientBtns()

    return group
}

function makeCameraLimitsGroup(global, editGroup) {
    const { events, settings } = global
    const group = makeSectionGroup('camera')
    editGroup.register('cameraLimit', { cancel: () => onCancelPitch() })
    const PITCH_MIN_DEG = -90
    const PITCH_MAX_DEG = 90
    let isEditingPitch = false
    let pitchDraftDeg = 0
    const clampPitch = (v) => Math.max(PITCH_MIN_DEG, Math.min(PITCH_MAX_DEG, v))

    const pitchEditWrap = document.createElement('div')
    pitchEditWrap.style.cssText = 'display:flex; flex-direction:column; gap:12px; margin-bottom:8px;'

    const pitchInputRow = makeRow('Pitch offset')
    const defaultValue =
        settings.orientation.pitchOffset !== undefined ? Math.round(radToDeg(settings.orientation.pitchOffset)) : 0
    const pitchInput = makeInput('number', defaultValue, {
        step: 1,
        disabled: true,
        min: PITCH_MIN_DEG,
        max: PITCH_MAX_DEG,
        className: 'orientation-step-input',
        onChange: (value) => {
            setPitchDraft(parseFloat(value) || 0)
        },
    })
    pitchInputRow.appendChild(pitchInput)

    const pitchSliderRow = document.createElement('div')
    pitchSliderRow.style.cssText = 'display:none; align-items:center; gap:6px;'
    const pitchSliderMin = document.createElement('span')
    pitchSliderMin.style.cssText = 'font-size:10px; color:var(--text-muted); min-width:24px;'
    pitchSliderMin.textContent = '-90°'

    const pitchSlider = makeSlider({
        min: PITCH_MIN_DEG,
        max: PITCH_MAX_DEG,
        step: 1,
        value: defaultValue,
        className: 'pitch-slider',
        onChange: (value) => setPitchDraft(parseFloat(value) || 0),
    })
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
    pitchEditWrap.appendChild(pitchInputRow)
    pitchEditWrap.appendChild(pitchSliderRow)

    const pitchBtnRow = document.createElement('div')
    pitchBtnRow.classList.add('btn-row')

    const onCancelPitch = () => {
        if (!isEditingPitch) return
        isEditingPitch = false
        pitchInput.disabled = true
        pitchSliderRow.style.display = 'none'
        events.fire('orientation:cancel-pitchoffset')
        renderPitchBtns()
    }

    const renderPitchBtns = () => {
        pitchBtnRow.innerHTML = ''
        if (isEditingPitch) {
            const btnCancel = makeButton({ title: 'Cancel', className: 'cancel-btn', onClick: onCancelPitch })

            const btnApply = makeButton({
                title: 'Apply',
                className: 'confirm-btn',
                onClick: () => {
                    events.fire('orientation:save-pitchoffset', { value: degToRad(pitchDraftDeg) })
                    isEditingPitch = false
                    pitchInput.disabled = true
                    pitchSliderRow.style.display = 'none'
                    renderPitchBtns()
                },
            })

            pitchBtnRow.appendChild(btnCancel)
            pitchBtnRow.appendChild(btnApply)
        } else {
            const btnEdit = makeButton({
                className: 'edit-btn',
                title: 'Edit',
                onClick: () => {
                    isEditingPitch = true
                    pitchInput.disabled = false
                    pitchSliderRow.style.display = 'flex'
                    editGroup.startEdit('cameraLimit')
                    setPitchDraft(radToDeg(settings.orientation.pitchOffset ?? 0))
                    renderPitchBtns()
                },
            })
            pitchBtnRow.appendChild(btnEdit)
        }
    }

    group.appendChild(pitchEditWrap)
    group.appendChild(pitchBtnRow)

    renderPitchBtns()

    return group
}
