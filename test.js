import { runner } from 'test-a-bit'

(async () => {
  await runner([
    { script: './tests/connect.js' },
    { script: './tests/client-concurrency.js' },
    { script: './tests/disconnect.js' },
    { script: './tests/invalid-auth.js' },
    { script: './tests/client2server.js' },
    { script: './tests/server2client.js' },
    { script: './tests/invalid-hi-err.js' },
    { script: './tests/invalid-hi-drop.js' },
    { script: './tests/meta.js' },
    { script: './tests/swarm-connect.js' },
    { script: './tests/swarm-disconnect.js' },
    { script: './tests/count-10.js' },
    { script: './tests/count-1001.js' },
    { script: './tests/x-client-concurrency.js' },
  ])
})()
