function createVec3Inputs({
    title = '',
    defaultValues = { x: 0, y: 0, z: 0 },
    editable = true,
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

    const setEditable = (on) => {
        AXIS.forEach((axis) => {
            const el = inputEls[axis]
            el.disabled = !on
            el.style.border = on ? `0.5px solid ${COLORS[axis]}88` : '0.5px solid rgba(0,0,0,0.13)'
            el.style.background = on ? '#fff' : 'rgba(0,0,0,0.04)'
            el.style.color = on ? '#2d3748' : 'rgba(0,0,0,0.3)'
            el.style.cursor = on ? 'text' : 'not-allowed'
        })
    }
    setEditable(editable)

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

    return { row: wrapper, setEditable, setValues }
}
