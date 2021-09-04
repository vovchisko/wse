import { execute } from 'test-a-bit'

import http                                  from 'http'
import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('external httpServer', async (success, fail) => {

  const externalServer = new http.Server()

  const server = new WseServer({ identify, skipInit: true })
  const client = new WseClient({ url: WS_URL })

  server.channel.on('test-message', (client, payload) => {
    payload.value === 42
        ? success('client sent message')
        : fail('invalid data from client')
  })

  externalServer.listen(WS_PORT)
  server.init({ server: externalServer })


  await client.connect(SECRET, { client_meta: 1 })

  client.send('test-message', { value: 42 })
})
