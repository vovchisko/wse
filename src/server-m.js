import EE        from 'eventemitter3'
import WebSocket from 'ws'
import Sig       from 'a-signal'

import WseJSON    from './protocol.js'
import WSE_REASON from './reason.js'

const CLIENT_STRANGER = 0
const CLIENT_VALIDATING = 1
const CLIENT_VALID = 2

function conn_id_gen () {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

class WseMServer {
  /**
   * Manage incoming connections.
   *
   * @callback WseMServer.incoming_handler
   * @param {String} params.payload JWT or any other type of secret
   * @param {Object} params.meta optional data from the client
   * @param {Function} params.resolve call it with user ID or any other identifier. falsy argument will reject connection.
   */

  /**
   * WseMServer class.
   *
   * @param {Object} options see https://github.com/websockets/ws/#readme.
   * @param {Function|WseMServer.incoming_handler} options.incoming Will be called for each new connection.
   * @param {Object} [options.protocol=WseJSON] Overrides `wse_protocol` implementation. Use with caution.
   * @param {WebSocket.Server} [options.ws_server=WebSocket.Server] Tt is possible to override `ws` implementation. Use with caution.
   */
  constructor ({
    protocol = WseJSON,
    incoming,
    ws_server = WebSocket.Server,
    cpu_limit = 2,
    ...ws_params
  }) {
    if (!incoming) throw new Error('incoming handler is missing!')

    this.clients = new Map(/* { ID: WseClient } */)
    this.protocol = new protocol()
    this.ws_params = ws_params
    this.ws_server = ws_server
    this.incoming_handler = incoming
    this.cpu_limit = cpu_limit

    this.joined = new Sig()
    this.left = new Sig()
    this.connected = new Sig()
    this.disconnected = new Sig()
    this.error = new Sig()

    this.channel = new EE()

    this.logger = null
  }

  handle_connection (conn, req) {
    if (conn.protocol !== this.protocol.name) {
      return conn.close(1000, WSE_REASON.PROTOCOL_ERR)
    }

    this.log('handle_connection', conn.protocol)

    conn.client_id = null
    conn.id = ''
    conn.valid_stat = CLIENT_STRANGER
    conn.meta = {}

    // RESOLVING IPV4 REMOTE ADDR
    conn.remote_addr = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    if (conn.remote_addr.substr(0, 7) === '::ffff:') conn.remote_addr = conn.remote_addr.substr(7)

    // todo: should be able to override by meta
    conn.pub_host = conn.remote_addr
  }

  handle_valid_message (conn, msg) {
    this.log(conn.client_id, 'handle_valid_message', msg)
    const client = this.clients.get(conn.client_id)
    this.channel.emit(msg.c, client, msg.dat, conn.id)
  }

  handle_stranger_message (conn, msg) {
    this.log('handle_stranger_message', msg)

    conn.valid_stat = CLIENT_VALIDATING

    if (msg.c !== this.protocol.hi) throw new Error('only-hi-message-allowed') // todo: kick

    // todo: why it's here? make a method out of if
    const resolve = (id, welcome_payload) => {
      this.log(id, 'resolved', msg.dat.payload, id, welcome_payload)

      if (!id) {
        conn.close(1000, WSE_REASON.NOT_AUTHORIZED)
        return
      }

      conn.client_id = id
      conn.id = conn_id_gen()
      conn.valid_stat = CLIENT_VALID

      let client = this.clients.get(conn.client_id)

      if (client) {
        client._conn_add(conn)
        // todo: remove older connections if necessary
        client.send(this.protocol.welcome, welcome_payload)
        this.connected.emit(conn, client, msg.dat.meta || {}, true)
      } else {
        const client = new WseClient(this, conn, msg.dat.meta || {})
        this.clients.set(client.id, client)
        client.send(this.protocol.welcome, welcome_payload)
        this.connected.emit(conn, client, msg.dat.meta || {}, true)
        this.joined.emit(client, msg.dat.meta || {}, true)
      }
    }

    this.incoming_handler({
      payload: msg.dat.payload,
      meta: msg.dat.meta || {},
      resolve,
    })
  }

  init () {
    this.ws_server = new WebSocket.Server(this.ws_params)
    this.ws_server.on('connection', (conn, req) => {
      this.handle_connection(conn, req)

      conn.on('message', (message) => {
        // todo: ignore or kick?
        if (conn.valid_stat === CLIENT_VALIDATING) return

        let msg = ''
        try {
          msg = this.protocol.unpack(message)
        } catch (err) {
          this.error.emit(err, (`${ conn.client_id }#${ conn.id }` || 'stranger') + ' sent broken message')
          if (conn.client_id && this.clients.has(conn.client_id)) {
            this.clients.get(conn.client_id)._conn_drop(conn.id, WSE_REASON.PROTOCOL_ERR)
          } else {
            conn.removeAllListeners()
            conn.close(1000, WSE_REASON.PROTOCOL_ERR)
          }
          return
        }

        switch (conn.valid_stat) {
          case CLIENT_VALID:
            return this.handle_valid_message(conn, msg)
          case CLIENT_STRANGER:
            return this.handle_stranger_message(conn, msg)
        }
      })

      conn.on('close', (code, reason) => {
        if (conn.client_id && this.clients.has(conn.client_id)) {
          this.log(`${ conn.client_id }#${ conn.id }`, 'disconnected', code, reason)
          const client = this.clients.get(conn.client_id)
          client._conn_drop(conn.id)
        } else {
          this.log(`stranger disconnected`, code, reason)
          this.disconnected.emit(conn, code, reason)
        }
      })

      conn.onerror = (e) => this.error.emit(conn, e.code)
    })
  }

  log () {
    if (this.logger) this.logger(arguments)
  }

  drop_client (id, reason = WSE_REASON.NO_REASON) {
    if (!this.clients.has(id)) return

    this.log(id, 'dropped', reason)

    const client = this.clients.get(id)

    if (client.conns.size) client.drop()
    this.left.emit(client, 1000, reason)

    this.clients.delete(client.id)
  }
}


class WseClient {
  /**
   * @param {WseMServer} server - wsm instance
   * @param {WebSocket} conn - ws connection
   * @param {object} meta - object with user-defined data
   */
  constructor (server, conn, meta = {}) {
    this.id = conn.client_id
    this.conns = []
    this.server = server
    this.meta = meta

    this._conn_add(conn)
  }

  _conn_add (conn) {
    this.conns.push(conn)
    if (this.server.cpu_limit < this.conns.length) {
      this._conn_drop(this.conns[0].id, WSE_REASON.OTHER_CLIENT_CONNECTED)
    }
  }

  _conn_get (id) {
    return this.conns.find(c => c.id === id)
  }

  _conn_drop (id, reason = WSE_REASON.NO_REASON) {
    const conn = this._conn_get(id)

    if (!conn) throw new Error('No such connection on this client')

    conn.removeAllListeners()

    if (conn.readyState === WebSocket.CONNECTING || conn.readyState === WebSocket.OPEN) {
      conn.close(1000, reason)
    }

    const index = this.conns.indexOf(conn)
    if (index > -1) this.conns.splice(index, 1)

    this.server.disconnected.emit(conn, 1000, reason)

    if (this.conns.length === 0) {
      this.server.drop_client(this.id, reason)
    }

    this.server.log(`dropped ${ this.id }#${ id }`)
  }

  /**
   * Send a message to the client
   * @param {string} c - message id
   * @param {string|number|object} dat - payload
   * @param {string} connection_id id of specific connection to send. omit to send on al the connections of this client
   * @returns {boolean} - true if connection was opened, false - if not.
   */
  send (c, dat, connection_id = '') {
    if (connection_id) {
      const conn = this.conns.get(connection_id)
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(this.server.protocol.pack(c, dat))
      }

    } else {
      this.server.log(`send to ${ this.id }`, c, dat)
      this.conns.forEach(conn => {
        if (conn.readyState === WebSocket.OPEN) {
          conn.send(this.server.protocol.pack(c, dat))
        }
      })
    }
  }

  drop (reason = WSE_REASON.NO_REASON) {
    this.conns.forEach(conn => this._conn_drop(conn.id, reason))
  }
}

export default WseMServer
