import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('client > server', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  server.channel.on('test-message', (client, payload) => {
    payload.value === 42
        ? success('client sent message')
        : fail('invalid data from client')
  })

  await client.connect(SECRET, { client_meta: 1 })
  client.send('test-message', { value: 42 })
})
