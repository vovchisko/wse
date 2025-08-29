# Generic Authentication

Flexible authentication using tokens, API keys, or database lookups.

## Example

```javascript
// Server validates tokens against database
async function identify({ identity, accept, refuse }) {
  try {
    const user = await database.validateToken(identity.token)
    if (user) {
      accept(user.id, { message: 'Welcome back!', role: user.role })
    } else {
      refuse()
    }
  } catch (error) {
    refuse()
  }
}

const server = new WseServer({ port: 4200, identify })

// Client connects with token
const client = new WseClient({ url: 'ws://localhost:4200' })
await client.connect({ token: 'jwt-token', deviceId: 'mobile-123' })
```

## Key Concepts

- **`conn.identity`** - Original auth data from client (token, object, etc.)
- **`conn.cid`** - Resolved user ID from database/validation
- **`accept(userId, welcomeData)`** - Send welcome data back to client
- Identity can be string, object, or any data structure