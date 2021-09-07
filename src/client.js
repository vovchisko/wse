import { WseJSON }                                                             from './protocol.js'
import EE                                                                      from 'eventemitter3'
import Sig                                                                     from 'a-signal'
import WS                                                                      from 'isomorphic-ws'
import { make_stamp, WSE_CLIENT_ERRORS, WSE_REASON, WSE_SERVER_ERR, WseError } from './common.js'

export class WseClient {
  constructor ({ url, tO = 20, protocol = WseJSON, ...ws_options }) {
    this.protocol = new protocol()
    this.url = url
    this.ws_options = ws_options
    this.reused = 0
    this.timeout = tO

    this.channel = new EE()

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
        reject(String(event.reason))
        this.closed.emit(event.code, String(event.reason))
      }
    })
  }

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

  send (type, payload) {
    if (this._ws && this._ws.readyState === WS.OPEN) {
      this._ws.send(this.protocol.pack({ type, payload }))
    } else {
      this.error.emit(new WseError(WSE_CLIENT_ERRORS.CONNECTION_NOT_OPENED))
    }
  }

  close (reason = WSE_REASON.BY_CLIENT) {
    if (this._ws) this._ws.close(1000, String(reason))
  }

  /**
   * Send RP request to the server.
   * @param rp - name of RP
   * @param [payload] - payload
   * @param [tO] - timeout
   * @returns {Promise<*>}
   */
  async call (rp, payload, tO = this.timeout) {
    if (!rp || typeof rp !== 'string') throw new Error('rp_name not a string')
    if (this._ws && this._ws.readyState === WS.OPEN) {
      return new Promise((resolve, reject) => {
        const stamp = [ this.protocol.internal_types.call, rp, make_stamp() ].join(':')
        const handler = (payload) => {
          if (payload.result) {
            resolve(payload.result)
          } else {
            let err_code = WSE_CLIENT_ERRORS.RP_RESPONSE_ERR
            if (payload.error && payload.error.code) {
              if (payload.error.code === WSE_SERVER_ERR.RP_NOT_REGISTERED) err_code = WSE_CLIENT_ERRORS.RP_NOT_EXISTS
              if (payload.error.code === WSE_SERVER_ERR.FAILED_TO_EXECUTE_RP) err_code = WSE_CLIENT_ERRORS.RP_FAILED
            }
            return reject(new WseError(err_code))
          }
        }

        this.channel.once(stamp, handler)

        if (tO > 0) {
          setTimeout(() => {
            this.channel.off(stamp, handler)
            reject(new WseError(WSE_CLIENT_ERRORS.RP_TIMEOUT))
          }, tO * 1000)
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
