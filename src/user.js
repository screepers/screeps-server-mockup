const _ = require('lodash')
const { EventEmitter } = require('events')

class User extends EventEmitter {
  /**
    Constructor
  */
  constructor(server, data) {
    super()
    this._id = data._id
    this._username = data.username
    this._server = server
  }

  /**
    Getters
  */
  get id () {
    return this._id
  }
  get username () {
    return this._username
  }
  get cpu () {
    return this.getData('cpu')
  }
  get cpuAvailable () {
    return this.getData('cpuAvailable')
  }
  get gcl () {
    return this.getData('gcl')
  }
  get rooms () {
    return this.getData('rooms')
  }
  get lastUsedCpu () {
    return this.getData('lastUsedCpu')
  }
  get memory () {
    const { env } = this._server.common.storage
    return env.get(env.keys.MEMORY + this.id)
  }

  /**
    Set a new console command to run next tick
  */
  async console (cmd) {
    const { db } = this._server.common.storage
    return db['users.console'].insert({ user: this._id, expression: cmd, hidden: false });
  }

  /**
    Return the current value of the requested user data
  */
  async getData (name) {
    const { db } = this._server.common.storage
    const data = await db.users.find({ _id: this._id })
    return _.get(_.first(data), name)
  }

  /**
    Initialise console events
  */
  async init () {
    const { pubsub } = this._server.common.storage
    await pubsub.subscribe(`user:${this._id}/console`, (event) => {
      const { messages: { log = [] } = {} } = JSON.parse(event)
      this.emit('console', log, this._id, this.username)
    })
    return this
  }
}

module.exports = User
