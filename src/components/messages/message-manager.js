class MessagesManager {
    editor
    translatingId
    constructor({ global, dom, tooltip }) {
        this.global = global
        this.camera = global.camera.camera
        this.events = global.events
        this.editable = global.config.editable
        this.dom = dom
        this.tooltip = tooltip

        this.messages = []
        this.settings = global.settings

        this.activeMessage = null
        this.activeData = null
        this.global.isShowMessageNavigation = !isMobile
        this.global.isAutoPlayMessages = false
        this.intervalID = null
        this.listenEvents()
        global.app.on('postrender', () => this.update())
        this.initMessages()
    }
    initMessages() {
        this.settings.messages.forEach((h) => {
            this.messages.push(this.createMessage(h))
        })
    }
    createMessageActiveBtn(data) {
        return new MessageButton({
            name: data.button.title,
            id: data.id,
            parent: this.dom.messageContainer,
            onClick: (id) => {
                if (this.activeMessage?.data.id === id) return
                const message = this.messages.find((message) => message.id === id)
                if (message) {
                    const data = this.settings.messages.find((h) => h.id === message.id)
                    this.events.fire('message:editor-selected', data)
                }
            },
        })
    }
    rebuild() {
        this.messages.forEach((h) => h.destroy())
        this.messages = []
        this.activeMessage = null
        this.activeData = null
        this.stopAutoPlay()

        this.settings.messages.forEach((h) => {
            this.messages.push(this.createMessage(h))
        })
        this.updateUIPanel()
        this.events.fire('message:rebuild-info')
    }
    createMessage(data) {
        return new Messages({
            camera: this.camera,
            dom: this.dom,
            data,
            button: this.createMessageActiveBtn(data),
            editable: this.editable,
            events: this.events,
        })
    }

    listenEvents() {
        this.events.on('setup-reset', () => this.rebuild())
        this.events.on('message:add', ({ position }) => {
            const entityInfo = this.global.cameraManager.controllers.ortery.getEntityInfo()
            const data = this.createDefault(position, entityInfo)
            this.settings.messages.push(data)
            if (this.messages.length === 1) {
                this.events.fire('re-render:control-wrap')
                this.events.fire('message:rebuild-info')
            }
            this.messages.push(this.createMessage(data))
            this.events.fire('message:editor-selected', data)
            this.events.fire('message:editing', false)
        })
        this.events.on('message:editor-selected', (selectedData) => {
            this.stopAutoPlay()
            if (this.activeData && selectedData === null) this.resetActiveMessageBtnName()
            this.activeData = selectedData
            if (selectedData === null) {
                this.activeMessage?.hide()
                this.activeMessage = null
                this.events.fire('message:editing', false)
            } else {
                const activeMessage = this.messages.find((h) => h.id === selectedData.id)
                if (this.global.isAutoPlayMessages) this.stopAutoPlay()
                if (activeMessage) {
                    this.setActive(activeMessage, NORMAL_FADE_TIME)
                }
            }
            if (this.editable) this.updateUIPanel()
        })
        this.events.on('message:editor-changed', ({ data, refreshUIPanel = false }) => {
            if (data.dot.size !== this.activeData.dot.size) {
                const { focusWorldPos, invWorldMatrix, focusScreenPos } = this.getFocusInfo(data.focus.position)
                const { topLeft, botRight } = this.getDotBounder(
                    focusWorldPos,
                    invWorldMatrix,
                    focusScreenPos,
                    data.dot.size,
                )
                data.dot.topLeft = topLeft
                data.dot.botRight = botRight
            }
            this.activeData = data
            this.updateMessageData()
            if (refreshUIPanel) this.updateUIPanel()
        })
        this.events.on('message:drag-changed', (data) => {
            this.activeData = data
            this.events.fire('message:update-ui-data', data)
        })
        this.events.on('message:start-auto', () => this.startAutoPlay())
        this.events.on('message:stop-auto', () => this.stopAutoPlay())
        this.events.on('message:show-message-navigation', () => this.showMessageNavigation(true))
        this.events.on('message:hide-message-navigation', () => this.showMessageNavigation(false))
        this.events.on('message:editor-cancelled', () => this.editorCancelled())
        this.events.on('message:delete', (id) => {
            const idx = this.messages.findIndex((h) => h.id === id)
            if (idx < 0) return
            if (this.messages[idx].data.audio?.src && this.messages[idx].data.audio?.src.startsWith('blod:')) {
                URL.revokeObjectURL(this.messages[idx].data.audio.src)
            }
            this.messages[idx].destroy()
            if (this.activeMessage?.id === id) {
                this.activeData = null
                this.activeMessage = null
            }
            this.messages.splice(idx, 1)
            this.settings.messages.splice(idx, 1)
            this.updateUIPanel()
            this.events.fire('message:editing', false)
            if (this.messages.length === 0) {
                this.dom?.messageActionGroup.classList.add('hidden')
                this.events.fire('message:rebuild-info')
            }
        })

        this.events.on('message:apply', (applyData) => {
            this.settings.messages = this.settings.messages.map((d) => {
                if (d.id === applyData.id) {
                    const newData = {
                        ...applyData,
                        entityInfo: this.global.cameraManager.controllers.ortery.getEntityInfo(),
                    }
                    if (this.activeMessage) this.activeMessage.data = newData
                    return newData
                }
                return d
            })
            this.activeData = null
            this.updateUIPanel()
            this.events.fire('message:editing', false)
        })
        this.events.on('message:reorder', ({ fromId, toId }) => {
            const fromDataIdx = this.settings.messages.findIndex((d) => d.id === fromId)
            const toDataIdx = this.settings.messages.findIndex((d) => d.id === toId)
            if (fromDataIdx < 0 || toDataIdx < 0) return
            ;[this.settings.messages[fromDataIdx], this.settings.messages[toDataIdx]] = [
                this.settings.messages[toDataIdx],
                this.settings.messages[fromDataIdx],
            ]
            const fromMessageIdx = this.messages.findIndex((h) => h.id === fromId)
            const toMessageIdx = this.messages.findIndex((h) => h.id === toId)
            ;[this.messages[fromMessageIdx], this.messages[toMessageIdx]] = [
                this.messages[toMessageIdx],
                this.messages[fromMessageIdx],
            ]
            this.messages.forEach((h) => {
                this.dom.messageContainer.appendChild(h.button.el)
            })
            this.updateUIPanel()
        })
        this.events.on('message:editor', (editor) => {
            this.editor = editor
            this.updateUIPanel()
        })
        this.events.on('message:toggle-play', () => {
            if (this.global.isAutoPlayMessages) this.stopAutoPlay()
            else this.startAutoPlay()
        })
        this.events.on('message:message-btns', () => {
            this.showMessageNavigation(!this.global.isShowMessageNavigation)
        })
        this.events.on('ortery:rotate', () => this.hideAllMessages())
        this.events.on('360spin-start', () => {
            this.stopAutoPlay()
            this.hideAllMessages()
        })
        this.events.on('ortery:reset', () => {
            this.stopAutoPlay()
            this.hideAllMessages()
        })
        this.events.on('ortery:interaction', () => this.stopAutoPlay())
    }
    hideAllMessages() {
        if (this.activeData) this.events.fire('message:editor-cancelled')
        this.activeData = null
        if (this.activeMessage) {
            this.activeMessage.hide()
            this.activeMessage = null
        }
    }
    resetActiveMessageBtnName() {
        const restoreData = this.settings.messages.find((d) => d.id === this.activeData?.id)
        if (restoreData && this.activeMessage) {
            this.activeMessage.button.updateTitle(restoreData.button.title)
        }
    }
    getFocusInfo(position) {
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        const focusWorldPos = new Vec3()
        worldMatrix.transformPoint(position, focusWorldPos)
        const invWorldMatrix = new Mat4().copy(worldMatrix).invert()
        const focusScreenPos = this.camera.worldToScreen(focusWorldPos)
        return { focusWorldPos, invWorldMatrix, focusScreenPos }
    }

    createDefault(position, entityInfo) {
        const { focusWorldPos, invWorldMatrix, focusScreenPos } = this.getFocusInfo(position)
        const { topLeft, botRight, originWidth, originHeight } = this.getTextContentBounder(
            focusWorldPos,
            invWorldMatrix,
            focusScreenPos,
        )
        const { topLeft: dotTL, botRight: dotBR } = this.getDotBounder(focusWorldPos, invWorldMatrix, focusScreenPos)
        const defaultName = `message${this.settings.messages.length + 1}`
        return {
            id: guid.create(),
            autoPlay: { time: 3000 },
            button: { title: defaultName },
            text: {
                color: 'black',
                bold: false,
                italic: false,
                align: 'center',
                content: defaultName,
                font: 'Lato',
                background: '#ffffff',
                backgroundAlpha: 0.8,
                originWidth,
                originHeight,
                topLeft,
                botRight,
                fontSize: 16,
            },
            focus: { position },
            dot: {
                style: 'circle',
                strokeColor: '#D8D8D8',
                stroke: 1,
                size: 30,
                topLeft: dotTL,
                botRight: dotBR,
            },
            entityInfo,
        }
    }
    isSamePose(message) {
        const controller = this.global.cameraManager.controllers.ortery
        if (!controller) return false
        const { position: p, rotation: r, focus: f, distanceScale: d } = message.data.entityInfo
        return (
            isSameVec3(p, modelEntity.localPosition) &&
            isSameQuat(r, modelEntity.localRotation) &&
            isSameVec3(f, controller.focus) &&
            isSameFloat(controller.getActualDistance(d), controller.distance)
        )
    }
    editorCancelled() {
        this.activeData = null
        if (this.activeMessage) {
            const data = this.settings.messages.find((i) => i.id === this.activeMessage.data.id)
            this.activeMessage.data = JSON.parse(JSON.stringify(data))
            this.activeMessage.update(true, this.activeMessage.data.button.title)
            this.activeMessage.hide()
        }
        this.activeMessage = null
        this.updateUIPanel()
        this.events.fire('message:editing', false)
        if (this.global.isAutoPlayMessages) this.stopAutoPlay()
    }
    setActive(message, lerpDuration = 1.5) {
        if (!message || !modelEntity) return
        if (this.editable && this.activeMessage && message.id !== this.activeMessage?.id) {
            const data = this.settings.messages.find((i) => i.id === this.activeMessage.data.id)
            this.activeMessage.data = JSON.parse(JSON.stringify(data))
            this.activeMessage.update(true, this.activeMessage.data.button.title)
        }
        this.events.fire('sidebar:active', 'message')
        this.activeMessage?.hide()
        message.refreshAudio(true)
        const isSamePose = this.isSamePose(message)
        if (isSamePose && message.id === this.activeMessage?.id) {
            message.show()
            message.update()    
            return true
        }
        if (isSamePose) {
            message.show()
            message.update()
            this.activeMessage = message
            return true
        }
        this.isTranslating = true
        this.activeMessage = message
        message.button.setActiveColor()
        this.events.fire('ortery-controller:transition', {
            entityInfo: message.data.entityInfo,
            lerpDuration,
            onTransitionFinished: () => {
                message.show()
                message.update()
                this.isTranslating = false
            },
        })
        return false
    }
    autoPlay() {
        if (this.messages.length === 0) return
        const currentIdx = this.activeMessage ? this.messages.findIndex((h) => h.id === this.activeMessage.id) : -1
        const nextIdx = (currentIdx + 1) % this.messages.length
        const next = this.messages[nextIdx]
        const isSamePose = this.setActive(next, AUTO_PLAY_LERP_TIME)
        this.intervalID = setTimeout(
            () => this.autoPlay(),
            next.data.autoPlay.time + (isSamePose ? 0 : AUTO_PLAY_LERP_TIME * 1000),
        )
    }
    startAutoPlay() {
        this.events.fire('message:editor-selected', null)
        this.global.isAutoPlayMessages = true
        this.events.fire('re-render:control-wrap')
        this.autoPlay()
    }

    stopAutoPlay() {
        if (!this.global.isAutoPlayMessages) return
        if (this.intervalID) {
            clearTimeout(this.intervalID)
            this.intervalID = null
        }
        this.global.isAutoPlayMessages = false
        this.events.fire('re-render:control-wrap')
    }
    showMessageNavigation(show) {
        this.global.isShowMessageNavigation = show
        this.events.fire('re-render:control-wrap')
        this.messages.forEach((h) => h.button.show(show))
    }
    updateMessageData() {
        if (this.activeMessage && this.activeData) {
            if (this.activeData) this.activeMessage.data = JSON.parse(JSON.stringify(this.activeData))
            this.activeMessage.update(true, this.activeData.button.title)
            this.activeMessage.refreshAudio()
        }
    }
    updateUIPanel() {
        if (this.editor) this.editor.render(this.settings.messages, this.activeData)
    }
    update() {
        if (this.isTranslating) return
        this.messages.forEach((h) => {
            if (h.id === this.activeMessage?.id) {
                h.update()
            }
        })
    }
    getTextContentBounder(focusWorldPos, invWorldMatrix, focusScreenPos) {
        const paddingX = 50
        const paddingY = 50

        const cameraWorldPos = this.camera.entity.getPosition()
        const zDepth = focusWorldPos.distance(cameraWorldPos)

        const contentScreenTL = new Vec3(focusScreenPos.x + 20, focusScreenPos.y - paddingY * 2, zDepth)
        const contentScreenBR = new Vec3(focusScreenPos.x + 20 + paddingX * 3, focusScreenPos.y - paddingY, zDepth)
        const contentWorldTL = this.camera.screenToWorld(contentScreenTL.x, contentScreenTL.y, contentScreenTL.z)
        const contentWorldBR = this.camera.screenToWorld(contentScreenBR.x, contentScreenBR.y, contentScreenBR.z)
        const topLeft = new Vec3()
        const botRight = new Vec3()
        invWorldMatrix.transformPoint(contentWorldTL, topLeft)
        invWorldMatrix.transformPoint(contentWorldBR, botRight)
        const originWidth = Math.abs(contentScreenBR.x - contentScreenTL.x)
        const originHeight = Math.abs(contentScreenBR.y - contentScreenTL.y)
        return { topLeft, botRight, originWidth, originHeight }
    }
    getDotBounder(focusWorldPos, invWorldMatrix, focusScreenPos, size = 30) {
        const half = size / 2
        const cameraPos = this.camera.entity.getPosition()
        const zDepth = focusWorldPos.distance(cameraPos)
        const tl = new Vec3(focusScreenPos.x - half, focusScreenPos.y - half, zDepth)
        const br = new Vec3(focusScreenPos.x + half, focusScreenPos.y + half, zDepth)
        const worldTL = this.camera.screenToWorld(tl.x, tl.y, tl.z)
        const worldBR = this.camera.screenToWorld(br.x, br.y, br.z)
        const topLeft = new Vec3()
        const botRight = new Vec3()
        invWorldMatrix.transformPoint(worldTL, topLeft)
        invWorldMatrix.transformPoint(worldBR, botRight)
        return { topLeft, botRight }
    }
}
