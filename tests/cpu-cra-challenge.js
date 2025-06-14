import { execute } from 'test-a-bit'

import { SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

function identify({ identity, accept, meta, challenge }) {
  if (identity === SECRET) {
    const user_id = meta.user_id || 'user-1'
    if (challenge.response !== 3) return accept(false)
    accept(user_id, { hey: 'some additional data for the client' })
  } else {
    accept(false)
  }
}

execute('cpu limit 2 with cra', async (success, fail) => {
  const goals = {
    c2disconnect: null,
    c1connect: null,
  }

  const checkGoals = () => {
    if (goals.c2disconnect && goals.c1connect) success('all correct')
  }

  const server = new WseServer({ port: WS_PORT, identify, connPerUser: 2 })
  const client1 = new WseClient({ url: WS_URL })
  const client2 = new WseClient({ url: WS_URL })

  server.useChallenge((identity, meta, quest) => quest({ a: 1, b: 2 }))

  client1.challenge((quest, solve) => solve(quest.a + quest.b))
  client2.challenge((quest, solve) => solve('clearly-wrong-value'))

  await client1
    .connect(SECRET, { user_id: 1 })
    .then(r => {
      goals.c1connect = true
      checkGoals()
    })
    .catch(e => fail('client1 disconnected'))

  await client2
    .connect(SECRET, { user_id: 1 })
    .then(r => fail('client2 connected successfully'))
    .catch(e => {
      goals.c2disconnect = true
      checkGoals()
    })
})
