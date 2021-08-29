import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET } from './_helpers.js'
import { WSE_CLIENT_ERRORS }         from '../src/common.js'

execute('rp not existing call', async (success, fail) => {
  const { client } = create_pair()

  await client.connect(VALID_SECRET, { client_meta: 1 })

  try {
    await client.call('no-existing-rp')
  } catch (e) {
    if (e.code === WSE_CLIENT_ERRORS.RP_NOT_EXISTS) {
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

