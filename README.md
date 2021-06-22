# wse

Websocket wrapper with a several handy features.

- Client management;
- Messaging protocol `message:{data}`;
- Simple authorization handler;

## Installation

```bash
npm install wse -s
```

#### Opt-in for performance

There are 2 optional modules that can be installed along side with the ws module. These modules are binary addons which improve
certain operations.

```npm install --save-optional bufferutil```: Allows to efficiently perform operations such as masking and unmasking the data
payload of the WebSocket frames.

```npm install --save-optional utf-8-validate```: Allows to efficiently check if a message contains valid UTF-8.

Read More: https://www.npmjs.com/package/ws#opt-in-for-performance

## Inside

``WseServer`` - NodeJS Server. Not available in the browser.

``WseClient`` - Client works everywhere - Browser, NodeJS, or Electron.

``WseServerMulti`` - Same as WseServer, but supports multiple connections with the same user ID. Super handy for cross platform
applications when user can login multiple devices at the same time.

``WSE_REASON`` - Constants with reasons of closure connections.

## Usage

```
import { WseClient, WseServer } from 'wse'

const VALID_SECRET = 'it can be JWT or any API-key'

const client = new WseClient({ url: `ws://localhost:3000` })
const server = new WseServer({ port: WS_TEST_PORT, incoming })

// handler used to validate incoming connections
export function incoming ({ payload, resolve, meta }) {
  if (payload === VALID_SECRET) {
    const user_id = 'USR-01'

    // if user payload is valid - we can accept connection
    // by calling resolve(id, {welcome_data}) so this cannection now officially valid
    // only resolved connections can recieve messages
    // user_id also needs to be unique. if connection with the same ID already
    // exists, it woll be dropped, and new one will be accepted
    resolve(user_id, { hey: 'some additional data for the client' })
  } else {
    // reject this connection
    resolve(false)
  }
}

// init call is required. it will start listening port.
server.init()

// ready-signal will fire when connection is accepted.
// any attempts to send a message before
// `welcome` message from the server will be ignored.
client.ready.on(welcome_data => {
    server.log('very welcomed', welcome_data)
})

// connect is async
await client.connect(VALID_SECRET, { client_meta: 1 })

```

For more examples see: https://github.com/vovchisko/wse/tree/master/tests
