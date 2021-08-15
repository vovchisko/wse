import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('client meta on join', async (success, fail) => {
  const { server, client } = create_pair()

  server.joined.on((client, meta) => {
    meta.test_value === 123
        ? success('meta is correct')
        : fail('invalid meta on join')
  })

  await client.connect(VALID_SECRET, { test_value: 123 })
})
