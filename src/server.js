'use strict'

const WebSocket = require('ws')
const EE = require('eventemitter3')
const WseDefaultProtocol = require('./protocol')
const WSE_REASON = require('./reason')

const CLIENT_NOOB = 0
const CLIENT_VALIDATING = 1
const CLIENT_VALID = 2

class WseServer extends EE {
  constructor (ws_params = {}, on_auth, wse_protocol = null) {

    super()

    this.clients = {}

    //default properties
    this.name = null
    this.emit_message = true
    this.emit_message_prefix = 'm:'
    this.emit_messages_ignored = false

    this.logging = false

    this.ws_params = ws_params

    this.protocol = wse_protocol || new WseDefaultProtocol()
    this.on_auth = on_auth || ((id, data) => {
      throw new Error('params.on_auth function not specified!')
    })

    this.log('configured')
  }

  drop_client (id, reason = WSE_REASON.NO_REASON) {
    if (this.clients[id]) this.clients[id].drop(reason)
  }

  log () {
    if (!this.logging) return
    console.log(this.name ? this.name + ':' : '', ...arguments)
  };

  init () {

    this.ws_server = new WebSocket.Server(this.ws_params)

    let self = this

    this.ws_server.on('connection', function (conn, req) {

      if (conn.protocol !== self.protocol.name) {
        return conn.close(1000, WSE_REASON.PROTOCOL_ERR)
      }

      conn.id = null
      conn.valid_stat = CLIENT_NOOB


      // RESOLVING IPV4 REMOTE ADDR
      conn.remote_addr = req.headers['x-forwarded-for'] || req.connection.remoteAddress
      if (conn.remote_addr.substr(0, 7) === '::ffff:') conn.remote_addr = conn.remote_addr.substr(7)

      // CAN BE OVERRIDEN BY PARAMS
      conn.pub_host = conn.remote_addr
      conn.on('message', function (message) {
        let msg = self.protocol.unpack(message)


        if (!msg) return conn.close(1000, WSE_REASON.PROTOCOL_ERR)

        if (conn.valid_stat === CLIENT_VALIDATING) return

        if (conn.valid_stat === CLIENT_VALID) {

          if (self.emit_message)
            if (!self.emit(self.emit_message_prefix + msg.c, self.clients[conn.id], msg.dat) && self.emit_messages_ignored)
              self.emit(self.emit_message_prefix + '_ignored', self.clients[conn.id], msg.c, msg.dat)

          self.emit('message', self.clients[conn.id], msg.c, msg.dat)

          return
        }

        if (conn.valid_stat === CLIENT_NOOB) {
          conn.valid_stat = CLIENT_VALIDATING


          self.on_auth(msg.dat.payload, function (id, data) {

            if (id) {
              conn.id = id
              conn.valid_stat = CLIENT_VALID

              if (self.clients[id]) {
                //what is close is not sync
                !self.clients[id].drop(WSE_REASON.OTHER_CLIENT_CONECTED)
                conn.close(1000, WSE_REASON.OTHER_CLIENT_CONECTED)
                return
              }

              // from connection params
              if (msg.dat.params && msg.dat.params.pub_host)
                conn.pub_host = msg.dat.params.pub_host

              self.clients[id] = new WseClientConnection(self, conn)
              self.clients[id].send(self.protocol.welcome, data)

              self.emit('join', self.clients[id], msg.dat.payload)
              self.emit('connection', self.clients[id], msg.dat.payload)

              self.log(id, 'join', msg.dat.payload)

            } else {
              conn.close(1000, WSE_REASON.NOT_AUTHORIZED)
            }
          })
        }
      })

      conn.on('close', (code, reason) => {
        // error was here, sometimes close fires when id is not empty, but self.clients[id] not exists.
        if (conn.id && conn.valid_stat === CLIENT_VALID && self.clients[conn.id]) {
          self.emit('close', self.clients[conn.id], code, reason)
          self.emit('leave', self.clients[conn.id], code, reason)
          self.log(conn.id, 'leave', code, reason)
          delete self.clients[conn.id]
        }
      })
      conn.onerror = (e) => {
        self.log(e)
        self.emit('error', conn, e.code)
      }

    })

    this.log(`init(); cpu:single;`)
    return self
  }

  /**
   * Send this message to everyone online
   * @param c
   * @param dat
   */
  broadcast (c, dat) {
    for (let id in this.clients) {
      this.clients[id].send(c, dat)
    }
  }

  /**
   * Similar to forEach
   * @param cb
   */
  each (cb) {
    for (let id in this.clients) {
      cb(this.clients[id])
    }
  }
}

class WseClientConnection {
  /**
   * @param {WseServer} parent_wsm - wsm instance
   * @param {WebSocket} conn - ws connection
   */
  constructor (parent_wsm, conn) {
    this.id = conn.id
    this.conn = conn
    this.wsm = parent_wsm
    this.meta = {}
  }

  /**
   * Send a message to the client
   * @param {string} c - message id
   * @param {string|number|object} dat - payload
   * @returns {boolean} - true if connection was opened, false - if not.
   */
  send (c, dat) {
    if (this.conn && this.conn.readyState === WebSocket.OPEN) {
      this.conn.send(this.wsm.protocol.pack(c, dat))
      return true
    } else {
      return false
    }
  }

  drop (reason = WSE_REASON.NO_REASON) {
    this.wsm.log(this.id, 'drop connetion. reason:', reason)
    this.conn.close(1000, reason)
  }
}

module.exports = WseServer
