# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Test**: `npm test` - Runs the full test suite using test-a-bit runner
- **Test with watch**: `npm test:watch` - Runs tests in watch mode  
- **Lint**: `npx eslint .` - Lints all JavaScript files using ESLint
- **Format**: `npx prettier --write .` - Formats code using Prettier

## Architecture Overview

This is WSE (WebSocket Everywhere) - a WebSocket wrapper library with authentication, RPC, and multi-device messaging.

### Core Architecture

**Three-Layer Connection Model:**
- `WseServer` - Main server instance that manages all connections
- `WseIdentity` (client) - Represents an authenticated user (can have multiple devices)
- `WseConnection` (conn) - Represents a single WebSocket connection/device

**Key Relationships:**
- One user (`WseIdentity`) can have multiple connections (`WseConnection`) 
- `server.clients` maps user IDs to `WseIdentity` instances
- `client.conns` maps connection IDs to `WseConnection` instances
- `conn.client` references the `WseIdentity` this connection belongs to

### Authentication Flow

1. Client sends auth data via `client.connect(identity, meta)`
2. Server receives this as `conn.identity` (original auth data: tokens, credentials)
3. Server validates in the `identify()` callback function
4. Server calls `accept(cid)` with resolved user identifier
5. `WseIdentity` is created with the resolved `cid`

**Important Data Locations:**
- `conn.identity` - Original authentication data from client
- `conn.cid` / `client.cid` - Resolved user identifier after authentication
- `conn.meta` - Additional metadata from this specific connection
- `client.meta` - Metadata from the FIRST connection of this user

### Core Components

- **`src/server.js`** - Main server implementation with WseServer, WseIdentity, WseConnection classes
- **`src/client.js`** - Client implementation with reconnection and RPC support
- **`src/protocol.js`** - Message protocol handling (WseJSON by default)
- **`src/rpc-man.js`** - RPC (Remote Procedure Call) manager for bidirectional calls
- **`src/common.js`** - Shared constants, error types, and utilities

### Message System

- **Channel-based messaging**: Uses EventEmitter pattern with `server.channel` and `client.channel`
- **Broadcasting**: `server.broadcast(type, payload)` sends to all users
- **Targeted messaging**: `server.send(cid, type, payload)` sends to specific user (all devices)
- **RPC support**: Bidirectional procedure calls with timeout handling

### Testing with test-a-bit

Uses `test-a-bit` - a simple NodeJS testing framework for free-style testing. Tests are comprehensive and cover authentication flows, RPC functionality, connection management, message routing, and error handling.

### Event Handling with a-signal

Uses `a-signal` - a specialized event emitter for single events with advanced features:
- **Priority-based listeners**: Control execution order with numeric priorities
- **Late listener support**: Catch events that happened before subscription
- **Memory mode**: Remember exact arguments for late subscribers
- **Promise-based waiting**: Await next signal emission with optional timeout

### Entry Points

- **Node.js**: `node.js` exports server and client classes
- **Browser**: `browser.js` exports client-only classes  
- **TypeScript**: `wse.d.ts` provides type definitions

### Configuration

- **ESLint**: Simple configuration with recommended rules
- **ES Modules**: Uses `"type": "module"` in package.json
- **Node 14+**: Minimum supported version
- **Dependencies**: Minimal - isomorphic-ws, tseep (EventEmitter), a-signal, ws