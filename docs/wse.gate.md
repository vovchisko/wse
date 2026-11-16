# Gate

`WseGate` lets the main thread keep sockets and authentication while clients are served somewhere else, usually in a
worker thread. The main thread forwards each client to a gate, and the gate handles that client's messages and calls.
The gate packs everything it sends, so the main thread never serializes game traffic: it writes the gate's bytes
straight to the sockets.

```
client ──ws──▶ WseServer (main) ──link/port──▶ WseGate (worker)
               auth, routing, guard            admit, channel, register, send, broadcast
```

## Wiring

```javascript
// main thread
import { MessageChannel, Worker } from 'node:worker_threads'
import { WseServer }              from 'wse'

const server = new WseServer({ port: 4200, identify })

const { port1, port2 } = new MessageChannel()
const worker = new Worker('./node.js', { workerData: { port: port2 }, transferList: [ port2 ] })
const link = server.link(port1, { guard: (conn, type) => spend(conn.cid) })

server.when.joined(client => server.forward(client.cid, link, { character: 'c-17' }))
link.when.left((cid, reason) => server.send(cid, 'node.left', { reason }))
```

```javascript
// node.js - worker thread
import { workerData } from 'node:worker_threads'
import { WseGate }    from 'wse'

const gate = new WseGate({
  port: workerData.port,
  admit: ({ cid, meta, accept, refuse }) => (hasSeat(meta.character) ? accept() : refuse('no-seat')),
})

gate.when.joined((client, meta) => client.send('node.joined', snapshot()))
gate.channel.on('move', (client, payload) => move(client.cid, payload))
gate.register('inspect', (client, payload) => inspect(client.cid, payload))

setInterval(() => gate.broadcast('tick', state()), 25)
```

Pass the gate the same protocol as the server.

## Routing

- The server handles a frame itself first: a `server.channel` listener or a `server.register` procedure wins.
  Only frames the server does not handle go to the gate of that client.
- `server.forward(cid, link, meta)` routes an authenticated client to a gate.
  - Forwarding a client to another gate takes it out of the first one.
  - Forwarding it again to the same gate does nothing; `meta` stays as it was.
  - It throws `NO_CLIENT_CONNECTION` for a cid with no authenticated client, `LINK_CLOSED` for a closed link, and `MESSAGE_PROCESSING_ERROR` when `meta` cannot be cloned
    across the port. Either way the client is not routed.
- `server.unforward(cid, reason)` takes the client out of its gate. When the client's last socket closes, the
  server does this on its own.
- Every new socket under a forwarded cid makes the gate admit the client again. That covers a socket replacing the
  old one and another device with `connPerUser > 1`. `gate.when.joined` fires again, so the new socket can get a
  fresh snapshot. The client stays served while it is admitted again; frames the gate queued before that are dropped.
- Each forward has its own seat. A message the gate meant for an earlier forward of the same cid never reaches the
  client, and a stale `WseGateClient` can neither send to nor remove the new one.

## Server side: `server.link(port, options)`

Returns a `WseLink`.

- `options.guard` - `(conn, type, payload, stamp) => boolean`. It runs on the main thread before a frame is forwarded.
  - Falsy drops a message, and answers a call with `FORWARD_REFUSED`.
  - A throw answers a call with the thrown error. For a message, the throw goes to `server.when.error`.
- `options.maxBuffered` - number, default `0`: no client is ever dropped for being slow. Above `0`, a socket that
  already buffers more than this many bytes when a gate batch reaches it is terminated, and the server reports it
  with reason `SLOW_CLIENT`; the client itself sees a 1006 close. Only sockets are judged this way - a gate is
  never dropped for being slow. A frame for a socket that is already backed up is copied, so a slow socket holds
  its own frames plus at most the one batch it was writing when it fell behind.
- `link.cids` - Map of each forwarded cid to its seat. `link.admitted` - Set of the cids the gate admitted.
- `link.when.joined(cid => {})` - the gate admitted the client.
- `link.when.left((cid, reason) => {})` - one of these happened:
  - the gate refused the client;
  - the gate called `client.leave()`;
  - the port closed, with reason `GATE_CLOSED`.

  It does not fire for `server.unforward()`.
- `link.close()` - closes the port. Every forwarded client leaves with `GATE_CLOSED`, on both ends, and every gate call
  still in flight is answered with `LINK_CLOSED`.
- `link.closed` - true once the port closed.

## Gate side: `new WseGate({ port, protocol, admit })`

- `admit({ cid, meta, accept, refuse })` - runs for every forward. The default accepts every client. `refuse(reason)`
  reaches `link.when.left`.
  - Authentication stays on the main thread. `admit` only decides whether this gate takes the client.
  - Until the first `accept()`, the gate ignores the client's messages, answers its calls with `NOT_JOINED`, and
    its broadcasts skip the client.
  - `admit` may be async. A throw or a rejection goes to `gate.when.error` and refuses the client.
- `gate.clients` - Map of cid to `WseGateClient` (`cid`, `meta`, `send(type, payload)`, `leave(reason)`).
- `gate.channel.on(type, (client, payload) => {})`, `gate.register(rp, (client, payload) => result)`,
  `gate.unregister(rp)`.
- `gate.send(cid, type, payload)` and `client.send(type, payload)` reach every device of the client; the answer to a
  call reaches only the device that made it, even after the client left the gate.
- `gate.broadcast(type, payload)` is packed once and reaches every admitted client of this gate.
- `gate.when.joined((client, meta) => {})`, `left((client, reason) => {})`, `ignored((client, type, payload) => {})`,
  `error((err, client) => {})`.
- `gate.flush()` - posts what is queued right away instead of at the end of the event-loop turn, if the main thread
  has room (see backpressure below).
- When the port closes, every client leaves the gate with `GATE_CLOSED` and `gate.closed` turns true.

## What crosses the port

- **Gate to main:** the gate puts every frame queued during one event-loop turn into one `ArrayBuffer`. It sends that
  buffer as one transferred `postMessage`, together with the target of each frame and whether it is text or binary. An `await` on a timer or `setImmediate` inside a tick ends the turn, so that tick is posted in two parts.
  The main thread wraps the buffer without copying it. It writes each frame to the socket as it is, as a text frame
  or a binary frame, so the client's protocol gets a `string` or an `ArrayBuffer` exactly as if the server had sent
  it. Gate frames skip `perMessageDeflate`: deflating once per socket on the main thread is what the gate avoids.
- **Writes:** everything one batch has for one socket - broadcasts, sends and answers, in order - is joined into as
  few frames as the protocol allows ([Joined Frames](wse.protocol.md#joined-frames)): with `WseJSON`, one frame per
  socket per batch. The socket is corked while they are written, so they go out in one write either way.
- **Backpressure:** the main thread acknowledges every batch it has written. The gate keeps at most two batches
  unacknowledged; while it waits, it keeps adding to the next one and posts it merged. A gate that produces faster
  than the main thread can write slows down and grows its own buffer - it does not flood the main thread's queue
  and starve its timers. Nothing is dropped.
- **Order:** frames reach a client in the order the gate sent them.
- **Main to gate:** the client's messages and calls are batched per event-loop turn into one `postMessage`. The main
  thread unpacks them, because routing needs the type, and the port clones the payload: inbound traffic is still
  decoded on the main thread, outbound is not. A payload that cannot be cloned is reported on `server.when.error`;
  a call carrying it is answered with `MESSAGE_PROCESSING_ERROR`, and the rest of the batch goes through.
- **Calls:** a call to the gate is answered by the gate itself. The stamp passes through untouched, so the main
  thread keeps no state for it.

Not supported yet: the gate calling a client procedure (`conn.call`).
