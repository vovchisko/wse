# wse behaviour spec

The behaviour contract of wse: the test names are the contract, and a port in another
language can be held to the same ones. Nothing here touches the internals of `ws` — the
transport is assumed to work; what is under test is wse on top of it.

    npm test

## How it is built

- `node:test` + `node:assert/strict`. One process per file, files run in parallel.
- Every server binds to **port 0** (the OS picks a free port) and the url is read back
  from the listening socket. No shared port, no ordering constraints between files.
- `_harness.js` hands out servers, clients and raw sockets and shuts all of them down
  in `t.after()`. A test that leaks a socket or a timer keeps its process alive, and
  that shows up as a slow run — it is a signal, not noise.
- No fixed sleeps where a condition can be awaited: `until(fn, what)` polls until the
  condition holds and names what it was waiting for when it gives up.

## Harness primitives to reimplement when porting

| primitive | what it does |
| --- | --- |
| `harness(t)` | per-test sandbox; tracks servers/clients/sockets, tears them down after |
| `harness.server(opts)` | WseServer on a free port, returns `{ server, url }` |
| `harness.detached(opts)` | WseServer with `noServer: true`, fed by an http upgrade |
| `harness.http()` | bare http server on a free port |
| `harness.client(url, opts)` | tracked WseClient |
| `harness.socket(url)` | bare websocket speaking the wse subprotocol, for wire-level probing |
| `wait(ms)` | sleep |
| `until(fn, what, timeout)` | poll until truthy, else fail naming `what` |
| `onceSignal(sig)` / `collectSignal(sig)` | first emission as a promise / every emission as a list |
| `collectChannel(ch, type)` | every payload of one message type as a list |
| `rejection(promise)` | the error a promise rejects with; fails if it resolves |
| `outcome(promise, ms)` | `'resolved'` / `'rejected'` / `'hung'` |

Two tests are white-box and reach into JS internals (`client._ws`, `_rpcManager._callbacks`,
`closed.binds`) to prove a leak is gone: *a send that throws…* and *a response from another
connection…*. A port should assert the same behaviour through whatever its own internals are.
