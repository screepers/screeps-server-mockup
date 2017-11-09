const _ = require('lodash')
const User = require('./user')
const zlib = require('zlib')

function getBoxTerrain () {
  let res = ''
  for (let y = 0; y < 50; y++) {
    for (let x = 0; x < 50; x++) {
      let type = 0
      if (x === 0 || y === 0 || x === 49 || y === 49) {
        type = 1
      }
      if ((x === 10 || x === 40) && (y === 10 || y === 40)) {
        type = 1
      }
      res += type
    }
  }
  return res
}

function generateMineral (room, x, y) {
  const types = ['H', 'H', 'H', 'H', 'H', 'H', 'O', 'O', 'O', 'O', 'O', 'O', 'Z', 'Z', 'Z', 'K', 'K', 'K', 'U', 'U', 'U', 'L', 'L', 'L', 'X']
  const mineralType = types[Math.floor(Math.random() * types.length)]
  const density = 4
  return { type: 'mineral', mineralType, density, mineralAmount: 100000, x, y, room }
}

async function updateTerrainData (db, env) {
  let walled = ''
  for (let i = 0; i < 2500; i++) {
    walled += '1'
  }
  const [rooms, terrain] = await Promise.all([
    db.rooms.find(),
    db['rooms.terrain'].find()
  ])
  rooms.forEach(room => {
    if (room.status === 'out of borders') {
      _.find(terrain, {room: room._id}).terrain = walled
    }
    let m = room._id.match(/(W|E)(\d+)(N|S)(\d+)/)
    let roomH = m[1] + (+m[2] + 1) + m[3] + m[4]
    let roomV = m[1] + m[2] + m[3] + (+m[4] + 1)
    if (!_.any(terrain, {room: roomH})) {
      terrain.push({room: roomH, terrain: walled})
    }
    if (!_.any(terrain, {room: roomV})) {
      terrain.push({room: roomV, terrain: walled})
    }
  })
  const compressed = await zlib.deflateAsync(JSON.stringify(terrain))
  await env.set(env.keys.TERRAIN_DATA, compressed.toString('base64'))
}

class World {
  /**
    Constructor
  */
  constructor(server) {
    this.server = server
  }

  /**
    Getters
  */
  get gameTime () {
    return this.load().then(({ env }) => env.get('gameTime'))
  }

  /**
    Getters
  */
  async load () {
    if (!this.server.connected) await this.server.connect()
    const { db, env, pubsub } = this.server.common.storage
    const C = this.server.constants
    return { C, db, env, pubsub }
  }

  /**
    Reset worl data to a baren world with invaders and source keepers users plus one room (W0N0)
  */
  async reset () {
    const { C, db, env } = await this.load()
    // Clear database
    await Promise.all(_.map(db, col => col.clear()))
    await env.set('gameTime', 1)
    // Insert basic data
    await Promise.all([
      db.users.insert({ _id: '2', username: 'Invader', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 }),
      db.users.insert({ _id: '3', username: 'Source Keeper', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 }),
      db.rooms.insert({ _id: 'W0N0', status: 'normal', active: true }),
      db['rooms.terrain'].insert({ room: 'W0N0', terrain: getBoxTerrain() }),
      db['rooms.objects'].insert({ room: 'W0N0', type: 'controller', x: 10, y: 40, level: 0 }),
      db['rooms.objects'].insert({ room: 'W0N0', type: 'source', x: 10, y: 10, energy: C.SOURCE_ENERGY_NEUTRAL_CAPACITY, energyCapacity: C.SOURCE_ENERGY_NEUTRAL_CAPACITY, ticksToRegeneration: C.ENERGY_REGEN_TIME }),
      db['rooms.objects'].insert({ room: 'W0N0', type: 'source', x: 10, y: 40, energy: C.SOURCE_ENERGY_NEUTRAL_CAPACITY, energyCapacity: C.SOURCE_ENERGY_NEUTRAL_CAPACITY, ticksToRegeneration: C.ENERGY_REGEN_TIME }),
      db['rooms.objects'].insert(generateMineral('W0N0', 40, 40))
    ])
    await updateTerrainData(db, env)
  }

  /**
    Add a new user to the server world
  */
  async addBot ({ username, room, x, y, spawnName = 'Spawn1', modules = {} }) {
    const { C, db, env, pubsub } = await this.load()
    // Insert user and update data
    const user = await db.users.insert({ username, cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 10000 })
    await Promise.all([
      env.set(env.keys.MEMORY + user._id, '{}'),
      db.rooms.update({ _id: room }, { $set: { active: true } }),
      db['users.code'].insert({ user: user._id, branch: 'default', modules, activeWorld: true }),
      db['rooms.objects'].update({ room, type: 'controller' }, { $set: { user: user._id, level: 1, progress: 0, downgradeTime: null, safeMode: 20000 } }),
      db['rooms.objects'].insert({ room, type: 'spawn', x: 25, y: 25, user: user._id, name: spawnName, energy: C.SPAWN_ENERGY_START, energyCapacity: C.SPAWN_ENERGY_CAPACITY, hits: C.SPAWN_HITS, hitsMax: C.SPAWN_HITS, spawning: null, notifyWhenAttacked: true }),
    ])
    // Subscribe to console notificaiton and return emitter
    return new User(this.server, user).init()
  }
}

module.exports = World;
