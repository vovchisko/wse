# Protocol

WSE allows you to implement custom message protocols while maintaining all the authentication and RPC features.

## Example Implementation

```javascript
class CustomProtocol {
  constructor() {
    // Protocol name used in WebSocket handshake
    this.name = 'custom-protocol'
    
    // Required internal message types
    this.internal_types = Object.freeze({
      hi: '~wse:hi',               // Initial client greeting
      challenge: '~wse:challenge', // CRA challenge/response
      welcome: '~wse:welcome',     // Server welcome after auth
      call: '~wse:call',          // RPC call marker
      response: '~wse:response',   // RPC success response
      response_error: '~wse:response-err', // RPC error response
    })
  }

  // Pack message into [type, payload, stamp] format
  pack({ type, payload = undefined, stamp = undefined }) {
    return JSON.stringify([type, payload, stamp])
  }

  // Unpack message, returns [type, payload, stamp]
  unpack(encoded) {
    return JSON.parse(encoded)
  }
}

// Use custom protocol in server
const server = new WseServer({ 
  port: 4200, 
  identify,
  protocol: new CustomProtocol()
})

// Use same protocol in client
const client = new WseClient({
  url: 'ws://localhost:4200',
  protocol: new CustomProtocol()
})
```

## Protocol Requirements

Your custom protocol must:

1. **Implement required methods**: `pack()` and `unpack()`
2. **Define internal_types**: All 6 internal message types are required
3. **Use [type, payload, stamp] format**: This is the expected message structure
4. **Handle encoding/decoding**: Convert between your format and the standard tuple

## Advanced Example

```javascript
class BinaryProtocol {
  constructor() {
    this.name = 'binary-protocol'
    this.internal_types = Object.freeze({
      hi: 0x01,
      challenge: 0x02,
      welcome: 0x03,
      call: 0x04,
      response: 0x05,
      response_error: 0x06,
    })
  }

  pack({ type, payload, stamp }) {
    const data = { type, payload, stamp }
    const json = JSON.stringify(data)
    return Buffer.from(json, 'utf8')
  }

  unpack(buffer) {
    const json = buffer.toString('utf8')
    const { type, payload, stamp } = JSON.parse(json)
    return [type, payload, stamp]
  }
}
``` 