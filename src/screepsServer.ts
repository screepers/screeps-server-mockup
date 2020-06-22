/* eslint no-console: "off" */

import * as cp from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs-extra-promise';
import * as _ from 'lodash';
import * as path from 'path';
import World from './world';

const common = require('@screeps/common');
const driver = require('@screeps/driver');

const ASSETS_PATH = path.join(__dirname, '..', '..', 'assets');
const MOD_FILE = 'mods.json';
const DB_FILE = 'db.json';

export interface ScreepServerOptions {
    path: string;
    logdir: string;
    port : number;
    modfile?: string;
}

export default class ScreepsServer extends EventEmitter {
    driver: any;
    config: any;
    common: any;
    constants: any;
    connected: boolean;
    processes: {[name: string]: cp.ChildProcess};
    world: World;

    private usersQueue?: any;
    private roomsQueue?: any;

    private opts: ScreepServerOptions;

    /*
        Constructor.
    */
    constructor(opts: Partial<ScreepServerOptions> = {}) {
        super();
        this.common = common;
        this.driver = driver;
        this.config = common.configManager.config;
        this.constants = this.config.common.constants;
        this.connected = false;
        this.processes = {};
        this.world = new World(this);
        this.opts = this.computeDefaultOpts(opts);
    }

    /*
        Define server options and set defaults.
    */
    private computeDefaultOpts(opts: Partial<ScreepServerOptions>) {
        // Assign options
        const defaults: ScreepServerOptions = {
            path:   path.resolve('server'),
            logdir: path.resolve('server', 'logs'),
            port:   21025,
        };

        const options = _.defaults(opts, defaults);
        // Define environment parameters
        process.env.MODFILE = options.modfile;
        process.env.DRIVER_MODULE = '@screeps/driver';
        process.env.STORAGE_PORT = `${options.port}`;
        return options;
    }

    /*
        Set the current server options. Missing values will use defaults
    */
    setOpts(opts: ScreepServerOptions) {
        this.opts = this.computeDefaultOpts(opts);
        return this;
    }

    /*
        Get the current server options.
    */
    getOpts(): ScreepServerOptions {
        return this.opts;
    }

    /*
        Start storage process and connect driver.
    */
    async connect() {
        // Ensure directories exist
        await fs.mkdirAsync(this.opts.path).catch(() => {});
        await fs.mkdirAsync(this.opts.logdir).catch(() => {});
        // Copy assets into server directory
        await Promise.all([
            fs.copyAsync(path.join(ASSETS_PATH, DB_FILE), path.join(this.opts.path, DB_FILE)),
            fs.copyAsync(path.join(ASSETS_PATH, MOD_FILE), path.join(this.opts.path, MOD_FILE)),
        ]);
        // Start storage process
        this.emit('info', 'Starting storage process.');
        const library = path.resolve(path.dirname(require.resolve('@screeps/storage')), '../bin/start.js');
        const process = await this.startProcess('storage', library, {
            DB_PATH:      path.resolve(this.opts.path, DB_FILE),
            MODFILE:      path.resolve(this.opts.path, MOD_FILE),
            STORAGE_PORT: `${this.opts.port}`,
        });
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Could not launch the storage process (timeout).')), 5000);
            process.on('message', (message) => {
                if (message === 'storageLaunched') {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });
        // Connect to storage process
        try {
            const oldLog = console.log;
            console.log = _.noop; // disable console
            await driver.connect('main');
            console.log = oldLog; // re-enable console
            this.usersQueue = await driver.queue.create('users');
            this.roomsQueue = await driver.queue.create('rooms');
            this.connected = true;
        } catch (err) {
            throw new Error(`Error connecting to driver: ${err.stack}`);
        }
        return this;
    }

    /*
        Run one tick.

        Emulating @screeps/engine/main.js loop.
    */
    async tick() {
        await driver.notifyTickStarted();
        const users = await driver.getAllUsers();
        await this.usersQueue.addMulti(_.map(users, (user) => user._id.toString()));
        await this.usersQueue.whenAllDone();
        const rooms = await driver.getAllRoomsNames() || [];
        await this.roomsQueue.addMulti(rooms);
        await this.roomsQueue.whenAllDone();
        await driver.commitDbBulk();
        // eslint-disable-next-line global-require
        await require('@screeps/engine/src/processor/global')();
        await driver.commitDbBulk();
        const gameTime = await driver.incrementGameTime();
        await driver.updateAccessibleRoomsList();
        await driver.updateRoomStatusData();
        await driver.notifyRoomsDone(gameTime);
        await (driver.config as any).mainLoopCustomStage();
        return this;
    }

    /*
        Start a child process with environment.
    */
    async startProcess(name: string, execPath: string, env: NodeJS.ProcessEnv) {
        const fd = await fs.openAsync(path.resolve(this.opts.logdir, `${name}.log`), 'a');
        this.processes[name] = cp.fork(path.resolve(execPath), [], { stdio: [0, fd, fd, 'ipc'], env });
        this.emit('info', `[${name}] process ${this.processes[name].pid} started`);
        this.processes[name].on('exit', async (code, signal) => {
            await fs.closeAsync(fd);
            if (code && code !== 0) {
                this.emit('error', `[${name}] process ${this.processes[name].pid} exited with code ${code}, restarting...`);
                this.startProcess(name, execPath, env);
            } else if (code === 0) {
                this.emit('info', `[${name}] process ${this.processes[name].pid} stopped`);
            } else {
                this.emit('info', `[${name}] process ${this.processes[name].pid} exited by signal ${signal}`);
            }
        });
        return this.processes[name];
    }

    /*
        Start processes and connect driver.
    */
    async start() {
        // eslint-disable-next-line global-require
        this.emit('info', `Server version ${require('screeps').version}`);
        if (!this.connected) {
            await this.connect();
        }
        this.emit('info', 'Starting engine processes.');
        this.startProcess('engine_runner', path.resolve(path.dirname(require.resolve('@screeps/engine')), 'runner.js'), {
            DRIVER_MODULE: '@screeps/driver',
            MODFILE:       path.resolve(this.opts.path, DB_FILE),
            STORAGE_PORT:  `${this.opts.port}`,
        });
        this.startProcess('engine_processor', path.resolve(path.dirname(require.resolve('@screeps/engine')), 'processor.js'), {
            DRIVER_MODULE: '@screeps/driver',
            MODFILE:       path.resolve(this.opts.path, DB_FILE),
            STORAGE_PORT:  `${this.opts.port}`,
        });

        // Need to pre-initiailize the Room Status cache
        await driver.updateAccessibleRoomsList();
        await driver.updateRoomStatusData();

        return this;
    }

    /*
        Stop most processes (it is not perfect though as some remain).
    */
    stop() {
        _.each(this.processes, (process) => process.kill());
        return this;
    }
}
