import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_REASON }                              from '../src/common.js'
import { WseServer }                               from '../src/server.js'
import { WseClient }                               from '../src/client.js'

execute('only one connection per client', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client1 = new WseClient({ url: WS_URL })
  const client2 = new WseClient({ url: WS_URL })

  client1.closed.on(async (code, reason) => {
    await wait(120) // wait a bit to ensure that client2 isn't closed
    reason === WSE_REASON.CLIENTS_CONCURRENCY
        ? success('previous client dropped as expected')
        : fail('invalid disconnect reason')
  })

  client2.closed.on((code, reason) => {
    fail(`client 2 disconnected with ${ reason }`)
  })

  await client1.connect(SECRET, { user_id: 'UID1', client: 1 })
  await client2.connect(SECRET, { user_id: 'UID1', client: 2 })
})

