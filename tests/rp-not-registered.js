import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_CLIENT_ERR }                    from '../src/common.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('rp not existing call', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  await client.connect(SECRET, { client_meta: 1 })

  try {
    await client.call('no-existing-rp')
  } catch (e) {
    if (e.code === WSE_CLIENT_ERR.RP_NOT_EXISTS) {
      success(e.code)
    } else {
      fail(`invalid error code ${ e }`)
    }
  }
})


class WseError extends Error {
  constructor (message) {
    super(message)
    this.name = this.constructor.name
  }
}

