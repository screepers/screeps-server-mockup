import * as assert from 'assert';
import * as fs from 'fs-extra-promise';
import * as _ from 'lodash';
import * as path from 'path';
import ScreepsServer from '../src/screepsServer';

const stdHooks = require('../utils/stdhooks');

// Dirty hack to prevent driver from flooding error messages
stdHooks.hookWrite();

suite('User tests', function () {
    this.timeout(30 * 1000);
    this.slow(5 * 1000);

    // Server variable used for the tests
    let server: ScreepsServer | null = null;

    test('Getting basic user attributes and statistics', async () => {
    // Server initialization
        server = new ScreepsServer();
        await server.start();
        // User / bot initialization
        const modules = {
            main: `module.exports.loop = function() {
                Memory.foo = { bar: 'baz' }
            }`,
        };
        const user = await server.world.addBot({
            username: 'bot',
            room: 'W0N0',
            x: 25,
            y: 25,
            modules,
        });
        // Run one tick
        await server.tick();
        (await user.newNotifications).forEach(({ message }) => console.log('[notification]', message));
        // Assert if attributes are correct
        assert(_.isString(user.id) && user.id.length > 0, 'invalid user id');
        assert.strictEqual(user.username, 'bot');
        assert.strictEqual(await user.cpu, 100);
        // assert.strictEqual(await user.cpuAvailable, 10000);
        // assert(
        //   _.isNumber(await user.lastUsedCpu),
        //   "user.lastUsedCpu is not a number"
        // );
        assert.strictEqual(await user.gcl, 1);
        assert.deepStrictEqual(await user.rooms, ['W0N0']);
        // Assert if memory is correctly set and retrieved
        const memory = JSON.parse(await user.memory);
        const reference = { foo: { bar: 'baz' } };
        assert.deepStrictEqual(memory, reference);
        // Stop server (don't stop it before we get all info)
        server.stop();
    });

    test('Getting segments contents', async () => {
    // Server initialization
        server = new ScreepsServer();
        await server.world.stubWorld();
        // Code declaration
        const modules = {
            main: `module.exports.loop = function() {
                RawMemory.setActiveSegments([0, 1]);
                if (_.size(RawMemory.segments) > 0) {
                    RawMemory.segments[0] = '{"foo":"bar"}';
                    RawMemory.segments[1] = 'azerty';
                }
            }`,
        };
        // User / bot initialization
        const user = await server.world.addBot({
            username: 'bot',
            room: 'W0N0',
            x: 25,
            y: 25,
            modules,
        });
        // Run a few ticks
        await server.start();
        for (let i = 0; i < 3; i += 1) {
            await server.tick();
        }
        // Verify active segments in database
        assert.deepStrictEqual(await user.activeSegments, [0, 1]);
        // Verify segments contents
        const segments = await user.getSegments([0, 1]);
        assert.strictEqual(segments[0], '{"foo":"bar"}');
        assert.strictEqual(segments[1], 'azerty');
        // Stop server (don't stop it before we get segments)
        server.stop();
    });

    test('Sending console commands and getting console logs', async () => {
    // Server initialization
        server = new ScreepsServer();
        await server.world.stubWorld();
        // Code declaration
        const modules = {
            main: `module.exports.loop = function() {
               console.log('tick')
            }`,
        };
    // User / bot initialization
    type Log = {
        log: string[];
        results: string[];
        userid: string;
        username: string;
    };
    const logs: Log[] = [];
    const user = await server.world.addBot({
        username: 'bot',
        room: 'W0N0',
        x: 25,
        y: 25,
        modules,
    });
    user.on('console', (log, results, userid, username) => {
        logs.push({ log, results, userid, username });
    });
    // Run a few ticks
    await server.start();
    for (let i = 0; i < 5; i += 1) {
        await user.console('_.sample(Game.spawns).owner.username');
        await server.tick();
    }
    server.stop();
    // Assert if code was correctly executed
    _.each(logs, ({ log, results, userid, username }) => {
        assert.strictEqual(userid, user.id);
        assert.strictEqual(username, 'bot');
        assert.deepStrictEqual(log, ['tick']);
        assert.deepStrictEqual(results, ['bot']);
    });
    });

    test('Getting notifications and errors', async () => {
    // Server initialization
        server = new ScreepsServer();
        await server.world.stubWorld();
        // Code declaration
        const modules = {
            main: `module.exports.loop = function() {
                throw new Error('something broke!')
            }`,
        };
        // User / bot initialization
        const user = await server.world.addBot({
            username: 'bot',
            room: 'W0N0',
            x: 25,
            y: 25,
            modules,
        });
        // Run a few ticks
        await server.start();
        for (let i = 0; i < 3; i += 1) {
            await server.tick();
        }
        // Assert if code was correctly executed
        _.each(await user.notifications, ({ message, type }) => {
            assert.strictEqual(type, 'error');
            assert(
                message.includes('something broke!'),
                'message doesn\'t cointain "something broke!"'
            );
            assert(message.includes('main:2'), "message doesn't cointain error line");
        });
        // Stop server (don't stop it before we get all notifications)
        server.stop();
    });

    teardown(async () => {
    // Make sure that server is stopped in case something went wrong
        if (server && _.isFunction(server.stop)) {
            server.stop();
            server = null;
        }
        // Delete server files
        await fs.removeAsync(path.resolve('server')).catch(console.error);
    });
});
