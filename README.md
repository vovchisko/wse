# wse
Suspicious wrapper for ``ws`` with authorization and customizable protocol. Useful when you talking WS a lot. It looks like original WS, and even smells the same. But a little bit tricky.

**BEWARE! BEWAAAARE!**
This is package still in development! I DON`T recommend to use it on production. It probably working. Probably.


#### Server example
```JavaScript
// server example

const WseServer = require('wse').WseServer;

// wse params
const wse_params = {
    portocol: null, // custom messaging protocol or null - default [ json {c,dat} ]
    cpu: 1, // how many clients with the same ID can connect
    logging: true, // show console output

    // auth function. pass client_id (string) or false/null
    // it means user authorized or not.
    auth: (c, dat, resolve) => {
        if (c === 'hi') {
            resolve(dat); //authorized
        } else {
            resolve(null); // nope
        }
    }
};

// original WS params
const ws_params = {port: 3334};

let srv = new WseServer(wse_params, ws_params);

srv.on('message', (client, e, data) => { console.log('id:', client.id, e, data) });
srv.on('connected', (client) => console.log('client.connected', client.conns.length));
srv.on('leave', (client) => console.log('client.leave!', client.id));

srv.init(); // ready!

```

#### Client Example
```JavaScript
const WseClient = require('wse').WseClient;

const client1 = new WseClient('ws://localhost:3334', {/*original ws client setting */}, null);

client1.on('open', () => client1.send('hi', 'ID-1'));
client1.on('message', (c, dat) => console.log('C1 GOT: ', c, dat));
client1.on('close', (code, reason) => console.log('C1 CLOSED: ', code, reason));
client1.on('error', (e) => console.log('C1 ERR: ', e));
```


#### Custom / Default Protocol
You can pass ``Protocol`` object to ``WseServer`` or ``WseClient`` constructor, and both uses it's pack/unpack functions to, obviously, pack/unpack messages.

Default one looks like this:
```JavaScript
class DefaultProtocol {
    constructor() {
        // not even used :3
        this.type = 'default/json';
    }

    pack(c, dat) {
        // pack message how you like here
        return JSON.stringify({c: c, dat: dat});
    }

    unpack(string) {
        // parse message how you like here
        return JSON.parse(string);
    }
}

```

But Let's say you don't like JSON. Or you have some strict rules for your messages structure, and want to handle it faster and make it smaller.
Just pass your own protocol with this functions:
```JavaScript
const wse = new WseServer({
    protocol: new MyOwnProtocol() // your own class with pack/unpack functions
});
```

And the same for client:
```JavaScript
const protocol = new MyOwnProtocol(); // use the same class as for server
const ws = new WseClient('ws://localhost:4200', protocol);
```




Did I miss something?
