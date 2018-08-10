"use strict";

const WebSocket = require('ws');
const EventEmitter = require('eventemitter3');
const DefaultProtocol = require('./protocol');
const extend = require('util')._extend;

const CLIENT_NOOB = 0;
const CLIENT_VALIDATING = 1;
const CLIENT_VALID = 2;

const MSG_OTHER_CLIENT_CONECTED = 'other-client-connected';
const MSG_UNAUTHORIZED = 'unauthorized';

let WSM_COUNTER = 0;

class WSMServer extends EventEmitter {
    constructor(params = {}) {

        super();

        //default properties
        this.name = 'WSM-' + ++WSM_COUNTER;
        this.port = 8081;
        this.cpu = 1;
        this.clients = {};
        this.logging = true;
        this.protocol = new DefaultProtocol();
        this.auth = () => {
            throw new Error('auth function not specified!')
        };

        extend(this, params);
    }

    drop_client(id) {
        if (this.clients[id]) this.clients[id].drop();
    }

    log() {
        if (!this.logging) return;
        console.log(this.name + ':', ...arguments);
    };

    init() {

        this.wss = new WebSocket.Server({port: this.port});

        let self = this;

        this.wss.on('connection', function (conn) {

            conn.id = null;
            conn.valid_stat = CLIENT_NOOB;

            conn.on('message', function (message) {
                let msg = self.protocol.unpack(message);

                if (!msg) return conn.close(1000, 'invalid-protocol');
                if (conn.valid_stat === CLIENT_VALIDATING) return;
                if (conn.valid_stat === CLIENT_VALID) {
                    self.emit('m:' + msg.c, self.clients[conn.id], msg.dat);
                    self.emit('message', self.clients[conn.id], msg.c, msg.dat);
                    return;
                }
                if (conn.valid_stat === CLIENT_NOOB) {
                    conn.valid_stat = CLIENT_VALIDATING;
                    self.auth(msg.c, msg.dat, function (id) {
                        if (id) {
                            conn.id = id;
                            conn.valid_stat = CLIENT_VALID;

                            if (!self.clients[id]) self.clients[id] = new WSMClientConnection(self, id);
                            let index = self.clients[id].add_conn(conn);
                            self.clients[id].send('welcome', {
                                opened: self.clients[id].conns.length,
                                i: self.clients[id].conns.indexOf(conn),
                            }, index);
                            self.emit('connected', self.clients[id], index);
                        } else {
                            conn.close(1000, MSG_UNAUTHORIZED);
                        }
                    });
                }
            });

            conn.on('close', () => {
                if (conn.id !== null && conn.valid_stat === CLIENT_VALID) {
                    let conn_left = self.clients[conn.id].cleanup();
                    if (!conn_left) {
                        self.emit('leave', self.clients[conn.id]);
                        delete self.clients[conn.id];
                    }
                }
            });
            conn.onerror = (e) => {
                self.emit('error', conn, e.code);
            };

        });

        this.log(`init(); port:${this.port}; cpu:${this.cpu};`);
        return self;
    }
}

class WSMClientConnection {
    /**
     * @param {WSMServer} parent_wsm - wsm instance
     * @param {id} id - connection
     */
    constructor(parent_wsm, id) {
        this.id = id;
        this.conns = [];
        this.wsm = parent_wsm;
        this.wsm.log(this.id, 'joined');
    }

    add_conn(conn) {
        this.conns.push(conn);

        if (this.conns.length > this.wsm.cpu) {
            let rem = this.conns.length - this.wsm.cpu;
            for (let i = 0; i < rem; i++)
                this.conns[i].close(1000, MSG_OTHER_CLIENT_CONECTED);
        }

        return this.conns.indexOf(conn);
    }

    send(c, dat, index = null) {
        if (index) return this.conns[index].send(this.wsm.protocol.pack(c, dat));
        for (let i = 0; i < this.conns.length; i++) {
            this.conns[i].send(this.wsm.protocol.pack(c, dat));
        }

    }

    drop(reason = 'by-server') {
        this.wsm.log(this.id, 'drop all connetions. reason:', reason)
        for (let i = 0; i < this.conns.length; i++) {
            this.conns[i].close(1000, reason)
        }
    }

    cleanup() {
        let i = this.conns.length;
        while (i--) {
            if (this.conns[i].readyState === WebSocket.CLOSED) {
                this.wsm.emit('close', this.conns[i].id, this.conns.length);
                this.conns.splice(i, 1);
                this.wsm.log(this.id, 'removed closed connection. yet opened:', this.conns.length);
            }
        }
        return this.conns.length;
    }

}

module.exports = WSMServer;
