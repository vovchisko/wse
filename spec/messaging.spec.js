import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { WSE_ERROR } from '../src/common.js'
import { WseJSON }   from '../src/protocol.js'

import { collectChannel, collectSignal, harness, onceSignal, SECRET, until, wait } from './_harness.js'

test('client message reaches the server channel with its connection', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const got = []
  server.channel.on('test-message', (conn, payload) => got.push([ conn.cid, payload ]))

  await client.connect(SECRET, { user_id: 'U1' })
  client.send('test-message', { value: 42 })

  await until(() => got.length, 'the server to receive the message')
  assert.deepEqual(got[0], [ 'U1', { value: 42 } ])
})

test('a client message nobody listens for lands on server.ignored', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const ignored = collectSignal(server.ignored)

  await client.connect(SECRET, { user_id: 'U1' })
  client.send('test', { value: 42 })

  await until(() => ignored.length, 'the server to ignore the message')
  const [ conn, type, payload ] = ignored[0]

  assert.equal(conn.cid, 'U1')
  assert.equal(type, 'test')
  assert.deepEqual(payload, { value: 42 })
})

test('server message reaches the client channel', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const got = collectChannel(client.channel, 'test-message')
  server.when.joined(identity => identity.send('test-message', { value: 42 }))

  await client.connect(SECRET)

  await until(() => got.length, 'the client to receive the message')
  assert.deepEqual(got[0], { value: 42 })
})

test('a server message nobody listens for lands on client.ignored', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const ignored = collectSignal(client.ignored)
  server.when.joined(identity => identity.send('test', { value: 42 }))

  await client.connect(SECRET)

  await until(() => ignored.length, 'the client to ignore the message')
  const [ type, payload ] = ignored[0]

  assert.equal(type, 'test')
  assert.deepEqual(payload, { value: 42 })
})

test('sending before the connection is ready throws CONNECTION_NOT_READY', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  const errors = collectSignal(client.error)

  assert.throws(() => client.send('anything', 1), err => err.code === WSE_ERROR.CONNECTION_NOT_READY)
  assert.equal(errors[0][0].code, WSE_ERROR.CONNECTION_NOT_READY)
})

test('ten round trips over the channel', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  assert.ok(await pingPong(server, client, 10) >= 10)
})

test('a thousand round trips over the channel', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  assert.ok(await pingPong(server, client, 1000) >= 1000)
})

test('broadcast reaches every connected identity', async t => {
  const h = harness(t)
  const { server, url } = await h.server()

  const clients = [ 1, 2, 3, 4 ].map(() => h.client(url))
  const seen = clients.map(client => collectChannel(client.channel, 'broad-message'))

  await Promise.all(clients.map((client, i) => client.connect(SECRET, { user_id: `U${ i }` })))
  server.broadcast('broad-message', { test: 42 })

  await until(() => seen.every(log => log.length === 1), 'all four clients to receive the broadcast')
  assert.deepEqual(seen.map(log => log[0]), clients.map(() => ({ test: 42 })))
})

test('broadcast serializes the frame exactly once', async t => {
  const h = harness(t)

  class CountingProtocol extends WseJSON {
    constructor () {
      super()
      this.broadPacks = 0
    }

    pack (message) {
      if (message.type === 'broad') this.broadPacks++
      return super.pack(message)
    }
  }

  const protocol = new CountingProtocol()
  const { server, url } = await h.server({ protocol })

  const clients = [ 1, 2, 3, 4 ].map(() => h.client(url))
  const seen = clients.map(client => collectChannel(client.channel, 'broad'))

  await Promise.all(clients.map((client, i) => client.connect(SECRET, { user_id: `U${ i }` })))
  server.broadcast('broad', { test: 1 })

  await until(() => seen.every(log => log.length === 1), 'all four clients to receive the broadcast')
  assert.equal(protocol.broadPacks, 1)
})

test('server.send(cid) reaches every device of that identity exactly once', async t => {
  const h = harness(t)
  const { server, url } = await h.server({ connPerUser: 3 })

  const clients = [ 1, 2, 3 ].map(() => h.client(url))
  const seen = clients.map(client => collectChannel(client.channel, 'msg'))

  for (const client of clients) await client.connect(SECRET, { user_id: 'U1' })
  await until(() => server.clients.get('U1')?.conns.size === 3, 'all three devices to be registered')

  server.send('U1', 'msg', { hey: 'there' })

  await until(() => seen.every(log => log.length === 1), 'all three devices to receive the message')
  await wait(100)
  assert.deepEqual(seen.map(log => log.length), [ 1, 1, 1 ])
})

test('conn.send hits one device, identity.send hits all of them', async t => {
  const h = harness(t)
  const { server, url } = await h.server({ connPerUser: 2 })

  const first = h.client(url)
  const second = h.client(url)

  const only = [ collectChannel(first.channel, 'only'), collectChannel(second.channel, 'only') ]
  const both = [ collectChannel(first.channel, 'both'), collectChannel(second.channel, 'both') ]

  server.channel.on('hey', conn => {
    conn.client.send('both')
    conn.send('only')
  })

  await first.connect(SECRET, { user_id: 'U1' })
  await second.connect(SECRET, { user_id: 'U1' })

  first.send('hey')
  first.send('hey')
  second.send('hey')

  // three 'hey' messages: 3 personal replies, 3 identity-wide replies seen twice each
  await until(
      () => only[0].length === 2 && only[1].length === 1 && both[0].length === 3 && both[1].length === 3,
      'every message to arrive on the right device',
  )
  await wait(100)
  assert.deepEqual([ only[0].length, only[1].length, both[0].length, both[1].length ], [ 2, 1, 3, 3 ])
})

test('meta given to connect reaches joined', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const joined = onceSignal(server.joined)
  await client.connect(SECRET, { user_id: 'U1', test_value: 123 })
  const [ , meta ] = await joined

  assert.equal(meta.test_value, 123)
})

/**
 * Bounce one counter between the two sides until it passes `limit`.
 * Resolves with the value the client saw last.
 */
function pingPong (server, client, limit) {
  server.channel.on('count', (conn, count) => conn.send('count', count + 1))

  const done = new Promise(resolve => {
    client.channel.on('count', count => count >= limit ? resolve(count) : client.send('count', count + 1))
  })

  return client.connect(SECRET).then(() => {
    client.send('count', 0)
    return done
  })
}
