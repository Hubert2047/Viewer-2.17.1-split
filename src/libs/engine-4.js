class AppBase extends EventHandler {
    init(appOptions) {
        const {
            assetPrefix,
            batchManager,
            componentSystems,
            elementInput,
            gamepads,
            graphicsDevice,
            keyboard,
            lightmapper,
            mouse,
            resourceHandlers,
            scriptsOrder,
            scriptPrefix,
            soundManager,
            touch,
            xr,
        } = appOptions
        this.graphicsDevice = graphicsDevice
        ShaderChunks.get(graphicsDevice, SHADERLANGUAGE_GLSL).add(shaderChunksGLSL)
        ShaderChunks.get(graphicsDevice, SHADERLANGUAGE_WGSL).add(shaderChunksWGSL)
        this._initDefaultMaterial()
        this._initProgramLibrary()
        this.stats = new ApplicationStats(graphicsDevice)
        this._soundManager = soundManager
        this.scene = new Scene(graphicsDevice)
        this._registerSceneImmediate(this.scene)
        this.assets = new AssetRegistry(this.loader)
        if (assetPrefix) this.assets.prefix = assetPrefix
        this.bundles = new BundleRegistry(this.assets)
        this.scriptsOrder = scriptsOrder || []
        this.defaultLayerWorld = new Layer({
            name: 'World',
            id: LAYERID_WORLD,
        })
        this.defaultLayerDepth = new Layer({
            name: 'Depth',
            id: LAYERID_DEPTH,
            enabled: false,
            opaqueSortMode: SORTMODE_NONE,
        })
        this.defaultLayerSkybox = new Layer({
            name: 'Skybox',
            id: LAYERID_SKYBOX,
            opaqueSortMode: SORTMODE_NONE,
        })
        this.defaultLayerUi = new Layer({
            name: 'UI',
            id: LAYERID_UI,
            transparentSortMode: SORTMODE_MANUAL,
        })
        this.defaultLayerImmediate = new Layer({
            name: 'Immediate',
            id: LAYERID_IMMEDIATE,
            opaqueSortMode: SORTMODE_NONE,
        })
        const defaultLayerComposition = new LayerComposition('default')
        defaultLayerComposition.pushOpaque(this.defaultLayerWorld)
        defaultLayerComposition.pushOpaque(this.defaultLayerDepth)
        defaultLayerComposition.pushOpaque(this.defaultLayerSkybox)
        defaultLayerComposition.pushTransparent(this.defaultLayerWorld)
        defaultLayerComposition.pushOpaque(this.defaultLayerImmediate)
        defaultLayerComposition.pushTransparent(this.defaultLayerImmediate)
        defaultLayerComposition.pushTransparent(this.defaultLayerUi)
        this.scene.layers = defaultLayerComposition
        AreaLightLuts.createPlaceholder(graphicsDevice)
        this.renderer = new ForwardRenderer(graphicsDevice, this.scene)
        if (lightmapper) {
            this.lightmapper = new lightmapper(graphicsDevice, this.root, this.scene, this.renderer, this.assets)
            this.once('prerender', this._firstBake, this)
        }
        if (batchManager) {
            this._batcher = new batchManager(graphicsDevice, this.root, this.scene)
            this.once('prerender', this._firstBatch, this)
        }
        this.keyboard = keyboard || null
        this.mouse = mouse || null
        this.touch = touch || null
        this.gamepads = gamepads || null
        if (elementInput) {
            this.elementInput = elementInput
            this.elementInput.app = this
        }
        this.xr = xr ? new xr(this) : null
        if (this.elementInput) this.elementInput.attachSelectEvents()
        this._scriptPrefix = scriptPrefix || ''
        if (this.enableBundles) {
            this.loader.addHandler('bundle', new BundleHandler(this))
        }
        resourceHandlers.forEach((resourceHandler) => {
            const handler = new resourceHandler(this)
            this.loader.addHandler(handler.handlerType, handler)
        })
        componentSystems.forEach((componentSystem) => {
            this.systems.add(new componentSystem(this))
        })
        this._visibilityChangeHandler = this.onVisibilityChange.bind(this)
        if (typeof document !== 'undefined') {
            if (document.hidden !== undefined) {
                this._hiddenAttr = 'hidden'
                document.addEventListener('visibilitychange', this._visibilityChangeHandler, false)
            } else if (document.mozHidden !== undefined) {
                this._hiddenAttr = 'mozHidden'
                document.addEventListener('mozvisibilitychange', this._visibilityChangeHandler, false)
            } else if (document.msHidden !== undefined) {
                this._hiddenAttr = 'msHidden'
                document.addEventListener('msvisibilitychange', this._visibilityChangeHandler, false)
            } else if (document.webkitHidden !== undefined) {
                this._hiddenAttr = 'webkitHidden'
                document.addEventListener('webkitvisibilitychange', this._visibilityChangeHandler, false)
            }
        }
        this.tick = makeTick(this)
    }
    static getApplication(id) {
        return id ? AppBase._applications[id] : getApplication()
    }
    _initDefaultMaterial() {
        const material = new StandardMaterial()
        material.name = 'Default Material'
        setDefaultMaterial(this.graphicsDevice, material)
    }
    _initProgramLibrary() {
        const library = new ProgramLibrary(this.graphicsDevice, new StandardMaterial())
        setProgramLibrary(this.graphicsDevice, library)
    }
    get soundManager() {
        return this._soundManager
    }
    get batcher() {
        return this._batcher
    }
    get fillMode() {
        return this._fillMode
    }
    get resolutionMode() {
        return this._resolutionMode
    }
    configure(url, callback) {
        http.get(url, (err, response) => {
            if (err) {
                callback(err)
                return
            }
            const props = response.application_properties
            const scenes = response.scenes
            const assets = response.assets
            this._parseApplicationProperties(props, (err) => {
                this._parseScenes(scenes)
                this._parseAssets(assets)
                if (!err) {
                    callback(null)
                } else {
                    callback(err)
                }
            })
        })
    }
    preload(callback) {
        this.fire('preload:start')
        const assets = this.assets.list({
            preload: true,
        })
        if (assets.length === 0) {
            this.fire('preload:end')
            callback()
            return
        }
        let loadedCount = 0
        const onAssetLoadOrError = () => {
            loadedCount++
            this.fire('preload:progress', loadedCount / assets.length)
            if (loadedCount === assets.length) {
                this.fire('preload:end')
                callback()
            }
        }
        assets.forEach((asset) => {
            if (!asset.loaded) {
                asset.once('load', onAssetLoadOrError)
                asset.once('error', onAssetLoadOrError)
                this.assets.load(asset)
            } else {
                onAssetLoadOrError()
            }
        })
    }
    _preloadScripts(sceneData, callback) {
        callback()
    }
    _parseApplicationProperties(props, callback) {
        if (typeof props.maxAssetRetries === 'number' && props.maxAssetRetries > 0) {
            this.loader.enableRetry(props.maxAssetRetries)
        }
        if (!props.useDevicePixelRatio) {
            props.useDevicePixelRatio = props.use_device_pixel_ratio
        }
        if (!props.resolutionMode) {
            props.resolutionMode = props.resolution_mode
        }
        if (!props.fillMode) {
            props.fillMode = props.fill_mode
        }
        this._width = props.width
        this._height = props.height
        if (props.useDevicePixelRatio) {
            this.graphicsDevice.maxPixelRatio = window.devicePixelRatio
        }
        this.setCanvasResolution(props.resolutionMode, this._width, this._height)
        this.setCanvasFillMode(props.fillMode, this._width, this._height)
        if (props.layers && props.layerOrder) {
            const composition = new LayerComposition('application')
            const layers = {}
            for (const key in props.layers) {
                const data = props.layers[key]
                data.id = parseInt(key, 10)
                data.enabled = data.id !== LAYERID_DEPTH
                layers[key] = new Layer(data)
            }
            for (let i = 0, len = props.layerOrder.length; i < len; i++) {
                const sublayer = props.layerOrder[i]
                const layer = layers[sublayer.layer]
                if (!layer) continue
                if (sublayer.transparent) {
                    composition.pushTransparent(layer)
                } else {
                    composition.pushOpaque(layer)
                }
                composition.subLayerEnabled[i] = sublayer.enabled
            }
            this.scene.layers = composition
        }
        if (props.batchGroups) {
            const batcher = this.batcher
            if (batcher) {
                for (let i = 0, len = props.batchGroups.length; i < len; i++) {
                    const grp = props.batchGroups[i]
                    batcher.addGroup(grp.name, grp.dynamic, grp.maxAabbSize, grp.id, grp.layers)
                }
            }
        }
        if (props.i18nAssets) {
            this.i18n.assets = props.i18nAssets
        }
        this._loadLibraries(props.libraries, callback)
    }
    _loadLibraries(urls, callback) {
        const len = urls.length
        let count = len
        const regex = /^https?:\/\//
        if (len) {
            const onLoad = (err, script) => {
                count--
                if (err) {
                    callback(err)
                } else if (count === 0) {
                    this.onLibrariesLoaded()
                    callback(null)
                }
            }
            for (let i = 0; i < len; ++i) {
                let url = urls[i]
                if (!regex.test(url.toLowerCase()) && this._scriptPrefix) {
                    url = path.join(this._scriptPrefix, url)
                }
                this.loader.load(url, 'script', onLoad)
            }
        } else {
            this.onLibrariesLoaded()
            callback(null)
        }
    }
    _parseScenes(scenes) {
        if (!scenes) return
        for (let i = 0; i < scenes.length; i++) {
            this.scenes.add(scenes[i].name, scenes[i].url)
        }
    }
    _parseAssets(assets) {
        const list = []
        const scriptsIndex = {}
        const bundlesIndex = {}
        for (let i = 0; i < this.scriptsOrder.length; i++) {
            const id = this.scriptsOrder[i]
            if (!assets[id]) {
                continue
            }
            scriptsIndex[id] = true
            list.push(assets[id])
        }
        if (this.enableBundles) {
            for (const id in assets) {
                if (assets[id].type === 'bundle') {
                    bundlesIndex[id] = true
                    list.push(assets[id])
                }
            }
        }
        for (const id in assets) {
            if (scriptsIndex[id] || bundlesIndex[id]) {
                continue
            }
            list.push(assets[id])
        }
        for (let i = 0; i < list.length; i++) {
            const data = list[i]
            const asset = new Asset(data.name, data.type, data.file, data.data)
            asset.id = parseInt(data.id, 10)
            asset.preload = data.preload ? data.preload : false
            asset.loaded = data.type === 'script' && data.data && data.data.loadingType > 0
            asset.tags.add(data.tags)
            if (data.i18n) {
                for (const locale in data.i18n) {
                    asset.addLocalizedAssetId(locale, data.i18n[locale])
                }
            }
            this.assets.add(asset)
        }
    }
    start() {
        this.frame = 0
        this.fire('start', {
            timestamp: now(),
            target: this,
        })
        if (!this._librariesLoaded) {
            this.onLibrariesLoaded()
        }
        this.systems.fire('initialize', this.root)
        this.fire('initialize')
        this.systems.fire('postInitialize', this.root)
        this.systems.fire('postPostInitialize', this.root)
        this.fire('postinitialize')
        this.requestAnimationFrame()
    }
    requestAnimationFrame() {
        if (this.xr?.session) {
            this.frameRequestId = this.xr.session.requestAnimationFrame(this.tick)
        } else {
            this.frameRequestId = platform.browser || platform.worker ? requestAnimationFrame(this.tick) : null
        }
    }
    inputUpdate(dt) {
        if (this.controller) {
            this.controller.update(dt)
        }
        if (this.mouse) {
            this.mouse.update()
        }
        if (this.keyboard) {
            this.keyboard.update()
        }
        if (this.gamepads) {
            this.gamepads.update()
        }
    }
    update(dt) {
        this.frame++
        this.graphicsDevice.update()
        this.stats.frame.scriptUpdateStart = now()
        this.systems.fire(this._inTools ? 'toolsUpdate' : 'update', dt)
        this.stats.frame.scriptUpdate = now() - this.stats.frame.scriptUpdateStart
        this.stats.frame.animUpdateStart = now()
        this.systems.fire('animationUpdate', dt)
        this.stats.frame.animUpdate = now() - this.stats.frame.animUpdateStart
        this.stats.frame.scriptPostUpdateStart = now()
        this.systems.fire('postUpdate', dt)
        this.stats.frame.scriptPostUpdate = now() - this.stats.frame.scriptPostUpdateStart
        this.fire('update', dt)
        this.inputUpdate(dt)
    }
    render() {
        this.updateCanvasSize()
        this.graphicsDevice.frameStart()
        this.fire('prerender')
        this.root.syncHierarchy()
        if (this._batcher) {
            this._batcher.updateAll()
        }
        this.renderComposition(this.scene.layers)
        this.fire('postrender')
        this.stats.frame.renderTime = now() - this.stats.frame.renderStart
        this.graphicsDevice.frameEnd()
    }
    renderComposition(layerComposition) {
        this.renderer.update(layerComposition)
        this.renderer.buildFrameGraph(this.frameGraph, layerComposition)
        this.frameGraph.render(this.graphicsDevice)
    }
    _fillFrameStatsBasic(now, dt, ms) {
        const stats = this.stats.frame
        stats.dt = dt
        stats.ms = ms
        if (now > stats._timeToCountFrames) {
            stats.fps = stats._fpsAccum
            stats._fpsAccum = 0
            stats._timeToCountFrames = now + 1000
        } else {
            stats._fpsAccum++
        }
        this.stats.drawCalls.total = this.graphicsDevice._drawCallsPerFrame
        this.graphicsDevice._drawCallsPerFrame = 0
        stats.gsplats = this.renderer._gsplatCount
        stats.gsplatBufferCopy = this.renderer._gsplatBufferCopy ?? 0
    }
    _fillFrameStats() {
        let stats = this.stats.frame
        stats.cameras = this.renderer._camerasRendered
        stats.materials = this.renderer._materialSwitches
        stats.shaders = this.graphicsDevice._shaderSwitchesPerFrame
        stats.shadowMapUpdates = this.renderer._shadowMapUpdates
        stats.shadowMapTime = this.renderer._shadowMapTime
        stats.depthMapTime = this.renderer._depthMapTime
        stats.forwardTime = this.renderer._forwardTime
        const prims = this.graphicsDevice._primsPerFrame
        stats.triangles =
            prims[PRIMITIVE_TRIANGLES] / 3 +
            Math.max(prims[PRIMITIVE_TRISTRIP] - 2, 0) +
            Math.max(prims[PRIMITIVE_TRIFAN] - 2, 0)
        stats.cullTime = this.renderer._cullTime
        stats.sortTime = this.renderer._sortTime
        stats.skinTime = this.renderer._skinTime
        stats.morphTime = this.renderer._morphTime
        stats.lightClusters = this.renderer._lightClusters
        stats.lightClustersTime = this.renderer._lightClustersTime
        stats.otherPrimitives = 0
        for (let i = 0; i < prims.length; i++) {
            if (i < PRIMITIVE_TRIANGLES) {
                stats.otherPrimitives += prims[i]
            }
            prims[i] = 0
        }
        this.renderer._camerasRendered = 0
        this.renderer._materialSwitches = 0
        this.renderer._shadowMapUpdates = 0
        this.graphicsDevice._shaderSwitchesPerFrame = 0
        this.renderer._cullTime = 0
        this.renderer._layerCompositionUpdateTime = 0
        this.renderer._lightClustersTime = 0
        this.renderer._sortTime = 0
        this.renderer._skinTime = 0
        this.renderer._morphTime = 0
        this.renderer._shadowMapTime = 0
        this.renderer._depthMapTime = 0
        this.renderer._forwardTime = 0
        stats = this.stats.drawCalls
        stats.forward = this.renderer._forwardDrawCalls
        stats.culled = this.renderer._numDrawCallsCulled
        stats.depth = 0
        stats.shadow = this.renderer._shadowDrawCalls
        stats.skinned = this.renderer._skinDrawCalls
        stats.immediate = 0
        stats.instanced = 0
        stats.removedByInstancing = 0
        stats.misc = stats.total - (stats.forward + stats.shadow)
        this.renderer._depthDrawCalls = 0
        this.renderer._shadowDrawCalls = 0
        this.renderer._forwardDrawCalls = 0
        this.renderer._numDrawCallsCulled = 0
        this.renderer._skinDrawCalls = 0
        this.renderer._immediateRendered = 0
        this.renderer._instancedDrawCalls = 0
        this.stats.misc.renderTargetCreationTime = this.graphicsDevice.renderTargetCreationTime
        stats = this.stats.particles
        stats.updatesPerFrame = stats._updatesPerFrame
        stats.frameTime = stats._frameTime
        stats._updatesPerFrame = 0
        stats._frameTime = 0
    }
    setCanvasFillMode(mode, width, height) {
        this._fillMode = mode
        this.resizeCanvas(width, height)
    }
    setCanvasResolution(mode, width, height) {
        this._resolutionMode = mode
        if (mode === RESOLUTION_AUTO && width === undefined) {
            width = this.graphicsDevice.canvas.clientWidth
            height = this.graphicsDevice.canvas.clientHeight
        }
        this.graphicsDevice.resizeCanvas(width, height)
    }
    isHidden() {
        return document[this._hiddenAttr]
    }
    onVisibilityChange() {
        if (this.isHidden()) {
            if (this._soundManager) {
                this._soundManager.suspend()
            }
        } else {
            if (this._soundManager) {
                this._soundManager.resume()
            }
        }
    }
    resizeCanvas(width, height) {
        if (!this._allowResize) return undefined
        if (this.xr && this.xr.session) {
            return undefined
        }
        const windowWidth = window.innerWidth
        const windowHeight = window.innerHeight
        if (this._fillMode === FILLMODE_KEEP_ASPECT) {
            const r = this.graphicsDevice.canvas.width / this.graphicsDevice.canvas.height
            const winR = windowWidth / windowHeight
            if (r > winR) {
                width = windowWidth
                height = width / r
            } else {
                height = windowHeight
                width = height * r
            }
        } else if (this._fillMode === FILLMODE_FILL_WINDOW) {
            width = windowWidth
            height = windowHeight
        }
        this.graphicsDevice.canvas.style.width = `${width}px`
        this.graphicsDevice.canvas.style.height = `${height}px`
        this.updateCanvasSize()
        return {
            width: width,
            height: height,
        }
    }
    updateCanvasSize() {
        if (!this._allowResize || this.xr?.active) {
            return
        }
        if (this._resolutionMode === RESOLUTION_AUTO) {
            const canvas = this.graphicsDevice.canvas
            this.graphicsDevice.resizeCanvas(canvas.clientWidth, canvas.clientHeight)
        }
    }
    onLibrariesLoaded() {
        this._librariesLoaded = true
        if (this.systems.rigidbody) {
            this.systems.rigidbody.onLibraryLoaded()
        }
    }
    applySceneSettings(settings) {
        let asset
        if (this.systems.rigidbody && typeof Ammo !== 'undefined') {
            const [x, y, z] = settings.physics.gravity
            this.systems.rigidbody.gravity.set(x, y, z)
        }
        this.scene.applySettings(settings)
        if (settings.render.hasOwnProperty('skybox')) {
            if (settings.render.skybox) {
                asset = this.assets.get(settings.render.skybox)
                if (asset) {
                    this.setSkybox(asset)
                } else {
                    this.assets.once(`add:${settings.render.skybox}`, this.setSkybox, this)
                }
            } else {
                this.setSkybox(null)
            }
        }
    }
    setAreaLightLuts(ltcMat1, ltcMat2) {
        if (ltcMat1 && ltcMat2) {
            AreaLightLuts.set(this.graphicsDevice, ltcMat1, ltcMat2)
        }
    }
    setSkybox(asset) {
        if (asset !== this._skyboxAsset) {
            const onSkyboxRemoved = () => {
                this.setSkybox(null)
            }
            const onSkyboxChanged = () => {
                this.scene.setSkybox(this._skyboxAsset ? this._skyboxAsset.resources : null)
            }
            if (this._skyboxAsset) {
                this.assets.off(`load:${this._skyboxAsset.id}`, onSkyboxChanged, this)
                this.assets.off(`remove:${this._skyboxAsset.id}`, onSkyboxRemoved, this)
                this._skyboxAsset.off('change', onSkyboxChanged, this)
            }
            this._skyboxAsset = asset
            if (this._skyboxAsset) {
                this.assets.on(`load:${this._skyboxAsset.id}`, onSkyboxChanged, this)
                this.assets.once(`remove:${this._skyboxAsset.id}`, onSkyboxRemoved, this)
                this._skyboxAsset.on('change', onSkyboxChanged, this)
                if (this.scene.skyboxMip === 0 && !this._skyboxAsset.loadFaces) {
                    this._skyboxAsset.loadFaces = true
                }
                this.assets.load(this._skyboxAsset)
            }
            onSkyboxChanged()
        }
    }
    _firstBake() {
        this.lightmapper?.bake(null, this.scene.lightmapMode)
    }
    _firstBatch() {
        this.batcher?.generate()
    }
    _processTimestamp(timestamp) {
        return timestamp
    }
    drawLine(start, end, color, depthTest, layer) {
        this.scene.drawLine(start, end, color, depthTest, layer)
    }
    drawLines(positions, colors, depthTest = true, layer = this.scene.defaultDrawLayer) {
        this.scene.drawLines(positions, colors, depthTest, layer)
    }
    drawLineArrays(positions, colors, depthTest = true, layer = this.scene.defaultDrawLayer) {
        this.scene.drawLineArrays(positions, colors, depthTest, layer)
    }
    drawWireSphere(
        center,
        radius,
        color = Color.WHITE,
        segments = 20,
        depthTest = true,
        layer = this.scene.defaultDrawLayer,
    ) {
        this.scene.immediate.drawWireSphere(center, radius, color, segments, depthTest, layer)
    }
    drawWireAlignedBox(
        minPoint,
        maxPoint,
        color = Color.WHITE,
        depthTest = true,
        layer = this.scene.defaultDrawLayer,
        mat,
    ) {
        this.scene.immediate.drawWireAlignedBox(minPoint, maxPoint, color, depthTest, layer, mat)
    }
    drawMeshInstance(meshInstance, layer = this.scene.defaultDrawLayer) {
        this.scene.immediate.drawMesh(null, null, null, meshInstance, layer)
    }
    drawMesh(mesh, material, matrix, layer = this.scene.defaultDrawLayer) {
        this.scene.immediate.drawMesh(material, matrix, mesh, null, layer)
    }
    drawQuad(matrix, material, layer = this.scene.defaultDrawLayer) {
        this.scene.immediate.drawMesh(material, matrix, this.scene.immediate.getQuadMesh(), null, layer)
    }
    drawTexture(x, y, width, height, texture, material, layer = this.scene.defaultDrawLayer, filterable = true) {
        if (filterable === false && !this.graphicsDevice.isWebGPU) {
            return
        }
        const matrix = new Mat4()
        matrix.setTRS(new Vec3(x, y, 0.0), Quat.IDENTITY, new Vec3(width, -height, 0.0))
        if (!material) {
            material = new ShaderMaterial()
            material.cull = CULLFACE_NONE
            material.setParameter('colorMap', texture)
            material.shaderDesc = filterable
                ? this.scene.immediate.getTextureShaderDesc(texture.encoding)
                : this.scene.immediate.getUnfilterableTextureShaderDesc()
            material.update()
        }
        this.drawQuad(matrix, material, layer)
    }
    drawDepthTexture(x, y, width, height, layer = this.scene.defaultDrawLayer) {
        const material = new ShaderMaterial()
        material.cull = CULLFACE_NONE
        material.shaderDesc = this.scene.immediate.getDepthTextureShaderDesc()
        material.update()
        this.drawTexture(x, y, width, height, null, material, layer)
    }
    destroy() {
        if (this._inFrameUpdate) {
            this._destroyRequested = true
            return
        }
        const canvasId = this.graphicsDevice.canvas.id
        this.fire('destroy', this)
        this.off('librariesloaded')
        this._gsplatSortedEvt?.off()
        this._gsplatSortedEvt = null
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this._visibilityChangeHandler, false)
            document.removeEventListener('mozvisibilitychange', this._visibilityChangeHandler, false)
            document.removeEventListener('msvisibilitychange', this._visibilityChangeHandler, false)
            document.removeEventListener('webkitvisibilitychange', this._visibilityChangeHandler, false)
        }
        this._visibilityChangeHandler = null
        this.root.destroy()
        this.root = null
        if (this.mouse) {
            this.mouse.off()
            this.mouse.detach()
            this.mouse = null
        }
        if (this.keyboard) {
            this.keyboard.off()
            this.keyboard.detach()
            this.keyboard = null
        }
        if (this.touch) {
            this.touch.off()
            this.touch.detach()
            this.touch = null
        }
        if (this.elementInput) {
            this.elementInput.detach()
            this.elementInput = null
        }
        if (this.gamepads) {
            this.gamepads.destroy()
            this.gamepads = null
        }
        if (this.controller) {
            this.controller = null
        }
        this.systems.destroy()
        if (this.scene.layers) {
            this.scene.layers.destroy()
        }
        this.bundles.destroy()
        this.bundles = null
        this.i18n.destroy()
        this.i18n = null
        const scriptHandler = this.loader.getHandler('script')
        scriptHandler?.clearCache()
        this.loader.destroy()
        this.loader = null
        this.systems = null
        this.context = null
        this.scripts.destroy()
        this.scripts = null
        this.scenes.destroy()
        this.scenes = null
        this.lightmapper?.destroy()
        this.lightmapper = null
        if (this._batcher) {
            this._batcher.destroy()
            this._batcher = null
        }
        this._entityIndex = {}
        this.defaultLayerDepth.onDisable = null
        this.defaultLayerDepth.onEnable = null
        this.defaultLayerDepth = null
        this.defaultLayerWorld = null
        this.xr?.end()
        this.xr?.destroy()
        this.renderer.destroy()
        this.renderer = null
        const assets = this.assets.list()
        for (let i = 0; i < assets.length; i++) {
            assets[i].unload()
            assets[i].off()
        }
        this.assets.off()
        this.scene.destroy()
        this.scene = null
        this.graphicsDevice.destroy()
        this.graphicsDevice = null
        this.tick = null
        this.off()
        this._soundManager?.destroy()
        this._soundManager = null
        AppBase._applications[canvasId] = null
        if (getApplication() === this) {
            setApplication(null)
        }
        AppBase.cancelTick(this)
    }
    static cancelTick(app) {
        if (app.frameRequestId) {
            cancelAnimationFrame(app.frameRequestId)
            app.frameRequestId = undefined
        }
    }
    getEntityFromIndex(guid) {
        return this._entityIndex[guid]
    }
    _registerSceneImmediate(scene) {
        this.on('postrender', scene.immediate.onPostRender, scene.immediate)
        this._gsplatSortedEvt = scene.on('gsplat:sorted', (sortTime) => {
            this.stats.frame.gsplatSort += sortTime
        })
    }
    constructor(canvas) {
        ;(super(),
            (this._batcher = null),
            (this._destroyRequested = false),
            (this._inFrameUpdate = false),
            (this._librariesLoaded = false),
            (this._fillMode = FILLMODE_KEEP_ASPECT),
            (this._resolutionMode = RESOLUTION_FIXED),
            (this._allowResize = true),
            (this._skyboxAsset = null),
            (this._entityIndex = {}),
            (this._inTools = false),
            (this._scriptPrefix = ''),
            (this._time = 0),
            (this.enableBundles = typeof TextDecoder !== 'undefined'),
            (this.timeScale = 1),
            (this.maxDeltaTime = 0.1),
            (this.frame = 0),
            (this.frameGraph = new FrameGraph()),
            (this.scriptsOrder = []),
            (this.autoRender = true),
            (this.renderNextFrame = false),
            (this.lightmapper = null),
            (this.loader = new ResourceLoader(this)),
            (this.scenes = new SceneRegistry(this)),
            (this.scripts = new ScriptRegistry(this)),
            (this.systems = new ComponentSystemRegistry()),
            (this.i18n = new I18n(this)),
            (this.keyboard = null),
            (this.mouse = null),
            (this.touch = null),
            (this.gamepads = null),
            (this.elementInput = null),
            (this.xr = null))
        AppBase._applications[canvas.id] = this
        setApplication(this)
        this.root = new Entity()
        this.root._enabledInHierarchy = true
    }
}
AppBase._applications = {}
const makeTick = function (_app) {
    const application = _app
    return function (timestamp, xrFrame) {
        if (!application.graphicsDevice) {
            return
        }
        if (application.frameRequestId) {
            application.xr?.session?.cancelAnimationFrame(application.frameRequestId)
            cancelAnimationFrame(application.frameRequestId)
            application.frameRequestId = null
        }
        application._inFrameUpdate = true
        setApplication(application)
        const currentTime = application._processTimestamp(timestamp) || now()
        const ms = currentTime - (application._time || currentTime)
        let dt = ms / 1000.0
        dt = math.clamp(dt, 0, application.maxDeltaTime)
        dt *= application.timeScale
        application._time = currentTime
        application.requestAnimationFrame()
        if (application.graphicsDevice.contextLost) {
            return
        }
        application._fillFrameStatsBasic(currentTime, dt, ms)
        application.fire('frameupdate', ms)
        let skipUpdate = false
        if (xrFrame) {
            skipUpdate = !application.xr?.update(xrFrame)
            application.graphicsDevice.defaultFramebuffer = xrFrame.session.renderState.baseLayer.framebuffer
        } else {
            application.graphicsDevice.defaultFramebuffer = null
        }
        if (!skipUpdate) {
            application.update(dt)
            application.fire('framerender')
            if (application.autoRender || application.renderNextFrame) {
                application.render()
                application.renderNextFrame = false
            }
            application.fire('frameend')
            application.stats.frameEnd()
        }
        application._inFrameUpdate = false
        if (application._destroyRequested) {
            application.destroy()
        }
    }
}

class AppOptions {
    constructor() {
        this.componentSystems = []
        this.resourceHandlers = []
    }
}

class Component extends EventHandler {
    static _buildAccessors(obj, schema) {
        schema.forEach((descriptor) => {
            const name = typeof descriptor === 'object' ? descriptor.name : descriptor
            Object.defineProperty(obj, name, {
                get: function () {
                    return this.data[name]
                },
                set: function (value) {
                    const data = this.data
                    const oldValue = data[name]
                    data[name] = value
                    this.fire('set', name, oldValue, value)
                },
                configurable: true,
            })
        })
        obj._accessorsBuilt = true
    }
    buildAccessors(schema) {
        Component._buildAccessors(this, schema)
    }
    onSetEnabled(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (this.entity.enabled) {
                if (newValue) {
                    this.onEnable()
                } else {
                    this.onDisable()
                }
            }
        }
    }
    onEnable() {}
    onDisable() {}
    onPostStateChange() {}
    get data() {
        const record = this.system.store[this.entity.getGuid()]
        return record ? record.data : null
    }
    set enabled(arg) {}
    get enabled() {
        return true
    }
    constructor(system, entity) {
        super()
        this.system = system
        this.entity = entity
        if (this.system.schema && !this._accessorsBuilt) {
            this.buildAccessors(this.system.schema)
        }
        this.on('set', function (name, oldValue, newValue) {
            this.fire(`set_${name}`, name, oldValue, newValue)
        })
        this.on('set_enabled', this.onSetEnabled, this)
    }
}
Component.order = 0

class ComponentSystem extends EventHandler {
    addComponent(entity, data = {}) {
        const component = new this.ComponentType(this, entity)
        const componentData = new this.DataType()
        this.store[entity.getGuid()] = {
            entity: entity,
            data: componentData,
        }
        entity[this.id] = component
        entity.c[this.id] = component
        this.initializeComponentData(component, data, [])
        this.fire('add', entity, component)
        return component
    }
    removeComponent(entity) {
        const id = this.id
        const record = this.store[entity.getGuid()]
        const component = entity.c[id]
        component.fire('beforeremove')
        this.fire('beforeremove', entity, component)
        delete this.store[entity.getGuid()]
        entity[id] = undefined
        delete entity.c[id]
        this.fire('remove', entity, record.data)
    }
    cloneComponent(entity, clone) {
        const src = this.store[entity.getGuid()]
        return this.addComponent(clone, src.data)
    }
    initializeComponentData(component, data = {}, properties) {
        for (let i = 0, len = properties.length; i < len; i++) {
            const descriptor = properties[i]
            let name, type
            if (typeof descriptor === 'object') {
                name = descriptor.name
                type = descriptor.type
            } else {
                name = descriptor
                type = undefined
            }
            let value = data[name]
            if (value !== undefined) {
                if (type !== undefined) {
                    value = convertValue(value, type)
                }
                component[name] = value
            } else {
                component[name] = component.data[name]
            }
        }
        if (component.enabled && component.entity.enabled) {
            component.onEnable()
        }
    }
    getPropertiesOfType(type) {
        const matchingProperties = []
        const schema = this.schema || []
        schema.forEach((descriptor) => {
            if (descriptor && typeof descriptor === 'object' && descriptor.type === type) {
                matchingProperties.push(descriptor)
            }
        })
        return matchingProperties
    }
    destroy() {
        this.off()
    }
    constructor(app) {
        super()
        this.app = app
        this.store = {}
        this.schema = []
    }
}
function convertValue(value, type) {
    if (!value) {
        return value
    }
    switch (type) {
        case 'rgb':
            if (value instanceof Color) {
                return value.clone()
            }
            return new Color(value[0], value[1], value[2])
        case 'rgba':
            if (value instanceof Color) {
                return value.clone()
            }
            return new Color(value[0], value[1], value[2], value[3])
        case 'vec2':
            if (value instanceof Vec2) {
                return value.clone()
            }
            return new Vec2(value[0], value[1])
        case 'vec3':
            if (value instanceof Vec3) {
                return value.clone()
            }
            return new Vec3(value[0], value[1], value[2])
        case 'vec4':
            if (value instanceof Vec4) {
                return value.clone()
            }
            return new Vec4(value[0], value[1], value[2], value[3])
        case 'boolean':
        case 'number':
        case 'string':
            return value
        case 'entity':
            return value
        default:
            throw new Error(`Could not convert unhandled type: ${type}`)
    }
}

const INTERPOLATION_STEP = 0
const INTERPOLATION_LINEAR = 1
const INTERPOLATION_CUBIC = 2

class AnimEvents {
    get events() {
        return this._events
    }
    constructor(events) {
        this._events = [...events]
        this._events.sort((a, b) => a.time - b.time)
    }
}

class AnimTrack {
    get name() {
        return this._name
    }
    get duration() {
        return this._duration
    }
    get inputs() {
        return this._inputs
    }
    get outputs() {
        return this._outputs
    }
    get curves() {
        return this._curves
    }
    set events(animEvents) {
        this._animEvents = animEvents
    }
    get events() {
        return this._animEvents.events
    }
    eval(time, snapshot) {
        snapshot._time = time
        const inputs = this._inputs
        const outputs = this._outputs
        const curves = this._curves
        const cache = snapshot._cache
        const results = snapshot._results
        for (let i = 0; i < inputs.length; ++i) {
            cache[i].update(time, inputs[i]._data)
        }
        for (let i = 0; i < curves.length; ++i) {
            const curve = curves[i]
            const output = outputs[curve._output]
            const result = results[i]
            cache[curve._input].eval(result, curve._interpolation, output)
        }
    }
    constructor(name, duration, inputs, outputs, curves, animEvents = new AnimEvents([])) {
        this._name = name
        this._duration = duration
        this._inputs = inputs
        this._outputs = outputs
        this._curves = curves
        this._animEvents = animEvents
    }
}
AnimTrack.EMPTY = Object.freeze(new AnimTrack('empty', Number.MAX_VALUE, [], [], []))

class PrimitivesCache {
    destroy(device) {
        this.map.forEach((primData) => primData.mesh.destroy())
    }
    constructor() {
        this.map = new Map()
    }
}
const _primitivesCache = new DeviceCache()
const getShapePrimitive = (device, type) => {
    const cache = _primitivesCache.get(device, () => {
        return new PrimitivesCache()
    })
    let primData = cache.map.get(type)
    if (!primData) {
        let mesh, area
        switch (type) {
            case 'box':
                mesh = Mesh.fromGeometry(device, new BoxGeometry())
                area = {
                    x: 2,
                    y: 2,
                    z: 2,
                    uv: 2.0 / 3,
                }
                break
            case 'capsule':
                mesh = Mesh.fromGeometry(
                    device,
                    new CapsuleGeometry({
                        radius: 0.5,
                        height: 2,
                    }),
                )
                area = {
                    x: Math.PI * 2,
                    y: Math.PI,
                    z: Math.PI * 2,
                    uv: 1.0 / 3 + (1.0 / 3 / 3) * 2,
                }
                break
            case 'cone':
                mesh = Mesh.fromGeometry(
                    device,
                    new ConeGeometry({
                        baseRadius: 0.5,
                        peakRadius: 0,
                        height: 1,
                    }),
                )
                area = {
                    x: 2.54,
                    y: 2.54,
                    z: 2.54,
                    uv: 1.0 / 3 + 1.0 / 3 / 3,
                }
                break
            case 'cylinder':
                mesh = Mesh.fromGeometry(
                    device,
                    new CylinderGeometry({
                        radius: 0.5,
                        height: 1,
                    }),
                )
                area = {
                    x: Math.PI,
                    y: 0.79 * 2,
                    z: Math.PI,
                    uv: 1.0 / 3 + (1.0 / 3 / 3) * 2,
                }
                break
            case 'plane':
                mesh = Mesh.fromGeometry(
                    device,
                    new PlaneGeometry({
                        halfExtents: new Vec2(0.5, 0.5),
                        widthSegments: 1,
                        lengthSegments: 1,
                    }),
                )
                area = {
                    x: 0,
                    y: 1,
                    z: 0,
                    uv: 1,
                }
                break
            case 'sphere':
                mesh = Mesh.fromGeometry(
                    device,
                    new SphereGeometry({
                        radius: 0.5,
                    }),
                )
                area = {
                    x: Math.PI,
                    y: Math.PI,
                    z: Math.PI,
                    uv: 1,
                }
                break
            case 'torus':
                mesh = Mesh.fromGeometry(
                    device,
                    new TorusGeometry({
                        tubeRadius: 0.2,
                        ringRadius: 0.3,
                    }),
                )
                area = {
                    x: Math.PI * 0.5 * 0.5 - Math.PI * 0.1 * 0.1,
                    y: 0.4,
                    z: 0.4,
                    uv: 1,
                }
                break
            default:
                throw new Error(`Invalid primitive type: ${type}`)
        }
        mesh.incRefCount()
        primData = {
            mesh: mesh,
            area: area,
        }
        cache.map.set(type, primData)
    }
    return primData
}

class SkinInstanceCachedObject extends RefCountedObject {
    constructor(skin, skinInstance) {
        super()
        this.skin = skin
        this.skinInstance = skinInstance
    }
}
class SkinInstanceCache {
    static createCachedSkinInstance(skin, rootBone, entity) {
        let skinInst = SkinInstanceCache.getCachedSkinInstance(skin, rootBone)
        if (!skinInst) {
            skinInst = new SkinInstance(skin)
            skinInst.resolve(rootBone, entity)
            SkinInstanceCache.addCachedSkinInstance(skin, rootBone, skinInst)
        }
        return skinInst
    }
    static getCachedSkinInstance(skin, rootBone) {
        let skinInstance = null
        const cachedObjArray = SkinInstanceCache._skinInstanceCache.get(rootBone)
        if (cachedObjArray) {
            const cachedObj = cachedObjArray.find((element) => element.skin === skin)
            if (cachedObj) {
                cachedObj.incRefCount()
                skinInstance = cachedObj.skinInstance
            }
        }
        return skinInstance
    }
    static addCachedSkinInstance(skin, rootBone, skinInstance) {
        let cachedObjArray = SkinInstanceCache._skinInstanceCache.get(rootBone)
        if (!cachedObjArray) {
            cachedObjArray = []
            SkinInstanceCache._skinInstanceCache.set(rootBone, cachedObjArray)
        }
        let cachedObj = cachedObjArray.find((element) => element.skin === skin)
        if (!cachedObj) {
            cachedObj = new SkinInstanceCachedObject(skin, skinInstance)
            cachedObjArray.push(cachedObj)
        }
        cachedObj.incRefCount()
    }
    static removeCachedSkinInstance(skinInstance) {
        if (skinInstance) {
            const rootBone = skinInstance.rootBone
            if (rootBone) {
                const cachedObjArray = SkinInstanceCache._skinInstanceCache.get(rootBone)
                if (cachedObjArray) {
                    const cachedObjIndex = cachedObjArray.findIndex((element) => element.skinInstance === skinInstance)
                    if (cachedObjIndex >= 0) {
                        const cachedObj = cachedObjArray[cachedObjIndex]
                        cachedObj.decRefCount()
                        if (cachedObj.refCount === 0) {
                            cachedObjArray.splice(cachedObjIndex, 1)
                            if (!cachedObjArray.length) {
                                SkinInstanceCache._skinInstanceCache.delete(rootBone)
                            }
                            if (skinInstance) {
                                skinInstance.destroy()
                                cachedObj.skinInstance = null
                            }
                        }
                    }
                }
            }
        }
    }
}
SkinInstanceCache._skinInstanceCache = new Map()

class AssetReference {
    set id(value) {
        if (this.url) throw Error("Can't set id and url")
        this._unbind()
        this._id = value
        this.asset = this._registry.get(this._id)
        this._bind()
    }
    get id() {
        return this._id
    }
    set url(value) {
        if (this.id) throw Error("Can't set id and url")
        this._unbind()
        this._url = value
        this.asset = this._registry.getByUrl(this._url)
        this._bind()
    }
    get url() {
        return this._url
    }
    _bind() {
        if (this.id) {
            if (this._onAssetLoad) this._evtLoadById = this._registry.on(`load:${this.id}`, this._onLoad, this)
            if (this._onAssetAdd) this._evtAddById = this._registry.once(`add:${this.id}`, this._onAdd, this)
            if (this._onAssetRemove) this._evtRemoveById = this._registry.on(`remove:${this.id}`, this._onRemove, this)
            if (this._onAssetUnload) this._evtUnloadById = this._registry.on(`unload:${this.id}`, this._onUnload, this)
        }
        if (this.url) {
            if (this._onAssetLoad) this._evtLoadByUrl = this._registry.on(`load:url:${this.url}`, this._onLoad, this)
            if (this._onAssetAdd) this._evtAddByUrl = this._registry.once(`add:url:${this.url}`, this._onAdd, this)
            if (this._onAssetRemove)
                this._evtRemoveByUrl = this._registry.on(`remove:url:${this.url}`, this._onRemove, this)
        }
    }
    _unbind() {
        if (this.id) {
            this._evtLoadById?.off()
            this._evtLoadById = null
            this._evtAddById?.off()
            this._evtAddById = null
            this._evtRemoveById?.off()
            this._evtRemoveById = null
            this._evtUnloadById?.off()
            this._evtUnloadById = null
        }
        if (this.url) {
            this._evtLoadByUrl?.off()
            this._evtLoadByUrl = null
            this._evtAddByUrl?.off()
            this._evtAddByUrl = null
            this._evtRemoveByUrl?.off()
            this._evtRemoveByUrl = null
        }
    }
    _onLoad(asset) {
        this._onAssetLoad.call(this._scope, this.propertyName, this.parent, asset)
    }
    _onAdd(asset) {
        this.asset = asset
        this._onAssetAdd.call(this._scope, this.propertyName, this.parent, asset)
    }
    _onRemove(asset) {
        this._onAssetRemove.call(this._scope, this.propertyName, this.parent, asset)
        this.asset = null
    }
    _onUnload(asset) {
        this._onAssetUnload.call(this._scope, this.propertyName, this.parent, asset)
    }
    constructor(propertyName, parent, registry, callbacks, scope) {
        this._evtLoadById = null
        this._evtUnloadById = null
        this._evtAddById = null
        this._evtRemoveById = null
        this._evtLoadByUrl = null
        this._evtAddByUrl = null
        this._evtRemoveByUrl = null
        this.propertyName = propertyName
        this.parent = parent
        this._scope = scope
        this._registry = registry
        this.id = null
        this.url = null
        this.asset = null
        this._onAssetLoad = callbacks.load
        this._onAssetAdd = callbacks.add
        this._onAssetRemove = callbacks.remove
        this._onAssetUnload = callbacks.unload
    }
}

class RenderComponent extends Component {
    set renderStyle(renderStyle) {
        if (this._renderStyle !== renderStyle) {
            this._renderStyle = renderStyle
            MeshInstance._prepareRenderStyleForArray(this._meshInstances, renderStyle)
        }
    }
    get renderStyle() {
        return this._renderStyle
    }
    set customAabb(value) {
        this._customAabb = value
        const mi = this._meshInstances
        if (mi) {
            for (let i = 0; i < mi.length; i++) {
                mi[i].setCustomAabb(this._customAabb)
            }
        }
    }
    get customAabb() {
        return this._customAabb
    }
    set type(value) {
        if (this._type !== value) {
            this._area = null
            this._type = value
            this.destroyMeshInstances()
            if (value !== 'asset') {
                let material = this._material
                if (!material || material === this.system.defaultMaterial) {
                    material =
                        this._materialReferences[0] &&
                        this._materialReferences[0].asset &&
                        this._materialReferences[0].asset.resource
                }
                const primData = getShapePrimitive(this.system.app.graphicsDevice, value)
                this._area = primData.area
                this.meshInstances = [
                    new MeshInstance(primData.mesh, material || this.system.defaultMaterial, this.entity),
                ]
            }
        }
    }
    get type() {
        return this._type
    }
    set meshInstances(value) {
        this.destroyMeshInstances()
        this._meshInstances = value
        if (this._meshInstances) {
            const mi = this._meshInstances
            for (let i = 0; i < mi.length; i++) {
                if (!mi[i].node) {
                    mi[i].node = this.entity
                }
                mi[i].castShadow = this._castShadows
                mi[i].receiveShadow = this._receiveShadows
                mi[i].renderStyle = this._renderStyle
                mi[i].setLightmapped(this._lightmapped)
                mi[i].setCustomAabb(this._customAabb)
            }
            if (this.enabled && this.entity.enabled) {
                this.addToLayers()
            }
        }
    }
    get meshInstances() {
        return this._meshInstances
    }
    set lightmapped(value) {
        if (value !== this._lightmapped) {
            this._lightmapped = value
            const mi = this._meshInstances
            if (mi) {
                for (let i = 0; i < mi.length; i++) {
                    mi[i].setLightmapped(value)
                }
            }
        }
    }
    get lightmapped() {
        return this._lightmapped
    }
    set castShadows(value) {
        if (this._castShadows !== value) {
            const mi = this._meshInstances
            if (mi) {
                const layers = this.layers
                const scene = this.system.app.scene
                if (this._castShadows && !value) {
                    for (let i = 0; i < layers.length; i++) {
                        const layer = scene.layers.getLayerById(this.layers[i])
                        if (layer) {
                            layer.removeShadowCasters(mi)
                        }
                    }
                }
                for (let i = 0; i < mi.length; i++) {
                    mi[i].castShadow = value
                }
                if (!this._castShadows && value) {
                    for (let i = 0; i < layers.length; i++) {
                        const layer = scene.layers.getLayerById(layers[i])
                        if (layer) {
                            layer.addShadowCasters(mi)
                        }
                    }
                }
            }
            this._castShadows = value
        }
    }
    get castShadows() {
        return this._castShadows
    }
    set receiveShadows(value) {
        if (this._receiveShadows !== value) {
            this._receiveShadows = value
            const mi = this._meshInstances
            if (mi) {
                for (let i = 0; i < mi.length; i++) {
                    mi[i].receiveShadow = value
                }
            }
        }
    }
    get receiveShadows() {
        return this._receiveShadows
    }
    set castShadowsLightmap(value) {
        this._castShadowsLightmap = value
    }
    get castShadowsLightmap() {
        return this._castShadowsLightmap
    }
    set lightmapSizeMultiplier(value) {
        this._lightmapSizeMultiplier = value
    }
    get lightmapSizeMultiplier() {
        return this._lightmapSizeMultiplier
    }
    set layers(value) {
        const layers = this.system.app.scene.layers
        let layer
        if (this._meshInstances) {
            for (let i = 0; i < this._layers.length; i++) {
                layer = layers.getLayerById(this._layers[i])
                if (layer) {
                    layer.removeMeshInstances(this._meshInstances)
                }
            }
        }
        this._layers.length = 0
        for (let i = 0; i < value.length; i++) {
            this._layers[i] = value[i]
        }
        if (!this.enabled || !this.entity.enabled || !this._meshInstances) return
        for (let i = 0; i < this._layers.length; i++) {
            layer = layers.getLayerById(this._layers[i])
            if (layer) {
                layer.addMeshInstances(this._meshInstances)
            }
        }
    }
    get layers() {
        return this._layers
    }
    set batchGroupId(value) {
        if (this._batchGroupId !== value) {
            if (this.entity.enabled && this._batchGroupId >= 0) {
                this.system.app.batcher?.remove(BatchGroup.RENDER, this.batchGroupId, this.entity)
            }
            if (this.entity.enabled && value >= 0) {
                this.system.app.batcher?.insert(BatchGroup.RENDER, value, this.entity)
            }
            if (value < 0 && this._batchGroupId >= 0 && this.enabled && this.entity.enabled) {
                this.addToLayers()
            }
            this._batchGroupId = value
        }
    }
    get batchGroupId() {
        return this._batchGroupId
    }
    set material(value) {
        if (this._material !== value) {
            this._material = value
            if (this._meshInstances && this._type !== 'asset') {
                for (let i = 0; i < this._meshInstances.length; i++) {
                    this._meshInstances[i].material = value
                }
            }
        }
    }
    get material() {
        return this._material
    }
    set materialAssets(value = []) {
        if (this._materialReferences.length > value.length) {
            for (let i = value.length; i < this._materialReferences.length; i++) {
                this._materialReferences[i].id = null
            }
            this._materialReferences.length = value.length
        }
        for (let i = 0; i < value.length; i++) {
            if (!this._materialReferences[i]) {
                this._materialReferences.push(
                    new AssetReference(
                        i,
                        this,
                        this.system.app.assets,
                        {
                            add: this._onMaterialAdded,
                            load: this._onMaterialLoad,
                            remove: this._onMaterialRemove,
                            unload: this._onMaterialUnload,
                        },
                        this,
                    ),
                )
            }
            if (value[i]) {
                const id = value[i] instanceof Asset ? value[i].id : value[i]
                if (this._materialReferences[i].id !== id) {
                    this._materialReferences[i].id = id
                }
                if (this._materialReferences[i].asset) {
                    this._onMaterialAdded(i, this, this._materialReferences[i].asset)
                }
            } else {
                this._materialReferences[i].id = null
                if (this._meshInstances[i]) {
                    this._meshInstances[i].material = this.system.defaultMaterial
                }
            }
        }
    }
    get materialAssets() {
        return this._materialReferences.map((ref) => {
            return ref.id
        })
    }
    set asset(value) {
        const id = value instanceof Asset ? value.id : value
        if (this._assetReference.id === id) return
        if (this._assetReference.asset && this._assetReference.asset.resource) {
            this._onRenderAssetRemove()
        }
        this._assetReference.id = id
        if (this._assetReference.asset) {
            this._onRenderAssetAdded()
        }
    }
    get asset() {
        return this._assetReference.id
    }
    assignAsset(asset) {
        const id = asset instanceof Asset ? asset.id : asset
        this._assetReference.id = id
    }
    set rootBone(value) {
        if (this._rootBone !== value) {
            const isString = typeof value === 'string'
            if (this._rootBone && isString && this._rootBone.getGuid() === value) {
                return
            }
            if (this._rootBone) {
                this._clearSkinInstances()
            }
            if (value instanceof GraphNode) {
                this._rootBone = value
            } else if (isString) {
                this._rootBone = this.system.app.getEntityFromIndex(value) || null
                if (!this._rootBone);
            } else {
                this._rootBone = null
            }
            if (this._rootBone) {
                this._cloneSkinInstances()
            }
        }
    }
    get rootBone() {
        return this._rootBone
    }
    destroyMeshInstances() {
        const meshInstances = this._meshInstances
        if (meshInstances) {
            this.removeFromLayers()
            this._clearSkinInstances()
            for (let i = 0; i < meshInstances.length; i++) {
                meshInstances[i].destroy()
            }
            this._meshInstances.length = 0
        }
    }
    addToLayers() {
        const layers = this.system.app.scene.layers
        for (let i = 0; i < this._layers.length; i++) {
            const layer = layers.getLayerById(this._layers[i])
            if (layer) {
                layer.addMeshInstances(this._meshInstances)
            }
        }
    }
    removeFromLayers() {
        if (this._meshInstances && this._meshInstances.length) {
            const layers = this.system.app.scene.layers
            for (let i = 0; i < this._layers.length; i++) {
                const layer = layers.getLayerById(this._layers[i])
                if (layer) {
                    layer.removeMeshInstances(this._meshInstances)
                }
            }
        }
    }
    onRemoveChild() {
        this.removeFromLayers()
    }
    onInsertChild() {
        if (this._meshInstances && this.enabled && this.entity.enabled) {
            this.addToLayers()
        }
    }
    onRemove() {
        this.destroyMeshInstances()
        this.asset = null
        this.materialAsset = null
        this._assetReference.id = null
        for (let i = 0; i < this._materialReferences.length; i++) {
            this._materialReferences[i].id = null
        }
        this.entity.off('remove', this.onRemoveChild, this)
        this.entity.off('insert', this.onInsertChild, this)
    }
    onLayersChanged(oldComp, newComp) {
        this.addToLayers()
        oldComp.off('add', this.onLayerAdded, this)
        oldComp.off('remove', this.onLayerRemoved, this)
        newComp.on('add', this.onLayerAdded, this)
        newComp.on('remove', this.onLayerRemoved, this)
    }
    onLayerAdded(layer) {
        const index = this.layers.indexOf(layer.id)
        if (index < 0) return
        layer.addMeshInstances(this._meshInstances)
    }
    onLayerRemoved(layer) {
        const index = this.layers.indexOf(layer.id)
        if (index < 0) return
        layer.removeMeshInstances(this._meshInstances)
    }
    onEnable() {
        const app = this.system.app
        const scene = app.scene
        const layers = scene.layers
        if (this._rootBone) {
            this._cloneSkinInstances()
        }
        this._evtLayersChanged = scene.on('set:layers', this.onLayersChanged, this)
        if (layers) {
            this._evtLayerAdded = layers.on('add', this.onLayerAdded, this)
            this._evtLayerRemoved = layers.on('remove', this.onLayerRemoved, this)
        }
        const isAsset = this._type === 'asset'
        if (this._meshInstances && this._meshInstances.length) {
            this.addToLayers()
        } else if (isAsset && this.asset) {
            this._onRenderAssetAdded()
        }
        for (let i = 0; i < this._materialReferences.length; i++) {
            if (this._materialReferences[i].asset) {
                this.system.app.assets.load(this._materialReferences[i].asset)
            }
        }
        if (this._batchGroupId >= 0) {
            app.batcher?.insert(BatchGroup.RENDER, this.batchGroupId, this.entity)
        }
    }
    onDisable() {
        const app = this.system.app
        const scene = app.scene
        const layers = scene.layers
        this._evtLayersChanged?.off()
        this._evtLayersChanged = null
        if (this._rootBone) {
            this._clearSkinInstances()
        }
        if (layers) {
            this._evtLayerAdded?.off()
            this._evtLayerAdded = null
            this._evtLayerRemoved?.off()
            this._evtLayerRemoved = null
        }
        if (this._batchGroupId >= 0) {
            app.batcher?.remove(BatchGroup.RENDER, this.batchGroupId, this.entity)
        }
        this.removeFromLayers()
    }
    hide() {
        if (this._meshInstances) {
            for (let i = 0; i < this._meshInstances.length; i++) {
                this._meshInstances[i].visible = false
            }
        }
    }
    show() {
        if (this._meshInstances) {
            for (let i = 0; i < this._meshInstances.length; i++) {
                this._meshInstances[i].visible = true
            }
        }
    }
    _onRenderAssetAdded() {
        if (!this._assetReference.asset) return
        if (this._assetReference.asset.resource) {
            this._onRenderAssetLoad()
        } else if (this.enabled && this.entity.enabled) {
            this.system.app.assets.load(this._assetReference.asset)
        }
    }
    _onRenderAssetLoad() {
        this.destroyMeshInstances()
        if (this._assetReference.asset) {
            const render = this._assetReference.asset.resource
            this._evtSetMeshes?.off()
            this._evtSetMeshes = render.on('set:meshes', this._onSetMeshes, this)
            if (render.meshes) {
                this._onSetMeshes(render.meshes)
            }
        }
    }
    _onSetMeshes(meshes) {
        this._cloneMeshes(meshes)
    }
    _clearSkinInstances() {
        for (let i = 0; i < this._meshInstances.length; i++) {
            const meshInstance = this._meshInstances[i]
            SkinInstanceCache.removeCachedSkinInstance(meshInstance.skinInstance)
            meshInstance.skinInstance = null
        }
    }
    _cloneSkinInstances() {
        if (this._meshInstances.length && this._rootBone instanceof GraphNode) {
            for (let i = 0; i < this._meshInstances.length; i++) {
                const meshInstance = this._meshInstances[i]
                const mesh = meshInstance.mesh
                if (mesh.skin && !meshInstance.skinInstance) {
                    meshInstance.skinInstance = SkinInstanceCache.createCachedSkinInstance(
                        mesh.skin,
                        this._rootBone,
                        this.entity,
                    )
                }
            }
        }
    }
    _cloneMeshes(meshes) {
        if (meshes && meshes.length) {
            const meshInstances = []
            for (let i = 0; i < meshes.length; i++) {
                const mesh = meshes[i]
                const material =
                    this._materialReferences[i] &&
                    this._materialReferences[i].asset &&
                    this._materialReferences[i].asset.resource
                const meshInst = new MeshInstance(mesh, material || this.system.defaultMaterial, this.entity)
                meshInstances.push(meshInst)
                if (mesh.morph) {
                    meshInst.morphInstance = new MorphInstance(mesh.morph)
                }
            }
            this.meshInstances = meshInstances
            this._cloneSkinInstances()
        }
    }
    _onRenderAssetUnload() {
        if (this._type === 'asset') {
            this.destroyMeshInstances()
        }
    }
    _onRenderAssetRemove() {
        this._evtSetMeshes?.off()
        this._evtSetMeshes = null
        this._onRenderAssetUnload()
    }
    _onMaterialAdded(index, component, asset) {
        if (asset.resource) {
            this._onMaterialLoad(index, component, asset)
        } else {
            if (this.enabled && this.entity.enabled) {
                this.system.app.assets.load(asset)
            }
        }
    }
    _updateMainMaterial(index, material) {
        if (index === 0) {
            this.material = material
        }
    }
    _onMaterialLoad(index, component, asset) {
        if (this._meshInstances[index]) {
            this._meshInstances[index].material = asset.resource
        }
        this._updateMainMaterial(index, asset.resource)
    }
    _onMaterialRemove(index, component, asset) {
        if (this._meshInstances[index]) {
            this._meshInstances[index].material = this.system.defaultMaterial
        }
        this._updateMainMaterial(index, this.system.defaultMaterial)
    }
    _onMaterialUnload(index, component, asset) {
        if (this._meshInstances[index]) {
            this._meshInstances[index].material = this.system.defaultMaterial
        }
        this._updateMainMaterial(index, this.system.defaultMaterial)
    }
    resolveDuplicatedEntityReferenceProperties(oldRender, duplicatedIdsMap) {
        if (oldRender.rootBone) {
            this.rootBone = duplicatedIdsMap[oldRender.rootBone.getGuid()]
        }
    }
    constructor(system, entity) {
        ;(super(system, entity),
            (this._type = 'asset'),
            (this._castShadows = true),
            (this._receiveShadows = true),
            (this._castShadowsLightmap = true),
            (this._lightmapped = false),
            (this._lightmapSizeMultiplier = 1),
            (this.isStatic = false),
            (this._batchGroupId = -1),
            (this._layers = [LAYERID_WORLD]),
            (this._renderStyle = RENDERSTYLE_SOLID),
            (this._meshInstances = []),
            (this._customAabb = null),
            (this._area = null),
            (this._materialReferences = []),
            (this._rootBone = null),
            (this._evtLayersChanged = null),
            (this._evtLayerAdded = null),
            (this._evtLayerRemoved = null),
            (this._evtSetMeshes = null))
        this._assetReference = new AssetReference(
            'asset',
            this,
            system.app.assets,
            {
                add: this._onRenderAssetAdded,
                load: this._onRenderAssetLoad,
                remove: this._onRenderAssetRemove,
                unload: this._onRenderAssetUnload,
            },
            this,
        )
        this._material = system.defaultMaterial
        entity.on('remove', this.onRemoveChild, this)
        entity.on('removehierarchy', this.onRemoveChild, this)
        entity.on('insert', this.onInsertChild, this)
        entity.on('inserthierarchy', this.onInsertChild, this)
    }
}

class RenderComponentData {
    constructor() {
        this.enabled = true
    }
}

const _schema$2 = ['enabled']
const _properties$1 = [
    'material',
    'meshInstances',
    'asset',
    'materialAssets',
    'castShadows',
    'receiveShadows',
    'castShadowsLightmap',
    'lightmapped',
    'lightmapSizeMultiplier',
    'renderStyle',
    'type',
    'layers',
    'isStatic',
    'batchGroupId',
    'rootBone',
]
class RenderComponentSystem extends ComponentSystem {
    initializeComponentData(component, _data, properties) {
        if (_data.batchGroupId === null || _data.batchGroupId === undefined) {
            _data.batchGroupId = -1
        }
        if (_data.layers && _data.layers.length) {
            _data.layers = _data.layers.slice(0)
        }
        for (let i = 0; i < _properties$1.length; i++) {
            if (_data.hasOwnProperty(_properties$1[i])) {
                component[_properties$1[i]] = _data[_properties$1[i]]
            }
        }
        if (_data.aabbCenter && _data.aabbHalfExtents) {
            component.customAabb = new BoundingBox(new Vec3(_data.aabbCenter), new Vec3(_data.aabbHalfExtents))
        }
        super.initializeComponentData(component, _data, _schema$2)
    }
    cloneComponent(entity, clone) {
        const data = {}
        for (let i = 0; i < _properties$1.length; i++) {
            data[_properties$1[i]] = entity.render[_properties$1[i]]
        }
        data.enabled = entity.render.enabled
        delete data.meshInstances
        const component = this.addComponent(clone, data)
        const srcMeshInstances = entity.render.meshInstances
        const meshes = srcMeshInstances.map((mi) => mi.mesh)
        component._onSetMeshes(meshes)
        for (let m = 0; m < srcMeshInstances.length; m++) {
            component.meshInstances[m].material = srcMeshInstances[m].material
        }
        if (entity.render.customAabb) {
            component.customAabb = entity.render.customAabb.clone()
        }
        return component
    }
    onRemove(entity, component) {
        component.onRemove()
    }
    constructor(app) {
        super(app)
        this.id = 'render'
        this.ComponentType = RenderComponent
        this.DataType = RenderComponentData
        this.schema = _schema$2
        this.defaultMaterial = getDefaultMaterial(app.graphicsDevice)
        this.on('beforeremove', this.onRemove, this)
    }
}
Component._buildAccessors(RenderComponent.prototype, _schema$2)

class PostEffectEntry {
    constructor(effect, inputTarget) {
        this.effect = effect
        this.inputTarget = inputTarget
        this.outputTarget = null
        this.name = effect.constructor.name
    }
}
class PostEffectQueue {
    _allocateColorBuffer(format, name) {
        const rect = this.camera.rect
        const renderTarget = this.destinationRenderTarget
        const device = this.app.graphicsDevice
        const width = Math.floor(rect.z * (renderTarget?.width ?? device.width))
        const height = Math.floor(rect.w * (renderTarget?.height ?? device.height))
        const colorBuffer = Texture.createDataTexture2D(device, name, width, height, format)
        return colorBuffer
    }
    _createOffscreenTarget(useDepth, hdr) {
        const device = this.app.graphicsDevice
        const outputRt = this.destinationRenderTarget ?? device.backBuffer
        const srgb = outputRt.isColorBufferSrgb(0)
        const format =
            (hdr && device.getRenderableHdrFormat([PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F], true)) ??
            (srgb ? PIXELFORMAT_SRGBA8 : PIXELFORMAT_RGBA8)
        const name = `${this.camera.entity.name}-posteffect-${this.effects.length}`
        const colorBuffer = this._allocateColorBuffer(format, name)
        return new RenderTarget({
            colorBuffer: colorBuffer,
            depth: useDepth,
            stencil: useDepth && this.app.graphicsDevice.supportsStencil,
            samples: useDepth ? device.samples : 1,
        })
    }
    _resizeOffscreenTarget(rt) {
        const format = rt.colorBuffer.format
        const name = rt.colorBuffer.name
        rt.destroyFrameBuffers()
        rt.destroyTextureBuffers()
        rt._colorBuffer = this._allocateColorBuffer(format, name)
        rt._colorBuffers = [rt._colorBuffer]
        rt.evaluateDimensions()
    }
    _destroyOffscreenTarget(rt) {
        rt.destroyTextureBuffers()
        rt.destroy()
    }
    addEffect(effect) {
        const effects = this.effects
        const isFirstEffect = effects.length === 0
        const inputTarget = this._createOffscreenTarget(isFirstEffect, effect.hdr)
        const newEntry = new PostEffectEntry(effect, inputTarget)
        effects.push(newEntry)
        this._sourceTarget = newEntry.inputTarget
        if (effects.length > 1) {
            effects[effects.length - 2].outputTarget = newEntry.inputTarget
        }
        this._newPostEffect = effect
        if (effect.needsDepthBuffer) {
            this._requestDepthMap()
        }
        this.enable()
        this._newPostEffect = undefined
    }
    removeEffect(effect) {
        let index = -1
        for (let i = 0, len = this.effects.length; i < len; i++) {
            if (this.effects[i].effect === effect) {
                index = i
                break
            }
        }
        if (index >= 0) {
            if (index > 0) {
                this.effects[index - 1].outputTarget =
                    index + 1 < this.effects.length ? this.effects[index + 1].inputTarget : null
            } else {
                if (this.effects.length > 1) {
                    if (!this.effects[1].inputTarget._depth) {
                        this._destroyOffscreenTarget(this.effects[1].inputTarget)
                        this.effects[1].inputTarget = this._createOffscreenTarget(true, this.effects[1].hdr)
                        this._sourceTarget = this.effects[1].inputTarget
                    }
                    this.camera.renderTarget = this.effects[1].inputTarget
                }
            }
            this._destroyOffscreenTarget(this.effects[index].inputTarget)
            this.effects.splice(index, 1)
        }
        if (this.enabled) {
            if (effect.needsDepthBuffer) {
                this._releaseDepthMap()
            }
        }
        if (this.effects.length === 0) {
            this.disable()
        }
    }
    _requestDepthMaps() {
        for (let i = 0, len = this.effects.length; i < len; i++) {
            const effect = this.effects[i].effect
            if (this._newPostEffect === effect) {
                continue
            }
            if (effect.needsDepthBuffer) {
                this._requestDepthMap()
            }
        }
    }
    _releaseDepthMaps() {
        for (let i = 0, len = this.effects.length; i < len; i++) {
            const effect = this.effects[i].effect
            if (effect.needsDepthBuffer) {
                this._releaseDepthMap()
            }
        }
    }
    _requestDepthMap() {
        const depthLayer = this.app.scene.layers.getLayerById(LAYERID_DEPTH)
        if (depthLayer) {
            depthLayer.incrementCounter()
            this.camera.requestSceneDepthMap(true)
        }
    }
    _releaseDepthMap() {
        const depthLayer = this.app.scene.layers.getLayerById(LAYERID_DEPTH)
        if (depthLayer) {
            depthLayer.decrementCounter()
            this.camera.requestSceneDepthMap(false)
        }
    }
    destroy() {
        for (let i = 0, len = this.effects.length; i < len; i++) {
            this.effects[i].inputTarget.destroy()
        }
        this.effects.length = 0
        this.disable()
    }
    enable() {
        if (!this.enabled && this.effects.length) {
            this.enabled = true
            this._requestDepthMaps()
            this.app.graphicsDevice.on('resizecanvas', this._onCanvasResized, this)
            this.destinationRenderTarget = this.camera.renderTarget
            this.camera.renderTarget = this.effects[0].inputTarget
            this.camera.onPostprocessing = () => {
                if (this.enabled) {
                    let rect = null
                    const len = this.effects.length
                    if (len) {
                        for (let i = 0; i < len; i++) {
                            const fx = this.effects[i]
                            let destTarget = fx.outputTarget
                            if (i === len - 1) {
                                rect = this.camera.rect
                                if (this.destinationRenderTarget) {
                                    destTarget = this.destinationRenderTarget
                                }
                            }
                            fx.effect.render(fx.inputTarget, destTarget, rect)
                        }
                    }
                }
            }
        }
    }
    disable() {
        if (this.enabled) {
            this.enabled = false
            this.app.graphicsDevice.off('resizecanvas', this._onCanvasResized, this)
            this._releaseDepthMaps()
            this._destroyOffscreenTarget(this._sourceTarget)
            this.camera.renderTarget = this.destinationRenderTarget
            this.camera.onPostprocessing = null
        }
    }
    _onCanvasResized(width, height) {
        const rect = this.camera.rect
        const renderTarget = this.destinationRenderTarget
        width = renderTarget?.width ?? width
        height = renderTarget?.height ?? height
        this.camera.camera.aspectRatio = (width * rect.z) / (height * rect.w)
        this.resizeRenderTargets()
    }
    resizeRenderTargets() {
        const device = this.app.graphicsDevice
        const renderTarget = this.destinationRenderTarget
        const width = renderTarget?.width ?? device.width
        const height = renderTarget?.height ?? device.height
        const rect = this.camera.rect
        const desiredWidth = Math.floor(rect.z * width)
        const desiredHeight = Math.floor(rect.w * height)
        const effects = this.effects
        for (let i = 0, len = effects.length; i < len; i++) {
            const fx = effects[i]
            if (fx.inputTarget.width !== desiredWidth || fx.inputTarget.height !== desiredHeight) {
                this._resizeOffscreenTarget(fx.inputTarget)
            }
        }
    }
    onCameraRectChanged(name, oldValue, newValue) {
        if (this.enabled) {
            this.resizeRenderTargets()
        }
    }
    constructor(app, camera) {
        this.app = app
        this.camera = camera
        this.destinationRenderTarget = null
        this.effects = []
        this.enabled = false
        this.depthTarget = null
        camera.on('set:rect', this.onCameraRectChanged, this)
    }
}

class CameraComponent extends Component {
    setShaderPass(name) {
        const shaderPass = ShaderPass.get(this.system.app.graphicsDevice)
        const shaderPassInfo = name
            ? shaderPass.allocate(name, {
                  isForward: true,
              })
            : null
        this._camera.shaderPassInfo = shaderPassInfo
        return shaderPassInfo.index
    }
    getShaderPass() {
        return this._camera.shaderPassInfo?.name
    }
    set renderPasses(passes) {
        this._camera.renderPasses = passes || []
        this.dirtyLayerCompositionCameras()
        this.system.app.scene.updateShaders = true
    }
    get renderPasses() {
        return this._camera.renderPasses
    }
    get shaderParams() {
        return this._camera.shaderParams
    }
    set gammaCorrection(value) {
        this.camera.shaderParams.gammaCorrection = value
    }
    get gammaCorrection() {
        return this.camera.shaderParams.gammaCorrection
    }
    set toneMapping(value) {
        this.camera.shaderParams.toneMapping = value
    }
    get toneMapping() {
        return this.camera.shaderParams.toneMapping
    }
    set fog(value) {
        this._camera.fogParams = value
    }
    get fog() {
        return this._camera.fogParams
    }
    set aperture(value) {
        this._camera.aperture = value
    }
    get aperture() {
        return this._camera.aperture
    }
    set aspectRatio(value) {
        this._camera.aspectRatio = value
    }
    get aspectRatio() {
        return this._camera.aspectRatio
    }
    set aspectRatioMode(value) {
        this._camera.aspectRatioMode = value
    }
    get aspectRatioMode() {
        return this._camera.aspectRatioMode
    }
    set calculateProjection(value) {
        this._camera.calculateProjection = value
    }
    get calculateProjection() {
        return this._camera.calculateProjection
    }
    set calculateTransform(value) {
        this._camera.calculateTransform = value
    }
    get calculateTransform() {
        return this._camera.calculateTransform
    }
    get camera() {
        return this._camera
    }
    set clearColor(value) {
        this._camera.clearColor = value
    }
    get clearColor() {
        return this._camera.clearColor
    }
    set clearColorBuffer(value) {
        this._camera.clearColorBuffer = value
        this.dirtyLayerCompositionCameras()
    }
    get clearColorBuffer() {
        return this._camera.clearColorBuffer
    }
    set clearDepth(value) {
        this._camera.clearDepth = value
    }
    get clearDepth() {
        return this._camera.clearDepth
    }
    set clearDepthBuffer(value) {
        this._camera.clearDepthBuffer = value
        this.dirtyLayerCompositionCameras()
    }
    get clearDepthBuffer() {
        return this._camera.clearDepthBuffer
    }
    set clearStencilBuffer(value) {
        this._camera.clearStencilBuffer = value
        this.dirtyLayerCompositionCameras()
    }
    get clearStencilBuffer() {
        return this._camera.clearStencilBuffer
    }
    set cullFaces(value) {
        this._camera.cullFaces = value
    }
    get cullFaces() {
        return this._camera.cullFaces
    }
    set disablePostEffectsLayer(layer) {
        this._disablePostEffectsLayer = layer
        this.dirtyLayerCompositionCameras()
    }
    get disablePostEffectsLayer() {
        return this._disablePostEffectsLayer
    }
    set farClip(value) {
        this._camera.farClip = value
    }
    get farClip() {
        return this._camera.farClip
    }
    set flipFaces(value) {
        this._camera.flipFaces = value
    }
    get flipFaces() {
        return this._camera.flipFaces
    }
    set fov(value) {
        this._camera.fov = value
    }
    get fov() {
        return this._camera.fov
    }
    get frustum() {
        return this._camera.frustum
    }
    set frustumCulling(value) {
        this._camera.frustumCulling = value
    }
    get frustumCulling() {
        return this._camera.frustumCulling
    }
    set horizontalFov(value) {
        this._camera.horizontalFov = value
    }
    get horizontalFov() {
        return this._camera.horizontalFov
    }
    set layers(newValue) {
        const oldLayers = this._camera.layers
        const scene = this.system.app.scene
        oldLayers.forEach((layerId) => {
            const layer = scene.layers.getLayerById(layerId)
            layer?.removeCamera(this)
        })
        this._camera.layers = newValue
        if (this.enabled && this.entity.enabled) {
            newValue.forEach((layerId) => {
                const layer = scene.layers.getLayerById(layerId)
                layer?.addCamera(this)
            })
        }
        this.fire('set:layers')
    }
    get layers() {
        return this._camera.layers
    }
    get layersSet() {
        return this._camera.layersSet
    }
    set jitter(value) {
        this._camera.jitter = value
    }
    get jitter() {
        return this._camera.jitter
    }
    set nearClip(value) {
        this._camera.nearClip = value
    }
    get nearClip() {
        return this._camera.nearClip
    }
    set orthoHeight(value) {
        this._camera.orthoHeight = value
    }
    get orthoHeight() {
        return this._camera.orthoHeight
    }
    get postEffects() {
        return this._postEffects
    }
    get postEffectsEnabled() {
        return this._postEffects.enabled
    }
    set priority(newValue) {
        this._priority = newValue
        this.dirtyLayerCompositionCameras()
    }
    get priority() {
        return this._priority
    }
    set projection(value) {
        this._camera.projection = value
    }
    get projection() {
        return this._camera.projection
    }
    get projectionMatrix() {
        return this._camera.projectionMatrix
    }
    set rect(value) {
        this._camera.rect = value
        this.fire('set:rect', this._camera.rect)
    }
    get rect() {
        return this._camera.rect
    }
    set renderSceneColorMap(value) {
        if (value && !this._sceneColorMapRequested) {
            this.requestSceneColorMap(true)
            this._sceneColorMapRequested = true
        } else if (this._sceneColorMapRequested) {
            this.requestSceneColorMap(false)
            this._sceneColorMapRequested = false
        }
    }
    get renderSceneColorMap() {
        return this._renderSceneColorMap > 0
    }
    set renderSceneDepthMap(value) {
        if (value && !this._sceneDepthMapRequested) {
            this.requestSceneDepthMap(true)
            this._sceneDepthMapRequested = true
        } else if (this._sceneDepthMapRequested) {
            this.requestSceneDepthMap(false)
            this._sceneDepthMapRequested = false
        }
    }
    get renderSceneDepthMap() {
        return this._renderSceneDepthMap > 0
    }
    set renderTarget(value) {
        this._camera.renderTarget = value
        this.dirtyLayerCompositionCameras()
    }
    get renderTarget() {
        return this._camera.renderTarget
    }
    set scissorRect(value) {
        this._camera.scissorRect = value
    }
    get scissorRect() {
        return this._camera.scissorRect
    }
    set sensitivity(value) {
        this._camera.sensitivity = value
    }
    get sensitivity() {
        return this._camera.sensitivity
    }
    set shutter(value) {
        this._camera.shutter = value
    }
    get shutter() {
        return this._camera.shutter
    }
    get viewMatrix() {
        return this._camera.viewMatrix
    }
    _enableDepthLayer(value) {
        const hasDepthLayer = this.layers.find((layerId) => layerId === LAYERID_DEPTH)
        if (hasDepthLayer) {
            const depthLayer = this.system.app.scene.layers.getLayerById(LAYERID_DEPTH)
            if (value) {
                depthLayer?.incrementCounter()
            } else {
                depthLayer?.decrementCounter()
            }
        } else if (value) {
            return false
        }
        return true
    }
    requestSceneColorMap(enabled) {
        this._renderSceneColorMap += enabled ? 1 : -1
        this._enableDepthLayer(enabled)
        this.camera._enableRenderPassColorGrab(this.system.app.graphicsDevice, this.renderSceneColorMap)
        this.system.app.scene.layers.markDirty()
    }
    requestSceneDepthMap(enabled) {
        this._renderSceneDepthMap += enabled ? 1 : -1
        this._enableDepthLayer(enabled)
        this.camera._enableRenderPassDepthGrab(
            this.system.app.graphicsDevice,
            this.system.app.renderer,
            this.renderSceneDepthMap,
        )
        this.system.app.scene.layers.markDirty()
    }
    dirtyLayerCompositionCameras() {
        const layerComp = this.system.app.scene.layers
        layerComp._dirty = true
    }
    screenToWorld(screenx, screeny, cameraz, worldCoord) {
        const device = this.system.app.graphicsDevice
        const { width, height } = device.clientRect
        return this._camera.screenToWorld(screenx, screeny, cameraz, width, height, worldCoord)
    }
    worldToScreen(worldCoord, screenCoord) {
        const device = this.system.app.graphicsDevice
        const { width, height } = device.clientRect
        return this._camera.worldToScreen(worldCoord, width, height, screenCoord)
    }
    onAppPrerender() {
        this._camera._viewMatDirty = true
        this._camera._viewProjMatDirty = true
    }
    addCameraToLayers() {
        const layers = this.layers
        for (let i = 0; i < layers.length; i++) {
            const layer = this.system.app.scene.layers.getLayerById(layers[i])
            if (layer) {
                layer.addCamera(this)
            }
        }
    }
    removeCameraFromLayers() {
        const layers = this.layers
        for (let i = 0; i < layers.length; i++) {
            const layer = this.system.app.scene.layers.getLayerById(layers[i])
            if (layer) {
                layer.removeCamera(this)
            }
        }
    }
    onLayersChanged(oldComp, newComp) {
        this.addCameraToLayers()
        oldComp.off('add', this.onLayerAdded, this)
        oldComp.off('remove', this.onLayerRemoved, this)
        newComp.on('add', this.onLayerAdded, this)
        newComp.on('remove', this.onLayerRemoved, this)
    }
    onLayerAdded(layer) {
        const index = this.layers.indexOf(layer.id)
        if (index < 0) return
        layer.addCamera(this)
    }
    onLayerRemoved(layer) {
        const index = this.layers.indexOf(layer.id)
        if (index < 0) return
        layer.removeCamera(this)
    }
    onEnable() {
        const scene = this.system.app.scene
        const layers = scene.layers
        this.system.addCamera(this)
        this._evtLayersChanged?.off()
        this._evtLayersChanged = scene.on('set:layers', this.onLayersChanged, this)
        if (layers) {
            this._evtLayerAdded?.off()
            this._evtLayerAdded = layers.on('add', this.onLayerAdded, this)
            this._evtLayerRemoved?.off()
            this._evtLayerRemoved = layers.on('remove', this.onLayerRemoved, this)
        }
        if (this.enabled && this.entity.enabled) {
            this.addCameraToLayers()
        }
        this.postEffects.enable()
    }
    onDisable() {
        const scene = this.system.app.scene
        const layers = scene.layers
        this.postEffects.disable()
        this.removeCameraFromLayers()
        this._evtLayersChanged?.off()
        this._evtLayersChanged = null
        if (layers) {
            this._evtLayerAdded?.off()
            this._evtLayerAdded = null
            this._evtLayerRemoved?.off()
            this._evtLayerRemoved = null
        }
        this.system.removeCamera(this)
    }
    onRemove() {
        this.onDisable()
        this.off()
        this.camera.destroy()
    }
    calculateAspectRatio(rt) {
        const device = this.system.app.graphicsDevice
        const width = rt ? rt.width : device.width
        const height = rt ? rt.height : device.height
        return (width * this.rect.z) / (height * this.rect.w)
    }
    frameUpdate(rt) {
        if (this.aspectRatioMode === ASPECT_AUTO) {
            this.aspectRatio = this.calculateAspectRatio(rt)
        }
    }
    startXr(type, spaceType, options) {
        this.system.app.xr.start(this, type, spaceType, options)
    }
    endXr(callback) {
        if (!this._camera.xr) {
            if (callback) callback(new Error('Camera is not in XR'))
            return
        }
        this._camera.xr.end(callback)
    }
    copy(source) {
        this.aperture = source.aperture
        this.aspectRatio = source.aspectRatio
        this.aspectRatioMode = source.aspectRatioMode
        this.calculateProjection = source.calculateProjection
        this.calculateTransform = source.calculateTransform
        this.clearColor = source.clearColor
        this.clearColorBuffer = source.clearColorBuffer
        this.clearDepthBuffer = source.clearDepthBuffer
        this.clearStencilBuffer = source.clearStencilBuffer
        this.cullFaces = source.cullFaces
        this.disablePostEffectsLayer = source.disablePostEffectsLayer
        this.farClip = source.farClip
        this.flipFaces = source.flipFaces
        this.fov = source.fov
        this.frustumCulling = source.frustumCulling
        this.horizontalFov = source.horizontalFov
        this.layers = source.layers
        this.nearClip = source.nearClip
        this.orthoHeight = source.orthoHeight
        this.priority = source.priority
        this.projection = source.projection
        this.rect = source.rect
        this.renderTarget = source.renderTarget
        this.scissorRect = source.scissorRect
        this.sensitivity = source.sensitivity
        this.shutter = source.shutter
    }
    constructor(system, entity) {
        ;(super(system, entity),
            (this.onPostprocessing = null),
            (this._renderSceneDepthMap = 0),
            (this._renderSceneColorMap = 0),
            (this._sceneDepthMapRequested = false),
            (this._sceneColorMapRequested = false),
            (this._priority = 0),
            (this._disablePostEffectsLayer = LAYERID_UI),
            (this._camera = new Camera$1()),
            (this._evtLayersChanged = null),
            (this._evtLayerAdded = null),
            (this._evtLayerRemoved = null))
        this._camera.node = entity
        this._postEffects = new PostEffectQueue(system.app, this)
    }
}

class CameraComponentData {
    constructor() {
        this.enabled = true
    }
}

const _schema$1 = ['enabled']
class CameraComponentSystem extends ComponentSystem {
    initializeComponentData(component, data, properties) {
        properties = [
            'aspectRatio',
            'aspectRatioMode',
            'calculateProjection',
            'calculateTransform',
            'clearColor',
            'clearColorBuffer',
            'clearDepth',
            'clearDepthBuffer',
            'clearStencilBuffer',
            'renderSceneColorMap',
            'renderSceneDepthMap',
            'cullFaces',
            'farClip',
            'flipFaces',
            'fog',
            'fov',
            'frustumCulling',
            'horizontalFov',
            'layers',
            'renderTarget',
            'nearClip',
            'orthoHeight',
            'projection',
            'priority',
            'rect',
            'scissorRect',
            'aperture',
            'shutter',
            'sensitivity',
            'gammaCorrection',
            'toneMapping',
        ]
        for (let i = 0; i < properties.length; i++) {
            const property = properties[i]
            if (data.hasOwnProperty(property)) {
                const value = data[property]
                switch (property) {
                    case 'rect':
                    case 'scissorRect':
                        if (Array.isArray(value)) {
                            component[property] = new Vec4(value[0], value[1], value[2], value[3])
                        } else {
                            component[property] = value
                        }
                        break
                    case 'clearColor':
                        if (Array.isArray(value)) {
                            component[property] = new Color(value[0], value[1], value[2], value[3])
                        } else {
                            component[property] = value
                        }
                        break
                    default:
                        component[property] = value
                        break
                }
            }
        }
        super.initializeComponentData(component, data, ['enabled'])
    }
    cloneComponent(entity, clone) {
        const c = entity.camera
        return this.addComponent(clone, {
            aspectRatio: c.aspectRatio,
            aspectRatioMode: c.aspectRatioMode,
            calculateProjection: c.calculateProjection,
            calculateTransform: c.calculateTransform,
            clearColor: c.clearColor,
            clearColorBuffer: c.clearColorBuffer,
            clearDepthBuffer: c.clearDepthBuffer,
            clearStencilBuffer: c.clearStencilBuffer,
            renderSceneDepthMap: c.renderSceneDepthMap,
            renderSceneColorMap: c.renderSceneColorMap,
            cullFaces: c.cullFaces,
            enabled: c.enabled,
            farClip: c.farClip,
            flipFaces: c.flipFaces,
            fov: c.fov,
            frustumCulling: c.frustumCulling,
            horizontalFov: c.horizontalFov,
            layers: c.layers,
            renderTarget: c.renderTarget,
            nearClip: c.nearClip,
            orthoHeight: c.orthoHeight,
            projection: c.projection,
            priority: c.priority,
            rect: c.rect,
            scissorRect: c.scissorRect,
            aperture: c.aperture,
            sensitivity: c.sensitivity,
            shutter: c.shutter,
            gammaCorrection: c.gammaCorrection,
            toneMapping: c.toneMapping,
        })
    }
    onBeforeRemove(entity, component) {
        this.removeCamera(component)
        component.onRemove()
    }
    onAppPrerender() {
        for (let i = 0, len = this.cameras.length; i < len; i++) {
            this.cameras[i].onAppPrerender()
        }
    }
    addCamera(camera) {
        this.cameras.push(camera)
        sortPriority(this.cameras)
    }
    removeCamera(camera) {
        const index = this.cameras.indexOf(camera)
        if (index >= 0) {
            this.cameras.splice(index, 1)
            sortPriority(this.cameras)
        }
    }
    destroy() {
        this.app.off('prerender', this.onAppPrerender, this)
        super.destroy()
    }
    constructor(app) {
        ;(super(app), (this.cameras = []))
        this.id = 'camera'
        this.ComponentType = CameraComponent
        this.DataType = CameraComponentData
        this.schema = _schema$1
        this.on('beforeremove', this.onBeforeRemove, this)
        this.app.on('prerender', this.onAppPrerender, this)
    }
}
Component._buildAccessors(CameraComponent.prototype, _schema$1)

class LightComponentData {
    constructor() {
        this.enabled = true
        this.type = 'directional'
        this.color = new Color(1, 1, 1)
        this.intensity = 1
        this.luminance = 0
        this.shape = LIGHTSHAPE_PUNCTUAL
        this.affectSpecularity = true
        this.castShadows = false
        this.shadowDistance = 40
        this.shadowIntensity = 1
        this.shadowResolution = 1024
        this.shadowBias = 0.05
        this.numCascades = 1
        this.cascadeBlend = 0
        this.bakeNumSamples = 1
        this.bakeArea = 0
        this.cascadeDistribution = 0.5
        this.normalOffsetBias = 0
        this.range = 10
        this.innerConeAngle = 40
        this.outerConeAngle = 45
        this.falloffMode = LIGHTFALLOFF_LINEAR
        this.shadowType = SHADOW_PCF3_32F
        this.vsmBlurSize = 11
        this.vsmBlurMode = BLUR_GAUSSIAN
        this.vsmBias = 0.01 * 0.25
        this.cookieAsset = null
        this.cookie = null
        this.cookieIntensity = 1
        this.cookieFalloff = true
        this.cookieChannel = 'rgb'
        this.cookieAngle = 0
        this.cookieScale = null
        this.cookieOffset = null
        this.shadowUpdateMode = SHADOWUPDATE_REALTIME
        this.mask = 1
        this.affectDynamic = true
        this.affectLightmapped = false
        this.bake = false
        this.bakeDir = true
        this.isStatic = false
        this.layers = [LAYERID_WORLD]
        this.penumbraSize = 1
        this.penumbraFalloff = 1
        this.shadowSamples = 16
        this.shadowBlockerSamples = 16
    }
}
const properties = Object.keys(new LightComponentData())

class LightComponent extends Component {
    get data() {
        const record = this.system.store[this.entity.getGuid()]
        return record ? record.data : null
    }
    set enabled(arg) {
        this._setValue('enabled', arg, function (newValue, oldValue) {
            this.onSetEnabled(null, oldValue, newValue)
        })
    }
    get enabled() {
        return this.data.enabled
    }
    set light(arg) {
        this._setValue('light', arg)
    }
    get light() {
        return this.data.light
    }
    set type(arg) {
        this._setValue('type', arg, function (newValue, oldValue) {
            this.system.changeType(this, oldValue, newValue)
            this.refreshProperties()
        })
    }
    get type() {
        return this.data.type
    }
    set color(arg) {
        this._setValue(
            'color',
            arg,
            function (newValue, oldValue) {
                this.light.setColor(newValue)
            },
            true,
        )
    }
    get color() {
        return this.data.color
    }
    set intensity(arg) {
        this._setValue('intensity', arg, function (newValue, oldValue) {
            this.light.intensity = newValue
        })
    }
    get intensity() {
        return this.data.intensity
    }
    set luminance(arg) {
        this._setValue('luminance', arg, function (newValue, oldValue) {
            this.light.luminance = newValue
        })
    }
    get luminance() {
        return this.data.luminance
    }
    set shape(arg) {
        this._setValue('shape', arg, function (newValue, oldValue) {
            this.light.shape = newValue
        })
    }
    get shape() {
        return this.data.shape
    }
    set affectSpecularity(arg) {
        this._setValue('affectSpecularity', arg, function (newValue, oldValue) {
            this.light.affectSpecularity = newValue
        })
    }
    get affectSpecularity() {
        return this.data.affectSpecularity
    }
    set castShadows(arg) {
        this._setValue('castShadows', arg, function (newValue, oldValue) {
            this.light.castShadows = newValue
        })
    }
    get castShadows() {
        return this.data.castShadows
    }
    set shadowDistance(arg) {
        this._setValue('shadowDistance', arg, function (newValue, oldValue) {
            this.light.shadowDistance = newValue
        })
    }
    get shadowDistance() {
        return this.data.shadowDistance
    }
    set shadowIntensity(arg) {
        this._setValue('shadowIntensity', arg, function (newValue, oldValue) {
            this.light.shadowIntensity = newValue
        })
    }
    get shadowIntensity() {
        return this.data.shadowIntensity
    }
    set shadowResolution(arg) {
        this._setValue('shadowResolution', arg, function (newValue, oldValue) {
            this.light.shadowResolution = newValue
        })
    }
    get shadowResolution() {
        return this.data.shadowResolution
    }
    set shadowBias(arg) {
        this._setValue('shadowBias', arg, function (newValue, oldValue) {
            this.light.shadowBias = -0.01 * math.clamp(newValue, 0, 1)
        })
    }
    get shadowBias() {
        return this.data.shadowBias
    }
    set numCascades(arg) {
        this._setValue('numCascades', arg, function (newValue, oldValue) {
            this.light.numCascades = math.clamp(Math.floor(newValue), 1, 4)
        })
    }
    get numCascades() {
        return this.data.numCascades
    }
    set cascadeBlend(value) {
        this._setValue('cascadeBlend', value, function (newValue, oldValue) {
            this.light.cascadeBlend = math.clamp(newValue, 0, 1)
        })
    }
    get cascadeBlend() {
        return this.data.cascadeBlend
    }
    set bakeNumSamples(arg) {
        this._setValue('bakeNumSamples', arg, function (newValue, oldValue) {
            this.light.bakeNumSamples = math.clamp(Math.floor(newValue), 1, 255)
        })
    }
    get bakeNumSamples() {
        return this.data.bakeNumSamples
    }
    set bakeArea(arg) {
        this._setValue('bakeArea', arg, function (newValue, oldValue) {
            this.light.bakeArea = math.clamp(newValue, 0, 180)
        })
    }
    get bakeArea() {
        return this.data.bakeArea
    }
    set cascadeDistribution(arg) {
        this._setValue('cascadeDistribution', arg, function (newValue, oldValue) {
            this.light.cascadeDistribution = math.clamp(newValue, 0, 1)
        })
    }
    get cascadeDistribution() {
        return this.data.cascadeDistribution
    }
    set normalOffsetBias(arg) {
        this._setValue('normalOffsetBias', arg, function (newValue, oldValue) {
            this.light.normalOffsetBias = math.clamp(newValue, 0, 1)
        })
    }
    get normalOffsetBias() {
        return this.data.normalOffsetBias
    }
    set range(arg) {
        this._setValue('range', arg, function (newValue, oldValue) {
            this.light.attenuationEnd = newValue
        })
    }
    get range() {
        return this.data.range
    }
    set innerConeAngle(arg) {
        this._setValue('innerConeAngle', arg, function (newValue, oldValue) {
            this.light.innerConeAngle = newValue
        })
    }
    get innerConeAngle() {
        return this.data.innerConeAngle
    }
    set outerConeAngle(arg) {
        this._setValue('outerConeAngle', arg, function (newValue, oldValue) {
            this.light.outerConeAngle = newValue
        })
    }
    get outerConeAngle() {
        return this.data.outerConeAngle
    }
    set falloffMode(arg) {
        this._setValue('falloffMode', arg, function (newValue, oldValue) {
            this.light.falloffMode = newValue
        })
    }
    get falloffMode() {
        return this.data.falloffMode
    }
    set shadowType(arg) {
        this._setValue('shadowType', arg, function (newValue, oldValue) {
            this.light.shadowType = newValue
        })
    }
    get shadowType() {
        return this.data.shadowType
    }
    set vsmBlurSize(arg) {
        this._setValue('vsmBlurSize', arg, function (newValue, oldValue) {
            this.light.vsmBlurSize = newValue
        })
    }
    get vsmBlurSize() {
        return this.data.vsmBlurSize
    }
    set vsmBlurMode(arg) {
        this._setValue('vsmBlurMode', arg, function (newValue, oldValue) {
            this.light.vsmBlurMode = newValue
        })
    }
    get vsmBlurMode() {
        return this.data.vsmBlurMode
    }
    set vsmBias(arg) {
        this._setValue('vsmBias', arg, function (newValue, oldValue) {
            this.light.vsmBias = math.clamp(newValue, 0, 1)
        })
    }
    get vsmBias() {
        return this.data.vsmBias
    }
    set cookieAsset(arg) {
        this._setValue('cookieAsset', arg, function (newValue, oldValue) {
            if (
                this._cookieAssetId &&
                ((newValue instanceof Asset && newValue.id === this._cookieAssetId) || newValue === this._cookieAssetId)
            ) {
                return
            }
            this.onCookieAssetRemove()
            this._cookieAssetId = null
            if (newValue instanceof Asset) {
                this.data.cookieAsset = newValue.id
                this._cookieAssetId = newValue.id
                this.onCookieAssetAdd(newValue)
            } else if (typeof newValue === 'number') {
                this._cookieAssetId = newValue
                const asset = this.system.app.assets.get(newValue)
                if (asset) {
                    this.onCookieAssetAdd(asset)
                } else {
                    this._cookieAssetAdd = true
                    this.system.app.assets.on(`add:${this._cookieAssetId}`, this.onCookieAssetAdd, this)
                }
            }
        })
    }
    get cookieAsset() {
        return this.data.cookieAsset
    }
    set cookie(arg) {
        this._setValue('cookie', arg, function (newValue, oldValue) {
            this.light.cookie = newValue
        })
    }
    get cookie() {
        return this.data.cookie
    }
    set cookieIntensity(arg) {
        this._setValue('cookieIntensity', arg, function (newValue, oldValue) {
            this.light.cookieIntensity = math.clamp(newValue, 0, 1)
        })
    }
    get cookieIntensity() {
        return this.data.cookieIntensity
    }
    set cookieFalloff(arg) {
        this._setValue('cookieFalloff', arg, function (newValue, oldValue) {
            this.light.cookieFalloff = newValue
        })
    }
    get cookieFalloff() {
        return this.data.cookieFalloff
    }
    set cookieChannel(arg) {
        this._setValue('cookieChannel', arg, function (newValue, oldValue) {
            this.light.cookieChannel = newValue
        })
    }
    get cookieChannel() {
        return this.data.cookieChannel
    }
    set cookieAngle(arg) {
        this._setValue('cookieAngle', arg, function (newValue, oldValue) {
            if (newValue !== 0 || this.cookieScale !== null) {
                if (!this._cookieMatrix) this._cookieMatrix = new Vec4()
                let scx = 1
                let scy = 1
                if (this.cookieScale) {
                    scx = this.cookieScale.x
                    scy = this.cookieScale.y
                }
                const c = Math.cos(newValue * math.DEG_TO_RAD)
                const s = Math.sin(newValue * math.DEG_TO_RAD)
                this._cookieMatrix.set(c / scx, -s / scx, s / scy, c / scy)
                this.light.cookieTransform = this._cookieMatrix
            } else {
                this.light.cookieTransform = null
            }
        })
    }
    get cookieAngle() {
        return this.data.cookieAngle
    }
    set cookieScale(arg) {
        this._setValue(
            'cookieScale',
            arg,
            function (newValue, oldValue) {
                if (newValue !== null || this.cookieAngle !== 0) {
                    if (!this._cookieMatrix) this._cookieMatrix = new Vec4()
                    const scx = newValue.x
                    const scy = newValue.y
                    const c = Math.cos(this.cookieAngle * math.DEG_TO_RAD)
                    const s = Math.sin(this.cookieAngle * math.DEG_TO_RAD)
                    this._cookieMatrix.set(c / scx, -s / scx, s / scy, c / scy)
                    this.light.cookieTransform = this._cookieMatrix
                } else {
                    this.light.cookieTransform = null
                }
            },
            true,
        )
    }
    get cookieScale() {
        return this.data.cookieScale
    }
    set cookieOffset(arg) {
        this._setValue(
            'cookieOffset',
            arg,
            function (newValue, oldValue) {
                this.light.cookieOffset = newValue
            },
            true,
        )
    }
    get cookieOffset() {
        return this.data.cookieOffset
    }
    set shadowUpdateMode(arg) {
        this._setValue(
            'shadowUpdateMode',
            arg,
            function (newValue, oldValue) {
                this.light.shadowUpdateMode = newValue
            },
            true,
        )
    }
    get shadowUpdateMode() {
        return this.data.shadowUpdateMode
    }
    set mask(arg) {
        this._setValue('mask', arg, function (newValue, oldValue) {
            this.light.mask = newValue
        })
    }
    get mask() {
        return this.data.mask
    }
    set affectDynamic(arg) {
        this._setValue('affectDynamic', arg, function (newValue, oldValue) {
            if (newValue) {
                this.light.mask |= MASK_AFFECT_DYNAMIC
            } else {
                this.light.mask &= ~MASK_AFFECT_DYNAMIC
            }
            this.light.layersDirty()
        })
    }
    get affectDynamic() {
        return this.data.affectDynamic
    }
    set affectLightmapped(arg) {
        this._setValue('affectLightmapped', arg, function (newValue, oldValue) {
            if (newValue) {
                this.light.mask |= MASK_AFFECT_LIGHTMAPPED
                if (this.bake) this.light.mask &= ~MASK_BAKE
            } else {
                this.light.mask &= ~MASK_AFFECT_LIGHTMAPPED
                if (this.bake) this.light.mask |= MASK_BAKE
            }
        })
    }
    get affectLightmapped() {
        return this.data.affectLightmapped
    }
    set bake(arg) {
        this._setValue('bake', arg, function (newValue, oldValue) {
            if (newValue) {
                this.light.mask |= MASK_BAKE
                if (this.affectLightmapped) this.light.mask &= ~MASK_AFFECT_LIGHTMAPPED
            } else {
                this.light.mask &= ~MASK_BAKE
                if (this.affectLightmapped) this.light.mask |= MASK_AFFECT_LIGHTMAPPED
            }
            this.light.layersDirty()
        })
    }
    get bake() {
        return this.data.bake
    }
    set bakeDir(arg) {
        this._setValue('bakeDir', arg, function (newValue, oldValue) {
            this.light.bakeDir = newValue
        })
    }
    get bakeDir() {
        return this.data.bakeDir
    }
    set isStatic(arg) {
        this._setValue('isStatic', arg, function (newValue, oldValue) {
            this.light.isStatic = newValue
        })
    }
    get isStatic() {
        return this.data.isStatic
    }
    set layers(arg) {
        this._setValue('layers', arg, function (newValue, oldValue) {
            for (let i = 0; i < oldValue.length; i++) {
                const layer = this.system.app.scene.layers.getLayerById(oldValue[i])
                if (!layer) continue
                layer.removeLight(this)
                this.light.removeLayer(layer)
            }
            for (let i = 0; i < newValue.length; i++) {
                const layer = this.system.app.scene.layers.getLayerById(newValue[i])
                if (!layer) continue
                if (this.enabled && this.entity.enabled) {
                    layer.addLight(this)
                    this.light.addLayer(layer)
                }
            }
        })
    }
    get layers() {
        return this.data.layers
    }
    set shadowUpdateOverrides(values) {
        this.light.shadowUpdateOverrides = values
    }
    get shadowUpdateOverrides() {
        return this.light.shadowUpdateOverrides
    }
    set shadowSamples(value) {
        this.light.shadowSamples = value
    }
    get shadowSamples() {
        return this.light.shadowSamples
    }
    set shadowBlockerSamples(value) {
        this.light.shadowBlockerSamples = value
    }
    get shadowBlockerSamples() {
        return this.light.shadowBlockerSamples
    }
    set penumbraSize(value) {
        this.light.penumbraSize = value
    }
    get penumbraSize() {
        return this.light.penumbraSize
    }
    set penumbraFalloff(value) {
        this.light.penumbraFalloff = value
    }
    get penumbraFalloff() {
        return this.light.penumbraFalloff
    }
    _setValue(name, value, setFunc, skipEqualsCheck) {
        const data = this.data
        const oldValue = data[name]
        if (!skipEqualsCheck && oldValue === value) return
        data[name] = value
        if (setFunc) setFunc.call(this, value, oldValue)
    }
    addLightToLayers() {
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.system.app.scene.layers.getLayerById(this.layers[i])
            if (layer) {
                layer.addLight(this)
                this.light.addLayer(layer)
            }
        }
    }
    removeLightFromLayers() {
        for (let i = 0; i < this.layers.length; i++) {
            const layer = this.system.app.scene.layers.getLayerById(this.layers[i])
            if (layer) {
                layer.removeLight(this)
                this.light.removeLayer(layer)
            }
        }
    }
    onLayersChanged(oldComp, newComp) {
        if (this.enabled && this.entity.enabled) {
            this.addLightToLayers()
        }
        oldComp.off('add', this.onLayerAdded, this)
        oldComp.off('remove', this.onLayerRemoved, this)
        newComp.on('add', this.onLayerAdded, this)
        newComp.on('remove', this.onLayerRemoved, this)
    }
    onLayerAdded(layer) {
        const index = this.layers.indexOf(layer.id)
        if (index >= 0 && this.enabled && this.entity.enabled) {
            layer.addLight(this)
            this.light.addLayer(layer)
        }
    }
    onLayerRemoved(layer) {
        const index = this.layers.indexOf(layer.id)
        if (index >= 0) {
            layer.removeLight(this)
            this.light.removeLayer(layer)
        }
    }
    refreshProperties() {
        for (let i = 0; i < properties.length; i++) {
            const name = properties[i]
            this[name] = this[name]
        }
        if (this.enabled && this.entity.enabled) {
            this.onEnable()
        }
    }
    onCookieAssetSet() {
        let forceLoad = false
        if (this._cookieAsset.type === 'cubemap' && !this._cookieAsset.loadFaces) {
            this._cookieAsset.loadFaces = true
            forceLoad = true
        }
        if (!this._cookieAsset.resource || forceLoad) this.system.app.assets.load(this._cookieAsset)
        if (this._cookieAsset.resource) {
            this.onCookieAssetLoad()
        }
    }
    onCookieAssetAdd(asset) {
        if (this._cookieAssetId !== asset.id) return
        this._cookieAsset = asset
        if (this.light.enabled) {
            this.onCookieAssetSet()
        }
        this._cookieAsset.on('load', this.onCookieAssetLoad, this)
        this._cookieAsset.on('remove', this.onCookieAssetRemove, this)
    }
    onCookieAssetLoad() {
        if (!this._cookieAsset || !this._cookieAsset.resource) {
            return
        }
        this.cookie = this._cookieAsset.resource
    }
    onCookieAssetRemove() {
        if (!this._cookieAssetId) {
            return
        }
        if (this._cookieAssetAdd) {
            this.system.app.assets.off(`add:${this._cookieAssetId}`, this.onCookieAssetAdd, this)
            this._cookieAssetAdd = false
        }
        if (this._cookieAsset) {
            this._cookieAsset.off('load', this.onCookieAssetLoad, this)
            this._cookieAsset.off('remove', this.onCookieAssetRemove, this)
            this._cookieAsset = null
        }
        this.cookie = null
    }
    onEnable() {
        const scene = this.system.app.scene
        const layers = scene.layers
        this.light.enabled = true
        this._evtLayersChanged = scene.on('set:layers', this.onLayersChanged, this)
        if (layers) {
            this._evtLayerAdded = layers.on('add', this.onLayerAdded, this)
            this._evtLayerRemoved = layers.on('remove', this.onLayerRemoved, this)
        }
        if (this.enabled && this.entity.enabled) {
            this.addLightToLayers()
        }
        if (this._cookieAsset && !this.cookie) {
            this.onCookieAssetSet()
        }
    }
    onDisable() {
        const scene = this.system.app.scene
        const layers = scene.layers
        this.light.enabled = false
        this._evtLayersChanged?.off()
        this._evtLayersChanged = null
        if (layers) {
            this._evtLayerAdded?.off()
            this._evtLayerAdded = null
            this._evtLayerRemoved?.off()
            this._evtLayerRemoved = null
        }
        this.removeLightFromLayers()
    }
    onRemove() {
        this.onDisable()
        this.light.destroy()
        this.cookieAsset = null
    }
    constructor(...args) {
        ;(super(...args),
            (this._evtLayersChanged = null),
            (this._evtLayerAdded = null),
            (this._evtLayerRemoved = null),
            (this._cookieAsset = null),
            (this._cookieAssetId = null),
            (this._cookieAssetAdd = false),
            (this._cookieMatrix = null))
    }
}

class LightComponentSystem extends ComponentSystem {
    initializeComponentData(component, _data) {
        const data = {
            ..._data,
        }
        if (!data.type) {
            data.type = component.data.type
        }
        component.data.type = data.type
        if (data.layers && Array.isArray(data.layers)) {
            data.layers = data.layers.slice(0)
        }
        if (data.color && Array.isArray(data.color)) {
            data.color = new Color(data.color[0], data.color[1], data.color[2])
        }
        if (data.cookieOffset && data.cookieOffset instanceof Array) {
            data.cookieOffset = new Vec2(data.cookieOffset[0], data.cookieOffset[1])
        }
        if (data.cookieScale && data.cookieScale instanceof Array) {
            data.cookieScale = new Vec2(data.cookieScale[0], data.cookieScale[1])
        }
        if (data.enable) {
            console.warn('WARNING: enable: Property is deprecated. Set enabled property instead.')
            data.enabled = data.enable
        }
        if (!data.shape) {
            data.shape = LIGHTSHAPE_PUNCTUAL
        }
        const light = new Light(this.app.graphicsDevice, this.app.scene.clusteredLightingEnabled)
        light.type = lightTypes[data.type]
        light._node = component.entity
        component.data.light = light
        super.initializeComponentData(component, data, properties)
    }
    _onRemoveComponent(entity, component) {
        component.onRemove()
    }
    cloneComponent(entity, clone) {
        const light = entity.light
        const data = []
        let name
        for (let i = 0; i < properties.length; i++) {
            name = properties[i]
            if (name === 'light') {
                continue
            }
            if (light[name] && light[name].clone) {
                data[name] = light[name].clone()
            } else {
                data[name] = light[name]
            }
        }
        return this.addComponent(clone, data)
    }
    changeType(component, oldValue, newValue) {
        if (oldValue !== newValue) {
            component.light.type = lightTypes[newValue]
        }
    }
    constructor(app) {
        super(app)
        this.id = 'light'
        this.ComponentType = LightComponent
        this.DataType = LightComponentData
        this.on('beforeremove', this._onRemoveComponent, this)
    }
}

const components = ['x', 'y', 'z', 'w']
const vecLookup = [undefined, undefined, Vec2, Vec3, Vec4]
function rawToValue(app, args, value, old) {
    switch (args.type) {
        case 'boolean':
            return !!value
        case 'number':
            if (typeof value === 'number') {
                return value
            } else if (typeof value === 'string') {
                const v = parseInt(value, 10)
                if (isNaN(v)) return null
                return v
            } else if (typeof value === 'boolean') {
                return 0 + value
            }
            return null
        case 'json': {
            const result = {}
            if (Array.isArray(args.schema)) {
                if (!value || typeof value !== 'object') {
                    value = {}
                }
                for (let i = 0; i < args.schema.length; i++) {
                    const field = args.schema[i]
                    if (!field.name) continue
                    if (field.array) {
                        result[field.name] = []
                        const arr = Array.isArray(value[field.name]) ? value[field.name] : []
                        for (let j = 0; j < arr.length; j++) {
                            result[field.name].push(rawToValue(app, field, arr[j]))
                        }
                    } else {
                        const val = value.hasOwnProperty(field.name) ? value[field.name] : field.default
                        result[field.name] = rawToValue(app, field, val)
                    }
                }
            }
            return result
        }
        case 'asset':
            if (value instanceof Asset) {
                return value
            } else if (typeof value === 'number') {
                return app.assets.get(value) || null
            } else if (typeof value === 'string') {
                return app.assets.get(parseInt(value, 10)) || null
            }
            return null
        case 'entity':
            if (value instanceof GraphNode) {
                return value
            } else if (typeof value === 'string') {
                return app.getEntityFromIndex(value)
            }
            return null
        case 'rgb':
        case 'rgba':
            if (value instanceof Color) {
                if (old instanceof Color) {
                    old.copy(value)
                    return old
                }
                return value.clone()
            } else if (value instanceof Array && value.length >= 3 && value.length <= 4) {
                for (let i = 0; i < value.length; i++) {
                    if (typeof value[i] !== 'number') {
                        return null
                    }
                }
                if (!old) old = new Color()
                old.r = value[0]
                old.g = value[1]
                old.b = value[2]
                old.a = value.length === 3 ? 1 : value[3]
                return old
            } else if (typeof value === 'string' && /#(?:[0-9a-f]{2}){3,4}/i.test(value)) {
                if (!old) {
                    old = new Color()
                }
                old.fromString(value)
                return old
            }
            return null
        case 'vec2':
        case 'vec3':
        case 'vec4': {
            const len = parseInt(args.type.slice(3), 10)
            const vecType = vecLookup[len]
            if (value instanceof vecType) {
                if (old instanceof vecType) {
                    old.copy(value)
                    return old
                }
                return value.clone()
            } else if (value instanceof Array && value.length === len) {
                for (let i = 0; i < value.length; i++) {
                    if (typeof value[i] !== 'number') {
                        return null
                    }
                }
                if (!old) old = new vecType()
                for (let i = 0; i < len; i++) {
                    old[components[i]] = value[i]
                }
                return old
            }
            return null
        }
        case 'curve':
            if (value) {
                let curve
                if (value instanceof Curve || value instanceof CurveSet) {
                    curve = value.clone()
                } else {
                    const CurveType = value.keys[0] instanceof Array ? CurveSet : Curve
                    curve = new CurveType(value.keys)
                    curve.type = value.type
                }
                return curve
            }
            break
    }
    return value
}
function attributeToValue(app, schema, value, current) {
    if (schema.array) {
        return value.map((item, index) => rawToValue(app, schema, item, current ? current[index] : null))
    }
    return rawToValue(app, schema, value, current)
}
function assignAttributesToScript(app, attributeSchemaMap, data, script) {
    if (!data) return
    for (const attributeName in attributeSchemaMap) {
        const attributeSchema = attributeSchemaMap[attributeName]
        const dataToAssign = data[attributeName]
        if (dataToAssign === undefined) continue
        script[attributeName] = attributeToValue(app, attributeSchema, dataToAssign, script[attributeName])
    }
}
class ScriptAttributes {
    add(name, args) {
        if (!args) {
            return
        }
        if (!args.type) {
            return
        }
        if (this.index[name]) {
            return
        } else if (ScriptAttributes.reservedNames.has(name)) {
            return
        }
        this.index[name] = args
        Object.defineProperty(this.scriptType.prototype, name, {
            get: function () {
                return this.__attributes[name]
            },
            set: function (raw) {
                const evt = 'attr'
                const evtName = `attr:${name}`
                const old = this.__attributes[name]
                let oldCopy = old
                if (old && args.type !== 'json' && args.type !== 'entity' && old.clone) {
                    if (this.hasEvent(evt) || this.hasEvent(evtName)) {
                        oldCopy = old.clone()
                    }
                }
                if (args.array) {
                    this.__attributes[name] = []
                    if (raw) {
                        for (let i = 0, len = raw.length; i < len; i++) {
                            this.__attributes[name].push(rawToValue(this.app, args, raw[i], old ? old[i] : null))
                        }
                    }
                } else {
                    this.__attributes[name] = rawToValue(this.app, args, raw, old)
                }
                this.fire(evt, name, this.__attributes[name], oldCopy)
                this.fire(evtName, this.__attributes[name], oldCopy)
            },
        })
    }
    remove(name) {
        if (!this.index[name]) {
            return false
        }
        delete this.index[name]
        delete this.scriptType.prototype[name]
        return true
    }
    has(name) {
        return !!this.index[name]
    }
    get(name) {
        return this.index[name] || null
    }
    constructor(scriptType) {
        this.scriptType = scriptType
        this.index = {}
    }
}
ScriptAttributes.assignAttributesToScript = assignAttributesToScript
ScriptAttributes.attributeToValue = attributeToValue
ScriptAttributes.reservedNames = new Set([
    'app',
    'entity',
    'enabled',
    '_enabled',
    '_enabledOld',
    '_destroyed',
    '__attributes',
    '__attributesRaw',
    '__scriptType',
    '__executionOrder',
    '_callbacks',
    '_callbackActive',
    'has',
    'get',
    'on',
    'off',
    'fire',
    'once',
    'hasEvent',
])

const SCRIPT_INITIALIZE = 'initialize'
const SCRIPT_POST_INITIALIZE = 'postInitialize'
const SCRIPT_UPDATE = 'update'
const SCRIPT_POST_UPDATE = 'postUpdate'
const SCRIPT_SWAP = 'swap'

class Script extends EventHandler {
    set enabled(value) {
        this._enabled = !!value
        if (this.enabled === this._enabledOld) return
        this._enabledOld = this.enabled
        this.fire(this.enabled ? 'enable' : 'disable')
        this.fire('state', this.enabled)
        if (!this._initialized && this.enabled) {
            this._initialized = true
            this.fire('preInitialize')
            if (this.initialize) {
                this.entity.script._scriptMethod(this, SCRIPT_INITIALIZE)
            }
        }
        if (this._initialized && !this._postInitialized && this.enabled && !this.entity.script._beingEnabled) {
            this._postInitialized = true
            if (this.postInitialize) {
                this.entity.script._scriptMethod(this, SCRIPT_POST_INITIALIZE)
            }
        }
    }
    get enabled() {
        return this._enabled && !this._destroyed && this.entity.script.enabled && this.entity.enabled
    }
    initScript(args) {
        const script = this.constructor
        this.app = args.app
        this.entity = args.entity
        this._enabled = typeof args.enabled === 'boolean' ? args.enabled : true
        this._enabledOld = this.enabled
        this.__destroyed = false
        this.__scriptType = script
        this.__executionOrder = -1
    }
    static set scriptName(value) {
        this.__name = value
    }
    static get scriptName() {
        return this.__name
    }
    constructor(args) {
        super()
        this.initScript(args)
    }
}
Script.EVENT_ENABLE = 'enable'
Script.EVENT_DISABLE = 'disable'
Script.EVENT_STATE = 'state'
Script.EVENT_DESTROY = 'destroy'
Script.EVENT_ATTR = 'attr'
Script.EVENT_ERROR = 'error'
Script.__name = null
Script.__getScriptName = getScriptName
const funcNameRegex = /^\s*function(?:\s|\s*\/\*.*\*\/\s*)+([^(\s\/]*)\s*/
function getScriptName(constructorFn) {
    if (typeof constructorFn !== 'function') return undefined
    if (constructorFn.scriptName) return constructorFn.scriptName
    if ('name' in Function.prototype) return constructorFn.name
    if (constructorFn === Function || constructorFn === Function.prototype.constructor) return 'Function'
    const match = `${constructorFn}`.match(funcNameRegex)
    return match ? match[1] : undefined
}

class ScriptType extends Script {
    static get attributes() {
        if (!this.hasOwnProperty('__attributes')) this.__attributes = new ScriptAttributes(this)
        return this.__attributes
    }
    initScript(args) {
        Script.prototype.initScript.call(this, args)
        this.__attributes = {}
        this.__attributesRaw = args.attributes || {}
    }
    initScriptType(args) {
        this.initScript(args)
    }
    __initializeAttributes(force) {
        if (!force && !this.__attributesRaw) {
            return
        }
        for (const key in this.__scriptType.attributes.index) {
            if (this.__attributesRaw && this.__attributesRaw.hasOwnProperty(key)) {
                this[key] = this.__attributesRaw[key]
            } else if (!this.__attributes.hasOwnProperty(key)) {
                if (this.__scriptType.attributes.index[key].hasOwnProperty('default')) {
                    this[key] = this.__scriptType.attributes.index[key].default
                } else {
                    this[key] = null
                }
            }
        }
        this.__attributesRaw = null
    }
    static extend(methods) {
        for (const key in methods) {
            if (!methods.hasOwnProperty(key)) {
                continue
            }
            this.prototype[key] = methods[key]
        }
    }
    constructor(args) {
        super(args)
        this.initScriptType(args)
    }
}

const toLowerCamelCase = (str) => str[0].toLowerCase() + str.substring(1)
class ScriptComponent extends Component {
    set scripts(value) {
        this._scriptsData = value
        for (const key in value) {
            if (!value.hasOwnProperty(key)) {
                continue
            }
            const script = this._scriptsIndex[key]
            if (script) {
                if (typeof value[key].enabled === 'boolean') {
                    script.once('preInitialize', () => {
                        this.initializeAttributes(script)
                    })
                    script.enabled = !!value[key].enabled
                }
                if (typeof value[key].attributes === 'object') {
                    for (const attr in value[key].attributes) {
                        if (ScriptAttributes.reservedNames.has(attr)) {
                            continue
                        }
                        if (!script.__attributes.hasOwnProperty(attr)) {
                            const scriptType = this.system.app.scripts.get(key)
                            if (scriptType) {
                                scriptType.attributes.add(attr, {})
                            }
                        }
                        script[attr] = value[key].attributes[attr]
                    }
                }
            } else {
                console.log(this.order)
            }
        }
    }
    get scripts() {
        return this._scripts
    }
    set enabled(value) {
        const oldValue = this._enabled
        this._enabled = value
        this.fire('set', 'enabled', oldValue, value)
    }
    get enabled() {
        return this._enabled
    }
    onEnable() {
        this._beingEnabled = true
        this._checkState()
        if (!this.entity._beingEnabled) {
            this.onPostStateChange()
        }
        this._beingEnabled = false
    }
    onDisable() {
        this._checkState()
    }
    onPostStateChange() {
        const wasLooping = this._beginLooping()
        for (let i = 0, len = this.scripts.length; i < len; i++) {
            const script = this.scripts[i]
            if (script._initialized && !script._postInitialized && script.enabled) {
                script._postInitialized = true
                if (script.postInitialize) {
                    this._scriptMethod(script, SCRIPT_POST_INITIALIZE)
                }
            }
        }
        this._endLooping(wasLooping)
    }
    _beginLooping() {
        const looping = this._isLoopingThroughScripts
        this._isLoopingThroughScripts = true
        return looping
    }
    _endLooping(wasLoopingBefore) {
        this._isLoopingThroughScripts = wasLoopingBefore
        if (!this._isLoopingThroughScripts) {
            this._removeDestroyedScripts()
        }
    }
    _onSetEnabled(prop, old, value) {
        this._beingEnabled = true
        this._checkState()
        this._beingEnabled = false
    }
    _checkState() {
        const state = this.enabled && this.entity.enabled
        if (state === this._oldState) {
            return
        }
        this._oldState = state
        this.fire(state ? 'enable' : 'disable')
        this.fire('state', state)
        if (state) {
            this.system._addComponentToEnabled(this)
        } else {
            this.system._removeComponentFromEnabled(this)
        }
        const wasLooping = this._beginLooping()
        for (let i = 0, len = this.scripts.length; i < len; i++) {
            const script = this.scripts[i]
            script.once('preInitialize', () => {
                this.initializeAttributes(script)
            })
            script.enabled = script._enabled
        }
        this._endLooping(wasLooping)
    }
    _onBeforeRemove() {
        this.fire('remove')
        const wasLooping = this._beginLooping()
        for (let i = 0; i < this.scripts.length; i++) {
            const script = this.scripts[i]
            if (!script) continue
            this.destroy(script.__scriptType.__name)
        }
        this._endLooping(wasLooping)
    }
    _removeDestroyedScripts() {
        const len = this._destroyedScripts.length
        if (!len) return
        for (let i = 0; i < len; i++) {
            const script = this._destroyedScripts[i]
            this._removeScriptInstance(script)
        }
        this._destroyedScripts.length = 0
        this._resetExecutionOrder(0, this._scripts.length)
    }
    _onInitializeAttributes() {
        for (let i = 0, len = this.scripts.length; i < len; i++) {
            const script = this.scripts[i]
            this.initializeAttributes(script)
        }
    }
    initializeAttributes(script) {
        if (script instanceof ScriptType) {
            script.__initializeAttributes()
        } else {
            const name = script.__scriptType.__name
            const data = this._attributeDataMap.get(name)
            if (!data) {
                return
            }
            const schema = this.system.app.scripts?.getSchema(name)
            assignAttributesToScript(this.system.app, schema.attributes, data, script)
        }
    }
    _scriptMethod(script, method, arg) {
        script[method](arg)
    }
    _onInitialize() {
        const scripts = this._scripts
        const wasLooping = this._beginLooping()
        for (let i = 0, len = scripts.length; i < len; i++) {
            const script = scripts[i]
            if (!script._initialized && script.enabled) {
                script._initialized = true
                if (script.initialize) {
                    this._scriptMethod(script, SCRIPT_INITIALIZE)
                }
            }
        }
        this._endLooping(wasLooping)
    }
    _onPostInitialize() {
        this.onPostStateChange()
    }
    _onUpdate(dt) {
        const list = this._updateList
        if (!list.length) return
        const wasLooping = this._beginLooping()
        for (list.loopIndex = 0; list.loopIndex < list.length; list.loopIndex++) {
            const script = list.items[list.loopIndex]
            if (script.enabled) {
                this._scriptMethod(script, SCRIPT_UPDATE, dt)
            }
        }
        this._endLooping(wasLooping)
    }
    _onPostUpdate(dt) {
        const list = this._postUpdateList
        if (!list.length) return
        const wasLooping = this._beginLooping()
        for (list.loopIndex = 0; list.loopIndex < list.length; list.loopIndex++) {
            const script = list.items[list.loopIndex]
            if (script.enabled) {
                this._scriptMethod(script, SCRIPT_POST_UPDATE, dt)
            }
        }
        this._endLooping(wasLooping)
    }
    _insertScriptInstance(scriptInstance, index, scriptsLength) {
        if (index === -1) {
            this._scripts.push(scriptInstance)
            scriptInstance.__executionOrder = scriptsLength
            if (scriptInstance.update) {
                this._updateList.append(scriptInstance)
            }
            if (scriptInstance.postUpdate) {
                this._postUpdateList.append(scriptInstance)
            }
        } else {
            this._scripts.splice(index, 0, scriptInstance)
            scriptInstance.__executionOrder = index
            this._resetExecutionOrder(index + 1, scriptsLength + 1)
            if (scriptInstance.update) {
                this._updateList.insert(scriptInstance)
            }
            if (scriptInstance.postUpdate) {
                this._postUpdateList.insert(scriptInstance)
            }
        }
    }
    _removeScriptInstance(scriptInstance) {
        const idx = this._scripts.indexOf(scriptInstance)
        if (idx === -1) return idx
        this._scripts.splice(idx, 1)
        if (scriptInstance.update) {
            this._updateList.remove(scriptInstance)
        }
        if (scriptInstance.postUpdate) {
            this._postUpdateList.remove(scriptInstance)
        }
        return idx
    }
    _resetExecutionOrder(startIndex, scriptsLength) {
        for (let i = startIndex; i < scriptsLength; i++) {
            this._scripts[i].__executionOrder = i
        }
    }
    _resolveEntityScriptAttribute(attribute, attributeName, oldValue, useGuid, newAttributes, duplicatedIdsMap) {
        if (attribute.array) {
            const len = oldValue.length
            if (!len) {
                return
            }
            const newGuidArray = oldValue.slice()
            for (let i = 0; i < len; i++) {
                const guid = newGuidArray[i] instanceof Entity ? newGuidArray[i].getGuid() : newGuidArray[i]
                if (duplicatedIdsMap[guid]) {
                    newGuidArray[i] = useGuid ? duplicatedIdsMap[guid].getGuid() : duplicatedIdsMap[guid]
                }
            }
            newAttributes[attributeName] = newGuidArray
        } else {
            if (oldValue instanceof Entity) {
                oldValue = oldValue.getGuid()
            } else if (typeof oldValue !== 'string') {
                return
            }
            if (duplicatedIdsMap[oldValue]) {
                newAttributes[attributeName] = duplicatedIdsMap[oldValue]
            }
        }
    }
    has(nameOrType) {
        if (typeof nameOrType === 'string') {
            return !!this._scriptsIndex[nameOrType]
        }
        if (!nameOrType) return false
        const scriptType = nameOrType
        const scriptName = scriptType.__name
        const scriptData = this._scriptsIndex[scriptName]
        const scriptInstance = scriptData && scriptData.instance
        return scriptInstance instanceof scriptType
    }
    get(nameOrType) {
        if (typeof nameOrType === 'string') {
            const data = this._scriptsIndex[nameOrType]
            return data ? data.instance : null
        }
        if (!nameOrType) return null
        const scriptType = nameOrType
        const scriptName = scriptType.__name
        const scriptData = this._scriptsIndex[scriptName]
        const scriptInstance = scriptData && scriptData.instance
        return scriptInstance instanceof scriptType ? scriptInstance : null
    }
    create(nameOrType, args = {}) {
        const self = this
        let scriptType = nameOrType
        let scriptName = nameOrType
        if (typeof scriptType === 'string') {
            scriptType = this.system.app.scripts.get(scriptType)
        } else if (scriptType) {
            var _scriptType
            const inferredScriptName = getScriptName(scriptType)
            const lowerInferredScriptName = toLowerCamelCase(inferredScriptName)
            if (!(scriptType.prototype instanceof ScriptType) && !scriptType.scriptName);
            ;(_scriptType = scriptType).__name ??
                (_scriptType.__name = scriptType.scriptName ?? lowerInferredScriptName)
            scriptName = scriptType.__name
        }
        if (scriptType) {
            if (!this._scriptsIndex[scriptName] || !this._scriptsIndex[scriptName].instance) {
                const scriptInstance = new scriptType({
                    app: this.system.app,
                    entity: this.entity,
                    enabled: args.hasOwnProperty('enabled') ? args.enabled : true,
                    attributes: args.attributes || {},
                })
                if (args.properties && typeof args.properties === 'object') {
                    Object.assign(scriptInstance, args.properties)
                }
                if (!(scriptInstance instanceof ScriptType) && args.attributes) {
                    this._attributeDataMap.set(scriptName, {
                        ...args.attributes,
                    })
                }
                const len = this._scripts.length
                let ind = -1
                if (typeof args.ind === 'number' && args.ind !== -1 && len > args.ind) {
                    ind = args.ind
                }
                this._insertScriptInstance(scriptInstance, ind, len)
                this._scriptsIndex[scriptName] = {
                    instance: scriptInstance,
                    onSwap: function () {
                        self.swap(scriptName)
                    },
                }
                this[scriptName] = scriptInstance
                if (!args.preloading) {
                    this.initializeAttributes(scriptInstance)
                }
                this.fire('create', scriptName, scriptInstance)
                this.fire(`create:${scriptName}`, scriptInstance)
                this.system.app.scripts.on(`swap:${scriptName}`, this._scriptsIndex[scriptName].onSwap)
                if (!args.preloading) {
                    if (scriptInstance.enabled && !scriptInstance._initialized) {
                        scriptInstance._initialized = true
                        if (scriptInstance.initialize) {
                            this._scriptMethod(scriptInstance, SCRIPT_INITIALIZE)
                        }
                    }
                    if (scriptInstance.enabled && !scriptInstance._postInitialized) {
                        scriptInstance._postInitialized = true
                        if (scriptInstance.postInitialize) {
                            this._scriptMethod(scriptInstance, SCRIPT_POST_INITIALIZE)
                        }
                    }
                }
                return scriptInstance
            }
        } else {
            this._scriptsIndex[scriptName] = {
                awaiting: true,
                ind: this._scripts.length,
            }
        }
        return null
    }
    destroy(nameOrType) {
        let scriptName = nameOrType
        let scriptType = nameOrType
        if (typeof scriptType === 'string') {
            scriptType = this.system.app.scripts.get(scriptType)
        } else if (scriptType) {
            scriptName = scriptType.__name
        }
        const scriptData = this._scriptsIndex[scriptName]
        delete this._scriptsIndex[scriptName]
        if (!scriptData) return false
        this._attributeDataMap.delete(scriptName)
        const scriptInstance = scriptData.instance
        if (scriptInstance && !scriptInstance._destroyed) {
            scriptInstance.enabled = false
            scriptInstance._destroyed = true
            if (!this._isLoopingThroughScripts) {
                const ind = this._removeScriptInstance(scriptInstance)
                if (ind >= 0) {
                    this._resetExecutionOrder(ind, this._scripts.length)
                }
            } else {
                this._destroyedScripts.push(scriptInstance)
            }
        }
        this.system.app.scripts.off(`swap:${scriptName}`, scriptData.onSwap)
        delete this[scriptName]
        this.fire('destroy', scriptName, scriptInstance || null)
        this.fire(`destroy:${scriptName}`, scriptInstance || null)
        if (scriptInstance) {
            scriptInstance.fire('destroy')
        }
        return true
    }
    swap(nameOrType) {
        let scriptName = nameOrType
        let scriptType = nameOrType
        if (typeof scriptType === 'string') {
            scriptType = this.system.app.scripts.get(scriptType)
        } else if (scriptType) {
            scriptName = scriptType.__name
        }
        const old = this._scriptsIndex[scriptName]
        if (!old || !old.instance) return false
        const scriptInstanceOld = old.instance
        const ind = this._scripts.indexOf(scriptInstanceOld)
        const scriptInstance = new scriptType({
            app: this.system.app,
            entity: this.entity,
            enabled: scriptInstanceOld.enabled,
            attributes: scriptInstanceOld.__attributes,
        })
        if (!scriptInstance.swap) {
            return false
        }
        this.initializeAttributes(scriptInstance)
        this._scripts[ind] = scriptInstance
        this._scriptsIndex[scriptName].instance = scriptInstance
        this[scriptName] = scriptInstance
        scriptInstance.__executionOrder = ind
        if (scriptInstanceOld.update) {
            this._updateList.remove(scriptInstanceOld)
        }
        if (scriptInstanceOld.postUpdate) {
            this._postUpdateList.remove(scriptInstanceOld)
        }
        if (scriptInstance.update) {
            this._updateList.insert(scriptInstance)
        }
        if (scriptInstance.postUpdate) {
            this._postUpdateList.insert(scriptInstance)
        }
        this._scriptMethod(scriptInstance, SCRIPT_SWAP, scriptInstanceOld)
        this.fire('swap', scriptName, scriptInstance)
        this.fire(`swap:${scriptName}`, scriptInstance)
        return true
    }
    resolveDuplicatedEntityReferenceProperties(oldScriptComponent, duplicatedIdsMap) {
        const newScriptComponent = this.entity.script
        for (const scriptName in oldScriptComponent._scriptsIndex) {
            const scriptType = this.system.app.scripts.get(scriptName)
            if (!scriptType) {
                continue
            }
            const script = oldScriptComponent._scriptsIndex[scriptName]
            if (!script || !script.instance) {
                continue
            }
            const newAttributesRaw =
                newScriptComponent[scriptName].__attributesRaw ?? newScriptComponent._attributeDataMap.get(scriptName)
            const newAttributes = newScriptComponent[scriptName].__attributes
            if (!newAttributesRaw && !newAttributes) {
                continue
            }
            const useGuid = !!newAttributesRaw
            const oldAttributes = script.instance.__attributes ?? newScriptComponent._attributeDataMap.get(scriptName)
            for (const attributeName in oldAttributes) {
                if (!oldAttributes[attributeName]) {
                    continue
                }
                const attribute =
                    scriptType.attributes?.get(attributeName) ??
                    this.system.app.scripts.getSchema(scriptName)?.attributes?.[attributeName]
                if (!attribute) {
                    continue
                }
                if (attribute.type === 'entity') {
                    this._resolveEntityScriptAttribute(
                        attribute,
                        attributeName,
                        oldAttributes[attributeName],
                        useGuid,
                        newAttributesRaw || newAttributes,
                        duplicatedIdsMap,
                    )
                } else if (attribute.type === 'json' && Array.isArray(attribute.schema)) {
                    const oldValue = oldAttributes[attributeName]
                    const newJsonValue = newAttributesRaw
                        ? newAttributesRaw[attributeName]
                        : newAttributes[attributeName]
                    for (let i = 0; i < attribute.schema.length; i++) {
                        const field = attribute.schema[i]
                        if (field.type !== 'entity') {
                            continue
                        }
                        if (attribute.array) {
                            for (let j = 0; j < oldValue.length; j++) {
                                this._resolveEntityScriptAttribute(
                                    field,
                                    field.name,
                                    oldValue[j][field.name],
                                    useGuid,
                                    newJsonValue[j],
                                    duplicatedIdsMap,
                                )
                            }
                        } else {
                            this._resolveEntityScriptAttribute(
                                field,
                                field.name,
                                oldValue[field.name],
                                useGuid,
                                newJsonValue,
                                duplicatedIdsMap,
                            )
                        }
                    }
                }
            }
        }
    }
    move(nameOrType, ind) {
        const len = this._scripts.length
        if (ind >= len || ind < 0) {
            return false
        }
        let scriptType = nameOrType
        let scriptName = nameOrType
        if (typeof scriptName !== 'string') {
            scriptName = nameOrType.__name
        } else {
            scriptType = null
        }
        const scriptData = this._scriptsIndex[scriptName]
        if (!scriptData || !scriptData.instance) {
            return false
        }
        const scriptInstance = scriptData.instance
        if (scriptType && !(scriptInstance instanceof scriptType)) {
            return false
        }
        const indOld = this._scripts.indexOf(scriptInstance)
        if (indOld === -1 || indOld === ind) {
            return false
        }
        this._scripts.splice(ind, 0, this._scripts.splice(indOld, 1)[0])
        this._resetExecutionOrder(0, len)
        this._updateList.sort()
        this._postUpdateList.sort()
        this.fire('move', scriptName, scriptInstance, ind, indOld)
        this.fire(`move:${scriptName}`, scriptInstance, ind, indOld)
        return true
    }
    constructor(system, entity) {
        ;(super(system, entity), (this._attributeDataMap = new Map()))
        this._scripts = []
        this._updateList = new SortedLoopArray({
            sortBy: '__executionOrder',
        })
        this._postUpdateList = new SortedLoopArray({
            sortBy: '__executionOrder',
        })
        this._scriptsIndex = {}
        this._destroyedScripts = []
        this._destroyed = false
        this._scriptsData = null
        this._oldState = true
        this._enabled = true
        this._beingEnabled = false
        this._isLoopingThroughScripts = false
        this._executionOrder = -1
        this.on('set_enabled', this._onSetEnabled, this)
    }
}
ScriptComponent.EVENT_CREATE = 'create'
ScriptComponent.EVENT_DESTROY = 'destroy'
ScriptComponent.EVENT_ENABLE = 'enable'
ScriptComponent.EVENT_DISABLE = 'disable'
ScriptComponent.EVENT_REMOVE = 'remove'
ScriptComponent.EVENT_STATE = 'state'
ScriptComponent.EVENT_MOVE = 'move'
ScriptComponent.EVENT_ERROR = 'error'

class ScriptComponentData {
    constructor() {
        this.enabled = true
    }
}

const METHOD_INITIALIZE_ATTRIBUTES = '_onInitializeAttributes'
const METHOD_INITIALIZE = '_onInitialize'
const METHOD_POST_INITIALIZE = '_onPostInitialize'
const METHOD_UPDATE = '_onUpdate'
const METHOD_POST_UPDATE = '_onPostUpdate'
let executionOrderCounter = 0
class ScriptComponentSystem extends ComponentSystem {
    initializeComponentData(component, data) {
        component._executionOrder = executionOrderCounter++
        this._components.append(component)
        if (executionOrderCounter > Number.MAX_SAFE_INTEGER) {
            this._resetExecutionOrder()
        }
        component.enabled = data.hasOwnProperty('enabled') ? !!data.enabled : true
        if (component.enabled && component.entity.enabled) {
            this._enabledComponents.append(component)
        }
        if (data.hasOwnProperty('order') && data.hasOwnProperty('scripts')) {
            component._scriptsData = data.scripts
            for (let i = 0; i < data.order.length; i++) {
                component.create(data.order[i], {
                    enabled: data.scripts[data.order[i]].enabled,
                    attributes: data.scripts[data.order[i]].attributes,
                    preloading: this.preloading,
                })
            }
        }
    }
    cloneComponent(entity, clone) {
        const order = []
        const scripts = {}
        for (let i = 0; i < entity.script._scripts.length; i++) {
            const scriptInstance = entity.script._scripts[i]
            const scriptName = scriptInstance.__scriptType.__name
            order.push(scriptName)
            const attributes = entity.script._attributeDataMap?.get(scriptName) || {}
            for (const key in scriptInstance.__attributes) {
                attributes[key] = scriptInstance.__attributes[key]
            }
            scripts[scriptName] = {
                enabled: scriptInstance._enabled,
                attributes: attributes,
            }
        }
        for (const key in entity.script._scriptsIndex) {
            if (key.awaiting) {
                order.splice(key.ind, 0, key)
            }
        }
        const data = {
            enabled: entity.script.enabled,
            order: order,
            scripts: scripts,
        }
        return this.addComponent(clone, data)
    }
    _resetExecutionOrder() {
        executionOrderCounter = 0
        for (let i = 0, len = this._components.length; i < len; i++) {
            this._components.items[i]._executionOrder = executionOrderCounter++
        }
    }
    _callComponentMethod(components, name, dt) {
        for (components.loopIndex = 0; components.loopIndex < components.length; components.loopIndex++) {
            components.items[components.loopIndex][name](dt)
        }
    }
    _onInitialize() {
        this.preloading = false
        this._callComponentMethod(this._components, METHOD_INITIALIZE_ATTRIBUTES)
        this._callComponentMethod(this._enabledComponents, METHOD_INITIALIZE)
    }
    _onPostInitialize() {
        this._callComponentMethod(this._enabledComponents, METHOD_POST_INITIALIZE)
    }
    _onUpdate(dt) {
        this._callComponentMethod(this._enabledComponents, METHOD_UPDATE, dt)
    }
    _onPostUpdate(dt) {
        this._callComponentMethod(this._enabledComponents, METHOD_POST_UPDATE, dt)
    }
    _addComponentToEnabled(component) {
        this._enabledComponents.insert(component)
    }
    _removeComponentFromEnabled(component) {
        this._enabledComponents.remove(component)
    }
    _onBeforeRemove(entity, component) {
        const ind = this._components.items.indexOf(component)
        if (ind >= 0) {
            component._onBeforeRemove()
        }
        this._removeComponentFromEnabled(component)
        this._components.remove(component)
    }
    destroy() {
        super.destroy()
        this.app.systems.off('initialize', this._onInitialize, this)
        this.app.systems.off('postInitialize', this._onPostInitialize, this)
        this.app.systems.off('update', this._onUpdate, this)
        this.app.systems.off('postUpdate', this._onPostUpdate, this)
    }
    constructor(app) {
        super(app)
        this.id = 'script'
        this.ComponentType = ScriptComponent
        this.DataType = ScriptComponentData
        this._components = new SortedLoopArray({
            sortBy: '_executionOrder',
        })
        this._enabledComponents = new SortedLoopArray({
            sortBy: '_executionOrder',
        })
        this.preloading = true
        this.on('beforeremove', this._onBeforeRemove, this)
        this.app.systems.on('initialize', this._onInitialize, this)
        this.app.systems.on('postInitialize', this._onPostInitialize, this)
        this.app.systems.on('update', this._onUpdate, this)
        this.app.systems.on('postUpdate', this._onPostUpdate, this)
    }
}

const tmpSize = new Vec2()
let subDrawDataArray = new Uint32Array(0)
const _fullRangeInterval = [0, 0]
class GSplatInfo {
    destroy() {
        this.intervals.length = 0
        this.intervalOffsets.length = 0
        this.intervalAllocIds.length = 0
        this.intervalNodeIndices.length = 0
        this.subDrawTexture?.destroy()
        this.subDrawTexture = null
        this.subDrawCount = 0
    }
    setLayout(intervalOffsets) {
        this.intervalOffsets = intervalOffsets
        this.subDrawTexture?.destroy()
        this.subDrawTexture = null
        this.subDrawCount = 0
    }
    ensureSubDrawTexture(textureWidth) {
        if (!this.subDrawTexture && textureWidth > 0) {
            this.updateSubDraws(textureWidth)
        }
    }
    updateIntervals(intervals) {
        const resource = this.resource
        this.intervals.length = 0
        this.intervalAllocIds.length = 0
        this.intervalNodeIndices.length = 0
        this.activeSplats = resource.numSplats
        if (intervals.size > 0) {
            let totalCount = 0
            let k = 0
            this.intervals.length = intervals.size * 2
            for (const [nodeIndex, interval] of intervals) {
                this.intervals[k++] = interval.x
                this.intervals[k++] = interval.y + 1
                totalCount += interval.y - interval.x + 1
                if (this.nodeInfos) {
                    this.intervalAllocIds.push(this.nodeInfos[nodeIndex].allocId)
                    this.intervalNodeIndices.push(nodeIndex)
                }
            }
            if (this.octreeNodes) {
                this.activeSplats = totalCount
                this.numBoundsEntries = this.octreeNodes.length
            } else if (totalCount === this.numSplats) {
                this.intervals.length = 0
            } else {
                this.activeSplats = totalCount
            }
        } else {
            this.numBoundsEntries = 1
            this.intervalAllocIds.push(this.allocId)
            const totalCenters = resource.centers?.length / 3
            if (totalCenters && this.activeSplats < totalCenters) {
                this.intervals[0] = 0
                this.intervals[1] = this.activeSplats
            }
        }
    }
    appendSubDraws(subDrawData, subDrawCount, sourceBase, size, targetOffset, textureWidth) {
        let remaining = size
        let row = (targetOffset / textureWidth) | 0
        const col = targetOffset % textureWidth
        if (col > 0) {
            const count = Math.min(remaining, textureWidth - col)
            const idx = subDrawCount * 4
            subDrawData[idx] = row | (1 << 16)
            subDrawData[idx + 1] = col
            subDrawData[idx + 2] = col + count
            subDrawData[idx + 3] = sourceBase
            subDrawCount++
            sourceBase += count
            remaining -= count
            row++
        }
        const fullRows = (remaining / textureWidth) | 0
        if (fullRows > 0) {
            const idx = subDrawCount * 4
            subDrawData[idx] = row | (fullRows << 16)
            subDrawData[idx + 1] = 0
            subDrawData[idx + 2] = textureWidth
            subDrawData[idx + 3] = sourceBase
            subDrawCount++
            sourceBase += fullRows * textureWidth
            remaining -= fullRows * textureWidth
            row += fullRows
        }
        if (remaining > 0) {
            const idx = subDrawCount * 4
            subDrawData[idx] = row | (1 << 16)
            subDrawData[idx + 1] = 0
            subDrawData[idx + 2] = remaining
            subDrawData[idx + 3] = sourceBase
            subDrawCount++
        }
        return subDrawCount
    }
    updateSubDraws(textureWidth) {
        let intervals = this.intervals
        let numIntervals = intervals.length / 2
        if (numIntervals === 0) {
            _fullRangeInterval[0] = 0
            _fullRangeInterval[1] = this.activeSplats
            intervals = _fullRangeInterval
            numIntervals = 1
        }
        const maxSubDraws = numIntervals * 3
        const requiredSize = maxSubDraws * 4
        if (subDrawDataArray.length < requiredSize) {
            subDrawDataArray = new Uint32Array(requiredSize)
        }
        const subDrawData = subDrawDataArray
        let subDrawCount = 0
        for (let i = 0; i < numIntervals; i++) {
            subDrawCount = this.appendSubDraws(
                subDrawData,
                subDrawCount,
                intervals[i * 2],
                intervals[i * 2 + 1] - intervals[i * 2],
                this.intervalOffsets[i],
                textureWidth,
            )
        }
        this.subDrawCount = subDrawCount
        const { x: texWidth, y: texHeight } = TextureUtils.calcTextureSize(subDrawCount, tmpSize)
        this.subDrawTexture = Texture.createDataTexture2D(
            this.device,
            'subDrawData',
            texWidth,
            texHeight,
            PIXELFORMAT_RGBA32U,
        )
        const texData = this.subDrawTexture.lock()
        texData.set(subDrawData.subarray(0, subDrawCount * 4))
        this.subDrawTexture.unlock()
    }
    update() {
        const worldMatrix = this.node.getWorldTransform()
        const worldMatrixChanged = !this.previousWorldTransform.equals(worldMatrix)
        if (worldMatrixChanged) {
            this.previousWorldTransform.copy(worldMatrix)
        }
        const renderDirty = this._consumeRenderDirty ? this._consumeRenderDirty() : false
        return worldMatrixChanged || renderDirty
    }
    resetColorAccumulators(colorUpdateAngle, colorUpdateDistance) {
        const randomFactor = Math.random()
        this.colorAccumulatedRotation = randomFactor * colorUpdateAngle
        this.colorAccumulatedTranslation = randomFactor * colorUpdateDistance
    }
    writeBoundsSpheres(data, offset) {
        if (this.octreeNodes) {
            for (let i = 0; i < this.octreeNodes.length; i++) {
                const s = this.octreeNodes[i].boundingSphere
                data[offset++] = s.x
                data[offset++] = s.y
                data[offset++] = s.z
                data[offset++] = s.w
            }
        } else {
            const aabb = this.resource.aabb
            const he = aabb.halfExtents
            const r = Math.sqrt(he.x * he.x + he.y * he.y + he.z * he.z)
            data[offset++] = aabb.center.x
            data[offset++] = aabb.center.y
            data[offset++] = aabb.center.z
            data[offset++] = r
        }
    }
    get hasSphericalHarmonics() {
        return this.resource.gsplatData?.shBands > 0
    }
    constructor(device, resource, placement, consumeRenderDirty = null, octreeNodes = null, nodeInfos = null) {
        this.activeSplats = 0
        this.intervals = []
        this.intervalOffsets = []
        this.intervalAllocIds = []
        this.intervalNodeIndices = []
        this.previousWorldTransform = new Mat4()
        this.aabb = new BoundingBox()
        this.subDrawTexture = null
        this.subDrawCount = 0
        this.numBoundsEntries = 0
        this.boundsBaseIndex = 0
        this.octreeNodes = null
        this.nodeInfos = null
        this.colorAccumulatedRotation = 0
        this.colorAccumulatedTranslation = 0
        this.parameters = null
        this.getWorkBufferModifier = null
        this.getInstanceStreams = null
        this._consumeRenderDirty = null
        this.device = device
        this.resource = resource
        this.node = placement.node
        this.lodIndex = placement.lodIndex
        this.placementId = placement.id
        this.allocId = placement.allocId
        this.parentPlacementId =
            octreeNodes && placement.parentPlacement ? placement.parentPlacement.allocId : placement.allocId
        this.numSplats = resource.numSplats
        this.aabb.copy(placement.aabb)
        this.parameters = placement.parameters
        this.getWorkBufferModifier = () => placement.workBufferModifier
        this.getInstanceStreams = () => placement.streams
        this._consumeRenderDirty = consumeRenderDirty
        this.octreeNodes = octreeNodes
        this.nodeInfos = nodeInfos
        this.updateIntervals(placement.intervals)
    }
}

function UnifiedSortWorker() {
    const myself = (typeof self !== 'undefined' && self) || require('node:worker_threads').parentPort
    const centersMap = new Map()
    let centersData
    let distances
    let countBuffer
    let indexMap
    let _radialSort = false
    let _warnedSortKeyOverflow = false
    const numBins = 32
    const binBase = new Float32Array(numBins + 1)
    const binDivider = new Float32Array(numBins + 1)
    const binWeightsUtil = new GSplatSortBinWeights()
    const unpackBinWeights = (binWeights) => {
        for (let i = 0; i < numBins; i++) {
            binBase[i] = binWeights[i * 2]
            binDivider[i] = binWeights[i * 2 + 1]
        }
        binBase[numBins] = binBase[numBins - 1] + binDivider[numBins - 1]
        binDivider[numBins] = 0
    }
    const evaluateSortKeysCommon = (
        sortParams,
        minDist,
        range,
        distances,
        countBuffer,
        centersData,
        processSplatFn,
    ) => {
        const { ids, intervals } = centersData
        const invBinRange = numBins / range
        let compactIdx = 0
        for (let paramIdx = 0; paramIdx < sortParams.length; paramIdx++) {
            const params = sortParams[paramIdx]
            const id = ids[paramIdx]
            const centers = centersMap.get(id)
            if (!centers) {
                console.error('UnifiedSortWorker: No centers found for id', id)
            }
            const intervalsArray = intervals[paramIdx].length > 0 ? intervals[paramIdx] : [0, centers.length / 3]
            for (let i = 0; i < intervalsArray.length; i += 2) {
                const intervalStart = intervalsArray[i] * 3
                const intervalEnd = intervalsArray[i + 1] * 3
                compactIdx = processSplatFn(
                    centers,
                    params,
                    intervalStart,
                    intervalEnd,
                    compactIdx,
                    invBinRange,
                    minDist,
                    range,
                    distances,
                    countBuffer,
                )
            }
        }
    }
    const evaluateSortKeysLinear = (sortParams, minDist, range, distances, countBuffer, centersData) => {
        evaluateSortKeysCommon(
            sortParams,
            minDist,
            range,
            distances,
            countBuffer,
            centersData,
            (
                centers,
                params,
                intervalStart,
                intervalEnd,
                compactIdx,
                invBinRange,
                minDist,
                range,
                distances,
                countBuffer,
            ) => {
                const { transformedDirection, offset, scale } = params
                const dx = transformedDirection.x
                const dy = transformedDirection.y
                const dz = transformedDirection.z
                const sdx = dx * scale
                const sdy = dy * scale
                const sdz = dz * scale
                const add = offset - minDist
                for (let srcIndex = intervalStart; srcIndex < intervalEnd; srcIndex += 3) {
                    const x = centers[srcIndex]
                    const y = centers[srcIndex + 1]
                    const z = centers[srcIndex + 2]
                    const dist = x * sdx + y * sdy + z * sdz + add
                    const d = dist * invBinRange
                    const bin = d >>> 0
                    const sortKey = (binBase[bin] + binDivider[bin] * (d - bin)) >>> 0
                    distances[compactIdx++] = sortKey
                    countBuffer[sortKey]++
                }
                return compactIdx
            },
        )
    }
    const evaluateSortKeysRadial = (sortParams, minDist, range, distances, countBuffer, centersData) => {
        evaluateSortKeysCommon(
            sortParams,
            minDist,
            range,
            distances,
            countBuffer,
            centersData,
            (
                centers,
                params,
                intervalStart,
                intervalEnd,
                compactIdx,
                invBinRange,
                minDist,
                range,
                distances,
                countBuffer,
            ) => {
                const { transformedPosition, scale } = params
                const cx = transformedPosition.x
                const cy = transformedPosition.y
                const cz = transformedPosition.z
                for (let srcIndex = intervalStart; srcIndex < intervalEnd; srcIndex += 3) {
                    const dx = centers[srcIndex] - cx
                    const dy = centers[srcIndex + 1] - cy
                    const dz = centers[srcIndex + 2] - cz
                    const distSq = dx * dx + dy * dy + dz * dz
                    const dist = Math.sqrt(distSq) * scale
                    const invertedDist = range - dist
                    const d = invertedDist * invBinRange
                    const bin = d >>> 0
                    const sortKey = (binBase[bin] + binDivider[bin] * (d - bin)) >>> 0
                    distances[compactIdx++] = sortKey
                    countBuffer[sortKey]++
                }
                return compactIdx
            },
        )
    }
    const countingSort = (bucketCount, countBuffer, numVertices, distances, order) => {
        for (let i = 1; i < bucketCount; i++) {
            countBuffer[i] += countBuffer[i - 1]
        }
        const validCount = countBuffer[bucketCount - 1]
        if (validCount !== numVertices && !_warnedSortKeyOverflow) {
            _warnedSortKeyOverflow = true
            console.warn(
                `[SortWorker] ${numVertices - validCount} splats lost due to sortKey overflow. Check resource AABB bounds contain all the splats.`,
            )
        }
        for (let i = 0; i < numVertices; i++) {
            const distance = distances[i]
            const destIndex = --countBuffer[distance]
            order[destIndex] = indexMap[i]
        }
    }
    const computeEffectiveDistanceRangeLinear = (sortParams) => {
        let minDist = Infinity
        let maxDist = -Infinity
        for (let paramIdx = 0; paramIdx < sortParams.length; paramIdx++) {
            const params = sortParams[paramIdx]
            const { transformedDirection, offset, scale, aabbMin, aabbMax } = params
            const dx = transformedDirection.x
            const dy = transformedDirection.y
            const dz = transformedDirection.z
            const pxMin = dx >= 0 ? aabbMin[0] : aabbMax[0]
            const pyMin = dy >= 0 ? aabbMin[1] : aabbMax[1]
            const pzMin = dz >= 0 ? aabbMin[2] : aabbMax[2]
            const pxMax = dx >= 0 ? aabbMax[0] : aabbMin[0]
            const pyMax = dy >= 0 ? aabbMax[1] : aabbMin[1]
            const pzMax = dz >= 0 ? aabbMax[2] : aabbMin[2]
            const dMin = pxMin * dx + pyMin * dy + pzMin * dz
            const dMax = pxMax * dx + pyMax * dy + pzMax * dz
            const eMin = dMin * scale + offset
            const eMax = dMax * scale + offset
            const localMin = Math.min(eMin, eMax)
            const localMax = Math.max(eMin, eMax)
            if (localMin < minDist) minDist = localMin
            if (localMax > maxDist) maxDist = localMax
        }
        if (minDist === Infinity) {
            minDist = 0
            maxDist = 0
        }
        return {
            minDist,
            maxDist,
        }
    }
    const computeEffectiveDistanceRangeRadial = (sortParams) => {
        let maxDist = -Infinity
        for (let paramIdx = 0; paramIdx < sortParams.length; paramIdx++) {
            const params = sortParams[paramIdx]
            const { transformedPosition, scale, aabbMin, aabbMax } = params
            const cx = transformedPosition.x
            const cy = transformedPosition.y
            const cz = transformedPosition.z
            for (let i = 0; i < 8; i++) {
                const px = i & 1 ? aabbMax[0] : aabbMin[0]
                const py = i & 2 ? aabbMax[1] : aabbMin[1]
                const pz = i & 4 ? aabbMax[2] : aabbMin[2]
                const dx = px - cx
                const dy = py - cy
                const dz = pz - cz
                const distSq = dx * dx + dy * dy + dz * dz
                const dist = Math.sqrt(distSq) * scale
                if (dist > maxDist) maxDist = dist
            }
        }
        const minDist = 0
        if (maxDist < 0) {
            maxDist = 0
        }
        return {
            minDist,
            maxDist,
        }
    }
    const sort = (sortParams, order, centersData) => {
        const sortStartTime = performance.now()
        const { minDist, maxDist } = _radialSort
            ? computeEffectiveDistanceRangeRadial(sortParams)
            : computeEffectiveDistanceRangeLinear(sortParams)
        const numVertices = centersData.totalActiveSplats
        const compareBits = Math.max(10, Math.min(20, Math.round(Math.log2(numVertices / 4))))
        const bucketCount = 2 ** compareBits + 1
        if (distances?.length !== numVertices) {
            distances = new Uint32Array(numVertices)
        }
        if (!countBuffer || countBuffer.length !== bucketCount) {
            countBuffer = new Uint32Array(bucketCount)
        } else {
            countBuffer.fill(0)
        }
        const range = maxDist - minDist
        const cameraBin = GSplatSortBinWeights.computeCameraBin(_radialSort, minDist, range)
        const binWeights = binWeightsUtil.compute(cameraBin, bucketCount)
        unpackBinWeights(binWeights)
        if (_radialSort) {
            evaluateSortKeysRadial(sortParams, minDist, range, distances, countBuffer, centersData)
        } else {
            evaluateSortKeysLinear(sortParams, minDist, range, distances, countBuffer, centersData)
        }
        countingSort(bucketCount, countBuffer, numVertices, distances, order)
        const count = numVertices
        const sortTime = performance.now() - sortStartTime
        const transferList = [order.buffer]
        const response = {
            order: order.buffer,
            count,
            version: centersData.version,
            sortTime: sortTime,
        }
        myself.postMessage(response, transferList)
    }
    const buildIndexMap = (data) => {
        const { ids, pixelOffsets, intervals, totalActiveSplats } = data
        if (!indexMap || indexMap.length < totalActiveSplats) {
            indexMap = new Uint32Array(totalActiveSplats)
        }
        let compactIdx = 0
        for (let paramIdx = 0; paramIdx < ids.length; paramIdx++) {
            const centers = centersMap.get(ids[paramIdx])
            const offsets = pixelOffsets[paramIdx]
            const intervalsArray = intervals[paramIdx].length > 0 ? intervals[paramIdx] : [0, centers.length / 3]
            for (let i = 0; i < intervalsArray.length; i += 2) {
                let workBufferIndex = offsets[i / 2]
                const count = intervalsArray[i + 1] - intervalsArray[i]
                for (let j = 0; j < count; j++) {
                    indexMap[compactIdx++] = workBufferIndex++
                }
            }
        }
    }
    myself.addEventListener('message', (message) => {
        const msgData = message.data ?? message
        switch (msgData.command) {
            case 'addCenters': {
                centersMap.set(msgData.id, new Float32Array(msgData.centers))
                break
            }
            case 'removeCenters': {
                centersMap.delete(msgData.id)
                break
            }
            case 'sort': {
                _radialSort = msgData.radialSorting || false
                const order = new Uint32Array(msgData.order)
                sort(msgData.sortParams, order, centersData)
                break
            }
            case 'intervals': {
                centersData = msgData
                buildIndexMap(centersData)
                break
            }
        }
    })
}

let GSplatSortBinWeights$1 = class GSplatSortBinWeights {
    static get NUM_BINS() {
        return 32
    }
    static get WEIGHT_TIERS() {
        return [
            {
                maxDistance: 0,
                weight: 40.0,
            },
            {
                maxDistance: 2,
                weight: 20.0,
            },
            {
                maxDistance: 5,
                weight: 8.0,
            },
            {
                maxDistance: 10,
                weight: 3.0,
            },
            {
                maxDistance: Infinity,
                weight: 1.0,
            },
        ]
    }
    static computeCameraBin(radialSort, minDist, range) {
        const numBins = GSplatSortBinWeights.NUM_BINS
        if (radialSort) {
            return numBins - 1
        }
        const cameraOffsetFromRangeStart = -minDist
        const cameraBinFloat = (cameraOffsetFromRangeStart / range) * numBins
        return Math.max(0, Math.min(numBins - 1, Math.floor(cameraBinFloat)))
    }
    compute(cameraBin, bucketCount) {
        if (cameraBin === this.lastCameraBin && bucketCount === this.lastBucketCount) {
            return this.binWeights
        }
        this.lastCameraBin = cameraBin
        this.lastBucketCount = bucketCount
        const numBins = GSplatSortBinWeights.NUM_BINS
        const bitsPerBin = this.bitsPerBin
        for (let i = 0; i < numBins; i++) {
            const distFromCamera = Math.abs(i - cameraBin)
            bitsPerBin[i] = this.weightByDistance[distFromCamera]
        }
        let totalWeight = 0
        for (let i = 0; i < numBins; i++) {
            totalWeight += bitsPerBin[i]
        }
        let accumulated = 0
        for (let i = 0; i < numBins; i++) {
            const divider = Math.max(1, Math.floor((bitsPerBin[i] / totalWeight) * bucketCount))
            this.binWeights[i * 2] = accumulated
            this.binWeights[i * 2 + 1] = divider
            accumulated += divider
        }
        if (accumulated > bucketCount) {
            const excess = accumulated - bucketCount
            const lastDividerIdx = (numBins - 1) * 2 + 1
            this.binWeights[lastDividerIdx] = Math.max(1, this.binWeights[lastDividerIdx] - excess)
        }
        return this.binWeights
    }
    constructor() {
        this.binWeights = new Float32Array(GSplatSortBinWeights.NUM_BINS * 2)
        this.lastCameraBin = -1
        this.lastBucketCount = -1
        const numBins = GSplatSortBinWeights.NUM_BINS
        const weightTiers = GSplatSortBinWeights.WEIGHT_TIERS
        this.bitsPerBin = new Float32Array(numBins)
        this.weightByDistance = new Float32Array(numBins)
        for (let dist = 0; dist < numBins; dist++) {
            let weight = 1.0
            for (let j = 0; j < weightTiers.length; j++) {
                if (dist <= weightTiers[j].maxDistance) {
                    weight = weightTiers[j].weight
                    break
                }
            }
            this.weightByDistance[dist] = weight
        }
    }
}

const _neededIds = new Set()
class GSplatUnifiedSorter extends EventHandler {
    onSorted(message) {
        if (this._destroyed) {
            return
        }
        const msgData = message.data ?? message
        if (this.scene && msgData.sortTime !== undefined) {
            this.scene.fire('gsplat:sorted', msgData.sortTime)
        }
        const orderData = new Uint32Array(msgData.order)
        this.jobsInFlight--
        if (this.pendingSorted) {
            this.releaseOrderData(this.pendingSorted.orderData)
        }
        this.pendingSorted = {
            count: msgData.count,
            version: msgData.version,
            orderData: orderData,
        }
    }
    applyPendingSorted() {
        if (this.pendingSorted) {
            const { count, version, orderData } = this.pendingSorted
            this.pendingSorted = null
            this.fire('sorted', count, version, orderData)
            this.releaseOrderData(orderData)
        }
    }
    releaseOrderData(orderData) {
        if (orderData.length === this.bufferLength) {
            this.availableOrderData.push(orderData)
        }
    }
    destroy() {
        this._destroyed = true
        this.pendingSorted = null
        this.worker.terminate()
        this.worker = null
    }
    setCenters(id, centers) {
        if (centers) {
            if (!this.centersSet.has(id)) {
                this.centersSet.add(id)
                const centersBuffer = centers.buffer.slice()
                this.worker.postMessage(
                    {
                        command: 'addCenters',
                        id: id,
                        centers: centersBuffer,
                    },
                    [centersBuffer],
                )
            }
        } else {
            if (this.centersSet.has(id)) {
                this.centersSet.delete(id)
                this.worker.postMessage({
                    command: 'removeCenters',
                    id: id,
                })
            }
        }
    }
    updateCentersForSplats(splats) {
        for (const splat of splats) {
            const id = splat.resource.id
            _neededIds.add(id)
            if (!this.centersSet.has(id)) {
                this.setCenters(id, splat.resource.centers)
            }
        }
        for (const id of this.centersSet) {
            if (!_neededIds.has(id)) {
                this.setCenters(id, null)
            }
        }
        _neededIds.clear()
    }
    setSortParameters(payload) {
        this.hasNewVersion = true
        const { textureSize } = payload
        const newLength = textureSize * textureSize
        if (newLength !== this.bufferLength) {
            this.bufferLength = newLength
            this.availableOrderData.length = 0
        }
        this.worker.postMessage(payload)
    }
    setSortParams(params, radialSorting) {
        if (this.hasNewVersion || this.jobsInFlight === 0) {
            let orderData = this.availableOrderData.pop()
            if (!orderData) {
                orderData = new Uint32Array(this.bufferLength)
            }
            this.jobsInFlight++
            this.hasNewVersion = false
            this.worker.postMessage(
                {
                    command: 'sort',
                    sortParams: params,
                    radialSorting: radialSorting,
                    order: orderData.buffer,
                },
                [orderData.buffer],
            )
        }
    }
    constructor(scene) {
        ;(super(),
            (this.bufferLength = 0),
            (this.availableOrderData = []),
            (this.jobsInFlight = 0),
            (this.hasNewVersion = false),
            (this.pendingSorted = null),
            (this.centersSet = new Set()),
            (this._destroyed = false),
            (this.scene = null))
        this.scene = scene ?? null
        const workerSource = `
						const GSplatSortBinWeights = ${GSplatSortBinWeights$1.toString()};
						(${UnifiedSortWorker.toString()})()
				`
        if (platform.environment === 'node') {
            this.worker = new Worker(workerSource, {
                eval: true,
            })
            this.worker.on('message', this.onSorted.bind(this))
        } else {
            this.worker = new Worker(
                URL.createObjectURL(
                    new Blob([workerSource], {
                        type: 'application/javascript',
                    }),
                ),
            )
            this.worker.addEventListener('message', this.onSorted.bind(this))
        }
    }
}

class GSplatRenderer {
    setRenderMode(renderMode) {
        const oldRenderMode = this.renderMode ?? 0
        const wasForward = (oldRenderMode & GSPLAT_FORWARD) !== 0
        const wasShadow = (oldRenderMode & GSPLAT_SHADOW) !== 0
        const isForward = (renderMode & GSPLAT_FORWARD) !== 0
        const isShadow = (renderMode & GSPLAT_SHADOW) !== 0
        this.meshInstance.castShadow = isShadow
        if (wasForward && !isForward) {
            this.layer.removeMeshInstances([this.meshInstance], true)
        }
        if (wasShadow && !isShadow) {
            this.layer.removeShadowCasters([this.meshInstance])
        }
        if (!wasForward && isForward) {
            this.layer.addMeshInstances([this.meshInstance], true)
        }
        if (!wasShadow && isShadow) {
            this.layer.addShadowCasters([this.meshInstance])
        }
        this.renderMode = renderMode
    }
    destroy() {
        if (this.renderMode) {
            if (this.renderMode & GSPLAT_FORWARD) {
                this.layer.removeMeshInstances([this.meshInstance], true)
            }
            if (this.renderMode & GSPLAT_SHADOW) {
                this.layer.removeShadowCasters([this.meshInstance])
            }
        }
        this._material.destroy()
        this.meshInstance.destroy()
    }
    get material() {
        return this._material
    }
    configureMaterial() {
        const { workBuffer } = this
        this._injectFormatChunks()
        this._material.setDefine('SH_BANDS', '0')
        const colorStream = workBuffer.format.getStream('dataColor')
        if (colorStream && colorStream.format !== PIXELFORMAT_RGBA16U) {
            this._material.setDefine('GSPLAT_COLOR_FLOAT', '')
        }
        this._updateIdDefines()
        this._bindWorkBufferTextures()
        this._material.setParameter('numSplats', 0)
        this.setOrderData()
        this._material.setParameter('alphaClip', 0.3)
        this._material.setDefine(`DITHER_${'NONE'}`, '')
        this._material.cull = CULLFACE_NONE
        this._material.blendType = BLEND_PREMULTIPLIED
        this._material.depthWrite = false
        this._material.update()
    }
    _bindWorkBufferTextures() {
        const { workBuffer } = this
        for (const stream of workBuffer.format.resourceStreams) {
            const texture = workBuffer.getTexture(stream.name)
            if (texture) {
                this._material.setParameter(stream.name, texture)
            }
        }
    }
    _injectFormatChunks() {
        const chunks = this.device.isWebGPU ? this._material.shaderChunks.wgsl : this._material.shaderChunks.glsl
        const wbFormat = this.workBuffer.format
        chunks.set('gsplatDeclarationsVS', wbFormat.getInputDeclarations())
        chunks.set('gsplatReadVS', wbFormat.getReadCode())
    }
    update(count, textureSize) {
        this.meshInstance.instancingCount = Math.ceil(count / GSplatResourceBase.instanceSize)
        this._material.setParameter('numSplats', count)
        this._material.setParameter('splatTextureSize', textureSize)
        this.meshInstance.visible = count > 0
    }
    updateIndirect(textureSize) {
        this._material.setParameter('splatTextureSize', textureSize)
        this.meshInstance.visible = true
    }
    setIndirectDraw(drawSlot, compactedSplatIds, numSplatsBuffer) {
        this.meshInstance.setIndirect(null, drawSlot, 1)
        this._material.setParameter('compactedSplatIds', compactedSplatIds)
        this._material.setParameter('numSplatsStorage', numSplatsBuffer)
        if (!this._material.getDefine('GSPLAT_INDIRECT_DRAW')) {
            this._material.setDefine('GSPLAT_INDIRECT_DRAW', true)
            this._material.update()
        }
    }
    disableIndirectDraw() {
        this.meshInstance.setIndirect(null, -1)
        if (this._material.getDefine('GSPLAT_INDIRECT_DRAW')) {
            this._material.setDefine('GSPLAT_INDIRECT_DRAW', false)
            this._material.update()
        }
        this.setOrderData()
    }
    setOrderData() {
        if (this.device.isWebGPU) {
            this._material.setParameter('splatOrder', this.workBuffer.orderBuffer)
        } else {
            this._material.setParameter('splatOrder', this.workBuffer.orderTexture)
        }
    }
    frameUpdate(params) {
        if (params.colorRamp) {
            this._material.setParameter('colorRampIntensity', params.colorRampIntensity)
        }
        this._syncWithWorkBufferFormat()
        if (this.forceCopyMaterial || params.material.dirty) {
            this.copyMaterialSettings(params.material)
            this.forceCopyMaterial = false
        }
    }
    _updateIdDefines() {
        const hasPcId = !!this.workBuffer.format.getStream('pcId')
        this._material.setDefine('GSPLAT_UNIFIED_ID', hasPcId)
        this._material.setDefine('PICK_CUSTOM_ID', hasPcId)
    }
    _syncWithWorkBufferFormat() {
        const wbFormat = this.workBuffer.format
        if (this._workBufferFormatVersion !== wbFormat.extraStreamsVersion) {
            this._workBufferFormatVersion = wbFormat.extraStreamsVersion
            this.workBuffer.syncWithFormat()
            this._injectFormatChunks()
            this._bindWorkBufferTextures()
            this._updateIdDefines()
            this._material.update()
        }
    }
    copyMaterialSettings(sourceMaterial) {
        const keysToDelete = []
        this._material.defines.forEach((value, key) => {
            if (!this._internalDefines.has(key)) {
                keysToDelete.push(key)
            }
        })
        keysToDelete.forEach((key) => this._material.defines.delete(key))
        sourceMaterial.defines.forEach((value, key) => {
            this._material.defines.set(key, value)
        })
        const srcParams = sourceMaterial.parameters
        for (const paramName in srcParams) {
            if (srcParams.hasOwnProperty(paramName)) {
                this._material.setParameter(paramName, srcParams[paramName].data)
            }
        }
        if (sourceMaterial.hasShaderChunks) {
            this._material.shaderChunks.copy(sourceMaterial.shaderChunks)
        }
        this._injectFormatChunks()
        this._material.update()
    }
    updateOverdrawMode(params) {
        const overdrawEnabled = !!params.colorRamp
        const wasOverdrawEnabled = this._material.getDefine('GSPLAT_OVERDRAW')
        if (overdrawEnabled) {
            this._material.setParameter('colorRamp', params.colorRamp)
            this._material.setParameter('colorRampIntensity', params.colorRampIntensity)
        }
        if (overdrawEnabled !== wasOverdrawEnabled) {
            this._material.setDefine('GSPLAT_OVERDRAW', overdrawEnabled)
            if (overdrawEnabled) {
                this.originalBlendType = this._material.blendType
                this._material.blendType = BLEND_ADDITIVE
            } else {
                this._material.blendType = this.originalBlendType
            }
            this._material.update()
        }
    }
    setMaxNumSplats(numSplats) {
        const roundedNumSplats = math.roundUp(numSplats, GSplatResourceBase.instanceSize)
        if (this.instanceIndicesCount < roundedNumSplats) {
            this.instanceIndicesCount = roundedNumSplats
            this.instanceIndices?.destroy()
            this.instanceIndices = GSplatResourceBase.createInstanceIndices(this.device, numSplats)
            this.meshInstance.setInstancing(this.instanceIndices, true)
            this._material.setParameter('splatTextureSize', this.workBuffer.textureSize)
        }
    }
    createMeshInstance() {
        const mesh = GSplatResourceBase.createMesh(this.device)
        const textureSize = this.workBuffer.textureSize
        const instanceIndices = GSplatResourceBase.createInstanceIndices(this.device, textureSize * textureSize)
        const meshInstance = new MeshInstance(mesh, this._material)
        meshInstance.node = this.node
        meshInstance.setInstancing(instanceIndices, true)
        meshInstance.instancingCount = 0
        const thisCamera = this.cameraNode.camera
        meshInstance.isVisibleFunc = (camera) => {
            const renderMode = this.renderMode ?? 0
            if (thisCamera.camera === camera && renderMode & GSPLAT_FORWARD) {
                return true
            }
            if (renderMode & GSPLAT_SHADOW) {
                return camera.node?.name === SHADOWCAMERA_NAME
            }
            return false
        }
        return meshInstance
    }
    constructor(device, node, cameraNode, layer, workBuffer) {
        this.instanceIndices = null
        this.instanceIndicesCount = 0
        this.originalBlendType = BLEND_ADDITIVE
        this._internalDefines = new Set()
        this.forceCopyMaterial = true
        this._workBufferFormatVersion = -1
        this.device = device
        this.node = node
        this.cameraNode = cameraNode
        this.layer = layer
        this.workBuffer = workBuffer
        this._workBufferFormatVersion = workBuffer.format.extraStreamsVersion
        this._material = new ShaderMaterial({
            uniqueName: 'UnifiedSplatMaterial',
            vertexGLSL: '#include "gsplatVS"',
            fragmentGLSL: '#include "gsplatPS"',
            vertexWGSL: '#include "gsplatVS"',
            fragmentWGSL: '#include "gsplatPS"',
            attributes: {
                vertex_position: SEMANTIC_POSITION,
                vertex_id_attrib: SEMANTIC_ATTR13,
            },
        })
        this.configureMaterial()
        this._material.defines.forEach((value, key) => {
            this._internalDefines.add(key)
        })
        this._internalDefines.add('GSPLAT_UNIFIED_ID')
        this._internalDefines.add('PICK_CUSTOM_ID')
        this._internalDefines.add('GSPLAT_INDIRECT_DRAW')
        this.meshInstance = this.createMeshInstance()
    }
}

const GsplatAllocId = new NumericIds()

class GSplatPlacement {
    set lodBaseDistance(value) {
        if (this._lodBaseDistance !== value) {
            this._lodBaseDistance = value
            this.lodDirty = true
        }
    }
    get lodBaseDistance() {
        return this._lodBaseDistance
    }
    set lodMultiplier(value) {
        if (this._lodMultiplier !== value) {
            this._lodMultiplier = value
            this.lodDirty = true
        }
    }
    get lodMultiplier() {
        return this._lodMultiplier
    }
    destroy() {
        this._streams?.destroy()
        this._streams = null
        this.intervals.clear()
        this.resource = null
    }
    set workBufferModifier(value) {
        this._workBufferModifier = value
        this.renderDirty = true
    }
    get workBufferModifier() {
        return this.parentPlacement?.workBufferModifier ?? this._workBufferModifier
    }
    consumeRenderDirty() {
        const format = this.resource?.format
        if (format && this._lastFormatVersion !== format.extraStreamsVersion) {
            this._lastFormatVersion = format.extraStreamsVersion
            this.renderDirty = true
        }
        if (this.workBufferUpdate === WORKBUFFER_UPDATE_ALWAYS) {
            this.renderDirty = true
        } else if (this.workBufferUpdate === WORKBUFFER_UPDATE_ONCE) {
            this.renderDirty = true
            this.workBufferUpdate = WORKBUFFER_UPDATE_AUTO
        }
        const dirty = this.renderDirty
        this.renderDirty = false
        return dirty
    }
    set aabb(aabb) {
        this._aabb = aabb?.clone() ?? null
    }
    get aabb() {
        const aabb = this._aabb ?? this.resource?.aabb
        return aabb
    }
    getLodDistance(level) {
        return this.lodBaseDistance * Math.pow(this.lodMultiplier, level)
    }
    getInstanceTexture(name, device) {
        const resource = this.resource
        if (!resource?.format) {
            return undefined
        }
        if (!this._streams && resource.format.instanceStreams.length > 0) {
            this._streams = new GSplatStreams(device, true)
            this._streams.textureDimensions.copy(resource.streams.textureDimensions)
            this._streams.syncWithFormat(resource.format)
        }
        return this._streams?.getTexture(name)
    }
    get streams() {
        return this.parentPlacement?.streams ?? this._streams
    }
    ensureInstanceStreams(device) {
        const resource = this.resource
        if (!resource?.format) {
            return
        }
        if (!this._streams && resource.format.instanceStreams.length > 0) {
            this._streams = new GSplatStreams(device, true)
            this._streams.textureDimensions.copy(resource.streams.textureDimensions)
            this._streams.syncWithFormat(resource.format)
        }
    }
    constructor(resource, node, lodIndex = 0, parameters = null, parentPlacement = null, id = null) {
        this.intervals = new Map()
        this.id = 0
        this.allocId = GsplatAllocId.get()
        this.lodIndex = 0
        this._lodBaseDistance = 5
        this._lodMultiplier = 3
        this._aabb = null
        this.parameters = null
        this._streams = null
        this.lodDirty = false
        this.renderDirty = false
        this.workBufferUpdate = WORKBUFFER_UPDATE_AUTO
        this._lastFormatVersion = -1
        this._workBufferModifier = null
        this.parentPlacement = null
        this.id = id ?? parentPlacement?.id ?? 0
        this.resource = resource
        this.node = node
        this.lodIndex = lodIndex
        this.parameters = parameters ?? parentPlacement?.parameters ?? null
        this.parentPlacement = parentPlacement
    }
}

const _invWorldMat = new Mat4()
const _localCameraPos = new Vec3()
const _localCameraFwd = new Vec3()
const _dirToNode = new Vec3()
const _tempCompletedUrls = []
new BoundingBox()
const REF_TAN_HALF_FOV = Math.tan(22.5 * math.DEG_TO_RAD)
;[new Color(1, 0, 0), new Color(0, 1, 0), new Color(0, 0, 1), new Color(1, 1, 0), new Color(1, 0, 1)]
class NodeInfo {
    resetLod() {
        this.currentLod = -1
        this.optimalLod = -1
    }
    constructor() {
        this.currentLod = -1
        this.optimalLod = -1
        this.worldDistance = 0
        this.inst = null
        this.lods = null
        this.allocId = GsplatAllocId.get()
    }
}
class GSplatOctreeInstance {
    get pendingLoadCount() {
        let count = this.pending.size + this.prefetchPending.size
        if (this.octree.environmentUrl && !this.environmentPlacement) {
            count++
        }
        return count
    }
    destroy() {
        if (this.octree && !this.octree.destroyed) {
            const filesToDecRef = this.getFileDecrements()
            for (const fileIndex of filesToDecRef) {
                this.octree.decRefCount(fileIndex, 0)
            }
            for (const fileIndex of this.pending) {
                if (!this.filePlacements[fileIndex]) {
                    this.octree.unloadResource(fileIndex)
                }
            }
            for (const fileIndex of this.prefetchPending) {
                if (!this.filePlacements[fileIndex]) {
                    this.octree.unloadResource(fileIndex)
                }
            }
            if (this.environmentPlacement) {
                this.octree.decEnvironmentRefCount()
            }
        }
        this.pending.clear()
        this.pendingDecrements.clear()
        this.filePlacements.length = 0
        if (this.environmentPlacement) {
            this.activePlacements.delete(this.environmentPlacement)
            this.environmentPlacement = null
        }
        this._deviceLostEvent?.off()
        this._deviceLostEvent = null
    }
    _onDeviceLost() {
        for (let i = 0; i < this.filePlacements.length; i++) {
            if (this.filePlacements[i]) {
                this.octree.decRefCount(i, 0)
            }
        }
        this.filePlacements.fill(null)
        this.activePlacements.clear()
        this.pending.clear()
        this.pendingDecrements.clear()
        this.removedCandidates.clear()
        this.prefetchPending.clear()
        this.pendingVisibleAdds.clear()
        for (const nodeInfo of this.nodeInfos) {
            nodeInfo.resetLod()
        }
        if (this.environmentPlacement) {
            this.activePlacements.delete(this.environmentPlacement)
            this.environmentPlacement = null
            this.octree.unloadEnvironmentResource()
        }
        this.dirtyModifiedPlacements = true
        this.dirtyPlacementSetChanged = true
        this.needsLodUpdate = true
    }
    getFileDecrements() {
        const toRelease = []
        for (let i = 0; i < this.filePlacements.length; i++) {
            if (this.filePlacements[i]) {
                toRelease.push(i)
            }
        }
        return toRelease
    }
    selectDesiredLodIndex(node, optimalLodIndex, maxLod, lodUnderfillLimit) {
        if (lodUnderfillLimit > 0) {
            const allowedMaxCoarseLod = Math.min(maxLod, optimalLodIndex + lodUnderfillLimit)
            for (let lod = optimalLodIndex; lod <= allowedMaxCoarseLod; lod++) {
                const fi = node.lods[lod].fileIndex
                if (fi !== -1 && this.octree.getFileResource(fi)) {
                    return lod
                }
            }
            for (let lod = allowedMaxCoarseLod; lod >= optimalLodIndex; lod--) {
                const fi = node.lods[lod].fileIndex
                if (fi !== -1) {
                    return lod
                }
            }
        }
        return optimalLodIndex
    }
    prefetchNextLod(node, desiredLodIndex, optimalLodIndex) {
        if (desiredLodIndex === -1 || optimalLodIndex === -1) return
        if (desiredLodIndex === optimalLodIndex) {
            const fi = node.lods[optimalLodIndex].fileIndex
            if (fi !== -1) {
                this.octree.ensureFileResource(fi)
                if (!this.octree.getFileResource(fi)) {
                    this.prefetchPending.add(fi)
                }
            }
            return
        }
        const targetLod = Math.max(optimalLodIndex, desiredLodIndex - 1)
        for (let lod = targetLod; lod >= optimalLodIndex; lod--) {
            const fi = node.lods[lod].fileIndex
            if (fi !== -1) {
                this.octree.ensureFileResource(fi)
                if (!this.octree.getFileResource(fi)) {
                    this.prefetchPending.add(fi)
                }
                break
            }
        }
    }
    updateLod(cameraNode, params) {
        const maxLod = this.octree.lodLevels - 1
        const { lodBaseDistance, lodMultiplier } = this.placement
        const { lodRangeMin, lodRangeMax } = params
        const rangeMin = Math.max(0, Math.min(lodRangeMin ?? 0, maxLod))
        const rangeMax = Math.max(rangeMin, Math.min(lodRangeMax ?? maxLod, maxLod))
        const uniformScale = this.placement.node.getWorldTransform().getScale().x
        this.evaluateNodeLods(
            cameraNode,
            maxLod,
            lodBaseDistance,
            lodMultiplier,
            rangeMin,
            rangeMax,
            params,
            uniformScale,
        )
        this.applyLodChanges(maxLod, params)
    }
    evaluateNodeLods(cameraNode, maxLod, lodBaseDistance, lodMultiplier, rangeMin, rangeMax, params, uniformScale) {
        const { lodBehindPenalty } = params
        const camera = cameraNode.camera
        let tanHalfVFov = Math.tan(camera.fov * 0.5 * math.DEG_TO_RAD)
        if (camera.horizontalFov) {
            tanHalfVFov /= camera.aspectRatio
        }
        const tanHalfHFov = tanHalfVFov * camera.aspectRatio
        const fovScale = Math.min(tanHalfVFov, tanHalfHFov) / REF_TAN_HALF_FOV
        const invLogMult = 1.0 / Math.log(lodMultiplier)
        const worldCameraPosition = cameraNode.getPosition()
        const octreeWorldTransform = this.placement.node.getWorldTransform()
        _invWorldMat.copy(octreeWorldTransform).invert()
        const localCameraPosition = _invWorldMat.transformPoint(worldCameraPosition, _localCameraPos)
        const worldCameraForward = cameraNode.forward
        const localCameraForward = _invWorldMat.transformVector(worldCameraForward, _localCameraFwd).normalize()
        const nodes = this.octree.nodes
        const nodeInfos = this.nodeInfos
        let totalSplats = 0
        for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            const node = nodes[nodeIndex]
            const nodeInfo = nodeInfos[nodeIndex]
            node.bounds.closestPoint(localCameraPosition, _dirToNode)
            _dirToNode.sub(localCameraPosition)
            const actualDistance = _dirToNode.length()
            let penalizedDistance = actualDistance
            if (lodBehindPenalty > 1 && actualDistance > 0.01) {
                const dotOverDistance = localCameraForward.dot(_dirToNode) / actualDistance
                if (dotOverDistance < 0) {
                    const t = -dotOverDistance
                    const factor = 1 + t * (lodBehindPenalty - 1)
                    penalizedDistance = actualDistance * factor
                }
            }
            const fovAdjustedDistance = penalizedDistance * fovScale
            let optimalLodIndex
            if (fovAdjustedDistance < lodBaseDistance) {
                optimalLodIndex = 0
            } else {
                const rawLod = 1 + Math.log(fovAdjustedDistance / lodBaseDistance) * invLogMult
                optimalLodIndex = Math.min(maxLod, rawLod | 0)
            }
            if (optimalLodIndex < rangeMin) optimalLodIndex = rangeMin
            if (optimalLodIndex > rangeMax) optimalLodIndex = rangeMax
            nodeInfo.optimalLod = optimalLodIndex
            nodeInfo.worldDistance = fovAdjustedDistance * uniformScale
            const lod = nodes[nodeIndex].lods[optimalLodIndex]
            if (lod && lod.count) {
                totalSplats += lod.count
            }
        }
        return totalSplats
    }
    evaluateOptimalLods(cameraNode, params, budgetScale = 1) {
        const maxLod = this.octree.lodLevels - 1
        const { lodBaseDistance, lodMultiplier } = this.placement
        const { lodRangeMin, lodRangeMax } = params
        const rangeMin = Math.max(0, Math.min(lodRangeMin ?? 0, maxLod))
        const rangeMax = Math.max(rangeMin, Math.min(lodRangeMax ?? maxLod, maxLod))
        this.rangeMin = rangeMin
        this.rangeMax = rangeMax
        const uniformScale = this.placement.node.getWorldTransform().getScale().x
        const effectiveBase = lodBaseDistance * budgetScale
        const effectiveMult = Math.max(1.2, lodMultiplier * Math.pow(budgetScale, -0.2))
        return this.evaluateNodeLods(
            cameraNode,
            maxLod,
            effectiveBase,
            effectiveMult,
            rangeMin,
            rangeMax,
            params,
            uniformScale,
        )
    }
    applyLodChanges(maxLod, params) {
        const nodes = this.octree.nodes
        const { lodUnderfillLimit = 0 } = params
        for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
            const node = nodes[nodeIndex]
            const nodeInfo = this.nodeInfos[nodeIndex]
            const optimalLodIndex = nodeInfo.optimalLod
            const currentLodIndex = nodeInfo.currentLod
            const desiredLodIndex = this.selectDesiredLodIndex(node, optimalLodIndex, maxLod, lodUnderfillLimit)
            if (desiredLodIndex !== currentLodIndex) {
                const currentFileIndex = currentLodIndex >= 0 ? node.lods[currentLodIndex].fileIndex : -1
                const desiredFileIndex = desiredLodIndex >= 0 ? node.lods[desiredLodIndex].fileIndex : -1
                const wasVisible = currentFileIndex !== -1
                const willBeVisible = desiredFileIndex !== -1
                const pendingEntry = this.pendingDecrements.get(nodeIndex)
                if (pendingEntry) {
                    if (pendingEntry.newFileIndex !== desiredFileIndex) {
                        const prevPendingPlacement = this.filePlacements[pendingEntry.newFileIndex]
                        if (prevPendingPlacement) {
                            this.decrementFileRef(pendingEntry.newFileIndex, nodeIndex)
                        }
                        if (wasVisible && willBeVisible) {
                            this.pendingDecrements.set(nodeIndex, {
                                oldFileIndex: pendingEntry.oldFileIndex,
                                newFileIndex: desiredFileIndex,
                            })
                        } else {
                            this.pendingDecrements.delete(nodeIndex)
                        }
                    }
                }
                if (!wasVisible && willBeVisible) {
                    const prevPendingFi = this.pendingVisibleAdds.get(nodeIndex)
                    if (prevPendingFi !== undefined && prevPendingFi !== desiredFileIndex) {
                        this.decrementFileRef(prevPendingFi, nodeIndex)
                        this.pendingVisibleAdds.delete(nodeIndex)
                    }
                    this.incrementFileRef(desiredFileIndex, nodeIndex, desiredLodIndex)
                    const newPlacement = this.filePlacements[desiredFileIndex]
                    if (newPlacement?.resource) {
                        nodeInfo.currentLod = desiredLodIndex
                        this.pendingVisibleAdds.delete(nodeIndex)
                    } else {
                        this.pendingVisibleAdds.set(nodeIndex, desiredFileIndex)
                    }
                } else if (wasVisible && !willBeVisible) {
                    const pendingEntry2 = this.pendingDecrements.get(nodeIndex)
                    if (pendingEntry2) {
                        this.decrementFileRef(pendingEntry2.newFileIndex, nodeIndex)
                        this.pendingDecrements.delete(nodeIndex)
                    }
                    this.decrementFileRef(currentFileIndex, nodeIndex)
                    nodeInfo.currentLod = -1
                    this.pendingVisibleAdds.delete(nodeIndex)
                } else if (wasVisible && willBeVisible) {
                    this.incrementFileRef(desiredFileIndex, nodeIndex, desiredLodIndex)
                    const newPlacement = this.filePlacements[desiredFileIndex]
                    if (newPlacement?.resource) {
                        this.decrementFileRef(currentFileIndex, nodeIndex)
                        this.pendingDecrements.delete(nodeIndex)
                        nodeInfo.currentLod = desiredLodIndex
                        this.pendingVisibleAdds.delete(nodeIndex)
                    } else {
                        this.pendingDecrements.set(nodeIndex, {
                            oldFileIndex: currentFileIndex,
                            newFileIndex: desiredFileIndex,
                        })
                        this.pendingVisibleAdds.delete(nodeIndex)
                    }
                }
            }
            this.prefetchNextLod(node, desiredLodIndex, optimalLodIndex)
        }
    }
    incrementFileRef(fileIndex, nodeIndex, lodIndex) {
        if (fileIndex === -1) return
        let placement = this.filePlacements[fileIndex]
        if (!placement) {
            placement = new GSplatPlacement(null, this.placement.node, lodIndex, null, this.placement)
            this.filePlacements[fileIndex] = placement
            const removeScheduled = this.removedCandidates.delete(fileIndex)
            if (!removeScheduled) {
                this.octree.incRefCount(fileIndex)
            }
            if (!this.addFilePlacement(fileIndex)) {
                this.octree.ensureFileResource(fileIndex)
                this.pending.add(fileIndex)
            }
        }
        const nodes = this.octree.nodes
        const node = nodes[nodeIndex]
        const lod = node.lods[lodIndex]
        const interval = new Vec2(lod.offset, lod.offset + lod.count - 1)
        placement.intervals.set(nodeIndex, interval)
        this.dirtyModifiedPlacements = true
    }
    decrementFileRef(fileIndex, nodeIndex) {
        if (fileIndex === -1) return
        const placement = this.filePlacements[fileIndex]
        if (!placement) {
            return
        }
        if (placement) {
            placement.intervals.delete(nodeIndex)
            this.dirtyModifiedPlacements = true
            if (placement.intervals.size === 0) {
                if (placement.resource) {
                    this.activePlacements.delete(placement)
                    if (this.activePlacements.size === 0) {
                        this.dirtyPlacementSetChanged = true
                    }
                }
                this.removedCandidates.add(fileIndex)
                this.filePlacements[fileIndex] = null
                this.pending.delete(fileIndex)
            }
        }
    }
    addFilePlacement(fileIndex) {
        const res = this.octree.getFileResource(fileIndex)
        if (res) {
            const placement = this.filePlacements[fileIndex]
            if (placement) {
                placement.resource = res
                if (this.activePlacements.size === 0) {
                    this.dirtyPlacementSetChanged = true
                }
                this.activePlacements.add(placement)
                this.dirtyModifiedPlacements = true
                this.removedCandidates.delete(fileIndex)
                return true
            }
        }
        return false
    }
    testMoved(threshold) {
        const position = this.placement.node.getPosition()
        const length = position.distance(this.previousPosition)
        if (length > threshold) {
            return true
        }
        return false
    }
    updateMoved() {
        this.previousPosition.copy(this.placement.node.getPosition())
    }
    update() {
        if (this.placement.lodDirty) {
            this.placement.lodDirty = false
            this.needsLodUpdate = true
        }
        if (this.pending.size) {
            for (const fileIndex of this.pending) {
                this.octree.ensureFileResource(fileIndex)
                if (this.addFilePlacement(fileIndex)) {
                    _tempCompletedUrls.push(fileIndex)
                    for (const [nodeIndex, { oldFileIndex, newFileIndex }] of this.pendingDecrements) {
                        if (newFileIndex === fileIndex) {
                            this.decrementFileRef(oldFileIndex, nodeIndex)
                            this.pendingDecrements.delete(nodeIndex)
                            let newLodIndex = 0
                            const nodeLods = this.octree.nodes[nodeIndex].lods
                            for (let li = 0; li < nodeLods.length; li++) {
                                if (nodeLods[li].fileIndex === newFileIndex) {
                                    newLodIndex = li
                                    break
                                }
                            }
                            this.nodeInfos[nodeIndex].currentLod = newLodIndex
                        }
                    }
                }
            }
            if (_tempCompletedUrls.length > 0) {
                this.needsLodUpdate = true
            }
            for (const fileIndex of _tempCompletedUrls) {
                this.pending.delete(fileIndex)
            }
            _tempCompletedUrls.length = 0
        }
        this.pollPrefetchCompletions()
        if (this.octree.environmentUrl && !this.environmentPlacement) {
            this.octree.ensureEnvironmentResource()
            const envResource = this.octree.environmentResource
            if (envResource) {
                this.environmentPlacement = new GSplatPlacement(
                    envResource,
                    this.placement.node,
                    0,
                    null,
                    this.placement,
                )
                this.environmentPlacement.aabb.copy(envResource.aabb)
                this.activePlacements.add(this.environmentPlacement)
                this.dirtyModifiedPlacements = true
                this.dirtyPlacementSetChanged = true
            }
        }
        const dirty = this.dirtyModifiedPlacements
        this.dirtyModifiedPlacements = false
        return dirty
    }
    consumePlacementSetChanged() {
        const changed = this.dirtyPlacementSetChanged
        this.dirtyPlacementSetChanged = false
        return changed
    }
    debugRender(scene) {}
    consumeNeedsLodUpdate() {
        const v = this.needsLodUpdate
        this.needsLodUpdate = false
        return v
    }
    pollPrefetchCompletions() {
        if (this.prefetchPending.size) {
            for (const fileIndex of this.prefetchPending) {
                this.octree.ensureFileResource(fileIndex)
                if (this.octree.getFileResource(fileIndex)) {
                    _tempCompletedUrls.push(fileIndex)
                }
            }
            if (_tempCompletedUrls.length > 0) {
                this.needsLodUpdate = true
            }
            for (const fileIndex of _tempCompletedUrls) {
                this.prefetchPending.delete(fileIndex)
            }
            _tempCompletedUrls.length = 0
        }
    }
    constructor(device, octree, placement) {
        this.activePlacements = new Set()
        this.dirtyModifiedPlacements = false
        this.dirtyPlacementSetChanged = false
        this.pending = new Set()
        this.pendingDecrements = new Map()
        this.removedCandidates = new Set()
        this.rangeMin = 0
        this.rangeMax = 0
        this.previousPosition = new Vec3()
        this.needsLodUpdate = false
        this.prefetchPending = new Set()
        this.pendingVisibleAdds = new Map()
        this.environmentPlacement = null
        this._deviceLostEvent = null
        this.device = device
        this.octree = octree
        this.placement = placement
        this.nodeInfos = new Array(octree.nodes.length)
        for (let i = 0; i < octree.nodes.length; i++) {
            const nodeInfo = new NodeInfo()
            nodeInfo.inst = this
            this.nodeInfos[i] = nodeInfo
        }
        const numFiles = octree.files.length
        this.filePlacements = new Array(numFiles).fill(null)
        if (octree.environmentUrl) {
            octree.incEnvironmentRefCount()
            octree.ensureEnvironmentResource()
        }
        this._deviceLostEvent = device.on('devicelost', this._onDeviceLost, this)
    }
}

const tmpMin = new Vec3()
const tmpMax = new Vec3()
class GSplatOctreeNode {
    constructor(lods, boundData) {
        this.bounds = new BoundingBox()
        this.boundingSphere = new Vec4()
        this.lods = lods
        tmpMin.set(boundData.min[0], boundData.min[1], boundData.min[2])
        tmpMax.set(boundData.max[0], boundData.max[1], boundData.max[2])
        this.bounds.setMinMax(tmpMin, tmpMax)
        const center = this.bounds.center
        const he = this.bounds.halfExtents
        const radius = Math.sqrt(he.x * he.x + he.y * he.y + he.z * he.z)
        this.boundingSphere.set(center.x, center.y, center.z, radius)
    }
}

const _toDelete = []
class GSplatOctree {
    destroy() {
        this.destroyed = true
        this.fileResources.clear()
        this.cooldowns.clear()
        this.assetLoader?.destroy()
        this.assetLoader = null
        this.environmentResource = null
    }
    _traceLodCounts() {}
    _extractLeafNodes(node, leafNodes) {
        if (node.lods) {
            leafNodes.push({
                lods: node.lods,
                bound: node.bound,
            })
        } else if (node.children) {
            for (const child of node.children) {
                this._extractLeafNodes(child, leafNodes)
            }
        }
    }
    _generateNodeMappingTexture(fileIndex, resource) {
        const numNodes = this.nodes.length
        const format = numNodes <= 256 ? PIXELFORMAT_R8U : numNodes <= 65536 ? PIXELFORMAT_R16U : PIXELFORMAT_R32U
        const ArrayType = numNodes <= 256 ? Uint8Array : numNodes <= 65536 ? Uint16Array : Uint32Array
        const dim = resource.streams.textureDimensions
        const data = new ArrayType(dim.x * dim.y)
        const lodLevel = this.files[fileIndex].lodLevel
        for (let nodeIndex = 0; nodeIndex < numNodes; nodeIndex++) {
            const lod = this.nodes[nodeIndex].lods[lodLevel]
            if (lod.fileIndex === fileIndex) {
                for (let i = 0; i < lod.count; i++) {
                    data[lod.offset + i] = nodeIndex
                }
            }
        }
        return Texture.createDataTexture2D(resource.device, `nodeMappingTexture-${fileIndex}`, dim.x, dim.y, format, [
            data,
        ])
    }
    getFileResource(fileIndex) {
        return this.fileResources.get(fileIndex)
    }
    incRefCount(fileIndex) {
        const count = this.fileRefCounts[fileIndex] + 1
        this.fileRefCounts[fileIndex] = count
        this.cooldowns.delete(fileIndex)
    }
    decRefCount(fileIndex, cooldownTicks) {
        const count = this.fileRefCounts[fileIndex] - 1
        this.fileRefCounts[fileIndex] = count
        if (count === 0) {
            if (cooldownTicks === 0) {
                this.unloadResource(fileIndex)
            } else {
                this.cooldowns.set(fileIndex, cooldownTicks)
            }
        }
    }
    unloadResource(fileIndex) {
        if (!this.assetLoader) {
            return
        }
        const fullUrl = this.files[fileIndex].url
        this.assetLoader.unload(fullUrl)
        if (this.fileResources.has(fileIndex)) {
            this.fileResources.delete(fileIndex)
            this._traceLodCounts()
        }
    }
    updateCooldownTick(cooldownTicks) {
        this.cooldownTicks = cooldownTicks
        if (this.cooldowns.size > 0) {
            this.cooldowns.forEach((remaining, fileIndex) => {
                if (remaining <= 1) {
                    if (this.fileRefCounts[fileIndex] === 0) {
                        this.unloadResource(fileIndex)
                    }
                    _toDelete.push(fileIndex)
                } else {
                    this.cooldowns.set(fileIndex, remaining - 1)
                }
            })
            _toDelete.forEach((idx) => this.cooldowns.delete(idx))
            _toDelete.length = 0
        }
    }
    ensureFileResource(fileIndex) {
        if (this.fileResources.has(fileIndex)) {
            return
        }
        const fullUrl = this.files[fileIndex].url
        const res = this.assetLoader?.getResource(fullUrl)
        if (res) {
            if (!res.streams.textures.has('nodeMappingTexture')) {
                const texture = this._generateNodeMappingTexture(fileIndex, res)
                res.streams.textures.set('nodeMappingTexture', texture)
            }
            this.fileResources.set(fileIndex, res)
            if (this.fileRefCounts[fileIndex] === 0) {
                this.cooldowns.set(fileIndex, this.cooldownTicks)
            }
            this._traceLodCounts()
            return
        }
        this.assetLoader?.load(fullUrl)
    }
    incEnvironmentRefCount() {
        this.environmentRefCount++
    }
    decEnvironmentRefCount() {
        this.environmentRefCount--
        if (this.environmentRefCount === 0) {
            this.unloadEnvironmentResource()
        }
    }
    ensureEnvironmentResource() {
        if (!this.assetLoader) {
            return
        }
        if (!this.environmentUrl) {
            return
        }
        if (this.environmentResource) {
            return
        }
        const res = this.assetLoader.getResource(this.environmentUrl)
        if (res) {
            this.environmentResource = res
            if (this.environmentRefCount === 0) {
                this.unloadEnvironmentResource()
            }
            return
        }
        this.assetLoader.load(this.environmentUrl)
    }
    unloadEnvironmentResource() {
        if (!this.assetLoader) {
            return
        }
        if (this.environmentResource && this.environmentUrl) {
            this.assetLoader.unload(this.environmentUrl)
            this.environmentResource = null
        }
    }
    constructor(assetFileUrl, data) {
        this.fileResources = new Map()
        this.cooldowns = new Map()
        this.environmentUrl = null
        this.environmentResource = null
        this.environmentRefCount = 0
        this.assetLoader = null
        this.destroyed = false
        this.cooldownTicks = 100
        this.lodLevels = data.lodLevels
        this.assetFileUrl = assetFileUrl
        const baseDir = path.getDirectory(assetFileUrl)
        this.files = data.filenames.map((url) => ({
            url: path.isRelativePath(url) ? path.join(baseDir, url) : url,
            lodLevel: -1,
        }))
        this.fileRefCounts = new Int32Array(this.files.length)
        if (data.environment) {
            this.environmentUrl = path.isRelativePath(data.environment)
                ? path.join(baseDir, data.environment)
                : data.environment
        }
        const leafNodes = []
        this._extractLeafNodes(data.tree, leafNodes)
        this.nodes = leafNodes.map((nodeData) => {
            const lods = []
            for (let i = 0; i < this.lodLevels; i++) {
                const lodData = nodeData.lods[i.toString()]
                if (lodData) {
                    lods.push({
                        file: this.files[lodData.file].url || '',
                        fileIndex: lodData.file,
                        offset: lodData.offset || 0,
                        count: lodData.count || 0,
                    })
                    this.files[lodData.file].lodLevel = i
                } else {
                    lods.push({
                        file: '',
                        fileIndex: -1,
                        offset: 0,
                        count: 0,
                    })
                }
            }
            return new GSplatOctreeNode(lods, nodeData.bound)
        })
    }
}

class GSplatOctreeResource {
    destroy() {
        this.octree?.destroy()
        this.octree = null
    }
    constructor(assetFileUrl, data, assetLoader) {
        this.aabb = new BoundingBox()
        this.centersVersion = 0
        this.octree = new GSplatOctree(assetFileUrl, data)
        this.octree.assetLoader = assetLoader
        this.aabb.setMinMax(new Vec3(data.tree.bound.min), new Vec3(data.tree.bound.max))
    }
}

const _newAllocIds = new Set()
const _toAllocateIds = []
const _toAllocate = []
const _toFree = []
class GSplatWorldState {
    destroy() {
        this.splats.forEach((splat) => splat.destroy())
        this.splats.length = 0
        this.needsUpload.length = 0
        this.needsUploadIds.clear()
        this.allocIdToSplat.clear()
        this.boundsGroups.length = 0
    }
    computeAllocationDiff(splats, allocationMap) {
        for (let i = 0; i < splats.length; i++) {
            const splat = splats[i]
            const allocIds = splat.intervalAllocIds
            const intervals = splat.intervals
            const numIntervals = intervals.length / 2
            if (numIntervals > 0 && allocIds.length === numIntervals) {
                for (let j = 0; j < numIntervals; j++) {
                    this._diffAlloc(allocIds[j], intervals[j * 2 + 1] - intervals[j * 2], allocationMap)
                }
            } else {
                this._diffAlloc(splat.allocId, splat.activeSplats, allocationMap)
            }
        }
        for (const [allocId, block] of allocationMap) {
            if (!_newAllocIds.has(allocId)) {
                _toFree.push(block)
                allocationMap.delete(allocId)
            }
        }
    }
    _diffAlloc(allocId, size, allocationMap) {
        _newAllocIds.add(allocId)
        const existing = allocationMap.get(allocId)
        if (existing) {
            if (existing.size !== size) {
                _toFree.push(existing)
                allocationMap.delete(allocId)
                if (size > 0) {
                    _toAllocateIds.push(allocId)
                    _toAllocate.push(size)
                }
            }
        } else if (size > 0) {
            _toAllocateIds.push(allocId)
            _toAllocate.push(size)
        }
    }
    applyAllocations(device, allocator, allocationMap) {
        let fullRebuild = false
        if (_toFree.length > 0 || _toAllocate.length > 0) {
            fullRebuild = allocator.updateAllocation(_toFree, _toAllocate)
            for (let i = 0; i < _toAllocateIds.length; i++) {
                allocationMap.set(_toAllocateIds[i], _toAllocate[i])
            }
        }
        this.fullRebuild = fullRebuild
        const churn = _toFree.length + _toAllocateIds.length
        const incrementalDefragMoves = Math.max(50, churn)
        if (!fullRebuild && allocator.fragmentation > 0.3) {
            const moved = allocator.defrag(incrementalDefragMoves)
            if (moved.size > 0) {
                for (const [allocId, block] of allocationMap) {
                    if (moved.has(block)) {
                        _toAllocateIds.push(allocId)
                    }
                }
            }
        }
        const cap = allocator.capacity
        this.textureSize = cap > 0 ? Math.ceil(Math.sqrt(cap)) : 1
        const changedAllocIds = _toAllocateIds.length > 0 ? new Set(_toAllocateIds) : null
        _newAllocIds.clear()
        _toAllocateIds.length = 0
        _toAllocate.length = 0
        _toFree.length = 0
        return {
            fullRebuild,
            changedAllocIds,
        }
    }
    assignSplatOffsets(splats, allocationMap, fullRebuild, changedAllocIds) {
        let totalActiveSplats = 0
        let totalIntervals = 0
        for (let i = 0; i < splats.length; i++) {
            const splat = splats[i]
            const allocIds = splat.intervalAllocIds
            const intervals = splat.intervals
            const numIntervals = intervals.length / 2
            totalIntervals += numIntervals > 0 ? numIntervals : 1
            let splatChanged = fullRebuild
            const intervalOffsets = []
            if (numIntervals > 0 && allocIds.length === numIntervals) {
                for (let j = 0; j < numIntervals; j++) {
                    this.allocIdToSplat.set(allocIds[j], splat)
                    const block = allocationMap.get(allocIds[j])
                    if (block) {
                        intervalOffsets.push(block.offset)
                        totalActiveSplats += intervals[j * 2 + 1] - intervals[j * 2]
                        if (changedAllocIds && changedAllocIds.has(allocIds[j])) {
                            splatChanged = true
                            this.needsUploadIds.add(allocIds[j])
                        }
                    }
                }
            } else {
                this.allocIdToSplat.set(splat.allocId, splat)
                const block = allocationMap.get(splat.allocId)
                if (block) {
                    intervalOffsets.push(block.offset)
                    totalActiveSplats += splat.activeSplats
                    if (changedAllocIds && changedAllocIds.has(splat.allocId)) {
                        splatChanged = true
                        this.needsUploadIds.add(splat.allocId)
                    }
                }
            }
            if (intervalOffsets.length > 0) {
                splat.setLayout(intervalOffsets)
                if (splatChanged) {
                    this.needsUpload.push(splat)
                    if (fullRebuild) {
                        for (let j = 0; j < allocIds.length; j++) {
                            this.needsUploadIds.add(allocIds[j])
                        }
                    }
                }
            }
        }
        this.totalActiveSplats = totalActiveSplats
        this.totalIntervals = totalIntervals
    }
    buildBoundsGroups(splats) {
        const groupMap = new Map()
        for (let i = 0; i < splats.length; i++) {
            const splat = splats[i]
            const key = splat.parentPlacementId
            if (!groupMap.has(key)) {
                groupMap.set(key, {
                    splat: splat,
                    boundsBaseIndex: 0,
                    numBoundsEntries: splat.numBoundsEntries,
                })
            }
        }
        let boundsIndex = 0
        for (const group of groupMap.values()) {
            group.boundsBaseIndex = boundsIndex
            boundsIndex += group.numBoundsEntries
            this.boundsGroups.push(group)
        }
        for (let i = 0; i < splats.length; i++) {
            const group = groupMap.get(splats[i].parentPlacementId)
            splats[i].boundsBaseIndex = group.boundsBaseIndex
        }
    }
    constructor(device, version, splats, allocator, allocationMap) {
        this.version = 0
        this.sortParametersSet = false
        this.sortedBefore = false
        this.splats = []
        this.textureSize = 0
        this.totalActiveSplats = 0
        this.totalIntervals = 0
        this.boundsGroups = []
        this.pendingReleases = []
        this.needsUpload = []
        this.needsUploadIds = new Set()
        this.allocIdToSplat = new Map()
        this.fullRebuild = false
        this.version = version
        this.splats = splats
        if (splats.length === 0) {
            for (const [, block] of allocationMap) {
                allocator.free(block)
            }
            allocationMap.clear()
            this.totalActiveSplats = 0
            this.totalIntervals = 0
            this.textureSize = 1
            return
        }
        this.computeAllocationDiff(splats, allocationMap)
        const { fullRebuild, changedAllocIds } = this.applyAllocations(device, allocator, allocationMap)
        this.assignSplatOffsets(splats, allocationMap, fullRebuild, changedAllocIds)
        this.buildBoundsGroups(splats)
    }
}

class GSplatPlacementStateTracker {
    hasChanges(placements) {
        let changed = false
        for (const p of placements) {
            if (!p.resource) continue
            const formatVersion = p.resource.format?.extraStreamsVersion ?? 0
            const modifierHash = p.workBufferModifier?.hash ?? 0
            const numSplats = p.resource.numSplats ?? 0
            const centersVersion = p.resource.centersVersion
            const state = this._states.get(p)
            if (!state) {
                this._states.set(p, {
                    formatVersion,
                    modifierHash,
                    numSplats,
                    centersVersion,
                })
                changed = true
            } else if (
                state.formatVersion !== formatVersion ||
                state.modifierHash !== modifierHash ||
                state.numSplats !== numSplats ||
                state.centersVersion !== centersVersion
            ) {
                state.formatVersion = formatVersion
                state.modifierHash = modifierHash
                state.numSplats = numSplats
                state.centersVersion = centersVersion
                changed = true
            }
        }
        return changed
    }
    constructor() {
        this._states = new WeakMap()
    }
}

const computeGsplatSortKeySource = `
@group(0) @binding(0) var dataTransformA: texture_2d<u32>;
@group(0) @binding(1) var<storage, read_write> sortKeys: array<u32>;
struct SortKeyUniforms {
	cameraPosition: vec3f,
	elementCount: u32,
	cameraDirection: vec3f,
	numBits: u32,
	textureSize: u32,
	minDist: f32,
	invRange: f32,
	numWorkgroupsX: u32,
	numBins: u32
};
@group(0) @binding(2) var<uniform> uniforms: SortKeyUniforms;
struct BinWeight {
	base: f32,
	divider: f32
};
@group(0) @binding(3) var<storage, read> binWeights: array<BinWeight>;
#ifdef USE_INDIRECT_SORT
	@group(0) @binding(4) var<storage, read> compactedSplatIds: array<u32>;
	@group(0) @binding(5) var<storage, read> sortElementCountBuf: array<u32>;
#endif
@compute @workgroup_size({WORKGROUP_SIZE_X}, {WORKGROUP_SIZE_Y}, 1)
fn main(
	@builtin(global_invocation_id) global_id: vec3u,
	@builtin(workgroup_id) w_id: vec3u,
	@builtin(num_workgroups) w_dim: vec3u,
	@builtin(local_invocation_index) TID: u32
) {
	#ifdef USE_INDIRECT_SORT
		let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
		let gid = WORKGROUP_ID * ({WORKGROUP_SIZE_X}u * {WORKGROUP_SIZE_Y}u) + TID;
	#else
		let gid = global_id.x + global_id.y * ({WORKGROUP_SIZE_X} * uniforms.numWorkgroupsX);
	#endif
	
	if (gid >= uniforms.elementCount) {
		return;
	}
	#ifdef USE_INDIRECT_SORT
		let visibleCount = sortElementCountBuf[0];
		if (gid >= visibleCount) {
			return;
		}
		let splatId = compactedSplatIds[gid];
	#else
		let splatId = gid;
	#endif
	
	let textureSize = uniforms.textureSize;
	let uv = vec2i(i32(splatId % textureSize), i32(splatId / textureSize));
	
	let packed = textureLoad(dataTransformA, uv, 0);
	let worldCenter = vec3f(
		bitcast<f32>(packed.r),
		bitcast<f32>(packed.g),
		bitcast<f32>(packed.b)
	);
	
	var dist: f32;
	
	#ifdef RADIAL_SORT
		let delta = worldCenter - uniforms.cameraPosition;
		let radialDist = length(delta);
		dist = (1.0 / uniforms.invRange) - radialDist - uniforms.minDist;
	#else
		let toSplat = worldCenter - uniforms.cameraPosition;
		dist = dot(toSplat, uniforms.cameraDirection) - uniforms.minDist;
	#endif
	
	let numBins = uniforms.numBins;
	let d = dist * uniforms.invRange * f32(numBins);
	let binFloat = clamp(d, 0.0, f32(numBins) - 0.001);
	let bin = u32(binFloat);
	let binFrac = binFloat - f32(bin);
	
	let sortKey = u32(binWeights[bin].base + binWeights[bin].divider * binFrac);
	
	sortKeys[gid] = sortKey;
}
`

const WORKGROUP_SIZE_X = 16
const WORKGROUP_SIZE_Y = 16
const THREADS_PER_WORKGROUP = WORKGROUP_SIZE_X * WORKGROUP_SIZE_Y
const _cameraDir = new Vec3()
const _dispatchSize$1 = new Vec2()
class GSplatSortKeyCompute {
    destroy() {
        this.keysBuffer?.destroy()
        this.binWeightsBuffer?.destroy()
        this.compute?.shader?.destroy()
        this.bindGroupFormat?.destroy()
        this.bindGroupFormatIndirect?.destroy()
        this.keysBuffer = null
        this.binWeightsBuffer = null
        this.compute = null
        this.bindGroupFormat = null
        this.bindGroupFormatIndirect = null
        this.uniformBufferFormat = null
    }
    _getCompute(computeRadialSort, computeUseIndirectSort = false) {
        if (
            !this.compute ||
            this.computeRadialSort !== computeRadialSort ||
            this.computeUseIndirectSort !== computeUseIndirectSort
        ) {
            this.compute?.shader?.destroy()
            const modeName = computeRadialSort ? 'Radial' : 'Linear'
            const name = `GSplatSortKeyCompute-${modeName}${computeUseIndirectSort ? '-Indirect' : ''}`
            const cdefines = new Map([
                ['{WORKGROUP_SIZE_X}', `${WORKGROUP_SIZE_X}`],
                ['{WORKGROUP_SIZE_Y}', `${WORKGROUP_SIZE_Y}`],
            ])
            if (computeRadialSort) {
                cdefines.set('RADIAL_SORT', '')
            }
            if (computeUseIndirectSort) {
                cdefines.set('USE_INDIRECT_SORT', '')
            }
            const bgFormat = computeUseIndirectSort ? this.bindGroupFormatIndirect : this.bindGroupFormat
            const shader = new Shader(this.device, {
                name: name,
                shaderLanguage: SHADERLANGUAGE_WGSL,
                cshader: computeGsplatSortKeySource,
                cdefines: cdefines,
                computeBindGroupFormat: bgFormat,
                computeUniformBufferFormats: {
                    uniforms: this.uniformBufferFormat,
                },
            })
            this.compute = new Compute(this.device, shader, name)
            this.computeRadialSort = computeRadialSort
            this.computeUseIndirectSort = computeUseIndirectSort
        }
        return this.compute
    }
    _createBindGroupFormat() {
        const device = this.device
        this.uniformBufferFormat = new UniformBufferFormat(device, [
            new UniformFormat('cameraPosition', UNIFORMTYPE_VEC3),
            new UniformFormat('elementCount', UNIFORMTYPE_UINT),
            new UniformFormat('cameraDirection', UNIFORMTYPE_VEC3),
            new UniformFormat('numBits', UNIFORMTYPE_UINT),
            new UniformFormat('textureSize', UNIFORMTYPE_UINT),
            new UniformFormat('minDist', UNIFORMTYPE_FLOAT),
            new UniformFormat('invRange', UNIFORMTYPE_FLOAT),
            new UniformFormat('numWorkgroupsX', UNIFORMTYPE_UINT),
            new UniformFormat('numBins', UNIFORMTYPE_UINT),
        ])
        this.bindGroupFormat = new BindGroupFormat(device, [
            new BindTextureFormat('dataTransformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindStorageBufferFormat('sortKeys', SHADERSTAGE_COMPUTE, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('binWeights', SHADERSTAGE_COMPUTE, true),
        ])
        this.bindGroupFormatIndirect = new BindGroupFormat(device, [
            new BindTextureFormat('dataTransformA', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindStorageBufferFormat('sortKeys', SHADERSTAGE_COMPUTE, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('binWeights', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('compactedSplatIds', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('sortElementCountBuf', SHADERSTAGE_COMPUTE, true),
        ])
    }
    _ensureCapacity(elementCount) {
        if (elementCount > this.allocatedCount) {
            this.keysBuffer?.destroy()
            this.allocatedCount = elementCount
            this.keysBuffer = new StorageBuffer(this.device, elementCount * 4, BUFFERUSAGE_COPY_SRC)
        }
    }
    generate(workBuffer, cameraNode, computeRadialSort, elementCount, numBits, minDist, maxDist) {
        this._ensureCapacity(elementCount)
        const workgroupCount = Math.ceil(elementCount / THREADS_PER_WORKGROUP)
        Compute.calcDispatchSize(
            workgroupCount,
            _dispatchSize$1,
            this.device.limits.maxComputeWorkgroupsPerDimension || 65535,
        )
        const compute = this._getCompute(computeRadialSort)
        const cameraPos = cameraNode.getPosition()
        const cameraMat = cameraNode.getWorldTransform()
        const cameraDir = cameraMat.getZ(_cameraDir).normalize()
        const range = maxDist - minDist
        const invRange = range > 0 ? 1.0 / range : 1.0
        const bucketCount = 1 << numBits
        const cameraBin = GSplatSortBinWeights$1.computeCameraBin(computeRadialSort, minDist, range)
        const binWeights = this.binWeightsUtil.compute(cameraBin, bucketCount)
        this.binWeightsBuffer.write(0, binWeights)
        compute.setParameter('dataTransformA', workBuffer.getTexture('dataTransformA'))
        compute.setParameter('sortKeys', this.keysBuffer)
        compute.setParameter('binWeights', this.binWeightsBuffer)
        this.cameraPositionData[0] = cameraPos.x
        this.cameraPositionData[1] = cameraPos.y
        this.cameraPositionData[2] = cameraPos.z
        compute.setParameter('cameraPosition', this.cameraPositionData)
        this.cameraDirectionData[0] = cameraDir.x
        this.cameraDirectionData[1] = cameraDir.y
        this.cameraDirectionData[2] = cameraDir.z
        compute.setParameter('cameraDirection', this.cameraDirectionData)
        compute.setParameter('elementCount', elementCount)
        compute.setParameter('numBits', numBits)
        compute.setParameter('textureSize', workBuffer.textureSize)
        compute.setParameter('minDist', minDist)
        compute.setParameter('invRange', invRange)
        compute.setParameter('numWorkgroupsX', _dispatchSize$1.x)
        compute.setParameter('numBins', GSplatSortBinWeights$1.NUM_BINS)
        compute.setupDispatch(_dispatchSize$1.x, _dispatchSize$1.y, 1)
        this.device.computeDispatch([compute], 'GSplatSortKeyCompute')
        return this.keysBuffer
    }
    generateIndirect(
        workBuffer,
        cameraNode,
        computeRadialSort,
        maxElementCount,
        numBits,
        minDist,
        maxDist,
        compactedSplatIds,
        sortElementCountBuffer,
        dispatchSlot,
    ) {
        this._ensureCapacity(maxElementCount)
        const compute = this._getCompute(computeRadialSort, true)
        const cameraPos = cameraNode.getPosition()
        const cameraMat = cameraNode.getWorldTransform()
        const cameraDir = cameraMat.getZ(_cameraDir).normalize()
        const range = maxDist - minDist
        const invRange = range > 0 ? 1.0 / range : 1.0
        const bucketCount = 1 << numBits
        const cameraBin = GSplatSortBinWeights$1.computeCameraBin(computeRadialSort, minDist, range)
        const binWeights = this.binWeightsUtil.compute(cameraBin, bucketCount)
        this.binWeightsBuffer.write(0, binWeights)
        compute.setParameter('dataTransformA', workBuffer.getTexture('dataTransformA'))
        compute.setParameter('sortKeys', this.keysBuffer)
        compute.setParameter('binWeights', this.binWeightsBuffer)
        compute.setParameter('compactedSplatIds', compactedSplatIds)
        compute.setParameter('sortElementCountBuf', sortElementCountBuffer)
        this.cameraPositionData[0] = cameraPos.x
        this.cameraPositionData[1] = cameraPos.y
        this.cameraPositionData[2] = cameraPos.z
        compute.setParameter('cameraPosition', this.cameraPositionData)
        this.cameraDirectionData[0] = cameraDir.x
        this.cameraDirectionData[1] = cameraDir.y
        this.cameraDirectionData[2] = cameraDir.z
        compute.setParameter('cameraDirection', this.cameraDirectionData)
        compute.setParameter('elementCount', maxElementCount)
        compute.setParameter('numBits', numBits)
        compute.setParameter('textureSize', workBuffer.textureSize)
        compute.setParameter('minDist', minDist)
        compute.setParameter('invRange', invRange)
        const workgroupCount = Math.ceil(maxElementCount / THREADS_PER_WORKGROUP)
        Compute.calcDispatchSize(
            workgroupCount,
            _dispatchSize$1,
            this.device.limits.maxComputeWorkgroupsPerDimension || 65535,
        )
        compute.setParameter('numWorkgroupsX', _dispatchSize$1.x)
        compute.setParameter('numBins', GSplatSortBinWeights$1.NUM_BINS)
        compute.setupIndirectDispatch(dispatchSlot)
        this.device.computeDispatch([compute], 'GSplatSortKeyCompute-Indirect')
        return this.keysBuffer
    }
    constructor(device) {
        this.allocatedCount = 0
        this.keysBuffer = null
        this.binWeightsBuffer = null
        this.compute = null
        this.computeRadialSort = false
        this.computeUseIndirectSort = false
        this.bindGroupFormat = null
        this.bindGroupFormatIndirect = null
        this.uniformBufferFormat = null
        this.cameraPositionData = new Float32Array(3)
        this.cameraDirectionData = new Float32Array(3)
        this.device = device
        this.binWeightsUtil = new GSplatSortBinWeights$1()
        this.binWeightsBuffer = new StorageBuffer(
            device,
            GSplatSortBinWeights$1.NUM_BINS * 2 * 4,
            BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST,
        )
        this._createBindGroupFormat()
    }
}

const computeGsplatCompactFlagSource = `
struct FlagUniforms {
	totalSplats: u32,
	textureWidth: u32,
	visWidth: u32,
	totalThreads: u32,
	numWorkgroupsX: u32
};
@group(0) @binding(0) var<uniform> uniforms: FlagUniforms;
@group(0) @binding(1) var pcNodeIndex: texture_2d<u32>;
@group(0) @binding(2) var nodeVisibilityTexture: texture_2d<u32>;
@group(0) @binding(3) var<storage, read_write> flagBuffer: array<u32>;
#ifdef USE_SORTED_ORDER
@group(0) @binding(4) var<storage, read> sortedOrder: array<u32>;
#endif
@compute @workgroup_size({WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
	let totalSplats = uniforms.totalSplats;
	let texW = uniforms.textureWidth;
	let visW = uniforms.visWidth;
	let stride = uniforms.totalThreads;
	let threadId = gid.x + gid.y * uniforms.numWorkgroupsX * {WORKGROUP_SIZE}u;
	for (var idx = threadId; idx < totalSplats; idx += stride) {
		#ifdef USE_SORTED_ORDER
			let splatId = sortedOrder[idx];
		#else
			let splatId = idx;
		#endif
		let uv = vec2i(i32(splatId % texW), i32(splatId / texW));
		let nodeIdx = textureLoad(pcNodeIndex, uv, 0).r;
		let texelIdx = nodeIdx >> 5u;
		let bitIdx = nodeIdx & 31u;
		let visCoord = vec2i(i32(texelIdx % visW), i32(texelIdx / visW));
		let visBits = textureLoad(nodeVisibilityTexture, visCoord, 0).r;
		flagBuffer[idx] = select(0u, 1u, (visBits & (1u << bitIdx)) != 0u);
	}
	if (threadId == 0u) {
		flagBuffer[totalSplats] = 0u;
	}
}
`

const computeGsplatCompactScatterSource = `
struct ScatterUniforms {
	totalSplats: u32,
	numWorkgroupsX: u32,
	pad1: u32,
	pad2: u32
};
@group(0) @binding(0) var<uniform> uniforms: ScatterUniforms;
@group(0) @binding(1) var<storage, read> prefixSumBuffer: array<u32>;
@group(0) @binding(2) var<storage, read_write> compactedOutput: array<u32>;
#ifdef USE_SORTED_ORDER
@group(0) @binding(3) var<storage, read> sortedOrder: array<u32>;
#endif
@compute @workgroup_size({WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
	let i = gid.x + gid.y * uniforms.numWorkgroupsX * {WORKGROUP_SIZE}u;
	if (i >= uniforms.totalSplats) { return; }
	let outIdx = prefixSumBuffer[i];
	let nextIdx = prefixSumBuffer[i + 1u];
	if (outIdx == nextIdx) { return; }
	#ifdef USE_SORTED_ORDER
	let splatId = sortedOrder[i];
	#else
	let splatId = i;
	#endif
	compactedOutput[outIdx] = splatId;
}
`

const computeGsplatWriteIndirectArgsSource = `
${indirectCoreCS}
@group(0) @binding(0) var<storage, read> prefixSumBuffer: array<u32>;
@group(0) @binding(1) var<storage, read_write> indirectDrawArgs: array<DrawIndexedIndirectArgs>;
@group(0) @binding(2) var<storage, read_write> numSplatsBuf: array<u32>;
@group(0) @binding(3) var<storage, read_write> indirectDispatchArgs: array<u32>;
@group(0) @binding(4) var<storage, read_write> sortElementCountBuf: array<u32>;
struct WriteArgsUniforms {
	drawSlot: u32,
	indexCount: u32,
	dispatchSlotOffset: u32,
	totalSplats: u32
};
@group(0) @binding(5) var<uniform> uniforms: WriteArgsUniforms;
@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3u) {
	let count = prefixSumBuffer[uniforms.totalSplats];
	let instanceCount = (count + {INSTANCE_SIZE}u - 1u) / {INSTANCE_SIZE}u;
	indirectDrawArgs[uniforms.drawSlot] = DrawIndexedIndirectArgs(
		uniforms.indexCount,
		instanceCount,
		0u,
		0,
		0u
	);
	numSplatsBuf[0] = count;
	let sortWorkgroupCount = (count + {SORT_THREADS_PER_WORKGROUP}u - 1u) / {SORT_THREADS_PER_WORKGROUP}u;
	let dispatchOffset = uniforms.dispatchSlotOffset;
	indirectDispatchArgs[dispatchOffset + 0u] = sortWorkgroupCount;
	indirectDispatchArgs[dispatchOffset + 1u] = 1u;
	indirectDispatchArgs[dispatchOffset + 2u] = 1u;
	sortElementCountBuf[0] = count;
}
`

const WORKGROUP_SIZE$1 = 256
const SPLATS_PER_THREAD = 4
const INDEX_COUNT$1 = 6 * GSplatResourceBase.instanceSize
const SORT_THREADS_PER_WORKGROUP$1 = 256
const _dispatchSize = new Vec2()
class GSplatCompaction {
    destroy() {
        this.compactedSplatIds?.destroy()
        this.flagBuffer?.destroy()
        this.prefixSumKernel?.destroy()
        this.numSplatsBuffer?.destroy()
        this.sortElementCountBuffer?.destroy()
        this._destroyCompactPasses()
        this._writeIndirectArgsCompute?.shader?.destroy()
        this._writeArgsBindGroupFormat?.destroy()
        this.compactedSplatIds = null
        this.flagBuffer = null
        this.prefixSumKernel = null
        this.numSplatsBuffer = null
        this.sortElementCountBuffer = null
        this._writeIndirectArgsCompute = null
        this._writeArgsBindGroupFormat = null
        this._flagUniformBufferFormat = null
        this._scatterUniformBufferFormat = null
        this._writeArgsUniformBufferFormat = null
    }
    _destroyCompactPasses() {
        this._flagCompute?.shader?.destroy()
        this._scatterCompute?.shader?.destroy()
        this._flagBindGroupFormat?.destroy()
        this._scatterBindGroupFormat?.destroy()
        this._flagCompute = null
        this._scatterCompute = null
        this._flagBindGroupFormat = null
        this._scatterBindGroupFormat = null
    }
    _createUniformBufferFormats() {
        const device = this.device
        this._flagUniformBufferFormat = new UniformBufferFormat(device, [
            new UniformFormat('totalSplats', UNIFORMTYPE_UINT),
            new UniformFormat('textureWidth', UNIFORMTYPE_UINT),
            new UniformFormat('visWidth', UNIFORMTYPE_UINT),
            new UniformFormat('totalThreads', UNIFORMTYPE_UINT),
            new UniformFormat('numWorkgroupsX', UNIFORMTYPE_UINT),
        ])
        this._scatterUniformBufferFormat = new UniformBufferFormat(device, [
            new UniformFormat('totalSplats', UNIFORMTYPE_UINT),
            new UniformFormat('numWorkgroupsX', UNIFORMTYPE_UINT),
            new UniformFormat('pad1', UNIFORMTYPE_UINT),
            new UniformFormat('pad2', UNIFORMTYPE_UINT),
        ])
        this._writeArgsUniformBufferFormat = new UniformBufferFormat(device, [
            new UniformFormat('drawSlot', UNIFORMTYPE_UINT),
            new UniformFormat('indexCount', UNIFORMTYPE_UINT),
            new UniformFormat('dispatchSlotOffset', UNIFORMTYPE_UINT),
            new UniformFormat('totalSplats', UNIFORMTYPE_UINT),
        ])
    }
    _ensureCompactPasses(useSortedOrder) {
        if (this._flagCompute && useSortedOrder === this._useSortedOrder) {
            return
        }
        this._destroyCompactPasses()
        this._useSortedOrder = useSortedOrder
        const device = this.device
        const suffix = useSortedOrder ? 'Sorted' : ''
        const flagEntries = [
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
            new BindTextureFormat('pcNodeIndex', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindTextureFormat('nodeVisibilityTexture', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            new BindStorageBufferFormat('flagBuffer', SHADERSTAGE_COMPUTE, false),
        ]
        if (useSortedOrder) {
            flagEntries.push(new BindStorageBufferFormat('sortedOrder', SHADERSTAGE_COMPUTE, true))
        }
        this._flagBindGroupFormat = new BindGroupFormat(device, flagEntries)
        const scatterEntries = [
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('prefixSumBuffer', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('compactedOutput', SHADERSTAGE_COMPUTE, false),
        ]
        if (useSortedOrder) {
            scatterEntries.push(new BindStorageBufferFormat('sortedOrder', SHADERSTAGE_COMPUTE, true))
        }
        this._scatterBindGroupFormat = new BindGroupFormat(device, scatterEntries)
        this._flagCompute = this._createCompactShader(
            `GSplatCompactFlag${suffix}`,
            computeGsplatCompactFlagSource,
            this._flagBindGroupFormat,
            this._flagUniformBufferFormat,
            useSortedOrder,
        )
        this._scatterCompute = this._createCompactShader(
            `GSplatCompactScatter${suffix}`,
            computeGsplatCompactScatterSource,
            this._scatterBindGroupFormat,
            this._scatterUniformBufferFormat,
            useSortedOrder,
        )
    }
    _createCompactShader(name, source, bindGroupFormat, uniformBufferFormat, useSortedOrder) {
        const cdefines = new Map([['{WORKGROUP_SIZE}', WORKGROUP_SIZE$1]])
        if (useSortedOrder) {
            cdefines.set('USE_SORTED_ORDER', '')
        }
        const shader = new Shader(this.device, {
            name: name,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: source,
            cdefines: cdefines,
            computeBindGroupFormat: bindGroupFormat,
            computeUniformBufferFormats: {
                uniforms: uniformBufferFormat,
            },
        })
        return new Compute(this.device, shader, name)
    }
    _createWriteIndirectArgsCompute() {
        const device = this.device
        this._writeArgsBindGroupFormat = new BindGroupFormat(device, [
            new BindStorageBufferFormat('prefixSumBuffer', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('indirectDrawArgs', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('numSplatsBuf', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('indirectDispatchArgs', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('sortElementCountBuf', SHADERSTAGE_COMPUTE, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
        ])
        const cdefines = new Map([
            ['{INSTANCE_SIZE}', GSplatResourceBase.instanceSize],
            ['{SORT_THREADS_PER_WORKGROUP}', SORT_THREADS_PER_WORKGROUP$1],
        ])
        const shader = new Shader(device, {
            name: 'GSplatWriteIndirectArgs',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: computeGsplatWriteIndirectArgsSource,
            cdefines: cdefines,
            computeBindGroupFormat: this._writeArgsBindGroupFormat,
            computeUniformBufferFormats: {
                uniforms: this._writeArgsUniformBufferFormat,
            },
        })
        this._writeIndirectArgsCompute = new Compute(device, shader, 'GSplatWriteIndirectArgs')
    }
    _ensureCapacity(totalSplats) {
        if (totalSplats > this.allocatedCount) {
            this.compactedSplatIds?.destroy()
            this.allocatedCount = totalSplats
            this.compactedSplatIds = new StorageBuffer(this.device, totalSplats * 4, BUFFERUSAGE_COPY_SRC)
        }
        const requiredFlagCount = totalSplats + 1
        if (requiredFlagCount > this.allocatedFlagCount) {
            this.flagBuffer?.destroy()
            this.allocatedFlagCount = requiredFlagCount
            this.flagBuffer = new StorageBuffer(this.device, requiredFlagCount * 4)
            if (this.prefixSumKernel) {
                this.prefixSumKernel.destroyPasses()
            }
        }
    }
    dispatchCompact(pcNodeIndexTexture, nodeVisibilityTexture, totalSplats, textureWidth, sortedOrderBuffer) {
        this._ensureCapacity(totalSplats)
        const useSortedOrder = !!sortedOrderBuffer
        this._ensureCompactPasses(useSortedOrder)
        const flagCompute = this._flagCompute
        flagCompute.setParameter('pcNodeIndex', pcNodeIndexTexture)
        flagCompute.setParameter('nodeVisibilityTexture', nodeVisibilityTexture)
        flagCompute.setParameter('flagBuffer', this.flagBuffer)
        if (useSortedOrder) {
            flagCompute.setParameter('sortedOrder', sortedOrderBuffer)
        }
        const flagWorkgroups = Math.ceil(totalSplats / (WORKGROUP_SIZE$1 * SPLATS_PER_THREAD))
        Compute.calcDispatchSize(flagWorkgroups, _dispatchSize)
        const totalThreads = _dispatchSize.x * _dispatchSize.y * WORKGROUP_SIZE$1
        flagCompute.setParameter('totalSplats', totalSplats)
        flagCompute.setParameter('textureWidth', textureWidth)
        flagCompute.setParameter('visWidth', nodeVisibilityTexture.width)
        flagCompute.setParameter('totalThreads', totalThreads)
        flagCompute.setParameter('numWorkgroupsX', _dispatchSize.x)
        flagCompute.setupDispatch(_dispatchSize.x, _dispatchSize.y, 1)
        this.device.computeDispatch([flagCompute], 'GSplatCompactFlag')
        const prefixCount = totalSplats + 1
        this.prefixSumKernel.resize(this.flagBuffer, prefixCount)
        this.prefixSumKernel.dispatch(this.device)
        const scatterCompute = this._scatterCompute
        scatterCompute.setParameter('prefixSumBuffer', this.flagBuffer)
        scatterCompute.setParameter('compactedOutput', this.compactedSplatIds)
        if (useSortedOrder) {
            scatterCompute.setParameter('sortedOrder', sortedOrderBuffer)
        }
        const scatterWorkgroups = Math.ceil(totalSplats / WORKGROUP_SIZE$1)
        Compute.calcDispatchSize(scatterWorkgroups, _dispatchSize)
        scatterCompute.setParameter('totalSplats', totalSplats)
        scatterCompute.setParameter('numWorkgroupsX', _dispatchSize.x)
        scatterCompute.setParameter('pad1', 0)
        scatterCompute.setParameter('pad2', 0)
        scatterCompute.setupDispatch(_dispatchSize.x, _dispatchSize.y, 1)
        this.device.computeDispatch([scatterCompute], 'GSplatCompactScatter')
    }
    writeIndirectArgs(drawSlot, dispatchSlot, totalSplats) {
        const compute = this._writeIndirectArgsCompute
        compute.setParameter('prefixSumBuffer', this.flagBuffer)
        compute.setParameter('indirectDrawArgs', this.device.indirectDrawBuffer)
        compute.setParameter('numSplatsBuf', this.numSplatsBuffer)
        compute.setParameter('indirectDispatchArgs', this.device.indirectDispatchBuffer)
        compute.setParameter('sortElementCountBuf', this.sortElementCountBuffer)
        compute.setParameter('drawSlot', drawSlot)
        compute.setParameter('indexCount', INDEX_COUNT$1)
        compute.setParameter('dispatchSlotOffset', dispatchSlot * 3)
        compute.setParameter('totalSplats', totalSplats)
        compute.setupDispatch(1)
        this.device.computeDispatch([compute], 'GSplatWriteIndirectArgs')
    }
    constructor(device) {
        this.compactedSplatIds = null
        this.flagBuffer = null
        this.prefixSumKernel = null
        this.numSplatsBuffer = null
        this.sortElementCountBuffer = null
        this.allocatedCount = 0
        this.allocatedFlagCount = 0
        this._useSortedOrder = false
        this._flagCompute = null
        this._scatterCompute = null
        this._writeIndirectArgsCompute = null
        this._flagBindGroupFormat = null
        this._scatterBindGroupFormat = null
        this._writeArgsBindGroupFormat = null
        this._flagUniformBufferFormat = null
        this._scatterUniformBufferFormat = null
        this._writeArgsUniformBufferFormat = null
        this.device = device
        this.numSplatsBuffer = new StorageBuffer(device, 4, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
        this.sortElementCountBuffer = new StorageBuffer(device, 4, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
        this.prefixSumKernel = new PrefixSumKernel(device)
        this._createUniformBufferFormats()
        this._createWriteIndirectArgsCompute()
    }
}

const computeGsplatIntervalCullSource = `
struct Interval {
	workBufferBase: u32,
	splatCount: u32,
	boundsIndex: u32,
	pad: u32
};
struct CullUniforms {
	numIntervals: u32,
	visWidth: u32
};
@group(0) @binding(0) var<uniform> uniforms: CullUniforms;
@group(0) @binding(1) var<storage, read> intervals: array<Interval>;
@group(0) @binding(2) var<storage, read_write> countBuffer: array<u32>;
#ifdef CULLING_ENABLED
@group(0) @binding(3) var nodeVisibilityTexture: texture_2d<u32>;
#endif
@compute @workgroup_size({WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) gid: vec3u) {
	let idx = gid.x;
	if (idx < uniforms.numIntervals) {
		let interval = intervals[idx];
		#ifdef CULLING_ENABLED
			let boundsIdx = interval.boundsIndex;
			let texelIdx = boundsIdx >> 5u;
			let bitIdx = boundsIdx & 31u;
			let visW = uniforms.visWidth;
			let visCoord = vec2i(i32(texelIdx % visW), i32(texelIdx / visW));
			let visBits = textureLoad(nodeVisibilityTexture, visCoord, 0).r;
			let visible = (visBits & (1u << bitIdx)) != 0u;
			countBuffer[idx] = select(0u, interval.splatCount, visible);
		#else
			countBuffer[idx] = interval.splatCount;
		#endif
	}
	if (idx == 0u) {
		countBuffer[uniforms.numIntervals] = 0u;
	}
}
`

const computeGsplatIntervalScatterSource = `
struct Interval {
	workBufferBase: u32,
	splatCount: u32,
	boundsIndex: u32,
	pad: u32
};
struct ScatterUniforms {
	numIntervals: u32,
	pad0: u32,
	pad1: u32,
	pad2: u32
};
@group(0) @binding(0) var<uniform> uniforms: ScatterUniforms;
@group(0) @binding(1) var<storage, read> intervals: array<Interval>;
@group(0) @binding(2) var<storage, read> prefixSumBuffer: array<u32>;
@group(0) @binding(3) var<storage, read_write> compactedOutput: array<u32>;
@compute @workgroup_size({WORKGROUP_SIZE})
fn main(@builtin(workgroup_id) wgId: vec3u, @builtin(local_invocation_id) lid: vec3u) {
	let intervalIdx = wgId.x;
	if (intervalIdx >= uniforms.numIntervals) { return; }
	let outputOffset = prefixSumBuffer[intervalIdx];
	let nextOffset = prefixSumBuffer[intervalIdx + 1u];
	let count = nextOffset - outputOffset;
	if (count == 0u) { return; }
	let workBufferBase = intervals[intervalIdx].workBufferBase;
	let tid = lid.x;
	for (var j = tid; j < count; j += {WORKGROUP_SIZE}u) {
		compactedOutput[outputOffset + j] = workBufferBase + j;
	}
}
`

const WORKGROUP_SIZE = 256
const INDEX_COUNT = 6 * GSplatResourceBase.instanceSize
const SORT_THREADS_PER_WORKGROUP = 256
const INTERVAL_STRIDE = 4
class GSplatIntervalCompaction {
    destroy() {
        this.compactedSplatIds?.destroy()
        this.intervalsBuffer?.destroy()
        this.countBuffer?.destroy()
        this.prefixSumKernel?.destroy()
        this.numSplatsBuffer?.destroy()
        this.sortElementCountBuffer?.destroy()
        this._destroyCullPass()
        this._scatterCompute?.shader?.destroy()
        this._scatterBindGroupFormat?.destroy()
        this._writeIndirectArgsCompute?.shader?.destroy()
        this._writeArgsBindGroupFormat?.destroy()
        this.compactedSplatIds = null
        this.intervalsBuffer = null
        this.countBuffer = null
        this.prefixSumKernel = null
        this.numSplatsBuffer = null
        this.sortElementCountBuffer = null
        this._scatterCompute = null
        this._scatterBindGroupFormat = null
        this._writeIndirectArgsCompute = null
        this._writeArgsBindGroupFormat = null
        this._cullUniformBufferFormat = null
        this._scatterUniformBufferFormat = null
        this._writeArgsUniformBufferFormat = null
    }
    _destroyCullPass() {
        this._cullCompute?.shader?.destroy()
        this._cullBindGroupFormat?.destroy()
        this._cullCompute = null
        this._cullBindGroupFormat = null
    }
    _createUniformBufferFormats() {
        const device = this.device
        this._cullUniformBufferFormat = new UniformBufferFormat(device, [
            new UniformFormat('numIntervals', UNIFORMTYPE_UINT),
            new UniformFormat('visWidth', UNIFORMTYPE_UINT),
        ])
        this._scatterUniformBufferFormat = new UniformBufferFormat(device, [
            new UniformFormat('numIntervals', UNIFORMTYPE_UINT),
            new UniformFormat('pad0', UNIFORMTYPE_UINT),
            new UniformFormat('pad1', UNIFORMTYPE_UINT),
            new UniformFormat('pad2', UNIFORMTYPE_UINT),
        ])
        this._writeArgsUniformBufferFormat = new UniformBufferFormat(device, [
            new UniformFormat('drawSlot', UNIFORMTYPE_UINT),
            new UniformFormat('indexCount', UNIFORMTYPE_UINT),
            new UniformFormat('dispatchSlotOffset', UNIFORMTYPE_UINT),
            new UniformFormat('totalSplats', UNIFORMTYPE_UINT),
        ])
    }
    _ensureCullPass(cullingEnabled) {
        if (this._cullCompute && cullingEnabled === this._cullingEnabled) {
            return
        }
        this._destroyCullPass()
        this._cullingEnabled = cullingEnabled
        const device = this.device
        const suffix = cullingEnabled ? 'Culled' : ''
        const entries = [
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('intervals', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('countBuffer', SHADERSTAGE_COMPUTE, false),
        ]
        if (cullingEnabled) {
            entries.push(
                new BindTextureFormat('nodeVisibilityTexture', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),
            )
        }
        this._cullBindGroupFormat = new BindGroupFormat(device, entries)
        const cdefines = new Map([['{WORKGROUP_SIZE}', WORKGROUP_SIZE.toString()]])
        if (cullingEnabled) {
            cdefines.set('CULLING_ENABLED', '')
        }
        const shader = new Shader(device, {
            name: `GSplatIntervalCull${suffix}`,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: computeGsplatIntervalCullSource,
            cdefines: cdefines,
            computeBindGroupFormat: this._cullBindGroupFormat,
            computeUniformBufferFormats: {
                uniforms: this._cullUniformBufferFormat,
            },
        })
        this._cullCompute = new Compute(device, shader, `GSplatIntervalCull${suffix}`)
    }
    _createScatterCompute() {
        const device = this.device
        this._scatterBindGroupFormat = new BindGroupFormat(device, [
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
            new BindStorageBufferFormat('intervals', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('prefixSumBuffer', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('compactedOutput', SHADERSTAGE_COMPUTE, false),
        ])
        const cdefines = new Map([['{WORKGROUP_SIZE}', WORKGROUP_SIZE.toString()]])
        const shader = new Shader(device, {
            name: 'GSplatIntervalScatter',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: computeGsplatIntervalScatterSource,
            cdefines: cdefines,
            computeBindGroupFormat: this._scatterBindGroupFormat,
            computeUniformBufferFormats: {
                uniforms: this._scatterUniformBufferFormat,
            },
        })
        this._scatterCompute = new Compute(device, shader, 'GSplatIntervalScatter')
    }
    _createWriteIndirectArgsCompute() {
        const device = this.device
        this._writeArgsBindGroupFormat = new BindGroupFormat(device, [
            new BindStorageBufferFormat('prefixSumBuffer', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('indirectDrawArgs', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('numSplatsBuf', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('indirectDispatchArgs', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('sortElementCountBuf', SHADERSTAGE_COMPUTE, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
        ])
        const cdefines = new Map([
            ['{INSTANCE_SIZE}', GSplatResourceBase.instanceSize],
            ['{SORT_THREADS_PER_WORKGROUP}', SORT_THREADS_PER_WORKGROUP],
        ])
        const shader = new Shader(device, {
            name: 'GSplatIntervalWriteIndirectArgs',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: computeGsplatWriteIndirectArgsSource,
            cdefines: cdefines,
            computeBindGroupFormat: this._writeArgsBindGroupFormat,
            computeUniformBufferFormats: {
                uniforms: this._writeArgsUniformBufferFormat,
            },
        })
        this._writeIndirectArgsCompute = new Compute(device, shader, 'GSplatIntervalWriteIndirectArgs')
    }
    _ensureCapacity(numIntervals, totalActiveSplats) {
        if (totalActiveSplats > this.allocatedCompactedCount) {
            this.compactedSplatIds?.destroy()
            this.allocatedCompactedCount = totalActiveSplats
            this.compactedSplatIds = new StorageBuffer(this.device, totalActiveSplats * 4, BUFFERUSAGE_COPY_SRC)
        }
        const requiredCountSize = numIntervals + 1
        if (requiredCountSize > this.allocatedCountBufferSize) {
            this.countBuffer?.destroy()
            this.allocatedCountBufferSize = requiredCountSize
            this.countBuffer = new StorageBuffer(this.device, requiredCountSize * 4)
            if (this.prefixSumKernel) {
                this.prefixSumKernel.destroyPasses()
            }
        }
    }
    uploadIntervals(worldState) {
        if (worldState.version === this._uploadedVersion) return
        this._uploadedVersion = worldState.version
        const splats = worldState.splats
        const numIntervals = worldState.totalIntervals
        if (numIntervals === 0) return
        if (numIntervals > this.allocatedIntervalCount) {
            this.intervalsBuffer?.destroy()
            this.allocatedIntervalCount = numIntervals
            this.intervalsBuffer = new StorageBuffer(
                this.device,
                numIntervals * INTERVAL_STRIDE * 4,
                BUFFERUSAGE_COPY_DST,
            )
        }
        const data = new Uint32Array(numIntervals * INTERVAL_STRIDE)
        let writeIdx = 0
        for (let s = 0; s < splats.length; s++) {
            const splat = splats[s]
            if (splat.intervals.length > 0) {
                const nodeIndices = splat.intervalNodeIndices
                for (let i = 0; i < splat.intervals.length; i += 2) {
                    const count = splat.intervals[i + 1] - splat.intervals[i]
                    data[writeIdx++] = splat.intervalOffsets[i / 2]
                    data[writeIdx++] = count
                    data[writeIdx++] = splat.boundsBaseIndex + (nodeIndices.length > 0 ? nodeIndices[i / 2] : 0)
                    data[writeIdx++] = 0
                }
            } else {
                data[writeIdx++] = splat.intervalOffsets[0]
                data[writeIdx++] = splat.activeSplats
                data[writeIdx++] = splat.boundsBaseIndex
                data[writeIdx++] = 0
            }
        }
        this.intervalsBuffer.write(0, data, 0, numIntervals * INTERVAL_STRIDE)
    }
    dispatchCompact(nodeVisibilityTexture, numIntervals, totalActiveSplats, cullingEnabled) {
        if (numIntervals === 0) return
        this._ensureCapacity(numIntervals, totalActiveSplats)
        this._ensureCullPass(cullingEnabled)
        const cullCompute = this._cullCompute
        cullCompute.setParameter('intervals', this.intervalsBuffer)
        cullCompute.setParameter('countBuffer', this.countBuffer)
        if (cullingEnabled) {
            cullCompute.setParameter('nodeVisibilityTexture', nodeVisibilityTexture)
        }
        cullCompute.setParameter('numIntervals', numIntervals)
        cullCompute.setParameter('visWidth', cullingEnabled ? nodeVisibilityTexture.width : 0)
        const cullWorkgroups = Math.ceil(numIntervals / WORKGROUP_SIZE)
        cullCompute.setupDispatch(cullWorkgroups)
        this.device.computeDispatch([cullCompute], 'GSplatIntervalCull')
        const prefixCount = numIntervals + 1
        this.prefixSumKernel.resize(this.countBuffer, prefixCount)
        this.prefixSumKernel.dispatch(this.device)
        const scatterCompute = this._scatterCompute
        scatterCompute.setParameter('intervals', this.intervalsBuffer)
        scatterCompute.setParameter('prefixSumBuffer', this.countBuffer)
        scatterCompute.setParameter('compactedOutput', this.compactedSplatIds)
        scatterCompute.setParameter('numIntervals', numIntervals)
        scatterCompute.setParameter('pad0', 0)
        scatterCompute.setParameter('pad1', 0)
        scatterCompute.setParameter('pad2', 0)
        scatterCompute.setupDispatch(numIntervals)
        this.device.computeDispatch([scatterCompute], 'GSplatIntervalScatter')
    }
    writeIndirectArgs(drawSlot, dispatchSlot, numIntervals) {
        const compute = this._writeIndirectArgsCompute
        compute.setParameter('prefixSumBuffer', this.countBuffer)
        compute.setParameter('indirectDrawArgs', this.device.indirectDrawBuffer)
        compute.setParameter('numSplatsBuf', this.numSplatsBuffer)
        compute.setParameter('indirectDispatchArgs', this.device.indirectDispatchBuffer)
        compute.setParameter('sortElementCountBuf', this.sortElementCountBuffer)
        compute.setParameter('drawSlot', drawSlot)
        compute.setParameter('indexCount', INDEX_COUNT)
        compute.setParameter('dispatchSlotOffset', dispatchSlot * 3)
        compute.setParameter('totalSplats', numIntervals)
        compute.setupDispatch(1)
        this.device.computeDispatch([compute], 'GSplatIntervalWriteIndirectArgs')
    }
    constructor(device) {
        this.compactedSplatIds = null
        this.intervalsBuffer = null
        this.countBuffer = null
        this.prefixSumKernel = null
        this.numSplatsBuffer = null
        this.sortElementCountBuffer = null
        this.allocatedCompactedCount = 0
        this.allocatedIntervalCount = 0
        this.allocatedCountBufferSize = 0
        this._uploadedVersion = -1
        this._cullingEnabled = false
        this._cullCompute = null
        this._scatterCompute = null
        this._writeIndirectArgsCompute = null
        this._cullBindGroupFormat = null
        this._scatterBindGroupFormat = null
        this._writeArgsBindGroupFormat = null
        this._cullUniformBufferFormat = null
        this._scatterUniformBufferFormat = null
        this._writeArgsUniformBufferFormat = null
        this.device = device
        this.numSplatsBuffer = new StorageBuffer(device, 4, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
        this.sortElementCountBuffer = new StorageBuffer(device, 4, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
        this.prefixSumKernel = new PrefixSumKernel(device)
        this._createUniformBufferFormats()
        this._createScatterCompute()
        this._createWriteIndirectArgsCompute()
    }
}

const NUM_BUCKETS = 64
class GSplatBudgetBalancer {
    _initBuckets() {
        if (!this._buckets) {
            this._buckets = new Array(NUM_BUCKETS)
            for (let i = 0; i < NUM_BUCKETS; i++) {
                this._buckets[i] = []
            }
        }
    }
    balance(octreeInstances, budget, globalMaxDistance) {
        this._initBuckets()
        for (let i = 0; i < NUM_BUCKETS; i++) {
            this._buckets[i].length = 0
        }
        const bucketScale = NUM_BUCKETS / Math.sqrt(globalMaxDistance)
        let totalOptimalSplats = 0
        for (const [, inst] of octreeInstances) {
            const nodes = inst.octree.nodes
            const nodeInfos = inst.nodeInfos
            for (let nodeIndex = 0, len = nodes.length; nodeIndex < len; nodeIndex++) {
                const nodeInfo = nodeInfos[nodeIndex]
                const optimalLod = nodeInfo.optimalLod
                if (optimalLod < 0) continue
                const lods = nodes[nodeIndex].lods
                nodeInfo.lods = lods
                const bucket = (Math.sqrt(nodeInfo.worldDistance) * bucketScale) >>> 0
                const bucketIdx = bucket < NUM_BUCKETS ? bucket : NUM_BUCKETS - 1
                this._buckets[bucketIdx].push(nodeInfo)
                totalOptimalSplats += lods[optimalLod].count
            }
        }
        let currentSplats = totalOptimalSplats
        if (currentSplats === budget) {
            return
        }
        const isOverBudget = currentSplats > budget
        let done = false
        while (!done && (isOverBudget ? currentSplats > budget : currentSplats < budget)) {
            let modified = false
            if (isOverBudget) {
                for (let b = NUM_BUCKETS - 1; b >= 0 && !done; b--) {
                    const bucket = this._buckets[b]
                    for (let i = 0, len = bucket.length; i < len; i++) {
                        const nodeInfo = bucket[i]
                        if (nodeInfo.optimalLod < nodeInfo.inst.rangeMax) {
                            const lods = nodeInfo.lods
                            const optimalLod = nodeInfo.optimalLod
                            currentSplats -= lods[optimalLod].count - lods[optimalLod + 1].count
                            nodeInfo.optimalLod = optimalLod + 1
                            modified = true
                            if (currentSplats <= budget) {
                                done = true
                                break
                            }
                        }
                    }
                }
            } else {
                for (let b = 0; b < NUM_BUCKETS && !done; b++) {
                    const bucket = this._buckets[b]
                    for (let i = 0, len = bucket.length; i < len; i++) {
                        const nodeInfo = bucket[i]
                        if (nodeInfo.optimalLod > nodeInfo.inst.rangeMin) {
                            const lods = nodeInfo.lods
                            const optimalLod = nodeInfo.optimalLod
                            const splatsAdded = lods[optimalLod - 1].count - lods[optimalLod].count
                            if (currentSplats + splatsAdded <= budget) {
                                nodeInfo.optimalLod = optimalLod - 1
                                currentSplats += splatsAdded
                                modified = true
                                if (currentSplats >= budget) {
                                    done = true
                                    break
                                }
                            } else {
                                done = true
                                break
                            }
                        }
                    }
                }
            }
            if (!modified) {
                break
            }
        }
    }
    constructor() {
        this._buckets = null
    }
}

class MemBlock {
    get offset() {
        return this._offset
    }
    get size() {
        return this._size
    }
    constructor() {
        this._offset = 0
        this._size = 0
        this._free = true
        this._prev = null
        this._next = null
        this._prevFree = null
        this._nextFree = null
        this._bucket = -1
    }
}
class BlockAllocator {
    get capacity() {
        return this._capacity
    }
    get usedSize() {
        return this._usedSize
    }
    get freeSize() {
        return this._freeSize
    }
    get fragmentation() {
        return this._freeSize > 0 ? 1 - 1 / this._freeRegionCount : 0
    }
    _bucketFor(size) {
        return 31 - Math.clz32(size)
    }
    _addToBucket(block) {
        const b = this._bucketFor(block._size)
        block._bucket = b
        while (b >= this._freeBucketHeads.length) {
            this._freeBucketHeads.push(null)
        }
        block._prevFree = null
        block._nextFree = this._freeBucketHeads[b]
        if (this._freeBucketHeads[b]) this._freeBucketHeads[b]._prevFree = block
        this._freeBucketHeads[b] = block
        this._freeRegionCount++
    }
    _removeFromBucket(block) {
        const b = block._bucket
        if (block._prevFree) block._prevFree._nextFree = block._nextFree
        else this._freeBucketHeads[b] = block._nextFree
        if (block._nextFree) block._nextFree._prevFree = block._prevFree
        block._prevFree = null
        block._nextFree = null
        block._bucket = -1
        this._freeRegionCount--
    }
    _rebucket(block) {
        const newBucket = this._bucketFor(block._size)
        if (newBucket !== block._bucket) {
            this._removeFromBucket(block)
            this._addToBucket(block)
        }
    }
    _obtain(offset, size, free) {
        let block
        if (this._pool.length > 0) {
            block = this._pool.pop()
        } else {
            block = new MemBlock()
        }
        block._offset = offset
        block._size = size
        block._free = free
        block._prev = null
        block._next = null
        block._prevFree = null
        block._nextFree = null
        block._bucket = -1
        return block
    }
    _release(block) {
        block._prev = null
        block._next = null
        block._prevFree = null
        block._nextFree = null
        block._bucket = -1
        this._pool.push(block)
    }
    _insertAfterInMainList(block, after) {
        if (after === null) {
            block._prev = null
            block._next = this._headAll
            if (this._headAll) this._headAll._prev = block
            this._headAll = block
            if (!this._tailAll) this._tailAll = block
        } else {
            block._prev = after
            block._next = after._next
            if (after._next) after._next._prev = block
            after._next = block
            if (this._tailAll === after) this._tailAll = block
        }
    }
    _removeFromMainList(block) {
        if (block._prev) block._prev._next = block._next
        else this._headAll = block._next
        if (block._next) block._next._prev = block._prev
        else this._tailAll = block._prev
        block._prev = null
        block._next = null
    }
    _findFreeBlock(size) {
        const startBucket = this._bucketFor(size)
        const len = this._freeBucketHeads.length
        if (startBucket < len) {
            let best = null
            let node = this._freeBucketHeads[startBucket]
            while (node) {
                if (node._size >= size) {
                    if (!best || node._size < best._size) {
                        best = node
                        if (node._size === size) break
                    }
                }
                node = node._nextFree
            }
            if (best) return best
        }
        for (let b = startBucket + 1; b < len; b++) {
            if (this._freeBucketHeads[b]) {
                return this._freeBucketHeads[b]
            }
        }
        return null
    }
    allocate(size) {
        const gap = this._findFreeBlock(size)
        if (!gap) return null
        this._usedSize += size
        this._freeSize -= size
        if (gap._size === size) {
            gap._free = false
            this._removeFromBucket(gap)
            return gap
        }
        const alloc = this._obtain(gap._offset, size, false)
        gap._offset += size
        gap._size -= size
        this._rebucket(gap)
        this._insertAfterInMainList(alloc, gap._prev)
        return alloc
    }
    free(block) {
        block._free = true
        this._usedSize -= block._size
        this._freeSize += block._size
        const prev = block._prev
        const next = block._next
        const prevFree = prev && prev._free
        const nextFree = next && next._free
        if (prevFree && nextFree) {
            prev._size += block._size + next._size
            this._removeFromMainList(block)
            this._removeFromMainList(next)
            this._removeFromBucket(next)
            this._release(block)
            this._release(next)
            this._rebucket(prev)
        } else if (prevFree) {
            prev._size += block._size
            this._removeFromMainList(block)
            this._release(block)
            this._rebucket(prev)
        } else if (nextFree) {
            block._size += next._size
            this._removeFromMainList(next)
            this._removeFromBucket(next)
            this._release(next)
            this._addToBucket(block)
        } else {
            this._addToBucket(block)
        }
    }
    grow(newCapacity) {
        if (newCapacity <= this._capacity) return
        const added = newCapacity - this._capacity
        this._capacity = newCapacity
        this._freeSize += added
        if (this._tailAll && this._tailAll._free) {
            this._tailAll._size += added
            this._rebucket(this._tailAll)
        } else {
            const block = this._obtain(this._capacity - added, added, true)
            this._insertAfterInMainList(block, this._tailAll)
            this._addToBucket(block)
        }
    }
    defrag(maxMoves = 0, result = new Set()) {
        result.clear()
        if (this._freeRegionCount === 0) return result
        if (maxMoves === 0) {
            this._defragFull(result)
        } else {
            this._defragIncremental(maxMoves, result)
        }
        return result
    }
    _defragFull(result) {
        for (let b = 0; b < this._freeBucketHeads.length; b++) {
            let node = this._freeBucketHeads[b]
            while (node) {
                const nextFree = node._nextFree
                this._removeFromMainList(node)
                node._prevFree = null
                node._nextFree = null
                node._bucket = -1
                this._pool.push(node)
                node = nextFree
            }
            this._freeBucketHeads[b] = null
        }
        this._freeRegionCount = 0
        let offset = 0
        let block = this._headAll
        while (block) {
            if (block._offset !== offset) {
                block._offset = offset
                result.add(block)
            }
            offset += block._size
            block = block._next
        }
        const remaining = this._capacity - offset
        if (remaining > 0) {
            const freeBlock = this._obtain(offset, remaining, true)
            this._insertAfterInMainList(freeBlock, this._tailAll)
            this._addToBucket(freeBlock)
        }
    }
    _defragIncremental(maxMoves, result) {
        const phase1Moves = Math.ceil(maxMoves / 2)
        const phase2Moves = maxMoves - phase1Moves
        for (let i = 0; i < phase1Moves; i++) {
            let lastAlloc = this._tailAll
            while (lastAlloc && lastAlloc._free) lastAlloc = lastAlloc._prev
            if (!lastAlloc) break
            const gap = this._findFreeBlock(lastAlloc._size)
            if (!gap || gap._offset >= lastAlloc._offset) break
            this._moveBlock(lastAlloc, gap)
            result.add(lastAlloc)
        }
        let block = this._headAll
        for (let i = 0; i < phase2Moves && block; ) {
            const next = block._next
            if (block._free && next && !next._free) {
                const allocBlock = next
                const freeBlock = block
                allocBlock._offset = freeBlock._offset
                freeBlock._offset = allocBlock._offset + allocBlock._size
                const a = freeBlock._prev
                const b = allocBlock._next
                allocBlock._prev = a
                allocBlock._next = freeBlock
                freeBlock._prev = allocBlock
                freeBlock._next = b
                if (a) a._next = allocBlock
                else this._headAll = allocBlock
                if (b) b._prev = freeBlock
                else this._tailAll = freeBlock
                if (freeBlock._next && freeBlock._next._free) {
                    const right = freeBlock._next
                    freeBlock._size += right._size
                    this._removeFromMainList(right)
                    this._removeFromBucket(right)
                    this._release(right)
                    this._rebucket(freeBlock)
                }
                result.add(allocBlock)
                i++
                block = freeBlock._next
            } else {
                block = next
            }
        }
    }
    _moveBlock(block, gap) {
        const blockSize = block._size
        const newOffset = gap._offset
        const prev = block._prev
        this._removeFromMainList(block)
        const freed = this._obtain(block._offset, blockSize, true)
        this._insertAfterInMainList(freed, prev)
        this._addToBucket(freed)
        if (freed._next && freed._next._free) {
            const right = freed._next
            freed._size += right._size
            this._removeFromMainList(right)
            this._removeFromBucket(right)
            this._release(right)
            this._rebucket(freed)
        }
        if (freed._prev && freed._prev._free) {
            const left = freed._prev
            left._size += freed._size
            this._removeFromMainList(freed)
            this._removeFromBucket(freed)
            this._release(freed)
            this._rebucket(left)
        }
        block._offset = newOffset
        if (gap._size === blockSize) {
            const gapPrev = gap._prev
            this._removeFromMainList(gap)
            this._removeFromBucket(gap)
            this._release(gap)
            this._insertAfterInMainList(block, gapPrev)
        } else {
            gap._offset += blockSize
            gap._size -= blockSize
            this._rebucket(gap)
            this._insertAfterInMainList(block, gap._prev)
        }
    }
    updateAllocation(toFree, toAllocate) {
        for (let i = 0; i < toFree.length; i++) {
            this.free(toFree[i])
        }
        for (let i = 0; i < toAllocate.length; i++) {
            const size = toAllocate[i]
            const block = this.allocate(size)
            if (block) {
                toAllocate[i] = block
            } else {
                let totalRemaining = size
                for (let j = i + 1; j < toAllocate.length; j++) {
                    totalRemaining += toAllocate[j]
                }
                const neededCapacity = this._usedSize + totalRemaining
                const headroomCapacity = Math.ceil(neededCapacity * this._growMultiplier)
                if (headroomCapacity > this._capacity) {
                    this.grow(headroomCapacity)
                }
                this.defrag(0)
                for (let j = i; j < toAllocate.length; j++) {
                    const s = toAllocate[j]
                    const b = this.allocate(s)
                    toAllocate[j] = b
                }
                return true
            }
        }
        return false
    }
    constructor(capacity = 0, growMultiplier = 1.1) {
        this._headAll = null
        this._tailAll = null
        this._freeBucketHeads = []
        this._pool = []
        this._capacity = 0
        this._usedSize = 0
        this._freeSize = 0
        this._freeRegionCount = 0
        this._growMultiplier = growMultiplier
        if (capacity > 0) {
            this._capacity = capacity
            this._freeSize = capacity
            const block = this._obtain(0, capacity, true)
            this._headAll = block
            this._tailAll = block
            this._addToBucket(block)
        }
    }
}

const cameraPosition = new Vec3()
const cameraDirection = new Vec3()
const translation = new Vec3()
const _tempVec3 = new Vec3()
const invModelMat = new Mat4()
const tempNonOctreePlacements = new Set()
const tempOctreePlacements = new Set()
const _updatedSplats = []
const _splatsNeedingColorUpdate = []
const _cameraDeltas = {
    rotationDelta: 0,
    translationDelta: 0,
}
const tempOctreesTicked = new Set()
const _queuedSplats = new Set()
const _lodColorsRaw = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [1, 0, 1],
    [0, 1, 1],
    [1, 0.5, 0],
    [0.5, 0, 1],
]
;[
    new Color(1, 0, 0),
    new Color(0, 1, 0),
    new Color(0, 0, 1),
    new Color(1, 1, 0),
    new Color(1, 0, 1),
    new Color(0, 1, 1),
    new Color(1, 0.5, 0),
    new Color(0.5, 0, 1),
]
let _randomColorRaw = null
class GSplatManager {
    destroy() {
        this._destroyed = true
        for (const [, worldState] of this.worldStates) {
            for (const splat of worldState.splats) {
                splat.resource.decRefCount()
            }
            worldState.destroy()
        }
        this.worldStates.clear()
        for (const [, instance] of this.octreeInstances) {
            instance.destroy()
        }
        this.octreeInstances.clear()
        for (const instance of this.octreeInstancesToDestroy) {
            instance.destroy()
        }
        this.octreeInstancesToDestroy.length = 0
        this.workBuffer.destroy()
        this.renderer.destroy()
        this.destroyGpuSorting()
        this.destroyCpuSorting()
    }
    destroyGpuSorting() {
        this.keyGenerator?.destroy()
        this.keyGenerator = null
        this.gpuSorter?.destroy()
        this.gpuSorter = null
        const disableIndirectDraw = false
        this.renderer.disableIndirectDraw()
        this.destroyIntervalCompaction(disableIndirectDraw)
        this.destroyCompaction(disableIndirectDraw)
    }
    destroyIntervalCompaction(disableIndirectDraw = true) {
        if (this.intervalCompaction) {
            if (disableIndirectDraw) {
                this.renderer.disableIndirectDraw()
            }
            this.intervalCompaction.destroy()
            this.intervalCompaction = null
        }
    }
    destroyCompaction(disableIndirectDraw = true) {
        if (this.compaction) {
            if (disableIndirectDraw) {
                this.renderer.disableIndirectDraw()
            }
            this.compaction.destroy()
            this.compaction = null
        }
        this.cpuCompactionNeeded = false
    }
    destroyCpuSorting() {
        this.cpuSorter?.destroy()
        this.cpuSorter = null
    }
    initGpuSorting() {
        if (!this.keyGenerator) {
            this.keyGenerator = new GSplatSortKeyCompute(this.device)
        }
        if (!this.gpuSorter) {
            this.gpuSorter = new ComputeRadixSort(this.device)
        }
    }
    initCpuSorting() {
        if (!this.cpuSorter) {
            this.cpuSorter = this.createSorter()
        }
        const currentState = this.worldStates.get(this.sortedVersion)
        if (currentState) {
            currentState.sortParametersSet = false
            currentState.sortedBefore = false
            this.cpuSorter.updateCentersForSplats(currentState.splats)
        }
        this.renderer.disableIndirectDraw()
        this.renderer.meshInstance.visible = false
    }
    get material() {
        return this.renderer.material
    }
    createSorter() {
        const sorter = new GSplatUnifiedSorter(this.scene)
        sorter.on('sorted', (count, version, orderData) => {
            this.onSorted(count, version, orderData)
        })
        return sorter
    }
    setRenderMode(renderMode) {
        this.renderMode = renderMode
        this.renderer.setRenderMode(renderMode)
    }
    get canCull() {
        return this.scene.gsplat.culling && this.workBuffer.totalBoundsEntries > 0
    }
    get canCpuCompact() {
        return !this.useGpuSorting && this.device.isWebGPU && this.canCull
    }
    prepareSortMode() {
        const gpuSorting = this.device.isWebGPU && this.scene.gsplat.gpuSorting
        if (gpuSorting !== this.useGpuSorting) {
            if (gpuSorting) {
                this.destroyCpuSorting()
                this.initGpuSorting()
            } else {
                this.destroyGpuSorting()
                this.initCpuSorting()
            }
            this.useGpuSorting = gpuSorting
            this.sortNeeded = true
        }
    }
    reconcile(placements) {
        tempNonOctreePlacements.clear()
        for (const p of placements) {
            if (p.resource instanceof GSplatOctreeResource) {
                if (!this.octreeInstances.has(p)) {
                    this.octreeInstances.set(p, new GSplatOctreeInstance(this.device, p.resource.octree, p))
                    this.hasNewOctreeInstances = true
                }
                tempOctreePlacements.add(p)
            } else {
                tempNonOctreePlacements.add(p)
            }
        }
        for (const [placement, inst] of this.octreeInstances) {
            if (!tempOctreePlacements.has(placement)) {
                this.octreeInstances.delete(placement)
                this.layerPlacementsDirty = true
                this._placementSetChanged = true
                this.octreeInstancesToDestroy.push(inst)
            }
        }
        this.layerPlacementsDirty = this.layerPlacements.length !== tempNonOctreePlacements.size
        if (!this.layerPlacementsDirty) {
            for (let i = 0; i < this.layerPlacements.length; i++) {
                const existing = this.layerPlacements[i]
                if (!tempNonOctreePlacements.has(existing)) {
                    this.layerPlacementsDirty = true
                    break
                }
            }
        }
        this._placementSetChanged || (this._placementSetChanged = this.layerPlacementsDirty)
        this.layerPlacements.length = 0
        for (const p of tempNonOctreePlacements) {
            this.layerPlacements.push(p)
        }
        tempNonOctreePlacements.clear()
        tempOctreePlacements.clear()
    }
    updateWorldState() {
        let stateChanged = this._stateTracker.hasChanges(this.layerPlacements)
        for (const [, inst] of this.octreeInstances) {
            if (this._stateTracker.hasChanges(inst.activePlacements)) {
                stateChanged = true
            }
        }
        const placementsChanged = this.layerPlacementsDirty
        const worldChanged = placementsChanged || stateChanged || this.worldStates.size === 0
        if (worldChanged) {
            this.lastWorldStateVersion++
            const splats = []
            const { colorUpdateAngle, colorUpdateDistance } = this.scene.gsplat
            for (const p of this.layerPlacements) {
                p.ensureInstanceStreams(this.device)
                const splatInfo = new GSplatInfo(this.device, p.resource, p, p.consumeRenderDirty.bind(p))
                splatInfo.resetColorAccumulators(colorUpdateAngle, colorUpdateDistance)
                splats.push(splatInfo)
            }
            for (const [, inst] of this.octreeInstances) {
                inst.activePlacements.forEach((p) => {
                    if (p.resource) {
                        p.ensureInstanceStreams(this.device)
                        const octreeNodes = p.intervals.size > 0 ? inst.octree.nodes : null
                        const nodeInfos = octreeNodes ? inst.nodeInfos : null
                        const splatInfo = new GSplatInfo(
                            this.device,
                            p.resource,
                            p,
                            p.consumeRenderDirty.bind(p),
                            octreeNodes,
                            nodeInfos,
                        )
                        splatInfo.resetColorAccumulators(colorUpdateAngle, colorUpdateDistance)
                        splats.push(splatInfo)
                    }
                })
            }
            if (this.cpuSorter) {
                for (const splat of splats) {
                    const resource = splat.resource
                    const lastVersion = this._centersVersions.get(resource.id)
                    if (lastVersion !== resource.centersVersion) {
                        this._centersVersions.set(resource.id, resource.centersVersion)
                        this.cpuSorter.setCenters(resource.id, null)
                        this.cpuSorter.setCenters(resource.id, resource.centers)
                    }
                }
            }
            this.cpuSorter?.updateCentersForSplats(splats)
            const newState = new GSplatWorldState(
                this.device,
                this.lastWorldStateVersion,
                splats,
                this._allocator,
                this._allocationMap,
            )
            for (const splat of newState.splats) {
                splat.resource.incRefCount()
            }
            for (const [, inst] of this.octreeInstances) {
                if (inst.removedCandidates && inst.removedCandidates.size) {
                    for (const fileIndex of inst.removedCandidates) {
                        newState.pendingReleases.push([inst.octree, fileIndex])
                    }
                    inst.removedCandidates.clear()
                }
            }
            if (this.octreeInstancesToDestroy.length) {
                for (const inst of this.octreeInstancesToDestroy) {
                    const toRelease = inst.getFileDecrements()
                    for (const fileIndex of toRelease) {
                        newState.pendingReleases.push([inst.octree, fileIndex])
                    }
                    inst.destroy()
                }
                this.octreeInstancesToDestroy.length = 0
            }
            if (this._placementSetChanged && this.scene.gsplat.culling) {
                newState.fullRebuild = true
            }
            this.worldStates.set(this.lastWorldStateVersion, newState)
            this.layerPlacementsDirty = false
            this._placementSetChanged = false
            this.sortNeeded = true
        }
    }
    onSorted(count, version, orderData) {
        this.cleanupOldWorldStates(version)
        this.sortedVersion = version
        const worldState = this.worldStates.get(version)
        if (worldState) {
            if (!worldState.sortedBefore) {
                worldState.sortedBefore = true
                this.rebuildWorkBuffer(worldState, count)
            }
            this.workBuffer.setOrderData(orderData)
            this.renderer.setOrderData()
            if (this.canCpuCompact) {
                this.cpuCompactionNeeded = true
            }
        }
    }
    rebuildWorkBuffer(worldState, count, forceFullRebuild = false) {
        const textureSize = worldState.textureSize
        if (textureSize !== this.workBuffer.textureSize) {
            this.workBuffer.resize(textureSize)
            this.renderer.setMaxNumSplats(textureSize * textureSize)
        }
        if (this.scene.gsplat.culling) {
            this.workBuffer.updateBoundsTexture(worldState.boundsGroups)
            this.workBuffer.updateTransformsTexture(worldState.boundsGroups)
        }
        const renderAll = forceFullRebuild || worldState.fullRebuild
        const splatsToRender = renderAll ? worldState.splats : worldState.needsUpload
        const changedAllocIds = renderAll ? null : worldState.needsUploadIds
        if (splatsToRender.length > 0) {
            const totalBlocks = this._allocationMap.size
            const uploadBlocks = renderAll ? totalBlocks : worldState.needsUploadIds.size
            this.bufferCopyUploaded += uploadBlocks
            this.bufferCopyTotal = totalBlocks
            this.workBuffer.render(splatsToRender, this.cameraNode, this.getDebugColors(), changedAllocIds)
        }
        const { colorUpdateAngle, colorUpdateDistance } = this.scene.gsplat
        for (let i = 0; i < worldState.splats.length; i++) {
            worldState.splats[i].update()
            worldState.splats[i].resetColorAccumulators(colorUpdateAngle, colorUpdateDistance)
        }
        this.updateColorCameraTracking()
        if (worldState.pendingReleases && worldState.pendingReleases.length) {
            const cooldownTicks = this.scene.gsplat.cooldownTicks
            for (const [octree, fileIndex] of worldState.pendingReleases) {
                octree.decRefCount(fileIndex, cooldownTicks)
            }
            worldState.pendingReleases.length = 0
        }
        this.renderer.update(count, textureSize)
    }
    cleanupOldWorldStates(newVersion) {
        const activeState = this.worldStates.get(newVersion)
        if (!activeState.fullRebuild) {
            for (let v = this.sortedVersion + 1; v < newVersion; v++) {
                if (this.worldStates.get(v)?.fullRebuild) {
                    activeState.fullRebuild = true
                    break
                }
            }
        }
        if (!activeState.fullRebuild) {
            const activeIds = activeState.needsUploadIds
            const lookup = activeState.allocIdToSplat
            for (let v = this.sortedVersion + 1; v < newVersion; v++) {
                const oldState = this.worldStates.get(v)
                if (oldState) {
                    for (const allocId of oldState.needsUploadIds) {
                        if (!activeIds.has(allocId)) {
                            activeIds.add(allocId)
                            const splat = lookup.get(allocId)
                            if (splat && !_queuedSplats.has(splat)) {
                                activeState.needsUpload.push(splat)
                                _queuedSplats.add(splat)
                            }
                        }
                    }
                }
            }
            _queuedSplats.clear()
        }
        for (let v = this.sortedVersion; v < newVersion; v++) {
            const oldState = this.worldStates.get(v)
            if (oldState) {
                for (const splat of oldState.splats) {
                    splat.resource.decRefCount()
                }
                this.worldStates.delete(v)
                oldState.destroy()
            }
        }
    }
    applyWorkBufferUpdates(state) {
        const { colorUpdateAngle, colorUpdateDistance, colorUpdateDistanceLodScale, colorUpdateAngleLodScale } =
            this.scene.gsplat
        const { rotationDelta, translationDelta } = this.calculateColorCameraDeltas()
        let uploadedBlocks = 0
        state.splats.forEach((splat) => {
            if (splat.update()) {
                _updatedSplats.push(splat)
                uploadedBlocks += splat.intervalAllocIds.length
                splat.resetColorAccumulators(colorUpdateAngle, colorUpdateDistance)
                this.sortNeeded = true
            } else if (splat.hasSphericalHarmonics) {
                splat.colorAccumulatedRotation += rotationDelta
                splat.colorAccumulatedTranslation += translationDelta
                const lodIndex = splat.lodIndex ?? 0
                const distThreshold = colorUpdateDistance * Math.pow(colorUpdateDistanceLodScale, lodIndex)
                const angleThreshold = colorUpdateAngle * Math.pow(colorUpdateAngleLodScale, lodIndex)
                if (
                    splat.colorAccumulatedRotation >= angleThreshold ||
                    splat.colorAccumulatedTranslation >= distThreshold
                ) {
                    _splatsNeedingColorUpdate.push(splat)
                    uploadedBlocks += splat.intervalAllocIds.length
                    splat.resetColorAccumulators(angleThreshold, distThreshold)
                }
            }
        })
        this.bufferCopyUploaded += uploadedBlocks
        this.bufferCopyTotal = this._allocationMap.size
        if (_updatedSplats.length > 0) {
            this.workBuffer.render(_updatedSplats, this.cameraNode, this.getDebugColors())
            _updatedSplats.length = 0
        }
        if (_splatsNeedingColorUpdate.length > 0) {
            this.workBuffer.renderColor(_splatsNeedingColorUpdate, this.cameraNode, this.getDebugColors())
            _splatsNeedingColorUpdate.length = 0
        }
    }
    testCameraMovedForLod() {
        const distanceThreshold = this.scene.gsplat.lodUpdateDistance
        const currentCameraPos = this.cameraNode.getPosition()
        const cameraMoved = this.lastLodCameraPos.distance(currentCameraPos) > distanceThreshold
        if (cameraMoved) {
            return true
        }
        let cameraRotated = false
        const lodUpdateAngleDeg = this.scene.gsplat.lodUpdateAngle
        if (lodUpdateAngleDeg > 0) {
            if (Number.isFinite(this.lastLodCameraFwd.x)) {
                const currentCameraFwd = this.cameraNode.forward
                const dot = Math.min(1, Math.max(-1, this.lastLodCameraFwd.dot(currentCameraFwd)))
                const angle = Math.acos(dot)
                const rotThreshold = lodUpdateAngleDeg * math.DEG_TO_RAD
                cameraRotated = angle > rotThreshold
            } else {
                cameraRotated = true
            }
        }
        const currentFov = this.cameraNode.camera.fov
        const fovChanged =
            this.lastLodCameraFov < 0 || Math.abs(currentFov - this.lastLodCameraFov) > this.lastLodCameraFov * 0.02
        return cameraMoved || cameraRotated || fovChanged
    }
    testCameraMovedForSort() {
        const epsilon = 0.001
        if (this.scene.gsplat.radialSorting) {
            const currentCameraPos = this.cameraNode.getPosition()
            return this.lastSortCameraPos.distance(currentCameraPos) > epsilon
        }
        if (Number.isFinite(this.lastSortCameraFwd.x)) {
            const currentCameraFwd = this.cameraNode.forward
            const dot = Math.min(1, Math.max(-1, this.lastSortCameraFwd.dot(currentCameraFwd)))
            return Math.acos(dot) > epsilon
        }
        return true
    }
    testFrustumChanged() {
        const epsilon = 0.001
        if (!this.lastCullingProjMat.equals(this.cameraNode.camera.projectionMatrix)) {
            return true
        }
        const currentCameraFwd = this.cameraNode.forward
        const dot = Math.min(1, Math.max(-1, this.lastCullingCameraFwd.dot(currentCameraFwd)))
        return Math.acos(dot) > epsilon
    }
    updateColorCameraTracking() {
        this.lastColorUpdateCameraPos.copy(this.cameraNode.getPosition())
        this.lastColorUpdateCameraFwd.copy(this.cameraNode.forward)
    }
    getDebugColors() {
        if (this.scene.gsplat.colorizeColorUpdate) {
            _randomColorRaw ?? (_randomColorRaw = [])
            const r = Math.random()
            const g = Math.random()
            const b = Math.random()
            for (let i = 0; i < _lodColorsRaw.length; i++) {
                var _randomColorRaw1, _i
                ;(_randomColorRaw1 = _randomColorRaw)[(_i = i)] ?? (_randomColorRaw1[_i] = [0, 0, 0])
                _randomColorRaw[i][0] = r
                _randomColorRaw[i][1] = g
                _randomColorRaw[i][2] = b
            }
            return _randomColorRaw
        } else if (this.scene.gsplat.colorizeLod) {
            return _lodColorsRaw
        }
        return undefined
    }
    calculateColorCameraDeltas() {
        _cameraDeltas.rotationDelta = 0
        _cameraDeltas.translationDelta = 0
        if (isFinite(this.lastColorUpdateCameraPos.x)) {
            const currentCameraFwd = this.cameraNode.forward
            const dot = Math.min(1, Math.max(-1, this.lastColorUpdateCameraFwd.dot(currentCameraFwd)))
            _cameraDeltas.rotationDelta = Math.acos(dot) * math.RAD_TO_DEG
            const currentCameraPos = this.cameraNode.getPosition()
            _cameraDeltas.translationDelta = this.lastColorUpdateCameraPos.distance(currentCameraPos)
        }
        return _cameraDeltas
    }
    fireFrameReadyEvent() {
        const ready = this.sortedVersion === this.lastWorldStateVersion
        let loadingCount = 0
        for (const [, inst] of this.octreeInstances) {
            loadingCount += inst.pendingLoadCount
        }
        this.director.eventHandler.fire('frame:ready', this.cameraNode.camera, this.renderer.layer, ready, loadingCount)
    }
    computeGlobalMaxDistance() {
        let maxDist = 0
        cameraPosition.copy(this.cameraNode.getPosition())
        for (const [, inst] of this.octreeInstances) {
            const worldTransform = inst.placement.node.getWorldTransform()
            const aabb = inst.placement.aabb
            worldTransform.transformPoint(aabb.center, _tempVec3)
            const scale = worldTransform.getScale().x
            const dist = _tempVec3.distance(cameraPosition) + aabb.halfExtents.length() * scale
            if (dist > maxDist) maxDist = dist
        }
        return Math.max(maxDist, 1)
    }
    _enforceBudget(budget) {
        const textureWidth = this.workBuffer.textureSize
        let fixedSplats = 0
        let paddingEstimate = 0
        for (const p of this.layerPlacements) {
            const resource = p.resource
            if (resource) {
                const numSplats = resource.numSplats ?? 0
                fixedSplats += numSplats
                paddingEstimate += (textureWidth - (numSplats % textureWidth)) % textureWidth
            }
        }
        const octreeBudget = Math.max(1, budget - fixedSplats)
        const globalMaxDistance = this.computeGlobalMaxDistance()
        let totalOptimalSplats = 0
        for (const [, inst] of this.octreeInstances) {
            totalOptimalSplats += inst.evaluateOptimalLods(this.cameraNode, this.scene.gsplat, this._budgetScale)
            for (const placement of inst.activePlacements) {
                const resource = placement.resource
                const numSplats = resource?.numSplats ?? 0
                paddingEstimate += (textureWidth - (numSplats % textureWidth)) % textureWidth
            }
        }
        const adjustedBudget = Math.max(1, octreeBudget - paddingEstimate)
        if (totalOptimalSplats > 0) {
            const ratio = totalOptimalSplats / adjustedBudget
            const budgetScaleDeadZone = 0.4
            const budgetScaleBlendRate = 0.3
            if (ratio > 1 + budgetScaleDeadZone || ratio < 1 - budgetScaleDeadZone) {
                const invCorrection = 1 / Math.sqrt(ratio)
                this._budgetScale *= 1 + (invCorrection - 1) * budgetScaleBlendRate
                this._budgetScale = Math.max(0.01, Math.min(this._budgetScale, 100.0))
            }
        }
        this._budgetBalancer.balance(this.octreeInstances, adjustedBudget, globalMaxDistance)
        for (const [, inst] of this.octreeInstances) {
            const maxLod = inst.octree.lodLevels - 1
            inst.applyLodChanges(maxLod, this.scene.gsplat)
        }
    }
    handleFormatChange() {
        const currentFormat = this.scene.gsplat.format
        if (this.workBuffer.format !== currentFormat) {
            this.workBuffer.destroy()
            this.workBuffer = new GSplatWorkBuffer(this.device, currentFormat)
            this.renderer.workBuffer = this.workBuffer
            this.renderer.configureMaterial()
            this._workBufferFormatVersion = this.workBuffer.format.extraStreamsVersion
            this._workBufferRebuildRequired = true
            this.sortNeeded = true
        }
    }
    update() {
        this.bufferCopyUploaded = 0
        this.bufferCopyTotal = 0
        this.handleFormatChange()
        const wbFormatVersion = this.workBuffer.format.extraStreamsVersion
        if (this._workBufferFormatVersion !== wbFormatVersion) {
            this._workBufferFormatVersion = wbFormatVersion
            this.workBuffer.syncWithFormat()
            this._workBufferRebuildRequired = true
            this.sortNeeded = true
        }
        this.prepareSortMode()
        if (this.cpuSorter) {
            this.cpuSorter.applyPendingSorted()
        }
        const sorterAvailable = this.useGpuSorting || (this.cpuSorter && this.cpuSorter.jobsInFlight < 3)
        let fullUpdate = false
        this.framesTillFullUpdate--
        if (this.framesTillFullUpdate <= 0) {
            this.framesTillFullUpdate = 10
            if (sorterAvailable) {
                fullUpdate = true
            }
        }
        const hasNewInstances = this.hasNewOctreeInstances && sorterAvailable
        if (hasNewInstances) this.hasNewOctreeInstances = false
        let anyInstanceNeedsLodUpdate = false
        let anyOctreeMoved = false
        let cameraMovedOrRotatedForLod = false
        if (fullUpdate) {
            for (const [, inst] of this.octreeInstances) {
                const isDirty = inst.update()
                this.layerPlacementsDirty || (this.layerPlacementsDirty = isDirty)
                this._placementSetChanged || (this._placementSetChanged = inst.consumePlacementSetChanged())
                const instNeeds = inst.consumeNeedsLodUpdate()
                anyInstanceNeedsLodUpdate || (anyInstanceNeedsLodUpdate = instNeeds)
            }
            const threshold = this.scene.gsplat.lodUpdateDistance
            for (const [, inst] of this.octreeInstances) {
                const moved = inst.testMoved(threshold)
                anyOctreeMoved || (anyOctreeMoved = moved)
            }
            cameraMovedOrRotatedForLod = this.testCameraMovedForLod()
        }
        if (this.testCameraMovedForSort()) {
            this.sortNeeded = true
        }
        if ((this.compaction || this.intervalCompaction) && !this.sortNeeded && this.testFrustumChanged()) {
            this.lastCullingCameraFwd.copy(this.cameraNode.forward)
            this.lastCullingProjMat.copy(this.cameraNode.camera.projectionMatrix)
            if (this.useGpuSorting) {
                this.sortNeeded = true
            } else {
                this.cpuCompactionNeeded = true
            }
        }
        if (this.scene.gsplat.dirty) {
            this.layerPlacementsDirty = true
            this.renderer.updateOverdrawMode(this.scene.gsplat)
            this._workBufferRebuildRequired = true
            this.sortNeeded = true
        }
        if (
            cameraMovedOrRotatedForLod ||
            anyOctreeMoved ||
            this.scene.gsplat.dirty ||
            anyInstanceNeedsLodUpdate ||
            hasNewInstances
        ) {
            for (const [, inst] of this.octreeInstances) {
                inst.updateMoved()
            }
            const cameraNode = this.cameraNode
            this.lastLodCameraPos.copy(cameraNode.getPosition())
            this.lastLodCameraFwd.copy(cameraNode.forward)
            this.lastLodCameraFov = cameraNode.camera.fov
            const budget = this.scene.gsplat.splatBudget
            if (budget > 0) {
                this._enforceBudget(budget)
            } else {
                this._budgetScale = 1.0
                for (const [, inst] of this.octreeInstances) {
                    inst.updateLod(this.cameraNode, this.scene.gsplat)
                }
            }
        }
        this.updateWorldState()
        const lastState = this.worldStates.get(this.lastWorldStateVersion)
        if (lastState) {
            if (this.cpuSorter && !lastState.sortParametersSet) {
                lastState.sortParametersSet = true
                const payload = this.prepareSortParameters(lastState)
                this.cpuSorter.setSortParameters(payload)
            }
        }
        const sortedState = this.worldStates.get(this.sortedVersion)
        if (sortedState) {
            if (this._workBufferRebuildRequired) {
                const count = sortedState.totalActiveSplats
                this.rebuildWorkBuffer(sortedState, count, true)
                this._workBufferRebuildRequired = false
                this.renderer.setOrderData()
                if (this.intervalCompaction) {
                    this.intervalCompaction._uploadedVersion = -1
                }
            } else {
                this.applyWorkBufferUpdates(sortedState)
            }
        }
        if (this.compaction && !this.useGpuSorting && !this.canCull) {
            this.destroyCompaction()
            this.renderer.setOrderData()
            if (sortedState) {
                this.renderer.update(sortedState.totalActiveSplats, sortedState.textureSize)
            }
        }
        let gpuSortedThisFrame = false
        if (this.sortNeeded && lastState) {
            if (this.useGpuSorting) {
                this.sortGpu(lastState)
                gpuSortedThisFrame = true
            } else {
                this.sortCpu(lastState)
                if (this.compaction) {
                    this.cpuCompactionNeeded = true
                }
            }
            this.sortNeeded = false
            this.lastSortCameraPos.copy(this.cameraNode.getPosition())
            this.lastSortCameraFwd.copy(this.cameraNode.forward)
            this.lastCullingCameraFwd.copy(this.cameraNode.forward)
            this.lastCullingProjMat.copy(this.cameraNode.camera.projectionMatrix)
        }
        if (this.canCpuCompact && !this.compaction && sortedState && sortedState.sortedBefore) {
            this.cpuCompactionNeeded = true
        }
        if (this.cpuCompactionNeeded) {
            this.cpuCompactionNeeded = false
            this._runCpuCompaction()
        } else if ((this.compaction || this.intervalCompaction) && !gpuSortedThisFrame) {
            this.refreshIndirectDraw()
        }
        if (sortedState) {
            this.renderer.frameUpdate(this.scene.gsplat)
            this.updateColorCameraTracking()
        }
        if (this.octreeInstances.size) {
            const cooldownTicks = this.scene.gsplat.cooldownTicks
            for (const [, inst] of this.octreeInstances) {
                const octree = inst.octree
                if (!tempOctreesTicked.has(octree)) {
                    tempOctreesTicked.add(octree)
                    octree.updateCooldownTick(cooldownTicks)
                }
            }
            tempOctreesTicked.clear()
        }
        this.fireFrameReadyEvent()
        if (this.scene.gsplat.dirty) {
            for (const [, inst] of this.octreeInstances) {
                inst.needsLodUpdate = true
            }
        }
        return sortedState ? sortedState.totalActiveSplats : 0
    }
    sortGpu(worldState) {
        const keyGenerator = this.keyGenerator
        const gpuSorter = this.gpuSorter
        if (!keyGenerator || !gpuSorter) return
        const elementCount = worldState.totalActiveSplats
        if (elementCount === 0) return
        if (!this.intervalCompaction) {
            this.intervalCompaction = new GSplatIntervalCompaction(this.device)
        }
        if (!worldState.sortedBefore) {
            worldState.sortedBefore = true
            this.cleanupOldWorldStates(worldState.version)
            this.sortedVersion = worldState.version
            this.rebuildWorkBuffer(worldState, elementCount)
        }
        this.intervalCompaction.uploadIntervals(worldState)
        const cullingEnabled = this.canCull
        if (cullingEnabled) {
            const state = this.worldStates.get(this.sortedVersion)
            if (state) {
                this._runFrustumCulling(state)
            }
        }
        const numIntervals = worldState.totalIntervals
        const totalActiveSplats = worldState.totalActiveSplats
        const nodeVisibilityTexture = cullingEnabled ? this.workBuffer.nodeVisibilityTexture : null
        this.intervalCompaction.dispatchCompact(nodeVisibilityTexture, numIntervals, totalActiveSplats, cullingEnabled)
        this.allocateAndWriteIntervalIndirectArgs(numIntervals)
        const compactedSplatIds = this.intervalCompaction.compactedSplatIds
        const numBits = Math.max(10, Math.min(20, Math.round(Math.log2(elementCount / 4))))
        const roundedNumBits = Math.ceil(numBits / 4) * 4
        const { minDist, maxDist } = this.computeDistanceRange(worldState)
        const sortedIndices = this.dispatchGpuSort(elementCount, roundedNumBits, minDist, maxDist, compactedSplatIds)
        this.applyGpuSortResults(worldState, sortedIndices)
    }
    allocateAndWriteIntervalIndirectArgs(numIntervals) {
        this.indirectDrawSlot = this.device.getIndirectDrawSlot(1)
        this.indirectDispatchSlot = this.device.getIndirectDispatchSlot(1)
        const ic = this.intervalCompaction
        ic.writeIndirectArgs(this.indirectDrawSlot, this.indirectDispatchSlot, numIntervals)
        this.lastCompactedNumIntervals = numIntervals
    }
    dispatchGpuSort(elementCount, roundedNumBits, minDist, maxDist, compactedSplatIds) {
        const keyGenerator = this.keyGenerator
        const gpuSorter = this.gpuSorter
        const ic = this.intervalCompaction
        const keysBuffer = keyGenerator.generateIndirect(
            this.workBuffer,
            this.cameraNode,
            this.scene.gsplat.radialSorting,
            elementCount,
            roundedNumBits,
            minDist,
            maxDist,
            compactedSplatIds,
            ic.sortElementCountBuffer,
            this.indirectDispatchSlot,
        )
        return gpuSorter.sortIndirect(
            keysBuffer,
            elementCount,
            roundedNumBits,
            this.indirectDispatchSlot,
            ic.sortElementCountBuffer,
            compactedSplatIds,
        )
    }
    applyGpuSortResults(worldState, sortedIndices) {
        const ic = this.intervalCompaction
        this.renderer.setIndirectDraw(this.indirectDrawSlot, sortedIndices, ic.numSplatsBuffer)
        this.renderer.updateIndirect(worldState.textureSize)
    }
    _runFrustumCulling(worldState) {
        this.workBuffer.updateTransformsTexture(worldState.boundsGroups)
        const cam = this.cameraNode.camera
        this.workBuffer.updateNodeVisibility(cam.projectionMatrix, cam.viewMatrix)
    }
    allocateAndWriteIndirectArgs(totalSplats) {
        this.indirectDrawSlot = this.device.getIndirectDrawSlot(1)
        this.indirectDispatchSlot = this.device.getIndirectDispatchSlot(1)
        const compaction = this.compaction
        compaction.writeIndirectArgs(this.indirectDrawSlot, this.indirectDispatchSlot, totalSplats)
        this.lastCompactedTotalSplats = totalSplats
    }
    refreshIndirectDraw() {
        const sortedState = this.worldStates.get(this.sortedVersion)
        if (!sortedState) return
        if (this.intervalCompaction) {
            this.allocateAndWriteIntervalIndirectArgs(this.lastCompactedNumIntervals)
            const gpuSorter = this.gpuSorter
            const ic = this.intervalCompaction
            this.renderer.setIndirectDraw(this.indirectDrawSlot, gpuSorter.sortedIndices, ic.numSplatsBuffer)
        } else {
            this.allocateAndWriteIndirectArgs(this.lastCompactedTotalSplats)
            const compaction = this.compaction
            this.renderer.setIndirectDraw(
                this.indirectDrawSlot,
                compaction.compactedSplatIds,
                compaction.numSplatsBuffer,
            )
        }
        this.renderer.updateIndirect(sortedState.textureSize)
    }
    _runCpuCompaction() {
        const sortedState = this.worldStates.get(this.sortedVersion)
        if (!sortedState) return
        const elementCount = sortedState.totalActiveSplats
        if (elementCount === 0) return
        this._runFrustumCulling(sortedState)
        const pcNodeIndexTexture = this.workBuffer.getTexture('pcNodeIndex')
        const nodeVisibilityTexture = this.workBuffer.nodeVisibilityTexture
        const orderBuffer = this.workBuffer.orderBuffer
        if (!pcNodeIndexTexture || !nodeVisibilityTexture || !orderBuffer) return
        if (!this.compaction) {
            this.compaction = new GSplatCompaction(this.device)
        }
        this.compaction.dispatchCompact(
            pcNodeIndexTexture,
            nodeVisibilityTexture,
            elementCount,
            this.workBuffer.textureSize,
            orderBuffer,
        )
        this.allocateAndWriteIndirectArgs(elementCount)
        this.renderer.setIndirectDraw(
            this.indirectDrawSlot,
            this.compaction.compactedSplatIds,
            this.compaction.numSplatsBuffer,
        )
        this.renderer.updateIndirect(sortedState.textureSize)
    }
    computeDistanceRange(worldState) {
        const cameraNode = this.cameraNode
        const cameraMat = cameraNode.getWorldTransform()
        cameraMat.getTranslation(cameraPosition)
        cameraMat.getZ(cameraDirection).normalize()
        const radialSort = this.scene.gsplat.radialSorting
        let minDist = radialSort ? 0 : Infinity
        let maxDist = radialSort ? 0 : -Infinity
        for (const splat of worldState.splats) {
            const modelMat = splat.node.getWorldTransform()
            const aabbMin = splat.aabb.getMin()
            const aabbMax = splat.aabb.getMax()
            for (let i = 0; i < 8; i++) {
                _tempVec3.x = i & 1 ? aabbMax.x : aabbMin.x
                _tempVec3.y = i & 2 ? aabbMax.y : aabbMin.y
                _tempVec3.z = i & 4 ? aabbMax.z : aabbMin.z
                modelMat.transformPoint(_tempVec3, _tempVec3)
                if (radialSort) {
                    const dist = _tempVec3.distance(cameraPosition)
                    if (dist > maxDist) maxDist = dist
                } else {
                    const dist = _tempVec3.sub(cameraPosition).dot(cameraDirection)
                    if (dist < minDist) minDist = dist
                    if (dist > maxDist) maxDist = dist
                }
            }
        }
        if (maxDist === 0 || maxDist === -Infinity) {
            return {
                minDist: 0,
                maxDist: 1,
            }
        }
        return {
            minDist,
            maxDist,
        }
    }
    sortCpu(lastState) {
        if (!this.cpuSorter) return
        const cameraNode = this.cameraNode
        const cameraMat = cameraNode.getWorldTransform()
        cameraMat.getTranslation(cameraPosition)
        cameraMat.getZ(cameraDirection).normalize()
        const sorterRequest = []
        lastState.splats.forEach((splat) => {
            const modelMat = splat.node.getWorldTransform()
            invModelMat.copy(modelMat).invert()
            const uniformScale = modelMat.getScale().x
            const transformedDirection = invModelMat.transformVector(cameraDirection).normalize()
            const transformedPosition = invModelMat.transformPoint(cameraPosition)
            modelMat.getTranslation(translation)
            const offset = translation.sub(cameraPosition).dot(cameraDirection)
            const aabbMin = splat.aabb.getMin()
            const aabbMax = splat.aabb.getMax()
            sorterRequest.push({
                transformedDirection,
                transformedPosition,
                offset,
                scale: uniformScale,
                modelMat: modelMat.data.slice(),
                aabbMin: [aabbMin.x, aabbMin.y, aabbMin.z],
                aabbMax: [aabbMax.x, aabbMax.y, aabbMax.z],
            })
        })
        this.cpuSorter.setSortParams(sorterRequest, this.scene.gsplat.radialSorting)
    }
    prepareSortParameters(worldState) {
        return {
            command: 'intervals',
            textureSize: worldState.textureSize,
            totalActiveSplats: worldState.totalActiveSplats,
            version: worldState.version,
            ids: worldState.splats.map((splat) => splat.resource.id),
            pixelOffsets: worldState.splats.map((splat) => splat.intervalOffsets),
            intervals: worldState.splats.map((splat) => splat.intervals),
        }
    }
    constructor(device, director, layer, cameraNode) {
        this.node = new GraphNode('GSplatManager')
        this.worldStates = new Map()
        this.lastWorldStateVersion = 0
        this.cpuSorter = null
        this.keyGenerator = null
        this.gpuSorter = null
        this.compaction = null
        this.intervalCompaction = null
        this.indirectDrawSlot = -1
        this.indirectDispatchSlot = -1
        this.lastCompactedTotalSplats = 0
        this.lastCompactedNumIntervals = 0
        this.cpuCompactionNeeded = false
        this.sortedVersion = 0
        this._workBufferFormatVersion = -1
        this._workBufferRebuildRequired = false
        this.bufferCopyUploaded = 0
        this.bufferCopyTotal = 0
        this._stateTracker = new GSplatPlacementStateTracker()
        this._centersVersions = new Map()
        this.framesTillFullUpdate = 0
        this.lastLodCameraPos = new Vec3(Infinity, Infinity, Infinity)
        this.lastLodCameraFwd = new Vec3(Infinity, Infinity, Infinity)
        this.lastLodCameraFov = -1
        this.lastSortCameraPos = new Vec3(Infinity, Infinity, Infinity)
        this.lastSortCameraFwd = new Vec3(Infinity, Infinity, Infinity)
        this.lastCullingCameraFwd = new Vec3(Infinity, Infinity, Infinity)
        this.lastCullingProjMat = new Mat4()
        this.sortNeeded = true
        this._budgetBalancer = new GSplatBudgetBalancer()
        this._budgetScale = 1.0
        this._allocationMap = new Map()
        this.lastColorUpdateCameraPos = new Vec3(Infinity, Infinity, Infinity)
        this.lastColorUpdateCameraFwd = new Vec3(Infinity, Infinity, Infinity)
        this.layerPlacements = []
        this.layerPlacementsDirty = false
        this._placementSetChanged = false
        this.octreeInstances = new Map()
        this.octreeInstancesToDestroy = []
        this.hasNewOctreeInstances = false
        this.device = device
        this.scene = director.scene
        this.director = director
        this.cameraNode = cameraNode
        const allocatorGrowMultiplier = 1.15
        const budget = this.scene.gsplat.splatBudget
        this._allocator = new BlockAllocator(
            budget > 0 ? Math.ceil(budget * allocatorGrowMultiplier) : 0,
            allocatorGrowMultiplier,
        )
        this.workBuffer = new GSplatWorkBuffer(device, this.scene.gsplat.format)
        this.renderer = new GSplatRenderer(device, this.node, this.cameraNode, layer, this.workBuffer)
        this._workBufferFormatVersion = this.workBuffer.format.extraStreamsVersion
        this.prepareSortMode()
    }
}

class SetUtils {
    static equals(setA, setB) {
        if (setA.size !== setB.size) {
            return false
        }
        for (const elem of setA) {
            if (!setB.has(elem)) {
                return false
            }
        }
        return true
    }
}

const tempLayersToRemove = []
class GSplatLayerData {
    createManager(device, director, layer, cameraNode, camera, renderMode) {
        const manager = new GSplatManager(device, director, layer, cameraNode)
        manager.setRenderMode(renderMode)
        if (director.eventHandler) {
            director.eventHandler.fire('material:created', manager.material, camera, layer)
        }
        return manager
    }
    updateConfiguration(device, director, layer, camera) {
        const cameraNode = camera.node
        const hasNormalPlacements = layer.gsplatPlacements.length > 0
        const hasShadowCasters = layer.gsplatShadowCasters.length > 0
        const setsEqual = SetUtils.equals(layer.gsplatPlacementsSet, layer.gsplatShadowCastersSet)
        const useSharedManager = setsEqual && hasNormalPlacements
        const desiredMainMode = useSharedManager
            ? GSPLAT_FORWARD | GSPLAT_SHADOW
            : hasNormalPlacements
              ? GSPLAT_FORWARD
              : 0
        const desiredShadowMode = useSharedManager ? 0 : hasShadowCasters ? GSPLAT_SHADOW : 0
        if (desiredMainMode) {
            if (this.gsplatManager) {
                this.gsplatManager.setRenderMode(desiredMainMode)
            } else {
                this.gsplatManager = this.createManager(device, director, layer, cameraNode, camera, desiredMainMode)
            }
        } else if (this.gsplatManager) {
            this.gsplatManager.destroy()
            this.gsplatManager = null
        }
        if (desiredShadowMode) {
            if (this.gsplatManagerShadow) {
                this.gsplatManagerShadow.setRenderMode(desiredShadowMode)
            } else {
                this.gsplatManagerShadow = this.createManager(
                    device,
                    director,
                    layer,
                    cameraNode,
                    camera,
                    desiredShadowMode,
                )
            }
        } else if (this.gsplatManagerShadow) {
            this.gsplatManagerShadow.destroy()
            this.gsplatManagerShadow = null
        }
    }
    destroy() {
        this.gsplatManager?.destroy()
        this.gsplatManager = null
        this.gsplatManagerShadow?.destroy()
        this.gsplatManagerShadow = null
    }
    constructor(device, director, layer, camera) {
        this.gsplatManager = null
        this.gsplatManagerShadow = null
        this.updateConfiguration(device, director, layer, camera)
    }
}
class GSplatCameraData {
    destroy() {
        this.layersMap.forEach((layerData) => layerData.destroy())
        this.layersMap.clear()
    }
    removeLayerData(layer) {
        const layerData = this.layersMap.get(layer)
        if (layerData) {
            layerData.destroy()
            this.layersMap.delete(layer)
        }
    }
    getLayerData(device, director, layer, camera) {
        let layerData = this.layersMap.get(layer)
        if (!layerData) {
            layerData = new GSplatLayerData(device, director, layer, camera)
            this.layersMap.set(layer, layerData)
        }
        return layerData
    }
    constructor() {
        this.layersMap = new Map()
    }
}
class GSplatDirector {
    destroy() {
        this.camerasMap.forEach((cameraData) => cameraData.destroy())
        this.camerasMap.clear()
    }
    getCameraData(camera) {
        let cameraData = this.camerasMap.get(camera)
        if (!cameraData) {
            cameraData = new GSplatCameraData()
            this.camerasMap.set(camera, cameraData)
        }
        return cameraData
    }
    update(comp) {
        GSplatResourceCleanup.process(this.device)
        this.camerasMap.forEach((cameraData, camera) => {
            if (!comp.camerasSet.has(camera)) {
                cameraData.destroy()
                this.camerasMap.delete(camera)
            } else {
                cameraData.layersMap.forEach((layerData, layer) => {
                    if (!camera.layersSet.has(layer.id) || !layer.enabled) {
                        tempLayersToRemove.push(layer)
                    }
                })
                for (let i = 0; i < tempLayersToRemove.length; i++) {
                    const layer = tempLayersToRemove[i]
                    const layerData = cameraData.layersMap.get(layer)
                    if (layerData) {
                        layerData.destroy()
                        cameraData.layersMap.delete(layer)
                    }
                }
                tempLayersToRemove.length = 0
            }
        })
        let gsplatCount = 0
        let bufferCopyUploaded = 0
        let bufferCopyTotal = 0
        const camerasComponents = comp.cameras
        for (let i = 0; i < camerasComponents.length; i++) {
            const camera = camerasComponents[i].camera
            let cameraData = this.camerasMap.get(camera)
            const layerIds = camera.layers
            for (let j = 0; j < layerIds.length; j++) {
                const layer = comp.getLayerById(layerIds[j])
                if (layer?.enabled) {
                    if (layer.gsplatPlacementsDirty || !cameraData) {
                        const hasNormalPlacements = layer.gsplatPlacements.length > 0
                        const hasShadowCasters = layer.gsplatShadowCasters.length > 0
                        if (!hasNormalPlacements && !hasShadowCasters) {
                            if (cameraData) {
                                cameraData.removeLayerData(layer)
                            }
                        } else {
                            cameraData ?? (cameraData = this.getCameraData(camera))
                            const layerData = cameraData.getLayerData(this.device, this, layer, camera)
                            layerData.updateConfiguration(this.device, this, layer, camera)
                            if (layerData.gsplatManager) {
                                layerData.gsplatManager.reconcile(layer.gsplatPlacements)
                            }
                            if (layerData.gsplatManagerShadow) {
                                layerData.gsplatManagerShadow.reconcile(layer.gsplatShadowCasters)
                            }
                        }
                    }
                }
            }
            if (cameraData) {
                for (const layerData of cameraData.layersMap.values()) {
                    if (layerData.gsplatManager) {
                        gsplatCount += layerData.gsplatManager.update()
                        bufferCopyUploaded += layerData.gsplatManager.bufferCopyUploaded
                        bufferCopyTotal += layerData.gsplatManager.bufferCopyTotal
                    }
                    if (layerData.gsplatManagerShadow) {
                        gsplatCount += layerData.gsplatManagerShadow.update()
                        bufferCopyUploaded += layerData.gsplatManagerShadow.bufferCopyUploaded
                        bufferCopyTotal += layerData.gsplatManagerShadow.bufferCopyTotal
                    }
                }
            }
        }
        this.renderer._gsplatCount = gsplatCount
        this.renderer._gsplatBufferCopy = bufferCopyTotal > 0 ? (bufferCopyUploaded / bufferCopyTotal) * 100 : 0
        this.scene.gsplat.frameEnd()
        for (let i = 0; i < comp.layerList.length; i++) {
            comp.layerList[i].gsplatPlacementsDirty = false
        }
    }
    constructor(device, renderer, scene, eventHandler) {
        this.camerasMap = new Map()
        this.device = device
        this.renderer = renderer
        this.scene = scene
        this.eventHandler = eventHandler
    }
}

class GSplatComponent extends Component {
    set customAabb(value) {
        this._customAabb = value
        this._instance?.meshInstance?.setCustomAabb(this._customAabb)
        if (this._placement) {
            this._placement.aabb = this._customAabb
        }
    }
    get customAabb() {
        return this._customAabb ?? this._placement?.aabb ?? this.resource?.aabb ?? null
    }
    set instance(value) {
        if (this.unified) {
            return
        }
        this.destroyInstance()
        this._instance = value
        if (this._instance) {
            const mi = this._instance.meshInstance
            if (!mi.node) {
                mi.node = this.entity
            }
            mi.castShadow = this._castShadows
            mi.setCustomAabb(this._customAabb)
            if (this.enabled && this.entity.enabled) {
                this.addToLayers()
            }
        }
    }
    get instance() {
        return this._instance
    }
    set material(value) {
        if (this.unified) {
            return
        }
        if (this._instance) {
            this._instance.material = value
        } else {
            this._materialTmp = value
        }
    }
    get material() {
        if (this.unified) {
            return null
        }
        return this._instance?.material ?? this._materialTmp ?? null
    }
    set highQualitySH(value) {
        if (value !== this._highQualitySH) {
            this._highQualitySH = value
            this._instance?.setHighQualitySH(value)
        }
    }
    get highQualitySH() {
        return this._highQualitySH
    }
    set castShadows(value) {
        if (this._castShadows !== value) {
            const layers = this.layers
            const scene = this.system.app.scene
            if (this._placement) {
                if (value) {
                    for (let i = 0; i < layers.length; i++) {
                        const layer = scene.layers.getLayerById(layers[i])
                        layer?.addGSplatShadowCaster(this._placement)
                    }
                } else {
                    for (let i = 0; i < layers.length; i++) {
                        const layer = scene.layers.getLayerById(layers[i])
                        layer?.removeGSplatShadowCaster(this._placement)
                    }
                }
            }
            const mi = this.instance?.meshInstance
            if (mi) {
                if (this._castShadows && !value) {
                    for (let i = 0; i < layers.length; i++) {
                        const layer = scene.layers.getLayerById(this.layers[i])
                        layer?.removeShadowCasters([mi])
                    }
                }
                mi.castShadow = value
                if (!this._castShadows && value) {
                    for (let i = 0; i < layers.length; i++) {
                        const layer = scene.layers.getLayerById(layers[i])
                        layer?.addShadowCasters([mi])
                    }
                }
            }
            this._castShadows = value
        }
    }
    get castShadows() {
        return this._castShadows
    }
    set lodBaseDistance(value) {
        this._lodBaseDistance = Math.max(0.1, value)
        if (this._placement) {
            this._placement.lodBaseDistance = this._lodBaseDistance
        }
    }
    get lodBaseDistance() {
        return this._lodBaseDistance
    }
    set lodMultiplier(value) {
        this._lodMultiplier = Math.max(1.2, value)
        if (this._placement) {
            this._placement.lodMultiplier = this._lodMultiplier
        }
    }
    get lodMultiplier() {
        return this._lodMultiplier
    }
    set lodDistances(value) {
        if (Array.isArray(value) && value.length > 0) {
            this.lodBaseDistance = value[0]
            this.lodMultiplier = 3
        }
    }
    get lodDistances() {
        return []
    }
    set splatBudget(value) {}
    get splatBudget() {
        return 0
    }
    set unified(value) {
        if (this._unified !== value) {
            this._unified = value
            this._onGSplatAssetAdded()
        }
    }
    get unified() {
        return this._unified
    }
    get id() {
        return this._id
    }
    set workBufferUpdate(value) {
        this._workBufferUpdate = value
        if (this._placement) {
            this._placement.workBufferUpdate = value
        }
    }
    get workBufferUpdate() {
        return this._workBufferUpdate
    }
    setWorkBufferModifier(value) {
        if (value) {
            const device = this.system.app.graphicsDevice
            const code = (device.isWebGPU ? value.wgsl : value.glsl) ?? null
            this._workBufferModifier = code
                ? {
                      code,
                      hash: hashCode(code),
                  }
                : null
        } else {
            this._workBufferModifier = null
        }
        if (this._placement) {
            this._placement.workBufferModifier = this._workBufferModifier
        }
    }
    set layers(value) {
        this.removeFromLayers()
        this._layers.length = 0
        for (let i = 0; i < value.length; i++) {
            this._layers[i] = value[i]
        }
        if (!this.enabled || !this.entity.enabled) {
            return
        }
        this.addToLayers()
    }
    get layers() {
        return this._layers
    }
    set asset(value) {
        const id = value instanceof Asset ? value.id : value
        if (this._assetReference.id === id) return
        if (this._assetReference.asset && this._assetReference.asset.resource) {
            this._onGSplatAssetRemove()
        }
        this._assetReference.id = id
        if (this._assetReference.asset) {
            this._onGSplatAssetAdded()
        }
    }
    get asset() {
        return this._assetReference.id
    }
    set resource(value) {
        if (this._resource === value) return
        if (this._resource || this._assetReference.asset?.resource) {
            this._onGSplatAssetRemove()
        }
        if (value && this._assetReference.id) {
            this._assetReference.id = null
        }
        this._resource = value
        if (this._resource && this.enabled && this.entity.enabled) {
            this._onGSplatAssetLoad()
        }
    }
    get resource() {
        return this._resource ?? this._assetReference.asset?.resource ?? null
    }
    destroyInstance() {
        if (this._placement) {
            this.removeFromLayers()
            this._placement.destroy()
            this._placement = null
        }
        if (this._instance) {
            this.removeFromLayers()
            this._instance?.destroy()
            this._instance = null
        }
    }
    addToLayers() {
        if (this._placement) {
            const layers = this.system.app.scene.layers
            for (let i = 0; i < this._layers.length; i++) {
                const layer = layers.getLayerById(this._layers[i])
                if (layer) {
                    layer.addGSplatPlacement(this._placement)
                    if (this._castShadows) {
                        layer.addGSplatShadowCaster(this._placement)
                    }
                }
            }
            return
        }
        const meshInstance = this.instance?.meshInstance
        if (meshInstance) {
            const layers = this.system.app.scene.layers
            for (let i = 0; i < this._layers.length; i++) {
                layers.getLayerById(this._layers[i])?.addMeshInstances([meshInstance])
            }
        }
    }
    removeFromLayers() {
        if (this._placement) {
            const layers = this.system.app.scene.layers
            for (let i = 0; i < this._layers.length; i++) {
                const layer = layers.getLayerById(this._layers[i])
                if (layer) {
                    layer.removeGSplatPlacement(this._placement)
                    layer.removeGSplatShadowCaster(this._placement)
                }
            }
            return
        }
        const meshInstance = this.instance?.meshInstance
        if (meshInstance) {
            const layers = this.system.app.scene.layers
            for (let i = 0; i < this._layers.length; i++) {
                layers.getLayerById(this._layers[i])?.removeMeshInstances([meshInstance])
            }
        }
    }
    onRemoveChild() {
        this.removeFromLayers()
    }
    onInsertChild() {
        if (this.enabled && this.entity.enabled) {
            if (this._instance || this._placement) {
                this.addToLayers()
            }
        }
    }
    onRemove() {
        this.destroyInstance()
        this.asset = null
        this._assetReference.id = null
        this.entity.off('remove', this.onRemoveChild, this)
        this.entity.off('insert', this.onInsertChild, this)
    }
    onLayersChanged(oldComp, newComp) {
        this.addToLayers()
        oldComp.off('add', this.onLayerAdded, this)
        oldComp.off('remove', this.onLayerRemoved, this)
        newComp.on('add', this.onLayerAdded, this)
        newComp.on('remove', this.onLayerRemoved, this)
    }
    onLayerAdded(layer) {
        const index = this.layers.indexOf(layer.id)
        if (index < 0) return
        if (this.unified) {
            return
        }
        if (this._instance) {
            layer.addMeshInstances(this._instance.meshInstance)
        }
    }
    onLayerRemoved(layer) {
        const index = this.layers.indexOf(layer.id)
        if (index < 0) return
        if (this.unified) {
            return
        }
        if (this._instance) {
            layer.removeMeshInstances(this._instance.meshInstance)
        }
    }
    onEnable() {
        const scene = this.system.app.scene
        const layers = scene.layers
        this._evtLayersChanged = scene.on('set:layers', this.onLayersChanged, this)
        if (layers) {
            this._evtLayerAdded = layers.on('add', this.onLayerAdded, this)
            this._evtLayerRemoved = layers.on('remove', this.onLayerRemoved, this)
        }
        if (this._instance || this._placement) {
            this.addToLayers()
        } else if (this.asset) {
            this._onGSplatAssetAdded()
        } else if (this._resource) {
            this._onGSplatAssetLoad()
        }
    }
    onDisable() {
        const scene = this.system.app.scene
        const layers = scene.layers
        this._evtLayersChanged?.off()
        this._evtLayersChanged = null
        if (layers) {
            this._evtLayerAdded?.off()
            this._evtLayerAdded = null
            this._evtLayerRemoved?.off()
            this._evtLayerRemoved = null
        }
        this.removeFromLayers()
    }
    hide() {
        if (this._instance) {
            this._instance.meshInstance.visible = false
        }
    }
    show() {
        if (this._instance) {
            this._instance.meshInstance.visible = true
        }
    }
    setParameter(name, data) {
        const scopeId = this.system.app.graphicsDevice.scope.resolve(name)
        this._parameters.set(name, {
            scopeId,
            data,
        })
        if (this._placement) this._placement.renderDirty = true
    }
    getParameter(name) {
        return this._parameters.get(name)?.data
    }
    deleteParameter(name) {
        this._parameters.delete(name)
        if (this._placement) this._placement.renderDirty = true
    }
    getInstanceTexture(name) {
        if (!this._placement) {
            return null
        }
        return this._placement.getInstanceTexture(name, this.system.app.graphicsDevice) ?? null
    }
    _onGSplatAssetAdded() {
        if (!this._assetReference.asset) {
            return
        }
        if (this._assetReference.asset.resource) {
            this._onGSplatAssetLoad()
        } else if (this.enabled && this.entity.enabled) {
            this.system.app.assets.load(this._assetReference.asset)
        }
    }
    _onGSplatAssetLoad() {
        this.destroyInstance()
        const resource = this._resource ?? this._assetReference.asset?.resource
        if (!resource) return
        if (this.unified) {
            this._placement = null
            this._placement = new GSplatPlacement(resource, this.entity, 0, this._parameters, null, this._id)
            this._placement.lodBaseDistance = this._lodBaseDistance
            this._placement.lodMultiplier = this._lodMultiplier
            this._placement.workBufferUpdate = this._workBufferUpdate
            this._placement.workBufferModifier = this._workBufferModifier
            if (this.enabled && this.entity.enabled) {
                this.addToLayers()
            }
        } else {
            this.instance = new GSplatInstance(resource, {
                material: this._materialTmp,
                highQualitySH: this._highQualitySH,
                scene: this.system.app.scene,
            })
            this._materialTmp = null
        }
    }
    _onGSplatAssetUnload() {
        this.destroyInstance()
    }
    _onGSplatAssetRemove() {
        this._onGSplatAssetUnload()
    }
    constructor(system, entity) {
        ;(super(system, entity),
            (this._layers = [LAYERID_WORLD]),
            (this._instance = null),
            (this._placement = null),
            (this._id = PickerId.get()),
            (this._materialTmp = null),
            (this._highQualitySH = true),
            (this._lodBaseDistance = 5),
            (this._lodMultiplier = 3),
            (this._customAabb = null),
            (this._resource = null),
            (this._evtLayersChanged = null),
            (this._evtLayerAdded = null),
            (this._evtLayerRemoved = null),
            (this._castShadows = false),
            (this._unified = false),
            (this._parameters = new Map()),
            (this._workBufferUpdate = WORKBUFFER_UPDATE_AUTO),
            (this._workBufferModifier = null))
        this._assetReference = new AssetReference(
            'asset',
            this,
            system.app.assets,
            {
                add: this._onGSplatAssetAdded,
                load: this._onGSplatAssetLoad,
                remove: this._onGSplatAssetRemove,
                unload: this._onGSplatAssetUnload,
            },
            this,
        )
        entity.on('remove', this.onRemoveChild, this)
        entity.on('removehierarchy', this.onRemoveChild, this)
        entity.on('insert', this.onInsertChild, this)
        entity.on('inserthierarchy', this.onInsertChild, this)
    }
}

class GSplatComponentData {
    constructor() {
        this.enabled = true
    }
}

var gsplatCenterVS$1 = `
uniform mat4 matrix_model;
uniform mat4 matrix_view;
#ifndef GSPLAT_CENTER_NOPROJ
	uniform vec4 camera_params;
	uniform mat4 matrix_projection;
#endif
bool initCenter(vec3 modelCenter, inout SplatCenter center) {
	mat4 modelView = matrix_view * matrix_model;
	vec4 centerView = modelView * vec4(modelCenter, 1.0);
	#ifndef GSPLAT_CENTER_NOPROJ
		if (camera_params.w != 1.0 && centerView.z > 0.0) {
			return false;
		}
		vec4 centerProj = matrix_projection * centerView;
		#if WEBGPU
			centerProj.z = clamp(centerProj.z, 0, abs(centerProj.w));
		#else
			centerProj.z = clamp(centerProj.z, -abs(centerProj.w), abs(centerProj.w));
		#endif
		center.proj = centerProj;
		center.projMat00 = matrix_projection[0][0];
	#endif
	center.view = centerView.xyz / centerView.w;
	center.modelView = modelView;
	return true;
}
`

var gsplatCommonVS$1 = `
#include "gsplatHelpersVS"
#include "gsplatFormatVS"
#include "gsplatStructsVS"
#include "gsplatDeclarationsVS"
#include "gsplatModifyVS"
#include "gsplatEvalSHVS"
#include "gsplatQuatToMat3VS"
#include "gsplatReadVS"
#include "gsplatSourceVS"
#include "gsplatCenterVS"
#include "gsplatCornerVS"
#include "gsplatOutputVS"
void clipCorner(inout SplatCorner corner, float alpha) {
	float clip = min(1.0, sqrt(log(255.0 * alpha)) * 0.5);
	corner.offset *= clip;
	corner.uv *= clip;
}
`

var gsplatSplatVS$1 = `
struct Splat {
	uint index;
	ivec2 uv;
};
Splat splat;
void setSplat(uint idx) {
	splat.index = idx;
	splat.uv = ivec2(idx % splatTextureSize, idx / splatTextureSize);
}
`

var gsplatEvalSHVS$1 = `
	#if SH_BANDS == 1
		#define SH_COEFFS 3
	#elif SH_BANDS == 2
		#define SH_COEFFS 8
	#elif SH_BANDS == 3
		#define SH_COEFFS 15
	#else
		#define SH_COEFFS 0
	#endif
	#if SH_BANDS > 0
	const float SH_C1 = 0.4886025119029199f;
	#if SH_BANDS > 1
		const float SH_C2_0 = 1.0925484305920792f;
		const float SH_C2_1 = -1.0925484305920792f;
		const float SH_C2_2 = 0.31539156525252005f;
		const float SH_C2_3 = -1.0925484305920792f;
		const float SH_C2_4 = 0.5462742152960396f;
	#endif
	#if SH_BANDS > 2
		const float SH_C3_0 = -0.5900435899266435f;
		const float SH_C3_1 = 2.890611442640554f;
		const float SH_C3_2 = -0.4570457994644658f;
		const float SH_C3_3 = 0.3731763325901154f;
		const float SH_C3_4 = -0.4570457994644658f;
		const float SH_C3_5 = 1.445305721320277f;
		const float SH_C3_6 = -0.5900435899266435f;
	#endif
	vec3 evalSH(in vec3 sh[SH_COEFFS], in vec3 dir) {
		float x = dir.x;
		float y = dir.y;
		float z = dir.z;
		vec3 result = SH_C1 * (-sh[0] * y + sh[1] * z - sh[2] * x);
		#if SH_BANDS > 1
			float xx = x * x;
			float yy = y * y;
			float zz = z * z;
			float xy = x * y;
			float yz = y * z;
			float xz = x * z;
			result +=
				sh[3] * (SH_C2_0 * xy) +
				sh[4] * (SH_C2_1 * yz) +
				sh[5] * (SH_C2_2 * (2.0 * zz - xx - yy)) +
				sh[6] * (SH_C2_3 * xz) +
				sh[7] * (SH_C2_4 * (xx - yy));
		#endif
		#if SH_BANDS > 2
			result +=
				sh[8]  * (SH_C3_0 * y * (3.0 * xx - yy)) +
				sh[9]  * (SH_C3_1 * xy * z) +
				sh[10] * (SH_C3_2 * y * (4.0 * zz - xx - yy)) +
				sh[11] * (SH_C3_3 * z * (2.0 * zz - 3.0 * xx - 3.0 * yy)) +
				sh[12] * (SH_C3_4 * x * (4.0 * zz - xx - yy)) +
				sh[13] * (SH_C3_5 * z * (xx - yy)) +
				sh[14] * (SH_C3_6 * x * (xx - 3.0 * yy));
		#endif
		return result;
	}
	#endif
`

var gsplatHelpersVS$1 = `
void gsplatMakeSpherical(inout vec3 scale, float size) {
	scale = vec3(size);
}
float gsplatGetSizeFromScale(vec3 scale) {
	return sqrt((scale.x * scale.x + scale.y * scale.y + scale.z * scale.z) / 3.0);
}
`

var gsplatModifyVS$1 = `
void modifySplatCenter(inout vec3 center) {
}
void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
}
void modifySplatColor(vec3 center, inout vec4 color) {
}
`

var gsplatQuatToMat3VS$1 = `
mat3 quatToMat3(vec4 R) {
	vec4 R2 = R + R;
	float X = R2.x * R.w;
	vec4 Y  = R2.y * R;
	vec4 Z  = R2.z * R;
	float W = R2.w * R.w;
	return mat3(
		1.0 - Z.z - W,
			  Y.z + X,
			  Y.w - Z.x,
			  Y.z - X,
		1.0 - Y.y - W,
			  Z.w + Y.x,
			  Y.w + Z.x,
			  Z.w - Y.x,
		1.0 - Y.y - Z.z
	);
}
vec4 quatMul(vec4 a, vec4 b) {
	return vec4(
		a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
		a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
		a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
	);
}
`

var gsplatStructsVS$1 = `
#include "gsplatSplatVS"
struct SplatSource {
	uint order;
	vec2 cornerUV;
};
struct SplatCenter {
	vec3 view;
	vec4 proj;
	mat4 modelView;
	float projMat00;
	vec3 modelCenterOriginal;
	vec3 modelCenterModified;
};
struct SplatCorner {
	vec3 offset;
	vec2 uv;
	#if GSPLAT_AA
		float aaFactor;
	#endif
	vec2 v;
	float dlen;
};
`

var gsplatCornerVS$1 = `
uniform vec4 viewport_size;
void computeCovariance(vec4 rotation, vec3 scale, out vec3 covA, out vec3 covB) {
	mat3 rot = quatToMat3(rotation);
	mat3 M = transpose(mat3(
		scale.x * rot[0],
		scale.y * rot[1],
		scale.z * rot[2]
	));
	covA = vec3(dot(M[0], M[0]), dot(M[0], M[1]), dot(M[0], M[2]));
	covB = vec3(dot(M[1], M[1]), dot(M[1], M[2]), dot(M[2], M[2]));
}
bool initCornerCov(SplatSource source, SplatCenter center, out SplatCorner corner, vec3 covA, vec3 covB) {
	mat3 Vrk = mat3(
		covA.x, covA.y, covA.z, 
		covA.y, covB.x, covB.y,
		covA.z, covB.y, covB.z
	);
	float focal = viewport_size.x * center.projMat00;
	vec3 v = camera_params.w == 1.0 ? vec3(0.0, 0.0, 1.0) : center.view.xyz;
	float J1 = focal / v.z;
	vec2 J2 = -J1 / v.z * v.xy;
	mat3 J = mat3(
		J1, 0.0, J2.x, 
		0.0, J1, J2.y, 
		0.0, 0.0, 0.0
	);
	mat3 W = transpose(mat3(center.modelView));
	mat3 T = W * J;
	mat3 cov = transpose(T) * Vrk * T;
	#if GSPLAT_AA
		float detOrig = cov[0][0] * cov[1][1] - cov[0][1] * cov[0][1];
		float detBlur = (cov[0][0] + 0.3) * (cov[1][1] + 0.3) - cov[0][1] * cov[0][1];
		corner.aaFactor = sqrt(max(detOrig / detBlur, 0.0));
	#endif
	float diagonal1 = cov[0][0] + 0.3;
	float offDiagonal = cov[0][1];
	float diagonal2 = cov[1][1] + 0.3;
	float mid = 0.5 * (diagonal1 + diagonal2);
	float radius = length(vec2((diagonal1 - diagonal2) / 2.0, offDiagonal));
	float lambda1 = mid + radius;
	float lambda2 = max(mid - radius, 0.1);
	float vmin = min(1024.0, min(viewport_size.x, viewport_size.y));
	float l1 = 2.0 * min(sqrt(2.0 * lambda1), vmin);
	float l2 = 2.0 * min(sqrt(2.0 * lambda2), vmin);
	if (l1 < 2.0 && l2 < 2.0) {
		return false;
	}
	vec2 c = center.proj.ww * viewport_size.zw;
	if (any(greaterThan(abs(center.proj.xy) - vec2(max(l1, l2)) * c, center.proj.ww))) {
		return false;
	}
	vec2 diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
	vec2 v1 = l1 * diagonalVector;
	vec2 v2 = l2 * vec2(diagonalVector.y, -diagonalVector.x);
	corner.offset = vec3((source.cornerUV.x * v1 + source.cornerUV.y * v2) * c, 0.0);
	corner.uv = source.cornerUV;
	return true;
}
#if GSPLAT_2DGS
void initCorner2DGS(SplatSource source, vec4 rotation, vec3 scale, out SplatCorner corner) {
	vec2 localPos = source.cornerUV * vec2(scale.x, scale.y) * 3.0;
	vec3 v = vec3(localPos, 0.0);
	vec3 t = 2.0 * cross(rotation.xyz, v);
	corner.offset = v + rotation.w * t + cross(rotation.xyz, t);
	corner.uv = source.cornerUV;
}
#endif
bool initCorner(SplatSource source, SplatCenter center, out SplatCorner corner) {
	vec4 rotation = getRotation().yzwx;
	vec3 scale = getScale();
	modifySplatRotationScale(center.modelCenterOriginal, center.modelCenterModified, rotation, scale);
	#if GSPLAT_2DGS
		initCorner2DGS(source, rotation, scale, corner);
		return true;
	#else
		vec3 covA, covB;
		computeCovariance(rotation.wxyz, scale, covA, covB);
		return initCornerCov(source, center, corner, covA, covB);
	#endif
}
`

var gsplatOutputVS$1 = `
#include "tonemappingPS"
#include "decodePS"
#include "gammaPS"
vec3 prepareOutputFromGamma(vec3 gammaColor) {
	#if TONEMAP == NONE
		#if GAMMA == NONE
			return decodeGamma(gammaColor);
		#else
			return gammaColor;
		#endif
	#else
		return gammaCorrectOutput(toneMap(decodeGamma(gammaColor)));
	#endif
}
`

var gsplatPS$1 = `
#ifndef DITHER_NONE
	#include "bayerPS"
	#include "opacityDitherPS"
	varying float id;
#endif
#if defined(SHADOW_PASS) || defined(PICK_PASS) || defined(PREPASS_PASS)
	uniform float alphaClip;
#endif
#ifdef PREPASS_PASS
	varying float vLinearDepth;
	#include "floatAsUintPS"
#endif
varying mediump vec2 gaussianUV;
varying mediump vec4 gaussianColor;
#if defined(GSPLAT_UNIFIED_ID) && defined(PICK_PASS)
	flat varying uint vPickId;
#endif
#ifdef PICK_PASS
	#include "pickPS"
#endif
const float EXP4 = exp(-4.0);
const float INV_EXP4 = 1.0 / (1.0 - EXP4);
float normExp(float x) {
	return (exp(x * -4.0) - EXP4) * INV_EXP4;
}
void main(void) {
	mediump float A = dot(gaussianUV, gaussianUV);
	if (A > 1.0) {
		discard;
	}
	mediump float alpha = normExp(A) * gaussianColor.a;
	#if defined(SHADOW_PASS) || defined(PICK_PASS) || defined(PREPASS_PASS)
		if (alpha < alphaClip) {
			discard;
		}
	#endif
	#ifdef PICK_PASS
		#ifdef GSPLAT_UNIFIED_ID
			pcFragColor0 = encodePickOutput(vPickId);
		#else
			pcFragColor0 = getPickOutput();
		#endif
		#ifdef DEPTH_PICK_PASS
			pcFragColor1 = getPickDepth();
		#endif
	#elif SHADOW_PASS
		gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
	#elif PREPASS_PASS
		gl_FragColor = float2vec4(vLinearDepth);
	#else
		if (alpha < 1.0 / 255.0) {
			discard;
		}
		#ifndef DITHER_NONE
			opacityDither(alpha, id * 0.013);
		#endif
		gl_FragColor = vec4(gaussianColor.xyz * alpha, alpha);
	#endif
}
`

var gsplatSourceVS$1 = `
attribute vec3 vertex_position;
attribute uint vertex_id_attrib;
uniform uint numSplats;
uniform highp usampler2D splatOrder;
bool initSource(out SplatSource source) {
	source.order = vertex_id_attrib + uint(vertex_position.z);
	if (source.order >= numSplats) {
		return false;
	}
	ivec2 orderUV = ivec2(source.order % splatTextureSize, source.order / splatTextureSize);
	uint splatId = texelFetch(splatOrder, orderUV, 0).r;
	setSplat(splatId);
	source.cornerUV = vertex_position.xy;
	return true;
}
`

var gsplatVS$1 = `
#include "gsplatCommonVS"
varying mediump vec2 gaussianUV;
varying mediump vec4 gaussianColor;
#ifndef DITHER_NONE
	varying float id;
#endif
mediump vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);
#ifdef PREPASS_PASS
	varying float vLinearDepth;
#endif
#if defined(GSPLAT_UNIFIED_ID) && defined(PICK_PASS)
	flat varying uint vPickId;
#endif
#ifdef GSPLAT_OVERDRAW
	uniform sampler2D colorRamp;
	uniform float colorRampIntensity;
#endif
void main(void) {
	SplatSource source;
	if (!initSource(source)) {
		gl_Position = discardVec;
		return;
	}
	vec3 modelCenter = getCenter();
	SplatCenter center;
	center.modelCenterOriginal = modelCenter;
	
	modifySplatCenter(modelCenter);
	center.modelCenterModified = modelCenter;
	if (!initCenter(modelCenter, center)) {
		gl_Position = discardVec;
		return;
	}
	SplatCorner corner;
	if (!initCorner(source, center, corner)) {
		gl_Position = discardVec;
		return;
	}
	vec4 clr = getColor();
	#if GSPLAT_AA
		clr.a *= corner.aaFactor;
	#endif
	#if SH_BANDS > 0
		vec3 dir = normalize(center.view * mat3(center.modelView));
		vec3 sh[SH_COEFFS];
		float scale;
		readSHData(sh, scale);
		clr.xyz += evalSH(sh, dir) * scale;
	#endif
	modifySplatColor(modelCenter, clr);
	if (255.0 * clr.w <= 1.0) {
		gl_Position = discardVec;
		return;
	}
	clipCorner(corner, clr.w);
	#if GSPLAT_2DGS
		vec3 modelCorner = center.modelCenterModified + corner.offset;
		gl_Position = matrix_projection * center.modelView * vec4(modelCorner, 1.0);
	#else
		gl_Position = center.proj + vec4(corner.offset.xyz, 0);
	#endif
	gaussianUV = corner.uv;
	#ifdef GSPLAT_OVERDRAW
		float t = clamp(modelCenter.y / 20.0, 0.0, 1.0);
		vec3 rampColor = textureLod(colorRamp, vec2(t, 0.5), 0.0).rgb;
		clr.a *= (1.0 / 32.0) * colorRampIntensity;
		gaussianColor = vec4(rampColor, clr.a);
	#else
		gaussianColor = vec4(prepareOutputFromGamma(max(clr.xyz, 0.0)), clr.w);
	#endif
	#ifndef DITHER_NONE
		id = float(splat.index);
	#endif
	#ifdef PREPASS_PASS
		vLinearDepth = -center.view.z;
	#endif
	#if defined(GSPLAT_UNIFIED_ID) && defined(PICK_PASS)
		vPickId = loadPcId().r;
	#endif
}
`

var gsplatFormatVS$1 = `
uniform uint splatTextureSize;
`

var gsplatUncompressedVS$1 = `
uint tAw;
vec4 tBcached;
vec4 unpackRotation(vec3 packed) {
	return vec4(packed.xyz, sqrt(max(0.0, 1.0 - dot(packed, packed))));
}
vec3 getCenter() {
	uvec4 tA = loadTransformA();
	tAw = tA.w;
	tBcached = loadTransformB();
	return uintBitsToFloat(tA.xyz);
}
vec4 getColor() {
	return loadSplatColor();
}
vec4 getRotation() {
	return unpackRotation(vec3(unpackHalf2x16(tAw), tBcached.w)).wxyz;
}
vec3 getScale() {
	return tBcached.xyz;
}
#include "gsplatUncompressedSHVS"
`

var gsplatUncompressedSHVS$1 = `
#if SH_BANDS > 0
vec3 unpack111011s(uint bits) {
	return vec3((uvec3(bits) >> uvec3(21u, 11u, 0u)) & uvec3(0x7ffu, 0x3ffu, 0x7ffu)) / vec3(2047.0, 1023.0, 2047.0) * 2.0 - 1.0;
}
void fetchScale(in uvec4 t, out float scale, out vec3 a, out vec3 b, out vec3 c) {
	scale = uintBitsToFloat(t.x);
	a = unpack111011s(t.y);
	b = unpack111011s(t.z);
	c = unpack111011s(t.w);
}
void fetch(in uvec4 t, out vec3 a, out vec3 b, out vec3 c, out vec3 d) {
	a = unpack111011s(t.x);
	b = unpack111011s(t.y);
	c = unpack111011s(t.z);
	d = unpack111011s(t.w);
}
void fetch(in uint t, out vec3 a) {
	a = unpack111011s(t);
}
#if SH_BANDS == 1
	void readSHData(out vec3 sh[3], out float scale) {
		fetchScale(loadSplatSH_1to3(), scale, sh[0], sh[1], sh[2]);
	}
#elif SH_BANDS == 2
	void readSHData(out vec3 sh[8], out float scale) {
		fetchScale(loadSplatSH_1to3(), scale, sh[0], sh[1], sh[2]);
		fetch(loadSplatSH_4to7(), sh[3], sh[4], sh[5], sh[6]);
		fetch(loadSplatSH_8to11().x, sh[7]);
	}
#else
	void readSHData(out vec3 sh[15], out float scale) {
		fetchScale(loadSplatSH_1to3(), scale, sh[0], sh[1], sh[2]);
		fetch(loadSplatSH_4to7(), sh[3], sh[4], sh[5], sh[6]);
		fetch(loadSplatSH_8to11(), sh[7], sh[8], sh[9], sh[10]);
		fetch(loadSplatSH_12to15(), sh[11], sh[12], sh[13], sh[14]);
	}
#endif
#endif
`

var gsplatCompressedVS$1 = `
#include "gsplatPackingPS"
uniform highp sampler2D chunkTexture;
vec4 chunkDataA;
vec4 chunkDataB;
vec4 chunkDataC;
vec4 chunkDataD;
vec4 chunkDataE;
uvec4 packedData;
vec3 unpack111011(uint bits) {
	return vec3(
		float(bits >> 21u) / 2047.0,
		float((bits >> 11u) & 0x3ffu) / 1023.0,
		float(bits & 0x7ffu) / 2047.0
	);
}
const float norm = sqrt(2.0);
vec4 unpackRotation(uint bits) {
	float a = (float((bits >> 20u) & 0x3ffu) / 1023.0 - 0.5) * norm;
	float b = (float((bits >> 10u) & 0x3ffu) / 1023.0 - 0.5) * norm;
	float c = (float(bits & 0x3ffu) / 1023.0 - 0.5) * norm;
	float m = sqrt(1.0 - (a * a + b * b + c * c));
	uint mode = bits >> 30u;
	if (mode == 0u) return vec4(m, a, b, c);
	if (mode == 1u) return vec4(a, m, b, c);
	if (mode == 2u) return vec4(a, b, m, c);
	return vec4(a, b, c, m);
}
vec3 getCenter() {
	uint w = uint(textureSize(chunkTexture, 0).x) / 5u;
	uint chunkId = splat.index / 256u;
	ivec2 chunkUV = ivec2((chunkId % w) * 5u, chunkId / w);
	chunkDataA = texelFetch(chunkTexture, chunkUV, 0);
	chunkDataB = texelFetch(chunkTexture, chunkUV + ivec2(1, 0), 0);
	chunkDataC = texelFetch(chunkTexture, chunkUV + ivec2(2, 0), 0);
	chunkDataD = texelFetch(chunkTexture, chunkUV + ivec2(3, 0), 0);
	chunkDataE = texelFetch(chunkTexture, chunkUV + ivec2(4, 0), 0);
	packedData = loadPackedTexture();
	return mix(chunkDataA.xyz, vec3(chunkDataA.w, chunkDataB.xy), unpack111011(packedData.x));
}
vec4 getColor() {
	vec4 r = unpack8888(packedData.w);
	return vec4(mix(chunkDataD.xyz, vec3(chunkDataD.w, chunkDataE.xy), r.rgb), r.w);
}
vec4 getRotation() {
	return unpackRotation(packedData.y);
}
vec3 getScale() {
	return exp(mix(vec3(chunkDataB.zw, chunkDataC.x), chunkDataC.yzw, unpack111011(packedData.z)));
}
#include "gsplatCompressedSHVS"
`

var gsplatCompressedSHVS$1 = `
#if SH_BANDS > 0
vec4 unpack8888s(in uint bits) {
	return vec4((uvec4(bits) >> uvec4(0u, 8u, 16u, 24u)) & 0xffu) * (8.0 / 255.0) - 4.0;
}
void readSHData(out vec3 sh[15], out float scale) {
	uvec4 shData0 = loadShTexture0();
	uvec4 shData1 = loadShTexture1();
	uvec4 shData2 = loadShTexture2();
	vec4 r0 = unpack8888s(shData0.x);
	vec4 r1 = unpack8888s(shData0.y);
	vec4 r2 = unpack8888s(shData0.z);
	vec4 r3 = unpack8888s(shData0.w);
	vec4 g0 = unpack8888s(shData1.x);
	vec4 g1 = unpack8888s(shData1.y);
	vec4 g2 = unpack8888s(shData1.z);
	vec4 g3 = unpack8888s(shData1.w);
	vec4 b0 = unpack8888s(shData2.x);
	vec4 b1 = unpack8888s(shData2.y);
	vec4 b2 = unpack8888s(shData2.z);
	vec4 b3 = unpack8888s(shData2.w);
	sh[0] =  vec3(r0.x, g0.x, b0.x);
	sh[1] =  vec3(r0.y, g0.y, b0.y);
	sh[2] =  vec3(r0.z, g0.z, b0.z);
	sh[3] =  vec3(r0.w, g0.w, b0.w);
	sh[4] =  vec3(r1.x, g1.x, b1.x);
	sh[5] =  vec3(r1.y, g1.y, b1.y);
	sh[6] =  vec3(r1.z, g1.z, b1.z);
	sh[7] =  vec3(r1.w, g1.w, b1.w);
	sh[8] =  vec3(r2.x, g2.x, b2.x);
	sh[9] =  vec3(r2.y, g2.y, b2.y);
	sh[10] = vec3(r2.z, g2.z, b2.z);
	sh[11] = vec3(r2.w, g2.w, b2.w);
	sh[12] = vec3(r3.x, g3.x, b3.x);
	sh[13] = vec3(r3.y, g3.y, b3.y);
	sh[14] = vec3(r3.z, g3.z, b3.z);
	scale = 1.0;
}
#endif
`

var gsplatSogVS$1 = `
#include "gsplatPackingPS"
uniform vec3 means_mins;
uniform vec3 means_maxs;
uniform float scales_mins;
uniform float scales_maxs;
uniform float sh0_mins;
uniform float sh0_maxs;
uniform highp sampler2D packedSh0;
const float SH_C0 = 0.28209479177387814;
uvec4 packedSample;
const float norm = sqrt(2.0);
vec3 getCenter() {
	packedSample = loadPackedTexture();
	vec3 l = unpack8888(packedSample.x).xyz;
	vec3 u = unpack8888(packedSample.y).xyz;
	vec3 n = (l + u * 256.0) / 257.0;
	vec3 v = mix(means_mins, means_maxs, n);
	return sign(v) * (exp(abs(v)) - 1.0);
}
vec4 getColor() {
	vec3 clr = mix(vec3(sh0_mins), vec3(sh0_maxs), unpack111110(pack8888(texelFetch(packedSh0, splat.uv, 0))));
	float alpha = float(packedSample.z & 0xffu) / 255.0;
	return vec4(vec3(0.5) + clr * SH_C0, alpha);
}
vec4 getRotation() {
	vec3 qdata = unpack8888(packedSample.z).xyz;
	uint qmode = packedSample.w & 0x3u;
	vec3 abc = (qdata - 0.5) * norm;
	float d = sqrt(max(0.0, 1.0 - dot(abc, abc)));
	return (qmode == 0u) ? vec4(d, abc) :
		   ((qmode == 1u) ? vec4(abc.x, d, abc.yz) :
		   ((qmode == 2u) ? vec4(abc.xy, d, abc.z) : vec4(abc, d)));
}
vec3 getScale() {
	vec3 sdata = unpack101010(packedSample.w >> 2u);
	return exp(mix(vec3(scales_mins), vec3(scales_maxs), sdata));
}
#include "gsplatSogSHVS"
`

var gsplatSogSHVS$1 = `
#if SH_BANDS > 0
uniform highp sampler2D packedShN;
uniform float shN_mins;
uniform float shN_maxs;
void readSHData(out vec3 sh[SH_COEFFS], out float scale) {
	ivec2 t = ivec2(packedSample.xy & 255u);
	int n = t.x + t.y * 256;
	int u = (n % 64) * SH_COEFFS;
	int v = n / 64;
	for (int i = 0; i < SH_COEFFS; i++) {
		sh[i] = mix(vec3(shN_mins), vec3(shN_maxs), unpack111110(pack8888(texelFetch(packedShN, ivec2(u + i, v), 0))));
	}
	scale = 1.0;
}
#endif
`

var gsplatContainerDeclVS$1 = `
#include "gsplatContainerDeclarationsVS"
vec3 splatCenter;
vec4 splatColor;
vec3 splatScale;
vec4 splatRotation;
`

var gsplatContainerReadVS$1 = `
vec3 getCenter() {
	#include "gsplatContainerUserReadVS"
	return splatCenter;
}
vec4 getRotation() {
	return splatRotation;
}
vec3 getScale() {
	return splatScale;
}
vec4 getColor() {
	return splatColor;
}
`

const gsplatChunksGLSL = {
    gsplatCenterVS: gsplatCenterVS$1,
    gsplatCornerVS: gsplatCornerVS$1,
    gsplatCommonVS: gsplatCommonVS$1,
    gsplatSplatVS: gsplatSplatVS$1,
    gsplatEvalSHVS: gsplatEvalSHVS$1,
    gsplatHelpersVS: gsplatHelpersVS$1,
    gsplatModifyVS: gsplatModifyVS$1,
    gsplatQuatToMat3VS: gsplatQuatToMat3VS$1,
    gsplatStructsVS: gsplatStructsVS$1,
    gsplatOutputVS: gsplatOutputVS$1,
    gsplatPS: gsplatPS$1,
    gsplatSourceVS: gsplatSourceVS$1,
    gsplatVS: gsplatVS$1,
    gsplatPackingPS: gsplatPackingPS$1,
    gsplatFormatVS: gsplatFormatVS$1,
    gsplatUncompressedVS: gsplatUncompressedVS$1,
    gsplatUncompressedSHVS: gsplatUncompressedSHVS$1,
    gsplatCompressedVS: gsplatCompressedVS$1,
    gsplatCompressedSHVS: gsplatCompressedSHVS$1,
    gsplatSogVS: gsplatSogVS$1,
    gsplatSogSHVS: gsplatSogSHVS$1,
    gsplatContainerDeclVS: gsplatContainerDeclVS$1,
    gsplatContainerReadVS: gsplatContainerReadVS$1,
    gsplatContainerFloatReadVS: gsplatContainerFloatReadVS$1,
}

var gsplatCenterVS = `
uniform matrix_model: mat4x4f;
uniform matrix_view: mat4x4f;
#ifndef GSPLAT_CENTER_NOPROJ
	uniform camera_params: vec4f;
	uniform matrix_projection: mat4x4f;
#endif
fn initCenter(modelCenter: vec3f, center: ptr<function, SplatCenter>) -> bool {
	let modelView: mat4x4f = uniform.matrix_view * uniform.matrix_model;
	let centerView: vec4f = modelView * vec4f(modelCenter, 1.0);
	#ifndef GSPLAT_CENTER_NOPROJ
		if (uniform.camera_params.w != 1.0 && centerView.z > 0.0) {
			return false;
		}
		var centerProj: vec4f = uniform.matrix_projection * centerView;
		centerProj.z = clamp(centerProj.z, 0.0, abs(centerProj.w));
		center.proj = centerProj;
		center.projMat00 = uniform.matrix_projection[0][0];
	#endif
	center.view = centerView.xyz / centerView.w;
	center.modelView = modelView;
	return true;
}
`

var gsplatCommonVS = `
#include "gsplatHelpersVS"
#include "gsplatFormatVS"
#include "gsplatStructsVS"
#include "gsplatDeclarationsVS"
#include "gsplatModifyVS"
#include "gsplatEvalSHVS"
#include "gsplatQuatToMat3VS"
#include "gsplatReadVS"
#include "gsplatSourceVS"
#include "gsplatCenterVS"
#include "gsplatCornerVS"
#include "gsplatOutputVS"
fn clipCorner(corner: ptr<function, SplatCorner>, alpha: half) {
	let clip = min(half(1.0), sqrt(log(half(255.0) * alpha)) * half(0.5));
	corner.offset = corner.offset * f32(clip);
	corner.uv = corner.uv * clip;
}
`

var gsplatSplatVS = `
struct Splat {
	index: u32,
	uv: vec2i
}
var<private> splat: Splat;
fn setSplat(idx: u32) {
	splat.index = idx;
	splat.uv = vec2i(i32(idx % uniform.splatTextureSize), i32(idx / uniform.splatTextureSize));
}
`

var gsplatEvalSHVS = `
	#if SH_BANDS == 1
		const SH_COEFFS: i32 = 3;
	#elif SH_BANDS == 2
		const SH_COEFFS: i32 = 8;
	#elif SH_BANDS == 3
		const SH_COEFFS: i32 = 15;
	#else
		const SH_COEFFS: i32 = 0;
	#endif
	#if SH_BANDS > 0
	const SH_C1: half = half(0.4886025119029199);
	#if SH_BANDS > 1
		const SH_C2_0: half = half(1.0925484305920792);
		const SH_C2_1: half = half(-1.0925484305920792);
		const SH_C2_2: half = half(0.31539156525252005);
		const SH_C2_3: half = half(-1.0925484305920792);
		const SH_C2_4: half = half(0.5462742152960396);
	#endif
	#if SH_BANDS > 2
		const SH_C3_0: half = half(-0.5900435899266435);
		const SH_C3_1: half = half(2.890611442640554);
		const SH_C3_2: half = half(-0.4570457994644658);
		const SH_C3_3: half = half(0.3731763325901154);
		const SH_C3_4: half = half(-0.4570457994644658);
		const SH_C3_5: half = half(1.445305721320277);
		const SH_C3_6: half = half(-0.5900435899266435);
	#endif
	fn evalSH(sh: ptr<function, array<half3, SH_COEFFS>>, dir: vec3f) -> half3 {
		let d: half3 = half3(dir);
		var result: half3 = SH_C1 * (-sh[0] * d.y + sh[1] * d.z - sh[2] * d.x);
		#if SH_BANDS > 1
			let xx: half = d.x * d.x;
			let yy: half = d.y * d.y;
			let zz: half = d.z * d.z;
			let xy: half = d.x * d.y;
			let yz: half = d.y * d.z;
			let xz: half = d.x * d.z;
			result = result + (
				sh[3] * (SH_C2_0 * xy) +
				sh[4] * (SH_C2_1 * yz) +
				sh[5] * (SH_C2_2 * (half(2.0) * zz - xx - yy)) +
				sh[6] * (SH_C2_3 * xz) +
				sh[7] * (SH_C2_4 * (xx - yy))
			);
		#endif
		#if SH_BANDS > 2
			result = result + (
				sh[8]  * (SH_C3_0 * d.y * (half(3.0) * xx - yy)) +
				sh[9]  * (SH_C3_1 * xy * d.z) +
				sh[10] * (SH_C3_2 * d.y * (half(4.0) * zz - xx - yy)) +
				sh[11] * (SH_C3_3 * d.z * (half(2.0) * zz - half(3.0) * xx - half(3.0) * yy)) +
				sh[12] * (SH_C3_4 * d.x * (half(4.0) * zz - xx - yy)) +
				sh[13] * (SH_C3_5 * d.z * (xx - yy)) +
				sh[14] * (SH_C3_6 * d.x * (xx - half(3.0) * yy))
			);
		#endif
		return result;
	}
	#endif
`

var gsplatHelpersVS = `
fn gsplatMakeSpherical(scale: ptr<function, vec3f>, size: f32) {
	*scale = vec3f(size);
}
fn gsplatGetSizeFromScale(scale: vec3f) -> f32 {
	return sqrt((scale.x * scale.x + scale.y * scale.y + scale.z * scale.z) / 3.0);
}
`

var gsplatModifyVS = `
fn modifySplatCenter(center: ptr<function, vec3f>) {
}
fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {
}
fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
}
`

var gsplatQuatToMat3VS = `
fn quatToMat3(r: half4) -> half3x3 {
	let r2: half4 = r + r;
	let x: half   = r2.x * r.w;
	let y: half4  = r2.y * r;
	let z: half4  = r2.z * r;
	let w: half   = r2.w * r.w;
	return half3x3(
		half(1.0) - z.z - w,  y.z + x,			  y.w - z.x,
		y.z - x,			  half(1.0) - y.y - w,   z.w + y.x,
		y.w + z.x,			z.w - y.x,			 half(1.0) - y.y - z.z
	);
}
fn quatMul(a: half4, b: half4) -> half4 {
	return half4(
		a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
		a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
		a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
	);
}
`

var gsplatStructsVS = `
#include "gsplatSplatVS"
struct SplatSource {
	order: u32,
	cornerUV: half2
}
struct SplatCenter {
	view: vec3f,
	proj: vec4f,
	modelView: mat4x4f,
	projMat00: f32,
	modelCenterOriginal: vec3f,
	modelCenterModified: vec3f,
}
struct SplatCorner {
	offset: vec3f,
	uv: half2,
	#if GSPLAT_AA
		aaFactor: half,
	#endif
}
`

var gsplatCornerVS = `
uniform viewport_size: vec4f;
fn computeCovariance(rotation: half4, scale: half3, covA_ptr: ptr<function, vec3f>, covB_ptr: ptr<function, vec3f>) {
	let rot: half3x3 = quatToMat3(rotation);
	let s: vec3f = vec3f(scale);
	let M: mat3x3f = transpose(mat3x3f(
		s.x * vec3f(rot[0]),
		s.y * vec3f(rot[1]),
		s.z * vec3f(rot[2])
	));
	*covA_ptr = vec3f(dot(M[0], M[0]), dot(M[0], M[1]), dot(M[0], M[2]));
	*covB_ptr = vec3f(dot(M[1], M[1]), dot(M[1], M[2]), dot(M[2], M[2]));
}
fn initCornerCov(source: ptr<function, SplatSource>, center: ptr<function, SplatCenter>, corner: ptr<function, SplatCorner>, covA: vec3f, covB: vec3f) -> bool {
	let Vrk = mat3x3f(
		vec3f(covA.x, covA.y, covA.z),
		vec3f(covA.y, covB.x, covB.y),
		vec3f(covA.z, covB.y, covB.z)
	);
	let focal = uniform.viewport_size.x * center.projMat00;
	let v = select(center.view.xyz, vec3f(0.0, 0.0, 1.0), uniform.camera_params.w == 1.0);
	let J1 = focal / v.z;
	let J2 = -J1 / v.z * v.xy;
	let J = mat3x3f(
		vec3f(J1, 0.0, J2.x),
		vec3f(0.0, J1, J2.y),
		vec3f(0.0, 0.0, 0.0)
	);
	let W = transpose(mat3x3f(center.modelView[0].xyz, center.modelView[1].xyz, center.modelView[2].xyz));
	let T = W * J;
	let cov = transpose(T) * Vrk * T;
	#if GSPLAT_AA
		let detOrig = cov[0][0] * cov[1][1] - cov[0][1] * cov[1][0];
		let detBlur = (cov[0][0] + 0.3) * (cov[1][1] + 0.3) - cov[0][1] * cov[1][0];
		corner.aaFactor = half(sqrt(max(detOrig / detBlur, 0.0)));
	#endif
	let diagonal1 = cov[0][0] + 0.3;
	let offDiagonal = cov[0][1];
	let diagonal2 = cov[1][1] + 0.3;
	let mid = 0.5 * (diagonal1 + diagonal2);
	let radius = length(vec2f((diagonal1 - diagonal2) / 2.0, offDiagonal));
	let lambda1 = mid + radius;
	let lambda2 = max(mid - radius, 0.1);
	let vmin = min(1024.0, min(uniform.viewport_size.x, uniform.viewport_size.y));
	let l1 = 2.0 * min(sqrt(2.0 * lambda1), vmin);
	let l2 = 2.0 * min(sqrt(2.0 * lambda2), vmin);
	if (l1 < 2.0 && l2 < 2.0) {
		return false;
	}
	let c = center.proj.ww * uniform.viewport_size.zw;
	if (any((abs(center.proj.xy) - vec2f(max(l1, l2)) * c) > center.proj.ww)) {
		return false;
	}
	let diagonalVector = normalize(vec2f(offDiagonal, lambda1 - diagonal1));
	let v1 = l1 * diagonalVector;
	let v2 = l2 * vec2f(diagonalVector.y, -diagonalVector.x);
	corner.offset = vec3f((f32(source.cornerUV.x) * v1 + f32(source.cornerUV.y) * v2) * c, 0.0);
	corner.uv = source.cornerUV;
	return true;
}
#if GSPLAT_2DGS
fn initCorner2DGS(source: ptr<function, SplatSource>, rotation: vec4f, scale: vec3f, corner: ptr<function, SplatCorner>) {
	let localPos: vec2f = vec2f(source.cornerUV) * vec2f(scale.x, scale.y) * 3.0;
	let v: vec3f = vec3f(localPos, 0.0);
	let t: vec3f = 2.0 * cross(rotation.xyz, v);
	corner.offset = v + rotation.w * t + cross(rotation.xyz, t);
	corner.uv = source.cornerUV;
}
#endif
fn initCorner(source: ptr<function, SplatSource>, center: ptr<function, SplatCenter>, corner: ptr<function, SplatCorner>) -> bool {
	var rotation: vec4f = getRotation().yzwx;
	var scale: vec3f = getScale();
	modifySplatRotationScale(center.modelCenterOriginal, center.modelCenterModified, &rotation, &scale);
	#if GSPLAT_2DGS
		initCorner2DGS(source, rotation, scale, corner);
		return true;
	#else
		var covA: vec3f;
		var covB: vec3f;
		computeCovariance(half4(rotation.wxyz), half3(scale), &covA, &covB);
		return initCornerCov(source, center, corner, covA, covB);
	#endif
}
`

var gsplatOutputVS = `
#include "tonemappingPS"
#include "decodePS"
#include "gammaPS"
fn prepareOutputFromGamma(gammaColor: vec3f) -> vec3f {
	#if TONEMAP == NONE
		#if GAMMA == NONE
			return decodeGamma3(gammaColor);
		#else 
			return gammaColor;
		#endif
	#else
		return gammaCorrectOutput(toneMap(decodeGamma3(gammaColor)));
	#endif
}
`

var gsplatPS = `
#ifndef DITHER_NONE
	#include "bayerPS"
	#include "opacityDitherPS"
	varying id: f32;
#endif
#if defined(SHADOW_PASS) || defined(PICK_PASS) || defined(PREPASS_PASS)
	uniform alphaClip: f32;
#endif
#ifdef PREPASS_PASS
	varying vLinearDepth: f32;
	#include "floatAsUintPS"
#endif
const EXP4: half = exp(half(-4.0));
const INV_EXP4: half = half(1.0) / (half(1.0) - EXP4);
fn normExp(x: half) -> half {
	return (exp(x * half(-4.0)) - EXP4) * INV_EXP4;
}
varying gaussianUV: half2;
varying gaussianColor: half4;
#if defined(GSPLAT_UNIFIED_ID) && defined(PICK_PASS)
	varying @interpolate(flat) vPickId: u32;
#endif
#ifdef PICK_PASS
	#include "pickPS"
#endif
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	var output: FragmentOutput;
	let A: half = dot(gaussianUV, gaussianUV);
	if (A > half(1.0)) {
		discard;
		return output;
	}
	var alpha: half = normExp(A) * gaussianColor.a;
	#if defined(SHADOW_PASS) || defined(PICK_PASS) || defined(PREPASS_PASS)
		if (alpha < half(uniform.alphaClip)) {
			discard;
			return output;
		}
	#endif
	#ifdef PICK_PASS
		#ifdef GSPLAT_UNIFIED_ID
			output.color = encodePickOutput(vPickId);
		#else
			output.color = getPickOutput();
		#endif
		#ifdef DEPTH_PICK_PASS
			output.color1 = getPickDepth();
		#endif
	#elif SHADOW_PASS
		output.color = vec4f(0.0, 0.0, 0.0, 1.0);
	#elif PREPASS_PASS
		output.color = float2vec4(vLinearDepth);
	#else
		if (alpha < half(1.0 / 255.0)) {
			discard;
			return output;
		}
		#ifndef DITHER_NONE
			opacityDither(f32(alpha), id * 0.013);
		#endif
		output.color = vec4f(vec3f(gaussianColor.xyz * alpha), f32(alpha));
	#endif
	return output;
}`

var gsplatSourceVS = `
attribute vertex_position: vec3f;
attribute vertex_id_attrib: u32;
#ifdef GSPLAT_INDIRECT_DRAW
	var<storage, read> numSplatsStorage: array<u32>;
	var<storage, read> compactedSplatIds: array<u32>;
#else
	uniform numSplats: u32;
	var<storage, read> splatOrder: array<u32>;
#endif
fn initSource(source: ptr<function, SplatSource>) -> bool {
	source.order = vertex_id_attrib + u32(vertex_position.z);
	#ifdef GSPLAT_INDIRECT_DRAW
		let numSplats = numSplatsStorage[0];
	#else
		let numSplats = uniform.numSplats;
	#endif
	if (source.order >= numSplats) {
		return false;
	}
	var splatId: u32;
	#ifdef GSPLAT_INDIRECT_DRAW
		splatId = compactedSplatIds[source.order];
	#else
		splatId = splatOrder[source.order];
	#endif
	setSplat(splatId);
	source.cornerUV = half2(vertex_position.xy);
	return true;
}
`

var gsplatVS = `
#include "gsplatCommonVS"
varying gaussianUV: half2;
varying gaussianColor: half4;
#ifndef DITHER_NONE
	varying id: f32;
#endif
const discardVec: vec4f = vec4f(0.0, 0.0, 2.0, 1.0);
#ifdef PREPASS_PASS
	varying vLinearDepth: f32;
#endif
#if defined(GSPLAT_UNIFIED_ID) && defined(PICK_PASS)
	varying @interpolate(flat) vPickId: u32;
#endif
#ifdef GSPLAT_OVERDRAW
	uniform colorRampIntensity: f32;
	var colorRamp: texture_2d<f32>;
	var colorRampSampler: sampler;
#endif
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
	var output: VertexOutput;
	var source: SplatSource;
	if (!initSource(&source)) {
		output.position = discardVec;
		return output;
	}
	var modelCenter: vec3f = getCenter();
	var center: SplatCenter;
	center.modelCenterOriginal = modelCenter;
	
	modifySplatCenter(&modelCenter);
	center.modelCenterModified = modelCenter;
	if (!initCenter(modelCenter, &center)) {
		output.position = discardVec;
		return output;
	}
	var corner: SplatCorner;
	if (!initCorner(&source, &center, &corner)) {
		output.position = discardVec;
		return output;
	}
	var clr: half4 = half4(getColor());
	#if GSPLAT_AA
		clr.a = clr.a * corner.aaFactor;
	#endif
	#if SH_BANDS > 0
		let modelView3x3 = mat3x3f(center.modelView[0].xyz, center.modelView[1].xyz, center.modelView[2].xyz);
		let dir = normalize(center.view * modelView3x3);
		var sh: array<half3, SH_COEFFS>;
		var scale: f32;
		readSHData(&sh, &scale);
		clr = half4(clr.xyz + evalSH(&sh, dir) * half(scale), clr.a);
	#endif
	var clrF32 = vec4f(clr);
	modifySplatColor(modelCenter, &clrF32);
	clr = half4(clrF32);
	if (half(255.0) * clr.w <= half(1.0)) {
		output.position = discardVec;
		return output;
	}
	clipCorner(&corner, clr.w);
	#if GSPLAT_2DGS
		let modelCorner: vec3f = center.modelCenterModified + corner.offset;
		output.position = uniform.matrix_projection * center.modelView * vec4f(modelCorner, 1.0);
	#else
		output.position = center.proj + vec4f(corner.offset.xyz, 0.0);
	#endif
	output.gaussianUV = corner.uv;
	#ifdef GSPLAT_OVERDRAW
		let t: f32 = clamp(center.modelCenterOriginal.y / 20.0, 0.0, 1.0);
		let rampColor: vec3f = textureSampleLevel(colorRamp, colorRampSampler, vec2f(t, 0.5), 0.0).rgb;
		clr.a = clr.a * half(1.0 / 32.0) * half(uniform.colorRampIntensity);
		output.gaussianColor = half4(half3(rampColor), clr.a);
	#else
		output.gaussianColor = half4(half3(prepareOutputFromGamma(max(vec3f(clr.xyz), vec3f(0.0)))), clr.w);
	#endif
	#ifndef DITHER_NONE
		output.id = f32(splat.index);
	#endif
	#ifdef PREPASS_PASS
		output.vLinearDepth = -center.view.z;
	#endif
	#if defined(GSPLAT_UNIFIED_ID) && defined(PICK_PASS)
		output.vPickId = loadPcId().r;
	#endif
	return output;
}
`

var gsplatFormatVS = `
uniform splatTextureSize: u32;
`

var gsplatUncompressedVS = `
var<private> tAw: u32;
var<private> tBcached: vec4f;
fn unpackRotation(packed: vec3f) -> vec4f {
	return vec4f(packed.xyz, sqrt(max(0.0, 1.0 - dot(packed, packed))));
}
fn getCenter() -> vec3f {
	let tA: vec4<u32> = loadTransformA();
	tAw = tA.w;
	tBcached = loadTransformB();
	return bitcast<vec3f>(tA.xyz);
}
fn getColor() -> vec4f {
	return loadSplatColor();
}
fn getRotation() -> vec4f {
	return unpackRotation(vec3f(unpack2x16float(tAw), tBcached.w)).wxyz;
}
fn getScale() -> vec3f {
	return tBcached.xyz;
}
#include "gsplatUncompressedSHVS"
`

var gsplatUncompressedSHVS = `
#if SH_BANDS > 0
fn unpack111011s(bits: u32) -> vec3f {
	return (vec3f((vec3<u32>(bits) >> vec3<u32>(21u, 11u, 0u)) & vec3<u32>(0x7ffu, 0x3ffu, 0x7ffu)) / vec3f(2047.0, 1023.0, 2047.0)) * 2.0 - 1.0;
}
struct ScaleAndSH {
	scale: f32,
	a: vec3f,
	b: vec3f,
	c: vec3f
};
fn fetchScale(t_in: vec4<u32>) -> ScaleAndSH {
	var result: ScaleAndSH;
	result.scale = bitcast<f32>(t_in.x);
	result.a = unpack111011s(t_in.y);
	result.b = unpack111011s(t_in.z);
	result.c = unpack111011s(t_in.w);
	return result;
}
struct SH {
	a: vec3f,
	b: vec3f,
	c: vec3f,
	d: vec3f
};
fn fetch4(t_in: vec4<u32>) -> SH {
	var result: SH;
	result.a = unpack111011s(t_in.x);
	result.b = unpack111011s(t_in.y);
	result.c = unpack111011s(t_in.z);
	result.d = unpack111011s(t_in.w);
	return result;
}
fn fetch1(t_in: u32) -> vec3f {
	return unpack111011s(t_in);
}
#if SH_BANDS == 1
	fn readSHData(sh: ptr<function, array<half3, 3>>, scale: ptr<function, f32>) {
		let result = fetchScale(loadSplatSH_1to3());
		*scale = result.scale;
		sh[0] = half3(result.a);
		sh[1] = half3(result.b);
		sh[2] = half3(result.c);
	}
#elif SH_BANDS == 2
	fn readSHData(sh: ptr<function, array<half3, 8>>, scale: ptr<function, f32>) {
		let first: ScaleAndSH = fetchScale(loadSplatSH_1to3());
		*scale = first.scale;
		sh[0] = half3(first.a);
		sh[1] = half3(first.b);
		sh[2] = half3(first.c);
		let second: SH = fetch4(loadSplatSH_4to7());
		sh[3] = half3(second.a);
		sh[4] = half3(second.b);
		sh[5] = half3(second.c);
		sh[6] = half3(second.d);
		sh[7] = half3(fetch1(loadSplatSH_8to11().x));
	}
#else
	fn readSHData(sh: ptr<function, array<half3, 15>>, scale: ptr<function, f32>) {
		let first: ScaleAndSH = fetchScale(loadSplatSH_1to3());
		*scale = first.scale;
		sh[0] = half3(first.a);
		sh[1] = half3(first.b);
		sh[2] = half3(first.c);
		let second: SH = fetch4(loadSplatSH_4to7());
		sh[3] = half3(second.a);
		sh[4] = half3(second.b);
		sh[5] = half3(second.c);
		sh[6] = half3(second.d);
		let third: SH = fetch4(loadSplatSH_8to11());
		sh[7] = half3(third.a);
		sh[8] = half3(third.b);
		sh[9] = half3(third.c);
		sh[10] = half3(third.d);
		let fourth: SH = fetch4(loadSplatSH_12to15());
		sh[11] = half3(fourth.a);
		sh[12] = half3(fourth.b);
		sh[13] = half3(fourth.c);
		sh[14] = half3(fourth.d);
	}
#endif
#endif
`

var gsplatCompressedVS = `
#include "gsplatPackingPS"
var chunkTexture: texture_2d<f32>;
var<private> chunkDataA: vec4f;
var<private> chunkDataB: vec4f;
var<private> chunkDataC: vec4f;
var<private> chunkDataD: vec4f;
var<private> chunkDataE: vec4f;
var<private> packedData: vec4u;
fn unpack111011(bits: u32) -> vec3f {
	return (vec3f((vec3<u32>(bits) >> vec3<u32>(21u, 11u, 0u)) & vec3<u32>(0x7ffu, 0x3ffu, 0x7ffu))) / vec3f(2047.0, 1023.0, 2047.0);
}
const norm_const: f32 = sqrt(2.0);
fn unpackRotation(bits: u32) -> vec4f {
	let a = (f32((bits >> 20u) & 0x3ffu) / 1023.0 - 0.5) * norm_const;
	let b = (f32((bits >> 10u) & 0x3ffu) / 1023.0 - 0.5) * norm_const;
	let c = (f32(bits & 0x3ffu) / 1023.0 - 0.5) * norm_const;
	let m = sqrt(1.0 - (a * a + b * b + c * c));
	let mode = bits >> 30u;
	if (mode == 0u) { return vec4f(m, a, b, c); }
	if (mode == 1u) { return vec4f(a, m, b, c); }
	if (mode == 2u) { return vec4f(a, b, m, c); }
	return vec4f(a, b, c, m);
}
fn getCenter() -> vec3f {
	let tex_size_u = textureDimensions(chunkTexture, 0);
	let w: u32 = tex_size_u.x / 5u;
	let chunkId: u32 = splat.index / 256u;
	let chunkUV: vec2<i32> = vec2<i32>(i32((chunkId % w) * 5u), i32(chunkId / w));
	chunkDataA = textureLoad(chunkTexture, chunkUV + vec2<i32>(0, 0), 0);
	chunkDataB = textureLoad(chunkTexture, chunkUV + vec2<i32>(1, 0), 0);
	chunkDataC = textureLoad(chunkTexture, chunkUV + vec2<i32>(2, 0), 0);
	chunkDataD = textureLoad(chunkTexture, chunkUV + vec2<i32>(3, 0), 0);
	chunkDataE = textureLoad(chunkTexture, chunkUV + vec2<i32>(4, 0), 0);
	packedData = loadPackedTexture();
	return mix(chunkDataA.xyz, vec3f(chunkDataA.w, chunkDataB.xy), unpack111011(packedData.x));
}
fn getColor() -> vec4f {
	let r = unpack8888(packedData.w);
	return vec4f(mix(chunkDataD.xyz, vec3f(chunkDataD.w, chunkDataE.xy), r.rgb), r.w);
}
fn getRotation() -> vec4f {
	return unpackRotation(packedData.y);
}
fn getScale() -> vec3f {
	return exp(mix(vec3f(chunkDataB.zw, chunkDataC.x), chunkDataC.yzw, unpack111011(packedData.z)));
}
#include "gsplatCompressedSHVS"
`

var gsplatCompressedSHVS = `
#if SH_BANDS > 0
fn unpack8888s(bits: u32) -> half4 {
	let unpacked_u = (vec4<u32>(bits) >> vec4<u32>(0u, 8u, 16u, 24u)) & vec4<u32>(0xffu);
	return half4(vec4f(unpacked_u) * (8.0 / 255.0) - 4.0);
}
fn readSHData(sh: ptr<function, array<half3, 15>>, scale: ptr<function, f32>) {
	let shData0: vec4<u32> = loadShTexture0();
	let shData1: vec4<u32> = loadShTexture1();
	let shData2: vec4<u32> = loadShTexture2();
	let r0: half4 = unpack8888s(shData0.x);
	let r1: half4 = unpack8888s(shData0.y);
	let r2: half4 = unpack8888s(shData0.z);
	let r3: half4 = unpack8888s(shData0.w);
	let g0: half4 = unpack8888s(shData1.x);
	let g1: half4 = unpack8888s(shData1.y);
	let g2: half4 = unpack8888s(shData1.z);
	let g3: half4 = unpack8888s(shData1.w);
	let b0: half4 = unpack8888s(shData2.x);
	let b1: half4 = unpack8888s(shData2.y);
	let b2: half4 = unpack8888s(shData2.z);
	let b3: half4 = unpack8888s(shData2.w);
	sh[0] =  half3(r0.x, g0.x, b0.x);
	sh[1] =  half3(r0.y, g0.y, b0.y);
	sh[2] =  half3(r0.z, g0.z, b0.z);
	sh[3] =  half3(r0.w, g0.w, b0.w);
	sh[4] =  half3(r1.x, g1.x, b1.x);
	sh[5] =  half3(r1.y, g1.y, b1.y);
	sh[6] =  half3(r1.z, g1.z, b1.z);
	sh[7] =  half3(r1.w, g1.w, b1.w);
	sh[8] =  half3(r2.x, g2.x, b2.x);
	sh[9] =  half3(r2.y, g2.y, b2.y);
	sh[10] = half3(r2.z, g2.z, b2.z);
	sh[11] = half3(r2.w, g2.w, b2.w);
	sh[12] = half3(r3.x, g3.x, b3.x);
	sh[13] = half3(r3.y, g3.y, b3.y);
	sh[14] = half3(r3.z, g3.z, b3.z);
	*scale = 1.0;
}
#endif
`

var gsplatSogVS = `
#include "gsplatPackingPS"
uniform means_mins: vec3f;
uniform means_maxs: vec3f;
uniform scales_mins: f32;
uniform scales_maxs: f32;
uniform sh0_mins: f32;
uniform sh0_maxs: f32;
var packedSh0: texture_2d<f32>;
const SH_C0: f32 = 0.28209479177387814;
var<private> packedSample: vec4<u32>;
const norm: f32 = sqrt(2.0);
fn getCenter() -> vec3f {
	packedSample = loadPackedTexture();
	let l = unpack8888(packedSample.x).xyz;
	let u = unpack8888(packedSample.y).xyz;
	let n = (l + u * 256.0) / 257.0;
	let v = mix(uniform.means_mins, uniform.means_maxs, n);
	return sign(v) * (exp(abs(v)) - 1.0);
}
fn getColor() -> vec4f {
	let clr = mix(half3(half(uniform.sh0_mins)), half3(half(uniform.sh0_maxs)), half3(unpack111110(pack8888(textureLoad(packedSh0, splat.uv, 0)))));
	let alpha = half(f32(packedSample.z & 0xffu) / 255.0);
	return vec4f(half4(half3(0.5) + clr * half(SH_C0), alpha));
}
fn getRotation() -> vec4f {
	let qdata = unpack8888(packedSample.z).xyz;
	let qmode = packedSample.w & 0x3u;
	let abc = (qdata - 0.5) * norm;
	let d = sqrt(max(0.0, 1.0 - dot(abc, abc)));
	var quat: vec4f;
	if (qmode == 0u) {
		quat = vec4f(d, abc);
	} else if (qmode == 1u) {
		quat = vec4f(abc.x, d, abc.y, abc.z);
	} else if (qmode == 2u) {
		quat = vec4f(abc.x, abc.y, d, abc.z);
	} else {
		quat = vec4f(abc.x, abc.y, abc.z, d);
	}
	return quat;
}
fn getScale() -> vec3f {
	let sdata = unpack101010(packedSample.w >> 2u);
	return exp(mix(vec3f(uniform.scales_mins), vec3f(uniform.scales_maxs), sdata));
}
#include "gsplatSogSHVS"
`

var gsplatSogSHVS = `
#if SH_BANDS > 0
var packedShN: texture_2d<f32>;
uniform shN_mins: f32;
uniform shN_maxs: f32;
fn readSHTexel(u: i32, v: i32) -> half3 {
	return mix(half3(half(uniform.shN_mins)), half3(half(uniform.shN_maxs)), half3(unpack111110(pack8888(textureLoad(packedShN, vec2i(u, v), 0)))));
}
fn readSHData(sh: ptr<function, array<half3, SH_COEFFS>>, scale: ptr<function, f32>) {
	let t = vec2i(packedSample.xy & vec2u(255u));
	let n = t.x + t.y * 256;
	let u = (n % 64) * SH_COEFFS;
	let v = n / 64;
	sh[0] = readSHTexel(u, v);
	sh[1] = readSHTexel(u + 1, v);
	sh[2] = readSHTexel(u + 2, v);
	#if SH_BANDS > 1
		sh[3] = readSHTexel(u + 3, v);
		sh[4] = readSHTexel(u + 4, v);
		sh[5] = readSHTexel(u + 5, v);
		sh[6] = readSHTexel(u + 6, v);
		sh[7] = readSHTexel(u + 7, v);
	#endif
	#if SH_BANDS > 2
		sh[8]  = readSHTexel(u + 8, v);
		sh[9]  = readSHTexel(u + 9, v);
		sh[10] = readSHTexel(u + 10, v);
		sh[11] = readSHTexel(u + 11, v);
		sh[12] = readSHTexel(u + 12, v);
		sh[13] = readSHTexel(u + 13, v);
		sh[14] = readSHTexel(u + 14, v);
	#endif
	*scale = 1.0;
}
#endif
`

var gsplatContainerDeclVS = `
#include "gsplatContainerDeclarationsVS"
var<private> splatCenter: vec3f;
var<private> splatColor: vec4f;
var<private> splatScale: vec3f;
var<private> splatRotation: vec4f;
`

var gsplatContainerReadVS = `
fn getCenter() -> vec3f {
	#include "gsplatContainerUserReadVS"
	return splatCenter;
}
fn getRotation() -> vec4f {
	return splatRotation;
}
fn getScale() -> vec3f {
	return splatScale;
}
fn getColor() -> vec4f {
	return splatColor;
}
`

const gsplatChunksWGSL = {
    gsplatCenterVS,
    gsplatCornerVS,
    gsplatCommonVS,
    gsplatSplatVS,
    gsplatEvalSHVS,
    gsplatHelpersVS,
    gsplatModifyVS,
    gsplatStructsVS,
    gsplatQuatToMat3VS,
    gsplatOutputVS,
    gsplatPS,
    gsplatSourceVS,
    gsplatVS,
    gsplatPackingPS,
    gsplatFormatVS,
    gsplatUncompressedVS,
    gsplatUncompressedSHVS,
    gsplatCompressedVS,
    gsplatCompressedSHVS,
    gsplatSogVS,
    gsplatSogSHVS,
    gsplatContainerDeclVS,
    gsplatContainerReadVS,
    gsplatContainerFloatReadVS,
}

const _schema = ['enabled']
const _properties = [
    'unified',
    'lodBaseDistance',
    'lodMultiplier',
    'castShadows',
    'material',
    'highQualitySH',
    'asset',
    'resource',
    'layers',
]
class GSplatComponentSystem extends ComponentSystem {
    initializeComponentData(component, _data, properties) {
        if (_data.layers && _data.layers.length) {
            _data.layers = _data.layers.slice(0)
        }
        for (let i = 0; i < _properties.length; i++) {
            if (_data.hasOwnProperty(_properties[i])) {
                component[_properties[i]] = _data[_properties[i]]
            }
        }
        if (_data.aabbCenter && _data.aabbHalfExtents) {
            component.customAabb = new BoundingBox(new Vec3(_data.aabbCenter), new Vec3(_data.aabbHalfExtents))
        }
        super.initializeComponentData(component, _data, _schema)
    }
    cloneComponent(entity, clone) {
        const gSplatComponent = entity.gsplat
        const data = {}
        _properties.forEach((prop) => {
            if (prop === 'material') {
                if (!gSplatComponent.unified) {
                    const srcMaterial = gSplatComponent[prop]
                    if (srcMaterial) {
                        data[prop] = srcMaterial.clone()
                    }
                }
            } else {
                data[prop] = gSplatComponent[prop]
            }
        })
        data.enabled = gSplatComponent.enabled
        const component = this.addComponent(clone, data)
        component.customAabb = gSplatComponent.customAabb?.clone() ?? null
        return component
    }
    onRemove(entity, component) {
        component.onRemove()
    }
    getMaterial(camera, layer) {
        const director = this.app.renderer.gsplatDirector
        if (!director) return null
        const cameraData = director.camerasMap.get(camera)
        if (!cameraData) return null
        const layerData = cameraData.layersMap.get(layer)
        return layerData?.gsplatManager?.material ?? null
    }
    getGSplatMaterial(camera, layer) {
        return this.getMaterial(camera, layer)
    }
    constructor(app) {
        super(app)
        this.id = 'gsplat'
        this.ComponentType = GSplatComponent
        this.DataType = GSplatComponentData
        this.schema = _schema
        app.renderer.gsplatDirector = new GSplatDirector(app.graphicsDevice, app.renderer, app.scene, this)
        ShaderChunks.get(app.graphicsDevice, SHADERLANGUAGE_GLSL).add(gsplatChunksGLSL)
        ShaderChunks.get(app.graphicsDevice, SHADERLANGUAGE_WGSL).add(gsplatChunksWGSL)
        this.on('beforeremove', this.onRemove, this)
    }
}
GSplatComponentSystem.EVENT_MATERIALCREATED = 'material:created'
GSplatComponentSystem.EVENT_FRAMEREADY = 'frame:ready'
Component._buildAccessors(GSplatComponent.prototype, _schema)

class Render extends EventHandler {
    set meshes(value) {
        this.decRefMeshes()
        this._meshes = value
        this.incRefMeshes()
        this.fire('set:meshes', value)
    }
    get meshes() {
        return this._meshes
    }
    destroy() {
        this.meshes = null
    }
    decRefMeshes() {
        this._meshes?.forEach((mesh, index) => {
            if (mesh) {
                mesh.decRefCount()
                if (mesh.refCount < 1) {
                    mesh.destroy()
                    this._meshes[index] = null
                }
            }
        })
    }
    incRefMeshes() {
        this._meshes?.forEach((mesh) => {
            mesh?.incRefCount()
        })
    }
    constructor(...args) {
        ;(super(...args), (this._meshes = null))
    }
}
Render.EVENT_SETMESHES = 'set:meshes'

class AnimCurve {
    get paths() {
        return this._paths
    }
    get input() {
        return this._input
    }
    get output() {
        return this._output
    }
    get interpolation() {
        return this._interpolation
    }
    constructor(paths, input, output, interpolation) {
        this._paths = paths
        this._input = input
        this._output = output
        this._interpolation = interpolation
    }
}

class AnimData {
    get components() {
        return this._components
    }
    get data() {
        return this._data
    }
    constructor(components, data) {
        this._components = components
        this._data = data
    }
}

function DracoWorker(jsUrl, wasmUrl) {
    let draco
    const POSITION_ATTRIBUTE = 0
    const NORMAL_ATTRIBUTE = 1
    const wrap = (typedArray, dataType) => {
        switch (dataType) {
            case draco.DT_INT8:
                return new Int8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
            case draco.DT_INT16:
                return new Int16Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength / 2)
            case draco.DT_INT32:
                return new Int32Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength / 4)
            case draco.DT_UINT8:
                return new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
            case draco.DT_UINT16:
                return new Uint16Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength / 2)
            case draco.DT_UINT32:
                return new Uint32Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength / 4)
            case draco.DT_FLOAT32:
                return new Float32Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength / 4)
        }
        return null
    }
    const componentSizeInBytes = (dataType) => {
        switch (dataType) {
            case draco.DT_INT8:
                return 1
            case draco.DT_INT16:
                return 2
            case draco.DT_INT32:
                return 4
            case draco.DT_UINT8:
                return 1
            case draco.DT_UINT16:
                return 2
            case draco.DT_UINT32:
                return 4
            case draco.DT_FLOAT32:
                return 4
        }
        return 1
    }
    const toEngineDataType = (dataType) => {
        switch (dataType) {
            case draco.DT_INT8:
                return 0
            case draco.DT_UINT8:
                return 1
            case draco.DT_INT16:
                return 2
            case draco.DT_UINT16:
                return 3
            case draco.DT_INT32:
                return 4
            case draco.DT_UINT32:
                return 5
            case draco.DT_FLOAT32:
                return 6
            default:
                return 6
        }
    }
    const attributeSizeInBytes = (attribute) => {
        return attribute.num_components() * componentSizeInBytes(attribute.data_type())
    }
    const attributeOrder = {
        0: 0,
        1: 1,
        5: 2,
        2: 3,
        7: 4,
        8: 5,
        4: 6,
        3: 7,
    }
    const generateNormals = (vertices, indices) => {
        const subtract = (dst, a, b) => {
            dst[0] = a[0] - b[0]
            dst[1] = a[1] - b[1]
            dst[2] = a[2] - b[2]
        }
        const cross = (dst, a, b) => {
            dst[0] = a[1] * b[2] - b[1] * a[2]
            dst[1] = a[2] * b[0] - b[2] * a[0]
            dst[2] = a[0] * b[1] - b[0] * a[1]
        }
        const normalize = (dst, offset) => {
            const a = dst[offset + 0]
            const b = dst[offset + 1]
            const c = dst[offset + 2]
            const l = 1.0 / Math.sqrt(a * a + b * b + c * c)
            dst[offset + 0] *= l
            dst[offset + 1] *= l
            dst[offset + 2] *= l
        }
        const copy = (dst, src, srcOffset) => {
            for (let i = 0; i < 3; ++i) {
                dst[i] = src[srcOffset + i]
            }
        }
        const numTriangles = indices.length / 3
        const numVertices = vertices.length / 3
        const result = new Float32Array(vertices.length)
        const a = [0, 0, 0],
            b = [0, 0, 0],
            c = [0, 0, 0],
            t1 = [0, 0, 0],
            t2 = [0, 0, 0],
            n = [0, 0, 0]
        for (let i = 0; i < numTriangles; ++i) {
            const v0 = indices[i * 3 + 0] * 3
            const v1 = indices[i * 3 + 1] * 3
            const v2 = indices[i * 3 + 2] * 3
            copy(a, vertices, v0)
            copy(b, vertices, v1)
            copy(c, vertices, v2)
            subtract(t1, b, a)
            subtract(t2, c, a)
            cross(n, t1, t2)
            normalize(n, 0)
            for (let j = 0; j < 3; ++j) {
                result[v0 + j] += n[j]
                result[v1 + j] += n[j]
                result[v2 + j] += n[j]
            }
        }
        for (let i = 0; i < numVertices; ++i) {
            normalize(result, i * 3)
        }
        return new Uint8Array(result.buffer)
    }
    const decodeMesh = (inputBuffer) => {
        const result = {}
        const buffer = new draco.DecoderBuffer()
        buffer.Init(inputBuffer, inputBuffer.length)
        const decoder = new draco.Decoder()
        if (decoder.GetEncodedGeometryType(buffer) !== draco.TRIANGULAR_MESH) {
            result.error = 'Failed to decode draco mesh: not a mesh'
            return result
        }
        const mesh = new draco.Mesh()
        const status = decoder.DecodeBufferToMesh(buffer, mesh)
        if (!status || !status.ok() || draco.getPointer(mesh) === 0) {
            result.error = 'Failed to decode draco asset'
            return result
        }
        const numIndices = mesh.num_faces() * 3
        const shortIndices = mesh.num_points() <= 65535
        const indicesSize = numIndices * (shortIndices ? 2 : 4)
        const indicesPtr = draco._malloc(indicesSize)
        if (shortIndices) {
            decoder.GetTrianglesUInt16Array(mesh, indicesSize, indicesPtr)
            result.indices = new Uint16Array(draco.HEAPU16.buffer, indicesPtr, numIndices).slice().buffer
        } else {
            decoder.GetTrianglesUInt32Array(mesh, indicesSize, indicesPtr)
            result.indices = new Uint32Array(draco.HEAPU32.buffer, indicesPtr, numIndices).slice().buffer
        }
        draco._free(indicesPtr)
        const attributes = []
        for (let i = 0; i < mesh.num_attributes(); ++i) {
            attributes.push(decoder.GetAttribute(mesh, i))
        }
        attributes.sort((a, b) => {
            return (
                (attributeOrder[a.attribute_type()] ?? attributeOrder.length) -
                (attributeOrder[b.attribute_type()] ?? attributeOrder.length)
            )
        })
        let totalVertexSize = 0
        const offsets = attributes.map((a) => {
            const offset = totalVertexSize
            totalVertexSize += Math.ceil(attributeSizeInBytes(a) / 4) * 4
            return offset
        })
        const hasNormals = attributes.some((a) => a.attribute_type() === NORMAL_ATTRIBUTE)
        let normalOffset = offsets[1] ?? 0
        if (!hasNormals) {
            normalOffset = offsets[0] + Math.ceil(attributeSizeInBytes(attributes[0]) / 4) * 4
            for (let i = 1; i < offsets.length; ++i) {
                offsets[i] += 12
            }
            totalVertexSize += 12
        }
        result.attributes = attributes.map((a, i) => ({
            id: a.unique_id(),
            dataType: toEngineDataType(a.data_type()),
            numComponents: a.num_components(),
            offset: offsets[i],
        }))
        if (!hasNormals) {
            result.attributes.splice(1, 0, {
                id: -1,
                dataType: 6,
                numComponents: 3,
                offset: normalOffset,
            })
        }
        result.stride = totalVertexSize
        result.vertices = new ArrayBuffer(mesh.num_points() * totalVertexSize)
        const dst = new Uint8Array(result.vertices)
        for (let i = 0; i < mesh.num_attributes(); ++i) {
            const attribute = attributes[i]
            const sizeInBytes = attributeSizeInBytes(attribute)
            const ptrSize = mesh.num_points() * sizeInBytes
            const ptr = draco._malloc(ptrSize)
            decoder.GetAttributeDataArrayForAllPoints(mesh, attribute, attribute.data_type(), ptrSize, ptr)
            const src = new Uint8Array(draco.HEAPU8.buffer, ptr, ptrSize)
            for (let j = 0; j < mesh.num_points(); ++j) {
                for (let c = 0; c < sizeInBytes; ++c) {
                    dst[j * totalVertexSize + offsets[i] + c] = src[j * sizeInBytes + c]
                }
            }
            if (!hasNormals && attribute.attribute_type() === POSITION_ATTRIBUTE) {
                const normals = generateNormals(
                    wrap(src, attribute.data_type()),
                    shortIndices ? new Uint16Array(result.indices) : new Uint32Array(result.indices),
                )
                for (let j = 0; j < mesh.num_points(); ++j) {
                    for (let c = 0; c < 12; ++c) {
                        dst[j * totalVertexSize + normalOffset + c] = normals[j * 12 + c]
                    }
                }
            }
            draco._free(ptr)
        }
        draco.destroy(mesh)
        draco.destroy(decoder)
        draco.destroy(buffer)
        return result
    }
    const decode = (data) => {
        const result = decodeMesh(new Uint8Array(data.buffer))
        self.postMessage(
            {
                jobId: data.jobId,
                error: result.error,
                indices: result.indices,
                vertices: result.vertices,
                attributes: result.attributes,
                stride: result.stride,
            },
            [result.indices, result.vertices].filter((t) => t != null),
        )
    }
    const workQueue = []
    self.onmessage = (message) => {
        const data = message.data
        switch (data.type) {
            case 'init':
                self.DracoDecoderModule({
                    instantiateWasm: (imports, successCallback) => {
                        WebAssembly.instantiate(data.module, imports)
                            .then((result) => successCallback(result))
                            .catch((reason) => console.error(`instantiate failed + ${reason}`))
                        return {}
                    },
                }).then((instance) => {
                    draco = instance
                    workQueue.forEach((data) => decode(data))
                })
                break
            case 'decodeMesh':
                if (draco) {
                    decode(data)
                } else {
                    workQueue.push(data)
                }
                break
        }
    }
}

const downloadMaxRetries = 3
class JobQueue {
    init(workers) {
        workers.forEach((worker) => {
            worker.addEventListener('message', (message) => {
                const data = message.data
                const callback = this.jobCallbacks.get(data.jobId)
                if (callback) {
                    callback(data.error, {
                        indices: data.indices,
                        vertices: data.vertices,
                        attributes: data.attributes,
                        stride: data.stride,
                    })
                }
                this.jobCallbacks.delete(data.jobId)
                if (this.jobQueue.length > 0) {
                    const job = this.jobQueue.shift()
                    this.run(worker, job)
                } else {
                    const index2 = this.workers[2].indexOf(worker)
                    if (index2 !== -1) {
                        this.workers[2].splice(index2, 1)
                        this.workers[1].push(worker)
                    } else {
                        const index1 = this.workers[1].indexOf(worker)
                        if (index1 !== -1) {
                            this.workers[1].splice(index1, 1)
                            this.workers[0].push(worker)
                        }
                    }
                }
            })
        })
        this.workers[0] = workers
        while (this.jobQueue.length && (this.workers[0].length || this.workers[1].length)) {
            const job = this.jobQueue.shift()
            if (this.workers[0].length > 0) {
                const worker = this.workers[0].shift()
                this.workers[1].push(worker)
                this.run(worker, job)
            } else {
                const worker = this.workers[1].shift()
                this.workers[2].push(worker)
                this.run(worker, job)
            }
        }
    }
    enqueueJob(buffer, callback) {
        const job = {
            jobId: this.jobId++,
            buffer: buffer,
        }
        this.jobCallbacks.set(job.jobId, callback)
        if (this.workers[0].length > 0) {
            const worker = this.workers[0].shift()
            this.workers[1].push(worker)
            this.run(worker, job)
        } else if (this.workers[1].length > 0) {
            const worker = this.workers[1].shift()
            this.workers[2].push(worker)
            this.run(worker, job)
        } else {
            this.jobQueue.push(job)
        }
    }
    constructor() {
        this.workers = [[], [], []]
        this.jobId = 0
        this.jobQueue = []
        this.jobCallbacks = new Map()
        this.run = (worker, job) => {
            worker.postMessage(
                {
                    type: 'decodeMesh',
                    jobId: job.jobId,
                    buffer: job.buffer,
                },
                [job.buffer],
            )
        }
    }
}
const downloadScript = (url) => {
    return new Promise((resolve, reject) => {
        const options = {
            cache: true,
            responseType: 'text',
            retry: downloadMaxRetries > 0,
            maxRetries: downloadMaxRetries,
        }
        http.get(url, options, (err, response) => {
            if (err) {
                reject(err)
            } else {
                resolve(response)
            }
        })
    })
}
const compileModule = (url) => {
    const compileManual = () => {
        return fetch(url)
            .then((result) => result.arrayBuffer())
            .then((buffer) => WebAssembly.compile(buffer))
    }
    const compileStreaming = () => {
        return WebAssembly.compileStreaming(fetch(url)).catch((err) => {
            return compileManual()
        })
    }
    return WebAssembly.compileStreaming ? compileStreaming() : compileManual()
}
const defaultNumWorkers$1 = 1
let jobQueue
const initializeWorkers = (config) => {
    if (jobQueue) {
        return true
    }
    if (!config) {
        {
            const moduleConfig = WasmModule.getConfig('DracoDecoderModule')
            if (moduleConfig) {
                config = {
                    jsUrl: moduleConfig.glueUrl,
                    wasmUrl: moduleConfig.wasmUrl,
                    numWorkers: moduleConfig.numWorkers,
                }
            } else {
                config = {
                    jsUrl: 'draco.wasm.js',
                    wasmUrl: 'draco.wasm.wasm',
                    numWorkers: defaultNumWorkers$1,
                }
            }
        }
    }
    if (!config.jsUrl || !config.wasmUrl) {
        return false
    }
    jobQueue = new JobQueue()
    Promise.all([downloadScript(config.jsUrl), compileModule(config.wasmUrl)]).then(([dracoSource, dracoModule]) => {
        const code = ['/* draco */', dracoSource, '/* worker */', `(\n${DracoWorker.toString()}\n)()\n\n`].join('\n')
        const blob = new Blob([code], {
            type: 'application/javascript',
        })
        const workerUrl = URL.createObjectURL(blob)
        const numWorkers = Math.max(1, Math.min(16, config.numWorkers || defaultNumWorkers$1))
        const workers = []
        for (let i = 0; i < numWorkers; ++i) {
            const worker = new Worker(workerUrl)
            worker.postMessage({
                type: 'init',
                module: dracoModule,
            })
            workers.push(worker)
        }
        jobQueue.init(workers)
    })
    return true
}
const dracoDecode = (buffer, callback) => {
    if (!initializeWorkers()) {
        return false
    }
    jobQueue.enqueueJob(buffer, callback)
    return true
}

class GlbResources {
    destroy() {
        if (this.renders) {
            this.renders.forEach((render) => {
                render.meshes = null
            })
        }
    }
}
const isDataURI = (uri) => {
    return /^data:[^\n\r,\u2028\u2029]*,.*$/i.test(uri)
}
const getDataURIMimeType = (uri) => {
    return uri.substring(uri.indexOf(':') + 1, uri.indexOf(';'))
}
const getNumComponents = (accessorType) => {
    switch (accessorType) {
        case 'SCALAR':
            return 1
        case 'VEC2':
            return 2
        case 'VEC3':
            return 3
        case 'VEC4':
            return 4
        case 'MAT2':
            return 4
        case 'MAT3':
            return 9
        case 'MAT4':
            return 16
        default:
            return 3
    }
}
const getComponentType = (componentType) => {
    switch (componentType) {
        case 5120:
            return TYPE_INT8
        case 5121:
            return TYPE_UINT8
        case 5122:
            return TYPE_INT16
        case 5123:
            return TYPE_UINT16
        case 5124:
            return TYPE_INT32
        case 5125:
            return TYPE_UINT32
        case 5126:
            return TYPE_FLOAT32
        default:
            return 0
    }
}
const getComponentSizeInBytes = (componentType) => {
    switch (componentType) {
        case 5120:
            return 1
        case 5121:
            return 1
        case 5122:
            return 2
        case 5123:
            return 2
        case 5124:
            return 4
        case 5125:
            return 4
        case 5126:
            return 4
        default:
            return 0
    }
}
const getComponentDataType = (componentType) => {
    switch (componentType) {
        case 5120:
            return Int8Array
        case 5121:
            return Uint8Array
        case 5122:
            return Int16Array
        case 5123:
            return Uint16Array
        case 5124:
            return Int32Array
        case 5125:
            return Uint32Array
        case 5126:
            return Float32Array
        default:
            return null
    }
}
const gltfToEngineSemanticMap = {
    POSITION: SEMANTIC_POSITION,
    NORMAL: SEMANTIC_NORMAL,
    TANGENT: SEMANTIC_TANGENT,
    COLOR_0: SEMANTIC_COLOR,
    JOINTS_0: SEMANTIC_BLENDINDICES,
    WEIGHTS_0: SEMANTIC_BLENDWEIGHT,
    TEXCOORD_0: SEMANTIC_TEXCOORD0,
    TEXCOORD_1: SEMANTIC_TEXCOORD1,
    TEXCOORD_2: SEMANTIC_TEXCOORD2,
    TEXCOORD_3: SEMANTIC_TEXCOORD3,
    TEXCOORD_4: SEMANTIC_TEXCOORD4,
    TEXCOORD_5: SEMANTIC_TEXCOORD5,
    TEXCOORD_6: SEMANTIC_TEXCOORD6,
    TEXCOORD_7: SEMANTIC_TEXCOORD7,
}
const attributeOrder = {
    [SEMANTIC_POSITION]: 0,
    [SEMANTIC_NORMAL]: 1,
    [SEMANTIC_TANGENT]: 2,
    [SEMANTIC_COLOR]: 3,
    [SEMANTIC_BLENDINDICES]: 4,
    [SEMANTIC_BLENDWEIGHT]: 5,
    [SEMANTIC_TEXCOORD0]: 6,
    [SEMANTIC_TEXCOORD1]: 7,
    [SEMANTIC_TEXCOORD2]: 8,
    [SEMANTIC_TEXCOORD3]: 9,
    [SEMANTIC_TEXCOORD4]: 10,
    [SEMANTIC_TEXCOORD5]: 11,
    [SEMANTIC_TEXCOORD6]: 12,
    [SEMANTIC_TEXCOORD7]: 13,
}
const getDequantizeFunc = (srcType) => {
    switch (srcType) {
        case TYPE_INT8:
            return (x) => Math.max(x / 127.0, -1)
        case TYPE_UINT8:
            return (x) => x / 255.0
        case TYPE_INT16:
            return (x) => Math.max(x / 32767.0, -1)
        case TYPE_UINT16:
            return (x) => x / 65535.0
        default:
            return (x) => x
    }
}
const dequantizeArray = (dstArray, srcArray, srcType) => {
    const convFunc = getDequantizeFunc(srcType)
    const len = srcArray.length
    for (let i = 0; i < len; ++i) {
        dstArray[i] = convFunc(srcArray[i])
    }
    return dstArray
}
const getAccessorData = (gltfAccessor, bufferViews, flatten = false) => {
    const numComponents = getNumComponents(gltfAccessor.type)
    const dataType = getComponentDataType(gltfAccessor.componentType)
    if (!dataType) {
        return null
    }
    let result
    if (gltfAccessor.sparse) {
        const sparse = gltfAccessor.sparse
        const indicesAccessor = {
            count: sparse.count,
            type: 'SCALAR',
        }
        const indices = getAccessorData(Object.assign(indicesAccessor, sparse.indices), bufferViews, true)
        const valuesAccessor = {
            count: sparse.count,
            type: gltfAccessor.type,
            componentType: gltfAccessor.componentType,
        }
        const values = getAccessorData(Object.assign(valuesAccessor, sparse.values), bufferViews, true)
        if (gltfAccessor.hasOwnProperty('bufferView')) {
            const baseAccessor = {
                bufferView: gltfAccessor.bufferView,
                byteOffset: gltfAccessor.byteOffset,
                componentType: gltfAccessor.componentType,
                count: gltfAccessor.count,
                type: gltfAccessor.type,
            }
            result = getAccessorData(baseAccessor, bufferViews, true).slice()
        } else {
            result = new dataType(gltfAccessor.count * numComponents)
        }
        for (let i = 0; i < sparse.count; ++i) {
            const targetIndex = indices[i]
            for (let j = 0; j < numComponents; ++j) {
                result[targetIndex * numComponents + j] = values[i * numComponents + j]
            }
        }
    } else {
        if (gltfAccessor.hasOwnProperty('bufferView')) {
            const bufferView = bufferViews[gltfAccessor.bufferView]
            if (flatten && bufferView.hasOwnProperty('byteStride')) {
                const bytesPerElement = numComponents * dataType.BYTES_PER_ELEMENT
                const storage = new ArrayBuffer(gltfAccessor.count * bytesPerElement)
                const tmpArray = new Uint8Array(storage)
                let dstOffset = 0
                for (let i = 0; i < gltfAccessor.count; ++i) {
                    let srcOffset = (gltfAccessor.byteOffset || 0) + i * bufferView.byteStride
                    for (let b = 0; b < bytesPerElement; ++b) {
                        tmpArray[dstOffset++] = bufferView[srcOffset++]
                    }
                }
                result = new dataType(storage)
            } else {
                result = new dataType(
                    bufferView.buffer,
                    bufferView.byteOffset + (gltfAccessor.byteOffset || 0),
                    gltfAccessor.count * numComponents,
                )
            }
        } else {
            result = new dataType(gltfAccessor.count * numComponents)
        }
    }
    return result
}
const getAccessorDataFloat32 = (gltfAccessor, bufferViews) => {
    const data = getAccessorData(gltfAccessor, bufferViews, true)
    if (data instanceof Float32Array || !gltfAccessor.normalized) {
        return data
    }
    const float32Data = new Float32Array(data.length)
    dequantizeArray(float32Data, data, getComponentType(gltfAccessor.componentType))
    return float32Data
}
const getAccessorBoundingBox = (gltfAccessor) => {
    let min = gltfAccessor.min
    let max = gltfAccessor.max
    if (!min || !max) {
        return null
    }
    if (gltfAccessor.normalized) {
        const ctype = getComponentType(gltfAccessor.componentType)
        min = dequantizeArray([], min, ctype)
        max = dequantizeArray([], max, ctype)
    }
    return new BoundingBox(
        new Vec3((max[0] + min[0]) * 0.5, (max[1] + min[1]) * 0.5, (max[2] + min[2]) * 0.5),
        new Vec3((max[0] - min[0]) * 0.5, (max[1] - min[1]) * 0.5, (max[2] - min[2]) * 0.5),
    )
}
const getPrimitiveType = (primitive) => {
    if (!primitive.hasOwnProperty('mode')) {
        return PRIMITIVE_TRIANGLES
    }
    switch (primitive.mode) {
        case 0:
            return PRIMITIVE_POINTS
        case 1:
            return PRIMITIVE_LINES
        case 2:
            return PRIMITIVE_LINELOOP
        case 3:
            return PRIMITIVE_LINESTRIP
        case 4:
            return PRIMITIVE_TRIANGLES
        case 5:
            return PRIMITIVE_TRISTRIP
        case 6:
            return PRIMITIVE_TRIFAN
        default:
            return PRIMITIVE_TRIANGLES
    }
}
const generateIndices = (numVertices) => {
    const dummyIndices = new Uint16Array(numVertices)
    for (let i = 0; i < numVertices; i++) {
        dummyIndices[i] = i
    }
    return dummyIndices
}
const generateNormals = (sourceDesc, indices) => {
    const p = sourceDesc[SEMANTIC_POSITION]
    if (!p || p.components !== 3) {
        return
    }
    let positions
    if (p.size !== p.stride) {
        const srcStride = p.stride / typedArrayTypesByteSize[p.type]
        const src = new typedArrayTypes[p.type](p.buffer, p.offset, p.count * srcStride)
        positions = new typedArrayTypes[p.type](p.count * 3)
        for (let i = 0; i < p.count; ++i) {
            positions[i * 3 + 0] = src[i * srcStride + 0]
            positions[i * 3 + 1] = src[i * srcStride + 1]
            positions[i * 3 + 2] = src[i * srcStride + 2]
        }
    } else {
        positions = new typedArrayTypes[p.type](p.buffer, p.offset, p.count * 3)
    }
    const numVertices = p.count
    if (!indices) {
        indices = generateIndices(numVertices)
    }
    const normalsTemp = calculateNormals(positions, indices)
    const normals = new Float32Array(normalsTemp.length)
    normals.set(normalsTemp)
    sourceDesc[SEMANTIC_NORMAL] = {
        buffer: normals.buffer,
        size: 12,
        offset: 0,
        stride: 12,
        count: numVertices,
        components: 3,
        type: TYPE_FLOAT32,
    }
}
const cloneTexture = (texture) => {
    const shallowCopyLevels = (texture) => {
        const result = []
        for (let mip = 0; mip < texture._levels.length; ++mip) {
            let level = []
            if (texture.cubemap) {
                for (let face = 0; face < 6; ++face) {
                    level.push(texture._levels[mip][face])
                }
            } else {
                level = texture._levels[mip]
            }
            result.push(level)
        }
        return result
    }
    const result = new Texture(texture.device, texture)
    result._levels = shallowCopyLevels(texture)
    return result
}
const cloneTextureAsset = (src) => {
    const result = new Asset(`${src.name}_clone`, src.type, src.file, src.data, src.options)
    result.loaded = true
    result.resource = cloneTexture(src.resource)
    src.registry.add(result)
    return result
}
const createVertexBufferInternal = (device, sourceDesc) => {
    const positionDesc = sourceDesc[SEMANTIC_POSITION]
    if (!positionDesc) {
        return null
    }
    const numVertices = positionDesc.count
    const vertexDesc = []
    for (const semantic in sourceDesc) {
        if (sourceDesc.hasOwnProperty(semantic)) {
            const element = {
                semantic: semantic,
                components: sourceDesc[semantic].components,
                type: sourceDesc[semantic].type,
                normalize: !!sourceDesc[semantic].normalize,
            }
            if (!VertexFormat.isElementValid(device, element)) {
                element.components++
            }
            vertexDesc.push(element)
        }
    }
    vertexDesc.sort((lhs, rhs) => {
        return attributeOrder[lhs.semantic] - attributeOrder[rhs.semantic]
    })
    let i, j, k
    let source, target, sourceOffset
    const vertexFormat = new VertexFormat(device, vertexDesc)
    let isCorrectlyInterleaved = true
    for (i = 0; i < vertexFormat.elements.length; ++i) {
        target = vertexFormat.elements[i]
        source = sourceDesc[target.name]
        sourceOffset = source.offset - positionDesc.offset
        if (
            source.buffer !== positionDesc.buffer ||
            source.stride !== target.stride ||
            source.size !== target.size ||
            sourceOffset !== target.offset
        ) {
            isCorrectlyInterleaved = false
            break
        }
    }
    const vertexBuffer = new VertexBuffer(device, vertexFormat, numVertices)
    const vertexData = vertexBuffer.lock()
    const targetArray = new Uint32Array(vertexData)
    let sourceArray
    if (isCorrectlyInterleaved) {
        sourceArray = new Uint32Array(
            positionDesc.buffer,
            positionDesc.offset,
            (numVertices * vertexBuffer.format.size) / 4,
        )
        targetArray.set(sourceArray)
    } else {
        let targetStride, sourceStride
        for (i = 0; i < vertexBuffer.format.elements.length; ++i) {
            target = vertexBuffer.format.elements[i]
            targetStride = target.stride / 4
            source = sourceDesc[target.name]
            sourceStride = source.stride / 4
            sourceArray = new Uint32Array(
                source.buffer,
                source.offset,
                (source.count - 1) * sourceStride + (source.size + 3) / 4,
            )
            let src = 0
            let dst = target.offset / 4
            const kend = Math.floor((source.size + 3) / 4)
            for (j = 0; j < numVertices; ++j) {
                for (k = 0; k < kend; ++k) {
                    targetArray[dst + k] = sourceArray[src + k]
                }
                src += sourceStride
                dst += targetStride
            }
        }
    }
    vertexBuffer.unlock()
    return vertexBuffer
}
const createVertexBuffer = (device, attributes, indices, accessors, bufferViews, vertexBufferDict) => {
    const useAttributes = {}
    const attribIds = []
    for (const attrib in attributes) {
        if (attributes.hasOwnProperty(attrib) && gltfToEngineSemanticMap.hasOwnProperty(attrib)) {
            useAttributes[attrib] = attributes[attrib]
            attribIds.push(`${attrib}:${attributes[attrib]}`)
        }
    }
    attribIds.sort()
    const vbKey = attribIds.join()
    let vb = vertexBufferDict[vbKey]
    if (!vb) {
        const sourceDesc = {}
        for (const attrib in useAttributes) {
            const accessor = accessors[attributes[attrib]]
            const accessorData = getAccessorData(accessor, bufferViews)
            const bufferView = bufferViews[accessor.bufferView]
            const semantic = gltfToEngineSemanticMap[attrib]
            const size = getNumComponents(accessor.type) * getComponentSizeInBytes(accessor.componentType)
            const stride = bufferView && bufferView.hasOwnProperty('byteStride') ? bufferView.byteStride : size
            sourceDesc[semantic] = {
                buffer: accessorData.buffer,
                size: size,
                offset: accessorData.byteOffset,
                stride: stride,
                count: accessor.count,
                components: getNumComponents(accessor.type),
                type: getComponentType(accessor.componentType),
                normalize: accessor.normalized,
            }
        }
        if (!sourceDesc.hasOwnProperty(SEMANTIC_NORMAL)) {
            generateNormals(sourceDesc, indices)
        }
        vb = createVertexBufferInternal(device, sourceDesc)
        vertexBufferDict[vbKey] = vb
    }
    return vb
}
const createSkin = (device, gltfSkin, accessors, bufferViews, nodes, glbSkins) => {
    let i, j, bindMatrix
    const joints = gltfSkin.joints
    const numJoints = joints.length
    const ibp = []
    if (gltfSkin.hasOwnProperty('inverseBindMatrices')) {
        const inverseBindMatrices = gltfSkin.inverseBindMatrices
        const ibmData = getAccessorData(accessors[inverseBindMatrices], bufferViews, true)
        const ibmValues = []
        for (i = 0; i < numJoints; i++) {
            for (j = 0; j < 16; j++) {
                ibmValues[j] = ibmData[i * 16 + j]
            }
            bindMatrix = new Mat4()
            bindMatrix.set(ibmValues)
            ibp.push(bindMatrix)
        }
    } else {
        for (i = 0; i < numJoints; i++) {
            bindMatrix = new Mat4()
            ibp.push(bindMatrix)
        }
    }
    const boneNames = []
    for (i = 0; i < numJoints; i++) {
        boneNames[i] = nodes[joints[i]].name
    }
    const key = boneNames.join('#')
    let skin = glbSkins.get(key)
    if (!skin) {
        skin = new Skin(device, ibp, boneNames)
        glbSkins.set(key, skin)
    }
    return skin
}
const createDracoMesh = (device, primitive, accessors, bufferViews, meshVariants, meshDefaultMaterials, promises) => {
    const result = new Mesh(device)
    result.aabb = getAccessorBoundingBox(accessors[primitive.attributes.POSITION])
    promises.push(
        new Promise((resolve, reject) => {
            const dracoExt = primitive.extensions.KHR_draco_mesh_compression
            dracoDecode(bufferViews[dracoExt.bufferView].slice().buffer, (err, decompressedData) => {
                if (err) {
                    console.log(err)
                    reject(err)
                } else {
                    const idToSemantic = {}
                    for (const [name, id] of Object.entries(dracoExt.attributes)) {
                        idToSemantic[id] = gltfToEngineSemanticMap[name]
                    }
                    idToSemantic[-1] = SEMANTIC_NORMAL
                    const vertexDesc = []
                    for (const attr of decompressedData.attributes) {
                        const semantic = idToSemantic[attr.id]
                        if (semantic !== undefined) {
                            let normalize = false
                            if (attr.id !== -1) {
                                for (const [name, id] of Object.entries(dracoExt.attributes)) {
                                    if (id === attr.id && primitive.attributes[name] !== undefined) {
                                        const accessor = accessors[primitive.attributes[name]]
                                        normalize =
                                            accessor.normalized ??
                                            (semantic === SEMANTIC_COLOR &&
                                                (attr.dataType === TYPE_UINT8 || attr.dataType === TYPE_UINT16))
                                        break
                                    }
                                }
                            }
                            vertexDesc.push({
                                semantic: semantic,
                                components: attr.numComponents,
                                type: attr.dataType,
                                normalize: normalize,
                                offset: attr.offset,
                                stride: decompressedData.stride,
                            })
                        }
                    }
                    const vertexFormat = new VertexFormat(device, vertexDesc)
                    const numVertices = decompressedData.vertices.byteLength / decompressedData.stride
                    const indexFormat = numVertices <= 65535 ? INDEXFORMAT_UINT16 : INDEXFORMAT_UINT32
                    const numIndices = decompressedData.indices.byteLength / (numVertices <= 65535 ? 2 : 4)
                    const vertexBuffer = new VertexBuffer(device, vertexFormat, numVertices, {
                        data: decompressedData.vertices,
                    })
                    const indexBuffer = new IndexBuffer(
                        device,
                        indexFormat,
                        numIndices,
                        BUFFER_STATIC,
                        decompressedData.indices,
                    )
                    result.vertexBuffer = vertexBuffer
                    result.indexBuffer[0] = indexBuffer
                    result.primitive[0].type = getPrimitiveType(primitive)
                    result.primitive[0].base = 0
                    result.primitive[0].count = indexBuffer ? numIndices : numVertices
                    result.primitive[0].indexed = !!indexBuffer
                    resolve()
                }
            })
        }),
    )
    if (primitive?.extensions?.KHR_materials_variants) {
        const variants = primitive.extensions.KHR_materials_variants
        const tempMapping = {}
        variants.mappings.forEach((mapping) => {
            mapping.variants.forEach((variant) => {
                tempMapping[variant] = mapping.material
            })
        })
        meshVariants[result.id] = tempMapping
    }
    meshDefaultMaterials[result.id] = primitive.material
    return result
}
const createMesh = (
    device,
    gltfMesh,
    accessors,
    bufferViews,
    vertexBufferDict,
    meshVariants,
    meshDefaultMaterials,
    assetOptions,
    promises,
) => {
    const meshes = []
    gltfMesh.primitives.forEach((primitive) => {
        if (primitive.extensions?.KHR_draco_mesh_compression) {
            meshes.push(
                createDracoMesh(
                    device,
                    primitive,
                    accessors,
                    bufferViews,
                    meshVariants,
                    meshDefaultMaterials,
                    promises,
                ),
            )
        } else {
            let indices = primitive.hasOwnProperty('indices')
                ? getAccessorData(accessors[primitive.indices], bufferViews, true)
                : null
            const vertexBuffer = createVertexBuffer(
                device,
                primitive.attributes,
                indices,
                accessors,
                bufferViews,
                vertexBufferDict,
            )
            const primitiveType = getPrimitiveType(primitive)
            const mesh = new Mesh(device)
            mesh.vertexBuffer = vertexBuffer
            mesh.primitive[0].type = primitiveType
            mesh.primitive[0].base = 0
            mesh.primitive[0].indexed = indices !== null
            if (indices !== null) {
                let indexFormat
                if (indices instanceof Uint8Array) {
                    indexFormat = INDEXFORMAT_UINT8
                } else if (indices instanceof Uint16Array) {
                    indexFormat = INDEXFORMAT_UINT16
                } else {
                    indexFormat = INDEXFORMAT_UINT32
                }
                if (indexFormat === INDEXFORMAT_UINT8 && device.isWebGPU) {
                    indexFormat = INDEXFORMAT_UINT16
                    indices = new Uint16Array(indices)
                }
                const indexBuffer = new IndexBuffer(device, indexFormat, indices.length, BUFFER_STATIC, indices)
                mesh.indexBuffer[0] = indexBuffer
                mesh.primitive[0].count = indices.length
            } else {
                mesh.primitive[0].count = vertexBuffer.numVertices
            }
            if (
                primitive.hasOwnProperty('extensions') &&
                primitive.extensions.hasOwnProperty('KHR_materials_variants')
            ) {
                const variants = primitive.extensions.KHR_materials_variants
                const tempMapping = {}
                variants.mappings.forEach((mapping) => {
                    mapping.variants.forEach((variant) => {
                        tempMapping[variant] = mapping.material
                    })
                })
                meshVariants[mesh.id] = tempMapping
            }
            meshDefaultMaterials[mesh.id] = primitive.material
            let accessor = accessors[primitive.attributes.POSITION]
            mesh.aabb = getAccessorBoundingBox(accessor)
            if (primitive.hasOwnProperty('targets')) {
                const targets = []
                primitive.targets.forEach((target, index) => {
                    const options = {}
                    if (target.hasOwnProperty('POSITION')) {
                        accessor = accessors[target.POSITION]
                        options.deltaPositions = getAccessorDataFloat32(accessor, bufferViews)
                        options.aabb = getAccessorBoundingBox(accessor)
                    }
                    if (target.hasOwnProperty('NORMAL')) {
                        accessor = accessors[target.NORMAL]
                        options.deltaNormals = getAccessorDataFloat32(accessor, bufferViews)
                    }
                    if (gltfMesh.hasOwnProperty('extras') && gltfMesh.extras.hasOwnProperty('targetNames')) {
                        options.name = gltfMesh.extras.targetNames[index]
                    } else {
                        options.name = index.toString(10)
                    }
                    if (gltfMesh.hasOwnProperty('weights')) {
                        options.defaultWeight = gltfMesh.weights[index]
                    }
                    options.preserveData = assetOptions.morphPreserveData
                    targets.push(new MorphTarget(options))
                })
                mesh.morph = new Morph(targets, device, {
                    preferHighPrecision: assetOptions.morphPreferHighPrecision,
                })
            }
            meshes.push(mesh)
        }
    })
    return meshes
}
const extractTextureTransform = (source, material, maps) => {
    let map
    const texCoord = source.texCoord
    if (texCoord) {
        for (map = 0; map < maps.length; ++map) {
            material[`${maps[map]}MapUv`] = texCoord
        }
    }
    const zeros = [0, 0]
    const ones = [1, 1]
    const textureTransform = source.extensions?.KHR_texture_transform
    if (textureTransform) {
        const offset = textureTransform.offset || zeros
        const scale = textureTransform.scale || ones
        const rotation = textureTransform.rotation ? -textureTransform.rotation * math.RAD_TO_DEG : 0
        const tilingVec = new Vec2(scale[0], scale[1])
        const offsetVec = new Vec2(offset[0], 1.0 - scale[1] - offset[1])
        for (map = 0; map < maps.length; ++map) {
            material[`${maps[map]}MapTiling`] = tilingVec
            material[`${maps[map]}MapOffset`] = offsetVec
            material[`${maps[map]}MapRotation`] = rotation
        }
    }
}
const extensionPbrSpecGlossiness = (data, material, textures) => {
    let texture
    if (data.hasOwnProperty('diffuseFactor')) {
        const [r, g, b, a] = data.diffuseFactor
        material.diffuse.set(r, g, b).gamma()
        material.opacity = a
    } else {
        material.diffuse.set(1, 1, 1)
        material.opacity = 1
    }
    if (data.hasOwnProperty('diffuseTexture')) {
        const diffuseTexture = data.diffuseTexture
        texture = textures[diffuseTexture.index]
        material.diffuseMap = texture
        material.diffuseMapChannel = 'rgb'
        material.opacityMap = texture
        material.opacityMapChannel = 'a'
        extractTextureTransform(diffuseTexture, material, ['diffuse', 'opacity'])
    }
    material.useMetalness = false
    if (data.hasOwnProperty('specularFactor')) {
        const [r, g, b] = data.specularFactor
        material.specular.set(r, g, b).gamma()
    } else {
        material.specular.set(1, 1, 1)
    }
    if (data.hasOwnProperty('glossinessFactor')) {
        material.gloss = data.glossinessFactor
    } else {
        material.gloss = 1.0
    }
    if (data.hasOwnProperty('specularGlossinessTexture')) {
        const specularGlossinessTexture = data.specularGlossinessTexture
        material.specularMap = material.glossMap = textures[specularGlossinessTexture.index]
        material.specularMapChannel = 'rgb'
        material.glossMapChannel = 'a'
        extractTextureTransform(specularGlossinessTexture, material, ['gloss', 'metalness'])
    }
}
const extensionClearCoat = (data, material, textures) => {
    if (data.hasOwnProperty('clearcoatFactor')) {
        material.clearCoat = data.clearcoatFactor * 0.25
    } else {
        material.clearCoat = 0
    }
    if (data.hasOwnProperty('clearcoatTexture')) {
        const clearcoatTexture = data.clearcoatTexture
        material.clearCoatMap = textures[clearcoatTexture.index]
        material.clearCoatMapChannel = 'r'
        extractTextureTransform(clearcoatTexture, material, ['clearCoat'])
    }
    if (data.hasOwnProperty('clearcoatRoughnessFactor')) {
        material.clearCoatGloss = data.clearcoatRoughnessFactor
    } else {
        material.clearCoatGloss = 0
    }
    if (data.hasOwnProperty('clearcoatRoughnessTexture')) {
        const clearcoatRoughnessTexture = data.clearcoatRoughnessTexture
        material.clearCoatGlossMap = textures[clearcoatRoughnessTexture.index]
        material.clearCoatGlossMapChannel = 'g'
        extractTextureTransform(clearcoatRoughnessTexture, material, ['clearCoatGloss'])
    }
    if (data.hasOwnProperty('clearcoatNormalTexture')) {
        const clearcoatNormalTexture = data.clearcoatNormalTexture
        material.clearCoatNormalMap = textures[clearcoatNormalTexture.index]
        extractTextureTransform(clearcoatNormalTexture, material, ['clearCoatNormal'])
        if (clearcoatNormalTexture.hasOwnProperty('scale')) {
            material.clearCoatBumpiness = clearcoatNormalTexture.scale
        } else {
            material.clearCoatBumpiness = 1
        }
    }
    material.clearCoatGlossInvert = true
}
const extensionUnlit = (data, material, textures) => {
    material.useLighting = false
    material.emissive.copy(material.diffuse)
    material.emissiveMap = material.diffuseMap
    material.emissiveMapUv = material.diffuseMapUv
    material.emissiveMapTiling.copy(material.diffuseMapTiling)
    material.emissiveMapOffset.copy(material.diffuseMapOffset)
    material.emissiveMapRotation = material.diffuseMapRotation
    material.emissiveMapChannel = material.diffuseMapChannel
    material.emissiveVertexColor = material.diffuseVertexColor
    material.emissiveVertexColorChannel = material.diffuseVertexColorChannel
    material.useLighting = false
    material.useSkybox = false
    material.diffuse.set(1, 1, 1)
    material.diffuseMap = null
    material.diffuseVertexColor = false
}
const extensionSpecular = (data, material, textures) => {
    material.useMetalnessSpecularColor = true
    if (data.hasOwnProperty('specularColorTexture')) {
        material.specularMap = textures[data.specularColorTexture.index]
        material.specularMapChannel = 'rgb'
        extractTextureTransform(data.specularColorTexture, material, ['specular'])
    }
    if (data.hasOwnProperty('specularColorFactor')) {
        const [r, g, b] = data.specularColorFactor
        material.specular.set(r, g, b).gamma()
    } else {
        material.specular.set(1, 1, 1)
    }
    if (data.hasOwnProperty('specularFactor')) {
        material.specularityFactor = data.specularFactor
    } else {
        material.specularityFactor = 1
    }
    if (data.hasOwnProperty('specularTexture')) {
        material.specularityFactorMapChannel = 'a'
        material.specularityFactorMap = textures[data.specularTexture.index]
        extractTextureTransform(data.specularTexture, material, ['specularityFactor'])
    }
}
const extensionIor = (data, material, textures) => {
    if (data.hasOwnProperty('ior')) {
        material.refractionIndex = 1.0 / data.ior
    }
}
const extensionDispersion = (data, material, textures) => {
    if (data.hasOwnProperty('dispersion')) {
        material.dispersion = data.dispersion
    }
}
const extensionTransmission = (data, material, textures) => {
    material.blendType = BLEND_NORMAL
    material.useDynamicRefraction = true
    if (data.hasOwnProperty('transmissionFactor')) {
        material.refraction = data.transmissionFactor
    }
    if (data.hasOwnProperty('transmissionTexture')) {
        material.refractionMapChannel = 'r'
        material.refractionMap = textures[data.transmissionTexture.index]
        extractTextureTransform(data.transmissionTexture, material, ['refraction'])
    }
}
const extensionSheen = (data, material, textures) => {
    material.useSheen = true
    if (data.hasOwnProperty('sheenColorFactor')) {
        const [r, g, b] = data.sheenColorFactor
        material.sheen.set(r, g, b).gamma()
    } else {
        material.sheen.set(1, 1, 1)
    }
    if (data.hasOwnProperty('sheenColorTexture')) {
        material.sheenMap = textures[data.sheenColorTexture.index]
        extractTextureTransform(data.sheenColorTexture, material, ['sheen'])
    }
    material.sheenGloss = data.hasOwnProperty('sheenRoughnessFactor') ? data.sheenRoughnessFactor : 0.0
    if (data.hasOwnProperty('sheenRoughnessTexture')) {
        material.sheenGlossMap = textures[data.sheenRoughnessTexture.index]
        material.sheenGlossMapChannel = 'a'
        extractTextureTransform(data.sheenRoughnessTexture, material, ['sheenGloss'])
    }
    material.sheenGlossInvert = true
}
const extensionVolume = (data, material, textures) => {
    material.blendType = BLEND_NORMAL
    material.useDynamicRefraction = true
    if (data.hasOwnProperty('thicknessFactor')) {
        material.thickness = data.thicknessFactor
    }
    if (data.hasOwnProperty('thicknessTexture')) {
        material.thicknessMap = textures[data.thicknessTexture.index]
        material.thicknessMapChannel = 'g'
        extractTextureTransform(data.thicknessTexture, material, ['thickness'])
    }
    if (data.hasOwnProperty('attenuationDistance')) {
        material.attenuationDistance = data.attenuationDistance
    }
    if (data.hasOwnProperty('attenuationColor')) {
        const [r, g, b] = data.attenuationColor
        material.attenuation.set(r, g, b).gamma()
    }
}
const extensionEmissiveStrength = (data, material, textures) => {
    if (data.hasOwnProperty('emissiveStrength')) {
        material.emissiveIntensity = data.emissiveStrength
    }
}
const extensionIridescence = (data, material, textures) => {
    material.useIridescence = true
    if (data.hasOwnProperty('iridescenceFactor')) {
        material.iridescence = data.iridescenceFactor
    }
    if (data.hasOwnProperty('iridescenceTexture')) {
        material.iridescenceMapChannel = 'r'
        material.iridescenceMap = textures[data.iridescenceTexture.index]
        extractTextureTransform(data.iridescenceTexture, material, ['iridescence'])
    }
    if (data.hasOwnProperty('iridescenceIor')) {
        material.iridescenceRefractionIndex = data.iridescenceIor
    }
    if (data.hasOwnProperty('iridescenceThicknessMinimum')) {
        material.iridescenceThicknessMin = data.iridescenceThicknessMinimum
    }
    if (data.hasOwnProperty('iridescenceThicknessMaximum')) {
        material.iridescenceThicknessMax = data.iridescenceThicknessMaximum
    }
    if (data.hasOwnProperty('iridescenceThicknessTexture')) {
        material.iridescenceThicknessMapChannel = 'g'
        material.iridescenceThicknessMap = textures[data.iridescenceThicknessTexture.index]
        extractTextureTransform(data.iridescenceThicknessTexture, material, ['iridescenceThickness'])
    }
}
const extensionAnisotropy = (data, material, textures) => {
    material.enableGGXSpecular = true
    if (data.hasOwnProperty('anisotropyStrength')) {
        material.anisotropyIntensity = data.anisotropyStrength
    } else {
        material.anisotropyIntensity = 0
    }
    if (data.hasOwnProperty('anisotropyTexture')) {
        const anisotropyTexture = data.anisotropyTexture
        material.anisotropyMap = textures[anisotropyTexture.index]
        extractTextureTransform(anisotropyTexture, material, ['anisotropy'])
    }
    if (data.hasOwnProperty('anisotropyRotation')) {
        material.anisotropyRotation = data.anisotropyRotation * math.RAD_TO_DEG
    } else {
        material.anisotropyRotation = 0
    }
}
const createMaterial = (gltfMaterial, textures) => {
    const material = new StandardMaterial()
    if (gltfMaterial.hasOwnProperty('name')) {
        material.name = gltfMaterial.name
    }
    material.occludeSpecular = SPECOCC_AO
    material.diffuseVertexColor = true
    material.specularTint = true
    material.specularVertexColor = true
    material.specular.set(1, 1, 1)
    material.gloss = 1
    material.glossInvert = true
    material.useMetalness = true
    let texture
    if (gltfMaterial.hasOwnProperty('pbrMetallicRoughness')) {
        const pbrData = gltfMaterial.pbrMetallicRoughness
        if (pbrData.hasOwnProperty('baseColorFactor')) {
            const [r, g, b, a] = pbrData.baseColorFactor
            material.diffuse.set(r, g, b).gamma()
            material.opacity = a
        }
        if (pbrData.hasOwnProperty('baseColorTexture')) {
            const baseColorTexture = pbrData.baseColorTexture
            texture = textures[baseColorTexture.index]
            material.diffuseMap = texture
            material.diffuseMapChannel = 'rgb'
            material.opacityMap = texture
            material.opacityMapChannel = 'a'
            extractTextureTransform(baseColorTexture, material, ['diffuse', 'opacity'])
        }
        if (pbrData.hasOwnProperty('metallicFactor')) {
            material.metalness = pbrData.metallicFactor
        }
        if (pbrData.hasOwnProperty('roughnessFactor')) {
            material.gloss = pbrData.roughnessFactor
        }
        if (pbrData.hasOwnProperty('metallicRoughnessTexture')) {
            const metallicRoughnessTexture = pbrData.metallicRoughnessTexture
            material.metalnessMap = material.glossMap = textures[metallicRoughnessTexture.index]
            material.metalnessMapChannel = 'b'
            material.glossMapChannel = 'g'
            extractTextureTransform(metallicRoughnessTexture, material, ['gloss', 'metalness'])
        }
    }
    if (gltfMaterial.hasOwnProperty('normalTexture')) {
        const normalTexture = gltfMaterial.normalTexture
        material.normalMap = textures[normalTexture.index]
        extractTextureTransform(normalTexture, material, ['normal'])
        if (normalTexture.hasOwnProperty('scale')) {
            material.bumpiness = normalTexture.scale
        }
    }
    if (gltfMaterial.hasOwnProperty('occlusionTexture')) {
        const occlusionTexture = gltfMaterial.occlusionTexture
        material.aoMap = textures[occlusionTexture.index]
        material.aoMapChannel = 'r'
        extractTextureTransform(occlusionTexture, material, ['ao'])
    }
    if (gltfMaterial.hasOwnProperty('emissiveFactor')) {
        const [r, g, b] = gltfMaterial.emissiveFactor
        material.emissive.set(r, g, b).gamma()
    }
    if (gltfMaterial.hasOwnProperty('emissiveTexture')) {
        const emissiveTexture = gltfMaterial.emissiveTexture
        material.emissiveMap = textures[emissiveTexture.index]
        extractTextureTransform(emissiveTexture, material, ['emissive'])
    }
    if (gltfMaterial.hasOwnProperty('alphaMode')) {
        switch (gltfMaterial.alphaMode) {
            case 'MASK':
                material.blendType = BLEND_NONE
                if (gltfMaterial.hasOwnProperty('alphaCutoff')) {
                    material.alphaTest = gltfMaterial.alphaCutoff
                } else {
                    material.alphaTest = 0.5
                }
                break
            case 'BLEND':
                material.blendType = BLEND_NORMAL
                material.depthWrite = false
                break
            default:
            case 'OPAQUE':
                material.blendType = BLEND_NONE
                break
        }
    } else {
        material.blendType = BLEND_NONE
    }
    if (gltfMaterial.hasOwnProperty('doubleSided')) {
        material.twoSidedLighting = gltfMaterial.doubleSided
        material.cull = gltfMaterial.doubleSided ? CULLFACE_NONE : CULLFACE_BACK
    } else {
        material.twoSidedLighting = false
        material.cull = CULLFACE_BACK
    }
    const extensions = {
        KHR_materials_clearcoat: extensionClearCoat,
        KHR_materials_emissive_strength: extensionEmissiveStrength,
        KHR_materials_ior: extensionIor,
        KHR_materials_dispersion: extensionDispersion,
        KHR_materials_iridescence: extensionIridescence,
        KHR_materials_pbrSpecularGlossiness: extensionPbrSpecGlossiness,
        KHR_materials_sheen: extensionSheen,
        KHR_materials_specular: extensionSpecular,
        KHR_materials_transmission: extensionTransmission,
        KHR_materials_unlit: extensionUnlit,
        KHR_materials_volume: extensionVolume,
        KHR_materials_anisotropy: extensionAnisotropy,
    }
    if (gltfMaterial.hasOwnProperty('extensions')) {
        for (const key in gltfMaterial.extensions) {
            const extensionFunc = extensions[key]
            if (extensionFunc !== undefined) {
                extensionFunc(gltfMaterial.extensions[key], material, textures)
            }
        }
    }
    material.update()
    return material
}
const createAnimation = (gltfAnimation, animationIndex, gltfAccessors, bufferViews, nodes, meshes, gltfNodes) => {
    const createAnimData = (gltfAccessor) => {
        return new AnimData(getNumComponents(gltfAccessor.type), getAccessorDataFloat32(gltfAccessor, bufferViews))
    }
    const interpMap = {
        STEP: INTERPOLATION_STEP,
        LINEAR: INTERPOLATION_LINEAR,
        CUBICSPLINE: INTERPOLATION_CUBIC,
    }
    const inputMap = {}
    const outputMap = {}
    const curveMap = {}
    let outputCounter = 1
    let i
    for (i = 0; i < gltfAnimation.samplers.length; ++i) {
        const sampler = gltfAnimation.samplers[i]
        if (!inputMap.hasOwnProperty(sampler.input)) {
            inputMap[sampler.input] = createAnimData(gltfAccessors[sampler.input])
        }
        if (!outputMap.hasOwnProperty(sampler.output)) {
            outputMap[sampler.output] = createAnimData(gltfAccessors[sampler.output])
        }
        const interpolation =
            sampler.hasOwnProperty('interpolation') && interpMap.hasOwnProperty(sampler.interpolation)
                ? interpMap[sampler.interpolation]
                : INTERPOLATION_LINEAR
        const curve = {
            paths: [],
            input: sampler.input,
            output: sampler.output,
            interpolation: interpolation,
        }
        curveMap[i] = curve
    }
    const quatArrays = []
    const transformSchema = {
        translation: 'localPosition',
        rotation: 'localRotation',
        scale: 'localScale',
    }
    const constructNodePath = (node) => {
        const path = []
        while (node) {
            path.unshift(node.name)
            node = node.parent
        }
        return path
    }
    const createMorphTargetCurves = (curve, gltfNode, entityPath) => {
        const out = outputMap[curve.output]
        if (!out) {
            return
        }
        let targetNames
        if (meshes && meshes[gltfNode.mesh]) {
            const mesh = meshes[gltfNode.mesh]
            if (mesh.hasOwnProperty('extras') && mesh.extras.hasOwnProperty('targetNames')) {
                targetNames = mesh.extras.targetNames
            }
        }
        const outData = out.data
        const morphTargetCount = outData.length / inputMap[curve.input].data.length
        const keyframeCount = outData.length / morphTargetCount
        const singleBufferSize = keyframeCount * 4
        const buffer = new ArrayBuffer(singleBufferSize * morphTargetCount)
        for (let j = 0; j < morphTargetCount; j++) {
            const morphTargetOutput = new Float32Array(buffer, singleBufferSize * j, keyframeCount)
            for (let k = 0; k < keyframeCount; k++) {
                morphTargetOutput[k] = outData[k * morphTargetCount + j]
            }
            const output = new AnimData(1, morphTargetOutput)
            const weightName = targetNames?.[j] ? `name.${targetNames[j]}` : j
            outputMap[-outputCounter] = output
            const morphCurve = {
                paths: [
                    {
                        entityPath: entityPath,
                        component: 'graph',
                        propertyPath: [`weight.${weightName}`],
                    },
                ],
                input: curve.input,
                output: -outputCounter,
                interpolation: curve.interpolation,
            }
            outputCounter++
            curveMap[`morphCurve-${i}-${j}`] = morphCurve
        }
    }
    for (i = 0; i < gltfAnimation.channels.length; ++i) {
        const channel = gltfAnimation.channels[i]
        const target = channel.target
        const curve = curveMap[channel.sampler]
        const node = nodes[target.node]
        const gltfNode = gltfNodes[target.node]
        const entityPath = constructNodePath(node)
        if (target.path.startsWith('weights')) {
            createMorphTargetCurves(curve, gltfNode, entityPath)
            curveMap[channel.sampler].morphCurve = true
        } else {
            curve.paths.push({
                entityPath: entityPath,
                component: 'graph',
                propertyPath: [transformSchema[target.path]],
            })
        }
    }
    const inputs = []
    const outputs = []
    const curves = []
    for (const inputKey in inputMap) {
        inputs.push(inputMap[inputKey])
        inputMap[inputKey] = inputs.length - 1
    }
    for (const outputKey in outputMap) {
        outputs.push(outputMap[outputKey])
        outputMap[outputKey] = outputs.length - 1
    }
    for (const curveKey in curveMap) {
        const curveData = curveMap[curveKey]
        if (curveData.morphCurve) {
            continue
        }
        curves.push(
            new AnimCurve(
                curveData.paths,
                inputMap[curveData.input],
                outputMap[curveData.output],
                curveData.interpolation,
            ),
        )
        if (
            curveData.paths.length > 0 &&
            curveData.paths[0].propertyPath[0] === 'localRotation' &&
            curveData.interpolation !== INTERPOLATION_CUBIC
        ) {
            quatArrays.push(curves[curves.length - 1].output)
        }
    }
    quatArrays.sort()
    let prevIndex = null
    let data
    for (i = 0; i < quatArrays.length; ++i) {
        const index = quatArrays[i]
        if (i === 0 || index !== prevIndex) {
            data = outputs[index]
            if (data.components === 4) {
                const d = data.data
                const len = d.length - 4
                for (let j = 0; j < len; j += 4) {
                    const dp = d[j + 0] * d[j + 4] + d[j + 1] * d[j + 5] + d[j + 2] * d[j + 6] + d[j + 3] * d[j + 7]
                    if (dp < 0) {
                        d[j + 4] *= -1
                        d[j + 5] *= -1
                        d[j + 6] *= -1
                        d[j + 7] *= -1
                    }
                }
            }
            prevIndex = index
        }
    }
    let duration = 0
    for (i = 0; i < inputs.length; i++) {
        data = inputs[i]._data
        duration = Math.max(duration, data.length === 0 ? 0 : data[data.length - 1])
    }
    return new AnimTrack(
        gltfAnimation.hasOwnProperty('name') ? gltfAnimation.name : `animation_${animationIndex}`,
        duration,
        inputs,
        outputs,
        curves,
    )
}
const tempMat = new Mat4()
const tempVec = new Vec3()
const tempQuat = new Quat()
const createNode = (gltfNode, nodeIndex, nodeInstancingMap) => {
    const entity = new GraphNode()
    if (gltfNode.hasOwnProperty('name') && gltfNode.name.length > 0) {
        entity.name = gltfNode.name
    } else {
        entity.name = `node_${nodeIndex}`
    }
    if (gltfNode.hasOwnProperty('matrix')) {
        tempMat.data.set(gltfNode.matrix)
        tempMat.getTranslation(tempVec)
        entity.setLocalPosition(tempVec)
        tempQuat.setFromMat4(tempMat)
        entity.setLocalRotation(tempQuat)
        tempMat.getScale(tempVec)
        tempVec.x *= tempMat.scaleSign
        entity.setLocalScale(tempVec)
    }
    if (gltfNode.hasOwnProperty('rotation')) {
        const r = gltfNode.rotation
        entity.setLocalRotation(r[0], r[1], r[2], r[3])
    }
    if (gltfNode.hasOwnProperty('translation')) {
        const t = gltfNode.translation
        entity.setLocalPosition(t[0], t[1], t[2])
    }
    if (gltfNode.hasOwnProperty('scale')) {
        const s = gltfNode.scale
        entity.setLocalScale(s[0], s[1], s[2])
    }
    if (gltfNode.hasOwnProperty('extensions') && gltfNode.extensions.EXT_mesh_gpu_instancing) {
        nodeInstancingMap.set(gltfNode, {
            ext: gltfNode.extensions.EXT_mesh_gpu_instancing,
        })
    }
    return entity
}
const createCamera$1 = (gltfCamera, node) => {
    const isOrthographic = gltfCamera.type === 'orthographic'
    const gltfProperties = isOrthographic ? gltfCamera.orthographic : gltfCamera.perspective
    const componentData = {
        enabled: false,
        projection: isOrthographic ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE,
        nearClip: gltfProperties.znear,
        aspectRatioMode: ASPECT_AUTO,
    }
    if (gltfProperties.zfar) {
        componentData.farClip = gltfProperties.zfar
    }
    if (isOrthographic) {
        componentData.orthoHeight = gltfProperties.ymag
        if (gltfProperties.xmag && gltfProperties.ymag) {
            componentData.aspectRatioMode = ASPECT_MANUAL
            componentData.aspectRatio = gltfProperties.xmag / gltfProperties.ymag
        }
    } else {
        componentData.fov = gltfProperties.yfov * math.RAD_TO_DEG
        if (gltfProperties.aspectRatio) {
            componentData.aspectRatioMode = ASPECT_MANUAL
            componentData.aspectRatio = gltfProperties.aspectRatio
        }
    }
    const cameraEntity = new Entity(gltfCamera.name)
    cameraEntity.addComponent('camera', componentData)
    return cameraEntity
}
const createLight = (gltfLight, node) => {
    const lightProps = {
        enabled: false,
        type: gltfLight.type === 'point' ? 'omni' : gltfLight.type,
        color: gltfLight.hasOwnProperty('color') ? new Color(gltfLight.color) : Color.WHITE,
        range: gltfLight.hasOwnProperty('range') ? gltfLight.range : 9999,
        falloffMode: LIGHTFALLOFF_INVERSESQUARED,
        intensity: gltfLight.hasOwnProperty('intensity') ? math.clamp(gltfLight.intensity, 0, 2) : 1,
    }
    if (gltfLight.hasOwnProperty('spot')) {
        lightProps.innerConeAngle = gltfLight.spot.hasOwnProperty('innerConeAngle')
            ? gltfLight.spot.innerConeAngle * math.RAD_TO_DEG
            : 0
        lightProps.outerConeAngle = gltfLight.spot.hasOwnProperty('outerConeAngle')
            ? gltfLight.spot.outerConeAngle * math.RAD_TO_DEG
            : 45
    }
    if (gltfLight.hasOwnProperty('intensity')) {
        const outerAngleRad = gltfLight.spot?.outerConeAngle ?? Math.PI / 4
        const innerAngleRad = gltfLight.spot?.innerConeAngle ?? 0
        lightProps.luminance =
            gltfLight.intensity *
            Light.getLightUnitConversion(lightTypes[lightProps.type], outerAngleRad, innerAngleRad)
    }
    const lightEntity = new Entity(node.name)
    lightEntity.rotateLocal(90, 0, 0)
    lightEntity.addComponent('light', lightProps)
    return lightEntity
}
const createSkins = (device, gltf, nodes, bufferViews) => {
    if (!gltf.hasOwnProperty('skins') || gltf.skins.length === 0) {
        return []
    }
    const glbSkins = new Map()
    return gltf.skins.map((gltfSkin) => {
        return createSkin(device, gltfSkin, gltf.accessors, bufferViews, nodes, glbSkins)
    })
}
const createMeshes = (device, gltf, bufferViews, options) => {
    const vertexBufferDict = {}
    const meshVariants = {}
    const meshDefaultMaterials = {}
    const promises = []
    const valid = !options.skipMeshes && gltf?.meshes?.length && gltf?.accessors?.length && gltf?.bufferViews?.length
    const meshes = valid
        ? gltf.meshes.map((gltfMesh) => {
              return createMesh(
                  device,
                  gltfMesh,
                  gltf.accessors,
                  bufferViews,
                  vertexBufferDict,
                  meshVariants,
                  meshDefaultMaterials,
                  options,
                  promises,
              )
          })
        : []
    return {
        meshes,
        meshVariants,
        meshDefaultMaterials,
        promises,
    }
}
const createMaterials = (gltf, textures, options) => {
    if (!gltf.hasOwnProperty('materials') || gltf.materials.length === 0) {
        return []
    }
    const preprocess = options?.material?.preprocess
    const process = options?.material?.process ?? createMaterial
    const postprocess = options?.material?.postprocess
    return gltf.materials.map((gltfMaterial) => {
        if (preprocess) {
            preprocess(gltfMaterial)
        }
        const material = process(gltfMaterial, textures)
        if (postprocess) {
            postprocess(gltfMaterial, material)
        }
        return material
    })
}
const createVariants = (gltf) => {
    if (!gltf.hasOwnProperty('extensions') || !gltf.extensions.hasOwnProperty('KHR_materials_variants')) {
        return null
    }
    const data = gltf.extensions.KHR_materials_variants.variants
    const variants = {}
    for (let i = 0; i < data.length; i++) {
        variants[data[i].name] = i
    }
    return variants
}
const createAnimations = (gltf, nodes, bufferViews, options) => {
    if (!gltf.hasOwnProperty('animations') || gltf.animations.length === 0) {
        return []
    }
    const preprocess = options?.animation?.preprocess
    const postprocess = options?.animation?.postprocess
    return gltf.animations.map((gltfAnimation, index) => {
        if (preprocess) {
            preprocess(gltfAnimation)
        }
        const animation = createAnimation(
            gltfAnimation,
            index,
            gltf.accessors,
            bufferViews,
            nodes,
            gltf.meshes,
            gltf.nodes,
        )
        if (postprocess) {
            postprocess(gltfAnimation, animation)
        }
        return animation
    })
}
const createInstancing = (device, gltf, nodeInstancingMap, bufferViews) => {
    const accessors = gltf.accessors
    nodeInstancingMap.forEach((data, entity) => {
        const attributes = data.ext.attributes
        let translations
        if (attributes.hasOwnProperty('TRANSLATION')) {
            const accessor = accessors[attributes.TRANSLATION]
            translations = getAccessorDataFloat32(accessor, bufferViews)
        }
        let rotations
        if (attributes.hasOwnProperty('ROTATION')) {
            const accessor = accessors[attributes.ROTATION]
            rotations = getAccessorDataFloat32(accessor, bufferViews)
        }
        let scales
        if (attributes.hasOwnProperty('SCALE')) {
            const accessor = accessors[attributes.SCALE]
            scales = getAccessorDataFloat32(accessor, bufferViews)
        }
        const instanceCount =
            (translations ? translations.length / 3 : 0) ||
            (rotations ? rotations.length / 4 : 0) ||
            (scales ? scales.length / 3 : 0)
        if (instanceCount) {
            const matrices = new Float32Array(instanceCount * 16)
            const pos = new Vec3()
            const rot = new Quat()
            const scl = new Vec3(1, 1, 1)
            const matrix = new Mat4()
            let matrixIndex = 0
            for (let i = 0; i < instanceCount; i++) {
                const i3 = i * 3
                if (translations) {
                    pos.set(translations[i3], translations[i3 + 1], translations[i3 + 2])
                }
                if (rotations) {
                    const i4 = i * 4
                    rot.set(rotations[i4], rotations[i4 + 1], rotations[i4 + 2], rotations[i4 + 3])
                }
                if (scales) {
                    scl.set(scales[i3], scales[i3 + 1], scales[i3 + 2])
                }
                matrix.setTRS(pos, rot, scl)
                for (let m = 0; m < 16; m++) {
                    matrices[matrixIndex++] = matrix.data[m]
                }
            }
            data.matrices = matrices
        }
    })
}
const createNodes = (gltf, options, nodeInstancingMap) => {
    if (!gltf.hasOwnProperty('nodes') || gltf.nodes.length === 0) {
        return []
    }
    const preprocess = options?.node?.preprocess
    const process = options?.node?.process ?? createNode
    const postprocess = options?.node?.postprocess
    const nodes = gltf.nodes.map((gltfNode, index) => {
        if (preprocess) {
            preprocess(gltfNode)
        }
        const node = process(gltfNode, index, nodeInstancingMap)
        if (postprocess) {
            postprocess(gltfNode, node)
        }
        return node
    })
    for (let i = 0; i < gltf.nodes.length; ++i) {
        const gltfNode = gltf.nodes[i]
        if (gltfNode.hasOwnProperty('children')) {
            const parent = nodes[i]
            const uniqueNames = {}
            for (let j = 0; j < gltfNode.children.length; ++j) {
                const child = nodes[gltfNode.children[j]]
                if (!child.parent) {
                    if (uniqueNames.hasOwnProperty(child.name)) {
                        child.name += uniqueNames[child.name]++
                    } else {
                        uniqueNames[child.name] = 1
                    }
                    parent.addChild(child)
                }
            }
        }
    }
    return nodes
}
const createScenes = (gltf, nodes) => {
    const scenes = []
    const count = gltf.scenes.length
    if (count === 1 && gltf.scenes[0].nodes?.length === 1) {
        const nodeIndex = gltf.scenes[0].nodes[0]
        scenes.push(nodes[nodeIndex])
    } else {
        for (let i = 0; i < count; i++) {
            const scene = gltf.scenes[i]
            if (scene.nodes) {
                const sceneRoot = new GraphNode(scene.name)
                for (let n = 0; n < scene.nodes.length; n++) {
                    const childNode = nodes[scene.nodes[n]]
                    sceneRoot.addChild(childNode)
                }
                scenes.push(sceneRoot)
            }
        }
    }
    return scenes
}
const createCameras = (gltf, nodes, options) => {
    let cameras = null
    if (gltf.hasOwnProperty('nodes') && gltf.hasOwnProperty('cameras') && gltf.cameras.length > 0) {
        const preprocess = options?.camera?.preprocess
        const process = options?.camera?.process ?? createCamera$1
        const postprocess = options?.camera?.postprocess
        gltf.nodes.forEach((gltfNode, nodeIndex) => {
            if (gltfNode.hasOwnProperty('camera')) {
                const gltfCamera = gltf.cameras[gltfNode.camera]
                if (gltfCamera) {
                    if (preprocess) {
                        preprocess(gltfCamera)
                    }
                    const camera = process(gltfCamera, nodes[nodeIndex])
                    if (postprocess) {
                        postprocess(gltfCamera, camera)
                    }
                    if (camera) {
                        if (!cameras) cameras = new Map()
                        cameras.set(gltfNode, camera)
                    }
                }
            }
        })
    }
    return cameras
}
const createLights = (gltf, nodes, options) => {
    let lights = null
    if (
        gltf.hasOwnProperty('nodes') &&
        gltf.hasOwnProperty('extensions') &&
        gltf.extensions.hasOwnProperty('KHR_lights_punctual') &&
        gltf.extensions.KHR_lights_punctual.hasOwnProperty('lights')
    ) {
        const gltfLights = gltf.extensions.KHR_lights_punctual.lights
        if (gltfLights.length) {
            const preprocess = options?.light?.preprocess
            const process = options?.light?.process ?? createLight
            const postprocess = options?.light?.postprocess
            gltf.nodes.forEach((gltfNode, nodeIndex) => {
                if (
                    gltfNode.hasOwnProperty('extensions') &&
                    gltfNode.extensions.hasOwnProperty('KHR_lights_punctual') &&
                    gltfNode.extensions.KHR_lights_punctual.hasOwnProperty('light')
                ) {
                    const lightIndex = gltfNode.extensions.KHR_lights_punctual.light
                    const gltfLight = gltfLights[lightIndex]
                    if (gltfLight) {
                        if (preprocess) {
                            preprocess(gltfLight)
                        }
                        const light = process(gltfLight, nodes[nodeIndex])
                        if (postprocess) {
                            postprocess(gltfLight, light)
                        }
                        if (light) {
                            if (!lights) lights = new Map()
                            lights.set(gltfNode, light)
                        }
                    }
                }
            })
        }
    }
    return lights
}
const linkSkins = (gltf, renders, skins) => {
    gltf.nodes.forEach((gltfNode) => {
        if (gltfNode.hasOwnProperty('mesh') && gltfNode.hasOwnProperty('skin')) {
            const meshGroup = renders[gltfNode.mesh].meshes
            meshGroup.forEach((mesh) => {
                mesh.skin = skins[gltfNode.skin]
            })
        }
    })
}
const createResources = async (device, gltf, bufferViews, textures, options) => {
    const preprocess = options?.global?.preprocess
    const postprocess = options?.global?.postprocess
    if (preprocess) {
        preprocess(gltf)
    }
    if (gltf.asset && gltf.asset.generator === 'PlayCanvas');
    const nodeInstancingMap = new Map()
    const nodes = createNodes(gltf, options, nodeInstancingMap)
    const scenes = createScenes(gltf, nodes)
    const lights = createLights(gltf, nodes, options)
    const cameras = createCameras(gltf, nodes, options)
    const variants = createVariants(gltf)
    const bufferViewData = await Promise.all(bufferViews)
    const { meshes, meshVariants, meshDefaultMaterials, promises } = createMeshes(device, gltf, bufferViewData, options)
    const animations = createAnimations(gltf, nodes, bufferViewData, options)
    createInstancing(device, gltf, nodeInstancingMap, bufferViewData)
    const textureAssets = await Promise.all(textures)
    const textureInstances = textureAssets.map((t) => t.resource)
    const materials = createMaterials(gltf, textureInstances, options)
    const skins = createSkins(device, gltf, nodes, bufferViewData)
    const renders = []
    for (let i = 0; i < meshes.length; i++) {
        renders[i] = new Render()
        renders[i].meshes = meshes[i]
    }
    linkSkins(gltf, renders, skins)
    const result = new GlbResources()
    result.gltf = gltf
    result.nodes = nodes
    result.scenes = scenes
    result.animations = animations
    result.textures = textureAssets
    result.materials = materials
    result.variants = variants
    result.meshVariants = meshVariants
    result.meshDefaultMaterials = meshDefaultMaterials
    result.renders = renders
    result.skins = skins
    result.lights = lights
    result.cameras = cameras
    result.nodeInstancingMap = nodeInstancingMap
    if (postprocess) {
        postprocess(gltf, result)
    }
    await Promise.all(promises)
    return result
}
const applySampler = (texture, gltfSampler) => {
    const getFilter = (filter, defaultValue) => {
        switch (filter) {
            case 9728:
                return FILTER_NEAREST
            case 9729:
                return FILTER_LINEAR
            case 9984:
                return FILTER_NEAREST_MIPMAP_NEAREST
            case 9985:
                return FILTER_LINEAR_MIPMAP_NEAREST
            case 9986:
                return FILTER_NEAREST_MIPMAP_LINEAR
            case 9987:
                return FILTER_LINEAR_MIPMAP_LINEAR
            default:
                return defaultValue
        }
    }
    const getWrap = (wrap, defaultValue) => {
        switch (wrap) {
            case 33071:
                return ADDRESS_CLAMP_TO_EDGE
            case 33648:
                return ADDRESS_MIRRORED_REPEAT
            case 10497:
                return ADDRESS_REPEAT
            default:
                return defaultValue
        }
    }
    if (texture) {
        gltfSampler = gltfSampler ?? {}
        texture.minFilter = getFilter(gltfSampler.minFilter, FILTER_LINEAR_MIPMAP_LINEAR)
        texture.magFilter = getFilter(gltfSampler.magFilter, FILTER_LINEAR)
        texture.addressU = getWrap(gltfSampler.wrapS, ADDRESS_REPEAT)
        texture.addressV = getWrap(gltfSampler.wrapT, ADDRESS_REPEAT)
    }
}
let gltfTextureUniqueId = 0
const getTextureSource = (gltfTexture) =>
    gltfTexture.extensions?.KHR_texture_basisu?.source ??
    gltfTexture.extensions?.EXT_texture_webp?.source ??
    gltfTexture.source
const createImages = (gltf, bufferViews, urlBase, registry, options) => {
    if (!gltf.images || gltf.images.length === 0) {
        return []
    }
    const preprocess = options?.image?.preprocess
    const processAsync = options?.image?.processAsync
    const postprocess = options?.image?.postprocess
    const mimeTypeFileExtensions = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/basis': 'basis',
        'image/ktx': 'ktx',
        'image/ktx2': 'ktx2',
        'image/vnd-ms.dds': 'dds',
    }
    const getGammaTextures = (gltf) => {
        const set = new Set()
        if (gltf.hasOwnProperty('materials')) {
            gltf.materials.forEach((gltfMaterial) => {
                if (gltfMaterial.hasOwnProperty('pbrMetallicRoughness')) {
                    const pbrData = gltfMaterial.pbrMetallicRoughness
                    if (pbrData.hasOwnProperty('baseColorTexture')) {
                        const gltfTexture = gltf.textures[pbrData.baseColorTexture.index]
                        set.add(getTextureSource(gltfTexture))
                    }
                }
                if (gltfMaterial.hasOwnProperty('emissiveTexture')) {
                    const gltfTexture = gltf.textures[gltfMaterial.emissiveTexture.index]
                    set.add(getTextureSource(gltfTexture))
                }
                if (gltfMaterial.hasOwnProperty('extensions')) {
                    const sheen = gltfMaterial.extensions.KHR_materials_sheen
                    if (sheen) {
                        if (sheen.hasOwnProperty('sheenColorTexture')) {
                            const gltfTexture = gltf.textures[sheen.sheenColorTexture.index]
                            set.add(getTextureSource(gltfTexture))
                        }
                    }
                    const specularGlossiness = gltfMaterial.extensions.KHR_materials_pbrSpecularGlossiness
                    if (specularGlossiness) {
                        if (specularGlossiness.hasOwnProperty('specularGlossinessTexture')) {
                            const gltfTexture = gltf.textures[specularGlossiness.specularGlossinessTexture.index]
                            set.add(getTextureSource(gltfTexture))
                        }
                    }
                    const specular = gltfMaterial.extensions.KHR_materials_specular
                    if (specular) {
                        if (specular.hasOwnProperty('specularColorTexture')) {
                            const gltfTexture = gltf.textures[specular.specularColorTexture.index]
                            set.add(getTextureSource(gltfTexture))
                        }
                    }
                }
            })
        }
        return set
    }
    const loadTexture = (gltfImage, url, bufferView, mimeType, options, srgb) => {
        return new Promise((resolve, reject) => {
            const continuation = (bufferViewData) => {
                const name = `${gltfImage.name || 'gltf-texture'}-${gltfTextureUniqueId++}`
                const file = {
                    url: url || name,
                }
                if (bufferViewData) {
                    file.contents = bufferViewData.slice(0).buffer
                }
                if (mimeType) {
                    const extension = mimeTypeFileExtensions[mimeType]
                    if (extension) {
                        file.filename = `${file.url}.${extension}`
                    }
                }
                const data = {
                    srgb,
                }
                const asset = new Asset(name, 'texture', file, data, options)
                asset.on('load', (asset) => resolve(asset))
                asset.on('error', (err) => reject(err))
                registry.add(asset)
                registry.load(asset)
            }
            if (bufferView) {
                bufferView.then((bufferViewData) => continuation(bufferViewData))
            } else {
                continuation(null)
            }
        })
    }
    const gammaTextures = getGammaTextures(gltf)
    return gltf.images.map((gltfImage, i) => {
        if (preprocess) {
            preprocess(gltfImage)
        }
        let promise
        if (processAsync) {
            promise = new Promise((resolve, reject) => {
                processAsync(gltfImage, (err, textureAsset) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(textureAsset)
                    }
                })
            })
        } else {
            promise = new Promise((resolve) => {
                resolve(null)
            })
        }
        promise = promise.then((textureAsset) => {
            const srgb = gammaTextures.has(i)
            if (textureAsset) {
                return textureAsset
            } else if (gltfImage.hasOwnProperty('uri')) {
                if (isDataURI(gltfImage.uri)) {
                    return loadTexture(gltfImage, gltfImage.uri, null, getDataURIMimeType(gltfImage.uri), null, srgb)
                }
                return loadTexture(
                    gltfImage,
                    ABSOLUTE_URL.test(gltfImage.uri) ? gltfImage.uri : path.join(urlBase, gltfImage.uri),
                    null,
                    null,
                    {
                        crossOrigin: 'anonymous',
                    },
                    srgb,
                )
            } else if (gltfImage.hasOwnProperty('bufferView') && gltfImage.hasOwnProperty('mimeType')) {
                return loadTexture(gltfImage, null, bufferViews[gltfImage.bufferView], gltfImage.mimeType, null, srgb)
            }
            return Promise.reject(
                new Error(`Invalid image found in gltf (neither uri or bufferView found). index=${i}`),
            )
        })
        if (postprocess) {
            promise = promise.then((textureAsset) => {
                postprocess(gltfImage, textureAsset)
                return textureAsset
            })
        }
        return promise
    })
}
const createTextures = (gltf, images, options) => {
    if (!gltf?.images?.length || !gltf?.textures?.length) {
        return []
    }
    const preprocess = options?.texture?.preprocess
    const processAsync = options?.texture?.processAsync
    const postprocess = options?.texture?.postprocess
    const seenImages = new Set()
    return gltf.textures.map((gltfTexture) => {
        if (preprocess) {
            preprocess(gltfTexture)
        }
        let promise
        if (processAsync) {
            promise = new Promise((resolve, reject) => {
                processAsync(gltfTexture, gltf.images, (err, gltfImageIndex) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(gltfImageIndex)
                    }
                })
            })
        } else {
            promise = new Promise((resolve) => {
                resolve(null)
            })
        }
        promise = promise.then((gltfImageIndex) => {
            gltfImageIndex = gltfImageIndex ?? getTextureSource(gltfTexture)
            const cloneAsset = seenImages.has(gltfImageIndex)
            seenImages.add(gltfImageIndex)
            return images[gltfImageIndex].then((imageAsset) => {
                const asset = cloneAsset ? cloneTextureAsset(imageAsset) : imageAsset
                applySampler(asset.resource, (gltf.samplers ?? [])[gltfTexture.sampler])
                return asset
            })
        })
        if (postprocess) {
            promise = promise.then((textureAsset) => {
                postprocess(gltfTexture, textureAsset)
                return textureAsset
            })
        }
        return promise
    })
}
const loadBuffers = (gltf, binaryChunk, urlBase, options) => {
    if (!gltf.buffers || gltf.buffers.length === 0) {
        return []
    }
    const preprocess = options?.buffer?.preprocess
    const processAsync = options?.buffer?.processAsync
    const postprocess = options?.buffer?.postprocess
    return gltf.buffers.map((gltfBuffer, i) => {
        if (preprocess) {
            preprocess(gltfBuffer)
        }
        let promise
        if (processAsync) {
            promise = new Promise((resolve, reject) => {
                processAsync(gltfBuffer, (err, arrayBuffer) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(arrayBuffer)
                    }
                })
            })
        } else {
            promise = new Promise((resolve) => {
                resolve(null)
            })
        }
        promise = promise.then((arrayBuffer) => {
            if (arrayBuffer) {
                return arrayBuffer
            } else if (gltfBuffer.hasOwnProperty('uri')) {
                if (isDataURI(gltfBuffer.uri)) {
                    const byteString = atob(gltfBuffer.uri.split(',')[1])
                    const binaryArray = new Uint8Array(byteString.length)
                    for (let j = 0; j < byteString.length; j++) {
                        binaryArray[j] = byteString.charCodeAt(j)
                    }
                    return binaryArray
                }
                return new Promise((resolve, reject) => {
                    http.get(
                        ABSOLUTE_URL.test(gltfBuffer.uri) ? gltfBuffer.uri : path.join(urlBase, gltfBuffer.uri),
                        {
                            cache: true,
                            responseType: 'arraybuffer',
                            retry: false,
                        },
                        (err, result) => {
                            if (err) {
                                reject(err)
                            } else {
                                resolve(new Uint8Array(result))
                            }
                        },
                    )
                })
            }
            return binaryChunk
        })
        if (postprocess) {
            promise = promise.then((buffer) => {
                postprocess(gltf.buffers[i], buffer)
                return buffer
            })
        }
        return promise
    })
}
const parseGltf = (gltfChunk, callback) => {
    const decodeBinaryUtf8 = (array) => {
        if (typeof TextDecoder !== 'undefined') {
            return new TextDecoder().decode(array)
        }
        let str = ''
        for (let i = 0; i < array.length; i++) {
            str += String.fromCharCode(array[i])
        }
        return decodeURIComponent(escape(str))
    }
    const gltf = JSON.parse(decodeBinaryUtf8(gltfChunk))
    if (gltf.asset && gltf.asset.version && parseFloat(gltf.asset.version) < 2) {
        callback(`Invalid gltf version. Expected version 2.0 or above but found version '${gltf.asset.version}'.`)
        return
    }
    callback(null, gltf)
}
const parseGlb = (glbData, callback) => {
    const data =
        glbData instanceof ArrayBuffer
            ? new DataView(glbData)
            : new DataView(glbData.buffer, glbData.byteOffset, glbData.byteLength)
    const magic = data.getUint32(0, true)
    const version = data.getUint32(4, true)
    const length = data.getUint32(8, true)
    if (magic !== 0x46546c67) {
        callback(`Invalid magic number found in glb header. Expected 0x46546C67, found 0x${magic.toString(16)}`)
        return
    }
    if (version !== 2) {
        callback(`Invalid version number found in glb header. Expected 2, found ${version}`)
        return
    }
    if (length <= 0 || length > data.byteLength) {
        callback(`Invalid length found in glb header. Found ${length}`)
        return
    }
    const chunks = []
    let offset = 12
    while (offset < length) {
        const chunkLength = data.getUint32(offset, true)
        if (offset + chunkLength + 8 > data.byteLength) {
            callback(`Invalid chunk length found in glb. Found ${chunkLength}`)
        }
        const chunkType = data.getUint32(offset + 4, true)
        const chunkData = new Uint8Array(data.buffer, data.byteOffset + offset + 8, chunkLength)
        chunks.push({
            length: chunkLength,
            type: chunkType,
            data: chunkData,
        })
        offset += chunkLength + 8
    }
    if (chunks.length !== 1 && chunks.length !== 2) {
        callback('Invalid number of chunks found in glb file.')
        return
    }
    if (chunks[0].type !== 0x4e4f534a) {
        callback(`Invalid chunk type found in glb file. Expected 0x4E4F534A, found 0x${chunks[0].type.toString(16)}`)
        return
    }
    if (chunks.length > 1 && chunks[1].type !== 0x004e4942) {
        callback(`Invalid chunk type found in glb file. Expected 0x004E4942, found 0x${chunks[1].type.toString(16)}`)
        return
    }
    callback(null, {
        gltfChunk: chunks[0].data,
        binaryChunk: chunks.length === 2 ? chunks[1].data : null,
    })
}
const parseChunk = (filename, data, callback) => {
    const hasGlbHeader = () => {
        const u8 = new Uint8Array(data)
        return u8[0] === 103 && u8[1] === 108 && u8[2] === 84 && u8[3] === 70
    }
    if ((filename && filename.toLowerCase().endsWith('.glb')) || hasGlbHeader()) {
        parseGlb(data, callback)
    } else {
        callback(null, {
            gltfChunk: data,
            binaryChunk: null,
        })
    }
}
const createBufferViews = (gltf, buffers, options) => {
    const result = []
    const preprocess = options?.bufferView?.preprocess
    const processAsync = options?.bufferView?.processAsync
    const postprocess = options?.bufferView?.postprocess
    if (!gltf.bufferViews?.length) {
        return result
    }
    for (let i = 0; i < gltf.bufferViews.length; ++i) {
        const gltfBufferView = gltf.bufferViews[i]
        if (preprocess) {
            preprocess(gltfBufferView)
        }
        let promise
        if (processAsync) {
            promise = new Promise((resolve, reject) => {
                processAsync(gltfBufferView, buffers, (err, result) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(result)
                    }
                })
            })
        } else {
            promise = new Promise((resolve) => {
                resolve(null)
            })
        }
        promise = promise.then((buffer) => {
            if (buffer) {
                return buffer
            }
            return buffers[gltfBufferView.buffer].then((buffer) => {
                return new Uint8Array(
                    buffer.buffer,
                    buffer.byteOffset + (gltfBufferView.byteOffset || 0),
                    gltfBufferView.byteLength,
                )
            })
        })
        if (gltfBufferView.hasOwnProperty('byteStride')) {
            promise = promise.then((typedArray) => {
                typedArray.byteStride = gltfBufferView.byteStride
                return typedArray
            })
        }
        if (postprocess) {
            promise = promise.then((typedArray) => {
                postprocess(gltfBufferView, typedArray)
                return typedArray
            })
        }
        result.push(promise)
    }
    return result
}
class GlbParser {
    static parse(filename, urlBase, data, device, registry, options, callback) {
        parseChunk(filename, data, (err, chunks) => {
            if (err) {
                callback(err)
                return
            }
            parseGltf(chunks.gltfChunk, (err, gltf) => {
                if (err) {
                    callback(err)
                    return
                }
                const buffers = loadBuffers(gltf, chunks.binaryChunk, urlBase, options)
                const bufferViews = createBufferViews(gltf, buffers, options)
                const images = createImages(gltf, bufferViews, urlBase, registry, options)
                const textures = createTextures(gltf, images, options)
                createResources(device, gltf, bufferViews, textures, options)
                    .then((result) => callback(null, result))
                    .catch((err) => callback(err))
            })
        })
    }
    static createDefaultMaterial() {
        return createMaterial(
            {
                name: 'defaultGlbMaterial',
            },
            [],
        )
    }
}

class BinaryHandler extends ResourceHandler {
    load(url, callback) {
        if (typeof url === 'string') {
            url = {
                load: url,
                original: url,
            }
        }
        http.get(
            url.load,
            {
                responseType: Http.ResponseType.ARRAY_BUFFER,
                retry: this.maxRetries > 0,
                maxRetries: this.maxRetries,
            },
            (err, response) => {
                if (!err) {
                    callback(null, response)
                } else {
                    callback(`Error loading binary resource: ${url.original} [${err}]`)
                }
            },
        )
    }
    openBinary(data) {
        return data.buffer
    }
    constructor(app) {
        super(app, 'binary')
    }
}

class GlbContainerResource {
    get model() {
        if (!this._model) {
            const model = GlbContainerResource.createModel(this.data, this._defaultMaterial)
            const modelAsset = GlbContainerResource.createAsset(this._assetName, 'model', model, 0)
            this._assets.add(modelAsset)
            this._model = modelAsset
        }
        return this._model
    }
    static createAsset(assetName, type, resource, index) {
        const subAsset = new Asset(`${assetName}/${type}/${index}`, type, {
            url: '',
        })
        subAsset.resource = resource
        subAsset.loaded = true
        return subAsset
    }
    instantiateModelEntity(options) {
        const entity = new Entity(undefined, this._assets._loader._app)
        entity.addComponent(
            'model',
            Object.assign(
                {
                    type: 'asset',
                    asset: this.model,
                },
                options,
            ),
        )
        return entity
    }
    instantiateRenderEntity(options) {
        const defaultMaterial = this._defaultMaterial
        const skinnedMeshInstances = []
        const createMeshInstance = function (
            root,
            entity,
            mesh,
            materials,
            meshDefaultMaterials,
            skins,
            gltfNode,
            nodeInstancingMap,
        ) {
            const materialIndex = meshDefaultMaterials[mesh.id]
            const material = materialIndex === undefined ? defaultMaterial : materials[materialIndex]
            const meshInstance = new MeshInstance(mesh, material)
            if (mesh.morph) {
                meshInstance.morphInstance = new MorphInstance(mesh.morph)
            }
            if (gltfNode.hasOwnProperty('skin')) {
                skinnedMeshInstances.push({
                    meshInstance: meshInstance,
                    rootBone: root,
                    entity: entity,
                })
            }
            const instData = nodeInstancingMap.get(gltfNode)
            if (instData) {
                const matrices = instData.matrices
                const vbFormat = VertexFormat.getDefaultInstancingFormat(mesh.device)
                const vb = new VertexBuffer(mesh.device, vbFormat, matrices.length / 16, {
                    data: matrices,
                })
                meshInstance.setInstancing(vb)
                meshInstance.instancingData._destroyVertexBuffer = true
            }
            return meshInstance
        }
        const cloneHierarchy = (root, node, glb) => {
            const entity = new Entity(undefined, this._assets._loader._app)
            node._cloneInternal(entity)
            if (!root) root = entity
            let attachedMi = null
            let renderAsset = null
            for (let i = 0; i < glb.nodes.length; i++) {
                const glbNode = glb.nodes[i]
                if (glbNode === node) {
                    const gltfNode = glb.gltf.nodes[i]
                    if (gltfNode.hasOwnProperty('mesh')) {
                        const meshGroup = glb.renders[gltfNode.mesh].meshes
                        renderAsset = this.renders[gltfNode.mesh]
                        for (let mi = 0; mi < meshGroup.length; mi++) {
                            const mesh = meshGroup[mi]
                            if (mesh) {
                                const cloneMi = createMeshInstance(
                                    root,
                                    entity,
                                    mesh,
                                    glb.materials,
                                    glb.meshDefaultMaterials,
                                    glb.skins,
                                    gltfNode,
                                    glb.nodeInstancingMap,
                                )
                                if (!attachedMi) {
                                    attachedMi = []
                                }
                                attachedMi.push(cloneMi)
                            }
                        }
                    }
                    if (glb.lights) {
                        const lightEntity = glb.lights.get(gltfNode)
                        if (lightEntity) {
                            entity.addChild(lightEntity.clone())
                        }
                    }
                    if (glb.cameras) {
                        const cameraEntity = glb.cameras.get(gltfNode)
                        if (cameraEntity) {
                            cameraEntity.camera.system.cloneComponent(cameraEntity, entity)
                        }
                    }
                }
            }
            if (attachedMi) {
                entity.addComponent(
                    'render',
                    Object.assign(
                        {
                            type: 'asset',
                            meshInstances: attachedMi,
                        },
                        options,
                    ),
                )
                entity.render.assignAsset(renderAsset)
            }
            const children = node.children
            for (let i = 0; i < children.length; i++) {
                const childClone = cloneHierarchy(root, children[i], glb)
                entity.addChild(childClone)
            }
            return entity
        }
        const sceneClones = []
        for (const scene of this.data.scenes) {
            sceneClones.push(cloneHierarchy(null, scene, this.data))
        }
        skinnedMeshInstances.forEach((data) => {
            data.meshInstance.skinInstance = SkinInstanceCache.createCachedSkinInstance(
                data.meshInstance.mesh.skin,
                data.rootBone,
                data.entity,
            )
            data.meshInstance.node.render.rootBone = data.rootBone
        })
        return GlbContainerResource.createSceneHierarchy(sceneClones, Entity)
    }
    getMaterialVariants() {
        return this.data.variants ? Object.keys(this.data.variants) : []
    }
    applyMaterialVariant(entity, name) {
        const variant = name ? this.data.variants[name] : null
        if (variant === undefined) {
            return
        }
        const renders = entity.findComponents('render')
        for (let i = 0; i < renders.length; i++) {
            const renderComponent = renders[i]
            this._applyMaterialVariant(variant, renderComponent.meshInstances)
        }
    }
    applyMaterialVariantInstances(instances, name) {
        const variant = name ? this.data.variants[name] : null
        if (variant === undefined) {
            return
        }
        this._applyMaterialVariant(variant, instances)
    }
    _applyMaterialVariant(variant, instances) {
        instances.forEach((instance) => {
            if (variant === null) {
                instance.material = this._defaultMaterial
            } else {
                const meshVariants = this.data.meshVariants[instance.mesh.id]
                if (meshVariants) {
                    instance.material = this.data.materials[meshVariants[variant]]
                }
            }
        })
    }
    static createSceneHierarchy(sceneNodes, nodeType) {
        let root = null
        if (sceneNodes.length === 1) {
            root = sceneNodes[0]
        } else {
            root = new nodeType('SceneGroup')
            for (const scene of sceneNodes) {
                root.addChild(scene)
            }
        }
        return root
    }
    static createModel(glb, defaultMaterial) {
        const createMeshInstance = function (model, mesh, skins, skinInstances, materials, node, gltfNode) {
            const materialIndex = glb.meshDefaultMaterials[mesh.id]
            const material = materialIndex === undefined ? defaultMaterial : materials[materialIndex]
            const meshInstance = new MeshInstance(mesh, material, node)
            if (mesh.morph) {
                const morphInstance = new MorphInstance(mesh.morph)
                meshInstance.morphInstance = morphInstance
                model.morphInstances.push(morphInstance)
            }
            if (gltfNode.hasOwnProperty('skin')) {
                const skinIndex = gltfNode.skin
                const skin = skins[skinIndex]
                mesh.skin = skin
                const skinInstance = skinInstances[skinIndex]
                meshInstance.skinInstance = skinInstance
                model.skinInstances.push(skinInstance)
            }
            model.meshInstances.push(meshInstance)
        }
        const model = new Model()
        const skinInstances = []
        for (const skin of glb.skins) {
            const skinInstance = new SkinInstance(skin)
            skinInstance.bones = skin.bones
            skinInstances.push(skinInstance)
        }
        model.graph = GlbContainerResource.createSceneHierarchy(glb.scenes, GraphNode)
        for (let i = 0; i < glb.nodes.length; i++) {
            const node = glb.nodes[i]
            if (node.root === model.graph) {
                const gltfNode = glb.gltf.nodes[i]
                if (gltfNode.hasOwnProperty('mesh')) {
                    const meshGroup = glb.renders[gltfNode.mesh].meshes
                    for (let mi = 0; mi < meshGroup.length; mi++) {
                        const mesh = meshGroup[mi]
                        if (mesh) {
                            createMeshInstance(model, mesh, glb.skins, skinInstances, glb.materials, node, gltfNode)
                        }
                    }
                }
            }
        }
        return model
    }
    destroy() {
        const registry = this._assets
        const destroyAsset = function (asset) {
            registry.remove(asset)
            asset.unload()
        }
        const destroyAssets = function (assets) {
            assets.forEach((asset) => {
                destroyAsset(asset)
            })
        }
        if (this.animations) {
            destroyAssets(this.animations)
            this.animations = null
        }
        if (this.textures) {
            destroyAssets(this.textures)
            this.textures = null
        }
        if (this.materials) {
            destroyAssets(this.materials)
            this.materials = null
        }
        if (this.renders) {
            destroyAssets(this.renders)
            this.renders = null
        }
        if (this._model) {
            destroyAsset(this._model)
            this._model = null
        }
        this.data = null
        this.assets = null
    }
    constructor(data, asset, assets, defaultMaterial) {
        const createAsset = function (type, resource, index) {
            const subAsset = GlbContainerResource.createAsset(asset.name, type, resource, index)
            assets.add(subAsset)
            return subAsset
        }
        const renders = []
        for (let i = 0; i < data.renders.length; ++i) {
            renders.push(createAsset('render', data.renders[i], i))
        }
        const materials = []
        for (let i = 0; i < data.materials.length; ++i) {
            materials.push(createAsset('material', data.materials[i], i))
        }
        const animations = []
        for (let i = 0; i < data.animations.length; ++i) {
            animations.push(createAsset('animation', data.animations[i], i))
        }
        this.data = data
        this._model = null
        this._assetName = asset.name
        this._assets = assets
        this._defaultMaterial = defaultMaterial
        this.renders = renders
        this.materials = materials
        this.textures = data.textures
        this.animations = animations
    }
}

class GlbContainerParser {
    _getUrlWithoutParams(url) {
        return url.indexOf('?') >= 0 ? url.split('?')[0] : url
    }
    load(url, callback, asset) {
        Asset.fetchArrayBuffer(
            url.load,
            (err, result) => {
                if (err) {
                    callback(err)
                } else {
                    GlbParser.parse(
                        this._getUrlWithoutParams(url.original),
                        path.extractPath(url.load),
                        result,
                        this._device,
                        asset.registry,
                        asset.options,
                        (err, result) => {
                            if (err) {
                                callback(err)
                            } else {
                                callback(
                                    null,
                                    new GlbContainerResource(result, asset, this._assets, this._defaultMaterial),
                                )
                            }
                        },
                    )
                }
            },
            asset,
            this.maxRetries,
        )
    }
    open(url, data, asset) {
        return data
    }
    patch(asset, assets) {}
    constructor(device, assets, maxRetries) {
        this._device = device
        this._assets = assets
        this._defaultMaterial = GlbParser.createDefaultMaterial()
        this.maxRetries = maxRetries
    }
}

class ContainerHandler extends ResourceHandler {
    set maxRetries(value) {
        this.glbContainerParser.maxRetries = value
        for (const parser in this.parsers) {
            if (this.parsers.hasOwnProperty(parser)) {
                this.parsers[parser].maxRetries = value
            }
        }
    }
    get maxRetries() {
        return this.glbContainerParser.maxRetries
    }
    _getUrlWithoutParams(url) {
        return url.indexOf('?') >= 0 ? url.split('?')[0] : url
    }
    _getParser(url) {
        const ext = url ? path.getExtension(this._getUrlWithoutParams(url)).toLowerCase().replace('.', '') : null
        return this.parsers[ext] || this.glbContainerParser
    }
    load(url, callback, asset) {
        if (typeof url === 'string') {
            url = {
                load: url,
                original: url,
            }
        }
        this._getParser(url.original).load(url, callback, asset)
    }
    open(url, data, asset) {
        return this._getParser(url).open(url, data, asset)
    }
    constructor(app) {
        super(app, 'container')
        this.glbContainerParser = new GlbContainerParser(app.graphicsDevice, app.assets, 0)
        this.parsers = {}
    }
}

const SH_C0 = 0.28209479177387814
class SplatCompressedIterator {
    constructor(gsplatData, p, r, s, c, sh) {
        const unpackUnorm = (value, bits) => {
            const t = (1 << bits) - 1
            return (value & t) / t
        }
        const unpack111011 = (result, value) => {
            result.x = unpackUnorm(value >>> 21, 11)
            result.y = unpackUnorm(value >>> 11, 10)
            result.z = unpackUnorm(value, 11)
        }
        const unpack8888 = (result, value) => {
            result.x = unpackUnorm(value >>> 24, 8)
            result.y = unpackUnorm(value >>> 16, 8)
            result.z = unpackUnorm(value >>> 8, 8)
            result.w = unpackUnorm(value, 8)
        }
        const unpackRot = (result, value) => {
            const norm = Math.SQRT2
            const a = (unpackUnorm(value >>> 20, 10) - 0.5) * norm
            const b = (unpackUnorm(value >>> 10, 10) - 0.5) * norm
            const c = (unpackUnorm(value, 10) - 0.5) * norm
            const m = Math.sqrt(1.0 - (a * a + b * b + c * c))
            switch (value >>> 30) {
                case 0:
                    result.set(a, b, c, m)
                    break
                case 1:
                    result.set(m, b, c, a)
                    break
                case 2:
                    result.set(b, m, c, a)
                    break
                case 3:
                    result.set(b, c, m, a)
                    break
            }
        }
        const lerp = (a, b, t) => a * (1 - t) + b * t
        const { chunkData, chunkSize, vertexData, shData0, shData1, shData2, shBands } = gsplatData
        const shCoeffs = [3, 8, 15][shBands - 1]
        this.read = (i) => {
            const ci = Math.floor(i / 256) * chunkSize
            if (p) {
                unpack111011(p, vertexData[i * 4 + 0])
                p.x = lerp(chunkData[ci + 0], chunkData[ci + 3], p.x)
                p.y = lerp(chunkData[ci + 1], chunkData[ci + 4], p.y)
                p.z = lerp(chunkData[ci + 2], chunkData[ci + 5], p.z)
            }
            if (r) {
                unpackRot(r, vertexData[i * 4 + 1])
            }
            if (s) {
                unpack111011(s, vertexData[i * 4 + 2])
                s.x = lerp(chunkData[ci + 6], chunkData[ci + 9], s.x)
                s.y = lerp(chunkData[ci + 7], chunkData[ci + 10], s.y)
                s.z = lerp(chunkData[ci + 8], chunkData[ci + 11], s.z)
            }
            if (c) {
                unpack8888(c, vertexData[i * 4 + 3])
                if (chunkSize > 12) {
                    c.x = lerp(chunkData[ci + 12], chunkData[ci + 15], c.x)
                    c.y = lerp(chunkData[ci + 13], chunkData[ci + 16], c.y)
                    c.z = lerp(chunkData[ci + 14], chunkData[ci + 17], c.z)
                }
            }
            if (sh && shBands > 0) {
                const shData = [shData0, shData1, shData2]
                for (let j = 0; j < 3; ++j) {
                    for (let k = 0; k < 15; ++k) {
                        sh[j * 15 + k] = k < shCoeffs ? shData[j][i * 16 + k] * (8 / 255) - 4 : 0
                    }
                }
            }
        }
    }
}
class GSplatCompressedData {
    createIter(p, r, s, c, sh) {
        return new SplatCompressedIterator(this, p, r, s, c, sh)
    }
    calcAabb(result) {
        const { chunkData, numChunks, chunkSize } = this
        let s = Math.exp(Math.max(chunkData[9], chunkData[10], chunkData[11]))
        let mx = chunkData[0] - s
        let my = chunkData[1] - s
        let mz = chunkData[2] - s
        let Mx = chunkData[3] + s
        let My = chunkData[4] + s
        let Mz = chunkData[5] + s
        for (let i = 1; i < numChunks; ++i) {
            const off = i * chunkSize
            s = Math.exp(Math.max(chunkData[off + 9], chunkData[off + 10], chunkData[off + 11]))
            mx = Math.min(mx, chunkData[off + 0] - s)
            my = Math.min(my, chunkData[off + 1] - s)
            mz = Math.min(mz, chunkData[off + 2] - s)
            Mx = Math.max(Mx, chunkData[off + 3] + s)
            My = Math.max(My, chunkData[off + 4] + s)
            Mz = Math.max(Mz, chunkData[off + 5] + s)
        }
        result.center.set((mx + Mx) * 0.5, (my + My) * 0.5, (mz + Mz) * 0.5)
        result.halfExtents.set((Mx - mx) * 0.5, (My - my) * 0.5, (Mz - mz) * 0.5)
        return true
    }
    getCenters() {
        const { vertexData, chunkData, numChunks, chunkSize } = this
        const result = new Float32Array(this.numSplats * 3)
        let mx, my, mz, Mx, My, Mz
        for (let c = 0; c < numChunks; ++c) {
            const off = c * chunkSize
            mx = chunkData[off + 0]
            my = chunkData[off + 1]
            mz = chunkData[off + 2]
            Mx = chunkData[off + 3]
            My = chunkData[off + 4]
            Mz = chunkData[off + 5]
            const end = Math.min(this.numSplats, (c + 1) * 256)
            for (let i = c * 256; i < end; ++i) {
                const p = vertexData[i * 4]
                const px = (p >>> 21) / 2047
                const py = ((p >>> 11) & 0x3ff) / 1023
                const pz = (p & 0x7ff) / 2047
                result[i * 3 + 0] = (1 - px) * mx + px * Mx
                result[i * 3 + 1] = (1 - py) * my + py * My
                result[i * 3 + 2] = (1 - pz) * mz + pz * Mz
            }
        }
        return result
    }
    getChunks(result) {
        const { chunkData, numChunks, chunkSize } = this
        let mx, my, mz, Mx, My, Mz
        for (let c = 0; c < numChunks; ++c) {
            const off = c * chunkSize
            mx = chunkData[off + 0]
            my = chunkData[off + 1]
            mz = chunkData[off + 2]
            Mx = chunkData[off + 3]
            My = chunkData[off + 4]
            Mz = chunkData[off + 5]
            result[c * 6 + 0] = mx
            result[c * 6 + 1] = my
            result[c * 6 + 2] = mz
            result[c * 6 + 3] = Mx
            result[c * 6 + 4] = My
            result[c * 6 + 5] = Mz
        }
    }
    calcFocalPoint(result) {
        const { chunkData, numChunks, chunkSize } = this
        result.x = 0
        result.y = 0
        result.z = 0
        for (let i = 0; i < numChunks; ++i) {
            const off = i * chunkSize
            result.x += chunkData[off + 0] + chunkData[off + 3]
            result.y += chunkData[off + 1] + chunkData[off + 4]
            result.z += chunkData[off + 2] + chunkData[off + 5]
        }
        result.mulScalar(0.5 / numChunks)
    }
    get isCompressed() {
        return true
    }
    get numChunks() {
        return Math.ceil(this.numSplats / 256)
    }
    get chunkSize() {
        return this.chunkData.length / this.numChunks
    }
    decompress() {
        const members = [
            'x',
            'y',
            'z',
            'f_dc_0',
            'f_dc_1',
            'f_dc_2',
            'opacity',
            'scale_0',
            'scale_1',
            'scale_2',
            'rot_0',
            'rot_1',
            'rot_2',
            'rot_3',
        ]
        const { shBands } = this
        if (shBands > 0) {
            const shMembers = []
            for (let i = 0; i < 45; ++i) {
                shMembers.push(`f_rest_${i}`)
            }
            const location = Math.max(...['f_dc_0', 'f_dc_1', 'f_dc_2'].map((name) => members.indexOf(name)))
            members.splice(location + 1, 0, ...shMembers)
        }
        const data = {}
        members.forEach((name) => {
            data[name] = new Float32Array(this.numSplats)
        })
        const p = new Vec3()
        const r = new Quat()
        const s = new Vec3()
        const c = new Vec4()
        const sh = shBands > 0 ? new Float32Array(45) : null
        const iter = this.createIter(p, r, s, c, sh)
        for (let i = 0; i < this.numSplats; ++i) {
            iter.read(i)
            data.x[i] = p.x
            data.y[i] = p.y
            data.z[i] = p.z
            data.rot_1[i] = r.x
            data.rot_2[i] = r.y
            data.rot_3[i] = r.z
            data.rot_0[i] = r.w
            data.scale_0[i] = s.x
            data.scale_1[i] = s.y
            data.scale_2[i] = s.z
            data.f_dc_0[i] = (c.x - 0.5) / SH_C0
            data.f_dc_1[i] = (c.y - 0.5) / SH_C0
            data.f_dc_2[i] = (c.z - 0.5) / SH_C0
            data.opacity[i] = c.w <= 0 ? -40 : c.w >= 1 ? 40 : -Math.log(1 / c.w - 1)
            if (sh) {
                for (let c = 0; c < 45; ++c) {
                    data[`f_rest_${c}`][i] = sh[c]
                }
            }
        }
        return new GSplatData(
            [
                {
                    name: 'vertex',
                    count: this.numSplats,
                    properties: members.map((name) => {
                        return {
                            name: name,
                            type: 'float',
                            byteSize: 4,
                            storage: data[name],
                        }
                    }),
                },
            ],
            this.comments,
        )
    }
}

const strideCopy = (target, targetStride, src, srcStride, numEntries) => {
    for (let i = 0; i < numEntries; ++i) {
        for (let j = 0; j < srcStride; ++j) {
            target[i * targetStride + j] = src[i * srcStride + j]
        }
    }
}
class GSplatCompressedResource extends GSplatResourceBase {
    destroy() {
        super.destroy()
    }
    configureMaterialDefines(defines) {
        defines.set('SH_BANDS', this.streams.textures.has('shTexture0') ? 3 : 0)
    }
    evalChunkTextureSize(numChunks) {
        const width = Math.ceil(Math.sqrt(numChunks))
        const height = Math.ceil(numChunks / width)
        return new Vec2(width * 5, height)
    }
    constructor(device, gsplatData) {
        super(device, gsplatData)
        const { chunkData, chunkSize, numChunks, numSplats, vertexData, shBands } = gsplatData
        this.chunks = new Float32Array(numChunks * 6)
        gsplatData.getChunks(this.chunks)
        const formatStreams = [
            {
                name: 'packedTexture',
                format: PIXELFORMAT_RGBA32U,
            },
        ]
        if (shBands > 0) {
            formatStreams.push({
                name: 'shTexture0',
                format: PIXELFORMAT_RGBA32U,
            })
            formatStreams.push({
                name: 'shTexture1',
                format: PIXELFORMAT_RGBA32U,
            })
            formatStreams.push({
                name: 'shTexture2',
                format: PIXELFORMAT_RGBA32U,
            })
        }
        this._format = new GSplatFormat(device, formatStreams, {
            readGLSL: '#include "gsplatCompressedVS"',
            readWGSL: '#include "gsplatCompressedVS"',
        })
        this.streams.init(this.format, numSplats)
        const packedTexture = this.streams.getTexture('packedTexture')
        const packedData = packedTexture.lock()
        packedData.set(vertexData)
        packedTexture.unlock()
        if (shBands > 0) {
            const shTexture0 = this.streams.getTexture('shTexture0')
            const shTexture1 = this.streams.getTexture('shTexture1')
            const shTexture2 = this.streams.getTexture('shTexture2')
            const sh0Data = shTexture0.lock()
            sh0Data.set(new Uint32Array(gsplatData.shData0.buffer))
            shTexture0.unlock()
            const sh1Data = shTexture1.lock()
            sh1Data.set(new Uint32Array(gsplatData.shData1.buffer))
            shTexture1.unlock()
            const sh2Data = shTexture2.lock()
            sh2Data.set(new Uint32Array(gsplatData.shData2.buffer))
            shTexture2.unlock()
        }
        const chunkTextureSize = this.evalChunkTextureSize(numChunks)
        const chunkTexture = this.streams.createTexture('chunkTexture', PIXELFORMAT_RGBA32F, chunkTextureSize)
        this.streams.textures.set('chunkTexture', chunkTexture)
        const chunkTextureData = chunkTexture.lock()
        strideCopy(chunkTextureData, 20, chunkData, chunkSize, numChunks)
        if (chunkSize === 12) {
            for (let i = 0; i < numChunks; ++i) {
                chunkTextureData[i * 20 + 15] = 1
                chunkTextureData[i * 20 + 16] = 1
                chunkTextureData[i * 20 + 17] = 1
            }
        }
        chunkTexture.unlock()
    }
}

const magicBytes = new Uint8Array([112, 108, 121, 10])
const endHeaderBytes = new Uint8Array([10, 101, 110, 100, 95, 104, 101, 97, 100, 101, 114, 10])
const dataTypeMap = new Map([
    ['char', Int8Array],
    ['uchar', Uint8Array],
    ['short', Int16Array],
    ['ushort', Uint16Array],
    ['int', Int32Array],
    ['uint', Uint32Array],
    ['float', Float32Array],
    ['double', Float64Array],
])
class StreamBuf {
    async read() {
        const { value, done } = await this.reader.read()
        if (done) {
            throw new Error('Stream finished before end of header')
        }
        this.push(value)
        this.progressFunc?.(value.byteLength)
    }
    push(data) {
        if (!this.data) {
            this.data = data
            this.view = new DataView(this.data.buffer)
            this.tail = data.length
        } else {
            const remaining = this.tail - this.head
            const newSize = remaining + data.length
            if (this.data.length >= newSize) {
                if (this.head > 0) {
                    this.data.copyWithin(0, this.head, this.tail)
                    this.data.set(data, remaining)
                    this.head = 0
                    this.tail = newSize
                } else {
                    this.data.set(data, this.tail)
                    this.tail += data.length
                }
            } else {
                const tmp = new Uint8Array(newSize)
                if (this.head > 0 || this.tail < this.data.length) {
                    tmp.set(this.data.subarray(this.head, this.tail), 0)
                } else {
                    tmp.set(this.data, 0)
                }
                tmp.set(data, remaining)
                this.data = tmp
                this.view = new DataView(this.data.buffer)
                this.head = 0
                this.tail = newSize
            }
        }
    }
    compact() {
        if (this.head > 0) {
            this.data.copyWithin(0, this.head, this.tail)
            this.tail -= this.head
            this.head = 0
        }
    }
    get remaining() {
        return this.tail - this.head
    }
    getInt8() {
        const result = this.view.getInt8(this.head)
        this.head++
        return result
    }
    getUint8() {
        const result = this.view.getUint8(this.head)
        this.head++
        return result
    }
    getInt16() {
        const result = this.view.getInt16(this.head, true)
        this.head += 2
        return result
    }
    getUint16() {
        const result = this.view.getUint16(this.head, true)
        this.head += 2
        return result
    }
    getInt32() {
        const result = this.view.getInt32(this.head, true)
        this.head += 4
        return result
    }
    getUint32() {
        const result = this.view.getUint32(this.head, true)
        this.head += 4
        return result
    }
    getFloat32() {
        const result = this.view.getFloat32(this.head, true)
        this.head += 4
        return result
    }
    getFloat64() {
        const result = this.view.getFloat64(this.head, true)
        this.head += 8
        return result
    }
    constructor(reader, progressFunc) {
        this.head = 0
        this.tail = 0
        this.reader = reader
        this.progressFunc = progressFunc
    }
}
const parseHeader = (lines) => {
    const elements = []
    const comments = []
    let format
    for (let i = 1; i < lines.length; ++i) {
        const words = lines[i].split(' ')
        switch (words[0]) {
            case 'comment':
                comments.push(words.slice(1).join(' '))
                break
            case 'format':
                format = words[1]
                break
            case 'element':
                elements.push({
                    name: words[1],
                    count: parseInt(words[2], 10),
                    properties: [],
                })
                break
            case 'property': {
                if (!dataTypeMap.has(words[1])) {
                    throw new Error(`Unrecognized property data type '${words[1]}' in ply header`)
                }
                const element = elements[elements.length - 1]
                element.properties.push({
                    type: words[1],
                    name: words[2],
                    storage: null,
                    byteSize: dataTypeMap.get(words[1]).BYTES_PER_ELEMENT,
                })
                break
            }
            default:
                throw new Error(`Unrecognized header value '${words[0]}' in ply header`)
        }
    }
    return {
        elements,
        format,
        comments,
    }
}
const isCompressedPly = (elements) => {
    const chunkProperties = [
        'min_x',
        'min_y',
        'min_z',
        'max_x',
        'max_y',
        'max_z',
        'min_scale_x',
        'min_scale_y',
        'min_scale_z',
        'max_scale_x',
        'max_scale_y',
        'max_scale_z',
        'min_r',
        'min_g',
        'min_b',
        'max_r',
        'max_g',
        'max_b',
    ]
    const vertexProperties = ['packed_position', 'packed_rotation', 'packed_scale', 'packed_color']
    const shProperties = new Array(45).fill('').map((_, i) => `f_rest_${i}`)
    const hasBaseElements = () => {
        return (
            elements[0].name === 'chunk' &&
            elements[0].properties.every((p, i) => p.name === chunkProperties[i] && p.type === 'float') &&
            elements[1].name === 'vertex' &&
            elements[1].properties.every((p, i) => p.name === vertexProperties[i] && p.type === 'uint')
        )
    }
    const hasSHElements = () => {
        return (
            elements[2].name === 'sh' &&
            [9, 24, 45].indexOf(elements[2].properties.length) !== -1 &&
            elements[2].properties.every((p, i) => p.name === shProperties[i] && p.type === 'uchar')
        )
    }
    return (
        (elements.length === 2 && hasBaseElements()) || (elements.length === 3 && hasBaseElements() && hasSHElements())
    )
}
const isFloatPly = (elements) => {
    return (
        elements.length === 1 &&
        elements[0].name === 'vertex' &&
        elements[0].properties.every((p) => p.type === 'float')
    )
}
const readCompressedPly = async (streamBuf, elements, comments) => {
    const result = new GSplatCompressedData()
    result.comments = comments
    const numChunks = elements[0].count
    const numChunkProperties = elements[0].properties.length
    const numVertices = elements[1].count
    const evalStorageSize = (count) => {
        const width = Math.ceil(Math.sqrt(count))
        const height = Math.ceil(count / width)
        return width * height
    }
    const storageSize = evalStorageSize(numVertices)
    result.numSplats = numVertices
    result.chunkData = new Float32Array(numChunks * numChunkProperties)
    result.vertexData = new Uint32Array(storageSize * 4)
    const read = async (buffer, length) => {
        const target = new Uint8Array(buffer)
        let cursor = 0
        while (cursor < length) {
            while (streamBuf.remaining === 0) {
                await streamBuf.read()
            }
            const toCopy = Math.min(length - cursor, streamBuf.remaining)
            const src = streamBuf.data
            for (let i = 0; i < toCopy; ++i) {
                target[cursor++] = src[streamBuf.head++]
            }
        }
    }
    await read(result.chunkData.buffer, numChunks * numChunkProperties * 4)
    await read(result.vertexData.buffer, numVertices * 4 * 4)
    if (elements.length === 3) {
        const texStorageSize = storageSize * 16
        const shData0 = new Uint8Array(texStorageSize)
        const shData1 = new Uint8Array(texStorageSize)
        const shData2 = new Uint8Array(texStorageSize)
        const chunkSize = 1024
        const srcCoeffs = elements[2].properties.length / 3
        const tmpBuf = new Uint8Array(chunkSize * srcCoeffs * 3)
        for (let i = 0; i < result.numSplats; i += chunkSize) {
            const toRead = Math.min(chunkSize, result.numSplats - i)
            await read(tmpBuf.buffer, toRead * srcCoeffs * 3)
            for (let j = 0; j < toRead; ++j) {
                for (let k = 0; k < 15; ++k) {
                    const tidx = (i + j) * 16 + k
                    if (k < srcCoeffs) {
                        shData0[tidx] = tmpBuf[(j * 3 + 0) * srcCoeffs + k]
                        shData1[tidx] = tmpBuf[(j * 3 + 1) * srcCoeffs + k]
                        shData2[tidx] = tmpBuf[(j * 3 + 2) * srcCoeffs + k]
                    } else {
                        shData0[tidx] = 127
                        shData1[tidx] = 127
                        shData2[tidx] = 127
                    }
                }
            }
        }
        result.shData0 = shData0
        result.shData1 = shData1
        result.shData2 = shData2
        result.shBands = {
            3: 1,
            8: 2,
            15: 3,
        }[srcCoeffs]
    } else {
        result.shBands = 0
    }
    return result
}
const readFloatPly = async (streamBuf, elements, comments) => {
    const element = elements[0]
    const properties = element.properties
    const numProperties = properties.length
    const storage = properties.map((p) => p.storage)
    const inputSize = properties.reduce((a, p) => a + p.byteSize, 0)
    let vertexIdx = 0
    let floatData
    const checkFloatData = () => {
        const buffer = streamBuf.data.buffer
        if (floatData?.buffer !== buffer) {
            floatData = new Float32Array(buffer, 0, buffer.byteLength / 4)
        }
    }
    checkFloatData()
    while (vertexIdx < element.count) {
        while (streamBuf.remaining < inputSize) {
            await streamBuf.read()
            checkFloatData()
        }
        const toRead = Math.min(element.count - vertexIdx, Math.floor(streamBuf.remaining / inputSize))
        for (let j = 0; j < numProperties; ++j) {
            const s = storage[j]
            for (let n = 0; n < toRead; ++n) {
                s[n + vertexIdx] = floatData[n * numProperties + j]
            }
        }
        vertexIdx += toRead
        streamBuf.head += toRead * inputSize
    }
    return new GSplatData(elements, comments)
}
const readGeneralPly = async (streamBuf, elements, comments) => {
    for (let i = 0; i < elements.length; ++i) {
        const element = elements[i]
        const inputSize = element.properties.reduce((a, p) => a + p.byteSize, 0)
        const propertyParsingFunctions = element.properties.map((p) => {
            if (p.storage) {
                switch (p.type) {
                    case 'char':
                        return (streamBuf, c) => {
                            p.storage[c] = streamBuf.getInt8()
                        }
                    case 'uchar':
                        return (streamBuf, c) => {
                            p.storage[c] = streamBuf.getUint8()
                        }
                    case 'short':
                        return (streamBuf, c) => {
                            p.storage[c] = streamBuf.getInt16()
                        }
                    case 'ushort':
                        return (streamBuf, c) => {
                            p.storage[c] = streamBuf.getUint16()
                        }
                    case 'int':
                        return (streamBuf, c) => {
                            p.storage[c] = streamBuf.getInt32()
                        }
                    case 'uint':
                        return (streamBuf, c) => {
                            p.storage[c] = streamBuf.getUint32()
                        }
                    case 'float':
                        return (streamBuf, c) => {
                            p.storage[c] = streamBuf.getFloat32()
                        }
                    case 'double':
                        return (streamBuf, c) => {
                            p.storage[c] = streamBuf.getFloat64()
                        }
                    default:
                        throw new Error(`Unsupported property data type '${p.type}' in ply header`)
                }
            } else {
                return (streamBuf) => {
                    streamBuf.head += p.byteSize
                }
            }
        })
        let c = 0
        while (c < element.count) {
            while (streamBuf.remaining < inputSize) {
                await streamBuf.read()
            }
            const toRead = Math.min(element.count - c, Math.floor(streamBuf.remaining / inputSize))
            for (let n = 0; n < toRead; ++n) {
                for (let j = 0; j < element.properties.length; ++j) {
                    propertyParsingFunctions[j](streamBuf, c)
                }
                c++
            }
        }
    }
    return new GSplatData(elements, comments)
}
const readPly = async (reader, propertyFilter = null, progressFunc = null) => {
    const find = (buf, search) => {
        const endIndex = buf.length - search.length
        let i, j
        for (i = 0; i <= endIndex; ++i) {
            for (j = 0; j < search.length; ++j) {
                if (buf[i + j] !== search[j]) {
                    break
                }
            }
            if (j === search.length) {
                return i
            }
        }
        return -1
    }
    const startsWith = (a, b) => {
        if (a.length < b.length) {
            return false
        }
        for (let i = 0; i < b.length; ++i) {
            if (a[i] !== b[i]) {
                return false
            }
        }
        return true
    }
    const streamBuf = new StreamBuf(reader, progressFunc)
    let headerLength
    while (true) {
        await streamBuf.read()
        if (streamBuf.tail >= magicBytes.length && !startsWith(streamBuf.data, magicBytes)) {
            throw new Error('Invalid ply header')
        }
        headerLength = find(streamBuf.data, endHeaderBytes)
        if (headerLength !== -1) {
            break
        }
    }
    const lines = new TextDecoder('ascii').decode(streamBuf.data.subarray(0, headerLength)).split('\n')
    const { elements, format, comments } = parseHeader(lines)
    if (format !== 'binary_little_endian') {
        throw new Error('Unsupported ply format')
    }
    streamBuf.head = headerLength + endHeaderBytes.length
    streamBuf.compact()
    const readData = async () => {
        if (isCompressedPly(elements)) {
            return await readCompressedPly(streamBuf, elements, comments)
        }
        elements.forEach((e) => {
            e.properties.forEach((p) => {
                const storageType = dataTypeMap.get(p.type)
                if (storageType) {
                    const storage = !propertyFilter || propertyFilter(p.name) ? new storageType(e.count) : null
                    p.storage = storage
                }
            })
        })
        if (isFloatPly(elements)) {
            return await readFloatPly(streamBuf, elements, comments)
        }
        return await readGeneralPly(streamBuf, elements, comments)
    }
    return await readData()
}
const defaultElementFilter = (val) => true
class PlyParser {
    async load(url, callback, asset) {
        try {
            const response = await (asset.file?.contents ?? fetch(url.load))
            if (!response || !response.body) {
                callback('Error loading resource', null)
            } else {
                const totalLength = parseInt(response.headers.get('content-length') ?? '0', 10)
                let totalReceived = 0
                const data = await readPly(
                    response.body.getReader(),
                    asset.data.elementFilter ?? defaultElementFilter,
                    (bytes) => {
                        totalReceived += bytes
                        if (asset) {
                            asset.fire('progress', totalReceived, totalLength)
                        }
                    },
                )
                asset.fire('load:data', data)
                if (!data.isCompressed) {
                    if (asset.data.reorder ?? true) {
                        data.reorderData()
                    }
                }
                const resource =
                    data.isCompressed && !asset.data.decompress
                        ? new GSplatCompressedResource(this.app.graphicsDevice, data)
                        : new GSplatResource(this.app.graphicsDevice, data.isCompressed ? data.decompress() : data)
                callback(null, resource)
            }
        } catch (err) {
            callback(err, null)
        }
    }
    open(url, data) {
        return data
    }
    constructor(app, maxRetries) {
        this.app = app
        this.maxRetries = maxRetries
    }
}

const combineProgress = (target, assets) => {
    const map = new Map()
    const count = assets.length
    const fire = () => {
        let loaded = 0
        let total = 0
        map.forEach((value) => {
            loaded += value.loaded
            total += value.total
        })
        const reporting = map.size
        if (reporting > 0 && reporting < count) {
            total = Math.ceil((total * count) / reporting)
        }
        target.fire('progress', loaded, total)
    }
    assets.forEach((asset) => {
        const progress = (loaded, total) => {
            map.set(asset, {
                loaded,
                total,
            })
            fire()
        }
        const done = () => {
            asset.off('progress', progress)
            asset.off('load', done)
            asset.off('error', done)
        }
        asset.on('progress', progress)
        asset.on('load', done)
        asset.on('error', done)
    })
}
const upgradeMeta = (meta) => {
    const result = {
        version: 1,
        count: meta.means.shape[0],
        means: {
            mins: meta.means.mins,
            maxs: meta.means.maxs,
            files: meta.means.files,
        },
        scales: {
            mins: meta.scales.mins,
            maxs: meta.scales.maxs,
            files: meta.scales.files,
        },
        quats: {
            files: meta.quats.files,
        },
        sh0: {
            mins: meta.sh0.mins,
            maxs: meta.sh0.maxs,
            files: meta.sh0.files,
        },
    }
    if (meta.shN) {
        result.shN = {
            mins: meta.shN.mins,
            maxs: meta.shN.maxs,
            files: meta.shN.files,
        }
    }
    return result
}
class SogParser {
    _shouldAbort(asset, unloaded) {
        if (unloaded || !this.app.assets.get(asset.id)) return true
        if (!this.app?.graphicsDevice || this.app.graphicsDevice._destroyed) return true
        return false
    }
    async loadTextures(url, callback, asset, meta) {
        if (meta.version !== 2) {
            meta = upgradeMeta(meta)
        }
        const { assets } = this.app
        const subs = ['means', 'quats', 'scales', 'sh0', 'shN']
        const textures = {}
        const promises = []
        subs.forEach((sub) => {
            const files = meta[sub]?.files ?? []
            textures[sub] = files.map((filename) => {
                const texture = new Asset(
                    filename,
                    'texture',
                    {
                        url:
                            asset.options?.mapUrl?.(filename) ??
                            new URL(filename, new URL(url.load, window.location.href).toString()).toString(),
                        filename,
                    },
                    {
                        mipmaps: false,
                    },
                    {
                        crossOrigin: 'anonymous',
                    },
                )
                const promise = new Promise((resolve, reject) => {
                    texture.on('load', () => resolve(null))
                    texture.on('error', (err) => reject(err))
                })
                assets.add(texture)
                promises.push(promise)
                return texture
            })
        })
        const textureAssets = subs.map((sub) => textures[sub]).flat()
        let unloaded = false
        asset.once('unload', () => {
            unloaded = true
            textureAssets.forEach((t) => {
                assets.remove(t)
                t.unload()
            })
        })
        combineProgress(asset, textureAssets)
        textureAssets.forEach((t) => assets.load(t))
        await Promise.allSettled(promises)
        if (this._shouldAbort(asset, unloaded)) {
            textureAssets.forEach((t) => {
                assets.remove(t)
                t.unload()
            })
            callback(null, null)
            return
        }
        const data = new GSplatSogData()
        data.url = url.original
        data.meta = meta
        data.numSplats = meta.count
        data.means_l = textures.means[0].resource
        data.means_u = textures.means[1].resource
        data.quats = textures.quats[0].resource
        data.scales = textures.scales[0].resource
        data.sh0 = textures.sh0[0].resource
        data.sh_centroids = textures.shN?.[0]?.resource
        data.sh_labels = textures.shN?.[1]?.resource
        data.shBands = GSplatSogData.calcBands(data.sh_centroids?.width)
        const decompress = asset.data?.decompress
        const minimalMemory = asset.options?.minimalMemory ?? false
        data.minimalMemory = minimalMemory
        if (!decompress) {
            if (this._shouldAbort(asset, unloaded)) {
                data.destroy()
                callback(null, null)
                return
            }
            await data.prepareGpuData()
        }
        if (this._shouldAbort(asset, unloaded)) {
            data.destroy()
            callback(null, null)
            return
        }
        const resource = decompress
            ? new GSplatResource(this.app.graphicsDevice, await data.decompress())
            : new GSplatSogResource(this.app.graphicsDevice, data)
        if (this._shouldAbort(asset, unloaded)) {
            resource.destroy()
            callback(null, null)
            return
        }
        callback(null, resource)
    }
    load(url, callback, asset) {
        if (asset.data?.means) {
            this.loadTextures(url, callback, asset, asset.data)
        } else {
            if (typeof url === 'string') {
                url = {
                    load: url,
                    original: url,
                }
            }
            const options = {
                retry: this.maxRetries > 0,
                maxRetries: this.maxRetries,
                responseType: Http.ResponseType.JSON,
            }
            http.get(url.load, options, (err, meta) => {
                if (this._shouldAbort(asset, false)) {
                    callback(null, null)
                    return
                }
                if (!err) {
                    this.loadTextures(url, callback, asset, meta)
                } else {
                    callback(`Error loading gsplat meta: ${url.original} [${err}]`)
                }
            })
        }
    }
    constructor(app, maxRetries) {
        this.app = app
        this.maxRetries = maxRetries
    }
}

const parseZipArchive = (data) => {
    const dataView = new DataView(data)
    const u16 = (offset) => dataView.getUint16(offset, true)
    const u32 = (offset) => dataView.getUint32(offset, true)
    const extractEocd = (offset) => {
        return {
            magic: u32(offset),
            numFiles: u16(offset + 8),
            cdSizeBytes: u32(offset + 12),
            cdOffsetBytes: u32(offset + 16),
        }
    }
    const extractCdr = (offset) => {
        const filenameLength = u16(offset + 28)
        const extraFieldLength = u16(offset + 30)
        const fileCommentLength = u16(offset + 32)
        return {
            magic: u32(offset),
            compressionMethod: u16(offset + 10),
            compressedSizeBytes: u32(offset + 20),
            uncompressedSizeBytes: u32(offset + 24),
            lfhOffsetBytes: u32(offset + 42),
            filename: new TextDecoder().decode(new Uint8Array(data, offset + 46, filenameLength)),
            recordSizeBytes: 46 + filenameLength + extraFieldLength + fileCommentLength,
        }
    }
    const extractLfh = (offset) => {
        const filenameLength = u16(offset + 26)
        const extraLength = u16(offset + 28)
        return {
            magic: u32(offset),
            offsetBytes: offset + 30 + filenameLength + extraLength,
        }
    }
    const eocd = extractEocd(dataView.byteLength - 22)
    if (eocd.magic !== 0x06054b50) {
        throw new Error('Invalid zip file: EOCDR not found')
    }
    if (eocd.cdOffsetBytes === 0xffffffff || eocd.cdSizeBytes === 0xffffffff) {
        throw new Error('Invalid zip file: Zip64 not supported')
    }
    const result = []
    let offset = eocd.cdOffsetBytes
    for (let i = 0; i < eocd.numFiles; i++) {
        const cdr = extractCdr(offset)
        if (cdr.magic !== 0x02014b50) {
            throw new Error('Invalid zip file: CDR not found')
        }
        const lfh = extractLfh(cdr.lfhOffsetBytes)
        if (lfh.magic !== 0x04034b50) {
            throw new Error('Invalid zip file: LFH not found')
        }
        result.push({
            filename: cdr.filename,
            compression:
                {
                    0: 'none',
                    8: 'deflate',
                }[cdr.compressionMethod] ?? 'unknown',
            data: new Uint8Array(data, lfh.offsetBytes, cdr.compressedSizeBytes),
        })
        offset += cdr.recordSizeBytes
    }
    return result
}
const inflate = async (compressed) => {
    const ds = new DecompressionStream('deflate-raw')
    const out = new Blob([compressed]).stream().pipeThrough(ds)
    const ab = await new Response(out).arrayBuffer()
    return new Uint8Array(ab)
}
const downloadArrayBuffer = async (url, asset) => {
    const response = await (asset.file?.contents ?? fetch(url.load))
    if (!response) {
        throw new Error('Error loading resource')
    }
    if (response instanceof Response) {
        if (!response.ok) {
            throw new Error(`Error loading resource: ${response.status} ${response.statusText}`)
        }
        const totalLength = parseInt(response.headers.get('content-length') ?? '0', 10)
        if (!response.body || !response.body.getReader) {
            const buf = await response.arrayBuffer()
            asset.fire('progress', buf.byteLength, totalLength)
            return buf
        }
        const reader = response.body.getReader()
        const chunks = []
        let totalReceived = 0
        try {
            while (true) {
                const { done, value } = await reader.read()
                if (done) {
                    break
                }
                chunks.push(value)
                totalReceived += value.byteLength
                asset.fire('progress', totalReceived, totalLength)
            }
        } finally {
            reader.releaseLock()
        }
        return new Blob(chunks).arrayBuffer()
    }
    return response
}
class SogBundleParser {
    async load(url, callback, asset) {
        try {
            const arrayBuffer = await downloadArrayBuffer(url, asset)
            const files = parseZipArchive(arrayBuffer)
            for (const file of files) {
                if (file.compression === 'deflate') {
                    file.data = await inflate(file.data)
                }
            }
            const metaFile = files.find((f) => f.filename === 'meta.json')
            if (!metaFile) {
                callback('Error: meta.json not found')
                return
            }
            let meta
            try {
                meta = JSON.parse(new TextDecoder().decode(metaFile.data))
            } catch (err) {
                callback(`Error parsing meta.json: ${err}`)
                return
            }
            const filenames = ['means', 'scales', 'quats', 'sh0', 'shN'].map((key) => meta[key]?.files ?? []).flat()
            const textures = {}
            const promises = []
            for (const filename of filenames) {
                const file = files.find((f) => f.filename === filename)
                let texture
                if (file) {
                    texture = new Asset(
                        filename,
                        'texture',
                        {
                            url: `${url.load}/${filename}`,
                            filename,
                            contents: file.data,
                        },
                        {
                            mipmaps: false,
                        },
                        {
                            crossOrigin: 'anonymous',
                        },
                    )
                } else {
                    const url = new URL(filename, new URL(filename, window.location.href).toString()).toString()
                    texture = new Asset(
                        filename,
                        'texture',
                        {
                            url,
                            filename,
                        },
                        {
                            mipmaps: false,
                        },
                        {
                            crossOrigin: 'anonymous',
                        },
                    )
                }
                const promise = new Promise((resolve, reject) => {
                    texture.on('load', () => resolve(null))
                    texture.on('error', (err) => reject(err))
                })
                this.app.assets.add(texture)
                textures[filename] = texture
                promises.push(promise)
            }
            Object.values(textures).forEach((t) => this.app.assets.load(t))
            await Promise.allSettled(promises)
            const { assets } = this.app
            asset.once('unload', () => {
                Object.values(textures).forEach((t) => {
                    assets.remove(t)
                    t.unload()
                })
            })
            const decompress = asset.data?.decompress
            const minimalMemory = asset.options?.minimalMemory ?? false
            const data = new GSplatSogData()
            data.url = url.original
            data.minimalMemory = minimalMemory
            data.meta = meta
            data.numSplats = meta.count
            data.means_l = textures[meta.means.files[0]].resource
            data.means_u = textures[meta.means.files[1]].resource
            data.quats = textures[meta.quats.files[0]].resource
            data.scales = textures[meta.scales.files[0]].resource
            data.sh0 = textures[meta.sh0.files[0]].resource
            data.sh_centroids = textures[meta.shN?.files[0]]?.resource
            data.sh_labels = textures[meta.shN?.files[1]]?.resource
            data.shBands = GSplatSogData.calcBands(data.sh_centroids?.width)
            if (!decompress) {
                await data.prepareGpuData()
            }
            const resource = decompress
                ? new GSplatResource(this.app.graphicsDevice, await data.decompress())
                : new GSplatSogResource(this.app.graphicsDevice, data)
            callback(null, resource)
        } catch (err) {
            callback(err)
        }
    }
    constructor(app, maxRetries = 3) {
        this.app = app
        this.maxRetries = maxRetries
    }
}

class GSplatAssetLoaderBase {
    load(url) {}
    unload(url) {}
    getResource(url) {}
    destroy() {}
}

class GSplatAssetLoader extends GSplatAssetLoaderBase {
    destroy() {
        this._destroyed = true
        for (const asset of this._urlToAsset.values()) {
            asset.fire('unload', asset)
            asset.off('load')
            asset.off('error')
            this._registry.remove(asset)
            asset.unload()
        }
        this._urlToAsset.clear()
        this._loadQueue.length = 0
        this._currentlyLoading.clear()
        this._retryCount.clear()
    }
    _canLoad() {
        return !!this._registry.loader?.getHandler('gsplat')
    }
    load(url) {
        const asset = this._urlToAsset.get(url)
        if (asset?.loaded || this._currentlyLoading.has(url)) {
            return
        }
        if (this._loadQueue.includes(url)) {
            return
        }
        if (this._currentlyLoading.size < this.maxConcurrentLoads) {
            this._startLoading(url)
        } else {
            this._loadQueue.push(url)
        }
    }
    _startLoading(url) {
        this._currentlyLoading.add(url)
        let asset = this._urlToAsset.get(url)
        if (!asset) {
            asset = new Asset(
                url,
                'gsplat',
                {
                    url,
                },
                {},
                {
                    minimalMemory: true,
                },
            )
            this._registry.add(asset)
            this._urlToAsset.set(url, asset)
        }
        asset.once('load', () => this._onAssetLoadSuccess(url, asset))
        asset.once('error', (err) => this._onAssetLoadError(url, asset, err))
        if (!asset.loaded && !asset.loading) {
            this._registry.load(asset)
        }
    }
    _onAssetLoadSuccess(url, asset) {
        if (this._destroyed || !this._urlToAsset.has(url)) {
            return
        }
        this._currentlyLoading.delete(url)
        this._retryCount.delete(url)
        this._processQueue()
    }
    _onAssetLoadError(url, asset, err) {
        if (this._destroyed || !this._canLoad() || !this._urlToAsset.has(url)) {
            return
        }
        const retryCount = this._retryCount.get(url) || 0
        if (retryCount < this.maxRetries) {
            this._retryCount.set(url, retryCount + 1)
            asset.loaded = false
            asset.loading = false
            this._registry.load(asset)
        } else {
            this._currentlyLoading.delete(url)
            this._retryCount.delete(url)
            this._processQueue()
        }
    }
    _processQueue() {
        if (this._destroyed || !this._canLoad()) {
            return
        }
        while (this._currentlyLoading.size < this.maxConcurrentLoads && this._loadQueue.length > 0) {
            const url = this._loadQueue.shift()
            if (url) {
                this._startLoading(url)
            }
        }
    }
    unload(url) {
        this._currentlyLoading.delete(url)
        const queueIndex = this._loadQueue.indexOf(url)
        if (queueIndex !== -1) {
            this._loadQueue.splice(queueIndex, 1)
        }
        this._retryCount.delete(url)
        const asset = this._urlToAsset.get(url)
        if (asset) {
            asset.fire('unload', asset)
            asset.off('load')
            asset.off('error')
            this._registry.remove(asset)
            asset.unload()
            this._urlToAsset.delete(url)
        }
        this._processQueue()
    }
    getResource(url) {
        const asset = this._urlToAsset.get(url)
        return asset?.resource
    }
    constructor(registry) {
        ;(super(),
            (this._urlToAsset = new Map()),
            (this.maxConcurrentLoads = 2),
            (this.maxRetries = 2),
            (this._currentlyLoading = new Set()),
            (this._loadQueue = []),
            (this._retryCount = new Map()),
            (this._destroyed = false))
        this._registry = registry
    }
}

class GSplatOctreeParser {
    load(url, callback, asset) {
        if (typeof url === 'string') {
            url = {
                load: url,
                original: url,
            }
        }
        const options = {
            retry: this.maxRetries > 0,
            maxRetries: this.maxRetries,
            responseType: Http.ResponseType.JSON,
        }
        http.get(url.load, options, (err, data) => {
            if (!err) {
                const assetLoader = new GSplatAssetLoader(this.app.assets)
                const resource = new GSplatOctreeResource(asset.file.url, data, assetLoader)
                callback(null, resource)
            } else {
                callback(`Error loading gsplat octree: ${url.original} [${err}]`)
            }
        })
    }
    constructor(app, maxRetries) {
        this.app = app
        this.maxRetries = maxRetries
    }
}

class GSplatHandler extends ResourceHandler {
    _getUrlWithoutParams(url) {
        return url.indexOf('?') >= 0 ? url.split('?')[0] : url
    }
    _getParser(url) {
        const basename = path.getBasename(this._getUrlWithoutParams(url)).toLowerCase()
        if (basename === 'lod-meta.json') {
            return this.parsers.octree
        }
        const ext = path.getExtension(basename).replace('.', '')
        return this.parsers[ext] || this.parsers.ply
    }
    load(url, callback, asset) {
        if (typeof url === 'string') {
            url = {
                load: url,
                original: url,
            }
        }
        this._getParser(url.original).load(url, callback, asset)
    }
    open(url, data, asset) {
        return data
    }
    constructor(app) {
        super(app, 'gsplat')
        this.parsers = {
            ply: new PlyParser(app, 3),
            sog: new SogBundleParser(app),
            json: new SogParser(app, 3),
            octree: new GSplatOctreeParser(app, 3),
        }
    }
}

function BasisWorker() {
    const BASIS_FORMAT = {
        cTFETC1: 0,
        cTFETC2: 1,
        cTFBC1: 2,
        cTFBC3: 3,
        cTFPVRTC1_4_RGB: 8,
        cTFPVRTC1_4_RGBA: 9,
        cTFASTC_4x4: 10,
        cTFATC_RGB: 11,
        cTFATC_RGBA_INTERPOLATED_ALPHA: 12,
        cTFRGBA32: 13,
        cTFRGB565: 14,
        cTFRGBA4444: 16,
    }
    const opaqueMapping = {
        astc: BASIS_FORMAT.cTFASTC_4x4,
        dxt: BASIS_FORMAT.cTFBC1,
        etc1: BASIS_FORMAT.cTFETC1,
        etc2: BASIS_FORMAT.cTFETC1,
        pvr: BASIS_FORMAT.cTFPVRTC1_4_RGB,
        atc: BASIS_FORMAT.cTFATC_RGB,
        none: BASIS_FORMAT.cTFRGB565,
    }
    const alphaMapping = {
        astc: BASIS_FORMAT.cTFASTC_4x4,
        dxt: BASIS_FORMAT.cTFBC3,
        etc1: BASIS_FORMAT.cTFRGBA4444,
        etc2: BASIS_FORMAT.cTFETC2,
        pvr: BASIS_FORMAT.cTFPVRTC1_4_RGBA,
        atc: BASIS_FORMAT.cTFATC_RGBA_INTERPOLATED_ALPHA,
        none: BASIS_FORMAT.cTFRGBA4444,
    }
    const PIXEL_FORMAT = {
        ETC1: 21,
        ETC2_RGB: 22,
        ETC2_RGBA: 23,
        DXT1: 8,
        DXT5: 10,
        PVRTC_4BPP_RGB_1: 26,
        PVRTC_4BPP_RGBA_1: 27,
        ASTC_4x4: 28,
        ATC_RGB: 29,
        ATC_RGBA: 30,
        R8_G8_B8_A8: 7,
        R5_G6_B5: 3,
        R4_G4_B4_A4: 5,
    }
    const basisToEngineMapping = (basisFormat, deviceDetails) => {
        switch (basisFormat) {
            case BASIS_FORMAT.cTFETC1:
                return deviceDetails.formats.etc2 ? PIXEL_FORMAT.ETC2_RGB : PIXEL_FORMAT.ETC1
            case BASIS_FORMAT.cTFETC2:
                return PIXEL_FORMAT.ETC2_RGBA
            case BASIS_FORMAT.cTFBC1:
                return PIXEL_FORMAT.DXT1
            case BASIS_FORMAT.cTFBC3:
                return PIXEL_FORMAT.DXT5
            case BASIS_FORMAT.cTFPVRTC1_4_RGB:
                return PIXEL_FORMAT.PVRTC_4BPP_RGB_1
            case BASIS_FORMAT.cTFPVRTC1_4_RGBA:
                return PIXEL_FORMAT.PVRTC_4BPP_RGBA_1
            case BASIS_FORMAT.cTFASTC_4x4:
                return PIXEL_FORMAT.ASTC_4x4
            case BASIS_FORMAT.cTFATC_RGB:
                return PIXEL_FORMAT.ATC_RGB
            case BASIS_FORMAT.cTFATC_RGBA_INTERPOLATED_ALPHA:
                return PIXEL_FORMAT.ATC_RGBA
            case BASIS_FORMAT.cTFRGBA32:
                return PIXEL_FORMAT.R8_G8_B8_A8
            case BASIS_FORMAT.cTFRGB565:
                return PIXEL_FORMAT.R5_G6_B5
            case BASIS_FORMAT.cTFRGBA4444:
                return PIXEL_FORMAT.R4_G4_B4_A4
        }
    }
    const unswizzleGGGR = (data) => {
        const genB = function (R, G) {
            const r = R * (2.0 / 255.0) - 1.0
            const g = G * (2.0 / 255.0) - 1.0
            const b = Math.sqrt(1.0 - Math.min(1.0, r * r + g * g))
            return Math.max(0, Math.min(255, Math.floor((b + 1.0) * 0.5 * 255.0)))
        }
        for (let offset = 0; offset < data.length; offset += 4) {
            const R = data[offset + 3]
            const G = data[offset + 1]
            data[offset + 0] = R
            data[offset + 2] = genB(R, G)
            data[offset + 3] = 255
        }
        return data
    }
    const pack565 = (data) => {
        const result = new Uint16Array(data.length / 4)
        for (let offset = 0; offset < data.length; offset += 4) {
            const R = data[offset + 0]
            const G = data[offset + 1]
            const B = data[offset + 2]
            result[offset / 4] = ((R & 0xf8) << 8) | ((G & 0xfc) << 3) | (B >> 3)
        }
        return result
    }
    const isPOT = (width, height) => {
        return (width & (width - 1)) === 0 && (height & (height - 1)) === 0
    }
    const performanceNow = () => {
        return typeof performance !== 'undefined' ? performance.now() : 0
    }
    let basis
    let rgbPriority
    let rgbaPriority
    const chooseTargetFormat = (deviceDetails, hasAlpha, isUASTC) => {
        if (isUASTC) {
            if (deviceDetails.formats.astc) {
                return 'astc'
            }
        } else {
            if (hasAlpha) {
                if (deviceDetails.formats.etc2) {
                    return 'etc2'
                }
            } else {
                if (deviceDetails.formats.etc2) {
                    return 'etc2'
                }
                if (deviceDetails.formats.etc1) {
                    return 'etc1'
                }
            }
        }
        const testInOrder = (priority) => {
            for (let i = 0; i < priority.length; ++i) {
                const format = priority[i]
                if (deviceDetails.formats[format]) {
                    return format
                }
            }
            return 'none'
        }
        return testInOrder(hasAlpha ? rgbaPriority : rgbPriority)
    }
    const dimensionsValid = (width, height, format) => {
        switch (format) {
            case BASIS_FORMAT.cTFETC1:
            case BASIS_FORMAT.cTFETC2:
                return true
            case BASIS_FORMAT.cTFBC1:
            case BASIS_FORMAT.cTFBC3:
                return (width & 0x3) === 0 && (height & 0x3) === 0
            case BASIS_FORMAT.cTFPVRTC1_4_RGB:
            case BASIS_FORMAT.cTFPVRTC1_4_RGBA:
                return isPOT(width, height)
            case BASIS_FORMAT.cTFASTC_4x4:
                return true
            case BASIS_FORMAT.cTFATC_RGB:
            case BASIS_FORMAT.cTFATC_RGBA_INTERPOLATED_ALPHA:
                return true
        }
        return false
    }
    const transcodeKTX2 = (url, data, options) => {
        if (!basis.KTX2File) {
            throw new Error('Basis transcoder module does not include support for KTX2.')
        }
        const funcStart = performanceNow()
        const basisFile = new basis.KTX2File(new Uint8Array(data))
        const width = basisFile.getWidth()
        const height = basisFile.getHeight()
        const levels = basisFile.getLevels()
        const hasAlpha = !!basisFile.getHasAlpha()
        const isUASTC = basisFile.isUASTC && basisFile.isUASTC()
        if (!width || !height || !levels) {
            basisFile.close()
            basisFile.delete()
            throw new Error(`Invalid image dimensions url=${url} width=${width} height=${height} levels=${levels}`)
        }
        const format = chooseTargetFormat(options.deviceDetails, hasAlpha, isUASTC)
        const unswizzle = !!options.isGGGR && format === 'pvr'
        let basisFormat
        if (unswizzle) {
            basisFormat = BASIS_FORMAT.cTFRGBA32
        } else {
            basisFormat = hasAlpha ? alphaMapping[format] : opaqueMapping[format]
            if (!dimensionsValid(width, height, basisFormat)) {
                basisFormat = hasAlpha ? BASIS_FORMAT.cTFRGBA32 : BASIS_FORMAT.cTFRGB565
            }
        }
        if (!basisFile.startTranscoding()) {
            basisFile.close()
            basisFile.delete()
            throw new Error(`Failed to start transcoding url=${url}`)
        }
        let i
        const levelData = []
        for (let mip = 0; mip < levels; ++mip) {
            const dstSize = basisFile.getImageTranscodedSizeInBytes(mip, 0, 0, basisFormat)
            const dst = new Uint8Array(dstSize)
            if (!basisFile.transcodeImage(dst, mip, 0, 0, basisFormat, 0, -1, -1)) {
                basisFile.close()
                basisFile.delete()
                throw new Error(`Failed to transcode image url=${url}`)
            }
            const is16BitFormat = basisFormat === BASIS_FORMAT.cTFRGB565 || basisFormat === BASIS_FORMAT.cTFRGBA4444
            levelData.push(is16BitFormat ? new Uint16Array(dst.buffer) : dst)
        }
        basisFile.close()
        basisFile.delete()
        if (unswizzle) {
            basisFormat = BASIS_FORMAT.cTFRGB565
            for (i = 0; i < levelData.length; ++i) {
                levelData[i] = pack565(unswizzleGGGR(levelData[i]))
            }
        }
        return {
            format: basisToEngineMapping(basisFormat, options.deviceDetails),
            width: width,
            height: height,
            levels: levelData,
            cubemap: false,
            transcodeTime: performanceNow() - funcStart,
            url: url,
            unswizzledGGGR: unswizzle,
        }
    }
    const transcodeBasis = (url, data, options) => {
        const funcStart = performanceNow()
        const basisFile = new basis.BasisFile(new Uint8Array(data))
        const width = basisFile.getImageWidth(0, 0)
        const height = basisFile.getImageHeight(0, 0)
        const images = basisFile.getNumImages()
        const levels = basisFile.getNumLevels(0)
        const hasAlpha = !!basisFile.getHasAlpha()
        const isUASTC = basisFile.isUASTC && basisFile.isUASTC()
        if (!width || !height || !images || !levels) {
            basisFile.close()
            basisFile.delete()
            throw new Error(
                `Invalid image dimensions url=${url} width=${width} height=${height} images=${images} levels=${levels}`,
            )
        }
        const format = chooseTargetFormat(options.deviceDetails, hasAlpha, isUASTC)
        const unswizzle = !!options.isGGGR && format === 'pvr'
        let basisFormat
        if (unswizzle) {
            basisFormat = BASIS_FORMAT.cTFRGBA32
        } else {
            basisFormat = hasAlpha ? alphaMapping[format] : opaqueMapping[format]
            if (!dimensionsValid(width, height, basisFormat)) {
                basisFormat = hasAlpha ? BASIS_FORMAT.cTFRGBA32 : BASIS_FORMAT.cTFRGB565
            }
        }
        if (!basisFile.startTranscoding()) {
            basisFile.close()
            basisFile.delete()
            throw new Error(`Failed to start transcoding url=${url}`)
        }
        let i
        const levelData = []
        for (let mip = 0; mip < levels; ++mip) {
            const dstSize = basisFile.getImageTranscodedSizeInBytes(0, mip, basisFormat)
            const dst = new Uint8Array(dstSize)
            if (!basisFile.transcodeImage(dst, 0, mip, basisFormat, 0, 0)) {
                if (mip === levels - 1 && dstSize === levelData[mip - 1].buffer.byteLength) {
                    dst.set(new Uint8Array(levelData[mip - 1].buffer))
                    console.warn(`Failed to transcode last mipmap level, using previous level instead url=${url}`)
                } else {
                    basisFile.close()
                    basisFile.delete()
                    throw new Error(`Failed to transcode image url=${url}`)
                }
            }
            const is16BitFormat = basisFormat === BASIS_FORMAT.cTFRGB565 || basisFormat === BASIS_FORMAT.cTFRGBA4444
            levelData.push(is16BitFormat ? new Uint16Array(dst.buffer) : dst)
        }
        basisFile.close()
        basisFile.delete()
        if (unswizzle) {
            basisFormat = BASIS_FORMAT.cTFRGB565
            for (i = 0; i < levelData.length; ++i) {
                levelData[i] = pack565(unswizzleGGGR(levelData[i]))
            }
        }
        return {
            format: basisToEngineMapping(basisFormat, options.deviceDetails),
            width: width,
            height: height,
            levels: levelData,
            cubemap: false,
            transcodeTime: performanceNow() - funcStart,
            url: url,
            unswizzledGGGR: unswizzle,
        }
    }
    const transcode = (url, data, options) => {
        return options.isKTX2 ? transcodeKTX2(url, data, options) : transcodeBasis(url, data, options)
    }
    const workerTranscode = (url, data, options) => {
        try {
            const result = transcode(url, data, options)
            result.levels = result.levels.map((v) => v.buffer)
            self.postMessage(
                {
                    url: url,
                    data: result,
                },
                result.levels,
            )
        } catch (err) {
            self.postMessage(
                {
                    url: url,
                    err: err,
                },
                null,
            )
        }
    }
    const workerInit = (config, callback) => {
        const instantiateWasmFunc = (imports, successCallback) => {
            WebAssembly.instantiate(config.module, imports)
                .then((result) => {
                    successCallback(result)
                })
                .catch((reason) => {
                    console.error(`instantiate failed + ${reason}`)
                })
            return {}
        }
        self.BASIS(
            config.module
                ? {
                      instantiateWasm: instantiateWasmFunc,
                  }
                : null,
        ).then((instance) => {
            instance.initializeBasis()
            basis = instance
            rgbPriority = config.rgbPriority
            rgbaPriority = config.rgbaPriority
            callback(null)
        })
    }
    const queue = []
    self.onmessage = (message) => {
        const data = message.data
        switch (data.type) {
            case 'init':
                workerInit(data.config, () => {
                    for (let i = 0; i < queue.length; ++i) {
                        workerTranscode(queue[i].url, queue[i].data, queue[i].options)
                    }
                    queue.length = 0
                })
                break
            case 'transcode':
                if (basis) {
                    workerTranscode(data.url, data.data, data.options)
                } else {
                    queue.push(data)
                }
                break
        }
    }
}

const getCompressionFormats = (device) => {
    return {
        astc: !!device.extCompressedTextureASTC,
        atc: !!device.extCompressedTextureATC,
        dxt: !!device.extCompressedTextureS3TC,
        etc1: !!device.extCompressedTextureETC1,
        etc2: !!device.extCompressedTextureETC,
        pvr: !!device.extCompressedTexturePVRTC,
    }
}
const prepareWorkerModules = (config, callback) => {
    const getWorkerBlob = (basisCode) => {
        const code = ['/* basis */', basisCode, '', `(${BasisWorker.toString()})()\n\n`].join('\n')
        return new Blob([code], {
            type: 'application/javascript',
        })
    }
    const wasmSupported = () => {
        try {
            if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
                const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
                if (module instanceof WebAssembly.Module) {
                    return new WebAssembly.Instance(module) instanceof WebAssembly.Instance
                }
            }
        } catch (e) {}
        return false
    }
    const sendResponse = (basisCode, module) => {
        callback(null, {
            workerUrl: URL.createObjectURL(getWorkerBlob(basisCode)),
            module: module,
            rgbPriority: config.rgbPriority,
            rgbaPriority: config.rgbaPriority,
        })
    }
    const options = {
        cache: true,
        responseType: 'text',
        retry: config.maxRetries > 0,
        maxRetries: config.maxRetries,
    }
    if (config.glueUrl && config.wasmUrl && wasmSupported()) {
        let basisCode = null
        let module = null
        http.get(config.glueUrl, options, (err, response) => {
            if (err) {
                callback(err)
            } else {
                if (module) {
                    sendResponse(response, module)
                } else {
                    basisCode = response
                }
            }
        })
        const fetchPromise = fetch(config.wasmUrl)
        const compileManual = () => {
            fetchPromise
                .then((result) => result.arrayBuffer())
                .then((buffer) => WebAssembly.compile(buffer))
                .then((module_) => {
                    if (basisCode) {
                        sendResponse(basisCode, module_)
                    } else {
                        module = module_
                    }
                })
                .catch((err) => {
                    callback(err, null)
                })
        }
        if (WebAssembly.compileStreaming) {
            WebAssembly.compileStreaming(fetchPromise)
                .then((module_) => {
                    if (basisCode) {
                        sendResponse(basisCode, module_)
                    } else {
                        module = module_
                    }
                })
                .catch((err) => {
                    compileManual()
                })
        } else {
            compileManual()
        }
    } else {
        http.get(config.fallbackUrl, options, (err, response) => {
            if (err) {
                callback(err, null)
            } else {
                sendResponse(response, null)
            }
        })
    }
}
class BasisQueue {
    enqueueJob(url, data, callback, options) {
        if (this.callbacks.hasOwnProperty(url)) {
            this.callbacks[url].push(callback)
        } else {
            this.callbacks[url] = [callback]
            const job = {
                url: url,
                data: data,
                options: options,
            }
            if (this.clients.length > 0) {
                this.clients.shift().run(job)
            } else {
                this.queue.push(job)
            }
        }
    }
    enqueueClient(client) {
        if (this.queue.length > 0) {
            client.run(this.queue.shift())
        } else {
            this.clients.push(client)
        }
    }
    handleResponse(url, err, data) {
        const callback = this.callbacks[url]
        if (err) {
            for (let i = 0; i < callback.length; ++i) {
                callback[i](err)
            }
        } else {
            if (data.format === PIXELFORMAT_RGB565 || data.format === PIXELFORMAT_RGBA4) {
                data.levels = data.levels.map((v) => {
                    return new Uint16Array(v)
                })
            } else {
                data.levels = data.levels.map((v) => {
                    return new Uint8Array(v)
                })
            }
            for (let i = 0; i < callback.length; ++i) {
                callback[i](null, data)
            }
        }
        delete this.callbacks[url]
    }
    constructor() {
        this.callbacks = {}
        this.queue = []
        this.clients = []
    }
}
class BasisClient {
    run(job) {
        const transfer = []
        if (job.data instanceof ArrayBuffer) {
            transfer.push(job.data)
        }
        this.worker.postMessage(
            {
                type: 'transcode',
                url: job.url,
                format: job.format,
                data: job.data,
                options: job.options,
            },
            transfer,
        )
        if (this.eager) {
            this.queue.enqueueClient(this)
        }
    }
    constructor(queue, config, eager) {
        this.queue = queue
        this.worker = new Worker(config.workerUrl)
        this.worker.addEventListener('message', (message) => {
            const data = message.data
            this.queue.handleResponse(data.url, data.err, data.data)
            if (!this.eager) {
                this.queue.enqueueClient(this)
            }
        })
        this.worker.postMessage({
            type: 'init',
            config: config,
        })
        this.eager = eager
    }
}
const defaultNumWorkers = 1
const defaultRgbPriority = ['etc2', 'etc1', 'astc', 'dxt', 'pvr', 'atc']
const defaultRgbaPriority = ['astc', 'dxt', 'etc2', 'pvr', 'atc']
const defaultMaxRetries = 5
const queue = new BasisQueue()
let lazyConfig = null
let initializing = false
function basisInitialize(config) {
    if (initializing) {
        return
    }
    if (!config) {
        config = lazyConfig || {}
    } else if (config.lazyInit) {
        lazyConfig = config
        return
    }
    if (!config.glueUrl || !config.wasmUrl || !config.fallbackUrl) {
        const moduleConfig = WasmModule.getConfig('BASIS')
        if (moduleConfig) {
            config = {
                glueUrl: moduleConfig.glueUrl,
                wasmUrl: moduleConfig.wasmUrl,
                fallbackUrl: moduleConfig.fallbackUrl,
                numWorkers: moduleConfig.numWorkers,
            }
        }
    }
    if (config.glueUrl || config.wasmUrl || config.fallbackUrl) {
        initializing = true
        const numWorkers = Math.max(1, Math.min(16, config.numWorkers || defaultNumWorkers))
        const eagerWorkers =
            config.numWorkers === 1 || (config.hasOwnProperty('eagerWorkers') ? config.eagerWorkers : true)
        config.rgbPriority = config.rgbPriority || defaultRgbPriority
        config.rgbaPriority = config.rgbaPriority || defaultRgbaPriority
        config.maxRetries = config.hasOwnProperty('maxRetries') ? config.maxRetries : defaultMaxRetries
        prepareWorkerModules(config, (err, clientConfig) => {
            if (err) {
                console.error(`failed to initialize basis worker: ${err}`)
            } else {
                for (let i = 0; i < numWorkers; ++i) {
                    queue.enqueueClient(new BasisClient(queue, clientConfig, eagerWorkers))
                }
            }
        })
    }
}
let deviceDetails = null
function basisTranscode(device, url, data, callback, options) {
    basisInitialize()
    if (!deviceDetails) {
        deviceDetails = {
            formats: getCompressionFormats(device),
        }
    }
    queue.enqueueJob(url, data, callback, {
        deviceDetails: deviceDetails,
        isGGGR: !!options?.isGGGR,
        isKTX2: !!options?.isKTX2,
    })
    return initializing
}

class TextureParser {
    load(url, callback, asset) {
        throw new Error('not implemented')
    }
    open(url, data, device) {
        throw new Error('not implemented')
    }
}

class BasisParser extends TextureParser {
    load(url, callback, asset) {
        const device = this.device
        const transcode = (data) => {
            const basisModuleFound = basisTranscode(device, url.load, data, callback, {
                isGGGR: (asset?.file?.variants?.basis?.opt & 8) !== 0,
            })
            if (!basisModuleFound) {
                callback(
                    `Basis module not found. Asset [${asset.name}](${asset.getFileUrl()}) basis texture variant will not be loaded.`,
                )
            }
        }
        Asset.fetchArrayBuffer(
            url.load,
            (err, result) => {
                if (err) {
                    callback(err)
                } else {
                    transcode(result)
                }
            },
            asset,
            this.maxRetries,
        )
    }
    open(url, data, device, textureOptions = {}) {
        const format = textureOptions.srgb ? pixelFormatLinearToGamma(data.format) : data.format
        const texture = new Texture(device, {
            name: url,
            addressU: data.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
            addressV: data.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
            width: data.width,
            height: data.height,
            format: format,
            cubemap: data.cubemap,
            levels: data.levels,
            ...textureOptions,
        })
        texture.upload()
        return texture
    }
    constructor(registry, device) {
        super()
        this.device = device
        this.maxRetries = 0
    }
}

class ImgParser extends TextureParser {
    load(url, callback, asset) {
        const hasContents = !!asset?.file?.contents
        if (hasContents) {
            if (this.device.supportsImageBitmap) {
                this._loadImageBitmapFromBlob(new Blob([asset.file.contents]), callback)
                return
            }
            url = {
                load: URL.createObjectURL(new Blob([asset.file.contents])),
                original: url.original,
            }
        }
        const handler = (err, result) => {
            if (hasContents) {
                URL.revokeObjectURL(url.load)
            }
            callback(err, result)
        }
        let crossOrigin
        if (asset && asset.options && asset.options.hasOwnProperty('crossOrigin')) {
            crossOrigin = asset.options.crossOrigin
        } else if (ABSOLUTE_URL.test(url.load)) {
            crossOrigin = this.crossOrigin
        }
        if (this.device.supportsImageBitmap) {
            this._loadImageBitmap(url.load, url.original, crossOrigin, handler, asset)
        } else {
            this._loadImage(url.load, url.original, crossOrigin, handler, asset)
        }
    }
    open(url, data, device, textureOptions = {}) {
        const texture = new Texture(device, {
            name: url,
            width: data.width,
            height: data.height,
            format: textureOptions.srgb ? PIXELFORMAT_SRGBA8 : PIXELFORMAT_RGBA8,
            ...textureOptions,
        })
        texture.setSource(data)
        return texture
    }
    _loadImage(url, originalUrl, crossOrigin, callback, asset) {
        const image = new Image()
        if (crossOrigin) {
            image.crossOrigin = crossOrigin
        }
        let retries = 0
        const maxRetries = this.maxRetries
        let retryTimeout
        const dummySize = 1024 * 1024
        asset?.fire('progress', 0, dummySize)
        image.onload = function () {
            asset?.fire('progress', dummySize, dummySize)
            callback(null, image)
        }
        image.onerror = function () {
            if (retryTimeout) return
            if (maxRetries > 0 && ++retries <= maxRetries) {
                const retryDelay = Math.pow(2, retries) * 100
                console.log(`Error loading Texture from: '${originalUrl}' - Retrying in ${retryDelay}ms...`)
                const idx = url.indexOf('?')
                const separator = idx >= 0 ? '&' : '?'
                retryTimeout = setTimeout(() => {
                    image.src = `${url + separator}retry=${Date.now()}`
                    retryTimeout = null
                }, retryDelay)
            } else {
                callback(`Error loading Texture from: '${originalUrl}'`)
            }
        }
        image.src = url
    }
    _loadImageBitmap(url, originalUrl, crossOrigin, callback, asset) {
        const options = {
            cache: true,
            responseType: 'blob',
            retry: this.maxRetries > 0,
            maxRetries: this.maxRetries,
            progress: asset,
        }
        http.get(url, options, (err, blob) => {
            if (err) {
                callback(err)
            } else {
                this._loadImageBitmapFromBlob(blob, callback)
            }
        })
    }
    _loadImageBitmapFromBlob(blob, callback) {
        createImageBitmap(blob, {
            premultiplyAlpha: 'none',
            colorSpaceConversion: 'none',
        })
            .then((imageBitmap) => callback(null, imageBitmap))
            .catch((e) => callback(e))
    }
    constructor(registry, device) {
        super()
        this.crossOrigin = registry.prefix ? 'anonymous' : null
        this.maxRetries = 0
        this.device = device
    }
}

const IDENTIFIER = [0x58544bab, 0xbb313120, 0x0a1a0a0d]
const KNOWN_FORMATS = {
    0x83f0: PIXELFORMAT_DXT1,
    0x83f2: PIXELFORMAT_DXT3,
    0x83f3: PIXELFORMAT_DXT5,
    0x8d64: PIXELFORMAT_ETC1,
    0x9274: PIXELFORMAT_ETC2_RGB,
    0x9278: PIXELFORMAT_ETC2_RGBA,
    0x8c00: PIXELFORMAT_PVRTC_4BPP_RGB_1,
    0x8c01: PIXELFORMAT_PVRTC_2BPP_RGB_1,
    0x8c02: PIXELFORMAT_PVRTC_4BPP_RGBA_1,
    0x8c03: PIXELFORMAT_PVRTC_2BPP_RGBA_1,
    0x8051: PIXELFORMAT_RGB8,
    0x8058: PIXELFORMAT_RGBA8,
    0x8c41: PIXELFORMAT_SRGB8,
    0x8c43: PIXELFORMAT_SRGBA8,
    0x8c3a: PIXELFORMAT_111110F,
    0x881b: PIXELFORMAT_RGB16F,
    0x881a: PIXELFORMAT_RGBA16F,
}
function createContainer(pixelFormat, buffer, byteOffset, byteSize) {
    return pixelFormat === PIXELFORMAT_111110F
        ? new Uint32Array(buffer, byteOffset, byteSize / 4)
        : new Uint8Array(buffer, byteOffset, byteSize)
}
class KtxParser extends TextureParser {
    load(url, callback, asset) {
        Asset.fetchArrayBuffer(url.load, callback, asset, this.maxRetries)
    }
    open(url, data, device, textureOptions = {}) {
        const textureData = this.parse(data)
        if (!textureData) {
            return null
        }
        const format = textureOptions.srgb ? pixelFormatLinearToGamma(textureData.format) : textureData.format
        const texture = new Texture(device, {
            name: url,
            addressU: textureData.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
            addressV: textureData.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
            width: textureData.width,
            height: textureData.height,
            format: format,
            cubemap: textureData.cubemap,
            levels: textureData.levels,
            ...textureOptions,
        })
        texture.upload()
        return texture
    }
    parse(data) {
        const dataU32 = new Uint32Array(data)
        if (IDENTIFIER[0] !== dataU32[0] || IDENTIFIER[1] !== dataU32[1] || IDENTIFIER[2] !== dataU32[2]) {
            return null
        }
        const header = {
            endianness: dataU32[3],
            glType: dataU32[4],
            glTypeSize: dataU32[5],
            glFormat: dataU32[6],
            glInternalFormat: dataU32[7],
            glBaseInternalFormat: dataU32[8],
            pixelWidth: dataU32[9],
            pixelHeight: dataU32[10],
            pixelDepth: dataU32[11],
            numberOfArrayElements: dataU32[12],
            numberOfFaces: dataU32[13],
            numberOfMipmapLevels: dataU32[14],
            bytesOfKeyValueData: dataU32[15],
        }
        if (header.pixelDepth > 1) {
            return null
        }
        if (header.numberOfArrayElements !== 0) {
            return null
        }
        const format = KNOWN_FORMATS[header.glInternalFormat]
        if (format === undefined) {
            return null
        }
        let offset = 16 + header.bytesOfKeyValueData / 4
        const isCubemap = header.numberOfFaces > 1
        const levels = []
        for (let mipmapLevel = 0; mipmapLevel < (header.numberOfMipmapLevels || 1); mipmapLevel++) {
            const imageSizeInBytes = dataU32[offset++]
            if (isCubemap) {
                levels.push([])
            }
            const target = isCubemap ? levels[mipmapLevel] : levels
            for (let face = 0; face < (isCubemap ? 6 : 1); ++face) {
                target.push(createContainer(format, data, offset * 4, imageSizeInBytes))
                offset += (imageSizeInBytes + 3) >> 2
            }
        }
        return {
            format: format,
            width: header.pixelWidth,
            height: header.pixelHeight,
            levels: levels,
            cubemap: isCubemap,
        }
    }
    constructor(registry) {
        super()
        this.maxRetries = 0
    }
}

const KHRConstants = {
    KHR_DF_MODEL_UASTC: 166,
}
class Ktx2Parser extends TextureParser {
    load(url, callback, asset) {
        Asset.fetchArrayBuffer(
            url.load,
            (err, result) => {
                if (err) {
                    callback(err, result)
                } else {
                    this.parse(result, url, callback, asset)
                }
            },
            asset,
            this.maxRetries,
        )
    }
    open(url, data, device, textureOptions = {}) {
        const format = textureOptions.srgb ? pixelFormatLinearToGamma(data.format) : data.format
        const texture = new Texture(device, {
            name: url,
            addressU: data.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
            addressV: data.cubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
            width: data.width,
            height: data.height,
            format: format,
            cubemap: data.cubemap,
            levels: data.levels,
            ...textureOptions,
        })
        texture.upload()
        return texture
    }
    parse(arraybuffer, url, callback, asset) {
        const rs = new ReadStream(arraybuffer)
        const magic = [rs.readU32be(), rs.readU32be(), rs.readU32be()]
        if (magic[0] !== 0xab4b5458 || magic[1] !== 0x203230bb || magic[2] !== 0x0d0a1a0a) {
            return null
        }
        const header = {
            vkFormat: rs.readU32(),
            typeSize: rs.readU32(),
            pixelWidth: rs.readU32(),
            pixelHeight: rs.readU32(),
            pixelDepth: rs.readU32(),
            layerCount: rs.readU32(),
            faceCount: rs.readU32(),
            levelCount: rs.readU32(),
            supercompressionScheme: rs.readU32(),
        }
        const index = {
            dfdByteOffset: rs.readU32(),
            dfdByteLength: rs.readU32(),
            kvdByteOffset: rs.readU32(),
            kvdByteLength: rs.readU32(),
            sgdByteOffset: rs.readU64(),
            sgdByteLength: rs.readU64(),
        }
        const levels = []
        for (let i = 0; i < Math.max(1, header.levelCount); ++i) {
            levels.push({
                byteOffset: rs.readU64(),
                byteLength: rs.readU64(),
                uncompressedByteLength: rs.readU64(),
            })
        }
        const dfdTotalSize = rs.readU32()
        if (dfdTotalSize !== index.kvdByteOffset - index.dfdByteOffset) {
            return null
        }
        rs.skip(8)
        const colorModel = rs.readU8()
        rs.skip(index.dfdByteLength - 9)
        rs.skip(index.kvdByteLength)
        if (header.supercompressionScheme === 1 || colorModel === KHRConstants.KHR_DF_MODEL_UASTC) {
            const basisModuleFound = basisTranscode(this.device, url.load, arraybuffer, callback, {
                isGGGR: (asset?.file?.variants?.basis?.opt & 8) !== 0,
                isKTX2: true,
            })
            if (!basisModuleFound) {
                callback(
                    `Basis module not found. Asset [${asset.name}](${asset.getFileUrl()}) basis texture variant will not be loaded.`,
                )
            }
        } else {
            callback('unsupported KTX2 pixel format')
        }
    }
    constructor(registry, device) {
        super()
        this.maxRetries = 0
        this.device = device
    }
}

class DdsParser extends TextureParser {
    load(url, callback, asset) {
        Asset.fetchArrayBuffer(url.load, callback, asset, this.maxRetries)
    }
    open(url, data, device, textureOptions = {}) {
        const header = new Uint32Array(data, 0, 128 / 4)
        const width = header[4]
        const height = header[3]
        const mips = Math.max(header[7], 1)
        const isFourCc = header[20] === 4
        const fcc = header[21]
        const bpp = header[22]
        const isCubemap = header[28] === 65024
        const FCC_DXT1 = 827611204
        const FCC_DXT5 = 894720068
        const FCC_FP16 = 113
        const FCC_FP32 = 116
        const FCC_ETC1 = 826496069
        const FCC_PVRTC_2BPP_RGB_1 = 825438800
        const FCC_PVRTC_2BPP_RGBA_1 = 825504336
        const FCC_PVRTC_4BPP_RGB_1 = 825439312
        const FCC_PVRTC_4BPP_RGBA_1 = 825504848
        let compressed = false
        let etc1 = false
        let pvrtc2 = false
        let pvrtc4 = false
        let format = null
        let componentSize = 1
        let texture
        if (isFourCc) {
            if (fcc === FCC_DXT1) {
                format = PIXELFORMAT_DXT1
                compressed = true
            } else if (fcc === FCC_DXT5) {
                format = PIXELFORMAT_DXT5
                compressed = true
            } else if (fcc === FCC_FP16) {
                format = PIXELFORMAT_RGBA16F
                componentSize = 2
            } else if (fcc === FCC_FP32) {
                format = PIXELFORMAT_RGBA32F
                componentSize = 4
            } else if (fcc === FCC_ETC1) {
                format = PIXELFORMAT_ETC1
                compressed = true
                etc1 = true
            } else if (fcc === FCC_PVRTC_2BPP_RGB_1 || fcc === FCC_PVRTC_2BPP_RGBA_1) {
                format = fcc === FCC_PVRTC_2BPP_RGB_1 ? PIXELFORMAT_PVRTC_2BPP_RGB_1 : PIXELFORMAT_PVRTC_2BPP_RGBA_1
                compressed = true
                pvrtc2 = true
            } else if (fcc === FCC_PVRTC_4BPP_RGB_1 || fcc === FCC_PVRTC_4BPP_RGBA_1) {
                format = fcc === FCC_PVRTC_4BPP_RGB_1 ? PIXELFORMAT_PVRTC_4BPP_RGB_1 : PIXELFORMAT_PVRTC_4BPP_RGBA_1
                compressed = true
                pvrtc4 = true
            }
        } else {
            if (bpp === 32) {
                format = PIXELFORMAT_RGBA8
            }
        }
        if (!format) {
            texture = new Texture(device, {
                width: 4,
                height: 4,
                format: PIXELFORMAT_RGB8,
                name: 'dds-legacy-empty',
            })
            return texture
        }
        texture = new Texture(device, {
            name: url,
            addressU: isCubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
            addressV: isCubemap ? ADDRESS_CLAMP_TO_EDGE : ADDRESS_REPEAT,
            width: width,
            height: height,
            format: format,
            cubemap: isCubemap,
            mipmaps: mips > 1,
            ...textureOptions,
        })
        let offset = 128
        const faces = isCubemap ? 6 : 1
        let mipSize
        const DXT_BLOCK_WIDTH = 4
        const DXT_BLOCK_HEIGHT = 4
        const blockSize = fcc === FCC_DXT1 ? 8 : 16
        let numBlocksAcross, numBlocksDown, numBlocks
        for (let face = 0; face < faces; face++) {
            let mipWidth = width
            let mipHeight = height
            for (let i = 0; i < mips; i++) {
                if (compressed) {
                    if (etc1) {
                        mipSize = Math.floor((mipWidth + 3) / 4) * Math.floor((mipHeight + 3) / 4) * 8
                    } else if (pvrtc2) {
                        mipSize = (Math.max(mipWidth, 16) * Math.max(mipHeight, 8)) / 4
                    } else if (pvrtc4) {
                        mipSize = (Math.max(mipWidth, 8) * Math.max(mipHeight, 8)) / 2
                    } else {
                        numBlocksAcross = Math.floor((mipWidth + DXT_BLOCK_WIDTH - 1) / DXT_BLOCK_WIDTH)
                        numBlocksDown = Math.floor((mipHeight + DXT_BLOCK_HEIGHT - 1) / DXT_BLOCK_HEIGHT)
                        numBlocks = numBlocksAcross * numBlocksDown
                        mipSize = numBlocks * blockSize
                    }
                } else {
                    mipSize = mipWidth * mipHeight * 4
                }
                const mipBuff =
                    format === PIXELFORMAT_RGBA32F
                        ? new Float32Array(data, offset, mipSize)
                        : format === PIXELFORMAT_RGBA16F
                          ? new Uint16Array(data, offset, mipSize)
                          : new Uint8Array(data, offset, mipSize)
                if (!isCubemap) {
                    texture._levels[i] = mipBuff
                } else {
                    if (!texture._levels[i]) texture._levels[i] = []
                    texture._levels[i][face] = mipBuff
                }
                offset += mipSize * componentSize
                mipWidth = Math.max(mipWidth * 0.5, 1)
                mipHeight = Math.max(mipHeight * 0.5, 1)
            }
        }
        texture.upload()
        return texture
    }
    constructor(registry) {
        super()
        this.maxRetries = 0
    }
}

class HdrParser extends TextureParser {
    load(url, callback, asset) {
        Asset.fetchArrayBuffer(url.load, callback, asset, this.maxRetries)
        if (asset.data && !asset.data.type) {
            asset.data.type = TEXTURETYPE_RGBE
        }
    }
    open(url, data, device, textureOptions = {}) {
        const textureData = this.parse(data)
        if (!textureData) {
            return null
        }
        const texture = new Texture(device, {
            name: url,
            addressU: ADDRESS_REPEAT,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            width: textureData.width,
            height: textureData.height,
            levels: textureData.levels,
            format: PIXELFORMAT_RGBA8,
            type: TEXTURETYPE_RGBE,
            mipmaps: false,
            ...textureOptions,
        })
        texture.upload()
        return texture
    }
    parse(data) {
        const readStream = new ReadStream(data)
        const magic = readStream.readLine()
        if (!magic.startsWith('#?RADIANCE')) {
            return null
        }
        const variables = {}
        while (true) {
            const line = readStream.readLine()
            if (line.length === 0) {
                break
            } else {
                const parts = line.split('=')
                if (parts.length === 2) {
                    variables[parts[0]] = parts[1]
                }
            }
        }
        if (!variables.hasOwnProperty('FORMAT')) {
            return null
        }
        const resolution = readStream.readLine().split(' ')
        if (resolution.length !== 4) {
            return null
        }
        const height = parseInt(resolution[1], 10)
        const width = parseInt(resolution[3], 10)
        const pixels = this._readPixels(readStream, width, height, resolution[0] === '-Y')
        if (!pixels) {
            return null
        }
        return {
            width: width,
            height: height,
            levels: [pixels],
        }
    }
    _readPixels(readStream, width, height, flipY) {
        if (width < 8 || width > 0x7fff) {
            return this._readPixelsFlat(readStream, width, height)
        }
        const rgbe = [0, 0, 0, 0]
        readStream.readArray(rgbe)
        if (rgbe[0] !== 2 || rgbe[1] !== 2 || (rgbe[2] & 0x80) !== 0) {
            readStream.skip(-4)
            return this._readPixelsFlat(readStream, width, height)
        }
        const buffer = new ArrayBuffer(width * height * 4)
        const view = new Uint8Array(buffer)
        let scanstart = flipY ? 0 : width * 4 * (height - 1)
        let x, y, i, channel, count, value
        for (y = 0; y < height; ++y) {
            if (y) {
                readStream.readArray(rgbe)
            }
            if ((rgbe[2] << 8) + rgbe[3] !== width) {
                return null
            }
            for (channel = 0; channel < 4; ++channel) {
                x = 0
                while (x < width) {
                    count = readStream.readU8()
                    if (count > 128) {
                        count -= 128
                        if (x + count > width) {
                            return null
                        }
                        value = readStream.readU8()
                        for (i = 0; i < count; ++i) {
                            view[scanstart + channel + 4 * x++] = value
                        }
                    } else {
                        if (count === 0 || x + count > width) {
                            return null
                        }
                        for (i = 0; i < count; ++i) {
                            view[scanstart + channel + 4 * x++] = readStream.readU8()
                        }
                    }
                }
            }
            scanstart += width * 4 * (flipY ? 1 : -1)
        }
        return view
    }
    _readPixelsFlat(readStream, width, height) {
        return readStream.remainingBytes === width * height * 4
            ? new Uint8Array(readStream.arraybuffer, readStream.offset)
            : null
    }
    constructor(registry) {
        super()
        this.maxRetries = 0
    }
}

const JSON_ADDRESS_MODE = {
    repeat: ADDRESS_REPEAT,
    clamp: ADDRESS_CLAMP_TO_EDGE,
    mirror: ADDRESS_MIRRORED_REPEAT,
}
const JSON_FILTER_MODE = {
    nearest: FILTER_NEAREST,
    linear: FILTER_LINEAR,
    nearest_mip_nearest: FILTER_NEAREST_MIPMAP_NEAREST,
    linear_mip_nearest: FILTER_LINEAR_MIPMAP_NEAREST,
    nearest_mip_linear: FILTER_NEAREST_MIPMAP_LINEAR,
    linear_mip_linear: FILTER_LINEAR_MIPMAP_LINEAR,
}
const JSON_TEXTURE_TYPE = {
    default: TEXTURETYPE_DEFAULT,
    rgbm: TEXTURETYPE_RGBM,
    rgbe: TEXTURETYPE_RGBE,
    rgbp: TEXTURETYPE_RGBP,
    swizzleGGGR: TEXTURETYPE_SWIZZLEGGGR,
}
const _completePartialMipmapChain = function (texture) {
    const requiredMipLevels = TextureUtils.calcMipLevelsCount(texture._width, texture._height)
    const isHtmlElement = function (object) {
        return (
            object instanceof HTMLCanvasElement ||
            object instanceof HTMLImageElement ||
            object instanceof HTMLVideoElement
        )
    }
    if (
        !(texture._format === PIXELFORMAT_RGBA8 || texture._format === PIXELFORMAT_RGBA32F) ||
        texture._volume ||
        texture._compressed ||
        texture._levels.length === 1 ||
        texture._levels.length === requiredMipLevels ||
        isHtmlElement(texture._cubemap ? texture._levels[0][0] : texture._levels[0])
    ) {
        return
    }
    const downsample = function (width, height, data) {
        const sampledWidth = Math.max(1, width >> 1)
        const sampledHeight = Math.max(1, height >> 1)
        const sampledData = new data.constructor(sampledWidth * sampledHeight * 4)
        const xs = Math.floor(width / sampledWidth)
        const ys = Math.floor(height / sampledHeight)
        const xsys = xs * ys
        for (let y = 0; y < sampledHeight; ++y) {
            for (let x = 0; x < sampledWidth; ++x) {
                for (let e = 0; e < 4; ++e) {
                    let sum = 0
                    for (let sy = 0; sy < ys; ++sy) {
                        for (let sx = 0; sx < xs; ++sx) {
                            sum += data[(x * xs + sx + (y * ys + sy) * width) * 4 + e]
                        }
                    }
                    sampledData[(x + y * sampledWidth) * 4 + e] = sum / xsys
                }
            }
        }
        return sampledData
    }
    for (let level = texture._levels.length; level < requiredMipLevels; ++level) {
        const width = Math.max(1, texture._width >> (level - 1))
        const height = Math.max(1, texture._height >> (level - 1))
        if (texture._cubemap) {
            const mips = []
            for (let face = 0; face < 6; ++face) {
                mips.push(downsample(width, height, texture._levels[level - 1][face]))
            }
            texture._levels.push(mips)
        } else {
            texture._levels.push(downsample(width, height, texture._levels[level - 1]))
        }
    }
    texture._levelsUpdated = texture._cubemap ? [[true, true, true, true, true, true]] : [true]
}
class TextureHandler extends ResourceHandler {
    set crossOrigin(value) {
        this.imgParser.crossOrigin = value
    }
    get crossOrigin() {
        return this.imgParser.crossOrigin
    }
    set maxRetries(value) {
        this.imgParser.maxRetries = value
        for (const parser in this.parsers) {
            if (this.parsers.hasOwnProperty(parser)) {
                this.parsers[parser].maxRetries = value
            }
        }
    }
    get maxRetries() {
        return this.imgParser.maxRetries
    }
    _getUrlWithoutParams(url) {
        return url.indexOf('?') >= 0 ? url.split('?')[0] : url
    }
    _getParser(url) {
        const ext = path.getExtension(this._getUrlWithoutParams(url)).toLowerCase().replace('.', '')
        return this.parsers[ext] || this.imgParser
    }
    _getTextureOptions(asset) {
        const options = {}
        if (asset) {
            if (asset.name?.length > 0) {
                options.name = asset.name
            }
            const assetData = asset.data
            if (assetData.hasOwnProperty('minfilter')) {
                options.minFilter = JSON_FILTER_MODE[assetData.minfilter]
            }
            if (assetData.hasOwnProperty('magfilter')) {
                options.magFilter = JSON_FILTER_MODE[assetData.magfilter]
            }
            if (assetData.hasOwnProperty('addressu')) {
                options.addressU = JSON_ADDRESS_MODE[assetData.addressu]
            }
            if (assetData.hasOwnProperty('addressv')) {
                options.addressV = JSON_ADDRESS_MODE[assetData.addressv]
            }
            if (assetData.hasOwnProperty('mipmaps')) {
                options.mipmaps = assetData.mipmaps
            }
            if (assetData.hasOwnProperty('anisotropy')) {
                options.anisotropy = assetData.anisotropy
            }
            if (assetData.hasOwnProperty('flipY')) {
                options.flipY = !!assetData.flipY
            }
            if (assetData.hasOwnProperty('srgb')) {
                options.srgb = !!assetData.srgb
            }
            options.type = TEXTURETYPE_DEFAULT
            if (assetData.hasOwnProperty('type')) {
                options.type = JSON_TEXTURE_TYPE[assetData.type]
            } else if (assetData.hasOwnProperty('rgbm') && assetData.rgbm) {
                options.type = TEXTURETYPE_RGBM
            } else if (asset.file && (asset.file.opt & 8) !== 0) {
                options.type = TEXTURETYPE_SWIZZLEGGGR
            }
        }
        return options
    }
    load(url, callback, asset) {
        if (typeof url === 'string') {
            url = {
                load: url,
                original: url,
            }
        }
        this._getParser(url.original).load(url, callback, asset)
    }
    open(url, data, asset) {
        if (!url) {
            return undefined
        }
        const textureOptions = this._getTextureOptions(asset)
        let texture = this._getParser(url).open(url, data, this._device, textureOptions)
        if (texture === null) {
            texture = new Texture(this._device, {
                width: 4,
                height: 4,
                format: PIXELFORMAT_RGB8,
            })
        } else {
            _completePartialMipmapChain(texture)
            if (data.unswizzledGGGR) {
                asset.file.variants.basis.opt &= -9
            }
        }
        return texture
    }
    patch(asset, assets) {
        const texture = asset.resource
        if (!texture) {
            return
        }
        const options = this._getTextureOptions(asset)
        for (const key of Object.keys(options)) {
            texture[key] = options[key]
        }
    }
    constructor(app) {
        super(app, 'texture')
        const assets = app.assets
        const device = app.graphicsDevice
        this._device = device
        this._assets = assets
        this.imgParser = new ImgParser(assets, device)
        this.parsers = {
            dds: new DdsParser(assets),
            ktx: new KtxParser(assets),
            ktx2: new Ktx2Parser(assets, device),
            basis: new BasisParser(assets, device),
            hdr: new HdrParser(assets),
        }
    }
}

const XRTYPE_INLINE = 'inline'
const XRTYPE_VR = 'immersive-vr'
const XRTYPE_AR = 'immersive-ar'
const XRSPACE_VIEWER = 'viewer'
const XRHAND_LEFT = 'left'
const XRDEPTHSENSINGUSAGE_CPU = 'cpu-optimized'
const XRDEPTHSENSINGUSAGE_GPU = 'gpu-optimized'
const XRDEPTHSENSINGFORMAT_L8A8 = 'luminance-alpha'
const XRDEPTHSENSINGFORMAT_R16U = 'unsigned-short'
const XRDEPTHSENSINGFORMAT_F32 = 'float32'

class XrDomOverlay {
    get supported() {
        return this._supported
    }
    get available() {
        return this._supported && this._manager.active && this._manager._session.domOverlayState !== null
    }
    get state() {
        if (!this._supported || !this._manager.active || !this._manager._session.domOverlayState) {
            return null
        }
        return this._manager._session.domOverlayState.type
    }
    set root(value) {
        if (!this._supported || this._manager.active) {
            return
        }
        this._root = value
    }
    get root() {
        return this._root
    }
    constructor(manager) {
        this._supported = platform.browser && !!window.XRDOMOverlayState
        this._root = null
        this._manager = manager
    }
}

const poolVec3 = []
const poolQuat = []
class XrHitTestSource extends EventHandler {
    remove() {
        if (!this._xrHitTestSource) {
            return
        }
        const sources = this.manager.hitTest.sources
        const ind = sources.indexOf(this)
        if (ind !== -1) sources.splice(ind, 1)
        this.onStop()
    }
    onStop() {
        this._xrHitTestSource.cancel()
        this._xrHitTestSource = null
        this.fire('remove')
        this.manager.hitTest.fire('remove', this)
    }
    update(frame) {
        if (this._transient) {
            const transientResults = frame.getHitTestResultsForTransientInput(this._xrHitTestSource)
            for (let i = 0; i < transientResults.length; i++) {
                const transientResult = transientResults[i]
                if (!transientResult.results.length) {
                    continue
                }
                let inputSource
                if (transientResult.inputSource) {
                    inputSource = this.manager.input._getByInputSource(transientResult.inputSource)
                }
                this.updateHitResults(transientResult.results, inputSource)
            }
        } else {
            const results = frame.getHitTestResults(this._xrHitTestSource)
            if (!results.length) {
                return
            }
            this.updateHitResults(results)
        }
    }
    updateHitResults(results, inputSource) {
        if (this._inputSource && this._inputSource !== inputSource) {
            return
        }
        const origin = poolVec3.pop() ?? new Vec3()
        if (inputSource) {
            origin.copy(inputSource.getOrigin())
        } else {
            origin.copy(this.manager.camera.getPosition())
        }
        let candidateDistance = Infinity
        let candidateHitTestResult = null
        const position = poolVec3.pop() ?? new Vec3()
        const rotation = poolQuat.pop() ?? new Quat()
        for (let i = 0; i < results.length; i++) {
            const pose = results[i].getPose(this.manager._referenceSpace)
            const distance = origin.distance(pose.transform.position)
            if (distance >= candidateDistance) {
                continue
            }
            candidateDistance = distance
            candidateHitTestResult = results[i]
            position.copy(pose.transform.position)
            rotation.copy(pose.transform.orientation)
        }
        this.fire('result', position, rotation, inputSource || this._inputSource, candidateHitTestResult)
        this.manager.hitTest.fire(
            'result',
            this,
            position,
            rotation,
            inputSource || this._inputSource,
            candidateHitTestResult,
        )
        poolVec3.push(origin)
        poolVec3.push(position)
        poolQuat.push(rotation)
    }
    constructor(manager, xrHitTestSource, transient, inputSource = null) {
        super()
        this.manager = manager
        this._xrHitTestSource = xrHitTestSource
        this._transient = transient
        this._inputSource = inputSource
    }
}
XrHitTestSource.EVENT_REMOVE = 'remove'
XrHitTestSource.EVENT_RESULT = 'result'

class XrHitTest extends EventHandler {
    _onSessionStart() {
        if (this.manager.session.enabledFeatures) {
            const available = this.manager.session.enabledFeatures.indexOf('hit-test') !== -1
            if (!available) return
            this._available = available
            this.fire('available')
        } else if (!this._checkingAvailability) {
            this._checkingAvailability = true
            this.manager.session
                .requestReferenceSpace(XRSPACE_VIEWER)
                .then((referenceSpace) => {
                    this.manager.session
                        .requestHitTestSource({
                            space: referenceSpace,
                        })
                        .then((hitTestSource) => {
                            hitTestSource.cancel()
                            if (this.manager.active) {
                                this._available = true
                                this.fire('available')
                            }
                        })
                        .catch(() => {})
                })
                .catch(() => {})
        }
    }
    _onSessionEnd() {
        if (!this._available) return
        this._available = false
        for (let i = 0; i < this.sources.length; i++) {
            this.sources[i].onStop()
        }
        this.sources = []
        this.fire('unavailable')
    }
    start(options = {}) {
        if (!this._supported) {
            options.callback?.(new Error('XR HitTest is not supported'), null)
            return
        }
        if (!this._available) {
            options.callback?.(new Error('XR HitTest is not available'), null)
            return
        }
        if (!options.profile && !options.spaceType) {
            options.spaceType = XRSPACE_VIEWER
        }
        let xrRay
        const offsetRay = options.offsetRay
        if (offsetRay) {
            const origin = new DOMPoint(offsetRay.origin.x, offsetRay.origin.y, offsetRay.origin.z, 1.0)
            const direction = new DOMPoint(offsetRay.direction.x, offsetRay.direction.y, offsetRay.direction.z, 0.0)
            xrRay = new XRRay(origin, direction)
        }
        const callback = options.callback
        if (options.spaceType) {
            this.manager.session
                .requestReferenceSpace(options.spaceType)
                .then((referenceSpace) => {
                    if (!this.manager.session) {
                        const err = new Error('XR Session is not started (2)')
                        if (callback) callback(err)
                        this.fire('error', err)
                        return
                    }
                    this.manager.session
                        .requestHitTestSource({
                            space: referenceSpace,
                            entityTypes: options.entityTypes || undefined,
                            offsetRay: xrRay,
                        })
                        .then((xrHitTestSource) => {
                            this._onHitTestSource(xrHitTestSource, false, options.inputSource, callback)
                        })
                        .catch((ex) => {
                            if (callback) callback(ex)
                            this.fire('error', ex)
                        })
                })
                .catch((ex) => {
                    if (callback) callback(ex)
                    this.fire('error', ex)
                })
        } else {
            this.manager.session
                .requestHitTestSourceForTransientInput({
                    profile: options.profile,
                    entityTypes: options.entityTypes || undefined,
                    offsetRay: xrRay,
                })
                .then((xrHitTestSource) => {
                    this._onHitTestSource(xrHitTestSource, true, options.inputSource, callback)
                })
                .catch((ex) => {
                    if (callback) callback(ex)
                    this.fire('error', ex)
                })
        }
    }
    _onHitTestSource(xrHitTestSource, transient, inputSource, callback) {
        if (!this.manager.session) {
            xrHitTestSource.cancel()
            const err = new Error('XR Session is not started (3)')
            if (callback) callback(err)
            this.fire('error', err)
            return
        }
        const hitTestSource = new XrHitTestSource(this.manager, xrHitTestSource, transient, inputSource ?? null)
        this.sources.push(hitTestSource)
        if (callback) callback(null, hitTestSource)
        this.fire('add', hitTestSource)
    }
    update(frame) {
        if (!this._available) {
            return
        }
        for (let i = 0; i < this.sources.length; i++) {
            this.sources[i].update(frame)
        }
    }
    get supported() {
        return this._supported
    }
    get available() {
        return this._available
    }
    constructor(manager) {
        ;(super(),
            (this._supported =
                platform.browser && !!(window.XRSession && window.XRSession.prototype.requestHitTestSource)),
            (this._available = false),
            (this._checkingAvailability = false),
            (this.sources = []))
        this.manager = manager
        if (this._supported) {
            this.manager.on('start', this._onSessionStart, this)
            this.manager.on('end', this._onSessionEnd, this)
        }
    }
}
XrHitTest.EVENT_AVAILABLE = 'available'
XrHitTest.EVENT_UNAVAILABLE = 'unavailable'
XrHitTest.EVENT_ADD = 'add'
XrHitTest.EVENT_REMOVE = 'remove'
XrHitTest.EVENT_RESULT = 'result'
XrHitTest.EVENT_ERROR = 'error'

class XrTrackedImage extends EventHandler {
    get image() {
        return this._image
    }
    set width(value) {
        this._width = value
    }
    get width() {
        return this._width
    }
    get trackable() {
        return this._trackable
    }
    get tracking() {
        return this._tracking
    }
    get emulated() {
        return this._emulated
    }
    prepare() {
        if (this._bitmap) {
            return {
                image: this._bitmap,
                widthInMeters: this._width,
            }
        }
        return createImageBitmap(this._image).then((bitmap) => {
            this._bitmap = bitmap
            return {
                image: this._bitmap,
                widthInMeters: this._width,
            }
        })
    }
    destroy() {
        this._image = null
        this._pose = null
        if (this._bitmap) {
            this._bitmap.close()
            this._bitmap = null
        }
    }
    getPosition() {
        if (this._pose) this._position.copy(this._pose.transform.position)
        return this._position
    }
    getRotation() {
        if (this._pose) this._rotation.copy(this._pose.transform.orientation)
        return this._rotation
    }
    constructor(image, width) {
        ;(super(),
            (this._bitmap = null),
            (this._measuredWidth = 0),
            (this._trackable = false),
            (this._tracking = false),
            (this._emulated = false),
            (this._pose = null),
            (this._position = new Vec3()),
            (this._rotation = new Quat()))
        this._image = image
        this._width = width
    }
}
XrTrackedImage.EVENT_TRACKED = 'tracked'
XrTrackedImage.EVENT_UNTRACKED = 'untracked'

class XrImageTracking extends EventHandler {
    add(image, width) {
        if (!this._supported || this._manager.active) return null
        const trackedImage = new XrTrackedImage(image, width)
        this._images.push(trackedImage)
        return trackedImage
    }
    remove(trackedImage) {
        if (this._manager.active) return
        const ind = this._images.indexOf(trackedImage)
        if (ind !== -1) {
            trackedImage.destroy()
            this._images.splice(ind, 1)
        }
    }
    _onSessionStart() {
        this._manager.session
            .getTrackedImageScores()
            .then((images) => {
                this._available = true
                for (let i = 0; i < images.length; i++) {
                    this._images[i]._trackable = images[i] === 'trackable'
                }
            })
            .catch((err) => {
                this._available = false
                this.fire('error', err)
            })
    }
    _onSessionEnd() {
        this._available = false
        for (let i = 0; i < this._images.length; i++) {
            const image = this._images[i]
            image._pose = null
            image._measuredWidth = 0
            if (image._tracking) {
                image._tracking = false
                image.fire('untracked')
            }
        }
    }
    prepareImages(callback) {
        if (this._images.length) {
            Promise.all(
                this._images.map((trackedImage) => {
                    return trackedImage.prepare()
                }),
            )
                .then((bitmaps) => {
                    callback(null, bitmaps)
                })
                .catch((err) => {
                    callback(err, null)
                })
        } else {
            callback(null, null)
        }
    }
    update(frame) {
        if (!this._available) return
        const results = frame.getImageTrackingResults()
        const index = {}
        for (let i = 0; i < results.length; i++) {
            index[results[i].index] = results[i]
            const trackedImage = this._images[results[i].index]
            trackedImage._emulated = results[i].trackingState === 'emulated'
            trackedImage._measuredWidth = results[i].measuredWidthInMeters
            trackedImage._pose = frame.getPose(results[i].imageSpace, this._manager._referenceSpace)
        }
        for (let i = 0; i < this._images.length; i++) {
            if (this._images[i]._tracking && !index[i]) {
                this._images[i]._tracking = false
                this._images[i].fire('untracked')
            } else if (!this._images[i]._tracking && index[i]) {
                this._images[i]._tracking = true
                this._images[i].fire('tracked')
            }
        }
    }
    get supported() {
        return this._supported
    }
    get available() {
        return this._available
    }
    get images() {
        return this._images
    }
    constructor(manager) {
        ;(super(),
            (this._supported = platform.browser && !!window.XRImageTrackingResult),
            (this._available = false),
            (this._images = []))
        this._manager = manager
        if (this._supported) {
            this._manager.on('start', this._onSessionStart, this)
            this._manager.on('end', this._onSessionEnd, this)
        }
    }
}
XrImageTracking.EVENT_ERROR = 'error'

class XrFinger {
    get index() {
        return this._index
    }
    get hand() {
        return this._hand
    }
    get joints() {
        return this._joints
    }
    get tip() {
        return this._tip
    }
    constructor(index, hand) {
        this._joints = []
        this._tip = null
        this._index = index
        this._hand = hand
        this._hand._fingers.push(this)
    }
}

const tipJointIds =
    platform.browser && window.XRHand
        ? ['thumb-tip', 'index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip']
        : []
const tipJointIdsIndex = {}
for (let i = 0; i < tipJointIds.length; i++) {
    tipJointIdsIndex[tipJointIds[i]] = true
}
class XrJoint {
    update(pose) {
        this._dirtyLocal = true
        this._radius = pose.radius
        this._localPosition.copy(pose.transform.position)
        this._localRotation.copy(pose.transform.orientation)
    }
    _updateTransforms() {
        if (this._dirtyLocal) {
            this._dirtyLocal = false
            this._localTransform.setTRS(this._localPosition, this._localRotation, Vec3.ONE)
        }
        const manager = this._hand._manager
        const parent = manager.camera.parent
        if (parent) {
            this._worldTransform.mul2(parent.getWorldTransform(), this._localTransform)
        } else {
            this._worldTransform.copy(this._localTransform)
        }
    }
    getPosition() {
        this._updateTransforms()
        this._worldTransform.getTranslation(this._position)
        return this._position
    }
    getRotation() {
        this._updateTransforms()
        this._rotation.setFromMat4(this._worldTransform)
        return this._rotation
    }
    get id() {
        return this._id
    }
    get index() {
        return this._index
    }
    get hand() {
        return this._hand
    }
    get finger() {
        return this._finger
    }
    get wrist() {
        return this._wrist
    }
    get tip() {
        return this._tip
    }
    get radius() {
        return this._radius || 0.005
    }
    constructor(index, id, hand, finger = null) {
        this._radius = null
        this._localTransform = new Mat4()
        this._worldTransform = new Mat4()
        this._localPosition = new Vec3()
        this._localRotation = new Quat()
        this._position = new Vec3()
        this._rotation = new Quat()
        this._dirtyLocal = true
        this._index = index
        this._id = id
        this._hand = hand
        this._finger = finger
        this._wrist = id === 'wrist'
        this._tip = this._finger && !!tipJointIdsIndex[id]
    }
}

let fingerJointIds = []
const vecA = new Vec3()
const vecB = new Vec3()
const vecC = new Vec3()
if (platform.browser && window.XRHand) {
    fingerJointIds = [
        ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'],
        [
            'index-finger-metacarpal',
            'index-finger-phalanx-proximal',
            'index-finger-phalanx-intermediate',
            'index-finger-phalanx-distal',
            'index-finger-tip',
        ],
        [
            'middle-finger-metacarpal',
            'middle-finger-phalanx-proximal',
            'middle-finger-phalanx-intermediate',
            'middle-finger-phalanx-distal',
            'middle-finger-tip',
        ],
        [
            'ring-finger-metacarpal',
            'ring-finger-phalanx-proximal',
            'ring-finger-phalanx-intermediate',
            'ring-finger-phalanx-distal',
            'ring-finger-tip',
        ],
        [
            'pinky-finger-metacarpal',
            'pinky-finger-phalanx-proximal',
            'pinky-finger-phalanx-intermediate',
            'pinky-finger-phalanx-distal',
            'pinky-finger-tip',
        ],
    ]
}
class XrHand extends EventHandler {
    update(frame) {
        const xrInputSource = this._inputSource._xrInputSource
        for (let j = 0; j < this._joints.length; j++) {
            const joint = this._joints[j]
            const jointSpace = xrInputSource.hand.get(joint._id)
            if (jointSpace) {
                let pose
                if (frame.session.visibilityState !== 'hidden') {
                    pose = frame.getJointPose(jointSpace, this._manager._referenceSpace)
                }
                if (pose) {
                    joint.update(pose)
                    if (joint.wrist && !this._tracking) {
                        this._tracking = true
                        this.fire('tracking')
                    }
                } else if (joint.wrist) {
                    if (this._tracking) {
                        this._tracking = false
                        this.fire('trackinglost')
                    }
                    break
                }
            }
        }
        const j1 = this._jointsById['thumb-metacarpal']
        const j4 = this._jointsById['thumb-tip']
        const j6 = this._jointsById['index-finger-phalanx-proximal']
        const j9 = this._jointsById['index-finger-tip']
        const j16 = this._jointsById['ring-finger-phalanx-proximal']
        const j21 = this._jointsById['pinky-finger-phalanx-proximal']
        if (j1 && j4 && j6 && j9 && j16 && j21) {
            this._inputSource._dirtyRay = true
            this._inputSource._rayLocal.origin.lerp(j4._localPosition, j9._localPosition, 0.5)
            let jointL = j1
            let jointR = j21
            if (this._inputSource.handedness === XRHAND_LEFT) {
                const t = jointL
                jointL = jointR
                jointR = t
            }
            vecA.sub2(jointL._localPosition, this._wrist._localPosition)
            vecB.sub2(jointR._localPosition, this._wrist._localPosition)
            vecC.cross(vecA, vecB).normalize()
            vecA.lerp(j6._localPosition, j16._localPosition, 0.5)
            vecA.sub(this._wrist._localPosition).normalize()
            this._inputSource._rayLocal.direction.lerp(vecC, vecA, 0.5).normalize()
        }
        const squeezing =
            this._fingerIsClosed(1) && this._fingerIsClosed(2) && this._fingerIsClosed(3) && this._fingerIsClosed(4)
        if (squeezing) {
            if (!this._inputSource._squeezing) {
                this._inputSource._squeezing = true
                this._inputSource.fire('squeezestart')
                this._manager.input.fire('squeezestart', this._inputSource)
            }
        } else {
            if (this._inputSource._squeezing) {
                this._inputSource._squeezing = false
                this._inputSource.fire('squeeze')
                this._manager.input.fire('squeeze', this._inputSource)
                this._inputSource.fire('squeezeend')
                this._manager.input.fire('squeezeend', this._inputSource)
            }
        }
    }
    _fingerIsClosed(index) {
        const finger = this._fingers[index]
        vecA.sub2(finger.joints[0]._localPosition, finger.joints[1]._localPosition).normalize()
        vecB.sub2(finger.joints[2]._localPosition, finger.joints[3]._localPosition).normalize()
        return vecA.dot(vecB) < -0.8
    }
    getJointById(id) {
        return this._jointsById[id] || null
    }
    get fingers() {
        return this._fingers
    }
    get joints() {
        return this._joints
    }
    get tips() {
        return this._tips
    }
    get wrist() {
        return this._wrist
    }
    get tracking() {
        return this._tracking
    }
    constructor(inputSource) {
        ;(super(),
            (this._tracking = false),
            (this._fingers = []),
            (this._joints = []),
            (this._jointsById = {}),
            (this._tips = []),
            (this._wrist = null))
        const xrHand = inputSource._xrInputSource.hand
        this._manager = inputSource._manager
        this._inputSource = inputSource
        if (xrHand.get('wrist')) {
            const joint = new XrJoint(0, 'wrist', this, null)
            this._wrist = joint
            this._joints.push(joint)
            this._jointsById.wrist = joint
        }
        for (let f = 0; f < fingerJointIds.length; f++) {
            const finger = new XrFinger(f, this)
            for (let j = 0; j < fingerJointIds[f].length; j++) {
                const jointId = fingerJointIds[f][j]
                if (!xrHand.get(jointId)) continue
                const joint = new XrJoint(j, jointId, this, finger)
                this._joints.push(joint)
                this._jointsById[jointId] = joint
                if (joint.tip) {
                    this._tips.push(joint)
                    finger._tip = joint
                }
                finger._joints.push(joint)
            }
        }
    }
}
XrHand.EVENT_TRACKING = 'tracking'
XrHand.EVENT_TRACKINGLOST = 'trackinglost'

const vec3A$1 = new Vec3()
const quat = new Quat()
let ids$1 = 0
class XrInputSource extends EventHandler {
    get id() {
        return this._id
    }
    get inputSource() {
        return this._xrInputSource
    }
    get targetRayMode() {
        return this._xrInputSource.targetRayMode
    }
    get handedness() {
        return this._xrInputSource.handedness
    }
    get profiles() {
        return this._xrInputSource.profiles
    }
    get grip() {
        return this._grip
    }
    get hand() {
        return this._hand
    }
    get gamepad() {
        return this._xrInputSource.gamepad || null
    }
    get selecting() {
        return this._selecting
    }
    get squeezing() {
        return this._squeezing
    }
    set elementInput(value) {
        if (this._elementInput === value) {
            return
        }
        this._elementInput = value
        if (!this._elementInput) {
            this._elementEntity = null
        }
    }
    get elementInput() {
        return this._elementInput
    }
    get elementEntity() {
        return this._elementEntity
    }
    get hitTestSources() {
        return this._hitTestSources
    }
    update(frame) {
        if (this._hand) {
            this._hand.update(frame)
        } else {
            const gripSpace = this._xrInputSource.gripSpace
            if (gripSpace) {
                const gripPose = frame.getPose(gripSpace, this._manager._referenceSpace)
                if (gripPose) {
                    if (!this._grip) {
                        this._grip = true
                        this._localTransform = new Mat4()
                        this._worldTransform = new Mat4()
                        this._localPositionLast = new Vec3()
                        this._localPosition = new Vec3()
                        this._localRotation = new Quat()
                        this._linearVelocity = new Vec3()
                    }
                    const timestamp = now()
                    const dt = (timestamp - this._velocitiesTimestamp) / 1000
                    this._velocitiesTimestamp = timestamp
                    this._dirtyLocal = true
                    this._localPositionLast.copy(this._localPosition)
                    this._localPosition.copy(gripPose.transform.position)
                    this._localRotation.copy(gripPose.transform.orientation)
                    this._velocitiesAvailable = true
                    if (this._manager.input.velocitiesSupported && gripPose.linearVelocity) {
                        this._linearVelocity.copy(gripPose.linearVelocity)
                    } else if (dt > 0) {
                        vec3A$1.sub2(this._localPosition, this._localPositionLast).divScalar(dt)
                        this._linearVelocity.lerp(this._linearVelocity, vec3A$1, 0.15)
                    }
                } else {
                    this._velocitiesAvailable = false
                }
            }
            const targetRayPose = frame.getPose(this._xrInputSource.targetRaySpace, this._manager._referenceSpace)
            if (targetRayPose) {
                this._dirtyRay = true
                this._rayLocal.origin.copy(targetRayPose.transform.position)
                this._rayLocal.direction.set(0, 0, -1)
                quat.copy(targetRayPose.transform.orientation)
                quat.transformVector(this._rayLocal.direction, this._rayLocal.direction)
            }
        }
    }
    _updateTransforms() {
        if (this._dirtyLocal) {
            this._dirtyLocal = false
            this._localTransform.setTRS(this._localPosition, this._localRotation, Vec3.ONE)
        }
        const parent = this._manager.camera.parent
        if (parent) {
            this._worldTransform.mul2(parent.getWorldTransform(), this._localTransform)
        } else {
            this._worldTransform.copy(this._localTransform)
        }
    }
    _updateRayTransforms() {
        const dirty = this._dirtyRay
        this._dirtyRay = false
        const parent = this._manager.camera.parent
        if (parent) {
            const parentTransform = parent.getWorldTransform()
            parentTransform.getTranslation(this._position)
            this._rotation.setFromMat4(parentTransform)
            this._rotation.transformVector(this._rayLocal.origin, this._ray.origin)
            this._ray.origin.add(this._position)
            this._rotation.transformVector(this._rayLocal.direction, this._ray.direction)
        } else if (dirty) {
            this._ray.origin.copy(this._rayLocal.origin)
            this._ray.direction.copy(this._rayLocal.direction)
        }
    }
    getPosition() {
        if (!this._grip) return null
        this._updateTransforms()
        this._worldTransform.getTranslation(this._position)
        return this._position
    }
    getLocalPosition() {
        return this._localPosition
    }
    getRotation() {
        if (!this._grip) return null
        this._updateTransforms()
        this._rotation.setFromMat4(this._worldTransform)
        return this._rotation
    }
    getLocalRotation() {
        return this._localRotation
    }
    getLinearVelocity() {
        if (!this._velocitiesAvailable) {
            return null
        }
        return this._linearVelocity
    }
    getOrigin() {
        this._updateRayTransforms()
        return this._ray.origin
    }
    getDirection() {
        this._updateRayTransforms()
        return this._ray.direction
    }
    hitTestStart(options = {}) {
        options.inputSource = this
        options.profile = this._xrInputSource.profiles[0]
        const callback = options.callback
        options.callback = (err, hitTestSource) => {
            if (hitTestSource) this.onHitTestSourceAdd(hitTestSource)
            if (callback) callback(err, hitTestSource)
        }
        this._manager.hitTest.start(options)
    }
    onHitTestSourceAdd(hitTestSource) {
        this._hitTestSources.push(hitTestSource)
        this.fire('hittest:add', hitTestSource)
        hitTestSource.on('result', (position, rotation, inputSource, hitTestResult) => {
            if (inputSource !== this) return
            this.fire('hittest:result', hitTestSource, position, rotation, hitTestResult)
        })
        hitTestSource.once('remove', () => {
            this.onHitTestSourceRemove(hitTestSource)
            this.fire('hittest:remove', hitTestSource)
        })
    }
    onHitTestSourceRemove(hitTestSource) {
        const ind = this._hitTestSources.indexOf(hitTestSource)
        if (ind !== -1) this._hitTestSources.splice(ind, 1)
    }
    constructor(manager, xrInputSource) {
        ;(super(),
            (this._ray = new Ray()),
            (this._rayLocal = new Ray()),
            (this._grip = false),
            (this._hand = null),
            (this._velocitiesAvailable = false),
            (this._velocitiesTimestamp = now()),
            (this._localTransform = null),
            (this._worldTransform = null),
            (this._position = new Vec3()),
            (this._rotation = new Quat()),
            (this._localPosition = null),
            (this._localPositionLast = null),
            (this._localRotation = null),
            (this._linearVelocity = null),
            (this._dirtyLocal = true),
            (this._dirtyRay = false),
            (this._selecting = false),
            (this._squeezing = false),
            (this._elementInput = true),
            (this._elementEntity = null),
            (this._hitTestSources = []))
        this._id = ++ids$1
        this._manager = manager
        this._xrInputSource = xrInputSource
        if (xrInputSource.hand) {
            this._hand = new XrHand(this)
        }
    }
}
XrInputSource.EVENT_REMOVE = 'remove'
XrInputSource.EVENT_SELECT = 'select'
XrInputSource.EVENT_SELECTSTART = 'selectstart'
XrInputSource.EVENT_SELECTEND = 'selectend'
XrInputSource.EVENT_SQUEEZE = 'squeeze'
XrInputSource.EVENT_SQUEEZESTART = 'squeezestart'
XrInputSource.EVENT_SQUEEZEEND = 'squeezeend'
XrInputSource.EVENT_HITTESTADD = 'hittest:add'
XrInputSource.EVENT_HITTESTREMOVE = 'hittest:remove'
XrInputSource.EVENT_HITTESTRESULT = 'hittest:result'

class XrInput extends EventHandler {
    _onSessionStart() {
        const session = this.manager.session
        session.addEventListener('inputsourceschange', this._onInputSourcesChangeEvt)
        session.addEventListener('select', (evt) => {
            const inputSource = this._getByInputSource(evt.inputSource)
            inputSource.update(evt.frame)
            inputSource.fire('select', evt)
            this.fire('select', inputSource, evt)
        })
        session.addEventListener('selectstart', (evt) => {
            const inputSource = this._getByInputSource(evt.inputSource)
            inputSource.update(evt.frame)
            inputSource._selecting = true
            inputSource.fire('selectstart', evt)
            this.fire('selectstart', inputSource, evt)
        })
        session.addEventListener('selectend', (evt) => {
            const inputSource = this._getByInputSource(evt.inputSource)
            inputSource.update(evt.frame)
            inputSource._selecting = false
            inputSource.fire('selectend', evt)
            this.fire('selectend', inputSource, evt)
        })
        session.addEventListener('squeeze', (evt) => {
            const inputSource = this._getByInputSource(evt.inputSource)
            inputSource.update(evt.frame)
            inputSource.fire('squeeze', evt)
            this.fire('squeeze', inputSource, evt)
        })
        session.addEventListener('squeezestart', (evt) => {
            const inputSource = this._getByInputSource(evt.inputSource)
            inputSource.update(evt.frame)
            inputSource._squeezing = true
            inputSource.fire('squeezestart', evt)
            this.fire('squeezestart', inputSource, evt)
        })
        session.addEventListener('squeezeend', (evt) => {
            const inputSource = this._getByInputSource(evt.inputSource)
            inputSource.update(evt.frame)
            inputSource._squeezing = false
            inputSource.fire('squeezeend', evt)
            this.fire('squeezeend', inputSource, evt)
        })
        const inputSources = session.inputSources
        for (let i = 0; i < inputSources.length; i++) {
            this._addInputSource(inputSources[i])
        }
    }
    _onSessionEnd() {
        let i = this._inputSources.length
        while (i--) {
            const inputSource = this._inputSources[i]
            this._inputSources.splice(i, 1)
            inputSource.fire('remove')
            this.fire('remove', inputSource)
        }
        const session = this.manager.session
        session.removeEventListener('inputsourceschange', this._onInputSourcesChangeEvt)
    }
    _onInputSourcesChange(evt) {
        for (let i = 0; i < evt.removed.length; i++) {
            this._removeInputSource(evt.removed[i])
        }
        for (let i = 0; i < evt.added.length; i++) {
            this._addInputSource(evt.added[i])
        }
    }
    _getByInputSource(xrInputSource) {
        for (let i = 0; i < this._inputSources.length; i++) {
            if (this._inputSources[i].inputSource === xrInputSource) {
                return this._inputSources[i]
            }
        }
        return null
    }
    _addInputSource(xrInputSource) {
        if (this._getByInputSource(xrInputSource)) {
            return
        }
        const inputSource = new XrInputSource(this.manager, xrInputSource)
        this._inputSources.push(inputSource)
        this.fire('add', inputSource)
    }
    _removeInputSource(xrInputSource) {
        for (let i = 0; i < this._inputSources.length; i++) {
            if (this._inputSources[i].inputSource !== xrInputSource) {
                continue
            }
            const inputSource = this._inputSources[i]
            this._inputSources.splice(i, 1)
            let h = inputSource.hitTestSources.length
            while (h--) {
                inputSource.hitTestSources[h].remove()
            }
            inputSource.fire('remove')
            this.fire('remove', inputSource)
            return
        }
    }
    update(frame) {
        for (let i = 0; i < this._inputSources.length; i++) {
            this._inputSources[i].update(frame)
        }
    }
    get inputSources() {
        return this._inputSources
    }
    constructor(manager) {
        ;(super(), (this._inputSources = []), (this.velocitiesSupported = false))
        this.manager = manager
        this.velocitiesSupported = !!(platform.browser && window.XRPose?.prototype?.hasOwnProperty('linearVelocity'))
        this._onInputSourcesChangeEvt = (evt) => {
            this._onInputSourcesChange(evt)
        }
        this.manager.on('start', this._onSessionStart, this)
        this.manager.on('end', this._onSessionEnd, this)
    }
}
XrInput.EVENT_ADD = 'add'
XrInput.EVENT_REMOVE = 'remove'
XrInput.EVENT_SELECT = 'select'
XrInput.EVENT_SELECTSTART = 'selectstart'
XrInput.EVENT_SELECTEND = 'selectend'
XrInput.EVENT_SQUEEZE = 'squeeze'
XrInput.EVENT_SQUEEZESTART = 'squeezestart'
XrInput.EVENT_SQUEEZEEND = 'squeezeend'

const vec3A = new Vec3()
const vec3B = new Vec3()
const mat4A = new Mat4()
const mat4B = new Mat4()
class XrLightEstimation extends EventHandler {
    _onSessionStart() {
        const supported = !!this._manager.session.requestLightProbe
        if (!supported) return
        this._supported = true
    }
    _onSessionEnd() {
        this._supported = false
        this._available = false
        this._lightProbeRequested = false
        this._lightProbe = null
    }
    start() {
        let err
        if (!this._manager.session) {
            err = new Error('XR session is not running')
        }
        if (!err && this._manager.type !== XRTYPE_AR) {
            err = new Error('XR session type is not AR')
        }
        if (!err && !this._supported) {
            err = new Error('light-estimation is not supported')
        }
        if ((!err && this._lightProbe) || this._lightProbeRequested) {
            err = new Error('light estimation is already requested')
        }
        if (err) {
            this.fire('error', err)
            return
        }
        this._lightProbeRequested = true
        this._manager.session
            .requestLightProbe()
            .then((lightProbe) => {
                const wasRequested = this._lightProbeRequested
                this._lightProbeRequested = false
                if (this._manager.active) {
                    if (wasRequested) {
                        this._lightProbe = lightProbe
                    }
                } else {
                    this.fire('error', new Error('XR session is not active'))
                }
            })
            .catch((ex) => {
                this._lightProbeRequested = false
                this.fire('error', ex)
            })
    }
    end() {
        this._lightProbeRequested = false
        this._lightProbe = null
        this._available = false
    }
    update(frame) {
        if (!this._lightProbe) return
        const lightEstimate = frame.getLightEstimate(this._lightProbe)
        if (!lightEstimate) return
        if (!this._available) {
            this._available = true
            this.fire('available')
        }
        const pli = lightEstimate.primaryLightIntensity
        this._intensity = Math.max(1.0, Math.max(pli.x, Math.max(pli.y, pli.z)))
        vec3A.copy(pli).mulScalar(1 / this._intensity)
        this._color.set(vec3A.x, vec3A.y, vec3A.z)
        vec3A.set(0, 0, 0)
        vec3B.copy(lightEstimate.primaryLightDirection)
        mat4A.setLookAt(vec3B, vec3A, Vec3.UP)
        mat4B.setFromAxisAngle(Vec3.RIGHT, 90)
        mat4A.mul(mat4B)
        this._rotation.setFromMat4(mat4A)
        this._sphericalHarmonics.set(lightEstimate.sphericalHarmonicsCoefficients)
    }
    get supported() {
        return this._supported
    }
    get available() {
        return this._available
    }
    get intensity() {
        return this._available ? this._intensity : null
    }
    get color() {
        return this._available ? this._color : null
    }
    get rotation() {
        return this._available ? this._rotation : null
    }
    get sphericalHarmonics() {
        return this._available ? this._sphericalHarmonics : null
    }
    constructor(manager) {
        ;(super(),
            (this._supported = false),
            (this._available = false),
            (this._lightProbeRequested = false),
            (this._lightProbe = null),
            (this._intensity = 0),
            (this._rotation = new Quat()),
            (this._color = new Color()),
            (this._sphericalHarmonics = new Float32Array(27)))
        this._manager = manager
        this._manager.on('start', this._onSessionStart, this)
        this._manager.on('end', this._onSessionEnd, this)
    }
}
XrLightEstimation.EVENT_AVAILABLE = 'available'
XrLightEstimation.EVENT_ERROR = 'error'

let ids = 0
class XrPlane extends EventHandler {
    destroy() {
        if (!this._xrPlane) return
        this._xrPlane = null
        this.fire('remove')
    }
    update(frame) {
        const manager = this._planeDetection._manager
        const pose = frame.getPose(this._xrPlane.planeSpace, manager._referenceSpace)
        if (pose) {
            this._position.copy(pose.transform.position)
            this._rotation.copy(pose.transform.orientation)
        }
        if (this._lastChangedTime !== this._xrPlane.lastChangedTime) {
            this._lastChangedTime = this._xrPlane.lastChangedTime
            this.fire('change')
        }
    }
    getPosition() {
        return this._position
    }
    getRotation() {
        return this._rotation
    }
    get id() {
        return this._id
    }
    get orientation() {
        return this._orientation
    }
    get points() {
        return this._xrPlane.polygon
    }
    get label() {
        return this._xrPlane.semanticLabel || ''
    }
    constructor(planeDetection, xrPlane) {
        ;(super(), (this._position = new Vec3()), (this._rotation = new Quat()))
        this._id = ++ids
        this._planeDetection = planeDetection
        this._xrPlane = xrPlane
        this._lastChangedTime = xrPlane.lastChangedTime
        this._orientation = xrPlane.orientation
    }
}
XrPlane.EVENT_REMOVE = 'remove'
XrPlane.EVENT_CHANGE = 'change'

class XrPlaneDetection extends EventHandler {
    _onSessionStart() {
        if (this._manager.session.enabledFeatures) {
            const available = this._manager.session.enabledFeatures.indexOf('plane-detection') !== -1
            if (available) {
                this._available = true
                this.fire('available')
            }
        }
    }
    _onSessionEnd() {
        for (let i = 0; i < this._planes.length; i++) {
            this._planes[i].destroy()
            this.fire('remove', this._planes[i])
        }
        this._planesIndex.clear()
        this._planes.length = 0
        if (this._available) {
            this._available = false
            this.fire('unavailable')
        }
    }
    update(frame) {
        if (!this._available) {
            if (!this._manager.session.enabledFeatures && frame.detectedPlanes.size) {
                this._available = true
                this.fire('available')
            } else {
                return
            }
        }
        const detectedPlanes = frame.detectedPlanes
        for (const [xrPlane, plane] of this._planesIndex) {
            if (detectedPlanes.has(xrPlane)) {
                continue
            }
            this._planesIndex.delete(xrPlane)
            this._planes.splice(this._planes.indexOf(plane), 1)
            plane.destroy()
            this.fire('remove', plane)
        }
        for (const xrPlane of detectedPlanes) {
            let plane = this._planesIndex.get(xrPlane)
            if (!plane) {
                plane = new XrPlane(this, xrPlane)
                this._planesIndex.set(xrPlane, plane)
                this._planes.push(plane)
                plane.update(frame)
                this.fire('add', plane)
            } else {
                plane.update(frame)
            }
        }
    }
    get supported() {
        return this._supported
    }
    get available() {
        return this._available
    }
    get planes() {
        return this._planes
    }
    constructor(manager) {
        ;(super(),
            (this._supported = platform.browser && !!window.XRPlane),
            (this._available = false),
            (this._planesIndex = new Map()),
            (this._planes = []))
        this._manager = manager
        if (this._supported) {
            this._manager.on('start', this._onSessionStart, this)
            this._manager.on('end', this._onSessionEnd, this)
        }
    }
}
XrPlaneDetection.EVENT_AVAILABLE = 'available'
XrPlaneDetection.EVENT_UNAVAILABLE = 'unavailable'
XrPlaneDetection.EVENT_ADD = 'add'
XrPlaneDetection.EVENT_REMOVE = 'remove'

class XrAnchor extends EventHandler {
    destroy() {
        if (!this._xrAnchor) return
        const xrAnchor = this._xrAnchor
        this._xrAnchor.delete()
        this._xrAnchor = null
        this.fire('destroy', xrAnchor, this)
    }
    update(frame) {
        if (!this._xrAnchor) {
            return
        }
        const pose = frame.getPose(this._xrAnchor.anchorSpace, this._anchors.manager._referenceSpace)
        if (pose) {
            if (this._position.equals(pose.transform.position) && this._rotation.equals(pose.transform.orientation)) {
                return
            }
            this._position.copy(pose.transform.position)
            this._rotation.copy(pose.transform.orientation)
            this.fire('change')
        }
    }
    getPosition() {
        return this._position
    }
    getRotation() {
        return this._rotation
    }
    persist(callback) {
        if (!this._anchors.persistence) {
            callback?.(new Error('Persistent Anchors are not supported'), null)
            return
        }
        if (this._uuid) {
            callback?.(null, this._uuid)
            return
        }
        if (this._uuidRequests) {
            if (callback) this._uuidRequests.push(callback)
            return
        }
        this._uuidRequests = []
        this._xrAnchor
            .requestPersistentHandle()
            .then((uuid) => {
                this._uuid = uuid
                this._anchors._indexByUuid.set(this._uuid, this)
                callback?.(null, uuid)
                for (const uuidRequest of this._uuidRequests) {
                    uuidRequest(null, uuid)
                }
                this._uuidRequests = null
                this.fire('persist', uuid)
            })
            .catch((ex) => {
                callback?.(ex, null)
                for (const uuidRequest of this._uuidRequests) {
                    uuidRequest(ex, null)
                }
                this._uuidRequests = null
            })
    }
    forget(callback) {
        if (!this._uuid) {
            callback?.(new Error('Anchor is not persistent'))
            return
        }
        this._anchors.forget(this._uuid, (ex) => {
            this._uuid = null
            callback?.(ex)
            this.fire('forget')
        })
    }
    get uuid() {
        return this._uuid
    }
    get persistent() {
        return !!this._uuid
    }
    constructor(anchors, xrAnchor, uuid = null) {
        ;(super(),
            (this._position = new Vec3()),
            (this._rotation = new Quat()),
            (this._uuid = null),
            (this._uuidRequests = null))
        this._anchors = anchors
        this._xrAnchor = xrAnchor
        this._uuid = uuid
    }
}
XrAnchor.EVENT_DESTROY = 'destroy'
XrAnchor.EVENT_CHANGE = 'change'
XrAnchor.EVENT_PERSIST = 'persist'
XrAnchor.EVENT_FORGET = 'forget'

class XrAnchors extends EventHandler {
    _onSessionStart() {
        const available = this.manager.session.enabledFeatures?.indexOf('anchors') >= 0
        if (!available) return
        this._available = available
        this.fire('available')
    }
    _onSessionEnd() {
        if (!this._available) return
        this._available = false
        for (let i = 0; i < this._creationQueue.length; i++) {
            if (!this._creationQueue[i].callback) {
                continue
            }
            this._creationQueue[i].callback(new Error('session ended'), null)
        }
        this._creationQueue.length = 0
        this._index.clear()
        this._indexByUuid.clear()
        let i = this._list.length
        while (i--) {
            this._list[i].destroy()
        }
        this._list.length = 0
        this.fire('unavailable')
    }
    _createAnchor(xrAnchor, uuid = null) {
        const anchor = new XrAnchor(this, xrAnchor, uuid)
        this._index.set(xrAnchor, anchor)
        if (uuid) this._indexByUuid.set(uuid, anchor)
        this._list.push(anchor)
        anchor.once('destroy', this._onAnchorDestroy, this)
        return anchor
    }
    _onAnchorDestroy(xrAnchor, anchor) {
        this._index.delete(xrAnchor)
        if (anchor.uuid) this._indexByUuid.delete(anchor.uuid)
        const ind = this._list.indexOf(anchor)
        if (ind !== -1) this._list.splice(ind, 1)
        this.fire('destroy', anchor)
    }
    create(position, rotation, callback) {
        if (!this._available) {
            callback?.(new Error('Anchors API is not available'), null)
            return
        }
        if (window.XRHitTestResult && position instanceof XRHitTestResult) {
            const hitResult = position
            callback = rotation
            if (!this._supported) {
                callback?.(new Error('Anchors API is not supported'), null)
                return
            }
            if (!hitResult.createAnchor) {
                callback?.(new Error('Creating Anchor from Hit Test is not supported'), null)
                return
            }
            hitResult
                .createAnchor()
                .then((xrAnchor) => {
                    const anchor = this._createAnchor(xrAnchor)
                    callback?.(null, anchor)
                    this.fire('add', anchor)
                })
                .catch((ex) => {
                    callback?.(ex, null)
                    this.fire('error', ex)
                })
        } else {
            this._creationQueue.push({
                transform: new XRRigidTransform(position, rotation),
                callback: callback,
            })
        }
    }
    restore(uuid, callback) {
        if (!this._available) {
            callback?.(new Error('Anchors API is not available'), null)
            return
        }
        if (!this._persistence) {
            callback?.(new Error('Anchor Persistence is not supported'), null)
            return
        }
        if (!this.manager.active) {
            callback?.(new Error('WebXR session is not active'), null)
            return
        }
        this.manager.session
            .restorePersistentAnchor(uuid)
            .then((xrAnchor) => {
                const anchor = this._createAnchor(xrAnchor, uuid)
                callback?.(null, anchor)
                this.fire('add', anchor)
            })
            .catch((ex) => {
                callback?.(ex, null)
                this.fire('error', ex)
            })
    }
    forget(uuid, callback) {
        if (!this._available) {
            callback?.(new Error('Anchors API is not available'))
            return
        }
        if (!this._persistence) {
            callback?.(new Error('Anchor Persistence is not supported'))
            return
        }
        if (!this.manager.active) {
            callback?.(new Error('WebXR session is not active'))
            return
        }
        this.manager.session
            .deletePersistentAnchor(uuid)
            .then(() => {
                callback?.(null)
            })
            .catch((ex) => {
                callback?.(ex)
                this.fire('error', ex)
            })
    }
    update(frame) {
        if (!this._available) {
            if (!this.manager.session.enabledFeatures && !this._checkingAvailability) {
                this._checkingAvailability = true
                frame
                    .createAnchor(new XRRigidTransform(), this.manager._referenceSpace)
                    .then((xrAnchor) => {
                        xrAnchor.delete()
                        if (this.manager.active) {
                            this._available = true
                            this.fire('available')
                        }
                    })
                    .catch(() => {})
            }
            return
        }
        if (this._creationQueue.length) {
            for (let i = 0; i < this._creationQueue.length; i++) {
                const request = this._creationQueue[i]
                frame
                    .createAnchor(request.transform, this.manager._referenceSpace)
                    .then((xrAnchor) => {
                        if (request.callback) {
                            this._callbacksAnchors.set(xrAnchor, request.callback)
                        }
                    })
                    .catch((ex) => {
                        if (request.callback) {
                            request.callback(ex, null)
                        }
                        this.fire('error', ex)
                    })
            }
            this._creationQueue.length = 0
        }
        for (const [xrAnchor, anchor] of this._index) {
            if (frame.trackedAnchors.has(xrAnchor)) {
                continue
            }
            this._index.delete(xrAnchor)
            anchor.destroy()
        }
        for (let i = 0; i < this._list.length; i++) {
            this._list[i].update(frame)
        }
        for (const xrAnchor of frame.trackedAnchors) {
            if (this._index.has(xrAnchor)) {
                continue
            }
            try {
                const tmp = xrAnchor.anchorSpace
            } catch (ex) {
                continue
            }
            const anchor = this._createAnchor(xrAnchor)
            anchor.update(frame)
            const callback = this._callbacksAnchors.get(xrAnchor)
            if (callback) {
                this._callbacksAnchors.delete(xrAnchor)
                callback(null, anchor)
            }
            this.fire('add', anchor)
        }
    }
    get supported() {
        return this._supported
    }
    get available() {
        return this._available
    }
    get persistence() {
        return this._persistence
    }
    get uuids() {
        if (!this._available) {
            return null
        }
        if (!this._persistence) {
            return null
        }
        if (!this.manager.active) {
            return null
        }
        return this.manager.session.persistentAnchors
    }
    get list() {
        return this._list
    }
    constructor(manager) {
        ;(super(),
            (this._supported = platform.browser && !!window.XRAnchor),
            (this._available = false),
            (this._checkingAvailability = false),
            (this._persistence = platform.browser && !!window?.XRSession?.prototype.restorePersistentAnchor),
            (this._creationQueue = []),
            (this._index = new Map()),
            (this._indexByUuid = new Map()),
            (this._list = []),
            (this._callbacksAnchors = new Map()))
        this.manager = manager
        if (this._supported) {
            this.manager.on('start', this._onSessionStart, this)
            this.manager.on('end', this._onSessionEnd, this)
        }
    }
}
XrAnchors.EVENT_AVAILABLE = 'available'
XrAnchors.EVENT_UNAVAILABLE = 'unavailable'
XrAnchors.EVENT_ERROR = 'error'
XrAnchors.EVENT_ADD = 'add'
XrAnchors.EVENT_DESTROY = 'destroy'

class XrMesh extends EventHandler {
    get xrMesh() {
        return this._xrMesh
    }
    get label() {
        return this._xrMesh.semanticLabel || ''
    }
    get vertices() {
        return this._xrMesh.vertices
    }
    get indices() {
        return this._xrMesh.indices
    }
    destroy() {
        if (!this._xrMesh) return
        this._xrMesh = null
        this.fire('remove')
    }
    update(frame) {
        const manager = this._meshDetection._manager
        const pose = frame.getPose(this._xrMesh.meshSpace, manager._referenceSpace)
        if (pose) {
            this._position.copy(pose.transform.position)
            this._rotation.copy(pose.transform.orientation)
        }
        if (this._lastChanged !== this._xrMesh.lastChangedTime) {
            this._lastChanged = this._xrMesh.lastChangedTime
            this.fire('change')
        }
    }
    getPosition() {
        return this._position
    }
    getRotation() {
        return this._rotation
    }
    constructor(meshDetection, xrMesh) {
        ;(super(), (this._lastChanged = 0), (this._position = new Vec3()), (this._rotation = new Quat()))
        this._meshDetection = meshDetection
        this._xrMesh = xrMesh
        this._lastChanged = this._xrMesh.lastChangedTime
    }
}
XrMesh.EVENT_REMOVE = 'remove'
XrMesh.EVENT_CHANGE = 'change'

class XrMeshDetection extends EventHandler {
    update(frame) {
        if (!this._available) {
            if (!this._manager.session.enabledFeatures && frame.detectedMeshes.size) {
                this._available = true
                this.fire('available')
            } else {
                return
            }
        }
        for (const xrMesh of frame.detectedMeshes) {
            let mesh = this._index.get(xrMesh)
            if (!mesh) {
                mesh = new XrMesh(this, xrMesh)
                this._index.set(xrMesh, mesh)
                this._list.push(mesh)
                mesh.update(frame)
                this.fire('add', mesh)
            } else {
                mesh.update(frame)
            }
        }
        for (const mesh of this._index.values()) {
            if (frame.detectedMeshes.has(mesh.xrMesh)) {
                continue
            }
            this._removeMesh(mesh)
        }
    }
    _removeMesh(mesh) {
        this._index.delete(mesh.xrMesh)
        this._list.splice(this._list.indexOf(mesh), 1)
        mesh.destroy()
        this.fire('remove', mesh)
    }
    _onSessionStart() {
        if (this._manager.session.enabledFeatures) {
            const available = this._manager.session.enabledFeatures.indexOf('mesh-detection') !== -1
            if (!available) return
            this._available = available
            this.fire('available')
        }
    }
    _onSessionEnd() {
        if (!this._available) return
        this._available = false
        for (const mesh of this._index.values()) {
            this._removeMesh(mesh)
        }
        this.fire('unavailable')
    }
    get supported() {
        return this._supported
    }
    get available() {
        return this._available
    }
    get meshes() {
        return this._list
    }
    constructor(manager) {
        ;(super(),
            (this._supported = platform.browser && !!window.XRMesh),
            (this._available = false),
            (this._index = new Map()),
            (this._list = []))
        this._manager = manager
        if (this._supported) {
            this._manager.on('start', this._onSessionStart, this)
            this._manager.on('end', this._onSessionEnd, this)
        }
    }
}
XrMeshDetection.EVENT_AVAILABLE = 'available'
XrMeshDetection.EVENT_UNAVAILABLE = 'unavailable'
XrMeshDetection.EVENT_ADD = 'add'
XrMeshDetection.EVENT_REMOVE = 'remove'

class XrView extends EventHandler {
    get textureColor() {
        return this._textureColor
    }
    get textureDepth() {
        return this._textureDepth
    }
    get depthUvMatrix() {
        return this._depthMatrix
    }
    get depthValueToMeters() {
        return this._depthInfo?.rawValueToMeters || 0
    }
    get eye() {
        return this._xrView.eye
    }
    get viewport() {
        return this._viewport
    }
    get projMat() {
        return this._projMat
    }
    get projViewOffMat() {
        return this._projViewOffMat
    }
    get viewOffMat() {
        return this._viewOffMat
    }
    get viewInvOffMat() {
        return this._viewInvOffMat
    }
    get viewMat3() {
        return this._viewMat3
    }
    get positionData() {
        return this._positionData
    }
    update(frame, xrView) {
        this._xrView = xrView
        if (this._manager.views.availableColor) {
            this._xrCamera = this._xrView.camera
        }
        const layer = frame.session.renderState.baseLayer
        const viewport = layer.getViewport(this._xrView)
        this._viewport.x = viewport.x
        this._viewport.y = viewport.y
        this._viewport.z = viewport.width
        this._viewport.w = viewport.height
        this._projMat.set(this._xrView.projectionMatrix)
        this._viewMat.set(this._xrView.transform.inverse.matrix)
        this._viewInvMat.set(this._xrView.transform.matrix)
        this._updateTextureColor()
        this._updateDepth(frame)
    }
    _updateTextureColor() {
        if (!this._manager.views.availableColor || !this._xrCamera || !this._textureColor) {
            return
        }
        const binding = this._manager.webglBinding
        if (!binding) {
            return
        }
        const texture = binding.getCameraImage(this._xrCamera)
        if (!texture) {
            return
        }
        const device = this._manager.app.graphicsDevice
        const gl = device.gl
        if (!this._frameBufferSource) {
            this._frameBufferSource = gl.createFramebuffer()
            this._frameBuffer = gl.createFramebuffer()
        } else {
            const attachmentBaseConstant = gl.COLOR_ATTACHMENT0
            const width = this._xrCamera.width
            const height = this._xrCamera.height
            device.setFramebuffer(this._frameBufferSource)
            gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentBaseConstant, gl.TEXTURE_2D, texture, 0)
            device.setFramebuffer(this._frameBuffer)
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                attachmentBaseConstant,
                gl.TEXTURE_2D,
                this._textureColor.impl._glTexture,
                0,
            )
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this._frameBufferSource)
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this._frameBuffer)
            gl.blitFramebuffer(0, height, width, 0, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
        }
    }
    _updateDepth(frame) {
        if (!this._manager.views.availableDepth || !this._textureDepth) {
            return
        }
        const gpu = this._manager.views.depthGpuOptimized
        const infoSource = gpu ? this._manager.webglBinding : frame
        if (!infoSource) {
            this._depthInfo = null
            return
        }
        const depthInfo = infoSource.getDepthInformation(this._xrView)
        if (!depthInfo) {
            this._depthInfo = null
            return
        }
        let matrixDirty = !this._depthInfo !== !depthInfo
        this._depthInfo = depthInfo
        const width = this._depthInfo?.width || 4
        const height = this._depthInfo?.height || 4
        let resized = false
        if (this._textureDepth.width !== width || this._textureDepth.height !== height) {
            this._textureDepth._width = width
            this._textureDepth._height = height
            matrixDirty = true
            resized = true
        }
        if (matrixDirty) {
            if (this._depthInfo) {
                this._depthMatrix.data.set(this._depthInfo.normDepthBufferFromNormView.matrix)
            } else {
                this._depthMatrix.setIdentity()
            }
        }
        if (this._depthInfo) {
            if (gpu) {
                if (this._depthInfo.texture) {
                    const gl = this._manager.app.graphicsDevice.gl
                    this._textureDepth.impl._glTexture = this._depthInfo.texture
                    if (this._depthInfo.textureType === 'texture-array') {
                        this._textureDepth.impl._glTarget = gl.TEXTURE_2D_ARRAY
                    } else {
                        this._textureDepth.impl._glTarget = gl.TEXTURE_2D
                    }
                    switch (this._manager.views.depthPixelFormat) {
                        case PIXELFORMAT_R32F:
                            this._textureDepth.impl._glInternalFormat = gl.R32F
                            this._textureDepth.impl._glPixelType = gl.FLOAT
                            this._textureDepth.impl._glFormat = gl.RED
                            break
                        case PIXELFORMAT_DEPTH:
                            this._textureDepth.impl._glInternalFormat = gl.DEPTH_COMPONENT16
                            this._textureDepth.impl._glPixelType = gl.UNSIGNED_SHORT
                            this._textureDepth.impl._glFormat = gl.DEPTH_COMPONENT
                            break
                    }
                    this._textureDepth.impl._glCreated = true
                }
            } else {
                this._textureDepth._levels[0] = new Uint8Array(this._depthInfo.data)
                this._textureDepth.upload()
            }
        } else {
            this._textureDepth._levels[0] = this._emptyDepthBuffer
            this._textureDepth.upload()
        }
        if (resized) this.fire('depth:resize', width, height)
    }
    updateTransforms(transform) {
        if (transform) {
            this._viewInvOffMat.mul2(transform, this._viewInvMat)
            this.viewOffMat.copy(this._viewInvOffMat).invert()
        } else {
            this._viewInvOffMat.copy(this._viewInvMat)
            this.viewOffMat.copy(this._viewMat)
        }
        this._viewMat3.setFromMat4(this._viewOffMat)
        this._projViewOffMat.mul2(this._projMat, this._viewOffMat)
        this._positionData[0] = this._viewInvOffMat.data[12]
        this._positionData[1] = this._viewInvOffMat.data[13]
        this._positionData[2] = this._viewInvOffMat.data[14]
    }
    _onDeviceLost() {
        this._frameBufferSource = null
        this._frameBuffer = null
        this._depthInfo = null
    }
    getDepth(u, v) {
        if (this._manager.views.depthGpuOptimized) {
            return null
        }
        return this._depthInfo?.getDepthInMeters(u, v) ?? null
    }
    destroy() {
        this._depthInfo = null
        if (this._textureColor) {
            this._textureColor.destroy()
            this._textureColor = null
        }
        if (this._textureDepth) {
            this._textureDepth.destroy()
            this._textureDepth = null
        }
        if (this._frameBufferSource) {
            const gl = this._manager.app.graphicsDevice.gl
            gl.deleteFramebuffer(this._frameBufferSource)
            this._frameBufferSource = null
            gl.deleteFramebuffer(this._frameBuffer)
            this._frameBuffer = null
        }
    }
    constructor(manager, xrView, viewsCount) {
        ;(super(),
            (this._positionData = new Float32Array(3)),
            (this._viewport = new Vec4()),
            (this._projMat = new Mat4()),
            (this._projViewOffMat = new Mat4()),
            (this._viewMat = new Mat4()),
            (this._viewOffMat = new Mat4()),
            (this._viewMat3 = new Mat3()),
            (this._viewInvMat = new Mat4()),
            (this._viewInvOffMat = new Mat4()),
            (this._xrCamera = null),
            (this._textureColor = null),
            (this._textureDepth = null),
            (this._depthInfo = null),
            (this._emptyDepthBuffer = new Uint8Array(32)),
            (this._depthMatrix = new Mat4()))
        this._manager = manager
        this._xrView = xrView
        const device = this._manager.app.graphicsDevice
        if (this._manager.views.supportedColor) {
            this._xrCamera = this._xrView.camera
            if (this._manager.views.availableColor && this._xrCamera) {
                this._textureColor = new Texture(device, {
                    format: PIXELFORMAT_RGB8,
                    mipmaps: false,
                    addressU: ADDRESS_CLAMP_TO_EDGE,
                    addressV: ADDRESS_CLAMP_TO_EDGE,
                    minFilter: FILTER_LINEAR,
                    magFilter: FILTER_LINEAR,
                    width: this._xrCamera.width,
                    height: this._xrCamera.height,
                    name: `XrView-${this._xrView.eye}-Color`,
                })
            }
        }
        if (this._manager.views.supportedDepth && this._manager.views.availableDepth) {
            const filtering = this._manager.views.depthGpuOptimized ? FILTER_NEAREST : FILTER_LINEAR
            this._textureDepth = new Texture(device, {
                format: this._manager.views.depthPixelFormat,
                arrayLength: viewsCount === 1 ? 0 : viewsCount,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
                minFilter: filtering,
                magFilter: filtering,
                width: 4,
                height: 4,
                name: `XrView-${this._xrView.eye}-Depth`,
            })
            for (let i = 0; i < this._textureDepth._levels.length; i++) {
                this._textureDepth._levels[i] = this._emptyDepthBuffer
            }
            this._textureDepth.upload()
        }
        if (this._textureColor || this._textureDepth) {
            device.on('devicelost', this._onDeviceLost, this)
        }
    }
}
XrView.EVENT_DEPTHRESIZE = 'depth:resize'

class XrViews extends EventHandler {
    get list() {
        return this._list
    }
    get supportedColor() {
        return this._supportedColor
    }
    get supportedDepth() {
        return this._supportedDepth
    }
    get availableColor() {
        return this._availableColor
    }
    get availableDepth() {
        return this._availableDepth
    }
    get depthUsage() {
        return this._depthUsage
    }
    get depthGpuOptimized() {
        return this._depthUsage === XRDEPTHSENSINGUSAGE_GPU
    }
    get depthFormat() {
        return this._depthFormat
    }
    get depthPixelFormat() {
        return this._depthFormats[this._depthFormat] ?? null
    }
    update(frame, xrViews) {
        for (let i = 0; i < xrViews.length; i++) {
            this._indexTmp.set(xrViews[i].eye, xrViews[i])
        }
        for (const [eye, xrView] of this._indexTmp) {
            let view = this._index.get(eye)
            if (!view) {
                view = new XrView(this._manager, xrView, xrViews.length)
                this._index.set(eye, view)
                this._list.push(view)
                view.update(frame, xrView)
                this.fire('add', view)
            } else {
                view.update(frame, xrView)
            }
        }
        for (const [eye, view] of this._index) {
            if (this._indexTmp.has(eye)) {
                continue
            }
            view.destroy()
            this._index.delete(eye)
            const ind = this._list.indexOf(view)
            if (ind !== -1) this._list.splice(ind, 1)
            this.fire('remove', view)
        }
        this._indexTmp.clear()
    }
    get(eye) {
        return this._index.get(eye) || null
    }
    _onSessionStart() {
        if (this._manager.type !== XRTYPE_AR) {
            return
        }
        if (!this._manager.session.enabledFeatures) {
            return
        }
        this._availableColor = this._manager.session.enabledFeatures.indexOf('camera-access') !== -1
        this._availableDepth = this._manager.session.enabledFeatures.indexOf('depth-sensing') !== -1
        if (this._availableDepth) {
            const session = this._manager.session
            this._depthUsage = session.depthUsage
            this._depthFormat = session.depthDataFormat
        }
    }
    _onSessionEnd() {
        for (const view of this._index.values()) {
            view.destroy()
        }
        this._index.clear()
        this._availableColor = false
        this._availableDepth = false
        this._depthUsage = ''
        this._depthFormat = ''
        this._list.length = 0
    }
    constructor(manager) {
        ;(super(),
            (this._index = new Map()),
            (this._indexTmp = new Map()),
            (this._list = []),
            (this._supportedColor = platform.browser && !!window.XRCamera && !!window.XRWebGLBinding),
            (this._supportedDepth = platform.browser && !!window.XRDepthInformation),
            (this._availableColor = false),
            (this._availableDepth = false),
            (this._depthUsage = ''),
            (this._depthFormat = ''),
            (this._depthFormats = {
                [XRDEPTHSENSINGFORMAT_L8A8]: PIXELFORMAT_LA8,
                [XRDEPTHSENSINGFORMAT_R16U]: PIXELFORMAT_DEPTH,
                [XRDEPTHSENSINGFORMAT_F32]: PIXELFORMAT_R32F,
            }))
        this._manager = manager
        this._manager.on('start', this._onSessionStart, this)
        this._manager.on('end', this._onSessionEnd, this)
    }
}
XrViews.EVENT_ADD = 'add'
XrViews.EVENT_REMOVE = 'remove'

class XrManager extends EventHandler {
    destroy() {}
    start(camera, type, spaceType, options) {
        let callback = options
        if (typeof options === 'object') {
            callback = options.callback
        }
        if (!this._available[type]) {
            if (callback) callback(new Error('XR is not available'))
            return
        }
        if (this._session) {
            if (callback) callback(new Error('XR session is already started'))
            return
        }
        this._camera = camera
        this._camera.camera.xr = this
        this._type = type
        this._spaceType = spaceType
        this._framebufferScaleFactor = options?.framebufferScaleFactor ?? 1.0
        this._setClipPlanes(camera.nearClip, camera.farClip)
        const opts = {
            requiredFeatures: [spaceType],
            optionalFeatures: [],
        }
        const device = this.app.graphicsDevice
        if (device?.isWebGPU) {
            opts.requiredFeatures.push('webgpu')
        }
        const webgl = device?.isWebGL2
        if (type === XRTYPE_AR) {
            opts.optionalFeatures.push('light-estimation')
            opts.optionalFeatures.push('hit-test')
            if (options) {
                if (options.imageTracking && this.imageTracking.supported) {
                    opts.optionalFeatures.push('image-tracking')
                }
                if (options.planeDetection) {
                    opts.optionalFeatures.push('plane-detection')
                }
                if (options.meshDetection) {
                    opts.optionalFeatures.push('mesh-detection')
                }
            }
            if (this.domOverlay.supported && this.domOverlay.root) {
                opts.optionalFeatures.push('dom-overlay')
                opts.domOverlay = {
                    root: this.domOverlay.root,
                }
            }
            if (options && options.anchors && this.anchors.supported) {
                opts.optionalFeatures.push('anchors')
            }
            if (options && options.depthSensing && this.views.supportedDepth) {
                opts.optionalFeatures.push('depth-sensing')
                const usagePreference = []
                const dataFormatPreference = []
                usagePreference.push(XRDEPTHSENSINGUSAGE_GPU, XRDEPTHSENSINGUSAGE_CPU)
                dataFormatPreference.push(
                    XRDEPTHSENSINGFORMAT_F32,
                    XRDEPTHSENSINGFORMAT_L8A8,
                    XRDEPTHSENSINGFORMAT_R16U,
                )
                if (options.depthSensing.usagePreference) {
                    const ind = usagePreference.indexOf(options.depthSensing.usagePreference)
                    if (ind !== -1) usagePreference.splice(ind, 1)
                    usagePreference.unshift(options.depthSensing.usagePreference)
                }
                if (options.depthSensing.dataFormatPreference) {
                    const ind = dataFormatPreference.indexOf(options.depthSensing.dataFormatPreference)
                    if (ind !== -1) dataFormatPreference.splice(ind, 1)
                    dataFormatPreference.unshift(options.depthSensing.dataFormatPreference)
                }
                opts.depthSensing = {
                    usagePreference: usagePreference,
                    dataFormatPreference: dataFormatPreference,
                }
            }
            if (webgl && options && options.cameraColor && this.views.supportedColor) {
                opts.optionalFeatures.push('camera-access')
            }
        }
        opts.optionalFeatures.push('hand-tracking')
        if (options && options.optionalFeatures) {
            opts.optionalFeatures = opts.optionalFeatures.concat(options.optionalFeatures)
        }
        if (this.imageTracking.supported && this.imageTracking.images.length) {
            this.imageTracking.prepareImages((err, trackedImages) => {
                if (err) {
                    if (callback) callback(err)
                    this.fire('error', err)
                    return
                }
                if (trackedImages !== null) {
                    opts.trackedImages = trackedImages
                }
                this._onStartOptionsReady(type, spaceType, opts, callback)
            })
        } else {
            this._onStartOptionsReady(type, spaceType, opts, callback)
        }
    }
    _onStartOptionsReady(type, spaceType, options, callback) {
        navigator.xr
            .requestSession(type, options)
            .then((session) => {
                this._onSessionStart(session, spaceType, callback)
            })
            .catch((ex) => {
                this._camera.camera.xr = null
                this._camera = null
                this._type = null
                this._spaceType = null
                if (callback) callback(ex)
                this.fire('error', ex)
            })
    }
    end(callback) {
        if (!this._session) {
            if (callback) callback(new Error('XR Session is not initialized'))
            return
        }
        this.webglBinding = null
        if (callback) this.once('end', callback)
        this._session.end()
    }
    isAvailable(type) {
        return this._available[type]
    }
    _deviceAvailabilityCheck() {
        for (const key in this._available) {
            this._sessionSupportCheck(key)
        }
    }
    initiateRoomCapture(callback) {
        if (!this._session) {
            callback(new Error('Session is not active'))
            return
        }
        if (!this._session.initiateRoomCapture) {
            callback(new Error('Session does not support manual room capture'))
            return
        }
        this._session
            .initiateRoomCapture()
            .then(() => {
                if (callback) callback(null)
            })
            .catch((err) => {
                if (callback) callback(err)
            })
    }
    updateTargetFrameRate(frameRate, callback) {
        if (!this._session?.updateTargetFrameRate) {
            callback?.(new Error('unable to update frameRate'))
            return
        }
        this._session
            .updateTargetFrameRate(frameRate)
            .then(() => {
                callback?.()
            })
            .catch((err) => {
                callback?.(err)
            })
    }
    _sessionSupportCheck(type) {
        navigator.xr
            .isSessionSupported(type)
            .then((available) => {
                if (this._available[type] === available) {
                    return
                }
                this._available[type] = available
                this.fire('available', type, available)
                this.fire(`available:${type}`, available)
            })
            .catch((ex) => {
                this.fire('error', ex)
            })
    }
    _onSessionStart(session, spaceType, callback) {
        let failed = false
        this._session = session
        const onVisibilityChange = () => {
            this.fire('visibility:change', session.visibilityState)
        }
        const onClipPlanesChange = () => {
            this._setClipPlanes(this._camera.nearClip, this._camera.farClip)
        }
        const onFrameRateChange = () => {
            this.fire('frameratechange', this._session?.frameRate)
        }
        const onEnd = () => {
            if (this._camera) {
                this._camera.off('set_nearClip', onClipPlanesChange)
                this._camera.off('set_farClip', onClipPlanesChange)
                this._camera.camera.xr = null
                this._camera = null
            }
            session.removeEventListener('end', onEnd)
            session.removeEventListener('visibilitychange', onVisibilityChange)
            session.removeEventListener('frameratechange', onFrameRateChange)
            if (!failed) this.fire('end')
            this._session = null
            this._referenceSpace = null
            this._width = 0
            this._height = 0
            this._type = null
            this._spaceType = null
            if (this.app.systems) {
                this.app.requestAnimationFrame()
            }
        }
        session.addEventListener('end', onEnd)
        session.addEventListener('visibilitychange', onVisibilityChange)
        this._camera.on('set_nearClip', onClipPlanesChange)
        this._camera.on('set_farClip', onClipPlanesChange)
        this._createBaseLayer()
        if (this.session.supportedFrameRates) {
            this._supportedFrameRates = Array.from(this.session.supportedFrameRates)
        } else {
            this._supportedFrameRates = null
        }
        this._session.addEventListener('frameratechange', onFrameRateChange)
        session
            .requestReferenceSpace(spaceType)
            .then((referenceSpace) => {
                this._referenceSpace = referenceSpace
                this.app.requestAnimationFrame()
                if (callback) callback(null)
                this.fire('start')
            })
            .catch((ex) => {
                failed = true
                session.end()
                if (callback) callback(ex)
                this.fire('error', ex)
            })
    }
    _setClipPlanes(near, far) {
        if (this._depthNear === near && this._depthFar === far) {
            return
        }
        this._depthNear = near
        this._depthFar = far
        if (!this._session) {
            return
        }
        this._session.updateRenderState({
            depthNear: this._depthNear,
            depthFar: this._depthFar,
        })
    }
    _createBaseLayer() {
        const device = this.app.graphicsDevice
        const framebufferScaleFactor = (device.maxPixelRatio / window.devicePixelRatio) * this._framebufferScaleFactor
        this._baseLayer = new XRWebGLLayer(this._session, device.gl, {
            alpha: true,
            depth: true,
            stencil: true,
            framebufferScaleFactor: framebufferScaleFactor,
            antialias: false,
        })
        if (device?.isWebGL2 && window.XRWebGLBinding) {
            try {
                this.webglBinding = new XRWebGLBinding(this._session, device.gl)
            } catch (ex) {
                this.fire('error', ex)
            }
        }
        this._session.updateRenderState({
            baseLayer: this._baseLayer,
            depthNear: this._depthNear,
            depthFar: this._depthFar,
        })
    }
    _onDeviceLost() {
        if (!this._session) {
            return
        }
        if (this.webglBinding) {
            this.webglBinding = null
        }
        this._baseLayer = null
        this._session.updateRenderState({
            baseLayer: this._baseLayer,
            depthNear: this._depthNear,
            depthFar: this._depthFar,
        })
    }
    _onDeviceRestored() {
        if (!this._session) {
            return
        }
        setTimeout(() => {
            this.app.graphicsDevice.gl
                .makeXRCompatible()
                .then(() => {
                    this._createBaseLayer()
                })
                .catch((ex) => {
                    this.fire('error', ex)
                })
        }, 0)
    }
    update(frame) {
        if (!this._session) return false
        const width = frame.session.renderState.baseLayer.framebufferWidth
        const height = frame.session.renderState.baseLayer.framebufferHeight
        if (this._width !== width || this._height !== height) {
            this._width = width
            this._height = height
            this.app.graphicsDevice.setResolution(width, height)
        }
        const pose = frame.getViewerPose(this._referenceSpace)
        if (!pose) return false
        const lengthOld = this.views.list.length
        this.views.update(frame, pose.views)
        const posePosition = pose.transform.position
        const poseOrientation = pose.transform.orientation
        this._localPosition.set(posePosition.x, posePosition.y, posePosition.z)
        this._localRotation.set(poseOrientation.x, poseOrientation.y, poseOrientation.z, poseOrientation.w)
        if (lengthOld === 0 && this.views.list.length > 0) {
            const viewProjMat = new Mat4()
            const view = this.views.list[0]
            viewProjMat.copy(view.projMat)
            const data = viewProjMat.data
            const fov = (2.0 * Math.atan(1.0 / data[5]) * 180.0) / Math.PI
            const aspectRatio = data[5] / data[0]
            const farClip = data[14] / (data[10] + 1)
            const nearClip = data[14] / (data[10] - 1)
            const horizontalFov = false
            const camera = this._camera.camera
            camera.setXrProperties({
                aspectRatio,
                farClip,
                fov,
                horizontalFov,
                nearClip,
            })
        }
        this._camera.camera._node.setLocalPosition(this._localPosition)
        this._camera.camera._node.setLocalRotation(this._localRotation)
        this.input.update(frame)
        if (this._type === XRTYPE_AR) {
            if (this.hitTest.supported) {
                this.hitTest.update(frame)
            }
            if (this.lightEstimation.supported) {
                this.lightEstimation.update(frame)
            }
            if (this.imageTracking.supported) {
                this.imageTracking.update(frame)
            }
            if (this.anchors.supported) {
                this.anchors.update(frame)
            }
            if (this.planeDetection.supported) {
                this.planeDetection.update(frame)
            }
            if (this.meshDetection.supported) {
                this.meshDetection.update(frame)
            }
        }
        this.fire('update', frame)
        return true
    }
    get supported() {
        return this._supported
    }
    get active() {
        return !!this._session
    }
    get type() {
        return this._type
    }
    get spaceType() {
        return this._spaceType
    }
    get session() {
        return this._session
    }
    get frameRate() {
        return this._session?.frameRate ?? null
    }
    get supportedFrameRates() {
        return this._supportedFrameRates
    }
    get framebufferScaleFactor() {
        return this._framebufferScaleFactor
    }
    set fixedFoveation(value) {
        if ((this._baseLayer?.fixedFoveation ?? null) !== null) {
            if (this.app.graphicsDevice.samples > 1);
            this._baseLayer.fixedFoveation = value
        }
    }
    get fixedFoveation() {
        return this._baseLayer?.fixedFoveation ?? null
    }
    get camera() {
        return this._camera ? this._camera.entity : null
    }
    get visibilityState() {
        if (!this._session) {
            return null
        }
        return this._session.visibilityState
    }
    constructor(app) {
        ;(super(),
            (this._supported = platform.browser && !!navigator.xr),
            (this._available = {}),
            (this._type = null),
            (this._spaceType = null),
            (this._session = null),
            (this._baseLayer = null),
            (this.webglBinding = null),
            (this._referenceSpace = null),
            (this._camera = null),
            (this._localPosition = new Vec3()),
            (this._localRotation = new Quat()),
            (this._depthNear = 0.1),
            (this._depthFar = 1000),
            (this._supportedFrameRates = null),
            (this._width = 0),
            (this._height = 0),
            (this._framebufferScaleFactor = 1.0))
        this.app = app
        this._available[XRTYPE_INLINE] = false
        this._available[XRTYPE_VR] = false
        this._available[XRTYPE_AR] = false
        this.domOverlay = new XrDomOverlay(this)
        this.hitTest = new XrHitTest(this)
        this.imageTracking = new XrImageTracking(this)
        this.planeDetection = new XrPlaneDetection(this)
        this.meshDetection = new XrMeshDetection(this)
        this.input = new XrInput(this)
        this.lightEstimation = new XrLightEstimation(this)
        this.anchors = new XrAnchors(this)
        this.views = new XrViews(this)
        if (this._supported) {
            navigator.xr.addEventListener('devicechange', () => {
                this._deviceAvailabilityCheck()
            })
            this._deviceAvailabilityCheck()
            this.app.graphicsDevice.on('devicelost', this._onDeviceLost, this)
            this.app.graphicsDevice.on('devicerestored', this._onDeviceRestored, this)
        }
    }
}
XrManager.EVENT_AVAILABLE = 'available'
XrManager.EVENT_START = 'start'
XrManager.EVENT_END = 'end'
XrManager.EVENT_UPDATE = 'update'
XrManager.EVENT_ERROR = 'error'

const tempMeshInstances$1 = []
const lights = [[], [], []]
const defaultShadowAtlasParams = new Float32Array(2)
class RenderPassPicker extends RenderPass {
    destroy() {
        this.viewBindGroups.forEach((bg) => {
            bg.defaultUniformBuffer.destroy()
            bg.destroy()
        })
        this.viewBindGroups.length = 0
    }
    update(camera, scene, layers, mapping, depth) {
        this.camera = camera
        this.scene = scene
        this.layers = layers
        this.mapping = mapping
        this.depth = depth
        if (scene.clusteredLightingEnabled) {
            this.emptyWorldClusters = this.renderer.worldClustersAllocator.empty
        }
    }
    execute() {
        const device = this.device
        const { renderer, camera, scene, layers, mapping, renderTarget } = this
        const srcLayers = scene.layers.layerList
        const subLayerEnabled = scene.layers.subLayerEnabled
        const isTransparent = scene.layers.subLayerList
        for (let i = 0; i < srcLayers.length; i++) {
            const srcLayer = srcLayers[i]
            if (layers && layers.indexOf(srcLayer) < 0) {
                continue
            }
            if (srcLayer.enabled && subLayerEnabled[i]) {
                if (srcLayer.camerasSet.has(camera.camera)) {
                    const transparent = isTransparent[i]
                    if (srcLayer._clearDepthBuffer) {
                        renderer.clear(camera.camera, false, true, false)
                    }
                    const meshInstances = srcLayer.meshInstances
                    for (let j = 0; j < meshInstances.length; j++) {
                        const meshInstance = meshInstances[j]
                        if (meshInstance.pick && meshInstance.transparent === transparent) {
                            tempMeshInstances$1.push(meshInstance)
                            mapping.set(meshInstance.id, meshInstance)
                        }
                    }
                    if (scene.gsplat.enableIds) {
                        const placements = srcLayer.gsplatPlacements
                        for (let j = 0; j < placements.length; j++) {
                            const placement = placements[j]
                            const component = placement.node?.gsplat
                            if (component) {
                                mapping.set(placement.id, component)
                            }
                        }
                    }
                    if (tempMeshInstances$1.length > 0) {
                        const clusteredLightingEnabled = scene.clusteredLightingEnabled
                        if (clusteredLightingEnabled) {
                            const lightClusters = this.emptyWorldClusters
                            lightClusters.activate()
                        }
                        renderer.setCameraUniforms(camera.camera, renderTarget)
                        renderer.dispatchGlobalLights(scene)
                        device.scope.resolve('shadowAtlasParams').setValue(defaultShadowAtlasParams)
                        if (device.supportsUniformBuffers) {
                            renderer.initViewBindGroupFormat(clusteredLightingEnabled)
                            renderer.setupViewUniformBuffers(
                                this.viewBindGroups,
                                renderer.viewUniformFormat,
                                renderer.viewBindGroupFormat,
                                null,
                            )
                        }
                        const shaderPass = this.depth ? SHADER_DEPTH_PICK : SHADER_PICK
                        renderer.renderForward(
                            camera.camera,
                            renderTarget,
                            tempMeshInstances$1,
                            lights,
                            shaderPass,
                            (meshInstance) => {
                                device.setBlendState(this.blendState)
                            },
                        )
                        tempMeshInstances$1.length = 0
                    }
                }
            }
        }
    }
    constructor(device, renderer) {
        ;(super(device), (this.viewBindGroups = []), (this.blendState = BlendState.NOBLEND))
        this.renderer = renderer
    }
}

const SSAOTYPE_NONE = 'none'
const SSAOTYPE_LIGHTING = 'lighting'
const SSAOTYPE_COMBINE = 'combine'

var glslDownsamplePS = `
uniform sampler2D sourceTexture;
uniform vec2 sourceInvResolution;
varying vec2 uv0;
#ifdef PREMULTIPLY
	uniform sampler2D premultiplyTexture;
#endif
void main()
{
	vec3 e = texture2D (sourceTexture, uv0).rgb;
	#ifdef BOXFILTER
		vec3 value = e;
		#ifdef PREMULTIPLY
			float premultiply = texture2D(premultiplyTexture, uv0).{PREMULTIPLY_SRC_CHANNEL};
			value *= vec3(premultiply);
		#endif
	#else
		float x = sourceInvResolution.x;
		float y = sourceInvResolution.y;
		vec3 a = texture2D(sourceTexture, vec2 (uv0.x - 2.0 * x, uv0.y + 2.0 * y)).rgb;
		vec3 b = texture2D(sourceTexture, vec2 (uv0.x,		   uv0.y + 2.0 * y)).rgb;
		vec3 c = texture2D(sourceTexture, vec2 (uv0.x + 2.0 * x, uv0.y + 2.0 * y)).rgb;
		vec3 d = texture2D(sourceTexture, vec2 (uv0.x - 2.0 * x, uv0.y)).rgb;
		vec3 f = texture2D(sourceTexture, vec2 (uv0.x + 2.0 * x, uv0.y)).rgb;
		vec3 g = texture2D(sourceTexture, vec2 (uv0.x - 2.0 * x, uv0.y - 2.0 * y)).rgb;
		vec3 h = texture2D(sourceTexture, vec2 (uv0.x,		   uv0.y - 2.0 * y)).rgb;
		vec3 i = texture2D(sourceTexture, vec2 (uv0.x + 2.0 * x, uv0.y - 2.0 * y)).rgb;
		vec3 j = texture2D(sourceTexture, vec2 (uv0.x - x, uv0.y + y)).rgb;
		vec3 k = texture2D(sourceTexture, vec2 (uv0.x + x, uv0.y + y)).rgb;
		vec3 l = texture2D(sourceTexture, vec2 (uv0.x - x, uv0.y - y)).rgb;
		vec3 m = texture2D(sourceTexture, vec2 (uv0.x + x, uv0.y - y)).rgb;
		vec3 value = e * 0.125;
		value += (a + c + g + i) * 0.03125;
		value += (b + d + f + h) * 0.0625;
		value += (j + k + l + m) * 0.125;
	#endif
	#ifdef REMOVE_INVALID
		value = max(value, vec3(0.0));
	#endif
	gl_FragColor = vec4(value, 1.0);
}
`

var wgslDownsamplePS = `
var sourceTexture: texture_2d<f32>;
var sourceTextureSampler: sampler;
uniform sourceInvResolution: vec2f;
varying uv0: vec2f;
#ifdef PREMULTIPLY
	var premultiplyTexture: texture_2d<f32>;
	var premultiplyTextureSampler: sampler;
#endif
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	var output: FragmentOutput;
	let e: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, input.uv0).rgb);
	#ifdef BOXFILTER
		var value: half3 = e;
		#ifdef PREMULTIPLY
			let premultiply: half = half(textureSample(premultiplyTexture, premultiplyTextureSampler, input.uv0).{PREMULTIPLY_SRC_CHANNEL});
			value *= premultiply;
		#endif
	#else
		let x: f32 = uniform.sourceInvResolution.x;
		let y: f32 = uniform.sourceInvResolution.y;
		let a: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x - 2.0 * x, input.uv0.y + 2.0 * y)).rgb);
		let b: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x,		   input.uv0.y + 2.0 * y)).rgb);
		let c: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x + 2.0 * x, input.uv0.y + 2.0 * y)).rgb);
		let d: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x - 2.0 * x, input.uv0.y)).rgb);
		let f: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x + 2.0 * x, input.uv0.y)).rgb);
		let g: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x - 2.0 * x, input.uv0.y - 2.0 * y)).rgb);
		let h: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x,		   input.uv0.y - 2.0 * y)).rgb);
		let i: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x + 2.0 * x, input.uv0.y - 2.0 * y)).rgb);
		let j: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x - x, input.uv0.y + y)).rgb);
		let k: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x + x, input.uv0.y + y)).rgb);
		let l: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x - x, input.uv0.y - y)).rgb);
		let m: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x + x, input.uv0.y - y)).rgb);
		var value: half3 = e * half(0.125);
		value += (a + c + g + i) * half(0.03125);
		value += (b + d + f + h) * half(0.0625);
		value += (j + k + l + m) * half(0.125);
	#endif
	#ifdef REMOVE_INVALID
		value = max(value, half3(0.0));
	#endif
	output.color = vec4f(vec3f(value), 1.0);
	return output;
}
`

class RenderPassDownsample extends RenderPassShaderQuad {
    setSourceTexture(value) {
        this._sourceTexture = value
        this.options.resizeSource = value
    }
    execute() {
        this.sourceTextureId.setValue(this.sourceTexture)
        if (this.premultiplyTexture) {
            this.premultiplyTextureId.setValue(this.premultiplyTexture)
        }
        this.sourceInvResolutionValue[0] = 1.0 / this.sourceTexture.width
        this.sourceInvResolutionValue[1] = 1.0 / this.sourceTexture.height
        this.sourceInvResolutionId.setValue(this.sourceInvResolutionValue)
        super.execute()
    }
    constructor(device, sourceTexture, options = {}) {
        super(device)
        this.sourceTexture = sourceTexture
        this.premultiplyTexture = options.premultiplyTexture
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('downsamplePS', glslDownsamplePS)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('downsamplePS', wgslDownsamplePS)
        const boxFilter = options.boxFilter ?? false
        const key = `${boxFilter ? 'Box' : ''}-${options.premultiplyTexture ? 'Premultiply' : ''}-${options.premultiplySrcChannel ?? ''}-${options.removeInvalid ? 'RemoveInvalid' : ''}`
        const defines = new Map()
        if (boxFilter) defines.set('BOXFILTER', '')
        if (options.premultiplyTexture) defines.set('PREMULTIPLY', '')
        if (options.removeInvalid) defines.set('REMOVE_INVALID', '')
        defines.set('{PREMULTIPLY_SRC_CHANNEL}', options.premultiplySrcChannel ?? 'x')
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: `DownSampleShader:${key}`,
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
            vertexChunk: 'quadVS',
            fragmentChunk: 'downsamplePS',
            fragmentDefines: defines,
        })
        this.sourceTextureId = device.scope.resolve('sourceTexture')
        this.premultiplyTextureId = device.scope.resolve('premultiplyTexture')
        this.sourceInvResolutionId = device.scope.resolve('sourceInvResolution')
        this.sourceInvResolutionValue = new Float32Array(2)
    }
}

var glslUpsamplePS = `
	uniform sampler2D sourceTexture;
	uniform vec2 sourceInvResolution;
	varying vec2 uv0;
	void main()
	{
		float x = sourceInvResolution.x;
		float y = sourceInvResolution.y;
		vec3 a = texture2D (sourceTexture, vec2 (uv0.x - x, uv0.y + y)).rgb;
		vec3 b = texture2D (sourceTexture, vec2 (uv0.x,	 uv0.y + y)).rgb;
		vec3 c = texture2D (sourceTexture, vec2 (uv0.x + x, uv0.y + y)).rgb;
		vec3 d = texture2D (sourceTexture, vec2 (uv0.x - x, uv0.y)).rgb;
		vec3 e = texture2D (sourceTexture, vec2 (uv0.x,	 uv0.y)).rgb;
		vec3 f = texture2D (sourceTexture, vec2 (uv0.x + x, uv0.y)).rgb;
		vec3 g = texture2D (sourceTexture, vec2 (uv0.x - x, uv0.y - y)).rgb;
		vec3 h = texture2D (sourceTexture, vec2 (uv0.x,	 uv0.y - y)).rgb;
		vec3 i = texture2D (sourceTexture, vec2 (uv0.x + x, uv0.y - y)).rgb;
		vec3 value = e * 0.25;
		value += (b + d + f + h) * 0.125;
		value += (a + c + g + i) * 0.0625;
		gl_FragColor = vec4(value, 1.0);
	}
`

var wgslUpsamplePS = `
	var sourceTexture: texture_2d<f32>;
	var sourceTextureSampler: sampler;
	uniform sourceInvResolution: vec2f;
	varying uv0: vec2f;
	@fragment
	fn fragmentMain(input: FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		let x: f32 = uniform.sourceInvResolution.x;
		let y: f32 = uniform.sourceInvResolution.y;
		let a: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x - x, input.uv0.y + y)).rgb);
		let b: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x,	 input.uv0.y + y)).rgb);
		let c: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x + x, input.uv0.y + y)).rgb);
		let d: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x - x, input.uv0.y)).rgb);
		let e: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x,	 input.uv0.y)).rgb);
		let f: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x + x, input.uv0.y)).rgb);
		let g: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x - x, input.uv0.y - y)).rgb);
		let h: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x,	 input.uv0.y - y)).rgb);
		let i: half3 = half3(textureSample(sourceTexture, sourceTextureSampler, vec2f(input.uv0.x + x, input.uv0.y - y)).rgb);
		var value: half3 = e * half(0.25);
		value += (b + d + f + h) * half(0.125);
		value += (a + c + g + i) * half(0.0625);
		output.color = vec4f(vec3f(value), 1.0);
		return output;
	}
`

class RenderPassUpsample extends RenderPassShaderQuad {
    execute() {
        this.sourceTextureId.setValue(this.sourceTexture)
        this.sourceInvResolutionValue[0] = 1.0 / this.sourceTexture.width
        this.sourceInvResolutionValue[1] = 1.0 / this.sourceTexture.height
        this.sourceInvResolutionId.setValue(this.sourceInvResolutionValue)
        super.execute()
    }
    constructor(device, sourceTexture) {
        super(device)
        this.sourceTexture = sourceTexture
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('upsamplePS', glslUpsamplePS)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('upsamplePS', wgslUpsamplePS)
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'UpSampleShader',
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
            vertexChunk: 'quadVS',
            fragmentChunk: 'upsamplePS',
        })
        this.sourceTextureId = device.scope.resolve('sourceTexture')
        this.sourceInvResolutionId = device.scope.resolve('sourceInvResolution')
        this.sourceInvResolutionValue = new Float32Array(2)
    }
}

class RenderPassBloom extends RenderPass {
    destroy() {
        this.destroyRenderPasses()
        this.destroyRenderTargets()
    }
    destroyRenderTargets(startIndex = 0) {
        for (let i = startIndex; i < this.renderTargets.length; i++) {
            const rt = this.renderTargets[i]
            rt.destroyTextureBuffers()
            rt.destroy()
        }
        this.renderTargets.length = 0
    }
    destroyRenderPasses() {
        for (let i = 0; i < this.beforePasses.length; i++) {
            this.beforePasses[i].destroy()
        }
        this.beforePasses.length = 0
    }
    createRenderTarget(index) {
        return new RenderTarget({
            depth: false,
            colorBuffer: new Texture(this.device, {
                name: `BloomTexture${index}`,
                width: 1,
                height: 1,
                format: this.textureFormat,
                mipmaps: false,
                minFilter: FILTER_LINEAR,
                magFilter: FILTER_LINEAR,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
            }),
        })
    }
    createRenderTargets(count) {
        for (let i = 0; i < count; i++) {
            const rt = i === 0 ? this.bloomRenderTarget : this.createRenderTarget(i)
            this.renderTargets.push(rt)
        }
    }
    calcMipLevels(width, height, minSize) {
        const min = Math.min(width, height)
        return Math.floor(Math.log2(min) - Math.log2(minSize))
    }
    createRenderPasses(numPasses) {
        const device = this.device
        let passSourceTexture = this._sourceTexture
        for (let i = 0; i < numPasses; i++) {
            const pass = new RenderPassDownsample(device, passSourceTexture)
            const rt = this.renderTargets[i]
            pass.init(rt, {
                resizeSource: passSourceTexture,
                scaleX: 0.5,
                scaleY: 0.5,
            })
            pass.setClearColor(Color.BLACK)
            this.beforePasses.push(pass)
            passSourceTexture = rt.colorBuffer
        }
        passSourceTexture = this.renderTargets[numPasses - 1].colorBuffer
        for (let i = numPasses - 2; i >= 0; i--) {
            const pass = new RenderPassUpsample(device, passSourceTexture)
            const rt = this.renderTargets[i]
            pass.init(rt)
            pass.blendState = BlendState.ADDBLEND
            this.beforePasses.push(pass)
            passSourceTexture = rt.colorBuffer
        }
    }
    onDisable() {
        this.renderTargets[0]?.resize(1, 1)
        this.destroyRenderPasses()
        this.destroyRenderTargets(1)
    }
    frameUpdate() {
        super.frameUpdate()
        const maxNumPasses = this.calcMipLevels(this._sourceTexture.width, this._sourceTexture.height, 1)
        const numPasses = math.clamp(maxNumPasses, 1, this.blurLevel)
        if (this.renderTargets.length !== numPasses) {
            this.destroyRenderPasses()
            this.destroyRenderTargets(1)
            this.createRenderTargets(numPasses)
            this.createRenderPasses(numPasses)
        }
    }
    constructor(device, sourceTexture, format) {
        ;(super(device), (this.blurLevel = 16), (this.renderTargets = []))
        this._sourceTexture = sourceTexture
        this.textureFormat = format
        this.bloomRenderTarget = this.createRenderTarget(0)
        this.bloomTexture = this.bloomRenderTarget.colorBuffer
    }
}

var composePS$1 = `
	#include "tonemappingPS"
	#include "gammaPS"
	varying vec2 uv0;
	uniform sampler2D sceneTexture;
	uniform vec2 sceneTextureInvRes;
	#include "composeBloomPS"
	#include "composeDofPS"
	#include "composeSsaoPS"
	#include "composeGradingPS"
	#include "composeColorEnhancePS"
	#include "composeVignettePS"
	#include "composeFringingPS"
	#include "composeCasPS"
	#include "composeColorLutPS"
	#include "composeDeclarationsPS"
	void main() {
		#include "composeMainStartPS"
		vec2 uv = uv0;
		vec4 scene = texture2DLod(sceneTexture, uv, 0.0);
		vec3 result = scene.rgb;
		#ifdef CAS
			result = applyCas(result, uv, sharpness);
		#endif
		#ifdef DOF
			result = applyDof(result, uv0);
		#endif
		#ifdef SSAO_TEXTURE
			result = applySsao(result, uv0);
		#endif
		#ifdef FRINGING
			result = applyFringing(result, uv);
		#endif
		#ifdef BLOOM
			result = applyBloom(result, uv0);
		#endif
		#ifdef COLOR_ENHANCE
			result = applyColorEnhance(result);
		#endif
		#ifdef GRADING
			result = applyGrading(result);
		#endif
		result = toneMap(max(vec3(0.0), result));
		#ifdef COLOR_LUT
			result = applyColorLUT(result);
		#endif
		#ifdef VIGNETTE
			result = applyVignette(result, uv);
		#endif
		#include "composeMainEndPS"
		#ifdef DEBUG_COMPOSE
			#if DEBUG_COMPOSE == scene
				result = scene.rgb;
			#elif defined(BLOOM) && DEBUG_COMPOSE == bloom
				result = dBloom * bloomIntensity;
			#elif defined(DOF) && DEBUG_COMPOSE == dofcoc
				result = vec3(dCoc, 0.0);
			#elif defined(DOF) && DEBUG_COMPOSE == dofblur
				result = dBlur;
			#elif defined(SSAO_TEXTURE) && DEBUG_COMPOSE == ssao
				result = vec3(dSsao);
			#elif defined(VIGNETTE) && DEBUG_COMPOSE == vignette
				result = vec3(dVignette);
			#endif
		#endif
		result = gammaCorrectOutput(result);
		gl_FragColor = vec4(result, scene.a);
	}
`

var composeBloomPS$1 = `
	#ifdef BLOOM
		uniform sampler2D bloomTexture;
		uniform float bloomIntensity;
		
		vec3 dBloom;
		
		vec3 applyBloom(vec3 color, vec2 uv) {
			dBloom = texture2DLod(bloomTexture, uv, 0.0).rgb;
			return color + dBloom * bloomIntensity;
		}
	#endif
`

var composeDofPS$1 = `
	#ifdef DOF
		uniform sampler2D cocTexture;
		uniform sampler2D blurTexture;
		
		vec2 dCoc;
		vec3 dBlur;
		vec3 getDofBlur(vec2 uv) {
			dCoc = texture2DLod(cocTexture, uv, 0.0).rg;
			#if DOF_UPSCALE
				vec2 blurTexelSize = 1.0 / vec2(textureSize(blurTexture, 0));
				vec3 bilinearBlur = vec3(0.0);
				float totalWeight = 0.0;
				for (int i = -1; i <= 1; i++) {
					for (int j = -1; j <= 1; j++) {
						vec2 offset = vec2(i, j) * blurTexelSize;
						vec2 cocSample = texture2DLod(cocTexture, uv + offset, 0.0).rg;
						vec3 blurSample = texture2DLod(blurTexture, uv + offset, 0.0).rgb;
						float cocWeight = clamp(cocSample.r + cocSample.g, 0.0, 1.0);
						bilinearBlur += blurSample * cocWeight;
						totalWeight += cocWeight;
					}
				}
				if (totalWeight > 0.0) {
					bilinearBlur /= totalWeight;
				}
				dBlur = bilinearBlur;
				return bilinearBlur;
			#else
				dBlur = texture2DLod(blurTexture, uv, 0.0).rgb;
				return dBlur;
			#endif
		}
		vec3 applyDof(vec3 color, vec2 uv) {
			vec3 blur = getDofBlur(uv);
			return mix(color, blur, dCoc.r + dCoc.g);
		}
	#endif
`

var composeSsaoPS$1 = `
	#ifdef SSAO
		#define SSAO_TEXTURE
	#endif
	#if DEBUG_COMPOSE == ssao
		#define SSAO_TEXTURE
	#endif
	#ifdef SSAO_TEXTURE
		uniform sampler2D ssaoTexture;
		
		float dSsao;
		
		vec3 applySsao(vec3 color, vec2 uv) {
			dSsao = texture2DLod(ssaoTexture, uv, 0.0).r;
			
			#ifdef SSAO
				return color * dSsao;
			#else
				return color;
			#endif
		}
	#endif
`

var composeGradingPS$1 = `
	#ifdef GRADING
		uniform vec3 brightnessContrastSaturation;
		uniform vec3 tint;
		vec3 colorGradingHDR(vec3 color, float brt, float sat, float con) {
			color *= tint;
			color = color * brt;
			float grey = dot(color, vec3(0.3, 0.59, 0.11));
			grey = grey / max(1.0, max(color.r, max(color.g, color.b)));
			color = mix(vec3(grey), color, sat);
			return mix(vec3(0.5), color, con);
		}
		vec3 applyGrading(vec3 color) {
			return colorGradingHDR(color, 
				brightnessContrastSaturation.x, 
				brightnessContrastSaturation.z, 
				brightnessContrastSaturation.y);
		}
	#endif
`

var composeColorEnhancePS$1 = `
	#ifdef COLOR_ENHANCE
		uniform vec4 colorEnhanceParams;
		uniform float colorEnhanceMidtones;
		vec3 applyColorEnhance(vec3 color) {
			float maxChannel = max(color.r, max(color.g, color.b));
			float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
			if (colorEnhanceParams.x != 0.0 || colorEnhanceParams.y != 0.0) {
				float logLum = log2(max(lum, 0.001)) / 10.0 + 0.5;
				logLum = clamp(logLum, 0.0, 1.0);
				float shadowWeight = pow(1.0 - logLum, 2.0);
				float highlightWeight = pow(logLum, 2.0);
				color *= pow(2.0, colorEnhanceParams.x * shadowWeight);
				color *= pow(2.0, colorEnhanceParams.y * highlightWeight);
			}
			if (colorEnhanceMidtones != 0.0) {
				const float pivot = 0.18;
				const float widthStops = 1.25;
				const float maxStops = 2.0;
				float y = max(dot(color, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
				float d = log2(y / pivot);
				float w = exp(-(d * d) / (2.0 * widthStops * widthStops));
				float stops = colorEnhanceMidtones * maxStops * w;
				color *= exp2(stops);
			}
			if (colorEnhanceParams.z != 0.0) {
				float minChannel = min(color.r, min(color.g, color.b));
				maxChannel = max(color.r, max(color.g, color.b));
				float sat = (maxChannel - minChannel) / max(maxChannel, 0.001);
				lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
				float normalizedLum = lum / max(1.0, maxChannel);
				vec3 grey = vec3(normalizedLum) * maxChannel;
				float satBoost = colorEnhanceParams.z * (1.0 - sat);
				color = mix(grey, color, 1.0 + satBoost);
			}
			if (colorEnhanceParams.w != 0.0) {
				maxChannel = max(color.r, max(color.g, color.b));
				float scale = max(1.0, maxChannel);
				vec3 normalized = color / scale;
				float darkChannel = min(normalized.r, min(normalized.g, normalized.b));
				float atmosphericLight = 0.95;
				float t = 1.0 - colorEnhanceParams.w * darkChannel / atmosphericLight;
				t = max(t, 0.1);
				vec3 dehazed = (normalized - atmosphericLight) / t + atmosphericLight;
				color = dehazed * scale;
			}
			return max(vec3(0.0), color);
		}
	#endif
`

var composeVignettePS$1 = `
	#ifdef VIGNETTE
		uniform vec4 vignetterParams;
		uniform vec3 vignetteColor;
		
		float dVignette;
		
		float calcVignette(vec2 uv) {
			float inner = vignetterParams.x;
			float outer = vignetterParams.y;
			float curvature = vignetterParams.z;
			float intensity = vignetterParams.w;
			vec2 curve = pow(abs(uv * 2.0 -1.0), vec2(1.0 / curvature));
			float edge = pow(length(curve), curvature);
			dVignette = 1.0 - intensity * smoothstep(inner, outer, edge);
			return dVignette;
		}
		vec3 applyVignette(vec3 color, vec2 uv) {
			return mix(vignetteColor, color, calcVignette(uv));
		}
	#endif
`

var composeFringingPS$1 = `
	#ifdef FRINGING
		uniform float fringingIntensity;
		vec3 applyFringing(vec3 color, vec2 uv) {
			vec2 centerDistance = uv - 0.5;
			vec2 offset = fringingIntensity * centerDistance * centerDistance;
			color.r = texture2D(sceneTexture, uv - offset).r;
			color.b = texture2D(sceneTexture, uv + offset).b;
			return color;
		}
	#endif
`

var composeCasPS$1 = `
	#ifdef CAS
		uniform float sharpness;
		#ifdef CAS_HDR
			float maxComponent(float x, float y, float z) { return max(x, max(y, z)); }
			vec3 toSDR(vec3 c) { return c / (1.0 + maxComponent(c.r, c.g, c.b)); }
			vec3 toHDR(vec3 c) { return c / max(1.0 - maxComponent(c.r, c.g, c.b), 1e-4); }
		#else
			vec3 toSDR(vec3 c) { return c; }
			vec3 toHDR(vec3 c) { return c; }
		#endif
		vec3 applyCas(vec3 color, vec2 uv, float sharpness) {
			float x = sceneTextureInvRes.x;
			float y = sceneTextureInvRes.y;
			vec3 a = toSDR(texture2DLod(sceneTexture, uv + vec2(0.0, -y), 0.0).rgb);
			vec3 b = toSDR(texture2DLod(sceneTexture, uv + vec2(-x, 0.0), 0.0).rgb);
			vec3 c = toSDR(color.rgb);
			vec3 d = toSDR(texture2DLod(sceneTexture, uv + vec2(x, 0.0), 0.0).rgb);
			vec3 e = toSDR(texture2DLod(sceneTexture, uv + vec2(0.0, y), 0.0).rgb);
			float min_g = min(a.g, min(b.g, min(c.g, min(d.g, e.g))));
			float max_g = max(a.g, max(b.g, max(c.g, max(d.g, e.g))));
			float sharpening_amount = sqrt(min(1.0 - max_g, min_g) / max(max_g, 1e-4));
			float w = sharpening_amount * sharpness;
			vec3 res = (w * (a + b + d + e) + c) / (4.0 * w + 1.0);
			res = max(res, 0.0);
			return toHDR(res);
		}
	#endif
`

var composeColorLutPS$1 = `
	#ifdef COLOR_LUT
		uniform sampler2D colorLUT;
		uniform vec4 colorLUTParams;
		vec3 applyColorLUT(vec3 color) {
			vec3 c = clamp(color, 0.0, 1.0);
			float width = colorLUTParams.x;
			float height = colorLUTParams.y;
			float maxColor = colorLUTParams.z;
			float cell = c.b * maxColor;
			float cell_l = floor(cell);
			float cell_h = ceil(cell);
			float half_px_x = 0.5 / width;
			float half_px_y = 0.5 / height;
			float r_offset = half_px_x + c.r / height * (maxColor / height);
			float g_offset = half_px_y + c.g * (maxColor / height);
			vec2 uv_l = vec2(cell_l / height + r_offset, g_offset);
			vec2 uv_h = vec2(cell_h / height + r_offset, g_offset);
			vec3 color_l = texture2DLod(colorLUT, uv_l, 0.0).rgb;
			vec3 color_h = texture2DLod(colorLUT, uv_h, 0.0).rgb;
			vec3 lutColor = mix(color_l, color_h, fract(cell));
			return mix(color, lutColor, colorLUTParams.w);
		}
	#endif
`

const composeChunksGLSL = {
    composePS: composePS$1,
    composeBloomPS: composeBloomPS$1,
    composeDofPS: composeDofPS$1,
    composeSsaoPS: composeSsaoPS$1,
    composeGradingPS: composeGradingPS$1,
    composeColorEnhancePS: composeColorEnhancePS$1,
    composeVignettePS: composeVignettePS$1,
    composeFringingPS: composeFringingPS$1,
    composeCasPS: composeCasPS$1,
    composeColorLutPS: composeColorLutPS$1,
    composeDeclarationsPS: '',
    composeMainStartPS: '',
    composeMainEndPS: '',
}

var composePS = `
	#include "tonemappingPS"
	#include "gammaPS"
	varying uv0: vec2f;
	var sceneTexture: texture_2d<f32>;
	var sceneTextureSampler: sampler;
	uniform sceneTextureInvRes: vec2f;
	#include "composeBloomPS"
	#include "composeDofPS"
	#include "composeSsaoPS"
	#include "composeGradingPS"
	#include "composeColorEnhancePS"
	#include "composeVignettePS"
	#include "composeFringingPS"
	#include "composeCasPS"
	#include "composeColorLutPS"
	#include "composeDeclarationsPS"
	@fragment
	fn fragmentMain(input: FragmentInput) -> FragmentOutput {
		#include "composeMainStartPS"
		var output: FragmentOutput;
		var uv = uv0;
		let scene = textureSampleLevel(sceneTexture, sceneTextureSampler, uv, 0.0);
		var result = scene.rgb;
		#ifdef CAS
			result = applyCas(result, uv, uniform.sharpness);
		#endif
		#ifdef DOF
			result = applyDof(result, uv0);
		#endif
		#ifdef SSAO_TEXTURE
			result = applySsao(result, uv0);
		#endif
		#ifdef FRINGING
			result = applyFringing(result, uv);
		#endif
		#ifdef BLOOM
			result = applyBloom(result, uv0);
		#endif
		#ifdef COLOR_ENHANCE
			result = applyColorEnhance(result);
		#endif
		#ifdef GRADING
			result = applyGrading(result);
		#endif
		result = toneMap(max(vec3f(0.0), result));
		#ifdef COLOR_LUT
			result = applyColorLUT(result);
		#endif
		#ifdef VIGNETTE
			result = applyVignette(result, uv);
		#endif
		#include "composeMainEndPS"
		#ifdef DEBUG_COMPOSE
			#if DEBUG_COMPOSE == scene
				result = scene.rgb;
			#elif defined(BLOOM) && DEBUG_COMPOSE == bloom
				result = dBloom * uniform.bloomIntensity;
			#elif defined(DOF) && DEBUG_COMPOSE == dofcoc
				result = vec3f(dCoc, 0.0);
			#elif defined(DOF) && DEBUG_COMPOSE == dofblur
				result = dBlur;
			#elif defined(SSAO_TEXTURE) && DEBUG_COMPOSE == ssao
				result = vec3f(dSsao);
			#elif defined(VIGNETTE) && DEBUG_COMPOSE == vignette
				result = vec3f(dVignette);
			#endif
		#endif
		result = gammaCorrectOutput(result);
		output.color = vec4f(result, scene.a);
		return output;
	}
`

var composeBloomPS = `
	#ifdef BLOOM
		var bloomTexture: texture_2d<f32>;
		var bloomTextureSampler: sampler;
		uniform bloomIntensity: f32;
		
		var<private> dBloom: vec3f;
		
		fn applyBloom(color: vec3f, uv: vec2f) -> vec3f {
			dBloom = textureSampleLevel(bloomTexture, bloomTextureSampler, uv, 0.0).rgb;
			return color + dBloom * uniform.bloomIntensity;
		}
	#endif
`

var composeDofPS = `
	#ifdef DOF
		var cocTexture: texture_2d<f32>;
		var cocTextureSampler: sampler;
		var blurTexture: texture_2d<f32>;
		var blurTextureSampler: sampler;
		
		var<private> dCoc: vec2f;
		var<private> dBlur: vec3f;
		fn getDofBlur(uv: vec2f) -> vec3f {
			dCoc = textureSampleLevel(cocTexture, cocTextureSampler, uv, 0.0).rg;
			#if DOF_UPSCALE
				let blurTexelSize = 1.0 / vec2f(textureDimensions(blurTexture, 0));
				var bilinearBlur = vec3f(0.0);
				var totalWeight = 0.0;
				for (var i = -1; i <= 1; i++) {
					for (var j = -1; j <= 1; j++) {
						let offset = vec2f(f32(i), f32(j)) * blurTexelSize;
						let cocSample = textureSampleLevel(cocTexture, cocTextureSampler, uv + offset, 0.0).rg;
						let blurSample = textureSampleLevel(blurTexture, blurTextureSampler, uv + offset, 0.0).rgb;
						let cocWeight = clamp(cocSample.r + cocSample.g, 0.0, 1.0);
						bilinearBlur += blurSample * cocWeight;
						totalWeight += cocWeight;
					}
				}
				if (totalWeight > 0.0) {
					bilinearBlur /= totalWeight;
				}
				dBlur = bilinearBlur;
				return bilinearBlur;
			#else
				dBlur = textureSampleLevel(blurTexture, blurTextureSampler, uv, 0.0).rgb;
				return dBlur;
			#endif
		}
		fn applyDof(color: vec3f, uv: vec2f) -> vec3f {
			let blur = getDofBlur(uv);
			return mix(color, blur, dCoc.r + dCoc.g);
		}
	#endif
`

var composeSsaoPS = `
	#ifdef SSAO
		#define SSAO_TEXTURE
	#endif
	#if DEBUG_COMPOSE == ssao
		#define SSAO_TEXTURE
	#endif
	#ifdef SSAO_TEXTURE
		var ssaoTexture: texture_2d<f32>;
		var ssaoTextureSampler: sampler;
		
		var<private> dSsao: f32;
		
		fn applySsao(color: vec3f, uv: vec2f) -> vec3f {
			dSsao = textureSampleLevel(ssaoTexture, ssaoTextureSampler, uv, 0.0).r;
			
			#ifdef SSAO
				return color * dSsao;
			#else
				return color;
			#endif
		}
	#endif
`

var composeGradingPS = `
	#ifdef GRADING
		uniform brightnessContrastSaturation: vec3f;
		uniform tint: vec3f;
		fn colorGradingHDR(color: vec3f, brt: f32, sat: f32, con: f32) -> vec3f {
			var colorOut = color * uniform.tint;
			colorOut = colorOut * brt;
			let grey = dot(colorOut, vec3f(0.3, 0.59, 0.11));
			let normalizedGrey = grey / max(1.0, max(colorOut.r, max(colorOut.g, colorOut.b)));
			colorOut = mix(vec3f(normalizedGrey), colorOut, sat);
			return mix(vec3f(0.5), colorOut, con);
		}
		fn applyGrading(color: vec3f) -> vec3f {
			return colorGradingHDR(color, 
				uniform.brightnessContrastSaturation.x, 
				uniform.brightnessContrastSaturation.z, 
				uniform.brightnessContrastSaturation.y);
		}
	#endif
`

var composeColorEnhancePS = `
	#ifdef COLOR_ENHANCE
		uniform colorEnhanceParams: vec4f;
		uniform colorEnhanceMidtones: f32;
		fn applyColorEnhance(color: vec3f) -> vec3f {
			var colorOut = color;
			var maxChannel = max(colorOut.r, max(colorOut.g, colorOut.b));
			var lum = dot(colorOut, vec3f(0.2126, 0.7152, 0.0722));
			if (uniform.colorEnhanceParams.x != 0.0 || uniform.colorEnhanceParams.y != 0.0) {
				var logLum = log2(max(lum, 0.001)) / 10.0 + 0.5;
				logLum = clamp(logLum, 0.0, 1.0);
				let shadowWeight = pow(1.0 - logLum, 2.0);
				let highlightWeight = pow(logLum, 2.0);
				colorOut *= pow(2.0, uniform.colorEnhanceParams.x * shadowWeight);
				colorOut *= pow(2.0, uniform.colorEnhanceParams.y * highlightWeight);
			}
			if (uniform.colorEnhanceMidtones != 0.0) {
				let pivot = 0.18;
				let widthStops = 1.25;
				let maxStops = 2.0;
				let y = max(dot(colorOut, vec3f(0.2126, 0.7152, 0.0722)), 1e-6);
				let d = log2(y / pivot);
				let w = exp(-(d * d) / (2.0 * widthStops * widthStops));
				let stops = uniform.colorEnhanceMidtones * maxStops * w;
				colorOut *= exp2(stops);
			}
			if (uniform.colorEnhanceParams.z != 0.0) {
				let minChannel = min(colorOut.r, min(colorOut.g, colorOut.b));
				maxChannel = max(colorOut.r, max(colorOut.g, colorOut.b));
				let sat = (maxChannel - minChannel) / max(maxChannel, 0.001);
				lum = dot(colorOut, vec3f(0.2126, 0.7152, 0.0722));
				let normalizedLum = lum / max(1.0, maxChannel);
				let grey = vec3f(normalizedLum) * maxChannel;
				let satBoost = uniform.colorEnhanceParams.z * (1.0 - sat);
				colorOut = mix(grey, colorOut, 1.0 + satBoost);
			}
			if (uniform.colorEnhanceParams.w != 0.0) {
				maxChannel = max(colorOut.r, max(colorOut.g, colorOut.b));
				let scale = max(1.0, maxChannel);
				let normalized = colorOut / scale;
				let darkChannel = min(normalized.r, min(normalized.g, normalized.b));
				let atmosphericLight = 0.95;
				var t = 1.0 - uniform.colorEnhanceParams.w * darkChannel / atmosphericLight;
				t = max(t, 0.1);
				let dehazed = (normalized - atmosphericLight) / t + atmosphericLight;
				colorOut = dehazed * scale;
			}
			return max(vec3f(0.0), colorOut);
		}
	#endif
`

var composeVignettePS = `
	#ifdef VIGNETTE
		uniform vignetterParams: vec4f;
		uniform vignetteColor: vec3f;
		
		var<private> dVignette: f32;
		
		fn calcVignette(uv: vec2f) -> f32 {
			let inner = uniform.vignetterParams.x;
			let outer = uniform.vignetterParams.y;
			let curvature = uniform.vignetterParams.z;
			let intensity = uniform.vignetterParams.w;
			let curve = pow(abs(uv * 2.0 - 1.0), vec2f(1.0 / curvature));
			let edge = pow(length(curve), curvature);
			dVignette = 1.0 - intensity * smoothstep(inner, outer, edge);
			return dVignette;
		}
		fn applyVignette(color: vec3f, uv: vec2f) -> vec3f {
			return mix(uniform.vignetteColor, color, calcVignette(uv));
		}
	#endif
`

var composeFringingPS = `
	#ifdef FRINGING
		uniform fringingIntensity: f32;
		fn applyFringing(color: vec3f, uv: vec2f) -> vec3f {
			let centerDistance = uv - 0.5;
			let offset = uniform.fringingIntensity * centerDistance * centerDistance;
			var colorOut = color;
			colorOut.r = textureSample(sceneTexture, sceneTextureSampler, uv - offset).r;
			colorOut.b = textureSample(sceneTexture, sceneTextureSampler, uv + offset).b;
			return colorOut;
		}
	#endif
`

var composeCasPS = `
	#ifdef CAS
		uniform sharpness: f32;
		#ifdef CAS_HDR
			fn maxComponent(x: f32, y: f32, z: f32) -> f32 { return max(x, max(y, z)); }
			fn toSDR(c: vec3f) -> vec3f { return c / (1.0 + maxComponent(c.r, c.g, c.b)); }
			fn toHDR(c: vec3f) -> vec3f { return c / max(1.0 - maxComponent(c.r, c.g, c.b), 1e-4); }
		#else
			fn toSDR(c: vec3f) -> vec3f { return c; }
			fn toHDR(c: vec3f) -> vec3f { return c; }
		#endif
		fn applyCas(color: vec3f, uv: vec2f, sharpness: f32) -> vec3f {
			let x = uniform.sceneTextureInvRes.x;
			let y = uniform.sceneTextureInvRes.y;
			let a: half3 = half3(toSDR(textureSampleLevel(sceneTexture, sceneTextureSampler, uv + vec2f(0.0, -y), 0.0).rgb));
			let b: half3 = half3(toSDR(textureSampleLevel(sceneTexture, sceneTextureSampler, uv + vec2f(-x, 0.0), 0.0).rgb));
			let c: half3 = half3(toSDR(color.rgb));
			let d: half3 = half3(toSDR(textureSampleLevel(sceneTexture, sceneTextureSampler, uv + vec2f(x, 0.0), 0.0).rgb));
			let e: half3 = half3(toSDR(textureSampleLevel(sceneTexture, sceneTextureSampler, uv + vec2f(0.0, y), 0.0).rgb));
			let min_g = min(a.g, min(b.g, min(c.g, min(d.g, e.g))));
			let max_g = max(a.g, max(b.g, max(c.g, max(d.g, e.g))));
			let sharpening_amount = sqrt(min(half(1.0) - max_g, min_g) / max(max_g, half(1e-4)));
			let w = sharpening_amount * half(sharpness);
			var res = (w * (a + b + d + e) + c) / (half(4.0) * w + half(1.0));
			res = max(res, half3(0.0));
			return toHDR(vec3f(res));
		}
	#endif
`

var composeColorLutPS = `
	#ifdef COLOR_LUT
		var colorLUT: texture_2d<f32>;
		var colorLUTSampler: sampler;
		uniform colorLUTParams: vec4f;
		fn applyColorLUT(color: vec3f) -> vec3f {
			var c: vec3f = clamp(color, vec3f(0.0), vec3f(1.0));
			let width: f32 = uniform.colorLUTParams.x;
			let height: f32 = uniform.colorLUTParams.y;
			let maxColor: f32 = uniform.colorLUTParams.z;
			let cell: f32 = c.b * maxColor;
			let cell_l: f32 = floor(cell);
			let cell_h: f32 = ceil(cell);
			let half_px_x: f32 = 0.5 / width;
			let half_px_y: f32 = 0.5 / height;
			let r_offset: f32 = half_px_x + c.r / height * (maxColor / height);
			let g_offset: f32 = half_px_y + c.g * (maxColor / height);
			let uv_l: vec2f = vec2f(cell_l / height + r_offset, g_offset);
			let uv_h: vec2f = vec2f(cell_h / height + r_offset, g_offset);
			let color_l: vec3f = textureSampleLevel(colorLUT, colorLUTSampler, uv_l, 0.0).rgb;
			let color_h: vec3f = textureSampleLevel(colorLUT, colorLUTSampler, uv_h, 0.0).rgb;
			let lutColor: vec3f = mix(color_l, color_h, fract(cell));
			return mix(color, lutColor, uniform.colorLUTParams.w);
		}
	#endif
`

const composeChunksWGSL = {
    composePS,
    composeBloomPS,
    composeDofPS,
    composeSsaoPS,
    composeGradingPS,
    composeColorEnhancePS,
    composeVignettePS,
    composeFringingPS,
    composeCasPS,
    composeColorLutPS,
    composeDeclarationsPS: '',
    composeMainStartPS: '',
    composeMainEndPS: '',
}

class RenderPassCompose extends RenderPassShaderQuad {
    set debug(value) {
        if (this._debug !== value) {
            this._debug = value
            this._shaderDirty = true
        }
    }
    get debug() {
        return this._debug
    }
    set colorLUT(value) {
        if (this._colorLUT !== value) {
            this._colorLUT = value
            this._shaderDirty = true
        }
    }
    get colorLUT() {
        return this._colorLUT
    }
    set bloomTexture(value) {
        if (this._bloomTexture !== value) {
            this._bloomTexture = value
            this._shaderDirty = true
        }
    }
    get bloomTexture() {
        return this._bloomTexture
    }
    set cocTexture(value) {
        if (this._cocTexture !== value) {
            this._cocTexture = value
            this._shaderDirty = true
        }
    }
    get cocTexture() {
        return this._cocTexture
    }
    set ssaoTexture(value) {
        if (this._ssaoTexture !== value) {
            this._ssaoTexture = value
            this._shaderDirty = true
        }
    }
    get ssaoTexture() {
        return this._ssaoTexture
    }
    set taaEnabled(value) {
        if (this._taaEnabled !== value) {
            this._taaEnabled = value
            this._shaderDirty = true
        }
    }
    get taaEnabled() {
        return this._taaEnabled
    }
    set gradingEnabled(value) {
        if (this._gradingEnabled !== value) {
            this._gradingEnabled = value
            this._shaderDirty = true
        }
    }
    get gradingEnabled() {
        return this._gradingEnabled
    }
    set vignetteEnabled(value) {
        if (this._vignetteEnabled !== value) {
            this._vignetteEnabled = value
            this._shaderDirty = true
        }
    }
    get vignetteEnabled() {
        return this._vignetteEnabled
    }
    set fringingEnabled(value) {
        if (this._fringingEnabled !== value) {
            this._fringingEnabled = value
            this._shaderDirty = true
        }
    }
    get fringingEnabled() {
        return this._fringingEnabled
    }
    set colorEnhanceEnabled(value) {
        if (this._colorEnhanceEnabled !== value) {
            this._colorEnhanceEnabled = value
            this._shaderDirty = true
        }
    }
    get colorEnhanceEnabled() {
        return this._colorEnhanceEnabled
    }
    set toneMapping(value) {
        if (this._toneMapping !== value) {
            this._toneMapping = value
            this._shaderDirty = true
        }
    }
    get toneMapping() {
        return this._toneMapping
    }
    set sharpness(value) {
        if (this._sharpness !== value) {
            this._sharpness = value
            this._shaderDirty = true
        }
    }
    get sharpness() {
        return this._sharpness
    }
    get isSharpnessEnabled() {
        return this._sharpness > 0
    }
    set hdrScene(value) {
        if (this._hdrScene !== value) {
            this._hdrScene = value
            this._shaderDirty = true
        }
    }
    get hdrScene() {
        return this._hdrScene
    }
    postInit() {
        this.setClearColor(Color.BLACK)
        this.setClearDepth(1.0)
        this.setClearStencil(0)
    }
    frameUpdate() {
        const rt = this.renderTarget ?? this.device.backBuffer
        const srgb = rt.isColorBufferSrgb(0)
        const neededGammaCorrection = srgb ? GAMMA_NONE : GAMMA_SRGB
        if (this._gammaCorrection !== neededGammaCorrection) {
            this._gammaCorrection = neededGammaCorrection
            this._shaderDirty = true
        }
        const shaderChunks = ShaderChunks.get(
            this.device,
            this.device.isWebGPU ? SHADERLANGUAGE_WGSL : SHADERLANGUAGE_GLSL,
        )
        for (const [name, prevValue] of this._customComposeChunks.entries()) {
            const currentValue = shaderChunks.get(name)
            if (currentValue !== prevValue) {
                this._customComposeChunks.set(name, currentValue)
                this._shaderDirty = true
            }
        }
        if (this._shaderDirty) {
            this._shaderDirty = false
            const gammaCorrectionName = gammaNames[this._gammaCorrection]
            const customChunks = this._customComposeChunks
            const declHash = hashCode(customChunks.get('composeDeclarationsPS') ?? '')
            const startHash = hashCode(customChunks.get('composeMainStartPS') ?? '')
            const endHash = hashCode(customChunks.get('composeMainEndPS') ?? '')
            const key =
                `${this.toneMapping}` +
                `-${gammaCorrectionName}` +
                `-${this.bloomTexture ? 'bloom' : 'nobloom'}` +
                `-${this.cocTexture ? 'dof' : 'nodof'}` +
                `-${this.blurTextureUpscale ? 'dofupscale' : ''}` +
                `-${this.ssaoTexture ? 'ssao' : 'nossao'}` +
                `-${this.gradingEnabled ? 'grading' : 'nograding'}` +
                `-${this.colorEnhanceEnabled ? 'colorenhance' : 'nocolorenhance'}` +
                `-${this.colorLUT ? 'colorlut' : 'nocolorlut'}` +
                `-${this.vignetteEnabled ? 'vignette' : 'novignette'}` +
                `-${this.fringingEnabled ? 'fringing' : 'nofringing'}` +
                `-${this.taaEnabled ? 'taa' : 'notaa'}` +
                `-${this.isSharpnessEnabled ? (this._hdrScene ? 'cashdr' : 'cas') : 'nocas'}` +
                `-${this._debug ?? ''}` +
                `-decl${declHash}-start${startHash}-end${endHash}`
            if (this._key !== key) {
                this._key = key
                const defines = new Map()
                defines.set('TONEMAP', tonemapNames[this.toneMapping])
                defines.set('GAMMA', gammaCorrectionName)
                if (this.bloomTexture) defines.set('BLOOM', true)
                if (this.cocTexture) defines.set('DOF', true)
                if (this.blurTextureUpscale) defines.set('DOF_UPSCALE', true)
                if (this.ssaoTexture) defines.set('SSAO', true)
                if (this.gradingEnabled) defines.set('GRADING', true)
                if (this.colorEnhanceEnabled) defines.set('COLOR_ENHANCE', true)
                if (this.colorLUT) defines.set('COLOR_LUT', true)
                if (this.vignetteEnabled) defines.set('VIGNETTE', true)
                if (this.fringingEnabled) defines.set('FRINGING', true)
                if (this.taaEnabled) defines.set('TAA', true)
                if (this.isSharpnessEnabled) {
                    defines.set('CAS', true)
                    if (this._hdrScene) defines.set('CAS_HDR', true)
                }
                if (this._debug) defines.set('DEBUG_COMPOSE', this._debug)
                const includes = new Map(shaderChunks)
                this.shader = ShaderUtils.createShader(this.device, {
                    uniqueName: `ComposeShader-${key}`,
                    attributes: {
                        aPosition: SEMANTIC_POSITION,
                    },
                    vertexChunk: 'quadVS',
                    fragmentChunk: 'composePS',
                    fragmentDefines: defines,
                    fragmentIncludes: includes,
                })
            }
        }
    }
    execute() {
        const sceneTex = this.sceneTexture
        this.sceneTextureId.setValue(sceneTex)
        this.sceneTextureInvResValue[0] = 1.0 / sceneTex.width
        this.sceneTextureInvResValue[1] = 1.0 / sceneTex.height
        this.sceneTextureInvResId.setValue(this.sceneTextureInvResValue)
        if (this._bloomTexture) {
            this.bloomTextureId.setValue(this._bloomTexture)
            this.bloomIntensityId.setValue(this.bloomIntensity)
        }
        if (this._cocTexture) {
            this.cocTextureId.setValue(this._cocTexture)
            this.blurTextureId.setValue(this.blurTexture)
        }
        if (this._ssaoTexture) {
            this.ssaoTextureId.setValue(this._ssaoTexture)
        }
        if (this._gradingEnabled) {
            this.bcsId.setValue([this.gradingBrightness, this.gradingContrast, this.gradingSaturation])
            this.tintId.setValue([this.gradingTint.r, this.gradingTint.g, this.gradingTint.b])
        }
        if (this._colorEnhanceEnabled) {
            this.colorEnhanceParamsId.setValue([
                this.colorEnhanceShadows,
                this.colorEnhanceHighlights,
                this.colorEnhanceVibrance,
                this.colorEnhanceDehaze,
            ])
            this.colorEnhanceMidtonesId.setValue(this.colorEnhanceMidtones)
        }
        const lutTexture = this._colorLUT
        if (lutTexture) {
            this.colorLUTParams[0] = lutTexture.width
            this.colorLUTParams[1] = lutTexture.height
            this.colorLUTParams[2] = lutTexture.height - 1.0
            this.colorLUTParams[3] = this.colorLUTIntensity
            this.colorLUTParamsId.setValue(this.colorLUTParams)
            this.colorLUTId.setValue(lutTexture)
        }
        if (this._vignetteEnabled) {
            this.vignetterParamsId.setValue([
                this.vignetteInner,
                this.vignetteOuter,
                this.vignetteCurvature,
                this.vignetteIntensity,
            ])
            this.vignetteColorId.setValue([this.vignetteColor.r, this.vignetteColor.g, this.vignetteColor.b])
        }
        if (this._fringingEnabled) {
            this.fringingIntensityId.setValue(this.fringingIntensity / 1024)
        }
        if (this.isSharpnessEnabled) {
            this.sharpnessId.setValue(math.lerp(-0.125, -0.2, this.sharpness))
        }
        super.execute()
    }
    constructor(graphicsDevice) {
        ;(super(graphicsDevice),
            (this.sceneTexture = null),
            (this.bloomIntensity = 0.01),
            (this._bloomTexture = null),
            (this._cocTexture = null),
            (this.blurTexture = null),
            (this.blurTextureUpscale = false),
            (this._ssaoTexture = null),
            (this._toneMapping = TONEMAP_LINEAR),
            (this._gradingEnabled = false),
            (this.gradingSaturation = 1),
            (this.gradingContrast = 1),
            (this.gradingBrightness = 1),
            (this.gradingTint = new Color(1, 1, 1, 1)),
            (this._shaderDirty = true),
            (this._vignetteEnabled = false),
            (this.vignetteInner = 0.5),
            (this.vignetteOuter = 1.0),
            (this.vignetteCurvature = 0.5),
            (this.vignetteIntensity = 0.3),
            (this.vignetteColor = new Color(0, 0, 0)),
            (this._fringingEnabled = false),
            (this.fringingIntensity = 10),
            (this._colorEnhanceEnabled = false),
            (this.colorEnhanceShadows = 0),
            (this.colorEnhanceHighlights = 0),
            (this.colorEnhanceVibrance = 0),
            (this.colorEnhanceDehaze = 0),
            (this.colorEnhanceMidtones = 0),
            (this._taaEnabled = false),
            (this._hdrScene = true),
            (this._sharpness = 0.5),
            (this._gammaCorrection = GAMMA_SRGB),
            (this._colorLUT = null),
            (this.colorLUTIntensity = 1),
            (this._key = ''),
            (this._debug = null),
            (this._customComposeChunks = new Map([
                ['composeDeclarationsPS', ''],
                ['composeMainStartPS', ''],
                ['composeMainEndPS', ''],
            ])))
        ShaderChunks.get(graphicsDevice, SHADERLANGUAGE_GLSL).add(composeChunksGLSL, false)
        ShaderChunks.get(graphicsDevice, SHADERLANGUAGE_WGSL).add(composeChunksWGSL, false)
        const { scope } = graphicsDevice
        this.sceneTextureId = scope.resolve('sceneTexture')
        this.bloomTextureId = scope.resolve('bloomTexture')
        this.cocTextureId = scope.resolve('cocTexture')
        this.ssaoTextureId = scope.resolve('ssaoTexture')
        this.blurTextureId = scope.resolve('blurTexture')
        this.bloomIntensityId = scope.resolve('bloomIntensity')
        this.bcsId = scope.resolve('brightnessContrastSaturation')
        this.tintId = scope.resolve('tint')
        this.vignetterParamsId = scope.resolve('vignetterParams')
        this.vignetteColorId = scope.resolve('vignetteColor')
        this.fringingIntensityId = scope.resolve('fringingIntensity')
        this.sceneTextureInvResId = scope.resolve('sceneTextureInvRes')
        this.sceneTextureInvResValue = new Float32Array(2)
        this.sharpnessId = scope.resolve('sharpness')
        this.colorLUTId = scope.resolve('colorLUT')
        this.colorLUTParams = new Float32Array(4)
        this.colorLUTParamsId = scope.resolve('colorLUTParams')
        this.colorEnhanceParamsId = scope.resolve('colorEnhanceParams')
        this.colorEnhanceMidtonesId = scope.resolve('colorEnhanceMidtones')
    }
}

var glslSampleCatmullRomPS = `
vec4 SampleTextureCatmullRom(TEXTURE_ACCEPT(tex), vec2 uv, vec2 texSize) {
	vec2 samplePos = uv * texSize;
	vec2 texPos1 = floor(samplePos - 0.5) + 0.5;
	vec2 f = samplePos - texPos1;
	vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
	vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
	vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
	vec2 w3 = f * f * (-0.5 + 0.5 * f);
	vec2 w12 = w1 + w2;
	vec2 offset12 = w2 / (w1 + w2);
	vec2 texPos0 = (texPos1 - 1.0) / texSize;
	vec2 texPos3 = (texPos1 + 2.0) / texSize;
	vec2 texPos12 = (texPos1 + offset12) / texSize;
	vec4 result = vec4(0.0);
	result += texture2DLod(tex, vec2(texPos0.x, texPos0.y), 0.0) * w0.x * w0.y;
	result += texture2DLod(tex, vec2(texPos12.x, texPos0.y), 0.0) * w12.x * w0.y;
	result += texture2DLod(tex, vec2(texPos3.x, texPos0.y), 0.0) * w3.x * w0.y;
	result += texture2DLod(tex, vec2(texPos0.x, texPos12.y), 0.0) * w0.x * w12.y;
	result += texture2DLod(tex, vec2(texPos12.x, texPos12.y), 0.0) * w12.x * w12.y;
	result += texture2DLod(tex, vec2(texPos3.x, texPos12.y), 0.0) * w3.x * w12.y;
	result += texture2DLod(tex, vec2(texPos0.x, texPos3.y), 0.0) * w0.x * w3.y;
	result += texture2DLod(tex, vec2(texPos12.x, texPos3.y), 0.0) * w12.x * w3.y;
	result += texture2DLod(tex, vec2(texPos3.x, texPos3.y), 0.0) * w3.x * w3.y;
	return result;
}
`

var wgslSampleCatmullRomPS = `
fn SampleTextureCatmullRom(tex: texture_2d<f32>, texSampler: sampler, uv: vec2f, texSize: vec2f) -> vec4f {
	let samplePos: vec2f = uv * texSize;
	let texPos1: vec2f = floor(samplePos - 0.5) + 0.5;
	let f: vec2f = samplePos - texPos1;
	let w0: vec2f = f * (-0.5 + f * (1.0 - 0.5 * f));
	let w1: vec2f = 1.0 + f * f * (-2.5 + 1.5 * f);
	let w2: vec2f = f * (0.5 + f * (2.0 - 1.5 * f));
	let w3: vec2f = f * f * (-0.5 + 0.5 * f);
	let w12: vec2f = w1 + w2;
	let offset12: vec2f = w2 / w12;
	let texPos0: vec2f = (texPos1 - 1.0) / texSize;
	let texPos3: vec2f = (texPos1 + 2.0) / texSize;
	let texPos12: vec2f = (texPos1 + offset12) / texSize;
	var result: vec4f = vec4f(0.0);
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos0.x, texPos0.y), 0.0) * w0.x * w0.y;
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos12.x, texPos0.y), 0.0) * w12.x * w0.y;
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos3.x, texPos0.y), 0.0) * w3.x * w0.y;
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos0.x, texPos12.y), 0.0) * w0.x * w12.y;
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos12.x, texPos12.y), 0.0) * w12.x * w12.y;
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos3.x, texPos12.y), 0.0) * w3.x * w12.y;
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos0.x, texPos3.y), 0.0) * w0.x * w3.y;
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos12.x, texPos3.y), 0.0) * w12.x * w3.y;
	result = result + textureSampleLevel(tex, texSampler, vec2f(texPos3.x, texPos3.y), 0.0) * w3.x * w3.y;
	return result;
}
`

var glsltaaResolvePS = `
	#include  "sampleCatmullRomPS"
	#include  "screenDepthPS"
	uniform sampler2D sourceTexture;
	uniform sampler2D historyTexture;
	uniform mat4 matrix_viewProjectionPrevious;
	uniform mat4 matrix_viewProjectionInverse;
	uniform vec4 jitters;
	uniform vec2 textureSize;
	varying vec2 uv0;
	vec2 reproject(vec2 uv, float depth) {
		depth = depth * 2.0 - 1.0;
		vec4 ndc = vec4(uv * 2.0 - 1.0, depth, 1.0);
		ndc.xy -= jitters.xy;
		vec4 worldPosition = matrix_viewProjectionInverse * ndc;
		worldPosition /= worldPosition.w;
		vec4 screenPrevious = matrix_viewProjectionPrevious * worldPosition;
		return (screenPrevious.xy / screenPrevious.w) * 0.5 + 0.5;
	}
	vec4 colorClamp(vec2 uv, vec4 historyColor) {
		vec3 minColor = vec3(9999.0);
		vec3 maxColor = vec3(-9999.0);
		for(float x = -1.0; x <= 1.0; ++x) {
			for(float y = -1.0; y <= 1.0; ++y) {
				vec3 color = texture2D(sourceTexture, uv + vec2(x, y) / textureSize).rgb;
				minColor = min(minColor, color);
				maxColor = max(maxColor, color);
			}
		}
		vec3 clamped = clamp(historyColor.rgb, minColor, maxColor);
		return vec4(clamped, historyColor.a);
	}
	void main()
	{
		vec4 srcColor = texture2D(sourceTexture, uv0);
		float linearDepth = getLinearScreenDepth(uv0);
		float depth = delinearizeDepth(linearDepth);
		vec2 historyUv = reproject(uv0, depth);
		#ifdef QUALITY_HIGH
			vec4 historyColor = SampleTextureCatmullRom(TEXTURE_PASS(historyTexture), historyUv, textureSize);
		#else
			vec4 historyColor = texture2D(historyTexture, historyUv);
		#endif
		vec4 historyColorClamped = colorClamp(uv0, historyColor);
		float mixFactor = (historyUv.x < 0.0 || historyUv.x > 1.0 || historyUv.y < 0.0 || historyUv.y > 1.0) ?
			1.0 : 0.05;
		gl_FragColor = mix(historyColorClamped, srcColor, mixFactor);
	}
`

var wgsltaaResolvePS = `
	#include "sampleCatmullRomPS"
	#include "screenDepthPS"
	var sourceTexture: texture_2d<f32>;
	var sourceTextureSampler: sampler;
	var historyTexture: texture_2d<f32>;
	var historyTextureSampler: sampler;
	uniform matrix_viewProjectionPrevious: mat4x4f;
	uniform matrix_viewProjectionInverse: mat4x4f;
	uniform jitters: vec4f;
	uniform textureSize: vec2f;
	varying uv0: vec2f;
	fn reproject(uv_in: vec2f, depth: f32) -> vec2f {
		var uv = vec2f(uv_in.x, 1.0 - uv_in.y);
		var ndc = vec4f(uv * 2.0 - 1.0, depth, 1.0);
		ndc = vec4f(ndc.xy - uniform.jitters.xy, ndc.zw);
		var worldPosition = uniform.matrix_viewProjectionInverse * ndc;
		worldPosition = worldPosition / worldPosition.w;
		let screenPrevious = uniform.matrix_viewProjectionPrevious * worldPosition;
		var result = (screenPrevious.xy / screenPrevious.w) * 0.5 + 0.5;
		result.y = 1.0 - result.y;
		return result;
	}
	fn colorClamp(uv: vec2f, historyColor: vec4f) -> vec4f {
		var minColor = vec3f(9999.0);
		var maxColor = vec3f(-9999.0);
		for (var ix: i32 = -1; ix <= 1; ix = ix + 1) {
			for (var iy: i32 = -1; iy <= 1; iy = iy + 1) {
				let color_sample = textureSample(sourceTexture, sourceTextureSampler, uv + vec2f(f32(ix), f32(iy)) / uniform.textureSize).rgb;
				minColor = min(minColor, color_sample);
				maxColor = max(maxColor, color_sample);
			}
		}
		let clamped = clamp(historyColor.rgb, minColor, maxColor);
		return vec4f(clamped, historyColor.a);
	}
	@fragment
	fn fragmentMain(input: FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		let srcColor = textureSample(sourceTexture, sourceTextureSampler, uv0);
		let linearDepth = getLinearScreenDepth(uv0);
		let depth = delinearizeDepth(linearDepth);
		let historyUv = reproject(uv0, depth);
		#ifdef QUALITY_HIGH
			var historyColor: vec4f = SampleTextureCatmullRom(historyTexture, historyTextureSampler, historyUv, uniform.textureSize);
		#else
			var historyColor: vec4f = textureSample(historyTexture, historyTextureSampler, historyUv);
		#endif
		let historyColorClamped = colorClamp(uv0, historyColor);
		let mixFactor_condition = historyUv.x < 0.0 || historyUv.x > 1.0 || historyUv.y < 0.0 || historyUv.y > 1.0;
		let mixFactor = select(0.05, 1.0, mixFactor_condition);
		output.color = mix(historyColorClamped, srcColor, mixFactor);
		return output;
	}
`
class RenderPassTAA extends RenderPassShaderQuad {
    destroy() {
        if (this.renderTarget) {
            this.renderTarget.destroyTextureBuffers()
            this.renderTarget.destroy()
            this.renderTarget = null
        }
    }
    setup() {
        for (let i = 0; i < 2; ++i) {
            this.historyTextures[i] = new Texture(this.device, {
                name: `TAA-History-${i}`,
                width: 4,
                height: 4,
                format: this.sourceTexture.format,
                mipmaps: false,
                minFilter: FILTER_LINEAR,
                magFilter: FILTER_LINEAR,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
            })
            this.historyRenderTargets[i] = new RenderTarget({
                colorBuffer: this.historyTextures[i],
                depth: false,
            })
        }
        this.historyTexture = this.historyTextures[0]
        this.init(this.historyRenderTargets[0], {
            resizeSource: this.sourceTexture,
        })
    }
    before() {
        this.sourceTextureId.setValue(this.sourceTexture)
        this.historyTextureId.setValue(this.historyTextures[1 - this.historyIndex])
        this.textureSize[0] = this.sourceTexture.width
        this.textureSize[1] = this.sourceTexture.height
        this.textureSizeId.setValue(this.textureSize)
        const camera = this.cameraComponent.camera
        this.viewProjPrevId.setValue(camera._viewProjPrevious.data)
        this.viewProjInvId.setValue(camera._viewProjInverse.data)
        this.jittersId.setValue(camera._jitters)
        this.cameraParamsId.setValue(camera.fillShaderParams(this.cameraParams))
    }
    update() {
        this.historyIndex = 1 - this.historyIndex
        this.historyTexture = this.historyTextures[this.historyIndex]
        this.renderTarget = this.historyRenderTargets[this.historyIndex]
        return this.historyTexture
    }
    constructor(device, sourceTexture, cameraComponent) {
        ;(super(device),
            (this.historyIndex = 0),
            (this.historyTexture = null),
            (this.historyTextures = []),
            (this.historyRenderTargets = []))
        this.sourceTexture = sourceTexture
        this.cameraComponent = cameraComponent
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('sampleCatmullRomPS', glslSampleCatmullRomPS)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('sampleCatmullRomPS', wgslSampleCatmullRomPS)
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('taaResolvePS', glsltaaResolvePS)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('taaResolvePS', wgsltaaResolvePS)
        const defines = new Map()
        defines.set('QUALITY_HIGH', true)
        ShaderUtils.addScreenDepthChunkDefines(device, cameraComponent.shaderParams, defines)
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'TaaResolveShader',
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
            vertexChunk: 'quadVS',
            fragmentChunk: 'taaResolvePS',
            fragmentDefines: defines,
        })
        const { scope } = device
        this.sourceTextureId = scope.resolve('sourceTexture')
        this.textureSizeId = scope.resolve('textureSize')
        this.textureSize = new Float32Array(2)
        this.historyTextureId = scope.resolve('historyTexture')
        this.viewProjPrevId = scope.resolve('matrix_viewProjectionPrevious')
        this.viewProjInvId = scope.resolve('matrix_viewProjectionInverse')
        this.jittersId = scope.resolve('jitters')
        this.cameraParams = new Float32Array(4)
        this.cameraParamsId = scope.resolve('camera_params')
        this.setup()
    }
}

var glslCocPS = `
	#include "screenDepthPS"
	varying vec2 uv0;
	uniform vec3 params;
	void main()
	{
		float depth = getLinearScreenDepth(uv0);
		float focusDistance = params.x;
		float focusRange = params.y;
		float invRange = params.z;
		float farRange = focusDistance + focusRange * 0.5;
		
		float cocFar = min((depth - farRange) * invRange, 1.0);
		#ifdef NEAR_BLUR
			float nearRange = focusDistance - focusRange * 0.5;
			float cocNear = min((nearRange - depth) * invRange, 1.0);
		#else
			float cocNear = 0.0;
		#endif
		gl_FragColor = vec4(cocFar, cocNear, 0.0, 0.0);
	}
`

var wgslCocPS = `
#include "screenDepthPS"
varying uv0: vec2f;
uniform params: vec3f;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	var output: FragmentOutput;
	let depth: f32 = getLinearScreenDepth(uv0);
	let focusDistance: f32 = uniform.params.x;
	let focusRange: f32 = uniform.params.y;
	let invRange: f32 = uniform.params.z;
	let farRange: f32 = focusDistance + focusRange * 0.5;
	let cocFar: f32 = min((depth - farRange) * invRange, 1.0);
	#ifdef NEAR_BLUR
		let nearRange: f32 = focusDistance - focusRange * 0.5;
		var cocNear: f32 = min((nearRange - depth) * invRange, 1.0);
	#else
		var cocNear: f32 = 0.0;
	#endif
	output.color = vec4f(cocFar, cocNear, 0.0, 0.0);
	return output;
}
`

class RenderPassCoC extends RenderPassShaderQuad {
    execute() {
        const { paramsValue, focusRange } = this
        paramsValue[0] = this.focusDistance + 0.001
        paramsValue[1] = focusRange
        paramsValue[2] = 1 / focusRange
        this.paramsId.setValue(paramsValue)
        const camera = this.cameraComponent.camera
        this.cameraParamsId.setValue(camera.fillShaderParams(this.cameraParams))
        super.execute()
    }
    constructor(device, cameraComponent, nearBlur) {
        super(device)
        this.cameraComponent = cameraComponent
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('cocPS', glslCocPS)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('cocPS', wgslCocPS)
        const defines = new Map()
        if (nearBlur) defines.set('NEAR_BLUR', '')
        ShaderUtils.addScreenDepthChunkDefines(device, cameraComponent.shaderParams, defines)
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: `CocShader-${nearBlur}`,
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
            vertexChunk: 'quadVS',
            fragmentChunk: 'cocPS',
            fragmentDefines: defines,
        })
        this.paramsId = device.scope.resolve('params')
        this.paramsValue = new Float32Array(3)
        this.cameraParams = new Float32Array(4)
        this.cameraParamsId = device.scope.resolve('camera_params')
    }
}

var glsldofBlurPS = `
	#if defined(NEAR_BLUR)
		uniform sampler2D nearTexture;
	#endif
	uniform sampler2D farTexture;
	uniform sampler2D cocTexture;
	uniform vec2 kernel[{KERNEL_COUNT}];
	uniform float blurRadiusNear;
	uniform float blurRadiusFar;
	varying vec2 uv0;
	void main()
	{
		vec2 coc = texture2D(cocTexture, uv0).rg;
		float cocFar = coc.r;
		vec3 sum = vec3(0.0, 0.0, 0.0);
		#if defined(NEAR_BLUR)
			float cocNear = coc.g;
			if (cocNear > 0.0001) {
				ivec2 nearTextureSize = textureSize(nearTexture, 0);
				vec2 step = cocNear * blurRadiusNear / vec2(nearTextureSize);
				for (int i = 0; i < {KERNEL_COUNT}; i++) {
					vec2 uv = uv0 + step * kernel[i];
					vec3 tap = texture2DLod(nearTexture, uv, 0.0).rgb;
					sum += tap.rgb;
				}
				sum *= float({INV_KERNEL_COUNT});
			} else
		#endif
			
			if (cocFar > 0.0001) {
			ivec2 farTextureSize = textureSize(farTexture, 0);
			vec2 step = cocFar * blurRadiusFar / vec2(farTextureSize);
			float sumCoC = 0.0; 
			for (int i = 0; i < {KERNEL_COUNT}; i++) {
				vec2 uv = uv0 + step * kernel[i];
				vec3 tap = texture2DLod(farTexture, uv, 0.0).rgb;
				float cocThis = texture2DLod(cocTexture, uv, 0.0).r;
				tap *= cocThis;
				sumCoC += cocThis;
				sum += tap;
			}
			if (sumCoC > 0.0)
				sum /= sumCoC;
			sum /= cocFar;
		}
		pcFragColor0 = vec4(sum, 1.0);
	}
`

var wgsldofBlurPS = `
#if defined(NEAR_BLUR)
	var nearTexture: texture_2d<f32>;
	var nearTextureSampler: sampler;
#endif
var farTexture: texture_2d<f32>;
var farTextureSampler: sampler;
var cocTexture: texture_2d<f32>;
var cocTextureSampler: sampler;
uniform kernel: array<vec2f, {KERNEL_COUNT}>;
uniform blurRadiusNear: f32;
uniform blurRadiusFar: f32;
varying uv0: vec2f;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	var output: FragmentOutput;
	let coc: vec2f = textureSample(cocTexture, cocTextureSampler, input.uv0).rg;
	let cocFar: f32 = coc.r;
	var sum: vec3f = vec3f(0.0, 0.0, 0.0);
	#if defined(NEAR_BLUR)
		let cocNear: f32 = coc.g;
		if (cocNear > 0.0001) {
			let nearTextureSize: vec2f = vec2f(textureDimensions(nearTexture, 0));
			let step: vec2f = cocNear * uniform.blurRadiusNear / nearTextureSize;
			for (var i: i32 = 0; i < {KERNEL_COUNT}; i = i + 1) {
				let uv: vec2f = uv0 + step * uniform.kernel[i].element;
				let tap: vec3f = textureSampleLevel(nearTexture, nearTextureSampler, uv, 0.0).rgb;
				sum = sum + tap;
			}
			sum = sum * f32({INV_KERNEL_COUNT});
		} else
	#endif
		if (cocFar > 0.0001) {
			let farTextureSize: vec2f = vec2f(textureDimensions(farTexture, 0));
			let step: vec2f = cocFar * uniform.blurRadiusFar / farTextureSize;
			var sumCoC: f32 = 0.0;
			for (var i: i32 = 0; i < {KERNEL_COUNT}; i = i + 1) {
				let uv: vec2f = uv0 + step * uniform.kernel[i].element;
				var tap: vec3f = textureSampleLevel(farTexture, farTextureSampler, uv, 0.0).rgb;
				let cocThis: f32 = textureSampleLevel(cocTexture, cocTextureSampler, uv, 0.0).r;
				tap = tap * cocThis;
				sumCoC = sumCoC + cocThis;
				sum = sum + tap;
			}
			if (sumCoC > 0.0) {
				sum = sum / sumCoC;
			}
			sum = sum / cocFar;
		}
	output.color = vec4f(sum, 1.0);
	return output;
}
`

class RenderPassDofBlur extends RenderPassShaderQuad {
    set blurRings(value) {
        if (this._blurRings !== value) {
            this._blurRings = value
            this.shader = null
        }
    }
    get blurRings() {
        return this._blurRings
    }
    set blurRingPoints(value) {
        if (this._blurRingPoints !== value) {
            this._blurRingPoints = value
            this.shader = null
        }
    }
    get blurRingPoints() {
        return this._blurRingPoints
    }
    createShader() {
        this.kernel = new Float32Array(Kernel.concentric(this.blurRings, this.blurRingPoints))
        const kernelCount = this.kernel.length >> 1
        const nearBlur = this.nearTexture !== null
        const defines = new Map()
        defines.set('{KERNEL_COUNT}', kernelCount)
        defines.set('{INV_KERNEL_COUNT}', 1.0 / kernelCount)
        if (nearBlur) defines.set('NEAR_BLUR', '')
        this.shader = ShaderUtils.createShader(this.device, {
            uniqueName: `DofBlurShader-${kernelCount}-${nearBlur ? 'nearBlur' : 'noNearBlur'}`,
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
            vertexChunk: 'quadVS',
            fragmentChunk: 'dofBlurPS',
            fragmentDefines: defines,
        })
    }
    execute() {
        if (!this.shader) {
            this.createShader()
        }
        this.nearTextureId.setValue(this.nearTexture)
        this.farTextureId.setValue(this.farTexture)
        this.cocTextureId.setValue(this.cocTexture)
        this.kernelId.setValue(this.kernel)
        this.kernelCountId.setValue(this.kernel.length >> 1)
        this.blurRadiusNearId.setValue(this.blurRadiusNear)
        this.blurRadiusFarId.setValue(this.blurRadiusFar)
        super.execute()
    }
    constructor(device, nearTexture, farTexture, cocTexture) {
        ;(super(device),
            (this.blurRadiusNear = 1),
            (this.blurRadiusFar = 1),
            (this._blurRings = 3),
            (this._blurRingPoints = 3))
        this.nearTexture = nearTexture
        this.farTexture = farTexture
        this.cocTexture = cocTexture
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('dofBlurPS', glsldofBlurPS)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('dofBlurPS', wgsldofBlurPS)
        const { scope } = device
        this.kernelId = scope.resolve('kernel[0]')
        this.kernelCountId = scope.resolve('kernelCount')
        this.blurRadiusNearId = scope.resolve('blurRadiusNear')
        this.blurRadiusFarId = scope.resolve('blurRadiusFar')
        this.nearTextureId = scope.resolve('nearTexture')
        this.farTextureId = scope.resolve('farTexture')
        this.cocTextureId = scope.resolve('cocTexture')
    }
}

class RenderPassDof extends RenderPass {
    destroy() {
        this.destroyRenderPasses()
        this.cocPass = null
        this.farPass = null
        this.blurPass = null
        this.destroyRT(this.cocRT)
        this.destroyRT(this.farRt)
        this.destroyRT(this.blurRt)
        this.cocRT = null
        this.farRt = null
        this.blurRt = null
    }
    destroyRenderPasses() {
        for (let i = 0; i < this.beforePasses.length; i++) {
            this.beforePasses[i].destroy()
        }
        this.beforePasses.length = 0
    }
    destroyRT(rt) {
        if (rt) {
            rt.destroyTextureBuffers()
            rt.destroy()
        }
    }
    setupCocPass(device, cameraComponent, sourceTexture, nearBlur) {
        const format = nearBlur ? PIXELFORMAT_RG8 : PIXELFORMAT_R8
        this.cocRT = this.createRenderTarget('CoCTexture', format)
        this.cocTexture = this.cocRT.colorBuffer
        const cocPass = new RenderPassCoC(device, cameraComponent, nearBlur)
        cocPass.init(this.cocRT, {
            resizeSource: sourceTexture,
        })
        cocPass.setClearColor(Color.BLACK)
        return cocPass
    }
    setupFarPass(device, sourceTexture, scale) {
        this.farRt = this.createRenderTarget('FarDofTexture', sourceTexture.format)
        const farPass = new RenderPassDownsample(device, sourceTexture, {
            boxFilter: true,
            premultiplyTexture: this.cocTexture,
            premultiplySrcChannel: 'r',
        })
        farPass.init(this.farRt, {
            resizeSource: sourceTexture,
            scaleX: scale,
            scaleY: scale,
        })
        farPass.setClearColor(Color.BLACK)
        return farPass
    }
    setupBlurPass(device, nearTexture, nearBlur, scale) {
        const farTexture = this.farRt?.colorBuffer
        this.blurRt = this.createRenderTarget('DofBlurTexture', nearTexture.format)
        this.blurTexture = this.blurRt.colorBuffer
        const blurPass = new RenderPassDofBlur(device, nearBlur ? nearTexture : null, farTexture, this.cocTexture)
        blurPass.init(this.blurRt, {
            resizeSource: nearTexture,
            scaleX: scale,
            scaleY: scale,
        })
        blurPass.setClearColor(Color.BLACK)
        return blurPass
    }
    createTexture(name, format) {
        return new Texture(this.device, {
            name: name,
            width: 1,
            height: 1,
            format: format,
            mipmaps: false,
            minFilter: FILTER_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
        })
    }
    createRenderTarget(name, format) {
        return new RenderTarget({
            colorBuffer: this.createTexture(name, format),
            depth: false,
            stencil: false,
        })
    }
    frameUpdate() {
        super.frameUpdate()
        this.cocPass.focusDistance = this.focusDistance
        this.cocPass.focusRange = this.focusRange
        this.blurPass.blurRadiusNear = this.blurRadius
        this.blurPass.blurRadiusFar = this.blurRadius * (this.highQuality ? 1 : 0.5)
        this.blurPass.blurRings = this.blurRings
        this.blurPass.blurRingPoints = this.blurRingPoints
    }
    constructor(device, cameraComponent, sceneTexture, sceneTextureHalf, highQuality, nearBlur) {
        ;(super(device),
            (this.focusDistance = 100),
            (this.focusRange = 50),
            (this.blurRadius = 1),
            (this.blurRings = 3),
            (this.blurRingPoints = 3),
            (this.highQuality = true),
            (this.cocTexture = null),
            (this.blurTexture = null),
            (this.cocPass = null),
            (this.farPass = null),
            (this.blurPass = null))
        this.highQuality = highQuality
        this.cocPass = this.setupCocPass(device, cameraComponent, sceneTexture, nearBlur)
        this.beforePasses.push(this.cocPass)
        const sourceTexture = highQuality ? sceneTexture : sceneTextureHalf
        this.farPass = this.setupFarPass(device, sourceTexture, 0.5)
        this.beforePasses.push(this.farPass)
        this.blurPass = this.setupBlurPass(device, sceneTextureHalf, nearBlur, highQuality ? 2 : 0.5)
        this.beforePasses.push(this.blurPass)
    }
}

const tempMeshInstances = []
const DEPTH_UNIFORM_NAME = 'uSceneDepthMap'
class RenderPassPrepass extends RenderPass {
    destroy() {
        super.destroy()
        this.renderTarget?.destroy()
        this.renderTarget = null
        this.linearDepthTexture?.destroy()
        this.linearDepthTexture = null
        this.viewBindGroups.forEach((bg) => {
            bg.defaultUniformBuffer.destroy()
            bg.destroy()
        })
        this.viewBindGroups.length = 0
    }
    setupRenderTarget(options) {
        const { device } = this
        this.linearDepthFormat = device.textureFloatRenderable ? PIXELFORMAT_R32F : PIXELFORMAT_RGBA8
        this.linearDepthTexture = Texture.createDataTexture2D(
            device,
            'SceneLinearDepthTexture',
            1,
            1,
            this.linearDepthFormat,
        )
        const renderTarget = new RenderTarget({
            name: 'PrepassRT',
            colorBuffer: this.linearDepthTexture,
            depth: true,
            samples: 1,
        })
        this.camera.shaderParams.sceneDepthMapLinear = true
        this.init(renderTarget, options)
    }
    after() {
        this.device.scope.resolve(DEPTH_UNIFORM_NAME).setValue(this.linearDepthTexture)
    }
    execute() {
        const { renderer, scene, renderTarget } = this
        const camera = this.camera.camera
        const layers = scene.layers.layerList
        const subLayerEnabled = scene.layers.subLayerEnabled
        const isTransparent = scene.layers.subLayerList
        for (let i = 0; i < layers.length; i++) {
            const layer = layers[i]
            if (layer.id === LAYERID_DEPTH) {
                break
            }
            if (layer.enabled && subLayerEnabled[i]) {
                if (layer.camerasSet.has(camera)) {
                    const culledInstances = layer.getCulledInstances(camera)
                    const meshInstances = isTransparent[i] ? culledInstances.transparent : culledInstances.opaque
                    for (let j = 0; j < meshInstances.length; j++) {
                        const meshInstance = meshInstances[j]
                        if (meshInstance.material?.depthWrite) {
                            tempMeshInstances.push(meshInstance)
                        }
                    }
                    renderer.renderForwardLayer(
                        camera,
                        renderTarget,
                        null,
                        undefined,
                        SHADER_PREPASS,
                        this.viewBindGroups,
                        {
                            meshInstances: tempMeshInstances,
                        },
                    )
                    tempMeshInstances.length = 0
                }
            }
        }
    }
    frameUpdate() {
        super.frameUpdate()
        const { camera } = this
        this.setClearDepth(camera.clearDepthBuffer ? 1 : undefined)
        let clearValue
        if (camera.clearDepthBuffer) {
            const farClip = camera.farClip - Number.MIN_VALUE
            clearValue = this.linearDepthClearValue
            if (this.linearDepthFormat === PIXELFORMAT_R32F) {
                clearValue.r = farClip
            } else {
                FloatPacking.float2RGBA8(farClip, clearValue)
            }
        }
        this.setClearColor(clearValue)
    }
    constructor(device, scene, renderer, camera, options) {
        ;(super(device), (this.viewBindGroups = []), (this.linearDepthClearValue = new Color(0, 0, 0, 0)))
        this.scene = scene
        this.renderer = renderer
        this.camera = camera
        this.setupRenderTarget(options)
    }
}

var glslDepthAwareBlurPS = `
	#include "screenDepthPS"
	varying vec2 uv0;
	uniform sampler2D sourceTexture;
	uniform vec2 sourceInvResolution;
	uniform int filterSize;
	float random(const highp vec2 w) {
		const vec3 m = vec3(0.06711056, 0.00583715, 52.9829189);
		return fract(m.z * fract(dot(w, m.xy)));
	}
	mediump float bilateralWeight(in mediump float depth, in mediump float sampleDepth) {
		mediump float diff = (sampleDepth - depth);
		return max(0.0, 1.0 - diff * diff);
	}
	void tap(inout float sum, inout float totalWeight, float weight, float depth, vec2 position) {
		mediump float color = texture2D(sourceTexture, position).r;
		mediump float textureDepth = -getLinearScreenDepth(position);
	
		mediump float bilateral = bilateralWeight(depth, textureDepth);
		bilateral *= weight;
		sum += color * bilateral;
		totalWeight += bilateral;
	}
	void main() {
		mediump float depth = -getLinearScreenDepth(uv0);
		mediump float totalWeight = 1.0;
		mediump float color = texture2D(sourceTexture, uv0 ).r;
		mediump float sum = color * totalWeight;
		for (mediump int i = -filterSize; i <= filterSize; i++) {
			mediump float weight = 1.0;
			#ifdef HORIZONTAL
				vec2 offset = vec2(i, 0) * sourceInvResolution;
			#else
				vec2 offset = vec2(0, i) * sourceInvResolution;
			#endif
			tap(sum, totalWeight, weight, depth, uv0 + offset);
		}
		mediump float ao = sum / totalWeight;
		gl_FragColor.r = ao;
	}
`

var wgslDepthAwareBlurPS = `
#include "screenDepthPS"
varying uv0: vec2f;
var sourceTexture: texture_2d<f32>;
var sourceTextureSampler: sampler;
uniform sourceInvResolution: vec2f;
uniform filterSize: i32;
fn random(w: vec2f) -> f32 {
	const m: vec3f = vec3f(0.06711056, 0.00583715, 52.9829189);
	return fract(m.z * fract(dot(w, m.xy)));
}
fn bilateralWeight(depth: f32, sampleDepth: f32) -> f32 {
	let diff: f32 = (sampleDepth - depth);
	return max(0.0, 1.0 - diff * diff);
}
fn tap(sum_ptr: ptr<function, f32>, totalWeight_ptr: ptr<function, f32>, weight: f32, depth: f32, position: vec2f) {
	let color: f32 = textureSample(sourceTexture, sourceTextureSampler, position).r;
	let textureDepth: f32 = -getLinearScreenDepth(position);
	let bilateral: f32 = bilateralWeight(depth, textureDepth) * weight;
	*sum_ptr = *sum_ptr + color * bilateral;
	*totalWeight_ptr = *totalWeight_ptr + bilateral;
}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	var output: FragmentOutput;
	let depth: f32 = -getLinearScreenDepth(input.uv0);
	var totalWeight: f32 = 1.0;
	let color: f32 = textureSample(sourceTexture, sourceTextureSampler, input.uv0 ).r;
	var sum: f32 = color * totalWeight;
	for (var i: i32 = -uniform.filterSize; i <= uniform.filterSize; i = i + 1) {
		let weight: f32 = 1.0;
		#ifdef HORIZONTAL
			var offset: vec2f = vec2f(f32(i), 0.0) * uniform.sourceInvResolution;
		#else
			var offset: vec2f = vec2f(0.0, f32(i)) * uniform.sourceInvResolution;
		#endif
		tap(&sum, &totalWeight, weight, depth, input.uv0 + offset);
	}
	let ao: f32 = sum / totalWeight;
	output.color = vec4f(ao, ao, ao, 1.0);
	return output;
}
`

class RenderPassDepthAwareBlur extends RenderPassShaderQuad {
    execute() {
        this.filterSizeId.setValue(4)
        this.sourceTextureId.setValue(this.sourceTexture)
        const { width, height } = this.sourceTexture
        this.sourceInvResolutionValue[0] = 1.0 / width
        this.sourceInvResolutionValue[1] = 1.0 / height
        this.sourceInvResolutionId.setValue(this.sourceInvResolutionValue)
        super.execute()
    }
    constructor(device, sourceTexture, cameraComponent, horizontal) {
        super(device)
        this.sourceTexture = sourceTexture
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('depthAwareBlurPS', glslDepthAwareBlurPS)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('depthAwareBlurPS', wgslDepthAwareBlurPS)
        const defines = new Map()
        if (horizontal) defines.set('HORIZONTAL', '')
        ShaderUtils.addScreenDepthChunkDefines(device, cameraComponent.shaderParams, defines)
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: `DepthAware${horizontal ? 'Horizontal' : 'Vertical'}BlurShader`,
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
            vertexChunk: 'quadVS',
            fragmentChunk: 'depthAwareBlurPS',
            fragmentDefines: defines,
        })
        const scope = this.device.scope
        this.sourceTextureId = scope.resolve('sourceTexture')
        this.sourceInvResolutionId = scope.resolve('sourceInvResolution')
        this.sourceInvResolutionValue = new Float32Array(2)
        this.filterSizeId = scope.resolve('filterSize')
    }
}

var glslSsaoPS = `
	#include "screenDepthPS"
	
	varying vec2 uv0;
	uniform vec2 uInvResolution;
	uniform float uAspect;
	#define saturate(x) clamp(x,0.0,1.0)
	highp float getWFromProjectionMatrix(const mat4 p, const vec3 v) {
		return -v.z;
	}
	highp float getViewSpaceZFromW(const mat4 p, const float w) {
		return -w;
	}
	const float kLog2LodRate = 3.0;
	float random(const highp vec2 w) {
		const vec3 m = vec3(0.06711056, 0.00583715, 52.9829189);
		return fract(m.z * fract(dot(w, m.xy)));
	}
	highp vec2 getFragCoord() {
		return gl_FragCoord.xy;
	}
	highp vec3 computeViewSpacePositionFromDepth(highp vec2 uv, highp float linearDepth) {
		return vec3((0.5 - uv) * vec2(uAspect, 1.0) * linearDepth, linearDepth);
	}
	highp vec3 faceNormal(highp vec3 dpdx, highp vec3 dpdy) {
		return normalize(cross(dpdx, dpdy));
	}
	highp vec3 computeViewSpaceNormal(const highp vec3 position) {
		return faceNormal(dFdx(position), dFdy(position));
	}
	highp vec3 computeViewSpaceNormal(const highp vec3 position, const highp vec2 uv) {
		highp vec2 uvdx = uv + vec2(uInvResolution.x, 0.0);
		highp vec2 uvdy = uv + vec2(0.0, uInvResolution.y);
		highp vec3 px = computeViewSpacePositionFromDepth(uvdx, -getLinearScreenDepth(uvdx));
		highp vec3 py = computeViewSpacePositionFromDepth(uvdy, -getLinearScreenDepth(uvdy));
		highp vec3 dpdx = px - position;
		highp vec3 dpdy = py - position;
		return faceNormal(dpdx, dpdy);
	}
	uniform vec2 uSampleCount;
	uniform float uSpiralTurns;
	#define PI (3.14159)
	mediump vec3 tapLocation(mediump float i, const mediump float noise) {
		mediump float offset = ((2.0 * PI) * 2.4) * noise;
		mediump float angle = ((i * uSampleCount.y) * uSpiralTurns) * (2.0 * PI) + offset;
		mediump float radius = (i + noise + 0.5) * uSampleCount.y;
		return vec3(cos(angle), sin(angle), radius * radius);
	}
	highp vec2 startPosition(const float noise) {
		float angle = ((2.0 * PI) * 2.4) * noise;
		return vec2(cos(angle), sin(angle));
	}
	uniform vec2 uAngleIncCosSin;
	highp mat2 tapAngleStep() {
		highp vec2 t = uAngleIncCosSin;
		return mat2(t.x, t.y, -t.y, t.x);
	}
	mediump vec3 tapLocationFast(mediump float i, mediump vec2 p, const mediump float noise) {
		mediump float radius = (i + noise + 0.5) * uSampleCount.y;
		return vec3(p, radius * radius);
	}
	uniform float uMaxLevel;
	uniform float uInvRadiusSquared;
	uniform float uMinHorizonAngleSineSquared;
	uniform float uBias;
	uniform float uPeak2;
	void computeAmbientOcclusionSAO(inout mediump float occlusion, mediump float i, mediump float ssDiskRadius,
			const highp vec2 uv, const highp vec3 origin, const mediump vec3 normal,
			const mediump vec2 tapPosition, const float noise) {
		mediump vec3 tap = tapLocationFast(i, tapPosition, noise);
		mediump float ssRadius = max(1.0, tap.z * ssDiskRadius);
		mediump vec2 uvSamplePos = uv + vec2(ssRadius * tap.xy) * uInvResolution;
		mediump float level = clamp(floor(log2(ssRadius)) - kLog2LodRate, 0.0, float(uMaxLevel));
		highp float occlusionDepth = -getLinearScreenDepth(uvSamplePos);
		highp vec3 p = computeViewSpacePositionFromDepth(uvSamplePos, occlusionDepth);
		vec3 v = p - origin;
		float vv = dot(v, v);
		float vn = dot(v, normal);
		mediump float w = max(0.0, 1.0 - vv * uInvRadiusSquared);
		w = w * w;
		w *= step(vv * uMinHorizonAngleSineSquared, vn * vn);
		occlusion += w * max(0.0, vn + origin.z * uBias) / (vv + uPeak2);
	}
	uniform float uProjectionScaleRadius;
	uniform float uIntensity;
	uniform float uRandomize;
	float scalableAmbientObscurance(highp vec2 uv, highp vec3 origin, vec3 normal) {
		float noise = random(getFragCoord()) + uRandomize;
		highp vec2 tapPosition = startPosition(noise);
		highp mat2 angleStep = tapAngleStep();
		float ssDiskRadius = -(uProjectionScaleRadius / origin.z);
		float occlusion = 0.0;
		for (float i = 0.0; i < uSampleCount.x; i += 1.0) {
			computeAmbientOcclusionSAO(occlusion, i, ssDiskRadius, uv, origin, normal, tapPosition, noise);
			tapPosition = angleStep * tapPosition;
		}
		return occlusion;
	}
	uniform float uPower;
	void main() {
		highp vec2 uv = uv0;
		highp float depth = -getLinearScreenDepth(uv0);
		highp vec3 origin = computeViewSpacePositionFromDepth(uv, depth);
		vec3 normal = computeViewSpaceNormal(origin, uv);
		float occlusion = 0.0;
		if (uIntensity > 0.0) {
			occlusion = scalableAmbientObscurance(uv, origin, normal);
		}
		float ao = max(0.0, 1.0 - occlusion * uIntensity);
		ao = pow(ao, uPower);
		gl_FragColor = vec4(ao, ao, ao, 1.0);
	}
`

var wgslSsaoPS = `
	#include "screenDepthPS"
	varying uv0: vec2f;
	uniform uInvResolution: vec2f;
	uniform uAspect: f32;
	fn getWFromProjectionMatrix(p: mat4x4f, v: vec3f) -> f32 {
		return -v.z;
	}
	fn getViewSpaceZFromW(p: mat4x4f, w: f32) -> f32 {
		return -w;
	}
	const kLog2LodRate: f32 = 3.0;
	fn random(w: vec2f) -> f32 {
		const m: vec3f = vec3f(0.06711056, 0.00583715, 52.9829189);
		return fract(m.z * fract(dot(w, m.xy)));
	}
	fn getFragCoord() -> vec2f {
		return pcPosition.xy;
	}
	fn computeViewSpacePositionFromDepth(uv: vec2f, linearDepth: f32) -> vec3f {
		return vec3f((0.5 - uv) * vec2f(uniform.uAspect, 1.0) * linearDepth, linearDepth);
	}
	fn faceNormal(dpdx: vec3f, dpdy: vec3f) -> vec3f {
		return normalize(cross(dpdx, dpdy));
	}
	fn computeViewSpaceNormalDeriv(position: vec3f) -> vec3f {
		return faceNormal(dpdx(position), dpdy(position));
	}
	fn computeViewSpaceNormalDepth(position: vec3f, uv: vec2f) -> vec3f {
		let uvdx: vec2f = uv + vec2f(uniform.uInvResolution.x, 0.0);
		let uvdy: vec2f = uv + vec2f(0.0, uniform.uInvResolution.y);
		let px: vec3f = computeViewSpacePositionFromDepth(uvdx, -getLinearScreenDepth(uvdx));
		let py: vec3f = computeViewSpacePositionFromDepth(uvdy, -getLinearScreenDepth(uvdy));
		let dpdx: vec3f = px - position;
		let dpdy: vec3f = py - position;
		return faceNormal(dpdx, dpdy);
	}
	uniform uSampleCount: vec2f;
	uniform uSpiralTurns: f32;
	const PI: f32 = 3.14159;
	fn tapLocation(i: f32, noise: f32) -> vec3f {
		let offset: f32 = ((2.0 * PI) * 2.4) * noise;
		let angle: f32 = ((i * uniform.uSampleCount.y) * uniform.uSpiralTurns) * (2.0 * PI) + offset;
		let radius: f32 = (i + noise + 0.5) * uniform.uSampleCount.y;
		return vec3f(cos(angle), sin(angle), radius * radius);
	}
	fn startPosition(noise: f32) -> vec2f {
		let angle: f32 = ((2.0 * PI) * 2.4) * noise;
		return vec2f(cos(angle), sin(angle));
	}
	uniform uAngleIncCosSin: vec2f;
	fn tapAngleStep() -> mat2x2f {
		let t: vec2f = uniform.uAngleIncCosSin;
		return mat2x2f(vec2f(t.x, t.y), vec2f(-t.y, t.x));
	}
	fn tapLocationFast(i: f32, p: vec2f, noise_in: f32) -> vec3f {
		let radius: f32 = (i + noise_in + 0.5) * uniform.uSampleCount.y;
		return vec3f(p.x, p.y, radius * radius);
	}
	uniform uMaxLevel: f32;
	uniform uInvRadiusSquared: f32;
	uniform uMinHorizonAngleSineSquared: f32;
	uniform uBias: f32;
	uniform uPeak2: f32;
	fn computeAmbientOcclusionSAO(occlusion_ptr: ptr<function, f32>, i: f32, ssDiskRadius: f32,
			uv: vec2f, origin: vec3f, normal: vec3f,
			tapPosition: vec2f, noise: f32) {
		let tap: vec3f = tapLocationFast(i, tapPosition, noise);
		let ssRadius: f32 = max(1.0, tap.z * ssDiskRadius);
		let uvSamplePos: vec2f = uv + (ssRadius * tap.xy) * uniform.uInvResolution;
		let level: f32 = clamp(floor(log2(ssRadius)) - kLog2LodRate, 0.0, uniform.uMaxLevel);
		let occlusionDepth: f32 = -getLinearScreenDepth(uvSamplePos);
		let p: vec3f = computeViewSpacePositionFromDepth(uvSamplePos, occlusionDepth);
		let v: vec3f = p - origin;
		let vv: f32 = dot(v, v);
		let vn: f32 = dot(v, normal);
		var w_val: f32 = max(0.0, 1.0 - vv * uniform.uInvRadiusSquared);
		w_val = w_val * w_val;
		w_val = w_val * step(vv * uniform.uMinHorizonAngleSineSquared, vn * vn);
		*occlusion_ptr = *occlusion_ptr + w_val * max(0.0, vn + origin.z * uniform.uBias) / (vv + uniform.uPeak2);
	}
	uniform uProjectionScaleRadius: f32;
	uniform uIntensity: f32;
	uniform uRandomize: f32;
	fn scalableAmbientObscurance(uv: vec2f, origin: vec3f, normal: vec3f) -> f32 {
		let noise: f32 = random(getFragCoord()) + uniform.uRandomize;
		var tapPosition: vec2f = startPosition(noise);
		let angleStep: mat2x2f = tapAngleStep();
		let ssDiskRadius: f32 = -(uniform.uProjectionScaleRadius / origin.z);
		var occlusion: f32 = 0.0;
		for (var i: i32 = 0; i < i32(uniform.uSampleCount.x); i = i + 1) {
			computeAmbientOcclusionSAO(&occlusion, f32(i), ssDiskRadius, uv, origin, normal, tapPosition, noise);
			tapPosition = angleStep * tapPosition;
		}
		return occlusion;
	}
	uniform uPower: f32;
	@fragment
	fn fragmentMain(input: FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		let uv: vec2f = input.uv0;
		let depth: f32 = -getLinearScreenDepth(input.uv0);
		let origin: vec3f = computeViewSpacePositionFromDepth(uv, depth);
		let normal: vec3f = computeViewSpaceNormalDepth(origin, uv);
		var occlusion: f32 = 0.0;
		if (uniform.uIntensity > 0.0) {
			occlusion = scalableAmbientObscurance(uv, origin, normal);
		}
		var ao: f32 = max(0.0, 1.0 - occlusion * uniform.uIntensity);
		ao = pow(ao, uniform.uPower);
		output.color = vec4f(ao, ao, ao, 1.0);
		return output;
	}
`

class RenderPassSsao extends RenderPassShaderQuad {
    destroy() {
        this.renderTarget?.destroyTextureBuffers()
        this.renderTarget?.destroy()
        this.renderTarget = null
        if (this.afterPasses.length > 0) {
            const blurRt = this.afterPasses[0].renderTarget
            blurRt?.destroyTextureBuffers()
            blurRt?.destroy()
        }
        this.afterPasses.forEach((pass) => pass.destroy())
        this.afterPasses.length = 0
        super.destroy()
    }
    set scale(value) {
        this._scale = value
        this.scaleX = value
        this.scaleY = value
    }
    get scale() {
        return this._scale
    }
    createRenderTarget(name) {
        return new RenderTarget({
            depth: false,
            colorBuffer: Texture.createDataTexture2D(this.device, name, 1, 1, PIXELFORMAT_R8),
        })
    }
    execute() {
        const { device, sourceTexture, sampleCount, minAngle, scale } = this
        const { width, height } = this.renderTarget.colorBuffer
        const scope = device.scope
        scope.resolve('uAspect').setValue(width / height)
        scope.resolve('uInvResolution').setValue([1.0 / width, 1.0 / height])
        scope.resolve('uSampleCount').setValue([sampleCount, 1.0 / sampleCount])
        const minAngleSin = Math.sin(minAngle * math.DEG_TO_RAD)
        scope.resolve('uMinHorizonAngleSineSquared').setValue(minAngleSin * minAngleSin)
        const spiralTurns = 10.0
        const step = (1.0 / (sampleCount - 0.5)) * spiralTurns * 2.0 * 3.141
        const radius = this.radius / scale
        const bias = 0.001
        const peak = 0.1 * radius
        const intensity = (2 * (peak * 2.0 * 3.141) * this.intensity) / sampleCount
        const projectionScale = 0.5 * sourceTexture.height
        scope.resolve('uSpiralTurns').setValue(spiralTurns)
        scope.resolve('uAngleIncCosSin').setValue([Math.cos(step), Math.sin(step)])
        scope.resolve('uMaxLevel').setValue(0.0)
        scope.resolve('uInvRadiusSquared').setValue(1.0 / (radius * radius))
        scope.resolve('uBias').setValue(bias)
        scope.resolve('uPeak2').setValue(peak * peak)
        scope.resolve('uIntensity').setValue(intensity)
        scope.resolve('uPower').setValue(this.power)
        scope.resolve('uProjectionScaleRadius').setValue(projectionScale * radius)
        scope.resolve('uRandomize').setValue(this.randomize ? this._blueNoise.value() : 0)
        super.execute()
    }
    after() {
        this.ssaoTextureId.setValue(this.ssaoTexture)
        const srcTexture = this.sourceTexture
        this.ssaoTextureSizeInvId.setValue([1.0 / srcTexture.width, 1.0 / srcTexture.height])
    }
    constructor(device, sourceTexture, cameraComponent, blurEnabled) {
        ;(super(device),
            (this.radius = 5),
            (this.intensity = 1),
            (this.power = 1),
            (this.sampleCount = 10),
            (this.minAngle = 5),
            (this.randomize = false),
            (this._scale = 1),
            (this._blueNoise = new BlueNoise(19)))
        this.sourceTexture = sourceTexture
        this.cameraComponent = cameraComponent
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('ssaoPS', glslSsaoPS)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('ssaoPS', wgslSsaoPS)
        const defines = new Map()
        ShaderUtils.addScreenDepthChunkDefines(device, cameraComponent.shaderParams, defines)
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'SsaoShader',
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
            vertexChunk: 'quadVS',
            fragmentChunk: 'ssaoPS',
            fragmentDefines: defines,
        })
        const rt = this.createRenderTarget('SsaoFinalTexture')
        this.ssaoTexture = rt.colorBuffer
        this.init(rt, {
            resizeSource: this.sourceTexture,
        })
        const clearColor = new Color(0, 0, 0, 0)
        this.setClearColor(clearColor)
        if (blurEnabled) {
            const blurRT = this.createRenderTarget('SsaoTempTexture')
            const blurPassHorizontal = new RenderPassDepthAwareBlur(device, rt.colorBuffer, cameraComponent, true)
            blurPassHorizontal.init(blurRT, {
                resizeSource: rt.colorBuffer,
            })
            blurPassHorizontal.setClearColor(clearColor)
            const blurPassVertical = new RenderPassDepthAwareBlur(device, blurRT.colorBuffer, cameraComponent, false)
            blurPassVertical.init(rt, {
                resizeSource: rt.colorBuffer,
            })
            blurPassVertical.setClearColor(clearColor)
            this.afterPasses.push(blurPassHorizontal)
            this.afterPasses.push(blurPassVertical)
        }
        this.ssaoTextureId = device.scope.resolve('ssaoTexture')
        this.ssaoTextureSizeInvId = device.scope.resolve('ssaoTextureSizeInv')
    }
}

class CameraFrameOptions {
    constructor() {
        this.stencil = false
        this.samples = 1
        this.sceneColorMap = false
        this.lastGrabLayerId = LAYERID_SKYBOX
        this.lastGrabLayerIsTransparent = false
        this.lastSceneLayerId = LAYERID_IMMEDIATE
        this.lastSceneLayerIsTransparent = true
        this.taaEnabled = false
        this.bloomEnabled = false
        this.ssaoType = SSAOTYPE_NONE
        this.ssaoBlurEnabled = true
        this.prepassEnabled = false
        this.dofEnabled = false
        this.dofNearBlur = false
        this.dofHighQuality = true
    }
}
const _defaultOptions = new CameraFrameOptions()
class RenderPassCameraFrame extends RenderPass {
    destroy() {
        this.reset()
    }
    reset() {
        this.sceneTexture = null
        this.sceneTextureHalf = null
        if (this.rt) {
            this.rt.destroyTextureBuffers()
            this.rt.destroy()
            this.rt = null
        }
        if (this.rtHalf) {
            this.rtHalf.destroyTextureBuffers()
            this.rtHalf.destroy()
            this.rtHalf = null
        }
        this.beforePasses.forEach((pass) => pass.destroy())
        this.beforePasses.length = 0
        this.prePass = null
        this.scenePass = null
        this.scenePassTransparent = null
        this.colorGrabPass = null
        this.composePass = null
        this.bloomPass = null
        this.ssaoPass = null
        this.taaPass = null
        this.afterPass = null
        this.scenePassHalf = null
        this.dofPass = null
    }
    sanitizeOptions(options) {
        options = Object.assign({}, _defaultOptions, options)
        if (options.taaEnabled || options.ssaoType !== SSAOTYPE_NONE || options.dofEnabled) {
            options.prepassEnabled = true
        }
        return options
    }
    set renderTargetScale(value) {
        this._renderTargetScale = value
        if (this.scenePass) {
            this.scenePass.scaleX = value
            this.scenePass.scaleY = value
        }
    }
    get renderTargetScale() {
        return this._renderTargetScale
    }
    needsReset(options) {
        const currentOptions = this.options
        const arraysNotEqual = (arr1, arr2) =>
            arr1 !== arr2 &&
            (!(Array.isArray(arr1) && Array.isArray(arr2)) ||
                arr1.length !== arr2.length ||
                !arr1.every((value, index) => value === arr2[index]))
        return (
            options.ssaoType !== currentOptions.ssaoType ||
            options.ssaoBlurEnabled !== currentOptions.ssaoBlurEnabled ||
            options.taaEnabled !== currentOptions.taaEnabled ||
            options.samples !== currentOptions.samples ||
            options.stencil !== currentOptions.stencil ||
            options.bloomEnabled !== currentOptions.bloomEnabled ||
            options.prepassEnabled !== currentOptions.prepassEnabled ||
            options.sceneColorMap !== currentOptions.sceneColorMap ||
            options.dofEnabled !== currentOptions.dofEnabled ||
            options.dofNearBlur !== currentOptions.dofNearBlur ||
            options.dofHighQuality !== currentOptions.dofHighQuality ||
            arraysNotEqual(options.formats, currentOptions.formats)
        )
    }
    update(options) {
        options = this.sanitizeOptions(options)
        if (this.needsReset(options) || this.layersDirty) {
            this.layersDirty = false
            this.reset()
        }
        this.options = options
        if (!this.sceneTexture) {
            this.setupRenderPasses(this.options)
        }
    }
    createRenderTarget(name, depth, stencil, samples, flipY) {
        const texture = new Texture(this.device, {
            name: name,
            width: 4,
            height: 4,
            format: this.hdrFormat,
            mipmaps: false,
            minFilter: FILTER_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
        })
        return new RenderTarget({
            colorBuffer: texture,
            depth: depth,
            stencil: stencil,
            samples: samples,
            flipY: flipY,
        })
    }
    setupRenderPasses(options) {
        const { device } = this
        const cameraComponent = this.cameraComponent
        const targetRenderTarget = cameraComponent.renderTarget
        this.hdrFormat = device.getRenderableHdrFormat(options.formats, true, options.samples) || PIXELFORMAT_RGBA8
        this._bloomEnabled = options.bloomEnabled && this.hdrFormat !== PIXELFORMAT_RGBA8
        this._sceneHalfEnabled = this._bloomEnabled || options.dofEnabled
        cameraComponent.shaderParams.ssaoEnabled = options.ssaoType === SSAOTYPE_LIGHTING
        const flipY = !!targetRenderTarget?.flipY
        this.rt = this.createRenderTarget('SceneColor', true, options.stencil, options.samples, flipY)
        this.sceneTexture = this.rt.colorBuffer
        if (this._sceneHalfEnabled) {
            this.rtHalf = this.createRenderTarget('SceneColorHalf', false, false, 1, flipY)
            this.sceneTextureHalf = this.rtHalf.colorBuffer
        }
        this.sceneOptions = {
            resizeSource: targetRenderTarget,
            scaleX: this.renderTargetScale,
            scaleY: this.renderTargetScale,
        }
        this.createPasses(options)
        const allPasses = this.collectPasses()
        this.beforePasses = allPasses.filter((element) => element !== undefined && element !== null)
    }
    collectPasses() {
        return [
            this.prePass,
            this.ssaoPass,
            this.scenePass,
            this.colorGrabPass,
            this.scenePassTransparent,
            this.taaPass,
            this.scenePassHalf,
            this.bloomPass,
            this.dofPass,
            this.composePass,
            this.afterPass,
        ]
    }
    createPasses(options) {
        this.setupScenePrepass(options)
        this.setupSsaoPass(options)
        const scenePassesInfo = this.setupScenePass(options)
        const sceneTextureWithTaa = this.setupTaaPass(options)
        this.setupSceneHalfPass(options, sceneTextureWithTaa)
        this.setupBloomPass(options, this.sceneTextureHalf)
        this.setupDofPass(options, this.sceneTexture, this.sceneTextureHalf)
        this.setupComposePass(options)
        this.setupAfterPass(options, scenePassesInfo)
    }
    setupScenePrepass(options) {
        if (options.prepassEnabled) {
            const { app, device, cameraComponent } = this
            const { scene, renderer } = app
            this.prePass = new RenderPassPrepass(device, scene, renderer, cameraComponent, this.sceneOptions)
        }
    }
    setupScenePassSettings(pass) {
        pass.gammaCorrection = GAMMA_NONE
        pass.toneMapping = TONEMAP_NONE
    }
    setupScenePass(options) {
        const { app, device, cameraComponent } = this
        const { scene, renderer } = app
        const composition = scene.layers
        this.scenePass = new RenderPassForward(device, composition, scene, renderer)
        this.setupScenePassSettings(this.scenePass)
        this.scenePass.init(this.rt, this.sceneOptions)
        const lastLayerId = options.sceneColorMap ? options.lastGrabLayerId : options.lastSceneLayerId
        const lastLayerIsTransparent = options.sceneColorMap
            ? options.lastGrabLayerIsTransparent
            : options.lastSceneLayerIsTransparent
        const ret = {
            lastAddedIndex: 0,
            clearRenderTarget: true,
        }
        ret.lastAddedIndex = this.scenePass.addLayers(
            composition,
            cameraComponent,
            ret.lastAddedIndex,
            ret.clearRenderTarget,
            lastLayerId,
            lastLayerIsTransparent,
        )
        ret.clearRenderTarget = false
        if (options.sceneColorMap) {
            this.colorGrabPass = new RenderPassColorGrab(device)
            this.colorGrabPass.source = this.rt
            this.scenePassTransparent = new RenderPassForward(device, composition, scene, renderer)
            this.setupScenePassSettings(this.scenePassTransparent)
            this.scenePassTransparent.init(this.rt)
            ret.lastAddedIndex = this.scenePassTransparent.addLayers(
                composition,
                cameraComponent,
                ret.lastAddedIndex,
                ret.clearRenderTarget,
                options.lastSceneLayerId,
                options.lastSceneLayerIsTransparent,
            )
            if (!this.scenePassTransparent.rendersAnything) {
                this.scenePassTransparent.destroy()
                this.scenePassTransparent = null
            }
            if (this.scenePassTransparent) {
                if (options.prepassEnabled) {
                    this.scenePassTransparent.depthStencilOps.storeDepth = true
                }
            }
        }
        return ret
    }
    setupSsaoPass(options) {
        const { ssaoBlurEnabled, ssaoType } = options
        const { device, cameraComponent } = this
        if (ssaoType !== SSAOTYPE_NONE) {
            this.ssaoPass = new RenderPassSsao(device, this.sceneTexture, cameraComponent, ssaoBlurEnabled)
        }
    }
    setupSceneHalfPass(options, sourceTexture) {
        if (this._sceneHalfEnabled) {
            this.scenePassHalf = new RenderPassDownsample(this.device, this.sceneTexture, {
                boxFilter: true,
                removeInvalid: true,
            })
            this.scenePassHalf.name = 'RenderPassSceneHalf'
            this.scenePassHalf.init(this.rtHalf, {
                resizeSource: sourceTexture,
                scaleX: 0.5,
                scaleY: 0.5,
            })
            this.scenePassHalf.setClearColor(Color.BLACK)
        }
    }
    setupBloomPass(options, inputTexture) {
        if (this._bloomEnabled) {
            this.bloomPass = new RenderPassBloom(this.device, inputTexture, this.hdrFormat)
        }
    }
    setupDofPass(options, inputTexture, inputTextureHalf) {
        if (options.dofEnabled) {
            this.dofPass = new RenderPassDof(
                this.device,
                this.cameraComponent,
                inputTexture,
                inputTextureHalf,
                options.dofHighQuality,
                options.dofNearBlur,
            )
        }
    }
    setupTaaPass(options) {
        let textureWithTaa = this.sceneTexture
        if (options.taaEnabled) {
            this.taaPass = new RenderPassTAA(this.device, this.sceneTexture, this.cameraComponent)
            textureWithTaa = this.taaPass.historyTexture
        }
        return textureWithTaa
    }
    setupComposePass(options) {
        this.composePass = new RenderPassCompose(this.device)
        this.composePass.bloomTexture = this.bloomPass?.bloomTexture
        this.composePass.hdrScene = this.hdrFormat !== PIXELFORMAT_RGBA8
        this.composePass.taaEnabled = options.taaEnabled
        this.composePass.cocTexture = this.dofPass?.cocTexture
        this.composePass.blurTexture = this.dofPass?.blurTexture
        this.composePass.blurTextureUpscale = !this.dofPass?.highQuality
        const cameraComponent = this.cameraComponent
        const targetRenderTarget = cameraComponent.renderTarget
        this.composePass.init(targetRenderTarget)
        this.composePass.ssaoTexture = options.ssaoType === SSAOTYPE_COMBINE ? this.ssaoPass.ssaoTexture : null
    }
    setupAfterPass(options, scenePassesInfo) {
        const { app, cameraComponent } = this
        const { scene, renderer } = app
        const composition = scene.layers
        const targetRenderTarget = cameraComponent.renderTarget
        this.afterPass = new RenderPassForward(this.device, composition, scene, renderer)
        this.afterPass.init(targetRenderTarget)
        this.afterPass.addLayers(
            composition,
            cameraComponent,
            scenePassesInfo.lastAddedIndex,
            scenePassesInfo.clearRenderTarget,
        )
    }
    frameUpdate() {
        if (this.layersDirty) {
            this.cameraFrame.update()
        }
        super.frameUpdate()
        const sceneTexture = this.taaPass?.update() ?? this.rt.colorBuffer
        this.composePass.sceneTexture = sceneTexture
        this.scenePassHalf?.setSourceTexture(sceneTexture)
    }
    constructor(app, cameraFrame, cameraComponent, options = {}) {
        ;(super(app.graphicsDevice), (this._renderTargetScale = 1), (this.layersDirty = false), (this.rt = null))
        this.app = app
        this.cameraComponent = cameraComponent
        this.cameraFrame = cameraFrame
        this.options = this.sanitizeOptions(options)
        this.setupRenderPasses(this.options)
    }
}

class CameraFrame {
    destroy() {
        this.disable()
        this.cameraLayersChanged.off()
    }
    enable() {
        this.renderPassCamera = this.createRenderPass()
        this.cameraComponent.renderPasses = [this.renderPassCamera]
    }
    disable() {
        const cameraComponent = this.cameraComponent
        cameraComponent.renderPasses?.forEach((renderPass) => {
            renderPass.destroy()
        })
        cameraComponent.renderPasses = []
        cameraComponent.rendering = null
        cameraComponent.jitter = 0
        cameraComponent.shaderParams.ssaoEnabled = false
        this.renderPassCamera = null
    }
    createRenderPass() {
        return new RenderPassCameraFrame(this.app, this, this.cameraComponent, this.options)
    }
    set enabled(value) {
        if (this._enabled !== value) {
            if (value) {
                this.enable()
            } else {
                this.disable()
            }
            this._enabled = value
        }
    }
    get enabled() {
        return this._enabled
    }
    updateOptions() {
        const { options, rendering, bloom, taa, ssao } = this
        options.stencil = rendering.stencil
        options.samples = rendering.samples
        options.sceneColorMap = rendering.sceneColorMap
        options.prepassEnabled = rendering.sceneDepthMap
        options.bloomEnabled = bloom.intensity > 0
        options.taaEnabled = taa.enabled
        options.ssaoType = ssao.type
        options.ssaoBlurEnabled = ssao.blurEnabled
        options.formats = rendering.renderFormats.slice()
        options.dofEnabled = this.dof.enabled
        options.dofNearBlur = this.dof.nearBlur
        options.dofHighQuality = this.dof.highQuality
    }
    update() {
        if (!this._enabled) return
        const cameraComponent = this.cameraComponent
        const { options, renderPassCamera, rendering, bloom, grading, colorEnhance, vignette, fringing, taa, ssao } =
            this
        this.updateOptions()
        renderPassCamera.update(options)
        const { composePass, bloomPass, ssaoPass, dofPass } = renderPassCamera
        renderPassCamera.renderTargetScale = math.clamp(rendering.renderTargetScale, 0.1, 1)
        composePass.toneMapping = rendering.toneMapping
        composePass.sharpness = rendering.sharpness
        if (options.bloomEnabled && bloomPass) {
            composePass.bloomIntensity = bloom.intensity
            bloomPass.blurLevel = bloom.blurLevel
        }
        if (options.dofEnabled) {
            dofPass.focusDistance = this.dof.focusDistance
            dofPass.focusRange = this.dof.focusRange
            dofPass.blurRadius = this.dof.blurRadius
            dofPass.blurRings = this.dof.blurRings
            dofPass.blurRingPoints = this.dof.blurRingPoints
        }
        if (options.ssaoType !== SSAOTYPE_NONE) {
            ssaoPass.intensity = ssao.intensity
            ssaoPass.power = ssao.power
            ssaoPass.radius = ssao.radius
            ssaoPass.sampleCount = ssao.samples
            ssaoPass.minAngle = ssao.minAngle
            ssaoPass.scale = ssao.scale
            ssaoPass.randomize = ssao.randomize
        }
        composePass.gradingEnabled = grading.enabled
        if (grading.enabled) {
            composePass.gradingSaturation = grading.saturation
            composePass.gradingBrightness = grading.brightness
            composePass.gradingContrast = grading.contrast
            composePass.gradingTint = grading.tint
        }
        composePass.colorLUT = this.colorLUT.texture
        composePass.colorLUTIntensity = this.colorLUT.intensity
        composePass.vignetteEnabled = vignette.intensity > 0
        if (composePass.vignetteEnabled) {
            composePass.vignetteInner = vignette.inner
            composePass.vignetteOuter = vignette.outer
            composePass.vignetteCurvature = vignette.curvature
            composePass.vignetteIntensity = vignette.intensity
            composePass.vignetteColor.copy(vignette.color)
        }
        composePass.fringingEnabled = fringing.intensity > 0
        if (composePass.fringingEnabled) {
            composePass.fringingIntensity = fringing.intensity
        }
        composePass.colorEnhanceEnabled = colorEnhance.enabled
        if (colorEnhance.enabled) {
            composePass.colorEnhanceShadows = colorEnhance.shadows
            composePass.colorEnhanceHighlights = colorEnhance.highlights
            composePass.colorEnhanceVibrance = colorEnhance.vibrance
            composePass.colorEnhanceMidtones = colorEnhance.midtones
            composePass.colorEnhanceDehaze = colorEnhance.dehaze
        }
        cameraComponent.jitter = taa.enabled ? taa.jitter : 0
        composePass.debug = this.debug
        if (composePass.debug === 'ssao' && options.ssaoType === SSAOTYPE_NONE) composePass.debug = null
        if (composePass.debug === 'vignette' && !composePass.vignetteEnabled) composePass.debug = null
    }
    constructor(app, cameraComponent) {
        this._enabled = true
        this.rendering = {
            renderFormats: [PIXELFORMAT_111110F, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F],
            stencil: false,
            renderTargetScale: 1.0,
            samples: 1,
            sceneColorMap: false,
            sceneDepthMap: false,
            toneMapping: 0,
            sharpness: 0.0,
        }
        this.ssao = {
            type: SSAOTYPE_NONE,
            blurEnabled: true,
            randomize: false,
            intensity: 0.5,
            radius: 30,
            samples: 12,
            power: 6,
            minAngle: 10,
            scale: 1,
        }
        this.bloom = {
            intensity: 0,
            blurLevel: 16,
        }
        this.grading = {
            enabled: false,
            brightness: 1,
            contrast: 1,
            saturation: 1,
            tint: new Color(1, 1, 1, 1),
        }
        this.colorLUT = {
            texture: null,
            intensity: 1,
        }
        this.vignette = {
            intensity: 0,
            inner: 0.5,
            outer: 1,
            curvature: 0.5,
            color: new Color(0, 0, 0),
        }
        this.taa = {
            enabled: false,
            jitter: 1,
        }
        this.fringing = {
            intensity: 0,
        }
        this.colorEnhance = {
            enabled: false,
            shadows: 0,
            highlights: 0,
            vibrance: 0,
            midtones: 0,
            dehaze: 0,
        }
        this.dof = {
            enabled: false,
            nearBlur: false,
            focusDistance: 100,
            focusRange: 10,
            blurRadius: 3,
            blurRings: 4,
            blurRingPoints: 5,
            highQuality: true,
        }
        this.debug = null
        this.options = new CameraFrameOptions()
        this.renderPassCamera = null
        this.app = app
        this.cameraComponent = cameraComponent
        this.updateOptions()
        this.enable()
        this.cameraLayersChanged = cameraComponent.on('set:layers', () => {
            if (this.renderPassCamera) this.renderPassCamera.layersDirty = true
        })
    }
}

const tmpV1$1 = new Vec3()
const rotation$4 = new Quat()
class Pose {
    copy(other) {
        return this.set(other.position, other.angles, other.distance)
    }
    clone() {
        return new Pose(this.position.clone(), this.angles.clone(), this.distance)
    }
    equalsApprox(other, epsilon = 1e-6) {
        return (
            this.position.equalsApprox(other.position, epsilon) &&
            this.angles.equalsApprox(other.angles, epsilon) &&
            Math.abs(this.distance - other.distance) < epsilon
        )
    }
    lerp(lhs, rhs, alpha1, alpha2 = alpha1, alpha3 = alpha1) {
        this.position.lerp(lhs.position, rhs.position, alpha1)
        this.angles.x = math.lerpAngle(lhs.angles.x, rhs.angles.x, alpha2) % 360
        this.angles.y = math.lerpAngle(lhs.angles.y, rhs.angles.y, alpha2) % 360
        this.angles.z = math.lerpAngle(lhs.angles.z, rhs.angles.z, alpha2) % 360
        this.distance = math.lerp(lhs.distance, rhs.distance, alpha3)
        return this
    }
    move(offset) {
        this.position.add(offset)
        this.position.x = math.clamp(this.position.x, this.xRange.x, this.xRange.y)
        this.position.y = math.clamp(this.position.y, this.yRange.x, this.yRange.y)
        this.position.z = math.clamp(this.position.z, this.zRange.x, this.zRange.y)
        return this
    }
    rotate(euler) {
        this.angles.add(euler)
        this.angles.x %= 360
        this.angles.y %= 360
        this.angles.z %= 360
        this.angles.x = math.clamp(this.angles.x, this.pitchRange.x, this.pitchRange.y)
        this.angles.y = math.clamp(this.angles.y, this.yawRange.x, this.yawRange.y)
        return this
    }
    set(position, angles, distance) {
        this.position.copy(position)
        this.angles.copy(angles)
        this.distance = distance
        return this
    }
    look(from, to) {
        this.position.copy(from)
        this.distance = from.distance(to)
        const dir = tmpV1$1.sub2(to, from).normalize()
        const elev = Math.atan2(-dir.y, Math.sqrt(dir.x * dir.x + dir.z * dir.z)) * math.RAD_TO_DEG
        const azim = Math.atan2(-dir.x, -dir.z) * math.RAD_TO_DEG
        this.angles.set(-elev, azim, 0)
        return this
    }
    getFocus(out) {
        return rotation$4
            .setFromEulerAngles(this.angles)
            .transformVector(Vec3.FORWARD, out)
            .mulScalar(this.distance)
            .add(this.position)
    }
    constructor(position = Vec3.ZERO, angles = Vec3.ZERO, distance = 0) {
        this.position = new Vec3()
        this.angles = new Vec3()
        this.distance = 0
        this.pitchRange = new Vec2(-Infinity, Infinity)
        this.yawRange = new Vec2(-Infinity, Infinity)
        this.xRange = new Vec2(-Infinity, Infinity)
        this.yRange = new Vec2(-Infinity, Infinity)
        this.zRange = new Vec2(-Infinity, Infinity)
        this.set(position, angles, distance)
    }
}

class InputDelta {
    add(other) {
        for (let i = 0; i < this._value.length; i++) {
            this._value[i] += other._value[i] || 0
        }
        return this
    }
    append(offsets) {
        for (let i = 0; i < this._value.length; i++) {
            this._value[i] += offsets[i] || 0
        }
        return this
    }
    copy(other) {
        for (let i = 0; i < this._value.length; i++) {
            this._value[i] = other._value[i] || 0
        }
        return this
    }
    length() {
        let sum = 0
        for (const value of this._value) {
            sum += value * value
        }
        return Math.sqrt(sum)
    }
    read() {
        const value = this._value.slice()
        this._value.fill(0)
        return value
    }
    constructor(arg) {
        if (Array.isArray(arg)) {
            this._value = arg.slice()
        } else {
            this._value = new Array(+arg).fill(0)
        }
    }
}
class InputFrame {
    read() {
        const frame = {}
        for (const name in this.deltas) {
            frame[name] = this.deltas[name].read()
        }
        return frame
    }
    constructor(data) {
        this.deltas = {}
        for (const name in data) {
            this.deltas[name] = new InputDelta(data[name])
        }
    }
}
class InputSource extends InputFrame {
    on(event, callback) {
        this._events.on(event, callback)
    }
    off(event, callback) {
        this._events.off(event, callback)
    }
    fire(event, ...args) {
        this._events.fire(event, ...args)
    }
    attach(element) {
        if (this._element) {
            this.detach()
        }
        this._element = element
    }
    detach() {
        if (!this._element) {
            return
        }
        this._element = null
        this.read()
    }
    destroy() {
        this.detach()
        this._events.off()
    }
    constructor(...args) {
        ;(super(...args), (this._element = null), (this._events = new EventHandler()))
    }
}
class InputConsumer {
    update(frame, dt) {
        frame.read()
    }
}
let InputController$1 = class InputController extends InputConsumer {
    attach(pose, smooth = true) {}
    detach() {}
    update(frame, dt) {
        super.update(frame, dt)
        return this._pose
    }
    destroy() {
        this.detach()
    }
    constructor(...args) {
        ;(super(...args), (this._pose = new Pose()))
    }
}

const movementState = () => {
    const state = new Map()
    return {
        down: (event) => {
            state.set(event.pointerId, [event.screenX, event.screenY])
        },
        move: (event) => {
            if (!state.has(event.pointerId)) {
                return [0, 0]
            }
            const prev = state.get(event.pointerId)
            const mvX = event.screenX - prev[0]
            const mvY = event.screenY - prev[1]
            prev[0] = event.screenX
            prev[1] = event.screenY
            return [mvX, mvY]
        },
        up: (event) => {
            state.delete(event.pointerId)
        },
    }
}

const damp$1 = (damping, dt) => 1 - Math.pow(damping, dt * 1000)

const offset$2 = new Vec3()
const angles$1 = new Vec3()
const forward$1 = new Vec3()
const right$2 = new Vec3()
const up$1 = new Vec3()
const rotation$3 = new Quat()
let FlyController$1 = class FlyController extends InputController$1 {
    set pitchRange(value) {
        this._targetPose.pitchRange.copy(value)
        this._pose.copy(this._targetPose.rotate(Vec3.ZERO))
    }
    get pitchRange() {
        return this._targetPose.pitchRange
    }
    set yawRange(value) {
        this._targetPose.yawRange.copy(value)
        this._pose.copy(this._targetPose.rotate(Vec3.ZERO))
    }
    get yawRange() {
        return this._targetPose.yawRange
    }
    attach(pose, smooth = true) {
        this._targetPose.copy(pose)
        if (!smooth) {
            this._pose.copy(this._targetPose)
        }
    }
    detach() {
        this._targetPose.copy(this._pose)
    }
    update(frame, dt) {
        const { move, rotate } = frame.read()
        this._targetPose.rotate(angles$1.set(-rotate[1], -rotate[0], 0))
        rotation$3.setFromEulerAngles(this._pose.angles)
        rotation$3.transformVector(Vec3.FORWARD, forward$1)
        rotation$3.transformVector(Vec3.RIGHT, right$2)
        rotation$3.transformVector(Vec3.UP, up$1)
        offset$2.set(0, 0, 0)
        offset$2.add(forward$1.mulScalar(move[2]))
        offset$2.add(right$2.mulScalar(move[0]))
        offset$2.add(up$1.mulScalar(move[1]))
        this._targetPose.move(offset$2)
        return this._pose.lerp(
            this._pose,
            this._targetPose,
            damp$1(this.moveDamping, dt),
            damp$1(this.rotateDamping, dt),
        )
    }
    destroy() {
        this.detach()
    }
    constructor(...args) {
        ;(super(...args), (this._targetPose = new Pose()), (this.rotateDamping = 0.98), (this.moveDamping = 0.98))
    }
}

const BUTTON_CODES = {
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LB: 4,
    RB: 5,
    LT: 6,
    RT: 7,
    SELECT: 8,
    START: 9,
    LEFT_STICK: 10,
    RIGHT_STICK: 11,
}
const BUTTON_COUNT = Object.keys(BUTTON_CODES).length
class GamepadSource extends InputSource {
    read() {
        const gamepads = navigator.getGamepads()
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i]
            if (!gp) {
                continue
            }
            if (gp.mapping !== 'standard') {
                continue
            }
            if (gp.axes.length < 4) {
                continue
            }
            if (gp.buttons.length < BUTTON_COUNT) {
                continue
            }
            const { buttons, axes } = gp
            for (let j = 0; j < this._buttonPrev.length; j++) {
                const state = +buttons[j].pressed
                this.deltas.buttons[j] = state - this._buttonPrev[j]
                this._buttonPrev[j] = state
            }
            this.deltas.leftStick.append([axes[0], axes[1]])
            this.deltas.rightStick.append([axes[2], axes[3]])
        }
        return super.read()
    }
    constructor() {
        ;(super({
            buttons: Array(BUTTON_COUNT).fill(0),
            leftStick: [0, 0],
            rightStick: [0, 0],
        }),
            (this._buttonPrev = Array(BUTTON_COUNT).fill(0)))
    }
}
GamepadSource.buttonCode = BUTTON_CODES

const PASSIVE = {
    passive: false,
}
const KEY_CODES = {
    A: 0,
    B: 1,
    C: 2,
    D: 3,
    E: 4,
    F: 5,
    G: 6,
    H: 7,
    I: 8,
    J: 9,
    K: 10,
    L: 11,
    M: 12,
    N: 13,
    O: 14,
    P: 15,
    Q: 16,
    R: 17,
    S: 18,
    T: 19,
    U: 20,
    V: 21,
    W: 22,
    X: 23,
    Y: 24,
    Z: 25,
    0: 26,
    1: 27,
    2: 28,
    3: 29,
    4: 30,
    5: 31,
    6: 32,
    7: 33,
    8: 34,
    9: 35,
    UP: 36,
    DOWN: 37,
    LEFT: 38,
    RIGHT: 39,
    SPACE: 40,
    SHIFT: 41,
    CTRL: 42,
}
const KEY_COUNT = Object.keys(KEY_CODES).length
const array = Array(KEY_COUNT).fill(0)
class KeyboardMouseSource extends InputSource {
    _onWheel(event) {
        event.preventDefault()
        this.deltas.wheel.append([event.deltaY])
    }
    _onPointerDown(event) {
        this._movementState.down(event)
        if (event.pointerType !== 'mouse') {
            return
        }
        if (this._pointerLock) {
            if (document.pointerLockElement !== this._element) {
                this._element?.requestPointerLock()
            }
        } else {
            this._element?.setPointerCapture(event.pointerId)
        }
        this._clearButtons()
        this._button[event.button] = 1
        this.deltas.button.append(this._button)
        if (this._pointerId !== -1) {
            return
        }
        this._pointerId = event.pointerId
    }
    _onPointerMove(event) {
        const [movementX, movementY] =
            this._pointerLock && document.pointerLockElement === this._element
                ? [event.movementX, event.movementY]
                : this._movementState.move(event)
        if (event.pointerType !== 'mouse') {
            return
        }
        if (event.target !== this._element) {
            return
        }
        if (this._pointerLock) {
            if (document.pointerLockElement !== this._element) {
                return
            }
        } else {
            if (this._pointerId !== event.pointerId) {
                return
            }
        }
        this.deltas.mouse.append([movementX, movementY])
    }
    _onPointerUp(event) {
        this._movementState.up(event)
        if (event.pointerType !== 'mouse') {
            return
        }
        if (!this._pointerLock) {
            this._element?.releasePointerCapture(event.pointerId)
        }
        this._clearButtons()
        this.deltas.button.append(this._button)
        if (this._pointerId !== event.pointerId) {
            return
        }
        this._pointerId = -1
    }
    _onContextMenu(event) {
        event.preventDefault()
    }
    _onKeyDown(event) {
        if (this._pointerLock && document.pointerLockElement !== this._element) {
            return
        }
        event.stopPropagation()
        this._setKey(event.code, 1)
    }
    _onKeyUp(event) {
        event.stopPropagation()
        this._setKey(event.code, 0)
    }
    _clearButtons() {
        for (let i = 0; i < this._button.length; i++) {
            if (this._button[i] === 1) {
                this._button[i] = -1
                continue
            }
            this._button[i] = 0
        }
    }
    _setKey(code, value) {
        if (!this._keyMap.has(code)) {
            return
        }
        this._keyNow[this._keyMap.get(code) ?? 0] = value
    }
    attach(element) {
        super.attach(element)
        this._element = element
        this._element.addEventListener('wheel', this._onWheel, PASSIVE)
        this._element.addEventListener('pointerdown', this._onPointerDown)
        this._element.addEventListener('pointermove', this._onPointerMove)
        this._element.addEventListener('pointerup', this._onPointerUp)
        this._element.addEventListener('pointercancel', this._onPointerUp)
        this._element.addEventListener('pointerleave', this._onPointerUp)
        this._element.addEventListener('contextmenu', this._onContextMenu)
        window.addEventListener('keydown', this._onKeyDown, false)
        window.addEventListener('keyup', this._onKeyUp, false)
    }
    detach() {
        if (!this._element) {
            return
        }
        this._element.removeEventListener('wheel', this._onWheel, PASSIVE)
        this._element.removeEventListener('pointerdown', this._onPointerDown)
        this._element.removeEventListener('pointermove', this._onPointerMove)
        this._element.removeEventListener('pointerup', this._onPointerUp)
        this._element.removeEventListener('pointercancel', this._onPointerUp)
        this._element.removeEventListener('pointerleave', this._onPointerUp)
        this._element.removeEventListener('contextmenu', this._onContextMenu)
        window.removeEventListener('keydown', this._onKeyDown, false)
        window.removeEventListener('keyup', this._onKeyUp, false)
        this._keyNow.fill(0)
        this._keyPrev.fill(0)
        super.detach()
    }
    read() {
        for (let i = 0; i < array.length; i++) {
            array[i] = this._keyNow[i] - this._keyPrev[i]
            this._keyPrev[i] = this._keyNow[i]
        }
        this.deltas.key.append(array)
        return super.read()
    }
    constructor({ pointerLock = false } = {}) {
        ;(super({
            key: Array(KEY_COUNT).fill(0),
            button: [0, 0, 0],
            mouse: [0, 0],
            wheel: [0],
        }),
            (this._movementState = movementState()),
            (this._pointerId = -1),
            (this._keyMap = new Map()),
            (this._keyPrev = Array(KEY_COUNT).fill(0)),
            (this._keyNow = Array(KEY_COUNT).fill(0)),
            (this._button = Array(3).fill(0)))
        this._pointerLock = pointerLock ?? false
        const { keyCode } = KeyboardMouseSource
        for (let i = 0; i < 26; i++) {
            const code = `Key${String.fromCharCode('A'.charCodeAt(0) + i)}`
            this._keyMap.set(code, keyCode.A + i)
        }
        for (let i = 0; i < 10; i++) {
            const code = `Digit${i}`
            this._keyMap.set(code, keyCode['0'] + i)
        }
        // this._keyMap.set('ArrowUp', keyCode.UP)
        // this._keyMap.set('ArrowDown', keyCode.DOWN)
        // this._keyMap.set('ArrowLeft', keyCode.LEFT)
        // this._keyMap.set('ArrowRight', keyCode.RIGHT)
        // this._keyMap.set('Space', keyCode.SPACE)
        // this._keyMap.set('ShiftLeft', keyCode.SHIFT)
        // this._keyMap.set('ShiftRight', keyCode.SHIFT)
        // this._keyMap.set('ControlLeft', keyCode.CTRL)
        // this._keyMap.set('ControlRight', keyCode.CTRL)
        this._onWheel = this._onWheel.bind(this)
        this._onPointerDown = this._onPointerDown.bind(this)
        this._onPointerMove = this._onPointerMove.bind(this)
        this._onPointerUp = this._onPointerUp.bind(this)
        this._onContextMenu = this._onContextMenu.bind(this)
        this._onKeyDown = this._onKeyDown.bind(this)
        this._onKeyUp = this._onKeyUp.bind(this)
    }
}
KeyboardMouseSource.keyCode = KEY_CODES

class CpuTimer {
    begin(name) {
        if (!this.enabled) {
            return
        }
        if (this._frameIndex < this._frameTimings.length) {
            this._frameTimings.splice(this._frameIndex)
        }
        const tmp = this._prevTimings
        this._prevTimings = this._timings
        this._timings = this._frameTimings
        this._frameTimings = tmp
        this._frameIndex = 0
        this.mark(name)
    }
    mark(name) {
        if (!this.enabled) {
            return
        }
        const timestamp = now()
        if (this._frameIndex > 0) {
            const prev = this._frameTimings[this._frameIndex - 1]
            prev[1] = timestamp - prev[1]
        } else if (this._timings.length > 0) {
            const prev = this._timings[this._timings.length - 1]
            prev[1] = timestamp - prev[1]
        }
        if (this._frameIndex >= this._frameTimings.length) {
            this._frameTimings.push([name, timestamp])
        } else {
            const timing = this._frameTimings[this._frameIndex]
            timing[0] = name
            timing[1] = timestamp
        }
        this._frameIndex++
    }
    get timings() {
        return this._timings.slice(0, -1).map((v) => v[1])
    }
    constructor(app) {
        this._frameIndex = 0
        this._frameTimings = []
        this._timings = []
        this._prevTimings = []
        this.unitsName = 'ms'
        this.decimalPlaces = 1
        this.enabled = true
        app.on('frameupdate', this.begin.bind(this, 'update'))
        app.on('framerender', this.mark.bind(this, 'render'))
        app.on('frameend', this.mark.bind(this, 'other'))
    }
}

class GpuTimer {
    get timings() {
        this._timings[0] = this.device.gpuProfiler?._frameTime ?? 0
        return this._timings
    }
    constructor(device) {
        this.device = device
        if (device.gpuProfiler) {
            device.gpuProfiler.enabled = true
        }
        this.enabled = true
        this.unitsName = 'ms'
        this.decimalPlaces = 1
        this._timings = []
    }
}

class StatsTimer {
    get timings() {
        return this.values
    }
    constructor(app, statNames, decimalPlaces, unitsName, multiplier) {
        this.app = app
        this.values = []
        this.statNames = statNames
        this.unitsName = unitsName
        this.decimalPlaces = decimalPlaces
        this.multiplier = multiplier || 1
        const resolve = (path, obj) => {
            return path.split('.').reduce((prev, curr) => {
                if (!prev) return null
                if (prev instanceof Map) {
                    return prev.get(curr)
                }
                return prev[curr]
            }, obj || this)
        }
        app.on('frameupdate', (ms) => {
            for (let i = 0; i < this.statNames.length; i++) {
                const value = resolve(this.statNames[i], this.app.stats)
                this.values[i] = (value ?? 0) * this.multiplier
            }
        })
    }
}

class Graph {
    destroy() {
        this.app.off('frameupdate', this.update, this)
    }
    loseContext() {
        if (this.timer && typeof this.timer.loseContext === 'function') {
            this.timer.loseContext()
        }
    }
    update(ms) {
        const timings = this.timer.timings
        const total = timings.reduce((a, v) => a + v, 0)
        this.avgTotal += total
        this.avgTimer += ms
        this.avgCount++
        this.maxValue = Math.max(this.maxValue, total)
        if (this.avgTimer > this.textRefreshRate) {
            this.timingText = (this.avgTotal / this.avgCount).toFixed(this.timer.decimalPlaces)
            this.maxText = this.maxValue.toFixed(this.timer.decimalPlaces)
            this.avgTimer = 0
            this.avgTotal = 0
            this.avgCount = 0
            this.maxValue = 0
        }
        if (this.enabled) {
            const range = 1.5 * this.watermark
            this.sample[0] = Math.floor((total / range) * 255)
            this.sample[1] = 0
            this.sample[2] = 0
            this.sample[3] = (this.watermark / range) * 255
            if (this.yOffset >= this.texture.height) {
                return
            }
            const data = this.texture.lock()
            if (this.needsClear) {
                const rowOffset = this.yOffset * this.texture.width * 4
                data.fill(0, rowOffset, rowOffset + this.texture.width * 4)
                this.needsClear = false
            }
            data.set(this.sample, (this.cursor + this.yOffset * this.texture.width) * 4)
            this.texture.unlock()
            this.cursor++
            if (this.cursor === this.texture.width) {
                this.cursor = 0
            }
        }
    }
    render(render2d, x, y, w, h) {
        render2d.quad(
            x + w,
            y,
            -w,
            h,
            this.enabled ? this.cursor : 0,
            this.enabled ? 0.5 + this.yOffset : this.texture.height - 1,
            -w,
            0,
            this.texture,
            this.graphType,
        )
    }
    constructor(name, app, watermark, textRefreshRate, timer) {
        this.app = app
        this.name = name
        this.device = app.graphicsDevice
        this.timer = timer
        this.watermark = watermark
        this.enabled = false
        this.textRefreshRate = textRefreshRate
        this.avgTotal = 0
        this.avgTimer = 0
        this.avgCount = 0
        this.maxValue = 0
        this.timingText = ''
        this.maxText = ''
        this.texture = null
        this.yOffset = 0
        this.graphType = 0.0
        this.cursor = 0
        this.sample = new Uint8ClampedArray(4)
        this.sample.set([0, 0, 0, 255])
        this.needsClear = false
        this.counter = 0
        this.app.on('frameupdate', this.update, this)
    }
}

class WordAtlas {
    destroy() {
        this.texture.destroy()
        this.texture = null
    }
    render(render2d, word, x, y) {
        const p = this.placements.get(word)
        if (p) {
            const padding = 1
            render2d.quad(
                x + p.l - padding,
                y - p.d + padding,
                p.w + padding * 2,
                p.h + padding * 2,
                p.x - padding,
                this.texture.height - p.y - p.h - padding,
                undefined,
                undefined,
                this.texture,
                1,
            )
            return p.w
        }
        let totalWidth = 0
        for (let i = 0; i < word.length; i++) {
            const char = word[i]
            if (char === ' ') {
                totalWidth += 5
                continue
            }
            const charPlacement = this.placements.get(char)
            if (charPlacement) {
                const padding = 1
                render2d.quad(
                    x + totalWidth + charPlacement.l - padding,
                    y - charPlacement.d + padding,
                    charPlacement.w + padding * 2,
                    charPlacement.h + padding * 2,
                    charPlacement.x - padding,
                    this.texture.height - charPlacement.y - charPlacement.h - padding,
                    undefined,
                    undefined,
                    this.texture,
                    1,
                )
                totalWidth += charPlacement.w
            }
        }
        return totalWidth
    }
    constructor(device, words) {
        const initContext = (context) => {
            context.font = '10px "Lucida Console", Monaco, monospace'
            context.textAlign = 'left'
            context.textBaseline = 'alphabetic'
        }
        const isNumber = (word) => {
            return word === '.' || (word.length === 1 && word.charCodeAt(0) >= 48 && word.charCodeAt(0) <= 57)
        }
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', {
            alpha: true,
        })
        initContext(context)
        const placements = new Map()
        const padding = 5
        const width = 512
        let x = padding
        let y = padding
        words.forEach((word) => {
            const measurement = context.measureText(word)
            const l = Math.ceil(-measurement.actualBoundingBoxLeft)
            const r = Math.ceil(measurement.actualBoundingBoxRight)
            const a = Math.ceil(measurement.actualBoundingBoxAscent)
            const d = Math.ceil(measurement.actualBoundingBoxDescent)
            const w = l + r
            const h = a + d
            if (x + w + padding >= width) {
                x = padding
                y += 16
            }
            placements.set(word, {
                l,
                r,
                a,
                d,
                w,
                h,
                x: x,
                y: y,
            })
            x += w + padding
        })
        canvas.width = 512
        canvas.height = math.nextPowerOfTwo(y + 16 + padding)
        initContext(context)
        context.fillStyle = 'rgb(0, 0, 0)'
        context.fillRect(0, 0, canvas.width, canvas.height)
        placements.forEach((m, word) => {
            context.fillStyle = isNumber(word) ? 'rgb(255, 240, 100)' : 'rgb(150, 220, 230)'
            context.fillText(word, m.x - m.l, m.y + m.a)
        })
        this.placements = placements
        const data = context.getImageData(0, 0, canvas.width, canvas.height).data
        for (let i = 0; i < data.length; i += 4) {
            const maxChannel = Math.max(data[i + 0], data[i + 1], data[i + 2])
            data[i + 3] = Math.min(maxChannel * 2, 255)
        }
        this.texture = new Texture(device, {
            name: 'mini-stats-word-atlas',
            width: canvas.width,
            height: canvas.height,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            levels: [data],
        })
    }
}

const graphColorDefault = '1.0, 0.412, 0.380'
const graphColorGpu = '0.467, 0.867, 0.467'
const graphColorCpu = '0.424, 0.627, 0.863'
const mainBackgroundColor = '0.0, 0.0, 0.0'
const gpuBackgroundColor = '0.15, 0.15, 0.0'
const cpuBackgroundColor = '0.15, 0.0, 0.1'
const vertexShaderGLSL = `
	attribute vec3 vertex_position;
	attribute vec4 vertex_texCoord0;
	varying vec4 uv0;
	varying float wordFlag;
	void main(void) {
		gl_Position = vec4(vertex_position.xy * 2.0 - 1.0, 0.5, 1.0);
		uv0 = vertex_texCoord0;
		wordFlag = vertex_position.z;
	}
`
const vertexShaderWGSL = `
	attribute vertex_position: vec3f;
	attribute vertex_texCoord0: vec4f;
	varying uv0: vec4f;
	varying wordFlag: f32;
	@vertex fn vertexMain(input : VertexInput) -> VertexOutput {
		var output : VertexOutput;
		output.position = vec4(input.vertex_position.xy * 2.0 - 1.0, 0.5, 1.0);
		output.uv0 = input.vertex_texCoord0;
		output.wordFlag = input.vertex_position.z;
		return output;
	}
`
const fragmentShaderGLSL = `
	varying vec4 uv0;
	varying float wordFlag;
	uniform vec4 clr;
	uniform sampler2D graphTex;
	uniform sampler2D wordsTex;
	void main (void) {
		vec3 graphColor = vec3(${graphColorDefault});
		if (wordFlag > 0.5) {
			graphColor = vec3(${graphColorCpu});
		} else if (wordFlag > 0.2) {
			graphColor = vec3(${graphColorGpu});
		}
		vec4 graphSample = texture2D(graphTex, uv0.xy);
		vec4 graph;
		if (uv0.w < graphSample.r)
			graph = vec4(graphColor, 1.0);
		else {
			vec3 bgColor = vec3(${mainBackgroundColor});
			if (wordFlag > 0.5) {
				bgColor = vec3(${cpuBackgroundColor});
			} else if (wordFlag > 0.2) {
				bgColor = vec3(${gpuBackgroundColor});
			}
			graph = vec4(bgColor, 1.0);
		}
		vec4 words = texture2D(wordsTex, vec2(uv0.x, 1.0 - uv0.y));
		if (wordFlag > 0.99) {
			gl_FragColor = words * clr;
		} else {
			gl_FragColor = graph * clr;
		}
	}
`
const fragmentShaderWGSL = `
	varying uv0: vec4f;
	varying wordFlag: f32;
	uniform clr: vec4f;
	var graphTex : texture_2d<f32>;
	var graphTex_sampler : sampler;
	var wordsTex : texture_2d<f32>;
	var wordsTex_sampler : sampler;
	@fragment fn fragmentMain(input : FragmentInput) -> FragmentOutput {
		var uv0: vec4f = input.uv0;
		var graphColor: vec3f = vec3f(${graphColorDefault});
		if (input.wordFlag > 0.5) {
			graphColor = vec3f(${graphColorCpu});
		} else if (input.wordFlag > 0.2) {
			graphColor = vec3f(${graphColorGpu});
		}
		var graphSample: vec4f = textureSample(graphTex, graphTex_sampler, uv0.xy);
		var graph: vec4f;
		if (uv0.w < graphSample.r) {
			graph = vec4f(graphColor, 1.0);
		} else {
			var bgColor: vec3f = vec3f(${mainBackgroundColor});
			if (input.wordFlag > 0.5) {
				bgColor = vec3f(${cpuBackgroundColor});
			} else if (input.wordFlag > 0.2) {
				bgColor = vec3f(${gpuBackgroundColor});
			}
			graph = vec4f(bgColor, 1.0);
		}
		var words: vec4f = textureSample(wordsTex, wordsTex_sampler, vec2f(uv0.x, 1.0 - uv0.y));
		var output: FragmentOutput;
		if (input.wordFlag > 0.99) {
			output.color = words * uniform.clr;
		} else {
			output.color = graph * uniform.clr;
		}
		return output;
	}
`
class Render2d {
    quad(x, y, w, h, u, v, uw, uh, texture, wordFlag = 0) {
        if (this.quads >= this.maxQuads) {
            return
        }
        const rw = this.targetSize.width
        const rh = this.targetSize.height
        const x0 = x / rw
        const y0 = y / rh
        const x1 = (x + w) / rw
        const y1 = (y + h) / rh
        const tw = texture.width
        const th = texture.height
        const u0 = u / tw
        const v0 = v / th
        const u1 = (u + (uw ?? w)) / tw
        const v1 = (v + (uh ?? h)) / th
        this.data.set(
            [
                x0,
                y0,
                wordFlag,
                u0,
                v0,
                0,
                0,
                x1,
                y0,
                wordFlag,
                u1,
                v0,
                1,
                0,
                x1,
                y1,
                wordFlag,
                u1,
                v1,
                1,
                1,
                x0,
                y1,
                wordFlag,
                u0,
                v1,
                0,
                1,
            ],
            4 * 7 * this.quads,
        )
        this.quads++
        this.prim.count += 6
    }
    startFrame() {
        this.quads = 0
        this.prim.count = 0
        this.targetSize.width = this.device.canvas.scrollWidth
        this.targetSize.height = this.device.canvas.scrollHeight
    }
    render(app, layer, graphTexture, wordsTexture, clr, height) {
        this.buffer.setData(this.data.buffer)
        this.uniforms.clr.set(clr, 0)
        this.material.setParameter('clr', this.uniforms.clr)
        this.material.setParameter('graphTex', graphTexture)
        this.material.setParameter('wordsTex', wordsTexture)
        app.drawMeshInstance(this.meshInstance, layer)
    }
    constructor(device, maxQuads = 2048) {
        const format = new VertexFormat(device, [
            {
                semantic: SEMANTIC_POSITION,
                components: 3,
                type: TYPE_FLOAT32,
            },
            {
                semantic: SEMANTIC_TEXCOORD0,
                components: 4,
                type: TYPE_FLOAT32,
            },
        ])
        const indices = new Uint16Array(maxQuads * 6)
        for (let i = 0; i < maxQuads; ++i) {
            indices[i * 6 + 0] = i * 4
            indices[i * 6 + 1] = i * 4 + 1
            indices[i * 6 + 2] = i * 4 + 2
            indices[i * 6 + 3] = i * 4
            indices[i * 6 + 4] = i * 4 + 2
            indices[i * 6 + 5] = i * 4 + 3
        }
        this.device = device
        this.maxQuads = maxQuads
        this.buffer = new VertexBuffer(device, format, maxQuads * 4, {
            usage: BUFFER_STREAM,
        })
        this.data = new Float32Array(this.buffer.numBytes / 4)
        this.indexBuffer = new IndexBuffer(device, INDEXFORMAT_UINT16, maxQuads * 6, BUFFER_STATIC, indices)
        this.prim = {
            type: PRIMITIVE_TRIANGLES,
            indexed: true,
            base: 0,
            baseVertex: 0,
            count: 0,
        }
        this.quads = 0
        this.mesh = new Mesh(device)
        this.mesh.vertexBuffer = this.buffer
        this.mesh.indexBuffer[0] = this.indexBuffer
        this.mesh.primitive = [this.prim]
        const material = new ShaderMaterial({
            uniqueName: 'MiniStats',
            vertexGLSL: vertexShaderGLSL,
            fragmentGLSL: fragmentShaderGLSL,
            vertexWGSL: vertexShaderWGSL,
            fragmentWGSL: fragmentShaderWGSL,
            attributes: {
                vertex_position: SEMANTIC_POSITION,
                vertex_texCoord0: SEMANTIC_TEXCOORD0,
            },
        })
        this.material = material
        material.cull = CULLFACE_NONE
        material.depthState = DepthState.NODEPTH
        material.blendState = new BlendState(
            true,
            BLENDEQUATION_ADD,
            BLENDMODE_SRC_ALPHA,
            BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD,
            BLENDMODE_ONE,
            BLENDMODE_ONE,
        )
        material.update()
        this.meshInstance = new MeshInstance(this.mesh, material, new GraphNode('MiniStatsMesh'))
        this.uniforms = {
            clr: new Float32Array(4),
        }
        this.targetSize = {
            width: device.width,
            height: device.height,
        }
    }
}

const cpuStatDisplayNames = {
    animUpdate: 'anim',
    physicsTime: 'physics',
    renderTime: 'render',
    gsplatSort: 'gsplatSort',
}
const delayedStartStats = new Set(['physicsTime', 'animUpdate', 'gsplatSort'])
class MiniStats {
    destroy() {
        this.device.off('resizecanvas', this.updateDiv, this)
        this.device.off('losecontext', this.loseContext, this)
        this.app.off('postrender', this.postRender, this)
        this.graphs.forEach((graph) => graph.destroy())
        this.gpuPassGraphs.clear()
        this.cpuGraphs.clear()
        this.vramGraphs.clear()
        this.wordAtlas.destroy()
        this.texture.destroy()
        this.div.remove()
    }
    static getDefaultOptions(extraStats = []) {
        const options = {
            sizes: [
                {
                    width: 100,
                    height: 16,
                    spacing: 0,
                    graphs: false,
                },
                {
                    width: 128,
                    height: 32,
                    spacing: 2,
                    graphs: true,
                },
                {
                    width: 256,
                    height: 64,
                    spacing: 2,
                    graphs: true,
                },
            ],
            startSizeIndex: 0,
            textRefreshRate: 500,
            cpu: {
                enabled: true,
                watermark: 33,
            },
            gpu: {
                enabled: true,
                watermark: 33,
            },
            stats: [
                {
                    name: 'Frame',
                    stats: ['frame.ms'],
                    decimalPlaces: 1,
                    unitsName: 'ms',
                    watermark: 33,
                },
                {
                    name: 'DrawCalls',
                    stats: ['drawCalls.total'],
                    watermark: 1000,
                },
                {
                    name: 'VRAM',
                    stats: ['vram.totalUsed'],
                    decimalPlaces: 1,
                    multiplier: 1 / (1024 * 1024),
                    unitsName: 'MB',
                    watermark: 1024,
                },
            ],
            gpuTimingMinSize: 1,
            cpuTimingMinSize: 1,
            vramTimingMinSize: 1,
        }
        if (extraStats.length > 0) {
            const frameIndex = options.stats.findIndex((s) => s.name === 'Frame')
            const insertIndex = frameIndex !== -1 ? frameIndex + 1 : options.stats.length
            const extra = extraStats.flatMap((name) => MiniStats.statPresets[name] ?? []).reverse()
            options.stats.splice(insertIndex, 0, ...extra)
        }
        return options
    }
    set activeSizeIndex(value) {
        this._activeSizeIndex = value
        this.gspacing = this.sizes[value].spacing
        this.resize(this.sizes[value].width, this.sizes[value].height, this.sizes[value].graphs)
        this.opacity = value > 0 ? 0.85 : 0.7
        if (value < this.gpuTimingMinSize && this.gpuPassGraphs) {
            this.clearSubGraphs(this.gpuPassGraphs, 'GPU', 0.33)
        }
        if (value < this.cpuTimingMinSize && this.cpuGraphs) {
            this.clearSubGraphs(this.cpuGraphs, 'CPU', 0.66)
        }
        if (value < this.vramTimingMinSize && this.vramGraphs) {
            this.clearSubGraphs(this.vramGraphs)
        }
    }
    get activeSizeIndex() {
        return this._activeSizeIndex
    }
    set opacity(value) {
        this.clr[3] = value
    }
    get opacity() {
        return this.clr[3]
    }
    get overallHeight() {
        const graphs = this.graphs
        const spacing = this.gspacing
        return this.height * graphs.length + spacing * (graphs.length - 1)
    }
    set enabled(value) {
        if (value !== this._enabled) {
            this._enabled = value
            for (let i = 0; i < this.graphs.length; ++i) {
                this.graphs[i].enabled = value
                this.graphs[i].timer.enabled = value
            }
        }
    }
    get enabled() {
        return this._enabled
    }
    initGraphs(app, device, options) {
        this.graphs = []
        if (options.stats) {
            options.stats.forEach((entry) => {
                if (entry.name === 'VRAM') {
                    const timer = new StatsTimer(
                        app,
                        entry.stats,
                        entry.decimalPlaces,
                        entry.unitsName,
                        entry.multiplier,
                    )
                    const graph = new Graph(entry.name, app, entry.watermark, options.textRefreshRate, timer)
                    this.graphs.push(graph)
                }
            })
        }
        if (options.cpu.enabled) {
            const timer = new CpuTimer(app)
            const graph = new Graph('CPU', app, options.cpu.watermark, options.textRefreshRate, timer)
            graph.graphType = 0.66
            this.graphs.push(graph)
        }
        if (options.gpu.enabled) {
            const timer = new GpuTimer(device)
            const graph = new Graph('GPU', app, options.gpu.watermark, options.textRefreshRate, timer)
            graph.graphType = 0.33
            this.graphs.push(graph)
        }
        if (options.stats) {
            options.stats.forEach((entry) => {
                if (entry.name === 'VRAM') {
                    return
                }
                const timer = new StatsTimer(app, entry.stats, entry.decimalPlaces, entry.unitsName, entry.multiplier)
                const graph = new Graph(entry.name, app, entry.watermark, options.textRefreshRate, timer)
                this.graphs.push(graph)
            })
        }
        this.texture = new Texture(device, {
            name: 'mini-stats-graph-texture',
            width: 1,
            height: 1,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_REPEAT,
            addressV: ADDRESS_REPEAT,
        })
        this.graphs.forEach((graph) => {
            graph.texture = this.texture
            this.allocateRow(graph)
        })
    }
    render() {
        const graphs = this.graphs
        const wordAtlas = this.wordAtlas
        const render2d = this.render2d
        const width = this.width
        const height = this.height
        const gspacing = this.gspacing
        render2d.startFrame()
        for (let i = 0; i < graphs.length; ++i) {
            const graph = graphs[i]
            let y = i * (height + gspacing)
            graph.render(render2d, 0, y, width, height)
            let x = 1
            y += height - 13
            x += wordAtlas.render(render2d, graph.name, x, y) + 10
            const timingText = graph.timingText
            for (let j = 0; j < timingText.length; ++j) {
                x += wordAtlas.render(render2d, timingText[j], x, y)
            }
            if (graph.maxText && this._activeSizeIndex > 0) {
                x += 5
                x += wordAtlas.render(render2d, 'max', x, y)
                x += 5
                const maxText = graph.maxText
                for (let j = 0; j < maxText.length; ++j) {
                    x += wordAtlas.render(render2d, maxText[j], x, y)
                }
            }
            if (graph.timer.unitsName) {
                x += wordAtlas.render(render2d, graph.timer.unitsName, x, y)
            }
        }
        render2d.render(this.app, this.drawLayer, this.texture, this.wordAtlas.texture, this.clr, height)
    }
    resize(width, height, showGraphs) {
        const graphs = this.graphs
        for (let i = 0; i < graphs.length; ++i) {
            graphs[i].enabled = showGraphs
        }
        this.width = width
        this.height = height
        this.updateDiv()
    }
    updateDiv() {
        const rect = this.device.canvas.getBoundingClientRect()
        this.div.style.left = `${rect.left}px`
        this.div.style.bottom = `${window.innerHeight - rect.bottom}px`
        this.div.style.width = `${this.width}px`
        this.div.style.height = `${this.overallHeight}px`
    }
    loseContext() {
        this.graphs.forEach((graph) => graph.loseContext())
    }
    updateSubStats(subGraphs, mainGraphName, stats, statPathPrefix, removeAfterFrames) {
        const passesToRemove = []
        for (const [statName, statData] of subGraphs) {
            const timing = stats instanceof Map ? stats.get(statName) || 0 : stats[statName] || 0
            if (timing > 0) {
                statData.lastNonZeroFrame = this.frameIndex
            } else if (removeAfterFrames > 0) {
                const shouldAutoHide = statPathPrefix === 'gpu'
                if (shouldAutoHide && this.frameIndex - statData.lastNonZeroFrame > removeAfterFrames) {
                    passesToRemove.push(statName)
                }
            }
        }
        for (const statName of passesToRemove) {
            const statData = subGraphs.get(statName)
            if (statData) {
                const index = this.graphs.indexOf(statData.graph)
                if (index !== -1) {
                    this.graphs.splice(index, 1)
                }
                this.freeRow(statData.graph)
                statData.graph.destroy()
                subGraphs.delete(statName)
            }
        }
        const statsEntries = stats instanceof Map ? stats : Object.entries(stats)
        const mainGraph = this.graphs.find((g) => g.name === mainGraphName)
        for (const [statName, timing] of statsEntries) {
            if (!subGraphs.has(statName)) {
                const isDelayedStart = statPathPrefix === 'gpu' || delayedStartStats.has(statName)
                if (isDelayedStart && timing === 0) {
                    continue
                }
                let displayName = statName
                if (statPathPrefix === 'frame') {
                    displayName = cpuStatDisplayNames[statName] || statName
                }
                const graphName = `  ${displayName}`
                const watermark = mainGraph?.watermark ?? 10.0
                const decimalPlaces = 1
                const unitsName = statPathPrefix === 'vram' ? 'MB' : 'ms'
                const multiplier = statPathPrefix === 'vram' ? 1 / (1024 * 1024) : 1
                const statPath = `${statPathPrefix}.${statName}`
                const timer = new StatsTimer(this.app, [statPath], decimalPlaces, unitsName, multiplier)
                const graph = new Graph(graphName, this.app, watermark, this.textRefreshRate, timer)
                if (statPathPrefix === 'gpu') {
                    graph.graphType = 0.33
                } else if (statPathPrefix === 'frame') {
                    graph.graphType = 0.66
                }
                graph.texture = this.texture
                this.allocateRow(graph)
                const currentSize = this.sizes[this._activeSizeIndex]
                graph.enabled = currentSize.graphs
                let mainGraphIndex = this.graphs.findIndex((g) => g.name === mainGraphName)
                if (mainGraphIndex === -1) {
                    mainGraphIndex = 0
                }
                let insertIndex = mainGraphIndex
                for (let i = mainGraphIndex - 1; i >= 0; i--) {
                    if (this.graphs[i].name.startsWith(' ')) {
                        insertIndex = i
                    } else {
                        break
                    }
                }
                this.graphs.splice(insertIndex, 0, graph)
                subGraphs.set(statName, {
                    graph: graph,
                    lastNonZeroFrame: timing > 0 ? this.frameIndex : this.frameIndex - removeAfterFrames - 1,
                })
            }
        }
        if (mainGraph) {
            for (const statData of subGraphs.values()) {
                statData.graph.watermark = mainGraph.watermark
            }
        }
    }
    allocateRow(graph) {
        let row
        if (this.freeRows.length > 0) {
            row = this.freeRows.pop()
        } else {
            row = this.nextRowIndex++
            this.ensureTextureHeight(this.nextRowIndex)
        }
        this.graphRows.set(graph, row)
        graph.yOffset = row
        graph.needsClear = true
        return row
    }
    freeRow(graph) {
        const row = this.graphRows.get(graph)
        if (row !== undefined) {
            this.freeRows.push(row)
            this.graphRows.delete(graph)
        }
    }
    clearSubGraphs(subGraphs, mainGraphName, graphType) {
        for (const statData of subGraphs.values()) {
            const index = this.graphs.indexOf(statData.graph)
            if (index !== -1) {
                this.graphs.splice(index, 1)
            }
            this.freeRow(statData.graph)
            statData.graph.destroy()
        }
        subGraphs.clear()
        if (mainGraphName) {
            const mainGraph = this.graphs.find((g) => g.name === mainGraphName)
            if (mainGraph) mainGraph.graphType = graphType
        }
    }
    ensureTextureHeight(requiredRows) {
        const maxWidth = this.sizes[this.sizes.length - 1].width
        const requiredWidth = math.nextPowerOfTwo(maxWidth)
        const requiredHeight = math.nextPowerOfTwo(requiredRows)
        if (requiredHeight > this.texture.height) {
            this.texture.resize(requiredWidth, requiredHeight)
        }
    }
    postRender() {
        if (this._enabled) {
            this.render()
            if (this._activeSizeIndex >= this.gpuTimingMinSize) {
                const gpuStats = this.app.stats.gpu
                if (gpuStats) {
                    this.updateSubStats(this.gpuPassGraphs, 'GPU', gpuStats, 'gpu', 240)
                }
            }
            if (this._activeSizeIndex >= this.cpuTimingMinSize) {
                const cpuStats = {
                    scriptUpdate: this.app.stats.frame.scriptUpdate,
                    scriptPostUpdate: this.app.stats.frame.scriptPostUpdate,
                    animUpdate: this.app.stats.frame.animUpdate,
                    physicsTime: this.app.stats.frame.physicsTime,
                    renderTime: this.app.stats.frame.renderTime,
                    gsplatSort: this.app.stats.frame.gsplatSort,
                }
                this.updateSubStats(this.cpuGraphs, 'CPU', cpuStats, 'frame', 240)
            }
            if (this._activeSizeIndex >= this.vramTimingMinSize) {
                const vram = this.app.stats.vram
                const vramStats = {
                    tex: vram.tex,
                    geom: vram.geom,
                }
                if (this.device.isWebGPU) {
                    vramStats.buffers = vram.buffers
                }
                this.updateSubStats(this.vramGraphs, 'VRAM', vramStats, 'vram', 0)
            }
        }
        this.frameIndex++
    }
    constructor(app, options = MiniStats.getDefaultOptions()) {
        const device = app.graphicsDevice
        this.graphRows = new Map()
        this.freeRows = []
        this.nextRowIndex = 0
        this.sizes = options.sizes
        this.initGraphs(app, device, options)
        const words = new Set(
            ['', 'ms', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '-', ' ']
                .concat(this.graphs.map((graph) => graph.name))
                .concat(options.stats ? options.stats.map((stat) => stat.unitsName) : [])
                .filter((item) => !!item),
        )
        for (let i = 97; i <= 122; i++) {
            words.add(String.fromCharCode(i))
        }
        for (let i = 65; i <= 90; i++) {
            words.add(String.fromCharCode(i))
        }
        this.wordAtlas = new WordAtlas(device, words)
        this._activeSizeIndex = options.startSizeIndex
        const gpuTimingMinSize = options.gpuTimingMinSize ?? 1
        const cpuTimingMinSize = options.cpuTimingMinSize ?? 1
        const vramTimingMinSize = options.vramTimingMinSize ?? 1
        if (
            gpuTimingMinSize < this.sizes.length ||
            cpuTimingMinSize < this.sizes.length ||
            vramTimingMinSize < this.sizes.length
        ) {
            const lastWidth = this.sizes[this.sizes.length - 1].width
            for (let i = 1; i < this.sizes.length - 1; i++) {
                this.sizes[i].width = lastWidth
            }
        }
        const div = document.createElement('div')
        div.setAttribute('id', 'mini-stats')
        div.style.cssText = 'position:fixed;bottom:0;left:0;background:transparent;'
        document.body.appendChild(div)
        div.addEventListener('mouseenter', (event) => {
            this.opacity = 1.0
        })
        div.addEventListener('mouseleave', (event) => {
            this.opacity = this._activeSizeIndex > 0 ? 0.85 : 0.7
        })
        div.addEventListener('click', (event) => {
            event.preventDefault()
            if (this._enabled) {
                this.activeSizeIndex = (this.activeSizeIndex + 1) % this.sizes.length
                this.resize(
                    this.sizes[this.activeSizeIndex].width,
                    this.sizes[this.activeSizeIndex].height,
                    this.sizes[this.activeSizeIndex].graphs,
                )
            }
        })
        device.on('resizecanvas', this.updateDiv, this)
        device.on('losecontext', this.loseContext, this)
        app.on('postrender', this.postRender, this)
        this.app = app
        this.drawLayer = app.scene.layers.getLayerById(LAYERID_UI)
        this.device = device
        this.render2d = new Render2d(device)
        this.div = div
        this.width = 0
        this.height = 0
        this.gspacing = 2
        this.clr = [1, 1, 1, options.startSizeIndex > 0 ? 0.85 : 0.7]
        this._enabled = true
        this.gpuTimingMinSize = gpuTimingMinSize
        this.gpuPassGraphs = new Map()
        this.cpuTimingMinSize = cpuTimingMinSize
        this.cpuGraphs = new Map()
        this.vramTimingMinSize = vramTimingMinSize
        this.vramGraphs = new Map()
        this.frameIndex = 0
        this.textRefreshRate = options.textRefreshRate
        this.activeSizeIndex = this._activeSizeIndex
    }
}
MiniStats.statPresets = {
    gsplats: [
        {
            name: 'GSplats',
            stats: ['frame.gsplats'],
            decimalPlaces: 3,
            multiplier: 1 / 1000000,
            unitsName: 'M',
            watermark: 10,
        },
    ],
    gsplatsCopy: [
        {
            name: 'GsplatsCopy',
            stats: ['frame.gsplatBufferCopy'],
            decimalPlaces: 1,
            multiplier: 1,
            unitsName: '%',
            watermark: 100,
        },
    ],
}

const tmpVa = new Vec2()
class MultiTouchSource extends InputSource {
    _onPointerDown(event) {
        const { pointerId, pointerType } = event
        this._movementState.down(event)
        if (pointerType !== 'touch') {
            return
        }
        this._element?.setPointerCapture(pointerId)
        this._pointerEvents.set(pointerId, event)
        this.deltas.count.append([1])
        if (this._pointerEvents.size > 1) {
            this._getMidPoint(this._pointerPos)
            this._pinchDist = this._getPinchDist()
        }
    }
    _onPointerMove(event) {
        const { pointerType, target, pointerId } = event
        const [movementX, movementY] = this._movementState.move(event)
        if (pointerType !== 'touch') {
            return
        }
        if (target !== this._element) {
            return
        }
        if (this._pointerEvents.size === 0) {
            return
        }
        this._pointerEvents.set(pointerId, event)
        if (this._pointerEvents.size > 1) {
            const mid = this._getMidPoint(tmpVa)
            this.deltas.touch.append([mid.x - this._pointerPos.x, mid.y - this._pointerPos.y])
            this._pointerPos.copy(mid)
            const pinchDist = this._getPinchDist()
            if (this._pinchDist > 0) {
                this.deltas.pinch.append([this._pinchDist - pinchDist])
            }
            this._pinchDist = pinchDist
        } else {
            this.deltas.touch.append([movementX, movementY])
        }
    }
    _onPointerUp(event) {
        const { pointerType, pointerId } = event
        this._movementState.up(event)
        if (pointerType !== 'touch') {
            return
        }
        this._element?.releasePointerCapture(pointerId)
        this._pointerEvents.delete(pointerId)
        this.deltas.count.append([-1])
        if (this._pointerEvents.size < 2) {
            this._pinchDist = -1
        }
        this._pointerPos.set(0, 0)
    }
    _onContextMenu(event) {
        event.preventDefault()
    }
    _getMidPoint(out) {
        if (this._pointerEvents.size < 2) {
            return out.set(0, 0)
        }
        const [a, b] = this._pointerEvents.values()
        const dx = a.clientX - b.clientX
        const dy = a.clientY - b.clientY
        return out.set(b.clientX + dx * 0.5, b.clientY + dy * 0.5)
    }
    _getPinchDist() {
        if (this._pointerEvents.size < 2) {
            return 0
        }
        const [a, b] = this._pointerEvents.values()
        const dx = a.clientX - b.clientX
        const dy = a.clientY - b.clientY
        return Math.sqrt(dx * dx + dy * dy)
    }
    attach(element) {
        super.attach(element)
        this._element = element
        this._element.addEventListener('pointerdown', this._onPointerDown)
        this._element.addEventListener('pointermove', this._onPointerMove)
        this._element.addEventListener('pointerup', this._onPointerUp)
        this._element.addEventListener('pointercancel', this._onPointerUp)
        this._element.addEventListener('contextmenu', this._onContextMenu)
    }
    detach() {
        if (!this._element) {
            return
        }
        this._element.removeEventListener('pointerdown', this._onPointerDown)
        this._element.removeEventListener('pointermove', this._onPointerMove)
        this._element.removeEventListener('pointerup', this._onPointerUp)
        this._element.removeEventListener('pointercancel', this._onPointerUp)
        this._element.removeEventListener('contextmenu', this._onContextMenu)
        this._pointerEvents.clear()
        super.detach()
    }
    constructor() {
        ;(super({
            touch: [0, 0],
            count: [0],
            pinch: [0],
        }),
            (this._movementState = movementState()),
            (this._pointerEvents = new Map()),
            (this._pointerPos = new Vec2()),
            (this._pinchDist = -1))
        this._onPointerDown = this._onPointerDown.bind(this)
        this._onPointerMove = this._onPointerMove.bind(this)
        this._onPointerUp = this._onPointerUp.bind(this)
        this._onContextMenu = this._onContextMenu.bind(this)
    }
}

const dir = new Vec3()
const offset$1 = new Vec3()
const angles = new Vec3()
const rotation$2 = new Quat()
let OrbitController$1 = class OrbitController extends InputController$1 {
    set pitchRange(range) {
        this._targetRootPose.pitchRange.copy(range)
        this._rootPose.copy(this._targetRootPose.rotate(Vec3.ZERO))
    }
    get pitchRange() {
        return this._targetRootPose.pitchRange
    }
    set yawRange(range) {
        this._targetRootPose.yawRange.copy(range)
        this._rootPose.copy(this._targetRootPose.rotate(Vec3.ZERO))
    }
    get yawRange() {
        return this._targetRootPose.yawRange
    }
    set zoomRange(range) {
        this._targetChildPose.zRange.copy(range)
        this._childPose.copy(this._targetChildPose.move(Vec3.ZERO))
    }
    get zoomRange() {
        return this._targetRootPose.zRange
    }
    attach(pose, smooth = true) {
        this._targetRootPose.set(pose.getFocus(dir), pose.angles, 0)
        this._targetChildPose.position.set(0, 0, pose.distance)
        if (!smooth) {
            this._rootPose.copy(this._targetRootPose)
            this._childPose.copy(this._targetChildPose)
        }
    }
    detach() {
        this._targetRootPose.copy(this._rootPose)
        this._targetChildPose.copy(this._childPose)
    }
    update(frame, dt) {
        const { move, rotate } = frame.read()
        offset$1.set(move[0], move[1], 0)
        rotation$2.setFromEulerAngles(this._rootPose.angles).transformVector(offset$1, offset$1)
        this._targetRootPose.move(offset$1)
        const { z: dist } = this._targetChildPose.position
        this._targetChildPose.move(offset$1.set(0, 0, dist * (1 + move[2]) - dist))
        this._targetRootPose.rotate(angles.set(-rotate[1], -rotate[0], 0))
        this._rootPose.lerp(
            this._rootPose,
            this._targetRootPose,
            damp$1(this.moveDamping, dt),
            damp$1(this.rotateDamping, dt),
            1,
        )
        this._childPose.lerp(this._childPose, this._targetChildPose, damp$1(this.zoomDamping, dt), 1, 1)
        rotation$2
            .setFromEulerAngles(this._rootPose.angles)
            .transformVector(this._childPose.position, offset$1)
            .add(this._rootPose.position)
        return this._pose.set(offset$1, this._rootPose.angles, this._childPose.position.z)
    }
    destroy() {
        this.detach()
    }
    constructor(...args) {
        ;(super(...args),
            (this._targetRootPose = new Pose()),
            (this._rootPose = new Pose()),
            (this._targetChildPose = new Pose()),
            (this._childPose = new Pose()),
            (this.rotateDamping = 0.98),
            (this.moveDamping = 0.98),
            (this.zoomDamping = 0.98))
    }
}

class App extends AppBase {
    constructor(canvas, options) {
        super(canvas)
        const appOptions = new AppOptions()
        appOptions.graphicsDevice = options.graphicsDevice
        appOptions.componentSystems = [
            CameraComponentSystem,
            LightComponentSystem,
            RenderComponentSystem,
            GSplatComponentSystem,
            ScriptComponentSystem,
        ]
        appOptions.resourceHandlers = [ContainerHandler, TextureHandler, GSplatHandler, BinaryHandler]
        appOptions.mouse = options.mouse
        appOptions.touch = options.touch
        appOptions.keyboard = options.keyboard
        appOptions.xr = XrManager
        this.init(appOptions)
    }
}

// creates an observer proxy object to wrap some target object. fires events when properties change.
const observe = (events, target) => {
    const members = new Set(Object.keys(target))
    return new Proxy(target, {
        set(target, property, value, receiver) {
            // prevent setting symbol properties
            if (typeof property === 'symbol') {
                console.error('Cannot set symbol property on target')
                return false
            }
            // not allowed to set a new value on target
            if (!members.has(property)) {
                console.error('Cannot set new property on target')
                return false
            }
            // set and fire event if value changed
            if (target[property] !== value) {
                const prev = target[property]
                target[property] = value
                events.fire(`${property}:changed`, value, prev)
            }
            return true
        },
    })
}

const migrateV1 = (settings) => {
    if (settings.animTracks) {
        settings.animTracks?.forEach((track) => {
            // some early settings did not have frameRate set on anim tracks
            if (!track.frameRate) {
                const defaultFrameRate = 30
                track.frameRate = defaultFrameRate
                const times = track.keyframes.times
                for (let i = 0; i < times.length; i++) {
                    times[i] *= defaultFrameRate
                }
            }
            // smoothness property added in v1.4.0
            if (!track.hasOwnProperty('smoothness')) {
                track.smoothness = 0
            }
        })
    } else {
        // some scenes were published without animTracks
        settings.animTracks = []
    }
    return settings
}
const migrateAnimTrackV2 = (animTrackV1, fov) => {
    return {
        name: animTrackV1.name,
        duration: animTrackV1.duration,
        frameRate: animTrackV1.frameRate,
        loopMode: animTrackV1.loopMode,
        interpolation: animTrackV1.interpolation,
        smoothness: animTrackV1.smoothness,
        keyframes: {
            times: animTrackV1.keyframes.times,
            values: {
                position: animTrackV1.keyframes.values.position,
                target: animTrackV1.keyframes.values.target,
                fov: new Array(animTrackV1.keyframes.times.length).fill(fov),
            },
        },
    }
}
const migrateV2 = (v1) => {
    return {
        version: 2,
        tonemapping: 'none',
        highPrecisionRendering: false,
        background: {
            color: v1.background.color || [0, 0, 0],
        },
        postEffectSettings: {
            sharpness: {
                enabled: false,
                amount: 0,
            },
            bloom: {
                enabled: false,
                intensity: 1,
                blurLevel: 2,
            },
            grading: {
                enabled: false,
                brightness: 0,
                contrast: 1,
                saturation: 1,
                tint: [1, 1, 1],
            },
            vignette: {
                enabled: false,
                intensity: 0.5,
                inner: 0.3,
                outer: 0.75,
                curvature: 1,
            },
            fringing: {
                enabled: false,
                intensity: 0.5,
            },
        },
        animTracks: v1.animTracks.map((animTrackV1) => {
            return migrateAnimTrackV2(animTrackV1, v1.camera.fov || 60)
        }),
        cameras:
            v1.camera.position && v1.camera.target
                ? [
                      {
                          initial: {
                              position: v1.camera.position,
                              target: v1.camera.target,
                              fov: v1.camera.fov || 75,
                          },
                      },
                  ]
                : [],
        annotations: [],
        startMode: v1.camera.startAnim === 'animTrack' ? 'animTrack' : 'default',
    }
}
// migrate a JSON object to the latest settings schema (assumes valid input)
const importSettings = (settings) => {
    let result
    const version = settings.version
    if (version === undefined) {
        // v1 -> v2
        result = migrateV2(migrateV1(settings))
    } else if (version === 2) {
        // already v2
        result = settings
    } else {
        throw new Error(`Unsupported experience settings version: ${version}`)
    }
    return {...defaultSettings,...result}
}

class Tooltip {
    register
    unregister
    destroy
    constructor(dom) {
        const { style } = dom
        style.display = 'none'
        const targets = new Map()
        let timer = 0
        this.register = (target, textString, direction = 'bottom') => {
            const activate = () => {
        dom.textContent = textString
        style.display = 'inline'
        style.whiteSpace = 'nowrap'
        style.width = 'max-content'

        const rect = target.getBoundingClientRect()
        const tooltipW = dom.offsetWidth
        const tooltipH = dom.offsetHeight
        const GAP = 8
        const midx = Math.floor((rect.left + rect.right) * 0.5)
        const midy = Math.floor((rect.top + rect.bottom) * 0.5)

        let left, top

        switch (direction) {
            case 'left':
                left = rect.left - tooltipW - 10
                top  = midy - tooltipH / 2
                break
            case 'right':
                left = rect.right + 10
                top  = midy - tooltipH / 2
                break
            case 'top':
                left = midx - tooltipW / 2
                top  = rect.top - tooltipH - 10
                break
            case 'bottom':
                left = midx - tooltipW / 2
                top  = rect.bottom + 10
                break
        }

        // Clamp trong viewport
        if (left + tooltipW > window.innerWidth - GAP)  left = window.innerWidth - tooltipW - GAP
        if (left < GAP)                                  left = GAP
        if (top + tooltipH > window.innerHeight - GAP)  top  = window.innerHeight - tooltipH - GAP
        if (top < GAP)                                   top  = GAP

        style.transform = 'none'
        style.left = left + 'px'
        style.top  = top  + 'px'
    }
            const startTimer = (fn) => {
                timer = window.setTimeout(() => {
                    fn()
                    timer = -1
                }, 250)
            }
            const cancelTimer = () => {
                if (timer >= 0) {
                    clearTimeout(timer)
                    timer = -1
                }
            }
            const enter = () => {
                cancelTimer()
                if (style.display === 'inline') {
                    activate()
                } else {
                    startTimer(() => activate())
                }
            }
            const leave = () => {
                cancelTimer()
                if (style.display === 'inline') {
                    startTimer(() => {
                        style.display = 'none'
                    })
                }
            }
            target.addEventListener('pointerenter', enter)
            target.addEventListener('pointerleave', leave)
            targets.set(target, { enter, leave })
        }
        this.unregister = (target) => {
            const value = targets.get(target)
            if (value) {
                target.removeEventListener('pointerenter', value.enter)
                target.removeEventListener('pointerleave', value.leave)
                targets.delete(target)
            }
        }
        this.destroy = () => {
            for (const target of targets.keys()) {
                this.unregister(target)
            }
        }
    }
}
// Initialize the annotation navigator for stepping between annotations
const initAnnotationNav = (dom, events, state, annotations) => {
    // Only show navigator when there are at least 2 annotations
    if (annotations.length < 2) return
    let currentIndex = 0
    const goTo = (index) => {
        currentIndex = index
        events.fire('annotation.navigate', annotations[currentIndex])
    }
    // Sync when an annotation is activated externally (e.g. hotspot click)
    events.on('annotation.activate', (annotation) => {
        const idx = annotations.indexOf(annotation)
        if (idx !== -1) {
            currentIndex = idx
        }
    })
    // React to state changes
    events.on('loaded:changed', () => {
        updateMode()
        updateFade()
    })
    events.on('inputMode:changed', updateMode)
    events.on('controlsHidden:changed', updateFade)
    // Initial state
    updateDisplay()
}