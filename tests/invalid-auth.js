import { execute } from 'test-a-bit'

import { identify, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_REASON } from '../src/common.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('not authorized connection', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  client.closed.on((code, reason) => {
    code === 1000 && reason === WSE_REASON.NOT_AUTHORIZED
      ? success('reason ' + WSE_REASON.NOT_AUTHORIZED)
      : fail('invalid close reason')
  })

  await client.connect('INVALID_SECRET')
})
