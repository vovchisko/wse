import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('connect and ready', async (success, fail) => {
  const { server, client } = create_pair()

  server.init()

  client.ready.on(welcome_data => {
    server.log('very welcomed', welcome_data)
    success('welcome message received')
  })

  await client.connect(VALID_SECRET, { client_meta: 1 })
})




