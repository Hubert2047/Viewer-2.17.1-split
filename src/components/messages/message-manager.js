class MessagesManager {
    editor
    translatingId
    constructor({ global, dom, tooltip }) {
        this.global = global
        this.global.messagesManager = this
        this.camera = global.camera.camera
        this.events = global.events
        this.editable = global.config.editable
        this.dom = dom
        this.tooltip = tooltip

        this.messages = []
        this.settings = global.settings

        this.activeMessage = null
        this.activeData = null
        global.isShowMessageNavigation = !isMobile
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
                    this.events.fire('message:selected', JSON.parse(JSON.stringify(data)))
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
        this.events.fire('info-panel:rebuild')
        this.events.fire('re-render:control-wrap')
    }
    createMessage(data) {
        return new Messages({
            camera: this.camera,
            dom: this.dom,
            data: JSON.parse(JSON.stringify(data)),
            button: this.createMessageActiveBtn(data),
            editable: this.editable,
            events: this.events,
            removedSplats: this.settings.removedSplats,
        })
    }

    listenEvents() {
        this.events.on('setup-reset', () => this.rebuild())
        this.events.on('message:add', ({ position }) => {
            this.global.dataDirty = true
            const entityInfo = this.global.cameraManager.controllers.ortery.getEntityInfo()
            const data = this.createDefault(position, entityInfo)
            this.settings.messages.push(JSON.parse(JSON.stringify(data)))
            if (this.settings.messages.length === 1) {
                this.events.fire('re-render:control-wrap')
                this.events.fire('info-panel:rebuild')
            }
            this.messages.push(this.createMessage(data))
            this.events.fire('message:selected', data, { skipTransition: true })
            this.events.fire('message:editing', false)
        })
        this.events.on('message:selected', (selectedData, opts = {}) => {
            this.stopAutoPlay()
            if (this.activeData && selectedData === null) this.resetActiveMessageBtnName()
            this.activeData = selectedData
            if (this.editable) this.updateUIPanel()
            if (selectedData === null) {
                this.activeMessage?.hide()
                this.activeMessage = null
                this.events.fire('message:editing', false)
            } else {
                const activeMessage = this.messages.find((h) => h.id === selectedData.id)
                if (this.global.isAutoPlayMessages) this.stopAutoPlay()
                if (activeMessage) {
                    this.setActive(activeMessage, NORMAL_FADE_TIME, { skipTransition: opts.skipTransition }) // 👈
                }
            }
        })
        this.events.on('message:editor-changed', ({ data, refreshUIPanel = false }) => {
            this.global.dataDirty = true
            if (data.dot.size !== this.activeData?.dot.size) {
                const { focusWorldPos, invWorldMatrix, focusScreenPos } = this.getFocusInfo(data.focus.position)
                const { topLeft, botRight } = this.getDotBounder(
                    focusWorldPos,
                    invWorldMatrix,
                    focusScreenPos,
                    data.dot.size,
                )
                data.dot.topLeft = topLeft
                data.dot.botRight = botRight
            } else if (this.activeData) {
                data.dot.topLeft = this.activeData.dot.topLeft
                data.dot.botRight = this.activeData.dot.botRight
            }
            this.activeData = data
            this.updateMessageData()
            if (refreshUIPanel) this.updateUIPanel()
        })
        this.events.on('message:drag-changed', (data) => {
            if (!this.activeData) return
            this.global.dataDirty = true
            this.activeData = data
            this.events.fire('message:update-ui-data', data)
        })
        this.events.on('message:start-auto', (data) => this.startAutoPlay(data))
        this.events.on('message:stop-auto', (data) => this.stopAutoPlay(data))
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
            if (this.settings.messages.length === 0) {
                this.events.fire('info-panel:rebuild')
                this.events.fire('re-render:control-wrap')
            }
        })

        this.events.on('message:apply', (applyData) => {
            this.settings.messages = this.settings.messages.map((d) => {
                if (d.id === applyData.id) {
                    const { focusWorldPos, invWorldMatrix, focusScreenPos } = this.getFocusInfo(
                        applyData.focus.position,
                    )
                    const { topLeft, botRight } = this.getDotBounder(
                        focusWorldPos,
                        invWorldMatrix,
                        focusScreenPos,
                        applyData.dot.size,
                    )
                    applyData.dot.topLeft = topLeft
                    applyData.dot.botRight = botRight
                    const newData = {
                        ...JSON.parse(JSON.stringify(applyData)),
                        entityInfo: this.global.cameraManager.controllers.ortery.getEntityInfo(),
                    }
                    if (this.activeMessage) this.activeMessage.data = JSON.parse(JSON.stringify(newData))
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
            if (fromDataIdx < 0 || toDataIdx < 0 || fromDataIdx === toDataIdx) return
            const [movedData] = this.settings.messages.splice(fromDataIdx, 1)
            this.settings.messages.splice(toDataIdx, 0, movedData)
            const fromMessageIdx = this.messages.findIndex((h) => h.id === fromId)
            const toMessageIdx = this.messages.findIndex((h) => h.id === toId)
            const [movedMessage] = this.messages.splice(fromMessageIdx, 1)
            this.messages.splice(toMessageIdx, 0, movedMessage)
            this.messages.forEach((h) => {
                this.dom.messageContainer.appendChild(h.button.el)
            })
            this.updateUIPanel()
        })
        this.events.on('message:editor', (editor) => {
            this.editor = editor
            this.updateUIPanel()
        })
        this.events.on('inputEvent:p', () => {
            if (this.global.isAutoPlayMessages) this.stopAutoPlay()
            else this.startAutoPlay()
        })
        this.events.on('message:audio-user-paused', () => {
            if (this.global.isAutoPlayMessages) this.stopAutoPlay({ hideMessages: true })
        })
        this.events.on('inputEvent:t', () => {
            this.showMessageNavigation(!this.global.isShowMessageNavigation)
        })
        this.events.on('ortery:rotate', () => this.hideAllMessages())
        this.events.on('ortery:zoom', () => this.hideAllMessages())
        this.events.on('360spin-start', () => {
            this.stopAutoPlay()
            this.hideAllMessages()
        })
        this.events.on('ortery:reset', () => {
            this.stopAutoPlay()
            this.hideAllMessages()
        })
        this.events.on('ortery:interaction', () => this.stopAutoPlay())
        this.events.on('message:mobile-navigation', (dir) => {
            if (this.messages.length === 0) return
            const activeId = this.activeMessage?.id
            const currentIdx = activeId ? this.messages.findIndex((m) => m.id === activeId) : -1
            const nextIdx =
                dir === 'prev'
                    ? currentIdx <= 0
                        ? this.messages.length - 1
                        : currentIdx - 1
                    : (currentIdx + 1) % this.messages.length
            const nextData = this.settings.messages[nextIdx]
            this.events.fire('message:selected', JSON.parse(JSON.stringify(nextData)))
        })

        this.events.on('message:goto-first', ({ onReady, hideMessages = false } = {}) => {
            if (hideMessages) this.hideAllMessages()

            if (this.messages.length === 0) {
                onReady?.()
                return
            }
            const first = this.messages[0]
            if (this.isSamePose(first)) {
                onReady?.()
                return
            }
            this.events.fire('ortery-controller:transition', {
                entityInfo: first.data.entityInfo,
                lerpDuration: AUTO_PLAY_LERP_TIME,
                onTransitionFinished: () => onReady?.(),
            })
        })
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
            autoPlay: { time: 3 },
            button: { title: defaultName },
            text: {
                color: 'black',
                bold: false,
                italic: false,
                align: 'center',
                content: defaultName,
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
        const isCylindrical = controller.originModel === 'cylindrical'
        const actualDis = isCylindrical ? controller.getActualFov(d) : controller.getActualDistance(d)
        const currentDis = isCylindrical ? controller.fov : controller.distance
        return (
            isSameVec3(p, modelEntity.localPosition) &&
            isSameQuat(r, modelEntity.localRotation) &&
            isSameVec3(f, controller.focus) &&
            isSameFloat(actualDis, currentDis)
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
    setActive(message, lerpDuration = 1.5, options = {}) {
        const { skipTransition = false } = options
        if (!message || !modelEntity) return
        if (!this.global.recordActive && this.editable && this.activeMessage && message.id !== this.activeMessage?.id) {
            const data = this.settings.messages.find((i) => i.id === this.activeMessage.data.id)
            this.activeMessage.data = JSON.parse(JSON.stringify(data))
            this.activeMessage.update(true, this.activeMessage.data.button.title)
        }
        if (this.global.recording && this.global.recordPattern !== 'story') message?.hide()
        this.activeMessage?.hide()
        message.resetTime()
        const isSamePose = skipTransition || this.isSamePose(message)
        if (this.dom.messageContainer) {
            const btn = message.button.el
            const container = this.dom.messageContainer
            if (isMobile) {
                const btnLeft = btn.offsetLeft
                const btnWidth = btn.offsetWidth
                const containerWidth = container.offsetWidth
                const scrollTarget = btnLeft - containerWidth / 2 + btnWidth / 2
                container.scrollTo({ left: scrollTarget, behavior: 'smooth' })
            } else {
                const btnTop = btn.offsetTop
                const btnHeight = btn.offsetHeight
                const containerHeight = container.offsetHeight
                const scrollTarget = btnTop - containerHeight / 2 + btnHeight / 2
                container.scrollTo({ top: scrollTarget, behavior: 'smooth' })
            }
        }
        if (isSamePose && message.id === this.activeMessage?.id) {
            this.updateMessage(message)
            return true
        }
        if (isSamePose) {
            this.updateMessage(message)
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
                this.updateMessage(message)
                this.isTranslating = false
            },
        })
        return false
    }
    updateMessage(message) {
        const isStoryRecording = this.global.recording && this.global.recordPattern === 'story'
        if (this.global.recording && !isStoryRecording) {
            message.hide()
            if (message.button) message.button.setActiveColor()
            return
        }
        message.setAudioRecordEnabled(!isStoryRecording || !!this.global.recordIncludeAudio)
        message.show()
        message.update()
        message.setLiveHidden(isStoryRecording && !this.global.recordIncludeMessage)
    }
    autoPlay({ onFinished, loop = true, hideMessages = false } = {}) {
        if (this.messages.length === 0) return
        const currentIdx = this.activeMessage ? this.messages.findIndex((h) => h.id === this.activeMessage.id) : -1
        const nextIdx = currentIdx + 1
        const wrappedIdx = nextIdx % this.messages.length
        const next = this.messages[wrappedIdx]
        const isSamePose = this.setActive(next, AUTO_PLAY_LERP_TIME)
        const isLastMessage = !loop && nextIdx >= this.messages.length - 1
        this.intervalID = setTimeout(
            () => {
                if (isLastMessage) {
                    this.stopAutoPlay({ hideMessages })
                    const first = this.messages[0]
                    const isFirstSamePose = this.isSamePose(first)
                    if (isFirstSamePose) {
                        onFinished?.(this)
                    } else {
                        this.events.fire('ortery-controller:transition', {
                            entityInfo: first.data.entityInfo,
                            lerpDuration: AUTO_PLAY_LERP_TIME,
                            onTransitionFinished: () => onFinished?.(this),
                        })
                    }
                } else {
                    this.autoPlay({ onFinished, loop })
                }
            },
            next.data.autoPlay.time * 1000 + (isSamePose ? 0 : AUTO_PLAY_LERP_TIME * 1000),
        )
    }
    startAutoPlay(data) {
        this.events.fire('message:selected', null)
        this.global.isAutoPlayMessages = true
        this.events.fire('re-render:control-wrap')
        this.autoPlay(data)
    }

    stopAutoPlay({ hideMessages = false } = {}) {
        if (!this.global.isAutoPlayMessages) return
        if (this.intervalID) {
            clearTimeout(this.intervalID)
            this.intervalID = null
        }
        if (!hideMessages) this.hideAllMessages()
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
        const isStoryRecording = this.global.recording && this.global.recordPattern === 'story'
        if (this.global.recording && !isStoryRecording) return
        this.messages.forEach((h) => {
            if (h.id === this.activeMessage?.id) {
                h.update()
                h.setLiveHidden(isStoryRecording && !this.global.recordIncludeMessage)
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
