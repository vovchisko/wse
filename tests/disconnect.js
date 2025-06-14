import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('client connection closure', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  client.closed.on((code, reason) => {
    code === 1000 && reason === 'CUSTOM_REASON' ? success('closed well') : fail('close code/reason is invalid')
  })
  client.when.ready(() => client.close('CUSTOM_REASON'))

  await client.connect(SECRET, { client_meta: 1 })
})
