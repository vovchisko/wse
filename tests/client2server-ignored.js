import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('client > server: ignored message', async (success, fail) => {
  const { server, client } = create_pair()

  server.ignored.on((client, c, dat) => {
    dat.value === 42 && c === 'test'
        ? success('ignored message busted')
        : fail('invalid data from client')
  })

  server.init()

  await client.connect(VALID_SECRET)
  client.send('test', { value: 42 })
})
