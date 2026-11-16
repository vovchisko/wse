# WseServer

Main server class for managing WebSocket connections.

## Constructor

### new WseServer(options)

- `options.identify` - Authentication handler (function, required)
- `options.connPerUser` - Max connections per user (number, default: 1)
- `options.tO` - RPC timeout and auth deadline in milliseconds, 0 disables both (number, default: 20000).
  `Infinity` and anything above 2^31-1 disable it too; a negative, `NaN` or non-number value throws `INVALID_TIMEOUT`
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

RPC timeout and auth deadline in milliseconds (number)

## Methods

### server.cork() / server.uncork()

Queue every frame sent to any socket (messages, broadcasts, RPC calls and answers) until `uncork()`; then each socket
gets its queue in order, joined into as few frames as the protocol allows - see
[Joined Frames](wse.protocol.md#joined-frames). Calls nest: the outermost `uncork()` writes. Dropping a connection
writes its queue first.

```javascript
server.cork()
for (const conn of players) conn.send('state', stateOf(conn))
server.broadcast('tick', tick)
server.uncork()
```

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

### server.link(port, options)

Link a [WseGate](wse.gate.md) on the other end of a `MessagePort` (WseLink)

### server.forward(cid, link, meta)

Route the client's unhandled messages and calls to a gate; the gate admits it with `meta`

### server.unforward(cid, reason)

Take the client out of its gate

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
