# WseIdentity

Represents an authenticated user who can have multiple connections/devices.

## Properties

### client.cid

User identifier (resolved from authentication)

### client.conns

Map of user's connections (conn_id → WseConnection)

### client.meta

Metadata from the FIRST connection that created this identity

## Methods

### client.send(type, payload)

Send message to ALL user's devices

### client.drop(reason)

Disconnect all user's devices

## Usage

```javascript
server.when.joined((client, meta) => {
  console.log(`User ${client.cid} has ${client.conns.size} devices`)
  
  // Send to all user's devices
  client.send('welcome', { message: 'Hello from all your devices!' })
})

// Access specific connections
const client = server.clients.get('user-123')
for (const [connId, conn] of client.conns) {
  console.log(`Device: ${connId}`)
}
```

The `client` parameter is a `WseIdentity` object representing the authenticated user.