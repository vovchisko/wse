import EE        from 'eventemitter3'
import WebSocket from 'ws'
import Sig       from 'a-signal'

import WseJSON    from './protocol.js'
import WSE_REASON from './reason.js'

const CLIENT_STRANGER = 'CLIENT_STRANGER'
const CLIENT_VALIDATING = 'CLIENT_VALIDATING'
const CLIENT_CHALLENGED = 'CLIENT_CHALLENGED'
const CLIENT_VALID = 'CLIENT_VALID'

const _payload = Symbol('_payload')
const _meta = Symbol('_meta')
const _challenge_quest = Symbol('_challenge_quest')
const _challenge_response = Symbol('_challenge_response')
const _client_id = Symbol('_client_id')
const _valid_stat = Symbol('_valid_stat')
const _id = Symbol('id')

function conn_id_gen () {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

class WseMServer {
  /**
   * Manage incoming connections.
   *
   * @callback WseServer.incoming_handler
   * @param {String} params.payload JWT or any other type of secret
   * @param {Object} params.meta optional data from the client
   * @param {Function} params.resolve call it with user ID or any other identifier. falsy argument will reject connection.
   * @param {Object} params.challenge challenge quest and client response on it
   * @param {*} params.challenge.quest given task
   * @param {*} params.challenge.response received user response
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
    this.challenger = null
    this.channel = new EE()

    this.logger = null
  }

  use_challenge (challenger) {
    if (typeof challenger === 'function') {
      this.challenger = challenger
    } else {
      throw new Error('challenger argument is not a function!')
    }
  }

  handle_connection (conn, req) {
    if (conn.protocol !== this.protocol.name) {
      return conn.close(1000, WSE_REASON.PROTOCOL_ERR)
    }

    this.log('handle_connection', conn.protocol)

    conn[_client_id] = null
    conn[_valid_stat] = CLIENT_STRANGER
    conn[_meta] = {}
    conn[_id] = '' // todo: uuid?

    // RESOLVING IPV4 REMOTE ADDR
    conn.remote_addr = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    if (conn.remote_addr.substr(0, 7) === '::ffff:') conn.remote_addr = conn.remote_addr.substr(7)

    // todo: should be able to override by meta
    conn.pub_host = conn.remote_addr
  }

  handle_valid_message (conn, msg) {
    this.log(conn[_client_id], 'handle_valid_message', msg)
    const client = this.clients.get(conn[_client_id])
    this.channel.emit(msg.c, client, msg.dat, conn[_id])
  }

  handle_stranger_message (conn, msg) {
    this.log('handle_stranger_message', msg)

    if (conn[_valid_stat] === CLIENT_STRANGER) {
      if (msg.c === this.protocol.hi) {
        conn[_valid_stat] = CLIENT_VALIDATING
        conn[_payload] = msg.dat.payload

        Object.assign(conn[_meta], msg.dat.meta || {})

        if (typeof this.challenger === 'function') {
          this.challenger(conn[_payload], conn[_meta], (quest) => {
            conn[_challenge_quest] = quest
            conn.send(this.protocol.pack('challenge', quest))
            conn[_valid_stat] = CLIENT_CHALLENGED
          })
          return
        }
      } else {
        conn.close(1000, WSE_REASON.PROTOCOL_ERR)
        return
      }
    }

    if (conn[_valid_stat] === CLIENT_CHALLENGED) {
      if (msg.c === this.protocol.challenge) {
        conn[_challenge_response] = msg.dat
        this.log('challenge response', msg.dat)
      } else {
        conn.close(1000, WSE_REASON.PROTOCOL_ERR)
      }
    }

    const resolve = (client_id, welcome_payload) => {
      this.resolve_connection(conn, client_id, welcome_payload, msg)
    }

    this.incoming_handler({
      payload: conn[_payload],
      meta: conn[_meta],
      resolve,
      challenge: typeof this.challenger === 'function'
          ? { quest: conn[_challenge_quest], response: conn[_challenge_response] }
          : null,
      id: conn[_id],
    })
  }

  resolve_connection (conn, client_id, welcome_payload, msg) {
    if (!client_id) {
      conn.close(1000, WSE_REASON.NOT_AUTHORIZED)
      return
    }

    this.log(client_id, 'resolved', msg.dat.payload, welcome_payload)

    conn[_client_id] = client_id
    conn[_id] = conn_id_gen()
    conn[_valid_stat] = CLIENT_VALID

    let client = this.clients.get(conn[_client_id])

    if (client) {
      client._conn_add(conn)
      client.send(this.protocol.welcome, welcome_payload, conn[_id])
      this.connected.emit(conn)
    } else {
      const client = new WseClient(this, conn)
      this.clients.set(client.id, client)
      client.send(this.protocol.welcome, welcome_payload)
      this.connected.emit(conn)
      this.joined.emit(client)
    }
  }

  init () {
    this.ws_server = new WebSocket.Server(this.ws_params)
    this.ws_server.on('connection', (conn, req) => {
      this.handle_connection(conn, req)

      conn.on('message', (message) => {
        if (conn[_valid_stat] === CLIENT_VALIDATING) return

        let msg = ''
        try {
          msg = this.protocol.unpack(message)
        } catch (err) {
          this.error.emit(err, (`${ conn[_client_id] }#${ conn[_id] }` || 'stranger') + ' sent broken message')
          if (conn[_client_id] && this.clients.has(conn[_client_id])) {
            this.clients.get(conn[_client_id])._conn_drop(conn[_id], WSE_REASON.PROTOCOL_ERR)
          } else {
            conn.removeAllListeners()
            conn.close(1000, WSE_REASON.PROTOCOL_ERR)
          }
          return
        }

        switch (conn[_valid_stat]) {
          case CLIENT_VALID:
            return this.handle_valid_message(conn, msg)
          case CLIENT_STRANGER:
          case CLIENT_CHALLENGED:
            return this.handle_stranger_message(conn, msg)
        }
      })

      conn.on('close', (code, reason) => {
        if (conn[_client_id] && this.clients.has(conn[_client_id])) {
          this.log(`${ conn[_client_id] }#${ conn[_id] }`, 'disconnected', code, reason)
          const client = this.clients.get(conn[_client_id])
          client._conn_drop(conn[_id])
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

  send_to (client_id, c, dat, conn_id) {
    const client = this.clients.get(client_id)
    if (client) client.send(c, dat, conn_id)
  }
}


class WseClient {
  /**
   * @param {WseMServer} server - wsm instance
   * @param {WebSocket} conn - ws connection
   * @param {object} meta - object with user-defined data
   */
  constructor (server, conn, meta = {}) {
    this.id = conn[_client_id]
    this.conns = new Map()
    this.server = server
    this.meta = conn[_meta]
    this.payload = conn[_payload]

    this._conn_add(conn)
  }

  _conn_add (conn) {
    this.conns.set(conn[_id], conn)
    if (this.server.cpu_limit < this.conns.size) {
      const key_to_delete = this.conns[Symbol.iterator]().next().value[0]
      this._conn_drop(key_to_delete, WSE_REASON.OTHER_CLIENT_CONNECTED)
    }
    return this
  }

  _conn_drop (id, reason = WSE_REASON.NO_REASON) {
    const conn = this.conns.get(id)

    if (!conn) throw new Error('No such connection on this client')

    conn.removeAllListeners()

    if (conn.readyState === WebSocket.CONNECTING || conn.readyState === WebSocket.OPEN) {
      conn.close(1000, reason)
    }

    this.conns.delete(id)

    this.server.disconnected.emit(conn, 1000, reason)

    if (this.conns.size === 0) {
      this.server.drop_client(this.id, reason)
    }

    this.server.log(`dropped ${ this.id }#${ id }`)
  }

  /**
   * Send a message to the client
   * @param {string} c - message id
   * @param {string|number|object} dat - payload
   * @param {string} conn_id id of specific connection to send. omit to send on al the connections of this client
   * @returns {boolean} - true if connection was opened, false - if not.
   */
  send (c, dat, conn_id = '') {
    if (conn_id) {
      const conn = this.conns.get(conn_id)
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
    this.conns.keys().forEach(key => this._conn_drop(key, reason))
  }
}

export default WseMServer
