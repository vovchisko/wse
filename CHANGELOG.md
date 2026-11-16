# Changelog

## 6.0.0

### Added

- `WseGate`: serve clients from a worker thread while the main thread keeps sockets and auth.
  `server.link(port)` + `server.forward(cid, link, meta)` route every frame the server does not
  handle itself to the gate; the gate admits, handles messages and calls, and packs what it
  sends. Frames leave the gate once per event-loop turn as one transferred `ArrayBuffer`, and
  the main thread writes them to the sockets as they are: a broadcast is packed once for the
  whole gate, and each socket is written once per batch. The gate keeps at most two batches
  in flight, so a gate faster than the main thread cannot starve it. A link `guard` runs
  before forwarding; an opt-in `maxBuffered` drops a socket that falls too far behind with
  `SLOW_CLIENT`. See [docs/wse.gate.md](docs/wse.gate.md).

### Breaking

- `tO` is now in milliseconds on both `WseClient` and `WseServer` (default `20000`, was `20`
  seconds). It feeds `setTimeout` directly: a leftover `tO: 20` times calls out after 20ms
  and gives `identify()` 20ms before the server closes with `AUTH_TIMEOUT`. `Infinity` and
  anything above 2^31-1 disable it like `0`; a negative, `NaN` or non-number `tO` throws
  `INVALID_TIMEOUT` from the constructor.
- `protocol.unpack()` receives a `string` for a text frame and an `ArrayBuffer` for a binary
  frame, on both sides and in both Node and the browser. It was a `Buffer` for every frame on
  the server, a `Buffer` for binary frames on a Node client, and an unreadable-synchronously
  `Blob` in the browser. A protocol that reads a `Buffer` has to take an `ArrayBuffer`
  (`new Uint8Array(data)`); `WseJSON` handles both.
- The error frame is a plain `{ code, details }`. It no longer carries `message`, `rp`, the
  call `payload` or `origin.stack` (the server stack and file paths reached every client).
  A `WseError` thrown in a handler is no longer sent as the live instance, so a non-JSON
  protocol keeps its code and details, and it is no longer mutated.
- Every rejection of `call()` carries `details.rp`, set by the caller from its own call:
  `RP_TIMEOUT`, `RP_DISCONNECT`, `CONNECTION_NOT_READY` and `RP_SEND_FAILED` had none. An
  `rp` the peer reports is kept as `details.peer_rp`. `details` that are not a plain object
  arrive as `{ value, rp }`; a non-string `code` becomes `RP_EXECUTION_FAILED`.
- `RP_SEND_FAILED` no longer carries the call `payload`.
- `RP_EXECUTION_FAILED` on the handler side's `error` signal names the procedure
  `details.rp` (was `details.type`).
- `client.send()` and `client.call()` require the client to be `READY`. Before the welcome
  (e.g. from `when.connected`) they now throw / reject with `CONNECTION_NOT_READY`; the
  server dropped such a frame, so a call hung until `tO`, forever with `tO: 0`.
  `conn.call()` likewise requires an authenticated connection.
- `WSE_ERROR.MESSAGE_PROCESSING_ERROR` is `'wse.msg-processing-error'` (was
  `'wse.server.msg-processing-error'`); the client emits it too.

### Fixed

- A frame the client could not unpack threw out of `onmessage`: an uncaught exception that
  killed a Node process. The client now emits `MESSAGE_PROCESSING_ERROR` and closes with
  `PROTOCOL_ERR`, as the server does.
- An error the protocol could not pack (a `BigInt` or a cycle in `details`) became an
  unhandled rejection that killed a Node process, and the caller hung until `tO`. The frame
  now falls back to the code alone.
- A pending call unsubscribed an unrelated `client.when.closed` listener added after it.
  The disconnect guard was an a-signal `once` bind calling `off()` mid-emit, which a-signal
  2.x answered by splicing a second, foreign listener.
- `connect()` hung forever when the server never sent the welcome; it now closes with
  `AUTH_TIMEOUT` after `tO`. A challenge with no solver set hung the same way; it now
  rejects with `INVALID_CRA_HANDLER`.
- `close()` while waiting to reconnect did nothing and the reconnect went ahead. It now
  cancels it and rejects a pending `connect()`. `connect()` during that wait opened a second
  socket; it throws `CLIENT_ALREADY_CONNECTED`. `jump()` during the wait retargets the
  pending reconnect.
- A `__proto__` key in the `hi` meta set the prototype of `conn.meta`.
- A connection the server dropped (protocol error, concurrency, `dropClient`) stayed in
  `server.ws.clients` for good: `removeAllListeners()` also removed the `close` listener ws
  uses to forget the socket. The server now removes only its own listeners.
- `WseJSON` failed on JSON sent as a binary frame.
- An error frame whose `details.origin.message` was not a string threw while the caller built
  its `WseError`: an uncaught exception on a Node client, a call that never settled on the
  server. Only string parts go into the message now.
- Challenge-response ran `identify()` once per challenge frame, so one socket could try any
  number of solutions. The first solution now moves the socket to validating; later frames
  are ignored.
- An async `identify()` that rejected was an unhandled rejection. It is now reported on
  `server.when.error` and refuses the connection, as a synchronous throw does (that used to
  close with `PROTOCOL_ERR`; now `NOT_AUTHORIZED`).
- `accept()` after the socket had closed (a slow async `identify()`) created a client with a
  dead connection that never left. A second `accept()` is ignored too.
- A frame the server's protocol unpacked to something other than an array was destructured
  as one (`"ab"` became type `a`); it now closes the connection with `PROTOCOL_ERR`.
- With `re: true`, `close()` before the close handshake finished (a socket still connecting,
  an unreachable peer) ended in a 1006 close that reconnected. `close()` now always stops the
  client.
- `jump()` on a live client resolved on success only: a refusing server or a dead port left
  it pending forever. It now settles like `connect()`.
- A malformed url threw from `new WebSocket()`: out of `connect()` as a bare `SyntaxError`
  with the status stuck at `CONNECTING`, and out of a timer (uncaught) on `jump()`. Both now
  reject with `WS_CLIENT_ERROR` and leave the client `OFFLINE`.
- `connect()` from a `when.closed` handler threw `CLIENT_ALREADY_CONNECTED`, and the status
  went `OFFLINE` after the handler had started connecting. The client lets go of the socket
  and turns `OFFLINE` before `closed` fires.
- A server channel handler that threw `null` or `undefined` crashed the message handler.

### Changed

- `a-signal` ^3.0.0: listeners can unsubscribe, subscribe or wipe during an emission.
- `client.re_t0` and `client.re_on_codes` are documented. `re_t0` was always in
  milliseconds; the reconnect handler no longer names its delay as if it were seconds.

## 5.1.0

### Changed

- `engines.node` raised to `>=22.0.0`. Node 20 is out of support, and 22 is the oldest
  release the test suite runs on (`node --test` only expands glob arguments from 22).

### Fixed

- A connection dropped for a protocol violation left its authentication timer pending
  for the whole `tO` (20s by default). Both drop paths call `removeAllListeners()`
  before `close()`, so the `close` handler that cleared the timer was already gone.
  Harmless per connection — the callback re-checks `valid_stat` — but every rejected
  stranger held a live timer, and the process could not exit while any of them ran.

### Internal

- Test suite rewritten under `node:test` in `spec/`, replacing `tests/` and the
  `test-a-bit` dependency. Each server binds to port 0 and every server, client and
  socket is torn down per test, so a leaked handle now shows up as a slow run instead
  of being hidden by `process.exit()` — which is how the timer leak above surfaced.
  Same behaviour covered, plus 19 tests for behaviour the old suite never exercised.

## 5.0.1

### Fixed

- The browser entry (`browser.js`) did not export `WSE_ERROR`, so browser code could
  not compare `e.code` against a constant and had to hard-code the raw strings.
  12 of the 18 codes are reachable from the client — either raised locally
  (`RP_TIMEOUT`, `CONNECTION_CLOSED`, `NOT_AUTHORIZED`, `RP_SEND_FAILED`, …) or
  received from the server (`RP_EXECUTION_FAILED`, `RP_NOT_REGISTERED`).

## 5.0.0

### Breaking

- `error.details.rpc` renamed to `error.details.rp`, and the error message prefix
  changed from `rpc:` to `rp:`. This one is silent — code reading `details.rpc`
  now gets `undefined` instead of an error.
- `connect()` on an already-connected client throws a `WseError` instead of a bare
  string. Check `e.code === WSE_ERROR.CLIENT_ALREADY_CONNECTED`, not `e === ...`.
- `connect()` rejects with a `WseError` instead of the raw close-reason string:
  `NOT_AUTHORIZED` when the server refused, `CONNECTION_CLOSED` otherwise, with the
  close code and reason in `details`. With `re: true` a close that will not be
  retried now rejects instead of leaving the promise pending forever.
- Server `when.error` receives a wrapped `WseError` (`MESSAGE_PROCESSING_ERROR`,
  original under `details.raw`) instead of the raw error object.
- `when.left` fires once per client. It previously fired twice for `dropClient()`.
- `when.joined` receives `conn.meta`. Under CRA it previously received `{}`.
- `RP_NOT_REGISTERED` responses carry a full normalized error body instead of `{ code }`.
- `engines.node` raised to `>=20`.

### Added

- `WSE_ERROR.CONNECTION_CLOSED` — connection closed before it became ready.
- `WSE_ERROR.RP_SEND_FAILED` — an RP call could not be sent.

### Fixed

- Client failed to import at all under Node ESM: `tseep/lib/ee-safe` was missing its
  `.js` extension and `tseep` ships no `exports` map.
- A response arriving after its call timed out was treated as an incoming RP call and
  answered with an error frame, which the peer answered in turn — two processes traded
  frames forever off a single late reply.
- Client crashed with an unhandled rejection when the socket closed while an incoming
  RP handler was still running.
- A malformed error response (`['~wse:response-err', null, stamp]`) left the caller's
  promise pending forever — any client could wedge a server-side `conn.call()` on demand.
- `conn.call()`'s disconnect guard was consumed by any *other* client disconnecting, so
  the call missed its own disconnect and hung until timeout.
- A protocol violation during CRA closed the connection but still reached `identify()`,
  letting a lax handler accept a ghost identity.
- Solving a CRA challenge with `null` threw inside `accept()` and dropped the connection.
- A synchronous send failure leaked the pending call: stamp, disconnect bind and timeout
  all stayed alive.
- `updated` fired before `status` was assigned, so handlers read the previous value.
- `req.connection` (deprecated) replaced with `req.socket`.
- `WSE_STATUS` is now frozen, like the other exported constant maps.

### Performance

- `broadcast()` serializes the frame once and reuses it for every recipient instead of
  packing per connection.
