# WSE - WebSocket Everywhere!

[![npm version](https://badge.fury.io/js/wse.svg)](https://badge.fury.io/js/wse)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Made in Ukraine](https://img.shields.io/badge/Made%20in%20Ukraine-❤️-0057B7?style=flat&labelColor=005BBB&color=FFD700)](https://x.com/sternenkofund)

WSE (WebSocket Everywhere!) is a lightweight WebSocket wrapper that provides authentication, RPC support, and multi-device messaging.

Goes with client for NodeJS/Browser, and NodeJS server.

Fastify/Express/HTTP-server [friendsly](./docs/wse.rpc.server-client.md) - can be easily mixed with regular web-api without dedicated ws port.

## Why?

Just wanted RPC-like api without brokers and routers.

## Installation

```bash
npm install wse
```

## Example

```javascript
import { WseServer, WseClient } from 'wse'

// Server
const server = new WseServer({
  port: 4200,
  identify: ({ accept }) => accept('user-' + Date.now())
})

server.channel.on('chat', (conn, message) => {
  server.broadcast('chat', { user: conn.cid, message })
})

server.register('ping', () => 'pong')

// Client
const client = new WseClient({ url: 'ws://localhost:4200' })
await client.connect()
client.send('chat', 'Hello world!')

const result = await client.call('ping')
console.log(result) // 'pong'
```

## Documentation

Yes, it's all here, **[Docs and API Reference](docs/wse.md)**.

Have fun! ❤️

---

Russian warship - go fuck yourself! 🖕
