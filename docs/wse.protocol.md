# Protocol

WSE allows you to implement custom message protocols while maintaining all the authentication and RPC features.

## Example Implementation

```javascript
class CustomProtocol {
  constructor () {
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
  pack ({ type, payload = undefined, stamp = undefined }) {
    return JSON.stringify([ type, payload, stamp ])
  }

  // Unpack message, returns [type, payload, stamp]
  unpack (encoded) {
    return JSON.parse(encoded)
  }
}

// Use custom protocol in server
const server = new WseServer({
  port: 4200,
  identify,
  protocol: new CustomProtocol(),
})

// Use same protocol in client
const client = new WseClient({
  url: 'ws://localhost:4200',
  protocol: new CustomProtocol(),
})
```

## Protocol Requirements

Your custom protocol must:

1. **Implement required methods**: `pack()` and `unpack()`
2. **Define internal_types**: All 6 internal message types are required
3. **Use [type, payload, stamp] format**: This is the expected message structure
4. **Handle encoding/decoding**: Convert between your format and the standard tuple

## Binary Protocol

`pack()` may return a string (text frame) or a `Uint8Array`/`ArrayBuffer` (binary frame). `unpack()` receives the
same on both sides, in Node and in the browser:

| frame  | `unpack()` gets |
|--------|-----------------|
| text   | `string`        |
| binary | `ArrayBuffer`   |

The frame layout is up to the protocol. `hi`, `challenge`, `welcome`, RPC calls and responses carry arbitrary
payloads, so keep a generic branch for them. A frame with a `stamp` is a call or a response: a compact layout that
drops the stamp only fits plain messages.

The contract `WseServer` and `WseClient` rely on:

- `unpack()` returns an array `[ type, payload, stamp ]`; anything else, or a throw, closes the connection with
  `PROTOCOL_ERR` and emits `MESSAGE_PROCESSING_ERROR`.
- `stamp` round-trips as given; a truthy `stamp` marks a call or a response.
- `hi` carries `{ identity, meta }`; an error response carries a plain `{ code, details }`.
- RPC responses are typed `internal_types.response` / `response_error`, not by the procedure name.

```javascript
class MixedProtocol {
  constructor () {
    this.name = 'my-mixed-v1'
    this.internal_types = Object.freeze({
      hi: '~wse:hi',
      challenge: '~wse:challenge',
      welcome: '~wse:welcome',
      call: '~wse:call',
      response: '~wse:response',
      response_error: '~wse:response-err',
    })
  }

  // 'pos' messages: binary [1][Float32Array bytes]; everything else, calls included: JSON text
  pack ({ type, payload, stamp }) {
    if (type !== 'pos' || stamp) return JSON.stringify([ type, payload, stamp ])
    const frame = new Uint8Array(1 + payload.byteLength)
    frame[0] = 1
    frame.set(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength), 1)
    return frame
  }

  unpack (data) {
    if (typeof data === 'string') return JSON.parse(data)
    return [ 'pos', new Float32Array(data.slice(1)) ]
  }
}
```

`data.slice(1)` copies on purpose: a `Float32Array` view needs a byte offset that is a multiple of 4.

## Joined Frames

Many small messages to one socket can travel as one frame. wse decides when (see below); the protocol decides how,
with an optional method:

- `join(parts, text)` - `parts` are the bytes (`Uint8Array`) of frames `pack()` returned, in order, all text frames
  (`text` is true) or all binary ones. It returns one frame: bytes, or a string for a text frame. Returning
  `undefined` declines, and the parts go out one by one. A protocol without `join()` never joins.
- `unpack()` of a joined frame returns the list of tuples, `[ [ type, payload, stamp ], ... ]`. wse tells the two
  apart by the first element: a tuple starts with its `type`, a list starts with a tuple.

`WseJSON` joins into a JSON array of the tuples: `[` + the parts separated by `,` + `]`. `JSON.parse` of that is
already the list of tuples, so its `unpack()` did not change.

When frames are joined:

- **Gate:** always. Everything one gate batch writes to one socket goes out joined.
- **Server:** between `server.cork()` and `server.uncork()`, for every socket.
- **Client:** between `client.cork()` and `client.uncork()`.

In each case a run of text frames and a run of binary frames are joined separately, so the order of messages holds.
A joined frame unpacks into frames handled one by one, calls included. A stranger (not authenticated yet) that sends
a joined frame is dropped with `PROTOCOL_ERR`.
