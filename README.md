# WSE - WebSocket Everywhere!

[![npm version](https://badge.fury.io/js/wse.svg)](https://badge.fury.io/js/wse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made in Ukraine](https://img.shields.io/badge/Made%20in%20Ukraine-❤️-0057B7?style=flat&labelColor=005BBB&color=FFD700)](https://x.com/sternenkofund)

Oe "WebSocket Enhancement", if you wish.
A lightweight WebSocket wrapper with authentication, RPC support, and multi-device messaging.


## Features

- **Any Authentication** - Challenge-response, anonymous, or token-based auth with secure handshake
- **Cozy Messaging** - Simple send/receive with EventEmitter pattern and message broadcasting
- **Per-user Connection Management** - Multiple devices per user with fine-grained message routing
- **Auto-Reconnection** - Seamless reconnection with RPC state preservation and exponential backoff
- **Custom Protocols** - Extensible message protocol system for specialized use cases

## Quick Start

### Installation

```bash
npm install wse
```

### Basic Server

```javascript
import { WseServer } from 'wse'

// Simple authentication - accept everyone
function identify({ accept }) {
  accept('user-' + Date.now())
}

const server = new WseServer({ port: 4200, identify })

// Handle messages
server.channel.on('chat', (conn, message) => {
  console.log(`${conn.cid} says:`, message)
  server.broadcast('chat', { user: conn.cid, message })
})

console.log('Server running on ws://localhost:4200')
```

### Basic Client

```javascript
import { WseClient } from 'wse'

const client = new WseClient({ url: 'ws://localhost:4200', re: true })

// Connectnote  
// NOTE: if "re:true" - conect will be only resolved after first successful connection.
await client.connect()

// and send message
client.send('chat', 'Hello everyone!')

// Listen for messages
client.channel.on('chat', ({ user, message }) => {
  console.log(`${ user }: ${ message }`)
})

// Jump to different server (e.g., different game level)
await client.jump('ws://level2.game.com:4200')
```

## API Reference

### Server

- **`server.clients`** - Map of all connected users (cid → WseIdentity)
- **`server.channel`** - EventEmitter for user messages
- **`server.protocol`** - Message protocol handler
- **`server.connPerUser`** - Max connections per user
- **`server.tO`** - RPC timeout in seconds
- **`server.broadcast(type, payload)`** - Send to all connected users
- **`server.send(cid, type, payload)`** - Send to specific user (all devices)
- **`server.register(rp, handler)`** - Register RPC procedure
- **`server.unregister(rp)`** - Remove RPC procedure
- **`server.dropClient(cid, reason)`** - Disconnect user
- **`server.useChallenge(generator)`** - Enable challenge-response auth
- **`server.when.joined(client, meta)`** - New user authenticated
- **`server.when.left(client, code, reason)`** - User disconnected
- **`server.when.connected(conn)`** - New device connected
- **`server.when.disconnected(conn, code, reason)`** - Device disconnected
- **`server.when.error(error, conn)`** - Error occurred
- **`server.when.ignored(conn, type, payload)`** - Unhandled message

### Client (WseIdentity)

- **`client.cid`** - User identifier
- **`client.conns`** - Map of user's connections (conn_id → WseConnection)
- **`client.meta`** - Client-sent metadata from FIRST connection
- **`client.send(type, payload)`** - Send to all user's devices
- **`client.drop(reason)`** - Disconnect all user's devices

### Connection (WseConnection)

- **`conn.cid`** - User identifier (same as conn.client.cid)
- **`conn.conn_id`** - Unique connection identifier
- **`conn.identity`** - Original auth data (tokens, etc.)
- **`conn.meta`** - Client-sent metadata from THIS connection
- **`conn.client`** - Reference to WseIdentity
- **`conn.remote_addr`** - Client IP address
- **`conn.send(type, payload)`** - Send to this device only
- **`conn.call(rp, payload)`** - Call RPC on this client
- **`conn.drop(reason)`** - Disconnect this device

### WSE Client

- **`client.channel`** - EventEmitter for messages
- **`client.status`** - Connection status (WSE_STATUS)
- **`client.cid`** - User ID (after connection)
- **`client.connect(identity, meta)`** - Connect and authenticate
- **`client.jump(newUrl, identity, meta)`** - Switch to different server endpoint
- **`client.send(type, payload)`** - Send message to server
- **`client.call(rp, payload)`** - Call server RPC
- **`client.register(rp, handler)`** - Register client RPC
- **`client.unregister(rp)`** - Remove client RPC
- **`client.challenge(handler)`** - Set challenge-response handler
- **`client.disconnect()`** - Close connection
- **`client.when.ready(welcomeData)`** - Connected and authenticated
- **`client.when.closed(code, reason)`** - Connection closed
- **`client.when.error(error)`** - Error occurred
- **`client.when.updated(status)`** - Status changed

### Constants

- **WSE_STATUS** - IDLE, CONNECTING, RE_CONNECTING, READY, OFFLINE
- **WSE_ERROR** - CONNECTION_NOT_READY, RP_TIMEOUT, RP_NOT_REGISTERED, RP_EXECUTION_FAILED, RP_DISCONNECT
- **WSE_REASON** - BY_CLIENT, BY_SERVER, NOT_AUTHORIZED, PROTOCOL_ERR, CLIENTS_CONCURRENCY

## Documentation

- **[Auth](docs/auth.md)** - Anonymous, login/password, and token-based auth
- **[RPC](docs/rpc.md)** - Bidirectional procedure calls
- **[Broadcast](docs/broadcast.md)** - Broadcasting and multi-device messaging
- **[Errors](docs/errors.md)** - Error codes and recovery patterns
- **[HTTP](docs/http.md)** - Integrate with Express/HTTP servers
- **[Protocol](docs/protocol.md)** - Implement custom message protocols

---

Russian warship - go fuck yourself! 🖕
