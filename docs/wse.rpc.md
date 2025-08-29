# RPC Calls

WSE supports bidirectional RPC calls between client and server.

## Basic Usage

```javascript
// Server registers procedures
server.register('add', (conn, { a, b }) => {
  return a + b
})

server.register('getUserData', async (conn, { userId }) => {
  const userData = await database.getUser(userId)
  return userData
})

// Client calls server procedures
const result = await client.call('add', { a: 5, b: 3 })
console.log(result) // 8

const userData = await client.call('getUserData', { userId: 123 })
```

The `conn` parameter is a [WseConnection](wse.api.server.connection.md) object representing the client's connection.

## Unregistering RPCs

```javascript
// Register RPC
server.register('tempRpc', handler)

// Later, remove it
server.unregister('tempRpc')
```

## Key Concepts

- **Return values** - Whatever handler returns is sent back to caller
- **Async support** - All handlers can be async or return promises
- **Bidirectional** - Both client and server can register/call procedures
- **Connection access** - Server handlers receive `conn` parameter for connection info
