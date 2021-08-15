import { execute } from 'test-a-bit'

import http                                     from 'http'
import { incoming, VALID_SECRET, WS_TEST_PORT } from './_helpers.js'
import { WseClient, WseServer }                 from '../node.js'

execute('external httpServer', async (success, fail) => {

  const externalServer = new http.Server()

  const server = new WseServer({ incoming, server: externalServer })
  const client = new WseClient({ url: `ws://localhost:${ WS_TEST_PORT }` })

  if (!process.send) server.logger = (args) => console.log('SERVER::', ...args)
  if (!process.send) client.logger = (args) => console.log('CLIENT::', ...args)

  server.channel.on('test-message', (client, dat) => {
    dat.value === 42
        ? success('client sent message')
        : fail('invalid data from client')
  })

  externalServer.listen(WS_TEST_PORT)

  await client.connect(VALID_SECRET, { client_meta: 1 })

  client.send('test-message', { value: 42 })
})
