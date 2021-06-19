let start_time = 0
let time_sym = {
  milli: 'ms',
  micro: 'μs',
  nano: 'ns',
}
const now = (unit) => {
  const hrTime = process.hrtime()
  switch (unit) {
    case 'milli':
      return hrTime[0] * 1000 + hrTime[1] / 1000000
    case 'micro':
      return hrTime[0] * 1000000 + hrTime[1] / 1000
    case 'nano':
    default:
      return hrTime[0] * 1000000000 + hrTime[1]
  }

}
const test = {
  name: 'Unnamed Test',
  exit_code: 1,
  note: '',
  delta: 0,
  timeout: 0,
  finished: false,
  result: 'no result',
}

const success = (note) => {
  test.exit_code = 0
  test.result = 'success'
  complete(note)
}

const fail = (note) => {
  test.exit_code = 1
  test.result = 'fail!'
  complete(note)
}

const complete = (note) => {
  test.note = note
  test.delta = now(test.delta_precision) - start_time

  if (process.send) {
    process.send({ msg: 'finish', ...test })
  } else {
    console.log(test)
  }

  process.exit(test.exit_code)
}

export async function execute (name, f, timeout = 1000, delta_precision = 'milli') {
  test.name = name
  test.delta_precision = delta_precision
  test.delta_precision_sym = time_sym[delta_precision]
  test.timeout = timeout

  setTimeout(() => {
    test.exit_code = 1
    test.finished = false
    test.result = 'timeout'

    complete()
  }, test.timeout)


  if (process.send)
    process.send({ msg: 'start', name })

  start_time = now(test.delta_precision)
  await f(success, fail)

  test.finished = true
}


