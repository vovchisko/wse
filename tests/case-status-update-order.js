import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// _update_status() emits the signal and only then assigns this.status, so a
// handler that reads client.status sees the previous value.
execute('case: status must be assigned before updated fires', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  const mismatches = []
  client.when.updated(status => {
    if (client.status !== status) mismatches.push(`${ status } while client.status was ${ client.status }`)
  })

  await client.connect(SECRET)
  await wait(50)

  mismatches.length === 0
      ? success('client.status always matched the emitted status')
      : fail(`stale status in ${ mismatches.length } emission(s): ${ mismatches.join('; ') }`)
})
