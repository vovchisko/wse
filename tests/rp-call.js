import { execute } from 'test-a-bit'

import { create_pair, VALID_SECRET, wait } from './_helpers.js'

execute('rp call', async (success, fail) => {
  const { server, client } = create_pair()

  server.register('test-rp', async (client, dat) => {
    await wait(100)
    return dat.value * 2
  })

  await client.connect(VALID_SECRET, { client_meta: 1 })
  try {
    const res = await client.call('test-rp', { value: 21 })
    if (res === 42) success('42 is correct response from rp')
  } catch (e) {
    fail(`failed to call rp ${ e }`)
  }
})
