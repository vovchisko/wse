const WSEServer = require('./src/server');
const WSEClient = require('./src/client');

let NEXT_ID = 0;

function auth(c, dat, authorize) {
    if (c === 'hi') {
        console.log('authorized: ', c, dat);
        authorize(++NEXT_ID);
    } else {
        console.log('nope, connection rejected')
    }
}

let srv = new WSEServer(3334, auth);
srv.init();

let c1 = new WSEClient('ws://localhost:3334');
c1.on('open', function () {
    c1.send('hi', 2);
});

let c11 = new WSEClient('ws://localhost:3334');
c11.on('open', function () {
    c11.send('hello');
});

let c2 = new WSEClient('ws://localhost:3334');
c2.on('open', function () {
    c2.send('hi', {from: 'C2'});
});


let c3 = new WSEClient('ws://localhost:3334');
c3.on('open', function () {
    c3.send('hello', 'pew');
});
