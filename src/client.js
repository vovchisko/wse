/**
 * @import { WseError, WSE_ERROR, WSE_REASON, WSE_STATUS } from './common.js'
 * @import { WseJSON } from './protocol.js'
 */

import { EventEmitter } from 'tseep'
import Signal from 'a-signal'

/** @type {typeof WebSocket} */
import WS from 'isomorphic-ws'

import { WseJSON } from './protocol.js'
import { WSE_ERROR, WSE_REASON, WSE_STATUS, WseError } from './common.js'
import { RpcManager } from './rpc-man.js'

export class WseClient {
  /**
   * WseClient instance.
   * @param options
   * @param options.url - WS/WSS endpoint.
   * @param {number} [options.tO] - Timeout in seconds for RP calls.
   * @param {Boolean} [options.re] - Reconnect In cause of any of WseClient.re_on_codes[] code closure.
   * @param {WseJSON|object} [options.protocol] - Message processor.
   */
  constructor({ url, tO = 20, protocol, re = false, ...ws_options }) {
    this.protocol = protocol || new WseJSON()
    this.url = url
    this.ws_options = ws_options
    this.reused = 0
    this.tO = tO

    this.channel = new EventEmitter()

    this.ignored = new Signal()
    this.connected = new Signal()
    this.ready = new Signal({ late: true, memorable: true })
    this.updated = new Signal({ memorable: true, late: true })
    this.error = new Signal()
    this.closed = new Signal()
    this.re = re
    this.re_t0 = 1000
    this.re_on_codes = [1005, 1006, 1011, 1012, 1013, 1014, 4000] // 4000 for jump

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
  }

  _update_status(status) {
    this.updated.emit(status)
    this.status = status
  }

  /**
   * Connnect to WSE Server.
   * @param {*} identity - A set of data or primitive value that identifies a user.
   * @param {object} [meta={}] - Optional data not involved into auth process, but will be passed forward.
   * @returns {Promise<any>}
   * @throws {WseError}
   */
  connect(identity = '', meta = {}) {
    if (this._ws) throw WSE_ERROR.CLIENT_ALREADY_CONNECTED

    this._update_status(WSE_STATUS.CONNECTING)

    let _resolve, _reject
    const _flushPromise = () => {
      _resolve = null
      _reject = null
    }

    const handleOpen = () => {
      this.send(this.protocol.internal_types.hi, { identity, meta })
      this.connected.emit()
    }

    const handleMessage = message => {
      this._process_msg(message)
    }

    const handlePreMessage = message => {
      const [type, payload] = this.protocol.unpack(message.data)
      if (type === this.protocol.internal_types.challenge) {
        if (typeof this.challenge_solver === 'function') {
          this.challenge_solver(payload, solution => {
            this.send(this.protocol.internal_types.challenge, solution)
          })
          return
        }
      }
      if (type === this.protocol.internal_types.welcome) {
        if (_resolve) {
          _resolve(payload)
          _flushPromise()
        }
        this._ws.onmessage = handleMessage
        this._update_status(WSE_STATUS.READY)
        this.ready.emit(payload)
      }
    }

    const handleError = err => {
      this.error.emit(new WseError(WSE_ERROR.WS_CLIENT_ERROR, { raw: err }))
      // When reconnect is enabled, don't let connection errors bubble up as promise rejections
      if (!this.re && _reject) {
        _reject(new WseError(WSE_ERROR.WS_CLIENT_ERROR, { raw: err }))
        _flushPromise()
      }
    }

    const handleClose = event => {
      this.closed.emit(event.code, String(event.reason))
      this._update_status(WSE_STATUS.OFFLINE)

      this._wipe_ws()

      if (!this.re && _reject) {
        _reject(String(event.reason))
        _flushPromise()
      }

      if ((this.re && this.re_on_codes.includes(event.code)) || event.code === 4000) {
        const in_s = event.code === 4000 ? 0 : this.re_t0 + Math.random() * 1000
        this._update_status(WSE_STATUS.RE_CONNECTING)
        setTimeout(tryConnect, in_s)
      }
    }

    const tryConnect = () => {
      this.reused++
      this._ws = new WS(this.url, this.protocol.name, this.ws_options)
      this._ws.onopen = handleOpen
      this._ws.onmessage = handlePreMessage
      this._ws.onerror = handleError
      this._ws.onclose = handleClose
    }

    return new Promise((resolve, reject) => {
      if (this.re) {
        _resolve = resolve
        _reject = null // If reconnect is enabled, never reject the promise
      } else {
        _resolve = resolve
        _reject = reject
      }
      tryConnect()
    })
  }

  _wipe_ws() {
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
  challenge(challenge_solver) {
    if (typeof challenge_solver === 'function') {
      this.challenge_solver = challenge_solver
    } else {
      throw new WseError(WSE_ERROR.INVALID_CRA_HANDLER)
    }
  }

  /**
   * Process message.
   *
   * @param message
   * @return {boolean|void}
   * @private
   */
  _process_msg(message) {
    let [type, payload, stamp] = this.protocol.unpack(message.data)

    // Handle RPC responses - direct callback execution
    if (type === this.protocol.internal_types.response) {
      if (this._rpcManager.handleResponse(stamp, payload, true)) return
    }
    if (type === this.protocol.internal_types.response_error) {
      if (this._rpcManager.handleResponse(stamp, payload, false)) return
    }

    // If stamp exists, it's an incoming RPC call from server
    if (stamp) {
      if (this._rpcManager.has(type)) {
        return this._handle_incoming_call(type, payload, stamp)
      } else {
        // RPC not registered - send error response
        this._ws.send(
          this.protocol.pack({
            type: this.protocol.internal_types.response_error,
            payload: { code: WSE_ERROR.RP_NOT_REGISTERED },
            stamp: stamp,
          })
        )
        return
      }
    }

    // Only user messages go through channel
    return this.channel.emit(type, payload, stamp) || this.ignored.emit(type, payload, stamp)
  }

  _handle_incoming_call(type, payload, stamp) {
    const procedure = this._rpcManager.get(type)

    const rp_wrap = async () => {
      const result = await procedure(payload)
      this._ws.send(
        this.protocol.pack({
          type: this.protocol.internal_types.response,
          payload: result,
          stamp: stamp,
        })
      )
    }

    rp_wrap().catch(err => {
      const errorPayload = RpcManager.normalizeError(err)

      this._ws.send(
        this.protocol.pack({
          type: this.protocol.internal_types.response_error,
          payload: errorPayload,
          stamp: stamp,
        })
      )

      this.error.emit(
        new WseError(WSE_ERROR.RP_EXECUTION_FAILED, {
          type,
          payload,
          stamp,
          err,
        })
      )
    })
  }

  /**
   * Send message to the server.
   *
   * @param {string} type
   * @param {*} [payload]
   */
  send(type, payload) {
    if (this._ws && this._ws.readyState === WS.OPEN) {
      this._ws.send(this.protocol.pack({ type, payload }))
    } else {
      const err = new WseError(WSE_ERROR.CONNECTION_NOT_READY)
      this.error.emit(err)
      throw err
    }
  }

  /**
   * Close connection.
   *
   * @param {WSE_REASON|string} [reason]
   */
  close(reason = WSE_REASON.BY_CLIENT) {
    if (this._ws) this._ws.close(1000, reason)
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
  jump(newUrl, identity = '', meta = {}) {
    if (this._ws) {
      this.url = newUrl
      this.ready.forget()
      this._ws.close(4000, 'jump')
      return this.ready.wait()
    } else {
      this.url = newUrl
      return this.connect(identity, meta)
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
  async call(rp, payload) {
    if (this._ws && this._ws.readyState === WS.OPEN) {
      return this._rpcManager.call(this.protocol, rp, payload, this.tO, data => this._ws.send(data), this.closed)
    } else {
      const err = new WseError(WSE_ERROR.CONNECTION_NOT_READY)
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
  register(rp, handler) {
    this._rpcManager.register(rp, handler)
  }

  /**
   * Unregister existing RP.
   * @param {string} rp - RP name
   */
  unregister(rp) {
    this._rpcManager.unregister(rp)
  }
}
