function createColorPicker(label, initialColor, onColorChange, disabled = false) {
    const group = document.createElement('div')
    group.classList.add('section-group-row')

    const labelEl = document.createElement('span')
    labelEl.textContent = label

    const input = document.createElement('input')
    input.type = 'color'
    input.classList.add('color-input', 'background-input')
    input.value = initialColor
    input.addEventListener('input', (e) => {
        if (disabled) return
        const newColor = e.target.value
        input.value = newColor
        if (onColorChange) onColorChange(newColor)
    })

    const applyDisabled = (val) => {
        disabled = val
        input.disabled = val
        input.classList.toggle('color-picker-disabled', val)
    }

    applyDisabled(disabled)

    group.appendChild(labelEl)
    group.appendChild(input)

    group.setDisabled = (val) => applyDisabled(val)
    return { group, input, setDisabled: (val) => applyDisabled(val) }
}