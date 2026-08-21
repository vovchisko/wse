import { execute } from 'test-a-bit'

import { wait, WS_PORT } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// jump(url, identity) documents an identity parameter, but over a live socket the
// reconnect replayed the identity captured by the original connect(), silently
// dropping the one passed to jump(). A jump that changes credentials (e.g. a
// per-node ticket) must actually authenticate with the new identity.
execute('case: jump must authenticate with the identity it is given', async (success, fail) => {
  const A = { port: WS_PORT, url: `ws://localhost:${ WS_PORT }` }
  const B = { port: WS_PORT + 1, url: `ws://localhost:${ WS_PORT + 1 }` }

  // Each server echoes back the user it authenticated, so the welcome reveals which
  // identity actually reached identify().
  const echo = ({ identity, accept }) => accept(String(identity.user), { who: String(identity.user) })

  const serverA = new WseServer({ port: A.port, identify: echo })
  const serverB = new WseServer({ port: B.port, identify: echo })

  const client = new WseClient({ url: A.url })

  const w1 = await client.connect({ user: 'U1' })
  const w2 = await client.jump(B.url, { user: 'U2' })

  await wait(300)

  w1.who === 'U1' && w2.who === 'U2'
      ? success('jump authenticated with the new identity')
      : fail(`expected U1/U2, got ${ w1.who }/${ w2.who }`)

  client.close()
})
