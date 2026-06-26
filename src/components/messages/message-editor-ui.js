class MessageEditorUI {
    isCreatinMessage = false
    constructor(body, { global, dom }) {
        this.body = body
        this.dom = dom
        this.confirmDialog = global.confirmDialog
        this.camera = global.camera.camera
        this.events = global.events
        this.state = global.state
        this.settings = global.settings
        this.activeMessageData = null
        this.listEl = null
        this.countEl = null
        this.listenEvents()
    }
    listenEvents() {
        this.events.on('message:add-cancelled', () => {
            document.body.style.cursor = 'default'
            this.events.fire('message:editing', false)
            this.isCreatinMessage = false
            this.resetAddBtn()
        })
        this.events.on('message:update-ui-data', (data) => {
            if (!this.activeMessageData) return
            if (this.activeMessageData.dot.size !== data.dot.size) {
                if (!this.dotSizeInput) this.dotSizeInput = this.body.querySelector('input[name="dot-size"]')
                if (this.dotSizeInput && document.activeElement !== this.dotSizeInput) {
                    this.dotSizeInput.value = data.dot.size
                }
            }
            if (this.activeMessageData.text.fontSize !== data.text.fontSize) {
                if (!this.fontSizeInput) this.fontSizeInput = this.body.querySelector('input[name="font-size"]')
                if (this.fontSizeInput && document.activeElement !== this.fontSizeInput) {
                    this.fontSizeInput.value = data.text.fontSize
                }
            }
            this.activeMessageData = data
        })
    }
    mount() {
        this.renderHeader()
        this.listEl = document.createElement('div')
        this.listEl.classList.add('message-list')
        this.body.appendChild(this.listEl)
        this.events.fire('message:editor', this)
    }


    renderHeader() {
        const header = document.createElement('div')
        header.classList.add('message-section-header')

        const titleGroup = document.createElement('div')
        const title = document.createElement('div')
        title.classList.add('message-title')
        title.textContent = 'Product Messages'

        this.countEl = document.createElement('div')
        this.countEl.classList.add('message-count')
        titleGroup.appendChild(title)
        titleGroup.appendChild(this.countEl)

        const addBtn = document.createElement('button')
        addBtn.classList.add('add-btn')
        addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg> Add`
        addBtn.addEventListener('click', (e) => this.onAdd(e))
        this.addBtn = addBtn
        header.appendChild(titleGroup)
        header.appendChild(addBtn)
        this.body.appendChild(header)
    }
    onAdd(e) {
        if (this.isCreatinMessage) {
            this.events.fire('message:add-cancelled')
            this.resetAddBtn()
            return
        }
        document.body.style.cursor = 'crosshair'
        this.isCreatinMessage = true
        this.events.fire('message:editing', true)
        this.events.fire('message:selected', null)

        this.setAddBtnCancel(true)

        this.events.on('pointerup', (e) => {
            if (!this.isCreatinMessage) return
            const rect = this.dom.ui.getBoundingClientRect()
            const mouseX = e.clientX - rect.left
            const mouseY = e.clientY - rect.top
            const position = pickModelLocalPoint({
                x: mouseX,
                y: mouseY,
                camera: this.camera,
                removedSplats: this.settings.removedSplats,
            })
            this.events.fire('message:add', { position })
            document.body.style.cursor = 'default'
            this.isCreatinMessage = false
            this.setAddBtnCancel(false)
        })
    }
    setAddBtnCancel(isCancel) {
        if (!this.addBtn) return
        if (isCancel) {
            this.addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg> Cancel`
            this.addBtn.classList.add('cancel-mode')
        } else {
            this.addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg> Add`
            this.addBtn.classList.remove('cancel-mode')
        }
    }
    resetAddBtn() {
        this.setAddBtnCancel(false)
    }
    async onDelete(id) {
        const ok = await this.confirmDialog.ask({
            title: 'Delete Messages',
            message: 'Are you sure? This cannot be undone.',
            variant: 'delete',
        })
        if (ok) {
            this.events.fire('message:delete', id)
        }
    }
    onCancel() {
        this.events.fire('message:editor-cancelled')
    }
    onApply() {
        this.events.fire('message:apply', this.activeMessageData)
    }
    render(messageData, activeMessageData) {
        this.activeMessageData = activeMessageData ? JSON.parse(JSON.stringify(activeMessageData)) : null
        this.listEl.innerHTML = ''
        this.countEl.textContent = `${messageData.length} message${messageData.length !== 1 ? 's' : ''} configured`

        messageData.forEach((h) => {
            const isExpanded = this.activeMessageData?.id === h.id
            const item = document.createElement('div')
            item.classList.add('message-item')
            item.dataset.id = h.id
            if (isExpanded) item.classList.add('expanded')
            const { row, headerTitle } = this.renderItemHeader(h, isExpanded)
            item.appendChild(row)
            if (isExpanded) item.appendChild(this.renderEditPanel(headerTitle))

            item.addEventListener('dragover', (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                document.querySelectorAll('.message-item').forEach((el) => el.classList.remove('drag-over'))
                item.classList.add('drag-over')
            })

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over')
            })

            item.addEventListener('drop', (e) => {
                e.preventDefault()
                item.classList.remove('drag-over')
                const fromId = e.dataTransfer.getData('text/plain')
                const toId = h.id
                if (fromId === toId) return
                this.events.fire('message:reorder', { fromId, toId })
            })

            this.listEl.appendChild(item)
        })
    }
    renderItemHeader(h, isExpanded) {
        const row = document.createElement('div')
        row.classList.add('message-header')
        const handle = document.createElement('div')
        handle.classList.add('message-drag-handle')
        handle.innerHTML = ICONS.messageDragHandle

        row.dataset.dragId = h.id

        row.setAttribute('draggable', true)

        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', h.id)
            row.classList.add('dragging')
        })

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging')
            document.querySelectorAll('.message-item').forEach((el) => el.classList.remove('drag-over'))
        })

        const name = document.createElement('div')
        name.classList.add('message-header-name')
        name.textContent = h.button?.title || 'message'

        const actions = document.createElement('div')
        actions.classList.add('message-header-actions')

        const editBtn = makeButton({
            icon: ICONS.messageEditBtn,
            title: 'Edit',
            className: 'message-action-btn',
            onClick: () => this.events.fire('message:selected', isExpanded ? null : h),
        })
        if (isExpanded) editBtn.classList.add('active')

        const delBtn = makeButton({
            icon: ICONS.messageDelete,
            title: 'Delete',
            className: 'message-action-btn message-delete-btn',
            onClick: () => this.onDelete(h.id),
        })

        actions.appendChild(editBtn)
        actions.appendChild(delBtn)
        row.appendChild(name)
        row.appendChild(actions)
        return { row, headerTitle: name }
    }
    applyDraft = (refreshUIPanel = false) => {
        this.events.fire('message:editor-changed', {
            data: JSON.parse(JSON.stringify(this.activeMessageData)),
            refreshUIPanel,
        })
    }
    renderEditPanel(headerTitle) {
        const panel = makeSectionWrap({ className: 'message-edit-panel' })

        const buttonGroup = makeSectionGroup('Button')
        const btnTitleField = this.makeField('Title')
        btnTitleField.appendChild(
            makeInput({
                type: 'text',
                value: this.activeMessageData.button.title,
                placeholder: 'Title...',
                name: 'button-title',
                onChange: (v) => {
                    this.activeMessageData.button.title = v
                    headerTitle.textContent = v
                    this.applyDraft()
                },
            }),
        )
        buttonGroup.appendChild(btnTitleField)
        panel.appendChild(buttonGroup)

        const textGroup = makeSectionGroup('Text')
        const labelField = this.makeField('Label')

        const formatRow = document.createElement('div')
        formatRow.classList.add('message-label-row')
        formatRow.appendChild(this.makeFormatBtn('<b>B</b>', 'bold', this.applyDraft))
        formatRow.appendChild(this.makeFormatBtn('<i>I</i>', 'italic', this.applyDraft))

        const alignRow = makeSegmentRow({
            options: [
                { icon: ICONS.alignLeft, value: 'left' },
                { icon: ICONS.alignCenter, value: 'center' },
                { icon: ICONS.alignRight, value: 'right' },
            ],
            className: 'message-align-btns',
            defaultValue: this.activeMessageData.text.align || 'center',
            onChange: (val) => {
                this.activeMessageData.text.align = val
                this.applyDraft()
            },
        })
        formatRow.appendChild(alignRow)

        const labelRow = document.createElement('div')
        labelRow.classList.add('message-label-row')
        labelRow.appendChild(
            makeTextarea(this.activeMessageData.text.content, {
                placeholder: 'Enter label...',
                classname: 'message-text',
                name: this.activeMessageData.text.content,
                onChange: (v) => {
                    this.activeMessageData.text.content = v
                    this.applyDraft()
                },
            }),
        )

        labelField.appendChild(formatRow)
        labelField.appendChild(labelRow)
        textGroup.appendChild(labelField)

        const colorFlex = document.createElement('div')
        colorFlex.classList.add('message-row')
        const colorField = this.makeField('Text Color')
        const { row: textColor } = makeColorPickerDropdown({
            color: this.activeMessageData.text.color,
            debounceMs: 0,
            onChange: ({ hex }) => {
                this.activeMessageData.text.color = hex
                this.applyDraft()
            },
        })
        colorField.appendChild(textColor)
        const { row: backgroundColor } = makeColorPickerDropdown({
            color: this.activeMessageData.text.background,
            alpha: this.activeMessageData.text.backgroundAlpha,
            hasAlpha: true,
            debounceMs: 0,
            onChange: ({ hex, alpha }) => {
                this.activeMessageData.text.background = hex
                this.activeMessageData.text.backgroundAlpha = alpha
                this.applyDraft()
            },
        })
        const bgField = this.makeField('Background Color')
        bgField.appendChild(backgroundColor)

        const fontSizeField = this.makeField('Font size')
        fontSizeField.appendChild(
            makeInput({
                type: 'number',
                value: this.activeMessageData.text.fontSize,
                min: 8,
                max: 72,
                name: 'font-size',
                className: 'message-font-size',
                onChange: (v) => {
                    this.activeMessageData.text.fontSize = parseInt(v)
                    this.applyDraft()
                },
            }),
        )
        // const fontFamilyField = this.makeField('Font')
        // fontFamilyField.appendChild(
        //     makeSelect(
        //         ['Lato', 'Roboto', 'Open Sans', 'Montserrat'],
        //         this.activeMessageData.text.font,
        //         (v) => {
        //             this.activeMessageData.text.font = v
        //             this.applyDraft()
        //         },
        //         { name: 'font-family' },
        //     ),
        // )
        // fontGrid.appendChild(fontSizeField)
        // fontGrid.appendChild(fontFamilyField)
        colorFlex.appendChild(colorField)
        colorFlex.appendChild(bgField)
        colorFlex.appendChild(fontSizeField)
        textGroup.appendChild(colorFlex)
        panel.appendChild(textGroup)

        const messageGroup = makeSectionGroup('Hotspot')
        const styleField = this.makeField('Style')
        const styleRow = makeSegmentRow({
            options: [
                { label: 'Circle', value: 'circle' },
                { label: 'Dot', value: 'dot' },
            ],
            defaultValue: this.activeMessageData.dot.style,
            onChange: (val) => {
                this.activeMessageData.dot.style = val
                strokeField.style.display = val === 'dot' ? 'none' : 'block'
                this.applyDraft()
            },
        })
        styleField.appendChild(styleRow)
        messageGroup.appendChild(styleField)

        const dotGrid = this.makeGrid(3)
        const sizeField = this.makeField('Size (px)')
        sizeField.appendChild(
            makeInput({
                type: 'number',
                value: this.activeMessageData.dot.size,
                min: 1,
                max: 999,
                name: 'dot-size',
                onChange: (v) => {
                    this.activeMessageData.dot.size = parseInt(v)
                    this.applyDraft()
                },
            }),
        )
        const strokeField = this.makeField('Stroke width')
        strokeField.appendChild(
            makeInput({
                type: 'number',
                value: this.activeMessageData.dot.stroke,
                min: 0,
                max: 99,
                step: 0.5,
                name: 'stroke-width',
                onChange: (v) => {
                    this.activeMessageData.dot.stroke = parseFloat(v)
                    this.applyDraft()
                },
            }),
        )
        if (this.activeMessageData.dot.style === 'dot') {
            strokeField.style.display = 'none'
        }
        const strokeColorField = this.makeField('Stroke color')
        const { row: strokeColor } = makeColorPickerDropdown({
            color: this.activeMessageData.dot.strokeColor,
            debounceMs: 0,
            onChange: ({ hex }) => {
                this.activeMessageData.dot.strokeColor = hex
                this.applyDraft()
            },
        })
        strokeColorField.appendChild(strokeColor)
        dotGrid.appendChild(sizeField)
        dotGrid.appendChild(strokeField)
        dotGrid.appendChild(strokeColorField)
        messageGroup.appendChild(dotGrid)
        panel.appendChild(messageGroup)

        const autoplayGrid = document.createElement('div')
        autoplayGrid.classList.add('message-autoplay')

        const autoPlayGroup = makeSectionGroup('Auto Play')
        const timeField = this.makeField('Elapsed Time (s)')
        timeField.appendChild(
            makeInput({
                type: 'number',
                value: this.activeMessageData.autoPlay.time,
                min: 0,
                step: 0.5,
                name: 'play-time',
                onChange: (v) => {
                    this.activeMessageData.autoPlay.time = parseFloat(v)
                    this.applyDraft()
                },
            }),
        )
        autoPlayGroup.appendChild(timeField)

        autoplayGrid.appendChild(autoPlayGroup)
        panel.appendChild(autoplayGrid)

        const initviewHint =
            'Please copy the audio file into the <b style="color:var(--primary)">audios/</b> folder and ensure it is included when sharing.'
        const audioGroup = makeSectionGroup('Audio', initviewHint)

        const hasAudio = !!(this.activeMessageData.audio?.fileName || this.activeMessageData.audio?.src)

        const audioFileFieldGroup = this.makeGrid(2)
        const audioFileField = this.makeField('Audio File')
        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = 'audio/*'
        fileInput.style.display = 'none'
        fileInput.name = 'audio-file'

        const fileLabel = document.createElement('label')
        fileLabel.classList.add('audio-file-label')

        const fileBtn = document.createElement('span')
        fileBtn.classList.add('audio-file-btn')
        fileBtn.textContent = 'Choose File'

        const fileNameSpan = document.createElement('span')
        fileNameSpan.classList.add('audio-file-name')
        fileNameSpan.textContent = this.activeMessageData.audio?.fileName || 'No file chosen'

        const audioSettings = document.createElement('div')
        audioSettings.classList.add('audio-settings')
        if (!hasAudio) audioSettings.style.display = 'none'

        const clearAudioBtn = makeButton({
            icon: ICONS.trash,
            title: 'Remove audio',
            className: 'delete-btn audio-clear-btn',
            onClick: () => {
                const audio = this.activeMessageData.audio
                // const store = this.settings.fileAudioStore
                if (audio?.src?.startsWith('blob:')) {
                    URL.revokeObjectURL(audio.src)
                }
                // if (audio?.fileId && store instanceof Map) {
                //     store.delete(audio.fileId)
                // }
                delete this.activeMessageData.audio
                fileInput.value = ''
                fileNameSpan.textContent = 'No file chosen'
                clearAudioBtn.style.display = 'none'
                audioSettings.style.display = 'none'

                this.applyDraft(true)
            },
        })
        if (!hasAudio) clearAudioBtn.style.display = 'none'

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0]
            if (!file) return

            if (this.activeMessageData.audio?.src?.startsWith('blob:')) {
                URL.revokeObjectURL(this.activeMessageData.audio.src)
            }

            if (!this.activeMessageData.audio || !this.activeMessageData.audio.fileName) {
                this.activeMessageData.audio = {
                    show: true,
                    src: null,
                    fileName: null,
                    bgColor: '#000000',
                    bgAlpha: 0.8,
                    iconColor: '#ffffff',
                    volume: 1,
                    loop: false,
                    // embed: false,
                    // persist: false,
                    autoPlay: false,
                }
            }

            this.activeMessageData.audio.fileName = file.name
            this.activeMessageData.audio.src = URL.createObjectURL(file)
            fileNameSpan.textContent = file.name
            clearAudioBtn.style.display = ''
            audioSettings.style.display = ''

            // if (!(this.settings.fileAudioStore instanceof Map)) {
            //     this.settings.fileAudioStore = new Map()
            // }
            // if (!(this.settings.fileAudioStore instanceof Map)) {
            //     this.settings.fileAudioStore = new Map()
            // }

            // const store = this.settings.fileAudioStore
            // const fileId = guid.create()

            // this.activeMessageData.audio.fileId = fileId
            // store.set(fileId, file)

            this.applyDraft(true)
        })

        fileLabel.appendChild(fileBtn)
        fileLabel.appendChild(fileNameSpan)
        fileLabel.appendChild(fileInput)
        audioFileField.appendChild(fileLabel)
        audioFileFieldGroup.appendChild(audioFileField)
        audioFileFieldGroup.appendChild(clearAudioBtn)
        audioGroup.appendChild(audioFileFieldGroup)

        const audioGrid = this.makeGrid(2)
        const iconColorField = this.makeField('Icon Color')
        const { row: audioIconColor } = makeColorPickerDropdown({
            color: this.activeMessageData.audio?.iconColor || '#ffffff',
            debounceMs: 0,
            onChange: ({ hex }) => {
                this.activeMessageData.audio.iconColor = hex
                this.applyDraft()
            },
        })
        iconColorField.appendChild(audioIconColor)

        const iconBgField = this.makeField('Background Color', 'background-color')
        const { row: iconBg } = makeColorPickerDropdown({
            color: this.activeMessageData.audio?.bgColor || '#000000',
            alpha: this.activeMessageData.audio?.bgAlpha ?? 0.35,
            hasAlpha: true,
            debounceMs: 0,
            onChange: ({ hex, alpha }) => {
                this.activeMessageData.audio.bgColor = hex
                this.activeMessageData.audio.bgAlpha = alpha
                this.applyDraft()
            },
        })
        iconBgField.appendChild(iconBg)

        const loopField = this.makeField('Loop')
        loopField.appendChild(
            makeToggle({
                initialValue: this.activeMessageData.audio?.loop,
                onChange: (value) => {
                    this.activeMessageData.audio.loop = value
                    this.applyDraft()
                },
            }),
        )

        const showField = this.makeField('Show')
        showField.appendChild(
            makeToggle({
                initialValue: this.activeMessageData.audio?.show,
                onChange: (value) => {
                    this.activeMessageData.audio.show = value
                    this.applyDraft()
                },
            }),
        )
        // const persistField = this.makeField('Persist')
        // persistField.appendChild(
        //     makeToggle(this.activeMessageData.audio?.persist, (value) => {
        //         this.activeMessageData.audio.persist = value
        //         return this.activeMessageData.audio.persist
        //     }),
        // )
        const autoPlayField = this.makeField('Auto Play')
        autoPlayField.appendChild(
            makeToggle({
                initialValue: this.activeMessageData.audio?.autoPlay,
                onChange: (value) => {
                    this.activeMessageData.audio.autoPlay = value
                    this.applyDraft()
                },
            }),
        )

        // const embedField = this.makeField('Embed', 'embed')
        // const embedLabel = embedField.querySelector('div:first-child')
        // if (embedLabel) {
        //     const infoIcon = document.createElement('span')
        //     infoIcon.classList.add('info-icon')
        //     infoIcon.innerHTML = ICONS.hintInfo
        //     infoIcon.setAttribute('tabindex', '0')

        //     infoIcon.addEventListener('mouseenter', () => {
        //         const rect = infoIcon.getBoundingClientRect()
        //         this.embedTooltip.style.display = 'block'
        //         const tooltipW = this.embedTooltip.offsetWidth
        //         const tooltipH = this.embedTooltip.offsetHeight
        //         const margin = 8
        //         let left = rect.left + rect.width / 2 - tooltipW / 2
        //         let top = rect.top - tooltipH - 6
        //         left = Math.max(margin, Math.min(left, window.innerWidth - tooltipW - margin))
        //         if (top < margin) {
        //             top = rect.bottom + 6
        //         }
        //         this.embedTooltip.style.left = `${left}px`
        //         this.embedTooltip.style.top = `${top}px`
        //     })

        //     infoIcon.addEventListener('mouseleave', () => {
        //         this.embedTooltip.style.display = 'none'
        //     })
        //     embedLabel.appendChild(infoIcon)
        // }
        // const embedToggle = makeToggle(this.activeMessageData.audio?.embed, (value) => {
        //     if (value) {
        //         const src = this.activeMessageData.audio.src
        //         const hasValidSrc = src?.startsWith('data:') || src?.startsWith('blob:')
        //         if (!hasValidSrc && this.activeMessageData.audio.fileName) {
        //             showToast('To embed, please re-select the audio file using the file picker.', {
        //                 duration: 5000,
        //                 type: 'warning',
        //             })
        //             embedToggle.setValue(false)
        //             return
        //         }
        //     }
        //     this.activeMessageData.audio.embed = value
        //     this.applyDraft()
        // })

        // embedField.appendChild(embedToggle)

        const audioToggleGrid = this.makeGrid(3)
        audioGrid.appendChild(iconColorField)
        audioGrid.appendChild(iconBgField)

        audioToggleGrid.appendChild(showField)
        audioToggleGrid.appendChild(autoPlayField)
        audioToggleGrid.appendChild(loopField)
        // audioToggleGrid.appendChild(persistField)
        // audioToggleGrid.appendChild(embedField)

        const volumeField = this.makeField('Volume', 'volume')
        const volumeWrap = document.createElement('div')
        volumeWrap.classList.add('volume-wrap')

        const volumeSlider = makeSlider({
            min: 0,
            max: 1,
            step: 0.1,
            className: 'volume-slider',
            value: this.activeMessageData.audio?.volume ?? 1,
            variant: 'progress',
            onChange: (v) => {
                this.activeMessageData.audio.volume = v
                volumeInput.value = v
                this.applyDraft()
            },
        })

        const volumeInput = makeInput({
            type: 'number',
            value: this.activeMessageData.audio?.volume ?? 1,
            min: 0,
            max: 1,
            step: 0.1,
            className: 'slider-number',
            name: 'volume',
            onChange: (v) => {
                const value = Math.min(1, Math.max(0, parseFloat(v) || 0))
                this.activeMessageData.audio.volume = value
                volumeSlider.setValue(value)
                this.applyDraft()
            },
        })

        volumeWrap.appendChild(volumeSlider)
        volumeWrap.appendChild(volumeInput)
        volumeField.appendChild(volumeWrap)

        audioSettings.appendChild(audioToggleGrid)
        audioSettings.appendChild(audioGrid)
        audioSettings.appendChild(volumeField)

        audioGroup.appendChild(audioSettings)
        panel.appendChild(audioGroup)

        const applyRow = document.createElement('div')
        applyRow.classList.add('apply-row')

        const cancelBtn = makeButton({
            title: 'Cancel',
            className: 'cancel-btn message-cancel-btn',
            onClick: () => {
                this.onCancel()
            },
        })

        const applyBtn = makeButton({
            title: 'Apply',
            className: 'message-apply-btn confirm-btn',
            onClick: () => {
                this.onApply()
            },
        })

        applyRow.appendChild(cancelBtn)
        applyRow.appendChild(applyBtn)
        panel.appendChild(applyRow)
        return panel
    }

    makeField(label, classname = '') {
        const wrap = document.createElement('div')
        wrap.classList.add('message-field')
        if (classname) wrap.classList.add(classname)
        const lbl = document.createElement('div')
        lbl.classList.add('message-label')
        lbl.textContent = label
        wrap.appendChild(lbl)
        return wrap
    }

    makeGrid(variant) {
        const grid = document.createElement('div')
        grid.classList.add(variant === 3 ? 'message-grid-3' : 'message-grid-2')
        return grid
    }


    makeFormatBtn(char, key, onChange) {
        const btn = document.createElement('button')
        btn.classList.add('fmt-btn')
        if (this.activeMessageData.text[key]) btn.classList.add('active')
        btn.innerHTML = char
        btn.addEventListener('click', () => {
            this.activeMessageData.text[key] = !this.activeMessageData.text[key]
            btn.classList.toggle('active', this.activeMessageData.text[key])
            onChange()
        })
        return btn
    }
}
