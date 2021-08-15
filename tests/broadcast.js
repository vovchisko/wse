import { execute } from 'test-a-bit'

import { create_client, create_server, VALID_SECRET } from './_helpers.js'

execute('only one connection per client', async (success, fail) => {
  const server = create_server()

  const client1 = create_client()
  const client2 = create_client()
  const client3 = create_client()
  const client4 = create_client()

  const result = []
  const check_result = () => {
    if (result.length === 4) {
      result.forEach(val => val !== '42' ? fail('broadcast failed') : null)
      success('broadcast is correct')
    }
  }

  client1.channel.on('broad-message', dat => {
    result.push(dat.test)
    check_result()
  })

  client2.channel.on('broad-message', dat => {
    result.push(dat.test)
    check_result()
  })

  client3.channel.on('broad-message', dat => {
    result.push(dat.test)
    check_result()
  })

  client4.channel.on('broad-message', dat => {
    result.push(dat.test)
    check_result()
  })

  await client1.connect(VALID_SECRET, { user_id: 'UID1' })
  await client2.connect(VALID_SECRET, { user_id: 'UID2' })
  await client3.connect(VALID_SECRET, { user_id: 'UID3' })
  await client4.connect(VALID_SECRET, { user_id: 'UID4' })

  server.broadcast('broad-message', { test: '42' })
})




