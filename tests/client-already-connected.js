import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'
import { WseError, WSE_ERROR } from '../main.js'

// connect() while already connected must throw a proper WseError (it used to throw
// a bare string, leaving callers without a .code or a usable stack).
execute('connect while connected throws WseError', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  await client.connect(SECRET)

  try {
    await client.connect(SECRET)
    fail('second connect did not throw')
  } catch (e) {
    e instanceof WseError && e.code === WSE_ERROR.CLIENT_ALREADY_CONNECTED
        ? success('threw WseError with correct code')
        : fail(`threw ${ e?.constructor?.name }: ${ e }`)
  }
})
