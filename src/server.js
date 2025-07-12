/**
 * @import { WseError, WSE_REASON, WSE_ERROR } from './common.js'
 * @import { WebSocket } from 'ws'
 *
 * WSE Server Architecture:
 *
 * - client = WseIdentity (authenticated user)
 * - conn = WseConnection (single connection/device)
 * - client.conns = Map of WseConnection (user's devices)
 * - conn.client = WseIdentity (which user this connection belongs to)
 *
 * Authentication Flow:
 * 1. Client sends authentication data via client.connect(identity, meta)
 * 2. Server receives this as conn.identity (original auth data like tokens, tickets)
 * 3. Server validates conn.identity in the identify() callback
 * 4. Server calls accept(cid) with resolved user identifier (user ID, account ID)
 * 5. WseIdentity is created with the resolved cid, not the original identity
 *
 * Data Locations:
 * - conn.identity: Original authentication data (tokens, credentials, etc.)
 * - conn.cid / client.cid: Resolved user identifier after successful authentication
 * - client.identity: Does not exist - use conn.identity for original auth data
 */

import { EventEmitter } from 'tseep'
import { WebSocket, WebSocketServer } from 'ws'
import Signal from 'a-signal'

import { WseJSON } from './protocol.js'
import { make_stamp, WSE_ERROR, WSE_REASON, WseError } from './common.js'
import { RpcManager } from './rpc-man.js'

const CLIENT_STRANGER = 'CLIENT_STRANGER'
const CLIENT_VALIDATING = 'CLIENT_VALIDATING'
const CLIENT_CHALLENGED = 'CLIENT_CHALLENGED'
const CLIENT_VALID = 'CLIENT_VALID'

export class WseConnection {
  /**
   * WSE Connection instance representing a single WebSocket connection.
   * One user (WseIdentity/client) can have multiple connections (devices).
   *
   * @param {WebSocket} ws_conn - The underlying WebSocket connection
   * @param {WseServer} server - The WSE server instance
   */
  constructor(ws_conn, server) {
    /** @type {*|null} Original authentication data sent by client (tokens, credentials, etc.) */
    this.identity = null

    /** @type {Object} Additional metadata provided during connection */
    this.meta = {}

    /** @type {*} Challenge quest data for CRA authentication */
    this.challenge_quest = null

    /** @type {*} Challenge response from client */
    this.challenge_response = null

    /** @type {string} Internal validation status */
    this.valid_stat = CLIENT_STRANGER

    /** @type {string} Unique connection identifier */
    this.conn_id = make_stamp(15)

    /** @type {string} Remote client address */
    this.remote_addr = ''

    /** @type {WseIdentity|null} Associated client identity - which user this connection belongs to (null until authenticated) */
    Object.defineProperty(this, 'client', { enumerable: false, value: null, writable: true })

    /** @type {import('ws').WebSocket} Underlying WebSocket connection */
    Object.defineProperty(this, 'ws_conn', { enumerable: false, value: ws_conn })

    /** @type {WseServer} Parent WSE server instance */
    Object.defineProperty(this, 'server', { enumerable: false, value: server })
  }

  /**
   * WebSocket ready state.
   * @returns {number} WebSocket ready state (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)
   */
  get readyState() {
    return this.ws_conn.readyState
  }

  /**
   * Resolved client ID after successful authentication.
   * This is the validated user identifier (e.g., user ID, account ID) assigned during authentication.
   * @returns {string|null} Client ID or null if not authenticated
   */
  get cid() {
    return this.client ? this.client.cid || null : null
  }

  /**
   * Associate this connection with a client identity.
   * @param {WseIdentity} client - The client identity to associate with
   * @private
   */
  _identify_as(client) {
    this.client = client
    this.valid_stat = CLIENT_VALID
  }

  /**
   * Send message to this specific connection.
   * @param {string} type - Message type identifier
   * @param {*} [payload] - Message payload data
   * @example
   * // In RPC handler
   * server.register('getUserData', (conn, payload) => {
   *   conn.send('userData', { name: 'John', id: conn.cid })
   *   return { success: true }
   * })
   */
  send(type, payload) {
    this.ws_conn.send(this.server.protocol.pack({ type, payload }))
  }

  /**
   * Close this specific connection.
   * @param {string|WSE_REASON} [reason] - Reason for closing connection
   */
  drop(reason = WSE_REASON.NO_REASON) {
    this.ws_conn.close(1000, String(reason))
  }

  /**
   * Send Remote Procedure Call request to the client.
   * @param {string} rp - Name of the remote procedure to call
   * @param {*} [payload] - Data to send with the RPC call
   * @returns {Promise<*>} Promise that resolves with the RPC result
   * @throws {WseError} Throws WseError with specific error codes:
   *   - WSE_ERROR.RP_TIMEOUT: Call timed out
   *   - WSE_ERROR.RP_NOT_REGISTERED: RPC not found on client
   *   - WSE_ERROR.RP_EXECUTION_FAILED: Client-side error
   *   - WSE_ERROR.RP_DISCONNECT: Connection lost during call
   * @example
   * // Basic RPC call to client
   * const result = await conn.call('ping')
   * console.log(result) // 'pong'
   *
   * // Handle RPC errors
   * try {
   *   const data = await conn.call('processData', { items: [1, 2, 3] })
   * } catch (error) {
   *   if (error.code === WSE_ERROR.RP_TIMEOUT) {
   *     console.log('Client request timed out')
   *   }
   * }
   */
  async call(rp, payload) {
    if (this.ws_conn && this.ws_conn.readyState === 1) {
      // Create a signal that filters disconnect events for this specific connection
      const connectionDisconnectSignal = {
        once: callback => {
          return this.server.disconnected.once((conn, code, reason) => {
            if (conn === this) {
              callback(code, reason)
            }
          })
        },
      }

      return this.server._rpcManager.call(
        this.server.protocol,
        rp,
        payload,
        this.server.tO || 0,
        data => this.ws_conn.send(data),
        connectionDisconnectSignal
      )
    } else {
      const err = new WseError(WSE_ERROR.CONNECTION_NOT_READY)
      this.server.error.emit(err, this)
      throw err
    }
  }
}

/**
 * Remote Procedure Call handler function.
 * @callback RPCHandler
 * @param {WseConnection} conn - The connection that made the RPC call
 * @param {*} payload - The payload sent with the RPC call
 * @returns {Promise<*>|*} The result to send back to the client
 * @throws {WseError|Error} Errors are automatically caught and sent to client
 */

export class WseServer {
  /**
   * Authentication callback to validate client identity and assign user ID.
   *
   * @callback WseServer.identifyCallback
   * @param {*} params.identity - Original authentication data from client (JWT, ticket, credentials, etc.)
   * @param {Object} params.meta - Optional metadata from client (not used for auth validation)
   * @param {Function} params.accept - Call with resolved user ID to accept connection: accept(userId, welcomePayload)
   * @param {Function} params.refuse - Call to reject the connection
   * @param {Object} [params.challenge] - Challenge-response data (if CRA is enabled)
   * @param {*} params.challenge.quest - Challenge sent to client
   * @param {*} params.challenge.response - Client's response to challenge
   * @param {string} params.id - Unique connection ID
   *
   * @example
   * // Basic token authentication
   * function identify({ identity, accept, refuse, meta }) {
   *   if (identity === 'valid-token') {
   *     accept('user-123', { message: 'Welcome!' })  // user-123 becomes the cid
   *   } else {
   *     refuse()
   *   }
   * }
   *
   * // Database ticket authentication (like network.js example)
   * async function identify({ identity, accept, refuse }) {
   *   const ticket = await Ticket.find({ value: identity.ticket })
   *   if (ticket) {
   *     accept(ticket.account_id.toString())  // account_id becomes the cid
   *   } else {
   *     refuse()
   *   }
   * }
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
   * handler for client connection
   *
   * @callback WseServer.handleConnected
   * @param {WseConnection} conn presented by user
   */

  /**
   * handle for client join (first connection)
   *
   * @callback WseServer.handleJoined
   * @param {WseIdentity} identity user identiry
   * @param {*} meta of user identiry - anything thta could be used as a token
   */

  /**
   * handle ignored message on the channel
   *
   * @callback WseServer.handleIgnored
   * @param {WseConnection} conn
   * @param {String} type
   * @param {*} payload
   */

  /**
   * handle identiry left
   *
   * @callback WseServer.handleLeft
   * @param {WseIdentity} identity
   * @param {Number} code
   * @param {String|WSE_REASON} reason
   */

  /**
   * handle identiry disconnect
   *
   * @callback WseServer.handleDisconnected
   * @param {WseConnection} connection
   * @param {Number} code
   * @param {String|WSE_REASON} reason
   */

  /**
   * handle error
   *
   * @callback WseServer.handleError
   * @param {WseError} error
   * @param {WseConnection} connection
   */

  /**
   * WseServer class for managing authenticated WebSocket connections.
   *
   * @param {Object}    options see https://github.com/websockets/ws/#readme.
   *
   * @param {Function|WseServer.identifyCallback} options.identify Will be called for each new connection.
   * @param {Number}    [options.connPerUser=1] How many connections allowed per user
   * @param {Object}    [options.protocol=WseJSON] Overrides `wse_protocol` implementation. Use with caution.
   *
   * @example
   * ```javascript
   * // Basic authentication example
   * const server = new WseServer({
   *   port: 4200,
   *   identify: ({ identity, accept, refuse, meta }) => {
   *     // identity = original auth data from client.connect(identity, meta)
   *     // accept(cid) = resolved user ID that becomes client.cid
   *     if (identity === 'valid-token') {
   *       accept('user-123', { message: 'Welcome!' })  // 'user-123' becomes cid
   *     } else {
   *       refuse()
   *     }
   *   }
   * })
   *
   * // Database ticket authentication (like network.js example)
   * const server = new WseServer({
   *   identify: async ({ identity, accept, refuse }) => {
   *     const ticket = await Ticket.find({ value: identity.ticket })
   *     if (ticket) {
   *       accept(ticket.account_id.toString())  // account_id becomes cid
   *     } else {
   *       refuse()
   *     }
   *   }
   * })
   *
   * // Event handlers and RPC:
   * server.when.joined((client, meta) => {
   *   // client = WseIdentity (authenticated user)
   *   console.log(`User ${client.cid} joined with ${client.conns.size} devices`)
   * })
   *
   * server.when.connected((conn) => {
   *   // conn = WseConnection (single device)
   *   console.log(`Device ${conn.conn_id} connected for user ${conn.cid}`)
   * })
   *
   * server.register('getData', (conn, payload) => {
   *   // conn = WseConnection, conn.client = WseIdentity
   *   // conn.identity = original auth data (e.g., { ticket: 'abc123' })
   *   // conn.cid = resolved user ID (e.g., '507f1f77bcf86cd799439011')
   *   return { userId: conn.cid, authData: conn.identity }
   * })
   * ```
   *
   * and classic ws params...
   * @param {Number}    [options.backlog=511] The maximum length of the queue of pending connections
   * @param {Boolean}   [options.clientTracking=true] Specifies whether or not to track clients
   * @param {String}    [options.host] The hostname where to bind the server
   * @param {Number}    [options.maxPayload=104857600] The maximum allowed message size
   * @param {Boolean}   [options.noServer=false] Enable no server mode
   * @param {String}    [options.path] Accept only connections matching this path
   * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable permessage-deflate
   * @param {Number}    [options.port] The port where to bind the server
   * @param {import('http').Server|import('https').Server|Object} [options.server] A pre-created HTTP/S server to use
   * @param {Boolean}   [options.skipUTF8Validation=false] Specifies whether or not to skip UTF-8 validation for text and close messages
   * @param {Function}  [options.verifyClient] A hook to reject connections
   */
  constructor({ protocol = undefined, identify, connPerUser = 1, tO = 20, ...options }) {
    if (!identify) throw new WseError(WSE_ERROR.IDENTIFY_HANDLER_MISSING)

    /** @type {Map<string, WseIdentity>} Map of authenticated users (cid -> client) */
    this.clients = new Map()
    this.protocol = protocol || new WseJSON()
    this.identify = identify
    this.connPerUser = connPerUser
    this.tO = tO

    this.ws = null
    this.channel = new EventEmitter()

    this.joined = new Signal()
    this.left = new Signal()
    this.connected = new Signal()
    this.disconnected = new Signal()
    this.ignored = new Signal()
    this.error = new Signal()

    this._rpcManager = new RpcManager()

    /**
     * Callback for handling when a new client (user) joins.
     * @callback JoinedCallback
     * @param {WseIdentity} client - The authenticated user identity
     * @param {Object} meta - Additional metadata provided during connection
     */

    /**
     * Callback for handling when a connection (device) connects.
     * @callback ConnectedCallback
     * @param {WseConnection} conn - The established connection instance
     */

    /**
     * Callback for handling when a client (user) leaves.
     * @callback LeftCallback
     * @param {WseIdentity} client - The user identity that left
     * @param {number} code - WebSocket close code
     * @param {string} reason - Close reason description
     */

    /**
     * Callback for handling when a connection (device) closes.
     * @callback DisconnectedCallback
     * @param {WseConnection} conn - The connection that was closed
     * @param {number} code - WebSocket close code
     * @param {string} reason - Close reason description
     */

    /**
     * Callback for handling unhandled messages.
     * @callback IgnoredCallback
     * @param {WseConnection} conn - The connection that sent the message
     * @param {string} type - Message type identifier
     * @param {*} payload - Message payload data
     */

    /**
     * Callback for handling errors.
     * @callback ErrorCallback
     * @param {WseError} error - Error instance with details
     * @param {WseConnection} conn - Connection where error occurred
     */

    /**
     * Collection of signal binding functions extracted from their respective signals.
     * Each property is a function that binds handlers to specific events.
     *
     * Event Types:
     * - joined/left: User-level events (client = WseIdentity)
     * - connected/disconnected: Connection-level events (conn = WseConnection)
     *
     * @type {{
     *   joined: function(JoinedCallback): void,
     *   connected: function(ConnectedCallback): void,
     *   left: function(LeftCallback): void,
     *   disconnected: function(DisconnectedCallback): void,
     *   ignored: function(IgnoredCallback): void,
     *   error: function(ErrorCallback): void
     * }}
     */
    this.when = {
      joined: this.joined.extractOn(),
      connected: this.connected.extractOn(),
      left: this.left.extractOn(),
      disconnected: this.disconnected.extractOn(),
      ignored: this.ignored.extractOn(),
      error: this.error.extractOn(),
    }

    /**
     * @type {function}
     * @private
     */
    this._cra_generator = null

    this.ws = new WebSocketServer({ ...options, handleProtocols: _ => this.protocol.name })

    this._listen()
  }

  /**
   * Add listeners to the WS.
   * @private
   */
  _listen() {
    this.ws.on('connection', (ws_conn, req) => {
      const conn = new WseConnection(ws_conn, this)

      this._handle_connection(conn, req)

      conn.ws_conn.on('message', message => {
        if (conn.valid_stat === CLIENT_VALIDATING) return

        let type
        let payload
        let stamp

        try {
          ;[type, payload, stamp] = this.protocol.unpack(message)

          switch (conn.valid_stat) {
            case CLIENT_VALID:
              if (stamp) {
                return this._handle_valid_call(conn, type, payload, stamp)
              } else if (type) {
                return this._handle_valid_message(conn, type, payload)
              } else {
                throw new WseError(WSE_ERROR.PROTOCOL_VIOLATION, { type, payload, stamp })
              }

            case CLIENT_STRANGER:
            case CLIENT_CHALLENGED:
              return this._handle_stranger_message(conn, type, payload)
          }
        } catch (err) {
          const error = err.type !== 'wse-error' ? new WseError(WSE_ERROR.MESSAGE_PROCESSING_ERROR, { raw: err }) : err
          error.message_from = conn.cid ? `${conn.cid}#${conn.conn_id}` : 'stranger'
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
          client._conn_drop(conn.conn_id, reason)
        } else {
          this.disconnected.emit(conn, code, String(reason))
        }
      })

      conn.ws_conn.onerror = e => this.error.emit(new WseError(WSE_ERROR.CONNECTION_ERROR, { raw: e }), conn)
    })
  }

  /**
   * Generate challenge for connected user.
   * @param {WseServer.CraGenerator} cra_generator
   */
  useChallenge(cra_generator) {
    if (typeof cra_generator === 'function') {
      this._cra_generator = cra_generator
    } else {
      throw new WseError(WSE_ERROR.INVALID_CRA_GENERATOR)
    }
  }

  /**
   * Handle incoming connection.
   * @param {WseConnection} conn
   * @param {import('http').Request} req
   * @returns void
   * @private
   */
  _handle_connection(conn, req) {
    if (conn.ws_conn.protocol !== this.protocol.name) {
      conn.ws_conn.close(1000, WSE_REASON.PROTOCOL_ERR)
      return
    }

    // RESOLVING IPV4 REMOTE ADDR
    conn.remote_addr = req.headers['x-forwarded-for'] || req.connection.remoteAddress || ''
  }

  /**
   * Handle valid message from the client.
   * @param {WseConnection} conn
   * @param {String} type
   * @param {*} payload
   * @private
   */
  _handle_valid_message(conn, type, payload) {
    this.channel.emit(type, conn, payload) || this.ignored.emit(conn, type, payload)
  }

  /**
   * Handle valid RP call from the client.
   * @param {WseConnection} conn
   * @param {String} type
   * @param {*} payload
   * @param {String} stamp
   * @private
   */
  _handle_valid_call(conn, type, payload, stamp) {
    // Handle RPC responses - direct callback execution
    if (type === this.protocol.internal_types.response) {
      if (this._rpcManager.handleResponse(stamp, payload, true)) return
    }
    if (type === this.protocol.internal_types.response_error) {
      if (this._rpcManager.handleResponse(stamp, payload, false)) return
    }

    // Handle incoming RPC calls
    if (!this._rpcManager.has(type)) {
      conn.ws_conn.send(
        this.protocol.pack({
          type: this.protocol.internal_types.response_error,
          payload: { code: WSE_ERROR.RP_NOT_REGISTERED },
          stamp: stamp,
        })
      )

      return
    }

    const procedure = this._rpcManager.get(type)

    const rp_wrap = async () => {
      const result = await procedure(conn, payload)
      conn.ws_conn.send(
        this.protocol.pack({
          type: this.protocol.internal_types.response,
          payload: result,
          stamp: stamp,
        })
      )
    }

    rp_wrap().catch(err => {
      const errorPayload = RpcManager.normalizeError(err)

      conn.ws_conn.send(
        this.protocol.pack({
          type: this.protocol.internal_types.response_error,
          payload: errorPayload,
          stamp: stamp,
        })
      )

      this.error.emit(
        new WseError(WSE_ERROR.RP_EXECUTION_FAILED, {
          type,
          payload,
          stamp,
          cid: conn.cid,
          conn_id: conn.conn_id,
          err,
        }),
        conn
      )
    })
  }

  /**
   * Register remote procedure. Value returned from the handler will be sent to requester.
   * @param {string} rp - Remote procedure name
   * @param {RPCHandler} handler - Function to handle RPC calls
   * @example
   * // Basic RPC
   * server.register('add', (conn, payload) => {
   *   return payload.a + payload.b
   * })
   *
   * // Async RPC with connection access
   * server.register('getUserData', async (conn, payload) => {
   *   const userData = await database.getUser(conn.cid)
   *   conn.send('notification', { message: 'Data retrieved' })
   *   return userData
   * })
   *
   * // RPC with error handling
   * server.register('deleteUser', (conn, payload) => {
   *   if (!payload.userId) {
   *     throw new WseError('INVALID_USER_ID', { provided: payload.userId })
   *   }
   *   return { deleted: true }
   * })
   */
  register(rp, handler) {
    this._rpcManager.register(rp, handler)
  }

  /**
   * Unregister existing RP.
   * @param {String} rp RP name
   */
  unregister(rp) {
    this._rpcManager.unregister(rp)
  }

  /**
   * Handle message from the client-stranger.
   * @param {WseConnection} conn
   * @param {String} type
   * @param {*} payload
   * @private
   */
  _handle_stranger_message(conn, type, payload) {
    if (conn.valid_stat === CLIENT_STRANGER) {
      if (type === this.protocol.internal_types.hi) {
        conn.valid_stat = CLIENT_VALIDATING
        conn.identity = payload.identity

        Object.assign(conn.meta, payload.meta || {})

        if (typeof this._cra_generator === 'function') {
          this._cra_generator(
            conn.identity,
            conn.meta,
            quest => {
              conn.challenge_quest = quest
              conn.send(this.protocol.internal_types.challenge, quest)
              conn.valid_stat = CLIENT_CHALLENGED
            },
            () => this._refuse_connection(conn)
          )
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

    const accept = (cid, welcome_payload) => {
      this._identify_connection(conn, cid, welcome_payload, payload)
    }

    const refuse = () => {
      this._refuse_connection(conn)
    }

    this.identify({
      identity: conn.identity,
      meta: conn.meta,
      accept,
      refuse,
      challenge:
        typeof this._cra_generator === 'function'
          ? { quest: conn.challenge_quest, response: conn.challenge_response }
          : null,
      id: conn.conn_id,
    })
  }

  _refuse_connection(conn) {
    conn.ws_conn.close(1000, WSE_REASON.NOT_AUTHORIZED)
  }

  /**
   * Handle valid RP call from the client.
   * @param {WseConnection} conn
   * @param {String} cid Resolved user identifier.
   * @param {*} welcome_payload Payload from the server.
   * @param {*} payload Client's payload
   * @private
   */
  _identify_connection(conn, cid, welcome_payload, payload) {
    if (!cid) this._refuse_connection(conn)

    let wasNewIdentity = false

    let client = this.clients.get(cid)

    if (!client) {
      wasNewIdentity = true
      client = new WseIdentity(
        {
          meta: conn.meta,
          cid,
        },
        this
      )
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
  broadcast(type, payload) {
    for (const client of this.clients.values()) {
      client.send(type, payload)
    }
  }

  /**
   * Drop client with specific ID.
   * @param {String} id client ID
   * @param {WSE_REASON|String|Buffer} [reason] WSE_REASON
   */
  dropClient(id, reason = WSE_REASON.NO_REASON) {
    if (!this.clients.has(id)) return

    const client = this.clients.get(id)

    if (client.conns.size) client.drop(reason)
    this.left.emit(client, 1000, String(reason))

    this.clients.delete(client.cid)
  }

  /**
   * Send message to the client by Id.
   * @param {String} cid Client ID
   * @param {String} type message type
   * @param {*} [payload] optional payload
   */
  send(cid, type, payload) {
    const client = this.clients.get(cid)
    if (client) {
      client.send(type, payload)
    }
  }
}

export class WseIdentity {
  /**
   * Represents a validated user identity that can have multiple connections (devices).
   * This is created after successful authentication and holds the resolved client ID.
   *
   * Architecture:
   * - client = WseIdentity (this class - represents an authenticated user)
   * - client.conns = Map of WseConnection (user's devices/connections)
   * - conn.client = WseIdentity (back-reference to this user)
   *
   * Note: Original authentication data (tokens, etc.) is available on individual
   * connections via `conn.identity`, not stored here.
   *
   * @param {Object} params - Identity parameters
   * @param {string} params.cid - Resolved client identifier (e.g., user ID, account ID)
   * @param {Object} [params.meta={}] - Additional metadata from connection
   * @param {WseServer} server - WSE server instance
   */
  constructor({ cid, meta = {} }, server) {
    /** @type {string} Client identifier */
    this.cid = cid

    /** @type {Map<string, WseConnection>} Active connections for this user (devices) */
    this.conns = new Map()

    /** @type {Object} Additional metadata */
    this.meta = meta

    /** @type {WseServer} Parent server instance */
    Object.defineProperty(this, 'server', { enumerable: false, value: server })
  }

  /**
   * Add connection to the identity.
   * @param {WseConnection} conn
   * @returns {WseIdentity}
   * @private
   */
  _conn_add(conn) {
    conn._identify_as(this)

    this.conns.set(conn.conn_id, conn)
    if (this.server.connPerUser < this.conns.size) {
      const key_to_delete = this.conns[Symbol.iterator]().next().value[0]
      this._conn_drop(key_to_delete, WSE_REASON.CLIENTS_CONCURRENCY)
    }
    return this
  }

  /**
   * Drop connection by it's ID.
   * @param {String} id
   * @param {WSE_REASON|String} [reason]
   * @private
   */
  _conn_drop(id, reason = WSE_REASON.NO_REASON) {
    const conn = this.conns.get(id)

    if (!conn) throw new WseError(WSE_ERROR.NO_CLIENT_CONNECTION, { id })

    conn.ws_conn.removeAllListeners()

    if (conn.readyState === WebSocket.CONNECTING || conn.readyState === WebSocket.OPEN) {
      conn.ws_conn.close(1000, reason)
    }

    this.conns.delete(id)

    this.server.disconnected.emit(conn, 1000, String(reason))

    if (this.conns.size === 0) {
      this.server.dropClient(this.cid, reason)
    }
  }

  /**
   * Send a message to all connections of this user (all their devices).
   * @param {string} type - Message type identifier
   * @param {*} [payload] - Message payload data
   * @example
   * // Send to all user's devices
   * server.when.joined((client, meta) => {
   *   // client = WseIdentity, client.conns = Map of WseConnection
   *   client.send('welcome', { message: 'Hello from all devices!' })
   * })
   */
  send(type, payload) {
    for (const conn of this.conns.values()) {
      if (conn.readyState !== WebSocket.OPEN) continue
      conn.send(type, payload)
    }
  }

  /**
   * Drop all connections for this client identity.
   * @param {WSE_REASON|string} [reason] - Reason for dropping connections
   */
  drop(reason = WSE_REASON.NO_REASON) {
    for (const key of this.conns.keys()) {
      this._conn_drop(key, reason)
    }
  }
}
