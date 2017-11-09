const ScreepsServer = require('./ScreepsServer')
const zlib = require('zlib')
const path = require('path')
const fs = require('fs')
const _ = require('lodash')
const Promise = require('bluebird')

Promise.promisifyAll(zlib)
Promise.promisifyAll(fs)

process.on('unhandledPromiseRejection', (err) => {
  console.error(err, err.stack)
})

;(async function () {
  try {
    // Initialize server
    const server = new ScreepsServer()
    await server.connect()

    // Reset batabase
    await server.world.reset()

    // Add our bot and subscribe to console logs
    const modules = {
      main: `module.exports.loop = function(){ console.log('Tick!',Game.time); Game.spawns.Spawn1.createCreep([MOVE]); _.each(Game.creeps, c=>c.move(Math.ceil(Math.random()*8))) }`
    }
    // The following code loads the bot code from a local folder
    // await fs.readdirAsync('../screeps-quorum/dist')
    //   .filter(file => file.match(/js$/))
    //   .map(file => fs.readFileAsync(`../screeps-quorum/dist/${file}`, 'utf8').then(data => ({ file, data })))
    //   .each(({ file, data }) => (modules[path.basename(file).slice(0, -3)] = data))
    let bot = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules })
    bot.on('console', (log, userId) => {
      log.map(l => console.log('[console]', userId, l))
    })

    // Start engine processes
    console.log('Starting server')
    await server.start()

    // Run several ticks
    console.log('Game time:', await server.world.gameTime)
    for (let i = 0; i < 50; i++) {
      await server.tick() // Execute exactly 1 complete tick
    }
    console.log('Game time:', await server.world.gameTime)

    // Show bot's objects
    /*
    let objs = await db['rooms.objects'].find()
    console.log("Bot's Objects:")
    objs.forEach(obj => {
      console.log(`${obj.type} (${obj.x}, ${obj.y}) ${obj.name || ''}`)
    })
    */

    // Stop server
    console.log('Done, killing process.')
    server.stop()
    setTimeout(() => process.exit(), 1000) // needed due to open db connections keeping process open
  } catch(err) {
    console.log(err, err.stack)
  }
})()
