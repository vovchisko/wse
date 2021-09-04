import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET, wait } from './_helpers.js'
import { WSE_CLIENT_ERRORS }               from '../src/common.js'

execute('rp timeout', async (success, fail) => {
  const { server, client } = create_pair()

  server.register('test-rp', async (client, dat) => {
    await wait(60000)
    return 1
  })

  await client.connect(VALID_SECRET)

  try {
    await client.call('test-rp', null, .1)
    fail('still responds')
  } catch (e) {
    if (e.code === WSE_CLIENT_ERRORS.RP_TIMEOUT) {
      success(`correct error ${ e.code }`)
    } else {
      fail(`incorrect error type ${ e }`)
    }
  }
})
