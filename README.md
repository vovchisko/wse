# WSE

Client-centric WebSocket Expansion.

- Easy client management;
- Messaging protocol;
- Simple authorization handler;
- Custom Messaging Protocol Processor for real racers.
- Basic Challenge-response Auth handlers.
- WS Remote Procedures.

## Installation

```bash
npm i wse -s
```

# Usage

```JavaScript
// server
import { WseServer } from 'wse'

// auth handler
function identify ({ payload, accept, meta }) {
  if (payload === SECRET) {
    const cid = 'any user id here'
    accept(cid, { hey: 'welcome back!' })
  } else {
    reject()
  }
}

const server = new WseServer({ port: 4200, identify })

server.broadcast('broad-message', { paylog: 'hey there!' })

server.channel.on('test-message', (conn, dat) => {
  console.log('we got test-message from', conn.cid, dat)

  conn.send('welcome-here', { payload: 42 })
})

```

```JavaScript
// client
import { WseClient } from 'wse'

const client = new WseClient({ url: 'ws://lcoalhost:4200' })

await client.connect(SECRET)

client.when.ready(() => {
  client.send('test-message', { a: 1, b: 2 })
})

client.channel.on('welcome-here', (dat) => {
  console.log('got it', dat)
})
```

> API Docs is in progress now.
> For more examples see: https://github.com/vovchisko/wse/tree/master/tests

### Opt-in for performance

There are 2 optional modules that can be installed along side with the `ws` module. These modules are binary addons which
improve certain operations.

```npm install --save-optional bufferutil```: Allows to efficiently perform operations such as masking and unmasking the data
payload of the WebSocket frames.

```npm install --save-optional utf-8-validate```: Allows to efficiently check if a message contains valid UTF-8.

Read More: https://www.npmjs.com/package/ws#opt-in-for-performance

### Todo:
- `server.useChallenge(()=>{})` - combine all arguments into an object.
- `client.connect()` - let pass challenger.
- add auto-reconnect (and it's prevention as well).

