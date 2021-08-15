import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('server > client: ignored message', async (success, fail) => {
  const { server, client } = create_pair()

  client.when.ignored((c, dat) => {
    dat.value === 42 && c === 'test'
        ? success('correctly fired about ignored msg')
        : fail('invalid data on ignored message')
  })

  server.when.joined((client) => {
    client.send('test', { value: 42 })
  })

  await client.connect(VALID_SECRET, { client_meta: 1 })
})
