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
        if (/^#?[0-9a-fA-F]{6,8}$/.test(colorStr.trim())) return colorStr.startsWith('#') ? colorStr : '#' + colorStr
        const c = document.createElement('canvas')
        c.width = c.height = 1
        const cx = c.getContext('2d')
        cx.fillStyle = colorStr
        cx.fillRect(0, 0, 1, 1)
        const [r, g, b] = cx.getImageData(0, 0, 1, 1).data
        return '#' + [r, g, b].map(toHex2).join('')
    }

    function buildRgba(r, g, b, a) {
        return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`
    }

    const resolvedColor = resolveColor(color)
    const [initR, initG, initB] = hexToRgb(resolvedColor)
    let [hue, sat, val] = rgbToHsv(initR, initG, initB)
    let alphaVal = hasAlpha ? Math.round(Math.max(0, Math.min(1, alpha)) * 255) : 255
    let curX = (sat / 100) * 228
    let curY = (1 - val / 100) * 140
    let isDisabled = disabled
    let isOpen = false
    let debounceTimer = null
    let rafId = null
    let dirty = false
    let canvasRect = null,
        hueRect = null,
        alphaRect = null
    let lastDrawnHue = -1

    function el(tag, cls) {
        const e = document.createElement(tag)
        if (cls) e.className = cls
        return e
    }

    const row = el('div', 'section-group-row cpd-row')
    if (label) {
        const labelEl = el('span', 'label')
        labelEl.textContent = label
        row.appendChild(labelEl)
    }

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

    const CURSOR_SIZE = 14
    const HALF_C = CURSOR_SIZE / 2
    const HALF_T = 3

    function drawCanvas() {
        if (lastDrawnHue === hue) return
        lastDrawnHue = hue
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

        cursor.style.transform = `translate(${Math.max(HALF_C, Math.min(228 - HALF_C, curX)) - HALF_C}px,${Math.max(HALF_C, Math.min(140 - HALF_C, curY)) - HALF_C}px)`
        const huePercent = (hue / 360) * 100
        hueThumb.style.left = `clamp(${HALF_T}px,${huePercent}%,calc(100% - ${HALF_T}px))`

        if (hasAlpha && alphaBar) {
            alphaTrack.style.background = `linear-gradient(to right,rgba(${r},${g},${b},0),rgb(${r},${g},${b}))`
            const alphaPercent = (alphaVal / 255) * 100
            alphaThumb.style.left = `clamp(${HALF_T}px,${alphaPercent}%,calc(100% - ${HALF_T}px))`
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

    function scheduleSync() {
        if (rafId) return
        rafId = requestAnimationFrame(() => {
            rafId = null
            syncUI()
            if (dirty) {
                fireChange()
                dirty = false
            }
        })
    }

    function fireChange() {
        if (!onChange) return
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
            const [r, g, b] = hsvToRgb(hue, sat, val)
            const hex6 = toHex2(r) + toHex2(g) + toHex2(b)
            onChange({ hex: '#' + hex6, r, g, b, alpha: alphaVal / 255, rgba: buildRgba(r, g, b, alphaVal) })
        }, debounceMs)
    }

    function invalidateRects() {
        canvasRect = null
        hueRect = null
        alphaRect = null
    }

    function getCanvasRect() {
        return canvasRect || (canvasRect = canvas.getBoundingClientRect())
    }
    function getHueRect() {
        return hueRect || (hueRect = hueBar.getBoundingClientRect())
    }
    function getAlphaRect() {
        return alphaRect || (alphaRect = alphaBar ? alphaBar.getBoundingClientRect() : null)
    }

    function pickSatVal(e) {
        if (isDisabled) return
        const rect = getCanvasRect()
        const rawX = e.clientX - rect.left
        const rawY = e.clientY - rect.top
        sat = Math.round(Math.max(0, Math.min(1, rawX / 228)) * 100)
        val = Math.round(Math.max(0, Math.min(1, 1 - rawY / 140)) * 100)
        curX = Math.max(0, Math.min(228, rawX))
        curY = Math.max(0, Math.min(140, rawY))
        dirty = true
        scheduleSync()
    }

    function pickHue(e) {
        if (isDisabled) return
        const rect = getHueRect()
        hue = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 360)
        dirty = true
        scheduleSync()
    }

    function pickAlpha(e) {
        if (!hasAlpha || isDisabled) return
        const rect = getAlphaRect()
        alphaVal = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 255)
        dirty = true
        scheduleSync()
    }

    canvasWrap.addEventListener('pointerdown', (e) => {
        canvasRect = null
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
        hueRect = null
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
            alphaRect = null
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
        dirty = true
        scheduleSync()
    }
    rInp.addEventListener('input', rgbFieldChanged)
    gInp.addEventListener('input', rgbFieldChanged)
    bInp.addEventListener('input', rgbFieldChanged)

    if (hasAlpha && aInp) {
        aInp.addEventListener('input', () => {
            if (isDisabled) return
            alphaVal = Math.max(0, Math.min(255, +aInp.value || 0))
            dirty = true
            scheduleSync()
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
        dirty = true
        scheduleSync()
    })

    function positionDropdown() {
        const rect = trigger.getBoundingClientRect()
        if (rect.width === 0 && rect.height === 0) {
            closeDropdown()
            return
        }
        const dropW = 252
        const dropH = hasAlpha ? 290 : 255
        dropdown.style.cssText += `;position:fixed;width:${dropW}px;margin:0`
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
        dropdown.style.display = 'block'
        invalidateRects()
        positionDropdown()
        arrow.style.transform = 'rotate(180deg)'
        trigger.classList.add('cpd-open')
        isOpen = true
        lastDrawnHue = -1
        drawCanvas()
    }

    function closeDropdown() {
        dropdown.style.display = 'none'
        arrow.style.transform = ''
        trigger.classList.remove('cpd-open')
        isOpen = false
    }
    document.addEventListener('cpd:close-all', closeDropdown)
    trigger.addEventListener('click', (e) => {
        if (isDisabled) return
        e.stopPropagation()
        if (isOpen) {
            closeDropdown()
        } else {
            document.dispatchEvent(new CustomEvent('cpd:close-all'))
            openDropdown()
        }
    })
    dropdown.addEventListener('click', (e) => e.stopPropagation())
    document.addEventListener('click', closeDropdown)
    window.addEventListener(
        'scroll',
        () => {
            if (isOpen) {
                invalidateRects()
                positionDropdown()
            }
        },
        true,
    )
    window.addEventListener('resize', () => {
        if (isOpen) {
            invalidateRects()
            positionDropdown()
        }
    })

    function setColor(hex) {
        const [r, g, b] = hexToRgb(hex)
        const [h2, s2, v2] = rgbToHsv(r, g, b)
        hue = h2
        sat = s2
        val = v2
        curX = (sat / 100) * 228
        curY = (1 - val / 100) * 140
        scheduleSync()
    }

    function setAlpha(a) {
        if (!hasAlpha) return
        alphaVal = Math.max(0, Math.min(255, a))
        scheduleSync()
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
            alpha: alphaVal / 255,
            rgba: buildRgba(r, g, b, alphaVal),
        }
    }

    if (disabled) setDisabled(true)

    cursor.style.position = 'absolute'
    cursor.style.left = '0'
    cursor.style.top = '0'
    cursor.style.willChange = 'transform'
    syncUI()

    return { row, setColor, setAlpha, setDisabled, getValue }
}
function makeRow({ title, className, show = true } = {}) {
    const row = document.createElement('div')
    row.classList.add('section-group-row')
    if (!show) row.classList.add('hidden')
    if (className) row.classList.add(className)

    const label = document.createElement('span')
    label.classList.add('label')
    label.textContent = title
    row.appendChild(label)

    const setShow = (visible) => {
        if (visible) row.classList.remove('hidden')
        else row.classList.add('hidden')
    }

    const setDisabled = (on) => {
        row.style.opacity = on ? '0.4' : ''
        row.style.pointerEvents = on ? 'none' : ''
    }

    return { el: row, setShow, setDisabled }
}
function makeSectionWrap(otps = {}) {
    const container = document.createElement('div')
    container.classList.add('section-wrap')
    if (otps.className) {
        container.classList.add(otps.className)
    }
    return container
}
function makeSectionGroup(title, hint) {
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
    row.setDisabled = (disabled) => {
        row.querySelectorAll('.segment-btn').forEach((b) => {
            b.classList.toggle('disabled', disabled)
            b.style.pointerEvents = disabled ? 'none' : ''
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
function makeButton({ icon, title, disabled, className, id, onClick, show = true, onHold = false, variant, label }) {
    const btn = document.createElement('button')
    let iconEl = null
    btn.classList.add('btn', 'flex-center')
    if (id) btn.id = id
    if (className) {
        btn.classList.add(...className.trim().split(/\s+/))
    }
    if (!show) btn.classList.add('hidden')
    if (disabled) btn.disabled = true
    if (title) btn.title = title

    if (variant === 'full') {
        btn.style.cssText = `width:100%; display:flex; align-items:center; justify-content:center;gap:8px;`
        if (className === 'primary') {
            btn.style.background = 'var(--primary)'
            btn.style.color = 'white'
        }
        if (icon) {
            iconEl = document.createElement('span')
            iconEl.style.cssText = 'display:flex;align-items:center;width:16px;height:16px;'
            iconEl.innerHTML = icon
            btn.appendChild(iconEl)
        }
        if (label) {
            const labelEl = document.createElement('span')
            labelEl.textContent = label
            btn.appendChild(labelEl)
        }
    } else {
        btn.innerHTML = icon ? icon : title
    }

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
    btn.setShow = (visible) => {
        if (visible) btn.classList.remove('hidden')
        else btn.classList.add('hidden')
    }
    btn.updateIcon = (newIcon) => {
        if (iconEl) {
            iconEl.innerHTML = newIcon
        } else {
            btn.innerHTML = newIcon
        }
    }
    return btn
}
function makeInput({
    type,
    value,
    min,
    max,
    step,
    placeholder,
    onChange,
    onBlur,
    disabled = false,
    name,
    className,
} = {}) {
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
    if (onBlur) {
        input.addEventListener('blur', (e) => onBlur(e.target.value))
    }
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
function makeSelect({ options: _options, value, onChange, className, name } = {}) {
    let options = _options
    let current = value
    let isOpen = false
    let hasMeasured = false

    const wrap = document.createElement('div')
    wrap.classList.add('sd-wrap')
    if (className) wrap.classList.add(...className.trim().split(/\s+/))

    const trigger = document.createElement('div')
    trigger.classList.add('sd-trigger')
    if (name) trigger.dataset.name = name

    const label = document.createElement('span')
    label.classList.add('sd-label')

    const arrow = document.createElement('span')
    arrow.classList.add('sd-arrow')
    arrow.textContent = '▾'

    trigger.appendChild(label)
    trigger.appendChild(arrow)
    wrap.appendChild(trigger)

    const dropdown = document.createElement('div')
    dropdown.classList.add('sd-dropdown')
    dropdown.style.display = 'none'
    document.body.appendChild(dropdown)

    function applyFixedLabelWidth() {
        if (hasMeasured) return
        if (!label.isConnected) return

        const measureWrap = document.createElement('div')
        measureWrap.className = 'sd-wrap'
        measureWrap.style.cssText = 'position:fixed;visibility:hidden;top:-9999px;left:-9999px;'

        const measureTrigger = document.createElement('div')
        measureTrigger.className = 'sd-trigger'

        const measureLabel = document.createElement('span')
        measureLabel.className = 'sd-label'

        const measureArrow = document.createElement('span')
        measureArrow.className = 'sd-arrow'
        measureArrow.textContent = '▾'

        measureTrigger.appendChild(measureLabel)
        measureTrigger.appendChild(measureArrow)
        measureWrap.appendChild(measureTrigger)
        document.body.appendChild(measureWrap)

        let max = 0
        for (const opt of options) {
            const lbl = typeof opt === 'object' ? opt.label : opt
            measureLabel.textContent = lbl
            max = Math.max(max, measureLabel.scrollWidth)
        }

        measureWrap.remove()
        if (max > 0) {
            label.style.minWidth = max + 'px'
            hasMeasured = true
        }
    }

    function renderLabel() {
        const found = options.find((o) => (typeof o === 'object' ? o.value : o) === String(current))
        label.textContent = found ? (typeof found === 'object' ? found.label : found) : ''
    }

    function positionDropdown() {
        const rect = trigger.getBoundingClientRect()
        dropdown.style.minWidth = rect.width + 'px'
        let top = rect.bottom + 2
        let left = rect.left
        if (left + dropdown.offsetWidth > window.innerWidth - 8) left = window.innerWidth - dropdown.offsetWidth - 8
        if (top + dropdown.offsetHeight > window.innerHeight - 8) top = rect.top - dropdown.offsetHeight - 2
        dropdown.style.top = top + 'px'
        dropdown.style.left = left + 'px'
    }

    function openDropdown() {
        applyFixedLabelWidth()
        dropdown.innerHTML = ''
        options.forEach((opt) => {
            const val = typeof opt === 'object' ? opt.value : opt
            const lbl = typeof opt === 'object' ? opt.label : opt
            const disabled = typeof opt === 'object' ? !!opt.disabled : false
            const item = document.createElement('div')
            item.classList.add('sd-option')
            if (String(val) === String(current)) item.classList.add('active')
            if (disabled) item.classList.add('sd-option-disabled')
            item.textContent = lbl
            item.addEventListener('click', (e) => {
                e.stopPropagation()
                if (disabled) return
                current = val
                renderLabel()
                onChange?.(val)
                closeDropdown()
            })
            dropdown.appendChild(item)
        })
        dropdown.style.display = 'flex'
        requestAnimationFrame(positionDropdown)
        arrow.style.transform = 'rotate(180deg)'
        trigger.classList.add('sd-open')
        isOpen = true
    }

    function closeDropdown() {
        dropdown.style.display = 'none'
        arrow.style.transform = ''
        trigger.classList.remove('sd-open')
        isOpen = false
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation()
        if (isOpen) closeDropdown()
        else {
            document.dispatchEvent(new CustomEvent('sd:close-all'))
            openDropdown()
        }
    })
    document.addEventListener('sd:close-all', closeDropdown)
    document.addEventListener('click', closeDropdown)
    window.addEventListener('resize', () => {
        if (isOpen) positionDropdown()
    })

    const setValue = (val) => {
        current = val
        renderLabel()
    }
    const setDisabled = (on) => {
        trigger.classList.toggle('sd-disabled', on)
    }
    const getValue = () => current
    const setOptions = (newOptions) => {
        options = newOptions
        hasMeasured = false
        renderLabel()
        applyFixedLabelWidth()
        if (isOpen) openDropdown()
    }

    renderLabel()

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        requestAnimationFrame(() => requestAnimationFrame(applyFixedLabelWidth))
    } else {
        window.addEventListener(
            'DOMContentLoaded',
            () => {
                requestAnimationFrame(applyFixedLabelWidth)
            },
            { once: true },
        )
    }

    return { el: wrap, setValue, getValue, setDisabled, setOptions }
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
        header.querySelectorAll('.tab-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index)
        })

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
