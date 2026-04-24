function createTabs({ tabs, width = 100, height = 100, onTabChange }) {
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
