import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { WSE_ERROR, WSE_REASON, WSE_STATUS } from '../src/common.js'

import { collectSignal, harness, onceSignal, outcome, rejection, SECRET, socketClosed, until, wait, WSE_TYPES } from './_harness.js'

const welcomeOnHi = ws => ws.on('message', raw => {
  const [ type ] = JSON.parse(raw)
  if (type === WSE_TYPES.hi) ws.send(JSON.stringify([ WSE_TYPES.welcome, { ok: true } ]))
})

test('a malformed frame before the welcome fails connect instead of crashing the client', async t => {
  const h = harness(t)
  const url = await h.raw(ws => ws.on('message', () => ws.send('garbage{')))
  const client = h.client(url)
  const errors = []
  client.when.error(err => errors.push(err))

  const err = await rejection(client.connect(SECRET))

  assert.equal(err.code, WSE_ERROR.CONNECTION_CLOSED)
  assert.equal(err.details.reason, WSE_REASON.PROTOCOL_ERR)
  assert.equal(errors[0]?.code, WSE_ERROR.MESSAGE_PROCESSING_ERROR)
})

test('a malformed frame after the welcome closes the client with PROTOCOL_ERR', async t => {
  const h = harness(t)
  let peer
  const url = await h.raw(ws => {
    peer = ws
    welcomeOnHi(ws)
  })
  const client = h.client(url)
  const errors = []
  client.when.error(err => errors.push(err))

  await client.connect(SECRET)
  const closed = onceSignal(client.closed)
  peer.send('null')

  assert.deepEqual(await closed, [ 1000, WSE_REASON.PROTOCOL_ERR ])
  assert.equal(errors[0]?.code, WSE_ERROR.MESSAGE_PROCESSING_ERROR)
})

test('a server that never welcomes fails connect after tO', async t => {
  const h = harness(t)
  const url = await h.raw(() => {})
  const client = h.client(url, { tO: 150 })

  const err = await rejection(client.connect(SECRET))

  assert.equal(err.code, WSE_ERROR.CONNECTION_CLOSED)
  assert.equal(err.details.reason, WSE_REASON.AUTH_TIMEOUT)
})

test('a challenge with no solver set fails connect with INVALID_CRA_HANDLER', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  server.useChallenge((identity, meta, quest) => quest({ a: 1 }))
  const client = h.client(url)

  const settled = client.connect(SECRET).then(() => 'resolved', err => err.code)

  assert.equal(await Promise.race([ settled, wait(1000).then(() => 'hung') ]), WSE_ERROR.INVALID_CRA_HANDLER)
})

test('a __proto__ key in meta does not reach the prototype of conn.meta', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const socket = h.socket(url)

  socket.on('open', () => socket.send(
      `["${ WSE_TYPES.hi }",{"identity":"${ SECRET }","meta":{"user_id":"U1","__proto__":{"admin":true}}}]`,
  ))
  const [ conn ] = await onceSignal(server.connected)

  assert.equal(Object.getPrototypeOf(conn.meta), Object.prototype)
  assert.equal(conn.meta.admin, undefined)
  assert.equal(conn.meta.user_id, 'U1')
})

const forgedErrorFrame = async (t, payload) => {
  const h = harness(t)
  const { server, url } = await h.server()
  const socket = h.socket(url)

  socket.on('open', () => socket.send(JSON.stringify([ WSE_TYPES.hi, { identity: SECRET, meta: { user_id: 'U1' } } ])))
  socket.on('message', raw => {
    const [ type, , stamp ] = JSON.parse(raw)
    if (type === WSE_TYPES.welcome) return
    if (stamp) socket.send(JSON.stringify([ WSE_TYPES.response_error, payload, stamp ]))
  })

  const [ conn ] = await onceSignal(server.connected)
  return rejection(conn.call('real'))
}

test('array details in an error frame survive as value', async t => {
  const err = await forgedErrorFrame(t, { code: 'X', details: [ 1, 2 ] })
  assert.deepEqual(err.details, { value: [ 1, 2 ], rp: 'real' })
})

test('string details in an error frame survive as value', async t => {
  const err = await forgedErrorFrame(t, { code: 'X', details: 'oops' })
  assert.deepEqual(err.details, { value: 'oops', rp: 'real' })
})

test('an rp the peer reports is kept as peer_rp', async t => {
  const err = await forgedErrorFrame(t, { code: WSE_ERROR.RP_TIMEOUT, details: { rp: 'nested' } })
  assert.equal(err.code, WSE_ERROR.RP_TIMEOUT)
  assert.deepEqual(err.details, { rp: 'real', peer_rp: 'nested' })
})

test('a non-string code in an error frame falls back to RP_EXECUTION_FAILED', async t => {
  const err = await forgedErrorFrame(t, { code: { evil: 1 }, details: {} })
  assert.equal(err.code, WSE_ERROR.RP_EXECUTION_FAILED)
  assert.doesNotMatch(err.message, /object Object/)
})

test('close() during the reconnect wait stops the reconnect', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url, { re: true })
  client.re_t0 = 150

  let connects = 0
  server.when.connected(() => connects++)

  await client.connect(SECRET)
  for (const ws_conn of server.ws.clients) ws_conn.terminate()
  await until(() => client.status === WSE_STATUS.RE_CONNECTING, 'the client to start reconnecting')

  client.close()
  await wait(1400)

  assert.equal(client.status, WSE_STATUS.OFFLINE)
  assert.equal(connects, 1, 'reconnected after close()')
  assert.equal(await outcome(client.connect(SECRET), 1000), 'resolved', 'cannot connect again after close()')
})

test('a socket dropped for a protocol error is gone from server.ws.clients', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const socket = h.socket(url)

  socket.on('open', () => socket.send('junk{'))

  await until(() => server.ws.clients.size === 0 && socket.readyState === 3, 'ws to forget the dropped socket', 2000)
})

test('an error frame whose origin.message is not a string still rejects the server call', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const socket = h.socket(url)

  socket.on('open', () => socket.send(JSON.stringify([ WSE_TYPES.hi, { identity: SECRET, meta: { user_id: 'U1' } } ])))
  socket.on('message', raw => {
    const [ type, , stamp ] = JSON.parse(raw)
    if (type === WSE_TYPES.welcome) return
    if (stamp) socket.send(JSON.stringify([ WSE_TYPES.response_error, { code: 'X', details: { origin: { message: { toString: 1 } } } }, stamp ]))
  })

  const [ conn ] = await onceSignal(server.connected)
  assert.equal(await outcome(conn.call('real'), 1000), 'rejected')
})

test('an error frame whose origin.message is not a string still rejects the client call', async t => {
  const h = harness(t)
  const url = await h.raw(ws => ws.on('message', raw => {
    const [ type, , stamp ] = JSON.parse(raw)
    if (type === WSE_TYPES.hi) return ws.send(JSON.stringify([ WSE_TYPES.welcome, {} ]))
    if (stamp) ws.send(JSON.stringify([ WSE_TYPES.response_error, { code: 'X', details: { origin: { message: { toString: 1 } } } }, stamp ]))
  }))
  const client = h.client(url)
  await client.connect(SECRET)

  const err = await rejection(client.call('real'))
  assert.equal(err.code, 'X')
  assert.equal(err.details.rp, 'real')
})

test('one socket gets one identify() per challenge, however many solutions it sends', async t => {
  const h = harness(t)
  let identifies = 0
  const { server, url } = await h.server({ identify: () => { identifies++ } })
  server.useChallenge((identity, meta, quest) => quest({ a: 1 }))
  const socket = h.socket(url)

  socket.on('open', () => socket.send(JSON.stringify([ WSE_TYPES.hi, { identity: SECRET, meta: {} } ])))
  socket.on('message', raw => {
    const [ type ] = JSON.parse(raw)
    if (type !== WSE_TYPES.challenge) return
    for (let i = 0; i < 5; i++) socket.send(JSON.stringify([ WSE_TYPES.challenge, i ]))
  })

  await until(() => identifies, 'the first identify')
  await wait(100)
  assert.equal(identifies, 1)
})

test('an async identify() that throws refuses the connection and reports the error', async t => {
  const h = harness(t)
  const { server, url } = await h.server({ identify: async ({ identity }) => identity.ticket })
  const errors = collectSignal(server.error)
  const client = h.client(url)

  const err = await rejection(client.connect(null))

  assert.equal(err.code, WSE_ERROR.NOT_AUTHORIZED)
  assert.ok(errors.length, 'the throw was not reported')
})

test('an accept() that lands after the socket closed does not create a client', async t => {
  const h = harness(t)
  const { server, url } = await h.server({
    identify: async ({ accept }) => {
      await wait(100)
      accept('U1')
    },
  })
  const joined = collectSignal(server.joined)
  const socket = h.socket(url)

  socket.on('open', () => {
    socket.send(JSON.stringify([ WSE_TYPES.hi, { identity: SECRET, meta: {} } ]))
    socket.terminate()
  })

  await wait(250)
  assert.equal(server.clients.size, 0)
  assert.equal(joined.length, 0)
})

test('an unpacked frame that is not an array closes an authenticated socket with PROTOCOL_ERR', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const ignored = collectSignal(server.ignored)
  const socket = h.socket(url)
  const closed = socketClosed(socket)

  socket.on('open', () => socket.send(JSON.stringify([ WSE_TYPES.hi, { identity: SECRET, meta: {} } ])))
  socket.on('message', raw => {
    if (JSON.parse(raw)[0] === WSE_TYPES.welcome) socket.send('"ab"')
  })

  assert.deepEqual(await closed, [ 1000, WSE_REASON.PROTOCOL_ERR ])
  assert.equal(ignored.length, 0)
})

test('a socket error reaches server.error as the ws ErrorEvent', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const errors = collectSignal(server.error)
  const client = h.client(url)
  await client.connect(SECRET, { user_id: 'U1' })

  const [ conn ] = server.clients.get('U1').conns.values()
  conn.ws_conn.emit('error', new Error('boom'))

  assert.equal(errors[0][0].code, WSE_ERROR.CONNECTION_ERROR)
  assert.equal(errors[0][0].details.raw.type, 'error')
  assert.equal(errors[0][0].details.raw.error.message, 'boom')
})
