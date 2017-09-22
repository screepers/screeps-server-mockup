const ScreepsServer = require('./ScreepsServer')
const zlib = require('zlib')
const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const Promise = require('bluebird')

Promise.promisifyAll(zlib)
Promise.promisifyAll(fs)

const server = new ScreepsServer()

go()

process.on('unhandledPromiseRejection', (err) => {
  console.error(err, err.stack)
})

async function go () {
  await server.connect() // connect to storage system
  const { db, env, pubsub } = server.common.storage
  const C = server.constants
  const modules = {
    main: `module.exports.loop = function(){ console.log('Tick!',Game.time); Game.spawns.Spawn1.createCreep([MOVE]); _.each(Game.creeps, c=>c.move(Math.ceil(Math.random()*8))) }`
  }
  await fs.readdirAsync('../screeps-quorum/dist')
    .filter(file => file.match(/js$/))
    .map(file => fs.readFileAsync(`../screeps-quorum/dist/${file}`, 'utf8').then(data => ({ file, data })))
    .each(({ file, data }) => (modules[path.basename(file).slice(0, -3)] = data))

  await Promise.resolve(Object.keys(db))
    .map(col => db[col])
    .map(col => col.drop && col.drop())
    .all()

  await Promise.all([
    env.set('gameTime', 1),
    db.users.insert({ _id: '2', username: 'Invader', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 }),
    db.users.insert({ _id: '3', username: 'Source Keeper', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 }),
    db.rooms.insert({ _id: 'W0N0', status: 'normal', active: true }),
    db['rooms.terrain'].insert({ room: 'W0N0', terrain: getBoxTerrain() }),
    db['rooms.objects'].insert({ room: 'W0N0', type: 'controller', x: 10, y: 40, level: 0 }),
    db['rooms.objects'].insert({ room: 'W0N0', type: 'source', x: 10, y: 10, energy: C.SOURCE_ENERGY_NEUTRAL_CAPACITY, energyCapacity: C.SOURCE_ENERGY_NEUTRAL_CAPACITY, ticksToRegeneration: C.ENERGY_REGEN_TIME }),
    db['rooms.objects'].insert({ room: 'W0N0', type: 'source', x: 10, y: 40, energy: C.SOURCE_ENERGY_NEUTRAL_CAPACITY, energyCapacity: C.SOURCE_ENERGY_NEUTRAL_CAPACITY, ticksToRegeneration: C.ENERGY_REGEN_TIME }),
    db['rooms.objects'].insert(generateMineral('W0N0', 40, 40))
  ])

  await addBot({
    name: 'Quorum',
    room: 'W0N0',
    x: 25,
    y: 25,
    modules
  })

  function addBot ({ name, room, x, y, spawnName = 'Spawn1', modules = {}}) {
    return Promise.resolve()
      .then(() => db.users.insert({ _id: 'bot', username: 'bot', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 1 }))
      .then(user => Promise.all([
        db['users.code'].insert({ user: user._id, branch: 'default', modules, activeWorld: true }),
        db.rooms.update({ _id: room }, { $set: { active: true } }),
        db['rooms.objects'].update({ room, type: 'controller' }, { $set: { user: user._id, level: 1, progress: 0, downgradeTime: null, safeMode: 20000 } }),
        db['rooms.objects'].insert({ room, type: 'spawn', x: 25, y: 25, user: user._id, name: spawnName, energy: C.SPAWN_ENERGY_START, energyCapacity: C.SPAWN_ENERGY_CAPACITY, hits: C.SPAWN_HITS, hitsMax: C.SPAWN_HITS, spawning: null, notifyWhenAttacked: true }),
        env.set(env.keys.MEMORY + user._id, '{}')
      ]))
  }

  await pubsub.subscribe('user:bot/console', (event) => {
    const { messages: { log = [] } = {}, userId } = JSON.parse(event)
    // log.map(l => console.log('[console]', userId, l))
  })
  // server.driver.config.on('mainLoopStage', (stage, data) => console.log('Stage', stage, data))
  await updateTerrainData(db, env)
  console.log('Starting server')
  await server.start() // Startup server
  console.log('Game time:', await env.get('gameTime'))
  for (let i = 0; i < 100; i++) {
    await server.tick() // Execute exactly 1 complete tick
  }
  console.log('Game time:', await env.get('gameTime'))

  // Show bot's objects
  let objs = await db['rooms.objects'].find()
  console.log("Bot's Objects:")
  objs.forEach(obj => {
    console.log(`${obj.type} (${obj.x}, ${obj.y}) ${obj.name || ''}`)
  })

  // Dump DB and Redis
  // for (let col in db) {
  //   console.log(col, await db[col].find())
  // }
  // for (let k in env.keys) {
  //   console.log(k, await env.get(env.keys[k]))
  // }

  process.exit() // Needed due to open db connections keeping process open
}

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
  const mineral = types[Math.floor(Math.random() * types.length)]
  const density = 4
  return {
    type: 'mineral',
    mineralType: mineral,
    density,
    mineralAmount: 100000,
    x,
    y,
    room
  }
}

function updateTerrainData (db, env) {
  let walled = ''
  for (let i = 0; i < 2500; i++) {
    walled += '1'
  }
  return Promise.all([
    db.rooms.find(),
    db['rooms.terrain'].find()
  ])
    .then(result => {
      let [rooms, terrain] = result

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
      return zlib.deflateAsync(JSON.stringify(terrain))
    })
    .then(compressed => env.set(env.keys.TERRAIN_DATA, compressed.toString('base64')))
    .then(() => 'OK')
}
