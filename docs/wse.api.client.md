# WseClient

Client class for connecting to WSE servers with automatic reconnection.

## Constructor

### new WseClient(options)

- `options.url` - WebSocket endpoint (string, required)
- `options.re` - Enable auto-reconnection (boolean, default: false)
- `options.tO` - RPC timeout in seconds (number, default: 20)
- `options.protocol` - Message protocol (object, default: WseJSON)

## Properties

### client.channel

EventEmitter for incoming messages from server

### client.status

Current connection status ([WSE_STATUS](./wse.api.constants.md))

### client.url

Current WebSocket endpoint URL (string)

## Methods

### client.connect(identity, meta)

Connect and authenticate with server (Promise)

- `identity` - Authentication data (any)
- `meta` - Connection metadata (object, optional)

### client.jump(newUrl, identity, meta)

Switch to different server endpoint (Promise). Closes current connection with code 4000.

- `newUrl` - New WebSocket endpoint (string)
- `identity` - Authentication data (any, optional)
- `meta` - Connection metadata (object, optional)

### client.close(reason)

Close connection

- `reason` - Close reason ([WSE_REASON](wse.api.constants.md), optional, default: BY_CLIENT)

### client.send(type, payload)

Send fire-and-forget message to server, see [Messaging docs](wse.messaging.md)

- `type` - Message type (string)
- `payload` - Message data (any)

### client.call(rp, payload)

Call server RPC and wait for response (Promise), see [RPC docs](wse.rpc.md)

- `rp` - RPC name (string)
- `payload` - RPC data (any)

### client.register(rp, handler)

Register RPC that server can call, see [Server→Client RPC](wse.rpc.server-client.md)

- `rp` - RPC name (string)
- `handler` - RPC handler function

### client.unregister(rp)

Remove RPC registration

- `rp` - RPC name (string)

### client.challenge(handler)

Set challenge-response handler, see [CRA docs](wse.auth.cra.md)

- `handler` - Challenge handler function

## Events

### client.when.ready((welcomeData) => {})

Connected and authenticated

- `welcomeData` - Welcome payload from server (any)

### client.when.closed((code, reason) => {})

Connection closed

- `code` - WebSocket close code (number)
- `reason` - Close reason ([WSE_REASON](wse.api.constants.md))

### client.when.error((error) => {})

Error occurred, see [Constants](wse.api.constants.md) and [Error API](wse.api.error.md)

- `error` - WseError object

### client.when.updated((status) => {})

Connection status changed

- `status` - New status ([WSE_STATUS](wse.api.constants.md))

### client.when.ignored((type, payload, stamp) => {})

Unhandled message received

- `type` - Message type (string)
- `payload` - Message data (any)
- `stamp` - Message stamp (string, optional)
