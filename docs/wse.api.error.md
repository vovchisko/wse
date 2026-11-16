# WseError

## WseError Structure

All WSE errors follow this structure:

```json5
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
  console.log('Code:', error.code)       // WSE_ERROR.RP_EXECUTION_FAILED ('wse.server.rp.failed')
  console.log('Message:', error.message) // 'wse.server.rp.failed\n -> rp:riskyOperation\n -> Something went wrong'
  console.log('Details:', error.details) // { origin: { name: 'Error', message: 'Something went wrong' }, rp: 'riskyOperation' }
}
```

### RPC Call Error Details

Every rejected `call()` carries `details.rp`, set by the caller - including `RP_TIMEOUT`, `RP_DISCONNECT` and `CONNECTION_NOT_READY`.

The error frame on the wire is a plain `{ code, details }`. The stack of the thrown error stays on the handler side (its
`when.error`); only `origin.name` and `origin.message` cross. The caller adds `rp`; an `rp` the peer reports (a
nested call it made failed) is kept as `peer_rp`. `details` that are not a plain object arrive as `{ value, rp }`. A
non-string `code` becomes `RP_EXECUTION_FAILED`. If the protocol cannot pack the details, the frame falls back to the
code with `origin` naming the pack failure.

```javascript
// For JavaScript Error objects
try {
  await client.call('getUserData', { userId: 123 })
} catch (error) {
  console.log('RPC name:', error.details.rp)     // 'getUserData'
  console.log('Error name:', error.details.origin.name)    // 'Error'
  console.log('Error message:', error.details.origin.message) // Original message
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
  console.log('RPC name:', error.details.rp)         // 'validateUser'
  console.log('Origin:', error.details.origin)        // undefined (custom object preserved directly)
}

// For WseError objects (details kept as thrown)
server.register('complexOp', () => {
  throw new WseError('CUSTOM_CODE', { field: 'value' })
})

try {
  await client.call('complexOp', { data: 'test' })
} catch (error) {
  console.log('Code:', error.code)                 // 'CUSTOM_CODE'
  console.log('Field:', error.details.field)      // 'value'
  console.log('RPC name:', error.details.rp)     // 'complexOp'
  console.log('Origin:', error.details.origin)    // undefined (already WseError)
}
