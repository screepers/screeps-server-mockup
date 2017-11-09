const Promise = require('bluebird')
const _ = require('lodash')
const common = require('@screeps/common')
const cp = require('child_process')
const driver = require('@screeps/driver')
const fs = Promise.promisifyAll(require('fs'))
const path = require('path')
const World = require('./world')

class ScreepsServer {
  constructor (opts) {
    this.driver = driver
    this.common = common
    this.config = common.configManager.config
    this.constants = this.config.common.constants
    this.connected = false
    this.lastAccessibleRoomsUpdate = -20
    this.processes = {}
    this.world = new World(this)
    this.setOpts(opts)
  }
  setOpts(opts = {}) {
    // Assign options
    opts = this.opts = Object.assign({
      port: 21025,
      logdir:   path.join(__dirname, '..', 'server', 'logs'),
      modfile:  path.join(__dirname, '..', 'server', 'mods.json'),
      assetdir: path.join(__dirname, '..', 'server', 'assets'),
      db:       path.join(__dirname, '..', 'server', 'db.json'),
    }, opts)
    // Define environment parameters
    process.env.MODFILE = opts.modfile
    process.env.DRIVER_MODULE = '@screeps/driver'
    process.env.STORAGE_PORT = opts.port;
    return this
  }
  async connect () {
    // Ensure logdir exists
    await fs.mkdirAsync(this.opts.logdir).catch(() => {})
    // Start storage process
    console.log('Starting storage process.')
    const process = await this.startProcess(`storage`, path.resolve(path.dirname(require.resolve('@screeps/storage')), '../bin/start.js'), {
      MODFILE: this.opts.modfile,
      STORAGE_PORT: this.opts.port,
      DB_PATH: this.opts.db
    })
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject('Could not launch the storage process (timeout).'), 5000);
      process.on('message', message => {
        if(message !== 'storageLaunched') return
        clearTimeout(timeout)
        resolve()
      })
    })
	  // Connect to storage process
	  try {
      await driver.connect('main')
      this.usersQueue = await driver.queue.create('users', 'write')
      this.roomsQueue = await driver.queue.create('rooms', 'write')
      this.connected = true
    } catch (err) {
      throw new Error(`Error connecting to driver: ${err.stack}`)
    }
  }
  async tick (opts = {}) {
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
    try {
      let ret = undefined
      for(let stage of stages) {
        this.stage = stage
        driver.config.emit('mainLoopStage', stage, ret)
        ret = await this[`${stage}Stage`](ret)
      }
    } finally {
      await this.finishStage()
    }
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
  async incrementGameTimeStage () {
    const gameTime = await driver.incrementGameTime()
    if (+gameTime > this.lastAccessibleRoomsUpdate + 20) {
      this.lastAccessibleRoomsUpdate = +gameTime
      driver.updateAccessibleRoomsList()
    }
    return gameTime
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
  async startProcess (name, execPath, env) {
    const fd = await fs.openAsync(path.resolve(this.opts.logdir, `${name}.log`), 'a')
    this.processes[name] = cp.fork(path.resolve(execPath), { stdio: [0, fd, fd, 'ipc'], env })
    console.log(`[${name}] process ${this.processes[name].pid} started`)
    this.processes[name].on('exit', async (code, signal) => {
      await fs.closeAsync(fd)
      if (code && code !== 0) {
        console.log(`[${name}] process ${this.processes[name].pid} exited with code ${code}, restarting...`)
        this.startProcess(name, execPath, env)
      } else if (code === 0) {
        console.log(`[${name}] process ${this.processes[name].pid} stopped`)
      } else {
        console.log(`[${name}] process ${this.processes[name].pid} exited by signal ${signal}`)
      }
    })
    return this.processes[name]
  }
  async start () {
    console.log(`Server version ${require('screeps').version}`)
    if (!this.connected) {
      await this.connect()
    }
    console.log('Starting engine processes.')
    this.startProcess('engine_runner', path.resolve(path.dirname(require.resolve('@screeps/engine')), 'runner.js'), {
      MODFILE: this.opts.modfile,
      DRIVER_MODULE: '@screeps/driver',
      STORAGE_PORT: this.opts.port
    })
    this.startProcess('engine_processor', path.resolve(path.dirname(require.resolve('@screeps/engine')), 'processor.js'), {
      MODFILE: this.opts.modfile,
      DRIVER_MODULE: '@screeps/driver',
      STORAGE_PORT: this.opts.port
    })
    return this
  }
  stop () {
    _.each(this.processes, process => process.kill())
  }
}

module.exports = ScreepsServer
