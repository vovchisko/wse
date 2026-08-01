import { execute } from 'test-a-bit'
import WS            from 'ws'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'

// RpcManager.call()'s response handler runs cleanup() — clearing the timeout,
// unbinding the disconnect guard and dropping the callback — BEFORE reading
// result.code. A peer answering with a null error payload makes that read throw,
// so the promise never settles. With tO: 0 the caller hangs forever, and the
// disconnect guard is already gone so dropping the conn won't settle it either.
// Any client can wedge a server-side conn.call() on demand.
execute('case: malformed error response must still settle the call', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify, tO: 0 }) // no timeout: only a real fix can settle this
  const fake = new WS(WS_URL, 'wse-default-json')

  fake.on('error', () => {})

  fake.on('open', () => {
    fake.send(JSON.stringify([ '~wse:hi', { identity: SECRET, meta: { user_id: 'U1' } }, undefined ]))
  })

  fake.on('message', raw => {
    const [ type, , stamp ] = JSON.parse(raw)
    if (type === '~wse:welcome') return
    // answer any incoming call with a structurally broken error frame
    if (stamp) fake.send(JSON.stringify([ '~wse:response-err', null, stamp ]))
  })

  server.when.connected(async conn => {
    const outcome = await Promise.race([
      conn.call('whatever').then(() => 'resolved', () => 'rejected'),
      wait(800).then(() => 'hung'),
    ])

    outcome === 'hung'
        ? fail('conn.call() never settled after a malformed error response')
        : success(`call settled (${ outcome })`)
  })
})
