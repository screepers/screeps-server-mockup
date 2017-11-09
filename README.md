# screeps-server-mockup

_Based on https://github.com/screepers/screeps-server-test_

## Private server package for unit tests

This is a project that runs the screeps private server one tick at a time, allowing to easily check
data in between ticks and opens the possibilities for automatic testings in a reproductible
environment.

## Requirements

* node 8+

## Usage

1. Install via npm or yarn
2. Write a test script (see `test.js` for details)
3. Run the test script

Script example:
```
const ScreepsServer = require('./ScreepsServer');
const server = new ScreepsServer();

// Reset world and add our bot
await server.world.reset();
const modules = {
  main: `module.exports.loop = function(){ console.log('Tick!',Game.time); }`;
}
let bot = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules })

// Print console logs every tick
bot.on('console', (log, userid, username) => {
  log.map(l => console.log('[console]', username, l))
})

// Start engine processes and run a tick
await server.start()
await server.tick() // Execute exactly 1 complete tick
```
