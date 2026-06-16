function makeColorPickerDropdown({
    label,
    color = '#FF0000',
    alpha = 255,
    hasAlpha = false,
    disabled = false,
    debounceMs = 80,
    onChange,
} = {}) {
    function hsvToRgb(h, s, v) {
        h = h % 360
        s /= 100
        v /= 100
        const c = v * s,
            x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
            m = v - c
        let r, g, b
        if (h < 60) {
            r = c
            g = x
            b = 0
        } else if (h < 120) {
            r = x
            g = c
            b = 0
        } else if (h < 180) {
            r = 0
            g = c
            b = x
        } else if (h < 240) {
            r = 0
            g = x
            b = c
        } else if (h < 300) {
            r = x
            g = 0
            b = c
        } else {
            r = c
            g = 0
            b = x
        }
        return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
    }

    function rgbToHsv(r, g, b) {
        r /= 255
        g /= 255
        b /= 255
        const mx = Math.max(r, g, b),
            mn = Math.min(r, g, b),
            d = mx - mn
        let h
        const s = mx === 0 ? 0 : d / mx,
            v = mx
        if (d === 0) h = 0
        else if (mx === r) h = ((g - b) / d) % 6
        else if (mx === g) h = (b - r) / d + 2
        else h = (r - g) / d + 4
        h = Math.round(h * 60)
        if (h < 0) h += 360
        return [h, Math.round(s * 100), Math.round(v * 100)]
    }

    function hexToRgb(hex) {
        hex = hex.replace('#', '')
        return [
            parseInt(hex.slice(0, 2), 16) || 0,
            parseInt(hex.slice(2, 4), 16) || 0,
            parseInt(hex.slice(4, 6), 16) || 0,
        ]
    }

    function toHex2(n) {
        return Math.round(Math.max(0, Math.min(255, n)))
            .toString(16)
            .padStart(2, '0')
            .toUpperCase()
    }
    function resolveColor(colorStr) {
        if (/^#?[0-9a-fA-F]{6,8}$/.test(colorStr.trim())) {
            return colorStr.startsWith('#') ? colorStr : '#' + colorStr
        }
        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = tempCanvas.height = 1
        const tempCtx = tempCanvas.getContext('2d')
        tempCtx.fillStyle = colorStr
        tempCtx.fillRect(0, 0, 1, 1)
        const [r, g, b] = tempCtx.getImageData(0, 0, 1, 1).data
        return '#' + [r, g, b].map(toHex2).join('')
    }

    function buildRgba(r, g, b, a) {
        return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
    }
    const resolvedColor = resolveColor(color)
    const [initR, initG, initB] = hexToRgb(resolvedColor)
    let [hue, sat, val] = rgbToHsv(initR, initG, initB)
    let alphaVal = hasAlpha ? alpha : 255
    let curX = (sat / 100) * 228
    let curY = (1 - val / 100) * 140
    let isDisabled = disabled
    let isOpen = false
    let debounceTimer = null

    function el(tag, cls) {
        const e = document.createElement(tag)
        if (cls) e.className = cls
        return e
    }

    const row = el('div', 'section-group-row cpd-row')
    const labelEl = el('span', 'label')
    labelEl.textContent = label
    row.appendChild(labelEl)

    const trigger = el('div', 'cpd-trigger')
    const swatchOuter = el('div', 'cpd-swatch-outer' + (hasAlpha ? ' cpd-checker' : ''))
    const swatchFill = el('div', 'cpd-swatch-fill')
    swatchOuter.appendChild(swatchFill)
    trigger.appendChild(swatchOuter)

    const hexLabel = el('span', 'cpd-hex-label')
    trigger.appendChild(hexLabel)

    const arrow = el('span', 'cpd-arrow')
    arrow.textContent = '▾'
    trigger.appendChild(arrow)
    row.appendChild(trigger)

    const dropdown = el('div', 'cpd-dropdown')
    dropdown.style.display = 'none'

    const canvasWrap = el('div', 'cpd-canvas-wrap')
    const canvas = el('canvas')
    canvas.width = 228
    canvas.height = 140
    const ctx = canvas.getContext('2d')
    const cursor = el('div', 'cpd-cursor')
    canvasWrap.appendChild(canvas)
    canvasWrap.appendChild(cursor)
    dropdown.appendChild(canvasWrap)

    const barRow = el('div', 'cpd-bar-row')
    const bigSwatch = el('div', 'cpd-big-swatch' + (hasAlpha ? ' cpd-checker' : ''))
    const bigSwatchFill = el('div', 'cpd-swatch-fill')
    bigSwatch.appendChild(bigSwatchFill)
    barRow.appendChild(bigSwatch)

    const barsCol = el('div', 'cpd-bars-col')
    const hueBar = el('div', 'cpd-hue-bar')
    const hueThumb = el('div', 'cpd-bar-thumb')
    hueBar.appendChild(hueThumb)
    barsCol.appendChild(hueBar)

    let alphaBar = null,
        alphaTrack = null,
        alphaThumb = null
    if (hasAlpha) {
        alphaBar = el('div', 'cpd-alpha-bar')
        const alphaBg = el('div', 'cpd-alpha-bg')
        alphaTrack = el('div', 'cpd-alpha-track')
        alphaThumb = el('div', 'cpd-bar-thumb')
        alphaBar.appendChild(alphaBg)
        alphaBar.appendChild(alphaTrack)
        alphaBar.appendChild(alphaThumb)
        barsCol.appendChild(alphaBar)
    }

    barRow.appendChild(barsCol)
    dropdown.appendChild(barRow)

    const fields = el('div', 'cpd-fields')
    const uid = '_' + Math.random().toString(36).slice(2, 7)

    function makeField(id, lbl, maxlen, wide) {
        const wrap = el('div', 'cpd-field' + (wide ? ' cpd-field-wide' : ''))
        const inp = el('input')
        inp.id = id
        inp.maxLength = maxlen
        inp.type = 'text'
        const fl = el('div', 'cpd-field-label')
        fl.textContent = lbl
        wrap.appendChild(inp)
        wrap.appendChild(fl)
        fields.appendChild(wrap)
        return inp
    }

    const rInp = makeField('cpd-r' + uid, 'r', 3)
    const gInp = makeField('cpd-g' + uid, 'g', 3)
    const bInp = makeField('cpd-b' + uid, 'b', 3)
    const aInp = hasAlpha ? makeField('cpd-a' + uid, 'a', 3) : null
    const hxInp = makeField('cpd-hx' + uid, '#', hasAlpha ? 8 : 6, true)

    dropdown.appendChild(fields)
    document.body.appendChild(dropdown)

    function drawCanvas() {
        const [rh, gh, bh] = hsvToRgb(hue, 100, 100)
        const g1 = ctx.createLinearGradient(0, 0, 228, 0)
        g1.addColorStop(0, '#ffffff')
        g1.addColorStop(1, `rgb(${rh},${gh},${bh})`)
        ctx.fillStyle = g1
        ctx.fillRect(0, 0, 228, 140)
        const g2 = ctx.createLinearGradient(0, 0, 0, 140)
        g2.addColorStop(0, 'rgba(0,0,0,0)')
        g2.addColorStop(1, '#000000')
        ctx.fillStyle = g2
        ctx.fillRect(0, 0, 228, 140)
    }

    function syncUI() {
        const [r, g, b] = hsvToRgb(hue, sat, val)
        const hex6 = toHex2(r) + toHex2(g) + toHex2(b)
        const colorStr = buildRgba(r, g, b, alphaVal)

        cursor.style.left = Math.max(HALF_C, Math.min(228 - HALF_C, curX)) + 'px'
        cursor.style.top = Math.max(HALF_C, Math.min(140 - HALF_C, curY)) + 'px'
        const HALF_T = 3
        const huePercent = (hue / 360) * 100
        hueThumb.style.left = `clamp(${HALF_T}px, ${huePercent}%, calc(100% - ${HALF_T}px))`

        if (hasAlpha && alphaBar) {
            alphaTrack.style.background = `linear-gradient(to right,rgba(${r},${g},${b},0),rgb(${r},${g},${b}))`
            const alphaPercent = (alphaVal / 255) * 100
            alphaThumb.style.left = `clamp(${HALF_T}px, ${alphaPercent}%, calc(100% - ${HALF_T}px))`
        }

        swatchFill.style.background = colorStr
        bigSwatchFill.style.background = colorStr
        hexLabel.textContent = '#' + hex6
        rInp.value = r
        gInp.value = g
        bInp.value = b
        if (hasAlpha && aInp) aInp.value = alphaVal
        hxInp.value = hasAlpha ? hex6 + toHex2(alphaVal) : hex6

        drawCanvas()
    }

    function fireChange() {
        if (!onChange) return
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
            const [r, g, b] = hsvToRgb(hue, sat, val)
            const hex6 = toHex2(r) + toHex2(g) + toHex2(b)
            onChange({ hex: '#' + hex6, r, g, b, alpha: alphaVal, rgba: buildRgba(r, g, b, alphaVal) })
        }, debounceMs)
    }

    const CURSOR_SIZE = 14
    const HALF_C = CURSOR_SIZE / 2

    function pickSatVal(e) {
        if (isDisabled) return
        const rect = canvas.getBoundingClientRect()
        const rawX = e.clientX - rect.left
        const rawY = e.clientY - rect.top

        sat = Math.round(Math.max(0, Math.min(1, rawX / 228)) * 100)
        val = Math.round(Math.max(0, Math.min(1, 1 - rawY / 140)) * 100)

        curX = Math.max(0, Math.min(228, rawX))
        curY = Math.max(0, Math.min(140, rawY))

        syncUI()
        fireChange()
    }

    function pickHue(e) {
        if (isDisabled) return
        const rect = hueBar.getBoundingClientRect()
        hue = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 360)
        syncUI()
        fireChange()
    }

    function pickAlpha(e) {
        if (!hasAlpha || isDisabled) return
        const rect = alphaBar.getBoundingClientRect()
        alphaVal = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 255)
        syncUI()
        fireChange()
    }

    canvasWrap.addEventListener('pointerdown', (e) => {
        canvasWrap.setPointerCapture(e.pointerId)
        canvasWrap.style.cursor = 'crosshair'
        pickSatVal(e)
    })
    canvasWrap.addEventListener('pointermove', (e) => {
        if (e.buttons === 0) return
        pickSatVal(e)
    })
    canvasWrap.addEventListener('pointerup', () => {
        canvasWrap.style.cursor = 'crosshair'
    })

    hueBar.addEventListener('pointerdown', (e) => {
        hueBar.setPointerCapture(e.pointerId)
        hueBar.style.cursor = 'grabbing'
        pickHue(e)
    })
    hueBar.addEventListener('pointermove', (e) => {
        if (e.buttons === 0) return
        pickHue(e)
    })
    hueBar.addEventListener('pointerup', () => {
        hueBar.style.cursor = 'pointer'
    })

    if (hasAlpha && alphaBar) {
        alphaBar.addEventListener('pointerdown', (e) => {
            alphaBar.setPointerCapture(e.pointerId)
            alphaBar.style.cursor = 'grabbing'
            pickAlpha(e)
        })
        alphaBar.addEventListener('pointermove', (e) => {
            if (e.buttons === 0) return
            pickAlpha(e)
        })
        alphaBar.addEventListener('pointerup', () => {
            alphaBar.style.cursor = 'pointer'
        })
    }

    function rgbFieldChanged() {
        if (isDisabled) return
        const [h2, s2, v2] = rgbToHsv(
            Math.max(0, Math.min(255, +rInp.value || 0)),
            Math.max(0, Math.min(255, +gInp.value || 0)),
            Math.max(0, Math.min(255, +bInp.value || 0)),
        )
        hue = h2
        sat = s2
        val = v2
        curX = (sat / 100) * 228
        curY = (1 - val / 100) * 140
        syncUI()
        fireChange()
    }
    rInp.addEventListener('input', rgbFieldChanged)
    gInp.addEventListener('input', rgbFieldChanged)
    bInp.addEventListener('input', rgbFieldChanged)

    if (hasAlpha && aInp) {
        aInp.addEventListener('input', () => {
            if (isDisabled) return
            alphaVal = Math.max(0, Math.min(255, +aInp.value || 0))
            syncUI()
            fireChange()
        })
    }

    hxInp.addEventListener('change', () => {
        if (isDisabled) return
        const v = hxInp.value.replace('#', '')
        if (v.length < 6) return
        const [r, g, b] = hexToRgb(v)
        if (hasAlpha && v.length === 8) alphaVal = parseInt(v.slice(6, 8), 16) || 255
        const [h2, s2, v2] = rgbToHsv(r, g, b)
        hue = h2
        sat = s2
        val = v2
        curX = (sat / 100) * 228
        curY = (1 - val / 100) * 140
        syncUI()
        fireChange()
    })

    function positionDropdown() {
        const rect = trigger.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) {
            closeDropdown()
            return
        }
        const dropW = 252
        const dropH = hasAlpha ? 290 : 255
        dropdown.style.position = 'fixed'
        dropdown.style.width = dropW + 'px'
        dropdown.style.margin = '0'

        let left = rect.left
        if (left + dropW > window.innerWidth - 8) left = window.innerWidth - dropW - 8
        if (left < 8) left = 8
        dropdown.style.left = left + 'px'

        if (window.innerHeight - rect.bottom < dropH && rect.top > dropH) {
            dropdown.style.top = 'auto'
            dropdown.style.bottom = window.innerHeight - rect.top + 4 + 'px'
        } else {
            dropdown.style.top = rect.bottom + 4 + 'px'
            dropdown.style.bottom = 'auto'
        }
    }

    function openDropdown() {
        document.querySelectorAll('.cpd-dropdown').forEach((d) => {
            if (d !== dropdown) d.style.display = 'none'
        })
        document.querySelectorAll('.cpd-trigger').forEach((t) => {
            if (t !== trigger) {
                t.classList.remove('cpd-open')
                t.querySelector('.cpd-arrow').style.transform = ''
            }
        })
        dropdown.style.display = 'block'
        positionDropdown()
        arrow.style.transform = 'rotate(180deg)'
        trigger.classList.add('cpd-open')
        isOpen = true
        drawCanvas()
    }

    function closeDropdown() {
        dropdown.style.display = 'none'
        arrow.style.transform = ''
        trigger.classList.remove('cpd-open')
        isOpen = false
    }

    trigger.addEventListener('click', (e) => {
        if (isDisabled) return
        e.stopPropagation()
        isOpen ? closeDropdown() : openDropdown()
    })
    dropdown.addEventListener('click', (e) => e.stopPropagation())
    document.addEventListener('click', closeDropdown)
    window.addEventListener(
        'scroll',
        () => {
            if (isOpen) positionDropdown()
        },
        true,
    )
    window.addEventListener('resize', () => {
        if (isOpen) positionDropdown()
    })

    function setColor(hex) {
        const [r, g, b] = hexToRgb(hex)
        const [h2, s2, v2] = rgbToHsv(r, g, b)
        hue = h2
        sat = s2
        val = v2
        curX = (sat / 100) * 228
        curY = (1 - val / 100) * 140
        syncUI()
    }

    function setAlpha(a) {
        if (!hasAlpha) return
        alphaVal = Math.max(0, Math.min(255, a))
        syncUI()
    }

    function setDisabled(on) {
        isDisabled = on
        trigger.classList.toggle('cpd-disabled', on)
        row.style.pointerEvents = on ? 'none' : ''
        trigger.style.opacity = on ? '0.4' : '1'
    }

    function getValue() {
        const [r, g, b] = hsvToRgb(hue, sat, val)
        return {
            hex: '#' + toHex2(r) + toHex2(g) + toHex2(b),
            r,
            g,
            b,
            alpha: alphaVal,
            rgba: buildRgba(r, g, b, alphaVal),
        }
    }

    if (disabled) setDisabled(true)
    syncUI()

    return { row, setColor, setAlpha, setDisabled, getValue }
}
function makeRow({ title, className, show = true }) {
    const row = document.createElement('div')
    row.classList.add('section-group-row')
    if (!show) row.classList.add('hidden')
    if (className) {
        row.classList.add(className)
    }
    const label = document.createElement('span')
    label.classList.add('label')
    label.textContent = title
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
            document.body.appendChild(tooltip)

            icon.addEventListener('mouseenter', () => {
                const rect = icon.getBoundingClientRect()
                tooltip.style.display = 'block'
                tooltip.style.left = rect.left + rect.width / 2 + 'px'
                tooltip.style.top = rect.top - 8 + 'px'
                tooltip.style.transform = 'translate(-50%, -100%)'
            })
            icon.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none'
            })

            titleText.appendChild(icon)
        }
        group.appendChild(titleRow)
    }

    return group
}
function makeCheckbox({ label, checked = false, disabled = false, onChange } = {}) {
    const row = document.createElement('div')
    row.classList.add('section-group-row')

    const labelEl = document.createElement('label')

    const input = document.createElement('input')
    input.type = 'checkbox'
    input.classList.add('checkbox-input')
    input.checked = checked
    input.disabled = disabled

    input.onchange = () => {
        checked = input.checked
        onChange?.(checked)
    }

    const setDisabled = (on) => {
        input.disabled = on
        input.style.opacity = on ? '0.4' : '1'
        row.style.pointerEvents = on ? 'none' : ''
    }

    const setChecked = (val) => {
        checked = val
        input.checked = val
    }

    if (disabled) setDisabled(true)

    labelEl.appendChild(document.createTextNode(label))
    row.appendChild(labelEl)
    row.appendChild(input)

    return { row, setDisabled, setChecked, getValue: () => checked }
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
function makeLink({
    label,
    href = '#',
    size = 'medium',
    className,
    variant = 'primary',
    display = true,
    onClick,
} = {}) {
    const el = document.createElement('a')
    el.classList.add('link-btn')
    if (className) {
        el.classList.add(...className.trim().split(/\s+/))
    }
    switch (size) {
        case 'small':
            el.classList.add('small')
            break
        case 'medium':
            el.classList.add('medium')
            break
        case 'large':
            el.classList.add('large')
            break
    }
    switch (variant) {
        case 'primary':
            el.classList.add('primary')
            break
        case 'secondary':
            el.classList.add('secondary')
            break
        case 'subtle':
            el.classList.add('subtle')
            break
        case 'delete':
            el.classList.add('delete')
            break
    }
    if (!display) {
        el.classList.add('hidden')
    }
    el.textContent = label
    el.setDisplay = (display) => {
        if (display) el.classList.remove('hidden')
        else el.classList.add('hidden')
    }
    el.href = href
    if (onClick) {
        el.addEventListener('click', (e) => {
            e.preventDefault()
            onClick(e)
        })
    }
    return el
}
function makeToggle({ initialValue, onChange }) {
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
        if (toggle.classList.contains('disabled')) return
        value = !value
        toggle.classList.toggle('active', value)
        onChange(value)
    })
    wrap.appendChild(toggle)
    wrap.setValue = (newVal) => {
        value = newVal
        toggle.classList.toggle('active', value)
    }
    wrap.setDisabled = (disabled) => {
        toggle.classList.toggle('disabled', disabled)
    }
    return wrap
}
function makeColorPicker({ label, defaultValue, onChange, disabled = false, debounceMs = 300 }) {
    const row = makeRow({ title: label })
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
    slider.classList.add('slider')
    if (className) {
        slider.classList.add(...className.trim().split(/\s+/))
    }

    const updateProgress = (v) => {
        if (variant !== 'progress') return
        const percent = (v - min) / (max - min)
        slider.style.background = `
        linear-gradient(
            to right,
            #f95f4d 0%,
            #f95f4d ${percent * 100}%,
            rgba(0,0,0,0.1) ${percent * 100}%,
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
function makeButton({ icon, title, disabled, className, id, onClick, onHold = false }) {
    const btn = document.createElement('button')
    btn.classList.add('btn')
    if (id) btn.id = id
    if (className) {
        btn.classList.add(...className.trim().split(/\s+/))
    }
    if (disabled) btn.disabled = true
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

function makeInput({ type, value, min, max, step, placeholder, onChange, disabled = false, name, className } = {}) {
    const input = document.createElement('input')
    input.type = type
    input.value = value
    input.classList.add('input-field')
    if (className) {
        input.classList.add(...className.trim().split(/\s+/))
    }
    if (min !== undefined) input.min = min
    if (name) input.name = name
    if (max !== undefined) input.max = max
    if (step !== undefined) input.step = step
    if (placeholder) input.placeholder = placeholder
    if (disabled) input.disabled = true
    if (onChange)
        input.addEventListener('input', (e) => {
            let value = input.value
            if (type === 'number') {
                value = parseFloat(input.value)
                if (min !== undefined && input.value < min) {
                    value = min
                    input.value = value
                }
                if (max !== undefined && input.value > max) {
                    value = max
                    input.value = value
                }
            }
            e.stopPropagation()
            onChange(value)
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
function makeTabs({ tabs, width = 100, height = 100, className, onTabChange }) {
    const container = document.createElement('div')
    container.className = 'tab-container'
    container.style.cssText = `width: ${width}px; height : ${height}px`

    const header = document.createElement('div')
    header.className = 'tab-header'
    if (className) {
        header.classList.add(...className.trim().split(/\s+/))
    }
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
                changedAxis: axis,
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
    const setValuesPartial = (partial) => {
        if (partial.x !== undefined) inputEls.x.value = partial.x.toFixed(1)
        if (partial.y !== undefined) inputEls.y.value = partial.y.toFixed(1)
        if (partial.z !== undefined) inputEls.z.value = partial.z.toFixed(1)
    }
    wrapper.appendChild(row)
    return { row: wrapper, setDisabled, setValues, setValuesPartial }
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

    ask({ title, message, cancelText = 'Cancel', variant = 'default', position = 'center', confirmText = null }) {
        this.titleEl.textContent = title
        this.msgEl.textContent = message
        this.overlay.style.display = 'flex'
        this.cancelBtn.textContent = cancelText
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
