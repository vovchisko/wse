import { execute } from './_execute.js'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('client > server', async (success, fail) => {
  const { server, client } = create_pair()

  server.messages.on('test-message', (client, dat) => {
    dat.value === 42
        ? success('client sent message')
        : fail('invalid data from client')
  })

  server.init()

  await client.connect(VALID_SECRET, { client_meta: 1 })
  client.send('test-message', { value: 42 })
})
