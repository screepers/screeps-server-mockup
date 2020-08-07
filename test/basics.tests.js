const assert = require('assert');
const fs = require('fs-extra-promise');
const _ = require('lodash');
const path = require('path');
const { ScreepsServer, stdHooks } = require('../');

// Dirty hack to prevent driver from flooding error messages
stdHooks.hookWrite();

suite('Basics tests', function () {
    this.timeout(30 * 1000);
    this.slow(5 * 1000);

    // Server variable used for the tests
    let server = null;

    test('Starting server and running a few ticks without error', async function () {
        server = new ScreepsServer();
        server.on('error', (msg) => {
            console.log(`error: ${msg}`);
        });
        server.on('info', (msg) => {
            console.log(`info: ${msg}`);
        });
        await server.start();
        for (let i = 0; i < 5; i += 1) {
            await server.tick();
        }
        server.stop();
    });

    test('Setting options in server constructor', async function () {
        // Setup options and server
        const opts = {
            path:   'another_dir',
            logdir: 'another_logdir',
            port:   9999,
            mainLoopResetInterval: 10000,
        };
        server = new ScreepsServer(opts);
        server.on('error', (msg) => {
            console.log(`error: ${msg}`);
        });
        server.on('info', (msg) => {
            console.log(`info: ${msg}`);
        });
        // Assert if options are correctly registered
        assert.equal(server.opts.path, opts.path);
        assert.equal(server.opts.logdir, opts.logdir);
        assert.equal(server.opts.port, opts.port);
        assert.equal(server.opts.mainLoopResetInterval, opts.mainLoopResetInterval);
        // Start, then stop server
        await server.start();
        await server.tick();
        server.stop();
        // Assert if files where actually created in the good directory
        await fs.accessAsync(path.resolve(opts.path));
        await fs.accessAsync(path.resolve(opts.logdir));
    });

    test('Running user code', async function () {
        // Server initialization
        server = new ScreepsServer();
        server.on('error', (msg) => {
            console.log(`error: ${msg}`);
        });
        server.on('info', (msg) => {
            console.log(`info: ${msg}`);
        });
        await server.world.stubWorld();
        // Code declaration
        const modules = {
            main: `module.exports.loop = function() {
               console.log('tick', Game.time);
            }`,
        };
        // User / bot initialization
        let logs = [];
        const user = await server.world.addBot({ username: 'bot', room: 'W0N0', x: 25, y: 25, modules });
        user.on('console', (log) => {
            logs = logs.concat(log);
        });
        // Run a few ticks
        await server.start();
        for (let i = 0; i < 5; i += 1) {
            await server.tick();
        }
        server.stop();
        // Assert if code was correctly executed
        assert.deepEqual(logs, ['tick 1', 'tick 2', 'tick 3', 'tick 4', 'tick 5']);
    });

    test('Getting current tick', async function () {
        // Server initialization
        server = new ScreepsServer();
        server.on('error', (msg) => {
            console.log(`error: ${msg}`);
        });
        server.on('info', (msg) => {
            console.log(`info: ${msg}`);
        });
        await server.world.reset();
        assert.equal(await server.world.gameTime, 1);
        // Run a few ticks and assert if tick is correct
        await server.start();
        for (let time = 2; time <= 5; time += 1) {
            await server.tick();
            assert.equal(await server.world.gameTime, time);
        }
        // Stop server
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
        await fs.removeAsync(path.resolve('another_dir')).catch(console.error);
        await fs.removeAsync(path.resolve('another_logdir')).catch(console.error);
    });
});
