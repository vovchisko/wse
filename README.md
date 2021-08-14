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


For more examples see: https://github.com/vovchisko/wse/tree/master/tests


