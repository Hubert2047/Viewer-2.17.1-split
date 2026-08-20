class MessageEditorUI {
    isCreatingMessage = false
    clickDragThreshold = 6
    constructor(body, { global, dom }) {
        this.body = body
        this.dom = dom
        this.global = global
        this.confirmDialog = global.confirmDialog
        this.camera = global.camera.camera
        this.events = global.events
        this.state = global.state
        this.settings = global.settings
        this.activeMessageData = null
        this.listEl = null
        this.countEl = null
        this.handles = []
        this.listenEvents()
    }
    listenEvents() {
        this.handles = [
            this.events.on('inputEvent:esc', () => {
                this.events.fire('message:add-cancelled')
            }),
            this.events.on('message:add-cancelled', () => {
                document.body.style.cursor = 'default'
                this.events.fire('message:editing', false)
                this.isCreatingMessage = false
                this._addPointerDown = null
                this.updateAddIcon(false)
            }),
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
            }),
        ]
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

        this.addBtn = makeButton({
            icon: `${ICONS.add} Add`,
            label: 'Add',
            className: 'add-btn',
            onClick: (e) => {
                this.onAdd(e)
            },
        })
        header.appendChild(titleGroup)
        header.appendChild(this.addBtn)
        this.body.appendChild(header)
    }
    onAdd(e) {
        if (this.isCreatingMessage) {
            this.events.fire('message:add-cancelled')
            this.updateAddIcon(false)
            return
        }
        document.body.style.cursor = 'crosshair'
        this.isCreatingMessage = true
        if (this.global.measureTool?.active) this.events.fire('inputEvent:m')
        if (this.global.dimensionsBox?.show) {
            this.events.fire('inputEvent:hide-dimensions')
            this.events.fire('re-render:control-wrap')
        }
        this.events.fire('message:editing', true)
        this.events.fire('message:selected', null)

        this.updateAddIcon(true)
        this._addPointerDown = null

        this.handles.push(
            this.events.on('inputEvent', (eventName, event) => {
                if (!this.isCreatingMessage) return
                if (eventName === 'pointerdown') {
                    this._addPointerDown = { x: event.clientX, y: event.clientY, button: event.button }
                }
            }),
            this.events.on('pointerup', (e) => {
                if (!this.isCreatingMessage) return
                const down = this._addPointerDown
                this._addPointerDown = null

                if (!down || down.button !== 0) return

                const dx = e.clientX - down.x
                const dy = e.clientY - down.y
                const movedDistance = Math.sqrt(dx * dx + dy * dy)

                if (movedDistance > this.clickDragThreshold) return

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
                this.isCreatingMessage = false
                this.updateAddIcon(false)
            }),
        )
    }
    updateAddIcon(isCancel) {
        if (!this.addBtn) return
        this.addBtn.updateIcon(isCancel ? `${ICONS.cancel} Cancel` : `${ICONS.add} Add`)
        if (isCancel) {
            this.addBtn.classList.add('cancel-mode')
        } else {
            this.addBtn.classList.remove('cancel-mode')
        }
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
            icon: ICONS.edit,
            title: 'Edit',
            className: 'message-action-btn',
            onClick: () => this.events.fire('message:selected', isExpanded ? null : h),
        })
        if (isExpanded) editBtn.classList.add('active')

        const delBtn = makeButton({
            icon: ICONS.trash,
            title: 'Delete',
            className: 'message-action-btn message-delete-btn',
            onClick: () => this.onDelete(h.id),
        })

        actions.appendChild(editBtn)
        actions.appendChild(delBtn)
        row.appendChild(handle)
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

        const buttonGroup = makeSectionGroup('Button Title')
        const btnTitleField = this.makeField('Title')
        const buttonTitleInput = makeInput({
            type: 'text',
            value: this.activeMessageData.button.title,
            placeholder: 'Title...',
            name: 'button-title',
            onChange: (v) => {
                this.activeMessageData.button.title = v
                headerTitle.textContent = v
                this.applyDraft()
            },
        })

        buttonGroup.appendChild(buttonTitleInput)
        panel.appendChild(buttonGroup)

        const textGroup = makeSectionGroup('Label Text')
        const labelField = this.makeField()

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

        const colorField = this.makeField('Text color', '', true)
        const { row: textColor } = makeColorPickerDropdown({
            color: this.activeMessageData.text.color,
            debounceMs: 0,
            onChange: ({ hex }) => {
                this.activeMessageData.text.color = hex
                this.applyDraft()
            },
        })
        textColor.style.flex = '1 1 auto'
        textColor.style.minWidth = '0'
        colorField.appendChild(textColor)

        const bgField = this.makeField('Background color', '', true)
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
        backgroundColor.style.flex = '1 1 auto'
        backgroundColor.style.minWidth = '0'
        bgField.appendChild(backgroundColor)

        const fontSizeField = this.makeField('Font size', '', true)
        const fontSizeInputEl = makeInput({
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
        })
        fontSizeInputEl.style.flex = '1 1 auto'
        fontSizeInputEl.style.minWidth = '0'
        fontSizeField.appendChild(fontSizeInputEl)

        textGroup.appendChild(colorField)
        textGroup.appendChild(bgField)
        textGroup.appendChild(fontSizeField)
        panel.appendChild(textGroup)

        const messageGroup = makeSectionGroup('Hotspot')
        const styleField = this.makeField('Style', '', true)
        const styleSelect = makeSelect({
            options: [
                { label: 'Circle', value: 'circle' },
                { label: 'Dot', value: 'dot' },
                { label: 'Arrow', value: 'arrow' },
            ],
            value: this.activeMessageData.dot.style,
            name: 'hotspot-style',
            onChange: (val) => {
                this.activeMessageData.dot.style = val
                const defaultSize = { circle: 30, dot: 15, arrow: 15 }[val]
                this.activeMessageData.dot.size = defaultSize
                dotSizeInputEl.value = defaultSize
                strokeField.style.display = val === 'circle' ? 'flex' : 'none'
                this.applyDraft()
            },
        })
        styleSelect.el.style.flex = '1 1 auto'
        styleSelect.el.style.minWidth = '0'
        styleField.appendChild(styleSelect.el)
        messageGroup.appendChild(styleField)

        const sizeField = this.makeField('Size', '', true)
        const dotSizeInputEl = makeInput({
            type: 'number',
            value: this.activeMessageData.dot.size,
            min: 1,
            max: 999,
            name: 'dot-size',
            className: 'text-center',
            onChange: (v) => {
                this.activeMessageData.dot.size = parseInt(v)
                this.applyDraft()
            },
        })
        dotSizeInputEl.style.flex = '1 1 auto'
        dotSizeInputEl.style.minWidth = '0'
        sizeField.appendChild(dotSizeInputEl)

        const strokeField = this.makeField('Stroke width', '', true)
        const strokeWidthInputEl = makeInput({
            type: 'number',
            value: this.activeMessageData.dot.stroke,
            min: 0,
            max: 99,
            step: 0.5,
            name: 'stroke-width',
            className: 'text-center',
            onChange: (v) => {
                this.activeMessageData.dot.stroke = parseFloat(v)
                this.applyDraft()
            },
        })
        strokeWidthInputEl.style.flex = '1 1 auto'
        strokeWidthInputEl.style.minWidth = '0'
        strokeField.appendChild(strokeWidthInputEl)
        if (this.activeMessageData.dot.style !== 'circle') {
            strokeField.style.display = 'none'
        }

        const strokeColorField = this.makeField('Stroke color', '', true)
        const { row: strokeColor } = makeColorPickerDropdown({
            color: this.activeMessageData.dot.strokeColor,
            debounceMs: 0,
            onChange: ({ hex }) => {
                this.activeMessageData.dot.strokeColor = hex
                this.applyDraft()
            },
        })
        strokeColor.style.flex = '1 1 auto'
        strokeColor.style.minWidth = '0'
        strokeColorField.appendChild(strokeColor)

        messageGroup.appendChild(sizeField)
        messageGroup.appendChild(strokeField)
        messageGroup.appendChild(strokeColorField)
        panel.appendChild(messageGroup)

        const autoplayGrid = document.createElement('div')
        autoplayGrid.classList.add('message-autoplay')

        const autoPlayGroup = makeSectionGroup('Auto Play')
        const timeField = this.makeField('Elapsed time (s)', '', true)
        const timeInput = makeInput({
            type: 'number',
            value: this.activeMessageData.autoPlay.time,
            min: 0,
            step: 0.5,
            name: 'play-time',
            className: 'text-center',
            onChange: (v) => {
                this.activeMessageData.autoPlay.time = parseFloat(v)
                this.applyDraft()
            },
        })
        timeField.appendChild(timeInput)
        autoPlayGroup.appendChild(timeField)

        autoplayGrid.appendChild(autoPlayGroup)
        panel.appendChild(autoplayGrid)

        const initviewHint =
            'Create an <b style="color:var(--primary)">audios/</b> folder in your current project folder if it doesn\'t exist yet, then copy the audio file into it. Make sure this folder is included when you share the project.'
        const audioGroup = makeSectionGroup('Audio', initviewHint)

        const hasAudio = !!(this.activeMessageData.audio?.fileName || this.activeMessageData.audio?.src)

        const audioFileFieldGroup = this.makeGrid(2)
        const audioFileField = this.makeField('File')
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

        const durationRow = document.createElement('div')
        durationRow.classList.add('message-audio-duration-row')
        durationRow.style.display = 'none'

        const durationText = document.createElement('span')
        durationText.classList.add('message-audio-duration-text')

        const applyDurationBtn = makeButton({
            title: 'Apply to elapsed time',
            className: 'audio-file-btn',
            onClick: () => {
                if (this._audioDurationSec == null) return
                const rounded = Math.round(this._audioDurationSec * 10) / 10
                this.activeMessageData.autoPlay.time = rounded
                timeInput.value = rounded
                this.applyDraft()
            },
        })

        durationRow.appendChild(durationText)
        durationRow.appendChild(applyDurationBtn)

        const readAudioDuration = (src) => {
            if (!src) {
                durationRow.style.display = 'none'
                this._audioDurationSec = null
                return
            }
            const probe = new Audio()
            probe.preload = 'metadata'
            probe.addEventListener(
                'loadedmetadata',
                () => {
                    if (!isFinite(probe.duration)) return
                    this._audioDurationSec = probe.duration
                    durationText.textContent = `Duration: ${probe.duration.toFixed(1)}s`
                    durationRow.style.display = 'flex'
                },
                { once: true },
            )
            probe.addEventListener(
                'error',
                () => {
                    durationRow.style.display = 'none'
                    this._audioDurationSec = null
                },
                { once: true },
            )
            probe.src = src
        }

        const clearAudioBtn = makeButton({
            icon: ICONS.trash,
            title: 'Remove audio',
            className: 'delete-btn audio-clear-btn',
            onClick: () => {
                const audio = this.activeMessageData.audio
                if (audio?.src?.startsWith('blob:')) {
                    URL.revokeObjectURL(audio.src)
                }
                delete this.activeMessageData.audio
                fileInput.value = ''
                fileNameSpan.textContent = 'No file chosen'
                clearAudioBtn.style.display = 'none'
                audioSettings.style.display = 'none'
                durationRow.style.display = 'none'
                this._audioDurationSec = null

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
                    autoPlay: false,
                }
            }

            this.activeMessageData.audio.fileName = file.name
            this.activeMessageData.audio.src = URL.createObjectURL(file)
            fileNameSpan.textContent = file.name
            clearAudioBtn.style.display = ''
            audioSettings.style.display = ''
            readAudioDuration(this.activeMessageData.audio.src)
            this.applyDraft(true)
        })

        fileLabel.appendChild(fileBtn)
        fileLabel.appendChild(fileNameSpan)
        fileLabel.appendChild(fileInput)
        audioFileField.appendChild(fileLabel)
        audioFileFieldGroup.appendChild(audioFileField)
        audioFileFieldGroup.appendChild(clearAudioBtn)
        audioGroup.appendChild(audioFileFieldGroup)
        audioGroup.appendChild(durationRow)

        if (hasAudio) {
            readAudioDuration(this.activeMessageData.audio.src || `./audios/${this.activeMessageData.audio.fileName}`)
        }

        const iconColorField = this.makeField('Icon color', '', true)
        const { row: audioIconColor } = makeColorPickerDropdown({
            color: this.activeMessageData.audio?.iconColor || '#ffffff',
            debounceMs: 0,
            onChange: ({ hex }) => {
                this.activeMessageData.audio.iconColor = hex
                this.applyDraft()
            },
        })
        audioIconColor.style.flex = '1 1 auto'
        audioIconColor.style.minWidth = '0'
        iconColorField.appendChild(audioIconColor)

        const iconBgField = this.makeField('Background color', 'background-color', true)
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
        iconBg.style.flex = '1 1 auto'
        iconBg.style.minWidth = '0'
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

        const autoPlayField = this.makeField('Auto play')
        autoPlayField.appendChild(
            makeToggle({
                initialValue: this.activeMessageData.audio?.autoPlay,
                onChange: (value) => {
                    this.activeMessageData.audio.autoPlay = value
                    this.applyDraft()
                },
            }),
        )

        const audioToggleGrid = this.makeGrid(3)

        audioToggleGrid.appendChild(showField)
        audioToggleGrid.appendChild(autoPlayField)
        audioToggleGrid.appendChild(loopField)

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
        audioSettings.appendChild(iconColorField)
        audioSettings.appendChild(iconBgField)
        audioSettings.appendChild(volumeField)

        audioGroup.appendChild(audioSettings)
        panel.appendChild(audioGroup)

        const applyRow = document.createElement('div')
        applyRow.classList.add('btn-row')

        const cancelBtn = makeButton({
            title: 'Cancel',
            className: 'cancel-btn',
            onClick: () => {
                this.onCancel()
            },
        })

        const applyBtn = makeButton({
            title: 'Apply',
            className: 'confirm-btn',
            onClick: () => {
                this.onApply()
            },
        })

        applyRow.appendChild(cancelBtn)
        applyRow.appendChild(applyBtn)
        panel.appendChild(applyRow)
        return panel
    }

    makeField(label, classname = '', row = false) {
        const wrap = document.createElement('div')
        wrap.classList.add('message-field')
        if (classname) wrap.classList.add(classname)
        const lbl = document.createElement('div')
        lbl.classList.add('message-label')
        lbl.textContent = label
        wrap.appendChild(lbl)
        if (row) {
            wrap.classList.add('message-field-row')
            wrap.style.display = 'flex'
            wrap.style.alignItems = 'center'
            wrap.style.gap = '8px'
            lbl.style.flex = '0 0 auto'
            lbl.style.whiteSpace = 'nowrap'
        }
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
    cleanup() {
        this.handles.forEach((h) => this.events.offByHandle(h))
    }
}
