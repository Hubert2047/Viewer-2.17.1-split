function makeViewerSection(el, global) {
    const { settings, events, app, camera } = global
    const container = makeSectionWrap()
    //general
    const generalGroup = makeSectionGroup('General')

    const { row: backgroundColor } = makeColorPickerDropdown({
        label: 'Background',
        color: settings.background.color,
        debounceMs: 0,
        onChange: ({ hex }) => {
            settings.background.color = hex
            camera.camera.clearColor = new Color(normalizeColor(hex))
            app.render()
            global.dataDirty = true
        },
    })
    const inertiaRow = makeRow({ title: 'Inertia' })
    const inertiaToggleEl = makeToggle({
        initialValue: settings.inertia,
        onChange: (value) => {
            settings.inertia = value
            events.fire('viewer:inertia', value)
            global.dataDirty = true
        },
    })
    inertiaRow.el.appendChild(inertiaToggleEl)

    const autoHideUIRow = makeRow({ title: 'Auto Hide UI' })
    const autoHideUIToggleEl = makeToggle({
        initialValue: settings.autoHideUI,
        onChange: (value) => {
            settings.autoHideUI = value
            events.fire('viewer:auto-hide-ui', value)
            global.dataDirty = true
        },
    })
    autoHideUIRow.el.appendChild(autoHideUIToggleEl)

    const lockZoomInRow = makeRow({ title: 'Set Max Zoom' })
    const lockZoomInToggleEl = makeToggle({
        initialValue: settings.lockZoomIn.locked,
        onChange: (value) => {
            events.fire('viewer:lock-zoom-in', value)
            global.dataDirty = true
        },
    })
    lockZoomInRow.el.appendChild(lockZoomInToggleEl)

    generalGroup.appendChild(backgroundColor)
    generalGroup.appendChild(inertiaRow.el)
    generalGroup.appendChild(autoHideUIRow.el)
    generalGroup.appendChild(lockZoomInRow.el)
    //iniview
    const initviewHint =
        'Set the initial viewing angle. Rotate the object to the preferred angle and click “Save initial view”'

    const initviewGroup = makeSectionGroup('Initial View', initviewHint)
    initviewGroup.appendChild(makeInitViewGroup(events, settings, global))
    //spin
    const isSpherical = settings.model === 'spherical'
    let rotationAxisRow
    let isAxesEdit = false
    let spinAxesRotatable = null
    let savedRotation = null
    let dimensionAxes = {
        boxColor: '#f95f4d',
        background: { color: '#ffffff', alpha: 0.8 },
        foregroundColor: '#f95f4d',
        type: 'axis',
    }

    const spinGroup = makeSectionGroup('Spin')
    const spinEnabledRow = makeRow({ title: 'Enabled' })
    if (!settings.spin.enable) {
        settings.spin.enabled = true
        events.fire('re-render:control-wrap', true)
    }
    const spinEnabledToggleEl = makeToggle({
        initialValue: settings.spin.enabled,
        onChange: async (value) => {
            if (value && settings.model === 'spherical' && !settings.spin.rotation) {
                if (!global.oobbInfo) {
                    await global.loading.show()
                    await global.oobbInfoPromise
                    global.loading.hide()
                }
                const rotation = global.oobbInfo.finalQuat.getEulerAngles()
                settings.spin = {
                    ...defaultSettings.spin,
                    enabled: value,
                    rotation,
                }
            } else {
                settings.spin.enabled = value
            }
            spinContinuousRow.setShow(value)
            spinOnStartRow.setShow(value)
            speedRow.setShow(value)
            directionRow.setShow(value)
            rotationAxisRow?.setShow(value)
            events.fire('spin:enabled', value)
            events.fire('re-render:control-wrap', value)
            global.dataDirty = true
        },
    })
    spinEnabledRow.el.appendChild(spinEnabledToggleEl)

    const speedRow = makeRow({ title: 'Speed', show: settings.spin.enabled, className: 'spin-speed' })
    const speedInput = makeInput({
        type: 'number',
        value: settings.spin.speed,
        min: 1,
        max: 100,
        name: 'slider-number',
        className: 'small-input',
        onChange: (v) => {
            settings.spin.speed = v
            events.fire('spin-speed', v)
            global.dataDirty = true
        },
    })
    speedRow.el.appendChild(speedInput)
    const directionRow = makeRow({ title: 'Direction', show: settings.spin.enabled })
    const directionSelect = makeSelect({
        options: [
            { label: 'Clockwise', value: 'cw' },
            { label: 'Counter Clockwise', value: 'ccw' },
        ],
        value: settings.spin.direction || 'cw',
        onChange: (v) => {
            settings.spin.direction = v
            events.fire('spin-direction', v)
            global.dataDirty = true
        },
        name: 'spin-direction',
    })
    directionRow.el.appendChild(directionSelect.el)

    rotationAxisRow = makeRow({ title: 'Rotation Axis', show: settings.spin.enabled })
    const groupAxes = document.createElement('div')
    groupAxes.classList.add('flex-center')
    groupAxes.style.cssText = 'gap:4px;'

    const axisSelect = makeSelect({
        options: [
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
        ],
        value: settings.spin.axis || 'y',
        onChange: (v) => {
            settings.spin.axis = v
            events.fire('spin-axis', v)
            global.dataDirty = true
        },
        name: 'spin-direction',
        className: 'rotate-axis',
    })

    const editAxesBtn = makeButton({
        icon: ICONS.edit,
        title: 'Edit',
        onClick: async () => {
            isAxesEdit = true
            updateButtonsVisibility()
            await enterEditMode()
            events.fire('re-render:control-wrap')
        },
    })
    editAxesBtn.style.cssText = 'width:30px; height:30px; padding:6px;'

    const applyBtn = makeButton({
        icon: ICONS.check,
        title: 'Apply',
        show: false,
        onClick: () => {
            settings.spin.rotation = { ...dimensionAxes.rotation }
            isAxesEdit = false
            exitEditMode()
            updateButtonsVisibility()
            savedRotation = dimensionAxes.rotation
            global.dataDirty = true
        },
    })
    applyBtn.style.cssText = 'width:30px; height:30px; padding:6px;;'

    const cancelBtn = makeButton({
        icon: ICONS.cancel,
        title: 'Cancel',
        show: false,
        onClick: cancelEditAxes,
    })
    cancelBtn.style.cssText =
        'width:30px; height:30px; padding:6px;background-color: rgba(249, 87, 68, 0.18); color:#e05555;;'

    groupAxes.appendChild(axisSelect.el)
    groupAxes.appendChild(editAxesBtn)
    groupAxes.appendChild(applyBtn)
    groupAxes.appendChild(cancelBtn)
    rotationAxisRow.el.appendChild(groupAxes)
    const spinContinuousRow = makeRow({ title: 'Continuous', show: settings.spin.enabled })
    const spinContinuousToggleEl = makeToggle({
        initialValue: settings.spin.continuous,
        onChange: (value) => {
            settings.spin.continuous = value
            events.fire('spin-continuous', value)
            global.dataDirty = true
        },
    })
    spinContinuousRow.el.appendChild(spinContinuousToggleEl)

    const spinOnStartRow = makeRow({ title: 'Auto Rotate', show: settings.spin.enabled })
    const spinOnStartToggleEl = makeToggle({
        initialValue: settings.spin.autoStart,
        onChange: (value) => {
            settings.spin.autoStart = value
            global.dataDirty = true
        },
    })
    spinOnStartRow.el.appendChild(spinOnStartToggleEl)

    spinGroup.appendChild(spinEnabledRow.el)
    spinGroup.appendChild(spinContinuousRow.el)
    spinGroup.appendChild(spinOnStartRow.el)
    spinGroup.appendChild(speedRow.el)
    if (isSpherical) {
        spinGroup.appendChild(rotationAxisRow.el)
    }
    spinGroup.appendChild(directionRow.el)

    container.appendChild(generalGroup)
    container.appendChild(initviewGroup)
    container.appendChild(spinGroup)

    el.appendChild(container)
    async function cancelEditAxes() {
        isAxesEdit = false
        if (savedRotation) {
            settings.spin.rotation = savedRotation
        }
        exitEditMode()
        updateButtonsVisibility()
    }
    function exitEditMode() {
        global.dimensionsBox.hide()
        global.rotationGizmo.disable()
    }

    function updateButtonsVisibility() {
        editAxesBtn.setShow(!isAxesEdit)
        applyBtn.setShow(isAxesEdit)
        cancelBtn.setShow(isAxesEdit)
    }
    async function onBoxDragEnd() {
        if (!isAxesEdit) return
        const result = await getUpdateBoxSize(dimensionAxes.rotation, settings.removedSplats)
        settings.spin.rotation = dimensionAxes.rotation
        dimensionAxes = { ...dimensionAxes, size: result.size, position: result.position }
        spinAxesRotatable.syncFromExternal(dimensionAxes)
        global.dimensionsBox.draw(dimensionAxes)
    }
    async function enterEditMode() {
        if (settings.spin.rotation) {
            const { x, y, z } = settings.spin.rotation
            const r = new Vec3(x, y, z)
            savedRotation = r.clone()
            const result = await getUpdateBoxSize(r, settings.removedSplats)
            dimensionAxes = { ...dimensionAxes, rotation: r, size: result.size, position: result.position }
        } else {
            const { finalQuat, posInLocal, size } = global.oobbInfo
            const r = finalQuat.getEulerAngles()
            dimensionAxes = { ...dimensionAxes, rotation: r, size, position: posInLocal }
            settings.spin.rotation = r
            savedRotation = r.clone()
        }

        if (!spinAxesRotatable) {
            spinAxesRotatable = new BoxRotatable({
                app: global.app,
                dimensionAxes: dimensionAxes,
                onDragEnd: onBoxDragEnd,
            })
        } else {
            spinAxesRotatable.setDragEnd(onBoxDragEnd)
        }
        spinAxesRotatable.syncFromExternal(dimensionAxes)
        global.rotationGizmo.enable(spinAxesRotatable)
        global.dimensionsBox.draw(dimensionAxes)
    }
    function hideDimensions() {
        if (global.dimensionsBox && global.dimensionsBox.show) {
            global.dimensionsBox.hide()
            events.fire('re-render:control-wrap')
        }
        if (global.rotationGizmo) global.rotationGizmo.disable()
    }
    const handles = [
        events.on('inputEvent:show-dimensions', async () => {
            if (!isAxesEdit) return
            if (savedRotation && isAxesEdit) {
                settings.spin.rotation = savedRotation
            }
            isAxesEdit = false
            updateButtonsVisibility()
            if (global.rotationGizmo) global.rotationGizmo.disable()
        }),
        events.on('sidebar:clicked', () => {
            if (!isAxesEdit) return
            isAxesEdit = false
            if (savedRotation) {
                settings.spin.rotation = savedRotation.clone()
            }
            updateButtonsVisibility()
            global.rotationGizmo.disable()
            global.dimensionsBox.hide()
        }),
        events.on('setup-reset', () => hideDimensions()),
    ]
    el.cleanup = () => {
        handles.forEach((h) => events.offByHandle(h))
    }
}
function makeInitViewGroup(events, settings, global) {
    const wrap = document.createElement('div')
    wrap.style.cssText = 'display:flex; flex-direction:column; gap:8px;'

    // --- Status row ---
    const statusRow = document.createElement('div')
    statusRow.classList.add('flex-center')
    statusRow.style.cssText = 'justify-content:space-between; align-items:center;'

    const statusBadge = document.createElement('div')
    statusBadge.classList.add('flex-center')
    statusBadge.style.cssText = 'gap:6px; font-size:12px;'

    const statusDot = document.createElement('span')
    statusDot.style.cssText = 'width:6px; height:6px; border-radius:50%; display:inline-block;'

    const statusText = document.createElement('span')

    function updateStatus() {
        const isCustom = !!settings.initview.pose && settings.initview.type === 'custom'
        statusDot.style.backgroundColor = isCustom ? '#4dd0a3' : '#9aa0a6'
        statusText.textContent = isCustom ? 'Custom' : 'Original'
        statusText.style.color = isCustom ? '#4dd0a3' : '#9aa0a6'
    }
    updateStatus()

    statusBadge.appendChild(statusDot)
    statusBadge.appendChild(statusText)

    const eyeBtn = makeButton({
        title: 'Preview',
        icon: ICONS.eye,
        onClick: () => {
            events.fire('inputEvent:r')
        },
    })
    eyeBtn.style.cssText = 'width:26px; height:26px; padding:5px;'

    statusRow.appendChild(statusBadge)
    statusRow.appendChild(eyeBtn)

    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row', 'initview-btn-row')

    const btnSave = makeButton({
        title: 'Save initial view',
        className: 'initview-btn',
        variant: 'a',
        onClick: () => {
            events.fire('viewer:save-initview')
            global.dataDirty = true
            updateStatus()
        },
    })

    const btnDefault = makeButton({
        title: 'Reset',
        className: 'initview-btn',
        onClick: () => {
            if (!settings.initview.pose) return
            events.fire('viewer:remove-saved-view')
            global.dataDirty = true
            updateStatus()
        },
    })

    btnRow.appendChild(btnSave)
    btnRow.appendChild(btnDefault)

    wrap.appendChild(statusRow)
    wrap.appendChild(btnRow)
    return wrap
}
