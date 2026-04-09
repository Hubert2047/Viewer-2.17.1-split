var alphaTestPS$1 = `
uniform float alpha_ref;
void alphaTest(float a) {
	if (a < alpha_ref) discard;
}
`

var ambientPS$1 = `
#ifdef LIT_AMBIENT_SOURCE == AMBIENTSH
	uniform vec3 ambientSH[9];
#endif
#if LIT_AMBIENT_SOURCE == ENVALATLAS
	#include "envAtlasPS"
	#ifndef ENV_ATLAS
	#define ENV_ATLAS
		uniform sampler2D texture_envAtlas;
	#endif
#endif
void addAmbient(vec3 worldNormal) {
	#ifdef LIT_AMBIENT_SOURCE == AMBIENTSH
		vec3 n = cubeMapRotate(worldNormal);
		vec3 color =
			ambientSH[0] +
			ambientSH[1] * n.x +
			ambientSH[2] * n.y +
			ambientSH[3] * n.z +
			ambientSH[4] * n.x * n.z +
			ambientSH[5] * n.z * n.y +
			ambientSH[6] * n.y * n.x +
			ambientSH[7] * (3.0 * n.z * n.z - 1.0) +
			ambientSH[8] * (n.x * n.x - n.y * n.y);
		dDiffuseLight += processEnvironment(max(color, vec3(0.0)));
	#endif
	#if LIT_AMBIENT_SOURCE == ENVALATLAS
		vec3 dir = normalize(cubeMapRotate(worldNormal) * vec3(-1.0, 1.0, 1.0));
		vec2 uv = mapUv(toSphericalUv(dir), vec4(128.0, 256.0 + 128.0, 64.0, 32.0) / atlasSize);
		vec4 raw = texture2D(texture_envAtlas, uv);
		vec3 linear = {ambientDecode}(raw);
		dDiffuseLight += processEnvironment(linear);
	#endif
	#if LIT_AMBIENT_SOURCE == CONSTANT
		dDiffuseLight += light_globalAmbient;
	#endif
}
`

var anisotropyPS$1 = `
#ifdef LIT_GGX_SPECULAR
	uniform float material_anisotropyIntensity;
	uniform vec2 material_anisotropyRotation;
#endif
void getAnisotropy() {
	dAnisotropy = 0.0;
	dAnisotropyRotation = vec2(1.0, 0.0);
#ifdef LIT_GGX_SPECULAR
	dAnisotropy = material_anisotropyIntensity;
	dAnisotropyRotation = material_anisotropyRotation;
#endif
	#ifdef STD_ANISOTROPY_TEXTURE
	vec3 anisotropyTex = texture2DBias({STD_ANISOTROPY_TEXTURE_NAME}, {STD_ANISOTROPY_TEXTURE_UV}, textureBias).rgb;
	dAnisotropy *= anisotropyTex.b;
	vec2 anisotropyRotationFromTex = anisotropyTex.rg * 2.0 - vec2(1.0);
	mat2 rotationMatrix = mat2(dAnisotropyRotation.x, dAnisotropyRotation.y, -dAnisotropyRotation.y, dAnisotropyRotation.x);
	dAnisotropyRotation = rotationMatrix * anisotropyRotationFromTex;
	#endif
	
	dAnisotropy = clamp(dAnisotropy, 0.0, 1.0);
}
`

var aoPS$1 = `
#if defined(STD_AO_TEXTURE) || defined(STD_AO_VERTEX)
	uniform float material_aoIntensity;
#endif
#ifdef STD_AODETAIL_TEXTURE
	#include "detailModesPS"
#endif
void getAO() {
	dAo = 1.0;
	#ifdef STD_AO_TEXTURE
		float aoBase = texture2DBias({STD_AO_TEXTURE_NAME}, {STD_AO_TEXTURE_UV}, textureBias).{STD_AO_TEXTURE_CHANNEL};
		#ifdef STD_AODETAIL_TEXTURE
			float aoDetail = texture2DBias({STD_AODETAIL_TEXTURE_NAME}, {STD_AODETAIL_TEXTURE_UV}, textureBias).{STD_AODETAIL_TEXTURE_CHANNEL};
			aoBase = detailMode_{STD_AODETAIL_DETAILMODE}(vec3(aoBase), vec3(aoDetail)).r;
		#endif
		dAo *= aoBase;
	#endif
	#ifdef STD_AO_VERTEX
		dAo *= saturate(vVertexColor.{STD_AO_VERTEX_CHANNEL});
	#endif
	#if defined(STD_AO_TEXTURE) || defined(STD_AO_VERTEX)
		dAo = mix(1.0, dAo, material_aoIntensity);
	#endif
}
`

var aoDiffuseOccPS$1 = `
void occludeDiffuse(float ao) {
	dDiffuseLight *= ao;
}
`

var aoSpecOccPS$1 = `
#if LIT_OCCLUDE_SPECULAR != NONE
	#ifdef LIT_OCCLUDE_SPECULAR_FLOAT
		uniform float material_occludeSpecularIntensity;
	#endif
#endif
void occludeSpecular(float gloss, float ao, vec3 worldNormal, vec3 viewDir) {
	#if LIT_OCCLUDE_SPECULAR == AO
		#ifdef LIT_OCCLUDE_SPECULAR_FLOAT
			float specOcc = mix(1.0, ao, material_occludeSpecularIntensity);
		#else
			float specOcc = ao;
		#endif
	#endif
	#if LIT_OCCLUDE_SPECULAR == GLOSSDEPENDENT
		float specPow = exp2(gloss * 11.0);
		float specOcc = saturate(pow(dot(worldNormal, viewDir) + ao, 0.01 * specPow) - 1.0 + ao);
		#ifdef LIT_OCCLUDE_SPECULAR_FLOAT
			specOcc = mix(1.0, specOcc, material_occludeSpecularIntensity);
		#endif
	#endif
	#if LIT_OCCLUDE_SPECULAR != NONE
		dSpecularLight *= specOcc;
		dReflection *= specOcc;
		#ifdef LIT_SHEEN
			sSpecularLight *= specOcc;
			sReflection *= specOcc;
		#endif
	#endif
}
`

var bakeDirLmEndPS$1 = `
	vec4 dirLm = texture2D(texture_dirLightMap, vUv1);
	if (bakeDir > 0.5) {
		if (dAtten > 0.00001) {
			dirLm.xyz = dirLm.xyz * 2.0 - vec3(1.0);
			dAtten = saturate(dAtten);
			gl_FragColor.rgb = normalize(dLightDirNormW.xyz*dAtten + dirLm.xyz*dirLm.w) * 0.5 + vec3(0.5);
			gl_FragColor.a = dirLm.w + dAtten;
			gl_FragColor.a = max(gl_FragColor.a, 1.0 / 255.0);
		} else {
			gl_FragColor = dirLm;
		}
	} else {
		gl_FragColor.rgb = dirLm.xyz;
		gl_FragColor.a = max(dirLm.w, dAtten > 0.00001 ? (1.0/255.0) : 0.0);
	}
`

var bakeLmEndPS$1 = `
#ifdef LIT_LIGHTMAP_BAKING_ADD_AMBIENT
	dDiffuseLight = ((dDiffuseLight - 0.5) * max(ambientBakeOcclusionContrast + 1.0, 0.0)) + 0.5;
	dDiffuseLight += vec3(ambientBakeOcclusionBrightness);
	dDiffuseLight = saturate(dDiffuseLight);
	dDiffuseLight *= dAmbientLight;
#endif
#ifdef LIGHTMAP_RGBM
	gl_FragColor.rgb = dDiffuseLight;
	gl_FragColor.rgb = pow(gl_FragColor.rgb, vec3(0.5));
	gl_FragColor.rgb /= 8.0;
	gl_FragColor.a = clamp( max( max( gl_FragColor.r, gl_FragColor.g ), max( gl_FragColor.b, 1.0 / 255.0 ) ), 0.0,1.0 );
	gl_FragColor.a = ceil(gl_FragColor.a * 255.0) / 255.0;
	gl_FragColor.rgb /= gl_FragColor.a;
#else
	gl_FragColor = vec4(dDiffuseLight, 1.0);
#endif
`

var basePS$1 = `
uniform vec3 view_position;
uniform vec3 light_globalAmbient;
float square(float x) {
	return x*x;
}
float saturate(float x) {
	return clamp(x, 0.0, 1.0);
}
vec3 saturate(vec3 x) {
	return clamp(x, vec3(0.0), vec3(1.0));
}
`

var baseNineSlicedPS$1 = `
#define NINESLICED
varying vec2 vMask;
varying vec2 vTiledUv;
uniform mediump vec4 innerOffset;
uniform mediump vec2 outerScale;
uniform mediump vec4 atlasRect;
vec2 nineSlicedUv;
`

var baseNineSlicedTiledPS$1 = `
#define NINESLICED
#define NINESLICETILED
varying vec2 vMask;
varying vec2 vTiledUv;
uniform mediump vec4 innerOffset;
uniform mediump vec2 outerScale;
uniform mediump vec4 atlasRect;
vec2 nineSlicedUv;
`

var bayerPS$1 = `
float bayer2(vec2 p) {
	return mod(2.0 * p.y + p.x + 1.0, 4.0);
}
float bayer4(vec2 p) {
	vec2 p1 = mod(p, 2.0);
	vec2 p2 = floor(0.5 * mod(p, 4.0));
	return 4.0 * bayer2(p1) + bayer2(p2);
}
float bayer8(vec2 p) {
	vec2 p1 = mod(p, 2.0);
	vec2 p2 = floor(0.5 * mod(p, 4.0));
	vec2 p4 = floor(0.25 * mod(p, 8.0));
	return 4.0 * (4.0 * bayer2(p1) + bayer2(p2)) + bayer2(p4);
}
`

var blurVSMPS$1 = `
varying vec2 vUv0;
uniform sampler2D source;
uniform vec2 pixelOffset;
#ifdef GAUSS
	uniform float weight[{SAMPLES}];
#endif
void main(void) {
	vec3 moments = vec3(0.0);
	vec2 uv = vUv0 - pixelOffset * (float({SAMPLES}) * 0.5);
	for (int i = 0; i < {SAMPLES}; i++) {
		vec4 c = texture2D(source, uv + pixelOffset * float(i));
		#ifdef GAUSS
			moments += c.xyz * weight[i];
		#else
			moments += c.xyz;
		#endif
	}
	#ifndef GAUSS
		moments *= 1.0 / float({SAMPLES});
	#endif
	gl_FragColor = vec4(moments.x, moments.y, moments.z, 1.0);
}
`

var clearCoatPS$1 = `
uniform float material_clearCoat;
void getClearCoat() {
	ccSpecularity = material_clearCoat;
	#ifdef STD_CLEARCOAT_TEXTURE
	ccSpecularity *= texture2DBias({STD_CLEARCOAT_TEXTURE_NAME}, {STD_CLEARCOAT_TEXTURE_UV}, textureBias).{STD_CLEARCOAT_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_CLEARCOAT_VERTEX
	ccSpecularity *= saturate(vVertexColor.{STD_CLEARCOAT_VERTEX_CHANNEL});
	#endif
}
`

var clearCoatGlossPS$1 = `
uniform float material_clearCoatGloss;
void getClearCoatGlossiness() {
	ccGlossiness = material_clearCoatGloss;
	#ifdef STD_CLEARCOATGLOSS_TEXTURE
	ccGlossiness *= texture2DBias({STD_CLEARCOATGLOSS_TEXTURE_NAME}, {STD_CLEARCOATGLOSS_TEXTURE_UV}, textureBias).{STD_CLEARCOATGLOSS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_CLEARCOATGLOSS_VERTEX
	ccGlossiness *= saturate(vVertexColor.{STD_CLEARCOATGLOSS_VERTEX_CHANNEL});
	#endif
	#ifdef STD_CLEARCOATGLOSS_INVERT
	ccGlossiness = 1.0 - ccGlossiness;
	#endif
	ccGlossiness += 0.0000001;
}
`

var clearCoatNormalPS$1 = `
#ifdef STD_CLEARCOATNORMAL_TEXTURE
uniform float material_clearCoatBumpiness;
#endif
void getClearCoatNormal() {
#ifdef STD_CLEARCOATNORMAL_TEXTURE
	vec3 normalMap = {STD_CLEARCOATNORMAL_TEXTURE_DECODE}(texture2DBias({STD_CLEARCOATNORMAL_TEXTURE_NAME}, {STD_CLEARCOATNORMAL_TEXTURE_UV}, textureBias));
	normalMap = mix(vec3(0.0, 0.0, 1.0), normalMap, material_clearCoatBumpiness);
	ccNormalW = normalize(dTBN * normalMap);
#else
	ccNormalW = dVertexNormalW;
#endif
}
`

var clusteredLightUtilsPS$1 = `
vec2 getCubemapFaceCoordinates(const vec3 dir, out float faceIndex, out vec2 tileOffset)
{
	vec3 vAbs = abs(dir);
	float ma;
	vec2 uv;
	if (vAbs.z >= vAbs.x && vAbs.z >= vAbs.y) {
		faceIndex = dir.z < 0.0 ? 5.0 : 4.0;
		ma = 0.5 / vAbs.z;
		uv = vec2(dir.z < 0.0 ? -dir.x : dir.x, -dir.y);
		tileOffset.x = 2.0;
		tileOffset.y = dir.z < 0.0 ? 1.0 : 0.0;
	} else if(vAbs.y >= vAbs.x) {
		faceIndex = dir.y < 0.0 ? 3.0 : 2.0;
		ma = 0.5 / vAbs.y;
		uv = vec2(dir.x, dir.y < 0.0 ? -dir.z : dir.z);
		tileOffset.x = 1.0;
		tileOffset.y = dir.y < 0.0 ? 1.0 : 0.0;
	} else {
		faceIndex = dir.x < 0.0 ? 1.0 : 0.0;
		ma = 0.5 / vAbs.x;
		uv = vec2(dir.x < 0.0 ? dir.z : -dir.z, -dir.y);
		tileOffset.x = 0.0;
		tileOffset.y = dir.x < 0.0 ? 1.0 : 0.0;
	}
	return uv * ma + 0.5;
}
vec2 getCubemapAtlasCoordinates(const vec3 omniAtlasViewport, float shadowEdgePixels, float shadowTextureResolution, const vec3 dir) {
	float faceIndex;
	vec2 tileOffset;
	vec2 uv = getCubemapFaceCoordinates(dir, faceIndex, tileOffset);
	float atlasFaceSize = omniAtlasViewport.z;
	float tileSize = shadowTextureResolution * atlasFaceSize;
	float offset = shadowEdgePixels / tileSize;
	uv = uv * vec2(1.0 - offset * 2.0) + vec2(offset * 1.0);
	uv *= atlasFaceSize;
	uv += tileOffset * atlasFaceSize;
	uv += omniAtlasViewport.xy;
	return uv;
}
`

var clusteredLightCookiesPS$1 = `
vec3 _getCookieClustered(TEXTURE_ACCEPT(tex), vec2 uv, float intensity, vec4 cookieChannel) {
	vec4 pixel = mix(vec4(1.0), texture2DLod(tex, uv, 0.0), intensity);
	bool isRgb = dot(cookieChannel.rgb, vec3(1.0)) == 3.0;
	return isRgb ? pixel.rgb : vec3(dot(pixel, cookieChannel));
}
vec3 getCookie2DClustered(TEXTURE_ACCEPT(tex), mat4 transform, vec3 worldPosition, float intensity, vec4 cookieChannel) {
	vec4 projPos = transform * vec4(worldPosition, 1.0);
	return _getCookieClustered(TEXTURE_PASS(tex), projPos.xy / projPos.w, intensity, cookieChannel);
}
vec3 getCookieCubeClustered(TEXTURE_ACCEPT(tex), vec3 dir, float intensity, vec4 cookieChannel, float shadowTextureResolution, float shadowEdgePixels, vec3 omniAtlasViewport) {
	vec2 uv = getCubemapAtlasCoordinates(omniAtlasViewport, shadowEdgePixels, shadowTextureResolution, dir);
	return _getCookieClustered(TEXTURE_PASS(tex), uv, intensity, cookieChannel);
}
`

var clusteredLightShadowsPS$1 = `
vec3 _getShadowCoordPerspZbuffer(mat4 shadowMatrix, vec4 shadowParams, vec3 wPos) {
	vec4 projPos = shadowMatrix * vec4(wPos, 1.0);
	projPos.xyz /= projPos.w;
	return projPos.xyz;
}
vec3 getShadowCoordPerspZbufferNormalOffset(mat4 shadowMatrix, vec4 shadowParams, vec3 normal) {
	vec3 wPos = vPositionW + normal * shadowParams.y;
	return _getShadowCoordPerspZbuffer(shadowMatrix, shadowParams, wPos);
}
vec3 normalOffsetPointShadow(vec4 shadowParams, vec3 lightPos, vec3 lightDir, vec3 lightDirNorm, vec3 normal) {
	float distScale = length(lightDir);
	vec3 wPos = vPositionW + normal * shadowParams.y * clamp(1.0 - dot(normal, -lightDirNorm), 0.0, 1.0) * distScale;
	vec3 dir = wPos - lightPos;
	return dir;
}
#if defined(CLUSTER_SHADOW_TYPE_PCF1)
float getShadowOmniClusteredPCF1(SHADOWMAP_ACCEPT(shadowMap), vec4 shadowParams, vec3 omniAtlasViewport, float shadowEdgePixels, vec3 lightDir) {
	float shadowTextureResolution = shadowParams.x;
	vec2 uv = getCubemapAtlasCoordinates(omniAtlasViewport, shadowEdgePixels, shadowTextureResolution, lightDir);
	float shadowZ = length(lightDir) * shadowParams.w + shadowParams.z;
	return textureShadow(shadowMap, vec3(uv, shadowZ));
}
#endif
#if defined(CLUSTER_SHADOW_TYPE_PCF3)
float getShadowOmniClusteredPCF3(SHADOWMAP_ACCEPT(shadowMap), vec4 shadowParams, vec3 omniAtlasViewport, float shadowEdgePixels, vec3 lightDir) {
	float shadowTextureResolution = shadowParams.x;
	vec2 uv = getCubemapAtlasCoordinates(omniAtlasViewport, shadowEdgePixels, shadowTextureResolution, lightDir);
	float shadowZ = length(lightDir) * shadowParams.w + shadowParams.z;
	vec3 shadowCoord = vec3(uv, shadowZ);
	return getShadowPCF3x3(SHADOWMAP_PASS(shadowMap), shadowCoord, shadowParams);
}
#endif
#if defined(CLUSTER_SHADOW_TYPE_PCF5)
float getShadowOmniClusteredPCF5(SHADOWMAP_ACCEPT(shadowMap), vec4 shadowParams, vec3 omniAtlasViewport, float shadowEdgePixels, vec3 lightDir) {
	float shadowTextureResolution = shadowParams.x;
	vec2 uv = getCubemapAtlasCoordinates(omniAtlasViewport, shadowEdgePixels, shadowTextureResolution, lightDir);
	float shadowZ = length(lightDir) * shadowParams.w + shadowParams.z;
	vec3 shadowCoord = vec3(uv, shadowZ);
	return getShadowPCF5x5(SHADOWMAP_PASS(shadowMap), shadowCoord, shadowParams);
}
#endif
#if defined(CLUSTER_SHADOW_TYPE_PCF1)
float getShadowSpotClusteredPCF1(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return textureShadow(shadowMap, shadowCoord);
}
#endif
#if defined(CLUSTER_SHADOW_TYPE_PCF3)
float getShadowSpotClusteredPCF3(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return getShadowSpotPCF3x3(SHADOWMAP_PASS(shadowMap), shadowCoord, shadowParams);
}
#endif
#if defined(CLUSTER_SHADOW_TYPE_PCF5)
float getShadowSpotClusteredPCF5(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return getShadowPCF5x5(SHADOWMAP_PASS(shadowMap), shadowCoord, shadowParams);
}
#endif
`

var clusteredLightPS$1 = `
#include "lightBufferDefinesPS"
#include "clusteredLightUtilsPS"
#ifdef CLUSTER_COOKIES
	#include "clusteredLightCookiesPS"
#endif
#ifdef CLUSTER_SHADOWS
	#include "clusteredLightShadowsPS"
#endif
uniform highp usampler2D clusterWorldTexture;
uniform highp sampler2D lightsTexture;
#ifdef CLUSTER_SHADOWS
	uniform sampler2DShadow shadowAtlasTexture;
#endif
#ifdef CLUSTER_COOKIES
	uniform sampler2D cookieAtlasTexture;
#endif
uniform int clusterMaxCells;
uniform int numClusteredLights;
uniform int clusterTextureWidth;
uniform vec3 clusterCellsCountByBoundsSize;
uniform vec3 clusterBoundsMin;
uniform vec3 clusterBoundsDelta;
uniform ivec3 clusterCellsDot;
uniform ivec3 clusterCellsMax;
uniform vec2 shadowAtlasParams;
struct ClusterLightData {
	vec3 halfWidth;
	bool isSpot;
	vec3 halfHeight;
	int lightIndex;
	vec3 position;
	uint shape;
	vec3 direction;
	bool falloffModeLinear;
	vec3 color;
	float shadowIntensity;
	vec3 omniAtlasViewport;
	float range;
	vec4 cookieChannelMask;
	float biasesData;
	float shadowBias;
	float shadowNormalBias;
	float innerConeAngleCos;
	float outerConeAngleCos;
	float cookieIntensity;
	bool isDynamic;
	bool isLightmapped;
};
mat4 lightProjectionMatrix;
uint clusterLightData_flags;
float clusterLightData_anglesData;
uint clusterLightData_colorBFlagsData;
vec4 sampleLightTextureF(const ClusterLightData clusterLightData, int index) {
	return texelFetch(lightsTexture, ivec2(index, clusterLightData.lightIndex), 0);
}
void decodeClusterLightCore(inout ClusterLightData clusterLightData, int lightIndex) {
	clusterLightData.lightIndex = lightIndex;
	vec4 halfData = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_COLOR_ANGLES_BIAS});
	clusterLightData_anglesData = halfData.z;
	clusterLightData.biasesData = halfData.w;
	clusterLightData_colorBFlagsData = floatBitsToUint(halfData.y);
	vec2 colorRG = unpackHalf2x16(floatBitsToUint(halfData.x));
	vec2 colorB_flags = unpackHalf2x16(clusterLightData_colorBFlagsData);
	clusterLightData.color = vec3(colorRG, colorB_flags.x) * {LIGHT_COLOR_DIVIDER};
	vec4 lightPosRange = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_POSITION_RANGE});
	clusterLightData.position = lightPosRange.xyz;
	clusterLightData.range = lightPosRange.w;
	vec4 lightDir_Flags = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_DIRECTION_FLAGS});
	clusterLightData.direction = lightDir_Flags.xyz;
	clusterLightData_flags = floatBitsToUint(lightDir_Flags.w);
	clusterLightData.isSpot = (clusterLightData_flags & (1u << 30u)) != 0u;
	clusterLightData.shape = (clusterLightData_flags >> 28u) & 0x3u;
	clusterLightData.falloffModeLinear = (clusterLightData_flags & (1u << 27u)) == 0u;
	clusterLightData.shadowIntensity = float((clusterLightData_flags >> 0u) & 0xFFu) / 255.0;
	clusterLightData.cookieIntensity = float((clusterLightData_flags >> 8u) & 0xFFu) / 255.0;
	clusterLightData.isDynamic = (clusterLightData_flags & (1u << 22u)) != 0u;
	clusterLightData.isLightmapped = (clusterLightData_flags & (1u << 21u)) != 0u;
}
void decodeClusterLightSpot(inout ClusterLightData clusterLightData) {
	uint angleFlags = (clusterLightData_colorBFlagsData >> 16u) & 0xFFFFu;
	vec2 angleValues = unpackHalf2x16(floatBitsToUint(clusterLightData_anglesData));
	float innerVal = angleValues.x;
	float outerVal = angleValues.y;
	float innerIsVersine = float(angleFlags & 1u);
	float outerIsVersine = float((angleFlags >> 1u) & 1u);
	clusterLightData.innerConeAngleCos = mix(innerVal, 1.0 - innerVal, innerIsVersine);
	clusterLightData.outerConeAngleCos = mix(outerVal, 1.0 - outerVal, outerIsVersine);
}
void decodeClusterLightOmniAtlasViewport(inout ClusterLightData clusterLightData) {
	clusterLightData.omniAtlasViewport = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_PROJ_MAT_0}).xyz;
}
void decodeClusterLightAreaData(inout ClusterLightData clusterLightData) {
	clusterLightData.halfWidth = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_AREA_DATA_WIDTH}).xyz;
	clusterLightData.halfHeight = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_AREA_DATA_HEIGHT}).xyz;
}
void decodeClusterLightProjectionMatrixData(inout ClusterLightData clusterLightData) {
	
	vec4 m0 = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_PROJ_MAT_0});
	vec4 m1 = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_PROJ_MAT_1});
	vec4 m2 = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_PROJ_MAT_2});
	vec4 m3 = sampleLightTextureF(clusterLightData, {CLUSTER_TEXTURE_PROJ_MAT_3});
	lightProjectionMatrix = mat4(m0, m1, m2, m3);
}
void decodeClusterLightShadowData(inout ClusterLightData clusterLightData) {
	
	vec2 biases = unpackHalf2x16(floatBitsToUint(clusterLightData.biasesData));
	clusterLightData.shadowBias = biases.x;
	clusterLightData.shadowNormalBias = biases.y;
}
void decodeClusterLightCookieData(inout ClusterLightData clusterLightData) {
	uint cookieFlags = (clusterLightData_flags >> 23u) & 0x0Fu;
	clusterLightData.cookieChannelMask = vec4(uvec4(cookieFlags) & uvec4(1u, 2u, 4u, 8u));
	clusterLightData.cookieChannelMask = step(1.0, clusterLightData.cookieChannelMask);
}
void evaluateLight(
	ClusterLightData light, 
	vec3 worldNormal, 
	vec3 viewDir, 
	vec3 reflectionDir,
#if defined(LIT_CLEARCOAT)
	vec3 clearcoatReflectionDir,
#endif
	float gloss, 
	vec3 specularity, 
	vec3 geometricNormal, 
	mat3 tbn, 
#if defined(LIT_IRIDESCENCE)
	vec3 iridescenceFresnel,
#endif
	vec3 clearcoat_worldNormal,
	float clearcoat_gloss,
	float sheen_gloss,
	float iridescence_intensity
) {
	vec3 cookieAttenuation = vec3(1.0);
	float diffuseAttenuation = 1.0;
	float falloffAttenuation = 1.0;
	vec3 lightDirW = evalOmniLight(light.position);
	vec3 lightDirNormW = normalize(lightDirW);
	#ifdef CLUSTER_AREALIGHTS
	if (light.shape != {LIGHTSHAPE_PUNCTUAL}) {
		decodeClusterLightAreaData(light);
		if (light.shape == {LIGHTSHAPE_RECT}) {
			calcRectLightValues(light.position, light.halfWidth, light.halfHeight);
		} else if (light.shape == {LIGHTSHAPE_DISK}) {
			calcDiskLightValues(light.position, light.halfWidth, light.halfHeight);
		} else {
			calcSphereLightValues(light.position, light.halfWidth, light.halfHeight);
		}
		falloffAttenuation = getFalloffWindow(light.range, lightDirW);
	} else
	#endif
	{
		if (light.falloffModeLinear)
			falloffAttenuation = getFalloffLinear(light.range, lightDirW);
		else
			falloffAttenuation = getFalloffInvSquared(light.range, lightDirW);
	}
	if (falloffAttenuation > 0.00001) {
		#ifdef CLUSTER_AREALIGHTS
		if (light.shape != {LIGHTSHAPE_PUNCTUAL}) {
			if (light.shape == {LIGHTSHAPE_RECT}) {
				diffuseAttenuation = getRectLightDiffuse(worldNormal, viewDir, lightDirW, lightDirNormW) * 16.0;
			} else if (light.shape == {LIGHTSHAPE_DISK}) {
				diffuseAttenuation = getDiskLightDiffuse(worldNormal, viewDir, lightDirW, lightDirNormW) * 16.0;
			} else {
				diffuseAttenuation = getSphereLightDiffuse(worldNormal, viewDir, lightDirW, lightDirNormW) * 16.0;
			}
		} else
		#endif
		{
			falloffAttenuation *= getLightDiffuse(worldNormal, viewDir, lightDirNormW); 
		}
		if (light.isSpot) {
			decodeClusterLightSpot(light);
			falloffAttenuation *= getSpotEffect(light.direction, light.innerConeAngleCos, light.outerConeAngleCos, lightDirNormW);
		}
		#if defined(CLUSTER_COOKIES) || defined(CLUSTER_SHADOWS)
		if (falloffAttenuation > 0.00001) {
			if (light.shadowIntensity > 0.0 || light.cookieIntensity > 0.0) {
				if (light.isSpot) {
					decodeClusterLightProjectionMatrixData(light);
				} else {
					decodeClusterLightOmniAtlasViewport(light);
				}
				float shadowTextureResolution = shadowAtlasParams.x;
				float shadowEdgePixels = shadowAtlasParams.y;
				#ifdef CLUSTER_COOKIES
				if (light.cookieIntensity > 0.0) {
					decodeClusterLightCookieData(light);
					if (light.isSpot) {
						cookieAttenuation = getCookie2DClustered(TEXTURE_PASS(cookieAtlasTexture), lightProjectionMatrix, vPositionW, light.cookieIntensity, light.cookieChannelMask);
					} else {
						cookieAttenuation = getCookieCubeClustered(TEXTURE_PASS(cookieAtlasTexture), lightDirW, light.cookieIntensity, light.cookieChannelMask, shadowTextureResolution, shadowEdgePixels, light.omniAtlasViewport);
					}
				}
				#endif
				#ifdef CLUSTER_SHADOWS
				if (light.shadowIntensity > 0.0) {
					decodeClusterLightShadowData(light);
					vec4 shadowParams = vec4(shadowTextureResolution, light.shadowNormalBias, light.shadowBias, 1.0 / light.range);
					if (light.isSpot) {
						vec3 shadowCoord = getShadowCoordPerspZbufferNormalOffset(lightProjectionMatrix, shadowParams, geometricNormal);
						
						#if defined(CLUSTER_SHADOW_TYPE_PCF1)
							float shadow = getShadowSpotClusteredPCF1(SHADOWMAP_PASS(shadowAtlasTexture), shadowCoord, shadowParams);
						#elif defined(CLUSTER_SHADOW_TYPE_PCF3)
							float shadow = getShadowSpotClusteredPCF3(SHADOWMAP_PASS(shadowAtlasTexture), shadowCoord, shadowParams);
						#elif defined(CLUSTER_SHADOW_TYPE_PCF5)
							float shadow = getShadowSpotClusteredPCF5(SHADOWMAP_PASS(shadowAtlasTexture), shadowCoord, shadowParams);
						#elif defined(CLUSTER_SHADOW_TYPE_PCSS)
							float shadow = getShadowSpotClusteredPCSS(SHADOWMAP_PASS(shadowAtlasTexture), shadowCoord, shadowParams);
						#endif
						falloffAttenuation *= mix(1.0, shadow, light.shadowIntensity);
					} else {
						vec3 dir = normalOffsetPointShadow(shadowParams, light.position, lightDirW, lightDirNormW, geometricNormal);
						#if defined(CLUSTER_SHADOW_TYPE_PCF1)
							float shadow = getShadowOmniClusteredPCF1(SHADOWMAP_PASS(shadowAtlasTexture), shadowParams, light.omniAtlasViewport, shadowEdgePixels, dir);
						#elif defined(CLUSTER_SHADOW_TYPE_PCF3)
							float shadow = getShadowOmniClusteredPCF3(SHADOWMAP_PASS(shadowAtlasTexture), shadowParams, light.omniAtlasViewport, shadowEdgePixels, dir);
						#elif defined(CLUSTER_SHADOW_TYPE_PCF5)
							float shadow = getShadowOmniClusteredPCF5(SHADOWMAP_PASS(shadowAtlasTexture), shadowParams, light.omniAtlasViewport, shadowEdgePixels, dir);
						#endif
						falloffAttenuation *= mix(1.0, shadow, light.shadowIntensity);
					}
				}
				#endif
			}
		}
		#endif
		#ifdef CLUSTER_AREALIGHTS
		if (light.shape != {LIGHTSHAPE_PUNCTUAL}) {
			{
				vec3 areaDiffuse = (diffuseAttenuation * falloffAttenuation) * light.color * cookieAttenuation;
				#if defined(LIT_SPECULAR)
					areaDiffuse = mix(areaDiffuse, vec3(0), dLTCSpecFres);
				#endif
				dDiffuseLight += areaDiffuse;
			}
			#ifdef LIT_SPECULAR
				float areaLightSpecular;
				if (light.shape == {LIGHTSHAPE_RECT}) {
					areaLightSpecular = getRectLightSpecular(worldNormal, viewDir);
				} else if (light.shape == {LIGHTSHAPE_DISK}) {
					areaLightSpecular = getDiskLightSpecular(worldNormal, viewDir);
				} else {
					areaLightSpecular = getSphereLightSpecular(worldNormal, viewDir);
				}
				dSpecularLight += dLTCSpecFres * areaLightSpecular * falloffAttenuation * light.color * cookieAttenuation;
				#ifdef LIT_CLEARCOAT
					float areaLightSpecularCC;
					if (light.shape == {LIGHTSHAPE_RECT}) {
						areaLightSpecularCC = getRectLightSpecular(clearcoat_worldNormal, viewDir);
					} else if (light.shape == {LIGHTSHAPE_DISK}) {
						areaLightSpecularCC = getDiskLightSpecular(clearcoat_worldNormal, viewDir);
					} else {
						areaLightSpecularCC = getSphereLightSpecular(clearcoat_worldNormal, viewDir);
					}
					ccSpecularLight += ccLTCSpecFres * areaLightSpecularCC * falloffAttenuation * light.color  * cookieAttenuation;
				#endif
			#endif
		} else
		#endif
		{
			{
				vec3 punctualDiffuse = falloffAttenuation * light.color * cookieAttenuation;
				#if defined(CLUSTER_AREALIGHTS)
				#if defined(LIT_SPECULAR)
					punctualDiffuse = mix(punctualDiffuse, vec3(0), specularity);
				#endif
				#endif
				dDiffuseLight += punctualDiffuse;
			}
	 
			#ifdef LIT_SPECULAR
				vec3 halfDir = normalize(-lightDirNormW + viewDir);
				
				#ifdef LIT_SPECULAR_FRESNEL
					dSpecularLight += 
						getLightSpecular(halfDir, reflectionDir, worldNormal, viewDir, lightDirNormW, gloss, tbn) * falloffAttenuation * light.color * cookieAttenuation * 
						getFresnel(
							dot(viewDir, halfDir), 
							gloss, 
							specularity
						#if defined(LIT_IRIDESCENCE)
							, iridescenceFresnel,
							iridescence_intensity
						#endif
							);
				#else
					dSpecularLight += getLightSpecular(halfDir, reflectionDir, worldNormal, viewDir, lightDirNormW, gloss, tbn) * falloffAttenuation * light.color * cookieAttenuation * specularity;
				#endif
				#ifdef LIT_CLEARCOAT
					#ifdef LIT_SPECULAR_FRESNEL
						ccSpecularLight += getLightSpecular(halfDir, clearcoatReflectionDir, clearcoat_worldNormal, viewDir, lightDirNormW, clearcoat_gloss, tbn) * falloffAttenuation * light.color * cookieAttenuation * getFresnelCC(dot(viewDir, halfDir));
					#else
						ccSpecularLight += getLightSpecular(halfDir, clearcoatReflectionDir, clearcoat_worldNormal, viewDir, lightDirNormW, clearcoat_gloss, tbn) * falloffAttenuation * light.color * cookieAttenuation; 
					#endif
				#endif
				#ifdef LIT_SHEEN
					sSpecularLight += getLightSpecularSheen(halfDir, worldNormal, viewDir, lightDirNormW, sheen_gloss) * falloffAttenuation * light.color * cookieAttenuation;
				#endif
			#endif
		}
	}
	dAtten = falloffAttenuation;
	dLightDirNormW = lightDirNormW;
}
void evaluateClusterLight(
	int lightIndex, 
	vec3 worldNormal, 
	vec3 viewDir, 
	vec3 reflectionDir, 
#if defined(LIT_CLEARCOAT)
	vec3 clearcoatReflectionDir,
#endif
	float gloss, 
	vec3 specularity, 
	vec3 geometricNormal, 
	mat3 tbn, 
#if defined(LIT_IRIDESCENCE)
	vec3 iridescenceFresnel,
#endif
	vec3 clearcoat_worldNormal,
	float clearcoat_gloss,
	float sheen_gloss,
	float iridescence_intensity
) {
	ClusterLightData clusterLightData;
	decodeClusterLightCore(clusterLightData, lightIndex);
	#ifdef CLUSTER_MESH_DYNAMIC_LIGHTS
		bool acceptLightMask = clusterLightData.isDynamic;
	#else
		bool acceptLightMask = clusterLightData.isLightmapped;
	#endif
	if (acceptLightMask)
		evaluateLight(
			clusterLightData, 
			worldNormal, 
			viewDir, 
			reflectionDir, 
#if defined(LIT_CLEARCOAT)
			clearcoatReflectionDir, 
#endif
			gloss, 
			specularity, 
			geometricNormal, 
			tbn, 
#if defined(LIT_IRIDESCENCE)
			iridescenceFresnel,
#endif
			clearcoat_worldNormal,
			clearcoat_gloss,
			sheen_gloss,
			iridescence_intensity
		);
}
void addClusteredLights(
	vec3 worldNormal, 
	vec3 viewDir, 
	vec3 reflectionDir, 
#if defined(LIT_CLEARCOAT)
	vec3 clearcoatReflectionDir,
#endif
	float gloss, 
	vec3 specularity, 
	vec3 geometricNormal, 
	mat3 tbn, 
#if defined(LIT_IRIDESCENCE)
	vec3 iridescenceFresnel,
#endif
	vec3 clearcoat_worldNormal,
	float clearcoat_gloss,
	float sheen_gloss,
	float iridescence_intensity
) {
	if (numClusteredLights <= 1)
		return;
	ivec3 cellCoords = ivec3(floor((vPositionW - clusterBoundsMin) * clusterCellsCountByBoundsSize));
	if (!(any(lessThan(cellCoords, ivec3(0))) || any(greaterThanEqual(cellCoords, clusterCellsMax)))) {
		int cellIndex = cellCoords.x * clusterCellsDot.x + cellCoords.y * clusterCellsDot.y + cellCoords.z * clusterCellsDot.z;
		int clusterV = cellIndex / clusterTextureWidth;
		int clusterU = cellIndex - clusterV * clusterTextureWidth;
		for (int lightCellIndex = 0; lightCellIndex < clusterMaxCells; lightCellIndex++) {
			uint lightIndex = texelFetch(clusterWorldTexture, ivec2(clusterU + lightCellIndex, clusterV), 0).x;
			if (lightIndex == 0u)
				break;
			evaluateClusterLight(
				int(lightIndex), 
				worldNormal, 
				viewDir, 
				reflectionDir,
#if defined(LIT_CLEARCOAT)
				clearcoatReflectionDir,
#endif
				gloss, 
				specularity, 
				geometricNormal, 
				tbn, 
#if defined(LIT_IRIDESCENCE)
				iridescenceFresnel,
#endif
				clearcoat_worldNormal,
				clearcoat_gloss,
				sheen_gloss,
				iridescence_intensity
			); 
		}
	}
}
`

var combinePS$1 = `
vec3 combineColor(vec3 albedo, vec3 sheenSpecularity, float clearcoatSpecularity) {
	vec3 ret = vec3(0);
#ifdef LIT_OLD_AMBIENT
	ret += (dDiffuseLight - light_globalAmbient) * albedo + material_ambient * light_globalAmbient;
#else
	ret += albedo * dDiffuseLight;
#endif
#ifdef LIT_SPECULAR
	ret += dSpecularLight;
#endif
#ifdef LIT_REFLECTIONS
	ret += dReflection.rgb * dReflection.a;
#endif
#ifdef LIT_SHEEN
	float sheenScaling = 1.0 - max(max(sheenSpecularity.r, sheenSpecularity.g), sheenSpecularity.b) * 0.157;
	ret = ret * sheenScaling + (sSpecularLight + sReflection.rgb) * sheenSpecularity;
#endif
#ifdef LIT_CLEARCOAT
	float clearCoatScaling = 1.0 - ccFresnel * clearcoatSpecularity;
	ret = ret * clearCoatScaling + (ccSpecularLight + ccReflection) * clearcoatSpecularity;
#endif
	return ret;
}
`

var cookieBlit2DPS$1 = `
	varying vec2 uv0;
	uniform sampler2D blitTexture;
	void main(void) {
		gl_FragColor = texture2D(blitTexture, uv0);
	}
`

var cookieBlitCubePS$1 = `
	varying vec2 uv0;
	uniform samplerCube blitTexture;
	uniform mat4 invViewProj;
	void main(void) {
		vec4 projPos = vec4(uv0 * 2.0 - 1.0, 0.5, 1.0);
		vec4 worldPos = invViewProj * projPos;
		gl_FragColor = textureCube(blitTexture, worldPos.xyz);
	}
`

var cookieBlitVS$1 = `
	attribute vec2 vertex_position;
	varying vec2 uv0;
	void main(void) {
		gl_Position = vec4(vertex_position, 0.5, 1.0);
		uv0 = vertex_position.xy * 0.5 + 0.5;
		#ifndef WEBGPU
			uv0.y = 1.0 - uv0.y;
		#endif
	}
`

var cookiePS = `
vec4 getCookie2D(sampler2D tex, mat4 transform, float intensity) {
	vec4 projPos = transform * vec4(vPositionW, 1.0);
	projPos.xy /= projPos.w;
	return mix(vec4(1.0), texture2D(tex, projPos.xy), intensity);
}
vec4 getCookie2DClip(sampler2D tex, mat4 transform, float intensity) {
	vec4 projPos = transform * vec4(vPositionW, 1.0);
	projPos.xy /= projPos.w;
	if (projPos.x < 0.0 || projPos.x > 1.0 || projPos.y < 0.0 || projPos.y > 1.0 || projPos.z < 0.0) return vec4(0.0);
	return mix(vec4(1.0), texture2D(tex, projPos.xy), intensity);
}
vec4 getCookie2DXform(sampler2D tex, mat4 transform, float intensity, vec4 cookieMatrix, vec2 cookieOffset) {
	vec4 projPos = transform * vec4(vPositionW, 1.0);
	projPos.xy /= projPos.w;
	projPos.xy += cookieOffset;
	vec2 uv = mat2(cookieMatrix) * (projPos.xy-vec2(0.5)) + vec2(0.5);
	return mix(vec4(1.0), texture2D(tex, uv), intensity);
}
vec4 getCookie2DClipXform(sampler2D tex, mat4 transform, float intensity, vec4 cookieMatrix, vec2 cookieOffset) {
	vec4 projPos = transform * vec4(vPositionW, 1.0);
	projPos.xy /= projPos.w;
	projPos.xy += cookieOffset;
	if (projPos.x < 0.0 || projPos.x > 1.0 || projPos.y < 0.0 || projPos.y > 1.0 || projPos.z < 0.0) return vec4(0.0);
	vec2 uv = mat2(cookieMatrix) * (projPos.xy-vec2(0.5)) + vec2(0.5);
	return mix(vec4(1.0), texture2D(tex, uv), intensity);
}
vec4 getCookieCube(samplerCube tex, mat4 transform, float intensity) {
	return mix(vec4(1.0), textureCube(tex, dLightDirNormW * mat3(transform)), intensity);
}
`

var cubeMapProjectPS$1 = `
#if LIT_CUBEMAP_PROJECTION == BOX
	uniform vec3 envBoxMin;
	uniform vec3 envBoxMax;
#endif
vec3 cubeMapProject(vec3 nrdir) {
	#if LIT_CUBEMAP_PROJECTION == NONE
		return cubeMapRotate(nrdir);
	#endif
	#if LIT_CUBEMAP_PROJECTION == BOX
		nrdir = cubeMapRotate(nrdir);
		vec3 rbmax = (envBoxMax - vPositionW) / nrdir;
		vec3 rbmin = (envBoxMin - vPositionW) / nrdir;
		vec3 rbminmax = mix(rbmin, rbmax, vec3(greaterThan(nrdir, vec3(0.0))));
		float fa = min(min(rbminmax.x, rbminmax.y), rbminmax.z);
		vec3 posonbox = vPositionW + nrdir * fa;
		vec3 envBoxPos = (envBoxMin + envBoxMax) * 0.5;
		return normalize(posonbox - envBoxPos);
	#endif
}
`

var cubeMapRotatePS$1 = `
#ifdef CUBEMAP_ROTATION
uniform mat3 cubeMapRotationMatrix;
#endif
vec3 cubeMapRotate(vec3 refDir) {
#ifdef CUBEMAP_ROTATION
	return refDir * cubeMapRotationMatrix;
#else
	return refDir;
#endif
}
`

var debugOutputPS$1 = `
#ifdef DEBUG_ALBEDO_PASS
gl_FragColor = vec4(gammaCorrectOutput(dAlbedo), 1.0);
#endif
#ifdef DEBUG_UV0_PASS
gl_FragColor = vec4(litArgs_albedo , 1.0);
#endif
#ifdef DEBUG_WORLD_NORMAL_PASS
gl_FragColor = vec4(litArgs_worldNormal * 0.5 + 0.5, 1.0);
#endif
#ifdef DEBUG_OPACITY_PASS
gl_FragColor = vec4(vec3(litArgs_opacity) , 1.0);
#endif
#ifdef DEBUG_SPECULARITY_PASS
gl_FragColor = vec4(litArgs_specularity, 1.0);
#endif
#ifdef DEBUG_GLOSS_PASS
gl_FragColor = vec4(vec3(litArgs_gloss) , 1.0);
#endif
#ifdef DEBUG_METALNESS_PASS
gl_FragColor = vec4(vec3(litArgs_metalness) , 1.0);
#endif
#ifdef DEBUG_AO_PASS
gl_FragColor = vec4(vec3(litArgs_ao) , 1.0);
#endif
#ifdef DEBUG_EMISSION_PASS
gl_FragColor = vec4(gammaCorrectOutput(litArgs_emission), 1.0);
#endif
`

var debugProcessFrontendPS$1 = `
#ifdef DEBUG_LIGHTING_PASS
litArgs_albedo = vec3(0.5);
#endif
#ifdef DEBUG_UV0_PASS
#ifdef VARYING_VUV0
litArgs_albedo = vec3(vUv0, 0);
#else
litArgs_albedo = vec3(0);
#endif
#endif
`

var decodePS$1 = `
#ifndef _DECODE_INCLUDED_
#define _DECODE_INCLUDED_
vec3 decodeLinear(vec4 raw) {
	return raw.rgb;
}
float decodeGamma(float raw) {
	return pow(raw, 2.2);
}
vec3 decodeGamma(vec3 raw) {
	return pow(raw, vec3(2.2));
}
vec3 decodeGamma(vec4 raw) {
	return pow(raw.xyz, vec3(2.2));
}
vec3 decodeRGBM(vec4 raw) {
	vec3 color = (8.0 * raw.a) * raw.rgb;
	return color * color;
}
vec3 decodeRGBP(vec4 raw) {
	vec3 color = raw.rgb * (-raw.a * 7.0 + 8.0);
	return color * color;
}
vec3 decodeRGBE(vec4 raw) {
	if (raw.a == 0.0) {
		return vec3(0.0, 0.0, 0.0);
	} else {
		return raw.xyz * pow(2.0, raw.w * 255.0 - 128.0);
	}
}
vec4 passThrough(vec4 raw) {
	return raw;
}
vec3 unpackNormalXYZ(vec4 nmap) {
	return nmap.xyz * 2.0 - 1.0;
}
vec3 unpackNormalXY(vec4 nmap) {
	vec3 normal;
	normal.xy = nmap.wy * 2.0 - 1.0;
	normal.z = sqrt(1.0 - clamp(dot(normal.xy, normal.xy), 0.0, 1.0));
	return normal;
}
#endif
`

var detailModesPS$1 = `
#ifndef _DETAILMODES_INCLUDED_
#define _DETAILMODES_INCLUDED_
vec3 detailMode_mul(vec3 c1, vec3 c2) {
	return c1 * c2;
}
vec3 detailMode_add(vec3 c1, vec3 c2) {
	return c1 + c2;
}
vec3 detailMode_screen(vec3 c1, vec3 c2) {
	return 1.0 - (1.0 - c1)*(1.0 - c2);
}
vec3 detailMode_overlay(vec3 c1, vec3 c2) {
	return mix(1.0 - 2.0 * (1.0 - c1)*(1.0 - c2), 2.0 * c1 * c2, step(c1, vec3(0.5)));
}
vec3 detailMode_min(vec3 c1, vec3 c2) {
	return min(c1, c2);
}
vec3 detailMode_max(vec3 c1, vec3 c2) {
	return max(c1, c2);
}
#endif
`

var diffusePS$1 = `
uniform vec3 material_diffuse;
#ifdef STD_DIFFUSEDETAIL_TEXTURE
	#include "detailModesPS"
#endif
void getAlbedo() {
	dAlbedo = material_diffuse.rgb;
	#ifdef STD_DIFFUSE_TEXTURE
		vec3 albedoTexture = {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_UV}, textureBias)).{STD_DIFFUSE_TEXTURE_CHANNEL};
		#ifdef STD_DIFFUSEDETAIL_TEXTURE
			vec3 albedoDetail = {STD_DIFFUSEDETAIL_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSEDETAIL_TEXTURE_NAME}, {STD_DIFFUSEDETAIL_TEXTURE_UV}, textureBias)).{STD_DIFFUSEDETAIL_TEXTURE_CHANNEL};
			albedoTexture = detailMode_{STD_DIFFUSEDETAIL_DETAILMODE}(albedoTexture, albedoDetail);
		#endif
		dAlbedo *= albedoTexture;
	#endif
	#ifdef STD_DIFFUSE_VERTEX
		dAlbedo *= saturate(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});
	#endif
}
`

var emissivePS$1 = `
uniform vec3 material_emissive;
uniform float material_emissiveIntensity;
void getEmission() {
	dEmission = material_emissive * material_emissiveIntensity;
	#ifdef STD_EMISSIVE_TEXTURE
	dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, textureBias)).{STD_EMISSIVE_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_EMISSIVE_VERTEX
	dEmission *= saturate(vVertexColor.{STD_EMISSIVE_VERTEX_CHANNEL});
	#endif
}
`

var encodePS$1 = `
vec4 encodeLinear(vec3 source) {
	return vec4(source, 1.0);
}
vec4 encodeGamma(vec3 source) {
	return vec4(pow(source + 0.0000001, vec3(1.0 / 2.2)), 1.0);
}
vec4 encodeRGBM(vec3 source) {
	vec4 result;
	result.rgb = pow(source.rgb, vec3(0.5));
	result.rgb *= 1.0 / 8.0;
	result.a = saturate( max( max( result.r, result.g ), max( result.b, 1.0 / 255.0 ) ) );
	result.a = ceil(result.a * 255.0) / 255.0;
	result.rgb /= result.a;
	return result;
}
vec4 encodeRGBP(vec3 source) {
	vec3 gamma = pow(source, vec3(0.5));
	float maxVal = min(8.0, max(1.0, max(gamma.x, max(gamma.y, gamma.z))));
	float v = 1.0 - ((maxVal - 1.0) / 7.0);
	v = ceil(v * 255.0) / 255.0;
	return vec4(gamma / (-v * 7.0 + 8.0), v);	
}
vec4 encodeRGBE(vec3 source) {
	float maxVal = max(source.x, max(source.y, source.z));
	if (maxVal < 1e-32) {
		return vec4(0, 0, 0, 0);
	} else {
		float e = ceil(log2(maxVal));
		return vec4(source / pow(2.0, e), (e + 128.0) / 255.0);
	}
}
`

var endPS$1 = `
	gl_FragColor.rgb = combineColor(litArgs_albedo, litArgs_sheen_specularity, litArgs_clearcoat_specularity);
	gl_FragColor.rgb += litArgs_emission;
	gl_FragColor.rgb = addFog(gl_FragColor.rgb);
	gl_FragColor.rgb = toneMap(gl_FragColor.rgb);
	gl_FragColor.rgb = gammaCorrectOutput(gl_FragColor.rgb);
`

var envAtlasPS$1 = `
#ifndef _ENVATLAS_INCLUDED_
#define _ENVATLAS_INCLUDED_
const float atlasSize = 512.0;
const float seamSize = 1.0 / atlasSize;
vec2 mapUv(vec2 uv, vec4 rect) {
	return vec2(mix(rect.x + seamSize, rect.x + rect.z - seamSize, uv.x),
				mix(rect.y + seamSize, rect.y + rect.w - seamSize, uv.y));
}
vec2 mapRoughnessUv(vec2 uv, float level) {
	float t = 1.0 / exp2(level);
	return mapUv(uv, vec4(0, 1.0 - t, t, t * 0.5));
}
vec2 mapShinyUv(vec2 uv, float level) {
	float t = 1.0 / exp2(level);
	return mapUv(uv, vec4(1.0 - t, 1.0 - t, t, t * 0.5));
}
#endif
`

var envProcPS$1 = `
#ifdef LIT_SKYBOX_INTENSITY
	uniform float skyboxIntensity;
#endif
vec3 processEnvironment(vec3 color) {
	#ifdef LIT_SKYBOX_INTENSITY
		return color * skyboxIntensity;
	#else
		return color;
	#endif
}
`

var falloffInvSquaredPS$1 = `
float getFalloffWindow(float lightRadius, vec3 lightDir) {
	float sqrDist = dot(lightDir, lightDir);
	float invRadius = 1.0 / lightRadius;
	return square(saturate(1.0 - square(sqrDist * square(invRadius))));
}
float getFalloffInvSquared(float lightRadius, vec3 lightDir) {
	float sqrDist = dot(lightDir, lightDir);
	float falloff = 1.0 / (sqrDist + 1.0);
	float invRadius = 1.0 / lightRadius;
	falloff *= 16.0;
	falloff *= square(saturate(1.0 - square(sqrDist * square(invRadius))));
	return falloff;
}
`

var falloffLinearPS$1 = `
float getFalloffLinear(float lightRadius, vec3 lightDir) {
	float d = length(lightDir);
	return max(((lightRadius - d) / lightRadius), 0.0);
}
`

var floatAsUintPS$1 = `
#ifndef FLOAT_AS_UINT
#define FLOAT_AS_UINT
vec4 float2uint(float value) {
	uint intBits = floatBitsToUint(value);
	return vec4(
		float((intBits >> 24u) & 0xFFu) / 255.0,
		float((intBits >> 16u) & 0xFFu) / 255.0,
		float((intBits >> 8u) & 0xFFu) / 255.0,
		float(intBits & 0xFFu) / 255.0
	);
}
float uint2float(vec4 value) {
	uint intBits = 
		(uint(value.r * 255.0) << 24u) |
		(uint(value.g * 255.0) << 16u) |
		(uint(value.b * 255.0) << 8u) |
		uint(value.a * 255.0);
	return uintBitsToFloat(intBits);
}
vec4 float2vec4(float value) {
	#if defined(CAPS_TEXTURE_FLOAT_RENDERABLE)
		return vec4(value, 1.0, 1.0, 1.0);
	#else
		return float2uint(value);
	#endif
}
#endif
`

var fogPS$1 = `
float dBlendModeFogFactor = 1.0;
#if (FOG != NONE)
	uniform vec3 fog_color;
	#if (FOG == LINEAR)
		uniform float fog_start;
		uniform float fog_end;
	#else
		uniform float fog_density;
	#endif
#endif
float getFogFactor() {
	float depth = gl_FragCoord.z / gl_FragCoord.w;
	float fogFactor = 0.0;
	#if (FOG == LINEAR)
		fogFactor = (fog_end - depth) / (fog_end - fog_start);
	#elif (FOG == EXP)
		fogFactor = exp(-depth * fog_density);
	#elif (FOG == EXP2)
		fogFactor = exp(-depth * depth * fog_density * fog_density);
	#endif
	return clamp(fogFactor, 0.0, 1.0);
}
vec3 addFog(vec3 color) {
	#if (FOG != NONE)
		return mix(fog_color * dBlendModeFogFactor, color, getFogFactor());
	#endif
	return color;
}
`

var fresnelSchlickPS$1 = `
vec3 getFresnel(
		float cosTheta, 
		float gloss, 
		vec3 specularity
#if defined(LIT_IRIDESCENCE)
		, vec3 iridescenceFresnel, 
		float iridescenceIntensity
#endif
	) {
	float fresnel = pow(1.0 - saturate(cosTheta), 5.0);
	float glossSq = gloss * gloss;
	float specIntensity = max(specularity.r, max(specularity.g, specularity.b));
	vec3 ret = specularity + (max(vec3(glossSq * specIntensity), specularity) - specularity) * fresnel;
#if defined(LIT_IRIDESCENCE)
	return mix(ret, iridescenceFresnel, iridescenceIntensity);
#else
	return ret;
#endif	
}
float getFresnelCC(float cosTheta) {
	float fresnel = pow(1.0 - saturate(cosTheta), 5.0);
	return 0.04 + (1.0 - 0.04) * fresnel;
}
`

var fullscreenQuadVS$1 = `
attribute vec2 vertex_position;
varying vec2 vUv0;
void main(void)
{
	gl_Position = vec4(vertex_position, 0.5, 1.0);
	vUv0 = vertex_position.xy * 0.5 + 0.5;
}
`

var gammaPS$1 = `
#include "decodePS"
#if (GAMMA == SRGB)
	float gammaCorrectInput(float color) {
		return decodeGamma(color);
	}
	vec3 gammaCorrectInput(vec3 color) {
		return decodeGamma(color);
	}
	vec4 gammaCorrectInput(vec4 color) {
		return vec4(decodeGamma(color.xyz), color.w);
	}
	vec3 gammaCorrectOutput(vec3 color) {
		return pow(color + 0.0000001, vec3(1.0 / 2.2));
	}
#else
	float gammaCorrectInput(float color) {
		return color;
	}
	vec3 gammaCorrectInput(vec3 color) {
		return color;
	}
	vec4 gammaCorrectInput(vec4 color) {
		return color;
	}
	vec3 gammaCorrectOutput(vec3 color) {
		return color;
	}
#endif
`

var glossPS$1 = `
#ifdef STD_GLOSS_CONSTANT
uniform float material_gloss;
#endif
void getGlossiness() {
	dGlossiness = 1.0;
	#ifdef STD_GLOSS_CONSTANT
	dGlossiness *= material_gloss;
	#endif
	#ifdef STD_GLOSS_TEXTURE
	dGlossiness *= texture2DBias({STD_GLOSS_TEXTURE_NAME}, {STD_GLOSS_TEXTURE_UV}, textureBias).{STD_GLOSS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_GLOSS_VERTEX
	dGlossiness *= saturate(vVertexColor.{STD_GLOSS_VERTEX_CHANNEL});
	#endif
	#ifdef STD_GLOSS_INVERT
	dGlossiness = 1.0 - dGlossiness;
	#endif
	dGlossiness += 0.0000001;
}
`

var quadVS$1 = `
	attribute vec2 aPosition;
	varying vec2 uv0;
	void main(void)
	{
		gl_Position = vec4(aPosition, 0.0, 1.0);
		uv0 = getImageEffectUV((aPosition.xy + 1.0) * 0.5);
	}
`

var immediateLinePS$1 = `
		#include "gammaPS"
		varying vec4 color;
		void main(void) {
			gl_FragColor = vec4(gammaCorrectOutput(decodeGamma(color.rgb)), color.a);
		}
`

var immediateLineVS$1 = `
	attribute vec4 vertex_position;
	attribute vec4 vertex_color;
	uniform mat4 matrix_model;
	uniform mat4 matrix_viewProjection;
	varying vec4 color;
	void main(void) {
		color = vertex_color;
		gl_Position = matrix_viewProjection * matrix_model * vertex_position;
	}
`

var iridescenceDiffractionPS$1 = `
uniform float material_iridescenceRefractionIndex;
float iridescence_iorToFresnel(float transmittedIor, float incidentIor) {
	return pow((transmittedIor - incidentIor) / (transmittedIor + incidentIor), 2.0);
}
vec3 iridescence_iorToFresnel(vec3 transmittedIor, float incidentIor) {
	return pow((transmittedIor - vec3(incidentIor)) / (transmittedIor + vec3(incidentIor)), vec3(2.0));
}
vec3 iridescence_fresnelToIor(vec3 f0) {
	vec3 sqrtF0 = sqrt(f0);
	return (vec3(1.0) + sqrtF0) / (vec3(1.0) - sqrtF0);
}
vec3 iridescence_sensitivity(float opd, vec3 shift) {
	float PI = 3.141592653589793;
	float phase = 2.0 * PI * opd * 1.0e-9;
	const vec3 val = vec3(5.4856e-13, 4.4201e-13, 5.2481e-13);
	const vec3 pos = vec3(1.6810e+06, 1.7953e+06, 2.2084e+06);
	const vec3 var = vec3(4.3278e+09, 9.3046e+09, 6.6121e+09);
	vec3 xyz = val * sqrt(2.0 * PI * var) * cos(pos * phase + shift) * exp(-pow(phase, 2.0) * var);
	xyz.x += 9.7470e-14 * sqrt(2.0 * PI * 4.5282e+09) * cos(2.2399e+06 * phase + shift[0]) * exp(-4.5282e+09 * pow(phase, 2.0));
	xyz /= vec3(1.0685e-07);
	const mat3 XYZ_TO_REC709 = mat3(
		3.2404542, -0.9692660,  0.0556434,
	   -1.5371385,  1.8760108, -0.2040259,
	   -0.4985314,  0.0415560,  1.0572252
	);
	return XYZ_TO_REC709 * xyz;
}
float iridescence_fresnel(float cosTheta, float f0) {
	float x = clamp(1.0 - cosTheta, 0.0, 1.0);
	float x2 = x * x;
	float x5 = x * x2 * x2;
	return f0 + (1.0 - f0) * x5;
} 
vec3 iridescence_fresnel(float cosTheta, vec3 f0) {
	float x = clamp(1.0 - cosTheta, 0.0, 1.0);
	float x2 = x * x;
	float x5 = x * x2 * x2; 
	return f0 + (vec3(1.0) - f0) * x5;
}
vec3 calcIridescence(float outsideIor, float cosTheta, vec3 base_f0, float iridescenceThickness) {
	float PI = 3.141592653589793;
	float iridescenceIor = mix(outsideIor, material_iridescenceRefractionIndex, smoothstep(0.0, 0.03, iridescenceThickness));
	float sinTheta2Sq = pow(outsideIor / iridescenceIor, 2.0) * (1.0 - pow(cosTheta, 2.0));
	float cosTheta2Sq = 1.0 - sinTheta2Sq;
	if (cosTheta2Sq < 0.0) {
		return vec3(1.0);
	}
	float cosTheta2 = sqrt(cosTheta2Sq);
	float r0 = iridescence_iorToFresnel(iridescenceIor, outsideIor);
	float r12 = iridescence_fresnel(cosTheta, r0);
	float r21 = r12;
	float t121 = 1.0 - r12;
	float phi12 = iridescenceIor < outsideIor ? PI : 0.0;
	float phi21 = PI - phi12;
	vec3 baseIor = iridescence_fresnelToIor(base_f0 + vec3(0.0001));
	vec3 r1 = iridescence_iorToFresnel(baseIor, iridescenceIor);
	vec3 r23 = iridescence_fresnel(cosTheta2, r1);
	vec3 phi23 = vec3(0.0);
	if (baseIor[0] < iridescenceIor) phi23[0] = PI;
	if (baseIor[1] < iridescenceIor) phi23[1] = PI;
	if (baseIor[2] < iridescenceIor) phi23[2] = PI;
	float opd = 2.0 * iridescenceIor * iridescenceThickness * cosTheta2;
	vec3 phi = vec3(phi21) + phi23; 
	vec3 r123Sq = clamp(r12 * r23, 1e-5, 0.9999);
	vec3 r123 = sqrt(r123Sq);
	vec3 rs = pow(t121, 2.0) * r23 / (1.0 - r123Sq);
	vec3 c0 = r12 + rs;
	vec3 i = c0;
	vec3 cm = rs - t121;
	for (int m = 1; m <= 2; m++) {
		cm *= r123;
		vec3 sm = 2.0 * iridescence_sensitivity(float(m) * opd, float(m) * phi);
		i += cm * sm;
	}
	return max(i, vec3(0.0));
}
vec3 getIridescence(float cosTheta, vec3 specularity, float iridescenceThickness) {
	return calcIridescence(1.0, cosTheta, specularity, iridescenceThickness);
}
`

var iridescencePS$1 = `
#ifdef STD_IRIDESCENCE_CONSTANT
uniform float material_iridescence;
#endif
void getIridescence() {
	float iridescence = 1.0;
	#ifdef STD_IRIDESCENCE_CONSTANT
	iridescence *= material_iridescence;
	#endif
	#ifdef STD_IRIDESCENCE_TEXTURE
	iridescence *= texture2DBias({STD_IRIDESCENCE_TEXTURE_NAME}, {STD_IRIDESCENCE_TEXTURE_UV}, textureBias).{STD_IRIDESCENCE_TEXTURE_CHANNEL};
	#endif
	dIridescence = iridescence; 
}
`

var iridescenceThicknessPS$1 = `
uniform float material_iridescenceThicknessMax;
#ifdef STD_IRIDESCENCETHICKNESS_TEXTURE
uniform float material_iridescenceThicknessMin;
#endif
void getIridescenceThickness() {
	#ifdef STD_IRIDESCENCETHICKNESS_TEXTURE
		float blend = texture2DBias({STD_IRIDESCENCETHICKNESS_TEXTURE_NAME}, {STD_IRIDESCENCETHICKNESS_TEXTURE_UV}, textureBias).{STD_IRIDESCENCETHICKNESS_TEXTURE_CHANNEL};
		float iridescenceThickness = mix(material_iridescenceThicknessMin, material_iridescenceThicknessMax, blend);
	#else
		float iridescenceThickness = material_iridescenceThicknessMax;
	#endif
	dIridescenceThickness = iridescenceThickness; 
}
`

var iorPS$1 = `
#ifdef STD_IOR_CONSTANT
uniform float material_refractionIndex;
#endif
void getIor() {
#ifdef STD_IOR_CONSTANT
	dIor = material_refractionIndex;
#else
	dIor = 1.0 / 1.5;
#endif
}
`

var lightDeclarationPS$1 = `
#if defined(LIGHT{i})
	uniform vec3 light{i}_color;
	#if LIGHT{i}TYPE == DIRECTIONAL
		uniform vec3 light{i}_direction;
	#else
		#define LIT_CODE_LIGHTS_POINT
		uniform vec3 light{i}_position;
		uniform float light{i}_radius;
		#if LIGHT{i}TYPE == SPOT
			#define LIT_CODE_LIGHTS_SPOT
			uniform vec3 light{i}_direction;
			uniform float light{i}_innerConeAngle;
			uniform float light{i}_outerConeAngle;
		#endif
	#endif
	#if LIGHT{i}SHAPE != PUNCTUAL
		#define LIT_CODE_FALLOFF_SQUARED
		#if LIGHT{i}TYPE == DIRECTIONAL
			uniform vec3 light{i}_position;
		#endif
		uniform vec3 light{i}_halfWidth;
		uniform vec3 light{i}_halfHeight;
	#else
		#if LIGHT{i}FALLOFF == LINEAR
			#define LIT_CODE_FALLOFF_LINEAR
		#endif
		#if LIGHT{i}FALLOFF == INVERSESQUARED
			#define LIT_CODE_FALLOFF_SQUARED
		#endif
	#endif
	#if defined(LIGHT{i}CASTSHADOW)
		#if LIGHT{i}TYPE != OMNI
			uniform mat4 light{i}_shadowMatrix;
		#endif
		uniform float light{i}_shadowIntensity;
		uniform vec4 light{i}_shadowParams;
		#if LIGHT{i}SHADOWTYPE == PCSS_32F
			uniform float light{i}_shadowSearchArea;
			uniform vec4 light{i}_cameraParams;
			#if LIGHT{i}TYPE == DIRECTIONAL
				uniform vec4 light{i}_softShadowParams;
			#endif
		#endif
		#if LIGHT{i}TYPE == DIRECTIONAL
			uniform mat4 light{i}_shadowMatrixPalette[4];
			uniform vec4 light{i}_shadowCascadeDistances;
			uniform int light{i}_shadowCascadeCount;
			uniform float light{i}_shadowCascadeBlend;
		#endif
		#if LIGHT{i}TYPE == OMNI
			#if defined(LIGHT{i}SHADOW_PCF)
				uniform samplerCubeShadow light{i}_shadowMap;
			#else
				uniform samplerCube light{i}_shadowMap;
			#endif
		#else
			#if defined(LIGHT{i}SHADOW_PCF)
				uniform sampler2DShadow light{i}_shadowMap;
			#else
				uniform sampler2D light{i}_shadowMap;
			#endif
		#endif
	#endif
	#if defined(LIGHT{i}COOKIE)
		#define LIT_CODE_COOKIE
		#if LIGHT{i}TYPE == OMNI
			uniform samplerCube light{i}_cookie;
			uniform float light{i}_cookieIntensity;
			uniform mat4 light{i}_shadowMatrix;
		#endif
		#if LIGHT{i}TYPE == SPOT
			uniform sampler2D light{i}_cookie;
			uniform float light{i}_cookieIntensity;
			#if !defined(LIGHT{i}CASTSHADOW)
				uniform mat4 light{i}_shadowMatrix;
			#endif
			#if defined(LIGHT{i}COOKIE_TRANSFORM)
				uniform vec4 light{i}_cookieMatrix;
				uniform vec2 light{i}_cookieOffset;
			#endif
		#endif
	#endif
#endif
`

var lightDiffuseLambertPS$1 = `
float getLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm) {
	return max(dot(worldNormal, -lightDirNorm), 0.0);
}
`

var lightDirPointPS$1 = `
vec3 evalOmniLight(vec3 lightPosW) {
	return vPositionW - lightPosW;
}
`

var lightEvaluationPS$1 = `
#if defined(LIGHT{i})
	evaluateLight{i}(
		#if defined(LIT_IRIDESCENCE)
			iridescenceFresnel
		#endif
	);
#endif
`

var lightFunctionLightPS$1 = `
#if defined(LIGHT{i})
void evaluateLight{i}(
	#if defined(LIT_IRIDESCENCE)
		vec3 iridescenceFresnel
	#endif
) {
	vec3 lightColor = light{i}_color;
	#if LIGHT{i}TYPE == DIRECTIONAL && !defined(LIT_SHADOW_CATCHER)
		if (all(equal(lightColor, vec3(0.0)))) {
			return;
		}
	#endif
	#if LIGHT{i}TYPE == DIRECTIONAL
		dLightDirNormW = light{i}_direction;
		dAtten = 1.0;
	#else
		
		vec3 lightDirW = evalOmniLight(light{i}_position);
		dLightDirNormW = normalize(lightDirW);
		#if defined(LIGHT{i}COOKIE)
			#if LIGHT{i}TYPE == SPOT
				#ifdef LIGHT{i}COOKIE_FALLOFF
					#ifdef LIGHT{i}COOKIE_TRANSFORM
						vec3 cookieAttenuation = getCookie2DXform(light{i}_cookie, light{i}_shadowMatrix, light{i}_cookieIntensity, light{i}_cookieMatrix, light{i}_cookieOffset).{LIGHT{i}COOKIE_CHANNEL};
					#else
						vec3 cookieAttenuation = getCookie2D(light{i}_cookie, light{i}_shadowMatrix, light{i}_cookieIntensity).{LIGHT{i}COOKIE_CHANNEL};
					#endif
				#else
					#ifdef LIGHT{i}COOKIE_TRANSFORM
						vec3 cookieAttenuation = getCookie2DClipXform(light{i}_cookie, light{i}_shadowMatrix, light{i}_cookieIntensity, light{i}_cookieMatrix, light{i}_cookieOffset).{LIGHT{i}COOKIE_CHANNEL};
					#else
						vec3 cookieAttenuation = getCookie2DClip(light{i}_cookie, light{i}_shadowMatrix, light{i}_cookieIntensity).{LIGHT{i}COOKIE_CHANNEL};
					#endif
				#endif
			#endif
			#if LIGHT{i}TYPE == OMNI
				vec3 cookieAttenuation = getCookieCube(light{i}_cookie, light{i}_shadowMatrix, light{i}_cookieIntensity).{LIGHT{i}COOKIE_CHANNEL};
			#endif
			lightColor *= cookieAttenuation;
		#endif
		#if LIGHT{i}SHAPE == PUNCTUAL
			#if LIGHT{i}FALLOFF == LINEAR
				dAtten = getFalloffLinear(light{i}_radius, lightDirW);
			#else
				dAtten = getFalloffInvSquared(light{i}_radius, lightDirW);
			#endif
		#else
			dAtten = getFalloffWindow(light{i}_radius, lightDirW);
		#endif
		#if LIGHT{i}TYPE == SPOT
			#if !defined(LIGHT{i}COOKIE) || defined(LIGHT{i}COOKIE_FALLOFF)
				dAtten *= getSpotEffect(light{i}_direction, light{i}_innerConeAngle, light{i}_outerConeAngle, dLightDirNormW);
			#endif
		#endif
	#endif
	if (dAtten < 0.00001) {
		return;
	}
	#if LIGHT{i}SHAPE != PUNCTUAL
		#if LIGHT{i}SHAPE == RECT
			calcRectLightValues(light{i}_position, light{i}_halfWidth, light{i}_halfHeight);
		#elif LIGHT{i}SHAPE == DISK
			calcDiskLightValues(light{i}_position, light{i}_halfWidth, light{i}_halfHeight);
		#elif LIGHT{i}SHAPE == SPHERE
			calcSphereLightValues(light{i}_position, light{i}_halfWidth, light{i}_halfHeight);
		#endif
	#endif
	#if LIGHT{i}SHAPE != PUNCTUAL
		#if LIGHT{i}TYPE == DIRECTIONAL
			float attenDiffuse = getLightDiffuse(litArgs_worldNormal, dViewDirW, dLightDirNormW);
		#else
			#if LIGHT{i}SHAPE == RECT
				float attenDiffuse = getRectLightDiffuse(litArgs_worldNormal, dViewDirW, lightDirW, dLightDirNormW) * 16.0;
			#elif LIGHT{i}SHAPE == DISK
				float attenDiffuse = getDiskLightDiffuse(litArgs_worldNormal, dViewDirW, lightDirW, dLightDirNormW) * 16.0;
			#elif LIGHT{i}SHAPE == SPHERE
				float attenDiffuse = getSphereLightDiffuse(litArgs_worldNormal, dViewDirW, lightDirW, dLightDirNormW) * 16.0;
			#endif
		#endif
	#else
		dAtten *= getLightDiffuse(litArgs_worldNormal, vec3(0.0), dLightDirNormW);
	#endif
	#ifdef LIGHT{i}CASTSHADOW
		#if LIGHT{i}TYPE == DIRECTIONAL
			float shadow = getShadow{i}(vec3(0.0));
		#else
			float shadow = getShadow{i}(lightDirW);
		#endif
		shadow = mix(1.0, shadow, light{i}_shadowIntensity);
		dAtten *= shadow;
		#if defined(LIT_SHADOW_CATCHER) && LIGHT{i}TYPE == DIRECTIONAL
			dShadowCatcher *= shadow;
		#endif			
	#endif
	#if LIGHT{i}SHAPE != PUNCTUAL
		#ifdef LIT_SPECULAR
			dDiffuseLight += ((attenDiffuse * dAtten) * lightColor) * (1.0 - dLTCSpecFres);
		#else
			dDiffuseLight += (attenDiffuse * dAtten) * lightColor;
		#endif						
	#else
		#if defined(AREA_LIGHTS) && defined(LIT_SPECULAR)
			dDiffuseLight += (dAtten * lightColor) * (1.0 - litArgs_specularity);
		#else
			dDiffuseLight += dAtten * lightColor;
		#endif
	#endif
	#ifdef LIGHT{i}AFFECT_SPECULARITY
		#if LIGHT{i}SHAPE != PUNCTUAL
			#ifdef LIT_CLEARCOAT
				#if LIGHT{i}SHAPE == RECT
					ccSpecularLight += ccLTCSpecFres * getRectLightSpecular(litArgs_clearcoat_worldNormal, dViewDirW) * dAtten * lightColor;
				#elif LIGHT{i}SHAPE == DISK
					ccSpecularLight += ccLTCSpecFres * getDiskLightSpecular(litArgs_clearcoat_worldNormal, dViewDirW) * dAtten * lightColor;
				#elif LIGHT{i}SHAPE == SPHERE
					ccSpecularLight += ccLTCSpecFres * getSphereLightSpecular(litArgs_clearcoat_worldNormal, dViewDirW) * dAtten * lightColor;
				#endif
			#endif
			#ifdef LIT_SPECULAR
				#if LIGHT{i}SHAPE == RECT
					dSpecularLight += dLTCSpecFres * getRectLightSpecular(litArgs_worldNormal, dViewDirW) * dAtten * lightColor;
				#elif LIGHT{i}SHAPE == DISK
					dSpecularLight += dLTCSpecFres * getDiskLightSpecular(litArgs_worldNormal, dViewDirW) * dAtten * lightColor;
				#elif LIGHT{i}SHAPE == SPHERE
					dSpecularLight += dLTCSpecFres * getSphereLightSpecular(litArgs_worldNormal, dViewDirW) * dAtten * lightColor;
				#endif
			#endif
		#else
			#if LIGHT{i}TYPE == DIRECTIONAL && LIT_FRESNEL_MODEL != NONE
				#define LIGHT{i}FRESNEL
			#endif
			#ifdef LIT_SPECULAR
				vec3 halfDirW = normalize(-dLightDirNormW + dViewDirW);
			#endif
			#ifdef LIT_CLEARCOAT
				vec3 lightspecularCC = getLightSpecular(halfDirW, ccReflDirW, litArgs_clearcoat_worldNormal, dViewDirW, dLightDirNormW, litArgs_clearcoat_gloss, dTBN) * dAtten * lightColor;
				#ifdef LIGHT{i}FRESNEL
					lightspecularCC *= getFresnelCC(dot(dViewDirW, halfDirW));
				#endif
				ccSpecularLight += lightspecularCC;
			#endif
			#ifdef LIT_SHEEN
				sSpecularLight += getLightSpecularSheen(halfDirW, litArgs_worldNormal, dViewDirW, dLightDirNormW, litArgs_sheen_gloss) * dAtten * lightColor;
			#endif
			#ifdef LIT_SPECULAR
				vec3 lightSpecular = getLightSpecular(halfDirW, dReflDirW, litArgs_worldNormal, dViewDirW, dLightDirNormW, litArgs_gloss, dTBN) * dAtten * lightColor;
				#ifdef LIGHT{i}FRESNEL
					#if defined(LIT_IRIDESCENCE)
						lightSpecular *= getFresnel(dot(dViewDirW, halfDirW), litArgs_gloss, litArgs_specularity, iridescenceFresnel, litArgs_iridescence_intensity);
					#else
						lightSpecular *= getFresnel(dot(dViewDirW, halfDirW), litArgs_gloss, litArgs_specularity);
					#endif
				#else
					lightSpecular *= litArgs_specularity;
				#endif
				
				dSpecularLight += lightSpecular;
			#endif
		#endif
	#endif
}
#endif
`

var lightFunctionShadowPS$1 = `
#ifdef LIGHT{i}CASTSHADOW
	#ifdef LIGHT{i}_SHADOW_SAMPLE_POINT
		vec3 getShadowSampleCoordOmni{i}(vec4 shadowParams, vec3 worldPosition, vec3 lightPos, inout vec3 lightDir, vec3 lightDirNorm, vec3 normal) {
			#ifdef LIGHT{i}_SHADOW_SAMPLE_NORMAL_OFFSET
				float distScale = length(lightDir);
				vec3 surfacePosition = worldPosition + normal * shadowParams.y * clamp(1.0 - dot(normal, -lightDirNorm), 0.0, 1.0) * distScale;
				lightDir = surfacePosition - lightPos;
			#endif
			return lightDir;
		}
	#endif
	#ifndef LIGHT{i}_SHADOW_SAMPLE_POINT
		vec3 getShadowSampleCoord{i}(mat4 shadowTransform, vec4 shadowParams, vec3 worldPosition, vec3 lightPos, inout vec3 lightDir, vec3 lightDirNorm, vec3 normal) {
			vec3 surfacePosition = worldPosition;
			#ifdef LIGHT{i}_SHADOW_SAMPLE_SOURCE_ZBUFFER
				#ifdef LIGHT{i}_SHADOW_SAMPLE_NORMAL_OFFSET
					surfacePosition = surfacePosition + normal * shadowParams.y;
				#endif
			#else
				#ifdef LIGHT{i}_SHADOW_SAMPLE_NORMAL_OFFSET
					#ifdef LIGHT{i}_SHADOW_SAMPLE_ORTHO
						float distScale = 1.0;
					#else
						float distScale = abs(dot(vPositionW - lightPos, lightDirNorm));
					#endif
					surfacePosition = surfacePosition + normal * shadowParams.y * clamp(1.0 - dot(normal, -lightDirNorm), 0.0, 1.0) * distScale;
				#endif
			#endif
			vec4 positionInShadowSpace = shadowTransform * vec4(surfacePosition, 1.0);
			#ifdef LIGHT{i}_SHADOW_SAMPLE_ORTHO
				positionInShadowSpace.z = saturate(positionInShadowSpace.z) - 0.0001;
			#else
				#ifdef LIGHT{i}_SHADOW_SAMPLE_SOURCE_ZBUFFER
					positionInShadowSpace.xyz /= positionInShadowSpace.w;
				#else
					positionInShadowSpace.xy /= positionInShadowSpace.w;
					positionInShadowSpace.z = length(lightDir) * shadowParams.w;
				#endif
			#endif
			return positionInShadowSpace.xyz;
		}
	#endif
	float getShadow{i}(vec3 lightDirW) {
		#if LIGHT{i}TYPE == OMNI
			vec3 shadowCoord = getShadowSampleCoordOmni{i}(light{i}_shadowParams, vPositionW, light{i}_position, lightDirW, dLightDirNormW, dVertexNormalW);
		#else
			#ifdef LIGHT{i}_SHADOW_CASCADES
				int cascadeIndex = getShadowCascadeIndex(light{i}_shadowCascadeDistances, light{i}_shadowCascadeCount);
				#ifdef LIGHT{i}_SHADOW_CASCADE_BLEND
					cascadeIndex = ditherShadowCascadeIndex(cascadeIndex, light{i}_shadowCascadeDistances, light{i}_shadowCascadeCount, light{i}_shadowCascadeBlend);
				#endif
				mat4 shadowMatrix = light{i}_shadowMatrixPalette[cascadeIndex];
			#else
				mat4 shadowMatrix = light{i}_shadowMatrix;
			#endif
			#if LIGHT{i}TYPE == DIRECTIONAL
				vec3 shadowCoord = getShadowSampleCoord{i}(shadowMatrix, light{i}_shadowParams, vPositionW, vec3(0.0), lightDirW, dLightDirNormW, dVertexNormalW);
			#else
				vec3 shadowCoord = getShadowSampleCoord{i}(shadowMatrix, light{i}_shadowParams, vPositionW, light{i}_position, lightDirW, dLightDirNormW, dVertexNormalW);
			#endif
		#endif
		#if LIGHT{i}TYPE == DIRECTIONAL
			shadowCoord = fadeShadow(shadowCoord, light{i}_shadowCascadeDistances);
		#endif
		#if LIGHT{i}TYPE == DIRECTIONAL
			#if LIGHT{i}SHADOWTYPE == VSM_16F
				return getShadowVSM16(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, 5.54);
			#endif
			#if LIGHT{i}SHADOWTYPE == VSM_32F
				return getShadowVSM32(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, 15.0);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCSS_32F
				#if LIGHT{i}SHAPE != PUNCTUAL
					vec2 shadowSearchArea = vec2(length(light{i}_halfWidth), length(light{i}_halfHeight)) * light{i}_shadowSearchArea;
					return getShadowPCSS(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, light{i}_cameraParams, shadowSearchArea, lightDirW);
				#else
					return getShadowPCSS(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, light{i}_cameraParams, light{i}_softShadowParams, lightDirW);
				#endif
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF1_16F || LIGHT{i}SHADOWTYPE == PCF1_32F
				return getShadowPCF1x1(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF3_16F || LIGHT{i}SHADOWTYPE == PCF3_32F
				return getShadowPCF3x3(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF5_16F || LIGHT{i}SHADOWTYPE == PCF5_32F
				return getShadowPCF5x5(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams);
			#endif
		#endif
		#if LIGHT{i}TYPE == SPOT
			#if LIGHT{i}SHADOWTYPE == VSM_16F
				return getShadowSpotVSM16(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, 5.54, lightDirW);
			#endif
			#if LIGHT{i}SHADOWTYPE == VSM_32F
				return getShadowSpotVSM32(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, 15.0, lightDirW);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCSS_32F
				#if LIGHT{i}SHAPE != PUNCTUAL
					vec2 shadowSearchArea = vec2(length(light{i}_halfWidth), length(light{i}_halfHeight)) * light{i}_shadowSearchArea;
				#else
					vec2 shadowSearchArea = vec2(light{i}_shadowSearchArea);
				#endif
				return getShadowSpotPCSS(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, light{i}_cameraParams, shadowSearchArea, lightDirW);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF1_16F || LIGHT{i}SHADOWTYPE == PCF1_32F
				return getShadowSpotPCF1x1(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF3_16F || LIGHT{i}SHADOWTYPE == PCF3_32F
				return getShadowSpotPCF3x3(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF5_16F || LIGHT{i}SHADOWTYPE == PCF5_32F
				return getShadowSpotPCF5x5(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams);
			#endif
		#endif
		#if LIGHT{i}TYPE == OMNI
			#if LIGHT{i}SHADOWTYPE == PCSS_32F
				#if LIGHT{i}SHAPE != PUNCTUAL
					vec2 shadowSearchArea = vec2(length(light{i}_halfWidth), length(light{i}_halfHeight)) * light{i}_shadowSearchArea;
				#else
					vec2 shadowSearchArea = vec2(light{i}_shadowSearchArea);
				#endif
				return getShadowOmniPCSS(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, light{i}_cameraParams, shadowSearchArea, lightDirW);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF1_16F || LIGHT{i}SHADOWTYPE == PCF1_32F
				return getShadowOmniPCF1x1(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, lightDirW);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF3_16F || LIGHT{i}SHADOWTYPE == PCF3_32F
				return getShadowOmniPCF3x3(SHADOWMAP_PASS(light{i}_shadowMap), shadowCoord, light{i}_shadowParams, lightDirW);
			#endif
		#endif
	}
#endif
`

var lightingPS$1 = `
#ifdef LIT_CLUSTERED_LIGHTS
	#define LIT_CODE_FALLOFF_LINEAR
	#define LIT_CODE_FALLOFF_SQUARED
	#define LIT_CODE_LIGHTS_POINT
	#define LIT_CODE_LIGHTS_SPOT
#endif
#ifdef AREA_LIGHTS
	uniform highp sampler2D areaLightsLutTex1;
	uniform highp sampler2D areaLightsLutTex2;
#endif
#ifdef LIT_LIGHTING
	#include "lightDiffuseLambertPS"
	#if defined(AREA_LIGHTS) || defined(LIT_CLUSTERED_AREA_LIGHTS)
		#include "ltcPS"
	#endif
#endif
#ifdef SHADOW_DIRECTIONAL
	#include "shadowCascadesPS"
#endif
#if defined(SHADOW_KIND_PCF1)
	#include "shadowPCF1PS"
#endif
#if defined(SHADOW_KIND_PCF3)
	#include "shadowPCF3PS"
#endif
#if defined(SHADOW_KIND_PCF5)
	#include "shadowPCF5PS"
#endif
#if defined(SHADOW_KIND_PCSS)
	#include "linearizeDepthPS"
	#include "shadowPCSSPS"
	#include "shadowSoftPS"
#endif
#if defined(SHADOW_KIND_VSM)
	#include "shadowEVSMPS"
#endif
#ifdef LIT_CODE_FALLOFF_LINEAR
	#include "falloffLinearPS"
#endif
#ifdef LIT_CODE_FALLOFF_SQUARED
	#include "falloffInvSquaredPS"
#endif
#ifdef LIT_CODE_LIGHTS_POINT
	#include "lightDirPointPS"
#endif
#ifdef LIT_CODE_LIGHTS_SPOT
	#include "spotPS"
#endif
#ifdef LIT_CODE_COOKIE
	#include "cookiePS"
#endif
#ifdef LIT_CLUSTERED_LIGHTS
	#include "clusteredLightPS"
#endif
#ifdef LIGHT_COUNT > 0
	#include "lightFunctionShadowPS, LIGHT_COUNT"
	#include "lightFunctionLightPS, LIGHT_COUNT"
#endif
`

var lightmapAddPS$1 = `
void addLightMap(
	vec3 lightmap, 
	vec3 dir, 
	vec3 worldNormal, 
	vec3 viewDir, 
	vec3 reflectionDir, 
	float gloss, 
	vec3 specularity, 
	vec3 vertexNormal, 
	mat3 tbn
#if defined(LIT_IRIDESCENCE)
	vec3 iridescenceFresnel, 
	float iridescenceIntensity
#endif
) {
	#if defined(LIT_SPECULAR) && defined(LIT_DIR_LIGHTMAP)
		if (dot(dir, dir) < 0.0001) {
				dDiffuseLight += lightmap;
		} else {
			float vlight = saturate(dot(dir, -vertexNormal));
			float flight = saturate(dot(dir, -worldNormal));
			float nlight = (flight / max(vlight, 0.01)) * 0.5;
			dDiffuseLight += lightmap * nlight * 2.0;
			vec3 halfDir = normalize(-dir + viewDir);
			vec3 specularLight = lightmap * getLightSpecular(halfDir, reflectionDir, worldNormal, viewDir, dir, gloss, tbn);
			#ifdef LIT_SPECULAR_FRESNEL
				specularLight *= 
					getFresnel(dot(viewDir, halfDir), 
					gloss, 
					specularity
				#if defined(LIT_IRIDESCENCE)
					, iridescenceFresnel,
					iridescenceIntensity
				#endif
					);
			#endif
			dSpecularLight += specularLight;
		}
	#else
		dDiffuseLight += lightmap;
	#endif
}
`

var lightmapPS$1 = `
#ifdef STD_LIGHTMAP_DIR
	vec3 dLightmapDir;
	uniform sampler2D texture_dirLightMap;
#endif
void getLightMap() {
	dLightmap = vec3(1.0);
	#ifdef STD_LIGHT_TEXTURE
		dLightmap *= {STD_LIGHT_TEXTURE_DECODE}(texture2DBias({STD_LIGHT_TEXTURE_NAME}, {STD_LIGHT_TEXTURE_UV}, textureBias)).{STD_LIGHT_TEXTURE_CHANNEL};
		#ifdef STD_LIGHTMAP_DIR
			vec3 dir = texture2DBias(texture_dirLightMap, {STD_LIGHT_TEXTURE_UV}, textureBias).xyz * 2.0 - 1.0;
			float dirDot = dot(dir, dir);
			dLightmapDir = (dirDot > 0.001) ? dir / sqrt(dirDot) : vec3(0.0);
		#endif
	#endif
	#ifdef STD_LIGHT_VERTEX
		dLightmap *= saturate(vVertexColor.{STD_LIGHT_VERTEX_CHANNEL});
	#endif
}
`

var lightSpecularAnisoGGXPS$1 = `
float calcLightSpecular(float gloss, vec3 worldNormal, vec3 viewDir, vec3 h, vec3 lightDirNorm, mat3 tbn) {
	float PI = 3.141592653589793;
	float roughness = max((1.0 - gloss) * (1.0 - gloss), 0.001);
	float alphaRoughness = roughness * roughness;
	float anisotropy = dAnisotropy;
	vec2 direction = dAnisotropyRotation;
	float at = mix(alphaRoughness, 1.0, anisotropy * anisotropy);
	float ab = clamp(alphaRoughness, 0.001, 1.0);
	vec3 anisotropicT = normalize(tbn * vec3(direction, 0.0));
	vec3 anisotropicB = normalize(cross(tbn[2], anisotropicT));
	float NoH = dot(worldNormal, h);
	float ToH = dot(anisotropicT, h);
	float BoH = dot(anisotropicB, h);
	float a2 = at * ab;
	vec3 v = vec3(ab * ToH, at * BoH, a2 * NoH);
	float v2 = dot(v, v);
	float w2 = a2 / v2;
	float D = a2 * w2 * w2 * (1.0 / PI);
	float ToV = dot(anisotropicT, viewDir);
	float BoV = dot(anisotropicB, viewDir);
	float ToL = dot(anisotropicT, -lightDirNorm);
	float BoL = dot(anisotropicB, -lightDirNorm);
	float NoV = dot(worldNormal, viewDir);
	float NoL = dot(worldNormal, -lightDirNorm);
	float lambdaV = NoL * length(vec3(at * ToV, ab * BoV, NoV));
	float lambdaL = NoV * length(vec3(at * ToL, ab * BoL, NoL));
	float G = 0.5 / (lambdaV + lambdaL);
	return D * G;
}
float getLightSpecular(vec3 h, vec3 reflDir, vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm, float gloss, mat3 tbn) {
	return calcLightSpecular(gloss, worldNormal, viewDir, h, lightDirNorm, tbn);
}
`

var lightSpecularGGXPS$1 = `
float calcLightSpecular(float gloss, vec3 worldNormal, vec3 viewDir, vec3 h, vec3 lightDirNorm) {
	const float PI = 3.141592653589793;
	float roughness = max((1.0 - gloss) * (1.0 - gloss), 0.001);
	float alpha = roughness * roughness;
	float NoH = max(dot(worldNormal, h), 0.0);
	float NoV = max(dot(worldNormal, viewDir), 0.0);
	float NoL = max(dot(worldNormal, -lightDirNorm), 0.0);
	float NoH2 = NoH * NoH;
	float denom = NoH2 * (alpha - 1.0) + 1.0;
	float D = alpha / (PI * denom * denom);
	float alpha2 = alpha * alpha;
	float lambdaV = NoL * sqrt(NoV * NoV * (1.0 - alpha2) + alpha2);
	float lambdaL = NoV * sqrt(NoL * NoL * (1.0 - alpha2) + alpha2);
	float G = 0.5 / max(lambdaV + lambdaL, 0.00001);
	return D * G;
}
float getLightSpecular(vec3 h, vec3 reflDir, vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm, float gloss, mat3 tbn) {
	return calcLightSpecular(gloss, worldNormal, viewDir, h, lightDirNorm);
}
`

var lightSpecularBlinnPS$1 = `
float calcLightSpecular(float gloss, vec3 worldNormal, vec3 h) {
	float nh = max( dot( h, worldNormal ), 0.0 );
	float specPow = exp2(gloss * 11.0);
	specPow = max(specPow, 0.0001);
	return pow(nh, specPow) * (specPow + 2.0) / 8.0;
}
float getLightSpecular(vec3 h, vec3 reflDir, vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm, float gloss, mat3 tbn) {
	return calcLightSpecular(gloss, worldNormal, h);
}
`

var lightSheenPS$1 = `
float sheenD(vec3 normal, vec3 h, float roughness) {
	const float PI = 3.141592653589793;
	float invR = 1.0 / (roughness * roughness);
	float cos2h = max(dot(normal, h), 0.0);
	cos2h *= cos2h;
	float sin2h = max(1.0 - cos2h, 0.0078125);
	return (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * PI);
}
float sheenV(vec3 normal, vec3 viewDir, vec3 light) {
	float NoV = max(dot(normal, viewDir), 0.000001);
	float NoL = max(dot(normal, light), 0.000001);
	return 1.0 / (4.0 * (NoL + NoV - NoL * NoV));
}
float getLightSpecularSheen(vec3 h, vec3 worldNormal, vec3 viewDir, vec3 lightDirNorm, float sheenGloss) {
	float D = sheenD(worldNormal, h, sheenGloss);
	float V = sheenV(worldNormal, viewDir, -lightDirNorm);
	return D * V;
}
`

var linearizeDepthPS$1 = `
#ifndef LINEARIZE_DEPTH
#define LINEARIZE_DEPTH
float linearizeDepthWithParams(float z, vec4 cameraParams) {
	if (cameraParams.w == 0.0)
		return (cameraParams.z * cameraParams.y) / (cameraParams.y + z * (cameraParams.z - cameraParams.y));
	else
		return cameraParams.z + z * (cameraParams.y - cameraParams.z);
}
#ifndef CAMERAPLANES
	#define CAMERAPLANES
	uniform vec4 camera_params;
#endif
float linearizeDepth(float z) {
	return linearizeDepthWithParams(z, camera_params);
}
#endif
`

var litForwardBackendPS$1 = `
void evaluateBackend() {
	#ifdef LIT_SSAO
		litArgs_ao *= texture2DLod(ssaoTexture, gl_FragCoord.xy * ssaoTextureSizeInv, 0.0).r;
	#endif
	#ifdef LIT_NEEDS_NORMAL
		#ifdef LIT_SPECULAR
			getReflDir(litArgs_worldNormal, dViewDirW, litArgs_gloss, dTBN);
		#endif
		#ifdef LIT_CLEARCOAT
			ccReflDirW = normalize(-reflect(dViewDirW, litArgs_clearcoat_worldNormal));
		#endif
	#endif
	#ifdef LIT_SPECULAR_OR_REFLECTION
		#ifdef LIT_METALNESS
			float f0 = 1.0 / litArgs_ior;
			f0 = (f0 - 1.0) / (f0 + 1.0);
			f0 *= f0;
			#ifdef LIT_SPECULARITY_FACTOR
				litArgs_specularity = getSpecularModulate(litArgs_specularity, litArgs_albedo, litArgs_metalness, f0, litArgs_specularityFactor);
			#else
				litArgs_specularity = getSpecularModulate(litArgs_specularity, litArgs_albedo, litArgs_metalness, f0, 1.0);
			#endif
			litArgs_albedo = getAlbedoModulate(litArgs_albedo, litArgs_metalness);
		#endif
		#ifdef LIT_IRIDESCENCE
			vec3 iridescenceFresnel = getIridescence(saturate(dot(dViewDirW, litArgs_worldNormal)), litArgs_specularity, litArgs_iridescence_thickness);
		#endif
	#endif
	#ifdef LIT_ADD_AMBIENT
		addAmbient(litArgs_worldNormal);
		#ifdef LIT_SPECULAR
			dDiffuseLight = dDiffuseLight * (1.0 - litArgs_specularity);
		#endif
		#ifdef LIT_SEPARATE_AMBIENT
			vec3 dAmbientLight = dDiffuseLight;
			dDiffuseLight = vec3(0);
		#endif
	#endif
	#ifndef LIT_OLD_AMBIENT
		dDiffuseLight *= material_ambient;
	#endif
	#ifdef LIT_AO
		#ifndef LIT_OCCLUDE_DIRECT
			occludeDiffuse(litArgs_ao);
		#endif
	#endif
	#ifdef LIT_LIGHTMAP
		addLightMap(
			litArgs_lightmap, 
			litArgs_lightmapDir, 
			litArgs_worldNormal, 
			dViewDirW, 
			dReflDirW, 
			litArgs_gloss, 
			litArgs_specularity, 
			dVertexNormalW,
			dTBN
		#if defined(LIT_IRIDESCENCE)
			, iridescenceFresnel,
			litArgs_iridescence_intensity
		#endif
		);
	#endif
	#ifdef LIT_LIGHTING || LIT_REFLECTIONS
		#ifdef LIT_REFLECTIONS
			#ifdef LIT_CLEARCOAT
				addReflectionCC(ccReflDirW, litArgs_clearcoat_gloss);
			
				#ifdef LIT_SPECULAR_FRESNEL
					ccFresnel = getFresnelCC(dot(dViewDirW, litArgs_clearcoat_worldNormal));
					ccReflection *= ccFresnel;
				#else
					ccFresnel = 0.0;
				#endif
			#endif
			#ifdef LIT_SPECULARITY_FACTOR
				ccReflection *= litArgs_specularityFactor;
			#endif
			#ifdef LIT_SHEEN
				addReflectionSheen(litArgs_worldNormal, dViewDirW, litArgs_sheen_gloss);
			#endif
			addReflection(dReflDirW, litArgs_gloss);
			#ifdef LIT_FRESNEL_MODEL
				dReflection.rgb *= getFresnel(
					dot(dViewDirW, litArgs_worldNormal), 
					litArgs_gloss, 
					litArgs_specularity
				#if defined(LIT_IRIDESCENCE)
					, iridescenceFresnel,
					litArgs_iridescence_intensity
				#endif
					);
			#else
				dReflection.rgb *= litArgs_specularity;
			#endif
		#endif
		#ifdef AREA_LIGHTS
			dSpecularLight *= litArgs_specularity;
			#ifdef LIT_SPECULAR
				calcLTCLightValues(litArgs_gloss, litArgs_worldNormal, dViewDirW, litArgs_specularity, litArgs_clearcoat_gloss, litArgs_clearcoat_worldNormal, litArgs_clearcoat_specularity);
			#endif
		#endif
		
		#ifdef LIGHT_COUNT > 0
			#include "lightEvaluationPS, LIGHT_COUNT"
		#endif
		#ifdef LIT_CLUSTERED_LIGHTS
			addClusteredLights(litArgs_worldNormal, dViewDirW, dReflDirW,
				#if defined(LIT_CLEARCOAT)
						ccReflDirW,
				#endif
						litArgs_gloss, litArgs_specularity, dVertexNormalW, dTBN, 
				#if defined(LIT_IRIDESCENCE)
						iridescenceFresnel,
				#endif
						litArgs_clearcoat_worldNormal, litArgs_clearcoat_gloss, litArgs_sheen_gloss, litArgs_iridescence_intensity
			);
		#endif
		#ifdef AREA_LIGHTS
			#ifdef LIT_CLEARCOAT
				litArgs_clearcoat_specularity = 1.0;
			#endif
			#ifdef LIT_SPECULAR
				litArgs_specularity = vec3(1);
			#endif
		#endif
		#ifdef LIT_REFRACTION
			addRefraction(
				litArgs_worldNormal, 
				dViewDirW, 
				litArgs_thickness, 
				litArgs_gloss, 
				litArgs_specularity, 
				litArgs_albedo, 
				litArgs_transmission,
				litArgs_ior,
				litArgs_dispersion
				#if defined(LIT_IRIDESCENCE)
					, iridescenceFresnel, 
					litArgs_iridescence_intensity
				#endif
			);
		#endif
	#endif
	#ifdef LIT_AO
		#ifdef LIT_OCCLUDE_DIRECT
			occludeDiffuse(litArgs_ao);
		#endif
		#if LIT_OCCLUDE_SPECULAR != NONE
			occludeSpecular(litArgs_gloss, litArgs_ao, litArgs_worldNormal, dViewDirW);
		#endif
	#endif
	#if !defined(LIT_OPACITY_FADES_SPECULAR)
		#if LIT_BLEND_TYPE == NORMAL || LIT_BLEND_TYPE == PREMULTIPLIED
			float specLum = dot((dSpecularLight + dReflection.rgb * dReflection.a), vec3( 0.2126, 0.7152, 0.0722 ));
			#ifdef LIT_CLEARCOAT
				specLum += dot(ccSpecularLight * litArgs_clearcoat_specularity + ccReflection * litArgs_clearcoat_specularity, vec3( 0.2126, 0.7152, 0.0722 ));
			#endif
			litArgs_opacity = clamp(litArgs_opacity + gammaCorrectInput(specLum), 0.0, 1.0);
		#endif
		litArgs_opacity *= material_alphaFade;
	#endif
	#ifdef LIT_LIGHTMAP_BAKING
		#ifdef LIT_LIGHTMAP_BAKING_COLOR
			#include "bakeLmEndPS"
		#endif
		#ifdef LIT_LIGHTMAP_BAKING_DIR
			#include "bakeDirLmEndPS"
		#endif
	#else
		#include "endPS"
		#include "outputAlphaPS"
	#endif
	#ifdef LIT_MSDF
		gl_FragColor = applyMsdf(gl_FragColor);
	#endif
	#include "outputPS"
	#include "debugOutputPS"
	#ifdef LIT_SHADOW_CATCHER
		gl_FragColor.rgb = vec3(dShadowCatcher);
	#endif
}
`

var litForwardDeclarationPS$1 = `
vec3 sReflection;
vec3 dVertexNormalW;
vec3 dTangentW;
vec3 dBinormalW;
vec3 dViewDirW;
vec3 dReflDirW;
vec3 ccReflDirW;
vec3 dLightDirNormW;
float dAtten;
mat3 dTBN;
vec4 dReflection;
vec3 dDiffuseLight;
vec3 dSpecularLight;
float ccFresnel;
vec3 ccReflection;
vec3 ccSpecularLight;
float ccSpecularityNoFres;
vec3 sSpecularLight;
#ifdef LIT_DISPERSION
	uniform float material_dispersion;
#endif
#ifndef LIT_OPACITY_FADES_SPECULAR
	uniform float material_alphaFade;
#endif
#ifdef LIT_SSAO
	uniform sampler2D ssaoTexture;
	uniform vec2 ssaoTextureSizeInv;
#endif
#ifdef LIT_SHADOW_CATCHER
	float dShadowCatcher = 1.0;
#endif
#if LIGHT_COUNT > 0
	#include "lightDeclarationPS, LIGHT_COUNT"
#endif
#ifdef LIT_SPECULAR
	#if LIT_FRESNEL_MODEL == NONE && !defined(LIT_REFLECTIONS) && !defined(LIT_DIFFUSE_MAP) 
		#define LIT_OLD_AMBIENT
	#endif
#endif
#ifdef STD_LIGHTMAP_DIR
	uniform float bakeDir;
#endif
#ifdef LIT_LIGHTMAP_BAKING_ADD_AMBIENT
	uniform float ambientBakeOcclusionContrast;
	uniform float ambientBakeOcclusionBrightness;
#endif
`

var litForwardMainPS$1 = `
void main(void) {
	#include "litUserMainStartPS"
	dReflection = vec4(0);
	#ifdef LIT_CLEARCOAT
		ccSpecularLight = vec3(0);
		ccReflection = vec3(0);
	#endif
	#if LIT_NONE_SLICE_MODE == SLICED
		#include "startNineSlicedPS"
	#elif LIT_NONE_SLICE_MODE == TILED
		#include "startNineSlicedTiledPS"
	#endif
	#ifdef LIT_NEEDS_NORMAL
		dVertexNormalW = normalize(vNormalW);
		#ifdef LIT_TANGENTS
			#if defined(LIT_HEIGHTS) || defined(LIT_USE_NORMALS) || defined(LIT_USE_CLEARCOAT_NORMALS) || defined(LIT_GGX_SPECULAR)
				dTangentW = vTangentW;
				dBinormalW = vBinormalW;
			#endif
		#endif
		getViewDir();
		#ifdef LIT_TBN
			getTBN(dTangentW, dBinormalW, dVertexNormalW);
			#ifdef LIT_TWO_SIDED_LIGHTING
				handleTwoSidedLighting();
			#endif
		#endif
	#endif
	evaluateFrontend();
	#include "debugProcessFrontendPS"
	evaluateBackend();
	#include "litUserMainEndPS"
}
`

var litForwardPostCodePS$1 = `
#ifdef LIT_NEEDS_NORMAL
	#include "cubeMapRotatePS"
	#include "cubeMapProjectPS"
	#include "envProcPS"
#endif
#ifdef LIT_SPECULAR_OR_REFLECTION
	#ifdef LIT_METALNESS
		#include "metalnessModulatePS"
	#endif
	#if LIT_FRESNEL_MODEL == SCHLICK
		#include "fresnelSchlickPS"
	#endif
	#ifdef LIT_IRIDESCENCE
		#include "iridescenceDiffractionPS"
	#endif
#endif
#ifdef LIT_AO
	#include "aoDiffuseOccPS"
	#include "aoSpecOccPS"
#endif
#if LIT_REFLECTION_SOURCE == ENVATLASHQ
	#include "envAtlasPS"
	#include "reflectionEnvHQPS"
#elif LIT_REFLECTION_SOURCE == ENVATLAS
	#include "envAtlasPS"
	#include "reflectionEnvPS"
#elif LIT_REFLECTION_SOURCE == CUBEMAP
	#include "reflectionCubePS"
#elif LIT_REFLECTION_SOURCE == SPHEREMAP
	#include "reflectionSpherePS"
#endif
#ifdef LIT_REFLECTIONS
	#ifdef LIT_CLEARCOAT
		#include "reflectionCCPS"
	#endif
	#ifdef LIT_SHEEN
		#include "reflectionSheenPS"
	#endif
#endif
#ifdef LIT_REFRACTION
	#if defined(LIT_DYNAMIC_REFRACTION)
		#include "refractionDynamicPS"
	#elif defined(LIT_REFLECTIONS)
		#include "refractionCubePS"
	#endif
#endif
#ifdef LIT_SHEEN
	#include "lightSheenPS"
#endif
uniform vec3 material_ambient;
#ifdef LIT_SPECULAR
	#ifdef LIT_LIGHTING
		#ifdef LIT_GGX_SPECULAR
			#ifdef LIT_ANISOTROPY
				#include "lightSpecularAnisoGGXPS"
			#else
				#include "lightSpecularGGXPS"
			#endif
		#else
			#include "lightSpecularBlinnPS"
		#endif
	#endif
#endif
#include "combinePS"
#ifdef LIT_LIGHTMAP
	#include "lightmapAddPS"
#endif
#ifdef LIT_ADD_AMBIENT
	#include "ambientPS"
#endif
#ifdef LIT_MSDF
	#include "msdfPS"
#endif
#ifdef LIT_NEEDS_NORMAL
	#include "viewDirPS"
	#ifdef LIT_SPECULAR
		#ifdef LIT_ANISOTROPY
			#include "reflDirAnisoPS"
		#else
			#include "reflDirPS"
		#endif
	#endif
#endif
#include "lightingPS"
`

var litForwardPreCodePS$1 = `
#include "basePS"
#include "sphericalPS"
#include "decodePS"
#include "gammaPS"
#include "tonemappingPS"
#include "fogPS"
#if LIT_NONE_SLICE_MODE == SLICED
	#include "baseNineSlicedPS"
#elif LIT_NONE_SLICE_MODE == TILED
	#include "baseNineSlicedTiledPS"
#endif
#ifdef LIT_TBN
	#include "TBNPS"
	#ifdef LIT_TWO_SIDED_LIGHTING
		#include "twoSidedLightingPS"
	#endif
#endif
`

var litMainPS$1 = `
#include "varyingsPS"
#include "litUserDeclarationPS"
#include "frontendDeclPS"
#if defined(PICK_PASS) || defined(PREPASS_PASS)
	#include "frontendCodePS"
	#include "litUserCodePS"
	#include "litOtherMainPS"
#elif defined(SHADOW_PASS)
	#include "frontendCodePS"
	#include "litUserCodePS"
	#include "litShadowMainPS"
#else
	#include "litForwardDeclarationPS"
	#include "litForwardPreCodePS"
	#include "frontendCodePS"
	#include "litForwardPostCodePS"
	#include "litForwardBackendPS"
	#include "litUserCodePS"
	#include "litForwardMainPS"
#endif
`

var litMainVS$1 = `
#include "varyingsVS"
#include  "litUserDeclarationVS"
#ifdef VERTEX_COLOR
	attribute vec4 vertex_color;
#endif
#ifdef NINESLICED
	varying vec2 vMask;
	varying vec2 vTiledUv;
	uniform mediump vec4 innerOffset;
	uniform mediump vec2 outerScale;
	uniform mediump vec4 atlasRect;
#endif
vec3 dPositionW;
mat4 dModelMatrix;
#include "transformCoreVS"
#ifdef UV0
	attribute vec2 vertex_texCoord0;
	#include "uv0VS"
#endif
#ifdef UV1
	attribute vec2 vertex_texCoord1;
	#include "uv1VS"
#endif
#ifdef LINEAR_DEPTH
	#ifndef VIEWMATRIX
	#define VIEWMATRIX
		uniform mat4 matrix_view;
	#endif
#endif
#include "transformVS"
#ifdef NORMALS
	#include "normalCoreVS"
	#include "normalVS"
#endif
#ifdef TANGENTS
	attribute vec4 vertex_tangent;
#endif
#include "uvTransformUniformsPS, UV_TRANSFORMS_COUNT"
#ifdef MSDF
	#include "msdfVS"
#endif
#include  "litUserCodeVS"
#ifdef VERTEX_COLOR
	vec3 decodeGamma(vec3 raw) {
		return pow(raw, vec3(2.2));
	}
	vec4 gammaCorrectInput(vec4 color) {
		return vec4(decodeGamma(color.xyz), color.w);
	}
#endif
void main(void) {
	#include "litUserMainStartVS"
	gl_PointSize = 1.0;
	gl_Position = getPosition();
	vPositionW = getWorldPosition();
	#ifdef NORMALS
		vNormalW = getNormal();
	#endif
	#ifdef TANGENTS
		vTangentW = normalize(dNormalMatrix * vertex_tangent.xyz);
		vBinormalW = cross(vNormalW, vTangentW) * vertex_tangent.w;
	#elif defined(GGX_SPECULAR)
		vObjectSpaceUpW = normalize(dNormalMatrix * vec3(0, 1, 0));
	#endif
	#ifdef UV0
		vec2 uv0 = getUv0();
		#ifdef UV0_UNMODIFIED
			vUv0 = uv0;
		#endif
	#endif
	#ifdef UV1
		vec2 uv1 = getUv1();
		#ifdef UV1_UNMODIFIED
			vUv1 = uv1;
		#endif
	#endif
	#include "uvTransformVS, UV_TRANSFORMS_COUNT"
	#ifdef VERTEX_COLOR
		#ifdef STD_VERTEX_COLOR_GAMMA
			vVertexColor = gammaCorrectInput(vertex_color);
		#else
			vVertexColor = vertex_color;
		#endif
	#endif
	#ifdef LINEAR_DEPTH
		vLinearDepth = -(matrix_view * vec4(vPositionW, 1.0)).z;
	#endif
	#ifdef MSDF
		unpackMsdfParams();
	#endif
	#include "litUserMainEndVS"
}
`

var litOtherMainPS$1 = `
#ifdef PICK_PASS
	#include "pickPS"
#endif
#ifdef PREPASS_PASS
	#include "floatAsUintPS"
#endif
void main(void) {
	#include "litUserMainStartPS"
	evaluateFrontend();
	#ifdef PICK_PASS
		pcFragColor0 = getPickOutput();
		#ifdef DEPTH_PICK_PASS
			pcFragColor1 = getPickDepth();
		#endif
	#endif
	#ifdef PREPASS_PASS
		gl_FragColor = float2vec4(vLinearDepth);
	#endif
	#include "litUserMainEndPS"
}
`

var litShaderArgsPS$1 = `
vec3 litArgs_albedo;
float litArgs_opacity;
vec3 litArgs_emission;
vec3 litArgs_worldNormal;
float litArgs_ao;
vec3 litArgs_lightmap;
vec3 litArgs_lightmapDir;
float litArgs_metalness;
vec3 litArgs_specularity;
float litArgs_specularityFactor;
float litArgs_gloss;
float litArgs_sheen_gloss;
vec3 litArgs_sheen_specularity;
float litArgs_transmission;
float litArgs_thickness;
float litArgs_ior;
float litArgs_dispersion;
float litArgs_iridescence_intensity;
float litArgs_iridescence_thickness;
vec3 litArgs_clearcoat_worldNormal;
float litArgs_clearcoat_specularity;
float litArgs_clearcoat_gloss;
`

var litShaderCorePS$1 = `
	#if LIT_NONE_SLICE_MODE == TILED
		const float textureBias = -1000.0;
	#else
		uniform float textureBias;
	#endif
	#include "litShaderArgsPS"
`

var litShadowMainPS$1 = `
#if LIGHT_TYPE != DIRECTIONAL
	uniform vec3 view_position;
	uniform float light_radius;
#endif
#if SHADOW_TYPE == PCSS_32F
	#include "linearizeDepthPS"
#endif
void main(void) {
	#include "litUserMainStartPS"
	evaluateFrontend();
	#ifdef PERSPECTIVE_DEPTH
		float depth = gl_FragCoord.z;
		#if SHADOW_TYPE == PCSS_32F
			#if LIGHT_TYPE != DIRECTIONAL
				depth = linearizeDepthWithParams(depth, camera_params);
			#endif
		#endif
	#else
		float depth = min(distance(view_position, vPositionW) / light_radius, 0.99999);
		#define MODIFIED_DEPTH
	#endif
	#if SHADOW_TYPE == VSM_16F || SHADOW_TYPE == VSM_32F
		#if SHADOW_TYPE == VSM_32F
			float exponent = 15.0;
		#else
			float exponent = 5.54;
		#endif
		depth = 2.0 * depth - 1.0;
		depth =  exp(exponent * depth);
		gl_FragColor = vec4(depth, depth*depth, 1.0, 1.0);
	#else
		#if SHADOW_TYPE == PCSS_32F
			gl_FragColor.r = depth;
		#else
			#ifdef MODIFIED_DEPTH
				gl_FragDepth = depth;
			#endif
			gl_FragColor = vec4(1.0);
		#endif
	#endif
	#include "litUserMainEndPS"
}
`

var ltcPS$1 = `
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
struct Coords {
	vec3 coord0;
	vec3 coord1;
	vec3 coord2;
	vec3 coord3;
};
float LTC_EvaluateRect( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in Coords rectCoords) {
	vec3 v1 = rectCoords.coord1 - rectCoords.coord0;
	vec3 v2 = rectCoords.coord3 - rectCoords.coord0;
	
	vec3 lightNormal = cross( v1, v2 );
	float factor = sign(-dot( lightNormal, P - rectCoords.coord0 ));
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 =  factor * cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords.coord0 - P );
	coords[ 1 ] = mat * ( rectCoords.coord1 - P );
	coords[ 2 ] = mat * ( rectCoords.coord2 - P );
	coords[ 3 ] = mat * ( rectCoords.coord3 - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return result;
}
Coords dLTCCoords;
Coords getLTCLightCoords(vec3 lightPos, vec3 halfWidth, vec3 halfHeight){
	Coords coords;
	coords.coord0 = lightPos + halfWidth - halfHeight;
	coords.coord1 = lightPos - halfWidth - halfHeight;
	coords.coord2 = lightPos - halfWidth + halfHeight;
	coords.coord3 = lightPos + halfWidth + halfHeight;
	return coords;
}
float dSphereRadius;
Coords getSphereLightCoords(vec3 lightPos, vec3 halfWidth, vec3 halfHeight){
	dSphereRadius = max(length(halfWidth), length(halfHeight));
	vec3 f = reflect(normalize(lightPos - view_position), vNormalW);
	vec3 w = normalize(cross(f, halfHeight));
	vec3 h = normalize(cross(f, w));
	return getLTCLightCoords(lightPos, w * dSphereRadius, h * dSphereRadius);
}
vec2 dLTCUV;
#ifdef LIT_CLEARCOAT
	vec2 ccLTCUV;
#endif
vec2 getLTCLightUV(float gloss, vec3 worldNormal, vec3 viewDir)
{
	float roughness = max((1.0 - gloss) * (1.0 - gloss), 0.001);
	return LTC_Uv( worldNormal, viewDir, roughness );
}
vec3 dLTCSpecFres;
#ifdef LIT_CLEARCOAT
	vec3 ccLTCSpecFres;
#endif
vec3 getLTCLightSpecFres(vec2 uv, vec3 specularity)
{
	vec4 t2 = texture2DLod(areaLightsLutTex2, uv, 0.0);
	return specularity * t2.x + ( vec3( 1.0 ) - specularity) * t2.y;
}
void calcLTCLightValues(float gloss, vec3 worldNormal, vec3 viewDir, vec3 specularity, float clearcoatGloss, vec3 clearcoatWorldNormal, float clearcoatSpecularity)
{
	dLTCUV = getLTCLightUV(gloss, worldNormal, viewDir);
	dLTCSpecFres = getLTCLightSpecFres(dLTCUV, specularity); 
#ifdef LIT_CLEARCOAT
	ccLTCUV = getLTCLightUV(clearcoatGloss, clearcoatWorldNormal, viewDir);
	ccLTCSpecFres = getLTCLightSpecFres(ccLTCUV, vec3(clearcoatSpecularity));
#endif
}
void calcRectLightValues(vec3 lightPos, vec3 halfWidth, vec3 halfHeight) {
	dLTCCoords = getLTCLightCoords(lightPos, halfWidth, halfHeight);
}
void calcDiskLightValues(vec3 lightPos, vec3 halfWidth, vec3 halfHeight) {
	calcRectLightValues(lightPos, halfWidth, halfHeight);
}
void calcSphereLightValues(vec3 lightPos, vec3 halfWidth, vec3 halfHeight) {
	dLTCCoords = getSphereLightCoords(lightPos, halfWidth, halfHeight);
}
vec3 SolveCubic(vec4 Coefficient)
{
	float pi = 3.14159;
	Coefficient.xyz /= Coefficient.w;
	Coefficient.yz /= 3.0;
	float A = Coefficient.w;
	float B = Coefficient.z;
	float C = Coefficient.y;
	float D = Coefficient.x;
	vec3 Delta = vec3(
		-Coefficient.z * Coefficient.z + Coefficient.y,
		-Coefficient.y * Coefficient.z + Coefficient.x,
		dot(vec2(Coefficient.z, -Coefficient.y), Coefficient.xy)
	);
	float Discriminant = dot(vec2(4.0 * Delta.x, -Delta.y), Delta.zy);
	vec2 xlc, xsc;
	{
		float A_a = 1.0;
		float C_a = Delta.x;
		float D_a = -2.0 * B * Delta.x + Delta.y;
		float Theta = atan(sqrt(Discriminant), -D_a) / 3.0;
		float x_1a = 2.0 * sqrt(-C_a) * cos(Theta);
		float x_3a = 2.0 * sqrt(-C_a) * cos(Theta + (2.0 / 3.0) * pi);
		float xl;
		if ((x_1a + x_3a) > 2.0 * B)
			xl = x_1a;
		else
			xl = x_3a;
		xlc = vec2(xl - B, A);
	}
	{
		float A_d = D;
		float C_d = Delta.z;
		float D_d = -D * Delta.y + 2.0 * C * Delta.z;
		float Theta = atan(D * sqrt(Discriminant), -D_d) / 3.0;
		float x_1d = 2.0 * sqrt(-C_d) * cos(Theta);
		float x_3d = 2.0 * sqrt(-C_d) * cos(Theta + (2.0 / 3.0) * pi);
		float xs;
		if (x_1d + x_3d < 2.0 * C)
			xs = x_1d;
		else
			xs = x_3d;
		xsc = vec2(-D, xs + C);
	}
	float E =  xlc.y * xsc.y;
	float F = -xlc.x * xsc.y - xlc.y * xsc.x;
	float G =  xlc.x * xsc.x;
	vec2 xmc = vec2(C * F - B * G, -B * F + C * E);
	vec3 Root = vec3(xsc.x / xsc.y, xmc.x / xmc.y, xlc.x / xlc.y);
	if (Root.x < Root.y && Root.x < Root.z)
		Root.xyz = Root.yxz;
	else if (Root.z < Root.x && Root.z < Root.y)
		Root.xyz = Root.xzy;
	return Root;
}
float LTC_EvaluateDisk(vec3 N, vec3 V, vec3 P, mat3 Minv, Coords points)
{
	vec3 T1 = normalize(V - N * dot(V, N));
	vec3 T2 = cross(N, T1);
	mat3 R = transposeMat3( mat3( T1, T2, N ) );
	vec3 L_[ 3 ];
	L_[ 0 ] = R * ( points.coord0 - P );
	L_[ 1 ] = R * ( points.coord1 - P );
	L_[ 2 ] = R * ( points.coord2 - P );
	vec3 C  = 0.5 * (L_[0] + L_[2]);
	vec3 V1 = 0.5 * (L_[1] - L_[2]);
	vec3 V2 = 0.5 * (L_[1] - L_[0]);
	C  = Minv * C;
	V1 = Minv * V1;
	V2 = Minv * V2;
	float a, b;
	float d11 = dot(V1, V1);
	float d22 = dot(V2, V2);
	float d12 = dot(V1, V2);
	if (abs(d12) / sqrt(d11 * d22) > 0.0001)
	{
		float tr = d11 + d22;
		float det = -d12 * d12 + d11 * d22;
		det = sqrt(det);
		float u = 0.5 * sqrt(tr - 2.0 * det);
		float v = 0.5 * sqrt(tr + 2.0 * det);
		float e_max = (u + v) * (u + v);
		float e_min = (u - v) * (u - v);
		vec3 V1_, V2_;
		if (d11 > d22)
		{
			V1_ = d12 * V1 + (e_max - d11) * V2;
			V2_ = d12 * V1 + (e_min - d11) * V2;
		}
		else
		{
			V1_ = d12*V2 + (e_max - d22)*V1;
			V2_ = d12*V2 + (e_min - d22)*V1;
		}
		a = 1.0 / e_max;
		b = 1.0 / e_min;
		V1 = normalize(V1_);
		V2 = normalize(V2_);
	}
	else
	{
		a = 1.0 / dot(V1, V1);
		b = 1.0 / dot(V2, V2);
		V1 *= sqrt(a);
		V2 *= sqrt(b);
	}
	vec3 V3 = normalize(cross(V1, V2));
	if (dot(C, V3) < 0.0)
		V3 *= -1.0;
	float L  = dot(V3, C);
	float x0 = dot(V1, C) / L;
	float y0 = dot(V2, C) / L;
	float E1 = inversesqrt(a);
	float E2 = inversesqrt(b);
	a *= L * L;
	b *= L * L;
	float c0 = a * b;
	float c1 = a * b * (1.0 + x0 * x0 + y0 * y0) - a - b;
	float c2 = 1.0 - a * (1.0 + x0 * x0) - b * (1.0 + y0 * y0);
	float c3 = 1.0;
	vec3 roots = SolveCubic(vec4(c0, c1, c2, c3));
	float e1 = roots.x;
	float e2 = roots.y;
	float e3 = roots.z;
	vec3 avgDir = vec3(a * x0 / (a - e2), b * y0 / (b - e2), 1.0);
	mat3 rotate = mat3(V1, V2, V3);
	avgDir = rotate * avgDir;
	avgDir = normalize(avgDir);
	float L1 = sqrt(-e2 / e3);
	float L2 = sqrt(-e2 / e1);
	float formFactor = max(0.0, L1 * L2 * inversesqrt((1.0 + L1 * L1) * (1.0 + L2 * L2)));
	
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	vec2 uv = vec2(avgDir.z * 0.5 + 0.5, formFactor);
	uv = uv*LUT_SCALE + LUT_BIAS;
	float scale = texture2DLod(areaLightsLutTex2, uv, 0.0).w;
	return formFactor*scale;
}
float FixNan(float value) {
	#ifdef WEBGPU
		return value != value ? 0.0 : value;
	#else
		return isnan(value) ? 0.0 : value;
	#endif
}
float getRectLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDir, vec3 lightDirNorm) {
	return LTC_EvaluateRect( worldNormal, viewDir, vPositionW, mat3( 1.0 ), dLTCCoords );
}
float getDiskLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDir, vec3 lightDirNorm) {
	return FixNan(LTC_EvaluateDisk( worldNormal, viewDir, vPositionW, mat3( 1.0 ), dLTCCoords ));
}
float getSphereLightDiffuse(vec3 worldNormal, vec3 viewDir, vec3 lightDir, vec3 lightDirNorm) {
	float falloff = dSphereRadius / (dot(lightDir, lightDir) + dSphereRadius);
	return FixNan(getLightDiffuse(worldNormal, viewDir, lightDirNorm) * falloff);
}
mat3 getLTCLightInvMat(vec2 uv)
{
	vec4 t1 = texture2DLod(areaLightsLutTex1, uv, 0.0);
	return mat3(
		vec3( t1.x, 0, t1.y ),
		vec3(	0, 1,	0 ),
		vec3( t1.z, 0, t1.w )
	);
}
float calcRectLightSpecular(vec3 worldNormal, vec3 viewDir, vec2 uv) {
	mat3 mInv = getLTCLightInvMat(uv);
	return LTC_EvaluateRect( worldNormal, viewDir, vPositionW, mInv, dLTCCoords );
}
float getRectLightSpecular(vec3 worldNormal, vec3 viewDir) {
	return calcRectLightSpecular(worldNormal, viewDir, dLTCUV);
}
float calcDiskLightSpecular(vec3 worldNormal, vec3 viewDir, vec2 uv) {
	mat3 mInv = getLTCLightInvMat(uv);
	return LTC_EvaluateDisk( worldNormal, viewDir, vPositionW, mInv, dLTCCoords );
}
float getDiskLightSpecular(vec3 worldNormal, vec3 viewDir) {
	return calcDiskLightSpecular(worldNormal, viewDir, dLTCUV);
}
float getSphereLightSpecular(vec3 worldNormal, vec3 viewDir) {
	return calcDiskLightSpecular(worldNormal, viewDir, dLTCUV);
}
`

var metalnessPS$1 = `
#ifdef STD_METALNESS_CONSTANT
uniform float material_metalness;
#endif
void getMetalness() {
	float metalness = 1.0;
	#ifdef STD_METALNESS_CONSTANT
	metalness *= material_metalness;
	#endif
	#ifdef STD_METALNESS_TEXTURE
	metalness *= texture2DBias({STD_METALNESS_TEXTURE_NAME}, {STD_METALNESS_TEXTURE_UV}, textureBias).{STD_METALNESS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_METALNESS_VERTEX
	metalness *= saturate(vVertexColor.{STD_METALNESS_VERTEX_CHANNEL});
	#endif
	dMetalness = metalness;
}
`

var msdfPS$1 = `
uniform sampler2D texture_msdfMap;
float median(float r, float g, float b) {
	return max(min(r, g), min(max(r, g), b));
}
float map (float min, float max, float v) {
	return (v - min) / (max - min);
}
uniform float font_sdfIntensity;
uniform float font_pxrange;
uniform float font_textureWidth;
#ifndef LIT_MSDF_TEXT_ATTRIBUTE
	uniform vec4 outline_color;
	uniform float outline_thickness;
	uniform vec4 shadow_color;
	uniform vec2 shadow_offset;
#else
	varying vec4 outline_color;
	varying float outline_thickness;
	varying vec4 shadow_color;
	varying vec2 shadow_offset;
#endif
vec4 applyMsdf(vec4 color) {
	color.rgb = gammaCorrectInput(color.rgb);
	vec3 tsample = texture2D(texture_msdfMap, vUv0).rgb;
	vec2 uvShdw = vUv0 - shadow_offset;
	vec3 ssample = texture2D(texture_msdfMap, uvShdw).rgb;
	float sigDist = median(tsample.r, tsample.g, tsample.b);
	float sigDistShdw = median(ssample.r, ssample.g, ssample.b);
	float smoothingMax = 0.2;
	vec2 w = fwidth(vUv0);
	float smoothing = clamp(w.x * font_textureWidth / font_pxrange, 0.0, smoothingMax);
	float mapMin = 0.05;
	float mapMax = clamp(1.0 - font_sdfIntensity, mapMin, 1.0);
	float sigDistInner = map(mapMin, mapMax, sigDist);
	float sigDistOutline = map(mapMin, mapMax, sigDist + outline_thickness);
	sigDistShdw = map(mapMin, mapMax, sigDistShdw + outline_thickness);
	float center = 0.5;
	float inside = smoothstep(center-smoothing, center+smoothing, sigDistInner);
	float outline = smoothstep(center-smoothing, center+smoothing, sigDistOutline);
	float shadow = smoothstep(center-smoothing, center+smoothing, sigDistShdw);
	vec4 tcolor = (outline > inside) ? outline * vec4(outline_color.a * outline_color.rgb, outline_color.a) : vec4(0.0);
	tcolor = mix(tcolor, color, inside);
	vec4 scolor = (shadow > outline) ? shadow * vec4(shadow_color.a * shadow_color.rgb, shadow_color.a) : tcolor;
	tcolor = mix(scolor, tcolor, outline);
	tcolor.rgb = gammaCorrectOutput(tcolor.rgb);
	
	return tcolor;
}
`

var metalnessModulatePS$1 = `
vec3 getSpecularModulate(in vec3 specularity, in vec3 albedo, in float metalness, in float f0, in float specularityFactor) {
	vec3 dielectricF0 = f0 * specularity * specularityFactor;
	return mix(dielectricF0, albedo, metalness);
}
vec3 getAlbedoModulate(in vec3 albedo, in float metalness) {
	return albedo * (1.0 - metalness);
}
`

var morphPS$1 = `
	varying vec2 uv0;
	uniform sampler2DArray morphTexture;
	uniform highp float morphFactor[{MORPH_TEXTURE_MAX_COUNT}];
	uniform highp uint morphIndex[{MORPH_TEXTURE_MAX_COUNT}];
	uniform int count;
	#ifdef MORPH_INT
		uniform vec3 aabbSize;
		uniform vec3 aabbMin;
	#endif
	void main (void) {
		highp vec3 color = vec3(0, 0, 0);
		ivec2 pixelCoords = ivec2(uv0 * vec2(textureSize(morphTexture, 0).xy));
		
		for (int i = 0; i < count; i++) {
			uint textureIndex = morphIndex[i];
			vec3 delta = texelFetch(morphTexture, ivec3(pixelCoords, int(textureIndex)), 0).xyz;
			color += morphFactor[i] * delta;
		}
		#ifdef MORPH_INT
			color = (color - aabbMin) / aabbSize * 65535.0;
			gl_FragColor = uvec4(color, 1u);
		#else
			gl_FragColor = vec4(color, 1.0);
		#endif
	}
`

var morphVS$1 = `
	attribute vec2 vertex_position;
	varying vec2 uv0;
	void main(void) {
		gl_Position = vec4(vertex_position, 0.5, 1.0);
		uv0 = vertex_position.xy * 0.5 + 0.5;
	}
`

var msdfVS$1 = `
attribute vec3 vertex_outlineParameters;
attribute vec3 vertex_shadowParameters;
varying vec4 outline_color;
varying float outline_thickness;
varying vec4 shadow_color;
varying vec2 shadow_offset;
void unpackMsdfParams() {
	vec3 little = mod(vertex_outlineParameters, 256.);
	vec3 big = (vertex_outlineParameters - little) / 256.;
	outline_color.rb = little.xy / 255.;
	outline_color.ga = big.xy / 255.;
	outline_thickness = little.z / 255. * 0.2;
	little = mod(vertex_shadowParameters, 256.);
	big = (vertex_shadowParameters - little) / 256.;
	shadow_color.rb = little.xy / 255.;
	shadow_color.ga = big.xy / 255.;
	shadow_offset = (vec2(little.z, big.z) / 127. - 1.) * 0.005;
}
`

var normalVS$1 = `
mat3 dNormalMatrix;
vec3 getNormal() {
	dNormalMatrix = getNormalMatrix(dModelMatrix);
	vec3 localNormal = getLocalNormal(vertex_normal);
	return normalize(dNormalMatrix * localNormal);
}
`

var normalCoreVS$1 = `
attribute vec3 vertex_normal;
uniform mat3 matrix_normal;
#ifdef MORPHING_NORMAL
	#ifdef MORPHING_INT
		uniform highp usampler2D morphNormalTex;
	#else
		uniform highp sampler2D morphNormalTex;
	#endif
#endif
vec3 getLocalNormal(vec3 vertexNormal) {
	vec3 localNormal = vertex_normal;
	#ifdef MORPHING_NORMAL
		ivec2 morphUV = getTextureMorphCoords();
		#ifdef MORPHING_INT
			vec3 morphNormal = vec3(texelFetch(morphNormalTex, ivec2(morphUV), 0).xyz) / 65535.0 * 2.0 - 1.0;
		#else
			vec3 morphNormal = texelFetch(morphNormalTex, ivec2(morphUV), 0).xyz;
		#endif
		localNormal += morphNormal;
	#endif
	return localNormal;
}
#if defined(SKIN) || defined(BATCH)
	mat3 getNormalMatrix(mat4 modelMatrix) {
		return mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz);
	}
#elif defined(INSTANCING)
	mat3 getNormalMatrix(mat4 modelMatrix) {
		return mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz);
	}
#else
	mat3 getNormalMatrix(mat4 modelMatrix) {
		return matrix_normal;
	}
#endif
`

var normalMapPS$1 = `
#ifdef STD_NORMAL_TEXTURE
	uniform float material_bumpiness;
#endif
#ifdef STD_NORMALDETAIL_TEXTURE
	uniform float material_normalDetailMapBumpiness;
	vec3 blendNormals(vec3 n1, vec3 n2) {
		n1 += vec3(0, 0, 1);
		n2 *= vec3(-1, -1, 1);
		return n1 * dot(n1, n2) / n1.z - n2;
	}
#endif
void getNormal() {
#ifdef STD_NORMAL_TEXTURE
	vec3 normalMap = {STD_NORMAL_TEXTURE_DECODE}(texture2DBias({STD_NORMAL_TEXTURE_NAME}, {STD_NORMAL_TEXTURE_UV}, textureBias));
	normalMap = mix(vec3(0.0, 0.0, 1.0), normalMap, material_bumpiness);
	#ifdef STD_NORMALDETAIL_TEXTURE
		vec3 normalDetailMap = {STD_NORMALDETAIL_TEXTURE_DECODE}(texture2DBias({STD_NORMALDETAIL_TEXTURE_NAME}, {STD_NORMALDETAIL_TEXTURE_UV}, textureBias));
		normalDetailMap = mix(vec3(0.0, 0.0, 1.0), normalDetailMap, material_normalDetailMapBumpiness);
		normalMap = blendNormals(normalMap, normalDetailMap);
	#endif
	dNormalW = normalize(dTBN * normalMap);
#else
	dNormalW = dVertexNormalW;
#endif
}
`

var opacityPS$1 = `
uniform float material_opacity;
void getOpacity() {
	dAlpha = material_opacity;
	#ifdef STD_OPACITY_TEXTURE
	dAlpha *= texture2DBias({STD_OPACITY_TEXTURE_NAME}, {STD_OPACITY_TEXTURE_UV}, textureBias).{STD_OPACITY_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_OPACITY_VERTEX
	dAlpha *= clamp(vVertexColor.{STD_OPACITY_VERTEX_CHANNEL}, 0.0, 1.0);
	#endif
}
`

var opacityDitherPS$1 = `
#if STD_OPACITY_DITHER == BAYER8
	#include "bayerPS"
#endif
uniform vec4 blueNoiseJitter;
#if STD_OPACITY_DITHER == BLUENOISE
	uniform sampler2D blueNoiseTex32;
#endif
void opacityDither(float alpha, float id) {
	#if STD_OPACITY_DITHER == BAYER8
		float noise = bayer8(floor(mod(gl_FragCoord.xy + blueNoiseJitter.xy + id, 8.0))) / 64.0;
	#else
		#if STD_OPACITY_DITHER == BLUENOISE
			vec2 uv = fract(gl_FragCoord.xy / 32.0 + blueNoiseJitter.xy + id);
			float noise = texture2DLod(blueNoiseTex32, uv, 0.0).y;
		#endif
		#if STD_OPACITY_DITHER == IGNNOISE
			vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
			float noise = fract(magic.z * fract(dot(gl_FragCoord.xy + blueNoiseJitter.xy + id, magic.xy)));
		#endif
	#endif
	noise = pow(noise, 2.2);
	if (alpha < noise)
		discard;
}
`

var outputPS$1 = `
`

var outputAlphaPS$1 = `
#if LIT_BLEND_TYPE == NORMAL || LIT_BLEND_TYPE == ADDITIVEALPHA || defined(LIT_ALPHA_TO_COVERAGE)
	gl_FragColor.a = litArgs_opacity;
#elif LIT_BLEND_TYPE == PREMULTIPLIED
	gl_FragColor.rgb *= litArgs_opacity;
	gl_FragColor.a = litArgs_opacity;
#else
	gl_FragColor.a = 1.0;
#endif
`

var outputTex2DPS$1 = `
varying vec2 vUv0;
uniform sampler2D source;
void main(void) {
	gl_FragColor = texture2D(source, vUv0);
}
`

var sheenPS$1 = `
uniform vec3 material_sheen;
void getSheen() {
	vec3 sheenColor = material_sheen;
	#ifdef STD_SHEEN_TEXTURE
	sheenColor *= {STD_SHEEN_TEXTURE_DECODE}(texture2DBias({STD_SHEEN_TEXTURE_NAME}, {STD_SHEEN_TEXTURE_UV}, textureBias)).{STD_SHEEN_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_SHEEN_VERTEX
	sheenColor *= saturate(vVertexColor.{STD_SHEEN_VERTEX_CHANNEL});
	#endif
	sSpecularity = sheenColor;
}
`

var sheenGlossPS$1 = `
uniform float material_sheenGloss;
void getSheenGlossiness() {
	float sheenGlossiness = material_sheenGloss;
	#ifdef STD_SHEENGLOSS_TEXTURE
	sheenGlossiness *= texture2DBias({STD_SHEENGLOSS_TEXTURE_NAME}, {STD_SHEENGLOSS_TEXTURE_UV}, textureBias).{STD_SHEENGLOSS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_SHEENGLOSS_VERTEX
	sheenGlossiness *= saturate(vVertexColor.{STD_SHEENGLOSS_VERTEX_CHANNEL});
	#endif
	#ifdef STD_SHEENGLOSS_INVERT
	sheenGlossiness = 1.0 - sheenGlossiness;
	#endif
	sGlossiness = sheenGlossiness + 0.0000001;
}
`

var parallaxPS$1 = `
uniform float material_heightMapFactor;
void getParallax() {
	float parallaxScale = material_heightMapFactor;
	float height = texture2DBias({STD_HEIGHT_TEXTURE_NAME}, {STD_HEIGHT_TEXTURE_UV}, textureBias).{STD_HEIGHT_TEXTURE_CHANNEL};
	height = height * parallaxScale - parallaxScale * 0.5;
	vec3 viewDirT = dViewDirW * dTBN;
	viewDirT.z += 0.42;
	dUvOffset = height * (viewDirT.xy / viewDirT.z);
}
`

var pickPS$1 = `
vec4 encodePickOutput(uint id) {
	const vec4 inv = vec4(1.0 / 255.0);
	const uvec4 shifts = uvec4(16, 8, 0, 24);
	uvec4 col = (uvec4(id) >> shifts) & uvec4(0xff);
	return vec4(col) * inv;
}
#ifndef PICK_CUSTOM_ID
	uniform uint meshInstanceId;
	vec4 getPickOutput() {
		return encodePickOutput(meshInstanceId);
	}
#endif
#ifdef DEPTH_PICK_PASS
	#include "floatAsUintPS"
	vec4 getPickDepth() {
		return float2uint(gl_FragCoord.z);
	}
#endif
`

var reflDirPS$1 = `
void getReflDir(vec3 worldNormal, vec3 viewDir, float gloss, mat3 tbn) {
	dReflDirW = normalize(-reflect(viewDir, worldNormal));
}
`

var reflDirAnisoPS$1 = `
void getReflDir(vec3 worldNormal, vec3 viewDir, float gloss, mat3 tbn) {
	float roughness = sqrt(1.0 - min(gloss, 1.0));
	vec2 direction = dAnisotropyRotation;
	vec3 anisotropicT = normalize(tbn * vec3(direction, 0.0));
	vec3 anisotropicB = normalize(cross(tbn[2], anisotropicT));
	float anisotropy = dAnisotropy;
	vec3 anisotropicDirection = anisotropicB;
	vec3 anisotropicTangent = cross(anisotropicDirection, viewDir);
	vec3 anisotropicNormal = cross(anisotropicTangent, anisotropicDirection);
	float bendFactor = 1.0 - anisotropy * (1.0 - roughness);
	float bendFactor4 = bendFactor * bendFactor * bendFactor * bendFactor;
	vec3 bentNormal = normalize(mix(normalize(anisotropicNormal), normalize(worldNormal), bendFactor4));
	dReflDirW = reflect(-viewDir, bentNormal);
}
`

var reflectionCCPS$1 = `
#ifdef LIT_CLEARCOAT
void addReflectionCC(vec3 reflDir, float gloss) {
	ccReflection += calcReflection(reflDir, gloss);
}
#endif
`

var reflectionCubePS$1 = `
uniform samplerCube texture_cubeMap;
uniform float material_reflectivity;
vec3 calcReflection(vec3 reflDir, float gloss) {
	vec3 lookupVec = cubeMapProject(reflDir);
	lookupVec.x *= -1.0;
	return {reflectionDecode}(textureCube(texture_cubeMap, lookupVec));
}
void addReflection(vec3 reflDir, float gloss) {   
	dReflection += vec4(calcReflection(reflDir, gloss), material_reflectivity);
}
`

var reflectionEnvHQPS$1 = `
#ifndef ENV_ATLAS
	#define ENV_ATLAS
	uniform sampler2D texture_envAtlas;
#endif
uniform samplerCube texture_cubeMap;
uniform float material_reflectivity;
vec3 calcReflection(vec3 reflDir, float gloss) {
	vec3 dir = cubeMapProject(reflDir) * vec3(-1.0, 1.0, 1.0);
	vec2 uv = toSphericalUv(dir);
	float level = saturate(1.0 - gloss) * 5.0;
	float ilevel = floor(level);
	float flevel = level - ilevel;
	vec3 sharp = {reflectionCubemapDecode}(textureCube(texture_cubeMap, dir));
	vec3 roughA = {reflectionDecode}(texture2D(texture_envAtlas, mapRoughnessUv(uv, ilevel)));
	vec3 roughB = {reflectionDecode}(texture2D(texture_envAtlas, mapRoughnessUv(uv, ilevel + 1.0)));
	return processEnvironment(mix(sharp, mix(roughA, roughB, flevel), min(level, 1.0)));
}
void addReflection(vec3 reflDir, float gloss) {   
	dReflection += vec4(calcReflection(reflDir, gloss), material_reflectivity);
}
`

var reflectionEnvPS$1 = `
#ifndef ENV_ATLAS
#define ENV_ATLAS
	uniform sampler2D texture_envAtlas;
#endif
uniform float material_reflectivity;
float shinyMipLevel(vec2 uv) {
	vec2 dx = dFdx(uv);
	vec2 dy = dFdy(uv);
	vec2 uv2 = vec2(fract(uv.x + 0.5), uv.y);
	vec2 dx2 = dFdx(uv2);
	vec2 dy2 = dFdy(uv2);
	float maxd = min(max(dot(dx, dx), dot(dy, dy)), max(dot(dx2, dx2), dot(dy2, dy2)));
	return clamp(0.5 * log2(maxd) - 1.0 + textureBias, 0.0, 5.0);
}
vec3 calcReflection(vec3 reflDir, float gloss) {
	vec3 dir = cubeMapProject(reflDir) * vec3(-1.0, 1.0, 1.0);
	vec2 uv = toSphericalUv(dir);
	float level = saturate(1.0 - gloss) * 5.0;
	float ilevel = floor(level);
	float level2 = shinyMipLevel(uv * atlasSize);
	float ilevel2 = floor(level2);
	vec2 uv0, uv1;
	float weight;
	if (ilevel == 0.0) {
		uv0 = mapShinyUv(uv, ilevel2);
		uv1 = mapShinyUv(uv, ilevel2 + 1.0);
		weight = level2 - ilevel2;
	} else {
		uv0 = uv1 = mapRoughnessUv(uv, ilevel);
		weight = 0.0;
	}
	vec3 linearA = {reflectionDecode}(texture2D(texture_envAtlas, uv0));
	vec3 linearB = {reflectionDecode}(texture2D(texture_envAtlas, uv1));
	vec3 linear0 = mix(linearA, linearB, weight);
	vec3 linear1 = {reflectionDecode}(texture2D(texture_envAtlas, mapRoughnessUv(uv, ilevel + 1.0)));
	return processEnvironment(mix(linear0, linear1, level - ilevel));
}
void addReflection(vec3 reflDir, float gloss) {   
	dReflection += vec4(calcReflection(reflDir, gloss), material_reflectivity);
}
`

var reflectionSpherePS$1 = `
#ifndef VIEWMATRIX
	#define VIEWMATRIX
	uniform mat4 matrix_view;
#endif
uniform sampler2D texture_sphereMap;
uniform float material_reflectivity;
vec3 calcReflection(vec3 reflDir, float gloss) {
	vec3 reflDirV = (mat3(matrix_view) * reflDir);
	float m = 2.0 * sqrt(dot(reflDirV.xy, reflDirV.xy) + (reflDirV.z + 1.0) * (reflDirV.z + 1.0));
	vec2 sphereMapUv = reflDirV.xy / m + 0.5;
	return {reflectionDecode}(texture2D(texture_sphereMap, sphereMapUv));
}
void addReflection(vec3 reflDir, float gloss) {   
	dReflection += vec4(calcReflection(reflDir, gloss), material_reflectivity);
}
`

var reflectionSheenPS$1 = `
void addReflectionSheen(vec3 worldNormal, vec3 viewDir, float gloss) {
	float NoV = dot(worldNormal, viewDir);
	float alphaG = gloss * gloss;
	float a = gloss < 0.25 ? -339.2 * alphaG + 161.4 * gloss - 25.9 : -8.48 * alphaG + 14.3 * gloss - 9.95;
	float b = gloss < 0.25 ? 44.0 * alphaG - 23.7 * gloss + 3.26 : 1.97 * alphaG - 3.27 * gloss + 0.72;
	float DG = exp( a * NoV + b ) + ( gloss < 0.25 ? 0.0 : 0.1 * ( gloss - 0.25 ) );
	sReflection += calcReflection(worldNormal, 0.0) * saturate(DG);
}
`

var refractionCubePS$1 = `
vec3 refract2(vec3 viewVec, vec3 normal, float IOR) {
	float vn = dot(viewVec, normal);
	float k = 1.0 - IOR * IOR * (1.0 - vn * vn);
	vec3 refrVec = IOR * viewVec - (IOR * vn + sqrt(k)) * normal;
	return refrVec;
}
void addRefraction(
	vec3 worldNormal, 
	vec3 viewDir, 
	float thickness, 
	float gloss, 
	vec3 specularity, 
	vec3 albedo, 
	float transmission,
	float refractionIndex,
	float dispersion
#if defined(LIT_IRIDESCENCE)
	, vec3 iridescenceFresnel,
	float iridescenceIntensity
#endif 
) {
	vec4 tmpRefl = dReflection;
	vec3 reflectionDir = refract2(-viewDir, worldNormal, refractionIndex);
	dReflection = vec4(0);
	addReflection(reflectionDir, gloss);
	dDiffuseLight = mix(dDiffuseLight, dReflection.rgb * albedo, transmission);
	dReflection = tmpRefl;
}
`

var refractionDynamicPS$1 = `
uniform float material_invAttenuationDistance;
uniform vec3 material_attenuation;
vec3 evalRefractionColor(vec3 refractionVector, float gloss, float refractionIndex) {
	vec4 pointOfRefraction = vec4(vPositionW + refractionVector, 1.0);
	vec4 projectionPoint = matrix_viewProjection * pointOfRefraction;
	vec2 uv = getGrabScreenPos(projectionPoint);
	float iorToRoughness = (1.0 - gloss) * clamp((1.0 / refractionIndex) * 2.0 - 2.0, 0.0, 1.0);
	float refractionLod = log2(uScreenSize.x) * iorToRoughness;
	vec3 refraction = texture2DLod(uSceneColorMap, uv, refractionLod).rgb;
	#ifdef SCENE_COLORMAP_GAMMA
		refraction = decodeGamma(refraction);
	#endif
	return refraction;
}
void addRefraction(
	vec3 worldNormal, 
	vec3 viewDir, 
	float thickness, 
	float gloss, 
	vec3 specularity, 
	vec3 albedo, 
	float transmission,
	float refractionIndex,
	float dispersion
#if defined(LIT_IRIDESCENCE)
	, vec3 iridescenceFresnel,
	float iridescenceIntensity
#endif
) {
	vec3 modelScale;
	modelScale.x = length(vec3(matrix_model[0].xyz));
	modelScale.y = length(vec3(matrix_model[1].xyz));
	modelScale.z = length(vec3(matrix_model[2].xyz));
	vec3 scale = thickness * modelScale;
	vec3 refractionVector = normalize(refract(-viewDir, worldNormal, refractionIndex)) * scale;
	vec3 refraction = evalRefractionColor(refractionVector, gloss, refractionIndex);
	#ifdef LIT_DISPERSION
		float halfSpread = (1.0 / refractionIndex - 1.0) * 0.025 * dispersion;
		float refractionIndexR = refractionIndex - halfSpread;
		refractionVector = normalize(refract(-viewDir, worldNormal, refractionIndexR)) * scale;
		refraction.r = evalRefractionColor(refractionVector, gloss, refractionIndexR).r;
		float refractionIndexB = refractionIndex + halfSpread;
		refractionVector = normalize(refract(-viewDir, worldNormal, refractionIndexB)) * scale;
		refraction.b = evalRefractionColor(refractionVector, gloss, refractionIndexB).b;
	#endif
	vec3 transmittance;
	if (material_invAttenuationDistance != 0.0)
	{
		vec3 attenuation = -log(material_attenuation) * material_invAttenuationDistance;
		transmittance = exp(-attenuation * length(refractionVector));
	}
	else
	{
		transmittance = vec3(1.0);
	}
	vec3 fresnel = vec3(1.0) - 
		getFresnel(
			dot(viewDir, worldNormal), 
			gloss, 
			specularity
		#if defined(LIT_IRIDESCENCE)
			, iridescenceFresnel,
			iridescenceIntensity
		#endif
		);
	dDiffuseLight = mix(dDiffuseLight, refraction * transmittance * fresnel, transmission);
}
`

var reprojectPS$1 = `
varying vec2 vUv0;
#ifdef CUBEMAP_SOURCE
	uniform samplerCube sourceCube;
#else
	uniform sampler2D sourceTex;
#endif
#ifdef USE_SAMPLES_TEX
	uniform sampler2D samplesTex;
	uniform vec2 samplesTexInverseSize;
#endif
uniform vec3 params;
float targetFace() { return params.x; }
float targetTotalPixels() { return params.y; }
float sourceTotalPixels() { return params.z; }
float PI = 3.141592653589793;
float saturate(float x) {
	return clamp(x, 0.0, 1.0);
}
#include "decodePS"
#include "encodePS"
vec3 modifySeams(vec3 dir, float scale) {
	vec3 adir = abs(dir);
	float M = max(max(adir.x, adir.y), adir.z);
	return dir / M * vec3(
		adir.x == M ? 1.0 : scale,
		adir.y == M ? 1.0 : scale,
		adir.z == M ? 1.0 : scale
	);
}
vec2 toSpherical(vec3 dir) {
	return vec2(dir.xz == vec2(0.0) ? 0.0 : atan(dir.x, dir.z), asin(dir.y));
}
vec3 fromSpherical(vec2 uv) {
	return vec3(cos(uv.y) * sin(uv.x),
				sin(uv.y),
				cos(uv.y) * cos(uv.x));
}
vec3 getDirectionEquirect() {
	return fromSpherical((vec2(vUv0.x, 1.0 - vUv0.y) * 2.0 - 1.0) * vec2(PI, PI * 0.5));
}
float signNotZero(float k){
	return(k >= 0.0) ? 1.0 : -1.0;
}
vec2 signNotZero(vec2 v) {
	return vec2(signNotZero(v.x), signNotZero(v.y));
}
vec3 octDecode(vec2 o) {
	vec3 v = vec3(o.x, 1.0 - abs(o.x) - abs(o.y), o.y);
	if (v.y < 0.0) {
		v.xz = (1.0 - abs(v.zx)) * signNotZero(v.xz);
	}
	return normalize(v);
}
vec3 getDirectionOctahedral() {
	return octDecode(vec2(vUv0.x, 1.0 - vUv0.y) * 2.0 - 1.0);
}
vec2 octEncode(in vec3 v) {
	float l1norm = abs(v.x) + abs(v.y) + abs(v.z);
	vec2 result = v.xz * (1.0 / l1norm);
	if (v.y < 0.0) {
		result = (1.0 - abs(result.yx)) * signNotZero(result.xy);
	}
	return result;
}
#ifdef CUBEMAP_SOURCE
	vec4 sampleCubemap(vec3 dir) {
		return textureCube(sourceCube, modifySeams(dir, 1.0));
	}
	vec4 sampleCubemap(vec2 sph) {
		return sampleCubemap(fromSpherical(sph));
	}
	vec4 sampleCubemap(vec3 dir, float mipLevel) {
		return textureCubeLod(sourceCube, modifySeams(dir, 1.0), mipLevel);
	}
	vec4 sampleCubemap(vec2 sph, float mipLevel) {
		return sampleCubemap(fromSpherical(sph), mipLevel);
	}
#else
	vec4 sampleEquirect(vec2 sph) {
		vec2 uv = sph / vec2(PI * 2.0, PI) + 0.5;
		return texture2D(sourceTex, vec2(uv.x, 1.0 - uv.y));
	}
	vec4 sampleEquirect(vec3 dir) {
		return sampleEquirect(toSpherical(dir));
	}
	vec4 sampleEquirect(vec2 sph, float mipLevel) {
		vec2 uv = sph / vec2(PI * 2.0, PI) + 0.5;
		return texture2DLod(sourceTex, vec2(uv.x, 1.0 - uv.y), mipLevel);
	}
	vec4 sampleEquirect(vec3 dir, float mipLevel) {
		return sampleEquirect(toSpherical(dir), mipLevel);
	}
	vec4 sampleOctahedral(vec3 dir) {
		vec2 uv = octEncode(dir) * 0.5 + 0.5;
		return texture2D(sourceTex, vec2(uv.x, 1.0 - uv.y));
	}
	vec4 sampleOctahedral(vec2 sph) {
		return sampleOctahedral(fromSpherical(sph));
	}
	vec4 sampleOctahedral(vec3 dir, float mipLevel) {
		vec2 uv = octEncode(dir) * 0.5 + 0.5;
		return texture2DLod(sourceTex, vec2(uv.x, 1.0 - uv.y), mipLevel);
	}
	vec4 sampleOctahedral(vec2 sph, float mipLevel) {
		return sampleOctahedral(fromSpherical(sph), mipLevel);
	}
#endif
vec3 getDirectionCubemap() {
	vec2 st = vUv0 * 2.0 - 1.0;
	float face = targetFace();
	vec3 vec;
	if (face == 0.0) {
		vec = vec3(1, -st.y, -st.x);
	} else if (face == 1.0) {
		vec = vec3(-1, -st.y, st.x);
	} else if (face == 2.0) {
		vec = vec3(st.x, 1, st.y);
	} else if (face == 3.0) {
		vec = vec3(st.x, -1, -st.y);
	} else if (face == 4.0) {
		vec = vec3(st.x, -st.y, 1);
	} else {
		vec = vec3(-st.x, -st.y, -1);
	}
	return normalize(modifySeams(vec, 1.0));
}
mat3 matrixFromVector(vec3 n) {
	float a = 1.0 / (1.0 + n.z);
	float b = -n.x * n.y * a;
	vec3 b1 = vec3(1.0 - n.x * n.x * a, b, -n.x);
	vec3 b2 = vec3(b, 1.0 - n.y * n.y * a, -n.y);
	return mat3(b1, b2, n);
}
mat3 matrixFromVectorSlow(vec3 n) {
	vec3 up = (1.0 - abs(n.y) <= 0.0000001) ? vec3(0.0, 0.0, n.y > 0.0 ? 1.0 : -1.0) : vec3(0.0, 1.0, 0.0);
	vec3 x = normalize(cross(up, n));
	vec3 y = cross(n, x);
	return mat3(x, y, n);
}
vec4 reproject() {
	if ({NUM_SAMPLES} <= 1) {
		return {ENCODE_FUNC}({DECODE_FUNC}({SOURCE_FUNC}({TARGET_FUNC}())));
	} else {
		vec3 t = {TARGET_FUNC}();
		vec3 tu = dFdx(t);
		vec3 tv = dFdy(t);
		vec3 result = vec3(0.0);
		for (float u = 0.0; u < {NUM_SAMPLES_SQRT}; ++u) {
			for (float v = 0.0; v < {NUM_SAMPLES_SQRT}; ++v) {
				result += {DECODE_FUNC}({SOURCE_FUNC}(normalize(t +
															tu * (u / {NUM_SAMPLES_SQRT} - 0.5) +
															tv * (v / {NUM_SAMPLES_SQRT} - 0.5))));
			}
		}
		return {ENCODE_FUNC}(result / ({NUM_SAMPLES_SQRT} * {NUM_SAMPLES_SQRT}));
	}
}
vec4 unpackFloat = vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0);
#ifdef USE_SAMPLES_TEX
	void unpackSample(int i, out vec3 L, out float mipLevel) {
		float u = (float(i * 4) + 0.5) * samplesTexInverseSize.x;
		float v = (floor(u) + 0.5) * samplesTexInverseSize.y;
		vec4 raw;
		raw.x = dot(texture2D(samplesTex, vec2(u, v)), unpackFloat); u += samplesTexInverseSize.x;
		raw.y = dot(texture2D(samplesTex, vec2(u, v)), unpackFloat); u += samplesTexInverseSize.x;
		raw.z = dot(texture2D(samplesTex, vec2(u, v)), unpackFloat); u += samplesTexInverseSize.x;
		raw.w = dot(texture2D(samplesTex, vec2(u, v)), unpackFloat);
		L.xyz = raw.xyz * 2.0 - 1.0;
		mipLevel = raw.w * 8.0;
	}
	vec4 prefilterSamples() {
		mat3 vecSpace = matrixFromVectorSlow({TARGET_FUNC}());
		vec3 L;
		float mipLevel;
		vec3 result = vec3(0.0);
		float totalWeight = 0.0;
		for (int i = 0; i < {NUM_SAMPLES}; ++i) {
			unpackSample(i, L, mipLevel);
			result += {DECODE_FUNC}({SOURCE_FUNC}(vecSpace * L, mipLevel)) * L.z;
			totalWeight += L.z;
		}
		return {ENCODE_FUNC}(result / totalWeight);
	}
	vec4 prefilterSamplesUnweighted() {
		mat3 vecSpace = matrixFromVectorSlow({TARGET_FUNC}());
		vec3 L;
		float mipLevel;
		vec3 result = vec3(0.0);
		float totalWeight = 0.0;
		for (int i = 0; i < {NUM_SAMPLES}; ++i) {
			unpackSample(i, L, mipLevel);
			result += {DECODE_FUNC}({SOURCE_FUNC}(vecSpace * L, mipLevel));
		}
		return {ENCODE_FUNC}(result / float({NUM_SAMPLES}));
	}
#endif
void main(void) {
	gl_FragColor = {PROCESS_FUNC}();
}
`

var reprojectVS$1 = `
attribute vec2 vertex_position;
uniform vec4 uvMod;
varying vec2 vUv0;
void main(void) {
	gl_Position = vec4(vertex_position, 0.5, 1.0);
	vUv0 = getImageEffectUV((vertex_position.xy * 0.5 + 0.5) * uvMod.xy + uvMod.zw);
}
`

var screenDepthPS$1 = `
uniform highp sampler2D uSceneDepthMap;
#ifndef SCREENSIZE
	#define SCREENSIZE
	uniform vec4 uScreenSize;
#endif
#ifndef VIEWMATRIX
	#define VIEWMATRIX
	uniform mat4 matrix_view;
#endif
#ifndef LINEARIZE_DEPTH
	#define LINEARIZE_DEPTH
	
	#ifndef CAMERAPLANES
		#define CAMERAPLANES
		uniform vec4 camera_params;
	#endif
	float linearizeDepth(float z) {
		if (camera_params.w == 0.0)
			return (camera_params.z * camera_params.y) / (camera_params.y + z * (camera_params.z - camera_params.y));
		else
			return camera_params.z + z * (camera_params.y - camera_params.z);
	}
#endif
float delinearizeDepth(float linearDepth) {
	if (camera_params.w == 0.0) {
		return (camera_params.y * (camera_params.z - linearDepth)) / (linearDepth * (camera_params.z - camera_params.y));
	} else {
		return (linearDepth - camera_params.z) / (camera_params.y - camera_params.z);
	}
}
float getLinearScreenDepth(vec2 uv) {
	#ifdef SCENE_DEPTHMAP_LINEAR
		#ifdef SCENE_DEPTHMAP_FLOAT
			return texture2D(uSceneDepthMap, uv).r;
		#else
			ivec2 textureSize = textureSize(uSceneDepthMap, 0);
			ivec2 texel = ivec2(uv * vec2(textureSize));
			vec4 data = texelFetch(uSceneDepthMap, texel, 0);
			uint intBits = 
				(uint(data.r * 255.0) << 24u) |
				(uint(data.g * 255.0) << 16u) |
				(uint(data.b * 255.0) << 8u) |
				uint(data.a * 255.0);
			return uintBitsToFloat(intBits);
		#endif
	#else
		return linearizeDepth(texture2D(uSceneDepthMap, uv).r);
	#endif
}
#ifndef VERTEXSHADER
	float getLinearScreenDepth() {
		vec2 uv = gl_FragCoord.xy * uScreenSize.zw;
		return getLinearScreenDepth(uv);
	}
#endif
float getLinearDepth(vec3 pos) {
	return -(matrix_view * vec4(pos, 1.0)).z;
}
`

var shadowCascadesPS$1 = `
int getShadowCascadeIndex(vec4 shadowCascadeDistances, int shadowCascadeCount) {
	float depth = 1.0 / gl_FragCoord.w;
	vec4 comparisons = step(shadowCascadeDistances, vec4(depth));
	int cascadeIndex = int(dot(comparisons, vec4(1.0)));
	return min(cascadeIndex, shadowCascadeCount - 1);
}
int ditherShadowCascadeIndex(int cascadeIndex, vec4 shadowCascadeDistances, int shadowCascadeCount, float blendFactor) {
 
	if (cascadeIndex < shadowCascadeCount - 1) {
		float currentRangeEnd = shadowCascadeDistances[cascadeIndex];
		float transitionStart = blendFactor * currentRangeEnd;
		float depth = 1.0 / gl_FragCoord.w;
		if (depth > transitionStart) {
			float transitionFactor = smoothstep(transitionStart, currentRangeEnd, depth);
			float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
			if (dither < transitionFactor) {
				cascadeIndex += 1;
			}
		}
	}
	return cascadeIndex;
}
vec3 fadeShadow(vec3 shadowCoord, vec4 shadowCascadeDistances) {				  
	float depth = 1.0 / gl_FragCoord.w;
	if (depth > shadowCascadeDistances.w) {
		shadowCoord.z = -9999999.0;
	}
	return shadowCoord;
}
`

var shadowEVSMPS$1 = `
float linstep(float a, float b, float v) {
	return saturate((v - a) / (b - a));
}
float reduceLightBleeding(float pMax, float amount) {
	 return linstep(amount, 1.0, pMax);
}
float chebyshevUpperBound(vec2 moments, float mean, float minVariance, float lightBleedingReduction) {
	float variance = moments.y - (moments.x * moments.x);
	variance = max(variance, minVariance);
	float d = mean - moments.x;
	float pMax = variance / (variance + (d * d));
	pMax = reduceLightBleeding(pMax, lightBleedingReduction);
	return (mean <= moments.x ? 1.0 : pMax);
}
float calculateEVSM(vec3 moments, float Z, float vsmBias, float exponent) {
	Z = 2.0 * Z - 1.0;
	float warpedDepth = exp(exponent * Z);
	moments.xy += vec2(warpedDepth, warpedDepth*warpedDepth) * (1.0 - moments.z);
	float VSMBias = vsmBias;
	float depthScale = VSMBias * exponent * warpedDepth;
	float minVariance1 = depthScale * depthScale;
	return chebyshevUpperBound(moments.xy, warpedDepth, minVariance1, 0.1);
}
float VSM16(TEXTURE_ACCEPT(tex), vec2 texCoords, float resolution, float Z, float vsmBias, float exponent) {
	vec3 moments = texture2DLod(tex, texCoords, 0.0).xyz;
	return calculateEVSM(moments, Z, vsmBias, exponent);
}
float getShadowVSM16(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, float exponent) {
	return VSM16(TEXTURE_PASS(shadowMap), shadowCoord.xy, shadowParams.x, shadowCoord.z, shadowParams.y, exponent);
}
float getShadowSpotVSM16(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, float exponent, vec3 lightDir) {
	return VSM16(TEXTURE_PASS(shadowMap), shadowCoord.xy, shadowParams.x, length(lightDir) * shadowParams.w + shadowParams.z, shadowParams.y, exponent);
}
float VSM32(TEXTURE_ACCEPT(tex), vec2 texCoords, float resolution, float Z, float vsmBias, float exponent) {
	#ifdef CAPS_TEXTURE_FLOAT_FILTERABLE
		vec3 moments = texture2DLod(tex, texCoords, 0.0).xyz;
	#else
		float pixelSize = 1.0 / resolution;
		texCoords -= vec2(pixelSize);
		vec3 s00 = texture2DLod(tex, texCoords, 0.0).xyz;
		vec3 s10 = texture2DLod(tex, texCoords + vec2(pixelSize, 0), 0.0).xyz;
		vec3 s01 = texture2DLod(tex, texCoords + vec2(0, pixelSize), 0.0).xyz;
		vec3 s11 = texture2DLod(tex, texCoords + vec2(pixelSize), 0.0).xyz;
		vec2 fr = fract(texCoords * resolution);
		vec3 h0 = mix(s00, s10, fr.x);
		vec3 h1 = mix(s01, s11, fr.x);
		vec3 moments = mix(h0, h1, fr.y);
	#endif
	return calculateEVSM(moments, Z, vsmBias, exponent);
}
float getShadowVSM32(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, float exponent) {
	return VSM32(TEXTURE_PASS(shadowMap), shadowCoord.xy, shadowParams.x, shadowCoord.z, shadowParams.y, exponent);
}
float getShadowSpotVSM32(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, float exponent, vec3 lightDir) {
	float Z = length(lightDir) * shadowParams.w + shadowParams.z;
	return VSM32(TEXTURE_PASS(shadowMap), shadowCoord.xy, shadowParams.x, Z, shadowParams.y, exponent);
}
`

var shadowPCF1PS$1 = `
float getShadowPCF1x1(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return textureShadow(shadowMap, shadowCoord);
}
float getShadowSpotPCF1x1(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return textureShadow(shadowMap, shadowCoord);
}
#ifndef WEBGPU
float getShadowOmniPCF1x1(samplerCubeShadow shadowMap, vec3 shadowCoord, vec4 shadowParams, vec3 lightDir) {
	float shadowZ = length(lightDir) * shadowParams.w + shadowParams.z;
	return texture(shadowMap, vec4(lightDir, shadowZ));
}
#endif
`

var shadowPCF3PS$1 = `
float _getShadowPCF3x3(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec3 shadowParams) {
	float z = shadowCoord.z;
	vec2 uv = shadowCoord.xy * shadowParams.x;
	float shadowMapSizeInv = 1.0 / shadowParams.x;
	vec2 base_uv = floor(uv + 0.5);
	float s = (uv.x + 0.5 - base_uv.x);
	float t = (uv.y + 0.5 - base_uv.y); 
	base_uv -= vec2(0.5);
	base_uv *= shadowMapSizeInv;
	float sum = 0.0;
	float uw0 = (3.0 - 2.0 * s);
	float uw1 = (1.0 + 2.0 * s);
	float u0 = (2.0 - s) / uw0 - 1.0;
	float u1 = s / uw1 + 1.0;
	float vw0 = (3.0 - 2.0 * t);
	float vw1 = (1.0 + 2.0 * t);
	float v0 = (2.0 - t) / vw0 - 1.0;
	float v1 = t / vw1 + 1.0;
	u0 = u0 * shadowMapSizeInv + base_uv.x;
	v0 = v0 * shadowMapSizeInv + base_uv.y;
	u1 = u1 * shadowMapSizeInv + base_uv.x;
	v1 = v1 * shadowMapSizeInv + base_uv.y;
	sum += uw0 * vw0 * textureShadow(shadowMap, vec3(u0, v0, z));
	sum += uw1 * vw0 * textureShadow(shadowMap, vec3(u1, v0, z));
	sum += uw0 * vw1 * textureShadow(shadowMap, vec3(u0, v1, z));
	sum += uw1 * vw1 * textureShadow(shadowMap, vec3(u1, v1, z));
	sum *= 1.0f / 16.0;
	return sum;
}
float getShadowPCF3x3(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return _getShadowPCF3x3(SHADOWMAP_PASS(shadowMap), shadowCoord, shadowParams.xyz);
}
float getShadowSpotPCF3x3(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return _getShadowPCF3x3(SHADOWMAP_PASS(shadowMap), shadowCoord, shadowParams.xyz);
}
#ifndef WEBGPU
float getShadowOmniPCF3x3(samplerCubeShadow shadowMap, vec4 shadowParams, vec3 dir) {
	
	float shadowZ = length(dir) * shadowParams.w + shadowParams.z;
	float z = 1.0 / float(textureSize(shadowMap, 0));
	vec3 tc = normalize(dir);
	mediump vec4 shadows;
	shadows.x = texture(shadowMap, vec4(tc + vec3( z, z, z), shadowZ));
	shadows.y = texture(shadowMap, vec4(tc + vec3(-z,-z, z), shadowZ));
	shadows.z = texture(shadowMap, vec4(tc + vec3(-z, z,-z), shadowZ));
	shadows.w = texture(shadowMap, vec4(tc + vec3( z,-z,-z), shadowZ));
	return dot(shadows, vec4(0.25));
}
float getShadowOmniPCF3x3(samplerCubeShadow shadowMap, vec3 shadowCoord, vec4 shadowParams, vec3 lightDir) {
	return getShadowOmniPCF3x3(shadowMap, shadowParams, lightDir);
}
#endif
`

var shadowPCF5PS$1 = `
float _getShadowPCF5x5(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec3 shadowParams) {
	float z = shadowCoord.z;
	vec2 uv = shadowCoord.xy * shadowParams.x;
	float shadowMapSizeInv = 1.0 / shadowParams.x;
	vec2 base_uv = floor(uv + 0.5);
	float s = (uv.x + 0.5 - base_uv.x);
	float t = (uv.y + 0.5 - base_uv.y);
	base_uv -= vec2(0.5);
	base_uv *= shadowMapSizeInv;
	float uw0 = (4.0 - 3.0 * s);
	float uw1 = 7.0;
	float uw2 = (1.0 + 3.0 * s);
	float u0 = (3.0 - 2.0 * s) / uw0 - 2.0;
	float u1 = (3.0 + s) / uw1;
	float u2 = s / uw2 + 2.0;
	float vw0 = (4.0 - 3.0 * t);
	float vw1 = 7.0;
	float vw2 = (1.0 + 3.0 * t);
	float v0 = (3.0 - 2.0 * t) / vw0 - 2.0;
	float v1 = (3.0 + t) / vw1;
	float v2 = t / vw2 + 2.0;
	float sum = 0.0;
	u0 = u0 * shadowMapSizeInv + base_uv.x;
	v0 = v0 * shadowMapSizeInv + base_uv.y;
	u1 = u1 * shadowMapSizeInv + base_uv.x;
	v1 = v1 * shadowMapSizeInv + base_uv.y;
	u2 = u2 * shadowMapSizeInv + base_uv.x;
	v2 = v2 * shadowMapSizeInv + base_uv.y;
	sum += uw0 * vw0 * textureShadow(shadowMap, vec3(u0, v0, z));
	sum += uw1 * vw0 * textureShadow(shadowMap, vec3(u1, v0, z));
	sum += uw2 * vw0 * textureShadow(shadowMap, vec3(u2, v0, z));
	sum += uw0 * vw1 * textureShadow(shadowMap, vec3(u0, v1, z));
	sum += uw1 * vw1 * textureShadow(shadowMap, vec3(u1, v1, z));
	sum += uw2 * vw1 * textureShadow(shadowMap, vec3(u2, v1, z));
	sum += uw0 * vw2 * textureShadow(shadowMap, vec3(u0, v2, z));
	sum += uw1 * vw2 * textureShadow(shadowMap, vec3(u1, v2, z));
	sum += uw2 * vw2 * textureShadow(shadowMap, vec3(u2, v2, z));
	sum *= 1.0f / 144.0;
	sum = saturate(sum);
	return sum;
}
float getShadowPCF5x5(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return _getShadowPCF5x5(SHADOWMAP_PASS(shadowMap), shadowCoord, shadowParams.xyz);
}
float getShadowSpotPCF5x5(SHADOWMAP_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams) {
	return _getShadowPCF5x5(SHADOWMAP_PASS(shadowMap), shadowCoord, shadowParams.xyz);
}
`

var shadowPCSSPS = `
#define PCSS_SAMPLE_COUNT 16
uniform float pcssDiskSamples[PCSS_SAMPLE_COUNT];
uniform float pcssSphereSamples[PCSS_SAMPLE_COUNT];
vec2 vogelDisk(int sampleIndex, float count, float phi, float r) {
	const float GoldenAngle = 2.4;
	float theta = float(sampleIndex) * GoldenAngle + phi;
	float sine = sin(theta);
	float cosine = cos(theta);
	return vec2(r * cosine, r * sine);
}
vec3 vogelSphere(int sampleIndex, float count, float phi, float r) {
	const float GoldenAngle = 2.4;
	float theta = float(sampleIndex) * GoldenAngle + phi;
	float weight = float(sampleIndex) / count;
	return vec3(cos(theta) * r, weight, sin(theta) * r);
}
float noise(vec2 screenPos) {
	const float PHI = 1.61803398874989484820459;
	return fract(sin(dot(screenPos * PHI, screenPos)) * screenPos.x);
}
float viewSpaceDepth(float depth, mat4 invProjection) {
	float z = depth * 2.0 - 1.0;
	vec4 clipSpace = vec4(0.0, 0.0, z, 1.0);
	vec4 viewSpace = invProjection * clipSpace;
	return viewSpace.z;
}
float PCSSBlockerDistance(TEXTURE_ACCEPT(shadowMap), vec2 sampleCoords[PCSS_SAMPLE_COUNT], vec2 shadowCoords, vec2 searchSize, float z, vec4 cameraParams) {
	float blockers = 0.0;
	float averageBlocker = 0.0;
	for (int i = 0; i < PCSS_SAMPLE_COUNT; i++) {
		vec2 offset = sampleCoords[i] * searchSize;
		vec2 sampleUV = shadowCoords + offset;
		float blocker = texture2DLod(shadowMap, sampleUV, 0.0).r;
		float isBlocking = step(blocker, z);
		blockers += isBlocking;
		averageBlocker += blocker * isBlocking;
	}
	if (blockers > 0.0)
		return averageBlocker / blockers;
	return -1.0;
}
float PCSS(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoords, vec4 cameraParams, vec2 shadowSearchArea) {
	float receiverDepth = linearizeDepthWithParams(shadowCoords.z, cameraParams);
	vec2 samplePoints[PCSS_SAMPLE_COUNT];
	const float PI = 3.141592653589793;
	float noise = noise( gl_FragCoord.xy ) * 2.0 * PI;
	for (int i = 0; i < PCSS_SAMPLE_COUNT; i++) {
		float pcssPresample = pcssDiskSamples[i];
		samplePoints[i] = vogelDisk(i, float(PCSS_SAMPLE_COUNT), noise, pcssPresample);
	}
	float averageBlocker = PCSSBlockerDistance(TEXTURE_PASS(shadowMap), samplePoints, shadowCoords.xy, shadowSearchArea, receiverDepth, cameraParams);
	if (averageBlocker == -1.0) {
		return 1.0;
	} else {
		float depthDifference = (receiverDepth - averageBlocker) / 3.0;
		vec2 filterRadius = depthDifference * shadowSearchArea;
		float shadow = 0.0;
		for (int i = 0; i < PCSS_SAMPLE_COUNT; i ++)
		{
			vec2 sampleUV = samplePoints[i] * filterRadius;
			sampleUV = shadowCoords.xy + sampleUV;
			float depth = texture2DLod(shadowMap, sampleUV, 0.0).r;
			shadow += step(receiverDepth, depth);
		}
		return shadow / float(PCSS_SAMPLE_COUNT);
	} 
}
#ifndef WEBGPU
float PCSSCubeBlockerDistance(samplerCube shadowMap, vec3 lightDirNorm, vec3 samplePoints[PCSS_SAMPLE_COUNT], float z, float shadowSearchArea) {
	float blockers = 0.0;
	float averageBlocker = 0.0;
	for (int i = 0; i < PCSS_SAMPLE_COUNT; i++) {
		vec3 sampleDir = lightDirNorm + samplePoints[i] * shadowSearchArea;
		sampleDir = normalize(sampleDir);
		float blocker = textureCubeLod(shadowMap, sampleDir, 0.0).r;
		float isBlocking = step(blocker, z);
		blockers += isBlocking;
		averageBlocker += blocker * isBlocking;
	}
	if (blockers > 0.0)
		return averageBlocker / blockers;
	return -1.0;
}
float PCSSCube(samplerCube shadowMap, vec4 shadowParams, vec3 shadowCoords, vec4 cameraParams, float shadowSearchArea, vec3 lightDir) {
	
	vec3 samplePoints[PCSS_SAMPLE_COUNT];
	const float PI = 3.141592653589793;
	float noise = noise( gl_FragCoord.xy ) * 2.0 * PI;
	for (int i = 0; i < PCSS_SAMPLE_COUNT; i++) {
		float r = pcssSphereSamples[i];
		samplePoints[i] = vogelSphere(i, float(PCSS_SAMPLE_COUNT), noise, r);
	}
	float receiverDepth = length(lightDir) * shadowParams.w + shadowParams.z;
	vec3 lightDirNorm = normalize(lightDir);
	
	float averageBlocker = PCSSCubeBlockerDistance(shadowMap, lightDirNorm, samplePoints, receiverDepth, shadowSearchArea);
	if (averageBlocker == -1.0) {
		return 1.0;
	} else {
		float filterRadius = ((receiverDepth - averageBlocker) / averageBlocker) * shadowSearchArea;
		float shadow = 0.0;
		for (int i = 0; i < PCSS_SAMPLE_COUNT; i++)
		{
			vec3 offset = samplePoints[i] * filterRadius;
			vec3 sampleDir = lightDirNorm + offset;
			sampleDir = normalize(sampleDir);
			float depth = textureCubeLod(shadowMap, sampleDir, 0.0).r;
			shadow += step(receiverDepth, depth);
		}
		return shadow / float(PCSS_SAMPLE_COUNT);
	}
}
float getShadowOmniPCSS(samplerCube shadowMap, vec3 shadowCoord, vec4 shadowParams, vec4 cameraParams, vec2 shadowSearchArea, vec3 lightDir) {
	return PCSSCube(shadowMap, shadowParams, shadowCoord, cameraParams, shadowSearchArea.x, lightDir);
}
#endif
float getShadowSpotPCSS(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, vec4 cameraParams, vec2 shadowSearchArea, vec3 lightDir) {
	return PCSS(TEXTURE_PASS(shadowMap), shadowCoord, cameraParams, shadowSearchArea);
}
`

var shadowSoftPS$1 = `
highp float fractSinRand(const in vec2 uv) {
	const float PI = 3.141592653589793;
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot(uv.xy, vec2(a, b)), sn = mod(dt, PI);
	return fract(sin(sn) * c);
}
struct VogelDiskData {
	float invNumSamples;
	float initialAngle;
	float currentPointId;
};
void prepareDiskConstants(out VogelDiskData data, int sampleCount, float randomSeed) {
	const float pi2 = 6.28318530718;
	data.invNumSamples = 1.0 / float(sampleCount);
	data.initialAngle = randomSeed * pi2;
	data.currentPointId = 0.0;
}
vec2 generateDiskSample(inout VogelDiskData data) {
	const float GOLDEN_ANGLE = 2.399963;
	float r = sqrt((data.currentPointId + 0.5) * data.invNumSamples);
	float theta = data.currentPointId * GOLDEN_ANGLE + data.initialAngle;
	vec2 offset = vec2(cos(theta), sin(theta)) * pow(r, 1.33);
	data.currentPointId += 1.0;
	return offset;
}
void PCSSFindBlocker(TEXTURE_ACCEPT(shadowMap), out float avgBlockerDepth, out int numBlockers,
	vec2 shadowCoords, float z, int shadowBlockerSamples, float penumbraSize, float invShadowMapSize, float randomSeed) {
	VogelDiskData diskData;
	prepareDiskConstants(diskData, shadowBlockerSamples, randomSeed);
	float searchWidth = penumbraSize * invShadowMapSize;
	float blockerSum = 0.0;
	numBlockers = 0;
	for( int i = 0; i < shadowBlockerSamples; ++i ) {
		vec2 diskUV = generateDiskSample(diskData);
		vec2 sampleUV = shadowCoords + diskUV * searchWidth;
		float shadowMapDepth = texture2DLod(shadowMap, sampleUV, 0.0).r;
		if ( shadowMapDepth < z ) {
			blockerSum += shadowMapDepth;
			numBlockers++;
		}
	}
	avgBlockerDepth = blockerSum / float(numBlockers);
}
float PCSSFilter(TEXTURE_ACCEPT(shadowMap), vec2 uv, float receiverDepth, int shadowSamples, float filterRadius, float randomSeed) {
	VogelDiskData diskData;
	prepareDiskConstants(diskData, shadowSamples, randomSeed);
	float sum = 0.0;
	for (int i = 0; i < shadowSamples; i++) {
		vec2 offsetUV = generateDiskSample(diskData) * filterRadius;
		float depth = texture2DLod(shadowMap, uv + offsetUV, 0.0).r;
		sum += step(receiverDepth, depth);
	}
	return sum / float(shadowSamples);
}
float getPenumbra(float dblocker, float dreceiver, float penumbraSize, float penumbraFalloff) {
	float dist = dreceiver - dblocker;
	float penumbra = 1.0 - pow(1.0 - dist, penumbraFalloff);
	return penumbra * penumbraSize;
}
float PCSSDirectional(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoords, vec4 cameraParams, vec4 softShadowParams) {
	float receiverDepth = shadowCoords.z;
	float randomSeed = fractSinRand(gl_FragCoord.xy);
	int shadowSamples = int(softShadowParams.x);
	int shadowBlockerSamples = int(softShadowParams.y);
	float penumbraSize = softShadowParams.z;
	float penumbraFalloff = softShadowParams.w;
	int shadowMapSize = textureSize(shadowMap, 0).x;
	float invShadowMapSize = 1.0 / float(shadowMapSize);
	invShadowMapSize *= float(shadowMapSize) / 2048.0;
	float penumbra;
	if (shadowBlockerSamples > 0) {
		float avgBlockerDepth = 0.0;
		int numBlockers = 0;
		PCSSFindBlocker(TEXTURE_PASS(shadowMap), avgBlockerDepth, numBlockers, shadowCoords.xy, receiverDepth, shadowBlockerSamples, penumbraSize, invShadowMapSize, randomSeed);
		if (numBlockers < 1)
			return 1.0f;
		penumbra = getPenumbra(avgBlockerDepth, shadowCoords.z, penumbraSize, penumbraFalloff);
	} else {
		penumbra = penumbraSize;
	}
	float filterRadius = penumbra * invShadowMapSize;
	return PCSSFilter(TEXTURE_PASS(shadowMap), shadowCoords.xy, receiverDepth, shadowSamples, filterRadius, randomSeed);
}
float getShadowPCSS(TEXTURE_ACCEPT(shadowMap), vec3 shadowCoord, vec4 shadowParams, vec4 cameraParams, vec4 softShadowParams, vec3 lightDir) {
	return PCSSDirectional(TEXTURE_PASS(shadowMap), shadowCoord, cameraParams, softShadowParams);
}
`

var skinBatchVS$1 = `
attribute float vertex_boneIndices;
uniform highp sampler2D texture_poseMap;
mat4 getBoneMatrix(const in float indexFloat) {
	int width = textureSize(texture_poseMap, 0).x;
	int index = int(indexFloat + 0.5) * 3;
	int iy = index / width;
	int ix = index % width;
	vec4 v1 = texelFetch(texture_poseMap, ivec2(ix + 0, iy), 0);
	vec4 v2 = texelFetch(texture_poseMap, ivec2(ix + 1, iy), 0);
	vec4 v3 = texelFetch(texture_poseMap, ivec2(ix + 2, iy), 0);
	return mat4(
		v1.x, v2.x, v3.x, 0,
		v1.y, v2.y, v3.y, 0,
		v1.z, v2.z, v3.z, 0,
		v1.w, v2.w, v3.w, 1
	);
}
`

var skinVS$1 = `
attribute vec4 vertex_boneWeights;
attribute vec4 vertex_boneIndices;
uniform highp sampler2D texture_poseMap;
void getBoneMatrix(const in int width, const in int index, out vec4 v1, out vec4 v2, out vec4 v3) {
	int v = index / width;
	int u = index % width;
	v1 = texelFetch(texture_poseMap, ivec2(u + 0, v), 0);
	v2 = texelFetch(texture_poseMap, ivec2(u + 1, v), 0);
	v3 = texelFetch(texture_poseMap, ivec2(u + 2, v), 0);
}
mat4 getSkinMatrix(const in vec4 indicesFloat, const in vec4 weights) {
	int width = textureSize(texture_poseMap, 0).x;
	ivec4 indices = ivec4(indicesFloat + 0.5) * 3;
	vec4 a1, a2, a3;
	getBoneMatrix(width, indices.x, a1, a2, a3);
	vec4 b1, b2, b3;
	getBoneMatrix(width, indices.y, b1, b2, b3);
	vec4 c1, c2, c3;
	getBoneMatrix(width, indices.z, c1, c2, c3);
	vec4 d1, d2, d3;
	getBoneMatrix(width, indices.w, d1, d2, d3);
	vec4 v1 = a1 * weights.x + b1 * weights.y + c1 * weights.z + d1 * weights.w;
	vec4 v2 = a2 * weights.x + b2 * weights.y + c2 * weights.z + d2 * weights.w;
	vec4 v3 = a3 * weights.x + b3 * weights.y + c3 * weights.z + d3 * weights.w;
	float one = dot(weights, vec4(1.0));
	return mat4(
		v1.x, v2.x, v3.x, 0,
		v1.y, v2.y, v3.y, 0,
		v1.z, v2.z, v3.z, 0,
		v1.w, v2.w, v3.w, one
	);
}
`

var skyboxPS$1 = `
	#define LIT_SKYBOX_INTENSITY
	#include "envProcPS"
	#include "gammaPS"
	#include "tonemappingPS"
	#ifdef PREPASS_PASS
		varying float vLinearDepth;
		#include "floatAsUintPS"
	#endif
	varying vec3 vViewDir;
	uniform float skyboxHighlightMultiplier;
	#ifdef SKY_CUBEMAP
		uniform samplerCube texture_cubeMap;
		#ifdef SKYMESH
			varying vec3 vWorldPos;
			uniform mat3 cubeMapRotationMatrix;
			uniform vec3 projectedSkydomeCenter;
		#endif
	#else
		#include "sphericalPS"
		#include "envAtlasPS"
		uniform sampler2D texture_envAtlas;
		uniform float mipLevel;
	#endif
	void main(void) {
		#ifdef PREPASS_PASS
			gl_FragColor = float2vec4(vLinearDepth);
		#else
			#ifdef SKY_CUBEMAP
				#ifdef SKYMESH
					vec3 envDir = normalize(vWorldPos - projectedSkydomeCenter);
					vec3 dir = envDir * cubeMapRotationMatrix;
				#else
					vec3 dir = vViewDir;
				#endif
				dir.x *= -1.0;
				vec3 linear = {SKYBOX_DECODE_FNC}(textureCube(texture_cubeMap, dir));
			#else
				vec3 dir = vViewDir * vec3(-1.0, 1.0, 1.0);
				vec2 uv = toSphericalUv(normalize(dir));
				vec3 linear = {SKYBOX_DECODE_FNC}(texture2D(texture_envAtlas, mapRoughnessUv(uv, mipLevel)));
			#endif
			if (any(greaterThanEqual(linear, vec3(64.0)))) {
				linear *= skyboxHighlightMultiplier;
			}
			gl_FragColor = vec4(gammaCorrectOutput(toneMap(processEnvironment(linear))), 1.0);
		#endif
	}
`

var skyboxVS$1 = `
attribute vec4 aPosition;
uniform mat4 matrix_view;
uniform mat4 matrix_projectionSkybox;
uniform mat3 cubeMapRotationMatrix;
varying vec3 vViewDir;
#ifdef PREPASS_PASS
	varying float vLinearDepth;
#endif
#ifdef SKYMESH
	uniform mat4 matrix_model;
	varying vec3 vWorldPos;
#endif
void main(void) {
	mat4 view = matrix_view;
	#ifdef SKYMESH
		vec4 worldPos = matrix_model * aPosition;
		vWorldPos = worldPos.xyz;
		gl_Position = matrix_projectionSkybox * (view * worldPos);
		#ifdef PREPASS_PASS
			vLinearDepth = -(matrix_view * vec4(vWorldPos, 1.0)).z;
		#endif
	#else
		view[3][0] = view[3][1] = view[3][2] = 0.0;
		gl_Position = matrix_projectionSkybox * (view * aPosition);
		vViewDir = aPosition.xyz * cubeMapRotationMatrix;
		#ifdef PREPASS_PASS
			vLinearDepth = -gl_Position.w;
		#endif
	#endif
	gl_Position.z = gl_Position.w - 1.0e-7;
}
`

var specularPS$1 = `
#ifdef STD_SPECULAR_CONSTANT
uniform vec3 material_specular;
#endif
void getSpecularity() {
	vec3 specularColor = vec3(1,1,1);
	#ifdef STD_SPECULAR_CONSTANT
	specularColor *= material_specular;
	#endif
	#ifdef STD_SPECULAR_TEXTURE
	specularColor *= {STD_SPECULAR_TEXTURE_DECODE}(texture2DBias({STD_SPECULAR_TEXTURE_NAME}, {STD_SPECULAR_TEXTURE_UV}, textureBias)).{STD_SPECULAR_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_SPECULAR_VERTEX
	specularColor *= saturate(vVertexColor.{STD_SPECULAR_VERTEX_CHANNEL});
	#endif
	dSpecularity = specularColor;
}
`

var sphericalPS$1 = `
vec2 toSpherical(vec3 dir) {
	return vec2(dir.xz == vec2(0.0) ? 0.0 : atan(dir.x, dir.z), asin(dir.y));
}
vec2 toSphericalUv(vec3 dir) {
	const float PI = 3.141592653589793;
	vec2 uv = toSpherical(dir) / vec2(PI * 2.0, PI) + 0.5;
	return vec2(uv.x, 1.0 - uv.y);
}
`

var specularityFactorPS$1 = `
#ifdef STD_SPECULARITYFACTOR_CONSTANT
uniform float material_specularityFactor;
#endif
void getSpecularityFactor() {
	float specularityFactor = 1.0;
	#ifdef STD_SPECULARITYFACTOR_CONSTANT
	specularityFactor *= material_specularityFactor;
	#endif
	#ifdef STD_SPECULARITYFACTOR_TEXTURE
	specularityFactor *= texture2DBias({STD_SPECULARITYFACTOR_TEXTURE_NAME}, {STD_SPECULARITYFACTOR_TEXTURE_UV}, textureBias).{STD_SPECULARITYFACTOR_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_SPECULARITYFACTOR_VERTEX
	specularityFactor *= saturate(vVertexColor.{STD_SPECULARITYFACTOR_VERTEX_CHANNEL});
	#endif
	dSpecularityFactor = specularityFactor;
}
`

var spotPS$1 = `
float getSpotEffect(vec3 lightSpotDir, float lightInnerConeAngle, float lightOuterConeAngle, vec3 lightDirNorm) {
	float cosAngle = dot(lightDirNorm, lightSpotDir);
	return smoothstep(lightOuterConeAngle, lightInnerConeAngle, cosAngle);
}
`

var startNineSlicedPS$1 = `
	nineSlicedUv = vec2(vUv0.x, 1.0 - vUv0.y);
`

var startNineSlicedTiledPS$1 = `
	vec2 tileMask = step(vMask, vec2(0.99999));
	vec2 tileSize = 0.5 * (innerOffset.xy + innerOffset.zw);
	vec2 tileScale = vec2(1.0) / (vec2(1.0) - tileSize);
	vec2 clampedUv = mix(innerOffset.xy * 0.5, vec2(1.0) - innerOffset.zw * 0.5, fract((vTiledUv - tileSize) * tileScale));
	clampedUv = clampedUv * atlasRect.zw + atlasRect.xy;
	nineSlicedUv = vUv0 * tileMask + clampedUv * (vec2(1.0) - tileMask);
	nineSlicedUv.y = 1.0 - nineSlicedUv.y;
	
`

var stdDeclarationPS$1 = `
	float dAlpha = 1.0;
	#if LIT_BLEND_TYPE != NONE || defined(LIT_ALPHA_TEST) || defined(LIT_ALPHA_TO_COVERAGE) || STD_OPACITY_DITHER != NONE
		#ifdef STD_OPACITY_TEXTURE_ALLOCATE
			uniform sampler2D texture_opacityMap;
		#endif
	#endif
	#ifdef FORWARD_PASS
		vec3 dAlbedo;
		vec3 dNormalW;
		vec3 dSpecularity = vec3(0.0);
		float dGlossiness = 0.0;
		#ifdef LIT_REFRACTION
			float dTransmission;
			float dThickness;
		#endif
		#ifdef LIT_SCENE_COLOR
			uniform sampler2D uSceneColorMap;
		#endif
		#ifdef LIT_SCREEN_SIZE
			uniform vec4 uScreenSize;
		#endif
		#ifdef LIT_TRANSFORMS
			uniform mat4 matrix_viewProjection;
			uniform mat4 matrix_model;
		#endif
		#ifdef STD_HEIGHT_MAP
			vec2 dUvOffset;
			#ifdef STD_HEIGHT_TEXTURE_ALLOCATE
				uniform sampler2D texture_heightMap;
			#endif
		#endif
		#ifdef STD_DIFFUSE_TEXTURE_ALLOCATE
			uniform sampler2D texture_diffuseMap;
		#endif
		#ifdef STD_DIFFUSEDETAIL_TEXTURE_ALLOCATE
			uniform sampler2D texture_diffuseDetailMap;
		#endif
		#ifdef STD_NORMAL_TEXTURE_ALLOCATE
			uniform sampler2D texture_normalMap;
		#endif
		#ifdef STD_NORMALDETAIL_TEXTURE_ALLOCATE
			uniform sampler2D texture_normalDetailMap;
		#endif
		#ifdef STD_THICKNESS_TEXTURE_ALLOCATE
			uniform sampler2D texture_thicknessMap;
		#endif
		#ifdef STD_REFRACTION_TEXTURE_ALLOCATE
			uniform sampler2D texture_refractionMap;
		#endif
		#ifdef LIT_IRIDESCENCE
			float dIridescence;
			float dIridescenceThickness;
			#ifdef STD_IRIDESCENCE_THICKNESS_TEXTURE_ALLOCATE
				uniform sampler2D texture_iridescenceThicknessMap;
			#endif
			#ifdef STD_IRIDESCENCE_TEXTURE_ALLOCATE
				uniform sampler2D texture_iridescenceMap;
			#endif
		#endif
		#ifdef LIT_CLEARCOAT
			float ccSpecularity;
			float ccGlossiness;
			vec3 ccNormalW;
		#endif
		#ifdef LIT_GGX_SPECULAR
			float dAnisotropy;
			vec2 dAnisotropyRotation;
		#endif
		#ifdef LIT_SPECULAR_OR_REFLECTION
			#ifdef LIT_SHEEN
				vec3 sSpecularity;
				float sGlossiness;
				#ifdef STD_SHEEN_TEXTURE_ALLOCATE
					uniform sampler2D texture_sheenMap;
				#endif
				#ifdef STD_SHEENGLOSS_TEXTURE_ALLOCATE
					uniform sampler2D texture_sheenGlossMap;
				#endif
			#endif
			#ifdef LIT_METALNESS
				float dMetalness;
				float dIor;
				#ifdef STD_METALNESS_TEXTURE_ALLOCATE
					uniform sampler2D texture_metalnessMap;
				#endif
			#endif
			#ifdef LIT_SPECULARITY_FACTOR
				float dSpecularityFactor;
				#ifdef STD_SPECULARITYFACTOR_TEXTURE_ALLOCATE
					uniform sampler2D texture_specularityFactorMap;
				#endif
			#endif
			#ifdef STD_SPECULAR_COLOR
				#ifdef STD_SPECULAR_TEXTURE_ALLOCATE
					uniform sampler2D texture_specularMap;
				#endif
			#endif
			#ifdef STD_GLOSS_TEXTURE_ALLOCATE
				uniform sampler2D texture_glossMap;
			#endif
		#endif
		#ifdef STD_AO
			float dAo;
			#ifdef STD_AO_TEXTURE_ALLOCATE
				uniform sampler2D texture_aoMap;
			#endif
			#ifdef STD_AODETAIL_TEXTURE_ALLOCATE
				uniform sampler2D texture_aoDetailMap;
			#endif
		#endif
		vec3 dEmission;
		#ifdef STD_EMISSIVE_TEXTURE_ALLOCATE
			uniform sampler2D texture_emissiveMap;
		#endif
		#ifdef LIT_CLEARCOAT
			#ifdef STD_CLEARCOAT_TEXTURE_ALLOCATE
				uniform sampler2D texture_clearCoatMap;
			#endif
			#ifdef STD_CLEARCOATGLOSS_TEXTURE_ALLOCATE
				uniform sampler2D texture_clearCoatGlossMap;
			#endif
			#ifdef STD_CLEARCOATNORMAL_TEXTURE_ALLOCATE
				uniform sampler2D texture_clearCoatNormalMap;
			#endif
		#endif
		
		#ifdef LIT_GGX_SPECULAR
			#ifdef STD_ANISOTROPY_TEXTURE_ALLOCATE
				uniform sampler2D texture_anisotropyMap;
			#endif
		#endif
		#if defined(STD_LIGHTMAP) || defined(STD_LIGHT_VERTEX_COLOR)
			vec3 dLightmap;
			#ifdef STD_LIGHT_TEXTURE_ALLOCATE
				uniform sampler2D texture_lightMap;
			#endif
		#endif
	#endif
	#include "litShaderCorePS"
`

var stdFrontEndPS$1 = `
	#if LIT_BLEND_TYPE != NONE || defined(LIT_ALPHA_TEST) || defined(LIT_ALPHA_TO_COVERAGE) || STD_OPACITY_DITHER != NONE
		#include "opacityPS"
		#if defined(LIT_ALPHA_TEST)
			#include "alphaTestPS"
		#endif
		#if STD_OPACITY_DITHER != NONE
			#include "opacityDitherPS"
		#endif
	#endif
	#ifdef FORWARD_PASS
		#ifdef STD_HEIGHT_MAP
			#include "parallaxPS"
		#endif
		#include  "diffusePS"
		#ifdef LIT_NEEDS_NORMAL
			#include "normalMapPS"
		#endif
		#ifdef LIT_REFRACTION
			#include "transmissionPS"
			#include "thicknessPS"
		#endif
		#ifdef LIT_IRIDESCENCE
			#include "iridescencePS"
			#include "iridescenceThicknessPS"
		#endif
		#ifdef LIT_SPECULAR_OR_REFLECTION
			#ifdef LIT_SHEEN
				#include "sheenPS"
				#include "sheenGlossPS"
			#endif
			#ifdef LIT_METALNESS
				#include "metalnessPS"
				#include "iorPS"
			#endif
			#ifdef LIT_SPECULARITY_FACTOR
				#include "specularityFactorPS"
			#endif
			#ifdef STD_SPECULAR_COLOR
				#include "specularPS"
			#else
				void getSpecularity() { 
					dSpecularity = vec3(1);
				}
			#endif
			#include "glossPS"
		#endif
		#ifdef STD_AO
			#include "aoPS"
		#endif
		#include "emissivePS"
		#ifdef LIT_CLEARCOAT
			#include "clearCoatPS"
			#include "clearCoatGlossPS"
			#include "clearCoatNormalPS"
		#endif
		#if defined(LIT_SPECULAR) && defined(LIT_LIGHTING) && defined(LIT_GGX_SPECULAR)
			#include "anisotropyPS"
		#endif
		#if defined(STD_LIGHTMAP) || defined(STD_LIGHT_VERTEX_COLOR)
			#include "lightmapPS"
		#endif
	#endif
	void evaluateFrontend() {
		#if LIT_BLEND_TYPE != NONE || defined(LIT_ALPHA_TEST) || defined(LIT_ALPHA_TO_COVERAGE) || STD_OPACITY_DITHER != NONE
			getOpacity();
			#if defined(LIT_ALPHA_TEST)
				alphaTest(dAlpha);
			#endif
			#if STD_OPACITY_DITHER != NONE
				opacityDither(dAlpha, 0.0);
			#endif
			litArgs_opacity = dAlpha;
		#endif
		#ifdef FORWARD_PASS
			#ifdef STD_HEIGHT_MAP
				getParallax();
			#endif
			getAlbedo();
			litArgs_albedo = dAlbedo;
			#ifdef LIT_NEEDS_NORMAL
				getNormal();
				litArgs_worldNormal = dNormalW;
			#endif
			#ifdef LIT_REFRACTION
				getRefraction();
				litArgs_transmission = dTransmission;
				getThickness();
				litArgs_thickness = dThickness;
				#ifdef LIT_DISPERSION
					litArgs_dispersion = material_dispersion;
				#endif
			#endif
			#ifdef LIT_IRIDESCENCE
				getIridescence();
				getIridescenceThickness();
				litArgs_iridescence_intensity = dIridescence;
				litArgs_iridescence_thickness = dIridescenceThickness;
			#endif
			#ifdef LIT_SPECULAR_OR_REFLECTION
				#ifdef LIT_SHEEN
					getSheen();
					litArgs_sheen_specularity = sSpecularity;
					getSheenGlossiness();
					litArgs_sheen_gloss = sGlossiness;
				#endif
				#ifdef LIT_METALNESS
					getMetalness();
					litArgs_metalness = dMetalness;
					getIor();
					litArgs_ior = dIor;
				#endif
				#ifdef LIT_SPECULARITY_FACTOR
					getSpecularityFactor();
					litArgs_specularityFactor = dSpecularityFactor;
				#endif
				getGlossiness();
				getSpecularity();
				litArgs_specularity = dSpecularity;
				litArgs_gloss = dGlossiness;
			#endif
			#ifdef STD_AO
				getAO();
				litArgs_ao = dAo;
			#endif
			getEmission();
			litArgs_emission = dEmission;
			#ifdef LIT_CLEARCOAT
				getClearCoat();
				getClearCoatGlossiness();
				getClearCoatNormal();
				litArgs_clearcoat_specularity = ccSpecularity;
				litArgs_clearcoat_gloss = ccGlossiness;
				litArgs_clearcoat_worldNormal = ccNormalW;
			#endif
			#if defined(LIT_SPECULAR) && defined(LIT_LIGHTING) && defined(LIT_GGX_SPECULAR)
				getAnisotropy();
			#endif
			#if defined(STD_LIGHTMAP) || defined(STD_LIGHT_VERTEX_COLOR)
				getLightMap();
				litArgs_lightmap = dLightmap;
				#ifdef STD_LIGHTMAP_DIR
					litArgs_lightmapDir = dLightmapDir;
				#endif
			#endif
		#endif
	}
`

var TBNPS$1 = `
#ifdef LIT_TANGENTS
	#define TBN_TANGENTS
#else
	#if defined(LIT_USE_NORMALS) || defined(LIT_USE_CLEARCOAT_NORMALS)
		#define TBN_DERIVATIVES
	#endif
#endif
#if defined(TBN_DERIVATIVES)
	uniform float tbnBasis;
#endif
void getTBN(vec3 tangent, vec3 binormal, vec3 normal) {
	#ifdef TBN_TANGENTS
		dTBN = mat3(normalize(tangent), normalize(binormal), normalize(normal));
	#elif defined(TBN_DERIVATIVES)
		vec2 uv = {lightingUv};
		vec3 dp1 = dFdx( vPositionW );
		vec3 dp2 = dFdy( vPositionW );
		vec2 duv1 = dFdx( uv );
		vec2 duv2 = dFdy( uv );
		vec3 dp2perp = cross( dp2, normal );
		vec3 dp1perp = cross( normal, dp1 );
		vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
		vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
		float denom = max( dot(T,T), dot(B,B) );
		float invmax = (denom == 0.0) ? 0.0 : tbnBasis / sqrt( denom );
		dTBN = mat3(T * invmax, -B * invmax, normal );
	#else
		vec3 B = cross(normal, vObjectSpaceUpW);
		vec3 T = cross(normal, B);
		if (dot(B,B)==0.0)
		{
			float major=max(max(normal.x, normal.y), normal.z);
			if (normal.x == major)
			{
				B = cross(normal, vec3(0,1,0));
				T = cross(normal, B);
			}
			else if (normal.y == major)
			{
				B = cross(normal, vec3(0,0,1));
				T = cross(normal, B);
			}
			else if (normal.z == major)
			{
				B = cross(normal, vec3(1,0,0));
				T = cross(normal, B);
			}
		}
		dTBN = mat3(normalize(T), normalize(B), normalize(normal));
	#endif
}
`

var thicknessPS$1 = `
#ifdef STD_THICKNESS_CONSTANT
uniform float material_thickness;
#endif
void getThickness() {
	dThickness = 1.0;
	#ifdef STD_THICKNESS_CONSTANT
	dThickness *= material_thickness;
	#endif
	#ifdef STD_THICKNESS_TEXTURE
	dThickness *= texture2DBias({STD_THICKNESS_TEXTURE_NAME}, {STD_THICKNESS_TEXTURE_UV}, textureBias).{STD_THICKNESS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_THICKNESS_VERTEX
	dThickness *= saturate(vVertexColor.{STD_THICKNESS_VERTEX_CHANNEL});
	#endif
}
`

var tonemappingPS$1 = `
#if (TONEMAP == NONE)
	#include "tonemappingNonePS"
#elif TONEMAP == FILMIC
	#include "tonemappingFilmicPS"
#elif TONEMAP == LINEAR
	#include "tonemappingLinearPS"
#elif TONEMAP == HEJL
	#include "tonemappingHejlPS"
#elif TONEMAP == ACES
	#include "tonemappingAcesPS"
#elif TONEMAP == ACES2
	#include "tonemappingAces2PS"
#elif TONEMAP == NEUTRAL
	#include "tonemappingNeutralPS"
#endif
`

var tonemappingAcesPS$1 = `
uniform float exposure;
vec3 toneMap(vec3 color) {
	float tA = 2.51;
	float tB = 0.03;
	float tC = 2.43;
	float tD = 0.59;
	float tE = 0.14;
	vec3 x = color * exposure;
	return (x*(tA*x+tB))/(x*(tC*x+tD)+tE);
}
`

var tonemappingAces2PS$1 = `
uniform float exposure;
const mat3 ACESInputMat = mat3(
	0.59719, 0.35458, 0.04823,
	0.07600, 0.90834, 0.01566,
	0.02840, 0.13383, 0.83777
);
const mat3 ACESOutputMat = mat3(
	 1.60475, -0.53108, -0.07367,
	-0.10208,  1.10813, -0.00605,
	-0.00327, -0.07276,  1.07602
);
vec3 RRTAndODTFit(vec3 v) {
	vec3 a = v * (v + 0.0245786) - 0.000090537;
	vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
	return a / b;
}
vec3 toneMap(vec3 color) {
	color *= exposure / 0.6;
	color = color * ACESInputMat;
	color = RRTAndODTFit(color);
	color = color * ACESOutputMat;
	color = clamp(color, 0.0, 1.0);
	return color;
}
`

var tonemappingFilmicPS$1 = `
const float A =  0.15;
const float B =  0.50;
const float C =  0.10;
const float D =  0.20;
const float E =  0.02;
const float F =  0.30;
const float W =  11.2;
uniform float exposure;
vec3 uncharted2Tonemap(vec3 x) {
	 return ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
}
vec3 toneMap(vec3 color) {
	color = uncharted2Tonemap(color * exposure);
	vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(W,W,W));
	color = color * whiteScale;
	return color;
}
`

var tonemappingHejlPS$1 = `
uniform float exposure;
vec3 toneMap(vec3 color) {
	color *= exposure;
	const float  A = 0.22, B = 0.3, C = .1, D = 0.2, E = .01, F = 0.3;
	const float Scl = 1.25;
	vec3 h = max( vec3(0.0), color - vec3(0.004) );
	return (h*((Scl*A)*h+Scl*vec3(C*B,C*B,C*B))+Scl*vec3(D*E,D*E,D*E)) / (h*(A*h+vec3(B,B,B))+vec3(D*F,D*F,D*F)) - Scl*vec3(E/F,E/F,E/F);
}
`

var tonemappingLinearPS$1 = `
uniform float exposure;
vec3 toneMap(vec3 color) {
	return color * exposure;
}
`

var tonemappingNeutralPS$1 = `
uniform float exposure;
vec3 toneMap(vec3 color) {
	color *= exposure;
	float startCompression = 0.8 - 0.04;
	float desaturation = 0.15;
	float x = min(color.r, min(color.g, color.b));
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max(color.r, max(color.g, color.b));
	if (peak < startCompression) return color;
	float d = 1. - startCompression;
	float newPeak = 1. - d * d / (peak + d - startCompression);
	color *= newPeak / peak;
	float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
	return mix(color, newPeak * vec3(1, 1, 1), g);
}
`

var tonemappingNonePS$1 = `
vec3 toneMap(vec3 color) {
	return color;
}
`

var transformVS$1 = `
#ifdef PIXELSNAP
uniform vec4 uScreenSize;
#endif
#ifdef SCREENSPACE
uniform float projectionFlipY;
#endif
vec4 evalWorldPosition(vec3 vertexPosition, mat4 modelMatrix) {
	vec3 localPos = getLocalPosition(vertexPosition);
	#ifdef NINESLICED
		localPos.xz *= outerScale;
		vec2 positiveUnitOffset = clamp(vertexPosition.xz, vec2(0.0), vec2(1.0));
		vec2 negativeUnitOffset = clamp(-vertexPosition.xz, vec2(0.0), vec2(1.0));
		localPos.xz += (-positiveUnitOffset * innerOffset.xy + negativeUnitOffset * innerOffset.zw) * vertex_texCoord0.xy;
		vTiledUv = (localPos.xz - outerScale + innerOffset.xy) * -0.5 + 1.0;
		localPos.xz *= -0.5;
		localPos = localPos.xzy;
	#endif
	vec4 posW = modelMatrix * vec4(localPos, 1.0);
	#ifdef SCREENSPACE
		posW.zw = vec2(0.0, 1.0);
	#endif
	return posW;
}
vec4 getPosition() {
	dModelMatrix = getModelMatrix();
	vec4 posW = evalWorldPosition(vertex_position.xyz, dModelMatrix);
	dPositionW = posW.xyz;
	vec4 screenPos;
	#ifdef UV1LAYOUT
		screenPos = vec4(vertex_texCoord1.xy * 2.0 - 1.0, 0.5, 1);
		#ifdef WEBGPU
			screenPos.y *= -1.0;
		#endif
	#else
		#ifdef SCREENSPACE
			screenPos = posW;
			screenPos.y *= projectionFlipY;
		#else
			screenPos = matrix_viewProjection * posW;
		#endif
		#ifdef PIXELSNAP
			screenPos.xy = (screenPos.xy * 0.5) + 0.5;
			screenPos.xy *= uScreenSize.xy;
			screenPos.xy = floor(screenPos.xy);
			screenPos.xy *= uScreenSize.zw;
			screenPos.xy = (screenPos.xy * 2.0) - 1.0;
		#endif
	#endif
	return screenPos;
}
vec3 getWorldPosition() {
	return dPositionW;
}
`

var transformCoreVS$1 = `
attribute vec4 vertex_position;
uniform mat4 matrix_viewProjection;
uniform mat4 matrix_model;
#ifdef MORPHING
	uniform vec2 morph_tex_params;
	attribute uint morph_vertex_id;
	ivec2 getTextureMorphCoords() {
		ivec2 textureSize = ivec2(morph_tex_params);
		int morphGridV = int(morph_vertex_id) / textureSize.x;
		int morphGridU = int(morph_vertex_id) - (morphGridV * textureSize.x);
		#ifdef WEBGPU
			morphGridV = textureSize.y - morphGridV - 1;
		#endif
		return ivec2(morphGridU, morphGridV);
	}
	#ifdef MORPHING_POSITION
		#ifdef MORPHING_INT
			uniform vec3 aabbSize;
			uniform vec3 aabbMin;
			uniform usampler2D morphPositionTex;
		#else
			uniform highp sampler2D morphPositionTex;
		#endif
	#endif
#endif
#ifdef defined(BATCH)
	#include "skinBatchVS"
	mat4 getModelMatrix() {
		return getBoneMatrix(vertex_boneIndices);
	}
#elif defined(SKIN)
	#include "skinVS"
	mat4 getModelMatrix() {
		return matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);
	}
#elif defined(INSTANCING)
	#include "transformInstancingVS"
#else
	mat4 getModelMatrix() {
		return matrix_model;
	}
#endif
vec3 getLocalPosition(vec3 vertexPosition) {
	vec3 localPos = vertexPosition;
	#ifdef MORPHING_POSITION
		ivec2 morphUV = getTextureMorphCoords();
		#ifdef MORPHING_INT
			vec3 morphPos = vec3(texelFetch(morphPositionTex, ivec2(morphUV), 0).xyz) / 65535.0 * aabbSize + aabbMin;
		#else
			vec3 morphPos = texelFetch(morphPositionTex, ivec2(morphUV), 0).xyz;
		#endif
		localPos += morphPos;
	#endif
	return localPos;
}
`

var transformInstancingVS$1 = `
attribute vec4 instance_line1;
attribute vec4 instance_line2;
attribute vec4 instance_line3;
attribute vec4 instance_line4;
mat4 getModelMatrix() {
	return matrix_model * mat4(instance_line1, instance_line2, instance_line3, instance_line4);
}
`

var transmissionPS$1 = `
#ifdef STD_REFRACTION_CONSTANT
uniform float material_refraction;
#endif
void getRefraction() {
	float refraction = 1.0;
	#ifdef STD_REFRACTION_CONSTANT
	refraction = material_refraction;
	#endif
	#ifdef STD_REFRACTION_TEXTURE
	refraction *= texture2DBias({STD_REFRACTION_TEXTURE_NAME}, {STD_REFRACTION_TEXTURE_UV}, textureBias).{STD_REFRACTION_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_REFRACTION_VERTEX
	refraction *= saturate(vVertexColor.{STD_REFRACTION_VERTEX_CHANNEL});
	#endif
	dTransmission = refraction;
}
`

var twoSidedLightingPS$1 = `
void handleTwoSidedLighting() {
	if (!gl_FrontFacing) dTBN[2] = -dTBN[2];
}
`

var uv0VS$1 = `
#ifdef NINESLICED
	vec2 getUv0() {
		vec2 uv = vertex_position.xz;
		vec2 positiveUnitOffset = clamp(vertex_position.xz, vec2(0.0), vec2(1.0));
		vec2 negativeUnitOffset = clamp(-vertex_position.xz, vec2(0.0), vec2(1.0));
		uv += (-positiveUnitOffset * innerOffset.xy + negativeUnitOffset * innerOffset.zw) * vertex_texCoord0.xy;
		uv = uv * -0.5 + 0.5;
		uv = uv * atlasRect.zw + atlasRect.xy;
		vMask = vertex_texCoord0.xy;
		return uv;
	}
#else
	vec2 getUv0() {
		return vertex_texCoord0;
	}
#endif
`

var uv1VS$1 = `
vec2 getUv1() {
	return vertex_texCoord1;
}
`

var uvTransformVS$1 = `
vUV{TRANSFORM_UV_{i}}_{TRANSFORM_ID_{i}} = vec2(
	dot(vec3(uv{TRANSFORM_UV_{i}}, 1), {TRANSFORM_NAME_{i}}0),
	dot(vec3(uv{TRANSFORM_UV_{i}}, 1), {TRANSFORM_NAME_{i}}1)
);
`

var uvTransformUniformsPS$1 = `
	uniform vec3 {TRANSFORM_NAME_{i}}0;
	uniform vec3 {TRANSFORM_NAME_{i}}1;
`

var viewDirPS$1 = `
void getViewDir() {
	dViewDirW = normalize(view_position - vPositionW);
}
`
const shaderChunksGLSL = {
    alphaTestPS: alphaTestPS$1,
    ambientPS: ambientPS$1,
    anisotropyPS: anisotropyPS$1,
    aoPS: aoPS$1,
    aoDiffuseOccPS: aoDiffuseOccPS$1,
    aoSpecOccPS: aoSpecOccPS$1,
    bakeDirLmEndPS: bakeDirLmEndPS$1,
    bakeLmEndPS: bakeLmEndPS$1,
    basePS: basePS$1,
    baseNineSlicedPS: baseNineSlicedPS$1,
    baseNineSlicedTiledPS: baseNineSlicedTiledPS$1,
    bayerPS: bayerPS$1,
    blurVSMPS: blurVSMPS$1,
    clearCoatPS: clearCoatPS$1,
    clearCoatGlossPS: clearCoatGlossPS$1,
    clearCoatNormalPS: clearCoatNormalPS$1,
    clusteredLightCookiesPS: clusteredLightCookiesPS$1,
    clusteredLightShadowsPS: clusteredLightShadowsPS$1,
    clusteredLightUtilsPS: clusteredLightUtilsPS$1,
    clusteredLightPS: clusteredLightPS$1,
    combinePS: combinePS$1,
    cookieBlit2DPS: cookieBlit2DPS$1,
    cookieBlitCubePS: cookieBlitCubePS$1,
    cookieBlitVS: cookieBlitVS$1,
    cookiePS,
    cubeMapProjectPS: cubeMapProjectPS$1,
    cubeMapRotatePS: cubeMapRotatePS$1,
    debugOutputPS: debugOutputPS$1,
    debugProcessFrontendPS: debugProcessFrontendPS$1,
    detailModesPS: detailModesPS$1,
    diffusePS: diffusePS$1,
    decodePS: decodePS$1,
    emissivePS: emissivePS$1,
    encodePS: encodePS$1,
    endPS: endPS$1,
    envAtlasPS: envAtlasPS$1,
    envProcPS: envProcPS$1,
    falloffInvSquaredPS: falloffInvSquaredPS$1,
    falloffLinearPS: falloffLinearPS$1,
    floatAsUintPS: floatAsUintPS$1,
    fogPS: fogPS$1,
    fresnelSchlickPS: fresnelSchlickPS$1,
    frontendCodePS: '',
    frontendDeclPS: '',
    fullscreenQuadVS: fullscreenQuadVS$1,
    gammaPS: gammaPS$1,
    gles3PS,
    gles3VS,
    glossPS: glossPS$1,
    quadVS: quadVS$1,
    immediateLinePS: immediateLinePS$1,
    immediateLineVS: immediateLineVS$1,
    iridescenceDiffractionPS: iridescenceDiffractionPS$1,
    iridescencePS: iridescencePS$1,
    iridescenceThicknessPS: iridescenceThicknessPS$1,
    iorPS: iorPS$1,
    lightDeclarationPS: lightDeclarationPS$1,
    lightDiffuseLambertPS: lightDiffuseLambertPS$1,
    lightDirPointPS: lightDirPointPS$1,
    lightEvaluationPS: lightEvaluationPS$1,
    lightFunctionLightPS: lightFunctionLightPS$1,
    lightFunctionShadowPS: lightFunctionShadowPS$1,
    lightingPS: lightingPS$1,
    lightmapAddPS: lightmapAddPS$1,
    lightmapPS: lightmapPS$1,
    lightSpecularAnisoGGXPS: lightSpecularAnisoGGXPS$1,
    lightSpecularGGXPS: lightSpecularGGXPS$1,
    lightSpecularBlinnPS: lightSpecularBlinnPS$1,
    lightSheenPS: lightSheenPS$1,
    linearizeDepthPS: linearizeDepthPS$1,
    litForwardBackendPS: litForwardBackendPS$1,
    litForwardDeclarationPS: litForwardDeclarationPS$1,
    litForwardMainPS: litForwardMainPS$1,
    litForwardPostCodePS: litForwardPostCodePS$1,
    litForwardPreCodePS: litForwardPreCodePS$1,
    litMainPS: litMainPS$1,
    litMainVS: litMainVS$1,
    litOtherMainPS: litOtherMainPS$1,
    litShaderArgsPS: litShaderArgsPS$1,
    litShaderCorePS: litShaderCorePS$1,
    litShadowMainPS: litShadowMainPS$1,
    litUserDeclarationPS: '',
    litUserDeclarationVS: '',
    litUserCodePS: '',
    litUserCodeVS: '',
    litUserMainStartPS: '',
    litUserMainStartVS: '',
    litUserMainEndPS: '',
    litUserMainEndVS: '',
    ltcPS: ltcPS$1,
    metalnessPS: metalnessPS$1,
    metalnessModulatePS: metalnessModulatePS$1,
    morphPS: morphPS$1,
    morphVS: morphVS$1,
    msdfPS: msdfPS$1,
    msdfVS: msdfVS$1,
    normalVS: normalVS$1,
    normalCoreVS: normalCoreVS$1,
    normalMapPS: normalMapPS$1,
    opacityPS: opacityPS$1,
    opacityDitherPS: opacityDitherPS$1,
    outputPS: outputPS$1,
    outputAlphaPS: outputAlphaPS$1,
    outputTex2DPS: outputTex2DPS$1,
    sheenPS: sheenPS$1,
    sheenGlossPS: sheenGlossPS$1,
    parallaxPS: parallaxPS$1,
    pickPS: pickPS$1,
    reflDirPS: reflDirPS$1,
    reflDirAnisoPS: reflDirAnisoPS$1,
    reflectionCCPS: reflectionCCPS$1,
    reflectionCubePS: reflectionCubePS$1,
    reflectionEnvHQPS: reflectionEnvHQPS$1,
    reflectionEnvPS: reflectionEnvPS$1,
    reflectionSpherePS: reflectionSpherePS$1,
    reflectionSheenPS: reflectionSheenPS$1,
    refractionCubePS: refractionCubePS$1,
    refractionDynamicPS: refractionDynamicPS$1,
    reprojectPS: reprojectPS$1,
    reprojectVS: reprojectVS$1,
    screenDepthPS: screenDepthPS$1,
    shadowCascadesPS: shadowCascadesPS$1,
    shadowEVSMPS: shadowEVSMPS$1,
    shadowPCF1PS: shadowPCF1PS$1,
    shadowPCF3PS: shadowPCF3PS$1,
    shadowPCF5PS: shadowPCF5PS$1,
    shadowPCSSPS,
    shadowSoftPS: shadowSoftPS$1,
    skinBatchVS: skinBatchVS$1,
    skinVS: skinVS$1,
    skyboxPS: skyboxPS$1,
    skyboxVS: skyboxVS$1,
    specularPS: specularPS$1,
    sphericalPS: sphericalPS$1,
    specularityFactorPS: specularityFactorPS$1,
    spotPS: spotPS$1,
    startNineSlicedPS: startNineSlicedPS$1,
    startNineSlicedTiledPS: startNineSlicedTiledPS$1,
    stdDeclarationPS: stdDeclarationPS$1,
    stdFrontEndPS: stdFrontEndPS$1,
    TBNPS: TBNPS$1,
    thicknessPS: thicknessPS$1,
    tonemappingPS: tonemappingPS$1,
    tonemappingAcesPS: tonemappingAcesPS$1,
    tonemappingAces2PS: tonemappingAces2PS$1,
    tonemappingFilmicPS: tonemappingFilmicPS$1,
    tonemappingHejlPS: tonemappingHejlPS$1,
    tonemappingLinearPS: tonemappingLinearPS$1,
    tonemappingNeutralPS: tonemappingNeutralPS$1,
    tonemappingNonePS: tonemappingNonePS$1,
    transformVS: transformVS$1,
    transformCoreVS: transformCoreVS$1,
    transformInstancingVS: transformInstancingVS$1,
    transmissionPS: transmissionPS$1,
    twoSidedLightingPS: twoSidedLightingPS$1,
    uv0VS: uv0VS$1,
    uv1VS: uv1VS$1,
    uvTransformVS: uvTransformVS$1,
    uvTransformUniformsPS: uvTransformUniformsPS$1,
    viewDirPS: viewDirPS$1,
    webgpuPS: webgpuPS$1,
    webgpuVS: webgpuVS$1,
}

var alphaTestPS = `
uniform alpha_ref: f32;
fn alphaTest(a: f32) {
	if (a < uniform.alpha_ref) {
		discard;
	}
}
`

var ambientPS = `
#if LIT_AMBIENT_SOURCE == AMBIENTSH
	uniform ambientSH: array<vec3f, 9>;
#endif
#if LIT_AMBIENT_SOURCE == ENVALATLAS
	#include "envAtlasPS"
	#ifndef ENV_ATLAS
		#define ENV_ATLAS
		var texture_envAtlas: texture_2d<f32>;
		var texture_envAtlasSampler: sampler;
	#endif
#endif
fn addAmbient(worldNormal: vec3f) {
	#ifdef LIT_AMBIENT_SOURCE == AMBIENTSH
		let n: vec3f = cubeMapRotate(worldNormal);
		let color: vec3f =
			uniform.ambientSH[0] +
			uniform.ambientSH[1] * n.x +
			uniform.ambientSH[2] * n.y +
			uniform.ambientSH[3] * n.z +
			uniform.ambientSH[4] * n.x * n.z +
			uniform.ambientSH[5] * n.z * n.y +
			uniform.ambientSH[6] * n.y * n.x +
			uniform.ambientSH[7] * (3.0 * n.z * n.z - 1.0) +
			uniform.ambientSH[8] * (n.x * n.x - n.y * n.y);
		dDiffuseLight += processEnvironment(max(color, vec3f(0.0)));
	#endif
	#if LIT_AMBIENT_SOURCE == ENVALATLAS
		let dir: vec3f = normalize(cubeMapRotate(worldNormal) * vec3f(-1.0, 1.0, 1.0));
		let uv: vec2f = mapUv(toSphericalUv(dir), vec4f(128.0, 256.0 + 128.0, 64.0, 32.0) / atlasSize);
		let raw: vec4f = textureSample(texture_envAtlas, texture_envAtlasSampler, uv);
		let linear: vec3f = {ambientDecode}(raw);
		dDiffuseLight += processEnvironment(linear);
	#endif
	#if LIT_AMBIENT_SOURCE == CONSTANT
		dDiffuseLight += uniform.light_globalAmbient;
	#endif
}
`

var anisotropyPS = `
#ifdef LIT_GGX_SPECULAR
	uniform material_anisotropyIntensity: f32;
	uniform material_anisotropyRotation: vec2f;
#endif
fn getAnisotropy() {
	dAnisotropy = 0.0;
	dAnisotropyRotation = vec2f(1.0, 0.0);
#ifdef LIT_GGX_SPECULAR
	dAnisotropy = uniform.material_anisotropyIntensity;
	dAnisotropyRotation = uniform.material_anisotropyRotation;
#endif
#ifdef STD_ANISOTROPY_TEXTURE
	let anisotropyTex: vec3f = textureSampleBias({STD_ANISOTROPY_TEXTURE_NAME}, {STD_ANISOTROPY_TEXTURE_NAME}Sampler, {STD_ANISOTROPY_TEXTURE_UV}, uniform.textureBias).rgb;
	dAnisotropy *= anisotropyTex.b;
	let anisotropyRotationFromTex: vec2f = anisotropyTex.rg * 2.0 - vec2f(1.0);
	let rotationMatrix: mat2x2f = mat2x2f(dAnisotropyRotation.x, dAnisotropyRotation.y, -dAnisotropyRotation.y, dAnisotropyRotation.x);
	dAnisotropyRotation = rotationMatrix * anisotropyRotationFromTex;
#endif
	dAnisotropy = clamp(dAnisotropy, 0.0, 1.0);
}
`

var aoPS = `
#if defined(STD_AO_TEXTURE) || defined(STD_AO_VERTEX)
	uniform material_aoIntensity: f32;
#endif
#ifdef STD_AODETAIL_TEXTURE
	#include "detailModesPS"
#endif
fn getAO() {
	dAo = 1.0;
	#ifdef STD_AO_TEXTURE
		var aoBase: f32 = textureSampleBias({STD_AO_TEXTURE_NAME}, {STD_AO_TEXTURE_NAME}Sampler, {STD_AO_TEXTURE_UV}, uniform.textureBias).{STD_AO_TEXTURE_CHANNEL};
		#ifdef STD_AODETAIL_TEXTURE
			var aoDetail: f32 = textureSampleBias({STD_AODETAIL_TEXTURE_NAME}, {STD_AODETAIL_TEXTURE_NAME}Sampler, {STD_AODETAIL_TEXTURE_UV}, uniform.textureBias).{STD_AODETAIL_TEXTURE_CHANNEL};
			aoBase = detailMode_{STD_AODETAIL_DETAILMODE}(vec3f(aoBase), vec3f(aoDetail)).r;
		#endif
		dAo = dAo * aoBase;
	#endif
	#ifdef STD_AO_VERTEX
		dAo = dAo * saturate(vVertexColor.{STD_AO_VERTEX_CHANNEL});
	#endif
	#if defined(STD_AO_TEXTURE) || defined(STD_AO_VERTEX)
		dAo = mix(1.0, dAo, uniform.material_aoIntensity);
	#endif
}
`

var aoDiffuseOccPS = `
fn occludeDiffuse(ao: f32) {
	dDiffuseLight = dDiffuseLight * ao;
}
`

var aoSpecOccPS = `
#if LIT_OCCLUDE_SPECULAR != NONE
	#ifdef LIT_OCCLUDE_SPECULAR_FLOAT
		uniform material_occludeSpecularIntensity: f32;
	#endif
#endif
fn occludeSpecular(gloss: f32, ao: f32, worldNormal: vec3f, viewDir: vec3f) {
	#if LIT_OCCLUDE_SPECULAR == AO
		#ifdef LIT_OCCLUDE_SPECULAR_FLOAT
			var specOcc: f32 = mix(1.0, ao, uniform.material_occludeSpecularIntensity);
		#else
			var specOcc: f32 = ao;
		#endif
	#endif
	#if LIT_OCCLUDE_SPECULAR == GLOSSDEPENDENT
		var specPow: f32 = exp2(gloss * 11.0);
		var specOcc: f32 = saturate(pow(dot(worldNormal, viewDir) + ao, 0.01 * specPow) - 1.0 + ao);
		#ifdef LIT_OCCLUDE_SPECULAR_FLOAT
			specOcc = mix(1.0, specOcc, uniform.material_occludeSpecularIntensity);
		#endif
	#endif
	#if LIT_OCCLUDE_SPECULAR != NONE
		dSpecularLight = dSpecularLight * specOcc;
		dReflection = dReflection * specOcc;
		#ifdef LIT_SHEEN
			sSpecularLight = sSpecularLight * specOcc;
			sReflection = sReflection * specOcc;
		#endif
	#endif
}
`

var bakeDirLmEndPS = `
	let dirLm = textureSample(texture_dirLightMap, texture_dirLightMapSampler, vUv1);
	if (uniform.bakeDir > 0.5) {
		if (dAtten > 0.00001) {
			let unpacked_dir = dirLm.xyz * 2.0 - vec3f(1.0);
			dAtten = clamp(dAtten, 0.0, 1.0);
			let combined_dir = dLightDirNormW.xyz * dAtten + unpacked_dir * dirLm.w;
			let finalRgb = normalize(combined_dir) * 0.5 + vec3f(0.5);
			let finalA = max(dirLm.w + dAtten, 1.0 / 255.0);
			output.color = vec4f(finalRgb, finalA);
		} else {
			output.color = dirLm;
		}
	} else {
		let alpha_min = select(0.0, 1.0 / 255.0, dAtten > 0.00001);
		let finalA = max(dirLm.w, alpha_min);
		output.color = vec4f(dirLm.rgb, finalA);
	}
`

var bakeLmEndPS = `
#ifdef LIT_LIGHTMAP_BAKING_ADD_AMBIENT
	dDiffuseLight = ((dDiffuseLight - 0.5) * max(uniform.ambientBakeOcclusionContrast + 1.0, 0.0)) + 0.5;
	dDiffuseLight = dDiffuseLight + vec3f(uniform.ambientBakeOcclusionBrightness);
	dDiffuseLight = saturate3(dDiffuseLight);
	dDiffuseLight = dDiffuseLight * dAmbientLight;
#endif
#ifdef LIGHTMAP_RGBM
	var temp_color_rgbm = vec4f(dDiffuseLight, 1.0);
	temp_color_rgbm = vec4f(pow(temp_color_rgbm.rgb, vec3f(0.5)), temp_color_rgbm.a);
	temp_color_rgbm = vec4f(temp_color_rgbm.rgb / 8.0, temp_color_rgbm.a);
	let max_g_b = max(temp_color_rgbm.g, max(temp_color_rgbm.b, 1.0 / 255.0));
	let max_rgb = max(temp_color_rgbm.r, max_g_b);
	temp_color_rgbm.a = clamp(max_rgb, 0.0, 1.0);
	temp_color_rgbm.a = ceil(temp_color_rgbm.a * 255.0) / 255.0;
	temp_color_rgbm = vec4f(temp_color_rgbm.rgb / temp_color_rgbm.a, temp_color_rgbm.a);
	output.color = temp_color_rgbm;
#else
	output.color = vec4f(dDiffuseLight, 1.0);
#endif
`

var basePS = `
uniform view_position: vec3f;
uniform light_globalAmbient: vec3f;
fn square(x: f32) -> f32 {
	return x*x;
}
fn saturate(x: f32) -> f32 {
	return clamp(x, 0.0, 1.0);
}
fn saturate3(x: vec3f) -> vec3f {
	return clamp(x, vec3f(0.0), vec3f(1.0));
}
`

var baseNineSlicedPS = `
#define NINESLICED
varying vMask: vec2f;
varying vTiledUv: vec2f;
uniform innerOffset: vec4f;
uniform outerScale: vec2f;
uniform atlasRect: vec4f;
var<private> nineSlicedUv: vec2f;
`

var baseNineSlicedTiledPS = `
#define NINESLICED
#define NINESLICETILED
varying vMask: vec2f;
varying vTiledUv: vec2f;
uniform innerOffset: vec4f;
uniform outerScale: vec2f;
uniform atlasRect: vec4f;
var<private> nineSlicedUv: vec2f;
`

var bayerPS = `
fn bayer2(p: vec2f) -> f32 {
	return (2.0 * p.y + p.x + 1.0) % 4.0;
}
fn bayer4(p: vec2f) -> f32 {
	let p1: vec2f = p % vec2f(2.0);
	let p2: vec2f = floor(0.5 * (p % vec2f(4.0)));
	return 4.0 * bayer2(p1) + bayer2(p2);
}
fn bayer8(p: vec2f) -> f32 {
	let p1: vec2f = p % vec2f(2.0);
	let p2: vec2f = floor(0.5 * (p % vec2f(4.0)));
	let p4: vec2f = floor(0.25 * (p % vec2f(8.0)));
	return 4.0 * (4.0 * bayer2(p1) + bayer2(p2)) + bayer2(p4);
}
`

var blurVSMPS = `
varying vUv0: vec2f;
var source: texture_2d<f32>;
var sourceSampler: sampler;
#ifdef GAUSS
	uniform weight: array<f32, {SAMPLES}>;
#endif
uniform pixelOffset: vec2f;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	var output: FragmentOutput;
	var moments: vec3f = vec3f(0.0);
	let uv: vec2f = input.vUv0 - uniform.pixelOffset * (f32({SAMPLES}) * 0.5);
	for (var i: i32 = 0; i < {SAMPLES}; i = i + 1) {
		let c: vec4f = textureSample(source, sourceSampler, uv + uniform.pixelOffset * f32(i));
		#ifdef GAUSS
			moments = moments + c.xyz * uniform.weight[i].element;
		#else
			moments = moments + c.xyz;
		#endif
	}
	#ifndef GAUSS
		moments = moments * (1.0 / f32({SAMPLES}));
	#endif
	output.color = vec4f(moments, 1.0);
	return output;
}
`

var clearCoatPS = `
uniform material_clearCoat: f32;
fn getClearCoat() {
	ccSpecularity = uniform.material_clearCoat;
	#ifdef STD_CLEARCOAT_TEXTURE
	ccSpecularity = ccSpecularity * textureSampleBias({STD_CLEARCOAT_TEXTURE_NAME}, {STD_CLEARCOAT_TEXTURE_NAME}Sampler, {STD_CLEARCOAT_TEXTURE_UV}, uniform.textureBias).{STD_CLEARCOAT_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_CLEARCOAT_VERTEX
	ccSpecularity = ccSpecularity * saturate(vVertexColor.{STD_CLEARCOAT_VERTEX_CHANNEL});
	#endif
}
`

var clearCoatGlossPS = `
	uniform material_clearCoatGloss: f32;
fn getClearCoatGlossiness() {
	ccGlossiness = uniform.material_clearCoatGloss;
	#ifdef STD_CLEARCOATGLOSS_TEXTURE
	ccGlossiness = ccGlossiness * textureSampleBias({STD_CLEARCOATGLOSS_TEXTURE_NAME}, {STD_CLEARCOATGLOSS_TEXTURE_NAME}Sampler, {STD_CLEARCOATGLOSS_TEXTURE_UV}, uniform.textureBias).{STD_CLEARCOATGLOSS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_CLEARCOATGLOSS_VERTEX
	ccGlossiness = ccGlossiness * saturate(vVertexColor.{STD_CLEARCOATGLOSS_VERTEX_CHANNEL});
	#endif
	#ifdef STD_CLEARCOATGLOSS_INVERT
	ccGlossiness = 1.0 - ccGlossiness;
	#endif
	ccGlossiness += 0.0000001;
}
`

var clearCoatNormalPS = `
#ifdef STD_CLEARCOATNORMAL_TEXTURE
	uniform material_clearCoatBumpiness: f32;
#endif
fn getClearCoatNormal() {
#ifdef STD_CLEARCOATNORMAL_TEXTURE
	var normalMap: vec3f = {STD_CLEARCOATNORMAL_TEXTURE_DECODE}(textureSampleBias({STD_CLEARCOATNORMAL_TEXTURE_NAME}, {STD_CLEARCOATNORMAL_TEXTURE_NAME}Sampler, {STD_CLEARCOATNORMAL_TEXTURE_UV}, uniform.textureBias));
	normalMap = mix(vec3f(0.0, 0.0, 1.0), normalMap, uniform.material_clearCoatBumpiness);
	ccNormalW = normalize(dTBN * normalMap);
#else
	ccNormalW = dVertexNormalW;
#endif
}
`

var clusteredLightUtilsPS = `
struct FaceCoords {
	uv: vec2f,
	faceIndex: f32,
	tileOffset: vec2f,
}
fn getCubemapFaceCoordinates(dir: vec3f) -> FaceCoords {
	var faceIndex: f32;
	var tileOffset: vec2f;
	var uv: vec2f;
	let vAbs: vec3f = abs(dir);
	var ma: f32;
	if (vAbs.z >= vAbs.x && vAbs.z >= vAbs.y) {
		let is_neg_z = dir.z < 0.0;
		faceIndex = select(4.0, 5.0, is_neg_z);
		ma = 0.5 / vAbs.z;
		uv = vec2f(select(dir.x, -dir.x, is_neg_z), -dir.y);
		tileOffset = vec2f(2.0, select(0.0, 1.0, is_neg_z));
	} else if (vAbs.y >= vAbs.x) {
		let is_neg_y = dir.y < 0.0;
		faceIndex = select(2.0, 3.0, is_neg_y);
		ma = 0.5 / vAbs.y;
		uv = vec2f(dir.x, select(dir.z, -dir.z, is_neg_y));
		tileOffset = vec2f(1.0, select(0.0, 1.0, is_neg_y));
	} else {
		let is_neg_x = dir.x < 0.0;
		faceIndex = select(0.0, 1.0, is_neg_x);
		ma = 0.5 / vAbs.x;
		uv = vec2f(select(-dir.z, dir.z, is_neg_x), -dir.y);
		tileOffset = vec2f(0.0, select(0.0, 1.0, is_neg_x));
	}
	uv = uv * ma + 0.5;
	return FaceCoords(uv, faceIndex, tileOffset);
}
fn getCubemapAtlasCoordinates(omniAtlasViewport: vec3f, shadowEdgePixels: f32, shadowTextureResolution: f32, dir: vec3f) -> vec2f {
	let faceData: FaceCoords = getCubemapFaceCoordinates(dir);
	var uv: vec2f = faceData.uv;
	let tileOffset: vec2f = faceData.tileOffset;
	let atlasFaceSize: f32 = omniAtlasViewport.z;
	let tileSize: f32 = shadowTextureResolution * atlasFaceSize;
	var offset: f32 = shadowEdgePixels / tileSize;
	uv = uv * (1.0 - offset * 2.0) + offset;
	uv = uv * atlasFaceSize;
	uv = uv + tileOffset * atlasFaceSize;
	uv = uv + omniAtlasViewport.xy;
	return uv;
}
`

var clusteredLightCookiesPS = `
fn _getCookieClustered(tex: texture_2d<f32>, texSampler: sampler, uv: vec2f, intensity: f32, cookieChannel: vec4f) -> vec3f {
	let pixel: vec4f = mix(vec4f(1.0), textureSampleLevel(tex, texSampler, uv, 0.0), intensity);
	let isRgb: bool = dot(cookieChannel.rgb, vec3f(1.0)) == 3.0;
	return select(vec3f(dot(pixel, cookieChannel)), pixel.rgb, isRgb);
}
fn getCookie2DClustered(tex: texture_2d<f32>, texSampler: sampler, transform: mat4x4f, worldPosition: vec3f, intensity: f32, cookieChannel: vec4f) -> vec3f {
	let projPos: vec4f = transform * vec4f(worldPosition, 1.0);
	return _getCookieClustered(tex, texSampler, projPos.xy / projPos.w, intensity, cookieChannel);
}
fn getCookieCubeClustered(tex: texture_2d<f32>, texSampler: sampler, dir: vec3f, intensity: f32, cookieChannel: vec4f, shadowTextureResolution: f32, shadowEdgePixels: f32, omniAtlasViewport: vec3f) -> vec3f {
	let uv: vec2f = getCubemapAtlasCoordinates(omniAtlasViewport, shadowEdgePixels, shadowTextureResolution, dir);
	return _getCookieClustered(tex, texSampler, uv, intensity, cookieChannel);
}
`

var clusteredLightShadowsPS = `
fn _getShadowCoordPerspZbuffer(shadowMatrix: mat4x4f, shadowParams: vec4f, wPos: vec3f) -> vec3f {
	var projPos = shadowMatrix * vec4f(wPos, 1.0);
	return projPos.xyz / projPos.w;
}
fn getShadowCoordPerspZbufferNormalOffset(shadowMatrix: mat4x4f, shadowParams: vec4f, normal: vec3f) -> vec3f {
	let wPos: vec3f = vPositionW + normal * shadowParams.y;
	return _getShadowCoordPerspZbuffer(shadowMatrix, shadowParams, wPos);
}
fn normalOffsetPointShadow(shadowParams: vec4f, lightPos: vec3f, lightDir: vec3f, lightDirNorm: vec3f, normal: vec3f) -> vec3f {
	let distScale: f32 = length(lightDir);
	let wPos: vec3f = vPositionW + normal * shadowParams.y * clamp(1.0 - dot(normal, -lightDirNorm), 0.0, 1.0) * distScale;
	let dir: vec3f = wPos - lightPos;
	return dir;
}
#if defined(CLUSTER_SHADOW_TYPE_PCF1)
	fn getShadowOmniClusteredPCF1(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowParams: vec4f, omniAtlasViewport: vec3f, shadowEdgePixels: f32, lightDir: vec3f) -> f32 {
		let shadowTextureResolution: f32 = shadowParams.x;
		let uv: vec2f = getCubemapAtlasCoordinates(omniAtlasViewport, shadowEdgePixels, shadowTextureResolution, lightDir);
		let shadowZ: f32 = length(lightDir) * shadowParams.w + shadowParams.z;
		return textureSampleCompareLevel(shadowMap, shadowMapSampler, uv, shadowZ);
	}
#endif
#if defined(CLUSTER_SHADOW_TYPE_PCF3)
	fn getShadowOmniClusteredPCF3(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowParams: vec4f, omniAtlasViewport: vec3f, shadowEdgePixels: f32, lightDir: vec3f) -> f32 {
		let shadowTextureResolution: f32 = shadowParams.x;
		let uv: vec2f = getCubemapAtlasCoordinates(omniAtlasViewport, shadowEdgePixels, shadowTextureResolution, lightDir);
		let shadowZ: f32 = length(lightDir) * shadowParams.w + shadowParams.z;
		let shadowCoord: vec3f = vec3f(uv, shadowZ);
		return getShadowPCF3x3(shadowMap, shadowMapSampler, shadowCoord, shadowParams);
	}
#endif
#if defined(CLUSTER_SHADOW_TYPE_PCF5)
	fn getShadowOmniClusteredPCF5(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowParams: vec4f, omniAtlasViewport: vec3f, shadowEdgePixels: f32, lightDir: vec3f) -> f32 {
		let shadowTextureResolution: f32 = shadowParams.x;
		let uv: vec2f = getCubemapAtlasCoordinates(omniAtlasViewport, shadowEdgePixels, shadowTextureResolution, lightDir);
		let shadowZ: f32 = length(lightDir) * shadowParams.w + shadowParams.z;
		let shadowCoord: vec3f = vec3f(uv, shadowZ);
		return getShadowPCF5x5(shadowMap, shadowMapSampler, shadowCoord, shadowParams);
	}
#endif
#if defined(CLUSTER_SHADOW_TYPE_PCF1)
	fn getShadowSpotClusteredPCF1(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
		return textureSampleCompareLevel(shadowMap, shadowMapSampler, shadowCoord.xy, shadowCoord.z);
	}
#endif
	#if defined(CLUSTER_SHADOW_TYPE_PCF3)
	fn getShadowSpotClusteredPCF3(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
		return getShadowSpotPCF3x3(shadowMap, shadowMapSampler, shadowCoord, shadowParams);
	}
#endif
	#if defined(CLUSTER_SHADOW_TYPE_PCF5)
	fn getShadowSpotClusteredPCF5(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
		return getShadowPCF5x5(shadowMap, shadowMapSampler, shadowCoord, shadowParams);
	}
#endif
`

var clusteredLightPS = `
#include "lightBufferDefinesPS"
#include "clusteredLightUtilsPS"
#ifdef CLUSTER_COOKIES
	#include "clusteredLightCookiesPS"
#endif
#ifdef CLUSTER_SHADOWS
	#include "clusteredLightShadowsPS"
#endif
var clusterWorldTexture: texture_2d<u32>;
var lightsTexture: texture_2d<uff>;
#ifdef CLUSTER_SHADOWS
	var shadowAtlasTexture: texture_depth_2d;
	var shadowAtlasTextureSampler: sampler_comparison;
#endif
#ifdef CLUSTER_COOKIES
	var cookieAtlasTexture: texture_2d<f32>;
	var cookieAtlasTextureSampler: sampler;
#endif
uniform clusterMaxCells: i32;
uniform numClusteredLights: i32;
uniform clusterTextureWidth: i32;
uniform clusterCellsCountByBoundsSize: vec3f;
uniform clusterBoundsMin: vec3f;
uniform clusterBoundsDelta: vec3f;
uniform clusterCellsDot: vec3i;
uniform clusterCellsMax: vec3i;
uniform shadowAtlasParams: vec2f;
struct ClusterLightData {
	flags: u32,
	halfWidth: vec3f,
	isSpot: bool,
	halfHeight: vec3f,
	lightIndex: i32,
	position: vec3f,
	shape: u32,
	direction: vec3f,
	falloffModeLinear: bool,
	color: vec3f,
	shadowIntensity: f32,
	omniAtlasViewport: vec3f,
	range: f32,
	cookieChannelMask: vec4f,
	biasesData: f32,
	colorBFlagsData: u32,
	shadowBias: f32,
	shadowNormalBias: f32,
	anglesData: f32,
	innerConeAngleCos: f32,
	outerConeAngleCos: f32,
	cookieIntensity: f32,
	isDynamic: bool,
	isLightmapped: bool
}
var<private> lightProjectionMatrix: mat4x4f;
fn sampleLightTextureF(lightIndex: i32, index: i32) -> vec4f {
	return textureLoad(lightsTexture, vec2<i32>(index, lightIndex), 0);
}
fn decodeClusterLightCore(clusterLightData: ptr<function, ClusterLightData>, lightIndex: i32) {
	clusterLightData.lightIndex = lightIndex;
	let halfData: vec4f = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_COLOR_ANGLES_BIAS});
	clusterLightData.anglesData = halfData.z;
	clusterLightData.biasesData = halfData.w;
	clusterLightData.colorBFlagsData = bitcast<u32>(halfData.y);
	let colorRG: vec2f = unpack2x16float(bitcast<u32>(halfData.x));
	let colorB_flags: vec2f = unpack2x16float(clusterLightData.colorBFlagsData);
	clusterLightData.color = vec3f(colorRG, colorB_flags.x) * {LIGHT_COLOR_DIVIDER};
	let lightPosRange: vec4f = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_POSITION_RANGE});
	clusterLightData.position = lightPosRange.xyz;
	clusterLightData.range = lightPosRange.w;
	let lightDir_Flags: vec4f = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_DIRECTION_FLAGS});
	clusterLightData.direction = lightDir_Flags.xyz;
	let flags_uint: u32 = bitcast<u32>(lightDir_Flags.w);
	clusterLightData.flags = flags_uint;
	clusterLightData.isSpot = (flags_uint & (1u << 30u)) != 0u;
	clusterLightData.shape = (flags_uint >> 28u) & 0x3u;
	clusterLightData.falloffModeLinear = (flags_uint & (1u << 27u)) == 0u;
	clusterLightData.shadowIntensity = f32((flags_uint >> 0u) & 0xFFu) / 255.0;
	clusterLightData.cookieIntensity = f32((flags_uint >> 8u) & 0xFFu) / 255.0;
	clusterLightData.isDynamic = (flags_uint & (1u << 22u)) != 0u;
	clusterLightData.isLightmapped = (flags_uint & (1u << 21u)) != 0u;
}
fn decodeClusterLightSpot(clusterLightData: ptr<function, ClusterLightData>) {
	let angleFlags: u32 = (clusterLightData.colorBFlagsData >> 16u) & 0xFFFFu;
	let angleValues: vec2f = unpack2x16float(bitcast<u32>(clusterLightData.anglesData));
	let innerVal: f32 = angleValues.x;
	let outerVal: f32 = angleValues.y;
	let innerIsVersine: bool = (angleFlags & 1u) != 0u;
	let outerIsVersine: bool = ((angleFlags >> 1u) & 1u) != 0u;
	clusterLightData.innerConeAngleCos = select(innerVal, 1.0 - innerVal, innerIsVersine);
	clusterLightData.outerConeAngleCos = select(outerVal, 1.0 - outerVal, outerIsVersine);
}
fn decodeClusterLightOmniAtlasViewport(clusterLightData: ptr<function, ClusterLightData>) {
	clusterLightData.omniAtlasViewport = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_PROJ_MAT_0}).xyz;
}
fn decodeClusterLightAreaData(clusterLightData: ptr<function, ClusterLightData>) {
	clusterLightData.halfWidth = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_AREA_DATA_WIDTH}).xyz;
	clusterLightData.halfHeight = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_AREA_DATA_HEIGHT}).xyz;
}
fn decodeClusterLightProjectionMatrixData(clusterLightData: ptr<function, ClusterLightData>) {
	let m0: vec4f = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_PROJ_MAT_0});
	let m1: vec4f = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_PROJ_MAT_1});
	let m2: vec4f = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_PROJ_MAT_2});
	let m3: vec4f = sampleLightTextureF(clusterLightData.lightIndex, {CLUSTER_TEXTURE_PROJ_MAT_3});
	lightProjectionMatrix = mat4x4f(m0, m1, m2, m3);
}
fn decodeClusterLightShadowData(clusterLightData: ptr<function, ClusterLightData>) {
	let biases: vec2f = unpack2x16float(bitcast<u32>(clusterLightData.biasesData));
	clusterLightData.shadowBias = biases.x;
	clusterLightData.shadowNormalBias = biases.y;
}
fn decodeClusterLightCookieData(clusterLightData: ptr<function, ClusterLightData>) {
	let cookieFlags: u32 = (clusterLightData.flags >> 23u) & 0x0Fu;
	let mask_uvec: vec4<u32> = vec4<u32>(cookieFlags) & vec4<u32>(1u, 2u, 4u, 8u);
	clusterLightData.cookieChannelMask = step(vec4f(1.0), vec4f(mask_uvec));
}
fn evaluateLight(
	light: ptr<function, ClusterLightData>,
	worldNormal: vec3f,
	viewDir: vec3f,
	reflectionDir: vec3f,
#if defined(LIT_CLEARCOAT)
	clearcoatReflectionDir: vec3f,
#endif
	gloss: f32,
	specularity: vec3f,
	geometricNormal: vec3f,
	tbn: mat3x3f,
#if defined(LIT_IRIDESCENCE)
	iridescenceFresnel: vec3f,
#endif
	clearcoat_worldNormal: vec3f,
	clearcoat_gloss: f32,
	sheen_gloss: f32,
	iridescence_intensity: f32
) {
	var cookieAttenuation: vec3f = vec3f(1.0);
	var diffuseAttenuation: f32 = 1.0;
	var falloffAttenuation: f32 = 1.0;
	let lightDirW: vec3f = evalOmniLight(light.position);
	let lightDirNormW: vec3f = normalize(lightDirW);
	#ifdef CLUSTER_AREALIGHTS
	if (light.shape != {LIGHTSHAPE_PUNCTUAL}) {
		decodeClusterLightAreaData(light);
		if (light.shape == {LIGHTSHAPE_RECT}) {
			calcRectLightValues(light.position, light.halfWidth, light.halfHeight);
		} else if (light.shape == {LIGHTSHAPE_DISK}) {
			calcDiskLightValues(light.position, light.halfWidth, light.halfHeight);
		} else {
			calcSphereLightValues(light.position, light.halfWidth, light.halfHeight);
		}
		falloffAttenuation = getFalloffWindow(light.range, lightDirW);
	} else
	#endif
	{
		if (light.falloffModeLinear) {
			falloffAttenuation = getFalloffLinear(light.range, lightDirW);
		} else {
			falloffAttenuation = getFalloffInvSquared(light.range, lightDirW);
		}
	}
	if (falloffAttenuation > 0.00001) {
		#ifdef CLUSTER_AREALIGHTS
		if (light.shape != {LIGHTSHAPE_PUNCTUAL}) {
			if (light.shape == {LIGHTSHAPE_RECT}) {
				diffuseAttenuation = getRectLightDiffuse(worldNormal, viewDir, lightDirW, lightDirNormW) * 16.0;
			} else if (light.shape == {LIGHTSHAPE_DISK}) {
				diffuseAttenuation = getDiskLightDiffuse(worldNormal, viewDir, lightDirW, lightDirNormW) * 16.0;
			} else {
				diffuseAttenuation = getSphereLightDiffuse(worldNormal, viewDir, lightDirW, lightDirNormW) * 16.0;
			}
		} else
		#endif
		{
			falloffAttenuation = falloffAttenuation * getLightDiffuse(worldNormal, viewDir, lightDirNormW);
		}
		if (light.isSpot) {
			decodeClusterLightSpot(light);
			falloffAttenuation = falloffAttenuation * getSpotEffect(light.direction, light.innerConeAngleCos, light.outerConeAngleCos, lightDirNormW);
		}
		#if defined(CLUSTER_COOKIES) || defined(CLUSTER_SHADOWS)
		if (falloffAttenuation > 0.00001) {
			if (light.shadowIntensity > 0.0 || light.cookieIntensity > 0.0) {
				if (light.isSpot) {
					decodeClusterLightProjectionMatrixData(light);
				} else {
					decodeClusterLightOmniAtlasViewport(light);
				}
				let shadowTextureResolution: f32 = uniform.shadowAtlasParams.x;
				let shadowEdgePixels: f32 = uniform.shadowAtlasParams.y;
				#ifdef CLUSTER_COOKIES
				if (light.cookieIntensity > 0.0) {
					decodeClusterLightCookieData(light);
					if (light.isSpot) {
						cookieAttenuation = getCookie2DClustered(cookieAtlasTexture, cookieAtlasTextureSampler, lightProjectionMatrix, vPositionW, light.cookieIntensity, light.cookieChannelMask);
					} else {
						cookieAttenuation = getCookieCubeClustered(cookieAtlasTexture, cookieAtlasTextureSampler, lightDirW, light.cookieIntensity, light.cookieChannelMask, shadowTextureResolution, shadowEdgePixels, light.omniAtlasViewport);
					}
				}
				#endif
				#ifdef CLUSTER_SHADOWS
				if (light.shadowIntensity > 0.0) {
					decodeClusterLightShadowData(light);
					let shadowParams: vec4f = vec4f(shadowTextureResolution, light.shadowNormalBias, light.shadowBias, 1.0 / light.range);
					if (light.isSpot) {
						let shadowCoord: vec3f = getShadowCoordPerspZbufferNormalOffset(lightProjectionMatrix, shadowParams, geometricNormal);
						#if defined(CLUSTER_SHADOW_TYPE_PCF1)
							let shadow: f32 = getShadowSpotClusteredPCF1(shadowAtlasTexture, shadowAtlasTextureSampler, shadowCoord, shadowParams);
						#elif defined(CLUSTER_SHADOW_TYPE_PCF3)
							let shadow: f32 = getShadowSpotClusteredPCF3(shadowAtlasTexture, shadowAtlasTextureSampler, shadowCoord, shadowParams);
						#elif defined(CLUSTER_SHADOW_TYPE_PCF5)
							let shadow: f32 = getShadowSpotClusteredPCF5(shadowAtlasTexture, shadowAtlasTextureSampler, shadowCoord, shadowParams);
						#elif defined(CLUSTER_SHADOW_TYPE_PCSS)
							let shadow: f32 = getShadowSpotClusteredPCSS(shadowAtlasTexture, shadowAtlasTextureSampler, shadowCoord, shadowParams);
						#endif
						falloffAttenuation = falloffAttenuation * mix(1.0, shadow, light.shadowIntensity);
					} else {
						let dir: vec3f = normalOffsetPointShadow(shadowParams, light.position, lightDirW, lightDirNormW, geometricNormal);
						#if defined(CLUSTER_SHADOW_TYPE_PCF1)
							let shadow: f32 = getShadowOmniClusteredPCF1(shadowAtlasTexture, shadowAtlasTextureSampler, shadowParams, light.omniAtlasViewport, shadowEdgePixels, dir);
						#elif defined(CLUSTER_SHADOW_TYPE_PCF3)
							let shadow: f32 = getShadowOmniClusteredPCF3(shadowAtlasTexture, shadowAtlasTextureSampler, shadowParams, light.omniAtlasViewport, shadowEdgePixels, dir);
						#elif defined(CLUSTER_SHADOW_TYPE_PCF5)
							let shadow: f32 = getShadowOmniClusteredPCF5(shadowAtlasTexture, shadowAtlasTextureSampler, shadowParams, light.omniAtlasViewport, shadowEdgePixels, dir);
						#endif
						falloffAttenuation = falloffAttenuation * mix(1.0, shadow, light.shadowIntensity);
					}
				}
				#endif
			}
		}
		#endif
		#ifdef CLUSTER_AREALIGHTS
		if (light.shape != {LIGHTSHAPE_PUNCTUAL}) {
			{
				var areaDiffuse: vec3f = (diffuseAttenuation * falloffAttenuation) * light.color * cookieAttenuation;
				#if defined(LIT_SPECULAR)
					areaDiffuse = mix(areaDiffuse, vec3f(0.0), dLTCSpecFres);
				#endif
				dDiffuseLight = dDiffuseLight + areaDiffuse;
			}
			#ifdef LIT_SPECULAR
				var areaLightSpecular: f32;
				if (light.shape == {LIGHTSHAPE_RECT}) {
					areaLightSpecular = getRectLightSpecular(worldNormal, viewDir);
				} else if (light.shape == {LIGHTSHAPE_DISK}) {
					areaLightSpecular = getDiskLightSpecular(worldNormal, viewDir);
				} else {
					areaLightSpecular = getSphereLightSpecular(worldNormal, viewDir);
				}
				dSpecularLight = dSpecularLight + dLTCSpecFres * areaLightSpecular * falloffAttenuation * light.color * cookieAttenuation;
				#ifdef LIT_CLEARCOAT
					var areaLightSpecularCC: f32;
					if (light.shape == {LIGHTSHAPE_RECT}) {
						areaLightSpecularCC = getRectLightSpecular(clearcoat_worldNormal, viewDir);
					} else if (light.shape == {LIGHTSHAPE_DISK}) {
						areaLightSpecularCC = getDiskLightSpecular(clearcoat_worldNormal, viewDir);
					} else {
						areaLightSpecularCC = getSphereLightSpecular(clearcoat_worldNormal, viewDir);
					}
					ccSpecularLight = ccSpecularLight + ccLTCSpecFres * areaLightSpecularCC * falloffAttenuation * light.color  * cookieAttenuation;
				#endif
			#endif
		} else
		#endif
		{
			{
				var punctualDiffuse: vec3f = falloffAttenuation * light.color * cookieAttenuation;
				#if defined(CLUSTER_AREALIGHTS)
				#if defined(LIT_SPECULAR)
					punctualDiffuse = mix(punctualDiffuse, vec3f(0.0), specularity);
				#endif
				#endif
				dDiffuseLight = dDiffuseLight + punctualDiffuse;
			}
			#ifdef LIT_SPECULAR
				let halfDir: vec3f = normalize(-lightDirNormW + viewDir);
				#ifdef LIT_SPECULAR_FRESNEL
					dSpecularLight = dSpecularLight +
						getLightSpecular(halfDir, reflectionDir, worldNormal, viewDir, lightDirNormW, gloss, tbn) * falloffAttenuation * light.color * cookieAttenuation *
						getFresnel(
							dot(viewDir, halfDir),
							gloss,
							specularity
						#if defined(LIT_IRIDESCENCE)
							, iridescenceFresnel,
							iridescence_intensity
						#endif
							);
				#else
					dSpecularLight = dSpecularLight + getLightSpecular(halfDir, reflectionDir, worldNormal, viewDir, lightDirNormW, gloss, tbn) * falloffAttenuation * light.color * cookieAttenuation * specularity;
				#endif
				#ifdef LIT_CLEARCOAT
					#ifdef LIT_SPECULAR_FRESNEL
						ccSpecularLight = ccSpecularLight + getLightSpecular(halfDir, clearcoatReflectionDir, clearcoat_worldNormal, viewDir, lightDirNormW, clearcoat_gloss, tbn) * falloffAttenuation * light.color * cookieAttenuation * getFresnelCC(dot(viewDir, halfDir));
					#else
						ccSpecularLight = ccSpecularLight + getLightSpecular(halfDir, clearcoatReflectionDir, clearcoat_worldNormal, viewDir, lightDirNormW, clearcoat_gloss, tbn) * falloffAttenuation * light.color * cookieAttenuation;
					#endif
				#endif
				#ifdef LIT_SHEEN
					sSpecularLight = sSpecularLight + getLightSpecularSheen(halfDir, worldNormal, viewDir, lightDirNormW, sheen_gloss) * falloffAttenuation * light.color * cookieAttenuation;
				#endif
			#endif
		}
	}
	dAtten = falloffAttenuation;
	dLightDirNormW = lightDirNormW;
}
fn evaluateClusterLight(
	lightIndex: i32,
	worldNormal: vec3f,
	viewDir: vec3f,
	reflectionDir: vec3f,
#if defined(LIT_CLEARCOAT)
	clearcoatReflectionDir: vec3f,
#endif
	gloss: f32,
	specularity: vec3f,
	geometricNormal: vec3f,
	tbn: mat3x3f,
#if defined(LIT_IRIDESCENCE)
	iridescenceFresnel: vec3f,
#endif
	clearcoat_worldNormal: vec3f,
	clearcoat_gloss: f32,
	sheen_gloss: f32,
	iridescence_intensity: f32
) {
	var clusterLightData: ClusterLightData;
	decodeClusterLightCore(&clusterLightData, lightIndex);
	#ifdef CLUSTER_MESH_DYNAMIC_LIGHTS
		let acceptLightMask: bool = clusterLightData.isDynamic;
	#else
		let acceptLightMask: bool = clusterLightData.isLightmapped;
	#endif
	if (acceptLightMask) {
		evaluateLight(
			&clusterLightData,
			worldNormal,
			viewDir,
			reflectionDir,
#if defined(LIT_CLEARCOAT)
			clearcoatReflectionDir,
#endif
			gloss,
			specularity,
			geometricNormal,
			tbn,
#if defined(LIT_IRIDESCENCE)
			iridescenceFresnel,
#endif
			clearcoat_worldNormal,
			clearcoat_gloss,
			sheen_gloss,
			iridescence_intensity
		);
	}
}
fn addClusteredLights(
	worldNormal: vec3f,
	viewDir: vec3f,
	reflectionDir: vec3f,
#if defined(LIT_CLEARCOAT)
	clearcoatReflectionDir: vec3f,
#endif
	gloss: f32,
	specularity: vec3f,
	geometricNormal: vec3f,
	tbn: mat3x3f,
#if defined(LIT_IRIDESCENCE)
	iridescenceFresnel: vec3f,
#endif
	clearcoat_worldNormal: vec3f,
	clearcoat_gloss: f32,
	sheen_gloss: f32,
	iridescence_intensity: f32
) {
	if (uniform.numClusteredLights <= 1) {
		return;
	}
	let cellCoords: vec3i = vec3i(floor((vPositionW - uniform.clusterBoundsMin) * uniform.clusterCellsCountByBoundsSize));
	if (!(any(cellCoords < vec3i(0)) || any(cellCoords >= uniform.clusterCellsMax))) {
		let cellIndex: i32 = cellCoords.x * uniform.clusterCellsDot.x + cellCoords.y * uniform.clusterCellsDot.y + cellCoords.z * uniform.clusterCellsDot.z;
		let clusterV: i32 = cellIndex / uniform.clusterTextureWidth;
		let clusterU: i32 = cellIndex - clusterV * uniform.clusterTextureWidth;
		for (var lightCellIndex: i32 = 0; lightCellIndex < uniform.clusterMaxCells; lightCellIndex = lightCellIndex + 1) {
			let lightIndex: u32 = textureLoad(clusterWorldTexture, vec2<i32>(clusterU + lightCellIndex, clusterV), 0).r;
			if (lightIndex == 0u) {
				break;
			}
			evaluateClusterLight(
				i32(lightIndex),
				worldNormal,
				viewDir,
				reflectionDir,
#if defined(LIT_CLEARCOAT)
				clearcoatReflectionDir,
#endif
				gloss,
				specularity,
				geometricNormal,
				tbn,
#if defined(LIT_IRIDESCENCE)
				iridescenceFresnel,
#endif
				clearcoat_worldNormal,
				clearcoat_gloss,
				sheen_gloss,
				iridescence_intensity
			);
		}
	}
}`

var combinePS = `
fn combineColor(albedo: vec3f, sheenSpecularity: vec3f, clearcoatSpecularity: f32) -> vec3f {
	var ret: vec3f = vec3f(0.0);
	#ifdef LIT_OLD_AMBIENT
		ret = ret + ((dDiffuseLight - uniform.light_globalAmbient) * albedo + uniform.material_ambient * uniform.light_globalAmbient);
	#else
		ret = ret + (albedo * dDiffuseLight);
	#endif
	#ifdef LIT_SPECULAR
		ret = ret + dSpecularLight;
	#endif
	#ifdef LIT_REFLECTIONS
		ret = ret + (dReflection.rgb * dReflection.a);
	#endif
	#ifdef LIT_SHEEN
		let sheenScaling: f32 = 1.0 - max(max(sheenSpecularity.r, sheenSpecularity.g), sheenSpecularity.b) * 0.157;
		ret = ret * sheenScaling + (sSpecularLight + sReflection.rgb) * sheenSpecularity;
	#endif
	#ifdef LIT_CLEARCOAT
		let clearCoatScaling: f32 = 1.0 - ccFresnel * clearcoatSpecularity;
		ret = ret * clearCoatScaling + (ccSpecularLight + ccReflection) * clearcoatSpecularity;
	#endif
	return ret;
}
`

var cookieBlit2DPS = `
	varying uv0: vec2f;
	var blitTexture: texture_2d<f32>;
	var blitTextureSampler : sampler;
	@fragment
	fn fragmentMain(input : FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		output.color = textureSample(blitTexture, blitTextureSampler, input.uv0);
		return output;
	}
`

var cookieBlitCubePS = `
	varying uv0: vec2f;
	uniform invViewProj: mat4x4<f32>;
	var blitTexture: texture_cube<f32>;
	var blitTextureSampler : sampler;
	@fragment
	fn fragmentMain(input : FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		var projPos = vec4f(input.uv0 * 2.0 - 1.0, 0.5, 1.0);
		var worldPos = uniform.invViewProj * projPos;
		output.color = textureSample(blitTexture, blitTextureSampler, worldPos.xyz);
		return output;
	}
`

var cookieBlitVS = `
	attribute vertex_position: vec2f;
	varying uv0: vec2f;
	@vertex
	fn vertexMain(input: VertexInput) -> VertexOutput {
		var output: VertexOutput;
		output.position = vec4f(input.vertex_position, 0.5, 1.0);
		output.uv0 = input.vertex_position * 0.5 + vec2f(0.5, 0.5);
		output.uv0.y = 1.0 - output.uv0.y;
		return output;
	}
`

var cubeMapProjectPS = `
#if LIT_CUBEMAP_PROJECTION == BOX
	uniform envBoxMin: vec3f;
	uniform envBoxMax: vec3f;
#endif
fn cubeMapProject(nrdir: vec3f) -> vec3f {
	#if LIT_CUBEMAP_PROJECTION == NONE
		return cubeMapRotate(nrdir);
	#endif
	#if LIT_CUBEMAP_PROJECTION == BOX
		let nrdir_rotated: vec3f = cubeMapRotate(nrdir);
		let rbmax: vec3f = (uniform.envBoxMax - vPositionW) / nrdir_rotated;
		let rbmin: vec3f = (uniform.envBoxMin - vPositionW) / nrdir_rotated;
		let rbminmax: vec3f = select(rbmin, rbmax, nrdir_rotated > vec3f(0.0));
		let fa: f32 = min(min(rbminmax.x, rbminmax.y), rbminmax.z);
		let posonbox: vec3f = vPositionW + nrdir_rotated * fa;
		let envBoxPos: vec3f = (uniform.envBoxMin + uniform.envBoxMax) * 0.5;
		return normalize(posonbox - envBoxPos);
	#endif
}
`

var cubeMapRotatePS = `
#ifdef CUBEMAP_ROTATION
uniform cubeMapRotationMatrix: mat3x3f;
#endif
fn cubeMapRotate(refDir: vec3f) -> vec3f {
#ifdef CUBEMAP_ROTATION
	return refDir * uniform.cubeMapRotationMatrix;
#else
	return refDir;
#endif
}
`

var debugOutputPS = `
#ifdef DEBUG_ALBEDO_PASS
output.color = vec4(gammaCorrectOutput(dAlbedo), 1.0);
#endif
#ifdef DEBUG_UV0_PASS
output.color = vec4f(litArgs_albedo , 1.0);
#endif
#ifdef DEBUG_WORLD_NORMAL_PASS
output.color = vec4f(litArgs_worldNormal * 0.5 + 0.5, 1.0);
#endif
#ifdef DEBUG_OPACITY_PASS
output.color = vec4f(vec3f(litArgs_opacity) , 1.0);
#endif
#ifdef DEBUG_SPECULARITY_PASS
output.color = vec4f(litArgs_specularity, 1.0);
#endif
#ifdef DEBUG_GLOSS_PASS
output.color = vec4f(vec3f(litArgs_gloss) , 1.0);
#endif
#ifdef DEBUG_METALNESS_PASS
output.color = vec4f(vec3f(litArgs_metalness) , 1.0);
#endif
#ifdef DEBUG_AO_PASS
output.color = vec4f(vec3f(litArgs_ao) , 1.0);
#endif
#ifdef DEBUG_EMISSION_PASS
output.color = vec4f(gammaCorrectOutput(litArgs_emission), 1.0);
#endif
`

var debugProcessFrontendPS = `
#ifdef DEBUG_LIGHTING_PASS
	litArgs_albedo = vec3f(0.5);
#endif
#ifdef DEBUG_UV0_PASS
#ifdef VARYING_VUV0
	litArgs_albedo = vec3f(vUv0, 0.0);
#else
	litArgs_albedo = vec3f(0.0);
#endif
#endif
`

var decodePS = `
#ifndef _DECODE_INCLUDED_
#define _DECODE_INCLUDED_
fn decodeLinear(raw: vec4f) -> vec3f {
	return raw.rgb;
}
fn decodeGammaFloat(raw: f32) -> f32 {
	return pow(raw, 2.2);
}
fn decodeGamma3(raw: vec3f) -> vec3f {
	return pow(raw, vec3f(2.2));
}
fn decodeGamma(raw: vec4f) -> vec3f {
	return pow(raw.xyz, vec3f(2.2));
}
fn decodeRGBM(raw: vec4f) -> vec3f {
	let color = (8.0 * raw.a) * raw.rgb;
	return color * color;
}
fn decodeRGBP(raw: vec4f) -> vec3f {
	let color = raw.rgb * (-raw.a * 7.0 + 8.0);
	return color * color;
}
fn decodeRGBE(raw: vec4f) -> vec3f {
	return select(vec3f(0.0), raw.xyz * pow(2.0, raw.w * 255.0 - 128.0), raw.a != 0.0);
}
fn passThrough(raw: vec4f) -> vec4f {
	return raw;
}
fn unpackNormalXYZ(nmap: vec4f) -> vec3f {
	return nmap.xyz * 2.0 - 1.0;
}
fn unpackNormalXY(nmap: vec4f) -> vec3f {
	var xy = nmap.wy * 2.0 - 1.0;
	return vec3f(xy, sqrt(1.0 - clamp(dot(xy, xy), 0.0, 1.0)));
}
#endif
`

var detailModesPS = `
#ifndef _DETAILMODES_INCLUDED_
#define _DETAILMODES_INCLUDED_
fn detailMode_mul(c1: vec3f, c2: vec3f) -> vec3f {
	return c1 * c2;
}
fn detailMode_add(c1: vec3f, c2: vec3f) -> vec3f {
	return c1 + c2;
}
fn detailMode_screen(c1: vec3f, c2: vec3f) -> vec3f {
	return 1.0 - (1.0 - c1)*(1.0 - c2);
}
fn detailMode_overlay(c1: vec3f, c2: vec3f) -> vec3f {
	return mix(1.0 - 2.0 * (1.0 - c1)*(1.0 - c2), 2.0 * c1 * c2, step(c1, vec3f(0.5)));
}
fn detailMode_min(c1: vec3f, c2: vec3f) -> vec3f {
	return min(c1, c2);
}
fn detailMode_max(c1: vec3f, c2: vec3f) -> vec3f {
	return max(c1, c2);
}
#endif
`

var diffusePS = `
uniform material_diffuse: vec3f;
#ifdef STD_DIFFUSEDETAIL_TEXTURE
	#include "detailModesPS"
#endif
fn getAlbedo() {
	dAlbedo = uniform.material_diffuse.rgb;
	#ifdef STD_DIFFUSE_TEXTURE
		var albedoTexture: vec3f = {STD_DIFFUSE_TEXTURE_DECODE}(textureSampleBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_NAME}Sampler, {STD_DIFFUSE_TEXTURE_UV}, uniform.textureBias)).{STD_DIFFUSE_TEXTURE_CHANNEL};
		#ifdef STD_DIFFUSEDETAIL_TEXTURE
			var albedoDetail: vec3f = {STD_DIFFUSEDETAIL_TEXTURE_DECODE}(textureSampleBias({STD_DIFFUSEDETAIL_TEXTURE_NAME}, {STD_DIFFUSEDETAIL_TEXTURE_NAME}Sampler, {STD_DIFFUSEDETAIL_TEXTURE_UV}, uniform.textureBias)).{STD_DIFFUSEDETAIL_TEXTURE_CHANNEL};
			albedoTexture = detailMode_{STD_DIFFUSEDETAIL_DETAILMODE}(albedoTexture, albedoDetail);
		#endif
		dAlbedo = dAlbedo * albedoTexture;
	#endif
	#ifdef STD_DIFFUSE_VERTEX
		dAlbedo = dAlbedo * saturate3(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});
	#endif
}
`

var emissivePS = `
uniform material_emissive: vec3f;
uniform material_emissiveIntensity: f32;
fn getEmission() {
	dEmission = uniform.material_emissive * uniform.material_emissiveIntensity;
	#ifdef STD_EMISSIVE_TEXTURE
	dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(textureSampleBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_NAME}Sampler, {STD_EMISSIVE_TEXTURE_UV}, uniform.textureBias)).{STD_EMISSIVE_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_EMISSIVE_VERTEX
	dEmission = dEmission * saturate3(vVertexColor.{STD_EMISSIVE_VERTEX_CHANNEL});
	#endif
}
`

var encodePS = `
fn encodeLinear(source: vec3f) -> vec4f {
	return vec4f(source, 1.0);
}
fn encodeGamma(source: vec3f) -> vec4f {
	return vec4f(pow(source + vec3f(0.0000001), vec3f(1.0 / 2.2)), 1.0);
}
fn encodeRGBM(source: vec3f) -> vec4f {
	var color: vec3f = pow(source, vec3f(0.5));
	color *= 1.0 / 8.0;
	var a: f32 = saturate(max(max(color.r, color.g), max(color.b, 1.0 / 255.0)));
	a = ceil(a * 255.0) / 255.0;
	color /= a;
	return vec4f(color, a);
}
fn encodeRGBP(source: vec3f) -> vec4f {
	var gamma: vec3f = pow(source, vec3f(0.5));
	var maxVal: f32 = min(8.0, max(1.0, max(gamma.x, max(gamma.y, gamma.z))));
	var v: f32 = 1.0 - ((maxVal - 1.0) / 7.0);
	v = ceil(v * 255.0) / 255.0;
	return vec4f(gamma / (-v * 7.0 + 8.0), v);
}
fn encodeRGBE(source: vec3f) -> vec4f {
	var maxVal: f32 = max(source.x, max(source.y, source.z));
	if (maxVal < 1e-32) {
		return vec4f(0.0, 0.0, 0.0, 0.0);
	} else {
		var e: f32 = ceil(log2(maxVal));
		return vec4f(source / pow(2.0, e), (e + 128.0) / 255.0);
	}
}
`

var endPS = `
	var finalRgb: vec3f = combineColor(litArgs_albedo, litArgs_sheen_specularity, litArgs_clearcoat_specularity);
	finalRgb = finalRgb + litArgs_emission;
	finalRgb = addFog(finalRgb);
	finalRgb = toneMap(finalRgb);
	finalRgb = gammaCorrectOutput(finalRgb);
	output.color = vec4f(finalRgb, output.color.a);
`

var envAtlasPS = `
#ifndef _ENVATLAS_INCLUDED_
#define _ENVATLAS_INCLUDED_
const atlasSize : f32 = 512.0;
const seamSize : f32 = 1.0 / atlasSize;
fn mapUv(uv : vec2f, rect : vec4f) -> vec2f {
	return vec2f(mix(rect.x + seamSize, rect.x + rect.z - seamSize, uv.x),
				 mix(rect.y + seamSize, rect.y + rect.w - seamSize, uv.y));
}
fn mapRoughnessUv(uv : vec2f, level : f32) -> vec2f {
	let t : f32 = 1.0 / exp2(level);
	return mapUv(uv, vec4f(0.0, 1.0 - t, t, t * 0.5));
}
fn mapShinyUv(uv : vec2f, level : f32) -> vec2f {
	let t : f32 = 1.0 / exp2(level);
	return mapUv(uv, vec4f(1.0 - t, 1.0 - t, t, t * 0.5));
}
#endif
`

var envProcPS = `
#ifdef LIT_SKYBOX_INTENSITY
	uniform skyboxIntensity : f32;
#endif
fn processEnvironment(color : vec3f) -> vec3f {
	#ifdef LIT_SKYBOX_INTENSITY
		return color * uniform.skyboxIntensity;
	#else
		return color;
	#endif
}
`

var falloffInvSquaredPS = `
fn getFalloffWindow(lightRadius: f32, lightDir: vec3f) -> f32 {
	let sqrDist: f32 = dot(lightDir, lightDir);
	let invRadius: f32 = 1.0 / lightRadius;
	return square(saturate(1.0 - square(sqrDist * square(invRadius))));
}
fn getFalloffInvSquared(lightRadius: f32, lightDir: vec3f) -> f32 {
	let sqrDist: f32 = dot(lightDir, lightDir);
	var falloff: f32 = 1.0 / (sqrDist + 1.0);
	let invRadius: f32 = 1.0 / lightRadius;
	falloff = falloff * 16.0;
	falloff = falloff * square(saturate(1.0 - square(sqrDist * square(invRadius))));
	return falloff;
}
`

var falloffLinearPS = `
fn getFalloffLinear(lightRadius: f32, lightDir: vec3f) -> f32 {
	let d: f32 = length(lightDir);
	return max(((lightRadius - d) / lightRadius), 0.0);
}
`

var floatAsUintPS = `
#ifndef FLOAT_AS_UINT
#define FLOAT_AS_UINT
fn float2uint(value: f32) -> vec4f {
	let intBits = bitcast<u32>(value);
	return vec4f(
		f32((intBits >> 24u) & 0xffu),
		f32((intBits >> 16u) & 0xffu),
		f32((intBits >> 8u) & 0xffu),
		f32(intBits & 0xffu)
	) / 255.0;
}
fn uint2float(value: vec4f) -> f32 {
	let rgba_u32 = vec4<u32>(value * 255.0);
	let intBits: u32 =
		(rgba_u32.r << 24u) |
		(rgba_u32.g << 16u) |
		(rgba_u32.b << 8u)  |
		 rgba_u32.a;
	return bitcast<f32>(intBits);
}
fn float2vec4(value: f32) -> vec4f {
	#if defined(CAPS_TEXTURE_FLOAT_RENDERABLE)
		return vec4f(value, 1.0, 1.0, 1.0);
	#else
		return float2uint(value);
	#endif
}
#endif
`

var fogPS = `
var<private> dBlendModeFogFactor : f32 = 1.0;
#if (FOG != NONE)
	uniform fog_color : vec3f;
	
	#if (FOG == LINEAR)
		uniform fog_start : f32;
		uniform fog_end : f32;
	#else
		uniform fog_density : f32;
	#endif
#endif
fn getFogFactor() -> f32 {
	let depth = pcPosition.z / pcPosition.w;
	var fogFactor : f32 = 0.0;
	#if (FOG == LINEAR)
		fogFactor = (uniform.fog_end - depth) / (uniform.fog_end - uniform.fog_start);
	#elif (FOG == EXP)
		fogFactor = exp(-depth * uniform.fog_density);
	#elif (FOG == EXP2)
		fogFactor = exp(-depth * depth * uniform.fog_density * uniform.fog_density);
	#endif
	return clamp(fogFactor, 0.0, 1.0);
}
fn addFog(color : vec3f) -> vec3f {
	#if (FOG != NONE)
		return mix(uniform.fog_color * dBlendModeFogFactor, color, getFogFactor());
	#else
		return color;
	#endif
}
`

var fresnelSchlickPS = `
fn getFresnel(
		cosTheta: f32,
		gloss: f32,
		specularity: vec3f
	#if defined(LIT_IRIDESCENCE)
		, iridescenceFresnel: vec3f,
		iridescenceIntensity: f32
	#endif
) -> vec3f {
	let fresnel: f32 = pow(1.0 - saturate(cosTheta), 5.0);
	let glossSq: f32 = gloss * gloss;
	let specIntensity: f32 = max(specularity.r, max(specularity.g, specularity.b));
	let ret: vec3f = specularity + (max(vec3f(glossSq * specIntensity), specularity) - specularity) * fresnel;
	#if defined(LIT_IRIDESCENCE)
		return mix(ret, iridescenceFresnel, iridescenceIntensity);
	#else
		return ret;
	#endif
}
fn getFresnelCC(cosTheta: f32) -> f32 {
	let fresnel: f32 = pow(1.0 - saturate(cosTheta), 5.0);
	return 0.04 + (1.0 - 0.04) * fresnel;
}`

var fullscreenQuadVS = `
attribute vertex_position: vec2f;
varying vUv0: vec2f;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
	var output: VertexOutput;
	output.position = vec4f(input.vertex_position, 0.5, 1.0);
	output.vUv0 = input.vertex_position.xy * 0.5 + vec2f(0.5);
	return output;
}
`

var gammaPS = `
#include "decodePS"
#if (GAMMA == SRGB)
	fn gammaCorrectInput(color: f32) -> f32 {
		return decodeGammaFloat(color);
	}
	fn gammaCorrectInputVec3(color: vec3f) -> vec3f {
		return decodeGamma3(color);
	}
	fn gammaCorrectInputVec4(color: vec4f) -> vec4f {
		return vec4f(decodeGamma3(color.xyz), color.w);
	}
	fn gammaCorrectOutput(color: vec3f) -> vec3f {
		return pow(color + 0.0000001, vec3f(1.0 / 2.2));
	}
#else
	fn gammaCorrectInput(color: f32) -> f32 {
		return color;
	}
	fn gammaCorrectInputVec3(color: vec3f) -> vec3f {
		return color;
	}
	fn gammaCorrectInputVec4(color: vec4f) -> vec4f {
		return color;
	}
	fn gammaCorrectOutput(color: vec3f) -> vec3f {
		return color;
	}
#endif
`

var glossPS = `
#ifdef STD_GLOSS_CONSTANT
	uniform material_gloss: f32;
#endif
fn getGlossiness() {
	dGlossiness = 1.0;
	#ifdef STD_GLOSS_CONSTANT
	dGlossiness = dGlossiness * uniform.material_gloss;
	#endif
	#ifdef STD_GLOSS_TEXTURE
	dGlossiness = dGlossiness * textureSampleBias({STD_GLOSS_TEXTURE_NAME}, {STD_GLOSS_TEXTURE_NAME}Sampler, {STD_GLOSS_TEXTURE_UV}, uniform.textureBias).{STD_GLOSS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_GLOSS_VERTEX
	dGlossiness = dGlossiness * saturate(vVertexColor.{STD_GLOSS_VERTEX_CHANNEL});
	#endif
	#ifdef STD_GLOSS_INVERT
	dGlossiness = 1.0 - dGlossiness;
	#endif
	dGlossiness = dGlossiness + 0.0000001;
}
`

var quadVS = `
	attribute aPosition: vec2f;
	varying uv0: vec2f;
	@vertex fn vertexMain(input: VertexInput) -> VertexOutput {
		var output: VertexOutput;
		output.position = vec4f(input.aPosition, 0.0, 1.0);
		output.uv0 = getImageEffectUV((input.aPosition + 1.0) * 0.5);
		return output;
	}
`

var indirectCoreCS = `
struct DrawIndexedIndirectArgs {
	indexCount: u32,
	instanceCount: u32,
	firstIndex: u32,
	baseVertex: i32,
	firstInstance: u32
};
struct DrawIndirectArgs {
	vertexCount: u32,
	instanceCount: u32,
	firstVertex: u32,
	firstInstance: u32,
	_pad: u32
};
`

var immediateLinePS = `
	#include "gammaPS"
	varying color: vec4f;
	@fragment
	fn fragmentMain(input : FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		output.color = vec4f(gammaCorrectOutput(decodeGamma3(input.color.rgb)), input.color.a);
		return output;
	}
`

var immediateLineVS = `
	attribute vertex_position: vec4f;
	attribute vertex_color: vec4f;
	uniform matrix_model: mat4x4f;
	uniform matrix_viewProjection: mat4x4f;
	varying color: vec4f;
	@vertex
	fn vertexMain(input : VertexInput) -> VertexOutput {
		var output : VertexOutput;
		output.color = input.vertex_color;
		output.position = uniform.matrix_viewProjection * uniform.matrix_model * input.vertex_position;
		return output;
	}
`

var iridescenceDiffractionPS = `
uniform material_iridescenceRefractionIndex: f32;
fn iridescence_iorToFresnelScalar(transmittedIor: f32, incidentIor: f32) -> f32 {
	return pow((transmittedIor - incidentIor) / (transmittedIor + incidentIor), 2.0);
}
fn iridescence_iorToFresnelVec3(transmittedIor: vec3f, incidentIor: f32) -> vec3f {
	return pow((transmittedIor - vec3f(incidentIor)) / (transmittedIor + vec3f(incidentIor)), vec3f(2.0));
}
fn iridescence_fresnelToIor(f0: vec3f) -> vec3f {
	let sqrtF0: vec3f = sqrt(f0);
	return (vec3f(1.0) + sqrtF0) / (vec3f(1.0) - sqrtF0);
}
const XYZ_TO_REC709: mat3x3f = mat3x3f(
	vec3f(3.2404542, -1.5371385, -0.4985314),
	vec3f(-0.9692660,  1.8760108,  0.0415560),
	vec3f(0.0556434, -0.2040259,  1.0572252)
);
fn iridescence_sensitivity(opd: f32, shift: vec3f) -> vec3f {
	let PI: f32 = 3.141592653589793;
	let phase: f32 = 2.0 * PI * opd * 1.0e-9;
	const val: vec3f = vec3f(5.4856e-13, 4.4201e-13, 5.2481e-13);
	const pos: vec3f = vec3f(1.6810e+06, 1.7953e+06, 2.2084e+06);
	const var_: vec3f = vec3f(4.3278e+09, 9.3046e+09, 6.6121e+09);
	var xyz: vec3f = val * sqrt(2.0 * PI * var_) * cos(pos * phase + shift) * exp(-pow(phase, 2.0) * var_);
	xyz.x = xyz.x + 9.7470e-14 * sqrt(2.0 * PI * 4.5282e+09) * cos(2.2399e+06 * phase + shift[0]) * exp(-4.5282e+09 * pow(phase, 2.0));
	xyz = xyz / vec3f(1.0685e-07);
	return XYZ_TO_REC709 * xyz;
}
fn iridescence_fresnelScalar(cosTheta: f32, f0: f32) -> f32 {
	let x: f32 = clamp(1.0 - cosTheta, 0.0, 1.0);
	let x2: f32 = x * x;
	let x5: f32 = x * x2 * x2;
	return f0 + (1.0 - f0) * x5;
}
fn iridescence_fresnelVec3(cosTheta: f32, f0: vec3f) -> vec3f {
	let x: f32 = clamp(1.0 - cosTheta, 0.0, 1.0);
	let x2: f32 = x * x;
	let x5: f32 = x * x2 * x2;
	return f0 + (vec3f(1.0) - f0) * x5;
}
fn calcIridescence(outsideIor: f32, cosTheta: f32, base_f0: vec3f, iridescenceThickness: f32) -> vec3f {
	let PI: f32 = 3.141592653589793;
	let iridescenceIor: f32 = mix(outsideIor, uniform.material_iridescenceRefractionIndex, smoothstep(0.0, 0.03, iridescenceThickness));
	let sinTheta2Sq: f32 = pow(outsideIor / iridescenceIor, 2.0) * (1.0 - pow(cosTheta, 2.0));
	let cosTheta2Sq: f32 = 1.0 - sinTheta2Sq;
	if (cosTheta2Sq < 0.0) {
		return vec3f(1.0);
	}
	let cosTheta2: f32 = sqrt(cosTheta2Sq);
	let r0: f32 = iridescence_iorToFresnelScalar(iridescenceIor, outsideIor);
	let r12: f32 = iridescence_fresnelScalar(cosTheta, r0);
	let r21: f32 = r12;
	let t121: f32 = 1.0 - r12;
	let phi12: f32 = select(0.0, PI, iridescenceIor < outsideIor);
	let phi21: f32 = PI - phi12;
	let baseIor: vec3f = iridescence_fresnelToIor(base_f0 + vec3f(0.0001));
	let r1: vec3f = iridescence_iorToFresnelVec3(baseIor, iridescenceIor);
	let r23: vec3f = iridescence_fresnelVec3(cosTheta2, r1);
	let phi23: vec3f = select(vec3f(0.0), vec3f(PI), baseIor < vec3f(iridescenceIor));
	let opd: f32 = 2.0 * iridescenceIor * iridescenceThickness * cosTheta2;
	let phi: vec3f = vec3f(phi21) + phi23;
	let r123Sq: vec3f = clamp(vec3f(r12) * r23, vec3f(1e-5), vec3f(0.9999));
	let r123: vec3f = sqrt(r123Sq);
	let rs: vec3f = pow(vec3f(t121), vec3f(2.0)) * r23 / (vec3f(1.0) - r123Sq);
	let c0: vec3f = vec3f(r12) + rs;
	var i_irid: vec3f = c0;
	var cm: vec3f = rs - vec3f(t121);
	cm = cm * r123;
	let sm1: vec3f = 2.0 * iridescence_sensitivity(1.0 * opd, 1.0 * phi);
	i_irid = i_irid + cm * sm1;
	cm = cm * r123;
	let sm2: vec3f = 2.0 * iridescence_sensitivity(2.0 * opd, 2.0 * phi);
	i_irid = i_irid + cm * sm2;
	return max(i_irid, vec3f(0.0));
}
fn getIridescenceDiffraction(cosTheta: f32, specularity: vec3f, iridescenceThickness: f32) -> vec3f {
	return calcIridescence(1.0, cosTheta, specularity, iridescenceThickness);
}
`

var iridescencePS = `
#ifdef STD_IRIDESCENCE_CONSTANT
	uniform material_iridescence: f32;
#endif
fn getIridescence() {
	var iridescence = 1.0;
	#ifdef STD_IRIDESCENCE_CONSTANT
	iridescence = iridescence * uniform.material_iridescence;
	#endif
	#ifdef STD_IRIDESCENCE_TEXTURE
	iridescence = iridescence * textureSampleBias({STD_IRIDESCENCE_TEXTURE_NAME}, {STD_IRIDESCENCE_TEXTURE_NAME}Sampler, {STD_IRIDESCENCE_TEXTURE_UV}, uniform.textureBias).{STD_IRIDESCENCE_TEXTURE_CHANNEL};
	#endif
	dIridescence = iridescence; 
}
`

var iridescenceThicknessPS = `
uniform material_iridescenceThicknessMax: f32;
#ifdef STD_IRIDESCENCETHICKNESS_TEXTURE
	uniform material_iridescenceThicknessMin: f32;
#endif
fn getIridescenceThickness() {
	#ifdef STD_IRIDESCENCETHICKNESS_TEXTURE
		var blend: f32 = textureSampleBias({STD_IRIDESCENCETHICKNESS_TEXTURE_NAME}, {STD_IRIDESCENCETHICKNESS_TEXTURE_NAME}Sampler, {STD_IRIDESCENCETHICKNESS_TEXTURE_UV}, uniform.textureBias).{STD_IRIDESCENCETHICKNESS_TEXTURE_CHANNEL};
		var iridescenceThickness: f32 = mix(uniform.material_iridescenceThicknessMin, uniform.material_iridescenceThicknessMax, blend);
	#else
		var iridescenceThickness: f32 = uniform.material_iridescenceThicknessMax;
	#endif
	dIridescenceThickness = iridescenceThickness; 
}
`

var iorPS = `
#ifdef STD_IOR_CONSTANT
	uniform material_refractionIndex: f32;
#endif
fn getIor() {
#ifdef STD_IOR_CONSTANT
	dIor = uniform.material_refractionIndex;
#else
	dIor = 1.0 / 1.5;
#endif
}
`

var lightDeclarationPS = `
#if defined(LIGHT{i})
	uniform light{i}_color: vec3f;
	#if LIGHT{i}TYPE == DIRECTIONAL
		uniform light{i}_direction: vec3f;
	#else
		#define LIT_CODE_LIGHTS_POINT
		uniform light{i}_position: vec3f;
		uniform light{i}_radius: f32;
		#if LIGHT{i}TYPE == SPOT
			#define LIT_CODE_LIGHTS_SPOT
			uniform light{i}_direction: vec3f;
			uniform light{i}_innerConeAngle: f32;
			uniform light{i}_outerConeAngle: f32;
		#endif
	#endif
	#if LIGHT{i}SHAPE != PUNCTUAL
		#define LIT_CODE_FALLOFF_SQUARED
		#if LIGHT{i}TYPE == DIRECTIONAL
			uniform light{i}_position: vec3f;
		#endif
		uniform light{i}_halfWidth: vec3f;
		uniform light{i}_halfHeight: vec3f;
	#else
		#if LIGHT{i}FALLOFF == LINEAR
			#define LIT_CODE_FALLOFF_LINEAR
		#endif
		#if LIGHT{i}FALLOFF == INVERSESQUARED
			#define LIT_CODE_FALLOFF_SQUARED
		#endif
	#endif
	#if defined(LIGHT{i}CASTSHADOW)
		#if LIGHT{i}TYPE != OMNI
			uniform light{i}_shadowMatrix: mat4x4f;
		#endif
		uniform light{i}_shadowIntensity: f32;
		uniform light{i}_shadowParams: vec4f;
		#if LIGHT{i}SHADOWTYPE == PCSS_32F
			uniform light{i}_shadowSearchArea: f32;
			uniform light{i}_cameraParams: vec4f;
			#if LIGHT{i}TYPE == DIRECTIONAL
				uniform light{i}_softShadowParams: vec4f;
			#endif
		#endif
		#if LIGHT{i}TYPE == DIRECTIONAL
			uniform light{i}_shadowMatrixPalette: array<mat4x4f, 4>;
			uniform light{i}_shadowCascadeDistances: vec4f;
			uniform light{i}_shadowCascadeCount: i32;
			uniform light{i}_shadowCascadeBlend: f32;
		#endif
		#if LIGHT{i}TYPE == OMNI
			NOT SUPPORTED
			
		#else
			#if defined(LIGHT{i}SHADOW_PCF)
				var light{i}_shadowMap: texture_depth_2d;
				var light{i}_shadowMapSampler: sampler_comparison;
			#else
				var light{i}_shadowMap: texture_2d<f32>;
				var light{i}_shadowMapSampler: sampler;
			#endif
		#endif
	#endif
	#if defined(LIGHT{i}COOKIE)
		#define LIT_CODE_COOKIE
		#if LIGHT{i}TYPE == OMNI
			NOT SUPPORTED
		#endif
		#if LIGHT{i}TYPE == SPOT
			NOT SUPPORTED
		#endif
	#endif
#endif
`

var lightDiffuseLambertPS = `
fn getLightDiffuse(worldNormal: vec3f, viewDir: vec3f, lightDirNorm: vec3f) -> f32 {
	return max(dot(worldNormal, -lightDirNorm), 0.0);
}
`

var lightDirPointPS = `
fn evalOmniLight(lightPosW: vec3f) -> vec3f {
	return vPositionW - lightPosW;
}
`

var lightEvaluationPS = `
#if defined(LIGHT{i})
	evaluateLight{i}(
		#if defined(LIT_IRIDESCENCE)
			iridescenceFresnel
		#endif
	);
#endif
`

var lightFunctionLightPS = `
#if defined(LIGHT{i})
fn evaluateLight{i}(
	#if defined(LIT_IRIDESCENCE)
		iridescenceFresnel: vec3f
	#endif
) {
	var lightColor: vec3f = uniform.light{i}_color;
	#if LIGHT{i}TYPE == DIRECTIONAL && !defined(LIT_SHADOW_CATCHER)
		if (all(lightColor == vec3f(0.0, 0.0, 0.0))) {
			return;
		}
	#endif
	#if LIGHT{i}TYPE == DIRECTIONAL
		dLightDirNormW = uniform.light{i}_direction;
		dAtten = 1.0;
	#else
		var lightDirW: vec3f = evalOmniLight(uniform.light{i}_position);
		dLightDirNormW = normalize(lightDirW);
		#if defined(LIGHT{i}COOKIE)
			#if LIGHT{i}TYPE == SPOT
				#ifdef LIGHT{i}COOKIE_FALLOFF
					#ifdef LIGHT{i}COOKIE_TRANSFORM
						var cookieAttenuation: vec3f = getCookie2DXform(uniform.light{i}_cookie, uniform.light{i}_shadowMatrix, uniform.light{i}_cookieIntensity, uniform.light{i}_cookieMatrix, uniform.light{i}_cookieOffset).{LIGHT{i}COOKIE_CHANNEL};
					#else
						var cookieAttenuation: vec3f = getCookie2D(uniform.light{i}_cookie, uniform.light{i}_shadowMatrix, uniform.light{i}_cookieIntensity).{LIGHT{i}COOKIE_CHANNEL};
					#endif
				#else
					#ifdef LIGHT{i}COOKIE_TRANSFORM
						var cookieAttenuation: vec3f = getCookie2DClipXform(uniform.light{i}_cookie, uniform.light{i}_shadowMatrix, uniform.light{i}_cookieIntensity, uniform.light{i}_cookieMatrix, uniform.light{i}_cookieOffset).{LIGHT{i}COOKIE_CHANNEL};
					#else
						var cookieAttenuation: vec3f = getCookie2DClip(uniform.light{i}_cookie, uniform.light{i}_shadowMatrix, uniform.light{i}_cookieIntensity).{LIGHT{i}COOKIE_CHANNEL};
					#endif
				#endif
			#endif
			#if LIGHT{i}TYPE == OMNI
				var cookieAttenuation: vec3f = getCookieCube(uniform.light{i}_cookie, uniform.light{i}_shadowMatrix, uniform.light{i}_cookieIntensity).{LIGHT{i}COOKIE_CHANNEL};
			#endif
			lightColor = lightColor * cookieAttenuation;
		#endif
		#if LIGHT{i}SHAPE == PUNCTUAL
			#if LIGHT{i}FALLOFF == LINEAR
				dAtten = getFalloffLinear(uniform.light{i}_radius, lightDirW);
			#else
				dAtten = getFalloffInvSquared(uniform.light{i}_radius, lightDirW);
			#endif
		#else
			dAtten = getFalloffWindow(uniform.light{i}_radius, lightDirW);
		#endif
		#if LIGHT{i}TYPE == SPOT
			#if !defined(LIGHT{i}COOKIE) || defined(LIGHT{i}COOKIE_FALLOFF)
				dAtten = dAtten * getSpotEffect(uniform.light{i}_direction, uniform.light{i}_innerConeAngle, uniform.light{i}_outerConeAngle, dLightDirNormW);
			#endif
		#endif
	#endif
	if (dAtten < 0.00001) {
		return;
	}
	#if LIGHT{i}SHAPE != PUNCTUAL
		#if LIGHT{i}SHAPE == RECT
			calcRectLightValues(uniform.light{i}_position, uniform.light{i}_halfWidth, uniform.light{i}_halfHeight);
		#elif LIGHT{i}SHAPE == DISK
			calcDiskLightValues(uniform.light{i}_position, uniform.light{i}_halfWidth, uniform.light{i}_halfHeight);
		#elif LIGHT{i}SHAPE == SPHERE
			calcSphereLightValues(uniform.light{i}_position, uniform.light{i}_halfWidth, uniform.light{i}_halfHeight);
		#endif
	#endif
	#if LIGHT{i}SHAPE != PUNCTUAL
		#if LIGHT{i}TYPE == DIRECTIONAL
			var attenDiffuse: f32 = getLightDiffuse(litArgs_worldNormal, dViewDirW, dLightDirNormW);
		#else
			#if LIGHT{i}SHAPE == RECT
				var attenDiffuse: f32 = getRectLightDiffuse(litArgs_worldNormal, dViewDirW, lightDirW, dLightDirNormW) * 16.0;
			#elif LIGHT{i}SHAPE == DISK
				var attenDiffuse: f32 = getDiskLightDiffuse(litArgs_worldNormal, dViewDirW, lightDirW, dLightDirNormW) * 16.0;
			#elif LIGHT{i}SHAPE == SPHERE
				var attenDiffuse: f32 = getSphereLightDiffuse(litArgs_worldNormal, dViewDirW, lightDirW, dLightDirNormW) * 16.0;
			#endif
		#endif
	#else
		dAtten = dAtten * getLightDiffuse(litArgs_worldNormal, vec3(0.0), dLightDirNormW);
	#endif
	#ifdef LIGHT{i}CASTSHADOW
		#if LIGHT{i}TYPE == DIRECTIONAL
			var shadow: f32 = getShadow{i}(vec3(0.0));
		#else
			var shadow: f32 = getShadow{i}(lightDirW);
		#endif
		shadow = mix(1.0, shadow, uniform.light{i}_shadowIntensity);
		dAtten = dAtten * shadow;
		#if defined(LIT_SHADOW_CATCHER) && LIGHT{i}TYPE == DIRECTIONAL
			dShadowCatcher = dShadowCatcher * shadow;
		#endif			
	#endif
	#if LIGHT{i}SHAPE != PUNCTUAL
		#ifdef LIT_SPECULAR
			dDiffuseLight = dDiffuseLight + (((attenDiffuse * dAtten) * lightColor) * (1.0 - dLTCSpecFres));
		#else
			dDiffuseLight = dDiffuseLight + ((attenDiffuse * dAtten) * lightColor);
		#endif						
	#else
		#if defined(AREA_LIGHTS) && defined(LIT_SPECULAR)
			dDiffuseLight = dDiffuseLight + ((dAtten * lightColor) * (1.0 - litArgs_specularity));
		#else
			dDiffuseLight = dDiffuseLight + (dAtten * lightColor);
		#endif
	#endif
	#ifdef LIGHT{i}AFFECT_SPECULARITY
		#if LIGHT{i}SHAPE != PUNCTUAL
			#ifdef LIT_CLEARCOAT
				#if LIGHT{i}SHAPE == RECT
					ccSpecularLight = ccSpecularLight + (ccLTCSpecFres * getRectLightSpecular(litArgs_clearcoat_worldNormal, dViewDirW) * dAtten * lightColor);
				#elif LIGHT{i}SHAPE == DISK
					ccSpecularLight = ccSpecularLight + (ccLTCSpecFres * getDiskLightSpecular(litArgs_clearcoat_worldNormal, dViewDirW) * dAtten * lightColor);
				#elif LIGHT{i}SHAPE == SPHERE
					ccSpecularLight = ccSpecularLight + (ccLTCSpecFres * getSphereLightSpecular(litArgs_clearcoat_worldNormal, dViewDirW) * dAtten * lightColor);
				#endif
			#endif
			#ifdef LIT_SPECULAR
				#if LIGHT{i}SHAPE == RECT
					dSpecularLight = dSpecularLight + (dLTCSpecFres * getRectLightSpecular(litArgs_worldNormal, dViewDirW) * dAtten * lightColor);
				#elif LIGHT{i}SHAPE == DISK
					dSpecularLight = dSpecularLight + (dLTCSpecFres * getDiskLightSpecular(litArgs_worldNormal, dViewDirW) * dAtten * lightColor);
				#elif LIGHT{i}SHAPE == SPHERE
					dSpecularLight = dSpecularLight + (dLTCSpecFres * getSphereLightSpecular(litArgs_worldNormal, dViewDirW) * dAtten * lightColor);
				#endif
			#endif
		#else
			#if LIGHT{i}TYPE == DIRECTIONAL && LIT_FRESNEL_MODEL != NONE
				#define LIGHT{i}FRESNEL
			#endif
			#ifdef LIT_SPECULAR
				var halfDirW: vec3f = normalize(-dLightDirNormW + dViewDirW);
			#endif
			#ifdef LIT_CLEARCOAT
				var lightspecularCC: vec3f = getLightSpecular(halfDirW, ccReflDirW, litArgs_clearcoat_worldNormal, dViewDirW, dLightDirNormW, litArgs_clearcoat_gloss, dTBN) * dAtten * lightColor;
				#ifdef LIGHT{i}FRESNEL
					lightspecularCC = lightspecularCC * getFresnelCC(dot(dViewDirW, halfDirW));
				#endif
				ccSpecularLight = ccSpecularLight + lightspecularCC;
			#endif
			#ifdef LIT_SHEEN
				sSpecularLight = sSpecularLight + (getLightSpecularSheen(halfDirW, litArgs_worldNormal, dViewDirW, dLightDirNormW, litArgs_sheen_gloss) * dAtten * lightColor);
			#endif
			#ifdef LIT_SPECULAR
				var lightSpecular: vec3f = getLightSpecular(halfDirW, dReflDirW, litArgs_worldNormal, dViewDirW, dLightDirNormW, litArgs_gloss, dTBN) * dAtten * lightColor;
				#ifdef LIGHT{i}FRESNEL
					#if defined(LIT_IRIDESCENCE)
						lightSpecular = lightSpecular * getFresnel(dot(dViewDirW, halfDirW), litArgs_gloss, litArgs_specularity, iridescenceFresnel, litArgs_iridescence_intensity);
					#else
						lightSpecular = lightSpecular * getFresnel(dot(dViewDirW, halfDirW), litArgs_gloss, litArgs_specularity);
					#endif
				#else
					lightSpecular = lightSpecular * litArgs_specularity;
				#endif
				
				dSpecularLight = dSpecularLight + lightSpecular;
			#endif
		#endif
	#endif
}
#endif
`

var lightFunctionShadowPS = `
#ifdef LIGHT{i}CASTSHADOW
	#ifdef LIGHT{i}_SHADOW_SAMPLE_POINT
		fn getShadowSampleCoordOmni{i}(shadowParams: vec4f, worldPosition: vec3f, lightPos: vec3f, lightDir: ptr<function, vec3f>, lightDirNorm: vec3f, normal: vec3f) -> vec3f {
			#ifdef LIGHT{i}_SHADOW_SAMPLE_NORMAL_OFFSET
				let distScale: f32 = length(*lightDir);
				var surfacePosition = worldPosition + normal * shadowParams.y * clamp(1.0 - dot(normal, -lightDirNorm), 0.0, 1.0) * distScale;
				*lightDir = surfacePosition - lightPos;
			#endif
			return *lightDir;
		}
	#endif
	#ifndef LIGHT{i}_SHADOW_SAMPLE_POINT
		fn getShadowSampleCoord{i}(shadowTransform: mat4x4f, shadowParams: vec4f, worldPosition: vec3f, lightPos: vec3f, lightDir: ptr<function, vec3f>, lightDirNorm: vec3f, normal: vec3f) -> vec3f {
			var surfacePosition = worldPosition;
			#ifdef LIGHT{i}_SHADOW_SAMPLE_SOURCE_ZBUFFER
				#ifdef LIGHT{i}_SHADOW_SAMPLE_NORMAL_OFFSET
					surfacePosition = surfacePosition + normal * shadowParams.y;
				#endif
			#else
				#ifdef LIGHT{i}_SHADOW_SAMPLE_NORMAL_OFFSET
					#ifdef LIGHT{i}_SHADOW_SAMPLE_ORTHO
						var distScale: f32 = 1.0;
					#else
						var distScale: f32 = abs(dot(vPositionW - lightPos, lightDirNorm));
					#endif
					surfacePosition = surfacePosition + normal * shadowParams.y * clamp(1.0 - dot(normal, -lightDirNorm), 0.0, 1.0) * distScale;
				#endif
			#endif
			var positionInShadowSpace: vec4f = shadowTransform * vec4f(surfacePosition, 1.0);
			#ifdef LIGHT{i}_SHADOW_SAMPLE_ORTHO
				positionInShadowSpace.z = saturate(positionInShadowSpace.z) - 0.0001;
			#else
				#ifdef LIGHT{i}_SHADOW_SAMPLE_SOURCE_ZBUFFER
					positionInShadowSpace.xyz = positionInShadowSpace.xyz / positionInShadowSpace.w;
				#else
					positionInShadowSpace.xy = positionInShadowSpace.xy / positionInShadowSpace.w;
					positionInShadowSpace.z = length(*lightDir) * shadowParams.w;
				#endif
			#endif
			return positionInShadowSpace.xyz;
		}
	#endif
	fn getShadow{i}(lightDirW_in: vec3f) -> f32 {
		var lightDirArg = lightDirW_in;
		#if LIGHT{i}TYPE == OMNI
			var shadowCoord: vec3f = getShadowSampleCoordOmni{i}(uniform.light{i}_shadowParams, vPositionW, uniform.light{i}_position, &lightDirArg, dLightDirNormW, dVertexNormalW);
		#else
			#ifdef LIGHT{i}_SHADOW_CASCADES
				var cascadeIndex: i32 = getShadowCascadeIndex(uniform.light{i}_shadowCascadeDistances, uniform.light{i}_shadowCascadeCount);
				#ifdef LIGHT{i}_SHADOW_CASCADE_BLEND
					cascadeIndex = ditherShadowCascadeIndex(cascadeIndex, uniform.light{i}_shadowCascadeDistances, uniform.light{i}_shadowCascadeCount, uniform.light{i}_shadowCascadeBlend);
				#endif
				var shadowMatrix: mat4x4f = uniform.light{i}_shadowMatrixPalette[cascadeIndex];
			#else
				var shadowMatrix: mat4x4f = uniform.light{i}_shadowMatrix;
			#endif
			#if LIGHT{i}TYPE == DIRECTIONAL
				var shadowCoord: vec3f = getShadowSampleCoord{i}(shadowMatrix, uniform.light{i}_shadowParams, vPositionW, vec3f(0.0), &lightDirArg, dLightDirNormW, dVertexNormalW);
			#else
				var shadowCoord: vec3f = getShadowSampleCoord{i}(shadowMatrix, uniform.light{i}_shadowParams, vPositionW, uniform.light{i}_position, &lightDirArg, dLightDirNormW, dVertexNormalW);
			#endif
		#endif
		#if LIGHT{i}TYPE == DIRECTIONAL
			shadowCoord = fadeShadow(shadowCoord, uniform.light{i}_shadowCascadeDistances);
		#endif
		#if LIGHT{i}TYPE == DIRECTIONAL
			#if LIGHT{i}SHADOWTYPE == VSM_16F
				return getShadowVSM16(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, 5.54);
			#endif
			#if LIGHT{i}SHADOWTYPE == VSM_32F
				return getShadowVSM32(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, 15.0);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCSS_32F
				#if LIGHT{i}SHAPE != PUNCTUAL
					let shadowSearchArea = vec2f(length(uniform.light{i}_halfWidth), length(uniform.light{i}_halfHeight)) * uniform.light{i}_shadowSearchArea;
					return getShadowPCSS(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, uniform.light{i}_cameraParams, shadowSearchArea, lightDirW_in);
				#else
					return getShadowPCSS(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, uniform.light{i}_cameraParams, uniform.light{i}_softShadowParams, lightDirW_in);
				#endif
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF1_16F || LIGHT{i}SHADOWTYPE == PCF1_32F
				return getShadowPCF1x1(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF3_16F || LIGHT{i}SHADOWTYPE == PCF3_32F
				return getShadowPCF3x3(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF5_16F || LIGHT{i}SHADOWTYPE == PCF5_32F
				return getShadowPCF5x5(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams);
			#endif
		#endif
		#if LIGHT{i}TYPE == SPOT
			#if LIGHT{i}SHADOWTYPE == VSM_16F
				return getShadowSpotVSM16(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, 5.54, lightDirW_in);
			#endif
			#if LIGHT{i}SHADOWTYPE == VSM_32F
				return getShadowSpotVSM32(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, 15.0, lightDirW_in);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCSS_32F
				#if LIGHT{i}SHAPE != PUNCTUAL
					var shadowSearchArea: vec2f = vec2f(length(uniform.light{i}_halfWidth), length(uniform.light{i}_halfHeight)) * uniform.light{i}_shadowSearchArea;
				#else
					var shadowSearchArea: vec2f = vec2f(uniform.light{i}_shadowSearchArea);
				#endif
				return getShadowSpotPCSS(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, uniform.light{i}_cameraParams, shadowSearchArea, lightDirW_in);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF1_16F || LIGHT{i}SHADOWTYPE == PCF1_32F
				return getShadowSpotPCF1x1(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF3_16F || LIGHT{i}SHADOWTYPE == PCF3_32F
				return getShadowSpotPCF3x3(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF5_16F || LIGHT{i}SHADOWTYPE == PCF5_32F
				return getShadowSpotPCF5x5(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams);
			#endif
		#endif
		#if LIGHT{i}TYPE == OMNI
			#if LIGHT{i}SHADOWTYPE == PCSS_32F
				 var shadowSearchArea: vec2f;
				 #if LIGHT{i}SHAPE != PUNCTUAL
					var shadowSearchArea: vec2f = vec2f(length(uniform.light{i}_halfWidth), length(uniform.light{i}_halfHeight)) * uniform.light{i}_shadowSearchArea;
				#else
					var shadowSearchArea: vec2f = vec2f(uniform.light{i}_shadowSearchArea);
				#endif
				return getShadowOmniPCSS(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, uniform.light{i}_cameraParams, shadowSearchArea, lightDirW_in);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF1_16F || LIGHT{i}SHADOWTYPE == PCF1_32F
				return getShadowOmniPCF1x1(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, lightDirW_in);
			#endif
			#if LIGHT{i}SHADOWTYPE == PCF3_16F || LIGHT{i}SHADOWTYPE == PCF3_32F
				return getShadowOmniPCF3x3(light{i}_shadowMap, light{i}_shadowMapSampler, shadowCoord, uniform.light{i}_shadowParams, lightDirW_in);
			#endif
		#endif
	}
#endif
`

var lightingPS = `
#ifdef LIT_CLUSTERED_LIGHTS
	#define LIT_CODE_FALLOFF_LINEAR
	#define LIT_CODE_FALLOFF_SQUARED
	#define LIT_CODE_LIGHTS_POINT
	#define LIT_CODE_LIGHTS_SPOT
#endif
#ifdef AREA_LIGHTS
	var areaLightsLutTex1: texture_2d<f32>;
	var areaLightsLutTex1Sampler: sampler;
	var areaLightsLutTex2: texture_2d<f32>;
	var areaLightsLutTex2Sampler: sampler;
#endif
#ifdef LIT_LIGHTING
	#include "lightDiffuseLambertPS"
	#if defined(AREA_LIGHTS) || defined(LIT_CLUSTERED_AREA_LIGHTS)
		#include "ltcPS"
	#endif
#endif
#ifdef SHADOW_DIRECTIONAL
	#include "shadowCascadesPS"
#endif
#if defined(SHADOW_KIND_PCF1)
	#include "shadowPCF1PS"
#endif
#if defined(SHADOW_KIND_PCF3)
	#include "shadowPCF3PS"
#endif
#if defined(SHADOW_KIND_PCF5)
	#include "shadowPCF5PS"
#endif
#if defined(SHADOW_KIND_PCSS)
	#include "linearizeDepthPS"
	#include "shadowSoftPS"
#endif
#if defined(SHADOW_KIND_VSM)
	#include "shadowEVSMPS"
#endif
#ifdef LIT_CODE_FALLOFF_LINEAR
	#include "falloffLinearPS"
#endif
#ifdef LIT_CODE_FALLOFF_SQUARED
	#include "falloffInvSquaredPS"
#endif
#ifdef LIT_CODE_LIGHTS_POINT
	#include "lightDirPointPS"
#endif
#ifdef LIT_CODE_LIGHTS_SPOT
	#include "spotPS"
#endif
#ifdef LIT_CODE_COOKIE
	#include "cookiePS"
#endif
#ifdef LIT_CLUSTERED_LIGHTS
	#include "clusteredLightPS"
#endif
#ifdef LIGHT_COUNT > 0
	#include "lightFunctionShadowPS, LIGHT_COUNT"
	#include "lightFunctionLightPS, LIGHT_COUNT"
#endif
`

var lightmapAddPS = `
fn addLightMap(
	lightmap: vec3f,
	dir: vec3f,
	worldNormal: vec3f,
	viewDir: vec3f,
	reflectionDir: vec3f,
	gloss: f32,
	specularity: vec3f,
	vertexNormal: vec3f,
	tbn: mat3x3f
#if defined(LIT_IRIDESCENCE)
	, iridescenceFresnel: vec3f,
	iridescenceIntensity: f32
#endif
) {
	#if defined(LIT_SPECULAR) && defined(LIT_DIR_LIGHTMAP)
		if (dot(dir, dir) < 0.0001) {
				dDiffuseLight = dDiffuseLight + lightmap;
		} else {
			let vlight: f32 = saturate(dot(dir, -vertexNormal));
			let flight: f32 = saturate(dot(dir, -worldNormal));
			let nlight: f32 = (flight / max(vlight, 0.01)) * 0.5;
			dDiffuseLight = dDiffuseLight + lightmap * nlight * 2.0;
			let halfDir: vec3f = normalize(-dir + viewDir);
			var specularLight: vec3f = lightmap * getLightSpecular(halfDir, reflectionDir, worldNormal, viewDir, dir, gloss, tbn);
			#ifdef LIT_SPECULAR_FRESNEL
				specularLight = specularLight *
					getFresnel(dot(viewDir, halfDir),
					gloss,
					specularity
				#if defined(LIT_IRIDESCENCE)
					, iridescenceFresnel,
					iridescenceIntensity
				#endif
					);
			#endif
			dSpecularLight = dSpecularLight + specularLight;
		}
	#else
		dDiffuseLight = dDiffuseLight + lightmap;
	#endif
}
`

var lightmapPS = `
#ifdef STD_LIGHTMAP_DIR
	var<private> dLightmapDir: vec3f;
	var texture_dirLightMap: texture_2d<f32>;
	var texture_dirLightMapSampler: sampler;
#endif
fn getLightMap() {
	dLightmap = vec3f(1.0);
	#ifdef STD_LIGHT_TEXTURE
		dLightmap = dLightmap * {STD_LIGHT_TEXTURE_DECODE}(textureSampleBias({STD_LIGHT_TEXTURE_NAME}, {STD_LIGHT_TEXTURE_NAME}Sampler, {STD_LIGHT_TEXTURE_UV}, uniform.textureBias)).{STD_LIGHT_TEXTURE_CHANNEL};
		#ifdef STD_LIGHTMAP_DIR
			var dir: vec3f = textureSampleBias(texture_dirLightMap, texture_dirLightMapSampler, {STD_LIGHT_TEXTURE_UV}, uniform.textureBias).xyz * 2.0 - 1.0;
			var dirDot = dot(dir, dir);
			dLightmapDir = select(vec3(0.0), dir / sqrt(dirDot), dirDot > 0.001);
		#endif
	#endif
	#ifdef STD_LIGHT_VERTEX
		dLightmap = dLightmap * saturate(vVertexColor.{STD_LIGHT_VERTEX_CHANNEL});
	#endif
}
`

var lightSpecularAnisoGGXPS = `
fn calcLightSpecular(gloss: f32, worldNormal: vec3f, viewDir: vec3f, h: vec3f, lightDirNorm: vec3f, tbn: mat3x3f) -> f32 {
	let PI: f32 = 3.141592653589793;
	let roughness: f32 = max((1.0 - gloss) * (1.0 - gloss), 0.001);
	let alphaRoughness: f32 = roughness * roughness;
	let anisotropy: f32 = dAnisotropy;
	let direction: vec2f = dAnisotropyRotation;
	let at: f32 = mix(alphaRoughness, 1.0, anisotropy * anisotropy);
	let ab: f32 = clamp(alphaRoughness, 0.001, 1.0);
	let anisotropicT: vec3f = normalize(tbn * vec3f(direction, 0.0));
	let anisotropicB: vec3f = normalize(cross(tbn[2], anisotropicT));
	let NoH: f32 = dot(worldNormal, h);
	let ToH: f32 = dot(anisotropicT, h);
	let BoH: f32 = dot(anisotropicB, h);
	let a2: f32 = at * ab;
	let v: vec3f = vec3f(ab * ToH, at * BoH, a2 * NoH);
	let v2: f32 = dot(v, v);
	let w2: f32 = a2 / v2;
	let D: f32 = a2 * w2 * w2 * (1.0 / PI);
	let ToV: f32 = dot(anisotropicT, viewDir);
	let BoV: f32 = dot(anisotropicB, viewDir);
	let ToL: f32 = dot(anisotropicT, -lightDirNorm);
	let BoL: f32 = dot(anisotropicB, -lightDirNorm);
	let NoV: f32 = dot(worldNormal, viewDir);
	let NoL: f32 = dot(worldNormal, -lightDirNorm);
	let lambdaV: f32 = NoL * length(vec3f(at * ToV, ab * BoV, NoV));
	let lambdaL: f32 = NoV * length(vec3f(at * ToL, ab * BoL, NoL));
	let G: f32 = 0.5 / (lambdaV + lambdaL);
	return D * G;
}
fn getLightSpecular(h: vec3f, reflDir: vec3f, worldNormal: vec3f, viewDir: vec3f, lightDirNorm: vec3f, gloss: f32, tbn: mat3x3f) -> f32 {
	return calcLightSpecular(gloss, worldNormal, viewDir, h, lightDirNorm, tbn);
}
`

var lightSpecularGGXPS = `
fn calcLightSpecular(gloss: f32, worldNormal: vec3f, viewDir: vec3f, h: vec3f, lightDirNorm: vec3f) -> f32 {
	const PI: f32 = 3.141592653589793;
	let roughness: f32 = max((1.0 - gloss) * (1.0 - gloss), 0.001);
	let alpha: f32 = roughness * roughness;
	let NoH: f32 = max(dot(worldNormal, h), 0.0);
	let NoV: f32 = max(dot(worldNormal, viewDir), 0.0);
	let NoL: f32 = max(dot(worldNormal, -lightDirNorm), 0.0);
	let NoH2: f32 = NoH * NoH;
	let denom: f32 = NoH2 * (alpha - 1.0) + 1.0;
	let D: f32 = alpha / (PI * denom * denom);
	let alpha2: f32 = alpha * alpha;
	let lambdaV: f32 = NoL * sqrt(NoV * NoV * (1.0 - alpha2) + alpha2);
	let lambdaL: f32 = NoV * sqrt(NoL * NoL * (1.0 - alpha2) + alpha2);
	let G: f32 = 0.5 / max(lambdaV + lambdaL, 0.00001);
	return D * G;
}
fn getLightSpecular(h: vec3f, reflDir: vec3f, worldNormal: vec3f, viewDir: vec3f, lightDirNorm: vec3f, gloss: f32, tbn: mat3x3f) -> f32 {
	return calcLightSpecular(gloss, worldNormal, viewDir, h, lightDirNorm);
}
`

var lightSpecularBlinnPS = `
fn calcLightSpecular(gloss: f32, worldNormal: vec3f, h: vec3f) -> f32 {
	let nh: f32 = max( dot( h, worldNormal ), 0.0 );
	var specPow: f32 = exp2(gloss * 11.0);
	specPow = max(specPow, 0.0001);
	return pow(nh, specPow) * (specPow + 2.0) / 8.0;
}
fn getLightSpecular(h: vec3f, reflDir: vec3f, worldNormal: vec3f, viewDir: vec3f, lightDirNorm: vec3f, gloss: f32, tbn: mat3x3f) -> f32 {
	return calcLightSpecular(gloss, worldNormal, h);
}
`

var lightSheenPS = `
fn sheenD(normal: vec3f, h: vec3f, roughness: f32) -> f32 {
	let PI: f32 = 3.141592653589793;
	let invR: f32 = 1.0 / (roughness * roughness);
	var cos2h: f32 = max(dot(normal, h), 0.0);
	cos2h = cos2h * cos2h;
	let sin2h: f32 = max(1.0 - cos2h, 0.0078125);
	return (2.0 + invR) * pow(sin2h, invR * 0.5) / (2.0 * PI);
}
fn sheenV(normal: vec3f, viewDir: vec3f, light: vec3f) -> f32 {
	let NoV: f32 = max(dot(normal, viewDir), 0.000001);
	let NoL: f32 = max(dot(normal, light), 0.000001);
	return 1.0 / (4.0 * (NoL + NoV - NoL * NoV));
}
fn getLightSpecularSheen(h: vec3f, worldNormal: vec3f, viewDir: vec3f, lightDirNorm: vec3f, sheenGloss: f32) -> f32 {
	let D: f32 = sheenD(worldNormal, h, sheenGloss);
	let V: f32 = sheenV(worldNormal, viewDir, -lightDirNorm);
	return D * V;
}`

var linearizeDepthPS = `
#ifndef LINEARIZE_DEPTH
#define LINEARIZE_DEPTH
fn linearizeDepthWithParams(z: f32, cameraParams: vec4f) -> f32 {
	if (cameraParams.w == 0.0) {
		return (cameraParams.z * cameraParams.y) / (cameraParams.y + z * (cameraParams.z - cameraParams.y));
	} else {
		return cameraParams.z + z * (cameraParams.y - cameraParams.z);
	}
}
#ifndef CAMERAPLANES
	#define CAMERAPLANES
	uniform camera_params: vec4f;
#endif
fn linearizeDepth(z: f32) -> f32 {
	return linearizeDepthWithParams(z, uniform.camera_params);
}
#endif
`

var litForwardBackendPS = `
fn evaluateBackend() -> FragmentOutput {
	var output: FragmentOutput;
	#ifdef LIT_SSAO
		litArgs_ao = litArgs_ao * textureSampleLevel(ssaoTexture, ssaoTextureSampler, pcPosition.xy * uniform.ssaoTextureSizeInv, 0.0).r;
	#endif
	#ifdef LIT_NEEDS_NORMAL
		#ifdef LIT_SPECULAR
			getReflDir(litArgs_worldNormal, dViewDirW, litArgs_gloss, dTBN);
		#endif
		#ifdef LIT_CLEARCOAT
			ccReflDirW = normalize(-reflect(dViewDirW, litArgs_clearcoat_worldNormal));
		#endif
	#endif
	#ifdef LIT_SPECULAR_OR_REFLECTION
		#ifdef LIT_METALNESS
			var f0: f32 = 1.0 / litArgs_ior;
			f0 = (f0 - 1.0) / (f0 + 1.0);
			f0 = f0 * f0;
			#ifdef LIT_SPECULARITY_FACTOR
				litArgs_specularity = getSpecularModulate(litArgs_specularity, litArgs_albedo, litArgs_metalness, f0, litArgs_specularityFactor);
			#else
				litArgs_specularity = getSpecularModulate(litArgs_specularity, litArgs_albedo, litArgs_metalness, f0, 1.0);
			#endif
			litArgs_albedo = getAlbedoModulate(litArgs_albedo, litArgs_metalness);
		#endif
		#ifdef LIT_IRIDESCENCE
			var iridescenceFresnel: vec3f = getIridescenceDiffraction(saturate(dot(dViewDirW, litArgs_worldNormal)), litArgs_specularity, litArgs_iridescence_thickness);
		#endif
	#endif
	#ifdef LIT_ADD_AMBIENT
		addAmbient(litArgs_worldNormal);
		#ifdef LIT_SPECULAR
			dDiffuseLight = dDiffuseLight * (1.0 - litArgs_specularity);
		#endif
		#ifdef LIT_SEPARATE_AMBIENT
			var dAmbientLight: vec3f = dDiffuseLight;
			dDiffuseLight = vec3(0.0);
		#endif
	#endif
	#ifndef LIT_OLD_AMBIENT
		dDiffuseLight = dDiffuseLight * uniform.material_ambient;
	#endif
	#ifdef LIT_AO
		#ifndef LIT_OCCLUDE_DIRECT
			occludeDiffuse(litArgs_ao);
		#endif
	#endif
	#ifdef LIT_LIGHTMAP
		addLightMap(
			litArgs_lightmap, 
			litArgs_lightmapDir, 
			litArgs_worldNormal, 
			dViewDirW, 
			dReflDirW, 
			litArgs_gloss, 
			litArgs_specularity, 
			dVertexNormalW,
			dTBN
		#if defined(LIT_IRIDESCENCE)
			, iridescenceFresnel,
			litArgs_iridescence_intensity
		#endif
		);
	#endif
	#ifdef LIT_LIGHTING || LIT_REFLECTIONS
		#ifdef LIT_REFLECTIONS
			#ifdef LIT_CLEARCOAT
				addReflectionCC(ccReflDirW, litArgs_clearcoat_gloss);
			
				#ifdef LIT_SPECULAR_FRESNEL
					ccFresnel = getFresnelCC(dot(dViewDirW, litArgs_clearcoat_worldNormal));
					ccReflection = ccReflection * ccFresnel;
				#else
					ccFresnel = 0.0;
				#endif
			#endif
			#ifdef LIT_SPECULARITY_FACTOR
				ccReflection = ccReflection * litArgs_specularityFactor;
			#endif
			#ifdef LIT_SHEEN
				addReflectionSheen(litArgs_worldNormal, dViewDirW, litArgs_sheen_gloss);
			#endif
			addReflection(dReflDirW, litArgs_gloss);
			#ifdef LIT_FRESNEL_MODEL
				dReflection = vec4f(
					dReflection.rgb * getFresnel(
						dot(dViewDirW, litArgs_worldNormal),
						litArgs_gloss,
						litArgs_specularity
					#if defined(LIT_IRIDESCENCE)
						, iridescenceFresnel,
						litArgs_iridescence_intensity
					#endif
						),
					dReflection.a
				);
			#else
				dReflection = vec4f(dReflection.rgb * litArgs_specularity, dReflection.a);
			#endif
		#endif
		#ifdef AREA_LIGHTS
			dSpecularLight = dSpecularLight * litArgs_specularity;
			#ifdef LIT_SPECULAR
				calcLTCLightValues(litArgs_gloss, litArgs_worldNormal, dViewDirW, litArgs_specularity, litArgs_clearcoat_gloss, litArgs_clearcoat_worldNormal, litArgs_clearcoat_specularity);
			#endif
		#endif
		
		#ifdef LIGHT_COUNT > 0
			#include "lightEvaluationPS, LIGHT_COUNT"
		#endif
		#ifdef LIT_CLUSTERED_LIGHTS
			addClusteredLights(litArgs_worldNormal, dViewDirW, dReflDirW,
				#if defined(LIT_CLEARCOAT)
						ccReflDirW,
				#endif
						litArgs_gloss, litArgs_specularity, dVertexNormalW, dTBN, 
				#if defined(LIT_IRIDESCENCE)
						iridescenceFresnel,
				#endif
						litArgs_clearcoat_worldNormal, litArgs_clearcoat_gloss, litArgs_sheen_gloss, litArgs_iridescence_intensity
			);
		#endif
		#ifdef AREA_LIGHTS
			#ifdef LIT_CLEARCOAT
				litArgs_clearcoat_specularity = 1.0;
			#endif
			#ifdef LIT_SPECULAR
				litArgs_specularity = vec3(1.0);
			#endif
		#endif
		#ifdef LIT_REFRACTION
			addRefraction(
				litArgs_worldNormal, 
				dViewDirW, 
				litArgs_thickness, 
				litArgs_gloss, 
				litArgs_specularity, 
				litArgs_albedo, 
				litArgs_transmission,
				litArgs_ior,
				litArgs_dispersion
				#if defined(LIT_IRIDESCENCE)
					, iridescenceFresnel, 
					litArgs_iridescence_intensity
				#endif
			);
		#endif
	#endif
	#ifdef LIT_AO
		#ifdef LIT_OCCLUDE_DIRECT
			occludeDiffuse(litArgs_ao);
		#endif
		#if LIT_OCCLUDE_SPECULAR != NONE
			occludeSpecular(litArgs_gloss, litArgs_ao, litArgs_worldNormal, dViewDirW);
		#endif
	#endif
	#if !defined(LIT_OPACITY_FADES_SPECULAR)
		#if LIT_BLEND_TYPE == NORMAL || LIT_BLEND_TYPE == PREMULTIPLIED
			var specLum: f32 = dot((dSpecularLight + dReflection.rgb * dReflection.a), vec3f( 0.2126, 0.7152, 0.0722 ));
			#ifdef LIT_CLEARCOAT
				specLum = specLum + dot(ccSpecularLight * litArgs_clearcoat_specularity + ccReflection * litArgs_clearcoat_specularity, vec3f( 0.2126, 0.7152, 0.0722 ));
			#endif
			litArgs_opacity = clamp(litArgs_opacity + gammaCorrectInput(specLum), 0.0, 1.0);
		#endif
		litArgs_opacity = litArgs_opacity * uniform.material_alphaFade;
	#endif
	#ifdef LIT_LIGHTMAP_BAKING
		#ifdef LIT_LIGHTMAP_BAKING_COLOR
			#include "bakeLmEndPS"
		#endif
		#ifdef LIT_LIGHTMAP_BAKING_DIR
			#include "bakeDirLmEndPS"
		#endif
	#else
		#include "endPS"
		#include "outputAlphaPS"
	#endif
	#ifdef LIT_MSDF
		output.color = applyMsdf(output.color);
	#endif
	#include "outputPS"
	#include "debugOutputPS"
	#ifdef LIT_SHADOW_CATCHER
		output.color = vec4f(vec3f(dShadowCatcher), output.color.a);
	#endif
	return output;
}
`

var litForwardDeclarationPS = `
var<private> sReflection: vec3f;
var<private> dVertexNormalW: vec3f;
var<private> dTangentW: vec3f;
var<private> dBinormalW: vec3f;
var<private> dViewDirW: vec3f;
var<private> dReflDirW: vec3f;
var<private> ccReflDirW: vec3f;
var<private> dLightDirNormW: vec3f;
var<private> dAtten: f32;
var<private> dTBN: mat3x3f;
var<private> dReflection: vec4f;
var<private> dDiffuseLight: vec3f;
var<private> dSpecularLight: vec3f;
var<private> ccFresnel: f32;
var<private> ccReflection: vec3f;
var<private> ccSpecularLight: vec3f;
var<private> ccSpecularityNoFres: f32;
var<private> sSpecularLight: vec3f;
#ifdef LIT_DISPERSION
	uniform material_dispersion: f32;
#endif
#ifndef LIT_OPACITY_FADES_SPECULAR
	uniform material_alphaFade: f32;
#endif
#ifdef LIT_SSAO
	var ssaoTexture : texture_2d<f32>;
	var ssaoTextureSampler : sampler;
	uniform ssaoTextureSizeInv: vec2f;
#endif
#ifdef LIT_SHADOW_CATCHER
	var<private> dShadowCatcher: f32 = 1.0;
#endif
#if LIGHT_COUNT > 0
	#include "lightDeclarationPS, LIGHT_COUNT"
#endif
#ifdef LIT_SPECULAR
	#if LIT_FRESNEL_MODEL == NONE && !defined(LIT_REFLECTIONS) && !defined(LIT_DIFFUSE_MAP) 
		#define LIT_OLD_AMBIENT
	#endif
#endif
#ifdef STD_LIGHTMAP_DIR
	uniform bakeDir: f32;
#endif
#ifdef LIT_LIGHTMAP_BAKING_ADD_AMBIENT
	uniform ambientBakeOcclusionContrast: f32;
	uniform ambientBakeOcclusionBrightness: f32;
#endif
`

var litForwardMainPS = `
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	#include "litUserMainStartPS"
	dReflection = vec4f(0.0);
	#ifdef LIT_CLEARCOAT
		ccSpecularLight = vec3f(0.0);
		ccReflection = vec3f(0.0);
	#endif
	#if LIT_NONE_SLICE_MODE == SLICED
		#include "startNineSlicedPS"
	#elif LIT_NONE_SLICE_MODE == TILED
		#include "startNineSlicedTiledPS"
	#endif
	#ifdef LIT_NEEDS_NORMAL
		dVertexNormalW = normalize(vNormalW);
		#ifdef LIT_TANGENTS
			#if defined(LIT_HEIGHTS) || defined(LIT_USE_NORMALS) || defined(LIT_USE_CLEARCOAT_NORMALS) || defined(LIT_GGX_SPECULAR)
				dTangentW = vTangentW;
				dBinormalW = vBinormalW;
			#endif
		#endif
		getViewDir();
		#ifdef LIT_TBN
			getTBN(dTangentW, dBinormalW, dVertexNormalW);
			#ifdef LIT_TWO_SIDED_LIGHTING
				handleTwoSidedLighting();
			#endif
		#endif
	#endif
	evaluateFrontend();
	#include "debugProcessFrontendPS"
	var output: FragmentOutput = evaluateBackend();
	#include "litUserMainEndPS"
	return output;
}
`

var litForwardPostCodePS = `
#ifdef LIT_NEEDS_NORMAL
	#include "cubeMapRotatePS"
	#include "cubeMapProjectPS"
	#include "envProcPS"
#endif
#ifdef LIT_SPECULAR_OR_REFLECTION
	#ifdef LIT_METALNESS
		#include "metalnessModulatePS"
	#endif
	#if LIT_FRESNEL_MODEL == SCHLICK
		#include "fresnelSchlickPS"
	#endif
	#ifdef LIT_IRIDESCENCE
		#include "iridescenceDiffractionPS"
	#endif
#endif
#ifdef LIT_AO
	#include "aoDiffuseOccPS"
	#include "aoSpecOccPS"
#endif
#if LIT_REFLECTION_SOURCE == ENVATLASHQ
	#include "envAtlasPS"
	#include "reflectionEnvHQPS"
#elif LIT_REFLECTION_SOURCE == ENVATLAS
	#include "envAtlasPS"
	#include "reflectionEnvPS"
#elif LIT_REFLECTION_SOURCE == CUBEMAP
	#include "reflectionCubePS"
#elif LIT_REFLECTION_SOURCE == SPHEREMAP
	#include "reflectionSpherePS"
#endif
#ifdef LIT_REFLECTIONS
	#ifdef LIT_CLEARCOAT
		#include "reflectionCCPS"
	#endif
	#ifdef LIT_SHEEN
		#include "reflectionSheenPS"
	#endif
#endif
#ifdef LIT_REFRACTION
	#if defined(LIT_DYNAMIC_REFRACTION)
		#include "refractionDynamicPS"
	#elif defined(LIT_REFLECTIONS)
		#include "refractionCubePS"
	#endif
#endif
#ifdef LIT_SHEEN
	#include "lightSheenPS"
#endif
uniform material_ambient: vec3f;
#ifdef LIT_SPECULAR
	#ifdef LIT_LIGHTING
		#ifdef LIT_GGX_SPECULAR
			#ifdef LIT_ANISOTROPY
				#include "lightSpecularAnisoGGXPS"
			#else
				#include "lightSpecularGGXPS"
			#endif
		#else
			#include "lightSpecularBlinnPS"
		#endif
	#endif
#endif
#include "combinePS"
#ifdef LIT_LIGHTMAP
	#include "lightmapAddPS"
#endif
#ifdef LIT_ADD_AMBIENT
	#include "ambientPS"
#endif
#ifdef LIT_MSDF
	#include "msdfPS"
#endif
#ifdef LIT_NEEDS_NORMAL
	#include "viewDirPS"
	#ifdef LIT_SPECULAR
		#ifdef LIT_ANISOTROPY
			#include "reflDirAnisoPS"
		#else
			#include "reflDirPS"
		#endif
	#endif
#endif
#include "lightingPS"
`

var litForwardPreCodePS = `
#include "basePS"
#include "sphericalPS"
#include "decodePS"
#include "gammaPS"
#include "tonemappingPS"
#include "fogPS"
#if LIT_NONE_SLICE_MODE == SLICED
	#include "baseNineSlicedPS"
#elif LIT_NONE_SLICE_MODE == TILED
	#include "baseNineSlicedTiledPS"
#endif
#ifdef LIT_TBN
	#include "TBNPS"
	#ifdef LIT_TWO_SIDED_LIGHTING
		#include "twoSidedLightingPS"
	#endif
#endif
`

var litMainPS = `
#include "varyingsPS"
#include "litUserDeclarationPS"
#include "frontendDeclPS"
#if defined(PICK_PASS) || defined(PREPASS_PASS)
	#include "frontendCodePS"
	#include "litUserCodePS"
	#include "litOtherMainPS"
#elif defined(SHADOW_PASS)
	#include "frontendCodePS"
	#include "litUserCodePS"
	#include "litShadowMainPS"
#else
	#include "litForwardDeclarationPS"
	#include "litForwardPreCodePS"
	#include "frontendCodePS"
	#include "litForwardPostCodePS"
	#include "litForwardBackendPS"
	#include "litUserCodePS"
	#include "litForwardMainPS"
#endif
`

var litMainVS = `
#include "varyingsVS"
#include  "litUserDeclarationVS"
#ifdef VERTEX_COLOR
	attribute vertex_color: vec4f;
#endif
#ifdef NINESLICED
	varying vMask: vec2f;
	varying vTiledUv: vec2f;
	var<private> dMaskGlobal: vec2f;
	var<private> dTiledUvGlobal: vec2f;
	uniform innerOffset: vec4f;
	uniform outerScale: vec2f;
	uniform atlasRect: vec4f;
#endif
var<private> dPositionW: vec3f;
var<private> dModelMatrix: mat4x4f;
#include "transformCoreVS"
#ifdef UV0
	attribute vertex_texCoord0: vec2f;
	#include "uv0VS"
#endif
#ifdef UV1
	attribute vertex_texCoord1: vec2f;
	#include "uv1VS"
#endif
#ifdef LINEAR_DEPTH
	#ifndef VIEWMATRIX
	#define VIEWMATRIX
		uniform matrix_view: mat4x4f;
	#endif
#endif
#include "transformVS"
#ifdef NORMALS
	#include "normalCoreVS"
	#include "normalVS"
#endif
#ifdef TANGENTS
	attribute vertex_tangent: vec4f;
#endif
#include "uvTransformUniformsPS, UV_TRANSFORMS_COUNT"
#ifdef MSDF
	#include "msdfVS"
#endif
#include  "litUserCodeVS"
#ifdef VERTEX_COLOR
	fn decodeGamma3(raw: vec3f) -> vec3f {
		return pow(raw, vec3f(2.2));
	}
	fn gammaCorrectInputVec4(color: vec4f) -> vec4f {
		return vec4f(decodeGamma3(color.xyz), color.w);
	}
#endif
@vertex
fn vertexMain(input : VertexInput) -> VertexOutput {
	#include "litUserMainStartVS"
	var output : VertexOutput;
	output.position = getPosition();
	output.vPositionW = getWorldPosition();
	#ifdef NORMALS
		output.vNormalW = getNormal();
	#endif
	#ifdef TANGENTS
		output.vTangentW = normalize(dNormalMatrix * vertex_tangent.xyz);
		output.vBinormalW = cross(output.vNormalW, output.vTangentW) * vertex_tangent.w;
	#elif defined(GGX_SPECULAR)
		output.vObjectSpaceUpW = normalize(dNormalMatrix * vec3f(0.0, 1.0, 0.0));
	#endif
	#ifdef UV0
		var uv0: vec2f = getUv0();
		#ifdef UV0_UNMODIFIED
			output.vUv0 = uv0;
		#endif
	#endif
	#ifdef UV1
		var uv1: vec2f = getUv1();
		#ifdef UV1_UNMODIFIED
			output.vUv1 = uv1;
		#endif
	#endif
	#include "uvTransformVS, UV_TRANSFORMS_COUNT"
	#ifdef VERTEX_COLOR
		#ifdef STD_VERTEX_COLOR_GAMMA
			output.vVertexColor = gammaCorrectInputVec4(vertex_color);
		#else
			output.vVertexColor = vertex_color;
		#endif
	#endif
	#ifdef LINEAR_DEPTH
		output.vLinearDepth = -(uniform.matrix_view * vec4f(output.vPositionW, 1.0)).z;
	#endif
	#ifdef MSDF
		unpackMsdfParams();
		output.outline_color = dOutlineColor;
		output.outline_thickness = dOutlineThickness;
		output.shadow_color = dShadowColor;
		output.shadow_offset = dShadowOffset;
	#endif
	#ifdef NINESLICED
		output.vMask = dMaskGlobal;
		output.vTiledUv = dTiledUvGlobal;
	#endif
	#include "litUserMainEndVS"
	return output;
}
`

var litOtherMainPS = `
#ifdef PICK_PASS
	#include "pickPS"
#endif
#ifdef PREPASS_PASS
	#include "floatAsUintPS"
#endif
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	#include "litUserMainStartPS"
	var output: FragmentOutput;
	
	evaluateFrontend();
	#ifdef PICK_PASS
		output.color = getPickOutput();
		#ifdef DEPTH_PICK_PASS
			output.color1 = getPickDepth();
		#endif
	#endif
	#ifdef PREPASS_PASS
		output.color = float2vec4(vLinearDepth);
	#endif
	#include "litUserMainEndPS"
	return output;
}
`

var litShaderArgsPS = `
var<private> litArgs_albedo: vec3f;
var<private> litArgs_opacity: f32;
var<private> litArgs_emission: vec3f;
var<private> litArgs_worldNormal: vec3f;
var<private> litArgs_ao: f32;
var<private> litArgs_lightmap: vec3f;
var<private> litArgs_lightmapDir: vec3f;
var<private> litArgs_metalness: f32;
var<private> litArgs_specularity: vec3f;
var<private> litArgs_specularityFactor: f32;
var<private> litArgs_gloss: f32;
var<private> litArgs_sheen_gloss: f32;
var<private> litArgs_sheen_specularity: vec3f;
var<private> litArgs_transmission: f32;
var<private> litArgs_thickness: f32;
var<private> litArgs_ior: f32;
var<private> litArgs_dispersion: f32;
var<private> litArgs_iridescence_intensity: f32;
var<private> litArgs_iridescence_thickness: f32;
var<private> litArgs_clearcoat_worldNormal: vec3f;
var<private> litArgs_clearcoat_specularity: f32;
var<private> litArgs_clearcoat_gloss: f32;
`

var litShaderCorePS = `
	#if LIT_NONE_SLICE_MODE == TILED
		var<private> textureBias: f32 = -1000.0;
	#else
		uniform textureBias: f32;
	#endif
	#include "litShaderArgsPS"
`

var litShadowMainPS = `
#if LIGHT_TYPE != DIRECTIONAL
	uniform view_position: vec3f;
	uniform light_radius: f32;
#endif
#if SHADOW_TYPE == PCSS_32F
	#include "linearizeDepthPS"
#endif
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
	#include "litUserMainStartPS"
	var output: FragmentOutput;
	evaluateFrontend();
	#ifdef PERSPECTIVE_DEPTH
		var depth: f32 = input.position.z;
		#if SHADOW_TYPE == PCSS_32F
			#if LIGHT_TYPE != DIRECTIONAL
				depth = linearizeDepthWithParams(depth, camera_params);
			#endif
		#endif
	#else
		var depth: f32 = min(distance(uniform.view_position, input.vPositionW) / uniform.light_radius, 0.99999);
		#define MODIFIED_DEPTH
	#endif
	#if SHADOW_TYPE == VSM_16F || SHADOW_TYPE == VSM_32F
		#if SHADOW_TYPE == VSM_32F
			var exponent: f32 = 15.0;
		#else
			var exponent: f32 = 5.54;
		#endif
		var depth_vsm = 2.0 * depth - 1.0;
		depth_vsm = exp(exponent * depth_vsm);
		output.color = vec4f(depth_vsm, depth_vsm * depth_vsm, 1.0, 1.0);
	#else
		#if SHADOW_TYPE == PCSS_32F
			output.color = vec4f(depth, 0.0, 0.0, 1.0);
		#else
			#ifdef MODIFIED_DEPTH
				output.fragDepth = depth;
			#endif
			output.color = vec4f(1.0);
		#endif
	#endif
	#include "litUserMainEndPS"
	
	return output;
}
`

var ltcPS = `
fn LTC_Uv(N: vec3f, V: vec3f, roughness: f32) -> vec2f {
	const LUT_SIZE: f32 = 64.0;
	const LUT_SCALE: f32 = (LUT_SIZE - 1.0) / LUT_SIZE;
	const LUT_BIAS: f32 = 0.5 / LUT_SIZE;
	let dotNV: f32 = saturate(dot( N, V ));
	let uv: vec2f = vec2f( roughness, sqrt( 1.0 - dotNV ) );
	return uv * LUT_SCALE + LUT_BIAS;
}
fn LTC_ClippedSphereFormFactor( f: vec3f ) -> f32 {
	let l: f32 = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
fn LTC_EdgeVectorFormFactor( v1: vec3f, v2: vec3f ) -> vec3f {
	let x: f32 = dot( v1, v2 );
	let y: f32 = abs( x );
	let a: f32 = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	let b: f32 = 3.4175940 + ( 4.1616724 + y ) * y;
	let v: f32 = a / b;
	let inv_sqrt_term = inverseSqrt( max( 1.0 - x * x, 1e-7f ) );
	let theta_sintheta: f32 = select( (0.5 * inv_sqrt_term - v), v, x > 0.0 );
	return cross( v1, v2 ) * theta_sintheta;
}
struct Coords {
	coord0: vec3f,
	coord1: vec3f,
	coord2: vec3f,
	coord3: vec3f,
}
fn LTC_EvaluateRect( N: vec3f, V: vec3f, P: vec3f, mInv: mat3x3f, rectCoords: Coords) -> f32 {
	let v1: vec3f = rectCoords.coord1 - rectCoords.coord0;
	let v2: vec3f = rectCoords.coord3 - rectCoords.coord0;
	let lightNormal: vec3f = cross( v1, v2 );
	let factor: f32 = sign(-dot( lightNormal, P - rectCoords.coord0 ));
	let T1: vec3f = normalize( V - N * dot( V, N ) );
	let T2: vec3f = factor * cross( N, T1 );
	let mat: mat3x3f = mInv * transpose( mat3x3f( T1, T2, N ) );
	var coords: array<vec3f, 4>;
	coords[0] = mat * ( rectCoords.coord0 - P );
	coords[1] = mat * ( rectCoords.coord1 - P );
	coords[2] = mat * ( rectCoords.coord2 - P );
	coords[3] = mat * ( rectCoords.coord3 - P );
	coords[0] = normalize( coords[0] );
	coords[1] = normalize( coords[1] );
	coords[2] = normalize( coords[2] );
	coords[3] = normalize( coords[3] );
	var vectorFormFactor: vec3f = vec3f( 0.0 );
	vectorFormFactor = vectorFormFactor + LTC_EdgeVectorFormFactor( coords[0], coords[1] );
	vectorFormFactor = vectorFormFactor + LTC_EdgeVectorFormFactor( coords[1], coords[2] );
	vectorFormFactor = vectorFormFactor + LTC_EdgeVectorFormFactor( coords[2], coords[3] );
	vectorFormFactor = vectorFormFactor + LTC_EdgeVectorFormFactor( coords[3], coords[0] );
	let result: f32 = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return result;
}
var<private> dLTCCoords: Coords;
fn getLTCLightCoords(lightPos: vec3f, halfWidth: vec3f, halfHeight: vec3f) -> Coords {
	var coords: Coords;
	coords.coord0 = lightPos + halfWidth - halfHeight;
	coords.coord1 = lightPos - halfWidth - halfHeight;
	coords.coord2 = lightPos - halfWidth + halfHeight;
	coords.coord3 = lightPos + halfWidth + halfHeight;
	return coords;
}
var<private> dSphereRadius: f32;
fn getSphereLightCoords(lightPos: vec3f, halfWidth: vec3f, halfHeight: vec3f) -> Coords {
	dSphereRadius = max(length(halfWidth), length(halfHeight));
	let f: vec3f = reflect(normalize(lightPos - uniform.view_position), vNormalW);
	let w: vec3f = normalize(cross(f, halfHeight));
	let h: vec3f = normalize(cross(f, w));
	return getLTCLightCoords(lightPos, w * dSphereRadius, h * dSphereRadius);
}
var<private> dLTCUV: vec2f;
#ifdef LIT_CLEARCOAT
	var<private> ccLTCUV: vec2f;
#endif
fn getLTCLightUV(gloss: f32, worldNormal: vec3f, viewDir: vec3f) -> vec2f {
	let roughness: f32 = max((1.0 - gloss) * (1.0 - gloss), 0.001);
	return LTC_Uv( worldNormal, viewDir, roughness );
}
var<private> dLTCSpecFres: vec3f;
#ifdef LIT_CLEARCOAT
	var<private> ccLTCSpecFres: vec3f;
#endif
fn getLTCLightSpecFres(uv: vec2f, specularity: vec3f) -> vec3f {
	let t2: vec4f = textureSampleLevel(areaLightsLutTex2, areaLightsLutTex2Sampler, uv, 0.0);
	return specularity * t2.x + ( vec3f( 1.0 ) - specularity) * t2.y;
}
fn calcLTCLightValues(gloss: f32, worldNormal: vec3f, viewDir: vec3f, specularity: vec3f, clearcoatGloss: f32, clearcoatWorldNormal: vec3f, clearcoatSpecularity: f32) {
	dLTCUV = getLTCLightUV(gloss, worldNormal, viewDir);
	dLTCSpecFres = getLTCLightSpecFres(dLTCUV, specularity);
	#ifdef LIT_CLEARCOAT
		ccLTCUV = getLTCLightUV(clearcoatGloss, clearcoatWorldNormal, viewDir);
		ccLTCSpecFres = getLTCLightSpecFres(ccLTCUV, vec3f(clearcoatSpecularity));
	#endif
}
fn calcRectLightValues(lightPos: vec3f, halfWidth: vec3f, halfHeight: vec3f) {
	dLTCCoords = getLTCLightCoords(lightPos, halfWidth, halfHeight);
}
fn calcDiskLightValues(lightPos: vec3f, halfWidth: vec3f, halfHeight: vec3f) {
	calcRectLightValues(lightPos, halfWidth, halfHeight);
}
fn calcSphereLightValues(lightPos: vec3f, halfWidth: vec3f, halfHeight: vec3f) {
	dLTCCoords = getSphereLightCoords(lightPos, halfWidth, halfHeight);
}
fn SolveCubic(Coefficient_in: vec4f) -> vec3f {
	let pi: f32 = 3.14159;
	var Coefficient = Coefficient_in;
	Coefficient = vec4f(Coefficient.xyz / Coefficient.w, Coefficient.w);
	let new_yz: vec2f = Coefficient.yz / 3.0;
	Coefficient = vec4f(Coefficient.x, new_yz.x, new_yz.y, Coefficient.w);
	
	let A: f32 = Coefficient.w;
	let B: f32 = Coefficient.z;
	let C: f32 = Coefficient.y;
	let D: f32 = Coefficient.x;
	let Delta: vec3f = vec3f(
		-Coefficient.z * Coefficient.z + Coefficient.y,
		-Coefficient.y * Coefficient.z + Coefficient.x,
		dot(vec2f(Coefficient.z, -Coefficient.y), Coefficient.xy)
	);
	let Discriminant: f32 = dot(vec2f(4.0 * Delta.x, -Delta.y), Delta.zy);
	var xlc: vec2f;
	var xsc: vec2f;
	{
		let A_a: f32 = 1.0;
		let C_a: f32 = Delta.x;
		let D_a: f32 = -2.0 * B * Delta.x + Delta.y;
		let Theta: f32 = atan2(sqrt(Discriminant), -D_a) / 3.0;
		let sqrt_neg_Ca = sqrt(-C_a);
		let x_1a: f32 = 2.0 * sqrt_neg_Ca * cos(Theta);
		let x_3a: f32 = 2.0 * sqrt_neg_Ca * cos(Theta + (2.0 / 3.0) * pi);
		let xl: f32 = select(x_3a, x_1a, (x_1a + x_3a) > 2.0 * B);
		xlc = vec2f(xl - B, A);
	}
	{
		let A_d: f32 = D;
		let C_d: f32 = Delta.z;
		let D_d: f32 = -D * Delta.y + 2.0 * C * Delta.z;
		let Theta: f32 = atan2(D * sqrt(Discriminant), -D_d) / 3.0;
		let sqrt_neg_Cd = sqrt(-C_d);
		let x_1d: f32 = 2.0 * sqrt_neg_Cd * cos(Theta);
		let x_3d: f32 = 2.0 * sqrt_neg_Cd * cos(Theta + (2.0 / 3.0) * pi);
		let xs: f32 = select(x_3d, x_1d, x_1d + x_3d < 2.0 * C);
		xsc = vec2f(-D, xs + C);
	}
	let E: f32 =  xlc.y * xsc.y;
	let F: f32 = -xlc.x * xsc.y - xlc.y * xsc.x;
	let G: f32 =  xlc.x * xsc.x;
	let xmc: vec2f = vec2f(C * F - B * G, -B * F + C * E);
	var Root: vec3f = vec3f(xsc.x / xsc.y, xmc.x / xmc.y, xlc.x / xlc.y);
	if (Root.x < Root.y && Root.x < Root.z) {
		Root = Root.yxz;
	} else if (Root.z < Root.x && Root.z < Root.y) {
		Root = Root.xzy;
	}
	return Root;
}
fn LTC_EvaluateDisk(N: vec3f, V: vec3f, P: vec3f, Minv: mat3x3f, points: Coords) -> f32 {
	let T1: vec3f = normalize(V - N * dot(V, N));
	let T2: vec3f = cross(N, T1);
	let R: mat3x3f = transpose( mat3x3f( T1, T2, N ) );
	var L_: array<vec3f, 3>;
	L_[0] = R * ( points.coord0 - P );
	L_[1] = R * ( points.coord1 - P );
	L_[2] = R * ( points.coord2 - P );
	let C: vec3f  = 0.5 * (L_[0] + L_[2]);
	var V1: vec3f = 0.5 * (L_[1] - L_[2]);
	var V2: vec3f = 0.5 * (L_[1] - L_[0]);
	let C_Minv: vec3f  = Minv * C;
	let V1_Minv: vec3f = Minv * V1;
	let V2_Minv: vec3f = Minv * V2;
	var a: f32;
	var b: f32;
	let d11: f32 = dot(V1_Minv, V1_Minv);
	let d22: f32 = dot(V2_Minv, V2_Minv);
	let d12: f32 = dot(V1_Minv, V2_Minv);
	if (abs(d12) / sqrt(d11 * d22) > 0.0001) {
		let tr: f32 = d11 + d22;
		let det_inner: f32 = -d12 * d12 + d11 * d22;
		let det: f32 = sqrt(det_inner);
		let u: f32 = 0.5 * sqrt(tr - 2.0 * det);
		let v: f32 = 0.5 * sqrt(tr + 2.0 * det);
		let e_max: f32 = (u + v) * (u + v);
		let e_min: f32 = (u - v) * (u - v);
		var V1_: vec3f;
		var V2_: vec3f;
		if (d11 > d22) {
			V1_ = d12 * V1_Minv + (e_max - d11) * V2_Minv;
			V2_ = d12 * V1_Minv + (e_min - d11) * V2_Minv;
		} else {
			V1_ = d12*V2_Minv + (e_max - d22)*V1_Minv;
			V2_ = d12*V2_Minv + (e_min - d22)*V1_Minv;
		}
		a = 1.0 / e_max;
		b = 1.0 / e_min;
		V1 = normalize(V1_);
		V2 = normalize(V2_);
	} else {
		a = 1.0 / dot(V1_Minv, V1_Minv);
		b = 1.0 / dot(V2_Minv, V2_Minv);
		V1 = V1_Minv * sqrt(a);
		V2 = V2_Minv * sqrt(b);
	}
	var V3: vec3f = normalize(cross(V1, V2));
	if (dot(C_Minv, V3) < 0.0) {
		V3 = V3 * -1.0;
	}
	let L: f32  = dot(V3, C_Minv);
	let x0: f32 = dot(V1, C_Minv) / L;
	let y0: f32 = dot(V2, C_Minv) / L;
	let E1: f32 = inverseSqrt(a);
	let E2: f32 = inverseSqrt(b);
	let a_scaled = a * L * L;
	let b_scaled = b * L * L;
	let c0: f32 = a_scaled * b_scaled;
	let c1: f32 = a_scaled * b_scaled * (1.0 + x0 * x0 + y0 * y0) - a_scaled - b_scaled;
	let c2: f32 = 1.0 - a_scaled * (1.0 + x0 * x0) - b_scaled * (1.0 + y0 * y0);
	let c3: f32 = 1.0;
	let roots: vec3f = SolveCubic(vec4f(c0, c1, c2, c3));
	let e1: f32 = roots.x;
	let e2: f32 = roots.y;
	let e3: f32 = roots.z;
	var avgDir: vec3f = vec3f(a_scaled * x0 / (a_scaled - e2), b_scaled * y0 / (b_scaled - e2), 1.0);
	let rotate: mat3x3f = mat3x3f(V1, V2, V3);
	avgDir = rotate * avgDir;
	avgDir = normalize(avgDir);
	let L1: f32 = sqrt(-e2 / e3);
	let L2: f32 = sqrt(-e2 / e1);
	let formFactor: f32 = max(0.0, L1 * L2 * inverseSqrt((1.0 + L1 * L1) * (1.0 + L2 * L2)));
	const LUT_SIZE_disk: f32 = 64.0;
	const LUT_SCALE_disk: f32 = ( LUT_SIZE_disk - 1.0 ) / LUT_SIZE_disk;
	const LUT_BIAS_disk: f32 = 0.5 / LUT_SIZE_disk;
	var uv: vec2f = vec2f(avgDir.z * 0.5 + 0.5, formFactor);
	uv = uv * LUT_SCALE_disk + LUT_BIAS_disk;
	let scale: f32 = textureSampleLevel(areaLightsLutTex2, areaLightsLutTex2Sampler, uv, 0.0).w;
	return formFactor * scale;
}
fn FixNan(value: f32) -> f32 {
	return select(value, 0.0, value != value);
}
fn getRectLightDiffuse(worldNormal: vec3f, viewDir: vec3f, lightDir: vec3f, lightDirNorm: vec3f) -> f32 {
	let identityMat = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
	return LTC_EvaluateRect( worldNormal, viewDir, vPositionW, identityMat, dLTCCoords );
}
fn getDiskLightDiffuse(worldNormal: vec3f, viewDir: vec3f, lightDir: vec3f, lightDirNorm: vec3f) -> f32 {
	let identityMat = mat3x3f(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));
	return FixNan(LTC_EvaluateDisk( worldNormal, viewDir, vPositionW, identityMat, dLTCCoords ));
}
fn getSphereLightDiffuse(worldNormal: vec3f, viewDir: vec3f, lightDir: vec3f, lightDirNorm: vec3f) -> f32 {
	let falloff: f32 = dSphereRadius / (dot(lightDir, lightDir) + dSphereRadius);
	return FixNan(getLightDiffuse(worldNormal, viewDir, lightDirNorm) * falloff);
}
fn getLTCLightInvMat(uv: vec2f) -> mat3x3f {
	let t1: vec4f = textureSampleLevel(areaLightsLutTex1, areaLightsLutTex1Sampler, uv, 0.0);
	return mat3x3f(
		vec3f( t1.x, 0.0, t1.y ),
		vec3f( 0.0, 1.0, 0.0 ),
		vec3f( t1.z, 0.0, t1.w )
	);
}
fn calcRectLightSpecular(worldNormal: vec3f, viewDir: vec3f, uv: vec2f) -> f32 {
	let mInv: mat3x3f = getLTCLightInvMat(uv);
	return LTC_EvaluateRect( worldNormal, viewDir, vPositionW, mInv, dLTCCoords );
}
fn getRectLightSpecular(worldNormal: vec3f, viewDir: vec3f) -> f32 {
	return calcRectLightSpecular(worldNormal, viewDir, dLTCUV);
}
fn calcDiskLightSpecular(worldNormal: vec3f, viewDir: vec3f, uv: vec2f) -> f32 {
	let mInv: mat3x3f = getLTCLightInvMat(uv);
	return LTC_EvaluateDisk( worldNormal, viewDir, vPositionW, mInv, dLTCCoords );
}
fn getDiskLightSpecular(worldNormal: vec3f, viewDir: vec3f) -> f32 {
	return calcDiskLightSpecular(worldNormal, viewDir, dLTCUV);
}
fn getSphereLightSpecular(worldNormal: vec3f, viewDir: vec3f) -> f32 {
	return calcDiskLightSpecular(worldNormal, viewDir, dLTCUV);
}
`

var metalnessPS = `
#ifdef STD_METALNESS_CONSTANT
uniform material_metalness: f32;
#endif
fn getMetalness() {
	var metalness: f32 = 1.0;
	#ifdef STD_METALNESS_CONSTANT
		metalness = metalness * uniform.material_metalness;
	#endif
	#ifdef STD_METALNESS_TEXTURE
		metalness = metalness * textureSampleBias({STD_METALNESS_TEXTURE_NAME}, {STD_METALNESS_TEXTURE_NAME}Sampler, {STD_METALNESS_TEXTURE_UV}, uniform.textureBias).{STD_METALNESS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_METALNESS_VERTEX
	metalness = metalness * saturate(vVertexColor.{STD_METALNESS_VERTEX_CHANNEL});
	#endif
	dMetalness = metalness;
}
`

var msdfPS = `
var texture_msdfMap: texture_2d<f32>;
var texture_msdfMapSampler: sampler;
fn median(r: f32, g: f32, b: f32) -> f32 {
	return max(min(r, g), min(max(r, g), b));
}
fn map(min: f32, max: f32, v: f32) -> f32 {
	return (v - min) / (max - min);
}
uniform font_sdfIntensity: f32;
uniform font_pxrange: f32;
uniform font_textureWidth: f32;
#ifndef LIT_MSDF_TEXT_ATTRIBUTE
	uniform outline_color: vec4f;
	uniform outline_thickness: f32;
	uniform shadow_color: vec4f;
	uniform shadow_offset: vec2f;
#else
	varying outline_color: vec4f;
	varying outline_thickness: f32;
	varying shadow_color: vec4f;
	varying shadow_offset: vec2f;
#endif
fn applyMsdf(color_in: vec4f) -> vec4f {
	#ifndef LIT_MSDF_TEXT_ATTRIBUTE
		var outline_colorValue = uniform.outline_color;
		var outline_thicknessValue = uniform.outline_thickness;
		var shadow_colorValue = uniform.shadow_color;
		var shadow_offsetValue = uniform.shadow_offset;
	#else
		var outline_colorValue = outline_color;
		var outline_thicknessValue = outline_thickness;
		var shadow_colorValue = shadow_color;
		var shadow_offsetValue = shadow_offset;
	#endif
	var color = vec4f(gammaCorrectInputVec3(color_in.rgb), color_in.a);
	let tsample: vec3f = textureSample(texture_msdfMap, texture_msdfMapSampler, vUv0).rgb;
	let uvShdw: vec2f = vUv0 - shadow_offsetValue;
	let ssample: vec3f = textureSample(texture_msdfMap, texture_msdfMapSampler, uvShdw).rgb;
	let sigDist: f32 = median(tsample.r, tsample.g, tsample.b);
	var sigDistShdw: f32 = median(ssample.r, ssample.g, ssample.b);
	let smoothingMax: f32 = 0.2;
	let w: vec2f = abs(dpdx(vUv0)) + abs(dpdy(vUv0));
	let smoothing: f32 = clamp(w.x * uniform.font_textureWidth / uniform.font_pxrange, 0.0, smoothingMax);
	let mapMin: f32 = 0.05;
	let mapMax: f32 = clamp(1.0 - uniform.font_sdfIntensity, mapMin, 1.0);
	let sigDistInner: f32 = map(mapMin, mapMax, sigDist);
	let sigDistOutline: f32 = map(mapMin, mapMax, sigDist + outline_thicknessValue);
	sigDistShdw = map(mapMin, mapMax, sigDistShdw + outline_thicknessValue);
	let center: f32 = 0.5;
	let inside: f32 = smoothstep(center - smoothing, center + smoothing, sigDistInner);
	let outline: f32 = smoothstep(center - smoothing, center + smoothing, sigDistOutline);
	let shadow: f32 = smoothstep(center - smoothing, center + smoothing, sigDistShdw);
	let tcolor_outline: vec4f = outline * vec4f(outline_colorValue.a * outline_colorValue.rgb, outline_colorValue.a);
	var tcolor: vec4f = select(vec4f(0.0), tcolor_outline, outline > inside);
	tcolor = mix(tcolor, color, inside);
	let scolor_shadow: vec4f = shadow * vec4f(shadow_colorValue.a * shadow_colorValue.rgb, shadow_colorValue.a);
	let scolor: vec4f = select(tcolor, scolor_shadow, shadow > outline);
	tcolor = mix(scolor, tcolor, outline);
	tcolor = vec4f(gammaCorrectOutput(tcolor.rgb), tcolor.a);
	return tcolor;
}
`

var metalnessModulatePS = `
fn getSpecularModulate(specularity: vec3f, albedo: vec3f, metalness: f32, f0: f32, specularityFactor: f32) -> vec3f {
	let dielectricF0: vec3f = f0 * specularity * specularityFactor;
	return mix(dielectricF0, albedo, metalness);
}
fn getAlbedoModulate(albedo: vec3f, metalness: f32) -> vec3f {
	return albedo * (1.0 - metalness);
}
`

var morphPS = `
	varying uv0: vec2f;
	var morphTexture: texture_2d_array<f32>;
	uniform morphFactor: array<f32, {MORPH_TEXTURE_MAX_COUNT}>;
	uniform morphIndex: array<u32, {MORPH_TEXTURE_MAX_COUNT}>;
	uniform count: u32;
	@fragment
	fn fragmentMain(input : FragmentInput) -> FragmentOutput {
		var color = vec3f(0, 0, 0);
		let textureDims = textureDimensions(morphTexture);
		let pixelCoords = vec2i(input.uv0 * vec2f(textureDims));
		
		for (var i: u32 = 0; i < uniform.count; i = i + 1) {
			var textureIndex: u32 = uniform.morphIndex[i].element;
			var delta = textureLoad(morphTexture, pixelCoords, textureIndex, 0).xyz;
			color += uniform.morphFactor[i].element * delta;
		}
		var output: FragmentOutput;
		output.color = vec4f(color, 1.0);
		return output;
	}
`

var morphVS = `
	attribute vertex_position: vec2f;
	varying uv0: vec2f;
	@vertex
	fn vertexMain(input: VertexInput) -> VertexOutput {
		var output: VertexOutput;
		output.position = vec4f(input.vertex_position, 0.5, 1.0);
		output.uv0 = input.vertex_position * 0.5 + vec2f(0.5, 0.5);
		return output;
	}
`

var msdfVS = `
attribute vertex_outlineParameters: vec3f;
attribute vertex_shadowParameters: vec3f;
varying outline_color: vec4f;
varying outline_thickness: f32;
varying shadow_color: vec4f;
varying shadow_offset: vec2f;
var<private> dOutlineColor: vec4f;
var<private> dOutlineThickness: f32;
var<private> dShadowColor: vec4f;
var<private> dShadowOffset: vec2f;
fn unpackMsdfParams() {
	let little: vec3f = vertex_outlineParameters % vec3f(256.0);
	let big: vec3f = (vertex_outlineParameters - little) / 256.0;
	dOutlineColor = vec4f(little.x, big.x, little.y, big.y) / 255.0;
	dOutlineThickness = little.z / 255.0 * 0.2;
	let little_shadow = vertex_shadowParameters % vec3f(256.0);
	let big_shadow = (vertex_shadowParameters - little_shadow) / 256.0;
	dShadowColor = vec4f(little_shadow.x, big_shadow.x, little_shadow.y, big_shadow.y) / 255.0;
	dShadowOffset = (vec2f(little_shadow.z, big_shadow.z) / 127.0 - 1.0) * 0.005;
}
`

var normalVS = `
var<private> dNormalMatrix: mat3x3f;
fn getNormal() -> vec3f {
	dNormalMatrix = getNormalMatrix(dModelMatrix);
	let localNormal: vec3f = getLocalNormal(vertex_normal);
	return normalize(dNormalMatrix * localNormal);
}`

var normalCoreVS = `
attribute vertex_normal: vec3f;
uniform matrix_normal: mat3x3f;
#ifdef MORPHING_NORMAL
	#ifdef MORPHING_INT
		var morphNormalTex: texture_2d<u32>;
		var morphNormalTexSampler: sampler;
	#else
		var morphNormalTex: texture_2d<f32>;
		var morphNormalTexSampler: sampler;
	#endif
#endif
fn getLocalNormal(vertexNormal: vec3f) -> vec3f {
	var localNormal: vec3f = vertexNormal;
	#ifdef MORPHING_NORMAL
		let morphUV: vec2i = getTextureMorphCoords();
		#ifdef MORPHING_INT
			let morphNormalInt: vec4u = textureLoad(morphNormalTex, morphUV, 0);
			let morphNormalF: vec3f = vec3f(morphNormalInt.xyz) / 65535.0 * 2.0 - 1.0;
			localNormal = localNormal + morphNormalF;
		#else
			let morphNormal: vec3f = textureLoad(morphNormalTex, morphUV, 0).xyz;
			localNormal = localNormal + morphNormal;
		#endif
	#endif
	return localNormal;
}
#if defined(SKIN) || defined(BATCH)
	fn getNormalMatrix(modelMatrix: mat4x4f) -> mat3x3f {
		return mat3x3f(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz);
	}
#elif defined(INSTANCING)
	fn getNormalMatrix(modelMatrix: mat4x4f) -> mat3x3f {
		return mat3x3f(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz);
	}
#else
	fn getNormalMatrix(modelMatrix: mat4x4f) -> mat3x3f {
		return uniform.matrix_normal;
	}
#endif
`

var normalMapPS = `
#ifdef STD_NORMAL_TEXTURE
	uniform material_bumpiness: f32;
#endif
#ifdef STD_NORMALDETAIL_TEXTURE
	uniform material_normalDetailMapBumpiness: f32;
	fn blendNormals(inN1: vec3f, inN2: vec3f) -> vec3f {
		let n1: vec3f = inN1 + vec3f(0.0, 0.0, 1.0);
		let n2: vec3f = inN2 * vec3f(-1.0, -1.0, 1.0);
		return n1 * dot(n1, n2) / n1.z - n2;
	}
#endif
fn getNormal() {
#ifdef STD_NORMAL_TEXTURE
	var normalMap: vec3f = {STD_NORMAL_TEXTURE_DECODE}(textureSampleBias({STD_NORMAL_TEXTURE_NAME}, {STD_NORMAL_TEXTURE_NAME}Sampler, {STD_NORMAL_TEXTURE_UV}, uniform.textureBias));
	normalMap = mix(vec3f(0.0, 0.0, 1.0), normalMap, uniform.material_bumpiness);
	#ifdef STD_NORMALDETAIL_TEXTURE
		var normalDetailMap: vec3f = {STD_NORMALDETAIL_TEXTURE_DECODE}(textureSampleBias({STD_NORMALDETAIL_TEXTURE_NAME}, {STD_NORMALDETAIL_TEXTURE_NAME}Sampler, {STD_NORMALDETAIL_TEXTURE_UV}, uniform.textureBias));
		normalDetailMap = mix(vec3f(0.0, 0.0, 1.0), normalDetailMap, uniform.material_normalDetailMapBumpiness);
		normalMap = blendNormals(normalMap, normalDetailMap);
	#endif
	dNormalW = normalize(dTBN * normalMap);
#else
	dNormalW = dVertexNormalW;
#endif
}
`

var opacityPS = `
uniform material_opacity: f32;
fn getOpacity() {
	dAlpha = uniform.material_opacity;
	#ifdef STD_OPACITY_TEXTURE
	dAlpha = dAlpha * textureSampleBias({STD_OPACITY_TEXTURE_NAME}, {STD_OPACITY_TEXTURE_NAME}Sampler, {STD_OPACITY_TEXTURE_UV}, uniform.textureBias).{STD_OPACITY_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_OPACITY_VERTEX
	dAlpha = dAlpha * clamp(vVertexColor.{STD_OPACITY_VERTEX_CHANNEL}, 0.0, 1.0);
	#endif
}
`

var opacityDitherPS = `
#if STD_OPACITY_DITHER == BAYER8
	#include "bayerPS"
#endif
uniform blueNoiseJitter: vec4f;
#if STD_OPACITY_DITHER == BLUENOISE
	var blueNoiseTex32 : texture_2d<f32>;
	var blueNoiseTex32Sampler : sampler;
#endif
fn opacityDither(alpha: f32, id: f32) {
	#if STD_OPACITY_DITHER == BAYER8
		var noise: f32 = bayer8(floor((pcPosition.xy + uniform.blueNoiseJitter.xy + id) % vec2f(8.0))) / 64.0;
	#else
		#if STD_OPACITY_DITHER == BLUENOISE
			var uv = fract(pcPosition.xy / 32.0 + uniform.blueNoiseJitter.xy + id);
			var noise: f32 = textureSampleLevel(blueNoiseTex32, blueNoiseTex32Sampler, uv, 0.0).y;
		#endif
		#if STD_OPACITY_DITHER == IGNNOISE
			var magic = vec3f(0.06711056, 0.00583715, 52.9829189);
			var noise: f32 = fract(magic.z * fract(dot(pcPosition.xy + uniform.blueNoiseJitter.xy + id, magic.xy)));
		#endif
	#endif
	noise = pow(noise, 2.2);
	if (alpha < noise) {
		discard;
	}
}
`

var outputPS = `
`

var outputAlphaPS = `
#if LIT_BLEND_TYPE == NORMAL || LIT_BLEND_TYPE == ADDITIVEALPHA || defined(LIT_ALPHA_TO_COVERAGE)
	output.color = vec4f(output.color.rgb, litArgs_opacity);
#elif LIT_BLEND_TYPE == PREMULTIPLIED
	output.color = vec4f(output.color.rgb * litArgs_opacity, litArgs_opacity);
#else
	output.color = vec4f(output.color.rgb, 1.0);
#endif
`

var outputTex2DPS = `
varying vUv0: vec2f;
var source: texture_2d<f32>;
var sourceSampler: sampler;
@fragment fn fragmentMain(input : FragmentInput) -> FragmentOutput {
	var output: FragmentOutput;
	output.color = textureSample(source, sourceSampler, input.vUv0);
	return output;
}
`

var sheenPS = `
uniform material_sheen: vec3f;
fn getSheen() {
	var sheenColor = uniform.material_sheen;
	#ifdef STD_SHEEN_TEXTURE
	sheenColor = sheenColor * {STD_SHEEN_TEXTURE_DECODE}(textureSampleBias({STD_SHEEN_TEXTURE_NAME}, {STD_SHEEN_TEXTURE_NAME}Sampler, {STD_SHEEN_TEXTURE_UV}, uniform.textureBias)).{STD_SHEEN_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_SHEEN_VERTEX
	sheenColor = sheenColor * saturate3(vVertexColor.{STD_SHEEN_VERTEX_CHANNEL});
	#endif
	sSpecularity = sheenColor;
}
`

var sheenGlossPS = `
uniform material_sheenGloss: f32;
fn getSheenGlossiness() {
	var sheenGlossiness = uniform.material_sheenGloss;
	#ifdef STD_SHEENGLOSS_TEXTURE
	sheenGlossiness = sheenGlossiness * textureSampleBias({STD_SHEENGLOSS_TEXTURE_NAME}, {STD_SHEENGLOSS_TEXTURE_NAME}Sampler, {STD_SHEENGLOSS_TEXTURE_UV}, uniform.textureBias).{STD_SHEENGLOSS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_SHEENGLOSS_VERTEX
	sheenGlossiness = sheenGlossiness * saturate(vVertexColor.{STD_SHEENGLOSS_VERTEX_CHANNEL});
	#endif
	#ifdef STD_SHEENGLOSS_INVERT
	sheenGlossiness = 1.0 - sheenGlossiness;
	#endif
	sGlossiness = sheenGlossiness + 0.0000001;
}
`

var parallaxPS = `
uniform material_heightMapFactor: f32;
fn getParallax() {
	var parallaxScale = uniform.material_heightMapFactor;
	var height: f32 = textureSampleBias({STD_HEIGHT_TEXTURE_NAME}, {STD_HEIGHT_TEXTURE_NAME}Sampler, {STD_HEIGHT_TEXTURE_UV}, uniform.textureBias).{STD_HEIGHT_TEXTURE_CHANNEL};
	height = height * parallaxScale - parallaxScale * 0.5;
	var viewDirT: vec3f = dViewDirW * dTBN;
	viewDirT.z = viewDirT.z + 0.42;
	dUvOffset = height * (viewDirT.xy / viewDirT.z);
}
`

var pickPS = `
fn encodePickOutput(id: u32) -> vec4f {
	let inv: vec4f = vec4f(1.0 / 255.0);
	let shifts: vec4u = vec4u(16u, 8u, 0u, 24u);
	let col: vec4u = (vec4u(id) >> shifts) & vec4u(0xffu);
	return vec4f(col) * inv;
}
#ifndef PICK_CUSTOM_ID
	uniform meshInstanceId: u32;
	fn getPickOutput() -> vec4f {
		return encodePickOutput(uniform.meshInstanceId);
	}
#endif
#ifdef DEPTH_PICK_PASS
	#include "floatAsUintPS"
	fn getPickDepth() -> vec4f {
		return float2uint(pcPosition.z);
	}
#endif
`

var reflDirPS = `
fn getReflDir(worldNormal: vec3f, viewDir: vec3f, gloss: f32, tbn: mat3x3f) {
	dReflDirW = normalize(-reflect(viewDir, worldNormal));
}
`

var reflDirAnisoPS = `
fn getReflDir(worldNormal: vec3f, viewDir: vec3f, gloss: f32, tbn: mat3x3f) {
	let roughness: f32 = sqrt(1.0 - min(gloss, 1.0));
	let direction: vec2f = dAnisotropyRotation;
	let anisotropicT: vec3f = normalize(tbn * vec3f(direction, 0.0));
	let anisotropicB: vec3f = normalize(cross(tbn[2], anisotropicT));
	let anisotropy: f32 = dAnisotropy;
	let anisotropicDirection: vec3f = anisotropicB;
	let anisotropicTangent: vec3f = cross(anisotropicDirection, viewDir);
	let anisotropicNormal: vec3f = cross(anisotropicTangent, anisotropicDirection);
	let bendFactor: f32 = 1.0 - anisotropy * (1.0 - roughness);
	let bendFactor4: f32 = bendFactor * bendFactor * bendFactor * bendFactor;
	let bentNormal: vec3f = normalize(mix(normalize(anisotropicNormal), normalize(worldNormal), bendFactor4));
	dReflDirW = reflect(-viewDir, bentNormal);
}`

var reflectionCCPS = `
#ifdef LIT_CLEARCOAT
fn addReflectionCC(reflDir: vec3f, gloss: f32) {
	ccReflection = ccReflection + calcReflection(reflDir, gloss);
}
#endif
`

var reflectionCubePS = `
var texture_cubeMap: texture_cube<f32>;
var texture_cubeMapSampler: sampler;
uniform material_reflectivity: f32;
fn calcReflection(reflDir: vec3f, gloss: f32) -> vec3f {
	var lookupVec: vec3f = cubeMapProject(reflDir);
	lookupVec.x = lookupVec.x * -1.0;
	return {reflectionDecode}(textureSample(texture_cubeMap, texture_cubeMapSampler, lookupVec));
}
fn addReflection(reflDir: vec3f, gloss: f32) {
	dReflection = dReflection + vec4f(calcReflection(reflDir, gloss), uniform.material_reflectivity);
}
`

var reflectionEnvHQPS = `
#ifndef ENV_ATLAS
	#define ENV_ATLAS
	var texture_envAtlas: texture_2d<f32>;
	var texture_envAtlasSampler: sampler;
#endif
var texture_cubeMap: texture_cube<f32>;
var texture_cubeMapSampler: sampler;
uniform material_reflectivity: f32;
fn calcReflection(reflDir: vec3f, gloss: f32) -> vec3f {
	let dir: vec3f = cubeMapProject(reflDir) * vec3f(-1.0, 1.0, 1.0);
	let uv: vec2f = toSphericalUv(dir);
	let level: f32 = saturate(1.0 - gloss) * 5.0;
	let ilevel: f32 = floor(level);
	let flevel: f32 = level - ilevel;
	let sharp: vec3f = {reflectionCubemapDecode}(textureSample(texture_cubeMap, texture_cubeMapSampler, dir));
	let roughA: vec3f = {reflectionDecode}(textureSample(texture_envAtlas, texture_envAtlasSampler, mapRoughnessUv(uv, ilevel)));
	let roughB: vec3f = {reflectionDecode}(textureSample(texture_envAtlas, texture_envAtlasSampler, mapRoughnessUv(uv, ilevel + 1.0)));
	return processEnvironment(mix(sharp, mix(roughA, roughB, flevel), min(level, 1.0)));
}
fn addReflection(reflDir: vec3f, gloss: f32) {
	dReflection = dReflection + vec4f(calcReflection(reflDir, gloss), uniform.material_reflectivity);
}
`

var reflectionEnvPS = `
#ifndef ENV_ATLAS
#define ENV_ATLAS
	var texture_envAtlas: texture_2d<f32>;
	var texture_envAtlasSampler: sampler;
#endif
uniform material_reflectivity: f32;
fn shinyMipLevel(uv: vec2f) -> f32 {
	let dx: vec2f = dpdx(uv);
	let dy: vec2f = dpdy(uv);
	let uv2: vec2f = vec2f(fract(uv.x + 0.5), uv.y);
	let dx2: vec2f = dpdx(uv2);
	let dy2: vec2f = dpdy(uv2);
	let maxd: f32 = min(max(dot(dx, dx), dot(dy, dy)), max(dot(dx2, dx2), dot(dy2, dy2)));
	return clamp(0.5 * log2(maxd) - 1.0 + uniform.textureBias, 0.0, 5.0);
}
fn calcReflection(reflDir: vec3f, gloss: f32) -> vec3f {
	let dir: vec3f = cubeMapProject(reflDir) * vec3f(-1.0, 1.0, 1.0);
	let uv: vec2f = toSphericalUv(dir);
	let level: f32 = saturate(1.0 - gloss) * 5.0;
	let ilevel: f32 = floor(level);
	let level2: f32 = shinyMipLevel(uv * atlasSize);
	let ilevel2: f32 = floor(level2);
	var uv0: vec2f;
	var uv1: vec2f;
	var weight: f32;
	if (ilevel == 0.0) {
		uv0 = mapShinyUv(uv, ilevel2);
		uv1 = mapShinyUv(uv, ilevel2 + 1.0);
		weight = level2 - ilevel2;
	} else {
		uv0 = mapRoughnessUv(uv, ilevel);
		uv1 = uv0;
		weight = 0.0;
	}
	let linearA: vec3f = {reflectionDecode}(textureSample(texture_envAtlas, texture_envAtlasSampler, uv0));
	let linearB: vec3f = {reflectionDecode}(textureSample(texture_envAtlas, texture_envAtlasSampler, uv1));
	let linear0: vec3f = mix(linearA, linearB, weight);
	let linear1: vec3f = {reflectionDecode}(textureSample(texture_envAtlas, texture_envAtlasSampler, mapRoughnessUv(uv, ilevel + 1.0)));
	return processEnvironment(mix(linear0, linear1, level - ilevel));
}
fn addReflection(reflDir: vec3f, gloss: f32) {
	dReflection = dReflection + vec4f(calcReflection(reflDir, gloss), uniform.material_reflectivity);
}
`

var reflectionSpherePS = `
#ifndef VIEWMATRIX
	#define VIEWMATRIX
	uniform matrix_view: mat4x4f;
#endif
var texture_sphereMap: texture_2d<f32>;
var texture_sphereMapSampler: sampler;
uniform material_reflectivity: f32;
fn calcReflection(reflDir: vec3f, gloss: f32) -> vec3f {
	let viewRotationMatrix = mat3x3f(uniform.matrix_view[0].xyz, uniform.matrix_view[1].xyz, uniform.matrix_view[2].xyz);
	let reflDirV: vec3f = viewRotationMatrix * reflDir;
	let m: f32 = 2.0 * sqrt(dot(reflDirV.xy, reflDirV.xy) + (reflDirV.z + 1.0) * (reflDirV.z + 1.0));
	let sphereMapUv: vec2f = reflDirV.xy / m + 0.5;
	return {reflectionDecode}(textureSample(texture_sphereMap, texture_sphereMapSampler, sphereMapUv));
}
fn addReflection(reflDir: vec3f, gloss: f32) {
	dReflection = dReflection + vec4f(calcReflection(reflDir, gloss), uniform.material_reflectivity);
}
`

var reflectionSheenPS = `
fn addReflectionSheen(worldNormal: vec3f, viewDir: vec3f, gloss: f32) {
	let NoV: f32 = dot(worldNormal, viewDir);
	let alphaG: f32 = gloss * gloss;
	let a: f32 = select(
		-8.48 * alphaG + 14.3 * gloss - 9.95,
		-339.2 * alphaG + 161.4 * gloss - 25.9,
		gloss < 0.25
	);
	let b: f32 = select(
		1.97 * alphaG - 3.27 * gloss + 0.72,
		44.0 * alphaG - 23.7 * gloss + 3.26,
		gloss < 0.25
	);
	let dg_add: f32 = select(
		0.1 * ( gloss - 0.25 ),
		0.0,
		gloss < 0.25
	);
	let dg: f32 = exp( a * NoV + b ) + dg_add;
	sReflection = sReflection + (calcReflection(worldNormal, 0.0) * saturate(dg));
}`

var refractionCubePS = `
fn refract2(viewVec: vec3f, normal: vec3f, IOR: f32) -> vec3f {
	let vn: f32 = dot(viewVec, normal);
	let k: f32 = 1.0 - IOR * IOR * (1.0 - vn * vn);
	let refrVec: vec3f = IOR * viewVec - (IOR * vn + sqrt(k)) * normal;
	return refrVec;
}
fn addRefraction(
	worldNormal: vec3f,
	viewDir: vec3f,
	thickness: f32,
	gloss: f32,
	specularity: vec3f,
	albedo: vec3f,
	transmission: f32,
	refractionIndex: f32,
	dispersion: f32
#if defined(LIT_IRIDESCENCE)
	, iridescenceFresnel: vec3f,
	iridescenceIntensity: f32
#endif
) {
	let tmpRefl: vec4f = dReflection;
	let reflectionDir: vec3f = refract2(-viewDir, worldNormal, refractionIndex);
	dReflection = vec4f(0.0);
	addReflection(reflectionDir, gloss);
	dDiffuseLight = mix(dDiffuseLight, dReflection.rgb * albedo, transmission);
	dReflection = tmpRefl;
}
`

var refractionDynamicPS = `
uniform material_invAttenuationDistance: f32;
uniform material_attenuation: vec3f;
fn evalRefractionColor(refractionVector: vec3f, gloss: f32, refractionIndex: f32) -> vec3f {
	let pointOfRefraction: vec4f = vec4f(vPositionW + refractionVector, 1.0);
	let projectionPoint: vec4f = uniform.matrix_viewProjection * pointOfRefraction;
	let uv: vec2f = getGrabScreenPos(projectionPoint);
	let iorToRoughness: f32 = (1.0 - gloss) * clamp((1.0 / refractionIndex) * 2.0 - 2.0, 0.0, 1.0);
	let refractionLod: f32 = log2(uniform.uScreenSize.x) * iorToRoughness;
	var refraction: vec3f = textureSampleLevel(uSceneColorMap, uSceneColorMapSampler, uv, refractionLod).rgb;
	#ifdef SCENE_COLORMAP_GAMMA
		refraction = decodeGamma3(refraction);
	#endif
	return refraction;
}
fn addRefraction(
	worldNormal: vec3f,
	viewDir: vec3f,
	thickness: f32,
	gloss: f32,
	specularity: vec3f,
	albedo: vec3f,
	transmission: f32,
	refractionIndex: f32,
	dispersion: f32,
#if defined(LIT_IRIDESCENCE)
	iridescenceFresnel: vec3f,
	iridescenceIntensity: f32
#endif
) {
	var modelScale: vec3f;
	modelScale.x = length(uniform.matrix_model[0].xyz);
	modelScale.y = length(uniform.matrix_model[1].xyz);
	modelScale.z = length(uniform.matrix_model[2].xyz);
	let scale: vec3f = thickness * modelScale;
	var refractionVector = normalize(refract(-viewDir, worldNormal, refractionIndex)) * scale;
	var refraction = evalRefractionColor(refractionVector, gloss, refractionIndex);
	#ifdef LIT_DISPERSION
		let halfSpread: f32 = (1.0 / refractionIndex - 1.0) * 0.025 * dispersion;
		let refractionIndexR: f32 = refractionIndex - halfSpread;
		refractionVector = normalize(refract(-viewDir, worldNormal, refractionIndexR)) * scale;
		refraction.r = evalRefractionColor(refractionVector, gloss, refractionIndexR).r;
		let refractionIndexB: f32 = refractionIndex + halfSpread;
		refractionVector = normalize(refract(-viewDir, worldNormal, refractionIndexB)) * scale;
		refraction.b = evalRefractionColor(refractionVector, gloss, refractionIndexB).b;
	#endif
	var transmittance: vec3f;
	if (uniform.material_invAttenuationDistance != 0.0)
	{
		let attenuation: vec3f = -log(uniform.material_attenuation) * uniform.material_invAttenuationDistance;
		transmittance = exp(-attenuation * length(refractionVector));
	}
	else
	{
		transmittance = vec3f(1.0);
	}
	let fresnel: vec3f = vec3f(1.0) -
		getFresnel(
			dot(viewDir, worldNormal),
			gloss,
			specularity
		#if defined(LIT_IRIDESCENCE)
			, iridescenceFresnel,
			iridescenceIntensity
		#endif
		);
	dDiffuseLight = mix(dDiffuseLight, refraction * transmittance * fresnel, transmission);
}
`

var reprojectPS = `
varying vUv0: vec2f;
#ifdef CUBEMAP_SOURCE
	var sourceCube: texture_cube<f32>;
	var sourceCubeSampler : sampler;
#else
	var sourceTex: texture_2d<f32>;
	var sourceTexSampler : sampler;
#endif
#ifdef USE_SAMPLES_TEX
	var samplesTex: texture_2d<f32>;
	var samplesTexSampler : sampler;
	uniform samplesTexInverseSize: vec2f;
#endif
uniform params: vec3f;
fn targetFace() -> f32 { return uniform.params.x; }
fn targetTotalPixels() -> f32 { return uniform.params.y; }
fn sourceTotalPixels() -> f32 { return uniform.params.z; }
const PI: f32 = 3.141592653589793;
fn saturate(x: f32) -> f32 {
	return clamp(x, 0.0, 1.0);
}
#include "decodePS"
#include "encodePS"
fn modifySeams(dir: vec3f, scale: f32) -> vec3f {
	let adir = abs(dir);
	let M = max(max(adir.x, adir.y), adir.z);
	return dir / M * vec3f(
		select(scale, 1.0, adir.x == M),
		select(scale, 1.0, adir.y == M),
		select(scale, 1.0, adir.z == M)
	);
}
fn toSpherical(dir: vec3f) -> vec2f {
	let nonZeroXZ = any(dir.xz != vec2f(0.0, 0.0));
	return vec2f(select(0.0, atan2(dir.x, dir.z), nonZeroXZ), asin(dir.y));
}
fn fromSpherical(uv: vec2f) -> vec3f {
	return vec3f(cos(uv.y) * sin(uv.x),
				sin(uv.y),
				cos(uv.y) * cos(uv.x));
}
fn getDirectionEquirect(uv: vec2f) -> vec3f {
	return fromSpherical((vec2f(uv.x, 1.0 - uv.y) * 2.0 - 1.0) * vec2f(PI, PI * 0.5));
}
fn signNotZero(k: f32) -> f32 {
	return select(-1.0, 1.0, k >= 0.0);
}
fn signNotZeroVec2(v: vec2f) -> vec2f {
	return vec2f(signNotZero(v.x), signNotZero(v.y));
}
fn octDecode(o: vec2f) -> vec3f {
	var v = vec3f(o.x, 1.0 - abs(o.x) - abs(o.y), o.y);
	if (v.y < 0.0) {
		var temp: vec2f = (1.0 - abs(v.zx)) * signNotZeroVec2(v.xz);
		v = vec3f(temp.x, v.y, temp.y);
	}
	return normalize(v);
}
fn getDirectionOctahedral(uv: vec2f) -> vec3f {
	return octDecode(vec2f(uv.x, 1.0 - uv.y) * 2.0 - 1.0);
}
fn octEncode(v: vec3f) -> vec2f {
	let l1norm = abs(v.x) + abs(v.y) + abs(v.z);
	var result = v.xz * (1.0 / l1norm);
	if (v.y < 0.0) {
		result = (1.0 - abs(result.yx)) * signNotZeroVec2(result.xy);
	}
	return result;
}
#ifdef CUBEMAP_SOURCE
	fn sampleCubemapDir(dir: vec3f) -> vec4f {
		return textureSample(sourceCube, sourceCubeSampler, modifySeams(dir, 1.0));
	}
	fn sampleCubemapSph(sph: vec2f) -> vec4f {
		return sampleCubemapDir(fromSpherical(sph));
	}
	fn sampleCubemapDirLod(dir: vec3f, mipLevel: f32) -> vec4f {
		return textureSampleLevel(sourceCube, sourceCubeSampler, modifySeams(dir, 1.0), mipLevel);
	}
	fn sampleCubemapSphLod(sph: vec2f, mipLevel: f32) -> vec4f {
		return sampleCubemapDirLod(fromSpherical(sph), mipLevel);
	}
#else
	fn sampleEquirectSph(sph: vec2f) -> vec4f {
		let uv = sph / vec2f(PI * 2.0, PI) + 0.5;
		return textureSample(sourceTex, sourceTexSampler, vec2f(uv.x, 1.0 - uv.y));
	}
	fn sampleEquirectDir(dir: vec3f) -> vec4f {
		return sampleEquirectSph(toSpherical(dir));
	}
	fn sampleEquirectSphLod(sph: vec2f, mipLevel: f32) -> vec4f {
		let uv = sph / vec2f(PI * 2.0, PI) + 0.5;
		return textureSampleLevel(sourceTex, sourceTexSampler, vec2f(uv.x, 1.0 - uv.y), mipLevel);
	}
	fn sampleEquirectDirLod(dir: vec3f, mipLevel: f32) -> vec4f {
		return sampleEquirectSphLod(toSpherical(dir), mipLevel);
	}
	fn sampleOctahedralDir(dir: vec3f) -> vec4f {
		let uv = octEncode(dir) * 0.5 + 0.5;
		return textureSample(sourceTex, sourceTexSampler, vec2f(uv.x, 1.0 - uv.y));
	}
	fn sampleOctahedralSph(sph: vec2f) -> vec4f {
		return sampleOctahedralDir(fromSpherical(sph));
	}
	fn sampleOctahedralDirLod(dir: vec3f, mipLevel: f32) -> vec4f {
		let uv = octEncode(dir) * 0.5 + 0.5;
		return textureSampleLevel(sourceTex, sourceTexSampler, vec2f(uv.x, 1.0 - uv.y), mipLevel);
	}
	fn sampleOctahedralSphLod(sph: vec2f, mipLevel: f32) -> vec4f {
		return sampleOctahedralDirLod(fromSpherical(sph), mipLevel);
	}
#endif
fn getDirectionCubemap(uv: vec2f) -> vec3f {
	let st = uv * 2.0 - 1.0;
	let face = targetFace();
	var vec: vec3f;
	if (face == 0.0) {
		vec = vec3f(1, -st.y, -st.x);
	} else if (face == 1.0) {
		vec = vec3f(-1, -st.y, st.x);
	} else if (face == 2.0) {
		vec = vec3f(st.x, 1, st.y);
	} else if (face == 3.0) {
		vec = vec3f(st.x, -1, -st.y);
	} else if (face == 4.0) {
		vec = vec3f(st.x, -st.y, 1);
	} else {
		vec = vec3f(-st.x, -st.y, -1);
	}
	return normalize(modifySeams(vec, 1.0));
}
fn matrixFromVector(n: vec3f) -> mat3x3f {
	let a = 1.0 / (1.0 + n.z);
	let b = -n.x * n.y * a;
	let b1 = vec3f(1.0 - n.x * n.x * a, b, -n.x);
	let b2 = vec3f(b, 1.0 - n.y * n.y * a, -n.y);
	return mat3x3f(b1, b2, n);
}
fn matrixFromVectorSlow(n: vec3f) -> mat3x3f {
	let up = select(vec3f(0.0, 0.0, select(-1.0, 1.0, n.y > 0.0)), vec3f(0.0, 1.0, 0.0), abs(n.y) > 0.0000001);
	let x = normalize(cross(up, n));
	let y = cross(n, x);
	return mat3x3f(x, y, n);
}
fn reproject(uv: vec2f) -> vec4f {
	if ({NUM_SAMPLES} <= 1) {
		return {ENCODE_FUNC}({DECODE_FUNC}({SOURCE_FUNC}Dir({TARGET_FUNC}(uv))));
	} else {
		let t = {TARGET_FUNC}(uv);
		let tu = dpdx(t);
		let tv = dpdy(t);
		var result = vec3f(0.0);
		for (var u = 0.0; u < {NUM_SAMPLES_SQRT}; u += 1.0) {
			for (var v = 0.0; v < {NUM_SAMPLES_SQRT}; v += 1.0) {
				result += {DECODE_FUNC}({SOURCE_FUNC}Dir(normalize(t +
															tu * (u / {NUM_SAMPLES_SQRT} - 0.5) +
															tv * (v / {NUM_SAMPLES_SQRT} - 0.5))));
			}
		}
		return {ENCODE_FUNC}(result / ({NUM_SAMPLES_SQRT} * {NUM_SAMPLES_SQRT}));
	}
}
const unpackFloat: vec4f = vec4f(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0);
#ifdef USE_SAMPLES_TEX
	fn unpackSample(i: i32, L: ptr<function, vec3f>, mipLevel: ptr<function, f32>) {
		var u = (f32(i * 4) + 0.5) * uniform.samplesTexInverseSize.x;
		var v = (floor(u) + 0.5) * uniform.samplesTexInverseSize.y;
		var raw: vec4f;
		raw.x = dot(textureSample(samplesTex, samplesTexSampler, vec2f(u, v)), unpackFloat); u += uniform.samplesTexInverseSize.x;
		raw.y = dot(textureSample(samplesTex, samplesTexSampler, vec2f(u, v)), unpackFloat); u += uniform.samplesTexInverseSize.x;
		raw.z = dot(textureSample(samplesTex, samplesTexSampler, vec2f(u, v)), unpackFloat); u += uniform.samplesTexInverseSize.x;
		raw.w = dot(textureSample(samplesTex, samplesTexSampler, vec2f(u, v)), unpackFloat);
		*L = raw.xyz * 2.0 - 1.0;
		*mipLevel = raw.w * 8.0;
	}
	fn prefilterSamples(uv: vec2f) -> vec4f {
		let vecSpace = matrixFromVectorSlow({TARGET_FUNC}(uv));
		var L: vec3f;
		var mipLevel: f32;
		var result = vec3f(0.0);
		var totalWeight = 0.0;
		for (var i = 0; i < {NUM_SAMPLES}; i += 1) {
			unpackSample(i, &L, &mipLevel);
			result += {DECODE_FUNC}({SOURCE_FUNC}DirLod(vecSpace * L, mipLevel)) * L.z;
			totalWeight += L.z;
		}
		return {ENCODE_FUNC}(result / totalWeight);
	}
	fn prefilterSamplesUnweighted(uv: vec2f) -> vec4f {
		let vecSpace = matrixFromVectorSlow({TARGET_FUNC}(uv));
		var L: vec3f;
		var mipLevel: f32;
		var result = vec3f(0.0);
		for (var i = 0; i < {NUM_SAMPLES}; i += 1) {
			unpackSample(i, &L, &mipLevel);
			result += {DECODE_FUNC}({SOURCE_FUNC}DirLod(vecSpace * L, mipLevel));
		}
		return {ENCODE_FUNC}(result / f32({NUM_SAMPLES}));
	}
#endif
@fragment
fn fragmentMain(input : FragmentInput) -> FragmentOutput {
	var output: FragmentOutput;
	output.color = {PROCESS_FUNC}(input.vUv0);
	return output;
}
`

var reprojectVS = `
attribute vertex_position: vec2f;
uniform uvMod: vec4f;
varying vUv0: vec2f;
@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
	var output: VertexOutput;
	output.position = vec4f(input.vertex_position, 0.5, 1.0);
	output.vUv0 = getImageEffectUV((input.vertex_position * 0.5 + vec2f(0.5, 0.5)) * uniform.uvMod.xy + uniform.uvMod.zw);
	return output;
}
`

var screenDepthPS = `
var uSceneDepthMap: texture_2d<uff>;
#ifndef SCREENSIZE
	#define SCREENSIZE
	uniform uScreenSize: vec4f;
#endif
#ifndef VIEWMATRIX
	#define VIEWMATRIX
	uniform matrix_view: mat4x4f;
#endif
#ifndef LINEARIZE_DEPTH
	#define LINEARIZE_DEPTH
	#ifndef CAMERAPLANES
		#define CAMERAPLANES
		uniform camera_params: vec4f;
	#endif
	fn linearizeDepth(z: f32) -> f32 {
		if (uniform.camera_params.w == 0.0) {
			return (uniform.camera_params.z * uniform.camera_params.y) / (uniform.camera_params.y + z * (uniform.camera_params.z - uniform.camera_params.y));
		} else {
			return uniform.camera_params.z + z * (uniform.camera_params.y - uniform.camera_params.z);
		}
	}
#endif
fn delinearizeDepth(linearDepth: f32) -> f32 {
	if (uniform.camera_params.w == 0.0) {
		return (uniform.camera_params.y * (uniform.camera_params.z - linearDepth)) / (linearDepth * (uniform.camera_params.z - uniform.camera_params.y));
	} else {
		return (linearDepth - uniform.camera_params.z) / (uniform.camera_params.y - uniform.camera_params.z);
	}
}
fn getLinearScreenDepth(uv: vec2f) -> f32 {
	let textureSize = textureDimensions(uSceneDepthMap, 0);
	let texel: vec2i = vec2i(uv * vec2f(textureSize));
	#ifdef SCENE_DEPTHMAP_LINEAR
		return textureLoad(uSceneDepthMap, texel, 0).r;
	#else
		return linearizeDepth(textureLoad(uSceneDepthMap, texel, 0).r);
	#endif
}
#ifndef VERTEXSHADER
	fn getLinearScreenDepthFrag() -> f32 {
		let uv: vec2f = pcPosition.xy * uniform.uScreenSize.zw;
		return getLinearScreenDepth(uv);
	}
#endif
fn getLinearDepth(pos: vec3f) -> f32 {
	return -(uniform.matrix_view * vec4f(pos, 1.0)).z;
}
`

var shadowCascadesPS = `
fn getShadowCascadeIndex(shadowCascadeDistances: vec4f, shadowCascadeCount: i32) -> i32 {
	let depth: f32 = 1.0 / pcPosition.w;
	let comparisons: vec4f = step(shadowCascadeDistances, vec4f(depth));
	let cascadeIndex: i32 = i32(dot(comparisons, vec4f(1.0)));
	return min(cascadeIndex, shadowCascadeCount - 1);
}
fn ditherShadowCascadeIndex(cascadeIndex_in: i32, shadowCascadeDistances: vec4f, shadowCascadeCount: i32, blendFactor: f32) -> i32 {
	var cascadeIndex: i32 = cascadeIndex_in;
	if (cascadeIndex < shadowCascadeCount - 1) {
		let currentRangeEnd: f32 = shadowCascadeDistances[cascadeIndex];
		let transitionStart: f32 = blendFactor * currentRangeEnd;
		let depth: f32 = 1.0 / pcPosition.w;
		if (depth > transitionStart) {
			let transitionFactor: f32 = smoothstep(transitionStart, currentRangeEnd, depth);
			let dither: f32 = fract(sin(dot(pcPosition.xy, vec2f(12.9898, 78.233))) * 43758.5453);
			if (dither < transitionFactor) {
				cascadeIndex = cascadeIndex + 1;
			}
		}
	}
	return cascadeIndex;
}
fn fadeShadow(shadowCoord_in: vec3f, shadowCascadeDistances: vec4f) -> vec3f {
	var shadowCoord: vec3f = shadowCoord_in;
	let depth: f32 = 1.0 / pcPosition.w;
	if (depth > shadowCascadeDistances.w) {
		shadowCoord.z = -9999999.0;
	}
	return shadowCoord;
}
`

var shadowEVSMPS = `
fn linstep(a: f32, b: f32, v: f32) -> f32 {
	return clamp((v - a) / (b - a), 0.0, 1.0);
}
fn reduceLightBleeding(pMax: f32, amount: f32) -> f32 {
	 return linstep(amount, 1.0, pMax);
}
fn chebyshevUpperBound(moments: vec2f, mean: f32, minVariance: f32, lightBleedingReduction: f32) -> f32 {
	var variance: f32 = moments.y - (moments.x * moments.x);
	variance = max(variance, minVariance);
	let d: f32 = mean - moments.x;
	var pMax: f32 = variance / (variance + (d * d));
	pMax = reduceLightBleeding(pMax, lightBleedingReduction);
	return select(pMax, 1.0, mean <= moments.x);
}
fn calculateEVSM(moments_in: vec3f, Z_in: f32, vsmBias: f32, exponent: f32) -> f32 {
	let Z: f32 = 2.0 * Z_in - 1.0;
	let warpedDepth: f32 = exp(exponent * Z);
	let moments: vec2f = moments_in.xy + vec2f(warpedDepth, warpedDepth*warpedDepth) * (1.0 - moments_in.z);
	let VSMBias: f32 = vsmBias;
	let depthScale: f32 = VSMBias * exponent * warpedDepth;
	let minVariance1: f32 = depthScale * depthScale;
	return chebyshevUpperBound(moments, warpedDepth, minVariance1, 0.1);
}
fn VSM16(tex: texture_2d<f32>, texSampler: sampler, texCoords: vec2f, resolution: f32, Z: f32, vsmBias: f32, exponent: f32) -> f32 {
	let moments: vec3f = textureSampleLevel(tex, texSampler, texCoords, 0.0).xyz;
	return calculateEVSM(moments, Z, vsmBias, exponent);
}
fn getShadowVSM16(shadowMap: texture_2d<f32>, shadowMapSampler: sampler, shadowCoord: vec3f, shadowParams: vec4f, exponent: f32) -> f32 {
	return VSM16(shadowMap, shadowMapSampler, shadowCoord.xy, shadowParams.x, shadowCoord.z, shadowParams.y, exponent);
}
fn getShadowSpotVSM16(shadowMap: texture_2d<f32>, shadowMapSampler: sampler, shadowCoord: vec3f, shadowParams: vec4f, exponent: f32, lightDir: vec3f) -> f32 {
	let Z: f32 = length(lightDir) * shadowParams.w + shadowParams.z;
	return VSM16(shadowMap, shadowMapSampler, shadowCoord.xy, shadowParams.x, Z, shadowParams.y, exponent);
}
fn VSM32(tex: texture_2d<f32>, texSampler: sampler, texCoords_in: vec2f, resolution: f32, Z: f32, vsmBias: f32, exponent: f32) -> f32 {
	#ifdef CAPS_TEXTURE_FLOAT_FILTERABLE
		var moments: vec3f = textureSampleLevel(tex, texSampler, texCoords_in, 0.0).xyz;
	#else
		var pixelSize : f32 = 1.0 / resolution;
		let texCoords: vec2f = texCoords_in - vec2f(pixelSize);
		let s00: vec3f = textureSampleLevel(tex, texSampler, texCoords, 0.0).xyz;
		let s10: vec3f = textureSampleLevel(tex, texSampler, texCoords + vec2f(pixelSize, 0.0), 0.0).xyz;
		let s01: vec3f = textureSampleLevel(tex, texSampler, texCoords + vec2f(0.0, pixelSize), 0.0).xyz;
		let s11: vec3f = textureSampleLevel(tex, texSampler, texCoords + vec2f(pixelSize), 0.0).xyz;
		let fr: vec2f = fract(texCoords * resolution);
		let h0: vec3f = mix(s00, s10, fr.x);
		let h1: vec3f = mix(s01, s11, fr.x);
		var moments: vec3f = mix(h0, h1, fr.y);
	#endif
	return calculateEVSM(moments, Z, vsmBias, exponent);
}
fn getShadowVSM32(shadowMap: texture_2d<f32>, shadowMapSampler: sampler, shadowCoord: vec3f, shadowParams: vec4f, exponent: f32) -> f32 {
	return VSM32(shadowMap, shadowMapSampler, shadowCoord.xy, shadowParams.x, shadowCoord.z, shadowParams.y, exponent);
}
fn getShadowSpotVSM32(shadowMap: texture_2d<f32>, shadowMapSampler: sampler, shadowCoord: vec3f, shadowParams: vec4f, exponent: f32, lightDir: vec3f) -> f32 {
	let Z: f32 = length(lightDir) * shadowParams.w + shadowParams.z;
	return VSM32(shadowMap, shadowMapSampler, shadowCoord.xy, shadowParams.x, Z, shadowParams.y, exponent);
}
`

var shadowPCF1PS = `
fn getShadowPCF1x1(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
	return textureSampleCompareLevel(shadowMap, shadowMapSampler, shadowCoord.xy, shadowCoord.z);
}
fn getShadowSpotPCF1x1(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
	return textureSampleCompareLevel(shadowMap, shadowMapSampler, shadowCoord.xy, shadowCoord.z);
}
`

var shadowPCF3PS = `
fn _getShadowPCF3x3(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec3f) -> f32 {
	let z: f32 = shadowCoord.z;
	let uv: vec2f = shadowCoord.xy * shadowParams.x;
	let shadowMapSizeInv: f32 = 1.0 / shadowParams.x;
	let base_uv_temp: vec2f = floor(uv + 0.5);
	let s: f32 = (uv.x + 0.5 - base_uv_temp.x);
	let t: f32 = (uv.y + 0.5 - base_uv_temp.y);
	let base_uv: vec2f = (base_uv_temp - vec2f(0.5)) * shadowMapSizeInv;
	var sum: f32 = 0.0;
	let uw0: f32 = (3.0 - 2.0 * s);
	let uw1: f32 = (1.0 + 2.0 * s);
	let u0_offset: f32 = (2.0 - s) / uw0 - 1.0;
	let u1_offset: f32 = s / uw1 + 1.0;
	let vw0: f32 = (3.0 - 2.0 * t);
	let vw1: f32 = (1.0 + 2.0 * t);
	let v0_offset: f32 = (2.0 - t) / vw0 - 1.0;
	let v1_offset: f32 = t / vw1 + 1.0;
	let u0: f32 = u0_offset * shadowMapSizeInv + base_uv.x;
	let v0: f32 = v0_offset * shadowMapSizeInv + base_uv.y;
	let u1: f32 = u1_offset * shadowMapSizeInv + base_uv.x;
	let v1: f32 = v1_offset * shadowMapSizeInv + base_uv.y;
	sum = sum + uw0 * vw0 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u0, v0), z);
	sum = sum + uw1 * vw0 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u1, v0), z);
	sum = sum + uw0 * vw1 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u0, v1), z);
	sum = sum + uw1 * vw1 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u1, v1), z);
	sum = sum * (1.0 / 16.0);
	return sum;
}
fn getShadowPCF3x3(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
	return _getShadowPCF3x3(shadowMap, shadowMapSampler, shadowCoord, shadowParams.xyz);
}
fn getShadowSpotPCF3x3(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
	return _getShadowPCF3x3(shadowMap, shadowMapSampler, shadowCoord, shadowParams.xyz);
}
`

var shadowPCF5PS = `
fn _getShadowPCF5x5(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec3f) -> f32 {
	let z: f32 = shadowCoord.z;
	let uv: vec2f = shadowCoord.xy * shadowParams.x;
	let shadowMapSizeInv: f32 = 1.0 / shadowParams.x;
	let base_uv_temp: vec2f = floor(uv + 0.5);
	let s: f32 = (uv.x + 0.5 - base_uv_temp.x);
	let t: f32 = (uv.y + 0.5 - base_uv_temp.y);
	let base_uv: vec2f = (base_uv_temp - vec2f(0.5)) * shadowMapSizeInv;
	let uw0: f32 = (4.0 - 3.0 * s);
	let uw1: f32 = 7.0;
	let uw2: f32 = (1.0 + 3.0 * s);
	let u0_offset: f32 = (3.0 - 2.0 * s) / uw0 - 2.0;
	let u1_offset: f32 = (3.0 + s) / uw1;
	let u2_offset: f32 = s / uw2 + 2.0;
	let vw0: f32 = (4.0 - 3.0 * t);
	let vw1: f32 = 7.0;
	let vw2: f32 = (1.0 + 3.0 * t);
	let v0_offset: f32 = (3.0 - 2.0 * t) / vw0 - 2.0;
	let v1_offset: f32 = (3.0 + t) / vw1;
	let v2_offset: f32 = t / vw2 + 2.0;
	var sum: f32 = 0.0;
	let u0: f32 = u0_offset * shadowMapSizeInv + base_uv.x;
	let v0: f32 = v0_offset * shadowMapSizeInv + base_uv.y;
	let u1: f32 = u1_offset * shadowMapSizeInv + base_uv.x;
	let v1: f32 = v1_offset * shadowMapSizeInv + base_uv.y;
	let u2: f32 = u2_offset * shadowMapSizeInv + base_uv.x;
	let v2: f32 = v2_offset * shadowMapSizeInv + base_uv.y;
	sum = sum + uw0 * vw0 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u0, v0), z);
	sum = sum + uw1 * vw0 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u1, v0), z);
	sum = sum + uw2 * vw0 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u2, v0), z);
	sum = sum + uw0 * vw1 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u0, v1), z);
	sum = sum + uw1 * vw1 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u1, v1), z);
	sum = sum + uw2 * vw1 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u2, v1), z);
	sum = sum + uw0 * vw2 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u0, v2), z);
	sum = sum + uw1 * vw2 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u1, v2), z);
	sum = sum + uw2 * vw2 * textureSampleCompareLevel(shadowMap, shadowMapSampler, vec2f(u2, v2), z);
	sum = sum * (1.0 / 144.0);
	sum = saturate(sum);
	return sum;
}
fn getShadowPCF5x5(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
	return _getShadowPCF5x5(shadowMap, shadowMapSampler, shadowCoord, shadowParams.xyz);
}
fn getShadowSpotPCF5x5(shadowMap: texture_depth_2d, shadowMapSampler: sampler_comparison, shadowCoord: vec3f, shadowParams: vec4f) -> f32 {
	return _getShadowPCF5x5(shadowMap, shadowMapSampler, shadowCoord, shadowParams.xyz);
}
`

var shadowSoftPS = `
fn fractSinRand(uv: vec2f) -> f32 {
	let PI: f32 = 3.141592653589793;
	let a: f32 = 12.9898; let b: f32 = 78.233; let c: f32 = 43758.5453;
	let dt: f32 = dot(uv.xy, vec2f(a, b));
	let sn: f32 = dt % PI;
	return fract(sin(sn) * c);
}
struct VogelDiskData {
	invNumSamples: f32,
	initialAngle: f32,
	currentPointId: f32,
}
fn prepareDiskConstants(data: ptr<function, VogelDiskData>, sampleCount: i32, randomSeed: f32) {
	let pi2: f32 = 6.28318530718;
	data.invNumSamples = 1.0 / f32(sampleCount);
	data.initialAngle = randomSeed * pi2;
	data.currentPointId = 0.0;
}
fn generateDiskSample(data: ptr<function, VogelDiskData>) -> vec2f {
	let GOLDEN_ANGLE: f32 = 2.399963;
	let r: f32 = sqrt((data.currentPointId + 0.5) * data.invNumSamples);
	let theta: f32 = data.currentPointId * GOLDEN_ANGLE + data.initialAngle;
	let offset: vec2f = vec2f(cos(theta), sin(theta)) * pow(r, 1.33);
	data.currentPointId = data.currentPointId + 1.0;
	return offset;
}
fn PCSSFindBlocker(shadowMap: texture_2d<f32>, shadowMapSampler: sampler, avgBlockerDepth: ptr<function, f32>, numBlockers: ptr<function, i32>,
	shadowCoords: vec2f, z: f32, shadowBlockerSamples: i32, penumbraSize: f32, invShadowMapSize: f32, randomSeed: f32) {
	var diskData: VogelDiskData;
	prepareDiskConstants(&diskData, shadowBlockerSamples, randomSeed);
	let searchWidth: f32 = penumbraSize * invShadowMapSize;
	var blockerSum: f32 = 0.0;
	var numBlockers_local: i32 = 0;
	for( var i: i32 = 0; i < shadowBlockerSamples; i = i + 1 ) {
		let diskUV: vec2f = generateDiskSample(&diskData);
		let sampleUV: vec2f = shadowCoords + diskUV * searchWidth;
		let shadowMapDepth: f32 = textureSampleLevel(shadowMap, shadowMapSampler, sampleUV, 0.0).r;
		if ( shadowMapDepth < z ) {
			blockerSum = blockerSum + shadowMapDepth;
			numBlockers_local = numBlockers_local + 1;
		}
	}
	*avgBlockerDepth = blockerSum / f32(numBlockers_local);
	*numBlockers = numBlockers_local;
}
fn PCSSFilter(shadowMap: texture_2d<f32>, shadowMapSampler: sampler, uv: vec2f, receiverDepth: f32, shadowSamples: i32, filterRadius: f32, randomSeed: f32) -> f32 {
	var diskData: VogelDiskData;
	prepareDiskConstants(&diskData, shadowSamples, randomSeed);
	var sum: f32 = 0.0;
	for (var i: i32 = 0; i < shadowSamples; i = i + 1) {
		let offsetUV: vec2f = generateDiskSample(&diskData) * filterRadius;
		let depth: f32 = textureSampleLevel(shadowMap, shadowMapSampler, uv + offsetUV, 0.0).r;
		sum = sum + step(receiverDepth, depth);
	}
	return sum / f32(shadowSamples);
}
fn getPenumbra(dblocker: f32, dreceiver: f32, penumbraSize: f32, penumbraFalloff: f32) -> f32 {
	let dist: f32 = dreceiver - dblocker;
	let penumbra: f32 = 1.0 - pow(1.0 - dist, penumbraFalloff);
	return penumbra * penumbraSize;
}
fn PCSSDirectional(shadowMap: texture_2d<f32>, shadowMapSampler: sampler, shadowCoords: vec3f, cameraParams: vec4f, softShadowParams: vec4f) -> f32 {
	let receiverDepth: f32 = shadowCoords.z;
	let randomSeed: f32 = fractSinRand(pcPosition.xy);
	let shadowSamples: i32 = i32(softShadowParams.x);
	let shadowBlockerSamples: i32 = i32(softShadowParams.y);
	let penumbraSize: f32 = softShadowParams.z;
	let penumbraFalloff: f32 = softShadowParams.w;
	let shadowMapSize: i32 = i32(textureDimensions(shadowMap, 0).x);
	var invShadowMapSize: f32 = 1.0 / f32(shadowMapSize);
	invShadowMapSize = invShadowMapSize * (f32(shadowMapSize) / 2048.0);
	var penumbra: f32;
	if (shadowBlockerSamples > 0) {
		var avgBlockerDepth: f32 = 0.0;
		var numBlockers: i32 = 0;
		PCSSFindBlocker(shadowMap, shadowMapSampler, &avgBlockerDepth, &numBlockers, shadowCoords.xy, receiverDepth, shadowBlockerSamples, penumbraSize, invShadowMapSize, randomSeed);
		if (numBlockers < 1) {
			return 1.0;
		}
		penumbra = getPenumbra(avgBlockerDepth, shadowCoords.z, penumbraSize, penumbraFalloff);
	} else {
		penumbra = penumbraSize;
	}
	let filterRadius: f32 = penumbra * invShadowMapSize;
	return PCSSFilter(shadowMap, shadowMapSampler, shadowCoords.xy, receiverDepth, shadowSamples, filterRadius, randomSeed);
}
fn getShadowPCSS(shadowMap: texture_2d<f32>, shadowMapSampler: sampler, shadowCoord: vec3f, shadowParams: vec4f, cameraParams: vec4f, softShadowParams: vec4f, lightDir: vec3f) -> f32 {
	return PCSSDirectional(shadowMap, shadowMapSampler, shadowCoord, cameraParams, softShadowParams);
}
`

var skinBatchVS = `
attribute vertex_boneIndices: f32;
var texture_poseMap: texture_2d<uff>;
fn getBoneMatrix(indexFloat: f32) -> mat4x4f {
	let width = i32(textureDimensions(texture_poseMap).x);
	let index: i32 = i32(indexFloat + 0.5) * 3;
	let iy: i32 = index / width;
	let ix: i32 = index % width;
	let v1: vec4f = textureLoad(texture_poseMap, vec2i(ix + 0, iy), 0);
	let v2: vec4f = textureLoad(texture_poseMap, vec2i(ix + 1, iy), 0);
	let v3: vec4f = textureLoad(texture_poseMap, vec2i(ix + 2, iy), 0);
	return mat4x4f(
		v1.x, v2.x, v3.x, 0,
		v1.y, v2.y, v3.y, 0,
		v1.z, v2.z, v3.z, 0,
		v1.w, v2.w, v3.w, 1.0
	);
}
`

var skinVS = `
attribute vertex_boneWeights: vec4f;
attribute vertex_boneIndices: vec4f;
var texture_poseMap: texture_2d<uff>;
struct BoneMatrix {
	v1: vec4f,
	v2: vec4f,
	v3: vec4f,
}
fn getBoneMatrix(width: i32, index: i32) -> BoneMatrix {
	let v = index / width;
	let u = index % width;
	var result: BoneMatrix;
	result.v1 = textureLoad(texture_poseMap, vec2i(u + 0, v), 0);
	result.v2 = textureLoad(texture_poseMap, vec2i(u + 1, v), 0);
	result.v3 = textureLoad(texture_poseMap, vec2i(u + 2, v), 0);
	return result;
}
fn getSkinMatrix(indicesFloat: vec4f, weights: vec4f) -> mat4x4f {
	let width = i32(textureDimensions(texture_poseMap).x);
	var indices = vec4i(indicesFloat + 0.5) * 3;
	let boneA = getBoneMatrix(width, indices.x);
	let boneB = getBoneMatrix(width, indices.y);
	let boneC = getBoneMatrix(width, indices.z);
	let boneD = getBoneMatrix(width, indices.w);
	let v1 = boneA.v1 * weights.x + boneB.v1 * weights.y + boneC.v1 * weights.z + boneD.v1 * weights.w;
	let v2 = boneA.v2 * weights.x + boneB.v2 * weights.y + boneC.v2 * weights.z + boneD.v2 * weights.w;
	let v3 = boneA.v3 * weights.x + boneB.v3 * weights.y + boneC.v3 * weights.z + boneD.v3 * weights.w;
	let one = dot(weights, vec4f(1.0, 1.0, 1.0, 1.0));
	return mat4x4f(
		v1.x, v2.x, v3.x, 0,
		v1.y, v2.y, v3.y, 0,
		v1.z, v2.z, v3.z, 0,
		v1.w, v2.w, v3.w, one
	);
}
`

var skyboxPS = `
	#define LIT_SKYBOX_INTENSITY
	#include "envProcPS"
	#include "gammaPS"
	#include "tonemappingPS"
	#ifdef PREPASS_PASS
		varying vLinearDepth: f32;
		#include "floatAsUintPS"
	#endif
	varying vViewDir : vec3f;
	uniform skyboxHighlightMultiplier : f32;
	#ifdef SKY_CUBEMAP
		var texture_cubeMap : texture_cube<f32>;
		var texture_cubeMap_sampler : sampler;
		#ifdef SKYMESH
			varying vWorldPos : vec3f;
			uniform cubeMapRotationMatrix : mat3x3f;
			uniform projectedSkydomeCenter : vec3f;
		#endif
	#else
		#include "sphericalPS"
		#include "envAtlasPS"
		var texture_envAtlas : texture_2d<f32>;
		var texture_envAtlas_sampler : sampler;
		uniform mipLevel : f32;
	#endif
	@fragment
	fn fragmentMain(input : FragmentInput) -> FragmentOutput {
		var output: FragmentOutput;
		#ifdef PREPASS_PASS
			output.color = float2vec4(vLinearDepth);
		#else
			var linear : vec3f;
			var dir : vec3f;
			#ifdef SKY_CUBEMAP
				#ifdef SKYMESH
					var envDir : vec3f = normalize(input.vWorldPos - uniform.projectedSkydomeCenter);
					dir = envDir * uniform.cubeMapRotationMatrix;
				#else
					dir = input.vViewDir;
				#endif
				dir.x *= -1.0;
				linear = {SKYBOX_DECODE_FNC}(textureSample(texture_cubeMap, texture_cubeMap_sampler, dir));
			#else
				dir = input.vViewDir * vec3f(-1.0, 1.0, 1.0);
				let uv : vec2f = toSphericalUv(normalize(dir));
				linear = {SKYBOX_DECODE_FNC}(textureSample(texture_envAtlas, texture_envAtlas_sampler, mapRoughnessUv(uv, uniform.mipLevel)));
			#endif
			if (any(linear >= vec3f(64.0))) {
				linear *= uniform.skyboxHighlightMultiplier;
			}
			
			output.color = vec4f(gammaCorrectOutput(toneMap(processEnvironment(linear))), 1.0);
		#endif
		return output;
	}
`

var skyboxVS = `
	attribute aPosition : vec4f;
	uniform matrix_view : mat4x4f;
	uniform matrix_projectionSkybox : mat4x4f;
	uniform cubeMapRotationMatrix : mat3x3f;
	varying vViewDir : vec3f;
	#ifdef PREPASS_PASS
		varying vLinearDepth: f32;
	#endif
	#ifdef SKYMESH
		uniform matrix_model : mat4x4f;
		varying vWorldPos : vec3f;
	#endif
	@vertex
	fn vertexMain(input : VertexInput) -> VertexOutput {
		var output : VertexOutput;
		var view : mat4x4f = uniform.matrix_view;
		#ifdef SKYMESH
			var worldPos : vec4f = uniform.matrix_model * input.aPosition;
			output.vWorldPos = worldPos.xyz;
			output.position = uniform.matrix_projectionSkybox * (view * worldPos);
			#ifdef PREPASS_PASS
				output.vLinearDepth = -(uniform.matrix_view * vec4f(worldPos.xyz, 1.0)).z;
			#endif
		#else
			view[3][0] = 0.0;
			view[3][1] = 0.0;
			view[3][2] = 0.0;
			output.position = uniform.matrix_projectionSkybox * (view * input.aPosition);
			output.vViewDir = input.aPosition.xyz * uniform.cubeMapRotationMatrix;
			#ifdef PREPASS_PASS
				output.vLinearDepth = -pcPosition.w;
			#endif
		#endif
		output.position.z = output.position.w - 1.0e-7;
		return output;
	}
`

var specularPS = `
#ifdef STD_SPECULAR_CONSTANT
	uniform material_specular: vec3f;
#endif
fn getSpecularity() {
	var specularColor = vec3f(1.0, 1.0, 1.0);
	#ifdef STD_SPECULAR_CONSTANT
	specularColor = specularColor * uniform.material_specular;
	#endif
	#ifdef STD_SPECULAR_TEXTURE
	specularColor = specularColor * {STD_SPECULAR_TEXTURE_DECODE}(textureSampleBias({STD_SPECULAR_TEXTURE_NAME}, {STD_SPECULAR_TEXTURE_NAME}Sampler, {STD_SPECULAR_TEXTURE_UV}, uniform.textureBias)).{STD_SPECULAR_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_SPECULAR_VERTEX
	specularColor = specularColor * saturate3(vVertexColor.{STD_SPECULAR_VERTEX_CHANNEL});
	#endif
	dSpecularity = specularColor;
}
`

var sphericalPS = `
fn toSpherical(dir: vec3f) -> vec2f {
	let angle_xz = select(0.0, atan2(dir.x, dir.z), any(dir.xz != vec2f(0.0)));
	return vec2f(angle_xz, asin(dir.y));
}
fn toSphericalUv(dir : vec3f) -> vec2f {
	const PI : f32 = 3.141592653589793;
	let uv : vec2f = toSpherical(dir) / vec2f(PI * 2.0, PI) + vec2f(0.5, 0.5);
	return vec2f(uv.x, 1.0 - uv.y);
}
`

var specularityFactorPS = `
#ifdef STD_SPECULARITYFACTOR_CONSTANT
	uniform material_specularityFactor: f32;
#endif
fn getSpecularityFactor() {
	var specularityFactor = 1.0;
	#ifdef STD_SPECULARITYFACTOR_CONSTANT
	specularityFactor = specularityFactor * uniform.material_specularityFactor;
	#endif
	#ifdef STD_SPECULARITYFACTOR_TEXTURE
	specularityFactor = specularityFactor * textureSampleBias({STD_SPECULARITYFACTOR_TEXTURE_NAME}, {STD_SPECULARITYFACTOR_TEXTURE_NAME}Sampler, {STD_SPECULARITYFACTOR_TEXTURE_UV}, uniform.textureBias).{STD_SPECULARITYFACTOR_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_SPECULARITYFACTOR_VERTEX
	specularityFactor = specularityFactor * saturate(vVertexColor.{STD_SPECULARITYFACTOR_VERTEX_CHANNEL});
	#endif
	dSpecularityFactor = specularityFactor;
}
`

var spotPS = `
fn getSpotEffect(lightSpotDir: vec3f, lightInnerConeAngle: f32, lightOuterConeAngle: f32, lightDirNorm: vec3f) -> f32 {
	let cosAngle: f32 = dot(lightDirNorm, lightSpotDir);
	return smoothstep(lightOuterConeAngle, lightInnerConeAngle, cosAngle);
}`

var startNineSlicedPS = `
	nineSlicedUv = vec2f(vUv0.x, 1.0 - vUv0.y);
`

var startNineSlicedTiledPS = `
	let tileMask: vec2f = step(vMask, vec2f(0.99999));
	let tileSize: vec2f = 0.5 * (innerOffset.xy + innerOffset.zw);
	let tileScale: vec2f = vec2f(1.0) / (vec2f(1.0) - tileSize);
	var clampedUv: vec2f = mix(innerOffset.xy * 0.5, vec2f(1.0) - innerOffset.zw * 0.5, fract((vTiledUv - tileSize) * tileScale));
	clampedUv = clampedUv * atlasRect.zw + atlasRect.xy;
	var nineSlicedUv: vec2f = vUv0 * tileMask + clampedUv * (vec2f(1.0) - tileMask);
	nineSlicedUv.y = 1.0 - nineSlicedUv.y;
`

var stdDeclarationPS = `
	var<private> dAlpha: f32 = 1.0;
	#if LIT_BLEND_TYPE != NONE || defined(LIT_ALPHA_TEST) || defined(LIT_ALPHA_TO_COVERAGE) || STD_OPACITY_DITHER != NONE
		#ifdef STD_OPACITY_TEXTURE_ALLOCATE
			var texture_opacityMap : texture_2d<f32>;
			var texture_opacityMapSampler : sampler;
		#endif
	#endif
	#ifdef FORWARD_PASS
		var<private> dAlbedo: vec3f;
		var<private> dNormalW: vec3f;
		var<private> dSpecularity: vec3f = vec3f(0.0, 0.0, 0.0);
		var<private> dGlossiness: f32 = 0.0;
		#ifdef LIT_REFRACTION
			var<private> dTransmission: f32;
			var<private> dThickness: f32;
		#endif
		#ifdef LIT_SCENE_COLOR
			var uSceneColorMap : texture_2d<f32>;
			var uSceneColorMapSampler : sampler;
		#endif
		#ifdef LIT_SCREEN_SIZE
			uniform uScreenSize: vec4f;
		#endif
		#ifdef LIT_TRANSFORMS
			var<private> matrix_viewProjection: mat4x4f;
			var<private> matrix_model: mat4x4f;
		#endif
		#ifdef STD_HEIGHT_MAP
			var<private> dUvOffset: vec2f;
			#ifdef STD_HEIGHT_TEXTURE_ALLOCATE
				var texture_heightMap : texture_2d<f32>;
				var texture_heightMapSampler : sampler;
			#endif
		#endif
		#ifdef STD_DIFFUSE_TEXTURE_ALLOCATE
			var texture_diffuseMap : texture_2d<f32>;
			var texture_diffuseMapSampler : sampler;
		#endif
		#ifdef STD_DIFFUSEDETAIL_TEXTURE_ALLOCATE
			var texture_diffuseDetailMap : texture_2d<f32>;
			var texture_diffuseDetailMapSampler : sampler;
		#endif
		#ifdef STD_NORMAL_TEXTURE_ALLOCATE
			var texture_normalMap : texture_2d<f32>;
			var texture_normalMapSampler : sampler;
		#endif
		#ifdef STD_NORMALDETAIL_TEXTURE_ALLOCATE
			var texture_normalDetailMap : texture_2d<f32>;
			var texture_normalDetailMapSampler : sampler;
		#endif
		#ifdef STD_THICKNESS_TEXTURE_ALLOCATE
			var texture_thicknessMap : texture_2d<f32>;
			var texture_thicknessMapSampler : sampler;
		#endif
		#ifdef STD_REFRACTION_TEXTURE_ALLOCATE
			var texture_refractionMap : texture_2d<f32>;
			var texture_refractionMapSampler : sampler;
		#endif
		#ifdef LIT_IRIDESCENCE
			var<private> dIridescence: f32;
			var<private> dIridescenceThickness: f32;
			#ifdef STD_IRIDESCENCE_THICKNESS_TEXTURE_ALLOCATE
				var texture_iridescenceThicknessMap : texture_2d<f32>;
				var texture_iridescenceThicknessMapSampler : sampler;
			#endif
			#ifdef STD_IRIDESCENCE_TEXTURE_ALLOCATE
				var texture_iridescenceMap : texture_2d<f32>;
				var texture_iridescenceMapSampler : sampler;
			#endif
		#endif
		#ifdef LIT_CLEARCOAT
			var<private> ccSpecularity: f32;
			var<private> ccGlossiness: f32;
			var<private> ccNormalW: vec3f;
		#endif
		#ifdef LIT_GGX_SPECULAR
			var<private> dAnisotropy: f32;
			var<private> dAnisotropyRotation: vec2f;
		#endif
		#ifdef LIT_SPECULAR_OR_REFLECTION
			#ifdef LIT_SHEEN
				var<private> sSpecularity: vec3f;
				var<private> sGlossiness: f32;
				#ifdef STD_SHEEN_TEXTURE_ALLOCATE
					var texture_sheenMap : texture_2d<f32>;
					var texture_sheenMapSampler : sampler;
				#endif
				#ifdef STD_SHEENGLOSS_TEXTURE_ALLOCATE
					var texture_sheenGlossMap : texture_2d<f32>;
					var texture_sheenGlossMapSampler : sampler;
				#endif
			#endif
			#ifdef LIT_METALNESS
				var<private> dMetalness: f32;
				var<private> dIor: f32;
				#ifdef STD_METALNESS_TEXTURE_ALLOCATE
					var texture_metalnessMap : texture_2d<f32>;
					var texture_metalnessMapSampler : sampler;
				#endif
			#endif
			#ifdef LIT_SPECULARITY_FACTOR
				var<private> dSpecularityFactor: f32;
				#ifdef STD_SPECULARITYFACTOR_TEXTURE_ALLOCATE
					var texture_specularityFactorMap : texture_2d<f32>;
					var texture_specularityFactorMapSampler : sampler;
				#endif
			#endif
			#ifdef STD_SPECULAR_COLOR
				#ifdef STD_SPECULAR_TEXTURE_ALLOCATE
					var texture_specularMap : texture_2d<f32>;
					var texture_specularMapSampler : sampler;
				#endif
			#endif
			#ifdef STD_GLOSS_TEXTURE_ALLOCATE
				var texture_glossMap : texture_2d<f32>;
				var texture_glossMapSampler : sampler;
			#endif
		#endif
		#ifdef STD_AO
			var <private> dAo: f32;
			#ifdef STD_AO_TEXTURE_ALLOCATE
				var texture_aoMap : texture_2d<f32>;
				var texture_aoMapSampler : sampler;
			#endif
			#ifdef STD_AODETAIL_TEXTURE_ALLOCATE
				var texture_aoDetailMap : texture_2d<f32>;
				var texture_aoDetailMapSampler : sampler;
			#endif
		#endif
		var <private> dEmission: vec3f;
		#ifdef STD_EMISSIVE_TEXTURE_ALLOCATE
			var texture_emissiveMap : texture_2d<f32>;
			var texture_emissiveMapSampler : sampler;
		#endif
		#ifdef LIT_CLEARCOAT
			#ifdef STD_CLEARCOAT_TEXTURE_ALLOCATE
				var texture_clearCoatMap : texture_2d<f32>;
				var texture_clearCoatMapSampler : sampler;
			#endif
			#ifdef STD_CLEARCOATGLOSS_TEXTURE_ALLOCATE
				var texture_clearCoatGlossMap : texture_2d<f32>;
				var texture_clearCoatGlossMapSampler : sampler;
			#endif
			#ifdef STD_CLEARCOATNORMAL_TEXTURE_ALLOCATE
				var texture_clearCoatNormalMap : texture_2d<f32>;
				var texture_clearCoatNormalMapSampler : sampler;
			#endif
		#endif
		#ifdef LIT_GGX_SPECULAR
			#ifdef STD_ANISOTROPY_TEXTURE_ALLOCATE
				var texture_anisotropyMap : texture_2d<f32>;
				var texture_anisotropyMapSampler : sampler;
			#endif
		#endif
		#if defined(STD_LIGHTMAP) || defined(STD_LIGHT_VERTEX_COLOR)
			var<private> dLightmap: vec3f;
			#ifdef STD_LIGHT_TEXTURE_ALLOCATE
				var texture_lightMap : texture_2d<f32>;
				var texture_lightMapSampler : sampler;
			#endif
		#endif
	#endif
	#include "litShaderCorePS"
`

var stdFrontEndPS = `
	#if LIT_BLEND_TYPE != NONE || defined(LIT_ALPHA_TEST) || defined(LIT_ALPHA_TO_COVERAGE) || STD_OPACITY_DITHER != NONE
		#include "opacityPS"
		#if defined(LIT_ALPHA_TEST)
			#include "alphaTestPS"
		#endif
		#if STD_OPACITY_DITHER != NONE
			#include "opacityDitherPS"
		#endif
	#endif
	#ifdef FORWARD_PASS
		#ifdef STD_HEIGHT_MAP
			#include "parallaxPS"
		#endif
		#include  "diffusePS"
		#ifdef LIT_NEEDS_NORMAL
			#include "normalMapPS"
		#endif
		#ifdef LIT_REFRACTION
			#include "transmissionPS"
			#include "thicknessPS"
		#endif
		#ifdef LIT_IRIDESCENCE
			#include "iridescencePS"
			#include "iridescenceThicknessPS"
		#endif
		#ifdef LIT_SPECULAR_OR_REFLECTION
			#ifdef LIT_SHEEN
				#include "sheenPS"
				#include "sheenGlossPS"
			#endif
			#ifdef LIT_METALNESS
				#include "metalnessPS"
				#include "iorPS"
			#endif
			#ifdef LIT_SPECULARITY_FACTOR
				#include "specularityFactorPS"
			#endif
			#ifdef STD_SPECULAR_COLOR
				#include "specularPS"
			#else
				fn getSpecularity() { 
					dSpecularity = vec3f(1.0, 1.0, 1.0);
				}
			#endif
			#include "glossPS"
		#endif
		#ifdef STD_AO
			#include "aoPS"
		#endif
		#include "emissivePS"
		#ifdef LIT_CLEARCOAT
			#include "clearCoatPS"
			#include "clearCoatGlossPS"
			#include "clearCoatNormalPS"
		#endif
		#if defined(LIT_SPECULAR) && defined(LIT_LIGHTING) && defined(LIT_GGX_SPECULAR)
			#include "anisotropyPS"
		#endif
		#if defined(STD_LIGHTMAP) || defined(STD_LIGHT_VERTEX_COLOR)
			#include "lightmapPS"
		#endif
	#endif
	fn evaluateFrontend() {
		#if LIT_BLEND_TYPE != NONE || defined(LIT_ALPHA_TEST) || defined(LIT_ALPHA_TO_COVERAGE) || STD_OPACITY_DITHER != NONE
			getOpacity();
			#if defined(LIT_ALPHA_TEST)
				alphaTest(dAlpha);
			#endif
			#if STD_OPACITY_DITHER != NONE
				opacityDither(dAlpha, 0.0);
			#endif
			litArgs_opacity = dAlpha;
		#endif
		#ifdef FORWARD_PASS
			#ifdef STD_HEIGHT_MAP
				getParallax();
			#endif
			getAlbedo();
			litArgs_albedo = dAlbedo;
			#ifdef LIT_NEEDS_NORMAL
				getNormal();
				litArgs_worldNormal = dNormalW;
			#endif
			#ifdef LIT_REFRACTION
				getRefraction();
				litArgs_transmission = dTransmission;
				getThickness();
				litArgs_thickness = dThickness;
				#ifdef LIT_DISPERSION
					litArgs_dispersion = uniform.material_dispersion;
				#endif
			#endif
			#ifdef LIT_IRIDESCENCE
				getIridescence();
				getIridescenceThickness();
				litArgs_iridescence_intensity = dIridescence;
				litArgs_iridescence_thickness = dIridescenceThickness;
			#endif
			#ifdef LIT_SPECULAR_OR_REFLECTION
				#ifdef LIT_SHEEN
					getSheen();
					litArgs_sheen_specularity = sSpecularity;
					getSheenGlossiness();
					litArgs_sheen_gloss = sGlossiness;
				#endif
				#ifdef LIT_METALNESS
					getMetalness();
					litArgs_metalness = dMetalness;
					getIor();
					litArgs_ior = dIor;
				#endif
				#ifdef LIT_SPECULARITY_FACTOR
					getSpecularityFactor();
					litArgs_specularityFactor = dSpecularityFactor;
				#endif
				getGlossiness();
				getSpecularity();
				litArgs_specularity = dSpecularity;
				litArgs_gloss = dGlossiness;
			#endif
			#ifdef STD_AO
				getAO();
				litArgs_ao = dAo;
			#endif
			getEmission();
			litArgs_emission = dEmission;
			#ifdef LIT_CLEARCOAT
				getClearCoat();
				getClearCoatGlossiness();
				getClearCoatNormal();
				litArgs_clearcoat_specularity = ccSpecularity;
				litArgs_clearcoat_gloss = ccGlossiness;
				litArgs_clearcoat_worldNormal = ccNormalW;
			#endif
			#if defined(LIT_SPECULAR) && defined(LIT_LIGHTING) && defined(LIT_GGX_SPECULAR)
				getAnisotropy();
			#endif
			#if defined(STD_LIGHTMAP) || defined(STD_LIGHT_VERTEX_COLOR)
				getLightMap();
				litArgs_lightmap = dLightmap;
				#ifdef STD_LIGHTMAP_DIR
					litArgs_lightmapDir = dLightmapDir;
				#endif
			#endif
		#endif
	}
`

var TBNPS = `
#ifdef LIT_TANGENTS
	#define TBN_TANGENTS
#else
	#if defined(LIT_USE_NORMALS) || defined(LIT_USE_CLEARCOAT_NORMALS)
		#define TBN_DERIVATIVES
	#endif
#endif
#if defined(TBN_DERIVATIVES)
	uniform tbnBasis: f32;
#endif
fn getTBN(tangent: vec3f, binormal: vec3f, normal: vec3f) {
	#ifdef TBN_TANGENTS
		dTBN = mat3x3f(normalize(tangent), normalize(binormal), normalize(normal));
	#elif defined(TBN_DERIVATIVES)
		let uv: vec2f = {lightingUv};
		let dp1: vec3f = dpdx( vPositionW );
		let dp2: vec3f = dpdy( vPositionW );
		let duv1: vec2f = dpdx( uv );
		let duv2: vec2f = dpdy( uv );
		let dp2perp: vec3f = cross( dp2, normal );
		let dp1perp: vec3f = cross( normal, dp1 );
		let T: vec3f = dp2perp * duv1.x + dp1perp * duv2.x;
		let B: vec3f = dp2perp * duv1.y + dp1perp * duv2.y;
		let denom: f32 = max( dot(T, T), dot(B, B) );
		let invmax: f32 = select(uniform.tbnBasis / sqrt( denom ), 0.0, denom == 0.0);
		dTBN = mat3x3f(T * invmax, -B * invmax, normal );
	#else
		var B: vec3f = cross(normal, vObjectSpaceUpW);
		var T: vec3f = cross(normal, B);
		if (dot(B,B) == 0.0)
		{
			let major: f32 = max(max(normal.x, normal.y), normal.z);
			if (normal.x == major)
			{
				B = cross(normal, vec3f(0.0, 1.0, 0.0));
				T = cross(normal, B);
			}
			else if (normal.y == major)
			{
				B = cross(normal, vec3f(0.0, 0.0, 1.0));
				T = cross(normal, B);
			}
			else
			{
				B = cross(normal, vec3f(1.0, 0.0, 0.0));
				T = cross(normal, B);
			}
		}
		dTBN = mat3x3f(normalize(T), normalize(B), normalize(normal));
	#endif
}`

var thicknessPS = `
#ifdef STD_THICKNESS_CONSTANT
uniform material_thickness: f32;
#endif
fn getThickness() {
	dThickness = 1.0;
	#ifdef STD_THICKNESS_CONSTANT
	dThickness = dThickness * uniform.material_thickness;
	#endif
	#ifdef STD_THICKNESS_TEXTURE
	dThickness = dThickness * textureSampleBias({STD_THICKNESS_TEXTURE_NAME}, {STD_THICKNESS_TEXTURE_NAME}Sampler, {STD_THICKNESS_TEXTURE_UV}, uniform.textureBias).{STD_THICKNESS_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_THICKNESS_VERTEX
	dThickness = dThickness * saturate(vVertexColor.{STD_THICKNESS_VERTEX_CHANNEL});
	#endif
}
`

var tonemappingPS = `
#if (TONEMAP == NONE)
	#include "tonemappingNonePS"
#elif TONEMAP == FILMIC
	#include "tonemappingFilmicPS"
#elif TONEMAP == LINEAR
	#include "tonemappingLinearPS"
#elif TONEMAP == HEJL
	#include "tonemappingHejlPS"
#elif TONEMAP == ACES
	#include "tonemappingAcesPS"
#elif TONEMAP == ACES2
	#include "tonemappingAces2PS"
#elif TONEMAP == NEUTRAL
	#include "tonemappingNeutralPS"
#endif
`

var tonemappingAcesPS = `
uniform exposure: f32;
fn toneMap(color: vec3f) -> vec3f {
	let tA: f32 = 2.51;
	let tB: f32 = 0.03;
	let tC: f32 = 2.43;
	let tD: f32 = 0.59;
	let tE: f32 = 0.14;
	let x: vec3f = color * uniform.exposure;
	return (x * (tA * x + tB)) / (x * (tC * x + tD) + tE);
}
`

var tonemappingAces2PS = `
uniform exposure: f32;
const ACESInputMat: mat3x3f = mat3x3f(
	vec3f(0.59719, 0.35458, 0.04823),
	vec3f(0.07600, 0.90834, 0.01566),
	vec3f(0.02840, 0.13383, 0.83777)
);
const ACESOutputMat: mat3x3f = mat3x3f(
	vec3f( 1.60475, -0.53108, -0.07367),
	vec3f(-0.10208,  1.10813, -0.00605),
	vec3f(-0.00327, -0.07276,  1.07602)
);
fn RRTAndODTFit(v: vec3f) -> vec3f {
	let a: vec3f = v * (v + vec3f(0.0245786)) - vec3f(0.000090537);
	let b: vec3f = v * (vec3f(0.983729) * v + vec3f(0.4329510)) + vec3f(0.238081);
	return a / b;
}
fn toneMap(color: vec3f) -> vec3f {
	var c: vec3f = color * (uniform.exposure / 0.6);
	c = c * ACESInputMat;
	c = RRTAndODTFit(c);
	c = c * ACESOutputMat;
	return clamp(c, vec3f(0.0), vec3f(1.0));
}
`

var tonemappingFilmicPS = `
const A: f32 = 0.15;
const B: f32 = 0.50;
const C: f32 = 0.10;
const D: f32 = 0.20;
const E: f32 = 0.02;
const F: f32 = 0.30;
const W: f32 = 11.2;
uniform exposure: f32;
fn uncharted2Tonemap(x: vec3f) -> vec3f {
	return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - vec3f(E / F);
}
fn toneMap(color: vec3f) -> vec3f {
	var c: vec3f = uncharted2Tonemap(color * uniform.exposure);
	let whiteScale: vec3f = vec3f(1.0) / uncharted2Tonemap(vec3f(W, W, W));
	c *= whiteScale;
	return c;
}
`

var tonemappingHejlPS = `
uniform exposure: f32;
fn toneMap(color: vec3f) -> vec3f {
	let A: f32 = 0.22;
	let B: f32 = 0.3;
	let C: f32 = 0.1;
	let D: f32 = 0.2;
	let E: f32 = 0.01;
	let F: f32 = 0.3;
	let Scl: f32 = 1.25;
	let adjusted_color = color * uniform.exposure;
	let h = max(vec3f(0.0), adjusted_color - vec3f(0.004));
	return (h * ((Scl * A) * h + Scl * vec3f(C * B)) + Scl * vec3f(D * E)) /
		   (h * (A * h + vec3f(B)) + vec3f(D * F)) -
		   Scl * vec3f(E / F);
}
`

var tonemappingLinearPS = `
uniform exposure: f32;
fn toneMap(color: vec3f) -> vec3f {
	return color * uniform.exposure;
}
`

var tonemappingNeutralPS = `
uniform exposure: f32;
fn toneMap(col: vec3f) -> vec3f {
	var color = col * uniform.exposure;
	let startCompression = 0.8 - 0.04;
	let desaturation = 0.15;
	let x = min(color.r, min(color.g, color.b));
	let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
	color -= vec3f(offset);
	let peak = max(color.r, max(color.g, color.b));
	if (peak < startCompression) {
		return color;
	}
	let d = 1.0 - startCompression;
	let newPeak = 1.0 - d * d / (peak + d - startCompression);
	color *= newPeak / peak;
	let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
	return mix(color, vec3f(newPeak), vec3f(g));
}
`

var tonemappingNonePS = `
fn toneMap(color: vec3f) -> vec3f {
	return color;
}
`

var transformVS = `
#ifdef PIXELSNAP
	uniform uScreenSize: vec4f;
#endif
#ifdef SCREENSPACE
	uniform projectionFlipY: f32;
#endif
fn evalWorldPosition(vertexPosition: vec3f, modelMatrix: mat4x4f) -> vec4f {
	var localPos: vec3f = getLocalPosition(vertexPosition);
	#ifdef NINESLICED
		var localPosXZ: vec2f = localPos.xz;
		localPosXZ = localPosXZ * uniform.outerScale;
		let positiveUnitOffset: vec2f = clamp(vertexPosition.xz, vec2f(0.0), vec2f(1.0));
		let negativeUnitOffset: vec2f = clamp(-vertexPosition.xz, vec2f(0.0), vec2f(1.0));
		localPosXZ = localPosXZ + (-positiveUnitOffset * uniform.innerOffset.xy + negativeUnitOffset * uniform.innerOffset.zw) * vertex_texCoord0.xy;
		dTiledUvGlobal = (localPosXZ - uniform.outerScale + uniform.innerOffset.xy) * -0.5 + 1.0;
		localPosXZ = localPosXZ * -0.5;
		localPos = vec3f(localPosXZ.x, localPosXZ.y, localPos.y);
	#endif
	var posW: vec4f = modelMatrix * vec4f(localPos, 1.0);
	#ifdef SCREENSPACE
		posW = vec4f(posW.xy, 0.0, 1.0);
	#endif
	return posW;
}
fn getPosition() -> vec4f {
	dModelMatrix = getModelMatrix();
	let posW: vec4f = evalWorldPosition(vertex_position.xyz, dModelMatrix);
	dPositionW = posW.xyz;
	var screenPos: vec4f;
	#ifdef UV1LAYOUT
		screenPos = vec4f(vertex_texCoord1.xy * 2.0 - 1.0, 0.5, 1.0);
		screenPos.y *= -1.0;
	#else
		#ifdef SCREENSPACE
			screenPos = posW;
			screenPos.y *= uniform.projectionFlipY;
		#else
			screenPos = uniform.matrix_viewProjection * posW;
		#endif
		#ifdef PIXELSNAP
			screenPos.xy = (screenPos.xy * 0.5) + 0.5;
			screenPos.xy *= uniforms.uScreenSize.xy;
			screenPos.xy = floor(screenPos.xy);
			screenPos.xy *= uniforms.uScreenSize.zw;
			screenPos.xy = (screenPos.xy * 2.0) - 1.0;
		#endif
	#endif
	return screenPos;
}
fn getWorldPosition() -> vec3f {
	return dPositionW;
}
`

var transformCoreVS = `
	attribute vertex_position: vec4f;
	uniform matrix_viewProjection: mat4x4f;
	uniform matrix_model: mat4x4f;
	
	#ifdef MORPHING
		uniform morph_tex_params: vec2f;
		attribute morph_vertex_id: u32;
		fn getTextureMorphCoords() -> vec2i {
			var textureSize: vec2i = vec2i(uniform.morph_tex_params);
			var morphGridV: i32 = i32(morph_vertex_id) / textureSize.x;
			var morphGridU: i32 = i32(morph_vertex_id) - (morphGridV * textureSize.x);
			morphGridV = textureSize.y - morphGridV - 1;
			return vec2i(morphGridU, morphGridV);
		}
		#ifdef MORPHING_POSITION
			#ifdef MORPHING_INT
				uniform aabbSize: vec3f;
				uniform aabbMin: vec3f;
				var morphPositionTex: texture_2d<u32>;
			#else
				var morphPositionTex: texture_2d<f32>;
			#endif
		#endif
	#endif
	#ifdef defined(BATCH)
		#include "skinBatchVS"
		fn getModelMatrix() -> mat4x4f {
			return getBoneMatrix(vertex_boneIndices);
		}
	#elif defined(SKIN)
		#include "skinVS"
		fn getModelMatrix() -> mat4x4f {
			return uniform.matrix_model * getSkinMatrix(vertex_boneIndices, vertex_boneWeights);
		}
	#elif defined(INSTANCING)
		#include "transformInstancingVS"
	#else
		fn getModelMatrix() -> mat4x4f {
			return uniform.matrix_model;
		}
	#endif
	fn getLocalPosition(vertexPosition: vec3f) -> vec3f {
		var localPos: vec3f = vertexPosition;
		#ifdef MORPHING_POSITION
			var morphUV: vec2i = getTextureMorphCoords();
			#ifdef MORPHING_INT
				var morphPos: vec3f = vec3f(textureLoad(morphPositionTex, morphUV, 0).xyz) / 65535.0 * uniform.aabbSize + uniform.aabbMin;
			#else
				var morphPos: vec3f = textureLoad(morphPositionTex, morphUV, 0).xyz;
			#endif
			localPos += morphPos;
		#endif
		return localPos;
	}
`

var transformInstancingVS = `
attribute instance_line1: vec4f;
attribute instance_line2: vec4f;
attribute instance_line3: vec4f;
attribute instance_line4: vec4f;
fn getModelMatrix() -> mat4x4f {
	return uniform.matrix_model * mat4x4f(instance_line1, instance_line2, instance_line3, instance_line4);
}
`

var transmissionPS = `
#ifdef STD_REFRACTION_CONSTANT
	uniform material_refraction: f32;
#endif
fn getRefraction() {
	var refraction: f32 = 1.0;
	#ifdef STD_REFRACTION_CONSTANT
	refraction = uniform.material_refraction;
	#endif
	#ifdef STD_REFRACTION_TEXTURE
	refraction = refraction * textureSampleBias({STD_REFRACTION_TEXTURE_NAME}, {STD_REFRACTION_TEXTURE_NAME}Sampler, {STD_REFRACTION_TEXTURE_UV}, uniform.textureBias).{STD_REFRACTION_TEXTURE_CHANNEL};
	#endif
	#ifdef STD_REFRACTION_VERTEX
	refraction = refraction * saturate(vVertexColor.{STD_REFRACTION_VERTEX_CHANNEL});
	#endif
	dTransmission = refraction;
}
`

var twoSidedLightingPS = `
fn handleTwoSidedLighting() {
	if (!pcFrontFacing) { dTBN[2] = -dTBN[2]; }
}
`

var uv0VS = `
#ifdef NINESLICED
	fn getUv0() -> vec2f {
		var uv = vertex_position.xz;
		let positiveUnitOffset = clamp(vertex_position.xz, vec2f(0.0, 0.0), vec2f(1.0, 1.0));
		let negativeUnitOffset = clamp(-vertex_position.xz, vec2f(0.0, 0.0), vec2f(1.0, 1.0));
		uv = uv + ((-positiveUnitOffset * uniform.innerOffset.xy) + (negativeUnitOffset * uniform.innerOffset.zw)) * vertex_texCoord0.xy;
		uv = uv * -0.5 + vec2f(0.5, 0.5);
		uv = uv * uniform.atlasRect.zw + uniform.atlasRect.xy;
		dMaskGlobal = vertex_texCoord0.xy;
		return uv;
	}
#else
	fn getUv0() -> vec2f {
		return vertex_texCoord0;
	}
#endif
`

var uv1VS = `
fn getUv1() -> vec2f {
	return vertex_texCoord1;
}
`

var uvTransformVS = `
output.vUV{TRANSFORM_UV_{i}}_{TRANSFORM_ID_{i}} = vec2f(
	dot(vec3f(uv{TRANSFORM_UV_{i}}, 1), uniform.{TRANSFORM_NAME_{i}}0),
	dot(vec3f(uv{TRANSFORM_UV_{i}}, 1), uniform.{TRANSFORM_NAME_{i}}1)
);
`

var uvTransformUniformsPS = `
	uniform {TRANSFORM_NAME_{i}}0: vec3f;
	uniform {TRANSFORM_NAME_{i}}1: vec3f;
`

var viewDirPS = `
fn getViewDir() {
	dViewDirW = normalize(uniform.view_position - vPositionW);
}
`
const shaderChunksWGSL = {
    alphaTestPS,
    ambientPS,
    anisotropyPS,
    aoPS,
    aoDiffuseOccPS,
    aoSpecOccPS,
    bakeDirLmEndPS,
    bakeLmEndPS,
    basePS,
    baseNineSlicedPS,
    baseNineSlicedTiledPS,
    bayerPS,
    blurVSMPS,
    clearCoatPS,
    clearCoatGlossPS,
    clearCoatNormalPS,
    clusteredLightCookiesPS,
    clusteredLightShadowsPS,
    clusteredLightUtilsPS,
    clusteredLightPS,
    combinePS,
    cookieBlit2DPS,
    cookieBlitCubePS,
    cookieBlitVS,
    cubeMapProjectPS,
    cubeMapRotatePS,
    debugOutputPS,
    debugProcessFrontendPS,
    detailModesPS,
    diffusePS,
    decodePS,
    emissivePS,
    encodePS,
    endPS,
    envAtlasPS,
    envProcPS,
    falloffInvSquaredPS,
    falloffLinearPS,
    floatAsUintPS,
    fogPS,
    fresnelSchlickPS,
    frontendCodePS: '',
    frontendDeclPS: '',
    fullscreenQuadVS,
    gammaPS,
    glossPS,
    quadVS,
    indirectCoreCS,
    immediateLinePS,
    immediateLineVS,
    iridescenceDiffractionPS,
    iridescencePS,
    iridescenceThicknessPS,
    iorPS,
    lightDeclarationPS,
    lightDiffuseLambertPS,
    lightDirPointPS,
    lightEvaluationPS,
    lightFunctionLightPS,
    lightFunctionShadowPS,
    lightingPS,
    lightmapAddPS,
    lightmapPS,
    lightSpecularAnisoGGXPS,
    lightSpecularGGXPS,
    lightSpecularBlinnPS,
    lightSheenPS,
    linearizeDepthPS,
    litForwardBackendPS,
    litForwardDeclarationPS,
    litForwardMainPS,
    litForwardPostCodePS,
    litForwardPreCodePS,
    litMainPS,
    litMainVS,
    litOtherMainPS,
    litShaderArgsPS,
    litShaderCorePS,
    litShadowMainPS,
    litUserDeclarationPS: '',
    litUserDeclarationVS: '',
    litUserCodePS: '',
    litUserCodeVS: '',
    litUserMainStartPS: '',
    litUserMainStartVS: '',
    litUserMainEndPS: '',
    litUserMainEndVS: '',
    ltcPS,
    metalnessPS,
    metalnessModulatePS,
    morphPS,
    morphVS,
    msdfPS,
    msdfVS,
    normalVS,
    normalCoreVS,
    normalMapPS,
    opacityPS,
    opacityDitherPS,
    outputPS,
    outputAlphaPS,
    outputTex2DPS,
    sheenPS,
    sheenGlossPS,
    parallaxPS,
    pickPS,
    reflDirPS,
    reflDirAnisoPS,
    reflectionCCPS,
    reflectionCubePS,
    reflectionEnvHQPS,
    reflectionEnvPS,
    reflectionSpherePS,
    reflectionSheenPS,
    refractionCubePS,
    refractionDynamicPS,
    reprojectPS,
    reprojectVS,
    screenDepthPS,
    shadowCascadesPS,
    shadowEVSMPS,
    shadowPCF1PS,
    shadowPCF3PS,
    shadowPCF5PS,
    shadowSoftPS,
    skinBatchVS,
    skinVS,
    skyboxPS,
    skyboxVS,
    specularPS,
    sphericalPS,
    specularityFactorPS,
    spotPS,
    startNineSlicedPS,
    startNineSlicedTiledPS,
    stdDeclarationPS,
    stdFrontEndPS,
    TBNPS,
    thicknessPS,
    tonemappingPS,
    tonemappingAcesPS,
    tonemappingAces2PS,
    tonemappingFilmicPS,
    tonemappingHejlPS,
    tonemappingLinearPS,
    tonemappingNeutralPS,
    tonemappingNonePS,
    transformVS,
    transformCoreVS,
    transformInstancingVS,
    transmissionPS,
    twoSidedLightingPS,
    uv0VS,
    uv1VS,
    uvTransformVS,
    uvTransformUniformsPS,
    viewDirPS,
    webgpuPS,
    webgpuVS,
}
