# wse
Suspicious wrapper for ``ws`` with authorization and customizable protocol. Useful when you talking WS a lot. It looks like original WS, and even smells the same. But a little bit cooler. About 25% cooler.

### Inside:

``WseClient`` - node / Browser client class.
``WseServer`` - node server class.
``WseServerMulti`` - same as WseServer, but support multiple connections with the same user ID.
``REASON`` - list of constants with reasons for closing connections.


***BEWARE! BEWA-A-A-A-A-ARE!***
*This package are not tested well and still in development. It mostly working, but I don`t recommend to use it on production like I do.*



### Example

To create ``wse`` server you need to pass params with port or pass httpServer, just like with classic [``ws`` package](/package/ws).
Also you should specify ``on_auth`` function to describe auth process after client connected.

#### Server example
```JavaScript

const {WseServer} = require('wse');

// auth procedure is all up to you,
// the only required is pass user_id to resolve()
// let's say we expect this ID from user
function on_auth(data, resolve) {
    if (data && data.id && data.api_key === 'yes_it_is') {
        // yes, this client looks valid and his ID will be...
        // only after this you'll get message events.
        resolve(data.id);
    } else {
        // user will be disconnected instantly
        // no events fired
        resolve(false);
    }
}

const srv = new WseServer({port: 3334}, on_auth);

// most useful events here
srv.on('join', (client) => console.log('join:', client.id));
srv.on('leave', (client, code, reason) => console.log('leave:', client.id, code, reason));
srv.on('error', (conn, err) => console.log('err:', conn.id, err));

// let's pong all messages
srv.on('message', (client, c, dat) => {
    console.log('message:', client.id, c, dat);
    client.send('pong', Math.random());
});

// server is ready and can listen
srv.init();


```


#### Client Example

This can be used with node env and browser as well.

```JavaScript

const {WseClient} = require('wse');

const client = new WseClient('ws://localhost:3334', {/* classic ws options */});


// client object can be re-used btw.
// no need to create new instance if this one disconnected.
// just call connect again.
client.connect({id: 'USER-1', api_key: 'yes_it_is'});

client.on('open', (dat) => console.log(' >> connected and logged in', dat));
client.on('message', (c, dat) => console.log(' >> message form server', c, dat));
client.on('close', (code, reason) => console.log(' >> connection closed', code, reason));
client.on('error', (e) => console.log(' >> connection error', e));

// not let's talk.
setInterval(() => {
    client.send('ping', Math.random());
}, 1000);


```

#### Custom Protocol Example

Cusom protocol is a class, that should contain ``pack`` and ``unpack`` function. It will be used everywhere on cleint and server for messageing. Let's say you don't like JSON and you need tomething faster. Default protocol use JSON, just like this:

```Javascript

class WseCustomProtocol {
    constructor() {
        this.name = 'wse-default-json'; // protocol name
        this.hi = 'hello'; // `hello` message
    }

    pack(c, dat) {
        // pack messages any way you want
        return JSON.stringify({
            c: c,
            dat: dat
        });
    }

    unpack(string) {
        //unpack mesages any way you want
        return JSON.parse(string);
    }
}

```

You can create your own, describe messages processing any way you want and use it on server and client sides like this:

```Javascript
// client side
const client = new WseClient('ws://localhost:3334', {/* ws options */}, new WseCustomProtocol());

// server side
const srv = new WseServer({port: 3334}, on_auth, new WseCustomProtocol());
```

We all set.
