import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// `disconnected` reports the real close code, but `left` hardcoded 1000, so a
// consumer that only listens on the identity level could never tell why the user
// went away. The last connection's close code must reach `left`.
execute('case: left carries the real close code', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  let left_code = null
  server.when.left((_client, code) => { left_code = code })

  await client.connect(SECRET, { user_id: 'U1' })
  await wait(300)

  client._ws.close(4001, 'gone')
  await wait(1000)

  left_code === 4001
      ? success('left received close code 4001')
      : fail(`left received code ${ left_code }, expected 4001`)
})
