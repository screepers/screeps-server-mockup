/* eslint global-require: "off", import/no-extraneous-dependencies: "off",
import/no-unresolved: "off", no-console: "off", no-unused-vars: "off" */

(async function () {
    const _ = require('lodash');
    const { ScreepsServer, TerrainMatrix } = require('screeps-server-mockup');

    const server = new ScreepsServer();

    try {
    // Initialize server
        await server.start();           // connect to storage and start runners
        await server.world.reset();     // reset world but add invaders and source keepers users
        await server.world.stubWorld(); // create a stub world of 9 rooms with sources + controller

        // Add a bot in W0N0
        const modules = {
            main: `module.exports.loop = function() {
          console.log('Tick!',Game.time);
          const directions = [TOP, TOP_RIGHT, RIGHT, BOTTOM_RIGHT, BOTTOM, BOTTOM_LEFT, LEFT, TOP_LEFT];
          _.sample(Game.spawns).createCreep([MOVE]);
          _.each(Game.creeps, c => c.move(_.sample(directions)));
        };`,
        };
        const bot = await server.world.addBot({ username: 'bot', room: 'W0N1', x: 15, y: 15, modules });

        // Run a tick
        await server.tick();
    } catch (err) {
        console.error(err);
    } finally {
        process.exit();
    }
}());
