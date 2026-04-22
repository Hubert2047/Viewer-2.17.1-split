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