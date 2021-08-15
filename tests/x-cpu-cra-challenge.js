import { execute } from 'test-a-bit'

import { VALID_SECRET, WS_TEST_PORT } from './_helpers.js'
import { WseClient, WseServer }       from '../node.js'

function incoming ({ payload, identify, meta, challenge }) {
  if (payload === VALID_SECRET) {
    const user_id = meta.user_id || 'USR-1'
    if (challenge.response !== 3) return resolve(false)

    identify(user_id, { hey: 'some additional data for the client' })

  } else {
    identify(false)
  }
}

execute('x-cpu with cra', async (success, fail) => {
  const goals = {
    c2disconnect: false,
    c1connect: true,
  }

  const checkGoals = () => {
    if (goals.c2disconnect && goals.c1connect) success('all correct')
  }

  const server = new WseServer({ port: WS_TEST_PORT, incoming })
  const client1 = new WseClient({ url: `ws://localhost:${ WS_TEST_PORT }` })
  const client2 = new WseClient({ url: `ws://localhost:${ WS_TEST_PORT }` })

  if (!process.send) client1.logger = (args) => console.log('CLIENT1::', ...args)
  if (!process.send) client2.logger = (args) => console.log('CLIENT2::', ...args)
  if (!process.send) server.logger = (args) => console.log('SERVER::', ...args)

  server.use_challenge((payload, meta, challenge) => challenge({ a: 1, b: 2 }))

  client1.challenge((quest, solve) => solve(quest.a + quest.b))

  client2.challenge((quest, solve) => solve('clearly-wrong-value'))

  await client1.connect(VALID_SECRET, { user_id: 1 })
      .then((r) => {
        goals.c2disconnect = true
        checkGoals()
      })
      .catch((e) => fail('client1 disconnected'))

  await client2.connect(VALID_SECRET, { user_id: 1 })
      .then((r) => fail('client2 connected successfully'))
      .catch((e) => {
        goals.c2disconnect = true
        checkGoals()
      })
})




