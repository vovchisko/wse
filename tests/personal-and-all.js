import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('personal and all-connections', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify, connPerUser: 2 })

  const goals = { only1: 0, only2: 0, both: 0 }
  const expect = { only1: 2, only2: 1, both: 6 }

  const count = (g) => {
    goals[g]++
    if (Object.keys(expect).every(k => {
      return expect[k] === goals[k]
    })) success('all right')
  }
  const client1 = new WseClient({ url: WS_URL })
  const client2 = new WseClient({ url: WS_URL })

  client1.channel.on('only', () => { count('only1') })
  client1.channel.on('both', () => { count('both') })
  client2.channel.on('only', () => { count('only2') })
  client2.channel.on('both', () => { count('both') })

  server.channel.on('hey', (conn) => {
    conn.client.send('both', conn.client.id)
    conn.send('only', conn.client.id)
  })

  await client1.connect(SECRET, { user_id: 1 })
  await client2.connect(SECRET, { user_id: 1 })

  client1.send('hey')
  client1.send('hey')

  client2.send('hey')
})
