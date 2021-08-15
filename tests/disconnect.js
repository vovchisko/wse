import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('client connection closure', async (success, fail) => {
  const { server, client } = create_pair()

  client.closed.on((code, reason) => {
    code === 1002 && reason === 'CUSTOM_REASON'
        ? success('closed well')
        : fail('close code/reason is invalid')
  })
  client.ready.on(() => client.close(1002, 'CUSTOM_REASON'))

  await client.connect(VALID_SECRET, { client_meta: 1 })
})




