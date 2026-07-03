function makePointEraser(global) {
    const { events, settings, camera, app } = global
    const container = makeSectionWrap()
    let brushRadius = 24
    let isPointerDown = false
    let isShowSplatMode = false
    let isShowSplatRing = false
    let deletedSet = new Set(settings.removedSplats)
    let currentControl = null
    let backgroundColor = settings.background.color
    let selectedColorHex = '#FFD900'
    let selectedAlpha = 1
    let unselectedColorHex = '#F95F4D'
    let unselectedAlpha = 1
    if (modelEntity && !currentControl) {
        currentControl = new SelectionController({
            canvas: app.graphicsDevice.canvas,
            camera: camera,
            gsplatComp: modelEntity.gsplat,
            events,
            app: app,
            settings,
        })
        applyShaderModes()
    }

    // ── Remove noise ────────────────────────────────────────
    const desGroup = makeSectionGroup('Remove Noise')

    const hint = document.createElement('p')
    hint.textContent = 'Select and delete unwanted points such as floating artifacts or background clutter.'
    hint.style.cssText = 'font-size: 0.8125rem; color: #8c9fb4; line-height: 1.5; margin: 0;'

    desGroup.appendChild(hint)
    // ── Point view ────────────────────────────────────────
    const viewGroup = makeSectionGroup('Point view')

    const splatModeRow = makeRow({ title: 'Point Cloud Mode' })
    const spatModeToggle = makeToggle({
        initialValue: isShowSplatMode,
        onChange: (value) => {
            isShowSplatMode = value
            applyShaderModes()
        },
    })
    splatModeRow.el.appendChild(spatModeToggle)

    // const showSplatRow = makeRow({ title: 'Splat Outline' })
    // const showSplatToggle = makeToggle({
    //     initialValue: isShowSplatRing,
    //     onChange: (value) => {
    //         isShowSplatRing = value
    //         applyShaderModes()
    //     },
    // })
    // showSplatRow.appendChild(showSplatToggle)

    const pointSizeRow = makeRow({ title: 'Point Size' })
    const pointSizeInput = makeInput({
        type: 'number',
        value: 4,
        min: 1,
        max: 20,
        name: 'slider-number',
        className: 'small-input',
        onChange: (v) => {
            modelEntity.gsplat.material.setParameter('splat_point_size', v)
            app.renderNextFrame = true
        },
    })
    pointSizeRow.el.appendChild(pointSizeInput)

    const { row: backgroundRow } = makeColorPickerDropdown({
        label: 'Background Color',
        color: backgroundColor,
        debounceMs: 0,
        onChange: ({ r, g, b }) => {
            backgroundColor = `rgb(${r},${g},${b})`
            camera.camera.clearColor = new Color(normalizeColor(backgroundColor))
            app.render()
        },
    })
    const { row: selectedColorRow } = makeColorPickerDropdown({
        label: 'Selected Color',
        color: selectedColorHex,
        alpha: selectedAlpha,
        hasAlpha: true,
        debounceMs: 0,
        onChange: ({ r, g, b, alpha }) => {
            selectedColorHex = `rgb(${r},${g},${b})`
            selectedAlpha = alpha
            if (!modelEntity?.gsplat?.material) return
            modelEntity.gsplat.material.setParameter('splat_selected_color', normalizeColor(selectedColorHex, selectedAlpha))
            app.renderNextFrame = true
        },
    })

    const { row: unselectedColorRow } = makeColorPickerDropdown({
        label: 'Unselected Color',
        color: unselectedColorHex,
        alpha: unselectedAlpha,
        hasAlpha: true,
        debounceMs: 0,
        onChange: ({ r, g, b, alpha }) => {
            unselectedColorHex = `rgb(${r},${g},${b})`
            unselectedAlpha = alpha
            if (!modelEntity?.gsplat?.material) return
            modelEntity.gsplat.material.setParameter('splat_unselected_color', normalizeColor(unselectedColorHex, unselectedAlpha))
            app.renderNextFrame = true
        },
    })

    viewGroup.appendChild(splatModeRow.el)
    // viewGroup.appendChild(showSplatRow)
    viewGroup.appendChild(pointSizeRow.el)
    viewGroup.appendChild(backgroundRow)
    viewGroup.appendChild(selectedColorRow)
    viewGroup.appendChild(unselectedColorRow)

    // ── Selection mode ───────────────────────────────────────────
    const modeGroup = makeSectionGroup('Selection mode')
    const modeRow = document.createElement('div')
    modeRow.classList.add('btn-row')

    const modes = [
        {
            id: 'rect',
            label: 'Rect',
            icon: ICONS.rect,
        },
        {
            id: 'lasso',
            label: 'Lasso',
            icon: ICONS.lasso,
        },
        {
            id: 'polygon',
            label: 'Polygon',
            icon: ICONS.polygon,
        },
        {
            id: 'brush',
            label: 'Brush',
            icon: ICONS.brush,
        },
    ]

    let activeMode = null
    let activeBtn = null
    const modeBtns = modes.map(({ id, label, icon }) => {
        const btn = document.createElement('button')
        btn.classList.add('tool-mode-btn')
        btn.dataset.mode = id
        btn.innerHTML = `${icon}<span>${label}</span>`
        btn.onclick = () => {
            if (activeMode === id) {
                resetSelection()
            } else {
                activeBtn = btn
                events.fire('point-eraser:active', true)
                activeMode = id
                modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === id))
                brushSizeRow.setShow(id === 'brush')
                currentControl.setMode(id)
            }
        }
        modeRow.appendChild(btn)
        return btn
    })
    function resetSelection() {
        events.fire('point-eraser:active', false)
        activeMode = null
        if (activeBtn) activeBtn.classList.remove('active')
        brushSizeRow.setShow(false)
        currentControl.setMode(null)
    }

    modeGroup.appendChild(modeRow)

    // ── Brush size ───────────────────────────────────────────────
    const brushSizeRow = makeRow({ title: 'Brush size' })
    const brushInput = makeInput({
        type: 'number',
        value: 24,
        min: 1,
        max: 99,
        name: 'slider-number',
        className: 'small-input',
        onChange: (v) => {
            brushRadius = v
            events.fire('point-eraser:brush-size', v)
        },
    })
    brushSizeRow.el.appendChild(brushInput)
    modeGroup.appendChild(brushSizeRow.el)

    // ── Stats ────────────────────────────────────────────────────
    // const statsGroup = makeSectionGroup('Statistics')

    // const erasedRow = makeRow({ title: 'Erased' })
    // const erasedVal = document.createElement('span')
    // erasedVal.classList.add('row-value')
    // erasedVal.style.color = 'var(--primary)'
    // erasedVal.textContent = '0'
    // erasedRow.appendChild(erasedVal)

    // statsGroup.appendChild(erasedRow)

    // ── Actions ──────────────────────────────────────────────────
    const actionsGroup = makeSectionGroup('')
    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')
    btnRow.style.alignItems = 'center'

    const undoBtn = makeButton({
        title: 'Undo (Ctrl + Z)',
        icon: ICONS.undo,
        className: 'icon-circle-btn',
        onClick: () => events.fire('point-eraser:undo'),
    })
    const redoBtn = makeButton({
        title: 'Redo (Ctrl + Shift + Z)',
        icon: ICONS.redo,
        className: 'icon-circle-btn',
        onClick: () => events.fire('point-eraser:redo'),
    })

    const spacer = document.createElement('div')
    spacer.classList.add('spacer')
    const resetBtn = makeButton({
        title: 'Reset',
        disabled: settings.removedSplats.length === 0,
        className: 'reset-btn',
        icon: ICONS.reset,
        onClick: async () => {
            const ok = await global.confirmDialog.ask({
                position: 'top',
                variant: 'delete',
                title: 'Reset All Points',
                message: 'All deleted points will be restored. This action cannot be undone.',
                confirmText: 'Reset',
            })
            if (!ok) return
            currentControl.resetHistory()
            settings.removedSplats = []
            applyPointMapping({ modelEntity, deletedSet: new Set() })
            currentControl.clearSelectionStateOnly()
            deletedSet = new Set()
            applyBtn.disabled = true
            resetBtn.disabled = true
            if (currentControl._activeStrategy) {
                currentControl._activeStrategy._projDirty = true
            }
            events.fire('point-eraser:reset')
            updateUndoRedoButtons()
            resetSelection()
        },
    })

    const applyBtn = makeButton({
        title: 'Apply',
        disabled: true,
        className: 'confirm-btn',
        onClick: applyDeleteSelectedPoints,
    })

    btnRow.appendChild(undoBtn)
    btnRow.appendChild(redoBtn)
    btnRow.appendChild(spacer)
    btnRow.appendChild(applyBtn)
    btnRow.appendChild(resetBtn)
    actionsGroup.appendChild(btnRow)

    container.appendChild(desGroup)
    container.appendChild(viewGroup)
    container.appendChild(modeGroup)
    // container.appendChild(statsGroup)
    container.appendChild(actionsGroup)
    if (currentControl) updateUndoRedoButtons()
    function applyShaderModes() {
        const mat = modelEntity.gsplat.material

        if (isShowSplatMode) {
            mat.shaderChunks.glsl.set('gsplatCornerVS', CHUNK_CORNER_POINT)
            mat.shaderChunks.glsl.set('gsplatModifyVS', CHUNK_MODIFY_POINT)
            mat.setParameter('splat_point_size', 4.0)
            mat.setParameter('splat_selected_color', normalizeColor(selectedColorHex, selectedAlpha))
            mat.setParameter('splat_unselected_color', normalizeColor(unselectedColorHex, unselectedAlpha))
            if (currentControl) {
                currentControl._upload()
            }
        } else {
            mat.shaderChunks.glsl.delete('gsplatCornerVS')
            mat.shaderChunks.glsl.set('gsplatModifyVS', CHUNK_MODIFY_SELECT_ONLY)
            mat.setParameter('splat_selected_color', normalizeColor(selectedColorHex, selectedAlpha))
        }

        if (isShowSplatRing) {
            mat.shaderChunks.glsl.set('gsplatPS', CHUNK_PS_RING)
        } else {
            mat.shaderChunks.glsl.delete('gsplatPS')
        }

        mat.clearVariants()
        app.renderNextFrame = true
    }
    const handles = [
        events.on('inputEvent:redo', onRedo),
        events.on('inputEvent:undo', onUndo),
        events.on('model:loaded', onModelLoaded),
        events.on('point-selection', onPointSelection),
        events.on('inputEvent:enter', applyDeleteSelectedPoints),
        events.on('inputEvent:delete', applyDeleteSelectedPoints),
        events.on('inputEvent:reset-camera', () => {
            resetSelection()
        }),
    ]
    function onPointSelection(selectedSet) {
        if (!selectedSet) return
        applyBtn.disabled = selectedSet.size === 0
        deletedSet = new Set([...settings.removedSplats, ...selectedSet])
        updateUndoRedoButtons()
        global.dataDirty = true
    }
    function applyDeleteSelectedPoints() {
        if (deletedSet.size > 0) {
            applyPointMapping({ modelEntity, deletedSet })
            settings.removedSplats = [...deletedSet]
            currentControl.clearSelectionStateOnly()
            events.fire('point-eraser:commit-delete', settings.removedSplats)
            applyBtn.disabled = true
            resetBtn.disabled = settings.removedSplats.length === 0
            if (currentControl._activeStrategy) {
                currentControl._activeStrategy._projDirty = true
            }
        }
    }
    function onModelLoaded() {
        currentControl = new SelectionController({
            canvas: app.graphicsDevice.canvas,
            camera: camera,
            gsplatComp: modelEntity.gsplat,
            events,
            app: app,
            settings,
        })
        updateUndoRedoButtons()
        applyShaderModes()
    }
    function onUndo() {
        events.fire('point-eraser:undo')
    }
    function onRedo() {
        events.fire('point-eraser:redo')
    }
    function updateUndoRedoButtons() {
        if (!currentControl) return
        undoBtn.disabled = currentControl._historyIndex <= 0
        redoBtn.disabled = currentControl._historyIndex >= currentControl._history.length - 1
    }
    container.cleanup = () => {
        handles.forEach((h) => events.offByHandle(h))
        resetSelection()
        currentControl?.destroy()
        isShowSplatMode = false
        isShowSplatRing = false
        applyShaderModes()
        updateVisiblePoints(settings.removedSplats)
        events.fire('point-eraser:completed')
    }
    return container
}
