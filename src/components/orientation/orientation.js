function makeOrientationGroup(global, editGroup) {
    const { events, settings } = global
    const group = makeSectionGroup('transform')
    editGroup.register('orientation', { cancel: () => onCancelOrientation() })

    let isEditing = false
    let currentMethod = 'ground'

    const container = document.createElement('div')
    container.classList.add('orientation-btn-wrap')

    const { row: readonlyRotationRow, setValues: setReadonlyValues } = makeVec3Inputs({
        title: 'Rotation',
        disabled: true,
        onChange: () => {},
    })

    if (settings.orientation.pose) {
        const { rotation: r } = settings.orientation.pose
        setReadonlyValues(new Quat(r.x, r.y, r.z, r.w).getEulerAngles())
    } else if (modelEntity) {
        const r = global.cameraManager.controllers.ortery.initialModelRotation
        setReadonlyValues(new Quat(r.x, r.y, r.z, r.w).getEulerAngles())
    }

    const { panel: manualPanel, clean: manualClean } = makeManualPanel(events, global)
    const { panel: groundPanel, stopPicking, getPoints, MAX_POINTS } = makeGroundPanel(events, global)

    const methodWrap = document.createElement('div')
    methodWrap.style.cssText = 'display:none; flex-direction:column; gap:12px;'

    const methodRow = makeRow({ title: 'Method' })
    const methodBtns = makeSegmentRow({
        options: [
            { label: 'Ground plane', value: 'ground' },
            { label: 'Manual', value: 'manual' },
        ],
        defaultValue: 'ground',
        className: 'orientation-method-btns',
        onChange: (val) => switchMethod(val),
    })
    methodRow.el.appendChild(methodBtns)

    const switchMethod = (method) => {
        currentMethod = method
        manualPanel.style.display = method === 'manual' ? 'flex' : 'none'
        groundPanel.style.display = method === 'ground' ? 'flex' : 'none'
        if (method === 'manual') {
            stopPicking()
        } else {
        }
        events.fire('orientation:switch-method', currentMethod)
    }
    methodWrap.appendChild(methodRow.el)
    methodWrap.appendChild(manualPanel)
    methodWrap.appendChild(groundPanel)

    const orientBtnRow = document.createElement('div')
    orientBtnRow.classList.add('btn-row')

    const onCancelOrientation = () => {
        if (!isEditing) return
        isEditing = false
        stopPicking()
        methodWrap.style.display = 'none'
        currentMethod = 'ground'
        methodBtns.setValue('ground')
        if (settings.orientation.pose) {
            const { rotation: r } = settings.orientation.pose
            setReadonlyValues(new Quat(r.x, r.y, r.z, r.w).getEulerAngles())
        } else {
            setReadonlyValues(modelEntity.getLocalEulerAngles(new Vec3()))
        }
        renderOrientBtns()
        events.fire('orientation:cancel')
    }

    const renderOrientBtns = () => {
        orientBtnRow.innerHTML = ''
        if (isEditing) {
            readonlyRotationRow.style.display = 'none'
            methodWrap.style.display = 'flex'

            const btnCancel = makeButton({ title: 'Cancel', className: 'cancel-btn', onClick: onCancelOrientation })
            const btnSave = makeButton({
                className: 'confirm-btn',
                title: 'Apply',
                onClick: () => {
                    if (currentMethod === 'ground') {
                        const pts = getPoints()
                        if (pts.length < MAX_POINTS) {
                            showToast('Not enough points selected!', { duration: 1000, type: 'warning' })
                            return
                        }
                        stopPicking()
                        events.fire('orientation:groundplane', pts)
                    } else {
                        events.fire('orientation:manual-apply')
                    }
                    isEditing = false
                    currentMethod = 'ground'
                    methodBtns.setValue('ground')
                    methodWrap.style.display = 'none'
                    renderOrientBtns()
                },
            })

            orientBtnRow.appendChild(btnCancel)
            orientBtnRow.appendChild(btnSave)
        } else {
            readonlyRotationRow.style.display = 'flex'
            methodWrap.style.display = 'none'

            const btnEdit = makeButton({
                className: 'edit-btn',
                title: 'Edit',
                onClick: () => {
                    editGroup.startEdit('orientation')
                    isEditing = true
                    switchMethod(currentMethod)
                    events.fire('orientation:edit', currentMethod)
                    renderOrientBtns()
                },
            })
            const btnDelete = makeButton({
                title: 'Reset',
                icon: ICONS.reset,
                className: 'reset-btn',
                onClick: async () => {
                    const ok = await global.confirmDialog.ask({
                        title: 'Reset Transform',
                        message: 'This will reset your current transform settings. Do you want to reset?',
                        variant: 'delete',
                        position: 'top',
                        confirmText: 'Reset',
                    })
                    if (ok) {
                        events.fire('orientation:reset')
                        renderOrientBtns()
                    }
                },
            })
            orientBtnRow.appendChild(btnEdit)
            if (settings.orientation.pose) orientBtnRow.appendChild(btnDelete)
        }
    }

    container.appendChild(readonlyRotationRow)
    container.appendChild(methodWrap)
    container.appendChild(orientBtnRow)
    group.appendChild(container)

    renderOrientBtns()
    const handles = [
        events.on('orientation:aligned-model', ({ x, y, z }) => setReadonlyValues({ x, y, z })),
        events.on('next-step', () => onCancelOrientation()),
    ]
    group._cleanup = () => {
        handles.forEach((h) => events.offByHandle(h))
        manualClean()
    }
    return group
}
