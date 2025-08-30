# WSE Documentation

WSE (WebSocket Everywhere!) is a lightweight WebSocket wrapper that provides authentication, RPC support, and multi-device messaging.

Goes with client for NodeJS/Browser, and NodeJS server.

Fastify/Express/HTTP-server [friendsly](wse.rpc.server-client.md) - can be easily mixed with regular web-api without dedicated ws port.

## Terminology

`Identity` - An authenticated user who can have multiple device connections. Created after successful authentication with a unique user ID.

`Connection` - A single WebSocket connection representing one device. Multiple connections can belong to the same identity.

`Channel` - EventEmitter pattern for handling fire-and-forget messages between client and server.

`Server→Client RPC` - Remote procedure calls initiated by the server on client connections, unlike typical protocols where only clients call server procedures.

`Multi-device messaging` - Send messages to all devices of a user (via identity) or to a specific device (via connection).

## Core Features

### Authentication

- **[Anonymous](wse.auth.anonymous.md)** - No authentication, accept all connections
- **[Challenge-Response](wse.auth.cra.md)** - Secure password-based auth without sending passwords
- **[Generic](wse.auth.generic.md)** - Tokens, API keys, database lookups

### Messaging

- **[Messaging](wse.messaging.md)** - Channels, broadcasting, fire-and-forget messages
- **[RPC Calls](wse.rpc.md)** - Bidirectional remote procedure calls
- **[Server→Client RPC](wse.rpc.server-client.md)** - Server calling client procedures

### Advanced

- **[Custom Protocols](wse.protocol.md)** - Implement custom message protocols
- **[Constants](wse.api.constants.md)** - Error codes, statuses, and close reasons
- **[HTTP Integration](wse.server.custom.md)** - Express/HTTP server integration

## API Reference

- **[Server](wse.api.server.md)** - WseServer methods and properties
- **[Connection](wse.api.server.connection.md)** - WseConnection (single device)
- **[Identity](wse.api.server.identity.md)** - WseIdentity (authenticated user)
- **[Client](wse.api.client.md)** - WseClient methods and properties
- **[Error](wse.api.error.md)** - WseError structure and extraction
