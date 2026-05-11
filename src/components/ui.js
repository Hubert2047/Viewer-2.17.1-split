function makeRow(labelText, className) {
    const row = document.createElement('div')
    row.classList.add('section-group-row')
    if (className) {
        row.classList.add(className)
    }
    const label = document.createElement('span')
    label.textContent = labelText
    row.appendChild(label)
    return row
}
function makeSectionWrap(otps = {}) {
    const container = document.createElement('div')
    container.classList.add('section-wrap')
    if (otps.className) {
        container.classList.add(otps.className)
    }
    return container
}
const makeSectionGroup = (title, hint) => {
    const group = document.createElement('div')
    group.classList.add('section-group')
    if (title) {
        const titleRow = document.createElement('div')
        titleRow.classList.add('section-group-title')

        const titleText = document.createElement('span')
        titleText.style.cssText = 'position:relative;'
        titleText.textContent = title
        titleRow.appendChild(titleText)

        if (hint) {
            const icon = document.createElement('div')
            icon.classList.add('hint-icon', 'info-icon')
            icon.innerHTML = ICONS.hintInfo

            const tooltip = document.createElement('div')
            tooltip.classList.add('hint-tooltip')
            tooltip.innerHTML = hint

            icon.appendChild(tooltip)
            titleText.appendChild(icon)
        }
        group.appendChild(titleRow)
    }

    return group
}

function makeColorAlpha({ color, alpha, onChangeColor, onChangeAlpha, disabled = false, debounceMs = 150 }) {
    const block = document.createElement('div')
    block.classList.add('color-alpha-block')

    const swatch = makeColorSwatch(color, (v) => {
        if (disabled) return
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

    let colorDebounce = null
    let alphaDebounce = null
    const colorInput = document.createElement('input')
    colorInput.type = 'color'
    colorInput.value = color
    colorInput.style.cssText = 'position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;'
    colorInput.addEventListener('input', () => {
        if (disabled) return
        const v = colorInput.value
        checkerColor.style.background = v
        swatch.style.background = v

        clearTimeout(colorDebounce)
        colorDebounce = setTimeout(() => onChangeColor(v), debounceMs)
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
        if (disabled) return
        const v = parseFloat(slider.value)
        updateTrack(v)

        clearTimeout(alphaDebounce)
        alphaDebounce = setTimeout(() => onChangeAlpha(v), debounceMs)
    })

    sliderWrap.appendChild(slider)
    sliderWrap.appendChild(alphaVal)
    bgRow.appendChild(checkerWrap)
    bgRow.appendChild(sliderWrap)
    block.appendChild(bgRow)

    const applyDisabled = (val) => {
        disabled = val
        colorInput.disabled = val
        slider.disabled = val
        block.classList.toggle('color-alpha-disabled', val)
        colorInput.style.cursor = val ? 'not-allowed' : 'pointer'
    }

    const setColor = (val) => {
        colorInput.value = val
        checkerColor.style.background = val
        swatch.style.background = val
    }

    const setAlpha = (val) => {
        slider.value = val
        updateTrack(val)
    }

    applyDisabled(disabled)

    block.setDisabled = (val) => applyDisabled(val)
    block.setColor = (val) => setColor(val)
    block.setAlpha = (val) => setAlpha(val)

    return block
}
function makeLink({ text, href = '#', className = 'export-link-btn', onClick } = {}) {
    const el = document.createElement('a')
    el.classList.add('link-btn')
    if (className) el.classList.add(className)
    el.textContent = text
    el.href = href
    if (onClick) {
        el.addEventListener('click', (e) => {
            e.preventDefault()
            onClick(e)
        })
    }
    return el
}
function makeToggle(initialValue, onChange) {
    let value = initialValue

    const wrap = document.createElement('div')
    wrap.classList.add('audio-toggle-wrap')

    const toggle = document.createElement('div')
    toggle.classList.add('toggle')
    if (value) toggle.classList.add('active')

    const knob = document.createElement('div')
    knob.classList.add('toggle-knob')
    toggle.appendChild(knob)

    toggle.addEventListener('click', () => {
        value = !value
        toggle.classList.toggle('active', value)
        onChange(value)
    })

    wrap.appendChild(toggle)
    wrap.setValue = (newVal) => {
        value = newVal
        toggle.classList.toggle('active', value)
    }
    return wrap
}
function makeColorPicker({ label, defaultValue, onChange, disabled = false, debounceMs = 300 }) {
    const row = makeRow(label)
    const input = document.createElement('input')
    input.type = 'color'
    input.classList.add('color-input', 'background-input')
    input.value = defaultValue

    let debounceTimer = null

    input.addEventListener('input', (e) => {
        if (disabled) return
        const newColor = e.target.value
        input.value = newColor

        if (onChange) {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => {
                onChange(newColor)
            }, debounceMs)
        }
    })

    const applyDisabled = (val) => {
        disabled = val
        input.disabled = val
        input.classList.toggle('color-picker-disabled', val)
    }
    applyDisabled(disabled)
    row.appendChild(input)
    row.setDisabled = (val) => applyDisabled(val)
    return { row, input, setDisabled: (val) => applyDisabled(val) }
}
function makeSegmentRow({ options, className, defaultValue, onChange }) {
    const row = document.createElement('div')
    if (className) row.classList.add(className)
    row.classList.add('segment-row')

    options.forEach(({ label, value, icon }) => {
        const btn = document.createElement('div')
        btn.classList.add('btn', 'segment-btn')
        btn.innerHTML = icon ? icon : label
        btn.dataset.value = value
        if (value === defaultValue) btn.classList.add('active')
        btn.onclick = () => {
            row.querySelectorAll('.segment-btn').forEach((b) => b.classList.remove('active'))
            btn.classList.add('active')
            onChange(value)
        }
        row.appendChild(btn)
    })

    row.setValue = (value) => {
        row.querySelectorAll('.segment-btn').forEach((b) => {
            b.classList.toggle('active', b.dataset.value === String(value))
        })
    }

    return row
}
function makeSlider({ min, max, step = 0.1, value, className, variant = 'default', onChange } = {}) {
    const slider = document.createElement('input')
    slider.type = 'range'
    slider.min = min
    slider.max = max
    slider.step = step

    let internalValue = value ?? 0
    slider.value = internalValue

    if (className) {
        slider.classList.add(...className.trim().split(/\s+/))
    }

    const updateProgress = (v) => {
        if (variant !== 'progress') return

        slider.style.background = `
            linear-gradient(
                to right,
                #f95f4d 0%,
                #f95f4d ${v * 100}%,
                rgba(0,0,0,0.1) ${v * 100}%,
                rgba(0,0,0,0.1) 100%
            )
        `
    }

    updateProgress(internalValue)

    const setValue = (v, trigger = false) => {
        internalValue = v
        slider.value = v
        updateProgress(v)

        if (trigger && onChange) {
            onChange(v)
        }
    }

    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value)
        setValue(v, true)
    })

    slider.setValue = setValue
    slider.getValue = () => internalValue

    return slider
}
function makeColorSwatch(value, onChange) {
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
function makeTextarea(value, opts = {}) {
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
function makeDivider() {
    const el = document.createElement('div')
    el.style.cssText = 'border-top:0.5px solid rgba(0,0,0,0.08); margin:2px 0;'
    return el
}
function makeButton({ icon, title, className, id, onClick, onHold = false }) {
    const btn = document.createElement('button')
    btn.classList.add('btn')
    if (id) btn.id = id
    if (className) {
        btn.classList.add(...className.trim().split(/\s+/))
    }
    if (title) btn.title = title
    btn.innerHTML = icon ? icon : title
    if (onHold) {
        let interval = null
        let timeout = null

        const start = (e) => {
            onClick?.(e)
            timeout = setTimeout(() => {
                interval = setInterval(() => onClick?.(e), 80)
            }, 400)
        }

        const stop = () => {
            clearTimeout(timeout)
            clearInterval(interval)
            timeout = null
            interval = null
        }

        btn.addEventListener('mousedown', (e) => start(e))
        btn.addEventListener('mouseup', stop)
        btn.addEventListener('mouseleave', stop)

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault()
            start(e)
        })
        btn.addEventListener('touchend', stop)
    } else {
        if (onClick) btn.addEventListener('click', (e) => onClick(e))
    }
    return btn
}

function makeInput(type, value, opts = {}) {
    const input = document.createElement('input')
    input.type = type
    input.value = value
    input.classList.add('input-field')
    if (opts.className) {
        input.classList.add(...opts.className.trim().split(/\s+/))
    }
    if (opts.min !== undefined) input.min = opts.min
    if (opts.name) input.name = opts.name
    if (opts.max !== undefined) input.max = opts.max
    if (opts.step !== undefined) input.step = opts.step
    if (opts.placeholder) input.placeholder = opts.placeholder
    if (opts.disabled) input.disabled = true
    if (opts.onChange)
        input.addEventListener('input', (e) => {
            e.stopPropagation()
            opts.onChange(input.value)
        })
    return input
}
function makeSelect(options, value, onChange, opts = {}) {
    const select = document.createElement('select')
    select.classList.add('input-field', 'select-field')
    if (opts.name) select.name = opts.name
    if (opts.className) select.classList.add(opts.className)
    options.forEach((opt) => {
        const el = document.createElement('option')
        el.value = el.textContent = opt
        if (opt === value) el.selected = true
        select.appendChild(el)
    })
    select.addEventListener('change', () => onChange(select.value))
    return select
}
function makeTabs({ tabs, width = 100, height = 100, onTabChange }) {
    const container = document.createElement('div')
    container.className = 'tab-container'
    container.style.cssText = `width: ${width}px; height : ${height}px`

    const header = document.createElement('div')
    header.className = 'tab-header'
    container.setActiveTab = (index) => render(index)
    const content = document.createElement('div')
    content.className = 'tab-content'

    const render = (index) => {
        // clear active UI
        header.querySelectorAll('.tab-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index)
        })

        // clear content
        content.innerHTML = ''
        const tab = tabs[index]

        const result = typeof tab.content === 'function' ? tab.content() : tab.content

        if (result instanceof HTMLElement) {
            content.appendChild(result)
        } else {
            content.innerHTML = result
        }
        onTabChange?.(index, tab)
    }

    tabs.forEach((tab, index) => {
        const btn = document.createElement('div')
        btn.className = 'tab-btn'
        btn.textContent = tab.label

        btn.addEventListener('click', () => render(index))

        header.appendChild(btn)
    })

    container.appendChild(header)
    container.appendChild(content)

    render(0)

    return container
}
function makeVec3Inputs({
    title = '',
    defaultValues = { x: 0, y: 0, z: 0 },
    disabled = true,
    step = '1',
    onChange,
    onFocus,
} = {}) {
    const AXIS = ['x', 'y', 'z']
    const COLORS = { x: '#e85555', y: '#55cc55', z: '#5588ff' }
    const inputEls = {}

    const row = document.createElement('div')
    row.classList.add('vec-inputs')

    AXIS.forEach((axis) => {
        const col = document.createElement('div')
        col.classList.add('axis-col')

        const label = document.createElement('span')
        label.classList.add('axis-label')
        label.textContent = axis.toUpperCase()
        label.style.color = COLORS[axis]

        const input = document.createElement('input')
        input.type = 'number'
        input.value = defaultValues[axis].toFixed(1)
        input.step = step
        input.disabled = true

        input.addEventListener('focus', () => {
            onFocus?.()
        })

        input.addEventListener('input', () => {
            onChange?.({
                x: parseFloat(inputEls.x.value) || 0,
                y: parseFloat(inputEls.y.value) || 0,
                z: parseFloat(inputEls.z.value) || 0,
            })
        })

        col.appendChild(label)
        col.appendChild(input)
        row.appendChild(col)
        inputEls[axis] = input
    })

    const setDisabled = (on) => {
        AXIS.forEach((axis) => {
            const el = inputEls[axis]
            el.disabled = on
            el.style.border = !on ? `0.5px solid ${COLORS[axis]}88` : '0.5px solid rgba(0,0,0,0.13)'
            el.style.background = !on ? '#fff' : 'rgba(0,0,0,0.04)'
            el.style.color = !on ? '#2d3748' : 'rgba(0,0,0,0.3)'
            el.style.cursor = !on ? 'text' : 'not-allowed'
        })
    }
    setDisabled(disabled)

    const setValues = ({ x, y, z }) => {
        inputEls.x.value = x.toFixed(1)
        inputEls.y.value = y.toFixed(1)
        inputEls.z.value = z.toFixed(1)
    }

    const wrapper = document.createElement('div')
    wrapper.classList.add('section-group-row', 'vec-row')

    if (title) {
        const titleEl = document.createElement('span')
        titleEl.textContent = title
        titleEl.classList.add('vec3-input-label')
        wrapper.appendChild(titleEl)
    }

    wrapper.appendChild(row)

    return { row: wrapper, setDisabled, setValues }
}
function makeDownloadHelper(steps) {
    const container = document.createElement('div')
    container.style.cssText = `
    font-family: Arial, sans-serif;
    padding: 16px 24px;
    color: #2d3748;
    font-size: 14px;
    line-height: 1.6;
  `

    // Title
    const title = document.createElement('p')
    title.style.cssText = `margin: 0 0 16px 0; color: #2d3748; text-align: left;`
    title.textContent = steps.title || ''
    container.appendChild(title)

    // Steps list
    const ol = document.createElement('ol')
    ol.style.cssText = `
    margin: 0;
    padding: 0 0 0 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    list-style: decimal;
    text-align: left;
  `
    ;(steps.items || []).forEach((item) => {
        const li = document.createElement('li')
        li.style.cssText = `padding-left: 8px; color: #2d3748; text-align: left;`

        const [mainText, ...subItems] = item.split('\n')
        const mainHtml = mainText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        li.innerHTML = mainHtml

        if (subItems.length > 0) {
            const ul = document.createElement('ul')
            ul.style.cssText = `margin: 6px 0 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; list-style: disc;`
            subItems.forEach((sub) => {
                const subLi = document.createElement('li')
                subLi.style.cssText = `color: #2d3748;`
                subLi.innerHTML = sub.replace(/^•\s*/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                ul.appendChild(subLi)
            })
            li.appendChild(ul)
        }

        ol.appendChild(li)
    })

    container.appendChild(ol)
    return container
}

class ConfirmDialog {
    constructor() {
        this._resolve = null
        this._build()
    }

    _build() {
        this.overlay = document.createElement('div')
        this.overlay.style.display = 'none'
        this.overlay.classList.add('confirm-dialog-overlay')

        const box = document.createElement('div')
        box.classList.add('confirm-dialog-box')
        this.titleEl = document.createElement('div')
        this.titleEl.classList.add('confirm-title')
        this.msgEl = document.createElement('div')
        this.msgEl.classList.add('confirm-msg')
        const btnRow = document.createElement('div')
        btnRow.classList.add('confirm-btn-row')
        this.cancelBtn = document.createElement('button')
        this.cancelBtn.textContent = 'Cancel'
        this.cancelBtn.classList.add('confirm-cancel-btn', 'cancel-btn', 'btn')

        this.confirmBtn = document.createElement('button')
        this.confirmBtn.textContent = 'Delete'
        this.confirmBtn.classList.add('confirm-accept-btn', 'confirm-btn', 'btn')
        this.confirmBtn.style.background = '#c0392b'

        btnRow.appendChild(this.cancelBtn)
        btnRow.appendChild(this.confirmBtn)
        box.appendChild(this.titleEl)
        box.appendChild(this.msgEl)
        box.appendChild(btnRow)
        this.overlay.appendChild(box)
        document.body.appendChild(this.overlay)

        this.confirmBtn.addEventListener('click', () => this._close(true))
        this.cancelBtn.addEventListener('click', () => this._close(false))
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this._close(false)
        })
    }

    _close(result) {
        this.overlay.style.display = 'none'
        this._resolve?.(result)
        this._resolve = null
    }

    ask({title, message, variant = 'default', position = 'center', confirmText = null}) {
        this.titleEl.textContent = title
        this.msgEl.textContent = message
        this.overlay.style.display = 'flex'

        this.overlay.style.alignItems = position === 'top' ? 'flex-start' : 'center'
        this.overlay.style.paddingTop = position === 'top' ? '80px' : '0'

        switch (variant) {
            case 'delete':
                this.confirmBtn.style.background = '#c0392b'
                this.confirmBtn.textContent = confirmText ?? 'Delete'
                break
            case 'edit':
                this.confirmBtn.style.background = '#3498db'
                this.confirmBtn.textContent = confirmText ?? 'Confirm'
                break
            default:
                this.confirmBtn.style.background = '#27ae60'
                this.confirmBtn.textContent = confirmText ?? 'OK'
        }

        return new Promise((res) => (this._resolve = res))
    }
}
class ModalDialog {
    constructor() {
        this._resolve = null
        this._build()
    }

    _build() {
        this.overlay = document.createElement('div')
        this.overlay.className = 'md-overlay'

        const modal = document.createElement('div')
        modal.className = 'md-modal'
        this.modal = modal

        this.titleEl = document.createElement('div')
        this.titleEl.className = 'md-title'

        this.msgEl = document.createElement('div')
        this.msgEl.className = 'md-message'

        this.actions = document.createElement('div')
        this.actions.className = 'md-actions'

        this.cancelBtn = document.createElement('button')
        this.cancelBtn.className = 'md-btn cancel'
        this.cancelBtn.textContent = 'Cancel'

        this.okBtn = document.createElement('button')
        this.okBtn.className = 'md-btn ok'
        this.okBtn.textContent = 'OK'

        this.actions.appendChild(this.cancelBtn)
        this.actions.appendChild(this.okBtn)

        modal.appendChild(this.titleEl)
        modal.appendChild(this.msgEl)
        modal.appendChild(this.actions)

        this.overlay.appendChild(modal)
        document.body.appendChild(this.overlay)

        this.cancelBtn.onclick = () => this._close(false)
        this.okBtn.onclick = () => this._close(true)

        this.overlay.onclick = (e) => {
            if (e.target === this.overlay) this._close(false)
        }
    }

    _close(result) {
        this.overlay.classList.remove('show')
        this._resolve?.(result)
        this._resolve = null
    }

    open(title, message, position = 'center', options = {}) {
        const { showCancel = true, cancelText = 'Cancel', okText = 'OK' } = options

        this.titleEl.innerHTML = title
        this.msgEl.innerHTML = ''

        if (typeof message === 'string') {
            this.msgEl.innerHTML = message
        } else if (message instanceof HTMLElement) {
            this.msgEl.appendChild(message)
        } else if (typeof message === 'function') {
            const result = message()
            if (result instanceof HTMLElement) {
                this.msgEl.appendChild(result)
            } else {
                this.msgEl.innerHTML = result
            }
        }

        // reset actions
        this.actions.innerHTML = ''

        // OK button
        this.okBtn = document.createElement('button')
        this.okBtn.className = 'md-btn ok'
        this.okBtn.textContent = okText
        this.okBtn.onclick = () => this._close(true)

        this.actions.appendChild(this.okBtn)

        // Cancel optional
        if (showCancel) {
            this.cancelBtn = document.createElement('button')
            this.cancelBtn.className = 'md-btn cancel'
            this.cancelBtn.textContent = cancelText
            this.cancelBtn.onclick = () => this._close(false)
            this.actions.appendChild(this.cancelBtn)
        }

        this.modal.appendChild(this.actions)

        this.overlay.classList.remove('top', 'center', 'bottom')
        this.modal.classList.add(position)

        this.overlay.classList.add('show')

        return new Promise((res) => (this._resolve = res))
    }
}
