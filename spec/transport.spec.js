import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { serialize, deserialize } from 'node:v8'

import { WseJSON }  from '../src/protocol.js'
import { WseError } from '../src/common.js'

import { collectChannel, harness, onceSignal, rejection, SECRET, until } from './_harness.js'

test('the server can ride on an http server the app already owns', async t => {
  const h = harness(t)
  const { http, url } = await h.http()
  const server = h.wse({ server: http })
  const client = h.client(url)

  const got = []
  server.channel.on('test-message', (conn, payload) => got.push(payload))

  await client.connect(SECRET)
  client.send('test-message', { value: 42 })

  await until(() => got.length, 'the server to receive the message')
  assert.deepEqual(got[0], { value: 42 })
})

test('two servers share one http server through upgrade routing', async t => {
  const h = harness(t)
  const { http, url } = await h.http()

  const foo = h.detached()
  const bar = h.detached()

  const upgrades = []
  http.on('upgrade', (request, socket, head) => {
    upgrades.push(request.url)
    if (request.url === '/foo') {
      foo.ws.handleUpgrade(request, socket, head, ws => foo.ws.emit('connection', ws, request))
    } else if (request.url === '/bar') {
      bar.ws.handleUpgrade(request, socket, head, ws => bar.ws.emit('connection', ws, request))
    } else {
      socket.destroy()
    }
  })

  const to_foo = h.client(`${ url }/foo`)
  const to_bar = h.client(`${ url }/bar`)
  const nowhere = h.client(`${ url }/nope`)

  const on_foo = []
  const on_bar = []
  foo.channel.on('talk', (conn, payload) => on_foo.push([ conn.cid, payload ]))
  bar.channel.on('talk', (conn, payload) => on_bar.push([ conn.cid, payload ]))

  await to_foo.connect(SECRET, { user_id: 'U1' })
  to_foo.send('talk', 10)

  await to_bar.connect(SECRET, { user_id: 'U2' })
  to_bar.send('talk', 20)

  await rejection(nowhere.connect(SECRET, { user_id: 'U3' }))

  await until(() => on_foo.length && on_bar.length, 'both servers to receive their message')
  assert.deepEqual(on_foo, [ [ 'U1', 10 ] ])
  assert.deepEqual(on_bar, [ [ 'U2', 20 ] ])
  assert.deepEqual(upgrades, [ '/foo', '/bar', '/nope' ])
})

test('a custom protocol carries both messages and calls', async t => {
  const h = harness(t)

  // Same JSON payload, different wire envelope.
  class PrefixedProtocol extends WseJSON {
    pack (message) {
      return `CUSTOM:${ super.pack(message) }`
    }

    unpack (encoded) {
      const text = typeof encoded === 'string' ? encoded : encoded.toString()
      if (!text.startsWith('CUSTOM:')) throw new Error('invalid custom protocol format')
      return super.unpack(text.slice(7))
    }
  }

  const { server, url } = await h.server({ protocol: new PrefixedProtocol() })
  const client = h.client(url, { protocol: new PrefixedProtocol() })

  client.register('double', payload => payload.value * 2)
  const messages = collectChannel(client.channel, 'test-message')

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  assert.equal(await connection.call('double', { value: 21 }), 42)

  connection.send('test-message', { value: 42 })
  await until(() => messages.length, 'the client to receive the message')
  assert.deepEqual(messages[0], { value: 42 })
})

test('a mixed text and binary protocol carries raw buffers, messages and calls', async t => {
  const h = harness(t)

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

  const server_protocol = new MixedProtocol()
  const client_protocol = new MixedProtocol()
  const { server, url } = await h.server({ protocol: server_protocol })
  const client = h.client(url, { protocol: client_protocol, tO: 2000 })

  server.register('double', (conn, payload) => payload.value * 2)
  server.register('pos', (conn, payload) => payload.length)
  const on_client = collectChannel(client.channel, 'pos')
  const on_server = []
  server.channel.on('pos', (conn, payload) => on_server.push(payload))

  const conn = onceSignal(server.connected)
  await client.connect(SECRET)
  const [ connection ] = await conn

  assert.equal(await client.call('double', { value: 21 }), 42)
  assert.equal(await client.call('pos', [ 1, 2, 3 ]), 3)

  connection.send('pos', new Float32Array([ 1.5, -2, 3.25 ]))
  client.send('pos', new Float32Array([ 7, 8.5 ]))
  await until(() => on_client.length && on_server.length, 'both sides to receive the buffer')

  assert.deepEqual(on_client[0], new Float32Array([ 1.5, -2, 3.25 ]))
  assert.deepEqual(on_server[0], new Float32Array([ 7, 8.5 ]))
  assert.deepEqual(new Set(client_protocol.received), new Set([ 'string', 'ArrayBuffer' ]))
  assert.deepEqual(new Set(server_protocol.received), new Set([ 'string', 'ArrayBuffer' ]))
})

test('the default JSON protocol reads a JSON frame sent as binary, on both sides', async t => {
  const h = harness(t)
  const { server, url } = await h.server()
  const socket = h.socket(url)

  socket.on('open', () => socket.send(Buffer.from(JSON.stringify([ '~wse:hi', { identity: SECRET, meta: { user_id: 'U1' } } ]))))
  const [ conn ] = await onceSignal(server.connected)
  assert.equal(conn.cid, 'U1')

  const raw_url = await h.raw(ws => ws.on('message', () => ws.send(Buffer.from(JSON.stringify([ '~wse:welcome', { ok: 1 } ])))))
  const client = h.client(raw_url)
  assert.deepEqual(await client.connect(SECRET), { ok: 1 })
})

test('a non-JSON protocol carries a thrown WseError code and details', async t => {
  const h = harness(t)

  class V8Protocol extends WseJSON {
    constructor () {
      super()
      this.name = 'wse-spec-v8'
    }

    pack (message) {
      return serialize([ message.type, message.payload, message.stamp ])
    }

    unpack (data) {
      return deserialize(new Uint8Array(data))
    }
  }

  const { server, url } = await h.server({ protocol: new V8Protocol() })
  const client = h.client(url, { protocol: new V8Protocol() })

  server.register('boom', () => { throw new WseError('CUSTOM', { field: 1 }) })

  await client.connect(SECRET)
  const err = await rejection(client.call('boom'))

  assert.equal(err.code, 'CUSTOM')
  assert.deepEqual(err.details, { field: 1, rp: 'boom' })
})
