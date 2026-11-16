/**
 * @import { MessagePort } from 'node:worker_threads'
 */

import Signal from 'a-signal'

import { EventEmitter } from './emitter.js'

import { WseJSON }                                  from './protocol.js'
import { GATE_OP, WSE_ERROR, WSE_REASON, WseError } from './common.js'
import { RpcManager }                               from './rpc-man.js'

const MIN_BUF = 64 * 1024
const MAX_IN_FLIGHT = 2

const encoder = new TextEncoder()

export class WseGateClient {
  /**
   * A client forwarded to this gate by server.forward().
   * @param {string} cid
   * @param {number} seat
   * @param {*} meta - What server.forward() was given.
   * @param {WseGate} gate
   */
  constructor (cid, seat, meta, gate) {
    /** @type {string} */
    this.cid = cid
    this.meta = meta
    Object.defineProperty(this, 'gate', { enumerable: false, value: gate })
    Object.defineProperty(this, '_seat', { enumerable: false, value: seat, writable: true })
  }

  /**
   * Send a message to every device of this client.
   * @param {string} type
   * @param {*} [payload]
   */
  send (type, payload) {
    this.gate._frame(this.cid, this._seat, this.gate.protocol.pack({ type, payload }))
  }

  /**
   * Take the client out of this gate. Its socket stays open; the server gets link.when.left.
   * @param {string} [reason]
   */
  leave (reason = WSE_REASON.BY_SERVER) {
    const gate = this.gate
    if (gate.clients.get(this.cid) !== this) return
    gate._admitting.delete(this.cid)
    gate._op(GATE_OP.LEFT, this.cid, this._seat, String(reason))
    gate._remove(this.cid, String(reason))
  }
}

/**
 * Worker end of server.link(). Clients are authenticated on the main thread; the gate admits them,
 * runs their messages and calls, and packs everything it sends. Frames are flushed in order, as one
 * postMessage per event-loop turn - an await on a macrotask inside a tick splits it into two.
 */
export class WseGate {
  /**
   * @param {object} options
   * @param {MessagePort} options.port - The other end of the port given to server.link().
   * @param {object} [options.protocol=WseJSON] - Has to pack exactly like the server's protocol.
   * @param {Function} [options.admit] - ({ cid, meta, accept, refuse }) => void. Accepts everyone by default.
   */
  constructor ({ port, protocol, admit }) {
    /** @type {MessagePort} */
    this.port = port
    this.protocol = protocol || new WseJSON()
    this.admit = admit || (({ accept }) => accept())
    this.closed = false

    /** @type {Map<string, WseGateClient>} */
    this.clients = new Map()
    this.channel = new EventEmitter()

    this.joined = new Signal()
    this.left = new Signal()
    this.ignored = new Signal()
    this.error = new Signal()

    /**
     * @type {{
     *   joined: function(function(WseGateClient, *): void): void,
     *   left: function(function(WseGateClient, string): void): void,
     *   ignored: function(function(WseGateClient, string, *): void): void,
     *   error: function(function(*, WseGateClient=): void): void
     * }}
     */
    this.when = {
      joined: this.joined.extractOn(),
      left: this.left.extractOn(),
      ignored: this.ignored.extractOn(),
      error: this.error.extractOn(),
    }

    this._rpcManager = new RpcManager()
    this._admitting = new Map()

    this._buf = new Uint8Array(MIN_BUF)
    this._len = 0
    this._ops = []
    this._framed = false
    this._scheduled = false
    this._in_flight = 0

    port.on('message', msg => this._receive(msg))
    port.on('close', () => this._closed())
  }

  /**
   * @param {string} rp
   * @param {function(WseGateClient, *): *} handler
   */
  register (rp, handler) {
    this._rpcManager.register(rp, handler)
  }

  /**
   * @param {string} rp
   */
  unregister (rp) {
    this._rpcManager.unregister(rp)
  }

  /**
   * Send a message to one client of this gate, every device of it.
   * @param {string} cid
   * @param {string} type
   * @param {*} [payload]
   */
  send (cid, type, payload) {
    this.clients.get(cid)?.send(type, payload)
  }

  /**
   * Send a message to every admitted client of this gate. Packed once.
   * @param {string} type
   * @param {*} [payload]
   */
  broadcast (type, payload) {
    this._frame(null, null, this.protocol.pack({ type, payload }))
  }

  /**
   * Post everything queued so far now instead of at the end of this event-loop turn - unless the server
   * has not caught up with two batches yet; then it goes out, merged, once the server acknowledges one.
   */
  flush () {
    this._scheduled = false
    if (!this._ops.length || this.closed || this._in_flight >= MAX_IN_FLIGHT) return
    const ops = this._ops
    this._ops = []
    this._in_flight++
    if (!this._framed) return this.port.postMessage({ ops })
    this._framed = false
    const buf = this._buf.slice(0, this._len).buffer
    if (this._buf.length > MIN_BUF && this._len < this._buf.length >> 2) this._buf = new Uint8Array(Math.max(MIN_BUF, this._len * 2))
    this._len = 0
    this.port.postMessage({ buf, ops }, [ buf ])
  }

  _schedule () {
    if (this._scheduled) return
    this._scheduled = true
    setImmediate(() => this._scheduled && this.flush())
  }

  _fit (bytes) {
    if (this._len + bytes <= this._buf.length) return
    const next = new Uint8Array(Math.max(this._buf.length * 2, this._len + bytes))
    next.set(this._buf.subarray(0, this._len))
    this._buf = next
  }

  _put (packed) {
    if (typeof packed === 'string') {
      let { read, written } = encoder.encodeInto(packed, this._buf.subarray(this._len))
      if (read < packed.length) {
        this._fit(packed.length * 3)
        ;({ written } = encoder.encodeInto(packed, this._buf.subarray(this._len)))
      }
      this._len += written
      return written
    }
    let bytes
    if (packed instanceof ArrayBuffer) bytes = new Uint8Array(packed)
    else if (ArrayBuffer.isView(packed)) bytes = new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength)
    else throw new TypeError(`protocol.pack() returned ${ packed?.constructor?.name ?? typeof packed }; a gate frames a string, an ArrayBuffer or a view`)
    this._fit(bytes.length)
    this._buf.set(bytes, this._len)
    this._len += bytes.length
    return bytes.length
  }

  _frame (cid, seat, packed) {
    if (this.closed) return
    const off = this._len
    const length = this._put(packed)
    this._framed = true
    this._op(GATE_OP.FRAME, cid, seat, off, length, typeof packed === 'string')
  }

  _reply (cid, conn_id, stamp, packed) {
    if (this.closed) return
    const off = this._len
    const length = this._put(packed)
    this._framed = true
    this._op(GATE_OP.REPLY, cid, conn_id, stamp, off, length, typeof packed === 'string')
  }

  _op (...op) {
    if (this.closed) return
    this._ops.push(...op)
    this._schedule()
  }

  _receive (msg) {
    if (!Array.isArray(msg?.ops)) return this.error.emit(new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { msg }))
    const ops = msg.ops
    for (let i = 0; i < ops.length;) {
      switch (ops[i]) {
        case GATE_OP.JOIN:
          this._join(ops[i + 1], ops[i + 2], ops[i + 3])
          i += 4
          break
        case GATE_OP.LEAVE:
          this._leave(ops[i + 1], ops[i + 2], ops[i + 3])
          i += 4
          break
        case GATE_OP.MSG:
          this._message(ops[i + 1], ops[i + 2], ops[i + 3])
          i += 4
          break
        case GATE_OP.CALL:
          this._call(ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4], ops[i + 5])
          i += 6
          break
        case GATE_OP.ACK:
          this._in_flight--
          this.flush()
          i += 1
          break
        default:
          this.error.emit(new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { op: ops[i] }))
          return
      }
    }
  }

  _join (cid, seat, meta) {
    const token = { seat }
    this._admitting.set(cid, token)
    const pending = () => this._admitting.get(cid) === token

    // A new socket under the same cid: the client stays served while it is admitted again.
    const current = this.clients.get(cid)
    if (current) {
      current._seat = seat
      current.meta = meta
    }

    const accept = () => {
      if (!pending()) return
      this._admitting.delete(cid)
      let client = this.clients.get(cid)
      if (!client) this.clients.set(cid, client = new WseGateClient(cid, seat, meta, this))
      this._op(GATE_OP.JOINED, cid, seat)
      this.joined.emit(client, meta)
    }

    const refuse = (reason = WSE_REASON.NOT_AUTHORIZED) => {
      if (!pending()) return
      this._admitting.delete(cid)
      this._op(GATE_OP.LEFT, cid, seat, String(reason))
      this._remove(cid, String(reason))
    }

    const fail = err => {
      this.error.emit(err)
      refuse()
    }

    try {
      const admitted = this.admit({ cid, meta, accept, refuse })
      if (typeof admitted?.then === 'function') admitted.then(null, fail)
    } catch (err) {
      fail(err)
    }
  }

  _leave (cid, seat, reason) {
    if (this._admitting.get(cid)?.seat === seat) this._admitting.delete(cid)
    if (this.clients.get(cid)?._seat === seat) this._remove(cid, reason)
  }

  _remove (cid, reason) {
    const client = this.clients.get(cid)
    if (!client) return
    this.clients.delete(cid)
    this.left.emit(client, reason)
  }

  _closed () {
    this.closed = true
    this._admitting.clear()
    for (const cid of [ ...this.clients.keys() ]) this._remove(cid, WSE_REASON.GATE_CLOSED)
  }

  _message (cid, type, payload) {
    const client = this.clients.get(cid)
    if (!client) return
    try {
      this.channel.emit(type, client, payload) || this.ignored.emit(client, type, payload)
    } catch (err) {
      this.error.emit(err, client)
    }
  }

  _call (cid, conn_id, rp, payload, stamp) {
    const client = this.clients.get(cid)
    if (!client) return this._reply(cid, conn_id, stamp, RpcManager.packError(this.protocol, new WseError(WSE_ERROR.NOT_JOINED), stamp))

    const procedure = this._rpcManager.get(rp)
    if (!procedure) return this._reply(cid, conn_id, stamp, RpcManager.packError(this.protocol, new WseError(WSE_ERROR.RP_NOT_REGISTERED), stamp))

    const run = async () => {
      const result = await procedure(client, payload)
      this._reply(cid, conn_id, stamp, this.protocol.pack({ type: this.protocol.internal_types.response, payload: result, stamp }))
    }

    run().catch(err => {
      this._reply(cid, conn_id, stamp, RpcManager.packError(this.protocol, err, stamp))
      this.error.emit(new WseError(WSE_ERROR.RP_EXECUTION_FAILED, { rp, payload, stamp, cid, err }), client)
    })
  }
}
