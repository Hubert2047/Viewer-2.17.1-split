function makeColorAlpha(color, alpha, onChangeColor, onChangeAlpha, disabled = false) {
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

    const colorInput = document.createElement('input')
    colorInput.type = 'color'
    colorInput.value = color
    colorInput.style.cssText = 'position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%;'
    colorInput.addEventListener('input', () => {
        if (disabled) return
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
        if (disabled) return
        const v = parseFloat(slider.value)
        updateTrack(v)
        onChangeAlpha(v)
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