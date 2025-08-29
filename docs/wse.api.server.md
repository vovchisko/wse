# WseServer

Main server class for managing WebSocket connections.

## Constructor

### new WseServer(options)

- `options.identify` - Authentication handler (function, required)
- `options.connPerUser` - Max connections per user (number, default: 1)
- `options.tO` - RPC timeout in seconds (number, default: 20)
- `options.protocol` - Message protocol (object, default: WseJSON)
- `...options` - All other options passed to WebSocketServer (port, host, etc.)

## Properties

### server.clients

Map of all connected users (Map<string, [WseIdentity](wse.api.server.identity.md)>)

### server.channel

EventEmitter for user messages

### server.protocol

Message protocol handler

### server.connPerUser

Max connections per user (number)

### server.tO

RPC timeout in seconds (number)

## Methods

### server.broadcast(type, payload)

Send message to all connected users

- `type` - Message type (string)
- `payload` - Message data (any)

### server.send(cid, type, payload)

Send message to specific user (all their devices)

- `cid` - User ID (string)
- `type` - Message type (string)
- `payload` - Message data (any)

### server.register(rp, handler)

Register RPC procedure, see [RPC docs](wse.rpc.md)

- `rp` - RPC name (string)
- `handler` - RPC handler (function)

### server.unregister(rp)

Remove RPC procedure

- `rp` - RPC name (string)

### server.dropClient(cid, reason)

Disconnect user (all their devices)

- `cid` - User ID (string)
- `reason` - Close reason ([WSE_REASON](wse.api.constants.md), optional)

### server.useChallenge(generator)

Enable challenge-response auth, see [CRA docs](wse.auth.cra.md)

- `generator` - Challenge generator function

## Events

### server.when.joined((client, meta) => {})

New user authenticated

- `client` - [WseIdentity](wse.api.server.identity.md)
- `meta` - Connection metadata (object)

### server.when.left((client, code, reason) => {})

User disconnected (all devices)

- `client` - [WseIdentity](wse.api.server.identity.md)
- `code` - WebSocket close code (number)
- `reason` - Close reason ([WSE_REASON](wse.api.constants.md))

### server.when.connected((conn) => {})

New device connected

- `conn` - [WseConnection](wse.api.server.connection.md)

### server.when.disconnected((conn, code, reason) => {})

Device disconnected

- `conn` - [WseConnection](wse.api.server.connection.md)
- `code` - WebSocket close code (number)
- `reason` - Close reason ([WSE_REASON](wse.api.constants.md))

### server.when.error((error, conn) => {})

Error occurred, see [Constants](wse.api.constants.md) and [Error API](wse.api.error.md)

- `error` - [WseError](wse.api.error.md) object
- `conn` - [WseConnection](wse.api.server.connection.md) (optional)

### server.when.ignored((conn, type, payload) => {})

Unhandled message received

- `conn` - [WseConnection](wse.api.server.connection.md)
- `type` - Message type (string)
- `payload` - Message data (any)
