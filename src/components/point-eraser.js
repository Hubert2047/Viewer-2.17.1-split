function makePointEraser(global) {
    const { events, settings } = global
    const container = makeSectionWrap()
    let brushRadius = 24
    let isPointerDown = false
    let isShowSplatMode = false
    let isShowSplat = false
    let deletedSet = new Set(settings.removedSplats)
    let currentControl = null
    events.on('model:loaded', () => {
        currentControl = new SelectionController({
            canvas: global.app.graphicsDevice.canvas,
            camera: global.camera,
            gsplatComp: modelEntity.gsplat,
            events,
            app: global.app,
            settings,
        })
        updateUndoRedoButtons()
    })
    if (modelEntity && !currentControl) {
        currentControl = new SelectionController({
            canvas: global.app.graphicsDevice.canvas,
            camera: global.camera,
            gsplatComp: modelEntity.gsplat,
            events,
            app: global.app,
            settings,
        })
    }
    events.on('point-selection', (selectedSet) => {
        if (!selectedSet) return
        applyBtn.disabled = selectedSet.size === 0
        global.dataDirty = true
        deletedSet = new Set([...settings.removedSplats, ...selectedSet])
    })
    // ── Point view toggle ────────────────────────────────────────
    const viewGroup = makeSectionGroup('Point view')

    const splatModeRow = makeRow({ title: 'Point Cloud' })
    const spatModeToggle = makeToggle({
        initialValue: isShowSplatMode,
        onChange: (value) => {
            isShowSplatMode = value
            applyShaderModes()
        },
    })
    splatModeRow.appendChild(spatModeToggle)

    const showSplatRow = makeRow({ title: 'Splat Outline' })
    const showSplatToggle = makeToggle({
        initialValue: isShowSplat,
        onChange: (value) => {
            isShowSplat = value
            applyShaderModes()
        },
    })
    showSplatRow.appendChild(showSplatToggle)

    const pointSizeRow = makeRow({ title: 'Point size' })
    const pointSizeInput = makeInput({
        type: 'number',
        value: 4,
        min: 1,
        max: 20,
        name: 'slider-number',
        className: 'small-input',
        onChange: (v) => {
            modelEntity.gsplat.material.setParameter('splat_point_size', v)
            global.app.renderNextFrame = true
        },
    })
    pointSizeRow.appendChild(pointSizeInput)

    viewGroup.appendChild(splatModeRow)
    viewGroup.appendChild(showSplatRow)
    viewGroup.appendChild(pointSizeRow)

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
                brushSizeRow.style.display = id === 'brush' ? 'flex' : 'none'
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
        brushSizeRow.style.display = 'none'
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
    brushSizeRow.appendChild(brushInput)
    modeGroup.appendChild(brushSizeRow)

    // // ── Stats ────────────────────────────────────────────────────
    // const statsGroup = makeSectionGroup('Statistics')

    // const erasedRow = makeRow({ title: 'Erased' })
    // const erasedVal = document.createElement('span')
    // erasedVal.classList.add('row-value')
    // erasedVal.style.color = 'var(--primary)'
    // erasedVal.textContent = '0'
    // erasedRow.appendChild(erasedVal)

    // statsGroup.appendChild(erasedRow)

    // events.on('point-eraser:stats', ({ total, erased }) => {
    //     erasedVal.textContent = erased.toLocaleString()
    // })

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
    function updateUndoRedoButtons() {
        if (!currentControl) return
        undoBtn.disabled = currentControl._historyIndex <= 0
        redoBtn.disabled = currentControl._historyIndex >= currentControl._history.length - 1
    }

    events.on('point-selection', updateUndoRedoButtons)
    events.on('point-eraser:deleted-changed', updateUndoRedoButtons)
    const spacer = document.createElement('div')
    spacer.classList.add('spacer')

    // const deleteBtn = makeButton({
    //     title: 'Delete',
    //     className: 'delete-btn',
    //     icon: ICONS.delete,
    //     onClick: () => events.fire('point-eraser:cancel'),
    // })

    const applyBtn = makeButton({
        title: 'Apply',
        disabled: true,
        className: 'confirm-btn',
        onClick: () => {
            if (deletedSet.size > 0) {
                applyPointMapping({ modelEntity, deletedSet })
                settings.removedSplats = [...deletedSet]
                currentControl._clearSelectionStateOnly()
                events.fire('point-eraser:commit-delete', settings.removedSplats)
                applyBtn.disabled = true
            }
        },
    })

    btnRow.appendChild(undoBtn)
    btnRow.appendChild(redoBtn)
    btnRow.appendChild(spacer)
    btnRow.appendChild(applyBtn)
    // btnRow.appendChild(deleteBtn)
    actionsGroup.appendChild(btnRow)

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
        } else {
            mat.shaderChunks.glsl.delete('gsplatCornerVS')
            mat.shaderChunks.glsl.delete('gsplatModifyVS')
        }

        if (isShowSplat) {
            mat.shaderChunks.glsl.set('gsplatPS', CHUNK_PS_RING)
        } else {
            mat.shaderChunks.glsl.delete('gsplatPS')
        }

        mat.clearVariants()
        global.app.renderNextFrame = true
    }
    let activeSection = ''
    events.on('inputEvent:redo', () => {
        if (global.activeSidebarId !== 'point-eraser') return
        events.fire('point-eraser:redo')
    })
    events.on('inputEvent:undo', () => {
        if (global.activeSidebarId !== 'point-eraser') return
        events.fire('point-eraser:undo')
    })
    events.on('sidebar:clicked', ({ id }) => {
        const showSplatMode = id === 'point-eraser'
        if (isShowSplatMode === showSplatMode) return
        isShowSplatMode = showSplatMode
        spatModeToggle.setValue(isShowSplatMode)
        resetSelection()
        applyShaderModes()
    })
    return container
}
