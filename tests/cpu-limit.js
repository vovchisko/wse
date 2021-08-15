import { execute } from 'test-a-bit'

import { create_client, create_server, VALID_SECRET, wait } from './_helpers.js'
import { WSE_REASON }                                       from '../node.js'

execute('cpu_limit = 2', async (success, fail) => {
  const server = create_server({ cpu_limit: 2 })
  const client1 = create_client()
  const client2 = create_client()
  const client3 = create_client()

  client1.closed.on(async (code, reason) => {
    await wait(120) // wait a bit to ensure that client2 isn't closed
    reason === WSE_REASON.OTHER_CLIENT_CONNECTED
        ? success('1st client dropped as expected')
        : fail('invalid disconnect reason')
  })

  client2.closed.on((code, reason) => {
    fail(`client 2 disconnected with ${ reason }`)
  })

  client3.closed.on((code, reason) => {
    fail(`client 3 disconnected with ${ reason }`)
  })

  await client1.connect(VALID_SECRET, { user_id: 'UID1', client: 1 })
  await client2.connect(VALID_SECRET, { user_id: 'UID1', client: 2 })
  await client3.connect(VALID_SECRET, { user_id: 'UID1', client: 3 })
})
