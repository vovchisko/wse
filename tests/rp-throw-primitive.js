import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'
import { WSE_ERROR } from '../main.js'

// Guards normalizeError() against non-Error throws: a thrown string must keep its
// value, and `throw null` must not crash the error handler with a TypeError.
execute('rp throw primitive', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  server.register('throw-string', () => { throw 'boom' })
  server.register('throw-null', () => { throw null })

  await client.connect(SECRET)

  try {
    await client.call('throw-string')
    return fail('throw-string did not reject')
  } catch (e) {
    if (e.code !== WSE_ERROR.RP_EXECUTION_FAILED) return fail(`string: wrong code ${ e.code }`)
    if (e.details?.origin?.message !== 'boom') return fail(`string: value lost, got ${ e.details?.origin?.message }`)
  }

  try {
    await client.call('throw-null')
    return fail('throw-null did not reject')
  } catch (e) {
    if (e.code !== WSE_ERROR.RP_EXECUTION_FAILED) return fail(`null: wrong code ${ e.code }`)
  }

  success('primitive throws normalized without crashing')
})
