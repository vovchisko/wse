import { execute } from 'test-a-bit'

import { identify, SECRET, wait, WS_PORT, WS_URL } from './_helpers.js'
import { WseServer } from '../src/server.js'
import { WseClient } from '../src/client.js'

// A response that arrives after its call timed out has no callback left.
// handleResponse() returns false and execution falls through to the incoming-call
// branch, which answers `~wse:response` with a `response_error` reusing the same
// stamp. The peer can't match that stamp either and answers back — forever.
// Correct behaviour: an unmatched response frame is dropped silently.
execute('case: late rp response must not start a frame storm', async (success, fail) => {
  const STORM_LIMIT = 5

  class ErrorFrameCounter {
    constructor () {
      this.name = 'wse-default-json'
      this.internal_types = Object.freeze({
        hi: '~wse:hi',
        challenge: '~wse:challenge',
        welcome: '~wse:welcome',
        call: '~wse:call',
        response: '~wse:response',
        response_error: '~wse:response-err',
      })
      this.errors = 0
    }

    pack ({ type, payload = undefined, stamp = undefined }) {
      if (type === this.internal_types.response_error) {
        if (++this.errors > STORM_LIMIT) {
          fail(`frame storm: client sent ${ this.errors } response_error frames for one late reply`)
        }
      }
      return JSON.stringify([ type, payload, stamp ])
    }

    unpack (encoded) {
      return JSON.parse(encoded)
    }
  }

  const protocol = new ErrorFrameCounter()
  const server = new WseServer({ port: WS_PORT, identify })
  const client = new WseClient({ url: WS_URL, protocol, tO: 0.1 })

  // answers 150ms after the client already gave up
  server.register('slow', async () => {
    await wait(250)
    return 'late'
  })

  await client.connect(SECRET)

  try {
    await client.call('slow')
    return fail('call did not time out')
  } catch (e) {
    // expected: RP_TIMEOUT
  }

  await wait(500) // late reply lands at ~250ms, storm (if any) runs after it

  protocol.errors === 0
      ? success('late response dropped silently')
      : fail(`client answered the late response with ${ protocol.errors } error frame(s)`)
})
