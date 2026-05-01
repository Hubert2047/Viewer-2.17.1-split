function makeRow(labelText) {
    const row = document.createElement('div')
    row.classList.add('section-group-row')
    const label = document.createElement('span')
    label.textContent = labelText
    row.appendChild(label)
    return row
}
