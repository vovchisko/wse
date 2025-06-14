# RPC

WSE supports bidirectional RPC calls - both server and client can register procedures and call each other.

## Server → Client RPC

Server registers procedures that clients can call:

```javascript
// Server-side RPC registration
server.register('getUserData', async (conn, { userId }) => {
  const userData = await database.getUser(userId)
  return userData
})

server.register('add', (conn, { a, b }) => {
  return a + b
})

// Client calls server procedures
try {
  const result = await client.call('add', { a: 5, b: 3 })
  console.log('5 + 3 =', result) // Output: 8
  
  const userData = await client.call('getUserData', { userId: 123 })
  console.log('User data:', userData)
} catch (error) {
  console.error('RPC failed:', error)
}
```

## Client → Server RPC

Client registers procedures that server can call:

```javascript
// Client-side RPC registration
client.register('getClientInfo', () => {
  return {
    userAgent: navigator.userAgent,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }
})

client.register('showNotification', ({ message, type }) => {
  if (Notification.permission === 'granted') {
    new Notification(message)
  }
  return { shown: true }
})

// Server calls client procedures
server.when.connected(async (conn) => {
  try {
    const clientInfo = await conn.call('getClientInfo')
    console.log('Client info:', clientInfo)
    
    await conn.call('showNotification', { 
      message: 'Welcome back!',
      type: 'success'
    })
  } catch (error) {
    console.error('Client RPC failed:', error)
  }
})
```

## Error Handling

RPC calls can fail for various reasons:

```javascript
import { WSE_ERROR } from 'wse'

try {
  const result = await client.call('someRpc', data)
} catch (error) {
  switch (error.code) {
    case WSE_ERROR.RP_TIMEOUT:
      console.error('RPC call timed out')
      break
    case WSE_ERROR.RP_NOT_REGISTERED:
      console.error('RPC not found')
      break
    case WSE_ERROR.RP_EXECUTION_FAILED:
      console.error('RPC failed:', error.details)
      break
    case WSE_ERROR.RP_DISCONNECT:
      console.error('Connection lost during RPC')
      break
  }
}
```

## Async RPC Handlers

Both client and server can use async RPC handlers:

```javascript
// Server async RPC
server.register('processPayment', async (conn, paymentData) => {
  const result = await paymentService.process(paymentData)
  return result
})

// Client async RPC
client.register('processData', async (payload) => {
  const result = await heavyComputation(payload)
  return result
})
```

## RPC Timeouts

Configure timeouts for RPC calls:

```javascript
// Client with 30-second timeout
const client = new WseClient({ 
  url: 'ws://localhost:4200',
  tO: 30  // 30 seconds timeout
})

// Server with 20-second timeout
const server = new WseServer({ 
  identify,
  tO: 20  // 20 seconds timeout
})
```

## Unregistering RPCs

Remove RPC handlers when no longer needed:

```javascript
// Register RPC
client.register('tempRpc', handler)

// Later, unregister it
client.unregister('tempRpc')
``` 