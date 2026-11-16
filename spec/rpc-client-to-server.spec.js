import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { WSE_ERROR, WseError } from '../src/common.js'
import { WseJSON }             from '../src/protocol.js'

import { collectSignal, harness, onceSignal, rejection, SECRET, until, wait } from './_harness.js'

test('a registered procedure returns its result to the caller', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  server.register('double', async (conn, payload) => {
    await wait(50)
    return payload.value * 2
  })

  await client.connect(SECRET)

  assert.equal(await client.call('double', { value: 21 }), 42)
})

test('calling an unknown procedure rejects with RP_NOT_REGISTERED', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  await client.connect(SECRET)
  const err = await rejection(client.call('no-such-rp'))

  assert.equal(err.code, WSE_ERROR.RP_NOT_REGISTERED)
  assert.equal(err.details.rp, 'no-such-rp')
  assert.match(err.message, /rp:no-such-rp/)
})

test('a vanilla Error becomes RP_EXECUTION_FAILED carrying the procedure name', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  server.register('boom', () => { throw new Error('Vanilla error') })

  await client.connect(SECRET)
  const err = await rejection(client.call('boom', { value: 1 }))

  assert.equal(err.code, WSE_ERROR.RP_EXECUTION_FAILED)
  assert.equal(err.details.rp, 'boom')
  assert.equal(err.details.origin.message, 'Vanilla error')
  assert.equal(err.details.origin.stack, undefined, 'the server stack reached the client')
})

test('a thrown WseError keeps its own code and details', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  server.register('boom', () => { throw new WseError('test-err-code', { fun: 1 }) })

  await client.connect(SECRET)
  const err = await rejection(client.call('boom', { value: 1 }))

  assert.equal(err.code, 'test-err-code')
  assert.equal(err.details.fun, 1)
})

test('a thrown plain object arrives as details', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  server.register('boom', () => { throw { test_field: 'nope' } })

  await client.connect(SECRET)
  const err = await rejection(client.call('boom', { value: 1 }))

  assert.equal(err.details.test_field, 'nope')
})

test('thrown primitives are normalized without crashing the handler', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  server.register('throw-string', () => { throw 'boom' })
  server.register('throw-null', () => { throw null })

  await client.connect(SECRET)

  const string_err = await rejection(client.call('throw-string'))
  assert.equal(string_err.code, WSE_ERROR.RP_EXECUTION_FAILED)
  assert.equal(string_err.details.origin.message, 'boom')

  const null_err = await rejection(client.call('throw-null'))
  assert.equal(null_err.code, WSE_ERROR.RP_EXECUTION_FAILED)
})

test('a call that outlives tO rejects with RP_TIMEOUT', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url, { tO: 100 })

  server.register('slow', () => new Promise(() => {})) // never answers

  await client.connect(SECRET)
  const err = await rejection(client.call('slow', null))

  assert.equal(err.code, WSE_ERROR.RP_TIMEOUT)
  assert.equal(err.details.rp, 'slow')
})

test('losing the connection mid-call rejects with RP_DISCONNECT and the close reason', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url, { tO: 3000 })

  server.register('drop-me', conn => {
    conn.drop('user-banned-for-spam')
    return new Promise(() => {}) // never answers, the disconnect has to settle the call
  })

  await client.connect(SECRET)
  const err = await rejection(client.call('drop-me', null))

  assert.equal(err.code, WSE_ERROR.RP_DISCONNECT)
  assert.deepEqual(err.details.disconnected, [ 1000, 'user-banned-for-spam' ])
  assert.equal(err.details.rp, 'drop-me')
})

test('calling without a live connection rejects with CONNECTION_NOT_READY', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url)

  const err = await rejection(client.call('anything'))

  assert.equal(err.code, WSE_ERROR.CONNECTION_NOT_READY)
  assert.equal(err.details.rp, 'anything')
})

test('a send that throws rejects with RP_SEND_FAILED and leaves nothing pending', async t => {
  const h = harness(t)
  const { url } = await h.server()
  const client = h.client(url, { tO: 0 }) // no timeout to sweep a leak later

  await client.connect(SECRET)

  const binds_before = client.closed.binds.length
  const real_send = client._ws.send.bind(client._ws)
  client._ws.send = () => { throw new Error('socket exploded') }

  const err = await rejection(client.call('whatever', null))

  client._ws.send = real_send
  await wait(50)

  assert.ok(err instanceof WseError, `rejected with ${ err?.constructor?.name }`)
  assert.equal(err.code, WSE_ERROR.RP_SEND_FAILED)
  assert.equal(err.details.rp, 'whatever')
  assert.equal('payload' in err.details, false)
  assert.equal(client._rpcManager._callbacks.size, 0, 'pending callback leaked')
  assert.equal(client.closed.binds.length, binds_before, 'disconnect listener leaked')
})

test('a response arriving after the call timed out is dropped silently', async t => {
  const h = harness(t)

  // Counts the error frames the client puts on the wire. An unmatched response must
  // not be answered with response_error - the peer cannot match that stamp either,
  // and the two sides would trade frames forever.
  class ErrorFrameCounter extends WseJSON {
    constructor () {
      super()
      this.errors = 0
    }

    pack (message) {
      if (message.type === this.internal_types.response_error) this.errors++
      return super.pack(message)
    }
  }

  const protocol = new ErrorFrameCounter()
  const { server, url } = await h.server()
  const client = h.client(url, { protocol, tO: 100 })

  server.register('slow', async () => {
    await wait(250) // answers long after the client gave up
    return 'late'
  })

  await client.connect(SECRET)
  const err = await rejection(client.call('slow'))
  assert.equal(err.code, WSE_ERROR.RP_TIMEOUT)

  await wait(500) // the late reply lands at ~250ms, a storm would run after it

  assert.equal(protocol.errors, 0)
})

test('the error frame carries neither rp nor the call payload, and the thrown error stays intact', async t => {
  const h = harness(t)

  class ErrorFrameSniffer extends WseJSON {
    pack (message) {
      if (message.type === this.internal_types.response_error) this.frame = message.payload
      return super.pack(message)
    }
  }

  const protocol = new ErrorFrameSniffer()
  const { server, url } = await h.server({ protocol })
  const client = h.client(url)

  const thrown = new WseError('CUSTOM', { field: 'value' })
  server.register('boom', () => { throw thrown })

  await client.connect(SECRET)
  const err = await rejection(client.call('boom', new Float32Array([ 1, 2, 3 ])))

  assert.equal(Object.getPrototypeOf(protocol.frame), Object.prototype, 'the frame is not a plain object')
  assert.deepEqual(protocol.frame, { code: 'CUSTOM', details: { field: 'value' } })
  assert.deepEqual(thrown.details, { field: 'value' })
  assert.deepEqual(err.details, { field: 'value', rp: 'boom' })
})

test('registering the same procedure twice throws RP_ALREADY_REGISTERED', async t => {
  const h = harness(t)
  const { server } = await h.server()

  server.register('once', () => 1)

  assert.throws(() => server.register('once', () => 2), err => err.code === WSE_ERROR.RP_ALREADY_REGISTERED)
})

test('unregister removes the procedure, and refuses an unknown one', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  server.register('temporary', () => 'here')
  await client.connect(SECRET)
  assert.equal(await client.call('temporary'), 'here')

  server.unregister('temporary')
  const err = await rejection(client.call('temporary'))
  assert.equal(err.code, WSE_ERROR.RP_NOT_REGISTERED)

  assert.throws(() => server.unregister('temporary'), e => e.code === WSE_ERROR.RP_NOT_REGISTERED)
})

test('the server reports a failing procedure on its error signal', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url)

  server.register('boom', () => { throw new Error('nope') })

  const error = onceSignal(server.error)
  await client.connect(SECRET, { user_id: 'U1' })
  await rejection(client.call('boom', { value: 1 }))

  const [ err, conn ] = await error
  assert.equal(err.code, WSE_ERROR.RP_EXECUTION_FAILED)
  assert.equal(err.details.rp, 'boom')
  assert.equal(conn.cid, 'U1')
})

test('a handler error the protocol cannot pack still answers the caller with its code', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url, { tO: 3000 })

  server.register('boom', () => { throw new WseError('X', { n: 1n }) })
  const errors = collectSignal(server.error)

  await client.connect(SECRET)
  const settled = client.call('boom').then(() => 'resolved', err => err.code)

  assert.equal(await Promise.race([ settled, wait(1000).then(() => 'hung') ]), 'X')
  await until(() => errors.length, 'the server to report the failure')
  assert.equal(errors[0][0].code, WSE_ERROR.RP_EXECUTION_FAILED)
})

test('a result the protocol cannot pack rejects with RP_EXECUTION_FAILED', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url, { tO: 3000 })

  server.register('big', () => 1n)

  await client.connect(SECRET)
  const err = await rejection(client.call('big'))

  assert.equal(err.code, WSE_ERROR.RP_EXECUTION_FAILED)
  assert.equal(err.details.rp, 'big')
})

test('a pending call does not unsubscribe closed listeners added after it', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url, { tO: 3000 })

  server.register('hang', () => new Promise(() => {}))

  await client.connect(SECRET, { user_id: 'U1' })
  const call = rejection(client.call('hang'))

  let closes = 0
  client.when.closed(() => closes++)

  server.dropClient('U1')
  assert.equal((await call).code, WSE_ERROR.RP_DISCONNECT)

  await client.connect(SECRET, { user_id: 'U1' })
  server.dropClient('U1')
  await until(() => closes === 2, 'the listener to see the second close', 2000)
})

test('calling before the welcome rejects with CONNECTION_NOT_READY', async t => {
  const h = harness(t)
  const { server, url } = await h.server({
    identify: async ({ accept }) => {
      await wait(200)
      accept('U1')
    },
  })
  server.register('ping', () => 'pong')
  const client = h.client(url)

  const early = new Promise(resolve => client.when.connected(() => resolve(client.call('ping').then(() => 'resolved', err => err.code))))
  client.when.error(() => {})
  await client.connect(SECRET)

  assert.equal(await Promise.race([ early, wait(1000).then(() => 'hung') ]), WSE_ERROR.CONNECTION_NOT_READY)
})

test('sending before the welcome throws CONNECTION_NOT_READY', async t => {
  const h = harness(t)
  const { url } = await h.server({
    identify: async ({ accept }) => {
      await wait(200)
      accept('U1')
    },
  })
  const client = h.client(url)
  client.when.error(() => {})

  const early = new Promise(resolve => client.when.connected(() => {
    try {
      client.send('hello', 1)
      resolve('sent')
    } catch (err) {
      resolve(err.code)
    }
  }))
  await client.connect(SECRET)

  assert.equal(await early, WSE_ERROR.CONNECTION_NOT_READY)
})

for (const tO of [ Infinity, 2 ** 31 ]) {
  test(`tO of ${ tO } never times a call out`, async t => {
    const h = harness(t)
    const { server, url } = await h.server({ tO })
    const client = h.client(url, { tO })

    server.register('slow', async () => {
      await wait(200)
      return 'done'
    })

    await client.connect(SECRET)
    assert.equal(await client.call('slow'), 'done')
  })
}

test('tO of 0 on the client never times a call out', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const client = h.client(url, { tO: 0 })

  server.register('slow', async () => {
    await wait(200)
    return 'done'
  })

  await client.connect(SECRET)
  assert.equal(await client.call('slow'), 'done')
})

for (const tO of [ NaN, -1, '20', null ]) {
  test(`tO of ${ typeof tO === 'string' ? `'${ tO }'` : tO } is rejected by both constructors`, t => {
    const h = harness(t)
    assert.throws(() => h.wse({ noServer: true, tO }), err => err.code === WSE_ERROR.INVALID_TIMEOUT)
    assert.throws(() => h.client('ws://localhost:1', { tO }), err => err.code === WSE_ERROR.INVALID_TIMEOUT)
  })
}
