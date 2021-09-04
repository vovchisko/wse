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

  connect (payload = '', meta = {}) {
    return new Promise((resolve, reject) => {
      this.reused++
      this._ws = new WS(this.url, this.protocol.name, this.ws_options)

      this._ws.onopen = () => {
        this.send(this.protocol.hi, { payload, meta })
        this.connected.emit(payload, meta)
      }
      this._ws.onmessage = (message) => {
        let m = this.protocol.unpack(message.data)

        if (m.c === this.protocol.challenge) {
          if (typeof this.challenge_solver === 'function') {
            this.challenge_solver(m.dat, (solution) => {
              this.send(this.protocol.challenge, solution)
            })
            return
          }
        }
        if (m.c === this.protocol.welcome) {
          this.ready.emit(m.dat)
          resolve(m.dat)
        }
        this._ws.onmessage = (message) => { this._process_msg(message) }
      }
      this._ws.onerror = (e) => this.error.emit(e)
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
    let m = this.protocol.unpack(message.data)
    // fire `ignored` signal if not listeners found for this message
    return this.channel.emit(m.c, m.dat) || this.ignored.emit(m.c, m.dat)
  }

  send (c, dat) {
    if (this._ws && this._ws.readyState === WS.OPEN) {
      this._ws.send(this.protocol.pack({ c, dat }))
    } else {
      this.error.emit('error', new WseError(WSE_CLIENT_ERRORS.CONNECTION_NOT_OPENED))
    }
  }

  close (reason = WSE_REASON.BY_CLIENT) {
    if (this._ws) this._ws.close(1000, String(reason))
  }

  /**
   * Send RP request to the server.
   * @param c - name of RP
   * @param [dat] - payload
   * @param [tO] - timeout
   * @returns {Promise<*>}
   */
  async call (c, dat, tO = this.timeout) {
    if (this._ws && this._ws.readyState === WS.OPEN) {
      return new Promise((resolve, reject) => {
        const stamp = [ '~call', c, make_stamp() ].join(':')

        const handler = (dat) => {
          if (dat.result) {
            resolve(dat.result)
          } else {
            let err_code = WSE_CLIENT_ERRORS.RP_UNKNOWN_ERROR
            if (dat.error && dat.error.code) {
              if (dat.error.code === WSE_SERVER_ERR.RP_NOT_REGISTERED) err_code = WSE_CLIENT_ERRORS.RP_NOT_EXISTS
              if (dat.error.code === WSE_SERVER_ERR.FAILED_TO_EXECUTE_RP) err_code = WSE_CLIENT_ERRORS.RP_FAILED
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
        this._ws.send(this.protocol.pack({ c, dat, stamp }))
      })
    } else {
      const err = new WseError(WSE_CLIENT_ERRORS.CONNECTION_NOT_OPENED)
      this.error.emit('error', err)
      throw err
    }
  }
}
