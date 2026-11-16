import { workerData } from 'node:worker_threads'

import { WseGate } from '../../src/gate.js'

const gate = new WseGate({ port: workerData.port })

gate.register('echo', (client, payload) => ({ cid: client.cid, payload }))
gate.channel.on('ping', (client, payload) => client.send('pong', payload))
gate.when.joined(client => gate.broadcast('hello', client.cid))
