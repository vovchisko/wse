import { execute } from 'test-a-bit'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('swarm disconnect', async (success, fail) => {

  const total_clients = 20
  let points = 0

  const server = new WseServer({ port: WS_PORT, identify })

  const clients = []
  for (let i = 0; i < total_clients; i++) {
    clients.push(new WseClient({ url: WS_URL }))
  }

  server.when.joined(type => {
    process.nextTick(() => {
      type.drop('BECAUSE-OF-TEST')
    })
  })

  for (let i = 0; i < clients.length; i++) {
    clients[i].connect(SECRET, { index: i })
    clients[i].closed.on((code, reason) => {
      if (code === 1000 && reason === 'BECAUSE-OF-TEST') {
        points++
        if (points === total_clients) {
          success(`all ${ points } users disconnected`)
        }
      } else {
        fail('invalid reason catch')
      }
    })
  }
})




