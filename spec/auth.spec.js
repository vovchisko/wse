import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { WSE_ERROR, WSE_REASON, WSE_STATUS, WseError } from '../src/common.js'
import { WseServer }                                  from '../src/server.js'
import { WseClient }                                  from '../src/client.js'

import {
  collectSignal, harness, onceSignal, rejection, SECRET, socketClosed, until, wait, WSE_TYPES,
} from './_harness.js'

test('server refuses to start without an identify handler', () => {
  assert.throws(() => new WseServer({ port: 0 }), err => err.code === WSE_ERROR.IDENTIFY_HANDLER_MISSING)
})

test('accepted client receives the welcome payload and becomes ready', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  const ready = onceSignal(client.ready)
  const welcome = await client.connect(SECRET, { user_id: 'U1' })

  assert.deepEqual(welcome, { hey: 'welcome-payload' })
  assert.deepEqual(await ready, [ { hey: 'welcome-payload' } ])
  assert.equal(client.status, WSE_STATUS.READY)
})

test('connected fires on the open socket, before the welcome arrives', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  const order = []
  client.when.connected(() => order.push('connected'))
  client.when.ready(() => order.push('ready'))

  await client.connect(SECRET)

  assert.deepEqual(order, [ 'connected', 'ready' ])
})

test('identify sees the raw identity and meta, accept() assigns the cid', async t => {
  const h = harness(t)
  let seen = null
  const { server, url } = await h.server({
    identify: ({ identity, meta, accept }) => {
      seen = { identity, meta }
      accept('U1')
    },
  })
  const client = h.client(url)

  const joined = onceSignal(server.joined)
  await client.connect(SECRET, { test_value: 123 })
  const [ identity, meta ] = await joined

  assert.equal(seen.identity, SECRET)
  assert.equal(seen.meta.test_value, 123)
  assert.equal(identity.cid, 'U1')
  assert.equal(meta.test_value, 123)
})

test('a refused identity is closed with NOT_AUTHORIZED', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  const closed = onceSignal(client.closed)
  const err = await rejection(client.connect('WRONG_SECRET'))

  assert.equal(err.code, WSE_ERROR.NOT_AUTHORIZED)
  assert.deepEqual(await closed, [ 1000, WSE_REASON.NOT_AUTHORIZED ])
})

test('connect rejects with a WseError, not a bare string', async t => {
  const h = harness(t)
  const { url } = await h.server({ identify: ({ refuse }) => refuse() })
  const client = h.client(url)

  const err = await rejection(client.connect('bad-token'))

  assert.ok(err instanceof WseError, `rejected with ${ err?.constructor?.name }`)
  assert.equal(err.code, WSE_ERROR.NOT_AUTHORIZED)
})

test('connect settles on refusal even with reconnect enabled', async t => {
  const h = harness(t)
  const { url } = await h.server({ identify: ({ refuse }) => refuse() })
  const client = h.client(url, { re: true })

  // A refusal closes with 1000, which is not a retry code - nothing would ever
  // reconnect, so the promise has to reject instead of hanging forever.
  const err = await rejection(client.connect('bad-token'))

  assert.equal(err.code, WSE_ERROR.NOT_AUTHORIZED)
})

test('a stranger sending unparsable junk is dropped with PROTOCOL_ERR', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const socket = h.socket(url)

  const closed = socketClosed(socket)
  socket.on('open', () => socket.send('not-json-at-all'))

  assert.deepEqual(await closed, [ 1000, WSE_REASON.PROTOCOL_ERR ])
})

test('unparsable junk surfaces as MESSAGE_PROCESSING_ERROR with the connection', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const socket = h.socket(url)

  const errors = collectSignal(server.error)
  socket.on('open', () => socket.send('not-json-at-all'))

  await until(() => errors.length, 'server to report the protocol error')
  const [ err, conn ] = errors[0]

  assert.equal(err.code, WSE_ERROR.MESSAGE_PROCESSING_ERROR)
  assert.ok(err.details.raw instanceof SyntaxError)
  assert.ok(conn)
  assert.equal(err.message_from, 'stranger')
})

test('a stranger whose first frame is not hi is dropped with PROTOCOL_ERR', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const socket = h.socket(url)

  const closed = socketClosed(socket)
  socket.on('open', () => socket.send(JSON.stringify([ 'some-message', { a: 1 }, undefined ])))

  assert.deepEqual(await closed, [ 1000, WSE_REASON.PROTOCOL_ERR ])
})

test('a connection that never authenticates is dropped after tO', async t => {
  const h = harness(t)
  const { url } = await h.server({ tO: 0.5 })

  // Opens the socket and then says nothing at all.
  const closed = socketClosed(h.socket(url))

  assert.deepEqual(await closed, [ 1000, WSE_REASON.AUTH_TIMEOUT ])
})

test('tO of 0 disables the auth deadline', async t => {
  const h = harness(t)
  const { url } = await h.server({ tO: 0 })
  const socket = h.socket(url)

  let closed = false
  socket.on('close', () => { closed = true })

  await new Promise(resolve => socket.on('open', resolve))
  await wait(300)

  assert.equal(closed, false)
})

test('challenge-response: the solved challenge reaches identify', async t => {
  const h = harness(t)
  let response = null
  const { server, url } = await h.server({
    identify: ({ identity, meta, accept, challenge }) => {
      response = challenge.response
      identity === SECRET && challenge.response === 3 ? accept(meta.user_id, { ok: true }) : accept(false)
    },
  })
  server.useChallenge((identity, meta, quest) => quest({ a: 1, b: 2 }))

  const client = h.client(url)
  client.challenge((quest, solve) => solve(quest.a + quest.b))

  const welcome = await client.connect(SECRET, { user_id: 'U1' })

  assert.equal(response, 3)
  assert.deepEqual(welcome, { ok: true })
})

test('challenge-response: a wrong solution is refused', async t => {
  const h = harness(t)
  const { server, url } = await h.server({
    identify: ({ identity, accept, refuse, challenge }) =>
      identity === SECRET && challenge.response === 42 ? accept('U1') : refuse(),
  })
  server.useChallenge((identity, meta, quest) => quest({ a: 41, b: 1 }))

  const client = h.client(url)
  client.challenge((quest, solve) => solve(quest.a - quest.b)) // clearly wrong

  let ready = false
  client.when.ready(() => { ready = true })

  const err = await rejection(client.connect(SECRET, { user_id: 'U1' }))

  assert.equal(err.code, WSE_ERROR.NOT_AUTHORIZED)
  assert.equal(ready, false)
})

test('challenge-response: the generator can refuse before the client is asked', async t => {
  const h = harness(t)
  const { server, url } = await h.server({ identify: ({ accept }) => accept('U1') })
  server.useChallenge((identity, meta, quest, refuse) => refuse())

  const client = h.client(url)
  let asked = false
  client.challenge(() => { asked = true })

  const err = await rejection(client.connect(SECRET, { user_id: 'U1' }))

  assert.equal(err.code, WSE_ERROR.NOT_AUTHORIZED)
  assert.equal(asked, false)
})

test('challenge-response: a null solution is accepted and the real meta reaches joined', async t => {
  const h = harness(t)
  const { server, url } = await h.server({
    identify: ({ accept, challenge }) => challenge.response === null ? accept('U1', { ok: true }) : accept(false),
  })
  server.useChallenge((identity, meta, quest) => quest({ q: 'answer with null' }))

  const errors = collectSignal(server.error)
  const connected = collectSignal(server.connected)
  const joined = onceSignal(server.joined)

  const client = h.client(url)
  client.challenge((quest, solve) => solve(null))

  await client.connect(SECRET, { user_id: 'U1' })
  const [ , meta ] = await joined

  assert.deepEqual(errors, [])
  assert.equal(connected.length, 1)
  assert.deepEqual(meta, { user_id: 'U1' })
})

test('challenge-response: a bogus frame instead of the solution never reaches identify', async t => {
  const h = harness(t)
  let identifyCalls = 0
  const { server, url } = await h.server({
    identify: ({ accept }) => {
      identifyCalls++
      accept('U1') // deliberately lax, like handlers that only check the identity
    },
  })
  server.useChallenge((identity, meta, quest) => quest({ a: 1, b: 2 }))

  const joined = collectSignal(server.joined)
  const socket = h.socket(url)
  const closed = socketClosed(socket)

  socket.on('open', () => socket.send(JSON.stringify([ WSE_TYPES.hi, { identity: SECRET, meta: {} }, undefined ])))
  socket.on('message', raw => {
    const [ type ] = JSON.parse(raw)
    if (type === WSE_TYPES.challenge) socket.send(JSON.stringify([ '~wse:junk', 'nope', undefined ]))
  })

  assert.deepEqual(await closed, [ 1000, WSE_REASON.PROTOCOL_ERR ])
  assert.equal(identifyCalls, 0)
  assert.deepEqual(joined, [])
})

test('useChallenge rejects a non-function generator', async t => {
  const h = harness(t)
  const { server } = await h.server()

  assert.throws(() => server.useChallenge('nope'), err => err.code === WSE_ERROR.INVALID_CRA_GENERATOR)
})

test('client.challenge rejects a non-function solver', () => {
  const client = new WseClient({ url: 'ws://localhost:1' })

  assert.throws(() => client.challenge('nope'), err => err.code === WSE_ERROR.INVALID_CRA_HANDLER)
})
