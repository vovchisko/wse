import { execute }                     from 'test-a-bit'
import { create_server, WS_TEST_PORT } from './_helpers.js'
import WS                              from 'ws'

execute('invalid message', async (success, fail) => {
  const server = create_server()


  server.when.error((err, message) => {
    err instanceof SyntaxError && message
        ? success('error event fired')
        : fail('error event has invalid arguments')
  })

  const fake_ws = new WS(`ws://localhost:${ WS_TEST_PORT }`, 'wse-default-json')

  fake_ws.on('open', () => {
    fake_ws.send('suck my balls!')
  })
})
