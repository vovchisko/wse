# WseConnection

Represents a single WebSocket connection/device. Multiple connections can belong to one user.

## Properties

### conn.cid

User ID (same as conn.client.cid)

### conn.conn_id

Unique connection identifier

### conn.identity

Original auth data sent by client (tokens, credentials, etc.)

### conn.meta

Metadata from this specific connection

### conn.client

Reference to WseIdentity (the user)

### conn.remote_addr

Client IP address

### conn.readyState

WebSocket state (0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)

## Methods

### conn.send(type, payload)

Send message to this device only

### conn.call(rp, payload)

Call RPC on this client connection

### conn.drop(reason)

Disconnect this specific device

## Usage

```javascript
server.when.connected((conn) => {
  console.log(`Device ${conn.conn_id} for user ${conn.cid}`)
  console.log('Original auth:', conn.identity)
  console.log('Device meta:', conn.meta)
  
  // Send to this device only
  conn.send('welcome', { deviceId: conn.conn_id })
})
```