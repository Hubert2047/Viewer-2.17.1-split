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
    let aabbColor = new Color(1, 0, 0, 1)
    let currentAabb = null
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
        app.renderNextFrame = true
    }

    // ── Remove noise ────────────────────────────────────────
    const desGroup = makeSectionGroup('Remove Noise')

    const hint = document.createElement('p')
    hint.textContent = 'Select and delete unwanted points in the 3D spatial background'
    hint.style.cssText = 'font-size: 0.8125rem; color: #8c9fb4; line-height: 1.5; margin: 0;'

    desGroup.appendChild(hint)
    // ── Point view ────────────────────────────────────────
    const viewGroup = makeSectionGroup('View')

    const splatModeRow = makeRow({ title: 'Cloud Mode' })
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
            modelEntity.gsplat.material.setParameter(
                'splat_selected_color',
                normalizeColor(selectedColorHex, selectedAlpha),
            )
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
            modelEntity.gsplat.material.setParameter(
                'splat_unselected_color',
                normalizeColor(unselectedColorHex, unselectedAlpha),
            )
            app.renderNextFrame = true
        },
    })

    viewGroup.appendChild(splatModeRow.el)
    // viewGroup.appendChild(showSplatRow)
    viewGroup.appendChild(backgroundRow)
    viewGroup.appendChild(selectedColorRow)
    viewGroup.appendChild(unselectedColorRow)

    // ── Selection mode ───────────────────────────────────────────
    const selectionHint = `
  <div class="hint-row">
    1.<span><kbd>Delete</kbd> / <kbd>Enter</kbd></span>
    <span>Delete selected points</span>
  </div>
  <div class="hint-row">
    2.<span><kbd>Esc</kbd></span>
    <span>Deselect points</span>
  </div>
`

    const modeGroup = makeSectionGroup('Selection mode', selectionHint)
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
    brushSizeRow.setShow(false)
    modeGroup.appendChild(brushSizeRow.el)

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
            currentControl._pushHistory()
            deletedSet = new Set()
            applyBtn.disabled = true
            resetBtn.disabled = true
            if (currentControl._activeStrategy) {
                currentControl._activeStrategy._projDirty = true
            }
            events.fire('point-eraser:reset')
            updateUndoRedoButtons()
            resetSelection()
            events.fire('point-eraser:deleted-set-changed', settings.removedSplats)
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
    container.appendChild(actionsGroup)
    if (currentControl) updateUndoRedoButtons()
    function resetSelection() {
        events.fire('point-eraser:active', false)
        activeMode = null
        if (activeBtn) activeBtn.classList.remove('active')
        brushSizeRow.setShow(false)
        currentControl.setMode(null)
    }
    function applyShaderModes() {
        const mat = modelEntity.gsplat.material

        if (isShowSplatMode) {
            mat.shaderChunks.glsl.set('gsplatCornerVS', CHUNK_CORNER_POINT)
            mat.shaderChunks.glsl.set('gsplatModifyVS', CHUNK_MODIFY_POINT)
            mat.setParameter('splat_point_size', 5.0)
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
            events.fire('point-eraser:deleted-set-changed', settings.removedSplats)
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

    const layers = app.scene.layers
    const worldLayer = layers.getLayerByName('World')
    const layerAabbCorners = new Layer({ name: 'AabbCorners' })
    const worldIndex = layers.getOpaqueIndex(worldLayer)
    layers.insert(layerAabbCorners, worldIndex)
    camera.camera.layers = [...camera.camera.layers, layerAabbCorners.id]

    const cornerLineMesh = new Mesh(app.graphicsDevice)
    let cornerLineMat = new StandardMaterial()
    cornerLineMat.diffuse = new Color(0, 0, 0)
    cornerLineMat.blendType = BLEND_NORMAL
    cornerLineMat.depthTest = true
    cornerLineMat.depthWrite = true
    cornerLineMat.useLighting = false
    cornerLineMat.cull = CULLFACE_NONE
    cornerLineMat.emissive = aabbColor
    cornerLineMat.depthBias = -0.1
    cornerLineMat.slopeDepthBias = -0.1
    cornerLineMat.alphaToCoverage = true
    cornerLineMat.update()

    const cornerEntity = new Entity('aabb-corners')
    app.root.addChild(cornerEntity)
    const cornerMi = new MeshInstance(cornerLineMesh, cornerLineMat)
    cornerMi.cull = false
    cornerEntity.addComponent('render', {
        layers: [layerAabbCorners.id],
        meshInstances: [cornerMi],
    })
    cornerEntity.enabled = false

    function updateAabb() {
        const { bbox } = calBbox({ modelEntity, removedSplats: settings.removedSplats, opacityThreshold: -1 })
        if (!isFinite(bbox.halfExtents.x) || bbox.halfExtents.x < 0) {
            currentAabb = null
            return
        }

        const PADDING_RATIO = 0.02
        const paddedHalfExtents = new Vec3(
            bbox.halfExtents.x * (1 + PADDING_RATIO),
            bbox.halfExtents.y * (1 + PADDING_RATIO),
            bbox.halfExtents.z * (1 + PADDING_RATIO),
        )

        currentAabb = {
            center: bbox.center,
            halfExtents: paddedHalfExtents,
        }
    }
    function buildCornerPositions() {
        if (!currentAabb) updateAabb()
        const { center, halfExtents } = currentAabb
        if (!center || !halfExtents) return null
        const worldMat = modelEntity.getWorldTransform()
        const tp = (v) => {
            const out = new Vec3()
            worldMat.transformPoint(v, out)
            return out
        }
        const sizeX = halfExtents.x * 0.2
        const sizeY = halfExtents.y * 0.2
        const sizeZ = halfExtents.z * 0.2
        const pos = []
        const signs = [-1, 1]

        signs.forEach((sx) => {
            signs.forEach((sy) => {
                signs.forEach((sz) => {
                    const corner = new Vec3(
                        center.x + sx * halfExtents.x,
                        center.y + sy * halfExtents.y,
                        center.z + sz * halfExtents.z,
                    )
                    const armX = new Vec3(corner.x - sx * sizeX, corner.y, corner.z)
                    const armY = new Vec3(corner.x, corner.y - sy * sizeY, corner.z)
                    const armZ = new Vec3(corner.x, corner.y, corner.z - sz * sizeZ)

                    const wCorner = tp(corner)
                    const wArmX = tp(armX)
                    const wArmY = tp(armY)
                    const wArmZ = tp(armZ)

                    pos.push(wCorner.x, wCorner.y, wCorner.z, wArmX.x, wArmX.y, wArmX.z)
                    pos.push(wCorner.x, wCorner.y, wCorner.z, wArmY.x, wArmY.y, wArmY.z)
                    pos.push(wCorner.x, wCorner.y, wCorner.z, wArmZ.x, wArmZ.y, wArmZ.z)
                })
            })
        })

        return pos
    }
    function drawAabbCorners() {
        if (!modelEntity) {
            cornerEntity.enabled = false
            return
        }
        const pos = buildCornerPositions()
        if (!pos) {
            cornerEntity.enabled = false
            return
        }
        cornerEntity.enabled = true
        cornerLineMesh.setPositions(pos)
        cornerLineMesh.update(PRIMITIVE_LINES, false)
    }
    const handles = [
        events.on('inputEvent:redo', onRedo),
        events.on('inputEvent:undo', onUndo),
        events.on('model:loaded', onModelLoaded),
        events.on('point-selection', onPointSelection),
        events.on('point-eraser:deleted-set-changed', updateAabb),
        events.on('inputEvent:enter', applyDeleteSelectedPoints),
        events.on('inputEvent:delete', applyDeleteSelectedPoints),
        events.on('inputEvent:reset-camera', () => {
            resetSelection()
        }),
        events.on('inputEvent:esc', () => {
            events.fire('point-eraser:cancel')
        }),
    ]
    const updateAabbHandle = app.on('framerender', drawAabbCorners)
    container.cleanup = () => {
        cornerEntity.enabled = false
        updateAabbHandle.off()
        handles.forEach((h) => events.offByHandle(h))
        resetSelection()
        currentControl?.destroy()
        isShowSplatMode = false
        isShowSplatRing = false
        applyShaderModes()
        events.fire('point-eraser:completed')
    }
    return container
}
