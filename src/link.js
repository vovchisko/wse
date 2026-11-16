/**
 * @import { MessagePort } from 'node:worker_threads'
 * @import { WseServer, WseConnection, WseIdentity } from './server.js'
 */

import { WebSocket } from 'ws'
import Signal        from 'a-signal'

import { GATE_OP, WSE_ERROR, WSE_REASON, WseError } from './common.js'
import { RpcManager }                               from './rpc-man.js'

const IN_SIZE = { [GATE_OP.JOIN]: 4, [GATE_OP.LEAVE]: 4, [GATE_OP.MSG]: 4, [GATE_OP.CALL]: 6, [GATE_OP.ACK]: 1 }

// compress: false - with perMessageDeflate on, ws would deflate every gate frame once per socket.
const TEXT = Object.freeze({ binary: false, compress: false })
const BINARY = Object.freeze({ binary: true, compress: false })

/**
 * Main-thread end of a WseGate. Created by server.link(port).
 */
export class WseLink {
  /**
   * @param {WseServer} server
   * @param {MessagePort} port - One end of a MessageChannel; the other end goes to new WseGate({ port }).
   * @param {object} [options]
   * @param {Function} [options.guard] - (conn, type, payload, stamp) => boolean, runs before a frame is forwarded.
   *   Falsy drops a message and answers a call with FORWARD_REFUSED; a throw answers a call with the thrown error.
   * @param {number} [options.maxBuffered=0] - A socket buffering more bytes than this is dropped with
   *   SLOW_CLIENT when the gate sends to it. 0 never drops.
   */
  constructor (server, port, { guard = null, maxBuffered = 0 } = {}) {
    Object.defineProperty(this, 'server', { enumerable: false, value: server })

    /** @type {MessagePort} */
    this.port = port
    this.guard = guard
    this.maxBuffered = maxBuffered
    this.closed = false

    /** @type {Map<string, number>} cid forwarded to this gate -> the seat of that forward */
    this.cids = new Map()

    /** @type {Set<string>} forwarded cids the gate admitted; broadcasts reach only these */
    this.admitted = new Set()

    this.joined = new Signal()
    this.left = new Signal()

    /**
     * @type {{
     *   joined: function(function(string): void): void,
     *   left: function(function(string, string): void): void
     * }}
     */
    this.when = {
      joined: this.joined.extractOn(),
      left: this.left.extractOn(),
    }

    this._seat = 0

    /** @type {Map<string, [string, string, string]>} conn_id + stamp -> [cid, conn_id, stamp] of calls the gate has not answered */
    this._calls = new Map()

    this._in = []
    this._scheduled = false

    port.on('message', msg => this._receive(msg))
    port.on('close', () => this._closed())
  }

  /**
   * Stop forwarding to this gate and close the port. Every forwarded cid leaves with GATE_CLOSED on both ends.
   */
  close () {
    this.port.close()
  }

  _join (cid, meta) {
    const seat = ++this._seat
    this.cids.set(cid, seat)
    this._post(GATE_OP.JOIN, cid, seat, meta)
  }

  _leave (cid, reason) {
    const seat = this.cids.get(cid)
    this._unroute(cid)
    this._post(GATE_OP.LEAVE, cid, seat, reason)
  }

  /**
   * @param {WseConnection} conn
   * @param {string} type
   * @param {*} payload
   * @param {string} [stamp]
   */
  _forward (conn, type, payload, stamp) {
    if (this.guard) {
      let pass
      try {
        pass = this.guard(conn, type, payload, stamp)
      } catch (err) {
        if (stamp) conn.ws_conn.send(RpcManager.packError(this.server.protocol, err, stamp))
        else this.server.error.emit(err, conn)
        return
      }
      if (!pass) {
        if (stamp) conn.ws_conn.send(RpcManager.packError(this.server.protocol, new WseError(WSE_ERROR.FORWARD_REFUSED), stamp))
        return
      }
    }
    if (stamp) {
      this._calls.set(conn.conn_id + stamp, [ conn.cid, conn.conn_id, stamp ])
      this._post(GATE_OP.CALL, conn.cid, conn.conn_id, type, payload, stamp)
    } else {
      this._post(GATE_OP.MSG, conn.cid, type, payload)
    }
  }

  _post (...op) {
    this._in.push(...op)
    if (this._scheduled) return
    this._scheduled = true
    setImmediate(() => this._flush())
  }

  _flush () {
    this._scheduled = false
    if (!this._in.length) return
    const ops = this._in
    this._in = []
    try {
      this.port.postMessage({ ops })
    } catch {
      for (let i = 0; i < ops.length; i += IN_SIZE[ops[i]]) this._post_one(ops.slice(i, i + IN_SIZE[ops[i]]))
    }
  }

  _post_one (op) {
    try {
      this.port.postMessage({ ops: op })
    } catch (raw) {
      const [ kind, cid ] = op
      const client = this.server.clients.get(cid)
      if (kind === GATE_OP.CALL) {
        const [ , , conn_id, rp, , stamp ] = op
        this._calls.delete(conn_id + stamp)
        const conn = client?.conns.get(conn_id)
        const err = new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { raw, cid, type: rp })
        conn?.ws_conn.send(RpcManager.packError(this.server.protocol, err, stamp))
        this.server.error.emit(err, conn)
      } else {
        this.server.error.emit(new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { raw, cid, type: op[2] }), client?.conns.values().next().value)
      }
    }
  }

  _receive (msg) {
    if (!Array.isArray(msg?.ops)) return this.server.error.emit(new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { msg }))
    const corked = new Map()
    try {
      this._run(msg, corked)
    } finally {
      for (const ws_conn of corked.keys()) ws_conn._socket?.uncork()
      this._post(GATE_OP.ACK)
    }
  }

  _run ({ buf, ops }, corked) {
    const bytes = buf instanceof ArrayBuffer ? Buffer.from(buf) : null
    for (let i = 0; i < ops.length;) {
      if (!bytes && (ops[i] === GATE_OP.FRAME || ops[i] === GATE_OP.REPLY)) {
        return this.server.error.emit(new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { op: ops[i] }))
      }
      switch (ops[i]) {
        case GATE_OP.FRAME: {
          const cid = ops[i + 1]
          const seat = ops[i + 2]
          const frame = bytes.subarray(ops[i + 3], ops[i + 3] + ops[i + 4])
          const options = ops[i + 5] ? TEXT : BINARY
          i += 6
          if (cid === null) {
            for (const each of this.admitted) this._send(each, frame, options, corked)
          } else if (this.cids.get(cid) === seat) {
            this._send(cid, frame, options, corked)
          }
          break
        }

        case GATE_OP.REPLY: {
          const cid = ops[i + 1]
          const awaited = this._calls.delete(ops[i + 2] + ops[i + 3])
          const client = this.server.clients.get(cid)
          const conn = client?.conns.get(ops[i + 2])
          const frame = bytes.subarray(ops[i + 4], ops[i + 4] + ops[i + 5])
          const options = ops[i + 6] ? TEXT : BINARY
          i += 7
          if (!awaited) this.server.error.emit(new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { op: GATE_OP.REPLY, cid }))
          else if (conn) this._write(client, conn, frame, options, corked)
          break
        }

        case GATE_OP.JOINED: {
          const cid = ops[i + 1]
          const seat = ops[i + 2]
          i += 3
          if (this.cids.get(cid) !== seat) break
          this.admitted.add(cid)
          this.joined.emit(cid)
          break
        }

        case GATE_OP.LEFT: {
          const cid = ops[i + 1]
          const seat = ops[i + 2]
          const reason = ops[i + 3]
          i += 4
          // An older seat left: the gate dropped the client before it saw the newer JOIN, so it is not admitted now.
          if (this.cids.get(cid) !== seat) {
            this.admitted.delete(cid)
            break
          }
          this._unroute(cid)
          this.left.emit(cid, reason)
          break
        }

        default:
          this.server.error.emit(new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { op: ops[i] }))
          return
      }
    }
  }

  _send (cid, frame, options, corked) {
    const client = this.server.clients.get(cid)
    if (!client) return
    for (const conn of client.conns.values()) this._write(client, conn, frame, options, corked)
  }

  /**
   * @param {WseIdentity} client
   * @param {WseConnection} conn
   * @param {Buffer} frame
   * @param {object} options
   * @param {Map<WebSocket, number>} corked - socket -> bufferedAmount before this batch wrote to it
   */
  _write (client, conn, frame, options, corked) {
    const ws_conn = conn.ws_conn
    if (ws_conn.readyState !== WebSocket.OPEN) return
    let buffered = corked.get(ws_conn)
    if (buffered === undefined) {
      buffered = ws_conn.bufferedAmount
      if (this.maxBuffered && buffered > this.maxBuffered) {
        client._conn_drop(conn.conn_id, 1000, WSE_REASON.SLOW_CLIENT)
        ws_conn.terminate()
        return
      }
      corked.set(ws_conn, buffered)
      // ws has no public cork: one write per socket per batch instead of one per frame.
      ws_conn._socket?.cork()
    }
    // A queued frame keeps the whole batch buffer alive: a socket that is already backed up gets its own copy.
    ws_conn.send(buffered ? new Uint8Array(frame) : frame, options)
  }

  _unroute (cid) {
    this.cids.delete(cid)
    this.admitted.delete(cid)
    if (this.server._routes.get(cid)?.link === this) this.server._routes.delete(cid)
  }

  _closed () {
    this.closed = true
    for (const [ cid, conn_id, stamp ] of this._calls.values()) {
      this.server.clients.get(cid)?.conns.get(conn_id)?.ws_conn.send(RpcManager.packError(this.server.protocol, new WseError(WSE_ERROR.LINK_CLOSED), stamp))
    }
    this._calls.clear()
    for (const cid of [ ...this.cids.keys() ]) {
      this._unroute(cid)
      this.left.emit(cid, WSE_REASON.GATE_CLOSED)
    }
  }
}
