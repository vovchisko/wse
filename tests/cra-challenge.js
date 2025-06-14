import { execute } from 'test-a-bit'

import { SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

execute('cra-challenge', async (success, fail) => {
  function identifyWithCra({ identity, accept, meta, challenge }) {
    if (identity === SECRET) {
      const user_id = meta.user_id || 'user-1'
      if (challenge.response !== 3) fail('failed challenge')
      accept(user_id, { hey: 'some additional data for the client' })
    } else {
      accept(false)
    }
  }

  const server = new WseServer({ port: WS_PORT, identify: identifyWithCra })
  const client = new WseClient({ url: WS_URL })

  server.useChallenge((identity, meta, quest) => {
    quest({ a: 1, b: 2 })
  })

  client.challenge((challenge, solve) => {
    solve(challenge.a + challenge.b)
  })

  client.when.ready(() => success('welcome message received'))

  await client.connect(SECRET, { user_id: 1 })
})
