# WSE (WebSocket Enhancement)

A WebSocket wrapper focused on managing authenticated users across multiple devices. WSE makes it easy to:
- Handle multiple connections from the same user (e.g., mobile + desktop)
- Implement authentication with built-in Challenge-Response system
- Create custom WebSocket protocols with minimal boilerplate
- Manage client identity and state across reconnections

[![npm version](https://badge.fury.io/js/wse.svg)](https://badge.fury.io/js/wse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Installation

```bash
npm install wse
```

## Quick Start

### Server Setup

```javascript
import { WseServer } from 'wse'

// Authentication handler
function identify({ identity, meta, accept, refuse }) {
  // Simple auth example
  if (identity === 'your-secret-key') {
    const clientId = 'user-123'
    accept(clientId, { message: 'Welcome!' })
  } else {
    refuse()
  }
}

// Create server instance
const server = new WseServer({ 
  port: 4200, 
  identify,
  connPerUser: 2  // Allow 2 connections per user
})

// Handle incoming messages
server.channel.on('hello', (conn, data) => {
  console.log(`Message from ${conn.cid}:`, data)
  conn.send('welcome', { message: 'Hello back!' })
})

// Broadcast to all connected clients
server.broadcast('announcement', { message: 'Server is ready!' })

// Register Remote Procedure
server.register('add', async (conn, { a, b }) => {
  return a + b
})

// Handle events
server.when.joined((client, meta) => {
  console.log(`Client ${client.cid} joined with meta:`, meta)
})

server.when.error((error, conn) => {
  console.error(`Error from ${conn?.cid}:`, error)
})
```

### Client Setup

```javascript
import { WseClient, WSE_ERROR } from 'wse'

const client = new WseClient({ 
  url: 'ws://localhost:4200',
  tO: 30,  // 30 seconds timeout for RPC calls
  re: true // Enable auto-reconnect
})

// Connect with authentication
try {
  const welcomeData = await client.connect('your-secret-key', { 
    clientData: 'optional metadata' 
  })
  console.log('Connected with welcome data:', welcomeData)
} catch (error) {
  console.error('Connection failed:', error)
}

// Listen for server messages
client.channel.on('welcome', (data) => {
  console.log('Server says:', data.message)
})

// Send messages
client.send('hello', { message: 'Hello server!' })

// Make RPC calls
try {
  const result = await client.call('add', { a: 5, b: 3 })
  console.log('5 + 3 =', result) // Output: 8
} catch (error) {
  if (error.code === WSE_ERROR.RP_TIMEOUT) {
    console.error('RPC call timed out')
  } else if (error.code === WSE_ERROR.RP_NOT_REGISTERED) {
    console.error('RPC not found on server')
  } else {
    console.error('RPC failed:', error)
  }
}

// Handle connection events
client.when.ready((welcomeData) => {
  console.log('Connected and authenticated!', welcomeData)
})

client.when.error((error) => {
  console.error('Connection error:', error)
})

client.when.closed((code, reason) => {
  console.log(`Connection closed: ${code} - ${reason}`)
})
```

## Advanced Features

### Challenge-Response Authentication (CRA)

Challenge-Response Authentication provides a secure way to authenticate clients without sending passwords directly. Here's how it works:

1. Client initiates connection with identity info
2. Server generates a unique challenge
3. Client receives challenge and computes response using a secret
4. Server validates the response
5. If valid, connection is authenticated

Example implementation:

```javascript
// Server setup
server.useChallenge((identity, meta, quest, refuse) => {
  // Generate a unique challenge
  const challenge = {
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex')
  }
  
  if (!isValidUser(identity)) {
    refuse()
    return
  }
  
  quest(challenge)
})

// Server identity handler
function identify({ identity, meta, challenge, accept, refuse }) {
  if (!challenge) {
    refuse()
    return
  }

  const { quest, response } = challenge
  
  // Validate response
  const expectedResponse = crypto
    .createHmac('sha256', getClientSecret(identity))
    .update(quest.timestamp + quest.nonce)
    .digest('hex')
    
  if (response === expectedResponse) {
    accept(identity, { message: 'Welcome!' })
  } else {
    refuse()
  }
}

// Client setup
client.challenge((quest, solve) => {
  // Compute response using HMAC
  const response = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(quest.timestamp + quest.nonce)
    .digest('hex')
  
  solve(response)
})
```

### Integration with Existing HTTP Servers

#### Express Integration

```javascript
import express from 'express'
import { createServer } from 'http'
import { WseServer, WSE_ERROR } from 'wse'

const app = express()
const httpServer = createServer(app)

// Create WSE server with noServer option
const wseServer = new WseServer({ 
  noServer: true,  // Important: let Express handle the HTTP server
  identify: yourIdentifyHandler
})

// Handle HTTP routes
app.get('/', (req, res) => {
  res.send('Express server with WSE')
})

// Handle WebSocket upgrade
httpServer.on('upgrade', (request, socket, head) => {
  // You can filter by path or add custom validation
  if (request.url === '/ws') {
    try {
      wseServer.ws.handleUpgrade(request, socket, head, (ws) => {
        wseServer.ws.emit('connection', ws, request)
      })
    } catch (error) {
      console.error('Upgrade failed:', error)
      socket.destroy()
    }
  } else {
    socket.destroy()
  }
})

// Error handling
wseServer.when.error((error, conn) => {
  console.error(`WebSocket error: ${error.code}`, error.details)
  if (conn) {
    conn.send('error', { message: 'Internal server error' })
  }
})

// Start server
httpServer.listen(3000, () => {
  console.log('Server running on port 3000')
})
```

#### Fastify Integration

```javascript
import Fastify from 'fastify'
import { WseServer, WSE_ERROR } from 'wse'

const fastify = Fastify()
const wseServer = new WseServer({ 
  noServer: true,
  identify: yourIdentifyHandler
})

// Handle HTTP routes
fastify.get('/', async (request, reply) => {
  return { hello: 'world' }
})

// Handle WebSocket upgrade
fastify.server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    try {
      wseServer.ws.handleUpgrade(request, socket, head, (ws) => {
        wseServer.ws.emit('connection', ws, request)
      })
    } catch (error) {
      console.error('Upgrade failed:', error)
      socket.destroy()
    }
  } else {
    socket.destroy()
  }
})

// Error handling
wseServer.when.error((error, conn) => {
  console.error(`WebSocket error: ${error.code}`, error.details)
})

// Start server
fastify.listen({ port: 3000 }, (err) => {
  if (err) throw err
  console.log('Server running on port 3000')
})
```

### Custom Protocol

```javascript
class CustomProtocol {
  constructor() {
    // Protocol name used in WebSocket handshake
    this.name = 'custom-protocol'
    
    // Required internal message types
    this.internal_types = Object.freeze({
      hi: '~wse:hi',         // Initial client greeting
      challenge: '~wse:challenge', // CRA challenge/response
      welcome: '~wse:welcome',     // Server welcome after auth
      call: '~wse:call',          // RPC marker
    })
  }

  // Pack message into [type, payload, stamp] format
  pack({ type, payload = undefined, stamp = undefined }) {
    return JSON.stringify([type, payload, stamp])
  }

  // Unpack message, returns [type, payload, stamp]
  unpack(encoded) {
    return JSON.parse(encoded)
  }
}

// Use custom protocol in server
const server = new WseServer({ 
  port: 4200, 
  identify,
  protocol: new CustomProtocol()
})

// Use same protocol in client
const client = new WseClient({
  url: 'ws://localhost:4200',
  protocol: new CustomProtocol()
})
```


## Error Handling

WSE provides specific error types for different scenarios:

```javascript
import { WseClient, WSE_ERROR, WSE_REASON } from 'wse'

// Client-side error handling
client.when.error((error) => {
  switch (error.code) {
    case WSE_ERROR.CONNECTION_NOT_READY:
      console.error('Connection not established')
      break
    case WSE_ERROR.RP_TIMEOUT:
      console.error('Remote procedure call timed out')
      break
    case WSE_ERROR.RP_NOT_REGISTERED:
      console.error('Remote procedure not found')
      break
    case WSE_ERROR.RP_EXECUTION_FAILED:
      console.error('Remote procedure failed:', error.details)
      break
    case WSE_ERROR.WS_CLIENT_ERROR:
      console.error('WebSocket error:', error.details)
      break
  }
})

// Server-side error handling
server.when.error((error, conn) => {
  switch (error.code) {
    case WSE_ERROR.MESSAGE_PROCESSING_ERROR:
      console.error(`Invalid message from ${conn.cid}:`, error.details)
      break
    case WSE_ERROR.PROTOCOL_VIOLATION:
      console.error(`Protocol violation from ${conn.cid}:`, error.details)
      break
    case WSE_ERROR.CONNECTION_ERROR:
      console.error('WebSocket connection error:', error.details)
      break
    case WSE_ERROR.RP_EXECUTION_FAILED:
      console.error('RPC execution failed:', error.details)
      break
  }
})

// Connection closure handling
client.when.closed((code, reason) => {
  switch (reason) {
    case WSE_REASON.NOT_AUTHORIZED:
      console.log('Authentication failed')
      break
    case WSE_REASON.PROTOCOL_ERR:
      console.log('Protocol error')
      break
    case WSE_REASON.CLIENTS_CONCURRENCY:
      console.log('Too many connections')
      break
    case WSE_REASON.BY_CLIENT:
      console.log('Client closed connection')
      break
    case WSE_REASON.BY_SERVER:
      console.log('Server closed connection')
      break
  }
})
```

## Performance Optimization

`wse` uses `ws` under the hood, which supports optional binary addons for better performance:

```bash
# Efficient frame masking/unmasking
npm install --save-optional bufferutil

# Fast UTF-8 validation
npm install --save-optional utf-8-validate

```


## Broadcasting Messages

WSE provides several ways to broadcast messages:

```javascript
// Send to ALL connected clients
server.broadcast('announcement', { message: 'Server maintenance in 5 minutes' })

// Send to specific client (all their connections)
server.send(clientId, 'personal-message', { message: 'Just for you' })

// Send to current connection only
connection.send('connection-specific', { message: 'Just for this device' })

// Example: Broadcast to everyone except sender
server.channel.on('chat-message', (conn, message) => {
  for (const client of server.clients.values()) {
    if (client.cid !== conn.cid) {
      client.send('chat-message', message)
    }
  }
})

// Example: Handle broadcast messages on client
client.channel.on('announcement', (payload) => {
  console.log('Server announcement:', payload.message)
})
```

### Multi-Device Messaging

When a user is connected from multiple devices (controlled by `connPerUser`):

```javascript
// Server setup
const server = new WseServer({ 
  identify,
  connPerUser: 2  // Allow 2 connections per user
})

// Send to ALL connections of a specific user
server.send(userId, 'sync-data', { updated: true })

// Send to SPECIFIC connection only
server.channel.on('device-settings', (conn, settings) => {
  // conn.send() only sends to that specific connection
  conn.send('settings-updated', { confirmed: true })
})

// Track connections per user
server.when.connected((conn) => {
  console.log(`New connection for user ${conn.cid}`)
  console.log(`Total connections: ${server.clients.get(conn.cid).conns.size}`)
})
```

These modules are binary addons that improve certain operations. Read more about performance optimization in the [ws documentation](https://github.com/websockets/ws#opt-in-for-performance).

## API Documentation

> 🚧 **Documentation is in progress**
>
> For now, please refer to:
> - Code examples in this README
> - JSDoc comments in the source code
> - Test files for more usage examples
>
> Wiki and detailed API documentation are coming soon!


## License

[MIT License](LICENSE) - feel free to use this project commercially.

---
With love ❤️ from Ukraine 🇺🇦