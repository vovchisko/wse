import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseError } from '../src/common.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// RpcManager.call() runs sendFn() inside the promise executor. A synchronous
// throw there rejects the promise, but cleanup() never runs — the stamp stays in
// _callbacks, the disconnect bind stays subscribed and the timeout stays pending
// (forever when tO is 0). The rejection is also a raw Error, not a WseError.
execute('case: a failed send must not leak the pending call', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL, tO: 0 }) // no timeout to sweep the leak later

  await client.connect(SECRET)

  const binds_before = client.closed.binds.length
  const real_send = client._ws.send.bind(client._ws)
  client._ws.send = () => { throw new Error('socket exploded') }

  let rejected
  await client.call('whatever', null).then(() => { rejected = null }, e => { rejected = e })

  client._ws.send = real_send
  await wait(50)

  const leaks = []
  if (client._rpcManager._callbacks.size) leaks.push(`${ client._rpcManager._callbacks.size } pending callback(s)`)
  if (client.closed.binds.length > binds_before) leaks.push(`${ client.closed.binds.length - binds_before } disconnect listener(s)`)

  if (leaks.length) return fail(`send failure leaked ${ leaks.join(' and ') }`)
  if (!rejected) return fail('call did not reject after the send threw')
  if (!(rejected instanceof WseError)) return fail(`rejected with a raw ${ rejected.constructor.name }, expected WseError`)

  success('failed send cleaned up and rejected with a WseError')
})
