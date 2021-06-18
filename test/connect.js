import { WseClient, WseServer } from '../node.js'
import { execute }              from './_execute.js'

import { on_auth, VALID_SECRET, WS_TEST_PORT } from './_helpers.js'

execute('Connect and ready', async (success, fail) => {
  const server = new WseServer({ port: WS_TEST_PORT }, on_auth)
  const client = new WseClient(`ws://localhost:${ WS_TEST_PORT }`, {})

  if(!process.send) {
    client.logger = (args) => console.log('CLIENT::', ...args)
    server.logger = (args) => console.log('SERVER::', ...args)
  }

  server.init()

  client.ready.on(welcome_data => {
    server.log('very welcomed', welcome_data)
    success('welcome message received')
  })

  try {
    await client.connect(VALID_SECRET, { client_meta: 1 })
  } catch (err) {
    fail('error in try-catch')
    console.err(err.reason)
  }
})




