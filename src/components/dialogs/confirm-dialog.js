class ConfirmDialog {
    constructor() {
        this._resolve = null
        this._build()
    }

    _build() {
        this.overlay = document.createElement('div')
        this.overlay.style.display = 'none'
        this.overlay.classList.add('confirm-dialog-overlay')

        const box = document.createElement('div')
        box.classList.add('confirm-dialog-box')
        this.titleEl = document.createElement('div')
        this.titleEl.classList.add('confirm-title')
        this.msgEl = document.createElement('div')
        this.msgEl.classList.add('confirm-msg')
        const btnRow = document.createElement('div')
        btnRow.classList.add('confirm-btn-row')
        this.cancelBtn = document.createElement('button')
        this.cancelBtn.textContent = 'Cancel'
        this.cancelBtn.classList.add('confirm-cancel-btn', 'cancel-btn', 'btn')

        this.confirmBtn = document.createElement('button')
        this.confirmBtn.textContent = 'Delete'
        this.confirmBtn.classList.add('confirm-accept-btn', 'confirm-btn', 'btn')
        this.confirmBtn.style.background = '#c0392b'

        btnRow.appendChild(this.cancelBtn)
        btnRow.appendChild(this.confirmBtn)
        box.appendChild(this.titleEl)
        box.appendChild(this.msgEl)
        box.appendChild(btnRow)
        this.overlay.appendChild(box)
        document.body.appendChild(this.overlay)

        this.confirmBtn.addEventListener('click', () => this._close(true))
        this.cancelBtn.addEventListener('click', () => this._close(false))
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this._close(false)
        })
    }

    _close(result) {
        this.overlay.style.display = 'none'
        this._resolve?.(result)
        this._resolve = null
    }

    ask(title, message, variant = 'default', position = 'center', confirmText = null) {
        this.titleEl.textContent = title
        this.msgEl.textContent = message
        this.overlay.style.display = 'flex'

        this.overlay.style.alignItems = position === 'top' ? 'flex-start' : 'center'
        this.overlay.style.paddingTop = position === 'top' ? '80px' : '0'

        switch (variant) {
            case 'delete':
                this.confirmBtn.style.background = '#c0392b'
                this.confirmBtn.textContent = confirmText ?? 'Delete'
                break
            case 'edit':
                this.confirmBtn.style.background = '#3498db'
                this.confirmBtn.textContent = confirmText ?? 'Confirm'
                break
            default:
                this.confirmBtn.style.background = '#27ae60'
                this.confirmBtn.textContent = confirmText ?? 'OK'
        }

        return new Promise((res) => (this._resolve = res))
    }
}
