import { execute } from 'test-a-bit'

import { createServer } from 'http'

import { identify, SECRET, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer }                         from '../src/server.js'
import { WseClient }                         from '../src/client.js'

execute('multiple servers sharing a single http/s server', async (success, fail) => {
  const server1 = new WseServer({ identify, noServer: true })
  const server2 = new WseServer({ identify, noServer: true })

  const client1 = new WseClient({ url: WS_URL + '/foo', noServer: true })
  const client2 = new WseClient({ url: WS_URL + '/bar', noServer: true })
  const client3 = new WseClient({ url: WS_URL + '/ignored', noServer: true })

  const http = createServer()

  const goals = {
    s1_upgraded: null,
    s2_upgraded: null,
    c1_connect: null,
    c2_connect: null,
    talk1: null,
    talk2: null,
    reject_ignored: null,
  }

  const markGoal = (goal_key) => {
    goals[goal_key] = true
    if (Object.keys(goals).every(v => goals[v] === true)) success('all correct')
  }


  http.on('upgrade', function upgrade (request, socket, head) {
    const pathname = request.url
    if (pathname === '/foo') {
      server1.ws.handleUpgrade(request, socket, head, function done (ws) {
        markGoal('s1_upgraded')
        server1.ws.emit('connection', ws, request)
      })
    } else if (pathname === '/bar') {
      server2.ws.handleUpgrade(request, socket, head, function done (ws) {
        server2.ws.emit('connection', ws, request)
        markGoal('s2_upgraded')
      })
    } else if (pathname === '/ignored') {
      socket.destroy()
    } else {
      socket.destroy()
      fail('this is wrong')
    }
  })


  server1.when.joined((client, meta) => {
    if (meta.user_id === 1 && client.id === 1) {
      markGoal('c1_connect')
    } else {
      fail('invalid meta on join')
    }
  })

  server2.when.joined((client, meta) => {
    if (meta.user_id === 2 && client.id === 2) {
      markGoal('c2_connect')
    } else {
      fail('invalid meta on join')
    }
  })

  server1.channel.on('talk', (c, payload) => {
    if (c.id === 1 && payload === 10) {
      markGoal('talk1')
    } else {
      fail('got wrong message on server1')
    }
  })

  server2.channel.on('talk', (c, payload) => {
    if (c.id === 2 && payload === 20) {
      markGoal('talk2')
    } else {
      fail('got wrong message on server2')
    }
  })

  http.listen(WS_PORT)


  await client1.connect(SECRET, { user_id: 1 })
  client1.send('talk', 10)

  await client2.connect(SECRET, { user_id: 2 })
  client2.send('talk', 20)

  await client3.connect(SECRET, { user_id: 3 }).catch(e => {
    markGoal('reject_ignored')
  })
})
