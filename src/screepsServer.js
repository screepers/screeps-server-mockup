const _ = require('lodash')
const common = require('@screeps/common')
const cp = require('child_process')
const driver = require('@screeps/driver')
const { EventEmitter } = require('events')
const fs = require('fs-extra-promise')
const path = require('path')
const World = require('./world')

const MOD_FILE = 'mods.json';
const DB_FILE = 'db.json';

class ScreepsServer extends EventEmitter {
  constructor (opts) {
    super()
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
    this.opts = Object.assign({
      path:   path.resolve('server'),
      logdir: path.resolve('server', 'logs'),
      port:   21025,
    }, opts)
    // Define environment parameters
    process.env.MODFILE = this.opts.modfile
    process.env.DRIVER_MODULE = '@screeps/driver'
    process.env.STORAGE_PORT = this.opts.port
    return this
  }
  async connect () {
    // Ensure directories exist
    await fs.mkdirAsync(this.opts.path).catch(() => {})
    await fs.mkdirAsync(this.opts.logdir).catch(() => {})
    // Copy assets into server directory
    await Promise.all([
      fs.copyFileAsync(path.join(__dirname, DB_FILE), path.join(this.opts.path, DB_FILE)),
      fs.copyFileAsync(path.join(__dirname, MOD_FILE), path.join(this.opts.path, MOD_FILE)),
    ])
    // Start storage process
    this.emit('info', 'Starting storage process.')
    const process = await this.startProcess(`storage`, path.resolve(path.dirname(require.resolve('@screeps/storage')), '../bin/start.js'), {
      MODFILE: path.resolve(this.opts.path, DB_FILE),
      STORAGE_PORT: this.opts.port,
      DB_PATH: path.resolve(this.opts.path, DB_FILE),
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
      const oldLog = console.log;
      console.log = function() {} // disable console
      await driver.connect('main')
      console.log = oldLog // enable console
      this.usersQueue = await driver.queue.create('users', 'write')
      this.roomsQueue = await driver.queue.create('rooms', 'write')
      this.connected = true
    } catch (err) {
      throw new Error(`Error connecting to driver: ${err.stack}`)
    }
    return this
  }
  async tick (opts = {}) {
    const stages = opts.stages || [ 'start', 'getUsers', 'addUsersToQueue', 'waitForUsers',
      'getRooms', 'addRoomsToQueue', 'waitForRooms', 'commit1', 'global', 'commit2',
      'incrementGameTime', 'notifyRoomsDone', 'custom', 'finish' ]
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
    return this
  }
  startStage () {
    this.resetTimeout = setTimeout(() => {
      this.emit('error', `Main loop reset at stage ${this.stag}`)
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
    this.emit('info', `[${name}] process ${this.processes[name].pid} started`)
    this.processes[name].on('exit', async (code, signal) => {
      await fs.closeAsync(fd)
      if (code && code !== 0) {
        this.emit('error', `[${name}] process ${this.processes[name].pid} exited with code ${code}, restarting...`)
        this.startProcess(name, execPath, env)
      } else if (code === 0) {
        this.emit('info', `[${name}] process ${this.processes[name].pid} stopped`)
      } else {
        this.emit('info', `[${name}] process ${this.processes[name].pid} exited by signal ${signal}`)
      }
    })
    return this.processes[name]
  }
  async start () {
    this.emit('info', `Server version ${require('screeps').version}`)
    if (!this.connected) {
      await this.connect()
    }
    this.emit('info', 'Starting engine processes.')
    this.startProcess('engine_runner', path.resolve(path.dirname(require.resolve('@screeps/engine')), 'runner.js'), {
      MODFILE: path.resolve(this.opts.path, DB_FILE),
      DRIVER_MODULE: '@screeps/driver',
      STORAGE_PORT: this.opts.port,
    })
    this.startProcess('engine_processor', path.resolve(path.dirname(require.resolve('@screeps/engine')), 'processor.js'), {
      MODFILE: path.resolve(this.opts.path, DB_FILE),
      DRIVER_MODULE: '@screeps/driver',
      STORAGE_PORT: this.opts.port,
    })
    return this
  }
  stop () {
    _.each(this.processes, process => process.kill())
    return this
  }
}

module.exports = ScreepsServer
