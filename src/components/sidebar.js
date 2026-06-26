function makeMessagesSection(body, global, dom) {
    const editor = new MessageEditorUI(body, { dom, global })
    editor.mount()
}
function makeSection({ id, title, body: renderBody, classname = '', global, icon }) {
    const { events } = global
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
    section._cleanup = () => body._cleanup?.()
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
        if (global.recording) {
            showToast('This action is unavailable while recording.', {
                duration: 1500,
                type: 'warning',
            })
            return
        }
        const isOpen = body.style.display !== 'none'
        events.fire('sidebar:clicked', { id, open: !isOpen })
        if (isOpen) {
            body.style.display = 'none'
            chevron.style.transform = ''
            header.classList.remove('active')
            return
        }
        global.activeSidebarId = id
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
    let editPivotPos = settings.pivot.position
    let currrentPivotPos = null
    let isEditing = false
    const container = document.createElement('div')
    container.classList.add('section-wrap')
    const {
        row: positionRow,
        setDisabled: setInputsDisabled,
        setValues: setInputValues,
    } = makeVec3Inputs({
        title: 'Position',
        disabled: true,
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            global.dataDirty = true
            events.fire('pivot:positionsynced', { x, y, z })
        },
    })
    if (settings.pivot.position) {
        setInputValues(settings.pivot.position)
    }
    const noPivotRow = document.createElement('div')
    noPivotRow.classList.add('no-configured-row')
    const noPivotText = document.createElement('span')
    noPivotText.textContent = 'No pivot configured'
    const addBtn = document.createElement('button')
    addBtn.classList.add('add-btn')
    addBtn.textContent = '+ Add'
    addBtn.onclick = () => {
        const weight = getModelWeight(modelEntity, settings.removedSplats)
        settings.pivot.position = { x: weight.x, y: weight.y, z: weight.z }
        setPivotConfigured(true)
        editPivotPos = weight
        global.dataDirty = true
        events.fire('pivot:positionsynced', weight)
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
    const onDelete = async () => {
        const ok = await global.confirmDialog.ask({
            position: 'top',
            variant: 'delete',
            title: 'Delete pivot point',
            message: 'Pivot point data will be permanently deleted.',
            confirmText: 'Delete',
        })
        if (!ok) return
        editPivotPos = null
        currrentPivotPos = null
        setPivotConfigured(false)
        global.dataDirty = true
        events.fire('pivot:delete')
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
            const btnEdit = makeButton({
                title: 'Edit',
                className: 'edit-btn',
                onClick: () => {
                    onEdit(editPivotPos)
                    events.fire('pivot:edit')
                },
            })
            const btnDelete = makeButton({
                title: 'Delete',
                icon: ICONS.trash,
                className: 'delete-btn',
                onClick: onDelete,
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
    if (settings.pivotPos) {
        const p = settings.pivotPos
        setInputValues({ x: p.x, y: p.y, z: p.z })
    }

    container.appendChild(noPivotRow)
    container.appendChild(hasPivotWrap)
    group.appendChild(container)

    renderBtns()
    setPivotConfigured(!!settings.pivot.position)
    const handles = [
        events.on('inputEvent:reset-camera', onCancel),
        events.on('pivot:positionsynced', ({ x, y, z }) => {
            setInputValues({ x, y, z })
            currrentPivotPos = { x, y, z }
        }),
    ]
    group._cleanup = () => {
        handles.forEach((h) => events.offByHandle(h))
    }
    return group
}
function makePoster(el, global) {
    const { events, settings } = global
    let editPoster = settings.poster ? { ...settings.poster } : { name: 'poster' }
    const container = makeSectionWrap()

    const capturePictureHint =
        'Please copy the image into the <b style="color:var(--primary)">images/</b> folder and ensure it is included when sharing.'
    const capturePicture = makeSectionGroup('Capture Poster', capturePictureHint)

    const hintText = document.createElement('p')
    hintText.style.cssText = 'font-size:0.8125rem; color:rgb(140,159,180); margin:0; line-height:1.6;'
    hintText.textContent =
        'Capture a snapshot of the current scene view. This poster image will be displayed while the 3D model is loading, progressively refining as data arrives.'

    const filenameRow = makeRow({ title: 'Filename' })
    const filenameInput = makeInput({
        type: 'text',
        placeholder: 'capture',
        value: editPoster.name,
        onChange: (value) => {
            editPoster.name = value
            global.dataDirty = true
        },
    })
    filenameRow.el.appendChild(filenameInput)

    const captureBtn = makeButton({
        title: 'Capture',
        className: 'add-btn',
        onClick: () => {
            handleCapturePicture({ app: global.app, name: editPoster.name })
            global.dataDirty = true
        },
    })
    captureBtn.style.cssText = 'justify-content:center; width:100%; font-size:0.8125rem'

    capturePicture.appendChild(hintText)
    capturePicture.appendChild(filenameRow.el)
    capturePicture.appendChild(captureBtn)

    container.appendChild(capturePicture)
    el.appendChild(container)
}
function makeModelSection(el, global) {
    const { settings, events } = global
    const step = settings.setupStep
    const editGroup = makeEditGroup(events, ['sidebar:active', 'sidebar:clicked'])
    const container = makeSectionWrap()
    let currentCom = null
    switch (step) {
        case 1: {
            currentCom = makePointEraser(global)
            break
        }
        case 2:
            currentCom = makePivotGroup(global, editGroup)
            break
        default:
            currentCom = makeOrientationGroup(global, editGroup)
            break
    }
    container.appendChild(currentCom)
    el.appendChild(container)
    if (currentCom._cleanup) el._cleanup = currentCom._cleanup
}
function makeInitViewGroup(events, settings, global) {
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
        global.dataDirty = true
    }

    const btnDefault = document.createElement('button')
    btnDefault.classList.add('btn', 'initview-btn')
    btnDefault.textContent = 'Default view'
    btnDefault.onclick = () => {
        updateState(false)
        if (!settings.initview.pose) return
        events.fire('viewer:remove-saved-view')
        global.dataDirty = true
    }

    btnRow.appendChild(btnSave)
    btnRow.appendChild(btnDefault)
    updateState(!!settings.initview.pose)

    wrap.appendChild(btnRow)
    return wrap
}
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

    const lockZoomInRow = makeRow({ title: 'Lock Zoom In' })
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
        'Set the camera angle that viewers see when the model first loads. Rotate to your preferred angle, then click Save current view. Click Default view to reset.'

    const initviewGroup = makeSectionGroup('Initial View', initviewHint)
    initviewGroup.appendChild(makeInitViewGroup(events, settings, global))

    //spin
    const spinGroup = makeSectionGroup('Spin')
    const spinEnabledRow = makeRow({ title: 'Enabled' })
    const spinEnabledToggleEl = makeToggle({
        initialValue: settings.spin.enabled,
        onChange: (value) => {
            settings.spin.enabled = value
            spinContinuousRow.setShow(value)
            spinOnStartRow.setShow(value)
            speedRow.setShow(value)
            directionRow.setShow(value)
            rotationAxisRow?.setShow(value)

            global.dataDirty = true
            events.fire('spin:enabled', value)
            events.fire('re-render:control-wrap', value)
        },
    })
    spinEnabledRow.el.appendChild(spinEnabledToggleEl)

    const speedRow = makeRow({ title: 'Speed', show: settings.spin.enabled, className: 'spin-speed' })
    const speedInput = makeInput({
        type: 'number',
        value: settings.spin.speed,
        min: 1,
        max: 999,
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
    const isSpherical = settings.model === 'spherical'
    let rotationAxisRow
    if (isSpherical) {
        rotationAxisRow = makeRow({ title: 'Rotation Axis', show: settings.spin.enabled })
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
        rotationAxisRow.el.appendChild(axisSelect.el)
    }
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

    const spinOnStartRow = makeRow({ title: 'Auto Start', show: settings.spin.enabled })
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
    if (rotationAxisRow) {
        spinGroup.appendChild(rotationAxisRow.el)
    }
    spinGroup.appendChild(directionRow.el)

    container.appendChild(generalGroup)
    container.appendChild(initviewGroup)
    container.appendChild(spinGroup)

    el.appendChild(container)
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
        variant: 'secondary',
        label: 'Export Location Change Helper',
        onClick: (e) => {
            e.preventDefault()
            if (!tabs) {
                tabs = makeTabs({
                    className: 'helper-tabs',
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
            exportHtml(filename, global)
            // exportPly(modelEntity, global.settings.removedSplats)
        },
    })

    el.appendChild(btn)
}
function makeSidebar(global, dom) {
    const { events } = global
    const SIDEBAR_WIDTH = '400px'
    const isSherical = global.settings.model === 'spherical'
    const totalSteps = isSherical ? 3 : 4
    const minStep = 1

    if (!global.settings.setupStep) global.settings.setupStep = 1

    const sidebar = document.createElement('div')
    sidebar.addEventListener('contextmenu', (e) => {
        e.preventDefault()
    })
    sidebar.id = 'app-sidebar'
    sidebar.classList.add('sidebar')
    sidebar.style.cssText = `width: ${SIDEBAR_WIDTH}`
    sidebar.style.visibility = 'hidden'

    const header = document.createElement('div')
    header.classList.add('sidebar-header')

    const headerTitle = document.createElement('span')
    headerTitle.textContent = 'Settings'
    headerTitle.classList.add('header-title')
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
                events.fire('next-step', global.settings.setupStep)
                renderStep()
            }
        },
    })
    header.appendChild(nextBtn)

    const backToSetupModelBtn = makeButton({
        className: 'reset-setup-btn',
        title: 'Back',
        onClick: async () => {
            if (global.recording) {
                showToast('This action is unavailable while recording.', {
                    duration: 1500,
                    type: 'warning',
                })
                return
            }
            const ok = await global.confirmDialog.ask({
                title: 'Back to Model Setup',
                message: 'When you go back to model setup, your current settings will be lost. Do you want to go back?',
                variant: 'delete',
                position: 'top',
                confirmText: 'Back',
            })
            if (ok) {
                switch (global.settings.model) {
                    case 'spherical':
                        Object.assign(global.settings, JSON.parse(JSON.stringify(defaultSettings)), {
                            setupStep: 2,
                            contentUrl: global.settings.contentUrl,
                            base64: global.settings.base64,
                            pivot: global.settings.pivot,
                            model: global.settings.model,
                            removedSplats: global.settings.removedSplats,
                            v: global.settings.v,
                        })
                        break
                    case 'hemispherical':
                        Object.assign(global.settings, JSON.parse(JSON.stringify(defaultSettings)), {
                            setupStep: 3,
                            contentUrl: global.settings.contentUrl,
                            base64: global.settings.base64,
                            pivot: global.settings.pivot,
                            orientation: global.settings.orientation,
                            model: global.settings.model,
                            removedSplats: global.settings.removedSplats,
                            v: global.settings.v,
                        })
                        break
                    default:
                        Object.assign(global.settings, JSON.parse(JSON.stringify(defaultSettings)), {
                            setupStep: 3,
                            contentUrl: global.settings.contentUrl,
                            base64: global.settings.base64,
                            pivot: global.settings.pivot,
                            orientation: global.settings.orientation,
                            model: global.settings.model,
                            cameras: global.settings.cameras,
                            removedSplats: global.settings.removedSplats,
                            v: global.settings.v,
                        })
                }

                events.fire('setup-reset', global.settings)
                events.fire('re-render:control-wrap')
                renderStep()
            }
        },
    })
    header.appendChild(backToSetupModelBtn)

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
        contentArea._cleanup = () => {
            modelSection._cleanup?.()
            exportSection._cleanup?.()
        }
        const modelSection = makeSection({
            id: 'model',
            title: 'Model',
            classname: 'model-section',
            body: (el) => makeModelSection(el, global),
            global,
        })
        const exportSection = makeSection({
            id: 'export',
            title: 'Export',
            classname: 'export-section',
            body: (el) => makeExportSection(el, global),
            global,
        })
        contentArea.appendChild(modelSection)
        contentArea.appendChild(exportSection)
        setTimeout(() => {
            global.activeSidebarId = 'model'
            events.fire('sidebar:active', 'model')
        }, 0)
    }

    const renderFullStep = () => {
        contentArea._cleanup = () => {
            recordSection._cleanup?.()
        }
        const recordSection = makeSection({
            id: 'record',
            title: 'Record Video',
            classname: 'record-section',
            body: (el) => makeRecordSection(el, global),
            global,
        })
        contentArea.appendChild(
            makeSection({
                id: 'settings',
                title: 'Viewer',
                classname: 'viewer-setting-section',
                body: (el) => makeViewerSection(el, global),
                global,
            }),
        )
        contentArea.appendChild(
            makeSection({
                id: 'message',
                title: 'Messages',
                classname: 'message-section',
                body: (el) => makeMessagesSection(el, global, dom),
                global,
            }),
        )
        contentArea.appendChild(
            makeSection({
                id: 'dimensions',
                title: 'Dimensions',
                classname: 'dimension-section',
                body: (el) => makeDimensionSection(el, global, dom),
                global,
            }),
        )

        // contentArea.appendChild(
        //     makeSection({
        //         id: 'measurement',
        //         title: 'Measurement',
        //         classname: 'measurement-section',
        //         body: (el) => makeMeasurementSection(el, global),
        //         global,
        //     }),
        // )
        // contentArea.appendChild(
        //     makeSection({
        //         id: 'poster',
        //         title: 'Poster',
        //         classname: 'poster-section',
        //         body: (el) => makePoster(el, global),
        //         global,
        //     }),
        // )
        contentArea.appendChild(recordSection)

        contentArea.appendChild(
            makeSection({
                id: 'export',
                title: 'Export',
                classname: 'export-section',
                body: (el) => makeExportSection(el, global),
                global,
            }),
        )
    }

    const renderStep = () => {
        const step = global.settings.setupStep
        contentArea._cleanup?.()
        contentArea._cleanup = null
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
            backToSetupModelBtn.style.display = 'inline-flex'
            renderFullStep()
        } else {
            stepBadge.textContent = `Step ${step} / ${totalSteps}`
            stepBadge.style.display = ''
            backBtn.style.display = step > minStep ? 'inline-flex' : 'none'
            nextBtn.textContent = 'Next'
            nextBtn.style.display = 'inline-flex'
            progressWrap.style.display = 'flex'
            backToSetupModelBtn.style.display = 'none'
            renderModelStep()
        }
    }
    renderStep()
    return sidebar
}
