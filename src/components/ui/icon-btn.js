function makeIconBtn(icon, title) {
    const btn = document.createElement('button')
    btn.classList.add('btn', 'orientation-btn')
    btn.style.cssText = 'height:28px; width:28px; padding:0; display:flex; align-items:center; justify-content:center;'
    btn.innerHTML = icon
    btn.title = title
    return btn
}
