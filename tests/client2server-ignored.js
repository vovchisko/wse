import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('client > server: ignored message', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  server.when.ignored((client, type, payload) => {
    payload.value === 42 && type === 'test'
        ? success('ignored message busted')
        : fail('invalid data from client')
  })

  await client.connect(SECRET)
  client.send('test', { value: 42 })
})
