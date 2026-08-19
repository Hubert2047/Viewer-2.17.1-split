function makePivotGroup(global, editGroup) {
    const { events, settings } = global
    const container = makeSectionWrap()
    editGroup.register('pivot', {
        cancel: () => {
            onCancel()
        },
    })

    let editPivotPos = settings.pivot.position
    let currrentPivotPos = null
    let isEditing = false
    let isNewPivot = false

    const pivotDot = (global.pivotDot ??= new PivotDot(global.app, global.camera, modelEntity))

    const refreshPivotDot = () => {
        pivotDot.setPivot(settings.pivot.position ?? global.currentLocalBboxCenter)
    }

    // ── Description ──────────────────────────────────────
    const descGroup = makeSectionGroup('Set Pivot Point')

    const hint = document.createElement('p')
    hint.textContent =
        'This sets the center point the model rotates around. If the current rotation already looks correct, you can skip this step — adding a pivot point is optional.'
    hint.style.cssText = 'font-size: 0.8125rem; color: #8c9fb4; line-height: 1.5; margin: 0;'
    descGroup.appendChild(hint)

    const pivotGroup = makeSectionGroup('')

    const noPivotRow = document.createElement('div')
    noPivotRow.classList.add('no-configured-row')
    const noPivotText = document.createElement('span')
    noPivotText.textContent = 'No pivot point configured'
    const addBtn = makeButton({
        title: 'Create',
        className: 'add-btn',
        onClick: () => {
            const weight = getModelWeight(modelEntity, settings.removedSplats)
            const pos = { x: weight.x, y: weight.y, z: weight.z }

            isNewPivot = true
            editPivotPos = pos
            setPivotConfigured(true)
            events.fire('pivot:positionsynced', pos)

            onEdit(pos)
            events.fire('pivot:edit')
        },
    })
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
        renderBtns()
        pivotDot.disable()
        events.fire('pivot:enable-edit', { position: { x, y, z }, enable: true })
    }
    let isDestroyed = false
    const onCancel = () => {
        if (!isEditing) return

        if (isNewPivot) {
            editPivotPos = null
            currrentPivotPos = null
            isNewPivot = false
            setPivotConfigured(false)
            events.fire('pivot:delete')
        } else {
            editPivotPos = settings.pivot.position
            if (editPivotPos) {
                events.fire('pivot:positionsynced', editPivotPos)
            }
            events.fire('pivot:cancel')
        }

        events.fire('pivot:enable-edit', { enable: false })
        isEditing = false
        if (isDestroyed) return
        renderBtns()
        refreshPivotDot()
        pivotDot.enable()
    }

    const onDelete = async () => {
        const ok = await global.confirmDialog.ask({
            position: 'top',
            variant: 'delete',
            title: 'Delete pivot point',
            message: 'Pivot point data will be permanently deleted.',
            confirmText: 'Delete',
        })
        if (!ok || isDestroyed) return
        editPivotPos = null
        currrentPivotPos = null
        setPivotConfigured(false)
        global.dataDirty = true
        events.fire('pivot:delete')
        renderBtns()
        refreshPivotDot()
        pivotDot.enable()
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
                    global.dataDirty = true
                    isNewPivot = false
                    isEditing = false
                    events.fire('pivot:enable-edit', { enable: false })
                    renderBtns()
                    refreshPivotDot()
                    pivotDot.enable()
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
                    isNewPivot = false
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

    hasPivotWrap.appendChild(btnRow)

    const setPivotConfigured = (has) => {
        noPivotRow.style.display = has ? 'none' : 'flex'
        hasPivotWrap.style.display = has ? 'flex' : 'none'
    }

    pivotGroup.appendChild(noPivotRow)
    pivotGroup.appendChild(hasPivotWrap)

    container.appendChild(descGroup)
    container.appendChild(pivotGroup)

    renderBtns()
    setPivotConfigured(!!settings.pivot.position)

    refreshPivotDot()
    pivotDot.enable()

    const handles = [
        events.on('inputEvent:r', onCancel),
        events.on('pivot:positionsynced', ({ x, y, z }) => {
            currrentPivotPos = { x, y, z }
        }),
    ]
    container.cleanup = () => {
        isDestroyed = true
        handles.forEach((h) => events.offByHandle(h))
        pivotDot.disable()
    }
    return container
}
