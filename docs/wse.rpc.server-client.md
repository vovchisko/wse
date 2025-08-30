# Server-to-Client RPC

Server can call procedures registered on the client.

## Client Registration

```javascript
// Client registers procedures for server to call
client.register('getClientInfo', () => {
  return {
    userAgent: navigator.userAgent,
    screenSize: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }
})

client.register('showNotification', ({ title, message }) => {
  if (Notification.permission === 'granted') {
    new Notification(title, { body: message })
    return { shown: true }
  }
  return { shown: false }
})
```

## Server Calls Client

```javascript
server.when.connected(async (conn) => {
  try {
    // Call procedure on specific client connection
    const clientInfo = await conn.call('getClientInfo')
    console.log('Client info:', clientInfo)

    // Call with data
    const result = await conn.call('showNotification', {
      title: 'Welcome!',
      message: 'You are now connected'
    })
    console.log('Notification shown:', result.shown)
  } catch (error) {
    console.error('Client RPC failed:', error.code)
  }
})
```

The `conn` parameter is a [WseConnection](wse.api.server.connection.md) representing the specific client connection.

## Key Concepts

- **`conn.call()`** - Calls procedure on specific client connection
- **Client handlers** - Don't receive `conn` parameter (only server handlers do)
- **Per-connection** - Each connection can have different registered procedures
- **Use cases** - Client capabilities, notifications, data collection
