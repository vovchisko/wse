import { execute } from './_execute.js'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('server > client', async (success, fail) => {
  const { server, client } = create_pair()

  client.messages.on('test-message', (dat) => {
    dat.value === 42
        ? success('server sent message')
        : fail('invalid data from server')
  })

  server.joined.on((client) => {
    client.send('test-message', { value: 42 })
  })

  server.init()

  try {
    await client.connect(VALID_SECRET, { client_meta: 1 })
  } catch (err) {
    fail('error in try-catch')
    console.err(err.reason)
  }
})
