import EE        from 'eventemitter3'
import WebSocket from 'ws'
import Sig       from 'a-signal'

import { WseJSON }                                          from './protocol.js'
import { make_stamp, WSE_REASON, WSE_SERVER_ERR, WseError } from './common.js'

const CLIENT_STRANGER = 'CLIENT_STRANGER'
const CLIENT_VALIDATING = 'CLIENT_VALIDATING'
const CLIENT_CHALLENGED = 'CLIENT_CHALLENGED'
const CLIENT_VALID = 'CLIENT_VALID'

const _identity = Symbol('_identity')
const _meta = Symbol('_meta')
const _challenge_quest = Symbol('_challenge_quest')
const _challenge_response = Symbol('_challenge_response')
const _client_id = Symbol('_client_id')
const _valid_stat = Symbol('_valid_stat')
const _id = Symbol('id')


export class WseServer {
  /**
   * Manage identify connections.
   *
   * @callback WseServer.identifyCallback
   * @param {String} params.identity JWT or any other type of secret
   * @param {Object} params.meta optional data from the client
   * @param {Function} params.identify call it with user ID or any other identifier. falsy argument will reject connection.
   * @param {Object} params.challenge challenge quest and client response on it
   * @param {*} params.challenge.quest given task
   * @param {*} params.challenge.response received user response
   */

  /**
   * Generate CRA-auth challenge.
   *
   * @callback WseServer.CraGenerator
   * @param {*} identity identity, presented by user
   * @param {Object} params.meta optional data from the client
   * @param {Function} params.quest function that accepts quest payload for user.
   */

  /**
   * WseServer class.
   *
   * @param {Object} options see https://github.com/websockets/ws/#readme.
   * @param {Function|WseServer.identifyCallback} options.identify Will be called for each new connection.
   * @param {Number} [options.connPerUser=1] How many connections allowed per user
   * @param {Object} [options.protocol=WseJSON] Overrides `wse_protocol` implementation. Use with caution.
   * @param {Boolean} [options.skipInit=false] Allow to skip init step, and attach external server later.
   *
   * and classic ws params...
   * @param {Number} [options.backlog=511] The maximum length of the queue of pending connections
   * @param {Boolean} [options.clientTracking=true] Specifies whether or not to track clients
   * @param {Function} [options.handleProtocols] A hook to handle protocols
   * @param {String} [options.host] The hostname where to bind the server
   * @param {Number} [options.maxPayload=104857600] The maximum allowed message size
   * @param {Boolean} [options.noServer=false] Enable no server mode
   * @param {String} [options.path] Accept only connections matching this path
   * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable permessage-deflate
   * @param {Number} [options.port] The port where to bind the server
   * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S server to use
   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or not to skip UTF-8 validation for text and close messages
   * @param {Function} [options.verifyClient] A hook to reject connections
   */
  constructor ({
    protocol,
    identify,
    connPerUser = 1,
    skipInit = false,
    ...options
  }) {
    if (!identify) throw new WseError(WSE_SERVER_ERR.IDENTIFY_HANDLER_MISSING)

    this.clients = new Map()
    this.protocol = protocol ? new protocol() : new WseJSON()
    this.options = {}
    this.ws = null
    this.identify = identify
    this.connPerUser = connPerUser

    this.channel = new EE()

    this.ignored = new Sig()
    this.joined = new Sig()
    this.left = new Sig()
    this.connected = new Sig()
    this.disconnected = new Sig()
    this.error = new Sig()

    this._rps = new Map()

    this.when = {
      ignored: this.ignored.subscriber(),
      joined: this.joined.subscriber(),
      left: this.left.subscriber(),
      connected: this.connected.subscriber(),
      disconnected: this.disconnected.subscriber(),
      error: this.error.subscriber(),
    }

    this.cra_generator = null

    if (skipInit) {
      Object.assign(this.options, options)
    } else {
      this.init(options)
    }
  }

  /**
   * Initialize server.
   * Can override initial options.
   *
   * @param {Number} [options.backlog=511] The maximum length of the queue of pending connections
   * @param {Boolean} [options.clientTracking=true] Specifies whether or not to track clients
   * @param {Function} [options.handleProtocols] A hook to handle protocols
   * @param {String} [options.host] The hostname where to bind the server
   * @param {Number} [options.maxPayload=104857600] The maximum allowed message size
   * @param {Boolean} [options.noServer=false] Enable no server mode
   * @param {String} [options.path] Accept only connections matching this path
   * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable permessage-deflate
   * @param {Number} [options.port] The port where to bind the server
   * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S server to use
   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or not to skip UTF-8 validation for text and close messages
   * @param {Function} [options.verifyClient] A hook to reject connections
   */
  init (options) {
    Object.assign(this.options, options)

    this.ws = new WebSocket.Server(this.options)
    this.ws.on('connection', (conn, req) => {
      this._handle_connection(conn, req)

      conn.on('message', (message) => {
        if (conn[_valid_stat] === CLIENT_VALIDATING) return

        let type
        let payload
        let stamp
        try {
          [ type, payload, stamp ] = this.protocol.unpack(message)

          switch (conn[_valid_stat]) {
            case CLIENT_VALID:
              if (stamp) {
                return this._handle_valid_call(conn, type, payload, stamp)
              } else if (type) {
                return this._handle_valid_message(conn, type, payload)
              } else {
                throw new WseError(WSE_SERVER_ERR.PROTOCOL_VIOLATION, { type, payload, stamp })
              }
            case CLIENT_STRANGER:
            case CLIENT_CHALLENGED:
              return this._handle_stranger_message(conn, type, payload)
          }
        } catch (err) {
          if (!err.identity) err.identity = {}
          err.identity.caused_by = conn[_client_id] ? `${ conn[_client_id] }#${ conn[_id] }` : 'stranger'
          this.error.emit(err, conn)
          if (conn[_client_id] && this.clients.has(conn[_client_id])) {
            this.clients.get(conn[_client_id])._conn_drop(conn[_id], WSE_REASON.PROTOCOL_ERR)
          } else {
            conn.removeAllListeners()
            conn.close(1000, WSE_REASON.PROTOCOL_ERR)
          }
        }
      })

      conn.on('close', (code, reason) => {
        if (conn[_client_id] && this.clients.has(conn[_client_id])) {
          const client = this.clients.get(conn[_client_id])
          client._conn_drop(conn[_id])
        } else {
          this.disconnected.emit(conn, code, reason)
        }
      })

      conn.onerror = (e) => this.error.emit(conn, e)
    })
  }

  /**
   * Generate challenge for connected user.
   * @param {WseServer.CraGenerator} cra_generator
   */
  useChallenge (cra_generator) {
    if (typeof cra_generator === 'function') {
      this.cra_generator = cra_generator
    } else {
      throw new WseError(WSE_SERVER_ERR.INVALID_CRA_GENERATOR)
    }
  }

  _handle_connection (conn, req) {
    if (conn.protocol !== this.protocol.name) {
      return conn.close(1000, WSE_REASON.PROTOCOL_ERR)
    }

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

  _handle_valid_message (conn, type, payload) {
    const client = this.clients.get(conn[_client_id])
    this.channel.emit(type, client, payload, conn[_id]) || this.ignored.emit(client, type, payload, conn[_id])
  }

  async _handle_valid_call (conn, type, payload, stamp) {
    const client = this.clients.get(conn[_client_id])
    let result = {}
    if (this._rps.has(type)) {
      const rp = this._rps.get(type)
      try {
        result.result = await rp(client, payload, conn[_id])
      } catch (e) {
        result.error = { code: WSE_SERVER_ERR.FAILED_TO_EXECUTE_RP }
        this.error.emit(new WseError(WSE_SERVER_ERR.FAILED_TO_EXECUTE_RP, { type, payload, stamp }), conn)
      }
    } else {
      this.error.emit(new WseError(WSE_SERVER_ERR.RP_NOT_REGISTERED, { type, payload, stamp }), conn)
      result.error = { code: WSE_SERVER_ERR.RP_NOT_REGISTERED }
    }
    client.send(stamp, result, conn[_id])
  }

  /**
   * Register remote procedure. Value, returned from the handler will be sent to requester.
   * @param {String} rp
   * @param {Function} handler
   */
  register (rp, handler) {
    if (this._rps.has(rp)) throw new WseError(WSE_SERVER_ERR.RP_ALREADY_REGISTERED, { rp })
    this._rps.set(rp, handler)
  }

  /**
   * Unregister existing RP.
   * @param {String} rp
   */
  unregister (rp) {
    if (!this._rps.has(rp)) throw new WseError(WSE_SERVER_ERR.RP_NOT_REGISTERED, { rp })
    this._rps.delete(rp)
  }

  _handle_stranger_message (conn, type, payload) {
    if (conn[_valid_stat] === CLIENT_STRANGER) {
      if (type === this.protocol.internal_types.hi) {
        conn[_valid_stat] = CLIENT_VALIDATING
        conn[_identity] = payload.identity

        Object.assign(conn[_meta], payload.meta || {})

        if (typeof this.cra_generator === 'function') {
          this.cra_generator(conn[_identity], conn[_meta], (quest) => {
            conn[_challenge_quest] = quest
            conn.send(this.protocol.pack({ type: this.protocol.internal_types.challenge, payload: quest }))
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
      if (type === this.protocol.internal_types.challenge) {
        conn[_challenge_response] = payload
      } else {
        conn.close(1000, WSE_REASON.PROTOCOL_ERR)
      }
    }

    const resolve = (client_id, welcome_payload) => {
      this._identify_connection(conn, client_id, welcome_payload, payload)
    }

    this.identify({
      identity: conn[_identity],
      meta: conn[_meta],
      resolve,
      challenge: typeof this.cra_generator === 'function'
          ? { quest: conn[_challenge_quest], response: conn[_challenge_response] }
          : null,
      id: conn[_id],
    })
  }

  _identify_connection (conn, client_id, welcome_payload, payload) {
    if (!client_id) {
      conn.close(1000, WSE_REASON.NOT_AUTHORIZED)
      return
    }

    conn[_client_id] = client_id
    conn[_id] = make_stamp(15)
    conn[_valid_stat] = CLIENT_VALID

    let client = this.clients.get(conn[_client_id])

    if (client) {
      client._conn_add(conn)
      client.send(this.protocol.internal_types.welcome, welcome_payload, conn[_id])
      this.connected.emit(conn)
    } else {
      const client = new WseClient(this, conn)
      this.clients.set(client.id, client)
      client.send(this.protocol.internal_types.welcome, welcome_payload)
      this.connected.emit(conn)
      this.joined.emit(client, payload.meta || {})
    }
  }

  /**
   * Send message for everyone
   * @param type
   * @param payload
   */
  broadcast (type, payload) {
    this.clients.forEach((client) => {
      client.send(type, payload)
    })
  }

  /**
   * Drop client with specific ID.
   * @param {String} id client ID
   * @param {String} [reason] WSE_REASON
   */
  dropClient (id, reason = WSE_REASON.NO_REASON) {
    if (!this.clients.has(id)) return

    const client = this.clients.get(id)

    if (client.conns.size) client.drop()
    this.left.emit(client, 1000, reason)

    this.clients.delete(client.id)
  }

  /**
   * Send message to the client by Id.
   * @param {String} client_id Client ID
   * @param {String} type message type
   * @param {*} [payload] optional payload
   * @param {String} [conn_id] specific connection identifier (omit to send for all client's connections)
   */
  send (client_id, type, payload, conn_id) {
    const client = this.clients.get(client_id)
    if (client) client.send(type, payload, conn_id)
  }
}

class WseClient {
  /**
   * @param {WseServer} server - wsm instance
   * @param {WebSocket} conn - ws connection
   * @param {object} meta - object with user-defined data
   */
  constructor (server, conn, meta = {}) {
    this.id = conn[_client_id]
    this.conns = new Map()
    this.srv = server
    this.meta = conn[_meta]
    this.identity = conn[_identity]

    this._conn_add(conn)
  }

  _conn_add (conn) {
    this.conns.set(conn[_id], conn)
    if (this.srv.connPerUser < this.conns.size) {
      const key_to_delete = this.conns[Symbol.iterator]().next().value[0]
      this._conn_drop(key_to_delete, WSE_REASON.CLIENTS_CONCURRENCY)
    }
    return this
  }

  _conn_drop (id, reason = WSE_REASON.NO_REASON) {
    const conn = this.conns.get(id)

    if (!conn) throw new WseError(WSE_SERVER_ERR.NO_CLIENT_CONNECTION, { id })

    conn.removeAllListeners()

    if (conn.readyState === WebSocket.CONNECTING || conn.readyState === WebSocket.OPEN) {
      conn.close(1000, reason)
    }

    this.conns.delete(id)

    this.srv.disconnected.emit(conn, 1000, reason)

    if (this.conns.size === 0) {
      this.srv.dropClient(this.id, reason)
    }
  }

  /**
   * Send a message to the client
   * @param {string} type - message type
   * @param {string|number|object} payload - identity
   * @param {string} conn_id id of specific connection to send. omit to send on al the connections of this client
   * @returns {boolean} - true if connection was opened, false - if not.
   */
  send (type, payload, conn_id = '') {
    if (conn_id) {
      const conn = this.conns.get(conn_id)
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(this.srv.protocol.pack({ type, payload }))
      }
    } else {
      this.conns.forEach(conn => {
        if (conn.readyState === WebSocket.OPEN) {
          conn.send(this.srv.protocol.pack({ type, payload }))
        }
      })
    }
  }

  /**
   * Drop client
   * @param reason
   */
  drop (reason = WSE_REASON.NO_REASON) {
    this.conns.forEach((val, key) => this._conn_drop(key, reason))
  }
}


