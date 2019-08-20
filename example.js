// SERVER


const { WseServer } = require('./node')

// auth procedure is all up to you,
// the only required is pass user_id to resolve()
// let's say we expect this ID from user
function on_auth(data, resolve) {
    if (data && data.id && data.api_key === 'yes_it_is') {
        // yes, this client looks valid and his ID will be...
        // only after this you'll get message events.
        resolve(data.id, { hey: 'some additional data here' })
    } else {
        // user will be disconnected instantly
        // no events fired
        resolve(false)
    }
}

const srv = new WseServer({ port: 3334 }, on_auth)

srv.emit_messages_ignored = true

// most useful events here
srv.on('join', (client) => console.log('join:', client.id))
srv.on('leave', (client, code, reason) => console.log('leave:', client.id, code, reason))
srv.on('error', (conn, err) => console.log('err:', conn.id, err))
srv.on('m:_ignored', (client, c, dat) => console.log('INGNORED', client.id, c, dat))
// let's pong all messages
srv.on('m:ping', (client, dat) => {
    console.log('message:', client.id, dat)
    client.send('pong', Math.random())
})
// server is ready and can listen
srv.init()


// CLIENT


const { WseClient } = require('./node')

const client = new WseClient('ws://localhost:3334', {/* classic ws options */ })
client.emit_messages_ignored = true

// client object can be re-used btw.
// no need to create new instance if this one disconnected.
// just call connect again.
client.connect({ id: 'USER-1', api_key: 'yes_it_is' })

client.on('open', (dat) => console.log(' >> connected and logged in', dat))
//client.on('message', (c, dat) => console.log(' >> message form server', c, dat));
client.on('m:_ignored', (c, dat) => console.log('IGNORED MESSAGE!', c, dat))
client.on('m:pong', (dat) => { console.log('pong, ok...')})
client.on('close', (code, reason) => console.log(' >> connection closed', code, reason))
client.on('error', (e) => console.log(' >> connection error', e))

// not let's talk.
setInterval(() => {
    client.send('ping', Math.random())
    client.send('something', Math.random())
}, 1000)
