import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'
import { WseError } from '../src/common.js'

execute('rp throw wse /w custom code', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })
  const ERR_CODE = 'test-err-code'

  server.register('test-rp-custom', () => {
    throw new WseError(ERR_CODE, { fun: 1 })
  })

  await client.connect(SECRET, { client_meta: 1 })

  try {
    await client.call('test-rp-custom', { value: 1 })
    fail('no errors!')
  } catch (e) {
    if (e.code === ERR_CODE && e.details.fun === 1) {
      success('correct details on error')
    } else {
      fail(`invalid error ${e.code}`)
    }
  }
})
