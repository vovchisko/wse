import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('server > client', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  client.channel.on('test-message', (dat) => {
    dat.value === 42
        ? success('server sent message')
        : fail('invalid data from server')
  })

  server.when.joined((client) => {
    client.send('test-message', { value: 42 })
  })

  await client.connect(SECRET, { client_meta: 1 })
})
