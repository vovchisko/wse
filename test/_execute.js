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
  test.note = note
  test.exit_code = 0
  test.result = 'success'
  complete()
}

const fail = (note) => {
  test.note = note
  test.exit_code = 1
  test.result = 'fail!'
  complete()
}

const complete = () => {
  if (process.send)
    process.send({ msg: 'finish', ...test })

  process.exit(test.exit_code)
}

export async function execute (name, f, timeout = 1000) {
  test.name = name
  test.timeout = timeout

  setTimeout(() => {
    test.exit_code = 1
    test.finished = false
    test.result = 'timeout'

    complete()
  }, test.timeout)


  if (process.send)
    process.send({ msg: 'start', name })

  const start = Date.now()
  await f(success, fail)
  const end = Date.now()

  test.delta = end - start
  test.finished = true
}


