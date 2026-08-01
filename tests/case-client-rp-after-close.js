import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// _handle_incoming_call is async. If the socket closes while the handler
// runs, _wipe_ws() has already nulled this._ws — the reply hits `null.send()`,
// the .catch() handler calls `null.send()` again, and that TypeError escapes as
// an unhandled rejection, killing the process (Node >=15 default).
// Correct behaviour: the client survives, it just cannot deliver the reply.
execute('case: incoming rp must survive the socket closing mid-flight', async (success, fail) => {
  // catch it explicitly: under the runner this rejection kills the process outright,
  // while a direct `node tests/...` run has it swallowed by test-a-bit's own handler.
  process.on('unhandledRejection', reason => {
    fail(`unhandled rejection from the rp handler: ${ reason?.message || reason }`)
  })

  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  client.register('slow', async () => {
    await wait(250)
    return 'done'
  })

  server.when.connected(conn => {
    conn.call('slow').catch(() => {}) // never answered, we only need it in flight
    setTimeout(() => conn.drop(), 50) // socket dies while the handler is awaiting
  })

  await client.connect(SECRET)

  // handler resumes at ~250ms; if it crashes the process dies before this resolves
  await wait(500)

  success('client survived a close during an in-flight incoming rp')
})
