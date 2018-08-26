/* eslint global-require: "off" */

const assert = require('assert');
const fs = require('fs-extra-promise');
const _ = require('lodash');
const path = require('path');
const { ScreepsServer, stdHooks } = require('../');

// Dirty hack to prevent driver from flooding error messages
stdHooks.hookWrite();

suite('World tests', function () {
    this.timeout(30 * 1000);
    this.slow(5 * 1000);

    // Server variable used for the tests
    let server = null;

    test('Getting internal constants and objects (internal)', async function () {
        server = new ScreepsServer();
        const { C } = await server.world.load();
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
            main: 'console.log(Game.time)',
        };
        await server.world.addRoomObject('W0N1', 'controller', 20, 20);
        await server.world.addBot({ username: 'bot1', room: 'W0N1', x: 25, y: 25, spawnName: 'azerty', modules });
        await server.world.addRoomObject('W0N2', 'controller', 25, 25);
        await server.world.addBot({ username: 'bot2', room: 'W0N2', x: 30, y: 10, gcl: 9, cpu: 110, cpuAvailable: 10000 });
        // Assert if users were correctly created in database
        const bot1 = await db.users.findOne({ username: 'bot1' });
        assert.equal(bot1.gcl, 1);
        const bot2 = await db.users.findOne({ username: 'bot2' });
        assert.equal(bot2.gcl, 9);
        assert.equal(bot2.cpu, 110);
        // Assert if controller and spawn were set
        const controller1 = await db['rooms.objects'].findOne({ $and: [{ room: 'W0N1' }, { type: 'controller' }] });
        const spawn1 = await db['rooms.objects'].findOne({ $and: [{ room: 'W0N1' }, { type: 'spawn' }] });
        assert.equal(controller1.user, bot1._id);
        assert.equal(spawn1.user, bot1._id);
        assert.equal(spawn1.name, 'azerty');
        // Assert if code was correctly registered
        const code = await db['users.code'].findOne({ $and: [{ user: bot1._id }, { branch: 'default' }] });
        assert.deepEqual(code.modules, modules);
    });

    test('Adding rooms', async function () {
        // Server initialization
        server = new ScreepsServer();
        const { db } = server.common.storage;
        await server.world.reset();
        // Add W0N1 and assert if room is created
        await server.world.addRoom('W0N1');
        const room = await db.rooms.findOne({ _id: 'W0N1' });
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
            .then(() => { throw new Error('Getting W1N1 terrain didn\'t throw any error'); })
            .catch(() => 'ok');
    });

    test('Defining a stub world', async function () {
        const samples = require('../assets/rooms.json');
        // Server initialization
        server = new ScreepsServer();
        const { db } = server.common.storage;
        await server.world.stubWorld();
        // Check that rooms were added
        const rooms = await db.rooms.find();
        assert.equal(rooms.length, _.size(samples));
        // Check that terrains were added
        const terrain = await db['rooms.terrain'].find();
        assert.equal(terrain.length, _.size(samples));
        _.each(samples, async (sourceData, roomName) => {
            const roomData = await db['rooms.terrain'].findOne({ room: roomName });
            assert.equal(roomData.terrain, sourceData.serial);
        });
        // Check that roomObject were added
        const nbObjects = _.sumBy(_.toArray(samples), room => _.size(room.objects));
        const objects = await db['rooms.objects'].find();
        assert.equal(objects.length, nbObjects);
    });

    test('Reading terrain in game', async function () {
        // Server initialization
        server = new ScreepsServer();
        await server.world.stubWorld();
        // Code declaration
        const modules = {
            main: `module.exports.loop = function() {
               console.log('W0N0 terrain: ' + Game.map.getTerrainAt(25, 25, 'W0N0'));
               console.log('W0N1 terrain: ' + Game.map.getTerrainAt(15, 48, 'W0N1'));
               console.log('W1N2 terrain: ' + Game.map.getTerrainAt(37, 0, 'W1N2'));
            }`,
        };
        // User / bot initialization
        let logs = null;
        const user = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules });
        user.on('console', (log, results, userid, username) => {
            logs = log;
        });
        // Run one tick, then stop server
        await server.start();
        await server.tick();
        server.stop();
        // Assert if terrain was correctly read
        assert.equal(logs.filter(line => line.match('terrain')).length, 3, 'invalid logs length');
        assert.ok(_.find(logs, line => line.match('W0N0 terrain: plain')), 'W0N0 terrain not found or incorrect');
        assert.ok(_.find(logs, line => line.match('W0N1 terrain: wall')), 'W0N1 terrain not found or incorrect');
        assert.ok(_.find(logs, line => line.match('W1N2 terrain: wall')), 'W1N2 terrain not found or incorrect');
    });

    test('Reading exits in game', async function () {
        // Server initialization
        server = new ScreepsServer();
        await server.world.stubWorld();
        // Code declaration
        const modules = {
            main: `module.exports.loop = function() {
               console.log('W0N0 exits: ' + JSON.stringify(Game.map.describeExits('W0N0')));
               console.log('W0N1 exits: ' + JSON.stringify(Game.map.describeExits('W0N1')));
               console.log('W1N2 exits: ' + JSON.stringify(Game.map.describeExits('W1N2')));
            }`,
        };
        // User / bot initialization
        let logs = null;
        const user = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules });
        user.on('console', (log, results, userid, username) => {
            logs = log;
        });
        // Run one tick, then stop server
        await server.start();
        await server.tick();
        server.stop();
        // Assert if exits were correctly read
        assert.equal(logs.filter(line => line.match('exits')).length, 3, 'invalid logs length');
        assert.ok(_.find(logs, line => line.match('W0N0 exits: {"7":"W1N0"}')), 'W0N0 exits not found or incorrect');
        assert.ok(_.find(logs, line => line.match('W0N1 exits: {"1":"W0N2","7":"W1N1"}')), 'W0N1 exits not found or incorrect');
        assert.ok(_.find(logs, line => line.match('W1N2 exits: {"5":"W1N1","7":"W2N2"}')), 'W1N2 exits not found or incorrect');
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
