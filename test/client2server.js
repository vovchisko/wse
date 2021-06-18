import { WseClient, WseServer } from '../node.js'
import { execute }              from './_execute.js'

import { on_auth, VALID_SECRET, WS_TEST_PORT } from './_helpers.js'

execute('Message to the server', async (success, fail) => {
  const server = new WseServer({ port: WS_TEST_PORT }, on_auth)
  const client = new WseClient(`ws://localhost:${ WS_TEST_PORT }`, {})

  if (!process.send) {
    server.logger = (args) => console.log('SERVER::', ...args)
    client.logger = (args) => console.log('CLIENT::', ...args)
  }

  server.messages.on('test-message', (client, dat) => {
    dat.value === 42
        ? success('client sent message')
        : fail('invalid data')
  })
  server.init()

  try {
    await client.connect(VALID_SECRET, { client_meta: 1 })
    client.send('test-message', { value: 42 })
  } catch (err) {
    fail('error in try-catch')
    console.err(err.reason)
  }
})




