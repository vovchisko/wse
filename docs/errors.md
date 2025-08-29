# Errors

## Error Types

WSE provides specific error codes for different scenarios:

```javascript
import { WseClient, WSE_ERROR, WSE_REASON } from 'wse'
```

### Client-Side Error Handling

```javascript
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
    case WSE_ERROR.INVALID_CRA_HANDLER:
      console.error('Invalid challenge-response handler')
      break
    case WSE_ERROR.CLIENT_ALREADY_CONNECTED:
      console.error('Client is already connected')
      break
  }
})
```

### Server-Side Error Handling

```javascript
server.when.error((error, conn) => {
  switch (error.code) {
    case WSE_ERROR.RP_EXECUTION_FAILED:
      console.error(`RPC failed for ${conn?.cid}:`, error.details)
      break
    case WSE_ERROR.PROTOCOL_VIOLATION:
      console.error(`Protocol violation from ${conn?.cid}:`, error.details)
      break
    case WSE_ERROR.IDENTIFY_HANDLER_MISSING:
      console.error('No identify handler provided')
      break
    case WSE_ERROR.NO_CLIENT_CONNECTION:
      console.error('Client connection not found:', error.details)
      break
  }
})
```

### RPC Error Handling

```javascript
// Detailed RPC error handling
try {
  const result = await client.call('someRpc', data)
} catch (error) {
  console.error('RPC Error:', {
    code: error.code,
    message: error.message,
    details: error.details
  })
  
  switch (error.code) {
    case WSE_ERROR.RP_TIMEOUT:
      // Retry logic
      break
    case WSE_ERROR.RP_NOT_REGISTERED:
      // Fallback logic
      break
    case WSE_ERROR.RP_EXECUTION_FAILED:
      // Handle server-side error
      break
    case WSE_ERROR.RP_DISCONNECT:
      // Handle connection loss
      break
  }
}
```

## Connection Closure Reasons

```javascript
client.when.closed((code, reason) => {
  switch (reason) {
    case WSE_REASON.NOT_AUTHORIZED:
      console.log('Authentication failed')
      // Redirect to login
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
    case WSE_REASON.NO_REASON:
      console.log('Connection closed without reason')
      break
  }
})
```

## Connection Status

```javascript
import { WSE_STATUS } from 'wse'

client.when.updated((status) => {
  switch (status) {
    case WSE_STATUS.IDLE:
      console.log('Client is idle')
      break
    case WSE_STATUS.CONNECTING:
      console.log('Connecting to server...')
      break
    case WSE_STATUS.RE_CONNECTING:
      console.log('Reconnecting...')
      break
    case WSE_STATUS.READY:
      console.log('Connected and authenticated')
      break
    case WSE_STATUS.OFFLINE:
      console.log('Disconnected')
      break
  }
})
```

## Custom Error Handling

### Throwing Custom Errors in RPCs

```javascript
import { WseError } from 'wse'

// Server RPC with custom error
server.register('validateUser', (conn, { userId }) => {
  if (!userId) {
    throw new WseError('INVALID_USER_ID', { 
      message: 'User ID is required',
      field: 'userId' 
    })
  }
  
  const user = database.getUser(userId)
  if (!user) {
    throw new WseError('USER_NOT_FOUND', { 
      userId,
      message: 'User does not exist' 
    })
  }
  
  return user
})

// Client handles custom errors
try {
  const user = await client.call('validateUser', { userId: null })
} catch (error) {
  if (error.code === 'INVALID_USER_ID') {
    console.error('Invalid input:', error.details.message)
  } else if (error.code === 'USER_NOT_FOUND') {
    console.error('User not found:', error.details.userId)
  }
}
```

### Error Recovery Patterns

```javascript
// Retry with exponential backoff
async function callWithRetry(rpc, payload, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await client.call(rpc, payload)
    } catch (error) {
      if (error.code === WSE_ERROR.RP_TIMEOUT && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000 // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
}

// Circuit breaker pattern
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold
    this.timeout = timeout
    this.failures = 0
    this.state = 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = 0
  }
  
  async call(rpc, payload) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN')
      }
      this.state = 'HALF_OPEN'
    }
    
    try {
      const result = await client.call(rpc, payload)
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }
  
  onSuccess() {
    this.failures = 0
    this.state = 'CLOSED'
  }
  
  onFailure() {
    this.failures++
    if (this.failures >= this.threshold) {
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.timeout
    }
  }
}
```

## Error Constants Reference

### WSE_ERROR

- `CLIENT_ALREADY_CONNECTED` - Client is already connected
- `CONNECTION_NOT_READY` - Connection not established
- `WS_CLIENT_ERROR` - WebSocket client error
- `INVALID_CRA_HANDLER` - Invalid challenge-response handler
- `RP_TIMEOUT` - RPC call timed out
- `RP_NOT_REGISTERED` - RPC not found
- `RP_EXECUTION_FAILED` - RPC execution failed
- `RP_DISCONNECT` - Connection lost during RPC
- `RP_ALREADY_REGISTERED` - RPC already registered
- `IDENTIFY_HANDLER_MISSING` - No identify handler provided
- `NO_CLIENT_CONNECTION` - Client connection not found
- `PROTOCOL_VIOLATION` - Protocol violation

### WSE_REASON

- `BY_CLIENT` - Connection closed by client
- `BY_SERVER` - Connection closed by server
- `NOT_AUTHORIZED` - Authentication failed
- `PROTOCOL_ERR` - Protocol error
- `CLIENTS_CONCURRENCY` - Too many connections
- `NO_REASON` - No specific reason

### WSE_STATUS

- `IDLE` - Client is idle
- `CONNECTING` - Connecting to server
- `RE_CONNECTING` - Reconnecting
- `READY` - Connected and authenticated
- `OFFLINE` - Disconnected 