import { test }           from 'node:test'
import assert             from 'node:assert/strict'
import { MessageChannel } from 'node:worker_threads'

import { WSE_REASON } from '../src/common.js'
import { WseJSON }    from '../src/protocol.js'
import { WseGate }    from '../src/gate.js'

import { collectChannel, harness, onceSignal, SECRET, socketClosed, until, wait, WSE_TYPES } from './_harness.js'

const encoder = new TextEncoder()

class CountingJSON extends WseJSON {
  constructor () {
    super()
    this.unpacks = 0
  }

  unpack (data) {
    this.unpacks++
    return super.unpack(data)
  }
}

const order = (channel, types) => {
  const got = []
  for (const type of types) channel.on(type, (...args) => got.push([ type, args.at(-1) === undefined ? args[0] : args.at(-1) ]))
  return got
}

test('WseJSON joins frames into one that unpacks to the list of them', () => {
  const protocol = new WseJSON()
  const parts = [ protocol.pack({ type: 'a', payload: 1 }), protocol.pack({ type: 'b', payload: 'ї' }) ].map(p => encoder.encode(p))

  assert.deepEqual(protocol.unpack(protocol.join(parts).buffer), [ [ 'a', 1, null ], [ 'b', 'ї', null ] ])
})

test('server.cork() joins everything a socket gets into one frame', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const protocol = new CountingJSON()
  const client = h.client(url, { protocol })
  const got = []
  for (const type of [ 'a', 'b', 'c' ]) client.channel.on(type, payload => got.push([ type, payload ]))
  await client.connect(SECRET, { user_id: 'U1' })
  const [ conn ] = server.clients.get('U1').conns.values()
  protocol.unpacks = 0

  server.cork()
  conn.send('a', 1)
  server.broadcast('b', 2)
  server.send('U1', 'c', 3)
  await wait(30)
  assert.equal(got.length, 0, 'sent while corked')
  server.uncork()

  await until(() => got.length === 3, 'all three')
  assert.deepEqual(got, [ [ 'a', 1 ], [ 'b', 2 ], [ 'c', 3 ] ])
  assert.equal(protocol.unpacks, 1)
})

test('cork() nests: only the outermost uncork() writes', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)
  const got = collectChannel(client.channel, 'a')
  await client.connect(SECRET, { user_id: 'U1' })

  server.cork()
  server.cork()
  server.send('U1', 'a', 1)
  server.uncork()
  await wait(30)
  assert.equal(got.length, 0)
  server.uncork()
  server.uncork()

  await until(() => got.length, 'the message')
})

test('a server call made while corked goes out with the batch and settles', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)
  client.register('ping', () => 'pong')
  const notes = collectChannel(client.channel, 'note')
  await client.connect(SECRET, { user_id: 'U1' })
  const [ conn ] = server.clients.get('U1').conns.values()

  server.cork()
  const call = conn.call('ping')
  conn.send('note', 1)
  server.uncork()

  assert.equal(await call, 'pong')
  assert.deepEqual(notes, [ 1 ])
})

test('dropping a connection writes what was queued for it first', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)
  const bye = collectChannel(client.channel, 'bye')
  await client.connect(SECRET, { user_id: 'U1' })
  const [ conn ] = server.clients.get('U1').conns.values()
  const closed = onceSignal(client.closed)

  server.cork()
  conn.send('bye', 1)
  conn.drop('kicked')
  server.uncork()

  await closed
  assert.deepEqual(bye, [ 1 ])
})

test('a welcome joined with the first messages still connects the client', async t => {
  const h = harness(t)
  const { server, url } = await h.server({
    identify: ({ accept }) => {
      server.cork()
      accept('U1', { hi: 1 })
      server.uncork()
    },
  })
  server.when.joined(client => client.send('hello', 2))
  const client = h.client(url)
  const hello = collectChannel(client.channel, 'hello')

  assert.deepEqual(await client.connect(SECRET), { hi: 1 })
  await until(() => hello.length, 'the message joined with the welcome')
})

test('client.cork() joins messages and calls into one frame for the server', async t => {
  const h = harness(t)
  const protocol = new CountingJSON()
  const { server, url } = await h.server({ protocol })
  const got = []
  for (const type of [ 'a', 'b' ]) server.channel.on(type, (conn, payload) => got.push([ type, payload ]))
  server.register('add', (conn, { x, y }) => x + y)
  const client = h.client(url)
  await client.connect(SECRET)
  protocol.unpacks = 0

  client.cork()
  client.send('a', 1)
  const sum = client.call('add', { x: 2, y: 3 })
  client.send('b', 4)
  client.uncork()

  assert.equal(await sum, 5)
  await until(() => got.length === 2, 'both messages')
  assert.deepEqual(got, [ [ 'a', 1 ], [ 'b', 4 ] ])
  assert.equal(protocol.unpacks, 1)
})

test('a protocol without join() sends corked frames one by one', async t => {
  class NoJoin extends WseJSON {
    constructor () {
      super()
      this.join = undefined
      this.unpacks = 0
    }

    unpack (data) {
      this.unpacks++
      return super.unpack(data)
    }
  }

  const h = harness(t)
  const { server, url } = await h.server({ protocol: new NoJoin() })
  const protocol = new NoJoin()
  const client = h.client(url, { protocol })
  const got = collectChannel(client.channel, 'a')
  await client.connect(SECRET, { user_id: 'U1' })
  protocol.unpacks = 0

  server.cork()
  for (let i = 0; i < 3; i++) server.send('U1', 'a', i)
  server.uncork()

  await until(() => got.length === 3, 'all three')
  assert.deepEqual(got, [ 0, 1, 2 ])
  assert.equal(protocol.unpacks, 3)
})

test('a stranger sending a joined frame is dropped with PROTOCOL_ERR', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const socket = h.socket(url)
  const closed = socketClosed(socket)

  socket.on('open', () => socket.send(JSON.stringify([ [ WSE_TYPES.hi, { identity: SECRET, meta: {} } ] ])))

  assert.deepEqual(await closed, [ 1000, WSE_REASON.PROTOCOL_ERR ])
})

test('a joined frame with something other than a tuple in it closes the socket with PROTOCOL_ERR', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const socket = h.socket(url)
  const closed = socketClosed(socket)

  socket.on('open', () => socket.send(JSON.stringify([ WSE_TYPES.hi, { identity: SECRET, meta: {} } ])))
  socket.on('message', raw => {
    if (JSON.parse(raw)[0] === WSE_TYPES.welcome) socket.send(JSON.stringify([ [ 'a', 1 ], 'junk' ]))
  })

  assert.deepEqual(await closed, [ 1000, WSE_REASON.PROTOCOL_ERR ])
})

test('a gate turn reaches each client as one frame, broadcasts and sends in order', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const { port1, port2 } = new MessageChannel()
  t.after(() => port1.close())
  const link = server.link(port1)
  const gate = new WseGate({ port: port2 })

  const clients = {}
  for (const cid of [ 'U1', 'U2' ]) {
    const protocol = new CountingJSON()
    const client = h.client(url, { protocol })
    await client.connect(SECRET, { user_id: cid })
    const joined = onceSignal(gate.joined)
    server.forward(cid, link)
    await joined
    clients[cid] = { protocol, got: order(client.channel, [ 'tick', 'own' ]) }
  }
  await until(() => link.admitted.size === 2, 'both admitted')
  await wait(30)
  for (const { protocol } of Object.values(clients)) protocol.unpacks = 0

  gate.broadcast('tick', 1)
  gate.send('U1', 'own', 'u1')
  gate.broadcast('tick', 2)
  gate.send('U2', 'own', 'u2')

  await until(() => clients.U1.got.length === 3 && clients.U2.got.length === 3, 'every message')
  assert.deepEqual(clients.U1.got, [ [ 'tick', 1 ], [ 'own', 'u1' ], [ 'tick', 2 ] ])
  assert.deepEqual(clients.U2.got, [ [ 'tick', 1 ], [ 'tick', 2 ], [ 'own', 'u2' ] ])
  assert.equal(clients.U1.protocol.unpacks, 1)
  assert.equal(clients.U2.protocol.unpacks, 1)
})

test('a gate turn joins text frames and binary frames separately, keeping their order', async t => {
  class MixedProtocol extends WseJSON {
    constructor () {
      super()
      this.name = 'wse-spec-mixed'
      this.received = []
    }

    pack ({ type, payload, stamp }) {
      if (type !== 'pos' || stamp) return JSON.stringify([ type, payload, stamp ])
      return payload
    }

    join (parts, text) {
      if (text) return super.join(parts)
    }

    unpack (data) {
      this.received.push(typeof data === 'string' ? 'text' : 'binary')
      return typeof data === 'string' ? JSON.parse(data) : [ 'pos', new Float32Array(data) ]
    }
  }

  const h = harness(t)
  const { server, url } = await h.server({ protocol: new MixedProtocol() })
  const { port1, port2 } = new MessageChannel()
  t.after(() => port1.close())
  const link = server.link(port1)
  const gate = new WseGate({ port: port2, protocol: new MixedProtocol() })
  const protocol = new MixedProtocol()
  const client = h.client(url, { protocol })
  await client.connect(SECRET, { user_id: 'U1' })
  const joined = onceSignal(gate.joined)
  server.forward('U1', link)
  await joined
  await until(() => link.admitted.has('U1'), 'the admit')
  await wait(30)
  const got = order(client.channel, [ 'a', 'b', 'pos' ])
  protocol.received.length = 0

  gate.broadcast('a', 1)
  gate.broadcast('b', 2)
  gate.broadcast('pos', new Float32Array([ 1 ]))
  gate.broadcast('pos', new Float32Array([ 2 ]))
  gate.broadcast('a', 3)

  await until(() => got.length === 5, 'every message')
  assert.deepEqual(got.map(([ type ]) => type), [ 'a', 'b', 'pos', 'pos', 'a' ])
  assert.deepEqual(protocol.received, [ 'text', 'binary', 'binary', 'text' ])
})
