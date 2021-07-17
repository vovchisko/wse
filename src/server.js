import EE        from 'eventemitter3'
import WebSocket from 'ws'
import Sig       from 'a-signal'

import WseJSON    from './protocol.js'
import WSE_REASON from './reason.js'

const CLIENT_STRANGER = 0
const CLIENT_VALIDATING = 1
const CLIENT_VALID = 2

class WseServer {
  /**
   * Manage incoming connections.
   *
   * @callback WseServer.incoming_handler
   * @param {String} params.payload JWT or any other type of secret
   * @param {Object} params.meta optional data from the client
   * @param {Function} params.resolve call it with user ID or any other identifier. falsy argument will reject connection.
   */

  /**
   * WseServer class.
   *
   * @param {Object} options see https://github.com/websockets/ws/#readme.
   * @param {Function|WseServer.incoming_handler} options.incoming Will be called for each new connection.
   * @param {Object} [options.protocol=WseJSON] Overrides `wse_protocol` implementation. Use with caution.
   * @param {WebSocket.Server} [options.ws_server=WebSocket.Server] Tt is possible to override `ws` implementation. Use with caution.
   */
  constructor ({
    protocol = WseJSON,
    incoming,
    ws_server = WebSocket.Server,
    ...ws_params
  }) {
    if (!incoming) throw new Error('incoming handler is missing!')

    this.clients = new Map(/* { ID: WseClientConnection } */)
    this.protocol = new protocol()
    this.ws_params = ws_params
    this.ws_server = ws_server
    this.incoming_handler = incoming

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
    conn.valid_stat = CLIENT_STRANGER
    conn.meta = {}

    // RESOLVING IPV4 REMOTE ADDR
    conn.remote_addr = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    if (conn.remote_addr.substr(0, 7) === '::ffff:') conn.remote_addr = conn.remote_addr.substr(7)

    // CAN BE OVERRIDDEN BY META
    conn.pub_host = conn.remote_addr
  }

  handle_valid_message (conn, msg) {
    this.log(conn.client_id, 'handle_valid_message', msg)
    if (!conn.client_id) throw new Error('impossible!') // todo: any other way?
    const client = this.clients.get(conn.client_id)
    this.channel.emit(msg.c, client, msg.dat)
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
      conn.valid_stat = CLIENT_VALID

      let existing_client = this.clients.get(conn.client_id)

      if (existing_client) {
        existing_client.drop(WSE_REASON.OTHER_CLIENT_CONNECTED)
        // todo: might be a good idea to keep this behaviour behind an option maybe?
        // conn.close(1000, WSE_REASON.OTHER_CLIENT_CONNECTED)
        // return
      }

      const client = new WseClient(this, conn, msg.dat.meta || {})
      this.clients.set(client.id, client)

      client.send(this.protocol.welcome, welcome_payload)

      this.connected.emit(conn)
      this.joined.emit(client, msg.dat.meta || {})
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
          this.error.emit(err, (conn.client_id || 'unsigned') + ' sent broken message')
          conn.client_id
              ? this.drop_client(1000, WSE_REASON.PROTOCOL_ERR)
              : conn.close(1000, WSE_REASON.PROTOCOL_ERR)
          return
        }


        // todo: make all connections has client ID and connection_id.
        //       client ID resolves in the auth resolver.
        //       connections ID gives automatically and should be unique
        //       (maybe be WS does it, but we can't be sure for the browser)
        switch (conn.valid_stat) {
          case CLIENT_VALID:
            return this.handle_valid_message(conn, msg)
          case CLIENT_STRANGER:
            return this.handle_stranger_message(conn, msg)
        }
      })

      conn.on('close', (code, reason) => {
        this.disconnected.emit(conn, code, reason)
        this.log(conn.client_id, 'disconnected', code, reason)
        if (conn.client_id && conn.valid_stat === CLIENT_VALID && this.clients.has(conn.client_id)) {
          const client = this.clients.get(conn.client_id)

          this.log(client.id, 'left', code, reason)

          this.left.emit(client, code, reason)
          this.clients.delete(client.id)
        }
      })

      conn.onerror = (e) => this.error.emit(conn, e.code)
    })
  }

  log () {
    if (this.logger) this.logger(arguments)
  };


  // todo: this will drop client entirely with all the connections
  drop_client (id, reason = WSE_REASON.NO_REASON) {
    if (!this.clients.has(id)) return

    this.log(id, 'dropped', reason)

    const client = this.clients.get(id)

    this.disconnected.emit(client.conn, 1000, reason)

    this.left.emit(client, 1000, reason)
    this.clients.delete(client.id)

    client.conn.removeAllListeners()
    client.conn.close(1000, reason)
  }

  send_to (client_id, c, dat) {
    const client = this.clients.get(client_id)
    if (client) client.send(c, dat)
  }
}


class WseClient {
  /**
   * @param {WseServer} server - wsm instance
   * @param {WebSocket} conn - ws connection
   * @param {object} meta - object with user-defined data
   */
  constructor (server, conn, meta = {}) {
    // todo: check if client id assigned?
    this.id = conn.client_id
    this.conn = conn
    this.server = server
    this.meta = meta
  }

  /**
   * Send a message to the client
   * @param {string} c - message id
   * @param {string|number|object} dat - payload
   * @param {string} conn_id identifier of the specific connection. omit it to send message for all connections of this client.
   * @returns {boolean} - true if connection was opened, false - if not.
   */
  send (c, dat, conn_id = '') {
    // send the message to all of the clients.
    if (this.conn && this.conn.readyState === WebSocket.OPEN) {
      this.conn.send(this.server.protocol.pack(c, dat))
      this.server.log('send to', this.id, c, dat)
      return true
    } else {
      return false
    }
  }

  drop (reason = WSE_REASON.NO_REASON) {
    this.server.drop_client(this.id, reason)
  }
}

export default WseServer
