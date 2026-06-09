function makeMessagesSection(body, global, dom) {
    const editor = new MessageEditorUI(body, { dom, global })
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
    events.on('inputEvent:reset', () => {
        onCancel()
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
        const localCenter = getPivotCenter(modelEntity)
        settings.pivot.position = { x: localCenter.x, y: localCenter.y, z: localCenter.z }
        setPivotConfigured(true)
        editPivotPos = localCenter
        global.dataDirty = true
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
    const isSherical = settings.model === 'spherical'
    const editGroup = makeEditGroup(events, ['sidebar:active', 'sidebar:clicked'])
    const container = makeSectionWrap()

    const isOrientation = !isSherical && step === 2
    if (isOrientation) {
        container.appendChild(makeOrientationGroup(global, editGroup))
        // container.appendChild(makeCameraLimitsGroup(global, editGroup))
    }
    if (step === 1) {
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
    const { settings, events } = global
    const container = makeSectionWrap()
    //general
    const generalGroup = makeSectionGroup('General')

    const { row: backgroundColor } = makeColorPicker({
        label: 'Background',
        defaultValue: settings.background.color,
        onChange: (color) => {
            settings.background.color = color
            events.fire('viewer:background-changed', color)
            global.dataDirty = true
        },
    })

    const inertiaRow = makeRow({ title: 'Inertia' })
    const inertiaToggleEl = makeToggle({
        value: settings.inertia,
        onChange: (value) => {
            settings.inertia = value
            events.fire('viewer:inertia', value)
            global.dataDirty = true
        },
    })
    inertiaRow.appendChild(inertiaToggleEl)

    const autoHideUIRow = makeRow({ title: 'Auto Hide UI' })
    const autoHideUIToggleEl = makeToggle({
        value: settings.autoHideUI,
        onChange: (value) => {
            settings.autoHideUI = value
            events.fire('viewer:auto-hide-ui', value)
            global.dataDirty = true
        },
    })
    autoHideUIRow.appendChild(autoHideUIToggleEl)

    const lockZoomInRow = makeRow({ title: 'Lock Zoom In' })
    const lockZoomInToggleEl = makeToggle({
        value: settings.lockZoomIn.locked,
        onChange: (value) => {
            events.fire('viewer:lock-zoom-in', value)
            global.dataDirty = true
        },
    })
    lockZoomInRow.appendChild(lockZoomInToggleEl)

    generalGroup.appendChild(backgroundColor)
    generalGroup.appendChild(inertiaRow)
    generalGroup.appendChild(autoHideUIRow)
    generalGroup.appendChild(lockZoomInRow)
    //iniview
    const initviewHint =
        'Set the camera angle that viewers see when the model first loads. Rotate to your preferred angle, then click Save current view. Click Default view to reset.'
    const initviewGroup = makeSectionGroup('Initial View', initviewHint)
    initviewGroup.appendChild(makeInitViewGroup(events, settings))

    //spin
    const spinGroup = makeSectionGroup('Spin')

    const spinEnabledRow = makeRow({ title: 'Enabled' })
    const spinEnabledToggleEl = makeToggle({
        value: settings.spin.enabled,
        onChange: (value) => {
            settings.spin.enabled = !settings.spin.enabled
            if (settings.spin.enabled) {
                spinContinuousRow.classList.remove('hidden')
                spinOnStartRow.classList.remove('hidden')
                speedRow.classList.remove('hidden')
            } else {
                spinContinuousRow.classList.add('hidden')
                spinOnStartRow.classList.add('hidden')
                speedRow.classList.add('hidden')
            }
            global.dataDirty = true
            events.fire('spin:enabled', value)
            events.fire('re-render:control-wrap', value)
        },
    })
    spinEnabledRow.appendChild(spinEnabledToggleEl)

    const speedRow = makeRow({ title: 'Speed', show: settings.spin.enabled, className: 'spin-speed' })
    const speedInput = makeInput({
        type: 'number',
        value: settings.spin.speed,
        min: 1,
        max: 999,
        name: 'slider-number',
        className: 'spin-input',
        onChange: (v) => {
            settings.spin.speed = v
            events.fire('spin-speed', v)
            global.dataDirty = true
        },
    })
    speedRow.appendChild(speedInput)

    const spinContinuousRow = makeRow({ title: 'Continuous', show: settings.spin.enabled })
    const spinContinuousToggleEl = makeToggle({
        value: settings.spin.continuous,
        onChange: (value) => {
            settings.spin.continuous = !settings.spin.continuous
            events.fire('spin-continuous', value)
            global.dataDirty = true
        },
    })
    spinContinuousRow.appendChild(spinContinuousToggleEl)

    const spinOnStartRow = makeRow({ title: 'Auto Start', show: settings.spin.enabled })
    const spinOnStartToggleEl = makeToggle({
        value: settings.spin.autoStart,
        onChange: (value) => {
            settings.spin.autoStart = !settings.spin.autoStart
            global.dataDirty = true
        },
    })
    spinOnStartRow.appendChild(spinOnStartToggleEl)

    spinGroup.appendChild(spinEnabledRow)
    spinGroup.appendChild(speedRow)
    spinGroup.appendChild(spinContinuousRow)
    spinGroup.appendChild(spinOnStartRow)

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
        },
    })

    el.appendChild(btn)
}
function makeSidebar(global, dom) {
    const { events } = global
    const SIDEBAR_WIDTH = '360px'
    const isSherical = global.settings.model === 'spherical'
    const totalSteps = isSherical ? 2 : 3
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
                renderStep()
            }
            events.fire('next-step')
        },
    })
    header.appendChild(nextBtn)

    const backToSetupModelBtn = makeButton({
        className: 'reset-setup-btn',
        title: 'Back',
        onClick: async () => {
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
                            setupStep: 1,
                            contentUrl: global.settings.contentUrl,
                            base64: global.settings.base64,
                            pivot: global.settings.pivot,
                            model: global.settings.model,
                            cameras: global.settings.cameras,
                            v: global.settings.v,
                        })
                        break
                    default:
                        Object.assign(global.settings, JSON.parse(JSON.stringify(defaultSettings)), {
                            setupStep: 2,
                            contentUrl: global.settings.contentUrl,
                            base64: global.settings.base64,
                            initview: global.settings.initview,
                            pivot: global.settings.pivot,
                            orientation: global.settings.orientation,
                            model: global.settings.model,
                            cameras: global.settings.cameras,
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
                id: 'message',
                title: 'Messages',
                classname: 'message-section',
                body: (el) => makeMessagesSection(el, global, dom),
                events,
            }),
        )
        contentArea.appendChild(
            makeSection({
                id: 'dimensions',
                title: 'Dimensions',
                classname: 'dimension-section',
                body: (el) => makeDimensionSection(el, global, dom),
                events,
            }),
        )

        contentArea.appendChild(
            makeSection({
                id: 'measurement',
                title: 'Measurement',
                classname: 'measurement-section',
                body: (el) => makeMeasurementSection(el, global),
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
