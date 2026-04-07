function extend(target, ex) {
    for (const prop in ex) {
        const copy = ex[prop]
        if (Array.isArray(copy)) {
            target[prop] = extend([], copy)
        } else if (copy && typeof copy === 'object') {
            target[prop] = extend({}, copy)
        } else {
            target[prop] = copy
        }
    }
    return target
}

const guid = {
    create() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0
            const v = c === 'x' ? r : (r & 0x3) | 0x8
            return v.toString(16)
        })
    },
}

const path = {
    delimiter: '/',
    join(...sections) {
        let result = sections[0]
        for (let i = 0; i < sections.length - 1; i++) {
            const one = sections[i]
            const two = sections[i + 1]
            if (two[0] === path.delimiter) {
                result = two
                continue
            }
            if (one && two && one[one.length - 1] !== path.delimiter && two[0] !== path.delimiter) {
                result += path.delimiter + two
            } else {
                result += two
            }
        }
        return result
    },
    normalize(pathname) {
        const lead = pathname.startsWith(path.delimiter)
        const trail = pathname.endsWith(path.delimiter)
        const parts = pathname.split('/')
        let result = ''
        let cleaned = []
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '') continue
            if (parts[i] === '.') continue
            if (parts[i] === '..' && cleaned.length > 0) {
                cleaned = cleaned.slice(0, cleaned.length - 2)
                continue
            }
            if (i > 0) cleaned.push(path.delimiter)
            cleaned.push(parts[i])
        }
        result = cleaned.join('')
        if (!lead && result[0] === path.delimiter) {
            result = result.slice(1)
        }
        if (trail && result[result.length - 1] !== path.delimiter) {
            result += path.delimiter
        }
        return result
    },
    split(pathname) {
        const lastDelimiterIndex = pathname.lastIndexOf(path.delimiter)
        if (lastDelimiterIndex !== -1) {
            return [pathname.substring(0, lastDelimiterIndex), pathname.substring(lastDelimiterIndex + 1)]
        }
        return ['', pathname]
    },
    getBasename(pathname) {
        return path.split(pathname)[1]
    },
    getDirectory(pathname) {
        return path.split(pathname)[0]
    },
    getExtension(pathname) {
        const ext = pathname.split('?')[0].split('.').pop()
        if (ext !== pathname) {
            return `.${ext}`
        }
        return ''
    },
    isRelativePath(pathname) {
        return pathname.charAt(0) !== '/' && pathname.match(/:\/\//) === null
    },
    extractPath(pathname) {
        let result = ''
        const parts = pathname.split('/')
        let i = 0
        if (parts.length > 1) {
            if (path.isRelativePath(pathname)) {
                if (parts[0] === '.') {
                    for (i = 0; i < parts.length - 1; ++i) {
                        result += i === 0 ? parts[i] : `/${parts[i]}`
                    }
                } else if (parts[0] === '..') {
                    for (i = 0; i < parts.length - 1; ++i) {
                        result += i === 0 ? parts[i] : `/${parts[i]}`
                    }
                } else {
                    result = '.'
                    for (i = 0; i < parts.length - 1; ++i) {
                        result += `/${parts[i]}`
                    }
                }
            } else {
                for (i = 0; i < parts.length - 1; ++i) {
                    result += i === 0 ? parts[i] : `/${parts[i]}`
                }
            }
        }
        return result
    },
}

const detectPassiveEvents = () => {
    let result = false
    try {
        const opts = Object.defineProperty({}, 'passive', {
            get: function () {
                result = true
                return false
            },
        })
        window.addEventListener('testpassive', null, opts)
        window.removeEventListener('testpassive', null, opts)
    } catch (e) {}
    return result
}
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
const environment = typeof window !== 'undefined' ? 'browser' : typeof global !== 'undefined' ? 'node' : 'worker'
const platformName = /android/i.test(ua)
    ? 'android'
    : /ip(?:[ao]d|hone)/i.test(ua)
      ? 'ios'
      : /windows/i.test(ua)
        ? 'windows'
        : /mac os/i.test(ua)
          ? 'osx'
          : /linux/i.test(ua)
            ? 'linux'
            : /cros/i.test(ua)
              ? 'cros'
              : null
const browserName =
    environment !== 'browser'
        ? null
        : /Chrome\/|Chromium\/|Edg.*\//.test(ua)
          ? 'chrome'
          : /Safari\//.test(ua)
            ? 'safari'
            : /Firefox\//.test(ua)
              ? 'firefox'
              : 'other'
const passiveEvents = detectPassiveEvents()
const platform = {
    name: platformName,
    environment: environment,
    browser: environment === 'browser',
    worker: environment === 'worker',
    desktop: ['windows', 'osx', 'linux', 'cros'].includes(platformName),
    mobile: ['android', 'ios'].includes(platformName),
    ios: platformName === 'ios',
    android: platformName === 'android',
    passiveEvents: passiveEvents,
    browserName: browserName,
}

class EventHandle {
    off() {
        if (this._removed) return
        this.handler.offByHandle(this)
    }
    on(name, callback, scope = this) {
        return this.handler._addCallback(name, callback, scope, false)
    }
    once(name, callback, scope = this) {
        return this.handler._addCallback(name, callback, scope, true)
    }
    set removed(value) {
        if (!value) return
        this._removed = true
    }
    get removed() {
        return this._removed
    }
    toJSON(key) {
        return undefined
    }
    constructor(handler, name, callback, scope, once = false) {
        this._removed = false
        this.handler = handler
        this.name = name
        this.callback = callback
        this.scope = scope
        this._once = once
    }
}

class EventHandler {
    initEventHandler() {
        this._callbacks = new Map()
        this._callbackActive = new Map()
    }
    _addCallback(name, callback, scope, once) {
        if (!this._callbacks.has(name)) {
            this._callbacks.set(name, [])
        }
        if (this._callbackActive.has(name)) {
            const callbackActive = this._callbackActive.get(name)
            if (callbackActive && callbackActive === this._callbacks.get(name)) {
                this._callbackActive.set(name, callbackActive.slice())
            }
        }
        const evt = new EventHandle(this, name, callback, scope, once)
        this._callbacks.get(name).push(evt)
        return evt
    }
    on(name, callback, scope = this) {
        return this._addCallback(name, callback, scope, false)
    }
    once(name, callback, scope = this) {
        return this._addCallback(name, callback, scope, true)
    }
    off(name, callback, scope) {
        if (name) {
            if (this._callbackActive.has(name) && this._callbackActive.get(name) === this._callbacks.get(name)) {
                this._callbackActive.set(name, this._callbackActive.get(name).slice())
            }
        } else {
            for (const [key, callbacks] of this._callbackActive) {
                if (!this._callbacks.has(key)) {
                    continue
                }
                if (this._callbacks.get(key) !== callbacks) {
                    continue
                }
                this._callbackActive.set(key, callbacks.slice())
            }
        }
        if (!name) {
            for (const callbacks of this._callbacks.values()) {
                for (let i = 0; i < callbacks.length; i++) {
                    callbacks[i].removed = true
                }
            }
            this._callbacks.clear()
        } else if (!callback) {
            const callbacks = this._callbacks.get(name)
            if (callbacks) {
                for (let i = 0; i < callbacks.length; i++) {
                    callbacks[i].removed = true
                }
                this._callbacks.delete(name)
            }
        } else {
            const callbacks = this._callbacks.get(name)
            if (!callbacks) {
                return this
            }
            for (let i = 0; i < callbacks.length; i++) {
                if (callbacks[i].callback !== callback) {
                    continue
                }
                if (scope && callbacks[i].scope !== scope) {
                    continue
                }
                callbacks[i].removed = true
                callbacks.splice(i, 1)
                i--
            }
            if (callbacks.length === 0) {
                this._callbacks.delete(name)
            }
        }
        return this
    }
    offByHandle(handle) {
        const name = handle.name
        handle.removed = true
        if (this._callbackActive.has(name) && this._callbackActive.get(name) === this._callbacks.get(name)) {
            this._callbackActive.set(name, this._callbackActive.get(name).slice())
        }
        const callbacks = this._callbacks.get(name)
        if (!callbacks) {
            return this
        }
        const ind = callbacks.indexOf(handle)
        if (ind !== -1) {
            callbacks.splice(ind, 1)
            if (callbacks.length === 0) {
                this._callbacks.delete(name)
            }
        }
        return this
    }
    fire(name, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
        if (!name) {
            return this
        }
        const callbacksInitial = this._callbacks.get(name)
        if (!callbacksInitial) {
            return this
        }
        let callbacks
        if (!this._callbackActive.has(name)) {
            this._callbackActive.set(name, callbacksInitial)
        } else if (this._callbackActive.get(name) !== callbacksInitial) {
            callbacks = callbacksInitial.slice()
        }
        for (
            let i = 0;
            (callbacks || this._callbackActive.get(name)) && i < (callbacks || this._callbackActive.get(name)).length;
            i++
        ) {
            const evt = (callbacks || this._callbackActive.get(name))[i]
            if (!evt.callback) continue
            evt.callback.call(evt.scope, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8)
            if (evt._once) {
                const existingCallback = this._callbacks.get(name)
                const ind = existingCallback ? existingCallback.indexOf(evt) : -1
                if (ind !== -1) {
                    if (this._callbackActive.get(name) === existingCallback) {
                        this._callbackActive.set(name, this._callbackActive.get(name).slice())
                    }
                    const callbacks = this._callbacks.get(name)
                    if (!callbacks) continue
                    callbacks[ind].removed = true
                    callbacks.splice(ind, 1)
                    if (callbacks.length === 0) {
                        this._callbacks.delete(name)
                    }
                }
            }
        }
        if (!callbacks) {
            this._callbackActive.delete(name)
        }
        return this
    }
    hasEvent(name) {
        return !!this._callbacks.get(name)?.length
    }
    constructor() {
        this._callbacks = new Map()
        this._callbackActive = new Map()
    }
}

const cachedResult = (func) => {
    const uninitToken = {}
    let result = uninitToken
    return () => {
        if (result === uninitToken) {
            result = func()
        }
        return result
    }
}
class Impl {
    static loadScript(url, callback) {
        const s = document.createElement('script')
        s.setAttribute('src', url)
        s.onload = () => {
            callback(null)
        }
        s.onerror = () => {
            callback(`Failed to load script='${url}'`)
        }
        document.body.appendChild(s)
    }
    static loadWasm(moduleName, config, callback) {
        const loadUrl = Impl.wasmSupported() && config.glueUrl && config.wasmUrl ? config.glueUrl : config.fallbackUrl
        if (loadUrl) {
            Impl.loadScript(loadUrl, (err) => {
                if (err) {
                    callback(err, null)
                } else {
                    const module = window[moduleName]
                    window[moduleName] = undefined
                    module({
                        locateFile: () => config.wasmUrl,
                        onAbort: () => {
                            callback('wasm module aborted.')
                        },
                    }).then((instance) => {
                        callback(null, instance)
                    })
                }
            })
        } else {
            callback('No supported wasm modules found.', null)
        }
    }
    static getModule(name) {
        if (!Impl.modules.hasOwnProperty(name)) {
            Impl.modules[name] = {
                config: null,
                initializing: false,
                instance: null,
                callbacks: [],
            }
        }
        return Impl.modules[name]
    }
    static initialize(moduleName, module) {
        if (module.initializing) {
            return
        }
        const config = module.config
        if (config.glueUrl || config.wasmUrl || config.fallbackUrl) {
            module.initializing = true
            Impl.loadWasm(moduleName, config, (err, instance) => {
                if (err) {
                    if (config.errorHandler) {
                        config.errorHandler(err)
                    } else {
                        console.error(`failed to initialize module=${moduleName} error=${err}`)
                    }
                } else {
                    module.instance = instance
                    module.callbacks.forEach((callback) => {
                        callback(instance)
                    })
                }
            })
        }
    }
}
Impl.modules = {}
Impl.wasmSupported = cachedResult(() => {
    try {
        if (typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function') {
            const module = new WebAssembly.Module(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
            if (module instanceof WebAssembly.Module) {
                return new WebAssembly.Instance(module) instanceof WebAssembly.Instance
            }
        }
    } catch (e) {}
    return false
})
class WasmModule {
    static setConfig(moduleName, config) {
        const module = Impl.getModule(moduleName)
        module.config = config
        if (module.callbacks.length > 0) {
            Impl.initialize(moduleName, module)
        }
    }
    static getConfig(moduleName) {
        return Impl.modules?.[moduleName]?.config
    }
    static getInstance(moduleName, callback) {
        const module = Impl.getModule(moduleName)
        if (module.instance) {
            callback(module.instance)
        } else {
            module.callbacks.push(callback)
            if (module.config) {
                Impl.initialize(moduleName, module)
            }
        }
    }
}

class ReadStream {
    get remainingBytes() {
        return this.dataView.byteLength - this.offset
    }
    reset(offset = 0) {
        this.offset = offset
    }
    skip(bytes) {
        this.offset += bytes
    }
    align(bytes) {
        this.offset = (this.offset + bytes - 1) & ~(bytes - 1)
    }
    _inc(amount) {
        this.offset += amount
        return this.offset - amount
    }
    readChar() {
        return String.fromCharCode(this.dataView.getUint8(this.offset++))
    }
    readChars(numChars) {
        let result = ''
        for (let i = 0; i < numChars; ++i) {
            result += this.readChar()
        }
        return result
    }
    readU8() {
        return this.dataView.getUint8(this.offset++)
    }
    readU16() {
        return this.dataView.getUint16(this._inc(2), true)
    }
    readU32() {
        return this.dataView.getUint32(this._inc(4), true)
    }
    readU64() {
        return this.readU32() + 2 ** 32 * this.readU32()
    }
    readU32be() {
        return this.dataView.getUint32(this._inc(4), false)
    }
    readArray(result) {
        for (let i = 0; i < result.length; ++i) {
            result[i] = this.readU8()
        }
    }
    readLine() {
        const view = this.dataView
        let result = ''
        while (true) {
            if (this.offset >= view.byteLength) {
                break
            }
            const c = String.fromCharCode(this.readU8())
            if (c === '\n') {
                break
            }
            result += c
        }
        return result
    }
    constructor(arraybuffer) {
        this.offset = 0
        this.arraybuffer = arraybuffer
        this.dataView = new DataView(arraybuffer)
    }
}

class SortedLoopArray {
    _binarySearch(item) {
        let left = 0
        let right = this.items.length - 1
        const search = item[this._sortBy]
        let middle
        let current
        while (left <= right) {
            middle = Math.floor((left + right) / 2)
            current = this.items[middle][this._sortBy]
            if (current <= search) {
                left = middle + 1
            } else if (current > search) {
                right = middle - 1
            }
        }
        return left
    }
    _doSort(a, b) {
        const sortBy = this._sortBy
        return a[sortBy] - b[sortBy]
    }
    insert(item) {
        const index = this._binarySearch(item)
        this.items.splice(index, 0, item)
        this.length++
        if (this.loopIndex >= index) {
            this.loopIndex++
        }
    }
    append(item) {
        this.items.push(item)
        this.length++
    }
    remove(item) {
        const idx = this.items.indexOf(item)
        if (idx < 0) return
        this.items.splice(idx, 1)
        this.length--
        if (this.loopIndex >= idx) {
            this.loopIndex--
        }
    }
    sort() {
        const current = this.loopIndex >= 0 ? this.items[this.loopIndex] : null
        this.items.sort(this._sortHandler)
        if (current !== null) {
            this.loopIndex = this.items.indexOf(current)
        }
    }
    constructor(args) {
        this.items = []
        this.length = 0
        this.loopIndex = -1
        this._sortBy = args.sortBy
        this._sortHandler = this._doSort.bind(this)
    }
}

class Tags extends EventHandler {
    add(...args) {
        let changed = false
        const tags = this._processArguments(args, true)
        if (!tags.length) {
            return changed
        }
        for (let i = 0; i < tags.length; i++) {
            if (this._index[tags[i]]) {
                continue
            }
            changed = true
            this._index[tags[i]] = true
            this._list.push(tags[i])
            this.fire('add', tags[i], this._parent)
        }
        if (changed) {
            this.fire('change', this._parent)
        }
        return changed
    }
    remove(...args) {
        let changed = false
        if (!this._list.length) {
            return changed
        }
        const tags = this._processArguments(args, true)
        if (!tags.length) {
            return changed
        }
        for (let i = 0; i < tags.length; i++) {
            if (!this._index[tags[i]]) {
                continue
            }
            changed = true
            delete this._index[tags[i]]
            this._list.splice(this._list.indexOf(tags[i]), 1)
            this.fire('remove', tags[i], this._parent)
        }
        if (changed) {
            this.fire('change', this._parent)
        }
        return changed
    }
    clear() {
        if (!this._list.length) {
            return
        }
        const tags = this._list.slice(0)
        this._list = []
        this._index = {}
        for (let i = 0; i < tags.length; i++) {
            this.fire('remove', tags[i], this._parent)
        }
        this.fire('change', this._parent)
    }
    has(...query) {
        if (!this._list.length) {
            return false
        }
        return this._has(this._processArguments(query))
    }
    _has(tags) {
        if (!this._list.length || !tags.length) {
            return false
        }
        for (let i = 0; i < tags.length; i++) {
            if (tags[i].length === 1) {
                if (this._index[tags[i][0]]) {
                    return true
                }
            } else {
                let multiple = true
                for (let t = 0; t < tags[i].length; t++) {
                    if (this._index[tags[i][t]]) {
                        continue
                    }
                    multiple = false
                    break
                }
                if (multiple) {
                    return true
                }
            }
        }
        return false
    }
    list() {
        return this._list.slice(0)
    }
    _processArguments(args, flat) {
        const tags = []
        let tmp = []
        if (!args || !args.length) {
            return tags
        }
        for (let i = 0; i < args.length; i++) {
            if (args[i] instanceof Array) {
                if (!flat) {
                    tmp = []
                }
                for (let t = 0; t < args[i].length; t++) {
                    if (typeof args[i][t] !== 'string') {
                        continue
                    }
                    if (flat) {
                        tags.push(args[i][t])
                    } else {
                        tmp.push(args[i][t])
                    }
                }
                if (!flat && tmp.length) {
                    tags.push(tmp)
                }
            } else if (typeof args[i] === 'string') {
                if (flat) {
                    tags.push(args[i])
                } else {
                    tags.push([args[i]])
                }
            }
        }
        return tags
    }
    get size() {
        return this._list.length
    }
    constructor(parent) {
        ;(super(), (this._index = {}), (this._list = []))
        this._parent = parent
    }
}
Tags.EVENT_ADD = 'add'
Tags.EVENT_REMOVE = 'remove'
Tags.EVENT_CHANGE = 'change'

const now =
    typeof window !== 'undefined' && window.performance && window.performance.now
        ? performance.now.bind(performance)
        : Date.now

const re = /^(([^:/?#]+):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/
class URI {
    toString() {
        let s = ''
        if (this.scheme) {
            s += `${this.scheme}:`
        }
        if (this.authority) {
            s += `//${this.authority}`
        }
        s += this.path
        if (this.query) {
            s += `?${this.query}`
        }
        if (this.fragment) {
            s += `#${this.fragment}`
        }
        return s
    }
    getQuery() {
        const result = {}
        if (this.query) {
            const queryParams = decodeURIComponent(this.query).split('&')
            for (const queryParam of queryParams) {
                const pair = queryParam.split('=')
                result[pair[0]] = pair[1]
            }
        }
        return result
    }
    setQuery(params) {
        let q = ''
        for (const key in params) {
            if (params.hasOwnProperty(key)) {
                if (q !== '') {
                    q += '&'
                }
                q += `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
            }
        }
        this.query = q
    }
    constructor(uri) {
        const result = uri.match(re)
        this.scheme = result[2]
        this.authority = result[4]
        this.path = result[5]
        this.query = result[7]
        this.fragment = result[9]
    }
}

class Tracing {
    static set(channel, enabled = true) {}
    static get(channel) {
        return Tracing._traceChannels.has(channel)
    }
}
Tracing._traceChannels = new Set()
Tracing.stack = false

const CURVE_LINEAR = 0
const CURVE_SMOOTHSTEP = 1
const CURVE_SPLINE = 4
const CURVE_STEP = 5

const math = {
    DEG_TO_RAD: Math.PI / 180,
    RAD_TO_DEG: 180 / Math.PI,
    clamp(value, min, max) {
        if (value >= max) return max
        if (value <= min) return min
        return value
    },
    intToBytes24(i) {
        const r = (i >> 16) & 0xff
        const g = (i >> 8) & 0xff
        const b = i & 0xff
        return [r, g, b]
    },
    intToBytes32(i) {
        const r = (i >> 24) & 0xff
        const g = (i >> 16) & 0xff
        const b = (i >> 8) & 0xff
        const a = i & 0xff
        return [r, g, b, a]
    },
    bytesToInt24(r, g, b) {
        if (r.length) {
            b = r[2]
            g = r[1]
            r = r[0]
        }
        return (r << 16) | (g << 8) | b
    },
    bytesToInt32(r, g, b, a) {
        if (r.length) {
            a = r[3]
            b = r[2]
            g = r[1]
            r = r[0]
        }
        return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
    },
    lerp(a, b, alpha) {
        return a + (b - a) * math.clamp(alpha, 0, 1)
    },
    lerpAngle(a, b, alpha) {
        if (b - a > 180) {
            b -= 360
        }
        if (b - a < -180) {
            b += 360
        }
        return math.lerp(a, b, math.clamp(alpha, 0, 1))
    },
    powerOfTwo(x) {
        return x !== 0 && !(x & (x - 1))
    },
    nextPowerOfTwo(val) {
        val--
        val |= val >> 1
        val |= val >> 2
        val |= val >> 4
        val |= val >> 8
        val |= val >> 16
        val++
        return val
    },
    nearestPowerOfTwo(val) {
        return Math.pow(2, Math.round(Math.log2(val)))
    },
    random(min, max) {
        const diff = max - min
        return Math.random() * diff + min
    },
    smoothstep(min, max, x) {
        if (x <= min) return 0
        if (x >= max) return 1
        x = (x - min) / (max - min)
        return x * x * (3 - 2 * x)
    },
    smootherstep(min, max, x) {
        if (x <= min) return 0
        if (x >= max) return 1
        x = (x - min) / (max - min)
        return x * x * x * (x * (x * 6 - 15) + 10)
    },
    roundUp(numToRound, multiple) {
        if (multiple === 0) {
            return numToRound
        }
        return Math.ceil(numToRound / multiple) * multiple
    },
    between(num, a, b, inclusive) {
        const min = Math.min(a, b)
        const max = Math.max(a, b)
        return inclusive ? num >= min && num <= max : num > min && num < max
    },
}

class Color {
    clone() {
        const cstr = this.constructor
        return new cstr(this.r, this.g, this.b, this.a)
    }
    copy(rhs) {
        this.r = rhs.r
        this.g = rhs.g
        this.b = rhs.b
        this.a = rhs.a
        return this
    }
    equals(rhs) {
        return this.r === rhs.r && this.g === rhs.g && this.b === rhs.b && this.a === rhs.a
    }
    set(r, g, b, a = 1) {
        this.r = r
        this.g = g
        this.b = b
        this.a = a
        return this
    }
    lerp(lhs, rhs, alpha) {
        this.r = lhs.r + alpha * (rhs.r - lhs.r)
        this.g = lhs.g + alpha * (rhs.g - lhs.g)
        this.b = lhs.b + alpha * (rhs.b - lhs.b)
        this.a = lhs.a + alpha * (rhs.a - lhs.a)
        return this
    }
    linear(src = this) {
        this.r = Math.pow(src.r, 2.2)
        this.g = Math.pow(src.g, 2.2)
        this.b = Math.pow(src.b, 2.2)
        this.a = src.a
        return this
    }
    gamma(src = this) {
        this.r = Math.pow(src.r, 1 / 2.2)
        this.g = Math.pow(src.g, 1 / 2.2)
        this.b = Math.pow(src.b, 1 / 2.2)
        this.a = src.a
        return this
    }
    mulScalar(scalar) {
        this.r *= scalar
        this.g *= scalar
        this.b *= scalar
        return this
    }
    fromString(hex) {
        const i = parseInt(hex.replace('#', '0x'), 16)
        let bytes
        if (hex.length > 7) {
            bytes = math.intToBytes32(i)
        } else {
            bytes = math.intToBytes24(i)
            bytes[3] = 255
        }
        this.set(bytes[0] / 255, bytes[1] / 255, bytes[2] / 255, bytes[3] / 255)
        return this
    }
    fromArray(arr, offset = 0) {
        this.r = arr[offset] ?? this.r
        this.g = arr[offset + 1] ?? this.g
        this.b = arr[offset + 2] ?? this.b
        this.a = arr[offset + 3] ?? this.a
        return this
    }
    toString(alpha, asArray) {
        const { r, g, b, a } = this
        if (asArray || r > 1 || g > 1 || b > 1) {
            return `${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, ${a.toFixed(3)}`
        }
        let s = `#${((1 << 24) + (Math.round(r * 255) << 16) + (Math.round(g * 255) << 8) + Math.round(b * 255)).toString(16).slice(1)}`
        if (alpha === true) {
            const aa = Math.round(a * 255).toString(16)
            if (this.a < 16 / 255) {
                s += `0${aa}`
            } else {
                s += aa
            }
        }
        return s
    }
    toArray(arr = [], offset = 0, alpha = true) {
        arr[offset] = this.r
        arr[offset + 1] = this.g
        arr[offset + 2] = this.b
        if (alpha) {
            arr[offset + 3] = this.a
        }
        return arr
    }
    constructor(r = 0, g = 0, b = 0, a = 1) {
        const length = r.length
        if (length === 3 || length === 4) {
            this.r = r[0]
            this.g = r[1]
            this.b = r[2]
            this.a = r[3] ?? 1
        } else {
            this.r = r
            this.g = g
            this.b = b
            this.a = a
        }
    }
}
Color.BLACK = Object.freeze(new Color(0, 0, 0, 1))
Color.BLUE = Object.freeze(new Color(0, 0, 1, 1))
Color.CYAN = Object.freeze(new Color(0, 1, 1, 1))
Color.GRAY = Object.freeze(new Color(0.5, 0.5, 0.5, 1))
Color.GREEN = Object.freeze(new Color(0, 1, 0, 1))
Color.MAGENTA = Object.freeze(new Color(1, 0, 1, 1))
Color.RED = Object.freeze(new Color(1, 0, 0, 1))
Color.WHITE = Object.freeze(new Color(1, 1, 1, 1))
Color.YELLOW = Object.freeze(new Color(1, 1, 0, 1))

class CurveEvaluator {
    evaluate(time, forceReset = false) {
        if (forceReset || time < this._left || time >= this._right) {
            this._reset(time)
        }
        let result
        const type = this._curve.type
        if (type === CURVE_STEP) {
            result = this._p0
        } else {
            const t = this._recip === 0 ? 0 : (time - this._left) * this._recip
            if (type === CURVE_LINEAR) {
                result = math.lerp(this._p0, this._p1, t)
            } else if (type === CURVE_SMOOTHSTEP) {
                result = math.lerp(this._p0, this._p1, t * t * (3 - 2 * t))
            } else {
                result = this._evaluateHermite(this._p0, this._p1, this._m0, this._m1, t)
            }
        }
        return result
    }
    _reset(time) {
        const keys = this._curve.keys
        const len = keys.length
        if (!len) {
            this._left = -Infinity
            this._right = Infinity
            this._recip = 0
            this._p0 = this._p1 = this._m0 = this._m1 = 0
        } else {
            if (time < keys[0][0]) {
                this._left = -Infinity
                this._right = keys[0][0]
                this._recip = 0
                this._p0 = this._p1 = keys[0][1]
                this._m0 = this._m1 = 0
            } else if (time >= keys[len - 1][0]) {
                this._left = keys[len - 1][0]
                this._right = Infinity
                this._recip = 0
                this._p0 = this._p1 = keys[len - 1][1]
                this._m0 = this._m1 = 0
            } else {
                let index = 0
                while (time >= keys[index + 1][0]) {
                    index++
                }
                this._left = keys[index][0]
                this._right = keys[index + 1][0]
                const diff = 1.0 / (this._right - this._left)
                this._recip = isFinite(diff) ? diff : 0
                this._p0 = keys[index][1]
                this._p1 = keys[index + 1][1]
                if (this._curve.type === CURVE_SPLINE) {
                    this._calcTangents(keys, index)
                }
            }
        }
    }
    _calcTangents(keys, index) {
        let a
        const b = keys[index]
        const c = keys[index + 1]
        let d
        if (index === 0) {
            a = [keys[0][0] + (keys[0][0] - keys[1][0]), keys[0][1] + (keys[0][1] - keys[1][1])]
        } else {
            a = keys[index - 1]
        }
        if (index === keys.length - 2) {
            d = [
                keys[index + 1][0] + (keys[index + 1][0] - keys[index][0]),
                keys[index + 1][1] + (keys[index + 1][1] - keys[index][1]),
            ]
        } else {
            d = keys[index + 2]
        }
        if (this._curve.type === CURVE_SPLINE) {
            const s1_ = (2 * (c[0] - b[0])) / (c[0] - a[0])
            const s2_ = (2 * (c[0] - b[0])) / (d[0] - b[0])
            this._m0 = this._curve.tension * (isFinite(s1_) ? s1_ : 0) * (c[1] - a[1])
            this._m1 = this._curve.tension * (isFinite(s2_) ? s2_ : 0) * (d[1] - b[1])
        } else {
            const s1 = (c[0] - b[0]) / (b[0] - a[0])
            const s2 = (c[0] - b[0]) / (d[0] - c[0])
            const a_ = b[1] + (a[1] - b[1]) * (isFinite(s1) ? s1 : 0)
            const d_ = c[1] + (d[1] - c[1]) * (isFinite(s2) ? s2 : 0)
            const tension = this._curve.tension
            this._m0 = tension * (c[1] - a_)
            this._m1 = tension * (d_ - b[1])
        }
    }
    _evaluateHermite(p0, p1, m0, m1, t) {
        const t2 = t * t
        const twot = t + t
        const omt = 1 - t
        const omt2 = omt * omt
        return p0 * ((1 + twot) * omt2) + m0 * (t * omt2) + p1 * (t2 * (3 - twot)) + m1 * (t2 * (t - 1))
    }
    constructor(curve, time = 0) {
        this._left = -Infinity
        this._right = Infinity
        this._recip = 0
        this._p0 = 0
        this._p1 = 0
        this._m0 = 0
        this._m1 = 0
        this._curve = curve
        this._reset(time)
    }
}

class Curve {
    get length() {
        return this.keys.length
    }
    add(time, value) {
        const keys = this.keys
        const len = keys.length
        let i = 0
        for (; i < len; i++) {
            if (keys[i][0] > time) {
                break
            }
        }
        const key = [time, value]
        this.keys.splice(i, 0, key)
        return key
    }
    get(index) {
        return this.keys[index]
    }
    sort() {
        this.keys.sort((a, b) => a[0] - b[0])
    }
    value(time) {
        return this._eval.evaluate(time, true)
    }
    closest(time) {
        const keys = this.keys
        const length = keys.length
        let min = 2
        let result = null
        for (let i = 0; i < length; i++) {
            const diff = Math.abs(time - keys[i][0])
            if (min >= diff) {
                min = diff
                result = keys[i]
            } else {
                break
            }
        }
        return result
    }
    clone() {
        const result = new this.constructor()
        result.keys = this.keys.map((key) => [...key])
        result.type = this.type
        result.tension = this.tension
        return result
    }
    quantize(precision) {
        precision = Math.max(precision, 2)
        const values = new Float32Array(precision)
        const step = 1.0 / (precision - 1)
        values[0] = this._eval.evaluate(0, true)
        for (let i = 1; i < precision; i++) {
            values[i] = this._eval.evaluate(step * i)
        }
        return values
    }
    quantizeClamped(precision, min, max) {
        const result = this.quantize(precision)
        for (let i = 0; i < result.length; ++i) {
            result[i] = Math.min(max, Math.max(min, result[i]))
        }
        return result
    }
    constructor(data) {
        this.keys = []
        this.type = CURVE_SMOOTHSTEP
        this.tension = 0.5
        this._eval = new CurveEvaluator(this)
        if (data) {
            for (let i = 0; i < data.length - 1; i += 2) {
                this.keys.push([data[i], data[i + 1]])
            }
        }
        this.sort()
    }
}

class CurveSet {
    get length() {
        return this.curves.length
    }
    set type(value) {
        this._type = value
        for (let i = 0; i < this.curves.length; i++) {
            this.curves[i].type = value
        }
    }
    get type() {
        return this._type
    }
    get(index) {
        return this.curves[index]
    }
    value(time, result = []) {
        const length = this.curves.length
        result.length = length
        for (let i = 0; i < length; i++) {
            result[i] = this.curves[i].value(time)
        }
        return result
    }
    clone() {
        const result = new this.constructor()
        result.curves = []
        for (let i = 0; i < this.curves.length; i++) {
            result.curves.push(this.curves[i].clone())
        }
        result._type = this._type
        return result
    }
    quantize(precision) {
        precision = Math.max(precision, 2)
        const numCurves = this.curves.length
        const values = new Float32Array(precision * numCurves)
        const step = 1.0 / (precision - 1)
        for (let c = 0; c < numCurves; c++) {
            const ev = new CurveEvaluator(this.curves[c])
            for (let i = 0; i < precision; i++) {
                values[i * numCurves + c] = ev.evaluate(step * i)
            }
        }
        return values
    }
    quantizeClamped(precision, min, max) {
        const result = this.quantize(precision)
        for (let i = 0; i < result.length; ++i) {
            result[i] = Math.min(max, Math.max(min, result[i]))
        }
        return result
    }
    constructor(...args) {
        this.curves = []
        this._type = CURVE_SMOOTHSTEP
        if (args.length > 1) {
            for (let i = 0; i < args.length; i++) {
                this.curves.push(new Curve(args[i]))
            }
        } else if (args.length === 0) {
            this.curves.push(new Curve())
        } else {
            const arg = args[0]
            if (typeof arg === 'number') {
                for (let i = 0; i < arg; i++) {
                    this.curves.push(new Curve())
                }
            } else {
                for (let i = 0; i < arg.length; i++) {
                    this.curves.push(new Curve(arg[i]))
                }
            }
        }
    }
}

const floatView = new Float32Array(1)
const int32View = new Int32Array(floatView.buffer)
class FloatPacking {
    static float2Half(value) {
        floatView[0] = value
        const x = int32View[0]
        let bits = (x >> 16) & 0x8000
        let m = (x >> 12) & 0x07ff
        const e = (x >> 23) & 0xff
        if (e < 103) {
            return bits
        }
        if (e > 142) {
            bits |= 0x7c00
            bits |= (e === 255 ? 0 : 1) && x & 0x007fffff
            return bits
        }
        if (e < 113) {
            m |= 0x0800
            bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1)
            return bits
        }
        bits |= ((e - 112) << 10) | (m >> 1)
        bits += m & 1
        return bits
    }
    static float2RGBA8(value, data) {
        floatView[0] = value
        const intBits = int32View[0]
        data.r = ((intBits >> 24) & 0xff) / 255.0
        data.g = ((intBits >> 16) & 0xff) / 255.0
        data.b = ((intBits >> 8) & 0xff) / 255.0
        data.a = (intBits & 0xff) / 255.0
    }
}

class Kernel {
    static concentric(numRings, numPoints) {
        const kernel = []
        kernel.push(0, 0)
        const spacing = (2 * Math.PI) / numRings / numPoints
        for (let ring = 1; ring <= numRings; ring++) {
            const radius = ring / numRings
            const circumference = 2 * Math.PI * radius
            const pointsPerRing = Math.max(1, Math.floor(circumference / spacing))
            const angleStep = (2 * Math.PI) / pointsPerRing
            for (let point = 0; point < pointsPerRing; point++) {
                const angle = point * angleStep
                const x = radius * Math.cos(angle)
                const y = radius * Math.sin(angle)
                kernel.push(x, y)
            }
        }
        return kernel
    }
}

class Vec3 {
    add(rhs) {
        this.x += rhs.x
        this.y += rhs.y
        this.z += rhs.z
        return this
    }
    add2(lhs, rhs) {
        this.x = lhs.x + rhs.x
        this.y = lhs.y + rhs.y
        this.z = lhs.z + rhs.z
        return this
    }
    addScalar(scalar) {
        this.x += scalar
        this.y += scalar
        this.z += scalar
        return this
    }
    addScaled(rhs, scalar) {
        this.x += rhs.x * scalar
        this.y += rhs.y * scalar
        this.z += rhs.z * scalar
        return this
    }
    clone() {
        const cstr = this.constructor
        return new cstr(this.x, this.y, this.z)
    }
    copy(rhs) {
        this.x = rhs.x
        this.y = rhs.y
        this.z = rhs.z
        return this
    }
    cross(lhs, rhs) {
        const lx = lhs.x
        const ly = lhs.y
        const lz = lhs.z
        const rx = rhs.x
        const ry = rhs.y
        const rz = rhs.z
        this.x = ly * rz - ry * lz
        this.y = lz * rx - rz * lx
        this.z = lx * ry - rx * ly
        return this
    }
    distance(rhs) {
        const x = this.x - rhs.x
        const y = this.y - rhs.y
        const z = this.z - rhs.z
        return Math.sqrt(x * x + y * y + z * z)
    }
    div(rhs) {
        this.x /= rhs.x
        this.y /= rhs.y
        this.z /= rhs.z
        return this
    }
    div2(lhs, rhs) {
        this.x = lhs.x / rhs.x
        this.y = lhs.y / rhs.y
        this.z = lhs.z / rhs.z
        return this
    }
    divScalar(scalar) {
        this.x /= scalar
        this.y /= scalar
        this.z /= scalar
        return this
    }
    dot(rhs) {
        return this.x * rhs.x + this.y * rhs.y + this.z * rhs.z
    }
    equals(rhs) {
        return this.x === rhs.x && this.y === rhs.y && this.z === rhs.z
    }
    equalsApprox(rhs, epsilon = 1e-6) {
        return (
            Math.abs(this.x - rhs.x) < epsilon &&
            Math.abs(this.y - rhs.y) < epsilon &&
            Math.abs(this.z - rhs.z) < epsilon
        )
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z)
    }
    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z
    }
    lerp(lhs, rhs, alpha) {
        this.x = lhs.x + alpha * (rhs.x - lhs.x)
        this.y = lhs.y + alpha * (rhs.y - lhs.y)
        this.z = lhs.z + alpha * (rhs.z - lhs.z)
        return this
    }
    mul(rhs) {
        this.x *= rhs.x
        this.y *= rhs.y
        this.z *= rhs.z
        return this
    }
    mul2(lhs, rhs) {
        this.x = lhs.x * rhs.x
        this.y = lhs.y * rhs.y
        this.z = lhs.z * rhs.z
        return this
    }
    mulScalar(scalar) {
        this.x *= scalar
        this.y *= scalar
        this.z *= scalar
        return this
    }
    normalize(src = this) {
        const lengthSq = src.x * src.x + src.y * src.y + src.z * src.z
        if (lengthSq > 0) {
            const invLength = 1 / Math.sqrt(lengthSq)
            this.x = src.x * invLength
            this.y = src.y * invLength
            this.z = src.z * invLength
        }
        return this
    }
    floor(src = this) {
        this.x = Math.floor(src.x)
        this.y = Math.floor(src.y)
        this.z = Math.floor(src.z)
        return this
    }
    ceil(src = this) {
        this.x = Math.ceil(src.x)
        this.y = Math.ceil(src.y)
        this.z = Math.ceil(src.z)
        return this
    }
    round(src = this) {
        this.x = Math.round(src.x)
        this.y = Math.round(src.y)
        this.z = Math.round(src.z)
        return this
    }
    min(rhs) {
        if (rhs.x < this.x) this.x = rhs.x
        if (rhs.y < this.y) this.y = rhs.y
        if (rhs.z < this.z) this.z = rhs.z
        return this
    }
    max(rhs) {
        if (rhs.x > this.x) this.x = rhs.x
        if (rhs.y > this.y) this.y = rhs.y
        if (rhs.z > this.z) this.z = rhs.z
        return this
    }
    project(rhs) {
        const a_dot_b = this.x * rhs.x + this.y * rhs.y + this.z * rhs.z
        const b_dot_b = rhs.x * rhs.x + rhs.y * rhs.y + rhs.z * rhs.z
        const s = a_dot_b / b_dot_b
        this.x = rhs.x * s
        this.y = rhs.y * s
        this.z = rhs.z * s
        return this
    }
    set(x, y, z) {
        this.x = x
        this.y = y
        this.z = z
        return this
    }
    sub(rhs) {
        this.x -= rhs.x
        this.y -= rhs.y
        this.z -= rhs.z
        return this
    }
    sub2(lhs, rhs) {
        this.x = lhs.x - rhs.x
        this.y = lhs.y - rhs.y
        this.z = lhs.z - rhs.z
        return this
    }
    subScalar(scalar) {
        this.x -= scalar
        this.y -= scalar
        this.z -= scalar
        return this
    }
    fromArray(arr, offset = 0) {
        this.x = arr[offset] ?? this.x
        this.y = arr[offset + 1] ?? this.y
        this.z = arr[offset + 2] ?? this.z
        return this
    }
    toString() {
        return `[${this.x}, ${this.y}, ${this.z}]`
    }
    toArray(arr = [], offset = 0) {
        arr[offset] = this.x
        arr[offset + 1] = this.y
        arr[offset + 2] = this.z
        return arr
    }
    constructor(x = 0, y = 0, z = 0) {
        if (x.length === 3) {
            this.x = x[0]
            this.y = x[1]
            this.z = x[2]
        } else {
            this.x = x
            this.y = y
            this.z = z
        }
    }
}
Vec3.ZERO = Object.freeze(new Vec3(0, 0, 0))
Vec3.HALF = Object.freeze(new Vec3(0.5, 0.5, 0.5))
Vec3.ONE = Object.freeze(new Vec3(1, 1, 1))
Vec3.UP = Object.freeze(new Vec3(0, 1, 0))
Vec3.DOWN = Object.freeze(new Vec3(0, -1, 0))
Vec3.RIGHT = Object.freeze(new Vec3(1, 0, 0))
Vec3.LEFT = Object.freeze(new Vec3(-1, 0, 0))
Vec3.FORWARD = Object.freeze(new Vec3(0, 0, -1))
Vec3.BACK = Object.freeze(new Vec3(0, 0, 1))

class Mat3 {
    clone() {
        const cstr = this.constructor
        return new cstr().copy(this)
    }
    copy(rhs) {
        const src = rhs.data
        const dst = this.data
        dst[0] = src[0]
        dst[1] = src[1]
        dst[2] = src[2]
        dst[3] = src[3]
        dst[4] = src[4]
        dst[5] = src[5]
        dst[6] = src[6]
        dst[7] = src[7]
        dst[8] = src[8]
        return this
    }
    set(src) {
        const dst = this.data
        dst[0] = src[0]
        dst[1] = src[1]
        dst[2] = src[2]
        dst[3] = src[3]
        dst[4] = src[4]
        dst[5] = src[5]
        dst[6] = src[6]
        dst[7] = src[7]
        dst[8] = src[8]
        return this
    }
    getX(x = new Vec3()) {
        return x.set(this.data[0], this.data[1], this.data[2])
    }
    getY(y = new Vec3()) {
        return y.set(this.data[3], this.data[4], this.data[5])
    }
    getZ(z = new Vec3()) {
        return z.set(this.data[6], this.data[7], this.data[8])
    }
    equals(rhs) {
        const l = this.data
        const r = rhs.data
        return (
            l[0] === r[0] &&
            l[1] === r[1] &&
            l[2] === r[2] &&
            l[3] === r[3] &&
            l[4] === r[4] &&
            l[5] === r[5] &&
            l[6] === r[6] &&
            l[7] === r[7] &&
            l[8] === r[8]
        )
    }
    isIdentity() {
        const m = this.data
        return (
            m[0] === 1 &&
            m[1] === 0 &&
            m[2] === 0 &&
            m[3] === 0 &&
            m[4] === 1 &&
            m[5] === 0 &&
            m[6] === 0 &&
            m[7] === 0 &&
            m[8] === 1
        )
    }
    setIdentity() {
        const m = this.data
        m[0] = 1
        m[1] = 0
        m[2] = 0
        m[3] = 0
        m[4] = 1
        m[5] = 0
        m[6] = 0
        m[7] = 0
        m[8] = 1
        return this
    }
    toString() {
        return `[${this.data.join(', ')}]`
    }
    transpose(src = this) {
        const s = src.data
        const t = this.data
        if (s === t) {
            let tmp
            tmp = s[1]
            t[1] = s[3]
            t[3] = tmp
            tmp = s[2]
            t[2] = s[6]
            t[6] = tmp
            tmp = s[5]
            t[5] = s[7]
            t[7] = tmp
        } else {
            t[0] = s[0]
            t[1] = s[3]
            t[2] = s[6]
            t[3] = s[1]
            t[4] = s[4]
            t[5] = s[7]
            t[6] = s[2]
            t[7] = s[5]
            t[8] = s[8]
        }
        return this
    }
    setFromMat4(m) {
        const src = m.data
        const dst = this.data
        dst[0] = src[0]
        dst[1] = src[1]
        dst[2] = src[2]
        dst[3] = src[4]
        dst[4] = src[5]
        dst[5] = src[6]
        dst[6] = src[8]
        dst[7] = src[9]
        dst[8] = src[10]
        return this
    }
    setFromQuat(r) {
        const qx = r.x
        const qy = r.y
        const qz = r.z
        const qw = r.w
        const x2 = qx + qx
        const y2 = qy + qy
        const z2 = qz + qz
        const xx = qx * x2
        const xy = qx * y2
        const xz = qx * z2
        const yy = qy * y2
        const yz = qy * z2
        const zz = qz * z2
        const wx = qw * x2
        const wy = qw * y2
        const wz = qw * z2
        const m = this.data
        m[0] = 1 - (yy + zz)
        m[1] = xy + wz
        m[2] = xz - wy
        m[3] = xy - wz
        m[4] = 1 - (xx + zz)
        m[5] = yz + wx
        m[6] = xz + wy
        m[7] = yz - wx
        m[8] = 1 - (xx + yy)
        return this
    }
    invertMat4(src) {
        const s = src.data
        const a0 = s[0]
        const a1 = s[1]
        const a2 = s[2]
        const a4 = s[4]
        const a5 = s[5]
        const a6 = s[6]
        const a8 = s[8]
        const a9 = s[9]
        const a10 = s[10]
        const b11 = a10 * a5 - a6 * a9
        const b21 = -a10 * a1 + a2 * a9
        const b31 = a6 * a1 - a2 * a5
        const b12 = -a10 * a4 + a6 * a8
        const b22 = a10 * a0 - a2 * a8
        const b32 = -a6 * a0 + a2 * a4
        const b13 = a9 * a4 - a5 * a8
        const b23 = -a9 * a0 + a1 * a8
        const b33 = a5 * a0 - a1 * a4
        const det = a0 * b11 + a1 * b12 + a2 * b13
        if (det === 0) {
            this.setIdentity()
        } else {
            const invDet = 1 / det
            const t = this.data
            t[0] = b11 * invDet
            t[1] = b21 * invDet
            t[2] = b31 * invDet
            t[3] = b12 * invDet
            t[4] = b22 * invDet
            t[5] = b32 * invDet
            t[6] = b13 * invDet
            t[7] = b23 * invDet
            t[8] = b33 * invDet
        }
        return this
    }
    transformVector(vec, res = new Vec3()) {
        const m = this.data
        const { x, y, z } = vec
        res.x = x * m[0] + y * m[3] + z * m[6]
        res.y = x * m[1] + y * m[4] + z * m[7]
        res.z = x * m[2] + y * m[5] + z * m[8]
        return res
    }
    constructor() {
        this.data = new Float32Array(9)
        this.data[0] = this.data[4] = this.data[8] = 1
    }
}
Mat3.IDENTITY = Object.freeze(new Mat3())
Mat3.ZERO = Object.freeze(new Mat3().set([0, 0, 0, 0, 0, 0, 0, 0, 0]))

class Vec2 {
    add(rhs) {
        this.x += rhs.x
        this.y += rhs.y
        return this
    }
    add2(lhs, rhs) {
        this.x = lhs.x + rhs.x
        this.y = lhs.y + rhs.y
        return this
    }
    addScalar(scalar) {
        this.x += scalar
        this.y += scalar
        return this
    }
    addScaled(rhs, scalar) {
        this.x += rhs.x * scalar
        this.y += rhs.y * scalar
        return this
    }
    clone() {
        const cstr = this.constructor
        return new cstr(this.x, this.y)
    }
    copy(rhs) {
        this.x = rhs.x
        this.y = rhs.y
        return this
    }
    cross(rhs) {
        return this.x * rhs.y - this.y * rhs.x
    }
    distance(rhs) {
        const x = this.x - rhs.x
        const y = this.y - rhs.y
        return Math.sqrt(x * x + y * y)
    }
    div(rhs) {
        this.x /= rhs.x
        this.y /= rhs.y
        return this
    }
    div2(lhs, rhs) {
        this.x = lhs.x / rhs.x
        this.y = lhs.y / rhs.y
        return this
    }
    divScalar(scalar) {
        this.x /= scalar
        this.y /= scalar
        return this
    }
    dot(rhs) {
        return this.x * rhs.x + this.y * rhs.y
    }
    equals(rhs) {
        return this.x === rhs.x && this.y === rhs.y
    }
    equalsApprox(rhs, epsilon = 1e-6) {
        return Math.abs(this.x - rhs.x) < epsilon && Math.abs(this.y - rhs.y) < epsilon
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y)
    }
    lengthSq() {
        return this.x * this.x + this.y * this.y
    }
    lerp(lhs, rhs, alpha) {
        this.x = lhs.x + alpha * (rhs.x - lhs.x)
        this.y = lhs.y + alpha * (rhs.y - lhs.y)
        return this
    }
    mul(rhs) {
        this.x *= rhs.x
        this.y *= rhs.y
        return this
    }
    mul2(lhs, rhs) {
        this.x = lhs.x * rhs.x
        this.y = lhs.y * rhs.y
        return this
    }
    mulScalar(scalar) {
        this.x *= scalar
        this.y *= scalar
        return this
    }
    normalize(src = this) {
        const lengthSq = src.x * src.x + src.y * src.y
        if (lengthSq > 0) {
            const invLength = 1 / Math.sqrt(lengthSq)
            this.x = src.x * invLength
            this.y = src.y * invLength
        }
        return this
    }
    rotate(degrees) {
        const angle = Math.atan2(this.x, this.y) + degrees * math.DEG_TO_RAD
        const len = Math.sqrt(this.x * this.x + this.y * this.y)
        this.x = Math.sin(angle) * len
        this.y = Math.cos(angle) * len
        return this
    }
    angle() {
        return Math.atan2(this.x, this.y) * math.RAD_TO_DEG
    }
    angleTo(rhs) {
        return Math.atan2(this.x * rhs.y + this.y * rhs.x, this.x * rhs.x + this.y * rhs.y) * math.RAD_TO_DEG
    }
    floor(src = this) {
        this.x = Math.floor(src.x)
        this.y = Math.floor(src.y)
        return this
    }
    ceil(src = this) {
        this.x = Math.ceil(src.x)
        this.y = Math.ceil(src.y)
        return this
    }
    round(src = this) {
        this.x = Math.round(src.x)
        this.y = Math.round(src.y)
        return this
    }
    min(rhs) {
        if (rhs.x < this.x) this.x = rhs.x
        if (rhs.y < this.y) this.y = rhs.y
        return this
    }
    max(rhs) {
        if (rhs.x > this.x) this.x = rhs.x
        if (rhs.y > this.y) this.y = rhs.y
        return this
    }
    set(x, y) {
        this.x = x
        this.y = y
        return this
    }
    sub(rhs) {
        this.x -= rhs.x
        this.y -= rhs.y
        return this
    }
    sub2(lhs, rhs) {
        this.x = lhs.x - rhs.x
        this.y = lhs.y - rhs.y
        return this
    }
    subScalar(scalar) {
        this.x -= scalar
        this.y -= scalar
        return this
    }
    fromArray(arr, offset = 0) {
        this.x = arr[offset] ?? this.x
        this.y = arr[offset + 1] ?? this.y
        return this
    }
    toString() {
        return `[${this.x}, ${this.y}]`
    }
    toArray(arr = [], offset = 0) {
        arr[offset] = this.x
        arr[offset + 1] = this.y
        return arr
    }
    static angleRad(lhs, rhs) {
        return Math.atan2(lhs.x * rhs.y - lhs.y * rhs.x, lhs.x * rhs.x + lhs.y * rhs.y)
    }
    constructor(x = 0, y = 0) {
        if (x.length === 2) {
            this.x = x[0]
            this.y = x[1]
        } else {
            this.x = x
            this.y = y
        }
    }
}
Vec2.ZERO = Object.freeze(new Vec2(0, 0))
Vec2.HALF = Object.freeze(new Vec2(0.5, 0.5))
Vec2.ONE = Object.freeze(new Vec2(1, 1))
Vec2.UP = Object.freeze(new Vec2(0, 1))
Vec2.DOWN = Object.freeze(new Vec2(0, -1))
Vec2.RIGHT = Object.freeze(new Vec2(1, 0))
Vec2.LEFT = Object.freeze(new Vec2(-1, 0))
class Vec4 {
    add(rhs) {
        this.x += rhs.x
        this.y += rhs.y
        this.z += rhs.z
        this.w += rhs.w
        return this
    }
    add2(lhs, rhs) {
        this.x = lhs.x + rhs.x
        this.y = lhs.y + rhs.y
        this.z = lhs.z + rhs.z
        this.w = lhs.w + rhs.w
        return this
    }
    addScalar(scalar) {
        this.x += scalar
        this.y += scalar
        this.z += scalar
        this.w += scalar
        return this
    }
    addScaled(rhs, scalar) {
        this.x += rhs.x * scalar
        this.y += rhs.y * scalar
        this.z += rhs.z * scalar
        this.w += rhs.w * scalar
        return this
    }
    clone() {
        const cstr = this.constructor
        return new cstr(this.x, this.y, this.z, this.w)
    }
    copy(rhs) {
        this.x = rhs.x
        this.y = rhs.y
        this.z = rhs.z
        this.w = rhs.w
        return this
    }
    div(rhs) {
        this.x /= rhs.x
        this.y /= rhs.y
        this.z /= rhs.z
        this.w /= rhs.w
        return this
    }
    div2(lhs, rhs) {
        this.x = lhs.x / rhs.x
        this.y = lhs.y / rhs.y
        this.z = lhs.z / rhs.z
        this.w = lhs.w / rhs.w
        return this
    }
    divScalar(scalar) {
        this.x /= scalar
        this.y /= scalar
        this.z /= scalar
        this.w /= scalar
        return this
    }
    dot(rhs) {
        return this.x * rhs.x + this.y * rhs.y + this.z * rhs.z + this.w * rhs.w
    }
    equals(rhs) {
        return this.x === rhs.x && this.y === rhs.y && this.z === rhs.z && this.w === rhs.w
    }
    equalsApprox(rhs, epsilon = 1e-6) {
        return (
            Math.abs(this.x - rhs.x) < epsilon &&
            Math.abs(this.y - rhs.y) < epsilon &&
            Math.abs(this.z - rhs.z) < epsilon &&
            Math.abs(this.w - rhs.w) < epsilon
        )
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w)
    }
    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    }
    lerp(lhs, rhs, alpha) {
        this.x = lhs.x + alpha * (rhs.x - lhs.x)
        this.y = lhs.y + alpha * (rhs.y - lhs.y)
        this.z = lhs.z + alpha * (rhs.z - lhs.z)
        this.w = lhs.w + alpha * (rhs.w - lhs.w)
        return this
    }
    mul(rhs) {
        this.x *= rhs.x
        this.y *= rhs.y
        this.z *= rhs.z
        this.w *= rhs.w
        return this
    }
    mul2(lhs, rhs) {
        this.x = lhs.x * rhs.x
        this.y = lhs.y * rhs.y
        this.z = lhs.z * rhs.z
        this.w = lhs.w * rhs.w
        return this
    }
    mulScalar(scalar) {
        this.x *= scalar
        this.y *= scalar
        this.z *= scalar
        this.w *= scalar
        return this
    }
    normalize(src = this) {
        const lengthSq = src.x * src.x + src.y * src.y + src.z * src.z + src.w * src.w
        if (lengthSq > 0) {
            const invLength = 1 / Math.sqrt(lengthSq)
            this.x = src.x * invLength
            this.y = src.y * invLength
            this.z = src.z * invLength
            this.w = src.w * invLength
        }
        return this
    }
    floor(src = this) {
        this.x = Math.floor(src.x)
        this.y = Math.floor(src.y)
        this.z = Math.floor(src.z)
        this.w = Math.floor(src.w)
        return this
    }
    ceil(src = this) {
        this.x = Math.ceil(src.x)
        this.y = Math.ceil(src.y)
        this.z = Math.ceil(src.z)
        this.w = Math.ceil(src.w)
        return this
    }
    round(src = this) {
        this.x = Math.round(src.x)
        this.y = Math.round(src.y)
        this.z = Math.round(src.z)
        this.w = Math.round(src.w)
        return this
    }
    min(rhs) {
        if (rhs.x < this.x) this.x = rhs.x
        if (rhs.y < this.y) this.y = rhs.y
        if (rhs.z < this.z) this.z = rhs.z
        if (rhs.w < this.w) this.w = rhs.w
        return this
    }
    max(rhs) {
        if (rhs.x > this.x) this.x = rhs.x
        if (rhs.y > this.y) this.y = rhs.y
        if (rhs.z > this.z) this.z = rhs.z
        if (rhs.w > this.w) this.w = rhs.w
        return this
    }
    set(x, y, z, w) {
        this.x = x
        this.y = y
        this.z = z
        this.w = w
        return this
    }
    sub(rhs) {
        this.x -= rhs.x
        this.y -= rhs.y
        this.z -= rhs.z
        this.w -= rhs.w
        return this
    }
    sub2(lhs, rhs) {
        this.x = lhs.x - rhs.x
        this.y = lhs.y - rhs.y
        this.z = lhs.z - rhs.z
        this.w = lhs.w - rhs.w
        return this
    }
    subScalar(scalar) {
        this.x -= scalar
        this.y -= scalar
        this.z -= scalar
        this.w -= scalar
        return this
    }
    fromArray(arr, offset = 0) {
        this.x = arr[offset] ?? this.x
        this.y = arr[offset + 1] ?? this.y
        this.z = arr[offset + 2] ?? this.z
        this.w = arr[offset + 3] ?? this.w
        return this
    }
    toString() {
        return `[${this.x}, ${this.y}, ${this.z}, ${this.w}]`
    }
    toArray(arr = [], offset = 0) {
        arr[offset] = this.x
        arr[offset + 1] = this.y
        arr[offset + 2] = this.z
        arr[offset + 3] = this.w
        return arr
    }
    constructor(x = 0, y = 0, z = 0, w = 0) {
        if (x.length === 4) {
            this.x = x[0]
            this.y = x[1]
            this.z = x[2]
            this.w = x[3]
        } else {
            this.x = x
            this.y = y
            this.z = z
            this.w = w
        }
    }
}
Vec4.ZERO = Object.freeze(new Vec4(0, 0, 0, 0))
Vec4.HALF = Object.freeze(new Vec4(0.5, 0.5, 0.5, 0.5))
Vec4.ONE = Object.freeze(new Vec4(1, 1, 1, 1))

const _halfSize$1 = new Vec2()
const x = new Vec3()
const y = new Vec3()
const z = new Vec3()
const scale = new Vec3()
class Mat4 {
    static _getPerspectiveHalfSize(halfSize, fov, aspect, znear, fovIsHorizontal) {
        if (fovIsHorizontal) {
            halfSize.x = znear * Math.tan((fov * Math.PI) / 360)
            halfSize.y = halfSize.x / aspect
        } else {
            halfSize.y = znear * Math.tan((fov * Math.PI) / 360)
            halfSize.x = halfSize.y * aspect
        }
    }
    add2(lhs, rhs) {
        const a = lhs.data,
            b = rhs.data,
            r = this.data
        r[0] = a[0] + b[0]
        r[1] = a[1] + b[1]
        r[2] = a[2] + b[2]
        r[3] = a[3] + b[3]
        r[4] = a[4] + b[4]
        r[5] = a[5] + b[5]
        r[6] = a[6] + b[6]
        r[7] = a[7] + b[7]
        r[8] = a[8] + b[8]
        r[9] = a[9] + b[9]
        r[10] = a[10] + b[10]
        r[11] = a[11] + b[11]
        r[12] = a[12] + b[12]
        r[13] = a[13] + b[13]
        r[14] = a[14] + b[14]
        r[15] = a[15] + b[15]
        return this
    }
    add(rhs) {
        return this.add2(this, rhs)
    }
    clone() {
        const cstr = this.constructor
        return new cstr().copy(this)
    }
    copy(rhs) {
        const src = rhs.data,
            dst = this.data
        dst[0] = src[0]
        dst[1] = src[1]
        dst[2] = src[2]
        dst[3] = src[3]
        dst[4] = src[4]
        dst[5] = src[5]
        dst[6] = src[6]
        dst[7] = src[7]
        dst[8] = src[8]
        dst[9] = src[9]
        dst[10] = src[10]
        dst[11] = src[11]
        dst[12] = src[12]
        dst[13] = src[13]
        dst[14] = src[14]
        dst[15] = src[15]
        return this
    }
    equals(rhs) {
        const l = this.data,
            r = rhs.data
        return (
            l[0] === r[0] &&
            l[1] === r[1] &&
            l[2] === r[2] &&
            l[3] === r[3] &&
            l[4] === r[4] &&
            l[5] === r[5] &&
            l[6] === r[6] &&
            l[7] === r[7] &&
            l[8] === r[8] &&
            l[9] === r[9] &&
            l[10] === r[10] &&
            l[11] === r[11] &&
            l[12] === r[12] &&
            l[13] === r[13] &&
            l[14] === r[14] &&
            l[15] === r[15]
        )
    }
    isIdentity() {
        const m = this.data
        return (
            m[0] === 1 &&
            m[1] === 0 &&
            m[2] === 0 &&
            m[3] === 0 &&
            m[4] === 0 &&
            m[5] === 1 &&
            m[6] === 0 &&
            m[7] === 0 &&
            m[8] === 0 &&
            m[9] === 0 &&
            m[10] === 1 &&
            m[11] === 0 &&
            m[12] === 0 &&
            m[13] === 0 &&
            m[14] === 0 &&
            m[15] === 1
        )
    }
    mul2(lhs, rhs) {
        const a = lhs.data
        const b = rhs.data
        const r = this.data
        const a00 = a[0]
        const a01 = a[1]
        const a02 = a[2]
        const a03 = a[3]
        const a10 = a[4]
        const a11 = a[5]
        const a12 = a[6]
        const a13 = a[7]
        const a20 = a[8]
        const a21 = a[9]
        const a22 = a[10]
        const a23 = a[11]
        const a30 = a[12]
        const a31 = a[13]
        const a32 = a[14]
        const a33 = a[15]
        let b0, b1, b2, b3
        b0 = b[0]
        b1 = b[1]
        b2 = b[2]
        b3 = b[3]
        r[0] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3
        r[1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3
        r[2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3
        r[3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3
        b0 = b[4]
        b1 = b[5]
        b2 = b[6]
        b3 = b[7]
        r[4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3
        r[5] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3
        r[6] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3
        r[7] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3
        b0 = b[8]
        b1 = b[9]
        b2 = b[10]
        b3 = b[11]
        r[8] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3
        r[9] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3
        r[10] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3
        r[11] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3
        b0 = b[12]
        b1 = b[13]
        b2 = b[14]
        b3 = b[15]
        r[12] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3
        r[13] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3
        r[14] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3
        r[15] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3
        return this
    }
    mulAffine2(lhs, rhs) {
        const a = lhs.data
        const b = rhs.data
        const r = this.data
        const a00 = a[0]
        const a01 = a[1]
        const a02 = a[2]
        const a10 = a[4]
        const a11 = a[5]
        const a12 = a[6]
        const a20 = a[8]
        const a21 = a[9]
        const a22 = a[10]
        const a30 = a[12]
        const a31 = a[13]
        const a32 = a[14]
        let b0, b1, b2
        b0 = b[0]
        b1 = b[1]
        b2 = b[2]
        r[0] = a00 * b0 + a10 * b1 + a20 * b2
        r[1] = a01 * b0 + a11 * b1 + a21 * b2
        r[2] = a02 * b0 + a12 * b1 + a22 * b2
        r[3] = 0
        b0 = b[4]
        b1 = b[5]
        b2 = b[6]
        r[4] = a00 * b0 + a10 * b1 + a20 * b2
        r[5] = a01 * b0 + a11 * b1 + a21 * b2
        r[6] = a02 * b0 + a12 * b1 + a22 * b2
        r[7] = 0
        b0 = b[8]
        b1 = b[9]
        b2 = b[10]
        r[8] = a00 * b0 + a10 * b1 + a20 * b2
        r[9] = a01 * b0 + a11 * b1 + a21 * b2
        r[10] = a02 * b0 + a12 * b1 + a22 * b2
        r[11] = 0
        b0 = b[12]
        b1 = b[13]
        b2 = b[14]
        r[12] = a00 * b0 + a10 * b1 + a20 * b2 + a30
        r[13] = a01 * b0 + a11 * b1 + a21 * b2 + a31
        r[14] = a02 * b0 + a12 * b1 + a22 * b2 + a32
        r[15] = 1
        return this
    }
    mul(rhs) {
        return this.mul2(this, rhs)
    }
    transformPoint(vec, res = new Vec3()) {
        const m = this.data
        const { x, y, z } = vec
        res.x = x * m[0] + y * m[4] + z * m[8] + m[12]
        res.y = x * m[1] + y * m[5] + z * m[9] + m[13]
        res.z = x * m[2] + y * m[6] + z * m[10] + m[14]
        return res
    }
    transformVector(vec, res = new Vec3()) {
        const m = this.data
        const { x, y, z } = vec
        res.x = x * m[0] + y * m[4] + z * m[8]
        res.y = x * m[1] + y * m[5] + z * m[9]
        res.z = x * m[2] + y * m[6] + z * m[10]
        return res
    }
    transformVec4(vec, res = new Vec4()) {
        const m = this.data
        const { x, y, z, w } = vec
        res.x = x * m[0] + y * m[4] + z * m[8] + w * m[12]
        res.y = x * m[1] + y * m[5] + z * m[9] + w * m[13]
        res.z = x * m[2] + y * m[6] + z * m[10] + w * m[14]
        res.w = x * m[3] + y * m[7] + z * m[11] + w * m[15]
        return res
    }
    setLookAt(position, target, up) {
        z.sub2(position, target).normalize()
        y.copy(up).normalize()
        x.cross(y, z).normalize()
        y.cross(z, x)
        const r = this.data
        r[0] = x.x
        r[1] = x.y
        r[2] = x.z
        r[3] = 0
        r[4] = y.x
        r[5] = y.y
        r[6] = y.z
        r[7] = 0
        r[8] = z.x
        r[9] = z.y
        r[10] = z.z
        r[11] = 0
        r[12] = position.x
        r[13] = position.y
        r[14] = position.z
        r[15] = 1
        return this
    }
    setFrustum(left, right, bottom, top, znear, zfar) {
        const temp1 = 2 * znear
        const temp2 = right - left
        const temp3 = top - bottom
        const temp4 = zfar - znear
        const r = this.data
        r[0] = temp1 / temp2
        r[1] = 0
        r[2] = 0
        r[3] = 0
        r[4] = 0
        r[5] = temp1 / temp3
        r[6] = 0
        r[7] = 0
        r[8] = (right + left) / temp2
        r[9] = (top + bottom) / temp3
        r[10] = (-zfar - znear) / temp4
        r[11] = -1
        r[12] = 0
        r[13] = 0
        r[14] = (-temp1 * zfar) / temp4
        r[15] = 0
        return this
    }
    setPerspective(fov, aspect, znear, zfar, fovIsHorizontal) {
        Mat4._getPerspectiveHalfSize(_halfSize$1, fov, aspect, znear, fovIsHorizontal)
        return this.setFrustum(-_halfSize$1.x, _halfSize$1.x, -_halfSize$1.y, _halfSize$1.y, znear, zfar)
    }
    setOrtho(left, right, bottom, top, near, far) {
        const r = this.data
        r[0] = 2 / (right - left)
        r[1] = 0
        r[2] = 0
        r[3] = 0
        r[4] = 0
        r[5] = 2 / (top - bottom)
        r[6] = 0
        r[7] = 0
        r[8] = 0
        r[9] = 0
        r[10] = -2 / (far - near)
        r[11] = 0
        r[12] = -(right + left) / (right - left)
        r[13] = -(top + bottom) / (top - bottom)
        r[14] = -(far + near) / (far - near)
        r[15] = 1
        return this
    }
    setFromAxisAngle(axis, angle) {
        angle *= math.DEG_TO_RAD
        const { x, y, z } = axis
        const c = Math.cos(angle)
        const s = Math.sin(angle)
        const t = 1 - c
        const tx = t * x
        const ty = t * y
        const m = this.data
        m[0] = tx * x + c
        m[1] = tx * y + s * z
        m[2] = tx * z - s * y
        m[3] = 0
        m[4] = tx * y - s * z
        m[5] = ty * y + c
        m[6] = ty * z + s * x
        m[7] = 0
        m[8] = tx * z + s * y
        m[9] = ty * z - x * s
        m[10] = t * z * z + c
        m[11] = 0
        m[12] = 0
        m[13] = 0
        m[14] = 0
        m[15] = 1
        return this
    }
    setTranslate(x, y, z) {
        const m = this.data
        m[0] = 1
        m[1] = 0
        m[2] = 0
        m[3] = 0
        m[4] = 0
        m[5] = 1
        m[6] = 0
        m[7] = 0
        m[8] = 0
        m[9] = 0
        m[10] = 1
        m[11] = 0
        m[12] = x
        m[13] = y
        m[14] = z
        m[15] = 1
        return this
    }
    setScale(x, y, z) {
        const m = this.data
        m[0] = x
        m[1] = 0
        m[2] = 0
        m[3] = 0
        m[4] = 0
        m[5] = y
        m[6] = 0
        m[7] = 0
        m[8] = 0
        m[9] = 0
        m[10] = z
        m[11] = 0
        m[12] = 0
        m[13] = 0
        m[14] = 0
        m[15] = 1
        return this
    }
    setViewport(x, y, width, height) {
        const m = this.data
        m[0] = width * 0.5
        m[1] = 0
        m[2] = 0
        m[3] = 0
        m[4] = 0
        m[5] = height * 0.5
        m[6] = 0
        m[7] = 0
        m[8] = 0
        m[9] = 0
        m[10] = 0.5
        m[11] = 0
        m[12] = x + width * 0.5
        m[13] = y + height * 0.5
        m[14] = 0.5
        m[15] = 1
        return this
    }
    setReflection(normal, distance) {
        const a = normal.x
        const b = normal.y
        const c = normal.z
        const data = this.data
        data[0] = 1.0 - 2 * a * a
        data[1] = -2 * a * b
        data[2] = -2 * a * c
        data[3] = 0
        data[4] = -2 * a * b
        data[5] = 1.0 - 2 * b * b
        data[6] = -2 * b * c
        data[7] = 0
        data[8] = -2 * a * c
        data[9] = -2 * b * c
        data[10] = 1.0 - 2 * c * c
        data[11] = 0
        data[12] = -2 * a * distance
        data[13] = -2 * b * distance
        data[14] = -2 * c * distance
        data[15] = 1
        return this
    }
    invert(src = this) {
        const s = src.data
        const a00 = s[0]
        const a01 = s[1]
        const a02 = s[2]
        const a03 = s[3]
        const a10 = s[4]
        const a11 = s[5]
        const a12 = s[6]
        const a13 = s[7]
        const a20 = s[8]
        const a21 = s[9]
        const a22 = s[10]
        const a23 = s[11]
        const a30 = s[12]
        const a31 = s[13]
        const a32 = s[14]
        const a33 = s[15]
        const b00 = a00 * a11 - a01 * a10
        const b01 = a00 * a12 - a02 * a10
        const b02 = a00 * a13 - a03 * a10
        const b03 = a01 * a12 - a02 * a11
        const b04 = a01 * a13 - a03 * a11
        const b05 = a02 * a13 - a03 * a12
        const b06 = a20 * a31 - a21 * a30
        const b07 = a20 * a32 - a22 * a30
        const b08 = a20 * a33 - a23 * a30
        const b09 = a21 * a32 - a22 * a31
        const b10 = a21 * a33 - a23 * a31
        const b11 = a22 * a33 - a23 * a32
        const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
        if (det === 0) {
            this.setIdentity()
        } else {
            const invDet = 1 / det
            const t = this.data
            t[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet
            t[1] = (-a01 * b11 + a02 * b10 - a03 * b09) * invDet
            t[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet
            t[3] = (-a21 * b05 + a22 * b04 - a23 * b03) * invDet
            t[4] = (-a10 * b11 + a12 * b08 - a13 * b07) * invDet
            t[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet
            t[6] = (-a30 * b05 + a32 * b02 - a33 * b01) * invDet
            t[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet
            t[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet
            t[9] = (-a00 * b10 + a01 * b08 - a03 * b06) * invDet
            t[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet
            t[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * invDet
            t[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * invDet
            t[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet
            t[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * invDet
            t[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet
        }
        return this
    }
    set(src) {
        const dst = this.data
        dst[0] = src[0]
        dst[1] = src[1]
        dst[2] = src[2]
        dst[3] = src[3]
        dst[4] = src[4]
        dst[5] = src[5]
        dst[6] = src[6]
        dst[7] = src[7]
        dst[8] = src[8]
        dst[9] = src[9]
        dst[10] = src[10]
        dst[11] = src[11]
        dst[12] = src[12]
        dst[13] = src[13]
        dst[14] = src[14]
        dst[15] = src[15]
        return this
    }
    setIdentity() {
        const m = this.data
        m[0] = 1
        m[1] = 0
        m[2] = 0
        m[3] = 0
        m[4] = 0
        m[5] = 1
        m[6] = 0
        m[7] = 0
        m[8] = 0
        m[9] = 0
        m[10] = 1
        m[11] = 0
        m[12] = 0
        m[13] = 0
        m[14] = 0
        m[15] = 1
        return this
    }
    setTRS(t, r, s) {
        const qx = r.x
        const qy = r.y
        const qz = r.z
        const qw = r.w
        const sx = s.x
        const sy = s.y
        const sz = s.z
        const x2 = qx + qx
        const y2 = qy + qy
        const z2 = qz + qz
        const xx = qx * x2
        const xy = qx * y2
        const xz = qx * z2
        const yy = qy * y2
        const yz = qy * z2
        const zz = qz * z2
        const wx = qw * x2
        const wy = qw * y2
        const wz = qw * z2
        const m = this.data
        m[0] = (1 - (yy + zz)) * sx
        m[1] = (xy + wz) * sx
        m[2] = (xz - wy) * sx
        m[3] = 0
        m[4] = (xy - wz) * sy
        m[5] = (1 - (xx + zz)) * sy
        m[6] = (yz + wx) * sy
        m[7] = 0
        m[8] = (xz + wy) * sz
        m[9] = (yz - wx) * sz
        m[10] = (1 - (xx + yy)) * sz
        m[11] = 0
        m[12] = t.x
        m[13] = t.y
        m[14] = t.z
        m[15] = 1
        return this
    }
    transpose(src = this) {
        const s = src.data
        const t = this.data
        if (s === t) {
            let tmp
            tmp = s[1]
            t[1] = s[4]
            t[4] = tmp
            tmp = s[2]
            t[2] = s[8]
            t[8] = tmp
            tmp = s[3]
            t[3] = s[12]
            t[12] = tmp
            tmp = s[6]
            t[6] = s[9]
            t[9] = tmp
            tmp = s[7]
            t[7] = s[13]
            t[13] = tmp
            tmp = s[11]
            t[11] = s[14]
            t[14] = tmp
        } else {
            t[0] = s[0]
            t[1] = s[4]
            t[2] = s[8]
            t[3] = s[12]
            t[4] = s[1]
            t[5] = s[5]
            t[6] = s[9]
            t[7] = s[13]
            t[8] = s[2]
            t[9] = s[6]
            t[10] = s[10]
            t[11] = s[14]
            t[12] = s[3]
            t[13] = s[7]
            t[14] = s[11]
            t[15] = s[15]
        }
        return this
    }
    getTranslation(t = new Vec3()) {
        return t.set(this.data[12], this.data[13], this.data[14])
    }
    getX(x = new Vec3()) {
        return x.set(this.data[0], this.data[1], this.data[2])
    }
    getY(y = new Vec3()) {
        return y.set(this.data[4], this.data[5], this.data[6])
    }
    getZ(z = new Vec3()) {
        return z.set(this.data[8], this.data[9], this.data[10])
    }
    getScale(scale = new Vec3()) {
        this.getX(x)
        this.getY(y)
        this.getZ(z)
        scale.set(x.length(), y.length(), z.length())
        return scale
    }
    get scaleSign() {
        this.getX(x)
        this.getY(y)
        this.getZ(z)
        x.cross(x, y)
        return x.dot(z) < 0 ? -1 : 1
    }
    setFromEulerAngles(ex, ey, ez) {
        ex *= math.DEG_TO_RAD
        ey *= math.DEG_TO_RAD
        ez *= math.DEG_TO_RAD
        const s1 = Math.sin(-ex)
        const c1 = Math.cos(-ex)
        const s2 = Math.sin(-ey)
        const c2 = Math.cos(-ey)
        const s3 = Math.sin(-ez)
        const c3 = Math.cos(-ez)
        const m = this.data
        m[0] = c2 * c3
        m[1] = -c2 * s3
        m[2] = s2
        m[3] = 0
        m[4] = c1 * s3 + c3 * s1 * s2
        m[5] = c1 * c3 - s1 * s2 * s3
        m[6] = -c2 * s1
        m[7] = 0
        m[8] = s1 * s3 - c1 * c3 * s2
        m[9] = c3 * s1 + c1 * s2 * s3
        m[10] = c1 * c2
        m[11] = 0
        m[12] = 0
        m[13] = 0
        m[14] = 0
        m[15] = 1
        return this
    }
    getEulerAngles(eulers = new Vec3()) {
        this.getScale(scale)
        const sx = scale.x
        const sy = scale.y
        const sz = scale.z
        if (sx === 0 || sy === 0 || sz === 0) {
            return eulers.set(0, 0, 0)
        }
        const m = this.data
        const y = Math.asin(-m[2] / sx)
        const halfPi = Math.PI * 0.5
        let x, z
        if (y < halfPi) {
            if (y > -halfPi) {
                x = Math.atan2(m[6] / sy, m[10] / sz)
                z = Math.atan2(m[1] / sx, m[0] / sx)
            } else {
                z = 0
                x = -Math.atan2(m[4] / sy, m[5] / sy)
            }
        } else {
            z = 0
            x = Math.atan2(m[4] / sy, m[5] / sy)
        }
        return eulers.set(x, y, z).mulScalar(math.RAD_TO_DEG)
    }
    toString() {
        return `[${this.data.join(', ')}]`
    }
    constructor() {
        this.data = new Float32Array(16)
        this.data[0] = this.data[5] = this.data[10] = this.data[15] = 1
    }
}
Mat4.IDENTITY = Object.freeze(new Mat4())
Mat4.ZERO = Object.freeze(new Mat4().set([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))

class Quat {
    clone() {
        const cstr = this.constructor
        return new cstr(this.x, this.y, this.z, this.w)
    }
    conjugate(src = this) {
        this.x = src.x * -1
        this.y = src.y * -1
        this.z = src.z * -1
        this.w = src.w
        return this
    }
    copy(rhs) {
        this.x = rhs.x
        this.y = rhs.y
        this.z = rhs.z
        this.w = rhs.w
        return this
    }
    dot(other) {
        return this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w
    }
    equals(rhs) {
        return this.x === rhs.x && this.y === rhs.y && this.z === rhs.z && this.w === rhs.w
    }
    equalsApprox(rhs, epsilon = 1e-6) {
        return (
            Math.abs(this.x - rhs.x) < epsilon &&
            Math.abs(this.y - rhs.y) < epsilon &&
            Math.abs(this.z - rhs.z) < epsilon &&
            Math.abs(this.w - rhs.w) < epsilon
        )
    }
    getAxisAngle(axis) {
        let rad = Math.acos(this.w) * 2
        const s = Math.sin(rad / 2)
        if (s !== 0) {
            axis.x = this.x / s
            axis.y = this.y / s
            axis.z = this.z / s
            if (axis.x < 0 || axis.y < 0 || axis.z < 0) {
                axis.x *= -1
                axis.y *= -1
                axis.z *= -1
                rad *= -1
            }
        } else {
            axis.x = 1
            axis.y = 0
            axis.z = 0
        }
        return rad * math.RAD_TO_DEG
    }
    getEulerAngles(eulers = new Vec3()) {
        let x, y, z
        const qx = this.x
        const qy = this.y
        const qz = this.z
        const qw = this.w
        const a2 = 2 * (qw * qy - qx * qz)
        if (a2 <= -0.99999) {
            x = 2 * Math.atan2(qx, qw)
            y = -Math.PI / 2
            z = 0
        } else if (a2 >= 0.99999) {
            x = 2 * Math.atan2(qx, qw)
            y = Math.PI / 2
            z = 0
        } else {
            x = Math.atan2(2 * (qw * qx + qy * qz), 1 - 2 * (qx * qx + qy * qy))
            y = Math.asin(a2)
            z = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz))
        }
        return eulers.set(x, y, z).mulScalar(math.RAD_TO_DEG)
    }
    invert(src = this) {
        return this.conjugate(src).normalize()
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w)
    }
    lengthSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w
    }
    lerp(lhs, rhs, alpha) {
        const omt = (1 - alpha) * (lhs.dot(rhs) < 0 ? -1 : 1)
        this.x = lhs.x * omt + rhs.x * alpha
        this.y = lhs.y * omt + rhs.y * alpha
        this.z = lhs.z * omt + rhs.z * alpha
        this.w = lhs.w * omt + rhs.w * alpha
        return this.normalize()
    }
    mul(rhs) {
        const q1x = this.x
        const q1y = this.y
        const q1z = this.z
        const q1w = this.w
        const q2x = rhs.x
        const q2y = rhs.y
        const q2z = rhs.z
        const q2w = rhs.w
        this.x = q1w * q2x + q1x * q2w + q1y * q2z - q1z * q2y
        this.y = q1w * q2y + q1y * q2w + q1z * q2x - q1x * q2z
        this.z = q1w * q2z + q1z * q2w + q1x * q2y - q1y * q2x
        this.w = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z
        return this
    }
    mulScalar(scalar, src = this) {
        this.x = src.x * scalar
        this.y = src.y * scalar
        this.z = src.z * scalar
        this.w = src.w * scalar
        return this
    }
    mul2(lhs, rhs) {
        const q1x = lhs.x
        const q1y = lhs.y
        const q1z = lhs.z
        const q1w = lhs.w
        const q2x = rhs.x
        const q2y = rhs.y
        const q2z = rhs.z
        const q2w = rhs.w
        this.x = q1w * q2x + q1x * q2w + q1y * q2z - q1z * q2y
        this.y = q1w * q2y + q1y * q2w + q1z * q2x - q1x * q2z
        this.z = q1w * q2z + q1z * q2w + q1x * q2y - q1y * q2x
        this.w = q1w * q2w - q1x * q2x - q1y * q2y - q1z * q2z
        return this
    }
    normalize(src = this) {
        let len = src.length()
        if (len === 0) {
            this.x = this.y = this.z = 0
            this.w = 1
        } else {
            len = 1 / len
            this.x = src.x * len
            this.y = src.y * len
            this.z = src.z * len
            this.w = src.w * len
        }
        return this
    }
    set(x, y, z, w) {
        this.x = x
        this.y = y
        this.z = z
        this.w = w
        return this
    }
    setFromAxisAngle(axis, angle) {
        angle *= 0.5 * math.DEG_TO_RAD
        const sa = Math.sin(angle)
        const ca = Math.cos(angle)
        this.x = sa * axis.x
        this.y = sa * axis.y
        this.z = sa * axis.z
        this.w = ca
        return this
    }
    setFromEulerAngles(ex, ey, ez) {
        if (ex instanceof Vec3) {
            const vec = ex
            ex = vec.x
            ey = vec.y
            ez = vec.z
        }
        const halfToRad = 0.5 * math.DEG_TO_RAD
        ex *= halfToRad
        ey *= halfToRad
        ez *= halfToRad
        const sx = Math.sin(ex)
        const cx = Math.cos(ex)
        const sy = Math.sin(ey)
        const cy = Math.cos(ey)
        const sz = Math.sin(ez)
        const cz = Math.cos(ez)
        this.x = sx * cy * cz - cx * sy * sz
        this.y = cx * sy * cz + sx * cy * sz
        this.z = cx * cy * sz - sx * sy * cz
        this.w = cx * cy * cz + sx * sy * sz
        return this
    }
    setFromMat4(m) {
        const d = m.data
        let m00 = d[0]
        let m01 = d[1]
        let m02 = d[2]
        let m10 = d[4]
        let m11 = d[5]
        let m12 = d[6]
        let m20 = d[8]
        let m21 = d[9]
        let m22 = d[10]
        const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20)
        if (det < 0) {
            m00 = -m00
            m01 = -m01
            m02 = -m02
        }
        let l
        l = m00 * m00 + m01 * m01 + m02 * m02
        if (l === 0) return this.set(0, 0, 0, 1)
        l = 1 / Math.sqrt(l)
        m00 *= l
        m01 *= l
        m02 *= l
        l = m10 * m10 + m11 * m11 + m12 * m12
        if (l === 0) return this.set(0, 0, 0, 1)
        l = 1 / Math.sqrt(l)
        m10 *= l
        m11 *= l
        m12 *= l
        l = m20 * m20 + m21 * m21 + m22 * m22
        if (l === 0) return this.set(0, 0, 0, 1)
        l = 1 / Math.sqrt(l)
        m20 *= l
        m21 *= l
        m22 *= l
        if (m22 < 0) {
            if (m00 > m11) {
                this.set(1 + m00 - m11 - m22, m01 + m10, m20 + m02, m12 - m21)
            } else {
                this.set(m01 + m10, 1 - m00 + m11 - m22, m12 + m21, m20 - m02)
            }
        } else {
            if (m00 < -m11) {
                this.set(m20 + m02, m12 + m21, 1 - m00 - m11 + m22, m01 - m10)
            } else {
                this.set(m12 - m21, m20 - m02, m01 - m10, 1 + m00 + m11 + m22)
            }
        }
        return this.mulScalar(1.0 / this.length())
    }
    setFromDirections(from, to) {
        const dotProduct = 1 + from.dot(to)
        if (dotProduct < Number.EPSILON) {
            if (Math.abs(from.x) > Math.abs(from.y)) {
                this.x = -from.z
                this.y = 0
                this.z = from.x
                this.w = 0
            } else {
                this.x = 0
                this.y = -from.z
                this.z = from.y
                this.w = 0
            }
        } else {
            this.x = from.y * to.z - from.z * to.y
            this.y = from.z * to.x - from.x * to.z
            this.z = from.x * to.y - from.y * to.x
            this.w = dotProduct
        }
        return this.normalize()
    }
    slerp(lhs, rhs, alpha) {
        const lx = lhs.x
        const ly = lhs.y
        const lz = lhs.z
        const lw = lhs.w
        let rx = rhs.x
        let ry = rhs.y
        let rz = rhs.z
        let rw = rhs.w
        let cosHalfTheta = lw * rw + lx * rx + ly * ry + lz * rz
        if (cosHalfTheta < 0) {
            rw = -rw
            rx = -rx
            ry = -ry
            rz = -rz
            cosHalfTheta = -cosHalfTheta
        }
        if (Math.abs(cosHalfTheta) >= 1) {
            this.w = lw
            this.x = lx
            this.y = ly
            this.z = lz
            return this
        }
        const halfTheta = Math.acos(cosHalfTheta)
        const sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta)
        if (Math.abs(sinHalfTheta) < 0.001) {
            this.w = lw * 0.5 + rw * 0.5
            this.x = lx * 0.5 + rx * 0.5
            this.y = ly * 0.5 + ry * 0.5
            this.z = lz * 0.5 + rz * 0.5
            return this
        }
        const ratioA = Math.sin((1 - alpha) * halfTheta) / sinHalfTheta
        const ratioB = Math.sin(alpha * halfTheta) / sinHalfTheta
        this.w = lw * ratioA + rw * ratioB
        this.x = lx * ratioA + rx * ratioB
        this.y = ly * ratioA + ry * ratioB
        this.z = lz * ratioA + rz * ratioB
        return this
    }
    transformVector(vec, res = new Vec3()) {
        const x = vec.x,
            y = vec.y,
            z = vec.z
        const qx = this.x,
            qy = this.y,
            qz = this.z,
            qw = this.w
        const ix = qw * x + qy * z - qz * y
        const iy = qw * y + qz * x - qx * z
        const iz = qw * z + qx * y - qy * x
        const iw = -qx * x - qy * y - qz * z
        res.x = ix * qw + iw * -qx + iy * -qz - iz * -qy
        res.y = iy * qw + iw * -qy + iz * -qx - ix * -qz
        res.z = iz * qw + iw * -qz + ix * -qy - iy * -qx
        return res
    }
    fromArray(arr, offset = 0) {
        this.x = arr[offset] ?? this.x
        this.y = arr[offset + 1] ?? this.y
        this.z = arr[offset + 2] ?? this.z
        this.w = arr[offset + 3] ?? this.w
        return this
    }
    toString() {
        return `[${this.x}, ${this.y}, ${this.z}, ${this.w}]`
    }
    toArray(arr = [], offset = 0) {
        arr[offset] = this.x
        arr[offset + 1] = this.y
        arr[offset + 2] = this.z
        arr[offset + 3] = this.w
        return arr
    }
    constructor(x = 0, y = 0, z = 0, w = 1) {
        if (x.length === 4) {
            this.x = x[0]
            this.y = x[1]
            this.z = x[2]
            this.w = x[3]
        } else {
            this.x = x
            this.y = y
            this.z = z
            this.w = w
        }
    }
}
Quat.IDENTITY = Object.freeze(new Quat(0, 0, 0, 1))
Quat.ZERO = Object.freeze(new Quat(0, 0, 0, 0))

const tmpVecA$1 = new Vec3()
const tmpVecB$1 = new Vec3()
const tmpVecC = new Vec3()
const tmpVecD = new Vec3()
const tmpVecE = new Vec3()
class BoundingBox {
    add(other) {
        const tc = this.center
        const tcx = tc.x
        const tcy = tc.y
        const tcz = tc.z
        const th = this.halfExtents
        const thx = th.x
        const thy = th.y
        const thz = th.z
        let tminx = tcx - thx
        let tmaxx = tcx + thx
        let tminy = tcy - thy
        let tmaxy = tcy + thy
        let tminz = tcz - thz
        let tmaxz = tcz + thz
        const oc = other.center
        const ocx = oc.x
        const ocy = oc.y
        const ocz = oc.z
        const oh = other.halfExtents
        const ohx = oh.x
        const ohy = oh.y
        const ohz = oh.z
        const ominx = ocx - ohx
        const omaxx = ocx + ohx
        const ominy = ocy - ohy
        const omaxy = ocy + ohy
        const ominz = ocz - ohz
        const omaxz = ocz + ohz
        if (ominx < tminx) tminx = ominx
        if (omaxx > tmaxx) tmaxx = omaxx
        if (ominy < tminy) tminy = ominy
        if (omaxy > tmaxy) tmaxy = omaxy
        if (ominz < tminz) tminz = ominz
        if (omaxz > tmaxz) tmaxz = omaxz
        tc.x = (tminx + tmaxx) * 0.5
        tc.y = (tminy + tmaxy) * 0.5
        tc.z = (tminz + tmaxz) * 0.5
        th.x = (tmaxx - tminx) * 0.5
        th.y = (tmaxy - tminy) * 0.5
        th.z = (tmaxz - tminz) * 0.5
    }
    copy(src) {
        this.center.copy(src.center)
        this.halfExtents.copy(src.halfExtents)
    }
    clone() {
        return new BoundingBox(this.center, this.halfExtents)
    }
    intersects(other) {
        const aMax = this.getMax()
        const aMin = this.getMin()
        const bMax = other.getMax()
        const bMin = other.getMin()
        return (
            aMin.x <= bMax.x &&
            aMax.x >= bMin.x &&
            aMin.y <= bMax.y &&
            aMax.y >= bMin.y &&
            aMin.z <= bMax.z &&
            aMax.z >= bMin.z
        )
    }
    _intersectsRay(ray, point) {
        const tMin = tmpVecA$1.copy(this.getMin()).sub(ray.origin)
        const tMax = tmpVecB$1.copy(this.getMax()).sub(ray.origin)
        const dir = ray.direction
        if (dir.x === 0) {
            tMin.x = tMin.x < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE
            tMax.x = tMax.x < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE
        } else {
            tMin.x /= dir.x
            tMax.x /= dir.x
        }
        if (dir.y === 0) {
            tMin.y = tMin.y < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE
            tMax.y = tMax.y < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE
        } else {
            tMin.y /= dir.y
            tMax.y /= dir.y
        }
        if (dir.z === 0) {
            tMin.z = tMin.z < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE
            tMax.z = tMax.z < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE
        } else {
            tMin.z /= dir.z
            tMax.z /= dir.z
        }
        const realMin = tmpVecC.set(Math.min(tMin.x, tMax.x), Math.min(tMin.y, tMax.y), Math.min(tMin.z, tMax.z))
        const realMax = tmpVecD.set(Math.max(tMin.x, tMax.x), Math.max(tMin.y, tMax.y), Math.max(tMin.z, tMax.z))
        const minMax = Math.min(Math.min(realMax.x, realMax.y), realMax.z)
        const maxMin = Math.max(Math.max(realMin.x, realMin.y), realMin.z)
        const intersects = minMax >= maxMin && maxMin >= 0
        if (intersects) {
            point.copy(ray.direction).mulScalar(maxMin).add(ray.origin)
        }
        return intersects
    }
    _fastIntersectsRay(ray) {
        const diff = tmpVecA$1
        const cross = tmpVecB$1
        const prod = tmpVecC
        const absDiff = tmpVecD
        const absDir = tmpVecE
        const rayDir = ray.direction
        diff.sub2(ray.origin, this.center)
        absDiff.set(Math.abs(diff.x), Math.abs(diff.y), Math.abs(diff.z))
        prod.mul2(diff, rayDir)
        if (absDiff.x > this.halfExtents.x && prod.x >= 0) {
            return false
        }
        if (absDiff.y > this.halfExtents.y && prod.y >= 0) {
            return false
        }
        if (absDiff.z > this.halfExtents.z && prod.z >= 0) {
            return false
        }
        absDir.set(Math.abs(rayDir.x), Math.abs(rayDir.y), Math.abs(rayDir.z))
        cross.cross(rayDir, diff)
        cross.set(Math.abs(cross.x), Math.abs(cross.y), Math.abs(cross.z))
        if (cross.x > this.halfExtents.y * absDir.z + this.halfExtents.z * absDir.y) {
            return false
        }
        if (cross.y > this.halfExtents.x * absDir.z + this.halfExtents.z * absDir.x) {
            return false
        }
        if (cross.z > this.halfExtents.x * absDir.y + this.halfExtents.y * absDir.x) {
            return false
        }
        return true
    }
    intersectsRay(ray, point) {
        if (point) {
            return this._intersectsRay(ray, point)
        }
        return this._fastIntersectsRay(ray)
    }
    setMinMax(min, max) {
        this.center.add2(max, min).mulScalar(0.5)
        this.halfExtents.sub2(max, min).mulScalar(0.5)
    }
    getMin() {
        return this._min.copy(this.center).sub(this.halfExtents)
    }
    getMax() {
        return this._max.copy(this.center).add(this.halfExtents)
    }
    containsPoint(point) {
        const c = this.center
        const h = this.halfExtents
        if (
            point.x < c.x - h.x ||
            point.x > c.x + h.x ||
            point.y < c.y - h.y ||
            point.y > c.y + h.y ||
            point.z < c.z - h.z ||
            point.z > c.z + h.z
        ) {
            return false
        }
        return true
    }
    closestPoint(point, result = new Vec3()) {
        const c = this.center
        const h = this.halfExtents
        return result.set(
            Math.max(c.x - h.x, Math.min(point.x, c.x + h.x)),
            Math.max(c.y - h.y, Math.min(point.y, c.y + h.y)),
            Math.max(c.z - h.z, Math.min(point.z, c.z + h.z)),
        )
    }
    setFromTransformedAabb(aabb, m, ignoreScale = false) {
        const ac = aabb.center
        const ar = aabb.halfExtents
        const d = m.data
        let mx0 = d[0]
        let mx1 = d[4]
        let mx2 = d[8]
        let my0 = d[1]
        let my1 = d[5]
        let my2 = d[9]
        let mz0 = d[2]
        let mz1 = d[6]
        let mz2 = d[10]
        if (ignoreScale) {
            let lengthSq = mx0 * mx0 + mx1 * mx1 + mx2 * mx2
            if (lengthSq > 0) {
                const invLength = 1 / Math.sqrt(lengthSq)
                mx0 *= invLength
                mx1 *= invLength
                mx2 *= invLength
            }
            lengthSq = my0 * my0 + my1 * my1 + my2 * my2
            if (lengthSq > 0) {
                const invLength = 1 / Math.sqrt(lengthSq)
                my0 *= invLength
                my1 *= invLength
                my2 *= invLength
            }
            lengthSq = mz0 * mz0 + mz1 * mz1 + mz2 * mz2
            if (lengthSq > 0) {
                const invLength = 1 / Math.sqrt(lengthSq)
                mz0 *= invLength
                mz1 *= invLength
                mz2 *= invLength
            }
        }
        this.center.set(
            d[12] + mx0 * ac.x + mx1 * ac.y + mx2 * ac.z,
            d[13] + my0 * ac.x + my1 * ac.y + my2 * ac.z,
            d[14] + mz0 * ac.x + mz1 * ac.y + mz2 * ac.z,
        )
        this.halfExtents.set(
            Math.abs(mx0) * ar.x + Math.abs(mx1) * ar.y + Math.abs(mx2) * ar.z,
            Math.abs(my0) * ar.x + Math.abs(my1) * ar.y + Math.abs(my2) * ar.z,
            Math.abs(mz0) * ar.x + Math.abs(mz1) * ar.y + Math.abs(mz2) * ar.z,
        )
    }
    static computeMinMax(vertices, min, max, numVerts = vertices.length / 3) {
        if (numVerts > 0) {
            let minx = vertices[0]
            let miny = vertices[1]
            let minz = vertices[2]
            let maxx = minx
            let maxy = miny
            let maxz = minz
            const n = numVerts * 3
            for (let i = 3; i < n; i += 3) {
                const x = vertices[i]
                const y = vertices[i + 1]
                const z = vertices[i + 2]
                if (x < minx) minx = x
                if (y < miny) miny = y
                if (z < minz) minz = z
                if (x > maxx) maxx = x
                if (y > maxy) maxy = y
                if (z > maxz) maxz = z
            }
            min.set(minx, miny, minz)
            max.set(maxx, maxy, maxz)
        }
    }
    compute(vertices, numVerts) {
        BoundingBox.computeMinMax(vertices, tmpVecA$1, tmpVecB$1, numVerts)
        this.setMinMax(tmpVecA$1, tmpVecB$1)
    }
    intersectsBoundingSphere(sphere) {
        const sq = this._distanceToBoundingSphereSq(sphere)
        if (sq <= sphere.radius * sphere.radius) {
            return true
        }
        return false
    }
    _distanceToBoundingSphereSq(sphere) {
        const boxMin = this.getMin()
        const boxMax = this.getMax()
        let sq = 0
        const axis = ['x', 'y', 'z']
        for (let i = 0; i < 3; ++i) {
            let out = 0
            const pn = sphere.center[axis[i]]
            const bMin = boxMin[axis[i]]
            const bMax = boxMax[axis[i]]
            let val = 0
            if (pn < bMin) {
                val = bMin - pn
                out += val * val
            }
            if (pn > bMax) {
                val = pn - bMax
                out += val * val
            }
            sq += out
        }
        return sq
    }
    _expand(expandMin, expandMax) {
        tmpVecA$1.add2(this.getMin(), expandMin)
        tmpVecB$1.add2(this.getMax(), expandMax)
        this.setMinMax(tmpVecA$1, tmpVecB$1)
    }
    constructor(center, halfExtents) {
        this.center = new Vec3()
        this.halfExtents = new Vec3(0.5, 0.5, 0.5)
        this._min = new Vec3()
        this._max = new Vec3()
        if (center) {
            this.center.copy(center)
        }
        if (halfExtents) {
            this.halfExtents.copy(halfExtents)
        }
    }
}
const tmpVecA = new Vec3()
const tmpVecB = new Vec3()
class BoundingSphere {
    containsPoint(point) {
        const lenSq = tmpVecA.sub2(point, this.center).lengthSq()
        const r = this.radius
        return lenSq < r * r
    }
    intersectsRay(ray, point) {
        const m = tmpVecA.copy(ray.origin).sub(this.center)
        const b = m.dot(tmpVecB.copy(ray.direction).normalize())
        const c = m.dot(m) - this.radius * this.radius
        if (c > 0 && b > 0) {
            return false
        }
        const discr = b * b - c
        if (discr < 0) {
            return false
        }
        const t = Math.abs(-b - Math.sqrt(discr))
        if (point) {
            point.copy(ray.direction).mulScalar(t).add(ray.origin)
        }
        return true
    }
    intersectsBoundingSphere(sphere) {
        tmpVecA.sub2(sphere.center, this.center)
        const totalRadius = sphere.radius + this.radius
        if (tmpVecA.lengthSq() <= totalRadius * totalRadius) {
            return true
        }
        return false
    }
    constructor(center = new Vec3(), radius = 0.5) {
        this.center = center
        this.radius = radius
    }
}

class Plane {
    clone() {
        const cstr = this.constructor
        return new cstr().copy(this)
    }
    copy(src) {
        this.normal.copy(src.normal)
        this.distance = src.distance
        return this
    }
    intersectsLine(start, end, point) {
        const d = this.distance
        const d0 = this.normal.dot(start) + d
        const d1 = this.normal.dot(end) + d
        const t = d0 / (d0 - d1)
        const intersects = t >= 0 && t <= 1
        if (intersects && point) {
            point.lerp(start, end, t)
        }
        return intersects
    }
    intersectsRay(ray, point) {
        const denominator = this.normal.dot(ray.direction)
        if (denominator === 0) {
            return false
        }
        const t = -(this.normal.dot(ray.origin) + this.distance) / denominator
        if (t >= 0 && point) {
            point.copy(ray.direction).mulScalar(t).add(ray.origin)
        }
        return t >= 0
    }
    normalize() {
        const invLength = 1 / this.normal.length()
        this.normal.mulScalar(invLength)
        this.distance *= invLength
        return this
    }
    set(nx, ny, nz, d) {
        this.normal.set(nx, ny, nz)
        this.distance = d
        return this
    }
    setFromPointNormal(point, normal) {
        this.normal.copy(normal)
        this.distance = -this.normal.dot(point)
        return this
    }
    constructor(normal = Vec3.UP, distance = 0) {
        this.normal = new Vec3()
        this.normal.copy(normal)
        this.distance = distance
    }
}

class Frustum {
    clone() {
        const cstr = this.constructor
        return new cstr().copy(this)
    }
    copy(src) {
        for (let i = 0; i < 6; i++) {
            this.planes[i].copy(src.planes[i])
        }
        return this
    }
    setFromMat4(matrix) {
        const [m00, m01, m02, m03, m10, m11, m12, m13, m20, m21, m22, m23, m30, m31, m32, m33] = matrix.data
        const planes = this.planes
        planes[0].set(m03 - m00, m13 - m10, m23 - m20, m33 - m30).normalize()
        planes[1].set(m03 + m00, m13 + m10, m23 + m20, m33 + m30).normalize()
        planes[2].set(m03 + m01, m13 + m11, m23 + m21, m33 + m31).normalize()
        planes[3].set(m03 - m01, m13 - m11, m23 - m21, m33 - m31).normalize()
        planes[4].set(m03 - m02, m13 - m12, m23 - m22, m33 - m32).normalize()
        planes[5].set(m03 + m02, m13 + m12, m23 + m22, m33 + m32).normalize()
    }
    containsPoint(point) {
        for (let p = 0; p < 6; p++) {
            const { normal, distance } = this.planes[p]
            if (normal.dot(point) + distance <= 0) {
                return false
            }
        }
        return true
    }
    add(other) {
        const planes = this.planes
        const otherPlanes = other.planes
        for (let p = 0; p < 6; p++) {
            if (otherPlanes[p].distance > planes[p].distance) {
                planes[p].copy(otherPlanes[p])
            }
        }
        return this
    }
    containsSphere(sphere) {
        const { center, radius } = sphere
        let c = 0
        for (let p = 0; p < 6; p++) {
            const { normal, distance } = this.planes[p]
            const d = normal.dot(center) + distance
            if (d <= -radius) {
                return 0
            }
            if (d > radius) {
                c++
            }
        }
        return c === 6 ? 2 : 1
    }
    constructor() {
        this.planes = []
        for (let i = 0; i < 6; i++) {
            this.planes[i] = new Plane()
        }
    }
}

class Ray {
    set(origin, direction) {
        this.origin.copy(origin)
        this.direction.copy(direction)
        return this
    }
    copy(src) {
        return this.set(src.origin, src.direction)
    }
    getPoint(t, out = new Vec3()) {
        out.copy(this.direction).mulScalar(t).add(this.origin)
        return out
    }
    clone() {
        return new this.constructor(this.origin, this.direction)
    }
    constructor(origin, direction) {
        this.origin = new Vec3()
        this.direction = Vec3.FORWARD.clone()
        if (origin) {
            this.origin.copy(origin)
        }
        if (direction) {
            this.direction.copy(direction)
        }
    }
}

const ADDRESS_REPEAT = 0
const ADDRESS_CLAMP_TO_EDGE = 1
const ADDRESS_MIRRORED_REPEAT = 2
const BLENDMODE_ZERO = 0
const BLENDMODE_ONE = 1
const BLENDMODE_SRC_COLOR = 2
const BLENDMODE_DST_COLOR = 4
const BLENDMODE_ONE_MINUS_DST_COLOR = 5
const BLENDMODE_SRC_ALPHA = 6
const BLENDMODE_ONE_MINUS_SRC_ALPHA = 8
const BLENDEQUATION_ADD = 0
const BLENDEQUATION_REVERSE_SUBTRACT = 2
const BLENDEQUATION_MIN = 3
const BLENDEQUATION_MAX = 4
const BUFFERUSAGE_READ = 0x0001
const BUFFERUSAGE_COPY_SRC = 0x0004
const BUFFERUSAGE_COPY_DST = 0x0008
const BUFFERUSAGE_INDEX = 0x0010
const BUFFERUSAGE_VERTEX = 0x0020
const BUFFERUSAGE_UNIFORM = 0x0040
const BUFFERUSAGE_STORAGE = 0x0080
const BUFFERUSAGE_INDIRECT = 0x0100
const BUFFER_STATIC = 0
const BUFFER_DYNAMIC = 1
const BUFFER_STREAM = 2
const BUFFER_GPUDYNAMIC = 3
const CLEARFLAG_COLOR = 1
const CLEARFLAG_DEPTH = 2
const CLEARFLAG_STENCIL = 4
const CULLFACE_NONE = 0
const CULLFACE_BACK = 1
const CULLFACE_FRONT = 2
const FRONTFACE_CCW = 0
const FRONTFACE_CW = 1
const FILTER_NEAREST = 0
const FILTER_LINEAR = 1
const FILTER_NEAREST_MIPMAP_NEAREST = 2
const FILTER_NEAREST_MIPMAP_LINEAR = 3
const FILTER_LINEAR_MIPMAP_NEAREST = 4
const FILTER_LINEAR_MIPMAP_LINEAR = 5
const FUNC_LESS = 1
const FUNC_LESSEQUAL = 3
const FUNC_ALWAYS = 7
const INDEXFORMAT_UINT8 = 0
const INDEXFORMAT_UINT16 = 1
const INDEXFORMAT_UINT32 = 2
const indexFormatByteSize = [1, 2, 4]
const PIXELFORMAT_A8 = 0
const PIXELFORMAT_L8 = 1
const PIXELFORMAT_LA8 = 2
const PIXELFORMAT_RGB565 = 3
const PIXELFORMAT_RGBA5551 = 4
const PIXELFORMAT_RGBA4 = 5
const PIXELFORMAT_RGB8 = 6
const PIXELFORMAT_RGBA8 = 7
const PIXELFORMAT_DXT1 = 8
const PIXELFORMAT_DXT3 = 9
const PIXELFORMAT_DXT5 = 10
const PIXELFORMAT_RGB16F = 11
const PIXELFORMAT_RGBA16F = 12
const PIXELFORMAT_RGB32F = 13
const PIXELFORMAT_RGBA32F = 14
const PIXELFORMAT_R32F = 15
const PIXELFORMAT_DEPTH = 16
const PIXELFORMAT_DEPTHSTENCIL = 17
const PIXELFORMAT_111110F = 18
const PIXELFORMAT_SRGB8 = 19
const PIXELFORMAT_SRGBA8 = 20
const PIXELFORMAT_ETC1 = 21
const PIXELFORMAT_ETC2_RGB = 22
const PIXELFORMAT_ETC2_RGBA = 23
const PIXELFORMAT_PVRTC_2BPP_RGB_1 = 24
const PIXELFORMAT_PVRTC_2BPP_RGBA_1 = 25
const PIXELFORMAT_PVRTC_4BPP_RGB_1 = 26
const PIXELFORMAT_PVRTC_4BPP_RGBA_1 = 27
const PIXELFORMAT_ASTC_4x4 = 28
const PIXELFORMAT_ATC_RGB = 29
const PIXELFORMAT_ATC_RGBA = 30
const PIXELFORMAT_BGRA8 = 31
const PIXELFORMAT_R8I = 32
const PIXELFORMAT_R8U = 33
const PIXELFORMAT_R16I = 34
const PIXELFORMAT_R16U = 35
const PIXELFORMAT_R32I = 36
const PIXELFORMAT_R32U = 37
const PIXELFORMAT_RG8I = 38
const PIXELFORMAT_RG8U = 39
const PIXELFORMAT_RG16I = 40
const PIXELFORMAT_RG16U = 41
const PIXELFORMAT_RG32I = 42
const PIXELFORMAT_RG32U = 43
const PIXELFORMAT_RGBA8I = 44
const PIXELFORMAT_RGBA8U = 45
const PIXELFORMAT_RGBA16I = 46
const PIXELFORMAT_RGBA16U = 47
const PIXELFORMAT_RGBA32I = 48
const PIXELFORMAT_RGBA32U = 49
const PIXELFORMAT_R16F = 50
const PIXELFORMAT_RG16F = 51
const PIXELFORMAT_R8 = 52
const PIXELFORMAT_RG8 = 53
const PIXELFORMAT_DXT1_SRGB = 54
const PIXELFORMAT_DXT3_SRGBA = 55
const PIXELFORMAT_DXT5_SRGBA = 56
const PIXELFORMAT_ETC2_SRGB = 61
const PIXELFORMAT_ETC2_SRGBA = 62
const PIXELFORMAT_ASTC_4x4_SRGB = 63
const PIXELFORMAT_SBGRA8 = 64
const PIXELFORMAT_BC6F = 65
const PIXELFORMAT_BC6UF = 66
const PIXELFORMAT_BC7 = 67
const PIXELFORMAT_BC7_SRGBA = 68
const PIXELFORMAT_DEPTH16 = 69
const PIXELFORMAT_RG32F = 70
const PIXELFORMAT_RGB9E5 = 71
const PIXELFORMAT_RG8S = 72
const PIXELFORMAT_RGBA8S = 73
const PIXELFORMAT_RGB10A2 = 74
const PIXELFORMAT_RGB10A2U = 75
const pixelFormatInfo = new Map([
    [
        PIXELFORMAT_A8,
        {
            name: 'A8',
            size: 1,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_R8,
        {
            name: 'R8',
            size: 1,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_L8,
        {
            name: 'L8',
            size: 1,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_LA8,
        {
            name: 'LA8',
            size: 2,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_RG8,
        {
            name: 'RG8',
            size: 2,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_RGB565,
        {
            name: 'RGB565',
            size: 2,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_RGBA5551,
        {
            name: 'RGBA5551',
            size: 2,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_RGBA4,
        {
            name: 'RGBA4',
            size: 2,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_RGB8,
        {
            name: 'RGB8',
            size: 4,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_RGBA8,
        {
            name: 'RGBA8',
            size: 4,
            ldr: true,
            srgbFormat: PIXELFORMAT_SRGBA8,
        },
    ],
    [
        PIXELFORMAT_R16F,
        {
            name: 'R16F',
            size: 2,
        },
    ],
    [
        PIXELFORMAT_RG16F,
        {
            name: 'RG16F',
            size: 4,
        },
    ],
    [
        PIXELFORMAT_RGB16F,
        {
            name: 'RGB16F',
            size: 8,
        },
    ],
    [
        PIXELFORMAT_RGBA16F,
        {
            name: 'RGBA16F',
            size: 8,
        },
    ],
    [
        PIXELFORMAT_RGB32F,
        {
            name: 'RGB32F',
            size: 16,
        },
    ],
    [
        PIXELFORMAT_RGBA32F,
        {
            name: 'RGBA32F',
            size: 16,
        },
    ],
    [
        PIXELFORMAT_R32F,
        {
            name: 'R32F',
            size: 4,
        },
    ],
    [
        PIXELFORMAT_RG32F,
        {
            name: 'RG32F',
            size: 8,
        },
    ],
    [
        PIXELFORMAT_RGB9E5,
        {
            name: 'RGB9E5',
            size: 4,
        },
    ],
    [
        PIXELFORMAT_RG8S,
        {
            name: 'RG8S',
            size: 2,
        },
    ],
    [
        PIXELFORMAT_RGBA8S,
        {
            name: 'RGBA8S',
            size: 4,
        },
    ],
    [
        PIXELFORMAT_RGB10A2,
        {
            name: 'RGB10A2',
            size: 4,
        },
    ],
    [
        PIXELFORMAT_RGB10A2U,
        {
            name: 'RGB10A2U',
            size: 4,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_DEPTH,
        {
            name: 'DEPTH',
            size: 4,
        },
    ],
    [
        PIXELFORMAT_DEPTH16,
        {
            name: 'DEPTH16',
            size: 2,
        },
    ],
    [
        PIXELFORMAT_DEPTHSTENCIL,
        {
            name: 'DEPTHSTENCIL',
            size: 4,
        },
    ],
    [
        PIXELFORMAT_111110F,
        {
            name: '111110F',
            size: 4,
        },
    ],
    [
        PIXELFORMAT_SRGB8,
        {
            name: 'SRGB8',
            size: 4,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_SRGBA8,
        {
            name: 'SRGBA8',
            size: 4,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_BGRA8,
        {
            name: 'BGRA8',
            size: 4,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_SBGRA8,
        {
            name: 'SBGRA8',
            size: 4,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_DXT1,
        {
            name: 'DXT1',
            blockSize: 8,
            ldr: true,
            srgbFormat: PIXELFORMAT_DXT1_SRGB,
        },
    ],
    [
        PIXELFORMAT_DXT3,
        {
            name: 'DXT3',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_DXT3_SRGBA,
        },
    ],
    [
        PIXELFORMAT_DXT5,
        {
            name: 'DXT5',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_DXT5_SRGBA,
        },
    ],
    [
        PIXELFORMAT_ETC1,
        {
            name: 'ETC1',
            blockSize: 8,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_ETC2_RGB,
        {
            name: 'ETC2_RGB',
            blockSize: 8,
            ldr: true,
            srgbFormat: PIXELFORMAT_ETC2_SRGB,
        },
    ],
    [
        PIXELFORMAT_ETC2_RGBA,
        {
            name: 'ETC2_RGBA',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_ETC2_SRGBA,
        },
    ],
    [
        PIXELFORMAT_PVRTC_2BPP_RGB_1,
        {
            name: 'PVRTC_2BPP_RGB_1',
            ldr: true,
            blockSize: 8,
        },
    ],
    [
        PIXELFORMAT_PVRTC_2BPP_RGBA_1,
        {
            name: 'PVRTC_2BPP_RGBA_1',
            ldr: true,
            blockSize: 8,
        },
    ],
    [
        PIXELFORMAT_PVRTC_4BPP_RGB_1,
        {
            name: 'PVRTC_4BPP_RGB_1',
            ldr: true,
            blockSize: 8,
        },
    ],
    [
        PIXELFORMAT_PVRTC_4BPP_RGBA_1,
        {
            name: 'PVRTC_4BPP_RGBA_1',
            ldr: true,
            blockSize: 8,
        },
    ],
    [
        PIXELFORMAT_ASTC_4x4,
        {
            name: 'ASTC_4x4',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_ASTC_4x4_SRGB,
        },
    ],
    [
        PIXELFORMAT_ATC_RGB,
        {
            name: 'ATC_RGB',
            blockSize: 8,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_ATC_RGBA,
        {
            name: 'ATC_RGBA',
            blockSize: 16,
            ldr: true,
        },
    ],
    [
        PIXELFORMAT_BC6F,
        {
            name: 'BC6H_RGBF',
            blockSize: 16,
        },
    ],
    [
        PIXELFORMAT_BC6UF,
        {
            name: 'BC6H_RGBUF',
            blockSize: 16,
        },
    ],
    [
        PIXELFORMAT_BC7,
        {
            name: 'BC7_RGBA',
            blockSize: 16,
            ldr: true,
            srgbFormat: PIXELFORMAT_BC7_SRGBA,
        },
    ],
    [
        PIXELFORMAT_DXT1_SRGB,
        {
            name: 'DXT1_SRGB',
            blockSize: 8,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_DXT3_SRGBA,
        {
            name: 'DXT3_SRGBA',
            blockSize: 16,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_DXT5_SRGBA,
        {
            name: 'DXT5_SRGBA',
            blockSize: 16,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_ETC2_SRGB,
        {
            name: 'ETC2_SRGB',
            blockSize: 8,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_ETC2_SRGBA,
        {
            name: 'ETC2_SRGBA',
            blockSize: 16,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_ASTC_4x4_SRGB,
        {
            name: 'ASTC_4x4_SRGB',
            blockSize: 16,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_BC7_SRGBA,
        {
            name: 'BC7_SRGBA',
            blockSize: 16,
            ldr: true,
            srgb: true,
        },
    ],
    [
        PIXELFORMAT_R8I,
        {
            name: 'R8I',
            size: 1,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_R16I,
        {
            name: 'R16I',
            size: 2,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_R32I,
        {
            name: 'R32I',
            size: 4,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_RG8I,
        {
            name: 'RG8I',
            size: 2,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_RG16I,
        {
            name: 'RG16I',
            size: 4,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_RG32I,
        {
            name: 'RG32I',
            size: 8,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_RGBA8I,
        {
            name: 'RGBA8I',
            size: 4,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_RGBA16I,
        {
            name: 'RGBA16I',
            size: 8,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_RGBA32I,
        {
            name: 'RGBA32I',
            size: 16,
            isInt: true,
        },
    ],
    [
        PIXELFORMAT_R8U,
        {
            name: 'R8U',
            size: 1,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_R16U,
        {
            name: 'R16U',
            size: 2,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_R32U,
        {
            name: 'R32U',
            size: 4,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_RG8U,
        {
            name: 'RG8U',
            size: 2,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_RG16U,
        {
            name: 'RG16U',
            size: 4,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_RG32U,
        {
            name: 'RG32U',
            size: 8,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_RGBA8U,
        {
            name: 'RGBA8U',
            size: 4,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_RGBA16U,
        {
            name: 'RGBA16U',
            size: 8,
            isUint: true,
        },
    ],
    [
        PIXELFORMAT_RGBA32U,
        {
            name: 'RGBA32U',
            size: 16,
            isUint: true,
        },
    ],
])
const isCompressedPixelFormat = (format) => {
    return pixelFormatInfo.get(format)?.blockSize !== undefined
}
const isSrgbPixelFormat = (format) => {
    return pixelFormatInfo.get(format)?.srgb === true
}
const isIntegerPixelFormat = (format) => {
    const info = pixelFormatInfo.get(format)
    return info?.isInt === true || info?.isUint === true
}
const GLSL_FLOAT = {
    sampler: 'sampler2D',
    returnType: 'vec4',
}
const GLSL_UINT = {
    sampler: 'usampler2D',
    returnType: 'uvec4',
}
const GLSL_INT = {
    sampler: 'isampler2D',
    returnType: 'ivec4',
}
const WGSL_FLOAT = {
    textureType: 'texture_2d<f32>',
    returnType: 'vec4f',
}
const WGSL_UINT = {
    textureType: 'texture_2d<u32>',
    returnType: 'vec4u',
}
const WGSL_INT = {
    textureType: 'texture_2d<i32>',
    returnType: 'vec4i',
}
const getGlslShaderType = (format) => {
    const info = pixelFormatInfo.get(format)
    if (info?.isUint) return GLSL_UINT
    if (info?.isInt) return GLSL_INT
    return GLSL_FLOAT
}
const getWgslShaderType = (format) => {
    const info = pixelFormatInfo.get(format)
    if (info?.isUint) return WGSL_UINT
    if (info?.isInt) return WGSL_INT
    return WGSL_FLOAT
}
const pixelFormatLinearToGamma = (format) => {
    return pixelFormatInfo.get(format)?.srgbFormat || format
}
const pixelFormatGammaToLinear = (format) => {
    for (const [key, value] of pixelFormatInfo) {
        if (value.srgbFormat === format) {
            return key
        }
    }
    return format
}
const requiresManualGamma = (format) => {
    const info = pixelFormatInfo.get(format)
    return !!(info?.ldr && !info?.srgb)
}
const getPixelFormatArrayType = (format) => {
    switch (format) {
        case PIXELFORMAT_R32F:
        case PIXELFORMAT_RG32F:
        case PIXELFORMAT_RGB32F:
        case PIXELFORMAT_RGBA32F:
            return Float32Array
        case PIXELFORMAT_R32I:
        case PIXELFORMAT_RG32I:
        case PIXELFORMAT_RGBA32I:
            return Int32Array
        case PIXELFORMAT_R32U:
        case PIXELFORMAT_RG32U:
        case PIXELFORMAT_RGBA32U:
        case PIXELFORMAT_RGB9E5:
        case PIXELFORMAT_RGB10A2:
        case PIXELFORMAT_RGB10A2U:
            return Uint32Array
        case PIXELFORMAT_R16I:
        case PIXELFORMAT_RG16I:
        case PIXELFORMAT_RGBA16I:
            return Int16Array
        case PIXELFORMAT_R16U:
        case PIXELFORMAT_RG16U:
        case PIXELFORMAT_RGBA16U:
        case PIXELFORMAT_RGB565:
        case PIXELFORMAT_RGBA5551:
        case PIXELFORMAT_RGBA4:
        case PIXELFORMAT_R16F:
        case PIXELFORMAT_RG16F:
        case PIXELFORMAT_RGB16F:
        case PIXELFORMAT_RGBA16F:
            return Uint16Array
        case PIXELFORMAT_R8I:
        case PIXELFORMAT_RG8I:
        case PIXELFORMAT_RGBA8I:
        case PIXELFORMAT_RG8S:
        case PIXELFORMAT_RGBA8S:
            return Int8Array
        default:
            return Uint8Array
    }
}
const PRIMITIVE_POINTS = 0
const PRIMITIVE_LINES = 1
const PRIMITIVE_LINELOOP = 2
const PRIMITIVE_LINESTRIP = 3
const PRIMITIVE_TRIANGLES = 4
const PRIMITIVE_TRISTRIP = 5
const PRIMITIVE_TRIFAN = 6
const SEMANTIC_POSITION = 'POSITION'
const SEMANTIC_NORMAL = 'NORMAL'
const SEMANTIC_TANGENT = 'TANGENT'
const SEMANTIC_BLENDWEIGHT = 'BLENDWEIGHT'
const SEMANTIC_BLENDINDICES = 'BLENDINDICES'
const SEMANTIC_COLOR = 'COLOR'
const SEMANTIC_TEXCOORD = 'TEXCOORD'
const SEMANTIC_TEXCOORD0 = 'TEXCOORD0'
const SEMANTIC_TEXCOORD1 = 'TEXCOORD1'
const SEMANTIC_TEXCOORD2 = 'TEXCOORD2'
const SEMANTIC_TEXCOORD3 = 'TEXCOORD3'
const SEMANTIC_TEXCOORD4 = 'TEXCOORD4'
const SEMANTIC_TEXCOORD5 = 'TEXCOORD5'
const SEMANTIC_TEXCOORD6 = 'TEXCOORD6'
const SEMANTIC_TEXCOORD7 = 'TEXCOORD7'
const SEMANTIC_ATTR0 = 'ATTR0'
const SEMANTIC_ATTR1 = 'ATTR1'
const SEMANTIC_ATTR2 = 'ATTR2'
const SEMANTIC_ATTR3 = 'ATTR3'
const SEMANTIC_ATTR4 = 'ATTR4'
const SEMANTIC_ATTR5 = 'ATTR5'
const SEMANTIC_ATTR6 = 'ATTR6'
const SEMANTIC_ATTR7 = 'ATTR7'
const SEMANTIC_ATTR8 = 'ATTR8'
const SEMANTIC_ATTR9 = 'ATTR9'
const SEMANTIC_ATTR10 = 'ATTR10'
const SEMANTIC_ATTR11 = 'ATTR11'
const SEMANTIC_ATTR12 = 'ATTR12'
const SEMANTIC_ATTR13 = 'ATTR13'
const SEMANTIC_ATTR14 = 'ATTR14'
const SEMANTIC_ATTR15 = 'ATTR15'
const SHADERTAG_MATERIAL = 1
const STENCILOP_KEEP = 0
const TEXTURELOCK_NONE = 0
const TEXTURELOCK_READ = 1
const TEXTURELOCK_WRITE = 2
const TEXTURETYPE_DEFAULT = 'default'
const TEXTURETYPE_RGBM = 'rgbm'
const TEXTURETYPE_RGBE = 'rgbe'
const TEXTURETYPE_RGBP = 'rgbp'
const TEXTURETYPE_SWIZZLEGGGR = 'swizzleGGGR'
const TEXTUREDIMENSION_1D = '1d'
const TEXTUREDIMENSION_2D = '2d'
const TEXTUREDIMENSION_2D_ARRAY = '2d-array'
const TEXTUREDIMENSION_CUBE = 'cube'
const TEXTUREDIMENSION_CUBE_ARRAY = 'cube-array'
const TEXTUREDIMENSION_3D = '3d'
const SAMPLETYPE_FLOAT = 0
const SAMPLETYPE_UNFILTERABLE_FLOAT = 1
const SAMPLETYPE_DEPTH = 2
const SAMPLETYPE_INT = 3
const SAMPLETYPE_UINT = 4
const TEXTUREPROJECTION_NONE = 'none'
const TEXTUREPROJECTION_CUBE = 'cube'
const TEXTUREPROJECTION_EQUIRECT = 'equirect'
const TEXTUREPROJECTION_OCTAHEDRAL = 'octahedral'
const SHADERLANGUAGE_GLSL = 'glsl'
const SHADERLANGUAGE_WGSL = 'wgsl'
const TYPE_INT8 = 0
const TYPE_UINT8 = 1
const TYPE_INT16 = 2
const TYPE_UINT16 = 3
const TYPE_INT32 = 4
const TYPE_UINT32 = 5
const TYPE_FLOAT32 = 6
const TYPE_FLOAT16 = 7
const UNIFORMTYPE_BOOL = 0
const UNIFORMTYPE_INT = 1
const UNIFORMTYPE_FLOAT = 2
const UNIFORMTYPE_VEC2 = 3
const UNIFORMTYPE_VEC3 = 4
const UNIFORMTYPE_VEC4 = 5
const UNIFORMTYPE_IVEC2 = 6
const UNIFORMTYPE_IVEC3 = 7
const UNIFORMTYPE_IVEC4 = 8
const UNIFORMTYPE_BVEC2 = 9
const UNIFORMTYPE_BVEC3 = 10
const UNIFORMTYPE_BVEC4 = 11
const UNIFORMTYPE_MAT2 = 12
const UNIFORMTYPE_MAT3 = 13
const UNIFORMTYPE_MAT4 = 14
const UNIFORMTYPE_TEXTURE2D = 15
const UNIFORMTYPE_TEXTURECUBE = 16
const UNIFORMTYPE_FLOATARRAY = 17
const UNIFORMTYPE_TEXTURE2D_SHADOW = 18
const UNIFORMTYPE_TEXTURECUBE_SHADOW = 19
const UNIFORMTYPE_TEXTURE3D = 20
const UNIFORMTYPE_VEC2ARRAY = 21
const UNIFORMTYPE_VEC3ARRAY = 22
const UNIFORMTYPE_VEC4ARRAY = 23
const UNIFORMTYPE_MAT4ARRAY = 24
const UNIFORMTYPE_TEXTURE2D_ARRAY = 25
const UNIFORMTYPE_UINT = 26
const UNIFORMTYPE_UVEC2 = 27
const UNIFORMTYPE_UVEC3 = 28
const UNIFORMTYPE_UVEC4 = 29
const UNIFORMTYPE_INTARRAY = 30
const UNIFORMTYPE_UINTARRAY = 31
const UNIFORMTYPE_BOOLARRAY = 32
const UNIFORMTYPE_IVEC2ARRAY = 33
const UNIFORMTYPE_UVEC2ARRAY = 34
const UNIFORMTYPE_BVEC2ARRAY = 35
const UNIFORMTYPE_IVEC3ARRAY = 36
const UNIFORMTYPE_UVEC3ARRAY = 37
const UNIFORMTYPE_BVEC3ARRAY = 38
const UNIFORMTYPE_IVEC4ARRAY = 39
const UNIFORMTYPE_UVEC4ARRAY = 40
const UNIFORMTYPE_BVEC4ARRAY = 41
const UNIFORMTYPE_ITEXTURE2D = 42
const UNIFORMTYPE_UTEXTURE2D = 43
const UNIFORMTYPE_ITEXTURECUBE = 44
const UNIFORMTYPE_UTEXTURECUBE = 45
const UNIFORMTYPE_ITEXTURE3D = 46
const UNIFORMTYPE_UTEXTURE3D = 47
const UNIFORMTYPE_ITEXTURE2D_ARRAY = 48
const UNIFORMTYPE_UTEXTURE2D_ARRAY = 49
const uniformTypeToName = [
    'bool',
    'int',
    'float',
    'vec2',
    'vec3',
    'vec4',
    'ivec2',
    'ivec3',
    'ivec4',
    'bvec2',
    'bvec3',
    'bvec4',
    'mat2',
    'mat3',
    'mat4',
    'sampler2D',
    'samplerCube',
    '',
    'sampler2DShadow',
    'samplerCubeShadow',
    'sampler3D',
    '',
    '',
    '',
    '',
    'sampler2DArray',
    'uint',
    'uvec2',
    'uvec3',
    'uvec4',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    'isampler2D',
    'usampler2D',
    'isamplerCube',
    'usamplerCube',
    'isampler3D',
    'usampler3D',
    'isampler2DArray',
    'usampler2DArray',
]
const uniformTypeToNameWGSL = [
    ['bool'],
    ['i32'],
    ['f32'],
    ['vec2f', 'vec2<f32>'],
    ['vec3f', 'vec3<f32>'],
    ['vec4f', 'vec4<f32>'],
    ['vec2i', 'vec2<i32>'],
    ['vec3i', 'vec3<i32>'],
    ['vec4i', 'vec4<i32>'],
    ['vec2<bool>'],
    ['vec3<bool>'],
    ['vec4<bool>'],
    ['mat2x2f', 'mat2x2<f32>'],
    ['mat3x3f', 'mat3x3<f32>'],
    ['mat4x4f', 'mat4x4<f32>'],
    ['texture_2d<f32>'],
    ['texture_cube<f32>'],
    ['array<f32>'],
    ['texture_depth_2d'],
    ['texture_depth_cube'],
    ['texture_3d<f32>'],
    ['array<vec2<f32>>'],
    ['array<vec3<f32>>'],
    ['array<vec4<f32>>'],
    ['array<mat4x4<f32>>'],
    ['texture_2d_array<f32>'],
    ['u32'],
    ['vec2u', 'vec2<u32>'],
    ['vec3u', 'vec3<u32>'],
    ['vec4u', 'vec4<u32>'],
    ['array<i32>'],
    ['array<u32>'],
    ['array<bool>'],
    ['array<vec2i>', 'array<vec2<i32>>'],
    ['array<vec2u>', 'array<vec2<u32>>'],
    ['array<vec2b>', 'array<vec2<bool>>'],
    ['array<vec3i>', 'array<vec3<i32>>'],
    ['array<vec3u>', 'array<vec3<u32>>'],
    ['array<vec3b>', 'array<vec3<bool>>'],
    ['array<vec4i>', 'array<vec4<i32>>'],
    ['array<vec4u>', 'array<vec4<u32>>'],
    ['array<vec4b>', 'array<vec4<bool>>'],
    ['texture_2d<i32>'],
    ['texture_2d<u32>'],
    ['texture_cube<i32>'],
    ['texture_cube<u32>'],
    ['texture_3d<i32>'],
    ['texture_3d<u32>'],
    ['texture_2d_array<i32>'],
    ['texture_2d_array<u32>'],
]
const uniformTypeToNameMapWGSL = new Map()
uniformTypeToNameWGSL.forEach((names, index) => {
    names.forEach((name) => uniformTypeToNameMapWGSL.set(name, index))
})
const DEVICETYPE_WEBGL2 = 'webgl2'
const DEVICETYPE_WEBGPU = 'webgpu'
const DEVICETYPE_NULL = 'null'
const SHADERSTAGE_VERTEX = 1
const SHADERSTAGE_FRAGMENT = 2
const SHADERSTAGE_COMPUTE = 4
const DISPLAYFORMAT_LDR = 'ldr'
const DISPLAYFORMAT_LDR_SRGB = 'ldr_srgb'
const DISPLAYFORMAT_HDR = 'hdr'
const TEXPROPERTY_MIN_FILTER = 1
const TEXPROPERTY_MAG_FILTER = 2
const TEXPROPERTY_ADDRESS_U = 4
const TEXPROPERTY_ADDRESS_V = 8
const TEXPROPERTY_ADDRESS_W = 16
const TEXPROPERTY_COMPARE_ON_READ = 32
const TEXPROPERTY_COMPARE_FUNC = 64
const TEXPROPERTY_ANISOTROPY = 128
const TEXPROPERTY_ALL = 255
const BINDGROUP_VIEW = 0
const BINDGROUP_MESH = 1
const BINDGROUP_MESH_UB = 2
const bindGroupNames = ['view', 'mesh', 'mesh_ub']
const UNIFORM_BUFFER_DEFAULT_SLOT_NAME = 'default'
const UNUSED_UNIFORM_NAME = '_unused_float_uniform'
const typedArrayTypes = [
    Int8Array,
    Uint8Array,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Uint16Array,
]
const typedArrayTypesByteSize = [1, 1, 2, 2, 4, 4, 4, 2]
const typedArrayIndexFormats = [Uint8Array, Uint16Array, Uint32Array]
const typedArrayIndexFormatsByteSize = [1, 2, 4]
const primitiveGlslToWgslTypeMap = new Map([
    ['float', 'f32'],
    ['vec2', 'vec2f'],
    ['vec3', 'vec3f'],
    ['vec4', 'vec4f'],
    ['int', 'i32'],
    ['ivec2', 'vec2i'],
    ['ivec3', 'vec3i'],
    ['ivec4', 'vec4i'],
    ['uint', 'u32'],
    ['uvec2', 'vec2u'],
    ['uvec3', 'vec3u'],
    ['uvec4', 'vec4u'],
])
const semanticToLocation = {}
semanticToLocation[SEMANTIC_POSITION] = 0
semanticToLocation[SEMANTIC_NORMAL] = 1
semanticToLocation[SEMANTIC_BLENDWEIGHT] = 2
semanticToLocation[SEMANTIC_BLENDINDICES] = 3
semanticToLocation[SEMANTIC_COLOR] = 4
semanticToLocation[SEMANTIC_TEXCOORD0] = 5
semanticToLocation[SEMANTIC_TEXCOORD1] = 6
semanticToLocation[SEMANTIC_TEXCOORD2] = 7
semanticToLocation[SEMANTIC_TEXCOORD3] = 8
semanticToLocation[SEMANTIC_TEXCOORD4] = 9
semanticToLocation[SEMANTIC_TEXCOORD5] = 10
semanticToLocation[SEMANTIC_TEXCOORD6] = 11
semanticToLocation[SEMANTIC_TEXCOORD7] = 12
semanticToLocation[SEMANTIC_TANGENT] = 13
semanticToLocation[SEMANTIC_ATTR0] = 0
semanticToLocation[SEMANTIC_ATTR1] = 1
semanticToLocation[SEMANTIC_ATTR2] = 2
semanticToLocation[SEMANTIC_ATTR3] = 3
semanticToLocation[SEMANTIC_ATTR4] = 4
semanticToLocation[SEMANTIC_ATTR5] = 5
semanticToLocation[SEMANTIC_ATTR6] = 6
semanticToLocation[SEMANTIC_ATTR7] = 7
semanticToLocation[SEMANTIC_ATTR8] = 8
semanticToLocation[SEMANTIC_ATTR9] = 9
semanticToLocation[SEMANTIC_ATTR10] = 10
semanticToLocation[SEMANTIC_ATTR11] = 11
semanticToLocation[SEMANTIC_ATTR12] = 12
semanticToLocation[SEMANTIC_ATTR13] = 13
semanticToLocation[SEMANTIC_ATTR14] = 14
semanticToLocation[SEMANTIC_ATTR15] = 15

let id$c = 0
class BindBaseFormat {
    constructor(name, visibility) {
        this.slot = -1
        this.scopeId = null
        this.name = name
        this.visibility = visibility
    }
}
class BindUniformBufferFormat extends BindBaseFormat {}
class BindStorageBufferFormat extends BindBaseFormat {
    constructor(name, visibility, readOnly = false) {
        ;(super(name, visibility), (this.format = ''))
        this.readOnly = readOnly
    }
}
class BindTextureFormat extends BindBaseFormat {
    constructor(
        name,
        visibility,
        textureDimension = TEXTUREDIMENSION_2D,
        sampleType = SAMPLETYPE_FLOAT,
        hasSampler = true,
        samplerName = null,
    ) {
        super(name, visibility)
        this.textureDimension = textureDimension
        this.sampleType = sampleType
        this.hasSampler = hasSampler
        this.samplerName = samplerName ?? `${name}_sampler`
    }
}
class BindStorageTextureFormat extends BindBaseFormat {
    constructor(name, format = PIXELFORMAT_RGBA8, textureDimension = TEXTUREDIMENSION_2D, write = true, read = false) {
        super(name, SHADERSTAGE_COMPUTE)
        this.format = format
        this.textureDimension = textureDimension
        this.write = write
        this.read = read
    }
}
class BindGroupFormat {
    destroy() {
        this.impl.destroy()
    }
    getTexture(name) {
        const index = this.textureFormatsMap.get(name)
        if (index !== undefined) {
            return this.textureFormats[index]
        }
        return null
    }
    getStorageTexture(name) {
        const index = this.storageTextureFormatsMap.get(name)
        if (index !== undefined) {
            return this.storageTextureFormats[index]
        }
        return null
    }
    loseContext() {}
    constructor(graphicsDevice, formats) {
        this.uniformBufferFormats = []
        this.textureFormats = []
        this.storageTextureFormats = []
        this.storageBufferFormats = []
        this.id = id$c++
        let slot = 0
        formats.forEach((format) => {
            format.slot = slot++
            if (format instanceof BindTextureFormat && format.hasSampler) {
                slot++
            }
            if (format instanceof BindUniformBufferFormat) {
                this.uniformBufferFormats.push(format)
            } else if (format instanceof BindTextureFormat) {
                this.textureFormats.push(format)
            } else if (format instanceof BindStorageTextureFormat) {
                this.storageTextureFormats.push(format)
            } else if (format instanceof BindStorageBufferFormat) {
                this.storageBufferFormats.push(format)
            } else;
        })
        this.device = graphicsDevice
        const scope = graphicsDevice.scope
        this.bufferFormatsMap = new Map()
        this.uniformBufferFormats.forEach((bf, i) => this.bufferFormatsMap.set(bf.name, i))
        this.textureFormatsMap = new Map()
        this.textureFormats.forEach((tf, i) => {
            this.textureFormatsMap.set(tf.name, i)
            tf.scopeId = scope.resolve(tf.name)
        })
        this.storageTextureFormatsMap = new Map()
        this.storageTextureFormats.forEach((tf, i) => {
            this.storageTextureFormatsMap.set(tf.name, i)
            tf.scopeId = scope.resolve(tf.name)
        })
        this.storageBufferFormatsMap = new Map()
        this.storageBufferFormats.forEach((bf, i) => {
            this.storageBufferFormatsMap.set(bf.name, i)
            bf.scopeId = scope.resolve(bf.name)
        })
        this.impl = graphicsDevice.createBindGroupFormatImpl(this)
    }
}

class DeviceCache {
    get(device, onCreate) {
        if (!this._cache.has(device)) {
            this._cache.set(device, onCreate())
            device.on('destroy', () => {
                this.remove(device)
            })
            device.on('devicelost', () => {
                this._cache.get(device)?.loseContext?.(device)
            })
        }
        return this._cache.get(device)
    }
    remove(device) {
        this._cache.get(device)?.destroy?.(device)
        this._cache.delete(device)
    }
    constructor() {
        this._cache = new Map()
    }
}

class TextureUtils {
    static calcLevelDimension(dimension, mipLevel) {
        return Math.max(dimension >> mipLevel, 1)
    }
    static calcMipLevelsCount(width, height, depth = 1) {
        return 1 + Math.floor(Math.log2(Math.max(width, height, depth)))
    }
    static calcLevelGpuSize(width, height, depth, format) {
        const formatInfo = pixelFormatInfo.get(format)
        const pixelSize = pixelFormatInfo.get(format)?.size ?? 0
        if (pixelSize > 0) {
            return width * height * depth * pixelSize
        }
        const blockSize = formatInfo.blockSize ?? 0
        let blockWidth = Math.floor((width + 3) / 4)
        const blockHeight = Math.floor((height + 3) / 4)
        const blockDepth = Math.floor((depth + 3) / 4)
        if (format === PIXELFORMAT_PVRTC_2BPP_RGB_1 || format === PIXELFORMAT_PVRTC_2BPP_RGBA_1) {
            blockWidth = Math.max(Math.floor(blockWidth / 2), 1)
        }
        return blockWidth * blockHeight * blockDepth * blockSize
    }
    static calcGpuSize(width, height, depth, format, mipmaps, cubemap) {
        let result = 0
        while (1) {
            result += TextureUtils.calcLevelGpuSize(width, height, depth, format)
            if (!mipmaps || (width === 1 && height === 1 && depth === 1)) {
                break
            }
            width = Math.max(width >> 1, 1)
            height = Math.max(height >> 1, 1)
            depth = Math.max(depth >> 1, 1)
        }
        return result * (cubemap ? 6 : 1)
    }
    static calcTextureSize(count, result, widthMultiple = 1) {
        let width = Math.ceil(Math.sqrt(count))
        if (widthMultiple > 1) {
            width = math.roundUp(width, widthMultiple)
        }
        return result.set(width, Math.ceil(count / width))
    }
}

class StringIds {
    get(name) {
        let value = this.map.get(name)
        if (value === undefined) {
            value = this.id++
            this.map.set(name, value)
        }
        return value
    }
    constructor() {
        this.map = new Map()
        this.id = 0
    }
}

const stringIds$5 = new StringIds()
class TextureView {
    constructor(texture, baseMipLevel = 0, mipLevelCount = 1, baseArrayLayer = 0, arrayLayerCount = 1) {
        this.texture = texture
        this.baseMipLevel = baseMipLevel
        this.mipLevelCount = mipLevelCount
        this.baseArrayLayer = baseArrayLayer
        this.arrayLayerCount = arrayLayerCount
        this.key = stringIds$5.get(`${baseMipLevel}:${mipLevelCount}:${baseArrayLayer}:${arrayLayerCount}`)
    }
}

let id$b = 0
class Texture {
    static createDataTexture2D(graphicsDevice, name, width, height, format, levels) {
        return new Texture(graphicsDevice, {
            name,
            width,
            height,
            format,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            levels,
        })
    }
    destroy() {
        const device = this.device
        if (device) {
            device.onTextureDestroyed(this)
            this.impl.destroy(device)
            this.adjustVramSizeTracking(device._vram, -this._gpuSize)
            this._levels = null
            this.device = null
        }
    }
    recreateImpl(upload = true) {
        const { device } = this
        this.impl?.destroy(device)
        this.impl = null
        this.impl = device.createTextureImpl(this)
        this.dirtyAll()
        if (upload) {
            this.upload()
        }
    }
    _clearLevels() {
        this._levels = this._cubemap ? [[null, null, null, null, null, null]] : [null]
    }
    resize(width, height, depth = 1) {
        if (this.width !== width || this.height !== height || this.depth !== depth) {
            const device = this.device
            this.adjustVramSizeTracking(device._vram, -this._gpuSize)
            this._gpuSize = 0
            this.impl.destroy(device)
            this._clearLevels()
            this._width = Math.floor(width)
            this._height = Math.floor(height)
            this._depth = Math.floor(depth)
            this._updateNumLevels()
            this.impl = device.createTextureImpl(this)
            this.dirtyAll()
        }
    }
    loseContext() {
        this.impl.loseContext()
        this.dirtyAll()
    }
    adjustVramSizeTracking(vram, size) {
        vram.tex += size
    }
    propertyChanged(flag) {
        this.impl.propertyChanged(flag)
        this.renderVersionDirty = this.device.renderVersion
    }
    _updateNumLevels() {
        const maxLevels = this.mipmaps ? TextureUtils.calcMipLevelsCount(this.width, this.height) : 1
        const requestedLevels = this._numLevelsRequested
        this._numLevels = Math.min(requestedLevels ?? maxLevels, maxLevels)
        this._mipmaps = this._numLevels > 1
    }
    get lockedMode() {
        return this._lockedMode
    }
    set minFilter(v) {
        if (this._minFilter !== v) {
            if (isIntegerPixelFormat(this._format));
            else {
                this._minFilter = v
                this.propertyChanged(TEXPROPERTY_MIN_FILTER)
            }
        }
    }
    get minFilter() {
        return this._minFilter
    }
    set magFilter(v) {
        if (this._magFilter !== v) {
            if (isIntegerPixelFormat(this._format));
            else {
                this._magFilter = v
                this.propertyChanged(TEXPROPERTY_MAG_FILTER)
            }
        }
    }
    get magFilter() {
        return this._magFilter
    }
    set addressU(v) {
        if (this._addressU !== v) {
            this._addressU = v
            this.propertyChanged(TEXPROPERTY_ADDRESS_U)
        }
    }
    get addressU() {
        return this._addressU
    }
    set addressV(v) {
        if (this._addressV !== v) {
            this._addressV = v
            this.propertyChanged(TEXPROPERTY_ADDRESS_V)
        }
    }
    get addressV() {
        return this._addressV
    }
    set addressW(addressW) {
        if (!this._volume) {
            return
        }
        if (addressW !== this._addressW) {
            this._addressW = addressW
            this.propertyChanged(TEXPROPERTY_ADDRESS_W)
        }
    }
    get addressW() {
        return this._addressW
    }
    set compareOnRead(v) {
        if (this._compareOnRead !== v) {
            this._compareOnRead = v
            this.propertyChanged(TEXPROPERTY_COMPARE_ON_READ)
        }
    }
    get compareOnRead() {
        return this._compareOnRead
    }
    set compareFunc(v) {
        if (this._compareFunc !== v) {
            this._compareFunc = v
            this.propertyChanged(TEXPROPERTY_COMPARE_FUNC)
        }
    }
    get compareFunc() {
        return this._compareFunc
    }
    set anisotropy(v) {
        if (this._anisotropy !== v) {
            this._anisotropy = v
            this.propertyChanged(TEXPROPERTY_ANISOTROPY)
        }
    }
    get anisotropy() {
        return this._anisotropy
    }
    set mipmaps(v) {
        if (this._mipmaps !== v) {
            if (this.device.isWebGPU);
            else if (isIntegerPixelFormat(this._format));
            else {
                const oldMipmaps = this._mipmaps
                const oldNumLevels = this._numLevels
                this._mipmaps = v
                this._updateNumLevels()
                if (this.array && this._numLevels !== oldNumLevels) {
                    this.recreateImpl()
                } else if (this._mipmaps !== oldMipmaps) {
                    this.propertyChanged(TEXPROPERTY_MIN_FILTER)
                    if (this._mipmaps) {
                        this._needsMipmapsUpload = true
                        this.device?.texturesToUpload?.add(this)
                    } else {
                        this._needsMipmapsUpload = false
                    }
                }
            }
        }
    }
    get mipmaps() {
        return this._mipmaps
    }
    get numLevels() {
        return this._numLevels
    }
    get storage() {
        return this._storage
    }
    get width() {
        return this._width
    }
    get height() {
        return this._height
    }
    get depth() {
        return this._depth
    }
    get format() {
        return this._format
    }
    get cubemap() {
        return this._cubemap
    }
    get gpuSize() {
        const mips = this.pot && this._mipmaps && !(this._compressed && this._levels.length === 1)
        return TextureUtils.calcGpuSize(this._width, this._height, this._depth, this._format, mips, this._cubemap)
    }
    get array() {
        return this._arrayLength > 0
    }
    get arrayLength() {
        return this._arrayLength
    }
    get volume() {
        return this._volume
    }
    set type(value) {
        if (this._type !== value) {
            this._type = value
            this.device._shadersDirty = true
        }
    }
    get type() {
        return this._type
    }
    set srgb(value) {
        const currentSrgb = isSrgbPixelFormat(this.format)
        if (value !== currentSrgb) {
            if (value) {
                const srgbFormat = pixelFormatLinearToGamma(this.format)
                if (this._format !== srgbFormat) {
                    this._format = srgbFormat
                    this.recreateImpl()
                    this.device._shadersDirty = true
                }
            } else {
                const linearFormat = pixelFormatGammaToLinear(this.format)
                if (this._format !== linearFormat) {
                    this._format = linearFormat
                    this.recreateImpl()
                    this.device._shadersDirty = true
                }
            }
        }
    }
    get srgb() {
        return isSrgbPixelFormat(this.format)
    }
    set flipY(flipY) {
        if (this._flipY !== flipY) {
            this._flipY = flipY
            this.markForUpload()
        }
    }
    get flipY() {
        return this._flipY
    }
    set premultiplyAlpha(premultiplyAlpha) {
        if (this._premultiplyAlpha !== premultiplyAlpha) {
            this._premultiplyAlpha = premultiplyAlpha
            this.markForUpload()
        }
    }
    get premultiplyAlpha() {
        return this._premultiplyAlpha
    }
    get pot() {
        return math.powerOfTwo(this._width) && math.powerOfTwo(this._height)
    }
    get encoding() {
        switch (this.type) {
            case TEXTURETYPE_RGBM:
                return 'rgbm'
            case TEXTURETYPE_RGBE:
                return 'rgbe'
            case TEXTURETYPE_RGBP:
                return 'rgbp'
        }
        return requiresManualGamma(this.format) ? 'srgb' : 'linear'
    }
    dirtyAll() {
        this._levelsUpdated = this._cubemap ? [[true, true, true, true, true, true]] : [true]
        this.markForUpload()
        this._needsMipmapsUpload = this._mipmaps
        this._mipmapsUploaded = false
        this.propertyChanged(TEXPROPERTY_ALL)
    }
    lock(options = {}) {
        var _options, _options1, _options2
        ;(_options = options).level ?? (_options.level = 0)
        ;(_options1 = options).face ?? (_options1.face = 0)
        ;(_options2 = options).mode ?? (_options2.mode = TEXTURELOCK_WRITE)
        this._lockedMode = options.mode
        this._lockedLevel = options.level
        const levels = this.cubemap ? this._levels[options.face] : this._levels
        if (levels[options.level] === null) {
            const width = Math.max(1, this._width >> options.level)
            const height = Math.max(1, this._height >> options.level)
            const depth = Math.max(1, this._depth >> options.level)
            const data = new ArrayBuffer(TextureUtils.calcLevelGpuSize(width, height, depth, this._format))
            levels[options.level] = new (getPixelFormatArrayType(this._format))(data)
        }
        return levels[options.level]
    }
    setSource(source, mipLevel = 0) {
        let invalid = false
        let width, height
        if (this._cubemap) {
            if (source[0]) {
                width = source[0].width || 0
                height = source[0].height || 0
                for (let i = 0; i < 6; i++) {
                    const face = source[i]
                    if (
                        !face ||
                        face.width !== width ||
                        face.height !== height ||
                        !this.device._isBrowserInterface(face)
                    ) {
                        invalid = true
                        break
                    }
                }
            } else {
                invalid = true
            }
            if (!invalid) {
                for (let i = 0; i < 6; i++) {
                    if (this._levels[mipLevel][i] !== source[i]) {
                        this._levelsUpdated[mipLevel][i] = true
                    }
                }
            }
        } else {
            if (!this.device._isBrowserInterface(source)) {
                invalid = true
            }
            if (!invalid) {
                if (source !== this._levels[mipLevel]) {
                    this._levelsUpdated[mipLevel] = true
                }
                if (source instanceof HTMLVideoElement) {
                    width = source.videoWidth
                    height = source.videoHeight
                } else {
                    width = source.width
                    height = source.height
                }
            }
        }
        if (invalid) {
            this._width = 4
            this._height = 4
            if (this._cubemap) {
                for (let i = 0; i < 6; i++) {
                    this._levels[mipLevel][i] = null
                    this._levelsUpdated[mipLevel][i] = true
                }
            } else {
                this._levels[mipLevel] = null
                this._levelsUpdated[mipLevel] = true
            }
        } else {
            if (mipLevel === 0) {
                this._width = width
                this._height = height
            }
            this._levels[mipLevel] = source
        }
        if (this._invalid !== invalid || !invalid) {
            this._invalid = invalid
            this.upload()
        }
    }
    getSource(mipLevel = 0) {
        return this._levels[mipLevel]
    }
    unlock() {
        if (this._lockedMode === TEXTURELOCK_NONE);
        if (this._lockedMode === TEXTURELOCK_WRITE) {
            this.upload()
        }
        this._lockedLevel = -1
        this._lockedMode = TEXTURELOCK_NONE
    }
    markForUpload() {
        this._needsUpload = true
        this.device?.texturesToUpload?.add(this)
    }
    upload() {
        this.markForUpload()
        this._needsMipmapsUpload = this._mipmaps
        this.impl.uploadImmediate?.(this.device, this)
    }
    read(x, y, width, height, options = {}) {
        return this.impl.read?.(x, y, width, height, options)
    }
    write(x, y, width, height, data) {
        return this.impl.write?.(x, y, width, height, data)
    }
    getView(baseMipLevel = 0, mipLevelCount = 1, baseArrayLayer = 0, arrayLayerCount = 1) {
        return new TextureView(this, baseMipLevel, mipLevelCount, baseArrayLayer, arrayLayerCount)
    }
    constructor(graphicsDevice, options = {}) {
        this._gpuSize = 0
        this.id = id$b++
        this._invalid = false
        this._lockedLevel = -1
        this._lockedMode = TEXTURELOCK_NONE
        this.renderVersionDirty = 0
        this._storage = false
        this._numLevels = 0
        this.device = graphicsDevice
        this.name = options.name ?? ''
        this._width = Math.floor(options.width ?? 4)
        this._height = Math.floor(options.height ?? 4)
        this._format = options.format ?? PIXELFORMAT_RGBA8
        this._compressed = isCompressedPixelFormat(this._format)
        this._integerFormat = isIntegerPixelFormat(this._format)
        if (this._integerFormat) {
            options.minFilter = FILTER_NEAREST
            options.magFilter = FILTER_NEAREST
        }
        this._volume = options.volume ?? false
        this._depth = Math.floor(options.depth ?? 1)
        this._arrayLength = Math.floor(options.arrayLength ?? 0)
        this._storage = options.storage ?? false
        this._cubemap = options.cubemap ?? false
        this._flipY = options.flipY ?? false
        this._premultiplyAlpha = options.premultiplyAlpha ?? false
        this._mipmaps = options.mipmaps ?? true
        this._numLevelsRequested = options.numLevels
        if (options.numLevels !== undefined) {
            this._numLevels = options.numLevels
        }
        this._updateNumLevels()
        this._minFilter = options.minFilter ?? FILTER_LINEAR_MIPMAP_LINEAR
        this._magFilter = options.magFilter ?? FILTER_LINEAR
        this._anisotropy = options.anisotropy ?? 1
        this._addressU = options.addressU ?? ADDRESS_REPEAT
        this._addressV = options.addressV ?? ADDRESS_REPEAT
        this._addressW = options.addressW ?? ADDRESS_REPEAT
        this._compareOnRead = options.compareOnRead ?? false
        this._compareFunc = options.compareFunc ?? FUNC_LESS
        this._type = options.type ?? TEXTURETYPE_DEFAULT
        this.projection = TEXTUREPROJECTION_NONE
        if (this._cubemap) {
            this.projection = TEXTUREPROJECTION_CUBE
        } else if (options.projection && options.projection !== TEXTUREPROJECTION_CUBE) {
            this.projection = options.projection
        }
        this._levels = options.levels
        const upload = !!options.levels
        if (!this._levels) {
            this._clearLevels()
        }
        this.recreateImpl(upload)
    }
}

const textureData = {
    white: [255, 255, 255, 255],
    gray: [128, 128, 128, 255],
    black: [0, 0, 0, 255],
    normal: [128, 128, 255, 255],
    pink: [255, 128, 255, 255],
}
class BuiltInTextures {
    destroy() {
        this.map.forEach((texture) => {
            texture.destroy()
        })
    }
    constructor() {
        this.map = new Map()
    }
}
const deviceCache$3 = new DeviceCache()
const getBuiltInTexture = (device, name) => {
    const cache = deviceCache$3.get(device, () => {
        return new BuiltInTextures()
    })
    if (!cache.map.has(name)) {
        const texture = new Texture(device, {
            name: `built-in-texture-${name}`,
            width: 1,
            height: 1,
            format: PIXELFORMAT_RGBA8,
        })
        const pixels = texture.lock()
        const data = textureData[name]
        pixels.set(data)
        texture.unlock()
        cache.map.set(name, texture)
    }
    return cache.map.get(name)
}

let id$a = 0
class DynamicBindGroup {
    constructor() {
        this.offsets = []
    }
}
class BindGroup {
    destroy() {
        this.impl.destroy()
        this.impl = null
        this.format = null
        this.defaultUniformBuffer = null
    }
    setUniformBuffer(name, uniformBuffer) {
        const index = this.format.bufferFormatsMap.get(name)
        if (this.uniformBuffers[index] !== uniformBuffer) {
            this.uniformBuffers[index] = uniformBuffer
            this.dirty = true
        }
    }
    setStorageBuffer(name, storageBuffer) {
        const index = this.format.storageBufferFormatsMap.get(name)
        if (this.storageBuffers[index] !== storageBuffer) {
            this.storageBuffers[index] = storageBuffer
            this.dirty = true
        }
    }
    setTexture(name, value) {
        const index = this.format.textureFormatsMap.get(name)
        const texture = value instanceof TextureView ? value.texture : value
        if (this.textures[index] !== value) {
            this.textures[index] = value
            this.dirty = true
        } else if (this.renderVersionUpdated < texture.renderVersionDirty) {
            this.dirty = true
        }
    }
    setStorageTexture(name, value) {
        const index = this.format.storageTextureFormatsMap.get(name)
        const texture = value instanceof TextureView ? value.texture : value
        if (this.storageTextures[index] !== value) {
            this.storageTextures[index] = value
            this.dirty = true
        } else if (this.renderVersionUpdated < texture.renderVersionDirty) {
            this.dirty = true
        }
    }
    updateUniformBuffers() {
        for (let i = 0; i < this.uniformBuffers.length; i++) {
            this.uniformBuffers[i].update()
        }
    }
    update() {
        const { textureFormats, storageTextureFormats, storageBufferFormats } = this.format
        for (let i = 0; i < textureFormats.length; i++) {
            const textureFormat = textureFormats[i]
            let value = textureFormat.scopeId.value
            if (!value) {
                if (textureFormat.name === 'uSceneDepthMap') {
                    value = getBuiltInTexture(this.device, 'white')
                }
                if (textureFormat.name === 'uSceneColorMap') {
                    value = getBuiltInTexture(this.device, 'pink')
                }
                if (!value) {
                    value = getBuiltInTexture(this.device, 'pink')
                }
            }
            this.setTexture(textureFormat.name, value)
        }
        for (let i = 0; i < storageTextureFormats.length; i++) {
            const storageTextureFormat = storageTextureFormats[i]
            const value = storageTextureFormat.scopeId.value
            this.setStorageTexture(storageTextureFormat.name, value)
        }
        for (let i = 0; i < storageBufferFormats.length; i++) {
            const storageBufferFormat = storageBufferFormats[i]
            const value = storageBufferFormat.scopeId.value
            this.setStorageBuffer(storageBufferFormat.name, value)
        }
        this.uniformBufferOffsets.length = this.uniformBuffers.length
        for (let i = 0; i < this.uniformBuffers.length; i++) {
            const uniformBuffer = this.uniformBuffers[i]
            this.uniformBufferOffsets[i] = uniformBuffer.offset
            if (this.renderVersionUpdated < uniformBuffer.renderVersionDirty) {
                this.dirty = true
            }
        }
        if (this.dirty) {
            this.dirty = false
            this.renderVersionUpdated = this.device.renderVersion
            this.impl.update(this)
        }
    }
    constructor(graphicsDevice, format, defaultUniformBuffer) {
        this.renderVersionUpdated = -1
        this.uniformBufferOffsets = []
        this.id = id$a++
        this.device = graphicsDevice
        this.format = format
        this.dirty = true
        this.impl = graphicsDevice.createBindGroupImpl(this)
        this.textures = []
        this.storageTextures = []
        this.storageBuffers = []
        this.uniformBuffers = []
        this.defaultUniformBuffer = defaultUniformBuffer
        if (defaultUniformBuffer) {
            this.setUniformBuffer(UNIFORM_BUFFER_DEFAULT_SLOT_NAME, defaultUniformBuffer)
        }
    }
}

const BitPacking = {
    set(storage, value, shift, mask = 1) {
        const data = storage & ~(mask << shift)
        return data | (value << shift)
    },
    get(storage, shift, mask = 1) {
        return (storage >> shift) & mask
    },
    all(storage, shift, mask = 1) {
        const shifted = mask << shift
        return (storage & shifted) === shifted
    },
    any(storage, shift, mask = 1) {
        return (storage & (mask << shift)) !== 0
    },
}

const opMask = 0b111
const factorMask = 0b1111
const colorOpShift = 0
const colorSrcFactorShift = 3
const colorDstFactorShift = 7
const alphaOpShift = 11
const alphaSrcFactorShift = 14
const alphaDstFactorShift = 18
const redWriteShift = 22
const greenWriteShift = 23
const blueWriteShift = 24
const alphaWriteShift = 25
const blendShift = 26
const allWriteMasks = 0b1111
const allWriteShift = redWriteShift
class BlendState {
    set blend(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, blendShift)
    }
    get blend() {
        return BitPacking.all(this.target0, blendShift)
    }
    setColorBlend(op, srcFactor, dstFactor) {
        this.target0 = BitPacking.set(this.target0, op, colorOpShift, opMask)
        this.target0 = BitPacking.set(this.target0, srcFactor, colorSrcFactorShift, factorMask)
        this.target0 = BitPacking.set(this.target0, dstFactor, colorDstFactorShift, factorMask)
    }
    setAlphaBlend(op, srcFactor, dstFactor) {
        this.target0 = BitPacking.set(this.target0, op, alphaOpShift, opMask)
        this.target0 = BitPacking.set(this.target0, srcFactor, alphaSrcFactorShift, factorMask)
        this.target0 = BitPacking.set(this.target0, dstFactor, alphaDstFactorShift, factorMask)
    }
    setColorWrite(redWrite, greenWrite, blueWrite, alphaWrite) {
        this.redWrite = redWrite
        this.greenWrite = greenWrite
        this.blueWrite = blueWrite
        this.alphaWrite = alphaWrite
    }
    get colorOp() {
        return BitPacking.get(this.target0, colorOpShift, opMask)
    }
    get colorSrcFactor() {
        return BitPacking.get(this.target0, colorSrcFactorShift, factorMask)
    }
    get colorDstFactor() {
        return BitPacking.get(this.target0, colorDstFactorShift, factorMask)
    }
    get alphaOp() {
        return BitPacking.get(this.target0, alphaOpShift, opMask)
    }
    get alphaSrcFactor() {
        return BitPacking.get(this.target0, alphaSrcFactorShift, factorMask)
    }
    get alphaDstFactor() {
        return BitPacking.get(this.target0, alphaDstFactorShift, factorMask)
    }
    set redWrite(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, redWriteShift)
    }
    get redWrite() {
        return BitPacking.all(this.target0, redWriteShift)
    }
    set greenWrite(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, greenWriteShift)
    }
    get greenWrite() {
        return BitPacking.all(this.target0, greenWriteShift)
    }
    set blueWrite(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, blueWriteShift)
    }
    get blueWrite() {
        return BitPacking.all(this.target0, blueWriteShift)
    }
    set alphaWrite(value) {
        this.target0 = BitPacking.set(this.target0, value ? 1 : 0, alphaWriteShift)
    }
    get alphaWrite() {
        return BitPacking.all(this.target0, alphaWriteShift)
    }
    get allWrite() {
        return BitPacking.get(this.target0, allWriteShift, allWriteMasks)
    }
    copy(rhs) {
        this.target0 = rhs.target0
        return this
    }
    clone() {
        const clone = new this.constructor()
        return clone.copy(this)
    }
    get key() {
        return this.target0
    }
    equals(rhs) {
        return this.target0 === rhs.target0
    }
    constructor(
        blend = false,
        colorOp = BLENDEQUATION_ADD,
        colorSrcFactor = BLENDMODE_ONE,
        colorDstFactor = BLENDMODE_ZERO,
        alphaOp,
        alphaSrcFactor,
        alphaDstFactor,
        redWrite = true,
        greenWrite = true,
        blueWrite = true,
        alphaWrite = true,
    ) {
        this.target0 = 0
        this.setColorBlend(colorOp, colorSrcFactor, colorDstFactor)
        this.setAlphaBlend(alphaOp ?? colorOp, alphaSrcFactor ?? colorSrcFactor, alphaDstFactor ?? colorDstFactor)
        this.setColorWrite(redWrite, greenWrite, blueWrite, alphaWrite)
        this.blend = blend
    }
}
BlendState.NOBLEND = Object.freeze(new BlendState())
BlendState.NOWRITE = Object.freeze(
    new BlendState(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        false,
        false,
        false,
    ),
)
BlendState.ALPHABLEND = Object.freeze(
    new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA),
)
BlendState.ADDBLEND = Object.freeze(new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE))

const stringIds$4 = new StringIds()
const funcMask = 0b111
const funcShift = 0
const writeShift = 3
class DepthState {
    set test(value) {
        this.func = value ? FUNC_LESSEQUAL : FUNC_ALWAYS
        this.updateKey()
    }
    get test() {
        return this.func !== FUNC_ALWAYS
    }
    set write(value) {
        this.data = BitPacking.set(this.data, value ? 1 : 0, writeShift)
        this.updateKey()
    }
    get write() {
        return BitPacking.all(this.data, writeShift)
    }
    set func(value) {
        this.data = BitPacking.set(this.data, value, funcShift, funcMask)
        this.updateKey()
    }
    get func() {
        return BitPacking.get(this.data, funcShift, funcMask)
    }
    set depthBias(value) {
        this._depthBias = value
        this.updateKey()
    }
    get depthBias() {
        return this._depthBias
    }
    set depthBiasSlope(value) {
        this._depthBiasSlope = value
        this.updateKey()
    }
    get depthBiasSlope() {
        return this._depthBiasSlope
    }
    copy(rhs) {
        this.data = rhs.data
        this._depthBias = rhs._depthBias
        this._depthBiasSlope = rhs._depthBiasSlope
        this.key = rhs.key
        return this
    }
    clone() {
        const clone = new this.constructor()
        return clone.copy(this)
    }
    updateKey() {
        const { data, _depthBias, _depthBiasSlope } = this
        const key = `${data}-${_depthBias}-${_depthBiasSlope}`
        this.key = stringIds$4.get(key)
    }
    equals(rhs) {
        return this.key === rhs.key
    }
    constructor(func = FUNC_LESSEQUAL, write = true) {
        this.data = 0
        this._depthBias = 0
        this._depthBiasSlope = 0
        this.key = 0
        this.func = func
        this.write = write
    }
}
DepthState.DEFAULT = Object.freeze(new DepthState())
DepthState.NODEPTH = Object.freeze(new DepthState(FUNC_ALWAYS, false))
DepthState.WRITEDEPTH = Object.freeze(new DepthState(FUNC_ALWAYS, true))

let id$9 = 0
class IndexBuffer {
    destroy() {
        const device = this.device
        device.buffers.delete(this)
        if (this.device.indexBuffer === this) {
            this.device.indexBuffer = null
        }
        if (this.impl.initialized) {
            this.impl.destroy(device)
            this.adjustVramSizeTracking(device._vram, -this.storage.byteLength)
        }
    }
    adjustVramSizeTracking(vram, size) {
        vram.ib += size
    }
    loseContext() {
        this.impl.loseContext()
    }
    getFormat() {
        return this.format
    }
    getNumIndices() {
        return this.numIndices
    }
    lock() {
        return this.storage
    }
    unlock() {
        this.impl.unlock(this)
    }
    setData(data) {
        if (data.byteLength !== this.numBytes) {
            return false
        }
        this.storage = data
        this.unlock()
        return true
    }
    _lockTypedArray() {
        const lock = this.lock()
        const indices =
            this.format === INDEXFORMAT_UINT32
                ? new Uint32Array(lock)
                : this.format === INDEXFORMAT_UINT16
                  ? new Uint16Array(lock)
                  : new Uint8Array(lock)
        return indices
    }
    writeData(data, count) {
        const indices = this._lockTypedArray()
        if (data.length > count) {
            if (ArrayBuffer.isView(data)) {
                data = data.subarray(0, count)
                indices.set(data)
            } else {
                for (let i = 0; i < count; i++) {
                    indices[i] = data[i]
                }
            }
        } else {
            indices.set(data)
        }
        this.unlock()
    }
    readData(data) {
        const indices = this._lockTypedArray()
        const count = this.numIndices
        if (ArrayBuffer.isView(data)) {
            data.set(indices)
        } else {
            data.length = 0
            for (let i = 0; i < count; i++) {
                data[i] = indices[i]
            }
        }
        return count
    }
    constructor(graphicsDevice, format, numIndices, usage = BUFFER_STATIC, initialData, options) {
        this.device = graphicsDevice
        this.format = format
        this.numIndices = numIndices
        this.usage = usage
        this.id = id$9++
        this.impl = graphicsDevice.createIndexBufferImpl(this, options)
        const bytesPerIndex = typedArrayIndexFormatsByteSize[format]
        this.bytesPerIndex = bytesPerIndex
        this.numBytes = this.numIndices * bytesPerIndex
        if (initialData) {
            this.setData(initialData)
        } else {
            this.storage = new ArrayBuffer(this.numBytes)
        }
        this.adjustVramSizeTracking(graphicsDevice._vram, this.numBytes)
        this.device.buffers.add(this)
    }
}

class Version {
    equals(other) {
        return this.globalId === other.globalId && this.revision === other.revision
    }
    copy(other) {
        this.globalId = other.globalId
        this.revision = other.revision
    }
    reset() {
        this.globalId = 0
        this.revision = 0
    }
    constructor() {
        this.globalId = 0
        this.revision = 0
    }
}

let idCounter = 0
class VersionedObject {
    increment() {
        this.version.revision++
    }
    constructor() {
        idCounter++
        this.version = new Version()
        this.version.globalId = idCounter
    }
}

class ScopeId {
    toJSON(key) {
        return undefined
    }
    setValue(value) {
        this.value = value
        this.versionObject.increment()
    }
    getValue() {
        return this.value
    }
    constructor(name) {
        this.name = name
        this.value = null
        this.versionObject = new VersionedObject()
    }
}

class ScopeSpace {
    resolve(name) {
        if (!this.variables.has(name)) {
            this.variables.set(name, new ScopeId(name))
        }
        return this.variables.get(name)
    }
    removeValue(value) {
        for (const uniform of this.variables.values()) {
            if (uniform.value === value) {
                uniform.value = null
            }
        }
    }
    constructor(name) {
        this.name = name
        this.variables = new Map()
    }
}

let id$8 = 0
class VertexBuffer {
    destroy() {
        const device = this.device
        device.buffers.delete(this)
        if (this.impl.initialized) {
            this.impl.destroy(device)
            this.adjustVramSizeTracking(device._vram, -this.storage.byteLength)
        }
    }
    adjustVramSizeTracking(vram, size) {
        vram.vb += size
    }
    loseContext() {
        this.impl.loseContext()
    }
    getFormat() {
        return this.format
    }
    getUsage() {
        return this.usage
    }
    getNumVertices() {
        return this.numVertices
    }
    lock() {
        return this.storage
    }
    unlock() {
        this.impl.unlock(this)
    }
    setData(data) {
        if (data.byteLength !== this.numBytes) {
            return false
        }
        this.storage = data
        this.unlock()
        return true
    }
    constructor(graphicsDevice, format, numVertices, options) {
        this.usage = BUFFER_STATIC
        this.usage = options?.usage ?? BUFFER_STATIC
        this.device = graphicsDevice
        this.format = format
        this.numVertices = numVertices
        this.id = id$8++
        this.impl = graphicsDevice.createVertexBufferImpl(this, format, options)
        this.numBytes = format.verticesByteSize ? format.verticesByteSize : format.size * numVertices
        this.adjustVramSizeTracking(graphicsDevice._vram, this.numBytes)
        const initialData = options?.data
        if (initialData) {
            this.setData(initialData)
        } else {
            this.storage = new ArrayBuffer(this.numBytes)
        }
        this.device.buffers.add(this)
    }
}

function hashCode(str) {
    if (str === null || str === undefined) {
        return 0
    }
    let hash = 0
    for (let i = 0, len = str.length; i < len; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i)
        hash |= 0
    }
    return hash
}
function hash32Fnv1a(array) {
    const prime = 16777619
    let hash = 2166136261
    for (let i = 0; i < array.length; i++) {
        hash ^= array[i]
        hash *= prime
    }
    return hash >>> 0
}

const stringIds$3 = new StringIds()
const webgpuValidElementSizes = [2, 4, 8, 12, 16]
const deviceCache$2 = new DeviceCache()
class VertexFormat {
    get elements() {
        return this._elements
    }
    static getDefaultInstancingFormat(graphicsDevice) {
        return deviceCache$2.get(graphicsDevice, () => {
            return new VertexFormat(graphicsDevice, [
                {
                    semantic: SEMANTIC_ATTR11,
                    components: 4,
                    type: TYPE_FLOAT32,
                },
                {
                    semantic: SEMANTIC_ATTR12,
                    components: 4,
                    type: TYPE_FLOAT32,
                },
                {
                    semantic: SEMANTIC_ATTR14,
                    components: 4,
                    type: TYPE_FLOAT32,
                },
                {
                    semantic: SEMANTIC_ATTR15,
                    components: 4,
                    type: TYPE_FLOAT32,
                },
            ])
        })
    }
    static isElementValid(graphicsDevice, elementDesc) {
        const elementSize = elementDesc.components * typedArrayTypesByteSize[elementDesc.type]
        if (graphicsDevice.isWebGPU && !webgpuValidElementSizes.includes(elementSize)) {
            return false
        }
        return true
    }
    update() {
        this._evaluateHash()
    }
    _evaluateHash() {
        const stringElementsBatch = []
        const stringElementsRender = []
        const len = this._elements.length
        for (let i = 0; i < len; i++) {
            const { name, dataType, numComponents, normalize, offset, stride, size, asInt } = this._elements[i]
            const stringElementBatch = name + dataType + numComponents + normalize + asInt
            stringElementsBatch.push(stringElementBatch)
            const stringElementRender = stringElementBatch + offset + stride + size
            stringElementsRender.push(stringElementRender)
        }
        stringElementsBatch.sort()
        const batchingString = stringElementsBatch.join()
        this.batchingHash = hashCode(batchingString)
        this.shaderProcessingHashString = batchingString
        this.renderingHashString = stringElementsRender.join('_')
        this.renderingHash = stringIds$3.get(this.renderingHashString)
    }
    constructor(graphicsDevice, description, vertexCount) {
        this.device = graphicsDevice
        this._elements = []
        this.hasUv0 = false
        this.hasUv1 = false
        this.hasColor = false
        this.hasTangents = false
        this.verticesByteSize = 0
        this.vertexCount = vertexCount
        this.interleaved = vertexCount === undefined
        this.instancing = false
        this.size = description.reduce((total, desc) => {
            return total + Math.ceil((desc.components * typedArrayTypesByteSize[desc.type]) / 4) * 4
        }, 0)
        let offset = 0,
            elementSize
        for (let i = 0, len = description.length; i < len; i++) {
            const elementDesc = description[i]
            elementSize = elementDesc.components * typedArrayTypesByteSize[elementDesc.type]
            if (vertexCount) {
                offset = math.roundUp(offset, elementSize)
            }
            const asInt = elementDesc.asInt ?? false
            const normalize = asInt ? false : (elementDesc.normalize ?? false)
            const element = {
                name: elementDesc.semantic,
                offset: vertexCount ? offset : elementDesc.hasOwnProperty('offset') ? elementDesc.offset : offset,
                stride: vertexCount
                    ? elementSize
                    : elementDesc.hasOwnProperty('stride')
                      ? elementDesc.stride
                      : this.size,
                dataType: elementDesc.type,
                numComponents: elementDesc.components,
                normalize: normalize,
                size: elementSize,
                asInt: asInt,
            }
            this._elements.push(element)
            if (vertexCount) {
                offset += elementSize * vertexCount
            } else {
                offset += Math.ceil(elementSize / 4) * 4
            }
            if (elementDesc.semantic === SEMANTIC_TEXCOORD0) {
                this.hasUv0 = true
            } else if (elementDesc.semantic === SEMANTIC_TEXCOORD1) {
                this.hasUv1 = true
            } else if (elementDesc.semantic === SEMANTIC_COLOR) {
                this.hasColor = true
            } else if (elementDesc.semantic === SEMANTIC_TANGENT) {
                this.hasTangents = true
            }
        }
        if (vertexCount) {
            this.verticesByteSize = offset
        }
        this._evaluateHash()
    }
}

const stringIds$2 = new StringIds()
class StencilParameters {
    set func(value) {
        this._func = value
        this._dirty = true
    }
    get func() {
        return this._func
    }
    set ref(value) {
        this._ref = value
        this._dirty = true
    }
    get ref() {
        return this._ref
    }
    set fail(value) {
        this._fail = value
        this._dirty = true
    }
    get fail() {
        return this._fail
    }
    set zfail(value) {
        this._zfail = value
        this._dirty = true
    }
    get zfail() {
        return this._zfail
    }
    set zpass(value) {
        this._zpass = value
        this._dirty = true
    }
    get zpass() {
        return this._zpass
    }
    set readMask(value) {
        this._readMask = value
        this._dirty = true
    }
    get readMask() {
        return this._readMask
    }
    set writeMask(value) {
        this._writeMask = value
        this._dirty = true
    }
    get writeMask() {
        return this._writeMask
    }
    _evalKey() {
        const { _func, _ref, _fail, _zfail, _zpass, _readMask, _writeMask } = this
        const key = `${_func},${_ref},${_fail},${_zfail},${_zpass},${_readMask},${_writeMask}`
        this._key = stringIds$2.get(key)
        this._dirty = false
    }
    get key() {
        if (this._dirty) {
            this._evalKey()
        }
        return this._key
    }
    copy(rhs) {
        this._func = rhs._func
        this._ref = rhs._ref
        this._readMask = rhs._readMask
        this._writeMask = rhs._writeMask
        this._fail = rhs._fail
        this._zfail = rhs._zfail
        this._zpass = rhs._zpass
        this._dirty = rhs._dirty
        this._key = rhs._key
        return this
    }
    clone() {
        const clone = new this.constructor()
        return clone.copy(this)
    }
    constructor(options = {}) {
        this._dirty = true
        this._func = options.func ?? FUNC_ALWAYS
        this._ref = options.ref ?? 0
        this._readMask = options.readMask ?? 0xff
        this._writeMask = options.writeMask ?? 0xff
        this._fail = options.fail ?? STENCILOP_KEEP
        this._zfail = options.zfail ?? STENCILOP_KEEP
        this._zpass = options.zpass ?? STENCILOP_KEEP
        this._evalKey()
    }
}
StencilParameters.DEFAULT = Object.freeze(new StencilParameters())

class GraphicsDevice extends EventHandler {
    postInit() {
        const vertexFormat = new VertexFormat(this, [
            {
                semantic: SEMANTIC_POSITION,
                components: 2,
                type: TYPE_FLOAT32,
            },
        ])
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
        this.quadVertexBuffer = new VertexBuffer(this, vertexFormat, 4, {
            data: positions,
        })
        const indices = new Uint16Array([0, 1, 2, 2, 1, 3])
        this.quadIndexBuffer = new IndexBuffer(this, INDEXFORMAT_UINT16, 6, BUFFER_STATIC, indices.buffer)
    }
    initCapsDefines() {
        const { capsDefines } = this
        capsDefines.clear()
        if (this.textureFloatFilterable) capsDefines.set('CAPS_TEXTURE_FLOAT_FILTERABLE', '')
        if (this.textureFloatRenderable) capsDefines.set('CAPS_TEXTURE_FLOAT_RENDERABLE', '')
        if (this.supportsMultiDraw) capsDefines.set('CAPS_MULTI_DRAW', '')
        if (this.supportsPrimitiveIndex) capsDefines.set('CAPS_PRIMITIVE_INDEX', '')
        if (this.supportsShaderF16) capsDefines.set('CAPS_SHADER_F16', '')
        if (platform.desktop) capsDefines.set('PLATFORM_DESKTOP', '')
        if (platform.mobile) capsDefines.set('PLATFORM_MOBILE', '')
        if (platform.android) capsDefines.set('PLATFORM_ANDROID', '')
        if (platform.ios) capsDefines.set('PLATFORM_IOS', '')
    }
    destroy() {
        this.fire('destroy')
        this.quadVertexBuffer?.destroy()
        this.quadVertexBuffer = null
        this.quadIndexBuffer?.destroy()
        this.quadIndexBuffer = null
        this.dynamicBuffers?.destroy()
        this.dynamicBuffers = null
        this.gpuProfiler?.destroy()
        this.gpuProfiler = null
        this._destroyed = true
    }
    onDestroyShader(shader) {
        this.fire('destroy:shader', shader)
        const idx = this.shaders.indexOf(shader)
        if (idx !== -1) {
            this.shaders.splice(idx, 1)
        }
    }
    onTextureDestroyed(texture) {
        this.textures.delete(texture)
        this.texturesToUpload.delete(texture)
        this.scope.removeValue(texture)
    }
    postDestroy() {
        this.scope = null
        this.canvas = null
    }
    loseContext() {
        this.contextLost = true
        this.backBufferSize.set(-1, -1)
        for (const texture of this.textures) {
            texture.loseContext()
        }
        for (const buffer of this.buffers) {
            buffer.loseContext()
        }
        for (const target of this.targets) {
            target.loseContext()
        }
        this.gpuProfiler?.loseContext()
    }
    restoreContext() {
        this.contextLost = false
        this.initializeRenderState()
        this.initializeContextCaches()
        for (const buffer of this.buffers) {
            buffer.unlock()
        }
        this.gpuProfiler?.restoreContext?.()
    }
    toJSON(key) {
        return undefined
    }
    initializeContextCaches() {
        this.vertexBuffers = []
        this.shader = null
        this.shaderValid = undefined
        this.shaderAsyncCompile = false
        this.renderTarget = null
    }
    initializeRenderState() {
        this.blendState = new BlendState()
        this.depthState = new DepthState()
        this.cullMode = CULLFACE_BACK
        this.frontFace = FRONTFACE_CCW
        this.vx = this.vy = this.vw = this.vh = 0
        this.sx = this.sy = this.sw = this.sh = 0
        this.blendColor = new Color(0, 0, 0, 0)
    }
    setStencilState(stencilFront, stencilBack) {}
    setBlendState(blendState) {}
    setBlendColor(r, g, b, a) {}
    setDepthState(depthState) {}
    setCullMode(cullMode) {}
    setFrontFace(frontFace) {}
    setDrawStates(
        blendState = BlendState.NOBLEND,
        depthState = DepthState.NODEPTH,
        cullMode = CULLFACE_NONE,
        frontFace = FRONTFACE_CCW,
        stencilFront,
        stencilBack,
    ) {
        this.setBlendState(blendState)
        this.setDepthState(depthState)
        this.setCullMode(cullMode)
        this.setFrontFace(frontFace)
        this.setStencilState(stencilFront, stencilBack)
    }
    setRenderTarget(renderTarget) {
        this.renderTarget = renderTarget
    }
    setVertexBuffer(vertexBuffer) {
        if (vertexBuffer) {
            this.vertexBuffers.push(vertexBuffer)
        }
    }
    clearVertexBuffer() {
        this.vertexBuffers.length = 0
    }
    getIndirectDrawSlot(count = 1) {
        return 0
    }
    get indirectDrawBuffer() {
        return null
    }
    getIndirectDispatchSlot(count = 1) {
        return 0
    }
    get indirectDispatchBuffer() {
        return null
    }
    getRenderTarget() {
        return this.renderTarget
    }
    initRenderTarget(target) {
        if (target.initialized) return
        target.init()
        this.targets.add(target)
    }
    draw(primitive, indexBuffer, numInstances, drawCommands, first = true, last = true) {}
    _isBrowserInterface(texture) {
        return (
            this._isImageBrowserInterface(texture) ||
            this._isImageCanvasInterface(texture) ||
            this._isImageVideoInterface(texture)
        )
    }
    _isImageBrowserInterface(texture) {
        return (
            (typeof ImageBitmap !== 'undefined' && texture instanceof ImageBitmap) ||
            (typeof HTMLImageElement !== 'undefined' && texture instanceof HTMLImageElement)
        )
    }
    _isImageCanvasInterface(texture) {
        return typeof HTMLCanvasElement !== 'undefined' && texture instanceof HTMLCanvasElement
    }
    _isImageVideoInterface(texture) {
        return typeof HTMLVideoElement !== 'undefined' && texture instanceof HTMLVideoElement
    }
    resizeCanvas(width, height) {
        const pixelRatio = Math.min(this._maxPixelRatio, platform.browser ? window.devicePixelRatio : 1)
        const w = Math.floor(width * pixelRatio)
        const h = Math.floor(height * pixelRatio)
        if (w !== this.canvas.width || h !== this.canvas.height) {
            this.setResolution(w, h)
        }
    }
    setResolution(width, height) {
        this.canvas.width = width
        this.canvas.height = height
        this.fire(GraphicsDevice.EVENT_RESIZE, width, height)
    }
    update() {
        this.updateClientRect()
    }
    updateClientRect() {
        if (platform.worker) {
            this.clientRect.width = this.canvas.width
            this.clientRect.height = this.canvas.height
        } else {
            const rect = this.canvas.getBoundingClientRect()
            this.clientRect.width = rect.width
            this.clientRect.height = rect.height
        }
    }
    get width() {
        return this.canvas.width
    }
    get height() {
        return this.canvas.height
    }
    set fullscreen(fullscreen) {}
    get fullscreen() {
        return false
    }
    set maxPixelRatio(ratio) {
        this._maxPixelRatio = ratio
    }
    get maxPixelRatio() {
        return this._maxPixelRatio
    }
    get deviceType() {
        return this._deviceType
    }
    startRenderPass(renderPass) {}
    endRenderPass(renderPass) {}
    startComputePass(name) {}
    endComputePass() {}
    frameStart() {
        this.renderPassIndex = 0
        this.renderVersion++
    }
    frameEnd() {
        this.mapsToClear.forEach((map) => map.clear())
        this.mapsToClear.clear()
    }
    computeDispatch(computes, name = 'Unnamed') {}
    getRenderableHdrFormat(
        formats = [PIXELFORMAT_111110F, PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F],
        filterable = true,
        samples = 1,
    ) {
        for (let i = 0; i < formats.length; i++) {
            const format = formats[i]
            switch (format) {
                case PIXELFORMAT_111110F: {
                    if (this.textureRG11B10Renderable) {
                        return format
                    }
                    break
                }
                case PIXELFORMAT_RGBA16F:
                    if (this.textureHalfFloatRenderable) {
                        return format
                    }
                    break
                case PIXELFORMAT_RGBA32F:
                    if (this.isWebGPU && samples > 1) {
                        continue
                    }
                    if (this.textureFloatRenderable && (!filterable || this.textureFloatFilterable)) {
                        return format
                    }
                    break
            }
        }
        return undefined
    }
    validateAttributes(shader, vb0Format, vb1Format) {}
    constructor(canvas, options) {
        var _this_initOptions,
            _this_initOptions1,
            _this_initOptions2,
            _this_initOptions3,
            _this_initOptions4,
            _this_initOptions5
        ;(super(),
            (this.backBuffer = null),
            (this.backBufferSize = new Vec2()),
            (this.backBufferAntialias = false),
            (this.isWebGPU = false),
            (this.isWebGL2 = false),
            (this.isNull = false),
            (this.isHdr = false),
            (this.maxIndirectDrawCount = 1024),
            (this.maxIndirectDispatchCount = 256),
            (this.maxColorAttachments = 1),
            (this.maxSamples = 1),
            (this.supportsMultiDraw = true),
            (this.supportsCompute = false),
            (this.supportsStorageTextureRead = false),
            (this.supportsSubgroupUniformity = false),
            (this.supportsSubgroupId = false),
            (this.renderTarget = null),
            (this.shaders = []),
            (this.textures = new Set()),
            (this.texturesToUpload = new Set()),
            (this.targets = new Set()),
            (this.renderVersion = 0),
            (this.insideRenderPass = false),
            (this.supportsUniformBuffers = false),
            (this.supportsClipDistances = false),
            (this.supportsTextureFormatTier1 = false),
            (this.supportsTextureFormatTier2 = false),
            (this.supportsPrimitiveIndex = false),
            (this.supportsShaderF16 = false),
            (this.textureRG11B10Renderable = false),
            (this.textureFloatFilterable = false),
            (this.blendState = new BlendState()),
            (this.depthState = new DepthState()),
            (this.stencilEnabled = false),
            (this.stencilFront = new StencilParameters()),
            (this.stencilBack = new StencilParameters()),
            (this._destroyed = false),
            (this.defaultClearOptions = {
                color: [0, 0, 0, 1],
                depth: 1,
                stencil: 0,
                flags: CLEARFLAG_COLOR | CLEARFLAG_DEPTH,
            }),
            (this.clientRect = {
                width: 0,
                height: 0,
            }),
            (this._shadersDirty = false),
            (this.capsDefines = new Map()),
            (this.mapsToClear = new Set()))
        this.canvas = canvas
        if ('setAttribute' in canvas) {
            canvas.setAttribute('data-engine', `PlayCanvas ${version$1}`)
        }
        this.initOptions = {
            ...options,
        }
        ;(_this_initOptions = this.initOptions).alpha ?? (_this_initOptions.alpha = true)
        ;(_this_initOptions1 = this.initOptions).depth ?? (_this_initOptions1.depth = true)
        ;(_this_initOptions2 = this.initOptions).stencil ?? (_this_initOptions2.stencil = true)
        ;(_this_initOptions3 = this.initOptions).antialias ?? (_this_initOptions3.antialias = true)
        ;(_this_initOptions4 = this.initOptions).powerPreference ??
            (_this_initOptions4.powerPreference = 'high-performance')
        ;(_this_initOptions5 = this.initOptions).displayFormat ?? (_this_initOptions5.displayFormat = DISPLAYFORMAT_LDR)
        this._maxPixelRatio = platform.browser ? Math.min(1, window.devicePixelRatio) : 1
        this.buffers = new Set()
        this._vram = {
            tex: 0,
            vb: 0,
            ib: 0,
            ub: 0,
            sb: 0,
        }
        this._shaderStats = {
            vsCompiled: 0,
            fsCompiled: 0,
            linked: 0,
            materialShaders: 0,
            compileTime: 0,
        }
        this.initializeContextCaches()
        this._drawCallsPerFrame = 0
        this._shaderSwitchesPerFrame = 0
        this._primsPerFrame = []
        for (let i = PRIMITIVE_POINTS; i <= PRIMITIVE_TRIFAN; i++) {
            this._primsPerFrame[i] = 0
        }
        this._renderTargetCreationTime = 0
        this.scope = new ScopeSpace('Device')
        this.textureBias = this.scope.resolve('textureBias')
        this.textureBias.setValue(0.0)
    }
}
GraphicsDevice.EVENT_RESIZE = 'resizecanvas'

let id$7 = 0
class RenderTarget {
    destroy() {
        const device = this._device
        if (device) {
            device.targets.delete(this)
            if (device.renderTarget === this) {
                device.setRenderTarget(null)
            }
            this.destroyFrameBuffers()
        }
    }
    destroyFrameBuffers() {
        const device = this._device
        if (device) {
            this.impl.destroy(device)
        }
    }
    destroyTextureBuffers() {
        this._depthBuffer?.destroy()
        this._depthBuffer = null
        this._colorBuffers?.forEach((colorBuffer) => {
            colorBuffer.destroy()
        })
        this._colorBuffers = null
        this._colorBuffer = null
    }
    resize(width, height) {
        if (this.mipLevel > 0) {
            return
        }
        this._depthBuffer?.resize(width, height)
        this._colorBuffers?.forEach((colorBuffer) => {
            colorBuffer.resize(width, height)
        })
        if (this._width !== width || this._height !== height) {
            this.destroyFrameBuffers()
            const device = this._device
            if (device.renderTarget === this) {
                device.setRenderTarget(null)
            }
            this.evaluateDimensions()
            this.validateMrt()
            this.impl = device.createRenderTargetImpl(this)
        }
    }
    validateMrt() {}
    evaluateDimensions() {
        const buffer = this._colorBuffer ?? this._depthBuffer
        if (buffer) {
            this._width = buffer.width
            this._height = buffer.height
            if (this._mipLevel > 0) {
                this._width = TextureUtils.calcLevelDimension(this._width, this._mipLevel)
                this._height = TextureUtils.calcLevelDimension(this._height, this._mipLevel)
            }
        }
    }
    init() {
        this.impl.init(this._device, this)
    }
    get initialized() {
        return this.impl.initialized
    }
    get device() {
        return this._device
    }
    loseContext() {
        this.impl.loseContext()
    }
    resolve(color = true, depth = !!this._depthBuffer) {
        if (this._device && this._samples > 1) {
            this.impl.resolve(this._device, this, color, depth)
        }
    }
    copy(source, color, depth) {
        if (!this._device) {
            if (source._device) {
                this._device = source._device
            } else {
                return false
            }
        }
        const success = this._device.copyRenderTarget(source, this, color, depth)
        return success
    }
    get samples() {
        return this._samples
    }
    get depth() {
        return this._depth
    }
    get stencil() {
        return this._stencil
    }
    get colorBuffer() {
        return this._colorBuffer
    }
    getColorBuffer(index) {
        return this._colorBuffers?.[index]
    }
    get depthBuffer() {
        return this._depthBuffer
    }
    get face() {
        return this._face
    }
    get mipLevel() {
        return this._mipLevel
    }
    get mipmaps() {
        return this._mipmaps
    }
    get width() {
        return this._width ?? this._device.width
    }
    get height() {
        return this._height ?? this._device.height
    }
    isColorBufferSrgb(index = 0) {
        if (this.device.backBuffer === this) {
            return isSrgbPixelFormat(this.device.backBufferFormat)
        }
        const colorBuffer = this.getColorBuffer(index)
        return colorBuffer ? isSrgbPixelFormat(colorBuffer.format) : false
    }
    constructor(options = {}) {
        this.id = id$7++
        const device =
            options.colorBuffer?.device ??
            options.colorBuffers?.[0].device ??
            options.depthBuffer?.device ??
            options.graphicsDevice
        this._device = device
        const { maxSamples } = this._device
        this._samples = Math.min(options.samples ?? 1, maxSamples)
        if (device.isWebGPU) {
            this._samples = this._samples > 1 ? maxSamples : 1
        }
        this._colorBuffer = options.colorBuffer
        if (options.colorBuffer) {
            this._colorBuffers = [options.colorBuffer]
        }
        this._depthBuffer = options.depthBuffer
        this._face = options.face ?? 0
        if (this._depthBuffer) {
            const format = this._depthBuffer._format
            if (format === PIXELFORMAT_DEPTH || format === PIXELFORMAT_DEPTH16) {
                this._depth = true
                this._stencil = false
            } else if (format === PIXELFORMAT_DEPTHSTENCIL) {
                this._depth = true
                this._stencil = true
            } else if (format === PIXELFORMAT_R32F && this._depthBuffer.device.isWebGPU && this._samples > 1) {
                this._depth = true
                this._stencil = false
            } else {
                this._depth = false
                this._stencil = false
            }
        } else {
            this._depth = options.depth ?? true
            this._stencil = options.stencil ?? false
        }
        if (options.colorBuffers) {
            if (!this._colorBuffers) {
                this._colorBuffers = [...options.colorBuffers]
                this._colorBuffer = options.colorBuffers[0]
            }
        }
        this.autoResolve = options.autoResolve ?? true
        this.name = options.name
        if (!this.name) {
            this.name = this._colorBuffer?.name
        }
        if (!this.name) {
            this.name = this._depthBuffer?.name
        }
        if (!this.name) {
            this.name = 'Untitled'
        }
        this.flipY = options.flipY ?? false
        this._mipLevel = options.mipLevel ?? 0
        if (this._mipLevel > 0 && this._depth) {
            this._mipLevel = 0
        }
        this._mipmaps = options.mipLevel === undefined
        this.evaluateDimensions()
        this.validateMrt()
        this.impl = device.createRenderTargetImpl(this)
    }
}

class WebgpuBindGroup {
    update(bindGroup) {
        this.destroy()
        const device = bindGroup.device
        const desc = this.createDescriptor(device, bindGroup)
        this.bindGroup = device.wgpu.createBindGroup(desc)
    }
    destroy() {
        this.bindGroup = null
    }
    createDescriptor(device, bindGroup) {
        const entries = []
        const format = bindGroup.format
        const uniformBufferFormats = bindGroup.format.uniformBufferFormats
        bindGroup.uniformBuffers.forEach((ub, i) => {
            const slot = uniformBufferFormats[i].slot
            const buffer = ub.persistent ? ub.impl.buffer : ub.allocation.gpuBuffer.buffer
            entries.push({
                binding: slot,
                resource: {
                    buffer: buffer,
                    offset: 0,
                    size: ub.format.byteSize,
                },
            })
        })
        const textureFormats = bindGroup.format.textureFormats
        bindGroup.textures.forEach((value, textureIndex) => {
            const isTextureView = value instanceof TextureView
            const texture = isTextureView ? value.texture : value
            const wgpuTexture = texture.impl
            const textureFormat = format.textureFormats[textureIndex]
            const slot = textureFormats[textureIndex].slot
            const view = wgpuTexture.getView(device, isTextureView ? value : undefined)
            entries.push({
                binding: slot,
                resource: view,
            })
            if (textureFormat.hasSampler) {
                const sampler = wgpuTexture.getSampler(device, textureFormat.sampleType)
                entries.push({
                    binding: slot + 1,
                    resource: sampler,
                })
            }
        })
        const storageTextureFormats = bindGroup.format.storageTextureFormats
        bindGroup.storageTextures.forEach((value, textureIndex) => {
            const isTextureView = value instanceof TextureView
            const texture = isTextureView ? value.texture : value
            const wgpuTexture = texture.impl
            const slot = storageTextureFormats[textureIndex].slot
            const view = wgpuTexture.getView(device, isTextureView ? value : undefined)
            entries.push({
                binding: slot,
                resource: view,
            })
        })
        const storageBufferFormats = bindGroup.format.storageBufferFormats
        bindGroup.storageBuffers.forEach((buffer, bufferIndex) => {
            const wgpuBuffer = buffer.impl.buffer
            const slot = storageBufferFormats[bufferIndex].slot
            entries.push({
                binding: slot,
                resource: {
                    buffer: wgpuBuffer,
                },
            })
        })
        const desc = {
            layout: bindGroup.format.impl.bindGroupLayout,
            entries: entries,
        }
        return desc
    }
}

class WebgpuUtils {
    static shaderStage(stage) {
        let ret = 0
        if (stage & SHADERSTAGE_VERTEX) ret |= GPUShaderStage.VERTEX
        if (stage & SHADERSTAGE_FRAGMENT) ret |= GPUShaderStage.FRAGMENT
        if (stage & SHADERSTAGE_COMPUTE) ret |= GPUShaderStage.COMPUTE
        return ret
    }
}

const gpuTextureFormats = []
gpuTextureFormats[PIXELFORMAT_A8] = ''
gpuTextureFormats[PIXELFORMAT_L8] = ''
gpuTextureFormats[PIXELFORMAT_LA8] = ''
gpuTextureFormats[PIXELFORMAT_R8] = 'r8unorm'
gpuTextureFormats[PIXELFORMAT_RG8] = 'rg8unorm'
gpuTextureFormats[PIXELFORMAT_RGB565] = ''
gpuTextureFormats[PIXELFORMAT_RGBA5551] = ''
gpuTextureFormats[PIXELFORMAT_RGBA4] = ''
gpuTextureFormats[PIXELFORMAT_RGB8] = 'rgba8unorm'
gpuTextureFormats[PIXELFORMAT_RGBA8] = 'rgba8unorm'
gpuTextureFormats[PIXELFORMAT_DXT1] = 'bc1-rgba-unorm'
gpuTextureFormats[PIXELFORMAT_DXT3] = 'bc2-rgba-unorm'
gpuTextureFormats[PIXELFORMAT_DXT5] = 'bc3-rgba-unorm'
gpuTextureFormats[PIXELFORMAT_RGB16F] = ''
gpuTextureFormats[PIXELFORMAT_RGBA16F] = 'rgba16float'
gpuTextureFormats[PIXELFORMAT_R16F] = 'r16float'
gpuTextureFormats[PIXELFORMAT_RG16F] = 'rg16float'
gpuTextureFormats[PIXELFORMAT_RGB32F] = ''
gpuTextureFormats[PIXELFORMAT_RGBA32F] = 'rgba32float'
gpuTextureFormats[PIXELFORMAT_R32F] = 'r32float'
gpuTextureFormats[PIXELFORMAT_RG32F] = 'rg32float'
gpuTextureFormats[PIXELFORMAT_DEPTH] = 'depth32float'
gpuTextureFormats[PIXELFORMAT_DEPTH16] = 'depth16unorm'
gpuTextureFormats[PIXELFORMAT_DEPTHSTENCIL] = 'depth24plus-stencil8'
gpuTextureFormats[PIXELFORMAT_111110F] = 'rg11b10ufloat'
gpuTextureFormats[PIXELFORMAT_SRGB8] = ''
gpuTextureFormats[PIXELFORMAT_SRGBA8] = 'rgba8unorm-srgb'
gpuTextureFormats[PIXELFORMAT_ETC1] = ''
gpuTextureFormats[PIXELFORMAT_ETC2_RGB] = 'etc2-rgb8unorm'
gpuTextureFormats[PIXELFORMAT_ETC2_RGBA] = 'etc2-rgba8unorm'
gpuTextureFormats[PIXELFORMAT_PVRTC_2BPP_RGB_1] = ''
gpuTextureFormats[PIXELFORMAT_PVRTC_2BPP_RGBA_1] = ''
gpuTextureFormats[PIXELFORMAT_PVRTC_4BPP_RGB_1] = ''
gpuTextureFormats[PIXELFORMAT_PVRTC_4BPP_RGBA_1] = ''
gpuTextureFormats[PIXELFORMAT_ASTC_4x4] = 'astc-4x4-unorm'
gpuTextureFormats[PIXELFORMAT_ATC_RGB] = ''
gpuTextureFormats[PIXELFORMAT_ATC_RGBA] = ''
gpuTextureFormats[PIXELFORMAT_BGRA8] = 'bgra8unorm'
gpuTextureFormats[PIXELFORMAT_SBGRA8] = 'bgra8unorm-srgb'
gpuTextureFormats[PIXELFORMAT_R8I] = 'r8sint'
gpuTextureFormats[PIXELFORMAT_R8U] = 'r8uint'
gpuTextureFormats[PIXELFORMAT_R16I] = 'r16sint'
gpuTextureFormats[PIXELFORMAT_R16U] = 'r16uint'
gpuTextureFormats[PIXELFORMAT_R32I] = 'r32sint'
gpuTextureFormats[PIXELFORMAT_R32U] = 'r32uint'
gpuTextureFormats[PIXELFORMAT_RG8I] = 'rg8sint'
gpuTextureFormats[PIXELFORMAT_RG8U] = 'rg8uint'
gpuTextureFormats[PIXELFORMAT_RG16I] = 'rg16sint'
gpuTextureFormats[PIXELFORMAT_RG16U] = 'rg16uint'
gpuTextureFormats[PIXELFORMAT_RG32I] = 'rg32sint'
gpuTextureFormats[PIXELFORMAT_RG32U] = 'rg32uint'
gpuTextureFormats[PIXELFORMAT_RGBA8I] = 'rgba8sint'
gpuTextureFormats[PIXELFORMAT_RGBA8U] = 'rgba8uint'
gpuTextureFormats[PIXELFORMAT_RGBA16I] = 'rgba16sint'
gpuTextureFormats[PIXELFORMAT_RGBA16U] = 'rgba16uint'
gpuTextureFormats[PIXELFORMAT_RGBA32I] = 'rgba32sint'
gpuTextureFormats[PIXELFORMAT_RGBA32U] = 'rgba32uint'
gpuTextureFormats[PIXELFORMAT_BC6F] = 'bc6h-rgb-float'
gpuTextureFormats[PIXELFORMAT_BC6UF] = 'bc6h-rgb-ufloat'
gpuTextureFormats[PIXELFORMAT_BC7] = 'bc7-rgba-unorm'
gpuTextureFormats[PIXELFORMAT_RGB9E5] = 'rgb9e5ufloat'
gpuTextureFormats[PIXELFORMAT_RG8S] = 'rg8snorm'
gpuTextureFormats[PIXELFORMAT_RGBA8S] = 'rgba8snorm'
gpuTextureFormats[PIXELFORMAT_RGB10A2] = 'rgb10a2unorm'
gpuTextureFormats[PIXELFORMAT_RGB10A2U] = 'rgb10a2uint'
gpuTextureFormats[PIXELFORMAT_DXT1_SRGB] = 'bc1-rgba-unorm-srgb'
gpuTextureFormats[PIXELFORMAT_DXT3_SRGBA] = 'bc2-rgba-unorm-srgb'
gpuTextureFormats[PIXELFORMAT_DXT5_SRGBA] = 'bc3-rgba-unorm-srgb'
gpuTextureFormats[PIXELFORMAT_ETC2_SRGB] = 'etc2-rgb8unorm-srgb'
gpuTextureFormats[PIXELFORMAT_ETC2_SRGBA] = 'etc2-rgba8unorm-srgb'
gpuTextureFormats[PIXELFORMAT_BC7_SRGBA] = 'bc7-rgba-unorm-srgb'
gpuTextureFormats[PIXELFORMAT_ASTC_4x4_SRGB] = 'astc-4x4-unorm-srgb'

const samplerTypes = []
samplerTypes[SAMPLETYPE_FLOAT] = 'filtering'
samplerTypes[SAMPLETYPE_UNFILTERABLE_FLOAT] = 'non-filtering'
samplerTypes[SAMPLETYPE_DEPTH] = 'comparison'
samplerTypes[SAMPLETYPE_INT] = 'comparison'
samplerTypes[SAMPLETYPE_UINT] = 'comparison'
const sampleTypes = []
sampleTypes[SAMPLETYPE_FLOAT] = 'float'
sampleTypes[SAMPLETYPE_UNFILTERABLE_FLOAT] = 'unfilterable-float'
sampleTypes[SAMPLETYPE_DEPTH] = 'depth'
sampleTypes[SAMPLETYPE_INT] = 'sint'
sampleTypes[SAMPLETYPE_UINT] = 'uint'
const stringIds$1 = new StringIds()
class WebgpuBindGroupFormat {
    destroy() {
        this.bindGroupLayout = null
    }
    loseContext() {}
    createDescriptor(bindGroupFormat) {
        const entries = []
        let key = ''
        bindGroupFormat.uniformBufferFormats.forEach((bufferFormat) => {
            const visibility = WebgpuUtils.shaderStage(bufferFormat.visibility)
            key += `#${bufferFormat.slot}U:${visibility}`
            entries.push({
                binding: bufferFormat.slot,
                visibility: visibility,
                buffer: {
                    type: 'uniform',
                    hasDynamicOffset: true,
                },
            })
        })
        bindGroupFormat.textureFormats.forEach((textureFormat) => {
            const visibility = WebgpuUtils.shaderStage(textureFormat.visibility)
            const sampleType = textureFormat.sampleType
            const viewDimension = textureFormat.textureDimension
            const multisampled = false
            const gpuSampleType = sampleTypes[sampleType]
            key += `#${textureFormat.slot}T:${visibility}-${gpuSampleType}-${viewDimension}-${multisampled}`
            entries.push({
                binding: textureFormat.slot,
                visibility: visibility,
                texture: {
                    sampleType: gpuSampleType,
                    viewDimension: viewDimension,
                    multisampled: multisampled,
                },
            })
            if (textureFormat.hasSampler) {
                const gpuSamplerType = samplerTypes[sampleType]
                key += `#${textureFormat.slot + 1}S:${visibility}-${gpuSamplerType}`
                entries.push({
                    binding: textureFormat.slot + 1,
                    visibility: visibility,
                    sampler: {
                        type: gpuSamplerType,
                    },
                })
            }
        })
        bindGroupFormat.storageTextureFormats.forEach((textureFormat) => {
            const { format, textureDimension } = textureFormat
            const { read, write } = textureFormat
            key += `#${textureFormat.slot}ST:${format}-${textureDimension}-${read ? 'r1' : 'r0'}-${write ? 'w1' : 'w0'}`
            entries.push({
                binding: textureFormat.slot,
                visibility: GPUShaderStage.COMPUTE,
                storageTexture: {
                    access: read ? (write ? 'read-write' : 'read-only') : 'write-only',
                    format: gpuTextureFormats[format],
                    viewDimension: textureDimension,
                },
            })
        })
        bindGroupFormat.storageBufferFormats.forEach((bufferFormat) => {
            const readOnly = bufferFormat.readOnly
            const visibility = WebgpuUtils.shaderStage(bufferFormat.visibility)
            key += `#${bufferFormat.slot}SB:${visibility}-${readOnly ? 'ro' : 'rw'}`
            entries.push({
                binding: bufferFormat.slot,
                visibility: visibility,
                buffer: {
                    type: readOnly ? 'read-only-storage' : 'storage',
                },
            })
        })
        const desc = {
            entries: entries,
        }
        return {
            key,
            desc,
        }
    }
    constructor(bindGroupFormat) {
        const device = bindGroupFormat.device
        const { key, desc } = this.createDescriptor(bindGroupFormat)
        this.key = stringIds$1.get(key)
        this.bindGroupLayout = device.wgpu.createBindGroupLayout(desc)
    }
}

class WebgpuBuffer {
    destroy(device) {
        if (this.buffer) {
            this.buffer.destroy()
            this.buffer = null
        }
    }
    get initialized() {
        return !!this.buffer
    }
    loseContext() {}
    allocate(device, size) {
        this.buffer = device.wgpu.createBuffer({
            size,
            usage: this.usageFlags,
        })
    }
    unlock(device, storage) {
        const wgpu = device.wgpu
        if (!this.buffer) {
            const size = (storage.byteLength + 3) & -4
            this.usageFlags |= GPUBufferUsage.COPY_DST
            this.allocate(device, size)
        }
        const srcOffset = storage.byteOffset ?? 0
        const srcData = new Uint8Array(storage.buffer ?? storage, srcOffset, storage.byteLength)
        const data = new Uint8Array(this.buffer.size)
        data.set(srcData)
        wgpu.queue.writeBuffer(this.buffer, 0, data, 0, data.length)
    }
    read(device, offset, size, data, immediate) {
        return device.readStorageBuffer(this, offset, size, data, immediate)
    }
    write(device, bufferOffset, data, dataOffset, size) {
        device.writeStorageBuffer(this, bufferOffset, data, dataOffset, size)
    }
    clear(device, offset, size) {
        device.clearStorageBuffer(this, offset, size)
    }
    constructor(usageFlags = 0) {
        this.buffer = null
        this.usageFlags = 0
        this.usageFlags = usageFlags
    }
}

class WebgpuIndexBuffer extends WebgpuBuffer {
    unlock(indexBuffer) {
        const device = indexBuffer.device
        super.unlock(device, indexBuffer.storage)
    }
    constructor(indexBuffer, options) {
        ;(super(BUFFERUSAGE_INDEX | (options?.storage ? BUFFERUSAGE_STORAGE : 0)), (this.format = null))
        this.format = indexBuffer.format === INDEXFORMAT_UINT16 ? 'uint16' : 'uint32'
    }
}

const array$1 = {
    equals(arr1, arr2) {
        if (arr1.length !== arr2.length) {
            return false
        }
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) {
                return false
            }
        }
        return true
    },
}

const gpuVertexFormats = []
gpuVertexFormats[TYPE_INT8] = 'sint8'
gpuVertexFormats[TYPE_UINT8] = 'uint8'
gpuVertexFormats[TYPE_INT16] = 'sint16'
gpuVertexFormats[TYPE_UINT16] = 'uint16'
gpuVertexFormats[TYPE_INT32] = 'sint32'
gpuVertexFormats[TYPE_UINT32] = 'uint32'
gpuVertexFormats[TYPE_FLOAT32] = 'float32'
gpuVertexFormats[TYPE_FLOAT16] = 'float16'
const gpuVertexFormatsNormalized = []
gpuVertexFormatsNormalized[TYPE_INT8] = 'snorm8'
gpuVertexFormatsNormalized[TYPE_UINT8] = 'unorm8'
gpuVertexFormatsNormalized[TYPE_INT16] = 'snorm16'
gpuVertexFormatsNormalized[TYPE_UINT16] = 'unorm16'
gpuVertexFormatsNormalized[TYPE_INT32] = 'sint32'
gpuVertexFormatsNormalized[TYPE_UINT32] = 'uint32'
gpuVertexFormatsNormalized[TYPE_FLOAT32] = 'float32'
gpuVertexFormatsNormalized[TYPE_FLOAT16] = 'float16'
class WebgpuVertexBufferLayout {
    get(vertexFormat0, vertexFormat1 = null) {
        const key = this.getKey(vertexFormat0, vertexFormat1)
        let layout = this.cache.get(key)
        if (!layout) {
            layout = this.create(vertexFormat0, vertexFormat1)
            this.cache.set(key, layout)
        }
        return layout
    }
    getKey(vertexFormat0, vertexFormat1 = null) {
        return `${vertexFormat0?.renderingHashString}-${vertexFormat1?.renderingHashString}`
    }
    create(vertexFormat0, vertexFormat1) {
        const layout = []
        const addFormat = (format) => {
            const interleaved = format.interleaved
            const stepMode = format.instancing ? 'instance' : 'vertex'
            let attributes = []
            const elementCount = format.elements.length
            for (let i = 0; i < elementCount; i++) {
                const element = format.elements[i]
                const location = semanticToLocation[element.name]
                const formatTable = element.normalize ? gpuVertexFormatsNormalized : gpuVertexFormats
                attributes.push({
                    shaderLocation: location,
                    offset: interleaved ? element.offset : 0,
                    format: `${formatTable[element.dataType]}${element.numComponents > 1 ? `x${element.numComponents}` : ''}`,
                })
                if (!interleaved || i === elementCount - 1) {
                    layout.push({
                        attributes: attributes,
                        arrayStride: element.stride,
                        stepMode: stepMode,
                    })
                    attributes = []
                }
            }
        }
        if (vertexFormat0) {
            addFormat(vertexFormat0)
        }
        if (vertexFormat1) {
            addFormat(vertexFormat1)
        }
        return layout
    }
    constructor() {
        this.cache = new Map()
    }
}

class WebgpuPipeline {
    getPipelineLayout(bindGroupFormats) {
        const bindGroupLayouts = []
        bindGroupFormats.forEach((format) => {
            bindGroupLayouts.push(format.bindGroupLayout)
        })
        const desc = {
            bindGroupLayouts: bindGroupLayouts,
        }
        const pipelineLayout = this.device.wgpu.createPipelineLayout(desc)
        return pipelineLayout
    }
    constructor(device) {
        this.device = device
    }
}
const _primitiveTopology = [
    'point-list',
    'line-list',
    undefined,
    'line-strip',
    'triangle-list',
    'triangle-strip',
    undefined,
]
const _blendOperation = ['add', 'subtract', 'reverse-subtract', 'min', 'max']
const _blendFactor = [
    'zero',
    'one',
    'src',
    'one-minus-src',
    'dst',
    'one-minus-dst',
    'src-alpha',
    'src-alpha-saturated',
    'one-minus-src-alpha',
    'dst-alpha',
    'one-minus-dst-alpha',
    'constant',
    'one-minus-constant',
]
const _compareFunction = ['never', 'less', 'equal', 'less-equal', 'greater', 'not-equal', 'greater-equal', 'always']
const _cullModes = ['none', 'back', 'front']
const _frontFace = ['ccw', 'cw']
const _stencilOps = [
    'keep',
    'zero',
    'replace',
    'increment-clamp',
    'increment-wrap',
    'decrement-clamp',
    'decrement-wrap',
    'invert',
]
const _indexFormat = ['', 'uint16', 'uint32']
let CacheEntry$1 = class CacheEntry {}
class WebgpuRenderPipeline extends WebgpuPipeline {
    get(
        primitive,
        vertexFormat0,
        vertexFormat1,
        ibFormat,
        shader,
        renderTarget,
        bindGroupFormats,
        blendState,
        depthState,
        cullMode,
        stencilEnabled,
        stencilFront,
        stencilBack,
        frontFace,
    ) {
        const primitiveType = primitive.type
        if (ibFormat && primitiveType !== PRIMITIVE_LINESTRIP && primitiveType !== PRIMITIVE_TRISTRIP) {
            ibFormat = undefined
        }
        const lookupHashes = this.lookupHashes
        lookupHashes[0] = primitiveType
        lookupHashes[1] = shader.id
        lookupHashes[2] = cullMode
        lookupHashes[3] = depthState.key
        lookupHashes[4] = blendState.key
        lookupHashes[5] = vertexFormat0?.renderingHash ?? 0
        lookupHashes[6] = vertexFormat1?.renderingHash ?? 0
        lookupHashes[7] = renderTarget.impl.key
        lookupHashes[8] = bindGroupFormats[0]?.key ?? 0
        lookupHashes[9] = bindGroupFormats[1]?.key ?? 0
        lookupHashes[10] = bindGroupFormats[2]?.key ?? 0
        lookupHashes[11] = stencilEnabled ? stencilFront.key : 0
        lookupHashes[12] = stencilEnabled ? stencilBack.key : 0
        lookupHashes[13] = ibFormat ?? 0
        lookupHashes[14] = frontFace
        const hash = hash32Fnv1a(lookupHashes)
        let cacheEntries = this.cache.get(hash)
        if (cacheEntries) {
            for (let i = 0; i < cacheEntries.length; i++) {
                const entry = cacheEntries[i]
                if (array$1.equals(entry.hashes, lookupHashes)) {
                    return entry.pipeline
                }
            }
        }
        const primitiveTopology = _primitiveTopology[primitiveType]
        const pipelineLayout = this.getPipelineLayout(bindGroupFormats)
        const vertexBufferLayout = this.vertexBufferLayout.get(vertexFormat0, vertexFormat1)
        const cacheEntry = new CacheEntry$1()
        cacheEntry.hashes = new Uint32Array(lookupHashes)
        cacheEntry.pipeline = this.create(
            primitiveTopology,
            ibFormat,
            shader,
            renderTarget,
            pipelineLayout,
            blendState,
            depthState,
            vertexBufferLayout,
            cullMode,
            stencilEnabled,
            stencilFront,
            stencilBack,
            frontFace,
        )
        if (cacheEntries) {
            cacheEntries.push(cacheEntry)
        } else {
            cacheEntries = [cacheEntry]
        }
        this.cache.set(hash, cacheEntries)
        return cacheEntry.pipeline
    }
    getBlend(blendState) {
        let blend
        if (blendState.blend) {
            blend = {
                color: {
                    operation: _blendOperation[blendState.colorOp],
                    srcFactor: _blendFactor[blendState.colorSrcFactor],
                    dstFactor: _blendFactor[blendState.colorDstFactor],
                },
                alpha: {
                    operation: _blendOperation[blendState.alphaOp],
                    srcFactor: _blendFactor[blendState.alphaSrcFactor],
                    dstFactor: _blendFactor[blendState.alphaDstFactor],
                },
            }
        }
        return blend
    }
    getDepthStencil(depthState, renderTarget, stencilEnabled, stencilFront, stencilBack, primitiveTopology) {
        let depthStencil
        const { depth, stencil } = renderTarget
        if (depth || stencil) {
            depthStencil = {
                format: renderTarget.impl.depthAttachment.format,
            }
            if (depth) {
                depthStencil.depthWriteEnabled = depthState.write
                depthStencil.depthCompare = _compareFunction[depthState.func]
                const biasAllowed = primitiveTopology === 'triangle-list' || primitiveTopology === 'triangle-strip'
                depthStencil.depthBias = biasAllowed ? depthState.depthBias : 0
                depthStencil.depthBiasSlopeScale = biasAllowed ? depthState.depthBiasSlope : 0
            } else {
                depthStencil.depthWriteEnabled = false
                depthStencil.depthCompare = 'always'
            }
            if (stencil && stencilEnabled) {
                depthStencil.stencilReadMas = stencilFront.readMask
                depthStencil.stencilWriteMask = stencilFront.writeMask
                depthStencil.stencilFront = {
                    compare: _compareFunction[stencilFront.func],
                    failOp: _stencilOps[stencilFront.fail],
                    passOp: _stencilOps[stencilFront.zpass],
                    depthFailOp: _stencilOps[stencilFront.zfail],
                }
                depthStencil.stencilBack = {
                    compare: _compareFunction[stencilBack.func],
                    failOp: _stencilOps[stencilBack.fail],
                    passOp: _stencilOps[stencilBack.zpass],
                    depthFailOp: _stencilOps[stencilBack.zfail],
                }
            }
        }
        return depthStencil
    }
    create(
        primitiveTopology,
        ibFormat,
        shader,
        renderTarget,
        pipelineLayout,
        blendState,
        depthState,
        vertexBufferLayout,
        cullMode,
        stencilEnabled,
        stencilFront,
        stencilBack,
        frontFace,
    ) {
        const wgpu = this.device.wgpu
        const webgpuShader = shader.impl
        const desc = {
            vertex: {
                module: webgpuShader.getVertexShaderModule(),
                entryPoint: webgpuShader.vertexEntryPoint,
                buffers: vertexBufferLayout,
            },
            primitive: {
                topology: primitiveTopology,
                frontFace: _frontFace[frontFace],
                cullMode: _cullModes[cullMode],
            },
            depthStencil: this.getDepthStencil(
                depthState,
                renderTarget,
                stencilEnabled,
                stencilFront,
                stencilBack,
                primitiveTopology,
            ),
            multisample: {
                count: renderTarget.samples,
            },
            layout: pipelineLayout,
        }
        if (ibFormat) {
            desc.primitive.stripIndexFormat = _indexFormat[ibFormat]
        }
        desc.fragment = {
            module: webgpuShader.getFragmentShaderModule(),
            entryPoint: webgpuShader.fragmentEntryPoint,
            targets: [],
        }
        const colorAttachments = renderTarget.impl.colorAttachments
        if (colorAttachments.length > 0) {
            let writeMask = 0
            if (blendState.redWrite) writeMask |= GPUColorWrite.RED
            if (blendState.greenWrite) writeMask |= GPUColorWrite.GREEN
            if (blendState.blueWrite) writeMask |= GPUColorWrite.BLUE
            if (blendState.alphaWrite) writeMask |= GPUColorWrite.ALPHA
            const blend = this.getBlend(blendState)
            colorAttachments.forEach((attachment) => {
                desc.fragment.targets.push({
                    format: attachment.format,
                    writeMask: writeMask,
                    blend: blend,
                })
            })
        }
        const pipeline = wgpu.createRenderPipeline(desc)
        return pipeline
    }
    constructor(device) {
        ;(super(device), (this.lookupHashes = new Uint32Array(15)))
        this.vertexBufferLayout = new WebgpuVertexBufferLayout()
        this.cache = new Map()
    }
}

class CacheEntry {
    constructor() {
        this.pipeline = null
        this.hashes = null
    }
}
class WebgpuComputePipeline extends WebgpuPipeline {
    get(shader, bindGroupFormat) {
        const lookupHashes = this.lookupHashes
        lookupHashes[0] = shader.impl.computeKey
        lookupHashes[1] = bindGroupFormat.impl.key
        const hash = hash32Fnv1a(lookupHashes)
        let cacheEntries = this.cache.get(hash)
        if (cacheEntries) {
            for (let i = 0; i < cacheEntries.length; i++) {
                const entry = cacheEntries[i]
                if (array$1.equals(entry.hashes, lookupHashes)) {
                    return entry.pipeline
                }
            }
        }
        const pipelineLayout = this.getPipelineLayout([bindGroupFormat.impl])
        const cacheEntry = new CacheEntry()
        cacheEntry.hashes = new Uint32Array(lookupHashes)
        cacheEntry.pipeline = this.create(shader, pipelineLayout)
        if (cacheEntries) {
            cacheEntries.push(cacheEntry)
        } else {
            cacheEntries = [cacheEntry]
        }
        this.cache.set(hash, cacheEntries)
        return cacheEntry.pipeline
    }
    create(shader, pipelineLayout) {
        const wgpu = this.device.wgpu
        const webgpuShader = shader.impl
        const desc = {
            compute: {
                module: webgpuShader.getComputeShaderModule(),
                entryPoint: webgpuShader.computeEntryPoint,
            },
            layout: pipelineLayout,
        }
        const pipeline = wgpu.createComputePipeline(desc)
        return pipeline
    }
    constructor(...args) {
        ;(super(...args), (this.lookupHashes = new Uint32Array(2)), (this.cache = new Map()))
    }
}

class RefCountedObject {
    incRefCount() {
        this._refCount++
    }
    decRefCount() {
        this._refCount--
    }
    get refCount() {
        return this._refCount
    }
    constructor() {
        this._refCount = 0
    }
}

class Entry extends RefCountedObject {
    constructor(obj) {
        super()
        this.object = obj
        this.incRefCount()
    }
}
class RefCountedKeyCache {
    destroy() {
        this.cache.forEach((entry) => {
            entry.object?.destroy()
        })
        this.cache.clear()
    }
    clear() {
        this.cache.clear()
    }
    get(key) {
        const entry = this.cache.get(key)
        if (entry) {
            entry.incRefCount()
            return entry.object
        }
        return null
    }
    set(key, object) {
        this.cache.set(key, new Entry(object))
    }
    release(key) {
        const entry = this.cache.get(key)
        if (entry) {
            entry.decRefCount()
            if (entry.refCount === 0) {
                this.cache.delete(key)
                entry.object?.destroy()
            }
        }
    }
    constructor() {
        this.cache = new Map()
    }
}

class MultisampledTextureCache extends RefCountedKeyCache {
    loseContext(device) {
        this.clear()
    }
}
const multisampledTextureCache = new DeviceCache()
const getMultisampledTextureCache = (device) => {
    return multisampledTextureCache.get(device, () => {
        return new MultisampledTextureCache()
    })
}

const stringIds = new StringIds()
class ColorAttachment {
    destroy() {
        this.multisampledBuffer?.destroy()
        this.multisampledBuffer = null
    }
}
class DepthAttachment {
    destroy(device) {
        if (this.depthTextureInternal) {
            this.depthTexture?.destroy()
            this.depthTexture = null
        }
        if (this.multisampledDepthBuffer) {
            this.multisampledDepthBuffer = null
            getMultisampledTextureCache(device).release(this.multisampledDepthBufferKey)
        }
    }
    constructor(gpuFormat) {
        this.depthTexture = null
        this.depthTextureInternal = false
        this.multisampledDepthBuffer = null
        this.format = gpuFormat
        this.hasStencil = gpuFormat === 'depth24plus-stencil8'
    }
}
class WebgpuRenderTarget {
    destroy(device) {
        this.initialized = false
        this.assignedColorTexture = null
        this.colorAttachments.forEach((colorAttachment) => {
            colorAttachment.destroy()
        })
        this.colorAttachments.length = 0
        this.depthAttachment?.destroy(device)
        this.depthAttachment = null
    }
    updateKey() {
        const rt = this.renderTarget
        let key = `${rt.samples}:${this.depthAttachment ? this.depthAttachment.format : 'nodepth'}`
        this.colorAttachments.forEach((colorAttachment) => {
            key += `:${colorAttachment.format}`
        })
        this.key = stringIds.get(key)
    }
    assignColorTexture(device, gpuTexture) {
        this.assignedColorTexture = gpuTexture
        const view = gpuTexture.createView({
            format: device.backBufferViewFormat,
        })
        const colorAttachment = this.renderPassDescriptor.colorAttachments[0]
        const samples = this.renderTarget.samples
        if (samples > 1) {
            colorAttachment.resolveTarget = view
        } else {
            colorAttachment.view = view
        }
        this.setColorAttachment(0, undefined, device.backBufferViewFormat)
        this.updateKey()
    }
    setColorAttachment(index, multisampledBuffer, format) {
        if (!this.colorAttachments[index]) {
            this.colorAttachments[index] = new ColorAttachment()
        }
        if (multisampledBuffer) {
            this.colorAttachments[index].multisampledBuffer = multisampledBuffer
        }
        if (format) {
            this.colorAttachments[index].format = format
        }
    }
    init(device, renderTarget) {
        const wgpu = device.wgpu
        this.initDepthStencil(device, wgpu, renderTarget)
        if (renderTarget._colorBuffers) {
            renderTarget._colorBuffers.forEach((colorBuffer, index) => {
                this.setColorAttachment(index, undefined, colorBuffer.impl.format)
            })
        }
        this.renderPassDescriptor.colorAttachments = []
        const count = this.isBackbuffer ? 1 : (renderTarget._colorBuffers?.length ?? 0)
        for (let i = 0; i < count; ++i) {
            const colorAttachment = this.initColor(device, wgpu, renderTarget, i)
            const isDefaultFramebuffer = i === 0 && this.colorAttachments[0]?.format
            if (colorAttachment.view || isDefaultFramebuffer) {
                this.renderPassDescriptor.colorAttachments.push(colorAttachment)
            }
        }
        this.updateKey()
        this.initialized = true
    }
    initDepthStencil(device, wgpu, renderTarget) {
        const { samples, width, height, depth, depthBuffer } = renderTarget
        if (depth || depthBuffer) {
            let renderingView
            if (!depthBuffer) {
                this.depthAttachment = new DepthAttachment('depth24plus-stencil8')
                const depthTextureDesc = {
                    size: [width, height, 1],
                    dimension: '2d',
                    sampleCount: samples,
                    format: this.depthAttachment.format,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT,
                }
                if (samples > 1) {
                    depthTextureDesc.usage |= GPUTextureUsage.TEXTURE_BINDING
                } else {
                    depthTextureDesc.usage |= GPUTextureUsage.COPY_SRC
                }
                const depthTexture = wgpu.createTexture(depthTextureDesc)
                this.depthAttachment.depthTexture = depthTexture
                this.depthAttachment.depthTextureInternal = true
                renderingView = depthTexture.createView()
            } else {
                this.depthAttachment = new DepthAttachment(depthBuffer.impl.format)
                if (samples > 1) {
                    const depthFormat = 'depth24plus-stencil8'
                    this.depthAttachment.format = depthFormat
                    this.depthAttachment.hasStencil = depthFormat === 'depth24plus-stencil8'
                    const key = `${depthBuffer.id}:${width}:${height}:${samples}:${depthFormat}`
                    const msTextures = getMultisampledTextureCache(device)
                    let msDepthTexture = msTextures.get(key)
                    if (!msDepthTexture) {
                        const multisampledDepthDesc = {
                            size: [width, height, 1],
                            dimension: '2d',
                            sampleCount: samples,
                            format: depthFormat,
                            usage:
                                GPUTextureUsage.RENDER_ATTACHMENT |
                                (depthFormat !== depthBuffer.impl.format ? GPUTextureUsage.TEXTURE_BINDING : 0),
                        }
                        msDepthTexture = wgpu.createTexture(multisampledDepthDesc)
                        msTextures.set(key, msDepthTexture)
                    }
                    this.depthAttachment.multisampledDepthBuffer = msDepthTexture
                    this.depthAttachment.multisampledDepthBufferKey = key
                    renderingView = msDepthTexture.createView()
                } else {
                    const depthTexture = depthBuffer.impl.gpuTexture
                    this.depthAttachment.depthTexture = depthTexture
                    renderingView = depthTexture.createView()
                }
            }
            this.renderPassDescriptor.depthStencilAttachment = {
                view: renderingView,
            }
        }
    }
    initColor(device, wgpu, renderTarget, index) {
        const colorAttachment = {}
        const { samples, width, height, mipLevel } = renderTarget
        const colorBuffer = renderTarget.getColorBuffer(index)
        let colorView = null
        if (colorBuffer) {
            const mipLevelCount = 1
            if (colorBuffer.cubemap) {
                colorView = colorBuffer.impl.createView({
                    dimension: '2d',
                    baseArrayLayer: renderTarget.face,
                    arrayLayerCount: 1,
                    mipLevelCount,
                    baseMipLevel: mipLevel,
                })
            } else {
                colorView = colorBuffer.impl.createView({
                    mipLevelCount,
                    baseMipLevel: mipLevel,
                })
            }
        }
        if (samples > 1) {
            const format = this.isBackbuffer ? device.backBufferViewFormat : colorBuffer.impl.format
            const multisampledTextureDesc = {
                size: [width, height, 1],
                dimension: '2d',
                sampleCount: samples,
                format: format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            }
            const multisampledColorBuffer = wgpu.createTexture(multisampledTextureDesc)
            this.setColorAttachment(index, multisampledColorBuffer, multisampledTextureDesc.format)
            colorAttachment.view = multisampledColorBuffer.createView()
            colorAttachment.resolveTarget = colorView
        } else {
            colorAttachment.view = colorView
        }
        return colorAttachment
    }
    setupForRenderPass(renderPass, renderTarget) {
        const count = this.renderPassDescriptor.colorAttachments?.length ?? 0
        for (let i = 0; i < count; ++i) {
            const colorAttachment = this.renderPassDescriptor.colorAttachments[i]
            const colorOps = renderPass.colorArrayOps[i]
            const srgb = renderTarget.isColorBufferSrgb(i)
            colorAttachment.clearValue = srgb ? colorOps.clearValueLinear : colorOps.clearValue
            colorAttachment.loadOp = colorOps.clear ? 'clear' : 'load'
            colorAttachment.storeOp = colorOps.store ? 'store' : 'discard'
        }
        const depthAttachment = this.renderPassDescriptor.depthStencilAttachment
        if (depthAttachment) {
            depthAttachment.depthClearValue = renderPass.depthStencilOps.clearDepthValue
            depthAttachment.depthLoadOp = renderPass.depthStencilOps.clearDepth ? 'clear' : 'load'
            depthAttachment.depthStoreOp = renderPass.depthStencilOps.storeDepth ? 'store' : 'discard'
            depthAttachment.depthReadOnly = false
            if (this.depthAttachment.hasStencil) {
                depthAttachment.stencilClearValue = renderPass.depthStencilOps.clearStencilValue
                depthAttachment.stencilLoadOp = renderPass.depthStencilOps.clearStencil ? 'clear' : 'load'
                depthAttachment.stencilStoreOp = renderPass.depthStencilOps.storeStencil ? 'store' : 'discard'
                depthAttachment.stencilReadOnly = false
            }
        }
    }
    loseContext() {
        this.initialized = false
    }
    resolve(device, target, color, depth) {}
    constructor(renderTarget) {
        this.initialized = false
        this.colorAttachments = []
        this.depthAttachment = null
        this.assignedColorTexture = null
        this.renderPassDescriptor = {}
        this.isBackbuffer = false
        this.renderTarget = renderTarget
    }
}

const uniformTypeToNumComponents = []
uniformTypeToNumComponents[UNIFORMTYPE_FLOAT] = 1
uniformTypeToNumComponents[UNIFORMTYPE_VEC2] = 2
uniformTypeToNumComponents[UNIFORMTYPE_VEC3] = 3
uniformTypeToNumComponents[UNIFORMTYPE_VEC4] = 4
uniformTypeToNumComponents[UNIFORMTYPE_INT] = 1
uniformTypeToNumComponents[UNIFORMTYPE_IVEC2] = 2
uniformTypeToNumComponents[UNIFORMTYPE_IVEC3] = 3
uniformTypeToNumComponents[UNIFORMTYPE_IVEC4] = 4
uniformTypeToNumComponents[UNIFORMTYPE_BOOL] = 1
uniformTypeToNumComponents[UNIFORMTYPE_BVEC2] = 2
uniformTypeToNumComponents[UNIFORMTYPE_BVEC3] = 3
uniformTypeToNumComponents[UNIFORMTYPE_BVEC4] = 4
uniformTypeToNumComponents[UNIFORMTYPE_MAT2] = 8
uniformTypeToNumComponents[UNIFORMTYPE_MAT3] = 12
uniformTypeToNumComponents[UNIFORMTYPE_MAT4] = 16
uniformTypeToNumComponents[UNIFORMTYPE_UINT] = 1
uniformTypeToNumComponents[UNIFORMTYPE_UVEC2] = 2
uniformTypeToNumComponents[UNIFORMTYPE_UVEC3] = 3
uniformTypeToNumComponents[UNIFORMTYPE_UVEC4] = 4
class UniformFormat {
    get isArrayType() {
        return this.count > 0
    }
    calculateOffset(offset) {
        let alignment = this.byteSize <= 8 ? this.byteSize : 16
        if (this.count) {
            alignment = 16
        }
        offset = math.roundUp(offset, alignment)
        this.offset = offset / 4
    }
    constructor(name, type, count = 0) {
        this.shortName = name
        this.name = count ? `${name}[0]` : name
        this.type = type
        this.numComponents = uniformTypeToNumComponents[type]
        this.updateType = type
        if (count > 0) {
            switch (type) {
                case UNIFORMTYPE_FLOAT:
                    this.updateType = UNIFORMTYPE_FLOATARRAY
                    break
                case UNIFORMTYPE_INT:
                    this.updateType = UNIFORMTYPE_INTARRAY
                    break
                case UNIFORMTYPE_UINT:
                    this.updateType = UNIFORMTYPE_UINTARRAY
                    break
                case UNIFORMTYPE_BOOL:
                    this.updateType = UNIFORMTYPE_BOOLARRAY
                    break
                case UNIFORMTYPE_VEC2:
                    this.updateType = UNIFORMTYPE_VEC2ARRAY
                    break
                case UNIFORMTYPE_IVEC2:
                    this.updateType = UNIFORMTYPE_IVEC2ARRAY
                    break
                case UNIFORMTYPE_UVEC2:
                    this.updateType = UNIFORMTYPE_UVEC2ARRAY
                    break
                case UNIFORMTYPE_BVEC2:
                    this.updateType = UNIFORMTYPE_BVEC2ARRAY
                    break
                case UNIFORMTYPE_VEC3:
                    this.updateType = UNIFORMTYPE_VEC3ARRAY
                    break
                case UNIFORMTYPE_IVEC3:
                    this.updateType = UNIFORMTYPE_IVEC3ARRAY
                    break
                case UNIFORMTYPE_UVEC3:
                    this.updateType = UNIFORMTYPE_UVEC3ARRAY
                    break
                case UNIFORMTYPE_BVEC3:
                    this.updateType = UNIFORMTYPE_BVEC3ARRAY
                    break
                case UNIFORMTYPE_VEC4:
                    this.updateType = UNIFORMTYPE_VEC4ARRAY
                    break
                case UNIFORMTYPE_IVEC4:
                    this.updateType = UNIFORMTYPE_IVEC4ARRAY
                    break
                case UNIFORMTYPE_UVEC4:
                    this.updateType = UNIFORMTYPE_UVEC4ARRAY
                    break
                case UNIFORMTYPE_BVEC4:
                    this.updateType = UNIFORMTYPE_BVEC4ARRAY
                    break
                case UNIFORMTYPE_MAT4:
                    this.updateType = UNIFORMTYPE_MAT4ARRAY
                    break
            }
        }
        this.count = count
        let componentSize = this.numComponents
        if (count) {
            componentSize = math.roundUp(componentSize, 4)
        }
        this.byteSize = componentSize * 4
        if (count) {
            this.byteSize *= count
        }
    }
}
class UniformBufferFormat {
    get(name) {
        return this.map.get(name)
    }
    constructor(graphicsDevice, uniforms) {
        this.byteSize = 0
        this.map = new Map()
        this.scope = graphicsDevice.scope
        this.uniforms = uniforms
        let offset = 0
        for (let i = 0; i < uniforms.length; i++) {
            const uniform = uniforms[i]
            uniform.calculateOffset(offset)
            offset = uniform.offset * 4 + uniform.byteSize
            uniform.scopeId = this.scope.resolve(uniform.name)
            this.map.set(uniform.name, uniform)
        }
        this.byteSize = math.roundUp(offset, 16)
    }
}

const KEYWORD$2 = /[ \t]*(\battribute\b|\bvarying\b|\buniform\b)/g
const KEYWORD_LINE$1 = /(\battribute\b|\bvarying\b|\bout\b|\buniform\b)[ \t]*([^;]+)(;+)/g
const MARKER$1 = '@@@'
const ARRAY_IDENTIFIER = /([\w-]+)\[(.*?)\]/
const precisionQualifiers = new Set(['highp', 'mediump', 'lowp'])
const shadowSamplers = new Set(['sampler2DShadow', 'samplerCubeShadow', 'sampler2DArrayShadow'])
const textureDimensions = {
    sampler2D: TEXTUREDIMENSION_2D,
    sampler3D: TEXTUREDIMENSION_3D,
    samplerCube: TEXTUREDIMENSION_CUBE,
    samplerCubeShadow: TEXTUREDIMENSION_CUBE,
    sampler2DShadow: TEXTUREDIMENSION_2D,
    sampler2DArray: TEXTUREDIMENSION_2D_ARRAY,
    sampler2DArrayShadow: TEXTUREDIMENSION_2D_ARRAY,
    isampler2D: TEXTUREDIMENSION_2D,
    usampler2D: TEXTUREDIMENSION_2D,
    isampler3D: TEXTUREDIMENSION_3D,
    usampler3D: TEXTUREDIMENSION_3D,
    isamplerCube: TEXTUREDIMENSION_CUBE,
    usamplerCube: TEXTUREDIMENSION_CUBE,
    isampler2DArray: TEXTUREDIMENSION_2D_ARRAY,
    usampler2DArray: TEXTUREDIMENSION_2D_ARRAY,
}
const textureDimensionInfo = {
    [TEXTUREDIMENSION_2D]: 'texture2D',
    [TEXTUREDIMENSION_CUBE]: 'textureCube',
    [TEXTUREDIMENSION_3D]: 'texture3D',
    [TEXTUREDIMENSION_2D_ARRAY]: 'texture2DArray',
}
let UniformLine$1 = class UniformLine {
    constructor(line, shader) {
        this.line = line
        const words = line.trim().split(/\s+/)
        if (precisionQualifiers.has(words[0])) {
            this.precision = words.shift()
        }
        this.type = words.shift()
        if (line.includes(','));
        if (line.includes('[')) {
            const rest = words.join(' ')
            const match = ARRAY_IDENTIFIER.exec(rest)
            this.name = match[1]
            this.arraySize = Number(match[2])
            if (isNaN(this.arraySize)) {
                shader.failed = true
            }
        } else {
            this.name = words.shift()
            this.arraySize = 0
        }
        this.isSampler = this.type.indexOf('sampler') !== -1
        this.isSignedInt = this.type.indexOf('isampler') !== -1
        this.isUnsignedInt = this.type.indexOf('usampler') !== -1
    }
}
class ShaderProcessorGLSL {
    static run(device, shaderDefinition, shader) {
        const varyingMap = new Map()
        const vertexExtracted = ShaderProcessorGLSL.extract(shaderDefinition.vshader)
        const fragmentExtracted = ShaderProcessorGLSL.extract(shaderDefinition.fshader)
        const attributesMap = new Map()
        const attributesBlock = ShaderProcessorGLSL.processAttributes(
            vertexExtracted.attributes,
            shaderDefinition.attributes,
            attributesMap,
            shaderDefinition.processingOptions,
        )
        const vertexVaryingsBlock = ShaderProcessorGLSL.processVaryings(vertexExtracted.varyings, varyingMap, true)
        const fragmentVaryingsBlock = ShaderProcessorGLSL.processVaryings(fragmentExtracted.varyings, varyingMap, false)
        const outBlock = ShaderProcessorGLSL.processOuts(fragmentExtracted.outs)
        const concatUniforms = vertexExtracted.uniforms.concat(fragmentExtracted.uniforms)
        const uniforms = Array.from(new Set(concatUniforms))
        const parsedUniforms = uniforms.map((line) => new UniformLine$1(line, shader))
        const uniformsData = ShaderProcessorGLSL.processUniforms(
            device,
            parsedUniforms,
            shaderDefinition.processingOptions,
            shader,
        )
        const vBlock = `${attributesBlock}\n${vertexVaryingsBlock}\n${uniformsData.code}`
        const vshader = vertexExtracted.src.replace(MARKER$1, vBlock)
        const fBlock = `${fragmentVaryingsBlock}\n${outBlock}\n${uniformsData.code}`
        const fshader = fragmentExtracted.src.replace(MARKER$1, fBlock)
        return {
            vshader: vshader,
            fshader: fshader,
            attributes: attributesMap,
            meshUniformBufferFormat: uniformsData.meshUniformBufferFormat,
            meshBindGroupFormat: uniformsData.meshBindGroupFormat,
        }
    }
    static extract(src) {
        const attributes = []
        const varyings = []
        const outs = []
        const uniforms = []
        let replacement = `${MARKER$1}\n`
        let match
        while ((match = KEYWORD$2.exec(src)) !== null) {
            const keyword = match[1]
            switch (keyword) {
                case 'attribute':
                case 'varying':
                case 'uniform':
                case 'out': {
                    KEYWORD_LINE$1.lastIndex = match.index
                    const lineMatch = KEYWORD_LINE$1.exec(src)
                    if (keyword === 'attribute') {
                        attributes.push(lineMatch[2])
                    } else if (keyword === 'varying') {
                        varyings.push(lineMatch[2])
                    } else if (keyword === 'out') {
                        outs.push(lineMatch[2])
                    } else if (keyword === 'uniform') {
                        uniforms.push(lineMatch[2])
                    }
                    src = ShaderProcessorGLSL.cutOut(src, match.index, KEYWORD_LINE$1.lastIndex, replacement)
                    KEYWORD$2.lastIndex = match.index + replacement.length
                    replacement = ''
                    break
                }
            }
        }
        return {
            src,
            attributes,
            varyings,
            outs,
            uniforms,
        }
    }
    static processUniforms(device, uniforms, processingOptions, shader) {
        const uniformLinesSamplers = []
        const uniformLinesNonSamplers = []
        uniforms.forEach((uniform) => {
            if (uniform.isSampler) {
                uniformLinesSamplers.push(uniform)
            } else {
                uniformLinesNonSamplers.push(uniform)
            }
        })
        const meshUniforms = []
        uniformLinesNonSamplers.forEach((uniform) => {
            if (!processingOptions.hasUniform(uniform.name)) {
                const uniformType = uniformTypeToName.indexOf(uniform.type)
                const uniformFormat = new UniformFormat(uniform.name, uniformType, uniform.arraySize)
                meshUniforms.push(uniformFormat)
            }
        })
        if (meshUniforms.length === 0) {
            meshUniforms.push(new UniformFormat(UNUSED_UNIFORM_NAME, UNIFORMTYPE_FLOAT))
        }
        const meshUniformBufferFormat = meshUniforms.length ? new UniformBufferFormat(device, meshUniforms) : null
        const textureFormats = []
        uniformLinesSamplers.forEach((uniform) => {
            if (!processingOptions.hasTexture(uniform.name)) {
                let sampleType = SAMPLETYPE_FLOAT
                if (uniform.isSignedInt) {
                    sampleType = SAMPLETYPE_INT
                } else if (uniform.isUnsignedInt) {
                    sampleType = SAMPLETYPE_UINT
                } else {
                    if (uniform.precision === 'highp') {
                        sampleType = SAMPLETYPE_UNFILTERABLE_FLOAT
                    }
                    if (shadowSamplers.has(uniform.type)) {
                        sampleType = SAMPLETYPE_DEPTH
                    }
                }
                const dimension = textureDimensions[uniform.type]
                textureFormats.push(
                    new BindTextureFormat(
                        uniform.name,
                        SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT,
                        dimension,
                        sampleType,
                    ),
                )
            }
        })
        const meshBindGroupFormat = new BindGroupFormat(device, textureFormats)
        let code = ''
        processingOptions.uniformFormats.forEach((format, bindGroupIndex) => {
            if (format) {
                code += ShaderProcessorGLSL.getUniformShaderDeclaration(format, bindGroupIndex, 0)
            }
        })
        if (meshUniformBufferFormat) {
            code += ShaderProcessorGLSL.getUniformShaderDeclaration(meshUniformBufferFormat, BINDGROUP_MESH_UB, 0)
        }
        processingOptions.bindGroupFormats.forEach((format, bindGroupIndex) => {
            if (format) {
                code += ShaderProcessorGLSL.getTexturesShaderDeclaration(format, bindGroupIndex)
            }
        })
        code += ShaderProcessorGLSL.getTexturesShaderDeclaration(meshBindGroupFormat, BINDGROUP_MESH)
        return {
            code,
            meshUniformBufferFormat,
            meshBindGroupFormat,
        }
    }
    static processVaryings(varyingLines, varyingMap, isVertex) {
        let block = ''
        const op = isVertex ? 'out' : 'in'
        varyingLines.forEach((line, index) => {
            const words = ShaderProcessorGLSL.splitToWords(line)
            const type = words.slice(0, -1).join(' ')
            const name = words[words.length - 1]
            if (isVertex) {
                varyingMap.set(name, index)
            } else {
                index = varyingMap.get(name)
            }
            block += `layout(location = ${index}) ${op} ${type} ${name};\n`
        })
        return block
    }
    static processOuts(outsLines) {
        let block = ''
        outsLines.forEach((line, index) => {
            block += `layout(location = ${index}) out ${line};\n`
        })
        return block
    }
    static getTypeCount(type) {
        const lastChar = type.substring(type.length - 1)
        const num = parseInt(lastChar, 10)
        return isNaN(num) ? 1 : num
    }
    static processAttributes(attributeLines, shaderDefinitionAttributes, attributesMap, processingOptions) {
        let block = ''
        attributeLines.forEach((line) => {
            const words = ShaderProcessorGLSL.splitToWords(line)
            let type = words[0]
            let name = words[1]
            if (shaderDefinitionAttributes.hasOwnProperty(name)) {
                const semantic = shaderDefinitionAttributes[name]
                const location = semanticToLocation[semantic]
                attributesMap.set(location, name)
                let copyCode
                const element = processingOptions.getVertexElement(semantic)
                if (element) {
                    const dataType = element.dataType
                    if (
                        dataType !== TYPE_FLOAT32 &&
                        dataType !== TYPE_FLOAT16 &&
                        !element.normalize &&
                        !element.asInt
                    ) {
                        const attribNumElements = ShaderProcessorGLSL.getTypeCount(type)
                        const newName = `_private_${name}`
                        copyCode = `vec${attribNumElements} ${name} = vec${attribNumElements}(${newName});\n`
                        name = newName
                        const isSignedType =
                            dataType === TYPE_INT8 || dataType === TYPE_INT16 || dataType === TYPE_INT32
                        if (attribNumElements === 1) {
                            type = isSignedType ? 'int' : 'uint'
                        } else {
                            type = isSignedType ? `ivec${attribNumElements}` : `uvec${attribNumElements}`
                        }
                    }
                }
                block += `layout(location = ${location}) in ${type} ${name};\n`
                if (copyCode) {
                    block += copyCode
                }
            }
        })
        return block
    }
    static splitToWords(line) {
        line = line.replace(/\s+/g, ' ').trim()
        return line.split(' ')
    }
    static cutOut(src, start, end, replacement) {
        return src.substring(0, start) + replacement + src.substring(end)
    }
    static getUniformShaderDeclaration(format, bindGroup, bindIndex) {
        const name = bindGroupNames[bindGroup]
        let code = `layout(set = ${bindGroup}, binding = ${bindIndex}, std140) uniform ub_${name} {\n`
        format.uniforms.forEach((uniform) => {
            const typeString = uniformTypeToName[uniform.type]
            code += `    ${typeString} ${uniform.shortName}${uniform.count ? `[${uniform.count}]` : ''};\n`
        })
        return `${code}};\n`
    }
    static getTexturesShaderDeclaration(bindGroupFormat, bindGroup) {
        let code = ''
        bindGroupFormat.textureFormats.forEach((format) => {
            let textureType = textureDimensionInfo[format.textureDimension]
            const isArray = textureType === 'texture2DArray'
            const sampleTypePrefix =
                format.sampleType === SAMPLETYPE_UINT ? 'u' : format.sampleType === SAMPLETYPE_INT ? 'i' : ''
            textureType = `${sampleTypePrefix}${textureType}`
            let namePostfix = ''
            let extraCode = ''
            if (isArray) {
                namePostfix = '_texture'
                extraCode = `#define ${format.name} ${sampleTypePrefix}sampler2DArray(${format.name}${namePostfix}, ${format.name}_sampler)\n`
            }
            code += `layout(set = ${bindGroup}, binding = ${format.slot}) uniform ${textureType} ${format.name}${namePostfix};\n`
            if (format.hasSampler) {
                code += `layout(set = ${bindGroup}, binding = ${format.slot + 1}) uniform sampler ${format.name}_sampler;\n`
            }
            code += extraCode
        })
        return code
    }
}

const KEYWORD$1 = /^[ \t]*(attribute|varying|uniform)[\t ]+/gm
const KEYWORD_LINE = /^[ \t]*(attribute|varying|uniform)[ \t]*([^;]+)(;+)/gm
const KEYWORD_RESOURCE =
    /^[ \t]*var\s*(?:(<storage,[^>]*>)\s*([\w\d_]+)\s*:\s*(.*?)\s*;|(<(?!storage,)[^>]*>)?\s*([\w\d_]+)\s*:\s*(texture_.*|storage_texture_.*|storage\w.*|external_texture|sampler(?:_comparison)?)\s*;)\s*$/gm
const VARYING = /(?:@interpolate\([^)]*\)\s*)?([\w]+)\s*:\s*([\w<>]+)/
const MARKER = '@@@'
const ENTRY_FUNCTION = /(@vertex|@fragment)\s*fn\s+\w+\s*\(\s*(\w+)\s*:[\s\S]*?\{/
const textureBaseInfo = {
    texture_1d: {
        viewDimension: TEXTUREDIMENSION_1D,
        baseSampleType: SAMPLETYPE_FLOAT,
    },
    texture_2d: {
        viewDimension: TEXTUREDIMENSION_2D,
        baseSampleType: SAMPLETYPE_FLOAT,
    },
    texture_2d_array: {
        viewDimension: TEXTUREDIMENSION_2D_ARRAY,
        baseSampleType: SAMPLETYPE_FLOAT,
    },
    texture_3d: {
        viewDimension: TEXTUREDIMENSION_3D,
        baseSampleType: SAMPLETYPE_FLOAT,
    },
    texture_cube: {
        viewDimension: TEXTUREDIMENSION_CUBE,
        baseSampleType: SAMPLETYPE_FLOAT,
    },
    texture_cube_array: {
        viewDimension: TEXTUREDIMENSION_CUBE_ARRAY,
        baseSampleType: SAMPLETYPE_FLOAT,
    },
    texture_multisampled_2d: {
        viewDimension: TEXTUREDIMENSION_2D,
        baseSampleType: SAMPLETYPE_FLOAT,
    },
    texture_depth_2d: {
        viewDimension: TEXTUREDIMENSION_2D,
        baseSampleType: SAMPLETYPE_DEPTH,
    },
    texture_depth_2d_array: {
        viewDimension: TEXTUREDIMENSION_2D_ARRAY,
        baseSampleType: SAMPLETYPE_DEPTH,
    },
    texture_depth_cube: {
        viewDimension: TEXTUREDIMENSION_CUBE,
        baseSampleType: SAMPLETYPE_DEPTH,
    },
    texture_depth_cube_array: {
        viewDimension: TEXTUREDIMENSION_CUBE_ARRAY,
        baseSampleType: SAMPLETYPE_DEPTH,
    },
    texture_external: {
        viewDimension: TEXTUREDIMENSION_2D,
        baseSampleType: SAMPLETYPE_UNFILTERABLE_FLOAT,
    },
}
const getTextureInfo = (baseType, componentType) => {
    const baseInfo = textureBaseInfo[baseType]
    let finalSampleType = baseInfo.baseSampleType
    if (baseInfo.baseSampleType === SAMPLETYPE_FLOAT && baseType !== 'texture_multisampled_2d') {
        switch (componentType) {
            case 'u32':
                finalSampleType = SAMPLETYPE_UINT
                break
            case 'i32':
                finalSampleType = SAMPLETYPE_INT
                break
            case 'f32':
                finalSampleType = SAMPLETYPE_FLOAT
                break
            case 'uff':
                finalSampleType = SAMPLETYPE_UNFILTERABLE_FLOAT
                break
        }
    }
    return {
        viewDimension: baseInfo.viewDimension,
        sampleType: finalSampleType,
    }
}
const getTextureDeclarationType = (viewDimension, sampleType) => {
    if (sampleType === SAMPLETYPE_DEPTH) {
        switch (viewDimension) {
            case TEXTUREDIMENSION_2D:
                return 'texture_depth_2d'
            case TEXTUREDIMENSION_2D_ARRAY:
                return 'texture_depth_2d_array'
            case TEXTUREDIMENSION_CUBE:
                return 'texture_depth_cube'
            case TEXTUREDIMENSION_CUBE_ARRAY:
                return 'texture_depth_cube_array'
        }
    }
    let baseTypeString
    switch (viewDimension) {
        case TEXTUREDIMENSION_1D:
            baseTypeString = 'texture_1d'
            break
        case TEXTUREDIMENSION_2D:
            baseTypeString = 'texture_2d'
            break
        case TEXTUREDIMENSION_2D_ARRAY:
            baseTypeString = 'texture_2d_array'
            break
        case TEXTUREDIMENSION_3D:
            baseTypeString = 'texture_3d'
            break
        case TEXTUREDIMENSION_CUBE:
            baseTypeString = 'texture_cube'
            break
        case TEXTUREDIMENSION_CUBE_ARRAY:
            baseTypeString = 'texture_cube_array'
            break
    }
    let coreFormatString
    switch (sampleType) {
        case SAMPLETYPE_FLOAT:
        case SAMPLETYPE_UNFILTERABLE_FLOAT:
            coreFormatString = 'f32'
            break
        case SAMPLETYPE_UINT:
            coreFormatString = 'u32'
            break
        case SAMPLETYPE_INT:
            coreFormatString = 'i32'
            break
    }
    return `${baseTypeString}<${coreFormatString}>`
}
const wrappedArrayTypes = {
    f32: 'WrappedF32',
    i32: 'WrappedI32',
    u32: 'WrappedU32',
    vec2f: 'WrappedVec2F',
    vec2i: 'WrappedVec2I',
    vec2u: 'WrappedVec2U',
}
const splitToWords = (line) => {
    line = line.replace(/\s+/g, ' ').trim()
    return line.split(/[\s:]+/)
}
const UNIFORM_ARRAY_REGEX = /array<([^,]+),\s*([^>]+)>/
class UniformLine {
    constructor(line, shader) {
        this.ubName = null
        this.arraySize = 0
        this.line = line
        const parts = splitToWords(line)
        if (parts.length < 2) {
            shader.failed = true
            return
        }
        this.name = parts[0]
        this.type = parts.slice(1).join(' ')
        if (this.type.includes('array<')) {
            const match = UNIFORM_ARRAY_REGEX.exec(this.type)
            this.type = match[1].trim()
            this.arraySize = Number(match[2])
            if (isNaN(this.arraySize)) {
                shader.failed = true
            }
        }
    }
}
const TEXTURE_REGEX = /^\s*var\s+(\w+)\s*:\s*(texture_\w+)(?:<(\w+)>)?;\s*$/
const STORAGE_TEXTURE_REGEX =
    /^\s*var\s+([\w\d_]+)\s*:\s*(texture_storage_2d|texture_storage_2d_array)<([\w\d_]+),\s*(\w+)>\s*;\s*$/
const STORAGE_BUFFER_REGEX = /^\s*var\s*<storage,\s*(read|write)?>\s*([\w\d_]+)\s*:\s*(.*)\s*;\s*$/
const EXTERNAL_TEXTURE_REGEX = /^\s*var\s+([\w\d_]+)\s*:\s*texture_external;\s*$/
const SAMPLER_REGEX = /^\s*var\s+([\w\d_]+)\s*:\s*(sampler|sampler_comparison)\s*;\s*$/
class ResourceLine {
    equals(other) {
        if (this.name !== other.name) return false
        if (this.type !== other.type) return false
        if (this.isTexture !== other.isTexture) return false
        if (this.isSampler !== other.isSampler) return false
        if (this.isStorageTexture !== other.isStorageTexture) return false
        if (this.isStorageBuffer !== other.isStorageBuffer) return false
        if (this.isExternalTexture !== other.isExternalTexture) return false
        if (this.textureFormat !== other.textureFormat) return false
        if (this.textureDimension !== other.textureDimension) return false
        if (this.sampleType !== other.sampleType) return false
        if (this.textureType !== other.textureType) return false
        if (this.format !== other.format) return false
        if (this.access !== other.access) return false
        if (this.accessMode !== other.accessMode) return false
        if (this.samplerType !== other.samplerType) return false
        return true
    }
    constructor(line, shader) {
        this.originalLine = line
        this.line = line
        this.isTexture = false
        this.isSampler = false
        this.isStorageTexture = false
        this.isStorageBuffer = false
        this.isExternalTexture = false
        this.type = ''
        this.matchedElements = []
        const textureMatch = this.line.match(TEXTURE_REGEX)
        if (textureMatch) {
            this.name = textureMatch[1]
            this.type = textureMatch[2]
            this.textureFormat = textureMatch[3]
            this.isTexture = true
            this.matchedElements.push(...textureMatch)
            const info = getTextureInfo(this.type, this.textureFormat)
            this.textureDimension = info.viewDimension
            this.sampleType = info.sampleType
        }
        const storageTextureMatch = this.line.match(STORAGE_TEXTURE_REGEX)
        if (storageTextureMatch) {
            this.isStorageTexture = true
            this.name = storageTextureMatch[1]
            this.textureType = storageTextureMatch[2]
            this.format = storageTextureMatch[3]
            this.access = storageTextureMatch[4]
            this.matchedElements.push(...storageTextureMatch)
        }
        const storageBufferMatch = this.line.match(STORAGE_BUFFER_REGEX)
        if (storageBufferMatch) {
            this.isStorageBuffer = true
            this.accessMode = storageBufferMatch[1] || 'none'
            this.name = storageBufferMatch[2]
            this.type = storageBufferMatch[3]
            this.matchedElements.push(...storageBufferMatch)
        }
        const externalTextureMatch = this.line.match(EXTERNAL_TEXTURE_REGEX)
        if (externalTextureMatch) {
            this.name = externalTextureMatch[1]
            this.isExternalTexture = true
            this.matchedElements.push(...storageBufferMatch)
        }
        const samplerMatch = this.line.match(SAMPLER_REGEX)
        if (samplerMatch) {
            this.name = samplerMatch[1]
            this.samplerType = samplerMatch[2]
            this.isSampler = true
            this.matchedElements.push(...samplerMatch)
        }
        if (this.matchedElements.length === 0) {
            shader.failed = true
        }
    }
}
class WebgpuShaderProcessorWGSL {
    static run(device, shaderDefinition, shader) {
        const varyingMap = new Map()
        const vertexExtracted = WebgpuShaderProcessorWGSL.extract(shaderDefinition.vshader)
        const fragmentExtracted = WebgpuShaderProcessorWGSL.extract(shaderDefinition.fshader)
        const attributesMap = new Map()
        const attributesBlock = WebgpuShaderProcessorWGSL.processAttributes(
            vertexExtracted.attributes,
            shaderDefinition.attributes,
            attributesMap,
            shaderDefinition.processingOptions,
            shader,
        )
        const vertexVaryingsBlock = WebgpuShaderProcessorWGSL.processVaryings(
            vertexExtracted.varyings,
            varyingMap,
            true,
            device,
        )
        const fragmentVaryingsBlock = WebgpuShaderProcessorWGSL.processVaryings(
            fragmentExtracted.varyings,
            varyingMap,
            false,
            device,
        )
        const concatUniforms = vertexExtracted.uniforms.concat(fragmentExtracted.uniforms)
        const uniforms = Array.from(new Set(concatUniforms))
        const parsedUniforms = uniforms.map((line) => new UniformLine(line, shader))
        const uniformsData = WebgpuShaderProcessorWGSL.processUniforms(
            device,
            parsedUniforms,
            shaderDefinition.processingOptions,
            shader,
        )
        vertexExtracted.src = WebgpuShaderProcessorWGSL.renameUniformAccess(vertexExtracted.src, parsedUniforms)
        fragmentExtracted.src = WebgpuShaderProcessorWGSL.renameUniformAccess(fragmentExtracted.src, parsedUniforms)
        const parsedResources = WebgpuShaderProcessorWGSL.mergeResources(
            vertexExtracted.resources,
            fragmentExtracted.resources,
            shader,
        )
        const resourcesData = WebgpuShaderProcessorWGSL.processResources(
            device,
            parsedResources,
            shaderDefinition.processingOptions,
            shader,
        )
        const fOutput = WebgpuShaderProcessorWGSL.generateFragmentOutputStruct(
            fragmentExtracted.src,
            device.maxColorAttachments,
        )
        vertexExtracted.src = WebgpuShaderProcessorWGSL.copyInputs(vertexExtracted.src, shader)
        fragmentExtracted.src = WebgpuShaderProcessorWGSL.copyInputs(fragmentExtracted.src, shader)
        const vBlock = `${attributesBlock}\n${vertexVaryingsBlock}\n${uniformsData.code}\n${resourcesData.code}\n`
        const vshader = vertexExtracted.src.replace(MARKER, vBlock)
        const fBlock = `${fragmentVaryingsBlock}\n${fOutput}\n${uniformsData.code}\n${resourcesData.code}\n`
        const fshader = fragmentExtracted.src.replace(MARKER, fBlock)
        return {
            vshader: vshader,
            fshader: fshader,
            attributes: attributesMap,
            meshUniformBufferFormat: uniformsData.meshUniformBufferFormat,
            meshBindGroupFormat: resourcesData.meshBindGroupFormat,
        }
    }
    static extract(src) {
        const attributes = []
        const varyings = []
        const uniforms = []
        const resources = []
        let replacement = `${MARKER}\n`
        let match
        while ((match = KEYWORD$1.exec(src)) !== null) {
            const keyword = match[1]
            KEYWORD_LINE.lastIndex = match.index
            const lineMatch = KEYWORD_LINE.exec(src)
            if (keyword === 'attribute') {
                attributes.push(lineMatch[2])
            } else if (keyword === 'varying') {
                varyings.push(lineMatch[2])
            } else if (keyword === 'uniform') {
                uniforms.push(lineMatch[2])
            }
            src = WebgpuShaderProcessorWGSL.cutOut(src, match.index, KEYWORD_LINE.lastIndex, replacement)
            KEYWORD$1.lastIndex = match.index + replacement.length
            replacement = ''
        }
        while ((match = KEYWORD_RESOURCE.exec(src)) !== null) {
            resources.push(match[0])
            src = WebgpuShaderProcessorWGSL.cutOut(src, match.index, KEYWORD_RESOURCE.lastIndex, replacement)
            KEYWORD_RESOURCE.lastIndex = match.index + replacement.length
            replacement = ''
        }
        return {
            src,
            attributes,
            varyings,
            uniforms,
            resources,
        }
    }
    static processUniforms(device, uniforms, processingOptions, shader) {
        const meshUniforms = []
        uniforms.forEach((uniform) => {
            if (!processingOptions.hasUniform(uniform.name)) {
                uniform.ubName = 'ub_mesh_ub'
                const uniformType = uniformTypeToNameMapWGSL.get(uniform.type)
                const uniformFormat = new UniformFormat(uniform.name, uniformType, uniform.arraySize)
                meshUniforms.push(uniformFormat)
            } else {
                uniform.ubName = 'ub_view'
            }
        })
        if (meshUniforms.length === 0) {
            meshUniforms.push(new UniformFormat(UNUSED_UNIFORM_NAME, UNIFORMTYPE_FLOAT))
        }
        const meshUniformBufferFormat = new UniformBufferFormat(device, meshUniforms)
        let code = ''
        processingOptions.uniformFormats.forEach((format, bindGroupIndex) => {
            if (format) {
                code += WebgpuShaderProcessorWGSL.getUniformShaderDeclaration(format, bindGroupIndex, 0)
            }
        })
        if (meshUniformBufferFormat) {
            code += WebgpuShaderProcessorWGSL.getUniformShaderDeclaration(meshUniformBufferFormat, BINDGROUP_MESH_UB, 0)
        }
        return {
            code,
            meshUniformBufferFormat,
        }
    }
    static renameUniformAccess(source, uniforms) {
        uniforms.forEach((uniform) => {
            const srcName = `uniform.${uniform.name}`
            const dstName = `${uniform.ubName}.${uniform.name}`
            const regex = new RegExp(`\\b${srcName}\\b`, 'g')
            source = source.replace(regex, dstName)
        })
        return source
    }
    static mergeResources(vertex, fragment, shader) {
        const resources = vertex.map((line) => new ResourceLine(line, shader))
        const fragmentResources = fragment.map((line) => new ResourceLine(line, shader))
        fragmentResources.forEach((fragmentResource) => {
            const existing = resources.find((resource) => resource.name === fragmentResource.name)
            if (existing) {
                if (!existing.equals(fragmentResource)) {
                    shader.failed = true
                }
            } else {
                resources.push(fragmentResource)
            }
        })
        return resources
    }
    static processResources(device, resources, processingOptions, shader) {
        const textureFormats = []
        for (let i = 0; i < resources.length; i++) {
            const resource = resources[i]
            if (resource.isTexture) {
                const sampler = resources[i + 1]
                const hasSampler = sampler?.isSampler
                const sampleType = resource.sampleType
                const dimension = resource.textureDimension
                textureFormats.push(
                    new BindTextureFormat(
                        resource.name,
                        SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT,
                        dimension,
                        sampleType,
                        hasSampler,
                        hasSampler ? sampler.name : null,
                    ),
                )
                if (hasSampler) i++
            }
            if (resource.isStorageBuffer) {
                const readOnly = resource.accessMode !== 'read_write'
                const bufferFormat = new BindStorageBufferFormat(
                    resource.name,
                    SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT,
                    readOnly,
                )
                bufferFormat.format = resource.type
                textureFormats.push(bufferFormat)
            }
        }
        const meshBindGroupFormat = new BindGroupFormat(device, textureFormats)
        let code = ''
        processingOptions.bindGroupFormats.forEach((format, bindGroupIndex) => {
            if (format) {
                code += WebgpuShaderProcessorWGSL.getTextureShaderDeclaration(format, bindGroupIndex)
            }
        })
        code += WebgpuShaderProcessorWGSL.getTextureShaderDeclaration(meshBindGroupFormat, BINDGROUP_MESH)
        return {
            code,
            meshBindGroupFormat,
        }
    }
    static getUniformShaderDeclaration(ubFormat, bindGroup, bindIndex) {
        const name = bindGroupNames[bindGroup]
        const structName = `struct_ub_${name}`
        let code = `struct ${structName} {\n`
        ubFormat.uniforms.forEach((uniform) => {
            let typeString = uniformTypeToNameWGSL[uniform.type][0]
            if (uniform.count > 0) {
                if (wrappedArrayTypes.hasOwnProperty(typeString)) {
                    typeString = wrappedArrayTypes[typeString]
                }
                code += `    ${uniform.shortName}: array<${typeString}, ${uniform.count}>,\n`
            } else {
                code += `    ${uniform.shortName}: ${typeString},\n`
            }
        })
        code += '};\n'
        code += `@group(${bindGroup}) @binding(${bindIndex}) var<uniform> ub_${name} : ${structName};\n\n`
        return code
    }
    static getTextureShaderDeclaration(format, bindGroup) {
        let code = ''
        format.textureFormats.forEach((format) => {
            const textureTypeName = getTextureDeclarationType(format.textureDimension, format.sampleType)
            code += `@group(${bindGroup}) @binding(${format.slot}) var ${format.name}: ${textureTypeName};\n`
            if (format.hasSampler) {
                const samplerName = format.sampleType === SAMPLETYPE_DEPTH ? 'sampler_comparison' : 'sampler'
                code += `@group(${bindGroup}) @binding(${format.slot + 1}) var ${format.samplerName}: ${samplerName};\n`
            }
        })
        format.storageBufferFormats.forEach((format) => {
            const access = format.readOnly ? 'read' : 'read_write'
            code += `@group(${bindGroup}) @binding(${format.slot}) var<storage, ${access}> ${format.name} : ${format.format};\n`
        })
        return code
    }
    static processVaryings(varyingLines, varyingMap, isVertex, device) {
        let block = ''
        let blockPrivates = ''
        let blockCopy = ''
        varyingLines.forEach((line, index) => {
            const match = line.match(VARYING)
            if (match) {
                const name = match[1]
                const type = match[2]
                if (isVertex) {
                    varyingMap.set(name, index)
                } else {
                    index = varyingMap.get(name)
                }
                block += `    @location(${index}) ${line},\n`
                if (!isVertex) {
                    blockPrivates += `    var<private> ${name}: ${type};\n`
                    blockCopy += `    ${name} = input.${name};\n`
                }
            }
        })
        if (isVertex) {
            block += '    @builtin(position) position : vec4f,\n'
        } else {
            block += '    @builtin(position) position : vec4f,\n'
            block += '    @builtin(front_facing) frontFacing : bool,\n'
            block += '    @builtin(sample_index) sampleIndex : u32,\n'
            if (device.supportsPrimitiveIndex) {
                block += '    @builtin(primitive_index) primitiveIndex : u32,\n'
            }
        }
        const primitiveIndexGlobals = device.supportsPrimitiveIndex
            ? `
						var<private> pcPrimitiveIndex: u32;
				`
            : ''
        const primitiveIndexCopy = device.supportsPrimitiveIndex
            ? `
								pcPrimitiveIndex = input.primitiveIndex;
				`
            : ''
        const fragmentGlobals = isVertex
            ? ''
            : `
						var<private> pcPosition: vec4f;
						var<private> pcFrontFacing: bool;
						var<private> pcSampleIndex: u32;
						${primitiveIndexGlobals}
						${blockPrivates}
						
						// function to copy inputs (varyings) to private global variables
						fn _pcCopyInputs(input: FragmentInput) {
								${blockCopy}
								pcPosition = input.position;
								pcFrontFacing = input.frontFacing;
								pcSampleIndex = input.sampleIndex;
								${primitiveIndexCopy}
						}
				`
        const structName = isVertex ? 'VertexOutput' : 'FragmentInput'
        return `
						struct ${structName} {
								${block}
						};
						${fragmentGlobals}
				`
    }
    static generateFragmentOutputStruct(src, numRenderTargets) {
        let structCode = 'struct FragmentOutput {\n'
        const colorName = (i) => `color${i > 0 ? i : ''}`
        for (let i = 0; i < numRenderTargets; i++) {
            const name = colorName(i)
            if (src.search(new RegExp(`\\.${name}\\s*=`)) !== -1) {
                structCode += `    @location(${i}) ${name} : pcOutType${i},\n`
            }
        }
        const needsFragDepth = src.search(/\.fragDepth\s*=/) !== -1
        if (needsFragDepth) {
            structCode += '    @builtin(frag_depth) fragDepth : f32\n'
        }
        return `${structCode}};\n`
    }
    static floatAttributeToInt(type, signed) {
        const longToShortMap = {
            f32: 'f32',
            'vec2<f32>': 'vec2f',
            'vec3<f32>': 'vec3f',
            'vec4<f32>': 'vec4f',
        }
        const shortType = longToShortMap[type] || type
        const floatToIntShort = {
            f32: signed ? 'i32' : 'u32',
            vec2f: signed ? 'vec2i' : 'vec2u',
            vec3f: signed ? 'vec3i' : 'vec3u',
            vec4f: signed ? 'vec4i' : 'vec4u',
        }
        return floatToIntShort[shortType] || null
    }
    static processAttributes(
        attributeLines,
        shaderDefinitionAttributes = {},
        attributesMap,
        processingOptions,
        shader,
    ) {
        let blockAttributes = ''
        let blockPrivates = ''
        let blockCopy = ''
        attributeLines.forEach((line) => {
            const words = splitToWords(line)
            const name = words[0]
            let type = words[1]
            const originalType = type
            if (shaderDefinitionAttributes.hasOwnProperty(name)) {
                const semantic = shaderDefinitionAttributes[name]
                const location = semanticToLocation[semantic]
                attributesMap.set(location, name)
                const element = processingOptions.getVertexElement(semantic)
                if (element) {
                    const dataType = element.dataType
                    if (
                        dataType !== TYPE_FLOAT32 &&
                        dataType !== TYPE_FLOAT16 &&
                        !element.normalize &&
                        !element.asInt
                    ) {
                        const isSignedType =
                            dataType === TYPE_INT8 || dataType === TYPE_INT16 || dataType === TYPE_INT32
                        type = WebgpuShaderProcessorWGSL.floatAttributeToInt(type, isSignedType)
                    }
                }
                blockAttributes += `    @location(${location}) ${name}: ${type},\n`
                blockPrivates += `    var<private> ${line};\n`
                blockCopy += `    ${name} = ${originalType}(input.${name});\n`
            }
        })
        return `
						struct VertexInput {
								${blockAttributes}
								@builtin(vertex_index) vertexIndex : u32,       // built-in vertex index
								@builtin(instance_index) instanceIndex : u32    // built-in instance index
						};

						${blockPrivates}
						var<private> pcVertexIndex: u32;
						var<private> pcInstanceIndex: u32;

						fn _pcCopyInputs(input: VertexInput) {
								${blockCopy}
								pcVertexIndex = input.vertexIndex;
								pcInstanceIndex = input.instanceIndex;
						}
				`
    }
    static copyInputs(src, shader) {
        const match = src.match(ENTRY_FUNCTION)
        if (!match || !match[2]) {
            return src
        }
        const inputName = match[2]
        const braceIndex = match.index + match[0].length - 1
        const beginning = src.slice(0, braceIndex + 1)
        const end = src.slice(braceIndex + 1)
        const lineToInject = `\n    _pcCopyInputs(${inputName});`
        return beginning + lineToInject + end
    }
    static cutOut(src, start, end, replacement) {
        return src.substring(0, start) + replacement + src.substring(end)
    }
}

const computeShaderIds = new StringIds()
class WebgpuShader {
    destroy(shader) {
        this._vertexCode = null
        this._fragmentCode = null
    }
    createShaderModule(code, shaderType) {
        const device = this.shader.device
        const wgpu = device.wgpu
        const shaderModule = wgpu.createShaderModule({
            code: code,
        })
        return shaderModule
    }
    getVertexShaderModule() {
        return this.createShaderModule(this._vertexCode, 'Vertex')
    }
    getFragmentShaderModule() {
        return this.createShaderModule(this._fragmentCode, 'Fragment')
    }
    getComputeShaderModule() {
        return this.createShaderModule(this._computeCode, 'Compute')
    }
    processGLSL() {
        const shader = this.shader
        const processed = ShaderProcessorGLSL.run(shader.device, shader.definition, shader)
        this._vertexCode = this.transpile(processed.vshader, 'vertex', shader.definition.vshader)
        this._fragmentCode = this.transpile(processed.fshader, 'fragment', shader.definition.fshader)
        if (!(this._vertexCode && this._fragmentCode)) {
            shader.failed = true
        } else {
            shader.ready = true
        }
        shader.meshUniformBufferFormat = processed.meshUniformBufferFormat
        shader.meshBindGroupFormat = processed.meshBindGroupFormat
        shader.attributes = processed.attributes
    }
    processWGSL() {
        const shader = this.shader
        const processed = WebgpuShaderProcessorWGSL.run(shader.device, shader.definition, shader)
        this._vertexCode = processed.vshader
        this._fragmentCode = processed.fshader
        shader.meshUniformBufferFormat = processed.meshUniformBufferFormat
        shader.meshBindGroupFormat = processed.meshBindGroupFormat
        shader.attributes = processed.attributes
    }
    transpile(src, shaderType, originalSrc) {
        const device = this.shader.device
        if (!device.glslang || !device.twgsl) {
            console.error(
                `Cannot transpile shader [${this.shader.label}] - shader transpilers (glslang/twgsl) are not available. Make sure to provide glslangUrl and twgslUrl when creating the device.`,
                {
                    shader: this.shader,
                },
            )
            return null
        }
        try {
            const spirv = device.glslang.compileGLSL(src, shaderType)
            const wgsl = device.twgsl.convertSpirV2WGSL(spirv)
            return wgsl
        } catch (err) {
            console.error(
                `Failed to transpile webgl ${shaderType} shader [${this.shader.label}] to WebGPU while rendering ${void 0}, error:\n [${err.stack}]`,
                {
                    processed: src,
                    original: originalSrc,
                    shader: this.shader,
                    error: err,
                    stack: err.stack,
                },
            )
        }
    }
    get vertexCode() {
        return this._vertexCode
    }
    get fragmentCode() {
        return this._fragmentCode
    }
    get computeKey() {
        if (this._computeKey === undefined) {
            const keyString = `${this._computeCode}|${this.computeEntryPoint}`
            this._computeKey = computeShaderIds.get(keyString)
        }
        return this._computeKey
    }
    loseContext() {}
    restoreContext(device, shader) {}
    constructor(shader) {
        this._vertexCode = null
        this._fragmentCode = null
        this._computeCode = null
        this.vertexEntryPoint = 'main'
        this.fragmentEntryPoint = 'main'
        this.computeEntryPoint = 'main'
        this.shader = shader
        const definition = shader.definition
        if (definition.shaderLanguage === SHADERLANGUAGE_WGSL) {
            if (definition.cshader) {
                this._computeCode = definition.cshader ?? null
                this.computeUniformBufferFormats = definition.computeUniformBufferFormats
                this.computeBindGroupFormat = definition.computeBindGroupFormat
                if (definition.computeEntryPoint) {
                    this.computeEntryPoint = definition.computeEntryPoint
                }
            } else {
                this.vertexEntryPoint = 'vertexMain'
                this.fragmentEntryPoint = 'fragmentMain'
                if (definition.processingOptions) {
                    this.processWGSL()
                } else {
                    this._vertexCode = definition.vshader ?? null
                    this._fragmentCode = definition.fshader ?? null
                    shader.meshUniformBufferFormat = definition.meshUniformBufferFormat
                    shader.meshBindGroupFormat = definition.meshBindGroupFormat
                }
            }
            shader.ready = true
        } else {
            if (definition.processingOptions) {
                this.processGLSL()
            }
        }
    }
}

const gpuAddressModes = []
gpuAddressModes[ADDRESS_REPEAT] = 'repeat'
gpuAddressModes[ADDRESS_CLAMP_TO_EDGE] = 'clamp-to-edge'
gpuAddressModes[ADDRESS_MIRRORED_REPEAT] = 'mirror-repeat'
const gpuFilterModes = []
gpuFilterModes[FILTER_NEAREST] = {
    level: 'nearest',
    mip: 'nearest',
}
gpuFilterModes[FILTER_LINEAR] = {
    level: 'linear',
    mip: 'nearest',
}
gpuFilterModes[FILTER_NEAREST_MIPMAP_NEAREST] = {
    level: 'nearest',
    mip: 'nearest',
}
gpuFilterModes[FILTER_NEAREST_MIPMAP_LINEAR] = {
    level: 'nearest',
    mip: 'linear',
}
gpuFilterModes[FILTER_LINEAR_MIPMAP_NEAREST] = {
    level: 'linear',
    mip: 'nearest',
}
gpuFilterModes[FILTER_LINEAR_MIPMAP_LINEAR] = {
    level: 'linear',
    mip: 'linear',
}
const dummyUse = (thingOne) => {}
class WebgpuTexture {
    create(device) {
        const texture = this.texture
        const wgpu = device.wgpu
        const numLevels = texture.numLevels
        this.desc = {
            size: {
                width: texture.width,
                height: texture.height,
                depthOrArrayLayers: texture.cubemap ? 6 : texture.array ? texture.arrayLength : 1,
            },
            format: this.format,
            mipLevelCount: numLevels,
            sampleCount: 1,
            dimension: texture.volume ? '3d' : '2d',
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.COPY_SRC |
                (isCompressedPixelFormat(texture.format) ? 0 : GPUTextureUsage.RENDER_ATTACHMENT) |
                (texture.storage ? GPUTextureUsage.STORAGE_BINDING : 0),
        }
        this.gpuTexture = wgpu.createTexture(this.desc)
        let viewDescr
        if (this.texture.format === PIXELFORMAT_DEPTHSTENCIL) {
            viewDescr = {
                format: 'depth24plus',
                aspect: 'depth-only',
            }
        }
        this.view = this.createView(viewDescr)
        this.viewCache.clear()
    }
    destroy(device) {
        device.deferDestroy(this.gpuTexture)
        this.gpuTexture = null
        this.view = null
        this.viewCache.clear()
        this.samplers.length = 0
    }
    propertyChanged(flag) {
        this.samplers.length = 0
    }
    getView(device, textureView) {
        this.uploadImmediate(device, this.texture)
        if (textureView) {
            let view = this.viewCache.get(textureView.key)
            if (!view) {
                view = this.createView({
                    baseMipLevel: textureView.baseMipLevel,
                    mipLevelCount: textureView.mipLevelCount,
                    baseArrayLayer: textureView.baseArrayLayer,
                    arrayLayerCount: textureView.arrayLayerCount,
                })
                this.viewCache.set(textureView.key, view)
            }
            return view
        }
        return this.view
    }
    createView(viewDescr) {
        const options = viewDescr ?? {}
        const textureDescr = this.desc
        const texture = this.texture
        const defaultViewDimension = () => {
            if (texture.cubemap) return 'cube'
            if (texture.volume) return '3d'
            if (texture.array) return '2d-array'
            return '2d'
        }
        const desc = {
            format: options.format ?? textureDescr.format,
            dimension: options.dimension ?? defaultViewDimension(),
            aspect: options.aspect ?? 'all',
            baseMipLevel: options.baseMipLevel ?? 0,
            mipLevelCount: options.mipLevelCount ?? textureDescr.mipLevelCount,
            baseArrayLayer: options.baseArrayLayer ?? 0,
            arrayLayerCount: options.arrayLayerCount ?? textureDescr.depthOrArrayLayers,
        }
        const view = this.gpuTexture.createView(desc)
        return view
    }
    getSampler(device, sampleType) {
        let sampler = this.samplers[sampleType]
        if (!sampler) {
            const texture = this.texture
            const desc = {
                addressModeU: gpuAddressModes[texture.addressU],
                addressModeV: gpuAddressModes[texture.addressV],
                addressModeW: gpuAddressModes[texture.addressW],
            }
            if (!sampleType && texture.compareOnRead) {
                sampleType = SAMPLETYPE_DEPTH
            }
            if (sampleType === SAMPLETYPE_DEPTH || sampleType === SAMPLETYPE_INT || sampleType === SAMPLETYPE_UINT) {
                desc.compare = 'less'
                desc.magFilter = 'linear'
                desc.minFilter = 'linear'
            } else if (sampleType === SAMPLETYPE_UNFILTERABLE_FLOAT) {
                desc.magFilter = 'nearest'
                desc.minFilter = 'nearest'
                desc.mipmapFilter = 'nearest'
            } else {
                const forceNearest =
                    !device.textureFloatFilterable &&
                    (texture.format === PIXELFORMAT_RGBA32F || texture.format === PIXELFORMAT_RGBA16F)
                if (
                    forceNearest ||
                    this.texture.format === PIXELFORMAT_DEPTHSTENCIL ||
                    isIntegerPixelFormat(this.texture.format)
                ) {
                    desc.magFilter = 'nearest'
                    desc.minFilter = 'nearest'
                    desc.mipmapFilter = 'nearest'
                } else {
                    desc.magFilter = gpuFilterModes[texture.magFilter].level
                    desc.minFilter = gpuFilterModes[texture.minFilter].level
                    desc.mipmapFilter = gpuFilterModes[texture.minFilter].mip
                }
            }
            const allLinear =
                desc.minFilter === 'linear' && desc.magFilter === 'linear' && desc.mipmapFilter === 'linear'
            desc.maxAnisotropy = allLinear
                ? math.clamp(Math.round(texture._anisotropy), 1, device.maxTextureAnisotropy)
                : 1
            sampler = device.wgpu.createSampler(desc)
            this.samplers[sampleType] = sampler
        }
        return sampler
    }
    loseContext() {}
    uploadImmediate(device, texture) {
        if (texture._needsUpload || texture._needsMipmapsUpload) {
            this.uploadData(device)
            texture._needsUpload = false
            texture._needsMipmapsUpload = false
        }
    }
    uploadData(device) {
        const texture = this.texture
        if (this.desc && (this.desc.size.width !== texture.width || this.desc.size.height !== texture.height)) {
            this.gpuTexture.destroy()
            this.create(device)
            texture.renderVersionDirty = device.renderVersion
        }
        if (texture._levels) {
            let anyUploads = false
            let anyLevelMissing = false
            const requiredMipLevels = texture.numLevels
            for (let mipLevel = 0; mipLevel < requiredMipLevels; mipLevel++) {
                const mipObject = texture._levels[mipLevel]
                if (mipObject) {
                    if (texture.cubemap) {
                        for (let face = 0; face < 6; face++) {
                            const faceSource = mipObject[face]
                            if (faceSource) {
                                if (this.isExternalImage(faceSource)) {
                                    this.uploadExternalImage(device, faceSource, mipLevel, face)
                                    anyUploads = true
                                } else if (ArrayBuffer.isView(faceSource)) {
                                    this.uploadTypedArrayData(device, faceSource, mipLevel, face)
                                    anyUploads = true
                                } else;
                            } else {
                                anyLevelMissing = true
                            }
                        }
                    } else if (texture._volume);
                    else if (texture.array) {
                        if (texture.arrayLength === mipObject.length) {
                            for (let index = 0; index < texture._arrayLength; index++) {
                                const arraySource = mipObject[index]
                                if (this.isExternalImage(arraySource)) {
                                    this.uploadExternalImage(device, arraySource, mipLevel, index)
                                    anyUploads = true
                                } else if (ArrayBuffer.isView(arraySource)) {
                                    this.uploadTypedArrayData(device, arraySource, mipLevel, index)
                                    anyUploads = true
                                } else;
                            }
                        } else {
                            anyLevelMissing = true
                        }
                    } else {
                        if (this.isExternalImage(mipObject)) {
                            this.uploadExternalImage(device, mipObject, mipLevel, 0)
                            anyUploads = true
                        } else if (ArrayBuffer.isView(mipObject)) {
                            this.uploadTypedArrayData(device, mipObject, mipLevel, 0)
                            anyUploads = true
                        } else;
                    }
                } else {
                    anyLevelMissing = true
                }
            }
            if (
                anyUploads &&
                anyLevelMissing &&
                texture.mipmaps &&
                !isCompressedPixelFormat(texture.format) &&
                !isIntegerPixelFormat(texture.format)
            ) {
                device.mipmapRenderer.generate(this)
            }
            if (texture._gpuSize) {
                texture.adjustVramSizeTracking(device._vram, -texture._gpuSize)
            }
            texture._gpuSize = texture.gpuSize
            texture.adjustVramSizeTracking(device._vram, texture._gpuSize)
        }
    }
    isExternalImage(image) {
        return (
            (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) ||
            (typeof HTMLVideoElement !== 'undefined' && image instanceof HTMLVideoElement) ||
            (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) ||
            (typeof OffscreenCanvas !== 'undefined' && image instanceof OffscreenCanvas)
        )
    }
    uploadExternalImage(device, image, mipLevel, index) {
        const src = {
            source: image,
            origin: [0, 0],
            flipY: false,
        }
        const dst = {
            texture: this.gpuTexture,
            mipLevel: mipLevel,
            origin: [0, 0, index],
            aspect: 'all',
            premultipliedAlpha: this.texture._premultiplyAlpha,
        }
        const copySize = {
            width: this.desc.size.width,
            height: this.desc.size.height,
            depthOrArrayLayers: 1,
        }
        device.submit()
        dummyUse(image instanceof HTMLCanvasElement && image.getContext('2d'))
        device.wgpu.queue.copyExternalImageToTexture(src, dst, copySize)
    }
    uploadTypedArrayData(device, data, mipLevel, index) {
        const texture = this.texture
        const wgpu = device.wgpu
        const dest = {
            texture: this.gpuTexture,
            origin: [0, 0, index],
            mipLevel: mipLevel,
        }
        const width = TextureUtils.calcLevelDimension(texture.width, mipLevel)
        const height = TextureUtils.calcLevelDimension(texture.height, mipLevel)
        TextureUtils.calcLevelGpuSize(width, height, 1, texture.format)
        const formatInfo = pixelFormatInfo.get(texture.format)
        let dataLayout
        let size
        if (formatInfo.size) {
            dataLayout = {
                offset: 0,
                bytesPerRow: formatInfo.size * width,
                rowsPerImage: height,
            }
            size = {
                width: width,
                height: height,
            }
        } else if (formatInfo.blockSize) {
            const blockDim = (size) => {
                return Math.floor((size + 3) / 4)
            }
            dataLayout = {
                offset: 0,
                bytesPerRow: formatInfo.blockSize * blockDim(width),
                rowsPerImage: blockDim(height),
            }
            size = {
                width: Math.max(4, width),
                height: Math.max(4, height),
            }
        } else;
        device.submit()
        wgpu.queue.writeTexture(dest, data, dataLayout, size)
    }
    read(x, y, width, height, options) {
        const mipLevel = options.mipLevel ?? 0
        const face = options.face ?? 0
        const data = options.data ?? null
        const immediate = options.immediate ?? false
        const texture = this.texture
        const formatInfo = pixelFormatInfo.get(texture.format)
        const bytesPerRow = width * formatInfo.size
        const paddedBytesPerRow = math.roundUp(bytesPerRow, 256)
        const size = paddedBytesPerRow * height
        const device = texture.device
        const stagingBuffer = device.createBufferImpl(BUFFERUSAGE_READ | BUFFERUSAGE_COPY_DST)
        stagingBuffer.allocate(device, size)
        const src = {
            texture: this.gpuTexture,
            mipLevel: mipLevel,
            origin: [x, y, face],
        }
        const dst = {
            buffer: stagingBuffer.buffer,
            offset: 0,
            bytesPerRow: paddedBytesPerRow,
        }
        const copySize = {
            width,
            height,
            depthOrArrayLayers: 1,
        }
        const commandEncoder = device.getCommandEncoder()
        commandEncoder.copyTextureToBuffer(src, dst, copySize)
        return device.readBuffer(stagingBuffer, size, null, immediate).then((temp) => {
            const ArrayType = getPixelFormatArrayType(texture.format)
            const targetBuffer = data?.buffer ?? new ArrayBuffer(height * bytesPerRow)
            const target = new Uint8Array(targetBuffer, data?.byteOffset ?? 0, height * bytesPerRow)
            for (let i = 0; i < height; i++) {
                const srcOffset = i * paddedBytesPerRow
                const dstOffset = i * bytesPerRow
                target.set(temp.subarray(srcOffset, srcOffset + bytesPerRow), dstOffset)
            }
            return data ?? new ArrayType(targetBuffer)
        })
    }
    constructor(texture) {
        this.samplers = []
        this.viewCache = new Map()
        this.texture = texture
        this.format = gpuTextureFormats[texture.format]
        this.create(texture.device)
    }
}

class WebgpuUniformBuffer extends WebgpuBuffer {
    unlock(uniformBuffer) {
        const device = uniformBuffer.device
        super.unlock(device, uniformBuffer.storageInt32.buffer)
    }
    constructor(uniformBuffer) {
        super(BUFFERUSAGE_UNIFORM)
    }
}

class WebgpuVertexBuffer extends WebgpuBuffer {
    unlock(vertexBuffer) {
        const device = vertexBuffer.device
        super.unlock(device, vertexBuffer.storage)
    }
    constructor(vertexBuffer, format, options) {
        super(BUFFERUSAGE_VERTEX | (options?.storage ? BUFFERUSAGE_STORAGE : 0))
    }
}

const KEYWORD = /[ \t]*#(ifn?def|if|endif|else|elif|define|undef|extension|include)/g
const DEFINE = /define[ \t]+([^\n]+)\r?(?:\n|$)/g
const EXTENSION = /extension[ \t]+([\w-]+)[ \t]*:[ \t]*(enable|require)/g
const UNDEF = /undef[ \t]+([^\n]+)\r?(?:\n|$)/g
const IF = /(ifdef|ifndef|if)[ \t]*([^\r\n]+)\r?\n/g
const ENDIF = /(endif|else|elif)(?:[ \t]+([^\r\n]*))?\r?\n?/g
const IDENTIFIER$1 = /\{?[\w-]+\}?/
const DEFINED = /(!|\s)?defined\(([\w-]+)\)/
const DEFINED_PARENS = /!?defined\s*\([^)]*\)/g
const DEFINED_BEFORE_PAREN = /!?defined\s*$/
const COMPARISON = /([a-z_]\w*)\s*(==|!=|<|<=|>|>=)\s*([\w"']+)/i
const INVALID = /[+\-]/g
const INCLUDE = /include[ \t]+"([\w-]+)(?:\s*,\s*([\w-]+))?"/g
const LOOP_INDEX = /\{i\}/g
const FRAGCOLOR = /(pcFragColor[1-8])\b/g
const NUMERIC_LITERAL = /^\d+(?:\.\d+)?$/
class Preprocessor {
    static run(source, includes = new Map(), options = {}) {
        Preprocessor.sourceName = options.sourceName
        source = this.stripComments(source)
        source = source
            .split(/\r?\n/)
            .map((line) => line.trimEnd())
            .join('\n')
        const defines = new Map()
        const injectDefines = new Map()
        source = this._preprocess(source, defines, injectDefines, includes, options.stripDefines)
        if (source === null) return null
        const intDefines = new Map()
        defines.forEach((value, key) => {
            if (Number.isInteger(parseFloat(value)) && !value.includes('.')) {
                intDefines.set(key, value)
            }
        })
        source = this.stripComments(source)
        source = this.stripUnusedColorAttachments(source, options)
        source = this.RemoveEmptyLines(source)
        source = this.processArraySize(source, intDefines)
        source = this.injectDefines(source, injectDefines)
        return source
    }
    static stripUnusedColorAttachments(source, options) {
        if (options.stripUnusedColorAttachments) {
            const counts = new Map()
            const matches = source.match(FRAGCOLOR)
            matches?.forEach((match) => {
                const index = parseInt(match.charAt(match.length - 1), 10)
                counts.set(index, (counts.get(index) ?? 0) + 1)
            })
            const anySingleUse = Array.from(counts.values()).some((count) => count === 1)
            if (anySingleUse) {
                const lines = source.split('\n')
                const keepLines = []
                for (let i = 0; i < lines.length; i++) {
                    const match = lines[i].match(FRAGCOLOR)
                    if (match) {
                        const index = parseInt(match[0].charAt(match[0].length - 1), 10)
                        if (index > 0 && counts.get(index) === 1) {
                            continue
                        }
                    }
                    keepLines.push(lines[i])
                }
                source = keepLines.join('\n')
            }
        }
        return source
    }
    static stripComments(source) {
        return source.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, '$1')
    }
    static processArraySize(source, intDefines) {
        if (source !== null) {
            intDefines.forEach((value, key) => {
                source = source.replace(new RegExp(`\\[${key}\\]`, 'g'), `[${value}]`)
            })
        }
        return source
    }
    static injectDefines(source, injectDefines) {
        if (source !== null && injectDefines.size > 0) {
            const lines = source.split('\n')
            injectDefines.forEach((value, key) => {
                const regex = new RegExp(key, 'g')
                for (let i = 0; i < lines.length; i++) {
                    if (!lines[i].includes('#')) {
                        lines[i] = lines[i].replace(regex, value)
                    }
                }
            })
            source = lines.join('\n')
        }
        return source
    }
    static RemoveEmptyLines(source) {
        if (source !== null) {
            source = source
                .split(/\r?\n/)
                .map((line) => (line.trim() === '' ? '' : line))
                .join('\n')
            source = source.replace(/(\n\n){3,}/g, '\n\n')
        }
        return source
    }
    static _preprocess(source, defines = new Map(), injectDefines, includes, stripDefines) {
        const originalSource = source
        const stack = []
        let error = false
        let match
        while ((match = KEYWORD.exec(source)) !== null && !error) {
            const keyword = match[1]
            switch (keyword) {
                case 'define': {
                    DEFINE.lastIndex = match.index
                    const define = DEFINE.exec(source)
                    error || (error = define === null)
                    const expression = define[1]
                    IDENTIFIER$1.lastIndex = define.index
                    const identifierValue = IDENTIFIER$1.exec(expression)
                    const identifier = identifierValue[0]
                    let value = expression.substring(identifier.length).trim()
                    if (value === '') value = 'true'
                    const keep = Preprocessor._keep(stack)
                    let stripThisDefine = stripDefines
                    if (keep) {
                        const replacementDefine = identifier.startsWith('{') && identifier.endsWith('}')
                        if (replacementDefine) {
                            stripThisDefine = true
                        }
                        if (replacementDefine) {
                            injectDefines.set(identifier, value)
                        } else {
                            defines.set(identifier, value)
                        }
                        if (stripThisDefine) {
                            source = source.substring(0, define.index - 1) + source.substring(DEFINE.lastIndex)
                            KEYWORD.lastIndex = define.index - 1
                        }
                    }
                    if (!stripThisDefine) {
                        KEYWORD.lastIndex = define.index + define[0].length
                    }
                    break
                }
                case 'undef': {
                    UNDEF.lastIndex = match.index
                    const undef = UNDEF.exec(source)
                    const identifier = undef[1].trim()
                    const keep = Preprocessor._keep(stack)
                    if (keep) {
                        defines.delete(identifier)
                        if (stripDefines) {
                            source = source.substring(0, undef.index - 1) + source.substring(UNDEF.lastIndex)
                            KEYWORD.lastIndex = undef.index - 1
                        }
                    }
                    if (!stripDefines) {
                        KEYWORD.lastIndex = undef.index + undef[0].length
                    }
                    break
                }
                case 'extension': {
                    EXTENSION.lastIndex = match.index
                    const extension = EXTENSION.exec(source)
                    error || (error = extension === null)
                    if (extension) {
                        const identifier = extension[1]
                        const keep = Preprocessor._keep(stack)
                        if (keep) {
                            defines.set(identifier, 'true')
                        }
                    }
                    KEYWORD.lastIndex = extension.index + extension[0].length
                    break
                }
                case 'ifdef':
                case 'ifndef':
                case 'if': {
                    IF.lastIndex = match.index
                    const iff = IF.exec(source)
                    const expression = iff[2]
                    const evaluated = Preprocessor.evaluate(expression, defines)
                    error || (error = evaluated.error)
                    let result = evaluated.result
                    if (keyword === 'ifndef') {
                        result = !result
                    }
                    stack.push({
                        anyKeep: result,
                        keep: result,
                        start: match.index,
                        end: IF.lastIndex,
                    })
                    KEYWORD.lastIndex = iff.index + iff[0].length
                    break
                }
                case 'endif':
                case 'else':
                case 'elif': {
                    ENDIF.lastIndex = match.index
                    const endif = ENDIF.exec(source)
                    const blockInfo = stack.pop()
                    if (!blockInfo) {
                        console.error(
                            `Shader preprocessing encountered "#${endif[1]}" without a preceding #if #ifdef #ifndef while preprocessing ${Preprocessor.sourceName} on line:\n ${source.substring(match.index, match.index + 100)}...`,
                            {
                                source: originalSource,
                            },
                        )
                        error = true
                        continue
                    }
                    const blockCode = blockInfo.keep ? source.substring(blockInfo.end, match.index) : ''
                    source = source.substring(0, blockInfo.start) + blockCode + source.substring(ENDIF.lastIndex)
                    KEYWORD.lastIndex = blockInfo.start + blockCode.length
                    const endifCommand = endif[1]
                    if (endifCommand === 'else' || endifCommand === 'elif') {
                        let result = false
                        if (!blockInfo.anyKeep) {
                            if (endifCommand === 'else') {
                                result = !blockInfo.keep
                            } else {
                                const evaluated = Preprocessor.evaluate(endif[2], defines)
                                result = evaluated.result
                                error || (error = evaluated.error)
                            }
                        }
                        stack.push({
                            anyKeep: blockInfo.anyKeep || result,
                            keep: result,
                            start: KEYWORD.lastIndex,
                            end: KEYWORD.lastIndex,
                        })
                    }
                    break
                }
                case 'include': {
                    INCLUDE.lastIndex = match.index
                    const include = INCLUDE.exec(source)
                    error || (error = include === null)
                    if (!include) {
                        error = true
                        continue
                    }
                    const identifier = include[1].trim()
                    const countIdentifier = include[2]?.trim()
                    const keep = Preprocessor._keep(stack)
                    if (keep) {
                        let includeSource = includes?.get(identifier)
                        if (includeSource !== undefined) {
                            includeSource = this.stripComments(includeSource)
                            if (countIdentifier) {
                                const countString = defines.get(countIdentifier)
                                const count = parseFloat(countString)
                                if (Number.isInteger(count)) {
                                    let result = ''
                                    for (let i = 0; i < count; i++) {
                                        result += includeSource.replace(LOOP_INDEX, String(i))
                                    }
                                    includeSource = result
                                } else {
                                    console.error(
                                        `Include Count identifier "${countIdentifier}" not resolved while preprocessing ${Preprocessor.sourceName} on line:\n ${source.substring(match.index, match.index + 100)}...`,
                                        {
                                            originalSource: originalSource,
                                            source: source,
                                        },
                                    )
                                    error = true
                                }
                            }
                            source =
                                source.substring(0, include.index - 1) +
                                includeSource +
                                source.substring(INCLUDE.lastIndex)
                            KEYWORD.lastIndex = include.index - 1
                        } else {
                            console.error(
                                `Include "${identifier}" not resolved while preprocessing ${Preprocessor.sourceName}`,
                                {
                                    originalSource: originalSource,
                                    source: source,
                                },
                            )
                            error = true
                            continue
                        }
                    }
                    break
                }
            }
        }
        if (stack.length > 0) {
            console.error(
                `Shader preprocessing reached the end of the file without encountering the necessary #endif to close a preceding #if, #ifdef, or #ifndef block. ${Preprocessor.sourceName}`,
            )
            error = true
        }
        if (error) {
            console.error('Failed to preprocess shader: ', {
                source: originalSource,
            })
            return null
        }
        return source
    }
    static _keep(stack) {
        for (let i = 0; i < stack.length; i++) {
            if (!stack[i].keep) {
                return false
            }
        }
        return true
    }
    static evaluateAtomicExpression(expr, defines) {
        let error = false
        expr = expr.trim()
        let invert = false
        if (expr === 'true') {
            return {
                result: true,
                error,
            }
        }
        if (expr === 'false') {
            return {
                result: false,
                error,
            }
        }
        if (NUMERIC_LITERAL.test(expr)) {
            return {
                result: parseFloat(expr) !== 0,
                error,
            }
        }
        const definedMatch = DEFINED.exec(expr)
        if (definedMatch) {
            invert = definedMatch[1] === '!'
            expr = definedMatch[2].trim()
            const exists = defines.has(expr)
            return {
                result: invert ? !exists : exists,
                error,
            }
        }
        const comparisonMatch = COMPARISON.exec(expr)
        if (comparisonMatch) {
            const left = defines.get(comparisonMatch[1].trim()) ?? comparisonMatch[1].trim()
            const right = defines.get(comparisonMatch[3].trim()) ?? comparisonMatch[3].trim()
            const operator = comparisonMatch[2].trim()
            let result = false
            switch (operator) {
                case '==':
                    result = left === right
                    break
                case '!=':
                    result = left !== right
                    break
                case '<':
                    result = left < right
                    break
                case '<=':
                    result = left <= right
                    break
                case '>':
                    result = left > right
                    break
                case '>=':
                    result = left >= right
                    break
                default:
                    error = true
            }
            return {
                result,
                error,
            }
        }
        const result = defines.has(expr)
        return {
            result,
            error,
        }
    }
    static processParentheses(expression, defines) {
        let error = false
        let processed = expression.trim()
        while (processed.startsWith('(') && processed.endsWith(')')) {
            let depth = 0
            let wrapsEntire = true
            for (let i = 0; i < processed.length - 1; i++) {
                if (processed[i] === '(') depth++
                else if (processed[i] === ')') {
                    depth--
                    if (depth === 0) {
                        wrapsEntire = false
                        break
                    }
                }
            }
            if (wrapsEntire) {
                processed = processed.slice(1, -1).trim()
            } else {
                break
            }
        }
        while (true) {
            let foundParen = false
            let depth = 0
            let maxDepth = 0
            let deepestStart = -1
            let deepestEnd = -1
            let inDefinedParen = 0
            for (let i = 0; i < processed.length; i++) {
                if (processed[i] === '(') {
                    const beforeParen = processed.substring(0, i)
                    if (DEFINED_BEFORE_PAREN.test(beforeParen)) {
                        inDefinedParen++
                    } else if (inDefinedParen === 0) {
                        depth++
                        if (depth > maxDepth) {
                            maxDepth = depth
                            deepestStart = i
                        }
                        foundParen = true
                    }
                } else if (processed[i] === ')') {
                    if (inDefinedParen > 0) {
                        inDefinedParen--
                    } else if (depth > 0) {
                        if (depth === maxDepth && deepestStart !== -1) {
                            deepestEnd = i
                        }
                        depth--
                    }
                }
            }
            if (!foundParen || deepestStart === -1 || deepestEnd === -1) {
                break
            }
            const subExpr = processed.substring(deepestStart + 1, deepestEnd)
            const { result, error: subError } = Preprocessor.evaluate(subExpr, defines)
            error = error || subError
            processed =
                processed.substring(0, deepestStart) + (result ? 'true' : 'false') + processed.substring(deepestEnd + 1)
        }
        return {
            expression: processed,
            error,
        }
    }
    static evaluate(expression, defines) {
        const correct = INVALID.exec(expression) === null
        let processedExpr = expression
        let parenError = false
        const withoutDefined = expression.replace(DEFINED_PARENS, '')
        if (withoutDefined.indexOf('(') !== -1) {
            const processed = Preprocessor.processParentheses(expression, defines)
            processedExpr = processed.expression
            parenError = processed.error
        }
        if (parenError) {
            return {
                result: false,
                error: true,
            }
        }
        const orSegments = processedExpr.split('||')
        for (const orSegment of orSegments) {
            const andSegments = orSegment.split('&&')
            let andResult = true
            for (const andSegment of andSegments) {
                const { result, error } = Preprocessor.evaluateAtomicExpression(andSegment.trim(), defines)
                if (!result || error) {
                    andResult = false
                    break
                }
            }
            if (andResult) {
                return {
                    result: true,
                    error: !correct,
                }
            }
        }
        return {
            result: false,
            error: !correct,
        }
    }
}

var gles3PS = `
#ifndef outType_0
#define outType_0 vec4
#endif
layout(location = 0) out highp outType_0 pcFragColor0;
#if COLOR_ATTACHMENT_1
layout(location = 1) out highp outType_1 pcFragColor1;
#endif
#if COLOR_ATTACHMENT_2
layout(location = 2) out highp outType_2 pcFragColor2;
#endif
#if COLOR_ATTACHMENT_3
layout(location = 3) out highp outType_3 pcFragColor3;
#endif
#if COLOR_ATTACHMENT_4
layout(location = 4) out highp outType_4 pcFragColor4;
#endif
#if COLOR_ATTACHMENT_5
layout(location = 5) out highp outType_5 pcFragColor5;
#endif
#if COLOR_ATTACHMENT_6
layout(location = 6) out highp outType_6 pcFragColor6;
#endif
#if COLOR_ATTACHMENT_7
layout(location = 7) out highp outType_7 pcFragColor7;
#endif
#define gl_FragColor pcFragColor0
#define varying in
#define texture2D texture
#define texture2DBias texture
#define textureCube texture
#define texture2DProj textureProj
#define texture2DLod textureLod
#define texture2DProjLod textureProjLod
#define textureCubeLod textureLod
#define texture2DGrad textureGrad
#define texture2DProjGrad textureProjGrad
#define textureCubeGrad textureGrad
#define utexture2D texture
#define itexture2D texture
#define texture2DLodEXT texture2DLodEXT_is_no_longer_supported_use_texture2DLod_instead
#define texture2DProjLodEXT texture2DProjLodEXT_is_no_longer_supported_use_texture2DProjLod
#define textureCubeLodEXT textureCubeLodEXT_is_no_longer_supported_use_textureCubeLod_instead
#define texture2DGradEXT texture2DGradEXT_is_no_longer_supported_use_texture2DGrad_instead
#define texture2DProjGradEXT texture2DProjGradEXT_is_no_longer_supported_use_texture2DProjGrad_instead
#define textureCubeGradEXT textureCubeGradEXT_is_no_longer_supported_use_textureCubeGrad_instead
#define textureShadow(res, uv) textureGrad(res, uv, vec2(1, 1), vec2(1, 1))
#define SHADOWMAP_PASS(name) name
#define SHADOWMAP_ACCEPT(name) sampler2DShadow name
#define TEXTURE_PASS(name) name
#define TEXTURE_ACCEPT(name) sampler2D name
#define TEXTURE_ACCEPT_HIGHP(name) highp sampler2D name
#define GL2
`

var gles3VS = `
#extension GL_ANGLE_multi_draw : enable
#define attribute in
#define varying out
#define texture2D texture
#define utexture2D texture
#define itexture2D texture
#define GL2
#define VERTEXSHADER
#define TEXTURE_PASS(name) name
#define TEXTURE_ACCEPT(name) sampler2D name
#define TEXTURE_ACCEPT_HIGHP(name) highp sampler2D name
`

var webgpuPS$1 = `
#extension GL_EXT_samplerless_texture_functions : require
#ifndef outType_0
#define outType_0 vec4
#endif
#ifndef outType_1
#define outType_1 vec4
#endif
#ifndef outType_2
#define outType_2 vec4
#endif
#ifndef outType_3
#define outType_3 vec4
#endif
#ifndef outType_4
#define outType_4 vec4
#endif
#ifndef outType_5
#define outType_5 vec4
#endif
#ifndef outType_6
#define outType_6 vec4
#endif
#ifndef outType_7
#define outType_7 vec4
#endif
layout(location = 0) out highp outType_0 pcFragColor0;
layout(location = 1) out highp outType_1 pcFragColor1;
layout(location = 2) out highp outType_2 pcFragColor2;
layout(location = 3) out highp outType_3 pcFragColor3;
layout(location = 4) out highp outType_4 pcFragColor4;
layout(location = 5) out highp outType_5 pcFragColor5;
layout(location = 6) out highp outType_6 pcFragColor6;
layout(location = 7) out highp outType_7 pcFragColor7;
#define gl_FragColor pcFragColor0
#define texture2D(res, uv) texture(sampler2D(res, res ## _sampler), uv)
#define texture2DBias(res, uv, bias) texture(sampler2D(res, res ## _sampler), uv, bias)
#define texture2DLod(res, uv, lod) textureLod(sampler2D(res, res ## _sampler), uv, lod)
#define textureCube(res, uv) texture(samplerCube(res, res ## _sampler), uv)
#define textureCubeLod(res, uv, lod) textureLod(samplerCube(res, res ## _sampler), uv, lod)
#define textureShadow(res, uv) textureLod(sampler2DShadow(res, res ## _sampler), uv, 0.0)
#define itexture2D(res, uv) texture(isampler2D(res, res ## _sampler), uv)
#define utexture2D(res, uv) texture(usampler2D(res, res ## _sampler), uv)
#define texture2DLodEXT texture2DLodEXT_is_no_longer_supported_use_texture2DLod_instead
#define texture2DProjLodEXT texture2DProjLodEXT_is_no_longer_supported_use_texture2DProjLod
#define textureCubeLodEXT textureCubeLodEXT_is_no_longer_supported_use_textureCubeLod_instead
#define texture2DGradEXT texture2DGradEXT_is_no_longer_supported_use_texture2DGrad_instead
#define texture2DProjGradEXT texture2DProjGradEXT_is_no_longer_supported_use_texture2DProjGrad_instead
#define textureCubeGradEXT textureCubeGradEXT_is_no_longer_supported_use_textureCubeGrad_instead
#define SHADOWMAP_PASS(name) name, name ## _sampler
#define SHADOWMAP_ACCEPT(name) texture2D name, sampler name ## _sampler
#define TEXTURE_PASS(name) name, name ## _sampler
#define TEXTURE_ACCEPT(name) texture2D name, sampler name ## _sampler
#define TEXTURE_ACCEPT_HIGHP TEXTURE_ACCEPT
#define GL2
#define WEBGPU
`

var webgpuVS$1 = `
#extension GL_EXT_samplerless_texture_functions : require
#define texture2D(res, uv) texture(sampler2D(res, res ## _sampler), uv)
#define itexture2D(res, uv) texture(isampler2D(res, res ## _sampler), uv)
#define utexture2D(res, uv) texture(usampler2D(res, res ## _sampler), uv)
#define TEXTURE_PASS(name) name, name ## _sampler
#define TEXTURE_ACCEPT(name) texture2D name, sampler name ## _sampler
#define TEXTURE_ACCEPT_HIGHP TEXTURE_ACCEPT
#define GL2
#define WEBGPU
#define VERTEXSHADER
#define gl_VertexID gl_VertexIndex
#define gl_InstanceID gl_InstanceIndex
`

var webgpuPS = `
`

var webgpuVS = `
#define VERTEXSHADER
`

var sharedGLSL = `
vec2 getGrabScreenPos(vec4 clipPos) {
	vec2 uv = (clipPos.xy / clipPos.w) * 0.5 + 0.5;
	#ifdef WEBGPU
		uv.y = 1.0 - uv.y;
	#endif
	return uv;
}
vec2 getImageEffectUV(vec2 uv) {
	#ifdef WEBGPU
		uv.y = 1.0 - uv.y;
	#endif
	return uv;
}
`

var sharedWGSL = `
#define WEBGPU
fn getGrabScreenPos(clipPos: vec4<f32>) -> vec2<f32> {
	var uv: vec2<f32> = (clipPos.xy / clipPos.w) * 0.5 + vec2<f32>(0.5);
	uv.y = 1.0 - uv.y;
	return uv;
}
fn getImageEffectUV(uv: vec2<f32>) -> vec2<f32> {
	var modifiedUV: vec2<f32> = uv;
	modifiedUV.y = 1.0 - modifiedUV.y;
	return modifiedUV;
}
struct WrappedF32 { @size(16) element: f32 }
struct WrappedI32 { @size(16) element: i32 }
struct WrappedU32 { @size(16) element: u32 }
struct WrappedVec2F { @size(16) element: vec2f }
struct WrappedVec2I { @size(16) element: vec2i }
struct WrappedVec2U { @size(16) element: vec2u }
`

var halfTypes = `
#ifdef CAPS_SHADER_F16
	alias half = f16;
	alias half2 = vec2<f16>;
	alias half3 = vec3<f16>;
	alias half4 = vec4<f16>;
	alias half2x2 = mat2x2<f16>;
	alias half3x3 = mat3x3<f16>;
	alias half4x4 = mat4x4<f16>;
#else
	alias half = f32;
	alias half2 = vec2f;
	alias half3 = vec3f;
	alias half4 = vec4f;
	alias half2x2 = mat2x2f;
	alias half3x3 = mat3x3f;
	alias half4x4 = mat4x4f;
#endif
`

const _attrib2Semantic = {
    vertex_position: SEMANTIC_POSITION,
    vertex_normal: SEMANTIC_NORMAL,
    vertex_tangent: SEMANTIC_TANGENT,
    vertex_texCoord0: SEMANTIC_TEXCOORD0,
    vertex_texCoord1: SEMANTIC_TEXCOORD1,
    vertex_texCoord2: SEMANTIC_TEXCOORD2,
    vertex_texCoord3: SEMANTIC_TEXCOORD3,
    vertex_texCoord4: SEMANTIC_TEXCOORD4,
    vertex_texCoord5: SEMANTIC_TEXCOORD5,
    vertex_texCoord6: SEMANTIC_TEXCOORD6,
    vertex_texCoord7: SEMANTIC_TEXCOORD7,
    vertex_color: SEMANTIC_COLOR,
    vertex_boneIndices: SEMANTIC_BLENDINDICES,
    vertex_boneWeights: SEMANTIC_BLENDWEIGHT,
}
class ShaderDefinitionUtils {
    static createDefinition(device, options) {
        const normalizedOutputTypes = (options) => {
            let fragmentOutputTypes = options.fragmentOutputTypes ?? 'vec4'
            if (!Array.isArray(fragmentOutputTypes)) {
                fragmentOutputTypes = [fragmentOutputTypes]
            }
            return fragmentOutputTypes
        }
        const getDefines = (gpu, gl2, isVertex, options) => {
            const deviceIntro = device.isWebGPU ? gpu : gl2
            let attachmentsDefine = ''
            if (!isVertex) {
                const fragmentOutputTypes = normalizedOutputTypes(options)
                for (let i = 0; i < device.maxColorAttachments; i++) {
                    attachmentsDefine += `#define COLOR_ATTACHMENT_${i}\n`
                    const outType = fragmentOutputTypes[i] ?? 'vec4'
                    attachmentsDefine += `#define outType_${i} ${outType}\n`
                }
            }
            return attachmentsDefine + deviceIntro
        }
        const getDefinesWgsl = (isVertex, options) => {
            let code = ShaderDefinitionUtils.getWGSLEnables(device, isVertex ? 'vertex' : 'fragment')
            if (!isVertex) {
                const fragmentOutputTypes = normalizedOutputTypes(options)
                for (let i = 0; i < device.maxColorAttachments; i++) {
                    const glslOutType = fragmentOutputTypes[i] ?? 'vec4'
                    const wgslOutType = primitiveGlslToWgslTypeMap.get(glslOutType)
                    code += `alias pcOutType${i} = ${wgslOutType};\n`
                }
            }
            return code
        }
        const name = options.name ?? 'Untitled'
        let vertCode
        let fragCode
        const vertexDefinesCode = ShaderDefinitionUtils.getDefinesCode(device, options.vertexDefines)
        const fragmentDefinesCode = ShaderDefinitionUtils.getDefinesCode(device, options.fragmentDefines)
        const wgsl = options.shaderLanguage === SHADERLANGUAGE_WGSL
        if (wgsl) {
            vertCode = `
								${getDefinesWgsl(true, options)}
								${vertexDefinesCode}
								${halfTypes}
								${webgpuVS}
								${sharedWGSL}
								${options.vertexCode}
						`
            fragCode = `
								${getDefinesWgsl(false, options)}
								${fragmentDefinesCode}
								${halfTypes}
								${webgpuPS}
								${sharedWGSL}
								${options.fragmentCode}
						`
        } else {
            vertCode = `${ShaderDefinitionUtils.versionCode(device) + getDefines(webgpuVS$1, gles3VS, true, options) + vertexDefinesCode + ShaderDefinitionUtils.precisionCode(device)}
								${sharedGLSL}
								${ShaderDefinitionUtils.getShaderNameCode(name)}
								${options.vertexCode}`
            fragCode = `${(options.fragmentPreamble || '') + ShaderDefinitionUtils.versionCode(device) + getDefines(webgpuPS$1, gles3PS, false, options) + fragmentDefinesCode + ShaderDefinitionUtils.precisionCode(device)}
								${sharedGLSL}
								${ShaderDefinitionUtils.getShaderNameCode(name)}
								${options.fragmentCode}`
        }
        return {
            name: name,
            shaderLanguage: options.shaderLanguage ?? SHADERLANGUAGE_GLSL,
            attributes: options.attributes,
            vshader: vertCode,
            vincludes: options.vertexIncludes,
            fincludes: options.fragmentIncludes,
            fshader: fragCode,
            feedbackVaryings: options.feedbackVaryings,
            useTransformFeedback: options.useTransformFeedback,
            meshUniformBufferFormat: options.meshUniformBufferFormat,
            meshBindGroupFormat: options.meshBindGroupFormat,
        }
    }
    static getWGSLEnables(device, shaderType) {
        let code = ''
        if (device.supportsShaderF16) {
            code += 'enable f16;\n'
        }
        if (shaderType === 'fragment' && device.supportsPrimitiveIndex) {
            code += 'enable primitive_index;\n'
        }
        return code
    }
    static getDefinesCode(device, defines) {
        let code = ''
        device.capsDefines.forEach((value, key) => {
            code += `#define ${key} ${value}\n`
        })
        code += '\n'
        defines?.forEach((value, key) => {
            code += `#define ${key} ${value}\n`
        })
        code += '\n'
        return code
    }
    static getShaderNameCode(name) {
        return `#define SHADER_NAME ${name}\n`
    }
    static versionCode(device) {
        return device.isWebGPU ? '#version 450\n' : '#version 300 es\n'
    }
    static precisionCode(device, forcePrecision) {
        if (forcePrecision && forcePrecision !== 'highp' && forcePrecision !== 'mediump' && forcePrecision !== 'lowp') {
            forcePrecision = null
        }
        if (forcePrecision) {
            if (forcePrecision === 'highp' && device.maxPrecision !== 'highp') {
                forcePrecision = 'mediump'
            }
            if (forcePrecision === 'mediump' && device.maxPrecision === 'lowp') {
                forcePrecision = 'lowp'
            }
        }
        const precision = forcePrecision ? forcePrecision : device.precision
        const code = `
						precision ${precision} float;
						precision ${precision} int;
						precision ${precision} usampler2D;
						precision ${precision} isampler2D;
						precision ${precision} sampler2DShadow;
						precision ${precision} samplerCubeShadow;
						precision ${precision} sampler2DArray;
				`
        return code
    }
    static collectAttributes(vsCode) {
        const attribs = {}
        let attrs = 0
        let found = vsCode.indexOf('attribute')
        while (found >= 0) {
            if (found > 0 && vsCode[found - 1] === '/') break
            let ignore = false
            if (found > 0) {
                let startOfLine = vsCode.lastIndexOf('\n', found)
                startOfLine = startOfLine !== -1 ? startOfLine + 1 : 0
                const lineStartString = vsCode.substring(startOfLine, found)
                if (lineStartString.includes('#')) {
                    ignore = true
                }
            }
            if (!ignore) {
                const endOfLine = vsCode.indexOf(';', found)
                const startOfAttribName = vsCode.lastIndexOf(' ', endOfLine)
                const attribName = vsCode.substring(startOfAttribName + 1, endOfLine)
                if (attribs[attribName]);
                else {
                    const semantic = _attrib2Semantic[attribName]
                    if (semantic !== undefined) {
                        attribs[attribName] = semantic
                    } else {
                        attribs[attribName] = `ATTR${attrs}`
                        attrs++
                    }
                }
            }
            found = vsCode.indexOf('attribute', found + 1)
        }
        return attribs
    }
}

let id$6 = 0
class Shader {
    init() {
        this.ready = false
        this.failed = false
    }
    get label() {
        return `Shader Id ${this.id} (${this.definition.shaderLanguage === SHADERLANGUAGE_WGSL ? 'WGSL' : 'GLSL'}) ${this.name}`
    }
    destroy() {
        this.device.onDestroyShader(this)
        this.impl.destroy(this)
    }
    loseContext() {
        this.init()
        this.impl.loseContext()
    }
    restoreContext() {
        this.impl.restoreContext(this.device, this)
    }
    constructor(graphicsDevice, definition) {
        this.attributes = new Map()
        this.id = id$6++
        this.device = graphicsDevice
        this.definition = definition
        this.name = definition.name || 'Untitled'
        this.init()
        if (definition.cshader) {
            const enablesCode = ShaderDefinitionUtils.getWGSLEnables(graphicsDevice, 'compute')
            const definesCode = ShaderDefinitionUtils.getDefinesCode(graphicsDevice, definition.cdefines)
            const cshader = enablesCode + definesCode + definition.cshader
            const cincludes = definition.cincludes ?? new Map()
            if (!cincludes.has('halfTypesCS')) {
                cincludes.set('halfTypesCS', halfTypes)
            }
            definition.cshader = Preprocessor.run(cshader, cincludes, {
                sourceName: `compute shader for ${this.label}`,
                stripDefines: true,
            })
        } else {
            const wgsl = definition.shaderLanguage === SHADERLANGUAGE_WGSL
            definition.vshader = Preprocessor.run(definition.vshader, definition.vincludes, {
                sourceName: `vertex shader for ${this.label}`,
                stripDefines: wgsl,
            })
            if (definition.shaderLanguage === SHADERLANGUAGE_GLSL) {
                var _definition
                ;(_definition = definition).attributes ??
                    (_definition.attributes = ShaderDefinitionUtils.collectAttributes(definition.vshader))
            }
            const stripUnusedColorAttachments =
                graphicsDevice.isWebGL2 && (platform.name === 'osx' || platform.name === 'ios')
            definition.fshader = Preprocessor.run(definition.fshader, definition.fincludes, {
                stripUnusedColorAttachments,
                stripDefines: wgsl,
                sourceName: `fragment shader for ${this.label}`,
            })
            if (!definition.vshader || !definition.fshader) {
                this.failed = true
                return
            }
        }
        this.impl = graphicsDevice.createShaderImpl(this)
    }
}

class UsedBuffer {}
class DynamicBufferAllocation {}
class DynamicBuffers {
    destroy() {
        this.gpuBuffers.forEach((gpuBuffer) => {
            gpuBuffer.destroy(this.device)
        })
        this.gpuBuffers = null
        this.stagingBuffers.forEach((stagingBuffer) => {
            stagingBuffer.destroy(this.device)
        })
        this.stagingBuffers = null
        this.usedBuffers = null
        this.activeBuffer = null
    }
    alloc(allocation, size) {
        if (this.activeBuffer) {
            const alignedStart = math.roundUp(this.activeBuffer.size, this.bufferAlignment)
            const space = this.bufferSize - alignedStart
            if (space < size) {
                this.scheduleSubmit()
            }
        }
        if (!this.activeBuffer) {
            let gpuBuffer = this.gpuBuffers.pop()
            if (!gpuBuffer) {
                gpuBuffer = this.createBuffer(this.device, this.bufferSize, false)
            }
            let stagingBuffer = this.stagingBuffers.pop()
            if (!stagingBuffer) {
                stagingBuffer = this.createBuffer(this.device, this.bufferSize, true)
            }
            this.activeBuffer = new UsedBuffer()
            this.activeBuffer.stagingBuffer = stagingBuffer
            this.activeBuffer.gpuBuffer = gpuBuffer
            this.activeBuffer.offset = 0
            this.activeBuffer.size = 0
        }
        const activeBuffer = this.activeBuffer
        const alignedStart = math.roundUp(activeBuffer.size, this.bufferAlignment)
        allocation.gpuBuffer = activeBuffer.gpuBuffer
        allocation.offset = alignedStart
        allocation.storage = activeBuffer.stagingBuffer.alloc(alignedStart, size)
        activeBuffer.size = alignedStart + size
    }
    scheduleSubmit() {
        if (this.activeBuffer) {
            this.usedBuffers.push(this.activeBuffer)
            this.activeBuffer = null
        }
    }
    submit() {
        this.scheduleSubmit()
    }
    constructor(device, bufferSize, bufferAlignment) {
        this.gpuBuffers = []
        this.stagingBuffers = []
        this.usedBuffers = []
        this.activeBuffer = null
        this.device = device
        this.bufferSize = bufferSize
        this.bufferAlignment = bufferAlignment
    }
}

const _updateFunctions = []
_updateFunctions[UNIFORMTYPE_FLOAT] = function (uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageFloat32
    dst[offset] = value
}
_updateFunctions[UNIFORMTYPE_VEC2] = (uniformBuffer, value, offset) => {
    const dst = uniformBuffer.storageFloat32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
}
_updateFunctions[UNIFORMTYPE_VEC3] = (uniformBuffer, value, offset) => {
    const dst = uniformBuffer.storageFloat32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
    dst[offset + 2] = value[2]
}
_updateFunctions[UNIFORMTYPE_VEC4] = (uniformBuffer, value, offset) => {
    const dst = uniformBuffer.storageFloat32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
    dst[offset + 2] = value[2]
    dst[offset + 3] = value[3]
}
_updateFunctions[UNIFORMTYPE_INT] = function (uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageInt32
    dst[offset] = value
}
_updateFunctions[UNIFORMTYPE_IVEC2] = function (uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageInt32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
}
_updateFunctions[UNIFORMTYPE_IVEC3] = function (uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageInt32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
    dst[offset + 2] = value[2]
}
_updateFunctions[UNIFORMTYPE_IVEC4] = function (uniformBuffer, value, offset) {
    const dst = uniformBuffer.storageInt32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
    dst[offset + 2] = value[2]
    dst[offset + 3] = value[3]
}
_updateFunctions[UNIFORMTYPE_MAT2] = (uniformBuffer, value, offset) => {
    const dst = uniformBuffer.storageFloat32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
    dst[offset + 4] = value[2]
    dst[offset + 5] = value[3]
    dst[offset + 8] = value[4]
    dst[offset + 9] = value[5]
}
_updateFunctions[UNIFORMTYPE_MAT3] = (uniformBuffer, value, offset) => {
    const dst = uniformBuffer.storageFloat32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
    dst[offset + 2] = value[2]
    dst[offset + 4] = value[3]
    dst[offset + 5] = value[4]
    dst[offset + 6] = value[5]
    dst[offset + 8] = value[6]
    dst[offset + 9] = value[7]
    dst[offset + 10] = value[8]
}
_updateFunctions[UNIFORMTYPE_FLOATARRAY] = function (uniformBuffer, value, offset, count) {
    const dst = uniformBuffer.storageFloat32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i]
    }
}
_updateFunctions[UNIFORMTYPE_VEC2ARRAY] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageFloat32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i * 2]
        dst[offset + i * 4 + 1] = value[i * 2 + 1]
    }
}
_updateFunctions[UNIFORMTYPE_VEC3ARRAY] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageFloat32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i * 3]
        dst[offset + i * 4 + 1] = value[i * 3 + 1]
        dst[offset + i * 4 + 2] = value[i * 3 + 2]
    }
}
_updateFunctions[UNIFORMTYPE_UINT] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageUint32
    dst[offset] = value
}
_updateFunctions[UNIFORMTYPE_UVEC2] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageUint32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
}
_updateFunctions[UNIFORMTYPE_UVEC3] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageUint32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
    dst[offset + 2] = value[2]
}
_updateFunctions[UNIFORMTYPE_UVEC4] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageUint32
    dst[offset] = value[0]
    dst[offset + 1] = value[1]
    dst[offset + 2] = value[2]
    dst[offset + 3] = value[3]
}
_updateFunctions[UNIFORMTYPE_INTARRAY] = function (uniformBuffer, value, offset, count) {
    const dst = uniformBuffer.storageInt32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i]
    }
}
_updateFunctions[UNIFORMTYPE_BOOLARRAY] = _updateFunctions[UNIFORMTYPE_INTARRAY]
_updateFunctions[UNIFORMTYPE_UINTARRAY] = function (uniformBuffer, value, offset, count) {
    const dst = uniformBuffer.storageUint32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i]
    }
}
_updateFunctions[UNIFORMTYPE_IVEC2ARRAY] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageInt32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i * 2]
        dst[offset + i * 4 + 1] = value[i * 2 + 1]
    }
}
_updateFunctions[UNIFORMTYPE_BVEC2ARRAY] = _updateFunctions[UNIFORMTYPE_IVEC2ARRAY]
_updateFunctions[UNIFORMTYPE_UVEC2ARRAY] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageUint32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i * 2]
        dst[offset + i * 4 + 1] = value[i * 2 + 1]
    }
}
_updateFunctions[UNIFORMTYPE_IVEC3ARRAY] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageInt32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i * 3]
        dst[offset + i * 4 + 1] = value[i * 3 + 1]
        dst[offset + i * 4 + 2] = value[i * 3 + 2]
    }
}
_updateFunctions[UNIFORMTYPE_BVEC3ARRAY] = _updateFunctions[UNIFORMTYPE_IVEC3ARRAY]
_updateFunctions[UNIFORMTYPE_UVEC3ARRAY] = (uniformBuffer, value, offset, count) => {
    const dst = uniformBuffer.storageUint32
    for (let i = 0; i < count; i++) {
        dst[offset + i * 4] = value[i * 3]
        dst[offset + i * 4 + 1] = value[i * 3 + 1]
        dst[offset + i * 4 + 2] = value[i * 3 + 2]
    }
}
class UniformBuffer {
    destroy() {
        if (this.persistent) {
            const device = this.device
            this.impl.destroy(device)
            device._vram.ub -= this.format.byteSize
        }
    }
    get offset() {
        return this.persistent ? 0 : this.allocation.offset
    }
    assignStorage(storage) {
        this.storageInt32 = storage
        this.storageUint32 = new Uint32Array(storage.buffer, storage.byteOffset, storage.byteLength / 4)
        this.storageFloat32 = new Float32Array(storage.buffer, storage.byteOffset, storage.byteLength / 4)
    }
    loseContext() {
        this.impl?.loseContext()
    }
    setUniform(uniformFormat, value) {
        const offset = uniformFormat.offset
        if (value !== null && value !== undefined) {
            const updateFunction = _updateFunctions[uniformFormat.updateType]
            if (updateFunction) {
                updateFunction(this, value, offset, uniformFormat.count)
            } else {
                this.storageFloat32.set(value, offset)
            }
        }
    }
    set(name, value) {
        const uniformFormat = this.format.map.get(name)
        if (uniformFormat) {
            this.setUniform(uniformFormat, value)
        }
    }
    startUpdate(dynamicBindGroup) {
        if (!this.persistent) {
            const allocation = this.allocation
            const oldGpuBuffer = allocation.gpuBuffer
            this.device.dynamicBuffers.alloc(allocation, this.format.byteSize)
            this.assignStorage(allocation.storage)
            if (dynamicBindGroup) {
                dynamicBindGroup.bindGroup = allocation.gpuBuffer.getBindGroup(this)
                dynamicBindGroup.offsets[0] = allocation.offset
            }
            if (oldGpuBuffer !== allocation.gpuBuffer) {
                this.renderVersionDirty = this.device.renderVersion
            }
        }
    }
    endUpdate() {
        if (this.persistent) {
            this.impl.unlock(this)
        } else {
            this.storageFloat32 = null
            this.storageInt32 = null
        }
    }
    update(dynamicBindGroup) {
        this.startUpdate(dynamicBindGroup)
        const uniforms = this.format.uniforms
        for (let i = 0; i < uniforms.length; i++) {
            const value = uniforms[i].scopeId.value
            this.setUniform(uniforms[i], value)
        }
        this.endUpdate()
    }
    constructor(graphicsDevice, format, persistent = true) {
        this.renderVersionDirty = 0
        this.device = graphicsDevice
        this.format = format
        this.persistent = persistent
        if (persistent) {
            this.impl = graphicsDevice.createUniformBufferImpl(this)
            const storage = new ArrayBuffer(format.byteSize)
            this.assignStorage(new Int32Array(storage))
            graphicsDevice._vram.ub += this.format.byteSize
        } else {
            this.allocation = new DynamicBufferAllocation()
        }
    }
}

const primitive = {
    type: PRIMITIVE_TRISTRIP,
    base: 0,
    baseVertex: 0,
    count: 4,
    indexed: false,
}
class WebgpuClearRenderer {
    destroy() {
        this.shader.destroy()
        this.shader = null
        this.uniformBuffer.destroy()
        this.uniformBuffer = null
    }
    clear(device, renderTarget, options, defaultOptions) {
        options = options || defaultOptions
        const flags = options.flags ?? defaultOptions.flags
        if (flags !== 0) {
            const { uniformBuffer, dynamicBindGroup } = this
            uniformBuffer.startUpdate(dynamicBindGroup)
            device.setBindGroup(BINDGROUP_MESH_UB, dynamicBindGroup.bindGroup, dynamicBindGroup.offsets)
            device.setBindGroup(BINDGROUP_MESH, device.emptyBindGroup)
            let blendState
            if (flags & CLEARFLAG_COLOR && (renderTarget.colorBuffer || renderTarget.impl.assignedColorTexture)) {
                const color = options.color ?? defaultOptions.color
                this.colorData.set(color)
                blendState = BlendState.NOBLEND
            } else {
                blendState = BlendState.NOWRITE
            }
            uniformBuffer.set('color', this.colorData)
            let depthState
            if (flags & CLEARFLAG_DEPTH && renderTarget.depth) {
                const depth = options.depth ?? defaultOptions.depth
                uniformBuffer.set('depth', depth)
                depthState = DepthState.WRITEDEPTH
            } else {
                uniformBuffer.set('depth', 1)
                depthState = DepthState.NODEPTH
            }
            if (flags & CLEARFLAG_STENCIL && renderTarget.stencil);
            uniformBuffer.endUpdate()
            device.setDrawStates(blendState, depthState)
            device.setShader(this.shader)
            device.draw(primitive)
        }
    }
    constructor(device) {
        const code = `

						struct ub_mesh {
								color : vec4f,
								depth: f32
						}

						@group(2) @binding(0) var<uniform> ubMesh : ub_mesh;

						var<private> pos : array<vec2f, 4> = array<vec2f, 4>(
								vec2(-1.0, 1.0), vec2(1.0, 1.0),
								vec2(-1.0, -1.0), vec2(1.0, -1.0)
						);

						struct VertexOutput {
								@builtin(position) position : vec4f
						}

						@vertex
						fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
								var output : VertexOutput;
								output.position = vec4(pos[vertexIndex], ubMesh.depth, 1.0);
								return output;
						}

						@fragment
						fn fragmentMain() -> @location(0) vec4f {
								return ubMesh.color;
						}
				`
        this.shader = new Shader(device, {
            name: 'WebGPUClearRendererShader',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            vshader: code,
            fshader: code,
        })
        this.uniformBuffer = new UniformBuffer(
            device,
            new UniformBufferFormat(device, [
                new UniformFormat('color', UNIFORMTYPE_VEC4),
                new UniformFormat('depth', UNIFORMTYPE_FLOAT),
            ]),
            false,
        )
        this.dynamicBindGroup = new DynamicBindGroup()
        this.colorData = new Float32Array(4)
    }
}

class WebgpuMipmapRenderer {
    destroy() {
        this.shader.destroy()
        this.shader = null
        this.pipelineCache.clear()
    }
    generate(webgpuTexture) {
        const textureDescr = webgpuTexture.desc
        if (textureDescr.mipLevelCount <= 1) {
            return
        }
        if (webgpuTexture.texture.volume) {
            return
        }
        const device = this.device
        const wgpu = device.wgpu
        const format = textureDescr.format
        let pipeline = this.pipelineCache.get(format)
        if (!pipeline) {
            const webgpuShader = this.shader.impl
            pipeline = wgpu.createRenderPipeline({
                layout: 'auto',
                vertex: {
                    module: webgpuShader.getVertexShaderModule(),
                    entryPoint: webgpuShader.vertexEntryPoint,
                },
                fragment: {
                    module: webgpuShader.getFragmentShaderModule(),
                    entryPoint: webgpuShader.fragmentEntryPoint,
                    targets: [
                        {
                            format: format,
                        },
                    ],
                },
                primitive: {
                    topology: 'triangle-strip',
                },
            })
            this.pipelineCache.set(format, pipeline)
        }
        const texture = webgpuTexture.texture
        const numFaces = texture.cubemap ? 6 : texture.array ? texture.arrayLength : 1
        const srcViews = []
        for (let face = 0; face < numFaces; face++) {
            srcViews.push(
                webgpuTexture.createView({
                    dimension: '2d',
                    baseMipLevel: 0,
                    mipLevelCount: 1,
                    baseArrayLayer: face,
                }),
            )
        }
        const commandEncoder = device.getCommandEncoder()
        for (let i = 1; i < textureDescr.mipLevelCount; i++) {
            for (let face = 0; face < numFaces; face++) {
                const dstView = webgpuTexture.createView({
                    dimension: '2d',
                    baseMipLevel: i,
                    mipLevelCount: 1,
                    baseArrayLayer: face,
                })
                const passEncoder = commandEncoder.beginRenderPass({
                    colorAttachments: [
                        {
                            view: dstView,
                            loadOp: 'clear',
                            storeOp: 'store',
                        },
                    ],
                })
                const bindGroup = wgpu.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [
                        {
                            binding: 0,
                            resource: this.minSampler,
                        },
                        {
                            binding: 1,
                            resource: srcViews[face],
                        },
                    ],
                })
                passEncoder.setPipeline(pipeline)
                passEncoder.setBindGroup(0, bindGroup)
                passEncoder.draw(4)
                passEncoder.end()
                srcViews[face] = dstView
            }
        }
        device.pipeline = null
    }
    constructor(device) {
        this.pipelineCache = new Map()
        this.device = device
        const code = `
 
						var<private> pos : array<vec2f, 4> = array<vec2f, 4>(
								vec2(-1.0, 1.0), vec2(1.0, 1.0),
								vec2(-1.0, -1.0), vec2(1.0, -1.0)
						);

						struct VertexOutput {
								@builtin(position) position : vec4f,
								@location(0) texCoord : vec2f
						};

						@vertex
						fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
							var output : VertexOutput;
							output.texCoord = pos[vertexIndex] * vec2f(0.5, -0.5) + vec2f(0.5);
							output.position = vec4f(pos[vertexIndex], 0, 1);
							return output;
						}

						@group(0) @binding(0) var imgSampler : sampler;
						@group(0) @binding(1) var img : texture_2d<f32>;

						@fragment
						fn fragmentMain(@location(0) texCoord : vec2f) -> @location(0) vec4f {
							return textureSample(img, imgSampler, texCoord);
						}
				`
        this.shader = new Shader(device, {
            name: 'WebGPUMipmapRendererShader',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            vshader: code,
            fshader: code,
        })
        this.minSampler = device.wgpu.createSampler({
            minFilter: 'linear',
        })
    }
}
class DynamicBuffer {
    getBindGroup(ub) {
        const ubSize = ub.format.byteSize
        let bindGroup = this.bindGroupCache.get(ubSize)
        if (!bindGroup) {
            bindGroup = new BindGroup(this.device, this.bindGroupFormat, ub)
            bindGroup.update()
            this.bindGroupCache.set(ubSize, bindGroup)
        }
        return bindGroup
    }
    constructor(device) {
        this.bindGroupCache = new Map()
        this.device = device
        this.bindGroupFormat = new BindGroupFormat(this.device, [
            new BindUniformBufferFormat(UNIFORM_BUFFER_DEFAULT_SLOT_NAME, SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT),
        ])
    }
}

class WebgpuDynamicBuffer extends DynamicBuffer {
    destroy(device) {
        device._vram.ub -= this.buffer.size
        this.buffer.destroy()
        this.buffer = null
    }
    onAvailable() {
        this.mappedRange = this.buffer.getMappedRange()
    }
    alloc(offset, size) {
        return new Int32Array(this.mappedRange, offset, size / 4)
    }
    constructor(device, size, isStaging) {
        ;(super(device), (this.buffer = null), (this.mappedRange = null))
        this.buffer = device.wgpu.createBuffer({
            size: size,
            usage: isStaging
                ? GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC
                : GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: isStaging,
        })
        if (isStaging) {
            this.onAvailable()
        }
        device._vram.ub += size
    }
}

class WebgpuDynamicBuffers extends DynamicBuffers {
    createBuffer(device, size, isStaging) {
        return new WebgpuDynamicBuffer(device, size, isStaging)
    }
    submit() {
        super.submit()
        const count = this.usedBuffers.length
        if (count) {
            const device = this.device
            const gpuBuffers = this.gpuBuffers
            const commandEncoder = device.wgpu.createCommandEncoder()
            for (let i = count - 1; i >= 0; i--) {
                const usedBuffer = this.usedBuffers[i]
                const { stagingBuffer, gpuBuffer, offset, size } = usedBuffer
                const src = stagingBuffer.buffer
                src.unmap()
                commandEncoder.copyBufferToBuffer(src, offset, gpuBuffer.buffer, offset, size)
                gpuBuffers.push(gpuBuffer)
            }
            const cb = commandEncoder.finish()
            device.addCommandBuffer(cb, true)
            for (let i = 0; i < count; i++) {
                const stagingBuffer = this.usedBuffers[i].stagingBuffer
                this.pendingStagingBuffers.push(stagingBuffer)
            }
            this.usedBuffers.length = 0
        }
    }
    onCommandBuffersSubmitted() {
        const count = this.pendingStagingBuffers.length
        if (count) {
            for (let i = 0; i < count; i++) {
                const stagingBuffer = this.pendingStagingBuffers[i]
                stagingBuffer.buffer.mapAsync(GPUMapMode.WRITE).then(() => {
                    if (this.stagingBuffers) {
                        stagingBuffer.onAvailable()
                        this.stagingBuffers.push(stagingBuffer)
                    }
                })
            }
            this.pendingStagingBuffers.length = 0
        }
    }
    constructor(...args) {
        ;(super(...args), (this.pendingStagingBuffers = []))
    }
}

class GpuProfiler {
    loseContext() {
        this.pastFrameAllocations.clear()
    }
    set enabled(value) {
        this._enableRequest = value
    }
    get enabled() {
        return this._enableRequest
    }
    get passTimings() {
        return this._passTimings
    }
    processEnableRequest() {
        if (this._enableRequest !== this._enabled) {
            this._enabled = this._enableRequest
            if (!this._enabled) {
                this._frameTime = 0
            }
        }
    }
    request(renderVersion) {
        this.pastFrameAllocations.set(renderVersion, this.frameAllocations)
        this.frameAllocations = []
    }
    _parsePassName(name) {
        let parsedName = this._nameCache.get(name)
        if (parsedName === undefined) {
            if (name.startsWith('RenderPass')) {
                parsedName = name.substring(10)
            } else {
                parsedName = name
            }
            this._nameCache.set(name, parsedName)
        }
        return parsedName
    }
    report(renderVersion, timings) {
        if (timings) {
            const allocations = this.pastFrameAllocations.get(renderVersion)
            if (!allocations) {
                return
            }
            if (timings.length > 0) {
                this._frameTime = timings.reduce((sum, t) => sum + t, 0)
            }
            this._passTimings.clear()
            for (let i = 0; i < allocations.length; ++i) {
                const name = allocations[i]
                const timing = timings[i]
                const parsedName = this._parsePassName(name)
                this._passTimings.set(parsedName, (this._passTimings.get(parsedName) || 0) + timing)
            }
            if (Tracing.get(TRACEID_GPU_TIMINGS)) {
                let total = 0
                for (let i = 0; i < allocations.length; ++i) {
                    allocations[i]
                    total += timings[i]
                }
            }
        }
        this.pastFrameAllocations.delete(renderVersion)
    }
    getSlot(name) {
        if (this.frameAllocations.length >= this.maxCount) {
            return -1
        }
        const slot = this.frameAllocations.length
        this.frameAllocations.push(name)
        return slot
    }
    get slotCount() {
        return this.frameAllocations.length
    }
    constructor() {
        this.frameAllocations = []
        this.pastFrameAllocations = new Map()
        this._enabled = false
        this._enableRequest = false
        this._frameTime = 0
        this._passTimings = new Map()
        this._nameCache = new Map()
        this.maxCount = 9999
    }
}

class WebgpuQuerySet {
    destroy() {
        this.querySet?.destroy()
        this.querySet = null
        this.queryBuffer?.destroy()
        this.queryBuffer = null
        this.activeStagingBuffer = null
        this.stagingBuffers.forEach((stagingBuffer) => {
            stagingBuffer.destroy()
        })
        this.stagingBuffers = null
    }
    getStagingBuffer() {
        let stagingBuffer = this.stagingBuffers.pop()
        if (!stagingBuffer) {
            stagingBuffer = this.device.wgpu.createBuffer({
                size: this.queryBuffer.size,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            })
        }
        return stagingBuffer
    }
    resolve(count) {
        const device = this.device
        const commandEncoder = device.getCommandEncoder()
        commandEncoder.resolveQuerySet(this.querySet, 0, count, this.queryBuffer, 0)
        const activeStagingBuffer = this.getStagingBuffer()
        this.activeStagingBuffer = activeStagingBuffer
        commandEncoder.copyBufferToBuffer(this.queryBuffer, 0, activeStagingBuffer, 0, this.bytesPerSlot * count)
    }
    request(count, renderVersion) {
        const stagingBuffer = this.activeStagingBuffer
        this.activeStagingBuffer = null
        return stagingBuffer.mapAsync(GPUMapMode.READ).then(() => {
            const srcTimings = new BigInt64Array(stagingBuffer.getMappedRange())
            const timings = []
            for (let i = 0; i < count; i++) {
                timings.push(Number(srcTimings[i * 2 + 1] - srcTimings[i * 2]) * 0.000001)
            }
            stagingBuffer.unmap()
            this.stagingBuffers?.push(stagingBuffer)
            return {
                renderVersion,
                timings,
            }
        })
    }
    constructor(device, isTimestamp, capacity) {
        this.stagingBuffers = []
        this.activeStagingBuffer = null
        this.device = device
        this.capacity = capacity
        this.bytesPerSlot = isTimestamp ? 8 : 4
        const wgpu = device.wgpu
        this.querySet = wgpu.createQuerySet({
            type: isTimestamp ? 'timestamp' : 'occlusion',
            count: capacity,
        })
        this.queryBuffer = wgpu.createBuffer({
            size: this.bytesPerSlot * capacity,
            usage:
                GPUBufferUsage.QUERY_RESOLVE |
                GPUBufferUsage.STORAGE |
                GPUBufferUsage.COPY_SRC |
                GPUBufferUsage.COPY_DST,
        })
    }
}

class WebgpuGpuProfiler extends GpuProfiler {
    destroy() {
        this.timestampQueriesSet?.destroy()
        this.timestampQueriesSet = null
    }
    frameStart() {
        this.processEnableRequest()
    }
    frameEnd() {
        if (this._enabled) {
            this.timestampQueriesSet?.resolve(this.slotCount * 2)
        }
    }
    request() {
        if (this._enabled) {
            const renderVersion = this.device.renderVersion
            this.timestampQueriesSet?.request(this.slotCount, renderVersion).then((results) => {
                this.report(results.renderVersion, results.timings)
            })
            super.request(renderVersion)
        }
    }
    constructor(device) {
        super()
        this.device = device
        this.maxCount = 1024
        this.timestampQueriesSet = device.supportsTimestampQuery
            ? new WebgpuQuerySet(device, true, 2 * this.maxCount)
            : null
    }
}

class WebgpuResolver {
    destroy() {
        this.shader.destroy()
        this.shader = null
        this.pipelineCache = null
    }
    getPipeline(format) {
        let pipeline = this.pipelineCache.get(format)
        if (!pipeline) {
            pipeline = this.createPipeline(format)
            this.pipelineCache.set(format, pipeline)
        }
        return pipeline
    }
    createPipeline(format) {
        const webgpuShader = this.shader.impl
        const pipeline = this.device.wgpu.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: webgpuShader.getVertexShaderModule(),
                entryPoint: webgpuShader.vertexEntryPoint,
            },
            fragment: {
                module: webgpuShader.getFragmentShaderModule(),
                entryPoint: webgpuShader.fragmentEntryPoint,
                targets: [
                    {
                        format: format,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-strip',
            },
        })
        return pipeline
    }
    resolveDepth(commandEncoder, sourceTexture, destinationTexture) {
        const device = this.device
        const wgpu = device.wgpu
        const pipeline = this.getPipeline(destinationTexture.format)
        const numFaces = sourceTexture.depthOrArrayLayers
        for (let face = 0; face < numFaces; face++) {
            const srcView = sourceTexture.createView({
                dimension: '2d',
                aspect: 'depth-only',
                baseMipLevel: 0,
                mipLevelCount: 1,
                baseArrayLayer: face,
            })
            const dstView = destinationTexture.createView({
                dimension: '2d',
                baseMipLevel: 0,
                mipLevelCount: 1,
                baseArrayLayer: face,
            })
            const passEncoder = commandEncoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: dstView,
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            })
            const bindGroup = wgpu.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    {
                        binding: 0,
                        resource: srcView,
                    },
                ],
            })
            passEncoder.setPipeline(pipeline)
            passEncoder.setBindGroup(0, bindGroup)
            passEncoder.draw(4)
            passEncoder.end()
        }
        device.pipeline = null
    }
    constructor(device) {
        this.pipelineCache = new Map()
        this.device = device
        const code = `
 
						var<private> pos : array<vec2f, 4> = array<vec2f, 4>(
								vec2(-1.0, 1.0), vec2(1.0, 1.0), vec2(-1.0, -1.0), vec2(1.0, -1.0)
						);

						struct VertexOutput {
								@builtin(position) position : vec4f,
						};

						@vertex
						fn vertexMain(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
							var output : VertexOutput;
							output.position = vec4f(pos[vertexIndex], 0, 1);
							return output;
						}

						@group(0) @binding(0) var img : texture_depth_multisampled_2d;

						@fragment
						fn fragmentMain(@builtin(position) fragColor: vec4f) -> @location(0) vec4f {
								// load th depth value from sample index 0
								var depth = textureLoad(img, vec2i(fragColor.xy), 0u);
								return vec4f(depth, 0.0, 0.0, 0.0);
						}
				`
        this.shader = new Shader(device, {
            name: 'WebGPUResolverDepthShader',
            shaderLanguage: SHADERLANGUAGE_WGSL,
            vshader: code,
            fshader: code,
        })
    }
}

const _indirectDispatchEntryByteSize$1 = 3 * 4
class WebgpuCompute {
    destroy() {
        this.uniformBuffers.forEach((ub) => ub.destroy())
        this.uniformBuffers.length = 0
        this.bindGroup.destroy()
        this.bindGroup = null
    }
    updateBindGroup() {
        const { bindGroup } = this
        bindGroup.updateUniformBuffers()
        bindGroup.update()
    }
    dispatch(x, y, z) {
        const device = this.compute.device
        device.setBindGroup(0, this.bindGroup)
        const passEncoder = device.passEncoder
        passEncoder.setPipeline(this.pipeline)
        const { indirectSlotIndex, indirectBuffer, indirectFrameStamp } = this.compute
        if (indirectSlotIndex >= 0) {
            let gpuBuffer
            if (indirectBuffer) {
                gpuBuffer = indirectBuffer.impl.buffer
            } else {
                gpuBuffer = device.indirectDispatchBuffer.impl.buffer
            }
            const offset = indirectSlotIndex * _indirectDispatchEntryByteSize$1
            passEncoder.dispatchWorkgroupsIndirect(gpuBuffer, offset)
        } else {
            passEncoder.dispatchWorkgroups(x, y, z)
        }
    }
    constructor(compute) {
        this.uniformBuffers = []
        this.bindGroup = null
        this.compute = compute
        const { device, shader } = compute
        const { computeBindGroupFormat, computeUniformBufferFormats } = shader.impl
        this.bindGroup = new BindGroup(device, computeBindGroupFormat)
        if (computeUniformBufferFormats) {
            for (const name in computeUniformBufferFormats) {
                if (computeUniformBufferFormats.hasOwnProperty(name)) {
                    const ub = new UniformBuffer(device, computeUniformBufferFormats[name], true)
                    this.uniformBuffers.push(ub)
                    this.bindGroup.setUniformBuffer(name, ub)
                }
            }
        }
        this.pipeline = device.computePipeline.get(shader, computeBindGroupFormat)
    }
}

let id$5 = 0
class StorageBuffer {
    destroy() {
        const device = this.device
        device.buffers.delete(this)
        this.adjustVramSizeTracking(device._vram, -this.byteSize)
        this.impl.destroy(device)
    }
    adjustVramSizeTracking(vram, size) {
        vram.sb += size
    }
    read(offset = 0, size = this.byteSize, data = null, immediate = false) {
        return this.impl.read(this.device, offset, size, data, immediate)
    }
    write(bufferOffset = 0, data, dataOffset = 0, size) {
        this.impl.write(this.device, bufferOffset, data, dataOffset, size)
    }
    clear(offset = 0, size = this.byteSize) {
        this.impl.clear(this.device, offset, size)
    }
    copy(srcBuffer, srcOffset = 0, dstOffset = 0, size = srcBuffer.byteSize - srcOffset) {
        const commandEncoder = this.device.getCommandEncoder()
        commandEncoder.copyBufferToBuffer(srcBuffer.impl.buffer, srcOffset, this.impl.buffer, dstOffset, size)
    }
    constructor(graphicsDevice, byteSize, bufferUsage = 0, addStorageUsage = true) {
        this.id = id$5++
        this.device = graphicsDevice
        this.byteSize = byteSize
        this.bufferUsage = bufferUsage
        const usage = addStorageUsage ? BUFFERUSAGE_STORAGE | bufferUsage : bufferUsage
        this.impl = graphicsDevice.createBufferImpl(usage)
        this.impl.allocate(graphicsDevice, byteSize)
        this.device.buffers.add(this)
        this.adjustVramSizeTracking(graphicsDevice._vram, this.byteSize)
    }
}

class WebgpuDrawCommands {
    allocate(maxCount) {
        if (this.gpuIndirect && this.gpuIndirect.length === 5 * maxCount) {
            return
        }
        this.storage?.destroy()
        this.gpuIndirect = new Uint32Array(5 * maxCount)
        this.gpuIndirectSigned = new Int32Array(this.gpuIndirect.buffer)
        this.storage = new StorageBuffer(
            this.device,
            this.gpuIndirect.byteLength,
            BUFFERUSAGE_INDIRECT | BUFFERUSAGE_COPY_DST,
        )
    }
    add(i, indexOrVertexCount, instanceCount, firstIndexOrVertex, baseVertex = 0, firstInstance = 0) {
        const o = i * 5
        this.gpuIndirect[o + 0] = indexOrVertexCount
        this.gpuIndirect[o + 1] = instanceCount
        this.gpuIndirect[o + 2] = firstIndexOrVertex
        this.gpuIndirectSigned[o + 3] = baseVertex
        this.gpuIndirect[o + 4] = firstInstance
    }
    update(count) {
        if (this.storage && count > 0) {
            const used = count * 5
            this.storage.write(0, this.gpuIndirect, 0, used)
        }
        let totalPrimitives = 0
        return totalPrimitives
    }
    destroy() {
        this.storage?.destroy()
        this.storage = null
    }
    constructor(device) {
        this.gpuIndirect = null
        this.gpuIndirectSigned = null
        this.storage = null
        this.device = device
    }
}

class WebgpuUploadStream {
    _onDeviceLost() {}
    destroy() {
        this._destroyed = true
        this.availableStagingBuffers.forEach((buffer) => buffer.destroy())
        this.pendingStagingBuffers.forEach((buffer) => buffer.destroy())
    }
    update(minByteSize) {
        const pending = this.pendingStagingBuffers
        for (let i = 0; i < pending.length; i++) {
            const buffer = pending[i]
            buffer.mapAsync(GPUMapMode.WRITE).then(() => {
                if (!this._destroyed) {
                    this.availableStagingBuffers.push(buffer)
                } else {
                    buffer.destroy()
                }
            })
        }
        pending.length = 0
        const available = this.availableStagingBuffers
        for (let i = available.length - 1; i >= 0; i--) {
            if (available[i].size < minByteSize) {
                available[i].destroy()
                available.splice(i, 1)
            }
        }
    }
    upload(data, target, offset, size) {
        if (this.useSingleBuffer) {
            this.uploadDirect(data, target, offset, size)
        } else {
            this.uploadStaging(data, target, offset, size)
        }
    }
    uploadDirect(data, target, offset, size) {
        const byteOffset = offset * data.BYTES_PER_ELEMENT
        size * data.BYTES_PER_ELEMENT
        target.write(byteOffset, data, 0, size)
    }
    uploadStaging(data, target, offset, size) {
        const device = this.uploadStream.device
        const byteOffset = offset * data.BYTES_PER_ELEMENT
        const byteSize = size * data.BYTES_PER_ELEMENT
        if (this.pendingStagingBuffers.length > 0);
        this.update(byteSize)
        const buffer =
            this.availableStagingBuffers.pop() ??
            (() => {
                const newBuffer = this.uploadStream.device.wgpu.createBuffer({
                    size: byteSize,
                    usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
                    mappedAtCreation: true,
                })
                return newBuffer
            })()
        const mappedRange = buffer.getMappedRange()
        new Uint8Array(mappedRange).set(new Uint8Array(data.buffer, data.byteOffset, byteSize))
        buffer.unmap()
        device.getCommandEncoder().copyBufferToBuffer(buffer, 0, target.impl.buffer, byteOffset, byteSize)
        this.pendingStagingBuffers.push(buffer)
        this._lastUploadSubmitVersion = device.submitVersion
    }
    constructor(uploadStream) {
        this.availableStagingBuffers = []
        this.pendingStagingBuffers = []
        this._destroyed = false
        this._lastUploadSubmitVersion = -1
        this.uploadStream = uploadStream
        this.useSingleBuffer = uploadStream.useSingleBuffer
    }
}

const _uniqueLocations = new Map()
const _indirectEntryByteSize = 5 * 4
const _indirectDispatchEntryByteSize = 3 * 4
class WebgpuGraphicsDevice extends GraphicsDevice {
    destroy() {
        this.clearRenderer.destroy()
        this.clearRenderer = null
        this.mipmapRenderer.destroy()
        this.mipmapRenderer = null
        this.resolver.destroy()
        this.resolver = null
        super.destroy()
    }
    initDeviceCaps() {
        const limits = this.wgpu?.limits
        this.limits = limits
        this.precision = 'highp'
        this.maxPrecision = 'highp'
        this.maxSamples = 4
        this.maxTextures = 16
        this.maxTextureSize = limits.maxTextureDimension2D
        this.maxCubeMapSize = limits.maxTextureDimension2D
        this.maxVolumeSize = limits.maxTextureDimension3D
        this.maxColorAttachments = limits.maxColorAttachments
        this.maxPixelRatio = 1
        this.maxAnisotropy = 16
        this.fragmentUniformsCount = limits.maxUniformBufferBindingSize / 16
        this.vertexUniformsCount = limits.maxUniformBufferBindingSize / 16
        this.supportsUniformBuffers = true
        this.supportsAreaLights = true
        this.supportsGpuParticles = true
        this.supportsCompute = true
        this.textureFloatRenderable = true
        this.textureHalfFloatRenderable = true
        this.supportsImageBitmap = true
        this.samples = this.backBufferAntialias ? 4 : 1
        const wgslFeatures = window.navigator.gpu.wgslLanguageFeatures
        this.supportsStorageTextureRead = wgslFeatures?.has('readonly_and_readwrite_storage_textures')
        this.supportsSubgroupUniformity = wgslFeatures?.has('subgroup_uniformity')
        this.supportsSubgroupId = wgslFeatures?.has('subgroup_id')
        this.initCapsDefines()
    }
    async initWebGpu(glslangUrl, twgslUrl) {
        if (!window.navigator.gpu) {
            throw new Error('Unable to retrieve GPU. Ensure you are using a browser that supports WebGPU rendering.')
        }
        if (glslangUrl && twgslUrl) {
            const buildUrl = (srcPath) => {
                return new URL(srcPath, window.location.href).toString()
            }
            const results = await Promise.all([
                import(/* @vite-ignore */ /* webpackIgnore: true */ `${buildUrl(twgslUrl)}`).then((module) =>
                    twgsl(twgslUrl.replace('.js', '.wasm')),
                ),
                import(/* @vite-ignore */ /* webpackIgnore: true */ `${buildUrl(glslangUrl)}`).then((module) =>
                    module.default(),
                ),
            ])
            this.twgsl = results[0]
            this.glslang = results[1]
        }
        return this.createDevice()
    }
    async createDevice() {
        const adapterOptions = {
            powerPreference:
                this.initOptions.powerPreference !== 'default' ? this.initOptions.powerPreference : undefined,
            xrCompatible: this.initOptions.xrCompatible,
        }
        this.gpuAdapter = await window.navigator.gpu.requestAdapter(adapterOptions)
        const requiredFeatures = []
        const requireFeature = (feature) => {
            const supported = this.gpuAdapter.features.has(feature)
            if (supported) {
                requiredFeatures.push(feature)
            }
            return supported
        }
        this.textureFloatFilterable = requireFeature('float32-filterable')
        this.textureFloatBlendable = requireFeature('float32-blendable')
        this.extCompressedTextureS3TC = requireFeature('texture-compression-bc')
        this.extCompressedTextureS3TCSliced3D = requireFeature('texture-compression-bc-sliced-3d')
        this.extCompressedTextureETC = requireFeature('texture-compression-etc2')
        this.extCompressedTextureASTC = requireFeature('texture-compression-astc')
        this.extCompressedTextureASTCSliced3D = requireFeature('texture-compression-astc-sliced-3d')
        this.supportsTimestampQuery = requireFeature('timestamp-query')
        this.supportsDepthClip = requireFeature('depth-clip-control')
        this.supportsDepth32Stencil = requireFeature('depth32float-stencil8')
        this.supportsIndirectFirstInstance = requireFeature('indirect-first-instance')
        this.supportsShaderF16 = requireFeature('shader-f16')
        this.supportsStorageRGBA8 = requireFeature('bgra8unorm-storage')
        this.textureRG11B10Renderable = requireFeature('rg11b10ufloat-renderable')
        this.supportsClipDistances = requireFeature('clip-distances')
        this.supportsTextureFormatTier1 = requireFeature('texture-format-tier1')
        this.supportsTextureFormatTier2 = requireFeature('texture-format-tier2')
        this.supportsTextureFormatTier1 || (this.supportsTextureFormatTier1 = this.supportsTextureFormatTier2)
        this.supportsPrimitiveIndex = requireFeature('primitive-index')
        const adapterLimits = this.gpuAdapter?.limits
        const requiredLimits = {}
        if (adapterLimits) {
            for (const limitName in adapterLimits) {
                if (limitName === 'minSubgroupSize' || limitName === 'maxSubgroupSize') {
                    continue
                }
                requiredLimits[limitName] = adapterLimits[limitName]
            }
        }
        const deviceDescr = {
            requiredFeatures,
            requiredLimits,
            defaultQueue: {
                label: 'Default Queue',
            },
        }
        this.wgpu = await this.gpuAdapter.requestDevice(deviceDescr)
        this.wgpu.lost?.then(this.handleDeviceLost.bind(this))
        this.initDeviceCaps()
        this.gpuContext = this.canvas.getContext('webgpu')
        let canvasToneMapping = 'standard'
        let preferredCanvasFormat = window.navigator.gpu.getPreferredCanvasFormat()
        const displayFormat = this.initOptions.displayFormat
        this.backBufferFormat =
            preferredCanvasFormat === 'rgba8unorm'
                ? displayFormat === DISPLAYFORMAT_LDR_SRGB
                    ? PIXELFORMAT_SRGBA8
                    : PIXELFORMAT_RGBA8
                : displayFormat === DISPLAYFORMAT_LDR_SRGB
                  ? PIXELFORMAT_SBGRA8
                  : PIXELFORMAT_BGRA8
        this.backBufferViewFormat =
            displayFormat === DISPLAYFORMAT_LDR_SRGB ? `${preferredCanvasFormat}-srgb` : preferredCanvasFormat
        if (displayFormat === DISPLAYFORMAT_HDR && this.textureFloatFilterable) {
            const hdrMediaQuery = window.matchMedia('(dynamic-range: high)')
            if (hdrMediaQuery?.matches) {
                this.backBufferFormat = PIXELFORMAT_RGBA16F
                this.backBufferViewFormat = 'rgba16float'
                preferredCanvasFormat = 'rgba16float'
                this.isHdr = true
                canvasToneMapping = 'extended'
            }
        }
        this.canvasConfig = {
            device: this.wgpu,
            colorSpace: 'srgb',
            alphaMode: this.initOptions.alpha ? 'premultiplied' : 'opaque',
            format: preferredCanvasFormat,
            toneMapping: {
                mode: canvasToneMapping,
            },
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST,
            viewFormats: displayFormat === DISPLAYFORMAT_LDR_SRGB ? [this.backBufferViewFormat] : [],
        }
        this.gpuContext?.configure(this.canvasConfig)
        this.createBackbuffer()
        this.clearRenderer = new WebgpuClearRenderer(this)
        this.mipmapRenderer = new WebgpuMipmapRenderer(this)
        this.resolver = new WebgpuResolver(this)
        this.postInit()
        return this
    }
    async handleDeviceLost(info) {
        if (info.reason !== 'destroyed') {
            super.loseContext()
            await this.createDevice()
            super.restoreContext()
        }
    }
    postInit() {
        super.postInit()
        this.initializeRenderState()
        this.setupPassEncoderDefaults()
        this.gpuProfiler = new WebgpuGpuProfiler(this)
        this.dynamicBuffers = new WebgpuDynamicBuffers(this, 100 * 1024, this.limits.minUniformBufferOffsetAlignment)
        this.emptyBindGroup = new BindGroup(this, new BindGroupFormat(this, []))
        this.emptyBindGroup.update()
    }
    createBackbuffer() {
        this.supportsStencil = this.initOptions.stencil
        this.backBuffer = new RenderTarget({
            name: 'WebgpuFramebuffer',
            graphicsDevice: this,
            depth: this.initOptions.depth,
            stencil: this.supportsStencil,
            samples: this.samples,
        })
        this.backBuffer.impl.isBackbuffer = true
    }
    frameStart() {
        super.frameStart()
        this.gpuProfiler.frameStart()
        this.submit()
        const outColorBuffer = this.gpuContext?.getCurrentTexture?.() ?? this.externalBackbuffer?.impl.gpuTexture
        if (this.backBufferSize.x !== outColorBuffer.width || this.backBufferSize.y !== outColorBuffer.height) {
            this.backBufferSize.set(outColorBuffer.width, outColorBuffer.height)
            this.backBuffer.destroy()
            this.backBuffer = null
            this.createBackbuffer()
        }
        const rt = this.backBuffer
        const wrt = rt.impl
        wrt.setColorAttachment(0, undefined, this.backBufferViewFormat)
        this.initRenderTarget(rt)
        wrt.assignColorTexture(this, outColorBuffer)
    }
    frameEnd() {
        super.frameEnd()
        this.gpuProfiler.frameEnd()
        this.submit()
        if (!this.contextLost) {
            this.gpuProfiler.request()
        }
        this._indirectDrawNextIndex = 0
        this._indirectDispatchNextIndex = 0
    }
    createBufferImpl(usageFlags) {
        return new WebgpuBuffer(usageFlags)
    }
    createUniformBufferImpl(uniformBuffer) {
        return new WebgpuUniformBuffer(uniformBuffer)
    }
    createVertexBufferImpl(vertexBuffer, format, options) {
        return new WebgpuVertexBuffer(vertexBuffer, format, options)
    }
    createIndexBufferImpl(indexBuffer, options) {
        return new WebgpuIndexBuffer(indexBuffer, options)
    }
    createShaderImpl(shader) {
        return new WebgpuShader(shader)
    }
    createDrawCommandImpl(drawCommands) {
        return new WebgpuDrawCommands(this)
    }
    createTextureImpl(texture) {
        this.textures.add(texture)
        return new WebgpuTexture(texture)
    }
    createRenderTargetImpl(renderTarget) {
        return new WebgpuRenderTarget(renderTarget)
    }
    createUploadStreamImpl(uploadStream) {
        return new WebgpuUploadStream(uploadStream)
    }
    createBindGroupFormatImpl(bindGroupFormat) {
        return new WebgpuBindGroupFormat(bindGroupFormat)
    }
    createBindGroupImpl(bindGroup) {
        return new WebgpuBindGroup()
    }
    createComputeImpl(compute) {
        return new WebgpuCompute(compute)
    }
    get indirectDrawBuffer() {
        this.allocateIndirectDrawBuffer()
        return this._indirectDrawBuffer
    }
    allocateIndirectDrawBuffer() {
        if (this._indirectDrawNextIndex === 0 && this._indirectDrawBufferCount < this.maxIndirectDrawCount) {
            this._indirectDrawBuffer?.destroy()
            this._indirectDrawBuffer = null
        }
        if (this._indirectDrawBuffer === null) {
            this._indirectDrawBuffer = new StorageBuffer(
                this,
                this.maxIndirectDrawCount * _indirectEntryByteSize,
                BUFFERUSAGE_INDIRECT | BUFFERUSAGE_COPY_DST,
            )
            this._indirectDrawBufferCount = this.maxIndirectDrawCount
        }
    }
    getIndirectDrawSlot(count = 1) {
        this.allocateIndirectDrawBuffer()
        const slot = this._indirectDrawNextIndex
        const nextIndex = this._indirectDrawNextIndex + count
        this._indirectDrawNextIndex = nextIndex
        return slot
    }
    get indirectDispatchBuffer() {
        this.allocateIndirectDispatchBuffer()
        return this._indirectDispatchBuffer
    }
    allocateIndirectDispatchBuffer() {
        if (
            this._indirectDispatchNextIndex === 0 &&
            this._indirectDispatchBufferCount < this.maxIndirectDispatchCount
        ) {
            this._indirectDispatchBuffer?.destroy()
            this._indirectDispatchBuffer = null
        }
        if (this._indirectDispatchBuffer === null) {
            this._indirectDispatchBuffer = new StorageBuffer(
                this,
                this.maxIndirectDispatchCount * _indirectDispatchEntryByteSize,
                BUFFERUSAGE_INDIRECT | BUFFERUSAGE_COPY_DST,
            )
            this._indirectDispatchBufferCount = this.maxIndirectDispatchCount
        }
    }
    getIndirectDispatchSlot(count = 1) {
        this.allocateIndirectDispatchBuffer()
        const slot = this._indirectDispatchNextIndex
        const nextIndex = this._indirectDispatchNextIndex + count
        this._indirectDispatchNextIndex = nextIndex
        return slot
    }
    setBindGroup(index, bindGroup, offsets) {
        if (this.passEncoder) {
            this.passEncoder.setBindGroup(index, bindGroup.impl.bindGroup, offsets ?? bindGroup.uniformBufferOffsets)
            this.bindGroupFormats[index] = bindGroup.format.impl
        }
    }
    submitVertexBuffer(vertexBuffer, slot) {
        const format = vertexBuffer.format
        const { interleaved, elements } = format
        const elementCount = elements.length
        const vbBuffer = vertexBuffer.impl.buffer
        if (interleaved) {
            this.passEncoder.setVertexBuffer(slot, vbBuffer)
            return 1
        }
        for (let i = 0; i < elementCount; i++) {
            this.passEncoder.setVertexBuffer(slot + i, vbBuffer, elements[i].offset)
        }
        return elementCount
    }
    validateVBLocations(vb0, vb1) {
        const validateVB = (vb) => {
            const { elements } = vb.format
            for (let i = 0; i < elements.length; i++) {
                const name = elements[i].name
                const location = semanticToLocation[name]
                if (_uniqueLocations.has(location));
                _uniqueLocations.set(location, name)
            }
        }
        validateVB(vb0)
        validateVB(vb1)
        _uniqueLocations.clear()
    }
    draw(primitive, indexBuffer, numInstances = 1, drawCommands, first = true, last = true) {
        if (this.shader.ready && !this.shader.failed) {
            const passEncoder = this.passEncoder
            let pipeline = this.pipeline
            const vb0 = this.vertexBuffers[0]
            const vb1 = this.vertexBuffers[1]
            if (first) {
                if (vb0) {
                    const vbSlot = this.submitVertexBuffer(vb0, 0)
                    if (vb1) {
                        this.submitVertexBuffer(vb1, vbSlot)
                    }
                }
                pipeline = this.renderPipeline.get(
                    primitive,
                    vb0?.format,
                    vb1?.format,
                    indexBuffer?.format,
                    this.shader,
                    this.renderTarget,
                    this.bindGroupFormats,
                    this.blendState,
                    this.depthState,
                    this.cullMode,
                    this.stencilEnabled,
                    this.stencilFront,
                    this.stencilBack,
                    this.frontFace,
                )
                if (this.pipeline !== pipeline) {
                    this.pipeline = pipeline
                    passEncoder.setPipeline(pipeline)
                }
            }
            if (indexBuffer) {
                passEncoder.setIndexBuffer(indexBuffer.impl.buffer, indexBuffer.impl.format)
            }
            if (drawCommands) {
                const storage = drawCommands.impl?.storage ?? this.indirectDrawBuffer
                const indirectBuffer = storage.impl.buffer
                const drawsCount = drawCommands.count
                for (let d = 0; d < drawsCount; d++) {
                    const indirectOffset = (drawCommands.slotIndex + d) * _indirectEntryByteSize
                    if (indexBuffer) {
                        passEncoder.drawIndexedIndirect(indirectBuffer, indirectOffset)
                    } else {
                        passEncoder.drawIndirect(indirectBuffer, indirectOffset)
                    }
                }
            } else {
                if (indexBuffer) {
                    passEncoder.drawIndexed(primitive.count, numInstances, primitive.base, primitive.baseVertex ?? 0, 0)
                } else {
                    passEncoder.draw(primitive.count, numInstances, primitive.base, 0)
                }
            }
            this._drawCallsPerFrame++
        }
        if (last) {
            this.clearVertexBuffer()
            this.pipeline = null
        }
    }
    setShader(shader, asyncCompile = false) {
        if (shader !== this.shader) {
            this.shader = shader
        }
    }
    setBlendState(blendState) {
        this.blendState.copy(blendState)
    }
    setDepthState(depthState) {
        this.depthState.copy(depthState)
    }
    setStencilState(stencilFront, stencilBack) {
        if (stencilFront || stencilBack) {
            this.stencilEnabled = true
            this.stencilFront.copy(stencilFront ?? StencilParameters.DEFAULT)
            this.stencilBack.copy(stencilBack ?? StencilParameters.DEFAULT)
            const ref = this.stencilFront.ref
            if (this.stencilRef !== ref) {
                this.stencilRef = ref
                this.passEncoder.setStencilReference(ref)
            }
        } else {
            this.stencilEnabled = false
        }
    }
    setBlendColor(r, g, b, a) {
        const c = this.blendColor
        if (r !== c.r || g !== c.g || b !== c.b || a !== c.a) {
            c.set(r, g, b, a)
            this.passEncoder.setBlendConstant(c)
        }
    }
    setCullMode(cullMode) {
        this.cullMode = cullMode
    }
    setFrontFace(frontFace) {
        this.frontFace = frontFace
    }
    setAlphaToCoverage(state) {}
    initializeContextCaches() {
        super.initializeContextCaches()
    }
    setupPassEncoderDefaults() {
        this.pipeline = null
        this.stencilRef = 0
        this.blendColor.set(0, 0, 0, 0)
    }
    _uploadDirtyTextures() {
        this.texturesToUpload.forEach((texture) => {
            if (texture._needsUpload || texture._needsMipmapsUpload) {
                texture.upload()
            }
        })
        this.texturesToUpload.clear()
    }
    setupTimeStampWrites(passDesc, name) {
        if (this.gpuProfiler._enabled) {
            if (this.gpuProfiler.timestampQueriesSet) {
                const slot = this.gpuProfiler.getSlot(name)
                if (slot === -1);
                else {
                    passDesc = passDesc ?? {}
                    passDesc.timestampWrites = {
                        querySet: this.gpuProfiler.timestampQueriesSet.querySet,
                        beginningOfPassWriteIndex: slot * 2,
                        endOfPassWriteIndex: slot * 2 + 1,
                    }
                }
            }
        }
        return passDesc
    }
    startRenderPass(renderPass) {
        this._uploadDirtyTextures()
        const rt = renderPass.renderTarget || this.backBuffer
        this.renderTarget = rt
        const wrt = rt.impl
        if (rt !== this.backBuffer) {
            this.initRenderTarget(rt)
        }
        wrt.setupForRenderPass(renderPass, rt)
        const renderPassDesc = wrt.renderPassDescriptor
        this.setupTimeStampWrites(renderPassDesc, renderPass.name)
        const commandEncoder = this.getCommandEncoder()
        this.passEncoder = commandEncoder.beginRenderPass(renderPassDesc)
        this.passEncoder.label = `${renderPass.name}-PassEncoder RT:${rt.name}`
        this.setupPassEncoderDefaults()
        const { width, height } = rt
        this.setViewport(0, 0, width, height)
        this.setScissor(0, 0, width, height)
        this.insideRenderPass = true
    }
    endRenderPass(renderPass) {
        this.passEncoder.end()
        this.passEncoder = null
        this.insideRenderPass = false
        this.bindGroupFormats.length = 0
        const target = this.renderTarget
        if (target) {
            if (target.depthBuffer && renderPass.depthStencilOps.resolveDepth) {
                if (renderPass.samples > 1 && target.autoResolve) {
                    const depthAttachment = target.impl.depthAttachment
                    const destTexture = target.depthBuffer.impl.gpuTexture
                    if (depthAttachment && destTexture) {
                        this.resolver.resolveDepth(
                            this.commandEncoder,
                            depthAttachment.multisampledDepthBuffer,
                            destTexture,
                        )
                    }
                }
            }
        }
        for (let i = 0; i < renderPass.colorArrayOps.length; i++) {
            const colorOps = renderPass.colorArrayOps[i]
            if (colorOps.genMipmaps) {
                this.mipmapRenderer.generate(renderPass.renderTarget._colorBuffers[i].impl)
            }
        }
    }
    startComputePass(name) {
        this._uploadDirtyTextures()
        this.pipeline = null
        const computePassDesc = this.setupTimeStampWrites(undefined, name)
        const commandEncoder = this.getCommandEncoder()
        this.passEncoder = commandEncoder.beginComputePass(computePassDesc)
        this.insideRenderPass = true
    }
    endComputePass() {
        this.passEncoder.end()
        this.passEncoder = null
        this.insideRenderPass = false
        this.bindGroupFormats.length = 0
    }
    computeDispatch(computes, name = 'Unnamed') {
        this.startComputePass(name)
        for (let i = 0; i < computes.length; i++) {
            const compute = computes[i]
            compute.applyParameters()
            compute.impl.updateBindGroup()
        }
        for (let i = 0; i < computes.length; i++) {
            const compute = computes[i]
            compute.impl.dispatch(compute.countX, compute.countY, compute.countZ)
        }
        this.endComputePass()
    }
    getCommandEncoder() {
        let commandEncoder = this.commandEncoder
        if (!commandEncoder) {
            commandEncoder = this.wgpu.createCommandEncoder()
            this.commandEncoder = commandEncoder
        }
        return commandEncoder
    }
    endCommandEncoder() {
        const { commandEncoder } = this
        if (commandEncoder) {
            const cb = commandEncoder.finish()
            this.addCommandBuffer(cb)
            this.commandEncoder = null
        }
    }
    addCommandBuffer(commandBuffer, front = false) {
        if (front) {
            this.commandBuffers.unshift(commandBuffer)
        } else {
            this.commandBuffers.push(commandBuffer)
        }
    }
    submit() {
        this.endCommandEncoder()
        if (this.commandBuffers.length > 0) {
            this.dynamicBuffers.submit()
            this.wgpu.queue.submit(this.commandBuffers)
            this.commandBuffers.length = 0
            this.submitVersion++
            this.dynamicBuffers.onCommandBuffersSubmitted()
        }
        const deferredDestroys = this._deferredDestroys
        if (deferredDestroys.length > 0) {
            for (let i = 0; i < deferredDestroys.length; i++) {
                deferredDestroys[i].destroy()
            }
            deferredDestroys.length = 0
        }
    }
    deferDestroy(gpuResource) {
        if (gpuResource) {
            this._deferredDestroys.push(gpuResource)
        }
    }
    clear(options) {
        if (options.flags) {
            this.clearRenderer.clear(this, this.renderTarget, options, this.defaultClearOptions)
        }
    }
    setViewport(x, y, w, h) {
        if (this.passEncoder) {
            if (!this.renderTarget.flipY) {
                y = this.renderTarget.height - y - h
            }
            this.vx = x
            this.vy = y
            this.vw = w
            this.vh = h
            this.passEncoder.setViewport(x, y, w, h, 0, 1)
        }
    }
    setScissor(x, y, w, h) {
        if (this.passEncoder) {
            if (!this.renderTarget.flipY) {
                y = this.renderTarget.height - y - h
            }
            this.sx = x
            this.sy = y
            this.sw = w
            this.sh = h
            this.passEncoder.setScissorRect(x, y, w, h)
        }
    }
    clearStorageBuffer(storageBuffer, offset = 0, size = storageBuffer.byteSize) {
        const commandEncoder = this.getCommandEncoder()
        commandEncoder.clearBuffer(storageBuffer.buffer, offset, size)
    }
    readStorageBuffer(
        storageBuffer,
        offset = 0,
        size = storageBuffer.byteSize - offset,
        data = null,
        immediate = false,
    ) {
        const stagingBuffer = this.createBufferImpl(BUFFERUSAGE_READ | BUFFERUSAGE_COPY_DST)
        stagingBuffer.allocate(this, size)
        const destBuffer = stagingBuffer.buffer
        const commandEncoder = this.getCommandEncoder()
        commandEncoder.copyBufferToBuffer(storageBuffer.buffer, offset, destBuffer, 0, size)
        return this.readBuffer(stagingBuffer, size, data, immediate)
    }
    readBuffer(stagingBuffer, size, data = null, immediate = false) {
        const destBuffer = stagingBuffer.buffer
        return new Promise((resolve, reject) => {
            const read = () => {
                destBuffer?.mapAsync(GPUMapMode.READ).then(() => {
                    data ?? (data = new Uint8Array(size))
                    const copySrc = destBuffer.getMappedRange(0, size)
                    const srcType = data.constructor
                    data.set(new srcType(copySrc))
                    destBuffer.unmap()
                    stagingBuffer.destroy(this)
                    resolve(data)
                })
            }
            if (immediate) {
                this.submit()
                read()
            } else {
                setTimeout(() => {
                    read()
                })
            }
        })
    }
    writeStorageBuffer(storageBuffer, bufferOffset = 0, data, dataOffset = 0, size) {
        this.wgpu.queue.writeBuffer(storageBuffer.buffer, bufferOffset, data, dataOffset, size)
    }
    copyRenderTarget(source, dest, color, depth) {
        const copySize = {
            width: source ? source.width : dest.width,
            height: source ? source.height : dest.height,
            depthOrArrayLayers: 1,
        }
        const commandEncoder = this.getCommandEncoder()
        if (color) {
            const copySrc = {
                texture: source ? source.colorBuffer.impl.gpuTexture : this.backBuffer.impl.assignedColorTexture,
                mipLevel: source ? source.mipLevel : 0,
            }
            const copyDst = {
                texture: dest ? dest.colorBuffer.impl.gpuTexture : this.backBuffer.impl.assignedColorTexture,
                mipLevel: dest ? dest.mipLevel : 0,
            }
            commandEncoder.copyTextureToTexture(copySrc, copyDst, copySize)
        }
        if (depth) {
            const sourceRT = source ? source : this.renderTarget
            const sourceTexture = sourceRT.impl.depthAttachment.depthTexture
            const sourceMipLevel = sourceRT.mipLevel
            if (source.samples > 1) {
                const destTexture = dest.colorBuffer.impl.gpuTexture
                this.resolver.resolveDepth(commandEncoder, sourceTexture, destTexture)
            } else {
                const destTexture = dest
                    ? dest.depthBuffer.impl.gpuTexture
                    : this.renderTarget.impl.depthAttachment.depthTexture
                const destMipLevel = dest ? dest.mipLevel : this.renderTarget.mipLevel
                const copySrc = {
                    texture: sourceTexture,
                    mipLevel: sourceMipLevel,
                }
                const copyDst = {
                    texture: destTexture,
                    mipLevel: destMipLevel,
                }
                commandEncoder.copyTextureToTexture(copySrc, copyDst, copySize)
            }
        }
        return true
    }
    get hasTranspilers() {
        return this.glslang && this.twgsl
    }
    constructor(canvas, options = {}) {
        ;(super(canvas, options),
            (this._deferredDestroys = []),
            (this.renderPipeline = new WebgpuRenderPipeline(this)),
            (this.computePipeline = new WebgpuComputePipeline(this)),
            (this._indirectDrawBuffer = null),
            (this._indirectDrawBufferCount = 0),
            (this._indirectDrawNextIndex = 0),
            (this._indirectDispatchBuffer = null),
            (this._indirectDispatchBufferCount = 0),
            (this._indirectDispatchNextIndex = 0),
            (this.pipeline = null),
            (this.bindGroupFormats = []),
            (this.submitVersion = 0),
            (this.commandEncoder = null),
            (this.commandBuffers = []),
            (this.glslang = null),
            (this.twgsl = null))
        options = this.initOptions
        options.alpha = options.alpha ?? true
        this.backBufferAntialias = options.antialias ?? false
        this.isWebGPU = true
        this._deviceType = DEVICETYPE_WEBGPU
        this.scope.resolve(UNUSED_UNIFORM_NAME).setValue(0)
    }
}

class WebglBuffer {
    destroy(device) {
        if (this.bufferId) {
            device.gl.deleteBuffer(this.bufferId)
            this.bufferId = null
        }
    }
    get initialized() {
        return !!this.bufferId
    }
    loseContext() {
        this.bufferId = null
    }
    unlock(device, usage, target, storage) {
        const gl = device.gl
        if (!this.bufferId) {
            let glUsage
            switch (usage) {
                case BUFFER_STATIC:
                    glUsage = gl.STATIC_DRAW
                    break
                case BUFFER_DYNAMIC:
                    glUsage = gl.DYNAMIC_DRAW
                    break
                case BUFFER_STREAM:
                    glUsage = gl.STREAM_DRAW
                    break
                case BUFFER_GPUDYNAMIC:
                    glUsage = gl.DYNAMIC_COPY
                    break
            }
            this.bufferId = gl.createBuffer()
            gl.bindBuffer(target, this.bufferId)
            gl.bufferData(target, storage, glUsage)
        } else {
            gl.bindBuffer(target, this.bufferId)
            gl.bufferSubData(target, 0, storage)
        }
    }
    constructor() {
        this.bufferId = null
    }
}

class WebglVertexBuffer extends WebglBuffer {
    destroy(device) {
        super.destroy(device)
        device.unbindVertexArray()
    }
    loseContext() {
        super.loseContext()
        this.vao = null
    }
    unlock(vertexBuffer) {
        const device = vertexBuffer.device
        super.unlock(device, vertexBuffer.usage, device.gl.ARRAY_BUFFER, vertexBuffer.storage)
    }
    constructor(...args) {
        ;(super(...args), (this.vao = null))
    }
}

class WebglIndexBuffer extends WebglBuffer {
    unlock(indexBuffer) {
        const device = indexBuffer.device
        super.unlock(device, indexBuffer.usage, device.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.storage)
    }
    constructor(indexBuffer) {
        super()
        const gl = indexBuffer.device.gl
        const format = indexBuffer.format
        if (format === INDEXFORMAT_UINT8) {
            this.glFormat = gl.UNSIGNED_BYTE
        } else if (format === INDEXFORMAT_UINT16) {
            this.glFormat = gl.UNSIGNED_SHORT
        } else if (format === INDEXFORMAT_UINT32) {
            this.glFormat = gl.UNSIGNED_INT
        }
    }
}

class WebglShaderInput {
    constructor(graphicsDevice, name, type, locationId) {
        this.locationId = locationId
        this.scopeId = graphicsDevice.scope.resolve(name)
        this.version = new Version()
        if (name.substring(name.length - 3) === '[0]') {
            switch (type) {
                case UNIFORMTYPE_FLOAT:
                    type = UNIFORMTYPE_FLOATARRAY
                    break
                case UNIFORMTYPE_INT:
                    type = UNIFORMTYPE_INTARRAY
                    break
                case UNIFORMTYPE_UINT:
                    type = UNIFORMTYPE_UINTARRAY
                    break
                case UNIFORMTYPE_BOOL:
                    type = UNIFORMTYPE_BOOLARRAY
                    break
                case UNIFORMTYPE_VEC2:
                    type = UNIFORMTYPE_VEC2ARRAY
                    break
                case UNIFORMTYPE_IVEC2:
                    type = UNIFORMTYPE_IVEC2ARRAY
                    break
                case UNIFORMTYPE_UVEC2:
                    type = UNIFORMTYPE_UVEC2ARRAY
                    break
                case UNIFORMTYPE_BVEC2:
                    type = UNIFORMTYPE_BVEC2ARRAY
                    break
                case UNIFORMTYPE_VEC3:
                    type = UNIFORMTYPE_VEC3ARRAY
                    break
                case UNIFORMTYPE_IVEC3:
                    type = UNIFORMTYPE_IVEC3ARRAY
                    break
                case UNIFORMTYPE_UVEC3:
                    type = UNIFORMTYPE_UVEC3ARRAY
                    break
                case UNIFORMTYPE_BVEC3:
                    type = UNIFORMTYPE_BVEC3ARRAY
                    break
                case UNIFORMTYPE_VEC4:
                    type = UNIFORMTYPE_VEC4ARRAY
                    break
                case UNIFORMTYPE_IVEC4:
                    type = UNIFORMTYPE_IVEC4ARRAY
                    break
                case UNIFORMTYPE_UVEC4:
                    type = UNIFORMTYPE_UVEC4ARRAY
                    break
                case UNIFORMTYPE_BVEC4:
                    type = UNIFORMTYPE_BVEC4ARRAY
                    break
            }
        }
        this.dataType = type
        this.value = [null, null, null, null]
        this.array = []
    }
}

const _vertexShaderBuiltins = new Set(['gl_VertexID', 'gl_InstanceID', 'gl_DrawID', 'gl_BaseVertex', 'gl_BaseInstance'])
class CompiledShaderCache {
    destroy(device) {
        this.map.forEach((shader) => {
            device.gl.deleteShader(shader)
        })
    }
    loseContext(device) {
        this.map.clear()
    }
    constructor() {
        this.map = new Map()
    }
}
const _vertexShaderCache = new DeviceCache()
const _fragmentShaderCache = new DeviceCache()
class WebglShader {
    destroy(shader) {
        if (this.glProgram) {
            shader.device.gl.deleteProgram(this.glProgram)
            this.glProgram = null
        }
    }
    init() {
        this.uniforms = []
        this.samplers = []
        this.attributes = []
        this.glProgram = null
        this.glVertexShader = null
        this.glFragmentShader = null
    }
    loseContext() {
        this.init()
    }
    restoreContext(device, shader) {
        this.compile(device, shader)
        this.link(device, shader)
    }
    compile(device, shader) {
        const definition = shader.definition
        this.glVertexShader = this._compileShaderSource(device, definition.vshader, true)
        this.glFragmentShader = this._compileShaderSource(device, definition.fshader, false)
    }
    link(device, shader) {
        if (this.glProgram) {
            return
        }
        const gl = device.gl
        if (gl.isContextLost()) {
            return
        }
        const glProgram = gl.createProgram()
        this.glProgram = glProgram
        gl.attachShader(glProgram, this.glVertexShader)
        gl.attachShader(glProgram, this.glFragmentShader)
        const definition = shader.definition
        const attrs = definition.attributes
        if (definition.useTransformFeedback) {
            let outNames = definition.feedbackVaryings
            if (!outNames) {
                outNames = []
                for (const attr in attrs) {
                    if (attrs.hasOwnProperty(attr)) {
                        outNames.push(`out_${attr}`)
                    }
                }
            }
            gl.transformFeedbackVaryings(glProgram, outNames, gl.INTERLEAVED_ATTRIBS)
        }
        for (const attr in attrs) {
            if (attrs.hasOwnProperty(attr)) {
                const semantic = attrs[attr]
                const loc = semanticToLocation[semantic]
                gl.bindAttribLocation(glProgram, loc, attr)
            }
        }
        gl.linkProgram(glProgram)
    }
    _compileShaderSource(device, src, isVertexShader) {
        const gl = device.gl
        if (gl.isContextLost()) {
            return null
        }
        const shaderDeviceCache = isVertexShader ? _vertexShaderCache : _fragmentShaderCache
        const shaderCache = shaderDeviceCache.get(device, () => {
            return new CompiledShaderCache()
        })
        let glShader = shaderCache.map.get(src)
        if (!glShader) {
            glShader = gl.createShader(isVertexShader ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER)
            gl.shaderSource(glShader, src)
            gl.compileShader(glShader)
            shaderCache.map.set(src, glShader)
        }
        return glShader
    }
    finalize(device, shader) {
        const gl = device.gl
        if (gl.isContextLost()) {
            return true
        }
        const glProgram = this.glProgram
        const definition = shader.definition
        const linkStatus = gl.getProgramParameter(glProgram, gl.LINK_STATUS)
        if (!linkStatus) {
            if (!this._isCompiled(device, shader, this.glVertexShader, definition.vshader, 'vertex')) {
                return false
            }
            if (!this._isCompiled(device, shader, this.glFragmentShader, definition.fshader, 'fragment')) {
                return false
            }
            const message = `Failed to link shader program. Error: ${gl.getProgramInfoLog(glProgram)}`
            console.error(message)
            return false
        }
        const numAttributes = gl.getProgramParameter(glProgram, gl.ACTIVE_ATTRIBUTES)
        shader.attributes.clear()
        for (let i = 0; i < numAttributes; i++) {
            const info = gl.getActiveAttrib(glProgram, i)
            const location = gl.getAttribLocation(glProgram, info.name)
            if (_vertexShaderBuiltins.has(info.name)) {
                continue
            }
            if (definition.attributes[info.name] === undefined) {
                console.error(
                    `Vertex shader attribute "${info.name}" is not mapped to a semantic in shader definition, shader [${shader.label}]`,
                    shader,
                )
                shader.failed = true
            } else {
                shader.attributes.set(location, info.name)
            }
        }
        const samplerTypes = device._samplerTypes
        const numUniforms = gl.getProgramParameter(glProgram, gl.ACTIVE_UNIFORMS)
        for (let i = 0; i < numUniforms; i++) {
            const info = gl.getActiveUniform(glProgram, i)
            const location = gl.getUniformLocation(glProgram, info.name)
            if (_vertexShaderBuiltins.has(info.name)) {
                continue
            }
            const shaderInput = new WebglShaderInput(device, info.name, device.pcUniformType[info.type], location)
            if (samplerTypes.has(info.type)) {
                this.samplers.push(shaderInput)
            } else {
                this.uniforms.push(shaderInput)
            }
        }
        shader.ready = true
        return true
    }
    _isCompiled(device, shader, glShader, source, shaderType) {
        const gl = device.gl
        if (!gl.getShaderParameter(glShader, gl.COMPILE_STATUS)) {
            const infoLog = gl.getShaderInfoLog(glShader)
            const [code, error] = this._processError(source, infoLog)
            const message = `Failed to compile ${shaderType} shader:\n\n${infoLog}\n${code} while rendering ${void 0}`
            console.error(message)
            return false
        }
        return true
    }
    isLinked(device) {
        const { extParallelShaderCompile } = device
        if (extParallelShaderCompile) {
            return device.gl.getProgramParameter(this.glProgram, extParallelShaderCompile.COMPLETION_STATUS_KHR)
        }
        return true
    }
    _processError(src, infoLog) {
        const error = {}
        let code = ''
        if (src) {
            const lines = src.split('\n')
            let from = 0
            let to = lines.length
            if (infoLog && infoLog.startsWith('ERROR:')) {
                const match = infoLog.match(/^ERROR:\s(\d+):(\d+):\s*(.+)/)
                if (match) {
                    error.message = match[3]
                    error.line = parseInt(match[2], 10)
                    from = Math.max(0, error.line - 6)
                    to = Math.min(lines.length, error.line + 5)
                }
            }
            for (let i = from; i < to; i++) {
                const linePrefix = i + 1 === error.line ? '> ' : '  '
                code += `${linePrefix}${i + 1}:\t${lines[i]}\n`
            }
            error.source = src
        }
        return [code, error]
    }
    constructor(shader) {
        this.compileDuration = 0
        this.init()
        this.compile(shader.device, shader)
        this.link(shader.device, shader)
        shader.device.shaders.push(shader)
    }
}

class WebglDrawCommands {
    allocate(maxCount) {
        if (this.glCounts && this.glCounts.length === maxCount) {
            return
        }
        this.glCounts = new Int32Array(maxCount)
        this.glOffsetsBytes = new Int32Array(maxCount)
        this.glInstanceCounts = new Int32Array(maxCount)
    }
    add(i, indexOrVertexCount, instanceCount, firstIndexOrVertex) {
        this.glCounts[i] = indexOrVertexCount
        this.glOffsetsBytes[i] = firstIndexOrVertex * this.indexSizeBytes
        this.glInstanceCounts[i] = instanceCount
    }
    update(count) {
        let totalPrimitives = 0
        return totalPrimitives
    }
    constructor(indexSizeBytes) {
        this.glCounts = null
        this.glOffsetsBytes = null
        this.glInstanceCounts = null
        this.indexSizeBytes = indexSizeBytes
    }
}

function downsampleImage(image, size) {
    const srcW = image.width
    const srcH = image.height
    if (srcW > size || srcH > size) {
        const scale = size / Math.max(srcW, srcH)
        const dstW = Math.floor(srcW * scale)
        const dstH = Math.floor(srcH * scale)
        const canvas = document.createElement('canvas')
        canvas.width = dstW
        canvas.height = dstH
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0, srcW, srcH, 0, 0, dstW, dstH)
        return canvas
    }
    return image
}
class WebglTexture {
    destroy(device) {
        if (this._glTexture) {
            for (let i = 0; i < device.textureUnits.length; i++) {
                const textureUnit = device.textureUnits[i]
                for (let j = 0; j < textureUnit.length; j++) {
                    if (textureUnit[j] === this._glTexture) {
                        textureUnit[j] = null
                    }
                }
            }
            device.gl.deleteTexture(this._glTexture)
            this._glTexture = null
        }
    }
    loseContext() {
        this._glTexture = null
    }
    propertyChanged(flag) {
        this.dirtyParameterFlags |= flag
    }
    initialize(device, texture) {
        const gl = device.gl
        this._glTexture = gl.createTexture()
        this._glTarget = texture._cubemap
            ? gl.TEXTURE_CUBE_MAP
            : texture._volume
              ? gl.TEXTURE_3D
              : texture.array
                ? gl.TEXTURE_2D_ARRAY
                : gl.TEXTURE_2D
        switch (texture._format) {
            case PIXELFORMAT_A8:
                this._glFormat = gl.ALPHA
                this._glInternalFormat = gl.ALPHA
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_L8:
                this._glFormat = gl.LUMINANCE
                this._glInternalFormat = gl.LUMINANCE
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_LA8:
                this._glFormat = gl.LUMINANCE_ALPHA
                this._glInternalFormat = gl.LUMINANCE_ALPHA
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_R8:
                this._glFormat = gl.RED
                this._glInternalFormat = gl.R8
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_RG8:
                this._glFormat = gl.RG
                this._glInternalFormat = gl.RG8
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_RGB565:
                this._glFormat = gl.RGB
                this._glInternalFormat = gl.RGB565
                this._glPixelType = gl.UNSIGNED_SHORT_5_6_5
                break
            case PIXELFORMAT_RGBA5551:
                this._glFormat = gl.RGBA
                this._glInternalFormat = gl.RGB5_A1
                this._glPixelType = gl.UNSIGNED_SHORT_5_5_5_1
                break
            case PIXELFORMAT_RGBA4:
                this._glFormat = gl.RGBA
                this._glInternalFormat = gl.RGBA4
                this._glPixelType = gl.UNSIGNED_SHORT_4_4_4_4
                break
            case PIXELFORMAT_RGB8:
                this._glFormat = gl.RGB
                this._glInternalFormat = gl.RGB8
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_RGBA8:
                this._glFormat = gl.RGBA
                this._glInternalFormat = gl.RGBA8
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_BGRA8:
            case PIXELFORMAT_SBGRA8:
                break
            case PIXELFORMAT_RG32F:
                break
            case PIXELFORMAT_RGB9E5:
                this._glFormat = gl.RGB
                this._glInternalFormat = gl.RGB9_E5
                this._glPixelType = gl.UNSIGNED_INT_5_9_9_9_REV
                break
            case PIXELFORMAT_RG8S:
                this._glFormat = gl.RG
                this._glInternalFormat = gl.RG8_SNORM
                this._glPixelType = gl.BYTE
                break
            case PIXELFORMAT_RGBA8S:
                this._glFormat = gl.RGBA
                this._glInternalFormat = gl.RGBA8_SNORM
                this._glPixelType = gl.BYTE
                break
            case PIXELFORMAT_RGB10A2:
                this._glFormat = gl.RGBA
                this._glInternalFormat = gl.RGB10_A2
                this._glPixelType = gl.UNSIGNED_INT_2_10_10_10_REV
                break
            case PIXELFORMAT_RGB10A2U:
                this._glFormat = gl.RGBA_INTEGER
                this._glInternalFormat = gl.RGB10_A2UI
                this._glPixelType = gl.UNSIGNED_INT_2_10_10_10_REV
                break
            case PIXELFORMAT_DXT1:
                this._glFormat = gl.RGB
                this._glInternalFormat = device.extCompressedTextureS3TC.COMPRESSED_RGB_S3TC_DXT1_EXT
                break
            case PIXELFORMAT_DXT3:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extCompressedTextureS3TC.COMPRESSED_RGBA_S3TC_DXT3_EXT
                break
            case PIXELFORMAT_DXT5:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extCompressedTextureS3TC.COMPRESSED_RGBA_S3TC_DXT5_EXT
                break
            case PIXELFORMAT_ETC1:
                this._glFormat = gl.RGB
                this._glInternalFormat = device.extCompressedTextureETC1.COMPRESSED_RGB_ETC1_WEBGL
                break
            case PIXELFORMAT_PVRTC_2BPP_RGB_1:
                this._glFormat = gl.RGB
                this._glInternalFormat = device.extCompressedTexturePVRTC.COMPRESSED_RGB_PVRTC_2BPPV1_IMG
                break
            case PIXELFORMAT_PVRTC_2BPP_RGBA_1:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extCompressedTexturePVRTC.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG
                break
            case PIXELFORMAT_PVRTC_4BPP_RGB_1:
                this._glFormat = gl.RGB
                this._glInternalFormat = device.extCompressedTexturePVRTC.COMPRESSED_RGB_PVRTC_4BPPV1_IMG
                break
            case PIXELFORMAT_PVRTC_4BPP_RGBA_1:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extCompressedTexturePVRTC.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG
                break
            case PIXELFORMAT_ETC2_RGB:
                this._glFormat = gl.RGB
                this._glInternalFormat = device.extCompressedTextureETC.COMPRESSED_RGB8_ETC2
                break
            case PIXELFORMAT_ETC2_RGBA:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extCompressedTextureETC.COMPRESSED_RGBA8_ETC2_EAC
                break
            case PIXELFORMAT_ASTC_4x4:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extCompressedTextureASTC.COMPRESSED_RGBA_ASTC_4x4_KHR
                break
            case PIXELFORMAT_ATC_RGB:
                this._glFormat = gl.RGB
                this._glInternalFormat = device.extCompressedTextureATC.COMPRESSED_RGB_ATC_WEBGL
                break
            case PIXELFORMAT_ATC_RGBA:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extCompressedTextureATC.COMPRESSED_RGBA_ATC_INTERPOLATED_ALPHA_WEBGL
                break
            case PIXELFORMAT_BC6F:
                this._glFormat = gl.RGB
                this._glInternalFormat = device.extTextureCompressionBPTC.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT
                break
            case PIXELFORMAT_BC6UF:
                this._glFormat = gl.RGB
                this._glInternalFormat = device.extTextureCompressionBPTC.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT
                break
            case PIXELFORMAT_BC7:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extTextureCompressionBPTC.COMPRESSED_RGBA_BPTC_UNORM_EXT
                break
            case PIXELFORMAT_DXT1_SRGB:
                this._glFormat = gl.SRGB
                this._glInternalFormat = device.extCompressedTextureS3TC_SRGB.COMPRESSED_SRGB_S3TC_DXT1_EXT
                break
            case PIXELFORMAT_DXT3_SRGBA:
                this._glFormat = gl.SRGB_ALPHA
                this._glInternalFormat = device.extCompressedTextureS3TC_SRGB.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT
                break
            case PIXELFORMAT_DXT5_SRGBA:
                this._glFormat = gl.SRGB_ALPHA
                this._glInternalFormat = device.extCompressedTextureS3TC_SRGB.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT
                break
            case PIXELFORMAT_ETC2_SRGB:
                this._glFormat = gl.SRGB
                this._glInternalFormat = device.extCompressedTextureETC.COMPRESSED_SRGB8_ETC2
                break
            case PIXELFORMAT_ETC2_SRGBA:
                this._glFormat = gl.SRGB_ALPHA
                this._glInternalFormat = device.extCompressedTextureETC.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC
                break
            case PIXELFORMAT_ASTC_4x4_SRGB:
                this._glFormat = gl.SRGB_ALPHA
                this._glInternalFormat = device.extCompressedTextureASTC.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR
                break
            case PIXELFORMAT_BC7_SRGBA:
                this._glFormat = gl.RGBA
                this._glInternalFormat = device.extTextureCompressionBPTC.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT
                break
            case PIXELFORMAT_R16F:
                this._glFormat = gl.RED
                this._glInternalFormat = gl.R16F
                this._glPixelType = gl.HALF_FLOAT
                break
            case PIXELFORMAT_RG16F:
                this._glFormat = gl.RG
                this._glInternalFormat = gl.RG16F
                this._glPixelType = gl.HALF_FLOAT
                break
            case PIXELFORMAT_RGB16F:
                this._glFormat = gl.RGB
                this._glInternalFormat = gl.RGB16F
                this._glPixelType = gl.HALF_FLOAT
                break
            case PIXELFORMAT_RGBA16F:
                this._glFormat = gl.RGBA
                this._glInternalFormat = gl.RGBA16F
                this._glPixelType = gl.HALF_FLOAT
                break
            case PIXELFORMAT_RGB32F:
                this._glFormat = gl.RGB
                this._glInternalFormat = gl.RGB32F
                this._glPixelType = gl.FLOAT
                break
            case PIXELFORMAT_RGBA32F:
                this._glFormat = gl.RGBA
                this._glInternalFormat = gl.RGBA32F
                this._glPixelType = gl.FLOAT
                break
            case PIXELFORMAT_R32F:
                this._glFormat = gl.RED
                this._glInternalFormat = gl.R32F
                this._glPixelType = gl.FLOAT
                break
            case PIXELFORMAT_DEPTH:
                this._glFormat = gl.DEPTH_COMPONENT
                this._glInternalFormat = gl.DEPTH_COMPONENT32F
                this._glPixelType = gl.FLOAT
                break
            case PIXELFORMAT_DEPTH16:
                this._glFormat = gl.DEPTH_COMPONENT
                this._glInternalFormat = gl.DEPTH_COMPONENT16
                this._glPixelType = gl.UNSIGNED_SHORT
                break
            case PIXELFORMAT_DEPTHSTENCIL:
                this._glFormat = gl.DEPTH_STENCIL
                this._glInternalFormat = gl.DEPTH24_STENCIL8
                this._glPixelType = gl.UNSIGNED_INT_24_8
                break
            case PIXELFORMAT_111110F:
                this._glFormat = gl.RGB
                this._glInternalFormat = gl.R11F_G11F_B10F
                this._glPixelType = gl.UNSIGNED_INT_10F_11F_11F_REV
                break
            case PIXELFORMAT_SRGB8:
                this._glFormat = gl.RGB
                this._glInternalFormat = gl.SRGB8
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_SRGBA8:
                this._glFormat = gl.RGBA
                this._glInternalFormat = gl.SRGB8_ALPHA8
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_R8I:
                this._glFormat = gl.RED_INTEGER
                this._glInternalFormat = gl.R8I
                this._glPixelType = gl.BYTE
                break
            case PIXELFORMAT_R8U:
                this._glFormat = gl.RED_INTEGER
                this._glInternalFormat = gl.R8UI
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_R16I:
                this._glFormat = gl.RED_INTEGER
                this._glInternalFormat = gl.R16I
                this._glPixelType = gl.SHORT
                break
            case PIXELFORMAT_R16U:
                this._glFormat = gl.RED_INTEGER
                this._glInternalFormat = gl.R16UI
                this._glPixelType = gl.UNSIGNED_SHORT
                break
            case PIXELFORMAT_R32I:
                this._glFormat = gl.RED_INTEGER
                this._glInternalFormat = gl.R32I
                this._glPixelType = gl.INT
                break
            case PIXELFORMAT_R32U:
                this._glFormat = gl.RED_INTEGER
                this._glInternalFormat = gl.R32UI
                this._glPixelType = gl.UNSIGNED_INT
                break
            case PIXELFORMAT_RG8I:
                this._glFormat = gl.RG_INTEGER
                this._glInternalFormat = gl.RG8I
                this._glPixelType = gl.BYTE
                break
            case PIXELFORMAT_RG8U:
                this._glFormat = gl.RG_INTEGER
                this._glInternalFormat = gl.RG8UI
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_RG16I:
                this._glFormat = gl.RG_INTEGER
                this._glInternalFormat = gl.RG16I
                this._glPixelType = gl.SHORT
                break
            case PIXELFORMAT_RG16U:
                this._glFormat = gl.RG_INTEGER
                this._glInternalFormat = gl.RG16UI
                this._glPixelType = gl.UNSIGNED_SHORT
                break
            case PIXELFORMAT_RG32I:
                this._glFormat = gl.RG_INTEGER
                this._glInternalFormat = gl.RG32I
                this._glPixelType = gl.INT
                break
            case PIXELFORMAT_RG32U:
                this._glFormat = gl.RG_INTEGER
                this._glInternalFormat = gl.RG32UI
                this._glPixelType = gl.UNSIGNED_INT
                break
            case PIXELFORMAT_RGBA8I:
                this._glFormat = gl.RGBA_INTEGER
                this._glInternalFormat = gl.RGBA8I
                this._glPixelType = gl.BYTE
                break
            case PIXELFORMAT_RGBA8U:
                this._glFormat = gl.RGBA_INTEGER
                this._glInternalFormat = gl.RGBA8UI
                this._glPixelType = gl.UNSIGNED_BYTE
                break
            case PIXELFORMAT_RGBA16I:
                this._glFormat = gl.RGBA_INTEGER
                this._glInternalFormat = gl.RGBA16I
                this._glPixelType = gl.SHORT
                break
            case PIXELFORMAT_RGBA16U:
                this._glFormat = gl.RGBA_INTEGER
                this._glInternalFormat = gl.RGBA16UI
                this._glPixelType = gl.UNSIGNED_SHORT
                break
            case PIXELFORMAT_RGBA32I:
                this._glFormat = gl.RGBA_INTEGER
                this._glInternalFormat = gl.RGBA32I
                this._glPixelType = gl.INT
                break
            case PIXELFORMAT_RGBA32U:
                this._glFormat = gl.RGBA_INTEGER
                this._glInternalFormat = gl.RGBA32UI
                this._glPixelType = gl.UNSIGNED_INT
                break
        }
        this._glCreated = false
    }
    upload(device, texture) {
        const gl = device.gl
        if (!texture._needsUpload && ((texture._needsMipmapsUpload && texture._mipmapsUploaded) || !texture.pot)) {
            return
        }
        let mipLevel = 0
        let mipObject
        let resMult
        const requiredMipLevels = texture.numLevels
        if (texture.array && !this._glCreated) {
            gl.texStorage3D(
                gl.TEXTURE_2D_ARRAY,
                requiredMipLevels,
                this._glInternalFormat,
                texture._width,
                texture._height,
                texture._arrayLength,
            )
        }
        while (texture._levels[mipLevel] || mipLevel === 0) {
            if (!texture._needsUpload && mipLevel === 0) {
                mipLevel++
                continue
            } else if (mipLevel && (!texture._needsMipmapsUpload || !texture._mipmaps)) {
                break
            }
            mipObject = texture._levels[mipLevel]
            resMult = 1 / Math.pow(2, mipLevel)
            if (
                mipLevel === 1 &&
                !texture._compressed &&
                !texture._integerFormat &&
                texture._levels.length < requiredMipLevels
            ) {
                gl.generateMipmap(this._glTarget)
                texture._mipmapsUploaded = true
            }
            if (texture._cubemap) {
                let face
                if (device._isBrowserInterface(mipObject[0])) {
                    for (face = 0; face < 6; face++) {
                        if (!texture._levelsUpdated[0][face]) {
                            continue
                        }
                        let src = mipObject[face]
                        if (device._isImageBrowserInterface(src)) {
                            if (src.width > device.maxCubeMapSize || src.height > device.maxCubeMapSize) {
                                src = downsampleImage(src, device.maxCubeMapSize)
                                if (mipLevel === 0) {
                                    texture._width = src.width
                                    texture._height = src.height
                                }
                            }
                        }
                        device.setUnpackFlipY(false)
                        device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha)
                        if (this._glCreated) {
                            gl.texSubImage2D(
                                gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                                mipLevel,
                                0,
                                0,
                                this._glFormat,
                                this._glPixelType,
                                src,
                            )
                        } else {
                            gl.texImage2D(
                                gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                                mipLevel,
                                this._glInternalFormat,
                                this._glFormat,
                                this._glPixelType,
                                src,
                            )
                        }
                    }
                } else {
                    resMult = 1 / Math.pow(2, mipLevel)
                    for (face = 0; face < 6; face++) {
                        if (!texture._levelsUpdated[0][face]) {
                            continue
                        }
                        const texData = mipObject[face]
                        if (texture._compressed) {
                            if (this._glCreated && texData) {
                                gl.compressedTexSubImage2D(
                                    gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                                    mipLevel,
                                    0,
                                    0,
                                    Math.max(texture._width * resMult, 1),
                                    Math.max(texture._height * resMult, 1),
                                    this._glInternalFormat,
                                    texData,
                                )
                            } else {
                                gl.compressedTexImage2D(
                                    gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                                    mipLevel,
                                    this._glInternalFormat,
                                    Math.max(texture._width * resMult, 1),
                                    Math.max(texture._height * resMult, 1),
                                    0,
                                    texData,
                                )
                            }
                        } else {
                            device.setUnpackFlipY(false)
                            device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha)
                            device.setUnpackAlignment(1)
                            if (this._glCreated && texData) {
                                gl.texSubImage2D(
                                    gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                                    mipLevel,
                                    0,
                                    0,
                                    Math.max(texture._width * resMult, 1),
                                    Math.max(texture._height * resMult, 1),
                                    this._glFormat,
                                    this._glPixelType,
                                    texData,
                                )
                            } else {
                                gl.texImage2D(
                                    gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
                                    mipLevel,
                                    this._glInternalFormat,
                                    Math.max(texture._width * resMult, 1),
                                    Math.max(texture._height * resMult, 1),
                                    0,
                                    this._glFormat,
                                    this._glPixelType,
                                    texData,
                                )
                            }
                        }
                    }
                }
            } else if (texture._volume) {
                if (texture._compressed) {
                    gl.compressedTexImage3D(
                        gl.TEXTURE_3D,
                        mipLevel,
                        this._glInternalFormat,
                        Math.max(texture._width * resMult, 1),
                        Math.max(texture._height * resMult, 1),
                        Math.max(texture._depth * resMult, 1),
                        0,
                        mipObject,
                    )
                } else {
                    device.setUnpackFlipY(false)
                    device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha)
                    device.setUnpackAlignment(1)
                    gl.texImage3D(
                        gl.TEXTURE_3D,
                        mipLevel,
                        this._glInternalFormat,
                        Math.max(texture._width * resMult, 1),
                        Math.max(texture._height * resMult, 1),
                        Math.max(texture._depth * resMult, 1),
                        0,
                        this._glFormat,
                        this._glPixelType,
                        mipObject,
                    )
                }
            } else if (texture.array) {
                if (Array.isArray(mipObject) && texture._arrayLength === mipObject.length) {
                    if (texture._compressed) {
                        for (let index = 0; index < texture._arrayLength; index++) {
                            gl.compressedTexSubImage3D(
                                gl.TEXTURE_2D_ARRAY,
                                mipLevel,
                                0,
                                0,
                                index,
                                Math.max(Math.floor(texture._width * resMult), 1),
                                Math.max(Math.floor(texture._height * resMult), 1),
                                1,
                                this._glInternalFormat,
                                mipObject[index],
                            )
                        }
                    } else {
                        device.setUnpackAlignment(1)
                        for (let index = 0; index < texture._arrayLength; index++) {
                            gl.texSubImage3D(
                                gl.TEXTURE_2D_ARRAY,
                                mipLevel,
                                0,
                                0,
                                index,
                                Math.max(Math.floor(texture._width * resMult), 1),
                                Math.max(Math.floor(texture._height * resMult), 1),
                                1,
                                this._glFormat,
                                this._glPixelType,
                                mipObject[index],
                            )
                        }
                    }
                }
            } else {
                if (device._isBrowserInterface(mipObject)) {
                    if (device._isImageBrowserInterface(mipObject)) {
                        if (mipObject.width > device.maxTextureSize || mipObject.height > device.maxTextureSize) {
                            mipObject = downsampleImage(mipObject, device.maxTextureSize)
                            if (mipLevel === 0) {
                                texture._width = mipObject.width
                                texture._height = mipObject.height
                            }
                        }
                    }
                    const w = mipObject.width || mipObject.videoWidth
                    const h = mipObject.height || mipObject.videoHeight
                    device.setUnpackFlipY(texture._flipY)
                    device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha)
                    if (
                        this._glCreated &&
                        texture._width === w &&
                        texture._height === h &&
                        !device._isImageVideoInterface(mipObject)
                    ) {
                        gl.texSubImage2D(gl.TEXTURE_2D, mipLevel, 0, 0, this._glFormat, this._glPixelType, mipObject)
                    } else {
                        gl.texImage2D(
                            gl.TEXTURE_2D,
                            mipLevel,
                            this._glInternalFormat,
                            this._glFormat,
                            this._glPixelType,
                            mipObject,
                        )
                        if (mipLevel === 0) {
                            texture._width = w
                            texture._height = h
                        }
                    }
                } else {
                    resMult = 1 / Math.pow(2, mipLevel)
                    if (texture._compressed) {
                        if (this._glCreated && mipObject) {
                            gl.compressedTexSubImage2D(
                                gl.TEXTURE_2D,
                                mipLevel,
                                0,
                                0,
                                Math.max(Math.floor(texture._width * resMult), 1),
                                Math.max(Math.floor(texture._height * resMult), 1),
                                this._glInternalFormat,
                                mipObject,
                            )
                        } else {
                            gl.compressedTexImage2D(
                                gl.TEXTURE_2D,
                                mipLevel,
                                this._glInternalFormat,
                                Math.max(Math.floor(texture._width * resMult), 1),
                                Math.max(Math.floor(texture._height * resMult), 1),
                                0,
                                mipObject,
                            )
                        }
                    } else {
                        device.setUnpackFlipY(false)
                        device.setUnpackPremultiplyAlpha(texture._premultiplyAlpha)
                        device.setUnpackAlignment(1)
                        if (this._glCreated && mipObject) {
                            gl.texSubImage2D(
                                gl.TEXTURE_2D,
                                mipLevel,
                                0,
                                0,
                                Math.max(texture._width * resMult, 1),
                                Math.max(texture._height * resMult, 1),
                                this._glFormat,
                                this._glPixelType,
                                mipObject,
                            )
                        } else {
                            gl.texImage2D(
                                gl.TEXTURE_2D,
                                mipLevel,
                                this._glInternalFormat,
                                Math.max(texture._width * resMult, 1),
                                Math.max(texture._height * resMult, 1),
                                0,
                                this._glFormat,
                                this._glPixelType,
                                mipObject,
                            )
                        }
                    }
                }
                if (mipLevel === 0) {
                    texture._mipmapsUploaded = false
                } else {
                    texture._mipmapsUploaded = true
                }
            }
            mipLevel++
        }
        if (texture._needsUpload) {
            if (texture._cubemap) {
                for (let i = 0; i < 6; i++) {
                    texture._levelsUpdated[0][i] = false
                }
            } else {
                texture._levelsUpdated[0] = false
            }
        }
        if (
            !texture._compressed &&
            !texture._integerFormat &&
            texture._mipmaps &&
            texture._needsMipmapsUpload &&
            texture._levels.length === 1
        ) {
            gl.generateMipmap(this._glTarget)
            texture._mipmapsUploaded = true
        }
        if (texture._gpuSize) {
            texture.adjustVramSizeTracking(device._vram, -texture._gpuSize)
        }
        texture._gpuSize = texture.gpuSize
        texture.adjustVramSizeTracking(device._vram, texture._gpuSize)
        this._glCreated = true
    }
    uploadImmediate(device, texture) {
        if (texture._needsUpload || texture._needsMipmapsUpload) {
            device.setTexture(texture, 0)
            texture._needsUpload = false
            texture._needsMipmapsUpload = false
        }
    }
    read(x, y, width, height, options) {
        const texture = this.texture
        const device = texture.device
        return device.readTextureAsync(texture, x, y, width, height, options)
    }
    write(x, y, width, height, data) {
        const { texture } = this
        const { device } = texture
        device.setTexture(texture, 0)
        return device.writeTextureAsync(texture, x, y, width, height, data)
    }
    constructor(texture) {
        this._glTexture = null
        this.dirtyParameterFlags = 0
        this.texture = texture
    }
}

const _validatedFboConfigs = new DeviceCache()
class FramebufferPair {
    destroy(gl) {
        if (this.msaaFB) {
            gl.deleteRenderbuffer(this.msaaFB)
            this.msaaFB = null
        }
        if (this.resolveFB) {
            gl.deleteRenderbuffer(this.resolveFB)
            this.resolveFB = null
        }
    }
    constructor(msaaFB, resolveFB) {
        this.msaaFB = msaaFB
        this.resolveFB = resolveFB
    }
}
class WebglRenderTarget {
    destroy(device) {
        const gl = device.gl
        this._isInitialized = false
        if (this._glFrameBuffer) {
            if (this._glFrameBuffer !== this.suppliedColorFramebuffer) {
                gl.deleteFramebuffer(this._glFrameBuffer)
            }
            this._glFrameBuffer = null
        }
        if (this._glDepthBuffer) {
            gl.deleteRenderbuffer(this._glDepthBuffer)
            this._glDepthBuffer = null
        }
        if (this._glResolveFrameBuffer) {
            if (this._glResolveFrameBuffer !== this.suppliedColorFramebuffer) {
                gl.deleteFramebuffer(this._glResolveFrameBuffer)
            }
            this._glResolveFrameBuffer = null
        }
        this._glMsaaColorBuffers.forEach((buffer) => {
            gl.deleteRenderbuffer(buffer)
        })
        this._glMsaaColorBuffers.length = 0
        this.colorMrtFramebuffers?.forEach((framebuffer) => {
            framebuffer.destroy(gl)
        })
        this.colorMrtFramebuffers = null
        if (this._glMsaaDepthBuffer) {
            this._glMsaaDepthBuffer = null
            if (this.msaaDepthBufferKey) {
                getMultisampledTextureCache(device).release(this.msaaDepthBufferKey)
            }
        }
        this.suppliedColorFramebuffer = undefined
    }
    get initialized() {
        return this._isInitialized
    }
    init(device, target) {
        const gl = device.gl
        this._isInitialized = true
        const buffers = []
        if (this.suppliedColorFramebuffer !== undefined) {
            this._glFrameBuffer = this.suppliedColorFramebuffer
        } else {
            this._glFrameBuffer = gl.createFramebuffer()
            device.setFramebuffer(this._glFrameBuffer)
            const colorBufferCount = target._colorBuffers?.length ?? 0
            const attachmentBaseConstant = gl.COLOR_ATTACHMENT0
            for (let i = 0; i < colorBufferCount; ++i) {
                const colorBuffer = target.getColorBuffer(i)
                if (colorBuffer) {
                    if (!colorBuffer.impl._glTexture) {
                        colorBuffer._width = Math.min(colorBuffer.width, device.maxRenderBufferSize)
                        colorBuffer._height = Math.min(colorBuffer.height, device.maxRenderBufferSize)
                        device.setTexture(colorBuffer, 0)
                    }
                    gl.framebufferTexture2D(
                        gl.FRAMEBUFFER,
                        attachmentBaseConstant + i,
                        colorBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D,
                        colorBuffer.impl._glTexture,
                        target.mipLevel,
                    )
                    buffers.push(attachmentBaseConstant + i)
                }
            }
            gl.drawBuffers(buffers)
            const depthBuffer = target._depthBuffer
            if (depthBuffer || target._depth) {
                const attachmentPoint = target._stencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT
                if (depthBuffer) {
                    if (!depthBuffer.impl._glTexture) {
                        depthBuffer._width = Math.min(depthBuffer.width, device.maxRenderBufferSize)
                        depthBuffer._height = Math.min(depthBuffer.height, device.maxRenderBufferSize)
                        device.setTexture(depthBuffer, 0)
                    }
                    gl.framebufferTexture2D(
                        gl.FRAMEBUFFER,
                        attachmentPoint,
                        depthBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D,
                        target._depthBuffer.impl._glTexture,
                        target.mipLevel,
                    )
                } else {
                    const willRenderMsaa = target._samples > 1
                    if (!willRenderMsaa) {
                        if (!this._glDepthBuffer) {
                            this._glDepthBuffer = gl.createRenderbuffer()
                        }
                        const internalFormat = target._stencil ? gl.DEPTH24_STENCIL8 : gl.DEPTH_COMPONENT32F
                        gl.bindRenderbuffer(gl.RENDERBUFFER, this._glDepthBuffer)
                        gl.renderbufferStorage(gl.RENDERBUFFER, internalFormat, target.width, target.height)
                        gl.framebufferRenderbuffer(
                            gl.FRAMEBUFFER,
                            attachmentPoint,
                            gl.RENDERBUFFER,
                            this._glDepthBuffer,
                        )
                        gl.bindRenderbuffer(gl.RENDERBUFFER, null)
                    }
                }
            }
        }
        if (target._samples > 1) {
            this._glResolveFrameBuffer = this._glFrameBuffer
            this._glFrameBuffer = gl.createFramebuffer()
            device.setFramebuffer(this._glFrameBuffer)
            const colorBufferCount = target._colorBuffers?.length ?? 0
            if (this.suppliedColorFramebuffer !== undefined) {
                const buffer = gl.createRenderbuffer()
                this._glMsaaColorBuffers.push(buffer)
                const internalFormat = device.backBufferFormat === PIXELFORMAT_RGBA8 ? gl.RGBA8 : gl.RGB8
                gl.bindRenderbuffer(gl.RENDERBUFFER, buffer)
                gl.renderbufferStorageMultisample(
                    gl.RENDERBUFFER,
                    target._samples,
                    internalFormat,
                    target.width,
                    target.height,
                )
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, buffer)
            } else {
                for (let i = 0; i < colorBufferCount; ++i) {
                    const colorBuffer = target.getColorBuffer(i)
                    if (colorBuffer) {
                        const buffer = gl.createRenderbuffer()
                        this._glMsaaColorBuffers.push(buffer)
                        gl.bindRenderbuffer(gl.RENDERBUFFER, buffer)
                        gl.renderbufferStorageMultisample(
                            gl.RENDERBUFFER,
                            target._samples,
                            colorBuffer.impl._glInternalFormat,
                            target.width,
                            target.height,
                        )
                        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, buffer)
                    }
                }
            }
            if (target._depth) {
                const internalFormat = target._stencil ? gl.DEPTH24_STENCIL8 : gl.DEPTH_COMPONENT32F
                const attachmentPoint = target._stencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT
                let key
                const depthBuffer = target._depthBuffer
                if (depthBuffer) {
                    key = `${depthBuffer.id}:${target.width}:${target.height}:${target._samples}:${internalFormat}:${attachmentPoint}`
                    this._glMsaaDepthBuffer = getMultisampledTextureCache(device).get(key)
                }
                if (!this._glMsaaDepthBuffer) {
                    this._glMsaaDepthBuffer = gl.createRenderbuffer()
                    gl.bindRenderbuffer(gl.RENDERBUFFER, this._glMsaaDepthBuffer)
                    gl.renderbufferStorageMultisample(
                        gl.RENDERBUFFER,
                        target._samples,
                        internalFormat,
                        target.width,
                        target.height,
                    )
                    this._glMsaaDepthBuffer.destroy = function () {
                        gl.deleteRenderbuffer(this)
                    }
                    if (depthBuffer) {
                        getMultisampledTextureCache(device).set(key, this._glMsaaDepthBuffer)
                    }
                }
                this.msaaDepthBufferKey = key
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, attachmentPoint, gl.RENDERBUFFER, this._glMsaaDepthBuffer)
            }
            if (colorBufferCount > 1) {
                this._createMsaaMrtFramebuffers(device, target, colorBufferCount)
                device.setFramebuffer(this._glFrameBuffer)
                gl.drawBuffers(buffers)
            }
        }
    }
    _createMsaaMrtFramebuffers(device, target, colorBufferCount) {
        const gl = device.gl
        this.colorMrtFramebuffers = []
        for (let i = 0; i < colorBufferCount; ++i) {
            const colorBuffer = target.getColorBuffer(i)
            const srcFramebuffer = gl.createFramebuffer()
            device.setFramebuffer(srcFramebuffer)
            const buffer = this._glMsaaColorBuffers[i]
            gl.bindRenderbuffer(gl.RENDERBUFFER, buffer)
            gl.renderbufferStorageMultisample(
                gl.RENDERBUFFER,
                target._samples,
                colorBuffer.impl._glInternalFormat,
                target.width,
                target.height,
            )
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, buffer)
            gl.drawBuffers([gl.COLOR_ATTACHMENT0])
            const dstFramebuffer = gl.createFramebuffer()
            device.setFramebuffer(dstFramebuffer)
            gl.framebufferTexture2D(
                gl.FRAMEBUFFER,
                gl.COLOR_ATTACHMENT0,
                colorBuffer._cubemap ? gl.TEXTURE_CUBE_MAP_POSITIVE_X + target._face : gl.TEXTURE_2D,
                colorBuffer.impl._glTexture,
                0,
            )
            this.colorMrtFramebuffers[i] = new FramebufferPair(srcFramebuffer, dstFramebuffer)
        }
    }
    _checkFbo(device, target, type = '') {
        const colorFormats = target._colorBuffers?.map((b) => b?.format ?? -1).join(',') ?? ''
        const depthInfo = target._depth
            ? target._depthBuffer
                ? `dt${target._depthBuffer.format}`
                : target._stencil
                  ? 'ds'
                  : 'd'
            : ''
        const key = `${type}:${colorFormats}:${depthInfo}:${target._samples}`
        const validated = _validatedFboConfigs.get(device, () => {
            const set = new Set()
            set.loseContext = () => set.clear()
            return set
        })
        if (validated.has(key)) {
            return
        }
        const gl = device.gl
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
        switch (status) {
            case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
                break
            case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
                break
            case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
                break
            case gl.FRAMEBUFFER_UNSUPPORTED:
                break
        }
        if (status === gl.FRAMEBUFFER_COMPLETE) {
            validated.add(key)
        }
    }
    loseContext() {
        this._glFrameBuffer = null
        this._glDepthBuffer = null
        this._glResolveFrameBuffer = null
        this._glMsaaColorBuffers.length = 0
        this._glMsaaDepthBuffer = null
        this.msaaDepthBufferKey = undefined
        this.colorMrtFramebuffers = null
        this.suppliedColorFramebuffer = undefined
        this._isInitialized = false
    }
    internalResolve(device, src, dst, target, mask) {
        device.setScissor(0, 0, target.width, target.height)
        const gl = device.gl
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst)
        gl.blitFramebuffer(0, 0, target.width, target.height, 0, 0, target.width, target.height, mask, gl.NEAREST)
    }
    resolve(device, target, color, depth) {
        const gl = device.gl
        if (this.colorMrtFramebuffers) {
            if (color) {
                for (let i = 0; i < this.colorMrtFramebuffers.length; i++) {
                    const fbPair = this.colorMrtFramebuffers[i]
                    this.internalResolve(device, fbPair.msaaFB, fbPair.resolveFB, target, gl.COLOR_BUFFER_BIT)
                }
            }
            if (depth) {
                this.internalResolve(
                    device,
                    this._glFrameBuffer,
                    this._glResolveFrameBuffer,
                    target,
                    gl.DEPTH_BUFFER_BIT,
                )
            }
        } else {
            this.internalResolve(
                device,
                this._glFrameBuffer,
                this._glResolveFrameBuffer,
                target,
                (color ? gl.COLOR_BUFFER_BIT : 0) | (depth ? gl.DEPTH_BUFFER_BIT : 0),
            )
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._glFrameBuffer)
    }
    constructor() {
        this._glFrameBuffer = null
        this._glDepthBuffer = null
        this._glResolveFrameBuffer = null
        this.colorMrtFramebuffers = null
        this._glMsaaColorBuffers = []
        this._glMsaaDepthBuffer = null
        this._isInitialized = false
    }
}

class WebglUploadStream {
    destroy() {
        const gl = this.uploadStream.device.gl
        this.availablePBOs.forEach((info) => gl.deleteBuffer(info.pbo))
        this.pendingPBOs.forEach((item) => {
            if (item.sync) gl.deleteSync(item.sync)
            gl.deleteBuffer(item.pbo)
        })
    }
    _onDeviceLost() {
        this.availablePBOs.length = 0
        this.pendingPBOs.length = 0
    }
    update(minByteSize) {
        const gl = this.uploadStream.device.gl
        const pending = this.pendingPBOs
        for (let i = pending.length - 1; i >= 0; i--) {
            const item = pending[i]
            const result = gl.clientWaitSync(item.sync, 0, 0)
            if (result === gl.CONDITION_SATISFIED || result === gl.ALREADY_SIGNALED) {
                gl.deleteSync(item.sync)
                this.availablePBOs.push({
                    pbo: item.pbo,
                    size: item.size,
                })
                pending.splice(i, 1)
            }
        }
        const available = this.availablePBOs
        for (let i = available.length - 1; i >= 0; i--) {
            if (available[i].size < minByteSize) {
                gl.deleteBuffer(available[i].pbo)
                available.splice(i, 1)
            }
        }
    }
    upload(data, target, offset, size) {
        if (this.useSingleBuffer) {
            this.uploadDirect(data, target, offset, size)
        } else {
            this.uploadPBO(data, target, offset, size)
        }
    }
    uploadDirect(data, target, offset, size) {
        target._levels[0] = data
        target.upload()
    }
    uploadPBO(data, target, offset, size) {
        const device = this.uploadStream.device
        const gl = device.gl
        const width = target.width
        const byteSize = size * data.BYTES_PER_ELEMENT
        this.update(byteSize)
        const startY = offset / width
        const height = size / width
        const pboInfo =
            this.availablePBOs.pop() ??
            (() => {
                const pbo = gl.createBuffer()
                return {
                    pbo,
                    size: byteSize,
                }
            })()
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pboInfo.pbo)
        gl.bufferData(gl.PIXEL_UNPACK_BUFFER, byteSize, gl.STREAM_DRAW)
        gl.bufferSubData(gl.PIXEL_UNPACK_BUFFER, 0, new Uint8Array(data.buffer, data.byteOffset, byteSize))
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
        device.setTexture(target, 0)
        device.activeTexture(0)
        device.bindTexture(target)
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, pboInfo.pbo)
        device.setUnpackFlipY(false)
        device.setUnpackPremultiplyAlpha(false)
        device.setUnpackAlignment(data.BYTES_PER_ELEMENT)
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0)
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0)
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0)
        const impl = target.impl
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, startY, width, height, impl._glFormat, impl._glPixelType, 0)
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        this.pendingPBOs.push({
            pbo: pboInfo.pbo,
            size: byteSize,
            sync,
        })
        gl.flush()
    }
    constructor(uploadStream) {
        this.availablePBOs = []
        this.pendingPBOs = []
        this.uploadStream = uploadStream
        this.useSingleBuffer = uploadStream.useSingleBuffer
    }
}

class FrameQueriesInfo {
    destroy(gl) {
        this.queries.forEach((query) => gl.deleteQuery(query))
        this.queries = null
    }
    constructor() {
        this.queries = []
    }
}
class WebglGpuProfiler extends GpuProfiler {
    destroy() {
        this.freeQueries.forEach((query) => this.device.gl.deleteQuery(query))
        this.frameQueries.forEach((query) => this.device.gl.deleteQuery(query))
        this.previousFrameQueries.forEach((frameQueriesInfo) => frameQueriesInfo.destroy(this.device.gl))
        this.freeQueries = null
        this.frameQueries = null
        this.previousFrameQueries = null
    }
    loseContext() {
        super.loseContext()
        this.freeQueries = []
        this.frameQueries = []
        this.previousFrameQueries = []
    }
    restoreContext() {
        this.ext = this.device.extDisjointTimerQuery
    }
    getQuery() {
        return this.freeQueries.pop() ?? this.device.gl.createQuery()
    }
    start(name) {
        if (this.ext) {
            const slot = this.getSlot(name)
            const query = this.getQuery()
            this.frameQueries[slot] = query
            this.device.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
            return slot
        }
        return undefined
    }
    end(slot) {
        if (slot !== undefined) {
            this.device.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
        }
    }
    frameStart() {
        this.processEnableRequest()
        if (this._enabled) {
            this.frameGPUMarkerSlot = this.start('GpuFrame')
        }
    }
    frameEnd() {
        if (this._enabled) {
            this.end(this.frameGPUMarkerSlot)
        }
    }
    request() {
        if (this._enabled) {
            const ext = this.ext
            const gl = this.device.gl
            const renderVersion = this.device.renderVersion
            const frameQueries = this.frameQueries
            if (frameQueries.length > 0) {
                this.frameQueries = []
                const frameQueriesInfo = new FrameQueriesInfo()
                frameQueriesInfo.queries = frameQueries
                frameQueriesInfo.renderVersion = renderVersion
                this.previousFrameQueries.push(frameQueriesInfo)
            }
            if (this.previousFrameQueries.length > 0) {
                const previousQueriesInfo = this.previousFrameQueries[0]
                const previousQueries = previousQueriesInfo.queries
                const lastQuery = previousQueries[previousQueries.length - 1]
                const available = gl.getQueryParameter(lastQuery, gl.QUERY_RESULT_AVAILABLE)
                const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
                if (available && !disjoint) {
                    this.previousFrameQueries.shift()
                    const timings = this.timings
                    timings.length = 0
                    for (let i = 0; i < previousQueries.length; i++) {
                        const query = previousQueries[i]
                        const duration = gl.getQueryParameter(query, gl.QUERY_RESULT)
                        timings[i] = duration * 0.000001
                        this.freeQueries.push(query)
                    }
                    this.report(previousQueriesInfo.renderVersion, timings)
                }
                if (disjoint) {
                    this.previousFrameQueries.forEach((frameQueriesInfo) => {
                        this.report(frameQueriesInfo.renderVersion, null)
                        frameQueriesInfo.destroy(gl)
                    })
                    this.previousFrameQueries.length = 0
                }
            }
            super.request(renderVersion)
        }
    }
    constructor(device) {
        ;(super(),
            (this.freeQueries = []),
            (this.frameQueries = []),
            (this.previousFrameQueries = []),
            (this.timings = []))
        this.device = device
        this.ext = device.extDisjointTimerQuery
    }
}

const getPixelFormatChannelsForRgbaReadback = (format) => {
    switch (format) {
        case PIXELFORMAT_R8:
            return 1
        case PIXELFORMAT_RG8:
            return 2
        default:
            return 0
    }
}
const invalidateAttachments = []
class WebglGraphicsDevice extends GraphicsDevice {
    postInit() {
        super.postInit()
        this.gpuProfiler = new WebglGpuProfiler(this)
    }
    destroy() {
        super.destroy()
        const gl = this.gl
        if (this.feedback) {
            gl.deleteTransformFeedback(this.feedback)
        }
        this.clearVertexArrayObjectCache()
        this.canvas.removeEventListener('webglcontextlost', this._contextLostHandler, false)
        this.canvas.removeEventListener('webglcontextrestored', this._contextRestoredHandler, false)
        this._contextLostHandler = null
        this._contextRestoredHandler = null
        this.gl = null
        super.postDestroy()
    }
    createBackbuffer(frameBuffer) {
        this.supportsStencil = this.initOptions.stencil
        this.backBuffer = new RenderTarget({
            name: 'WebglFramebuffer',
            graphicsDevice: this,
            depth: this.initOptions.depth,
            stencil: this.supportsStencil,
            samples: this.samples,
        })
        this.backBuffer.impl.suppliedColorFramebuffer = frameBuffer
    }
    updateBackbufferFormat(framebuffer) {
        const gl = this.gl
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        const alphaBits = this.gl.getParameter(this.gl.ALPHA_BITS)
        this.backBufferFormat = alphaBits ? PIXELFORMAT_RGBA8 : PIXELFORMAT_RGB8
    }
    updateBackbuffer() {
        const resolutionChanged =
            this.canvas.width !== this.backBufferSize.x || this.canvas.height !== this.backBufferSize.y
        if (this._defaultFramebufferChanged || resolutionChanged) {
            if (this._defaultFramebufferChanged) {
                this.updateBackbufferFormat(this._defaultFramebuffer)
            }
            this._defaultFramebufferChanged = false
            this.backBufferSize.set(this.canvas.width, this.canvas.height)
            this.backBuffer.destroy()
            this.createBackbuffer(this._defaultFramebuffer)
        }
    }
    createVertexBufferImpl(vertexBuffer, format) {
        return new WebglVertexBuffer()
    }
    createIndexBufferImpl(indexBuffer) {
        return new WebglIndexBuffer(indexBuffer)
    }
    createShaderImpl(shader) {
        return new WebglShader(shader)
    }
    createDrawCommandImpl(drawCommands) {
        return new WebglDrawCommands(drawCommands.indexSizeBytes)
    }
    createTextureImpl(texture) {
        this.textures.add(texture)
        return new WebglTexture(texture)
    }
    createRenderTargetImpl(renderTarget) {
        return new WebglRenderTarget()
    }
    createUploadStreamImpl(uploadStream) {
        return new WebglUploadStream(uploadStream)
    }
    getPrecision() {
        const gl = this.gl
        let precision = 'highp'
        if (gl.getShaderPrecisionFormat) {
            const vertexShaderPrecisionHighpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT)
            const vertexShaderPrecisionMediumpFloat = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT)
            const fragmentShaderPrecisionHighpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
            const fragmentShaderPrecisionMediumpFloat = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT)
            if (
                vertexShaderPrecisionHighpFloat &&
                vertexShaderPrecisionMediumpFloat &&
                fragmentShaderPrecisionHighpFloat &&
                fragmentShaderPrecisionMediumpFloat
            ) {
                const highpAvailable =
                    vertexShaderPrecisionHighpFloat.precision > 0 && fragmentShaderPrecisionHighpFloat.precision > 0
                const mediumpAvailable =
                    vertexShaderPrecisionMediumpFloat.precision > 0 && fragmentShaderPrecisionMediumpFloat.precision > 0
                if (!highpAvailable) {
                    if (mediumpAvailable) {
                        precision = 'mediump'
                    } else {
                        precision = 'lowp'
                    }
                }
            }
        }
        return precision
    }
    getExtension() {
        for (let i = 0; i < arguments.length; i++) {
            if (this.supportedExtensions.indexOf(arguments[i]) !== -1) {
                return this.gl.getExtension(arguments[i])
            }
        }
        return null
    }
    get extDisjointTimerQuery() {
        if (!this._extDisjointTimerQuery) {
            this._extDisjointTimerQuery = this.getExtension(
                'EXT_disjoint_timer_query_webgl2',
                'EXT_disjoint_timer_query',
            )
        }
        return this._extDisjointTimerQuery
    }
    initializeExtensions() {
        const gl = this.gl
        this.supportedExtensions = gl.getSupportedExtensions() ?? []
        this._extDisjointTimerQuery = null
        this.textureRG11B10Renderable = true
        this.extColorBufferFloat = this.getExtension('EXT_color_buffer_float')
        this.textureFloatRenderable = !!this.extColorBufferFloat
        this.extColorBufferHalfFloat = this.getExtension('EXT_color_buffer_half_float')
        this.textureHalfFloatRenderable = !!this.extColorBufferHalfFloat || !!this.extColorBufferFloat
        this.extDebugRendererInfo = this.getExtension('WEBGL_debug_renderer_info')
        this.extTextureFloatLinear = this.getExtension('OES_texture_float_linear')
        this.textureFloatFilterable = !!this.extTextureFloatLinear
        this.extFloatBlend = this.getExtension('EXT_float_blend')
        this.extTextureFilterAnisotropic = this.getExtension(
            'EXT_texture_filter_anisotropic',
            'WEBKIT_EXT_texture_filter_anisotropic',
        )
        this.extParallelShaderCompile = this.getExtension('KHR_parallel_shader_compile')
        this.extMultiDraw = this.getExtension('WEBGL_multi_draw')
        this.supportsMultiDraw = !!this.extMultiDraw
        this.extCompressedTextureETC1 = this.getExtension('WEBGL_compressed_texture_etc1')
        this.extCompressedTextureETC = this.getExtension('WEBGL_compressed_texture_etc')
        this.extCompressedTexturePVRTC = this.getExtension(
            'WEBGL_compressed_texture_pvrtc',
            'WEBKIT_WEBGL_compressed_texture_pvrtc',
        )
        this.extCompressedTextureS3TC = this.getExtension(
            'WEBGL_compressed_texture_s3tc',
            'WEBKIT_WEBGL_compressed_texture_s3tc',
        )
        this.extCompressedTextureS3TC_SRGB = this.getExtension('WEBGL_compressed_texture_s3tc_srgb')
        this.extCompressedTextureATC = this.getExtension('WEBGL_compressed_texture_atc')
        this.extCompressedTextureASTC = this.getExtension('WEBGL_compressed_texture_astc')
        this.extTextureCompressionBPTC = this.getExtension('EXT_texture_compression_bptc')
    }
    initializeCapabilities() {
        const gl = this.gl
        let ext
        const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
        this.maxPrecision = this.precision = this.getPrecision()
        const contextAttribs = gl.getContextAttributes()
        this.supportsMsaa = contextAttribs?.antialias ?? false
        this.supportsStencil = contextAttribs?.stencil ?? false
        this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE)
        this.maxCubeMapSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE)
        this.maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
        this.maxTextures = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)
        this.maxCombinedTextures = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)
        this.maxVertexTextures = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)
        this.vertexUniformsCount = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)
        this.fragmentUniformsCount = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)
        this.maxColorAttachments = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS)
        this.maxVolumeSize = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)
        ext = this.extDebugRendererInfo
        this.unmaskedRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''
        this.unmaskedVendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : ''
        const maliRendererRegex = /\bMali-G52+/
        const samsungModelRegex = /SM-[a-zA-Z0-9]+/
        this.supportsGpuParticles =
            !(this.unmaskedVendor === 'ARM' && userAgent.match(samsungModelRegex)) &&
            !this.unmaskedRenderer.match(maliRendererRegex)
        ext = this.extTextureFilterAnisotropic
        this.maxAnisotropy = ext ? gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1
        const antialiasSupported = !this.forceDisableMultisampling
        this.maxSamples = antialiasSupported ? gl.getParameter(gl.MAX_SAMPLES) : 1
        this.maxSamples = Math.min(this.maxSamples, 4)
        this.samples = antialiasSupported && this.backBufferAntialias ? this.maxSamples : 1
        this.supportsAreaLights = !platform.android
        if (this.maxTextures <= 8) {
            this.supportsAreaLights = false
        }
        this.initCapsDefines()
    }
    initializeRenderState() {
        super.initializeRenderState()
        const gl = this.gl
        gl.disable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ZERO)
        gl.blendEquation(gl.FUNC_ADD)
        gl.colorMask(true, true, true, true)
        gl.blendColor(0, 0, 0, 0)
        gl.enable(gl.CULL_FACE)
        this.cullFace = gl.BACK
        gl.cullFace(gl.BACK)
        gl.enable(gl.DEPTH_TEST)
        gl.depthFunc(gl.LEQUAL)
        gl.depthMask(true)
        this.stencil = false
        gl.disable(gl.STENCIL_TEST)
        this.stencilFuncFront = this.stencilFuncBack = FUNC_ALWAYS
        this.stencilRefFront = this.stencilRefBack = 0
        this.stencilMaskFront = this.stencilMaskBack = 0xff
        gl.stencilFunc(gl.ALWAYS, 0, 0xff)
        this.stencilFailFront = this.stencilFailBack = STENCILOP_KEEP
        this.stencilZfailFront = this.stencilZfailBack = STENCILOP_KEEP
        this.stencilZpassFront = this.stencilZpassBack = STENCILOP_KEEP
        this.stencilWriteMaskFront = 0xff
        this.stencilWriteMaskBack = 0xff
        gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
        gl.stencilMask(0xff)
        this.alphaToCoverage = false
        this.raster = true
        gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE)
        gl.disable(gl.RASTERIZER_DISCARD)
        this.depthBiasEnabled = false
        gl.disable(gl.POLYGON_OFFSET_FILL)
        this.clearDepth = 1
        gl.clearDepth(1)
        this.clearColor = new Color(0, 0, 0, 0)
        gl.clearColor(0, 0, 0, 0)
        this.clearStencil = 0
        gl.clearStencil(0)
        gl.hint(gl.FRAGMENT_SHADER_DERIVATIVE_HINT, gl.NICEST)
        gl.enable(gl.SCISSOR_TEST)
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
        this.unpackFlipY = false
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        this.unpackPremultiplyAlpha = false
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
        this.unpackAlignment = 1
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    }
    initTextureUnits(count = 16) {
        this.textureUnits = []
        for (let i = 0; i < count; i++) {
            this.textureUnits.push([null, null, null])
        }
    }
    initializeContextCaches() {
        super.initializeContextCaches()
        this._vaoMap = new Map()
        this.boundVao = null
        this.activeFramebuffer = null
        this.feedback = null
        this.transformFeedbackBuffer = null
        this.textureUnit = 0
        this.initTextureUnits(this.maxCombinedTextures)
    }
    loseContext() {
        super.loseContext()
        for (const shader of this.shaders) {
            shader.loseContext()
        }
    }
    restoreContext() {
        this.initializeExtensions()
        this.initializeCapabilities()
        super.restoreContext()
        for (const shader of this.shaders) {
            shader.restoreContext()
        }
    }
    setViewport(x, y, w, h) {
        if (this.vx !== x || this.vy !== y || this.vw !== w || this.vh !== h) {
            this.gl.viewport(x, y, w, h)
            this.vx = x
            this.vy = y
            this.vw = w
            this.vh = h
        }
    }
    setScissor(x, y, w, h) {
        if (this.sx !== x || this.sy !== y || this.sw !== w || this.sh !== h) {
            this.gl.scissor(x, y, w, h)
            this.sx = x
            this.sy = y
            this.sw = w
            this.sh = h
        }
    }
    setFramebuffer(fb) {
        if (this.activeFramebuffer !== fb) {
            const gl = this.gl
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
            this.activeFramebuffer = fb
        }
    }
    copyRenderTarget(source, dest, color, depth) {
        const gl = this.gl
        if (source === this.backBuffer) {
            source = null
        }
        if (color) {
            if (!dest) {
                if (!source._colorBuffer) {
                    return false
                }
            } else if (source) {
                if (!source._colorBuffer || !dest._colorBuffer) {
                    return false
                }
                if (source._colorBuffer._format !== dest._colorBuffer._format) {
                    return false
                }
            }
        }
        if (depth && source) {
            if (!source._depth) {
                if (!source._depthBuffer || !dest._depthBuffer) {
                    return false
                }
                if (source._depthBuffer._format !== dest._depthBuffer._format) {
                    return false
                }
            }
        }
        const prevRt = this.renderTarget
        this.renderTarget = dest
        this.updateBegin()
        const src = source ? source.impl._glFrameBuffer : this.backBuffer?.impl._glFrameBuffer
        const dst = dest ? dest.impl._glFrameBuffer : this.backBuffer?.impl._glFrameBuffer
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src)
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst)
        const w = source ? source.width : dest ? dest.width : this.width
        const h = source ? source.height : dest ? dest.height : this.height
        gl.blitFramebuffer(
            0,
            0,
            w,
            h,
            0,
            0,
            w,
            h,
            (color ? gl.COLOR_BUFFER_BIT : 0) | (depth ? gl.DEPTH_BUFFER_BIT : 0),
            gl.NEAREST,
        )
        this.renderTarget = prevRt
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevRt ? prevRt.impl._glFrameBuffer : null)
        return true
    }
    frameStart() {
        super.frameStart()
        this.updateBackbuffer()
        this.gpuProfiler.frameStart()
    }
    frameEnd() {
        super.frameEnd()
        this.gpuProfiler.frameEnd()
        this.gpuProfiler.request()
    }
    startRenderPass(renderPass) {
        const rt = renderPass.renderTarget ?? this.backBuffer
        this.renderTarget = rt
        this.updateBegin()
        const { width, height } = rt
        this.setViewport(0, 0, width, height)
        this.setScissor(0, 0, width, height)
        const colorOps = renderPass.colorOps
        const depthStencilOps = renderPass.depthStencilOps
        if (colorOps?.clear || depthStencilOps.clearDepth || depthStencilOps.clearStencil) {
            let clearFlags = 0
            const clearOptions = {}
            if (colorOps?.clear) {
                clearFlags |= CLEARFLAG_COLOR
                clearOptions.color = [
                    colorOps.clearValue.r,
                    colorOps.clearValue.g,
                    colorOps.clearValue.b,
                    colorOps.clearValue.a,
                ]
            }
            if (depthStencilOps.clearDepth) {
                clearFlags |= CLEARFLAG_DEPTH
                clearOptions.depth = depthStencilOps.clearDepthValue
            }
            if (depthStencilOps.clearStencil) {
                clearFlags |= CLEARFLAG_STENCIL
                clearOptions.stencil = depthStencilOps.clearStencilValue
            }
            clearOptions.flags = clearFlags
            this.clear(clearOptions)
        }
        this.insideRenderPass = true
    }
    endRenderPass(renderPass) {
        this.unbindVertexArray()
        const target = this.renderTarget
        const colorBufferCount = renderPass.colorArrayOps.length
        if (target) {
            invalidateAttachments.length = 0
            const gl = this.gl
            for (let i = 0; i < colorBufferCount; i++) {
                const colorOps = renderPass.colorArrayOps[i]
                if (!(colorOps.store || colorOps.resolve)) {
                    invalidateAttachments.push(gl.COLOR_ATTACHMENT0 + i)
                }
            }
            if (target !== this.backBuffer) {
                if (!renderPass.depthStencilOps.storeDepth) {
                    invalidateAttachments.push(gl.DEPTH_ATTACHMENT)
                }
                if (!renderPass.depthStencilOps.storeStencil) {
                    invalidateAttachments.push(gl.STENCIL_ATTACHMENT)
                }
            }
            if (invalidateAttachments.length > 0) {
                if (renderPass.fullSizeClearRect) {
                    gl.invalidateFramebuffer(gl.DRAW_FRAMEBUFFER, invalidateAttachments)
                }
            }
            if (colorBufferCount && renderPass.colorOps?.resolve) {
                if (renderPass.samples > 1 && target.autoResolve) {
                    target.resolve(true, false)
                }
            }
            if (target.depthBuffer && renderPass.depthStencilOps.resolveDepth) {
                if (renderPass.samples > 1 && target.autoResolve) {
                    target.resolve(false, true)
                }
            }
            for (let i = 0; i < colorBufferCount; i++) {
                const colorOps = renderPass.colorArrayOps[i]
                if (colorOps.genMipmaps) {
                    const colorBuffer = target._colorBuffers[i]
                    if (colorBuffer && colorBuffer.impl._glTexture && colorBuffer.mipmaps) {
                        this.activeTexture(this.maxCombinedTextures - 1)
                        this.bindTexture(colorBuffer)
                        this.gl.generateMipmap(colorBuffer.impl._glTarget)
                    }
                }
            }
        }
        this.insideRenderPass = false
    }
    set defaultFramebuffer(value) {
        if (this._defaultFramebuffer !== value) {
            this._defaultFramebuffer = value
            this._defaultFramebufferChanged = true
        }
    }
    get defaultFramebuffer() {
        return this._defaultFramebuffer
    }
    updateBegin() {
        this.boundVao = null
        if (this._tempEnableSafariTextureUnitWorkaround) {
            for (let unit = 0; unit < this.textureUnits.length; ++unit) {
                for (let slot = 0; slot < 3; ++slot) {
                    this.textureUnits[unit][slot] = null
                }
            }
        }
        const target = this.renderTarget ?? this.backBuffer
        const targetImpl = target.impl
        if (!targetImpl.initialized) {
            this.initRenderTarget(target)
        }
        this.setFramebuffer(targetImpl._glFrameBuffer)
    }
    updateEnd() {
        this.unbindVertexArray()
        const target = this.renderTarget
        if (target && target !== this.backBuffer) {
            if (target._samples > 1 && target.autoResolve) {
                target.resolve()
            }
            const colorBuffer = target._colorBuffer
            if (colorBuffer && colorBuffer.impl._glTexture && colorBuffer.mipmaps) {
                this.activeTexture(this.maxCombinedTextures - 1)
                this.bindTexture(colorBuffer)
                this.gl.generateMipmap(colorBuffer.impl._glTarget)
            }
        }
    }
    setUnpackFlipY(flipY) {
        if (this.unpackFlipY !== flipY) {
            this.unpackFlipY = flipY
            const gl = this.gl
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY)
        }
    }
    setUnpackPremultiplyAlpha(premultiplyAlpha) {
        if (this.unpackPremultiplyAlpha !== premultiplyAlpha) {
            this.unpackPremultiplyAlpha = premultiplyAlpha
            const gl = this.gl
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha)
        }
    }
    setUnpackAlignment(alignment) {
        if (this.unpackAlignment !== alignment) {
            this.unpackAlignment = alignment
            this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, alignment)
        }
    }
    activeTexture(textureUnit) {
        if (this.textureUnit !== textureUnit) {
            this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit)
            this.textureUnit = textureUnit
        }
    }
    bindTexture(texture) {
        const impl = texture.impl
        const textureTarget = impl._glTarget
        const textureObject = impl._glTexture
        const textureUnit = this.textureUnit
        const slot = this.targetToSlot[textureTarget]
        if (this.textureUnits[textureUnit][slot] !== textureObject) {
            this.gl.bindTexture(textureTarget, textureObject)
            this.textureUnits[textureUnit][slot] = textureObject
        }
    }
    bindTextureOnUnit(texture, textureUnit) {
        const impl = texture.impl
        const textureTarget = impl._glTarget
        const textureObject = impl._glTexture
        const slot = this.targetToSlot[textureTarget]
        if (this.textureUnits[textureUnit][slot] !== textureObject) {
            this.activeTexture(textureUnit)
            this.gl.bindTexture(textureTarget, textureObject)
            this.textureUnits[textureUnit][slot] = textureObject
        }
    }
    setTextureParameters(texture) {
        const gl = this.gl
        const flags = texture.impl.dirtyParameterFlags
        const target = texture.impl._glTarget
        if (flags & TEXPROPERTY_MIN_FILTER) {
            let filter = texture._minFilter
            if (!texture._mipmaps || (texture._compressed && texture._levels.length === 1)) {
                if (filter === FILTER_NEAREST_MIPMAP_NEAREST || filter === FILTER_NEAREST_MIPMAP_LINEAR) {
                    filter = FILTER_NEAREST
                } else if (filter === FILTER_LINEAR_MIPMAP_NEAREST || filter === FILTER_LINEAR_MIPMAP_LINEAR) {
                    filter = FILTER_LINEAR
                }
            }
            gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, this.glFilter[filter])
        }
        if (flags & TEXPROPERTY_MAG_FILTER) {
            gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, this.glFilter[texture._magFilter])
        }
        if (flags & TEXPROPERTY_ADDRESS_U) {
            gl.texParameteri(target, gl.TEXTURE_WRAP_S, this.glAddress[texture._addressU])
        }
        if (flags & TEXPROPERTY_ADDRESS_V) {
            gl.texParameteri(target, gl.TEXTURE_WRAP_T, this.glAddress[texture._addressV])
        }
        if (flags & TEXPROPERTY_ADDRESS_W) {
            gl.texParameteri(target, gl.TEXTURE_WRAP_R, this.glAddress[texture._addressW])
        }
        if (flags & TEXPROPERTY_COMPARE_ON_READ) {
            gl.texParameteri(
                target,
                gl.TEXTURE_COMPARE_MODE,
                texture._compareOnRead ? gl.COMPARE_REF_TO_TEXTURE : gl.NONE,
            )
        }
        if (flags & TEXPROPERTY_COMPARE_FUNC) {
            gl.texParameteri(target, gl.TEXTURE_COMPARE_FUNC, this.glComparison[texture._compareFunc])
        }
        if (flags & TEXPROPERTY_ANISOTROPY) {
            const ext = this.extTextureFilterAnisotropic
            if (ext) {
                gl.texParameterf(
                    target,
                    ext.TEXTURE_MAX_ANISOTROPY_EXT,
                    math.clamp(Math.round(texture._anisotropy), 1, this.maxAnisotropy),
                )
            }
        }
    }
    setTexture(texture, textureUnit) {
        const impl = texture.impl
        if (!impl._glTexture) {
            impl.initialize(this, texture)
        }
        if (impl.dirtyParameterFlags > 0 || texture._needsUpload || texture._needsMipmapsUpload) {
            this.activeTexture(textureUnit)
            this.bindTexture(texture)
            if (impl.dirtyParameterFlags) {
                this.setTextureParameters(texture)
                impl.dirtyParameterFlags = 0
            }
            if (texture._needsUpload || texture._needsMipmapsUpload) {
                impl.upload(this, texture)
                texture._needsUpload = false
                texture._needsMipmapsUpload = false
            }
        } else {
            this.bindTextureOnUnit(texture, textureUnit)
        }
    }
    createVertexArray(vertexBuffers) {
        let key, vao
        const useCache = vertexBuffers.length > 1
        if (useCache) {
            key = ''
            for (let i = 0; i < vertexBuffers.length; i++) {
                const vertexBuffer = vertexBuffers[i]
                key += vertexBuffer.id + vertexBuffer.format.renderingHash
            }
            vao = this._vaoMap.get(key)
        }
        if (!vao) {
            const gl = this.gl
            vao = gl.createVertexArray()
            gl.bindVertexArray(vao)
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null)
            for (let i = 0; i < vertexBuffers.length; i++) {
                const vertexBuffer = vertexBuffers[i]
                gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer.impl.bufferId)
                const elements = vertexBuffer.format.elements
                for (let j = 0; j < elements.length; j++) {
                    const e = elements[j]
                    const loc = semanticToLocation[e.name]
                    if (e.asInt) {
                        gl.vertexAttribIPointer(loc, e.numComponents, this.glType[e.dataType], e.stride, e.offset)
                    } else {
                        gl.vertexAttribPointer(
                            loc,
                            e.numComponents,
                            this.glType[e.dataType],
                            e.normalize,
                            e.stride,
                            e.offset,
                        )
                    }
                    gl.enableVertexAttribArray(loc)
                    if (vertexBuffer.format.instancing) {
                        gl.vertexAttribDivisor(loc, 1)
                    }
                }
            }
            gl.bindVertexArray(null)
            gl.bindBuffer(gl.ARRAY_BUFFER, null)
            if (useCache) {
                this._vaoMap.set(key, vao)
            }
        }
        return vao
    }
    unbindVertexArray() {
        if (this.boundVao) {
            this.boundVao = null
            this.gl.bindVertexArray(null)
        }
    }
    setBuffers(indexBuffer) {
        const gl = this.gl
        let vao
        if (this.vertexBuffers.length === 1) {
            const vertexBuffer = this.vertexBuffers[0]
            if (!vertexBuffer.impl.vao) {
                vertexBuffer.impl.vao = this.createVertexArray(this.vertexBuffers)
            }
            vao = vertexBuffer.impl.vao
        } else {
            vao = this.createVertexArray(this.vertexBuffers)
        }
        if (this.boundVao !== vao) {
            this.boundVao = vao
            gl.bindVertexArray(vao)
        }
        const bufferId = indexBuffer ? indexBuffer.impl.bufferId : null
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bufferId)
    }
    _multiDrawLoopFallback(mode, primitive, indexBuffer, numInstances, drawCommands) {
        const gl = this.gl
        if (primitive.indexed) {
            const format = indexBuffer.impl.glFormat
            const { glCounts, glOffsetsBytes, glInstanceCounts, count } = drawCommands.impl
            if (numInstances > 0) {
                for (let i = 0; i < count; i++) {
                    gl.drawElementsInstanced(mode, glCounts[i], format, glOffsetsBytes[i], glInstanceCounts[i])
                }
            } else {
                for (let i = 0; i < count; i++) {
                    gl.drawElements(mode, glCounts[i], format, glOffsetsBytes[i])
                }
            }
        } else {
            const { glCounts, glOffsetsBytes, glInstanceCounts, count } = drawCommands.impl
            if (numInstances > 0) {
                for (let i = 0; i < count; i++) {
                    gl.drawArraysInstanced(mode, glOffsetsBytes[i], glCounts[i], glInstanceCounts[i])
                }
            } else {
                for (let i = 0; i < count; i++) {
                    gl.drawArrays(mode, glOffsetsBytes[i], glCounts[i])
                }
            }
        }
    }
    draw(primitive, indexBuffer, numInstances, drawCommands, first = true, last = true) {
        const shader = this.shader
        if (shader) {
            this.activateShader()
            if (this.shaderValid) {
                const gl = this.gl
                if (first) {
                    this.setBuffers(indexBuffer)
                }
                let textureUnit = 0
                const samplers = shader.impl.samplers
                for (let i = 0, len = samplers.length; i < len; i++) {
                    const sampler = samplers[i]
                    let samplerValue = sampler.scopeId.value
                    if (!samplerValue) {
                        const samplerName = sampler.scopeId.name
                        if (samplerName === 'uSceneDepthMap') {
                            samplerValue = getBuiltInTexture(this, 'white')
                        }
                        if (samplerName === 'uSceneColorMap') {
                            samplerValue = getBuiltInTexture(this, 'pink')
                        }
                        if (!samplerValue) {
                            samplerValue = getBuiltInTexture(this, 'pink')
                        }
                    }
                    if (samplerValue instanceof Texture) {
                        const texture = samplerValue
                        this.setTexture(texture, textureUnit)
                        if (sampler.slot !== textureUnit) {
                            gl.uniform1i(sampler.locationId, textureUnit)
                            sampler.slot = textureUnit
                        }
                        textureUnit++
                    } else {
                        sampler.array.length = 0
                        const numTextures = samplerValue.length
                        for (let j = 0; j < numTextures; j++) {
                            const texture = samplerValue[j]
                            this.setTexture(texture, textureUnit)
                            sampler.array[j] = textureUnit
                            textureUnit++
                        }
                        gl.uniform1iv(sampler.locationId, sampler.array)
                    }
                }
                const uniforms = shader.impl.uniforms
                for (let i = 0, len = uniforms.length; i < len; i++) {
                    const uniform = uniforms[i]
                    const scopeId = uniform.scopeId
                    const uniformVersion = uniform.version
                    const programVersion = scopeId.versionObject.version
                    if (
                        uniformVersion.globalId !== programVersion.globalId ||
                        uniformVersion.revision !== programVersion.revision
                    ) {
                        uniformVersion.globalId = programVersion.globalId
                        uniformVersion.revision = programVersion.revision
                        const value = scopeId.value
                        if (value !== null && value !== undefined) {
                            this.commitFunction[uniform.dataType](uniform, value)
                        }
                    }
                }
                if (this.transformFeedbackBuffer) {
                    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.transformFeedbackBuffer.impl.bufferId)
                    gl.beginTransformFeedback(gl.POINTS)
                }
                const mode = this.glPrimitive[primitive.type]
                const count = primitive.count
                if (drawCommands) {
                    if (this.extMultiDraw) {
                        const impl = drawCommands.impl
                        if (primitive.indexed) {
                            const format = indexBuffer.impl.glFormat
                            if (numInstances > 0) {
                                this.extMultiDraw.multiDrawElementsInstancedWEBGL(
                                    mode,
                                    impl.glCounts,
                                    0,
                                    format,
                                    impl.glOffsetsBytes,
                                    0,
                                    impl.glInstanceCounts,
                                    0,
                                    drawCommands.count,
                                )
                            } else {
                                this.extMultiDraw.multiDrawElementsWEBGL(
                                    mode,
                                    impl.glCounts,
                                    0,
                                    format,
                                    impl.glOffsetsBytes,
                                    0,
                                    drawCommands.count,
                                )
                            }
                        } else {
                            if (numInstances > 0) {
                                this.extMultiDraw.multiDrawArraysInstancedWEBGL(
                                    mode,
                                    impl.glOffsetsBytes,
                                    0,
                                    impl.glCounts,
                                    0,
                                    impl.glInstanceCounts,
                                    0,
                                    drawCommands.count,
                                )
                            } else {
                                this.extMultiDraw.multiDrawArraysWEBGL(
                                    mode,
                                    impl.glOffsetsBytes,
                                    0,
                                    impl.glCounts,
                                    0,
                                    drawCommands.count,
                                )
                            }
                        }
                    } else {
                        this._multiDrawLoopFallback(mode, primitive, indexBuffer, numInstances, drawCommands)
                    }
                } else {
                    if (primitive.indexed) {
                        const format = indexBuffer.impl.glFormat
                        const offset = primitive.base * indexBuffer.bytesPerIndex
                        if (numInstances > 0) {
                            gl.drawElementsInstanced(mode, count, format, offset, numInstances)
                        } else {
                            gl.drawElements(mode, count, format, offset)
                        }
                    } else {
                        const first = primitive.base
                        if (numInstances > 0) {
                            gl.drawArraysInstanced(mode, first, count, numInstances)
                        } else {
                            gl.drawArrays(mode, first, count)
                        }
                    }
                }
                if (this.transformFeedbackBuffer) {
                    gl.endTransformFeedback()
                    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null)
                }
                this._drawCallsPerFrame++
            }
        }
        if (last) {
            this.clearVertexBuffer()
        }
    }
    clear(options) {
        const defaultOptions = this.defaultClearOptions
        options = options || defaultOptions
        const flags = options.flags ?? defaultOptions.flags
        if (flags !== 0) {
            const gl = this.gl
            if (flags & CLEARFLAG_COLOR) {
                const color = options.color ?? defaultOptions.color
                const r = color[0]
                const g = color[1]
                const b = color[2]
                const a = color[3]
                const c = this.clearColor
                if (r !== c.r || g !== c.g || b !== c.b || a !== c.a) {
                    this.gl.clearColor(r, g, b, a)
                    this.clearColor.set(r, g, b, a)
                }
                this.setBlendState(BlendState.NOBLEND)
            }
            if (flags & CLEARFLAG_DEPTH) {
                const depth = options.depth ?? defaultOptions.depth
                if (depth !== this.clearDepth) {
                    this.gl.clearDepth(depth)
                    this.clearDepth = depth
                }
                this.setDepthState(DepthState.WRITEDEPTH)
            }
            if (flags & CLEARFLAG_STENCIL) {
                const stencil = options.stencil ?? defaultOptions.stencil
                if (stencil !== this.clearStencil) {
                    this.gl.clearStencil(stencil)
                    this.clearStencil = stencil
                }
                gl.stencilMask(0xff)
                this.stencilWriteMaskFront = 0xff
                this.stencilWriteMaskBack = 0xff
            }
            gl.clear(this.glClearFlag[flags])
        }
    }
    submit() {
        this.gl.flush()
    }
    readPixels(x, y, w, h, pixels) {
        const gl = this.gl
        gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    }
    clientWaitAsync(flags, interval_ms) {
        const gl = this.gl
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
        this.submit()
        return new Promise((resolve, reject) => {
            function test() {
                const res = gl.clientWaitSync(sync, flags, 0)
                if (res === gl.TIMEOUT_EXPIRED) {
                    setTimeout(test, interval_ms)
                } else {
                    gl.deleteSync(sync)
                    if (res === gl.WAIT_FAILED) {
                        reject(new Error('webgl clientWaitSync sync failed'))
                    } else {
                        resolve()
                    }
                }
            }
            test()
        })
    }
    async readPixelsAsync(x, y, w, h, pixels, forceRgba = false) {
        const gl = this.gl
        let format, pixelType
        if (forceRgba) {
            format = gl.RGBA
            pixelType = gl.UNSIGNED_BYTE
        } else {
            const impl = this.renderTarget.colorBuffer?.impl
            format = impl?._glFormat ?? gl.RGBA
            pixelType = impl?._glPixelType ?? gl.UNSIGNED_BYTE
        }
        const buf = gl.createBuffer()
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf)
        gl.bufferData(gl.PIXEL_PACK_BUFFER, pixels.byteLength, gl.STREAM_READ)
        gl.readPixels(x, y, w, h, format, pixelType, 0)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
        await this.clientWaitAsync(0, 16)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf)
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels)
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
        gl.deleteBuffer(buf)
        return pixels
    }
    readTextureAsync(texture, x, y, width, height, options) {
        const face = options.face ?? 0
        const mipLevel = options.mipLevel ?? 0
        const renderTarget =
            options.renderTarget ??
            new RenderTarget({
                colorBuffer: texture,
                depth: false,
                face: face,
                mipLevel: mipLevel,
            })
        const rgbaChannels = getPixelFormatChannelsForRgbaReadback(texture._format)
        const needsRgbaReadback = rgbaChannels > 0
        const ArrayType = getPixelFormatArrayType(texture._format)
        const outputData =
            options.data ??
            new ArrayType(
                TextureUtils.calcLevelGpuSize(width, height, 1, texture._format) / ArrayType.BYTES_PER_ELEMENT,
            )
        const readBuffer = needsRgbaReadback ? new Uint8Array(width * height * 4) : outputData
        this.setRenderTarget(renderTarget)
        this.initRenderTarget(renderTarget)
        this.setFramebuffer(renderTarget.impl._glFrameBuffer)
        if (options.immediate) {
            this.gl.flush()
        }
        return new Promise((resolve, reject) => {
            const readPromise = this.readPixelsAsync(x, y, width, height, readBuffer, needsRgbaReadback)
            readPromise
                .then((data) => {
                    if (this._destroyed) return
                    if (!options.renderTarget) {
                        renderTarget.destroy()
                    }
                    if (needsRgbaReadback) {
                        const pixelCount = width * height
                        for (let i = 0; i < pixelCount; i++) {
                            for (let c = 0; c < rgbaChannels; c++) {
                                outputData[i * rgbaChannels + c] = data[i * 4 + c]
                            }
                        }
                        resolve(outputData)
                    } else {
                        resolve(data)
                    }
                })
                .catch(reject)
        })
    }
    async writeTextureAsync(texture, x, y, width, height, data) {
        const gl = this.gl
        const impl = texture.impl
        const format = impl?._glFormat ?? gl.RGBA
        const pixelType = impl?._glPixelType ?? gl.UNSIGNED_BYTE
        const buf = gl.createBuffer()
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, buf)
        gl.bufferData(gl.PIXEL_UNPACK_BUFFER, data, gl.STREAM_DRAW)
        gl.bindTexture(gl.TEXTURE_2D, impl._glTexture)
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, width, height, format, pixelType, 0)
        gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null)
        texture._needsUpload = false
        texture._mipmapsUploaded = false
        await this.clientWaitAsync(0, 16)
    }
    setAlphaToCoverage(state) {
        if (this.alphaToCoverage !== state) {
            this.alphaToCoverage = state
            if (state) {
                this.gl.enable(this.gl.SAMPLE_ALPHA_TO_COVERAGE)
            } else {
                this.gl.disable(this.gl.SAMPLE_ALPHA_TO_COVERAGE)
            }
        }
    }
    setTransformFeedbackBuffer(tf) {
        if (this.transformFeedbackBuffer !== tf) {
            this.transformFeedbackBuffer = tf
            const gl = this.gl
            if (tf) {
                if (!this.feedback) {
                    this.feedback = gl.createTransformFeedback()
                }
                gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.feedback)
            } else {
                gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null)
            }
        }
    }
    setRaster(on) {
        if (this.raster !== on) {
            this.raster = on
            if (on) {
                this.gl.disable(this.gl.RASTERIZER_DISCARD)
            } else {
                this.gl.enable(this.gl.RASTERIZER_DISCARD)
            }
        }
    }
    setStencilTest(enable) {
        if (this.stencil !== enable) {
            const gl = this.gl
            if (enable) {
                gl.enable(gl.STENCIL_TEST)
            } else {
                gl.disable(gl.STENCIL_TEST)
            }
            this.stencil = enable
        }
    }
    setStencilFunc(func, ref, mask) {
        if (
            this.stencilFuncFront !== func ||
            this.stencilRefFront !== ref ||
            this.stencilMaskFront !== mask ||
            this.stencilFuncBack !== func ||
            this.stencilRefBack !== ref ||
            this.stencilMaskBack !== mask
        ) {
            this.gl.stencilFunc(this.glComparison[func], ref, mask)
            this.stencilFuncFront = this.stencilFuncBack = func
            this.stencilRefFront = this.stencilRefBack = ref
            this.stencilMaskFront = this.stencilMaskBack = mask
        }
    }
    setStencilFuncFront(func, ref, mask) {
        if (this.stencilFuncFront !== func || this.stencilRefFront !== ref || this.stencilMaskFront !== mask) {
            const gl = this.gl
            gl.stencilFuncSeparate(gl.FRONT, this.glComparison[func], ref, mask)
            this.stencilFuncFront = func
            this.stencilRefFront = ref
            this.stencilMaskFront = mask
        }
    }
    setStencilFuncBack(func, ref, mask) {
        if (this.stencilFuncBack !== func || this.stencilRefBack !== ref || this.stencilMaskBack !== mask) {
            const gl = this.gl
            gl.stencilFuncSeparate(gl.BACK, this.glComparison[func], ref, mask)
            this.stencilFuncBack = func
            this.stencilRefBack = ref
            this.stencilMaskBack = mask
        }
    }
    setStencilOperation(fail, zfail, zpass, writeMask) {
        if (
            this.stencilFailFront !== fail ||
            this.stencilZfailFront !== zfail ||
            this.stencilZpassFront !== zpass ||
            this.stencilFailBack !== fail ||
            this.stencilZfailBack !== zfail ||
            this.stencilZpassBack !== zpass
        ) {
            this.gl.stencilOp(this.glStencilOp[fail], this.glStencilOp[zfail], this.glStencilOp[zpass])
            this.stencilFailFront = this.stencilFailBack = fail
            this.stencilZfailFront = this.stencilZfailBack = zfail
            this.stencilZpassFront = this.stencilZpassBack = zpass
        }
        if (this.stencilWriteMaskFront !== writeMask || this.stencilWriteMaskBack !== writeMask) {
            this.gl.stencilMask(writeMask)
            this.stencilWriteMaskFront = writeMask
            this.stencilWriteMaskBack = writeMask
        }
    }
    setStencilOperationFront(fail, zfail, zpass, writeMask) {
        if (this.stencilFailFront !== fail || this.stencilZfailFront !== zfail || this.stencilZpassFront !== zpass) {
            this.gl.stencilOpSeparate(
                this.gl.FRONT,
                this.glStencilOp[fail],
                this.glStencilOp[zfail],
                this.glStencilOp[zpass],
            )
            this.stencilFailFront = fail
            this.stencilZfailFront = zfail
            this.stencilZpassFront = zpass
        }
        if (this.stencilWriteMaskFront !== writeMask) {
            this.gl.stencilMaskSeparate(this.gl.FRONT, writeMask)
            this.stencilWriteMaskFront = writeMask
        }
    }
    setStencilOperationBack(fail, zfail, zpass, writeMask) {
        if (this.stencilFailBack !== fail || this.stencilZfailBack !== zfail || this.stencilZpassBack !== zpass) {
            this.gl.stencilOpSeparate(
                this.gl.BACK,
                this.glStencilOp[fail],
                this.glStencilOp[zfail],
                this.glStencilOp[zpass],
            )
            this.stencilFailBack = fail
            this.stencilZfailBack = zfail
            this.stencilZpassBack = zpass
        }
        if (this.stencilWriteMaskBack !== writeMask) {
            this.gl.stencilMaskSeparate(this.gl.BACK, writeMask)
            this.stencilWriteMaskBack = writeMask
        }
    }
    setBlendState(blendState) {
        const currentBlendState = this.blendState
        if (!currentBlendState.equals(blendState)) {
            const gl = this.gl
            const { blend, colorOp, alphaOp, colorSrcFactor, colorDstFactor, alphaSrcFactor, alphaDstFactor } =
                blendState
            if (currentBlendState.blend !== blend) {
                if (blend) {
                    gl.enable(gl.BLEND)
                } else {
                    gl.disable(gl.BLEND)
                }
            }
            if (currentBlendState.colorOp !== colorOp || currentBlendState.alphaOp !== alphaOp) {
                const glBlendEquation = this.glBlendEquation
                gl.blendEquationSeparate(glBlendEquation[colorOp], glBlendEquation[alphaOp])
            }
            if (
                currentBlendState.colorSrcFactor !== colorSrcFactor ||
                currentBlendState.colorDstFactor !== colorDstFactor ||
                currentBlendState.alphaSrcFactor !== alphaSrcFactor ||
                currentBlendState.alphaDstFactor !== alphaDstFactor
            ) {
                gl.blendFuncSeparate(
                    this.glBlendFunctionColor[colorSrcFactor],
                    this.glBlendFunctionColor[colorDstFactor],
                    this.glBlendFunctionAlpha[alphaSrcFactor],
                    this.glBlendFunctionAlpha[alphaDstFactor],
                )
            }
            if (currentBlendState.allWrite !== blendState.allWrite) {
                this.gl.colorMask(
                    blendState.redWrite,
                    blendState.greenWrite,
                    blendState.blueWrite,
                    blendState.alphaWrite,
                )
            }
            currentBlendState.copy(blendState)
        }
    }
    setBlendColor(r, g, b, a) {
        const c = this.blendColor
        if (r !== c.r || g !== c.g || b !== c.b || a !== c.a) {
            this.gl.blendColor(r, g, b, a)
            c.set(r, g, b, a)
        }
    }
    setStencilState(stencilFront, stencilBack) {
        if (stencilFront || stencilBack) {
            this.setStencilTest(true)
            if (stencilFront === stencilBack) {
                this.setStencilFunc(stencilFront.func, stencilFront.ref, stencilFront.readMask)
                this.setStencilOperation(
                    stencilFront.fail,
                    stencilFront.zfail,
                    stencilFront.zpass,
                    stencilFront.writeMask,
                )
            } else {
                stencilFront ?? (stencilFront = StencilParameters.DEFAULT)
                this.setStencilFuncFront(stencilFront.func, stencilFront.ref, stencilFront.readMask)
                this.setStencilOperationFront(
                    stencilFront.fail,
                    stencilFront.zfail,
                    stencilFront.zpass,
                    stencilFront.writeMask,
                )
                stencilBack ?? (stencilBack = StencilParameters.DEFAULT)
                this.setStencilFuncBack(stencilBack.func, stencilBack.ref, stencilBack.readMask)
                this.setStencilOperationBack(
                    stencilBack.fail,
                    stencilBack.zfail,
                    stencilBack.zpass,
                    stencilBack.writeMask,
                )
            }
        } else {
            this.setStencilTest(false)
        }
    }
    setDepthState(depthState) {
        const currentDepthState = this.depthState
        if (!currentDepthState.equals(depthState)) {
            const gl = this.gl
            const write = depthState.write
            if (currentDepthState.write !== write) {
                gl.depthMask(write)
            }
            let { func, test } = depthState
            if (!test && write) {
                test = true
                func = FUNC_ALWAYS
            }
            if (currentDepthState.func !== func) {
                gl.depthFunc(this.glComparison[func])
            }
            if (currentDepthState.test !== test) {
                if (test) {
                    gl.enable(gl.DEPTH_TEST)
                } else {
                    gl.disable(gl.DEPTH_TEST)
                }
            }
            const { depthBias, depthBiasSlope } = depthState
            if (depthBias || depthBiasSlope) {
                if (!this.depthBiasEnabled) {
                    this.depthBiasEnabled = true
                    this.gl.enable(this.gl.POLYGON_OFFSET_FILL)
                }
                gl.polygonOffset(depthBiasSlope, depthBias)
            } else {
                if (this.depthBiasEnabled) {
                    this.depthBiasEnabled = false
                    this.gl.disable(this.gl.POLYGON_OFFSET_FILL)
                }
            }
            currentDepthState.copy(depthState)
        }
    }
    setCullMode(cullMode) {
        if (this.cullMode !== cullMode) {
            if (cullMode === CULLFACE_NONE) {
                this.gl.disable(this.gl.CULL_FACE)
            } else {
                if (this.cullMode === CULLFACE_NONE) {
                    this.gl.enable(this.gl.CULL_FACE)
                }
                const mode = this.glCull[cullMode]
                if (this.cullFace !== mode) {
                    this.gl.cullFace(mode)
                    this.cullFace = mode
                }
            }
            this.cullMode = cullMode
        }
    }
    setFrontFace(frontFace) {
        if (this.frontFace !== frontFace) {
            const mode = this.glFrontFace[frontFace]
            this.gl.frontFace(mode)
            this.frontFace = frontFace
        }
    }
    setShader(shader, asyncCompile = false) {
        if (shader !== this.shader) {
            this.shader = shader
            this.shaderAsyncCompile = asyncCompile
            this.shaderValid = undefined
        }
    }
    activateShader() {
        const { shader } = this
        const { impl } = shader
        if (this.shaderValid === undefined) {
            if (shader.failed) {
                this.shaderValid = false
            } else if (!shader.ready) {
                if (this.shaderAsyncCompile) {
                    if (impl.isLinked(this)) {
                        if (!impl.finalize(this, shader)) {
                            shader.failed = true
                            this.shaderValid = false
                        }
                    } else {
                        this.shaderValid = false
                    }
                } else {
                    if (!impl.finalize(this, shader)) {
                        shader.failed = true
                        this.shaderValid = false
                    }
                }
            }
        }
        if (this.shaderValid === undefined) {
            this.gl.useProgram(impl.glProgram)
            this.shaderValid = true
        }
    }
    clearVertexArrayObjectCache() {
        const gl = this.gl
        this._vaoMap.forEach((item, key, mapObj) => {
            gl.deleteVertexArray(item)
        })
        this._vaoMap.clear()
    }
    constructor(canvas, options = {}) {
        ;(super(canvas, options), (this._defaultFramebuffer = null), (this._defaultFramebufferChanged = false))
        options = this.initOptions
        this.updateClientRect()
        this.initTextureUnits()
        this.contextLost = false
        this._contextLostHandler = (event) => {
            event.preventDefault()
            this.loseContext()
            this.fire('devicelost')
        }
        this._contextRestoredHandler = () => {
            this.restoreContext()
            this.fire('devicerestored')
        }
        const ua = typeof navigator !== 'undefined' && navigator.userAgent
        this.forceDisableMultisampling =
            ua && ua.includes('AppleWebKit') && (ua.includes('15.4') || ua.includes('15_4'))
        if (this.forceDisableMultisampling) {
            options.antialias = false
        }
        if (platform.browserName === 'firefox') {
            const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
            const match = ua.match(/Firefox\/(\d+(\.\d+)*)/)
            const firefoxVersion = match ? match[1] : null
            if (firefoxVersion) {
                const version = parseFloat(firefoxVersion)
                const disableAntialias =
                    (platform.name === 'windows' && (version >= 120 || version === 115)) ||
                    (platform.name === 'android' && version >= 132)
                if (disableAntialias) {
                    options.antialias = false
                }
            }
        }
        this.backBufferAntialias = options.antialias ?? false
        options.antialias = false
        const gl = options.gl ?? canvas.getContext('webgl2', options)
        if (!gl) {
            throw new Error('WebGL not supported')
        }
        this.gl = gl
        this.isWebGL2 = true
        this._deviceType = DEVICETYPE_WEBGL2
        this.updateBackbufferFormat(null)
        const isChrome = platform.browserName === 'chrome'
        const isSafari = platform.browserName === 'safari'
        const isMac = platform.browser && navigator.appVersion.indexOf('Mac') !== -1
        this._tempEnableSafariTextureUnitWorkaround = isSafari
        this._tempMacChromeBlitFramebufferWorkaround = isMac && isChrome && !options.alpha
        canvas.addEventListener('webglcontextlost', this._contextLostHandler, false)
        canvas.addEventListener('webglcontextrestored', this._contextRestoredHandler, false)
        this.initializeExtensions()
        this.initializeCapabilities()
        this.initializeRenderState()
        this.initializeContextCaches()
        this.createBackbuffer(null)
        this.supportsImageBitmap = !isSafari && typeof ImageBitmap !== 'undefined'
        this._samplerTypes = new Set([
            gl.SAMPLER_2D,
            gl.SAMPLER_CUBE,
            gl.UNSIGNED_INT_SAMPLER_2D,
            gl.INT_SAMPLER_2D,
            gl.SAMPLER_2D_SHADOW,
            gl.SAMPLER_CUBE_SHADOW,
            gl.SAMPLER_3D,
            gl.INT_SAMPLER_3D,
            gl.UNSIGNED_INT_SAMPLER_3D,
            gl.SAMPLER_2D_ARRAY,
            gl.INT_SAMPLER_2D_ARRAY,
            gl.UNSIGNED_INT_SAMPLER_2D_ARRAY,
        ])
        this.glAddress = [gl.REPEAT, gl.CLAMP_TO_EDGE, gl.MIRRORED_REPEAT]
        this.glBlendEquation = [gl.FUNC_ADD, gl.FUNC_SUBTRACT, gl.FUNC_REVERSE_SUBTRACT, gl.MIN, gl.MAX]
        this.glBlendFunctionColor = [
            gl.ZERO,
            gl.ONE,
            gl.SRC_COLOR,
            gl.ONE_MINUS_SRC_COLOR,
            gl.DST_COLOR,
            gl.ONE_MINUS_DST_COLOR,
            gl.SRC_ALPHA,
            gl.SRC_ALPHA_SATURATE,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.DST_ALPHA,
            gl.ONE_MINUS_DST_ALPHA,
            gl.CONSTANT_COLOR,
            gl.ONE_MINUS_CONSTANT_COLOR,
        ]
        this.glBlendFunctionAlpha = [
            gl.ZERO,
            gl.ONE,
            gl.SRC_COLOR,
            gl.ONE_MINUS_SRC_COLOR,
            gl.DST_COLOR,
            gl.ONE_MINUS_DST_COLOR,
            gl.SRC_ALPHA,
            gl.SRC_ALPHA_SATURATE,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.DST_ALPHA,
            gl.ONE_MINUS_DST_ALPHA,
            gl.CONSTANT_ALPHA,
            gl.ONE_MINUS_CONSTANT_ALPHA,
        ]
        this.glComparison = [gl.NEVER, gl.LESS, gl.EQUAL, gl.LEQUAL, gl.GREATER, gl.NOTEQUAL, gl.GEQUAL, gl.ALWAYS]
        this.glStencilOp = [gl.KEEP, gl.ZERO, gl.REPLACE, gl.INCR, gl.INCR_WRAP, gl.DECR, gl.DECR_WRAP, gl.INVERT]
        this.glClearFlag = [
            0,
            gl.COLOR_BUFFER_BIT,
            gl.DEPTH_BUFFER_BIT,
            gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
            gl.STENCIL_BUFFER_BIT,
            gl.STENCIL_BUFFER_BIT | gl.COLOR_BUFFER_BIT,
            gl.STENCIL_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
            gl.STENCIL_BUFFER_BIT | gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT,
        ]
        this.glCull = [0, gl.BACK, gl.FRONT, gl.FRONT_AND_BACK]
        this.glFrontFace = [gl.CCW, gl.CW]
        this.glFilter = [
            gl.NEAREST,
            gl.LINEAR,
            gl.NEAREST_MIPMAP_NEAREST,
            gl.NEAREST_MIPMAP_LINEAR,
            gl.LINEAR_MIPMAP_NEAREST,
            gl.LINEAR_MIPMAP_LINEAR,
        ]
        this.glPrimitive = [
            gl.POINTS,
            gl.LINES,
            gl.LINE_LOOP,
            gl.LINE_STRIP,
            gl.TRIANGLES,
            gl.TRIANGLE_STRIP,
            gl.TRIANGLE_FAN,
        ]
        this.glType = [
            gl.BYTE,
            gl.UNSIGNED_BYTE,
            gl.SHORT,
            gl.UNSIGNED_SHORT,
            gl.INT,
            gl.UNSIGNED_INT,
            gl.FLOAT,
            gl.HALF_FLOAT,
        ]
        this.pcUniformType = {}
        this.pcUniformType[gl.BOOL] = UNIFORMTYPE_BOOL
        this.pcUniformType[gl.INT] = UNIFORMTYPE_INT
        this.pcUniformType[gl.FLOAT] = UNIFORMTYPE_FLOAT
        this.pcUniformType[gl.FLOAT_VEC2] = UNIFORMTYPE_VEC2
        this.pcUniformType[gl.FLOAT_VEC3] = UNIFORMTYPE_VEC3
        this.pcUniformType[gl.FLOAT_VEC4] = UNIFORMTYPE_VEC4
        this.pcUniformType[gl.INT_VEC2] = UNIFORMTYPE_IVEC2
        this.pcUniformType[gl.INT_VEC3] = UNIFORMTYPE_IVEC3
        this.pcUniformType[gl.INT_VEC4] = UNIFORMTYPE_IVEC4
        this.pcUniformType[gl.BOOL_VEC2] = UNIFORMTYPE_BVEC2
        this.pcUniformType[gl.BOOL_VEC3] = UNIFORMTYPE_BVEC3
        this.pcUniformType[gl.BOOL_VEC4] = UNIFORMTYPE_BVEC4
        this.pcUniformType[gl.FLOAT_MAT2] = UNIFORMTYPE_MAT2
        this.pcUniformType[gl.FLOAT_MAT3] = UNIFORMTYPE_MAT3
        this.pcUniformType[gl.FLOAT_MAT4] = UNIFORMTYPE_MAT4
        this.pcUniformType[gl.SAMPLER_2D] = UNIFORMTYPE_TEXTURE2D
        this.pcUniformType[gl.SAMPLER_CUBE] = UNIFORMTYPE_TEXTURECUBE
        this.pcUniformType[gl.UNSIGNED_INT] = UNIFORMTYPE_UINT
        this.pcUniformType[gl.UNSIGNED_INT_VEC2] = UNIFORMTYPE_UVEC2
        this.pcUniformType[gl.UNSIGNED_INT_VEC3] = UNIFORMTYPE_UVEC3
        this.pcUniformType[gl.UNSIGNED_INT_VEC4] = UNIFORMTYPE_UVEC4
        this.pcUniformType[gl.SAMPLER_2D_SHADOW] = UNIFORMTYPE_TEXTURE2D_SHADOW
        this.pcUniformType[gl.SAMPLER_CUBE_SHADOW] = UNIFORMTYPE_TEXTURECUBE_SHADOW
        this.pcUniformType[gl.SAMPLER_2D_ARRAY] = UNIFORMTYPE_TEXTURE2D_ARRAY
        this.pcUniformType[gl.SAMPLER_3D] = UNIFORMTYPE_TEXTURE3D
        this.pcUniformType[gl.INT_SAMPLER_2D] = UNIFORMTYPE_ITEXTURE2D
        this.pcUniformType[gl.UNSIGNED_INT_SAMPLER_2D] = UNIFORMTYPE_UTEXTURE2D
        this.pcUniformType[gl.INT_SAMPLER_CUBE] = UNIFORMTYPE_ITEXTURECUBE
        this.pcUniformType[gl.UNSIGNED_INT_SAMPLER_2D] = UNIFORMTYPE_UTEXTURECUBE
        this.pcUniformType[gl.INT_SAMPLER_3D] = UNIFORMTYPE_ITEXTURE3D
        this.pcUniformType[gl.UNSIGNED_INT_SAMPLER_3D] = UNIFORMTYPE_UTEXTURE3D
        this.pcUniformType[gl.INT_SAMPLER_2D_ARRAY] = UNIFORMTYPE_ITEXTURE2D_ARRAY
        this.pcUniformType[gl.UNSIGNED_INT_SAMPLER_2D_ARRAY] = UNIFORMTYPE_UTEXTURE2D_ARRAY
        this.targetToSlot = {}
        this.targetToSlot[gl.TEXTURE_2D] = 0
        this.targetToSlot[gl.TEXTURE_CUBE_MAP] = 1
        this.targetToSlot[gl.TEXTURE_3D] = 2
        let scopeX, scopeY, scopeZ, scopeW
        let uniformValue
        this.commitFunction = []
        this.commitFunction[UNIFORMTYPE_BOOL] = function (uniform, value) {
            if (uniform.value !== value) {
                gl.uniform1i(uniform.locationId, value)
                uniform.value = value
            }
        }
        this.commitFunction[UNIFORMTYPE_INT] = this.commitFunction[UNIFORMTYPE_BOOL]
        this.commitFunction[UNIFORMTYPE_FLOAT] = function (uniform, value) {
            if (uniform.value !== value) {
                gl.uniform1f(uniform.locationId, value)
                uniform.value = value
            }
        }
        this.commitFunction[UNIFORMTYPE_VEC2] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY) {
                gl.uniform2fv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
            }
        }
        this.commitFunction[UNIFORMTYPE_VEC3] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            scopeZ = value[2]
            if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY || uniformValue[2] !== scopeZ) {
                gl.uniform3fv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
                uniformValue[2] = scopeZ
            }
        }
        this.commitFunction[UNIFORMTYPE_VEC4] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            scopeZ = value[2]
            scopeW = value[3]
            if (
                uniformValue[0] !== scopeX ||
                uniformValue[1] !== scopeY ||
                uniformValue[2] !== scopeZ ||
                uniformValue[3] !== scopeW
            ) {
                gl.uniform4fv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
                uniformValue[2] = scopeZ
                uniformValue[3] = scopeW
            }
        }
        this.commitFunction[UNIFORMTYPE_IVEC2] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY) {
                gl.uniform2iv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
            }
        }
        this.commitFunction[UNIFORMTYPE_BVEC2] = this.commitFunction[UNIFORMTYPE_IVEC2]
        this.commitFunction[UNIFORMTYPE_IVEC3] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            scopeZ = value[2]
            if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY || uniformValue[2] !== scopeZ) {
                gl.uniform3iv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
                uniformValue[2] = scopeZ
            }
        }
        this.commitFunction[UNIFORMTYPE_BVEC3] = this.commitFunction[UNIFORMTYPE_IVEC3]
        this.commitFunction[UNIFORMTYPE_IVEC4] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            scopeZ = value[2]
            scopeW = value[3]
            if (
                uniformValue[0] !== scopeX ||
                uniformValue[1] !== scopeY ||
                uniformValue[2] !== scopeZ ||
                uniformValue[3] !== scopeW
            ) {
                gl.uniform4iv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
                uniformValue[2] = scopeZ
                uniformValue[3] = scopeW
            }
        }
        this.commitFunction[UNIFORMTYPE_BVEC4] = this.commitFunction[UNIFORMTYPE_IVEC4]
        this.commitFunction[UNIFORMTYPE_MAT2] = function (uniform, value) {
            gl.uniformMatrix2fv(uniform.locationId, false, value)
        }
        this.commitFunction[UNIFORMTYPE_MAT3] = function (uniform, value) {
            gl.uniformMatrix3fv(uniform.locationId, false, value)
        }
        this.commitFunction[UNIFORMTYPE_MAT4] = function (uniform, value) {
            gl.uniformMatrix4fv(uniform.locationId, false, value)
        }
        this.commitFunction[UNIFORMTYPE_FLOATARRAY] = function (uniform, value) {
            gl.uniform1fv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_VEC2ARRAY] = function (uniform, value) {
            gl.uniform2fv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_VEC3ARRAY] = function (uniform, value) {
            gl.uniform3fv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_VEC4ARRAY] = function (uniform, value) {
            gl.uniform4fv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_UINT] = function (uniform, value) {
            if (uniform.value !== value) {
                gl.uniform1ui(uniform.locationId, value)
                uniform.value = value
            }
        }
        this.commitFunction[UNIFORMTYPE_UVEC2] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY) {
                gl.uniform2uiv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
            }
        }
        this.commitFunction[UNIFORMTYPE_UVEC3] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            scopeZ = value[2]
            if (uniformValue[0] !== scopeX || uniformValue[1] !== scopeY || uniformValue[2] !== scopeZ) {
                gl.uniform3uiv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
                uniformValue[2] = scopeZ
            }
        }
        this.commitFunction[UNIFORMTYPE_UVEC4] = function (uniform, value) {
            uniformValue = uniform.value
            scopeX = value[0]
            scopeY = value[1]
            scopeZ = value[2]
            scopeW = value[3]
            if (
                uniformValue[0] !== scopeX ||
                uniformValue[1] !== scopeY ||
                uniformValue[2] !== scopeZ ||
                uniformValue[3] !== scopeW
            ) {
                gl.uniform4uiv(uniform.locationId, value)
                uniformValue[0] = scopeX
                uniformValue[1] = scopeY
                uniformValue[2] = scopeZ
                uniformValue[3] = scopeW
            }
        }
        this.commitFunction[UNIFORMTYPE_INTARRAY] = function (uniform, value) {
            gl.uniform1iv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_UINTARRAY] = function (uniform, value) {
            gl.uniform1uiv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_BOOLARRAY] = this.commitFunction[UNIFORMTYPE_INTARRAY]
        this.commitFunction[UNIFORMTYPE_IVEC2ARRAY] = function (uniform, value) {
            gl.uniform2iv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_UVEC2ARRAY] = function (uniform, value) {
            gl.uniform2uiv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_BVEC2ARRAY] = this.commitFunction[UNIFORMTYPE_IVEC2ARRAY]
        this.commitFunction[UNIFORMTYPE_IVEC3ARRAY] = function (uniform, value) {
            gl.uniform3iv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_UVEC3ARRAY] = function (uniform, value) {
            gl.uniform3uiv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_BVEC3ARRAY] = this.commitFunction[UNIFORMTYPE_IVEC3ARRAY]
        this.commitFunction[UNIFORMTYPE_IVEC4ARRAY] = function (uniform, value) {
            gl.uniform4iv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_UVEC4ARRAY] = function (uniform, value) {
            gl.uniform4uiv(uniform.locationId, value)
        }
        this.commitFunction[UNIFORMTYPE_BVEC4ARRAY] = this.commitFunction[UNIFORMTYPE_IVEC4ARRAY]
        this.commitFunction[UNIFORMTYPE_MAT4ARRAY] = function (uniform, value) {
            gl.uniformMatrix4fv(uniform.locationId, false, value)
        }
        this.constantTexSource = this.scope.resolve('source')
        this.postInit()
    }
}

class NullIndexBuffer {
    unlock(indexBuffer) {}
}

class NullRenderTarget {
    destroy(device) {}
    init(device, renderTarget) {}
    loseContext() {}
    resolve(device, target, color, depth) {}
}

class NullShader {
    destroy(shader) {}
    loseContext() {}
    restoreContext(device, shader) {}
}

class NullTexture {
    destroy(device) {}
    propertyChanged(flag) {}
    loseContext() {}
}

class NullVertexBuffer {
    destroy(device) {}
    unlock(vertexBuffer) {}
}

class NullDrawCommands {
    add(i, indexOrVertexCount, instanceCount, firstIndexOrVertex) {}
}

class NullGraphicsDevice extends GraphicsDevice {
    destroy() {
        super.destroy()
    }
    initDeviceCaps() {
        this.disableParticleSystem = true
        this.precision = 'highp'
        this.maxPrecision = 'highp'
        this.maxSamples = 4
        this.maxTextures = 16
        this.maxTextureSize = 4096
        this.maxCubeMapSize = 4096
        this.maxVolumeSize = 4096
        this.maxColorAttachments = 8
        this.maxPixelRatio = 1
        this.maxAnisotropy = 16
        this.supportsUniformBuffers = false
        this.supportsAreaLights = true
        this.supportsGpuParticles = false
        this.textureFloatRenderable = true
        this.textureHalfFloatRenderable = true
        this.supportsImageBitmap = false
    }
    postInit() {
        super.postInit()
    }
    frameStart() {
        super.frameStart()
    }
    frameEnd() {
        super.frameEnd()
    }
    updateBegin() {}
    updateEnd() {}
    readPixels(x, y, w, h, pixels) {}
    createVertexBufferImpl(vertexBuffer, format) {
        return new NullVertexBuffer(vertexBuffer, format)
    }
    createIndexBufferImpl(indexBuffer) {
        return new NullIndexBuffer(indexBuffer)
    }
    createShaderImpl(shader) {
        return new NullShader(shader)
    }
    createTextureImpl(texture) {
        return new NullTexture(texture)
    }
    createRenderTargetImpl(renderTarget) {
        return new NullRenderTarget(renderTarget)
    }
    createDrawCommandImpl(drawCommands) {
        return new NullDrawCommands()
    }
    createUploadStreamImpl(uploadStream) {
        return null
    }
    draw(primitive, indexBuffer, numInstances, drawCommands, first = true, last = true) {}
    setShader(shader, asyncCompile = false) {}
    setBlendState(blendState) {}
    setDepthState(depthState) {}
    setStencilState(stencilFront, stencilBack) {}
    setBlendColor(r, g, b, a) {}
    setCullMode(cullMode) {}
    setFrontFace(frontFace) {}
    setAlphaToCoverage(state) {}
    initializeContextCaches() {
        super.initializeContextCaches()
    }
    clear(options) {}
    setViewport(x, y, w, h) {}
    setScissor(x, y, w, h) {}
    copyRenderTarget(source, dest, color, depth) {
        return true
    }
    constructor(canvas, options = {}) {
        super(canvas, options)
        options = this.initOptions
        this.isNull = true
        this._deviceType = DEVICETYPE_NULL
        this.samples = 1
        this.backBuffer = new RenderTarget({
            name: 'Framebuffer',
            graphicsDevice: this,
            depth: this.initOptions.depth,
            stencil: this.supportsStencil,
            samples: this.samples,
        })
        this.initDeviceCaps()
    }
}

function createGraphicsDevice(canvas, options = {}) {
    const deviceTypes = options.deviceTypes ?? []
    if (!deviceTypes.includes(DEVICETYPE_WEBGL2)) {
        deviceTypes.push(DEVICETYPE_WEBGL2)
    }
    if (!deviceTypes.includes(DEVICETYPE_NULL)) {
        deviceTypes.push(DEVICETYPE_NULL)
    }
    if (platform.browser && !!navigator.xr) {
        var _options
        ;(_options = options).xrCompatible ?? (_options.xrCompatible = true)
    }
    const deviceCreateFuncs = []
    for (let i = 0; i < deviceTypes.length; i++) {
        const deviceType = deviceTypes[i]
        if (deviceType === DEVICETYPE_WEBGPU && window?.navigator?.gpu) {
            deviceCreateFuncs.push(() => {
                const device = new WebgpuGraphicsDevice(canvas, options)
                return device.initWebGpu(options.glslangUrl, options.twgslUrl)
            })
        }
        if (deviceType === DEVICETYPE_WEBGL2) {
            deviceCreateFuncs.push(() => {
                return new WebglGraphicsDevice(canvas, options)
            })
        }
        if (deviceType === DEVICETYPE_NULL) {
            deviceCreateFuncs.push(() => {
                return new NullGraphicsDevice(canvas, options)
            })
        }
    }
    return new Promise((resolve, reject) => {
        let attempt = 0
        const next = () => {
            if (attempt >= deviceCreateFuncs.length) {
                reject(new Error('Failed to create a graphics device'))
            } else {
                Promise.resolve(deviceCreateFuncs[attempt++]())
                    .then((device) => {
                        if (device) {
                            resolve(device)
                        } else {
                            next()
                        }
                    })
                    .catch((err) => {
                        console.log(err)
                        next()
                    })
            }
        }
        next()
    })
}

class ComputeParameter {
    constructor() {
        this.scopeId = null
    }
}
class Compute {
    setParameter(name, value) {
        let param = this.parameters.get(name)
        if (!param) {
            param = new ComputeParameter()
            param.scopeId = this.device.scope.resolve(name)
            this.parameters.set(name, param)
        }
        param.value = value
    }
    getParameter(name) {
        return this.parameters.get(name)?.value
    }
    deleteParameter(name) {
        this.parameters.delete(name)
    }
    applyParameters() {
        for (const [, param] of this.parameters) {
            param.scopeId.setValue(param.value)
        }
    }
    setupDispatch(x, y, z) {
        this.countX = x
        this.countY = y
        this.countZ = z
        this.indirectSlotIndex = -1
        this.indirectBuffer = null
    }
    setupIndirectDispatch(slotIndex, buffer = null) {
        this.indirectSlotIndex = slotIndex
        this.indirectBuffer = buffer
        this.indirectFrameStamp = this.device.renderVersion
    }
    static calcDispatchSize(count, result, maxDimension = 65535) {
        if (count <= maxDimension) {
            return result.set(count, 1)
        }
        const x = Math.floor(Math.sqrt(count))
        return result.set(x, Math.ceil(count / x))
    }
    constructor(graphicsDevice, shader, name = 'Unnamed') {
        this.shader = null
        this.parameters = new Map()
        this.countX = 1
        this.indirectSlotIndex = -1
        this.indirectBuffer = null
        this.indirectFrameStamp = 0
        this.device = graphicsDevice
        this.shader = shader
        this.name = name
        if (graphicsDevice.supportsCompute) {
            this.impl = graphicsDevice.createComputeImpl(this)
        }
    }
}

class DrawCommands {
    get maxCount() {
        return this._maxCount
    }
    get count() {
        return this._count
    }
    destroy() {
        this.impl?.destroy?.()
        this.impl = null
    }
    allocate(maxCount) {
        this._maxCount = maxCount
        this.impl.allocate?.(maxCount)
    }
    add(i, indexOrVertexCount, instanceCount, firstIndexOrVertex, baseVertex = 0, firstInstance = 0) {
        this.impl.add(i, indexOrVertexCount, instanceCount, firstIndexOrVertex, baseVertex, firstInstance)
    }
    update(count) {
        this._count = count
        this.primitiveCount = this.impl.update?.(count) ?? 0
    }
    constructor(device, indexSizeBytes = 0) {
        this._maxCount = 0
        this.impl = null
        this._count = 1
        this.slotIndex = 0
        this.primitiveCount = 0
        this.device = device
        this.indexSizeBytes = indexSizeBytes
        this.impl = device.createDrawCommandImpl(this)
    }
}

class ColorAttachmentOps {
    constructor() {
        this.clearValue = new Color(0, 0, 0, 1)
        this.clearValueLinear = new Color(0, 0, 0, 1)
        this.clear = false
        this.store = false
        this.resolve = true
        this.genMipmaps = false
    }
}
class DepthStencilAttachmentOps {
    constructor() {
        this.clearDepthValue = 1
        this.clearStencilValue = 0
        this.clearDepth = false
        this.clearStencil = false
        this.storeDepth = false
        this.resolveDepth = false
        this.storeStencil = false
    }
}
class RenderPass {
    get colorOps() {
        return this.colorArrayOps[0]
    }
    set name(value) {
        this._name = value
    }
    get name() {
        if (!this._name) {
            this._name = this.constructor.name
        }
        return this._name
    }
    set scaleX(value) {
        this._options.scaleX = value
    }
    get scaleX() {
        return this._options.scaleX
    }
    set scaleY(value) {
        this._options.scaleY = value
    }
    get scaleY() {
        return this._options.scaleY
    }
    set options(value) {
        this._options = value
        if (value) {
            this.scaleX = this.scaleX ?? 1
            this.scaleY = this.scaleY ?? 1
        }
    }
    get options() {
        return this._options
    }
    init(renderTarget = null, options) {
        this.options = options
        this.renderTarget = renderTarget
        this.samples = Math.max(this.renderTarget ? this.renderTarget.samples : this.device.samples, 1)
        this.allocateAttachments()
        this.postInit()
    }
    allocateAttachments() {
        const rt = this.renderTarget
        this.depthStencilOps = new DepthStencilAttachmentOps()
        if (rt?.depthBuffer) {
            this.depthStencilOps.storeDepth = true
        }
        const numColorOps = rt ? (rt._colorBuffers?.length ?? 0) : 1
        this.colorArrayOps.length = 0
        for (let i = 0; i < numColorOps; i++) {
            const colorOps = new ColorAttachmentOps()
            this.colorArrayOps[i] = colorOps
            if (this.samples === 1) {
                colorOps.store = true
                colorOps.resolve = false
            }
            const colorBuffer = this.renderTarget?._colorBuffers?.[i]
            if (this.renderTarget?.mipmaps && colorBuffer?.mipmaps) {
                const intFormat = isIntegerPixelFormat(colorBuffer._format)
                colorOps.genMipmaps = !intFormat
            }
        }
    }
    destroy() {}
    postInit() {}
    frameUpdate() {
        if (this._options && this.renderTarget) {
            const resizeSource = this._options.resizeSource ?? this.device.backBuffer
            const width = Math.floor(resizeSource.width * this.scaleX)
            const height = Math.floor(resizeSource.height * this.scaleY)
            this.renderTarget.resize(width, height)
        }
    }
    before() {}
    execute() {}
    after() {}
    onEnable() {}
    onDisable() {}
    set enabled(value) {
        if (this._enabled !== value) {
            this._enabled = value
            if (value) {
                this.onEnable()
            } else {
                this.onDisable()
            }
        }
    }
    get enabled() {
        return this._enabled
    }
    setClearColor(color) {
        const count = this.colorArrayOps.length
        for (let i = 0; i < count; i++) {
            const colorOps = this.colorArrayOps[i]
            if (color) {
                colorOps.clearValue.copy(color)
                colorOps.clearValueLinear.linear(color)
            }
            colorOps.clear = !!color
        }
    }
    setClearDepth(depthValue) {
        if (depthValue !== undefined) {
            this.depthStencilOps.clearDepthValue = depthValue
        }
        this.depthStencilOps.clearDepth = depthValue !== undefined
    }
    setClearStencil(stencilValue) {
        if (stencilValue !== undefined) {
            this.depthStencilOps.clearStencilValue = stencilValue
        }
        this.depthStencilOps.clearStencil = stencilValue !== undefined
    }
    render() {
        if (this.enabled) {
            const device = this.device
            const realPass = this.renderTarget !== undefined
            this.before()
            if (this.executeEnabled) {
                if (realPass && !this._skipStart) {
                    device.startRenderPass(this)
                }
                this.execute()
                if (realPass && !this._skipEnd) {
                    device.endRenderPass(this)
                }
            }
            this.after()
            device.renderPassIndex++
        }
    }
    constructor(graphicsDevice) {
        this._enabled = true
        this._skipStart = false
        this._skipEnd = false
        this.executeEnabled = true
        this.samples = 0
        this.colorArrayOps = []
        this.requiresCubemaps = true
        this.fullSizeClearRect = true
        this.beforePasses = []
        this.afterPasses = []
        this.device = graphicsDevice
    }
}

function set1(a) {
    this.array[this.index] = a
}
function set2(a, b) {
    this.array[this.index] = a
    this.array[this.index + 1] = b
}
function set3(a, b, c) {
    this.array[this.index] = a
    this.array[this.index + 1] = b
    this.array[this.index + 2] = c
}
function set4(a, b, c, d) {
    this.array[this.index] = a
    this.array[this.index + 1] = b
    this.array[this.index + 2] = c
    this.array[this.index + 3] = d
}
function arraySet1(index, inputArray, inputIndex) {
    this.array[index] = inputArray[inputIndex]
}
function arraySet2(index, inputArray, inputIndex) {
    this.array[index] = inputArray[inputIndex]
    this.array[index + 1] = inputArray[inputIndex + 1]
}
function arraySet3(index, inputArray, inputIndex) {
    this.array[index] = inputArray[inputIndex]
    this.array[index + 1] = inputArray[inputIndex + 1]
    this.array[index + 2] = inputArray[inputIndex + 2]
}
function arraySet4(index, inputArray, inputIndex) {
    this.array[index] = inputArray[inputIndex]
    this.array[index + 1] = inputArray[inputIndex + 1]
    this.array[index + 2] = inputArray[inputIndex + 2]
    this.array[index + 3] = inputArray[inputIndex + 3]
}
function arrayGet1(offset, outputArray, outputIndex) {
    outputArray[outputIndex] = this.array[offset]
}
function arrayGet2(offset, outputArray, outputIndex) {
    outputArray[outputIndex] = this.array[offset]
    outputArray[outputIndex + 1] = this.array[offset + 1]
}
function arrayGet3(offset, outputArray, outputIndex) {
    outputArray[outputIndex] = this.array[offset]
    outputArray[outputIndex + 1] = this.array[offset + 1]
    outputArray[outputIndex + 2] = this.array[offset + 2]
}
function arrayGet4(offset, outputArray, outputIndex) {
    outputArray[outputIndex] = this.array[offset]
    outputArray[outputIndex + 1] = this.array[offset + 1]
    outputArray[outputIndex + 2] = this.array[offset + 2]
    outputArray[outputIndex + 3] = this.array[offset + 3]
}
class VertexIteratorAccessor {
    get(offset) {
        return this.array[this.index + offset]
    }
    set(a, b, c, d) {}
    getToArray(offset, outputArray, outputIndex) {}
    setFromArray(index, inputArray, inputIndex) {}
    constructor(buffer, vertexElement, vertexFormat) {
        this.index = 0
        this.numComponents = vertexElement.numComponents
        if (vertexFormat.interleaved) {
            this.array = new typedArrayTypes[vertexElement.dataType](buffer, vertexElement.offset)
        } else {
            this.array = new typedArrayTypes[vertexElement.dataType](
                buffer,
                vertexElement.offset,
                vertexFormat.vertexCount * vertexElement.numComponents,
            )
        }
        this.stride = vertexElement.stride / this.array.constructor.BYTES_PER_ELEMENT
        switch (vertexElement.numComponents) {
            case 1:
                this.set = set1
                this.getToArray = arrayGet1
                this.setFromArray = arraySet1
                break
            case 2:
                this.set = set2
                this.getToArray = arrayGet2
                this.setFromArray = arraySet2
                break
            case 3:
                this.set = set3
                this.getToArray = arrayGet3
                this.setFromArray = arraySet3
                break
            case 4:
                this.set = set4
                this.getToArray = arrayGet4
                this.setFromArray = arraySet4
                break
        }
    }
}
class VertexIterator {
    next(count = 1) {
        let i = 0
        const accessors = this.accessors
        const numAccessors = this.accessors.length
        while (i < numAccessors) {
            const accessor = accessors[i++]
            accessor.index += count * accessor.stride
        }
    }
    end() {
        this.vertexBuffer.unlock()
    }
    writeData(semantic, data, numVertices) {
        const element = this.element[semantic]
        if (element) {
            if (numVertices > this.vertexBuffer.numVertices) {
                numVertices = this.vertexBuffer.numVertices
            }
            const numComponents = element.numComponents
            if (this.vertexBuffer.getFormat().interleaved) {
                let index = 0
                for (let i = 0; i < numVertices; i++) {
                    element.setFromArray(index, data, i * numComponents)
                    index += element.stride
                }
            } else {
                if (data.length > numVertices * numComponents) {
                    const copyCount = numVertices * numComponents
                    if (ArrayBuffer.isView(data)) {
                        data = data.subarray(0, copyCount)
                        element.array.set(data)
                    } else {
                        for (let i = 0; i < copyCount; i++) {
                            element.array[i] = data[i]
                        }
                    }
                } else {
                    element.array.set(data)
                }
            }
        }
    }
    readData(semantic, data) {
        const element = this.element[semantic]
        let count = 0
        if (element) {
            count = this.vertexBuffer.numVertices
            let i
            const numComponents = element.numComponents
            if (this.vertexBuffer.getFormat().interleaved) {
                if (Array.isArray(data)) {
                    data.length = 0
                }
                element.index = 0
                let offset = 0
                for (i = 0; i < count; i++) {
                    element.getToArray(offset, data, i * numComponents)
                    offset += element.stride
                }
            } else {
                if (ArrayBuffer.isView(data)) {
                    data.set(element.array)
                } else {
                    data.length = 0
                    const copyCount = count * numComponents
                    for (i = 0; i < copyCount; i++) {
                        data[i] = element.array[i]
                    }
                }
            }
        }
        return count
    }
    constructor(vertexBuffer) {
        this.vertexBuffer = vertexBuffer
        this.vertexFormatSize = vertexBuffer.getFormat().size
        this.buffer = this.vertexBuffer.lock()
        this.accessors = []
        this.element = {}
        const vertexFormat = this.vertexBuffer.getFormat()
        for (let i = 0; i < vertexFormat.elements.length; i++) {
            const vertexElement = vertexFormat.elements[i]
            this.accessors[i] = new VertexIteratorAccessor(this.buffer, vertexElement, vertexFormat)
            this.element[vertexElement.name] = this.accessors[i]
        }
    }
}

const MOUSEBUTTON_NONE = -1

class KeyboardEvent {
    constructor(keyboard, event) {
        this.key = null
        this.element = null
        this.event = null
        if (event) {
            this.key = event.keyCode
            this.element = event.target
            this.event = event
        }
    }
}

const _keyboardEvent = new KeyboardEvent()
function makeKeyboardEvent(event) {
    _keyboardEvent.key = event.keyCode
    _keyboardEvent.element = event.target
    _keyboardEvent.event = event
    return _keyboardEvent
}
function toKeyCode(s) {
    if (typeof s === 'string') {
        return s.toUpperCase().charCodeAt(0)
    }
    return s
}
const _keyCodeToKeyIdentifier = {
    9: 'Tab',
    13: 'Enter',
    16: 'Shift',
    17: 'Control',
    18: 'Alt',
    27: 'Escape',
    37: 'Left',
    38: 'Up',
    39: 'Right',
    40: 'Down',
    46: 'Delete',
    91: 'Win',
}
class Keyboard extends EventHandler {
    attach(element) {
        if (this._element) {
            this.detach()
        }
        this._element = element
        this._element.addEventListener('keydown', this._keyDownHandler, false)
        this._element.addEventListener('keypress', this._keyPressHandler, false)
        this._element.addEventListener('keyup', this._keyUpHandler, false)
        document.addEventListener('visibilitychange', this._visibilityChangeHandler, false)
        window.addEventListener('blur', this._windowBlurHandler, false)
    }
    detach() {
        if (!this._element) {
            return
        }
        this._element.removeEventListener('keydown', this._keyDownHandler)
        this._element.removeEventListener('keypress', this._keyPressHandler)
        this._element.removeEventListener('keyup', this._keyUpHandler)
        this._element = null
        document.removeEventListener('visibilitychange', this._visibilityChangeHandler, false)
        window.removeEventListener('blur', this._windowBlurHandler, false)
    }
    toKeyIdentifier(keyCode) {
        keyCode = toKeyCode(keyCode)
        const id = _keyCodeToKeyIdentifier[keyCode.toString()]
        if (id) {
            return id
        }
        let hex = keyCode.toString(16).toUpperCase()
        const length = hex.length
        for (let count = 0; count < 4 - length; count++) {
            hex = `0${hex}`
        }
        return `U+${hex}`
    }
    _handleKeyDown(event) {
        const code = event.keyCode || event.charCode
        if (code === undefined) return
        const id = this.toKeyIdentifier(code)
        this._keymap[id] = true
        this.fire('keydown', makeKeyboardEvent(event))
        if (this.preventDefault) {
            event.preventDefault()
        }
        if (this.stopPropagation) {
            event.stopPropagation()
        }
    }
    _handleKeyUp(event) {
        const code = event.keyCode || event.charCode
        if (code === undefined) return
        const id = this.toKeyIdentifier(code)
        delete this._keymap[id]
        this.fire('keyup', makeKeyboardEvent(event))
        if (this.preventDefault) {
            event.preventDefault()
        }
        if (this.stopPropagation) {
            event.stopPropagation()
        }
    }
    _handleKeyPress(event) {
        this.fire('keypress', makeKeyboardEvent(event))
        if (this.preventDefault) {
            event.preventDefault()
        }
        if (this.stopPropagation) {
            event.stopPropagation()
        }
    }
    _handleVisibilityChange() {
        if (document.visibilityState === 'hidden') {
            this._handleWindowBlur()
        }
    }
    _handleWindowBlur() {
        this._keymap = {}
        this._lastmap = {}
    }
    update() {
        for (const prop in this._lastmap) {
            delete this._lastmap[prop]
        }
        for (const prop in this._keymap) {
            if (this._keymap.hasOwnProperty(prop)) {
                this._lastmap[prop] = this._keymap[prop]
            }
        }
    }
    isPressed(key) {
        const keyCode = toKeyCode(key)
        const id = this.toKeyIdentifier(keyCode)
        return !!this._keymap[id]
    }
    wasPressed(key) {
        const keyCode = toKeyCode(key)
        const id = this.toKeyIdentifier(keyCode)
        return !!this._keymap[id] && !!!this._lastmap[id]
    }
    wasReleased(key) {
        const keyCode = toKeyCode(key)
        const id = this.toKeyIdentifier(keyCode)
        return !!!this._keymap[id] && !!this._lastmap[id]
    }
    constructor(element, options = {}) {
        ;(super(), (this._element = null), (this._keymap = {}), (this._lastmap = {}))
        this._keyDownHandler = this._handleKeyDown.bind(this)
        this._keyUpHandler = this._handleKeyUp.bind(this)
        this._keyPressHandler = this._handleKeyPress.bind(this)
        this._visibilityChangeHandler = this._handleVisibilityChange.bind(this)
        this._windowBlurHandler = this._handleWindowBlur.bind(this)
        if (element) {
            this.attach(element)
        }
        this.preventDefault = options.preventDefault || false
        this.stopPropagation = options.stopPropagation || false
    }
}
Keyboard.EVENT_KEYDOWN = 'keydown'
Keyboard.EVENT_KEYUP = 'keyup'

function isMousePointerLocked() {
    return !!(document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement)
}
class MouseEvent {
    constructor(mouse, event) {
        this.x = 0
        this.y = 0
        this.dx = 0
        this.dy = 0
        this.button = MOUSEBUTTON_NONE
        this.wheelDelta = 0
        this.ctrlKey = false
        this.altKey = false
        this.shiftKey = false
        this.metaKey = false
        let coords = {
            x: 0,
            y: 0,
        }
        if (event) {
            if (event instanceof MouseEvent) {
                throw Error('Expected MouseEvent')
            }
            coords = mouse._getTargetCoords(event)
        } else {
            event = {}
        }
        if (coords) {
            this.x = coords.x
            this.y = coords.y
        } else if (isMousePointerLocked()) {
            this.x = 0
            this.y = 0
        } else {
            return
        }
        if (event.type === 'wheel') {
            if (event.deltaY > 0) {
                this.wheelDelta = 1
            } else if (event.deltaY < 0) {
                this.wheelDelta = -1
            }
        }
        if (isMousePointerLocked()) {
            this.dx = event.movementX || event.webkitMovementX || event.mozMovementX || 0
            this.dy = event.movementY || event.webkitMovementY || event.mozMovementY || 0
        } else {
            this.dx = this.x - mouse._lastX
            this.dy = this.y - mouse._lastY
        }
        if (event.type === 'mousedown' || event.type === 'mouseup') {
            this.button = event.button
        }
        this.buttons = mouse._buttons.slice(0)
        this.element = event.target
        this.ctrlKey = event.ctrlKey ?? false
        this.altKey = event.altKey ?? false
        this.shiftKey = event.shiftKey ?? false
        this.metaKey = event.metaKey ?? false
        this.event = event
    }
}

class Mouse extends EventHandler {
    static isPointerLocked() {
        return isMousePointerLocked()
    }
    attach(element) {
        this._target = element
        if (this._attached) return
        this._attached = true
        const passiveOptions = {
            passive: false,
        }
        const options = platform.passiveEvents ? passiveOptions : false
        window.addEventListener('mouseup', this._upHandler, options)
        window.addEventListener('mousedown', this._downHandler, options)
        window.addEventListener('mousemove', this._moveHandler, options)
        window.addEventListener('wheel', this._wheelHandler, options)
    }
    detach() {
        if (!this._attached) return
        this._attached = false
        this._target = null
        const passiveOptions = {
            passive: false,
        }
        const options = platform.passiveEvents ? passiveOptions : false
        window.removeEventListener('mouseup', this._upHandler, options)
        window.removeEventListener('mousedown', this._downHandler, options)
        window.removeEventListener('mousemove', this._moveHandler, options)
        window.removeEventListener('wheel', this._wheelHandler, options)
    }
    disableContextMenu() {
        if (!this._target) return
        this._target.addEventListener('contextmenu', this._contextMenuHandler)
    }
    enableContextMenu() {
        if (!this._target) return
        this._target.removeEventListener('contextmenu', this._contextMenuHandler)
    }
    enablePointerLock(success, error) {
        if (!document.body.requestPointerLock) {
            if (error) {
                error()
            }
            return
        }
        const s = () => {
            success()
            document.removeEventListener('pointerlockchange', s)
        }
        const e = () => {
            error()
            document.removeEventListener('pointerlockerror', e)
        }
        if (success) {
            document.addEventListener('pointerlockchange', s, false)
        }
        if (error) {
            document.addEventListener('pointerlockerror', e, false)
        }
        document.body.requestPointerLock()
    }
    disablePointerLock(success) {
        if (!document.exitPointerLock) {
            return
        }
        const s = () => {
            success()
            document.removeEventListener('pointerlockchange', s)
        }
        if (success) {
            document.addEventListener('pointerlockchange', s, false)
        }
        document.exitPointerLock()
    }
    update() {
        this._lastbuttons[0] = this._buttons[0]
        this._lastbuttons[1] = this._buttons[1]
        this._lastbuttons[2] = this._buttons[2]
    }
    isPressed(button) {
        return this._buttons[button]
    }
    wasPressed(button) {
        return this._buttons[button] && !this._lastbuttons[button]
    }
    wasReleased(button) {
        return !this._buttons[button] && this._lastbuttons[button]
    }
    _handleUp(event) {
        this._buttons[event.button] = false
        const e = new MouseEvent(this, event)
        if (!e.event) return
        this.fire('mouseup', e)
    }
    _handleDown(event) {
        this._buttons[event.button] = true
        const e = new MouseEvent(this, event)
        if (!e.event) return
        this.fire('mousedown', e)
    }
    _handleMove(event) {
        const e = new MouseEvent(this, event)
        if (!e.event) return
        this.fire('mousemove', e)
        this._lastX = e.x
        this._lastY = e.y
    }
    _handleWheel(event) {
        const e = new MouseEvent(this, event)
        if (!e.event) return
        this.fire('mousewheel', e)
    }
    _getTargetCoords(event) {
        const rect = this._target.getBoundingClientRect()
        const left = Math.floor(rect.left)
        const top = Math.floor(rect.top)
        if (
            event.clientX < left ||
            event.clientX >= left + this._target.clientWidth ||
            event.clientY < top ||
            event.clientY >= top + this._target.clientHeight
        ) {
            return null
        }
        return {
            x: event.clientX - left,
            y: event.clientY - top,
        }
    }
    constructor(element) {
        ;(super(),
            (this._lastX = 0),
            (this._lastY = 0),
            (this._buttons = [false, false, false]),
            (this._lastbuttons = [false, false, false]),
            (this._target = null),
            (this._attached = false))
        this._upHandler = this._handleUp.bind(this)
        this._downHandler = this._handleDown.bind(this)
        this._moveHandler = this._handleMove.bind(this)
        this._wheelHandler = this._handleWheel.bind(this)
        this._contextMenuHandler = (event) => {
            event.preventDefault()
        }
        this.attach(element)
    }
}
Mouse.EVENT_MOUSEMOVE = 'mousemove'
Mouse.EVENT_MOUSEDOWN = 'mousedown'
Mouse.EVENT_MOUSEUP = 'mouseup'
Mouse.EVENT_MOUSEWHEEL = 'mousewheel'

function getTouchTargetCoords(touch) {
    let totalOffsetX = 0
    let totalOffsetY = 0
    let target = touch.target
    while (!(target instanceof HTMLElement) && target) {
        target = target.parentNode
    }
    while (target) {
        totalOffsetX += target.offsetLeft - target.scrollLeft
        totalOffsetY += target.offsetTop - target.scrollTop
        target = target.offsetParent
    }
    return {
        x: touch.pageX - totalOffsetX,
        y: touch.pageY - totalOffsetY,
    }
}
class Touch {
    constructor(touch) {
        const coords = getTouchTargetCoords(touch)
        this.id = touch.identifier
        this.x = coords.x
        this.y = coords.y
        this.target = touch.target
        this.touch = touch
    }
}
class TouchEvent {
    getTouchById(id, list) {
        return list.find((touch) => touch.id === id) || null
    }
    constructor(device, event) {
        this.touches = []
        this.changedTouches = []
        this.element = event.target
        this.event = event
        this.touches = Array.from(event.touches).map((touch) => new Touch(touch))
        this.changedTouches = Array.from(event.changedTouches).map((touch) => new Touch(touch))
    }
}

class TouchDevice extends EventHandler {
    attach(element) {
        if (this._element) {
            this.detach()
        }
        this._element = element
        this._element.addEventListener('touchstart', this._startHandler, false)
        this._element.addEventListener('touchend', this._endHandler, false)
        this._element.addEventListener('touchmove', this._moveHandler, false)
        this._element.addEventListener('touchcancel', this._cancelHandler, false)
    }
    detach() {
        if (this._element) {
            this._element.removeEventListener('touchstart', this._startHandler, false)
            this._element.removeEventListener('touchend', this._endHandler, false)
            this._element.removeEventListener('touchmove', this._moveHandler, false)
            this._element.removeEventListener('touchcancel', this._cancelHandler, false)
        }
        this._element = null
    }
    _handleTouchStart(e) {
        this.fire('touchstart', new TouchEvent(this, e))
    }
    _handleTouchEnd(e) {
        this.fire('touchend', new TouchEvent(this, e))
    }
    _handleTouchMove(e) {
        e.preventDefault()
        this.fire('touchmove', new TouchEvent(this, e))
    }
    _handleTouchCancel(e) {
        this.fire('touchcancel', new TouchEvent(this, e))
    }
    constructor(element) {
        super()
        this._element = null
        this._startHandler = this._handleTouchStart.bind(this)
        this._endHandler = this._handleTouchEnd.bind(this)
        this._moveHandler = this._handleTouchMove.bind(this)
        this._cancelHandler = this._handleTouchCancel.bind(this)
        this.attach(element)
    }
}
TouchDevice.EVENT_TOUCHSTART = 'touchstart'
TouchDevice.EVENT_TOUCHEND = 'touchend'
TouchDevice.EVENT_TOUCHMOVE = 'touchmove'
TouchDevice.EVENT_TOUCHCANCEL = 'touchcancel'

class Http {
    get(url, options, callback) {
        if (typeof options === 'function') {
            callback = options
            options = {}
        }
        const result = this.request('GET', url, options, callback)
        const { progress } = options
        if (progress) {
            const handler = (event) => {
                if (event.lengthComputable) {
                    progress.fire('progress', event.loaded, event.total)
                }
            }
            const endHandler = (event) => {
                handler(event)
                result.removeEventListener('loadstart', handler)
                result.removeEventListener('progress', handler)
                result.removeEventListener('loadend', endHandler)
            }
            result.addEventListener('loadstart', handler)
            result.addEventListener('progress', handler)
            result.addEventListener('loadend', endHandler)
        }
        return result
    }
    post(url, data, options, callback) {
        if (typeof options === 'function') {
            callback = options
            options = {}
        }
        options.postdata = data
        return this.request('POST', url, options, callback)
    }
    put(url, data, options, callback) {
        if (typeof options === 'function') {
            callback = options
            options = {}
        }
        options.postdata = data
        return this.request('PUT', url, options, callback)
    }
    del(url, options, callback) {
        if (typeof options === 'function') {
            callback = options
            options = {}
        }
        return this.request('DELETE', url, options, callback)
    }
    request(method, url, options, callback) {
        let uri, query, postdata
        let errored = false
        if (typeof options === 'function') {
            callback = options
            options = {}
        }
        if (options.retry) {
            options = Object.assign(
                {
                    retries: 0,
                    maxRetries: 5,
                },
                options,
            )
        }
        options.callback = callback
        if (options.async == null) {
            options.async = true
        }
        if (options.headers == null) {
            options.headers = {}
        }
        if (options.postdata != null) {
            if (options.postdata instanceof Document) {
                postdata = options.postdata
            } else if (options.postdata instanceof FormData) {
                postdata = options.postdata
            } else if (options.postdata instanceof Object) {
                let contentType = options.headers['Content-Type']
                if (contentType === undefined) {
                    options.headers['Content-Type'] = Http.ContentType.FORM_URLENCODED
                    contentType = options.headers['Content-Type']
                }
                switch (contentType) {
                    case Http.ContentType.FORM_URLENCODED: {
                        postdata = ''
                        let bFirstItem = true
                        for (const key in options.postdata) {
                            if (options.postdata.hasOwnProperty(key)) {
                                if (bFirstItem) {
                                    bFirstItem = false
                                } else {
                                    postdata += '&'
                                }
                                const encodedKey = encodeURIComponent(key)
                                const encodedValue = encodeURIComponent(options.postdata[key])
                                postdata += `${encodedKey}=${encodedValue}`
                            }
                        }
                        break
                    }
                    default:
                    case Http.ContentType.JSON:
                        if (contentType == null) {
                            options.headers['Content-Type'] = Http.ContentType.JSON
                        }
                        postdata = JSON.stringify(options.postdata)
                        break
                }
            } else {
                postdata = options.postdata
            }
        }
        if (options.cache === false) {
            const timestamp = now()
            uri = new URI(url)
            if (!uri.query) {
                uri.query = `ts=${timestamp}`
            } else {
                uri.query = `${uri.query}&ts=${timestamp}`
            }
            url = uri.toString()
        }
        if (options.query) {
            uri = new URI(url)
            query = extend(uri.getQuery(), options.query)
            uri.setQuery(query)
            url = uri.toString()
        }
        const xhr = new XMLHttpRequest()
        xhr.open(method, url, options.async)
        xhr.withCredentials = options.withCredentials !== undefined ? options.withCredentials : false
        xhr.responseType = options.responseType || this._guessResponseType(url)
        for (const header in options.headers) {
            if (options.headers.hasOwnProperty(header)) {
                xhr.setRequestHeader(header, options.headers[header])
            }
        }
        xhr.onreadystatechange = () => {
            this._onReadyStateChange(method, url, options, xhr)
        }
        xhr.onerror = () => {
            this._onError(method, url, options, xhr)
            errored = true
        }
        try {
            xhr.send(postdata)
        } catch (e) {
            if (!errored) {
                options.error(xhr.status, xhr, e)
            }
        }
        return xhr
    }
    _guessResponseType(url) {
        const uri = new URI(url)
        const ext = path.getExtension(uri.path).toLowerCase()
        if (Http.binaryExtensions.indexOf(ext) >= 0) {
            return Http.ResponseType.ARRAY_BUFFER
        } else if (ext === '.json') {
            return Http.ResponseType.JSON
        } else if (ext === '.xml') {
            return Http.ResponseType.DOCUMENT
        }
        return Http.ResponseType.TEXT
    }
    _isBinaryContentType(contentType) {
        const binTypes = [
            Http.ContentType.BASIS,
            Http.ContentType.BIN,
            Http.ContentType.DDS,
            Http.ContentType.GLB,
            Http.ContentType.MP3,
            Http.ContentType.MP4,
            Http.ContentType.OGG,
            Http.ContentType.OPUS,
            Http.ContentType.WAV,
        ]
        if (binTypes.indexOf(contentType) >= 0) {
            return true
        }
        return false
    }
    _isBinaryResponseType(responseType) {
        return (
            responseType === Http.ResponseType.ARRAY_BUFFER ||
            responseType === Http.ResponseType.BLOB ||
            responseType === Http.ResponseType.JSON
        )
    }
    _onReadyStateChange(method, url, options, xhr) {
        if (xhr.readyState === 4) {
            switch (xhr.status) {
                case 0: {
                    if (xhr.responseURL && xhr.responseURL.startsWith('file:///')) {
                        this._onSuccess(method, url, options, xhr)
                    } else {
                        this._onError(method, url, options, xhr)
                    }
                    break
                }
                case 200:
                case 201:
                case 206:
                case 304: {
                    this._onSuccess(method, url, options, xhr)
                    break
                }
                default: {
                    this._onError(method, url, options, xhr)
                    break
                }
            }
        }
    }
    _onSuccess(method, url, options, xhr) {
        let response
        let contentType
        const header = xhr.getResponseHeader('Content-Type')
        if (header) {
            const parts = header.split(';')
            contentType = parts[0].trim()
        }
        try {
            if (this._isBinaryContentType(contentType) || this._isBinaryResponseType(xhr.responseType)) {
                response = xhr.response
            } else if (contentType === Http.ContentType.JSON || url.split('?')[0].endsWith('.json')) {
                response = JSON.parse(xhr.responseText)
            } else if (xhr.responseType === Http.ResponseType.DOCUMENT || contentType === Http.ContentType.XML) {
                response = xhr.responseXML
            } else {
                response = xhr.responseText
            }
            options.callback(null, response)
        } catch (err) {
            options.callback(err)
        }
    }
    _onError(method, url, options, xhr) {
        if (options.retrying) {
            return
        }
        if (options.retry && options.retries < options.maxRetries) {
            options.retries++
            options.retrying = true
            const retryDelay = math.clamp(
                Math.pow(2, options.retries) * Http.retryDelay,
                0,
                options.maxRetryDelay || 5000,
            )
            console.log(`${method}: ${url} - Error ${xhr.status}. Retrying in ${retryDelay} ms`)
            setTimeout(() => {
                options.retrying = false
                this.request(method, url, options, options.callback)
            }, retryDelay)
        } else {
            options.callback(xhr.status === 0 ? 'Network error' : xhr.status, null)
        }
    }
}
Http.ContentType = {
    AAC: 'audio/aac',
    BASIS: 'image/basis',
    BIN: 'application/octet-stream',
    DDS: 'image/dds',
    FORM_URLENCODED: 'application/x-www-form-urlencoded',
    GIF: 'image/gif',
    GLB: 'model/gltf-binary',
    JPEG: 'image/jpeg',
    JSON: 'application/json',
    MP3: 'audio/mpeg',
    MP4: 'audio/mp4',
    OGG: 'audio/ogg',
    OPUS: 'audio/ogg; codecs="opus"',
    PNG: 'image/png',
    TEXT: 'text/plain',
    WAV: 'audio/x-wav',
    XML: 'application/xml',
}
Http.ResponseType = {
    TEXT: 'text',
    ARRAY_BUFFER: 'arraybuffer',
    BLOB: 'blob',
    DOCUMENT: 'document',
    JSON: 'json',
}
Http.binaryExtensions = ['.model', '.wav', '.ogg', '.mp3', '.mp4', '.m4a', '.aac', '.dds', '.basis', '.glb', '.opus']
Http.retryDelay = 100
const http = new Http()

const BLEND_SUBTRACTIVE = 0
const BLEND_ADDITIVE = 1
const BLEND_NORMAL = 2
const BLEND_NONE = 3
const BLEND_PREMULTIPLIED = 4
const BLEND_MULTIPLICATIVE = 5
const BLEND_ADDITIVEALPHA = 6
const BLEND_MULTIPLICATIVE2X = 7
const BLEND_SCREEN = 8
const BLEND_MIN = 9
const BLEND_MAX = 10
const blendNames = {
    [BLEND_SUBTRACTIVE]: 'SUBTRACTIVE',
    [BLEND_ADDITIVE]: 'ADDITIVE',
    [BLEND_NORMAL]: 'NORMAL',
    [BLEND_NONE]: 'NONE',
    [BLEND_PREMULTIPLIED]: 'PREMULTIPLIED',
    [BLEND_MULTIPLICATIVE]: 'MULTIPLICATIVE',
    [BLEND_ADDITIVEALPHA]: 'ADDITIVEALPHA',
    [BLEND_MULTIPLICATIVE2X]: 'MULTIPLICATIVE2X',
    [BLEND_SCREEN]: 'SCREEN',
    [BLEND_MIN]: 'MIN',
    [BLEND_MAX]: 'MAX',
}
const FOG_NONE = 'none'
const FOG_LINEAR = 'linear'
const FRESNEL_NONE = 0
const FRESNEL_SCHLICK = 2
const fresnelNames = {
    [FRESNEL_NONE]: 'NONE',
    [FRESNEL_SCHLICK]: 'SCHLICK',
}
const LAYER_WORLD = 15
const LAYERID_WORLD = 0
const LAYERID_DEPTH = 1
const LAYERID_SKYBOX = 2
const LAYERID_IMMEDIATE = 3
const LAYERID_UI = 4
const LIGHTTYPE_DIRECTIONAL = 0
const LIGHTTYPE_OMNI = 1
const LIGHTTYPE_SPOT = 2
const lightTypeNames = {
    [LIGHTTYPE_DIRECTIONAL]: 'DIRECTIONAL',
    [LIGHTTYPE_OMNI]: 'OMNI',
    [LIGHTTYPE_SPOT]: 'SPOT',
}
const LIGHT_COLOR_DIVIDER = 100
const LIGHTSHAPE_PUNCTUAL = 0
const LIGHTSHAPE_RECT = 1
const LIGHTSHAPE_DISK = 2
const LIGHTSHAPE_SPHERE = 3
const lightShapeNames = {
    [LIGHTSHAPE_PUNCTUAL]: 'PUNCTUAL',
    [LIGHTSHAPE_RECT]: 'RECT',
    [LIGHTSHAPE_DISK]: 'DISK',
    [LIGHTSHAPE_SPHERE]: 'SPHERE',
}
const LIGHTFALLOFF_LINEAR = 0
const LIGHTFALLOFF_INVERSESQUARED = 1
const lightFalloffNames = {
    [LIGHTFALLOFF_LINEAR]: 'LINEAR',
    [LIGHTFALLOFF_INVERSESQUARED]: 'INVERSESQUARED',
}
const SHADOW_PCF3_32F = 0
const SHADOW_VSM_16F = 2
const SHADOW_VSM_32F = 3
const SHADOW_PCF5_32F = 4
const SHADOW_PCF1_32F = 5
const SHADOW_PCSS_32F = 6
const SHADOW_PCF1_16F = 7
const SHADOW_PCF3_16F = 8
const SHADOW_PCF5_16F = 9
const shadowTypeInfo = new Map([
    [
        SHADOW_PCF1_32F,
        {
            name: 'PCF1_32F',
            kind: 'PCF1',
            format: PIXELFORMAT_DEPTH,
            pcf: true,
        },
    ],
    [
        SHADOW_PCF3_32F,
        {
            name: 'PCF3_32F',
            kind: 'PCF3',
            format: PIXELFORMAT_DEPTH,
            pcf: true,
        },
    ],
    [
        SHADOW_PCF5_32F,
        {
            name: 'PCF5_32F',
            kind: 'PCF5',
            format: PIXELFORMAT_DEPTH,
            pcf: true,
        },
    ],
    [
        SHADOW_PCF1_16F,
        {
            name: 'PCF1_16F',
            kind: 'PCF1',
            format: PIXELFORMAT_DEPTH16,
            pcf: true,
        },
    ],
    [
        SHADOW_PCF3_16F,
        {
            name: 'PCF3_16F',
            kind: 'PCF3',
            format: PIXELFORMAT_DEPTH16,
            pcf: true,
        },
    ],
    [
        SHADOW_PCF5_16F,
        {
            name: 'PCF5_16F',
            kind: 'PCF5',
            format: PIXELFORMAT_DEPTH16,
            pcf: true,
        },
    ],
    [
        SHADOW_VSM_16F,
        {
            name: 'VSM_16F',
            kind: 'VSM',
            format: PIXELFORMAT_RGBA16F,
            vsm: true,
        },
    ],
    [
        SHADOW_VSM_32F,
        {
            name: 'VSM_32F',
            kind: 'VSM',
            format: PIXELFORMAT_RGBA32F,
            vsm: true,
        },
    ],
    [
        SHADOW_PCSS_32F,
        {
            name: 'PCSS_32F',
            kind: 'PCSS',
            format: PIXELFORMAT_R32F,
            pcss: true,
        },
    ],
])
const SHADOW_CASCADE_ALL = 255
const BLUR_GAUSSIAN = 1
const PROJECTION_PERSPECTIVE = 0
const PROJECTION_ORTHOGRAPHIC = 1
const RENDERSTYLE_SOLID = 0
const RENDERSTYLE_WIREFRAME = 1
const RENDERSTYLE_POINTS = 2
const CUBEPROJ_NONE = 0
const CUBEPROJ_BOX = 1
const cubemaProjectionNames = {
    [CUBEPROJ_NONE]: 'NONE',
    [CUBEPROJ_BOX]: 'BOX',
}
const DETAILMODE_MUL = 'mul'
const GAMMA_NONE = 0
const GAMMA_SRGB = 1
const gammaNames = {
    [GAMMA_NONE]: 'NONE',
    [GAMMA_SRGB]: 'SRGB',
}
const TONEMAP_LINEAR = 0
const TONEMAP_FILMIC = 1
const TONEMAP_HEJL = 2
const TONEMAP_ACES = 3
const TONEMAP_ACES2 = 4
const TONEMAP_NEUTRAL = 5
const TONEMAP_NONE = 6
const tonemapNames = ['LINEAR', 'FILMIC', 'HEJL', 'ACES', 'ACES2', 'NEUTRAL', 'NONE']
const SPECOCC_NONE = 0
const SPECOCC_AO = 1
const SPECOCC_GLOSSDEPENDENT = 2
const specularOcclusionNames = {
    [SPECOCC_NONE]: 'NONE',
    [SPECOCC_AO]: 'AO',
    [SPECOCC_GLOSSDEPENDENT]: 'GLOSSDEPENDENT',
}
const REFLECTIONSRC_NONE = 'none'
const REFLECTIONSRC_ENVATLAS = 'envAtlas'
const REFLECTIONSRC_ENVATLASHQ = 'envAtlasHQ'
const REFLECTIONSRC_CUBEMAP = 'cubeMap'
const REFLECTIONSRC_SPHEREMAP = 'sphereMap'
const reflectionSrcNames = {
    [REFLECTIONSRC_NONE]: 'NONE',
    [REFLECTIONSRC_ENVATLAS]: 'ENVATLAS',
    [REFLECTIONSRC_ENVATLASHQ]: 'ENVATLASHQ',
    [REFLECTIONSRC_CUBEMAP]: 'CUBEMAP',
    [REFLECTIONSRC_SPHEREMAP]: 'SPHEREMAP',
}
const AMBIENTSRC_AMBIENTSH = 'ambientSH'
const AMBIENTSRC_ENVALATLAS = 'envAtlas'
const AMBIENTSRC_CONSTANT = 'constant'
const ambientSrcNames = {
    [AMBIENTSRC_AMBIENTSH]: 'AMBIENTSH',
    [AMBIENTSRC_ENVALATLAS]: 'ENVALATLAS',
    [AMBIENTSRC_CONSTANT]: 'CONSTANT',
}
const SHADERDEF_NOSHADOW = 1
const SHADERDEF_SKIN = 2
const SHADERDEF_UV0 = 4
const SHADERDEF_UV1 = 8
const SHADERDEF_VCOLOR = 16
const SHADERDEF_INSTANCING = 32
const SHADERDEF_LM = 64
const SHADERDEF_DIRLM = 128
const SHADERDEF_SCREENSPACE = 256
const SHADERDEF_TANGENTS = 512
const SHADERDEF_MORPH_POSITION = 1024
const SHADERDEF_MORPH_NORMAL = 2048
const SHADERDEF_LMAMBIENT = 4096
const SHADERDEF_MORPH_TEXTURE_BASED_INT = 8192
const SHADERDEF_BATCH = 16384
const SHADOWUPDATE_NONE = 0
const SHADOWUPDATE_THISFRAME = 1
const SHADOWUPDATE_REALTIME = 2
const MASK_AFFECT_DYNAMIC = 1
const MASK_AFFECT_LIGHTMAPPED = 2
const MASK_BAKE = 4
const SHADER_FORWARD = 0
const SHADER_PREPASS = 1
const SHADER_SHADOW = 2
const SHADER_PICK = 3
const SHADER_DEPTH_PICK = 4
const SPRITE_RENDERMODE_SIMPLE = 0
const SPRITE_RENDERMODE_SLICED = 1
const SPRITE_RENDERMODE_TILED = 2
const spriteRenderModeNames = {
    [SPRITE_RENDERMODE_SIMPLE]: 'SIMPLE',
    [SPRITE_RENDERMODE_SLICED]: 'SLICED',
    [SPRITE_RENDERMODE_TILED]: 'TILED',
}
const BAKE_COLORDIR = 1
const VIEW_CENTER = 0
const SORTMODE_NONE = 0
const SORTMODE_MANUAL = 1
const SORTMODE_MATERIALMESH = 2
const SORTMODE_BACK2FRONT = 3
const SORTMODE_FRONT2BACK = 4
const SORTMODE_CUSTOM = 5
const ASPECT_AUTO = 0
const ASPECT_MANUAL = 1
const SKYTYPE_INFINITE = 'infinite'
const SKYTYPE_BOX = 'box'
const SKYTYPE_DOME = 'dome'
const DITHER_NONE = 'none'
const DITHER_BAYER8 = 'bayer8'
const DITHER_BLUENOISE = 'bluenoise'
const DITHER_IGNNOISE = 'ignnoise'
const ditherNames = {
    [DITHER_NONE]: 'NONE',
    [DITHER_BAYER8]: 'BAYER8',
    [DITHER_BLUENOISE]: 'BLUENOISE',
    [DITHER_IGNNOISE]: 'IGNNOISE',
}
const EVENT_PRERENDER = 'prerender'
const EVENT_POSTRENDER = 'postrender'
const EVENT_PRERENDER_LAYER = 'prerender:layer'
const EVENT_POSTRENDER_LAYER = 'postrender:layer'
const EVENT_PRECULL = 'precull'
const EVENT_POSTCULL = 'postcull'
const EVENT_CULL_END = 'cull:end'
const GSPLAT_FORWARD = 1
const GSPLAT_SHADOW = 2
const SHADOWCAMERA_NAME = 'pcShadowCamera'
const WORKBUFFER_UPDATE_AUTO = 0
const WORKBUFFER_UPDATE_ONCE = 1
const WORKBUFFER_UPDATE_ALWAYS = 2
const GSPLAT_STREAM_RESOURCE = 0
const GSPLAT_STREAM_INSTANCE = 1
const GSPLATDATA_COMPACT = 'compact'

class ShaderProcessorOptions {
    hasUniform(name) {
        for (let i = 0; i < this.uniformFormats.length; i++) {
            const uniformFormat = this.uniformFormats[i]
            if (uniformFormat?.get(name)) {
                return true
            }
        }
        return false
    }
    hasTexture(name) {
        for (let i = 0; i < this.bindGroupFormats.length; i++) {
            const groupFormat = this.bindGroupFormats[i]
            if (groupFormat?.getTexture(name)) {
                return true
            }
        }
        return false
    }
    getVertexElement(semantic) {
        return this.vertexFormat?.elements.find((element) => element.name === semantic)
    }
    generateKey(device) {
        let key = JSON.stringify(this.uniformFormats) + JSON.stringify(this.bindGroupFormats)
        if (device.isWebGPU) {
            key += this.vertexFormat?.shaderProcessingHashString
        }
        return key
    }
    constructor(viewUniformFormat, viewBindGroupFormat, vertexFormat) {
        this.uniformFormats = []
        this.bindGroupFormats = []
        this.uniformFormats[BINDGROUP_VIEW] = viewUniformFormat
        this.bindGroupFormats[BINDGROUP_VIEW] = viewBindGroupFormat
        this.vertexFormat = vertexFormat
    }
}

const programLibraryDeviceCache = new DeviceCache()
function getProgramLibrary(device) {
    const library = programLibraryDeviceCache.get(device)
    return library
}
function setProgramLibrary(device, library) {
    programLibraryDeviceCache.get(device, () => {
        return library
    })
}

class ShaderGenerator {
    static definesHash(defines) {
        const sortedArray = Array.from(defines).sort((a, b) => (a[0] > b[0] ? 1 : -1))
        return hashCode(JSON.stringify(sortedArray))
    }
}

const shaderPassDeviceCache = new DeviceCache()
class ShaderPassInfo {
    buildShaderDefines() {
        let keyword
        if (this.isShadow) {
            keyword = 'SHADOW'
        } else if (this.isForward) {
            keyword = 'FORWARD'
        } else if (this.index === SHADER_PICK) {
            keyword = 'PICK'
        } else if (this.index === SHADER_DEPTH_PICK) {
            keyword = 'PICK'
            this.defines.set('DEPTH_PICK_PASS', '')
        }
        this.defines.set(`${keyword}_PASS`, '')
        this.defines.set(`${this.name.toUpperCase()}_PASS`, '')
    }
    constructor(name, index, options = {}) {
        this.defines = new Map()
        this.name = name
        this.index = index
        Object.assign(this, options)
        this.buildShaderDefines()
    }
}
class ShaderPass {
    static get(device) {
        return shaderPassDeviceCache.get(device, () => {
            return new ShaderPass()
        })
    }
    allocate(name, options) {
        let info = this.passesNamed.get(name)
        if (info === undefined) {
            info = new ShaderPassInfo(name, this.nextIndex, options)
            this.passesNamed.set(info.name, info)
            this.passesIndexed[info.index] = info
            this.nextIndex++
        }
        return info
    }
    getByIndex(index) {
        const info = this.passesIndexed[index]
        return info
    }
    getByName(name) {
        return this.passesNamed.get(name)
    }
    constructor() {
        this.passesNamed = new Map()
        this.passesIndexed = []
        this.nextIndex = 0
        const add = (name, index, options) => {
            this.allocate(name, options)
        }
        add('forward', SHADER_FORWARD, {
            isForward: true,
        })
        add('prepass')
        add('shadow')
        add('pick')
        add('depth_pick')
    }
}

class ShaderChunkMap extends Map {
    set(name, code) {
        if (!this.has(name) || this.get(name) !== code) {
            this.markDirty()
        }
        return super.set(name, code)
    }
    add(object, override = true) {
        for (const [key, value] of Object.entries(object)) {
            if (override || !this.has(key)) {
                this.set(key, value)
            }
        }
        return this
    }
    delete(name) {
        const existed = this.has(name)
        const result = super.delete(name)
        if (existed && result) {
            this.markDirty()
        }
        return result
    }
    clear() {
        if (this.size > 0) {
            this.markDirty()
        }
        super.clear()
    }
    markDirty() {
        this._dirty = true
        this._keyDirty = true
    }
    isDirty() {
        return this._dirty
    }
    resetDirty() {
        this._dirty = false
    }
    get key() {
        if (this._keyDirty) {
            this._keyDirty = false
            this._key = Array.from(this.entries())
                .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                .map(([k, v]) => `${k}=${hashCode(v)}`)
                .join(',')
        }
        return this._key
    }
    copy(source) {
        this.clear()
        for (const [key, value] of source) {
            this.set(key, value)
        }
        return this
    }
    constructor(validations) {
        ;(super(), (this._keyDirty = false), (this._key = ''))
        this._validations = validations
    }
}

const _chunksCache = new DeviceCache()
class ShaderChunks {
    static get(device, shaderLanguage = SHADERLANGUAGE_GLSL) {
        const cache = _chunksCache.get(device, () => {
            return new ShaderChunks()
        })
        return shaderLanguage === SHADERLANGUAGE_GLSL ? cache.glsl : cache.wgsl
    }
    static registerValidation(name, options) {}
    get useWGSL() {
        return this.glsl.size === 0 || this.wgsl.size > 0
    }
    get key() {
        return `GLSL:${this.glsl.key}|WGSL:${this.wgsl.key}|API:${this.version}`
    }
    isDirty() {
        return this.glsl.isDirty() || this.wgsl.isDirty()
    }
    resetDirty() {
        this.glsl.resetDirty()
        this.wgsl.resetDirty()
    }
    copy(source) {
        this.version = source.version
        this.glsl.copy(source.glsl)
        this.wgsl.copy(source.wgsl)
        return this
    }
    constructor() {
        this.glsl = new ShaderChunkMap(ShaderChunks._validations)
        this.wgsl = new ShaderChunkMap(ShaderChunks._validations)
        this.version = ''
    }
}
ShaderChunks._validations = new Map()

class MapUtils {
    static merge(...maps) {
        const result = new Map(maps[0] ?? [])
        for (let i = 1; i < maps.length; i++) {
            const map = maps[i]
            if (map) {
                for (const [key, value] of map) {
                    result.set(key, value)
                }
            }
        }
        return result
    }
}

class ShaderGeneratorPassThrough extends ShaderGenerator {
    generateKey(options) {
        return this.key
    }
    createShaderDefinition(device, options) {
        return this.shaderDefinition
    }
    constructor(key, shaderDefinition) {
        super()
        this.key = key
        this.shaderDefinition = shaderDefinition
    }
}
class ShaderUtils {
    static createShader(device, options) {
        const programLibrary = getProgramLibrary(device)
        let shader = programLibrary.getCachedShader(options.uniqueName)
        if (!shader) {
            const wgsl =
                device.isWebGPU &&
                (!!options.vertexWGSL || !!options.vertexChunk) &&
                (!!options.fragmentWGSL || !!options.fragmentChunk)
            const chunksMap = ShaderChunks.get(device, wgsl ? SHADERLANGUAGE_WGSL : SHADERLANGUAGE_GLSL)
            const vertexCode = options.vertexChunk
                ? chunksMap.get(options.vertexChunk)
                : wgsl
                  ? options.vertexWGSL
                  : options.vertexGLSL
            const fragmentCode = options.fragmentChunk
                ? chunksMap.get(options.fragmentChunk)
                : wgsl
                  ? options.fragmentWGSL
                  : options.fragmentGLSL
            const fragmentIncludes = MapUtils.merge(chunksMap, options.fragmentIncludes)
            const vertexIncludes = MapUtils.merge(chunksMap, options.vertexIncludes)
            shader = new Shader(
                device,
                ShaderDefinitionUtils.createDefinition(device, {
                    name: options.uniqueName,
                    shaderLanguage: wgsl ? SHADERLANGUAGE_WGSL : SHADERLANGUAGE_GLSL,
                    attributes: options.attributes,
                    vertexCode: vertexCode,
                    fragmentCode: fragmentCode,
                    useTransformFeedback: options.useTransformFeedback,
                    vertexIncludes: vertexIncludes,
                    vertexDefines: options.vertexDefines,
                    fragmentIncludes: fragmentIncludes,
                    fragmentDefines: options.fragmentDefines,
                    fragmentOutputTypes: options.fragmentOutputTypes,
                }),
            )
            programLibrary.setCachedShader(options.uniqueName, shader)
        }
        return shader
    }
    static getCoreDefines(material, params) {
        const defines = new Map(material.defines)
        params.cameraShaderParams.defines.forEach((value, key) => defines.set(key, value))
        const shaderPassInfo = ShaderPass.get(params.device).getByIndex(params.pass)
        shaderPassInfo.defines.forEach((value, key) => defines.set(key, value))
        return defines
    }
    static processShader(shader, processingOptions) {
        const shaderDefinition = shader.definition
        const name = shaderDefinition.name ?? 'shader'
        const key = `${name}-id-${shader.id}`
        const materialGenerator = new ShaderGeneratorPassThrough(key, shaderDefinition)
        const libraryModuleName = 'shader'
        const library = getProgramLibrary(shader.device)
        library.register(libraryModuleName, materialGenerator)
        const variant = library.getProgram(libraryModuleName, {}, processingOptions)
        library.unregister(libraryModuleName)
        return variant
    }
    static addScreenDepthChunkDefines(device, cameraShaderParams, defines) {
        if (cameraShaderParams.sceneDepthMapLinear) {
            defines.set('SCENE_DEPTHMAP_LINEAR', '')
        }
        if (device.textureFloatRenderable) {
            defines.set('SCENE_DEPTHMAP_FLOAT', '')
        }
    }
}

const _quadPrimitive = {
    type: PRIMITIVE_TRIANGLES,
    base: 0,
    count: 6,
    indexed: true,
}
const _tempViewport = new Vec4()
const _tempScissor = new Vec4()
const _dynamicBindGroup$1 = new DynamicBindGroup()
class QuadRender {
    destroy() {
        this.uniformBuffer?.destroy()
        this.uniformBuffer = null
        this.bindGroup?.destroy()
        this.bindGroup = null
    }
    render(viewport, scissor, numInstances) {
        const device = this.shader.device
        if (viewport) {
            _tempViewport.set(device.vx, device.vy, device.vw, device.vh)
            _tempScissor.set(device.sx, device.sy, device.sw, device.sh)
            scissor = scissor ?? viewport
            device.setViewport(viewport.x, viewport.y, viewport.z, viewport.w)
            device.setScissor(scissor.x, scissor.y, scissor.z, scissor.w)
        }
        device.setVertexBuffer(device.quadVertexBuffer)
        const shader = this.shader
        device.setShader(shader)
        if (device.supportsUniformBuffers) {
            device.setBindGroup(BINDGROUP_VIEW, device.emptyBindGroup)
            const bindGroup = this.bindGroup
            bindGroup.update()
            device.setBindGroup(BINDGROUP_MESH, bindGroup)
            const uniformBuffer = this.uniformBuffer
            if (uniformBuffer) {
                uniformBuffer.update(_dynamicBindGroup$1)
                device.setBindGroup(BINDGROUP_MESH_UB, _dynamicBindGroup$1.bindGroup, _dynamicBindGroup$1.offsets)
            } else {
                device.setBindGroup(BINDGROUP_MESH_UB, device.emptyBindGroup)
            }
        }
        device.draw(_quadPrimitive, device.quadIndexBuffer, numInstances)
        if (viewport) {
            device.setViewport(_tempViewport.x, _tempViewport.y, _tempViewport.z, _tempViewport.w)
            device.setScissor(_tempScissor.x, _tempScissor.y, _tempScissor.z, _tempScissor.w)
        }
    }
    constructor(shader) {
        const device = shader.device
        this.shader = shader
        if (device.supportsUniformBuffers) {
            const processingOptions = new ShaderProcessorOptions()
            this.shader = ShaderUtils.processShader(shader, processingOptions)
            const ubFormat = this.shader.meshUniformBufferFormat
            if (ubFormat) {
                this.uniformBuffer = new UniformBuffer(device, ubFormat, false)
            }
            const bindGroupFormat = this.shader.meshBindGroupFormat
            this.bindGroup = new BindGroup(device, bindGroupFormat)
        }
    }
}

class RenderPassQuad extends RenderPass {
    execute() {
        const { device } = this
        device.setDrawStates()
        this.quad.render(this.rect, this.scissorRect)
    }
    constructor(device, quad, rect, scissorRect) {
        super(device)
        this.quad = quad
        this.rect = rect
        this.scissorRect = scissorRect
    }
}

const _tempRect = new Vec4()
function drawQuadWithShader(device, target, shader, rect, scissorRect) {
    const quad = new QuadRender(shader)
    if (!rect) {
        rect = _tempRect
        rect.x = 0
        rect.y = 0
        rect.z = target ? target.width : device.width
        rect.w = target ? target.height : device.height
    }
    const renderPass = new RenderPassQuad(device, quad, rect, scissorRect)
    renderPass.init(target)
    renderPass.colorOps.clear = false
    renderPass.depthStencilOps.clearDepth = false
    if (device.isWebGPU && target === null && device.samples > 1) {
        renderPass.colorOps.store = true
    }
    renderPass.render()
    quad.destroy()
}

class BatchGroup {
    constructor(id, name, dynamic, maxAabbSize, layers = [LAYERID_WORLD]) {
        this._ui = false
        this._sprite = false
        this._obj = {
            model: [],
            element: [],
            sprite: [],
            render: [],
        }
        this.id = id
        this.name = name
        this.dynamic = dynamic
        this.maxAabbSize = maxAabbSize
        this.layers = layers
    }
}
BatchGroup.MODEL = 'model'
BatchGroup.ELEMENT = 'element'
BatchGroup.SPRITE = 'sprite'
BatchGroup.RENDER = 'render'

const _invMatrix = new Mat4()
class SkinInstance {
    set rootBone(rootBone) {
        this._rootBone = rootBone
    }
    get rootBone() {
        return this._rootBone
    }
    init(device, numBones) {
        const numPixels = numBones * 3
        let width = Math.ceil(Math.sqrt(numPixels))
        width = math.roundUp(width, 3)
        const height = Math.ceil(numPixels / width)
        this.boneTexture = new Texture(device, {
            width: width,
            height: height,
            format: PIXELFORMAT_RGBA32F,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            name: 'skin',
        })
        this.matrixPalette = this.boneTexture.lock({
            mode: TEXTURELOCK_READ,
        })
        this.boneTexture.unlock()
    }
    destroy() {
        if (this.boneTexture) {
            this.boneTexture.destroy()
            this.boneTexture = null
        }
    }
    resolve(rootBone, entity) {
        this.rootBone = rootBone
        const skin = this.skin
        const bones = []
        for (let j = 0; j < skin.boneNames.length; j++) {
            const boneName = skin.boneNames[j]
            let bone = rootBone.findByName(boneName)
            if (!bone) {
                bone = entity
            }
            bones.push(bone)
        }
        this.bones = bones
    }
    initSkin(skin) {
        this.skin = skin
        this.bones = []
        const numBones = skin.inverseBindPose.length
        this.init(skin.device, numBones)
        this.matrices = []
        for (let i = 0; i < numBones; i++) {
            this.matrices[i] = new Mat4()
        }
    }
    uploadBones(device) {
        this.boneTexture.upload()
    }
    _updateMatrices(rootNode, skinUpdateIndex) {
        if (this._skinUpdateIndex !== skinUpdateIndex) {
            this._skinUpdateIndex = skinUpdateIndex
            _invMatrix.copy(rootNode.getWorldTransform()).invert()
            for (let i = this.bones.length - 1; i >= 0; i--) {
                this.matrices[i].mulAffine2(_invMatrix, this.bones[i].getWorldTransform())
                this.matrices[i].mulAffine2(this.matrices[i], this.skin.inverseBindPose[i])
            }
        }
    }
    updateMatrices(rootNode, skinUpdateIndex) {
        if (this._updateBeforeCull) {
            this._updateMatrices(rootNode, skinUpdateIndex)
        }
    }
    updateMatrixPalette(rootNode, skinUpdateIndex) {
        this._updateMatrices(rootNode, skinUpdateIndex)
        const mp = this.matrixPalette
        const count = this.bones.length
        for (let i = 0; i < count; i++) {
            const pe = this.matrices[i].data
            const base = i * 12
            mp[base] = pe[0]
            mp[base + 1] = pe[4]
            mp[base + 2] = pe[8]
            mp[base + 3] = pe[12]
            mp[base + 4] = pe[1]
            mp[base + 5] = pe[5]
            mp[base + 6] = pe[9]
            mp[base + 7] = pe[13]
            mp[base + 8] = pe[2]
            mp[base + 9] = pe[6]
            mp[base + 10] = pe[10]
            mp[base + 11] = pe[14]
        }
        this.uploadBones(this.skin.device)
    }
    constructor(skin) {
        this._dirty = true
        this._rootBone = null
        this._skinUpdateIndex = -1
        this._updateBeforeCull = true
        if (skin) {
            this.initSkin(skin)
        }
    }
}

let id$4 = 0
class GeometryData {
    initDefaults() {
        this.recreate = false
        this.verticesUsage = BUFFER_STATIC
        this.indicesUsage = BUFFER_STATIC
        this.maxVertices = 0
        this.maxIndices = 0
        this.vertexCount = 0
        this.indexCount = 0
        this.vertexStreamsUpdated = false
        this.indexStreamUpdated = false
        this.vertexStreamDictionary = {}
        this.indices = null
    }
    _changeVertexCount(count, semantic) {
        if (!this.vertexCount) {
            this.vertexCount = count
        }
    }
    constructor() {
        this.initDefaults()
    }
}
GeometryData.DEFAULT_COMPONENTS_POSITION = 3
GeometryData.DEFAULT_COMPONENTS_NORMAL = 3
GeometryData.DEFAULT_COMPONENTS_UV = 2
GeometryData.DEFAULT_COMPONENTS_COLORS = 4
class GeometryVertexStream {
    constructor(data, componentCount, dataType, dataTypeNormalize, asInt) {
        this.data = data
        this.componentCount = componentCount
        this.dataType = dataType
        this.dataTypeNormalize = dataTypeNormalize
        this.asInt = asInt
    }
}
class Mesh extends RefCountedObject {
    static fromGeometry(graphicsDevice, geometry, options = {}) {
        const mesh = new Mesh(graphicsDevice, options)
        const { positions, normals, tangents, colors, uvs, uvs1, blendIndices, blendWeights, indices } = geometry
        if (positions) {
            mesh.setPositions(positions)
        }
        if (normals) {
            mesh.setNormals(normals)
        }
        if (tangents) {
            mesh.setVertexStream(SEMANTIC_TANGENT, tangents, 4)
        }
        if (colors) {
            mesh.setColors32(colors)
        }
        if (uvs) {
            mesh.setUvs(0, uvs)
        }
        if (uvs1) {
            mesh.setUvs(1, uvs1)
        }
        if (blendIndices) {
            mesh.setVertexStream(SEMANTIC_BLENDINDICES, blendIndices, 4, blendIndices.length / 4, TYPE_UINT8)
        }
        if (blendWeights) {
            mesh.setVertexStream(SEMANTIC_BLENDWEIGHT, blendWeights, 4)
        }
        if (indices) {
            mesh.setIndices(indices)
        }
        mesh.update()
        return mesh
    }
    set morph(morph) {
        if (morph !== this._morph) {
            if (this._morph) {
                this._morph.decRefCount()
            }
            this._morph = morph
            if (morph) {
                morph.incRefCount()
            }
        }
    }
    get morph() {
        return this._morph
    }
    set aabb(aabb) {
        this._aabb = aabb
        this._aabbVer++
    }
    get aabb() {
        return this._aabb
    }
    destroy() {
        const morph = this.morph
        if (morph) {
            this.morph = null
            if (morph.refCount < 1) {
                morph.destroy()
            }
        }
        if (this.vertexBuffer) {
            this.vertexBuffer.destroy()
            this.vertexBuffer = null
        }
        for (let j = 0; j < this.indexBuffer.length; j++) {
            this._destroyIndexBuffer(j)
        }
        this.indexBuffer.length = 0
        this._geometryData = null
    }
    _destroyIndexBuffer(index) {
        if (this.indexBuffer[index]) {
            this.indexBuffer[index].destroy()
            this.indexBuffer[index] = null
        }
    }
    _initBoneAabbs(morphTargets) {
        this.boneAabb = []
        this.boneUsed = []
        let x, y, z
        let bMax, bMin
        const boneMin = []
        const boneMax = []
        const boneUsed = this.boneUsed
        const numBones = this.skin.boneNames.length
        let maxMorphX, maxMorphY, maxMorphZ
        for (let i = 0; i < numBones; i++) {
            boneMin[i] = new Vec3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE)
            boneMax[i] = new Vec3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE)
        }
        const iterator = new VertexIterator(this.vertexBuffer)
        const posElement = iterator.element[SEMANTIC_POSITION]
        const weightsElement = iterator.element[SEMANTIC_BLENDWEIGHT]
        const indicesElement = iterator.element[SEMANTIC_BLENDINDICES]
        const numVerts = this.vertexBuffer.numVertices
        for (let j = 0; j < numVerts; j++) {
            for (let k = 0; k < 4; k++) {
                const boneWeight = weightsElement.array[weightsElement.index + k]
                if (boneWeight > 0) {
                    const boneIndex = indicesElement.array[indicesElement.index + k]
                    boneUsed[boneIndex] = true
                    x = posElement.array[posElement.index]
                    y = posElement.array[posElement.index + 1]
                    z = posElement.array[posElement.index + 2]
                    bMax = boneMax[boneIndex]
                    bMin = boneMin[boneIndex]
                    if (bMin.x > x) bMin.x = x
                    if (bMin.y > y) bMin.y = y
                    if (bMin.z > z) bMin.z = z
                    if (bMax.x < x) bMax.x = x
                    if (bMax.y < y) bMax.y = y
                    if (bMax.z < z) bMax.z = z
                    if (morphTargets) {
                        let minMorphX = (maxMorphX = x)
                        let minMorphY = (maxMorphY = y)
                        let minMorphZ = (maxMorphZ = z)
                        for (let l = 0; l < morphTargets.length; l++) {
                            const target = morphTargets[l]
                            const dx = target.deltaPositions[j * 3]
                            const dy = target.deltaPositions[j * 3 + 1]
                            const dz = target.deltaPositions[j * 3 + 2]
                            if (dx < 0) {
                                minMorphX += dx
                            } else {
                                maxMorphX += dx
                            }
                            if (dy < 0) {
                                minMorphY += dy
                            } else {
                                maxMorphY += dy
                            }
                            if (dz < 0) {
                                minMorphZ += dz
                            } else {
                                maxMorphZ += dz
                            }
                        }
                        if (bMin.x > minMorphX) bMin.x = minMorphX
                        if (bMin.y > minMorphY) bMin.y = minMorphY
                        if (bMin.z > minMorphZ) bMin.z = minMorphZ
                        if (bMax.x < maxMorphX) bMax.x = maxMorphX
                        if (bMax.y < maxMorphY) bMax.y = maxMorphY
                        if (bMax.z < maxMorphZ) bMax.z = maxMorphZ
                    }
                }
            }
            iterator.next()
        }
        const positionElement = this.vertexBuffer.getFormat().elements.find((e) => e.name === SEMANTIC_POSITION)
        if (positionElement && positionElement.normalize) {
            const func = (() => {
                switch (positionElement.dataType) {
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
            })()
            for (let i = 0; i < numBones; i++) {
                if (boneUsed[i]) {
                    const min = boneMin[i]
                    const max = boneMax[i]
                    min.set(func(min.x), func(min.y), func(min.z))
                    max.set(func(max.x), func(max.y), func(max.z))
                }
            }
        }
        for (let i = 0; i < numBones; i++) {
            const aabb = new BoundingBox()
            aabb.setMinMax(boneMin[i], boneMax[i])
            this.boneAabb.push(aabb)
        }
    }
    _initGeometryData() {
        if (!this._geometryData) {
            this._geometryData = new GeometryData()
            if (this.vertexBuffer) {
                this._geometryData.vertexCount = this.vertexBuffer.numVertices
                this._geometryData.maxVertices = this.vertexBuffer.numVertices
            }
            if (this.indexBuffer.length > 0 && this.indexBuffer[0]) {
                this._geometryData.indexCount = this.indexBuffer[0].numIndices
                this._geometryData.maxIndices = this.indexBuffer[0].numIndices
            }
        }
    }
    clear(verticesDynamic, indicesDynamic, maxVertices = 0, maxIndices = 0) {
        this._initGeometryData()
        this._geometryData.initDefaults()
        this._geometryData.recreate = true
        this._geometryData.maxVertices = maxVertices
        this._geometryData.maxIndices = maxIndices
        this._geometryData.verticesUsage = verticesDynamic ? BUFFER_STATIC : BUFFER_DYNAMIC
        this._geometryData.indicesUsage = indicesDynamic ? BUFFER_STATIC : BUFFER_DYNAMIC
    }
    setVertexStream(
        semantic,
        data,
        componentCount,
        numVertices,
        dataType = TYPE_FLOAT32,
        dataTypeNormalize = false,
        asInt = false,
    ) {
        this._initGeometryData()
        const vertexCount = numVertices || data.length / componentCount
        this._geometryData._changeVertexCount(vertexCount, semantic)
        this._geometryData.vertexStreamsUpdated = true
        this._geometryData.vertexStreamDictionary[semantic] = new GeometryVertexStream(
            data,
            componentCount,
            dataType,
            dataTypeNormalize,
            asInt,
        )
    }
    getVertexStream(semantic, data) {
        let count = 0
        let done = false
        if (this._geometryData) {
            const stream = this._geometryData.vertexStreamDictionary[semantic]
            if (stream) {
                done = true
                count = this._geometryData.vertexCount
                if (ArrayBuffer.isView(data)) {
                    data.set(stream.data)
                } else {
                    data.length = 0
                    data.push(stream.data)
                }
            }
        }
        if (!done) {
            if (this.vertexBuffer) {
                const iterator = new VertexIterator(this.vertexBuffer)
                count = iterator.readData(semantic, data)
            }
        }
        return count
    }
    setPositions(positions, componentCount = GeometryData.DEFAULT_COMPONENTS_POSITION, numVertices) {
        this.setVertexStream(SEMANTIC_POSITION, positions, componentCount, numVertices, TYPE_FLOAT32, false)
    }
    setNormals(normals, componentCount = GeometryData.DEFAULT_COMPONENTS_NORMAL, numVertices) {
        this.setVertexStream(SEMANTIC_NORMAL, normals, componentCount, numVertices, TYPE_FLOAT32, false)
    }
    setUvs(channel, uvs, componentCount = GeometryData.DEFAULT_COMPONENTS_UV, numVertices) {
        this.setVertexStream(SEMANTIC_TEXCOORD + channel, uvs, componentCount, numVertices, TYPE_FLOAT32, false)
    }
    setColors(colors, componentCount = GeometryData.DEFAULT_COMPONENTS_COLORS, numVertices) {
        this.setVertexStream(SEMANTIC_COLOR, colors, componentCount, numVertices, TYPE_FLOAT32, false)
    }
    setColors32(colors, numVertices) {
        this.setVertexStream(
            SEMANTIC_COLOR,
            colors,
            GeometryData.DEFAULT_COMPONENTS_COLORS,
            numVertices,
            TYPE_UINT8,
            true,
        )
    }
    setIndices(indices, numIndices) {
        this._initGeometryData()
        this._geometryData.indexStreamUpdated = true
        this._geometryData.indices = indices
        this._geometryData.indexCount = numIndices || indices.length
    }
    getPositions(positions) {
        return this.getVertexStream(SEMANTIC_POSITION, positions)
    }
    getNormals(normals) {
        return this.getVertexStream(SEMANTIC_NORMAL, normals)
    }
    getUvs(channel, uvs) {
        return this.getVertexStream(SEMANTIC_TEXCOORD + channel, uvs)
    }
    getColors(colors) {
        return this.getVertexStream(SEMANTIC_COLOR, colors)
    }
    getIndices(indices) {
        let count = 0
        if (this._geometryData && this._geometryData.indices) {
            const streamIndices = this._geometryData.indices
            count = this._geometryData.indexCount
            if (ArrayBuffer.isView(indices)) {
                indices.set(streamIndices)
            } else {
                indices.length = 0
                for (let i = 0, il = streamIndices.length; i < il; i++) {
                    indices.push(streamIndices[i])
                }
            }
        } else {
            if (this.indexBuffer.length > 0 && this.indexBuffer[0]) {
                const indexBuffer = this.indexBuffer[0]
                count = indexBuffer.readData(indices)
            }
        }
        return count
    }
    update(primitiveType = PRIMITIVE_TRIANGLES, updateBoundingBox = true) {
        if (this._geometryData) {
            if (updateBoundingBox) {
                const stream = this._geometryData.vertexStreamDictionary[SEMANTIC_POSITION]
                if (stream) {
                    if (stream.componentCount === 3) {
                        this._aabb.compute(stream.data, this._geometryData.vertexCount)
                        this._aabbVer++
                    }
                }
            }
            let destroyVB = this._geometryData.recreate
            if (this._geometryData.vertexCount > this._geometryData.maxVertices) {
                destroyVB = true
                this._geometryData.maxVertices = this._geometryData.vertexCount
            }
            if (destroyVB) {
                if (this.vertexBuffer) {
                    this.vertexBuffer.destroy()
                    this.vertexBuffer = null
                }
            }
            let destroyIB = this._geometryData.recreate
            if (this._geometryData.indexCount > this._geometryData.maxIndices) {
                destroyIB = true
                this._geometryData.maxIndices = this._geometryData.indexCount
            }
            if (destroyIB) {
                if (this.indexBuffer.length > 0 && this.indexBuffer[0]) {
                    this.indexBuffer[0].destroy()
                    this.indexBuffer[0] = null
                }
            }
            if (this._geometryData.vertexStreamsUpdated) {
                this._updateVertexBuffer()
            }
            if (this._geometryData.indexStreamUpdated) {
                this._updateIndexBuffer()
            }
            this.primitive[0].type = primitiveType
            if (this.indexBuffer.length > 0 && this.indexBuffer[0]) {
                if (this._geometryData.indexStreamUpdated) {
                    this.primitive[0].count = this._geometryData.indexCount
                    this.primitive[0].indexed = true
                }
            } else {
                if (this._geometryData.vertexStreamsUpdated) {
                    this.primitive[0].count = this._geometryData.vertexCount
                    this.primitive[0].indexed = false
                }
            }
            this._geometryData.vertexCount = 0
            this._geometryData.indexCount = 0
            this._geometryData.vertexStreamsUpdated = false
            this._geometryData.indexStreamUpdated = false
            this._geometryData.recreate = false
            this.updateRenderStates()
        }
    }
    _buildVertexFormat(vertexCount) {
        const vertexDesc = []
        for (const semantic in this._geometryData.vertexStreamDictionary) {
            const stream = this._geometryData.vertexStreamDictionary[semantic]
            vertexDesc.push({
                semantic: semantic,
                components: stream.componentCount,
                type: stream.dataType,
                normalize: stream.dataTypeNormalize,
                asInt: stream.asInt,
            })
        }
        return new VertexFormat(this.device, vertexDesc, vertexCount)
    }
    _updateVertexBuffer() {
        if (!this.vertexBuffer) {
            const allocateVertexCount = this._geometryData.maxVertices
            const format = this._buildVertexFormat(allocateVertexCount)
            this.vertexBuffer = new VertexBuffer(this.device, format, allocateVertexCount, {
                usage: this._geometryData.verticesUsage,
                storage: this._storageVertex,
            })
        }
        const iterator = new VertexIterator(this.vertexBuffer)
        const numVertices = this._geometryData.vertexCount
        for (const semantic in this._geometryData.vertexStreamDictionary) {
            const stream = this._geometryData.vertexStreamDictionary[semantic]
            iterator.writeData(semantic, stream.data, numVertices)
            delete this._geometryData.vertexStreamDictionary[semantic]
        }
        iterator.end()
    }
    _updateIndexBuffer() {
        if (this.indexBuffer.length <= 0 || !this.indexBuffer[0]) {
            const maxVertices = this._geometryData.maxVertices
            const createFormat = maxVertices > 0xffff || maxVertices === 0 ? INDEXFORMAT_UINT32 : INDEXFORMAT_UINT16
            const options = this._storageIndex
                ? {
                      storage: true,
                  }
                : undefined
            this.indexBuffer[0] = new IndexBuffer(
                this.device,
                createFormat,
                this._geometryData.maxIndices,
                this._geometryData.indicesUsage,
                undefined,
                options,
            )
        }
        const srcIndices = this._geometryData.indices
        if (srcIndices) {
            const indexBuffer = this.indexBuffer[0]
            indexBuffer.writeData(srcIndices, this._geometryData.indexCount)
            this._geometryData.indices = null
        }
    }
    prepareRenderState(renderStyle) {
        if (renderStyle === RENDERSTYLE_WIREFRAME) {
            this.generateWireframe()
        } else if (renderStyle === RENDERSTYLE_POINTS) {
            this.primitive[RENDERSTYLE_POINTS] = {
                type: PRIMITIVE_POINTS,
                base: 0,
                baseVertex: 0,
                count: this.vertexBuffer ? this.vertexBuffer.numVertices : 0,
                indexed: false,
            }
        }
    }
    updateRenderStates() {
        if (this.primitive[RENDERSTYLE_POINTS]) {
            this.prepareRenderState(RENDERSTYLE_POINTS)
        }
        if (this.primitive[RENDERSTYLE_WIREFRAME]) {
            this.prepareRenderState(RENDERSTYLE_WIREFRAME)
        }
    }
    generateWireframe() {
        this._destroyIndexBuffer(RENDERSTYLE_WIREFRAME)
        const numVertices = this.vertexBuffer.numVertices
        let lines
        let format
        if (this.indexBuffer.length > 0 && this.indexBuffer[0]) {
            const offsets = [
                [0, 1],
                [1, 2],
                [2, 0],
            ]
            const base = this.primitive[RENDERSTYLE_SOLID].base
            const count = this.primitive[RENDERSTYLE_SOLID].count
            const baseVertex = this.primitive[RENDERSTYLE_SOLID].baseVertex || 0
            const indexBuffer = this.indexBuffer[RENDERSTYLE_SOLID]
            const indicesArrayType = typedArrayIndexFormats[indexBuffer.format]
            const srcIndices = new indicesArrayType(indexBuffer.storage)
            const tmpIndices = new indicesArrayType(count * 2)
            const seen = new Set()
            let len = 0
            for (let j = base; j < base + count; j += 3) {
                for (let k = 0; k < 3; k++) {
                    const i1 = srcIndices[j + offsets[k][0]] + baseVertex
                    const i2 = srcIndices[j + offsets[k][1]] + baseVertex
                    const hash = i1 > i2 ? i2 * numVertices + i1 : i1 * numVertices + i2
                    if (!seen.has(hash)) {
                        seen.add(hash)
                        tmpIndices[len++] = i1
                        tmpIndices[len++] = i2
                    }
                }
            }
            seen.clear()
            format = indexBuffer.format
            lines = tmpIndices.slice(0, len)
        } else {
            const safeNumVertices = numVertices - (numVertices % 3)
            const count = (safeNumVertices / 3) * 6
            format = count > 65535 ? INDEXFORMAT_UINT32 : INDEXFORMAT_UINT16
            lines = count > 65535 ? new Uint32Array(count) : new Uint16Array(count)
            let idx = 0
            for (let i = 0; i < safeNumVertices; i += 3) {
                lines[idx++] = i
                lines[idx++] = i + 1
                lines[idx++] = i + 1
                lines[idx++] = i + 2
                lines[idx++] = i + 2
                lines[idx++] = i
            }
        }
        const wireBuffer = new IndexBuffer(this.vertexBuffer.device, format, lines.length, BUFFER_STATIC, lines.buffer)
        this.primitive[RENDERSTYLE_WIREFRAME] = {
            type: PRIMITIVE_LINES,
            base: 0,
            baseVertex: 0,
            count: lines.length,
            indexed: true,
        }
        this.indexBuffer[RENDERSTYLE_WIREFRAME] = wireBuffer
    }
    constructor(graphicsDevice, options) {
        ;(super(),
            (this.indexBuffer = [null]),
            (this.vertexBuffer = null),
            (this.primitive = [
                {
                    type: 0,
                    base: 0,
                    baseVertex: 0,
                    count: 0,
                },
            ]),
            (this.skin = null),
            (this.boneAabb = null),
            (this._aabbVer = 0),
            (this._aabb = new BoundingBox()),
            (this._geometryData = null),
            (this._morph = null),
            (this._storageIndex = false),
            (this._storageVertex = false))
        this.id = id$4++
        this.device = graphicsDevice
        this._storageIndex = options?.storageIndex || false
        this._storageVertex = options?.storageVertex || false
    }
}

const defaultMaterialDeviceCache = new DeviceCache()
function getDefaultMaterial(device) {
    const material = defaultMaterialDeviceCache.get(device)
    return material
}
function setDefaultMaterial(device, material) {
    defaultMaterialDeviceCache.get(device, () => {
        return material
    })
}

class RefCountedCache {
    destroy() {
        this.cache.forEach((refCount, object) => {
            object.destroy()
        })
        this.cache.clear()
    }
    incRef(object) {
        const refCount = (this.cache.get(object) || 0) + 1
        this.cache.set(object, refCount)
    }
    decRef(object) {
        if (object) {
            let refCount = this.cache.get(object)
            if (refCount) {
                refCount--
                if (refCount === 0) {
                    this.cache.delete(object)
                    object.destroy()
                } else {
                    this.cache.set(object, refCount)
                }
            }
        }
    }
    constructor() {
        this.cache = new Map()
    }
}

class LightmapCache {
    static incRef(texture) {
        this.cache.incRef(texture)
    }
    static decRef(texture) {
        this.cache.decRef(texture)
    }
    static destroy() {
        this.cache.destroy()
    }
}
LightmapCache.cache = new RefCountedCache()

class NumericIds {
    get() {
        return this._counter++
    }
    constructor() {
        this._counter = 0
    }
}

const PickerId = new NumericIds()

const _tmpAabb = new BoundingBox()
const _tempBoneAabb = new BoundingBox()
const _tempSphere = new BoundingSphere()
const _meshSet = new Set()
const lookupHashes = new Uint32Array(4)
class InstancingData {
    destroy() {
        if (this._destroyVertexBuffer) {
            this.vertexBuffer?.destroy()
        }
        this.vertexBuffer = null
    }
    constructor(numObjects) {
        this.vertexBuffer = null
        this._destroyVertexBuffer = false
        this.count = numObjects
    }
}
class ShaderInstance {
    getBindGroup(device) {
        if (!this.bindGroup) {
            const shader = this.shader
            const bindGroupFormat = shader.meshBindGroupFormat
            this.bindGroup = new BindGroup(device, bindGroupFormat)
        }
        return this.bindGroup
    }
    getUniformBuffer(device) {
        if (!this.uniformBuffer) {
            const shader = this.shader
            const ubFormat = shader.meshUniformBufferFormat
            this.uniformBuffer = new UniformBuffer(device, ubFormat, false)
        }
        return this.uniformBuffer
    }
    destroy() {
        this.bindGroup?.destroy()
        this.bindGroup = null
        this.uniformBuffer?.destroy()
        this.uniformBuffer = null
    }
    constructor() {
        this.bindGroup = null
        this.uniformBuffer = null
    }
}
class MeshInstance {
    set drawBucket(bucket) {
        this._drawBucket = Math.floor(bucket) & 0xff
        this.updateKey()
    }
    get drawBucket() {
        return this._drawBucket
    }
    set renderStyle(renderStyle) {
        this._renderStyle = renderStyle
        this.mesh.prepareRenderState(renderStyle)
    }
    get renderStyle() {
        return this._renderStyle
    }
    set mesh(mesh) {
        if (mesh === this._mesh) {
            return
        }
        if (this._mesh) {
            this._mesh.decRefCount()
        }
        this._mesh = mesh
        if (mesh) {
            mesh.incRefCount()
        }
    }
    get mesh() {
        return this._mesh
    }
    set aabb(aabb) {
        this._aabb = aabb
    }
    get aabb() {
        if (!this._updateAabb) {
            return this._aabb
        }
        if (this._updateAabbFunc) {
            return this._updateAabbFunc(this._aabb)
        }
        let localAabb = this._customAabb
        let toWorldSpace = !!localAabb
        if (!localAabb) {
            localAabb = _tmpAabb
            if (this.skinInstance) {
                if (!this.mesh.boneAabb) {
                    const morphTargets = this._morphInstance ? this._morphInstance.morph._targets : null
                    this.mesh._initBoneAabbs(morphTargets)
                }
                const boneUsed = this.mesh.boneUsed
                let first = true
                for (let i = 0; i < this.mesh.boneAabb.length; i++) {
                    if (boneUsed[i]) {
                        _tempBoneAabb.setFromTransformedAabb(this.mesh.boneAabb[i], this.skinInstance.matrices[i])
                        if (first) {
                            first = false
                            localAabb.center.copy(_tempBoneAabb.center)
                            localAabb.halfExtents.copy(_tempBoneAabb.halfExtents)
                        } else {
                            localAabb.add(_tempBoneAabb)
                        }
                    }
                }
                toWorldSpace = true
            } else if (this.node._aabbVer !== this._aabbVer || this.mesh._aabbVer !== this._aabbMeshVer) {
                if (this.mesh) {
                    localAabb.center.copy(this.mesh.aabb.center)
                    localAabb.halfExtents.copy(this.mesh.aabb.halfExtents)
                } else {
                    localAabb.center.set(0, 0, 0)
                    localAabb.halfExtents.set(0, 0, 0)
                }
                if (this.mesh && this.mesh.morph) {
                    const morphAabb = this.mesh.morph.aabb
                    localAabb._expand(morphAabb.getMin(), morphAabb.getMax())
                }
                toWorldSpace = true
                this._aabbVer = this.node._aabbVer
                this._aabbMeshVer = this.mesh._aabbVer
            }
        }
        if (toWorldSpace) {
            this._aabb.setFromTransformedAabb(localAabb, this.node.getWorldTransform())
        }
        return this._aabb
    }
    clearShaders() {
        this._shaderCache.forEach((shaderInstance) => {
            shaderInstance.destroy()
        })
        this._shaderCache.clear()
    }
    getShaderInstance(
        shaderPass,
        lightHash,
        scene,
        cameraShaderParams,
        viewUniformFormat,
        viewBindGroupFormat,
        sortedLights,
    ) {
        const shaderDefs = this._shaderDefs
        lookupHashes[0] = shaderPass
        lookupHashes[1] = lightHash
        lookupHashes[2] = shaderDefs
        lookupHashes[3] = cameraShaderParams.hash
        const hash = hash32Fnv1a(lookupHashes)
        let shaderInstance = this._shaderCache.get(hash)
        if (!shaderInstance) {
            const mat = this._material
            shaderInstance = new ShaderInstance()
            shaderInstance.shader = mat.variants.get(hash)
            shaderInstance.hashes = new Uint32Array(lookupHashes)
            if (!shaderInstance.shader) {
                const shader = mat.getShaderVariant({
                    device: this.mesh.device,
                    scene: scene,
                    objDefs: shaderDefs,
                    cameraShaderParams: cameraShaderParams,
                    pass: shaderPass,
                    sortedLights: sortedLights,
                    viewUniformFormat: viewUniformFormat,
                    viewBindGroupFormat: viewBindGroupFormat,
                    vertexFormat: this.mesh.vertexBuffer?.format,
                })
                mat.variants.set(hash, shader)
                shaderInstance.shader = shader
            }
            this._shaderCache.set(hash, shaderInstance)
        }
        return shaderInstance
    }
    set material(material) {
        this.clearShaders()
        const prevMat = this._material
        if (prevMat) {
            prevMat.removeMeshInstanceRef(this)
        }
        this._material = material
        if (material) {
            material.addMeshInstanceRef(this)
            this.transparent = material.transparent
            this.updateKey()
        }
    }
    get material() {
        return this._material
    }
    _updateShaderDefs(shaderDefs) {
        if (shaderDefs !== this._shaderDefs) {
            this._shaderDefs = shaderDefs
            this.clearShaders()
        }
    }
    set calculateSortDistance(calculateSortDistance) {
        this._calculateSortDistance = calculateSortDistance
    }
    get calculateSortDistance() {
        return this._calculateSortDistance
    }
    set receiveShadow(val) {
        if (this._receiveShadow !== val) {
            this._receiveShadow = val
            this._updateShaderDefs(val ? this._shaderDefs & ~SHADERDEF_NOSHADOW : this._shaderDefs | SHADERDEF_NOSHADOW)
        }
    }
    get receiveShadow() {
        return this._receiveShadow
    }
    set batching(val) {
        this._updateShaderDefs(val ? this._shaderDefs | SHADERDEF_BATCH : this._shaderDefs & ~SHADERDEF_BATCH)
    }
    get batching() {
        return (this._shaderDefs & SHADERDEF_BATCH) !== 0
    }
    set skinInstance(val) {
        this._skinInstance = val
        this._updateShaderDefs(val ? this._shaderDefs | SHADERDEF_SKIN : this._shaderDefs & ~SHADERDEF_SKIN)
        this._setupSkinUpdate()
    }
    get skinInstance() {
        return this._skinInstance
    }
    set morphInstance(val) {
        this._morphInstance?.destroy()
        this._morphInstance = val
        let shaderDefs = this._shaderDefs
        shaderDefs =
            val && val.morph.morphPositions
                ? shaderDefs | SHADERDEF_MORPH_POSITION
                : shaderDefs & ~SHADERDEF_MORPH_POSITION
        shaderDefs =
            val && val.morph.morphNormals ? shaderDefs | SHADERDEF_MORPH_NORMAL : shaderDefs & ~SHADERDEF_MORPH_NORMAL
        shaderDefs =
            val && val.morph.intRenderFormat
                ? shaderDefs | SHADERDEF_MORPH_TEXTURE_BASED_INT
                : shaderDefs & ~SHADERDEF_MORPH_TEXTURE_BASED_INT
        this._updateShaderDefs(shaderDefs)
    }
    get morphInstance() {
        return this._morphInstance
    }
    set screenSpace(val) {
        if (this._screenSpace !== val) {
            this._screenSpace = val
            this._updateShaderDefs(
                val ? this._shaderDefs | SHADERDEF_SCREENSPACE : this._shaderDefs & ~SHADERDEF_SCREENSPACE,
            )
        }
    }
    get screenSpace() {
        return this._screenSpace
    }
    set key(val) {
        this._sortKeyForward = val
    }
    get key() {
        return this._sortKeyForward
    }
    set mask(val) {
        const toggles = this._shaderDefs & 0x0000ffff
        this._updateShaderDefs(toggles | (val << 16))
    }
    get mask() {
        return this._shaderDefs >> 16
    }
    set instancingCount(value) {
        if (this.instancingData) {
            this.instancingData.count = value
        }
    }
    get instancingCount() {
        return this.instancingData ? this.instancingData.count : 0
    }
    destroy() {
        const mesh = this.mesh
        if (mesh) {
            this.mesh = null
            if (mesh.refCount < 1) {
                mesh.destroy()
            }
        }
        this.setRealtimeLightmap(MeshInstance.lightmapParamNames[0], null)
        this.setRealtimeLightmap(MeshInstance.lightmapParamNames[1], null)
        this._skinInstance?.destroy()
        this._skinInstance = null
        this.morphInstance?.destroy()
        this.morphInstance = null
        this.clearShaders()
        this.material = null
        this.instancingData?.destroy()
        this.destroyDrawCommands()
    }
    destroyDrawCommands() {
        if (this.drawCommands) {
            for (const cmd of this.drawCommands.values()) {
                cmd?.destroy()
            }
            this.drawCommands = null
        }
    }
    static _prepareRenderStyleForArray(meshInstances, renderStyle) {
        if (meshInstances) {
            for (let i = 0; i < meshInstances.length; i++) {
                meshInstances[i]._renderStyle = renderStyle
                const mesh = meshInstances[i].mesh
                if (!_meshSet.has(mesh)) {
                    _meshSet.add(mesh)
                    mesh.prepareRenderState(renderStyle)
                }
            }
            _meshSet.clear()
        }
    }
    _isVisible(camera) {
        if (this.visible) {
            if (this.isVisibleFunc) {
                return this.isVisibleFunc(camera)
            }
            _tempSphere.center = this.aabb.center
            _tempSphere.radius = this._aabb.halfExtents.length()
            return camera.frustum.containsSphere(_tempSphere) > 0
        }
        return false
    }
    updateKey() {
        const { material } = this
        this._sortKeyForward =
            (this._drawBucket << 23) |
            (material.alphaToCoverage || material.alphaTest ? 0x400000 : 0) |
            (material.id & 0x3fffff)
    }
    setInstancing(vertexBuffer, cull = false) {
        if (vertexBuffer) {
            this.instancingData = new InstancingData(vertexBuffer.numVertices)
            this.instancingData.vertexBuffer = vertexBuffer
            vertexBuffer.format.instancing = true
            this.cull = cull
        } else {
            this.instancingData = null
            this.cull = true
        }
        this._updateShaderDefs(
            vertexBuffer ? this._shaderDefs | SHADERDEF_INSTANCING : this._shaderDefs & ~SHADERDEF_INSTANCING,
        )
    }
    setIndirect(camera, slot, count = 1) {
        const key = camera?.camera ?? null
        if (slot === -1) {
            this._deleteDrawCommandsKey(key)
        } else {
            this.drawCommands ?? (this.drawCommands = new Map())
            const cmd = this.drawCommands.get(key) ?? new DrawCommands(this.mesh.device)
            cmd.slotIndex = slot
            cmd.update(count)
            this.drawCommands.set(key, cmd)
            const device = this.mesh.device
            device.mapsToClear.add(this.drawCommands)
        }
    }
    setMultiDraw(camera, maxCount = 1) {
        const key = camera?.camera ?? null
        let cmd
        if (maxCount === 0) {
            this._deleteDrawCommandsKey(key)
        } else {
            this.drawCommands ?? (this.drawCommands = new Map())
            cmd = this.drawCommands.get(key)
            if (!cmd) {
                const indexBuffer = this.mesh.indexBuffer?.[0]
                const indexFormat = indexBuffer?.format
                const indexSizeBytes = indexFormat !== undefined ? indexFormatByteSize[indexFormat] : 0
                cmd = new DrawCommands(this.mesh.device, indexSizeBytes)
                this.drawCommands.set(key, cmd)
            }
            cmd.allocate(maxCount)
        }
        return cmd
    }
    _deleteDrawCommandsKey(key) {
        const cmds = this.drawCommands
        if (cmds) {
            const cmd = cmds.get(key)
            cmd?.destroy()
            cmds.delete(key)
            if (cmds.size === 0) {
                this.destroyDrawCommands()
            }
        }
    }
    getDrawCommands(camera) {
        const cmds = this.drawCommands
        if (!cmds) return undefined
        return cmds.get(camera) ?? cmds.get(null)
    }
    getIndirectMetaData() {
        const prim = this.mesh?.primitive[this.renderStyle]
        const data = this.meshMetaData ?? (this.meshMetaData = new Int32Array(4))
        data[0] = prim.count
        data[1] = prim.base
        data[2] = prim.baseVertex
        return data
    }
    ensureMaterial(device) {
        if (!this.material) {
            this.material = getDefaultMaterial(device)
        }
    }
    clearParameters() {
        this.parameters = {}
    }
    getParameters() {
        return this.parameters
    }
    getParameter(name) {
        return this.parameters[name]
    }
    setParameter(name, data, passFlags = 0xffffffff) {
        const param = this.parameters[name]
        if (param) {
            param.data = data
            param.passFlags = passFlags
        } else {
            this.parameters[name] = {
                scopeId: null,
                data: data,
                passFlags: passFlags,
            }
        }
    }
    setRealtimeLightmap(name, texture) {
        const old = this.getParameter(name)
        if (old === texture) {
            return
        }
        if (old) {
            LightmapCache.decRef(old.data)
        }
        if (texture) {
            LightmapCache.incRef(texture)
            this.setParameter(name, texture)
        } else {
            this.deleteParameter(name)
        }
    }
    deleteParameter(name) {
        if (this.parameters[name]) {
            delete this.parameters[name]
        }
    }
    setParameters(device, passFlag) {
        const parameters = this.parameters
        for (const paramName in parameters) {
            const parameter = parameters[paramName]
            if (parameter.passFlags & passFlag) {
                if (!parameter.scopeId) {
                    parameter.scopeId = device.scope.resolve(paramName)
                }
                parameter.scopeId.setValue(parameter.data)
            }
        }
    }
    setLightmapped(value) {
        if (value) {
            this.mask = (this.mask | MASK_AFFECT_LIGHTMAPPED) & -6
        } else {
            this.setRealtimeLightmap(MeshInstance.lightmapParamNames[0], null)
            this.setRealtimeLightmap(MeshInstance.lightmapParamNames[1], null)
            this._shaderDefs &= -4289
            this.mask = (this.mask | MASK_AFFECT_DYNAMIC) & -7
        }
    }
    setCustomAabb(aabb) {
        if (aabb) {
            if (this._customAabb) {
                this._customAabb.copy(aabb)
            } else {
                this._customAabb = aabb.clone()
            }
        } else {
            this._customAabb = null
            this._aabbVer = -1
        }
        this._setupSkinUpdate()
    }
    _setupSkinUpdate() {
        if (this._skinInstance) {
            this._skinInstance._updateBeforeCull = !this._customAabb
        }
    }
    constructor(mesh, material, node = null) {
        this.castShadow = false
        this.shadowCascadeMask = SHADOW_CASCADE_ALL
        this.cull = true
        this.drawOrder = 0
        this._drawBucket = 127
        this.visible = true
        this.visibleThisFrame = false
        this.flipFacesFactor = 1
        this.gsplatInstance = null
        this.id = PickerId.get()
        this.isVisibleFunc = null
        this.instancingData = null
        this.indirectData = null
        this.drawCommands = null
        this.meshMetaData = null
        this.parameters = {}
        this.pick = true
        this.stencilFront = null
        this.stencilBack = null
        this.transparent = false
        this._aabb = new BoundingBox()
        this._aabbVer = -1
        this._aabbMeshVer = -1
        this._customAabb = null
        this._updateAabb = true
        this._updateAabbFunc = null
        this._sortKeyShadow = 0
        this._sortKeyForward = 0
        this._sortKeyDynamic = 0
        this._layer = LAYER_WORLD
        this._material = null
        this._skinInstance = null
        this._morphInstance = null
        this._receiveShadow = true
        this._renderStyle = RENDERSTYLE_SOLID
        this._screenSpace = false
        this._shaderCache = new Map()
        this._shaderDefs = MASK_AFFECT_DYNAMIC << 16
        this._calculateSortDistance = null
        this.node = node
        this._mesh = mesh
        mesh.incRefCount()
        this.material = material
        if (mesh.vertexBuffer) {
            const format = mesh.vertexBuffer.format
            this._shaderDefs |= format.hasUv0 ? SHADERDEF_UV0 : 0
            this._shaderDefs |= format.hasUv1 ? SHADERDEF_UV1 : 0
            this._shaderDefs |= format.hasColor ? SHADERDEF_VCOLOR : 0
            this._shaderDefs |= format.hasTangents ? SHADERDEF_TANGENTS : 0
        }
        this.updateKey()
    }
}
MeshInstance.lightmapParamNames = ['texture_lightMap', 'texture_dirLightMap']

const _colorUniformName = 'uSceneColorMap'
class RenderPassColorGrab extends RenderPass {
    destroy() {
        super.destroy()
        this.releaseRenderTarget(this.colorRenderTarget)
    }
    shouldReallocate(targetRT, sourceTexture, sourceFormat) {
        const targetFormat = targetRT?.colorBuffer.format
        if (targetFormat !== sourceFormat) {
            return true
        }
        const width = sourceTexture?.width || this.device.width
        const height = sourceTexture?.height || this.device.height
        return !targetRT || width !== targetRT.width || height !== targetRT.height
    }
    allocateRenderTarget(renderTarget, sourceRenderTarget, device, format) {
        const texture = new Texture(device, {
            name: _colorUniformName,
            format,
            width: sourceRenderTarget ? sourceRenderTarget.colorBuffer.width : device.width,
            height: sourceRenderTarget ? sourceRenderTarget.colorBuffer.height : device.height,
            mipmaps: true,
            minFilter: FILTER_LINEAR_MIPMAP_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
        })
        if (renderTarget) {
            renderTarget.destroyFrameBuffers()
            renderTarget._colorBuffer = texture
            renderTarget._colorBuffers = [texture]
            renderTarget.evaluateDimensions()
        } else {
            renderTarget = new RenderTarget({
                name: 'ColorGrabRT',
                colorBuffer: texture,
                depth: false,
                stencil: false,
                autoResolve: false,
            })
        }
        return renderTarget
    }
    releaseRenderTarget(rt) {
        if (rt) {
            rt.destroyTextureBuffers()
            rt.destroy()
        }
    }
    frameUpdate() {
        const device = this.device
        const sourceRt = this.source
        const sourceFormat = sourceRt?.colorBuffer.format ?? this.device.backBufferFormat
        if (this.shouldReallocate(this.colorRenderTarget, sourceRt?.colorBuffer, sourceFormat)) {
            this.releaseRenderTarget(this.colorRenderTarget)
            this.colorRenderTarget = this.allocateRenderTarget(this.colorRenderTarget, sourceRt, device, sourceFormat)
        }
        const colorBuffer = this.colorRenderTarget.colorBuffer
        device.scope.resolve(_colorUniformName).setValue(colorBuffer)
    }
    execute() {
        const device = this.device
        const sourceRt = this.source
        const colorBuffer = this.colorRenderTarget.colorBuffer
        if (device.isWebGPU) {
            device.copyRenderTarget(sourceRt, this.colorRenderTarget, true, false)
            device.mipmapRenderer.generate(this.colorRenderTarget.colorBuffer.impl)
        } else {
            device.copyRenderTarget(sourceRt, this.colorRenderTarget, true, false)
            device.activeTexture(device.maxCombinedTextures - 1)
            device.bindTexture(colorBuffer)
            device.gl.generateMipmap(colorBuffer.impl._glTarget)
        }
    }
    constructor(...args) {
        ;(super(...args), (this.colorRenderTarget = null), (this.source = null))
    }
}

const _depthUniformName = 'uSceneDepthMap'
class RenderPassDepthGrab extends RenderPass {
    destroy() {
        super.destroy()
        this.releaseRenderTarget(this.depthRenderTarget)
    }
    shouldReallocate(targetRT, sourceTexture) {
        const width = sourceTexture?.width || this.device.width
        const height = sourceTexture?.height || this.device.height
        return !targetRT || width !== targetRT.width || height !== targetRT.height
    }
    allocateRenderTarget(renderTarget, sourceRenderTarget, device, format, isDepth) {
        const texture = Texture.createDataTexture2D(
            device,
            _depthUniformName,
            sourceRenderTarget ? sourceRenderTarget.colorBuffer.width : device.width,
            sourceRenderTarget ? sourceRenderTarget.colorBuffer.height : device.height,
            format,
        )
        if (renderTarget) {
            renderTarget.destroyFrameBuffers()
            if (isDepth) {
                renderTarget._depthBuffer = texture
            } else {
                renderTarget._colorBuffer = texture
                renderTarget._colorBuffers = [texture]
            }
            renderTarget.evaluateDimensions()
        } else {
            renderTarget = new RenderTarget({
                name: 'DepthGrabRT',
                colorBuffer: isDepth ? null : texture,
                depthBuffer: isDepth ? texture : null,
                depth: !isDepth,
                stencil: device.supportsStencil,
                autoResolve: false,
            })
        }
        return renderTarget
    }
    releaseRenderTarget(rt) {
        if (rt) {
            rt.destroyTextureBuffers()
            rt.destroy()
        }
    }
    before() {
        const camera = this.camera
        const device = this.device
        const destinationRt = camera?.renderTarget ?? device.backBuffer
        let useDepthBuffer = true
        let format = destinationRt.stencil ? PIXELFORMAT_DEPTHSTENCIL : PIXELFORMAT_DEPTH
        if (device.isWebGPU) {
            const numSamples = destinationRt.samples
            if (numSamples > 1) {
                format = PIXELFORMAT_R32F
                useDepthBuffer = false
            }
        }
        const sourceTexture = camera.renderTarget?.depthBuffer ?? camera.renderTarget?.colorBuffer
        if (this.shouldReallocate(this.depthRenderTarget, sourceTexture)) {
            this.releaseRenderTarget(this.depthRenderTarget)
            this.depthRenderTarget = this.allocateRenderTarget(
                this.depthRenderTarget,
                camera.renderTarget,
                device,
                format,
                useDepthBuffer,
            )
        }
        const colorBuffer = useDepthBuffer ? this.depthRenderTarget.depthBuffer : this.depthRenderTarget.colorBuffer
        device.scope.resolve(_depthUniformName).setValue(colorBuffer)
    }
    execute() {
        const device = this.device
        if (device.isWebGL2 && device.renderTarget.samples > 1) {
            const src = device.renderTarget.impl._glFrameBuffer
            const dest = this.depthRenderTarget
            device.renderTarget = dest
            device.updateBegin()
            this.depthRenderTarget.impl.internalResolve(
                device,
                src,
                dest.impl._glFrameBuffer,
                this.depthRenderTarget,
                device.gl.DEPTH_BUFFER_BIT,
            )
        } else {
            device.copyRenderTarget(device.renderTarget, this.depthRenderTarget, false, true)
        }
    }
    constructor(device, camera) {
        ;(super(device), (this.depthRenderTarget = null), (this.camera = null))
        this.camera = camera
    }
}

class CameraShaderParams {
    get hash() {
        if (this._hash === undefined) {
            const key = `${this.gammaCorrection}_${this.toneMapping}_${this.srgbRenderTarget}_${this.fog}_${this.ssaoEnabled}_${this.sceneDepthMapLinear}`
            this._hash = hashCode(key)
        }
        return this._hash
    }
    get defines() {
        const defines = this._defines
        if (this._definesDirty) {
            this._definesDirty = false
            defines.clear()
            if (this._sceneDepthMapLinear) defines.set('SCENE_DEPTHMAP_LINEAR', '')
            if (this.shaderOutputGamma === GAMMA_SRGB) defines.set('SCENE_COLORMAP_GAMMA', '')
            defines.set('FOG', this._fog.toUpperCase())
            defines.set('TONEMAP', tonemapNames[this._toneMapping])
            defines.set('GAMMA', gammaNames[this.shaderOutputGamma])
        }
        return defines
    }
    markDirty() {
        this._hash = undefined
        this._definesDirty = true
    }
    set fog(type) {
        if (this._fog !== type) {
            this._fog = type
            this.markDirty()
        }
    }
    get fog() {
        return this._fog
    }
    set ssaoEnabled(value) {
        if (this._ssaoEnabled !== value) {
            this._ssaoEnabled = value
            this.markDirty()
        }
    }
    get ssaoEnabled() {
        return this._ssaoEnabled
    }
    set gammaCorrection(value) {
        this._gammaCorrectionAssigned = true
        if (this._gammaCorrection !== value) {
            this._gammaCorrection = value
            this.markDirty()
        }
    }
    get gammaCorrection() {
        return this._gammaCorrection
    }
    set toneMapping(value) {
        if (this._toneMapping !== value) {
            this._toneMapping = value
            this.markDirty()
        }
    }
    get toneMapping() {
        return this._toneMapping
    }
    set srgbRenderTarget(value) {
        if (this._srgbRenderTarget !== value) {
            this._srgbRenderTarget = value
            this.markDirty()
        }
    }
    get srgbRenderTarget() {
        return this._srgbRenderTarget
    }
    set sceneDepthMapLinear(value) {
        if (this._sceneDepthMapLinear !== value) {
            this._sceneDepthMapLinear = value
            this.markDirty()
        }
    }
    get sceneDepthMapLinear() {
        return this._sceneDepthMapLinear
    }
    get shaderOutputGamma() {
        const gammaOutput = this._gammaCorrection === GAMMA_SRGB && !this._srgbRenderTarget
        return gammaOutput ? GAMMA_SRGB : GAMMA_NONE
    }
    constructor() {
        this._gammaCorrection = GAMMA_SRGB
        this._toneMapping = TONEMAP_LINEAR
        this._srgbRenderTarget = false
        this._ssaoEnabled = false
        this._fog = FOG_NONE
        this._sceneDepthMapLinear = false
        this._defines = new Map()
        this._definesDirty = true
    }
}

const _deviceCoord = new Vec3()
const _halfSize = new Vec3()
const _point = new Vec3()
const _invViewProjMat = new Mat4()
const _frustumPoints = [new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3()]
let Camera$1 = class Camera {
    destroy() {
        this.renderPassColorGrab?.destroy()
        this.renderPassColorGrab = null
        this.renderPassDepthGrab?.destroy()
        this.renderPassDepthGrab = null
        this.renderPasses.length = 0
    }
    _storeShaderMatrices(viewProjMat, jitterX, jitterY, renderVersion) {
        if (this._shaderMatricesVersion !== renderVersion) {
            this._shaderMatricesVersion = renderVersion
            this._viewProjPrevious.copy(this._viewProjCurrent ?? viewProjMat)
            this._viewProjCurrent ?? (this._viewProjCurrent = new Mat4())
            this._viewProjCurrent.copy(viewProjMat)
            this._viewProjInverse.invert(viewProjMat)
            this._jitters[2] = this._jitters[0]
            this._jitters[3] = this._jitters[1]
            this._jitters[0] = jitterX
            this._jitters[1] = jitterY
        }
    }
    get fullSizeClearRect() {
        const rect = this._scissorRectClear ? this.scissorRect : this._rect
        return rect.x === 0 && rect.y === 0 && rect.z === 1 && rect.w === 1
    }
    set aspectRatio(newValue) {
        if (this._aspectRatio !== newValue) {
            this._aspectRatio = newValue
            this._projMatDirty = true
        }
    }
    get aspectRatio() {
        return this.xr?.active ? this._xrProperties.aspectRatio : this._aspectRatio
    }
    set aspectRatioMode(newValue) {
        if (this._aspectRatioMode !== newValue) {
            this._aspectRatioMode = newValue
            this._projMatDirty = true
        }
    }
    get aspectRatioMode() {
        return this._aspectRatioMode
    }
    set calculateProjection(newValue) {
        this._calculateProjection = newValue
        this._projMatDirty = true
    }
    get calculateProjection() {
        return this._calculateProjection
    }
    set calculateTransform(newValue) {
        this._calculateTransform = newValue
    }
    get calculateTransform() {
        return this._calculateTransform
    }
    set clearColor(newValue) {
        this._clearColor.copy(newValue)
    }
    get clearColor() {
        return this._clearColor
    }
    set clearColorBuffer(newValue) {
        this._clearColorBuffer = newValue
    }
    get clearColorBuffer() {
        return this._clearColorBuffer
    }
    set clearDepth(newValue) {
        this._clearDepth = newValue
    }
    get clearDepth() {
        return this._clearDepth
    }
    set clearDepthBuffer(newValue) {
        this._clearDepthBuffer = newValue
    }
    get clearDepthBuffer() {
        return this._clearDepthBuffer
    }
    set clearStencil(newValue) {
        this._clearStencil = newValue
    }
    get clearStencil() {
        return this._clearStencil
    }
    set clearStencilBuffer(newValue) {
        this._clearStencilBuffer = newValue
    }
    get clearStencilBuffer() {
        return this._clearStencilBuffer
    }
    set cullFaces(newValue) {
        this._cullFaces = newValue
    }
    get cullFaces() {
        return this._cullFaces
    }
    set farClip(newValue) {
        if (this._farClip !== newValue) {
            this._farClip = newValue
            this._projMatDirty = true
        }
    }
    get farClip() {
        return this.xr?.active ? this._xrProperties.farClip : this._farClip
    }
    set flipFaces(newValue) {
        this._flipFaces = newValue
    }
    get flipFaces() {
        return this._flipFaces
    }
    set fov(newValue) {
        if (this._fov !== newValue) {
            this._fov = newValue
            this._projMatDirty = true
        }
    }
    get fov() {
        return this.xr?.active ? this._xrProperties.fov : this._fov
    }
    set frustumCulling(newValue) {
        this._frustumCulling = newValue
    }
    get frustumCulling() {
        return this._frustumCulling
    }
    set horizontalFov(newValue) {
        if (this._horizontalFov !== newValue) {
            this._horizontalFov = newValue
            this._projMatDirty = true
        }
    }
    get horizontalFov() {
        return this.xr?.active ? this._xrProperties.horizontalFov : this._horizontalFov
    }
    set layers(newValue) {
        this._layers = newValue.slice(0)
        this._layersSet = new Set(this._layers)
    }
    get layers() {
        return this._layers
    }
    get layersSet() {
        return this._layersSet
    }
    set nearClip(newValue) {
        if (this._nearClip !== newValue) {
            this._nearClip = newValue
            this._projMatDirty = true
        }
    }
    get nearClip() {
        return this.xr?.active ? this._xrProperties.nearClip : this._nearClip
    }
    set node(newValue) {
        this._node = newValue
    }
    get node() {
        return this._node
    }
    set orthoHeight(newValue) {
        if (this._orthoHeight !== newValue) {
            this._orthoHeight = newValue
            this._projMatDirty = true
        }
    }
    get orthoHeight() {
        return this._orthoHeight
    }
    set projection(newValue) {
        if (this._projection !== newValue) {
            this._projection = newValue
            this._projMatDirty = true
        }
    }
    get projection() {
        return this._projection
    }
    get projectionMatrix() {
        this._evaluateProjectionMatrix()
        return this._projMat
    }
    set rect(newValue) {
        this._rect.copy(newValue)
    }
    get rect() {
        return this._rect
    }
    set renderTarget(newValue) {
        this._renderTarget = newValue
    }
    get renderTarget() {
        return this._renderTarget
    }
    set scissorRect(newValue) {
        this._scissorRect.copy(newValue)
    }
    get scissorRect() {
        return this._scissorRect
    }
    get viewMatrix() {
        if (this._viewMatDirty) {
            const wtm = this._node.getWorldTransform()
            this._viewMat.copy(wtm).invert()
            this._viewMatDirty = false
        }
        return this._viewMat
    }
    set aperture(newValue) {
        this._aperture = newValue
    }
    get aperture() {
        return this._aperture
    }
    set sensitivity(newValue) {
        this._sensitivity = newValue
    }
    get sensitivity() {
        return this._sensitivity
    }
    set shutter(newValue) {
        this._shutter = newValue
    }
    get shutter() {
        return this._shutter
    }
    set xr(newValue) {
        if (this._xr !== newValue) {
            this._xr = newValue
            this._projMatDirty = true
        }
    }
    get xr() {
        return this._xr
    }
    clone() {
        return new Camera().copy(this)
    }
    copy(other) {
        this._aspectRatio = other._aspectRatio
        this._farClip = other._farClip
        this._fov = other._fov
        this._horizontalFov = other._horizontalFov
        this._nearClip = other._nearClip
        this._xrProperties.aspectRatio = other._xrProperties.aspectRatio
        this._xrProperties.farClip = other._xrProperties.farClip
        this._xrProperties.fov = other._xrProperties.fov
        this._xrProperties.horizontalFov = other._xrProperties.horizontalFov
        this._xrProperties.nearClip = other._xrProperties.nearClip
        this.aspectRatioMode = other.aspectRatioMode
        this.calculateProjection = other.calculateProjection
        this.calculateTransform = other.calculateTransform
        this.clearColor = other.clearColor
        this.clearColorBuffer = other.clearColorBuffer
        this.clearDepth = other.clearDepth
        this.clearDepthBuffer = other.clearDepthBuffer
        this.clearStencil = other.clearStencil
        this.clearStencilBuffer = other.clearStencilBuffer
        this.cullFaces = other.cullFaces
        this.flipFaces = other.flipFaces
        this.frustumCulling = other.frustumCulling
        this.layers = other.layers
        this.orthoHeight = other.orthoHeight
        this.projection = other.projection
        this.rect = other.rect
        this.renderTarget = other.renderTarget
        this.scissorRect = other.scissorRect
        this.aperture = other.aperture
        this.shutter = other.shutter
        this.sensitivity = other.sensitivity
        this.shaderPassInfo = other.shaderPassInfo
        this.jitter = other.jitter
        this._projMatDirty = true
        return this
    }
    _enableRenderPassColorGrab(device, enable) {
        if (enable) {
            if (!this.renderPassColorGrab) {
                this.renderPassColorGrab = new RenderPassColorGrab(device)
            }
        } else {
            this.renderPassColorGrab?.destroy()
            this.renderPassColorGrab = null
        }
    }
    _enableRenderPassDepthGrab(device, renderer, enable) {
        if (enable) {
            if (!this.renderPassDepthGrab) {
                this.renderPassDepthGrab = new RenderPassDepthGrab(device, this)
            }
        } else {
            this.renderPassDepthGrab?.destroy()
            this.renderPassDepthGrab = null
        }
    }
    _updateViewProjMat() {
        if (this._projMatDirty || this._viewMatDirty || this._viewProjMatDirty) {
            this._viewProjMat.mul2(this.projectionMatrix, this.viewMatrix)
            this._viewProjMatDirty = false
        }
    }
    worldToScreen(worldCoord, cw, ch, screenCoord = new Vec3()) {
        this._updateViewProjMat()
        this._viewProjMat.transformPoint(worldCoord, screenCoord)
        const vpm = this._viewProjMat.data
        const w = worldCoord.x * vpm[3] + worldCoord.y * vpm[7] + worldCoord.z * vpm[11] + 1 * vpm[15]
        screenCoord.x = (screenCoord.x / w + 1) * 0.5
        screenCoord.y = (1 - screenCoord.y / w) * 0.5
        const { x: rx, y: ry, z: rw, w: rh } = this._rect
        screenCoord.x = screenCoord.x * rw * cw + rx * cw
        screenCoord.y = screenCoord.y * rh * ch + (1 - ry - rh) * ch
        return screenCoord
    }
    screenToWorld(x, y, z, cw, ch, worldCoord = new Vec3()) {
        const { x: rx, y: ry, z: rw, w: rh } = this._rect
        const range = this.farClip - this.nearClip
        _deviceCoord.set((x - rx * cw) / (rw * cw), 1 - (y - (1 - ry - rh) * ch) / (rh * ch), z / range)
        _deviceCoord.mulScalar(2)
        _deviceCoord.sub(Vec3.ONE)
        if (this._projection === PROJECTION_PERSPECTIVE) {
            Mat4._getPerspectiveHalfSize(_halfSize, this.fov, this.aspectRatio, this.nearClip, this.horizontalFov)
            _halfSize.x *= _deviceCoord.x
            _halfSize.y *= _deviceCoord.y
            const invView = this._node.getWorldTransform()
            _halfSize.z = -this.nearClip
            invView.transformPoint(_halfSize, _point)
            const cameraPos = this._node.getPosition()
            worldCoord.sub2(_point, cameraPos)
            worldCoord.normalize()
            worldCoord.mulScalar(z)
            worldCoord.add(cameraPos)
        } else {
            this._updateViewProjMat()
            _invViewProjMat.copy(this._viewProjMat).invert()
            _invViewProjMat.transformPoint(_deviceCoord, worldCoord)
        }
        return worldCoord
    }
    _evaluateProjectionMatrix() {
        if (this._projMatDirty) {
            if (this._projection === PROJECTION_PERSPECTIVE) {
                this._projMat.setPerspective(
                    this.fov,
                    this.aspectRatio,
                    this.nearClip,
                    this.farClip,
                    this.horizontalFov,
                )
                this._projMatSkybox.copy(this._projMat)
            } else {
                const y = this._orthoHeight
                const x = y * this.aspectRatio
                this._projMat.setOrtho(-x, x, -y, y, this.nearClip, this.farClip)
                this._projMatSkybox.setPerspective(this.fov, this.aspectRatio, this.nearClip, this.farClip)
            }
            this._projMatDirty = false
        }
    }
    getProjectionMatrixSkybox() {
        this._evaluateProjectionMatrix()
        return this._projMatSkybox
    }
    getExposure() {
        const ev100 = Math.log2((((this._aperture * this._aperture) / this._shutter) * 100.0) / this._sensitivity)
        return 1.0 / (Math.pow(2.0, ev100) * 1.2)
    }
    getScreenSize(sphere) {
        if (this._projection === PROJECTION_PERSPECTIVE) {
            const distance = this._node.getPosition().distance(sphere.center)
            if (distance < sphere.radius) {
                return 1
            }
            const viewAngle = Math.asin(sphere.radius / distance)
            const sphereViewHeight = Math.tan(viewAngle)
            const screenViewHeight = Math.tan((this.fov / 2) * math.DEG_TO_RAD)
            return Math.min(sphereViewHeight / screenViewHeight, 1)
        }
        return math.clamp(sphere.radius / this._orthoHeight, 0, 1)
    }
    getFrustumCorners(near = this.nearClip, far = this.farClip) {
        const fov = this.fov * math.DEG_TO_RAD
        let x, y
        if (this.projection === PROJECTION_PERSPECTIVE) {
            if (this.horizontalFov) {
                x = near * Math.tan(fov / 2.0)
                y = x / this.aspectRatio
            } else {
                y = near * Math.tan(fov / 2.0)
                x = y * this.aspectRatio
            }
        } else {
            y = this._orthoHeight
            x = y * this.aspectRatio
        }
        const points = _frustumPoints
        points[0].x = x
        points[0].y = -y
        points[0].z = -near
        points[1].x = x
        points[1].y = y
        points[1].z = -near
        points[2].x = -x
        points[2].y = y
        points[2].z = -near
        points[3].x = -x
        points[3].y = -y
        points[3].z = -near
        if (this._projection === PROJECTION_PERSPECTIVE) {
            if (this.horizontalFov) {
                x = far * Math.tan(fov / 2.0)
                y = x / this.aspectRatio
            } else {
                y = far * Math.tan(fov / 2.0)
                x = y * this.aspectRatio
            }
        }
        points[4].x = x
        points[4].y = -y
        points[4].z = -far
        points[5].x = x
        points[5].y = y
        points[5].z = -far
        points[6].x = -x
        points[6].y = y
        points[6].z = -far
        points[7].x = -x
        points[7].y = -y
        points[7].z = -far
        return points
    }
    setXrProperties(properties) {
        Object.assign(this._xrProperties, properties)
        this._projMatDirty = true
    }
    fillShaderParams(output) {
        const f = this._farClip
        output[0] = 1 / f
        output[1] = f
        output[2] = this._nearClip
        output[3] = this._projection === PROJECTION_ORTHOGRAPHIC ? 1 : 0
        return output
    }
    constructor() {
        this.shaderPassInfo = null
        this.renderPassColorGrab = null
        this.renderPassDepthGrab = null
        this.fogParams = null
        this.shaderParams = new CameraShaderParams()
        this.renderPasses = []
        this.jitter = 0
        this._aspectRatio = 16 / 9
        this._aspectRatioMode = ASPECT_AUTO
        this._calculateProjection = null
        this._calculateTransform = null
        this._clearColor = new Color(0.75, 0.75, 0.75, 1)
        this._clearColorBuffer = true
        this._clearDepth = 1
        this._clearDepthBuffer = true
        this._clearStencil = 0
        this._clearStencilBuffer = true
        this._cullFaces = true
        this._farClip = 1000
        this._flipFaces = false
        this._fov = 45
        this._frustumCulling = true
        this._horizontalFov = false
        this._layers = [LAYERID_WORLD, LAYERID_DEPTH, LAYERID_SKYBOX, LAYERID_UI, LAYERID_IMMEDIATE]
        this._layersSet = new Set(this._layers)
        this._nearClip = 0.1
        this._node = null
        this._orthoHeight = 10
        this._projection = PROJECTION_PERSPECTIVE
        this._rect = new Vec4(0, 0, 1, 1)
        this._renderTarget = null
        this._scissorRect = new Vec4(0, 0, 1, 1)
        this._scissorRectClear = false
        this._aperture = 16.0
        this._shutter = 1.0 / 1000.0
        this._sensitivity = 1000
        this._projMat = new Mat4()
        this._projMatDirty = true
        this._projMatSkybox = new Mat4()
        this._viewMat = new Mat4()
        this._viewMatDirty = true
        this._viewProjMat = new Mat4()
        this._viewProjMatDirty = true
        this._shaderMatricesVersion = 0
        this._viewProjInverse = new Mat4()
        this._viewProjCurrent = null
        this._viewProjPrevious = new Mat4()
        this._jitters = [0, 0, 0, 0]
        this.frustum = new Frustum()
        this._xr = null
        this._xrProperties = {
            horizontalFov: this._horizontalFov,
            fov: this._fov,
            aspectRatio: this._aspectRatio,
            farClip: this._farClip,
            nearClip: this._nearClip,
        }
    }
}

const scaleCompensatePosTransform = new Mat4()
const scaleCompensatePos = new Vec3()
const scaleCompensateRot = new Quat()
const scaleCompensateRot2 = new Quat()
const scaleCompensateScale = new Vec3()
const scaleCompensateScaleForParent = new Vec3()
const tmpMat4 = new Mat4()
const tmpQuat = new Quat()
const position = new Vec3()
const invParentWtm = new Mat4()
const rotation$5 = new Quat()
const invParentRot = new Quat()
const matrix = new Mat4()
const target = new Vec3()
const up$2 = new Vec3()
function createTest(attr, value) {
    if (attr instanceof Function) {
        return attr
    }
    return (node) => {
        let x = node[attr]
        if (x instanceof Function) {
            x = x()
        }
        return x === value
    }
}
function findNode(node, test) {
    if (test(node)) {
        return node
    }
    const children = node._children
    const len = children.length
    for (let i = 0; i < len; ++i) {
        const result = findNode(children[i], test)
        if (result) {
            return result
        }
    }
    return null
}
class GraphNode extends EventHandler {
    get right() {
        if (!this._right) {
            this._right = new Vec3()
        }
        return this.getWorldTransform().getX(this._right).normalize()
    }
    get up() {
        if (!this._up) {
            this._up = new Vec3()
        }
        return this.getWorldTransform().getY(this._up).normalize()
    }
    get forward() {
        if (!this._forward) {
            this._forward = new Vec3()
        }
        return this.getWorldTransform().getZ(this._forward).normalize().mulScalar(-1)
    }
    get normalMatrix() {
        const normalMat = this._normalMatrix
        if (this._dirtyNormal) {
            normalMat.invertMat4(this.getWorldTransform()).transpose()
            this._dirtyNormal = false
        }
        return normalMat
    }
    set enabled(enabled) {
        if (this._enabled !== enabled) {
            this._enabled = enabled
            if ((enabled && this._parent?.enabled) || !enabled) {
                this._notifyHierarchyStateChanged(this, enabled)
            }
        }
    }
    get enabled() {
        return this._enabled && this._enabledInHierarchy
    }
    get parent() {
        return this._parent
    }
    get path() {
        let node = this._parent
        if (!node) {
            return ''
        }
        let result = this.name
        while (node && node._parent) {
            result = `${node.name}/${result}`
            node = node._parent
        }
        return result
    }
    get root() {
        let result = this
        while (result._parent) {
            result = result._parent
        }
        return result
    }
    get children() {
        return this._children
    }
    get graphDepth() {
        return this._graphDepth
    }
    _notifyHierarchyStateChanged(node, enabled) {
        node._onHierarchyStateChanged(enabled)
        const c = node._children
        for (let i = 0, len = c.length; i < len; i++) {
            if (c[i]._enabled) {
                this._notifyHierarchyStateChanged(c[i], enabled)
            }
        }
    }
    _onHierarchyStateChanged(enabled) {
        this._enabledInHierarchy = enabled
        if (enabled && !this._frozen) {
            this._unfreezeParentToRoot()
        }
    }
    _cloneInternal(clone) {
        clone.name = this.name
        const tags = this.tags._list
        clone.tags.clear()
        for (let i = 0; i < tags.length; i++) {
            clone.tags.add(tags[i])
        }
        clone.localPosition.copy(this.localPosition)
        clone.localRotation.copy(this.localRotation)
        clone.localScale.copy(this.localScale)
        clone.localEulerAngles.copy(this.localEulerAngles)
        clone.position.copy(this.position)
        clone.rotation.copy(this.rotation)
        clone.eulerAngles.copy(this.eulerAngles)
        clone.localTransform.copy(this.localTransform)
        clone._dirtyLocal = this._dirtyLocal
        clone.worldTransform.copy(this.worldTransform)
        clone._dirtyWorld = this._dirtyWorld
        clone._dirtyNormal = this._dirtyNormal
        clone._aabbVer = this._aabbVer + 1
        clone._enabled = this._enabled
        clone.scaleCompensation = this.scaleCompensation
        clone._enabledInHierarchy = false
    }
    clone() {
        const clone = new this.constructor()
        this._cloneInternal(clone)
        return clone
    }
    copy(source) {
        source._cloneInternal(this)
        return this
    }
    destroy() {
        this.remove()
        const children = this._children
        while (children.length) {
            const child = children.pop()
            child._parent = null
            child.destroy()
        }
        this.fire('destroy', this)
        this.off()
    }
    find(attr, value) {
        const results = []
        const test = createTest(attr, value)
        this.forEach((node) => {
            if (test(node)) {
                results.push(node)
            }
        })
        return results
    }
    findOne(attr, value) {
        const test = createTest(attr, value)
        return findNode(this, test)
    }
    findByTag(...query) {
        const results = []
        const queryNode = (node, checkNode) => {
            if (checkNode && node.tags.has(...query)) {
                results.push(node)
            }
            for (let i = 0; i < node._children.length; i++) {
                queryNode(node._children[i], true)
            }
        }
        queryNode(this, false)
        return results
    }
    findByName(name) {
        return this.findOne('name', name)
    }
    findByPath(path) {
        const parts = Array.isArray(path) ? path : path.split('/')
        let result = this
        for (let i = 0, imax = parts.length; i < imax; ++i) {
            result = result.children.find((c) => c.name === parts[i])
            if (!result) {
                return null
            }
        }
        return result
    }
    forEach(callback, thisArg) {
        callback.call(thisArg, this)
        const children = this._children
        const len = children.length
        for (let i = 0; i < len; ++i) {
            children[i].forEach(callback, thisArg)
        }
    }
    isDescendantOf(node) {
        let parent = this._parent
        while (parent) {
            if (parent === node) {
                return true
            }
            parent = parent._parent
        }
        return false
    }
    isAncestorOf(node) {
        return node.isDescendantOf(this)
    }
    getEulerAngles() {
        this.getWorldTransform().getEulerAngles(this.eulerAngles)
        return this.eulerAngles
    }
    getLocalEulerAngles() {
        this.localRotation.getEulerAngles(this.localEulerAngles)
        return this.localEulerAngles
    }
    getLocalPosition() {
        return this.localPosition
    }
    getLocalRotation() {
        return this.localRotation
    }
    getLocalScale() {
        return this.localScale
    }
    getLocalTransform() {
        if (this._dirtyLocal) {
            this.localTransform.setTRS(this.localPosition, this.localRotation, this.localScale)
            this._dirtyLocal = false
        }
        return this.localTransform
    }
    getPosition() {
        this.getWorldTransform().getTranslation(this.position)
        return this.position
    }
    getRotation() {
        this.rotation.setFromMat4(this.getWorldTransform())
        return this.rotation
    }
    getScale() {
        if (!this._scale) {
            this._scale = new Vec3()
        }
        return this.getWorldTransform().getScale(this._scale)
    }
    getWorldTransform() {
        if (!this._dirtyLocal && !this._dirtyWorld) {
            return this.worldTransform
        }
        if (this._parent) {
            this._parent.getWorldTransform()
        }
        this._sync()
        return this.worldTransform
    }
    get worldScaleSign() {
        if (this._worldScaleSign === 0) {
            this._worldScaleSign = this.getWorldTransform().scaleSign
        }
        return this._worldScaleSign
    }
    remove() {
        this._parent?.removeChild(this)
    }
    reparent(parent, index) {
        this.remove()
        if (parent) {
            if (index >= 0) {
                parent.insertChild(this, index)
            } else {
                parent.addChild(this)
            }
        }
    }
    setLocalEulerAngles(x, y, z) {
        this.localRotation.setFromEulerAngles(x, y, z)
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    setLocalPosition(x, y, z) {
        if (x instanceof Vec3) {
            this.localPosition.copy(x)
        } else {
            this.localPosition.set(x, y, z)
        }
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    setLocalRotation(x, y, z, w) {
        if (x instanceof Quat) {
            this.localRotation.copy(x)
        } else {
            this.localRotation.set(x, y, z, w)
        }
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    setLocalScale(x, y, z) {
        if (x instanceof Vec3) {
            this.localScale.copy(x)
        } else {
            this.localScale.set(x, y, z)
        }
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    _dirtifyLocal() {
        if (!this._dirtyLocal) {
            this._dirtyLocal = true
            if (!this._dirtyWorld) {
                this._dirtifyWorld()
            }
        }
    }
    _unfreezeParentToRoot() {
        let p = this._parent
        while (p) {
            p._frozen = false
            p = p._parent
        }
    }
    _dirtifyWorld() {
        if (!this._dirtyWorld) {
            this._unfreezeParentToRoot()
        }
        this._dirtifyWorldInternal()
    }
    _dirtifyWorldInternal() {
        if (!this._dirtyWorld) {
            this._frozen = false
            this._dirtyWorld = true
            for (let i = 0; i < this._children.length; i++) {
                if (!this._children[i]._dirtyWorld) {
                    this._children[i]._dirtifyWorldInternal()
                }
            }
        }
        this._dirtyNormal = true
        this._worldScaleSign = 0
        this._aabbVer++
    }
    setPosition(x, y, z) {
        if (x instanceof Vec3) {
            position.copy(x)
        } else {
            position.set(x, y, z)
        }
        if (this._parent === null) {
            this.localPosition.copy(position)
        } else {
            invParentWtm.copy(this._parent.getWorldTransform()).invert()
            invParentWtm.transformPoint(position, this.localPosition)
        }
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    setRotation(x, y, z, w) {
        if (x instanceof Quat) {
            rotation$5.copy(x)
        } else {
            rotation$5.set(x, y, z, w)
        }
        if (this._parent === null) {
            this.localRotation.copy(rotation$5)
        } else {
            const parentRot = this._parent.getRotation()
            invParentRot.copy(parentRot).invert()
            this.localRotation.copy(invParentRot).mul(rotation$5)
        }
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    setPositionAndRotation(position, rotation) {
        if (this._parent === null) {
            this.localPosition.copy(position)
            this.localRotation.copy(rotation)
        } else {
            const parentWtm = this._parent.getWorldTransform()
            invParentWtm.copy(parentWtm).invert()
            invParentWtm.transformPoint(position, this.localPosition)
            this.localRotation.setFromMat4(invParentWtm).mul(rotation)
        }
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    setEulerAngles(x, y, z) {
        this.localRotation.setFromEulerAngles(x, y, z)
        if (this._parent !== null) {
            const parentRot = this._parent.getRotation()
            invParentRot.copy(parentRot).invert()
            this.localRotation.mul2(invParentRot, this.localRotation)
        }
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    addChild(node) {
        this._prepareInsertChild(node)
        this._children.push(node)
        this._onInsertChild(node)
    }
    addChildAndSaveTransform(node) {
        const wPos = node.getPosition()
        const wRot = node.getRotation()
        this._prepareInsertChild(node)
        node.setPosition(tmpMat4.copy(this.worldTransform).invert().transformPoint(wPos))
        node.setRotation(tmpQuat.copy(this.getRotation()).invert().mul(wRot))
        this._children.push(node)
        this._onInsertChild(node)
    }
    insertChild(node, index) {
        this._prepareInsertChild(node)
        this._children.splice(index, 0, node)
        this._onInsertChild(node)
    }
    _prepareInsertChild(node) {
        node.remove()
    }
    _fireOnHierarchy(name, nameHierarchy, parent) {
        this.fire(name, parent)
        for (let i = 0; i < this._children.length; i++) {
            this._children[i]._fireOnHierarchy(nameHierarchy, nameHierarchy, parent)
        }
    }
    _onInsertChild(node) {
        node._parent = this
        const enabledInHierarchy = node._enabled && this.enabled
        if (node._enabledInHierarchy !== enabledInHierarchy) {
            node._enabledInHierarchy = enabledInHierarchy
            node._notifyHierarchyStateChanged(node, enabledInHierarchy)
        }
        node._updateGraphDepth()
        node._dirtifyWorld()
        if (this._frozen) {
            node._unfreezeParentToRoot()
        }
        node._fireOnHierarchy('insert', 'inserthierarchy', this)
        if (this.fire) this.fire('childinsert', node)
    }
    _updateGraphDepth() {
        this._graphDepth = this._parent ? this._parent._graphDepth + 1 : 0
        for (let i = 0, len = this._children.length; i < len; i++) {
            this._children[i]._updateGraphDepth()
        }
    }
    removeChild(child) {
        const index = this._children.indexOf(child)
        if (index === -1) {
            return
        }
        this._children.splice(index, 1)
        child._parent = null
        child._fireOnHierarchy('remove', 'removehierarchy', this)
        this.fire('childremove', child)
    }
    _sync() {
        if (this._dirtyLocal) {
            this.localTransform.setTRS(this.localPosition, this.localRotation, this.localScale)
            this._dirtyLocal = false
        }
        if (this._dirtyWorld) {
            if (this._parent === null) {
                this.worldTransform.copy(this.localTransform)
            } else {
                if (this.scaleCompensation) {
                    let parentWorldScale
                    const parent = this._parent
                    let scale = this.localScale
                    let parentToUseScaleFrom = parent
                    if (parentToUseScaleFrom) {
                        while (parentToUseScaleFrom && parentToUseScaleFrom.scaleCompensation) {
                            parentToUseScaleFrom = parentToUseScaleFrom._parent
                        }
                        if (parentToUseScaleFrom) {
                            parentToUseScaleFrom = parentToUseScaleFrom._parent
                            if (parentToUseScaleFrom) {
                                parentWorldScale = parentToUseScaleFrom.worldTransform.getScale()
                                scaleCompensateScale.mul2(parentWorldScale, this.localScale)
                                scale = scaleCompensateScale
                            }
                        }
                    }
                    scaleCompensateRot2.setFromMat4(parent.worldTransform)
                    scaleCompensateRot.mul2(scaleCompensateRot2, this.localRotation)
                    let tmatrix = parent.worldTransform
                    if (parent.scaleCompensation) {
                        scaleCompensateScaleForParent.mul2(parentWorldScale, parent.getLocalScale())
                        scaleCompensatePosTransform.setTRS(
                            parent.worldTransform.getTranslation(scaleCompensatePos),
                            scaleCompensateRot2,
                            scaleCompensateScaleForParent,
                        )
                        tmatrix = scaleCompensatePosTransform
                    }
                    tmatrix.transformPoint(this.localPosition, scaleCompensatePos)
                    this.worldTransform.setTRS(scaleCompensatePos, scaleCompensateRot, scale)
                } else {
                    this.worldTransform.mulAffine2(this._parent.worldTransform, this.localTransform)
                }
            }
            this._dirtyWorld = false
        }
    }
    syncHierarchy() {
        if (!this._enabled) {
            return
        }
        if (this._frozen) {
            return
        }
        this._frozen = true
        if (this._dirtyLocal || this._dirtyWorld) {
            this._sync()
        }
        const children = this._children
        for (let i = 0, len = children.length; i < len; i++) {
            children[i].syncHierarchy()
        }
    }
    lookAt(x, y, z, ux = 0, uy = 1, uz = 0) {
        if (x instanceof Vec3) {
            target.copy(x)
            if (y instanceof Vec3) {
                up$2.copy(y)
            } else {
                up$2.copy(Vec3.UP)
            }
        } else if (z === undefined) {
            return
        } else {
            target.set(x, y, z)
            up$2.set(ux, uy, uz)
        }
        matrix.setLookAt(this.getPosition(), target, up$2)
        rotation$5.setFromMat4(matrix)
        this.setRotation(rotation$5)
    }
    translate(x, y, z) {
        if (x instanceof Vec3) {
            position.copy(x)
        } else {
            position.set(x, y, z)
        }
        position.add(this.getPosition())
        this.setPosition(position)
    }
    translateLocal(x, y, z) {
        if (x instanceof Vec3) {
            position.copy(x)
        } else {
            position.set(x, y, z)
        }
        this.localRotation.transformVector(position, position)
        this.localPosition.add(position)
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    rotate(x, y, z) {
        rotation$5.setFromEulerAngles(x, y, z)
        if (this._parent === null) {
            this.localRotation.mul2(rotation$5, this.localRotation)
        } else {
            const rot = this.getRotation()
            const parentRot = this._parent.getRotation()
            invParentRot.copy(parentRot).invert()
            rotation$5.mul2(invParentRot, rotation$5)
            this.localRotation.mul2(rotation$5, rot)
        }
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    rotateLocal(x, y, z) {
        rotation$5.setFromEulerAngles(x, y, z)
        this.localRotation.mul(rotation$5)
        if (!this._dirtyLocal) {
            this._dirtifyLocal()
        }
    }
    constructor(name = 'Untitled') {
        ;(super(),
            (this.tags = new Tags(this)),
            (this.localPosition = new Vec3()),
            (this.localRotation = new Quat()),
            (this.localScale = new Vec3(1, 1, 1)),
            (this.localEulerAngles = new Vec3()),
            (this.position = new Vec3()),
            (this.rotation = new Quat()),
            (this.eulerAngles = new Vec3()),
            (this._scale = null),
            (this.localTransform = new Mat4()),
            (this._dirtyLocal = false),
            (this._aabbVer = 0),
            (this._frozen = false),
            (this.worldTransform = new Mat4()),
            (this._dirtyWorld = false),
            (this._worldScaleSign = 0),
            (this._normalMatrix = new Mat3()),
            (this._dirtyNormal = true),
            (this._right = null),
            (this._up = null),
            (this._forward = null),
            (this._parent = null),
            (this._children = []),
            (this._graphDepth = 0),
            (this._enabled = true),
            (this._enabledInHierarchy = false),
            (this.scaleCompensation = false))
        this.name = name
    }
}

const _viewMat$1 = new Mat4()
const _viewProjMat$1 = new Mat4()
const _viewportMatrix = new Mat4()
class LightCamera {
    static create(name, lightType, face) {
        const camera = new Camera$1()
        camera.node = new GraphNode(name)
        camera.aspectRatio = 1
        camera.aspectRatioMode = ASPECT_MANUAL
        camera._scissorRectClear = true
        switch (lightType) {
            case LIGHTTYPE_OMNI:
                camera.node.setRotation(LightCamera.pointLightRotations[face])
                camera.fov = 90
                camera.projection = PROJECTION_PERSPECTIVE
                break
            case LIGHTTYPE_SPOT:
                camera.projection = PROJECTION_PERSPECTIVE
                break
            case LIGHTTYPE_DIRECTIONAL:
                camera.projection = PROJECTION_ORTHOGRAPHIC
                break
        }
        return camera
    }
    static evalSpotCookieMatrix(light) {
        let cookieCamera = LightCamera._spotCookieCamera
        if (!cookieCamera) {
            cookieCamera = LightCamera.create('SpotCookieCamera', LIGHTTYPE_SPOT)
            LightCamera._spotCookieCamera = cookieCamera
        }
        cookieCamera.fov = light._outerConeAngle * 2
        const cookieNode = cookieCamera._node
        cookieNode.setPosition(light._node.getPosition())
        cookieNode.setRotation(light._node.getRotation())
        cookieNode.rotateLocal(-90, 0, 0)
        _viewMat$1.setTRS(cookieNode.getPosition(), cookieNode.getRotation(), Vec3.ONE).invert()
        _viewProjMat$1.mul2(cookieCamera.projectionMatrix, _viewMat$1)
        const cookieMatrix = light.cookieMatrix
        const rectViewport = light.atlasViewport
        _viewportMatrix.setViewport(rectViewport.x, rectViewport.y, rectViewport.z, rectViewport.w)
        cookieMatrix.mul2(_viewportMatrix, _viewProjMat$1)
        return cookieMatrix
    }
}
LightCamera.pointLightRotations = [
    new Quat().setFromEulerAngles(0, 90, 180),
    new Quat().setFromEulerAngles(0, -90, 180),
    new Quat().setFromEulerAngles(90, 0, 0),
    new Quat().setFromEulerAngles(-90, 0, 0),
    new Quat().setFromEulerAngles(0, 180, 180),
    new Quat().setFromEulerAngles(0, 0, 180),
]
LightCamera._spotCookieCamera = null

const tempVec3$1 = new Vec3()
const tempAreaLightSizes = new Float32Array(6)
const areaHalfAxisWidth = new Vec3(-0.5, 0, 0)
const areaHalfAxisHeight = new Vec3(0, 0, 0.5)
const TextureIndexFloat = {
    POSITION_RANGE: 0,
    DIRECTION_FLAGS: 1,
    COLOR_ANGLES_BIAS: 2,
    PROJ_MAT_0: 3,
    ATLAS_VIEWPORT: 3,
    PROJ_MAT_1: 4,
    PROJ_MAT_2: 5,
    PROJ_MAT_3: 6,
    AREA_DATA_WIDTH: 7,
    AREA_DATA_HEIGHT: 8,
    COUNT: 9,
}
const enums = {
    LIGHTSHAPE_PUNCTUAL: `${LIGHTSHAPE_PUNCTUAL}u`,
    LIGHTSHAPE_RECT: `${LIGHTSHAPE_RECT}u`,
    LIGHTSHAPE_DISK: `${LIGHTSHAPE_DISK}u`,
    LIGHTSHAPE_SPHERE: `${LIGHTSHAPE_SPHERE}u`,
    LIGHT_COLOR_DIVIDER: `${LIGHT_COLOR_DIVIDER}.0`,
}
const buildShaderDefines = (object, prefix) => {
    return Object.keys(object)
        .map((key) => `#define {${prefix}${key}} ${object[key]}`)
        .join('\n')
}
const lightBufferDefines = `\n
		${buildShaderDefines(TextureIndexFloat, 'CLUSTER_TEXTURE_')}
		${buildShaderDefines(enums, '')}
`
class LightsBuffer {
    destroy() {
        this.lightsTexture?.destroy()
        this.lightsTexture = null
    }
    createTexture(device, width, height, format, name) {
        const tex = new Texture(device, {
            name: name,
            width: width,
            height: height,
            mipmaps: false,
            format: format,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            type: TEXTURETYPE_DEFAULT,
            magFilter: FILTER_NEAREST,
            minFilter: FILTER_NEAREST,
            anisotropy: 1,
        })
        return tex
    }
    setBounds(min, delta) {
        this.boundsMin.copy(min)
        this.boundsDelta.copy(delta)
    }
    uploadTextures() {
        this.lightsTexture.lock().set(this.lightsFloat)
        this.lightsTexture.unlock()
    }
    updateUniforms() {
        this._lightsTextureId.setValue(this.lightsTexture)
    }
    getSpotDirection(direction, spot) {
        const mat = spot._node.getWorldTransform()
        mat.getY(direction).mulScalar(-1)
        direction.normalize()
    }
    getLightAreaSizes(light) {
        const mat = light._node.getWorldTransform()
        mat.transformVector(areaHalfAxisWidth, tempVec3$1)
        tempAreaLightSizes[0] = tempVec3$1.x
        tempAreaLightSizes[1] = tempVec3$1.y
        tempAreaLightSizes[2] = tempVec3$1.z
        mat.transformVector(areaHalfAxisHeight, tempVec3$1)
        tempAreaLightSizes[3] = tempVec3$1.x
        tempAreaLightSizes[4] = tempVec3$1.y
        tempAreaLightSizes[5] = tempVec3$1.z
        return tempAreaLightSizes
    }
    addLightData(light, lightIndex) {
        const isSpot = light._type === LIGHTTYPE_SPOT
        const hasAtlasViewport = light.atlasViewportAllocated
        const isCookie = this.cookiesEnabled && !!light._cookie && hasAtlasViewport
        const isArea = this.areaLightsEnabled && light.shape !== LIGHTSHAPE_PUNCTUAL
        const castShadows = this.shadowsEnabled && light.castShadows && hasAtlasViewport
        const pos = light._node.getPosition()
        let lightProjectionMatrix = null
        let atlasViewport = null
        if (isSpot) {
            if (castShadows) {
                const lightRenderData = light.getRenderData(null, 0)
                lightProjectionMatrix = lightRenderData.shadowMatrix
            } else if (isCookie) {
                lightProjectionMatrix = LightCamera.evalSpotCookieMatrix(light)
            }
        } else {
            if (castShadows || isCookie) {
                atlasViewport = light.atlasViewport
            }
        }
        const dataFloat = this.lightsFloat
        const dataUint = this.lightsUint
        const dataFloatStart = lightIndex * this.lightsTexture.width * 4
        dataFloat[dataFloatStart + 4 * TextureIndexFloat.POSITION_RANGE + 0] = pos.x
        dataFloat[dataFloatStart + 4 * TextureIndexFloat.POSITION_RANGE + 1] = pos.y
        dataFloat[dataFloatStart + 4 * TextureIndexFloat.POSITION_RANGE + 2] = pos.z
        dataFloat[dataFloatStart + 4 * TextureIndexFloat.POSITION_RANGE + 3] = light.attenuationEnd
        const clusteredData = light.clusteredData
        dataUint[dataFloatStart + 4 * TextureIndexFloat.COLOR_ANGLES_BIAS + 0] = clusteredData[0]
        dataUint[dataFloatStart + 4 * TextureIndexFloat.COLOR_ANGLES_BIAS + 1] = clusteredData[1]
        dataUint[dataFloatStart + 4 * TextureIndexFloat.COLOR_ANGLES_BIAS + 2] = clusteredData[2]
        if (light.castShadows) {
            const lightRenderData = light.getRenderData(null, 0)
            const biases = light._getUniformBiasValues(lightRenderData)
            const biasHalf = FloatPacking.float2Half(biases.bias)
            const normalBiasHalf = FloatPacking.float2Half(biases.normalBias)
            dataUint[dataFloatStart + 4 * TextureIndexFloat.COLOR_ANGLES_BIAS + 3] = biasHalf | (normalBiasHalf << 16)
        }
        if (isSpot) {
            this.getSpotDirection(tempVec3$1, light)
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.DIRECTION_FLAGS + 0] = tempVec3$1.x
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.DIRECTION_FLAGS + 1] = tempVec3$1.y
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.DIRECTION_FLAGS + 2] = tempVec3$1.z
        }
        dataUint[dataFloatStart + 4 * TextureIndexFloat.DIRECTION_FLAGS + 3] = light.getClusteredFlags(
            castShadows,
            isCookie,
        )
        if (lightProjectionMatrix) {
            const matData = lightProjectionMatrix.data
            for (let m = 0; m < 16; m++) {
                dataFloat[dataFloatStart + 4 * TextureIndexFloat.PROJ_MAT_0 + m] = matData[m]
            }
        }
        if (atlasViewport) {
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.ATLAS_VIEWPORT + 0] = atlasViewport.x
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.ATLAS_VIEWPORT + 1] = atlasViewport.y
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.ATLAS_VIEWPORT + 2] = atlasViewport.z / 3
        }
        if (isArea) {
            const areaSizes = this.getLightAreaSizes(light)
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.AREA_DATA_WIDTH + 0] = areaSizes[0]
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.AREA_DATA_WIDTH + 1] = areaSizes[1]
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.AREA_DATA_WIDTH + 2] = areaSizes[2]
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.AREA_DATA_HEIGHT + 0] = areaSizes[3]
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.AREA_DATA_HEIGHT + 1] = areaSizes[4]
            dataFloat[dataFloatStart + 4 * TextureIndexFloat.AREA_DATA_HEIGHT + 2] = areaSizes[5]
        }
    }
    constructor(device) {
        this.areaLightsEnabled = false
        this.device = device
        ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('lightBufferDefinesPS', lightBufferDefines)
        ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('lightBufferDefinesPS', lightBufferDefines)
        this.cookiesEnabled = false
        this.shadowsEnabled = false
        this.areaLightsEnabled = false
        this.maxLights = 255
        const pixelsPerLightFloat = TextureIndexFloat.COUNT
        this.lightsFloat = new Float32Array(4 * pixelsPerLightFloat * this.maxLights)
        this.lightsUint = new Uint32Array(this.lightsFloat.buffer)
        this.lightsTexture = this.createTexture(
            this.device,
            pixelsPerLightFloat,
            this.maxLights,
            PIXELFORMAT_RGBA32F,
            'LightsTexture',
        )
        this._lightsTextureId = this.device.scope.resolve('lightsTexture')
        this.invMaxColorValue = 0
        this.invMaxAttenuation = 0
        this.boundsMin = new Vec3()
        this.boundsDelta = new Vec3()
    }
}

const tmpSize$2 = new Vec2()
const tempVec3 = new Vec3()
const tempMin3 = new Vec3()
const tempMax3 = new Vec3()
const tempBox = new BoundingBox()
class ClusterLight {
    constructor() {
        this.light = null
        this.min = new Vec3()
        this.max = new Vec3()
    }
}
class WorldClusters {
    set maxCellLightCount(count) {
        if (count !== this._maxCellLightCount) {
            this._maxCellLightCount = count
            this._cellsDirty = true
        }
    }
    get maxCellLightCount() {
        return this._maxCellLightCount
    }
    set cells(value) {
        tempVec3.copy(value).floor()
        if (!this._cells.equals(tempVec3)) {
            this._cells.copy(tempVec3)
            this._cellsLimit.copy(tempVec3).sub(Vec3.ONE)
            this._cellsDirty = true
        }
    }
    get cells() {
        return this._cells
    }
    destroy() {
        this.lightsBuffer.destroy()
        this.releaseClusterTexture()
    }
    releaseClusterTexture() {
        if (this.clusterTexture) {
            this.clusterTexture.destroy()
            this.clusterTexture = null
        }
    }
    registerUniforms(device) {
        this._numClusteredLightsId = device.scope.resolve('numClusteredLights')
        this._clusterMaxCellsId = device.scope.resolve('clusterMaxCells')
        this._clusterWorldTextureId = device.scope.resolve('clusterWorldTexture')
        this._clusterBoundsMinId = device.scope.resolve('clusterBoundsMin')
        this._clusterBoundsMinData = new Float32Array(3)
        this._clusterBoundsDeltaId = device.scope.resolve('clusterBoundsDelta')
        this._clusterBoundsDeltaData = new Float32Array(3)
        this._clusterCellsCountByBoundsSizeId = device.scope.resolve('clusterCellsCountByBoundsSize')
        this._clusterCellsCountByBoundsSizeData = new Float32Array(3)
        this._clusterCellsDotId = device.scope.resolve('clusterCellsDot')
        this._clusterCellsDotData = new Int32Array(3)
        this._clusterCellsMaxId = device.scope.resolve('clusterCellsMax')
        this._clusterCellsMaxData = new Int32Array(3)
        this._clusterTextureWidthId = device.scope.resolve('clusterTextureWidth')
    }
    updateParams(lightingParams) {
        if (lightingParams) {
            this.cells = lightingParams.cells
            this.maxCellLightCount = lightingParams.maxLightsPerCell
            this.lightsBuffer.cookiesEnabled = lightingParams.cookiesEnabled
            this.lightsBuffer.shadowsEnabled = lightingParams.shadowsEnabled
            this.lightsBuffer.areaLightsEnabled = lightingParams.areaLightsEnabled
        }
    }
    updateCells() {
        if (this._cellsDirty) {
            this._cellsDirty = false
            const cx = this._cells.x
            const cy = this._cells.y
            const cz = this._cells.z
            const numCells = cx * cy * cz
            const totalPixels = this.maxCellLightCount * numCells
            const { x: width, y: height } = TextureUtils.calcTextureSize(totalPixels, tmpSize$2, this.maxCellLightCount)
            this._clusterCellsMaxData[0] = cx
            this._clusterCellsMaxData[1] = cy
            this._clusterCellsMaxData[2] = cz
            this._clusterCellsDotData[0] = this.maxCellLightCount
            this._clusterCellsDotData[1] = cx * cz * this.maxCellLightCount
            this._clusterCellsDotData[2] = cx * this.maxCellLightCount
            this.clusters = new Uint8ClampedArray(totalPixels)
            this.counts = new Int32Array(numCells)
            this.releaseClusterTexture()
            this.clusterTexture = this.lightsBuffer.createTexture(
                this.device,
                width,
                height,
                PIXELFORMAT_R8U,
                'ClusterTexture',
            )
        }
    }
    uploadTextures() {
        this.clusterTexture.lock().set(this.clusters)
        this.clusterTexture.unlock()
        this.lightsBuffer.uploadTextures()
    }
    updateUniforms() {
        this._numClusteredLightsId.setValue(this._usedLights.length)
        this.lightsBuffer.updateUniforms()
        this._clusterWorldTextureId.setValue(this.clusterTexture)
        this._clusterMaxCellsId.setValue(this.maxCellLightCount)
        const boundsDelta = this.boundsDelta
        this._clusterCellsCountByBoundsSizeData[0] = this._cells.x / boundsDelta.x
        this._clusterCellsCountByBoundsSizeData[1] = this._cells.y / boundsDelta.y
        this._clusterCellsCountByBoundsSizeData[2] = this._cells.z / boundsDelta.z
        this._clusterCellsCountByBoundsSizeId.setValue(this._clusterCellsCountByBoundsSizeData)
        this._clusterBoundsMinData[0] = this.boundsMin.x
        this._clusterBoundsMinData[1] = this.boundsMin.y
        this._clusterBoundsMinData[2] = this.boundsMin.z
        this._clusterBoundsDeltaData[0] = boundsDelta.x
        this._clusterBoundsDeltaData[1] = boundsDelta.y
        this._clusterBoundsDeltaData[2] = boundsDelta.z
        this._clusterBoundsMinId.setValue(this._clusterBoundsMinData)
        this._clusterBoundsDeltaId.setValue(this._clusterBoundsDeltaData)
        this._clusterCellsDotId.setValue(this._clusterCellsDotData)
        this._clusterCellsMaxId.setValue(this._clusterCellsMaxData)
        this._clusterTextureWidthId.setValue(this.clusterTexture.width)
    }
    evalLightCellMinMax(clusteredLight, min, max) {
        min.copy(clusteredLight.min)
        min.sub(this.boundsMin)
        min.div(this.boundsDelta)
        min.mul2(min, this.cells)
        min.floor()
        max.copy(clusteredLight.max)
        max.sub(this.boundsMin)
        max.div(this.boundsDelta)
        max.mul2(max, this.cells)
        max.ceil()
        min.max(Vec3.ZERO)
        max.min(this._cellsLimit)
    }
    collectLights(lights) {
        const maxLights = this.lightsBuffer.maxLights
        const usedLights = this._usedLights
        let lightIndex = 1
        lights.forEach((light) => {
            const runtimeLight = !!(light.mask & (MASK_AFFECT_DYNAMIC | MASK_AFFECT_LIGHTMAPPED))
            const zeroAngleSpotlight = light.type === LIGHTTYPE_SPOT && light._outerConeAngle === 0
            if (
                light.enabled &&
                light.type !== LIGHTTYPE_DIRECTIONAL &&
                light.visibleThisFrame &&
                light.intensity > 0 &&
                runtimeLight &&
                !zeroAngleSpotlight
            ) {
                if (lightIndex < maxLights) {
                    let clusteredLight
                    if (lightIndex < usedLights.length) {
                        clusteredLight = usedLights[lightIndex]
                    } else {
                        clusteredLight = new ClusterLight()
                        usedLights.push(clusteredLight)
                    }
                    clusteredLight.light = light
                    light.getBoundingBox(tempBox)
                    clusteredLight.min.copy(tempBox.getMin())
                    clusteredLight.max.copy(tempBox.getMax())
                    lightIndex++
                }
            }
        })
        usedLights.length = lightIndex
    }
    evaluateBounds() {
        const usedLights = this._usedLights
        const min = this.boundsMin
        const max = this.boundsMax
        if (usedLights.length > 1) {
            min.copy(usedLights[1].min)
            max.copy(usedLights[1].max)
            for (let i = 2; i < usedLights.length; i++) {
                min.min(usedLights[i].min)
                max.max(usedLights[i].max)
            }
        } else {
            min.set(0, 0, 0)
            max.set(1, 1, 1)
        }
        this.boundsDelta.sub2(max, min)
        this.lightsBuffer.setBounds(min, this.boundsDelta)
    }
    updateClusters(lightingParams) {
        this.counts.fill(0)
        this.clusters.fill(0)
        this.lightsBuffer.areaLightsEnabled = lightingParams ? lightingParams.areaLightsEnabled : false
        const divX = this._cells.x
        const divZ = this._cells.z
        const counts = this.counts
        const limit = this._maxCellLightCount
        const clusters = this.clusters
        const pixelsPerCellCount = this.maxCellLightCount
        const usedLights = this._usedLights
        for (let i = 1; i < usedLights.length; i++) {
            const clusteredLight = usedLights[i]
            const light = clusteredLight.light
            this.lightsBuffer.addLightData(light, i)
            this.evalLightCellMinMax(clusteredLight, tempMin3, tempMax3)
            const xStart = tempMin3.x
            const xEnd = tempMax3.x
            const yStart = tempMin3.y
            const yEnd = tempMax3.y
            const zStart = tempMin3.z
            const zEnd = tempMax3.z
            for (let x = xStart; x <= xEnd; x++) {
                for (let z = zStart; z <= zEnd; z++) {
                    for (let y = yStart; y <= yEnd; y++) {
                        const clusterIndex = x + divX * (z + y * divZ)
                        const count = counts[clusterIndex]
                        if (count < limit) {
                            clusters[pixelsPerCellCount * clusterIndex + count] = i
                            counts[clusterIndex] = count + 1
                        }
                    }
                }
            }
        }
    }
    update(lights, lightingParams = null) {
        this.updateParams(lightingParams)
        this.updateCells()
        this.collectLights(lights)
        this.evaluateBounds()
        this.updateClusters(lightingParams)
        this.uploadTextures()
    }
    activate() {
        this.updateUniforms()
    }
    constructor(device) {
        this.device = device
        this.name = 'Untitled'
        this.reportCount = 0
        this.boundsMin = new Vec3()
        this.boundsMax = new Vec3()
        this.boundsDelta = new Vec3()
        this._cells = new Vec3(1, 1, 1)
        this._cellsLimit = new Vec3()
        this.cells = this._cells
        this.maxCellLightCount = 4
        this._usedLights = []
        this._usedLights.push(new ClusterLight())
        this.lightsBuffer = new LightsBuffer(device)
        this.registerUniforms(device)
    }
}

const base64String =
    'muPIHORMLNDCz4DxVR/ZvYfAUVEFR47KRIC4nwAAAAAP7WxlhD6Ci+2HCe7BF8jRAPZwdH2UPpI5PdLCJdkvG4UTaNDJ/0crAzne71GCrb4kbdMjjCEGzdX6fNxDMLJq5xkeoIVTdfiZkodEeArmZmp/FQzFjD4x8iOW7Dg64n+3mWqyEwLxXT8zoJXfbw8QJKDCaarUYyTlMzNFHbgUe9IQV7g4YOgtSKpIFZJ0qERm7u4PpmiF89ktHWCywaGmD6h+hfh2/Zd8KYlKqqo4Cem4T42bT/Z9FpCQF1hhSjfBzZ5XFn/y3jegWC6u86KuELRundQS/1Rp+XuKKGIgRv3CvP5y749yqLlFO495JOT3+f2CXgd71npU0/KjjpkZucbJ5m78IVyuSrSozc9jgBUhDrz0hFsyb7LFUH9//wJbBgLdNWJZObfKxrNt8TliLA9w9sXFv6g26iXpf6r/BqcAusj/QzGBZuoUGeEtw8BCXCZ3jUiw4hvM18ZVqlUD3C40LAFXW6FRjuAZGRNstb0/qVk4skwyT+MHrvRorI4rKHVMWZmKyAkzL/78u/9pMQuX14pZN50b2PHn6fRxeaCQLsfT4dpvIkWWFuFVENZIh+8xgR6lU+85W0PPdAu1j99kcCG40JBQa4JMyRzq6qriOBLtqF87vpCJan0WEduVr/mOYkS00urVA0mA6M3031+GmGmW48PaJDYOEIb3bIXWPaLoAOEinX1TN3+/vwhG6nqJu0TdHpedS7QsGZIoxH3nQYYjQP1jmbahlbNngw5ogsGk1y50XZyUmQBY+/JBJ3Unu4dApm+WmPwHPU9gLb+4mHh4BiY6M86pq+WeTyWdI3s0CXPEtHGXZ8zMZgUoyRomBi1VdazzuN+WOmQ9Pa0Z0tlNopUi8AJ4x2Xn4mmOKEbXLxlbVsWu8XhuDGYFOGCRVdSqDPXrHU5SDdUlti3k5///SBwzTMwK3L4a1H7w4lnpEas6////AfX8asyIBfeFXVJ3tgvxQ/blZuUKyIODIfr/UzdWNu7pciLBpdZRZ4pIfZ1R6szq+XNxkGG///8EZFpu7VHAhFWqHEOrB9unw+YQa5o8/9IR/V5/zq+986rJSyfgJKt2u9hxU1wzyQWPjJGvzG9+eWWxGFOHVKqI4jBQALwZZswesnvZ2UmmkEXdiRpz8B+oWE7PY70ZTMndisYSXg2TqoI+3y9BxbnY2Y4EfbdcRhAvG59NqDENNYbxKvK5HJfPG5M+Wi2AcpLVJrD6caiEOzgSoVNSgQK8fm2M3zGcF4xtClv/8Hs9oD7C3jitTATYNQxmKqKf1LhIxzf1bmfiNn7UKFmcJu4sLqVLwxGSue3taBEyknkw5hXTsUCvqmmL/f8n/w0giR7Hu/9EHvpkz3yuu64TioMkzdTJ30i0+hFnQqW1+v9mMwq+z9qGX0UFu9MomvVG2xod6vc12AAAAACq7sGa5qptFR0jF3nQt/D+7PibKYahaxP3hEixPbGi9nwNf2LAa7LkEZRKxzXeCD64Xpii5n+8Kpg8eHIv7AWXZltgMoGltmoJ0XGdOCL8WkzphvR9N2o3ARSZ42l5e5Pe4B58MCRlP3EKv+mcloknH+fto5BWsmEutW6KvjOVsznFCktkSczVk4aGvj9VXlRcLeDoKG8RkBgdcNG2bf8HUL4MT2DM+ar7NImJhKpxakX4Vk0CnP+/XNhl5UsP0lXgeZXPoDBMSW5An+DXlTCO5FQGwSPYwHLKYVIimEdAoVe49rQLaaNcye5LxU2/c5TijTgJtD5eQQIe1snxauj5jZsxJBUJdoP/zqpjqv8qBruoPsVsP8N44PCUW5Dd0DzqjSS/Dl5mI9cn1w2ndN/0KAEm1QAAAACwu6KM/083IBbH5bPa/9oHUwcU8I9v3j6/v18QYammrf+P6VL///8BrpuM3fOLCxaLNOFNF1zPbPYTP65ni6njft4eVcyrVXRQFrs52tr35StiSp55edVDCBC0H5rIfac6nzUwxQSt7y15QoKb+5zebEQUmVbrPjXuUa19Ey7sqXMiSUKHaw72PJKDdrutJoQr3u6lEYJ8K0MakWKj9zjTFi4X94TsKYco0GrLeB60M6D8M/80rhXUW8iMequg8y5F838WI0+gp3GBN5Kj/xIOxTWQuUaPV/LwvARr1VH93BFgGZR1MFW0Ua30GbYmdnAgo9VWy8SQtpDUgGE2r2zq2eTEMCL7sMKmE1hchVhuF/TCq9iXKEm86kzOf3Rp9ZnCxbpDUj+FKNxVyXe6pVZkRXv/m95SnB/EB8aME29N85MtAcDoXWlor8De2Q5Dg1tar+8wgiZufbMam81j//ASUohoR/zSh2KG4bvT6mkIPz6C5/98DC3LaWlaEZ1zA5JORZRu6J/a0GY285sEYzw71YqOT1ihAG0z5SDt1xNiDQWZdFpndArp6xWhqSDkRb4kSJEHb9liPvw7uLV/6i5MVf//A9Qjr8xkAEUh+KDI+zdtJ68d6MBOktg1iyp/SCq8O9f5pbamn1VVVQPRTWqNBvhQKa07s6P0lc9Luu/3gw4HeyOUfz8MxMwV4UQhua+t9cr4bz/nIB2wnDSK1K7I94M+s6C84htaX/CNlMQUSs2KJO+yaebfTbkNX5yWcqEJevo0vbKUiETuFXiL019A3E+lmsyZMwXrXLLiQAZ5t9+jI3JobhJTMiDH5ZOQ+8Jau5555NMjHSscP9qCVaa40doh+1a3Ukf6jqBmLddgh79/fwTfCyqiuldNkUoy+nUp+4nerwg0OjtGv2x485PJOJvUEokNhYIdWjpx7BWk0VZGWOp3jSFTJ2bnu6KCduZtG/UcBC9RZ3W/jMSfSMw4Etr/DoD/XYP2V5Ovw+YoM3F5g2dGLdvuG6ZkVGLE6Dk5Zr+sdSyGliJP1y2OFf/KFO0RWO+3gsGhesTnfZVpTd8/HwgO216gwaqo+vY3TljfJWowY+i0p0Os4SLn/1wLqDHMlszggmT/D8MRFzs+pLv6LNJSsNZ/r41mWi/rF6ZcKp/yzJdK0VU44hskq3RGpgO6mIpJDsf/mZkFrz0yYOMLbuaj/wp1v7JMFM5eqvBhmTd7U8frQAtHtys4zgpjZmzUhOVTfNNLifElGXADlqHGKrkBT/nYwX8ZRm3RjvyPvjKyEqEGKUpVnvOGx+NKPHiWM//ZDpDVGvvrjmk8RPF/wiYZD3+Us8YCXjrVOfjdd1UPAfjLp8jgSn4me7DPTpz1Ggy9XL80guFO7ECT10AvILKfD18Qx+KY/f8aRqu0oOO8hfKRFZa9PUJwCsp6VdZz6LFkm2b9Pl2LIifCwzRy7TpdG2uAtOxP2OemY26bJMa9ZGSLIRlMsgpDpnDJwd0oa5pQ13x1hrHf52HpulUWonGWsfXZbSQYKu9bnEN76ciQih0opN3deDVrbrxorfVlnCmL1R9zq3ePGWIv21c7pW8kEiFTM5JX8dAw867s/60cf79/BH+MDFCZBHlz1L+qGOJf/1txhhmrf3//As+RIJwevDb+fgNXVeHw67QptZegayhrEwr5Gy+EPo1RLaMtPbqOZYoVzXzwzjMFWZxyUG9YUIf6////AQWy84iAygLk9COtXt92+0mT/xg0zMzMBeLkb8y9SL2TDXgSX422hDgpGNLJyuPioA+YJ91G8znrpNqHkwYyscaJDEc9Vc+j4cXle3hvcd2JqDQH2lBZxDn6mUTs0b75raMvbs727codX01Anj8f3wir9P2xQaQ22v/TxCMglKDFoTjaP01XTLgxnTvPv02JgEUrW6UDgOnobFpLdvKdlypgIzPcq14fgXU5tvVW0FEs7VRlsG1IyA69fN4n+awHhT34cE+xUvdj86C8LgAsFheTjI9Ht9EyYAAAAAAVBVKRx2wLgUTI0/2QfyJo2riRw3JDqzEShmx/Lifo6mRkQVbS7X53t+EvKxcXogtdts31e9MRHdcHgsA8rt4/mt2unlzQ/wsU8Gu7+W6Oj7eD8EQdDp5XlCsVaS/AV/t5ZpPOHR3rGpyAJe9IPV+xMrBL1Oz/8MQhFs31h0N1cVnq371uqIJYHyafKH1jteAK3VpMXBcuC+yt0ZeKyRUY4QhdrJJ4tJ1wg3Hu6kDsbovxupTMkGdRrm8oZSoYPbJ+PwH/xotgTdkA1205vUEfnqkI04T/fnnd1fiZW5AwNcggd7fi4j5zasmcntZexIxqFZQMzMJpfndmI5jn17cgn5EV5t9XN0C///8Q9wlJpMGXdoiaMTG2sVyHQsn8mWRISCLNG777S0OuDRP2GlLcJ2UeOg7Fo8hTNPeJ//iTJhyqxhKRUntdXOihq2wfKfH///8B0GGrwT+fSOQRdctKxjjGCSS11d6BlQ9BDfE0J6Z25FaNTKGpFKNCMr2G/041KpWwBLVe1k08vncseQbKZdXi8x1t9XA45U/Wd43D9wAh3Tal0aiLVzGPusOZ1F+W3TWoqlX/A95+dNef11TsuGful+ctGssldk3fqpfqh+43XTxL42+leSHoF/dWHYGX6maqUEuLX7UB+r/6Llr4LKocbVIeu+hB9QTPfz9fCP8RyWmX4SmbhMFsNtCijV7lVcwejLKlvl0GfCndnWV7/39VBrtTRuUx92oke3GBgKkC5fdGK0YvNK+xenKaDmsHDjNFUM3NMz3ZiXXFuLgojosPVCDEl2W5BjX3Ms+j0GSqACHmh0+RPWyuNm/Qe8vFf9AW7N1uRaxWirrUytqEJnJ4/Flm8hSoiZ2NQBsS6w/yQlC4gCaFo8q4nyY6AFdo4hiwhBXzbNKKvZvktCjSCukRR/BbYVbNwZi2Yh3hGodEacLW8qijiWJODf0P2bhfaiPspPT4lYJBgi/KfcFwCfvyUIgkJOv///8CG/JEepRBLaMFE+2TgrqsJXOVOWHt6g/bFwVLLMVBsMR50dis/39/AlBX+/rMTJkUQrnlxpR2iu0Tp8tATkRYGmDIrcAiRP8PjoWIlb7/0ecTdSCE9Y58+a+n/FovJQTVF4F2jAxMZhTgrM/KVS5BQu6bVbkWY5HXnxRshks3urDdW4RkWp4M4TeLmFK5KF/uHkkiO5Kv96RioH984v/CSDBnG+BwlnU9B+o7Y+0X0Nob+0pLsStxjvPXMy2eCpzhOWV4XbObBHN4UE2sLQ/DIqXhOzxVf38GlTi6aG7EnePO7TRJm9yOfUUcqq1I2iQHrVDqn3TUNRi/lMw8KbMW/3/nqCz/Ef8PoW5Qxcz2yHR/f78EPB2Stbd+ZFmfNTUYILzsb9YNhpaHcaymYrBiNHmFE3Y4ccYJ25Prqm7zHobGHED8/93ZNlWro9vcKivGZs31UiK1k5zjUhexUgbqJb+fUTjxce/7Zly8a5KMC1fX5nfjPgibdvzbXV1jRT2asXvmSAusaLdq1TSIJ8fXINk5AtT34EWPAsfP9IFQqM5K11O6saoHJA=='
let data = null
const initData = () => {
    if (!data) {
        const binaryString = atob(base64String)
        data = Uint8Array.from(binaryString, (char) => char.charCodeAt(0))
    }
}
const blueNoiseData = () => {
    initData()
    return data
}
class BlueNoise {
    _next() {
        this.seed = (this.seed + 4) % data.length
    }
    value() {
        this._next()
        return data[this.seed] / 255
    }
    vec4(dest = new Vec4()) {
        this._next()
        return dest
            .set(data[this.seed], data[this.seed + 1], data[this.seed + 2], data[this.seed + 3])
            .mulScalar(1 / 255)
    }
    constructor(seed = 0) {
        this.seed = 0
        this.seed = seed * 4
        initData()
    }
}

const lightCubeDir = [
    new Vec3(-1, 0, 0),
    new Vec3(1, 0, 0),
    new Vec3(0, -1, 0),
    new Vec3(0, 1, 0),
    new Vec3(0, 0, -1),
    new Vec3(0, 0, 1),
]
class LightCube {
    update(ambientLight, lights) {
        const colors = this.colors
        const { r, g, b } = ambientLight
        for (let j = 0; j < 6; j++) {
            colors[j * 3] = r
            colors[j * 3 + 1] = g
            colors[j * 3 + 2] = b
        }
        for (let j = 0; j < lights.length; j++) {
            const light = lights[j]
            if (light._type === LIGHTTYPE_DIRECTIONAL) {
                for (let c = 0; c < 6; c++) {
                    const weight = Math.max(lightCubeDir[c].dot(light._direction), 0) * light._intensity
                    const lightColor = light._color
                    colors[c * 3] += lightColor.r * weight
                    colors[c * 3 + 1] += lightColor.g * weight
                    colors[c * 3 + 2] += lightColor.b * weight
                }
            }
        }
    }
    constructor() {
        this.colors = new Float32Array(6 * 3)
    }
}

const createTexture = (device, namePrefix, size, data) => {
    const texture = new Texture(device, {
        name: `${namePrefix}${size}`,
        width: size,
        height: size,
        format: PIXELFORMAT_RGBA8,
        addressU: ADDRESS_REPEAT,
        addressV: ADDRESS_REPEAT,
        type: TEXTURETYPE_DEFAULT,
        magFilter: FILTER_NEAREST,
        minFilter: FILTER_NEAREST,
        anisotropy: 1,
        mipmaps: false,
    })
    texture.lock().set(data)
    texture.unlock()
    return texture
}
const deviceCacheBlueNoise = new DeviceCache()
const getBlueNoiseTexture = (device) => {
    return deviceCacheBlueNoise.get(device, () => {
        const data = blueNoiseData()
        const size = Math.sqrt(data.length / 4)
        return createTexture(device, 'BlueNoise', size, data)
    })
}

class ShadowMap {
    destroy() {
        if (this.texture) {
            this.texture.destroy()
            this.texture = null
        }
        const targets = this.renderTargets
        for (let i = 0; i < targets.length; i++) {
            targets[i].destroy()
        }
        this.renderTargets.length = 0
    }
    static create(device, light) {
        let shadowMap = null
        if (light._type === LIGHTTYPE_OMNI) {
            shadowMap = this.createCubemap(device, light._shadowResolution, light._shadowType)
        } else {
            shadowMap = this.create2dMap(device, light._shadowResolution, light._shadowType)
        }
        return shadowMap
    }
    static createAtlas(device, resolution, shadowType) {
        const shadowMap = this.create2dMap(device, resolution, shadowType)
        const targets = shadowMap.renderTargets
        const rt = targets[0]
        for (let i = 0; i < 5; i++) {
            targets.push(rt)
        }
        return shadowMap
    }
    static create2dMap(device, size, shadowType) {
        const shadowInfo = shadowTypeInfo.get(shadowType)
        let format = shadowInfo.format
        if (format === PIXELFORMAT_R32F && !device.textureFloatRenderable && device.textureHalfFloatRenderable) {
            format = PIXELFORMAT_R16F
        }
        const formatName = pixelFormatInfo.get(format)?.name
        let filter = FILTER_LINEAR
        if (shadowType === SHADOW_VSM_32F) {
            filter = device.extTextureFloatLinear ? FILTER_LINEAR : FILTER_NEAREST
        }
        if (shadowType === SHADOW_PCSS_32F) {
            filter = FILTER_NEAREST
        }
        const texture = new Texture(device, {
            format: format,
            width: size,
            height: size,
            mipmaps: false,
            minFilter: filter,
            magFilter: filter,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            name: `ShadowMap2D_${formatName}`,
        })
        let target = null
        if (shadowInfo?.pcf) {
            texture.compareOnRead = true
            texture.compareFunc = FUNC_LESS
            target = new RenderTarget({
                depthBuffer: texture,
            })
        } else {
            target = new RenderTarget({
                colorBuffer: texture,
                depth: true,
            })
        }
        if (device.isWebGPU) {
            target.flipY = true
        }
        return new ShadowMap(texture, [target])
    }
    static createCubemap(device, size, shadowType) {
        const shadowInfo = shadowTypeInfo.get(shadowType)
        const formatName = pixelFormatInfo.get(shadowInfo.format)?.name
        const isPcss = shadowType === SHADOW_PCSS_32F
        const filter = isPcss ? FILTER_NEAREST : FILTER_LINEAR
        const cubemap = new Texture(device, {
            format: shadowInfo?.format,
            width: size,
            height: size,
            cubemap: true,
            mipmaps: false,
            minFilter: filter,
            magFilter: filter,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE,
            name: `ShadowMapCube_${formatName}`,
        })
        if (!isPcss) {
            cubemap.compareOnRead = true
            cubemap.compareFunc = FUNC_LESS
        }
        const targets = []
        for (let i = 0; i < 6; i++) {
            if (isPcss) {
                targets.push(
                    new RenderTarget({
                        colorBuffer: cubemap,
                        face: i,
                        depth: true,
                    }),
                )
            } else {
                targets.push(
                    new RenderTarget({
                        depthBuffer: cubemap,
                        face: i,
                    }),
                )
            }
        }
        return new ShadowMap(cubemap, targets)
    }
    constructor(texture, targets) {
        this.texture = texture
        this.cached = false
        this.renderTargets = targets
    }
}

const _tempArray = []
const _tempArray2 = []
const _viewport$1 = new Vec4()
const _scissor = new Vec4()
class Slot {
    constructor(rect) {
        this.size = Math.floor(rect.w * 1024)
        this.used = false
        this.lightId = -1
        this.rect = rect
    }
}
class LightTextureAtlas {
    destroy() {
        this.destroyShadowAtlas()
        this.destroyCookieAtlas()
    }
    destroyShadowAtlas() {
        this.shadowAtlas?.destroy()
        this.shadowAtlas = null
    }
    destroyCookieAtlas() {
        this.cookieAtlas?.destroy()
        this.cookieAtlas = null
        this.cookieRenderTarget?.destroy()
        this.cookieRenderTarget = null
    }
    allocateShadowAtlas(resolution, shadowType = SHADOW_PCF3_32F) {
        const existingFormat = this.shadowAtlas?.texture.format
        const requiredFormat = shadowTypeInfo.get(shadowType).format
        if (!this.shadowAtlas || this.shadowAtlas.texture.width !== resolution || existingFormat !== requiredFormat) {
            this.version++
            this.destroyShadowAtlas()
            this.shadowAtlas = ShadowMap.createAtlas(this.device, resolution, shadowType)
            this.shadowAtlas.cached = true
            const scissorOffset = 4 / this.shadowAtlasResolution
            this.scissorVec.set(scissorOffset, scissorOffset, -2 * scissorOffset, -2 * scissorOffset)
        }
    }
    allocateCookieAtlas(resolution) {
        if (this.cookieAtlas.width !== resolution) {
            this.cookieRenderTarget.resize(resolution, resolution)
            this.version++
        }
    }
    allocateUniforms() {
        this._shadowAtlasTextureId = this.device.scope.resolve('shadowAtlasTexture')
        this._shadowAtlasParamsId = this.device.scope.resolve('shadowAtlasParams')
        this._shadowAtlasParams = new Float32Array(2)
        this._cookieAtlasTextureId = this.device.scope.resolve('cookieAtlasTexture')
    }
    updateUniforms() {
        const rt = this.shadowAtlas.renderTargets[0]
        const shadowBuffer = rt.depthBuffer
        this._shadowAtlasTextureId.setValue(shadowBuffer)
        this._shadowAtlasParams[0] = this.shadowAtlasResolution
        this._shadowAtlasParams[1] = this.shadowEdgePixels
        this._shadowAtlasParamsId.setValue(this._shadowAtlasParams)
        this._cookieAtlasTextureId.setValue(this.cookieAtlas)
    }
    subdivide(numLights, lightingParams) {
        let atlasSplit = lightingParams.atlasSplit
        if (!atlasSplit) {
            const gridSize = Math.ceil(Math.sqrt(numLights))
            atlasSplit = _tempArray2
            atlasSplit[0] = gridSize
            atlasSplit.length = 1
        }
        const arraysEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
        if (!arraysEqual(atlasSplit, this.atlasSplit)) {
            this.version++
            this.slots.length = 0
            this.atlasSplit.length = 0
            this.atlasSplit.push(...atlasSplit)
            const splitCount = this.atlasSplit[0]
            if (splitCount > 1) {
                const invSize = 1 / splitCount
                for (let i = 0; i < splitCount; i++) {
                    for (let j = 0; j < splitCount; j++) {
                        const rect = new Vec4(i * invSize, j * invSize, invSize, invSize)
                        const nextLevelSplit = this.atlasSplit[1 + i * splitCount + j]
                        if (nextLevelSplit > 1) {
                            for (let x = 0; x < nextLevelSplit; x++) {
                                for (let y = 0; y < nextLevelSplit; y++) {
                                    const invSizeNext = invSize / nextLevelSplit
                                    const rectNext = new Vec4(
                                        rect.x + x * invSizeNext,
                                        rect.y + y * invSizeNext,
                                        invSizeNext,
                                        invSizeNext,
                                    )
                                    this.slots.push(new Slot(rectNext))
                                }
                            }
                        } else {
                            this.slots.push(new Slot(rect))
                        }
                    }
                }
            } else {
                this.slots.push(new Slot(new Vec4(0, 0, 1, 1)))
            }
            this.slots.sort((a, b) => {
                return b.size - a.size
            })
        }
    }
    collectLights(localLights, lightingParams) {
        const cookiesEnabled = lightingParams.cookiesEnabled
        const shadowsEnabled = lightingParams.shadowsEnabled
        let needsShadowAtlas = false
        let needsCookieAtlas = false
        const lights = _tempArray
        lights.length = 0
        const processLights = (list) => {
            for (let i = 0; i < list.length; i++) {
                const light = list[i]
                if (light.visibleThisFrame) {
                    const lightShadow = shadowsEnabled && light.castShadows
                    const lightCookie = cookiesEnabled && !!light.cookie
                    needsShadowAtlas || (needsShadowAtlas = lightShadow)
                    needsCookieAtlas || (needsCookieAtlas = lightCookie)
                    if (lightShadow || lightCookie) {
                        lights.push(light)
                    }
                }
            }
        }
        if (cookiesEnabled || shadowsEnabled) {
            processLights(localLights)
        }
        lights.sort((a, b) => {
            return b.maxScreenSize - a.maxScreenSize
        })
        if (needsShadowAtlas) {
            this.allocateShadowAtlas(this.shadowAtlasResolution, lightingParams.shadowType)
        }
        if (needsCookieAtlas) {
            this.allocateCookieAtlas(this.cookieAtlasResolution)
        }
        if (needsShadowAtlas || needsCookieAtlas) {
            this.subdivide(lights.length, lightingParams)
        }
        return lights
    }
    setupSlot(light, rect) {
        light.atlasViewport.copy(rect)
        const faceCount = light.numShadowFaces
        for (let face = 0; face < faceCount; face++) {
            if (light.castShadows || light._cookie) {
                _viewport$1.copy(rect)
                _scissor.copy(rect)
                if (light._type === LIGHTTYPE_SPOT) {
                    _viewport$1.add(this.scissorVec)
                }
                if (light._type === LIGHTTYPE_OMNI) {
                    const smallSize = _viewport$1.z / 3
                    const offset = this.cubeSlotsOffsets[face]
                    _viewport$1.x += smallSize * offset.x
                    _viewport$1.y += smallSize * offset.y
                    _viewport$1.z = smallSize
                    _viewport$1.w = smallSize
                    _scissor.copy(_viewport$1)
                }
                if (light.castShadows) {
                    const lightRenderData = light.getRenderData(null, face)
                    lightRenderData.shadowViewport.copy(_viewport$1)
                    lightRenderData.shadowScissor.copy(_scissor)
                }
            }
        }
    }
    assignSlot(light, slotIndex, slotReassigned) {
        light.atlasViewportAllocated = true
        const slot = this.slots[slotIndex]
        slot.lightId = light.id
        slot.used = true
        if (slotReassigned) {
            light.atlasSlotUpdated = true
            light.atlasVersion = this.version
            light.atlasSlotIndex = slotIndex
        }
    }
    update(localLights, lightingParams) {
        this.shadowAtlasResolution = lightingParams.shadowAtlasResolution
        this.cookieAtlasResolution = lightingParams.cookieAtlasResolution
        const lights = this.collectLights(localLights, lightingParams)
        if (lights.length > 0) {
            const slots = this.slots
            for (let i = 0; i < slots.length; i++) {
                slots[i].used = false
            }
            const assignCount = Math.min(lights.length, slots.length)
            for (let i = 0; i < assignCount; i++) {
                const light = lights[i]
                if (light.castShadows) {
                    light._shadowMap = this.shadowAtlas
                }
                const previousSlot = slots[light.atlasSlotIndex]
                if (light.atlasVersion === this.version && light.id === previousSlot?.lightId) {
                    const previousSlot = slots[light.atlasSlotIndex]
                    if (previousSlot.size === slots[i].size && !previousSlot.used) {
                        this.assignSlot(light, light.atlasSlotIndex, false)
                    }
                }
            }
            let usedCount = 0
            for (let i = 0; i < assignCount; i++) {
                while (usedCount < slots.length && slots[usedCount].used) {
                    usedCount++
                }
                const light = lights[i]
                if (!light.atlasViewportAllocated) {
                    this.assignSlot(light, usedCount, true)
                }
                const slot = slots[light.atlasSlotIndex]
                this.setupSlot(light, slot.rect)
            }
        }
        this.updateUniforms()
    }
    constructor(device) {
        this.device = device
        this.version = 1
        this.shadowAtlasResolution = 2048
        this.shadowAtlas = null
        this.shadowEdgePixels = 3
        this.cookieAtlasResolution = 4
        this.cookieAtlas = Texture.createDataTexture2D(
            this.device,
            'CookieAtlas',
            this.cookieAtlasResolution,
            this.cookieAtlasResolution,
            PIXELFORMAT_SRGBA8,
        )
        this.cookieRenderTarget = new RenderTarget({
            colorBuffer: this.cookieAtlas,
            depth: false,
            flipY: true,
        })
        this.slots = []
        this.atlasSplit = []
        this.cubeSlotsOffsets = [
            new Vec2(0, 0),
            new Vec2(0, 1),
            new Vec2(1, 0),
            new Vec2(1, 1),
            new Vec2(2, 0),
            new Vec2(2, 1),
        ]
        this.scissorVec = new Vec4()
        this.allocateShadowAtlas(1)
        this.allocateCookieAtlas(1)
        this.allocateUniforms()
    }
}

const blendModes = []
blendModes[BLEND_SUBTRACTIVE] = {
    src: BLENDMODE_ONE,
    dst: BLENDMODE_ONE,
    op: BLENDEQUATION_REVERSE_SUBTRACT,
}
blendModes[BLEND_NONE] = {
    src: BLENDMODE_ONE,
    dst: BLENDMODE_ZERO,
    op: BLENDEQUATION_ADD,
}
blendModes[BLEND_NORMAL] = {
    src: BLENDMODE_SRC_ALPHA,
    dst: BLENDMODE_ONE_MINUS_SRC_ALPHA,
    op: BLENDEQUATION_ADD,
    alphaSrc: BLENDMODE_ONE,
}
blendModes[BLEND_PREMULTIPLIED] = {
    src: BLENDMODE_ONE,
    dst: BLENDMODE_ONE_MINUS_SRC_ALPHA,
    op: BLENDEQUATION_ADD,
}
blendModes[BLEND_ADDITIVE] = {
    src: BLENDMODE_ONE,
    dst: BLENDMODE_ONE,
    op: BLENDEQUATION_ADD,
}
blendModes[BLEND_ADDITIVEALPHA] = {
    src: BLENDMODE_SRC_ALPHA,
    dst: BLENDMODE_ONE,
    op: BLENDEQUATION_ADD,
}
blendModes[BLEND_MULTIPLICATIVE2X] = {
    src: BLENDMODE_DST_COLOR,
    dst: BLENDMODE_SRC_COLOR,
    op: BLENDEQUATION_ADD,
}
blendModes[BLEND_SCREEN] = {
    src: BLENDMODE_ONE_MINUS_DST_COLOR,
    dst: BLENDMODE_ONE,
    op: BLENDEQUATION_ADD,
}
blendModes[BLEND_MULTIPLICATIVE] = {
    src: BLENDMODE_DST_COLOR,
    dst: BLENDMODE_ZERO,
    op: BLENDEQUATION_ADD,
}
blendModes[BLEND_MIN] = {
    src: BLENDMODE_ONE,
    dst: BLENDMODE_ONE,
    op: BLENDEQUATION_MIN,
}
blendModes[BLEND_MAX] = {
    src: BLENDMODE_ONE,
    dst: BLENDMODE_ONE,
    op: BLENDEQUATION_MAX,
}
let id$3 = 0
class Material {
    get hasShaderChunks() {
        return this._shaderChunks != null
    }
    get shaderChunks() {
        if (!this._shaderChunks) {
            this._shaderChunks = new ShaderChunks()
        }
        return this._shaderChunks
    }
    getShaderChunks(shaderLanguage = SHADERLANGUAGE_GLSL) {
        const chunks = this.shaderChunks
        return shaderLanguage === SHADERLANGUAGE_GLSL ? chunks.glsl : chunks.wgsl
    }
    set shaderChunksVersion(value) {
        this.shaderChunks.version = value
    }
    get shaderChunksVersion() {
        return this.shaderChunks.version
    }
    set chunks(value) {
        this._oldChunks = value
    }
    get chunks() {
        Object.assign(this._oldChunks, Object.fromEntries(this.shaderChunks.glsl))
        return this._oldChunks
    }
    set depthBias(value) {
        this._depthState.depthBias = value
    }
    get depthBias() {
        return this._depthState.depthBias
    }
    set slopeDepthBias(value) {
        this._depthState.depthBiasSlope = value
    }
    get slopeDepthBias() {
        return this._depthState.depthBiasSlope
    }
    set redWrite(value) {
        this._blendState.redWrite = value
    }
    get redWrite() {
        return this._blendState.redWrite
    }
    set greenWrite(value) {
        this._blendState.greenWrite = value
    }
    get greenWrite() {
        return this._blendState.greenWrite
    }
    set blueWrite(value) {
        this._blendState.blueWrite = value
    }
    get blueWrite() {
        return this._blendState.blueWrite
    }
    set alphaWrite(value) {
        this._blendState.alphaWrite = value
    }
    get alphaWrite() {
        return this._blendState.alphaWrite
    }
    get transparent() {
        return this._blendState.blend
    }
    _updateTransparency() {
        for (const meshInstance of this.meshInstances) {
            meshInstance.transparent = this.transparent
        }
    }
    set blendState(value) {
        this._blendState.copy(value)
        this._updateTransparency()
    }
    get blendState() {
        return this._blendState
    }
    set blendType(type) {
        const blendMode = blendModes[type]
        this._blendState.setColorBlend(blendMode.op, blendMode.src, blendMode.dst)
        this._blendState.setAlphaBlend(
            blendMode.alphaOp ?? blendMode.op,
            blendMode.alphaSrc ?? blendMode.src,
            blendMode.alphaDst ?? blendMode.dst,
        )
        const blend = type !== BLEND_NONE
        if (this._blendState.blend !== blend) {
            this._blendState.blend = blend
            this._updateTransparency()
        }
        this._updateMeshInstanceKeys()
    }
    get blendType() {
        if (!this.transparent) {
            return BLEND_NONE
        }
        const { colorOp, colorSrcFactor, colorDstFactor, alphaOp, alphaSrcFactor, alphaDstFactor } = this._blendState
        for (let i = 0; i < blendModes.length; i++) {
            const blendMode = blendModes[i]
            if (
                blendMode.src === colorSrcFactor &&
                blendMode.dst === colorDstFactor &&
                blendMode.op === colorOp &&
                blendMode.src === alphaSrcFactor &&
                blendMode.dst === alphaDstFactor &&
                blendMode.op === alphaOp
            ) {
                return i
            }
        }
        return BLEND_NORMAL
    }
    set depthState(value) {
        this._depthState.copy(value)
    }
    get depthState() {
        return this._depthState
    }
    set depthTest(value) {
        this._depthState.test = value
    }
    get depthTest() {
        return this._depthState.test
    }
    set depthFunc(value) {
        this._depthState.func = value
    }
    get depthFunc() {
        return this._depthState.func
    }
    set depthWrite(value) {
        this._depthState.write = value
    }
    get depthWrite() {
        return this._depthState.write
    }
    copy(source) {
        this.name = source.name
        this.alphaTest = source.alphaTest
        this.alphaToCoverage = source.alphaToCoverage
        this._blendState.copy(source._blendState)
        this._depthState.copy(source._depthState)
        this.cull = source.cull
        this.frontFace = source.frontFace
        this.stencilFront = source.stencilFront?.clone()
        if (source.stencilBack) {
            this.stencilBack =
                source.stencilFront === source.stencilBack ? this.stencilFront : source.stencilBack.clone()
        }
        this.clearParameters()
        for (const name in source.parameters) {
            if (source.parameters.hasOwnProperty(name)) {
                this._setParameterSimple(name, source.parameters[name].data)
            }
        }
        this.defines.clear()
        source.defines.forEach((value, key) => this.defines.set(key, value))
        this._shaderChunks = source.hasShaderChunks ? new ShaderChunks() : null
        this._shaderChunks?.copy(source._shaderChunks)
        return this
    }
    clone() {
        const clone = new this.constructor()
        return clone.copy(this)
    }
    _updateMeshInstanceKeys() {
        for (const meshInstance of this.meshInstances) {
            meshInstance.updateKey()
        }
    }
    updateUniforms(device, scene) {
        if (this._dirtyShader) {
            this.clearVariants()
        }
    }
    getShaderVariant(params) {}
    update() {
        if (Object.keys(this._oldChunks).length > 0) {
            for (const [key, value] of Object.entries(this._oldChunks)) {
                this.shaderChunks.glsl.set(key, value)
                delete this._oldChunks[key]
            }
        }
        if (this._definesDirty || this._shaderChunks?.isDirty()) {
            this._definesDirty = false
            this._shaderChunks?.resetDirty()
            this.clearVariants()
        }
        this.dirty = true
    }
    clearParameters() {
        this.parameters = {}
    }
    getParameters() {
        return this.parameters
    }
    clearVariants() {
        this.variants.clear()
        for (const meshInstance of this.meshInstances) {
            meshInstance.clearShaders()
        }
    }
    getParameter(name) {
        return this.parameters[name]
    }
    _setParameterSimple(name, data) {
        const param = this.parameters[name]
        if (param) {
            param.data = data
        } else {
            this.parameters[name] = {
                scopeId: null,
                data: data,
            }
        }
    }
    setParameter(name, data) {
        if (data === undefined && typeof name === 'object') {
            const uniformObject = name
            if (uniformObject.length) {
                for (let i = 0; i < uniformObject.length; i++) {
                    this.setParameter(uniformObject[i])
                }
                return
            }
            name = uniformObject.name
            data = uniformObject.value
        }
        this._setParameterSimple(name, data)
    }
    deleteParameter(name) {
        if (this.parameters[name]) {
            delete this.parameters[name]
        }
    }
    setParameters(device, names) {
        const parameters = this.parameters
        if (names === undefined) names = parameters
        for (const paramName in names) {
            const parameter = parameters[paramName]
            if (parameter) {
                if (!parameter.scopeId) {
                    parameter.scopeId = device.scope.resolve(paramName)
                }
                parameter.scopeId.setValue(parameter.data)
            }
        }
    }
    setDefine(name, value) {
        let modified = false
        const { defines } = this
        if (value !== undefined && value !== false) {
            modified = !defines.has(name) || defines.get(name) !== value
            defines.set(name, value)
        } else {
            modified = defines.has(name)
            defines.delete(name)
        }
        this._definesDirty || (this._definesDirty = modified)
    }
    getDefine(name) {
        return this.defines.has(name)
    }
    destroy() {
        this.variants.clear()
        for (const meshInstance of this.meshInstances) {
            meshInstance.clearShaders()
            meshInstance._material = null
            if (meshInstance.mesh) {
                const defaultMaterial = getDefaultMaterial(meshInstance.mesh.device)
                if (this !== defaultMaterial) {
                    meshInstance.material = defaultMaterial
                }
            }
        }
        this.meshInstances.clear()
    }
    addMeshInstanceRef(meshInstance) {
        this.meshInstances.add(meshInstance)
    }
    removeMeshInstanceRef(meshInstance) {
        this.meshInstances.delete(meshInstance)
    }
    constructor() {
        this.meshInstances = new Set()
        this.name = 'Untitled'
        this.userId = ''
        this.id = id$3++
        this.variants = new Map()
        this.defines = new Map()
        this._definesDirty = false
        this.parameters = {}
        this.alphaTest = 0
        this.alphaToCoverage = false
        this._blendState = new BlendState()
        this._depthState = new DepthState()
        this.cull = CULLFACE_BACK
        this.frontFace = FRONTFACE_CCW
        this.stencilFront = null
        this.stencilBack = null
        this._shaderChunks = null
        this._oldChunks = {}
        this._dirtyShader = true
        this._shaderVersion = 0
        this._scene = null
        this.dirty = true
    }
}

class ShadowMapCache {
    destroy() {
        this.clear()
        this.cache = null
    }
    clear() {
        this.cache.forEach((shadowMaps) => {
            shadowMaps.forEach((shadowMap) => {
                shadowMap.destroy()
            })
        })
        this.cache.clear()
    }
    getKey(light) {
        const isCubeMap = light._type === LIGHTTYPE_OMNI
        const shadowType = light._shadowType
        const resolution = light._shadowResolution
        return `${isCubeMap}-${shadowType}-${resolution}`
    }
    get(device, light) {
        const key = this.getKey(light)
        const shadowMaps = this.cache.get(key)
        if (shadowMaps && shadowMaps.length) {
            return shadowMaps.pop()
        }
        const shadowMap = ShadowMap.create(device, light)
        shadowMap.cached = true
        return shadowMap
    }
    add(light, shadowMap) {
        const key = this.getKey(light)
        const shadowMaps = this.cache.get(key)
        if (shadowMaps) {
            shadowMaps.push(shadowMap)
        } else {
            this.cache.set(key, [shadowMap])
        }
    }
    constructor() {
        this.cache = new Map()
    }
}

class RenderPassShadowLocalNonClustered extends RenderPass {
    execute() {
        this.shadowRenderer.renderFace(this.light, null, this.face, false)
    }
    after() {
        if (this.applyVsm) {
            this.shadowRenderer.renderVsm(this.light, this.shadowCamera)
        }
    }
    constructor(device, shadowRenderer, light, face, applyVsm) {
        super(device)
        this.requiresCubemaps = false
        this.shadowRenderer = shadowRenderer
        this.light = light
        this.face = face
        this.applyVsm = applyVsm
        this.shadowCamera = shadowRenderer.prepareFace(light, null, face)
        shadowRenderer.setupRenderPass(this, this.shadowCamera, true)
    }
}

class ShadowRendererLocal {
    cull(light, comp, casters = null) {
        const isClustered = this.renderer.scene.clusteredLightingEnabled
        light.visibleThisFrame = true
        if (!isClustered) {
            if (!light._shadowMap) {
                light._shadowMap = ShadowMap.create(this.device, light)
            }
        }
        const type = light._type
        const faceCount = type === LIGHTTYPE_SPOT ? 1 : 6
        for (let face = 0; face < faceCount; face++) {
            const lightRenderData = light.getRenderData(null, face)
            const shadowCam = lightRenderData.shadowCamera
            shadowCam.nearClip = light.attenuationEnd / 1000
            shadowCam.farClip = light.attenuationEnd
            const shadowCamNode = shadowCam._node
            const lightNode = light._node
            shadowCamNode.setPosition(lightNode.getPosition())
            if (type === LIGHTTYPE_SPOT) {
                shadowCam.fov = light._outerConeAngle * 2
                shadowCamNode.setRotation(lightNode.getRotation())
                shadowCamNode.rotateLocal(-90, 0, 0)
            } else if (type === LIGHTTYPE_OMNI) {
                if (isClustered) {
                    const tileSize =
                        (this.shadowRenderer.lightTextureAtlas.shadowAtlasResolution * light.atlasViewport.z) / 3
                    const texelSize = 2 / tileSize
                    const filterSize = texelSize * this.shadowRenderer.lightTextureAtlas.shadowEdgePixels
                    shadowCam.fov = Math.atan(1 + filterSize) * math.RAD_TO_DEG * 2
                } else {
                    shadowCam.fov = 90
                }
            }
            this.renderer.updateCameraFrustum(shadowCam)
            this.shadowRenderer.cullShadowCasters(comp, light, lightRenderData.visibleCasters, shadowCam, casters)
        }
    }
    prepareLights(shadowLights, lights) {
        let shadowCamera
        for (let i = 0; i < lights.length; i++) {
            const light = lights[i]
            if (this.shadowRenderer.needsShadowRendering(light) && light.atlasViewportAllocated) {
                shadowLights.push(light)
                for (let face = 0; face < light.numShadowFaces; face++) {
                    shadowCamera = this.shadowRenderer.prepareFace(light, null, face)
                }
            }
        }
        return shadowCamera
    }
    buildNonClusteredRenderPasses(frameGraph, localLights) {
        for (let i = 0; i < localLights.length; i++) {
            const light = localLights[i]
            if (this.shadowRenderer.needsShadowRendering(light)) {
                const applyVsm = light._type === LIGHTTYPE_SPOT
                const faceCount = light.numShadowFaces
                for (let face = 0; face < faceCount; face++) {
                    const renderPass = new RenderPassShadowLocalNonClustered(
                        this.device,
                        this.shadowRenderer,
                        light,
                        face,
                        applyVsm,
                    )
                    frameGraph.addRenderPass(renderPass)
                }
            }
        }
    }
    constructor(renderer, shadowRenderer) {
        this.shadowLights = []
        this.renderer = renderer
        this.shadowRenderer = shadowRenderer
        this.device = renderer.device
    }
}

class RenderPassShadowDirectional extends RenderPass {
    execute() {
        const { light, camera, shadowRenderer, allCascadesRendering } = this
        const faceCount = light.numShadowFaces
        const shadowUpdateOverrides = light.shadowUpdateOverrides
        for (let face = 0; face < faceCount; face++) {
            if (shadowUpdateOverrides?.[face] !== SHADOWUPDATE_NONE) {
                shadowRenderer.renderFace(light, camera, face, !allCascadesRendering)
            }
            if (shadowUpdateOverrides?.[face] === SHADOWUPDATE_THISFRAME) {
                shadowUpdateOverrides[face] = SHADOWUPDATE_NONE
            }
        }
    }
    after() {
        this.shadowRenderer.renderVsm(this.light, this.camera)
    }
    constructor(device, shadowRenderer, light, camera, allCascadesRendering) {
        super(device)
        this.shadowRenderer = shadowRenderer
        this.light = light
        this.camera = camera
        this.allCascadesRendering = allCascadesRendering
    }
}

const visibleSceneAabb = new BoundingBox()
const center = new Vec3()
const shadowCamView$1 = new Mat4()
const aabbPoints = [new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3()]
const _depthRange = {
    min: 0,
    max: 0,
}
function getDepthRange(cameraViewMatrix, aabbMin, aabbMax) {
    aabbPoints[0].x = aabbPoints[1].x = aabbPoints[2].x = aabbPoints[3].x = aabbMin.x
    aabbPoints[1].y = aabbPoints[3].y = aabbPoints[7].y = aabbPoints[5].y = aabbMin.y
    aabbPoints[2].z = aabbPoints[3].z = aabbPoints[6].z = aabbPoints[7].z = aabbMin.z
    aabbPoints[4].x = aabbPoints[5].x = aabbPoints[6].x = aabbPoints[7].x = aabbMax.x
    aabbPoints[0].y = aabbPoints[2].y = aabbPoints[4].y = aabbPoints[6].y = aabbMax.y
    aabbPoints[0].z = aabbPoints[1].z = aabbPoints[4].z = aabbPoints[5].z = aabbMax.z
    let minz = 9999999999
    let maxz = -9999999999
    for (let i = 0; i < 8; ++i) {
        cameraViewMatrix.transformPoint(aabbPoints[i], aabbPoints[i])
        const z = aabbPoints[i].z
        if (z < minz) minz = z
        if (z > maxz) maxz = z
    }
    _depthRange.min = minz
    _depthRange.max = maxz
    return _depthRange
}
class ShadowRendererDirectional {
    cull(light, comp, camera, casters = null) {
        light.visibleThisFrame = true
        if (!light._shadowMap) {
            light._shadowMap = ShadowMap.create(this.device, light)
        }
        const nearDist = camera._nearClip
        this.generateSplitDistances(light, nearDist, Math.min(camera._farClip, light.shadowDistance))
        const shadowUpdateOverrides = light.shadowUpdateOverrides
        for (let cascade = 0; cascade < light.numCascades; cascade++) {
            if (shadowUpdateOverrides?.[cascade] === SHADOWUPDATE_NONE) {
                break
            }
            const lightRenderData = light.getRenderData(camera, cascade)
            const shadowCam = lightRenderData.shadowCamera
            shadowCam.renderTarget = light._shadowMap.renderTargets[0]
            lightRenderData.shadowViewport.copy(light.cascades[cascade])
            lightRenderData.shadowScissor.copy(light.cascades[cascade])
            const shadowCamNode = shadowCam._node
            const lightNode = light._node
            shadowCamNode.setPosition(lightNode.getPosition())
            shadowCamNode.setRotation(lightNode.getRotation())
            shadowCamNode.rotateLocal(-90, 0, 0)
            const frustumNearDist = cascade === 0 ? nearDist : light._shadowCascadeDistances[cascade - 1]
            const frustumFarDist = light._shadowCascadeDistances[cascade]
            const frustumPoints = camera.getFrustumCorners(frustumNearDist, frustumFarDist)
            center.set(0, 0, 0)
            const cameraWorldMat = camera.node.getWorldTransform()
            for (let i = 0; i < 8; i++) {
                cameraWorldMat.transformPoint(frustumPoints[i], frustumPoints[i])
                center.add(frustumPoints[i])
            }
            center.mulScalar(1 / 8)
            let radius = 0
            for (let i = 0; i < 8; i++) {
                const dist = frustumPoints[i].sub(center).length()
                if (dist > radius) {
                    radius = dist
                }
            }
            const right = shadowCamNode.right
            const up = shadowCamNode.up
            const lightDir = shadowCamNode.forward
            const sizeRatio = (0.25 * light._shadowResolution) / radius
            const x = Math.ceil(center.dot(up) * sizeRatio) / sizeRatio
            const y = Math.ceil(center.dot(right) * sizeRatio) / sizeRatio
            const scaledUp = up.mulScalar(x)
            const scaledRight = right.mulScalar(y)
            const dot = center.dot(lightDir)
            const scaledDir = lightDir.mulScalar(dot)
            center.add2(scaledUp, scaledRight).add(scaledDir)
            shadowCamNode.setPosition(center)
            shadowCamNode.translateLocal(0, 0, 1000000)
            shadowCam.nearClip = 0.01
            shadowCam.farClip = 2000000
            shadowCam.orthoHeight = radius
            this.renderer.updateCameraFrustum(shadowCam)
            this.shadowRenderer.cullShadowCasters(comp, light, lightRenderData.visibleCasters, shadowCam, casters)
            const cascadeFlag = 1 << cascade
            const visibleCasters = lightRenderData.visibleCasters
            const origNumVisibleCasters = visibleCasters.length
            let numVisibleCasters = 0
            for (let i = 0; i < origNumVisibleCasters; i++) {
                const meshInstance = visibleCasters[i]
                if (meshInstance.shadowCascadeMask & cascadeFlag) {
                    visibleCasters[numVisibleCasters++] = meshInstance
                    if (numVisibleCasters === 1) {
                        visibleSceneAabb.copy(meshInstance.aabb)
                    } else {
                        visibleSceneAabb.add(meshInstance.aabb)
                    }
                }
            }
            if (origNumVisibleCasters !== numVisibleCasters) {
                visibleCasters.length = numVisibleCasters
            }
            shadowCamView$1.copy(shadowCamNode.getWorldTransform()).invert()
            const depthRange = getDepthRange(shadowCamView$1, visibleSceneAabb.getMin(), visibleSceneAabb.getMax())
            shadowCamNode.translateLocal(0, 0, depthRange.max + 0.1)
            shadowCam.farClip = depthRange.max - depthRange.min + 0.2
            lightRenderData.projectionCompensation = radius
        }
    }
    generateSplitDistances(light, nearDist, farDist) {
        light._shadowCascadeDistances.fill(farDist)
        for (let i = 1; i < light.numCascades; i++) {
            const fraction = i / light.numCascades
            const linearDist = nearDist + (farDist - nearDist) * fraction
            const logDist = nearDist * (farDist / nearDist) ** fraction
            const dist = math.lerp(linearDist, logDist, light.cascadeDistribution)
            light._shadowCascadeDistances[i - 1] = dist
        }
    }
    getLightRenderPass(light, camera) {
        let renderPass = null
        if (this.shadowRenderer.needsShadowRendering(light)) {
            const faceCount = light.numShadowFaces
            const shadowUpdateOverrides = light.shadowUpdateOverrides
            let allCascadesRendering = true
            let shadowCamera
            for (let face = 0; face < faceCount; face++) {
                if (shadowUpdateOverrides?.[face] === SHADOWUPDATE_NONE) {
                    allCascadesRendering = false
                }
                shadowCamera = this.shadowRenderer.prepareFace(light, camera, face)
            }
            renderPass = new RenderPassShadowDirectional(
                this.device,
                this.shadowRenderer,
                light,
                camera,
                allCascadesRendering,
            )
            this.shadowRenderer.setupRenderPass(renderPass, shadowCamera, allCascadesRendering)
        }
        return renderPass
    }
    constructor(renderer, shadowRenderer) {
        this.renderer = renderer
        this.shadowRenderer = shadowRenderer
        this.device = renderer.device
    }
}

const tempSet = new Set()
const shadowCamView = new Mat4()
const shadowCamViewProj = new Mat4()
const pixelOffset = new Float32Array(2)
const blurScissorRect = new Vec4(1, 1, 0, 0)
const viewportMatrix = new Mat4()
function gauss(x, sigma) {
    return Math.exp(-(x * x) / (2.0 * sigma * sigma))
}
function gaussWeights(kernelSize) {
    const sigma = (kernelSize - 1) / (2 * 3)
    const halfWidth = (kernelSize - 1) * 0.5
    const values = new Array(kernelSize)
    let sum = 0.0
    for (let i = 0; i < kernelSize; ++i) {
        values[i] = gauss(i - halfWidth, sigma)
        sum += values[i]
    }
    for (let i = 0; i < kernelSize; ++i) {
        values[i] /= sum
    }
    return values
}
class ShadowRenderer {
    static createShadowCamera(shadowType, type, face) {
        const shadowCam = LightCamera.create(SHADOWCAMERA_NAME, type, face)
        const shadowInfo = shadowTypeInfo.get(shadowType)
        const isVsm = shadowInfo?.vsm ?? false
        const isPcf = shadowInfo?.pcf ?? false
        if (isVsm) {
            shadowCam.clearColor = new Color(0, 0, 0, 0)
        } else {
            shadowCam.clearColor = new Color(1, 1, 1, 1)
        }
        shadowCam.clearDepthBuffer = true
        shadowCam.clearStencilBuffer = false
        shadowCam.clearColorBuffer = !isPcf
        return shadowCam
    }
    _cullShadowCastersInternal(meshInstances, visible, camera) {
        const numInstances = meshInstances.length
        for (let i = 0; i < numInstances; i++) {
            const meshInstance = meshInstances[i]
            if (meshInstance.castShadow) {
                if (!meshInstance.cull || meshInstance._isVisible(camera)) {
                    meshInstance.visibleThisFrame = true
                    visible.push(meshInstance)
                }
            }
        }
    }
    cullShadowCasters(comp, light, visible, camera, casters) {
        this.renderer.scene?.fire(EVENT_PRECULL, camera)
        visible.length = 0
        if (casters) {
            this._cullShadowCastersInternal(casters, visible, camera)
        } else {
            const layers = comp.layerList
            const len = layers.length
            for (let i = 0; i < len; i++) {
                const layer = layers[i]
                if (layer._lightsSet.has(light)) {
                    if (!tempSet.has(layer)) {
                        tempSet.add(layer)
                        this._cullShadowCastersInternal(layer.shadowCasters, visible, camera)
                    }
                }
            }
            tempSet.clear()
        }
        visible.sort(this.sortCompareShader)
        this.renderer.scene?.fire(EVENT_POSTCULL, camera)
    }
    sortCompareShader(drawCallA, drawCallB) {
        const keyA = drawCallA._sortKeyShadow
        const keyB = drawCallB._sortKeyShadow
        if (keyA === keyB) {
            return drawCallB.mesh.id - drawCallA.mesh.id
        }
        return keyB - keyA
    }
    setupRenderState(device, light) {
        const isClustered = this.renderer.scene.clusteredLightingEnabled
        const useShadowSampler = isClustered ? light._isPcf : light._isPcf && light._type !== LIGHTTYPE_OMNI
        device.setBlendState(useShadowSampler ? this.blendStateNoWrite : this.blendStateWrite)
        device.setDepthState(light.shadowDepthState)
        device.setStencilState(null, null)
    }
    dispatchUniforms(light, shadowCam, lightRenderData, face) {
        const shadowCamNode = shadowCam._node
        if (light._type !== LIGHTTYPE_DIRECTIONAL) {
            this.renderer.dispatchViewPos(shadowCamNode.getPosition())
            this.shadowMapLightRadiusId.setValue(light.attenuationEnd)
        }
        shadowCamView.setTRS(shadowCamNode.getPosition(), shadowCamNode.getRotation(), Vec3.ONE).invert()
        shadowCamViewProj.mul2(shadowCam.projectionMatrix, shadowCamView)
        const rectViewport = lightRenderData.shadowViewport
        shadowCam.rect = rectViewport
        shadowCam.scissorRect = lightRenderData.shadowScissor
        viewportMatrix.setViewport(rectViewport.x, rectViewport.y, rectViewport.z, rectViewport.w)
        lightRenderData.shadowMatrix.mul2(viewportMatrix, shadowCamViewProj)
        if (light._type === LIGHTTYPE_DIRECTIONAL) {
            light._shadowMatrixPalette.set(lightRenderData.shadowMatrix.data, face * 16)
        }
    }
    getShadowPass(light) {
        const lightType = light._type
        const shadowType = light._shadowType
        let shadowPassInfo = this.shadowPassCache[lightType]?.[shadowType]
        if (!shadowPassInfo) {
            const shadowPassName = `ShadowPass_${lightType}_${shadowType}`
            shadowPassInfo = ShaderPass.get(this.device).allocate(shadowPassName, {
                isShadow: true,
                lightType: lightType,
                shadowType: shadowType,
            })
            if (!this.shadowPassCache[lightType]) {
                this.shadowPassCache[lightType] = []
            }
            this.shadowPassCache[lightType][shadowType] = shadowPassInfo
        }
        return shadowPassInfo.index
    }
    submitCasters(visibleCasters, light, camera) {
        const device = this.device
        const renderer = this.renderer
        const scene = renderer.scene
        const passFlags = 1 << SHADER_SHADOW
        const shadowPass = this.getShadowPass(light)
        const cameraShaderParams = camera.shaderParams
        const flipFactor = camera.renderTarget.flipY ? -1 : 1
        const count = visibleCasters.length
        for (let i = 0; i < count; i++) {
            const meshInstance = visibleCasters[i]
            const mesh = meshInstance.mesh
            const instancingData = meshInstance.instancingData
            if (instancingData && instancingData.count <= 0) {
                continue
            }
            meshInstance.ensureMaterial(device)
            const material = meshInstance.material
            renderer.setBaseConstants(device, material)
            renderer.setSkinning(device, meshInstance)
            if (material.dirty) {
                material.updateUniforms(device, scene)
                material.dirty = false
            }
            renderer.setupCullModeAndFrontFace(true, flipFactor, meshInstance)
            material.setParameters(device)
            meshInstance.setParameters(device, passFlags)
            const shaderInstance = meshInstance.getShaderInstance(
                shadowPass,
                0,
                scene,
                cameraShaderParams,
                this.viewUniformFormat,
                this.viewBindGroupFormat,
            )
            const shadowShader = shaderInstance.shader
            if (shadowShader.failed) continue
            meshInstance._sortKeyShadow = shadowShader.id
            device.setShader(shadowShader)
            renderer.setVertexBuffers(device, mesh)
            renderer.setMorphing(device, meshInstance.morphInstance)
            if (instancingData) {
                device.setVertexBuffer(instancingData.vertexBuffer)
            }
            renderer.setMeshInstanceMatrices(meshInstance)
            renderer.setupMeshUniformBuffers(shaderInstance)
            const style = meshInstance.renderStyle
            const indirectData = meshInstance.getDrawCommands(camera)
            device.draw(mesh.primitive[style], mesh.indexBuffer[style], instancingData?.count, indirectData)
            renderer._shadowDrawCalls++
            if (instancingData) {
                renderer._instancedDrawCalls++
            }
        }
    }
    needsShadowRendering(light) {
        const needs =
            light.enabled && light.castShadows && light.shadowUpdateMode !== SHADOWUPDATE_NONE && light.visibleThisFrame
        if (light.shadowUpdateMode === SHADOWUPDATE_THISFRAME) {
            light.shadowUpdateMode = SHADOWUPDATE_NONE
        }
        if (needs) {
            this.renderer._shadowMapUpdates += light.numShadowFaces
        }
        return needs
    }
    getLightRenderData(light, camera, face) {
        return light.getRenderData(light._type === LIGHTTYPE_DIRECTIONAL ? camera : null, face)
    }
    setupRenderPass(renderPass, shadowCamera, clearRenderTarget) {
        const rt = shadowCamera.renderTarget
        renderPass.init(rt)
        renderPass.depthStencilOps.clearDepthValue = 1
        renderPass.depthStencilOps.clearDepth = clearRenderTarget
        if (rt.depthBuffer) {
            renderPass.depthStencilOps.storeDepth = true
        } else {
            renderPass.colorOps.clearValue.copy(shadowCamera.clearColor)
            renderPass.colorOps.clear = clearRenderTarget
            renderPass.depthStencilOps.storeDepth = false
        }
        renderPass.requiresCubemaps = false
    }
    prepareFace(light, camera, face) {
        const type = light._type
        const lightRenderData = this.getLightRenderData(light, camera, face)
        const shadowCam = lightRenderData.shadowCamera
        const renderTargetIndex = type === LIGHTTYPE_DIRECTIONAL ? 0 : face
        shadowCam.renderTarget = light._shadowMap.renderTargets[renderTargetIndex]
        return shadowCam
    }
    renderFace(light, camera, face, clear) {
        const device = this.device
        const lightRenderData = this.getLightRenderData(light, camera, face)
        const shadowCam = lightRenderData.shadowCamera
        this.dispatchUniforms(light, shadowCam, lightRenderData, face)
        const rt = shadowCam.renderTarget
        const renderer = this.renderer
        renderer.setCameraUniforms(shadowCam, rt)
        if (device.supportsUniformBuffers) {
            renderer.setupViewUniformBuffers(
                lightRenderData.viewBindGroups,
                this.viewUniformFormat,
                this.viewBindGroupFormat,
                null,
            )
        }
        renderer.setupViewport(shadowCam, rt)
        if (clear) {
            renderer.clear(shadowCam)
        }
        this.setupRenderState(device, light)
        this.submitCasters(lightRenderData.visibleCasters, light, shadowCam)
    }
    renderVsm(light, camera) {
        if (light._isVsm && light._vsmBlurSize > 1) {
            const isClustered = this.renderer.scene.clusteredLightingEnabled
            if (!isClustered || light._type === LIGHTTYPE_DIRECTIONAL) {
                this.applyVsmBlur(light, camera)
            }
        }
    }
    getVsmBlurShader(blurMode, filterSize) {
        const cache = this.blurVsmShader
        let blurShader = cache[blurMode][filterSize]
        if (!blurShader) {
            this.blurVsmWeights[filterSize] = gaussWeights(filterSize)
            const defines = new Map()
            defines.set('{SAMPLES}', filterSize)
            if (blurMode === 1) defines.set('GAUSS', '')
            blurShader = ShaderUtils.createShader(this.device, {
                uniqueName: `blurVsm${blurMode}${filterSize}`,
                attributes: {
                    vertex_position: SEMANTIC_POSITION,
                },
                vertexChunk: 'fullscreenQuadVS',
                fragmentChunk: 'blurVSMPS',
                fragmentDefines: defines,
            })
            cache[blurMode][filterSize] = blurShader
        }
        return blurShader
    }
    applyVsmBlur(light, camera) {
        const device = this.device
        device.setBlendState(BlendState.NOBLEND)
        const lightRenderData = light.getRenderData(light._type === LIGHTTYPE_DIRECTIONAL ? camera : null, 0)
        const shadowCam = lightRenderData.shadowCamera
        const origShadowMap = shadowCam.renderTarget
        const tempShadowMap = this.renderer.shadowMapCache.get(device, light)
        const tempRt = tempShadowMap.renderTargets[0]
        const blurMode = light.vsmBlurMode
        const filterSize = light._vsmBlurSize
        const blurShader = this.getVsmBlurShader(blurMode, filterSize)
        blurScissorRect.z = light._shadowResolution - 2
        blurScissorRect.w = blurScissorRect.z
        this.sourceId.setValue(origShadowMap.colorBuffer)
        pixelOffset[0] = 1 / light._shadowResolution
        pixelOffset[1] = 0
        this.pixelOffsetId.setValue(pixelOffset)
        if (blurMode === BLUR_GAUSSIAN) this.weightId.setValue(this.blurVsmWeights[filterSize])
        drawQuadWithShader(device, tempRt, blurShader, null, blurScissorRect)
        this.sourceId.setValue(tempRt.colorBuffer)
        pixelOffset[1] = pixelOffset[0]
        pixelOffset[0] = 0
        this.pixelOffsetId.setValue(pixelOffset)
        drawQuadWithShader(device, origShadowMap, blurShader, null, blurScissorRect)
        this.renderer.shadowMapCache.add(light, tempShadowMap)
    }
    initViewBindGroupFormat() {
        if (this.device.supportsUniformBuffers && !this.viewUniformFormat) {
            this.viewUniformFormat = new UniformBufferFormat(this.device, [
                new UniformFormat('matrix_viewProjection', UNIFORMTYPE_MAT4),
            ])
            this.viewBindGroupFormat = new BindGroupFormat(this.device, [
                new BindUniformBufferFormat(
                    UNIFORM_BUFFER_DEFAULT_SLOT_NAME,
                    SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT,
                ),
            ])
        }
    }
    frameUpdate() {
        this.initViewBindGroupFormat()
    }
    constructor(renderer, lightTextureAtlas) {
        this.shadowPassCache = []
        this.device = renderer.device
        this.renderer = renderer
        this.lightTextureAtlas = lightTextureAtlas
        const scope = this.device.scope
        this.sourceId = scope.resolve('source')
        this.pixelOffsetId = scope.resolve('pixelOffset')
        this.weightId = scope.resolve('weight[0]')
        this.blurVsmShader = [{}, {}]
        this.blurVsmWeights = {}
        this.shadowMapLightRadiusId = scope.resolve('light_radius')
        this.viewUniformFormat = null
        this.viewBindGroupFormat = null
        this.blendStateWrite = new BlendState()
        this.blendStateNoWrite = new BlendState()
        this.blendStateNoWrite.setColorWrite(false, false, false, false)
    }
}

const tempClusterArray = []
class WorldClustersAllocator {
    destroy() {
        if (this._empty) {
            this._empty.destroy()
            this._empty = null
        }
        this._allocated.forEach((cluster) => {
            cluster.destroy()
        })
        this._allocated.length = 0
    }
    get count() {
        return this._allocated.length
    }
    get empty() {
        if (!this._empty) {
            const empty = new WorldClusters(this.device)
            empty.name = 'ClusterEmpty'
            empty.update([])
            this._empty = empty
        }
        return this._empty
    }
    assign(renderPasses) {
        tempClusterArray.push(...this._allocated)
        this._allocated.length = 0
        this._clusters.clear()
        const passCount = renderPasses.length
        for (let p = 0; p < passCount; p++) {
            const renderPass = renderPasses[p]
            const renderActions = renderPass.renderActions
            if (renderActions) {
                const count = renderActions.length
                for (let i = 0; i < count; i++) {
                    const ra = renderActions[i]
                    ra.lightClusters = null
                    const layer = ra.layer
                    if (layer.hasClusteredLights && layer.meshInstances.length) {
                        const hash = layer.getLightIdHash()
                        const existingRenderAction = this._clusters.get(hash)
                        let clusters = existingRenderAction?.lightClusters
                        if (!clusters) {
                            clusters = tempClusterArray.pop() ?? new WorldClusters(this.device)
                            this._allocated.push(clusters)
                            this._clusters.set(hash, ra)
                        }
                        ra.lightClusters = clusters
                    }
                    if (!ra.lightClusters) {
                        ra.lightClusters = this.empty
                    }
                }
            }
        }
        tempClusterArray.forEach((item) => item.destroy())
        tempClusterArray.length = 0
    }
    update(renderPasses, lighting) {
        this.assign(renderPasses)
        this._clusters.forEach((renderAction) => {
            const layer = renderAction.layer
            const cluster = renderAction.lightClusters
            cluster.update(layer.clusteredLightsSet, lighting)
        })
    }
    constructor(graphicsDevice) {
        this._empty = null
        this._allocated = []
        this._clusters = new Map()
        this.device = graphicsDevice
    }
}

const _viewport = new Vec4()
const _invViewProjMatrices = []
class RenderPassCookieRenderer extends RenderPass {
    destroy() {
        this._quadRenderer2D?.destroy()
        this._quadRenderer2D = null
        this._quadRendererCube?.destroy()
        this._quadRendererCube = null
        this._evtDeviceRestored?.off()
        this._evtDeviceRestored = null
    }
    static create(renderTarget, cubeSlotsOffsets) {
        const renderPass = new RenderPassCookieRenderer(renderTarget.device, cubeSlotsOffsets)
        renderPass.init(renderTarget)
        renderPass.colorOps.clear = false
        renderPass.depthStencilOps.clearDepth = false
        return renderPass
    }
    onDeviceRestored() {
        this._forceCopy = true
    }
    update(lights) {
        const filteredLights = this._filteredLights
        this.filter(lights, filteredLights)
        this.executeEnabled = filteredLights.length > 0
    }
    filter(lights, filteredLights) {
        for (let i = 0; i < lights.length; i++) {
            const light = lights[i]
            if (light._type === LIGHTTYPE_DIRECTIONAL) {
                continue
            }
            if (!light.atlasViewportAllocated) {
                continue
            }
            if (!light.atlasSlotUpdated && !this._forceCopy) {
                continue
            }
            if (light.enabled && light.cookie && light.visibleThisFrame) {
                filteredLights.push(light)
            }
        }
        this._forceCopy = false
    }
    initInvViewProjMatrices() {
        if (!_invViewProjMatrices.length) {
            for (let face = 0; face < 6; face++) {
                const camera = LightCamera.create(null, LIGHTTYPE_OMNI, face)
                const projMat = camera.projectionMatrix
                const viewMat = camera.node.getLocalTransform().clone().invert()
                _invViewProjMatrices[face] = new Mat4().mul2(projMat, viewMat).invert()
            }
        }
    }
    get quadRenderer2D() {
        if (!this._quadRenderer2D) {
            const shader = ShaderUtils.createShader(this.device, {
                uniqueName: 'cookieRenderer2d',
                attributes: {
                    vertex_position: SEMANTIC_POSITION,
                },
                vertexChunk: 'cookieBlitVS',
                fragmentChunk: 'cookieBlit2DPS',
            })
            this._quadRenderer2D = new QuadRender(shader)
        }
        return this._quadRenderer2D
    }
    get quadRendererCube() {
        if (!this._quadRendererCube) {
            const shader = ShaderUtils.createShader(this.device, {
                uniqueName: 'cookieRendererCube',
                attributes: {
                    vertex_position: SEMANTIC_POSITION,
                },
                vertexChunk: 'cookieBlitVS',
                fragmentChunk: 'cookieBlitCubePS',
            })
            this._quadRendererCube = new QuadRender(shader)
        }
        return this._quadRendererCube
    }
    execute() {
        const device = this.device
        device.setDrawStates()
        const renderTargetWidth = this.renderTarget.colorBuffer.width
        const cubeSlotsOffsets = this._cubeSlotsOffsets
        const filteredLights = this._filteredLights
        for (let i = 0; i < filteredLights.length; i++) {
            const light = filteredLights[i]
            const faceCount = light.numShadowFaces
            const quad = faceCount > 1 ? this.quadRendererCube : this.quadRenderer2D
            if (faceCount > 1) {
                this.initInvViewProjMatrices()
            }
            this.blitTextureId.setValue(light.cookie)
            for (let face = 0; face < faceCount; face++) {
                _viewport.copy(light.atlasViewport)
                if (faceCount > 1) {
                    const smallSize = _viewport.z / 3
                    const offset = cubeSlotsOffsets[face]
                    _viewport.x += smallSize * offset.x
                    _viewport.y += smallSize * offset.y
                    _viewport.z = smallSize
                    _viewport.w = smallSize
                    this.invViewProjId.setValue(_invViewProjMatrices[face].data)
                }
                _viewport.mulScalar(renderTargetWidth)
                quad.render(_viewport)
            }
        }
        filteredLights.length = 0
    }
    constructor(device, cubeSlotsOffsets) {
        ;(super(device),
            (this._quadRenderer2D = null),
            (this._quadRendererCube = null),
            (this._filteredLights = []),
            (this._forceCopy = false),
            (this._evtDeviceRestored = null))
        this._cubeSlotsOffsets = cubeSlotsOffsets
        this.requiresCubemaps = false
        this.blitTextureId = device.scope.resolve('blitTexture')
        this.invViewProjId = device.scope.resolve('invViewProj')
        this._evtDeviceRestored = device.on('devicerestored', this.onDeviceRestored, this)
    }
}

class RenderPassShadowLocalClustered extends RenderPass {
    update(localLights) {
        const shadowLights = this.shadowRendererLocal.shadowLights
        const shadowCamera = this.shadowRendererLocal.prepareLights(shadowLights, localLights)
        const count = shadowLights.length
        this.enabled = count > 0
        if (count) {
            this.shadowRenderer.setupRenderPass(this, shadowCamera, false)
        }
    }
    execute() {
        const shadowLights = this.shadowRendererLocal.shadowLights
        const count = shadowLights.length
        for (let i = 0; i < count; i++) {
            const light = shadowLights[i]
            for (let face = 0; face < light.numShadowFaces; face++) {
                this.shadowRenderer.renderFace(light, null, face, true)
            }
        }
        shadowLights.length = 0
    }
    constructor(device, shadowRenderer, shadowRendererLocal) {
        super(device)
        this.requiresCubemaps = false
        this.shadowRenderer = shadowRenderer
        this.shadowRendererLocal = shadowRendererLocal
    }
}

class RenderPassUpdateClustered extends RenderPass {
    update(frameGraph, shadowsEnabled, cookiesEnabled, lights, localLights) {
        this.frameGraph = frameGraph
        this.cookiesRenderPass.enabled = cookiesEnabled
        if (cookiesEnabled) {
            this.cookiesRenderPass.update(lights)
        }
        this.shadowRenderPass.enabled = shadowsEnabled
        if (shadowsEnabled) {
            this.shadowRenderPass.update(localLights)
        }
    }
    destroy() {
        this.cookiesRenderPass.destroy()
        this.cookiesRenderPass = null
    }
    execute() {
        const { renderer } = this
        const { scene } = renderer
        renderer.worldClustersAllocator.update(this.frameGraph.renderPasses, scene.lighting)
    }
    constructor(device, renderer, shadowRenderer, shadowRendererLocal, lightTextureAtlas) {
        super(device)
        this.renderer = renderer
        this.frameGraph = null
        this.cookiesRenderPass = RenderPassCookieRenderer.create(
            lightTextureAtlas.cookieRenderTarget,
            lightTextureAtlas.cubeSlotsOffsets,
        )
        this.beforePasses.push(this.cookiesRenderPass)
        this.shadowRenderPass = new RenderPassShadowLocalClustered(device, shadowRenderer, shadowRendererLocal)
        this.beforePasses.push(this.shadowRenderPass)
    }
}

let _skinUpdateIndex = 0
const viewProjMat = new Mat4()
const viewInvMat = new Mat4()
const viewMat = new Mat4()
const viewMat3 = new Mat3()
const tempSphere = new BoundingSphere()
const tempFrustum = new Frustum()
const _flipYMat = new Mat4().setScale(1, -1, 1)
const _tempLightSet = new Set()
const _tempLayerSet = new Set()
const _dynamicBindGroup = new DynamicBindGroup()
const _fixProjRangeMat = new Mat4().set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1])
const _haltonSequence = [
    new Vec2(0.5, 0.333333),
    new Vec2(0.25, 0.666667),
    new Vec2(0.75, 0.111111),
    new Vec2(0.125, 0.444444),
    new Vec2(0.625, 0.777778),
    new Vec2(0.375, 0.222222),
    new Vec2(0.875, 0.555556),
    new Vec2(0.0625, 0.888889),
    new Vec2(0.5625, 0.037037),
    new Vec2(0.3125, 0.37037),
    new Vec2(0.8125, 0.703704),
    new Vec2(0.1875, 0.148148),
    new Vec2(0.6875, 0.481481),
    new Vec2(0.4375, 0.814815),
    new Vec2(0.9375, 0.259259),
    new Vec2(0.03125, 0.592593),
]
const _tempProjMat0 = new Mat4()
const _tempProjMat1 = new Mat4()
const _tempProjMat2 = new Mat4()
const _tempProjMat3 = new Mat4()
const _tempProjMat4 = new Mat4()
const _tempProjMat5 = new Mat4()
const _tempSet = new Set()
const _tempMeshInstances = []
const _tempMeshInstancesSkinned = []
class Renderer {
    destroy() {
        this.shadowRenderer = null
        this._shadowRendererLocal = null
        this._shadowRendererDirectional = null
        this.shadowMapCache.destroy()
        this.shadowMapCache = null
        this._renderPassUpdateClustered?.destroy()
        this._renderPassUpdateClustered = null
        this.lightTextureAtlas.destroy()
        this.lightTextureAtlas = null
        this.gsplatDirector?.destroy()
        this.gsplatDirector = null
    }
    setupViewport(camera, renderTarget) {
        const device = this.device
        const pixelWidth = renderTarget ? renderTarget.width : device.width
        const pixelHeight = renderTarget ? renderTarget.height : device.height
        const rect = camera.rect
        let x = Math.floor(rect.x * pixelWidth)
        let y = Math.floor(rect.y * pixelHeight)
        let w = Math.floor(rect.z * pixelWidth)
        let h = Math.floor(rect.w * pixelHeight)
        device.setViewport(x, y, w, h)
        if (camera._scissorRectClear) {
            const scissorRect = camera.scissorRect
            x = Math.floor(scissorRect.x * pixelWidth)
            y = Math.floor(scissorRect.y * pixelHeight)
            w = Math.floor(scissorRect.z * pixelWidth)
            h = Math.floor(scissorRect.w * pixelHeight)
        }
        device.setScissor(x, y, w, h)
    }
    setCameraUniforms(camera, target) {
        const flipY = target?.flipY
        let viewList = null
        if (camera.xr && camera.xr.session) {
            const transform = camera._node?.parent?.getWorldTransform() || null
            const views = camera.xr.views
            viewList = views.list
            for (let v = 0; v < viewList.length; v++) {
                const view = viewList[v]
                view.updateTransforms(transform)
            }
        } else {
            let projMat = camera.projectionMatrix
            if (camera.calculateProjection) {
                camera.calculateProjection(projMat, VIEW_CENTER)
            }
            let projMatSkybox = camera.getProjectionMatrixSkybox()
            if (flipY) {
                projMat = _tempProjMat0.mul2(_flipYMat, projMat)
                projMatSkybox = _tempProjMat1.mul2(_flipYMat, projMatSkybox)
            }
            if (this.device.isWebGPU) {
                projMat = _tempProjMat2.mul2(_fixProjRangeMat, projMat)
                projMatSkybox = _tempProjMat3.mul2(_fixProjRangeMat, projMatSkybox)
            }
            const { jitter } = camera
            let jitterX = 0
            let jitterY = 0
            if (jitter > 0) {
                const targetWidth = target ? target.width : this.device.width
                const targetHeight = target ? target.height : this.device.height
                const offset = _haltonSequence[this.device.renderVersion % _haltonSequence.length]
                jitterX = (jitter * (offset.x * 2 - 1)) / targetWidth
                jitterY = (jitter * (offset.y * 2 - 1)) / targetHeight
                projMat = _tempProjMat4.copy(projMat)
                projMat.data[8] = jitterX
                projMat.data[9] = jitterY
                projMatSkybox = _tempProjMat5.copy(projMatSkybox)
                projMatSkybox.data[8] = jitterX
                projMatSkybox.data[9] = jitterY
                if (this.blueNoiseJitterVersion !== this.device.renderVersion) {
                    this.blueNoiseJitterVersion = this.device.renderVersion
                    this.blueNoise.vec4(this.blueNoiseJitterVec)
                }
            }
            const jitterVec = jitter > 0 ? this.blueNoiseJitterVec : Vec4.ZERO
            this.blueNoiseJitterData[0] = jitterVec.x
            this.blueNoiseJitterData[1] = jitterVec.y
            this.blueNoiseJitterData[2] = jitterVec.z
            this.blueNoiseJitterData[3] = jitterVec.w
            this.blueNoiseJitterId.setValue(this.blueNoiseJitterData)
            this.projId.setValue(projMat.data)
            this.projSkyboxId.setValue(projMatSkybox.data)
            if (camera.calculateTransform) {
                camera.calculateTransform(viewInvMat, VIEW_CENTER)
            } else {
                const pos = camera._node.getPosition()
                const rot = camera._node.getRotation()
                viewInvMat.setTRS(pos, rot, Vec3.ONE)
            }
            this.viewInvId.setValue(viewInvMat.data)
            viewMat.copy(viewInvMat).invert()
            this.viewId.setValue(viewMat.data)
            viewMat3.setFromMat4(viewMat)
            this.viewId3.setValue(viewMat3.data)
            viewProjMat.mul2(projMat, viewMat)
            this.viewProjId.setValue(viewProjMat.data)
            camera._storeShaderMatrices(viewProjMat, jitterX, jitterY, this.device.renderVersion)
            this.flipYId.setValue(flipY ? -1 : 1)
            this.dispatchViewPos(camera._node.getPosition())
            camera.frustum.setFromMat4(viewProjMat)
        }
        this.tbnBasis.setValue(flipY ? -1 : 1)
        this.cameraParamsId.setValue(camera.fillShaderParams(this.cameraParams))
        let viewportWidth = target ? target.width : this.device.width
        let viewportHeight = target ? target.height : this.device.height
        viewportWidth *= camera.rect.z
        viewportHeight *= camera.rect.w
        if (camera.xr?.active && camera.xr.views.list.length === 2) {
            viewportWidth *= 0.5
        }
        this.viewportSize[0] = viewportWidth
        this.viewportSize[1] = viewportHeight
        this.viewportSize[2] = 1 / viewportWidth
        this.viewportSize[3] = 1 / viewportHeight
        this.viewportSizeId.setValue(this.viewportSize)
        this.exposureId.setValue(this.scene.physicalUnits ? camera.getExposure() : this.scene.exposure)
        return viewList
    }
    clear(camera, clearColor, clearDepth, clearStencil) {
        const flags =
            ((clearColor ?? camera._clearColorBuffer) ? CLEARFLAG_COLOR : 0) |
            ((clearDepth ?? camera._clearDepthBuffer) ? CLEARFLAG_DEPTH : 0) |
            ((clearStencil ?? camera._clearStencilBuffer) ? CLEARFLAG_STENCIL : 0)
        if (flags) {
            const device = this.device
            device.clear({
                color: [camera._clearColor.r, camera._clearColor.g, camera._clearColor.b, camera._clearColor.a],
                depth: camera._clearDepth,
                stencil: camera._clearStencil,
                flags: flags,
            })
        }
    }
    setupCullModeAndFrontFace(cullFaces, flipFactor, drawCall) {
        const material = drawCall.material
        const flipFaces = flipFactor * drawCall.flipFacesFactor * drawCall.node.worldScaleSign
        let frontFace = material.frontFace
        if (flipFaces < 0) {
            frontFace = frontFace === FRONTFACE_CCW ? FRONTFACE_CW : FRONTFACE_CCW
        }
        this.device.setCullMode(cullFaces ? material.cull : CULLFACE_NONE)
        this.device.setFrontFace(frontFace)
    }
    setupCullMode(cullFaces, flipFactor, drawCall) {
        this.setupCullModeAndFrontFace(cullFaces, flipFactor, drawCall)
    }
    updateCameraFrustum(camera) {
        if (camera.xr && camera.xr.views.list.length) {
            const views = camera.xr.views.list
            viewProjMat.mul2(views[0].projMat, views[0].viewOffMat)
            camera.frustum.setFromMat4(viewProjMat)
            for (let v = 1; v < views.length; v++) {
                viewProjMat.mul2(views[v].projMat, views[v].viewOffMat)
                tempFrustum.setFromMat4(viewProjMat)
                camera.frustum.add(tempFrustum)
            }
            return
        }
        const projMat = camera.projectionMatrix
        if (camera.calculateProjection) {
            camera.calculateProjection(projMat, VIEW_CENTER)
        }
        if (camera.calculateTransform) {
            camera.calculateTransform(viewInvMat, VIEW_CENTER)
        } else {
            const pos = camera._node.getPosition()
            const rot = camera._node.getRotation()
            viewInvMat.setTRS(pos, rot, Vec3.ONE)
            this.viewInvId.setValue(viewInvMat.data)
        }
        viewMat.copy(viewInvMat).invert()
        viewProjMat.mul2(projMat, viewMat)
        camera.frustum.setFromMat4(viewProjMat)
    }
    setBaseConstants(device, material) {
        device.setCullMode(material.cull)
        device.setFrontFace(material.frontFace)
        if (material.opacityMap) {
            this.opacityMapId.setValue(material.opacityMap)
        }
        if (material.opacityMap || material.alphaTest > 0) {
            this.alphaTestId.setValue(material.alphaTest)
        }
    }
    updateCpuSkinMatrices(drawCalls) {
        _skinUpdateIndex++
        const drawCallsCount = drawCalls.length
        if (drawCallsCount === 0) return
        for (let i = 0; i < drawCallsCount; i++) {
            const si = drawCalls[i].skinInstance
            if (si) {
                si.updateMatrices(drawCalls[i].node, _skinUpdateIndex)
                si._dirty = true
            }
        }
    }
    updateGpuSkinMatrices(drawCalls) {
        for (const drawCall of drawCalls) {
            const skin = drawCall.skinInstance
            if (skin && skin._dirty) {
                skin.updateMatrixPalette(drawCall.node, _skinUpdateIndex)
                skin._dirty = false
            }
        }
    }
    updateMorphing(drawCalls) {
        for (const drawCall of drawCalls) {
            const morphInst = drawCall.morphInstance
            if (morphInst && morphInst._dirty) {
                morphInst.update()
            }
        }
    }
    updateGSplats(drawCalls) {
        for (const drawCall of drawCalls) {
            drawCall.gsplatInstance?.update()
        }
    }
    gpuUpdate(drawCalls) {
        this.updateGpuSkinMatrices(drawCalls)
        this.updateMorphing(drawCalls)
        this.updateGSplats(drawCalls)
    }
    setVertexBuffers(device, mesh) {
        device.setVertexBuffer(mesh.vertexBuffer)
    }
    setMorphing(device, morphInstance) {
        if (morphInstance) {
            morphInstance.prepareRendering(device)
            device.setVertexBuffer(morphInstance.morph.vertexBufferIds)
            this.morphPositionTex.setValue(morphInstance.texturePositions)
            this.morphNormalTex.setValue(morphInstance.textureNormals)
            this.morphTexParams.setValue(morphInstance._textureParams)
        }
    }
    setSkinning(device, meshInstance) {
        const skinInstance = meshInstance.skinInstance
        if (skinInstance) {
            this._skinDrawCalls++
            const boneTexture = skinInstance.boneTexture
            this.boneTextureId.setValue(boneTexture)
        }
    }
    dispatchViewPos(position) {
        const vp = this.viewPos
        vp[0] = position.x
        vp[1] = position.y
        vp[2] = position.z
        this.viewPosId.setValue(vp)
    }
    initViewBindGroupFormat(isClustered) {
        if (this.device.supportsUniformBuffers && !this.viewUniformFormat) {
            const uniforms = [
                new UniformFormat('matrix_view', UNIFORMTYPE_MAT4),
                new UniformFormat('matrix_viewInverse', UNIFORMTYPE_MAT4),
                new UniformFormat('matrix_projection', UNIFORMTYPE_MAT4),
                new UniformFormat('matrix_projectionSkybox', UNIFORMTYPE_MAT4),
                new UniformFormat('matrix_viewProjection', UNIFORMTYPE_MAT4),
                new UniformFormat('matrix_view3', UNIFORMTYPE_MAT3),
                new UniformFormat('cubeMapRotationMatrix', UNIFORMTYPE_MAT3),
                new UniformFormat('view_position', UNIFORMTYPE_VEC3),
                new UniformFormat('viewport_size', UNIFORMTYPE_VEC4),
                new UniformFormat('skyboxIntensity', UNIFORMTYPE_FLOAT),
                new UniformFormat('exposure', UNIFORMTYPE_FLOAT),
                new UniformFormat('textureBias', UNIFORMTYPE_FLOAT),
                new UniformFormat('view_index', UNIFORMTYPE_FLOAT),
            ]
            if (isClustered) {
                uniforms.push(
                    ...[
                        new UniformFormat('clusterCellsCountByBoundsSize', UNIFORMTYPE_VEC3),
                        new UniformFormat('clusterBoundsMin', UNIFORMTYPE_VEC3),
                        new UniformFormat('clusterBoundsDelta', UNIFORMTYPE_VEC3),
                        new UniformFormat('clusterCellsDot', UNIFORMTYPE_IVEC3),
                        new UniformFormat('clusterCellsMax', UNIFORMTYPE_IVEC3),
                        new UniformFormat('shadowAtlasParams', UNIFORMTYPE_VEC2),
                        new UniformFormat('clusterMaxCells', UNIFORMTYPE_INT),
                        new UniformFormat('numClusteredLights', UNIFORMTYPE_INT),
                        new UniformFormat('clusterTextureWidth', UNIFORMTYPE_INT),
                    ],
                )
            }
            this.viewUniformFormat = new UniformBufferFormat(this.device, uniforms)
            const formats = [
                new BindUniformBufferFormat(
                    UNIFORM_BUFFER_DEFAULT_SLOT_NAME,
                    SHADERSTAGE_VERTEX | SHADERSTAGE_FRAGMENT,
                ),
            ]
            this.viewBindGroupFormat = new BindGroupFormat(this.device, formats)
        }
    }
    setupViewUniforms(view, index) {
        this.projId.setValue(view.projMat.data)
        this.projSkyboxId.setValue(view.projMat.data)
        this.viewId.setValue(view.viewOffMat.data)
        this.viewInvId.setValue(view.viewInvOffMat.data)
        this.viewId3.setValue(view.viewMat3.data)
        this.viewProjId.setValue(view.projViewOffMat.data)
        this.viewPosId.setValue(view.positionData)
        this.viewIndexId.setValue(index)
    }
    setupViewUniformBuffers(viewBindGroups, viewUniformFormat, viewBindGroupFormat, viewList) {
        const { device } = this
        const viewCount = viewList?.length ?? 1
        while (viewBindGroups.length < viewCount) {
            const ub = new UniformBuffer(device, viewUniformFormat, false)
            const bg = new BindGroup(device, viewBindGroupFormat, ub)
            viewBindGroups.push(bg)
        }
        if (viewList) {
            for (let i = 0; i < viewCount; i++) {
                const view = viewList[i]
                this.setupViewUniforms(view, i)
                const viewBindGroup = viewBindGroups[i]
                viewBindGroup.defaultUniformBuffer.update()
                viewBindGroup.update()
            }
        } else {
            const viewBindGroup = viewBindGroups[0]
            viewBindGroup.defaultUniformBuffer.update()
            viewBindGroup.update()
        }
        if (!viewList) {
            device.setBindGroup(BINDGROUP_VIEW, viewBindGroups[0])
        }
    }
    setupMeshUniformBuffers(shaderInstance) {
        const device = this.device
        if (device.supportsUniformBuffers) {
            const meshBindGroup = shaderInstance.getBindGroup(device)
            meshBindGroup.update()
            device.setBindGroup(BINDGROUP_MESH, meshBindGroup)
            const meshUniformBuffer = shaderInstance.getUniformBuffer(device)
            meshUniformBuffer.update(_dynamicBindGroup)
            device.setBindGroup(BINDGROUP_MESH_UB, _dynamicBindGroup.bindGroup, _dynamicBindGroup.offsets)
        }
    }
    setMeshInstanceMatrices(meshInstance, setNormalMatrix = false) {
        const modelMatrix = meshInstance.node.worldTransform
        this.modelMatrixId.setValue(modelMatrix.data)
        if (setNormalMatrix) {
            this.normalMatrixId.setValue(meshInstance.node.normalMatrix.data)
        }
    }
    cull(camera, drawCalls, culledInstances) {
        const opaque = culledInstances.opaque
        opaque.length = 0
        const transparent = culledInstances.transparent
        transparent.length = 0
        const doCull = camera.frustumCulling
        const count = drawCalls.length
        for (let i = 0; i < count; i++) {
            const drawCall = drawCalls[i]
            if (drawCall.visible) {
                const visible = !doCull || !drawCall.cull || drawCall._isVisible(camera)
                if (visible) {
                    drawCall.visibleThisFrame = true
                    const bucket = drawCall.transparent ? transparent : opaque
                    bucket.push(drawCall)
                    if (drawCall.skinInstance || drawCall.morphInstance || drawCall.gsplatInstance) {
                        this.processingMeshInstances.add(drawCall)
                        if (drawCall.gsplatInstance) {
                            drawCall.gsplatInstance.cameras.push(camera)
                        }
                    }
                }
            }
        }
    }
    collectLights(comp) {
        this.lights.length = 0
        this.localLights.length = 0
        const stats = this.scene._stats
        const count = comp.layerList.length
        for (let i = 0; i < count; i++) {
            const layer = comp.layerList[i]
            if (!_tempLayerSet.has(layer)) {
                _tempLayerSet.add(layer)
                const lights = layer._lights
                for (let j = 0; j < lights.length; j++) {
                    const light = lights[j]
                    if (!_tempLightSet.has(light)) {
                        _tempLightSet.add(light)
                        this.lights.push(light)
                        if (light._type !== LIGHTTYPE_DIRECTIONAL) {
                            this.localLights.push(light)
                        }
                    }
                }
            }
        }
        stats.lights = this.lights.length
        _tempLightSet.clear()
        _tempLayerSet.clear()
    }
    cullLights(camera, lights) {
        const clusteredLightingEnabled = this.scene.clusteredLightingEnabled
        const physicalUnits = this.scene.physicalUnits
        for (let i = 0; i < lights.length; i++) {
            const light = lights[i]
            if (light.enabled) {
                if (light._type !== LIGHTTYPE_DIRECTIONAL) {
                    light.getBoundingSphere(tempSphere)
                    if (camera.frustum.containsSphere(tempSphere)) {
                        light.visibleThisFrame = true
                        light.usePhysicalUnits = physicalUnits
                        const screenSize = camera.getScreenSize(tempSphere)
                        light.maxScreenSize = Math.max(light.maxScreenSize, screenSize)
                    } else {
                        if (!clusteredLightingEnabled) {
                            if (light.castShadows && !light.shadowMap) {
                                light.visibleThisFrame = true
                            }
                        }
                    }
                } else {
                    light.usePhysicalUnits = this.scene.physicalUnits
                }
            }
        }
    }
    cullShadowmaps(comp) {
        const isClustered = this.scene.clusteredLightingEnabled
        for (let i = 0; i < this.localLights.length; i++) {
            const light = this.localLights[i]
            if (light._type !== LIGHTTYPE_DIRECTIONAL) {
                if (isClustered) {
                    if (light.atlasSlotUpdated && light.shadowUpdateMode === SHADOWUPDATE_NONE) {
                        light.shadowUpdateMode = SHADOWUPDATE_THISFRAME
                    }
                } else {
                    if (light.shadowUpdateMode === SHADOWUPDATE_NONE && light.castShadows) {
                        if (!light.getRenderData(null, 0).shadowCamera.renderTarget) {
                            light.shadowUpdateMode = SHADOWUPDATE_THISFRAME
                        }
                    }
                }
                if (light.visibleThisFrame && light.castShadows && light.shadowUpdateMode !== SHADOWUPDATE_NONE) {
                    this._shadowRendererLocal.cull(light, comp)
                }
            }
        }
        this.cameraDirShadowLights.clear()
        const cameras = comp.cameras
        for (let i = 0; i < cameras.length; i++) {
            const cameraComponent = cameras[i]
            if (cameraComponent.enabled) {
                const camera = cameraComponent.camera
                let lightList
                const cameraLayers = camera.layers
                for (let l = 0; l < cameraLayers.length; l++) {
                    const cameraLayer = comp.getLayerById(cameraLayers[l])
                    if (cameraLayer) {
                        const layerDirLights = cameraLayer.splitLights[LIGHTTYPE_DIRECTIONAL]
                        for (let j = 0; j < layerDirLights.length; j++) {
                            const light = layerDirLights[j]
                            if (light.castShadows && !_tempSet.has(light)) {
                                _tempSet.add(light)
                                lightList = lightList ?? []
                                lightList.push(light)
                                this._shadowRendererDirectional.cull(light, comp, camera)
                            }
                        }
                    }
                }
                if (lightList) {
                    this.cameraDirShadowLights.set(camera, lightList)
                }
                _tempSet.clear()
            }
        }
    }
    cullComposition(comp) {
        const { scene } = this
        this.processingMeshInstances.clear()
        const numCameras = comp.cameras.length
        this._camerasRendered += numCameras
        for (let i = 0; i < numCameras; i++) {
            const camera = comp.cameras[i]
            scene?.fire(EVENT_PRECULL, camera)
            const renderTarget = camera.renderTarget
            camera.frameUpdate(renderTarget)
            this.updateCameraFrustum(camera.camera)
            const layerIds = camera.layers
            for (let j = 0; j < layerIds.length; j++) {
                const layer = comp.getLayerById(layerIds[j])
                if (layer && layer.enabled) {
                    this.cullLights(camera.camera, layer._lights)
                    const culledInstances = layer.getCulledInstances(camera.camera)
                    this.cull(camera.camera, layer.meshInstances, culledInstances)
                }
            }
            scene?.fire(EVENT_POSTCULL, camera)
        }
        if (scene.clusteredLightingEnabled) {
            this.updateLightTextureAtlas()
        }
        this.cullShadowmaps(comp)
        scene?.fire(EVENT_CULL_END)
    }
    updateShaders(drawCalls, onlyLitShaders) {
        const count = drawCalls.length
        for (let i = 0; i < count; i++) {
            const mat = drawCalls[i].material
            if (mat) {
                if (!_tempSet.has(mat)) {
                    _tempSet.add(mat)
                    if (mat.getShaderVariant !== Material.prototype.getShaderVariant) {
                        if (onlyLitShaders) {
                            if (!mat.useLighting || (mat.emitter && !mat.emitter.lighting)) {
                                continue
                            }
                        }
                        mat.clearVariants()
                    }
                }
            }
        }
        _tempSet.clear()
    }
    updateFrameUniforms() {
        this.blueNoiseTextureId.setValue(getBlueNoiseTexture(this.device))
    }
    beginFrame(comp) {
        const scene = this.scene
        const updateShaders = scene.updateShaders || this.device._shadersDirty
        const layers = comp.layerList
        const layerCount = layers.length
        for (let i = 0; i < layerCount; i++) {
            const layer = layers[i]
            const meshInstances = layer.meshInstances
            const count = meshInstances.length
            for (let j = 0; j < count; j++) {
                const meshInst = meshInstances[j]
                meshInst.visibleThisFrame = false
                if (updateShaders) {
                    _tempMeshInstances.push(meshInst)
                }
                if (meshInst.skinInstance) {
                    _tempMeshInstancesSkinned.push(meshInst)
                }
            }
        }
        if (updateShaders) {
            const onlyLitShaders = !scene.updateShaders || !this.device._shadersDirty
            this.updateShaders(_tempMeshInstances, onlyLitShaders)
            scene.updateShaders = false
            this.device._shadersDirty = false
            scene._shaderVersion++
        }
        this.updateFrameUniforms()
        this.updateCpuSkinMatrices(_tempMeshInstancesSkinned)
        _tempMeshInstances.length = 0
        _tempMeshInstancesSkinned.length = 0
        const lights = this.lights
        const lightCount = lights.length
        for (let i = 0; i < lightCount; i++) {
            lights[i].beginFrame()
        }
    }
    updateLightTextureAtlas() {
        this.lightTextureAtlas.update(this.localLights, this.scene.lighting)
    }
    updateLayerComposition(comp) {
        const len = comp.layerList.length
        const scene = this.scene
        const shaderVersion = scene._shaderVersion
        for (let i = 0; i < len; i++) {
            const layer = comp.layerList[i]
            layer._shaderVersion = shaderVersion
        }
        comp._update()
    }
    frameUpdate() {
        this.clustersDebugRendered = false
        this.initViewBindGroupFormat(this.scene.clusteredLightingEnabled)
        this.dirLightShadows.clear()
    }
    constructor(graphicsDevice, scene) {
        this.clustersDebugRendered = false
        this.processingMeshInstances = new Set()
        this.lights = []
        this.localLights = []
        this.cameraDirShadowLights = new Map()
        this.dirLightShadows = new Map()
        this.blueNoise = new BlueNoise(123)
        this.gsplatDirector = null
        this.device = graphicsDevice
        this.scene = scene
        this.worldClustersAllocator = new WorldClustersAllocator(graphicsDevice)
        this.lightTextureAtlas = new LightTextureAtlas(graphicsDevice)
        this.shadowMapCache = new ShadowMapCache()
        this.shadowRenderer = new ShadowRenderer(this, this.lightTextureAtlas)
        this._shadowRendererLocal = new ShadowRendererLocal(this, this.shadowRenderer)
        this._shadowRendererDirectional = new ShadowRendererDirectional(this, this.shadowRenderer)
        if (this.scene.clusteredLightingEnabled) {
            this._renderPassUpdateClustered = new RenderPassUpdateClustered(
                this.device,
                this,
                this.shadowRenderer,
                this._shadowRendererLocal,
                this.lightTextureAtlas,
            )
        }
        this.viewUniformFormat = null
        this.viewBindGroupFormat = null
        this._skinTime = 0
        this._morphTime = 0
        this._cullTime = 0
        this._shadowMapTime = 0
        this._lightClustersTime = 0
        this._layerCompositionUpdateTime = 0
        this._shadowDrawCalls = 0
        this._skinDrawCalls = 0
        this._instancedDrawCalls = 0
        this._shadowMapUpdates = 0
        this._numDrawCallsCulled = 0
        this._camerasRendered = 0
        this._lightClusters = 0
        this._gsplatCount = 0
        const scope = graphicsDevice.scope
        this.boneTextureId = scope.resolve('texture_poseMap')
        this.modelMatrixId = scope.resolve('matrix_model')
        this.normalMatrixId = scope.resolve('matrix_normal')
        this.viewInvId = scope.resolve('matrix_viewInverse')
        this.viewPos = new Float32Array(3)
        this.viewPosId = scope.resolve('view_position')
        this.projId = scope.resolve('matrix_projection')
        this.projSkyboxId = scope.resolve('matrix_projectionSkybox')
        this.viewId = scope.resolve('matrix_view')
        this.viewId3 = scope.resolve('matrix_view3')
        this.viewProjId = scope.resolve('matrix_viewProjection')
        this.flipYId = scope.resolve('projectionFlipY')
        this.tbnBasis = scope.resolve('tbnBasis')
        this.cameraParams = new Float32Array(4)
        this.cameraParamsId = scope.resolve('camera_params')
        this.viewportSize = new Float32Array(4)
        this.viewportSizeId = scope.resolve('viewport_size')
        this.viewIndexId = scope.resolve('view_index')
        this.viewIndexId.setValue(0)
        this.blueNoiseJitterVersion = 0
        this.blueNoiseJitterVec = new Vec4()
        this.blueNoiseJitterData = new Float32Array(4)
        this.blueNoiseJitterId = scope.resolve('blueNoiseJitter')
        this.blueNoiseTextureId = scope.resolve('blueNoiseTex32')
        this.alphaTestId = scope.resolve('alpha_ref')
        this.opacityMapId = scope.resolve('texture_opacityMap')
        this.exposureId = scope.resolve('exposure')
        this.morphPositionTex = scope.resolve('morphPositionTex')
        this.morphNormalTex = scope.resolve('morphNormalTex')
        this.morphTexParams = scope.resolve('morph_tex_params')
        this.lightCube = new LightCube()
        this.constantLightCube = scope.resolve('lightCube[0]')
    }
}