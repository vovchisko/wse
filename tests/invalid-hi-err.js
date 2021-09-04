import { execute }                   from 'test-a-bit'
import { identify, WS_PORT, WS_URL } from './_helpers.js'
import WS                            from 'ws'
import { WseServer }                 from '../src/server.js'

execute('invalid message', async (success, fail) => {
  const server = new WseServer({ port: WS_PORT, identify })

  const fake_ws = new WS(WS_URL, 'wse-default-json')

  server.when.error((err, message) => {
    err instanceof SyntaxError && message
        ? success('error event fired')
        : fail('error event has invalid arguments')
  })


  fake_ws.on('open', () => {
    fake_ws.send('suck my balls!')
  })
})
