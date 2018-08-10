# wse
Suspicious wrapper for ``ws`` with authorization and customizable protocol. Useful when you talking WS a lot. It looks like original WS, and even smells the same. But a little bit tricky.

**BEWARE! BEWAAAARE!**
This is package still in development! I DON`T recommend to use it on production.


#### Client Example
```
import {WseClient} from 'wse';

let ws = new WseClient('ws://localhost:4200');

ws.on('open', () => {
    // say hi to your server and send something to proove your auth
    // it can be login/pass pair in data, or api-key
    ws.send('hi', {id: 'USR_ID_123', api_key: 'whatever...'});
});

// handle errors
ws.on('error', (e) => {
    console.log(e);
});

// handle connection closing
ws.on('close', (code, reason) => {
    console.log(code, reason)
});

// handle all messages
ws.on('message', (c, d) => {
    console.log(c, d)
});

//handle specific messages
ws.on('m:specific', (dat) => {
    console.log('specific message comes', dat);
});


// send messages anywhere you want
setInterval(() => {
    ws.send('pew', {pew: Math.random()});
}, 1000);

```


#### Server Example
```
const {WseServer} = require('wse');

const wse = new WseServer({
    name: 'WSE',
    port: 4200,
    cpu: 2, // how many clients with the same ID can be connected at the same time
    logging: true, // enable/disable logging
    protocol: null // custom protocol for packing/unpakcing messages
    auth: (c, dat, is_auth) => {

        // first message from user comes calls this function
        // if user didn't said 'hi' - it's not authorized
        if (c !== 'hi') return is_auth(false);

        // but if he did...
        console.log('imaginary auth logic here: ', c, dat.api_key);

        let user_id = dat.id;

        // and if all fine - pass some UID to resolve function
        is_auth(user_id);

    }
});

// client connected and auth passed
wse.on('connected', (client) => {
    console.log('cleint.id = ' + client.id);
});

// client messages handler
wse.on('message', (client, c, dat) => {
    console.log('message: ',client.id, c, dat);
});

// specific cleint messages
wse.on('m:pew', (client, dat) => {
    console.log('and specific as well... ', client.id, dat);
});

// don't forget about it.
wse.init();

```

Run both and output should looks like this:
```
WSE: init(); port:4200; cpu:2;
imaginary auth logic here:  hi whatever...
WSE: USR_ID_123 joined
cleint.id = USR_ID_123
message:  USR_ID_123 pew { pew: 0.2987436472862286 }
message:  USR_ID_123 pew { pew: 0.40504279778762675 }
message:  USR_ID_123 pew { pew: 0.7377476244540382 }
message:  USR_ID_123 pew { pew: 0.40869384043631984 }
message:  USR_ID_123 pew { pew: 0.5172177945917174 }
message:  USR_ID_123 pew { pew: 0.15122329591774708 }
```


#### Custom / Default Protocol
You can pass ``Protocol`` object to ``WseServer`` or ``WseClient`` and both uses it's pack/unpack functions to, obviously, pack/unpack messages.

Default one looks like this:
```
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
```
const wse = new WseServer({
    protocol: new MyOwnProtocol() // your own class with pack/unpack functions
});
```

And the same for client:
```
const protocol = new MyOwnProtocol(); // use the same class as for server
const ws = new WseClient('ws://localhost:4200', protocol);
```




Did I miss something?
