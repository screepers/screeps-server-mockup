/* eslint prefer-arrow-callback: "off", global-require: "off", import/no-dynamic-require: "off",
no-console: "off", no-unused-vars: "off" */

const { ScreepsServer, stdHooks } = require('../');
const assert = require('assert');
const fs = require('fs-extra-promise');
const _ = require('lodash');
const path = require('path');

// Dirty hack to prevent driver from flooding error messages
stdHooks.hookWrite();

suite('User tests', function () {
    this.timeout(30 * 1000);
    this.slow(5 * 1000);

    // Server variable used for the tests
    let server = null;

    test('Getting basic user attributes and statistics', async function () {
    // Server initialization
        server = new ScreepsServer();
        await server.start();
        // User / bot initialization
        const modules = {
            main: `module.exports.loop = function() {
                Memory.foo = { bar: 'baz' }
            }`,
        };
        const user = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules });
        // Run one tick
        await server.tick();
        (await user.newNotifications).forEach(({ message }) => console.log('[notification]', message));
        // Assert if attributes are correct
        assert(_.isString(user.id) && user.id.length > 0, 'invalid user id');
        assert.equal(user.username, 'bot');
        assert.equal(await user.cpu, 100);
        assert.equal(await user.cpuAvailable, 10000);
        assert(_.isNumber(await user.lastUsedCpu));
        assert.equal(await user.gcl, 1);
        assert.deepEqual(await user.rooms, ['W0N0']);
        // Assert if memory is correctly set and retrieved
        const memory = JSON.parse(await user.memory);
        const reference = { foo: { bar: 'baz' } };
        assert.deepEqual(memory, reference);
        // Stop server (don't stop it before we get all info)
        server.stop();
    });

    test('Sending console commands and getting console logs', async function () {
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
        const logs = [];
        const user = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules });
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
            assert.equal(username, 'bot');
            assert.deepEqual(log, ['tick']);
            assert.deepEqual(results, ['bot']);
        });
    });

    test('Getting notifications and errors', async function () {
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
        const user = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules });
        // Run a few ticks
        await server.start();
        for (let i = 0; i < 3; i += 1) {
            await server.tick();
        }
        // Assert if code was correctly executed
        _.each(await user.notifications, ({ message, type, date, count, _id }) => {
            assert.equal(type, 'error');
            assert(message.includes('something broke!'), 'message doesn\'t cointain "something broke!"');
            assert(message.includes('main:2'), 'message doesn\'t cointain error line');
        });
        // Stop server (don't stop it before we get all notifications)
        server.stop();
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
