# Messaging

Send fire-and-forget messages using channels and broadcasting.

## Basic Usage

```javascript
// Client sends message to server
client.send('chat', { message: 'Hello everyone!' })

// Server handles incoming messages
server.channel.on('chat', (conn, message) => {
  console.log(`${conn.cid} says:`, message.message)
})
```

The `conn` parameter is a [WseConnection](wse.api.server.connection.md) representing the client's connection.

## Broadcasting

```javascript
// Send to all connected users
server.broadcast('announcement', { message: 'Server restart in 5 minutes' })

// Send to specific user (all their devices)
server.send(userId, 'notification', { title: 'Welcome back!' })

// Send to specific device only
server.channel.on('settings', (conn, data) => {
  conn.send('settings-updated', { success: true })
})

// Selective broadcasting
server.channel.on('chat', (conn, message) => {
  for (const client of server.clients.values()) {
    if (client.cid !== conn.cid) {
      client.send('chat', { user: conn.cid, message: message.message })
    }
  }
})
```

## Multi-Device Support

Configure server for multiple connections per user:

```javascript
const server = new WseServer({
  identify,
  connPerUser: 3  // Allow phone, tablet, desktop
})
```

## Client Message Handling

```javascript
// Handle messages from server
client.channel.on('notification', (data) => {
  showNotification(data.title)
})

client.channel.on('chat', (data) => {
  displayMessage(data.user, data.message)
})
```

## Key Concepts

- **Channels** - EventEmitter pattern for handling messages
- **`server.broadcast()`** - Send to all connected users
- **`server.send(userId, ...)`** - Send to all devices of specific user, see [WseIdentity](wse.api.server.identity.md)
- **`conn.send()`** - Send to specific device only, see [WseConnection](wse.api.server.connection.md)
- **Fire-and-forget** - No response expected, unlike RPC calls
