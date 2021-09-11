import EventEmitter from 'eventemitter3'
import Sig          from 'a-signal'
import WS           from 'isomorphic-ws'

import { WseJSON }                                                             from './protocol.js'
import { make_stamp, WSE_CLIENT_ERRORS, WSE_REASON, WSE_SERVER_ERR, WseError } from './common.js'

export class WseClient {
  /**
   * WseClient instance.
   * @param options
   * @param options.url - WS/WSS endpoint.
   * @param {Number} [options.tO] - Timeout in seconds for RP calls.
   * @param {WseJSON|Object} [options.protocol] - Message processor.
   */
  constructor ({ url, tO = 20, protocol, ...ws_options }) {
    this.protocol = protocol || new WseJSON()
    this.url = url
    this.ws_options = ws_options
    this.reused = 0
    this.tO = tO

    this.channel = new EventEmitter()

    this.ignored = new Sig()
    this.connected = new Sig()
    this.ready = new Sig()
    this.error = new Sig()
    this.closed = new Sig()

    this.when = {
      ignored: this.ignored.subscriber(),
      connected: this.connected.subscriber(),
      ready: this.ready.subscriber(),
      error: this.error.subscriber(),
      closed: this.closed.subscriber(),
    }

    this.challenge_solver = null

    this._ws = null
  }

  /**
   * Connnect to WSE Server.
   * @param {*} identity - A set of data or primitive value that identifies a user.
   * @param {Object} [meta={}] - Optional data not involved into auth process, but will be passed forward.
   * @returns {Promise<Object>}
   * @throws {WSE_REASON}
   */
  connect (identity = '', meta = {}) {
    return new Promise((resolve, reject) => {
      this.reused++
      this._ws = new WS(this.url, this.protocol.name, this.ws_options)

      this._ws.onopen = () => {
        this.send(this.protocol.internal_types.hi, { identity, meta })
        this.connected.emit(identity, meta)
      }
      this._ws.onmessage = (message) => {
        let [ type, payload ] = this.protocol.unpack(message.data)
        if (type === this.protocol.internal_types.challenge) {
          if (typeof this.challenge_solver === 'function') {
            this.challenge_solver(payload, (solution) => {
              this.send(this.protocol.internal_types.challenge, solution)
            })
            return
          }
        }
        if (type === this.protocol.internal_types.welcome) {
          this.ready.emit(payload)
          resolve(payload)
        }
        this._ws.onmessage = (message) => {
          this._process_msg(message)
        }
      }
      this._ws.onerror = (err) => this.error.emit(new WseError(WSE_CLIENT_ERRORS.WS_ERROR, { raw: err }))
      this._ws.onclose = (event) => {
        this.closed.emit(event.code, String(event.reason))
        reject(String(event.reason))
      }
    })
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
      throw new WseError(WSE_CLIENT_ERRORS.INVALID_CRA_HANDLER)
    }
  }

  _process_msg (message) {
    let [ type, payload ] = this.protocol.unpack(message.data)
    return this.channel.emit(type, payload) || this.ignored.emit(type, payload)
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
      this.error.emit(new WseError(WSE_CLIENT_ERRORS.CONNECTION_NOT_OPENED))
    }
  }

  /**
   * Close connection.
   *
   * @param {WSE_REASON|String} [reason]
   */
  close (reason = WSE_REASON.BY_CLIENT) {
    if (this._ws) this._ws.close(1000, String(reason))
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

        const handler = (payload) => {
          if (payload.result) {
            if (timeout) clearTimeout(timeout)
            closedBind.off()
            resolve(payload.result)
          } else {
            let err_code = WSE_CLIENT_ERRORS.RP_RESPONSE_ERR
            if (payload.error && payload.error.code) {
              if (payload.error.code === WSE_SERVER_ERR.RP_NOT_REGISTERED) err_code = WSE_CLIENT_ERRORS.RP_NOT_EXISTS
              if (payload.error.code === WSE_SERVER_ERR.RP_EXECUTION_FAILED) err_code = WSE_CLIENT_ERRORS.RP_FAILED
            }
            return rejection(err_code, payload)
          }
        }

        const rejection = (err_code, details) => {
          if (timeout) clearTimeout(timeout)
          this.channel.off(stamp, handler)
          return reject(new WseError(err_code, details))
        }

        const closedBind = this.closed.once((code, reason) => {
          rejection(WSE_CLIENT_ERRORS.RP_DISCONNECT, { code, reason })
        })

        this.channel.once(stamp, handler)

        if (this.tO > 0) {
          timeout = setTimeout(() => {
            return rejection(WSE_CLIENT_ERRORS.RP_TIMEOUT)
          }, this.tO * 1000)
        }

        // todo: should we pass tO to the server?
        this._ws.send(this.protocol.pack({ type: rp, payload, stamp }))
      })
    } else {
      const err = new WseError(WSE_CLIENT_ERRORS.CONNECTION_NOT_OPENED)
      this.error.emit(err)
      throw err
    }
  }
}
