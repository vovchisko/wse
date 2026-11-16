import { test }           from 'node:test'
import assert             from 'node:assert/strict'
import { MessageChannel, Worker } from 'node:worker_threads'

import { WSE_ERROR, WSE_REASON, WseError } from '../src/common.js'
import { WseJSON }                         from '../src/protocol.js'
import { WseGate }                         from '../src/gate.js'

import { collectChannel, collectSignal, harness, onceSignal, rejection, SECRET, until, wait } from './_harness.js'

async function setup (t, { server: server_options = {}, link: link_options, gate: gate_options = {} } = {}) {
  const h = harness(t)
  const { server, url } = await h.server(server_options)
  const pair = () => {
    const { port1, port2 } = new MessageChannel()
    t.after(() => port1.close())
    return {
      link: server.link(port1, link_options),
      gate: new WseGate({ port: port2, protocol: server_options.protocol, ...gate_options }),
      port: port2,
    }
  }
  const { link, gate, port } = pair()

  const join = async (user_id, target = { link, gate }, meta = { seat: user_id }) => {
    const client = h.client(url, { protocol: server_options.protocol, tO: 2000 })
    await client.connect(SECRET, { user_id })
    const joined = onceSignal(target.gate.joined)
    server.forward(user_id, target.link, meta)
    await joined
    return client
  }

  return { h, server, url, link, gate, port, pair, join }
}

test('a message the server does not handle reaches the gate with its client', async t => {
  const { server, gate, join } = await setup(t)
  const on_main = []
  server.channel.on('main-only', (conn, payload) => on_main.push(payload))
  const on_gate = []
  gate.channel.on('move', (client, payload) => on_gate.push([ client.cid, client.meta, payload ]))
  const ignored = collectSignal(gate.ignored)

  const client = await join('U1')
  client.send('main-only', 1)
  client.send('move', { x: 1 })

  await until(() => on_gate.length && on_main.length, 'both sides to receive')
  assert.deepEqual(on_gate, [ [ 'U1', { seat: 'U1' }, { x: 1 } ] ])
  assert.deepEqual(on_main, [ 1 ])
  assert.equal(ignored.length, 0)
})

test('a call the server does not register runs on the gate', async t => {
  const { server, gate, join } = await setup(t)
  server.register('main-rp', () => 'main')
  gate.register('add', (client, { a, b }) => `${ client.cid }:${ a + b }`)

  const client = await join('U1')

  assert.equal(await client.call('add', { a: 2, b: 3 }), 'U1:5')
  assert.equal(await client.call('main-rp'), 'main')
})

test('a gate error reaches the caller with its code, details and rp', async t => {
  const { gate, join } = await setup(t)
  gate.register('boom', () => { throw new WseError('X', { f: 1 }) })
  const errors = collectSignal(gate.error)

  const client = await join('U1')

  const err = await rejection(client.call('boom'))
  assert.equal(err.code, 'X')
  assert.deepEqual(err.details, { f: 1, rp: 'boom' })
  assert.equal(errors[0][0].code, WSE_ERROR.RP_EXECUTION_FAILED)
  assert.equal(errors[0][0].details.rp, 'boom')

  const missing = await rejection(client.call('nope'))
  assert.equal(missing.code, WSE_ERROR.RP_NOT_REGISTERED)
  assert.equal(missing.details.rp, 'nope')
})

test('broadcast reaches only the clients of that gate and is packed once', async t => {
  class CountingJSON extends WseJSON {
    constructor () {
      super()
      this.packs = 0
    }

    pack (message) {
      this.packs++
      return super.pack(message)
    }
  }

  const protocol = new CountingJSON()
  const { pair, join, gate, h, url } = await setup(t, { gate: { protocol } })
  const other = pair()

  const u1 = await join('U1')
  const u2 = await join('U2')
  const u3 = await join('U3', other)
  const u4 = h.client(url)
  await u4.connect(SECRET, { user_id: 'U4' })

  const got = [ u1, u2, u3, u4 ].map(c => collectChannel(c.channel, 'tick'))

  protocol.packs = 0
  gate.broadcast('tick', 7)

  await until(() => got[0].length && got[1].length, 'gate clients to receive')
  await wait(50)
  assert.deepEqual(got.map(g => g.length), [ 1, 1, 0, 0 ])
  assert.equal(protocol.packs, 1)
})

test('sends and broadcasts keep their order and leave as one postMessage per turn', async t => {
  const { gate, port, join } = await setup(t)
  const client = await join('U1')
  const order = []
  for (const type of [ 'a', 'b', 'c' ]) client.channel.on(type, () => order.push(type))

  let posts = 0
  const post = port.postMessage.bind(port)
  port.postMessage = (...args) => {
    posts++
    return post(...args)
  }

  const gate_client = gate.clients.get('U1')
  gate_client.send('a')
  gate.broadcast('b')
  gate_client.send('c')

  await until(() => order.length === 3, 'all three messages')
  assert.deepEqual(order, [ 'a', 'b', 'c' ])
  assert.equal(posts, 1)
})

test('admit can refuse: the link reports left and the server stops forwarding', async t => {
  const { server, link, url, h } = await setup(t, { gate: { admit: ({ refuse }) => refuse('no-seat') } })
  const left = onceSignal(link.left)
  const ignored = collectSignal(server.ignored)

  const client = h.client(url)
  await client.connect(SECRET, { user_id: 'U1' })
  server.forward('U1', link)

  assert.deepEqual(await left, [ 'U1', 'no-seat' ])
  client.send('move', 1)
  await until(() => ignored.length, 'the server to ignore the message itself')
})

test('a call before the gate admits the client answers NOT_JOINED', async t => {
  const { server, link, url, h } = await setup(t, { gate: { admit: () => {} } })
  const client = h.client(url)
  await client.connect(SECRET, { user_id: 'U1' })
  server.forward('U1', link)

  const err = await rejection(client.call('anything'))
  assert.equal(err.code, WSE_ERROR.NOT_JOINED)
  assert.equal(err.details.rp, 'anything')
})

test('leave delivers what was sent before it and the link reports left', async t => {
  const { gate, link, join } = await setup(t)
  const client = await join('U1')
  const bye = collectChannel(client.channel, 'bye')
  const left = onceSignal(link.left)
  const gate_left = onceSignal(gate.left)

  const gate_client = gate.clients.get('U1')
  gate_client.send('bye', 1)
  gate_client.leave('kicked')

  assert.deepEqual(await left, [ 'U1', 'kicked' ])
  const [ who, reason ] = await gate_left
  assert.equal(who.cid, 'U1')
  assert.equal(reason, 'kicked')
  await until(() => bye.length, 'the message sent before leave')
  assert.equal(gate.clients.size, 0)
})

test('unforward takes the client out of the gate, later broadcasts skip it', async t => {
  const { server, gate, join } = await setup(t)
  const client = await join('U1')
  const ticks = collectChannel(client.channel, 'tick')

  const left = onceSignal(gate.left)
  server.unforward('U1', 'moved')
  const [ who, reason ] = await left
  assert.equal(who.cid, 'U1')
  assert.equal(reason, 'moved')

  gate.broadcast('tick')
  await wait(50)
  assert.equal(ticks.length, 0)
})

test('a client closing its socket leaves the gate', async t => {
  const { gate, join } = await setup(t)
  const client = await join('U1')
  const left = onceSignal(gate.left)

  client.close()

  const [ who, reason ] = await left
  assert.equal(who.cid, 'U1')
  assert.equal(reason, WSE_REASON.BY_CLIENT)
})

test('forwarding to another gate leaves the first one', async t => {
  const { server, gate, pair, join } = await setup(t)
  const other = pair()
  await join('U1')

  const left = onceSignal(gate.left)
  const joined = onceSignal(other.gate.joined)
  server.forward('U1', other.link)

  assert.equal((await left)[0].cid, 'U1')
  assert.equal((await joined)[0].cid, 'U1')
})

test('guard: falsy drops a message and refuses a call, a throw answers with its error', async t => {
  const guard = (conn, type) => {
    if (type === 'throws') throw new WseError('RATE', { cid: conn.cid })
    return type !== 'blocked'
  }
  const { gate, join } = await setup(t, { link: { guard } })
  const seen = []
  for (const type of [ 'blocked', 'open' ]) gate.channel.on(type, () => seen.push(type))
  gate.register('blocked', () => 1)

  const client = await join('U1')
  client.send('blocked')
  client.send('open')
  await until(() => seen.length, 'the open message')
  await wait(30)
  assert.deepEqual(seen, [ 'open' ])

  assert.equal((await rejection(client.call('blocked'))).code, WSE_ERROR.FORWARD_REFUSED)
  const thrown = await rejection(client.call('throws'))
  assert.equal(thrown.code, 'RATE')
  assert.deepEqual(thrown.details, { cid: 'U1', rp: 'throws' })
})

test('a text frame stays text and a binary frame stays binary', async t => {
  class MixedProtocol extends WseJSON {
    constructor () {
      super()
      this.name = 'wse-spec-mixed'
      this.received = []
    }

    pack ({ type, payload, stamp }) {
      if (type !== 'pos' || stamp) return JSON.stringify([ type, payload, stamp ])
      const frame = new Uint8Array(1 + payload.byteLength)
      frame[0] = 1
      frame.set(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength), 1)
      return frame
    }

    unpack (data) {
      this.received.push(typeof data === 'string' ? 'string' : data.constructor.name)
      if (typeof data === 'string') return JSON.parse(data)
      return [ 'pos', new Float32Array(data.slice(1)) ]
    }
  }

  const { gate, join } = await setup(t, { server: { protocol: new MixedProtocol() } })
  const client = await join('U1')
  const pos = collectChannel(client.channel, 'pos')
  const note = collectChannel(client.channel, 'note')
  client.protocol.received.length = 0

  gate.clients.get('U1').send('pos', new Float32Array([ 1.5, -2 ]))
  gate.clients.get('U1').send('note', { a: 'ї' })

  await until(() => pos.length && note.length, 'both frames')
  assert.deepEqual(pos[0], new Float32Array([ 1.5, -2 ]))
  assert.deepEqual(note[0], { a: 'ї' })
  assert.deepEqual(client.protocol.received, [ 'ArrayBuffer', 'string' ])
})

test('a client buffering past maxBuffered is dropped with SLOW_CLIENT', async t => {
  const { server, gate, join } = await setup(t, { link: { maxBuffered: 10 } })
  await join('U1')
  const dropped = onceSignal(server.disconnected)
  const left = onceSignal(gate.left)

  const [ conn ] = server.clients.get('U1').conns.values()
  Object.defineProperty(conn.ws_conn, 'bufferedAmount', { value: 1e6 })
  gate.broadcast('tick')

  assert.equal((await dropped)[2], WSE_REASON.SLOW_CLIENT)
  assert.equal((await left)[1], WSE_REASON.SLOW_CLIENT)
})

test('a closed gate port takes every client out with GATE_CLOSED', async t => {
  const { server, link, port, join } = await setup(t)
  await join('U1')
  await join('U2')
  const left = collectSignal(link.left)

  port.close()

  await until(() => left.length === 2, 'both clients to leave')
  assert.deepEqual(left.map(([ cid, reason ]) => [ cid, reason ]).sort(), [ [ 'U1', WSE_REASON.GATE_CLOSED ], [ 'U2', WSE_REASON.GATE_CLOSED ] ])
  assert.equal(server._routes.size, 0)
})

test('a new socket under the same cid is admitted again', async t => {
  const { gate, join, h, url } = await setup(t)
  await join('U1')
  const again = onceSignal(gate.joined)

  const second = h.client(url)
  await second.connect(SECRET, { user_id: 'U1' })

  const [ client, meta ] = await again
  assert.equal(client.cid, 'U1')
  assert.deepEqual(meta, { seat: 'U1' })
  assert.equal(gate.clients.size, 1)
})

test('a gate in a worker thread serves messages, calls and broadcasts', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const { port1, port2 } = new MessageChannel()
  const worker = new Worker(new URL('./fixtures/gate-worker.js', import.meta.url), { workerData: { port: port2 }, transferList: [ port2 ] })
  t.after(() => worker.terminate())
  const link = server.link(port1)

  const client = h.client(url, { tO: 3000 })
  const hello = collectChannel(client.channel, 'hello')
  const pong = collectChannel(client.channel, 'pong')
  await client.connect(SECRET, { user_id: 'U1' })

  const joined = onceSignal(link.joined)
  server.forward('U1', link)
  assert.deepEqual(await joined, [ 'U1' ])

  assert.deepEqual(await client.call('echo', [ 1, 2 ]), { cid: 'U1', payload: [ 1, 2 ] })
  client.send('ping', 'p')
  await until(() => pong.length && hello.length, 'pong and hello')
  assert.deepEqual(pong, [ 'p' ])
  assert.deepEqual(hello, [ 'U1' ])

  const left = onceSignal(link.left)
  await worker.terminate()
  assert.deepEqual(await left, [ 'U1', WSE_REASON.GATE_CLOSED ])
})

test('a frame the gate sends after the server took the client away is not delivered', async t => {
  const { server, gate, join } = await setup(t)
  const client = await join('U1')
  const stale = collectChannel(client.channel, 'stale')
  const fresh = collectChannel(client.channel, 'fresh')
  const gate_client = gate.clients.get('U1')

  server.unforward('U1')
  gate_client.send('stale')
  server.send('U1', 'fresh')

  await until(() => fresh.length, 'the main thread message')
  await wait(50)
  assert.equal(stale.length, 0)
})

test('link.close() takes every client out with GATE_CLOSED', async t => {
  const { link, gate, join } = await setup(t)
  await join('U1')
  const left = onceSignal(link.left)

  link.close()

  assert.deepEqual(await left, [ 'U1', WSE_REASON.GATE_CLOSED ])
  assert.equal(link.cids.size, 0)
})

test('maxBuffered of 0 never drops a client', async t => {
  const { server, gate, join } = await setup(t, { link: { maxBuffered: 0 } })
  const client = await join('U1')
  const ticks = collectChannel(client.channel, 'tick')

  const [ conn ] = server.clients.get('U1').conns.values()
  Object.defineProperty(conn.ws_conn, 'bufferedAmount', { value: 1e9 })
  gate.broadcast('tick')

  await until(() => ticks.length, 'the tick')
  assert.ok(server.clients.has('U1'))
})

test('a guard that throws on a message reports it and forwards nothing', async t => {
  const { server, gate, join } = await setup(t, { link: { guard: () => { throw new WseError('RATE') } } })
  const seen = []
  gate.channel.on('move', (client, payload) => seen.push(payload))
  const errors = collectSignal(server.error)

  const client = await join('U1')
  client.send('move', 1)

  await until(() => errors.length, 'the guard error')
  assert.equal(errors[0][0].code, 'RATE')
  assert.equal(errors[0][1].cid, 'U1')
  await wait(30)
  assert.equal(seen.length, 0)
})

test('a client refused on re-admit leaves the gate', async t => {
  let admits = 0
  const { link, gate, join, h, url } = await setup(t, { gate: { admit: ({ accept, refuse }) => (++admits === 1 ? accept() : refuse('full')) } })
  await join('U1')
  const left = onceSignal(link.left)
  const gate_left = onceSignal(gate.left)

  const second = h.client(url)
  await second.connect(SECRET, { user_id: 'U1' })

  assert.deepEqual(await left, [ 'U1', 'full' ])
  assert.equal((await gate_left)[0].cid, 'U1')
  assert.equal(gate.clients.size, 0)
})

test('an admit that resolves after the client left does not join it', async t => {
  const { server, link, gate, h, url } = await setup(t, { gate: { admit: ({ accept }) => setTimeout(accept, 50) } })
  const joined = collectSignal(gate.joined)
  const link_joined = collectSignal(link.joined)

  const client = h.client(url)
  await client.connect(SECRET, { user_id: 'U1' })
  server.forward('U1', link)
  server.unforward('U1')

  await wait(150)
  assert.equal(joined.length, 0)
  assert.equal(link_joined.length, 0)
  assert.equal(gate.clients.size, 0)
})

test('a payload that cannot cross the port is reported without losing the rest of the batch', async t => {
  class FnProtocol extends WseJSON {
    unpack (data) {
      const frame = super.unpack(data)
      if (frame[0] === 'bad') frame[1] = { fn: () => {} }
      return frame
    }
  }

  const protocol = new FnProtocol()
  const { server, gate, join } = await setup(t, { server: { protocol } })
  const good = []
  gate.channel.on('good', (client, payload) => good.push(payload))
  const errors = collectSignal(server.error)

  const client = await join('U1')
  client.send('good', 1)
  client.send('bad', 2)
  client.send('good', 3)

  await until(() => good.length === 2, 'both good messages')
  assert.deepEqual(good, [ 1, 3 ])
  assert.equal(errors.length, 1)
  assert.equal(errors[0][0].code, WSE_ERROR.MESSAGE_PROCESSING_ERROR)
})

test('an unknown op from the port is reported on both ends', async t => {
  const { link, gate, port, server } = await setup(t)
  const gate_errors = collectSignal(gate.error)
  const server_errors = collectSignal(server.error)

  link.port.postMessage({ ops: [ 99 ] })
  port.postMessage({ ops: [ 99 ] })

  await until(() => gate_errors.length && server_errors.length, 'both errors')
  assert.equal(gate_errors[0][0].code, WSE_ERROR.MESSAGE_PROCESSING_ERROR)
  assert.equal(server_errors[0][0].code, WSE_ERROR.MESSAGE_PROCESSING_ERROR)
})

test('a call whose payload cannot cross the port is answered at once', async t => {
  class FnProtocol extends WseJSON {
    unpack (data) {
      const frame = super.unpack(data)
      if (frame[0] === 'bad') frame[1] = { fn: () => {} }
      return frame
    }
  }

  const protocol = new FnProtocol()
  const { server, gate, join } = await setup(t, { server: { protocol } })
  gate.register('bad', () => 1)
  server.when.error(() => {})

  const client = await join('U1')
  const err = await rejection(client.call('bad', 1))

  assert.equal(err.code, WSE_ERROR.MESSAGE_PROCESSING_ERROR)
  assert.equal(err.details.rp, 'bad')
})

test('a leave crossing an unforward and a re-forward keeps the server and the gate in step', async t => {
  const { server, link, gate, join } = await setup(t)
  const client = await join('U1')
  const late = collectChannel(client.channel, 'late')

  gate.clients.get('U1').leave('kicked')
  server.unforward('U1')
  const joined = onceSignal(gate.joined)
  server.forward('U1', link)
  await joined
  await wait(30)

  assert.ok(server._routes.has('U1'), 'the server lost the route')
  assert.ok(gate.clients.has('U1'), 'the gate lost the client')
  gate.send('U1', 'late', 1)
  await until(() => late.length, 'a message after the re-forward')
})

test('a stale client handle can neither send to nor remove a re-forwarded client', async t => {
  const { server, link, gate, join } = await setup(t)
  const client = await join('U1')
  const stale = collectChannel(client.channel, 'stale')
  const old = gate.clients.get('U1')

  server.unforward('U1')
  const joined = onceSignal(gate.joined)
  server.forward('U1', link)
  await joined

  old.send('stale')
  old.leave('ghost')
  await wait(50)

  assert.equal(stale.length, 0)
  assert.ok(gate.clients.has('U1'))
  assert.ok(server._routes.has('U1'))
})

test('a broadcast skips clients the gate has not admitted', async t => {
  const { server, link, gate, url, h } = await setup(t, { gate: { admit: () => {} } })
  const client = h.client(url)
  await client.connect(SECRET, { user_id: 'U1' })
  const secret = collectChannel(client.channel, 'secret')

  server.forward('U1', link)
  await wait(20)
  gate.broadcast('secret', 42)
  await wait(50)

  assert.equal(secret.length, 0)
})

test('a gate call in flight still answers after unforward', async t => {
  const { server, gate, join } = await setup(t)
  gate.register('slow', async () => {
    await wait(100)
    return 'done'
  })
  const client = await join('U1')

  const call = client.call('slow')
  await wait(20)
  server.unforward('U1')

  assert.equal(await call, 'done')
})

test('a closed port takes every client out of the gate too', async t => {
  const { link, gate, join } = await setup(t)
  await join('U1')
  const left = onceSignal(gate.left)

  link.close()

  const [ client, reason ] = await left
  assert.equal(client.cid, 'U1')
  assert.equal(reason, WSE_REASON.GATE_CLOSED)
  assert.equal(gate.clients.size, 0)
})

test('forwarding to a closed link throws LINK_CLOSED', async t => {
  const { server, link, url, h } = await setup(t)
  const client = h.client(url)
  await client.connect(SECRET, { user_id: 'U1' })
  link.close()
  await until(() => link.closed, 'the link to see the close')

  assert.throws(() => server.forward('U1', link), err => err.code === WSE_ERROR.LINK_CLOSED)
  assert.equal(server._routes.size, 0)
})

test('an async admit that rejects refuses the client and reports the error', async t => {
  const { server, link, gate, url, h } = await setup(t, { gate: { admit: async () => { throw new Error('db down') } } })
  const errors = collectSignal(gate.error)
  const left = onceSignal(link.left)

  const client = h.client(url)
  await client.connect(SECRET, { user_id: 'U1' })
  server.forward('U1', link)

  assert.deepEqual(await left, [ 'U1', WSE_REASON.NOT_AUTHORIZED ])
  assert.equal(errors[0][0].message, 'db down')
})

test('forwarding with meta that cannot cross the port throws and routes nothing', async t => {
  const { server, link, url, h } = await setup(t)
  const client = h.client(url)
  await client.connect(SECRET, { user_id: 'U1' })

  assert.throws(() => server.forward('U1', link, { fn () {} }), err => err.code === WSE_ERROR.MESSAGE_PROCESSING_ERROR)
  assert.equal(server._routes.size, 0)
  assert.equal(link.cids.size, 0)
})

test('a gate answer reaches only the device that called', async t => {
  class Sniffer extends WseJSON {
    constructor () {
      super()
      this.types = []
    }

    unpack (data) {
      const frame = super.unpack(data)
      this.types.push(frame[0])
      return frame
    }
  }

  const { server, link, gate, url, h } = await setup(t, { server: { connPerUser: 2 } })
  gate.register('echo', (client, payload) => payload)
  const a = h.client(url)
  const b_protocol = new Sniffer()
  const b = h.client(url, { protocol: b_protocol })
  await a.connect(SECRET, { user_id: 'U1' })
  await b.connect(SECRET, { user_id: 'U1' })
  const joined = onceSignal(gate.joined)
  server.forward('U1', link)
  await joined

  assert.equal(await a.call('echo', 'mine'), 'mine')
  await wait(30)
  assert.equal(b_protocol.types.includes('~wse:response'), false)
})

test('a dropped slow client is gone from server.ws.clients too', async t => {
  const { server, gate, join } = await setup(t, { link: { maxBuffered: 10 } })
  await join('U1')
  const [ conn ] = server.clients.get('U1').conns.values()
  Object.defineProperty(conn.ws_conn, 'bufferedAmount', { value: 1e6 })

  gate.broadcast('tick')

  await until(() => server.ws.clients.size === 0, 'ws to forget the dropped socket', 2000)
})

test('a frame to a socket that is already backed up is copied out of the batch', async t => {
  const { server, gate, join } = await setup(t)
  await join('U1')
  const [ conn ] = server.clients.get('U1').conns.values()
  Object.defineProperty(conn.ws_conn, 'bufferedAmount', { value: 100 })
  const sent = []
  const send = conn.ws_conn.send.bind(conn.ws_conn)
  conn.ws_conn.send = (data, ...rest) => {
    sent.push(data)
    return send(data, ...rest)
  }

  gate.broadcast('a', 'x'.repeat(10))

  await until(() => sent.length === 1, 'the frame')
  assert.equal(sent[0].buffer.byteLength, sent[0].byteLength, 'the frame still pins the batch')
})

test('frames survive a buffer that grows mid-turn, binary views with an offset included', async t => {
  class MixedProtocol extends WseJSON {
    constructor () {
      super()
      this.name = 'wse-spec-mixed'
    }

    pack ({ type, payload, stamp }) {
      if (type !== 'pos' || stamp) return JSON.stringify([ type, payload, stamp ])
      return payload
    }

    unpack (data) {
      return typeof data === 'string' ? JSON.parse(data) : [ 'pos', new Float32Array(data) ]
    }
  }

  const { gate, join } = await setup(t, { server: { protocol: new MixedProtocol() } })
  const client = await join('U1')
  const got = []
  for (const type of [ 'a', 'big', 'pos', 'c' ]) client.channel.on(type, payload => got.push([ type, payload ]))

  const backing = new Float32Array([ 9, 9, 1.5, -2 ])
  const big = 'ї'.repeat(100_000)
  gate.broadcast('a', 1)
  gate.broadcast('big', big)
  gate.broadcast('pos', new Float32Array(backing.buffer, 8, 2))
  gate.broadcast('c', 3)

  await until(() => got.length === 4, 'all four frames')
  assert.deepEqual(got.map(([ type ]) => type), [ 'a', 'big', 'pos', 'c' ])
  assert.equal(got[1][1], big)
  assert.deepEqual(got[2][1], new Float32Array([ 1.5, -2 ]))
})

test('the gate buffer shrinks back after a huge turn', async t => {
  const { gate, join } = await setup(t)
  const client = await join('U1')
  const got = collectChannel(client.channel, 'x')

  gate.broadcast('x', 'z'.repeat(1_000_000))
  gate.flush()
  gate.broadcast('x', 'small')
  gate.flush()

  await until(() => got.length === 2, 'both frames')
  assert.ok(gate._buf.byteLength <= 256 * 1024, `buffer stayed at ${ gate._buf.byteLength }`)
})

test('a gate works with perMessageDeflate on', async t => {
  const { gate, join } = await setup(t, { server: { perMessageDeflate: true } })
  const client = await join('U1')
  const got = collectChannel(client.channel, 'x')

  gate.broadcast('x', 'hello')

  await until(() => got.length, 'the frame')
  assert.deepEqual(got, [ 'hello' ])
})

test('a protocol that packs to something the gate cannot frame throws at the sender', async t => {
  class BlobProtocol extends WseJSON {
    pack (message) {
      return message.type === 'blob' ? new Blob([ 'x' ]) : super.pack(message)
    }
  }

  const { gate } = await setup(t, { gate: { protocol: new BlobProtocol() } })
  assert.throws(() => gate.broadcast('blob'), TypeError)
})

test('a message on the port that is not gate traffic is reported on either end', async t => {
  const { link, gate, port, server } = await setup(t)
  const server_errors = collectSignal(server.error)
  const gate_errors = collectSignal(gate.error)

  port.postMessage(null)
  port.postMessage({})
  port.postMessage({ ops: [ 5, null, null, 0, 4, true ] })
  link.port.postMessage(null)
  link.port.postMessage({ stats: 1 })

  await until(() => server_errors.length === 3 && gate_errors.length === 2, 'every stray message reported')
  for (const [ err ] of [ ...server_errors, ...gate_errors ]) assert.equal(err.code, WSE_ERROR.MESSAGE_PROCESSING_ERROR)
})

test('a gate whose port closed queues nothing', async t => {
  const { link, gate, join } = await setup(t)
  await join('U1')
  const left = onceSignal(gate.left)
  link.close()
  await left

  for (let i = 0; i < 100; i++) gate.broadcast('tick', 'x'.repeat(100))
  gate.send('U1', 'x')

  assert.equal(gate._ops.length, 0)
  assert.equal(gate._len, 0)
})

test('an empty frame does not take the rest of the batch with it', async t => {
  class EmptyProtocol extends WseJSON {
    pack (message) {
      return message.type === 'empty' ? new Uint8Array(0) : super.pack(message)
    }

    unpack (data) {
      return typeof data === 'string' ? super.unpack(data) : [ 'empty', data.byteLength ]
    }
  }

  const protocol = new EmptyProtocol()
  const { server, gate, join } = await setup(t, { server: { protocol } })
  const errors = collectSignal(server.error)
  const client = await join('U1')
  const got = []
  for (const type of [ 'empty', 'after' ]) client.channel.on(type, payload => got.push([ type, payload ]))

  gate.broadcast('empty')
  gate.flush()
  gate.broadcast('empty')
  gate.broadcast('after', 1)

  await until(() => got.length === 3, 'all frames')
  assert.deepEqual(got, [ [ 'empty', 0 ], [ 'empty', 0 ], [ 'after', 1 ] ])
  assert.equal(errors.length, 0)
})

test('a leave crossing a re-admit stops broadcasts to the client', async t => {
  let admits = 0
  const { server, link, gate, join } = await setup(t, { gate: { admit: ({ accept }) => ++admits === 1 && accept() } })
  const client = await join('U1')
  const ticks = collectChannel(client.channel, 'tick')
  await until(() => link.admitted.has('U1'), 'the link to see the admit')

  gate.clients.get('U1').leave('kicked')
  link._join('U1', server._routes.get('U1').meta)
  await wait(50)

  gate.broadcast('tick')
  await wait(50)
  assert.equal(ticks.length, 0)
  assert.equal(link.admitted.has('U1'), false)
})

test('meta changed after forward does not break a re-admit', async t => {
  const { gate, join, h, url } = await setup(t)
  const meta = { seat: 'U1' }
  await join('U1', undefined, meta)
  meta.fn = () => {}

  const again = onceSignal(gate.joined)
  const second = h.client(url)
  await second.connect(SECRET, { user_id: 'U1' })

  assert.deepEqual((await again)[1], { seat: 'U1' })
})

test('a call in flight when the port closes is answered with LINK_CLOSED', async t => {
  const { gate, port, join } = await setup(t)
  gate.register('hang', () => new Promise(() => {}))
  const client = await join('U1')

  const settled = client.call('hang').then(() => 'resolved', err => err.code)
  await wait(30)
  port.close()

  assert.equal(await Promise.race([ settled, wait(1000).then(() => 'hung') ]), WSE_ERROR.LINK_CLOSED)
})

test('a reply the link is not waiting for is dropped', async t => {
  const { server, port, join } = await setup(t)
  const client = await join('U1')
  const forged = collectChannel(client.channel, 'forged')
  const [ conn ] = server.clients.get('U1').conns.values()

  const bytes = new TextEncoder().encode(JSON.stringify([ 'forged', 1 ]))
  port.postMessage({ buf: bytes.buffer, ops: [ 6, 'U1', conn.conn_id, 'nope', 0, bytes.length, true ] }, [ bytes.buffer ])

  await wait(50)
  assert.equal(forged.length, 0)
})

test('the gate keeps at most two batches in flight until the server catches up', async t => {
  const { link, gate, port, join } = await setup(t)
  const client = await join('U1')
  await until(() => link.admitted.has('U1'), 'the link to see the admit')
  await wait(30)
  const got = collectChannel(client.channel, 'n')

  const held = []
  const receive = link._receive.bind(link)
  link._receive = msg => held.push(msg)
  let posts = 0
  const post = port.postMessage.bind(port)
  port.postMessage = (...args) => {
    posts++
    return post(...args)
  }

  for (let i = 0; i < 10; i++) {
    gate.broadcast('n', i)
    await new Promise(resolve => setImmediate(resolve))
  }
  await wait(30)
  assert.equal(posts, 2)

  link._receive = receive
  for (const msg of held) receive(msg)

  await until(() => got.length === 10, 'every frame once the server caught up')
  assert.deepEqual(got, [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ])
})

test('a flush transfers only the bytes it used and keeps the gate buffer', async t => {
  const { gate, port, join } = await setup(t)
  await join('U1')
  await wait(30)
  const sizes = []
  const post = port.postMessage.bind(port)
  port.postMessage = (msg, ...rest) => {
    sizes.push(msg.buf?.byteLength)
    return post(msg, ...rest)
  }
  const buf = gate._buf

  gate.broadcast('x', 'abc')
  gate.flush()

  assert.equal(gate._buf, buf)
  assert.deepEqual(sizes, [ Buffer.byteLength('["x","abc",null]') ])
})

test('frames to one socket in one batch go out in one write', async t => {
  const { server, gate, join } = await setup(t)
  const client = await join('U1')
  await wait(30)
  const got = []
  for (const type of [ 'a', 'b', 'c' ]) client.channel.on(type, () => got.push(type))
  const [ conn ] = server.clients.get('U1').conns.values()
  const socket = conn.ws_conn._socket
  let writes = 0
  for (const name of [ '_write', '_writev' ]) {
    const original = socket[name].bind(socket)
    socket[name] = (...args) => {
      writes++
      return original(...args)
    }
  }

  gate.broadcast('a')
  gate.send('U1', 'b')
  gate.broadcast('c')

  await until(() => got.length === 3, 'all three frames')
  assert.deepEqual(got, [ 'a', 'b', 'c' ])
  assert.equal(writes, 1)
})

test('frames of one batch count against maxBuffered from where the socket stood before it', async t => {
  const { server, gate, join } = await setup(t, { link: { maxBuffered: 100 } })
  const client = await join('U1')
  await wait(30)
  const got = collectChannel(client.channel, 'x')

  for (let i = 0; i < 3; i++) gate.broadcast('x', 'y'.repeat(80))

  await until(() => got.length === 3, 'all three frames')
  assert.ok(server.clients.has('U1'), 'dropped for frames of its own batch')
})
