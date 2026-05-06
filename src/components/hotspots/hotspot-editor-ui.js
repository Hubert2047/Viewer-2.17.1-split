class HotspotEditorUI {
    isCreatingHotspot = false
    constructor(body, { global, dom }) {
        this.body = body
        this.dom = dom
        this.confirmDialog = global.confirmDialog
        this.camera = global.camera.camera
        this.events = global.events
        this.state = global.state
        this.settings = global.settings
        this.activeHotspotData = null
        this.listEl = null
        this.countEl = null
        this.listenEvents()
        // this.createEmbedTooltip()
    }
    listenEvents() {
        this.events.on('hotspot:add-cancelled', () => {
            document.body.style.cursor = 'default'
            this.events.fire('hotspot:editing', false)
            this.isCreatingHotspot = false
            this.resetAddBtn()
        })
        this.events.on('hotspot:update-ui-data', (data) => {
            if (!this.activeHotspotData) return
            if (this.activeHotspotData.dot.size !== data.dot.size) {
                if (!this.dotSizeInput) this.dotSizeInput = this.body.querySelector('input[name="dot-size"]')
                if (this.dotSizeInput && document.activeElement !== this.dotSizeInput) {
                    this.dotSizeInput.value = data.dot.size
                }
            }
            if (this.activeHotspotData.text.fontSize !== data.text.fontSize) {
                if (!this.fontSizeInput) this.fontSizeInput = this.body.querySelector('input[name="font-size"]')
                if (this.fontSizeInput && document.activeElement !== this.fontSizeInput) {
                    this.fontSizeInput.value = data.text.fontSize
                }
            }
            this.activeHotspotData = data
        })
    }
    createEmbedTooltip() {
        if (!document.getElementById('embed-tooltip-global')) {
            const t = document.createElement('div')
            t.id = 'embed-tooltip-global'
            t.classList.add('embed-tooltip')
            t.innerHTML = `
            <div class="embed-tip-row">
                <span class="embed-tip-dot amber"></span>
                <span>Embedding increases the exported file size — not recommended, especially for large files.</span>
            </div>
            <div class="embed-tip-row">
                <span class="embed-tip-dot green"></span>
                <span>Keep embed off and copy the audio file into the <b style="color:var(--primary)">audios/</b> folder — include that folder when sharing.</span>
            </div>
            `
            document.body.appendChild(t)
            this.embedTooltip = t
        }
    }
    mount() {
        this.renderHeader()
        this.listEl = document.createElement('div')
        this.listEl.classList.add('hotspot-list')
        this.body.appendChild(this.listEl)
        this.events.fire('hotspot:editor', this)
    }

    renderHeader() {
        const header = document.createElement('div')
        header.classList.add('hotspot-section-header')

        const titleGroup = document.createElement('div')
        const title = document.createElement('div')
        title.classList.add('hotspot-title')
        title.textContent = 'Product Hotspots'

        this.countEl = document.createElement('div')
        this.countEl.classList.add('hotspot-count')
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
        if (this.isCreatingHotspot) {
            this.events.fire('hotspot:add-cancelled')
            this.resetAddBtn()
            return
        }
        document.body.style.cursor = 'crosshair'
        this.isCreatingHotspot = true
        this.events.fire('hotspot:editing', true)
        this.events.fire('hotspot:editor-selected', null)

        this.setAddBtnCancel(true)

        this.events.on('pointerup', (e) => {
            if (!this.isCreatingHotspot) return
            const rect = this.dom.ui.getBoundingClientRect()
            const mouseX = e.clientX - rect.left
            const mouseY = e.clientY - rect.top
            const position = pickModelLocalPoint(mouseX, mouseY, this.camera)
            this.events.fire('hotspot:add', { position })
            document.body.style.cursor = 'default'
            this.isCreatingHotspot = false
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
        const ok = await this.confirmDialog.ask('Delete Hotspot', 'Are you sure? This cannot be undone.', 'delete')
        if (ok) {
            this.events.fire('hotspot:delete', id)
        }
    }
    onCancel() {
        this.events.fire('hotspot:editor-cancelled')
    }
    onApply() {
        this.events.fire('hotspot:apply', this.activeHotspotData)
    }
    render(hotspotData, activeHotspotData) {
        this.activeHotspotData = activeHotspotData ? JSON.parse(JSON.stringify(activeHotspotData)) : null
        this.listEl.innerHTML = ''
        this.countEl.textContent = `${hotspotData.length} hotspot${hotspotData.length !== 1 ? 's' : ''} configured`

        hotspotData.forEach((h) => {
            const isExpanded = this.activeHotspotData?.id === h.id
            const item = document.createElement('div')
            item.classList.add('hotspot-item')
            item.dataset.id = h.id
            if (isExpanded) item.classList.add('expanded')

            const { row, headerTitle } = this.renderItemHeader(h, isExpanded)
            item.appendChild(row)
            if (isExpanded) item.appendChild(this.renderEditPanel(headerTitle))

            item.addEventListener('dragover', (e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                document.querySelectorAll('.hotspot-item').forEach((el) => el.classList.remove('drag-over'))
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
                this.events.fire('hotspot:reorder', { fromId, toId })
            })

            this.listEl.appendChild(item)
        })
    }
    renderItemHeader(h, isExpanded) {
        const row = document.createElement('div')
        row.classList.add('hotspot-header')
        const handle = document.createElement('div')
        handle.classList.add('hotspot-drag-handle')
        handle.innerHTML = ICONS.hotspotDragHandle

        row.dataset.dragId = h.id

        row.setAttribute('draggable', true)

        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', h.id)
            row.classList.add('dragging')
        })

        row.addEventListener('dragend', () => {
            row.classList.remove('dragging')
            document.querySelectorAll('.hotspot-item').forEach((el) => el.classList.remove('drag-over'))
        })

        const name = document.createElement('div')
        name.classList.add('hotspot-header-name')
        name.textContent = h.button?.title || 'hotspot'

        const actions = document.createElement('div')
        actions.classList.add('hotspot-header-actions')

        const editBtn = makeButton({
            icon: ICONS.hotspotEditBtn,
            title: 'Edit',
            className: 'hotspot-action-btn',
            onClick: () => this.events.fire('hotspot:editor-selected', isExpanded ? null : h),
        })
        if (isExpanded) editBtn.classList.add('active')

        const delBtn = makeButton({
            icon: ICONS.hotspotDelete,
            title: 'Delete',
            className: 'hotspot-action-btn',
            onClick: () => this.onDelete(h.id),
        })

        actions.appendChild(editBtn)
        actions.appendChild(delBtn)
        row.appendChild(name)
        row.appendChild(actions)
        return { row, headerTitle: name }
    }
    applyDraft = (refreshUIPanel = false) => {
        this.events.fire('hotspot:editor-changed', {
            data: JSON.parse(JSON.stringify(this.activeHotspotData)),
            refreshUIPanel,
        })
    }
    renderEditPanel(headerTitle) {
        const panel = makeSectionWrap({ className: 'hotspot-edit-panel' })

        const buttonGroup = makeSectionGroup('Button')
        const btnTitleField = this.makeField('Title')
        btnTitleField.appendChild(
            makeInput('text', this.activeHotspotData.button.title, {
                placeholder: 'Title...',
                name: 'button-title',
                onChange: (v) => {
                    this.activeHotspotData.button.title = v
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
        formatRow.classList.add('hotspot-label-row')
        formatRow.appendChild(this.makeFormatBtn('<b>B</b>', 'bold', this.activeHotspotData, this.applyDraft))
        formatRow.appendChild(this.makeFormatBtn('<i>I</i>', 'italic', this.activeHotspotData, this.applyDraft))

        const alignRow = makeSegmentRow({
            options: [
                { icon: ICONS.alignLeft, value: 'left' },
                { icon: ICONS.alignCenter, value: 'center' },
                { icon: ICONS.alignRight, value: 'right' },
            ],
            className: 'hotspot-align-btns',
            defaultValue: this.activeHotspotData.text.align || 'center',
            onChange: (val) => {
                this.activeHotspotData.text.align = val
                this.applyDraft()
            },
        })
        formatRow.appendChild(alignRow)

        const labelRow = document.createElement('div')
        labelRow.classList.add('hotspot-label-row')
        labelRow.appendChild(
            makeTextarea(this.activeHotspotData.text.content, {
                placeholder: 'Enter label...',
                classname: 'hotspot-text',
                name: this.activeHotspotData.text.content,
                onChange: (v) => {
                    this.activeHotspotData.text.content = v
                    this.applyDraft()
                },
            }),
        )

        labelField.appendChild(formatRow)
        labelField.appendChild(labelRow)
        textGroup.appendChild(labelField)

        const colorGrid = this.makeGrid(2)
        const colorField = this.makeField('Color')
        colorField.appendChild(
            makeColorSwatch(this.activeHotspotData.text.color, (v) => {
                this.activeHotspotData.text.color = v
                this.applyDraft()
            }),
        )
        const bgField = this.makeField('Background')
        bgField.appendChild(
            makeColorAlpha({
                color: this.activeHotspotData.text.background,
                alpha: this.activeHotspotData.text.backgroundAlpha,
                onChangeColor: (v) => {
                    this.activeHotspotData.text.background = v
                    this.applyDraft()
                },
                onChangeAlpha: (v) => {
                    this.activeHotspotData.text.backgroundAlpha = v
                    this.applyDraft()
                },
            }),
        )
        colorGrid.appendChild(colorField)
        colorGrid.appendChild(bgField)
        textGroup.appendChild(colorGrid)

        const fontGrid = this.makeGrid(2)
        const fontSizeField = this.makeField('Font size')
        fontSizeField.appendChild(
            makeInput('number', this.activeHotspotData.text.fontSize, {
                min: 8,
                max: 72,
                name: 'font-size',
                onChange: (v) => {
                    this.activeHotspotData.text.fontSize = parseInt(v)
                    this.applyDraft()
                },
            }),
        )
        const fontFamilyField = this.makeField('Font')
        fontFamilyField.appendChild(
            makeSelect(
                ['Lato', 'Roboto', 'Open Sans', 'Montserrat'],
                this.activeHotspotData.text.font,
                (v) => {
                    this.activeHotspotData.text.font = v
                    this.applyDraft()
                },
                { name: 'font-family' },
            ),
        )
        fontGrid.appendChild(fontSizeField)
        fontGrid.appendChild(fontFamilyField)
        textGroup.appendChild(fontGrid)
        panel.appendChild(textGroup)

        const hotspotGroup = makeSectionGroup('Hotspot')
        const styleField = this.makeField('Style')
        const styleRow = makeSegmentRow({
            options: [
                { label: 'Circle', value: 'circle' },
                { label: 'Dot', value: 'dot' },
            ],
            defaultValue: this.activeHotspotData.dot.style,
            onChange: (val) => {
                this.activeHotspotData.dot.style = val
                strokeField.style.display = val === 'dot' ? 'none' : 'block'
                this.applyDraft()
            },
        })
        styleField.appendChild(styleRow)
        hotspotGroup.appendChild(styleField)

        const dotGrid = this.makeGrid(3)
        const sizeField = this.makeField('Size (px)')
        sizeField.appendChild(
            makeInput('number', this.activeHotspotData.dot.size, {
                min: 10,
                max: 80,
                name: 'dot-size',
                onChange: (v) => {
                    this.activeHotspotData.dot.size = parseInt(v)
                    this.applyDraft()
                },
            }),
        )
        const strokeField = this.makeField('Stroke width')
        strokeField.appendChild(
            makeInput('number', this.activeHotspotData.dot.stroke, {
                min: 0,
                max: 10,
                step: 0.5,
                name: 'stroke-width',
                onChange: (v) => {
                    this.activeHotspotData.dot.stroke = parseFloat(v)
                    this.applyDraft()
                },
            }),
        )
        if (this.activeHotspotData.dot.style === 'dot') {
            strokeField.style.display = 'none'
        }
        const strokeColorField = this.makeField('Stroke color')
        strokeColorField.appendChild(
            makeColorSwatch(this.activeHotspotData.dot.strokeColor, (v) => {
                this.activeHotspotData.dot.strokeColor = v
                this.applyDraft()
            }),
        )
        dotGrid.appendChild(sizeField)
        dotGrid.appendChild(strokeField)
        dotGrid.appendChild(strokeColorField)
        hotspotGroup.appendChild(dotGrid)
        panel.appendChild(hotspotGroup)

        const autoplayGrid = document.createElement('div')
        autoplayGrid.classList.add('hotspot-autoplay')

        const autoPlayGroup = makeSectionGroup('Auto Play')
        const timeField = this.makeField('Time (ms)')
        timeField.appendChild(
            makeInput('number', this.activeHotspotData.autoPlay.time, {
                min: 0,
                step: 500,
                name: 'play-time',
                onChange: (v) => {
                    this.activeHotspotData.autoPlay.time = parseInt(v)
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

        const hasAudio = !!(this.activeHotspotData.audio?.fileName || this.activeHotspotData.audio?.src)

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
        fileNameSpan.textContent = this.activeHotspotData.audio?.fileName || 'No file chosen'

        const audioSettings = document.createElement('div')
        audioSettings.classList.add('audio-settings')
        if (!hasAudio) audioSettings.style.display = 'none'

        const clearAudioBtn = makeButton({
            icon: ICONS.trash,
            title: 'Remove audio',
            className: 'delete-btn audio-clear-btn',
        })
        if (!hasAudio) clearAudioBtn.style.display = 'none'

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0]
            if (!file) return

            if (this.activeHotspotData.audio?.src?.startsWith('blob:')) {
                URL.revokeObjectURL(this.activeHotspotData.audio.src)
            }

            if (!this.activeHotspotData.audio || !this.activeHotspotData.audio.fileName) {
                this.activeHotspotData.audio = {
                    show: true,
                    src: null,
                    fileName: null,
                    bgColor: '#000000',
                    bgAlpha: 0.8,
                    iconColor: '#ffffff',
                    volume: 1,
                    loop: false,
                    embed: false,
                    // persist: false,
                    autoPlay: false,
                }
            }

            this.activeHotspotData.audio.fileName = file.name
            this.activeHotspotData.audio.src = URL.createObjectURL(file)
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

            // this.activeHotspotData.audio.fileId = fileId
            // store.set(fileId, file)

            this.applyDraft(true)
        })

        clearAudioBtn.addEventListener('click', () => {
            const audio = this.activeHotspotData.audio
            const store = this.settings.fileAudioStore
            if (audio?.src?.startsWith('blob:')) {
                URL.revokeObjectURL(audio.src)
            }
            // if (audio?.fileId && store instanceof Map) {
            //     store.delete(audio.fileId)
            // }
            delete this.activeHotspotData.audio
            fileInput.value = ''
            fileNameSpan.textContent = 'No file chosen'
            clearAudioBtn.style.display = 'none'
            audioSettings.style.display = 'none'

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
        const iconColorField = this.makeField('Color')
        iconColorField.appendChild(
            makeColorSwatch(this.activeHotspotData.audio?.iconColor || '#ffffff', (v) => {
                this.activeHotspotData.audio.iconColor = v
                this.applyDraft()
            }),
        )

        const iconBgField = this.makeField('Background', 'background-color')
        iconBgField.appendChild(
            makeColorAlpha({
                color: this.activeHotspotData.audio?.bgColor || '#000000',
                alpha: this.activeHotspotData.audio?.bgAlpha ?? 0.35,
                onChangecolor: (v) => {
                    this.activeHotspotData.audio.bgColor = v
                    this.applyDraft()
                },
                onChangeAlpha: (v) => {
                    this.activeHotspotData.audio.bgAlpha = v
                    this.applyDraft()
                },
            }),
        )

        const loopField = this.makeField('Loop')
        loopField.appendChild(
            makeToggle(this.activeHotspotData.audio?.loop, (value) => {
                this.activeHotspotData.audio.loop = value
                this.applyDraft()
            }),
        )

        const showField = this.makeField('Show')
        showField.appendChild(
            makeToggle(this.activeHotspotData.audio?.show, (value) => {
                this.activeHotspotData.audio.show = value
                this.applyDraft()
            }),
        )
        // const persistField = this.makeField('Persist')
        // persistField.appendChild(
        //     makeToggle(this.activeHotspotData.audio?.persist, (value) => {
        //         this.activeHotspotData.audio.persist = value
        //         return this.activeHotspotData.audio.persist
        //     }),
        // )
        const autoPlayField = this.makeField('Auto Play')
        autoPlayField.appendChild(
            makeToggle(this.activeHotspotData.audio?.autoPlay, (value) => {
                this.activeHotspotData.audio.autoPlay = value
                this.applyDraft()
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
        // const embedToggle = makeToggle(this.activeHotspotData.audio?.embed, (value) => {
        //     if (value) {
        //         const src = this.activeHotspotData.audio.src
        //         const hasValidSrc = src?.startsWith('data:') || src?.startsWith('blob:')
        //         if (!hasValidSrc && this.activeHotspotData.audio.fileName) {
        //             showToast('To embed, please re-select the audio file using the file picker.', {
        //                 duration: 5000,
        //                 type: 'warning',
        //             })
        //             embedToggle.setValue(false)
        //             return
        //         }
        //     }
        //     this.activeHotspotData.audio.embed = value
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
            value: this.activeHotspotData.audio?.volume ?? 1,
            variant: 'progress',
            onChange: (v) => {
                this.activeHotspotData.audio.volume = v
                volumeInput.value = v
                this.applyDraft()
            },
        })

        const volumeInput = makeInput('number', this.activeHotspotData.audio?.volume ?? 1, {
            min: 0,
            max: 1,
            step: 0.1,
            className: 'volume-number',
            name: 'volume',
            onChange: (v) => {
                const value = Math.min(1, Math.max(0, parseFloat(v) || 0))
                this.activeHotspotData.audio.volume = value
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
            className: 'cancel-btn hotspot-cancel-btn',
            onClick: () => {
                this.onCancel()
            },
        })

        const applyBtn = makeButton({
            title: 'Apply',
            className: 'hotspot-apply-btn confirm-btn',
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
        wrap.classList.add('hotspot-field')
        if (classname) wrap.classList.add(classname)
        const lbl = document.createElement('div')
        lbl.classList.add('hotspot-label')
        lbl.textContent = label
        wrap.appendChild(lbl)
        return wrap
    }

    makeGrid(variant) {
        const grid = document.createElement('div')
        grid.classList.add(variant === 3 ? 'hotspot-grid-3' : 'hotspot-grid-2')
        return grid
    }

    makeFormatBtn(char, key, draft, onChange) {
        const btn = document.createElement('button')
        btn.classList.add('fmt-btn')
        if (draft.text[key]) btn.classList.add('active')
        btn.innerHTML = char
        btn.addEventListener('click', () => {
            draft.text[key] = !draft.text[key]
            btn.classList.toggle('active', draft.text[key])
            onChange()
        })
        return btn
    }
}
