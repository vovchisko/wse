# Broadcast

## Broadcasting Messages

WSE provides several ways to broadcast messages to connected clients.

### Broadcast to All Clients

```javascript
// Send to ALL connected clients
server.broadcast('announcement', { message: 'Server maintenance in 5 minutes' })

// Handle broadcast messages on client
client.channel.on('announcement', (payload) => {
  console.log('Server announcement:', payload.message)
})
```

### Send to Specific Client

```javascript
// Send to specific client (all their connections)
server.send(clientId, 'personal-message', { message: 'Just for you' })

// Send to current connection only
connection.send('connection-specific', { message: 'Just for this device' })
```

### Selective Broadcasting

```javascript
// Broadcast to everyone except sender
server.channel.on('chat-message', (conn, message) => {
  for (const client of server.clients.values()) {
    if (client.cid !== conn.cid) {
      client.send('chat-message', message)
    }
  }
})

// Broadcast to users with specific role
server.channel.on('admin-message', (conn, message) => {
  for (const client of server.clients.values()) {
    if (client.meta.role === 'admin') {
      client.send('admin-message', message)
    }
  }
})
```

## Multi-Device Messaging

When users connect from multiple devices, WSE provides fine-grained control over message delivery.

### Server Setup

```javascript
const server = new WseServer({ 
  identify,
  connPerUser: 3  // Allow 3 connections per user (phone, tablet, desktop)
})
```

### Send to All User's Devices

```javascript
// Send to ALL connections of a specific user
server.send(userId, 'sync-data', { updated: true })

// This reaches all devices for that user
```

### Send to Specific Device

```javascript
// Send to SPECIFIC connection only
server.channel.on('device-settings', (conn, settings) => {
  // conn.send() only sends to that specific connection/device
  conn.send('settings-updated', { confirmed: true })
})
```

### Track User Connections

```javascript
// Monitor connections per user
server.when.connected((conn) => {
  const client = server.clients.get(conn.cid)
  console.log(`User ${conn.cid} connected from device ${conn.conn_id}`)
  console.log(`Total devices: ${client.conns.size}`)
})

server.when.disconnected((conn) => {
  console.log(`Device ${conn.conn_id} disconnected`)
})
```

### Device-Specific Logic

```javascript
// Handle device-specific messages
server.channel.on('mobile-notification', (conn, data) => {
  // Only send push notifications to mobile devices
  if (conn.meta.deviceType === 'mobile') {
    sendPushNotification(conn.cid, data)
  }
})

// Sync data across devices
server.channel.on('data-update', (conn, update) => {
  const client = server.clients.get(conn.cid)
  
  // Send update to all OTHER devices of the same user
  for (const [connId, connection] of client.conns) {
    if (connId !== conn.conn_id) {
      connection.send('data-sync', update)
    }
  }
})
```

## Message Patterns

### Request-Response Pattern

```javascript
// Client sends request
client.send('get-user-list', { page: 1 })

// Server responds
server.channel.on('get-user-list', (conn, { page }) => {
  const users = getUsersPage(page)
  conn.send('user-list-response', { users, page })
})

// Client handles response
client.channel.on('user-list-response', ({ users, page }) => {
  displayUsers(users, page)
})
```

### Pub/Sub Pattern

```javascript
// Client subscribes to topics
client.send('subscribe', { topics: ['news', 'sports'] })

// Server tracks subscriptions
const subscriptions = new Map() // userId -> Set of topics

server.channel.on('subscribe', (conn, { topics }) => {
  subscriptions.set(conn.cid, new Set(topics))
})

// Server publishes to topics
function publishToTopic(topic, message) {
  for (const [userId, topics] of subscriptions) {
    if (topics.has(topic)) {
      server.send(userId, 'topic-message', { topic, message })
    }
  }
}
```

### Chat Room Pattern

```javascript
// Join/leave rooms
const rooms = new Map() // roomId -> Set of userIds

server.channel.on('join-room', (conn, { roomId }) => {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set())
  rooms.get(roomId).add(conn.cid)
  
  // Notify room members
  broadcastToRoom(roomId, 'user-joined', { userId: conn.cid })
})

server.channel.on('room-message', (conn, { roomId, message }) => {
  broadcastToRoom(roomId, 'room-message', { 
    userId: conn.cid, 
    message 
  })
})

function broadcastToRoom(roomId, type, payload) {
  const room = rooms.get(roomId)
  if (room) {
    for (const userId of room) {
      server.send(userId, type, payload)
    }
  }
}
``` 