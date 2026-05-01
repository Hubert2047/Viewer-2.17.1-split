function initHotspotSection(body, global, dom) {
    const editor = new HotspotEditorUI(body, { dom, global })
    editor.mount()
}
function createSection({ id, title, body: renderBody, classname = '', events, icon }) {
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

    events.on('hotspot:active', (activeId) => {
        if (activeId === id) {
            open()
        }
    })

    section.appendChild(header)
    section.appendChild(body)

    return section
}

function renderPivot(group, global, editGroup) {
    const { events, settings } = global
    editGroup.register('pivot', {
        cancel: () => {
            onCancel()
        },
    })
    events.on('hotspot:active', () => onCancel())
    events.on('sidebar:clicked', () => onCancel())
    events.on('inputEvent:reset', () => onCancel())
    let editPivotPos = settings.pivot.position
    let currrentPivotPos = null
    let isEditing = false
    const container = document.createElement('div')
    container.classList.add('pivot-wrap')
    const {
        row: positionRow,
        setEditable: setInputsEditable,
        setValues: setInputValues,
    } = createVec3Inputs({
        title: 'Position',
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
        setInputsEditable(true)
        renderBtns()
        events.fire('pivot:enable-edit', { position: { x, y, z }, enable: true })
    }
    const onCancel = () => {
        if (!isEditing) return
        setInputsEditable(false)
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
            const btnCancel = document.createElement('button')
            btnCancel.classList.add('btn', 'cancel-btn')
            btnCancel.textContent = 'Cancel'
            btnCancel.onclick = onCancel
            const btnSave = document.createElement('button')
            btnSave.classList.add('btn', 'confirm-btn')
            btnSave.textContent = 'Apply'
            btnSave.onclick = () => {
                const { x, y, z } = currrentPivotPos
                editPivotPos = { x, y, z }
                settings.pivot.position = { x, y, z }
                isEditing = false
                setInputsEditable(false)
                renderBtns()
                events.fire('pivot:save')
            }
            btnRow.appendChild(btnCancel)
            btnRow.appendChild(btnSave)
        } else {
            const btnEdit = document.createElement('button')
            btnEdit.classList.add('btn')
            btnEdit.textContent = 'Edit'
            btnEdit.onclick = () => onEdit(editPivotPos)

            const btnDelete = document.createElement('button')
            btnDelete.classList.add('btn', 'delete-btn')
            btnDelete.title = 'Delete'
            btnDelete.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1.5 3.5h10M5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M10.5 3.5l-.7 7a.5.5 0 0 1-.5.5H3.7a.5.5 0 0 1-.5-.5l-.7-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M5 6v3M8 6v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>`
            btnDelete.onclick = () => {
                settings.pivot.position = null
                editPivotPos = null
                currrentPivotPos = null
                setPivotConfigured(false)
                events.fire('pivot:delete')
                renderBtns()
            }

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
}
function modelSection(el, global) {
    const { settings } = global
    const step = settings.setupStep
    const isHemi = settings.model === 'hemispherical'
    const editGroup = createEditGroup(global.events)
    const container = document.createElement('div')
    container.classList.add('section-wrap')

    if (isHemi && step === 1 && settings.model !== 'spherical') {
        const orientationGroup = document.createElement('div')
        orientationGroup.classList.add('section-group')
        const orientationTitle = document.createElement('div')
        orientationTitle.classList.add('section-group-title')
        orientationTitle.textContent = 'transform'
        orientationGroup.appendChild(orientationTitle)

        const { cameraLimitsGroup } = renderOrientation(orientationGroup, global, editGroup)

        container.appendChild(orientationGroup)
        container.appendChild(cameraLimitsGroup)
    }

    const isPivotStep = (isHemi && step === 2) || (!isHemi && step === 1)
    if (isPivotStep) {
        const pivotGroup = document.createElement('div')
        pivotGroup.classList.add('section-group')
        const pivotTitle = document.createElement('div')
        pivotTitle.classList.add('section-group-title')
        pivotTitle.textContent = 'Pivot Point'
        pivotGroup.appendChild(pivotTitle)
        renderPivot(pivotGroup, global, editGroup)
        container.appendChild(pivotGroup)
    }

    el.appendChild(container)
}
function viewerSettingsSection(el, global) {
    const settings = global.settings
    const container = document.createElement('div')
    container.classList.add('section-wrap')
    global.events.on('viewer:re-render', () => renderGroup())
    const renderItem = (item) => {
        const row = document.createElement('div')
        row.classList.add('section-group-row')

        const labelEl = document.createElement('span')
        labelEl.textContent = item.label
        row.appendChild(labelEl)

        if (item.type === 'toggle') {
            const toggle = document.createElement('div')
            toggle.classList.add('toggle')

            const knob = document.createElement('div')
            knob.classList.add('toggle-knob')
            toggle.appendChild(knob)

            if (item.active) toggle.classList.add('active')

            toggle.addEventListener('click', (e) => {
                e.stopPropagation()
                const newValue = !toggle.classList.contains('active')
                toggle.classList.toggle('active', newValue)
                global.events.fire(`viewer:${item.event}`, newValue)
            })

            row.appendChild(toggle)
        } else if (item.type === 'color') {
            const colorInput = document.createElement('input')
            colorInput.type = 'color'
            colorInput.classList.add('color-input', 'viewer-background-input')
            colorInput.value = item.value

            colorInput.addEventListener('input', () => {
                document.documentElement.style.setProperty('--viewer-bg', colorInput.value)
                global.events.fire(`viewer:${item.event}`, colorInput.value)
            })

            row.appendChild(colorInput)
        } else if (item.type === 'button') {
            const btn = document.createElement('button')
            btn.classList.add('btn')
            btn.style.cssText = 'width:"max-content";height:28px; font-size:12px;'
            btn.textContent = item.label
            btn.addEventListener('click', item.onClick)
            row.innerHTML = ''
            row.appendChild(btn)
        }
        return row
    }

    const renderInitViewFooter = (events) => {
        const btnRow = document.createElement('div')
        btnRow.classList.add('btn-row')

        const hasPose = !!settings.initview.pose

        const btnSave = document.createElement('button')
        btnSave.classList.add('btn', 'initview-btn')
        if (hasPose) btnSave.classList.add('active')
        btnSave.textContent = hasPose ? 'Update saved view' : 'Save current view'
        btnSave.onclick = () => {
            events.fire('viewer:save-initview')
            events.fire('viewer:re-render')
        }

        const btnDefault = document.createElement('button')
        btnDefault.classList.add('btn', 'initview-btn')
        if (!hasPose) btnDefault.classList.add('active')
        btnDefault.textContent = 'Default view'
        btnDefault.onclick = () => {
            if (!settings.initview.pose) return
            events.fire('viewer:remove-saved-view')
            events.fire('viewer:re-render')
        }

        btnRow.appendChild(btnSave)
        btnRow.appendChild(btnDefault)

        return btnRow
    }

    const getGroups = () => [
        {
            label: 'General',
            items: [
                { type: 'color', label: 'Background', value: settings.background.color, event: 'background-changed' },
                { type: 'toggle', key: 'inertia', label: 'Inertia', active: settings.inertia, event: 'inertia' },
                {
                    type: 'toggle',
                    key: 'autoHideUI',
                    label: 'Auto Hide UI',
                    active: settings.autoHideUI,
                    event: 'auto-hide-ui',
                },
                {
                    type: 'toggle',
                    key: 'lockZoomIn',
                    label: 'Lock Zoom In',
                    active: settings.lockZoomIn.locked,
                    event: 'lock-zoom-in',
                },
            ],
        },
        {
            label: 'Initial View',
            items: [],
            footer: () => renderInitViewFooter(global.events),
        },
    ]

    const renderGroup = () => {
        container.innerHTML = ''
        getGroups().forEach(({ label, items, footer }) => {
            const group = document.createElement('div')
            group.classList.add('section-group')

            const groupTitle = document.createElement('div')
            groupTitle.classList.add('section-group-title')
            groupTitle.textContent = label
            group.appendChild(groupTitle)

            items.forEach((item) => group.appendChild(renderItem(item)))
            if (footer) group.appendChild(footer())
            container.appendChild(group)
        })
    }
    renderGroup()
    el.appendChild(container)
}
function dimensionSection(el, global) {
    const { events, settings } = global
    events.on('hotspot:active', () => onCancel())
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
        global.loading.show()
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
        events.fire('dimensions:add', currentDimensions)
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
    const hasDimWrap = document.createElement('div')
    hasDimWrap.classList.add('section-wrap')

    // ── Group 0: Display ──
    const displayGroup = document.createElement('div')
    displayGroup.classList.add('section-group')
    const displayGroupTitle = document.createElement('div')
    displayGroupTitle.classList.add('section-group-title')
    displayGroupTitle.textContent = 'Display'
    displayGroup.appendChild(displayGroupTitle)

    // Color picker
    const {
        setDisabled: setBoxColorDisabled,
        group: boxColorGroup,
        input: boxColorInput,
    } = createColorPicker('Box Color', currentDimensions?.boxColor || '#ffffff', (color) => {
        currentDimensions = { ...currentDimensions, boxColor: color }
        events.fire('dimensions:change', currentDimensions)
    })
    const {
        setDisabled: setTextColorDisabled,
        group: textColor,
        input: textColorInput,
    } = createColorPicker('Text Color', currentDimensions?.foregroundColor || '#ffffff', (color) => {
        currentDimensions = { ...currentDimensions, foregroundColor: color }
        events.fire('dimensions:change', currentDimensions)
    })
    const backgroundRow = document.createElement('div')
    backgroundRow.classList.add('section-group-row')
    const labelEl = document.createElement('span')
    labelEl.style.cssText = 'min-width:160px'
    labelEl.textContent = 'Text Background'
    const backgroundColor = makeColorAlpha(
        currentDimensions?.background.color || '#000000',
        currentDimensions?.background.alpha ?? 0.8,
        (color) => {
            currentDimensions = { ...currentDimensions, background: { ...currentDimensions.background, color } }
            events.fire('dimensions:change', currentDimensions)
        },
        (alpha) => {
            currentDimensions = { ...currentDimensions, background: { ...currentDimensions.background, alpha } }
            events.fire('dimensions:change', currentDimensions)
        },
    )
    backgroundRow.appendChild(labelEl)
    backgroundRow.appendChild(backgroundColor)

    displayGroup.appendChild(boxColorGroup)
    displayGroup.appendChild(textColor)
    displayGroup.appendChild(backgroundRow)

    // ── Group 1: Box Transform ──
    const boxGroup = document.createElement('div')
    boxGroup.classList.add('section-group')
    const boxGroupTitle = document.createElement('div')
    boxGroupTitle.classList.add('section-group-title')
    boxGroupTitle.textContent = 'Box transform'
    boxGroup.appendChild(boxGroupTitle)
    const {
        row: positionRow,
        setEditable: setPosEditable,
        setValues: setPosValues,
    } = createVec3Inputs({
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
        setEditable: setRotEditable,
        setValues: setRotValues,
    } = createVec3Inputs({
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
        setEditable: setSizeEditable,
        setValues: setSizeValues,
    } = createVec3Inputs({
        title: 'Size',
        step: 0.5,
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            currentDimensions = { ...currentDimensions, size: { x, y, z } }
            events.fire('dimensions:change', currentDimensions)
        },
    })
    // ── Auto Fit row ──
    const autoFitRow = document.createElement('div')
    autoFitRow.classList.add('section-group-row')

    const autoFitLabel = document.createElement('span')
    autoFitLabel.textContent = 'Auto fit'

    const autoFitBtn = document.createElement('button')
    autoFitBtn.classList.add('btn')
    autoFitBtn.style.cssText = 'height:32px;'
    autoFitBtn.title = 'Auto Fit'
    autoFitBtn.innerHTML = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1" stroke-dasharray="2 1.5"/>
    <line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <polyline points="4,10 2,12 4,14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="22" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <polyline points="20,10 22,12 20,14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <polyline points="10,4 12,2 14,4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
    <line x1="12" y1="22" x2="12" y2="19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <polyline points="10,20 12,22 14,20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>
`

    autoFitBtn.onclick = async () => {
        if (!currentDimensions || !isEditing) return
        global.loading.show()
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
    }

    autoFitRow.appendChild(autoFitLabel)
    autoFitRow.appendChild(autoFitBtn)

    boxGroup.appendChild(positionRow)
    boxGroup.appendChild(rotationRow)
    boxGroup.appendChild(sizeRow)
    boxGroup.appendChild(autoFitRow)
    // ── Group 2: Real Dimensions ──
    const realGroup = document.createElement('div')
    realGroup.classList.add('section-group')
    const realGroupTitle = document.createElement('div')
    realGroupTitle.classList.add('section-group-title')
    realGroupTitle.textContent = 'Real dimensions'
    realGroup.appendChild(realGroupTitle)

    const realUnitRow = document.createElement('div')
    realUnitRow.classList.add('section-group-row')
    const realUnitLabel = document.createElement('span')
    realUnitLabel.textContent = 'Unit'
    const realUnitSelect = document.createElement('select')
    realUnitSelect.classList.add('unit-select')
    ;['mm', 'cm', 'm', 'inch'].forEach((u) => {
        const opt = document.createElement('option')
        opt.value = u
        opt.textContent = u
        if (u === (settings.realSizeUnit ?? 'cm')) opt.selected = true
        realUnitSelect.appendChild(opt)
    })
    const setRealUnitDisabled = (val) => {
        realUnitSelect.disabled = val
        realUnitSelect.classList.toggle('unit-select-disabled', val)
    }
    realUnitSelect.onchange = (e) => {
        currentDimensions = { ...currentDimensions, unit: e.target.value }
        events.fire('dimensions:change', currentDimensions)
    }
    realUnitRow.appendChild(realUnitLabel)
    realUnitRow.appendChild(realUnitSelect)

    const {
        row: realSizeRow,
        setEditable: setRealEditable,
        setValues: setRealValues,
    } = createVec3Inputs({
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

    const setEditable = (on) => {
        setPosEditable(on)
        setRotEditable(on)
        setSizeEditable(on)
        setRealEditable(on)
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
        setEditable(true)
        renderBtns()
        events.fire('dimensions:edit', currentDimensions)
    }

    const onCancel = () => {
        if (!isEditing) return
        isEditing = false
        setEditable(false)
        if (editDimension) setValues(editDimension)
        currentDimensions = { ...editDimension }
        renderBtns()
        events.fire('dimensions:cancel')
    }

    const renderBtns = () => {
        btnRow.innerHTML = ''
        if (isEditing) {
            const btnCancel = document.createElement('button')
            btnCancel.classList.add('btn', 'cancel-btn')
            btnCancel.textContent = 'Cancel'
            btnCancel.onclick = onCancel

            const btnApply = document.createElement('button')
            btnApply.classList.add('btn', 'confirm-btn')
            btnApply.textContent = 'Apply'
            btnApply.onclick = () => {
                editDimension = { ...currentDimensions }
                settings.dimensions = { ...currentDimensions }
                isEditing = false
                setEditable(false)
                renderBtns()
                events.fire('dimensions:save', currentDimensions)
            }

            btnRow.appendChild(btnCancel)
            btnRow.appendChild(btnApply)
        } else {
            const btnEdit = document.createElement('button')
            btnEdit.classList.add('btn')
            btnEdit.textContent = 'Edit'
            btnEdit.onclick = onEdit

            const btnDelete = document.createElement('button')
            btnDelete.classList.add('btn', 'delete-btn')
            btnDelete.title = 'Delete'
            btnDelete.innerHTML = `<svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M1.5 3.5h10M5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M10.5 3.5l-.7 7a.5.5 0 0 1-.5.5H3.7a.5.5 0 0 1-.5-.5l-.7-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 6v3M8 6v3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>`
            btnDelete.onclick = () => {
                settings.dimensions = null
                editDimension = null
                currentDimensions = null
                setDimConfigured(false)
                events.fire('dimensions:delete')
            }

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
    setEditable(false)
    setDimConfigured(!!settings.dimensions)
    if (settings.dimensions) setValues(settings.dimensions)
}
function exportSection(el, global) {
    const hint = document.createElement('p')
    hint.textContent = 'Please put the exported HTML file in the current folder.'
    hint.classList.add('export-hint')
    const helperBtn = document.createElement('a')
    helperBtn.classList.add('export-link-btn')
    helperBtn.textContent = 'Export Location Change Helper'
    helperBtn.href = '#'
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
    helperBtn.addEventListener('click', (e) => {
        e.preventDefault()
        const tabs = createTabs({
            tabs: [
                {
                    label: 'Chrome',
                    content: () => downloadHelper(chromeStepsData),
                },
                {
                    label: 'Firefox',
                    content: () => downloadHelper(firefoxStepsData),
                },
                {
                    label: 'Microsoft Edge',
                    content: () => downloadHelper(edgeStepsData),
                },
            ],
            width: 800,
            height: 350,
        })

        global.modal.open('Export Location Change Helper', tabs, 'top', {
            showCancel: false,
        })
    })
    el.appendChild(helperBtn)
    el.appendChild(hint)
    const btn = document.createElement('button')
    btn.classList.add('export-btn')
    btn.textContent = 'Export HTML'
    btn.addEventListener('click', () => {
        const filename = 'index.html'
        exportHtml(filename, { settings: global.settings }, global.settings.fileAudioStore)
    })
    el.appendChild(btn)
}
function createSidebar(global, dom) {
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

    const backBtn = document.createElement('button')
    backBtn.classList.add('btn', 'back-btn')
    backBtn.textContent = 'Back'
    backBtn.addEventListener('click', () => {
        if (global.settings.setupStep > minStep) {
            if (isHemi && global.settings.setupStep === 2) {
                global.settings.pivot = { position: null, enabled: true }
            }
            global.settings.setupStep--
            renderStep()
        }
    })
    header.appendChild(backBtn)

    const nextBtn = document.createElement('button')
    nextBtn.classList.add('btn', 'next-btn')
    nextBtn.addEventListener('click', () => {
        if (global.settings.setupStep < totalSteps) {
            global.settings.setupStep++
            renderStep()
        }
    })
    header.appendChild(nextBtn)

    const resetBtn = document.createElement('button')
    resetBtn.classList.add('reset-setup-btn')
    resetBtn.textContent = '↺ Reset Model Setup'
    resetBtn.title = 'Reset Model Setup'
    resetBtn.addEventListener('click', async () => {
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
            })
            events.fire('setup-reset', global.settings)
            renderStep()
        }
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
            createSection({
                id: 'model',
                title: 'Model',
                classname: 'model-section',
                body: (el) => modelSection(el, global),
                events,
            }),
        )
        contentArea.appendChild(
            createSection({
                id: 'export',
                title: 'Export',
                classname: 'export-section',
                body: (el) => exportSection(el, global),
                events,
            }),
        )
        setTimeout(() => events.fire('hotspot:active', 'model'), 0)
    }

    const renderFullStep = () => {
        contentArea.appendChild(
            createSection({
                id: 'settings',
                title: 'Viewer',
                classname: 'viewer-setting-section',
                body: (el) => viewerSettingsSection(el, global),
                events,
            }),
        )
        contentArea.appendChild(
            createSection({
                id: 'hotspot',
                title: 'Hotspots',
                classname: 'hotspot-section',
                body: (el) => initHotspotSection(el, global, dom),
                events,
            }),
        )
        contentArea.appendChild(
            createSection({
                id: 'dimension',
                title: 'Dimensions',
                classname: 'dimension-section',
                body: (el) => dimensionSection(el, global, dom),
                events,
            }),
        )
        contentArea.appendChild(
            createSection({
                id: 'export',
                title: 'Export',
                classname: 'export-section',
                body: (el) => exportSection(el, global),
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
