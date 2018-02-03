/* eslint prefer-arrow-callback: "off", global-require: "off", import/no-dynamic-require: "off" */

const { ScreepsServer } = require('../');
const assert = require('assert');
const fs = require('fs-extra-promise');
const _ = require('lodash');
const path = require('path');
const { hookStdWrite } = require('./utils/stdhook');

// Dirty hack to prevent driver from flooding error messages
hookStdWrite();

suite('World tests', function () {
    this.timeout(30 * 1000);
    this.slow(5 * 1000);

    // Server variable used for the tests
    let server = null;

    test('Getting internal constants and objects (internal)', async function () {
        server = new ScreepsServer();
        const { C, db, env, pubsub } = await server.world.load();
        assert.equal(C.OK, 0);
    });

    test('Getting game time (tick)', async function () {
        // Start server
        server = new ScreepsServer();
        await server.start();
        // Assert that game time has a correct format
        const initial = await server.world.gameTime;
        assert(_.isNumber(initial), 'Game time is not a number.');
        assert(initial > 0, 'Game time is not positive.');
        // Assert that game time is correct after a tick
        await server.tick();
        assert.equal(await server.world.gameTime, initial + 1);
        // Stop server (don't stop it before we get all info)
        server.stop();
    });

    test('Reseting world', async function () {
        // Server initialization
        server = new ScreepsServer();
        await server.start();
        await server.tick();
        // Reset server and ensure world is correctly reset
        await server.world.reset();
        assert(await server.world.gameTime, 1);
    });

    test('Adding a bot', async function () {
        // Server initialization
        server = new ScreepsServer();
        const { db } = await server.world.load();
        await server.world.reset();
        // Add a few bots with different parameters
        const modules = {
            main: 'console.log(Game.time)'
        };
        await server.world.addBot({ username: 'bot1', room: 'W0N1', x: 25, y: 25, spawnName: 'azerty', modules });
        await server.world.addBot({ username: 'bot2', room: 'W0N2', x: 30, y: 10, gcl: 9, cpu: 110, cpuAvailable: 10000 });
        // Assert if users were correctly created in database
        const bot1 = _.first(await db.users.find({ username: 'bot1' }));
        assert.equal(bot1.gcl, 1);
        const bot2 = _.first(await db.users.find({ username: 'bot2' }));
        assert.equal(bot2.gcl, 9);
        assert.equal(bot2.cpu, 110);
        // Assert if controller and spawn were set
        const controller1 = _.first(await db['rooms.objects'].find({ room: 'W0N1', type: 'controller' }));
        const spawn1 = _.first(await db['rooms.objects'].find({ room: 'W0N1', type: 'spawn' }));
        assert.equal(controller1.user, bot1._id);
        assert.equal(spawn1.user, bot1._id);
        assert.equal(spawn1.name, 'azerty');
        // Assert if code was correctly registered
        const code = _.first(await db['users.code'].find({ user: bot1._id, branch: 'default' }));
        assert.deepEqual(code.modules, modules);
    });

    test('Adding rooms', async function () {
        // Server initialization
        server = new ScreepsServer();
        const { db } = server.common.storage;
        await server.world.reset();
        // Add W0N1 and assert if room is created
        await server.world.addRoom('W0N1');
        const room = _.first(await db.rooms.find({ _id: 'W0N1' }));
        assert.equal(room._id, 'W0N1');
        // Cha,ge room status and assert if modification is done without adding a new room
        await server.world.setRoom('W0N1', 'normal', false);
        const rooms = await db.rooms.find({ _id: 'W0N1' });
        assert.equal(rooms.length, 1);
        assert.equal(_.first(rooms).active, false);
    });

    test('Getting and setting RoomObjetcs', async function () {
        // Server initialization
        server = new ScreepsServer();
        await server.world.reset();
        await server.world.addRoom('W0N1');
        // Add some objects in W0N1
        await server.world.addRoomObject('W0N1', 'source', 10, 40, { energy: 1000, energyCapacity: 1000, ticksToRegeneration: 300 });
        await server.world.addRoomObject('W0N1', 'mineral', 40, 40, { mineralType: 'H', density: 3, mineralAmount: 3000 });
        // Listing all RoobObjects in W0N1 and assert if they are correct
        const objects = await server.world.roomObjects('W0N1');
        const source = _.find(objects, { type: 'source' });
        const mineral = _.find(objects, { type: 'mineral' });
        assert.equal(objects.length, 2);
        assert.equal(source.x, 10);
        assert.equal(source.energy, 1000);
        assert.equal(mineral.density, 3);
    });

    test('Getting and setting room terrain', async function () {
        // Server initialization
        server = new ScreepsServer();
        await server.world.reset();
        await server.world.addRoom('W0N1');
        // Set room terrain
        await server.world.setTerrain('W0N1'); // default terrain
        let matrix = await server.world.getTerrain('W0N1');
        assert(matrix.get(0, 0), 'plain');
        assert(matrix.serialize(), Array(50 * 50).fill('0').join(''));
        // Reset room terrain
        matrix.set(0, 0, 'wall');
        matrix.set(25, 25, 'swamp');
        await server.world.setTerrain('W0N1', matrix);
        matrix = await server.world.getTerrain('W0N1');
        assert(matrix.get(0, 0), 'wall');
        assert(matrix.get(25, 25), 'swamp');
        // Try to get terrain for an unexistant room
        await server.world.getTerrain('W1N1')
            .then(() => { throw new Error('Getting W1N1 terrain didn\'t throw any error') })
            .catch(() => 'ok');
    });

    teardown(async function () {
        // Make sure that server is stopped in case something went wrong
        if (_.isFunction(server.stop)) {
            server.stop();
            server = null;
        }
        // Delete server files
        await fs.removeAsync(path.resolve('server')).catch(console.error);
    });
});
