"use strict";

const WebSocket = require('ws');
const EventEmitter = require('eventemitter3');
const WseDefaultProtocol = require('./protocol');

const CLIENT_NOOB = 0;
const CLIENT_VALIDATING = 1;
const CLIENT_VALID = 2;

const MSG_OTHER_CLIENT_CONECTED = 'wse-other-client-connected';
const MSG_UNAUTHORIZED = 'wse-unauthorized';
const MSG_PROTOCOL_ERR = 'wse-invalid-protocol';

let WSM_COUNTER = 0;

class WSMServer extends EventEmitter {
    constructor(ws_params = {}, on_auth, wse_protocol = null) {

        super();

        this.clients = {};

        //default properties
        this.name = 'WSM-' + ++WSM_COUNTER;
        this.cpu = 1;
        this.logging = false;

        this.ws_params = ws_params;

        this.protocol = wse_protocol || new WseDefaultProtocol();
        this.on_auth = on_auth || (() => {
            throw new Error('params.on_auth function not specified!')
        });

        this.log('configured')
    }

    drop_client(id) {
        if (this.clients[id]) this.clients[id].drop();
    }

    log() {
        if (!this.logging) return;
        console.log(this.name + ':', ...arguments);
    };

    init() {

        this.wss = new WebSocket.Server(this.ws_params);

        let self = this;

        this.wss.on('connection', function (conn) {

            if (conn.protocol !== self.protocol.name) {
                console.log(conn);
                return conn.close(1000, MSG_PROTOCOL_ERR);
            }

            conn.id = null;
            conn.valid_stat = CLIENT_NOOB;

            conn.on('message', function (message) {
                let msg = self.protocol.unpack(message);

                if (!msg) return conn.close(1000, MSG_PROTOCOL_ERR);
                if (conn.valid_stat === CLIENT_VALIDATING) return;
                if (conn.valid_stat === CLIENT_VALID) {
                    self.emit('m:' + msg.c, self.clients[conn.id], msg.dat);
                    self.emit('message', self.clients[conn.id], msg.c, msg.dat);
                    return;
                }
                if (conn.valid_stat === CLIENT_NOOB) {
                    conn.valid_stat = CLIENT_VALIDATING;
                    self.on_auth(msg.c, msg.dat, function (id) {
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
                        self.log(conn.id, 'leave');
                        delete self.clients[conn.id];
                    } else {
                        self.log(conn.id, 'closed, connections left:', conn_left)
                    }
                }
            });
            conn.onerror = (e) => {
                self.log(e);
                self.emit('error', conn, e.code);
            };

        });

        this.log(`init(); cpu:${this.cpu};`);
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

        this.wsm.log(this.id, 'connection added. opened:', this.conns.length);

        return this.conns.indexOf(conn);
    }

    send(c, dat, index = null) {
        if (index) return this.conns[index].send(this.wsm.protocol.pack(c, dat));
        for (let i = 0; i < this.conns.length; i++) {
            this.conns[i].send(this.wsm.protocol.pack(c, dat));
        }

    }

    drop(reason = 'wse-unknown-reason') {
        this.wsm.log(this.id, 'drop all connetions. reason:', reason);
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
                this.wsm.log(this.id, 'closed connection. yet opened:', this.conns.length);
            }
        }
        return this.conns.length;
    }

}

module.exports = WSMServer;
