const initPoster = (events) => {
    const poster = document.getElementById('poster')
    events.on('loaded:changed', () => {
        poster.style.display = 'none'
        document.documentElement.style.setProperty('--canvas-opacity', '1')
    })
    const blur = (progress) => {
        poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`
    }
    events.on('progress:changed', blur)
}

function initHotspotSection(body, global, dom) {
    const editor = new HotspotEditorUI(body, { dom, global })
    editor.mount()
}

function createSection({ id, title, body: renderBody, classname = '', events }) {
    const section = document.createElement('div')
    section.classList.add('section')

    const header = document.createElement('div')
    header.classList.add('section-header')

    const titleEl = document.createElement('span')
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

        body.style.display = 'block'
        chevron.style.transform = 'rotate(90deg)'
        header.classList.add('active')
    }

    const toggle = () => {
        const isOpen = body.style.display !== 'none'

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
    editGroup.register('orientation', {
        cancel: () => onCancel(),
    })
    events.on('hotspot:active', () => onCancel())
    let isEditing = false

    const container = document.createElement('div')
    container.classList.add('orientation-btn-wrap')

    const {
        row: rotationRow,
        setEditable: setInputsEditable,
        setValues: setInputValues,
    } = createVec3Inputs({
        title: 'Rotation',
        onChange: ({ x, y, z }) => {
            if (!isEditing) return
            events.fire('orientation:eulerchange', { x, y, z })
        },
    })
    events.on('ortery:rotate', () => {
        const euler = modelEntity.getLocalEulerAngles(new Vec3())
        events.fire('orientation:eulersynced', { x: euler.x, y: euler.y, z: euler.z })
    })
    events.on('modelEntity:loaded', () => {
        if (settings.orientation) {
            const { rotation: r } = settings.orientation
            const euler = new Quat(r.x, r.y, r.z, r.w).getEulerAngles()
            setInputValues(euler)
        } else {
            const euler = modelEntity.getLocalEulerAngles(new Vec3())
            setInputValues(euler)
        }
    })

    const gizmoRow = document.createElement('div')
    gizmoRow.classList.add('section-group-row')
    gizmoRow.style.display = 'none'
    const gizmoLabel = document.createElement('span')
    gizmoLabel.textContent = 'Rotation Gizmo'

    const track = document.createElement('div')
    track.classList.add('toggle')
    const knob = document.createElement('div')
    knob.classList.add('toggle-knob')
    track.appendChild(knob)

    const setGizmo = (on) => {
        track.classList.toggle('active', on)
        events.fire('gizmo:rotation-enable', on)
    }
    track.addEventListener('click', () => setGizmo(!track.classList.contains('active')))

    gizmoRow.appendChild(gizmoLabel)
    gizmoRow.appendChild(track)

    const btnRow = document.createElement('div')
    btnRow.classList.add('btn-row')
    const onCancel = () => {
        isEditing = false
        setInputsEditable(false)
        gizmoRow.style.display = 'none'
        setGizmo(false)
        if (settings.orientation) {
            const { rotation: r } = settings.orientation
            const euler = new Quat(r.x, r.y, r.z, r.w).getEulerAngles()
            setInputValues(euler)
        } else {
            const euler = modelEntity.getLocalEulerAngles(new Vec3())
            setInputValues(euler)
        }
        renderBtns()
        events.fire('orientation:cancel')
    }

    const renderBtns = () => {
        btnRow.innerHTML = ''
        if (isEditing) {
            const btnCancel = document.createElement('button')
            btnCancel.classList.add('btn', 'cancel-btn')
            btnCancel.textContent = 'Cancel'
            btnCancel.onclick = () => {
                onCancel()
            }

            const btnSave = document.createElement('button')
            btnSave.classList.add('btn', 'confirm-btn')
            btnSave.textContent = 'Apply'
            btnSave.onclick = () => {
                isEditing = false
                setInputsEditable(false)
                gizmoRow.style.display = 'none'
                setGizmo(false)
                events.fire('orientation:save')
                renderBtns()
            }

            btnRow.appendChild(btnCancel)
            btnRow.appendChild(btnSave)
        } else {
            const btnEdit = document.createElement('button')
            btnEdit.classList.add('btn')
            btnEdit.textContent = 'Edit'
            btnEdit.onclick = () => {
                editGroup.startEdit('orientation')
                isEditing = true
                setInputsEditable(true)
                gizmoRow.style.display = 'flex'
                events.fire('orientation:edit')
                renderBtns()
                const euler = modelEntity.getLocalEulerAngles(new Vec3())
                setInputValues(euler)
                events.fire('orientation:eulersynced', { x: euler.x, y: euler.y, z: euler.z })
            }
            btnRow.appendChild(btnEdit)
        }
    }

    events.on('orientation:eulersynced', ({ x, y, z }) => {
        if (!isEditing) return
        setInputValues({ x, y, z })
    })

    container.appendChild(rotationRow)
    container.appendChild(gizmoRow)
    container.appendChild(btnRow)
    group.appendChild(container)

    renderBtns()
}
function renderPivot(group, global, editGroup) {
    const { events, settings } = global
    editGroup.register('pivot', {
        cancel: () => {
            if (!isEditing) return
            onCancel()
        },
    })
    events.on('hotspot:active', () => {
        if (!isEditing) return
        onCancel()
    })
    let editPivotPos = settings.pivot.position
    let currrentPivotPos = null
    let isEditing = false
    const container = document.createElement('div')
    container.classList.add('pivot-wrap')

    const usePivotRow = document.createElement('div')
    usePivotRow.classList.add('section-group-row')
    const usePivotLabel = document.createElement('span')
    usePivotLabel.textContent = 'Enabled'
    const usePivotTrack = document.createElement('div')
    usePivotTrack.classList.add('toggle')
    if (settings.pivot.enabled) usePivotTrack.classList.add('active')
    const usePivotKnob = document.createElement('div')
    usePivotKnob.classList.add('toggle-knob')
    usePivotTrack.appendChild(usePivotKnob)
    usePivotTrack.addEventListener('click', () => {
        const on = !usePivotTrack.classList.contains('active')
        usePivotTrack.classList.toggle('active', on)
        settings.pivot.enabled = on
        events.fire('pivot:use', { enabled: on, position: currrentPivotPos ?? settings.pivot.position })
    })
    usePivotRow.appendChild(usePivotLabel)
    usePivotRow.appendChild(usePivotTrack)

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
        const center = global.bbox.center.clone()
        const invWorld = new Mat4().copy(modelEntity.getWorldTransform()).invert()
        const localCenter = new Vec3()
        invWorld.transformPoint(center, localCenter)
        settings.pivot.position = localCenter.clone()
        setInputValues(localCenter)
        setPivotConfigured(true)
        onEdit(localCenter)
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
        usePivotRow.style.display = has ? 'flex' : 'none'
    }

    events.on('pivot:positionsynced', ({ x, y, z }) => {
        setInputValues({ x, y, z })
        currrentPivotPos = { x, y, z }
    })

    if (settings.pivotPos) {
        const p = settings.pivotPos
        setInputValues({ x: p.x, y: p.y, z: p.z })
    }

    container.appendChild(usePivotRow)
    container.appendChild(noPivotRow)
    container.appendChild(hasPivotWrap)
    group.appendChild(container)

    renderBtns()
    setPivotConfigured(!!settings.pivot.position)
}
function modelSection(el, global) {
    const editGroup = createEditGroup(global.events)
    const groups = [
        {
            show: global.settings.model !== 'spherical',
            label: 'Orientation',
            render: renderOrientation,
        },
        {
            show: true,
            label: 'Pivot Point',
            render: renderPivot,
        },
    ]

    const container = document.createElement('div')
    container.classList.add('viewer-settings-wrap')

    groups
        .filter((g) => g.show)
        .forEach(({ label, render }) => {
            const group = document.createElement('div')
            group.classList.add('section-group')

            const groupTitle = document.createElement('div')
            groupTitle.classList.add('section-group-title')
            groupTitle.textContent = label
            group.appendChild(groupTitle)

            render(group, global, editGroup)
            container.appendChild(group)
        })

    el.appendChild(container)
}

function viewerSettingsSection(el, global) {
    const settings = global.settings
    const container = document.createElement('div')
    container.classList.add('viewer-settings-wrap')
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
            row.addEventListener('click', () => {
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
            row.addEventListener('click', (e) => {
                if (e.target === colorInput) return
                colorInput.click()
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
function dimensionSection(el, global) {}
function exportSection(el, global) {
    const filenameField = document.createElement('div')
    filenameField.classList.add('hotspot-field')

    const label = document.createElement('div')
    label.classList.add('hotspot-label')
    label.textContent = 'File Name'

    const inputWrap = document.createElement('div')
    inputWrap.classList.add('export-input-wrap')

    const input = document.createElement('input')
    input.type = 'text'
    input.value = 'index'
    input.id = 'export-filename'
    input.classList.add('input-field')

    const ext = document.createElement('span')
    ext.classList.add('export-ext')
    ext.textContent = '.html'

    inputWrap.appendChild(input)
    inputWrap.appendChild(ext)
    filenameField.appendChild(label)
    filenameField.appendChild(inputWrap)
    el.appendChild(filenameField)

    const btn = document.createElement('button')
    btn.classList.add('export-btn')
    btn.textContent = 'Export HTML'
    btn.addEventListener('click', () => {
        const filename = (input.value.trim() || 'index') + '.html'
        exportHtml(filename, { settings: global.settings }, global.settings.fileAudioStore)
    })
    el.appendChild(btn)
}
function createSidebar(global, dom) {
    const { events } = global
    const SIDEBAR_WIDTH = '360px'
    const sidebar = document.createElement('div')
    sidebar.id = 'app-sidebar'
    sidebar.classList.add('sidebar')
    sidebar.style.cssText = `width: ${SIDEBAR_WIDTH}`
    sidebar.style.visibility = 'hidden'
    const header = document.createElement('div')
    header.classList.add('sidebar-header')
    header.textContent = 'Settings'
    sidebar.appendChild(header)

    sidebar.appendChild(
        createSection({
            id: 'model',
            title: 'Model',
            classname: 'model-section',
            body: (el) => modelSection(el, global),
            events,
        }),
    )

    sidebar.appendChild(
        createSection({
            id: 'settings',
            title: 'Viewer',
            classname: 'viewer-setting-section',
            body: (el) => viewerSettingsSection(el, global),
            events,
        }),
    )
    sidebar.appendChild(
        createSection({
            id: 'hotspot',
            title: 'Hotspots',
            classname: 'hotspot-section',
            body: (el) => initHotspotSection(el, global, dom),
            events,
        }),
    )
    // sidebar.appendChild(
    //     createSection({
    //         id: 'dimension',
    //         title: 'Dimensions',
    //         classname: 'dimension-section',
    //         body: (el) => dimensionSection(el, global, dom),
    //     }),
    // )
    sidebar.appendChild(
        createSection({
            id: 'export',
            title: 'Export',
            classname: 'export-section',
            body: (el) => exportSection(el, global),
            events,
        }),
    )
    document.body.appendChild(sidebar)
    const canvas = global.app.graphicsDevice.canvas
    canvas.style.width = `calc(100% - ${SIDEBAR_WIDTH})`
    document.getElementById('ui').style.width = `calc(100% - ${SIDEBAR_WIDTH})`
    return sidebar
}
const initUI = (global) => {
    const { config, events, state, settings } = global
    const ui = document.getElementById('ui')
    ui.appendChild(createControlsWrap(events))
    ui.appendChild(createInfoPanel(settings, events))
    ui.appendChild(createSettingsPanel(global.app))
    const dom = [
        'ui',
        'resetCamera',
        'controlsWrap',
        'info',
        'infoPanel',
        'desktopTab',
        'touchTab',
        'desktopInfoPanel',
        'touchInfoPanel',
        'handle',
        'time',
        'buttonsContainer',
        'play',
        'pause',
        'settings',
        'loadingText',
        'loadingBar',
        'tooltip',
        'hotspotContainer',
        'hotspotActionGroup',
        'settingsPanel',
    ].reduce((acc, id) => {
        acc[id] = document.getElementById(id)
        return acc
    }, {})
    const tooltip = new Tooltip(dom.tooltip)
    document.body.appendChild(dom.tooltip)
    new HotspotManager({ global, dom, tooltip })
    let sidebar
    if (config.editable) {
        sidebar = createSidebar(global, dom)
    }
    // tooltips
    tooltip.register(dom.resetCamera, 'Reset Camera', 'top')
    tooltip.register(dom.settings, 'Settings', 'top')
    tooltip.register(dom.info, 'Controls Guide', 'top')
    if (settings.hotspots.length > 0) {
        dom.buttonsContainer.appendChild(createHotspotActionGroup(tooltip, events, dom))
    }
    // Remove focus from buttons after click so keyboard input isn't captured by the UI
    dom.ui.addEventListener('click', () => {
        document.activeElement?.blur()
    })
    // Forward wheel events from UI overlays to the canvas so the camera zooms
    // instead of the page scrolling (e.g. annotation nav, tooltips, hotspots)
    window.addEventListener('resize', () => {
        dom.settingsPanel.classList.add('hidden')
    })
    const canvas = global.app.graphicsDevice.canvas
    canvas.addEventListener('pointerup', (event) => {
        events.fire('pointerup', event)
        events.fire('inputEvent', 'pointerup', event)
    })
    dom.ui.addEventListener(
        'wheel',
        (event) => {
            event.preventDefault()
            canvas.dispatchEvent(new WheelEvent(event.type, event))
        },
        { passive: false },
    )
    // Hide loading bar once loaded
    events.on('loaded:changed', () => {
        document.getElementById('loadingWrap').classList.add('hidden')
        if (sidebar) sidebar.style.visibility = 'visible'
    })
    // Info panel
    const updateInfoTab = (tab) => {
        if (tab === 'desktop') {
            dom.desktopTab.classList.add('active')
            dom.touchTab.classList.remove('active')
            dom.desktopInfoPanel.classList.remove('hidden')
            dom.touchInfoPanel.classList.add('hidden')
        } else {
            dom.desktopTab.classList.remove('active')
            dom.touchTab.classList.add('active')
            dom.desktopInfoPanel.classList.add('hidden')
            dom.touchInfoPanel.classList.remove('hidden')
        }
    }
    dom.desktopTab.addEventListener('click', () => {
        updateInfoTab('desktop')
    })
    dom.touchTab.addEventListener('click', () => {
        updateInfoTab('touch')
    })
    const toggleHelp = () => {
        updateInfoTab(state.inputMode)
        dom.infoPanel.classList.toggle('hidden')
        if (!dom.infoPanel.classList.contains('hidden')) {
            dom.settingsPanel.classList.add('hidden')
        }
    }
    dom.info.addEventListener('click', toggleHelp)
    dom.infoPanel.addEventListener('pointerdown', () => {
        dom.infoPanel.classList.add('hidden')
    })
    dom.resetCamera.addEventListener('click', () => {
        events.fire('inputEvent', 'reset')
    })
    events.on('inputEvent', (event) => {
        if (event === 'toggleHelp') {
            toggleHelp()
        } else if (event === 'cancel') {
            // close info panel on cancel
            dom.infoPanel.classList.add('hidden')
            dom.settingsPanel.classList.add('hidden')
        } else if (event === 'interrupt') {
            dom.settingsPanel.classList.add('hidden')
        }
    })
    // fade ui controls after 5 seconds of inactivity
    events.on('controlsHidden:changed', (value) => {
        dom.controlsWrap.classList.toggle('faded-out', value)
        dom.controlsWrap.classList.toggle('faded-in', !value)
    })
    // show the ui and start a timer to hide it again
    let uiTimeout = null
    let annotationVisible = false
    const showUI = () => {
        if (uiTimeout) {
            clearTimeout(uiTimeout)
        }
        state.controlsHidden = false
        uiTimeout = setTimeout(() => {
            uiTimeout = null
            if (!annotationVisible && settings.autoHideUI) {
                state.controlsHidden = true
            }
        }, 4000)
    }
    // Show controls once loaded
    events.on('loaded:changed', () => {
        dom.controlsWrap.classList.remove('hidden')
        showUI()
    })
    events.on('inputEvent', showUI)
    // keep UI visible while an annotation tooltip is shown
    events.on('annotation.activate', () => {
        annotationVisible = true
        showUI()
    })
    events.on('viewer:auto-hide-ui', (value) => {
        showUI()
    })
    events.on('annotation.deactivate', () => {
        annotationVisible = false
        showUI()
    })
    dom.settings.addEventListener('click', () => {
        const panel = dom.settingsPanel
        panel.classList.toggle('hidden')
        if (panel.classList.contains('hidden')) return
        const GAP = 8
        const OFFSET = 6
        panel.style.visibility = 'hidden'
        panel.style.position = 'absolute'
        panel.classList.remove('hidden')
        const btnRect = dom.settings.getBoundingClientRect()
        const parentRect = panel.offsetParent.getBoundingClientRect()
        const panelW = panel.offsetWidth
        const panelH = panel.offsetHeight
        let left = btnRect.left - parentRect.left + btnRect.width / 2 - panelW / 2
        let top = btnRect.top - parentRect.top - panelH - OFFSET
        if (top < GAP) {
            top = btnRect.bottom - parentRect.top + OFFSET
        }
        if (top + panelH > parentRect.height - GAP) {
            top = parentRect.height - panelH - GAP
        }
        if (left + panelW > parentRect.width - GAP) {
            left = parentRect.width - panelW - GAP
        }
        if (left < GAP) left = GAP
        panel.style.left = left + 'px'
        panel.style.top = top + 'px'
        panel.style.visibility = 'visible'
    })
    // Initialize annotation navigator
    // initAnnotationNav(dom, events, state, global.settings.annotations)
    // Hide all UI (poster, loading bar, controls)
    if (config.noui) {
        dom.ui.classList.add('hidden')
    }

    const isThirdPartyEmbedded = () => {
        try {
            return window.location.hostname !== window.parent.location.hostname
        } catch (e) {
            // cross-origin iframe — parent location is inaccessible
            return true
        }
    }
    if (window.parent !== window && isThirdPartyEmbedded()) {
        const viewUrl = new URL(window.location.href)
        if (viewUrl.pathname === '/s') {
            viewUrl.pathname = '/view'
        }
    }
}

/**
 * Creates a rotation animation track
 *
 * @param position - Starting location of the camera.
 * @param target - Target point around which to rotate
 * @param fov - The camera field of view.
 * @param keys - The number of keys in the animation.
 * @param duration - The duration of the animation in seconds.
 * @returns - The animation track object containing position and target keyframes.
 */
const createRotateTrack = (position, target, fov, keys = 12, duration = 20) => {
    const times = new Array(keys).fill(0).map((_, i) => (i / keys) * duration)
    const positions = []
    const targets = []
    const fovs = new Array(keys).fill(fov)
    const dx = position.x - target.x
    const dy = position.y - target.y
    const dz = position.z - target.z
    const horizontalRadius = Math.sqrt(dx * dx + dz * dz)
    const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    // when the offset is nearly vertical, use a fraction of the total distance
    // as the orbit radius so the camera actually moves in a circle
    const minRadius = totalDist * 0.3
    const radius = Math.max(horizontalRadius, minRadius)
    const startAngle = Math.atan2(dx, dz)
    for (let i = 0; i < keys; ++i) {
        const angle = startAngle - (i / keys) * Math.PI * 2
        positions.push(target.x + radius * Math.sin(angle))
        positions.push(target.y + dy)
        positions.push(target.z + radius * Math.cos(angle))
        targets.push(target.x)
        targets.push(target.y)
        targets.push(target.z)
    }
    return {
        name: 'rotate',
        duration,
        frameRate: 1,
        loopMode: 'repeat',
        interpolation: 'spline',
        smoothness: 1,
        keyframes: {
            times,
            values: {
                position: positions,
                target: targets,
                fov: fovs,
            },
        },
    }
}

class CubicSpline {
    // control times
    times
    // control data: in-tangent, point, out-tangent
    knots
    // dimension of the knot points
    dim
    constructor(times, knots) {
        this.times = times
        this.knots = knots
        this.dim = knots.length / times.length / 3
    }
    evaluate(time, result) {
        const { times } = this
        const last = times.length - 1
        if (time <= times[0]) {
            this.getKnot(0, result)
        } else if (time >= times[last]) {
            this.getKnot(last, result)
        } else {
            let seg = 0
            while (time >= times[seg + 1]) {
                seg++
            }
            this.evaluateSegment(seg, (time - times[seg]) / (times[seg + 1] - times[seg]), result)
        }
    }
    getKnot(index, result) {
        const { knots, dim } = this
        const idx = index * 3 * dim
        for (let i = 0; i < dim; ++i) {
            result[i] = knots[idx + i * 3 + 1]
        }
    }
    // evaluate the spline segment at the given normalized time t
    evaluateSegment(segment, t, result) {
        const { knots, dim } = this
        const t2 = t * t
        const twot = t + t
        const omt = 1 - t
        const omt2 = omt * omt
        let idx = segment * dim * 3 // each knot has 3 values: tangent in, value, tangent out
        for (let i = 0; i < dim; ++i) {
            const p0 = knots[idx + 1] // p0
            const m0 = knots[idx + 2] // outgoing tangent
            const m1 = knots[idx + dim * 3] // incoming tangent
            const p1 = knots[idx + dim * 3 + 1] // p1
            idx += 3
            result[i] = p0 * ((1 + twot) * omt2) + m0 * (t * omt2) + p1 * (t2 * (3 - twot)) + m1 * (t2 * (t - 1))
        }
    }
    // calculate cubic spline knots from points
    // times: time values for each control point
    // points: control point values to be interpolated (n dimensional)
    // smoothness: 0 = linear, 1 = smooth
    static calcKnots(times, points, smoothness) {
        const n = times.length
        const dim = points.length / n
        const knots = new Array(n * dim * 3)
        for (let i = 0; i < n; i++) {
            const t = times[i]
            for (let j = 0; j < dim; j++) {
                const idx = i * dim + j
                const p = points[idx]
                let tangent
                if (i === 0) {
                    tangent = (points[idx + dim] - p) / (times[i + 1] - t)
                } else if (i === n - 1) {
                    tangent = (p - points[idx - dim]) / (t - times[i - 1])
                } else {
                    tangent = (points[idx + dim] - points[idx - dim]) / (times[i + 1] - times[i - 1])
                }
                // convert to derivatives w.r.t normalized segment parameter
                const inScale = i > 0 ? times[i] - times[i - 1] : times[1] - times[0]
                const outScale = i < n - 1 ? times[i + 1] - times[i] : times[i] - times[i - 1]
                knots[idx * 3] = tangent * inScale * smoothness
                knots[idx * 3 + 1] = p
                knots[idx * 3 + 2] = tangent * outScale * smoothness
            }
        }
        return knots
    }
    static fromPoints(times, points, smoothness = 1) {
        return new CubicSpline(times, CubicSpline.calcKnots(times, points, smoothness))
    }
    // create a looping spline by duplicating animation points at the end and beginning
    static fromPointsLooping(length, times, points, smoothness = 1) {
        if (times.length < 2) {
            return CubicSpline.fromPoints(times, points)
        }
        const dim = points.length / times.length
        const newTimes = times.slice()
        const newPoints = points.slice()
        // append first two points
        newTimes.push(length + times[0], length + times[1])
        newPoints.push(...points.slice(0, dim * 2))
        // prepend last two points
        newTimes.splice(0, 0, times[times.length - 2] - length, times[times.length - 1] - length)
        newPoints.splice(0, 0, ...points.slice(points.length - dim * 2))
        return CubicSpline.fromPoints(newTimes, newPoints, smoothness)
    }
}

/**
 * Damping function to smooth out transitions.
 *
 * @param damping - Damping factor (0 < damping < 1).
 * @param dt - Delta time in seconds.
 * @returns - Damping factor adjusted for the delta time.
 */
const damp = (damping, dt) => 1 - Math.pow(damping, dt * 1000)
/**
 * Easing function for smooth transitions.
 *
 * @param x - Input value in the range [0, 1].
 * @returns - Output value in the range [0, 1].
 */
const easeOut = (x) => (1 - 2 ** (-10 * x)) / (1 - 2 ** -10)
/**
 * Modulus function that handles negative values correctly.
 *
 * @param n - The number to be modulated.
 * @param m - The modulus value.
 * @returns - The result of n mod m, adjusted to be non-negative.
 */
const mod = (n, m) => ((n % m) + m) % m
const nearlyEquals = (a, b, epsilon = 1e-4) => {
    return !a.some((v, i) => Math.abs(v - b[i]) >= epsilon)
}
const vecToAngles = (result, vec) => {
    const radToDeg = 180 / Math.PI
    const horizLenSq = vec.x * vec.x + vec.z * vec.z
    result.x = Math.asin(Math.max(-1, Math.min(1, vec.y))) * radToDeg
    result.y = horizLenSq > 1e-8 ? Math.atan2(-vec.x, -vec.z) * radToDeg : 0
    result.z = 0
    return result
}

// track an animation cursor with support for repeat and ping-pong loop modes
class AnimCursor {
    duration = 0
    loopMode = 'none'
    timer = 0
    cursor = 0
    constructor(duration, loopMode) {
        this.reset(duration, loopMode)
    }
    update(deltaTime) {
        // update animation timer
        this.timer += deltaTime
        // update the track cursor
        this.cursor += deltaTime
        if (this.cursor >= this.duration) {
            switch (this.loopMode) {
                case 'none':
                    this.cursor = this.duration
                    break
                case 'repeat':
                    this.cursor %= this.duration
                    break
                case 'pingpong':
                    this.cursor %= this.duration * 2
                    break
            }
        }
    }
    reset(duration, loopMode) {
        this.duration = duration
        this.loopMode = loopMode
        this.timer = 0
        this.cursor = 0
    }
    set value(value) {
        this.cursor = mod(value, this.duration)
    }
    get value() {
        return this.cursor > this.duration ? 2 * this.duration - this.cursor : this.cursor
    }
}

// manage the state of a camera animation track
class AnimState {
    spline
    cursor = new AnimCursor(0, 'none')
    frameRate
    result = []
    position = new Vec3()
    target = new Vec3()
    fov = 90
    constructor(spline, duration, loopMode, frameRate) {
        this.spline = spline
        this.cursor.reset(duration, loopMode)
        this.frameRate = frameRate
    }
    // update given delta time
    update(dt) {
        const { cursor, result, spline, frameRate, position, target } = this
        // update the animation cursor
        cursor.update(dt)
        // evaluate the spline
        spline.evaluate(cursor.value * frameRate, result)
        if (result.every(isFinite)) {
            position.set(result[0], result[1], result[2])
            target.set(result[3], result[4], result[5])
            this.fov = result[6]
        }
    }
    // construct an animation from a settings track
    static fromTrack(track) {
        const { keyframes, duration, frameRate, loopMode, smoothness } = track
        const { times, values } = keyframes
        const { position, target, fov } = values
        // construct the points array containing position, target and fov
        const points = []
        for (let i = 0; i < times.length; i++) {
            points.push(position[i * 3], position[i * 3 + 1], position[i * 3 + 2])
            points.push(target[i * 3], target[i * 3 + 1], target[i * 3 + 2])
            points.push(fov[i])
        }
        const extra = duration === times[times.length - 1] / frameRate ? 1 : 0
        const spline = CubicSpline.fromPointsLooping((duration + extra) * frameRate, times, points, smoothness)
        return new AnimState(spline, duration, loopMode, frameRate)
    }
}

class AnimController {
    animState
    constructor(animTrack) {
        this.animState = AnimState.fromTrack(animTrack)
        this.animState.update(0)
    }
    onEnter(camera) {
        camera.look(this.animState.position, this.animState.target)
        camera.fov = this.animState.fov
    }
    update(deltaTime, inputFrame, camera) {
        this.animState.update(deltaTime)
        camera.look(this.animState.position, this.animState.target)
        camera.fov = this.animState.fov
        inputFrame.read()
    }
    onExit(camera) {}
}

const rotation$1 = new Quat()
const avec = new Vec3()
const bvec = new Vec3()
class Camera {
    position = new Vec3()
    angles = new Vec3()
    distance = 1
    fov = 60
    constructor(other) {
        if (other) {
            this.copy(other)
        }
    }
    copy(source) {
        this.position.copy(source.position)
        this.angles.copy(source.angles)
        this.distance = source.distance
        this.fov = source.fov
    }
    lerp(a, b, t) {
        a.calcFocusPoint(avec)
        b.calcFocusPoint(bvec)
        this.position.lerp(a.position, b.position, t)
        avec.lerp(avec, bvec, t).sub(this.position)
        this.distance = avec.length()
        vecToAngles(this.angles, avec.mulScalar(1.0 / this.distance))
        this.fov = math.lerp(a.fov, b.fov, t)
    }
    look(from, to) {
        this.position.copy(from)
        this.distance = from.distance(to)
        const dir = avec.sub2(to, from).normalize()
        vecToAngles(this.angles, dir)
    }
    calcFocusPoint(result) {
        rotation$1
            .setFromEulerAngles(this.angles)
            .transformVector(Vec3.FORWARD, result)
            .mulScalar(this.distance)
            .add(this.position)
    }
}

/** Radius of the camera collision sphere (meters) */
const CAMERA_RADIUS = 0.2
const p$1 = new Pose()
/** Pre-allocated push-out vector for sphere collision */
const pushOut = { x: 0, y: 0, z: 0 }
class FlyController {
    controller
    fov = 90
    /** Optional voxel collider for sphere collision with sliding */
    collider = null
    constructor() {
        this.controller = new FlyController$1()
        this.controller.pitchRange = new Vec2(-90, 90)
        this.controller.rotateDamping = 0.97
        this.controller.moveDamping = 0.97
    }
    onEnter(camera) {
        p$1.position.copy(camera.position)
        p$1.angles.copy(camera.angles)
        p$1.distance = camera.distance
        this.controller.attach(p$1, false)
    }
    update(deltaTime, inputFrame, camera) {
        const pose = this.controller.update(inputFrame, deltaTime)
        camera.angles.copy(pose.angles)
        camera.distance = pose.distance
        if (this.collider) {
            // Resolve collision on _targetPose first. The engine's update() already
            // applied input to _targetPose and lerped _pose toward it. By correcting
            // _targetPose now, we ensure next frame's lerp interpolates toward a safe
            // position, preventing the camera from overshooting into the wall.
            const target = this.controller._targetPose
            const tvx = -target.position.x
            const tvy = -target.position.y
            const tvz = target.position.z
            if (this.collider.querySphere(tvx, tvy, tvz, CAMERA_RADIUS, pushOut)) {
                target.position.x += -pushOut.x
                target.position.y += -pushOut.y
                target.position.z += pushOut.z
            }
            // Now resolve collision on the interpolated pose (_pose).
            const vx = -pose.position.x
            const vy = -pose.position.y
            const vz = pose.position.z
            if (this.collider.querySphere(vx, vy, vz, CAMERA_RADIUS, pushOut)) {
                pose.position.x += -pushOut.x
                pose.position.y += -pushOut.y
                pose.position.z += pushOut.z
            }
        }
        camera.position.copy(pose.position)
        camera.fov = this.fov
    }
    onExit(camera) {}
    goto(pose) {
        this.controller.attach(pose, true)
    }
}

const p = new Pose()
class OrbitController {
    controller
    fov = 90
    constructor() {
        this.controller = new OrbitController$1()
        this.controller.zoomRange = new Vec2(0.01, Infinity)
        this.controller.pitchRange = new Vec2(-90, 0)
        this.controller.rotateDamping = 0.97
        this.controller.moveDamping = 0.97
        this.controller.zoomDamping = 0.97
    }
    onEnter(camera) {
        p.position.copy(camera.position)
        p.angles.copy(camera.angles)
        p.distance = camera.distance
        this.controller.attach(p, false)
    }
    update(deltaTime, inputFrame, camera) {
        const pose = this.controller.update(inputFrame, deltaTime)
        camera.position.copy(pose.position)
        camera.angles.copy(pose.angles)
        camera.distance = pose.distance
        camera.fov = this.fov
    }
    onExit(camera) {}
    goto(camera) {
        p.position.copy(camera.position)
        p.angles.copy(camera.angles)
        p.distance = camera.distance
        this.fov = camera.fov
        this.controller.attach(p, false)
    }
}

const FIXED_DT = 1 / 60
const MAX_SUBSTEPS = 10
/** Pre-allocated push-out vector for capsule collision */
const out = { x: 0, y: 0, z: 0 }
const v = new Vec3()
const d = new Vec3()
const forward = new Vec3()
const right$1 = new Vec3()
const moveStep = [0, 0, 0]
const offset = new Vec3()
const rotation = new Quat()
/**
 * First-person camera controller with spring-damper suspension over voxel terrain.
 *
 * Movement is constrained to the horizontal plane (XZ) relative to the camera yaw.
 * Vertical positioning uses a spring-damper system that hovers the capsule above the
 * voxel surface, filtering out terrain noise for smooth camera motion. Capsule
 * collision handles walls and obstacles. When airborne, normal gravity applies.
 */
class WalkController {
    /**
     * Optional voxel collider for capsule collision with sliding
     */
    collider = null
    /**
     * Field of view in degrees for walk mode.
     */
    fov = 96
    /**
     * Total capsule height in meters (default: human proportion)
     */
    capsuleHeight = 1.5
    /**
     * Capsule radius in meters
     */
    capsuleRadius = 0.2
    /**
     * Camera height from the bottom of the capsule in meters
     */
    eyeHeight = 1.3
    /**
     * Gravity acceleration in m/s^2
     */
    gravity = 9.8
    /**
     * Jump velocity in m/s
     */
    jumpSpeed = 4
    /**
     * Movement speed in m/s when grounded
     */
    moveGroundSpeed = 7
    /**
     * Movement speed in m/s when in the air (for air control)
     */
    moveAirSpeed = 1
    /**
     * Movement damping factor (0 = no damping, 1 = full damping)
     */
    moveDamping = 0.97
    /**
     * Rotation damping factor (0 = no damping, 1 = full damping)
     */
    rotateDamping = 0.97
    /**
     * Velocity damping factor when grounded (0 = no damping, 1 = full damping)
     */
    velocityDampingGround = 0.99
    /**
     * Velocity damping factor when in the air (0 = no damping, 1 = full damping)
     */
    velocityDampingAir = 0.998
    /**
     * Target clearance from capsule bottom to ground surface in meters.
     * The capsule hovers this far above terrain to avoid bouncing on noisy voxels.
     */
    hoverHeight = 0.2
    /**
     * Spring stiffness for ground-following suspension (higher = stiffer tracking).
     */
    springStiffness = 800
    /**
     * Damping coefficient for ground-following suspension.
     * Critical damping is approximately 2 * sqrt(springStiffness).
     */
    springDamping = 57
    /**
     * Maximum downward raycast distance to search for ground below the capsule.
     */
    groundProbeRange = 1.0
    _position = new Vec3()
    _prevPosition = new Vec3()
    _angles = new Vec3()
    _velocity = new Vec3()
    _pendingMove = [0, 0, 0]
    _accumulator = 0
    _grounded = false
    _jumping = false
    _jumpHeld = false
    onEnter(camera) {
        this.goto(camera)
        if (this.collider) {
            const groundY = this._probeGround(this._position)
            if (groundY !== null) {
                this._grounded = true
                this._velocity.y = 0
                this._position.y = groundY + this.hoverHeight + this.eyeHeight
                this._prevPosition.copy(this._position)
            }
        }
    }
    update(deltaTime, inputFrame, camera) {
        const { move, rotate } = inputFrame.read()
        // apply rotation at display rate for responsive mouse look
        this._angles.add(v.set(-rotate[1], -rotate[0], 0))
        this._angles.x = math.clamp(this._angles.x, -90, 90)
        // accumulate movement input so frames without a physics step don't lose input
        this._pendingMove[0] += move[0]
        this._pendingMove[1] = this._pendingMove[1] || move[1]
        this._pendingMove[2] += move[2]
        this._accumulator = Math.min(this._accumulator + deltaTime, MAX_SUBSTEPS * FIXED_DT)
        const numSteps = Math.floor(this._accumulator / FIXED_DT)
        if (numSteps > 0) {
            const invSteps = 1 / numSteps
            moveStep[0] = this._pendingMove[0] * invSteps
            moveStep[1] = this._pendingMove[1]
            moveStep[2] = this._pendingMove[2] * invSteps
            for (let i = 0; i < numSteps; i++) {
                this._prevPosition.copy(this._position)
                this._step(FIXED_DT, moveStep)
                this._accumulator -= FIXED_DT
            }
            this._pendingMove[0] = 0
            this._pendingMove[1] = 0
            this._pendingMove[2] = 0
        }
        const alpha = this._accumulator / FIXED_DT
        camera.position.lerp(this._prevPosition, this._position, alpha)
        camera.angles.set(this._angles.x, this._angles.y, 0)
        camera.fov = this.fov
    }
    _step(dt, move) {
        // ground probe: cast a ray downward to find the terrain surface
        const groundY = this._probeGround(this._position)
        const hasGround = groundY !== null
        // jump (require release before re-triggering)
        if (this._velocity.y < 0) {
            this._jumping = false
        }
        if (move[1] && !this._jumping && this._grounded && !this._jumpHeld) {
            this._jumping = true
            this._velocity.y = this.jumpSpeed
            this._grounded = false
        }
        this._jumpHeld = !!move[1]
        // vertical force: spring-damper when ground is detected, gravity when airborne
        if (hasGround && !this._jumping) {
            const targetY = groundY + this.hoverHeight + this.eyeHeight
            const displacement = this._position.y - targetY
            if (displacement > 0.1) {
                // well above target (jump/ledge): freefall, snap to rest height on arrival
                this._velocity.y -= this.gravity * dt
                const nextY = this._position.y + this._velocity.y * dt
                if (nextY <= targetY) {
                    this._position.y = targetY
                    this._velocity.y = 0
                }
                this._grounded = false
            } else {
                // at or near target (walking/slopes): spring tracks terrain
                const springForce = -this.springStiffness * displacement - this.springDamping * this._velocity.y
                this._velocity.y += springForce * dt
                this._grounded = true
            }
        } else {
            this._velocity.y -= this.gravity * dt
            this._grounded = false
        }
        // move
        rotation.setFromEulerAngles(0, this._angles.y, 0)
        rotation.transformVector(Vec3.FORWARD, forward)
        rotation.transformVector(Vec3.RIGHT, right$1)
        offset.set(0, 0, 0)
        offset.add(forward.mulScalar(move[2]))
        offset.add(right$1.mulScalar(move[0]))
        this._velocity.add(offset.mulScalar(this._grounded ? this.moveGroundSpeed : this.moveAirSpeed))
        const dampFactor = this._grounded ? this.velocityDampingGround : this.velocityDampingAir
        const alpha = damp(dampFactor, dt)
        this._velocity.x = math.lerp(this._velocity.x, 0, alpha)
        this._velocity.z = math.lerp(this._velocity.z, 0, alpha)
        this._position.add(v.copy(this._velocity).mulScalar(dt))
        // capsule collision: walls, ceiling, and fallback floor contact
        this._checkCollision(this._position, d)
    }
    onExit(_camera) {
        // nothing to clean up
    }
    /**
     * Teleport the controller to a given camera state (used for transitions).
     *
     * @param camera - The camera state to jump to.
     */
    goto(camera) {
        // position
        this._position.copy(camera.position)
        this._prevPosition.copy(this._position)
        // angles (clamp pitch to avoid gimbal lock)
        this._angles.set(camera.angles.x, camera.angles.y, 0)
        // reset velocity and state
        this._velocity.set(0, 0, 0)
        this._grounded = false
        this._jumping = false
        this._pendingMove[0] = 0
        this._pendingMove[1] = 0
        this._pendingMove[2] = 0
        this._accumulator = 0
    }
    /**
     * Cast multiple rays downward to find the average ground surface height.
     * Uses 5 rays (center + 4 cardinal at capsule radius) to spatially filter
     * noisy voxel heights, giving the spring a smoother target.
     *
     * @param pos - Eye position in PlayCanvas world space.
     * @returns Average ground surface Y in PlayCanvas space, or null if no ground found.
     */
    _probeGround(pos) {
        if (!this.collider) return null
        const vy = -(pos.y - this.eyeHeight)
        const r = this.capsuleRadius
        const range = this.groundProbeRange
        let totalY = 0
        let hitCount = 0
        for (let i = 0; i < 5; i++) {
            let vx = -pos.x
            let vz = pos.z
            if (i === 1) vx -= r
            else if (i === 2) vx += r
            else if (i === 3) vz += r
            else if (i === 4) vz -= r
            const hit = this.collider.queryRay(vx, vy, vz, 0, 1, 0, range)
            if (hit) {
                totalY += -hit.y
                hitCount++
            }
        }
        return hitCount > 0 ? totalY / hitCount : null
    }
    /**
     * Check for capsule collision and apply push-out displacement.
     * Handles walls, ceiling hits, and fallback floor contact when airborne.
     *
     * @param pos - Eye position in PlayCanvas world space.
     * @param disp - Pre-allocated vector to receive the collision push-out displacement.
     */
    _checkCollision(pos, disp) {
        const center = pos.y - this.eyeHeight + this.capsuleHeight * 0.5
        const half = this.capsuleHeight * 0.5 - this.capsuleRadius
        // convert to voxel space (negate X, negate Y, keep Z)
        const vx = -pos.x
        const vy = -center
        const vz = pos.z
        if (this.collider.queryCapsule(vx, vy, vz, half, this.capsuleRadius, out)) {
            disp.set(-out.x, -out.y, out.z)
            pos.add(disp)
            // ceiling collision: cancel upward velocity
            if (disp.y < 0 && this._velocity.y > 0) {
                this._velocity.y = 0
            }
            // airborne floor collision: transition to grounded as a fallback safety net
            if (!this._grounded && disp.y > 0 && this._velocity.y < 0) {
                this._velocity.y = 0
                this._grounded = true
            }
        }
    }
}

const RAD_TO_DEG = 180 / Math.PI
/** XZ distance below which the walker considers itself arrived */
const ARRIVAL_DIST = 0.5
/** Minimum XZ speed (m/s) to not count as blocked */
const BLOCKED_SPEED = 0.6
/** Seconds of continuous low-progress before stopping the walk */
const BLOCKED_DURATION = 0.2
/**
 * Generates synthetic move/rotate input to auto-walk toward a target position.
 *
 * Designed to feed into WalkController's existing update path so there is no
 * duplicated physics. Each frame it appends yaw-rotation and forward-movement
 * deltas to the shared CameraFrame, and monitors arrival / blocked conditions.
 */
class WalkSource {
    /**
     * Forward input scale (matches InputController.moveSpeed for consistent
     * speed with regular WASD walking).
     */
    walkSpeed = 4
    /**
     * Maximum yaw turn rate in degrees per second.
     */
    maxTurnRate = 192
    /**
     * Proportional gain mapping yaw error (degrees) to desired turn rate.
     * Below maxTurnRate / turnGain degrees the turn rate scales linearly;
     * above that it is capped at maxTurnRate. The rate filter is
     * automatically critically damped so there is no overshoot.
     */
    turnGain = 5
    /**
     * Callback fired when an auto-walk completes (arrival or obstacle).
     */
    onComplete = null
    _target = null
    _yawRate = 0
    _blockedTime = 0
    _prevDist = Infinity
    get isWalking() {
        return this._target !== null
    }
    /**
     * Begin auto-walking toward a world-space target position.
     *
     * @param target - The destination (XZ used for navigation).
     */
    walkTo(target) {
        if (!this._target) {
            this._target = new Vec3()
        }
        this._target.copy(target)
        this._blockedTime = 0
        this._prevDist = Infinity
    }
    /**
     * Cancel any active auto-walk.
     */
    cancelWalk() {
        if (this._target) {
            this._target = null
            this._yawRate = 0
            this._blockedTime = 0
            this.onComplete?.()
        }
    }
    /**
     * Compute walk deltas and append them to the frame. Must be called
     * before* the camera controller reads the frame.
     *
     * @param dt - Frame delta time in seconds.
     * @param cameraPosition - Camera world position (previous frame output).
     * @param cameraAngles - Camera Euler angles in degrees (previous frame output).
     * @param frame - The shared CameraFrame to append deltas to.
     */
    update(dt, cameraPosition, cameraAngles, frame) {
        if (!this._target) return
        const target = this._target
        const dx = target.x - cameraPosition.x
        const dz = target.z - cameraPosition.z
        const xzDist = Math.sqrt(dx * dx + dz * dz)
        // arrival
        if (xzDist < ARRIVAL_DIST) {
            this.cancelWalk()
            return
        }
        // blocked detection: compare with previous frame's distance
        if (this._prevDist !== Infinity && dt > 0) {
            const speed = (this._prevDist - xzDist) / dt
            if (speed < BLOCKED_SPEED) {
                this._blockedTime += dt
                if (this._blockedTime >= BLOCKED_DURATION) {
                    this.cancelWalk()
                    return
                }
            } else {
                this._blockedTime = 0
            }
        }
        this._prevDist = xzDist
        // yaw toward target with smoothed turn rate
        const targetYaw = Math.atan2(-dx, -dz) * RAD_TO_DEG
        let yawDiff = targetYaw - cameraAngles.y
        yawDiff = (((yawDiff % 360) + 540) % 360) - 180
        const desiredRate = Math.max(-this.maxTurnRate, Math.min(yawDiff * this.turnGain, this.maxTurnRate))
        const smoothing = 1 - Math.exp(-4 * this.turnGain * dt)
        this._yawRate += (desiredRate - this._yawRate) * smoothing
        // WalkController applies: _angles.y += -rotate[0]
        frame.deltas.rotate.append([-(this._yawRate * dt), 0, 0])
        // scale forward speed by alignment: turn in place first, then accelerate
        const alignment = Math.max(0, Math.cos((yawDiff * Math.PI) / 180))
        frame.deltas.move.append([0, 0, this.walkSpeed * dt * alignment])
    }
}

const tmpCamera = new Camera()
const tmpv = new Vec3()
const createCamera = (position, target, fov) => {
    const result = new Camera()
    result.look(position, target)
    result.fov = fov
    return result
}
const createFrameCamera = (bbox, fov) => {
    const sceneSize = bbox.halfExtents.length()
    const distance = sceneSize / Math.sin((fov / 180) * Math.PI * 0.5)
    return createCamera(new Vec3(2, 1, 2).normalize().mulScalar(distance).add(bbox.center), bbox.center, fov)
}
class CameraManager {
    update
    controllers
    minDistance = 11
    // holds the camera state
    camera = new Camera()
    constructor(global, bbox, entity, collider = null) {
        const { events, settings, state, app } = global
        const defaultFov = 50
        const resetCamera = createFrameCamera(bbox, defaultFov)
        const getAnimTrack = (initial, isObjectExperience) => {
            const { animTracks } = settings
            // extract the camera animation track from settings
            if (animTracks?.length > 0 && settings.startMode === 'animTrack') {
                // use the first animTrack
                return animTracks[0]
            } else if (isObjectExperience) {
                // create basic rotation animation if no anim track is specified
                initial.calcFocusPoint(tmpv)
                return createRotateTrack(initial.position, tmpv, initial.fov)
            }
            return null
        }
        // object experience starts outside the bounding box
        const isObjectExperience = !bbox.containsPoint(resetCamera.position)
        const animTrack = getAnimTrack(resetCamera, isObjectExperience)
        this.controllers = {
            orbit: new OrbitController(),
            fly: new FlyController(),
            walk: new WalkController(),
            anim: animTrack ? new AnimController(animTrack) : null,
            ortery: new OtherController({ global, bbox, minDistance: this.minDistance }),
        }

        events.fire('controllers:created', this.controllers)
        this.controllers.orbit.fov = resetCamera.fov
        this.controllers.fly.fov = resetCamera.fov
        this.controllers.fly.collider = collider
        this.controllers.walk.collider = collider
        const walkSource = new WalkSource()
        walkSource.onComplete = () => {
            events.fire('walkComplete')
        }
        const getController = (cameraMode) => {
            return this.controllers[cameraMode]
        }
        // set the global animation flag
        state.hasAnimation = !!this.controllers.anim
        state.animationDuration = this.controllers.anim ? this.controllers.anim.animState.cursor.duration : 0
        // initialize camera mode and initial camera position
        // state.cameraMode =
        //     state.hasAnimation && !config.noanim ? 'anim' : isObjectExperience ? 'orbit' : collider ? 'walk' : 'fly'
        state.cameraMode = 'ortery'
        this.camera.copy(resetCamera)
        const target = new Camera(this.camera) // the active controller updates this
        const from = new Camera(this.camera) // stores the previous camera state during transition
        const defaultMode = isObjectExperience ? 'orbit' : collider ? 'walk' : 'fly'
        let fromMode = defaultMode
        // tracks the mode to restore when exiting walk
        let preWalkMode = isObjectExperience ? 'orbit' : 'fly'
        // enter the initial controller
        getController(state.cameraMode).onEnter(this.camera)
        // transition state
        const transitionSpeed = 1.0
        let transitionTimer = 1
        // start a new camera transition from the current pose
        const startTransition = () => {
            from.copy(this.camera)
            transitionTimer = 0
        }
        // application update
        this.update = (deltaTime, frame) => {
            // use dt of 0 if animation is paused
            const dt = state.cameraMode === 'anim' && state.animationPaused ? 0 : deltaTime
            // update transition timer
            transitionTimer = Math.min(1, transitionTimer + deltaTime * transitionSpeed)
            const controller = getController(state.cameraMode)
            if (state.cameraMode === 'walk') {
                walkSource.update(dt, this.camera.position, this.camera.angles, frame)
            }
            controller.update(dt, frame, target)
            if (transitionTimer < 1) {
                // lerp away from previous camera during transition
                this.camera.lerp(from, target, easeOut(transitionTimer))
            } else {
                this.camera.copy(target)
            }
            // update animation timeline
            if (state.cameraMode === 'anim') {
                state.animationTime = this.controllers.anim.animState.cursor.value
            }
        }
        // handle input events
        events.on('inputEvent', (eventName, event) => {
            switch (eventName) {
                case 'frame':
                    state.cameraMode = 'orbit'
                    this.controllers.orbit.goto(frameCamera)
                    startTransition()
                    break
                case 'reset':
                    this.controllers.ortery.reset()
                    break
                case 'playPause':
                    if (state.hasAnimation) {
                        if (state.cameraMode === 'anim') {
                            state.animationPaused = !state.animationPaused
                        } else {
                            state.cameraMode = 'anim'
                            state.animationPaused = false
                        }
                    }
                    break
                case 'requestFirstPerson':
                    state.cameraMode = 'fly'
                    break
                case 'toggleWalk':
                    if (collider) {
                        if (state.cameraMode === 'walk') {
                            state.cameraMode = preWalkMode
                        } else {
                            preWalkMode = state.cameraMode
                            state.cameraMode = 'walk'
                        }
                    }
                    break
                case 'exitWalk':
                    if (state.cameraMode === 'walk') {
                        state.cameraMode = preWalkMode
                    }
                    break
                case 'cancel':
                    if (state.cameraMode === 'anim') {
                        state.cameraMode = fromMode
                    }
                    break
                case 'interrupt':
                    if (state.cameraMode === 'anim') {
                        state.cameraMode = fromMode
                    }
                    break
            }
        })
        // handle camera mode switching
        events.on('cameraMode:changed', (value, prev) => {
            if (prev === 'walk') {
                walkSource.cancelWalk()
            }
            // snapshot the current pose before any controller mutation
            startTransition()
            target.copy(this.camera)
            fromMode = prev
            // exit the old controller
            const prevController = getController(prev)
            prevController.onExit(this.camera)
            // enter new controller
            const newController = getController(value)
            newController.onEnter(this.camera)
        })
        // handle user scrubbing the animation timeline
        events.on('scrubAnim', (time) => {
            // switch to animation camera if we're not already there
            state.cameraMode = 'anim'
            // set time
            this.controllers.anim.animState.cursor.value = time
        })
        // handle user picking in the scene
        events.on('pick', (position) => {
            // switch to orbit camera on pick
            state.cameraMode = 'orbit'
            // construct camera
            tmpCamera.copy(this.camera)
            tmpCamera.look(this.camera.position, position)
            this.ontrollers.orbit.goto(tmpCamera)
            startTransition()
        })
        events.on('annotation.activate', (annotation) => {
            // switch to orbit camera on pick
            state.cameraMode = 'orbit'
            const { initial } = annotation.camera
            // construct camera
            tmpCamera.fov = initial.fov
            tmpCamera.look(new Vec3(initial.position), new Vec3(initial.target))
            this.controllers.orbit.goto(tmpCamera)
            startTransition()
        })
        // tap-to-walk: start auto-walking toward a picked 3D position
        events.on('walkTo', (position, normal) => {
            if (state.cameraMode === 'walk') {
                walkSource.walkTo(position)
                events.fire('walkTarget:set', position, normal)
            }
        })
        // cancel any active auto-walk
        events.on('walkCancel', () => {
            walkSource.cancelWalk()
            events.fire('walkTarget:clear')
        })
        events.on('walkComplete', () => {
            events.fire('walkTarget:clear')
        })
    }
}

// override global pick to pack depth instead of meshInstance id
const pickDepthGlsl = /* glsl */ `
uniform vec4 camera_params;     // 1/far, far, near, isOrtho
vec4 getPickOutput() {
    float linearDepth = 1.0 / gl_FragCoord.w;
    float normalizedDepth = (linearDepth - camera_params.z) / (camera_params.y - camera_params.z);
    return vec4(gaussianColor.a * normalizedDepth, 0.0, 0.0, gaussianColor.a);
}
`
const pickDepthWgsl = /* wgsl */ `
    uniform camera_params: vec4f;       // 1/far, far, near, isOrtho
    fn getPickOutput() -> vec4f {
        let linearDepth = 1.0 / pcPosition.w;
        let normalizedDepth = (linearDepth - uniform.camera_params.z) / (uniform.camera_params.y - uniform.camera_params.z);
        let a = f32(gaussianColor.a);
        return vec4f(a * normalizedDepth, 0.0, 0.0, a);
    }
`
const vec$1 = new Vec3()
const vecb = new Vec3()
const ray = new Ray()
const clearColor = new Color(0, 0, 0, 1)
// Shared buffer for half-to-float conversion
const float32 = new Float32Array(1)
const uint32 = new Uint32Array(float32.buffer)
// Convert 16-bit half-float to 32-bit float using bit manipulation
const half2Float = (h) => {
    const sign = (h & 0x8000) << 16 // Move sign to bit 31
    const exponent = (h & 0x7c00) >> 10 // Extract 5-bit exponent
    const mantissa = h & 0x03ff // Extract 10-bit mantissa
    if (exponent === 0) {
        if (mantissa === 0) {
            // Zero
            uint32[0] = sign
        } else {
            // Denormalized: convert to normalized float32
            let e = -1
            let m = mantissa
            do {
                e++
                m <<= 1
            } while ((m & 0x0400) === 0)
            uint32[0] = sign | ((127 - 15 - e) << 23) | ((m & 0x03ff) << 13)
        }
    } else if (exponent === 31) {
        // Infinity or NaN
        uint32[0] = sign | 0x7f800000 | (mantissa << 13)
    } else {
        // Normalized: adjust exponent bias from 15 to 127
        uint32[0] = sign | ((exponent + 127 - 15) << 23) | (mantissa << 13)
    }
    return float32[0]
}
// get the normalized world-space ray starting at the camera position
// facing the supplied screen position
// works for both perspective and orthographic cameras
const getRay = (camera, screenX, screenY, ray) => {
    const cameraPos = camera.getPosition()
    // create the pick ray in world space
    if (camera.camera.projection === PROJECTION_ORTHOGRAPHIC) {
        camera.camera.screenToWorld(screenX, screenY, -1, vec$1)
        camera.camera.screenToWorld(screenX, screenY, 1.0, vecb)
        vecb.sub(vec$1).normalize()
        ray.set(vec$1, vecb)
    } else {
        camera.camera.screenToWorld(screenX, screenY, 1.0, vec$1)
        vec$1.sub(cameraPos).normalize()
        ray.set(cameraPos, vec$1)
    }
}
class Picker {
    pick
    release
    constructor(app, camera) {
        const { graphicsDevice } = app
        // register pick depth shader chunks
        ShaderChunks.get(graphicsDevice, 'glsl').set('pickPS', pickDepthGlsl)
        ShaderChunks.get(graphicsDevice, 'wgsl').set('pickPS', pickDepthWgsl)
        let colorBuffer
        let renderTarget
        let renderPass
        const emptyMap = new Map()
        const init = (width, height) => {
            colorBuffer = new Texture(graphicsDevice, {
                format: PIXELFORMAT_RGBA16F,
                width: width,
                height: height,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
                name: 'picker',
            })
            renderTarget = new RenderTarget({
                colorBuffer,
                depth: false, // not needed - gaussians are rendered back to front
            })
            renderPass = new RenderPassPicker(graphicsDevice, app.renderer)
            // RGB: additive depth accumulation (ONE, ONE_MINUS_SRC_ALPHA)
            // Alpha: multiplicative transmittance (ZERO, ONE_MINUS_SRC_ALPHA) -> T = T * (1 - alpha)
            renderPass.blendState = new BlendState(
                true,
                BLENDEQUATION_ADD,
                BLENDMODE_ONE,
                BLENDMODE_ONE_MINUS_SRC_ALPHA, // RGB blend
                BLENDEQUATION_ADD,
                BLENDMODE_ZERO,
                BLENDMODE_ONE_MINUS_SRC_ALPHA, // Alpha blend (transmittance)
            )
        }
        this.pick = async (x, y) => {
            const width = Math.floor(graphicsDevice.width)
            const height = Math.floor(graphicsDevice.height)
            // convert from [0,1] to pixel coordinates
            const screenX = Math.floor(x * graphicsDevice.width)
            const screenY = Math.floor(y * graphicsDevice.height)
            // flip Y for texture read on WebGL (texture origin is bottom-left)
            const texX = screenX
            const texY = graphicsDevice.isWebGL2 ? height - screenY - 1 : screenY
            // construct picker on demand
            if (!renderPass) {
                init(width, height)
            } else {
                renderTarget.resize(width, height)
            }
            // render scene
            renderPass.init(renderTarget)
            renderPass.setClearColor(clearColor)
            renderPass.update(camera.camera, app.scene, [app.scene.layers.getLayerByName('World')], emptyMap, false)
            renderPass.render()
            // read pixel using texture coordinates
            const pixels = await colorBuffer.read(texX, texY, 1, 1, { renderTarget, immediate: true })
            // convert half-float values to floats
            // R channel: accumulated depth * alpha
            // A channel: transmittance (1 - alpha), values near 0 have better half-float precision
            const r = half2Float(pixels[0])
            const transmittance = half2Float(pixels[3])
            const alpha = 1 - transmittance
            // check alpha first (transmittance close to 1 means nothing visible)
            if (alpha < 1e-6) {
                return null
            }
            // get camera near/far for denormalization
            const near = camera.camera.nearClip
            const far = camera.camera.farClip
            // divide by alpha to get normalized depth, then denormalize to linear depth
            const normalizedDepth = r / alpha
            const depth = normalizedDepth * (far - near) + near
            // get the ray from camera through the screen point (using pixel coords)
            getRay(
                camera,
                Math.floor(x * graphicsDevice.canvas.offsetWidth),
                Math.floor(y * graphicsDevice.canvas.offsetHeight),
                ray,
            )
            // convert linear depth (view-space z distance) to ray distance
            const forward = camera.forward
            const t = depth / ray.direction.dot(forward)
            // world position = ray origin + ray direction * t
            return ray.origin.clone().add(ray.direction.clone().mulScalar(t))
        }
        this.release = () => {
            renderPass?.destroy()
            renderTarget?.destroy()
            colorBuffer?.destroy()
        }
    }
}

/* Vec initialisation to avoid recurrent memory allocation */
const tmpV1 = new Vec3()
const tmpV2 = new Vec3()
const mouseRotate = new Vec3()
const flyMove = new Vec3()
const flyTouchPan = new Vec3()
const pinchMove = new Vec3()
const orbitRotate = new Vec3()
const flyRotate = new Vec3()
const stickMove = new Vec3()
const stickRotate = new Vec3()
/** Maximum accumulated touch movement (px) to still count as a tap */
const TAP_EPSILON = 15
/**
 * Displacement-based inputs (mouse, touch, wheel, pinch) return accumulated pixel
 * offsets that already scale with frame time. This factor converts rate-based speed
 * constants (tuned for degrees-per-second) to work with per-frame displacements,
 * making them frame-rate-independent.
 */
const DISPLACEMENT_SCALE = 1 / 60
/**
 * Converts screen space mouse deltas to world space pan vector.
 *
 * @param camera - The camera component.
 * @param dx - The mouse delta x value.
 * @param dy - The mouse delta y value.
 * @param dz - The world space zoom delta value.
 * @param out - The output vector to store the pan result.
 * @returns - The pan vector in world space.
 * @private
 */
const screenToWorld = (camera, dx, dy, dz, out = new Vec3()) => {
    const { system, fov, aspectRatio, horizontalFov, projection, orthoHeight } = camera
    const { width, height } = system.app.graphicsDevice.clientRect
    // normalize deltas to device coord space
    out.set(-(dx / width) * 2, (dy / height) * 2, 0)
    // calculate half size of the view frustum at the current distance
    const halfSize = tmpV2.set(0, 0, 0)
    if (projection === PROJECTION_PERSPECTIVE) {
        const halfSlice = dz * Math.tan(0.5 * fov * math.DEG_TO_RAD)
        if (horizontalFov) {
            halfSize.set(halfSlice, halfSlice / aspectRatio, 0)
        } else {
            halfSize.set(halfSlice * aspectRatio, halfSlice, 0)
        }
    } else {
        halfSize.set(orthoHeight * aspectRatio, orthoHeight, 0)
    }
    // scale by device coord space
    out.mul(halfSize)
    return out
}
// patch keydown and keyup to ignore events with meta key otherwise
// keys can get stuck on macOS.
const patchKeyboardMeta = (desktopInput) => {
    const origOnKeyDown = desktopInput._onKeyDown
    desktopInput._onKeyDown = (event) => {
        if (event.key === 'Meta') {
            desktopInput._keyNow.fill(0)
        } else if (!event.metaKey) {
            origOnKeyDown(event)
        }
    }
    const origOnKeyUp = desktopInput._onKeyUp
    desktopInput._onKeyUp = (event) => {
        if (event.key === 'Meta') {
            desktopInput._keyNow.fill(0)
        } else if (!event.metaKey) {
            origOnKeyUp(event)
        }
    }
}
class InputController {
    _state = {
        axis: new Vec3(),
        mouse: [0, 0, 0],
        shift: 0,
        ctrl: 0,
        jump: 0,
        touches: 0,
    }
    _desktopInput = new KeyboardMouseSource()
    _orbitInput = new MultiTouchSource()
    _gamepadInput = new GamepadSource()
    global
    frame = new InputFrame({
        move: [0, 0, 0],
        rotate: [0, 0, 0],
    })
    // Touch joystick input values [x, y] (-1 to 1)
    _touchJoystick = [0, 0]
    // Accumulated forward/backward velocity from pinch gesture (-1 to 1)
    _pinchVelocity = 0
    // Accumulated strafe/vertical velocity from two-finger pan [x, y] (-1 to 1)
    _panVelocity = [0, 0]
    // Sensitivity for pinch delta → velocity conversion
    pinchVelocitySensitivity = 0.006
    // Sensitivity for two-finger pan delta → velocity conversion
    panVelocitySensitivity = 0.005
    // Tap-to-jump state (uses existing MultiTouchSource count/touch deltas)
    _tapTouches = 0
    _tapDelta = 0
    _tapJump = false
    // Screen coordinates of the last pointer start (for click/tap-to-walk picking)
    _lastPointerOffsetX = 0
    _lastPointerOffsetY = 0
    // Desktop click-to-walk tracking
    _mouseClickTracking = false
    _mouseClickDelta = 0
    _picker = null
    collider = null
    moveSpeed = 4
    orbitSpeed = 18
    pinchSpeed = 0.4
    wheelSpeed = 0.06
    mouseRotateSensitivity = 0.5
    touchRotateSensitivity = 1.5
    touchPinchMoveSensitivity = 1.5
    gamepadRotateSensitivity = 1.0
    constructor(global) {
        const { app, camera, events, state } = global
        const canvas = app.graphicsDevice.canvas
        patchKeyboardMeta(this._desktopInput)
        this._desktopInput.attach(canvas)
        this._orbitInput.attach(canvas)
        // Listen for joystick input from the UI (touch joystick element)
        events.on('joystickInput', (value) => {
            this._touchJoystick[0] = value.x
            this._touchJoystick[1] = value.y
        })
        this.global = global
        const updateCanvasCursor = () => {
            if (state.cameraMode === 'walk' && !state.gamingControls && state.inputMode === 'desktop') {
                canvas.style.cursor = this._mouseClickTracking ? 'default' : 'pointer'
            } else {
                canvas.style.cursor = ''
            }
        }
        // Generate input events
        ;['wheel', 'pointerdown', 'contextmenu', 'keydown'].forEach((eventName) => {
            canvas.addEventListener(eventName, (event) => {
                events.fire('inputEvent', 'interrupt', event)
            })
        })
        canvas.addEventListener('pointermove', (event) => {
            events.fire('inputEvent', 'interact', event)
            events.fire('inputEvent', 'pointermove', event)
        })
        // Detect double taps manually because iOS doesn't send dblclick events
        const lastTap = { time: 0, x: 0, y: 0 }
        canvas.addEventListener('pointerdown', (event) => {
            // Store coordinates for click/tap-to-walk picking
            this._lastPointerOffsetX = event.offsetX
            this._lastPointerOffsetY = event.offsetY
            // Start desktop click-to-walk tracking
            if (event.pointerType !== 'touch' && event.button === 0) {
                this._mouseClickTracking = true
                this._mouseClickDelta = 0
                updateCanvasCursor()
            }
            const now = Date.now()
            const delay = Math.max(0, now - lastTap.time)
            if (delay < 300 && Math.abs(event.clientX - lastTap.x) < 8 && Math.abs(event.clientY - lastTap.y) < 8) {
                events.fire('inputEvent', 'dblclick', event)
                lastTap.time = 0
            } else {
                lastTap.time = now
                lastTap.x = event.clientX
                lastTap.y = event.clientY
            }
            events.fire('inputEvent', 'pointerdown', event)
        })
        // Desktop click-to-walk: accumulate displacement during mouse drag
        canvas.addEventListener('pointermove', (event) => {
            if (this._mouseClickTracking && event.pointerType !== 'touch') {
                const prev = this._mouseClickDelta
                this._mouseClickDelta += Math.abs(event.movementX) + Math.abs(event.movementY)
                if (prev < TAP_EPSILON && this._mouseClickDelta >= TAP_EPSILON) {
                    if (state.cameraMode === 'walk' && !state.gamingControls) {
                        events.fire('walkCancel')
                    }
                }
            }
        })
        // Desktop click-to-walk: detect click (low displacement) on mouse button release
        canvas.addEventListener('pointerup', (event) => {
            if (this._mouseClickTracking && event.pointerType !== 'touch' && event.button === 0) {
                this._mouseClickTracking = false
                updateCanvasCursor()
                if (this._mouseClickDelta < TAP_EPSILON && state.cameraMode === 'walk' && !state.gamingControls) {
                    const result = this._pickVoxel(this._lastPointerOffsetX, this._lastPointerOffsetY)
                    if (result) {
                        events.fire('walkTo', result.position, result.normal)
                    }
                }
            }
        })
        // update input mode based on pointer event
        ;['pointerdown', 'pointermove'].forEach((eventName) => {
            window.addEventListener(eventName, (event) => {
                state.inputMode = event.pointerType === 'touch' ? 'touch' : 'desktop'
            })
        })
        let recentlyExitedWalk = false
        // handle keyboard events
        window.addEventListener('keydown', (event) => {
            const tag = document.activeElement?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable)
                return
            if (event.key === 'Escape') {
                events.fire('hotspot:add-cancelled')
                if (recentlyExitedWalk);
                else if (state.cameraMode === 'walk' && state.gamingControls && state.inputMode === 'desktop') {
                    state.gamingControls = false
                } else if (state.cameraMode === 'walk') {
                    events.fire('inputEvent', 'exitWalk', event)
                } else {
                    events.fire('inputEvent', 'cancel', event)
                }
            } else if (!event.ctrlKey && !event.altKey && !event.metaKey) {
                switch (event.key) {
                    case 'p':
                        events.fire('hotspot:toggle-play')
                        break
                    case 't':
                        events.fire('hotspot:hotspot-btns')
                        break
                    case 'r':
                        events.fire('inputEvent', 'reset', event)
                        break
                }
            }
        })
        const activatePointerLock = () => {
            this._desktopInput._pointerLock = true
            canvas.requestPointerLock()
        }
        const deactivatePointerLock = () => {
            this._desktopInput._pointerLock = false
            if (document.pointerLockElement === canvas) {
                document.exitPointerLock()
            }
        }
        // Pointer lock management for walk mode on desktop (gaming controls only)
        events.on('cameraMode:changed', (value, prev) => {
            if (value === 'walk' && state.inputMode === 'desktop' && state.gamingControls) {
                activatePointerLock()
            } else if (prev === 'walk') {
                deactivatePointerLock()
            }
            updateCanvasCursor()
        })
        // Toggle pointer lock when gaming controls changes while in walk mode
        events.on('gamingControls:changed', (value) => {
            if (state.cameraMode === 'walk' && state.inputMode === 'desktop') {
                if (value) {
                    activatePointerLock()
                } else {
                    deactivatePointerLock()
                }
            }
            updateCanvasCursor()
        })
        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement && state.cameraMode === 'walk' && state.gamingControls) {
                recentlyExitedWalk = true
                requestAnimationFrame(() => {
                    recentlyExitedWalk = false
                })
                if (state.inputMode === 'desktop') {
                    state.gamingControls = false
                } else {
                    events.fire('inputEvent', 'exitWalk')
                }
            }
        })
        // Pointer lock request rejected (e.g., no user gesture, document hidden).
        // Revert to avoid being stuck in walk mode without mouse capture.
        document.addEventListener('pointerlockerror', () => {
            this._desktopInput._pointerLock = false
            if (state.inputMode === 'desktop') {
                state.gamingControls = false
            } else {
                events.fire('inputEvent', 'exitWalk')
            }
        })
    }
    _pickVoxel(offsetX, offsetY) {
        if (!this.collider) return null
        const { camera } = this.global
        const cameraPos = camera.getPosition()
        camera.camera.screenToWorld(offsetX, offsetY, 1.0, tmpV1)
        tmpV1.sub(cameraPos).normalize()
        // PlayCanvas → voxel space: negate X and Y
        const hit = this.collider.queryRay(
            -cameraPos.x,
            -cameraPos.y,
            cameraPos.z,
            -tmpV1.x,
            -tmpV1.y,
            tmpV1.z,
            camera.camera.farClip,
        )
        if (!hit) return null
        const rdx = -tmpV1.x
        const rdy = -tmpV1.y
        const rdz = tmpV1.z
        const sn = this.collider.querySurfaceNormal(hit.x, hit.y, hit.z, rdx, rdy, rdz)
        return {
            position: new Vec3(-hit.x, -hit.y, hit.z),
            normal: new Vec3(-sn.nx, -sn.ny, sn.nz),
        }
    }
    /**
     * @param dt - delta time in seconds
     * @param state - the current state of the app
     * @param state.cameraMode - the current camera mode
     * @param distance - the distance to the camera target
     */
    update(dt, distance) {
        const { keyCode } = KeyboardMouseSource
        const { key, button, mouse, wheel } = this._desktopInput.read()
        const { touch, pinch, count } = this._orbitInput.read()
        const { leftStick, rightStick } = this._gamepadInput.read()
        const { state, events } = this.global
        const { camera } = this.global.camera
        // update state
        const isOrtery = state.cameraMode === 'ortery'
        this._state.axis.add(
            tmpV1.set(
                isOrtery ? 0 : key[keyCode.D] - key[keyCode.A] + (key[keyCode.RIGHT] - key[keyCode.LEFT]),
                isOrtery ? 0 : key[keyCode.E] - key[keyCode.Q],
                isOrtery ? 0 : key[keyCode.W] - key[keyCode.S] + (key[keyCode.UP] - key[keyCode.DOWN]),
            ),
        )
        // if(!isOrtery) this._state.jump += key[keyCode.SPACE]
        this._state.touches += count[0]
        for (let i = 0; i < button.length; i++) {
            this._state.mouse[i] += button[i]
        }
        // this._state.shift += key[keyCode.SHIFT]
        // this._state.ctrl += key[keyCode.CTRL]
        const isWalk = state.cameraMode === 'walk'
        // Cancel any active auto-walk when the user provides WASD/arrow input
        if (isWalk && (this._state.axis.x !== 0 || this._state.axis.z !== 0)) {
            events.fire('walkCancel')
        }
        // Tap detection using existing MultiTouchSource deltas
        if (isWalk) {
            const prevTaps = this._tapTouches
            this._tapTouches = Math.max(0, this._tapTouches + count[0])
            // Touch just started (0 → 1+)
            if (prevTaps === 0 && this._tapTouches > 0) {
                this._tapDelta = 0
            }
            // Accumulate movement while touch is active
            if (this._tapTouches > 0) {
                const prevDelta = this._tapDelta
                this._tapDelta += Math.abs(touch[0]) + Math.abs(touch[1])
                if (prevDelta < TAP_EPSILON && this._tapDelta >= TAP_EPSILON) {
                    if (!state.gamingControls) {
                        events.fire('walkCancel')
                    }
                }
            }
            // Touch just ended (1+ → 0): check if it was a tap
            if (prevTaps > 0 && this._tapTouches === 0) {
                if (this._tapDelta < TAP_EPSILON) {
                    if (!state.gamingControls) {
                        const result = this._pickVoxel(this._lastPointerOffsetX, this._lastPointerOffsetY)
                        if (result && state.cameraMode === 'walk' && !state.gamingControls) {
                            events.fire('walkTo', result.position, result.normal)
                        }
                    } else {
                        this._tapJump = true
                    }
                }
            }
        } else {
            this._tapTouches = 0
        }
        const isFirstPerson = state.cameraMode === 'fly' || isWalk
        // Accumulate pinch and pan deltas into velocity when not in gaming controls
        // pinch[0] = oldDist - newDist: negative when spreading, positive when closing
        // Spreading = forward → subtract pinch delta
        if (isFirstPerson && !state.gamingControls && this._state.touches > 1) {
            this._pinchVelocity -= pinch[0] * this.pinchVelocitySensitivity
            this._pinchVelocity = math.clamp(this._pinchVelocity, -1, 1.0)
            this._panVelocity[0] += touch[0] * this.panVelocitySensitivity
            this._panVelocity[0] = math.clamp(this._panVelocity[0], -1, 1.0)
            this._panVelocity[1] += touch[1] * this.panVelocitySensitivity
            this._panVelocity[1] = math.clamp(this._panVelocity[1], -1, 1.0)
        } else if (isFirstPerson && this._state.touches <= 1) {
            this._pinchVelocity = 0
            this._panVelocity[0] = 0
            this._panVelocity[1] = 0
        }
        if (!isFirstPerson && this._state.axis.length() > 0) {
            events.fire('inputEvent', 'requestFirstPerson')
        }
        const orbit = +(state.cameraMode === 'orbit' || state.cameraMode === 'ortery')
        const fly = +isFirstPerson
        const double = +(this._state.touches > 1)
        const pan = this._state.mouse[2] || +(button[2] === -1) || double
        const orbitFactor = fly ? camera.fov / 120 : 1
        const dragInvert = isFirstPerson && !state.gamingControls ? -1 : 1
        const { deltas } = this.frame
        // desktop move
        const v = tmpV1.set(0, 0, 0)
        const keyMove = this._state.axis.clone()
        if (isWalk) {
            // In walk mode, normalize only horizontal axes so jump doesn't reduce speed
            keyMove.y = 0
        }
        keyMove.normalize()
        const shiftMul = isWalk ? 2 : 4
        const ctrlMul = isWalk ? 0.5 : 0.25
        const speed = this.moveSpeed * (this._state.shift ? shiftMul : this._state.ctrl ? ctrlMul : 1)
        v.add(keyMove.mulScalar(fly * speed * dt))
        if (isWalk) {
            // Pass jump signal as raw Y; WalkController uses move[1] > 0 as boolean trigger
            v.y = this._state.jump > 0 ? 1 : 0
        }
        const panMove = screenToWorld(camera, mouse[0], mouse[1], distance)
        v.add(panMove.mulScalar(pan))
        const wheelMove = new Vec3(0, 0, -wheel[0])
        v.add(wheelMove.mulScalar(this.wheelSpeed * DISPLACEMENT_SCALE))
        // FIXME: need to flip z axis for orbit camera
        deltas.move.append([v.x, v.y, orbit ? -v.z : v.z])
        // desktop rotate
        v.set(0, 0, 0)
        mouseRotate.set(mouse[0], mouse[1], 0)
        v.add(
            mouseRotate.mulScalar(
                (1 - pan) * this.orbitSpeed * orbitFactor * this.mouseRotateSensitivity * DISPLACEMENT_SCALE,
            ),
        )
        deltas.rotate.append([v.x, v.y, v.z])
        // mobile move
        v.set(0, 0, 0)
        const orbitMove = screenToWorld(camera, touch[0], touch[1], distance)
        v.add(orbitMove.mulScalar(orbit * pan))
        if (state.gamingControls) {
            // Use touch joystick values for fly movement (X = strafe, Y = forward/backward)
            flyMove.set(this._touchJoystick[0], 0, -this._touchJoystick[1])
            v.add(flyMove.mulScalar(fly * this.moveSpeed * dt))
        } else {
            // Pan velocity → strafe (X) and vertical (Y, fly only — walk uses gravity)
            flyTouchPan.set(this._panVelocity[0], isWalk ? 0 : -this._panVelocity[1], 0)
            v.add(flyTouchPan.mulScalar(fly * this.touchPinchMoveSensitivity * this.moveSpeed * dt))
            // Pinch velocity → forward/backward
            flyMove.set(0, 0, this._pinchVelocity)
            v.add(flyMove.mulScalar(fly * this.touchPinchMoveSensitivity * this.moveSpeed * dt))
        }
        pinchMove.set(0, 0, pinch[0])
        v.add(pinchMove.mulScalar(orbit * double * this.pinchSpeed * DISPLACEMENT_SCALE))
        // Tap-to-jump for mobile walk mode
        if (isWalk && this._tapJump) {
            v.y = 1
            this._tapJump = false
        }
        deltas.move.append([v.x, v.y, v.z])
        // mobile rotate
        v.set(0, 0, 0)
        orbitRotate.set(touch[0], touch[1], 0)
        v.add(
            orbitRotate.mulScalar(
                orbit * (1 - pan) * this.orbitSpeed * this.touchRotateSensitivity * DISPLACEMENT_SCALE,
            ),
        )
        // In fly mode, use single touch for look-around (inverted direction)
        // Exclude multi-touch (double) to avoid interference with pinch/strafe gestures
        flyRotate.set(touch[0] * dragInvert, touch[1] * dragInvert, 0)
        v.add(
            flyRotate.mulScalar(
                fly * (1 - double) * this.orbitSpeed * orbitFactor * this.touchRotateSensitivity * DISPLACEMENT_SCALE,
            ),
        )
        deltas.rotate.append([v.x, v.y, v.z])
        // gamepad move
        v.set(0, 0, 0)
        stickMove.set(leftStick[0], 0, -leftStick[1])
        v.add(stickMove.mulScalar(this.moveSpeed * dt))
        deltas.move.append([v.x, v.y, v.z])
        // gamepad rotate
        v.set(0, 0, 0)
        stickRotate.set(rightStick[0], rightStick[1], 0)
        v.add(stickRotate.mulScalar(this.orbitSpeed * orbitFactor * this.gamepadRotateSensitivity * dt))
        deltas.rotate.append([v.x, v.y, v.z])
    }
}

// ---------------------------------------------------------------------------
// WGSL compute shader: ray-march through the sparse voxel octree per pixel
// ---------------------------------------------------------------------------
const voxelOverlayWGSL = /* wgsl */ `

// Solid leaf sentinel: childMask=0xFF, baseOffset=0
const SOLID_LEAF_MARKER: u32 = 0xFF000000u;

// Maximum DDA steps to prevent infinite loops
const MAX_STEPS: u32 = 512u;

// Target wireframe edge width in pixels
const EDGE_PIXELS: f32 = 1.5;

// Wireframe edge alpha
const EDGE_ALPHA: f32 = 0.85;

// Interior fill alpha (subtle orientation tint)
const FILL_ALPHA: f32 = 0.12;

struct Uniforms {
    invVP: mat4x4<f32>,
    screenWidth: u32,
    screenHeight: u32,
    gridMinX: f32,
    gridMinY: f32,
    gridMinZ: f32,
    voxelRes: f32,
    numVoxelsX: u32,
    numVoxelsY: u32,
    numVoxelsZ: u32,
    leafSize: u32,
    treeDepth: u32,
    projScaleY: f32,
    displayMode: u32,
    pad2: u32
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> nodes: array<u32>;
@group(0) @binding(2) var<storage, read> leafData: array<u32>;
@group(0) @binding(3) var outputTexture: texture_storage_2d<rgba8unorm, write>;

// ---- helpers ----

// Traverse the octree for block (bx, by, bz). Returns vec2u(result, emptyLevel):
//   result: 0 = empty, 1 = solid, 2+ = mixed leaf (2 + leafDataIndex)
//   emptyLevel: octree level at which emptiness was detected (only meaningful when result == 0)
fn queryBlock(bx: i32, by: i32, bz: i32) -> vec2u {
    let depth = uniforms.treeDepth;
    var nodeIndex: u32 = 0u;

    for (var level: u32 = depth - 1u; ; ) {
        let node = nodes[nodeIndex];

        // Solid leaf sentinel
        if (node == SOLID_LEAF_MARKER) {
            return vec2u(1u, 0u);
        }

        let childMask = (node >> 24u) & 0xFFu;

        // childMask == 0 means this is a mixed leaf node
        if (childMask == 0u) {
            let leafIdx = node & 0x00FFFFFFu;
            return vec2u(2u + leafIdx, 0u);
        }

        // Determine octant at this level
        let bitX = (u32(bx) >> level) & 1u;
        let bitY = (u32(by) >> level) & 1u;
        let bitZ = (u32(bz) >> level) & 1u;
        let octant = (bitZ << 2u) | (bitY << 1u) | bitX;

        // Check if child exists
        if ((childMask & (1u << octant)) == 0u) {
            return vec2u(0u, level);
        }

        // Compute child index
        let baseOffset = node & 0x00FFFFFFu;
        let prefix = (1u << octant) - 1u;
        let childOffset = countOneBits(childMask & prefix);
        nodeIndex = baseOffset + childOffset;

        if (level == 0u) { break; }
        level -= 1u;
    }

    // Reached leaf level
    let node = nodes[nodeIndex];
    if (node == SOLID_LEAF_MARKER) {
        return vec2u(1u, 0u);
    }
    let leafIdx = node & 0x00FFFFFFu;
    return vec2u(2u + leafIdx, 0u);
}

// Ray-AABB intersection returning (tNear, tFar). If tNear > tFar → miss.
fn intersectAABB(ro: vec3f, invDir: vec3f, bmin: vec3f, bmax: vec3f) -> vec2f {
    let t1 = (bmin - ro) * invDir;
    let t2 = (bmax - ro) * invDir;
    let tmin = min(t1, t2);
    let tmax = max(t1, t2);
    let tNear = max(max(tmin.x, tmin.y), tmin.z);
    let tFar  = min(min(tmax.x, tmax.y), tmax.z);
    return vec2f(tNear, tFar);
}

// Compute wireframe edge factor (0 = interior, 1 = on edge) for a hit point on a voxel cube.
// Uses the median of the three per-axis face distances so it works on ANY face.
fn edgeFactor(hitPos: vec3f, voxMin: vec3f, voxSize: f32, edgeWidth: f32) -> f32 {
    let local = (hitPos - voxMin) / voxSize;

    // Distance to nearest face boundary for each axis
    let fx = min(local.x, 1.0 - local.x);
    let fy = min(local.y, 1.0 - local.y);
    let fz = min(local.z, 1.0 - local.z);

    // Median of three values = second smallest = edge distance.
    // On a face, one of fx/fy/fz is ~0 (the face normal axis).
    // The median gives the smaller of the other two = distance to nearest edge.
    let edgeDist = max(min(fx, fy), min(max(fx, fy), fz));

    return 1.0 - smoothstep(0.0, edgeWidth, edgeDist);
}

// Shade a voxel hit, returning premultiplied RGBA
fn shadeVoxelHit(hitPos: vec3f, voxMin: vec3f, voxelRes: f32, ro: vec3f, isSolid: bool) -> vec4f {
    let dist = length(hitPos - ro);
    let pixelWorld = 2.0 * dist / (f32(uniforms.screenHeight) * uniforms.projScaleY);
    let ew = clamp(EDGE_PIXELS * pixelWorld / voxelRes, 0.01, 0.5);

    let ef = edgeFactor(hitPos, voxMin, voxelRes, ew);
    let distFade = clamp(1.0 - dist * 0.01, 0.2, 1.0);

    let local = (hitPos - voxMin) / voxelRes;
    let fx = min(local.x, 1.0 - local.x);
    let fy = min(local.y, 1.0 - local.y);
    let fz = min(local.z, 1.0 - local.z);

    var faceAxis: u32 = 0u;
    if (fy <= fx && fy <= fz) {
        faceAxis = 1u;
    } else if (fz <= fx) {
        faceAxis = 2u;
    }

    var baseColor: vec3f;
    if (isSolid) {
        if (faceAxis == 0u) { baseColor = vec3f(1.0, 0.25, 0.2); }
        else if (faceAxis == 1u) { baseColor = vec3f(0.8, 0.15, 0.1); }
        else { baseColor = vec3f(0.55, 0.08, 0.05); }
    } else {
        if (faceAxis == 0u) { baseColor = vec3f(0.7, 0.7, 0.72); }
        else if (faceAxis == 1u) { baseColor = vec3f(0.5, 0.5, 0.52); }
        else { baseColor = vec3f(0.33, 0.33, 0.35); }
    }

    let alpha = mix(FILL_ALPHA, EDGE_ALPHA, ef) * distFade;

    return vec4f(mix(baseColor, vec3f(0.0), alpha) * alpha, alpha);
}

// Blue (0) -> Cyan (0.25) -> Green (0.5) -> Yellow (0.75) -> Red (1.0)
fn heatmap(t: f32) -> vec3f {
    let c = clamp(t, 0.0, 1.0);
    let r = clamp(min(c - 0.5, 1.0) * 2.0, 0.0, 1.0);
    let g = select(clamp(c * 4.0, 0.0, 1.0), clamp((1.0 - c) * 4.0, 0.0, 1.0), c > 0.5);
    let b = clamp(1.0 - c * 2.0, 0.0, 1.0);
    return vec3f(r, g, b);
}

// ---- main ----

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let px = i32(gid.x);
    let py = i32(gid.y);
    let sw = i32(uniforms.screenWidth);
    let sh = i32(uniforms.screenHeight);

    if (px >= sw || py >= sh) {
        return;
    }

    // Reconstruct world-space ray from pixel coordinates
    let ndcX = (f32(px) + 0.5) / f32(sw) * 2.0 - 1.0;
    let ndcY = -((f32(py) + 0.5) / f32(sh) * 2.0 - 1.0);

    let clipNear = vec4f(ndcX, ndcY, 0.0, 1.0);
    let clipFar  = vec4f(ndcX, ndcY, 1.0, 1.0);

    var worldNear = uniforms.invVP * clipNear;
    worldNear = worldNear / worldNear.w;
    var worldFar = uniforms.invVP * clipFar;
    worldFar = worldFar / worldFar.w;

    // Convert from PlayCanvas world space to voxel space (negate X and Y)
    let ro = vec3f(-worldNear.x, -worldNear.y, worldNear.z);
    let rd = normalize(vec3f(-(worldFar.x - worldNear.x), -(worldFar.y - worldNear.y), worldFar.z - worldNear.z));

    // Grid AABB
    let gridMin = vec3f(uniforms.gridMinX, uniforms.gridMinY, uniforms.gridMinZ);
    let gridMax = gridMin + vec3f(
        f32(uniforms.numVoxelsX),
        f32(uniforms.numVoxelsY),
        f32(uniforms.numVoxelsZ)
    ) * uniforms.voxelRes;

    let invDir = 1.0 / rd;
    let gridHit = intersectAABB(ro, invDir, gridMin, gridMax);

    if (gridHit.x > gridHit.y) {
        textureStore(outputTexture, vec2i(px, py), vec4f(0.0));
        return;
    }

    let tEntry = max(gridHit.x, 0.0) + 0.0001;

    // Entry point in voxel-index space
    let entryWorld = ro + rd * tEntry;
    let voxelRes = uniforms.voxelRes;
    let lsf = f32(uniforms.leafSize);
    let blockRes = voxelRes * lsf;
    let leafSz = i32(uniforms.leafSize);

    // Block-level DDA setup
    let entryBlock = (entryWorld - gridMin) / blockRes;
    let numBlocksX = i32(uniforms.numVoxelsX / uniforms.leafSize);
    let numBlocksY = i32(uniforms.numVoxelsY / uniforms.leafSize);
    let numBlocksZ = i32(uniforms.numVoxelsZ / uniforms.leafSize);

    var bx = clamp(i32(floor(entryBlock.x)), 0, numBlocksX - 1);
    var by = clamp(i32(floor(entryBlock.y)), 0, numBlocksY - 1);
    var bz = clamp(i32(floor(entryBlock.z)), 0, numBlocksZ - 1);

    let stepX = select(-1, 1, rd.x >= 0.0);
    let stepY = select(-1, 1, rd.y >= 0.0);
    let stepZ = select(-1, 1, rd.z >= 0.0);

    let tDeltaX = abs(blockRes / rd.x);
    let tDeltaY = abs(blockRes / rd.y);
    let tDeltaZ = abs(blockRes / rd.z);

    // tMax: t value to reach next block boundary along each axis
    let blockMinWorld = gridMin + vec3f(f32(bx), f32(by), f32(bz)) * blockRes;
    let nextBoundX = select(blockMinWorld.x, blockMinWorld.x + blockRes, rd.x >= 0.0);
    let nextBoundY = select(blockMinWorld.y, blockMinWorld.y + blockRes, rd.y >= 0.0);
    let nextBoundZ = select(blockMinWorld.z, blockMinWorld.z + blockRes, rd.z >= 0.0);

    var tMaxX = (nextBoundX - ro.x) / rd.x;
    var tMaxY = (nextBoundY - ro.y) / rd.y;
    var tMaxZ = (nextBoundZ - ro.z) / rd.z;

    var totalWork: u32 = 0u;

    for (var step: u32 = 0u; step < MAX_STEPS; step++) {
        totalWork += 1u;

        let qResult = queryBlock(bx, by, bz);
        let blockResult = qResult.x;
        let emptyLevel = qResult.y;

        if (blockResult == 0u && emptyLevel >= 1u) {
            // Large empty region: advance the block DDA past the empty cell
            let cellBlocks = i32(1u << emptyLevel);
            let cellMask = ~(cellBlocks - 1);
            let cellXMin = bx & cellMask;
            let cellYMin = by & cellMask;
            let cellZMin = bz & cellMask;

            for (var skip: u32 = 0u; skip < 128u; skip++) {
                totalWork += 1u;

                if (tMaxX < tMaxY && tMaxX < tMaxZ) {
                    bx += stepX;
                    tMaxX += tDeltaX;
                    if (bx < cellXMin || bx >= cellXMin + cellBlocks) { break; }
                } else if (tMaxY < tMaxZ) {
                    by += stepY;
                    tMaxY += tDeltaY;
                    if (by < cellYMin || by >= cellYMin + cellBlocks) { break; }
                } else {
                    bz += stepZ;
                    tMaxZ += tDeltaZ;
                    if (bz < cellZMin || bz >= cellZMin + cellBlocks) { break; }
                }
            }
        } else {
            if (blockResult != 0u) {
                let blockOrigin = gridMin + vec3f(f32(bx), f32(by), f32(bz)) * blockRes;

                let blockMax = blockOrigin + vec3f(blockRes);
                let bHit = intersectAABB(ro, invDir, blockOrigin, blockMax);
                let tBlockEntry = max(bHit.x, 0.0);

                // Voxel-level DDA within the block
                let entryVoxWorld = ro + rd * (tBlockEntry + 0.0001);
                let entryLocal = (entryVoxWorld - blockOrigin) / voxelRes;
                var vx = clamp(i32(floor(entryLocal.x)), 0, leafSz - 1);
                var vy = clamp(i32(floor(entryLocal.y)), 0, leafSz - 1);
                var vz = clamp(i32(floor(entryLocal.z)), 0, leafSz - 1);

                let vTDeltaX = abs(voxelRes / rd.x);
                let vTDeltaY = abs(voxelRes / rd.y);
                let vTDeltaZ = abs(voxelRes / rd.z);

                let voxOrigin = blockOrigin + vec3f(f32(vx), f32(vy), f32(vz)) * voxelRes;
                let vNextX = select(voxOrigin.x, voxOrigin.x + voxelRes, rd.x >= 0.0);
                let vNextY = select(voxOrigin.y, voxOrigin.y + voxelRes, rd.y >= 0.0);
                let vNextZ = select(voxOrigin.z, voxOrigin.z + voxelRes, rd.z >= 0.0);

                var vTMaxX = (vNextX - ro.x) / rd.x;
                var vTMaxY = (vNextY - ro.y) / rd.y;
                var vTMaxZ = (vNextZ - ro.z) / rd.z;

                var maskLo: u32 = 0u;
                var maskHi: u32 = 0u;
                if (blockResult > 1u) {
                    let leafIdx = blockResult - 2u;
                    maskLo = leafData[leafIdx * 2u];
                    maskHi = leafData[leafIdx * 2u + 1u];
                }

                for (var vStep: u32 = 0u; vStep < 12u; vStep++) {
                    totalWork += 1u;

                    var isSolid = false;

                    if (blockResult == 1u) {
                        isSolid = true;
                    } else {
                        let bitIndex = u32(vz) * 16u + u32(vy) * 4u + u32(vx);
                        isSolid = select(
                            (maskHi & (1u << (bitIndex - 32u))) != 0u,
                            (maskLo & (1u << bitIndex)) != 0u,
                            bitIndex < 32u
                        );
                    }

                    if (isSolid) {
                        if (uniforms.displayMode == 0u) {
                            let voxMin = blockOrigin + vec3f(f32(vx), f32(vy), f32(vz)) * voxelRes;
                            let vHit = intersectAABB(ro, invDir, voxMin, voxMin + vec3f(voxelRes));
                            let hitPos = ro + rd * max(vHit.x, 0.0);
                            let result = shadeVoxelHit(hitPos, voxMin, voxelRes, ro, blockResult == 1u);
                            textureStore(outputTexture, vec2i(px, py), result);
                        } else {
                            let effort = f32(totalWork) / 256.0;
                            let color = heatmap(effort);
                            textureStore(outputTexture, vec2i(px, py), vec4f(color, 1.0));
                        }
                        return;
                    }

                    // Advance voxel DDA
                    if (vTMaxX < vTMaxY && vTMaxX < vTMaxZ) {
                        vx += stepX;
                        vTMaxX += vTDeltaX;
                        if (vx < 0 || vx >= leafSz) { break; }
                    } else if (vTMaxY < vTMaxZ) {
                        vy += stepY;
                        vTMaxY += vTDeltaY;
                        if (vy < 0 || vy >= leafSz) { break; }
                    } else {
                        vz += stepZ;
                        vTMaxZ += vTDeltaZ;
                        if (vz < 0 || vz >= leafSz) { break; }
                    }
                }
            }

            // Advance block DDA
            if (tMaxX < tMaxY && tMaxX < tMaxZ) {
                bx += stepX;
                tMaxX += tDeltaX;
            } else if (tMaxY < tMaxZ) {
                by += stepY;
                tMaxY += tDeltaY;
            } else {
                bz += stepZ;
                tMaxZ += tDeltaZ;
            }
        }

        if (bx < 0 || by < 0 || bz < 0 ||
            bx >= numBlocksX || by >= numBlocksY || bz >= numBlocksZ) {
            break;
        }
    }

    if (uniforms.displayMode == 0u) {
        textureStore(outputTexture, vec2i(px, py), vec4f(0.0));
    } else {
        let effort = f32(totalWork) / 256.0;
        let color = heatmap(effort);
        textureStore(outputTexture, vec2i(px, py), vec4f(color, 1.0));
    }
}
`
// ---------------------------------------------------------------------------
// VoxelDebugOverlay class
// ---------------------------------------------------------------------------
class VoxelDebugOverlay {
    app
    camera
    compute
    storageTexture
    overlayMaterial
    nodesBuffer
    leafDataBuffer
    collider
    currentWidth = 0
    currentHeight = 0
    invVP = new Mat4()
    vpTemp = new Mat4()
    /** Whether the overlay is currently rendering. */
    enabled = false
    /** Display mode: 'overlay' for wireframe debug, 'heatmap' for effort visualization. */
    mode = 'overlay'
    constructor(app, collider, camera) {
        this.app = app
        this.camera = camera
        this.collider = collider
        const device = app.graphicsDevice
        // Upload SVO node array as a read-only storage buffer
        const nodesData = collider.nodes
        const nodesByteSize = Math.max(nodesData.byteLength, 4)
        this.nodesBuffer = new StorageBuffer(device, nodesByteSize, BUFFERUSAGE_COPY_DST)
        if (nodesData.byteLength > 0) {
            this.nodesBuffer.write(0, nodesData, 0, nodesData.length)
        }
        // Upload leaf data as a read-only storage buffer
        const leafDataArr = collider.leafData
        const leafByteSize = Math.max(leafDataArr.byteLength, 4)
        this.leafDataBuffer = new StorageBuffer(device, leafByteSize, BUFFERUSAGE_COPY_DST)
        if (leafDataArr.byteLength > 0) {
            this.leafDataBuffer.write(0, leafDataArr, 0, leafDataArr.length)
        }
        // Create the initial storage texture (will be resized on first update)
        this.currentWidth = Math.max(device.width, 1)
        this.currentHeight = Math.max(device.height, 1)
        this.storageTexture = this.createStorageTexture(this.currentWidth, this.currentHeight)
        // Create compute shader
        const shaderDefinition = {
            name: 'VoxelDebugOverlay',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: voxelOverlayWGSL,
            computeUniformBufferFormats: {
                uniforms: new UniformBufferFormat(device, [
                    new UniformFormat('invVP', UNIFORMTYPE_MAT4),
                    new UniformFormat('screenWidth', UNIFORMTYPE_UINT),
                    new UniformFormat('screenHeight', UNIFORMTYPE_UINT),
                    new UniformFormat('gridMinX', UNIFORMTYPE_FLOAT),
                    new UniformFormat('gridMinY', UNIFORMTYPE_FLOAT),
                    new UniformFormat('gridMinZ', UNIFORMTYPE_FLOAT),
                    new UniformFormat('voxelRes', UNIFORMTYPE_FLOAT),
                    new UniformFormat('numVoxelsX', UNIFORMTYPE_UINT),
                    new UniformFormat('numVoxelsY', UNIFORMTYPE_UINT),
                    new UniformFormat('numVoxelsZ', UNIFORMTYPE_UINT),
                    new UniformFormat('leafSize', UNIFORMTYPE_UINT),
                    new UniformFormat('treeDepth', UNIFORMTYPE_UINT),
                    new UniformFormat('projScaleY', UNIFORMTYPE_FLOAT),
                    new UniformFormat('displayMode', UNIFORMTYPE_UINT),
                    new UniformFormat('pad2', UNIFORMTYPE_UINT),
                ]),
            },
            computeBindGroupFormat: new BindGroupFormat(device, [
                new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
                new BindStorageBufferFormat('nodes', SHADERSTAGE_COMPUTE, true),
                new BindStorageBufferFormat('leafData', SHADERSTAGE_COMPUTE, true),
                new BindStorageTextureFormat('outputTexture', PIXELFORMAT_RGBA8, TEXTUREDIMENSION_2D),
            ]),
        }
        const shader = new Shader(device, shaderDefinition)
        // Create compute instance
        this.compute = new Compute(device, shader, 'VoxelDebugOverlay')
        // Create overlay material with premultiplied alpha blending and a custom
        // fragment shader that preserves the texture's alpha channel (the built-in
        // getTextureShaderDesc hardcodes alpha = 1.0, which prevents blending).
        this.overlayMaterial = new ShaderMaterial()
        this.overlayMaterial.cull = CULLFACE_NONE
        this.overlayMaterial.blendType = BLEND_PREMULTIPLIED
        this.overlayMaterial.depthTest = false
        this.overlayMaterial.depthWrite = false
        this.overlayMaterial.setParameter('colorMap', this.storageTexture)
        this.overlayMaterial.shaderDesc = {
            uniqueName: 'VoxelOverlayComposite',
            vertexGLSL: /* glsl */ `
                attribute vec2 vertex_position;
                uniform mat4 matrix_model;
                varying vec2 uv0;
                void main(void) {
                    gl_Position = matrix_model * vec4(vertex_position, 0, 1);
                    uv0 = vertex_position.xy + 0.5;
                }
            `,
            vertexWGSL: /* wgsl */ `
                attribute vertex_position: vec2f;
                uniform matrix_model: mat4x4f;
                varying uv0: vec2f;
                @vertex fn vertexMain(input: VertexInput) -> VertexOutput {
                    var output: VertexOutput;
                    output.position = uniform.matrix_model * vec4f(input.vertex_position, 0.0, 1.0);
                    output.uv0 = input.vertex_position.xy + vec2f(0.5);
                    return output;
                }
            `,
            fragmentGLSL: /* glsl */ `
                varying vec2 uv0;
                uniform sampler2D colorMap;
                void main(void) {
                    gl_FragColor = texture2D(colorMap, uv0);
                }
            `,
            fragmentWGSL: /* wgsl */ `
                varying uv0: vec2f;
                var colorMap: texture_2d<f32>;
                var colorMapSampler: sampler;
                @fragment fn fragmentMain(input: FragmentInput) -> FragmentOutput {
                    var output: FragmentOutput;
                    output.color = textureSample(colorMap, colorMapSampler, input.uv0);
                    return output;
                }
            `,
            attributes: { vertex_position: SEMANTIC_POSITION },
        }
        this.overlayMaterial.update()
    }
    createStorageTexture(width, height) {
        return new Texture(this.app.graphicsDevice, {
            name: 'VoxelOverlay-Storage',
            width,
            height,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
            addressU: 3, // ADDRESS_CLAMP_TO_EDGE
            addressV: 3, // ADDRESS_CLAMP_TO_EDGE
            storage: true,
        })
    }
    update() {
        if (!this.enabled) return
        const { app, camera, compute, collider } = this
        const device = app.graphicsDevice
        const width = device.width
        const height = device.height
        if (width <= 0 || height <= 0) return
        // Resize storage texture if screen dimensions changed
        if (width !== this.currentWidth || height !== this.currentHeight) {
            this.storageTexture.destroy()
            this.currentWidth = width
            this.currentHeight = height
            this.storageTexture = this.createStorageTexture(width, height)
            // Update the overlay material to reference the new texture
            this.overlayMaterial.setParameter('colorMap', this.storageTexture)
            this.overlayMaterial.update()
        }
        // Compute inverse view-projection matrix
        const cam = camera.camera
        this.vpTemp.mul2(cam.projectionMatrix, cam.viewMatrix)
        this.invVP.copy(this.vpTemp).invert()
        // Set compute uniforms
        compute.setParameter('invVP', this.invVP.data)
        compute.setParameter('screenWidth', width)
        compute.setParameter('screenHeight', height)
        compute.setParameter('gridMinX', collider.gridMinX)
        compute.setParameter('gridMinY', collider.gridMinY)
        compute.setParameter('gridMinZ', collider.gridMinZ)
        compute.setParameter('voxelRes', collider.voxelResolution)
        compute.setParameter('numVoxelsX', collider.numVoxelsX)
        compute.setParameter('numVoxelsY', collider.numVoxelsY)
        compute.setParameter('numVoxelsZ', collider.numVoxelsZ)
        compute.setParameter('leafSize', collider.leafSize)
        compute.setParameter('treeDepth', collider.treeDepth)
        compute.setParameter('projScaleY', cam.projectionMatrix.data[5])
        compute.setParameter('displayMode', this.mode === 'heatmap' ? 1 : 0)
        compute.setParameter('pad2', 0)
        // Set storage buffers and output texture
        compute.setParameter('nodes', this.nodesBuffer)
        compute.setParameter('leafData', this.leafDataBuffer)
        compute.setParameter('outputTexture', this.storageTexture)
        // Dispatch compute shader
        const workgroupsX = Math.ceil(width / 8)
        const workgroupsY = Math.ceil(height / 8)
        compute.setupDispatch(workgroupsX, workgroupsY, 1)
        device.computeDispatch([compute], 'VoxelDebugOverlay')
        // Composite overlay on top of the scene
        app.drawTexture(0, 0, 2, 2, null, this.overlayMaterial)
    }
    destroy() {
        this.nodesBuffer?.destroy()
        this.leafDataBuffer?.destroy()
        this.storageTexture?.destroy()
    }
}

const SVGNS = 'http://www.w3.org/2000/svg'
const NUM_SAMPLES = 12
const CIRCLE_OUTER_RADIUS = 0.2
const CIRCLE_INNER_RADIUS = 0.17
const BEZIER_K = 1 / 6
const NORMAL_SMOOTH_FACTOR = 0.25
const tmpV = new Vec3()
const tmpScreen = new Vec3()
const tangent = new Vec3()
const bitangent = new Vec3()
const worldPt = new Vec3()
const up = new Vec3(0, 1, 0)
const right = new Vec3(1, 0, 0)
const buildBezierRing = (sx, sy) => {
    const n = sx.length
    let p = `M${sx[0].toFixed(1)},${sy[0].toFixed(1)}`
    for (let i = 0; i < n; i++) {
        const i0 = (i - 1 + n) % n
        const i1 = i
        const i2 = (i + 1) % n
        const i3 = (i + 2) % n
        const cp1x = sx[i1] + (sx[i2] - sx[i0]) * BEZIER_K
        const cp1y = sy[i1] + (sy[i2] - sy[i0]) * BEZIER_K
        const cp2x = sx[i2] - (sx[i3] - sx[i1]) * BEZIER_K
        const cp2y = sy[i2] - (sy[i3] - sy[i1]) * BEZIER_K
        p += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${sx[i2].toFixed(1)},${sy[i2].toFixed(1)}`
    }
    return `${p} Z`
}
class WalkCursor {
    svg
    cursorPath
    targetPath
    app
    camera
    collider
    canvas
    active = false
    walking = false
    targetPos = null
    targetNormal = null
    smoothNx = 0
    smoothNy = 1
    smoothNz = 0
    hasSmoothedNormal = false
    onPointerMove
    onPointerLeave
    scratchX = new Float64Array(NUM_SAMPLES)
    scratchY = new Float64Array(NUM_SAMPLES)
    outerX = new Float64Array(NUM_SAMPLES)
    outerY = new Float64Array(NUM_SAMPLES)
    innerX = new Float64Array(NUM_SAMPLES)
    innerY = new Float64Array(NUM_SAMPLES)
    constructor(app, camera, collider, events, state) {
        this.app = app
        this.camera = camera
        this.collider = collider
        this.canvas = app.graphicsDevice.canvas
        this.svg = document.createElementNS(SVGNS, 'svg')
        this.svg.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1'
        this.canvas.parentElement.appendChild(this.svg)
        // Hover cursor: thick ring
        this.cursorPath = document.createElementNS(SVGNS, 'path')
        this.cursorPath.setAttribute('fill', 'white')
        this.cursorPath.setAttribute('fill-opacity', '0.6')
        this.cursorPath.setAttribute('fill-rule', 'evenodd')
        this.cursorPath.setAttribute('stroke', 'none')
        this.svg.appendChild(this.cursorPath)
        // Walk target: filled circle
        this.targetPath = document.createElementNS(SVGNS, 'path')
        this.targetPath.setAttribute('fill', 'white')
        this.targetPath.setAttribute('fill-opacity', '0.5')
        this.targetPath.setAttribute('stroke', 'none')
        this.targetPath.style.display = 'none'
        this.svg.appendChild(this.targetPath)
        this.svg.style.display = 'none'
        this.onPointerMove = (e) => {
            if (e.pointerType === 'touch') return
            if (e.buttons) {
                this.cursorPath.style.display = 'none'
                this.hasSmoothedNormal = false
                return
            }
            this.updateCursor(e.offsetX, e.offsetY)
        }
        this.onPointerLeave = () => {
            this.cursorPath.style.display = 'none'
            this.hasSmoothedNormal = false
        }
        this.canvas.addEventListener('pointermove', this.onPointerMove)
        this.canvas.addEventListener('pointerleave', this.onPointerLeave)
        const updateActive = () => {
            this.active = state.cameraMode === 'walk' && !state.gamingControls
            if (!this.active) {
                this.svg.style.display = 'none'
            }
        }
        events.on('gamingControls:changed', updateActive)
        events.on('walkTo', () => {
            this.walking = true
            this.cursorPath.style.display = 'none'
            this.hasSmoothedNormal = false
        })
        events.on('walkCancel', () => {
            this.walking = false
            this.clearTarget()
        })
        events.on('walkComplete', () => {
            this.walking = false
            this.clearTarget()
        })
        events.on('walkTarget:set', (pos, normal) => {
            this.setTarget(pos, normal)
        })
        events.on('walkTarget:clear', () => {
            this.clearTarget()
        })
        app.on('prerender', () => {
            this.updateTarget()
        })
        updateActive()
    }
    setTarget(pos, normal) {
        this.targetPos = pos.clone()
        this.targetNormal = normal.clone()
    }
    clearTarget() {
        this.targetPos = null
        this.targetNormal = null
        this.targetPath.style.display = 'none'
    }
    projectCircle(px, py, pz, nx, ny, nz, radius, outX, outY) {
        const normal = tmpV.set(nx, ny, nz)
        if (Math.abs(normal.y) < 0.99) {
            tangent.cross(normal, up).normalize()
        } else {
            tangent.cross(normal, right).normalize()
        }
        bitangent.cross(normal, tangent)
        const cam = this.camera.camera
        const angleStep = (2 * Math.PI) / NUM_SAMPLES
        for (let i = 0; i < NUM_SAMPLES; i++) {
            const theta = i * angleStep
            const ct = Math.cos(theta)
            const st = Math.sin(theta)
            const tx = ct * tangent.x + st * bitangent.x
            const ty = ct * tangent.y + st * bitangent.y
            const tz = ct * tangent.z + st * bitangent.z
            worldPt.set(px + tx * radius, py + ty * radius, pz + tz * radius)
            cam.worldToScreen(worldPt, tmpScreen)
            outX[i] = tmpScreen.x
            outY[i] = tmpScreen.y
        }
    }
    updateCursor(offsetX, offsetY) {
        if (!this.active || this.walking) {
            this.cursorPath.style.display = 'none'
            this.hasSmoothedNormal = false
            return
        }
        const { camera, collider } = this
        const cameraPos = camera.getPosition()
        camera.camera.screenToWorld(offsetX, offsetY, 1.0, tmpV)
        tmpV.sub(cameraPos).normalize()
        const hit = collider.queryRay(
            -cameraPos.x,
            -cameraPos.y,
            cameraPos.z,
            -tmpV.x,
            -tmpV.y,
            tmpV.z,
            camera.camera.farClip,
        )
        if (!hit) {
            this.cursorPath.style.display = 'none'
            this.hasSmoothedNormal = false
            return
        }
        const px = -hit.x
        const py = -hit.y
        const pz = hit.z
        const rdx = -tmpV.x
        const rdy = -tmpV.y
        const rdz = tmpV.z
        const sn = collider.querySurfaceNormal(hit.x, hit.y, hit.z, rdx, rdy, rdz)
        let nx = -sn.nx
        let ny = -sn.ny
        let nz = sn.nz
        if (this.hasSmoothedNormal) {
            const t = NORMAL_SMOOTH_FACTOR
            nx = this.smoothNx + (nx - this.smoothNx) * t
            ny = this.smoothNy + (ny - this.smoothNy) * t
            nz = this.smoothNz + (nz - this.smoothNz) * t
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
            if (len > 1e-6) {
                const invLen = 1.0 / len
                nx *= invLen
                ny *= invLen
                nz *= invLen
            }
        }
        this.smoothNx = nx
        this.smoothNy = ny
        this.smoothNz = nz
        this.hasSmoothedNormal = true
        this.projectCircle(px, py, pz, nx, ny, nz, CIRCLE_OUTER_RADIUS, this.outerX, this.outerY)
        this.projectCircle(px, py, pz, nx, ny, nz, CIRCLE_INNER_RADIUS, this.innerX, this.innerY)
        this.cursorPath.setAttribute(
            'd',
            `${buildBezierRing(this.outerX, this.outerY)} ${buildBezierRing(this.innerX, this.innerY)}`,
        )
        this.cursorPath.style.display = ''
        this.svg.style.display = ''
    }
    updateTarget() {
        if (!this.active || !this.targetPos || !this.targetNormal) {
            return
        }
        const camPos = this.camera.getPosition()
        const dist = camPos.distance(this.targetPos)
        if (dist < 2.0) {
            this.targetPath.style.display = 'none'
            return
        }
        this.projectCircle(
            this.targetPos.x,
            this.targetPos.y,
            this.targetPos.z,
            this.targetNormal.x,
            this.targetNormal.y,
            this.targetNormal.z,
            CIRCLE_OUTER_RADIUS,
            this.scratchX,
            this.scratchY,
        )
        this.targetPath.setAttribute('d', buildBezierRing(this.scratchX, this.scratchY))
        this.targetPath.style.display = ''
        this.svg.style.display = ''
    }
    destroy() {
        this.canvas.removeEventListener('pointermove', this.onPointerMove)
        this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
        this.svg.remove()
    }
}

const gammaChunkGlsl = `
vec3 prepareOutputFromGamma(vec3 gammaColor) {
    return gammaColor;
}
`
const gammaChunkWgsl = `
fn prepareOutputFromGamma(gammaColor: vec3f) -> vec3f {
    return gammaColor;
}
`
const tonemapTable = {
    none: TONEMAP_NONE,
    linear: TONEMAP_LINEAR,
    filmic: TONEMAP_FILMIC,
    hejl: TONEMAP_HEJL,
    aces: TONEMAP_ACES,
    aces2: TONEMAP_ACES2,
    neutral: TONEMAP_NEUTRAL,
}
const applyPostEffectSettings = (cameraFrame, settings) => {
    if (settings.sharpness.enabled) {
        cameraFrame.rendering.sharpness = settings.sharpness.amount
    } else {
        cameraFrame.rendering.sharpness = 0
    }
    const { bloom } = cameraFrame
    if (settings.bloom.enabled) {
        bloom.intensity = settings.bloom.intensity
        bloom.blurLevel = settings.bloom.blurLevel
    } else {
        bloom.intensity = 0
    }
    const { grading } = cameraFrame
    if (settings.grading.enabled) {
        grading.enabled = true
        grading.brightness = settings.grading.brightness
        grading.contrast = settings.grading.contrast
        grading.saturation = settings.grading.saturation
        grading.tint = new Color().fromArray(settings.grading.tint)
    } else {
        grading.enabled = false
    }
    const { vignette } = cameraFrame
    if (settings.vignette.enabled) {
        vignette.intensity = settings.vignette.intensity
        vignette.inner = settings.vignette.inner
        vignette.outer = settings.vignette.outer
        vignette.curvature = settings.vignette.curvature
    } else {
        vignette.intensity = 0
    }
    const { fringing } = cameraFrame
    if (settings.fringing.enabled) {
        fringing.intensity = settings.fringing.intensity
    } else {
        fringing.intensity = 0
    }
}
const anyPostEffectEnabled = (settings) => {
    return (
        (settings.sharpness.enabled && settings.sharpness.amount > 0) ||
        (settings.bloom.enabled && settings.bloom.intensity > 0) ||
        settings.grading.enabled ||
        (settings.vignette.enabled && settings.vignette.intensity > 0) ||
        (settings.fringing.enabled && settings.fringing.intensity > 0)
    )
}
const vec = new Vec3()
// store the original isColorBufferSrgb so the override in updatePostEffects is idempotent
const origIsColorBufferSrgb = RenderTarget.prototype.isColorBufferSrgb
class Viewer {
    global
    cameraFrame
    inputController
    cameraManager
    annotations
    forceRenderNextFrame = false
    voxelOverlay = null
    walkCursor = null
    origChunks
    constructor(global, gsplatLoad, skyboxLoad, voxelLoad) {
        this.global = global
        const { app, settings, config, events, state, camera } = global
        const { graphicsDevice } = app
        // enable anonymous CORS for image loading in safari
        app.loader.getHandler('texture').imgParser.crossOrigin = 'anonymous'
        // render skybox as plain equirect
        const glsl = ShaderChunks.get(graphicsDevice, 'glsl')
        glsl.set('skyboxPS', glsl.get('skyboxPS').replace('mapRoughnessUv(uv, mipLevel)', 'uv'))
        const wgsl = ShaderChunks.get(graphicsDevice, 'wgsl')
        wgsl.set('skyboxPS', wgsl.get('skyboxPS').replace('mapRoughnessUv(uv, uniform.mipLevel)', 'uv'))
        this.origChunks = {
            glsl: {
                gsplatOutputVS: glsl.get('gsplatOutputVS'),
                skyboxPS: glsl.get('skyboxPS'),
            },
            wgsl: {
                gsplatOutputVS: wgsl.get('gsplatOutputVS'),
                skyboxPS: wgsl.get('skyboxPS'),
            },
        }
        // disable auto render, we'll render only when camera changes
        app.autoRender = false
        // configure the camera
        this.configureCamera(settings)
        // reconfigure camera when entering/exiting XR
        app.xr.on('start', () => this.configureCamera(settings))
        app.xr.on('end', () => this.configureCamera(settings))
        // construct debug ministats
        if (config.ministats) {
            const options = MiniStats.getDefaultOptions()
            options.cpu.enabled = false
            options.stats = options.stats.filter((s) => s.name !== 'DrawCalls')
            options.stats.push(
                {
                    name: 'VRAM',
                    stats: ['vram.tex'],
                    decimalPlaces: 1,
                    multiplier: 1 / (1024 * 1024),
                    unitsName: 'MB',
                    watermark: 1024,
                },
                {
                    name: 'Splats',
                    stats: ['frame.gsplats'],
                    decimalPlaces: 3,
                    multiplier: 1 / 1000000,
                    unitsName: 'M',
                    watermark: 5,
                },
            )
            // eslint-disable-next-line no-new
            new MiniStats(app, options)
        }
        const prevProj = new Mat4()
        const prevWorld = new Mat4()
        const sceneBound = new BoundingBox()
        global.bbox = sceneBound
        // track the camera state and trigger a render when it changes
        app.on('framerender', () => {
            const world = camera.getWorldTransform()
            const proj = camera.camera.projectionMatrix
            if (!app.renderNextFrame) {
                if (
                    config.ministats ||
                    !nearlyEquals(world.data, prevWorld.data) ||
                    !nearlyEquals(proj.data, prevProj.data)
                ) {
                    app.renderNextFrame = true
                }
            }
            // suppress rendering till we're ready
            if (!state.readyToRender) {
                app.renderNextFrame = false
            }
            if (this.forceRenderNextFrame) {
                app.renderNextFrame = true
            }
            if (app.renderNextFrame) {
                prevWorld.copy(world)
                prevProj.copy(proj)
            }
        })
        const applyCamera = (camera) => {
            const cameraEntity = global.camera
            cameraEntity.setPosition(camera.position)
            cameraEntity.setEulerAngles(camera.angles)
            cameraEntity.camera.fov = camera.fov
            cameraEntity.camera.horizontalFov = graphicsDevice.width > graphicsDevice.height
            // fit clipping planes to bounding box
            const boundRadius = sceneBound.halfExtents.length()
            // calculate the forward distance between the camera to the bound center
            vec.sub2(sceneBound.center, camera.position)
            const dist = vec.dot(cameraEntity.forward)
            const far = Math.max(dist + boundRadius, 1e-2)
            const near = Math.max(dist - boundRadius, far / (1024 * 16))
            cameraEntity.camera.farClip = far
            cameraEntity.camera.nearClip = near
        }
        // handle application update
        app.on('update', (deltaTime) => {
            // in xr mode we leave the camera alone
            if (app.xr.active) {
                return
            }
            if (this.inputController && this.cameraManager) {
                // update inputs
                this.inputController.update(deltaTime, this.cameraManager.camera.distance)
                // update cameras
                this.cameraManager.update(deltaTime, this.inputController.frame)
                // apply to the camera entity
                applyCamera(this.cameraManager.camera)
            }
        })
        // Render voxel debug overlay
        app.on('prerender', () => {
            this.voxelOverlay?.update()
        })
        // update state on first frame
        events.on('firstFrame', () => {
            state.loaded = true
            state.animationPaused = !!config.noanim
            checkPerformance(app, global)
        })
        // wait for the model to load
        Promise.all([gsplatLoad, skyboxLoad, voxelLoad]).then((results) => {
            const gsplat = results[0].gsplat
            const collider = results[2]
            // get scene bounding box
            const gsplatBbox = gsplat.customAabb
            if (gsplatBbox) {
                sceneBound.setFromTransformedAabb(gsplatBbox, results[0].getWorldTransform())
            }
            // if (!config.noui) {
            //     this.annotations = new Annotations(global, this.cameraFrame != null)
            // }
            this.inputController = new InputController(global)
            this.inputController.collider = collider ?? null
            state.hasCollision = !!collider
            // Create voxel debug overlay in WebGPU only
            if (collider && config.webgpu) {
                this.voxelOverlay = new VoxelDebugOverlay(app, collider, camera)
                this.voxelOverlay.mode = config.heatmap ? 'heatmap' : 'overlay'
                state.hasVoxelOverlay = true
                events.on('voxelOverlayEnabled:changed', (value) => {
                    this.voxelOverlay.enabled = value
                    app.renderNextFrame = true
                })
            }
            this.cameraManager = new CameraManager(global, sceneBound, camera, collider)
            const rotationGizmo = new RotationGizmo(app, camera, events)
            const pivotDot = new PivotDot(app, camera, modelEntity)
            const pivotGizmo = new PointGizmo(app, camera, modelEntity, {
                onMove: (pos) => {
                    events.fire('pivot:positionsynced', pos)
                },
            })

            events.on('pivot:enable-edit', ({ position, enable }) => {
                if (enable) {
                    pivotDot.setPivot(position)
                    pivotGizmo.setPosition(position)
                    pivotDot.enable()
                    pivotGizmo.enable()
                } else {
                    pivotDot.disable()
                    pivotGizmo.disable()
                }
            })
            events.on('pivot:positionsynced', ({ x, y, z }) => {
                pivotDot.setPivot({ x, y, z })
                pivotGizmo.setPosition({ x, y, z })
            })
            events.on('pivot:save', () => {
                pivotGizmo.disable()
                pivotDot.disable()
            })
            events.on('pivot:cancel', () => {
                pivotGizmo.disable()
                pivotDot.disable()
            })

            events.on('gizmo:position-enable', (enable) => {
                if (enable) pivotGizmo.enable()
                else pivotGizmo.disable()
            })
            events.on('gizmo:rotation-enable', (enable) => {
                if (enable) rotationGizmo.enable(new EntityRotatable(modelEntity), 'orientation:eulersynced')
                else rotationGizmo.disable()
            })

            events.on('viewer:lock-zoom-in', (value) => {
                const lockZoomIn = {
                    locked: value,
                    value: value
                        ? this.cameraManager.controllers.ortery.getCurrentDistanceScale()
                        : this.cameraManager.controllers.minDistance,
                }
                global.settings.lockZoomIn = lockZoomIn
            })

            events.on('viewer:inertia', (value) => {
                global.settings.inertia = value
                this.cameraManager.controllers[state.cameraMode].resetInertia()
            })
            events.on('viewer:auto-hide-ui', (value) => {
                global.settings.autoHideUI = value
            })
            applyCamera(this.cameraManager.camera)
            if (collider) {
                this.walkCursor = new WalkCursor(app, camera, collider, events, state)
            }
            const { instance } = gsplat
            if (instance) {
                // kick off gsplat sorting immediately now that camera is in position
                instance.sort(camera)
                // listen for sorting updates to trigger first frame events
                instance.sorter?.on('updated', () => {
                    // request frame render when sorting changes
                    app.renderNextFrame = true
                    if (!state.readyToRender) {
                        // we're ready to render once the first sort has completed
                        state.readyToRender = true
                        // wait for the first valid frame to complete rendering
                        app.once('frameend', () => {
                            events.fire('firstFrame')
                            // emit first frame event on window
                            window.firstFrame?.()
                        })
                    }
                })
            } else {
                const { gsplat } = app.scene
                // quality ranges
                const ranges = {
                    mobile: {
                        low: 1,
                        high: 2,
                    },
                    desktop: {
                        low: 2,
                        high: 4,
                    },
                }
                const quality = platform.mobile ? ranges.mobile : ranges.desktop
                // start by streaming in low lod
                const lodLevels = results[0].gsplat.resource?.octree?.lodLevels
                if (lodLevels) {
                    gsplat.lodRangeMax = gsplat.lodRangeMin = lodLevels - 1
                }
                // these two allow LOD behind camera to drop, saves lots of splats
                gsplat.lodUpdateAngle = 90
                gsplat.lodBehindPenalty = 5
                // same performance, but rotating on slow devices does not give us unsorted splats on sides
                gsplat.radialSorting = true
                const eventHandler = app.systems.gsplat
                // idle timer: force continuous rendering until 4s of inactivity
                let idleTime = 0
                this.forceRenderNextFrame = true
                app.on('update', (dt) => {
                    idleTime += dt
                    this.forceRenderNextFrame = idleTime < 4
                })
                events.on('inputEvent', (type) => {
                    if (type !== 'interact') {
                        idleTime = 0
                    }
                })
                eventHandler.on('frame:ready', (_camera, _layer, ready, loading) => {
                    if (loading > 0 || !ready) {
                        idleTime = 0
                    }
                })
                let current = 0
                let watermark = 1
                const readyHandler = (camera, layer, ready, loading) => {
                    if (ready && loading === 0) {
                        // scene is done loading
                        eventHandler.off('frame:ready', readyHandler)
                        state.readyToRender = true
                        // handle quality mode changes
                        const updateLod = () => {
                            const settings = state.retinaDisplay ? quality.high : quality.low
                            results[0].gsplat.splatBudget = settings * 1000000
                            gsplat.lodRangeMin = 0
                            gsplat.lodRangeMax = 1000
                        }
                        events.on('retinaDisplay:changed', updateLod)
                        updateLod()
                        // debug colorize lods
                        gsplat.colorizeLod = config.colorize
                        gsplat.gpuSorting = config.gpusort
                        // wait for the first valid frame to complete rendering
                        app.once('frameend', () => {
                            events.fire('firstFrame')
                            // emit first frame event on window
                            window.firstFrame?.()
                        })
                    }
                    // update loading status
                    if (loading !== current) {
                        watermark = Math.max(watermark, loading)
                        current = watermark - loading
                        state.progress = Math.trunc((current / watermark) * 100)
                    }
                }
                eventHandler.on('frame:ready', readyHandler)
            }
        })
    }
    // configure camera based on application mode and post process settings
    configureCamera(settings) {
        const { global } = this
        const { app, config, camera } = global
        settings.tonemapping = settings.tonemapping || 'none'
        const postEffectSettings = settings.postEffectSettings || {
            sharpness: { enabled: false, amount: 0 },
            bloom: { enabled: false, intensity: 1, blurLevel: 2 },
            grading: { enabled: false, brightness: 0, contrast: 1, saturation: 1, tint: [1, 1, 1] },
            vignette: { enabled: false, intensity: 0.5, inner: 0.3, outer: 0.75, curvature: 1 },
            fringing: { enabled: false, intensity: 0.5 },
        }
        const { background } = settings
        // hpr override takes precedence over settings.highPrecisionRendering
        const highPrecisionRendering = config.hpr ?? settings.highPrecisionRendering
        const enableCameraFrame =
            !app.xr.active && !config.nofx && (anyPostEffectEnabled(postEffectSettings) || highPrecisionRendering)
        global.events.on('viewer:background-changed', (color) => {
            camera.camera.clearColor = new Color(normalizeColor(color))
            global.settings.background.color = color
            global.app.render()
        })
        if (enableCameraFrame) {
            // create instance
            if (!this.cameraFrame) {
                this.cameraFrame = new CameraFrame(app, camera.camera)
            }
            const { cameraFrame } = this
            cameraFrame.enabled = true
            cameraFrame.rendering.toneMapping = tonemapTable[settings.tonemapping]
            cameraFrame.rendering.renderFormats = highPrecisionRendering
                ? [PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F]
                : []
            applyPostEffectSettings(cameraFrame, postEffectSettings)
            cameraFrame.update()
            // force gsplat shader to write gamma-space colors
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('gsplatOutputVS', gammaChunkGlsl)
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('gsplatOutputVS', gammaChunkWgsl)
            // force skybox shader to write gamma-space colors (inline pow replaces the
            // gammaCorrectOutput call which is a no-op under CameraFrame's GAMMA_NONE)
            ShaderChunks.get(app.graphicsDevice, 'glsl').set(
                'skyboxPS',
                this.origChunks.glsl.skyboxPS.replace(
                    'gammaCorrectOutput(toneMap(processEnvironment(linear)))',
                    'pow(toneMap(processEnvironment(linear)) + 0.0000001, vec3(1.0 / 2.2))',
                ),
            )
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set(
                'skyboxPS',
                this.origChunks.wgsl.skyboxPS.replace(
                    'gammaCorrectOutput(toneMap(processEnvironment(linear)))',
                    'pow(toneMap(processEnvironment(linear)) + 0.0000001, vec3f(1.0 / 2.2))',
                ),
            )
            // ensure the final compose blit doesn't perform linear->gamma conversion.
            RenderTarget.prototype.isColorBufferSrgb = function (index) {
                return this === app.graphicsDevice.backBuffer ? true : origIsColorBufferSrgb.call(this, index)
            }
            camera.camera.clearColor = new Color(normalizeColor(background.color))
        } else {
            // no post effects needed, destroy camera frame if it exists
            if (this.cameraFrame) {
                this.cameraFrame.destroy()
                this.cameraFrame = null
            }
            // restore shader chunks to engine defaults
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('gsplatOutputVS', this.origChunks.glsl.gsplatOutputVS)
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('gsplatOutputVS', this.origChunks.wgsl.gsplatOutputVS)
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('skyboxPS', this.origChunks.glsl.skyboxPS)
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('skyboxPS', this.origChunks.wgsl.skyboxPS)
            // restore original isColorBufferSrgb behavior
            RenderTarget.prototype.isColorBufferSrgb = origIsColorBufferSrgb
            if (!app.xr.active) {
                camera.camera.toneMapping = tonemapTable[settings.tonemapping]
                camera.camera.clearColor = new Color(normalizeColor(background.color))
            }
        }
    }
}

/**
 * Solid leaf node marker: childMask = 0xFF, baseOffset = 0.
 * Unambiguous because BFS layout guarantees children always come after their parent,
 * so baseOffset = 0 is never valid for an interior node.
 */
const SOLID_LEAF_MARKER = 0xff000000 >>> 0
/** Minimum penetration depth to report a collision (avoids floating-point noise at corners) */
const PENETRATION_EPSILON = 1e-4
/** Half-extent of the flatness sampling patch (5x5 when R=2). */
const FLAT_R = 2
/** 1/sqrt(2), used to normalise 45-degree diagonal normals. */
const INV_SQRT2 = 1 / Math.sqrt(2)
/**
 * Surface normal candidate directions for querySurfaceNormal.
 * Each entry: [dx, dy, dz, t1x, t1y, t1z, t2x, t2y, t2z]
 *   (dx,dy,dz) = canonical normal direction (components 0 or +/-1)
 *   (t1,t2) = orthogonal tangent vectors spanning the perpendicular sampling plane
 */
const SURFACE_CANDIDATES = [
    // Axis-aligned
    [1, 0, 0, 0, 1, 0, 0, 0, 1],
    [0, 1, 0, 1, 0, 0, 0, 0, 1],
    [0, 0, 1, 1, 0, 0, 0, 1, 0],
    // XZ diagonals (vertical walls at 45 degrees)
    [1, 0, 1, 0, 1, 0, -1, 0, 1],
    [1, 0, -1, 0, 1, 0, 1, 0, 1],
    // XY diagonals (walls tilted from vertical)
    [1, 1, 0, 0, 0, 1, -1, 1, 0],
    [1, -1, 0, 0, 0, 1, 1, 1, 0],
    // YZ diagonals (sloped floors/ceilings)
    [0, 1, 1, 1, 0, 0, 0, -1, 1],
    [0, 1, -1, 1, 0, 0, 0, 1, 1],
]
/**
 * Score a surface candidate direction by sampling a 5x5 patch at three depth layers
 * shifted along the step direction. Returns the best (maximum) layer score. A "surface
 * hit" at each sample is a solid voxel whose neighbour in the step direction is empty.
 *
 * @param collider - The voxel collider instance.
 * @param ix - Voxel X index of the surface point.
 * @param iy - Voxel Y index of the surface point.
 * @param iz - Voxel Z index of the surface point.
 * @param sx - Step X component (camera-facing direction).
 * @param sy - Step Y component.
 * @param sz - Step Z component.
 * @param t1x - First tangent vector X.
 * @param t1y - First tangent vector Y.
 * @param t1z - First tangent vector Z.
 * @param t2x - Second tangent vector X.
 * @param t2y - Second tangent vector Y.
 * @param t2z - Second tangent vector Z.
 * @returns The best score across the three depth layers.
 */
function scoreSurfaceCandidate(collider, ix, iy, iz, sx, sy, sz, t1x, t1y, t1z, t2x, t2y, t2z) {
    let best = 0
    for (let depth = 1; depth >= -1; depth--) {
        let s = 0
        for (let da = -FLAT_R; da <= FLAT_R; da++) {
            for (let db = -FLAT_R; db <= FLAT_R; db++) {
                const px = ix + da * t1x + db * t2x - sx * depth
                const py = iy + da * t1y + db * t2y - sy * depth
                const pz = iz + da * t1z + db * t2z - sz * depth
                if (collider.isVoxelSolid(px, py, pz) && !collider.isVoxelSolid(px + sx, py + sy, pz + sz)) {
                    s++
                }
            }
        }
        if (s > best) best = s
    }
    return best
}
/**
 * Count the number of set bits in a 32-bit integer.
 *
 * @param n - 32-bit integer.
 * @returns Number of bits set to 1.
 */
function popcount(n) {
    n >>>= 0
    n -= (n >>> 1) & 0x55555555
    n = (n & 0x33333333) + ((n >>> 2) & 0x33333333)
    return (((n + (n >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24
}

const loadGsplat = async (app, config, events, progressCallback) => {
    const { contents, contentUrl, unified, aa } = config
    const c = contents
    const filename = new URL(contentUrl, location.href).pathname.split('/').pop()
    const data = filename.toLowerCase() === 'meta.json' ? await (await contents).json() : undefined
    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data)
    return new Promise((resolve, reject) => {
        asset.on('load', () => {
            const entity = new Entity('gsplat')
            entity.setLocalEulerAngles(0, 0, 180)
            entity.addComponent('gsplat', {
                unified: unified || filename.toLowerCase().endsWith('lod-meta.json'),
                asset,
            })
            const material = entity.gsplat.unified ? app.scene.gsplat.material : entity.gsplat.material
            material.setDefine('GSPLAT_AA', aa)
            material.setParameter('alphaClip', 1 / 255)
            app.root.addChild(entity)
            modelEntity = entity
            events.fire('modelEntity:loaded')
            resolve(entity)
        })
        let watermark = 0
        asset.on('progress', (received, length) => {
            const progress = Math.min(1, received / length) * 100
            if (progress > watermark) {
                watermark = progress
                progressCallback(Math.trunc(watermark))
            }
        })
        asset.on('error', (err) => {
            console.log(err)
            reject(err)
        })
        app.assets.add(asset)
        app.assets.load(asset)
    })
}
const loadSkybox = (app, url) => {
    return new Promise((resolve, reject) => {
        const asset = new Asset(
            'skybox',
            'texture',
            {
                url,
            },
            {
                type: 'rgbp',
                mipmaps: false,
                addressu: 'repeat',
                addressv: 'clamp',
            },
        )
        asset.on('load', () => {
            resolve(asset)
        })
        asset.on('error', (err) => {
            console.log(err)
            reject(err)
        })
        app.assets.add(asset)
        app.assets.load(asset)
    })
}
const createApp = async (canvas, config) => {
    // Create the graphics device
    const device = await createGraphicsDevice(canvas, {
        deviceTypes: config.webgpu ? ['webgpu'] : [],
        antialias: false,
        depth: true,
        stencil: false,
        xrCompatible: !config.webgpu,
        powerPreference: 'high-performance',
    })
    // Set maxPixelRatio so the XR framebuffer scale factor is computed correctly.
    // Regular rendering bypasses maxPixelRatio via the custom initCanvas sizing.
    device.maxPixelRatio = window.devicePixelRatio
    // Create the application
    const app = new App(canvas, {
        graphicsDevice: device,
        mouse: new Mouse(canvas),
        touch: new TouchDevice(canvas),
        keyboard: new Keyboard(window),
    })
    // Create entity hierarchy
    const cameraRoot = new Entity('camera root')
    app.root.addChild(cameraRoot)
    const camera = new Entity('camera')
    cameraRoot.addChild(camera)
    const light = new Entity('light')
    light.setEulerAngles(35, 45, 0)
    light.addComponent('light', {
        color: new Color(1.0, 0.98, 0.957),
        intensity: 1,
    })
    app.root.addChild(light)
    app.scene.ambientLight.set(0.51, 0.55, 0.65)
    return { app, camera }
}
// initialize canvas size and resizing
const initCanvas = (global) => {
    const { app, events, state } = global
    const { canvas } = app.graphicsDevice
    // maximum pixel dimension we will allow along the shortest screen dimension based on platform
    const maxPixelDim = platform.mobile ? 1080 : 2160
    // cap pixel ratio to limit resolution on high-DPI devices
    const calcPixelRatio = () => Math.min(maxPixelDim / Math.min(screen.width, screen.height), window.devicePixelRatio)
    // last known device pixel size (full resolution, before any quality scaling)
    const deviceSize = { width: 0, height: 0 }
    const set = (width, height) => {
        const ratio = calcPixelRatio()
        deviceSize.width = width * ratio
        deviceSize.height = height * ratio
    }
    const apply = () => {
        // don't resize the canvas during XR - the XR system manages its own framebuffers
        // and resetting canvas dimensions can invalidate the XRWebGLLayer
        if (app.xr?.active) return
        const s = state.retinaDisplay ? 1.0 : 0.5
        const w = Math.ceil(deviceSize.width * s)
        const h = Math.ceil(deviceSize.height * s)
        if (w !== canvas.width || h !== canvas.height) {
            canvas.width = w
            canvas.height = h
        }
    }
    const resizeObserver = new ResizeObserver((entries) => {
        const e = entries[0]?.contentBoxSize?.[0]
        if (e) {
            set(e.inlineSize, e.blockSize)
            app.renderNextFrame = true
        }
    })
    resizeObserver.observe(canvas)
    events.on('retinaDisplay:changed', () => {
        app.renderNextFrame = true
    })
    // Resize canvas before render() so the swap chain texture is acquired at the correct size.
    app.on('framerender', apply)
    // Disable the engine's built-in canvas resize — we handle it via ResizeObserver
    // @ts-ignore
    app._allowResize = false
    set(canvas.clientWidth, canvas.clientHeight)
    apply()
}
// === Config / Settings (originally in <head>) ===
const createImage = (url) => {
    const img = new Image()
    img.src = url
    return img
}
function base64ToBlobWithProgress(base64, chunkSize = 1024 * 1024) {
    return new Promise((resolve) => {
        const byteChars = atob(base64)
        const total = byteChars.length
        let offset = 0
        const chunks = []
        function processChunk() {
            const end = Math.min(offset + chunkSize, total)
            const sliceLength = end - offset
            const bytes = new Uint8Array(sliceLength)
            for (let i = 0; i < sliceLength; i++) {
                bytes[i] = byteChars.charCodeAt(offset + i)
            }
            chunks.push(bytes)
            offset = end 
            updateProgress(offset, total)
            if (offset < total) {
                requestAnimationFrame(processChunk) 
            } else {
                updateProgress(total, total) 
                const blob = new Blob(chunks, { type: 'application/ply' })
                resolve(new Response(blob))
            }
        }
        processChunk()
    })
}
const createProgressFetch = (input, initPoster) => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', input)
        xhr.responseType = 'arraybuffer'
        xhr.onprogress = (e) => {
            if (e.lengthComputable) {
                updateProgress(e.loaded, e.total, initPoster)
            }
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                updateProgress(xhr.response.byteLength, xhr.response.byteLength, initPoster)
                const blob = new Blob([xhr.response])
                resolve(new Response(blob))
            } else {
                reject(new Error('HTTP error ' + xhr.status))
            }
        }
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send()
    })
}

const url = new URL(location.href)
const posterUrl = url.searchParams.get('poster')
const skyboxUrl = url.searchParams.get('skybox')
const voxelUrl = url.searchParams.get('voxel')
const { settings } = window?.sse
const hasPoster = !!posterUrl
const config = {
    poster: posterUrl && createImage(posterUrl),
    skyboxUrl,
    voxelUrl,
    contentUrl: settings.contentUrl,
    contents: settings.base64
    ? base64ToBlobWithProgress(settings.base64)
    : createProgressFetch(settings.contentUrl),
    noui: url.searchParams.has('noui'),
    editable: url.searchParams.get('edit') === 'true' && window.location.protocol !== 'https:' && !isMobile,
    noanim: true,
    nofx: url.searchParams.has('nofx'),
    hpr: url.searchParams.has('hpr') ? ['', '1', 'true', 'enable'].includes(url.searchParams.get('hpr')) : undefined,
    ministats: url.searchParams.has('ministats'),
    colorize: url.searchParams.has('colorize'),
    unified: url.searchParams.has('unified'),
    webgpu: url.searchParams.has('webgpu'),
    gpusort: url.searchParams.has('gpusort'),
    aa: url.searchParams.has('aa'),
    heatmap: url.searchParams.has('heatmap'),
}

const main = async (canvas, settingsJson, config) => {
    const { app, camera } = await createApp(canvas, config)
    // create events
    const events = new EventHandler()
    const state = observe(events, {
        loaded: false,
        readyToRender: false,
        retinaDisplay: platform.mobile
            ? localStorage.getItem('retinaDisplay') === 'true'
            : localStorage.getItem('retinaDisplay') !== 'false',
        progress: 0,
        inputMode: platform.mobile ? 'touch' : 'desktop',
        cameraMode: 'orbit',
        hasAnimation: false,
        animationDuration: 0,
        animationTime: 0,
        animationPaused: true,
        hasAR: false,
        hasVR: false,
        hasCollision: false,
        hasVoxelOverlay: false,
        voxelOverlayEnabled: false,
        isFullscreen: false,
        controlsHidden: false,
        gamingControls: localStorage.getItem('gamingControls') === 'true',
    })
    const confirmDialog = new ConfirmDialog()
    const modal = new ModalConfirm()
    const global = {
        app,
        settings: importSettings(settingsJson),
        config,
        state,
        events,
        camera,
        confirmDialog,
        modal,
    }
    initCanvas(global)
    // start the application
    app.start()
    // Initialize the load-time poster
    if (config.poster) {
        initPoster(events)
    }
    camera.addComponent('camera')
    // Initialize XR support
    if (!config.webgpu) {
        initXr(global)
    }
    // Initialize user interface
    initUI(global)
    // Load model
    const gsplatLoad = loadGsplat(app, config, events, (progress) => {
        state.progress = progress
    })
    // Load skybox
    const skyboxLoad =
        config.skyboxUrl &&
        loadSkybox(app, config.skyboxUrl).then((asset) => {
            app.scene.envAtlas = asset.resource
        })
    // Load voxel collision data
    const voxelLoad =
        config.voxelUrl &&
        VoxelCollider.load(config.voxelUrl).catch((err) => {
            console.warn('Failed to load voxel data:', err)
            return null
        })
    // Load and play sound
    if (global.settings.soundUrl) {
        const sound = new Audio(global.settings.soundUrl)
        sound.crossOrigin = 'anonymous'
        document.body.addEventListener(
            'click',
            () => {
                if (sound) {
                    sound.play()
                }
            },
            {
                capture: true,
                once: true,
            },
        )
    }
    return new Viewer(global, gsplatLoad, skyboxLoad, voxelLoad)
}
const { poster } = config
// Show the poster image
if (poster) {
    const element = document.getElementById('poster')
    element.style.setProperty('--poster-url', `url(${poster.src})`)
    element.style.display = 'block'
    element.style.filter = 'blur(40px)'

    // hide the canvas
    document.documentElement.style.setProperty('--canvas-opacity', '0')
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!checkWebGL()) {
        showNotSupportWebGL()
        return
    }
    const canvas = document.getElementById('application-canvas')
    const settingsJson = await settings
    const viewer = await main(canvas, settingsJson, config)
    // const bboxSetup = (() => {
    //     const app = viewer.global.app
    //     const layers = app.scene.layers
    //     const worldLayer = layers.getLayerByName('World')

    //     const layerBBox = new Layer({ name: 'BBox' })
    //     const worldIndex = layers.getOpaqueIndex(worldLayer)
    //     layers.insert(layerBBox, worldIndex)

    //     const cam = viewer.global.camera
    //     cam.camera.layers = [...cam.camera.layers, layerBBox.id]

    //     const lineMesh = new Mesh(app.graphicsDevice)

    //     const createLineMat = (opacity) => {
    //         const mat = new StandardMaterial()
    //         mat.emissive = new Color(0, 1, 0.6)
    //         mat.diffuse = new Color(0, 0, 0)
    //         mat.opacity = opacity
    //         mat.blendType = BLEND_NORMAL
    //         mat.depthTest = true
    //         mat.depthWrite = true
    //         mat.useLighting = false
    //         mat.cull = CULLFACE_NONE
    //         mat.update()
    //         return mat
    //     }

    //     const matBBox = createLineMat(1.0)
    //     const bboxEntity = new Entity('bbox')
    //     app.root.addChild(bboxEntity)

    //     const mi = new MeshInstance(lineMesh, matBBox)
    //     mi.cull = false

    //     bboxEntity.addComponent('render', {
    //         layers: [layerBBox.id],
    //         meshInstances: [mi],
    //     })

    //     const updateMesh = (gsplatEntity) => {
    //         const aabb = gsplatEntity.gsplat.customAabb
    //         if (!aabb) return

    //         const c = aabb.center
    //         const he = aabb.halfExtents
    //         const wd = gsplatEntity.getWorldTransform().data

    //         const transformPoint = (p) => [
    //             wd[0] * p[0] + wd[4] * p[1] + wd[8] * p[2] + wd[12],
    //             wd[1] * p[0] + wd[5] * p[1] + wd[9] * p[2] + wd[13],
    //             wd[2] * p[0] + wd[6] * p[1] + wd[10] * p[2] + wd[14],
    //         ]

    //         const corners = [
    //             [-he.x, -he.y, -he.z],
    //             [he.x, -he.y, -he.z],
    //             [-he.x, he.y, -he.z],
    //             [he.x, he.y, -he.z],
    //             [-he.x, -he.y, he.z],
    //             [he.x, -he.y, he.z],
    //             [-he.x, he.y, he.z],
    //             [he.x, he.y, he.z],
    //         ].map((p) => transformPoint([c.x + p[0], c.y + p[1], c.z + p[2]]))

    //         const edges = [
    //             [0, 1],
    //             [1, 3],
    //             [3, 2],
    //             [2, 0],
    //             [4, 5],
    //             [5, 7],
    //             [7, 6],
    //             [6, 4],
    //             [0, 4],
    //             [1, 5],
    //             [2, 6],
    //             [3, 7],
    //         ]

    //         const pos = []
    //         for (const [i, j] of edges) {
    //             pos.push(...corners[i], ...corners[j])
    //         }

    //         lineMesh.setPositions(pos)
    //         lineMesh.update(PRIMITIVE_LINES, false)
    //     }

    //     app.on('update', () => {
    //         const gsplatEntity = app.root.findByName('gsplat')
    //         if (!gsplatEntity || !gsplatEntity.gsplat) return
    //         updateMesh(gsplatEntity)
    //         app.renderNextFrame = true
    //     })
    // })()
})
