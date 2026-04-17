class HotspotEditorUI {
    isCreatingHotspot = false
    controllers = null
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
        this.createEmbedTooltip()
    }
    listenEvents() {
        this.events.on('controllers:created', (controllers) => {
            this.controllers = controllers
        })
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
                <span>Keep embed off and copy the audio file into the <b>audios/</b> folder — include that folder when sharing.</span>
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
            const entityInfo = this.controllers[this.state.cameraMode].getEntityInfo()
            this.events.fire('hotspot:add', { position, entityInfo })
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
        handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
        <circle cx="4" cy="2.5" r="1"/><circle cx="8" cy="2.5" r="1"/>
        <circle cx="4" cy="6"   r="1"/><circle cx="8" cy="6"   r="1"/>
        <circle cx="4" cy="9.5" r="1"/><circle cx="8" cy="9.5" r="1"/>
        </svg>`

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

        const editBtn = this.makeIconBtn(
            `<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
        )
        if (isExpanded) editBtn.classList.add('active')
        editBtn.title = 'Edit'
        editBtn.addEventListener('click', () => {
            this.events.fire('hotspot:editor-selected', isExpanded ? null : h)
        })

        const delBtn = this.makeIconBtn(
            `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 3H10.5M4.5 3V2H7.5V3M2.5 3L3 10H9L9.5 3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            'del',
        )
        delBtn.title = 'Delete'
        delBtn.addEventListener('click', () => this.onDelete(h.id))

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
        const panel = document.createElement('div')
        panel.classList.add('hotspot-edit-panel')

        const buttonGrid = document.createElement('div')
        const buttonGroup = this.makeGroup('Button')
        const btnTitleField = this.makeField('Title')
        btnTitleField.appendChild(
            this.makeInput('text', this.activeHotspotData.button.title, {
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
        buttonGrid.appendChild(buttonGroup)
        panel.appendChild(buttonGrid)
        
        const textGroup = this.makeGroup('Text')
        const labelField = this.makeField('Label')
        const formatRow = document.createElement('div')
        formatRow.classList.add('hotspot-label-row')
        formatRow.appendChild(this.makeFormatBtn('<b>B</b>', 'bold', this.activeHotspotData, this.applyDraft))
        formatRow.appendChild(this.makeFormatBtn('<i>I</i>', 'italic', this.activeHotspotData, this.applyDraft))

        const alignIcons = {
            left: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="0" y="1" width="14" height="2" rx="1"/>
                    <rect x="0" y="5" width="9" height="2" rx="1"/>
                    <rect x="0" y="9" width="12" height="2" rx="1"/>
                </svg>`,
            center: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="0" y="1" width="14" height="2" rx="1"/>
                    <rect x="2.5" y="5" width="9" height="2" rx="1"/>
                    <rect x="1" y="9" width="12" height="2" rx="1"/>
                </svg>`,
            right: `<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="0" y="1" width="14" height="2" rx="1"/>
                    <rect x="5" y="5" width="9" height="2" rx="1"/>
                    <rect x="2" y="9" width="12" height="2" rx="1"/>
                </svg>`,
        }

        ;['left', 'center', 'right'].forEach((align) => {
            const btn = document.createElement('button')
            btn.classList.add('fmt-btn')
            btn.innerHTML = alignIcons[align]
            if ((this.activeHotspotData.text.align || 'center') === align) btn.classList.add('active')
            btn.dataset.align = align
            btn.addEventListener('click', () => {
                this.activeHotspotData.text.align = align
                formatRow.querySelectorAll('.fmt-btn[data-align]').forEach((b) => b.classList.remove('active'))
                btn.classList.add('active')
                this.applyDraft()
            })
            formatRow.appendChild(btn)
        })

        const labelRow = document.createElement('div')
        labelRow.classList.add('hotspot-label-row')
        labelRow.appendChild(
            this.makeTextarea(this.activeHotspotData.text.content, {
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
            this.makeColorSwatch(this.activeHotspotData.text.color, (v) => {
                this.activeHotspotData.text.color = v
                this.applyDraft()
            }),
        )
        const bgField = this.makeField('Background')
        bgField.appendChild(
            this.makeColorAlpha(
                this.activeHotspotData.text.background,
                this.activeHotspotData.text.backgroundAlpha,
                (v) => {
                    this.activeHotspotData.text.background = v
                    this.applyDraft()
                },
                (v) => {
                    this.activeHotspotData.text.backgroundAlpha = v
                    this.applyDraft()
                },
            ),
        )
        colorGrid.appendChild(colorField)
        colorGrid.appendChild(bgField)
        textGroup.appendChild(colorGrid)

        const fontGrid = this.makeGrid(2)
        const fontSizeField = this.makeField('Font size')
        fontSizeField.appendChild(
            this.makeInput('number', this.activeHotspotData.text.fontSize, {
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
            this.makeSelect(
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

        const hotspotGroup = this.makeGroup('Hotspot')
        const styleField = this.makeField('Style')
        const styleRow = document.createElement('div')
        styleRow.classList.add('hotspot-style-row')
        ;['circle', 'dot'].forEach((opt) => {
            const btn = document.createElement('div')
            btn.classList.add('hotspot-style-btn')
            if (this.activeHotspotData.dot.style === opt) btn.classList.add('active')
            btn.textContent = opt.charAt(0).toUpperCase() + opt.slice(1)
            btn.addEventListener('click', () => {
                this.activeHotspotData.dot.style = opt
                styleRow.querySelectorAll('.hotspot-style-btn').forEach((b) => b.classList.toggle('active', b === btn))
                this.applyDraft()
            })
            styleRow.appendChild(btn)
        })
        styleField.appendChild(styleRow)
        hotspotGroup.appendChild(styleField)

        const dotGrid = this.makeGrid(3)
        const sizeField = this.makeField('Size (px)')
        sizeField.appendChild(
            this.makeInput('number', this.activeHotspotData.dot.size, {
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
            this.makeInput('number', this.activeHotspotData.dot.stroke, {
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
        const strokeColorField = this.makeField('Stroke color')
        strokeColorField.appendChild(
            this.makeColorSwatch(this.activeHotspotData.dot.strokeColor, (v) => {
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

        const autoPlayGroup = this.makeGroup('Auto Play')
        const timeField = this.makeField('Time (ms)')
        timeField.appendChild(
            this.makeInput('number', this.activeHotspotData.autoPlay.time, {
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

        const audioGroup = this.makeGroup('Audio')

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

        const clearAudioBtn = document.createElement('button')
        clearAudioBtn.classList.add('icon-btn', 'del')
        if (!hasAudio) clearAudioBtn.style.display = 'none'
        clearAudioBtn.title = 'Remove audio'
        clearAudioBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M1.5 3H10.5M4.5 3V2H7.5V3M2.5 3L3 10H9L9.5 3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`

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
                    persist: false,
                    autoPlay: false,
                }
            }

            this.activeHotspotData.audio.fileName = file.name
            this.activeHotspotData.audio.src = URL.createObjectURL(file)
            fileNameSpan.textContent = file.name
            clearAudioBtn.style.display = ''
            audioSettings.style.display = ''
            if (!(this.settings.fileAudioStore instanceof Map)) {
                this.settings.fileAudioStore = new Map()
            }
            if (!(this.settings.fileAudioStore instanceof Map)) {
                this.settings.fileAudioStore = new Map()
            }

            const store = this.settings.fileAudioStore
            const fileId = guid.create()

            this.activeHotspotData.audio.fileId = fileId
            store.set(fileId, file)
            this.applyDraft(true)
        })

        clearAudioBtn.addEventListener('click', () => {
            const audio = this.activeHotspotData.audio
            const store = this.settings.fileAudioStore
            if (audio?.src?.startsWith('blob:')) {
                URL.revokeObjectURL(audio.src)
            }
            if (audio?.fileId && store instanceof Map) {
                store.delete(audio.fileId)
            }
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
            this.makeColorSwatch(this.activeHotspotData.audio?.iconColor || '#ffffff', (v) => {
                this.activeHotspotData.audio.iconColor = v
                this.applyDraft()
            }),
        )

        const iconBgField = this.makeField('Background', 'background-color')
        iconBgField.appendChild(
            this.makeColorAlpha(
                this.activeHotspotData.audio?.bgColor || '#000000',
                this.activeHotspotData.audio?.bgAlpha ?? 0.35,
                (v) => {
                    this.activeHotspotData.audio.bgColor = v
                    this.applyDraft()
                },
                (v) => {
                    this.activeHotspotData.audio.bgAlpha = v
                    this.applyDraft()
                },
            ),
        )

        const loopField = this.makeField('Loop')
        loopField.appendChild(
            this.makeToggle(this.activeHotspotData.audio?.loop, () => {
                this.activeHotspotData.audio.loop = !this.activeHotspotData.audio.loop
                return this.activeHotspotData.audio.loop
            }),
        )

        const showField = this.makeField('Show')
        showField.appendChild(
            this.makeToggle(this.activeHotspotData.audio?.show, () => {
                this.activeHotspotData.audio.show = !this.activeHotspotData.audio.show
                return this.activeHotspotData.audio.show
            }),
        )
        const persistField = this.makeField('Persist')
        persistField.appendChild(
            this.makeToggle(this.activeHotspotData.audio?.persist, () => {
                this.activeHotspotData.audio.persist = !this.activeHotspotData.audio.persist
                return this.activeHotspotData.audio.persist
            }),
        )
        const autoPlayField = this.makeField('Auto Play')
        autoPlayField.appendChild(
            this.makeToggle(this.activeHotspotData.audio?.autoPlay, () => {
                this.activeHotspotData.audio.autoPlay = !this.activeHotspotData.audio.autoPlay
                return this.activeHotspotData.audio.autoPlay
            }),
        )

        const embedField = this.makeField('Embed', 'embed')
        const embedLabel = embedField.querySelector('div:first-child')
        if (embedLabel) {
            const infoIcon = document.createElement('span')
            infoIcon.classList.add('embed-info-icon')
            infoIcon.textContent = 'i'
            infoIcon.setAttribute('tabindex', '0')

            infoIcon.addEventListener('mouseenter', () => {
                const rect = infoIcon.getBoundingClientRect()
                this.embedTooltip.style.display = 'block'
                const tooltipW = this.embedTooltip.offsetWidth
                const tooltipH = this.embedTooltip.offsetHeight
                const margin = 8
                let left = rect.left + rect.width / 2 - tooltipW / 2
                let top = rect.top - tooltipH - 6
                left = Math.max(margin, Math.min(left, window.innerWidth - tooltipW - margin))
                if (top < margin) {
                    top = rect.bottom + 6
                }
                this.embedTooltip.style.left = `${left}px`
                this.embedTooltip.style.top = `${top}px`
            })

            infoIcon.addEventListener('mouseleave', () => {
                this.embedTooltip.style.display = 'none'
            })
            embedLabel.appendChild(infoIcon)
        }
        const embedWrap = document.createElement('div')
        embedWrap.classList.add('audio-toggle-wrap')
        const embedToggle = document.createElement('div')
        embedToggle.classList.add('toggle')
        if (this.activeHotspotData.audio?.embed) embedToggle.classList.add('active')
        const embedKnob = document.createElement('div')
        embedKnob.classList.add('toggle-knob')
        embedToggle.appendChild(embedKnob)

        embedToggle.addEventListener('click', () => {
            const isEmbed = !this.activeHotspotData.audio.embed
            if (isEmbed) {
                const src = this.activeHotspotData.audio.src
                const hasValidSrc = src?.startsWith('data:') || src?.startsWith('blob:')
                if (!hasValidSrc && this.activeHotspotData.audio.fileName) {
                    showToast('To embed, please re-select the audio file using the file picker.', {
                        duration: 5000,
                        type: 'warning',
                    })
                    return
                }
            }

            this.activeHotspotData.audio.embed = isEmbed
            embedToggle.classList.toggle('active', isEmbed)
            this.applyDraft()
        })

        embedWrap.appendChild(embedToggle)
        embedField.appendChild(embedWrap)

        const audioToggleGrid = this.makeGrid(3)
        audioGrid.appendChild(iconColorField)
        audioGrid.appendChild(iconBgField)

        audioToggleGrid.appendChild(showField)
        audioToggleGrid.appendChild(autoPlayField)
        audioToggleGrid.appendChild(loopField)
        audioToggleGrid.appendChild(persistField)
        audioToggleGrid.appendChild(embedField)

        const volumeField = this.makeField('Volume', 'volume')
        const volumeWrap = document.createElement('div')
        volumeWrap.classList.add('volume-wrap')

        const volumeSlider = document.createElement('input')
        const updateSlider = (v) => {
            volumeSlider.style.background = `linear-gradient(
        to right,
        #f95f4d 0%,
        #f95f4d ${v * 100}%,
        rgba(0,0,0,0.1) ${v * 100}%,
        rgba(0,0,0,0.1) 100%
    )`
        }
        volumeSlider.type = 'range'
        volumeSlider.classList.add('volume-slider')
        volumeSlider.min = 0
        volumeSlider.max = 1
        volumeSlider.step = 0.1
        volumeSlider.value = this.activeHotspotData.audio?.volume ?? 1
        updateSlider(this.activeHotspotData.audio?.volume ?? 1)

        const volumeInput = document.createElement('input')
        volumeInput.type = 'number'
        volumeInput.classList.add('input-field', 'volume-number')
        volumeInput.min = 0
        volumeInput.max = 1
        volumeInput.step = 0.1
        volumeInput.value = this.activeHotspotData.audio?.volume ?? 1

        volumeSlider.addEventListener('input', () => {
            const v = parseFloat(volumeSlider.value)
            volumeInput.value = v
            this.activeHotspotData.audio.volume = v
            updateSlider(v)
            this.applyDraft()
        })

        volumeInput.addEventListener('input', () => {
            const v = Math.min(1, Math.max(0, parseFloat(volumeInput.value) || 0))
            volumeSlider.value = v
            this.activeHotspotData.audio.volume = v
            updateSlider(v)
            this.applyDraft()
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

        const cancelBtn = document.createElement('button')
        cancelBtn.classList.add('cancel-btn', 'btn', 'hotspot-cancel-btn')
        cancelBtn.style.flex = '1'
        cancelBtn.textContent = 'Cancel'
        cancelBtn.addEventListener('click', () => {
            this.onCancel()
        })

        const applyBtn = document.createElement('button')
        applyBtn.classList.add('hotspot-apply-btn', 'confirm-btn', 'btn')
        applyBtn.style.flex = '1'
        applyBtn.textContent = 'Apply'
        applyBtn.addEventListener('click', () => this.onApply())

        applyRow.appendChild(applyBtn)
        applyRow.appendChild(cancelBtn)
        panel.appendChild(applyRow)
        return panel
    }

    makeToggle(initialValue, onChange) {
        const wrap = document.createElement('div')
        wrap.classList.add('audio-toggle-wrap')

        const toggle = document.createElement('div')
        toggle.classList.add('toggle')
        if (initialValue) toggle.classList.add('active')

        const knob = document.createElement('div')
        knob.classList.add('toggle-knob')
        toggle.appendChild(knob)

        toggle.addEventListener('click', () => {
            const newVal = onChange()
            toggle.classList.toggle('active', newVal)
            this.applyDraft()
        })

        wrap.appendChild(toggle)
        return wrap
    }

    makeTextarea(value, opts = {}) {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.classList.add('textarea-field')
        const autoResize = () => {
            textarea.style.height = 'auto'
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px'
        }
        textarea.addEventListener('input', () => {
            autoResize()
            if (opts.onChange) opts.onChange(textarea.value)
        })

        requestAnimationFrame(autoResize)
        if (opts.name) textarea.name = opts.name
        if (opts.classname) textarea.classList.add(opts.classname)
        if (opts.placeholder) textarea.placeholder = opts.placeholder
        return textarea
    }

    makeColorAlpha(color, alpha, onChangeColor, onChangeAlpha) {
        const block = document.createElement('div')
        block.classList.add('color-alpha-block')
        const swatch = this.makeColorSwatch(color, (v) => {
            swatch.style.background = v
            checkerColor.style.background = v
            onChangeColor(v)
        })
        const bgRow = document.createElement('div')
        bgRow.classList.add('color-alpha-bg-row')

        const checkerWrap = document.createElement('div')
        checkerWrap.classList.add('color-alpha-checker')
        const checkerColor = document.createElement('div')
        checkerColor.classList.add('color-alpha-checker-fill')
        checkerColor.style.background = color
        checkerColor.style.opacity = alpha

        const colorInput = document.createElement('input')
        colorInput.type = 'color'
        colorInput.value = color
        colorInput.style.cssText = 'position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;'
        colorInput.addEventListener('input', () => {
            const v = colorInput.value
            checkerColor.style.background = v
            swatch.style.background = v
            onChangeColor(v)
        })

        checkerWrap.appendChild(checkerColor)
        checkerWrap.appendChild(colorInput)

        const sliderWrap = document.createElement('div')
        sliderWrap.classList.add('color-alpha-slider-wrap')

        const slider = document.createElement('input')
        const alphaVal = document.createElement('span')
        alphaVal.classList.add('alpha-value')

        const updateTrack = (v) => {
            slider.style.background = `linear-gradient(
            to right,
            rgba(0,0,0,0.6) 0%,
            rgba(0,0,0,0.6) ${v * 100}%,
            rgba(0,0,0,0.08) ${v * 100}%,
            rgba(0,0,0,0.08) 100%
        )`
            alphaVal.textContent = Math.round(v * 100) + '%'
            checkerColor.style.opacity = v
        }

        slider.type = 'range'
        slider.classList.add('alpha-slider')
        slider.min = 0
        slider.max = 1
        slider.step = 0.05
        slider.value = alpha
        updateTrack(alpha)

        slider.addEventListener('input', () => {
            const v = parseFloat(slider.value)
            updateTrack(v)
            onChangeAlpha(v)
        })

        sliderWrap.appendChild(slider)
        sliderWrap.appendChild(alphaVal)

        bgRow.appendChild(checkerWrap)
        bgRow.appendChild(sliderWrap)
        block.appendChild(bgRow)
        return block
    }

    makeGroup(title) {
        const g = document.createElement('div')
        g.classList.add('section-group')
        const t = document.createElement('div')
        t.classList.add('section-group-title')
        t.textContent = title
        g.appendChild(t)
        return g
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

    makeInput(type, value, opts = {}) {
        const input = document.createElement('input')
        input.type = type
        input.value = value
        input.classList.add('input-field')
        if (opts.min !== undefined) input.min = opts.min
        if (opts.name) input.name = opts.name
        if (opts.max !== undefined) input.max = opts.max
        if (opts.step !== undefined) input.step = opts.step
        if (opts.placeholder) input.placeholder = opts.placeholder
        if (opts.onChange)
            input.addEventListener('input', (e) => {
                e.stopPropagation()
                opts.onChange(input.value)
            })
        return input
    }

    makeSelect(options, value, onChange, opts = {}) {
        const select = document.createElement('select')
        select.classList.add('input-field', 'select-field')
        if (opts.name) select.name = opts.name
        options.forEach((opt) => {
            const el = document.createElement('option')
            el.value = el.textContent = opt
            if (opt === value) el.selected = true
            select.appendChild(el)
        })
        select.addEventListener('change', () => onChange(select.value))
        return select
    }

    makeColorSwatch(value, onChange) {
        const label = document.createElement('label')
        label.classList.add('color-swatch')
        label.style.background = value
        const input = document.createElement('input')
        input.type = 'color'
        input.value = value
        input.style.cssText =
            'position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);opacity:0;cursor:pointer;'
        input.addEventListener('input', () => {
            label.style.background = input.value
            onChange(input.value)
        })
        label.appendChild(input)
        return label
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

    makeIconBtn(svgPath, variant = '') {
        const btn = document.createElement('button')
        btn.classList.add('icon-btn')
        if (variant) btn.classList.add(variant)
        btn.innerHTML = svgPath
        return btn
    }
}
