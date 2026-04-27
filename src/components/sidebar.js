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
function renderOrientation(group, global, editGroup) {
    const { events, settings } = global
    editGroup.register('orientation', { cancel: () => onCancelOrientation() })
    const groundPicker = new GroundPlanePicker(global.app, global.camera)
    events.on('hotspot:active', () => onCancelOrientation())
    events.on('sidebar:clicked', () => onCancelOrientation())
    let isEditing = false

    const container = document.createElement('div')
    container.classList.add('orientation-btn-wrap')

    // ─────────────────────────────────────────
    // SECTION 1: ORIENTATION
    // ─────────────────────────────────────────

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
    events.on('orientation:aligned-to-ground', ({ x, y, z }) => syncValues({ x, y, z }))
    events.on('orientation:aligned-from-manual', ({ x, y, z }) => syncValues({ x, y, z }))

    // ── Ground Plane Picker ──
    let pickingActive = false
    let pickedPoints = []
    const MAX_POINTS = 3
    const getGroundPoints = () => pickedPoints

    const ICON_CROSSHAIR = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
        <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
    </svg>`
    const ICON_X = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>`

    const groundWrap = document.createElement('div')
    groundWrap.style.cssText = 'display:none; flex-direction:column; gap:8px;'

    const hint = document.createElement('div')
    hint.style.cssText = 'font-size:12px; color:var(--text-main); margin-top:4px; height:28px'
    hint.innerHTML = `Click <span class="highlight">3</span> points on the <span class="highlight">ground surface</span> to auto-align the model.`

    const pickRow = document.createElement('div')
    pickRow.classList.add('section-group-row')
    const pickLabel = document.createElement('span')
    pickLabel.textContent = 'Set Ground Plane'
    const pickActionRow = document.createElement('div')
    pickActionRow.style.cssText = 'display:flex; gap:6px;'
    const pickBtn = document.createElement('button')
    pickBtn.classList.add('btn', 'pick-ground-btn')
    pickBtn.innerHTML = ICON_CROSSHAIR
    pickBtn.title = 'Pick Ground Plane'
    const btnCancelGround = document.createElement('button')
    btnCancelGround.classList.add('btn', 'cancel-btn')
    btnCancelGround.style.cssText = 'height:30px; display:none'
    btnCancelGround.innerHTML = ICON_X
    btnCancelGround.title = 'Cancel'
    pickActionRow.appendChild(pickBtn)
    pickActionRow.appendChild(btnCancelGround)
    pickRow.appendChild(pickLabel)
    pickRow.appendChild(pickActionRow)

    const pointInputsWrap = document.createElement('div')
    pointInputsWrap.style.cssText = 'display:none; flex-direction:column; gap:4px; margin-top:4px;'
    const pointInputRows = [1, 2, 3].map((n) => {
        const { row, setValues } = createVec3Inputs({
            title: `Point ${n}`,
            editable: true,
            onChange: ({ x, y, z }) => {
                const idx = n - 1
                if (pickedPoints[idx]) {
                    pickedPoints[idx] = { x, y, z }
                    groundPicker._points[idx] = new Vec3(x, y, z)
                    groundPicker._redraw() //
                }
            },
        })
        return { row, setValues }
    })
    pointInputRows.forEach(({ row }) => pointInputsWrap.appendChild(row))

    const syncPointInputs = () => {
        pointInputRows.forEach(({ row, setValues }, i) => {
            if (pickingActive && i < pickedPoints.length) {
                setValues({ x: pickedPoints[i].x, y: pickedPoints[i].y, z: pickedPoints[i].z })
                row.style.display = 'flex'
            } else {
                row.style.display = 'none'
            }
        })
        pointInputsWrap.style.display = pickingActive && pickedPoints.length > 0 ? 'flex' : 'none'
    }

    const updatePickState = () => {
        if (!pickingActive) {
            pickBtn.style.display = 'flex'
            document.body.style.cursor = 'default'
            btnCancelGround.style.display = 'none'
        } else if (pickedPoints.length < MAX_POINTS) {
            document.body.style.cursor = 'crosshair'
            pickBtn.style.display = 'none'
            btnCancelGround.style.display = 'flex'
        } else {
            document.body.style.cursor = 'default'
            pickBtn.style.display = 'none'
            btnCancelGround.style.display = 'flex'
        }
        syncPointInputs()
    }

    const updateHintText = () => {
        const remaining = MAX_POINTS - pickedPoints.length
        hint.innerHTML =
            remaining > 0
                ? `Click <span class="highlight">${remaining}</span> point${remaining > 1 ? 's' : ''} on the <span class="highlight">ground surface</span> to auto-align the model.`
                : `Click <span class="highlight">Apply</span> to auto-align the model, or click <span class="highlight cancel">✕</span> to cancel.`
    }

    const stopPicking = () => {
        pickingActive = false
        pickedPoints = []
        groundPicker.disable()
        groundPicker.reset()
        updatePickState()
        updateHintText()
    }

    pickBtn.onclick = () => {
        pickedPoints = []
        pickingActive = true
        groundPicker.enable()
        groundPicker.reset()
        updatePickState()
    }
    btnCancelGround.onclick = () => stopPicking()

    const canvas = global.app.graphicsDevice.canvas
    canvas.addEventListener('pointerdown', (e) => {
        if (!pickingActive || !isEditing) return
        if (e.button !== 0) return
        if (pickedPoints.length >= MAX_POINTS) return
        const localPoint = pickModelLocalPoint(e.offsetX, e.offsetY, global.camera.camera, true)
        if (!localPoint) {
            showToast('Please try again!', { duration: 1000, type: 'warning' })
            return
        }
        groundPicker.handleClick(localPoint, e.offsetX, e.offsetY)
        pickedPoints = groundPicker.getLocalPoints().map((p) => ({ x: p.x, y: p.y, z: p.z }))
        updateHintText()
        updatePickState()
    })

    groundWrap.appendChild(hint)
    groundWrap.appendChild(pickRow)
    groundWrap.appendChild(pointInputsWrap)

    // ── Orientation btn row ──
    const orientBtnRow = document.createElement('div')
    orientBtnRow.classList.add('btn-row')

    const onCancelOrientation = () => {
        if (!isEditing) return
        isEditing = false
        stopPicking()
        groundWrap.style.display = 'none'
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
            groundWrap.style.display = 'flex'

            const btnCancel = document.createElement('button')
            btnCancel.classList.add('btn', 'cancel-btn')
            btnCancel.textContent = 'Cancel'
            btnCancel.onclick = () => onCancelOrientation()

            const btnSave = document.createElement('button')
            btnSave.classList.add('btn', 'confirm-btn')
            btnSave.textContent = 'Apply'
            btnSave.onclick = () => {
                const pts = getGroundPoints()
                if (pts.length < MAX_POINTS) {
                    showToast('Not enough points selected!', { duration: 1000, type: 'warning' })
                    return
                }
                stopPicking()
                events.fire('orientation:groundplane', pts)
                isEditing = false
                groundWrap.style.display = 'none'
                renderOrientBtns()
            }

            orientBtnRow.appendChild(btnCancel)
            orientBtnRow.appendChild(btnSave)
        } else {
            readonlyRotationRow.style.display = 'flex'
            groundWrap.style.display = 'none'

            const btnEdit = document.createElement('button')
            btnEdit.classList.add('btn')
            btnEdit.textContent = 'Edit'
            btnEdit.onclick = () => {
                editGroup.startEdit('orientation')
                isEditing = true
                groundWrap.style.display = 'flex'
                events.fire('orientation:edit')
                renderOrientBtns()
            }
            orientBtnRow.appendChild(btnEdit)
        }
    }

    // ─────────────────────────────────────────
    // SECTION 2: CAMERA LIMITS
    // ─────────────────────────────────────────

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

    // ── Readonly pitch row ──
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

    // ── Edit pitch content ──
    const pitchEditWrap = document.createElement('div')
    pitchEditWrap.style.cssText = 'display:none; flex-direction:column; gap:8px;'

    // input + unit
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

    // slider
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

    // ── Pitch btn row ──
    const pitchBtnRow = document.createElement('div')
    pitchBtnRow.classList.add('btn-row')

    const syncPitchReadonly = () => {
        const saved = radToDeg(settings.orientation.pitchOffset ?? 0)
        pitchReadonlyVal.textContent = Math.round(saved) + ''
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
                const radVal = degToRad(pitchDraftDeg)
                events.fire('orientation:save-pitchoffset', { value: radVal })
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

    // ─────────────────────────────────────────
    // ASSEMBLE
    // ─────────────────────────────────────────

    container.appendChild(readonlyRotationRow)
    container.appendChild(groundWrap)
    container.appendChild(orientBtnRow)
    group.appendChild(container)

    syncPitchReadonly()
    renderOrientBtns()
    renderPitchBtns()

    return { cameraLimitsGroup }
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

    addBtn.onclick = () => {
        const { rotation, position, size } = getDimensionsInfo(getVisiblePoints(modelEntity), true)
        currentDimensions = {
            boxColor: '#f95f4d',
            background: { color: 'white', alpha: 0.8 },
            foregroundColor: '#f95f4d',
            position,
            rotation,
            size,
            realSize: { x: 0, y: 0, z: 0 },
            unit: 'cm',
        }
        editDimension = { ...currentDimensions }
        settings.dimensions = currentDimensions
        setDimConfigured(true)
        setValues(currentDimensions)
        events.fire('dimensions:add', currentDimensions)
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
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            currentDimensions = { ...currentDimensions, rotation: { x, y, z } }
            events.fire('dimensions:change', currentDimensions)
        },
    })
    events.on('dimensions:eulersynced', ({ x, y, z }) => {
        setRotValues({ x, y, z })
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

    // Rotation gizmo toggle
    const rotGizmoRow = document.createElement('div')
    rotGizmoRow.classList.add('section-group-row')
    rotGizmoRow.style.display = 'none'
    const rotGizmoLabel = document.createElement('span')
    rotGizmoLabel.textContent = 'Rotation Gizmo'
    const rotGizmoTrack = document.createElement('div')
    rotGizmoTrack.classList.add('toggle')
    const rotGizmoKnob = document.createElement('div')
    rotGizmoKnob.classList.add('toggle-knob')
    rotGizmoTrack.appendChild(rotGizmoKnob)
    const setRotGizmo = (on) => {
        rotGizmoTrack.classList.toggle('active', on)
        events.fire('dimensions:gizmo-rotation', on)
    }
    rotGizmoTrack.addEventListener('click', () => setRotGizmo(!rotGizmoTrack.classList.contains('active')))
    rotGizmoRow.appendChild(rotGizmoLabel)
    rotGizmoRow.appendChild(rotGizmoTrack)

    boxGroup.appendChild(positionRow)
    boxGroup.appendChild(rotationRow)
    boxGroup.appendChild(sizeRow)
    boxGroup.appendChild(rotGizmoRow)

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
        setPosValues(dim.position)
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
    }

    // ── Buttons ──
    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')

    const onEdit = () => {
        isEditing = true
        setEditable(true)
        rotGizmoRow.style.display = 'flex'
        renderBtns()
        events.fire('dimensions:edit', currentDimensions)
    }

    const onCancel = () => {
        if (!isEditing) return
        isEditing = false
        setEditable(false)
        rotGizmoRow.style.display = 'none'
        setRotGizmo(false)
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
                rotGizmoRow.style.display = 'none'
                setRotGizmo(false)
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
            global.settings.setupStep = 1
            global.settings.initview = defaultSettings.initview
            global.settings.orientation = defaultSettings.orientation
            global.settings.hotspots = []
            global.settings.dimensions = defaultSettings.dimensions
            global.settings.pivot = defaultSettings.pivot
            events.fire('setup-reset')
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
