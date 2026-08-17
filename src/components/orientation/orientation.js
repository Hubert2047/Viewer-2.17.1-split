function makeOrientationGroup(global, editGroup) {
    const { events, settings } = global
    const container = makeSectionWrap()
    editGroup.register('orientation', { cancel: () => onCancelOrientation() })

    let isEditing = false

    // ── Description ──────────────────────────────────────
    const descGroup = makeSectionGroup('Set Ground')

    const hint = document.createElement('p')
    hint.textContent =
        'If the model does not currently stand upright on the ground, use this step to adjust its position and rotation so it rests level. If it already looks correctly grounded, you can skip this step — no adjustment is needed.'
    hint.style.cssText = 'font-size: 0.8125rem; color: #8c9fb4; line-height: 1.5; margin: 0;'
    descGroup.appendChild(hint)

    // ── Orientation control ───────────────────────────────
    const orientGroup = makeSectionGroup('')

    const noGroundRow = document.createElement('div')
    noGroundRow.classList.add('no-configured-row')
    const noGroundText = document.createElement('span')
    noGroundText.textContent = 'No ground configured'
    const createBtn = makeButton({
        title: 'Create',
        className: 'add-btn',
        onClick: () => {
            editGroup.startEdit('orientation')
            isEditing = true
            events.fire('orientation:edit', 'manual')
            renderOrientBtns()
        },
    })
    noGroundRow.appendChild(noGroundText)
    noGroundRow.appendChild(createBtn)

    const hasGroundWrap = document.createElement('div')
    hasGroundWrap.classList.add('pivot-row')

    const { panel: manualPanel, clean: manualClean } = makeManualPanel(events, global)

    const methodWrap = document.createElement('div')
    methodWrap.style.cssText = 'display:none; flex-direction:column; gap:12px;'
    methodWrap.appendChild(manualPanel)

    const orientBtnRow = document.createElement('div')
    orientBtnRow.classList.add('btn-row')

    const setGroundConfigured = (has) => {
        noGroundRow.style.display = has ? 'none' : 'flex'
        hasGroundWrap.style.display = has ? 'flex' : 'none'
    }

    const onCancelOrientation = () => {
        if (!isEditing) return
        isEditing = false
        methodWrap.style.display = 'none'
        descGroup.style.display = 'flex'
        setGroundConfigured(!!settings.orientation.pose)
        renderOrientBtns()
        events.fire('orientation:cancel')
    }

    const renderOrientBtns = () => {
        orientBtnRow.innerHTML = ''
        if (isEditing) {
            descGroup.style.display = 'none'
            setGroundConfigured(true)
            methodWrap.style.display = 'flex'

            const btnCancel = makeButton({ title: 'Cancel', className: 'cancel-btn', onClick: onCancelOrientation })
            const btnSave = makeButton({
                className: 'confirm-btn',
                title: 'Apply',
                onClick: () => {
                    events.fire('orientation:manual-apply')
                    isEditing = false
                    methodWrap.style.display = 'none'
                    descGroup.style.display = 'flex'
                    renderOrientBtns()
                },
            })

            orientBtnRow.appendChild(btnCancel)
            orientBtnRow.appendChild(btnSave)
        } else {
            methodWrap.style.display = 'none'
            setGroundConfigured(!!settings.orientation.pose)

            const btnEdit = makeButton({
                className: 'edit-btn',
                title: 'Edit',
                onClick: () => {
                    editGroup.startEdit('orientation')
                    isEditing = true
                    events.fire('orientation:edit', 'manual')
                    renderOrientBtns()
                },
            })
            const btnDelete = makeButton({
                title: 'Delete',
                icon: ICONS.trash,
                className: 'delete-btn',
                onClick: async () => {
                    const ok = await global.confirmDialog.ask({
                        title: 'Delete Ground Point',
                        message: 'This will reset your current transform settings. Do you want to continue?',
                        variant: 'delete',
                        position: 'top',
                        confirmText: 'Delete',
                    })
                    if (ok) {
                        events.fire('orientation:reset')
                        setGroundConfigured(false)
                        renderOrientBtns()
                    }
                },
            })
            orientBtnRow.appendChild(btnEdit)
            orientBtnRow.appendChild(btnDelete)
        }
    }

    hasGroundWrap.appendChild(orientBtnRow)

    orientGroup.appendChild(noGroundRow)
    orientGroup.appendChild(methodWrap)
    orientGroup.appendChild(hasGroundWrap)

    container.appendChild(descGroup)
    container.appendChild(orientGroup)

    renderOrientBtns()
    setGroundConfigured(!!settings.orientation.pose)
    const handles = [events.on('next-step', () => onCancelOrientation())]
    container.cleanup = () => {
        handles.forEach((h) => events.offByHandle(h))
        manualClean()
    }
    return container
}
