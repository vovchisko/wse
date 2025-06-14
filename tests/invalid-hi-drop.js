import { execute } from 'test-a-bit'
import { identify, WS_PORT, WS_URL } from './_helpers.js'
import WS from 'ws'
import { WSE_REASON } from '../src/common.js'
import { WseServer } from '../src/server.js'

execute('invalid message', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })

  const fake_ws = new WS(WS_URL, 'wse-default-json')

  fake_ws.on('close', (code, reason) => {
    code === 1000 && String(reason) === WSE_REASON.PROTOCOL_ERR
      ? success('client disconnected as expected')
      : fail('invalid code or reason on disconnect')
  })

  fake_ws.on('open', () => {
    fake_ws.send('suck my balls!')
  })
})
