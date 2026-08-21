/**
 * Minimal keyed event emitter for the message `channel`.
 *
 * Replaces tseep: its only edge is eval-baked dispatch, which a browser CSP
 * (script-src without 'unsafe-eval') forbids and which is drowned by JSON + socket
 * I/O on the server anyway — so it never paid off here, while the dependency, the
 * deep no-`exports` import and the node/browser split all cost real friction. This
 * is dependency-free and identical in Node and the browser.
 *
 * `emit()` returns whether the event had listeners — wse leans on that for its
 * `channel.emit(...) || ignored.emit(...)` fallback.
 */
export class EventEmitter {
  constructor () {
    /** @type {Map<string, Function[]>} */
    this._events = new Map()
  }

  on (type, fn) {
    const list = this._events.get(type)
    if (list) list.push(fn)
    else this._events.set(type, [ fn ])
    return this
  }

  once (type, fn) {
    const wrap = (...args) => {
      this.off(type, wrap)
      fn(...args)
    }
    wrap.listener = fn // so off(type, fn) can find the original through its wrapper
    return this.on(type, wrap)
  }

  off (type, fn) {
    const list = this._events.get(type)
    if (!list) return this
    const i = list.findIndex(f => f === fn || f.listener === fn)
    if (i !== -1) {
      list.splice(i, 1)
      if (!list.length) this._events.delete(type)
    }
    return this
  }

  removeListener (type, fn) {
    return this.off(type, fn)
  }

  removeAllListeners (type) {
    if (type === undefined) this._events.clear()
    else this._events.delete(type)
    return this
  }

  emit (type, a, b, c, ...rest) {
    const list = this._events.get(type)
    if (!list || !list.length) return false
    // Snapshot: a handler may add or remove listeners (e.g. once) mid-dispatch.
    const snap = list.slice()
    if (rest.length) {
      const args = [ a, b, c, ...rest ]
      for (const fn of snap) fn(...args)
    } else {
      for (const fn of snap) fn(a, b, c)
    }
    return true
  }

  listenerCount (type) {
    const list = this._events.get(type)
    return list ? list.length : 0
  }
}
