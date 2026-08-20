function makeDimensionSection(el, global) {
    const { events, settings } = global
    let isEditing = false
    let dimensionRotatable = null
    let isNewDimension = false
    let editDimension = settings.dimensions ?? null
    let currentDimensions = settings.dimensions ?? null
    let canUseMeasurementData = hasCalibrationData(settings.measurement?.calibration)
    const container = document.createElement('div')
    container.classList.add('section-wrap')

    // ── No dimension row ──
    const noDimRow = document.createElement('div')
    noDimRow.classList.add('no-configured-row')
    const noDimText = document.createElement('span')
    noDimText.textContent = 'No dimensions configured'
    const addBtn = makeButton({
        title: '+ Add',
        className: 'add-btn',
        onClick: async () => {
            if (!global.oobbInfo) {
                await global.loading.show()
                await global.oobbInfoPromise
                global.loading.hide()
            }
            const { finalQuat, posInLocal, size } = global.oobbInfo
            const finalEuler = finalQuat.getEulerAngles()
            currentDimensions = {
                boxColor: '#f95f4d',
                background: { color: '#ffffff', alpha: 0.8 },
                foregroundColor: '#f95f4d',
                realSize: { x: 0, y: 0, z: 0 },
                unit: 'cm',
                type: 'dimensions',
                position: { x: posInLocal.x, y: posInLocal.y, z: posInLocal.z },
                size,
                rotation: { x: finalEuler.x, y: finalEuler.y, z: finalEuler.z },
            }
            if (canUseMeasurementData) {
                currentDimensions.useMeasurementData = true
                setUseMeasurementChecked(true)
            }
            autoCalc = false
            setAutoCalChecked(false)
            lastChangedAxis = null
            lastInputAxisValue = null
            isNewDimension = true
            setDimConfigured(true)
            setValues(currentDimensions)
            onDimensionsConfigured()
            renderRealGroup()
            onEdit()
        },
    })

    noDimRow.appendChild(noDimText)
    noDimRow.appendChild(addBtn)

    const hasDimWrap = makeSectionWrap()
    const displayGroup = makeSectionGroup('display')

    const {
        row: boxColorGroup,
        setDisabled: setBoxColorDisabled,
        setColor: setBoxColor,
    } = makeColorPickerDropdown({
        label: 'Box color',
        color: currentDimensions?.boxColor || '#f95f4d',
        debounceMs: 0,
        onChange: ({ hex }) => {
            currentDimensions = { ...currentDimensions, boxColor: hex }
            events.fire('dimensions:color-change', currentDimensions)
            global.dataDirty = true
        },
    })

    const {
        row: textColor,
        setDisabled: setTextColorDisabled,
        setColor: setTextColorValue,
    } = makeColorPickerDropdown({
        label: 'Text color',
        color: currentDimensions?.foregroundColor || '#f95f4d',
        debounceMs: 0,
        onChange: ({ hex }) => {
            currentDimensions = { ...currentDimensions, foregroundColor: hex }
            events.fire('dimensions:color-change', currentDimensions)
            global.dataDirty = true
        },
    })

    const {
        row: backgroundColor,
        setDisabled: setBackgroundDisabled,
        setColor: setBackgroundColorValue,
    } = makeColorPickerDropdown({
        label: 'Text background',
        color: currentDimensions?.background.color || '#ffffff',
        alpha: currentDimensions?.background.alpha ?? 0.8,
        hasAlpha: true,
        debounceMs: 0,
        onChange: ({ hex, alpha }) => {
            currentDimensions = {
                ...currentDimensions,
                background: { color: hex, alpha },
            }
            events.fire('dimensions:color-change', currentDimensions)
            global.dataDirty = true
        },
    })
    displayGroup.appendChild(boxColorGroup)
    displayGroup.appendChild(textColor)
    displayGroup.appendChild(backgroundColor)

    const actualHint = `Measure the real-world dimensions of the model along each axis using the bounding box edges as reference. You can measure just one side and enable Auto Calculate to derive the other two automatically. If you've already calibrated in the Measurement section, you can use that data directly.`
    const realGroup = makeSectionGroup('Real size', actualHint)
    const realSizeContent = document.createElement('div')
    realSizeContent.style.cssText = 'display:flex; flex-direction:column; gap:8px;'
    realGroup.appendChild(realSizeContent)
    const {
        row: useMeasurementCheckBox,
        setDisabled: setUsMeasurementDisabled,
        setChecked: setUseMeasurementChecked,
    } = makeCheckbox({
        label: 'Use measurement data',
        checked: currentDimensions?.useMeasurementData,
        disabled: true,
        onChange: (val) => {
            if (val) {
                currentDimensions = { ...currentDimensions, ...calRealSizeFromMeasurement(currentDimensions.size) }
            } else {
                const source = editDimension ?? currentDimensions
                const { realSize, unit } = source
                currentDimensions = { ...currentDimensions, realSize, unit }
            }
            currentDimensions.useMeasurementData = val
            realUnitSelect.setValue(currentDimensions.unit)
            setValues(currentDimensions)
            onDimensionsChanged()
            global.dataDirty = true
            renderRealGroup()
        },
    })
    let autoCalc = false
    let lastChangedAxis = null
    let lastInputAxisValue = null
    const {
        row: autoCalcRow,
        getValue: getAutoCalc,
        setDisabled: setAutoCalcDisabled,
        setChecked: setAutoCalChecked,
    } = makeCheckbox({
        label: 'Auto calculate',
        checked: false,
        disabled: true,
        onChange: (val) => {
            autoCalc = val
            if (val && lastChangedAxis && lastInputAxisValue) {
                const boxSize = currentDimensions.size
                const boxVal = boxSize[lastChangedAxis]
                if (boxVal && boxVal !== 0) {
                    const ratio = lastInputAxisValue / boxVal
                    const newReal = {
                        x: lastChangedAxis === 'x' ? lastInputAxisValue : boxSize.x * ratio,
                        y: lastChangedAxis === 'y' ? lastInputAxisValue : boxSize.y * ratio,
                        z: lastChangedAxis === 'z' ? lastInputAxisValue : boxSize.z * ratio,
                    }
                    currentDimensions = { ...currentDimensions, realSize: newReal }
                    setRealValues({ x: newReal.x, y: newReal.y, z: newReal.z })
                    onDimensionsChanged()
                }
            }
        },
    })

    const realUnitRow = makeRow({ title: 'Unit' })
    const realUnitSelect = makeSelect({
        options: [
            { value: 'mm', label: 'mm' },
            { value: 'cm', label: 'cm' },
            { value: 'm', label: 'm' },
            { value: 'inch', label: 'inch' },
            { value: 'feet', label: 'Feet' },
        ],
        value: settings.dimensions?.unit || 'cm',
        className: 'dimensions-unit',
        onChange: (v) => {
            currentDimensions = { ...currentDimensions, unit: v }
            onDimensionsChanged()
            global.dataDirty = true
        },
        name: 'unit',
    })

    realUnitRow.el.appendChild(realUnitSelect.el)

    const {
        row: realSizeRow,
        setDisabled: setRealDisabled,
        setValues: setRealValues,
        setValuesPartial: setRealValuesPartial,
    } = makeVec3Inputs({
        title: 'Size',
        axisLabels: { x: 'A', y: 'B', z: 'C' },
        step: 0.1,
        onChange: ({ x, y, z, changedAxis }) => {
            lastChangedAxis = changedAxis
            lastInputAxisValue = { x, y, z }[changedAxis]
            if (!isEditing) return
            if (autoCalc && currentDimensions?.size && changedAxis) {
                const boxSize = currentDimensions.size
                const inputVal = { x, y, z }[changedAxis]
                const boxVal = boxSize[changedAxis]
                if (boxVal && boxVal !== 0) {
                    const ratio = inputVal / boxVal
                    const newReal = {
                        x: changedAxis === 'x' ? x : boxSize.x * ratio,
                        y: changedAxis === 'y' ? y : boxSize.y * ratio,
                        z: changedAxis === 'z' ? z : boxSize.z * ratio,
                    }
                    currentDimensions = { ...currentDimensions, realSize: newReal }

                    const others = { x: newReal.x, y: newReal.y, z: newReal.z }
                    delete others[changedAxis]
                    setRealValuesPartial(others)
                }
            } else {
                currentDimensions = { ...currentDimensions, realSize: { x, y, z } }
            }
            global.dataDirty = true
            onDimensionsChanged()
        },
    })
    if (settings.dimensions) setRealValues(settings.dimensions.realSize)

    renderRealGroup()

    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')

    hasDimWrap.appendChild(realGroup)
    hasDimWrap.appendChild(displayGroup)
    hasDimWrap.appendChild(btnRow)

    container.appendChild(noDimRow)
    container.appendChild(hasDimWrap)
    el.appendChild(container)

    renderBtns()
    setDisabled(false)
    setDimConfigured(!!settings.dimensions)
    if (settings.dimensions) setValues(settings.dimensions)
    function renderRealGroup() {
        realSizeContent.innerHTML = ''
        const hasDimensions = hasDimensionsData(currentDimensions)
        if (canUseMeasurementData) {
            realSizeContent.appendChild(useMeasurementCheckBox)
        }
        if (currentDimensions?.useMeasurementData && canUseMeasurementData) return
        realSizeContent.appendChild(autoCalcRow)
        realSizeContent.appendChild(realSizeRow)
        realSizeContent.appendChild(realUnitRow.el)
    }
    function setValues(dim) {
        if (!dim) return
        setRealValues(dim.realSize)
        setBoxColor(dim.boxColor)
        setTextColorValue(dim.foregroundColor)
        setBackgroundColorValue(dim.background.color, dim.background.alpha)
    }

    function setDisabled(on) {
        setRealDisabled(!on)
        realUnitSelect.setDisabled(!on)
        setBoxColorDisabled(!on)
        setTextColorDisabled(!on)
        setUsMeasurementDisabled(!on)
        setBackgroundDisabled(!on)
        setAutoCalcDisabled(!on)
    }
    function renderBtns() {
        btnRow.innerHTML = ''
        if (isEditing) {
            const btnCancel = makeButton({ title: 'Cancel', className: 'cancel-btn', onClick: onCancel })
            const btnApply = makeButton({
                title: 'Apply',
                className: 'confirm-btn',
                onClick: async () => {
                    if (
                        (currentDimensions.useMeasurementData && !canUseMeasurementData) ||
                        (!currentDimensions.useMeasurementData && !hasDimensionsData(currentDimensions))
                    ) {
                        const goBack = await global.confirmDialog.ask({
                            title: 'Dimensions incomplete',
                            message:
                                "Real-world size hasn't been entered. The bounding box won't reflect actual dimensions.",
                            position: 'top',
                            confirmText: 'Go back',
                            cancelText: 'Save anyway',
                        })
                        if (goBack) return
                    }
                    editDimension = { ...currentDimensions }
                    settings.dimensions = { ...currentDimensions }
                    isEditing = false
                    isNewDimension = false
                    global.dimensionsBox.setEditing(false)
                    setDisabled(false)
                    renderBtns()
                    renderRealGroup()
                    events.fire('dimensions:change', currentDimensions)
                    global.dimensionsBox.draw(currentDimensions)
                    global.rotationGizmo.disable()
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
                        title: 'Delete dimensions',
                        message: 'Dimensions data will be permanently deleted.',
                        confirmText: 'Delete',
                    })
                    if (!ok) return
                    settings.dimensions = null
                    editDimension = null
                    currentDimensions = null
                    setDimConfigured(false)
                    autoCalc = false
                    setAutoCalChecked(false)
                    lastChangedAxis = null
                    lastInputAxisValue = null
                    setValues({
                        realSize: { x: 0, y: 0, z: 0 },
                        boxColor: '#f95f4d',
                        foregroundColor: '#f95f4d',
                        background: { color: '#ffffff', alpha: 0.8 },
                    })
                    onDimensionsConfigured()
                    events.fire('dimensions:delete')
                    events.fire('re-render:control-wrap')
                },
            })
            btnRow.appendChild(btnEdit)
            btnRow.appendChild(btnDelete)
        }
    }
    async function onBoxEndDrag() {
        if (!isEditing) return
        const oldSize = currentDimensions.size
        const result = await getUpdateBoxSize(currentDimensions.rotation, settings.removedSplats)
        currentDimensions = { ...currentDimensions, size: result.size, position: result.position }

        if (currentDimensions.useMeasurementData && canUseMeasurementData) {
            currentDimensions = { ...currentDimensions, ...calRealSizeFromMeasurement(result.size) }
            setRealValues(currentDimensions.realSize)
        } else if (autoCalc) {
            let refAxis = lastChangedAxis
            let refValue = lastInputAxisValue
            if (!refAxis) {
                const real = currentDimensions.realSize || {}
                refAxis = ['x', 'y', 'z'].find((axis) => real[axis])
                refValue = refAxis ? real[refAxis] : null
            }
            const oldBoxVal = refAxis ? oldSize[refAxis] : null
            if (refAxis && refValue && oldBoxVal) {
                const ratio = refValue / oldBoxVal
                const newReal = {
                    x: refAxis === 'x' ? refValue : result.size.x * ratio,
                    y: refAxis === 'y' ? refValue : result.size.y * ratio,
                    z: refAxis === 'z' ? refValue : result.size.z * ratio,
                }
                currentDimensions = { ...currentDimensions, realSize: newReal }
                setRealValues(newReal)
            }
        }

        onDimensionsChanged()
    }
    function onEdit() {
        isEditing = true
        lastChangedAxis = null
        lastInputAxisValue = null
        setDisabled(true)
        renderBtns()
        global.dimensionsBox.setEditing(true)
        global.dimensionsBox.draw(currentDimensions)
        if (!dimensionRotatable) {
            dimensionRotatable = new BoxRotatable({
                app: global.app,
                dimensions: currentDimensions,
                onDragEnd: onBoxEndDrag,
            })
        } else {
            dimensionRotatable.setDragEnd(onBoxEndDrag)
        }
        dimensionRotatable.syncFromExternal(currentDimensions)
        global.rotationGizmo.enable(dimensionRotatable)
        events.fire('re-render:control-wrap')
    }
    function onCancel({ keepVisible = false } = {}) {
        if (!isEditing) return
        isEditing = false
        global.dimensionsBox.setEditing(false)
        setDisabled(false)

        if (isNewDimension) {
            isNewDimension = false
            currentDimensions = null
            editDimension = null
            settings.dimensions = null
            setAutoCalChecked(false)
            autoCalc = false
            lastChangedAxis = null
            lastInputAxisValue = null
            setDimConfigured(false)
            renderBtns()
            renderRealGroup()
            hideDimensions()
            global.rotationGizmo.disable()
            return
        }

        if (editDimension) setValues(editDimension)
        currentDimensions = { ...editDimension }
        renderBtns()
        renderRealGroup()
        if (keepVisible && currentDimensions) global.dimensionsBox.draw(currentDimensions)
        else hideDimensions()
        global.rotationGizmo.disable()
    }
    function setDimConfigured(has) {
        noDimRow.style.display = has ? 'none' : 'flex'
        hasDimWrap.style.display = has ? 'flex' : 'none'
    }
    function hideDimensions() {
        if (global.dimensionsBox && global.dimensionsBox.show) {
            global.dimensionsBox.hide()
            events.fire('re-render:control-wrap')
        }
        if (global.rotationGizmo) global.rotationGizmo.disable()
    }
    function onDimensionsChanged() {
        if (dimensionRotatable) {
            dimensionRotatable.syncFromExternal(currentDimensions)
        }
        global.dimensionsBox.draw(currentDimensions)
    }
    function onDimensionsConfigured() {
        if (currentDimensions === null) hideDimensions()
        else {
            if (!global.dimensionsBox) {
                const { app, camera, config } = global
                global.dimensionsBox = dimensionsSetup(app, camera, config)
            }
            if (dimensionRotatable) {
                dimensionRotatable.syncFromExternal(currentDimensions)
            }
            global.dimensionsBox.draw(currentDimensions)
            events.fire('re-render:control-wrap')
        }
    }
    const handles = [
        events.on('sidebar:active', () => onCancel({ keepVisible: true })),
        events.on('sidebar:clicked', ({ id }) => {
            onCancel({ keepVisible: true })
            if (id !== 'dimensions') return
            canUseMeasurementData = hasCalibrationData(settings.measurement?.calibration)
            setUseMeasurementChecked(currentDimensions?.useMeasurementData)
            renderRealGroup()
        }),
        events.on('setup-reset', () => hideDimensions()),
    ]
    el.cleanup = () => {
        handles.forEach((h) => events.offByHandle(h))
    }
}
