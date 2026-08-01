import { execute } from 'test-a-bit'

import { wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// With re: true the client nulls _reject. A refusal closes with code 1000,
// which is not in re_on_codes, so nothing reconnects and nothing settles the
// promise — `await client.connect()` hangs forever with no signal at all.
execute('case: connect with re:true must settle when refused', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify: ({ refuse }) => refuse() })
  const client = new WseClient({ url: WS_URL, re: true })

  const outcome = await Promise.race([
    client.connect('bad-token').then(() => 'resolved', () => 'rejected'),
    wait(1000).then(() => 'hung'),
  ])

  outcome === 'rejected'
      ? success('connect rejected on refusal')
      : fail(`connect ${ outcome } — a refused connection is never retried, so it must settle`)
})
