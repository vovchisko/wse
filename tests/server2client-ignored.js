import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('server > client: ignored message', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  client.when.ignored((c, dat) => {
    dat.value === 42 && c === 'test'
        ? success('correctly fired about ignored msg')
        : fail('invalid data on ignored message')
  })

  server.when.joined((client) => {
    client.send('test', { value: 42 })
  })

  await client.connect(SECRET, { client_meta: 1 })
})
