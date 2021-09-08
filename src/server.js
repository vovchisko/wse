import EE                             from 'eventemitter3'
import { WebSocket, WebSocketServer } from 'ws'
import Sig                            from 'a-signal'

import { WseJSON }                                          from './protocol.js'
import { make_stamp, WSE_REASON, WSE_SERVER_ERR, WseError } from './common.js'

const CLIENT_STRANGER = 'CLIENT_STRANGER'
const CLIENT_VALIDATING = 'CLIENT_VALIDATING'
const CLIENT_CHALLENGED = 'CLIENT_CHALLENGED'
const CLIENT_VALID = 'CLIENT_VALID'

class WseConnection {
  /**
   *
   * @param {WebSocket} ws_conn
   * @param {WseServer} server
   */
  constructor (ws_conn, server) {
    this.identity = null
    this.meta = {}
    this.challenge_quest = null
    this.challenge_response = null
    this.valid_stat = CLIENT_STRANGER
    this.conn_id = make_stamp(15)

    this.remote_addr = ''

    Object.defineProperty(this, 'client', { enumerable: false, value: null, writable: true })
    Object.defineProperty(this, 'ws_conn', { enumerable: false, value: ws_conn })
    Object.defineProperty(this, 'server', { enumerable: false, value: server })
  }

  /**
   * @param {WseIdentity} client
   */
  _identify_as (client) {
    this.client = client
    this.valid_stat = CLIENT_VALID
  }

  /**
   * Send message over this connection.
   * @param {String} type
   * @param {*} payload
   */
  send (type, payload) {
    this.ws_conn.send(this.server.protocol.pack({ type, payload }))
  }

  get readyState () {
    return this.ws_conn.readyState
  }

  get cid (){
    return this.client ? this.client.cid || null : null
  }
}

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

    this.ws = new WebSocketServer({ ...this.options, handleProtocols: (a) => this.protocol.name })
    this.ws.on('connection', (ws_conn, req) => {
      const conn = new WseConnection(ws_conn, this)

      this._handle_connection(conn, req)

      conn.ws_conn.on('message', (message) => {
        if (conn.valid_stat === CLIENT_VALIDATING) return

        let type
        let payload
        let stamp

        try {
          [ type, payload, stamp ] = this.protocol.unpack(message)

          switch (conn.valid_stat) {
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
          const error = err.type !== 'wse-error'
              ? new WseError(WSE_SERVER_ERR.MESSAGE_PROCESSING_ERROR, { raw: err })
              : err
          error.message_from = conn.cid ? `${ conn.cid }#${ conn.conn_id }` : 'stranger'
          this.error.emit(err, conn)
          if (conn.cid && this.clients.has(conn.cid)) {
            this.clients.get(conn.cid)._conn_drop(conn.conn_id, WSE_REASON.PROTOCOL_ERR)
          } else {
            conn.ws_conn.removeAllListeners()
            conn.ws_conn.close(1000, WSE_REASON.PROTOCOL_ERR)
          }
        }
      })

      conn.ws_conn.on('close', (code, reason) => {
        if (conn.cid && this.clients.has(conn.cid)) {
          const client = this.clients.get(conn.cid)
          client._conn_drop(conn.conn_id)
        } else {
          this.disconnected.emit(conn, code, reason)
        }
      })

      conn.ws_conn.onerror = (e) => this.error.emit(new WseError(WSE_SERVER_ERR.CONNECTION_ERROR, { raw: e }), conn)
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
    if (conn.ws_conn.protocol !== this.protocol.name) {
      return conn.ws_conn.close(1000, WSE_REASON.PROTOCOL_ERR)
    }

    // RESOLVING IPV4 REMOTE ADDR
    conn.remote_addr = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    if (conn.remote_addr.substr(0, 7) === '::ffff:') conn.remote_addr = conn.remote_addr.substr(7)
  }

  _handle_valid_message (conn, type, payload) {
    this.channel.emit(type, conn, payload) || this.ignored.emit(conn, type, payload)
  }

  _handle_valid_call (conn, type, payload, stamp) {
    const reply = {}
    if (this._rps.has(type)) {
      const rp = this._rps.get(type)

      const rp_wrap = async () => {
        reply.result = await rp(conn, payload)
        conn.send(stamp, reply)
      }

      rp_wrap().catch(err => {
        reply.error = { code: WSE_SERVER_ERR.RP_EXECUTION_FAILED }
        conn.send(stamp, reply)

        this.error.emit(new WseError(WSE_SERVER_ERR.RP_EXECUTION_FAILED, {
          type,
          payload,
          stamp,
          cid: conn.cid,
          conn_id: conn.conn_id,
          raw: err,
        }), conn)
      })

    } else {
      reply.error = { code: WSE_SERVER_ERR.RP_NOT_REGISTERED }
      conn.send(stamp, reply)

      this.error.emit(new WseError(WSE_SERVER_ERR.RP_NOT_REGISTERED, {
        type,
        payload,
        stamp,
        cid: conn.cid,
        conn_id: conn.conn_id,
      }), conn)
    }
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
    if (conn.valid_stat === CLIENT_STRANGER) {
      if (type === this.protocol.internal_types.hi) {
        conn.valid_stat = CLIENT_VALIDATING
        conn.identity = payload.identity

        Object.assign(conn.meta, payload.meta || {})

        if (typeof this.cra_generator === 'function') {
          this.cra_generator(conn.identity, conn.meta, (quest) => {
            conn.challenge_quest = quest
            conn.send(this.protocol.internal_types.challenge, quest)
            conn.valid_stat = CLIENT_CHALLENGED
          })
          return
        }
      } else {
        conn.ws_conn.close(1000, WSE_REASON.PROTOCOL_ERR)
        return
      }
    }

    if (conn.valid_stat === CLIENT_CHALLENGED) {
      if (type === this.protocol.internal_types.challenge) {
        conn.challenge_response = payload
      } else {
        conn.ws_conn.close(1000, WSE_REASON.PROTOCOL_ERR)
      }
    }

    const resolve = (cid, welcome_payload) => {
      this._identify_connection(conn, cid, welcome_payload, payload)
    }

    this.identify({
      identity: conn.identity,
      meta: conn.meta,
      resolve,
      challenge: typeof this.cra_generator === 'function'
          ? { quest: conn.challenge_quest, response: conn.challenge_response }
          : null,
      id: conn.conn_id,
    })
  }

  _identify_connection (conn, cid, welcome_payload, payload) {
    if (!cid) {
      conn.ws_conn.close(1000, WSE_REASON.NOT_AUTHORIZED)
      return
    }

    let wasNewIdentity = false

    let client = this.clients.get(cid)

    if (!client) {
      wasNewIdentity = true
      client = new WseIdentity({
        identity: conn.identity,
        meta: conn.meta,
        cid,
      }, this)
      this.clients.set(cid, client)
    }

    client._conn_add(conn)

    conn.send(this.protocol.internal_types.welcome, welcome_payload)

    if (wasNewIdentity) this.joined.emit(client, payload.meta || {})

    this.connected.emit(conn)
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

    this.clients.delete(client.cid)
  }

  /**
   * Send message to the client by Id.
   * @param {String} cid Client ID
   * @param {String} type message type
   * @param {*} [payload] optional payload
   */
  send (cid, type, payload) {
    const client = this.clients.get(cid)
    if (client) {
      client.send(type, payload)
    }
  }
}

class WseIdentity {
  /**
   * @param {string} cid - client id
   * @param {*} identity - identity payload
   * @param {WseServer} server - wsm instance
   * @param {object} meta - object with user-defined data
   */
  constructor ({ cid, identity, meta = {} }, server) {
    this.cid = cid
    this.conns = new Map()
    this.meta = meta
    this.identity = identity

    Object.defineProperty(this, 'server', { enumerable: false, value: server })
  }

  _conn_add (conn) {
    conn._identify_as(this)

    this.conns.set(conn.conn_id, conn)
    if (this.server.connPerUser < this.conns.size) {
      const key_to_delete = this.conns[Symbol.iterator]().next().value[0]
      this._conn_drop(key_to_delete, WSE_REASON.CLIENTS_CONCURRENCY)
    }
    return this
  }

  _conn_drop (id, reason = WSE_REASON.NO_REASON) {
    const conn = this.conns.get(id)

    if (!conn) throw new WseError(WSE_SERVER_ERR.NO_CLIENT_CONNECTION, { id })

    conn.ws_conn.removeAllListeners()

    if (conn.readyState === WebSocket.CONNECTING || conn.readyState === WebSocket.OPEN) {
      conn.ws_conn.close(1000, reason)
    }

    this.conns.delete(id)

    this.server.disconnected.emit(conn, 1000, reason)

    if (this.conns.size === 0) {
      this.server.dropClient(this.cid, reason)
    }
  }

  /**
   * Send a message to the client
   * @param {string} type - message type
   * @param {string|number|object} payload - identity
   * @returns {boolean} - true if connection was opened, false - if not.
   */
  send (type, payload) {
    this.conns.forEach(conn => {
      if (conn.readyState === WebSocket.OPEN) {
        conn.send(type, payload)
      }
    })
  }

  /**
   * Drop client
   * @param reason
   */
  drop (reason = WSE_REASON.NO_REASON) {
    this.conns.forEach((val, key) => this._conn_drop(key, reason))
  }
}


