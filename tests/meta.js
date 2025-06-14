import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('client meta on join', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  server.when.joined((client, meta) => {
    meta.test_value === 123 ? success('meta is correct') : fail('invalid meta on join')
  })

  await client.connect(SECRET, { test_value: 123 })
})
