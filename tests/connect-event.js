import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('connect event', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  client.when.connected(payload => {
    success('welcome message received')
  })

  await client.connect(SECRET, { client_meta: 1 })
})
