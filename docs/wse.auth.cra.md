# Challenge-Response Authentication

Secure authentication without sending passwords over the network.

## Server Setup

```javascript
import crypto from 'crypto'
import { WseServer } from 'wse'

const users = { alice: 'hash_of_password_123' }

// Setup challenge generator
const server = new WseServer({ port: 4200, identify })

server.useChallenge((identity, meta, quest, refuse) => {
  if (!users[identity]) return refuse()
  quest({ nonce: crypto.randomBytes(16).toString('hex') })
})

// Validate challenge response
function identify({ identity, challenge, accept, refuse }) {
  if (!challenge) return refuse()
  
  const expectedHash = crypto.createHash('sha256')
    .update(users[identity] + challenge.quest.nonce)
    .digest('hex')
  
  if (challenge.response === expectedHash) {
    accept(identity)
  } else {
    refuse()
  }
}
```

## Client Setup

```javascript
import crypto from 'crypto'
import { WseClient } from 'wse'

const client = new WseClient({ url: 'ws://localhost:4200' })

client.challenge((quest, solve) => {
  const password = 'password_123'
  const response = crypto.createHash('sha256')
    .update(password + quest.nonce)
    .digest('hex')
  solve(response)
})

await client.connect('alice')
```

## How It Works

1. Client sends username to server
2. Server generates random nonce, sends challenge to client
3. Client hashes password + nonce, sends response back
4. Server validates response against stored password hash
5. Connection accepted or refused

This ensures passwords never travel over the network, and each challenge is unique.

## Key Concepts

- **`conn.identity`** - Username sent by client
- **`conn.cid`** - Resolved user ID after challenge validation
- **`challenge.quest`** - Challenge data (nonce) sent to client
- **`challenge.response`** - Client's hashed response