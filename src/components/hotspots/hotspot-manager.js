class HotspotManager {
    editor
    translatingId
    constructor({ global, dom, tooltip }) {
        this.camera = global.camera.camera
        this.events = global.events
        this.editable = global.config.editable
        this.dom = dom
        this.tooltip = tooltip
        this.state = global.state

        this.hotspots = []
        this.settings = global.settings

        this.activeHotspot = null
        this.activeData = null
        this.isShowActiveHotspotBtns = !isMobile
        this.isAutoPlay = false
        this.intervalID = null
        this.listenEvents()
        this.controllers = null
        global.app.on('postrender', () => this.update())
        this.initHotspot()
    }
    initHotspot() {
        this.settings.hotspots.forEach((h) => {
            this.hotspots.push(this.createHotspot(h))
        })
    }
    createHotspotActiveBtn(data) {
        return new HotspotButton({
            name: data.button.title,
            id: data.id,
            parent: this.dom.hotspotContainer,
            onClick: (id) => {
                if (this.activeHotspot?.data.id === id) return
                const hotspot = this.hotspots.find((hotspot) => hotspot.id === id)
                if (hotspot) {
                    const data = this.settings.hotspots.find((h) => h.id === hotspot.id)
                    this.events.fire('hotspot:editor-selected', data)
                }
            },
        })
    }

    createHotspot(data) {
        return new Hotspot({
            camera: this.camera,
            dom: this.dom,
            data,
            button: this.createHotspotActiveBtn(data),
            editable: this.editable,
            events: this.events,
        })
    }

    listenEvents() {
        this.events.on('controllers:created', (controllers) => {
            this.controllers = controllers
        })
        this.events.on('hotspot:add', ({ position, entityInfo }) => {
            const data = this.createDefault(position, entityInfo)
            this.settings.hotspots.push(data)
            this.hotspots.push(this.createHotspot(data))
            this.events.fire('hotspot:editor-selected', data)
            this.events.fire('hotspot:editing', false)
            if (this.hotspots.length === 1) {
                if (this.dom.hotspotActionGroup) this.dom.hotspotActionGroup.classList.remove('hidden')
                else {
                    this.dom.buttonsContainer.appendChild(createHotspotActionGroup(this.tooltip, this.events, this.dom))
                }
                this.events.fire('hotspot:rebuild-info')
            }
        })
        this.events.on('hotspot:editor-selected', (selectedData) => {
            if (this.activeData && selectedData === null) this.resetActiveHotspotBtnName()
            this.activeData = selectedData
            if (selectedData === null) {
                this.activeHotspot?.hide()
                this.activeHotspot = null
                this.events.fire('hotspot:editing', false)
            } else {
                const activeHotspot = this.hotspots.find((h) => h.id === selectedData.id)
                if (this.isAutoPlay) this.stopAutoPlay()
                if (activeHotspot) {
                    this.setActive(activeHotspot, HOTSPOT_FADE_TIME)
                }
            }
            if (this.editable) this.updateUIPanel()
        })
        this.events.on('hotspot:hide-all', () => {
            this.activeData = null
            if (this.activeHotspot) {
                this.activeHotspot.hide()
                this.activeHotspot = null
            }
            if (this.editable) this.updateUIPanel()
        })
        this.events.on('hotspot:editor-changed', ({ data, refreshUIPanel = false }) => {
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
            this.updateHotspotData()
            if (refreshUIPanel) this.updateUIPanel()
        })
        this.events.on('hotspot:drag-changed', (data) => {
            this.activeData = data
            this.events.fire('hotspot:update-ui-data', data)
        })
        this.events.on('hotspot:editor-cancelled', () => {
            this.activeData = null
            if (this.activeHotspot) {
                const data = this.settings.hotspots.find((i) => i.id === this.activeHotspot.data.id)
                this.activeHotspot.data = JSON.parse(JSON.stringify(data))
                this.activeHotspot.update(true, this.activeHotspot.data.button.title)
                this.activeHotspot.hide()
            }
            this.activeHotspot = null
            this.updateUIPanel()
            this.events.fire('hotspot:editing', false)
            if (this.isAutoPlay) this.stopAutoPlay()
        })
        this.events.on('hotspot:delete', (id) => {
            const idx = this.hotspots.findIndex((h) => h.id === id)
            if (idx < 0) return
            if (this.hotspots[idx].data.audio.src && this.hotspots[idx].data.audio.src.startsWith('blod:')) {
                URL.revokeObjectURL(this.hotspots[idx].data.audio.src)
            }
            this.hotspots[idx].destroy()
            if (this.activeHotspot?.id === id) {
                this.activeData = null
                this.activeHotspot = null
            }
            this.hotspots.splice(idx, 1)
            this.settings.hotspots.splice(idx, 1)
            this.updateUIPanel()
            this.events.fire('hotspot:editing', false)
            if (this.hotspots.length === 0) {
                this.dom?.hotspotActionGroup.classList.add('hidden')
                this.events.fire('hotspot:rebuild-info')
            }
        })

        this.events.on('hotspot:apply', (applyData) => {
            this.settings.hotspots = this.settings.hotspots.map((d) => {
                if (d.id === applyData.id) {
                    const newData = {
                        ...applyData,
                        entityInfo: this.controllers[this.state.cameraMode].getEntityInfo(),
                    }
                    if (this.activeHotspot) this.activeHotspot.data = newData
                    return newData
                }
                return d
            })
            this.activeData = null
            this.updateUIPanel()
            this.events.fire('hotspot:editing', false)
        })
        this.events.on('hotspot:reorder', ({ fromId, toId }) => {
            const fromDataIdx = this.settings.hotspots.findIndex((d) => d.id === fromId)
            const toDataIdx = this.settings.hotspots.findIndex((d) => d.id === toId)
            if (fromDataIdx < 0 || toDataIdx < 0) return
            ;[this.settings.hotspots[fromDataIdx], this.settings.hotspots[toDataIdx]] = [
                this.settings.hotspots[toDataIdx],
                this.settings.hotspots[fromDataIdx],
            ]
            const fromHotspotIdx = this.hotspots.findIndex((h) => h.id === fromId)
            const toHotspotIdx = this.hotspots.findIndex((h) => h.id === toId)
            ;[this.hotspots[fromHotspotIdx], this.hotspots[toHotspotIdx]] = [
                this.hotspots[toHotspotIdx],
                this.hotspots[fromHotspotIdx],
            ]
            this.hotspots.forEach((h) => {
                this.dom.hotspotContainer.appendChild(h.button.el)
            })
            this.updateUIPanel()
        })
        this.events.on('hotspot:editor', (editor) => {
            this.editor = editor
            this.updateUIPanel()
        })
        this.events.on('hotspot:start-auto', () => {
            this.startAutoPlay()
        })
        this.events.on('hotspot:stop-auto', () => {
            this.stopAutoPlay()
        })
        this.events.on('hotspot:hide-hotspot-btns', () => {
            this.showActiveHotspotBtns(false)
        })
        this.events.on('hotspot:show-hotspot-btns', () => {
            this.showActiveHotspotBtns(true)
        })
        this.events.on('hotspot:toggle-play', () => {
            if (this.isAutoPlay) this.stopAutoPlay()
            else this.startAutoPlay()
        })
        this.events.on('hotspot:hotspot-btns', () => {
            this.showActiveHotspotBtns(!this.isShowActiveHotspotBtns)
        })
    }
    resetActiveHotspotBtnName() {
        const restoreData = this.settings.hotspots.find((d) => d.id === this.activeData?.id)
        if (restoreData && this.activeHotspot) {
            this.activeHotspot.button.updateTitle(restoreData.button.title)
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
        const defaultName = `hotspot${this.settings.hotspots.length + 1}`
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
                strokeColor: 'white',
                stroke: 1,
                size: 30,
                topLeft: dotTL,
                botRight: dotBR,
            },
            entityInfo,
        }
    }
    isSameVec3(v1, v2, precision = 1e-5) {
        return (
            Math.abs(v1.x - v2.x) < precision && Math.abs(v1.y - v2.y) < precision && Math.abs(v1.z - v2.z) < precision
        )
    }
    isSameFloat(a, b, eps = 1e-4) {
        return Math.abs(a - b) < eps
    }
    isSamePose(hotspot) {
        const controller = this.controllers[this.state.cameraMode]
        if (!controller) return false
        const { position: p, rotation: r, focus: f, distanceScale: d } = hotspot.data.entityInfo
        return (
            this.isSameVec3(p, modelEntity.localPosition) &&
            this.isSameVec3(r, modelEntity.localRotation) &&
            this.isSameVec3(f, controller.focus) &&
            this.isSameFloat(controller.getActualDistance(d), controller.distance)
        )
    }
    setActive(hotspot, lerpDuration = 1.5) {
        if (!hotspot || !modelEntity) return
        this.activeHotspot?.hide()
        const isSamePose = this.isSamePose(hotspot)
        if (isSamePose && hotspot.id === this.activeHotspot?.id) {
            hotspot.show()
            hotspot.update()
            return true
        }
        if (isSamePose) {
            hotspot.show()
            hotspot.update()
            this.activeHotspot = hotspot
            return true
        }
        this.isTranslating = true
        this.activeHotspot = hotspot
        hotspot.button.setActiveColor()
        this.events.fire('ortery-controller:transition', {
            entityInfo: hotspot.data.entityInfo,
            lerpDuration,
            onTransitionFinished: () => {
                hotspot.show()
                hotspot.update()
                this.isTranslating = false
            },
        })
        return false
    }
    autoPlay() {
        if (this.hotspots.length === 0) return
        this.isAutoPlay = true
        const currentIdx = this.activeHotspot ? this.hotspots.findIndex((h) => h.id === this.activeHotspot.id) : -1
        const nextIdx = (currentIdx + 1) % this.hotspots.length
        const next = this.hotspots[nextIdx]
        const isSamePose = this.setActive(next, AUTO_PLAY_LERP_TIME)
        this.intervalID = setTimeout(
            () => this.autoPlay(),
            next.data.autoPlay.time + (isSamePose ? 0 : AUTO_PLAY_LERP_TIME * 1000),
        )
    }
    startAutoPlay() {
        this.dom.stopHotspot.classList.remove('hidden')
        this.dom.startHotspot.classList.add('hidden')
        this.autoPlay()
    }

    stopAutoPlay() {
        if (!this.isAutoPlay) return
        if (this.intervalID) {
            clearTimeout(this.intervalID)
            this.intervalID = null
        }
        this.dom.stopHotspot.classList.add('hidden')
        this.dom.startHotspot.classList.remove('hidden')
        this.isAutoPlay = false
    }
    showActiveHotspotBtns(show) {
        if (show) {
            this.dom.hideHotspotButton.classList.remove('hidden')
            this.dom.showHotspotButton.classList.add('hidden')
        } else {
            this.dom.hideHotspotButton.classList.add('hidden')
            this.dom.showHotspotButton.classList.remove('hidden')
        }
        this.isShowActiveHotspotBtns = show
        this.hotspots.forEach((h) => h.button.show(show))
    }
    updateHotspotData() {
        if (this.activeHotspot && this.activeData) {
            if (this.activeData) this.activeHotspot.data = JSON.parse(JSON.stringify(this.activeData))
            this.activeHotspot.update(true, this.activeData.button.title)
            this.activeHotspot.refreshAudio()
        }
    }
    updateUIPanel() {
        if (this.editor) this.editor.render(this.settings.hotspots, this.activeData)
    }
    update() {
        if (this.isTranslating) return
        this.hotspots.forEach((h) => {
            if (h.id === this.activeHotspot?.id) {
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
