import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { WSE_ERROR, WSE_STATUS } from '../src/common.js'

import { collectSignal, harness, rejection, SECRET, until, wait } from './_harness.js'

test('status walks IDLE, CONNECTING, READY, OFFLINE', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  assert.equal(client.status, WSE_STATUS.IDLE)

  const updates = collectSignal(client.updated)

  await client.connect(SECRET)
  client.close()
  await until(() => client.status === WSE_STATUS.OFFLINE, 'the client to go offline')

  assert.deepEqual(updates.flat(), [ WSE_STATUS.CONNECTING, WSE_STATUS.READY, WSE_STATUS.OFFLINE ])
})

test('status is assigned before updated fires', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  const stale = []
  client.when.updated(status => {
    if (client.status !== status) stale.push(`${ status } while client.status was ${ client.status }`)
  })

  await client.connect(SECRET)
  client.close()
  await until(() => client.status === WSE_STATUS.OFFLINE, 'the client to go offline')

  assert.deepEqual(stale, [])
})

test('connecting while already connected throws CLIENT_ALREADY_CONNECTED', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  await client.connect(SECRET)

  assert.throws(() => client.connect(SECRET), err => err.code === WSE_ERROR.CLIENT_ALREADY_CONNECTED)
})

test('a client with re:true comes back after an abnormal close', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url, { re: true })
  client.re_t0 = 10 // the retry delay is re_t0 plus up to a second of jitter

  await client.connect(SECRET, { user_id: 'U1' })
  assert.equal(client.reused, 1)

  // kill the socket from underneath the client - an abnormal close is a retry code
  for (const ws_conn of server.ws.clients) ws_conn.terminate()

  await until(() => client.status === WSE_STATUS.READY && client.reused === 2, 'the client to reconnect', 4000)
  assert.equal(server.clients.get('U1').conns.size, 1)
})

test('jump moves a live client to another server', async t => {
  const h = harness(t)
  const a = await h.server({ identify: ({ accept }) => accept('U1', 'server-a') })
  const b = await h.server({ identify: ({ accept }) => accept('U1', 'server-b') })

  const client = h.client(a.url)

  assert.equal(await client.connect(SECRET), 'server-a')
  assert.equal(await client.jump(b.url), 'server-b')
  assert.equal(await client.jump(a.url), 'server-a')

  assert.equal(client.url, a.url)
  assert.equal(client.status, WSE_STATUS.READY)
})

test('jump authenticates with the identity it is given', async t => {
  const h = harness(t)
  // each server echoes the user it authenticated, so the welcome shows which
  // identity actually reached identify()
  const echo = ({ identity, accept }) => accept(String(identity.user), { who: String(identity.user) })
  const a = await h.server({ identify: echo })
  const b = await h.server({ identify: echo })

  const client = h.client(a.url)

  const first = await client.connect({ user: 'U1' })
  const second = await client.jump(b.url, { user: 'U2' })

  assert.equal(first.who, 'U1')
  assert.equal(second.who, 'U2')
})

test('jump keeps the current credentials when none are given', async t => {
  const h = harness(t)
  const echo = ({ identity, accept }) => accept(String(identity.user), { who: String(identity.user) })
  const a = await h.server({ identify: echo })
  const b = await h.server({ identify: echo })

  const client = h.client(a.url)

  await client.connect({ user: 'U1' })
  const welcome = await client.jump(b.url)

  assert.equal(welcome.who, 'U1')
})

test('jump on an idle client behaves like connect', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client('ws://localhost:1')

  const welcome = await client.jump(url, SECRET, { user_id: 'U1' })

  assert.deepEqual(welcome, { hey: 'welcome-payload' })
  assert.equal(client.status, WSE_STATUS.READY)
})

test('a client cannot reach a server that is not there', async t => {
  const h = harness(t)
  const client = h.client('ws://localhost:1')

  const err = await rejection(client.connect(SECRET))

  assert.equal(err.code, WSE_ERROR.WS_CLIENT_ERROR)
})
