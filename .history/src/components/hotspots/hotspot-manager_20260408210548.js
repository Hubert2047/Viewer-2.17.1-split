class HotspotManager {
    constructor({ global, dom, editor }) {
        this.camera = global.camera.camera
        this.events = global.events
        this.editable = global.config.editable
        this.editor = editor
        this.dom = dom
        this.state = global.state

        this.hotspots = []
        this.hotspotData = global.settings.hotspots

        this.activeHotspot = null
        this.activeData = null

        this.isAutoPlay = false
        this.intervalID = null
        this.listenEvents()
        this.controllers = null
        global.app.on('postrender', () => this.update())
    }

    listenEvents() {
        this.events.on('controllers:created', (controllers) => {
            this.controllers = controllers
        })
        this.events.on('hotspot:add', ({ position, entityInfo }) => {
            const data = this.createDefault(position, entityInfo)
            this.hotspotData.push(data)
            const h = new Hotspot(this.camera, this.dom, data)
            this.hotspots.push(h)
            this.events.fire('hotspot:editor-selected', data)
            this.events.fire('hotspot:editing', true)
        })
        this.events.on('hotspot:editor-selected', (selected) => {
            this.activeData = selected
            const activeHotspot =
                selected === null ? this.activeHotspot : this.hotspots.find((h) => h.id === selected.id)
            console.log(activeHotspot)
            this.update(true)
            if (activeHotspot) {
                this.setActive(activeHotspot, HOTSPOT_FADE_TIME)
            } else {
                this.events.fire('hotspot:editing', false)
            }
        })
        this.events.on('hotspot:hide-all', () => {
            this.activeData = null
            this.activeHotspot = null
            this.update(true)
            this.hideAll()
        })
        this.events.on('hotspot:editor-changed', (data) => {
            this.activeData = data
            this.update()
        })
        this.events.on('hotspot:editor-cancelled', () => {
            this.activeData = null
            this.activeHotspot = null
            this.update(true)
            this.events.fire('hotspot:editing', false)
        })
        this.events.on('hotspot:delete', (id) => {
            const idx = this.hotspots.findIndex((h) => h.id === id)
            if (idx < 0) return
            this.hotspots[idx].destroy()
            if (this.activeHotspot?.id === id) {
                this.activeData = null
                this.activeHotspot = null
            }
            this.hotspots.splice(idx, 1)
            this.hotspotData.splice(idx, 1)
            this.update(true)
            this.events.fire('hotspot:editing', false)
        })

        this.events.on('hotspot:apply', (data) => {
            this.hotspotData = this.hotspotData.map((d) => {
                if (d.id === data.id) return this.activeHotspot.data
                return d
            })
            this.activeData = null
            this.update(true)
            this.events.fire('hotspot:editing', false)
        })
    }
    createDefault(position, entityInfo) {
        const worldMatrix = modelEntity.gsplat.instance.meshInstance.node.getWorldTransform()
        const focusWorldPos = new Vec3()
        worldMatrix.transformPoint(position, focusWorldPos)
        const invWorldMatrix = new Mat4().copy(worldMatrix).invert()
        const focusScreenPos = this.camera.worldToScreen(focusWorldPos)
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

        return {
            id: guid.create(),
            autoPlay: { time: 3000 },
            button: { title: 'hotspot' },
            text: {
                color: 'black',
                bold: false,
                italic: false,
                align: 'center',
                content: 'hotspot',
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
                topLeft: position,
                botRight: null,
            },
            entityInfo,
        }
    }
    isSameVec3(v1, v2, precision = 1e-5) {
        return (
            Math.abs(v1.x - v2.x) < precision && Math.abs(v1.y - v2.y) < precision && Math.abs(v1.z - v2.z) < precision
        )
    }

    isSamePose(hotspot) {
        if (!this.activeHotspot) return true
        const controller = this.controllers[this.state.cameraMode]
        if (!controller) return false
        const { position: p, rotation: r, focus: f, distanceScale: d } = hotspot.data.entityInfo
        const aspect = f.aspect
        const restoredFocus = {
            x: f.x * aspect + controller.originFocus.x,
            y: f.y * aspect + controller.originFocus.y,
            z: f.z * aspect + controller.originFocus.z,
        }
        return (
            this.isSameVec3(p, modelEntity.localPosition) &&
            this.isSameVec3(r, modelEntity.localRotation) &&
            this.isSameVec3(restoredFocus, controller.focus) &&
            controller.getActualDistance(d) == controller.distance
        )
    }
    setActive(hotspot, lerpDuration = 1.5) {
        if (!hotspot || !modelEntity) return
        const isSamePose = this.isSamePose(hotspot)
        if (isSamePose && hotspot.id === this.activeHotspot?.id) {
            hotspot.show()
            return
        }
        if (isSamePose) {
            hotspot.show()
            this.activeHotspot = hotspot
            return
        }
        this.events.fire('ortery-controller:transition', {
            entityInfo: hotspot.data.entityInfo,
            lerpDuration,
            onTransitionFinished: () => {
                const h = this.hotspots.find((h) => h.id === hotspot.id)
                if (h) h.show()
            },
        })
        this.activeHotspot = hotspot
    }

    setActiveById(id) {
        const h = this.hotspots.find((h) => h.id === id)
        if (h) this.setActive(h, HOTSPOT_FADE_TIME)
    }

    autoPlay() {
        if (this.hotspots.length === 0) return
        this.isAutoPlay = true
        const currentIdx = this.activeHotspot ? this.hotspots.findIndex((h) => h.id === this.activeHotspot.id) : -1
        const nextIdx = (currentIdx + 1) % this.hotspots.length
        const next = this.hotspots[nextIdx]
        this.setActive(next, AUTO_PLAY_LERP_TIME)
        this.intervalID = setTimeout(() => this.autoPlay(), next.data.autoPlay.time + AUTO_PLAY_LERP_TIME * 1000)
    }

    stopAutoPlay() {
        if (this.intervalID) {
            clearTimeout(this.intervalID)
            this.intervalID = null
        }
        this.isAutoPlay = false
    }

    hideAll() {
        this.hotspots.forEach((h) => h.hide())
    }

    update(updateEditor = false) {
        if (updateEditor) {
            this.editor.render(this.hotspotData, this.activeData)
        }
        this.hotspots.forEach((h) => {
            if (h.id === this.activeHotspot?.id) {
                if (this.activeData) h.data = JSON.parse(JSON.stringify(this.activeData))
                h.update(true, this.activeData?.dot.size)
                h.show()
            }
        })
    }
}
