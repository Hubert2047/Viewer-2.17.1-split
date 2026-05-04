function makeHotspotSection(body, global, dom) {
    const editor = new HotspotEditorUI(body, { dom, global })
    editor.mount()
}
function makeSection({ id, title, body: renderBody, classname = '', events, icon }) {
    const section = document.createElement('div')
    section.classList.add('section')

    const header = document.createElement('div')
    header.classList.add('section-header')

    if (icon) {
        const iconEl = document.createElement('span')
        iconEl.classList.add('section-icon-prefix')
        iconEl.innerHTML = icon
        header.appendChild(iconEl)
    }

    const titleEl = document.createElement('span')
    titleEl.classList.add('section-title')
    titleEl.textContent = title

    const chevron = document.createElement('span')
    chevron.classList.add('section-icon')

    header.appendChild(titleEl)
    header.appendChild(chevron)

    const body = document.createElement('div')
    body.classList.add('section-body', classname)
    body.id = `sidebar-section-${id}`
    body.dataset.sidebarBody = id
    chevron.dataset.sidebarChevron = id

    renderBody(body)
    body.style.display = 'none'

    const open = () => {
        document.querySelectorAll('[data-sidebar-body]').forEach((el) => {
            el.style.display = 'none'
        })
        document.querySelectorAll('[data-sidebar-chevron]').forEach((el) => {
            el.style.transform = ''
        })
        document.querySelectorAll('.section-header').forEach((el) => {
            el.classList.remove('active')
        })

        body.style.display = 'flex'
        chevron.style.transform = 'rotate(90deg)'
        header.classList.add('active')
    }

    const toggle = () => {
        const isOpen = body.style.display !== 'none'
        events.fire('sidebar:clicked', { id, open: !isOpen })
        if (isOpen) {
            body.style.display = 'none'
            chevron.style.transform = ''
            header.classList.remove('active')
            return
        }

        open()
    }

    header.addEventListener('click', toggle)

    events.on('sidebar:active', (activeId) => {
        if (activeId === id) {
            open()
        }
    })

    section.appendChild(header)
    section.appendChild(body)

    return section
}
function makePivotGroup(global, editGroup) {
    const { events, settings } = global
    const group = makeSectionGroup('Pivot Point')
    editGroup.register('pivot', {
        cancel: () => {
            onCancel()
        },
    })
    events.on('inputEvent:reset', () => onCancel())
    let editPivotPos = settings.pivot.position
    let currrentPivotPos = null
    let isEditing = false
    const container = document.createElement('div')
    container.classList.add('pivot-wrap')
    const {
        row: positionRow,
        setDisabled: setInputsDisabled,
        setValues: setInputValues,
    } = makeVec3Inputs({
        title: 'Position',
        disabled: true,
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            events.fire('pivot:positionsynced', { x, y, z })
        },
    })
    if (settings.pivot.position) {
        setInputValues(settings.pivot.position)
    }
    const noPivotRow = document.createElement('div')
    noPivotRow.classList.add('no-pivot-row')
    const noPivotText = document.createElement('span')
    noPivotText.textContent = 'No pivot configured'
    noPivotText.style.cssText = 'font-size:13px; color:rgb(140,159,180);'
    const addBtn = document.createElement('button')
    addBtn.classList.add('add-btn')
    addBtn.textContent = '+ Add'
    addBtn.onclick = () => {
        const localCenter = getPivotCenter(modelEntity)
        settings.pivot.position = { x: localCenter.x, y: localCenter.y, z: localCenter.z }
        setPivotConfigured(true)
        editPivotPos = localCenter
        events.fire('pivot:positionsynced', localCenter)
    }
    noPivotRow.appendChild(noPivotText)
    noPivotRow.appendChild(addBtn)

    const hasPivotWrap = document.createElement('div')
    hasPivotWrap.classList.add('pivot-row')

    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')

    const onEdit = ({ x, y, z }) => {
        currrentPivotPos = { x, y, z }
        editGroup.startEdit('pivot')
        isEditing = true
        editPivotPos = { x, y, z }
        setInputsDisabled(false)
        renderBtns()
        events.fire('pivot:enable-edit', { position: { x, y, z }, enable: true })
    }
    const onCancel = () => {
        if (!isEditing) return
        setInputsDisabled(true)
        if (editPivotPos) {
            events.fire('pivot:positionsynced', editPivotPos)
        }
        events.fire('pivot:cancel')
        isEditing = false
        renderBtns()
    }
    const renderBtns = () => {
        btnRow.innerHTML = ''
        if (isEditing) {
            const btnCancel = makeButton({ title: 'Cancel', className: 'cancel-btn', onClick: onCancel })
            const btnSave = makeButton({
                title: 'Apply',
                className: 'confirm-btn',
                onClick: () => {
                    const { x, y, z } = currrentPivotPos
                    editPivotPos = { x, y, z }
                    settings.pivot.position = { x, y, z }
                    isEditing = false
                    setInputsDisabled(true)
                    renderBtns()
                    events.fire('pivot:save')
                },
            })

            btnRow.appendChild(btnCancel)
            btnRow.appendChild(btnSave)
        } else {
            const btnEdit = makeButton({ title: 'Edit', className: 'edit-btn', onClick: () => onEdit(editPivotPos) })
            const btnDelete = makeButton({
                title: 'Delete',
                icon: ICONS.trash,
                className: 'delete-btn',
                onClick: () => {
                    editPivotPos = null
                    currrentPivotPos = null
                    setPivotConfigured(false)
                    events.fire('pivot:delete')
                    renderBtns()
                },
            })

            btnRow.appendChild(btnEdit)
            btnRow.appendChild(btnDelete)
        }
    }

    hasPivotWrap.appendChild(positionRow)
    hasPivotWrap.appendChild(btnRow)

    const setPivotConfigured = (has) => {
        noPivotRow.style.display = has ? 'none' : 'flex'
        hasPivotWrap.style.display = has ? 'flex' : 'none'
    }

    events.on('pivot:positionsynced', ({ x, y, z }) => {
        setInputValues({ x, y, z })
        currrentPivotPos = { x, y, z }
    })

    if (settings.pivotPos) {
        const p = settings.pivotPos
        setInputValues({ x: p.x, y: p.y, z: p.z })
    }

    container.appendChild(noPivotRow)
    container.appendChild(hasPivotWrap)
    group.appendChild(container)

    renderBtns()
    setPivotConfigured(!!settings.pivot.position)
    return group
}
function makeModelSection(el, global) {
    const { settings, events } = global
    const step = settings.setupStep
    const isHemi = settings.model === 'hemispherical'
    const editGroup = makeEditGroup(events, ['sidebar:active', 'sidebar:clicked'])
    const container = makeSectionWrap()

    if (isHemi && step === 1) {
        container.appendChild(makeOrientationGroup(global, editGroup))
        container.appendChild(makeCameraLimitsGroup(global, editGroup))
    }

    const isPivotStep = (isHemi && step === 2) || (!isHemi && step === 1)
    if (isPivotStep) {
        container.appendChild(makePivotGroup(global, editGroup))
    }

    el.appendChild(container)
}
function makeInitViewGroup(events, settings) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:8px;'

    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')

    const btnSave = document.createElement('button')
    btnSave.classList.add('btn', 'initview-btn')
    btnSave.textContent = 'Save current view'
    function updateState(hasPose) {
        if (hasPose) {
            btnSave.classList.add('active')
            btnDefault.classList.remove('active')
        } else {
            btnDefault.classList.add('active')
            btnSave.classList.remove('active')
        }
    }

    btnSave.onclick = () => {
        events.fire('viewer:save-initview')
        updateState(true)
    }

    const btnDefault = document.createElement('button')
    btnDefault.classList.add('btn', 'initview-btn')
    btnDefault.textContent = 'Default view'
    btnDefault.onclick = () => {
        updateState(false)
        if (!settings.initview.pose) return
        events.fire('viewer:remove-saved-view')
    }

    btnRow.appendChild(btnSave)
    btnRow.appendChild(btnDefault)
    updateState(!!settings.initview.pose)

    wrap.appendChild(btnRow)
    return wrap
}
function makeViewerSection(el, global) {
    const { settings, events } = global
    const container = makeSectionWrap()

    const generalGroup = makeSectionGroup('General')

    const { row: backgroundColor } = makeColorPicker({
        label: 'Background',
        defaultValue: settings.background.color,
        onChange: (color) => {
            settings.background.color = color
            events.fire('viewer:background-changed', color)
        },
    })

    const inertiaRow = makeRow('Inertia')
    const inertiaToggleEl = makeToggle(settings.inertia, (value) => {
        settings.inertia = value
        events.fire('viewer:inertia', value)
    })
    inertiaRow.appendChild(inertiaToggleEl)

    const autoHideUIRow = makeRow('Auto Hide UI')
    const autoHideUIToggleEl = makeToggle(settings.autoHideUI, (value) => {
        settings.autoHideUI = value
        events.fire('viewer:auto-hide-ui', value)
    })
    autoHideUIRow.appendChild(autoHideUIToggleEl)

    const lockZoomInRow = makeRow('Lock Zoom In')
    const lockZoomInToggleEl = makeToggle(settings.lockZoomIn.locked, (value) => {
        events.fire('viewer:lock-zoom-in', value)
    })
    lockZoomInRow.appendChild(lockZoomInToggleEl)

    generalGroup.appendChild(backgroundColor)
    generalGroup.appendChild(inertiaRow)
    generalGroup.appendChild(autoHideUIRow)
    generalGroup.appendChild(lockZoomInRow)

    const initviewHint =
        'Set the camera angle that viewers see when the model first loads. Rotate to your preferred angle, then click Save current view. Click Default view to reset.'
    const initviewGroup = makeSectionGroup('Initial View', initviewHint)
    initviewGroup.appendChild(makeInitViewGroup(events, settings))

    container.appendChild(generalGroup)
    container.appendChild(initviewGroup)

    el.appendChild(container)
}
function makeDimensionSection(el, global) {
    const { events, settings } = global
    events.on('sidebar:active', () => onCancel())
    events.on('sidebar:clicked', () => onCancel())
    let isEditing = false
    let editDimension = settings.dimensions ?? null
    let currentDimensions = settings.dimensions ?? null
    let currentBoxLocalPos = { x: 0, y: 0, z: 0 }
    let prevRotation = { x: 0, y: 0, z: 0 }

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

    addBtn.onclick = async () => {
        await global.loading.show()
        const points = getVisiblePoints(modelEntity)
        const result = await snapToFitOBBAsync(points, getDimensionsRotation(points), {
            maxIterations: 10000,
            learningRate: 0.01,
            chunkSize: 50,
        })
        currentDimensions = {
            boxColor: '#f95f4d',
            background: { color: 'white', alpha: 0.8 },
            foregroundColor: '#f95f4d',
            realSize: { x: 0, y: 0, z: 0 },
            unit: 'cm',
        }
        global.loading.hide()
        editDimension = { ...currentDimensions, ...result }
        currentDimensions = { ...currentDimensions, ...result }
        settings.dimensions = editDimension
        prevRotation = { ...currentDimensions.rotation }
        setDimConfigured(true)
        setValues(currentDimensions)
        events.fire('dimensions:configured', currentDimensions)
    }

    events.on('gizmo-rotation:drag-end', async () => {
        if (!currentDimensions || !isEditing) return
        const result = await getUpdateBoxSize(currentDimensions.rotation)
        currentDimensions = { ...currentDimensions, size: result.size, position: result.position }
        setValues(currentDimensions)
        events.fire('dimensions:change', currentDimensions)
    })

    async function getUpdateBoxSize(rotation) {
        const points = getVisiblePoints(modelEntity)
        const result = await snapToFitOBBAsync(points, rotation, {
            maxIterations: 0,
        })
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
        },
    })

    const backgroundRow = makeRow('Text Background', 'background-row')
    const backgroundColor = makeColorAlpha({
        color: currentDimensions?.background.color || '#000000',
        alpha: currentDimensions?.background.alpha ?? 0.8,
        onChangeColor: (color) => {
            currentDimensions = { ...currentDimensions, background: { ...currentDimensions.background, color } }
            events.fire('dimensions:change', currentDimensions)
        },
        onChangeAlpha: (alpha) => {
            currentDimensions = { ...currentDimensions, background: { ...currentDimensions.background, alpha } }
            events.fire('dimensions:change', currentDimensions)
        },
    })
    backgroundRow.appendChild(backgroundColor)

    displayGroup.appendChild(boxColorGroup)
    displayGroup.appendChild(textColor)
    displayGroup.appendChild(backgroundRow)

    // ── Group 1: Box Transform ──
    const boxGroup = makeSectionGroup('Box transform')
    const {
        row: positionRow,
        setDisabled: setPosDisabled,
        setValues: setPosValues,
    } = makeVec3Inputs({
        title: 'Position',
        step: 0.5,
        onFocus: () => {
            if (!currentDimensions) return
            currentBoxLocalPos = dimensionWorldToLocal(currentDimensions.position, currentDimensions.rotation)
            setPosValues(currentBoxLocalPos)
        },
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            currentBoxLocalPos = { x, y, z }
            currentDimensions = {
                ...currentDimensions,
                position: dimensionLocalToWorld({ x, y, z }, currentDimensions.rotation),
            }
            events.fire('dimensions:change', currentDimensions)
        },
    })
    events.on('dimensions:position-synced', ({ x, y, z }) => {
        currentBoxLocalPos = dimensionWorldToLocal({ x, y, z }, currentDimensions.rotation)
        setPosValues(currentBoxLocalPos)
        currentDimensions = { ...currentDimensions, position: { x, y, z } }
        events.fire('dimensions:change', currentDimensions)
    })

    const {
        row: rotationRow,
        setDisabled: setRotDisabled,
        setValues: setRotValues,
    } = makeVec3Inputs({
        title: 'Rotation',
        step: 0.5,
        onFocus: () => {
            if (currentDimensions?.rotation) {
                prevRotation = { ...currentDimensions.rotation }
            }
        },
        onChange: async ({ x, y, z }) => {
            if (!isEditing) return

            const dx = x - prevRotation.x
            const dy = y - prevRotation.y
            const dz = z - prevRotation.z
            prevRotation = { x, y, z }

            const currRot = currentDimensions.rotation
            const qCurr = new Quat().setFromEulerAngles(currRot.x, currRot.y, currRot.z)
            const wx = new Vec3(1, 0, 0)
            qCurr.transformVector(wx, wx)
            const wy = new Vec3(0, 1, 0)
            qCurr.transformVector(wy, wy)
            const wz = new Vec3(0, 0, 1)
            qCurr.transformVector(wz, wz)

            const qx = new Quat().setFromAxisAngle(wx, dx)
            const qy = new Quat().setFromAxisAngle(wy, dy)
            const qz = new Quat().setFromAxisAngle(wz, dz)
            const qDelta = qy.mul(qx).mul(qz)

            const qNew = qDelta.mul(qCurr)

            const newEuler = qNew.getEulerAngles()
            currentDimensions = {
                ...currentDimensions,
                rotation: { x: newEuler.x, y: newEuler.y, z: newEuler.z },
            }

            prevRotation = { ...newEuler }
            setRotValues(newEuler)

            const result = await getUpdateBoxSize(currentDimensions.rotation)
            currentDimensions = { ...currentDimensions, size: result.size, position: result.position }
            events.fire('dimensions:change', currentDimensions)
        },
    })
    events.on('dimensions:eulersynced', ({ x, y, z }) => {
        setRotValues({ x, y, z })
        prevRotation = { x, y, z }
        currentDimensions = { ...currentDimensions, rotation: { x, y, z } }
        events.fire('dimensions:change', currentDimensions)
    })

    const {
        row: sizeRow,
        setDisabled: setSizeDisabled,
        setValues: setSizeValues,
    } = makeVec3Inputs({
        title: 'Size',
        step: 0.5,
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            currentDimensions = { ...currentDimensions, size: { x, y, z } }
            events.fire('dimensions:change', currentDimensions)
        },
    })
    // ── Auto Fit row ──
    const autoFitRow = makeRow('Auto Fit')
    const autoFitBtn = makeButton({
        icon: ICONS.autoFit,
        title: 'Auto Fit',
        onClick: async () => {
            if (!currentDimensions || !isEditing) return
            await global.loading.show()
            const points = getVisiblePoints(modelEntity)
            const result = await snapToFitOBBAsync(points, currentDimensions.rotation, {
                maxIterations: 300,
                learningRate: 1,
                chunkSize: 50,
            })
            currentDimensions = {
                ...currentDimensions,
                ...result,
                ...result,
                ...result,
            }
            setValues(currentDimensions)
            events.fire('dimensions:change', currentDimensions)
            global.loading.hide()
        },
    })
    autoFitBtn.style.cssText = 'height:32px;'

    autoFitRow.appendChild(autoFitBtn)

    boxGroup.appendChild(positionRow)
    boxGroup.appendChild(rotationRow)
    boxGroup.appendChild(sizeRow)
    boxGroup.appendChild(autoFitRow)
    // ── Group 2: Real Dimensions ──
    const realGroup = makeSectionGroup('Real dimensions')

    const realUnitRow = makeRow('Unit')
    const realUnitSelect = makeSelect(
        ['mm', 'cm', 'm', 'inch'],
        settings.dimensions?.unit || 'cm',
        (v) => {
            currentDimensions = { ...currentDimensions, unit: v }
            events.fire('dimensions:change', currentDimensions)
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
    } = makeVec3Inputs({
        title: 'Size',
        step: 0.5,
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            currentDimensions = { ...currentDimensions, realSize: { x, y, z } }
            events.fire('dimensions:change', currentDimensions)
        },
    })
    if (settings.dimensions) setRealValues(settings.dimensions.realSize)
    realGroup.appendChild(realSizeRow)
    realGroup.appendChild(realUnitRow)

    // ── Shared helpers ──
    const setValues = (dim) => {
        if (!dim) return
        prevRotation = { ...dim.rotation }
        currentBoxLocalPos = dimensionWorldToLocal(dim.position, dim.rotation)
        setPosValues(currentBoxLocalPos)
        setRotValues(dim.rotation)
        setSizeValues(dim.size)
        setRealValues(dim.realSize)
        boxColorInput.value = dim.boxColor
        textColorInput.value = dim.foregroundColor
        realUnitSelect.value = dim.unit
        backgroundColor.setColor(dim.background.color)
        backgroundColor.setAlpha(dim.background.alpha)
    }

    const setDisabled = (on) => {
        setPosDisabled(!on)
        setRotDisabled(!on)
        setSizeDisabled(!on)
        setRealDisabled(!on)
        setRealUnitDisabled(!on)
        setBoxColorDisabled(!on)
        setTextColorDisabled(!on)
        backgroundColor.setDisabled(!on)
        autoFitBtn.disabled = !on
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
        events.fire('dimensions:cancel')
    }

    const renderBtns = () => {
        btnRow.innerHTML = ''
        if (isEditing) {
            const btnCancel = makeButton({ title: 'Cancel', className: 'cancel-btn', onClick: onCancel })
            const btnApply = makeButton({
                title: 'Apply',
                className: 'confirm-btn',
                onClick: () => {
                    editDimension = { ...currentDimensions }
                    settings.dimensions = { ...currentDimensions }
                    isEditing = false
                    setDisabled(false)
                    renderBtns()
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
                onClick: () => {
                    settings.dimensions = null
                    settings.measurement = JSON.parse(JSON.stringify(defaultSettings.measurement))
                    editDimension = null
                    currentDimensions = null
                    setDimConfigured(false)
                    events.fire('dimensions:configured', null)
                },
            })

            btnRow.appendChild(btnEdit)
            btnRow.appendChild(btnDelete)
        }
    }

    hasDimWrap.appendChild(displayGroup)
    hasDimWrap.appendChild(boxGroup)
    hasDimWrap.appendChild(realGroup)
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
}
function makeMeasurementSection(el, global) {
    if (!global.settings.measurement) {
        global.settings.measurement = {
            enabled: false,
            lineColor: '#f95f4d',
            textColor: '#fff',
            background: {
                color: '#000000A6',
                alpha: 0.8,
            },
        }
    }
    const {
        settings: { measurement },
        events,
    } = global
    const measurementGroup = makeSectionGroup()
    // ── Measurement toggle ──
    const measureToggleRow = makeRow('Enabled')
    const measureToggleEl = makeToggle(measurement?.enabled, (value) => {
        if (measureToggleEl.classList.contains('disabled')) return
        measureToggleEl.classList.toggle('active', value)
        measurement.enabled = value
        events.fire('ui:re-render-control-wrap')
        if (!value && global.measureTool) global.measureTool.deactivate()
    })
    measureToggleRow.appendChild(measureToggleEl)

    // ── Measurement color row ──
    const { row: lineColor } = makeColorPicker({
        label: 'Line Color',
        defaultValue: measurement.lineColor,
        onChange: (color) => {
            measurement.lineColor = color
            if (global.measureTool) global.measureTool.setConfig(measurement)
        },
    })
    const { row: textColor } = makeColorPicker({
        label: 'Text Color',
        defaultValue: measurement.textColor,
        onChange: (color) => {
            measurement.textColor = color
            if (global.measureTool) global.measureTool.setConfig(measurement)
        },
    })
    const backgroundRow = makeRow('Text Background', 'background-row')
    const backgroundColor = makeColorAlpha({
        color: measurement.background.color,
        alpha: measurement.background.alpha,
        onChangeColor: (color) => {
            measurement.background.color = color
            if (global.measureTool) global.measureTool.setConfig(measurement)
        },
        onChangeAlpha: (alpha) => {
            measurement.background.alpha = alpha
            if (global.measureTool) global.measureTool.setConfig(measurement)
        },
    })
    backgroundRow.appendChild(backgroundColor)

    measurementGroup.appendChild(measureToggleRow)
    measurementGroup.appendChild(lineColor)
    measurementGroup.appendChild(textColor)
    measurementGroup.appendChild(backgroundRow)

    el.appendChild(measurementGroup)
}
function makeExportSection(el, global) {
    const hint = document.createElement('p')
    hint.textContent = 'Please put the exported HTML file in the current folder.'
    hint.classList.add('export-hint')

    const edgeStepsData = {
        title: 'To change your downloads folder location in Microsoft Edge:',
        items: [
            'Open Microsoft Edge, then select **Settings and more** ··· > **Settings**.',
            'Select **Downloads**, then enable **Ask where to save each file before downloading**.',
        ],
    }
    const chromeStepsData = {
        title: 'You can choose a location on your computer where downloads should be saved by default or pick a specific destination for each download.',
        items: [
            'On your computer, open Chrome.',
            'At the top right, click More  ⋮  > **Settings** > **Downloads**.',
            'Enable **Ask where to save each file before downloading**.',
        ],
    }
    const firefoxStepsData = {
        title: 'To change your downloads folder location in Firefox:',
        items: [
            'Open Firefox on your computer.',
            'Click the menu button ☰ at the top right, then select **Settings**.',
            'In the **General** panel, scroll down until you see the **Downloads** section.',
            'Enable **Always ask you where to save files**.',
        ],
    }
    let tabs = null
    const helperBtn = makeLink({
        text: 'Export Location Change Helper',
        onClick: (e) => {
            e.preventDefault()
            if (!tabs) {
                tabs = makeTabs({
                    tabs: [
                        {
                            label: 'Chrome',
                            content: () => makeDownloadHelper(chromeStepsData),
                        },
                        {
                            label: 'Firefox',
                            content: () => makeDownloadHelper(firefoxStepsData),
                        },
                        {
                            label: 'Microsoft Edge',
                            content: () => makeDownloadHelper(edgeStepsData),
                        },
                    ],
                    width: 800,
                    height: 350,
                })
            }
            global.modal.open('Export Location Change Helper', tabs, 'top', {
                showCancel: false,
            })
        },
    })
    el.appendChild(helperBtn)
    el.appendChild(hint)
    const btn = makeButton({
        className: 'export-btn',
        title: 'Export HTML',
        onClick: () => {
            const filename = 'index.html'
            exportHtml(filename, global.settings)
        },
    })
    el.appendChild(btn)
}
function makeSidebar(global, dom) {
    const { events } = global
    const SIDEBAR_WIDTH = '360px'
    const isHemi = global.settings.model === 'hemispherical'
    const totalSteps = isHemi ? 3 : 2
    const minStep = 1

    if (!global.settings.setupStep) global.settings.setupStep = 1

    const sidebar = document.createElement('div')
    sidebar.id = 'app-sidebar'
    sidebar.classList.add('sidebar')
    sidebar.style.cssText = `width: ${SIDEBAR_WIDTH}`
    sidebar.style.visibility = 'hidden'

    const header = document.createElement('div')
    header.classList.add('sidebar-header')

    const headerTitle = document.createElement('span')
    headerTitle.textContent = 'Settings'
    headerTitle.style.flex = '1'
    header.appendChild(headerTitle)

    const stepBadge = document.createElement('span')
    stepBadge.classList.add('step-badge')
    header.appendChild(stepBadge)

    const backBtn = makeButton({
        className: 'back-btn',
        title: 'Back',
        onClick: () => {
            if (global.settings.setupStep > minStep) {
                if (isHemi && global.settings.setupStep === 2) {
                    events.fire('pivot:delete')
                }
                global.settings.setupStep--
                renderStep()
            }
        },
    })
    header.appendChild(backBtn)

    const nextBtn = makeButton({
        className: 'next-btn',
        title: 'Next',
        onClick: () => {
            if (global.settings.setupStep < totalSteps) {
                global.settings.setupStep++
                renderStep()
            }
        },
    })
    header.appendChild(nextBtn)

    const resetBtn = makeButton({
        className: 'reset-setup-btn',
        title: '↺ Reset Model Setup',
        onClick: async () => {
            const ok = await global.confirmDialog.ask(
                'Reset Model Setup',
                'All your settings will be permanently cleared and you will start over from the beginning.',
                'delete',
                'top',
                'Reset',
            )
            if (ok) {
                Object.assign(global.settings, JSON.parse(JSON.stringify(defaultSettings)), {
                    setupStep: 1,
                    contentUrl: global.settings.contentUrl,
                    base64: global.settings.base64,
                    model: global.settings.model,
                    v: global.settings.v,
                })
                events.fire('setup-reset', global.settings)
                renderStep()
            }
        },
    })
    header.appendChild(resetBtn)

    sidebar.appendChild(header)

    const progressWrap = document.createElement('div')
    progressWrap.classList.add('step-progress')
    const segs = []
    for (let i = 1; i <= totalSteps; i++) {
        const seg = document.createElement('div')
        seg.classList.add('step-progress-seg')
        progressWrap.appendChild(seg)
        segs.push(seg)
    }
    sidebar.appendChild(progressWrap)

    const contentArea = document.createElement('div')
    sidebar.appendChild(contentArea)

    document.body.appendChild(sidebar)
    const canvas = global.app.graphicsDevice.canvas
    canvas.style.width = `calc(100% - ${SIDEBAR_WIDTH})`
    document.getElementById('ui').style.width = `calc(100% - ${SIDEBAR_WIDTH})`

    const updateProgress = () => {
        segs.forEach((seg, i) => {
            seg.classList.toggle('done', i < global.settings.setupStep)
        })
    }

    const isFinalStep = () => global.settings.setupStep === totalSteps

    const renderModelStep = () => {
        contentArea.appendChild(
            makeSection({
                id: 'model',
                title: 'Model',
                classname: 'model-section',
                body: (el) => makeModelSection(el, global),
                events,
            }),
        )
        contentArea.appendChild(
            makeSection({
                id: 'export',
                title: 'Export',
                classname: 'export-section',
                body: (el) => makeExportSection(el, global),
                events,
            }),
        )
        setTimeout(() => events.fire('sidebar:active', 'model'), 0)
    }

    const renderFullStep = () => {
        contentArea.appendChild(
            makeSection({
                id: 'settings',
                title: 'Viewer',
                classname: 'viewer-setting-section',
                body: (el) => makeViewerSection(el, global),
                events,
            }),
        )
        contentArea.appendChild(
            makeSection({
                id: 'hotspot',
                title: 'Hotspots',
                classname: 'hotspot-section',
                body: (el) => makeHotspotSection(el, global, dom),
                events,
            }),
        )
        contentArea.appendChild(
            makeSection({
                id: 'dimension',
                title: 'Dimensions',
                classname: 'dimension-section',
                body: (el) => makeDimensionSection(el, global, dom),
                events,
            }),
        )
        const measurementContainer = document.createElement('div')
        contentArea.appendChild(measurementContainer)

        // const renderMeasurementSection = () => {
        //     measurementContainer.innerHTML = ''
        //     if (global.settings.dimensions) {
        //         measurementContainer.appendChild(
        //             makeSection({
        //                 id: 'measurement',
        //                 title: 'Measurement',
        //                 classname: 'measurement-section',
        //                 body: (el) => makeMeasurementSection(el, global),
        //                 events,
        //             }),
        //         )
        //     }
        // }

        // if (global.settings.measurement) renderMeasurementSection()
        // events.on('dimensions:configured', () => {
        //     renderMeasurementSection()
        // })

        contentArea.appendChild(
            makeSection({
                id: 'export',
                title: 'Export',
                classname: 'export-section',
                body: (el) => makeExportSection(el, global),
                events,
            }),
        )
    }

    const renderStep = () => {
        const step = global.settings.setupStep
        contentArea.innerHTML = ''
        contentArea.classList.remove('step-content-enter')
        void contentArea.offsetWidth
        contentArea.classList.add('step-content-enter')
        updateProgress()

        if (isFinalStep()) {
            stepBadge.style.display = 'none'
            backBtn.style.display = 'none'
            nextBtn.style.display = 'none'
            progressWrap.style.display = 'none'
            resetBtn.style.display = 'inline-flex'
            renderFullStep()
        } else {
            stepBadge.textContent = `Step ${step} / ${totalSteps}`
            stepBadge.style.display = ''
            backBtn.style.display = step > minStep ? 'inline-flex' : 'none'
            nextBtn.textContent = 'Next'
            nextBtn.style.display = 'inline-flex'
            progressWrap.style.display = 'flex'
            resetBtn.style.display = 'none'
            renderModelStep()
        }
    }

    renderStep()
    return sidebar
}
