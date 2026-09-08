import { test } from 'node:test'
import assert    from 'node:assert/strict'

import { WseJSON } from '../src/protocol.js'

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
