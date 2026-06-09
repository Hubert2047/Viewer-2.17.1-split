function makeDimensionSection(el, global) {
    const { events, settings } = global
    let isEditing = false
    let editDimension = settings.dimensions ?? null
    let currentDimensions = settings.dimensions ?? null
    // let currentBoxLocalPos = { x: 0, y: 0, z: 0 }
    // let prevRotation = { x: 0, y: 0, z: 0 }
    let canUseMeasurementData = hasCalibrationData(settings.measurement?.calibration)
    const container = document.createElement('div')
    container.classList.add('dimensions-wrap')

    // ── No dimension row ──
    const noDimRow = document.createElement('div')
    noDimRow.classList.add('no-dimensions-row')
    const noDimText = document.createElement('span')
    noDimText.textContent = 'No dimensions configured'
    noDimText.style.cssText = 'font-size:13px; color:rgb(140,159,180);'
    const addBtn = document.createElement('button')
    addBtn.classList.add('add-btn')
    addBtn.textContent = '+ Add'
    events.on('gizmo-rotation:drag-end', async () => {
        if (!isEditing) return
        const result = await getUpdateBoxSize(currentDimensions.rotation)
        currentDimensions = { ...currentDimensions, size: result.size, position: result.position }
        events.fire('dimensions:change', currentDimensions)
    })
    addBtn.onclick = async () => {
        await global.loading.show()

        const orientPose = settings.orientation.pose
        const orientQuat = orientPose
            ? new Quat(orientPose.rotation.x, orientPose.rotation.y, orientPose.rotation.z, orientPose.rotation.w)
            : new Quat(0, 0, 0, 1)
        const localPoints = getVisiblePoints(modelEntity, orientQuat)
        const count = localPoints.length / 3

        const result = await snapToFitOBBAsync(localPoints, getDimensionsRotation(localPoints))

        const invOrientQuat = orientQuat.clone().invert()

        const posInOriented = new Vec3(result.position.x, result.position.y, result.position.z)
        const posInLocal = new Vec3()
        invOrientQuat.transformVector(posInOriented, posInLocal)

        const snapQuat = new Quat().setFromEulerAngles(result.rotation.x, result.rotation.y, result.rotation.z)
        const finalQuat = new Quat().mul2(invOrientQuat, snapQuat)
        const finalEuler = finalQuat.getEulerAngles()

        global.loading.hide()

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
            size: result.size,
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
        setDimConfigured(true)
        setValues(currentDimensions)
        events.fire('dimensions:configured', currentDimensions)
        renderRealGroup()
        onEdit()
    }

    async function getUpdateBoxSize(rotation) {
        const points = getVisiblePoints(modelEntity)
        const result = await getBoxSize(points, rotation)
        return result
    }
    noDimRow.appendChild(noDimText)
    noDimRow.appendChild(addBtn)

    // ── Has dimension ──
    const hasDimWrap = makeSectionWrap()
    const displayGroup = makeSectionGroup('display')

    // Color picker
    const {
        setDisabled: setBoxColorDisabled,
        row: boxColorGroup,
        input: boxColorInput,
    } = makeColorPicker({
        label: 'Box Color',
        defaultValue: currentDimensions?.boxColor || '#ffffff',
        onChange: (color) => {
            currentDimensions = { ...currentDimensions, boxColor: color }
            events.fire('dimensions:change', currentDimensions)
            global.dataDirty = true
        },
    })
    const {
        setDisabled: setTextColorDisabled,
        row: textColor,
        input: textColorInput,
    } = makeColorPicker({
        label: 'Text Color',
        defaultValue: currentDimensions?.foregroundColor || '#ffffff',
        onChange: (color) => {
            currentDimensions = { ...currentDimensions, foregroundColor: color }
            events.fire('dimensions:change', currentDimensions)
            global.dataDirty = true
        },
    })

    const backgroundRow = makeRow({ title: 'Text Background', className: 'background-row' })
    const backgroundColor = makeColorAlpha({
        color: currentDimensions?.background.color || '#000000',
        alpha: currentDimensions?.background.alpha ?? 0.8,
        onChangeColor: (color) => {
            currentDimensions = { ...currentDimensions, background: { ...currentDimensions.background, color } }
            events.fire('dimensions:change', currentDimensions)
            global.dataDirty = true
        },
        onChangeAlpha: (alpha) => {
            currentDimensions = { ...currentDimensions, background: { ...currentDimensions.background, alpha } }
            events.fire('dimensions:change', currentDimensions)
            global.dataDirty = true
        },
    })
    backgroundRow.appendChild(backgroundColor)

    displayGroup.appendChild(boxColorGroup)
    displayGroup.appendChild(textColor)
    displayGroup.appendChild(backgroundRow)

    // ── Group 1: Box Transform ──
    // const boxGroup = makeSectionGroup('Box transform')
    // const {
    //     row: positionRow,
    //     setDisabled: setPosDisabled,
    //     setValues: setPosValues,
    // } = makeVec3Inputs({
    //     title: 'Position',
    //     step: 0.5,
    //     onFocus: () => {
    //         if (!currentDimensions) return
    //         currentBoxLocalPos = dimensionWorldToLocal(currentDimensions.position, currentDimensions.rotation)
    //         setPosValues(currentBoxLocalPos)
    //     },
    //     onChange: ({ x, y, z }) => {
    //         if (!isEditing) return
    //         currentBoxLocalPos = { x, y, z }
    //         currentDimensions = {
    //             ...currentDimensions,
    //             position: dimensionLocalToWorld({ x, y, z }, currentDimensions.rotation),
    //         }
    //         events.fire('dimensions:change', currentDimensions)
    //     },
    // })
    // events.on('dimensions:position-synced', ({ x, y, z }) => {
    //     currentBoxLocalPos = dimensionWorldToLocal({ x, y, z }, currentDimensions.rotation)
    //     setPosValues(currentBoxLocalPos)
    //     currentDimensions = { ...currentDimensions, position: { x, y, z } }
    //     events.fire('dimensions:change', currentDimensions)
    // })

    // const {
    //     row: rotationRow,
    //     setDisabled: setRotDisabled,
    //     setValues: setRotValues,
    // } = makeVec3Inputs({
    //     title: 'Rotation',
    //     step: 0.1,
    //     onFocus: () => {
    //         if (currentDimensions?.rotation) {
    //             prevRotation = { ...currentDimensions.rotation }
    //         }
    //     },
    //     onChange: async ({ x, y, z }) => {
    //         if (!isEditing) return

    //         const dx = x - prevRotation.x
    //         const dy = y - prevRotation.y
    //         const dz = z - prevRotation.z
    //         prevRotation = { x, y, z }

    //         const currRot = currentDimensions.rotation
    //         const qCurr = new Quat().setFromEulerAngles(currRot.x, currRot.y, currRot.z)
    //         const wx = new Vec3(1, 0, 0)
    //         qCurr.transformVector(wx, wx)
    //         const wy = new Vec3(0, 1, 0)
    //         qCurr.transformVector(wy, wy)
    //         const wz = new Vec3(0, 0, 1)
    //         qCurr.transformVector(wz, wz)

    //         const qx = new Quat().setFromAxisAngle(wx, dx)
    //         const qy = new Quat().setFromAxisAngle(wy, dy)
    //         const qz = new Quat().setFromAxisAngle(wz, dz)
    //         const qDelta = qy.mul(qx).mul(qz)

    //         const qNew = qDelta.mul(qCurr)

    //         const newEuler = qNew.getEulerAngles()
    //         currentDimensions = {
    //             ...currentDimensions,
    //             rotation: { x: newEuler.x, y: newEuler.y, z: newEuler.z },
    //         }

    //         prevRotation = { ...newEuler }
    //         setRotValues(newEuler)

    //         const result = await getUpdateBoxSize(currentDimensions.rotation)
    //         currentDimensions = { ...currentDimensions, size: result.size, position: result.position }
    //         events.fire('dimensions:change', currentDimensions)
    //     },
    // })
    // events.on('dimensions:eulersynced', ({ x, y, z }) => {
    //     setRotValues({ x, y, z })
    //     prevRotation = { x, y, z }
    //     currentDimensions = { ...currentDimensions, rotation: { x, y, z } }
    //     events.fire('dimensions:change', currentDimensions)
    // })

    // const {
    //     row: sizeRow,
    //     setDisabled: setSizeDisabled,
    //     setValues: setSizeValues,
    // } = makeVec3Inputs({
    //     title: 'Size',
    //     step: 0.1,
    //     onChange: ({ x, y, z }) => {
    //         if (!isEditing) return
    //         currentDimensions = { ...currentDimensions, size: { x, y, z } }
    //         events.fire('dimensions:change', currentDimensions)
    //     },
    // })
    // // ── Auto Fit row ──
    // const autoFitRow = makeRow('Auto Fit')
    // const autoFitBtn = makeButton({
    //     icon: ICONS.autoFit,
    //     title: 'Auto Fit',
    //     onClick: async () => {
    //         if (!currentDimensions || !isEditing) return
    //         await global.loading.show()
    //         const points = getVisiblePoints(modelEntity)
    //         const result = await snapToFitOBBAsync(points, currentDimensions.rotation, {
    //             maxIterations: 300,
    //             learningRate: 1,
    //             chunkSize: 50,
    //         })
    //         currentDimensions = {
    //             ...currentDimensions,
    //             ...result,
    //             ...result,
    //             ...result,
    //         }
    //         setValues(currentDimensions)
    //         events.fire('dimensions:change', currentDimensions)
    //         global.loading.hide()
    //     },
    // })
    // autoFitBtn.style.cssText = 'height:32px;'

    // autoFitRow.appendChild(autoFitBtn)

    // boxGroup.appendChild(positionRow)
    // boxGroup.appendChild(rotationRow)
    // boxGroup.appendChild(sizeRow)
    // boxGroup.appendChild(autoFitRow)
    // ── Group 2: Real Dimensions ──
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
            realUnitSelect.value = currentDimensions.unit
            setValues(currentDimensions)
            events.fire('dimensions:change', currentDimensions)
            global.dataDirty = true
            renderRealGroup()
        },
    })
    // ── Auto Calculate checkbox ──
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
    const realUnitSelect = makeSelect(
        ['mm', 'cm', 'm', 'inch'],
        settings.dimensions?.unit || 'cm',
        (v) => {
            currentDimensions = { ...currentDimensions, unit: v }
            events.fire('dimensions:change', currentDimensions)
            global.dataDirty = true
        },
        { name: 'unit', className: 'unit-select' },
    )
    const setRealUnitDisabled = (val) => {
        realUnitSelect.disabled = val
        realUnitSelect.classList.toggle('unit-select-disabled', val)
    }
    realUnitRow.appendChild(realUnitSelect)

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
        realSizeContent.appendChild(realUnitRow)
    }
    renderRealGroup()
    // ── Shared helpers ──
    const setValues = (dim) => {
        if (!dim) return
        // prevRotation = { ...dim.rotation }
        // currentBoxLocalPos = dimensionWorldToLocal(dim.position, dim.rotation)
        // setPosValues(currentBoxLocalPos)
        // setRotValues(dim.rotation)
        // setSizeValues(dim.size)
        setRealValues(dim.realSize)
        boxColorInput.value = dim.boxColor
        textColorInput.value = dim.foregroundColor
        realUnitSelect.value = dim.unit
        backgroundColor.setColor(dim.background.color)
        backgroundColor.setAlpha(dim.background.alpha)
    }

    const setDisabled = (on) => {
        // setPosDisabled(!on)
        // setRotDisabled(!on)
        // setSizeDisabled(!on)
        setRealDisabled(!on)
        setRealUnitDisabled(!on)
        setBoxColorDisabled(!on)
        setTextColorDisabled(!on)
        setUsMeasurementDisabled(!on)
        backgroundColor.setDisabled(!on)
        setAutoCalcDisabled(!on)
        // autoFitBtn.disabled = !on
    }

    // ── Buttons ──
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
    // hasDimWrap.appendChild(boxGroup)
    hasDimWrap.appendChild(displayGroup)
    hasDimWrap.appendChild(btnRow)

    // ── Toggle configured state ──
    const setDimConfigured = (has) => {
        noDimRow.style.display = has ? 'none' : 'flex'
        hasDimWrap.style.display = has ? 'flex' : 'none'
    }

    // ── Assemble ──
    container.appendChild(noDimRow)
    container.appendChild(hasDimWrap)
    el.appendChild(container)

    renderBtns()
    setDisabled(false)
    setDimConfigured(!!settings.dimensions)
    if (settings.dimensions) setValues(settings.dimensions)
    events.on('sidebar:active', () => onCancel())
    events.on('sidebar:clicked', ({ id }) => {
        onCancel()
        if (id !== 'dimensions') return
        canUseMeasurementData = hasCalibrationData(settings.measurement?.calibration)
        setUseMeasurementChecked(currentDimensions?.useMeasurementData)
        renderRealGroup()
    })
}
