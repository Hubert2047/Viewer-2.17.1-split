function makePointEraser(global) {
    const { events, settings, camera, app } = global
    const container = makeSectionWrap()
    let brushRadius = 24
    let isPointerDown = false
    let isShowSplatMode = false
    let isShowSplatRing = false
    let showAabbBox = true
    let deletedSet = new Set(settings.removedSplats)
    let currentControl = null
    let currentSelectedSet = new Set()
    let backgroundColor = settings.background.color
    let selectedColorHex = '#FFD900'
    let selectedAlpha = 1
    // let unselectedColorHex = '#F95F4D'
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
    hint.textContent =
        'Stray points can push the bounding box out. Delete them so the box tightly wraps your model — skip if it already fits.'
    hint.style.cssText = 'font-size: 0.8125rem; color: #8c9fb4; line-height: 1.5; margin: 0;'

    desGroup.appendChild(hint)

    const aabbBoxRow = makeRow({ title: 'Show Bounding Box' })
    // const aabbBoxToggle = makeToggle({
    //     initialValue: showAabbBox,
    //     onChange: (value) => {
    //         showAabbBox = value
    //         if (!showAabbBox) {
    //             cornerEntity.enabled = false
    //         }
    //         app.renderNextFrame = true
    //     },
    // })
    // aabbBoxRow.el.appendChild(aabbBoxToggle)
    // desGroup.appendChild(aabbBoxRow.el)
    // ── Point view ────────────────────────────────────────
    const viewGroup = makeSectionGroup('View')

    // const splatModeRow = makeRow({ title: 'Cloud Mode' })
    // const spatModeToggle = makeToggle({
    //     initialValue: isShowSplatMode,
    //     onChange: (value) => {
    //         isShowSplatMode = value
    //         applyShaderModes()
    //     },
    // })
    // splatModeRow.el.appendChild(spatModeToggle)

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

    // const { row: unselectedColorRow } = makeColorPickerDropdown({
    //     label: 'Unselected Color',
    //     color: unselectedColorHex,
    //     alpha: unselectedAlpha,
    //     hasAlpha: true,
    //     debounceMs: 0,
    //     onChange: ({ r, g, b, alpha }) => {
    //         unselectedColorHex = `rgb(${r},${g},${b})`
    //         unselectedAlpha = alpha
    //         if (!modelEntity?.gsplat?.material) return
    //         modelEntity.gsplat.material.setParameter(
    //             'splat_unselected_color',
    //             normalizeColor(unselectedColorHex, unselectedAlpha),
    //         )
    //         app.renderNextFrame = true
    //     },
    // })

    // viewGroup.appendChild(splatModeRow.el)
    // viewGroup.appendChild(showSplatRow)
    viewGroup.appendChild(backgroundRow)
    viewGroup.appendChild(selectedColorRow)
    // viewGroup.appendChild(unselectedColorRow)

    // ── Selection mode ───────────────────────────────────────────
    const selectionHint = `
  <div class="hint-row">
    1.<span><kbd>Ctrl</kbd> + <kbd>D</kbd></span>
    <span>Deselect points</span>
  </div>
   <div class="hint-row">
    2.<span><kbd>Delete</kbd></span>
    <span>Delete selected points</span>
  </div>
  <div class="hint-row">
    3.<span><kbd>Ctrl</kbd> + <kbd>I</kbd></span>
    <span>Invert selection</span>
  </div>
  <div class="hint-row">
    4.<span><kbd>Shift</kbd> + drag</span>
    <span>Add to current selection</span>
  </div>
  <div class="hint-row">
    5.<span><kbd>Ctrl</kbd> + drag</span>
    <span>Move model</span>
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
            title: 'Rect (E)',
        },
        {
            id: 'lasso',
            label: 'Lasso',
            icon: ICONS.lasso,
            title: 'Lasso (L)',
        },
        {
            id: 'polygon',
            label: 'Polygon',
            icon: ICONS.polygon,
            title: 'Polygon (P)',
        },
        {
            id: 'brush',
            label: 'Brush',
            icon: ICONS.brush,
            title: 'Brush (B)',
        },
    ]

    let activeMode = null
    let activeBtn = null
    const modeBtns = modes.map(({ id, label, icon, title }) => {
        const btn = document.createElement('button')
        btn.classList.add('tool-mode-btn')
        btn.dataset.mode = id
        btn.innerHTML = `${icon}<span>${label}</span>`
        btn.title = title
        btn.onclick = () => selectMode(id)
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
        className: 'icon-circle-btn',
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
            currentSelectedSet = new Set()
            deleteBtn.disabled = true
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

    const deleteBtn = makeButton({
        title: 'Delete',
        disabled: true,
        className: 'confirm-btn',
        onClick: applyDeleteSelectedPoints,
    })

    btnRow.appendChild(undoBtn)
    btnRow.appendChild(redoBtn)
    btnRow.appendChild(resetBtn)
    btnRow.appendChild(spacer)
    btnRow.appendChild(deleteBtn)
    actionsGroup.appendChild(btnRow)

    container.appendChild(desGroup)
    container.appendChild(viewGroup)
    container.appendChild(modeGroup)
    container.appendChild(actionsGroup)
    if (currentControl) updateUndoRedoButtons()
    function selectMode(id) {
        if (!currentControl) return
        if (activeMode === id) {
            resetSelection()
            return
        }
        activeBtn = modeBtns.find((b) => b.dataset.mode === id) ?? null
        events.fire('point-eraser:active', true)
        activeMode = id
        modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === id))
        brushSizeRow.setShow(id === 'brush')
        currentControl.setMode(id)
    }
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
            // mat.setParameter('splat_unselected_color', normalizeColor(unselectedColorHex, unselectedAlpha))
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
        currentSelectedSet = selectedSet
        deleteBtn.disabled = selectedSet.size === 0
        deletedSet = new Set([...settings.removedSplats, ...selectedSet])
        updateUndoRedoButtons()
        global.dataDirty = true
    }

    function applyKeepSelectedPoints() {
        if (currentSelectedSet.size === 0) return
        const totalSplats = modelEntity.gsplat.resource.numSplats
        const newDeletedSet = new Set()
        for (let i = 0; i < totalSplats; i++) {
            if (!currentSelectedSet.has(i)) newDeletedSet.add(i)
        }

        if (newDeletedSet.size >= totalSplats) {
            showToast('Cannot delete all points — at least one point must remain.', {
                type: 'warning',
                duration: 2500,
            })
            return
        }

        applyPointMapping({ modelEntity, deletedSet: newDeletedSet })
        settings.removedSplats = [...newDeletedSet]
        currentControl.clearSelectionStateOnly()
        events.fire('point-eraser:commit-delete', settings.removedSplats)

        deleteBtn.disabled = true
        resetBtn.disabled = settings.removedSplats.length === 0

        if (currentControl._activeStrategy) {
            currentControl._activeStrategy._projDirty = true
        }
        events.fire('point-eraser:deleted-set-changed', settings.removedSplats)
    }

    function applyDeleteSelectedPoints() {
        if (deleteBtn.disabled) return
        if (deletedSet.size > 0) {
            const totalSplats = modelEntity.gsplat.resource.numSplats
            if (deletedSet.size >= totalSplats) {
                showToast('Cannot delete all points — at least one point must remain.', {
                    type: 'warning',
                    duration: 2500,
                })
                return
            }
            applyPointMapping({ modelEntity, deletedSet })
            settings.removedSplats = [...deletedSet]
            currentControl.clearSelectionStateOnly()
            events.fire('point-eraser:commit-delete', settings.removedSplats)
            deleteBtn.disabled = true
            resetBtn.disabled = settings.removedSplats.length === 0
            if (currentControl._activeStrategy) {
                currentControl._activeStrategy._projDirty = true
            }
            events.fire('point-eraser:deleted-set-changed', settings.removedSplats)
        }
    }
    function applyInverseSelection() {
        if (!currentControl) return
        const totalSplats = modelEntity.gsplat.resource.numSplats
        const alreadyRemoved = new Set(settings.removedSplats)
        const inverted = new Set()
        for (let i = 0; i < totalSplats; i++) {
            if (alreadyRemoved.has(i)) continue
            if (!currentSelectedSet.has(i)) inverted.add(i)
        }
        currentControl.setSelectedIndices(inverted)
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
    function buildBoxPositions() {
        if (!currentAabb) updateAabb()
        if (!currentAabb) return
        const { center, halfExtents } = currentAabb
        if (!center || !halfExtents) return null
        const worldMat = modelEntity.getWorldTransform()
        const tp = (v) => {
            const out = new Vec3()
            worldMat.transformPoint(v, out)
            return out
        }

        const signs = [-1, 1]
        const corners = []
        signs.forEach((sx) => {
            signs.forEach((sy) => {
                signs.forEach((sz) => {
                    corners.push(
                        tp(
                            new Vec3(
                                center.x + sx * halfExtents.x,
                                center.y + sy * halfExtents.y,
                                center.z + sz * halfExtents.z,
                            ),
                        ),
                    )
                })
            })
        })
        const edges = [
            [0, 1],
            [0, 2],
            [0, 4],
            [1, 3],
            [1, 5],
            [2, 3],
            [2, 6],
            [3, 7],
            [4, 5],
            [4, 6],
            [5, 7],
            [6, 7],
        ]

        const pos = []
        edges.forEach(([a, b]) => {
            const pa = corners[a]
            const pb = corners[b]
            pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z)
        })

        return pos
    }
    function drawAabbCorners() {
        if (!modelEntity || !showAabbBox) {
            cornerEntity.enabled = false
            return
        }
        const pos = buildBoxPositions()
        updateCameraFarClipForAabb()
        if (!pos) {
            cornerEntity.enabled = false
            return
        }
        cornerEntity.enabled = true
        cornerLineMesh.setPositions(pos)
        cornerLineMesh.update(PRIMITIVE_LINES, true)
    }

    function updateCameraFarClipForAabb() {
        if (!currentAabb) return
        const camPos = camera.getPosition()
        const distToCenter = camPos.distance(currentAabb.center)
        const radius = currentAabb.halfExtents.length()
        const required = distToCenter + radius
        camera.camera.farClip = Math.max(1000, required * 1.2)
    }
    const handles = [
        events.on('inputEvent:redo', onRedo),
        events.on('inputEvent:undo', onUndo),
        events.on('model:loaded', onModelLoaded),
        events.on('point-selection', onPointSelection),
        events.on('inputEvent:ctrl', (active) => {
            events.fire('point-eraser:ctrl-active', active)
        }),
        events.on('inputEvent:invert', () => applyInverseSelection()),
        events.on('point-eraser:deleted-set-changed', updateAabb),
        events.on('inputEvent:Delete', applyDeleteSelectedPoints),
        events.on('inputEvent:r', () => {
            resetSelection()
        }),
        events.on('inputEvent:deselect', () => {
            events.fire('point-eraser:cancel')
        }),
        events.on('inputEvent:e', () => selectMode('rect')),
        events.on('inputEvent:b', () => selectMode('brush')),
        events.on('inputEvent:p', () => selectMode('polygon')),
        events.on('inputEvent:l', () => selectMode('lasso')),
        events.on('ortery:initialized', () => {
            events.fire('point-eraser:commit-delete', [])
        }),
    ]
    const updateAabbHandle = app.on('framerender', drawAabbCorners)
    container.cleanup = () => {
        camera.camera.farClip = 1000
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
