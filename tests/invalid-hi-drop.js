import { execute }                     from 'test-a-bit'
import { create_server, WS_TEST_PORT } from './_helpers.js'
import WS                              from 'ws'
import { WSE_REASON }                  from '../node.js'

execute('invalid message', async (success, fail) => {
  const server = create_server()

  const fake_ws = new WS(`ws://localhost:${ WS_TEST_PORT }`, 'wse-default-json')

  fake_ws.on('close', (code, reason) => {
    if (!process.send) console.log('FAKE_WS::', 'close', code, String(reason))
    code === 1000 && String(reason) === WSE_REASON.PROTOCOL_ERR
        ? success('client disconnected as expected')
        : fail('invalid code or reason on disconnect')
  })

  fake_ws.on('open', () => {
    fake_ws.send('suck my balls!')
  })
})
