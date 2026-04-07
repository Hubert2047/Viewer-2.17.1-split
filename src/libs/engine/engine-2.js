class RenderAction {
    destroy() {
        this.viewBindGroups.forEach((bg) => {
            bg.defaultUniformBuffer.destroy()
            bg.destroy()
        })
        this.viewBindGroups.length = 0
    }
    setupClears(camera, layer) {
        this.clearColor = camera?.clearColorBuffer || layer.clearColorBuffer
        this.clearDepth = camera?.clearDepthBuffer || layer.clearDepthBuffer
        this.clearStencil = camera?.clearStencilBuffer || layer.clearStencilBuffer
    }
    constructor() {
        this.camera = null
        this.layer = null
        this.transparent = false
        this.renderTarget = null
        this.lightClusters = null
        this.clearColor = false
        this.clearDepth = false
        this.clearStencil = false
        this.triggerPostprocess = false
        this.firstCameraUse = false
        this.lastCameraUse = false
        this.viewBindGroups = []
        this.useCameraPasses = false
    }
}

class RenderPassForward extends RenderPass {
    get rendersAnything() {
        return this.renderActions.length > 0
    }
    addRenderAction(renderAction) {
        this.renderActions.push(renderAction)
    }
    addLayer(cameraComponent, layer, transparent, autoClears = true) {
        const ra = new RenderAction()
        ra.renderTarget = this.renderTarget
        ra.camera = cameraComponent
        ra.layer = layer
        ra.transparent = transparent
        if (autoClears) {
            const firstRa = this.renderActions.length === 0
            ra.setupClears(firstRa ? cameraComponent : undefined, layer)
        }
        this.addRenderAction(ra)
    }
    addLayers(composition, cameraComponent, startIndex, firstLayerClears, lastLayerId, lastLayerIsTransparent = true) {
        const { layerList, subLayerList } = composition
        let clearRenderTarget = firstLayerClears
        let index = startIndex
        while (index < layerList.length) {
            const layer = layerList[index]
            const isTransparent = subLayerList[index]
            const renderedByCamera = cameraComponent.camera.layersSet.has(layer.id)
            if (renderedByCamera) {
                this.addLayer(cameraComponent, layer, isTransparent, clearRenderTarget)
                clearRenderTarget = false
            }
            index++
            if (layer.id === lastLayerId && isTransparent === lastLayerIsTransparent) {
                break
            }
        }
        return index
    }
    updateDirectionalShadows() {
        const { renderer, renderActions } = this
        for (let i = 0; i < renderActions.length; i++) {
            const renderAction = renderActions[i]
            const cameraComp = renderAction.camera
            const camera = cameraComp.camera
            const shadowDirLights = this.renderer.cameraDirShadowLights.get(camera)
            if (shadowDirLights) {
                for (let l = 0; l < shadowDirLights.length; l++) {
                    const light = shadowDirLights[l]
                    if (renderer.dirLightShadows.get(light) !== camera) {
                        renderer.dirLightShadows.set(light, camera)
                        const shadowPass = renderer._shadowRendererDirectional.getLightRenderPass(light, camera)
                        if (shadowPass) {
                            this.beforePasses.push(shadowPass)
                        }
                    }
                }
            }
        }
    }
    updateClears() {
        const renderAction = this.renderActions[0]
        if (renderAction) {
            const cameraComponent = renderAction.camera
            const camera = cameraComponent.camera
            const fullSizeClearRect = camera.fullSizeClearRect
            this.setClearColor(fullSizeClearRect && renderAction.clearColor ? camera.clearColor : undefined)
            this.setClearDepth(
                fullSizeClearRect && renderAction.clearDepth && !this.noDepthClear ? camera.clearDepth : undefined,
            )
            this.setClearStencil(fullSizeClearRect && renderAction.clearStencil ? camera.clearStencil : undefined)
        }
    }
    frameUpdate() {
        super.frameUpdate()
        this.updateDirectionalShadows()
        this.updateClears()
    }
    before() {
        const { renderActions } = this
        for (let i = 0; i < renderActions.length; i++) {
            const ra = renderActions[i]
            if (ra.firstCameraUse) {
                this.scene.fire(EVENT_PRERENDER, ra.camera)
            }
        }
    }
    execute() {
        const { layerComposition, renderActions } = this
        for (let i = 0; i < renderActions.length; i++) {
            const ra = renderActions[i]
            const layer = ra.layer
            if (layerComposition.isEnabled(layer, ra.transparent)) {
                this.renderRenderAction(ra, i === 0)
            }
        }
    }
    after() {
        for (let i = 0; i < this.renderActions.length; i++) {
            const ra = this.renderActions[i]
            if (ra.lastCameraUse) {
                this.scene.fire(EVENT_POSTRENDER, ra.camera)
            }
        }
        this.beforePasses.length = 0
    }
    renderRenderAction(renderAction, firstRenderAction) {
        const { renderer, scene } = this
        const device = renderer.device
        const { layer, transparent, camera } = renderAction
        if (camera) {
            const originalGammaCorrection = camera.gammaCorrection
            const originalToneMapping = camera.toneMapping
            if (this.gammaCorrection !== undefined) camera.gammaCorrection = this.gammaCorrection
            if (this.toneMapping !== undefined) camera.toneMapping = this.toneMapping
            scene.fire(EVENT_PRERENDER_LAYER, camera, layer, transparent)
            const options = {
                lightClusters: renderAction.lightClusters,
            }
            const shaderPass = camera.camera.shaderPassInfo?.index ?? SHADER_FORWARD
            if (!firstRenderAction || !camera.camera.fullSizeClearRect) {
                options.clearColor = renderAction.clearColor
                options.clearDepth = renderAction.clearDepth
                options.clearStencil = renderAction.clearStencil
            }
            const renderTarget = renderAction.renderTarget ?? device.backBuffer
            renderer.renderForwardLayer(
                camera.camera,
                renderTarget,
                layer,
                transparent,
                shaderPass,
                renderAction.viewBindGroups,
                options,
            )
            device.setBlendState(BlendState.NOBLEND)
            device.setStencilState(null, null)
            device.setAlphaToCoverage(false)
            scene.fire(EVENT_POSTRENDER_LAYER, camera, layer, transparent)
            if (this.gammaCorrection !== undefined) camera.gammaCorrection = originalGammaCorrection
            if (this.toneMapping !== undefined) camera.toneMapping = originalToneMapping
        }
    }
    constructor(device, layerComposition, scene, renderer) {
        ;(super(device), (this.renderActions = []), (this.noDepthClear = false))
        this.layerComposition = layerComposition
        this.scene = scene
        this.renderer = renderer
    }
}

class RenderPassPostprocessing extends RenderPass {
    execute() {
        const renderAction = this.renderAction
        const camera = renderAction.camera
        camera.onPostprocessing()
    }
    constructor(device, renderer, renderAction) {
        super(device)
        this.renderer = renderer
        this.renderAction = renderAction
        this.requiresCubemaps = false
    }
}

const _noLights = [[], [], []]
const tmpColor$1 = new Color()
const _drawCallList = {
    drawCalls: [],
    shaderInstances: [],
    isNewMaterial: [],
    lightMaskChanged: [],
    clear: function () {
        this.drawCalls.length = 0
        this.shaderInstances.length = 0
        this.isNewMaterial.length = 0
        this.lightMaskChanged.length = 0
    },
}
function vogelDiskPrecalculationSamples(numSamples) {
    const samples = []
    for (let i = 0; i < numSamples; ++i) {
        const r = Math.sqrt(i + 0.5) / Math.sqrt(numSamples)
        samples.push(r)
    }
    return samples
}
function vogelSpherePrecalculationSamples(numSamples) {
    const samples = []
    for (let i = 0; i < numSamples; i++) {
        const weight = i / numSamples
        const radius = Math.sqrt(weight * weight)
        samples.push(radius)
    }
    return samples
}
class ForwardRenderer extends Renderer {
    destroy() {
        super.destroy()
    }
    dispatchGlobalLights(scene) {
        const ambientUniform = this.ambientColor
        tmpColor$1.linear(scene.ambientLight)
        ambientUniform[0] = tmpColor$1.r
        ambientUniform[1] = tmpColor$1.g
        ambientUniform[2] = tmpColor$1.b
        if (scene.physicalUnits) {
            for (let i = 0; i < 3; i++) {
                ambientUniform[i] *= scene.ambientLuminance
            }
        }
        this.ambientId.setValue(ambientUniform)
        this.skyboxIntensityId.setValue(scene.physicalUnits ? scene.skyboxLuminance : scene.skyboxIntensity)
        this.cubeMapRotationMatrixId.setValue(scene._skyboxRotationMat3.data)
    }
    _resolveLight(scope, i) {
        const light = `light${i}`
        this.lightColorId[i] = scope.resolve(`${light}_color`)
        this.lightDir[i] = new Float32Array(3)
        this.lightDirId[i] = scope.resolve(`${light}_direction`)
        this.lightShadowMapId[i] = scope.resolve(`${light}_shadowMap`)
        this.lightShadowMatrixId[i] = scope.resolve(`${light}_shadowMatrix`)
        this.lightShadowParamsId[i] = scope.resolve(`${light}_shadowParams`)
        this.lightShadowIntensity[i] = scope.resolve(`${light}_shadowIntensity`)
        this.lightShadowSearchAreaId[i] = scope.resolve(`${light}_shadowSearchArea`)
        this.lightRadiusId[i] = scope.resolve(`${light}_radius`)
        this.lightPos[i] = new Float32Array(3)
        this.lightPosId[i] = scope.resolve(`${light}_position`)
        this.lightWidth[i] = new Float32Array(3)
        this.lightWidthId[i] = scope.resolve(`${light}_halfWidth`)
        this.lightHeight[i] = new Float32Array(3)
        this.lightHeightId[i] = scope.resolve(`${light}_halfHeight`)
        this.lightInAngleId[i] = scope.resolve(`${light}_innerConeAngle`)
        this.lightOutAngleId[i] = scope.resolve(`${light}_outerConeAngle`)
        this.lightCookieId[i] = scope.resolve(`${light}_cookie`)
        this.lightCookieIntId[i] = scope.resolve(`${light}_cookieIntensity`)
        this.lightCookieMatrixId[i] = scope.resolve(`${light}_cookieMatrix`)
        this.lightCookieOffsetId[i] = scope.resolve(`${light}_cookieOffset`)
        this.lightCameraParamsId[i] = scope.resolve(`${light}_cameraParams`)
        this.lightSoftShadowParamsId[i] = scope.resolve(`${light}_softShadowParams`)
        this.shadowMatrixPaletteId[i] = scope.resolve(`${light}_shadowMatrixPalette[0]`)
        this.shadowCascadeDistancesId[i] = scope.resolve(`${light}_shadowCascadeDistances`)
        this.shadowCascadeCountId[i] = scope.resolve(`${light}_shadowCascadeCount`)
        this.shadowCascadeBlendId[i] = scope.resolve(`${light}_shadowCascadeBlend`)
    }
    setLTCDirectionalLight(wtm, cnt, dir, campos, far) {
        this.lightPos[cnt][0] = campos.x - dir.x * far
        this.lightPos[cnt][1] = campos.y - dir.y * far
        this.lightPos[cnt][2] = campos.z - dir.z * far
        this.lightPosId[cnt].setValue(this.lightPos[cnt])
        const hWidth = wtm.transformVector(new Vec3(-0.5, 0, 0))
        this.lightWidth[cnt][0] = hWidth.x * far
        this.lightWidth[cnt][1] = hWidth.y * far
        this.lightWidth[cnt][2] = hWidth.z * far
        this.lightWidthId[cnt].setValue(this.lightWidth[cnt])
        const hHeight = wtm.transformVector(new Vec3(0, 0, 0.5))
        this.lightHeight[cnt][0] = hHeight.x * far
        this.lightHeight[cnt][1] = hHeight.y * far
        this.lightHeight[cnt][2] = hHeight.z * far
        this.lightHeightId[cnt].setValue(this.lightHeight[cnt])
    }
    dispatchDirectLights(dirs, mask, camera) {
        let cnt = 0
        const scope = this.device.scope
        for (let i = 0; i < dirs.length; i++) {
            if (!(dirs[i].mask & mask)) continue
            const directional = dirs[i]
            const wtm = directional._node.getWorldTransform()
            if (!this.lightColorId[cnt]) {
                this._resolveLight(scope, cnt)
            }
            this.lightColorId[cnt].setValue(directional._colorLinear)
            wtm.getY(directional._direction).mulScalar(-1)
            directional._direction.normalize()
            this.lightDir[cnt][0] = directional._direction.x
            this.lightDir[cnt][1] = directional._direction.y
            this.lightDir[cnt][2] = directional._direction.z
            this.lightDirId[cnt].setValue(this.lightDir[cnt])
            if (directional.shape !== LIGHTSHAPE_PUNCTUAL) {
                this.setLTCDirectionalLight(
                    wtm,
                    cnt,
                    directional._direction,
                    camera._node.getPosition(),
                    camera.farClip,
                )
            }
            if (directional.castShadows) {
                const lightRenderData = directional.getRenderData(camera, 0)
                const biases = directional._getUniformBiasValues(lightRenderData)
                this.lightShadowMapId[cnt].setValue(lightRenderData.shadowBuffer)
                this.lightShadowMatrixId[cnt].setValue(lightRenderData.shadowMatrix.data)
                this.shadowMatrixPaletteId[cnt].setValue(directional._shadowMatrixPalette)
                this.shadowCascadeDistancesId[cnt].setValue(directional._shadowCascadeDistances)
                this.shadowCascadeCountId[cnt].setValue(directional.numCascades)
                this.shadowCascadeBlendId[cnt].setValue(1 - directional.cascadeBlend)
                this.lightShadowIntensity[cnt].setValue(directional.shadowIntensity)
                this.lightSoftShadowParamsId[cnt].setValue(directional._softShadowParams)
                const shadowRT = lightRenderData.shadowCamera.renderTarget
                if (shadowRT) {
                    this.lightShadowSearchAreaId[cnt].setValue(
                        (directional.penumbraSize / lightRenderData.shadowCamera.renderTarget.width) *
                            lightRenderData.projectionCompensation,
                    )
                }
                const cameraParams = directional._shadowCameraParams
                cameraParams.length = 4
                cameraParams[0] = 0
                cameraParams[1] = lightRenderData.shadowCamera._farClip
                cameraParams[2] = lightRenderData.shadowCamera._nearClip
                cameraParams[3] = 1
                this.lightCameraParamsId[cnt].setValue(cameraParams)
                const params = directional._shadowRenderParams
                params.length = 4
                params[0] = directional._shadowResolution
                params[1] = biases.normalBias
                params[2] = biases.bias
                params[3] = 0
                this.lightShadowParamsId[cnt].setValue(params)
            }
            cnt++
        }
        return cnt
    }
    setLTCPositionalLight(wtm, cnt) {
        const hWidth = wtm.transformVector(new Vec3(-0.5, 0, 0))
        this.lightWidth[cnt][0] = hWidth.x
        this.lightWidth[cnt][1] = hWidth.y
        this.lightWidth[cnt][2] = hWidth.z
        this.lightWidthId[cnt].setValue(this.lightWidth[cnt])
        const hHeight = wtm.transformVector(new Vec3(0, 0, 0.5))
        this.lightHeight[cnt][0] = hHeight.x
        this.lightHeight[cnt][1] = hHeight.y
        this.lightHeight[cnt][2] = hHeight.z
        this.lightHeightId[cnt].setValue(this.lightHeight[cnt])
    }
    dispatchOmniLight(scope, omni, cnt) {
        const wtm = omni._node.getWorldTransform()
        if (!this.lightColorId[cnt]) {
            this._resolveLight(scope, cnt)
        }
        this.lightRadiusId[cnt].setValue(omni.attenuationEnd)
        this.lightColorId[cnt].setValue(omni._colorLinear)
        wtm.getTranslation(omni._position)
        this.lightPos[cnt][0] = omni._position.x
        this.lightPos[cnt][1] = omni._position.y
        this.lightPos[cnt][2] = omni._position.z
        this.lightPosId[cnt].setValue(this.lightPos[cnt])
        if (omni.shape !== LIGHTSHAPE_PUNCTUAL) {
            this.setLTCPositionalLight(wtm, cnt)
        }
        if (omni.castShadows) {
            const lightRenderData = omni.getRenderData(null, 0)
            this.lightShadowMapId[cnt].setValue(lightRenderData.shadowBuffer)
            const biases = omni._getUniformBiasValues(lightRenderData)
            const params = omni._shadowRenderParams
            params.length = 4
            params[0] = omni._shadowResolution
            params[1] = biases.normalBias
            params[2] = biases.bias
            params[3] = 1.0 / omni.attenuationEnd
            this.lightShadowParamsId[cnt].setValue(params)
            this.lightShadowIntensity[cnt].setValue(omni.shadowIntensity)
            const pixelsPerMeter = omni.penumbraSize / lightRenderData.shadowCamera.renderTarget.width
            this.lightShadowSearchAreaId[cnt].setValue(pixelsPerMeter)
            const cameraParams = omni._shadowCameraParams
            cameraParams.length = 4
            cameraParams[0] = 0
            cameraParams[1] = lightRenderData.shadowCamera._farClip
            cameraParams[2] = lightRenderData.shadowCamera._nearClip
            cameraParams[3] = 0
            this.lightCameraParamsId[cnt].setValue(cameraParams)
        }
        if (omni._cookie) {
            this.lightCookieId[cnt].setValue(omni._cookie)
            this.lightShadowMatrixId[cnt].setValue(wtm.data)
            this.lightCookieIntId[cnt].setValue(omni.cookieIntensity)
        }
    }
    dispatchSpotLight(scope, spot, cnt) {
        const wtm = spot._node.getWorldTransform()
        if (!this.lightColorId[cnt]) {
            this._resolveLight(scope, cnt)
        }
        this.lightInAngleId[cnt].setValue(spot._innerConeAngleCos)
        this.lightOutAngleId[cnt].setValue(spot._outerConeAngleCos)
        this.lightRadiusId[cnt].setValue(spot.attenuationEnd)
        this.lightColorId[cnt].setValue(spot._colorLinear)
        wtm.getTranslation(spot._position)
        this.lightPos[cnt][0] = spot._position.x
        this.lightPos[cnt][1] = spot._position.y
        this.lightPos[cnt][2] = spot._position.z
        this.lightPosId[cnt].setValue(this.lightPos[cnt])
        if (spot.shape !== LIGHTSHAPE_PUNCTUAL) {
            this.setLTCPositionalLight(wtm, cnt)
        }
        wtm.getY(spot._direction).mulScalar(-1)
        spot._direction.normalize()
        this.lightDir[cnt][0] = spot._direction.x
        this.lightDir[cnt][1] = spot._direction.y
        this.lightDir[cnt][2] = spot._direction.z
        this.lightDirId[cnt].setValue(this.lightDir[cnt])
        if (spot.castShadows) {
            const lightRenderData = spot.getRenderData(null, 0)
            this.lightShadowMapId[cnt].setValue(lightRenderData.shadowBuffer)
            this.lightShadowMatrixId[cnt].setValue(lightRenderData.shadowMatrix.data)
            const biases = spot._getUniformBiasValues(lightRenderData)
            const params = spot._shadowRenderParams
            params.length = 4
            params[0] = spot._shadowResolution
            params[1] = biases.normalBias
            params[2] = biases.bias
            params[3] = 1.0 / spot.attenuationEnd
            this.lightShadowParamsId[cnt].setValue(params)
            this.lightShadowIntensity[cnt].setValue(spot.shadowIntensity)
            const pixelsPerMeter = spot.penumbraSize / lightRenderData.shadowCamera.renderTarget.width
            const fov = lightRenderData.shadowCamera._fov * math.DEG_TO_RAD
            const fovRatio = 1.0 / Math.tan(fov / 2.0)
            this.lightShadowSearchAreaId[cnt].setValue(pixelsPerMeter * fovRatio)
            const cameraParams = spot._shadowCameraParams
            cameraParams.length = 4
            cameraParams[0] = 0
            cameraParams[1] = lightRenderData.shadowCamera._farClip
            cameraParams[2] = lightRenderData.shadowCamera._nearClip
            cameraParams[3] = 0
            this.lightCameraParamsId[cnt].setValue(cameraParams)
        }
        if (spot._cookie) {
            if (!spot.castShadows) {
                const cookieMatrix = LightCamera.evalSpotCookieMatrix(spot)
                this.lightShadowMatrixId[cnt].setValue(cookieMatrix.data)
            }
            this.lightCookieId[cnt].setValue(spot._cookie)
            this.lightCookieIntId[cnt].setValue(spot.cookieIntensity)
            if (spot._cookieTransform) {
                spot._cookieTransformUniform[0] = spot._cookieTransform.x
                spot._cookieTransformUniform[1] = spot._cookieTransform.y
                spot._cookieTransformUniform[2] = spot._cookieTransform.z
                spot._cookieTransformUniform[3] = spot._cookieTransform.w
                this.lightCookieMatrixId[cnt].setValue(spot._cookieTransformUniform)
                spot._cookieOffsetUniform[0] = spot._cookieOffset.x
                spot._cookieOffsetUniform[1] = spot._cookieOffset.y
                this.lightCookieOffsetId[cnt].setValue(spot._cookieOffsetUniform)
            }
        }
    }
    dispatchLocalLights(sortedLights, mask, usedDirLights) {
        let cnt = usedDirLights
        const scope = this.device.scope
        const omnis = sortedLights[LIGHTTYPE_OMNI]
        const numOmnis = omnis.length
        for (let i = 0; i < numOmnis; i++) {
            const omni = omnis[i]
            if (!(omni.mask & mask)) continue
            this.dispatchOmniLight(scope, omni, cnt)
            cnt++
        }
        const spts = sortedLights[LIGHTTYPE_SPOT]
        const numSpts = spts.length
        for (let i = 0; i < numSpts; i++) {
            const spot = spts[i]
            if (!(spot.mask & mask)) continue
            this.dispatchSpotLight(scope, spot, cnt)
            cnt++
        }
    }
    renderForwardPrepareMaterials(camera, renderTarget, drawCalls, sortedLights, layer, pass) {
        const fogParams = camera.fogParams ?? this.scene.fog
        const shaderParams = camera.shaderParams
        shaderParams.fog = fogParams.type
        shaderParams.srgbRenderTarget = renderTarget?.isColorBufferSrgb(0) ?? false
        const addCall = (drawCall, shaderInstance, isNewMaterial, lightMaskChanged) => {
            _drawCallList.drawCalls.push(drawCall)
            _drawCallList.shaderInstances.push(shaderInstance)
            _drawCallList.isNewMaterial.push(isNewMaterial)
            _drawCallList.lightMaskChanged.push(lightMaskChanged)
        }
        _drawCallList.clear()
        const device = this.device
        const scene = this.scene
        const clusteredLightingEnabled = scene.clusteredLightingEnabled
        const lightHash = layer?.getLightHash(clusteredLightingEnabled) ?? 0
        let prevMaterial = null,
            prevObjDefs,
            prevLightMask
        const drawCallsCount = drawCalls.length
        for (let i = 0; i < drawCallsCount; i++) {
            const drawCall = drawCalls[i]
            const instancingData = drawCall.instancingData
            if (instancingData && instancingData.count <= 0) {
                continue
            }
            drawCall.ensureMaterial(device)
            const material = drawCall.material
            const objDefs = drawCall._shaderDefs
            const lightMask = drawCall.mask
            if (material && material === prevMaterial && objDefs !== prevObjDefs) {
                prevMaterial = null
            }
            if (material !== prevMaterial) {
                this._materialSwitches++
                material._scene = scene
                if (material.dirty) {
                    material.updateUniforms(device, scene)
                    material.dirty = false
                }
            }
            const shaderInstance = drawCall.getShaderInstance(
                pass,
                lightHash,
                scene,
                shaderParams,
                this.viewUniformFormat,
                this.viewBindGroupFormat,
                sortedLights,
            )
            addCall(drawCall, shaderInstance, material !== prevMaterial, !prevMaterial || lightMask !== prevLightMask)
            prevMaterial = material
            prevObjDefs = objDefs
            prevLightMask = lightMask
        }
        return _drawCallList
    }
    renderForwardInternal(camera, preparedCalls, sortedLights, pass, drawCallback, flipFaces, viewBindGroups) {
        const device = this.device
        const scene = this.scene
        const passFlag = 1 << pass
        const flipFactor = flipFaces ? -1 : 1
        const clusteredLightingEnabled = scene.clusteredLightingEnabled
        const viewList = camera.xr?.session && camera.xr.views.list.length ? camera.xr.views.list : null
        const preparedCallsCount = preparedCalls.drawCalls.length
        for (let i = 0; i < preparedCallsCount; i++) {
            const drawCall = preparedCalls.drawCalls[i]
            const newMaterial = preparedCalls.isNewMaterial[i]
            const lightMaskChanged = preparedCalls.lightMaskChanged[i]
            const shaderInstance = preparedCalls.shaderInstances[i]
            const material = drawCall.material
            const lightMask = drawCall.mask
            if (shaderInstance.shader.failed) continue
            if (newMaterial) {
                const asyncCompile = false
                device.setShader(shaderInstance.shader, asyncCompile)
                material.setParameters(device)
                if (lightMaskChanged) {
                    const usedDirLights = this.dispatchDirectLights(
                        sortedLights[LIGHTTYPE_DIRECTIONAL],
                        lightMask,
                        camera,
                    )
                    if (!clusteredLightingEnabled) {
                        this.dispatchLocalLights(sortedLights, lightMask, usedDirLights)
                    }
                }
                this.alphaTestId.setValue(material.alphaTest)
                device.setBlendState(material.blendState)
                device.setDepthState(material.depthState)
                device.setAlphaToCoverage(material.alphaToCoverage)
            }
            this.setupCullModeAndFrontFace(camera._cullFaces, flipFactor, drawCall)
            const stencilFront = drawCall.stencilFront ?? material.stencilFront
            const stencilBack = drawCall.stencilBack ?? material.stencilBack
            device.setStencilState(stencilFront, stencilBack)
            drawCall.setParameters(device, passFlag)
            device.scope.resolve('meshInstanceId').setValue(drawCall.id)
            const mesh = drawCall.mesh
            this.setVertexBuffers(device, mesh)
            this.setMorphing(device, drawCall.morphInstance)
            this.setSkinning(device, drawCall)
            const instancingData = drawCall.instancingData
            if (instancingData) {
                device.setVertexBuffer(instancingData.vertexBuffer)
            }
            this.setMeshInstanceMatrices(drawCall, true)
            this.setupMeshUniformBuffers(shaderInstance)
            const style = drawCall.renderStyle
            const indexBuffer = mesh.indexBuffer[style]
            drawCallback?.(drawCall, i)
            const indirectData = drawCall.getDrawCommands(camera)
            if (viewList) {
                for (let v = 0; v < viewList.length; v++) {
                    const view = viewList[v]
                    device.setViewport(view.viewport.x, view.viewport.y, view.viewport.z, view.viewport.w)
                    if (device.supportsUniformBuffers) {
                        const viewBindGroup = viewBindGroups[v]
                        device.setBindGroup(BINDGROUP_VIEW, viewBindGroup)
                    } else {
                        this.setupViewUniforms(view, v)
                    }
                    const first = v === 0
                    const last = v === viewList.length - 1
                    device.draw(mesh.primitive[style], indexBuffer, instancingData?.count, indirectData, first, last)
                    this._forwardDrawCalls++
                    if (drawCall.instancingData) {
                        this._instancedDrawCalls++
                    }
                }
            } else {
                device.draw(mesh.primitive[style], indexBuffer, instancingData?.count, indirectData)
                this._forwardDrawCalls++
                if (drawCall.instancingData) {
                    this._instancedDrawCalls++
                }
            }
            if (i < preparedCallsCount - 1 && !preparedCalls.isNewMaterial[i + 1]) {
                material.setParameters(device, drawCall.parameters)
            }
        }
    }
    renderForward(
        camera,
        renderTarget,
        allDrawCalls,
        sortedLights,
        pass,
        drawCallback,
        layer,
        flipFaces,
        viewBindGroups,
    ) {
        const preparedCalls = this.renderForwardPrepareMaterials(
            camera,
            renderTarget,
            allDrawCalls,
            sortedLights,
            layer,
            pass,
        )
        this.renderForwardInternal(camera, preparedCalls, sortedLights, pass, drawCallback, flipFaces, viewBindGroups)
        _drawCallList.clear()
    }
    renderForwardLayer(camera, renderTarget, layer, transparent, shaderPass, viewBindGroups, options = {}) {
        const { scene, device } = this
        const clusteredLightingEnabled = scene.clusteredLightingEnabled
        this.setupViewport(camera, renderTarget)
        let visible, splitLights
        if (layer) {
            layer.sortVisible(camera, transparent)
            const culledInstances = layer.getCulledInstances(camera)
            visible = transparent ? culledInstances.transparent : culledInstances.opaque
            scene.immediate.onPreRenderLayer(layer, visible, transparent)
            if (layer.requiresLightCube) {
                this.lightCube.update(scene.ambientLight, layer._lights)
                this.constantLightCube.setValue(this.lightCube.colors)
            }
            splitLights = layer.splitLights
        } else {
            visible = options.meshInstances
            splitLights = options.splitLights ?? _noLights
        }
        if (clusteredLightingEnabled) {
            const lightClusters = options.lightClusters ?? this.worldClustersAllocator.empty
            lightClusters.activate()
            if (layer) {
                if (!this.clustersDebugRendered && scene.lighting.debugLayer === layer.id) {
                    this.clustersDebugRendered = true
                }
            }
        }
        scene._activeCamera = camera
        const fogParams = camera.fogParams ?? this.scene.fog
        this.setFogConstants(fogParams)
        const viewList = this.setCameraUniforms(camera, renderTarget)
        if (device.supportsUniformBuffers) {
            this.setupViewUniformBuffers(viewBindGroups, this.viewUniformFormat, this.viewBindGroupFormat, viewList)
        }
        const clearColor = options.clearColor ?? false
        const clearDepth = options.clearDepth ?? false
        const clearStencil = options.clearStencil ?? false
        if (clearColor || clearDepth || clearStencil) {
            this.clear(camera, clearColor, clearDepth, clearStencil)
        }
        const flipFaces = !!(camera._flipFaces ^ renderTarget?.flipY)
        const forwardDrawCalls = this._forwardDrawCalls
        this.renderForward(
            camera,
            renderTarget,
            visible,
            splitLights,
            shaderPass,
            null,
            layer,
            flipFaces,
            viewBindGroups,
        )
        if (layer) {
            layer._forwardDrawCalls += this._forwardDrawCalls - forwardDrawCalls
        }
    }
    setFogConstants(fogParams) {
        if (fogParams.type !== FOG_NONE) {
            tmpColor$1.linear(fogParams.color)
            const fogUniform = this.fogColor
            fogUniform[0] = tmpColor$1.r
            fogUniform[1] = tmpColor$1.g
            fogUniform[2] = tmpColor$1.b
            this.fogColorId.setValue(fogUniform)
            if (fogParams.type === FOG_LINEAR) {
                this.fogStartId.setValue(fogParams.start)
                this.fogEndId.setValue(fogParams.end)
            } else {
                this.fogDensityId.setValue(fogParams.density)
            }
        }
    }
    setSceneConstants() {
        const scene = this.scene
        this.dispatchGlobalLights(scene)
        const device = this.device
        this._screenSize[0] = device.width
        this._screenSize[1] = device.height
        this._screenSize[2] = 1 / device.width
        this._screenSize[3] = 1 / device.height
        this.screenSizeId.setValue(this._screenSize)
        this.pcssDiskSamplesId.setValue(this.pcssDiskSamples)
        this.pcssSphereSamplesId.setValue(this.pcssSphereSamples)
    }
    buildFrameGraph(frameGraph, layerComposition) {
        const scene = this.scene
        frameGraph.reset()
        if (scene.clusteredLightingEnabled) {
            const { shadowsEnabled, cookiesEnabled } = scene.lighting
            this._renderPassUpdateClustered.update(
                frameGraph,
                shadowsEnabled,
                cookiesEnabled,
                this.lights,
                this.localLights,
            )
            frameGraph.addRenderPass(this._renderPassUpdateClustered)
        } else {
            this._shadowRendererLocal.buildNonClusteredRenderPasses(frameGraph, this.localLights)
        }
        let startIndex = 0
        let newStart = true
        let renderTarget = null
        const renderActions = layerComposition._renderActions
        for (let i = startIndex; i < renderActions.length; i++) {
            const renderAction = renderActions[i]
            const { layer, camera } = renderAction
            if (renderAction.useCameraPasses) {
                camera.camera.renderPasses.forEach((renderPass) => {
                    frameGraph.addRenderPass(renderPass)
                })
            } else {
                const isDepthLayer = layer.id === LAYERID_DEPTH
                const isGrabPass = isDepthLayer && (camera.renderSceneColorMap || camera.renderSceneDepthMap)
                if (newStart) {
                    newStart = false
                    startIndex = i
                    renderTarget = renderAction.renderTarget
                }
                const nextRenderAction = renderActions[i + 1]
                const isNextLayerDepth = nextRenderAction
                    ? !nextRenderAction.useCameraPasses && nextRenderAction.layer.id === LAYERID_DEPTH
                    : false
                const isNextLayerGrabPass =
                    isNextLayerDepth && (camera.renderSceneColorMap || camera.renderSceneDepthMap)
                const nextNeedDirShadows = nextRenderAction
                    ? nextRenderAction.firstCameraUse && this.cameraDirShadowLights.has(nextRenderAction.camera.camera)
                    : false
                if (
                    !nextRenderAction ||
                    nextRenderAction.renderTarget !== renderTarget ||
                    nextNeedDirShadows ||
                    isNextLayerGrabPass ||
                    isGrabPass
                ) {
                    const isDepthOnly = isDepthLayer && startIndex === i
                    if (!isDepthOnly) {
                        this.addMainRenderPass(frameGraph, layerComposition, renderTarget, startIndex, i)
                    }
                    if (isDepthLayer) {
                        if (camera.renderSceneColorMap) {
                            const colorGrabPass = camera.camera.renderPassColorGrab
                            colorGrabPass.source = camera.renderTarget
                            frameGraph.addRenderPass(colorGrabPass)
                        }
                        if (camera.renderSceneDepthMap) {
                            frameGraph.addRenderPass(camera.camera.renderPassDepthGrab)
                        }
                    }
                    if (renderAction.triggerPostprocess && camera?.onPostprocessing) {
                        const renderPass = new RenderPassPostprocessing(this.device, this, renderAction)
                        frameGraph.addRenderPass(renderPass)
                    }
                    newStart = true
                }
            }
        }
    }
    addMainRenderPass(frameGraph, layerComposition, renderTarget, startIndex, endIndex) {
        const renderPass = new RenderPassForward(this.device, layerComposition, this.scene, this)
        renderPass.init(renderTarget)
        const renderActions = layerComposition._renderActions
        for (let i = startIndex; i <= endIndex; i++) {
            renderPass.addRenderAction(renderActions[i])
        }
        frameGraph.addRenderPass(renderPass)
    }
    update(comp) {
        this.frameUpdate()
        this.shadowRenderer.frameUpdate()
        this.scene._updateSkyMesh()
        this.updateLayerComposition(comp)
        this.collectLights(comp)
        this.beginFrame(comp)
        this.setSceneConstants()
        this.gsplatDirector?.update(comp)
        this.cullComposition(comp)
        this.gpuUpdate(this.processingMeshInstances)
    }
    constructor(graphicsDevice, scene) {
        super(graphicsDevice, scene)
        const device = this.device
        this._forwardDrawCalls = 0
        this._materialSwitches = 0
        this._depthMapTime = 0
        this._forwardTime = 0
        this._sortTime = 0
        const scope = device.scope
        this.fogColorId = scope.resolve('fog_color')
        this.fogStartId = scope.resolve('fog_start')
        this.fogEndId = scope.resolve('fog_end')
        this.fogDensityId = scope.resolve('fog_density')
        this.ambientId = scope.resolve('light_globalAmbient')
        this.skyboxIntensityId = scope.resolve('skyboxIntensity')
        this.cubeMapRotationMatrixId = scope.resolve('cubeMapRotationMatrix')
        this.pcssDiskSamplesId = scope.resolve('pcssDiskSamples[0]')
        this.pcssSphereSamplesId = scope.resolve('pcssSphereSamples[0]')
        this.lightColorId = []
        this.lightDir = []
        this.lightDirId = []
        this.lightShadowMapId = []
        this.lightShadowMatrixId = []
        this.lightShadowParamsId = []
        this.lightShadowIntensity = []
        this.lightRadiusId = []
        this.lightPos = []
        this.lightPosId = []
        this.lightWidth = []
        this.lightWidthId = []
        this.lightHeight = []
        this.lightHeightId = []
        this.lightInAngleId = []
        this.lightOutAngleId = []
        this.lightCookieId = []
        this.lightCookieIntId = []
        this.lightCookieMatrixId = []
        this.lightCookieOffsetId = []
        this.lightShadowSearchAreaId = []
        this.lightCameraParamsId = []
        this.lightSoftShadowParamsId = []
        this.shadowMatrixPaletteId = []
        this.shadowCascadeDistancesId = []
        this.shadowCascadeCountId = []
        this.shadowCascadeBlendId = []
        this.screenSizeId = scope.resolve('uScreenSize')
        this._screenSize = new Float32Array(4)
        this.fogColor = new Float32Array(3)
        this.ambientColor = new Float32Array(3)
        this.pcssDiskSamples = vogelDiskPrecalculationSamples(16)
        this.pcssSphereSamples = vogelSpherePrecalculationSamples(16)
    }
}

let layerCounter = 0
const lightKeys = []
const _tempMaterials = new Set()
function sortManual(drawCallA, drawCallB) {
    return drawCallA.drawOrder - drawCallB.drawOrder
}
function sortMaterialMesh(drawCallA, drawCallB) {
    const keyA = drawCallA._sortKeyForward
    const keyB = drawCallB._sortKeyForward
    if (keyA === keyB) {
        return drawCallB.mesh.id - drawCallA.mesh.id
    }
    return keyB - keyA
}
function sortBackToFront(drawCallA, drawCallB) {
    return drawCallB._sortKeyDynamic - drawCallA._sortKeyDynamic
}
function sortFrontToBack(drawCallA, drawCallB) {
    return drawCallA._sortKeyDynamic - drawCallB._sortKeyDynamic
}
const sortCallbacks = [null, sortManual, sortMaterialMesh, sortBackToFront, sortFrontToBack]
class CulledInstances {
    constructor() {
        this.opaque = []
        this.transparent = []
    }
}
class Layer {
    set enabled(val) {
        if (val !== this._enabled) {
            this._dirtyComposition = true
            this.gsplatPlacementsDirty = true
            this._enabled = val
            if (val) {
                this.incrementCounter()
                if (this.onEnable) this.onEnable()
            } else {
                this.decrementCounter()
                if (this.onDisable) this.onDisable()
            }
        }
    }
    get enabled() {
        return this._enabled
    }
    set clearColorBuffer(val) {
        this._clearColorBuffer = val
        this._dirtyComposition = true
    }
    get clearColorBuffer() {
        return this._clearColorBuffer
    }
    set clearDepthBuffer(val) {
        this._clearDepthBuffer = val
        this._dirtyComposition = true
    }
    get clearDepthBuffer() {
        return this._clearDepthBuffer
    }
    set clearStencilBuffer(val) {
        this._clearStencilBuffer = val
        this._dirtyComposition = true
    }
    get clearStencilBuffer() {
        return this._clearStencilBuffer
    }
    get hasClusteredLights() {
        return this._clusteredLightsSet.size > 0
    }
    get clusteredLightsSet() {
        return this._clusteredLightsSet
    }
    incrementCounter() {
        if (this._refCounter === 0) {
            this._enabled = true
            if (this.onEnable) this.onEnable()
        }
        this._refCounter++
    }
    decrementCounter() {
        if (this._refCounter === 1) {
            this._enabled = false
            if (this.onDisable) this.onDisable()
        } else if (this._refCounter === 0) {
            return
        }
        this._refCounter--
    }
    addGSplatPlacement(placement) {
        if (!this.gsplatPlacementsSet.has(placement)) {
            this.gsplatPlacements.push(placement)
            this.gsplatPlacementsSet.add(placement)
            this.gsplatPlacementsDirty = true
        }
    }
    removeGSplatPlacement(placement) {
        const index = this.gsplatPlacements.indexOf(placement)
        if (index >= 0) {
            this.gsplatPlacements.splice(index, 1)
            this.gsplatPlacementsSet.delete(placement)
            this.gsplatPlacementsDirty = true
        }
    }
    addGSplatShadowCaster(placement) {
        if (!this.gsplatShadowCastersSet.has(placement)) {
            this.gsplatShadowCasters.push(placement)
            this.gsplatShadowCastersSet.add(placement)
            this.gsplatPlacementsDirty = true
        }
    }
    removeGSplatShadowCaster(placement) {
        const index = this.gsplatShadowCasters.indexOf(placement)
        if (index >= 0) {
            this.gsplatShadowCasters.splice(index, 1)
            this.gsplatShadowCastersSet.delete(placement)
            this.gsplatPlacementsDirty = true
        }
    }
    addMeshInstances(meshInstances, skipShadowCasters) {
        const destMeshInstances = this.meshInstances
        const destMeshInstancesSet = this.meshInstancesSet
        for (let i = 0; i < meshInstances.length; i++) {
            const mi = meshInstances[i]
            if (!destMeshInstancesSet.has(mi)) {
                destMeshInstances.push(mi)
                destMeshInstancesSet.add(mi)
                _tempMaterials.add(mi.material)
            }
        }
        if (!skipShadowCasters) {
            this.addShadowCasters(meshInstances)
        }
        if (_tempMaterials.size > 0) {
            const sceneShaderVer = this._shaderVersion
            _tempMaterials.forEach((mat) => {
                if (sceneShaderVer >= 0 && mat._shaderVersion !== sceneShaderVer) {
                    if (mat.getShaderVariant !== Material.prototype.getShaderVariant) {
                        mat.clearVariants()
                    }
                    mat._shaderVersion = sceneShaderVer
                }
            })
            _tempMaterials.clear()
        }
    }
    removeMeshInstances(meshInstances, skipShadowCasters) {
        const destMeshInstances = this.meshInstances
        const destMeshInstancesSet = this.meshInstancesSet
        for (let i = 0; i < meshInstances.length; i++) {
            const mi = meshInstances[i]
            if (destMeshInstancesSet.has(mi)) {
                destMeshInstancesSet.delete(mi)
                const j = destMeshInstances.indexOf(mi)
                if (j >= 0) {
                    destMeshInstances.splice(j, 1)
                }
            }
        }
        if (!skipShadowCasters) {
            this.removeShadowCasters(meshInstances)
        }
    }
    addShadowCasters(meshInstances) {
        const shadowCasters = this.shadowCasters
        const shadowCastersSet = this.shadowCastersSet
        for (let i = 0; i < meshInstances.length; i++) {
            const mi = meshInstances[i]
            if (mi.castShadow && !shadowCastersSet.has(mi)) {
                shadowCastersSet.add(mi)
                shadowCasters.push(mi)
            }
        }
    }
    removeShadowCasters(meshInstances) {
        const shadowCasters = this.shadowCasters
        const shadowCastersSet = this.shadowCastersSet
        for (let i = 0; i < meshInstances.length; i++) {
            const mi = meshInstances[i]
            if (shadowCastersSet.has(mi)) {
                shadowCastersSet.delete(mi)
                const j = shadowCasters.indexOf(mi)
                if (j >= 0) {
                    shadowCasters.splice(j, 1)
                }
            }
        }
    }
    clearMeshInstances(skipShadowCasters = false) {
        this.meshInstances.length = 0
        this.meshInstancesSet.clear()
        if (!skipShadowCasters) {
            this.shadowCasters.length = 0
            this.shadowCastersSet.clear()
        }
    }
    markLightsDirty() {
        this._lightHashDirty = true
        this._lightIdHashDirty = true
        this._splitLightsDirty = true
    }
    hasLight(light) {
        return this._lightsSet.has(light)
    }
    addLight(light) {
        const l = light.light
        if (!this._lightsSet.has(l)) {
            this._lightsSet.add(l)
            this._lights.push(l)
            this.markLightsDirty()
        }
        if (l.type !== LIGHTTYPE_DIRECTIONAL) {
            this._clusteredLightsSet.add(l)
        }
    }
    removeLight(light) {
        const l = light.light
        if (this._lightsSet.has(l)) {
            this._lightsSet.delete(l)
            this._lights.splice(this._lights.indexOf(l), 1)
            this.markLightsDirty()
        }
        if (l.type !== LIGHTTYPE_DIRECTIONAL) {
            this._clusteredLightsSet.delete(l)
        }
    }
    clearLights() {
        this._lightsSet.forEach((light) => light.removeLayer(this))
        this._lightsSet.clear()
        this._clusteredLightsSet.clear()
        this._lights.length = 0
        this.markLightsDirty()
    }
    get splitLights() {
        if (this._splitLightsDirty) {
            this._splitLightsDirty = false
            const splitLights = this._splitLights
            for (let i = 0; i < splitLights.length; i++) {
                splitLights[i].length = 0
            }
            const lights = this._lights
            for (let i = 0; i < lights.length; i++) {
                const light = lights[i]
                if (light.enabled) {
                    splitLights[light._type].push(light)
                }
            }
            for (let i = 0; i < splitLights.length; i++) {
                splitLights[i].sort((a, b) => a.key - b.key)
            }
        }
        return this._splitLights
    }
    evaluateLightHash(localLights, directionalLights, useIds) {
        let hash = 0
        const lights = this._lights
        for (let i = 0; i < lights.length; i++) {
            const isLocalLight = lights[i].type !== LIGHTTYPE_DIRECTIONAL
            if ((localLights && isLocalLight) || (directionalLights && !isLocalLight)) {
                lightKeys.push(useIds ? lights[i].id : lights[i].key)
            }
        }
        if (lightKeys.length > 0) {
            lightKeys.sort()
            hash = hash32Fnv1a(lightKeys)
            lightKeys.length = 0
        }
        return hash
    }
    getLightHash(isClustered) {
        if (this._lightHashDirty) {
            this._lightHashDirty = false
            this._lightHash = this.evaluateLightHash(!isClustered, true, false)
        }
        return this._lightHash
    }
    getLightIdHash() {
        if (this._lightIdHashDirty) {
            this._lightIdHashDirty = false
            this._lightIdHash = this.evaluateLightHash(true, false, true)
        }
        return this._lightIdHash
    }
    addCamera(camera) {
        if (!this.camerasSet.has(camera.camera)) {
            this.camerasSet.add(camera.camera)
            this.cameras.push(camera)
            this._dirtyComposition = true
        }
    }
    removeCamera(camera) {
        if (this.camerasSet.has(camera.camera)) {
            this.camerasSet.delete(camera.camera)
            const index = this.cameras.indexOf(camera)
            this.cameras.splice(index, 1)
            this._dirtyComposition = true
        }
    }
    clearCameras() {
        this.cameras.length = 0
        this.camerasSet.clear()
        this._dirtyComposition = true
    }
    _calculateSortDistances(drawCalls, camPos, camFwd) {
        const count = drawCalls.length
        const { x: px, y: py, z: pz } = camPos
        const { x: fx, y: fy, z: fz } = camFwd
        for (let i = 0; i < count; i++) {
            const drawCall = drawCalls[i]
            let zDist
            if (drawCall.calculateSortDistance) {
                zDist = drawCall.calculateSortDistance(drawCall, camPos, camFwd)
            } else {
                const meshPos = drawCall.aabb.center
                zDist = (meshPos.x - px) * fx + (meshPos.y - py) * fy + (meshPos.z - pz) * fz
            }
            const bucket = drawCall._drawBucket * 1e9
            drawCall._sortKeyDynamic = bucket + zDist
        }
    }
    getCulledInstances(camera) {
        let instances = this._visibleInstances.get(camera)
        if (!instances) {
            instances = new CulledInstances()
            this._visibleInstances.set(camera, instances)
        }
        return instances
    }
    sortVisible(camera, transparent) {
        const sortMode = transparent ? this.transparentSortMode : this.opaqueSortMode
        if (sortMode === SORTMODE_NONE) {
            return
        }
        const culledInstances = this.getCulledInstances(camera)
        const instances = transparent ? culledInstances.transparent : culledInstances.opaque
        const cameraNode = camera.node
        if (sortMode === SORTMODE_CUSTOM) {
            const sortPos = cameraNode.getPosition()
            const sortDir = cameraNode.forward
            if (this.customCalculateSortValues) {
                this.customCalculateSortValues(instances, instances.length, sortPos, sortDir)
            }
            if (this.customSortCallback) {
                instances.sort(this.customSortCallback)
            }
        } else {
            if (sortMode === SORTMODE_BACK2FRONT || sortMode === SORTMODE_FRONT2BACK) {
                const sortPos = cameraNode.getPosition()
                const sortDir = cameraNode.forward
                this._calculateSortDistances(instances, sortPos, sortDir)
            }
            instances.sort(sortCallbacks[sortMode])
        }
    }
    constructor(options = {}) {
        this.meshInstances = []
        this.meshInstancesSet = new Set()
        this.shadowCasters = []
        this.shadowCastersSet = new Set()
        this._visibleInstances = new WeakMap()
        this._lights = []
        this._lightsSet = new Set()
        this._clusteredLightsSet = new Set()
        this._splitLights = [[], [], []]
        this._splitLightsDirty = true
        this.requiresLightCube = false
        this.cameras = []
        this.camerasSet = new Set()
        this.gsplatPlacements = []
        this.gsplatPlacementsSet = new Set()
        this.gsplatShadowCasters = []
        this.gsplatShadowCastersSet = new Set()
        this.gsplatPlacementsDirty = true
        this._dirtyComposition = false
        if (options.id !== undefined) {
            this.id = options.id
            layerCounter = Math.max(this.id + 1, layerCounter)
        } else {
            this.id = layerCounter++
        }
        this.name = options.name
        this._enabled = options.enabled ?? true
        this._refCounter = this._enabled ? 1 : 0
        this.opaqueSortMode = options.opaqueSortMode ?? SORTMODE_MATERIALMESH
        this.transparentSortMode = options.transparentSortMode ?? SORTMODE_BACK2FRONT
        if (options.renderTarget) {
            this.renderTarget = options.renderTarget
        }
        this._clearColorBuffer = !!options.clearColorBuffer
        this._clearDepthBuffer = !!options.clearDepthBuffer
        this._clearStencilBuffer = !!options.clearStencilBuffer
        this.onEnable = options.onEnable
        this.onDisable = options.onDisable
        if (this._enabled && this.onEnable) {
            this.onEnable()
        }
        this.customSortCallback = null
        this.customCalculateSortValues = null
        this._lightHash = 0
        this._lightHashDirty = false
        this._lightIdHash = 0
        this._lightIdHashDirty = false
        this._shaderVersion = -1
    }
}

const cmpPriority = (a, b) => a.priority - b.priority
const sortPriority = (arr) => arr.sort(cmpPriority)

class LayerComposition extends EventHandler {
    destroy() {
        this.destroyRenderActions()
    }
    destroyRenderActions() {
        this._renderActions.forEach((ra) => ra.destroy())
        this._renderActions.length = 0
    }
    markDirty() {
        this._dirty = true
    }
    _update() {
        const len = this.layerList.length
        if (!this._dirty) {
            for (let i = 0; i < len; i++) {
                if (this.layerList[i]._dirtyComposition) {
                    this._dirty = true
                    break
                }
            }
        }
        if (this._dirty) {
            this._dirty = false
            this.cameras.length = 0
            this.camerasSet.clear()
            for (let i = 0; i < len; i++) {
                const layer = this.layerList[i]
                layer._dirtyComposition = false
                for (let j = 0; j < layer.cameras.length; j++) {
                    const cameraComponent = layer.cameras[j]
                    if (!this.camerasSet.has(cameraComponent.camera)) {
                        this.camerasSet.add(cameraComponent.camera)
                        this.cameras.push(cameraComponent)
                    }
                }
            }
            if (this.cameras.length > 1) {
                sortPriority(this.cameras)
            }
            let renderActionCount = 0
            this.destroyRenderActions()
            for (let i = 0; i < this.cameras.length; i++) {
                const camera = this.cameras[i]
                if (camera.camera.renderPasses.length > 0) {
                    this.addDummyRenderAction(renderActionCount, camera)
                    renderActionCount++
                    continue
                }
                let cameraFirstRenderAction = true
                const cameraFirstRenderActionIndex = renderActionCount
                let lastRenderAction = null
                let postProcessMarked = false
                for (let j = 0; j < len; j++) {
                    const layer = this.layerList[j]
                    const isLayerEnabled = layer.enabled && this.subLayerEnabled[j]
                    if (isLayerEnabled) {
                        if (layer.cameras.length > 0) {
                            if (camera.layers.indexOf(layer.id) >= 0) {
                                if (!postProcessMarked && layer.id === camera.disablePostEffectsLayer) {
                                    postProcessMarked = true
                                    if (lastRenderAction) {
                                        lastRenderAction.triggerPostprocess = true
                                    }
                                }
                                const isTransparent = this.subLayerList[j]
                                lastRenderAction = this.addRenderAction(
                                    renderActionCount,
                                    layer,
                                    isTransparent,
                                    camera,
                                    cameraFirstRenderAction,
                                    postProcessMarked,
                                )
                                renderActionCount++
                                cameraFirstRenderAction = false
                            }
                        }
                    }
                }
                if (cameraFirstRenderActionIndex < renderActionCount) {
                    lastRenderAction.lastCameraUse = true
                }
                if (!postProcessMarked && lastRenderAction) {
                    lastRenderAction.triggerPostprocess = true
                }
                if (camera.renderTarget && camera.postEffectsEnabled) {
                    this.propagateRenderTarget(cameraFirstRenderActionIndex - 1, camera)
                }
            }
            this._logRenderActions()
        }
    }
    getNextRenderAction(renderActionIndex) {
        const renderAction = new RenderAction()
        this._renderActions.push(renderAction)
        return renderAction
    }
    addDummyRenderAction(renderActionIndex, camera) {
        const renderAction = this.getNextRenderAction(renderActionIndex)
        renderAction.camera = camera
        renderAction.useCameraPasses = true
    }
    addRenderAction(renderActionIndex, layer, isTransparent, camera, cameraFirstRenderAction, postProcessMarked) {
        let rt = layer.id !== LAYERID_DEPTH ? camera.renderTarget : null
        let used = false
        const renderActions = this._renderActions
        for (let i = renderActionIndex - 1; i >= 0; i--) {
            if (renderActions[i].camera === camera && renderActions[i].renderTarget === rt) {
                used = true
                break
            }
        }
        if (postProcessMarked && camera.postEffectsEnabled) {
            rt = null
        }
        const renderAction = this.getNextRenderAction(renderActionIndex)
        renderAction.triggerPostprocess = false
        renderAction.layer = layer
        renderAction.transparent = isTransparent
        renderAction.camera = camera
        renderAction.renderTarget = rt
        renderAction.firstCameraUse = cameraFirstRenderAction
        renderAction.lastCameraUse = false
        const needsCameraClear = cameraFirstRenderAction || !used
        const needsLayerClear = layer.clearColorBuffer || layer.clearDepthBuffer || layer.clearStencilBuffer
        if (needsCameraClear || needsLayerClear) {
            renderAction.setupClears(needsCameraClear ? camera : undefined, layer)
        }
        return renderAction
    }
    propagateRenderTarget(startIndex, fromCamera) {
        for (let a = startIndex; a >= 0; a--) {
            const ra = this._renderActions[a]
            const layer = ra.layer
            if (ra.renderTarget && layer.id !== LAYERID_DEPTH) {
                break
            }
            if (layer.id === LAYERID_DEPTH) {
                continue
            }
            if (ra.useCameraPasses) {
                break
            }
            const thisCamera = ra?.camera.camera
            if (thisCamera) {
                if (
                    !fromCamera.camera.rect.equals(thisCamera.rect) ||
                    !fromCamera.camera.scissorRect.equals(thisCamera.scissorRect)
                ) {
                    break
                }
            }
            ra.renderTarget = fromCamera.renderTarget
        }
    }
    _logRenderActions() {}
    _isLayerAdded(layer) {
        const found = this.layerIdMap.get(layer.id) === layer
        return found
    }
    _isSublayerAdded(layer, transparent) {
        const map = transparent ? this.layerTransparentIndexMap : this.layerOpaqueIndexMap
        if (map.get(layer) !== undefined) {
            return true
        }
        return false
    }
    push(layer) {
        if (this._isLayerAdded(layer)) return
        this.layerList.push(layer)
        this.layerList.push(layer)
        this._opaqueOrder[layer.id] = this.subLayerList.push(false) - 1
        this._transparentOrder[layer.id] = this.subLayerList.push(true) - 1
        this.subLayerEnabled.push(true)
        this.subLayerEnabled.push(true)
        this._updateLayerMaps()
        this._dirty = true
        this.fire('add', layer)
    }
    insert(layer, index) {
        if (this._isLayerAdded(layer)) return
        this.layerList.splice(index, 0, layer, layer)
        this.subLayerList.splice(index, 0, false, true)
        const count = this.layerList.length
        this._updateOpaqueOrder(index, count - 1)
        this._updateTransparentOrder(index, count - 1)
        this.subLayerEnabled.splice(index, 0, true, true)
        this._updateLayerMaps()
        this._dirty = true
        this.fire('add', layer)
    }
    remove(layer) {
        let id = this.layerList.indexOf(layer)
        delete this._opaqueOrder[id]
        delete this._transparentOrder[id]
        while (id >= 0) {
            this.layerList.splice(id, 1)
            this.subLayerList.splice(id, 1)
            this.subLayerEnabled.splice(id, 1)
            id = this.layerList.indexOf(layer)
            this._dirty = true
            this.fire('remove', layer)
        }
        const count = this.layerList.length
        this._updateOpaqueOrder(0, count - 1)
        this._updateTransparentOrder(0, count - 1)
        this._updateLayerMaps()
    }
    pushOpaque(layer) {
        if (this._isSublayerAdded(layer, false)) return
        this.layerList.push(layer)
        this._opaqueOrder[layer.id] = this.subLayerList.push(false) - 1
        this.subLayerEnabled.push(true)
        this._updateLayerMaps()
        this._dirty = true
        this.fire('add', layer)
    }
    insertOpaque(layer, index) {
        if (this._isSublayerAdded(layer, false)) return
        this.layerList.splice(index, 0, layer)
        this.subLayerList.splice(index, 0, false)
        const count = this.subLayerList.length
        this._updateOpaqueOrder(index, count - 1)
        this.subLayerEnabled.splice(index, 0, true)
        this._updateLayerMaps()
        this._dirty = true
        this.fire('add', layer)
    }
    removeOpaque(layer) {
        for (let i = 0, len = this.layerList.length; i < len; i++) {
            if (this.layerList[i] === layer && !this.subLayerList[i]) {
                this.layerList.splice(i, 1)
                this.subLayerList.splice(i, 1)
                len--
                this._updateOpaqueOrder(i, len - 1)
                this.subLayerEnabled.splice(i, 1)
                this._dirty = true
                if (this.layerList.indexOf(layer) < 0) {
                    this.fire('remove', layer)
                }
                break
            }
        }
        this._updateLayerMaps()
    }
    pushTransparent(layer) {
        if (this._isSublayerAdded(layer, true)) return
        this.layerList.push(layer)
        this._transparentOrder[layer.id] = this.subLayerList.push(true) - 1
        this.subLayerEnabled.push(true)
        this._updateLayerMaps()
        this._dirty = true
        this.fire('add', layer)
    }
    insertTransparent(layer, index) {
        if (this._isSublayerAdded(layer, true)) return
        this.layerList.splice(index, 0, layer)
        this.subLayerList.splice(index, 0, true)
        const count = this.subLayerList.length
        this._updateTransparentOrder(index, count - 1)
        this.subLayerEnabled.splice(index, 0, true)
        this._updateLayerMaps()
        this._dirty = true
        this.fire('add', layer)
    }
    removeTransparent(layer) {
        for (let i = 0, len = this.layerList.length; i < len; i++) {
            if (this.layerList[i] === layer && this.subLayerList[i]) {
                this.layerList.splice(i, 1)
                this.subLayerList.splice(i, 1)
                len--
                this._updateTransparentOrder(i, len - 1)
                this.subLayerEnabled.splice(i, 1)
                this._dirty = true
                if (this.layerList.indexOf(layer) < 0) {
                    this.fire('remove', layer)
                }
                break
            }
        }
        this._updateLayerMaps()
    }
    getOpaqueIndex(layer) {
        return this.layerOpaqueIndexMap.get(layer) ?? -1
    }
    getTransparentIndex(layer) {
        return this.layerTransparentIndexMap.get(layer) ?? -1
    }
    isEnabled(layer, transparent) {
        if (layer.enabled) {
            const index = transparent ? this.getTransparentIndex(layer) : this.getOpaqueIndex(layer)
            if (index >= 0) {
                return this.subLayerEnabled[index]
            }
        }
        return false
    }
    _updateLayerMaps() {
        this.layerIdMap.clear()
        this.layerNameMap.clear()
        this.layerOpaqueIndexMap.clear()
        this.layerTransparentIndexMap.clear()
        for (let i = 0; i < this.layerList.length; i++) {
            const layer = this.layerList[i]
            this.layerIdMap.set(layer.id, layer)
            this.layerNameMap.set(layer.name, layer)
            const subLayerIndexMap = this.subLayerList[i] ? this.layerTransparentIndexMap : this.layerOpaqueIndexMap
            subLayerIndexMap.set(layer, i)
        }
    }
    getLayerById(id) {
        return this.layerIdMap.get(id) ?? null
    }
    getLayerByName(name) {
        return this.layerNameMap.get(name) ?? null
    }
    _updateOpaqueOrder(startIndex, endIndex) {
        for (let i = startIndex; i <= endIndex; i++) {
            if (this.subLayerList[i] === false) {
                this._opaqueOrder[this.layerList[i].id] = i
            }
        }
    }
    _updateTransparentOrder(startIndex, endIndex) {
        for (let i = startIndex; i <= endIndex; i++) {
            if (this.subLayerList[i] === true) {
                this._transparentOrder[this.layerList[i].id] = i
            }
        }
    }
    _sortLayersDescending(layersA, layersB, order) {
        let topLayerA = -1
        let topLayerB = -1
        for (let i = 0, len = layersA.length; i < len; i++) {
            const id = layersA[i]
            if (order.hasOwnProperty(id)) {
                topLayerA = Math.max(topLayerA, order[id])
            }
        }
        for (let i = 0, len = layersB.length; i < len; i++) {
            const id = layersB[i]
            if (order.hasOwnProperty(id)) {
                topLayerB = Math.max(topLayerB, order[id])
            }
        }
        if (topLayerA === -1 && topLayerB !== -1) {
            return 1
        } else if (topLayerB === -1 && topLayerA !== -1) {
            return -1
        }
        return topLayerB - topLayerA
    }
    sortTransparentLayers(layersA, layersB) {
        return this._sortLayersDescending(layersA, layersB, this._transparentOrder)
    }
    sortOpaqueLayers(layersA, layersB) {
        return this._sortLayersDescending(layersA, layersB, this._opaqueOrder)
    }
    constructor(name = 'Untitled') {
        ;(super(),
            (this.layerList = []),
            (this.layerIdMap = new Map()),
            (this.layerNameMap = new Map()),
            (this.layerOpaqueIndexMap = new Map()),
            (this.layerTransparentIndexMap = new Map()),
            (this.subLayerList = []),
            (this.subLayerEnabled = []),
            (this.cameras = []),
            (this.camerasSet = new Set()),
            (this._renderActions = []),
            (this._dirty = false))
        this.name = name
        this._opaqueOrder = {}
        this._transparentOrder = {}
    }
}

const tmpVec = new Vec3()
const tmpBiases = {
    bias: 0,
    normalBias: 0,
}
const tmpColor = new Color()
const chanId = {
    r: 0,
    g: 1,
    b: 2,
    a: 3,
}
const lightTypes = {
    directional: LIGHTTYPE_DIRECTIONAL,
    omni: LIGHTTYPE_OMNI,
    point: LIGHTTYPE_OMNI,
    spot: LIGHTTYPE_SPOT,
}
const directionalCascades = [
    [new Vec4(0, 0, 1, 1)],
    [new Vec4(0, 0, 0.5, 0.5), new Vec4(0, 0.5, 0.5, 0.5)],
    [new Vec4(0, 0, 0.5, 0.5), new Vec4(0, 0.5, 0.5, 0.5), new Vec4(0.5, 0, 0.5, 0.5)],
    [new Vec4(0, 0, 0.5, 0.5), new Vec4(0, 0.5, 0.5, 0.5), new Vec4(0.5, 0, 0.5, 0.5), new Vec4(0.5, 0.5, 0.5, 0.5)],
]
const channelMap = {
    rrr: 0b0001,
    ggg: 0b0010,
    bbb: 0b0100,
    aaa: 0b1000,
    rgb: 0b0111,
}
let id$2 = 0
class LightRenderData {
    destroy() {
        this.viewBindGroups.forEach((bg) => {
            bg.defaultUniformBuffer.destroy()
            bg.destroy()
        })
        this.viewBindGroups.length = 0
    }
    get shadowBuffer() {
        const rt = this.shadowCamera.renderTarget
        if (rt) {
            return this.light._isPcf ? rt.depthBuffer : rt.colorBuffer
        }
        return null
    }
    constructor(camera, face, light) {
        this.light = light
        this.camera = camera
        this.shadowCamera = ShadowRenderer.createShadowCamera(light._shadowType, light._type, face)
        this.shadowMatrix = new Mat4()
        this.shadowViewport = new Vec4(0, 0, 1, 1)
        this.shadowScissor = new Vec4(0, 0, 1, 1)
        this.projectionCompensation = 0
        this.face = face
        this.visibleCasters = []
        this.viewBindGroups = []
    }
}
class Light {
    destroy() {
        this._evtDeviceRestored?.off()
        this._evtDeviceRestored = null
        this._destroyShadowMap()
        this.releaseRenderData()
        this._renderData = null
    }
    onDeviceRestored() {
        if (this.shadowUpdateMode === SHADOWUPDATE_NONE) {
            this.shadowUpdateMode = SHADOWUPDATE_THISFRAME
        }
    }
    releaseRenderData() {
        if (this._renderData) {
            for (let i = 0; i < this._renderData.length; i++) {
                this._renderData[i].destroy()
            }
            this._renderData.length = 0
        }
    }
    addLayer(layer) {
        this.layers.add(layer)
    }
    removeLayer(layer) {
        this.layers.delete(layer)
    }
    set shadowSamples(value) {
        this._softShadowParams[0] = value
    }
    get shadowSamples() {
        return this._softShadowParams[0]
    }
    set shadowBlockerSamples(value) {
        this._softShadowParams[1] = value
    }
    get shadowBlockerSamples() {
        return this._softShadowParams[1]
    }
    set shadowBias(value) {
        if (this._shadowBias !== value) {
            this._shadowBias = value
            this._updateShadowBias()
        }
    }
    get shadowBias() {
        return this._shadowBias
    }
    set numCascades(value) {
        if (!this.cascades || this.numCascades !== value) {
            this.cascades = directionalCascades[value - 1]
            this._shadowMatrixPalette = new Float32Array(4 * 16)
            this._shadowCascadeDistances = new Float32Array(4)
            this._destroyShadowMap()
            this.updateKey()
        }
    }
    get numCascades() {
        return this.cascades.length
    }
    set cascadeBlend(value) {
        if (this._cascadeBlend !== value) {
            this._cascadeBlend = value
            this.updateKey()
        }
    }
    get cascadeBlend() {
        return this._cascadeBlend
    }
    set shadowMap(shadowMap) {
        if (this._shadowMap !== shadowMap) {
            this._destroyShadowMap()
            this._shadowMap = shadowMap
        }
    }
    get shadowMap() {
        return this._shadowMap
    }
    set mask(value) {
        if (this._mask !== value) {
            this._mask = value
            this.updateKey()
            this.updateClusteredFlags()
        }
    }
    get mask() {
        return this._mask
    }
    get numShadowFaces() {
        const type = this._type
        if (type === LIGHTTYPE_DIRECTIONAL) {
            return this.numCascades
        } else if (type === LIGHTTYPE_OMNI) {
            return 6
        }
        return 1
    }
    set type(value) {
        if (this._type === value) {
            return
        }
        this._type = value
        this._destroyShadowMap()
        this._updateShadowBias()
        this.updateKey()
        this.updateClusteredFlags()
        const stype = this._shadowType
        this._shadowType = null
        this.shadowUpdateOverrides = null
        this.shadowType = stype
    }
    get type() {
        return this._type
    }
    set shape(value) {
        if (this._shape === value) {
            return
        }
        this._shape = value
        this._destroyShadowMap()
        this.updateKey()
        this.updateClusteredFlags()
        const stype = this._shadowType
        this._shadowType = null
        this.shadowType = stype
    }
    get shape() {
        return this._shape
    }
    set usePhysicalUnits(value) {
        if (this._usePhysicalUnits !== value) {
            this._usePhysicalUnits = value
            this._updateLinearColor()
        }
    }
    get usePhysicalUnits() {
        return this._usePhysicalUnits
    }
    set shadowType(value) {
        if (this._shadowType === value) {
            return
        }
        let shadowInfo = shadowTypeInfo.get(value)
        if (!shadowInfo) {
            value = SHADOW_PCF3_32F
        }
        const device = this.device
        if (value === SHADOW_PCSS_32F && (!device.textureFloatRenderable || !device.textureFloatFilterable)) {
            value = SHADOW_PCF3_32F
        }
        if (
            this._type === LIGHTTYPE_OMNI &&
            value !== SHADOW_PCF1_32F &&
            value !== SHADOW_PCF3_32F &&
            value !== SHADOW_PCF1_16F &&
            value !== SHADOW_PCF3_16F &&
            value !== SHADOW_PCSS_32F
        ) {
            value = SHADOW_PCF3_32F
        }
        if (value === SHADOW_VSM_32F && (!device.textureFloatRenderable || !device.textureFloatFilterable)) {
            value = SHADOW_VSM_16F
        }
        if (value === SHADOW_VSM_16F && !device.textureHalfFloatRenderable) {
            value = SHADOW_PCF3_32F
        }
        shadowInfo = shadowTypeInfo.get(value)
        this._isVsm = shadowInfo?.vsm ?? false
        this._isPcf = shadowInfo?.pcf ?? false
        this._shadowType = value
        this._destroyShadowMap()
        this.updateKey()
    }
    get shadowType() {
        return this._shadowType
    }
    set enabled(value) {
        if (this._enabled !== value) {
            this._enabled = value
            this.layersDirty()
        }
    }
    get enabled() {
        return this._enabled
    }
    set castShadows(value) {
        if (this._castShadows !== value) {
            this._castShadows = value
            this._destroyShadowMap()
            this.layersDirty()
            this.updateKey()
        }
    }
    get castShadows() {
        return this._castShadows && this._mask !== MASK_BAKE && this._mask !== 0
    }
    set shadowIntensity(value) {
        if (this._shadowIntensity !== value) {
            this._shadowIntensity = value
            this.updateKey()
        }
    }
    get shadowIntensity() {
        return this._shadowIntensity
    }
    get bakeShadows() {
        return this._castShadows && this._mask === MASK_BAKE
    }
    set shadowResolution(value) {
        if (this._shadowResolution !== value) {
            if (this._type === LIGHTTYPE_OMNI) {
                value = Math.min(value, this.device.maxCubeMapSize)
            } else {
                value = Math.min(value, this.device.maxTextureSize)
            }
            this._shadowResolution = value
            this._destroyShadowMap()
        }
    }
    get shadowResolution() {
        return this._shadowResolution
    }
    set vsmBlurSize(value) {
        if (this._vsmBlurSize === value) {
            return
        }
        if (value % 2 === 0) value++
        this._vsmBlurSize = value
    }
    get vsmBlurSize() {
        return this._vsmBlurSize
    }
    set normalOffsetBias(value) {
        if (this._normalOffsetBias !== value) {
            const dirty = (!this._normalOffsetBias && value) || (this._normalOffsetBias && !value)
            this._normalOffsetBias = value
            if (dirty) {
                this.updateKey()
            }
        }
    }
    get normalOffsetBias() {
        return this._normalOffsetBias
    }
    set falloffMode(value) {
        if (this._falloffMode === value) {
            return
        }
        this._falloffMode = value
        this.updateKey()
        this.updateClusteredFlags()
    }
    get falloffMode() {
        return this._falloffMode
    }
    set innerConeAngle(value) {
        if (this._innerConeAngle === value) {
            return
        }
        this._innerConeAngle = value
        this._innerConeAngleCos = Math.cos(value * math.DEG_TO_RAD)
        this.updateClusterData(false, true)
        if (this._usePhysicalUnits) {
            this._updateLinearColor()
        }
    }
    get innerConeAngle() {
        return this._innerConeAngle
    }
    set outerConeAngle(value) {
        if (this._outerConeAngle === value) {
            return
        }
        this._outerConeAngle = value
        this._updateOuterAngle(value)
        if (this._usePhysicalUnits) {
            this._updateLinearColor()
        }
    }
    get outerConeAngle() {
        return this._outerConeAngle
    }
    set penumbraSize(value) {
        this._penumbraSize = value
        this._softShadowParams[2] = value
    }
    get penumbraSize() {
        return this._penumbraSize
    }
    set penumbraFalloff(value) {
        this._softShadowParams[3] = value
    }
    get penumbraFalloff() {
        return this._softShadowParams[3]
    }
    _updateOuterAngle(angle) {
        const radAngle = angle * math.DEG_TO_RAD
        this._outerConeAngleCos = Math.cos(radAngle)
        this._outerConeAngleSin = Math.sin(radAngle)
        this.updateClusterData(false, true)
    }
    set intensity(value) {
        if (this._intensity !== value) {
            this._intensity = value
            this._updateLinearColor()
        }
    }
    get intensity() {
        return this._intensity
    }
    set affectSpecularity(value) {
        if (this._type === LIGHTTYPE_DIRECTIONAL) {
            this._affectSpecularity = value
            this.updateKey()
        }
    }
    get affectSpecularity() {
        return this._affectSpecularity
    }
    set luminance(value) {
        if (this._luminance !== value) {
            this._luminance = value
            this._updateLinearColor()
        }
    }
    get luminance() {
        return this._luminance
    }
    get cookieMatrix() {
        if (!this._cookieMatrix) {
            this._cookieMatrix = new Mat4()
        }
        return this._cookieMatrix
    }
    get atlasViewport() {
        if (!this._atlasViewport) {
            this._atlasViewport = new Vec4(0, 0, 1, 1)
        }
        return this._atlasViewport
    }
    set cookie(value) {
        if (this._cookie === value) {
            return
        }
        this._cookie = value
        this.updateKey()
    }
    get cookie() {
        return this._cookie
    }
    set cookieFalloff(value) {
        if (this._cookieFalloff === value) {
            return
        }
        this._cookieFalloff = value
        this.updateKey()
    }
    get cookieFalloff() {
        return this._cookieFalloff
    }
    set cookieChannel(value) {
        if (this._cookieChannel === value) {
            return
        }
        if (value.length < 3) {
            const chr = value.charAt(value.length - 1)
            const addLen = 3 - value.length
            for (let i = 0; i < addLen; i++) {
                value += chr
            }
        }
        this._cookieChannel = value
        this.updateKey()
        this.updateClusteredFlags()
    }
    get cookieChannel() {
        return this._cookieChannel
    }
    set cookieTransform(value) {
        if (this._cookieTransform === value) {
            return
        }
        this._cookieTransform = value
        this._cookieTransformSet = !!value
        if (value && !this._cookieOffset) {
            this.cookieOffset = new Vec2()
            this._cookieOffsetSet = false
        }
        this.updateKey()
    }
    get cookieTransform() {
        return this._cookieTransform
    }
    set cookieOffset(value) {
        if (this._cookieOffset === value) {
            return
        }
        const xformNew = !!(this._cookieTransformSet || value)
        if (xformNew && !value && this._cookieOffset) {
            this._cookieOffset.set(0, 0)
        } else {
            this._cookieOffset = value
        }
        this._cookieOffsetSet = !!value
        if (value && !this._cookieTransform) {
            this.cookieTransform = new Vec4(1, 1, 0, 0)
            this._cookieTransformSet = false
        }
        this.updateKey()
    }
    get cookieOffset() {
        return this._cookieOffset
    }
    beginFrame() {
        this.visibleThisFrame = this._type === LIGHTTYPE_DIRECTIONAL && this._enabled
        this.maxScreenSize = 0
        this.atlasViewportAllocated = false
        this.atlasSlotUpdated = false
    }
    _destroyShadowMap() {
        this.releaseRenderData()
        if (this._shadowMap) {
            if (!this._shadowMap.cached) {
                this._shadowMap.destroy()
            }
            this._shadowMap = null
        }
        if (this.shadowUpdateMode === SHADOWUPDATE_NONE) {
            this.shadowUpdateMode = SHADOWUPDATE_THISFRAME
        }
        if (this.shadowUpdateOverrides) {
            for (let i = 0; i < this.shadowUpdateOverrides.length; i++) {
                if (this.shadowUpdateOverrides[i] === SHADOWUPDATE_NONE) {
                    this.shadowUpdateOverrides[i] = SHADOWUPDATE_THISFRAME
                }
            }
        }
    }
    getRenderData(camera, face) {
        for (let i = 0; i < this._renderData.length; i++) {
            const current = this._renderData[i]
            if (current.camera === camera && current.face === face) {
                return current
            }
        }
        const rd = new LightRenderData(camera, face, this)
        this._renderData.push(rd)
        return rd
    }
    clone() {
        const clone = new Light(this.device, this.clusteredLighting)
        clone.type = this._type
        clone.setColor(this._color)
        clone.intensity = this._intensity
        clone.affectSpecularity = this._affectSpecularity
        clone.luminance = this._luminance
        clone.castShadows = this.castShadows
        clone._enabled = this._enabled
        clone.attenuationStart = this.attenuationStart
        clone.attenuationEnd = this.attenuationEnd
        clone.falloffMode = this._falloffMode
        clone.shadowType = this._shadowType
        clone.vsmBlurSize = this._vsmBlurSize
        clone.vsmBlurMode = this.vsmBlurMode
        clone.vsmBias = this.vsmBias
        clone.shadowUpdateMode = this.shadowUpdateMode
        clone.mask = this.mask
        if (this.shadowUpdateOverrides) {
            clone.shadowUpdateOverrides = this.shadowUpdateOverrides.slice()
        }
        clone.innerConeAngle = this._innerConeAngle
        clone.outerConeAngle = this._outerConeAngle
        clone.numCascades = this.numCascades
        clone.cascadeDistribution = this.cascadeDistribution
        clone.cascadeBlend = this._cascadeBlend
        clone.shape = this._shape
        clone.shadowDepthState.copy(this.shadowDepthState)
        clone.shadowBias = this.shadowBias
        clone.normalOffsetBias = this._normalOffsetBias
        clone.shadowResolution = this._shadowResolution
        clone.shadowDistance = this.shadowDistance
        clone.shadowIntensity = this.shadowIntensity
        clone.shadowSamples = this.shadowSamples
        clone.shadowBlockerSamples = this.shadowBlockerSamples
        clone.penumbraSize = this.penumbraSize
        clone.penumbraFalloff = this.penumbraFalloff
        return clone
    }
    static getLightUnitConversion(type, outerAngle = Math.PI / 4, innerAngle = 0) {
        switch (type) {
            case LIGHTTYPE_SPOT: {
                const falloffEnd = Math.cos(outerAngle)
                const falloffStart = Math.cos(innerAngle)
                return 2 * Math.PI * (1 - falloffStart + (falloffStart - falloffEnd) / 2.0)
            }
            case LIGHTTYPE_OMNI:
                return 4 * Math.PI
            case LIGHTTYPE_DIRECTIONAL:
                return 1
        }
    }
    _getUniformBiasValues(lightRenderData) {
        const farClip = lightRenderData.shadowCamera._farClip
        switch (this._type) {
            case LIGHTTYPE_OMNI:
                tmpBiases.bias = this.shadowBias
                tmpBiases.normalBias = this._normalOffsetBias
                break
            case LIGHTTYPE_SPOT:
                if (this._isVsm) {
                    tmpBiases.bias = -1e-5 * 20
                } else {
                    tmpBiases.bias = this.shadowBias * 20
                }
                tmpBiases.normalBias = this._isVsm ? this.vsmBias / (this.attenuationEnd / 7.0) : this._normalOffsetBias
                break
            case LIGHTTYPE_DIRECTIONAL:
                if (this._isVsm) {
                    tmpBiases.bias = -1e-5 * 20
                } else {
                    tmpBiases.bias = (this.shadowBias / farClip) * 100
                }
                tmpBiases.normalBias = this._isVsm ? this.vsmBias / (farClip / 7.0) : this._normalOffsetBias
                break
        }
        return tmpBiases
    }
    getColor() {
        return this._color
    }
    getBoundingSphere(sphere) {
        if (this._type === LIGHTTYPE_SPOT) {
            const size = this.attenuationEnd
            const angle = this._outerConeAngle
            const cosAngle = this._outerConeAngleCos
            const node = this._node
            tmpVec.copy(node.up)
            if (angle > 45) {
                sphere.radius = size * this._outerConeAngleSin
                tmpVec.mulScalar(-size * cosAngle)
            } else {
                sphere.radius = size / (2 * cosAngle)
                tmpVec.mulScalar(-sphere.radius)
            }
            sphere.center.add2(node.getPosition(), tmpVec)
        } else if (this._type === LIGHTTYPE_OMNI) {
            sphere.center = this._node.getPosition()
            sphere.radius = this.attenuationEnd
        }
    }
    getBoundingBox(box) {
        if (this._type === LIGHTTYPE_SPOT) {
            const range = this.attenuationEnd
            const angle = this._outerConeAngle
            const node = this._node
            const scl = Math.abs(Math.sin(angle * math.DEG_TO_RAD) * range)
            box.center.set(0, -range * 0.5, 0)
            box.halfExtents.set(scl, range * 0.5, scl)
            box.setFromTransformedAabb(box, node.getWorldTransform(), true)
        } else if (this._type === LIGHTTYPE_OMNI) {
            box.center.copy(this._node.getPosition())
            box.halfExtents.set(this.attenuationEnd, this.attenuationEnd, this.attenuationEnd)
        }
    }
    _updateShadowBias() {
        if (this._type === LIGHTTYPE_OMNI && !this.clusteredLighting) {
            this.shadowDepthState.depthBias = 0
            this.shadowDepthState.depthBiasSlope = 0
        } else {
            const bias = this.shadowBias * -1e3
            this.shadowDepthState.depthBias = bias
            this.shadowDepthState.depthBiasSlope = bias
        }
    }
    _updateLinearColor() {
        let intensity = this._intensity
        if (this._usePhysicalUnits) {
            intensity =
                this._luminance /
                Light.getLightUnitConversion(
                    this._type,
                    this._outerConeAngle * math.DEG_TO_RAD,
                    this._innerConeAngle * math.DEG_TO_RAD,
                )
        }
        const color = this._color
        const colorLinear = this._colorLinear
        if (intensity >= 1) {
            tmpColor.linear(color).mulScalar(intensity)
        } else {
            tmpColor.copy(color).mulScalar(intensity).linear()
        }
        colorLinear[0] = tmpColor.r
        colorLinear[1] = tmpColor.g
        colorLinear[2] = tmpColor.b
        this.updateClusterData(true)
    }
    setColor() {
        if (arguments.length === 1) {
            this._color.set(arguments[0].r, arguments[0].g, arguments[0].b)
        } else if (arguments.length === 3) {
            this._color.set(arguments[0], arguments[1], arguments[2])
        }
        this._updateLinearColor()
    }
    layersDirty() {
        this.layers.forEach((layer) => {
            if (layer.hasLight(this)) {
                layer.markLightsDirty()
            }
        })
    }
    updateKey() {
        let key =
            (this._type << 29) |
            (this._shadowType << 25) |
            (this._falloffMode << 23) |
            ((this._normalOffsetBias !== 0.0 ? 1 : 0) << 22) |
            ((this._cookie ? 1 : 0) << 21) |
            ((this._cookieFalloff ? 1 : 0) << 20) |
            (chanId[this._cookieChannel.charAt(0)] << 18) |
            ((this._cookieTransform ? 1 : 0) << 12) |
            (this._shape << 10) |
            ((this.numCascades > 0 ? 1 : 0) << 9) |
            ((this._cascadeBlend > 0 ? 1 : 0) << 8) |
            ((this.affectSpecularity ? 1 : 0) << 7) |
            (this.mask << 6) |
            ((this._castShadows ? 1 : 0) << 3)
        if (this._cookieChannel.length === 3) {
            key |= chanId[this._cookieChannel.charAt(1)] << 16
            key |= chanId[this._cookieChannel.charAt(2)] << 14
        }
        if (key !== this.key) {
            this.layersDirty()
        }
        this.key = key
    }
    updateClusteredFlags() {
        const isDynamic = !!(this.mask & MASK_AFFECT_DYNAMIC)
        const isLightmapped = !!(this.mask & MASK_AFFECT_LIGHTMAPPED)
        this.clusteredFlags =
            ((this.type === LIGHTTYPE_SPOT ? 1 : 0) << 30) |
            ((this._shape & 0x3) << 28) |
            ((this._falloffMode & 0x1) << 27) |
            ((channelMap[this._cookieChannel] ?? 0) << 23) |
            ((isDynamic ? 1 : 0) << 22) |
            ((isLightmapped ? 1 : 0) << 21)
    }
    getClusteredFlags(castShadows, useCookie) {
        return (
            this.clusteredFlags |
            (((castShadows ? Math.floor(this.shadowIntensity * 255) : 0) & 0xff) << 0) |
            (((useCookie ? Math.floor(this.cookieIntensity * 255) : 0) & 0xff) << 8)
        )
    }
    updateClusterData(updateColor, updateAngles) {
        const { clusteredData16 } = this
        const float2Half = FloatPacking.float2Half
        if (updateColor) {
            clusteredData16[0] = float2Half(math.clamp(this._colorLinear[0] / LIGHT_COLOR_DIVIDER, 0, 65504))
            clusteredData16[1] = float2Half(math.clamp(this._colorLinear[1] / LIGHT_COLOR_DIVIDER, 0, 65504))
            clusteredData16[2] = float2Half(math.clamp(this._colorLinear[2] / LIGHT_COLOR_DIVIDER, 0, 65504))
        }
        if (updateAngles) {
            const cosThreshold = 0.5
            let flags = 0
            const angleShrinkFactor = 0.99
            let innerCos = Math.cos(this._innerConeAngle * angleShrinkFactor * math.DEG_TO_RAD)
            if (innerCos > cosThreshold) {
                innerCos = 1.0 - innerCos
                flags |= 1
            }
            let outerCos = Math.cos(this._outerConeAngle * angleShrinkFactor * math.DEG_TO_RAD)
            if (outerCos > cosThreshold) {
                outerCos = 1.0 - outerCos
                flags |= 2
            }
            clusteredData16[3] = flags
            clusteredData16[4] = float2Half(innerCos)
            clusteredData16[5] = float2Half(outerCos)
        }
    }
    constructor(graphicsDevice, clusteredLighting) {
        this.layers = new Set()
        this.shadowDepthState = DepthState.DEFAULT.clone()
        this.clusteredFlags = 0
        this.clusteredData = new Uint32Array(3)
        this.clusteredData16 = new Uint16Array(this.clusteredData.buffer)
        this._evtDeviceRestored = null
        this.device = graphicsDevice
        this.clusteredLighting = clusteredLighting
        this.id = id$2++
        this._evtDeviceRestored = graphicsDevice.on('devicerestored', this.onDeviceRestored, this)
        this._type = LIGHTTYPE_DIRECTIONAL
        this._color = new Color(0.8, 0.8, 0.8)
        this._intensity = 1
        this._affectSpecularity = true
        this._luminance = 0
        this._castShadows = false
        this._enabled = false
        this._mask = MASK_AFFECT_DYNAMIC
        this.isStatic = false
        this.key = 0
        this.bakeDir = true
        this.bakeNumSamples = 1
        this.bakeArea = 0
        this.attenuationStart = 10
        this.attenuationEnd = 10
        this._falloffMode = LIGHTFALLOFF_LINEAR
        this._shadowType = SHADOW_PCF3_32F
        this._vsmBlurSize = 11
        this.vsmBlurMode = BLUR_GAUSSIAN
        this.vsmBias = 0.01 * 0.25
        this._cookie = null
        this.cookieIntensity = 1
        this._cookieFalloff = true
        this._cookieChannel = 'rgb'
        this._cookieTransform = null
        this._cookieTransformUniform = new Float32Array(4)
        this._cookieOffset = null
        this._cookieOffsetUniform = new Float32Array(2)
        this._cookieTransformSet = false
        this._cookieOffsetSet = false
        this._innerConeAngle = 40
        this._outerConeAngle = 45
        this.cascades = null
        this._shadowMatrixPalette = null
        this._shadowCascadeDistances = null
        this.numCascades = 1
        this._cascadeBlend = 0
        this.cascadeDistribution = 0.5
        this._shape = LIGHTSHAPE_PUNCTUAL
        this._colorLinear = new Float32Array(3)
        this._updateLinearColor()
        this._position = new Vec3(0, 0, 0)
        this._direction = new Vec3(0, 0, 0)
        this._innerConeAngleCos = Math.cos(this._innerConeAngle * math.DEG_TO_RAD)
        this._updateOuterAngle(this._outerConeAngle)
        this._usePhysicalUnits = undefined
        this._shadowMap = null
        this._shadowRenderParams = []
        this._shadowCameraParams = []
        this.shadowDistance = 40
        this._shadowResolution = 1024
        this._shadowBias = -5e-4
        this._shadowIntensity = 1.0
        this._normalOffsetBias = 0.0
        this.shadowUpdateMode = SHADOWUPDATE_REALTIME
        this.shadowUpdateOverrides = null
        this._isVsm = false
        this._isPcf = true
        this._softShadowParams = new Float32Array(4)
        this.shadowSamples = 16
        this.shadowBlockerSamples = 16
        this.penumbraSize = 1.0
        this.penumbraFalloff = 1.0
        this._cookieMatrix = null
        this._atlasViewport = null
        this.atlasViewportAllocated = false
        this.atlasVersion = 0
        this.atlasSlotIndex = 0
        this.atlasSlotUpdated = false
        this._node = null
        this._renderData = []
        this.visibleThisFrame = false
        this.maxScreenSize = 0
        this._updateShadowBias()
    }
}

class LightingParams {
    applySettings(render) {
        this.shadowsEnabled = render.lightingShadowsEnabled ?? this.shadowsEnabled
        this.cookiesEnabled = render.lightingCookiesEnabled ?? this.cookiesEnabled
        this.areaLightsEnabled = render.lightingAreaLightsEnabled ?? this.areaLightsEnabled
        this.shadowAtlasResolution = render.lightingShadowAtlasResolution ?? this.shadowAtlasResolution
        this.cookieAtlasResolution = render.lightingCookieAtlasResolution ?? this.cookieAtlasResolution
        this.maxLightsPerCell = render.lightingMaxLightsPerCell ?? this.maxLightsPerCell
        this.shadowType = render.lightingShadowType ?? this.shadowType
        if (render.lightingCells) {
            this.cells = new Vec3(render.lightingCells)
        }
    }
    set cells(value) {
        this._cells.copy(value)
    }
    get cells() {
        return this._cells
    }
    set maxLightsPerCell(value) {
        this._maxLightsPerCell = math.clamp(value, 1, 255)
    }
    get maxLightsPerCell() {
        return this._maxLightsPerCell
    }
    set cookieAtlasResolution(value) {
        this._cookieAtlasResolution = math.clamp(value, 32, this._maxTextureSize)
    }
    get cookieAtlasResolution() {
        return this._cookieAtlasResolution
    }
    set shadowAtlasResolution(value) {
        this._shadowAtlasResolution = math.clamp(value, 32, this._maxTextureSize)
    }
    get shadowAtlasResolution() {
        return this._shadowAtlasResolution
    }
    set shadowType(value) {
        if (this._shadowType !== value) {
            this._shadowType = value
            this._dirtyLightsFnc()
        }
    }
    get shadowType() {
        return this._shadowType
    }
    set cookiesEnabled(value) {
        if (this._cookiesEnabled !== value) {
            this._cookiesEnabled = value
            this._dirtyLightsFnc()
        }
    }
    get cookiesEnabled() {
        return this._cookiesEnabled
    }
    set areaLightsEnabled(value) {
        if (this._supportsAreaLights) {
            if (this._areaLightsEnabled !== value) {
                this._areaLightsEnabled = value
                this._dirtyLightsFnc()
            }
        }
    }
    get areaLightsEnabled() {
        return this._areaLightsEnabled
    }
    set shadowsEnabled(value) {
        if (this._shadowsEnabled !== value) {
            this._shadowsEnabled = value
            this._dirtyLightsFnc()
        }
    }
    get shadowsEnabled() {
        return this._shadowsEnabled
    }
    constructor(supportsAreaLights, maxTextureSize, dirtyLightsFnc) {
        this._areaLightsEnabled = false
        this._cells = new Vec3(10, 3, 10)
        this._maxLightsPerCell = 255
        this._shadowsEnabled = true
        this._shadowType = SHADOW_PCF3_32F
        this._shadowAtlasResolution = 2048
        this._cookiesEnabled = false
        this._cookieAtlasResolution = 2048
        this.atlasSplit = null
        this._supportsAreaLights = supportsAreaLights
        this._maxTextureSize = maxTextureSize
        this._dirtyLightsFnc = dirtyLightsFnc
    }
}

class MorphInstance {
    destroy() {
        this.shader = null
        const morph = this.morph
        if (morph) {
            this.morph = null
            morph.decRefCount()
            if (morph.refCount < 1) {
                morph.destroy()
            }
        }
        this.rtPositions?.destroy()
        this.rtPositions = null
        this.texturePositions?.destroy()
        this.texturePositions = null
        this.rtNormals?.destroy()
        this.rtNormals = null
        this.textureNormals?.destroy()
        this.textureNormals = null
    }
    clone() {
        return new MorphInstance(this.morph)
    }
    _getWeightIndex(key) {
        if (typeof key === 'string') {
            const index = this._weightMap.get(key)
            return index
        }
        return key
    }
    getWeight(key) {
        const index = this._getWeightIndex(key)
        return this._weights[index]
    }
    setWeight(key, weight) {
        const index = this._getWeightIndex(key)
        this._weights[index] = weight
        this._dirty = true
    }
    _createShader(maxCount) {
        const defines = new Map()
        defines.set('{MORPH_TEXTURE_MAX_COUNT}', maxCount)
        if (this.morph.intRenderFormat) defines.set('MORPH_INT', '')
        const outputType = this.morph.intRenderFormat ? 'uvec4' : 'vec4'
        return ShaderUtils.createShader(this.device, {
            uniqueName: `TextureMorphShader_${maxCount}-${this.morph.intRenderFormat ? 'int' : 'float'}`,
            attributes: {
                vertex_position: SEMANTIC_POSITION,
            },
            vertexChunk: 'morphVS',
            fragmentChunk: 'morphPS',
            fragmentDefines: defines,
            fragmentOutputTypes: [outputType],
        })
    }
    _updateTextureRenderTarget(renderTarget, activeCount, isPos) {
        const { morph, device } = this
        this.setAabbUniforms(isPos)
        this.morphTextureId.setValue(isPos ? morph.targetsTexturePositions : morph.targetsTextureNormals)
        device.setBlendState(BlendState.NOBLEND)
        this.countId.setValue(activeCount)
        this.morphFactor.setValue(this._shaderMorphWeights)
        this.morphIndex.setValue(this._shaderMorphIndex)
        drawQuadWithShader(device, renderTarget, this.shader)
    }
    _updateTextureMorph(activeCount) {
        this.device
        if (activeCount > 0 || !this.zeroTextures) {
            if (this.rtPositions) {
                this._updateTextureRenderTarget(this.rtPositions, activeCount, true)
            }
            if (this.rtNormals) {
                this._updateTextureRenderTarget(this.rtNormals, activeCount, false)
            }
            this.zeroTextures = activeCount === 0
        }
    }
    setAabbUniforms(isPos = true) {
        this.aabbSizeId.setValue(isPos ? this._aabbSize : this._aabbNrmSize)
        this.aabbMinId.setValue(isPos ? this._aabbMin : this._aabbNrmMin)
    }
    prepareRendering(device) {
        this.setAabbUniforms()
    }
    update() {
        this._dirty = false
        const targets = this.morph._targets
        const epsilon = 0.00001
        const weights = this._shaderMorphWeights
        const indices = this._shaderMorphIndex
        let activeCount = 0
        for (let i = 0; i < targets.length; i++) {
            if (Math.abs(this.getWeight(i)) > epsilon) {
                weights[activeCount] = this.getWeight(i)
                indices[activeCount] = i
                activeCount++
            }
        }
        this._updateTextureMorph(activeCount)
    }
    constructor(morph) {
        this.morph = morph
        morph.incRefCount()
        this.device = morph.device
        const maxNumTargets = morph._targets.length
        this.shader = this._createShader(maxNumTargets)
        this._weights = []
        this._weightMap = new Map()
        for (let v = 0; v < morph._targets.length; v++) {
            const target = morph._targets[v]
            if (target.name) {
                this._weightMap.set(target.name, v)
            }
            this.setWeight(v, target.defaultWeight)
        }
        this._shaderMorphWeights = new Float32Array(maxNumTargets)
        this._shaderMorphIndex = new Uint32Array(maxNumTargets)
        const createRT = (name, textureVar) => {
            this[textureVar] = morph._createTexture(name, morph._renderTextureFormat)
            return new RenderTarget({
                colorBuffer: this[textureVar],
                depth: false,
            })
        }
        if (morph.morphPositions) {
            this.rtPositions = createRT('MorphRTPos', 'texturePositions')
        }
        if (morph.morphNormals) {
            this.rtNormals = createRT('MorphRTNrm', 'textureNormals')
        }
        this._textureParams = new Float32Array([morph.morphTextureWidth, morph.morphTextureHeight])
        const halfSize = morph.aabb.halfExtents
        this._aabbSize = new Float32Array([halfSize.x * 4, halfSize.y * 4, halfSize.z * 4])
        const min = morph.aabb.getMin()
        this._aabbMin = new Float32Array([min.x * 2, min.y * 2, min.z * 2])
        this._aabbNrmSize = new Float32Array([2, 2, 2])
        this._aabbNrmMin = new Float32Array([-1, -1, -1])
        this.aabbSizeId = this.device.scope.resolve('aabbSize')
        this.aabbMinId = this.device.scope.resolve('aabbMin')
        this.morphTextureId = this.device.scope.resolve('morphTexture')
        this.morphFactor = this.device.scope.resolve('morphFactor[0]')
        this.morphIndex = this.device.scope.resolve('morphIndex[0]')
        this.countId = this.device.scope.resolve('count')
        this.zeroTextures = false
    }
}

class Model {
    getGraph() {
        return this.graph
    }
    setGraph(graph) {
        this.graph = graph
    }
    getCameras() {
        return this.cameras
    }
    setCameras(cameras) {
        this.cameras = cameras
    }
    getLights() {
        return this.lights
    }
    setLights(lights) {
        this.lights = lights
    }
    getMaterials() {
        const materials = []
        for (let i = 0; i < this.meshInstances.length; i++) {
            const meshInstance = this.meshInstances[i]
            if (materials.indexOf(meshInstance.material) === -1) {
                materials.push(meshInstance.material)
            }
        }
        return materials
    }
    clone() {
        const srcNodes = []
        const cloneNodes = []
        const _duplicate = function (node) {
            const newNode = node.clone()
            srcNodes.push(node)
            cloneNodes.push(newNode)
            for (let idx = 0; idx < node._children.length; idx++) {
                newNode.addChild(_duplicate(node._children[idx]))
            }
            return newNode
        }
        const cloneGraph = _duplicate(this.graph)
        const cloneMeshInstances = []
        const cloneSkinInstances = []
        const cloneMorphInstances = []
        for (let i = 0; i < this.skinInstances.length; i++) {
            const skin = this.skinInstances[i].skin
            const cloneSkinInstance = new SkinInstance(skin)
            const bones = []
            for (let j = 0; j < skin.boneNames.length; j++) {
                const boneName = skin.boneNames[j]
                const bone = cloneGraph.findByName(boneName)
                bones.push(bone)
            }
            cloneSkinInstance.bones = bones
            cloneSkinInstances.push(cloneSkinInstance)
        }
        for (let i = 0; i < this.morphInstances.length; i++) {
            const morph = this.morphInstances[i].morph
            const cloneMorphInstance = new MorphInstance(morph)
            cloneMorphInstances.push(cloneMorphInstance)
        }
        for (let i = 0; i < this.meshInstances.length; i++) {
            const meshInstance = this.meshInstances[i]
            const nodeIndex = srcNodes.indexOf(meshInstance.node)
            const cloneMeshInstance = new MeshInstance(meshInstance.mesh, meshInstance.material, cloneNodes[nodeIndex])
            if (meshInstance.skinInstance) {
                const skinInstanceIndex = this.skinInstances.indexOf(meshInstance.skinInstance)
                cloneMeshInstance.skinInstance = cloneSkinInstances[skinInstanceIndex]
            }
            if (meshInstance.morphInstance) {
                const morphInstanceIndex = this.morphInstances.indexOf(meshInstance.morphInstance)
                cloneMeshInstance.morphInstance = cloneMorphInstances[morphInstanceIndex]
            }
            cloneMeshInstances.push(cloneMeshInstance)
        }
        const clone = new Model()
        clone.graph = cloneGraph
        clone.meshInstances = cloneMeshInstances
        clone.skinInstances = cloneSkinInstances
        clone.morphInstances = cloneMorphInstances
        clone.getGraph().syncHierarchy()
        return clone
    }
    destroy() {
        const meshInstances = this.meshInstances
        for (let i = 0; i < meshInstances.length; i++) {
            meshInstances[i].destroy()
        }
        this.meshInstances.length = 0
    }
    generateWireframe() {
        MeshInstance._prepareRenderStyleForArray(this.meshInstances, RENDERSTYLE_WIREFRAME)
    }
    constructor() {
        this.graph = null
        this.meshInstances = []
        this.skinInstances = []
        this.morphInstances = []
        this.cameras = []
        this.lights = []
        this._shadersVersion = 0
        this._immutable = false
    }
}

class Morph extends RefCountedObject {
    destroy() {
        this.vertexBufferIds?.destroy()
        this.vertexBufferIds = null
        this.targetsTexturePositions?.destroy()
        this.targetsTexturePositions = null
        this.targetsTextureNormals?.destroy()
        this.targetsTextureNormals = null
    }
    get aabb() {
        if (!this._aabb) {
            const min = new Vec3()
            const max = new Vec3()
            for (let i = 0; i < this._targets.length; i++) {
                const targetAabb = this._targets[i].aabb
                min.min(targetAabb.getMin())
                max.max(targetAabb.getMax())
            }
            this._aabb = new BoundingBox()
            this._aabb.setMinMax(min, max)
        }
        return this._aabb
    }
    get morphPositions() {
        return this._morphPositions
    }
    get morphNormals() {
        return this._morphNormals
    }
    _init() {
        this._initTextureBased()
        for (let i = 0; i < this._targets.length; i++) {
            this._targets[i]._postInit()
        }
    }
    _findSparseSet(deltaArrays, ids, usedDataIndices) {
        let freeIndex = 1
        const dataCount = deltaArrays[0].length
        for (let v = 0; v < dataCount; v += 3) {
            let vertexUsed = false
            for (let i = 0; i < deltaArrays.length; i++) {
                const data = deltaArrays[i]
                if (data[v] !== 0 || data[v + 1] !== 0 || data[v + 2] !== 0) {
                    vertexUsed = true
                    break
                }
            }
            if (vertexUsed) {
                ids.push(freeIndex)
                usedDataIndices.push(v / 3)
                freeIndex++
            } else {
                ids.push(0)
            }
        }
        return freeIndex
    }
    _initTextureBased() {
        const deltaArrays = [],
            deltaInfos = []
        const targets = this._targets
        for (let i = 0; i < targets.length; i++) {
            const target = targets[i]
            if (target.options.deltaPositions) {
                deltaArrays.push(target.options.deltaPositions)
                deltaInfos.push(true)
            }
            if (target.options.deltaNormals) {
                deltaArrays.push(target.options.deltaNormals)
                deltaInfos.push(false)
            }
        }
        const ids = [],
            usedDataIndices = []
        const freeIndex = this._findSparseSet(deltaArrays, ids, usedDataIndices)
        const maxTextureSize = this.device.maxTextureSize
        let morphTextureWidth = Math.ceil(Math.sqrt(freeIndex))
        morphTextureWidth = Math.min(morphTextureWidth, maxTextureSize)
        const morphTextureHeight = Math.ceil(freeIndex / morphTextureWidth)
        if (morphTextureHeight > maxTextureSize) {
            return
        }
        this.morphTextureWidth = morphTextureWidth
        this.morphTextureHeight = morphTextureHeight
        let halfFloat = false
        const float2Half = FloatPacking.float2Half
        if (this._textureFormat === PIXELFORMAT_RGBA16F) {
            halfFloat = true
        }
        const texturesDataPositions = []
        const texturesDataNormals = []
        const textureDataSize = morphTextureWidth * morphTextureHeight * 4
        for (let i = 0; i < deltaArrays.length; i++) {
            const data = deltaArrays[i]
            const textureData =
                this._textureFormat === PIXELFORMAT_RGBA16F
                    ? new Uint16Array(textureDataSize)
                    : new Float32Array(textureDataSize)
            ;(deltaInfos[i] ? texturesDataPositions : texturesDataNormals).push(textureData)
            if (halfFloat) {
                for (let v = 0; v < usedDataIndices.length; v++) {
                    const index = usedDataIndices[v] * 3
                    const dstIndex = v * 4 + 4
                    textureData[dstIndex] = float2Half(data[index])
                    textureData[dstIndex + 1] = float2Half(data[index + 1])
                    textureData[dstIndex + 2] = float2Half(data[index + 2])
                }
            } else {
                for (let v = 0; v < usedDataIndices.length; v++) {
                    const index = usedDataIndices[v] * 3
                    const dstIndex = v * 4 + 4
                    textureData[dstIndex] = data[index]
                    textureData[dstIndex + 1] = data[index + 1]
                    textureData[dstIndex + 2] = data[index + 2]
                }
            }
        }
        if (texturesDataPositions.length > 0) {
            this.targetsTexturePositions = this._createTexture(
                'MorphPositionsTexture',
                this._textureFormat,
                targets.length,
                [texturesDataPositions],
            )
        }
        if (texturesDataNormals.length > 0) {
            this.targetsTextureNormals = this._createTexture(
                'MorphNormalsTexture',
                this._textureFormat,
                targets.length,
                [texturesDataNormals],
            )
        }
        const formatDesc = [
            {
                semantic: SEMANTIC_ATTR15,
                components: 1,
                type: TYPE_UINT32,
                asInt: true,
            },
        ]
        this.vertexBufferIds = new VertexBuffer(
            this.device,
            new VertexFormat(this.device, formatDesc, ids.length),
            ids.length,
            {
                data: new Uint32Array(ids),
            },
        )
        return true
    }
    get targets() {
        return this._targets
    }
    _updateMorphFlags() {
        this._morphPositions = false
        this._morphNormals = false
        for (let i = 0; i < this._targets.length; i++) {
            const target = this._targets[i]
            if (target.morphPositions) {
                this._morphPositions = true
            }
            if (target.morphNormals) {
                this._morphNormals = true
            }
        }
    }
    _createTexture(name, format, arrayLength, levels) {
        return new Texture(this.device, {
            levels: levels,
            arrayLength: arrayLength,
            width: this.morphTextureWidth,
            height: this.morphTextureHeight,
            format: format,
            cubemap: false,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            name: name,
        })
    }
    constructor(targets, graphicsDevice, { preferHighPrecision = false } = {}) {
        super()
        this.device = graphicsDevice
        const device = graphicsDevice
        this.preferHighPrecision = preferHighPrecision
        this._targets = targets.slice()
        const renderableHalf = device.textureHalfFloatRenderable ? PIXELFORMAT_RGBA16F : undefined
        const renderableFloat = device.textureFloatRenderable ? PIXELFORMAT_RGBA32F : undefined
        this._renderTextureFormat = this.preferHighPrecision
            ? (renderableFloat ?? renderableHalf)
            : (renderableHalf ?? renderableFloat)
        this._renderTextureFormat = this._renderTextureFormat ?? PIXELFORMAT_RGBA16U
        this.intRenderFormat = isIntegerPixelFormat(this._renderTextureFormat)
        this._textureFormat = this.preferHighPrecision ? PIXELFORMAT_RGBA32F : PIXELFORMAT_RGBA16F
        this._init()
        this._updateMorphFlags()
    }
}

class MorphTarget {
    get name() {
        return this._name
    }
    get defaultWeight() {
        return this._defaultWeight
    }
    get aabb() {
        if (!this._aabb) {
            this._aabb = new BoundingBox()
            if (this.deltaPositions) {
                this._aabb.compute(this.deltaPositions)
            }
        }
        return this._aabb
    }
    clone() {
        return new MorphTarget(this.options)
    }
    _postInit() {
        if (!this.options.preserveData) {
            this.options = null
        }
        this.used = true
    }
    constructor(options) {
        this.used = false
        this.options = options
        this._name = options.name
        this._defaultWeight = options.defaultWeight || 0
        this._aabb = options.aabb
        this.deltaPositions = options.deltaPositions
        this.morphPositions = !!options.deltaPositions
        this.morphNormals = !!options.deltaNormals
    }
}

class ShaderGeneratorShader extends ShaderGenerator {
    generateKey(options) {
        const desc = options.shaderDesc
        const vsHashGLSL = desc.vertexGLSL ? hashCode(desc.vertexGLSL) : 0
        const fsHashGLSL = desc.fragmentGLSL ? hashCode(desc.fragmentGLSL) : 0
        const vsHashWGSL = desc.vertexWGSL ? hashCode(desc.vertexWGSL) : 0
        const fsHashWGSL = desc.fragmentWGSL ? hashCode(desc.fragmentWGSL) : 0
        const definesHash = ShaderGenerator.definesHash(options.defines)
        const chunksKey = options.shaderChunks?.key ?? ''
        let key = `${desc.uniqueName}_${definesHash}_${vsHashGLSL}_${fsHashGLSL}_${vsHashWGSL}_${fsHashWGSL}_${chunksKey}`
        if (options.skin) key += '_skin'
        if (options.useInstancing) key += '_inst'
        if (options.useMorphPosition) key += '_morphp'
        if (options.useMorphNormal) key += '_morphn'
        if (options.useMorphTextureBasedInt) key += '_morphi'
        return key
    }
    createAttributesDefinition(definitionOptions, options) {
        const srcAttributes = options.shaderDesc.attributes
        const attributes = srcAttributes
            ? {
                  ...srcAttributes,
              }
            : undefined
        if (options.skin) {
            attributes.vertex_boneWeights = SEMANTIC_BLENDWEIGHT
            attributes.vertex_boneIndices = SEMANTIC_BLENDINDICES
        }
        if (options.useMorphPosition || options.useMorphNormal) {
            attributes.morph_vertex_id = SEMANTIC_ATTR15
        }
        definitionOptions.attributes = attributes
    }
    createVertexDefinition(definitionOptions, options, sharedIncludes, wgsl) {
        const desc = options.shaderDesc
        const includes = new Map(sharedIncludes)
        includes.set('transformInstancingVS', '')
        const defines = new Map(options.defines)
        if (options.skin) defines.set('SKIN', true)
        if (options.useInstancing) defines.set('INSTANCING', true)
        if (options.useMorphPosition || options.useMorphNormal) {
            defines.set('MORPHING', true)
            if (options.useMorphTextureBasedInt) defines.set('MORPHING_INT', true)
            if (options.useMorphPosition) defines.set('MORPHING_POSITION', true)
            if (options.useMorphNormal) defines.set('MORPHING_NORMAL', true)
        }
        definitionOptions.vertexCode = wgsl ? desc.vertexWGSL : desc.vertexGLSL
        definitionOptions.vertexIncludes = includes
        definitionOptions.vertexDefines = defines
    }
    createFragmentDefinition(definitionOptions, options, sharedIncludes, wgsl) {
        const desc = options.shaderDesc
        const includes = new Map(sharedIncludes)
        const defines = new Map(options.defines)
        definitionOptions.fragmentCode = wgsl ? desc.fragmentWGSL : desc.fragmentGLSL
        definitionOptions.fragmentIncludes = includes
        definitionOptions.fragmentDefines = defines
    }
    createShaderDefinition(device, options) {
        const desc = options.shaderDesc
        const wgsl =
            device.isWebGPU && !!desc.vertexWGSL && !!desc.fragmentWGSL && (options.shaderChunks?.useWGSL ?? true)
        const definitionOptions = {
            name: `ShaderMaterial-${desc.uniqueName}`,
            shaderLanguage: wgsl ? SHADERLANGUAGE_WGSL : SHADERLANGUAGE_GLSL,
            fragmentOutputTypes: desc.fragmentOutputTypes,
            meshUniformBufferFormat: desc.meshUniformBufferFormat,
            meshBindGroupFormat: desc.meshBindGroupFormat,
        }
        const shaderLanguage = wgsl ? SHADERLANGUAGE_WGSL : SHADERLANGUAGE_GLSL
        const sharedIncludes = MapUtils.merge(
            ShaderChunks.get(device, shaderLanguage),
            options.shaderChunks[shaderLanguage],
        )
        this.createAttributesDefinition(definitionOptions, options)
        this.createVertexDefinition(definitionOptions, options, sharedIncludes, wgsl)
        this.createFragmentDefinition(definitionOptions, options, sharedIncludes, wgsl)
        return ShaderDefinitionUtils.createDefinition(device, definitionOptions)
    }
}
const shaderGeneratorShader = new ShaderGeneratorShader()

class ShaderMaterial extends Material {
    set shaderDesc(value) {
        this._shaderDesc = undefined
        if (value) {
            this._shaderDesc = {
                uniqueName: value.uniqueName,
                attributes: value.attributes,
                fragmentOutputTypes: value.fragmentOutputTypes,
                vertexGLSL: value.vertexGLSL,
                fragmentGLSL: value.fragmentGLSL,
                vertexWGSL: value.vertexWGSL,
                fragmentWGSL: value.fragmentWGSL,
            }
            if (value.vertexCode || value.fragmentCode || value.shaderLanguage) {
                const language = value.shaderLanguage ?? SHADERLANGUAGE_GLSL
                if (language === SHADERLANGUAGE_GLSL) {
                    this._shaderDesc.vertexGLSL = value.vertexCode
                    this._shaderDesc.fragmentGLSL = value.fragmentCode
                } else if (language === SHADERLANGUAGE_WGSL) {
                    this._shaderDesc.vertexWGSL = value.vertexCode
                    this._shaderDesc.fragmentWGSL = value.fragmentCode
                }
            }
        }
        this.clearVariants()
    }
    get shaderDesc() {
        return this._shaderDesc
    }
    copy(source) {
        super.copy(source)
        this.shaderDesc = source.shaderDesc
        return this
    }
    getShaderVariant(params) {
        const { objDefs } = params
        const options = {
            defines: ShaderUtils.getCoreDefines(this, params),
            skin: (objDefs & SHADERDEF_SKIN) !== 0,
            useInstancing: (objDefs & SHADERDEF_INSTANCING) !== 0,
            useMorphPosition: (objDefs & SHADERDEF_MORPH_POSITION) !== 0,
            useMorphNormal: (objDefs & SHADERDEF_MORPH_NORMAL) !== 0,
            useMorphTextureBasedInt: (objDefs & SHADERDEF_MORPH_TEXTURE_BASED_INT) !== 0,
            pass: params.pass,
            gamma: params.cameraShaderParams.shaderOutputGamma,
            toneMapping: params.cameraShaderParams.toneMapping,
            fog: params.cameraShaderParams.fog,
            shaderDesc: this.shaderDesc,
            shaderChunks: this.shaderChunks,
        }
        const processingOptions = new ShaderProcessorOptions(
            params.viewUniformFormat,
            params.viewBindGroupFormat,
            params.vertexFormat,
        )
        const library = getProgramLibrary(params.device)
        library.register('shader-material', shaderGeneratorShader)
        return library.getProgram('shader-material', options, processingOptions, this.userId)
    }
    constructor(shaderDesc) {
        super()
        this.shaderDesc = shaderDesc
    }
}

var glslStreamDecl = `
uniform highp {sampler} {name};
{returnType} load{funcName}() { return texelFetch({name}, splat.uv, 0); }
{returnType} load{funcName}WithIndex(uint index) { return texelFetch({name}, ivec2(index % splatTextureSize, index / splatTextureSize), 0); }
`

var wgslStreamDecl = `
var {name}: {textureType};
fn load{funcName}() -> {returnType} { return textureLoad({name}, splat.uv, 0); }
fn load{funcName}WithIndex(index: u32) -> {returnType} { return textureLoad({name}, vec2i(i32(index % uniform.splatTextureSize), i32(index / uniform.splatTextureSize)), 0); }
`

var glslStreamOutput = `
void write{funcName}({returnType} value) {
#if {defineGuard}
        pcFragColor{index} = value;
#endif
}
`

var wgslStreamOutput = `
fn write{funcName}(value: {returnType}) {
#if {defineGuard}
        processOutput.{colorSlot} = value;
#endif
}
`

var gsplatContainerFloatReadVS$1 = `
vec3 getCenter() { return loadDataCenter().xyz; }
vec4 getColor() { return loadDataColor(); }
vec3 getScale() { return loadDataScale().xyz; }
vec4 getRotation() { return loadDataRotation(); }
`

var gsplatContainerFloatReadVS = `
fn getCenter() -> vec3f { return loadDataCenter().xyz; }
fn getColor() -> vec4f { return loadDataColor(); }
fn getScale() -> vec3f { return loadDataScale().xyz; }
fn getRotation() -> vec4f { return loadDataRotation(); }
`

var glslContainerSimpleRead = `
        vec3 getCenter() { return loadDataCenter().xyz; }
        vec4 getColor() { return loadDataColor(); }
        vec3 getScale() { return vec3(loadDataCenter().w); }
        vec4 getRotation() { return vec4(0.0, 0.0, 0.0, 1.0); }
`

var wgslContainerSimpleRead = `
        fn getCenter() -> vec3f { return loadDataCenter().xyz; }
        fn getColor() -> vec4f { return loadDataColor(); }
        fn getScale() -> vec3f { return vec3f(loadDataCenter().w); }
        fn getRotation() -> vec4f { return vec4f(0.0, 0.0, 0.0, 1.0); }
`

const serializeStreams = (streams) => streams.map((s) => `${s.name}:${s.format}:${s.storage}`).join(',')
const RE_NAME = /\{name\}/g
const RE_SAMPLER = /\{sampler\}/g
const RE_TEXTURE_TYPE = /\{textureType\}/g
const RE_RETURN_TYPE = /\{returnType\}/g
const RE_FUNC_NAME = /\{funcName\}/g
const RE_INDEX = /\{index\}/g
const RE_COLOR_SLOT = /\{colorSlot\}/g
const RE_DEFINE_GUARD = /\{defineGuard\}/g
class GSplatFormat {
    get hash() {
        if (this._hash === undefined) {
            const streamsStr = serializeStreams(this.streams)
            const extraStr = serializeStreams(this._extraStreams)
            this._hash = hashCode(streamsStr + extraStr + this._read)
        }
        return this._hash
    }
    get extraStreamsVersion() {
        return this._extraStreamsVersion
    }
    get extraStreams() {
        return this._extraStreams
    }
    get resourceStreams() {
        if (this._resourceStreams === null) {
            this._resourceStreams = [
                ...this.streams.filter((s) => s.storage !== GSPLAT_STREAM_INSTANCE),
                ...this._extraStreams.filter((s) => s.storage !== GSPLAT_STREAM_INSTANCE),
            ]
        }
        return this._resourceStreams
    }
    get instanceStreams() {
        if (this._instanceStreams === null) {
            this._instanceStreams = this._extraStreams.filter((s) => s.storage === GSPLAT_STREAM_INSTANCE)
        }
        return this._instanceStreams
    }
    addExtraStreams(streams) {
        if (!streams || streams.length === 0) return
        let added = false
        for (const s of streams) {
            if (this._streamNames.has(s.name)) {
                continue
            }
            this._extraStreams.push({
                name: s.name,
                format: s.format,
                storage: s.storage ?? GSPLAT_STREAM_RESOURCE,
            })
            this._streamNames.add(s.name)
            added = true
        }
        if (added) {
            this._extraStreamsVersion++
            this._invalidateCaches()
        }
    }
    removeExtraStreams(names) {
        if (!this.allowStreamRemoval) {
            return
        }
        let removed = false
        for (const name of names) {
            const idx = this._extraStreams.findIndex((s) => s.name === name)
            if (idx !== -1) {
                this._extraStreams.splice(idx, 1)
                this._streamNames.delete(name)
                removed = true
            }
        }
        if (removed) {
            this._extraStreamsVersion++
            this._invalidateCaches()
        }
    }
    getInputDeclarations(streamNames) {
        const isWebGPU = this._device.isWebGPU
        const template = isWebGPU ? wgslStreamDecl : glslStreamDecl
        const getShaderType = isWebGPU ? getWgslShaderType : getGlslShaderType
        const lines = []
        let streams = [...this.streams, ...this._extraStreams]
        if (streamNames) {
            streams = streams.filter((s) => streamNames.includes(s.name))
        }
        for (const stream of streams) {
            const info = getShaderType(stream.format)
            const funcName = stream.name.charAt(0).toUpperCase() + stream.name.slice(1)
            const decl = template
                .replace(RE_NAME, stream.name)
                .replace(RE_SAMPLER, info.sampler ?? '')
                .replace(RE_TEXTURE_TYPE, info.textureType ?? '')
                .replace(RE_RETURN_TYPE, info.returnType)
                .replace(RE_FUNC_NAME, funcName)
            lines.push(decl)
        }
        return lines.join('\n')
    }
    getReadCode() {
        return this._read
    }
    setWriteCode(writeGLSL, writeWGSL) {
        this._write = this._device.isWebGPU ? writeWGSL : writeGLSL
    }
    getWriteCode() {
        return this._write
    }
    getOutputDeclarations(outputStreams) {
        const isWebGPU = this._device.isWebGPU
        const lines = []
        const template = isWebGPU ? wgslStreamOutput : glslStreamOutput
        const getShaderType = isWebGPU ? getWgslShaderType : getGlslShaderType
        for (let i = 0; i < outputStreams.length; i++) {
            const stream = outputStreams[i]
            const info = getShaderType(stream.format)
            const funcName = stream.name.charAt(0).toUpperCase() + stream.name.slice(1)
            const colorSlot = i === 0 ? 'color' : `color${i}`
            const decl = template
                .replace(RE_FUNC_NAME, funcName)
                .replace(RE_RETURN_TYPE, info.returnType)
                .replace(RE_INDEX, String(i))
                .replace(RE_COLOR_SLOT, colorSlot)
                .replace(RE_DEFINE_GUARD, '1')
            lines.push(decl)
        }
        return lines.join('\n')
    }
    getOutputStubs(streams) {
        const isWebGPU = this._device.isWebGPU
        const lines = []
        const template = isWebGPU ? wgslStreamOutput : glslStreamOutput
        const getShaderType = isWebGPU ? getWgslShaderType : getGlslShaderType
        for (const stream of streams) {
            const info = getShaderType(stream.format)
            const funcName = stream.name.charAt(0).toUpperCase() + stream.name.slice(1)
            const stub = template
                .replace(RE_FUNC_NAME, funcName)
                .replace(RE_RETURN_TYPE, info.returnType)
                .replace(RE_DEFINE_GUARD, '0')
            lines.push(stub)
        }
        return lines.join('\n')
    }
    getStream(name) {
        let stream = this.streams.find((s) => s.name === name)
        if (!stream) {
            stream = this._extraStreams.find((s) => s.name === name)
        }
        return stream
    }
    _invalidateCaches() {
        this._hash = undefined
        this._resourceStreams = null
        this._instanceStreams = null
    }
    static createDefaultFormat(device) {
        return new GSplatFormat(
            device,
            [
                {
                    name: 'dataColor',
                    format: PIXELFORMAT_RGBA16F,
                },
                {
                    name: 'dataCenter',
                    format: PIXELFORMAT_RGBA32F,
                },
                {
                    name: 'dataScale',
                    format: PIXELFORMAT_RGBA16F,
                },
                {
                    name: 'dataRotation',
                    format: PIXELFORMAT_RGBA16F,
                },
            ],
            {
                readGLSL: gsplatContainerFloatReadVS$1,
                readWGSL: gsplatContainerFloatReadVS,
            },
        )
    }
    static createSimpleFormat(device) {
        return new GSplatFormat(
            device,
            [
                {
                    name: 'dataCenter',
                    format: PIXELFORMAT_RGBA32F,
                },
                {
                    name: 'dataColor',
                    format: PIXELFORMAT_RGBA16F,
                },
            ],
            {
                readGLSL: glslContainerSimpleRead,
                readWGSL: wgslContainerSimpleRead,
            },
        )
    }
    constructor(device, streams, options) {
        this.allowStreamRemoval = false
        this._extraStreams = []
        this._streamNames = new Set()
        this._extraStreamsVersion = 0
        this._resourceStreams = null
        this._instanceStreams = null
        this._device = device
        this.streams = [...streams]
        this._streamNames = new Set(this.streams.map((s) => s.name))
        const isWebGPU = device.isWebGPU
        this._read = isWebGPU ? options.readWGSL : options.readGLSL
    }
}

var glslCompactRead = `
uvec4 cachedTransformA;
uint cachedTransformB;
vec3 getCenter() {
        cachedTransformA = loadDataTransformA();
        cachedTransformB = loadDataTransformB().x;
        return vec3(uintBitsToFloat(cachedTransformA.r), uintBitsToFloat(cachedTransformA.g), uintBitsToFloat(cachedTransformA.b));
}
vec4 getColor() {
        uint packed = loadDataColor().x;
        float r = float(packed & 0x7FFu) * (4.0 / 2047.0);
        float g = float((packed >> 11u) & 0x7FFu) * (4.0 / 2047.0);
        float b = float((packed >> 22u) & 0x3FFu) * (4.0 / 1023.0);
        float a = float(cachedTransformB >> 24u) / 255.0;
        return vec4(r, g, b, a);
}
vec4 getRotation() {
        uint packed = cachedTransformA.a;
        vec3 p = vec3(
                float(packed & 0x7FFu) / 2047.0 * 2.0 - 1.0,
                float((packed >> 11u) & 0x7FFu) / 2047.0 * 2.0 - 1.0,
                float((packed >> 22u) & 0x3FFu) / 1023.0 * 2.0 - 1.0
        );
        float d = dot(p, p);
        return vec4(1.0 - d, sqrt(max(0.0, 2.0 - d)) * p);
}
vec3 getScale() {
        uint packed = cachedTransformB;
        float sx = float(packed & 0xFFu);
        float sy = float((packed >> 8u) & 0xFFu);
        float sz = float((packed >> 16u) & 0xFFu);
        const float logRange = 21.0 / 255.0;
        const float logMin = -12.0;
        return vec3(
                sx == 0.0 ? 0.0 : exp(sx * logRange + logMin),
                sy == 0.0 ? 0.0 : exp(sy * logRange + logMin),
                sz == 0.0 ? 0.0 : exp(sz * logRange + logMin)
        );
}
`

var glslCompactWrite = `
void writeSplat(vec3 center, vec4 rotation, vec3 scale, vec4 color) {
        vec3 rgb = clamp(color.rgb, 0.0, 4.0);
        uint rBits = uint(rgb.r * (2047.0 / 4.0) + 0.5);
        uint gBits = uint(rgb.g * (2047.0 / 4.0) + 0.5);
        uint bBits = uint(rgb.b * (1023.0 / 4.0) + 0.5);
        writeDataColor(uvec4(rBits | (gBits << 11u) | (bBits << 22u), 0u, 0u, 0u));
        #ifndef GSPLAT_COLOR_ONLY
                vec4 q = rotation;
                if (q.w < 0.0) q = -q;
                vec3 p = q.xyz * inversesqrt(1.0 + q.w);
                uint aBitsQ = uint(clamp((p.x * 0.5 + 0.5) * 2047.0 + 0.5, 0.0, 2047.0));
                uint bBitsQ = uint(clamp((p.y * 0.5 + 0.5) * 2047.0 + 0.5, 0.0, 2047.0));
                uint cBitsQ = uint(clamp((p.z * 0.5 + 0.5) * 1023.0 + 0.5, 0.0, 1023.0));
                uint packedQuat = aBitsQ | (bBitsQ << 11u) | (cBitsQ << 22u);
                writeDataTransformA(uvec4(floatBitsToUint(center.x), floatBitsToUint(center.y), floatBitsToUint(center.z), packedQuat));
                const float invLogRange = 255.0 / 21.0;
                const float logMin = -12.0;
                uint sxBits = scale.x < 1e-10 ? 0u : uint(clamp((log(scale.x) - logMin) * invLogRange + 0.5, 1.0, 255.0));
                uint syBits = scale.y < 1e-10 ? 0u : uint(clamp((log(scale.y) - logMin) * invLogRange + 0.5, 1.0, 255.0));
                uint szBits = scale.z < 1e-10 ? 0u : uint(clamp((log(scale.z) - logMin) * invLogRange + 0.5, 1.0, 255.0));
                uint alphaBits = uint(clamp(color.a, 0.0, 1.0) * 255.0 + 0.5);
                uint packedScale = sxBits | (syBits << 8u) | (szBits << 16u) | (alphaBits << 24u);
                writeDataTransformB(uvec4(packedScale, 0u, 0u, 0u));
        #endif
}
`

var glslPackedRead = `
uvec4 cachedTransformA;
uvec2 cachedTransformB;
vec3 getCenter() {
        cachedTransformA = loadDataTransformA();
        cachedTransformB = loadDataTransformB().xy;
        return vec3(uintBitsToFloat(cachedTransformA.r), uintBitsToFloat(cachedTransformA.g), uintBitsToFloat(cachedTransformA.b));
}
vec4 getColor() {
        #ifdef GSPLAT_COLOR_FLOAT
                return loadDataColor();
        #else
                uvec4 packedColor = loadDataColor();
                uint packed_rg = packedColor.r | (packedColor.g << 16u);
                uint packed_ba = packedColor.b | (packedColor.a << 16u);
                return vec4(unpackHalf2x16(packed_rg), unpackHalf2x16(packed_ba));
        #endif
}
vec4 getRotation() {
        vec2 rotXY = unpackHalf2x16(cachedTransformA.a);
        vec2 rotZscaleX = unpackHalf2x16(cachedTransformB.x);
        vec3 rotXYZ = vec3(rotXY, rotZscaleX.x);
        return vec4(rotXYZ, sqrt(max(0.0, 1.0 - dot(rotXYZ, rotXYZ)))).wxyz;
}
vec3 getScale() {
        vec2 rotZscaleX = unpackHalf2x16(cachedTransformB.x);
        vec2 scaleYZ = unpackHalf2x16(cachedTransformB.y);
        return vec3(rotZscaleX.y, scaleYZ);
}
`

var glslPackedWrite = `
void writeSplat(vec3 center, vec4 rotation, vec3 scale, vec4 color) {
        #ifdef GSPLAT_COLOR_UINT
                uint packed_rg = packHalf2x16(color.rg);
                uint packed_ba = packHalf2x16(color.ba);
                writeDataColor(uvec4(
                        packed_rg & 0xFFFFu,
                        packed_rg >> 16u,
                        packed_ba & 0xFFFFu,
                        packed_ba >> 16u
                ));
        #else
                writeDataColor(color);
        #endif
        #ifndef GSPLAT_COLOR_ONLY
                writeDataTransformA(uvec4(floatBitsToUint(center.x), floatBitsToUint(center.y), floatBitsToUint(center.z), packHalf2x16(rotation.xy)));
                writeDataTransformB(uvec4(packHalf2x16(vec2(rotation.z, scale.x)), packHalf2x16(scale.yz), 0u, 0u));
        #endif
}
`

var wgslCompactRead = `
var<private> cachedTransformA: vec4u;
var<private> cachedTransformB: u32;
fn getCenter() -> vec3f {
        cachedTransformA = loadDataTransformA();
        cachedTransformB = loadDataTransformB().x;
        return vec3f(bitcast<f32>(cachedTransformA.r), bitcast<f32>(cachedTransformA.g), bitcast<f32>(cachedTransformA.b));
}
fn getColor() -> vec4f {
        let packed = loadDataColor().x;
        let r = f32(packed & 0x7FFu) * (4.0 / 2047.0);
        let g = f32((packed >> 11u) & 0x7FFu) * (4.0 / 2047.0);
        let b = f32((packed >> 22u) & 0x3FFu) * (4.0 / 1023.0);
        let a = f32(cachedTransformB >> 24u) / 255.0;
        return vec4f(r, g, b, a);
}
fn getRotation() -> vec4f {
        let packed = cachedTransformA.a;
        let p = vec3f(
                f32(packed & 0x7FFu) / 2047.0 * 2.0 - 1.0,
                f32((packed >> 11u) & 0x7FFu) / 2047.0 * 2.0 - 1.0,
                f32((packed >> 22u) & 0x3FFu) / 1023.0 * 2.0 - 1.0
        );
        let d = dot(p, p);
        return vec4f(1.0 - d, sqrt(max(0.0, 2.0 - d)) * p);
}
fn getScale() -> vec3f {
        let packed = cachedTransformB;
        let sx = f32(packed & 0xFFu);
        let sy = f32((packed >> 8u) & 0xFFu);
        let sz = f32((packed >> 16u) & 0xFFu);
        let logRange = 21.0 / 255.0;
        let logMin = -12.0;
        return vec3f(
                select(exp(sx * logRange + logMin), 0.0, sx == 0.0),
                select(exp(sy * logRange + logMin), 0.0, sy == 0.0),
                select(exp(sz * logRange + logMin), 0.0, sz == 0.0)
        );
}
`

var wgslCompactWrite = `
fn writeSplat(center: vec3f, rotation: vec4f, scale: vec3f, color: vec4f) {
        let rgb = clamp(color.rgb, vec3f(0.0), vec3f(4.0));
        let rBits = u32(rgb.r * (2047.0 / 4.0) + 0.5);
        let gBits = u32(rgb.g * (2047.0 / 4.0) + 0.5);
        let bBits = u32(rgb.b * (1023.0 / 4.0) + 0.5);
        writeDataColor(vec4u(rBits | (gBits << 11u) | (bBits << 22u), 0u, 0u, 0u));
        #ifndef GSPLAT_COLOR_ONLY
                var q = rotation;
                if (q.w < 0.0) { q = -q; }
                let p = q.xyz * inverseSqrt(1.0 + q.w);
                let aBitsQ = u32(clamp(p.x * 0.5 + 0.5, 0.0, 1.0) * 2047.0 + 0.5);
                let bBitsQ = u32(clamp(p.y * 0.5 + 0.5, 0.0, 1.0) * 2047.0 + 0.5);
                let cBitsQ = u32(clamp(p.z * 0.5 + 0.5, 0.0, 1.0) * 1023.0 + 0.5);
                let packedQuat = aBitsQ | (bBitsQ << 11u) | (cBitsQ << 22u);
                writeDataTransformA(vec4u(bitcast<u32>(center.x), bitcast<u32>(center.y), bitcast<u32>(center.z), packedQuat));
                let invLogRange = 255.0 / 21.0;
                let logMin = -12.0;
                let sxBits = select(u32(clamp((log(scale.x) - logMin) * invLogRange + 0.5, 1.0, 255.0)), 0u, scale.x < 1e-10);
                let syBits = select(u32(clamp((log(scale.y) - logMin) * invLogRange + 0.5, 1.0, 255.0)), 0u, scale.y < 1e-10);
                let szBits = select(u32(clamp((log(scale.z) - logMin) * invLogRange + 0.5, 1.0, 255.0)), 0u, scale.z < 1e-10);
                let alphaBits = u32(clamp(color.a, 0.0, 1.0) * 255.0 + 0.5);
                let packedScale = sxBits | (syBits << 8u) | (szBits << 16u) | (alphaBits << 24u);
                writeDataTransformB(vec4u(packedScale, 0u, 0u, 0u));
        #endif
}
`

var wgslPackedRead = `
var<private> cachedTransformA: vec4u;
var<private> cachedTransformB: vec2u;
fn getCenter() -> vec3f {
        cachedTransformA = loadDataTransformA();
        cachedTransformB = loadDataTransformB().xy;
        return vec3f(bitcast<f32>(cachedTransformA.r), bitcast<f32>(cachedTransformA.g), bitcast<f32>(cachedTransformA.b));
}
fn getColor() -> vec4f {
        #ifdef GSPLAT_COLOR_FLOAT
                return loadDataColor();
        #else
                let packedColor = loadDataColor();
                let packed_rg = packedColor.r | (packedColor.g << 16u);
                let packed_ba = packedColor.b | (packedColor.a << 16u);
                return vec4f(unpack2x16float(packed_rg), unpack2x16float(packed_ba));
        #endif
}
fn getRotation() -> vec4f {
        let rotXY = unpack2x16float(cachedTransformA.a);
        let rotZscaleX = unpack2x16float(cachedTransformB.x);
        let rotXYZ = vec3f(rotXY, rotZscaleX.x);
        return vec4f(rotXYZ, sqrt(max(0.0, 1.0 - dot(rotXYZ, rotXYZ)))).wxyz;
}
fn getScale() -> vec3f {
        let rotZscaleX = unpack2x16float(cachedTransformB.x);
        let scaleYZ = unpack2x16float(cachedTransformB.y);
        return vec3f(rotZscaleX.y, scaleYZ);
}
`

var wgslPackedWrite = `
fn writeSplat(center: vec3f, rotation: vec4f, scale: vec3f, color: vec4f) {
        writeDataColor(color);
        #ifndef GSPLAT_COLOR_ONLY
                writeDataTransformA(vec4u(bitcast<u32>(center.x), bitcast<u32>(center.y), bitcast<u32>(center.z), pack2x16float(rotation.xy)));
                writeDataTransformB(vec4u(pack2x16float(vec2f(rotation.z, scale.x)), pack2x16float(scale.yz), 0u, 0u));
        #endif
}
`

class GSplatParams {
    _createFormat(dataFormat) {
        let format
        if (dataFormat === GSPLATDATA_COMPACT) {
            format = new GSplatFormat(
                this._device,
                [
                    {
                        name: 'dataColor',
                        format: PIXELFORMAT_R32U,
                    },
                    {
                        name: 'dataTransformA',
                        format: PIXELFORMAT_RGBA32U,
                    },
                    {
                        name: 'dataTransformB',
                        format: PIXELFORMAT_R32U,
                    },
                ],
                {
                    readGLSL: glslCompactRead,
                    readWGSL: wgslCompactRead,
                },
            )
            format.setWriteCode(glslCompactWrite, wgslCompactWrite)
        } else {
            const colorFormat = this._device.getRenderableHdrFormat([PIXELFORMAT_RGBA16F]) || PIXELFORMAT_RGBA16U
            format = new GSplatFormat(
                this._device,
                [
                    {
                        name: 'dataColor',
                        format: colorFormat,
                    },
                    {
                        name: 'dataTransformA',
                        format: PIXELFORMAT_RGBA32U,
                    },
                    {
                        name: 'dataTransformB',
                        format: PIXELFORMAT_RG32U,
                    },
                ],
                {
                    readGLSL: glslPackedRead,
                    readWGSL: wgslPackedRead,
                },
            )
            format.setWriteCode(glslPackedWrite, wgslPackedWrite)
        }
        format.allowStreamRemoval = true
        return format
    }
    set gpuSorting(value) {
        if (value !== this._gpuSorting) {
            this._gpuSorting = value
            this._syncNodeIndexStream()
        }
    }
    get gpuSorting() {
        return this._gpuSorting
    }
    set colorizeLod(value) {
        if (this._colorizeLod !== value) {
            this._colorizeLod = value
            this.dirty = true
        }
    }
    get colorizeLod() {
        return this._colorizeLod
    }
    set enableIds(value) {
        if (value && !this._enableIds) {
            this._enableIds = true
            if (!this._format.getStream('pcId')) {
                this._format.addExtraStreams([
                    {
                        name: 'pcId',
                        format: PIXELFORMAT_R32U,
                    },
                ])
            }
        } else if (!value && this._enableIds) {
            this._enableIds = false
            this._format.removeExtraStreams(['pcId'])
        }
    }
    get enableIds() {
        return this._enableIds
    }
    set culling(value) {
        if (value !== this._culling) {
            this._culling = value
            this._syncNodeIndexStream()
        }
    }
    get culling() {
        return this._culling
    }
    _syncNodeIndexStream() {
        const needsNodeIndex = this._culling && !(this._gpuSorting && this._device.isWebGPU)
        const hasNodeIndex = !!this._format.getStream('pcNodeIndex')
        if (needsNodeIndex && !hasNodeIndex) {
            this._format.addExtraStreams([
                {
                    name: 'pcNodeIndex',
                    format: PIXELFORMAT_R32U,
                },
            ])
        } else if (!needsNodeIndex && hasNodeIndex) {
            this._format.removeExtraStreams(['pcNodeIndex'])
        }
    }
    set lodBehindPenalty(value) {
        if (this._lodBehindPenalty !== value) {
            this._lodBehindPenalty = value
            this.dirty = true
        }
    }
    get lodBehindPenalty() {
        return this._lodBehindPenalty
    }
    set lodRangeMin(value) {
        if (this._lodRangeMin !== value) {
            this._lodRangeMin = value
            this.dirty = true
        }
    }
    get lodRangeMin() {
        return this._lodRangeMin
    }
    set lodRangeMax(value) {
        if (this._lodRangeMax !== value) {
            this._lodRangeMax = value
            this.dirty = true
        }
    }
    get lodRangeMax() {
        return this._lodRangeMax
    }
    set lodUnderfillLimit(value) {
        if (this._lodUnderfillLimit !== value) {
            this._lodUnderfillLimit = value
            this.dirty = true
        }
    }
    get lodUnderfillLimit() {
        return this._lodUnderfillLimit
    }
    set splatBudget(value) {
        if (this._splatBudget !== value) {
            this._splatBudget = value
            this.dirty = true
        }
    }
    get splatBudget() {
        return this._splatBudget
    }
    set colorRamp(value) {
        if (this._colorRamp !== value) {
            this._colorRamp = value
            this.dirty = true
        }
    }
    get colorRamp() {
        return this._colorRamp
    }
    set dataFormat(value) {
        if (this._dataFormat !== value) {
            this._dataFormat = value
            const extraStreams = this._format.extraStreams.map((s) => ({
                name: s.name,
                format: s.format,
                storage: s.storage,
            }))
            this._format = this._createFormat(value)
            if (extraStreams.length > 0) {
                this._format.addExtraStreams(extraStreams)
            }
            this.dirty = true
        }
    }
    get dataFormat() {
        return this._dataFormat
    }
    get material() {
        return this._material
    }
    get format() {
        return this._format
    }
    frameEnd() {
        this._material.dirty = false
        this.dirty = false
    }
    constructor(device) {
        this._material = new ShaderMaterial()
        this._dataFormat = GSPLATDATA_COMPACT
        this.debugAabbs = false
        this.radialSorting = false
        this._gpuSorting = false
        this.debugNodeAabbs = false
        this.dirty = false
        this._colorizeLod = false
        this._enableIds = false
        this._culling = false
        this.lodUpdateDistance = 1
        this.lodUpdateAngle = 0
        this._lodBehindPenalty = 1
        this._lodRangeMin = 0
        this._lodRangeMax = 10
        this._lodUnderfillLimit = 0
        this._splatBudget = 0
        this._colorRamp = null
        this.colorRampIntensity = 1
        this.colorizeColorUpdate = false
        this.colorUpdateDistance = 0.2
        this.colorUpdateAngle = 2
        this.colorUpdateDistanceLodScale = 2
        this.colorUpdateAngleLodScale = 2
        this.cooldownTicks = 100
        this._device = device
        this._format = this._createFormat(GSPLATDATA_COMPACT)
    }
}

const decodeTable = {
    linear: 'decodeLinear',
    srgb: 'decodeGamma',
    rgbm: 'decodeRGBM',
    rgbe: 'decodeRGBE',
    rgbp: 'decodeRGBP',
    xy: 'unpackNormalXY',
    xyz: 'unpackNormalXYZ',
}
const encodeTable = {
    linear: 'encodeLinear',
    srgb: 'encodeGamma',
    rgbm: 'encodeRGBM',
    rgbe: 'encodeRGBE',
    rgbp: 'encodeRGBP',
}
class ChunkUtils {
    static decodeFunc(encoding) {
        return decodeTable[encoding] ?? 'decodeGamma'
    }
    static encodeFunc(encoding) {
        return encodeTable[encoding] ?? 'encodeGamma'
    }
}

const calculateNormals = (positions, indices) => {
    const triangleCount = indices.length / 3
    const vertexCount = positions.length / 3
    const p1 = new Vec3()
    const p2 = new Vec3()
    const p3 = new Vec3()
    const p1p2 = new Vec3()
    const p1p3 = new Vec3()
    const faceNormal = new Vec3()
    const normals = []
    for (let i = 0; i < positions.length; i++) {
        normals[i] = 0
    }
    for (let i = 0; i < triangleCount; i++) {
        const i1 = indices[i * 3]
        const i2 = indices[i * 3 + 1]
        const i3 = indices[i * 3 + 2]
        p1.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2])
        p2.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2])
        p3.set(positions[i3 * 3], positions[i3 * 3 + 1], positions[i3 * 3 + 2])
        p1p2.sub2(p2, p1)
        p1p3.sub2(p3, p1)
        faceNormal.cross(p1p2, p1p3).normalize()
        normals[i1 * 3] += faceNormal.x
        normals[i1 * 3 + 1] += faceNormal.y
        normals[i1 * 3 + 2] += faceNormal.z
        normals[i2 * 3] += faceNormal.x
        normals[i2 * 3 + 1] += faceNormal.y
        normals[i2 * 3 + 2] += faceNormal.z
        normals[i3 * 3] += faceNormal.x
        normals[i3 * 3 + 1] += faceNormal.y
        normals[i3 * 3 + 2] += faceNormal.z
    }
    for (let i = 0; i < vertexCount; i++) {
        const nx = normals[i * 3]
        const ny = normals[i * 3 + 1]
        const nz = normals[i * 3 + 2]
        const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz)
        normals[i * 3] *= invLen
        normals[i * 3 + 1] *= invLen
        normals[i * 3 + 2] *= invLen
    }
    return normals
}
const calculateTangents = (positions, normals, uvs, indices) => {
    const triangleCount = indices.length / 3
    const vertexCount = positions.length / 3
    const v1 = new Vec3()
    const v2 = new Vec3()
    const v3 = new Vec3()
    const w1 = new Vec2()
    const w2 = new Vec2()
    const w3 = new Vec2()
    const sdir = new Vec3()
    const tdir = new Vec3()
    const tan1 = new Float32Array(vertexCount * 3)
    const tan2 = new Float32Array(vertexCount * 3)
    const tangents = []
    for (let i = 0; i < triangleCount; i++) {
        const i1 = indices[i * 3]
        const i2 = indices[i * 3 + 1]
        const i3 = indices[i * 3 + 2]
        v1.set(positions[i1 * 3], positions[i1 * 3 + 1], positions[i1 * 3 + 2])
        v2.set(positions[i2 * 3], positions[i2 * 3 + 1], positions[i2 * 3 + 2])
        v3.set(positions[i3 * 3], positions[i3 * 3 + 1], positions[i3 * 3 + 2])
        w1.set(uvs[i1 * 2], uvs[i1 * 2 + 1])
        w2.set(uvs[i2 * 2], uvs[i2 * 2 + 1])
        w3.set(uvs[i3 * 2], uvs[i3 * 2 + 1])
        const x1 = v2.x - v1.x
        const x2 = v3.x - v1.x
        const y1 = v2.y - v1.y
        const y2 = v3.y - v1.y
        const z1 = v2.z - v1.z
        const z2 = v3.z - v1.z
        const s1 = w2.x - w1.x
        const s2 = w3.x - w1.x
        const t1 = w2.y - w1.y
        const t2 = w3.y - w1.y
        const area = s1 * t2 - s2 * t1
        if (area === 0) {
            sdir.set(0, 1, 0)
            tdir.set(1, 0, 0)
        } else {
            const r = 1 / area
            sdir.set((t2 * x1 - t1 * x2) * r, (t2 * y1 - t1 * y2) * r, (t2 * z1 - t1 * z2) * r)
            tdir.set((s1 * x2 - s2 * x1) * r, (s1 * y2 - s2 * y1) * r, (s1 * z2 - s2 * z1) * r)
        }
        tan1[i1 * 3 + 0] += sdir.x
        tan1[i1 * 3 + 1] += sdir.y
        tan1[i1 * 3 + 2] += sdir.z
        tan1[i2 * 3 + 0] += sdir.x
        tan1[i2 * 3 + 1] += sdir.y
        tan1[i2 * 3 + 2] += sdir.z
        tan1[i3 * 3 + 0] += sdir.x
        tan1[i3 * 3 + 1] += sdir.y
        tan1[i3 * 3 + 2] += sdir.z
        tan2[i1 * 3 + 0] += tdir.x
        tan2[i1 * 3 + 1] += tdir.y
        tan2[i1 * 3 + 2] += tdir.z
        tan2[i2 * 3 + 0] += tdir.x
        tan2[i2 * 3 + 1] += tdir.y
        tan2[i2 * 3 + 2] += tdir.z
        tan2[i3 * 3 + 0] += tdir.x
        tan2[i3 * 3 + 1] += tdir.y
        tan2[i3 * 3 + 2] += tdir.z
    }
    const t1 = new Vec3()
    const t2 = new Vec3()
    const n = new Vec3()
    const temp = new Vec3()
    for (let i = 0; i < vertexCount; i++) {
        n.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
        t1.set(tan1[i * 3], tan1[i * 3 + 1], tan1[i * 3 + 2])
        t2.set(tan2[i * 3], tan2[i * 3 + 1], tan2[i * 3 + 2])
        const ndott = n.dot(t1)
        temp.copy(n).mulScalar(ndott)
        temp.sub2(t1, temp).normalize()
        tangents[i * 4] = temp.x
        tangents[i * 4 + 1] = temp.y
        tangents[i * 4 + 2] = temp.z
        temp.cross(n, t1)
        tangents[i * 4 + 3] = temp.dot(t2) < 0.0 ? -1 : 1.0
    }
    return tangents
}

class Geometry {
    calculateNormals() {
        this.normals = calculateNormals(this.positions, this.indices)
    }
    calculateTangents() {
        this.tangents = calculateTangents(this.positions, this.normals, this.uvs, this.indices)
    }
}

const primitiveUv1Padding$1 = 8.0 / 64
const primitiveUv1PaddingScale$1 = 1.0 - primitiveUv1Padding$1 * 2
class BoxGeometry extends Geometry {
    constructor(opts = {}) {
        super()
        const he = opts.halfExtents ?? new Vec3(0.5, 0.5, 0.5)
        const ws = opts.widthSegments ?? 1
        const ls = opts.lengthSegments ?? 1
        const hs = opts.heightSegments ?? 1
        const yOffset = opts.yOffset ?? 0
        const minY = -he.y + yOffset
        const maxY = he.y + yOffset
        const corners = [
            new Vec3(-he.x, minY, he.z),
            new Vec3(he.x, minY, he.z),
            new Vec3(he.x, maxY, he.z),
            new Vec3(-he.x, maxY, he.z),
            new Vec3(he.x, minY, -he.z),
            new Vec3(-he.x, minY, -he.z),
            new Vec3(-he.x, maxY, -he.z),
            new Vec3(he.x, maxY, -he.z),
        ]
        const faceAxes = [
            [0, 1, 3],
            [4, 5, 7],
            [3, 2, 6],
            [1, 0, 4],
            [1, 4, 2],
            [5, 0, 6],
        ]
        const faceNormals = [
            [0, 0, 1],
            [0, 0, -1],
            [0, 1, 0],
            [0, -1, 0],
            [1, 0, 0],
            [-1, 0, 0],
        ]
        const sides = {
            FRONT: 0,
            BACK: 1,
            TOP: 2,
            BOTTOM: 3,
            RIGHT: 4,
            LEFT: 5,
        }
        const positions = []
        const normals = []
        const uvs = []
        const uvs1 = []
        const indices = []
        let vcounter = 0
        const generateFace = (side, uSegments, vSegments) => {
            const temp1 = new Vec3()
            const temp2 = new Vec3()
            const temp3 = new Vec3()
            const r = new Vec3()
            for (let i = 0; i <= uSegments; i++) {
                for (let j = 0; j <= vSegments; j++) {
                    temp1.lerp(corners[faceAxes[side][0]], corners[faceAxes[side][1]], i / uSegments)
                    temp2.lerp(corners[faceAxes[side][0]], corners[faceAxes[side][2]], j / vSegments)
                    temp3.sub2(temp2, corners[faceAxes[side][0]])
                    r.add2(temp1, temp3)
                    let u = i / uSegments
                    let v = j / vSegments
                    positions.push(r.x, r.y, r.z)
                    normals.push(faceNormals[side][0], faceNormals[side][1], faceNormals[side][2])
                    uvs.push(u, 1 - v)
                    u = u * primitiveUv1PaddingScale$1 + primitiveUv1Padding$1
                    v = v * primitiveUv1PaddingScale$1 + primitiveUv1Padding$1
                    u /= 3
                    v /= 3
                    u += (side % 3) / 3
                    v += Math.floor(side / 3) / 3
                    uvs1.push(u, 1 - v)
                    if (i < uSegments && j < vSegments) {
                        indices.push(vcounter + vSegments + 1, vcounter + 1, vcounter)
                        indices.push(vcounter + vSegments + 1, vcounter + vSegments + 2, vcounter + 1)
                    }
                    vcounter++
                }
            }
        }
        generateFace(sides.FRONT, ws, hs)
        generateFace(sides.BACK, ws, hs)
        generateFace(sides.TOP, ws, ls)
        generateFace(sides.BOTTOM, ws, ls)
        generateFace(sides.RIGHT, ls, hs)
        generateFace(sides.LEFT, ls, hs)
        this.positions = positions
        this.normals = normals
        this.uvs = uvs
        this.uvs1 = uvs1
        this.indices = indices
        if (opts.calculateTangents) {
            this.tangents = calculateTangents(positions, normals, uvs, indices)
        }
    }
}

class SphereGeometry extends Geometry {
    constructor(opts = {}) {
        super()
        const radius = opts.radius ?? 0.5
        const latitudeBands = opts.latitudeBands ?? 16
        const longitudeBands = opts.longitudeBands ?? 16
        const positions = []
        const normals = []
        const uvs = []
        const indices = []
        for (let lat = 0; lat <= latitudeBands; lat++) {
            const theta = (lat * Math.PI) / latitudeBands
            const sinTheta = Math.sin(theta)
            const cosTheta = Math.cos(theta)
            for (let lon = 0; lon <= longitudeBands; lon++) {
                const phi = (lon * 2 * Math.PI) / longitudeBands - Math.PI / 2
                const sinPhi = Math.sin(phi)
                const cosPhi = Math.cos(phi)
                const x = cosPhi * sinTheta
                const y = cosTheta
                const z = sinPhi * sinTheta
                const u = 1 - lon / longitudeBands
                const v = 1 - lat / latitudeBands
                positions.push(x * radius, y * radius, z * radius)
                normals.push(x, y, z)
                uvs.push(u, 1 - v)
            }
        }
        for (let lat = 0; lat < latitudeBands; ++lat) {
            for (let lon = 0; lon < longitudeBands; ++lon) {
                const first = lat * (longitudeBands + 1) + lon
                const second = first + longitudeBands + 1
                indices.push(first + 1, second, first)
                indices.push(first + 1, second + 1, second)
            }
        }
        this.positions = positions
        this.normals = normals
        this.uvs = uvs
        this.uvs1 = uvs
        this.indices = indices
        if (opts.calculateTangents) {
            this.tangents = calculateTangents(positions, normals, uvs, indices)
        }
    }
}

class DomeGeometry extends SphereGeometry {
    constructor(opts = {}) {
        const radius = 0.5
        const latitudeBands = opts.latitudeBands ?? 16
        const longitudeBands = opts.longitudeBands ?? 16
        super({
            radius,
            latitudeBands,
            longitudeBands,
        })
        const bottomLimit = 0.1
        const curvatureRadius = 0.95
        const curvatureRadiusSq = curvatureRadius * curvatureRadius
        const positions = this.positions
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i] / radius
            let y = positions[i + 1] / radius
            const z = positions[i + 2] / radius
            if (y < 0) {
                y *= 0.3
                if (x * x + z * z < curvatureRadiusSq) {
                    y = -bottomLimit
                }
            }
            y += bottomLimit
            y *= radius
            positions[i + 1] = y
        }
    }
}

class SkyGeometry {
    static create(device, type) {
        switch (type) {
            case SKYTYPE_BOX:
                return SkyGeometry.box(device)
            case SKYTYPE_DOME:
                return SkyGeometry.dome(device)
        }
        return SkyGeometry.infinite(device)
    }
    static infinite(device) {
        return Mesh.fromGeometry(device, new BoxGeometry(device))
    }
    static box(device) {
        return Mesh.fromGeometry(
            device,
            new BoxGeometry({
                yOffset: 0.5,
            }),
        )
    }
    static dome(device) {
        const geom = new DomeGeometry({
            latitudeBands: 50,
            longitudeBands: 50,
        })
        geom.normals = undefined
        geom.uvs = undefined
        return Mesh.fromGeometry(device, geom)
    }
}

class SkyMesh {
    destroy() {
        if (this.meshInstance) {
            if (this.skyLayer) {
                this.skyLayer.removeMeshInstances([this.meshInstance])
            }
            this.meshInstance.destroy()
            this.meshInstance = null
        }
    }
    set depthWrite(value) {
        this._depthWrite = value
        if (this.meshInstance) {
            this.meshInstance.material.depthWrite = value
        }
    }
    get depthWrite() {
        return this._depthWrite
    }
    constructor(device, scene, node, texture, type) {
        this.meshInstance = null
        this._depthWrite = false
        const material = new ShaderMaterial({
            uniqueName: 'SkyMaterial',
            vertexGLSL: ShaderChunks.get(device, SHADERLANGUAGE_GLSL).get('skyboxVS'),
            fragmentGLSL: ShaderChunks.get(device, SHADERLANGUAGE_GLSL).get('skyboxPS'),
            vertexWGSL: ShaderChunks.get(device, SHADERLANGUAGE_WGSL).get('skyboxVS'),
            fragmentWGSL: ShaderChunks.get(device, SHADERLANGUAGE_WGSL).get('skyboxPS'),
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
        })
        material.setDefine('{SKYBOX_DECODE_FNC}', ChunkUtils.decodeFunc(texture.encoding))
        if (type !== SKYTYPE_INFINITE) material.setDefine('SKYMESH', '')
        if (texture.cubemap) material.setDefine('SKY_CUBEMAP', '')
        material.setParameter('skyboxHighlightMultiplier', scene.skyboxHighlightMultiplier)
        if (texture.cubemap) {
            material.setParameter('texture_cubeMap', texture)
        } else {
            material.setParameter('texture_envAtlas', texture)
            material.setParameter('mipLevel', scene.skyboxMip)
        }
        material.cull = CULLFACE_FRONT
        material.depthWrite = this._depthWrite
        const skyLayer = scene.layers.getLayerById(LAYERID_SKYBOX)
        if (skyLayer) {
            const mesh = SkyGeometry.create(device, type)
            const meshInstance = new MeshInstance(mesh, material, node)
            this.meshInstance = meshInstance
            meshInstance.cull = false
            meshInstance.pick = false
            skyLayer.addMeshInstances([meshInstance])
            this.skyLayer = skyLayer
        }
    }
}

class Sky {
    applySettings(render) {
        this.type = render.skyType ?? SKYTYPE_INFINITE
        this.node.setLocalPosition(new Vec3(render.skyMeshPosition ?? [0, 0, 0]))
        this.node.setLocalEulerAngles(new Vec3(render.skyMeshRotation ?? [0, 0, 0]))
        this.node.setLocalScale(new Vec3(render.skyMeshScale ?? [1, 1, 1]))
        if (render.skyCenter) {
            this._center = new Vec3(render.skyCenter)
        }
    }
    set type(value) {
        if (this._type !== value) {
            this._type = value
            this.scene.updateShaders = true
            this.updateSkyMesh()
        }
    }
    get type() {
        return this._type
    }
    set center(value) {
        this._center.copy(value)
    }
    get center() {
        return this._center
    }
    set depthWrite(value) {
        if (this._depthWrite !== value) {
            this._depthWrite = value
            if (this.skyMesh) {
                this.skyMesh.depthWrite = value
            }
        }
    }
    get depthWrite() {
        return this._depthWrite
    }
    updateSkyMesh() {
        const texture = this.scene._getSkyboxTex()
        if (texture) {
            this.resetSkyMesh()
            this.skyMesh = new SkyMesh(this.device, this.scene, this.node, texture, this.type)
            this.skyMesh.depthWrite = this._depthWrite
            this.scene.fire('set:skybox', texture)
        }
    }
    resetSkyMesh() {
        this.skyMesh?.destroy()
        this.skyMesh = null
    }
    update() {
        if (this.type !== SKYTYPE_INFINITE) {
            const { center, centerArray } = this
            const temp = new Vec3()
            this.node.getWorldTransform().transformPoint(center, temp)
            centerArray[0] = temp.x
            centerArray[1] = temp.y
            centerArray[2] = temp.z
            this.projectedSkydomeCenterId.setValue(centerArray)
        }
    }
    constructor(scene) {
        this._type = SKYTYPE_INFINITE
        this._center = new Vec3(0, 1, 0)
        this.skyMesh = null
        this._depthWrite = false
        this.node = new GraphNode('SkyMeshNode')
        this.device = scene.device
        this.scene = scene
        this.center = new Vec3(0, 1, 0)
        this.centerArray = new Float32Array(3)
        this.projectedSkydomeCenterId = this.device.scope.resolve('projectedSkydomeCenter')
    }
}

const identityGraphNode = new GraphNode()
identityGraphNode.worldTransform = Mat4.IDENTITY
identityGraphNode._dirtyWorld = identityGraphNode._dirtyNormal = false
class ImmediateBatch {
    addLines(positions, color) {
        const destPos = this.positions
        const count = positions.length
        for (let i = 0; i < count; i++) {
            const pos = positions[i]
            destPos.push(pos.x, pos.y, pos.z)
        }
        const destCol = this.colors
        if (color.length) {
            for (let i = 0; i < count; i++) {
                const col = color[i]
                destCol.push(col.r, col.g, col.b, col.a)
            }
        } else {
            for (let i = 0; i < count; i++) {
                destCol.push(color.r, color.g, color.b, color.a)
            }
        }
    }
    addLinesArrays(positions, color) {
        const destPos = this.positions
        for (let i = 0; i < positions.length; i += 3) {
            destPos.push(positions[i], positions[i + 1], positions[i + 2])
        }
        const destCol = this.colors
        if (color.length) {
            for (let i = 0; i < color.length; i += 4) {
                destCol.push(color[i], color[i + 1], color[i + 2], color[i + 3])
            }
        } else {
            const count = positions.length / 3
            for (let i = 0; i < count; i++) {
                destCol.push(color.r, color.g, color.b, color.a)
            }
        }
    }
    onPreRender(visibleList, transparent) {
        if (this.positions.length > 0 && this.material.transparent === transparent) {
            this.mesh.setPositions(this.positions)
            this.mesh.setColors(this.colors)
            this.mesh.update(PRIMITIVE_LINES, false)
            if (!this.meshInstance) {
                this.meshInstance = new MeshInstance(this.mesh, this.material, identityGraphNode)
            }
            visibleList.push(this.meshInstance)
        }
    }
    clear() {
        this.positions.length = 0
        this.colors.length = 0
    }
    constructor(device, material, layer) {
        this.material = material
        this.layer = layer
        this.positions = []
        this.colors = []
        this.mesh = new Mesh(device)
        this.meshInstance = null
    }
}

class ImmediateBatches {
    getBatch(material, layer) {
        let batch = this.map.get(material)
        if (!batch) {
            batch = new ImmediateBatch(this.device, material, layer)
            this.map.set(material, batch)
        }
        return batch
    }
    onPreRender(visibleList, transparent) {
        this.map.forEach((batch) => {
            batch.onPreRender(visibleList, transparent)
        })
    }
    clear() {
        this.map.forEach((batch) => batch.clear())
    }
    constructor(device) {
        this.device = device
        this.map = new Map()
    }
}

const tempPoints = []
const vec$3 = new Vec3()
class Immediate {
    createMaterial(depthTest) {
        const material = new ShaderMaterial({
            uniqueName: 'ImmediateLine',
            vertexGLSL: ShaderChunks.get(this.device, SHADERLANGUAGE_GLSL).get('immediateLineVS'),
            fragmentGLSL: ShaderChunks.get(this.device, SHADERLANGUAGE_GLSL).get('immediateLinePS'),
            vertexWGSL: ShaderChunks.get(this.device, SHADERLANGUAGE_WGSL).get('immediateLineVS'),
            fragmentWGSL: ShaderChunks.get(this.device, SHADERLANGUAGE_WGSL).get('immediateLinePS'),
            attributes: {
                vertex_position: SEMANTIC_POSITION,
                vertex_color: SEMANTIC_COLOR,
            },
        })
        material.blendType = BLEND_NORMAL
        material.depthTest = depthTest
        material.update()
        return material
    }
    get materialDepth() {
        if (!this._materialDepth) {
            this._materialDepth = this.createMaterial(true)
        }
        return this._materialDepth
    }
    get materialNoDepth() {
        if (!this._materialNoDepth) {
            this._materialNoDepth = this.createMaterial(false)
        }
        return this._materialNoDepth
    }
    getBatch(layer, depthTest) {
        let batches = this.batchesMap.get(layer)
        if (!batches) {
            batches = new ImmediateBatches(this.device)
            this.batchesMap.set(layer, batches)
        }
        this.allBatches.add(batches)
        const material = depthTest ? this.materialDepth : this.materialNoDepth
        return batches.getBatch(material, layer)
    }
    getShaderDesc(id, fragmentGLSL, fragmentWGSL) {
        if (!this.shaderDescs.has(id)) {
            this.shaderDescs.set(id, {
                uniqueName: `DebugShader:${id}`,
                vertexGLSL: `
                                        attribute vec2 vertex_position;
                                        uniform mat4 matrix_model;
                                        varying vec2 uv0;
                                        void main(void) {
                                                gl_Position = matrix_model * vec4(vertex_position, 0, 1);
                                                uv0 = vertex_position.xy + 0.5;
                                        }
                                `,
                vertexWGSL: `
                                        attribute vertex_position: vec2f;
                                        uniform matrix_model: mat4x4f;
                                        varying uv0: vec2f;
                                        @vertex fn vertexMain(input: VertexInput) -> VertexOutput {
                                                var output: VertexOutput;
                                                output.position = uniform.matrix_model * vec4f(input.vertex_position, 0.0, 1.0);
                                                output.uv0 = input.vertex_position.xy + vec2f(0.5);
                                                return output;
                                        }
                                `,
                fragmentGLSL: fragmentGLSL,
                fragmentWGSL: fragmentWGSL,
                attributes: {
                    vertex_position: SEMANTIC_POSITION,
                },
            })
        }
        return this.shaderDescs.get(id)
    }
    getTextureShaderDesc(encoding) {
        const decodeFunc = ChunkUtils.decodeFunc(encoding)
        return this.getShaderDesc(
            `textureShader-${encoding}`,
            `
                        #include "gammaPS"
                        varying vec2 uv0;
                        uniform sampler2D colorMap;
                        void main (void) {
                                vec3 linearColor = ${decodeFunc}(texture2D(colorMap, uv0));
                                gl_FragColor = vec4(gammaCorrectOutput(linearColor), 1);
                        }
                `,
            `
                        #include "gammaPS"
                        varying uv0: vec2f;
                        var colorMap: texture_2d<f32>;
                        var colorMapSampler: sampler;
                        @fragment fn fragmentMain(input : FragmentInput) -> FragmentOutput {
                                var output: FragmentOutput;
                                let sampledTex = textureSample(colorMap, colorMapSampler, input.uv0);
                                let linearColor: vec3f = ${decodeFunc}(sampledTex);
                                output.color = vec4f(gammaCorrectOutput(linearColor), 1.0);
                                return output;
                        }
                `,
        )
    }
    getUnfilterableTextureShaderDesc() {
        return this.getShaderDesc(
            'textureShaderUnfilterable',
            `
                        varying vec2 uv0;
                        uniform highp sampler2D colorMap;
                        void main (void) {
                                ivec2 uv = ivec2(uv0 * textureSize(colorMap, 0));
                                gl_FragColor = vec4(texelFetch(colorMap, uv, 0).xyz, 1);
                        }
                `,
            `
                        varying uv0: vec2f;
                        var colorMap: texture_2d<uff>;
                        @fragment fn fragmentMain(input : FragmentInput) -> FragmentOutput {
                                var output: FragmentOutput;
                                let uv : vec2<i32> = vec2<i32>(input.uv0 * vec2f(textureDimensions(colorMap, 0)));
                                let fetchedColor : vec4f = textureLoad(colorMap, uv, 0);
                                output.color = vec4f(fetchedColor.xyz, 1.0);
                                return output;
                        }
                `,
        )
    }
    getDepthTextureShaderDesc() {
        return this.getShaderDesc(
            'depthTextureShader',
            `
                        #include "screenDepthPS"
                        #include "gammaPS"
                        varying vec2 uv0;
                        void main() {
                                float depth = getLinearScreenDepth(getImageEffectUV(uv0)) * camera_params.x;
                                gl_FragColor = vec4(gammaCorrectOutput(vec3(depth)), 1.0);
                        }
                `,
            `
                        #include "screenDepthPS"
                        #include "gammaPS"
                        varying uv0: vec2f;
                        @fragment fn fragmentMain(input: FragmentInput) -> FragmentOutput {
                                var output: FragmentOutput;
                                let depth: f32 = getLinearScreenDepth(getImageEffectUV(input.uv0)) * uniform.camera_params.x;
                                output.color = vec4f(gammaCorrectOutput(vec3f(depth)), 1.0);
                                return output;
                        }
                `,
        )
    }
    getQuadMesh() {
        if (!this.quadMesh) {
            this.quadMesh = new Mesh(this.device)
            this.quadMesh.setPositions([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0])
            this.quadMesh.update(PRIMITIVE_TRISTRIP)
        }
        return this.quadMesh
    }
    drawMesh(material, matrix, mesh, meshInstance, layer) {
        if (!meshInstance) {
            const graphNode = this.getGraphNode(matrix)
            meshInstance = new MeshInstance(mesh, material, graphNode)
        }
        let layerMeshInstances = this.layerMeshInstances.get(layer)
        if (!layerMeshInstances) {
            layerMeshInstances = []
            this.layerMeshInstances.set(layer, layerMeshInstances)
        }
        layerMeshInstances.push(meshInstance)
    }
    drawWireAlignedBox(min, max, color, depthTest, layer, mat) {
        if (mat) {
            const mulPoint = (x, y, z) => {
                vec$3.set(x, y, z)
                mat.transformPoint(vec$3, vec$3)
                tempPoints.push(vec$3.x, vec$3.y, vec$3.z)
            }
            mulPoint(min.x, min.y, min.z)
            mulPoint(min.x, max.y, min.z)
            mulPoint(min.x, max.y, min.z)
            mulPoint(max.x, max.y, min.z)
            mulPoint(max.x, max.y, min.z)
            mulPoint(max.x, min.y, min.z)
            mulPoint(max.x, min.y, min.z)
            mulPoint(min.x, min.y, min.z)
            mulPoint(min.x, min.y, max.z)
            mulPoint(min.x, max.y, max.z)
            mulPoint(min.x, max.y, max.z)
            mulPoint(max.x, max.y, max.z)
            mulPoint(max.x, max.y, max.z)
            mulPoint(max.x, min.y, max.z)
            mulPoint(max.x, min.y, max.z)
            mulPoint(min.x, min.y, max.z)
            mulPoint(min.x, min.y, min.z)
            mulPoint(min.x, min.y, max.z)
            mulPoint(min.x, max.y, min.z)
            mulPoint(min.x, max.y, max.z)
            mulPoint(max.x, max.y, min.z)
            mulPoint(max.x, max.y, max.z)
            mulPoint(max.x, min.y, min.z)
            mulPoint(max.x, min.y, max.z)
        } else {
            tempPoints.push(
                min.x,
                min.y,
                min.z,
                min.x,
                max.y,
                min.z,
                min.x,
                max.y,
                min.z,
                max.x,
                max.y,
                min.z,
                max.x,
                max.y,
                min.z,
                max.x,
                min.y,
                min.z,
                max.x,
                min.y,
                min.z,
                min.x,
                min.y,
                min.z,
                min.x,
                min.y,
                max.z,
                min.x,
                max.y,
                max.z,
                min.x,
                max.y,
                max.z,
                max.x,
                max.y,
                max.z,
                max.x,
                max.y,
                max.z,
                max.x,
                min.y,
                max.z,
                max.x,
                min.y,
                max.z,
                min.x,
                min.y,
                max.z,
                min.x,
                min.y,
                min.z,
                min.x,
                min.y,
                max.z,
                min.x,
                max.y,
                min.z,
                min.x,
                max.y,
                max.z,
                max.x,
                max.y,
                min.z,
                max.x,
                max.y,
                max.z,
                max.x,
                min.y,
                min.z,
                max.x,
                min.y,
                max.z,
            )
        }
        const batch = this.getBatch(layer, depthTest)
        batch.addLinesArrays(tempPoints, color)
        tempPoints.length = 0
    }
    drawWireSphere(center, radius, color, numSegments, depthTest, layer) {
        const step = (2 * Math.PI) / numSegments
        let angle = 0
        for (let i = 0; i < numSegments; i++) {
            const sin0 = Math.sin(angle)
            const cos0 = Math.cos(angle)
            angle += step
            const sin1 = Math.sin(angle)
            const cos1 = Math.cos(angle)
            tempPoints.push(center.x + radius * sin0, center.y, center.z + radius * cos0)
            tempPoints.push(center.x + radius * sin1, center.y, center.z + radius * cos1)
            tempPoints.push(center.x + radius * sin0, center.y + radius * cos0, center.z)
            tempPoints.push(center.x + radius * sin1, center.y + radius * cos1, center.z)
            tempPoints.push(center.x, center.y + radius * sin0, center.z + radius * cos0)
            tempPoints.push(center.x, center.y + radius * sin1, center.z + radius * cos1)
        }
        const batch = this.getBatch(layer, depthTest)
        batch.addLinesArrays(tempPoints, color)
        tempPoints.length = 0
    }
    getGraphNode(matrix) {
        const graphNode = new GraphNode('ImmediateDebug')
        graphNode.worldTransform = matrix
        graphNode._dirtyWorld = graphNode._dirtyNormal = false
        return graphNode
    }
    onPreRenderLayer(layer, visibleList, transparent) {
        this.batchesMap.forEach((batches, batchLayer) => {
            if (batchLayer === layer) {
                batches.onPreRender(visibleList, transparent)
            }
        })
        if (!this.updatedLayers.has(layer)) {
            this.updatedLayers.add(layer)
            const meshInstances = this.layerMeshInstances.get(layer)
            if (meshInstances) {
                for (let i = 0; i < meshInstances.length; i++) {
                    visibleList.push(meshInstances[i])
                }
                meshInstances.length = 0
            }
        }
    }
    onPostRender() {
        this.allBatches.forEach((batch) => batch.clear())
        this.allBatches.clear()
        this.updatedLayers.clear()
    }
    constructor(device) {
        this.shaderDescs = new Map()
        this.device = device
        this.quadMesh = null
        this.textureShader = null
        this.depthTextureShader = null
        this.cubeLocalPos = null
        this.cubeWorldPos = null
        this.batchesMap = new Map()
        this.allBatches = new Set()
        this.updatedLayers = new Set()
        this._materialDepth = null
        this._materialNoDepth = null
        this.layerMeshInstances = new Map()
    }
}

const _goldenAngle = 2.399963229728653
const random = {
    circlePoint(point) {
        const r = Math.sqrt(Math.random())
        const theta = Math.random() * 2 * Math.PI
        point.x = r * Math.cos(theta)
        point.y = r * Math.sin(theta)
    },
    circlePointDeterministic(point, index, numPoints) {
        const theta = index * _goldenAngle
        const r = Math.sqrt(index / numPoints)
        point.x = r * Math.cos(theta)
        point.y = r * Math.sin(theta)
    },
    spherePointDeterministic(point, index, numPoints, start = 0, end = 1) {
        start = 1 - 2 * start
        end = 1 - 2 * end
        const y = math.lerp(start, end, index / numPoints)
        const radius = Math.sqrt(1 - y * y)
        const theta = _goldenAngle * index
        point.x = Math.cos(theta) * radius
        point.y = y
        point.z = Math.sin(theta) * radius
    },
    radicalInverse(i) {
        let bits = ((i << 16) | (i >>> 16)) >>> 0
        bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0
        bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0
        bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0
        bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0
        return bits * 2.3283064365386963e-10
    },
}

const getProjectionName = (projection) => {
    switch (projection) {
        case TEXTUREPROJECTION_CUBE:
            return 'Cubemap'
        case TEXTUREPROJECTION_OCTAHEDRAL:
            return 'Octahedral'
        default:
            return 'Equirect'
    }
}
const packFloat32ToRGBA8 = (value, array, offset) => {
    if (value <= 0) {
        array[offset + 0] = 0
        array[offset + 1] = 0
        array[offset + 2] = 0
        array[offset + 3] = 0
    } else if (value >= 1.0) {
        array[offset + 0] = 255
        array[offset + 1] = 0
        array[offset + 2] = 0
        array[offset + 3] = 0
    } else {
        let encX = (1 * value) % 1
        let encY = (255 * value) % 1
        let encZ = (65025 * value) % 1
        const encW = (16581375.0 * value) % 1
        encX -= encY / 255
        encY -= encZ / 255
        encZ -= encW / 255
        array[offset + 0] = Math.min(255, Math.floor(encX * 256))
        array[offset + 1] = Math.min(255, Math.floor(encY * 256))
        array[offset + 2] = Math.min(255, Math.floor(encZ * 256))
        array[offset + 3] = Math.min(255, Math.floor(encW * 256))
    }
}
const packSamples = (samples) => {
    const numSamples = samples.length
    const w = Math.min(numSamples, 512)
    const h = Math.ceil(numSamples / w)
    const data = new Uint8Array(w * h * 4)
    let off = 0
    for (let i = 0; i < numSamples; i += 4) {
        packFloat32ToRGBA8(samples[i + 0] * 0.5 + 0.5, data, off + 0)
        packFloat32ToRGBA8(samples[i + 1] * 0.5 + 0.5, data, off + 4)
        packFloat32ToRGBA8(samples[i + 2] * 0.5 + 0.5, data, off + 8)
        packFloat32ToRGBA8(samples[i + 3] / 8, data, off + 12)
        off += 16
    }
    return {
        width: w,
        height: h,
        data: data,
    }
}
const hemisphereSamplePhong = (dstVec, x, y, specularPower) => {
    const phi = y * 2 * Math.PI
    const cosTheta = Math.pow(1 - x, 1 / (specularPower + 1))
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta)
    dstVec.set(Math.cos(phi) * sinTheta, Math.sin(phi) * sinTheta, cosTheta).normalize()
}
const hemisphereSampleLambert = (dstVec, x, y) => {
    const phi = y * 2 * Math.PI
    const cosTheta = Math.sqrt(1 - x)
    const sinTheta = Math.sqrt(x)
    dstVec.set(Math.cos(phi) * sinTheta, Math.sin(phi) * sinTheta, cosTheta).normalize()
}
const hemisphereSampleGGX = (dstVec, x, y, a) => {
    const phi = y * 2 * Math.PI
    const cosTheta = Math.sqrt((1 - x) / (1 + (a * a - 1) * x))
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta)
    dstVec.set(Math.cos(phi) * sinTheta, Math.sin(phi) * sinTheta, cosTheta).normalize()
}
const D_GGX = (NoH, linearRoughness) => {
    const a = NoH * linearRoughness
    const k = linearRoughness / (1.0 - NoH * NoH + a * a)
    return k * k * (1 / Math.PI)
}
const generatePhongSamples = (numSamples, specularPower) => {
    const H = new Vec3()
    const result = []
    for (let i = 0; i < numSamples; ++i) {
        hemisphereSamplePhong(H, i / numSamples, random.radicalInverse(i), specularPower)
        result.push(H.x, H.y, H.z, 0)
    }
    return result
}
const generateLambertSamples = (numSamples, sourceTotalPixels) => {
    const pixelsPerSample = sourceTotalPixels / numSamples
    const H = new Vec3()
    const result = []
    for (let i = 0; i < numSamples; ++i) {
        hemisphereSampleLambert(H, i / numSamples, random.radicalInverse(i))
        const pdf = H.z / Math.PI
        const mipLevel = 0.5 * Math.log2(pixelsPerSample / pdf)
        result.push(H.x, H.y, H.z, mipLevel)
    }
    return result
}
const requiredSamplesGGX = {
    16: {
        2: 26,
        8: 20,
        32: 17,
        128: 16,
        512: 16,
    },
    32: {
        2: 53,
        8: 40,
        32: 34,
        128: 32,
        512: 32,
    },
    128: {
        2: 214,
        8: 163,
        32: 139,
        128: 130,
        512: 128,
    },
    1024: {
        2: 1722,
        8: 1310,
        32: 1114,
        128: 1041,
        512: 1025,
    },
}
const getRequiredSamplesGGX = (numSamples, specularPower) => {
    const table = requiredSamplesGGX[numSamples]
    return (table && table[specularPower]) || numSamples
}
const generateGGXSamples = (numSamples, specularPower, sourceTotalPixels) => {
    const pixelsPerSample = sourceTotalPixels / numSamples
    const roughness = 1 - Math.log2(specularPower) / 11.0
    const a = roughness * roughness
    const H = new Vec3()
    const L = new Vec3()
    const N = new Vec3(0, 0, 1)
    const result = []
    const requiredSamples = getRequiredSamplesGGX(numSamples, specularPower)
    for (let i = 0; i < requiredSamples; ++i) {
        hemisphereSampleGGX(H, i / requiredSamples, random.radicalInverse(i), a)
        const NoH = H.z
        L.set(H.x, H.y, H.z)
            .mulScalar(2 * NoH)
            .sub(N)
        if (L.z > 0) {
            const pdf = D_GGX(Math.min(1, NoH), a) / 4 + 0.001
            const mipLevel = 0.5 * Math.log2(pixelsPerSample / pdf)
            result.push(L.x, L.y, L.z, mipLevel)
        }
    }
    while (result.length < numSamples * 4) {
        result.push(0, 0, 0, 0)
    }
    return result
}
const createSamplesTex = (device, name, samples) => {
    const packedSamples = packSamples(samples)
    return new Texture(device, {
        name: name,
        width: packedSamples.width,
        height: packedSamples.height,
        mipmaps: false,
        minFilter: FILTER_NEAREST,
        magFilter: FILTER_NEAREST,
        levels: [packedSamples.data],
    })
}
class SimpleCache {
    destroy() {
        if (this.destroyContent) {
            this.map.forEach((value, key) => {
                value.destroy()
            })
        }
    }
    get(key, missFunc) {
        if (!this.map.has(key)) {
            const result = missFunc()
            this.map.set(key, result)
            return result
        }
        return this.map.get(key)
    }
    constructor(destroyContent = true) {
        this.map = new Map()
        this.destroyContent = destroyContent
    }
}
const samplesCache = new SimpleCache(false)
const deviceCache$1 = new DeviceCache()
const getCachedTexture = (device, key, getSamplesFnc) => {
    const cache = deviceCache$1.get(device, () => {
        return new SimpleCache()
    })
    return cache.get(key, () => {
        return createSamplesTex(device, key, samplesCache.get(key, getSamplesFnc))
    })
}
const generateLambertSamplesTex = (device, numSamples, sourceTotalPixels) => {
    const key = `lambert-samples-${numSamples}-${sourceTotalPixels}`
    return getCachedTexture(device, key, () => {
        return generateLambertSamples(numSamples, sourceTotalPixels)
    })
}
const generatePhongSamplesTex = (device, numSamples, specularPower) => {
    const key = `phong-samples-${numSamples}-${specularPower}`
    return getCachedTexture(device, key, () => {
        return generatePhongSamples(numSamples, specularPower)
    })
}
const generateGGXSamplesTex = (device, numSamples, specularPower, sourceTotalPixels) => {
    const key = `ggx-samples-${numSamples}-${specularPower}-${sourceTotalPixels}`
    return getCachedTexture(device, key, () => {
        return generateGGXSamples(numSamples, specularPower, sourceTotalPixels)
    })
}
function reprojectTexture(source, target, options = {}) {
    const seamPixels = options.seamPixels ?? 0
    const innerWidth = (options.rect?.z ?? target.width) - seamPixels * 2
    const innerHeight = (options.rect?.w ?? target.height) - seamPixels * 2
    if (innerWidth < 1 || innerHeight < 1) {
        return false
    }
    const funcNames = {
        none: 'reproject',
        lambert: 'prefilterSamplesUnweighted',
        phong: 'prefilterSamplesUnweighted',
        ggx: 'prefilterSamples',
    }
    const specularPower = options.hasOwnProperty('specularPower') ? options.specularPower : 1
    const face = options.hasOwnProperty('face') ? options.face : null
    const distribution = options.hasOwnProperty('distribution')
        ? options.distribution
        : specularPower === 1
          ? 'none'
          : 'phong'
    const processFunc = funcNames[distribution] || 'reproject'
    const prefilterSamples = processFunc.startsWith('prefilterSamples')
    const decodeFunc = ChunkUtils.decodeFunc(source.encoding)
    const encodeFunc = ChunkUtils.encodeFunc(target.encoding)
    const sourceFunc = `sample${getProjectionName(source.projection)}`
    const targetFunc = `getDirection${getProjectionName(target.projection)}`
    const numSamples = options.hasOwnProperty('numSamples') ? options.numSamples : 1024
    const shaderKey = `ReprojectShader:${processFunc}_${decodeFunc}_${encodeFunc}_${sourceFunc}_${targetFunc}_${numSamples}`
    const device = source.device
    let shader = getProgramLibrary(device).getCachedShader(shaderKey)
    if (!shader) {
        const defines = new Map()
        if (prefilterSamples) defines.set('USE_SAMPLES_TEX', '')
        if (source.cubemap) defines.set('CUBEMAP_SOURCE', '')
        defines.set('{PROCESS_FUNC}', processFunc)
        defines.set('{DECODE_FUNC}', decodeFunc)
        defines.set('{ENCODE_FUNC}', encodeFunc)
        defines.set('{SOURCE_FUNC}', sourceFunc)
        defines.set('{TARGET_FUNC}', targetFunc)
        defines.set('{NUM_SAMPLES}', numSamples)
        defines.set('{NUM_SAMPLES_SQRT}', Math.round(Math.sqrt(numSamples)).toFixed(1))
        const wgsl = device.isWebGPU
        const chunks = ShaderChunks.get(device, wgsl ? SHADERLANGUAGE_WGSL : SHADERLANGUAGE_GLSL)
        const includes = new Map()
        includes.set('decodePS', chunks.get('decodePS'))
        includes.set('encodePS', chunks.get('encodePS'))
        shader = ShaderUtils.createShader(device, {
            uniqueName: shaderKey,
            attributes: {
                vertex_position: SEMANTIC_POSITION,
            },
            vertexChunk: 'reprojectVS',
            fragmentChunk: 'reprojectPS',
            fragmentIncludes: includes,
            fragmentDefines: defines,
        })
    }
    device.setBlendState(BlendState.NOBLEND)
    const constantSource = device.scope.resolve(source.cubemap ? 'sourceCube' : 'sourceTex')
    constantSource.setValue(source)
    const constantParams = device.scope.resolve('params')
    const uvModParam = device.scope.resolve('uvMod')
    if (seamPixels > 0) {
        uvModParam.setValue([
            (innerWidth + seamPixels * 2) / innerWidth,
            (innerHeight + seamPixels * 2) / innerHeight,
            -seamPixels / innerWidth,
            -seamPixels / innerHeight,
        ])
    } else {
        uvModParam.setValue([1, 1, 0, 0])
    }
    const params = [
        0,
        target.width * target.height * (target.cubemap ? 6 : 1),
        source.width * source.height * (source.cubemap ? 6 : 1),
    ]
    if (prefilterSamples) {
        const sourceTotalPixels = source.width * source.height * (source.cubemap ? 6 : 1)
        const samplesTex =
            distribution === 'ggx'
                ? generateGGXSamplesTex(device, numSamples, specularPower, sourceTotalPixels)
                : distribution === 'lambert'
                  ? generateLambertSamplesTex(device, numSamples, sourceTotalPixels)
                  : generatePhongSamplesTex(device, numSamples, specularPower)
        device.scope.resolve('samplesTex').setValue(samplesTex)
        device.scope.resolve('samplesTexInverseSize').setValue([1.0 / samplesTex.width, 1.0 / samplesTex.height])
    }
    for (let f = 0; f < (target.cubemap ? 6 : 1); f++) {
        if (face === null || f === face) {
            const renderTarget = new RenderTarget({
                colorBuffer: target,
                face: f,
                depth: false,
                flipY: device.isWebGPU,
            })
            params[0] = f
            constantParams.setValue(params)
            drawQuadWithShader(device, renderTarget, shader, options?.rect)
            renderTarget.destroy()
        }
    }
    return true
}

const calcLevels = (width, height = 0) => {
    return 1 + Math.floor(Math.log2(Math.max(width, height)))
}
const supportsFloat16 = (device) => {
    return device.textureHalfFloatRenderable
}
const supportsFloat32 = (device) => {
    return device.textureFloatRenderable
}
const lightingSourcePixelFormat = (device) => {
    return supportsFloat16(device)
        ? PIXELFORMAT_RGBA16F
        : supportsFloat32(device)
          ? PIXELFORMAT_RGBA32F
          : PIXELFORMAT_RGBA8
}
const lightingPixelFormat = (device) => {
    return PIXELFORMAT_RGBA8
}
const createCubemap = (device, size, format, mipmaps) => {
    return new Texture(device, {
        name: `lighting-${size}`,
        cubemap: true,
        width: size,
        height: size,
        format: format,
        type: TEXTURETYPE_RGBP,
        addressU: ADDRESS_CLAMP_TO_EDGE,
        addressV: ADDRESS_CLAMP_TO_EDGE,
        mipmaps: false,
    })
}
class EnvLighting {
    static generateSkyboxCubemap(source, size) {
        const device = source.device
        const result = createCubemap(
            device,
            size || (source.cubemap ? source.width : source.width / 4),
            PIXELFORMAT_RGBA8,
        )
        reprojectTexture(source, result, {
            numSamples: 1024,
        })
        return result
    }
    static generateLightingSource(source, options) {
        const device = source.device
        const format = lightingSourcePixelFormat(device)
        const result =
            options?.target ||
            new Texture(device, {
                name: 'lighting-source',
                cubemap: true,
                width: options?.size || 128,
                height: options?.size || 128,
                format: format,
                type: format === PIXELFORMAT_RGBA8 ? TEXTURETYPE_RGBP : TEXTURETYPE_DEFAULT,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
                mipmaps: true,
            })
        reprojectTexture(source, result, {
            numSamples: source.mipmaps ? 1 : 1024,
        })
        return result
    }
    static generateAtlas(source, options) {
        const device = source.device
        const format = lightingPixelFormat()
        const result =
            options?.target ||
            new Texture(device, {
                name: 'envAtlas',
                width: options?.size || 512,
                height: options?.size || 512,
                format: format,
                type: TEXTURETYPE_RGBP,
                projection: TEXTUREPROJECTION_EQUIRECT,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
                mipmaps: false,
            })
        const s = result.width / 512
        const rect = new Vec4(0, 0, 512 * s, 256 * s)
        const levels = calcLevels(256) - calcLevels(4)
        for (let i = 0; i < levels; ++i) {
            reprojectTexture(source, result, {
                numSamples: 1,
                rect: rect,
                seamPixels: s,
            })
            rect.x += rect.w
            rect.y += rect.w
            rect.z = Math.max(1, Math.floor(rect.z * 0.5))
            rect.w = Math.max(1, Math.floor(rect.w * 0.5))
        }
        rect.set(0, 256 * s, 256 * s, 128 * s)
        for (let i = 1; i < 7; ++i) {
            reprojectTexture(source, result, {
                numSamples: options?.numReflectionSamples || 1024,
                distribution: options?.distribution || 'ggx',
                specularPower: Math.max(1, 2048 >> (i * 2)),
                rect: rect,
                seamPixels: s,
            })
            rect.y += rect.w
            rect.z = Math.max(1, Math.floor(rect.z * 0.5))
            rect.w = Math.max(1, Math.floor(rect.w * 0.5))
        }
        rect.set(128 * s, (256 + 128) * s, 64 * s, 32 * s)
        reprojectTexture(source, result, {
            numSamples: options?.numAmbientSamples || 2048,
            distribution: 'lambert',
            rect: rect,
            seamPixels: s,
        })
        return result
    }
    static generatePrefilteredAtlas(sources, options) {
        const device = sources[0].device
        const format = sources[0].format
        const type = sources[0].type
        const result =
            options?.target ||
            new Texture(device, {
                name: 'envPrefilteredAtlas',
                width: options?.size || 512,
                height: options?.size || 512,
                format: format,
                type: type,
                projection: TEXTUREPROJECTION_EQUIRECT,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
                mipmaps: false,
            })
        const s = result.width / 512
        const rect = new Vec4(0, 0, 512 * s, 256 * s)
        const levels = calcLevels(512)
        for (let i = 0; i < levels; ++i) {
            reprojectTexture(sources[0], result, {
                numSamples: 1,
                rect: rect,
                seamPixels: s,
            })
            rect.x += rect.w
            rect.y += rect.w
            rect.z = Math.max(1, Math.floor(rect.z * 0.5))
            rect.w = Math.max(1, Math.floor(rect.w * 0.5))
        }
        rect.set(0, 256 * s, 256 * s, 128 * s)
        for (let i = 1; i < sources.length; ++i) {
            reprojectTexture(sources[i], result, {
                numSamples: 1,
                rect: rect,
                seamPixels: s,
            })
            rect.y += rect.w
            rect.z = Math.max(1, Math.floor(rect.z * 0.5))
            rect.w = Math.max(1, Math.floor(rect.w * 0.5))
        }
        rect.set(128 * s, (256 + 128) * s, 64 * s, 32 * s)
        if (options?.legacyAmbient) {
            reprojectTexture(sources[5], result, {
                numSamples: 1,
                rect: rect,
                seamPixels: s,
            })
        } else {
            reprojectTexture(sources[0], result, {
                numSamples: options?.numSamples || 2048,
                distribution: 'lambert',
                rect: rect,
                seamPixels: s,
            })
        }
        return result
    }
}

class FogParams {
    constructor() {
        this.type = FOG_NONE
        this.color = new Color(0, 0, 0)
        this.density = 0
        this.start = 1
        this.end = 1000
    }
}

class Scene extends EventHandler {
    get defaultDrawLayer() {
        return this.layers.getLayerById(LAYERID_IMMEDIATE)
    }
    set ambientBakeNumSamples(value) {
        this._ambientBakeNumSamples = math.clamp(Math.floor(value), 1, 255)
    }
    get ambientBakeNumSamples() {
        return this._ambientBakeNumSamples
    }
    set ambientBakeSpherePart(value) {
        this._ambientBakeSpherePart = math.clamp(value, 0.001, 1)
    }
    get ambientBakeSpherePart() {
        return this._ambientBakeSpherePart
    }
    set clusteredLightingEnabled(value) {
        if (this.device.isWebGPU && !value) {
            return
        }
        if (!this._clusteredLightingEnabled && value) {
            console.error('Turning on disabled clustered lighting is not currently supported')
            return
        }
        this._clusteredLightingEnabled = value
    }
    get clusteredLightingEnabled() {
        return this._clusteredLightingEnabled
    }
    set envAtlas(value) {
        if (value !== this._envAtlas) {
            this._envAtlas = value
            if (value) {
                value.addressU = ADDRESS_CLAMP_TO_EDGE
                value.addressV = ADDRESS_CLAMP_TO_EDGE
                value.minFilter = FILTER_LINEAR
                value.magFilter = FILTER_LINEAR
                value.mipmaps = false
            }
            this._prefilteredCubemaps = []
            if (this._internalEnvAtlas) {
                this._internalEnvAtlas.destroy()
                this._internalEnvAtlas = null
            }
            this._resetSkyMesh()
        }
    }
    get envAtlas() {
        return this._envAtlas
    }
    set layers(layers) {
        const prev = this._layers
        this._layers = layers
        this.fire('set:layers', prev, layers)
    }
    get layers() {
        return this._layers
    }
    get sky() {
        return this._sky
    }
    get lighting() {
        return this._lightingParams
    }
    get gsplat() {
        return this._gsplatParams
    }
    get fog() {
        return this._fogParams
    }
    set lightmapFilterRange(value) {
        this._lightmapFilterRange = Math.max(value, 0.001)
    }
    get lightmapFilterRange() {
        return this._lightmapFilterRange
    }
    set lightmapFilterSmoothness(value) {
        this._lightmapFilterSmoothness = Math.max(value, 0.001)
    }
    get lightmapFilterSmoothness() {
        return this._lightmapFilterSmoothness
    }
    set prefilteredCubemaps(value) {
        value = value || []
        const cubemaps = this._prefilteredCubemaps
        const changed = cubemaps.length !== value.length || cubemaps.some((c, i) => c !== value[i])
        if (changed) {
            const complete = value.length === 6 && value.every((c) => !!c)
            if (complete) {
                this._internalEnvAtlas = EnvLighting.generatePrefilteredAtlas(value, {
                    target: this._internalEnvAtlas,
                })
                this._envAtlas = this._internalEnvAtlas
            } else {
                if (this._internalEnvAtlas) {
                    this._internalEnvAtlas.destroy()
                    this._internalEnvAtlas = null
                }
                this._envAtlas = null
            }
            this._prefilteredCubemaps = value.slice()
            this._resetSkyMesh()
        }
    }
    get prefilteredCubemaps() {
        return this._prefilteredCubemaps
    }
    set skybox(value) {
        if (value !== this._skyboxCubeMap) {
            this._skyboxCubeMap = value
            this._resetSkyMesh()
        }
    }
    get skybox() {
        return this._skyboxCubeMap
    }
    set skyboxIntensity(value) {
        if (value !== this._skyboxIntensity) {
            this._skyboxIntensity = value
            this._resetSkyMesh()
        }
    }
    get skyboxIntensity() {
        return this._skyboxIntensity
    }
    set skyboxLuminance(value) {
        if (value !== this._skyboxLuminance) {
            this._skyboxLuminance = value
            this._resetSkyMesh()
        }
    }
    get skyboxLuminance() {
        return this._skyboxLuminance
    }
    set skyboxMip(value) {
        if (value !== this._skyboxMip) {
            this._skyboxMip = value
            this._resetSkyMesh()
        }
    }
    get skyboxMip() {
        return this._skyboxMip
    }
    set skyboxHighlightMultiplier(value) {
        if (value !== this._skyboxHighlightMultiplier) {
            this._skyboxHighlightMultiplier = value
            this._resetSkyMesh()
        }
    }
    get skyboxHighlightMultiplier() {
        return this._skyboxHighlightMultiplier
    }
    set skyboxRotation(value) {
        if (!this._skyboxRotation.equals(value)) {
            const isIdentity = value.equals(Quat.IDENTITY)
            this._skyboxRotation.copy(value)
            if (isIdentity) {
                this._skyboxRotationMat3.setIdentity()
            } else {
                this._skyboxRotationMat4.setTRS(Vec3.ZERO, value, Vec3.ONE)
                this._skyboxRotationMat3.invertMat4(this._skyboxRotationMat4)
            }
            if (!this._skyboxRotationShaderInclude && !isIdentity) {
                this._skyboxRotationShaderInclude = true
                this._resetSkyMesh()
            }
        }
    }
    get skyboxRotation() {
        return this._skyboxRotation
    }
    destroy() {
        this._resetSkyMesh()
        this.root = null
        this.off()
    }
    drawLine(start, end, color = Color.WHITE, depthTest = true, layer = this.defaultDrawLayer) {
        const batch = this.immediate.getBatch(layer, depthTest)
        batch.addLines([start, end], [color, color])
    }
    drawLines(positions, colors, depthTest = true, layer = this.defaultDrawLayer) {
        const batch = this.immediate.getBatch(layer, depthTest)
        batch.addLines(positions, colors)
    }
    drawLineArrays(positions, colors, depthTest = true, layer = this.defaultDrawLayer) {
        const batch = this.immediate.getBatch(layer, depthTest)
        batch.addLinesArrays(positions, colors)
    }
    applySettings(settings) {
        const physics = settings.physics
        const render = settings.render
        this._gravity.set(physics.gravity[0], physics.gravity[1], physics.gravity[2])
        this.ambientLight.set(render.global_ambient[0], render.global_ambient[1], render.global_ambient[2])
        this.ambientLuminance = render.ambientLuminance
        this.fog.type = render.fog
        this.fog.color.set(render.fog_color[0], render.fog_color[1], render.fog_color[2])
        this.fog.start = render.fog_start
        this.fog.end = render.fog_end
        this.fog.density = render.fog_density
        this.lightmapSizeMultiplier = render.lightmapSizeMultiplier
        this.lightmapMaxResolution = render.lightmapMaxResolution
        this.lightmapMode = render.lightmapMode
        this.exposure = render.exposure
        this._skyboxIntensity = render.skyboxIntensity ?? 1
        this._skyboxLuminance = render.skyboxLuminance ?? 20000
        this._skyboxMip = render.skyboxMip ?? 0
        if (render.skyboxRotation) {
            this.skyboxRotation = new Quat().setFromEulerAngles(
                render.skyboxRotation[0],
                render.skyboxRotation[1],
                render.skyboxRotation[2],
            )
        }
        this.sky.applySettings(render)
        this.clusteredLightingEnabled = render.clusteredLightingEnabled ?? false
        this.lighting.applySettings(render)
        ;[
            'lightmapFilterEnabled',
            'lightmapFilterRange',
            'lightmapFilterSmoothness',
            'ambientBake',
            'ambientBakeNumSamples',
            'ambientBakeSpherePart',
            'ambientBakeOcclusionBrightness',
            'ambientBakeOcclusionContrast',
        ].forEach((setting) => {
            if (render.hasOwnProperty(setting)) {
                this[setting] = render[setting]
            }
        })
        this._resetSkyMesh()
    }
    _getSkyboxTex() {
        const cubemaps = this._prefilteredCubemaps
        if (this._skyboxMip) {
            const skyboxMapping = [0, 1, 3, 4, 5, 6]
            return cubemaps[skyboxMapping[this._skyboxMip]] || this._envAtlas || cubemaps[0] || this._skyboxCubeMap
        }
        return this._skyboxCubeMap || cubemaps[0] || this._envAtlas
    }
    _updateSkyMesh() {
        if (!this.sky.skyMesh) {
            this.sky.updateSkyMesh()
        }
        this.sky.update()
    }
    _resetSkyMesh() {
        this.sky.resetSkyMesh()
        this.updateShaders = true
    }
    setSkybox(cubemaps) {
        if (!cubemaps) {
            this.skybox = null
            this.envAtlas = null
        } else {
            this.skybox = cubemaps[0] || null
            if (cubemaps[1] && !cubemaps[1].cubemap) {
                this.envAtlas = cubemaps[1]
            } else {
                this.prefilteredCubemaps = cubemaps.slice(1)
            }
        }
    }
    get lightmapPixelFormat() {
        return (this.lightmapHDR && this.device.getRenderableHdrFormat()) || PIXELFORMAT_RGBA8
    }
    constructor(graphicsDevice) {
        ;(super(),
            (this.ambientBake = false),
            (this.ambientBakeOcclusionBrightness = 0),
            (this.ambientBakeOcclusionContrast = 0),
            (this.ambientLight = new Color(0, 0, 0)),
            (this.ambientLuminance = 0),
            (this.exposure = 1),
            (this.lightmapSizeMultiplier = 1),
            (this.lightmapMaxResolution = 2048),
            (this.lightmapMode = BAKE_COLORDIR),
            (this.lightmapFilterEnabled = false),
            (this.lightmapHDR = false),
            (this.root = null),
            (this.physicalUnits = false),
            (this._envAtlas = null),
            (this._skyboxCubeMap = null),
            (this._fogParams = new FogParams()),
            (this.forcePassThroughSpecular = false))
        this.device = graphicsDevice
        this._gravity = new Vec3(0, -9.8, 0)
        this._layers = null
        this._prefilteredCubemaps = []
        this._internalEnvAtlas = null
        this._skyboxIntensity = 1
        this._skyboxLuminance = 0
        this._skyboxMip = 0
        this._skyboxHighlightMultiplier = 1
        this._skyboxRotationShaderInclude = false
        this._skyboxRotation = new Quat()
        this._skyboxRotationMat3 = new Mat3()
        this._skyboxRotationMat4 = new Mat4()
        this._ambientBakeNumSamples = 1
        this._ambientBakeSpherePart = 0.4
        this._lightmapFilterRange = 10
        this._lightmapFilterSmoothness = 0.2
        this._clusteredLightingEnabled = true
        this._lightingParams = new LightingParams(this.device.supportsAreaLights, this.device.maxTextureSize, () => {
            this.updateShaders = true
        })
        this._gsplatParams = new GSplatParams(this.device)
        this._sky = new Sky(this)
        this._stats = {
            meshInstances: 0,
            lights: 0,
            dynamicLights: 0,
            bakedLights: 0,
            updateShadersTime: 0,
        }
        this.updateShaders = true
        this._shaderVersion = 0
        this.immediate = new Immediate(this.device)
    }
}
Scene.EVENT_SETLAYERS = 'set:layers'
Scene.EVENT_SETSKYBOX = 'set:skybox'
Scene.EVENT_PRERENDER = 'prerender'
Scene.EVENT_POSTRENDER = 'postrender'
Scene.EVENT_PRERENDER_LAYER = 'prerender:layer'
Scene.EVENT_POSTRENDER_LAYER = 'postrender:layer'
Scene.EVENT_PRECULL = 'precull'
Scene.EVENT_POSTCULL = 'postcull'

class Skin {
    constructor(graphicsDevice, ibp, boneNames) {
        this.device = graphicsDevice
        this.inverseBindPose = ibp
        this.boneNames = boneNames
    }
}

const prefixSumSource = `
@group(0) @binding(0) var<storage, read_write> items: array<u32>;
@group(0) @binding(1) var<storage, read_write> blockSums: array<u32>;
struct PrefixSumUniforms {
        elementCount: u32
};
@group(0) @binding(2) var<uniform> uniforms: PrefixSumUniforms;
const WORKGROUP_SIZE_X: u32 = {WORKGROUP_SIZE_X}u;
const WORKGROUP_SIZE_Y: u32 = {WORKGROUP_SIZE_Y}u;
const THREADS_PER_WORKGROUP: u32 = {THREADS_PER_WORKGROUP}u;
const ITEMS_PER_WORKGROUP: u32 = {ITEMS_PER_WORKGROUP}u;
var<workgroup> temp: array<u32, ITEMS_PER_WORKGROUP * 2>;
@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1)
fn reduce_downsweep(
        @builtin(workgroup_id) w_id: vec3<u32>,
        @builtin(num_workgroups) w_dim: vec3<u32>,
        @builtin(local_invocation_index) TID: u32,
) {
        let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
        let WID = WORKGROUP_ID * THREADS_PER_WORKGROUP;
        let GID = WID + TID;
        
        let ELM_TID = TID * 2;
        let ELM_GID = GID * 2;
        
        temp[ELM_TID] = select(items[ELM_GID], 0u, ELM_GID >= uniforms.elementCount);
        temp[ELM_TID + 1u] = select(items[ELM_GID + 1u], 0u, ELM_GID + 1u >= uniforms.elementCount);
        var offset: u32 = 1u;
        for (var d: u32 = ITEMS_PER_WORKGROUP >> 1u; d > 0u; d >>= 1u) {
                workgroupBarrier();
                if (TID < d) {
                        var ai: u32 = offset * (ELM_TID + 1u) - 1u;
                        var bi: u32 = offset * (ELM_TID + 2u) - 1u;
                        temp[bi] += temp[ai];
                }
                offset *= 2u;
        }
        if (TID == 0u) {
                let last_offset = ITEMS_PER_WORKGROUP - 1u;
                blockSums[WORKGROUP_ID] = temp[last_offset];
                temp[last_offset] = 0u;
        }
        for (var d: u32 = 1u; d < ITEMS_PER_WORKGROUP; d *= 2u) {
                offset >>= 1u;
                workgroupBarrier();
                if (TID < d) {
                        var ai: u32 = offset * (ELM_TID + 1u) - 1u;
                        var bi: u32 = offset * (ELM_TID + 2u) - 1u;
                        let t: u32 = temp[ai];
                        temp[ai] = temp[bi];
                        temp[bi] += t;
                }
        }
        workgroupBarrier();
        if (ELM_GID < uniforms.elementCount) {
                items[ELM_GID] = temp[ELM_TID];
        }
        if (ELM_GID + 1u < uniforms.elementCount) {
                items[ELM_GID + 1u] = temp[ELM_TID + 1u];
        }
}
@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1)
fn add_block_sums(
        @builtin(workgroup_id) w_id: vec3<u32>,
        @builtin(num_workgroups) w_dim: vec3<u32>,
        @builtin(local_invocation_index) TID: u32,
) {
        let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
        let WID = WORKGROUP_ID * THREADS_PER_WORKGROUP;
        let GID = WID + TID;
        let ELM_ID = GID * 2u;
        if (ELM_ID >= uniforms.elementCount) {
                return;
        }
        let blockSum = blockSums[WORKGROUP_ID];
        items[ELM_ID] += blockSum;
        if (ELM_ID + 1u >= uniforms.elementCount) {
                return;
        }
        items[ELM_ID + 1u] += blockSum;
}
`

const WORKGROUP_SIZE_X$2 = 16
const WORKGROUP_SIZE_Y$2 = 16
const THREADS_PER_WORKGROUP$2 = WORKGROUP_SIZE_X$2 * WORKGROUP_SIZE_Y$2
const ITEMS_PER_WORKGROUP = 2 * THREADS_PER_WORKGROUP$2
class PrefixSumKernel {
    destroy() {
        this.destroyPasses()
        this._scanShader?.destroy()
        this._addBlockShader?.destroy()
        this._bindGroupFormat?.destroy()
        this._scanShader = null
        this._addBlockShader = null
        this._bindGroupFormat = null
        this._uniformBufferFormat = null
    }
    _createFormatsAndShaders() {
        this._uniformBufferFormat = new UniformBufferFormat(this.device, [
            new UniformFormat('elementCount', UNIFORMTYPE_UINT),
        ])
        this._bindGroupFormat = new BindGroupFormat(this.device, [
            new BindStorageBufferFormat('items', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('blockSums', SHADERSTAGE_COMPUTE, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
        ])
        this._scanShader = this._createShader('PrefixSumScan', 'reduce_downsweep')
        this._addBlockShader = this._createShader('PrefixSumAddBlock', 'add_block_sums')
    }
    createPassesRecursive(dataBuffer, count) {
        const workgroupCount = Math.ceil(count / ITEMS_PER_WORKGROUP)
        const { x: dispatchX, y: dispatchY } = this.findOptimalDispatchSize(workgroupCount)
        const blockSumBuffer = new StorageBuffer(this.device, workgroupCount * 4)
        const scanCompute = new Compute(this.device, this._scanShader, 'PrefixSumScan')
        scanCompute.setParameter('items', dataBuffer)
        scanCompute.setParameter('blockSums', blockSumBuffer)
        const pass = {
            scanCompute,
            addBlockCompute: null,
            blockSumBuffer,
            dispatchX,
            dispatchY,
            count,
            allocatedCount: count,
        }
        this.passes.push(pass)
        if (workgroupCount > 1) {
            this.createPassesRecursive(blockSumBuffer, workgroupCount)
            const addBlockCompute = new Compute(this.device, this._addBlockShader, 'PrefixSumAddBlock')
            addBlockCompute.setParameter('items', dataBuffer)
            addBlockCompute.setParameter('blockSums', blockSumBuffer)
            pass.addBlockCompute = addBlockCompute
        }
    }
    _createShader(name, entryPoint) {
        const cdefines = new Map()
        cdefines.set('{WORKGROUP_SIZE_X}', WORKGROUP_SIZE_X$2)
        cdefines.set('{WORKGROUP_SIZE_Y}', WORKGROUP_SIZE_Y$2)
        cdefines.set('{THREADS_PER_WORKGROUP}', THREADS_PER_WORKGROUP$2)
        cdefines.set('{ITEMS_PER_WORKGROUP}', ITEMS_PER_WORKGROUP)
        return new Shader(this.device, {
            name: name,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: prefixSumSource,
            cdefines: cdefines,
            computeEntryPoint: entryPoint,
            computeBindGroupFormat: this._bindGroupFormat,
            computeUniformBufferFormats: {
                uniforms: this._uniformBufferFormat,
            },
        })
    }
    findOptimalDispatchSize(workgroupCount) {
        const maxDimension = this.device.limits.maxComputeWorkgroupsPerDimension || 65535
        if (workgroupCount <= maxDimension) {
            return {
                x: workgroupCount,
                y: 1,
            }
        }
        const x = Math.floor(Math.sqrt(workgroupCount))
        const y = Math.ceil(workgroupCount / x)
        return {
            x,
            y,
        }
    }
    resize(dataBuffer, count) {
        const requiredPasses = this._countPassesNeeded(count)
        const currentPasses = this.passes.length
        if (requiredPasses > currentPasses) {
            this.destroyPasses()
            this.createPassesRecursive(dataBuffer, count)
            return
        }
        let levelCount = count
        for (let i = 0; i < this.passes.length; i++) {
            const workgroupCount = Math.ceil(levelCount / ITEMS_PER_WORKGROUP)
            const { x: dispatchX, y: dispatchY } = this.findOptimalDispatchSize(workgroupCount)
            this.passes[i].count = levelCount
            this.passes[i].dispatchX = dispatchX
            this.passes[i].dispatchY = dispatchY
            levelCount = workgroupCount
            if (workgroupCount <= 1) {
                break
            }
        }
    }
    destroyPasses() {
        for (const pass of this.passes) {
            pass.blockSumBuffer?.destroy()
        }
        this.passes.length = 0
    }
    _countPassesNeeded(count) {
        let passes = 0
        let levelCount = count
        while (levelCount > 0) {
            passes++
            const workgroupCount = Math.ceil(levelCount / ITEMS_PER_WORKGROUP)
            if (workgroupCount <= 1) break
            levelCount = workgroupCount
        }
        return passes
    }
    dispatch(device) {
        for (let i = 0; i < this.passes.length; i++) {
            const pass = this.passes[i]
            pass.scanCompute.setParameter('elementCount', pass.count)
            pass.scanCompute.setupDispatch(pass.dispatchX, pass.dispatchY, 1)
            device.computeDispatch([pass.scanCompute], 'PrefixSumScan')
        }
        for (let i = this.passes.length - 1; i >= 0; i--) {
            const pass = this.passes[i]
            if (pass.addBlockCompute) {
                pass.addBlockCompute.setParameter('elementCount', pass.count)
                pass.addBlockCompute.setupDispatch(pass.dispatchX, pass.dispatchY, 1)
                device.computeDispatch([pass.addBlockCompute], 'PrefixSumAddBlock')
            }
        }
    }
    constructor(device) {
        this.passes = []
        this._uniformBufferFormat = null
        this._bindGroupFormat = null
        this._scanShader = null
        this._addBlockShader = null
        this.device = device
        this._createFormatsAndShaders()
    }
}

const radixSort4bitSource = `
@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> local_prefix_sums: array<u32>;
@group(0) @binding(2) var<storage, read_write> block_sums: array<u32>;
struct RadixSortUniforms {
        workgroupCount: u32,
        elementCount: u32
};
@group(0) @binding(3) var<uniform> uniforms: RadixSortUniforms;
#ifdef USE_INDIRECT_SORT
        @group(0) @binding(4) var<storage, read> sortElementCount: array<u32>;
#endif
const THREADS_PER_WORKGROUP: u32 = {THREADS_PER_WORKGROUP}u;
const WORKGROUP_SIZE_X: u32 = {WORKGROUP_SIZE_X}u;
const WORKGROUP_SIZE_Y: u32 = {WORKGROUP_SIZE_Y}u;
const CURRENT_BIT: u32 = {CURRENT_BIT}u;
var<workgroup> histogram: array<atomic<u32>, 16>;
var<workgroup> thread_digits: array<u32, 256>;
@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1)
fn main(
        @builtin(workgroup_id) w_id: vec3<u32>,
        @builtin(num_workgroups) w_dim: vec3<u32>,
        @builtin(local_invocation_index) TID: u32,
) {
        let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
        let WID = WORKGROUP_ID * THREADS_PER_WORKGROUP;
        let GID = WID + TID;
        if (TID < 16u) {
                atomicStore(&histogram[TID], 0u);
        }
        workgroupBarrier();
        #ifdef USE_INDIRECT_SORT
                let elementCount = sortElementCount[0];
        #else
                let elementCount = uniforms.elementCount;
        #endif
        let is_valid = GID < elementCount && WORKGROUP_ID < uniforms.workgroupCount;
        let elm = select(0u, input[GID], is_valid);
        let digit: u32 = select(16u, (elm >> CURRENT_BIT) & 0xFu, is_valid);
        thread_digits[TID] = digit;
        if (is_valid) {
                atomicAdd(&histogram[digit], 1u);
        }
        workgroupBarrier();
        var local_prefix: u32 = 0u;
        if (is_valid) {
                let digit_vec = vec4<u32>(digit, digit, digit, digit);
                let ones = vec4<u32>(1u, 1u, 1u, 1u);
                let zeros = vec4<u32>(0u, 0u, 0u, 0u);
                
                var i: u32 = 0u;
                let limit = TID & ~3u;
                for (; i < limit; i += 4u) {
                        let d = vec4<u32>(
                                thread_digits[i],
                                thread_digits[i + 1u],
                                thread_digits[i + 2u],
                                thread_digits[i + 3u]
                        );
                        let matches = select(zeros, ones, d == digit_vec);
                        local_prefix += matches.x + matches.y + matches.z + matches.w;
                }
                
                for (; i < TID; i++) {
                        local_prefix += select(0u, 1u, thread_digits[i] == digit);
                }
        }
        if (is_valid) {
                local_prefix_sums[GID] = local_prefix;
        }
        if (TID < 16u && WORKGROUP_ID < uniforms.workgroupCount) {
                block_sums[TID * uniforms.workgroupCount + WORKGROUP_ID] = atomicLoad(&histogram[TID]);
        }
}
`

const radixSortReorderSource = `
@group(0) @binding(0) var<storage, read> inputKeys: array<u32>;
@group(0) @binding(1) var<storage, read_write> outputKeys: array<u32>;
@group(0) @binding(2) var<storage, read> local_prefix_sum: array<u32>;
@group(0) @binding(3) var<storage, read> prefix_block_sum: array<u32>;
@group(0) @binding(4) var<storage, read> inputValues: array<u32>;
@group(0) @binding(5) var<storage, read_write> outputValues: array<u32>;
struct RadixSortUniforms {
        workgroupCount: u32,
        elementCount: u32
};
@group(0) @binding(6) var<uniform> uniforms: RadixSortUniforms;
#ifdef USE_INDIRECT_SORT
        @group(0) @binding(7) var<storage, read> sortElementCount: array<u32>;
#endif
const THREADS_PER_WORKGROUP: u32 = {THREADS_PER_WORKGROUP}u;
const WORKGROUP_SIZE_X: u32 = {WORKGROUP_SIZE_X}u;
const WORKGROUP_SIZE_Y: u32 = {WORKGROUP_SIZE_Y}u;
const CURRENT_BIT: u32 = {CURRENT_BIT}u;
const IS_FIRST_PASS: u32 = {IS_FIRST_PASS}u;
@compute @workgroup_size(WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y, 1)
fn main(
        @builtin(workgroup_id) w_id: vec3<u32>,
        @builtin(num_workgroups) w_dim: vec3<u32>,
        @builtin(local_invocation_index) TID: u32,
) {
        let WORKGROUP_ID = w_id.x + w_id.y * w_dim.x;
        let WID = WORKGROUP_ID * THREADS_PER_WORKGROUP;
        let GID = WID + TID;
        #ifdef USE_INDIRECT_SORT
                let elementCount = sortElementCount[0];
        #else
                let elementCount = uniforms.elementCount;
        #endif
        if (GID >= elementCount) {
                return;
        }
        let k = inputKeys[GID];
        let v = select(inputValues[GID], GID, IS_FIRST_PASS == 1u);
        let local_prefix = local_prefix_sum[GID];
        let extract_bits = (k >> CURRENT_BIT) & 0xFu;
        
        let pid = extract_bits * uniforms.workgroupCount + WORKGROUP_ID;
        let sorted_position = prefix_block_sum[pid] + local_prefix;
        outputKeys[sorted_position] = k;
        outputValues[sorted_position] = v;
}
`

const BITS_PER_PASS = 4
const BUCKET_COUNT = 16
const WORKGROUP_SIZE_X$1 = 16
const WORKGROUP_SIZE_Y$1 = 16
const THREADS_PER_WORKGROUP$1 = WORKGROUP_SIZE_X$1 * WORKGROUP_SIZE_Y$1
class ComputeRadixSort {
    destroy() {
        this._destroyBuffers()
        this._destroyPasses()
        this._blockSumBindGroupFormat?.destroy()
        this._reorderBindGroupFormat?.destroy()
        this._blockSumBindGroupFormat = null
        this._reorderBindGroupFormat = null
        this._uniformBufferFormat = null
    }
    _destroyPasses() {
        for (const pass of this._passes) {
            pass.blockSumCompute.shader?.destroy()
            pass.reorderCompute.shader?.destroy()
        }
        this._passes.length = 0
        this._numBits = 0
    }
    _destroyBuffers() {
        this._keys0?.destroy()
        this._keys1?.destroy()
        this._values0?.destroy()
        this._values1?.destroy()
        this._localPrefixSums?.destroy()
        this._blockSums?.destroy()
        this._sortedIndices?.destroy()
        this._prefixSumKernel?.destroy()
        this._keys0 = null
        this._keys1 = null
        this._values0 = null
        this._values1 = null
        this._localPrefixSums = null
        this._blockSums = null
        this._sortedIndices = null
        this._prefixSumKernel = null
        this._workgroupCount = 0
        this._allocatedWorkgroupCount = 0
    }
    get sortedIndices() {
        return this._sortedIndices
    }
    _ensureBindGroupFormats(indirect) {
        if (this._blockSumBindGroupFormat && this._indirect === indirect) {
            return
        }
        this._blockSumBindGroupFormat?.destroy()
        this._reorderBindGroupFormat?.destroy()
        const device = this.device
        const blockSumEntries = [
            new BindStorageBufferFormat('input', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('local_prefix_sums', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('block_sums', SHADERSTAGE_COMPUTE, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
        ]
        const reorderEntries = [
            new BindStorageBufferFormat('inputKeys', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('outputKeys', SHADERSTAGE_COMPUTE, false),
            new BindStorageBufferFormat('local_prefix_sum', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('prefix_block_sum', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('inputValues', SHADERSTAGE_COMPUTE, true),
            new BindStorageBufferFormat('outputValues', SHADERSTAGE_COMPUTE, false),
            new BindUniformBufferFormat('uniforms', SHADERSTAGE_COMPUTE),
        ]
        if (indirect) {
            blockSumEntries.push(new BindStorageBufferFormat('sortElementCount', SHADERSTAGE_COMPUTE, true))
            reorderEntries.push(new BindStorageBufferFormat('sortElementCount', SHADERSTAGE_COMPUTE, true))
        }
        this._blockSumBindGroupFormat = new BindGroupFormat(device, blockSumEntries)
        this._reorderBindGroupFormat = new BindGroupFormat(device, reorderEntries)
    }
    _createPasses(numBits, indirect, hasInitialValues) {
        this._destroyPasses()
        this._numBits = numBits
        this._ensureBindGroupFormats(indirect)
        this._indirect = indirect
        this._hasInitialValues = hasInitialValues
        const numPasses = numBits / BITS_PER_PASS
        const suffix = indirect ? '-Indirect' : ''
        for (let pass = 0; pass < numPasses; pass++) {
            const bitOffset = pass * BITS_PER_PASS
            const isFirstPass = pass === 0 && !hasInitialValues
            const blockSumShader = this._createShader(
                `RadixSort4bit-BlockSum${suffix}-${bitOffset}`,
                radixSort4bitSource,
                bitOffset,
                false,
                this._blockSumBindGroupFormat,
                indirect,
            )
            const reorderShader = this._createShader(
                `RadixSort4bit-Reorder${suffix}-${bitOffset}`,
                radixSortReorderSource,
                bitOffset,
                isFirstPass,
                this._reorderBindGroupFormat,
                indirect,
            )
            const blockSumCompute = new Compute(
                this.device,
                blockSumShader,
                `RadixSort4bit-BlockSum${suffix}-${bitOffset}`,
            )
            const reorderCompute = new Compute(
                this.device,
                reorderShader,
                `RadixSort4bit-Reorder${suffix}-${bitOffset}`,
            )
            this._passes.push({
                blockSumCompute,
                reorderCompute,
            })
        }
    }
    _allocateBuffers(elementCount, numBits, indirect, hasInitialValues) {
        const workgroupCount = Math.ceil(elementCount / THREADS_PER_WORKGROUP$1)
        const buffersNeedRealloc = workgroupCount > this._allocatedWorkgroupCount || !this._keys0
        const passesNeedRecreate =
            numBits !== this._numBits || indirect !== this._indirect || hasInitialValues !== this._hasInitialValues
        if (buffersNeedRealloc) {
            this._destroyBuffers()
            this._allocatedWorkgroupCount = workgroupCount
            const elementSize = elementCount * 4
            const blockSumSize = BUCKET_COUNT * workgroupCount * 4
            this._keys0 = new StorageBuffer(this.device, elementSize, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
            this._keys1 = new StorageBuffer(this.device, elementSize, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
            this._values0 = new StorageBuffer(this.device, elementSize, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
            this._values1 = new StorageBuffer(this.device, elementSize, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
            this._localPrefixSums = new StorageBuffer(
                this.device,
                elementSize,
                BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST,
            )
            this._blockSums = new StorageBuffer(this.device, blockSumSize, BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST)
            this._sortedIndices = new StorageBuffer(
                this.device,
                elementSize,
                BUFFERUSAGE_COPY_SRC | BUFFERUSAGE_COPY_DST,
            )
            this._prefixSumKernel = new PrefixSumKernel(this.device)
        }
        this._workgroupCount = workgroupCount
        Compute.calcDispatchSize(
            workgroupCount,
            this._dispatchSize,
            this.device.limits.maxComputeWorkgroupsPerDimension || 65535,
        )
        this._prefixSumKernel.resize(this._blockSums, BUCKET_COUNT * workgroupCount)
        if (passesNeedRecreate) {
            this._createPasses(numBits, indirect, hasInitialValues)
        }
    }
    _createShader(name, source, currentBit, isFirstPass, bindGroupFormat, indirect) {
        const cdefines = new Map()
        cdefines.set('{WORKGROUP_SIZE_X}', WORKGROUP_SIZE_X$1)
        cdefines.set('{WORKGROUP_SIZE_Y}', WORKGROUP_SIZE_Y$1)
        cdefines.set('{THREADS_PER_WORKGROUP}', THREADS_PER_WORKGROUP$1)
        cdefines.set('{CURRENT_BIT}', currentBit)
        cdefines.set('{IS_FIRST_PASS}', isFirstPass ? 1 : 0)
        if (indirect) {
            cdefines.set('USE_INDIRECT_SORT', '')
        }
        return new Shader(this.device, {
            name: name,
            shaderLanguage: SHADERLANGUAGE_WGSL,
            cshader: source,
            cdefines: cdefines,
            computeBindGroupFormat: bindGroupFormat,
            computeUniformBufferFormats: {
                uniforms: this._uniformBufferFormat,
            },
        })
    }
    sort(keysBuffer, elementCount, numBits = 16) {
        return this._execute(keysBuffer, elementCount, numBits, false, -1, null, undefined)
    }
    sortIndirect(keysBuffer, maxElementCount, numBits, dispatchSlot, sortElementCountBuffer, initialValues) {
        return this._execute(
            keysBuffer,
            maxElementCount,
            numBits,
            true,
            dispatchSlot,
            sortElementCountBuffer,
            initialValues,
        )
    }
    _execute(keysBuffer, elementCount, numBits, indirect, dispatchSlot, sortElementCountBuffer, initialValues) {
        this._elementCount = elementCount
        const hasInitialValues = !!initialValues
        this._allocateBuffers(elementCount, numBits, indirect, hasInitialValues)
        const device = this.device
        const numPasses = numBits / BITS_PER_PASS
        const suffix = indirect ? '-Indirect' : ''
        let currentKeys = keysBuffer
        let currentValues = initialValues ?? this._values0
        let nextKeys = this._keys0
        let nextValues = this._values1
        for (let pass = 0; pass < numPasses; pass++) {
            const { blockSumCompute, reorderCompute } = this._passes[pass]
            const isLastPass = pass === numPasses - 1
            if (indirect) {
                this._blockSums.clear()
            }
            blockSumCompute.setParameter('input', currentKeys)
            blockSumCompute.setParameter('local_prefix_sums', this._localPrefixSums)
            blockSumCompute.setParameter('block_sums', this._blockSums)
            blockSumCompute.setParameter('workgroupCount', this._workgroupCount)
            blockSumCompute.setParameter('elementCount', elementCount)
            if (indirect) {
                blockSumCompute.setParameter('sortElementCount', sortElementCountBuffer)
                blockSumCompute.setupIndirectDispatch(dispatchSlot)
            } else {
                blockSumCompute.setupDispatch(this._dispatchSize.x, this._dispatchSize.y, 1)
            }
            device.computeDispatch([blockSumCompute], `RadixSort-BlockSum${suffix}`)
            this._prefixSumKernel.dispatch(device)
            const outputValues = isLastPass ? this._sortedIndices : nextValues
            reorderCompute.setParameter('inputKeys', currentKeys)
            reorderCompute.setParameter('outputKeys', nextKeys)
            reorderCompute.setParameter('local_prefix_sum', this._localPrefixSums)
            reorderCompute.setParameter('prefix_block_sum', this._blockSums)
            reorderCompute.setParameter('inputValues', currentValues)
            reorderCompute.setParameter('outputValues', outputValues)
            reorderCompute.setParameter('workgroupCount', this._workgroupCount)
            reorderCompute.setParameter('elementCount', elementCount)
            if (indirect) {
                reorderCompute.setParameter('sortElementCount', sortElementCountBuffer)
                reorderCompute.setupIndirectDispatch(dispatchSlot)
            } else {
                reorderCompute.setupDispatch(this._dispatchSize.x, this._dispatchSize.y, 1)
            }
            device.computeDispatch([reorderCompute], `RadixSort-Reorder${suffix}`)
            if (!isLastPass) {
                currentKeys = nextKeys
                nextKeys = currentKeys === this._keys0 ? this._keys1 : this._keys0
                const tempValues = currentValues
                currentValues = nextValues
                nextValues = tempValues
            }
        }
        return this._sortedIndices
    }
    constructor(device) {
        this._elementCount = 0
        this._workgroupCount = 0
        this._allocatedWorkgroupCount = 0
        this._numBits = 0
        this._keys0 = null
        this._keys1 = null
        this._values0 = null
        this._values1 = null
        this._localPrefixSums = null
        this._blockSums = null
        this._sortedIndices = null
        this._prefixSumKernel = null
        this._dispatchSize = new Vec2(1, 1)
        this._blockSumBindGroupFormat = null
        this._reorderBindGroupFormat = null
        this._uniformBufferFormat = null
        this._passes = []
        this._indirect = false
        this._hasInitialValues = false
        this.device = device
        this._uniformBufferFormat = new UniformBufferFormat(device, [
            new UniformFormat('workgroupCount', UNIFORMTYPE_UINT),
            new UniformFormat('elementCount', UNIFORMTYPE_UINT),
        ])
    }
}

class RenderPassShaderQuad extends RenderPass {
    set shader(shader) {
        this.quadRender?.destroy()
        this.quadRender = null
        this._shader = shader
        if (shader) {
            this.quadRender = new QuadRender(shader)
        }
    }
    get shader() {
        return this._shader
    }
    execute() {
        this.device.setDrawStates(
            this.blendState,
            this.depthState,
            this.cullMode,
            this.frontFace,
            this.stencilFront,
            this.stencilBack,
        )
        this.quadRender?.render(this.viewport, this.scissor)
    }
    constructor(...args) {
        ;(super(...args),
            (this._shader = null),
            (this.quadRender = null),
            (this.cullMode = CULLFACE_NONE),
            (this.frontFace = FRONTFACE_CCW),
            (this.blendState = BlendState.NOBLEND),
            (this.depthState = DepthState.NODEPTH),
            (this.stencilFront = null),
            (this.stencilBack = null))
    }
}

class LitShaderOptions {
    constructor() {
        this.hasTangents = false
        this.shaderChunks = null
        this.pass = 0
        this.alphaTest = false
        this.blendType = BLEND_NONE
        this.separateAmbient = false
        this.screenSpace = false
        this.skin = false
        this.batch = false
        this.useInstancing = false
        this.useMorphPosition = false
        this.useMorphNormal = false
        this.useMorphTextureBasedInt = false
        this.nineSlicedMode = 0
        this.clusteredLightingEnabled = true
        this.clusteredLightingCookiesEnabled = false
        this.clusteredLightingShadowsEnabled = false
        this.clusteredLightingShadowType = 0
        this.clusteredLightingAreaLightsEnabled = false
        this.vertexColors = false
        this.useVertexColorGamma = false
        this.lightMapEnabled = false
        this.dirLightMapEnabled = false
        this.useHeights = false
        this.useNormals = false
        this.useClearCoatNormals = false
        this.useAo = false
        this.diffuseMapEnabled = false
        this.pixelSnap = false
        this.ambientSH = false
        this.ssao = false
        this.twoSidedLighting = false
        this.occludeDirect = false
        this.occludeSpecular = 0
        this.occludeSpecularFloat = false
        this.useMsdf = false
        this.msdfTextAttribute = false
        this.alphaToCoverage = false
        this.opacityFadesSpecular = false
        this.opacityDither = DITHER_NONE
        this.opacityShadowDither = DITHER_NONE
        this.cubeMapProjection = 0
        this.useSpecular = false
        this.useSpecularityFactor = false
        this.enableGGXSpecular = false
        this.fresnelModel = 0
        this.useRefraction = false
        this.useClearCoat = false
        this.useSheen = false
        this.useIridescence = false
        this.useMetalness = false
        this.useDynamicRefraction = false
        this.dispersion = false
        this.fog = FOG_NONE
        this.gamma = GAMMA_NONE
        this.toneMap = -1
        this.reflectionSource = REFLECTIONSRC_NONE
        this.reflectionEncoding = null
        this.reflectionCubemapEncoding = null
        this.ambientSource = 'constant'
        this.ambientEncoding = null
        this.skyboxIntensity = 1.0
        this.useCubeMapRotation = false
        this.lightMapWithoutAmbient = false
        this.lights = []
        this.noShadow = false
        this.lightMaskDynamic = 0x0
        this.userAttributes = {}
        this.linearDepth = false
        this.shadowCatcher = false
    }
}

class LitMaterialOptionsBuilder {
    static update(litOptions, material, scene, renderParams, objDefs, pass, sortedLights) {
        LitMaterialOptionsBuilder.updateSharedOptions(litOptions, material, scene, objDefs, pass)
        LitMaterialOptionsBuilder.updateMaterialOptions(litOptions, material)
        LitMaterialOptionsBuilder.updateEnvOptions(litOptions, material, scene, renderParams)
        LitMaterialOptionsBuilder.updateLightingOptions(litOptions, material, scene, objDefs, sortedLights)
    }
    static updateSharedOptions(litOptions, material, scene, objDefs, pass) {
        litOptions.shaderChunks = material.shaderChunks
        litOptions.pass = pass
        litOptions.alphaTest = material.alphaTest > 0
        litOptions.blendType = material.blendType
        litOptions.screenSpace = objDefs && (objDefs & SHADERDEF_SCREENSPACE) !== 0
        litOptions.skin = objDefs && (objDefs & SHADERDEF_SKIN) !== 0
        litOptions.useInstancing = objDefs && (objDefs & SHADERDEF_INSTANCING) !== 0
        litOptions.useMorphPosition = objDefs && (objDefs & SHADERDEF_MORPH_POSITION) !== 0
        litOptions.useMorphNormal = objDefs && (objDefs & SHADERDEF_MORPH_NORMAL) !== 0
        litOptions.useMorphTextureBasedInt = objDefs && (objDefs & SHADERDEF_MORPH_TEXTURE_BASED_INT) !== 0
        litOptions.hasTangents = objDefs && (objDefs & SHADERDEF_TANGENTS) !== 0
        litOptions.nineSlicedMode = material.nineSlicedMode || SPRITE_RENDERMODE_SIMPLE
        if (material.useLighting && scene.clusteredLightingEnabled) {
            litOptions.clusteredLightingEnabled = true
            litOptions.clusteredLightingCookiesEnabled = scene.lighting.cookiesEnabled
            litOptions.clusteredLightingShadowsEnabled = scene.lighting.shadowsEnabled
            litOptions.clusteredLightingShadowType = scene.lighting.shadowType
            litOptions.clusteredLightingAreaLightsEnabled = scene.lighting.areaLightsEnabled
        } else {
            litOptions.clusteredLightingEnabled = false
            litOptions.clusteredLightingCookiesEnabled = false
            litOptions.clusteredLightingShadowsEnabled = false
            litOptions.clusteredLightingAreaLightsEnabled = false
        }
    }
    static updateMaterialOptions(litOptions, material) {
        litOptions.separateAmbient = false
        litOptions.pixelSnap = material.pixelSnap
        litOptions.ambientSH = material.ambientSH
        litOptions.twoSidedLighting = material.twoSidedLighting
        litOptions.occludeDirect = material.occludeDirect
        litOptions.occludeSpecular = material.occludeSpecular
        litOptions.occludeSpecularFloat = material.occludeSpecularIntensity !== 1.0
        litOptions.useMsdf = false
        litOptions.msdfTextAttribute = false
        litOptions.alphaToCoverage = material.alphaToCoverage
        litOptions.opacityFadesSpecular = material.opacityFadesSpecular
        litOptions.opacityDither = material.opacityDither
        litOptions.cubeMapProjection = CUBEPROJ_NONE
        litOptions.useSpecular = material.hasSpecular
        litOptions.useSpecularityFactor = material.hasSpecularityFactor
        litOptions.enableGGXSpecular = material.ggxSpecular
        litOptions.useAnisotropy = false
        litOptions.fresnelModel = material.fresnelModel
        litOptions.useRefraction = material.hasRefraction
        litOptions.useClearCoat = material.hasClearCoat
        litOptions.useSheen = material.hasSheen
        litOptions.useIridescence = material.hasIrridescence
        litOptions.useMetalness = material.hasMetalness
        litOptions.useDynamicRefraction = material.dynamicRefraction
        litOptions.dispersion = material.dispersion > 0
        litOptions.vertexColors = false
        litOptions.lightMapEnabled = material.hasLighting
        litOptions.dirLightMapEnabled = material.dirLightMap
        litOptions.useHeights = material.hasHeights
        litOptions.useNormals = material.hasNormals
        litOptions.useClearCoatNormals = material.hasClearCoatNormals
        litOptions.useAo = material.hasAo
        litOptions.diffuseMapEnabled = material.hasDiffuseMap
    }
    static updateEnvOptions(litOptions, material, scene, renderParams) {
        litOptions.fog = material.useFog ? renderParams.fog : FOG_NONE
        litOptions.gamma = renderParams.shaderOutputGamma
        litOptions.toneMap = material.useTonemap ? renderParams.toneMapping : TONEMAP_NONE
        if (material.useSkybox && scene.envAtlas && scene.skybox) {
            litOptions.reflectionSource = REFLECTIONSRC_ENVATLASHQ
            litOptions.reflectionEncoding = scene.envAtlas.encoding
            litOptions.reflectionCubemapEncoding = scene.skybox.encoding
        } else if (material.useSkybox && scene.envAtlas) {
            litOptions.reflectionSource = REFLECTIONSRC_ENVATLAS
            litOptions.reflectionEncoding = scene.envAtlas.encoding
        } else if (material.useSkybox && scene.skybox) {
            litOptions.reflectionSource = REFLECTIONSRC_CUBEMAP
            litOptions.reflectionEncoding = scene.skybox.encoding
        } else {
            litOptions.reflectionSource = REFLECTIONSRC_NONE
            litOptions.reflectionEncoding = null
        }
        if (material.ambientSH) {
            litOptions.ambientSource = AMBIENTSRC_AMBIENTSH
            litOptions.ambientEncoding = null
        } else if (litOptions.reflectionSource !== REFLECTIONSRC_NONE && scene.envAtlas) {
            litOptions.ambientSource = AMBIENTSRC_ENVALATLAS
            litOptions.ambientEncoding = scene.envAtlas.encoding
        } else {
            litOptions.ambientSource = AMBIENTSRC_CONSTANT
            litOptions.ambientEncoding = null
        }
        const hasSkybox = litOptions.reflectionSource !== REFLECTIONSRC_NONE
        litOptions.skyboxIntensity = hasSkybox
        litOptions.useCubeMapRotation = hasSkybox && scene._skyboxRotationShaderInclude
    }
    static updateLightingOptions(litOptions, material, scene, objDefs, sortedLights) {
        litOptions.lightMapWithoutAmbient = false
        if (material.useLighting) {
            const lightsFiltered = []
            const mask = objDefs ? objDefs >> 16 : MASK_AFFECT_DYNAMIC
            litOptions.lightMaskDynamic = !!(mask & MASK_AFFECT_DYNAMIC)
            litOptions.lightMapWithoutAmbient = false
            if (sortedLights) {
                LitMaterialOptionsBuilder.collectLights(
                    LIGHTTYPE_DIRECTIONAL,
                    sortedLights[LIGHTTYPE_DIRECTIONAL],
                    lightsFiltered,
                    mask,
                )
                if (!scene.clusteredLightingEnabled) {
                    LitMaterialOptionsBuilder.collectLights(
                        LIGHTTYPE_OMNI,
                        sortedLights[LIGHTTYPE_OMNI],
                        lightsFiltered,
                        mask,
                    )
                    LitMaterialOptionsBuilder.collectLights(
                        LIGHTTYPE_SPOT,
                        sortedLights[LIGHTTYPE_SPOT],
                        lightsFiltered,
                        mask,
                    )
                }
            }
            litOptions.lights = lightsFiltered
        } else {
            litOptions.lights = []
        }
        if (
            (litOptions.lights.length === 0 && !scene.clusteredLightingEnabled) ||
            (objDefs & SHADERDEF_NOSHADOW) !== 0
        ) {
            litOptions.noShadow = true
        }
    }
    static collectLights(lType, lights, lightsFiltered, mask) {
        for (let i = 0; i < lights.length; i++) {
            const light = lights[i]
            if (light.enabled) {
                if (light.mask & mask) {
                    lightsFiltered.push(light)
                }
            }
        }
    }
}

const builtinAttributes = {
    vertex_normal: SEMANTIC_NORMAL,
    vertex_tangent: SEMANTIC_TANGENT,
    vertex_texCoord0: SEMANTIC_TEXCOORD0,
    vertex_texCoord1: SEMANTIC_TEXCOORD1,
    vertex_color: SEMANTIC_COLOR,
    vertex_boneWeights: SEMANTIC_BLENDWEIGHT,
    vertex_boneIndices: SEMANTIC_BLENDINDICES,
}
class LitShader {
    fDefineSet(condition, name, value = '') {
        if (condition) {
            this.fDefines.set(name, value)
        }
    }
    generateVertexShader(useUv, useUnmodifiedUv, mapTransforms) {
        const { options, vDefines, attributes } = this
        const varyings = new Map()
        varyings.set('vPositionW', 'vec3')
        if (options.nineSlicedMode === SPRITE_RENDERMODE_SLICED || options.nineSlicedMode === SPRITE_RENDERMODE_TILED) {
            vDefines.set('NINESLICED', true)
        }
        if (this.options.linearDepth) {
            vDefines.set('LINEAR_DEPTH', true)
            varyings.set('vLinearDepth', 'float')
        }
        if (this.needsNormal) vDefines.set('NORMALS', true)
        if (this.options.useInstancing) {
            const languageChunks = ShaderChunks.get(this.device, this.shaderLanguage)
            if (this.chunks.get('transformInstancingVS') === languageChunks.get('transformInstancingVS')) {
                attributes.instance_line1 = SEMANTIC_ATTR11
                attributes.instance_line2 = SEMANTIC_ATTR12
                attributes.instance_line3 = SEMANTIC_ATTR14
                attributes.instance_line4 = SEMANTIC_ATTR15
            }
        }
        if (this.needsNormal) {
            attributes.vertex_normal = SEMANTIC_NORMAL
            varyings.set('vNormalW', 'vec3')
            if (
                options.hasTangents &&
                (options.useHeights || options.useNormals || options.useClearCoatNormals || options.enableGGXSpecular)
            ) {
                vDefines.set('TANGENTS', true)
                attributes.vertex_tangent = SEMANTIC_TANGENT
                varyings.set('vTangentW', 'vec3')
                varyings.set('vBinormalW', 'vec3')
            } else if (options.enableGGXSpecular) {
                vDefines.set('GGX_SPECULAR', true)
                varyings.set('vObjectSpaceUpW', 'vec3')
            }
        }
        const maxUvSets = 2
        for (let i = 0; i < maxUvSets; i++) {
            if (useUv[i]) {
                vDefines.set(`UV${i}`, true)
                attributes[`vertex_texCoord${i}`] = `TEXCOORD${i}`
            }
            if (useUnmodifiedUv[i]) {
                vDefines.set(`UV${i}_UNMODIFIED`, true)
                varyings.set(`vUv${i}`, 'vec2')
            }
        }
        let numTransforms = 0
        const transformDone = new Set()
        mapTransforms.forEach((mapTransform) => {
            const { id, uv, name } = mapTransform
            const checkId = id + uv * 100
            if (!transformDone.has(checkId)) {
                transformDone.add(checkId)
                varyings.set(`vUV${uv}_${id}`, 'vec2')
                const varName = `texture_${name}MapTransform`
                vDefines.set(`{TRANSFORM_NAME_${numTransforms}}`, varName)
                vDefines.set(`{TRANSFORM_UV_${numTransforms}}`, uv)
                vDefines.set(`{TRANSFORM_ID_${numTransforms}}`, id)
                numTransforms++
            }
        })
        vDefines.set('UV_TRANSFORMS_COUNT', numTransforms)
        if (options.vertexColors) {
            attributes.vertex_color = SEMANTIC_COLOR
            vDefines.set('VERTEX_COLOR', true)
            varyings.set('vVertexColor', 'vec4')
            if (options.useVertexColorGamma) {
                vDefines.set('STD_VERTEX_COLOR_GAMMA', '')
            }
        }
        if (options.useMsdf && options.msdfTextAttribute) {
            attributes.vertex_outlineParameters = SEMANTIC_ATTR8
            attributes.vertex_shadowParameters = SEMANTIC_ATTR9
            vDefines.set('MSDF', true)
        }
        if (options.useMorphPosition || options.useMorphNormal) {
            vDefines.set('MORPHING', true)
            if (options.useMorphTextureBasedInt) vDefines.set('MORPHING_INT', true)
            if (options.useMorphPosition) vDefines.set('MORPHING_POSITION', true)
            if (options.useMorphNormal) vDefines.set('MORPHING_NORMAL', true)
            attributes.morph_vertex_id = SEMANTIC_ATTR15
        }
        if (options.skin) {
            attributes.vertex_boneIndices = SEMANTIC_BLENDINDICES
            if (options.batch) {
                vDefines.set('BATCH', true)
            } else {
                attributes.vertex_boneWeights = SEMANTIC_BLENDWEIGHT
                vDefines.set('SKIN', true)
            }
        }
        if (options.useInstancing) vDefines.set('INSTANCING', true)
        if (options.screenSpace) vDefines.set('SCREENSPACE', true)
        if (options.pixelSnap) vDefines.set('PIXELSNAP', true)
        varyings.forEach((type, name) => {
            this.varyingsCode += `#define VARYING_${name.toUpperCase()}\n`
            this.varyingsCode +=
                this.shaderLanguage === SHADERLANGUAGE_WGSL
                    ? `varying ${name}: ${primitiveGlslToWgslTypeMap.get(type)};\n`
                    : `varying ${type} ${name};\n`
        })
        this.includes.set('varyingsVS', this.varyingsCode)
        this.includes.set('varyingsPS', this.varyingsCode)
        this.vshader = `
                                                #include "litMainVS"
                                `
    }
    _setupLightingDefines(hasAreaLights, clusteredLightingEnabled) {
        const fDefines = this.fDefines
        const options = this.options
        this.fDefines.set('LIGHT_COUNT', options.lights.length)
        if (hasAreaLights) fDefines.set('AREA_LIGHTS', true)
        if (clusteredLightingEnabled && this.lighting) {
            fDefines.set('LIT_CLUSTERED_LIGHTS', true)
            if (options.clusteredLightingCookiesEnabled) fDefines.set('CLUSTER_COOKIES', true)
            if (options.clusteredLightingAreaLightsEnabled) fDefines.set('CLUSTER_AREALIGHTS', true)
            if (options.lightMaskDynamic) fDefines.set('CLUSTER_MESH_DYNAMIC_LIGHTS', true)
            if (options.clusteredLightingShadowsEnabled && !options.noShadow) {
                const clusteredShadowInfo = shadowTypeInfo.get(options.clusteredLightingShadowType)
                fDefines.set('CLUSTER_SHADOWS', true)
                fDefines.set(`SHADOW_KIND_${clusteredShadowInfo.kind}`, true)
                fDefines.set(`CLUSTER_SHADOW_TYPE_${clusteredShadowInfo.kind}`, true)
            }
        }
        for (let i = 0; i < options.lights.length; i++) {
            const light = options.lights[i]
            const lightType = light._type
            if (clusteredLightingEnabled && lightType !== LIGHTTYPE_DIRECTIONAL) {
                continue
            }
            const lightShape = hasAreaLights && light._shape ? light._shape : LIGHTSHAPE_PUNCTUAL
            const shadowType = light._shadowType
            const castShadow = light.castShadows && !options.noShadow
            const shadowInfo = shadowTypeInfo.get(shadowType)
            fDefines.set(`LIGHT${i}`, true)
            fDefines.set(`LIGHT${i}TYPE`, `${lightTypeNames[lightType]}`)
            fDefines.set(`LIGHT${i}SHADOWTYPE`, `${shadowInfo.name}`)
            fDefines.set(`LIGHT${i}SHAPE`, `${lightShapeNames[lightShape]}`)
            fDefines.set(`LIGHT${i}FALLOFF`, `${lightFalloffNames[light._falloffMode]}`)
            if (light.affectSpecularity) fDefines.set(`LIGHT${i}AFFECT_SPECULARITY`, true)
            if (light._cookie) {
                if (
                    (lightType === LIGHTTYPE_SPOT && !light._cookie._cubemap) ||
                    (lightType === LIGHTTYPE_OMNI && light._cookie._cubemap)
                ) {
                    fDefines.set(`LIGHT${i}COOKIE`, true)
                    fDefines.set(`{LIGHT${i}COOKIE_CHANNEL}`, light._cookieChannel)
                    if (lightType === LIGHTTYPE_SPOT) {
                        if (light._cookieTransform) fDefines.set(`LIGHT${i}COOKIE_TRANSFORM`, true)
                        if (light._cookieFalloff) fDefines.set(`LIGHT${i}COOKIE_FALLOFF`, true)
                    }
                }
            }
            if (castShadow) {
                fDefines.set(`LIGHT${i}CASTSHADOW`, true)
                if (shadowInfo.pcf) fDefines.set(`LIGHT${i}SHADOW_PCF`, true)
                if (light._normalOffsetBias && !light._isVsm)
                    fDefines.set(`LIGHT${i}_SHADOW_SAMPLE_NORMAL_OFFSET`, true)
                if (lightType === LIGHTTYPE_DIRECTIONAL) {
                    fDefines.set(`LIGHT${i}_SHADOW_SAMPLE_ORTHO`, true)
                    if (light.cascadeBlend > 0) fDefines.set(`LIGHT${i}_SHADOW_CASCADE_BLEND`, true)
                    if (light.numCascades > 1) fDefines.set(`LIGHT${i}_SHADOW_CASCADES`, true)
                }
                if (shadowInfo.pcf || shadowInfo.pcss || this.device.isWebGPU)
                    fDefines.set(`LIGHT${i}_SHADOW_SAMPLE_SOURCE_ZBUFFER`, true)
                if (lightType === LIGHTTYPE_OMNI) fDefines.set(`LIGHT${i}_SHADOW_SAMPLE_POINT`, true)
            }
            if (castShadow) {
                fDefines.set(`SHADOW_KIND_${shadowInfo.kind}`, true)
                if (lightType === LIGHTTYPE_DIRECTIONAL) fDefines.set('SHADOW_DIRECTIONAL', true)
            }
        }
    }
    prepareForwardPass(lightingUv) {
        const { options } = this
        const clusteredAreaLights = options.clusteredLightingEnabled && options.clusteredLightingAreaLightsEnabled
        const hasAreaLights =
            clusteredAreaLights ||
            options.lights.some((light) => {
                return light._shape && light._shape !== LIGHTSHAPE_PUNCTUAL
            })
        const addAmbient = !options.lightMapEnabled || options.lightMapWithoutAmbient
        const hasTBN =
            this.needsNormal &&
            (options.useNormals || options.useClearCoatNormals || (options.enableGGXSpecular && !options.useHeights))
        if (options.useSpecular) {
            this.fDefineSet(true, 'LIT_SPECULAR')
            this.fDefineSet(this.reflections, 'LIT_REFLECTIONS')
            this.fDefineSet(options.useClearCoat, 'LIT_CLEARCOAT')
            this.fDefineSet(options.fresnelModel > 0, 'LIT_SPECULAR_FRESNEL')
            this.fDefineSet(options.useSheen, 'LIT_SHEEN')
            this.fDefineSet(options.useIridescence, 'LIT_IRIDESCENCE')
        }
        this.fDefineSet((this.lighting && options.useSpecular) || this.reflections, 'LIT_SPECULAR_OR_REFLECTION')
        this.fDefineSet(this.needsSceneColor, 'LIT_SCENE_COLOR')
        this.fDefineSet(this.needsScreenSize, 'LIT_SCREEN_SIZE')
        this.fDefineSet(this.needsTransforms, 'LIT_TRANSFORMS')
        this.fDefineSet(this.needsNormal, 'LIT_NEEDS_NORMAL')
        this.fDefineSet(this.lighting, 'LIT_LIGHTING')
        this.fDefineSet(options.useMetalness, 'LIT_METALNESS')
        this.fDefineSet(options.enableGGXSpecular, 'LIT_GGX_SPECULAR')
        this.fDefineSet(options.useAnisotropy, 'LIT_ANISOTROPY')
        this.fDefineSet(options.useSpecularityFactor, 'LIT_SPECULARITY_FACTOR')
        this.fDefineSet(options.useCubeMapRotation, 'CUBEMAP_ROTATION')
        this.fDefineSet(options.occludeSpecularFloat, 'LIT_OCCLUDE_SPECULAR_FLOAT')
        this.fDefineSet(options.separateAmbient, 'LIT_SEPARATE_AMBIENT')
        this.fDefineSet(options.twoSidedLighting, 'LIT_TWO_SIDED_LIGHTING')
        this.fDefineSet(options.lightMapEnabled, 'LIT_LIGHTMAP')
        this.fDefineSet(options.dirLightMapEnabled, 'LIT_DIR_LIGHTMAP')
        this.fDefineSet(options.skyboxIntensity > 0, 'LIT_SKYBOX_INTENSITY')
        this.fDefineSet(options.clusteredLightingShadowsEnabled, 'LIT_CLUSTERED_SHADOWS')
        this.fDefineSet(options.clusteredLightingAreaLightsEnabled, 'LIT_CLUSTERED_AREA_LIGHTS')
        this.fDefineSet(hasTBN, 'LIT_TBN')
        this.fDefineSet(addAmbient, 'LIT_ADD_AMBIENT')
        this.fDefineSet(options.hasTangents, 'LIT_TANGENTS')
        this.fDefineSet(options.useNormals, 'LIT_USE_NORMALS')
        this.fDefineSet(options.useClearCoatNormals, 'LIT_USE_CLEARCOAT_NORMALS')
        this.fDefineSet(options.useRefraction, 'LIT_REFRACTION')
        this.fDefineSet(options.useDynamicRefraction, 'LIT_DYNAMIC_REFRACTION')
        this.fDefineSet(options.dispersion, 'LIT_DISPERSION')
        this.fDefineSet(options.useHeights, 'LIT_HEIGHTS')
        this.fDefineSet(options.opacityFadesSpecular, 'LIT_OPACITY_FADES_SPECULAR')
        this.fDefineSet(options.alphaToCoverage, 'LIT_ALPHA_TO_COVERAGE')
        this.fDefineSet(options.alphaTest, 'LIT_ALPHA_TEST')
        this.fDefineSet(options.useMsdf, 'LIT_MSDF')
        this.fDefineSet(options.ssao, 'LIT_SSAO')
        this.fDefineSet(options.useAo, 'LIT_AO')
        this.fDefineSet(options.occludeDirect, 'LIT_OCCLUDE_DIRECT')
        this.fDefineSet(options.msdfTextAttribute, 'LIT_MSDF_TEXT_ATTRIBUTE')
        this.fDefineSet(options.diffuseMapEnabled, 'LIT_DIFFUSE_MAP')
        this.fDefineSet(options.shadowCatcher, 'LIT_SHADOW_CATCHER')
        this.fDefineSet(true, 'LIT_FRESNEL_MODEL', fresnelNames[options.fresnelModel])
        this.fDefineSet(true, 'LIT_NONE_SLICE_MODE', spriteRenderModeNames[options.nineSlicedMode])
        this.fDefineSet(true, 'LIT_BLEND_TYPE', blendNames[options.blendType])
        this.fDefineSet(true, 'LIT_CUBEMAP_PROJECTION', cubemaProjectionNames[options.cubeMapProjection])
        this.fDefineSet(true, 'LIT_OCCLUDE_SPECULAR', specularOcclusionNames[options.occludeSpecular])
        this.fDefineSet(true, 'LIT_REFLECTION_SOURCE', reflectionSrcNames[options.reflectionSource])
        this.fDefineSet(true, 'LIT_AMBIENT_SOURCE', ambientSrcNames[options.ambientSource])
        this.fDefineSet(true, '{lightingUv}', lightingUv ?? '')
        this.fDefineSet(true, '{reflectionDecode}', ChunkUtils.decodeFunc(options.reflectionEncoding))
        this.fDefineSet(true, '{reflectionCubemapDecode}', ChunkUtils.decodeFunc(options.reflectionCubemapEncoding))
        this.fDefineSet(true, '{ambientDecode}', ChunkUtils.decodeFunc(options.ambientEncoding))
        this._setupLightingDefines(hasAreaLights, options.clusteredLightingEnabled)
    }
    prepareShadowPass() {
        const { options } = this
        const lightType = this.shaderPassInfo.lightType
        const shadowType = this.shaderPassInfo.shadowType
        const shadowInfo = shadowTypeInfo.get(shadowType)
        const usePerspectiveDepth =
            lightType === LIGHTTYPE_DIRECTIONAL || (!shadowInfo.vsm && lightType === LIGHTTYPE_SPOT)
        this.fDefineSet(usePerspectiveDepth, 'PERSPECTIVE_DEPTH')
        this.fDefineSet(true, 'LIGHT_TYPE', `${lightTypeNames[lightType]}`)
        this.fDefineSet(true, 'SHADOW_TYPE', `${shadowInfo.name}`)
        this.fDefineSet(options.alphaTest, 'LIT_ALPHA_TEST')
    }
    generateFragmentShader(frontendDecl, frontendCode, lightingUv) {
        const options = this.options
        this.includes.set('frontendDeclPS', frontendDecl ?? '')
        this.includes.set('frontendCodePS', frontendCode ?? '')
        if (options.pass === SHADER_PICK || options.pass === SHADER_PREPASS);
        else if (this.shadowPass) {
            this.prepareShadowPass()
        } else {
            this.prepareForwardPass(lightingUv)
        }
        this.fshader = `
                                                #include "litMainPS"
                                `
    }
    constructor(device, options, allowWGSL = true) {
        this.varyingsCode = ''
        this.vDefines = new Map()
        this.fDefines = new Map()
        this.includes = new Map()
        this.chunks = null
        this.device = device
        this.options = options
        const userChunks = options.shaderChunks
        this.shaderLanguage =
            device.isWebGPU && allowWGSL && (!userChunks || userChunks.useWGSL)
                ? SHADERLANGUAGE_WGSL
                : SHADERLANGUAGE_GLSL
        if (device.isWebGPU && this.shaderLanguage === SHADERLANGUAGE_GLSL) {
            if (!device.hasTranspilers);
        }
        this.attributes = {
            vertex_position: SEMANTIC_POSITION,
        }
        if (options.userAttributes) {
            for (const [semantic, name] of Object.entries(options.userAttributes)) {
                this.attributes[name] = semantic
            }
        }
        const engineChunks = ShaderChunks.get(device, this.shaderLanguage)
        this.chunks = new Map(engineChunks)
        if (userChunks) {
            const userChunkMap = this.shaderLanguage === SHADERLANGUAGE_GLSL ? userChunks.glsl : userChunks.wgsl
            userChunkMap.forEach((chunk, chunkName) => {
                for (const a in builtinAttributes) {
                    if (builtinAttributes.hasOwnProperty(a) && chunk.indexOf(a) >= 0) {
                        this.attributes[a] = builtinAttributes[a]
                    }
                }
                this.chunks.set(chunkName, chunk)
            })
        }
        this.shaderPassInfo = ShaderPass.get(this.device).getByIndex(options.pass)
        this.shadowPass = this.shaderPassInfo.isShadow
        this.lighting = options.lights.length > 0 || options.dirLightMapEnabled || options.clusteredLightingEnabled
        this.reflections = options.reflectionSource !== REFLECTIONSRC_NONE
        this.needsNormal =
            this.lighting ||
            this.reflections ||
            options.useSpecular ||
            options.ambientSH ||
            options.useHeights ||
            options.enableGGXSpecular ||
            (options.clusteredLightingEnabled && !this.shadowPass) ||
            options.useClearCoatNormals
        this.needsNormal = this.needsNormal && !this.shadowPass
        this.needsSceneColor = options.useDynamicRefraction
        this.needsScreenSize = options.useDynamicRefraction
        this.needsTransforms = options.useDynamicRefraction
        this.vshader = null
        this.fshader = null
    }
}

const LitOptionsUtils = {
    generateKey(options) {
        return `lit${Object.keys(options)
            .sort()
            .map((key) => {
                if (key === 'shaderChunks') {
                    return options.shaderChunks?.key ?? ''
                } else if (key === 'lights') {
                    return LitOptionsUtils.generateLightsKey(options)
                }
                return key + options[key]
            })
            .join('\n')}`
    },
    generateLightsKey(options) {
        return `lights:${options.lights
            .map((light) => {
                return !options.clusteredLightingEnabled || light._type === LIGHTTYPE_DIRECTIONAL ? `${light.key},` : ''
            })
            .join('')}`
    },
}

class StandardMaterialOptions {
    get pass() {
        return this.litOptions.pass
    }
    constructor() {
        this.defines = new Map()
        this.forceUv1 = false
        this.specularTint = false
        this.metalnessTint = false
        this.glossTint = false
        this.emissiveEncoding = 'linear'
        this.lightMapEncoding = 'linear'
        this.vertexColorGamma = false
        this.packedNormal = false
        this.normalDetailPackedNormal = false
        this.clearCoatPackedNormal = false
        this.glossInvert = false
        this.sheenGlossInvert = false
        this.clearCoatGlossInvert = false
        this.useAO = false
        this.litOptions = new LitShaderOptions()
    }
}

const _matTex2D = []
const buildPropertiesList = (options) => {
    return Object.keys(options)
        .filter((key) => key !== 'litOptions')
        .sort()
}
class ShaderGeneratorStandard extends ShaderGenerator {
    generateKey(options) {
        let props
        if (options === this.optionsContextMin) {
            if (!this.propsMin) this.propsMin = buildPropertiesList(options)
            props = this.propsMin
        } else if (options === this.optionsContext) {
            if (!this.props) this.props = buildPropertiesList(options)
            props = this.props
        } else {
            props = buildPropertiesList(options)
        }
        const definesHash = ShaderGenerator.definesHash(options.defines)
        const key = `standard:\n${definesHash}\n${props.map((prop) => prop + options[prop]).join('\n')}${LitOptionsUtils.generateKey(options.litOptions)}`
        return key
    }
    _getUvSourceExpression(transformPropName, uVPropName, options) {
        const transformId = options[transformPropName]
        const uvChannel = options[uVPropName]
        const isMainPass = options.litOptions.pass === SHADER_FORWARD
        let expression
        if (isMainPass && options.litOptions.nineSlicedMode === SPRITE_RENDERMODE_SLICED) {
            expression = 'nineSlicedUv'
        } else if (isMainPass && options.litOptions.nineSlicedMode === SPRITE_RENDERMODE_TILED) {
            expression = 'nineSlicedUv'
        } else {
            if (transformId === 0) {
                expression = `vUv${uvChannel}`
            } else {
                expression = `vUV${uvChannel}_${transformId}`
            }
            if (options.heightMap && transformPropName !== 'heightMapTransform') {
                expression += ' + dUvOffset'
            }
        }
        return expression
    }
    _validateMapChunk(code, propName, chunkName, chunks) {}
    _addMapDefines(fDefines, propName, chunkName, options, chunks, mapping, encoding = null) {
        const mapPropName = `${propName}Map`
        const propNameCaps = propName.toUpperCase()
        const uVPropName = `${mapPropName}Uv`
        const identifierPropName = `${mapPropName}Identifier`
        const transformPropName = `${mapPropName}Transform`
        const channelPropName = `${mapPropName}Channel`
        const vertexColorChannelPropName = `${propName}VertexColorChannel`
        const tintPropName = `${propName}Tint`
        const vertexColorPropName = `${propName}VertexColor`
        const detailModePropName = `${propName}Mode`
        const invertName = `${propName}Invert`
        const tintOption = options[tintPropName]
        const vertexColorOption = options[vertexColorPropName]
        const textureOption = options[mapPropName]
        const textureIdentifier = options[identifierPropName]
        const detailModeOption = options[detailModePropName]
        const chunkCode = chunks.get(chunkName)
        if (textureOption) {
            fDefines.set(`STD_${propNameCaps}_TEXTURE`, '')
            const uv = this._getUvSourceExpression(transformPropName, uVPropName, options)
            fDefines.set(`{STD_${propNameCaps}_TEXTURE_UV}`, uv)
            fDefines.set(`{STD_${propNameCaps}_TEXTURE_CHANNEL}`, options[channelPropName])
            const textureId = `{STD_${propNameCaps}_TEXTURE_NAME}`
            if (chunkCode.includes(textureId)) {
                let samplerName = `texture_${mapPropName}`
                const alias = mapping[textureIdentifier]
                if (alias) {
                    samplerName = alias
                } else {
                    mapping[textureIdentifier] = samplerName
                    fDefines.set(`STD_${propNameCaps}_TEXTURE_ALLOCATE`, '')
                }
                fDefines.set(textureId, samplerName)
            }
            if (encoding) {
                const textureDecode =
                    options[channelPropName] === 'aaa' ? 'passThrough' : ChunkUtils.decodeFunc(encoding)
                fDefines.set(`{STD_${propNameCaps}_TEXTURE_DECODE}`, textureDecode)
            }
        }
        if (vertexColorOption) {
            fDefines.set(`STD_${propNameCaps}_VERTEX`, '')
            fDefines.set(`{STD_${propNameCaps}_VERTEX_CHANNEL}`, options[vertexColorChannelPropName])
        }
        if (detailModeOption) {
            fDefines.set(`{STD_${propNameCaps}_DETAILMODE}`, detailModeOption)
        }
        if (tintOption) {
            fDefines.set(`STD_${propNameCaps}_CONSTANT`, '')
        }
        if (!!options[invertName]) {
            fDefines.set(`STD_${propNameCaps}_INVERT`, '')
        }
    }
    _correctChannel(p, chan, _matTex2D) {
        if (_matTex2D[p] > 0) {
            if (_matTex2D[p] < chan.length) {
                return chan.substring(0, _matTex2D[p])
            } else if (_matTex2D[p] > chan.length) {
                let str = chan
                const chr = str.charAt(str.length - 1)
                const addLen = _matTex2D[p] - str.length
                for (let i = 0; i < addLen; i++) str += chr
                return str
            }
            return chan
        }
    }
    createVertexShader(litShader, options) {
        const useUv = []
        const useUnmodifiedUv = []
        const mapTransforms = []
        const maxUvSets = 2
        for (const p in _matTex2D) {
            const mapName = `${p}Map`
            if (options[`${p}VertexColor`]) {
                const colorChannelName = `${p}VertexColorChannel`
                options[colorChannelName] = this._correctChannel(p, options[colorChannelName], _matTex2D)
            }
            if (options[mapName]) {
                const channelName = `${mapName}Channel`
                const transformName = `${mapName}Transform`
                const uvName = `${mapName}Uv`
                options[uvName] = Math.min(options[uvName], maxUvSets - 1)
                options[channelName] = this._correctChannel(p, options[channelName], _matTex2D)
                const uvSet = options[uvName]
                useUv[uvSet] = true
                useUnmodifiedUv[uvSet] = useUnmodifiedUv[uvSet] || (options[mapName] && !options[transformName])
                if (options[transformName]) {
                    mapTransforms.push({
                        name: p,
                        id: options[transformName],
                        uv: options[uvName],
                    })
                }
            }
        }
        if (options.forceUv1) {
            useUv[1] = true
            useUnmodifiedUv[1] = useUnmodifiedUv[1] !== undefined ? useUnmodifiedUv[1] : true
        }
        litShader.generateVertexShader(useUv, useUnmodifiedUv, mapTransforms)
    }
    prepareFragmentDefines(options, fDefines, shaderPassInfo) {
        const fDefineSet = (condition, name, value = '') => {
            if (condition) {
                fDefines.set(name, value)
            }
        }
        fDefineSet(options.lightMap, 'STD_LIGHTMAP', '')
        fDefineSet(options.lightVertexColor, 'STD_LIGHT_VERTEX_COLOR', '')
        fDefineSet(options.dirLightMap && options.litOptions.useSpecular, 'STD_LIGHTMAP_DIR', '')
        fDefineSet(options.heightMap, 'STD_HEIGHT_MAP', '')
        fDefineSet(options.useSpecularColor, 'STD_SPECULAR_COLOR', '')
        fDefineSet(options.aoMap || options.aoVertexColor || options.useAO, 'STD_AO', '')
        fDefineSet(
            true,
            'STD_OPACITY_DITHER',
            ditherNames[
                shaderPassInfo.isForward ? options.litOptions.opacityDither : options.litOptions.opacityShadowDither
            ],
        )
    }
    createShaderDefinition(device, options) {
        const shaderPassInfo = ShaderPass.get(device).getByIndex(options.litOptions.pass)
        const isForwardPass = shaderPassInfo.isForward
        const litShader = new LitShader(device, options.litOptions)
        this.createVertexShader(litShader, options)
        const textureMapping = {}
        options.litOptions.fresnelModel =
            options.litOptions.fresnelModel === 0 ? FRESNEL_SCHLICK : options.litOptions.fresnelModel
        const fDefines = litShader.fDefines
        this.prepareFragmentDefines(options, fDefines, shaderPassInfo)
        let lightingUv = ''
        if (isForwardPass) {
            if (options.heightMap) {
                this._addMapDefines(fDefines, 'height', 'parallaxPS', options, litShader.chunks, textureMapping)
            }
            if (
                options.litOptions.blendType !== BLEND_NONE ||
                options.litOptions.alphaTest ||
                options.litOptions.alphaToCoverage ||
                options.litOptions.opacityDither !== DITHER_NONE
            ) {
                this._addMapDefines(fDefines, 'opacity', 'opacityPS', options, litShader.chunks, textureMapping)
            }
            if (litShader.needsNormal) {
                if (options.normalMap || options.clearCoatNormalMap) {
                    if (!options.litOptions.hasTangents) {
                        const baseName = options.normalMap ? 'normalMap' : 'clearCoatNormalMap'
                        lightingUv = this._getUvSourceExpression(`${baseName}Transform`, `${baseName}Uv`, options)
                    }
                }
                this._addMapDefines(
                    fDefines,
                    'normalDetail',
                    'normalMapPS',
                    options,
                    litShader.chunks,
                    textureMapping,
                    options.normalDetailPackedNormal ? 'xy' : 'xyz',
                )
                this._addMapDefines(
                    fDefines,
                    'normal',
                    'normalMapPS',
                    options,
                    litShader.chunks,
                    textureMapping,
                    options.packedNormal ? 'xy' : 'xyz',
                )
            }
            if (options.diffuseDetail) {
                this._addMapDefines(
                    fDefines,
                    'diffuseDetail',
                    'diffusePS',
                    options,
                    litShader.chunks,
                    textureMapping,
                    options.diffuseDetailEncoding,
                )
            }
            this._addMapDefines(
                fDefines,
                'diffuse',
                'diffusePS',
                options,
                litShader.chunks,
                textureMapping,
                options.diffuseEncoding,
            )
            if (options.litOptions.useRefraction) {
                this._addMapDefines(fDefines, 'refraction', 'transmissionPS', options, litShader.chunks, textureMapping)
                this._addMapDefines(fDefines, 'thickness', 'thicknessPS', options, litShader.chunks, textureMapping)
            }
            if (options.litOptions.useIridescence) {
                this._addMapDefines(fDefines, 'iridescence', 'iridescencePS', options, litShader.chunks, textureMapping)
                this._addMapDefines(
                    fDefines,
                    'iridescenceThickness',
                    'iridescenceThicknessPS',
                    options,
                    litShader.chunks,
                    textureMapping,
                )
            }
            if ((litShader.lighting && options.litOptions.useSpecular) || litShader.reflections) {
                if (options.litOptions.useSheen) {
                    this._addMapDefines(
                        fDefines,
                        'sheen',
                        'sheenPS',
                        options,
                        litShader.chunks,
                        textureMapping,
                        options.sheenEncoding,
                    )
                    this._addMapDefines(
                        fDefines,
                        'sheenGloss',
                        'sheenGlossPS',
                        options,
                        litShader.chunks,
                        textureMapping,
                    )
                }
                if (options.litOptions.useMetalness) {
                    this._addMapDefines(fDefines, 'metalness', 'metalnessPS', options, litShader.chunks, textureMapping)
                    this._addMapDefines(fDefines, 'ior', 'iorPS', options, litShader.chunks, textureMapping)
                }
                if (options.litOptions.useSpecularityFactor) {
                    this._addMapDefines(
                        fDefines,
                        'specularityFactor',
                        'specularityFactorPS',
                        options,
                        litShader.chunks,
                        textureMapping,
                    )
                }
                if (options.useSpecularColor) {
                    this._addMapDefines(
                        fDefines,
                        'specular',
                        'specularPS',
                        options,
                        litShader.chunks,
                        textureMapping,
                        options.specularEncoding,
                    )
                }
                this._addMapDefines(fDefines, 'gloss', 'glossPS', options, litShader.chunks, textureMapping)
            }
            if (options.aoDetail) {
                this._addMapDefines(fDefines, 'aoDetail', 'aoPS', options, litShader.chunks, textureMapping)
            }
            if (options.aoMap || options.aoVertexColor || options.useAO) {
                this._addMapDefines(fDefines, 'ao', 'aoPS', options, litShader.chunks, textureMapping)
            }
            this._addMapDefines(
                fDefines,
                'emissive',
                'emissivePS',
                options,
                litShader.chunks,
                textureMapping,
                options.emissiveEncoding,
            )
            if (options.litOptions.useClearCoat) {
                this._addMapDefines(fDefines, 'clearCoat', 'clearCoatPS', options, litShader.chunks, textureMapping)
                this._addMapDefines(
                    fDefines,
                    'clearCoatGloss',
                    'clearCoatGlossPS',
                    options,
                    litShader.chunks,
                    textureMapping,
                )
                this._addMapDefines(
                    fDefines,
                    'clearCoatNormal',
                    'clearCoatNormalPS',
                    options,
                    litShader.chunks,
                    textureMapping,
                    options.clearCoatPackedNormal ? 'xy' : 'xyz',
                )
            }
            if (options.litOptions.enableGGXSpecular) {
                this._addMapDefines(fDefines, 'anisotropy', 'anisotropyPS', options, litShader.chunks, textureMapping)
            }
            if (options.lightMap || options.lightVertexColor) {
                this._addMapDefines(
                    fDefines,
                    'light',
                    'lightmapPS',
                    options,
                    litShader.chunks,
                    textureMapping,
                    options.lightMapEncoding,
                )
            }
        } else {
            const opacityShadowDither = options.litOptions.opacityShadowDither
            if (options.litOptions.alphaTest || opacityShadowDither) {
                this._addMapDefines(fDefines, 'opacity', 'opacityPS', options, litShader.chunks, textureMapping)
            }
        }
        litShader.generateFragmentShader(
            litShader.chunks.get('stdDeclarationPS'),
            litShader.chunks.get('stdFrontEndPS'),
            lightingUv,
        )
        const includes = MapUtils.merge(litShader.chunks, litShader.includes)
        const vDefines = litShader.vDefines
        options.defines.forEach((value, key) => vDefines.set(key, value))
        options.defines.forEach((value, key) => fDefines.set(key, value))
        const definition = ShaderDefinitionUtils.createDefinition(device, {
            name: 'StandardShader',
            attributes: litShader.attributes,
            shaderLanguage: litShader.shaderLanguage,
            vertexCode: litShader.vshader,
            fragmentCode: litShader.fshader,
            vertexIncludes: includes,
            fragmentIncludes: includes,
            fragmentDefines: fDefines,
            vertexDefines: vDefines,
        })
        if (litShader.shaderPassInfo.isForward) {
            definition.tag = SHADERTAG_MATERIAL
        }
        return definition
    }
    constructor(...args) {
        ;(super(...args),
            (this.optionsContext = new StandardMaterialOptions()),
            (this.optionsContextMin = new StandardMaterialOptions()))
    }
}
const standard = new ShaderGeneratorStandard()

const arraysEqual = (a, b) => {
    if (a.length !== b.length) {
        return false
    }
    for (let i = 0; i < a.length; ++i) {
        if (a[i] !== b[i]) {
            return false
        }
    }
    return true
}
const notWhite = (color) => {
    return color.r !== 1 || color.g !== 1 || color.b !== 1
}
const notBlack = (color) => {
    return color.r !== 0 || color.g !== 0 || color.b !== 0
}
class StandardMaterialOptionsBuilder {
    updateMinRef(options, scene, stdMat, objDefs, pass, sortedLights) {
        this._updateSharedOptions(options, scene, stdMat, objDefs, pass)
        this._updateMinOptions(options, stdMat, pass)
        this._updateUVOptions(options, stdMat, objDefs, true)
    }
    updateRef(options, scene, cameraShaderParams, stdMat, objDefs, pass, sortedLights) {
        this._updateSharedOptions(options, scene, stdMat, objDefs, pass)
        this._updateEnvOptions(options, stdMat, scene, cameraShaderParams)
        this._updateMaterialOptions(options, stdMat, scene)
        options.litOptions.hasTangents = objDefs && (objDefs & SHADERDEF_TANGENTS) !== 0
        this._updateLightOptions(options, scene, stdMat, objDefs, sortedLights)
        this._updateUVOptions(options, stdMat, objDefs, false, cameraShaderParams)
    }
    _updateSharedOptions(options, scene, stdMat, objDefs, pass) {
        options.forceUv1 = stdMat.forceUv1
        if (stdMat.userAttributes) {
            options.litOptions.userAttributes = Object.fromEntries(stdMat.userAttributes.entries())
        }
        options.litOptions.shaderChunks = stdMat.shaderChunks
        options.litOptions.pass = pass
        options.litOptions.alphaTest = stdMat.alphaTest > 0
        options.litOptions.blendType = stdMat.blendType
        options.litOptions.screenSpace = objDefs && (objDefs & SHADERDEF_SCREENSPACE) !== 0
        options.litOptions.skin = objDefs && (objDefs & SHADERDEF_SKIN) !== 0
        options.litOptions.batch = objDefs && (objDefs & SHADERDEF_BATCH) !== 0
        options.litOptions.useInstancing = objDefs && (objDefs & SHADERDEF_INSTANCING) !== 0
        options.litOptions.useMorphPosition = objDefs && (objDefs & SHADERDEF_MORPH_POSITION) !== 0
        options.litOptions.useMorphNormal = objDefs && (objDefs & SHADERDEF_MORPH_NORMAL) !== 0
        options.litOptions.useMorphTextureBasedInt = objDefs && (objDefs & SHADERDEF_MORPH_TEXTURE_BASED_INT) !== 0
        options.litOptions.nineSlicedMode = stdMat.nineSlicedMode || 0
        if (scene.clusteredLightingEnabled && stdMat.useLighting) {
            options.litOptions.clusteredLightingEnabled = true
            options.litOptions.clusteredLightingCookiesEnabled = scene.lighting.cookiesEnabled
            options.litOptions.clusteredLightingShadowsEnabled = scene.lighting.shadowsEnabled
            options.litOptions.clusteredLightingShadowType = scene.lighting.shadowType
            options.litOptions.clusteredLightingAreaLightsEnabled = scene.lighting.areaLightsEnabled
        } else {
            options.litOptions.clusteredLightingEnabled = false
            options.litOptions.clusteredLightingCookiesEnabled = false
            options.litOptions.clusteredLightingShadowsEnabled = false
            options.litOptions.clusteredLightingAreaLightsEnabled = false
        }
    }
    _updateUVOptions(options, stdMat, objDefs, minimalOptions, cameraShaderParams) {
        let hasUv0 = false
        let hasUv1 = false
        let hasVcolor = false
        if (objDefs) {
            hasUv0 = (objDefs & SHADERDEF_UV0) !== 0
            hasUv1 = (objDefs & SHADERDEF_UV1) !== 0
            hasVcolor = (objDefs & SHADERDEF_VCOLOR) !== 0
        }
        options.litOptions.vertexColors = false
        this._mapXForms = []
        const uniqueTextureMap = {}
        for (const p in _matTex2D) {
            this._updateTexOptions(options, stdMat, p, hasUv0, hasUv1, hasVcolor, minimalOptions, uniqueTextureMap)
        }
        this._mapXForms = null
        options.litOptions.ssao = cameraShaderParams?.ssaoEnabled
        options.useAO = options.litOptions.ssao
        options.litOptions.lightMapEnabled = options.lightMap
        options.litOptions.dirLightMapEnabled = options.dirLightMap
        options.litOptions.useHeights = options.heightMap
        options.litOptions.useNormals = options.normalMap
        options.litOptions.useClearCoatNormals = options.clearCoatNormalMap
        options.litOptions.useAo = options.aoMap || options.aoVertexColor || options.litOptions.ssao
        options.litOptions.diffuseMapEnabled = options.diffuseMap
    }
    _updateTexOptions(options, stdMat, p, hasUv0, hasUv1, hasVcolor, minimalOptions, uniqueTextureMap) {
        const isOpacity = p === 'opacity'
        if (!minimalOptions || isOpacity) {
            const mname = `${p}Map`
            const vname = `${p}VertexColor`
            const vcname = `${p}VertexColorChannel`
            const cname = `${mname}Channel`
            const tname = `${mname}Transform`
            const uname = `${mname}Uv`
            const iname = `${mname}Identifier`
            if (p !== 'light') {
                options[mname] = false
                options[iname] = undefined
                options[cname] = ''
                options[tname] = 0
                options[uname] = 0
            }
            options[vname] = false
            options[vcname] = ''
            if (
                isOpacity &&
                stdMat.blendType === BLEND_NONE &&
                stdMat.alphaTest === 0.0 &&
                !stdMat.alphaToCoverage &&
                stdMat.opacityDither === DITHER_NONE
            ) {
                return
            }
            if (p !== 'height' && stdMat[vname]) {
                if (hasVcolor) {
                    options[vname] = stdMat[vname]
                    options[vcname] = stdMat[vcname]
                    options.litOptions.vertexColors = true
                }
            }
            if (stdMat[mname]) {
                let allow = true
                if (stdMat[uname] === 0 && !hasUv0) allow = false
                if (stdMat[uname] === 1 && !hasUv1) allow = false
                if (allow) {
                    const mapId = stdMat[mname].id
                    let identifier = uniqueTextureMap[mapId]
                    if (identifier === undefined) {
                        uniqueTextureMap[mapId] = p
                        identifier = p
                    }
                    options[mname] = !!stdMat[mname]
                    options[iname] = identifier
                    options[tname] = this._getMapTransformID(stdMat.getUniform(tname), stdMat[uname])
                    options[cname] = stdMat[cname]
                    options[uname] = stdMat[uname]
                }
            }
        }
    }
    _updateMinOptions(options, stdMat, pass) {
        const isPrepass = pass === SHADER_PREPASS
        options.litOptions.opacityShadowDither = isPrepass ? stdMat.opacityDither : stdMat.opacityShadowDither
        options.litOptions.linearDepth = isPrepass
        options.litOptions.lights = []
    }
    _updateMaterialOptions(options, stdMat, scene) {
        const useSpecular = !!(
            stdMat.useMetalness ||
            stdMat.specularMap ||
            stdMat.sphereMap ||
            stdMat.cubeMap ||
            notBlack(stdMat.specular) ||
            (stdMat.specularityFactor > 0 && stdMat.useMetalness) ||
            stdMat.enableGGXSpecular ||
            stdMat.clearCoat > 0
        )
        const useSpecularColor = !stdMat.useMetalness || stdMat.useMetalnessSpecularColor
        const specularTint =
            useSpecular &&
            (stdMat.specularTint || (!stdMat.specularMap && !stdMat.specularVertexColor)) &&
            notWhite(stdMat.specular)
        const specularityFactorTint =
            useSpecular &&
            stdMat.useMetalnessSpecularColor &&
            (stdMat.specularityFactorTint || (stdMat.specularityFactor < 1 && !stdMat.specularityFactorMap))
        const isPackedNormalMap = (texture) =>
            texture ? texture.format === PIXELFORMAT_DXT5 || texture.type === TEXTURETYPE_SWIZZLEGGGR : false
        const equalish = (a, b) => Math.abs(a - b) < 1e-4
        options.specularTint = specularTint
        options.specularityFactorTint = specularityFactorTint
        options.metalnessTint = stdMat.useMetalness && stdMat.metalness < 1
        options.glossTint = true
        options.diffuseEncoding = stdMat.diffuseMap?.encoding
        options.diffuseDetailEncoding = stdMat.diffuseDetailMap?.encoding
        options.emissiveEncoding = stdMat.emissiveMap?.encoding
        options.lightMapEncoding = stdMat.lightMap?.encoding
        options.packedNormal = isPackedNormalMap(stdMat.normalMap)
        options.refractionTint = !equalish(stdMat.refraction, 1.0)
        options.refractionIndexTint = !equalish(stdMat.refractionIndex, 1.0 / 1.5)
        options.thicknessTint = stdMat.useDynamicRefraction && stdMat.thickness !== 1.0
        options.specularEncoding = stdMat.specularMap?.encoding
        options.sheenEncoding = stdMat.sheenMap?.encoding
        options.aoMapUv = stdMat.aoUvSet
        options.aoDetail = !!stdMat.aoDetailMap
        options.diffuseDetail = !!stdMat.diffuseDetailMap
        options.normalDetail = !!stdMat.normalMap
        options.normalDetailPackedNormal = isPackedNormalMap(stdMat.normalDetailMap)
        options.diffuseDetailMode = stdMat.diffuseDetailMode
        options.aoDetailMode = stdMat.aoDetailMode
        options.clearCoatGloss = !!stdMat.clearCoatGloss
        options.clearCoatPackedNormal = isPackedNormalMap(stdMat.clearCoatNormalMap)
        options.iorTint = !equalish(stdMat.refractionIndex, 1.0 / 1.5)
        if (scene.forcePassThroughSpecular) {
            options.specularEncoding = 'linear'
            options.sheenEncoding = 'linear'
        }
        options.iridescenceTint = stdMat.iridescence !== 1.0
        options.glossInvert = stdMat.glossInvert
        options.sheenGlossInvert = stdMat.sheenGlossInvert
        options.clearCoatGlossInvert = stdMat.clearCoatGlossInvert
        options.useSpecularColor = useSpecularColor
        options.litOptions.separateAmbient = false
        options.litOptions.pixelSnap = stdMat.pixelSnap
        options.litOptions.ambientSH = !!stdMat.ambientSH
        options.litOptions.twoSidedLighting = stdMat.twoSidedLighting
        options.litOptions.occludeSpecular = stdMat.occludeSpecular
        options.litOptions.occludeSpecularFloat = stdMat.occludeSpecularIntensity !== 1.0
        options.litOptions.useMsdf = !!stdMat.msdfMap
        options.litOptions.msdfTextAttribute = !!stdMat.msdfTextAttribute
        options.litOptions.alphaToCoverage = stdMat.alphaToCoverage
        options.litOptions.opacityFadesSpecular = stdMat.opacityFadesSpecular
        options.litOptions.opacityDither = stdMat.opacityDither
        options.litOptions.cubeMapProjection = stdMat.cubeMapProjection
        options.litOptions.occludeDirect = stdMat.occludeDirect
        options.litOptions.useSpecular = useSpecular
        options.litOptions.useSpecularityFactor =
            (specularityFactorTint || !!stdMat.specularityFactorMap) && stdMat.useMetalnessSpecularColor
        options.litOptions.enableGGXSpecular = stdMat.enableGGXSpecular
        options.litOptions.useAnisotropy =
            stdMat.enableGGXSpecular && (stdMat.anisotropyIntensity > 0 || !!stdMat.anisotropyMap)
        options.litOptions.fresnelModel = stdMat.fresnelModel
        options.litOptions.useRefraction =
            (stdMat.refraction || !!stdMat.refractionMap) &&
            (stdMat.useDynamicRefraction || options.litOptions.reflectionSource !== REFLECTIONSRC_NONE)
        options.litOptions.useClearCoat = !!stdMat.clearCoat
        options.litOptions.useSheen = stdMat.useSheen
        options.litOptions.useIridescence = stdMat.useIridescence && stdMat.iridescence !== 0.0
        options.litOptions.useMetalness = stdMat.useMetalness
        options.litOptions.useDynamicRefraction = stdMat.useDynamicRefraction
        options.litOptions.dispersion = stdMat.dispersion > 0
        options.litOptions.shadowCatcher = stdMat.shadowCatcher
        options.litOptions.useVertexColorGamma = stdMat.vertexColorGamma
    }
    _updateEnvOptions(options, stdMat, scene, cameraShaderParams) {
        options.litOptions.fog = stdMat.useFog ? cameraShaderParams.fog : FOG_NONE
        options.litOptions.gamma = cameraShaderParams.shaderOutputGamma
        options.litOptions.toneMap = stdMat.useTonemap ? cameraShaderParams.toneMapping : TONEMAP_NONE
        let usingSceneEnv = false
        if (stdMat.envAtlas && stdMat.cubeMap) {
            options.litOptions.reflectionSource = REFLECTIONSRC_ENVATLASHQ
            options.litOptions.reflectionEncoding = stdMat.envAtlas.encoding
            options.litOptions.reflectionCubemapEncoding = stdMat.cubeMap.encoding
        } else if (stdMat.envAtlas) {
            options.litOptions.reflectionSource = REFLECTIONSRC_ENVATLAS
            options.litOptions.reflectionEncoding = stdMat.envAtlas.encoding
        } else if (stdMat.cubeMap) {
            options.litOptions.reflectionSource = REFLECTIONSRC_CUBEMAP
            options.litOptions.reflectionEncoding = stdMat.cubeMap.encoding
        } else if (stdMat.sphereMap) {
            options.litOptions.reflectionSource = REFLECTIONSRC_SPHEREMAP
            options.litOptions.reflectionEncoding = stdMat.sphereMap.encoding
        } else if (stdMat.useSkybox && scene.envAtlas && scene.skybox) {
            options.litOptions.reflectionSource = REFLECTIONSRC_ENVATLASHQ
            options.litOptions.reflectionEncoding = scene.envAtlas.encoding
            options.litOptions.reflectionCubemapEncoding = scene.skybox.encoding
            usingSceneEnv = true
        } else if (stdMat.useSkybox && scene.envAtlas) {
            options.litOptions.reflectionSource = REFLECTIONSRC_ENVATLAS
            options.litOptions.reflectionEncoding = scene.envAtlas.encoding
            usingSceneEnv = true
        } else if (stdMat.useSkybox && scene.skybox) {
            options.litOptions.reflectionSource = REFLECTIONSRC_CUBEMAP
            options.litOptions.reflectionEncoding = scene.skybox.encoding
            usingSceneEnv = true
        } else {
            options.litOptions.reflectionSource = REFLECTIONSRC_NONE
            options.litOptions.reflectionEncoding = null
        }
        if (stdMat.ambientSH) {
            options.litOptions.ambientSource = AMBIENTSRC_AMBIENTSH
            options.litOptions.ambientEncoding = null
        } else {
            const envAtlas = stdMat.envAtlas || (stdMat.useSkybox && scene.envAtlas ? scene.envAtlas : null)
            if (envAtlas && !stdMat.sphereMap) {
                options.litOptions.ambientSource = AMBIENTSRC_ENVALATLAS
                options.litOptions.ambientEncoding = envAtlas.encoding
            } else {
                options.litOptions.ambientSource = AMBIENTSRC_CONSTANT
                options.litOptions.ambientEncoding = null
            }
        }
        options.litOptions.skyboxIntensity = usingSceneEnv
        options.litOptions.useCubeMapRotation = usingSceneEnv && scene._skyboxRotationShaderInclude
    }
    _updateLightOptions(options, scene, stdMat, objDefs, sortedLights) {
        options.lightMap = false
        options.lightMapChannel = ''
        options.lightMapUv = 0
        options.lightMapTransform = 0
        options.litOptions.lightMapWithoutAmbient = false
        options.dirLightMap = false
        if (objDefs) {
            options.litOptions.noShadow = (objDefs & SHADERDEF_NOSHADOW) !== 0
            if ((objDefs & SHADERDEF_LM) !== 0) {
                options.lightMapEncoding = scene.lightmapPixelFormat === PIXELFORMAT_RGBA8 ? 'rgbm' : 'linear'
                options.lightMap = true
                options.lightMapChannel = 'rgb'
                options.lightMapUv = 1
                options.lightMapTransform = 0
                options.litOptions.lightMapWithoutAmbient = !stdMat.lightMap
                if ((objDefs & SHADERDEF_DIRLM) !== 0) {
                    options.dirLightMap = true
                }
                if ((objDefs & SHADERDEF_LMAMBIENT) !== 0) {
                    options.litOptions.lightMapWithoutAmbient = false
                }
            }
        }
        if (stdMat.useLighting) {
            const lightsFiltered = []
            const mask = objDefs ? objDefs >> 16 : MASK_AFFECT_DYNAMIC
            options.litOptions.lightMaskDynamic = !!(mask & MASK_AFFECT_DYNAMIC)
            if (sortedLights) {
                LitMaterialOptionsBuilder.collectLights(
                    LIGHTTYPE_DIRECTIONAL,
                    sortedLights[LIGHTTYPE_DIRECTIONAL],
                    lightsFiltered,
                    mask,
                )
                if (!scene.clusteredLightingEnabled) {
                    LitMaterialOptionsBuilder.collectLights(
                        LIGHTTYPE_OMNI,
                        sortedLights[LIGHTTYPE_OMNI],
                        lightsFiltered,
                        mask,
                    )
                    LitMaterialOptionsBuilder.collectLights(
                        LIGHTTYPE_SPOT,
                        sortedLights[LIGHTTYPE_SPOT],
                        lightsFiltered,
                        mask,
                    )
                }
            }
            options.litOptions.lights = lightsFiltered
        } else {
            options.litOptions.lights = []
        }
        if (options.litOptions.lights.length === 0 && !scene.clusteredLightingEnabled) {
            options.litOptions.noShadow = true
        }
    }
    _getMapTransformID(xform, uv) {
        if (!xform) return 0
        let xforms = this._mapXForms[uv]
        if (!xforms) {
            xforms = []
            this._mapXForms[uv] = xforms
        }
        for (let i = 0; i < xforms.length; i++) {
            if (arraysEqual(xforms[i][0].value, xform[0].value) && arraysEqual(xforms[i][1].value, xform[1].value)) {
                return i + 1
            }
        }
        return xforms.push(xform)
    }
    constructor() {
        this._mapXForms = null
    }
}

function _textureParameter(name, channel = true, vertexColor = true) {
    const result = {}
    result[`${name}Map`] = 'texture'
    result[`${name}MapTiling`] = 'vec2'
    result[`${name}MapOffset`] = 'vec2'
    result[`${name}MapRotation`] = 'number'
    result[`${name}MapUv`] = 'number'
    if (channel) {
        result[`${name}MapChannel`] = 'string'
        if (vertexColor) {
            result[`${name}VertexColor`] = 'boolean'
            result[`${name}VertexColorChannel`] = 'string'
        }
    }
    return result
}
const standardMaterialParameterTypes = {
    name: 'string',
    chunks: 'chunks',
    mappingFormat: 'string',
    _engine: 'boolean',
    ambient: 'rgb',
    ..._textureParameter('ao'),
    ..._textureParameter('aoDetail', true, false),
    aoDetailMode: 'string',
    aoIntensity: 'number',
    diffuse: 'rgb',
    ..._textureParameter('diffuse'),
    ..._textureParameter('diffuseDetail', true, false),
    diffuseDetailMode: 'string',
    vertexColorGamma: 'boolean',
    specular: 'rgb',
    specularTint: 'boolean',
    ..._textureParameter('specular'),
    occludeSpecular: 'enum:occludeSpecular',
    specularityFactor: 'number',
    specularityFactorTint: 'boolean',
    ..._textureParameter('specularityFactor'),
    useMetalness: 'boolean',
    metalness: 'number',
    enableGGXSpecular: 'boolean',
    metalnessTint: 'boolean',
    ..._textureParameter('metalness'),
    useMetalnessSpecularColor: 'boolean',
    anisotropyIntensity: 'number',
    anisotropyRotation: 'number',
    ..._textureParameter('anisotropy'),
    shininess: 'number',
    gloss: 'number',
    glossInvert: 'boolean',
    ..._textureParameter('gloss'),
    clearCoat: 'number',
    ..._textureParameter('clearCoat'),
    clearCoatGloss: 'number',
    clearCoatGlossInvert: 'boolean',
    ..._textureParameter('clearCoatGloss'),
    clearCoatBumpiness: 'number',
    ..._textureParameter('clearCoatNormal', false),
    useSheen: 'boolean',
    sheen: 'rgb',
    ..._textureParameter('sheen'),
    sheenGloss: 'number',
    sheenGlossInvert: 'boolean',
    ..._textureParameter('sheenGloss'),
    fresnelModel: 'number',
    emissive: 'rgb',
    ..._textureParameter('emissive'),
    emissiveIntensity: 'number',
    ..._textureParameter('normal', false),
    bumpiness: 'number',
    ..._textureParameter('normalDetail', false),
    normalDetailMapBumpiness: 'number',
    ..._textureParameter('height', true, false),
    heightMapFactor: 'number',
    alphaToCoverage: 'boolean',
    alphaTest: 'number',
    alphaFade: 'number',
    opacity: 'number',
    ..._textureParameter('opacity'),
    opacityFadesSpecular: 'boolean',
    opacityDither: 'string',
    opacityShadowDither: 'string',
    reflectivity: 'number',
    refraction: 'number',
    refractionTint: 'boolean',
    ..._textureParameter('refraction'),
    refractionIndex: 'number',
    dispersion: 'number',
    thickness: 'number',
    thicknessTint: 'boolean',
    ..._textureParameter('thickness'),
    attenuation: 'rgb',
    attenuationDistance: 'number',
    useDynamicRefraction: 'boolean',
    sphereMap: 'texture',
    cubeMap: 'cubemap',
    cubeMapProjection: 'number',
    cubeMapProjectionBox: 'boundingbox',
    useIridescence: 'boolean',
    iridescence: 'number',
    iridescenceTint: 'boolean',
    ..._textureParameter('iridescence'),
    iridescenceThicknessTint: 'boolean',
    iridescenceThicknessMin: 'number',
    iridescenceThicknessMax: 'number',
    iridescenceRefractionIndex: 'number',
    ..._textureParameter('iridescenceThickness'),
    ..._textureParameter('light'),
    depthTest: 'boolean',
    depthFunc: 'enum:depthFunc',
    depthWrite: 'boolean',
    depthBias: 'number',
    slopeDepthBias: 'number',
    cull: 'enum:cull',
    blendType: 'enum:blendType',
    useFog: 'boolean',
    useLighting: 'boolean',
    useSkybox: 'boolean',
    useTonemap: 'boolean',
    envAtlas: 'texture',
    twoSidedLighting: 'boolean',
    shadowCatcher: 'boolean',
}
const standardMaterialTextureParameters = []
for (const key in standardMaterialParameterTypes) {
    const type = standardMaterialParameterTypes[key]
    if (type === 'texture') {
        standardMaterialTextureParameters.push(key)
    }
}
const standardMaterialCubemapParameters = []
for (const key in standardMaterialParameterTypes) {
    const type = standardMaterialParameterTypes[key]
    if (type === 'cubemap') {
        standardMaterialCubemapParameters.push(key)
    }
}

const _props = {}
const _uniforms = {}
let _params = new Set()
const _tempColor = new Color()
class StandardMaterial extends Material {
    reset() {
        Object.keys(_props).forEach((name) => {
            this[`_${name}`] = _props[name].value()
        })
        this._uniformCache = {}
    }
    copy(source) {
        super.copy(source)
        Object.keys(_props).forEach((k) => {
            this[k] = source[k]
        })
        this.userAttributes = new Map(source.userAttributes)
        return this
    }
    setAttribute(name, semantic) {
        this.userAttributes.set(semantic, name)
    }
    _setParameter(name, value) {
        _params.add(name)
        this.setParameter(name, value)
    }
    _setParameters(parameters) {
        parameters.forEach((v) => {
            this._setParameter(v.name, v.value)
        })
    }
    _processParameters(paramsName) {
        const prevParams = this[paramsName]
        prevParams.forEach((param) => {
            if (!_params.has(param)) {
                delete this.parameters[param]
            }
        })
        this[paramsName] = _params
        _params = prevParams
        _params.clear()
    }
    _updateMap(p) {
        const mname = `${p}Map`
        const map = this[mname]
        if (map) {
            this._setParameter(`texture_${mname}`, map)
            const tname = `${mname}Transform`
            const uniform = this.getUniform(tname)
            if (uniform) {
                this._setParameters(uniform)
            }
        }
    }
    _allocUniform(name, allocFunc) {
        let uniform = this._uniformCache[name]
        if (!uniform) {
            uniform = allocFunc()
            this._uniformCache[name] = uniform
        }
        return uniform
    }
    getUniform(name, device, scene) {
        return _uniforms[name](this, device, scene)
    }
    updateUniforms(device, scene) {
        const getUniform = (name) => {
            return this.getUniform(name, device, scene)
        }
        this._setParameter('material_ambient', getUniform('ambient'))
        this._setParameter('material_diffuse', getUniform('diffuse'))
        this._setParameter('material_aoIntensity', this.aoIntensity)
        if (this.useMetalness) {
            if (!this.metalnessMap || this.metalness < 1) {
                this._setParameter('material_metalness', this.metalness)
            }
            if (!this.specularMap || this.specularTint) {
                this._setParameter('material_specular', getUniform('specular'))
            }
            if (!this.specularityFactorMap || this.specularityFactorTint) {
                this._setParameter('material_specularityFactor', this.specularityFactor)
            }
            this._setParameter('material_sheen', getUniform('sheen'))
            this._setParameter('material_sheenGloss', this.sheenGloss)
            this._setParameter('material_refractionIndex', this.refractionIndex)
        } else {
            if (!this.specularMap || this.specularTint) {
                this._setParameter('material_specular', getUniform('specular'))
            }
        }
        if (this.enableGGXSpecular) {
            this._setParameter('material_anisotropyIntensity', this.anisotropyIntensity)
            this._setParameter('material_anisotropyRotation', [
                Math.cos(this.anisotropyRotation * math.DEG_TO_RAD),
                Math.sin(this.anisotropyRotation * math.DEG_TO_RAD),
            ])
        }
        if (this.clearCoat > 0) {
            this._setParameter('material_clearCoat', this.clearCoat)
            this._setParameter('material_clearCoatGloss', this.clearCoatGloss)
            this._setParameter('material_clearCoatBumpiness', this.clearCoatBumpiness)
        }
        this._setParameter('material_gloss', this.gloss)
        this._setParameter('material_emissive', getUniform('emissive'))
        this._setParameter('material_emissiveIntensity', this.emissiveIntensity)
        if (this.refraction > 0) {
            this._setParameter('material_refraction', this.refraction)
        }
        if (this.dispersion > 0) {
            this._setParameter('material_dispersion', this.dispersion)
        }
        if (this.useDynamicRefraction) {
            this._setParameter('material_thickness', this.thickness)
            this._setParameter('material_attenuation', getUniform('attenuation'))
            this._setParameter(
                'material_invAttenuationDistance',
                this.attenuationDistance === 0 ? 0 : 1.0 / this.attenuationDistance,
            )
        }
        if (this.useIridescence) {
            this._setParameter('material_iridescence', this.iridescence)
            this._setParameter('material_iridescenceRefractionIndex', this.iridescenceRefractionIndex)
            this._setParameter('material_iridescenceThicknessMin', this.iridescenceThicknessMin)
            this._setParameter('material_iridescenceThicknessMax', this.iridescenceThicknessMax)
        }
        this._setParameter('material_opacity', this.opacity)
        if (this.opacityFadesSpecular === false) {
            this._setParameter('material_alphaFade', this.alphaFade)
        }
        if (this.occludeSpecular) {
            this._setParameter('material_occludeSpecularIntensity', this.occludeSpecularIntensity)
        }
        if (this.cubeMapProjection === CUBEPROJ_BOX) {
            this._setParameter(getUniform('cubeMapProjectionBox'))
        }
        for (const p in _matTex2D) {
            this._updateMap(p)
        }
        if (this.ambientSH) {
            this._setParameter('ambientSH[0]', this.ambientSH)
        }
        if (this.normalMap) {
            this._setParameter('material_bumpiness', this.bumpiness)
        }
        if (this.normalMap && this.normalDetailMap) {
            this._setParameter('material_normalDetailMapBumpiness', this.normalDetailMapBumpiness)
        }
        if (this.heightMap) {
            this._setParameter('material_heightMapFactor', getUniform('heightMapFactor'))
        }
        if (this.envAtlas && this.cubeMap) {
            this._setParameter('texture_envAtlas', this.envAtlas)
            this._setParameter('texture_cubeMap', this.cubeMap)
        } else if (this.envAtlas) {
            this._setParameter('texture_envAtlas', this.envAtlas)
        } else if (this.cubeMap) {
            this._setParameter('texture_cubeMap', this.cubeMap)
        } else if (this.sphereMap) {
            this._setParameter('texture_sphereMap', this.sphereMap)
        }
        this._setParameter('material_reflectivity', this.reflectivity)
        this._processParameters('_activeParams')
        super.updateUniforms(device, scene)
    }
    updateEnvUniforms(device, scene) {
        const hasLocalEnvOverride = this.envAtlas || this.cubeMap || this.sphereMap
        if (!hasLocalEnvOverride && this.useSkybox) {
            if (scene.envAtlas && scene.skybox) {
                this._setParameter('texture_envAtlas', scene.envAtlas)
                this._setParameter('texture_cubeMap', scene.skybox)
            } else if (scene.envAtlas) {
                this._setParameter('texture_envAtlas', scene.envAtlas)
            } else if (scene.skybox) {
                this._setParameter('texture_cubeMap', scene.skybox)
            }
        }
        this._processParameters('_activeLightingParams')
    }
    getShaderVariant(params) {
        const { device, scene, pass, objDefs, sortedLights, cameraShaderParams } = params
        this.updateEnvUniforms(device, scene)
        const shaderPassInfo = ShaderPass.get(device).getByIndex(pass)
        const minimalOptions = pass === SHADER_PICK || pass === SHADER_PREPASS || shaderPassInfo.isShadow
        let options = minimalOptions ? standard.optionsContextMin : standard.optionsContext
        options.defines = ShaderUtils.getCoreDefines(this, params)
        if (minimalOptions) {
            this.shaderOptBuilder.updateMinRef(options, scene, this, objDefs, pass, sortedLights)
        } else {
            this.shaderOptBuilder.updateRef(options, scene, cameraShaderParams, this, objDefs, pass, sortedLights)
        }
        if (!this.useFog) options.defines.set('FOG', 'NONE')
        options.defines.set('TONEMAP', tonemapNames[options.litOptions.toneMap])
        if (this.onUpdateShader) {
            options = this.onUpdateShader(options)
        }
        const processingOptions = new ShaderProcessorOptions(
            params.viewUniformFormat,
            params.viewBindGroupFormat,
            params.vertexFormat,
        )
        const library = getProgramLibrary(device)
        library.register('standard', standard)
        const shader = library.getProgram('standard', options, processingOptions, this.userId)
        this._dirtyShader = false
        return shader
    }
    destroy() {
        for (const asset in this._assetReferences) {
            this._assetReferences[asset]._unbind()
        }
        this._assetReferences = null
        super.destroy()
    }
    constructor() {
        ;(super(), (this.userAttributes = new Map()))
        this._assetReferences = {}
        this._activeParams = new Set()
        this._activeLightingParams = new Set()
        this.shaderOptBuilder = new StandardMaterialOptionsBuilder()
        this.reset()
    }
}
StandardMaterial.TEXTURE_PARAMETERS = standardMaterialTextureParameters
StandardMaterial.CUBEMAP_PARAMETERS = standardMaterialCubemapParameters
const defineUniform = (name, getUniformFunc) => {
    _uniforms[name] = getUniformFunc
}
const definePropInternal = (name, constructorFunc, setterFunc, getterFunc) => {
    Object.defineProperty(StandardMaterial.prototype, name, {
        get:
            getterFunc ||
            function () {
                return this[`_${name}`]
            },
        set: setterFunc,
    })
    _props[name] = {
        value: constructorFunc,
    }
}
const defineValueProp = (prop) => {
    const internalName = `_${prop.name}`
    const dirtyShaderFunc = prop.dirtyShaderFunc || (() => true)
    const setterFunc = function (value) {
        const oldValue = this[internalName]
        if (oldValue !== value) {
            this._dirtyShader = this._dirtyShader || dirtyShaderFunc(oldValue, value)
            this[internalName] = value
        }
    }
    definePropInternal(prop.name, () => prop.defaultValue, setterFunc, prop.getterFunc)
}
const defineAggProp = (prop) => {
    const internalName = `_${prop.name}`
    const dirtyShaderFunc = prop.dirtyShaderFunc || (() => true)
    const setterFunc = function (value) {
        const oldValue = this[internalName]
        if (!oldValue.equals(value)) {
            this._dirtyShader = this._dirtyShader || dirtyShaderFunc(oldValue, value)
            this[internalName] = oldValue.copy(value)
        }
    }
    definePropInternal(prop.name, () => prop.defaultValue.clone(), setterFunc, prop.getterFunc)
}
const defineProp = (prop) => {
    return prop.defaultValue && prop.defaultValue.clone ? defineAggProp(prop) : defineValueProp(prop)
}
function _defineTex2D(name, channel = 'rgb', vertexColor = true, uv = 0) {
    _matTex2D[name] = channel.length || -1
    defineProp({
        name: `${name}Map`,
        defaultValue: null,
        dirtyShaderFunc: (oldValue, newValue) => {
            return (
                !!oldValue !== !!newValue ||
                (oldValue && (oldValue.type !== newValue.type || oldValue.format !== newValue.format))
            )
        },
    })
    defineProp({
        name: `${name}MapTiling`,
        defaultValue: new Vec2(1, 1),
    })
    defineProp({
        name: `${name}MapOffset`,
        defaultValue: new Vec2(0, 0),
    })
    defineProp({
        name: `${name}MapRotation`,
        defaultValue: 0,
    })
    defineProp({
        name: `${name}MapUv`,
        defaultValue: uv,
    })
    if (channel) {
        defineProp({
            name: `${name}MapChannel`,
            defaultValue: channel,
        })
        if (vertexColor) {
            defineProp({
                name: `${name}VertexColor`,
                defaultValue: false,
            })
            defineProp({
                name: `${name}VertexColorChannel`,
                defaultValue: channel,
            })
        }
    }
    const mapTiling = `${name}MapTiling`
    const mapOffset = `${name}MapOffset`
    const mapRotation = `${name}MapRotation`
    const mapTransform = `${name}MapTransform`
    defineUniform(mapTransform, (material, device, scene) => {
        const tiling = material[mapTiling]
        const offset = material[mapOffset]
        const rotation = material[mapRotation]
        if (tiling.x === 1 && tiling.y === 1 && offset.x === 0 && offset.y === 0 && rotation === 0) {
            return null
        }
        const uniform = material._allocUniform(mapTransform, () => {
            return [
                {
                    name: `texture_${mapTransform}0`,
                    value: new Float32Array(3),
                },
                {
                    name: `texture_${mapTransform}1`,
                    value: new Float32Array(3),
                },
            ]
        })
        const cr = Math.cos(rotation * math.DEG_TO_RAD)
        const sr = Math.sin(rotation * math.DEG_TO_RAD)
        const uniform0 = uniform[0].value
        uniform0[0] = cr * tiling.x
        uniform0[1] = -sr * tiling.y
        uniform0[2] = offset.x
        const uniform1 = uniform[1].value
        uniform1[0] = sr * tiling.x
        uniform1[1] = cr * tiling.y
        uniform1[2] = 1.0 - tiling.y - offset.y
        return uniform
    })
}
function _defineColor(name, defaultValue) {
    defineProp({
        name: name,
        defaultValue: defaultValue,
        getterFunc: function () {
            this._dirtyShader = true
            return this[`_${name}`]
        },
    })
    defineUniform(name, (material, device, scene) => {
        const uniform = material._allocUniform(name, () => new Float32Array(3))
        const color = material[name]
        _tempColor.linear(color)
        uniform[0] = _tempColor.r
        uniform[1] = _tempColor.g
        uniform[2] = _tempColor.b
        return uniform
    })
}
function _defineFloat(name, defaultValue, getUniformFunc) {
    defineProp({
        name: name,
        defaultValue: defaultValue,
        dirtyShaderFunc: (oldValue, newValue) => {
            return (oldValue === 0 || oldValue === 1) !== (newValue === 0 || newValue === 1)
        },
    })
    defineUniform(name, getUniformFunc)
}
function _defineObject(name, getUniformFunc) {
    defineProp({
        name: name,
        defaultValue: null,
        dirtyShaderFunc: (oldValue, newValue) => {
            return !!oldValue === !!newValue
        },
    })
    defineUniform(name, getUniformFunc)
}
function _defineFlag(name, defaultValue) {
    defineProp({
        name: name,
        defaultValue: defaultValue,
    })
}
function _defineMaterialProps() {
    _defineColor('ambient', new Color(1, 1, 1))
    _defineColor('diffuse', new Color(1, 1, 1))
    _defineColor('specular', new Color(0, 0, 0))
    _defineColor('emissive', new Color(0, 0, 0))
    _defineColor('sheen', new Color(1, 1, 1))
    _defineColor('attenuation', new Color(1, 1, 1))
    _defineFloat('emissiveIntensity', 1)
    _defineFloat('specularityFactor', 1)
    _defineFloat('sheenGloss', 0.0)
    _defineFloat('gloss', 0.25)
    _defineFloat('aoIntensity', 1)
    _defineFloat('heightMapFactor', 1, (material, device, scene) => {
        return material.heightMapFactor * 0.025
    })
    _defineFloat('opacity', 1)
    _defineFloat('alphaFade', 1)
    _defineFloat('alphaTest', 0)
    _defineFloat('bumpiness', 1)
    _defineFloat('normalDetailMapBumpiness', 1)
    _defineFloat('reflectivity', 1)
    _defineFloat('occludeSpecularIntensity', 1)
    _defineFloat('refraction', 0)
    _defineFloat('refractionIndex', 1.0 / 1.5, (material, device, scene) => {
        return Math.max(0.001, material.refractionIndex)
    })
    _defineFloat('dispersion', 0)
    _defineFloat('thickness', 0)
    _defineFloat('attenuationDistance', 0)
    _defineFloat('metalness', 1)
    _defineFloat('anisotropyIntensity', 0)
    _defineFloat('anisotropyRotation', 0)
    _defineFloat('clearCoat', 0)
    _defineFloat('clearCoatGloss', 1)
    _defineFloat('clearCoatBumpiness', 1)
    _defineFloat('aoUvSet', 0, null)
    _defineFloat('iridescence', 0)
    _defineFloat('iridescenceRefractionIndex', 1.0 / 1.5)
    _defineFloat('iridescenceThicknessMin', 0)
    _defineFloat('iridescenceThicknessMax', 0)
    _defineObject('ambientSH')
    _defineObject('cubeMapProjectionBox', (material, device, scene) => {
        const uniform = material._allocUniform('cubeMapProjectionBox', () => {
            return [
                {
                    name: 'envBoxMin',
                    value: new Float32Array(3),
                },
                {
                    name: 'envBoxMax',
                    value: new Float32Array(3),
                },
            ]
        })
        const bboxMin = material.cubeMapProjectionBox.getMin()
        const minUniform = uniform[0].value
        minUniform[0] = bboxMin.x
        minUniform[1] = bboxMin.y
        minUniform[2] = bboxMin.z
        const bboxMax = material.cubeMapProjectionBox.getMax()
        const maxUniform = uniform[1].value
        maxUniform[0] = bboxMax.x
        maxUniform[1] = bboxMax.y
        maxUniform[2] = bboxMax.z
        return uniform
    })
    _defineFlag('specularTint', false)
    _defineFlag('specularityFactorTint', false)
    _defineFlag('useMetalness', false)
    _defineFlag('useMetalnessSpecularColor', false)
    _defineFlag('useSheen', false)
    _defineFlag('enableGGXSpecular', false)
    _defineFlag('occludeDirect', false)
    _defineFlag('opacityFadesSpecular', true)
    _defineFlag('occludeSpecular', SPECOCC_AO)
    _defineFlag('fresnelModel', FRESNEL_SCHLICK)
    _defineFlag('useDynamicRefraction', false)
    _defineFlag('cubeMapProjection', CUBEPROJ_NONE)
    _defineFlag('useFog', true)
    _defineFlag('useLighting', true)
    _defineFlag('useTonemap', true)
    _defineFlag('useSkybox', true)
    _defineFlag('forceUv1', false)
    _defineFlag('pixelSnap', false)
    _defineFlag('twoSidedLighting', false)
    _defineFlag('nineSlicedMode', undefined)
    _defineFlag('msdfTextAttribute', false)
    _defineFlag('useIridescence', false)
    _defineFlag('glossInvert', false)
    _defineFlag('sheenGlossInvert', false)
    _defineFlag('clearCoatGlossInvert', false)
    _defineFlag('opacityDither', DITHER_NONE)
    _defineFlag('opacityShadowDither', DITHER_NONE)
    _defineFlag('shadowCatcher', false)
    _defineFlag('vertexColorGamma', false)
    _defineTex2D('diffuse')
    _defineTex2D('specular')
    _defineTex2D('emissive')
    _defineTex2D('thickness', 'g')
    _defineTex2D('specularityFactor', 'g')
    _defineTex2D('normal', '')
    _defineTex2D('metalness', 'g')
    _defineTex2D('gloss', 'g')
    _defineTex2D('opacity', 'a')
    _defineTex2D('refraction', 'g')
    _defineTex2D('height', 'g', false)
    _defineTex2D('ao', 'g')
    _defineTex2D('light', 'rgb', true, 1)
    _defineTex2D('msdf', '')
    _defineTex2D('diffuseDetail', 'rgb', false)
    _defineTex2D('normalDetail', '')
    _defineTex2D('aoDetail', 'g', false)
    _defineTex2D('clearCoat', 'g')
    _defineTex2D('clearCoatGloss', 'g')
    _defineTex2D('clearCoatNormal', '')
    _defineTex2D('sheen', 'rgb')
    _defineTex2D('sheenGloss', 'g')
    _defineTex2D('iridescence', 'g')
    _defineTex2D('iridescenceThickness', 'g')
    _defineTex2D('anisotropy', '')
    _defineFlag('diffuseDetailMode', DETAILMODE_MUL)
    _defineFlag('aoDetailMode', DETAILMODE_MUL)
    _defineObject('cubeMap')
    _defineObject('sphereMap')
    _defineObject('envAtlas')
    const getterFunc = function () {
        return this._prefilteredCubemaps
    }
    const setterFunc = function (value) {
        const cubemaps = this._prefilteredCubemaps
        value = value || []
        let changed = false
        let complete = true
        for (let i = 0; i < 6; ++i) {
            const v = value[i] || null
            if (cubemaps[i] !== v) {
                cubemaps[i] = v
                changed = true
            }
            complete = complete && !!cubemaps[i]
        }
        if (changed) {
            if (complete) {
                this.envAtlas = EnvLighting.generatePrefilteredAtlas(cubemaps, {
                    target: this.envAtlas,
                })
            } else {
                if (this.envAtlas) {
                    this.envAtlas.destroy()
                    this.envAtlas = null
                }
            }
            this._dirtyShader = true
        }
    }
    const empty = [null, null, null, null, null, null]
    definePropInternal('prefilteredCubemaps', () => empty.slice(), setterFunc, getterFunc)
}
_defineMaterialProps()

const primitiveUv1Padding = 8.0 / 64
const primitiveUv1PaddingScale = 1.0 - primitiveUv1Padding * 2
class ConeBaseGeometry extends Geometry {
    constructor(baseRadius, peakRadius, height, heightSegments, capSegments, roundedCaps) {
        super()
        const pos = new Vec3()
        const bottomToTop = new Vec3()
        const norm = new Vec3()
        const top = new Vec3()
        const bottom = new Vec3()
        const tangent = new Vec3()
        const positions = []
        const normals = []
        const uvs = []
        const uvs1 = []
        const indices = []
        let offset
        if (height > 0) {
            for (let i = 0; i <= heightSegments; i++) {
                for (let j = 0; j <= capSegments; j++) {
                    const theta = (j / capSegments) * 2 * Math.PI - Math.PI
                    const sinTheta = Math.sin(theta)
                    const cosTheta = Math.cos(theta)
                    bottom.set(sinTheta * baseRadius, -height / 2, cosTheta * baseRadius)
                    top.set(sinTheta * peakRadius, height / 2, cosTheta * peakRadius)
                    pos.lerp(bottom, top, i / heightSegments)
                    bottomToTop.sub2(top, bottom).normalize()
                    tangent.set(cosTheta, 0, -sinTheta)
                    norm.cross(tangent, bottomToTop).normalize()
                    positions.push(pos.x, pos.y, pos.z)
                    normals.push(norm.x, norm.y, norm.z)
                    let u = j / capSegments
                    let v = i / heightSegments
                    uvs.push(u, 1 - v)
                    const _v = v
                    v = u
                    u = _v
                    u = u * primitiveUv1PaddingScale + primitiveUv1Padding
                    v = v * primitiveUv1PaddingScale + primitiveUv1Padding
                    u /= 3
                    uvs1.push(u, 1 - v)
                    if (i < heightSegments && j < capSegments) {
                        const first = i * (capSegments + 1) + j
                        const second = i * (capSegments + 1) + (j + 1)
                        const third = (i + 1) * (capSegments + 1) + j
                        const fourth = (i + 1) * (capSegments + 1) + (j + 1)
                        indices.push(first, second, third)
                        indices.push(second, fourth, third)
                    }
                }
            }
        }
        if (roundedCaps) {
            const latitudeBands = Math.floor(capSegments / 2)
            const longitudeBands = capSegments
            const capOffset = height / 2
            for (let lat = 0; lat <= latitudeBands; lat++) {
                const theta = (lat * Math.PI * 0.5) / latitudeBands
                const sinTheta = Math.sin(theta)
                const cosTheta = Math.cos(theta)
                for (let lon = 0; lon <= longitudeBands; lon++) {
                    const phi = (lon * 2 * Math.PI) / longitudeBands - Math.PI / 2
                    const sinPhi = Math.sin(phi)
                    const cosPhi = Math.cos(phi)
                    const x = cosPhi * sinTheta
                    const y = cosTheta
                    const z = sinPhi * sinTheta
                    let u = 1 - lon / longitudeBands
                    let v = 1 - lat / latitudeBands
                    positions.push(x * peakRadius, y * peakRadius + capOffset, z * peakRadius)
                    normals.push(x, y, z)
                    uvs.push(u, 1 - v)
                    u = u * primitiveUv1PaddingScale + primitiveUv1Padding
                    v = v * primitiveUv1PaddingScale + primitiveUv1Padding
                    u /= 3
                    v /= 3
                    u += 1.0 / 3
                    uvs1.push(u, 1 - v)
                }
            }
            offset = (heightSegments + 1) * (capSegments + 1)
            for (let lat = 0; lat < latitudeBands; ++lat) {
                for (let lon = 0; lon < longitudeBands; ++lon) {
                    const first = lat * (longitudeBands + 1) + lon
                    const second = first + longitudeBands + 1
                    indices.push(offset + first + 1, offset + second, offset + first)
                    indices.push(offset + first + 1, offset + second + 1, offset + second)
                }
            }
            for (let lat = 0; lat <= latitudeBands; lat++) {
                const theta = Math.PI * 0.5 + (lat * Math.PI * 0.5) / latitudeBands
                const sinTheta = Math.sin(theta)
                const cosTheta = Math.cos(theta)
                for (let lon = 0; lon <= longitudeBands; lon++) {
                    const phi = (lon * 2 * Math.PI) / longitudeBands - Math.PI / 2
                    const sinPhi = Math.sin(phi)
                    const cosPhi = Math.cos(phi)
                    const x = cosPhi * sinTheta
                    const y = cosTheta
                    const z = sinPhi * sinTheta
                    let u = 1 - lon / longitudeBands
                    let v = 1 - lat / latitudeBands
                    positions.push(x * peakRadius, y * peakRadius - capOffset, z * peakRadius)
                    normals.push(x, y, z)
                    uvs.push(u, 1 - v)
                    u = u * primitiveUv1PaddingScale + primitiveUv1Padding
                    v = v * primitiveUv1PaddingScale + primitiveUv1Padding
                    u /= 3
                    v /= 3
                    u += 2.0 / 3
                    uvs1.push(u, 1 - v)
                }
            }
            offset = (heightSegments + 1) * (capSegments + 1) + (longitudeBands + 1) * (latitudeBands + 1)
            for (let lat = 0; lat < latitudeBands; ++lat) {
                for (let lon = 0; lon < longitudeBands; ++lon) {
                    const first = lat * (longitudeBands + 1) + lon
                    const second = first + longitudeBands + 1
                    indices.push(offset + first + 1, offset + second, offset + first)
                    indices.push(offset + first + 1, offset + second + 1, offset + second)
                }
            }
        } else {
            offset = (heightSegments + 1) * (capSegments + 1)
            if (baseRadius > 0) {
                for (let i = 0; i < capSegments; i++) {
                    const theta = (i / capSegments) * 2 * Math.PI
                    const x = Math.sin(theta)
                    const y = -height / 2
                    const z = Math.cos(theta)
                    let u = 1 - (x + 1) / 2
                    let v = (z + 1) / 2
                    positions.push(x * baseRadius, y, z * baseRadius)
                    normals.push(0, -1, 0)
                    uvs.push(u, 1 - v)
                    u = u * primitiveUv1PaddingScale + primitiveUv1Padding
                    v = v * primitiveUv1PaddingScale + primitiveUv1Padding
                    u /= 3
                    v /= 3
                    u += 1 / 3
                    uvs1.push(u, 1 - v)
                    if (i > 1) {
                        indices.push(offset, offset + i, offset + i - 1)
                    }
                }
            }
            offset += capSegments
            if (peakRadius > 0) {
                for (let i = 0; i < capSegments; i++) {
                    const theta = (i / capSegments) * 2 * Math.PI
                    const x = Math.sin(theta)
                    const y = height / 2
                    const z = Math.cos(theta)
                    let u = 1 - (x + 1) / 2
                    let v = (z + 1) / 2
                    positions.push(x * peakRadius, y, z * peakRadius)
                    normals.push(0, 1, 0)
                    uvs.push(u, 1 - v)
                    u = u * primitiveUv1PaddingScale + primitiveUv1Padding
                    v = v * primitiveUv1PaddingScale + primitiveUv1Padding
                    u /= 3
                    v /= 3
                    u += 2 / 3
                    uvs1.push(u, 1 - v)
                    if (i > 1) {
                        indices.push(offset, offset + i - 1, offset + i)
                    }
                }
            }
        }
        this.positions = positions
        this.normals = normals
        this.uvs = uvs
        this.uvs1 = uvs1
        this.indices = indices
    }
}

class CapsuleGeometry extends ConeBaseGeometry {
    constructor(opts = {}) {
        const radius = opts.radius ?? 0.3
        const height = opts.height ?? 1
        const heightSegments = opts.heightSegments ?? 1
        const sides = opts.sides ?? 20
        super(radius, radius, height - 2 * radius, heightSegments, sides, true)
        if (opts.calculateTangents) {
            this.tangents = calculateTangents(this.positions, this.normals, this.uvs, this.indices)
        }
    }
}

class ConeGeometry extends ConeBaseGeometry {
    constructor(opts = {}) {
        const baseRadius = opts.baseRadius ?? 0.5
        const peakRadius = opts.peakRadius ?? 0
        const height = opts.height ?? 1
        const heightSegments = opts.heightSegments ?? 5
        const capSegments = opts.capSegments ?? 18
        super(baseRadius, peakRadius, height, heightSegments, capSegments, false)
        if (opts.calculateTangents) {
            this.tangents = calculateTangents(this.positions, this.normals, this.uvs, this.indices)
        }
    }
}

class CylinderGeometry extends ConeBaseGeometry {
    constructor(opts = {}) {
        const radius = opts.radius ?? 0.5
        const height = opts.height ?? 1
        const heightSegments = opts.heightSegments ?? 5
        const capSegments = opts.capSegments ?? 20
        super(radius, radius, height, heightSegments, capSegments, false)
        if (opts.calculateTangents) {
            this.tangents = calculateTangents(this.positions, this.normals, this.uvs, this.indices)
        }
    }
}

class PlaneGeometry extends Geometry {
    constructor(opts = {}) {
        super()
        const he = opts.halfExtents ?? new Vec2(0.5, 0.5)
        const ws = opts.widthSegments ?? 5
        const ls = opts.lengthSegments ?? 5
        const positions = []
        const normals = []
        const uvs = []
        const indices = []
        let vcounter = 0
        for (let i = 0; i <= ws; i++) {
            for (let j = 0; j <= ls; j++) {
                const x = -he.x + (2 * he.x * i) / ws
                const y = 0.0
                const z = -(-he.y + (2 * he.y * j) / ls)
                const u = i / ws
                const v = j / ls
                positions.push(x, y, z)
                normals.push(0, 1, 0)
                uvs.push(u, 1 - v)
                if (i < ws && j < ls) {
                    indices.push(vcounter + ls + 1, vcounter + 1, vcounter)
                    indices.push(vcounter + ls + 1, vcounter + ls + 2, vcounter + 1)
                }
                vcounter++
            }
        }
        this.positions = positions
        this.normals = normals
        this.uvs = uvs
        this.uvs1 = uvs
        this.indices = indices
        if (opts.calculateTangents) {
            this.tangents = calculateTangents(positions, normals, uvs, indices)
        }
    }
}

class TorusGeometry extends Geometry {
    constructor(opts = {}) {
        super()
        const rc = opts.tubeRadius ?? 0.2
        const rt = opts.ringRadius ?? 0.3
        const sectorAngle = (opts.sectorAngle ?? 360) * math.DEG_TO_RAD
        const segments = opts.segments ?? 30
        const sides = opts.sides ?? 20
        const positions = []
        const normals = []
        const uvs = []
        const indices = []
        for (let i = 0; i <= sides; i++) {
            for (let j = 0; j <= segments; j++) {
                const x = Math.cos((sectorAngle * j) / segments) * (rt + rc * Math.cos((2 * Math.PI * i) / sides))
                const y = Math.sin((2 * Math.PI * i) / sides) * rc
                const z = Math.sin((sectorAngle * j) / segments) * (rt + rc * Math.cos((2 * Math.PI * i) / sides))
                const nx = Math.cos((sectorAngle * j) / segments) * Math.cos((2 * Math.PI * i) / sides)
                const ny = Math.sin((2 * Math.PI * i) / sides)
                const nz = Math.sin((sectorAngle * j) / segments) * Math.cos((2 * Math.PI * i) / sides)
                const u = i / sides
                const v = 1 - j / segments
                positions.push(x, y, z)
                normals.push(nx, ny, nz)
                uvs.push(u, 1.0 - v)
                if (i < sides && j < segments) {
                    const first = i * (segments + 1) + j
                    const second = (i + 1) * (segments + 1) + j
                    const third = i * (segments + 1) + (j + 1)
                    const fourth = (i + 1) * (segments + 1) + (j + 1)
                    indices.push(first, second, third)
                    indices.push(second, fourth, third)
                }
            }
        }
        this.positions = positions
        this.normals = normals
        this.uvs = uvs
        this.uvs1 = uvs
        this.indices = indices
        if (opts.calculateTangents) {
            this.tangents = calculateTangents(positions, normals, uvs, indices)
        }
    }
}

class ProgramLibrary {
    destroy() {
        this.clearCache()
    }
    register(name, generator) {
        if (!this._generators.has(name)) {
            this._generators.set(name, generator)
        }
    }
    unregister(name) {
        if (this._generators.has(name)) {
            this._generators.delete(name)
        }
    }
    isRegistered(name) {
        return this._generators.has(name)
    }
    generateShaderDefinition(generator, name, key, options) {
        let def = this.definitionsCache.get(key)
        if (!def) {
            let lights
            if (options.litOptions?.lights) {
                lights = options.litOptions.lights
                options.litOptions.lights = lights.map((l) => {
                    const lcopy = l.clone ? l.clone() : l
                    lcopy.key = l.key
                    return lcopy
                })
            }
            this.storeNewProgram(name, options)
            if (options.litOptions?.lights) {
                options.litOptions.lights = lights
            }
            if (this._precached);
            const device = this._device
            def = generator.createShaderDefinition(device, options)
            def.name = def.name ?? (options.pass ? `${name}-pass:${options.pass}` : name)
            this.definitionsCache.set(key, def)
        }
        return def
    }
    getCachedShader(key) {
        return this.processedCache.get(key)
    }
    setCachedShader(key, shader) {
        this.processedCache.set(key, shader)
    }
    getProgram(name, options, processingOptions, userMaterialId) {
        const generator = this._generators.get(name)
        if (!generator) {
            return null
        }
        const generationKeyString = generator.generateKey(options)
        const generationKey = hashCode(generationKeyString)
        const processingKeyString = processingOptions.generateKey(this._device)
        const processingKey = hashCode(processingKeyString)
        const totalKey = `${generationKey}#${processingKey}`
        let processedShader = this.getCachedShader(totalKey)
        if (!processedShader) {
            const generatedShaderDef = this.generateShaderDefinition(generator, name, generationKey, options)
            let passName = ''
            let shaderPassInfo
            if (options.pass !== undefined) {
                shaderPassInfo = ShaderPass.get(this._device).getByIndex(options.pass)
                passName = `-${shaderPassInfo.name}`
            }
            this._device.fire('shader:generate', {
                userMaterialId,
                shaderPassInfo,
                definition: generatedShaderDef,
            })
            const shaderDefinition = {
                name: `${generatedShaderDef.name}${passName}-proc`,
                attributes: generatedShaderDef.attributes,
                vshader: generatedShaderDef.vshader,
                vincludes: generatedShaderDef.vincludes,
                fincludes: generatedShaderDef.fincludes,
                fshader: generatedShaderDef.fshader,
                processingOptions: processingOptions,
                shaderLanguage: generatedShaderDef.shaderLanguage,
                meshUniformBufferFormat: generatedShaderDef.meshUniformBufferFormat,
                meshBindGroupFormat: generatedShaderDef.meshBindGroupFormat,
            }
            processedShader = new Shader(this._device, shaderDefinition)
            this.setCachedShader(totalKey, processedShader)
        }
        return processedShader
    }
    storeNewProgram(name, options) {
        let opt = {}
        if (name === 'standard') {
            const defaultMat = this._getDefaultStdMatOptions(options.pass)
            for (const p in options) {
                if ((options.hasOwnProperty(p) && defaultMat[p] !== options[p]) || p === 'pass') {
                    opt[p] = options[p]
                }
            }
            for (const p in options.litOptions) {
                opt[p] = options.litOptions[p]
            }
        } else {
            opt = options
        }
        this._programsCollection.push(
            JSON.stringify({
                name: name,
                options: opt,
            }),
        )
    }
    dumpPrograms() {
        let text = 'let device = pc.app ? pc.app.graphicsDevice : pc.Application.getApplication().graphicsDevice;\n'
        text += 'let shaders = ['
        if (this._programsCollection[0]) {
            text += `\n\t${this._programsCollection[0]}`
        }
        for (let i = 1; i < this._programsCollection.length; ++i) {
            text += `,\n\t${this._programsCollection[i]}`
        }
        text += '\n];\n'
        text += 'pc.getProgramLibrary(device).precompile(shaders);\n'
        text += `if (pc.version != \"${version$1}\" || pc.revision != \"${revision}\")\n`
        text +=
            '\tconsole.warn(\"precompile-shaders.js: engine version mismatch, rebuild shaders lib with current engine\");'
        const element = document.createElement('a')
        element.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`)
        element.setAttribute('download', 'precompile-shaders.js')
        element.style.display = 'none'
        document.body.appendChild(element)
        element.click()
        document.body.removeChild(element)
    }
    clearCache() {
        this._isClearingCache = true
        this.processedCache.forEach((shader) => {
            shader.destroy()
        })
        this.processedCache.clear()
        this._isClearingCache = false
    }
    removeFromCache(shader) {
        if (this._isClearingCache) {
            return
        }
        this.processedCache.forEach((cachedShader, key) => {
            if (shader === cachedShader) {
                this.processedCache.delete(key)
            }
        })
    }
    _getDefaultStdMatOptions(pass) {
        const shaderPassInfo = ShaderPass.get(this._device).getByIndex(pass)
        return pass === SHADER_PICK || pass === SHADER_PREPASS || shaderPassInfo.isShadow
            ? this._defaultStdMatOptionMin
            : this._defaultStdMatOption
    }
    precompile(cache) {
        if (cache) {
            const shaders = new Array(cache.length)
            for (let i = 0; i < cache.length; i++) {
                if (cache[i].name === 'standard') {
                    const opt = cache[i].options
                    const defaultMat = this._getDefaultStdMatOptions(opt.pass)
                    for (const p in defaultMat) {
                        if (defaultMat.hasOwnProperty(p) && opt[p] === undefined) {
                            opt[p] = defaultMat[p]
                        }
                    }
                }
                shaders[i] = this.getProgram(cache[i].name, cache[i].options)
            }
        }
        this._precached = true
    }
    constructor(device, standardMaterial) {
        this.processedCache = new Map()
        this.definitionsCache = new Map()
        this._generators = new Map()
        this._device = device
        this._isClearingCache = false
        this._precached = false
        this._programsCollection = []
        this._defaultStdMatOption = new StandardMaterialOptions()
        this._defaultStdMatOptionMin = new StandardMaterialOptions()
        const defaultCameraShaderParams = new CameraShaderParams()
        standardMaterial.shaderOptBuilder.updateRef(
            this._defaultStdMatOption,
            {},
            defaultCameraShaderParams,
            standardMaterial,
            null,
            [],
            SHADER_FORWARD,
            null,
        )
        standardMaterial.shaderOptBuilder.updateMinRef(
            this._defaultStdMatOptionMin,
            {},
            standardMaterial,
            null,
            SHADER_SHADOW,
            null,
        )
        device.on('destroy:shader', (shader) => {
            this.removeFromCache(shader)
        })
    }
}

class UploadStream {
    destroy() {
        this._deviceLostEvent?.off()
        this._deviceLostEvent = null
        this.impl?.destroy()
        this.impl = null
    }
    upload(data, target, offset = 0, size = data.length) {
        this.impl?.upload(data, target, offset, size)
    }
    _onDeviceLost() {
        this.impl?._onDeviceLost?.()
    }
    constructor(device, useSingleBuffer = false) {
        this._deviceLostEvent = null
        this.device = device
        this.useSingleBuffer = useSingleBuffer
        this.impl = device.createUploadStreamImpl(this)
        this._deviceLostEvent = this.device.on('devicelost', this._onDeviceLost, this)
    }
}

var glslGsplatCopyToWorkBufferPS = `
#define GSPLAT_CENTER_NOPROJ
#include "gsplatHelpersVS"
#include "gsplatFormatVS"
#include "gsplatStructsVS"
#include "gsplatDeclarationsVS"
#include "gsplatCenterVS"
#include "gsplatEvalSHVS"
#include "gsplatQuatToMat3VS"
#include "gsplatReadVS"
#include "gsplatWorkBufferOutputVS"
#include "gsplatWriteVS"
#include "gsplatModifyVS"
flat varying ivec4 vSubDraw;
uniform vec3 uColorMultiply;
uniform vec3 model_scale;
uniform vec4 model_rotation;
#ifdef GSPLAT_ID
        uniform uint uId;
#endif
#ifdef GSPLAT_NODE_INDEX
        uniform uint uBoundsBaseIndex;
        #ifdef HAS_NODE_MAPPING
                uniform usampler2D nodeMappingTexture;
        #endif
#endif
void main(void) {
        int localRow = int(gl_FragCoord.y) - vSubDraw.w;
        int localCol = int(gl_FragCoord.x) - vSubDraw.y;
        uint originalIndex = uint(vSubDraw.x + localRow * vSubDraw.z + localCol);
        setSplat(originalIndex);
        vec3 modelCenter = getCenter();
        vec3 worldCenter = (matrix_model * vec4(modelCenter, 1.0)).xyz;
        SplatCenter center;
        initCenter(modelCenter, center);
        vec4 srcRotation = getRotation().yzwx;
        vec3 srcScale = getScale();
        vec4 worldRotation = quatMul(model_rotation, srcRotation);
        if (worldRotation.w < 0.0) {
                worldRotation = -worldRotation;
        }
        vec3 worldScale = model_scale * srcScale;
        vec3 originalCenter = worldCenter;
        modifySplatCenter(worldCenter);
        modifySplatRotationScale(originalCenter, worldCenter, worldRotation, worldScale);
        vec4 color = getColor();
        #if SH_BANDS > 0
                vec3 dir = normalize(center.view * mat3(center.modelView));
                vec3 sh[SH_COEFFS];
                float scale;
                readSHData(sh, scale);
                color.xyz += evalSH(sh, dir) * scale;
        #endif
        modifySplatColor(worldCenter, color);
        color.xyz *= uColorMultiply;
        writeSplat(worldCenter, worldRotation, worldScale, color);
        #ifdef GSPLAT_ID
                writePcId(uvec4(uId, 0u, 0u, 0u));
        #endif
        #ifdef GSPLAT_NODE_INDEX
                #ifdef HAS_NODE_MAPPING
                        int srcTextureWidth = int(textureSize(nodeMappingTexture, 0).x);
                        ivec2 sourceCoord = ivec2(int(originalIndex) % srcTextureWidth, int(originalIndex) / srcTextureWidth);
                        uint nodeIndex = texelFetch(nodeMappingTexture, sourceCoord, 0).r;
                        writePcNodeIndex(uvec4(uBoundsBaseIndex + nodeIndex, 0u, 0u, 0u));
                #else
                        writePcNodeIndex(uvec4(uBoundsBaseIndex, 0u, 0u, 0u));
                #endif
        #endif
}
`

var wgslGsplatCopyToWorkBufferPS = `
#define GSPLAT_CENTER_NOPROJ
#include "gsplatHelpersVS"
#include "gsplatFormatVS"
#include "gsplatStructsVS"
#include "gsplatDeclarationsVS"
#include "gsplatCenterVS"
#include "gsplatEvalSHVS"
#include "gsplatQuatToMat3VS"
#include "gsplatReadVS"
var<private> processOutput: FragmentOutput;
#include "gsplatWorkBufferOutputVS"
#include "gsplatWriteVS"
#include "gsplatModifyVS"
varying @interpolate(flat) vSubDraw: vec4i;
uniform uColorMultiply: vec3f;
uniform model_scale: vec3f;
uniform model_rotation: vec4f;
#ifdef GSPLAT_ID
        uniform uId: u32;
#endif
#ifdef GSPLAT_NODE_INDEX
        uniform uBoundsBaseIndex: u32;
        #ifdef HAS_NODE_MAPPING
                var nodeMappingTexture: texture_2d<u32>;
        #endif
#endif
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
        let localRow = i32(input.position.y) - input.vSubDraw.w;
        let localCol = i32(input.position.x) - input.vSubDraw.y;
        let originalIndex = u32(input.vSubDraw.x + localRow * input.vSubDraw.z + localCol);
        setSplat(originalIndex);
        var modelCenter = getCenter();
        var worldCenter = (uniform.matrix_model * vec4f(modelCenter, 1.0)).xyz;
        var center: SplatCenter;
        initCenter(modelCenter, &center);
        let srcRotation = getRotation().yzwx;
        let srcScale = getScale();
        var worldRotation = vec4f(quatMul(half4(uniform.model_rotation), half4(srcRotation)));
        if (worldRotation.w < 0.0) {
                worldRotation = -worldRotation;
        }
        var worldScale = uniform.model_scale * srcScale;
        let originalCenter = worldCenter;
        modifySplatCenter(&worldCenter);
        modifySplatRotationScale(originalCenter, worldCenter, &worldRotation, &worldScale);
        var color = getColor();
        #if SH_BANDS > 0
                let dir = normalize(center.view * mat3x3f(center.modelView[0].xyz, center.modelView[1].xyz, center.modelView[2].xyz));
                var sh: array<half3, SH_COEFFS>;
                var scale: f32;
                readSHData(&sh, &scale);
                color = vec4f(color.xyz + vec3f(evalSH(&sh, dir) * half(scale)), color.w);
        #endif
        modifySplatColor(worldCenter, &color);
        color = vec4f(color.xyz * uniform.uColorMultiply, color.w);
        writeSplat(worldCenter, worldRotation, worldScale, color);
        #ifdef GSPLAT_ID
                writePcId(vec4u(uniform.uId, 0u, 0u, 0u));
        #endif
        #ifdef GSPLAT_NODE_INDEX
                #ifdef HAS_NODE_MAPPING
                        let srcTextureWidth = i32(textureDimensions(nodeMappingTexture, 0).x);
                        let sourceCoord = vec2i(i32(originalIndex) % srcTextureWidth, i32(originalIndex) / srcTextureWidth);
                        let nodeIndex = textureLoad(nodeMappingTexture, sourceCoord, 0).r;
                        writePcNodeIndex(vec4u(uniform.uBoundsBaseIndex + nodeIndex, 0u, 0u, 0u));
                #else
                        writePcNodeIndex(vec4u(uniform.uBoundsBaseIndex, 0u, 0u, 0u));
                #endif
        #endif
        return processOutput;
}
`

var glslGsplatCopyInstancedQuadVS = `
attribute vec2 vertex_position;
precision highp usampler2D;
uniform usampler2D uSubDrawData;
uniform ivec2 uTextureSize;
uniform int uSubDrawBase;
flat varying ivec4 vSubDraw;
void main(void) {
        int subDrawWidth = textureSize(uSubDrawData, 0).x;
        int idx = gl_InstanceID + uSubDrawBase;
        uvec4 data = texelFetch(uSubDrawData, ivec2(idx % subDrawWidth, idx / subDrawWidth), 0);
        int rowStart = int(data.r & 0xFFFFu);
        int numRows = int(data.r >> 16u);
        int colStart = int(data.g);
        int colEnd = int(data.b);
        int sourceBase = int(data.a);
        float u = float(gl_VertexID & 1);
        float v = float(gl_VertexID >> 1);
        vec4 ndc = vec4(colStart, colEnd, rowStart, rowStart + numRows) / vec4(uTextureSize.x, uTextureSize.x, uTextureSize.y, uTextureSize.y) * 2.0 - 1.0;
        gl_Position = vec4(mix(ndc.x, ndc.y, u), mix(ndc.z, ndc.w, v), 0.5, 1.0);
        vSubDraw = ivec4(sourceBase, colStart, colEnd - colStart, rowStart);
}
`

var wgslGsplatCopyInstancedQuadVS = `
attribute vertex_position: vec2f;
var uSubDrawData: texture_2d<u32>;
uniform uTextureSize: vec2i;
uniform uSubDrawBase: i32;
varying @interpolate(flat) vSubDraw: vec4i;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
        var output: VertexOutput;
        let subDrawWidth = i32(textureDimensions(uSubDrawData, 0).x);
        let instIdx = i32(input.instanceIndex) + uniform.uSubDrawBase;
        let data = textureLoad(uSubDrawData, vec2i(instIdx % subDrawWidth, instIdx / subDrawWidth), 0);
        let rowStart = i32(data.r & 0xFFFFu);
        let numRows = i32(data.r >> 16u);
        let colStart = i32(data.g);
        let colEnd = i32(data.b);
        let sourceBase = i32(data.a);
        let u = f32(i32(input.vertexIndex) & 1);
        let v = f32(i32(input.vertexIndex) >> 1u);
        let ndc = vec4f(f32(colStart), f32(colEnd), f32(rowStart), f32(rowStart + numRows)) / vec4f(f32(uniform.uTextureSize.x), f32(uniform.uTextureSize.x), f32(uniform.uTextureSize.y), f32(uniform.uTextureSize.y)) * 2.0 - 1.0;
        output.position = vec4f(mix(ndc.x, ndc.y, u), mix(-ndc.z, -ndc.w, v), 0.5, 1.0);
        output.vSubDraw = vec4i(sourceBase, colStart, colEnd - colStart, rowStart);
        return output;
}
`

var glslGsplatNodeCullingPS = `
uniform sampler2D boundsSphereTexture;
uniform usampler2D boundsTransformIndexTexture;
uniform sampler2D transformsTexture;
uniform int boundsTextureWidth;
uniform int transformsTextureWidth;
uniform int totalBoundsEntries;
uniform vec4 frustumPlanes[6];
void main(void) {
        int visWidth = boundsTextureWidth / 32;
        int texelIndex = int(gl_FragCoord.y) * visWidth + int(gl_FragCoord.x);
        int baseIndex = texelIndex * 32;
        int baseX = baseIndex % boundsTextureWidth;
        int boundsY = baseIndex / boundsTextureWidth;
        uint visBits = 0u;
        uint cachedTransformIdx = 0xFFFFFFFFu;
        mat4 worldMatrix;
        vec4 row0, row1, row2;
        for (int b = 0; b < 32; b++) {
                int sphereIndex = baseIndex + b;
                if (sphereIndex >= totalBoundsEntries) break;
                ivec2 boundsCoord = ivec2(baseX + b, boundsY);
                vec4 sphere = texelFetch(boundsSphereTexture, boundsCoord, 0);
                vec3 localCenter = sphere.xyz;
                float radius = sphere.w;
                uint transformIdx = texelFetch(boundsTransformIndexTexture, boundsCoord, 0).r;
                if (transformIdx != cachedTransformIdx) {
                        cachedTransformIdx = transformIdx;
                        int baseTexel = int(transformIdx) * 3;
                        int tx = baseTexel % transformsTextureWidth;
                        int ty = baseTexel / transformsTextureWidth;
                        row0 = texelFetch(transformsTexture, ivec2(tx,	 ty), 0);
                        row1 = texelFetch(transformsTexture, ivec2(tx + 1, ty), 0);
                        row2 = texelFetch(transformsTexture, ivec2(tx + 2, ty), 0);
                        worldMatrix = mat4(
                                row0.x, row1.x, row2.x, 0,
                                row0.y, row1.y, row2.y, 0,
                                row0.z, row1.z, row2.z, 0,
                                row0.w, row1.w, row2.w, 1
                        );
                }
                vec3 worldCenter = (worldMatrix * vec4(localCenter, 1.0)).xyz;
                float worldRadius = radius * length(vec3(row0.x, row1.x, row2.x));
                bool visible = true;
                for (int p = 0; p < 6; p++) {
                        float dist = dot(frustumPlanes[p].xyz, worldCenter) + frustumPlanes[p].w;
                        if (dist <= -worldRadius) {
                                visible = false;
                                break;
                        }
                }
                if (visible) {
                        visBits |= (1u << uint(b));
                }
        }
        gl_FragColor = visBits;
}
`

var wgslGsplatNodeCullingPS = `
var boundsSphereTexture: texture_2d<f32>;
var boundsTransformIndexTexture: texture_2d<u32>;
var transformsTexture: texture_2d<f32>;
uniform boundsTextureWidth: i32;
uniform transformsTextureWidth: i32;
uniform totalBoundsEntries: i32;
uniform frustumPlanes: array<vec4f, 6>;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
        var output: FragmentOutput;
        let visWidth = uniform.boundsTextureWidth / 32;
        let texelIndex = i32(input.position.y) * visWidth + i32(input.position.x);
        let baseIndex = texelIndex * 32;
        let baseX = baseIndex % uniform.boundsTextureWidth;
        let boundsY = baseIndex / uniform.boundsTextureWidth;
        var visBits = 0u;
        var cachedTransformIdx = 0xFFFFFFFFu;
        var row0: vec4f;
        var row1: vec4f;
        var row2: vec4f;
        var worldMatrix: mat4x4f;
        for (var b = 0; b < 32; b++) {
                let sphereIndex = baseIndex + b;
                if (sphereIndex >= uniform.totalBoundsEntries) { break; }
                let boundsCoord = vec2i(baseX + b, boundsY);
                let sphere = textureLoad(boundsSphereTexture, boundsCoord, 0);
                let localCenter = sphere.xyz;
                let radius = sphere.w;
                let transformIdx = textureLoad(boundsTransformIndexTexture, boundsCoord, 0).r;
                if (transformIdx != cachedTransformIdx) {
                        cachedTransformIdx = transformIdx;
                        let baseTexel = i32(transformIdx) * 3;
                        let tx = baseTexel % uniform.transformsTextureWidth;
                        let ty = baseTexel / uniform.transformsTextureWidth;
                        row0 = textureLoad(transformsTexture, vec2i(tx,	 ty), 0);
                        row1 = textureLoad(transformsTexture, vec2i(tx + 1, ty), 0);
                        row2 = textureLoad(transformsTexture, vec2i(tx + 2, ty), 0);
                        worldMatrix = mat4x4f(
                                row0.x, row1.x, row2.x, 0,
                                row0.y, row1.y, row2.y, 0,
                                row0.z, row1.z, row2.z, 0,
                                row0.w, row1.w, row2.w, 1.0
                        );
                }
                let worldCenter = (worldMatrix * vec4f(localCenter, 1.0)).xyz;
                let worldRadius = radius * length(vec3f(row0.x, row1.x, row2.x));
                var visible = true;
                for (var p = 0; p < 6; p++) {
                        let plane = uniform.frustumPlanes[p];
                        let dist = dot(plane.xyz, worldCenter) + plane.w;
                        if (dist <= -worldRadius) {
                                visible = false;
                                break;
                        }
                }
                if (visible) {
                        visBits |= (1u << u32(b));
                }
        }
        output.color = visBits;
        return output;
}
`

class GSplatNodeCullRenderPass extends RenderPassShaderQuad {
    setup(boundsSphereTexture, boundsTransformIndexTexture, transformsTexture, totalBoundsEntries, frustumPlanes) {
        this._boundsSphereTexture = boundsSphereTexture
        this._boundsTransformIndexTexture = boundsTransformIndexTexture
        this._transformsTexture = transformsTexture
        this._totalBoundsEntries = totalBoundsEntries
        this._frustumPlanes = frustumPlanes
    }
    execute() {
        this.boundsSphereTextureId.setValue(this._boundsSphereTexture)
        this.boundsTransformIndexTextureId.setValue(this._boundsTransformIndexTexture)
        this.transformsTextureId.setValue(this._transformsTexture)
        this.boundsTextureWidthId.setValue(this._boundsSphereTexture.width)
        this.transformsTextureWidthId.setValue(this._transformsTexture.width)
        this.totalBoundsEntriesId.setValue(this._totalBoundsEntries)
        this.frustumPlanesId.setValue(this._frustumPlanes)
        super.execute()
    }
    constructor(device) {
        ;(super(device), (this._totalBoundsEntries = 0))
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'GSplatNodeCulling',
            attributes: {
                aPosition: SEMANTIC_POSITION,
            },
            vertexChunk: 'quadVS',
            fragmentGLSL: glslGsplatNodeCullingPS,
            fragmentWGSL: wgslGsplatNodeCullingPS,
            fragmentOutputTypes: ['uint'],
        })
        this.boundsSphereTextureId = device.scope.resolve('boundsSphereTexture')
        this.boundsTransformIndexTextureId = device.scope.resolve('boundsTransformIndexTexture')
        this.transformsTextureId = device.scope.resolve('transformsTexture')
        this.boundsTextureWidthId = device.scope.resolve('boundsTextureWidth')
        this.transformsTextureWidthId = device.scope.resolve('transformsTextureWidth')
        this.totalBoundsEntriesId = device.scope.resolve('totalBoundsEntries')
        this.frustumPlanesId = device.scope.resolve('frustumPlanes[0]')
    }
}

const _viewMat = new Mat4()
const _modelScale = new Vec3()
const _modelRotation = new Quat()
const _tmpSize = new Vec2()
const _whiteColor = [1, 1, 1]
class GSplatWorkBufferRenderPass extends RenderPass {
    destroy() {
        this.splats.length = 0
        this._subDrawTexture.destroy()
        super.destroy()
    }
    init(renderTarget) {
        super.init(renderTarget)
        this.colorOps.clear = false
        this.depthStencilOps.clearDepth = false
    }
    update(splats, cameraNode, colorsByLod, changedAllocIds = null) {
        this.splats.length = 0
        this._partialData.length = 0
        this.colorsByLod = colorsByLod
        const textureWidth = this.workBuffer.textureSize
        if (changedAllocIds) {
            const requiredCapacity = changedAllocIds.size * 3
            if (this._subDrawTexture.width * this._subDrawTexture.height < requiredCapacity) {
                TextureUtils.calcTextureSize(requiredCapacity, _tmpSize)
                this._subDrawTexture.resize(_tmpSize.x, _tmpSize.y)
            }
            const texData = this._subDrawTexture.lock()
            let writeOffset = 0
            for (let i = 0; i < splats.length; i++) {
                const splatInfo = splats[i]
                if (splatInfo.activeSplats <= 0) continue
                const intervals = splatInfo.intervals
                const numIntervals = intervals.length / 2
                if (numIntervals === 0) {
                    if (changedAllocIds.has(splatInfo.allocId)) {
                        this.splats.push(splatInfo)
                        this._partialData.push(0, 0)
                    }
                } else {
                    const baseOffset = writeOffset
                    const allocIds = splatInfo.intervalAllocIds
                    for (let j = 0; j < numIntervals; j++) {
                        if (changedAllocIds.has(allocIds[j])) {
                            writeOffset = splatInfo.appendSubDraws(
                                texData,
                                writeOffset,
                                intervals[j * 2],
                                intervals[j * 2 + 1] - intervals[j * 2],
                                splatInfo.intervalOffsets[j],
                                textureWidth,
                            )
                        }
                    }
                    const count = writeOffset - baseOffset
                    if (count > 0) {
                        this.splats.push(splatInfo)
                        this._partialData.push(baseOffset, count)
                    }
                }
            }
            this._subDrawTexture.unlock()
        } else {
            for (let i = 0; i < splats.length; i++) {
                const splatInfo = splats[i]
                if (splatInfo.activeSplats > 0) {
                    this.splats.push(splatInfo)
                    this._partialData.push(0, 0)
                }
            }
        }
        for (let i = 0; i < this.splats.length; i++) {
            if (this._partialData[i * 2 + 1] === 0) {
                this.splats[i].ensureSubDrawTexture(textureWidth)
            }
        }
        this.cameraNode = cameraNode
        return this.splats.length > 0
    }
    execute() {
        const { device, splats, cameraNode, _partialData } = this
        device.setDrawStates()
        const viewInvMat = cameraNode.getWorldTransform()
        const viewMat = _viewMat.copy(viewInvMat).invert()
        device.scope.resolve('matrix_view').setValue(viewMat.data)
        for (let i = 0; i < splats.length; i++) {
            const count = _partialData[i * 2 + 1]
            if (count > 0) {
                this.renderSplat(splats[i], this._subDrawTexture, count, _partialData[i * 2])
            } else {
                this.renderSplat(splats[i])
            }
        }
    }
    renderSplat(splatInfo, overrideSubDrawTexture, overrideSubDrawCount, subDrawBase = 0) {
        const { device, resource } = splatInfo
        const scope = device.scope
        const subDrawTexture = overrideSubDrawTexture ?? splatInfo.subDrawTexture
        const subDrawCount = overrideSubDrawCount ?? splatInfo.subDrawCount
        const workBufferModifier = splatInfo.getWorkBufferModifier?.() ?? null
        const formatHash = resource.format.hash
        const formatDeclarations = resource.format.getInputDeclarations()
        const workBufferRenderInfo = resource.getWorkBufferRenderInfo(
            this.colorOnly,
            workBufferModifier,
            formatHash,
            formatDeclarations,
            this.workBuffer.format,
        )
        workBufferRenderInfo.material.setParameters(device)
        const color = this.colorsByLod?.[splatInfo.lodIndex] ?? this.colorsByLod?.[0] ?? _whiteColor
        scope.resolve('uColorMultiply').setValue(color)
        const worldTransform = splatInfo.node.getWorldTransform()
        worldTransform.getScale(_modelScale)
        _modelRotation.setFromMat4(worldTransform)
        if (_modelRotation.w < 0) {
            _modelRotation.mulScalar(-1)
        }
        this._modelScaleData[0] = _modelScale.x
        this._modelScaleData[1] = _modelScale.y
        this._modelScaleData[2] = _modelScale.z
        this._modelRotationData[0] = _modelRotation.x
        this._modelRotationData[1] = _modelRotation.y
        this._modelRotationData[2] = _modelRotation.z
        this._modelRotationData[3] = _modelRotation.w
        scope.resolve('matrix_model').setValue(worldTransform.data)
        scope.resolve('model_scale').setValue(this._modelScaleData)
        scope.resolve('model_rotation').setValue(this._modelRotationData)
        scope.resolve('uId').setValue(splatInfo.placementId)
        scope.resolve('uBoundsBaseIndex').setValue(splatInfo.boundsBaseIndex)
        if (splatInfo.parameters) {
            for (const param of splatInfo.parameters.values()) {
                param.scopeId.setValue(param.data)
            }
        }
        const instanceStreams = splatInfo.getInstanceStreams?.()
        if (instanceStreams) {
            instanceStreams.syncWithFormat(splatInfo.resource.format)
            for (const [name, texture] of instanceStreams.textures) {
                scope.resolve(name).setValue(texture)
            }
        }
        scope.resolve('uSubDrawData').setValue(subDrawTexture)
        scope.resolve('uSubDrawBase').setValue(subDrawBase)
        const ts = this.workBuffer.textureSize
        this._textureSize[0] = ts
        this._textureSize[1] = ts
        scope.resolve('uTextureSize').setValue(this._textureSize)
        workBufferRenderInfo.quadRender.render(undefined, undefined, subDrawCount)
    }
    constructor(device, workBuffer, colorOnly = false) {
        ;(super(device),
            (this.splats = []),
            (this.colorsByLod = undefined),
            (this.cameraNode = null),
            (this._modelScaleData = new Float32Array(3)),
            (this._modelRotationData = new Float32Array(4)),
            (this._textureSize = new Int32Array(2)),
            (this._partialData = []))
        this.workBuffer = workBuffer
        this.colorOnly = colorOnly
        this._subDrawTexture = Texture.createDataTexture2D(device, 'GsplatSubDrawData', 1, 1, PIXELFORMAT_RGBA32U)
    }
}

class GSplatStreams {
    get textureDimensions() {
        return this._textureDimensions
    }
    destroy() {
        for (const texture of this.textures.values()) {
            texture.destroy()
        }
        this.textures.clear()
    }
    init(format, numElements) {
        this.format = format
        this._textureDimensions = TextureUtils.calcTextureSize(numElements, new Vec2())
        const streams = this._isInstance ? format.instanceStreams : format.resourceStreams
        for (const stream of streams) {
            const texture = this.createTexture(stream.name, stream.format, this._textureDimensions)
            this.textures.set(stream.name, texture)
        }
        this._formatVersion = format.extraStreamsVersion
    }
    getTexture(name) {
        this.syncWithFormat(this.format)
        return this.textures.get(name)
    }
    getTexturesInOrder() {
        const result = []
        if (this.format) {
            const allStreams = this._isInstance ? this.format.instanceStreams : this.format.resourceStreams
            for (const stream of allStreams) {
                const texture = this.textures.get(stream.name)
                if (texture) {
                    result.push(texture)
                }
            }
        }
        return result
    }
    syncWithFormat(format) {
        if (format) {
            if (this.format === format && this._formatVersion === format.extraStreamsVersion) {
                return
            }
            this.format = format
            const streams = this._isInstance ? format.instanceStreams : format.resourceStreams
            for (const stream of streams) {
                if (!this.textures.has(stream.name)) {
                    const texture = this.createTexture(stream.name, stream.format, this._textureDimensions)
                    this.textures.set(stream.name, texture)
                }
            }
            this._formatVersion = format.extraStreamsVersion
        }
    }
    resize(width, height) {
        this._textureDimensions.set(width, height)
        for (const texture of this.textures.values()) {
            texture.resize(width, height)
        }
    }
    createTexture(name, format, size, data) {
        return Texture.createDataTexture2D(this.device, name, size.x, size.y, format, data ? [data] : undefined)
    }
    constructor(device, isInstance = false) {
        this.format = null
        this.textures = new Map()
        this._textureDimensions = new Vec2()
        this._isInstance = false
        this._formatVersion = -1
        this.device = device
        this._isInstance = isInstance
    }
}

let id$1 = 0
const tmpSize$1 = new Vec2()
const _viewProjMat = new Mat4()
const _frustum = new Frustum()
const _frustumPlanes = new Float32Array(24)
class WorkBufferRenderInfo {
    destroy() {
        this.material?.destroy()
        this.quadRender?.destroy()
    }
    constructor(device, key, material, colorOnly, format) {
        this.material = material
        const clonedDefines = new Map(material.defines)
        const colorStream = format.getStream('dataColor')
        if (colorStream.format === PIXELFORMAT_RGBA16U) {
            clonedDefines.set('GSPLAT_COLOR_UINT', '')
        }
        if (colorOnly) {
            clonedDefines.set('GSPLAT_COLOR_ONLY', '')
        }
        if (format.getStream('pcId')) {
            clonedDefines.set('GSPLAT_ID', '')
        }
        if (format.getStream('pcNodeIndex')) {
            clonedDefines.set('GSPLAT_NODE_INDEX', '')
        }
        const fragmentIncludes = material.hasShaderChunks
            ? device.isWebGPU
                ? material.shaderChunks.wgsl
                : material.shaderChunks.glsl
            : undefined
        const outputStreams = colorOnly ? [colorStream] : [...format.streams, ...format.extraStreams]
        const fragmentOutputTypes = []
        for (const stream of outputStreams) {
            const info = getGlslShaderType(stream.format)
            fragmentOutputTypes.push(info.returnType)
        }
        const useInstanced = clonedDefines.has('GSPLAT_LOD')
        const shaderOptions = {
            uniqueName: `SplatCopyToWorkBuffer:${key}`,
            attributes: {
                vertex_position: SEMANTIC_POSITION,
            },
            vertexDefines: clonedDefines,
            fragmentDefines: clonedDefines,
            fragmentGLSL: glslGsplatCopyToWorkBufferPS,
            fragmentWGSL: wgslGsplatCopyToWorkBufferPS,
            fragmentIncludes: fragmentIncludes,
            fragmentOutputTypes: fragmentOutputTypes,
        }
        if (useInstanced) {
            shaderOptions.vertexGLSL = glslGsplatCopyInstancedQuadVS
            shaderOptions.vertexWGSL = wgslGsplatCopyInstancedQuadVS
        } else {
            shaderOptions.vertexChunk = 'fullscreenQuadVS'
        }
        const shader = ShaderUtils.createShader(device, shaderOptions)
        this.quadRender = new QuadRender(shader)
    }
}
class GSplatWorkBuffer {
    _createRenderTargets() {
        this.renderTarget?.destroy()
        this.colorRenderTarget?.destroy()
        const colorBuffers = this.streams.getTexturesInOrder()
        this.renderTarget = new RenderTarget({
            name: `GsplatWorkBuffer-MRT-${this.id}`,
            colorBuffers: colorBuffers,
            depth: false,
            flipY: true,
        })
        const colorTexture = this.streams.getTexture('dataColor')
        this.colorRenderTarget = new RenderTarget({
            name: `GsplatWorkBuffer-Color-${this.id}`,
            colorBuffer: colorTexture,
            depth: false,
            flipY: true,
        })
        this.renderPass?.init(this.renderTarget)
        this.colorRenderPass?.init(this.colorRenderTarget)
    }
    syncWithFormat() {
        const prevVersion = this.streams._formatVersion
        this.streams.syncWithFormat(this.format)
        if (prevVersion !== this.streams._formatVersion) {
            this._createRenderTargets()
        }
    }
    getTexture(name) {
        return this.streams.getTexture(name)
    }
    destroy() {
        this.renderPass?.destroy()
        this.colorRenderPass?.destroy()
        this.streams.destroy()
        this.orderTexture?.destroy()
        this.orderBuffer?.destroy()
        this.renderTarget?.destroy()
        this.colorRenderTarget?.destroy()
        this.uploadStream.destroy()
        this.boundsSphereTexture?.destroy()
        this.boundsTransformIndexTexture?.destroy()
        this.nodeVisibilityTexture?.destroy()
        this.cullingRenderTarget?.destroy()
        this.cullingPass?.destroy()
        this.transformsTexture?.destroy()
    }
    get textureSize() {
        return this.streams.textureDimensions.x
    }
    setOrderData(data) {
        this.textureSize
        if (this.device.isWebGPU) {
            this.uploadStream.upload(data, this.orderBuffer, 0, data.length)
        } else {
            this.uploadStream.upload(data, this.orderTexture, 0, data.length)
        }
    }
    resize(textureSize) {
        this.renderTarget.resize(textureSize, textureSize)
        this.colorRenderTarget.resize(textureSize, textureSize)
        this.streams.resize(textureSize, textureSize)
        if (this.device.isWebGPU) {
            const newByteSize = textureSize * textureSize * 4
            if (this.orderBuffer.byteSize < newByteSize) {
                this.orderBuffer.destroy()
                this.orderBuffer = new StorageBuffer(this.device, newByteSize, BUFFERUSAGE_COPY_DST)
            }
        } else {
            this.orderTexture.resize(textureSize, textureSize)
        }
    }
    render(splats, cameraNode, colorsByLod, changedAllocIds = null) {
        if (this.renderPass.update(splats, cameraNode, colorsByLod, changedAllocIds)) {
            this.renderPass.render()
        }
    }
    renderColor(splats, cameraNode, colorsByLod) {
        if (this.colorRenderPass.update(splats, cameraNode, colorsByLod)) {
            this.colorRenderPass.render()
        }
    }
    updateBoundsTexture(boundsGroups) {
        let totalEntries = 0
        for (let i = 0; i < boundsGroups.length; i++) {
            totalEntries += boundsGroups[i].numBoundsEntries
        }
        this.totalBoundsEntries = totalEntries
        if (totalEntries === 0) return
        const { x: width, y: height } = TextureUtils.calcTextureSize(totalEntries, tmpSize$1, 32)
        if (!this.boundsSphereTexture) {
            this.boundsSphereTexture = Texture.createDataTexture2D(
                this.device,
                'boundsSphereTexture',
                width,
                height,
                PIXELFORMAT_RGBA32F,
            )
        } else {
            this.boundsSphereTexture.resize(width, height)
        }
        if (!this.boundsTransformIndexTexture) {
            this.boundsTransformIndexTexture = Texture.createDataTexture2D(
                this.device,
                'boundsTransformIndexTexture',
                width,
                height,
                PIXELFORMAT_R32U,
            )
        } else {
            this.boundsTransformIndexTexture.resize(width, height)
        }
        const sphereData = this.boundsSphereTexture.lock()
        const indexData = this.boundsTransformIndexTexture.lock()
        for (let i = 0; i < boundsGroups.length; i++) {
            const group = boundsGroups[i]
            const base = group.boundsBaseIndex
            const count = group.numBoundsEntries
            group.splat.writeBoundsSpheres(sphereData, base * 4)
            for (let j = 0; j < count; j++) {
                indexData[base + j] = i
            }
        }
        this.boundsSphereTexture.unlock()
        this.boundsTransformIndexTexture.unlock()
    }
    updateTransformsTexture(boundsGroups) {
        const numMatrices = boundsGroups.length
        if (numMatrices === 0) return
        const totalTexels = numMatrices * 3
        const { x: width, y: height } = TextureUtils.calcTextureSize(totalTexels, tmpSize$1, 3)
        if (!this.transformsTexture) {
            this.transformsTexture = Texture.createDataTexture2D(
                this.device,
                'transformsTexture',
                width,
                height,
                PIXELFORMAT_RGBA32F,
            )
        } else {
            this.transformsTexture.resize(width, height)
        }
        const data = this.transformsTexture.lock()
        let offset = 0
        for (let i = 0; i < boundsGroups.length; i++) {
            const m = boundsGroups[i].splat.node.getWorldTransform().data
            data[offset++] = m[0]
            data[offset++] = m[4]
            data[offset++] = m[8]
            data[offset++] = m[12]
            data[offset++] = m[1]
            data[offset++] = m[5]
            data[offset++] = m[9]
            data[offset++] = m[13]
            data[offset++] = m[2]
            data[offset++] = m[6]
            data[offset++] = m[10]
            data[offset++] = m[14]
        }
        this.transformsTexture.unlock()
    }
    updateNodeVisibility(projectionMatrix, viewMatrix) {
        if (
            this.totalBoundsEntries === 0 ||
            !this.boundsSphereTexture ||
            !this.boundsTransformIndexTexture ||
            !this.transformsTexture
        ) {
            return
        }
        _viewProjMat.mul2(projectionMatrix, viewMatrix)
        _frustum.setFromMat4(_viewProjMat)
        for (let p = 0; p < 6; p++) {
            const plane = _frustum.planes[p]
            _frustumPlanes[p * 4 + 0] = plane.normal.x
            _frustumPlanes[p * 4 + 1] = plane.normal.y
            _frustumPlanes[p * 4 + 2] = plane.normal.z
            _frustumPlanes[p * 4 + 3] = plane.distance
        }
        const width = this.boundsSphereTexture.width / 32
        const height = this.boundsSphereTexture.height
        if (!this.nodeVisibilityTexture) {
            this.nodeVisibilityTexture = Texture.createDataTexture2D(
                this.device,
                'nodeVisibilityTexture',
                width,
                height,
                PIXELFORMAT_R32U,
            )
            this.cullingRenderTarget = new RenderTarget({
                name: 'NodeCullingRT',
                colorBuffer: this.nodeVisibilityTexture,
                depth: false,
            })
        } else if (this.nodeVisibilityTexture.width !== width || this.nodeVisibilityTexture.height !== height) {
            this.nodeVisibilityTexture.resize(width, height)
            this.cullingRenderTarget.resize(width, height)
        }
        if (!this.cullingPass) {
            this.cullingPass = new GSplatNodeCullRenderPass(this.device)
            this.cullingPass.init(this.cullingRenderTarget)
            this.cullingPass.colorOps.clear = true
            this.cullingPass.colorOps.clearValue.set(0, 0, 0, 0)
        }
        this.cullingPass.setup(
            this.boundsSphereTexture,
            this.boundsTransformIndexTexture,
            this.transformsTexture,
            this.totalBoundsEntries,
            _frustumPlanes,
        )
        this.cullingPass.render()
    }
    constructor(device, format) {
        this.id = id$1++
        this.boundsSphereTexture = null
        this.boundsTransformIndexTexture = null
        this.nodeVisibilityTexture = null
        this.cullingRenderTarget = null
        this.cullingPass = null
        this.totalBoundsEntries = 0
        this.transformsTexture = null
        this.device = device
        this.format = format
        this.streams = new GSplatStreams(device)
        this.streams.init(format, 1)
        this._createRenderTargets()
        this.uploadStream = new UploadStream(device)
        if (device.isWebGPU) {
            this.orderBuffer = new StorageBuffer(device, 4, BUFFERUSAGE_COPY_DST)
        } else {
            this.orderTexture = new Texture(device, {
                name: 'SplatGlobalOrder',
                width: 1,
                height: 1,
                format: PIXELFORMAT_R32U,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE,
            })
        }
        this.renderPass = new GSplatWorkBufferRenderPass(device, this)
        this.renderPass.init(this.renderTarget)
        this.colorRenderPass = new GSplatWorkBufferRenderPass(device, this, true)
        this.colorRenderPass.init(this.colorRenderTarget)
    }
}

class GSplatResourceCleanup {
    static queueDestroy(device, resource) {
        this._cache.get(device, () => new GSplatResourceCleanup())._pendingDestroy.add(resource)
    }
    static process(device) {
        const pending = this._cache.get(device, () => new GSplatResourceCleanup())._pendingDestroy
        for (const resource of pending) {
            if (resource.refCount === 0) {
                resource._actualDestroy()
                pending.delete(resource)
            }
        }
    }
    destroy() {
        this._pendingDestroy.clear()
    }
    constructor() {
        this._pendingDestroy = new Set()
    }
}
GSplatResourceCleanup._cache = new DeviceCache()

let id = 0
const tempMap = new Map()
class GSplatResourceBase {
    destroy() {
        if (this.refCount > 0) {
            GSplatResourceCleanup.queueDestroy(this.device, this)
            return
        }
        this._actualDestroy()
    }
    _actualDestroy() {
        this.streams.destroy()
        this.mesh?.destroy()
        this.instanceIndices?.destroy()
        this.workBufferRenderInfos.forEach((info) => info.destroy())
        this.workBufferRenderInfos.clear()
    }
    incRefCount() {
        this._refCount++
    }
    decRefCount() {
        this._refCount--
    }
    get refCount() {
        return this._refCount
    }
    ensureMesh() {
        if (!this.mesh) {
            this.mesh = GSplatResourceBase.createMesh(this.device)
            this.mesh.aabb.copy(this.aabb)
            this.instanceIndices = GSplatResourceBase.createInstanceIndices(this.device, this.gsplatData.numSplats)
        }
        this._meshRefCount++
    }
    releaseMesh() {
        this._meshRefCount--
        if (this._meshRefCount < 1) {
            this.mesh = null
            this.instanceIndices?.destroy()
            this.instanceIndices = null
        }
    }
    getWorkBufferRenderInfo(colorOnly, workBufferModifier, formatHash, formatDeclarations, workBufferFormat) {
        this.configureMaterialDefines(tempMap)
        tempMap.set('GSPLAT_LOD', '')
        if (colorOnly) tempMap.set('GSPLAT_COLOR_ONLY', '')
        if (this.streams.textures.has('nodeMappingTexture')) {
            tempMap.set('HAS_NODE_MAPPING', '')
        }
        let definesKey = ''
        for (const [k, v] of tempMap) {
            if (definesKey) definesKey += ';'
            definesKey += `${k}=${v}`
        }
        const key = `${formatHash};${workBufferFormat.hash};${workBufferModifier?.hash ?? 0};${definesKey}`
        let info = this.workBufferRenderInfos.get(key)
        if (!info) {
            const material = new ShaderMaterial()
            this.configureMaterial(material, workBufferModifier, formatDeclarations)
            const chunks = this.device.isWebGPU ? material.shaderChunks.wgsl : material.shaderChunks.glsl
            const outputStreams = colorOnly
                ? [workBufferFormat.getStream('dataColor')]
                : [...workBufferFormat.streams, ...workBufferFormat.extraStreams]
            let outputCode = workBufferFormat.getOutputDeclarations(outputStreams)
            if (colorOnly && workBufferFormat.extraStreams.length > 0) {
                outputCode += `\n${workBufferFormat.getOutputStubs(workBufferFormat.extraStreams)}`
            }
            chunks.set('gsplatWorkBufferOutputVS', outputCode)
            const writeCode = workBufferFormat.getWriteCode()
            if (writeCode) {
                chunks.set('gsplatWriteVS', writeCode)
            }
            tempMap.forEach((v, k) => material.setDefine(k, v))
            info = new WorkBufferRenderInfo(this.device, key, material, colorOnly, workBufferFormat)
            this.workBufferRenderInfos.set(key, info)
        }
        tempMap.clear()
        return info
    }
    static createMesh(device) {
        const splatInstanceSize = GSplatResourceBase.instanceSize
        const meshPositions = new Float32Array(12 * splatInstanceSize)
        const meshIndices = new Uint32Array(6 * splatInstanceSize)
        for (let i = 0; i < splatInstanceSize; ++i) {
            meshPositions.set([-1, -1, i, 1, -1, i, 1, 1, i, -1, 1, i], i * 12)
            const b = i * 4
            meshIndices.set([0 + b, 1 + b, 2 + b, 0 + b, 2 + b, 3 + b], i * 6)
        }
        const mesh = new Mesh(device)
        mesh.setPositions(meshPositions, 3)
        mesh.setIndices(meshIndices)
        mesh.update()
        return mesh
    }
    static createInstanceIndices(device, splatCount) {
        const splatInstanceSize = GSplatResourceBase.instanceSize
        const numSplats = Math.ceil(splatCount / splatInstanceSize) * splatInstanceSize
        const numSplatInstances = numSplats / splatInstanceSize
        const indexData = new Uint32Array(numSplatInstances)
        for (let i = 0; i < numSplatInstances; ++i) {
            indexData[i] = i * splatInstanceSize
        }
        const vertexFormat = new VertexFormat(device, [
            {
                semantic: SEMANTIC_ATTR13,
                components: 1,
                type: TYPE_UINT32,
                asInt: true,
            },
        ])
        const instanceIndices = new VertexBuffer(device, vertexFormat, numSplatInstances, {
            usage: BUFFER_STATIC,
            data: indexData.buffer,
        })
        return instanceIndices
    }
    static get instanceSize() {
        return 128
    }
    get numSplats() {
        return this.gsplatData.numSplats
    }
    get format() {
        return this._format
    }
    getTexture(name) {
        return this.streams.getTexture(name) ?? null
    }
    get textureDimensions() {
        return this.streams.textureDimensions
    }
    configureMaterial(material, workBufferModifier, formatDeclarations) {
        this.configureMaterialDefines(material.defines)
        this.streams.syncWithFormat(this.format)
        const chunks = this.device.isWebGPU ? material.shaderChunks.wgsl : material.shaderChunks.glsl
        chunks.set('gsplatDeclarationsVS', formatDeclarations)
        chunks.set('gsplatReadVS', this.format.getReadCode())
        if (workBufferModifier?.code) {
            chunks.set('gsplatModifyVS', workBufferModifier.code)
        }
        for (const [name, texture] of this.streams.textures) {
            material.setParameter(name, texture)
        }
        for (const [name, value] of this.parameters) {
            material.setParameter(name, value)
        }
        if (this.textureDimensions.x > 0) {
            material.setParameter('splatTextureSize', this.textureDimensions.x)
        }
    }
    configureMaterialDefines(defines) {}
    instantiate() {}
    constructor(device, gsplatData) {
        this.centersVersion = 0
        this.mesh = null
        this.instanceIndices = null
        this.id = id++
        this.workBufferRenderInfos = new Map()
        this._format = null
        this.parameters = new Map()
        this._refCount = 0
        this._meshRefCount = 0
        this.device = device
        this.gsplatData = gsplatData
        this.streams = new GSplatStreams(device)
        this.centers = gsplatData.getCenters()
        this.aabb = new BoundingBox()
        gsplatData.calcAabb(this.aabb)
    }
}

const mat4 = new Mat4()
const quat$1 = new Quat()
const aabb = new BoundingBox()
const aabb2 = new BoundingBox()
const debugColor = new Color(1, 1, 0, 0.4)
const SH_C0$2 = 0.28209479177387814
class SplatIterator {
    constructor(gsplatData, p, r, s, c) {
        const x = gsplatData.getProp('x')
        const y = gsplatData.getProp('y')
        const z = gsplatData.getProp('z')
        const rx = gsplatData.getProp('rot_1')
        const ry = gsplatData.getProp('rot_2')
        const rz = gsplatData.getProp('rot_3')
        const rw = gsplatData.getProp('rot_0')
        const sx = gsplatData.getProp('scale_0')
        const sy = gsplatData.getProp('scale_1')
        const sz = gsplatData.getProp('scale_2')
        const cr = gsplatData.getProp('f_dc_0')
        const cg = gsplatData.getProp('f_dc_1')
        const cb = gsplatData.getProp('f_dc_2')
        const ca = gsplatData.getProp('opacity')
        const sigmoid = (v) => {
            if (v > 0) {
                return 1 / (1 + Math.exp(-v))
            }
            const t = Math.exp(v)
            return t / (1 + t)
        }
        this.read = (i) => {
            if (p) {
                p.x = x[i]
                p.y = y[i]
                p.z = z[i]
            }
            if (r) {
                r.set(rx[i], ry[i], rz[i], rw[i])
            }
            if (s) {
                s.set(Math.exp(sx[i]), Math.exp(sy[i]), Math.exp(sz[i]))
            }
            if (c) {
                c.set(0.5 + cr[i] * SH_C0$2, 0.5 + cg[i] * SH_C0$2, 0.5 + cb[i] * SH_C0$2, sigmoid(ca[i]))
            }
        }
    }
}
const calcSplatMat = (result, p, r) => {
    quat$1.set(r.x, r.y, r.z, r.w).normalize()
    result.setTRS(p, quat$1, Vec3.ONE)
}
class GSplatData {
    static calcSplatAabb(result, p, r, s) {
        calcSplatMat(mat4, p, r)
        aabb.center.set(0, 0, 0)
        aabb.halfExtents.set(s.x * 2, s.y * 2, s.z * 2)
        result.setFromTransformedAabb(aabb, mat4)
    }
    getProp(name, elementName = 'vertex') {
        return this.getElement(elementName)?.properties.find((p) => p.name === name)?.storage
    }
    getElement(name) {
        return this.elements.find((e) => e.name === name)
    }
    addProp(name, storage) {
        this.getElement('vertex').properties.push({
            type: 'float',
            name,
            storage,
            byteSize: 4,
        })
    }
    createIter(p, r, s, c) {
        return new SplatIterator(this, p, r, s, c)
    }
    calcAabb(result, pred) {
        let mx, my, mz, Mx, My, Mz
        let first = true
        const x = this.getProp('x')
        const y = this.getProp('y')
        const z = this.getProp('z')
        const sx = this.getProp('scale_0')
        const sy = this.getProp('scale_1')
        const sz = this.getProp('scale_2')
        for (let i = 0; i < this.numSplats; ++i) {
            if (pred && !pred(i)) {
                continue
            }
            const px = x[i]
            const py = y[i]
            const pz = z[i]
            const scale = Math.max(sx[i], sy[i], sz[i])
            if (!isFinite(px) || !isFinite(py) || !isFinite(pz) || !isFinite(scale)) {
                continue
            }
            const scaleVal = 2.0 * Math.exp(scale)
            if (first) {
                first = false
                mx = px - scaleVal
                my = py - scaleVal
                mz = pz - scaleVal
                Mx = px + scaleVal
                My = py + scaleVal
                Mz = pz + scaleVal
            } else {
                mx = Math.min(mx, px - scaleVal)
                my = Math.min(my, py - scaleVal)
                mz = Math.min(mz, pz - scaleVal)
                Mx = Math.max(Mx, px + scaleVal)
                My = Math.max(My, py + scaleVal)
                Mz = Math.max(Mz, pz + scaleVal)
            }
        }
        if (!first) {
            result.center.set((mx + Mx) * 0.5, (my + My) * 0.5, (mz + Mz) * 0.5)
            result.halfExtents.set((Mx - mx) * 0.5, (My - my) * 0.5, (Mz - mz) * 0.5)
        }
        return !first
    }
    calcAabbExact(result, pred) {
        const p = new Vec3()
        const r = new Quat()
        const s = new Vec3()
        const iter = this.createIter(p, r, s)
        let first = true
        for (let i = 0; i < this.numSplats; ++i) {
            if (pred && !pred(i)) {
                continue
            }
            iter.read(i)
            if (first) {
                first = false
                GSplatData.calcSplatAabb(result, p, r, s)
            } else {
                GSplatData.calcSplatAabb(aabb2, p, r, s)
                result.add(aabb2)
            }
        }
        return !first
    }
    getCenters() {
        const x = this.getProp('x')
        const y = this.getProp('y')
        const z = this.getProp('z')
        const result = new Float32Array(this.numSplats * 3)
        for (let i = 0; i < this.numSplats; ++i) {
            result[i * 3 + 0] = x[i]
            result[i * 3 + 1] = y[i]
            result[i * 3 + 2] = z[i]
        }
        return result
    }
    calcFocalPoint(result, pred) {
        const x = this.getProp('x')
        const y = this.getProp('y')
        const z = this.getProp('z')
        const sx = this.getProp('scale_0')
        const sy = this.getProp('scale_1')
        const sz = this.getProp('scale_2')
        result.x = 0
        result.y = 0
        result.z = 0
        let sum = 0
        for (let i = 0; i < this.numSplats; ++i) {
            if (pred && !pred(i)) {
                continue
            }
            const px = x[i]
            const py = y[i]
            const pz = z[i]
            if (!isFinite(px) || !isFinite(py) || !isFinite(pz)) {
                continue
            }
            const weight = 1.0 / (1.0 + Math.exp(Math.max(sx[i], sy[i], sz[i])))
            result.x += px * weight
            result.y += py * weight
            result.z += pz * weight
            sum += weight
        }
        result.mulScalar(1 / sum)
    }
    renderWireframeBounds(scene, worldMat) {
        const p = new Vec3()
        const r = new Quat()
        const s = new Vec3()
        const min = new Vec3()
        const max = new Vec3()
        const iter = this.createIter(p, r, s)
        for (let i = 0; i < this.numSplats; ++i) {
            iter.read(i)
            calcSplatMat(mat4, p, r)
            mat4.mul2(worldMat, mat4)
            min.set(s.x * -2, s.y * -2, s.z * -2)
            max.set(s.x * 2.0, s.y * 2.0, s.z * 2.0)
            scene.immediate.drawWireAlignedBox(min, max, debugColor, true, scene.defaultDrawLayer, mat4)
        }
    }
    get isCompressed() {
        return false
    }
    get shBands() {
        const numProps = () => {
            for (let i = 0; i < 45; ++i) {
                if (!this.getProp(`f_rest_${i}`)) {
                    return i
                }
            }
            return 45
        }
        const sizes = {
            9: 1,
            24: 2,
            45: 3,
        }
        return sizes[numProps()] ?? 0
    }
    calcMortonOrder() {
        const calcMinMax = (arr) => {
            let min = arr[0]
            let max = arr[0]
            for (let i = 1; i < arr.length; i++) {
                if (arr[i] < min) min = arr[i]
                if (arr[i] > max) max = arr[i]
            }
            return {
                min,
                max,
            }
        }
        const encodeMorton3 = (x, y, z) => {
            const Part1By2 = (x) => {
                x &= 0x000003ff
                x = (x ^ (x << 16)) & 0xff0000ff
                x = (x ^ (x << 8)) & 0x0300f00f
                x = (x ^ (x << 4)) & 0x030c30c3
                x = (x ^ (x << 2)) & 0x09249249
                return x
            }
            return (Part1By2(z) << 2) + (Part1By2(y) << 1) + Part1By2(x)
        }
        const x = this.getProp('x')
        const y = this.getProp('y')
        const z = this.getProp('z')
        const { min: minX, max: maxX } = calcMinMax(x)
        const { min: minY, max: maxY } = calcMinMax(y)
        const { min: minZ, max: maxZ } = calcMinMax(z)
        const sizeX = minX === maxX ? 0 : 1024 / (maxX - minX)
        const sizeY = minY === maxY ? 0 : 1024 / (maxY - minY)
        const sizeZ = minZ === maxZ ? 0 : 1024 / (maxZ - minZ)
        const codes = new Map()
        for (let i = 0; i < this.numSplats; i++) {
            const ix = Math.min(1023, Math.floor((x[i] - minX) * sizeX))
            const iy = Math.min(1023, Math.floor((y[i] - minY) * sizeY))
            const iz = Math.min(1023, Math.floor((z[i] - minZ) * sizeZ))
            const code = encodeMorton3(ix, iy, iz)
            const val = codes.get(code)
            if (val) {
                val.push(i)
            } else {
                codes.set(code, [i])
            }
        }
        const keys = Array.from(codes.keys()).sort((a, b) => a - b)
        const indices = new Uint32Array(this.numSplats)
        let idx = 0
        for (let i = 0; i < keys.length; ++i) {
            const val = codes.get(keys[i])
            for (let j = 0; j < val.length; ++j) {
                indices[idx++] = val[j]
            }
        }
        return indices
    }
    reorder(order) {
        const cache = new Map()
        const getStorage = (size) => {
            if (cache.has(size)) {
                const buffer = cache.get(size)
                cache.delete(size)
                return buffer
            }
            return new ArrayBuffer(size)
        }
        const returnStorage = (buffer) => {
            cache.set(buffer.byteLength, buffer)
        }
        const reorder = (data) => {
            const result = new data.constructor(getStorage(data.byteLength))
            for (let i = 0; i < order.length; i++) {
                result[i] = data[order[i]]
            }
            returnStorage(data.buffer)
            return result
        }
        this.elements.forEach((element) => {
            element.properties.forEach((property) => {
                if (property.storage) {
                    property.storage = reorder(property.storage)
                }
            })
        })
    }
    reorderData() {
        this.reorder(this.calcMortonOrder())
    }
    constructor(elements, comments = []) {
        this.elements = elements
        this.numSplats = this.getElement('vertex').count
        this.comments = comments
    }
}

const vertexGLSL = `
        attribute vec2 vertex_position;
        void main(void) {
                gl_Position = vec4(vertex_position, 0.0, 1.0);
        }
`
const fragmentGLSL = `
        #include "gsplatEvalSHVS"
        vec4 packRgb(vec3 v) {
                uvec3 vb = uvec3(clamp(v, vec3(0.0), vec3(1.0)) * vec3(2047.0, 2047.0, 1023.0));
                uint bits = (vb.x << 21) | (vb.y << 10) | vb.z;
                return vec4((uvec4(bits) >> uvec4(24, 16, 8, 0)) & uvec4(0xff)) / vec4(255.0);
        }
        uniform mediump vec3 dir;
        uniform mediump sampler2D centroids;
        uniform mediump float shN_mins;
        uniform mediump float shN_maxs;
        void main(void) {
                ivec2 uv = ivec2(gl_FragCoord.xy) * ivec2(SH_COEFFS, 1);
                mediump vec3 coefficients[SH_COEFFS];
                for (int i = 0; i < SH_COEFFS; i++) {
                        vec3 s = texelFetch(centroids, ivec2(uv.x + i, uv.y), 0).xyz;
                        coefficients[i] = mix(vec3(shN_mins), vec3(shN_maxs), s);
                }
                gl_FragColor = packRgb(evalSH(coefficients, dir) * 0.25 + 0.5);
        }
`
const vertexWGSL = `
        attribute vertex_position: vec2f;
        @vertex
        fn vertexMain(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                output.position = vec4f(vertex_position, 0.0, 1.0);
                return output;
        }
`
const fragmentWGSL = `
        #include "gsplatEvalSHVS"
        fn packRgb(v: vec3f) -> vec4f {
                let vb = vec3u(clamp(v, vec3f(0.0), vec3f(1.0)) * vec3f(2047.0, 2047.0, 1023.0));
                let bits = dot(vb, vec3u(1 << 21, 1 << 10, 1));
                return vec4f((vec4u(bits) >> vec4u(24, 16, 8, 0)) & vec4u(0xff)) / vec4f(255.0);
        }
        uniform dir: vec3f;
        uniform shN_mins: f32;
        uniform shN_maxs: f32;
        var centroids: texture_2d<f32>;
        @fragment
        fn fragmentMain(input: FragmentInput) -> FragmentOutput {
                var output: FragmentOutput;
                var uv = vec2i(input.position.xy) * vec2i(SH_COEFFS, 1);
                var coefficients: array<vec3f, SH_COEFFS>;
                for (var i: i32 = 0; i < SH_COEFFS; i++) {
                        let s: vec3f = textureLoad(centroids, vec2i(uv.x + i, uv.y), 0).xyz;
                        coefficients[i] = mix(vec3f(uniform.shN_mins), vec3f(uniform.shN_maxs), s);
                }
                output.color = packRgb(evalSH(&coefficients, uniform.dir) * 0.25 + 0.5);
                return output;
        }
`
const gsplatSogColorGLSL = `
        uniform mediump sampler2D sh0;
        uniform highp sampler2D sh_labels;
        uniform mediump sampler2D sh_result;
        uniform vec4 sh0_mins;
        uniform vec4 sh0_maxs;
        float SH_C0 = 0.28209479177387814;
        vec3 unpackRgb(vec4 v) {
                uvec4 uv = uvec4(v * 255.0);
                uint bits = (uv.x << 24) | (uv.y << 16) | (uv.z << 8) | uv.w;
                uvec3 vb = (uvec3(bits) >> uvec3(21, 10, 0)) & uvec3(0x7ffu, 0x7ffu, 0x3ffu);
                return vec3(vb) / vec3(2047.0, 2047.0, 1023.0);
        }
        vec4 getColor(in SplatSource source) {
                vec4 baseSample = mix(sh0_mins, sh0_maxs, texelFetch(sh0, source.uv, 0));
                vec4 base = vec4(vec3(0.5) + baseSample.xyz * SH_C0, 1.0 / (1.0 + exp(-baseSample.w)));
                ivec2 labelSample = ivec2(texelFetch(sh_labels, source.uv, 0).xy * 255.0);
                int n = labelSample.x + labelSample.y * 256;
                vec4 shSample = texelFetch(sh_result, ivec2(n % 64, n / 64), 0);
                vec3 sh = (unpackRgb(shSample) - vec3(0.5)) * 4.0;
                return vec4(base.xyz + sh, base.w);
        }
`
const gsplatSogColorWGSL = `
        var sh0: texture_2d<f32>;
        var sh_labels: texture_2d<f32>;
        var sh_result: texture_2d<f32>;
        uniform sh0_mins: vec4f;
        uniform sh0_maxs: vec4f;
        const SH_C0: f32 = 0.28209479177387814;
        fn unpackRgb(v: vec4f) -> vec3f {
                let bits = dot(vec4u(v * 255.0), vec4u(1u << 24, 1u << 16, 1u << 8, 1u));
                let vb = (vec3u(bits) >> vec3u(21, 10, 0)) & vec3u(0x7ffu, 0x7ffu, 0x3ffu);
                return vec3f(vb) / vec3f(2047.0, 2047.0, 1023.0);
        }
        fn getColor(source: ptr<function, SplatSource>) -> vec4f {
                let baseSample: vec4f = mix(uniform.sh0_mins, uniform.sh0_maxs, textureLoad(sh0, source.uv, 0));
                let base = vec4f(vec3f(0.5) + baseSample.xyz * SH_C0, 1.0 / (1.0 + exp(-baseSample.w)));
                let labelSample: vec2i = vec2i(textureLoad(sh_labels, source.uv, 0).xy * 255.0);
                let n = labelSample.x + labelSample.y * 256;
                let shSample: vec4f = textureLoad(sh_result, vec2i(n % 64, n / 64), 0);
                let sh: vec3f = (unpackRgb(shSample) - vec3f(0.5)) * 4.0;
                return vec4f(base.xyz + sh, base.w);
        }
`
const resolve$1 = (scope, values) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key])
    }
}
class CustomRenderPass extends RenderPass {
    execute() {
        this.executeCallback?.()
    }
    constructor(...args) {
        ;(super(...args), (this.executeCallback = null))
    }
}
const invModelMat$1 = new Mat4()
const dir$1 = new Vec3()
class GSplatResolveSH {
    destroy() {
        const { gsplatInstance } = this
        const { material } = gsplatInstance
        material.setDefine('SH_BANDS', gsplatInstance.resource.gsplatData.shBands.toString())
        const { shaderChunks } = material
        shaderChunks.glsl.delete('gsplatSogColorVS')
        shaderChunks.wgsl.delete('gsplatSogColorVS')
        material.update()
        this.quadRender.destroy()
        this.renderPass.destroy()
        this.renderTarget.destroy()
        this.texture.destroy()
        this.shader.destroy()
    }
    render(camera, modelMat) {
        const { prevDir, updateMode } = this
        if (updateMode === 'disable') {
            return
        }
        invModelMat$1.invert(modelMat)
        invModelMat$1.transformVector(camera.forward, dir$1)
        dir$1.normalize()
        if (updateMode === 'enable' && dir$1.equalsApprox(prevDir, 1e-3)) {
            return
        }
        prevDir.copy(dir$1)
        const execute = () => {
            const { device } = this
            const { sh_centroids, meta } = this.gsplatInstance.resource.gsplatData
            resolve$1(device.scope, {
                dir: dir$1.toArray(),
                centroids: sh_centroids,
                shN_mins: meta.shN.mins,
                shN_maxs: meta.shN.maxs,
            })
            device.setDrawStates()
            this.quadRender.render()
        }
        this.renderPass.executeCallback = execute
        this.renderPass.render()
    }
    constructor(device, gsplatInstance) {
        this.prevDir = new Vec3()
        this.updateMode = 'enable'
        this.device = device
        this.gsplatInstance = gsplatInstance
        const { resource } = gsplatInstance
        const includes = new Map(ShaderChunks.get(device, device.isWebGPU ? 'wgsl' : 'glsl'))
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'gsplatResolveSH',
            vertexGLSL,
            fragmentGLSL,
            vertexWGSL,
            fragmentWGSL,
            vertexIncludes: includes,
            fragmentIncludes: includes,
            fragmentDefines: new Map([['SH_BANDS', resource.gsplatData.shBands.toString()]]),
            attributes: {
                vertex_position: SEMANTIC_POSITION,
            },
        })
        this.texture = resource.streams.createTexture('centroids', PIXELFORMAT_RGBA8, new Vec2(64, 1024))
        this.renderTarget = new RenderTarget({
            colorBuffer: this.texture,
            depth: false,
        })
        this.renderPass = new CustomRenderPass(device)
        this.renderPass.init(this.renderTarget, {})
        this.renderPass.colorOps.clear = true
        this.quadRender = new QuadRender(this.shader)
        const { material } = gsplatInstance
        material.setDefine('SH_BANDS', '0')
        const { shaderChunks } = material
        shaderChunks.glsl.set('gsplatSogColorVS', gsplatSogColorGLSL)
        shaderChunks.wgsl.set('gsplatSogColorVS', gsplatSogColorWGSL)
        material.update()
        device.scope.resolve('sh_result').setValue(this.texture)
    }
}

function SortWorker() {
    const myself = (typeof self !== 'undefined' && self) || require('node:worker_threads').parentPort
    let order
    let centers
    let chunks
    let mapping
    let cameraPosition
    let cameraDirection
    let forceUpdate = false
    const lastCameraPosition = {
        x: 0,
        y: 0,
        z: 0,
    }
    const lastCameraDirection = {
        x: 0,
        y: 0,
        z: 0,
    }
    const boundMin = {
        x: 0,
        y: 0,
        z: 0,
    }
    const boundMax = {
        x: 0,
        y: 0,
        z: 0,
    }
    let distances
    let countBuffer
    const numBins = 32
    const binCount = new Array(numBins).fill(0)
    const binBase = new Array(numBins).fill(0)
    const binDivider = new Array(numBins).fill(0)
    const binarySearch = (m, n, compare_fn) => {
        while (m <= n) {
            const k = (n + m) >> 1
            const cmp = compare_fn(k)
            if (cmp > 0) {
                m = k + 1
            } else if (cmp < 0) {
                n = k - 1
            } else {
                return k
            }
        }
        return ~m
    }
    const update = () => {
        if (!order || !centers || centers.length === 0 || !cameraPosition || !cameraDirection) return
        const sortStartTime = performance.now()
        const px = cameraPosition.x
        const py = cameraPosition.y
        const pz = cameraPosition.z
        const dx = cameraDirection.x
        const dy = cameraDirection.y
        const dz = cameraDirection.z
        const epsilon = 0.001
        if (
            !forceUpdate &&
            Math.abs(px - lastCameraPosition.x) < epsilon &&
            Math.abs(py - lastCameraPosition.y) < epsilon &&
            Math.abs(pz - lastCameraPosition.z) < epsilon &&
            Math.abs(dx - lastCameraDirection.x) < epsilon &&
            Math.abs(dy - lastCameraDirection.y) < epsilon &&
            Math.abs(dz - lastCameraDirection.z) < epsilon
        ) {
            return
        }
        forceUpdate = false
        lastCameraPosition.x = px
        lastCameraPosition.y = py
        lastCameraPosition.z = pz
        lastCameraDirection.x = dx
        lastCameraDirection.y = dy
        lastCameraDirection.z = dz
        let minDist
        let maxDist
        for (let i = 0; i < 8; ++i) {
            const x = i & 1 ? boundMin.x : boundMax.x
            const y = i & 2 ? boundMin.y : boundMax.y
            const z = i & 4 ? boundMin.z : boundMax.z
            const d = x * dx + y * dy + z * dz
            if (i === 0) {
                minDist = maxDist = d
            } else {
                minDist = Math.min(minDist, d)
                maxDist = Math.max(maxDist, d)
            }
        }
        const numVertices = centers.length / 3
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
        if (range < 1e-6) {
            for (let i = 0; i < numVertices; ++i) {
                distances[i] = 0
                countBuffer[0]++
            }
        } else {
            const numChunks = chunks.length / 4
            binCount.fill(0)
            for (let i = 0; i < numChunks; ++i) {
                const x = chunks[i * 4 + 0]
                const y = chunks[i * 4 + 1]
                const z = chunks[i * 4 + 2]
                const r = chunks[i * 4 + 3]
                const d = x * dx + y * dy + z * dz - minDist
                const binMin = Math.max(0, Math.floor(((d - r) * numBins) / range))
                const binMax = Math.min(numBins, Math.ceil(((d + r) * numBins) / range))
                for (let j = binMin; j < binMax; ++j) {
                    binCount[j]++
                }
            }
            const binTotal = binCount.reduce((a, b) => a + b, 0)
            for (let i = 0; i < numBins; ++i) {
                binDivider[i] = ((binCount[i] / binTotal) * bucketCount) >>> 0
            }
            for (let i = 0; i < numBins; ++i) {
                binBase[i] = i === 0 ? 0 : binBase[i - 1] + binDivider[i - 1]
            }
            const binRange = range / numBins
            let ii = 0
            for (let i = 0; i < numVertices; ++i) {
                const x = centers[ii++]
                const y = centers[ii++]
                const z = centers[ii++]
                const d = (x * dx + y * dy + z * dz - minDist) / binRange
                const bin = d >>> 0
                const sortKey = (binBase[bin] + binDivider[bin] * (d - bin)) >>> 0
                distances[i] = sortKey
                countBuffer[sortKey]++
            }
        }
        for (let i = 1; i < bucketCount; i++) {
            countBuffer[i] += countBuffer[i - 1]
        }
        for (let i = 0; i < numVertices; i++) {
            const distance = distances[i]
            const destIndex = --countBuffer[distance]
            order[destIndex] = i
        }
        const cameraDist = px * dx + py * dy + pz * dz
        const dist = (i) => {
            let o = order[i] * 3
            return centers[o++] * dx + centers[o++] * dy + centers[o] * dz - cameraDist
        }
        const findZero = () => {
            const result = binarySearch(0, numVertices - 1, (i) => -dist(i))
            return Math.min(numVertices, Math.abs(result))
        }
        const count = dist(numVertices - 1) >= 0 ? findZero() : numVertices
        if (mapping) {
            for (let i = 0; i < numVertices; ++i) {
                order[i] = mapping[order[i]]
            }
        }
        myself.postMessage(
            {
                order: order.buffer,
                count,
                sortTime: performance.now() - sortStartTime,
            },
            [order.buffer],
        )
        order = null
    }
    myself.addEventListener('message', (message) => {
        const msgData = message.data ?? message
        if (msgData.order) {
            order = new Uint32Array(msgData.order)
        }
        if (msgData.centers) {
            centers = new Float32Array(msgData.centers)
            forceUpdate = true
            if (msgData.chunks) {
                const chunksSrc = new Float32Array(msgData.chunks)
                chunks = new Float32Array(msgData.chunks, 0, (chunksSrc.length * 4) / 6)
                boundMin.x = chunksSrc[0]
                boundMin.y = chunksSrc[1]
                boundMin.z = chunksSrc[2]
                boundMax.x = chunksSrc[3]
                boundMax.y = chunksSrc[4]
                boundMax.z = chunksSrc[5]
                for (let i = 0; i < chunksSrc.length / 6; ++i) {
                    const mx = chunksSrc[i * 6 + 0]
                    const my = chunksSrc[i * 6 + 1]
                    const mz = chunksSrc[i * 6 + 2]
                    const Mx = chunksSrc[i * 6 + 3]
                    const My = chunksSrc[i * 6 + 4]
                    const Mz = chunksSrc[i * 6 + 5]
                    chunks[i * 4 + 0] = (mx + Mx) * 0.5
                    chunks[i * 4 + 1] = (my + My) * 0.5
                    chunks[i * 4 + 2] = (mz + Mz) * 0.5
                    chunks[i * 4 + 3] = Math.sqrt((Mx - mx) ** 2 + (My - my) ** 2 + (Mz - mz) ** 2) * 0.5
                    if (mx < boundMin.x) boundMin.x = mx
                    if (my < boundMin.y) boundMin.y = my
                    if (mz < boundMin.z) boundMin.z = mz
                    if (Mx > boundMax.x) boundMax.x = Mx
                    if (My > boundMax.y) boundMax.y = My
                    if (Mz > boundMax.z) boundMax.z = Mz
                }
            } else {
                const numVertices = centers.length / 3
                const numChunks = Math.ceil(numVertices / 256)
                chunks = new Float32Array(numChunks * 4)
                boundMin.x = boundMin.y = boundMin.z = Infinity
                boundMax.x = boundMax.y = boundMax.z = -Infinity
                let mx, my, mz, Mx, My, Mz
                for (let c = 0; c < numChunks; ++c) {
                    mx = my = mz = Infinity
                    Mx = My = Mz = -Infinity
                    const start = c * 256
                    const end = Math.min(numVertices, (c + 1) * 256)
                    for (let i = start; i < end; ++i) {
                        const x = centers[i * 3 + 0]
                        const y = centers[i * 3 + 1]
                        const z = centers[i * 3 + 2]
                        const validX = Number.isFinite(x)
                        const validY = Number.isFinite(y)
                        const validZ = Number.isFinite(z)
                        if (!validX) centers[i * 3 + 0] = 0
                        if (!validY) centers[i * 3 + 1] = 0
                        if (!validZ) centers[i * 3 + 2] = 0
                        if (!validX || !validY || !validZ) {
                            continue
                        }
                        if (x < mx) mx = x
                        else if (x > Mx) Mx = x
                        if (y < my) my = y
                        else if (y > My) My = y
                        if (z < mz) mz = z
                        else if (z > Mz) Mz = z
                        if (x < boundMin.x) boundMin.x = x
                        else if (x > boundMax.x) boundMax.x = x
                        if (y < boundMin.y) boundMin.y = y
                        else if (y > boundMax.y) boundMax.y = y
                        if (z < boundMin.z) boundMin.z = z
                        else if (z > boundMax.z) boundMax.z = z
                    }
                    chunks[c * 4 + 0] = (mx + Mx) * 0.5
                    chunks[c * 4 + 1] = (my + My) * 0.5
                    chunks[c * 4 + 2] = (mz + Mz) * 0.5
                    chunks[c * 4 + 3] = Math.sqrt((Mx - mx) ** 2 + (My - my) ** 2 + (Mz - mz) ** 2) * 0.5
                }
            }
        }
        if (msgData.hasOwnProperty('mapping')) {
            mapping = msgData.mapping ? new Uint32Array(msgData.mapping) : null
            forceUpdate = true
        }
        if (msgData.cameraPosition) cameraPosition = msgData.cameraPosition
        if (msgData.cameraDirection) cameraDirection = msgData.cameraDirection
        update()
    })
}

class GSplatSorter extends EventHandler {
    destroy() {
        this.worker.terminate()
        this.worker = null
        this.uploadStream.destroy()
        this.uploadStream = null
    }
    init(target, numSplats, centers, chunks) {
        this.target = target
        this.centers = centers.slice()
        const orderBuffer = new Uint32Array(numSplats)
        for (let i = 0; i < numSplats; ++i) {
            orderBuffer[i] = i
        }
        this.orderData = new ArrayBuffer(numSplats * 4)
        const obj = {
            order: orderBuffer.buffer,
            centers: centers.buffer,
            chunks: chunks?.buffer,
        }
        const transfer = [orderBuffer.buffer, centers.buffer].concat(chunks ? [chunks.buffer] : [])
        this.worker.postMessage(obj, transfer)
    }
    applyPendingSorted() {
        if (this.pendingSorted) {
            const { count, data } = this.pendingSorted
            this.pendingSorted = null
            this.uploadStream.upload(data, this.target)
            return count
        }
        return -1
    }
    setMapping(mapping) {
        if (mapping) {
            const centers = new Float32Array(mapping.length * 3)
            for (let i = 0; i < mapping.length; ++i) {
                const src = mapping[i] * 3
                const dst = i * 3
                centers[dst + 0] = this.centers[src + 0]
                centers[dst + 1] = this.centers[src + 1]
                centers[dst + 2] = this.centers[src + 2]
            }
            this.worker.postMessage(
                {
                    centers: centers.buffer,
                    mapping: mapping.buffer,
                },
                [centers.buffer, mapping.buffer],
            )
        } else {
            const centers = this.centers.slice()
            this.worker.postMessage(
                {
                    centers: centers.buffer,
                    mapping: null,
                },
                [centers.buffer],
            )
        }
    }
    setCamera(pos, dir) {
        this.worker.postMessage({
            cameraPosition: {
                x: pos.x,
                y: pos.y,
                z: pos.z,
            },
            cameraDirection: {
                x: dir.x,
                y: dir.y,
                z: dir.z,
            },
        })
    }
    constructor(device, scene) {
        ;(super(), (this.pendingSorted = null))
        this.scene = scene ?? null
        this.uploadStream = new UploadStream(device)
        const messageHandler = (message) => {
            const msgData = message.data ?? message
            if (this.scene && msgData.sortTime !== undefined) {
                this.scene.fire('gsplat:sorted', msgData.sortTime)
            }
            const newOrder = msgData.order
            const oldOrder = this.orderData
            this.worker.postMessage(
                {
                    order: oldOrder,
                },
                [oldOrder],
            )
            this.orderData = newOrder
            this.pendingSorted = {
                count: msgData.count,
                data: new Uint32Array(newOrder),
            }
            this.fire('updated')
        }
        const workerSource = `(${SortWorker.toString()})()`
        if (platform.environment === 'node') {
            this.worker = new Worker(workerSource, {
                eval: true,
            })
            this.worker.on('message', messageHandler)
        } else {
            this.worker = new Worker(
                URL.createObjectURL(
                    new Blob([workerSource], {
                        type: 'application/javascript',
                    }),
                ),
            )
            this.worker.addEventListener('message', messageHandler)
        }
    }
}

var glslGsplatSogReorderPS = `
#include "gsplatPackingPS"
uniform highp sampler2D means_l;
uniform highp sampler2D means_u;
uniform highp sampler2D quats;
uniform highp sampler2D scales;
uniform highp sampler2D sh0;
uniform highp sampler2D sh_labels;
uniform highp uint numSplats;
#ifdef REORDER_V1
        float sigmoid(float x) { return 1.0 / (1.0 + exp(-x)); }
        vec3 vmin(vec3 v) { return vec3(min(min(v.x, v.y), v.z)); }
        vec3 vmax(vec3 v) { return vec3(max(max(v.x, v.y), v.z)); }
        vec3 resolve(vec3 m, vec3 M, vec3 v) { return (mix(m, M, v) - vmin(m)) / (vmax(M) - vmin(m)); }
        
        uniform vec3 scalesMins;
        uniform vec3 scalesMaxs;
        uniform vec4 sh0Mins;
        uniform vec4 sh0Maxs;
#else
        uniform vec4 scales_codebook[64];
        uniform vec4 sh0_codebook[64];
#endif
void main(void) {
        int w = int(textureSize(means_l, 0).x);
        ivec2 uv = ivec2(gl_FragCoord.xy);
        if (uint(uv.x + uv.y * w) >= numSplats) {
                discard;
        }
        vec3 meansLSample   = texelFetch(means_l, uv, 0).xyz;
        vec3 meansUSample   = texelFetch(means_u, uv, 0).xyz;
        vec4 quatsSample	= texelFetch(quats, uv, 0);
        vec3 scalesSample   = texelFetch(scales, uv, 0).xyz;
        vec4 sh0Sample	  = texelFetch(sh0, uv, 0);
        vec2 shLabelsSample = texelFetch(sh_labels, uv, 0).xy;
        #ifdef REORDER_V1
                uint scale = pack101010(resolve(scalesMins, scalesMaxs, scalesSample));
                uint sh0 = pack111110(resolve(sh0Mins.xyz, sh0Maxs.xyz, sh0Sample.xyz));
                float alpha = sigmoid(mix(sh0Mins.w, sh0Maxs.w, sh0Sample.w));
        #else
                uint scale = pack101010(resolveCodebook(scalesSample, scales_codebook));
                uint sh0 = pack111110(resolveCodebook(sh0Sample.xyz, sh0_codebook));
                float alpha = sh0Sample.w;
        #endif
        uint qmode = uint(quatsSample.w * 255.0) - 252u;
        pcFragColor0 = uvec4(
                pack8888(vec4(meansLSample, shLabelsSample.x)),
                pack8888(vec4(meansUSample, shLabelsSample.y)),
                pack8888(vec4(quatsSample.xyz, alpha)),
                (scale << 2u) | qmode
        );
        pcFragColor1 = unpack8888(sh0);
}
`

var wgslGsplatSogReorderPS = `
#include "gsplatPackingPS"
var means_l: texture_2d<f32>;
var means_u: texture_2d<f32>;
var quats: texture_2d<f32>;
var scales: texture_2d<f32>;
var sh0: texture_2d<f32>;
var sh_labels: texture_2d<f32>;
uniform numSplats: u32;
#ifdef REORDER_V1
        fn sigmoid(x: f32) -> f32 { return 1.0 / (1.0 + exp(-x)); }
        fn vmin(v: vec3f) -> vec3f { return vec3f(min(min(v.x, v.y), v.z)); }
        fn vmax(v: vec3f) -> vec3f { return vec3f(max(max(v.x, v.y), v.z)); }
        fn resolve(m: vec3f, M: vec3f, v: vec3f) -> vec3f { return (mix(m, M, v) - vmin(m)) / (vmax(M) - vmin(m)); }
        uniform scalesMins: vec3f;
        uniform scalesMaxs: vec3f;
        uniform sh0Mins: vec4f;
        uniform sh0Maxs: vec4f;
#else
        uniform scales_codebook: array<vec4f, 64>;
        uniform sh0_codebook: array<vec4f, 64>;
#endif
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
        var output: FragmentOutput;
        let w: u32 = textureDimensions(means_l, 0).x;
        let uv: vec2<u32> = vec2<u32>(input.position.xy);
        if (uv.x + uv.y * w >= uniform.numSplats) {
                discard;
                return output;
        }
        let meansLSample: vec3<f32> = textureLoad(means_l, uv, 0).xyz;
        let meansUSample: vec3<f32> = textureLoad(means_u, uv, 0).xyz;
        let quatsSample: vec4<f32> = textureLoad(quats, uv, 0);
        let scalesSample: vec3<f32> = textureLoad(scales, uv, 0).xyz;
        let sh0Sample: vec4f = textureLoad(sh0, uv, 0);
        let shLabelsSample: vec2<f32> = textureLoad(sh_labels, uv, 0).xy;
        #ifdef REORDER_V1
                let scale = pack101010(resolve(uniform.scalesMins, uniform.scalesMaxs, scalesSample));
                let sh0 = pack111110(resolve(uniform.sh0Mins.xyz, uniform.sh0Maxs.xyz, sh0Sample.xyz));
                let alpha = sigmoid(mix(uniform.sh0Mins.w, uniform.sh0Maxs.w, sh0Sample.w));
        #else
                let scalesIdx = vec3u(scalesSample * 255.0);
                let scalesV = vec3f(
                        uniform.scales_codebook[scalesIdx.x >> 2u][scalesIdx.x & 3u],
                        uniform.scales_codebook[scalesIdx.y >> 2u][scalesIdx.y & 3u],
                        uniform.scales_codebook[scalesIdx.z >> 2u][scalesIdx.z & 3u]
                );
                let scale = pack101010((scalesV - uniform.scales_codebook[0].x) / (uniform.scales_codebook[63].w - uniform.scales_codebook[0].x));
                let sh0Idx = vec3u(sh0Sample.xyz * 255.0);
                let sh0V = vec3f(
                        uniform.sh0_codebook[sh0Idx.x >> 2u][sh0Idx.x & 3u],
                        uniform.sh0_codebook[sh0Idx.y >> 2u][sh0Idx.y & 3u],
                        uniform.sh0_codebook[sh0Idx.z >> 2u][sh0Idx.z & 3u]
                );
                let sh0 = pack111110((sh0V - uniform.sh0_codebook[0].x) / (uniform.sh0_codebook[63].w - uniform.sh0_codebook[0].x));
                let alpha = sh0Sample.w;
        #endif
        let qmode = u32(quatsSample.w * 255.0) - 252u;
        output.color = vec4u(
                pack8888(vec4f(meansLSample, shLabelsSample.x)),
                pack8888(vec4f(meansUSample, shLabelsSample.y)),
                pack8888(vec4f(quatsSample.xyz, alpha)),
                (scale << 2u) | qmode
        );
        output.color1 = unpack8888(sh0);
        return output;
}
`

var glslGsplatSogReorderSh = `
#include "gsplatPackingPS"
uniform highp sampler2D sh_centroids;
uniform vec4 shN_codebook[64];
void main(void) {
        ivec2 uv = ivec2(gl_FragCoord.xy);
        vec3 shNSample = texelFetch(sh_centroids, uv, 0).xyz;
#ifdef REORDER_V1
        pcFragColor0 = unpack8888(pack111110(shNSample));
#else
        pcFragColor0 = unpack8888(pack111110(resolveCodebook(shNSample, shN_codebook)));
#endif
}
`

var gsplatPackingPS$1 = `
uint pack8888(vec4 v) {
        uvec4 t = uvec4(v * 255.0) << uvec4(24u, 16u, 8u, 0u);
        return t.x | t.y | t.z | t.w;
}
uint pack101010(vec3 v) {
        uvec3 t = uvec3(v * 1023.0) << uvec3(20u, 10u, 0u);
        return t.x | t.y | t.z;
}
uint pack111110(vec3 v) {
        uvec3 t = uvec3(v * vec3(2047.0, 2047.0, 1023.0)) << uvec3(21u, 10u, 0u);
        return t.x | t.y | t.z;
}
vec4 unpack8888(uint v) {
        return vec4((uvec4(v) >> uvec4(24u, 16u, 8u, 0u)) & 0xffu) / 255.0;
}
vec3 unpack101010(uint v) {
        return vec3((uvec3(v) >> uvec3(20u, 10u, 0u)) & 0x3ffu) / 1023.0;
}
vec3 unpack111110(uint v) {
        return vec3((uvec3(v) >> uvec3(21u, 10u, 0u)) & uvec3(0x7ffu, 0x7ffu, 0x3ffu)) / vec3(2047.0, 2047.0, 1023.0);
}
vec3 resolveCodebook(vec3 s, vec4 codebook[64]) {
        uvec3 idx = uvec3(s * 255.0);
        vec3 v = vec3(
                codebook[idx.x >> 2u][idx.x & 3u],
                codebook[idx.y >> 2u][idx.y & 3u],
                codebook[idx.z >> 2u][idx.z & 3u]
        );
        return (v - codebook[0].x) / (codebook[63].w - codebook[0].x);
}
`

var wgslGsplatSogReorderSH = `
#include "gsplatPackingPS"
var sh_centroids: texture_2d<f32>;
uniform shN_codebook: array<vec4f, 64>;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
        var output: FragmentOutput;
        var uv = vec2i(input.position.xy);
        var shNSample = textureLoad(sh_centroids, uv, 0).xyz;
#ifdef REORDER_V1
        output.color = unpack8888(pack111110(shNSample));
#else
        let shNIdx = vec3u(shNSample * 255.0);
        let shNV = vec3f(
                uniform.shN_codebook[shNIdx.x >> 2u][shNIdx.x & 3u],
                uniform.shN_codebook[shNIdx.y >> 2u][shNIdx.y & 3u],
                uniform.shN_codebook[shNIdx.z >> 2u][shNIdx.z & 3u]
        );
        output.color = unpack8888(pack111110((shNV - uniform.shN_codebook[0].x) / (uniform.shN_codebook[63].w - uniform.shN_codebook[0].x)));
#endif
        return output;
}
`

var gsplatPackingPS = `
fn pack8888(v: vec4f) -> u32 {
        let t = vec4u(v * 255.0) << vec4u(24u, 16u, 8u, 0u);
        return t.x | t.y | t.z | t.w;
}
fn pack101010(v: vec3f) -> u32 {
        let t = vec3u(v * vec3f(1023.0, 1023.0, 1023.0)) << vec3u(20u, 10u, 0u);
        return t.x | t.y | t.z;
}
fn pack111110(v: vec3f) -> u32 {
        let t = vec3u(v * vec3f(2047.0, 2047.0, 1023.0)) << vec3u(21u, 10u, 0u);
        return t.x | t.y | t.z;
}
fn unpack8888(v: u32) -> vec4f {
        return vec4f((vec4u(v) >> vec4u(24u, 16u, 8u, 0u)) & vec4u(0xffu)) / 255.0;
}
fn unpack101010(v: u32) -> vec3f {
        return vec3f((vec3u(v) >> vec3u(20u, 10u, 0u)) & vec3u(0x3ffu)) / 1023.0;
}
fn unpack111110(v: u32) -> vec3f {
        return vec3f((vec3u(v) >> vec3u(21u, 10u, 0u)) & vec3u(0x7ffu, 0x7ffu, 0x3ffu)) / vec3f(2047.0, 2047.0, 1023.0);
}`

var glslSogCentersPS = `
#include "gsplatPackingPS"
uniform highp sampler2D means_l;
uniform highp sampler2D means_u;
uniform highp uint numSplats;
uniform highp vec3 means_mins;
uniform highp vec3 means_maxs;
void main(void) {
        int w = int(textureSize(means_l, 0).x);
        ivec2 uv = ivec2(gl_FragCoord.xy);
        if (uint(uv.x + uv.y * w) >= numSplats) {
                discard;
        }
        vec3 l = texelFetch(means_l, uv, 0).xyz;
        vec3 u = texelFetch(means_u, uv, 0).xyz;
        vec3 n = (l + u * 256.0) / 257.0;
        vec3 v = mix(means_mins, means_maxs, n);
        vec3 center = sign(v) * (exp(abs(v)) - 1.0);
        pcFragColor0 = uvec4(floatBitsToUint(center), 0u);
}
`

var wgslSogCentersPS = `
var means_l: texture_2d<f32>;
var means_u: texture_2d<f32>;
uniform numSplats: u32;
uniform means_mins: vec3f;
uniform means_maxs: vec3f;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
        var output: FragmentOutput;
        let w: u32 = textureDimensions(means_l, 0).x;
        let uv: vec2<i32> = vec2<i32>(input.position.xy);
        if (u32(uv.x + uv.y * i32(w)) >= uniform.numSplats) {
                discard;
                return output;
        }
        let l: vec3f = textureLoad(means_l, uv, 0).xyz;
        let u: vec3f = textureLoad(means_u, uv, 0).xyz;
        let n: vec3f = (l + u * 256.0) / 257.0;
        let v: vec3f = mix(uniform.means_mins, uniform.means_maxs, n);
        let center: vec3f = sign(v) * (exp(abs(v)) - 1.0);
        let packed: vec4<u32> = bitcast<vec4<u32>>(vec4f(center, 0.0));
        output.color = packed;
        return output;
}
`

const SH_C0$1 = 0.28209479177387814
const readImageDataAsync = (texture) => {
    if (texture.device.isNull) {
        return new Promise((resolve) => {
            resolve(new Uint8Array(texture.width * texture.height * 4))
        })
    }
    return texture.read(0, 0, texture.width, texture.height, {
        mipLevel: 0,
        face: 0,
        immediate: true,
    })
}
const resolve = (scope, values) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key])
    }
}
class GSplatSogIterator {
    constructor(data, p, r, s, c, sh) {
        const lerp = (a, b, t) => a * (1 - t) + b * t
        const { meta, shBands } = data
        const { means, scales, sh0, shN } = meta
        const means_l_data = p && data.means_l._levels[0]
        const means_u_data = p && data.means_u._levels[0]
        const quats_data = r && data.quats._levels[0]
        const scales_data = s && data.scales._levels[0]
        const sh0_data = c && data.sh0._levels[0]
        const sh_labels_data = sh && data.sh_labels._levels[0]
        const sh_centroids_data = sh && data.sh_centroids._levels[0]
        const norm = Math.SQRT2
        const coeffs =
            {
                1: 3,
                2: 8,
                3: 15,
            }[shBands] ?? 0
        this.read = (i) => {
            if (p) {
                const nx = lerp(
                    means.mins[0],
                    means.maxs[0],
                    ((means_u_data[i * 4 + 0] << 8) + means_l_data[i * 4 + 0]) / 65535,
                )
                const ny = lerp(
                    means.mins[1],
                    means.maxs[1],
                    ((means_u_data[i * 4 + 1] << 8) + means_l_data[i * 4 + 1]) / 65535,
                )
                const nz = lerp(
                    means.mins[2],
                    means.maxs[2],
                    ((means_u_data[i * 4 + 2] << 8) + means_l_data[i * 4 + 2]) / 65535,
                )
                p.x = Math.sign(nx) * (Math.exp(Math.abs(nx)) - 1)
                p.y = Math.sign(ny) * (Math.exp(Math.abs(ny)) - 1)
                p.z = Math.sign(nz) * (Math.exp(Math.abs(nz)) - 1)
            }
            if (r) {
                const a = (quats_data[i * 4 + 0] / 255 - 0.5) * norm
                const b = (quats_data[i * 4 + 1] / 255 - 0.5) * norm
                const c = (quats_data[i * 4 + 2] / 255 - 0.5) * norm
                const d = Math.sqrt(Math.max(0, 1 - (a * a + b * b + c * c)))
                const mode = quats_data[i * 4 + 3] - 252
                switch (mode) {
                    case 0:
                        r.set(a, b, c, d)
                        break
                    case 1:
                        r.set(d, b, c, a)
                        break
                    case 2:
                        r.set(b, d, c, a)
                        break
                    case 3:
                        r.set(b, c, d, a)
                        break
                }
            }
            if (s) {
                if (meta.version === 2) {
                    const sx = scales.codebook[scales_data[i * 4 + 0]]
                    const sy = scales.codebook[scales_data[i * 4 + 1]]
                    const sz = scales.codebook[scales_data[i * 4 + 2]]
                    s.set(sx, sy, sz)
                } else {
                    const sx = lerp(scales.mins[0], scales.maxs[0], scales_data[i * 4 + 0] / 255)
                    const sy = lerp(scales.mins[1], scales.maxs[1], scales_data[i * 4 + 1] / 255)
                    const sz = lerp(scales.mins[2], scales.maxs[2], scales_data[i * 4 + 2] / 255)
                    s.set(sx, sy, sz)
                }
            }
            if (c) {
                if (meta.version === 2) {
                    const r = sh0.codebook[sh0_data[i * 4 + 0]]
                    const g = sh0.codebook[sh0_data[i * 4 + 1]]
                    const b = sh0.codebook[sh0_data[i * 4 + 2]]
                    const a = sh0_data[i * 4 + 3] / 255
                    c.set(0.5 + r * SH_C0$1, 0.5 + g * SH_C0$1, 0.5 + b * SH_C0$1, a)
                } else {
                    const r = lerp(sh0.mins[0], sh0.maxs[0], sh0_data[i * 4 + 0] / 255)
                    const g = lerp(sh0.mins[1], sh0.maxs[1], sh0_data[i * 4 + 1] / 255)
                    const b = lerp(sh0.mins[2], sh0.maxs[2], sh0_data[i * 4 + 2] / 255)
                    const a = lerp(sh0.mins[3], sh0.maxs[3], sh0_data[i * 4 + 3] / 255)
                    c.set(0.5 + r * SH_C0$1, 0.5 + g * SH_C0$1, 0.5 + b * SH_C0$1, 1.0 / (1.0 + Math.exp(-a)))
                }
            }
            if (sh) {
                const n = sh_labels_data[i * 4 + 0] + (sh_labels_data[i * 4 + 1] << 8)
                const u = (n % 64) * coeffs
                const v = Math.floor(n / 64)
                if (meta.version === 2) {
                    for (let j = 0; j < 3; ++j) {
                        for (let k = 0; k < coeffs; ++k) {
                            sh[j * 15 + k] =
                                shN.codebook[sh_centroids_data[(u + k) * 4 + j + v * data.sh_centroids.width * 4]]
                        }
                    }
                } else {
                    for (let j = 0; j < 3; ++j) {
                        for (let k = 0; k < coeffs; ++k) {
                            sh[j * 15 + k] = lerp(
                                shN.mins,
                                shN.maxs,
                                sh_centroids_data[(u + k) * 4 + j + v * data.sh_centroids.width * 4] / 255,
                            )
                        }
                    }
                }
            }
        }
    }
}
class GSplatSogData {
    _destroyGpuResources() {
        this.means_l?.destroy()
        this.means_u?.destroy()
        this.quats?.destroy()
        this.scales?.destroy()
        this.sh0?.destroy()
        this.sh_centroids?.destroy()
        this.sh_labels?.destroy()
        this.packedTexture?.destroy()
        this.packedSh0?.destroy()
        this.packedShN?.destroy()
    }
    static calcBands(centroidsWidth) {
        const shBandsWidths = {
            192: 1,
            512: 2,
            960: 3,
        }
        return shBandsWidths[centroidsWidth] ?? 0
    }
    destroy() {
        this.deviceRestoredEvent?.off()
        this.deviceRestoredEvent = null
        this.destroyed = true
        this._destroyGpuResources()
    }
    createIter(p, r, s, c, sh) {
        return new GSplatSogIterator(this, p, r, s, c, sh)
    }
    calcAabb(result) {
        const { mins, maxs } = this.meta.means
        const map = (v) => Math.sign(v) * (Math.exp(Math.abs(v)) - 1)
        result.center.set(
            (map(mins[0]) + map(maxs[0])) * 0.5,
            (map(mins[1]) + map(maxs[1])) * 0.5,
            (map(mins[2]) + map(maxs[2])) * 0.5,
        )
        result.halfExtents.set(
            (map(maxs[0]) - map(mins[0])) * 0.5,
            (map(maxs[1]) - map(mins[1])) * 0.5,
            (map(maxs[2]) - map(mins[2])) * 0.5,
        )
    }
    getCenters() {
        const centers = this._centers
        this._centers = null
        return centers
    }
    calcFocalPoint(result, pred) {
        const { mins, maxs } = this.meta.means
        const map = (v) => Math.sign(v) * (Math.exp(Math.abs(v)) - 1)
        result.set(
            (map(mins[0]) + map(maxs[0])) * 0.5,
            (map(mins[1]) + map(maxs[1])) * 0.5,
            (map(mins[2]) + map(maxs[2])) * 0.5,
        )
    }
    get isSog() {
        return true
    }
    async decompress() {
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
        const { means_l, means_u, quats, scales, sh0, sh_labels, sh_centroids } = this
        means_l._levels[0] = await readImageDataAsync(means_l)
        means_u._levels[0] = await readImageDataAsync(means_u)
        quats._levels[0] = await readImageDataAsync(quats)
        scales._levels[0] = await readImageDataAsync(scales)
        sh0._levels[0] = await readImageDataAsync(sh0)
        if (shBands > 0) {
            sh_labels._levels[0] = await readImageDataAsync(sh_labels)
            sh_centroids._levels[0] = await readImageDataAsync(sh_centroids)
            const shMembers = []
            for (let i = 0; i < 45; ++i) {
                shMembers.push(`f_rest_${i}`)
            }
            members.splice(members.indexOf('f_dc_0') + 1, 0, ...shMembers)
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
            data.f_dc_0[i] = (c.x - 0.5) / SH_C0$1
            data.f_dc_1[i] = (c.y - 0.5) / SH_C0$1
            data.f_dc_2[i] = (c.z - 0.5) / SH_C0$1
            data.opacity[i] = c.w <= 0 ? -40 : c.w >= 1 ? 40 : -Math.log(1 / c.w - 1)
            if (sh) {
                for (let c = 0; c < 45; ++c) {
                    data[`f_rest_${c}`][i] = sh[c]
                }
            }
        }
        return new GSplatData([
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
        ])
    }
    async generateCenters() {
        const { device, width, height } = this.means_l
        const { scope } = device
        const centersTexture = new Texture(device, {
            name: 'sogCentersTexture',
            width,
            height,
            format: PIXELFORMAT_RGBA32U,
            mipmaps: false,
        })
        const shader = ShaderUtils.createShader(device, {
            uniqueName: 'GsplatSogCentersShader',
            attributes: {
                vertex_position: SEMANTIC_POSITION,
            },
            vertexChunk: 'fullscreenQuadVS',
            fragmentGLSL: glslSogCentersPS,
            fragmentWGSL: wgslSogCentersPS,
            fragmentOutputTypes: ['uvec4'],
            fragmentIncludes: new Map([['gsplatPackingPS', device.isWebGPU ? gsplatPackingPS : gsplatPackingPS$1]]),
        })
        const renderTarget = new RenderTarget({
            colorBuffer: centersTexture,
            depth: false,
            mipLevel: 0,
        })
        resolve(scope, {
            means_l: this.means_l,
            means_u: this.means_u,
            numSplats: this.numSplats,
            means_mins: this.meta.means.mins,
            means_maxs: this.meta.means.maxs,
        })
        const quad = new QuadRender(shader)
        const renderPass = new RenderPassQuad(device, quad)
        renderPass.name = 'SogGenerateCenters'
        renderPass.init(renderTarget)
        renderPass.colorOps.clear = false
        renderPass.depthStencilOps.clearDepth = false
        renderPass.render()
        quad.destroy()
        renderTarget.destroy()
        const u32 = await readImageDataAsync(centersTexture)
        if (this.destroyed || device._destroyed) {
            centersTexture.destroy()
            return
        }
        const asFloat = new Float32Array(u32.buffer)
        const result = new Float32Array(this.numSplats * 3)
        for (let i = 0; i < this.numSplats; i++) {
            const base = i * 4
            result[i * 3 + 0] = asFloat[base + 0]
            result[i * 3 + 1] = asFloat[base + 1]
            result[i * 3 + 2] = asFloat[base + 2]
        }
        this._centers = result
        centersTexture.destroy()
    }
    packGpuMemory() {
        const { meta, means_l, means_u, quats, scales, sh0, sh_labels, numSplats } = this
        const { device } = means_l
        const { scope } = device
        const shaderKey = meta.version === 2 ? 'v2' : 'v1'
        const shader = ShaderUtils.createShader(device, {
            uniqueName: `GsplatSogReorderShader-${shaderKey}`,
            attributes: {
                vertex_position: SEMANTIC_POSITION,
            },
            vertexChunk: 'fullscreenQuadVS',
            fragmentGLSL: glslGsplatSogReorderPS,
            fragmentWGSL: wgslGsplatSogReorderPS,
            fragmentOutputTypes: ['uvec4', 'vec4'],
            fragmentIncludes: new Map([['gsplatPackingPS', device.isWebGPU ? gsplatPackingPS : gsplatPackingPS$1]]),
            fragmentDefines: meta.version === 2 ? undefined : new Map([['REORDER_V1', '1']]),
        })
        const renderTarget = new RenderTarget({
            colorBuffers: [this.packedTexture, this.packedSh0],
            depth: false,
            mipLevel: 0,
        })
        resolve(scope, {
            means_l,
            means_u,
            quats,
            scales,
            sh0,
            sh_labels: sh_labels ?? means_l,
            numSplats,
            'scales_codebook[0]': this.meta.scales.codebook,
            'sh0_codebook[0]': this.meta.sh0.codebook,
            scalesMins: meta.scales.mins,
            scalesMaxs: meta.scales.maxs,
            sh0Mins: meta.sh0.mins,
            sh0Maxs: meta.sh0.maxs,
        })
        const quad = new QuadRender(shader)
        const renderPass = new RenderPassQuad(device, quad)
        renderPass.name = 'SogPackGpuMemory'
        renderPass.init(renderTarget)
        renderPass.colorOps.clear = false
        renderPass.depthStencilOps.clearDepth = false
        renderPass.render()
        quad.destroy()
        renderTarget.destroy()
    }
    packShMemory() {
        const { meta, sh_centroids } = this
        const { device } = sh_centroids
        const { scope } = device
        const shaderKey = meta.version === 2 ? 'v2' : 'v1'
        const shader = ShaderUtils.createShader(device, {
            uniqueName: `GsplatSogReorderShShader-${shaderKey}`,
            attributes: {
                vertex_position: SEMANTIC_POSITION,
            },
            vertexChunk: 'fullscreenQuadVS',
            fragmentGLSL: glslGsplatSogReorderSh,
            fragmentWGSL: wgslGsplatSogReorderSH,
            fragmentIncludes: new Map([['gsplatPackingPS', device.isWebGPU ? gsplatPackingPS : gsplatPackingPS$1]]),
            fragmentDefines: meta.version === 2 ? undefined : new Map([['REORDER_V1', '1']]),
        })
        const renderTarget = new RenderTarget({
            colorBuffer: this.packedShN,
            depth: false,
            mipLevel: 0,
        })
        resolve(scope, {
            sh_centroids,
            'shN_codebook[0]': this.meta.shN.codebook,
        })
        const quad = new QuadRender(shader)
        const renderPass = new RenderPassQuad(device, quad)
        renderPass.name = 'SogPackShMemory'
        renderPass.init(renderTarget)
        renderPass.colorOps.clear = false
        renderPass.depthStencilOps.clearDepth = false
        renderPass.render()
        quad.destroy()
        renderTarget.destroy()
    }
    async prepareGpuData() {
        let device = this.means_l.device
        const { height, width } = this.means_l
        if (this.destroyed || !device || device._destroyed) return
        const urlSuffix = this.url ? `_${this.url}` : ''
        this.packedTexture = new Texture(device, {
            name: `sogPackedTexture${urlSuffix}`,
            width,
            height,
            format: PIXELFORMAT_RGBA32U,
            mipmaps: false,
        })
        this.packedSh0 = new Texture(device, {
            name: `sogPackedSh0${urlSuffix}`,
            width,
            height,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
        })
        this.packedShN =
            this.sh_centroids &&
            new Texture(device, {
                name: `sogPackedShN${urlSuffix}`,
                width: this.sh_centroids.width,
                height: this.sh_centroids.height,
                format: PIXELFORMAT_RGBA8,
                mipmaps: false,
            })
        if (!this.minimalMemory) {
            this.deviceRestoredEvent = device.on('devicerestored', () => {
                this.packGpuMemory()
                if (this.packedShN) {
                    this.packShMemory()
                }
            })
        }
        ;['scales', 'sh0', 'shN'].forEach((name) => {
            const codebook = this.meta[name]?.codebook
            if (codebook?.[0] === null) {
                codebook[0] = codebook[1] + (codebook[1] - codebook[255]) / 255
            }
        })
        device = this.means_l?.device
        if (this.destroyed || !device || device._destroyed) return
        await this.generateCenters()
        device = this.means_l?.device
        if (this.destroyed || !device || device._destroyed) return
        this.packGpuMemory()
        if (this.packedShN) {
            device = this.means_l?.device
            if (this.destroyed || !device || device._destroyed) return
            this.packShMemory()
        }
        if (this.minimalMemory) {
            this.means_l?.destroy()
            this.means_u?.destroy()
            this.quats?.destroy()
            this.scales?.destroy()
            this.sh0?.destroy()
            this.sh_centroids?.destroy()
            this.sh_labels?.destroy()
            this.means_l = null
            this.means_u = null
            this.quats = null
            this.scales = null
            this.sh0 = null
            this.sh_centroids = null
            this.sh_labels = null
        }
    }
    reorderData() {
        return this.prepareGpuData()
    }
    constructor() {
        this.url = ''
        this.minimalMemory = false
        this.deviceRestoredEvent = null
        this._centers = null
        this.destroyed = false
        this.shBands = 0
    }
}

const mat = new Mat4()
const cameraPosition$1 = new Vec3()
const cameraDirection$1 = new Vec3()
class GSplatInstance {
    destroy() {
        this.resource?.releaseMesh()
        this.orderTexture?.destroy()
        this.orderBuffer?.destroy()
        this.resolveSH?.destroy()
        this.material?.destroy()
        this.meshInstance?.destroy()
        this.sorter?.destroy()
    }
    setMaterialOrderData(material) {
        if (this.orderBuffer) {
            material.setParameter('splatOrder', this.orderBuffer)
        } else {
            material.setParameter('splatOrder', this.orderTexture)
            material.setParameter('splatTextureSize', this.orderTexture.width)
        }
    }
    set material(value) {
        if (this._material !== value) {
            this._material = value
            this.setMaterialOrderData(this._material)
            if (this.meshInstance) {
                this.meshInstance.material = value
            }
        }
    }
    get material() {
        return this._material
    }
    configureMaterial(material, options = {}) {
        this.resource.configureMaterial(material, null, this.resource.format.getInputDeclarations())
        material.setParameter('numSplats', 0)
        this.setMaterialOrderData(material)
        material.setParameter('alphaClip', 0.3)
        material.setDefine(`DITHER_${options.dither ? 'BLUENOISE' : 'NONE'}`, '')
        material.cull = CULLFACE_NONE
        material.blendType = options.dither ? BLEND_NONE : BLEND_PREMULTIPLIED
        material.depthWrite = !!options.dither
    }
    sort(cameraNode) {
        if (this.sorter) {
            const cameraMat = cameraNode.getWorldTransform()
            cameraMat.getTranslation(cameraPosition$1)
            cameraMat.getZ(cameraDirection$1)
            const modelMat = this.meshInstance.node.getWorldTransform()
            const invModelMat = mat.invert(modelMat)
            invModelMat.transformPoint(cameraPosition$1, cameraPosition$1)
            invModelMat.transformVector(cameraDirection$1, cameraDirection$1)
            if (
                !cameraPosition$1.equalsApprox(this.lastCameraPosition) ||
                !cameraDirection$1.equalsApprox(this.lastCameraDirection)
            ) {
                this.lastCameraPosition.copy(cameraPosition$1)
                this.lastCameraDirection.copy(cameraDirection$1)
                this.sorter.setCamera(cameraPosition$1, cameraDirection$1)
            }
        }
    }
    update() {
        const count = this.sorter?.applyPendingSorted() ?? -1
        if (count >= 0) {
            this.meshInstance.instancingCount = Math.ceil(count / GSplatResourceBase.instanceSize)
            this.material.setParameter('numSplats', count)
        }
        if (this.cameras.length > 0) {
            const camera = this.cameras[0]
            this.sort(camera._node)
            this.resolveSH?.render(camera._node, this.meshInstance.node.getWorldTransform())
            this.cameras.length = 0
        }
    }
    setHighQualitySH(value) {
        const { resource } = this
        const { gsplatData } = resource
        if (gsplatData instanceof GSplatSogData && gsplatData.shBands > 0 && value === !!this.resolveSH) {
            if (this.resolveSH) {
                this.resolveSH.destroy()
                this.resolveSH = null
            } else {
                this.resolveSH = new GSplatResolveSH(resource.device, this)
            }
        }
    }
    constructor(resource, options = {}) {
        this.options = {}
        this.sorter = null
        this.lastCameraPosition = new Vec3()
        this.lastCameraDirection = new Vec3()
        this.resolveSH = null
        this.cameras = []
        this.resource = resource
        const device = resource.device
        const dims = resource.streams.textureDimensions
        const numSplats = dims.x * dims.y
        if (device.isWebGPU) {
            this.orderBuffer = new StorageBuffer(device, numSplats * 4, BUFFERUSAGE_COPY_DST)
        } else {
            this.orderTexture = resource.streams.createTexture('splatOrder', PIXELFORMAT_R32U, dims)
        }
        if (options.material) {
            this._material = options.material
            this.setMaterialOrderData(this._material)
        } else {
            this._material = new ShaderMaterial({
                uniqueName: 'SplatMaterial',
                vertexGLSL: '#include "gsplatVS"',
                fragmentGLSL: '#include "gsplatPS"',
                vertexWGSL: '#include "gsplatVS"',
                fragmentWGSL: '#include "gsplatPS"',
                attributes: {
                    vertex_position: SEMANTIC_POSITION,
                    vertex_id_attrib: SEMANTIC_ATTR13,
                },
            })
            this.configureMaterial(this._material)
            this._material.update()
        }
        resource.ensureMesh()
        this.meshInstance = new MeshInstance(resource.mesh, this._material)
        this.meshInstance.setInstancing(resource.instanceIndices, true)
        this.meshInstance.gsplatInstance = this
        this.meshInstance.instancingCount = 0
        const centers = resource.centers.slice()
        const chunks = resource.chunks?.slice()
        const orderTarget = this.orderBuffer ?? this.orderTexture
        this.sorter = new GSplatSorter(device, options.scene)
        this.sorter.init(orderTarget, numSplats, centers, chunks)
        this.setHighQualitySH(options.highQualitySH ?? false)
    }
}

const getSHData = (gsplatData, numCoeffs) => {
    const result = []
    for (let i = 0; i < numCoeffs; ++i) {
        result.push(gsplatData.getProp(`f_rest_${i}`))
    }
    return result
}
class GSplatResource extends GSplatResourceBase {
    configureMaterialDefines(defines) {
        defines.set('SH_BANDS', this.shBands)
    }
    updateColorData(gsplatData) {
        const texture = this.streams.getTexture('splatColor')
        if (!texture) {
            return
        }
        const float2Half = FloatPacking.float2Half
        const data = texture.lock()
        const cr = gsplatData.getProp('f_dc_0')
        const cg = gsplatData.getProp('f_dc_1')
        const cb = gsplatData.getProp('f_dc_2')
        const ca = gsplatData.getProp('opacity')
        const SH_C0 = 0.28209479177387814
        for (let i = 0; i < this.numSplats; ++i) {
            const r = cr[i] * SH_C0 + 0.5
            const g = cg[i] * SH_C0 + 0.5
            const b = cb[i] * SH_C0 + 0.5
            const a = 1 / (1 + Math.exp(-ca[i]))
            data[i * 4 + 0] = float2Half(r)
            data[i * 4 + 1] = float2Half(g)
            data[i * 4 + 2] = float2Half(b)
            data[i * 4 + 3] = float2Half(a)
        }
        texture.unlock()
    }
    updateTransformData(gsplatData) {
        const float2Half = FloatPacking.float2Half
        const transformA = this.streams.getTexture('transformA')
        const transformB = this.streams.getTexture('transformB')
        if (!transformA) {
            return
        }
        const dataA = transformA.lock()
        const dataAFloat32 = new Float32Array(dataA.buffer)
        const dataB = transformB.lock()
        const p = new Vec3()
        const r = new Quat()
        const s = new Vec3()
        const iter = gsplatData.createIter(p, r, s)
        for (let i = 0; i < this.numSplats; i++) {
            iter.read(i)
            r.normalize()
            if (r.w < 0) {
                r.mulScalar(-1)
            }
            dataAFloat32[i * 4 + 0] = p.x
            dataAFloat32[i * 4 + 1] = p.y
            dataAFloat32[i * 4 + 2] = p.z
            dataA[i * 4 + 3] = float2Half(r.x) | (float2Half(r.y) << 16)
            dataB[i * 4 + 0] = float2Half(s.x)
            dataB[i * 4 + 1] = float2Half(s.y)
            dataB[i * 4 + 2] = float2Half(s.z)
            dataB[i * 4 + 3] = float2Half(r.z)
        }
        transformA.unlock()
        transformB.unlock()
    }
    updateSHData(gsplatData) {
        const sh1to3Texture = this.streams.getTexture('splatSH_1to3')
        const sh4to7Texture = this.streams.getTexture('splatSH_4to7')
        const sh8to11Texture = this.streams.getTexture('splatSH_8to11')
        const sh12to15Texture = this.streams.getTexture('splatSH_12to15')
        const sh1to3Data = sh1to3Texture.lock()
        const sh4to7Data = sh4to7Texture?.lock()
        const sh8to11Data = sh8to11Texture?.lock()
        const sh12to15Data = sh12to15Texture?.lock()
        const numCoeffs = {
            1: 3,
            2: 8,
            3: 15,
        }[this.shBands]
        const src = getSHData(gsplatData, numCoeffs * 3)
        const t11 = (1 << 11) - 1
        const t10 = (1 << 10) - 1
        const float32 = new Float32Array(1)
        const uint32 = new Uint32Array(float32.buffer)
        const c = new Array(numCoeffs * 3).fill(0)
        for (let i = 0; i < gsplatData.numSplats; ++i) {
            for (let j = 0; j < numCoeffs; ++j) {
                c[j * 3] = src[j][i]
                c[j * 3 + 1] = src[j + numCoeffs][i]
                c[j * 3 + 2] = src[j + numCoeffs * 2][i]
            }
            let max = c[0]
            for (let j = 1; j < numCoeffs * 3; ++j) {
                max = Math.max(max, Math.abs(c[j]))
            }
            if (max === 0) {
                continue
            }
            for (let j = 0; j < numCoeffs; ++j) {
                c[j * 3 + 0] = Math.max(0, Math.min(t11, Math.floor(((c[j * 3 + 0] / max) * 0.5 + 0.5) * t11 + 0.5)))
                c[j * 3 + 1] = Math.max(0, Math.min(t10, Math.floor(((c[j * 3 + 1] / max) * 0.5 + 0.5) * t10 + 0.5)))
                c[j * 3 + 2] = Math.max(0, Math.min(t11, Math.floor(((c[j * 3 + 2] / max) * 0.5 + 0.5) * t11 + 0.5)))
            }
            float32[0] = max
            sh1to3Data[i * 4 + 0] = uint32[0]
            sh1to3Data[i * 4 + 1] = (c[0] << 21) | (c[1] << 11) | c[2]
            sh1to3Data[i * 4 + 2] = (c[3] << 21) | (c[4] << 11) | c[5]
            sh1to3Data[i * 4 + 3] = (c[6] << 21) | (c[7] << 11) | c[8]
            if (this.shBands > 1) {
                sh4to7Data[i * 4 + 0] = (c[9] << 21) | (c[10] << 11) | c[11]
                sh4to7Data[i * 4 + 1] = (c[12] << 21) | (c[13] << 11) | c[14]
                sh4to7Data[i * 4 + 2] = (c[15] << 21) | (c[16] << 11) | c[17]
                sh4to7Data[i * 4 + 3] = (c[18] << 21) | (c[19] << 11) | c[20]
                if (this.shBands > 2) {
                    sh8to11Data[i * 4 + 0] = (c[21] << 21) | (c[22] << 11) | c[23]
                    sh8to11Data[i * 4 + 1] = (c[24] << 21) | (c[25] << 11) | c[26]
                    sh8to11Data[i * 4 + 2] = (c[27] << 21) | (c[28] << 11) | c[29]
                    sh8to11Data[i * 4 + 3] = (c[30] << 21) | (c[31] << 11) | c[32]
                    sh12to15Data[i * 4 + 0] = (c[33] << 21) | (c[34] << 11) | c[35]
                    sh12to15Data[i * 4 + 1] = (c[36] << 21) | (c[37] << 11) | c[38]
                    sh12to15Data[i * 4 + 2] = (c[39] << 21) | (c[40] << 11) | c[41]
                    sh12to15Data[i * 4 + 3] = (c[42] << 21) | (c[43] << 11) | c[44]
                } else {
                    sh8to11Data[i] = (c[21] << 21) | (c[22] << 11) | c[23]
                }
            }
        }
        sh1to3Texture.unlock()
        sh4to7Texture?.unlock()
        sh8to11Texture?.unlock()
        sh12to15Texture?.unlock()
    }
    constructor(device, gsplatData) {
        super(device, gsplatData)
        const numSplats = gsplatData.numSplats
        this.shBands = gsplatData.shBands
        const streams = [
            {
                name: 'splatColor',
                format: PIXELFORMAT_RGBA16F,
            },
            {
                name: 'transformA',
                format: PIXELFORMAT_RGBA32U,
            },
            {
                name: 'transformB',
                format: PIXELFORMAT_RGBA16F,
            },
        ]
        if (this.shBands > 0) {
            streams.push({
                name: 'splatSH_1to3',
                format: PIXELFORMAT_RGBA32U,
            })
            if (this.shBands > 1) {
                streams.push({
                    name: 'splatSH_4to7',
                    format: PIXELFORMAT_RGBA32U,
                })
                if (this.shBands > 2) {
                    streams.push({
                        name: 'splatSH_8to11',
                        format: PIXELFORMAT_RGBA32U,
                    })
                    streams.push({
                        name: 'splatSH_12to15',
                        format: PIXELFORMAT_RGBA32U,
                    })
                } else {
                    streams.push({
                        name: 'splatSH_8to11',
                        format: PIXELFORMAT_R32U,
                    })
                }
            }
        }
        this._format = new GSplatFormat(device, streams, {
            readGLSL: '#include "gsplatUncompressedVS"',
            readWGSL: '#include "gsplatUncompressedVS"',
        })
        this.streams.init(this.format, numSplats)
        this.updateColorData(gsplatData)
        this.updateTransformData(gsplatData)
        if (this.shBands > 0) {
            this.updateSHData(gsplatData)
        }
    }
}

class GSplatSogResource extends GSplatResourceBase {
    _actualDestroy() {
        this.streams.textures.delete('packedTexture')
        this.streams.textures.delete('packedSh0')
        this.streams.textures.delete('packedShN')
        this.gsplatData.destroy()
        super._actualDestroy()
    }
    _populateParameters() {
        const { meta } = this.gsplatData
        if (meta.means) {
            this.parameters.set('means_mins', meta.means.mins)
            this.parameters.set('means_maxs', meta.means.maxs)
        }
        if (meta.version === 2) {
            ;['scales', 'sh0', 'shN'].forEach((name) => {
                const v = meta[name]
                if (v) {
                    this.parameters.set(`${name}_mins`, v.codebook[0])
                    this.parameters.set(`${name}_maxs`, v.codebook[255])
                }
            })
        } else {
            ;['scales', 'sh0'].forEach((name) => {
                const v = meta[name]
                if (v) {
                    this.parameters.set(`${name}_mins`, Math.min(...v.mins.slice(0, 3)))
                    this.parameters.set(`${name}_maxs`, Math.max(...v.maxs.slice(0, 3)))
                }
            })
            ;['shN'].forEach((name) => {
                const v = meta[name]
                if (v) {
                    this.parameters.set(`${name}_mins`, v.mins)
                    this.parameters.set(`${name}_maxs`, v.maxs)
                }
            })
        }
    }
    configureMaterialDefines(defines) {
        defines.set('SH_BANDS', this.gsplatData.shBands)
    }
    constructor(device, gsplatData) {
        super(device, gsplatData)
        const sizeTexture = gsplatData.means_l || gsplatData.packedTexture
        if (sizeTexture) {
            this.streams.textureDimensions.set(sizeTexture.width, sizeTexture.height)
        }
        if (gsplatData.packedTexture) {
            this.streams.textures.set('packedTexture', gsplatData.packedTexture)
        }
        if (gsplatData.packedSh0) {
            this.streams.textures.set('packedSh0', gsplatData.packedSh0)
        }
        if (gsplatData.packedShN) {
            this.streams.textures.set('packedShN', gsplatData.packedShN)
        }
        const streams = [
            {
                name: 'packedTexture',
                format: PIXELFORMAT_RGBA32U,
            },
        ]
        this._format = new GSplatFormat(device, streams, {
            readGLSL: '#include "gsplatSogVS"',
            readWGSL: '#include "gsplatSogVS"',
        })
        this._populateParameters()
    }
}

const FILLMODE_FILL_WINDOW = 'FILL_WINDOW'
const FILLMODE_KEEP_ASPECT = 'KEEP_ASPECT'
const RESOLUTION_AUTO = 'AUTO'
const RESOLUTION_FIXED = 'FIXED'

let currentApplication
function getApplication() {
    return currentApplication
}
function setApplication(app) {
    currentApplication = app
}

class FrameGraph {
    addRenderPass(renderPass) {
        renderPass.frameUpdate()
        const beforePasses = renderPass.beforePasses
        for (let i = 0; i < beforePasses.length; i++) {
            const pass = beforePasses[i]
            if (pass.enabled) {
                this.addRenderPass(pass)
            }
        }
        if (renderPass.enabled) {
            this.renderPasses.push(renderPass)
        }
        const afterPasses = renderPass.afterPasses
        for (let i = 0; i < afterPasses.length; i++) {
            const pass = afterPasses[i]
            if (pass.enabled) {
                this.addRenderPass(pass)
            }
        }
    }
    reset() {
        this.renderPasses.length = 0
    }
    compile() {
        const renderTargetMap = this.renderTargetMap
        const renderPasses = this.renderPasses
        for (let i = 0; i < renderPasses.length; i++) {
            const renderPass = renderPasses[i]
            renderPass._skipStart = false
            renderPass._skipEnd = false
            const renderTarget = renderPass.renderTarget
            if (renderTarget !== undefined) {
                const prevPass = renderTargetMap.get(renderTarget)
                if (prevPass) {
                    const count = renderPass.colorArrayOps.length
                    for (let j = 0; j < count; j++) {
                        const colorOps = renderPass.colorArrayOps[j]
                        if (!colorOps.clear) {
                            prevPass.colorArrayOps[j].store = true
                        }
                    }
                    if (!renderPass.depthStencilOps.clearDepth) {
                        prevPass.depthStencilOps.storeDepth = true
                    }
                    if (!renderPass.depthStencilOps.clearStencil) {
                        prevPass.depthStencilOps.storeStencil = true
                    }
                }
                renderTargetMap.set(renderTarget, renderPass)
            }
        }
        for (let i = 0; i < renderPasses.length - 1; i++) {
            const firstPass = renderPasses[i]
            const firstRT = firstPass.renderTarget
            const secondPass = renderPasses[i + 1]
            const secondRT = secondPass.renderTarget
            if (firstRT !== secondRT || firstRT === undefined) {
                continue
            }
            if (
                secondPass.depthStencilOps.clearDepth ||
                secondPass.depthStencilOps.clearStencil ||
                secondPass.colorArrayOps.some((colorOps) => colorOps.clear)
            ) {
                continue
            }
            if (firstPass.afterPasses.length > 0) {
                continue
            }
            if (secondPass.beforePasses.length > 0) {
                continue
            }
            firstPass._skipEnd = true
            secondPass._skipStart = true
        }
        let lastCubeTexture = null
        let lastCubeRenderPass = null
        for (let i = 0; i < renderPasses.length; i++) {
            const renderPass = renderPasses[i]
            const renderTarget = renderPass.renderTarget
            const thisTexture = renderTarget?.colorBuffer
            if (thisTexture?.cubemap) {
                if (lastCubeTexture === thisTexture) {
                    const count = lastCubeRenderPass.colorArrayOps.length
                    for (let j = 0; j < count; j++) {
                        lastCubeRenderPass.colorArrayOps[j].mipmaps = false
                    }
                }
                lastCubeTexture = renderTarget.colorBuffer
                lastCubeRenderPass = renderPass
            } else if (renderPass.requiresCubemaps) {
                lastCubeTexture = null
                lastCubeRenderPass = null
            }
        }
        renderTargetMap.clear()
    }
    render(device) {
        this.compile()
        const renderPasses = this.renderPasses
        for (let i = 0; i < renderPasses.length; i++) {
            renderPasses[i].render()
        }
    }
    constructor() {
        this.renderPasses = []
        this.renderTargetMap = new Map()
    }
}

class AreaLightCacheEntry {
    destroy() {
        this.texture0?.destroy()
        this.texture1?.destroy()
    }
    constructor(texture0, texture1) {
        this.texture0 = texture0
        this.texture1 = texture1
    }
}
const deviceCache = new DeviceCache()
class AreaLightLuts {
    static createTexture(device, format, size, postfix = '') {
        const tex = new Texture(device, {
            name: `AreaLightLUT${postfix}`,
            width: size,
            height: size,
            format: format,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            type: TEXTURETYPE_DEFAULT,
            magFilter: FILTER_LINEAR,
            minFilter: FILTER_NEAREST,
            anisotropy: 1,
            mipmaps: false,
        })
        return tex
    }
    static applyTextures(device, texture1, texture2) {
        deviceCache.remove(device)
        deviceCache.get(device, () => {
            return new AreaLightCacheEntry(texture1, texture1 === texture2 ? null : texture2)
        })
        device.scope.resolve('areaLightsLutTex1').setValue(texture1)
        device.scope.resolve('areaLightsLutTex2').setValue(texture2)
    }
    static createPlaceholder(device) {
        const texture = AreaLightLuts.createTexture(device, PIXELFORMAT_RGBA16F, 2, 'placeholder')
        const pixels = texture.lock()
        pixels.fill(0)
        texture.unlock()
        AreaLightLuts.applyTextures(device, texture, texture)
    }
    static set(device, ltcMat1, ltcMat2) {
        function buildTexture(device, data, format) {
            const texture = AreaLightLuts.createTexture(device, format, 64)
            texture.lock().set(data)
            texture.unlock()
            return texture
        }
        function convertToHalfFloat(data) {
            const count = data.length
            const ret = new Uint16Array(count)
            const float2Half = FloatPacking.float2Half
            for (let i = 0; i < count; i++) {
                ret[i] = float2Half(data[i])
            }
            return ret
        }
        const srcData1 = ltcMat1
        const srcData2 = ltcMat2
        const data1 = convertToHalfFloat(srcData1)
        const data2 = convertToHalfFloat(srcData2)
        const tex1 = buildTexture(device, data1, PIXELFORMAT_RGBA16F)
        const tex2 = buildTexture(device, data2, PIXELFORMAT_RGBA16F)
        AreaLightLuts.applyTextures(device, tex1, tex2)
    }
}

const DEFAULT_LOCALE = 'en-US'
const DEFAULT_LOCALE_FALLBACKS = {
    en: 'en-US',
    es: 'en-ES',
    zh: 'zh-CN',
    'zh-HK': 'zh-TW',
    'zh-TW': 'zh-HK',
    'zh-MO': 'zh-HK',
    fr: 'fr-FR',
    de: 'de-DE',
    it: 'it-IT',
    ru: 'ru-RU',
    ja: 'ja-JP',
}

const PLURALS = {}
function definePluralFn(locales, fn) {
    for (let i = 0, len = locales.length; i < len; i++) {
        PLURALS[locales[i]] = fn
    }
}
function getLang(locale) {
    const idx = locale.indexOf('-')
    if (idx !== -1) {
        return locale.substring(0, idx)
    }
    return locale
}
function replaceLang(locale, desiredLang) {
    const idx = locale.indexOf('-')
    if (idx !== -1) {
        return desiredLang + locale.substring(idx)
    }
    return desiredLang
}
function findAvailableLocale(desiredLocale, availableLocales) {
    if (availableLocales[desiredLocale]) {
        return desiredLocale
    }
    let fallback = DEFAULT_LOCALE_FALLBACKS[desiredLocale]
    if (fallback && availableLocales[fallback]) {
        return fallback
    }
    const lang = getLang(desiredLocale)
    fallback = DEFAULT_LOCALE_FALLBACKS[lang]
    if (availableLocales[fallback]) {
        return fallback
    }
    if (availableLocales[lang]) {
        return lang
    }
    return DEFAULT_LOCALE
}
definePluralFn(['ja', 'ko', 'th', 'vi', 'zh', 'id'], (n) => {
    return 0
})
definePluralFn(['fa', 'hi'], (n) => {
    if (n >= 0 && n <= 1) {
        return 0
    }
    return 1
})
definePluralFn(['fr', 'pt'], (n) => {
    if (n >= 0 && n < 2) {
        return 0
    }
    return 1
})
definePluralFn(['da'], (n) => {
    if (n === 1 || (!Number.isInteger(n) && n >= 0 && n <= 1)) {
        return 0
    }
    return 1
})
definePluralFn(['de', 'en', 'it', 'el', 'es', 'tr', 'fi', 'sv', 'nb', 'no', 'ur'], (n) => {
    if (n === 1) {
        return 0
    }
    return 1
})
definePluralFn(['ru', 'uk'], (n) => {
    if (Number.isInteger(n)) {
        const mod10 = n % 10
        const mod100 = n % 100
        if (mod10 === 1 && mod100 !== 11) {
            return 0
        } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
            return 1
        } else if (mod10 === 0 || (mod10 >= 5 && mod10 <= 9) || (mod100 >= 11 && mod100 <= 14)) {
            return 2
        }
    }
    return 3
})
definePluralFn(['pl'], (n) => {
    if (Number.isInteger(n)) {
        if (n === 1) {
            return 0
        }
        const mod10 = n % 10
        const mod100 = n % 100
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
            return 1
        } else if ((mod10 >= 0 && mod10 <= 1) || (mod10 >= 5 && mod10 <= 9) || (mod100 >= 12 && mod100 <= 14)) {
            return 2
        }
    }
    return 3
})
definePluralFn(['ar'], (n) => {
    if (n === 0) {
        return 0
    } else if (n === 1) {
        return 1
    } else if (n === 2) {
        return 2
    }
    if (Number.isInteger(n)) {
        const mod100 = n % 100
        if (mod100 >= 3 && mod100 <= 10) {
            return 3
        } else if (mod100 >= 11 && mod100 <= 99) {
            return 4
        }
    }
    return 5
})
const DEFAULT_PLURAL_FN = PLURALS[getLang(DEFAULT_LOCALE)]
function getPluralFn(lang) {
    return PLURALS[lang] || DEFAULT_PLURAL_FN
}

const ABSOLUTE_URL = new RegExp(
    '^' + '\\s*' + '(?:' + '(?:' + '[a-z]+[a-z0-9\\-+.]*' + ':' + ')?' + '//' + '|' + 'data:' + '|blob:' + ')',
    'i',
)

class AssetFile {
    equals(other) {
        return (
            this.url === other.url &&
            this.filename === other.filename &&
            this.hash === other.hash &&
            this.size === other.size &&
            this.opt === other.opt &&
            this.contents === other.contents
        )
    }
    constructor(url = '', filename = '', hash = null, size = null, opt = null, contents = null) {
        this.url = url
        this.filename = filename
        this.hash = hash
        this.size = size
        this.opt = opt
        this.contents = contents
    }
}

let assetIdCounter = -1
const VARIANT_SUPPORT = {
    pvr: 'extCompressedTexturePVRTC',
    dxt: 'extCompressedTextureS3TC',
    etc2: 'extCompressedTextureETC',
    etc1: 'extCompressedTextureETC1',
    basis: 'canvas',
}
const VARIANT_DEFAULT_PRIORITY = ['pvr', 'dxt', 'etc2', 'etc1', 'basis']
class Asset extends EventHandler {
    set name(value) {
        if (this._name === value) {
            return
        }
        const old = this._name
        this._name = value
        this.fire('name', this, this._name, old)
    }
    get name() {
        return this._name
    }
    set file(value) {
        if (value && value.variants && ['texture', 'textureatlas', 'bundle'].indexOf(this.type) !== -1) {
            const app = this.registry?._loader?._app || getApplication()
            const device = app?.graphicsDevice
            if (device) {
                for (let i = 0, len = VARIANT_DEFAULT_PRIORITY.length; i < len; i++) {
                    const variant = VARIANT_DEFAULT_PRIORITY[i]
                    if (value.variants[variant] && device[VARIANT_SUPPORT[variant]]) {
                        value = value.variants[variant]
                        break
                    }
                    if (app.enableBundles) {
                        const bundles = app.bundles.listBundlesForAsset(this)
                        if (
                            bundles &&
                            bundles.find((b) => {
                                return b?.file?.variants[variant]
                            })
                        ) {
                            break
                        }
                    }
                }
            }
        }
        const oldFile = this._file
        const newFile = value
            ? new AssetFile(value.url, value.filename, value.hash, value.size, value.opt, value.contents)
            : null
        if (!!newFile !== !!oldFile || (newFile && !newFile.equals(oldFile))) {
            this._file = newFile
            this.fire('change', this, 'file', newFile, oldFile)
            this.reload()
        }
    }
    get file() {
        return this._file
    }
    set data(value) {
        const old = this._data
        this._data = value
        if (value !== old) {
            this.fire('change', this, 'data', value, old)
            if (this.loaded) {
                this.registry._loader.patch(this, this.registry)
            }
        }
    }
    get data() {
        return this._data
    }
    set resource(value) {
        const _old = this._resources[0]
        this._resources[0] = value
        this.fire('change', this, 'resource', value, _old)
    }
    get resource() {
        return this._resources[0]
    }
    set resources(value) {
        const _old = this._resources
        this._resources = value
        this.fire('change', this, 'resources', value, _old)
    }
    get resources() {
        return this._resources
    }
    set preload(value) {
        value = !!value
        if (this._preload === value) {
            return
        }
        this._preload = value
        if (this._preload && !this.loaded && !this.loading && this.registry) {
            this.registry.load(this)
        }
    }
    get preload() {
        return this._preload
    }
    set loadFaces(value) {
        value = !!value
        if (!this.hasOwnProperty('_loadFaces') || value !== this._loadFaces) {
            this._loadFaces = value
            if (this.loaded) {
                this.registry._loader.patch(this, this.registry)
            }
        }
    }
    get loadFaces() {
        return this._loadFaces
    }
    getFileUrl() {
        const file = this.file
        if (!file || !file.url) {
            return null
        }
        let url = file.url
        if (this.registry && this.registry.prefix && !ABSOLUTE_URL.test(url)) {
            url = this.registry.prefix + url
        }
        if (this.type !== 'script' && file.hash) {
            const separator = url.indexOf('?') !== -1 ? '&' : '?'
            url += `${separator}t=${file.hash}`
        }
        return url
    }
    getAbsoluteUrl(relativePath) {
        if (relativePath.startsWith('blob:') || relativePath.startsWith('data:')) {
            return relativePath
        }
        const base = path.getDirectory(this.file.url)
        return path.join(base, relativePath)
    }
    getLocalizedAssetId(locale) {
        locale = findAvailableLocale(locale, this._i18n)
        return this._i18n[locale] || null
    }
    addLocalizedAssetId(locale, assetId) {
        this._i18n[locale] = assetId
        this.fire('add:localized', locale, assetId)
    }
    removeLocalizedAssetId(locale) {
        const assetId = this._i18n[locale]
        if (assetId) {
            delete this._i18n[locale]
            this.fire('remove:localized', locale, assetId)
        }
    }
    ready(callback, scope) {
        scope = scope || this
        if (this.loaded) {
            callback.call(scope, this)
        } else {
            this.once('load', (asset) => {
                callback.call(scope, asset)
            })
        }
    }
    reload() {
        if (this.loaded) {
            this.loaded = false
            this.registry.load(this)
        }
    }
    unload() {
        if (!this.loaded && this._resources.length === 0) {
            return
        }
        this.fire('unload', this)
        this.registry.fire(`unload:${this.id}`, this)
        const old = this._resources
        if (this.urlObject) {
            URL.revokeObjectURL(this.urlObject)
            this.urlObject = null
        }
        this.resources = []
        this.loaded = false
        if (this.file) {
            this.registry._loader.clearCache(this.getFileUrl(), this.type)
        }
        for (let i = 0; i < old.length; ++i) {
            old[i]?.destroy?.()
        }
    }
    static fetchArrayBuffer(loadUrl, callback, asset, maxRetries = 0) {
        if (asset?.file?.contents) {
            setTimeout(() => {
                callback(null, asset.file.contents)
            })
        } else {
            http.get(
                loadUrl,
                {
                    cache: true,
                    responseType: 'arraybuffer',
                    retry: maxRetries > 0,
                    maxRetries: maxRetries,
                    progress: asset,
                },
                callback,
            )
        }
    }
    constructor(name, type, file, data = {}, options = {}) {
        ;(super(),
            (this._file = null),
            (this._i18n = {}),
            (this._preload = false),
            (this._resources = []),
            (this.id = assetIdCounter--),
            (this.loaded = false),
            (this.loading = false),
            (this.options = {}),
            (this.registry = null),
            (this.tags = new Tags(this)),
            (this.urlObject = null))
        this._name = name || ''
        this.type = type
        this._data = data || {}
        this.options = options || {}
        if (file) this.file = file
    }
}
Asset.EVENT_LOAD = 'load'
Asset.EVENT_UNLOAD = 'unload'
Asset.EVENT_REMOVE = 'remove'
Asset.EVENT_ERROR = 'error'
Asset.EVENT_CHANGE = 'change'
Asset.EVENT_PROGRESS = 'progress'
Asset.EVENT_ADDLOCALIZED = 'add:localized'
Asset.EVENT_REMOVELOCALIZED = 'remove:localized'

class TagsCache {
    addItem(item) {
        const tags = item.tags._list
        for (const tag of tags) {
            this.add(tag, item)
        }
    }
    removeItem(item) {
        const tags = item.tags._list
        for (const tag of tags) {
            this.remove(tag, item)
        }
    }
    add(tag, item) {
        if (this._index[tag] && this._index[tag].list.indexOf(item) !== -1) {
            return
        }
        if (!this._index[tag]) {
            this._index[tag] = {
                list: [],
            }
            if (this._key) {
                this._index[tag].keys = {}
            }
        }
        this._index[tag].list.push(item)
        if (this._key) {
            this._index[tag].keys[item[this._key]] = item
        }
    }
    remove(tag, item) {
        if (!this._index[tag]) {
            return
        }
        if (this._key) {
            if (!this._index[tag].keys[item[this._key]]) {
                return
            }
        }
        const ind = this._index[tag].list.indexOf(item)
        if (ind === -1) {
            return
        }
        this._index[tag].list.splice(ind, 1)
        if (this._key) {
            delete this._index[tag].keys[item[this._key]]
        }
        if (this._index[tag].list.length === 0) {
            delete this._index[tag]
        }
    }
    find(args) {
        const index = {}
        const items = []
        let item, tag, tags, tagsRest, missingIndex
        const sort = (a, b) => {
            return this._index[a].list.length - this._index[b].list.length
        }
        for (let i = 0; i < args.length; i++) {
            tag = args[i]
            if (tag instanceof Array) {
                if (tag.length === 0) {
                    continue
                }
                if (tag.length === 1) {
                    tag = tag[0]
                } else {
                    missingIndex = false
                    for (let t = 0; t < tag.length; t++) {
                        if (!this._index[tag[t]]) {
                            missingIndex = true
                            break
                        }
                    }
                    if (missingIndex) {
                        continue
                    }
                    tags = tag.slice(0).sort(sort)
                    tagsRest = tags.slice(1)
                    if (tagsRest.length === 1) {
                        tagsRest = tagsRest[0]
                    }
                    for (let n = 0; n < this._index[tags[0]].list.length; n++) {
                        item = this._index[tags[0]].list[n]
                        if (
                            (this._key ? !index[item[this._key]] : items.indexOf(item) === -1) &&
                            item.tags.has(tagsRest)
                        ) {
                            if (this._key) {
                                index[item[this._key]] = true
                            }
                            items.push(item)
                        }
                    }
                    continue
                }
            }
            if (tag && typeof tag === 'string' && this._index[tag]) {
                for (let n = 0; n < this._index[tag].list.length; n++) {
                    item = this._index[tag].list[n]
                    if (this._key) {
                        if (!index[item[this._key]]) {
                            index[item[this._key]] = true
                            items.push(item)
                        }
                    } else if (items.indexOf(item) === -1) {
                        items.push(item)
                    }
                }
            }
        }
        return items
    }
    constructor(key = null) {
        this._index = {}
        this._key = key
    }
}

class AssetRegistry extends EventHandler {
    get loader() {
        return this._loader
    }
    list(filters = {}) {
        const assets = Array.from(this._assets)
        if (filters.preload !== undefined) {
            return assets.filter((asset) => asset.preload === filters.preload)
        }
        return assets
    }
    add(asset) {
        if (this._assets.has(asset)) return
        this._assets.add(asset)
        this._idToAsset.set(asset.id, asset)
        if (asset.file?.url) {
            this._urlToAsset.set(asset.file.url, asset)
        }
        if (!this._nameToAsset.has(asset.name)) {
            this._nameToAsset.set(asset.name, new Set())
        }
        this._nameToAsset.get(asset.name).add(asset)
        asset.on('name', this._onNameChange, this)
        asset.registry = this
        this._tags.addItem(asset)
        asset.tags.on('add', this._onTagAdd, this)
        asset.tags.on('remove', this._onTagRemove, this)
        this.fire('add', asset)
        this.fire(`add:${asset.id}`, asset)
        if (asset.file?.url) {
            this.fire(`add:url:${asset.file.url}`, asset)
        }
        if (asset.preload) {
            this.load(asset)
        }
    }
    remove(asset) {
        if (!this._assets.has(asset)) return false
        this._assets.delete(asset)
        this._idToAsset.delete(asset.id)
        if (asset.file?.url) {
            this._urlToAsset.delete(asset.file.url)
        }
        asset.off('name', this._onNameChange, this)
        if (this._nameToAsset.has(asset.name)) {
            const items = this._nameToAsset.get(asset.name)
            items.delete(asset)
            if (items.size === 0) {
                this._nameToAsset.delete(asset.name)
            }
        }
        this._tags.removeItem(asset)
        asset.tags.off('add', this._onTagAdd, this)
        asset.tags.off('remove', this._onTagRemove, this)
        asset.fire('remove', asset)
        this.fire('remove', asset)
        this.fire(`remove:${asset.id}`, asset)
        if (asset.file?.url) {
            this.fire(`remove:url:${asset.file.url}`, asset)
        }
        return true
    }
    get(id) {
        return this._idToAsset.get(Number(id))
    }
    getByUrl(url) {
        return this._urlToAsset.get(url)
    }
    load(asset, options) {
        if ((asset.loading || asset.loaded) && !options?.force) {
            return
        }
        const file = asset.file
        const _fireLoad = () => {
            this.fire('load', asset)
            this.fire(`load:${asset.id}`, asset)
            if (file && file.url) {
                this.fire(`load:url:${file.url}`, asset)
            }
            asset.fire('load', asset)
        }
        const _opened = (resource) => {
            if (resource instanceof Array) {
                asset.resources = resource
            } else {
                asset.resource = resource
            }
            this._loader.patch(asset, this)
            if (asset.type === 'bundle') {
                const assetIds = asset.data.assets
                for (let i = 0; i < assetIds.length; i++) {
                    const assetInBundle = this._idToAsset.get(assetIds[i])
                    if (assetInBundle && !assetInBundle.loaded) {
                        this.load(assetInBundle, {
                            force: true,
                        })
                    }
                }
                if (asset.resource.loaded) {
                    _fireLoad()
                } else {
                    this.fire('load:start', asset)
                    this.fire(`load:start:${asset.id}`, asset)
                    if (file && file.url) {
                        this.fire(`load:start:url:${file.url}`, asset)
                    }
                    asset.fire('load:start', asset)
                    asset.resource.on('load', _fireLoad)
                }
            } else {
                _fireLoad()
            }
        }
        const _loaded = (err, resource, extra) => {
            asset.loaded = true
            asset.loading = false
            if (err) {
                this.fire('error', err, asset)
                this.fire(`error:${asset.id}`, err, asset)
                asset.fire('error', err, asset)
            } else {
                if (asset.type === 'script') {
                    const handler = this._loader.getHandler('script')
                    if (handler._cache[asset.id] && handler._cache[asset.id].parentNode === document.head) {
                        document.head.removeChild(handler._cache[asset.id])
                    }
                    if (extra) {
                        handler._cache[asset.id] = extra
                    }
                }
                _opened(resource)
            }
        }
        if (file || asset.type === 'cubemap') {
            this.fire('load:start', asset)
            this.fire(`load:${asset.id}:start`, asset)
            asset.loading = true
            const fileUrl = asset.getFileUrl()
            if (asset.type === 'bundle') {
                const assetIds = asset.data.assets
                for (let i = 0; i < assetIds.length; i++) {
                    const assetInBundle = this._idToAsset.get(assetIds[i])
                    if (!assetInBundle) {
                        continue
                    }
                    if (assetInBundle.loaded || assetInBundle.resource || assetInBundle.loading) {
                        continue
                    }
                    assetInBundle.loading = true
                }
            }
            this._loader.load(fileUrl, asset.type, _loaded, asset, options)
        } else {
            const resource = this._loader.open(asset.type, asset.data)
            asset.loaded = true
            _opened(resource)
        }
    }
    loadFromUrl(url, type, callback) {
        this.loadFromUrlAndFilename(url, null, type, callback)
    }
    loadFromUrlAndFilename(url, filename, type, callback) {
        const name = path.getBasename(filename || url)
        const file = {
            filename: filename || name,
            url: url,
        }
        let asset = this.getByUrl(url)
        if (!asset) {
            asset = new Asset(name, type, file)
            this.add(asset)
        } else if (asset.loaded) {
            callback(asset.loadFromUrlError || null, asset)
            return
        }
        const startLoad = (asset) => {
            asset.once('load', (loadedAsset) => {
                if (type === 'material') {
                    this._loadTextures(loadedAsset, (err, textures) => {
                        callback(err, loadedAsset)
                    })
                } else {
                    callback(null, loadedAsset)
                }
            })
            asset.once('error', (err) => {
                if (err) {
                    this.loadFromUrlError = err
                }
                callback(err, asset)
            })
            this.load(asset)
        }
        if (asset.resource) {
            callback(null, asset)
        } else if (type === 'model') {
            this._loadModel(asset, startLoad)
        } else {
            startLoad(asset)
        }
    }
    _loadModel(modelAsset, continuation) {
        const url = modelAsset.getFileUrl()
        const ext = path.getExtension(url)
        if (ext === '.json' || ext === '.glb') {
            const dir = path.getDirectory(url)
            const basename = path.getBasename(url)
            const mappingUrl = path.join(dir, basename.replace(ext, '.mapping.json'))
            this._loader.load(mappingUrl, 'json', (err, data) => {
                if (err) {
                    modelAsset.data = {
                        mapping: [],
                    }
                    continuation(modelAsset)
                } else {
                    this._loadMaterials(modelAsset, data, (e, materials) => {
                        modelAsset.data = data
                        continuation(modelAsset)
                    })
                }
            })
        } else {
            continuation(modelAsset)
        }
    }
    _loadMaterials(modelAsset, mapping, callback) {
        const materials = []
        let count = 0
        const onMaterialLoaded = (err, materialAsset) => {
            this._loadTextures(materialAsset, (err, textures) => {
                materials.push(materialAsset)
                if (materials.length === count) {
                    callback(null, materials)
                }
            })
        }
        for (let i = 0; i < mapping.mapping.length; i++) {
            const path = mapping.mapping[i].path
            if (path) {
                count++
                const url = modelAsset.getAbsoluteUrl(path)
                this.loadFromUrl(url, 'material', onMaterialLoaded)
            }
        }
        if (count === 0) {
            callback(null, materials)
        }
    }
    _loadTextures(materialAsset, callback) {
        const textures = []
        let count = 0
        const data = materialAsset.data
        if (data.mappingFormat !== 'path') {
            callback(null, textures)
            return
        }
        const onTextureLoaded = (err, texture) => {
            if (err) console.error(err)
            textures.push(texture)
            if (textures.length === count) {
                callback(null, textures)
            }
        }
        const texParams = standardMaterialTextureParameters
        for (let i = 0; i < texParams.length; i++) {
            const path = data[texParams[i]]
            if (path && typeof path === 'string') {
                count++
                const url = materialAsset.getAbsoluteUrl(path)
                this.loadFromUrl(url, 'texture', onTextureLoaded)
            }
        }
        if (count === 0) {
            callback(null, textures)
        }
    }
    _onTagAdd(tag, asset) {
        this._tags.add(tag, asset)
    }
    _onTagRemove(tag, asset) {
        this._tags.remove(tag, asset)
    }
    _onNameChange(asset, name, nameOld) {
        if (this._nameToAsset.has(nameOld)) {
            const items = this._nameToAsset.get(nameOld)
            items.delete(asset)
            if (items.size === 0) {
                this._nameToAsset.delete(nameOld)
            }
        }
        if (!this._nameToAsset.has(asset.name)) {
            this._nameToAsset.set(asset.name, new Set())
        }
        this._nameToAsset.get(asset.name).add(asset)
    }
    findByTag(...query) {
        return this._tags.find(query)
    }
    filter(callback) {
        return Array.from(this._assets).filter((asset) => callback(asset))
    }
    find(name, type) {
        const items = this._nameToAsset.get(name)
        if (!items) return null
        for (const asset of items) {
            if (!type || asset.type === type) {
                return asset
            }
        }
        return null
    }
    findAll(name, type) {
        const items = this._nameToAsset.get(name)
        if (!items) return []
        const results = Array.from(items)
        if (!type) return results
        return results.filter((asset) => asset.type === type)
    }
    log() {}
    constructor(loader) {
        ;(super(),
            (this._assets = new Set()),
            (this._idToAsset = new Map()),
            (this._urlToAsset = new Map()),
            (this._nameToAsset = new Map()),
            (this._tags = new TagsCache('id')),
            (this.prefix = null),
            (this.bundles = null))
        this._loader = loader
    }
}
AssetRegistry.EVENT_LOAD = 'load'
AssetRegistry.EVENT_ADD = 'add'
AssetRegistry.EVENT_REMOVE = 'remove'
AssetRegistry.EVENT_ERROR = 'error'

class BundleRegistry {
    _onAssetAdd(asset) {
        if (asset.type === 'bundle') {
            this._idToBundle.set(asset.id, asset)
            this._assets.on(`load:start:${asset.id}`, this._onBundleLoadStart, this)
            this._assets.on(`load:${asset.id}`, this._onBundleLoad, this)
            this._assets.on(`error:${asset.id}`, this._onBundleError, this)
            const assetIds = asset.data.assets
            for (let i = 0; i < assetIds.length; i++) {
                this._indexAssetInBundle(assetIds[i], asset)
            }
        } else {
            if (this._assetToBundles.has(asset.id)) {
                this._indexAssetFileUrls(asset)
            }
        }
    }
    _unbindAssetEvents(id) {
        this._assets.off(`load:start:${id}`, this._onBundleLoadStart, this)
        this._assets.off(`load:${id}`, this._onBundleLoad, this)
        this._assets.off(`error:${id}`, this._onBundleError, this)
    }
    _indexAssetInBundle(id, bundle) {
        let bundles = this._assetToBundles.get(id)
        if (!bundles) {
            bundles = new Set()
            this._assetToBundles.set(id, bundles)
        }
        bundles.add(bundle)
        const asset = this._assets.get(id)
        if (asset) this._indexAssetFileUrls(asset)
    }
    _indexAssetFileUrls(asset) {
        const urls = this._getAssetFileUrls(asset)
        if (!urls) return
        for (let i = 0; i < urls.length; i++) {
            const bundles = this._assetToBundles.get(asset.id)
            if (!bundles) continue
            this._urlsToBundles.set(urls[i], bundles)
        }
    }
    _getAssetFileUrls(asset) {
        let url = asset.getFileUrl()
        if (!url) return null
        url = url.split('?')[0]
        const urls = [url]
        if (asset.type === 'font') {
            const numFiles = asset.data.info.maps.length
            for (let i = 1; i < numFiles; i++) {
                urls.push(url.replace('.png', `${i}.png`))
            }
        }
        return urls
    }
    _onAssetRemove(asset) {
        if (asset.type === 'bundle') {
            this._idToBundle.delete(asset.id)
            this._unbindAssetEvents(asset.id)
            const assetIds = asset.data.assets
            for (let i = 0; i < assetIds.length; i++) {
                const bundles = this._assetToBundles.get(assetIds[i])
                if (!bundles) continue
                bundles.delete(asset)
                if (bundles.size === 0) {
                    this._assetToBundles.delete(assetIds[i])
                    for (const [url, otherBundles] of this._urlsToBundles) {
                        if (otherBundles !== bundles) {
                            continue
                        }
                        this._urlsToBundles.delete(url)
                    }
                }
            }
            this._onBundleError(`Bundle ${asset.id} was removed`)
        } else {
            const bundles = this._assetToBundles.get(asset.id)
            if (!bundles) return
            this._assetToBundles.delete(asset.id)
            const urls = this._getAssetFileUrls(asset)
            if (!urls) return
            for (let i = 0; i < urls.length; i++) {
                this._urlsToBundles.delete(urls[i])
            }
        }
    }
    _onBundleLoadStart(asset) {
        asset.resource.on('add', (url, data) => {
            const callbacks = this._fileRequests.get(url)
            if (!callbacks) return
            for (let i = 0; i < callbacks.length; i++) {
                callbacks[i](null, data)
            }
            this._fileRequests.delete(url)
        })
    }
    _onBundleLoad(asset) {
        if (!asset.resource) {
            this._onBundleError(`Bundle ${asset.id} failed to load`)
            return
        }
        if (!this._fileRequests) {
            return
        }
        for (const [url, requests] of this._fileRequests) {
            const bundles = this._urlsToBundles.get(url)
            if (!bundles || !bundles.has(asset)) continue
            const decodedUrl = decodeURIComponent(url)
            let err, data
            if (asset.resource.has(decodedUrl)) {
                data = asset.resource.get(decodedUrl)
            } else if (asset.resource.loaded) {
                err = `Bundle ${asset.id} does not contain URL ${url}`
            } else {
                continue
            }
            for (let i = 0; i < requests.length; i++) {
                requests[i](err, err || data)
            }
            this._fileRequests.delete(url)
        }
    }
    _onBundleError(err) {
        for (const [url, requests] of this._fileRequests) {
            const bundle = this._findLoadedOrLoadingBundleForUrl(url)
            if (!bundle) {
                for (let i = 0; i < requests.length; i++) {
                    requests[i](err)
                }
                this._fileRequests.delete(url)
            }
        }
    }
    _findLoadedOrLoadingBundleForUrl(url) {
        const bundles = this._urlsToBundles.get(url)
        if (!bundles) return null
        let candidate = null
        for (const bundle of bundles) {
            if (bundle.loaded && bundle.resource) {
                return bundle
            } else if (bundle.loading) {
                candidate = bundle
            }
        }
        return candidate
    }
    listBundlesForAsset(asset) {
        const bundles = this._assetToBundles.get(asset.id)
        if (bundles) return Array.from(bundles)
        return null
    }
    list() {
        return Array.from(this._idToBundle.values())
    }
    hasUrl(url) {
        return this._urlsToBundles.has(url)
    }
    urlIsLoadedOrLoading(url) {
        return !!this._findLoadedOrLoadingBundleForUrl(url)
    }
    loadUrl(url, callback) {
        const bundle = this._findLoadedOrLoadingBundleForUrl(url)
        if (!bundle) {
            callback(`URL ${url} not found in any bundles`)
            return
        }
        if (bundle.loaded) {
            const decodedUrl = decodeURIComponent(url)
            if (bundle.resource.has(decodedUrl)) {
                callback(null, bundle.resource.get(decodedUrl))
                return
            } else if (bundle.resource.loaded) {
                callback(`Bundle ${bundle.id} does not contain URL ${url}`)
                return
            }
        }
        let callbacks = this._fileRequests.get(url)
        if (!callbacks) {
            callbacks = []
            this._fileRequests.set(url, callbacks)
        }
        callbacks.push(callback)
    }
    destroy() {
        this._assets.off('add', this._onAssetAdd, this)
        this._assets.off('remove', this._onAssetRemove, this)
        for (const id of this._idToBundle.keys()) {
            this._unbindAssetEvents(id)
        }
        this._assets = null
        this._idToBundle.clear()
        this._idToBundle = null
        this._assetToBundles.clear()
        this._assetToBundles = null
        this._urlsToBundles.clear()
        this._urlsToBundles = null
        this._fileRequests.clear()
        this._fileRequests = null
    }
    constructor(assets) {
        this._idToBundle = new Map()
        this._assetToBundles = new Map()
        this._urlsToBundles = new Map()
        this._fileRequests = new Map()
        this._assets = assets
        this._assets.bundles = this
        this._assets.on('add', this._onAssetAdd, this)
        this._assets.on('remove', this._onAssetRemove, this)
    }
}

class ComponentSystemRegistry extends EventHandler {
    add(system) {
        const id = system.id
        if (this[id]) {
            throw new Error(`ComponentSystem name '${id}' already registered or not allowed`)
        }
        this[id] = system
        this.list.push(system)
    }
    remove(system) {
        const id = system.id
        if (!this[id]) {
            throw new Error(`No ComponentSystem named '${id}' registered`)
        }
        delete this[id]
        const index = this.list.indexOf(this[id])
        if (index !== -1) {
            this.list.splice(index, 1)
        }
    }
    destroy() {
        this.off()
        for (let i = 0; i < this.list.length; i++) {
            this.list[i].destroy()
        }
    }
    constructor() {
        super()
        this.list = []
    }
}

class Bundle extends EventHandler {
    addFile(url, data) {
        if (this._index.has(url)) {
            return
        }
        this._index.set(url, data)
        this.fire('add', url, data)
    }
    has(url) {
        return this._index.has(url)
    }
    get(url) {
        return this._index.get(url) || null
    }
    destroy() {
        this._index.clear()
    }
    set loaded(value) {
        if (!value || this._loaded) {
            return
        }
        this._loaded = true
        this.fire('load')
    }
    get loaded() {
        return this._loaded
    }
    constructor(...args) {
        ;(super(...args), (this._index = new Map()), (this._loaded = false))
    }
}
Bundle.EVENT_ADD = 'add'
Bundle.EVENT_LOAD = 'load'

class Untar extends EventHandler {
    pump(done, value) {
        if (done) {
            this.fire('done')
            return null
        }
        this.bytesReceived += value.byteLength
        const data = new Uint8Array(this.data.length + value.length)
        data.set(this.data)
        data.set(value, this.data.length)
        this.data = data
        while (this.readFile());
        return this.reader
            .read()
            .then((res) => {
                this.pump(res.done, res.value)
            })
            .catch((err) => {
                this.fire('error', err)
            })
    }
    readFile() {
        if (!this.headerRead && this.bytesReceived > this.bytesRead + this.headerSize) {
            this.headerRead = true
            const view = new DataView(this.data.buffer, this.bytesRead, this.headerSize)
            this.decoder ?? (this.decoder = new TextDecoder('windows-1252'))
            const headers = this.decoder.decode(view)
            this.fileName = headers.substring(0, 100).replace(/\0/g, '')
            this.fileSize = parseInt(headers.substring(124, 136), 8)
            this.fileType = headers.substring(156, 157)
            this.ustarFormat = headers.substring(257, 263)
            if (this.ustarFormat.indexOf('ustar') !== -1) {
                const prefix = headers.substring(345, 500).replace(/\0/g, '')
                if (prefix.length > 0) {
                    this.fileName = prefix.trim() + this.fileName.trim()
                }
            }
            this.bytesRead += 512
        }
        if (this.headerRead) {
            if (this.bytesReceived < this.bytesRead + this.fileSize) {
                return false
            }
            if (this.fileType === '' || this.fileType === '0') {
                const dataView = new DataView(this.data.buffer, this.bytesRead, this.fileSize)
                const file = {
                    name: this.prefix + this.fileName,
                    size: this.fileSize,
                    data: dataView,
                }
                this.fire('file', file)
            }
            this.bytesRead += this.fileSize
            this.headerRead = false
            const bytesRemained = this.bytesRead % this.paddingSize
            if (bytesRemained !== 0) {
                this.bytesRead += this.paddingSize - bytesRemained
            }
            return true
        }
        return false
    }
    constructor(fetchPromise, assetsPrefix = '') {
        ;(super(),
            (this.headerSize = 512),
            (this.paddingSize = 512),
            (this.bytesRead = 0),
            (this.bytesReceived = 0),
            (this.headerRead = false),
            (this.reader = null),
            (this.data = new Uint8Array(0)),
            (this.decoder = null),
            (this.prefix = ''),
            (this.fileName = ''),
            (this.fileSize = 0),
            (this.fileType = ''),
            (this.ustarFormat = ''))
        this.prefix = assetsPrefix || ''
        this.reader = fetchPromise.body.getReader()
        this.reader
            .read()
            .then((res) => {
                this.pump(res.done, res.value)
            })
            .catch((err) => {
                this.fire('error', err)
            })
    }
}

class ResourceHandler {
    set maxRetries(value) {
        this._maxRetries = value
    }
    get maxRetries() {
        return this._maxRetries
    }
    load(url, callback, asset) {}
    open(url, data, asset) {
        return data
    }
    patch(asset, assets) {}
    constructor(app, handlerType) {
        this.handlerType = ''
        this._maxRetries = 0
        this._app = app
        this.handlerType = handlerType
    }
}

class BundleHandler extends ResourceHandler {
    _fetchRetries(url, options, retries = 0) {
        return new Promise((resolve, reject) => {
            const tryFetch = () => {
                fetch(url, options)
                    .then(resolve)
                    .catch((err) => {
                        retries++
                        if (retries < this.maxRetries) {
                            tryFetch()
                        } else {
                            reject(err)
                        }
                    })
            }
            tryFetch()
        })
    }
    load(url, callback) {
        if (typeof url === 'string') {
            url = {
                load: url,
                original: url,
            }
        }
        this._fetchRetries(
            url.load,
            {
                mode: 'cors',
            },
            this.maxRetries,
        )
            .then((res) => {
                const bundle = new Bundle()
                callback(null, bundle)
                const untar = new Untar(res, this._assets.prefix)
                untar.on('file', (file) => {
                    bundle.addFile(file.name, file.data)
                })
                untar.on('done', () => {
                    bundle.loaded = true
                })
                untar.on('error', (err) => {
                    callback(err)
                })
            })
            .catch((err) => {
                callback(err)
            })
    }
    open(url, bundle) {
        return bundle
    }
    constructor(app) {
        super(app, 'bundle')
        this._assets = app.assets
    }
}

class ResourceLoader {
    addHandler(type, handler) {
        this._handlers[type] = handler
        handler._loader = this
    }
    removeHandler(type) {
        delete this._handlers[type]
    }
    getHandler(type) {
        return this._handlers[type]
    }
    static makeKey(url, type) {
        return `${url}-${type}`
    }
    load(url, type, callback, asset, options) {
        const handler = this._handlers[type]
        if (!handler) {
            const err = `No resource handler for asset type: '${type}' when loading [${url}]`
            callback(err)
            return
        }
        if (!url) {
            this._loadNull(handler, callback, asset)
            return
        }
        const key = ResourceLoader.makeKey(url, type)
        if (this._cache[key] !== undefined) {
            callback(null, this._cache[key])
        } else if (this._requests[key]) {
            this._requests[key].push(callback)
        } else {
            this._requests[key] = [callback]
            const self = this
            const handleLoad = function (err, urlObj) {
                if (err) {
                    self._onFailure(key, err)
                    return
                }
                if (urlObj.load instanceof DataView) {
                    if (handler.openBinary) {
                        if (!self._requests[key]) {
                            return
                        }
                        try {
                            const data = handler.openBinary(urlObj.load)
                            self._onSuccess(key, data)
                        } catch (err) {
                            self._onFailure(key, err)
                        }
                        return
                    }
                    urlObj.load = URL.createObjectURL(new Blob([urlObj.load]))
                    if (asset) {
                        if (asset.urlObject) {
                            URL.revokeObjectURL(asset.urlObject)
                        }
                        asset.urlObject = urlObj.load
                    }
                }
                handler.load(
                    urlObj,
                    (err, data, extra) => {
                        if (!self._requests[key]) {
                            return
                        }
                        if (err) {
                            self._onFailure(key, err)
                            return
                        }
                        try {
                            self._onSuccess(key, handler.open(urlObj.original, data, asset), extra)
                        } catch (e) {
                            self._onFailure(key, e)
                        }
                    },
                    asset,
                )
            }
            const normalizedUrl = url.split('?')[0]
            if (
                this._app.enableBundles &&
                this._app.bundles.hasUrl(normalizedUrl) &&
                !(options && options.bundlesIgnore)
            ) {
                if (!this._app.bundles.urlIsLoadedOrLoading(normalizedUrl)) {
                    const bundles = this._app.bundles.listBundlesForAsset(asset)
                    let bundle
                    if (options && options.bundlesFilter) {
                        bundle = options.bundlesFilter(bundles)
                    }
                    if (!bundle) {
                        bundles?.sort((a, b) => {
                            return a.file.size - b.file.size
                        })
                        bundle = bundles?.[0]
                    }
                    if (bundle) this._app.assets?.load(bundle)
                }
                this._app.bundles.loadUrl(normalizedUrl, (err, fileUrlFromBundle) => {
                    handleLoad(err, {
                        load: fileUrlFromBundle,
                        original: normalizedUrl,
                    })
                })
            } else {
                handleLoad(null, {
                    load: url,
                    original: (asset && asset.file.filename) || url,
                })
            }
        }
    }
    _loadNull(handler, callback, asset) {
        const onLoad = function (err, data, extra) {
            if (err) {
                callback(err)
            } else {
                try {
                    callback(null, handler.open(null, data, asset), extra)
                } catch (e) {
                    callback(e)
                }
            }
        }
        handler.load(null, onLoad, asset)
    }
    _onSuccess(key, result, extra) {
        if (result !== null) {
            this._cache[key] = result
        } else {
            delete this._cache[key]
        }
        for (let i = 0; i < this._requests[key].length; i++) {
            this._requests[key][i](null, result, extra)
        }
        delete this._requests[key]
    }
    _onFailure(key, err) {
        console.error(err)
        if (this._requests[key]) {
            for (let i = 0; i < this._requests[key].length; i++) {
                this._requests[key][i](err)
            }
            delete this._requests[key]
        }
    }
    open(type, data) {
        const handler = this._handlers[type]
        if (!handler) {
            console.warn(`No resource handler found for: ${type}`)
            return data
        }
        return handler.open(null, data)
    }
    patch(asset, assets) {
        const handler = this._handlers[asset.type]
        if (!handler) {
            console.warn(`No resource handler found for: ${asset.type}`)
            return
        }
        if (handler.patch) {
            handler.patch(asset, assets)
        }
    }
    clearCache(url, type) {
        const key = ResourceLoader.makeKey(url, type)
        delete this._cache[key]
    }
    getFromCache(url, type) {
        const key = ResourceLoader.makeKey(url, type)
        if (this._cache[key]) {
            return this._cache[key]
        }
        return undefined
    }
    enableRetry(maxRetries = 5) {
        maxRetries = Math.max(0, maxRetries) || 0
        for (const key in this._handlers) {
            this._handlers[key].maxRetries = maxRetries
        }
    }
    disableRetry() {
        for (const key in this._handlers) {
            this._handlers[key].maxRetries = 0
        }
    }
    destroy() {
        this._handlers = {}
        this._requests = {}
        this._cache = {}
    }
    constructor(app) {
        this._handlers = {}
        this._requests = {}
        this._cache = {}
        this._app = app
    }
}

class I18nParser {
    _validate(data) {
        if (!data.header) {
            throw new Error('pc.I18n#addData: Missing "header" field')
        }
        if (!data.header.version) {
            throw new Error('pc.I18n#addData: Missing "header.version" field')
        }
        if (data.header.version !== 1) {
            throw new Error('pc.I18n#addData: Invalid "header.version" field')
        }
        if (!data.data) {
            throw new Error('pc.I18n#addData: Missing "data" field')
        } else if (!Array.isArray(data.data)) {
            throw new Error('pc.I18n#addData: "data" field must be an array')
        }
        for (let i = 0, len = data.data.length; i < len; i++) {
            const entry = data.data[i]
            if (!entry.info) {
                throw new Error(`pc.I18n#addData: missing "data[${i}].info" field`)
            }
            if (!entry.info.locale) {
                throw new Error(`pc.I18n#addData: missing "data[${i}].info.locale" field`)
            }
            if (typeof entry.info.locale !== 'string') {
                throw new Error(`pc.I18n#addData: "data[${i}].info.locale" must be a string`)
            }
            if (!entry.messages) {
                throw new Error(`pc.I18n#addData: missing "data[${i}].messages" field`)
            }
        }
    }
    parse(data) {
        return data.data
    }
}

class I18n extends EventHandler {
    set assets(value) {
        const index = {}
        for (let i = 0, len = value.length; i < len; i++) {
            const id = value[i] instanceof Asset ? value[i].id : value[i]
            index[id] = true
        }
        let i = this._assets.length
        while (i--) {
            const id = this._assets[i]
            if (!index[id]) {
                this._app.assets.off(`add:${id}`, this._onAssetAdd, this)
                const asset = this._app.assets.get(id)
                if (asset) {
                    this._onAssetRemove(asset)
                }
                this._assets.splice(i, 1)
            }
        }
        for (const id in index) {
            const idNum = parseInt(id, 10)
            if (this._assets.indexOf(idNum) !== -1) continue
            this._assets.push(idNum)
            const asset = this._app.assets.get(idNum)
            if (!asset) {
                this._app.assets.once(`add:${idNum}`, this._onAssetAdd, this)
            } else {
                this._onAssetAdd(asset)
            }
        }
    }
    get assets() {
        return this._assets
    }
    set locale(value) {
        if (this._locale === value) {
            return
        }
        let lang = getLang(value)
        if (lang === 'in') {
            lang = 'id'
            value = replaceLang(value, lang)
            if (this._locale === value) {
                return
            }
        }
        const old = this._locale
        this._locale = value
        this._lang = lang
        this._pluralFn = getPluralFn(this._lang)
        this.fire(I18n.EVENT_CHANGE, value, old)
    }
    get locale() {
        return this._locale
    }
    static findAvailableLocale(desiredLocale, availableLocales) {
        return findAvailableLocale(desiredLocale, availableLocales)
    }
    findAvailableLocale(desiredLocale) {
        if (this._translations[desiredLocale]) {
            return desiredLocale
        }
        const lang = getLang(desiredLocale)
        return this._findFallbackLocale(desiredLocale, lang)
    }
    getText(key, locale) {
        let result = key
        let lang
        if (!locale) {
            locale = this._locale
            lang = this._lang
        }
        let translations = this._translations[locale]
        if (!translations) {
            if (!lang) {
                lang = getLang(locale)
            }
            locale = this._findFallbackLocale(locale, lang)
            translations = this._translations[locale]
        }
        if (translations && translations.hasOwnProperty(key)) {
            result = translations[key]
            if (Array.isArray(result)) {
                result = result[0]
            }
            if (result === null || result === undefined) {
                result = key
            }
        }
        return result
    }
    getPluralText(key, n, locale) {
        let result = key
        let lang
        let pluralFn
        if (!locale) {
            locale = this._locale
            lang = this._lang
            pluralFn = this._pluralFn
        } else {
            lang = getLang(locale)
            pluralFn = getPluralFn(lang)
        }
        let translations = this._translations[locale]
        if (!translations) {
            locale = this._findFallbackLocale(locale, lang)
            lang = getLang(locale)
            pluralFn = getPluralFn(lang)
            translations = this._translations[locale]
        }
        if (translations && translations[key] && pluralFn) {
            const index = pluralFn(n)
            result = translations[key][index]
            if (result === null || result === undefined) {
                result = key
            }
        }
        return result
    }
    addData(data) {
        let parsed
        try {
            parsed = this._parser.parse(data)
        } catch (err) {
            console.error(err)
            return
        }
        for (let i = 0, len = parsed.length; i < len; i++) {
            const entry = parsed[i]
            const locale = entry.info.locale
            const messages = entry.messages
            if (!this._translations[locale]) {
                this._translations[locale] = {}
                const lang = getLang(locale)
                if (!this._availableLangs[lang]) {
                    this._availableLangs[lang] = locale
                }
            }
            Object.assign(this._translations[locale], messages)
            this.fire('data:add', locale, messages)
        }
    }
    removeData(data) {
        let parsed
        try {
            parsed = this._parser.parse(data)
        } catch (err) {
            console.error(err)
            return
        }
        for (let i = 0, len = parsed.length; i < len; i++) {
            const entry = parsed[i]
            const locale = entry.info.locale
            const translations = this._translations[locale]
            if (!translations) continue
            const messages = entry.messages
            for (const key in messages) {
                delete translations[key]
            }
            if (Object.keys(translations).length === 0) {
                delete this._translations[locale]
                delete this._availableLangs[getLang(locale)]
            }
            this.fire('data:remove', locale, messages)
        }
    }
    destroy() {
        this._translations = null
        this._availableLangs = null
        this._assets = null
        this._parser = null
        this.off()
    }
    _findFallbackLocale(locale, lang) {
        let result = DEFAULT_LOCALE_FALLBACKS[locale]
        if (result && this._translations[result]) {
            return result
        }
        result = DEFAULT_LOCALE_FALLBACKS[lang]
        if (result && this._translations[result]) {
            return result
        }
        result = this._availableLangs[lang]
        if (result && this._translations[result]) {
            return result
        }
        return DEFAULT_LOCALE
    }
    _onAssetAdd(asset) {
        asset.on('load', this._onAssetLoad, this)
        asset.on('change', this._onAssetChange, this)
        asset.on('remove', this._onAssetRemove, this)
        asset.on('unload', this._onAssetUnload, this)
        if (asset.resource) {
            this._onAssetLoad(asset)
        }
    }
    _onAssetLoad(asset) {
        this.addData(asset.resource)
    }
    _onAssetChange(asset) {
        if (asset.resource) {
            this.addData(asset.resource)
        }
    }
    _onAssetRemove(asset) {
        asset.off('load', this._onAssetLoad, this)
        asset.off('change', this._onAssetChange, this)
        asset.off('remove', this._onAssetRemove, this)
        asset.off('unload', this._onAssetUnload, this)
        if (asset.resource) {
            this.removeData(asset.resource)
        }
        this._app.assets.once(`add:${asset.id}`, this._onAssetAdd, this)
    }
    _onAssetUnload(asset) {
        if (asset.resource) {
            this.removeData(asset.resource)
        }
    }
    constructor(app) {
        super()
        this.locale = DEFAULT_LOCALE
        this._translations = {}
        this._availableLangs = {}
        this._app = app
        this._assets = []
        this._parser = new I18nParser()
    }
}
I18n.EVENT_CHANGE = 'change'

class ScriptRegistry extends EventHandler {
    destroy() {
        this.app = null
        this.off()
    }
    addSchema(id, schema) {
        if (!schema) return
        this._scriptSchemas.set(id, schema)
    }
    getSchema(id) {
        return this._scriptSchemas.get(id)
    }
    add(script) {
        const scriptName = script.__name
        if (this._scripts.hasOwnProperty(scriptName)) {
            setTimeout(() => {
                if (script.prototype.swap) {
                    const old = this._scripts[scriptName]
                    const ind = this._list.indexOf(old)
                    this._list[ind] = script
                    this._scripts[scriptName] = script
                    this.fire('swap', scriptName, script)
                    this.fire(`swap:${scriptName}`, script)
                } else {
                    console.warn(
                        `script registry already has '${scriptName}' script, define 'swap' method for new script type to enable code hot swapping`,
                    )
                }
            })
            return false
        }
        this._scripts[scriptName] = script
        this._list.push(script)
        this.fire('add', scriptName, script)
        this.fire(`add:${scriptName}`, script)
        setTimeout(() => {
            if (!this._scripts.hasOwnProperty(scriptName)) {
                return
            }
            if (!this.app || !this.app.systems || !this.app.systems.script) {
                return
            }
            const components = this.app.systems.script._components
            let attributes
            const scriptInstances = []
            const scriptInstancesInitialized = []
            for (components.loopIndex = 0; components.loopIndex < components.length; components.loopIndex++) {
                const component = components.items[components.loopIndex]
                if (component._scriptsIndex[scriptName] && component._scriptsIndex[scriptName].awaiting) {
                    if (component._scriptsData && component._scriptsData[scriptName]) {
                        attributes = component._scriptsData[scriptName].attributes
                    }
                    const scriptInstance = component.create(scriptName, {
                        preloading: true,
                        ind: component._scriptsIndex[scriptName].ind,
                        attributes: attributes,
                    })
                    if (scriptInstance) {
                        scriptInstances.push(scriptInstance)
                    }
                    for (const script of component.scripts) {
                        component.initializeAttributes(script)
                    }
                }
            }
            for (let i = 0; i < scriptInstances.length; i++) {
                if (scriptInstances[i].enabled) {
                    scriptInstances[i]._initialized = true
                    scriptInstancesInitialized.push(scriptInstances[i])
                    if (scriptInstances[i].initialize) {
                        scriptInstances[i].initialize()
                    }
                }
            }
            for (let i = 0; i < scriptInstancesInitialized.length; i++) {
                if (!scriptInstancesInitialized[i].enabled || scriptInstancesInitialized[i]._postInitialized) {
                    continue
                }
                scriptInstancesInitialized[i]._postInitialized = true
                if (scriptInstancesInitialized[i].postInitialize) {
                    scriptInstancesInitialized[i].postInitialize()
                }
            }
        })
        return true
    }
    remove(nameOrType) {
        let scriptType = nameOrType
        let scriptName = nameOrType
        if (typeof scriptName !== 'string') {
            scriptName = scriptType.__name
        } else {
            scriptType = this.get(scriptName)
        }
        if (this.get(scriptName) !== scriptType) {
            return false
        }
        delete this._scripts[scriptName]
        const ind = this._list.indexOf(scriptType)
        this._list.splice(ind, 1)
        this.fire('remove', scriptName, scriptType)
        this.fire(`remove:${scriptName}`, scriptType)
        return true
    }
    get(name) {
        return this._scripts[name] || null
    }
    has(nameOrType) {
        if (typeof nameOrType === 'string') {
            return this._scripts.hasOwnProperty(nameOrType)
        }
        if (!nameOrType) return false
        const scriptName = nameOrType.__name
        return this._scripts[scriptName] === nameOrType
    }
    list() {
        return this._list
    }
    constructor(app) {
        ;(super(), (this._scripts = {}), (this._list = []), (this._scriptSchemas = new Map()))
        this.app = app
    }
}

const cmpStaticOrder = (a, b) => a.constructor.order - b.constructor.order
const sortStaticOrder = (arr) => arr.sort(cmpStaticOrder)
const _enableList = []
const tmpPool = []
const getTempArray = () => {
    return tmpPool.pop() ?? []
}
const releaseTempArray = (a) => {
    a.length = 0
    tmpPool.push(a)
}
class Entity extends GraphNode {
    addComponent(type, data) {
        const system = this._app.systems[type]
        if (!system) {
            return null
        }
        if (this.c[type]) {
            return null
        }
        return system.addComponent(this, data)
    }
    removeComponent(type) {
        const system = this._app.systems[type]
        if (!system) {
            return
        }
        if (!this.c[type]) {
            return
        }
        system.removeComponent(this)
    }
    findComponent(type) {
        const entity = this.findOne((entity) => entity.c?.[type])
        return entity && entity.c[type]
    }
    findComponents(type) {
        return this.find((entity) => entity.c?.[type]).map((entity) => entity.c[type])
    }
    findScript(nameOrType) {
        const entity = this.findOne((node) => node.c?.script?.has(nameOrType))
        return entity?.c.script.get(nameOrType)
    }
    findScripts(nameOrType) {
        const entities = this.find((node) => node.c?.script?.has(nameOrType))
        return entities.map((entity) => entity.c.script.get(nameOrType))
    }
    getGuid() {
        if (!this._guid) {
            this.setGuid(guid.create())
        }
        return this._guid
    }
    setGuid(guid) {
        const index = this._app._entityIndex
        if (this._guid) {
            delete index[this._guid]
        }
        this._guid = guid
        index[this._guid] = this
    }
    _notifyHierarchyStateChanged(node, enabled) {
        let enableFirst = false
        if (node === this && _enableList.length === 0) {
            enableFirst = true
        }
        node._beingEnabled = true
        node._onHierarchyStateChanged(enabled)
        if (node._onHierarchyStatePostChanged) {
            _enableList.push(node)
        }
        const c = node._children
        for (let i = 0, len = c.length; i < len; i++) {
            if (c[i]._enabled) {
                this._notifyHierarchyStateChanged(c[i], enabled)
            }
        }
        node._beingEnabled = false
        if (enableFirst) {
            for (let i = 0; i < _enableList.length; i++) {
                _enableList[i]._onHierarchyStatePostChanged()
            }
            _enableList.length = 0
        }
    }
    _onHierarchyStateChanged(enabled) {
        super._onHierarchyStateChanged(enabled)
        const components = this._getSortedComponents()
        for (let i = 0; i < components.length; i++) {
            const component = components[i]
            if (component.enabled) {
                if (enabled) {
                    component.onEnable()
                } else {
                    component.onDisable()
                }
            }
        }
        releaseTempArray(components)
    }
    _onHierarchyStatePostChanged() {
        const components = this._getSortedComponents()
        for (let i = 0; i < components.length; i++) {
            components[i].onPostStateChange()
        }
        releaseTempArray(components)
    }
    findByGuid(guid) {
        if (this._guid === guid) return this
        const e = this._app._entityIndex[guid]
        if (e && (e === this || e.isDescendantOf(this))) {
            return e
        }
        return null
    }
    destroy() {
        this._destroying = true
        for (const name in this.c) {
            this.c[name].enabled = false
        }
        for (const name in this.c) {
            this.c[name].system.removeComponent(this)
        }
        super.destroy()
        if (this._guid) {
            delete this._app._entityIndex[this._guid]
        }
        this._destroying = false
    }
    clone() {
        const duplicatedIdsMap = {}
        const clone = this._cloneRecursively(duplicatedIdsMap)
        duplicatedIdsMap[this.getGuid()] = clone
        resolveDuplicatedEntityReferenceProperties(this, this, clone, duplicatedIdsMap)
        return clone
    }
    _getSortedComponents() {
        const components = this.c
        const sortedArray = getTempArray()
        let needSort = 0
        for (const type in components) {
            if (components.hasOwnProperty(type)) {
                const component = components[type]
                needSort |= component.constructor.order !== 0
                sortedArray.push(component)
            }
        }
        if (needSort && sortedArray.length > 1) {
            sortStaticOrder(sortedArray)
        }
        return sortedArray
    }
    _cloneRecursively(duplicatedIdsMap) {
        const clone = new this.constructor(undefined, this._app)
        super._cloneInternal(clone)
        for (const type in this.c) {
            const component = this.c[type]
            component.system.cloneComponent(this, clone)
        }
        for (let i = 0; i < this._children.length; i++) {
            const oldChild = this._children[i]
            if (oldChild instanceof Entity) {
                const newChild = oldChild._cloneRecursively(duplicatedIdsMap)
                clone.addChild(newChild)
                duplicatedIdsMap[oldChild.getGuid()] = newChild
            }
        }
        return clone
    }
    constructor(name, app = getApplication()) {
        ;(super(name), (this.c = {}), (this._destroying = false), (this._guid = null), (this._template = false))
        this._app = app
    }
}
Entity.EVENT_DESTROY = 'destroy'
function resolveDuplicatedEntityReferenceProperties(oldSubtreeRoot, oldEntity, newEntity, duplicatedIdsMap) {
    if (oldEntity instanceof Entity) {
        const components = oldEntity.c
        for (const componentName in components) {
            const component = components[componentName]
            const entityProperties = component.system.getPropertiesOfType('entity')
            for (let i = 0, len = entityProperties.length; i < len; i++) {
                const propertyDescriptor = entityProperties[i]
                const propertyName = propertyDescriptor.name
                const oldEntityReferenceId = component[propertyName]
                const entityIsWithinOldSubtree = !!oldSubtreeRoot.findByGuid(oldEntityReferenceId)
                if (entityIsWithinOldSubtree) {
                    const newEntityReferenceId = duplicatedIdsMap[oldEntityReferenceId].getGuid()
                    if (newEntityReferenceId) {
                        newEntity.c[componentName][propertyName] = newEntityReferenceId
                    }
                }
            }
        }
        if (components.script) {
            newEntity.script.resolveDuplicatedEntityReferenceProperties(components.script, duplicatedIdsMap)
        }
        if (components.render) {
            newEntity.render.resolveDuplicatedEntityReferenceProperties(components.render, duplicatedIdsMap)
        }
        if (components.button) {
            newEntity.button.resolveDuplicatedEntityReferenceProperties(components.button, duplicatedIdsMap)
        }
        if (components.scrollview) {
            newEntity.scrollview.resolveDuplicatedEntityReferenceProperties(components.scrollview, duplicatedIdsMap)
        }
        if (components.scrollbar) {
            newEntity.scrollbar.resolveDuplicatedEntityReferenceProperties(components.scrollbar, duplicatedIdsMap)
        }
        if (components.anim) {
            newEntity.anim.resolveDuplicatedEntityReferenceProperties(components.anim, duplicatedIdsMap)
        }
        const _old = oldEntity.children.filter((e) => e instanceof Entity)
        const _new = newEntity.children.filter((e) => e instanceof Entity)
        for (let i = 0, len = _old.length; i < len; i++) {
            resolveDuplicatedEntityReferenceProperties(oldSubtreeRoot, _old[i], _new[i], duplicatedIdsMap)
        }
    }
}

class SceneRegistryItem {
    get loaded() {
        return !!this.data
    }
    get loading() {
        return this._loading
    }
    constructor(name, url) {
        this.data = null
        this._loading = false
        this._onLoadedCallbacks = []
        this.name = name
        this.url = url
    }
}

class SceneRegistry {
    destroy() {
        this._app = null
    }
    list() {
        return this._list
    }
    add(name, url) {
        if (this._index.hasOwnProperty(name)) {
            return false
        }
        const item = new SceneRegistryItem(name, url)
        const i = this._list.push(item)
        this._index[item.name] = i - 1
        this._urlIndex[item.url] = i - 1
        return true
    }
    find(name) {
        if (this._index.hasOwnProperty(name)) {
            return this._list[this._index[name]]
        }
        return null
    }
    findByUrl(url) {
        if (this._urlIndex.hasOwnProperty(url)) {
            return this._list[this._urlIndex[url]]
        }
        return null
    }
    remove(name) {
        if (this._index.hasOwnProperty(name)) {
            const idx = this._index[name]
            let item = this._list[idx]
            delete this._urlIndex[item.url]
            delete this._index[name]
            this._list.splice(idx, 1)
            for (let i = 0; i < this._list.length; i++) {
                item = this._list[i]
                this._index[item.name] = i
                this._urlIndex[item.url] = i
            }
        }
    }
    _loadSceneData(sceneItem, storeInCache, callback) {
        const app = this._app
        let url = sceneItem
        if (typeof sceneItem === 'string') {
            sceneItem = this.findByUrl(url) || this.find(url) || new SceneRegistryItem('Untitled', url)
        }
        url = sceneItem.url
        if (!url) {
            callback('Cannot find scene to load')
            return
        }
        if (sceneItem.loaded) {
            callback(null, sceneItem)
            return
        }
        if (app.assets && app.assets.prefix && !ABSOLUTE_URL.test(url)) {
            url = path.join(app.assets.prefix, url)
        }
        sceneItem._onLoadedCallbacks.push(callback)
        if (!sceneItem._loading) {
            const handler = app.loader.getHandler('hierarchy')
            handler.load(url, (err, data) => {
                sceneItem.data = data
                sceneItem._loading = false
                for (let i = 0; i < sceneItem._onLoadedCallbacks.length; i++) {
                    sceneItem._onLoadedCallbacks[i](err, sceneItem)
                }
                if (!storeInCache) {
                    sceneItem.data = null
                }
                sceneItem._onLoadedCallbacks.length = 0
            })
        }
        sceneItem._loading = true
    }
    loadSceneData(sceneItem, callback) {
        this._loadSceneData(sceneItem, true, callback)
    }
    unloadSceneData(sceneItem) {
        if (typeof sceneItem === 'string') {
            sceneItem = this.findByUrl(sceneItem)
        }
        if (sceneItem) {
            sceneItem.data = null
        }
    }
    _loadSceneHierarchy(sceneItem, onBeforeAddHierarchy, callback) {
        this._loadSceneData(sceneItem, false, (err, sceneItem) => {
            if (err) {
                if (callback) {
                    callback(err)
                }
                return
            }
            if (onBeforeAddHierarchy) {
                onBeforeAddHierarchy(sceneItem)
            }
            const app = this._app
            const _loaded = () => {
                const handler = app.loader.getHandler('hierarchy')
                app.systems.script.preloading = true
                const entity = handler.open(sceneItem.url, sceneItem.data)
                app.systems.script.preloading = false
                app.loader.clearCache(sceneItem.url, 'hierarchy')
                app.root.addChild(entity)
                app.systems.fire('initialize', entity)
                app.systems.fire('postInitialize', entity)
                app.systems.fire('postPostInitialize', entity)
                if (callback) callback(null, entity)
            }
            app._preloadScripts(sceneItem.data, _loaded)
        })
    }
    loadSceneHierarchy(sceneItem, callback) {
        this._loadSceneHierarchy(sceneItem, null, callback)
    }
    loadSceneSettings(sceneItem, callback) {
        this._loadSceneData(sceneItem, false, (err, sceneItem) => {
            if (!err) {
                this._app.applySceneSettings(sceneItem.data.settings)
                if (callback) {
                    callback(null)
                }
            } else {
                if (callback) {
                    callback(err)
                }
            }
        })
    }
    changeScene(sceneItem, callback) {
        const app = this._app
        const onBeforeAddHierarchy = (sceneItem) => {
            const { children } = app.root
            while (children.length) {
                children[0].destroy()
            }
            app.applySceneSettings(sceneItem.data.settings)
        }
        this._loadSceneHierarchy(sceneItem, onBeforeAddHierarchy, callback)
    }
    loadScene(url, callback) {
        const app = this._app
        const handler = app.loader.getHandler('scene')
        if (app.assets && app.assets.prefix && !ABSOLUTE_URL.test(url)) {
            url = path.join(app.assets.prefix, url)
        }
        handler.load(url, (err, data) => {
            if (!err) {
                const _loaded = () => {
                    app.systems.script.preloading = true
                    const scene = handler.open(url, data)
                    const sceneItem = this.findByUrl(url)
                    if (sceneItem && !sceneItem.loaded) {
                        sceneItem.data = data
                    }
                    app.systems.script.preloading = false
                    app.loader.clearCache(url, 'scene')
                    app.loader.patch(
                        {
                            resource: scene,
                            type: 'scene',
                        },
                        app.assets,
                    )
                    app.root.addChild(scene.root)
                    if (app.systems.rigidbody && typeof Ammo !== 'undefined') {
                        app.systems.rigidbody.gravity.set(scene._gravity.x, scene._gravity.y, scene._gravity.z)
                    }
                    if (callback) {
                        callback(null, scene)
                    }
                }
                app._preloadScripts(data, _loaded)
            } else {
                if (callback) {
                    callback(err)
                }
            }
        })
    }
    constructor(app) {
        this._list = []
        this._index = {}
        this._urlIndex = {}
        this._app = app
    }
}

class ApplicationStats {
    get scene() {
        return getApplication().scene._stats
    }
    get lightmapper() {
        return getApplication().lightmapper?.stats
    }
    get batcher() {
        const batcher = getApplication()._batcher
        return batcher ? batcher._stats : null
    }
    frameEnd() {
        this.frame.gsplatSort = 0
    }
    constructor(device) {
        this.frame = {
            fps: 0,
            ms: 0,
            dt: 0,
            updateStart: 0,
            updateTime: 0,
            renderStart: 0,
            renderTime: 0,
            physicsStart: 0,
            physicsTime: 0,
            scriptUpdateStart: 0,
            scriptUpdate: 0,
            scriptPostUpdateStart: 0,
            scriptPostUpdate: 0,
            animUpdateStart: 0,
            animUpdate: 0,
            cullTime: 0,
            sortTime: 0,
            skinTime: 0,
            morphTime: 0,
            instancingTime: 0,
            triangles: 0,
            gsplats: 0,
            gsplatSort: 0,
            gsplatBufferCopy: 0,
            otherPrimitives: 0,
            shaders: 0,
            materials: 0,
            cameras: 0,
            shadowMapUpdates: 0,
            shadowMapTime: 0,
            depthMapTime: 0,
            forwardTime: 0,
            lightClustersTime: 0,
            lightClusters: 0,
            _timeToCountFrames: 0,
            _fpsAccum: 0,
        }
        this.drawCalls = {
            forward: 0,
            depth: 0,
            shadow: 0,
            immediate: 0,
            misc: 0,
            total: 0,
            skinned: 0,
            instanced: 0,
            removedByInstancing: 0,
        }
        this.misc = {
            renderTargetCreationTime: 0,
        }
        this.particles = {
            updatesPerFrame: 0,
            _updatesPerFrame: 0,
            frameTime: 0,
            _frameTime: 0,
        }
        this.shaders = device._shaderStats
        this.vram = device._vram
        this.gpu = device.gpuProfiler?.passTimings ?? new Map()
        Object.defineProperty(this.vram, 'totalUsed', {
            get: function () {
                return this.tex + this.vb + this.ib + this.ub + this.sb
            },
        })
        Object.defineProperty(this.vram, 'geom', {
            get: function () {
                return this.vb + this.ib
            },
        })
        Object.defineProperty(this.vram, 'buffers', {
            get: function () {
                return this.ub + this.sb
            },
        })
    }
}