const _ = require('lodash')
const fs = require('fs-extra-promise')
const path = require('path')
const { ScreepsServer, TerrainMatrix } = require('./')

process.on('unhandledPromiseRejection', (err) => {
  console.error(err, err.stack)
})

;(async function () {
  await fs.removeAsync(path.join(__dirname, 'server')).catch(err => console.error(err))

  try {
    const server = new ScreepsServer()

    // Reset batabase
    await server.world.reset()

    // Add a new room (W1N0)
    server.world.addRoom('W1N0')
    let terrain = new TerrainMatrix()
    terrain.set(0, 0, 'wall')
    terrain.get(0, 0)
    terrain.get(0, 10)
    const serial = terrain.serialize()
    console.log('terrain.serialize():', serial)
    terrain = TerrainMatrix.unserialize(serial)
    console.log('terrain.get(0, 0):', terrain.get(0, 0))
    await server.world.setTerrain('W1N0', terrain)
    terrain.set(0, 1, 'wall')
    terrain.set(1, 0, 'swamp')
    await server.world.setTerrain('W1N0', terrain)
    terrain = await server.world.getTerrain('W1N0')
    console.log('terrain.serialize():', terrain.serialize())

    // Populate W1N0 RoomObjects
    server.world.addRoomObject('W1N0', 'controller', 10, 10, { level: 0 })
    server.world.addRoomObject('W1N0', 'source', 10, 40, { energy: 0, energyCapacity: 1000, ticksToRegeneration: 1 })
    server.world.addRoomObject('W1N0', 'source', 40, 10, { energy: 0, energyCapacity: 1000, ticksToRegeneration: 1 })
    server.world.addRoomObject('W1N0', 'mineral', 40, 40, { mineralType: 'H', density: 4, mineralAmount: 100000 })

    // Add our bot and subscribe to console logs
    const modules = {
      main: `module.exports.loop = function() {
        console.log('Tick!', Game.time);
        Game.spawns.Spawn1.createCreep([MOVE]);
        _.each(Game.creeps, c => c.move(Math.ceil(Math.random() * 8)))
        if (Game.time === 5) throw new Error('error')
        if (Game.time === 1) console.log(\`Terrain at 10:10 = \${Game.map.getTerrainAt(10, 10, 'W0N0')}\`)
        if (Game.time === 1) console.log(\`Terrain at 20:20 = \${Game.map.getTerrainAt(20, 20, 'W0N0')}\`)
      }`
    }
    const user = await server.world.addBot('bot', 'W0N0', 25, 25, modules)
    user.on('console', (log, results, userid, username) => {
      log.forEach(l => console.log('[console.log]', l))
      results.forEach(r => console.log('[console.results]', r))
    })

    // Start engine processes
    console.log('Starting server')
    await server.start()

    // Run several ticks
    for (let i = 0; i < 10; i++) {
      console.log('\nGame time:', await server.world.gameTime)
      await user.console(`console.log(Game.time, 'should equal', ${i + 1})`)
      await server.tick()
      ;(await user.newNotifications).forEach(({ message }) => console.log('[notification]', message))
      console.log('[memory]', await user.memory)
    }

    // Stop server
    console.log('\nDone, killing process.')
    server.stop()
    setTimeout(() => process.exit(), 1000) // needed due to open db connections keeping process open
  } catch(err) {
    console.log(err, err.stack)
    process.exit()
  }
})()
