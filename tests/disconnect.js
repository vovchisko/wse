import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'

execute('client connection closure', async (success, fail) => {
  const { server, client } = create_pair()

  client.closed.on((code, reason) => {
    code === 1000 && reason === 'CUSTOM_REASON'
        ? success('closed well')
        : fail('close code/reason is invalid')
  })
  client.when.ready(() => client.close('CUSTOM_REASON'))

  await client.connect(VALID_SECRET, { client_meta: 1 })
})




