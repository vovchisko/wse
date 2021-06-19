import { execute } from './_execute.js'

import { create_client, create_server, VALID_SECRET } from './_helpers.js'
import { WSE_REASON }                                 from '../node.js'

execute('only one connection per client', async (success, fail) => {
  const server = create_server()
  const client1 = create_client()
  const client2 = create_client()

  server.init()

  client1.closed.on((code, reason) => {
    reason === WSE_REASON.OTHER_CLIENT_CONNECTED
        ? success('previous client dropped as expected')
        : fail('invalid disconnect reason')
  })

  client2.closed.on((code, reason) => {
    fail(`client 2 disconnected with ${ reason }`)
  })

  await client1.connect(VALID_SECRET, { user_id: 'SAME_UID' })
  await client2.connect(VALID_SECRET, { user_id: 'SAME_UID' })
})




