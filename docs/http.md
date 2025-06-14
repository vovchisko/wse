# HTTP

## Express Integration

```javascript
import express from 'express'
import { createServer } from 'http'
import { WseServer, WSE_ERROR } from 'wse'

const app = express()
const httpServer = createServer(app)

// Create WSE server with noServer option
const wseServer = new WseServer({ 
  noServer: true,  // Important: let Express handle the HTTP server
  identify: yourIdentifyHandler
})

// Handle HTTP routes
app.get('/', (req, res) => {
  res.send('Express server with WSE')
})

// Handle WebSocket upgrade
httpServer.on('upgrade', (request, socket, head) => {
  // You can filter by path or add custom validation
  if (request.url === '/ws') {
    try {
      wseServer.ws.handleUpgrade(request, socket, head, (ws) => {
        wseServer.ws.emit('connection', ws, request)
      })
    } catch (error) {
      console.error('Upgrade failed:', error)
      socket.destroy()
    }
  } else {
    socket.destroy()
  }
})

// Error handling
wseServer.when.error((error, conn) => {
  console.error(`WebSocket error: ${error.code}`, error.details)
  if (conn) {
    conn.send('error', { message: 'Internal server error' })
  }
})

// Start server
httpServer.listen(3000, () => {
  console.log('Server running on port 3000')
})
```

## Fastify Integration

```javascript
import Fastify from 'fastify'
import { WseServer, WSE_ERROR } from 'wse'

const fastify = Fastify()
const wseServer = new WseServer({ 
  noServer: true,
  identify: yourIdentifyHandler
})

// Handle HTTP routes
fastify.get('/', async (request, reply) => {
  return { hello: 'world' }
})

// Handle WebSocket upgrade
fastify.server.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws') {
    try {
      wseServer.ws.handleUpgrade(request, socket, head, (ws) => {
        wseServer.ws.emit('connection', ws, request)
      })
    } catch (error) {
      console.error('Upgrade failed:', error)
      socket.destroy()
    }
  } else {
    socket.destroy()
  }
})

// Error handling
wseServer.when.error((error, conn) => {
  console.error(`WebSocket error: ${error.code}`, error.details)
})

// Start server
fastify.listen({ port: 3000 }, (err) => {
  if (err) throw err
  console.log('Server running on port 3000')
})
``` 