# Changelog

## 5.0.0 — unreleased

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
