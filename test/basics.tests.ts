import * as assert from 'assert';
import * as fs from 'fs-extra-promise';
import * as _ from 'lodash';
import * as path from 'path';
<<<<<<< HEAD
import {ScreepsServer, ScreepServerOptions} from '../src/screepsServer';
=======
import ScreepsServer from '../src/screepsServer';
<<<<<<< HEAD
>>>>>>> Resolved lint issues in src/
const stdHooks = require('../../utils/stdhooks');
=======

const stdHooks = require('../utils/stdhooks');
>>>>>>> Fixed eslint issues in tests directory

// Dirty hack to prevent driver from flooding error messages
stdHooks.hookWrite();

suite('Basics tests', function () {
    this.timeout(30 * 1000);
    this.slow(5 * 1000);

    // Server variable used for the tests
    let server: ScreepsServer|null = null;

    test('Starting server and running a few ticks without error', async () => {
        server = new ScreepsServer();
        await server.start();
        for (let i = 0; i < 5; i += 1) {
            await server.tick();
        }
        server.stop();
    });

    test('Setting options in server constructor', async () => {
        // Setup options and server
        const opts: ScreepServerOptions = {
            path:   'another_dir',
            logdir: 'another_logdir',
            port:   9999,
        };
        server = new ScreepsServer(opts);
        // Assert if options are correctly registered
        const serverOpts = server.getOpts();
        assert.strictEqual(serverOpts.path, opts.path);
        assert.strictEqual(serverOpts.logdir, opts.logdir);
        assert.strictEqual(serverOpts.port, opts.port);
        // Start, then stop server
        await server.start();
        await server.tick();
        server.stop();
        // Assert if files where actually created in the good directory
        fs.accessSync(path.resolve(opts.path));
        fs.accessSync(path.resolve(opts.logdir));
    });

    test('Running user code', async () => {
        // Server initialization
        server = new ScreepsServer();
        await server.world.stubWorld();
        // Code declaration
        const modules = {
            main: `module.exports.loop = function() {
               console.log('tick', Game.time)
            }`,
        };
        // User / bot initialization
        let logs: string[] = [];
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
        assert.deepStrictEqual(logs, ['tick 1', 'tick 2', 'tick 3', 'tick 4', 'tick 5']);
    });

    test('Getting current tick', async () => {
        // Server initialization
        server = new ScreepsServer();
        await server.world.reset();
        assert.strictEqual(await server.world.gameTime, 1);
        // Run a few ticks and assert if tick is correct
        await server.start();
        for (let time = 2; time <= 5; time += 1) {
            await server.tick();
            assert.strictEqual(await server.world.gameTime, time);
        }
        // Stop server
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
        await fs.removeAsync(path.resolve('another_dir')).catch(console.error);
        await fs.removeAsync(path.resolve('another_logdir')).catch(console.error);
    });
});
