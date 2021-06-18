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
   // let stdout = ''
   // let stderr = ''

    c.uid = low_grade_uid()

   // c.stdout.on('data', chunk => stdout += chunk)
   // c.stderr.on('error', chunk => stderr += chunk)

    c.on('message', ({ msg, ...dat }) => {
      if (msg === 'start') {
        tests.set(c.uid, dat)
      }
      if (msg === 'finish') {
        const color = dat.result === 'success' ? pal_cyan : pal_yellow
        Object.assign(tests.get(c.uid), { dat })
        result += (`[${ color }${ dat.result }${ pal_normal }] `).padEnd(16 + color.length, ' ')
        result += `${ dat.name }: `
        result += `delta: ${ (dat.delta / 1000).toFixed(3) }s, `
        result += `${ dat.note }`
      }
    })
    c.on('error', (err) => {
      console.error(err)
      reject()
    })
    c.on('exit', (code) => {
      result += ` / exit(${ code })`
      console.log(result)
      if (code !== 0) {
      //  console.log(stdout)
      //  console.error(stderr)
      }
      resolve()
    })
  })
}

(async () => {
  await test('./connect.js')
  await test('./client2server.js')
})()
