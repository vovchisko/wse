import { execute } from './_execute.js'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('client meta on join', async (success, fail) => {
  const { server, client } = create_pair()

  server.joined.on((client, meta) => {
    meta.client_meta === 123
        ? success('meta is correct')
        : fail('invalid meta on join')
  })

  server.init()

  try {
    await client.connect(VALID_SECRET, { client_meta: 123 })
  } catch (err) {
    fail('error in try-catch')
    console.err(err.reason)
  }
})
