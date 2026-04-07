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
        this.activeHotspotData = null
        this.listEl = null
        this.countEl = null
        
        this.events.on('controllers:created', (controllers) => {
            this.controllers = controllers
        })
    }

    mount() {
        this.renderHeader()
        this.listEl = document.createElement('div')
        this.listEl.classList.add('hotspot-list')
        this.body.appendChild(this.listEl)
    }

    // ── Header ───────────────────────────────
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
        addBtn.classList.add('hotspot-add-btn')
        addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg> Add`
        addBtn.addEventListener('click', () => this.onAdd())

        header.appendChild(titleGroup)
        header.appendChild(addBtn)
        this.body.appendChild(header)
    }

    // ── Actions ──────────────────────────────
    onAdd() {
        document.body.style.cursor = 'crosshair'
        this.isCreatingHotspot = true
         this.events.fire('hotspot:editing', true)
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
        })
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

    // ── Render list ──────────────────────────
    render(hotspotData, activeHotspotData) {
        this.activeHotspotData = activeHotspotData ? JSON.parse(JSON.stringify(activeHotspotData)) : null
        this.listEl.innerHTML = ''
        this.countEl.textContent = `${hotspotData.length} hotspot${hotspotData.length !== 1 ? 's' : ''} configured`
        hotspotData.forEach((h) => {
            const isExpanded = this.activeHotspotData?.id === h.id
            const item = document.createElement('div')
            item.classList.add('hotspot-item')
            if (isExpanded) item.classList.add('expanded')
            const { row, headerTitle } = this.renderItemHeader(h, isExpanded)
            item.appendChild(row)
            if (isExpanded) item.appendChild(this.renderEditPanel(headerTitle))
            this.listEl.appendChild(item)
        })
    }

    renderItemHeader(h, isExpanded) {
        const row = document.createElement('div')
        row.classList.add('hotspot-header')

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
    applyDraft = () => {
        this.events.fire('hotspot:editor-changed', this.activeHotspotData)
    }
    renderEditPanel(headerTitle) {
        const panel = document.createElement('div')
        panel.classList.add('hotspot-edit-panel')
        // GROUP: Text
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

        const colorGrid = this.makeGrid(3)
        colorGrid.style.marginTop = '7px'
        const colorField = this.makeField('Color')
        colorField.appendChild(
            this.makeColorSwatch(this.activeHotspotData.text.color, (v) => {
                this.activeHotspotData.text.color = v
                this.applyDraft()
            }),
        )
        const bgField = this.makeField('Background')
        bgField.appendChild(
            this.makeColorSwatch(this.activeHotspotData.text.background, (v) => {
                this.activeHotspotData.text.background = v
                this.applyDraft()
            }),
        )
        const alphaField = this.makeField('Alpha')
        alphaField.appendChild(
            this.makeInput('number', this.activeHotspotData.text.backgroundAlpha, {
                min: 0,
                max: 1,
                step: 0.1,
                name: 'anpha',
                onChange: (v) => {
                    this.activeHotspotData.text.backgroundAlpha = parseFloat(v)
                    this.applyDraft()
                },
            }),
        )
        colorGrid.appendChild(colorField)
        colorGrid.appendChild(bgField)
        colorGrid.appendChild(alphaField)
        textGroup.appendChild(colorGrid)

        const fontGrid = this.makeGrid(2)
        fontGrid.style.marginTop = '7px'
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
                {
                    name: 'font-family',
                },
            ),
        )
        fontGrid.appendChild(fontSizeField)
        fontGrid.appendChild(fontFamilyField)
        textGroup.appendChild(fontGrid)
        panel.appendChild(textGroup)

        // GROUP: Hotspot
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
        dotGrid.style.marginTop = '7px'
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
        strokeColorField.style.marginTop = '7px'
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

        // hotspotGroup.appendChild(strokeColorField)
        panel.appendChild(hotspotGroup)

        // GROUP: Auto Play
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

        autoplayGrid.appendChild(autoPlayGroup)
        buttonGrid.appendChild(buttonGroup)
        panel.appendChild(autoplayGrid)
        panel.appendChild(buttonGrid)

        // Apply / Cancel
        const applyRow = document.createElement('div')
        applyRow.style.cssText = 'display:flex; gap:6px;'

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
        applyBtn.addEventListener('click',()=> this.onApply())

        applyRow.appendChild(applyBtn)
        applyRow.appendChild(cancelBtn)
        panel.appendChild(applyRow)
        return panel
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
    makeGroup(title) {
        const g = document.createElement('div')
        g.classList.add('hotspot-group')
        const t = document.createElement('div')
        t.classList.add('hotspot-group-title')
        t.textContent = title
        g.appendChild(t)
        return g
    }

    makeField(label) {
        const wrap = document.createElement('div')
        wrap.classList.add('hotspot-field')
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
