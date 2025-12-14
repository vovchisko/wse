import { runner } from 'test-a-bit'

runner([
  { script: './tests/broadcast.js' },
  { script: './tests/client2server.js' },
  { script: './tests/client2server-ignored.js' },
  { script: './tests/client-concurrency.js' },
  { script: './tests/connect-event.js' },
  { script: './tests/count-10.js' },
  { script: './tests/count-1001.js' },
  { script: './tests/cpu-cra-challenge.js' },
  { script: './tests/cpu-limit.js' },
  { script: './tests/cpu-messages.js' },
  { script: './tests/cra-challenge.js' },
  { script: './tests/cra-fail.js' },
  { script: './tests/cra-fail-halfway.js' },
  { script: './tests/disconnect.js' },
  { script: './tests/external-server.js' },
  { script: './tests/invalid-auth.js' },
  { script: './tests/invalid-hi-drop.js' },
  { script: './tests/invalid-hi-err.js' },
  { script: './tests/meta.js' },
  { script: './tests/multiple-servers.js' },
  { script: './tests/personal-and-all.js' },
  { script: './tests/ready-event.js' },
  { script: './tests/rp-call.js' },
  { script: './tests/rp-disconnect.js' },
  { script: './tests/rp-disconnect-reason.js' },
  { script: './tests/rp-throw-custom.js' },
  { script: './tests/rp-throw-not-registered.js' },
  { script: './tests/rp-throw-vanilla.js' },
  { script: './tests/rp-throw-wse.js' },
  { script: './tests/rp-timeout.js' },
  { script: './tests/server2client.js' },
  { script: './tests/server2client-ignored.js' },
  { script: './tests/swarm-connect.js' },
  { script: './tests/swarm-disconnect.js' },
  { script: './tests/bidirectional-rpc.js' },
  { script: './tests/server-call-client.js' },
  { script: './tests/server-call-not-registered.js' },
  { script: './tests/server-call-client-throw-vanilla.js' },
  { script: './tests/server-call-client-throw-wse.js' },
  { script: './tests/server-call-client-throw-custom.js' },
  { script: './tests/server-call-client-timeout.js' },
  { script: './tests/custom-protocol.js' },
  { script: './tests/jump.js' },
])
  .then(res => {
    const failed = res
      .values()
      .toArray()
      .filter(t => t.result !== 'success')

    if (failed.length > 0) {
      const formated_fails = failed.map(t => [`- "${t.name}"`, ` ∟ ${t.note}`, '\n'].join(',\n')).join(',\n')
      console.log(`Failed ${failed.length} tests:\n${formated_fails}`)
      process.exit(1)
    }

    console.log(`Completed ${res.size} tests. All went good.`)
    process.exit(0)
  })
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
