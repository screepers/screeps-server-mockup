/* eslint prefer-arrow-callback: "off", global-require: "off", import/no-dynamic-require: "off" */

const _ = require('lodash')
const assert = require('assert')
const fs = require('fs-extra-promise')
const path = require('path')
const { ScreepsServer } = require('../')

suite('Basics', function () {
  this.timeout(30 * 1000)
  this.slow(5 * 1000)

  /*
    Dirty hack to prevent driver from flooding error messages.
  */
  let stderr = process.stderr.write;
  suiteSetup(() => process.stderr.write = _.noop)
  setup(() => process.stderr.write = stderr)
  teardown(() => process.stderr.write = _.noop)
  suiteTeardown(() => process.stderr.write = stderr)

  test('Starting server and running a few ticks without error.', async function () {
    const server = new ScreepsServer()
    await server.start()
    for (let i = 0; i < 10; i++) {
      await server.tick()
    }
    server.stop()
  })

  test('Running user code.', async function () {
    // Server initialization
    const server = new ScreepsServer()
    await server.world.reset()
    // Code declaration
    const modules = {
      main: `module.exports.loop = function() {
        console.log('tick', Game.time);
      }`
    }
    // User / bot initialization
    let logs = [];
    const user = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules })
    user.on('console', (log) => {
      logs = logs.concat(log)
    })
    // Run a few ticks
    await server.start()
    for (let i = 0; i < 5; i++) {
      await server.tick()
    }
    server.stop()
    // Assert if code was correctly executed
    assert.deepEqual(logs, ['tick 1', 'tick 2', 'tick 3', 'tick 4', 'tick 5'])
  })

  test('Setting options in server constructor.', async function () {
    // Setup options and server
    const opts = {
      path:   'another_dir',
      logdir: 'another_logdir',
      port:   9999,
    }
    const server = new ScreepsServer(opts)
    // Assert if options are correctly registered
    assert.equal(server.opts.path, opts.path)
    assert.equal(server.opts.logdir, opts.logdir)
    assert.equal(server.opts.port, opts.port)
    // Start, then stop server
    await server.start()
    await server.tick()
    server.stop()
    // Assert if files where actually created in the good directory
    await fs.accessAsync(path.resolve(opts.path))
    await fs.accessAsync(path.resolve(opts.logdir))
  })

  teardown(async function () {
    await fs.removeAsync(path.resolve('server')).catch(console.error)
    await fs.removeAsync(path.resolve('another_dir')).catch(console.error)
    await fs.removeAsync(path.resolve('another_logdir')).catch(console.error)
  })
})
