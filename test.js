// server example

const WseServer = require('./src/server');

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






//clients example

const WseClient = require('./src/client');

setTimeout(() => {
    let client1 = new WseClient('ws://localhost:3334', {/*original ws client setting */}, null);
    client1.on('open', () => client1.send('hi', 'ID-1'));
    client1.on('message', (c, dat) => console.log('C1 GOT: ', c, dat));
    client1.on('close', (code, reason) => console.log('C1 CLOSED: ', code, reason));
    client1.on('error', (e) => console.log('C1 ERR: ', e));
}, 1000);

setTimeout(() => {
    let client2 = new WseClient('ws://localhost:3334', {/*original ws client setting */}, null);
    client2.on('open', () => client2.send('hi', 'ID-1'));
    client2.on('message', (c, dat) => console.log('C2 GOT: ', c, dat));
    client2.on('close', (code, reason) => console.log('C2 CLOSED: ', code, reason));
    client2.on('error', (e) => console.log('C2 ERR: ', e));
}, 2000);

setTimeout(() => {
    let client3 = new WseClient('ws://localhost:3334', {/*original ws client setting */}, null);
    client3.on('open', () => client3.send('hi', 'ID-1'));
    client3.on('message', (c, dat) => console.log('C3 GOT: ', c, dat));
    client3.on('close', (code, reason) => console.log('C3 CLOSED: ', code, reason));
    client3.on('error', (e) => console.log('C3 ERR: ', e));

    setTimeout(() => {
        client3.send('something-2', {random: Math.random()});
        client3.close(1000, 'by-custom-reason');

    }, 3000);
}, 3000);


setTimeout(() => {
    srv.drop_client('ID-1');
    process.exit(0);
}, 9000);
