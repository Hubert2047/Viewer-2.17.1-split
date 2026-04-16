class ModalConfirm {
    constructor() {
        this._resolve = null
        this._build()
    }

    _build() {
        this.overlay = document.createElement('div')
        this.overlay.className = 'md-overlay'

        const modal = document.createElement('div')
        modal.className = 'md-modal'
        this.modal = modal

        this.titleEl = document.createElement('div')
        this.titleEl.className = 'md-title'

        this.msgEl = document.createElement('div')
        this.msgEl.className = 'md-message'

        const actions = document.createElement('div')
        actions.className = 'md-actions'

        this.cancelBtn = document.createElement('button')
        this.cancelBtn.className = 'md-btn cancel'
        this.cancelBtn.textContent = 'Cancel'

        this.okBtn = document.createElement('button')
        this.okBtn.className = 'md-btn ok'
        this.okBtn.textContent = 'OK'

        actions.appendChild(this.cancelBtn)
        actions.appendChild(this.okBtn)

        modal.appendChild(this.titleEl)
        modal.appendChild(this.msgEl)
        modal.appendChild(actions)

        this.overlay.appendChild(modal)
        document.body.appendChild(this.overlay)

        this.cancelBtn.onclick = () => this._close(false)
        this.okBtn.onclick = () => this._close(true)

        this.overlay.onclick = (e) => {
            if (e.target === this.overlay) this._close(false)
        }
    }

    _close(result) {
        this.overlay.classList.remove('show')
        this._resolve?.(result)
        this._resolve = null
    }

   open(title, message, position = 'center') {
    this.titleEl.innerHTML = title
    this.msgEl.innerHTML = message

    this.overlay.classList.remove('top', 'center', 'bottom')
    this.modal.classList.add(position)

    this.overlay.classList.add('show')

    return new Promise(res => this._resolve = res)
}
}