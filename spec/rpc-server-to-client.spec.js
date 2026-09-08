import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { WSE_ERROR, WSE_STATUS, WseError } from '../src/common.js'
import { WseJSON }                         from '../src/protocol.js'

import { harness, onceSignal, outcome, rejection, SECRET, until, wait, WSE_TYPES } from './_harness.js'

test('a procedure registered on the client returns its result to the server', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  client.register('double', async payload => {
    await wait(50)
    return payload.value * 2
  })

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  assert.equal(await connection.call('double', { value: 21 }), 42)
})

test('calling a procedure the client does not have rejects with RP_NOT_REGISTERED', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  const err = await rejection(connection.call('no-such-rp'))
  assert.equal(err.code, WSE_ERROR.RP_NOT_REGISTERED)
})

test('a vanilla Error on the client becomes RP_EXECUTION_FAILED with the procedure name', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  client.register('boom', () => { throw new Error('Vanilla error') })

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  const err = await rejection(connection.call('boom', { value: 1 }))
  assert.equal(err.code, WSE_ERROR.RP_EXECUTION_FAILED)
  assert.equal(err.details.rp, 'boom')
})

test('a WseError thrown on the client keeps its code and details', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  client.register('boom', () => { throw new WseError('test-err-code', { fun: 1 }) })

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  const err = await rejection(connection.call('boom', { value: 1 }))
  assert.equal(err.code, 'test-err-code')
  assert.equal(err.details.fun, 1)
})

test('a plain object thrown on the client arrives as details', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  client.register('boom', () => { throw { test_field: 'nope' } })

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  const err = await rejection(connection.call('boom', { value: 1 }))
  assert.equal(err.details.test_field, 'nope')
})

test('a client that never answers times out after the server tO', async t => {
  const h = harness(t)
  const { server, url } = await h.server({ tO: 0.1 })
  const client = h.client(url)

  client.register('slow', () => new Promise(() => {}))

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  const err = await rejection(connection.call('slow', null))
  assert.equal(err.code, WSE_ERROR.RP_TIMEOUT)
})

test('calls run in both directions over the same connection', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  client.register('ping', () => 'pong')
  server.register('add', (conn, payload) => payload.a + payload.b)

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  const [ from_server, from_client ] = await Promise.all([
    connection.call('ping'),
    client.call('add', { a: 5, b: 3 }),
  ])

  assert.equal(from_server, 'pong')
  assert.equal(from_client, 8)
})

test('calling on a dropped connection rejects with CONNECTION_NOT_READY', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  connection.drop()
  const err = await rejection(connection.call('anything'))

  assert.equal(err.code, WSE_ERROR.CONNECTION_NOT_READY)
})

test('an unrelated disconnect does not consume the call disconnect guard', async t => {
  const h = harness(t)
  const { server, url } = await h.server({ tO: 5 }) // only the guard can settle this quickly
  const a = h.client(url)
  const b = h.client(url)

  a.register('never', () => new Promise(() => {}))

  const conns = new Map()
  server.when.connected(conn => conns.set(conn.cid, conn))

  await a.connect(SECRET, { user_id: 'A' })
  await b.connect(SECRET, { user_id: 'B' })
  await until(() => conns.has('A') && conns.has('B'), 'both connections to register')

  const call = conns.get('A').call('never').then(() => 'resolved', err => err.code)

  b.close() // unrelated disconnect - must not disarm the guard on A
  await wait(100)
  a.close() // this is the one that has to settle the call

  assert.equal(await Promise.race([ call, wait(1500).then(() => 'hung') ]), WSE_ERROR.RP_DISCONNECT)
})

test('a response from another connection cannot settle the call', async t => {
  const h = harness(t)
  let stolen_stamp = null

  // The victim's protocol leaks the stamp of the incoming call, standing in for an
  // attacker who observed it on the wire.
  class StampSniffer extends WseJSON {
    unpack (encoded) {
      const frame = super.unpack(encoded)
      if (frame[0] === 'whoami' && frame[2]) stolen_stamp = frame[2]
      return frame
    }
  }

  const { server, url } = await h.server()
  const victim = h.client(url, { protocol: new StampSniffer() })
  const attacker = h.client(url)

  victim.register('whoami', async () => {
    await wait(1000) // the real reply lands well after the forged one
    return 'REAL'
  })

  const victim_conn = new Promise(resolve => server.when.connected(conn => {
    if (conn.cid === 'VICTIM') resolve(conn)
  }))

  await attacker.connect(SECRET, { user_id: 'ATTACKER' })
  await victim.connect(SECRET, { user_id: 'VICTIM' })

  const call = (await victim_conn).call('whoami')

  await until(() => stolen_stamp, 'the attacker to observe the call stamp')
  attacker._ws.send(attacker.protocol.pack({
    type: attacker.protocol.internal_types.response,
    payload: 'FORGED',
    stamp: stolen_stamp,
  }))

  assert.equal(await call, 'REAL')
})

test('a structurally broken error response still settles the call', async t => {
  const h = harness(t)
  const { server, url } = await h.server({ tO: 0 }) // no timeout: only a real fix can settle this
  const socket = h.socket(url)

  socket.on('open', () => socket.send(JSON.stringify([ WSE_TYPES.hi, { identity: SECRET, meta: { user_id: 'U1' } } ])))
  socket.on('message', raw => {
    const [ type, , stamp ] = JSON.parse(raw)
    if (type === WSE_TYPES.welcome) return
    if (stamp) socket.send(JSON.stringify([ WSE_TYPES.response_error, null, stamp ])) // no code, no details
  })

  const [ conn ] = await onceSignal(server.connected)

  assert.equal(await outcome(conn.call('whatever'), 1000), 'rejected')
})

test('the client survives its socket closing while an incoming call is in flight', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  client.register('slow', async () => {
    await wait(250)
    return 'done'
  })

  server.when.connected(conn => {
    conn.call('slow').catch(() => {}) // never answered, we only need it in flight
    setTimeout(() => conn.drop(), 50) // the socket dies while the handler is awaiting
  })

  await client.connect(SECRET)

  // The handler resumes at ~250ms with nowhere to reply to. A crash there would
  // surface as an unhandled rejection and fail this run.
  await wait(500)
  assert.equal(client.status, WSE_STATUS.OFFLINE)

  // and the library is still usable afterwards
  const fresh = h.client(url)
  server.register('echo', (conn, payload) => payload)
  await fresh.connect(SECRET, { user_id: 'U2' })
  assert.equal(await fresh.call('echo', 'alive'), 'alive')
})
