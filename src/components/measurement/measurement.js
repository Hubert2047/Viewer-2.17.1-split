function makeMeasurementSection(el, global) {
    const { events, settings } = global
    let editMeasurement = settings.measurement ? { ...settings.measurement } : null
    let currentMeasurement = editMeasurement ? { ...editMeasurement } : null
    let isEditing = false
    let calibState = currentMeasurement?.calibration?.points.length >= 2 ? 'picked' : 'idle'
    let calibPoints = currentMeasurement?.calibration.points ?? []
    let canUseDimensionData = hasDimensionsData(settings.dimensions)
    const container = document.createElement('div')
    container.classList.add('section-wrap')

    const noMeasureRow = document.createElement('div')
    noMeasureRow.classList.add('no-configured-row')
    const noMeasureText = document.createElement('span')
    noMeasureText.textContent = 'No measurement configured'
    const addBtn = document.createElement('button')
    addBtn.classList.add('add-btn')
    addBtn.textContent = '+ Add'
    addBtn.onclick = () => {
        currentMeasurement = {
            lineColor: '#f95f4d',
            textColor: '#ffffff',
            textBackground: { color: '#000000', alpha: 0.8 },
            calibration: {
                useDimensionData: hasDimensionsData(settings.dimensions),
                unit: 'cm',
                distance: 0,
                points: [],
            },
        }
        calibState = 'idle'
        editMeasurement = { ...currentMeasurement }
        settings.measurement = { ...currentMeasurement }
        setConfigured(true)
        setValues(currentMeasurement)
        if (!global.measureTool) {
            global.measureTool = new MeasureTool(global)
        }
        global.dataDirty = true
        events.fire('re-render:control-wrap')
        onEdit()
    }

    noMeasureRow.appendChild(noMeasureText)
    noMeasureRow.appendChild(addBtn)

    const hasMeasureWrap = document.createElement('div')
    hasMeasureWrap.classList.add('section-wrap')

    // ── Calibration group ──
    const calibrationHint = `Select two points on the model that you can also measure in the real world. Enter the actual distance between them to calibrate the scale. Rotate or zoom the model to ensure the points match your physical reference points exactly. If you've already set dimensions, you can use that data directly.`
    const calibGroup = makeSectionGroup('Calibration', calibrationHint)
    const calibContent = document.createElement('div')
    calibContent.style.cssText = 'display:flex; flex-direction:column; gap:8px;'

    const hintText = document.createElement('p')
    hintText.style.cssText = 'font-size:12px; color:rgb(140,159,180); margin:0; line-height:1.5;'
    hintText.textContent = 'Select 2 points on the model and enter the real distance to calibrate the scale.'

    const pickBtn = makeButton({
        title: 'Pick 2 points',
        className: 'add-btn',
        onClick: () => {
            if (!isEditing) return
            calibState = 'picking'
            renderCalib()
            events.fire('measurement:calibration-pick-start')
            global.dataDirty = true
        },
    })
    pickBtn.style.cssText = 'justify-content:center; width:100%;'
    const pickedBadge = document.createElement('div')
    pickedBadge.style.cssText = `
        display:flex; align-items:center; gap:6px;
        padding:6px 10px; border-radius:6px;
        background:rgba(0,0,0,0.04); border:0.5px solid rgba(0,0,0,0.08);
        font-size:12px; color:rgb(80,160,100);
    `
    const rePick = makeLink({
        label: 'Re-pick',
        variant: 'subtle',
        size: 'small',
        onClick: () => {
            if (!isEditing) return
            calibState = 'picking'
            calibPoints = []
            calibDistanceInput.value = ''
            setPointAValues({ x: 0, y: 0, z: 0 })
            setPointBValues({ x: 0, y: 0, z: 0 })
            renderCalib()
            events.fire('measurement:calibration-pick-start')
            global.dataDirty = true
        },
    })
    const deleteCalibrationBtn = makeLink({
        label: 'Delete',
        variant: 'delete',
        size: 'small',
        onClick: async () => {
            const ok = await global.confirmDialog.ask({
                position: 'top',
                variant: 'delete',
                title: 'Delete calibration',
                message: 'All calibration data will be removed. You will need to recalibrate.',
                confirmText: 'Delete',
            })
            if (!ok) return
            currentMeasurement.calibration = {
                useDimensionData: canUseDimensionData,
                unit: 'cm',
                distance: 0,
                points: [],
            }
            calibState = 'idle'
            calibPoints = []
            setValues(currentMeasurement)
            events.fire('measurement:calibration-cancel')
            global.dataDirty = true
            renderCalib()
        },
    })
    rePick.style.cssText = 'margin-left:auto; margin-right:0.25rem'
    pickedBadge.innerHTML = `<span>✓</span> 2 points selected`
    pickedBadge.appendChild(rePick)
    pickedBadge.appendChild(deleteCalibrationBtn)

    // ── Point A / B Vec3 inputs ──
    const {
        row: pointARow,
        setValues: setPointAValues,
        setDisabled: setPointADisabled,
    } = makeVec3Inputs({
        title: 'Point A',
        step: 0.1,
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            events.fire('measurement:calibration-set-input-point', { idx: 0, pos: { x, y, z } })
            if (calibPoints.length >= 1) calibPoints[0] = { x, y, z }
            global.dataDirty = true
        },
    })

    const {
        row: pointBRow,
        setValues: setPointBValues,
        setDisabled: setPointBDisabled,
    } = makeVec3Inputs({
        title: 'Point B',
        step: 0.1,
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            events.fire('measurement:calibration-set-input-point', { idx: 1, pos: { x, y, z } })
            if (calibPoints.length >= 2) calibPoints[1] = { x, y, z }
            global.dataDirty = true
        },
    })

    events.on('measurement:calibration-point-moved', ({ idx, pos }) => {
        if (idx === 0) setPointAValues(pos)
        else setPointBValues(pos)
        calibPoints[idx] = pos
    })

    // distance input row
    const distanceRow = makeRow({ title: 'Real Distance', className: 'real-distance' })
    const calibDistanceInput = makeInput({
        type: 'number',
        value: currentMeasurement?.calibration?.distance,
        min: 0,
        className: 'calib-input',
        onChange: (v) => {
            currentMeasurement.calibration.distance = v
            global.dataDirty = true
        },
    })
    const calibUnitSelect = makeSelect(
        ['mm', 'cm', 'm', 'inch'],
        settings.measurement?.calibration?.unit || 'cm',
        (v) => {
            currentMeasurement.calibration.unit = v
            global.dataDirty = true
        },
        { name: 'unit', className: 'unit-select' },
    )
    distanceRow.appendChild(calibDistanceInput)
    distanceRow.appendChild(calibUnitSelect)
    const {
        row: useDimCheckBox,
        setDisabled: setUseDimCheckboxDisabled,
        setChecked: setUseDimChecked,
    } = makeCheckbox({
        label: 'Use dimensions data',
        checked: currentMeasurement?.calibration.useDimensionData,
        disabled: true,
        onChange: (val) => {
            if (!isEditing) return
            currentMeasurement.calibration.useDimensionData = val
            if (!val && currentMeasurement.calibration.points.length >= 2) {
                events.fire('measurement:calibration-restore-points', currentMeasurement.calibration.points)
            } else {
                events.fire('measurement:calibration-reset')
            }
            global.dataDirty = true
            renderCalib()
        },
    })

    const renderCalib = () => {
        calibContent.innerHTML = ''
        const hasCalibration = hasCalibrationData(currentMeasurement?.calibration)
        if (canUseDimensionData && !hasCalibration) {
            setUseDimCheckboxDisabled(!isEditing)
            calibContent.appendChild(useDimCheckBox)
        }
        if (currentMeasurement?.calibration.useDimensionData && canUseDimensionData) return
        if (calibState === 'idle') {
            calibContent.appendChild(hintText)
            pickBtn.disabled = !isEditing
            pickBtn.style.opacity = isEditing ? '1' : '0.4'
            calibContent.appendChild(pickBtn)
        } else if (calibState === 'picking') {
            const pickingBadge = document.createElement('div')
            pickingBadge.style.cssText = `
                display:flex; align-items:center; gap:6px;
                padding:7px 10px; border-radius:6px;
                background:rgba(249,95,77,0.08); border:0.5px solid rgba(249,95,77,0.3);
                font-size:12px; color:#f95f4d;
            `
            pickingBadge.textContent = '⊙ Waiting for 2 points to be selected on the model...'
            calibContent.appendChild(pickingBadge)
        } else if (calibState === 'picked') {
            calibContent.appendChild(pickedBadge)
            setPointADisabled(!isEditing)
            setPointBDisabled(!isEditing)
            calibContent.appendChild(pointARow)
            calibContent.appendChild(pointBRow)
            calibDistanceInput.disabled = !isEditing
            calibUnitSelect.disabled = !isEditing
            distanceRow.disabled = !isEditing
            calibContent.appendChild(distanceRow)
        }
    }

    events.on('measurement:calibration-picked', (points) => {
        if (points.length < 2) return
        calibPoints = points
        calibState = 'picked'
        setPointAValues(points[0])
        setPointBValues(points[1])
        renderCalib()
    })

    calibGroup.appendChild(calibContent)

    // ── Display group ──
    const displayGroup = makeSectionGroup('Display')

    const { row: lineColorRow, setDisabled: setLineColorDisabled } = makeColorPickerDropdown({
        label: 'Line Color',
        color: currentMeasurement?.lineColor ?? '#f95f4d',
        debounceMs: 0,
        onChange: ({ hex }) => {
            currentMeasurement = { ...currentMeasurement, lineColor: hex }
            if (global.measureTool) global.measureTool.setConfig(currentMeasurement)
            global.dataDirty = true
        },
    })

    const { row: textColorRow, setDisabled: setTextColorDisabled } = makeColorPickerDropdown({
        label: 'Text Color',
        color: currentMeasurement?.textColor ?? '#ffffff',
        debounceMs: 0,
        onChange: ({ hex }) => {
            currentMeasurement = { ...currentMeasurement, textColor: hex }
            if (global.measureTool) global.measureTool.setConfig(currentMeasurement)
            global.dataDirty = true
        },
    })
    const { row: backgroundRow, setDisabled: setBackgroundDisabled } = makeColorPickerDropdown({
        label: 'Text Background',
        color: currentMeasurement?.textBackground.color ?? '#000000',
        alpha: currentMeasurement?.textBackground.alpha ?? 0.8,
        hasAlpha: true,
        debounceMs: 0,
        onChange: ({ hex, alpha }) => {
            currentMeasurement = {
                ...currentMeasurement,
                textBackground: { color: hex, alpha },
            }
            if (global.measureTool) global.measureTool.setConfig(currentMeasurement)
            global.dataDirty = true
        },
    })

    displayGroup.appendChild(lineColorRow)
    displayGroup.appendChild(textColorRow)
    displayGroup.appendChild(backgroundRow)

    hasMeasureWrap.appendChild(calibGroup)
    hasMeasureWrap.appendChild(displayGroup)

    // ── Buttons ──
    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')

    const setValues = (m) => {
        if (!m) return
        if (m.calibration) {
            calibDistanceInput.value = m.calibration.distance
            calibUnitSelect.value = m.calibration.unit
            setUseDimChecked(m.calibration.useDimensionData)
            if (m.calibration?.points.length >= 2) {
                setPointAValues(m.calibration.points[0])
                setPointBValues(m.calibration.points[1])
                calibState = 'picked'
            } else {
                calibState = 'idle'
            }
        }
        renderCalib()
    }

    const setDisabled = (enabled) => {
        setLineColorDisabled(!enabled)
        setTextColorDisabled(!enabled)
        setBackgroundDisabled(!enabled)
        rePick.setDisplay(enabled)
        deleteCalibrationBtn.setDisplay(enabled)
        renderCalib()
        setUseDimCheckboxDisabled(!enabled)
    }

    const onEdit = () => {
        isEditing = true
        setDisabled(true)
        renderBtns()
        const { calibration } = currentMeasurement
        if (hasCalibrationData(calibration)) {
            events.fire('measurement:calibration-restore-points', currentMeasurement.calibration.points)
        }
        renderCalib()
        global.isEditMeasurement = true
        events.fire('re-render:control-wrap')
    }

    const onCancel = () => {
        if (!isEditing) return
        isEditing = false
        calibState = currentMeasurement.calibration.points.length >= 2 ? 'picked' : 'idle'
        calibPoints = []
        setPointAValues({ x: 0, y: 0, z: 0 })
        setPointBValues({ x: 0, y: 0, z: 0 })
        setDisabled(false)
        if (editMeasurement) setValues(editMeasurement)
        currentMeasurement = { ...editMeasurement }
        renderBtns()
        events.fire('measurement:calibration-cancel')
        global.isEditMeasurement = false
        events.fire('re-render:control-wrap')
    }

    const renderBtns = () => {
        btnRow.innerHTML = ''
        if (isEditing) {
            const btnCancel = makeButton({ title: 'Cancel', className: 'cancel-btn', onClick: onCancel })
            const btnApply = makeButton({
                title: 'Apply',
                className: 'confirm-btn',
                onClick: async () => {
                    if (calibPoints.length >= 2) {
                        currentMeasurement = {
                            ...currentMeasurement,
                            calibration: {
                                ...currentMeasurement.calibration,
                                points: calibPoints,
                            },
                        }
                    }
                    const { calibration } = currentMeasurement
                    const hasCalibration = hasCalibrationData(calibration)
                    if (
                        (calibration.useDimensionData && !canUseDimensionData) ||
                        (!calibration.useDimensionData && !hasCalibration)
                    ) {
                        const goBack = await global.confirmDialog.ask({
                            title: 'Calibration incomplete',
                            message:
                                "You haven't entered the real-world distance. Without it, the measurement feature will be unavailable.",
                            position: 'top',
                            confirmText: 'Go back',
                            cancelText: 'Save anyway',
                        })
                        if (goBack) return
                    }
                    if (calibration.useDimensionData && !canUseDimensionData & hasCalibration) {
                        currentMeasurement.calibration.useDimensionData = false
                    }

                    editMeasurement = { ...currentMeasurement }
                    settings.measurement = { ...currentMeasurement }
                    isEditing = false
                    setDisabled(false)
                    renderBtns()
                    renderCalib()
                    events.fire('measurement:calibration-cancel')
                    global.isEditMeasurement = false
                    events.fire('re-render:control-wrap')
                },
            })
            btnRow.appendChild(btnCancel)
            btnRow.appendChild(btnApply)
        } else {
            const btnEdit = makeButton({ title: 'Edit', className: 'edit-btn', onClick: onEdit })
            const btnDelete = makeButton({
                title: 'Delete',
                icon: ICONS.trash,
                className: 'delete-btn',
                onClick: async () => {
                    const ok = await global.confirmDialog.ask({
                        position: 'top',
                        variant: 'delete',
                        title: 'Delete measurement',
                        message: 'Measurement data will be permanently deleted.',
                        confirmText: 'Delete',
                    })
                    if (!ok) return
                    settings.measurement = JSON.parse(JSON.stringify(defaultSettings.measurement))
                    editMeasurement = null
                    currentMeasurement = null
                    calibState = 'idle'
                    calibPoints = []
                    global.measureTool.deactivate()
                    events.fire('re-render:control-wrap')
                    setConfigured(false)
                },
            })
            btnRow.appendChild(btnEdit)
            btnRow.appendChild(btnDelete)
        }
    }

    hasMeasureWrap.appendChild(btnRow)

    const setConfigured = (has) => {
        noMeasureRow.style.display = has ? 'none' : 'flex'
        hasMeasureWrap.style.display = has ? 'flex' : 'none'
    }

    container.appendChild(noMeasureRow)
    container.appendChild(hasMeasureWrap)
    el.appendChild(container)

    events.on('sidebar:active', ({ id }) => {
        onCancel()
    })
    events.on('sidebar:clicked', ({ id }) => {
        onCancel()
        if (id !== 'measurement') return
        canUseDimensionData = hasDimensionsData(settings.dimensions)
        renderCalib()
    })
    events.on('dimensions:delete', () => {
        if (!hasCalibrationData(currentMeasurement?.calibration)) {
            global.measureTool.deactivate()
        }
    })

    renderBtns()
    setDisabled(false)
    renderCalib()
    setConfigured(!!editMeasurement)
    if (editMeasurement) setValues(editMeasurement)
}
