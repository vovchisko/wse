import { execute } from 'test-a-bit'
import WS            from 'ws'

import { SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'

// In the CRA flow a CLIENT_CHALLENGED connection that sends the wrong
// message type is closed — but there is no `return`, so execution falls through
// and identify() is called anyway with challenge.response === null. A lax
// identify can accept() a connection that is already closing, creating a ghost
// WseIdentity and emitting `joined` for it.
execute('case: cra protocol violation must not reach identify', async (success, fail) => {
  let identifyCalls = 0
  let joined = 0

  const server = new WseServer({
    port: WS_PORT,
    identify: ({ accept }) => {
      identifyCalls++
      accept('U1') // deliberately lax, like real-world handlers that only check identity
    },
  })

  server.when.joined(() => joined++)
  server.useChallenge((identity, meta, quest) => quest({ a: 1, b: 2 }))

  const fake = new WS(WS_URL, 'wse-default-json')

  fake.on('error', () => {})

  fake.on('open', () => {
    fake.send(JSON.stringify([ '~wse:hi', { identity: SECRET, meta: {} }, undefined ]))
  })

  fake.on('message', raw => {
    const [ type ] = JSON.parse(raw)
    // answer the challenge with a bogus message type instead of ~wse:challenge
    if (type === '~wse:challenge') fake.send(JSON.stringify([ '~wse:junk', 'nope', undefined ]))
  })

  await wait(300)

  if (identifyCalls !== 0) return fail(`identify called ${ identifyCalls }x for a connection being closed`)
  if (joined !== 0) return fail(`joined emitted ${ joined }x for a ghost identity`)

  success('protocol violation closed the connection without reaching identify')
})
