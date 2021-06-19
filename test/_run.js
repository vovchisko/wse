import child_process from 'child_process'

function low_grade_uid () {
  return [
    Math.random,
    Date.now,
    Math.random,
  ].map(function (fn) {
    return fn().toString(16 || (16 + (Math.random() * 20))).substr(-6)
  }).join('-')
}

export const tests = new Map()

const pal_normal = '\x1b[0m'
const pal_yellow = '\x1b[33m'
const pal_cyan = '\x1b[36m'

export function test (script) {
  return new Promise(function (resolve, reject) {
    const c = child_process.fork(script, { silent: false })

    let result = ''

    c.uid = low_grade_uid()

    c.on('message', ({ msg, ...dat }) => {
      if (msg === 'start') {
        tests.set(c.uid, dat)
      }
      if (msg === 'finish') {
        const color = dat.result === 'success' ? pal_cyan : pal_yellow
        Object.assign(tests.get(c.uid), { dat })
        result += (`[${ color }${ dat.result }${ pal_normal }] `).padEnd(15 + color.length, ' ')
        result += `${ dat.name } >> ${ dat.note } / `
        result += `Δ=${ (dat.delta).toFixed(2) }${ dat.delta_precision_sym } / `
      }
    })

    c.on('error', (err) => {
      console.error(err)
      reject()
    })

    c.on('exit', (code) => {
      const color = code === 0 ? pal_cyan : pal_yellow
      result += `[ ${ color }${ code === 0 ? 'ok' : 'fail' }${ pal_normal } ]`
      console.log(result)
      resolve()
    })
  })
}

(async () => {
  await test('./connect.js')
  await test('./client-concurrency.js')
  await test('./disconnect.js')
  await test('./invalid-auth.js')
  await test('./client2server.js')
  await test('./server2client.js')
  await test('./invalid-hi-err.js')
  await test('./invalid-hi-drop.js')
  await test('./meta.js')
  await test('./swarm-connect.js')
  await test('./swarm-disconnect.js')
  await test('./count-10.js')
  await test('./count-1001.js')
})()
