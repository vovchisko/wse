# Auth

## Anonymous Connections

Server accepts everyone without authentication:

```javascript
import { WseServer } from 'wse'

// Server accepts everyone
function identify({ accept }) {
  accept('anonymous-' + Date.now())
}

const server = new WseServer({ port: 4200, identify })

// Client connects without credentials
const client = new WseClient({ url: 'ws://localhost:4200' })
await client.connect()
```

## Login/Password (Challenge-Response)

Secure authentication without sending passwords over the wire:

```javascript
import crypto from 'crypto'

// Server setup
const users = { alice: 'hash_of_password_123' }

server.useChallenge((identity, meta, quest, refuse) => {
  if (!users[identity]) return refuse()
  quest({ nonce: crypto.randomBytes(16).toString('hex') })
})

function identify({ identity, challenge, accept, refuse }) {
  const expectedHash = crypto.createHash('sha256')
    .update(users[identity] + challenge.quest.nonce)
    .digest('hex')
  
  if (challenge.response === expectedHash) {
    accept(identity)
  } else {
    refuse()
  }
}

// Client setup
client.challenge((quest, solve) => {
  const userPassword = 'password_123'
  const response = crypto.createHash('sha256')
    .update(userPassword + quest.nonce)
    .digest('hex')
  solve(response)
})

await client.connect('alice')
```

## Token-Based Authentication

Simple token validation:

```javascript
// Server validates tokens
const validTokens = new Set(['token-123', 'token-456'])

function identify({ identity, accept, refuse }) {
  if (validTokens.has(identity)) {
    accept('user-' + identity.slice(-3))
  } else {
    refuse()
  }
}

// Client connects with token
await client.connect('token-123')
```

## Database Integration

Real-world example with database lookup:

```javascript
// Server with database
function identify({ identity, accept, refuse }) {
  // identity could be JWT, API key, etc.
  database.validateUser(identity)
    .then(user => {
      if (user) {
        // accept(userId, welcomePayload)
        accept(user.id, { message: 'Welcome back!', role: user.role })
      } else {
        refuse()
      }
    })
    .catch(() => refuse())
}

// Client receives welcome payload
client.when.ready((welcomeData) => {
  console.log(welcomeData.message) // "Welcome back!"
  console.log(welcomeData.role)    // "admin"
})
``` 