function makeDimensionSection(el, global) {
    const { events, settings } = global
    let isEditing = false
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
                background: { color: 'white', alpha: 0.8 },
                foregroundColor: '#f95f4d',
                realSize: { x: 0, y: 0, z: 0 },
                unit: 'cm',
            }
            const finalDimension = {
                ...currentDimensions,
                position: { x: posInLocal.x, y: posInLocal.y, z: posInLocal.z },
                size,
                rotation: { x: finalEuler.x, y: finalEuler.y, z: finalEuler.z },
            }
            if (canUseMeasurementData) {
                finalDimension.useMeasurementData = true
                setUseMeasurementChecked(true)
            }
            global.dataDirty = true
            editDimension = { ...finalDimension }
            currentDimensions = { ...finalDimension }
            settings.dimensions = finalDimension
            if (settings.spin.enabled) {
                settings.spin = { ...settings.spin, axes: getSpinAxes(finalQuat) }
            }
            setDimConfigured(true)
            setValues(currentDimensions)
            events.fire('dimensions:configured', currentDimensions)
            renderRealGroup()
            onEdit()
        },
    })

    async function getUpdateBoxSize(rotation) {
        const points = getVisiblePoints({ modelEntity, removedSplats: settings.removedSplats })
        const result = await getBoxSize(points, rotation)
        return result
    }
    noDimRow.appendChild(noDimText)
    noDimRow.appendChild(addBtn)

    const hasDimWrap = makeSectionWrap()
    const displayGroup = makeSectionGroup('display')

    const { row: boxColorGroup, setDisabled: setBoxColorDisabled } = makeColorPickerDropdown({
        label: 'Box Color',
        color: currentDimensions?.boxColor || '#ffffff',
        debounceMs: 0,
        onChange: ({ hex }) => {
            currentDimensions = { ...currentDimensions, boxColor: hex }
            events.fire('dimensions:color-change', currentDimensions)
            global.dataDirty = true
        },
    })

    const { row: textColor, setDisabled: setTextColorDisabled } = makeColorPickerDropdown({
        label: 'Text Color',
        color: currentDimensions?.foregroundColor || '#ffffff',
        debounceMs: 0,
        onChange: ({ hex }) => {
            currentDimensions = { ...currentDimensions, foregroundColor: hex }
            events.fire('dimensions:color-change', currentDimensions)
            global.dataDirty = true
        },
    })

    const { row: backgroundColor, setDisabled: setBackgroundDisabled } = makeColorPickerDropdown({
        label: 'Text Background',
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
                const { realSize, unit } = settings.dimensions
                currentDimensions = { ...currentDimensions, realSize, unit }
            }
            currentDimensions.useMeasurementData = val
            realUnitSelect.setValue(currentDimensions.unit)
            setValues(currentDimensions)
            events.fire('dimensions:change', currentDimensions)
            global.dataDirty = true
            renderRealGroup()
        },
    })
    let autoCalc = false
    const {
        row: autoCalcRow,
        getValue: getAutoCalc,
        setDisabled: setAutoCalcDisabled,
        setChecked: setAutoCalChecked,
    } = makeCheckbox({
        label: 'Auto Calculate',
        checked: false,
        disabled: true,
        onChange: (val) => {
            autoCalc = val
        },
    })

    const realUnitRow = makeRow({ title: 'Unit' })
    const realUnitSelect = makeSelect({
        options: [
            { value: 'mm', label: 'mm' },
            { value: 'cm', label: 'cm' },
            { value: 'm', label: 'm' },
            { value: 'inch', label: 'inch' },
        ],
        value: settings.dimensions?.unit || 'cm',
        className: 'dimensions-unit',
        onChange: (v) => {
            currentDimensions = { ...currentDimensions, unit: v }
            events.fire('dimensions:change', currentDimensions)
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
        step: 0.1,
        onChange: ({ x, y, z, changedAxis }) => {
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
            events.fire('dimensions:change', currentDimensions)
        },
    })
    if (settings.dimensions) setRealValues(settings.dimensions.realSize)
    const renderRealGroup = () => {
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
    renderRealGroup()
    const setValues = (dim) => {
        if (!dim) return
        setRealValues(dim.realSize)
    }

    const setDisabled = (on) => {
        setRealDisabled(!on)
        realUnitSelect.setDisabled(!on)
        setBoxColorDisabled(!on)
        setTextColorDisabled(!on)
        setUsMeasurementDisabled(!on)
        setBackgroundDisabled(!on)
        setAutoCalcDisabled(!on)
    }

    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')

    const onEdit = () => {
        isEditing = true
        setDisabled(true)
        renderBtns()
        events.fire('dimensions:edit', currentDimensions)
    }

    const onCancel = () => {
        if (!isEditing) return
        isEditing = false
        setDisabled(false)
        if (editDimension) setValues(editDimension)
        currentDimensions = { ...editDimension }
        renderBtns()
        renderRealGroup()
        events.fire('dimensions:cancel')
    }

    const renderBtns = () => {
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
                    setDisabled(false)
                    renderBtns()
                    renderRealGroup()
                    events.fire('dimensions:save', currentDimensions)
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
                    setAutoCalChecked(false)
                    events.fire('dimensions:configured', null)
                    events.fire('dimensions:delete')
                    events.fire('re-render:control-wrap')
                },
            })

            btnRow.appendChild(btnEdit)
            btnRow.appendChild(btnDelete)
        }
    }

    hasDimWrap.appendChild(realGroup)
    hasDimWrap.appendChild(displayGroup)
    hasDimWrap.appendChild(btnRow)

    const setDimConfigured = (has) => {
        noDimRow.style.display = has ? 'none' : 'flex'
        hasDimWrap.style.display = has ? 'flex' : 'none'
    }

    container.appendChild(noDimRow)
    container.appendChild(hasDimWrap)
    el.appendChild(container)

    renderBtns()
    setDisabled(false)
    setDimConfigured(!!settings.dimensions)
    if (settings.dimensions) setValues(settings.dimensions)
    const handles = [
        events.on('sidebar:active', () => onCancel()),
        events.on('sidebar:clicked', ({ id }) => {
            onCancel()
            if (id !== 'dimensions') return
            canUseMeasurementData = hasCalibrationData(settings.measurement?.calibration)
            setUseMeasurementChecked(currentDimensions?.useMeasurementData)
            renderRealGroup()
        }),
        events.on('gizmo-rotation:drag-end', async () => {
            if (!isEditing) return
            const result = await getUpdateBoxSize(currentDimensions.rotation)
            currentDimensions = { ...currentDimensions, size: result.size, position: result.position }
            if (settings.spin.enabled) {
                const { x, y, z } = currentDimensions.rotation
                settings.spin = {
                    ...settings.spin,
                    axes: getSpinAxes(new Quat().setFromEulerAngles(x, y, z)),
                }
            }
            events.fire('dimensions:change', currentDimensions)
        }),
    ]
    el.cleanup = () => {
        handles.forEach((h) => events.offByHandle(h))
    }
}
