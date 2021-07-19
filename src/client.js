import WseJSON from './protocol.js'
import EE      from 'eventemitter3'
import Sig     from 'a-signal'
import WS      from 'isomorphic-ws'

class WseClient {
  constructor ({ url, protocol = WseJSON, ...ws_options }) {
    this.protocol = new protocol()
    this.url = url
    this.ws_options = ws_options
    this.reused = 0

    this.channel = new EE() // event emitter only for messages
    this.ignored = new Sig() // fires when no listeners fired for the message
    this.connected = new Sig() // when connected
    this.ready = new Sig() // when authorised
    this.error = new Sig()
    this.closed = new Sig()
    this.logger = null
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
          this.log('I challenged with', m)
          if (typeof this.challenge_solver === 'function') {
            this.challenge_solver(m.dat, (solution) => {
              this.log('solved', solution)
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
        reject(event.reason)
        this.closed.emit(event.code, event.reason)
      }
    })
  }

  challenge(challenge_solver) {
    if (typeof challenge_solver === 'function') {
      this.challenge_solver = challenge_solver
    } else {
      throw new Error('challenge_solver argument is not a function!')
    }
  }

  _process_msg (message) {
    let m = this.protocol.unpack(message.data)
    // fire `ignored` signal if not listeners found for this message
    return this.channel.emit(m.c, m.dat) || this.ignored.emit(m.c, m.dat)
  }

  send (c, dat) {
    if (this._ws && this._ws.readyState === WS.OPEN) {
      this._ws.send(this.protocol.pack(c, dat))
      this.log('send', c, dat)
    } else {
      this.error.emit('error', new Error('socket-not-opened'))
    }
  }

  close (code = 1000, reason = 'BY_CLIENT') {
    this.log('closed', code, reason)
    if (this._ws) this._ws.close(code, reason)
  }

  log () {
    if (this.logger) this.logger(arguments)
  };
}

export default WseClient
