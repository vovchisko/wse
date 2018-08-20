// server example

const WseServer = require('./src/server');
const WseCustomProtocol = require('./src/protocol');

function on_auth(dat, resolve) {
    resolve(dat); //authorized by used ID
}

let srv = new WseServer({port: 3334}, on_auth);
srv.logging = true;
srv.cpu = 1;
srv.name = 'WSE_TEST_SERVER';

// comes from ws events, but with wse parms.
srv.on('connection', (client, index) => console.log(' >> connection:', client.id, 'connection', index));
srv.on('close', (client, code, reason) => console.log(' >> close:', client.id, 'close', code, reason));

srv.on('join', (client) => console.log(' >> join:', client.id));
srv.on('leave', (client, code, reason) => console.log(' >> leave:', client.id, 'leave!', client.id, code, reason));
srv.on('message', (client, c, dat) => console.log(' >> message:', client.id, c, dat));
srv.on('error', (conn, err) => console.log(' >> err:', conn.id, err));

srv.init(); // ready!


//clients example

const WseClient = require('./src/client');

setTimeout(() => {
    let client = new WseClient('ws://localhost:3334');
    client.connect('C0');
    client.on('open', (dat) => console.log('    C0 - hi', dat));
    client.on('message', (c, dat) => console.log('   C0 GOT: ', c, dat));
    client.on('close', (code, reason) => console.log('   C0 CLOSED: ', code, reason));
    client.on('error', (e) => console.log('   C0 ERR: ', e));
    console.log()
}, 100);

setTimeout(() => {
    let client = new WseClient('ws://localhost:3334');
    client.connect('C1');
    client.on('open', (dat) => console.log('    C1 - hi', dat));
    client.on('message', (c, dat) => console.log('   C1 GOT: ', c, dat));
    client.on('close', (code, reason) => console.log('   C1 CLOSED: ', code, reason));
    client.on('error', (e) => console.log('   C1 ERR: ', e));
    console.log()
}, 1000);

setTimeout(() => {
    let client = new WseClient('ws://localhost:3334');
    client.connect('C1');
    client.on('open', (dat) => console.log('    C1 - hi', dat));
    client.on('message', (c, dat) => console.log('   C1 GOT: ', c, dat));
    client.on('close', (code, reason) => console.log('   C1 CLOSED: ', code, reason));
    client.on('error', (e) => console.log('   C1 ERR: ', e));
    console.log()
}, 1500);

setTimeout(() => {

    let bad_protocol = new WseCustomProtocol();
    bad_protocol.name = 'bad_one!';

    let client = new WseClient('ws://localhost:3334', null, bad_protocol);
    client.connect('C2');
    client.on('open', (dat) => console.log('    C2 - hi', dat));
    client.on('message', (c, dat) => console.log('   C2 GOT: ', c, dat));
    client.on('close', (code, reason) => console.log('   C2 CLOSED: ', code, reason));
    client.on('error', (e) => console.log('   C2 ERR: ', e));
    console.log()

}, 2000);

setTimeout(() => {
    let client = new WseClient('ws://localhost:3334');
    client.connect('C3');
    client.on('open', (dat) => console.log('    C3 - hi', dat));
    setTimeout(() => {
        client.send('something-333', {random: Math.random()});
        client.close(1000, 'by-custom-reason');
        console.log()

    }, 1000);
    console.log()

}, 3000);


setTimeout(() => {
    srv.drop_client('ID-0', 'because!');
    setTimeout(() => {
        process.exit(0);

    }, 1000);
}, 5000);
