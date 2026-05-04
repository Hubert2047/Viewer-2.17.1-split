class LoadingOverlay {
    constructor(container) {
        this._container = container || document.body
        this._dismissible = false
        this._build()
    }

    _build() {
        this._overlay = document.createElement('div')
        this._overlay.classList.add('loading-overlay')

        const spinner = document.createElement('div')
        spinner.classList.add('loading-spinner')
        this._overlay.appendChild(spinner)
        this._container.appendChild(this._overlay)

        this._overlay.addEventListener('click', (e) => {
            if (e.target === this._overlay && this._dismissible) this.hide()
        })
    }

    async show({ dismissible = false } = {}) {
        this._dismissible = dismissible
        this._overlay.classList.add('visible')

        await new Promise((resolve) => {
            requestAnimationFrame(() => {
                requestAnimationFrame(resolve)
                setTimeout(resolve, 100)
            })
        })

        return this
    }

    hide() {
        this._overlay.classList.remove('visible')
        return this
    }
}
