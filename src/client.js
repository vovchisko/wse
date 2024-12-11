import EventEmitter from 'eventemitter3'
import Signal       from 'a-signal'
import WS           from 'isomorphic-ws'

import { WseJSON }                                                 from './protocol.js'
import { make_stamp, WSE_ERROR, WSE_REASON, WSE_STATUS, WseError } from './common.js'

export class WseClient {
  /**
   * WseClient instance.
   * @param options
   * @param options.url - WS/WSS endpoint.
   * @param {Number} [options.tO] - Timeout in seconds for RP calls.
   * @param {Boolean} [options.re] - Reconnect In cause of 1006 code closure.
   * @param {WseJSON|Object} [options.protocol] - Message processor.
   */
  constructor ({ url, tO = 20, protocol, re = false, ...ws_options }) {
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
    this.re_on_codes = [ 1005, 1006, 1011, 1012, 1013, 1014 ]

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
     * @param {Object} payload - Server welcome payload
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

  _update_status (status) {
    this.updated.emit(status)
    this.status = status
  }

  /**
   * Connnect to WSE Server.
   * @param {*} identity - A set of data or primitive value that identifies a user.
   * @param {Object} [meta={}] - Optional data not involved into auth process, but will be passed forward.
   * @returns {Promise<Object>}
   * @throws {WSE_ERROR}
   */
  connect (identity = '', meta = {}) {
    if (this._ws) throw WSE_ERROR.CLIENT_ALREADY_CONNECTED

    this._update_status(WSE_STATUS.CONNECTING)

    let _resolve, _reject
    const _flushPromise = () => {
      // paranoic
      _resolve = null
      _reject = null
    }

    const handleOpen = () => {
      this.send(this.protocol.internal_types.hi, { identity, meta })
      this.connected.emit()
    }


    const handleMessage = (message) => {
      this._process_msg(message)
    }

    const handlePreMessage = (message) => {
      const [ type, payload ] = this.protocol.unpack(message.data)
      if (type === this.protocol.internal_types.challenge) {
        if (typeof this.challenge_solver === 'function') {
          this.challenge_solver(payload, (solution) => {
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

    const handleError = (err) => {
      this.error.emit(new WseError(WSE_ERROR.WS_CLIENT_ERROR, { raw: err }))
    }

    const handleClose = (event) => {
      this.closed.emit(event.code, String(event.reason))
      this._update_status(WSE_STATUS.OFFLINE)

      this._wipe_ws()
      if (_reject) {
        _reject(String(event.reason))
        _flushPromise()
      }
      if (this.re && this.re_on_codes.includes(event.code)) {
        const in_s = this.re_t0 + (Math.random() * 1000)
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
      _resolve = resolve
      _reject = reject
      tryConnect()
    })
  }

  _wipe_ws () {
    this._ws.onopen = null
    this._ws.onmessage = null
    this._ws.onerror = null
    this._ws.onclose = null
    this._ws = null
  }

  /**
   * Called when server asks for CRA auth.
   *
   * @callback WseCraChallengerCb
   * @param {*} quest - Any set of data
   * @param {WseCraResolverFunction} solve - Function to call when answer is ready.
   */

  /**
   * Call to send CRA answer.
   *
   * @function WseCraResolverFunction
   * @param {*} answer - Asnwer on CRA quest
   */

  /**
   * Set function responsible or CRA challenge auth.
   * Solver will accept CRA quest and resolver callback.
   *
   * @param {WseCraChallengerCb} challenge_solver
   */
  challenge (challenge_solver) {
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
  _process_msg (message) {
    let [ type, payload, stamp ] = this.protocol.unpack(message.data)
    return this.channel.emit(type, payload, stamp) || this.ignored.emit(type, payload, stamp)
  }

  /**
   * Send message to the server.
   *
   * @param {String} type
   * @param {*} [payload]
   */
  send (type, payload) {
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
   * @param {WSE_REASON|String} [reason]
   */
  close (reason = WSE_REASON.BY_CLIENT) {
    if (this._ws) this._ws.close(1000, reason)
  }

  /**
   * Send RP request to the server.
   * @param rp - name of RP
   * @param [payload] - payload
   * @returns {Promise<*>}
   */
  async call (rp, payload) {
    if (!rp || typeof rp !== 'string') throw new Error('rp_name not a string')
    if (this._ws && this._ws.readyState === WS.OPEN) {
      return new Promise((resolve, reject) => {
        const stamp = [ this.protocol.internal_types.call, rp, make_stamp() ].join(':')

        let timeout

        const handler = (result, re_stamp) => {
          if (re_stamp.success) {
            if (timeout) clearTimeout(timeout)
            closedBind.off()
            resolve(result)
          } else {
            rejection(re_stamp)
          }
        }

        const rejection = ({ code, details }) => {
          if (timeout) clearTimeout(timeout)
          this.channel.off(stamp, handler)
          return reject(new WseError(code, details))
        }

        const closedBind = this.closed.once((code, reason) => {
          rejection({ code: WSE_ERROR.RP_DISCONNECT, disconnected: { code, reason } })
        })

        this.channel.once(stamp, handler)

        if (this.tO > 0) {
          timeout = setTimeout(() => {
            return rejection({ code: WSE_ERROR.RP_TIMEOUT })
          }, this.tO * 1000)
        }

        // todo: should we pass tO to the server?
        this._ws.send(this.protocol.pack({ type: rp, payload, stamp }))
      })
    } else {
      const err = new WseError(WSE_ERROR.CONNECTION_NOT_READY)
      this.error.emit(err)
      throw err
    }
  }
}
