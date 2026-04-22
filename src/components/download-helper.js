function downloadHelper(steps) {
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
