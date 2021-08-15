import { runner } from 'test-a-bit'

(async () => {
  await runner([
    { script: './tests/client2server.js' },
    { script: './tests/client2server-ignored.js' },
    { script: './tests/client-concurrency.js' },
    { script: './tests/connect-event.js' },
    { script: './tests/count-10.js' },
    { script: './tests/count-1001.js' },
    { script: './tests/cra-challenge.js' },
    { script: './tests/disconnect.js' },
    { script: './tests/invalid-auth.js' },
    { script: './tests/invalid-hi-drop.js' },
    { script: './tests/invalid-hi-err.js' },
    { script: './tests/meta.js' },
    { script: './tests/ready-event.js' },
    { script: './tests/server2client.js' },
    { script: './tests/server2client-ignored.js' },
    { script: './tests/swarm-connect.js' },
    { script: './tests/swarm-disconnect.js' },
    { script: './tests/x-cpu-cra-challenge.js' },
    { script: './tests/x-cpu-limit.js' },
    { script: './tests/x-cpu-messages.js' },
    { script: './tests/broadcast.js' },
    { script: './tests/external-server.js' },
  ])
})()



