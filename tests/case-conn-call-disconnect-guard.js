import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WSE_ERROR } from '../src/common.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// conn.call()'s disconnect guard subscribes with disconnected.once() and
// filters `conn === this` inside the callback. a-signal splices a `once` bind
// after the first emission no matter what the callback does, so ANY other client
// disconnecting consumes the guard. The call then misses its own disconnect and
// hangs until tO — forever when tO is 0.
execute('case: conn.call disconnect guard must survive other disconnects', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify, tO: 5 }) // only the guard can settle this fast
  const a = new WseClient({ url: WS_URL })
  const b = new WseClient({ url: WS_URL })

  a.register('never', () => new Promise(() => {})) // never answers

  const conns = new Map()
  server.when.connected(conn => conns.set(conn.cid, conn))

  await a.connect(SECRET, { user_id: 'A' })
  await b.connect(SECRET, { user_id: 'B' })
  await wait(50)

  const call = conns.get('A').call('never').then(() => 'resolved', e => e.code)

  await wait(50)
  b.close() // unrelated disconnect — must not consume A's guard
  await wait(100)
  a.close() // this is the one that has to settle the call

  const outcome = await Promise.race([ call, wait(700).then(() => 'hung') ])

  outcome === WSE_ERROR.RP_DISCONNECT
      ? success('call rejected with RP_DISCONNECT')
      : fail(`expected RP_DISCONNECT, got "${ outcome }"`)
})
