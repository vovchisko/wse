import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// dropClient() -> client.drop() -> the last _conn_drop() sees conns.size === 0
// and calls server.dropClient() recursively, which emits `left` and deletes the
// client. The outer dropClient() then emits `left` again.
// Anything cleaning up in when.left (DB writes, room teardown) runs twice.
execute('case: dropClient must emit left exactly once', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL })

  let left = 0
  server.when.left(() => left++)

  await client.connect(SECRET, { user_id: 'U1' })
  await wait(50)

  server.dropClient('U1')
  await wait(150)

  left === 1
      ? success('left emitted once')
      : fail(`left emitted ${ left } times, expected 1`)
})
