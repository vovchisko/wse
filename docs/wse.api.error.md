# WseError

## WseError Structure

All WSE errors follow this structure:

```javascript
{
  code: 'ERROR_CODE',     // String error identifier
  message: 'Description', // Human readable message
  details: {}            // Additional error data (optional)
}
```

## Essential Info Extraction

### WseError Object

```javascript
client.when.error((error) => {
  console.log('Code:', error.code)
  console.log('Message:', error.message)
  console.log('Details:', error.details)
})
```

### Packed Regular Error

```javascript
server.register('riskyOperation', () => {
  throw new Error('Something went wrong')
})

// Client receives packed error
try {
  await client.call('riskyOperation')
} catch (error) {
  // Regular errors get normalized to RP_EXECUTION_FAILED
  console.log('Code:', error.code)                    // 'RP_EXECUTION_FAILED'
  console.log('Message:', error.message)              // 'Something went wrong'
  console.log('Original error:', error.details)       // Error object
}
```

### RPC Call Error Details

RPC errors include the RPC name and call details:

```javascript
// For JavaScript Error objects
try {
  await client.call('getUserData', { userId: 123 })
} catch (error) {
  console.log('RPC name:', error.details.rpc)     // 'getUserData'
  console.log('Payload:', error.details.payload)  // { userId: 123 }
  console.log('Error name:', error.details.origin.name)    // 'Error'
  console.log('Error message:', error.details.origin.message) // Original message
  console.log('Stack trace:', error.details.origin.stack)     // Stack trace
}

// For custom error objects (preserved directly)
server.register('validateUser', () => {
  throw { code: 'INVALID_USER', userId: 123 }
})

try {
  await client.call('validateUser', { userId: 123 })
} catch (error) {
  console.log('Custom code:', error.details.code)     // 'INVALID_USER'
  console.log('User ID:', error.details.userId)       // 123
  console.log('RPC name:', error.details.rpc)         // 'validateUser'
  console.log('Payload:', error.details.payload)      // { userId: 123 }
  console.log('Origin:', error.details.origin)        // undefined (custom object preserved directly)
}

// For WseError objects (RPC context added)
server.register('complexOp', () => {
  throw new WseError('CUSTOM_CODE', { field: 'value' })
})

try {
  await client.call('complexOp', { data: 'test' })
} catch (error) {
  console.log('Code:', error.code)                 // 'CUSTOM_CODE'
  console.log('Field:', error.details.field)      // 'value'
  console.log('RPC name:', error.details.rpc)     // 'complexOp'
  console.log('Payload:', error.details.payload)  // { data: 'test' }
  console.log('Origin:', error.details.origin)    // undefined (already WseError)
}
