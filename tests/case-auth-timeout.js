import { execute } from 'test-a-bit'
import WebSocket from 'ws'

import { identify, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseJSON } from '../src/protocol.js'

// A connection that opens but never completes authentication must not linger. With
// no auth deadline a stranger (or a hung identify()) stays half-open forever, holding
// a slot and never surfacing as connected or disconnected. The RP timeout `tO` is
// reused as the auth deadline.
execute('case: unauthenticated connection is dropped after tO', async (success, fail) => {
  const protocol = new WseJSON()
  const server = new WseServer({ port: WS_PORT, identify, tO: 1 })

  // Raw socket that completes the WS handshake but never sends `hi`.
  const ws = new WebSocket(WS_URL, protocol.name)

  let opened = false
  let closed = false

  ws.onopen = () => { opened = true }
  ws.onclose = () => { closed = true }

  // Comfortably past tO (1s) so a real drop has fired, without waiting so long a
  // missing timeout could be mistaken for one.
  await wait(2000)

  if (!opened) return fail('socket never opened')

  closed
      ? success('stranger dropped after auth timeout')
      : fail('stranger still connected after tO elapsed')

  server.ws.close()
})
