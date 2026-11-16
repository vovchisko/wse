/**
 * @import { WseError, WSE_ERROR, WSE_REASON, WSE_STATUS } from './common.js'
 * @import { WseJSON } from './protocol.js'
 */

import Signal from 'a-signal'

/** @type {typeof WebSocket} */
import WS from 'isomorphic-ws'

import { EventEmitter } from './emitter.js'

import { WseJSON }                                     from './protocol.js'
import { check_tO, tO_armed, WSE_ERROR, WSE_REASON, WSE_STATUS, WseError } from './common.js'
import { RpcManager }                                  from './rpc-man.js'
import { frames_of, write_frames }                     from './frames.js'

const decoder = new TextDecoder()

export class WseClient {
  /**
   * WseClient instance.
   * @param options
   * @param options.url - WS/WSS endpoint.
   * @param {number} [options.tO=20000] - RP call timeout in milliseconds. 0 disables it.
   * @param {Boolean} [options.re] - Reconnect In cause of any of WseClient.re_on_codes[] code closure.
   * @param {WseJSON|object} [options.protocol] - Message processor.
   */
  constructor ({ url, tO = 20000, protocol, re = false, ...ws_options }) {
    this.protocol = protocol || new WseJSON()
    this.url = url
    this.ws_options = ws_options
    this.reused = 0
    this.tO = check_tO(tO)

    this.channel = new EventEmitter()

    this.ignored = new Signal()
    this.connected = new Signal()
    this.ready = new Signal({ late: true, memorable: true })
    this.updated = new Signal({ memorable: true, late: true })
    this.error = new Signal()
    this.closed = new Signal()
    this.re = re

    /** @type {number} Base reconnect delay in milliseconds; up to 1000ms of jitter is added on top */
    this.re_t0 = 1000

    /** @type {number[]} WebSocket close codes that trigger a reconnect when `re` is on; 4000 is jump() */
    this.re_on_codes = [ 1005, 1006, 1011, 1012, 1013, 1014, 4000 ]

    this._rpcManager = new RpcManager()

    /**
     * Callback for handling unhandled messages.
     * @callback IgnoredCallback
     * @param {string} type - Message type identifier
     * @param {*} payload - Message payload data
     * @param {string} stamp - Message stamp if present
     */

    /**
     * Callback for handling ready state.
     * @callback ReadyCallback
     * @param {object} payload - Server welcome payload
     */

    /**
     * Callback for handling errors.
     * @callback ErrorCallback
     * @param {WseError} error - Error instance with details
     */

    /**
     * Callback for handling connection closure.
     * @callback ClosedCallback
     * @param {number} code - WebSocket close code
     * @param {string} reason - Close reason description
     */

    /**
     * Callback for handling status updates.
     * @callback UpdatedCallback
     * @param {WSE_STATUS} status - New client status
     */

    /**
     * Collection of signal binding functions extracted from their respective signals.
     * Each property is a function similar to EventEmitter's "on" that binds handlers to specific events.
     * @type {{
     *   ignored: function(IgnoredCallback): void,
     *   connected: function(): void,
     *   ready: function(ReadyCallback): void,
     *   error: function(ErrorCallback): void,
     *   closed: function(ClosedCallback): void,
     *   updated: function(UpdatedCallback): void
     * }}
     */
    this.when = {
      ignored: this.ignored.extractOn(),
      connected: this.connected.extractOn(),
      ready: this.ready.extractOn(),
      error: this.error.extractOn(),
      closed: this.closed.extractOn(),
      updated: this.updated.extractOn(),
    }

    this.status = WSE_STATUS.IDLE
    this.challenge_solver = null
    this._ws = null
    this._re_timer = null
    this._abort_connect = null
    this._wait = null
    this._closing = false
    this._corks = 0

    /** @type {Array<[*, boolean]>} frames queued while corked */
    this._queue = []

    // Last identity/meta used to authenticate. Kept on the instance so a reconnect
    // (re:true or jump's 4000 close) re-sends the credentials in effect now, not the
    // ones captured by the original connect() closure.
    this._identity = ''
    this._meta = {}
  }

  _update_status (status) {
    this.status = status
    this.updated.emit(status)
  }

  /**
   * Connnect to WSE Server.
   * @param {*} identity - A set of data or primitive value that identifies a user.
   * @param {object} [meta={}] - Optional data not involved into auth process, but will be passed forward.
   * @returns {Promise<any>}
   * @throws {WseError}
   */
  connect (identity = '', meta = {}) {
    if (this._ws || this._re_timer) {
      const err = new WseError(WSE_ERROR.CLIENT_ALREADY_CONNECTED)
      Error.captureStackTrace?.(err, this.connect)
      throw err
    }

    this._identity = identity
    this._meta = meta
    this._closing = false

    this._update_status(WSE_STATUS.CONNECTING)

    let waiters = []
    const resolveAll = value => {
      const settle = waiters
      waiters = []
      for (const [ resolve ] of settle) resolve(value)
    }
    const rejectAll = err => {
      const settle = waiters
      waiters = []
      for (const [ , reject ] of settle) reject(err)
    }
    this._wait = () => new Promise((resolve, reject) => waiters.push([ resolve, reject ]))

    let welcome_timer = null

    this._abort_connect = reason => rejectAll(new WseError(WSE_ERROR.CONNECTION_CLOSED, { code: 1000, reason }))

    const handleOpen = () => {
      this._send_frame(this.protocol.internal_types.hi, { identity: this._identity, meta: this._meta })
      if (tO_armed(this.tO)) welcome_timer = setTimeout(() => this._ws?.close(1000, WSE_REASON.AUTH_TIMEOUT), this.tO)
      this.connected.emit()
    }

    const handleMessage = message => {
      this._process_msg(message)
    }

    const handlePreMessage = message => {
      const frames = this._unpack(message.data)
      if (!frames) return
      for (const frame of frames) {
        if (this.status === WSE_STATUS.READY) this._dispatch(frame)
        else handlePreFrame(frame)
        if (!this._ws) return
      }
    }

    const handlePreFrame = ([ type, payload ]) => {
      if (type === this.protocol.internal_types.challenge) {
        if (typeof this.challenge_solver !== 'function') {
          const err = new WseError(WSE_ERROR.INVALID_CRA_HANDLER)
          this.error.emit(err)
          rejectAll(err)
          this._ws.close(1000, WSE_REASON.NOT_AUTHORIZED)
          return
        }
        this.challenge_solver(payload, solution => this._send_frame(this.protocol.internal_types.challenge, solution))
        return
      }
      if (type === this.protocol.internal_types.welcome) {
        clearTimeout(welcome_timer)
        this._ws.onmessage = handleMessage
        this._update_status(WSE_STATUS.READY)
        resolveAll(payload)
        this.ready.emit(payload)
      }
    }

    const handleError = err => {
      this.error.emit(new WseError(WSE_ERROR.WS_CLIENT_ERROR, { raw: err }))
      // When reconnect is enabled, don't let connection errors bubble up as promise rejections
      if (!this.re) rejectAll(new WseError(WSE_ERROR.WS_CLIENT_ERROR, { raw: err }))
    }

    const handleClose = event => {
      clearTimeout(welcome_timer)
      this._wipe_ws()
      this._update_status(WSE_STATUS.OFFLINE)
      this.closed.emit(event.code, String(event.reason))

      const reconnected = this._ws !== null
      const will_retry = !reconnected && !this._closing && ((this.re && this.re_on_codes.includes(event.code)) || event.code === 4000)

      // Settle whatever connect() is still awaiting. A close that won't be retried
      // is terminal — with re:true a refusal closes with 1000, which is not in
      // re_on_codes, so the promise used to stay pending forever.
      if (!will_retry) {
        const reason = String(event.reason)
        const code = reason === WSE_REASON.NOT_AUTHORIZED ? WSE_ERROR.NOT_AUTHORIZED : WSE_ERROR.CONNECTION_CLOSED
        rejectAll(new WseError(code, { code: event.code, reason }))
      }

      if (will_retry) {
        const delay = event.code === 4000 ? 0 : this.re_t0 + Math.random() * 1000
        this._update_status(WSE_STATUS.RE_CONNECTING)
        this._re_timer = setTimeout(() => {
          this._re_timer = null
          tryConnect()
        }, delay)
      }
    }

    const tryConnect = () => {
      this.reused++
      try {
        this._ws = new WS(this.url, this.protocol.name, this.ws_options)
      } catch (raw) {
        const err = new WseError(WSE_ERROR.WS_CLIENT_ERROR, { raw })
        this._update_status(WSE_STATUS.OFFLINE)
        this.error.emit(err)
        rejectAll(err)
        return
      }
      this._ws.binaryType = 'arraybuffer'
      this._ws.onopen = handleOpen
      this._ws.onmessage = handlePreMessage
      this._ws.onerror = handleError
      this._ws.onclose = handleClose
    }

    const connected = this._wait()
    tryConnect()
    return connected
  }

  _wipe_ws () {
    this._ws.onopen = null
    this._ws.onmessage = null
    this._ws.onerror = null
    this._ws.onclose = null
    this._ws = null
  }

  /**
   * Challenge handler function for Challenge-Response Authentication.
   * @callback ChallengeHandler
   * @param {*} quest - Challenge data from server (can be any type)
   * @param {function(*): void} solve - Function to call with the challenge solution
   * @example
   * // Simple math challenge
   * client.challenge((quest, solve) => {
   *   solve(quest.a + quest.b)
   * })
   *
   * // HMAC-based challenge
   * client.challenge((quest, solve) => {
   *   const response = crypto.createHmac('sha256', SECRET)
   *     .update(quest.timestamp + quest.nonce)
   *     .digest('hex')
   *   solve(response)
   * })
   */

  /**
   * Set challenge solver for Challenge-Response Authentication (CRA).
   * The solver function will be called when the server sends a challenge.
   * @param {ChallengeHandler} challenge_solver - Function to handle authentication challenges
   * @throws {WseError} Throws WSE_ERROR.INVALID_CRA_HANDLER if solver is not a function
   */
  challenge (challenge_solver) {
    if (typeof challenge_solver === 'function') {
      this.challenge_solver = challenge_solver
    } else {
      const err = new WseError(WSE_ERROR.INVALID_CRA_HANDLER)
      Error.captureStackTrace?.(err, this.challenge)
      throw err
    }
  }

  /**
   * Process message.
   *
   * @param message
   * @return {boolean|void}
   * @private
   */
  _process_msg (message) {
    const frames = this._unpack(message.data)
    if (!frames) return
    for (const frame of frames) {
      if (!this._ws) return
      this._dispatch(frame)
    }
  }

  /**
   * @param {Array} frame - [type, payload, stamp]
   * @private
   */
  _dispatch ([ type, payload, stamp ]) {
    // Responses never fall through. An unmatched stamp (a reply that arrived after
    // its call timed out) must be dropped: answering it with response_error makes
    // the peer answer back, and the two sides trade frames forever.
    if (type === this.protocol.internal_types.response || type === this.protocol.internal_types.response_error) {
      this._rpcManager.handleResponse(stamp, payload, type === this.protocol.internal_types.response)
      return
    }

    // If stamp exists, it's an incoming RPC call from server
    if (stamp) {
      if (this._rpcManager.has(type)) {
        return this._handle_incoming_call(type, payload, stamp)
      } else {
        this._send_packed(RpcManager.packError(this.protocol, new WseError(WSE_ERROR.RP_NOT_REGISTERED), stamp))
        return
      }
    }

    // Only user messages go through channel
    return this.channel.emit(type, payload, stamp) || this.ignored.emit(type, payload, stamp)
  }

  _handle_incoming_call (type, payload, stamp) {
    const procedure = this._rpcManager.get(type)

    // The socket can die while an async handler is still running. There is nowhere
    // to reply to then, and reaching for a wiped this._ws would throw inside the
    // catch below, escaping as an unhandled rejection.
    const reply = frame => {
      if (!this._ws || this._ws.readyState !== WS.OPEN) return
      this._send_packed(frame)
    }

    const rp_wrap = async () => {
      const result = await procedure(payload)
      reply(this.protocol.pack({ type: this.protocol.internal_types.response, payload: result, stamp }))
    }

    rp_wrap().catch(err => {
      reply(RpcManager.packError(this.protocol, err, stamp))

      this.error.emit(
          new WseError(WSE_ERROR.RP_EXECUTION_FAILED, {
            rp: type,
            payload,
            stamp,
            err,
          }),
      )
    })
  }

  /**
   * Send message to the server.
   *
   * @param {string} type
   * @param {*} [payload]
   */
  send (type, payload) {
    if (this._is_ready()) {
      this._send_packed(this.protocol.pack({ type, payload }))
    } else {
      const err = new WseError(WSE_ERROR.CONNECTION_NOT_READY)
      Error.captureStackTrace?.(err, this.send)
      this.error.emit(err)
      throw err
    }
  }

  /**
   * Close connection.
   *
   * @param {WSE_REASON|string} [reason]
   */
  close (reason = WSE_REASON.BY_CLIENT) {
    this._closing = true
    this._flush()
    if (this._ws) return this._ws.close(1000, reason)
    if (!this._re_timer) return
    clearTimeout(this._re_timer)
    this._re_timer = null
    this._update_status(WSE_STATUS.OFFLINE)
    this._abort_connect?.(reason)
  }

  _is_ready () {
    return this.status === WSE_STATUS.READY && this._ws?.readyState === WS.OPEN
  }

  _send_frame (type, payload) {
    if (this._ws?.readyState === WS.OPEN) this._ws.send(this.protocol.pack({ type, payload }))
  }

  /**
   * Queue every frame sent to the server until uncork(), then send them in order, text (or binary) frames in a row
   * joined into one frame where protocol.join() allows. Calls nest; the outermost uncork() sends.
   */
  cork () {
    this._corks++
  }

  /**
   * Undo one cork(); the last one sends everything queued.
   */
  uncork () {
    if (!this._corks || --this._corks) return
    this._flush()
  }

  _send_packed (packed) {
    if (this._corks) return this._queue.push([ packed, typeof packed === 'string' ])
    this._ws.send(packed)
  }

  _flush () {
    const queue = this._queue
    if (!queue.length) return
    this._queue = []
    if (this._ws?.readyState !== WS.OPEN) return
    // A browser WebSocket sends bytes as a binary frame; a joined text frame goes back to a string.
    write_frames(queue, this.protocol, (frame, text) => this._ws.send(text && typeof frame !== 'string' ? decoder.decode(frame) : frame))
  }

  /**
   * Unpack a frame into the list of frames it carries; a frame the protocol cannot read closes the connection
   * with PROTOCOL_ERR.
   * @returns {Array<Array>|null}
   * @private
   */
  _unpack (data) {
    try {
      const unpacked = this.protocol.unpack(data)
      if (!Array.isArray(unpacked)) throw new TypeError('unpack() must return [ type, payload, stamp ]')
      const frames = frames_of(unpacked)
      for (const frame of frames) if (!Array.isArray(frame)) throw new TypeError('a joined frame must unpack to [ type, payload, stamp ] tuples')
      return frames
    } catch (err) {
      this.error.emit(new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { raw: err }))
      this._ws?.close(1000, WSE_REASON.PROTOCOL_ERR)
      return null
    }
  }

  /**
   * Jump to a different server endpoint. If currently connected, disconnects first.
   * Useful for switching between game levels, server instances, or regions.
   *
   * @param {string} newUrl - New WebSocket endpoint to connect to
   * @param {*} [identity=''] - Identity data for authentication (same format as connect())
   * @param {object} [meta={}] - Optional metadata for the new connection
   * @returns {Promise<any>} Promise that resolves with server welcome data
   * @throws {WseError} Same errors as connect() method
   *
   * @example
   * // Jump to new game level
   * await client.jump('ws://level2.game.com:4200')
   *
   * // Jump with new authentication
   * await client.jump('ws://boss.game.com:4200', { token: 'boss-level-token' })
   */
  jump (newUrl, identity, meta) {
    // Only override when supplied: a bare jump(url) keeps the current credentials,
    // while jump(url, identity) re-authenticates with the new ones on the far end.
    if (identity !== undefined) this._identity = identity
    if (meta !== undefined) this._meta = meta

    if (this._ws || this._re_timer) {
      this.url = newUrl
      this.ready.forget()
      this._closing = false
      const jumped = this._wait()
      this._ws?.close(4000, 'jump')
      return jumped
    } else {
      this.url = newUrl
      return this.connect(this._identity, this._meta)
    }
  }

  /**
   * Send Remote Procedure Call request to the server.
   * @param {string} rp - Name of the remote procedure to call
   * @param {*} [payload] - Data to send with the RPC call
   * @returns {Promise<*>} Promise that resolves with the RPC result
   * @throws {WseError} Throws WseError with specific error codes:
   *   - WSE_ERROR.RP_TIMEOUT: Call timed out
   *   - WSE_ERROR.RP_NOT_REGISTERED: RPC not found on server
   *   - WSE_ERROR.RP_EXECUTION_FAILED: Server-side error
   *   - WSE_ERROR.RP_DISCONNECT: Connection lost during call
   * @example
   * // Basic RPC call
   * const result = await client.call('add', { a: 5, b: 3 })
   * console.log(result) // 8
   *
   * // Handle RPC errors
   * try {
   *   const data = await client.call('getUserData', { userId: 123 })
   * } catch (error) {
   *   if (error.code === WSE_ERROR.RP_TIMEOUT) {
   *     console.log('Request timed out')
   *   }
   * }
   */
  async call (rp, payload) {
    if (this._is_ready()) {
      return this._rpcManager.call(this.protocol, rp, payload, this.tO, data => this._send_packed(data), this.closed)
    } else {
      const err = new WseError(WSE_ERROR.CONNECTION_NOT_READY, { rp })
      Error.captureStackTrace?.(err, this.call)
      this.error.emit(err)
      throw err
    }
  }

  /**
   * Register remote procedure that can be called by the server.
   * @param {string} rp - Remote procedure name
   * @param {Function} handler - Function to handle RPC calls from server
   * @example
   * // Basic RPC
   * client.register('ping', (payload) => {
   *   return 'pong'
   * })
   *
   * // Async RPC
   * client.register('processData', async (payload) => {
   *   const result = await processData(payload)
   *   return result
   * })
   */
  register (rp, handler) {
    this._rpcManager.register(rp, handler)
  }

  /**
   * Unregister existing RP.
   * @param {string} rp - RP name
   */
  unregister (rp) {
    this._rpcManager.unregister(rp)
  }
}
