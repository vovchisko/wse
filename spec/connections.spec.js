import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { WSE_REASON, WSE_STATUS } from '../src/common.js'

import { collectSignal, harness, onceSignal, SECRET, until, wait } from './_harness.js'

test('one connection per user by default: the older device is dropped', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const first = h.client(url)
  const second = h.client(url)

  const first_closed = onceSignal(first.closed)
  const second_closed = collectSignal(second.closed)

  await first.connect(SECRET, { user_id: 'U1' })
  await second.connect(SECRET, { user_id: 'U1' })

  assert.deepEqual(await first_closed, [ 1000, WSE_REASON.CLIENTS_CONCURRENCY ])
  await wait(120)
  assert.deepEqual(second_closed, [])
  assert.equal(second.status, WSE_STATUS.READY)
})

test('connPerUser 2: the third device pushes out the first', async t => {
  const h = harness(t)
  const { url } = await h.server({ connPerUser: 2 })
  const first = h.client(url)
  const second = h.client(url)
  const third = h.client(url)

  const first_closed = onceSignal(first.closed)
  const others_closed = [ collectSignal(second.closed), collectSignal(third.closed) ]

  await first.connect(SECRET, { user_id: 'U1' })
  await second.connect(SECRET, { user_id: 'U1' })
  await third.connect(SECRET, { user_id: 'U1' })

  assert.deepEqual(await first_closed, [ 1000, WSE_REASON.CLIENTS_CONCURRENCY ])
  await wait(120)
  assert.deepEqual(others_closed, [ [], [] ])
})

test('connPerUser counts only the devices that got through the challenge', async t => {
  const h = harness(t)
  const { server, url } = await h.server({
    connPerUser: 2,
    identify: ({ identity, meta, accept, challenge }) =>
      identity === SECRET && challenge.response === 3 ? accept(meta.user_id) : accept(false),
  })
  server.useChallenge((identity, meta, quest) => quest({ a: 1, b: 2 }))

  const good = h.client(url)
  const bad = h.client(url)
  good.challenge((quest, solve) => solve(quest.a + quest.b))
  bad.challenge((quest, solve) => solve('clearly-wrong-value'))

  await good.connect(SECRET, { user_id: 'U1' })
  await assert.rejects(bad.connect(SECRET, { user_id: 'U1' }))

  await wait(120)
  assert.equal(good.status, WSE_STATUS.READY)
  assert.equal(server.clients.get('U1').conns.size, 1)
})

test('client.close reports the code and reason back to the client', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  const closed = onceSignal(client.closed)
  await client.connect(SECRET)
  client.close('CUSTOM_REASON')

  assert.deepEqual(await closed, [ 1000, 'CUSTOM_REASON' ])
  assert.equal(client.status, WSE_STATUS.OFFLINE)
})

test('a client closing itself reaches disconnected and left on the server', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const disconnected = onceSignal(server.disconnected)
  const left = onceSignal(server.left)

  await client.connect(SECRET, { user_id: 'U1' })
  client.close()

  const [ conn, , disconnect_reason ] = await disconnected
  const [ identity, , left_reason ] = await left

  assert.equal(conn.cid, 'U1')
  assert.equal(disconnect_reason, WSE_REASON.BY_CLIENT)
  assert.equal(identity.cid, 'U1')
  assert.equal(left_reason, WSE_REASON.BY_CLIENT)
  assert.equal(server.clients.has('U1'), false)
})

test('left carries the close code of the last connection', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const left = onceSignal(server.left)

  await client.connect(SECRET, { user_id: 'U1' })
  await until(() => server.clients.has('U1'), 'the identity to register')
  client._ws.close(4001, 'gone')

  const [ , code ] = await left
  assert.equal(code, 4001)
})

test('dropClient emits left exactly once', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const left = collectSignal(server.left)

  await client.connect(SECRET, { user_id: 'U1' })
  await until(() => server.clients.has('U1'), 'the identity to register')

  server.dropClient('U1')

  await until(() => left.length, 'left to fire')
  await wait(150)
  assert.equal(left.length, 1)
})

test('dropClient on an unknown id is a no-op', async t => {
  const h = harness(t)
  const { server } = await h.server()

  const left = collectSignal(server.left)
  server.dropClient('nobody')

  assert.deepEqual(left, [])
})

test('twenty clients connect and are all seen as joined', async t => {
  const h = harness(t)
  const { server, url } = await h.server()

  const joined = collectSignal(server.joined)
  const clients = Array.from({ length: 20 }, () => h.client(url))

  await Promise.all(clients.map((client, i) => client.connect(SECRET, { user_id: `U${ i }` })))

  await until(() => joined.length === 20, 'all twenty identities to join')
  assert.equal(server.clients.size, 20)
})

test('twenty clients dropped by the server all see the reason', async t => {
  const h = harness(t)
  const { server, url } = await h.server()

  server.when.joined(identity => process.nextTick(() => identity.drop('BECAUSE-OF-TEST')))

  const clients = Array.from({ length: 20 }, () => h.client(url))
  const closes = clients.map(client => collectSignal(client.closed))

  await Promise.all(clients.map((client, i) => client.connect(SECRET, { user_id: `U${ i }` }).catch(() => {})))

  await until(() => closes.every(log => log.length === 1), 'all twenty clients to close')
  assert.deepEqual([ ...new Set(closes.map(log => log[0].join(':'))) ], [ '1000:BECAUSE-OF-TEST' ])
  await until(() => server.clients.size === 0, 'the server to forget every identity')
})
