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
2. Write a test script (see `examples` and `tests` folders for details)
3. Run the test script


## Script example

``` javascript
const _ = require('lodash');
const { ScreepsServer, TerrainMatrix } = require('screeps-server-mockup');

const server = new ScreepsServer();

// Initialize server
await server.start(); // connect to storage and start runners
await server.world.reset(); // reset world but add invaders and source keepers bots

// Prepare the terrain for a new room
const terrain = new TerrainMatrix();
const walls = [[10, 10], [10, 40], [40, 10], [40, 40]];
_.each(walls, ([x, y]) => terrain.set(x, y, 'wall'));

// Create a new room with terrain and basic objects
await server.world.addRoom('W0N1');
await server.world.setTerrain('W0N1', terrain);
await server.world.addRoomObject('W0N1', 'controller', 10, 10, { level: 0 });
await server.world.addRoomObject('W0N1', 'source', 10, 40, { energy: 1000, energyCapacity: 1000, ticksToRegeneration: 300 });
await server.world.addRoomObject('W0N1', 'mineral', 40, 40, { mineralType: 'H', density: 3, mineralAmount: 3000 });

// Add a bot in W0N1
const modules = {
    main: `module.exports.loop = function() {
        console.log('Tick!',Game.time);
        const directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
        _.sample(Game.spawns).createCreep([MOVE]);
        _.each(Game.creeps, c => c.move(_.sample(directions)));
    };`
};
const bot = await server.world.addBot({ username: 'bot', room: 'W0N1', x: 25, y: 25, modules });

// Print console logs every tick
bot.on('console', (logs, results, userid, username) => {
    _.each(logs, line => console.log(`[console|${username}]`, line));
});

// Run several ticks
for (let i = 0; i < 10; i++) {
    console.log('[tick]', await server.world.gameTime);
    await server.tick();
    _.each(await bot.newNotifications, ({ message }) => console.log('[notification]', message));
    console.log('[memory]', await bot.memory, '\n');
}

// Stop server and disconnect storage
server.stop();
process.exit(); // required as there is no way to properly shutdown storage :(
```

Each tick should output something like:
>[tick] 1
>[console|bot] Tick! 1
>[memory] {"creeps":{"Arianna":{}}}


## Tests

```
yarn lint // or npm run lint
yarn test // or npm run test
```
