class HotspotButton {
    constructor({ name, id, parent, onClick }) {
        this.id = id
        this.parent = parent
        this.onClick = onClick
        this.create(name)
    }
    create(name) {
        this.el = document.createElement('button')
        this.el.classList.add('active-hotspot-btn')
        this.el.textContent = name
        this.el.dataset.id = this.id
        this.el.addEventListener('click', () => {
            this.onClick(this.id)
        })
        this.parent.appendChild(this.el)
        this.setUnactiveColor()
        this.show(!isMobile)
    }
    updateTitle(value) {
        this.el.textContent = value
    }
    setActiveColor() {
        this.el.style.backgroundColor = '#f95645'
        this.el.style.color = 'white'
    }
    setUnactiveColor() {
        this.el.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'
        this.el.style.color = 'black'
    }
    updateTitle(value) {
        this.name = value
        this.el.textContent = this.name
    }
    remove() {
        this.el.removeEventListener('click', () => this.onClick(this.id))
        this.el.remove()
    }
    show(active) {
        this.el.style.display = active ? '' : 'none'
    }
}
