process.env.MODFILE = 'mods.json'
process.env.DRIVER_MODULE = '@screeps/driver'

const Promise = require('bluebird')
const _ = require('lodash')
const driver = require('@screeps/driver')
const common = require('@screeps/common')
const path = require('path')
const cp = require('child_process')
const fs = Promise.promisifyAll(require('fs'))

class ScreepsServer {
  constructor () {
    this.driver = driver
    this.common = common
    this.config = common.configManager.config
    this.constants = this.config.common.constants
    this.lastAccessibleRoomsUpdate = -20
    this.processes = {}
  }
  connect () {
    return driver.connect('main')
      .then(() => Promise.all([
        driver.queue.create('users', 'write'),
        driver.queue.create('rooms', 'write')
      ]))
      .then((data) => {
        this.usersQueue = data[0]
        this.roomsQueue = data[1]
      })
      .catch((error) => console.log('Error connecting to driver:', error))
  }
  tick (opts = {}) {
    const stages = opts.stages || [
      'start',
      'getUsers',
      'addUsersToQueue',
      'waitForUsers',
      'getRooms',
      'addRoomsToQueue',
      'waitForRooms',
      'commit1',
      'global',
      'commit2',
      'incrementGameTime',
      'notifyRoomsDone',
      'custom',
      'finish'
    ]
    let chain = Promise.resolve()
    stages.forEach(stage => {
      this.stage = stage
      chain = chain.then((arg) => {
        driver.config.emit('mainLoopStage', stage, arg)
        return this[`${stage}Stage`](arg)
      })
    })
    return chain
      .catch((err) => Promise.resolve(this.finishStage()).then(() => { throw err }))
  }
  startStage () {
    this.resetTimeout = setTimeout(() => {
      console.error('Main loop reset! Stage:', this.stage)
      driver.queue.resetAll()
    }, driver.config.mainLoopResetInterval)
    return driver.notifyTickStarted()
  }
  getUsersStage () {
    return driver.getAllUsers()
  }
  addUsersToQueueStage (users) {
    return this.usersQueue.addMulti(_.map(users, (user) => user._id.toString()))
  }
  waitForUsersStage () {
    return this.usersQueue.whenAllDone()
  }
  getRoomsStage () {
    return driver.getAllRooms()
  }
  addRoomsToQueueStage (rooms) {
    return this.roomsQueue.addMulti(_.map(rooms, (room) => room._id.toString()))
  }
  waitForRoomsStage () {
    return this.roomsQueue.whenAllDone()
  }
  commit1Stage () {
    return driver.commitDbBulk()
  }
  globalStage () {
    return require('@screeps/engine/src/processor/global')()
  }
  commit2Stage () {
    return driver.commitDbBulk()
  }
  incrementGameTimeStage () {
    return driver.incrementGameTime()
      .then(gameTime => {
        if (+gameTime > this.lastAccessibleRoomsUpdate + 20) {
          this.lastAccessibleRoomsUpdate = +gameTime
          driver.updateAccessibleRoomsList()
        }
        return gameTime
      })
  }
  notifyRoomsDoneStage (gameTime) {
    return driver.notifyRoomsDone(gameTime)
  }
  customStage () {
    return driver.config.mainLoopCustomStage()
  }
  finishStage () {
    clearTimeout(this.resetTimeout)
  }
  startProcess (name, execPath, env) {
    return fs.openAsync(path.resolve(this.opts.logdir, `${name}.log`), 'a')
      .then(fd => {
        this.processes[name] = cp.fork(path.resolve(execPath), {
          stdio: [0, fd, fd, 'ipc'],
          env
        })
        console.log(`[${name}] process ${this.processes[name].pid} started`)
        this.processes[name].on('exit', (code, signal) => {
          fs.closeAsync(fd).then(() => {
            if (code) {
              console.log(`[${name}] process ${this.processes[name].pid} exited with code ${code}, restarting...`)
              this.startProcess(name, execPath, env)
            } else {
              console.log(`[${name}] process ${this.processes[name].pid} exited by signal ${signal}`)
            }
          })
        })
        return this.processes[name]
      })
  }
  start (opts = {}) {
    opts = this.opts = Object.assign({
      steam_api_key: 'abc123',
      port: 21025,
      host: '0.0.0.0',
      password: '',
      cli_port: 21026,
      cli_host: 'localhost',
      runners_cnt: 1,
      processors_cnt: 1,
      logdir: 'logs',
      modfile: 'mods.json',
      assetdir: 'assets',
      db: 'db.json'
    }, opts)
    return Promise.resolve()
      .then(() => this.connect())
      .then(() => fs.mkdirAsync(opts.logdir).catch(() => {}))
      .then(() => {
        console.log(`Server version ${require('screeps').version}`)
        console.log('Starting all processes.')
        return ['runner', 'processor']
      })
      .map(type => this.startProcess(`engine_${type}`, path.resolve(path.dirname(require.resolve('@screeps/engine')), `${type}.js`), {
        MODFILE: opts.modfile,
        DRIVER_MODULE: '@screeps/driver'
      }))
      .all()
  }
  stop () {
    for (let k in this.processes) {
      let p = this.processes[k]
      p.kill()
    }
  }
}

module.exports = ScreepsServer
