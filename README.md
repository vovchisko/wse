# wse
Susicious wrapper for WebSocket with autorization and customizable protocol.

**BEWARE!**
this is a development version, and NOT FOR PRODUCTION! I'm still working on it.


```
// example.js

const WSEServer = require('./src/server');
const wseServer = require('./src/client');

let NEXT_ID = 0;

function auth(c, dat, authorize) {
    if (c === 'hi') {
        console.log('authorized: ', c, dat);
        authorize(++NEXT_ID);
    } else {
        console.log('nope, you should say `hi`.');
    }
}

let srv = new WSEServer(3334, auth);
srv.init();

let client1 = new wseServer('ws://localhost:3334');
client1.on('open', function () {
    client1.send('hi', 2);
});

let client2 = new wseServer('ws://localhost:3334');
client2.on('open', function () {
    client2.send('pew-pew');
});
```
