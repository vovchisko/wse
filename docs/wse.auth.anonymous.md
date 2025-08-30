# Anonymous Authentication

Server accepts all connections without requiring credentials.

## Server Setup

```javascript
import { WseServer } from 'wse'

function identify({ accept }) {
  accept('anonymous-' + Date.now())
}

const server = new WseServer({ port: 4200, identify })
```

## Client Connection

```javascript
import { WseClient } from 'wse'

const client = new WseClient({ url: 'ws://localhost:4200' })
await client.connect() // No identity needed
```

## Use Cases

- Public chat rooms
- Demo applications
- Development/testing
- Open broadcast channels

## Key Concepts

- **`conn.identity`** - Will be `undefined` since no identity sent
- **`conn.cid`** - Generated user ID from `accept()`
- No validation needed - all connections accepted