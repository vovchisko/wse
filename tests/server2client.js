import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('server > client', async (success, fail) => {
  const { server, client } = create_pair()

  client.channel.on('test-message', (dat) => {
    dat.value === 42
        ? success('server sent message')
        : fail('invalid data from server')
  })

  server.when.joined((client) => {
    client.send('test-message', { value: 42 })
  })

  await client.connect(VALID_SECRET, { client_meta: 1 })
})
