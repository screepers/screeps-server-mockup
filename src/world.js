const Promise = require('bluebird');
const _ = require('lodash');
const TerrainMatrix = require('./terrainMatrix');
const User = require('./user');;
const zlib = Promise.promisifyAll(require('zlib'));

async function updateEnvTerrain (db, env) {
    let walled = '';
    for (let i = 0; i < 2500; i++) {
        walled += '1';
    }
    const [rooms, terrain] = await Promise.all([
        db.rooms.find(),
        db['rooms.terrain'].find()
    ]);
    rooms.forEach(room => {
        if (room.status === 'out of borders') {
            _.find(terrain, {room: room._id}).terrain = walled;
        }
        let m = room._id.match(/(W|E)(\d+)(N|S)(\d+)/);
        let roomH = m[1] + (+m[2] + 1) + m[3] + m[4];
        let roomV = m[1] + m[2] + m[3] + (+m[4] + 1);
        if (!_.some(terrain, {room: roomH})) {
            terrain.push({room: roomH, terrain: walled});
        }
        if (!_.some(terrain, {room: roomV})) {
            terrain.push({room: roomV, terrain: walled});
        }
    })
    const compressed = await zlib.deflateAsync(JSON.stringify(terrain));
    await env.set(env.keys.TERRAIN_DATA, compressed.toString('base64'));
}

class World {
    /**
        Constructor
    */
    constructor(server) {
        this.server = server;
    }

    /**
        Getters
    */
    get gameTime () {
        return this.load().then(({ env }) => env.get('gameTime'));
    }

    /**
        Connect to server (if needed) and return constants, database, env and pubsub objects
    */
    async load () {
        if (!this.server.connected) await this.server.connect();
        const { db, env, pubsub } = this.server.common.storage;
        const C = this.server.constants;
        return { C, db, env, pubsub };
    }

    /**
        Set rom status (and create it if needed)
        This function does NOT generate terrain data
    */
    async setRoom (room, status = 'normal', active = true) {
        const { db } = this.server.common.storage;
        const data = await db.rooms.find({ _id: room });
        if (data.length > 0) {
            await db.rooms.update({ _id: room }, { $set: { status, active } });
        } else {
            await db.rooms.insert({ _id: room, status, active });
        }
    }

    /**
        SImplified allias for setRoom()
    */
    async addRoom (room) {
        return this.setRoom(room);
    }

    /**
        Return room terrain data (walls, plains and swamps)
        Return a TerrainMatrix instance
    */
    async getTerrain (room) {
        const { db } = this.server.common.storage;
        // Load data
        const data = await db['rooms.terrain'].find({ room });
        // Check if data actually exists
        if (data.length === 0) {
            throw new Error(`room ${room} doesn\'t appear to have any terrain data`);
        }
        // Parse and return terrain data as a TerrainMatrix
        const serial = _.get(_.first(data), 'terrain');
        return TerrainMatrix.unserialize(serial);
    }

    /**
        Define room terrain data (walls, plains and swamps)
        @terrain must be an instance of TerrainMatrix.
    */
    async setTerrain (room, terrain = null) {
        const { db, env } = this.server.common.storage;
        // Check parameters
        if (terrain == null) {
            terrain = new TerrainMatrix();
        } else if (!(terrain instanceof TerrainMatrix)) {
            throw new Error('@terrain must be an instance of TerrainMatrix');
        }
        // Insert or update data in database
        const data = await db['rooms.terrain'].find({ room });
        if (data.length > 0) {
            await db['rooms.terrain'].update({ room }, { $set: { terrain: terrain.serialize() } });
        } else {
            await db['rooms.terrain'].insert({ room, terrain: terrain.serialize() });
        }
        // Update environment cache
        await updateEnvTerrain(db, env);
    }

    /**
        Load (if needed) and return constants, database, env and pubsub objects
    */
    async addRoomObject (room, type, x, y, attributes) {
        const { db } = this.server.common.storage;
        // Check parameters
        if (x < 0 || y < 0 || x >= 50 || y >= 50) {
            throw new Error('invalid x/y coordinates (they must be between 0 and 49)');
        }
        // Inject data in database
        const object = Object.assign({ room, x, y, type }, attributes);
        return db['rooms.objects'].insert(object);
    }

    /**
        Reset worl data to a baren world with invaders and source keepers users plus one basic room (W0N0)
    */
    async reset () {
        const { C, db, env } = await this.load();
        // Clear database
        await Promise.all(_.map(db, col => col.clear()));
        await env.set('gameTime', 1);
        // Generate basic terrain data
        const terrain = new TerrainMatrix();
        const walls = [[10, 10], [10, 40], [40, 10], [40, 40]];
        _.each(walls, ([x, y]) => terrain.set(x, y, 'wall'));
        // Insert basic room data
        await Promise.all([
            db.users.insert({ _id: '2', username: 'Invader', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 }),
            db.users.insert({ _id: '3', username: 'Source Keeper', cpu: 100, cpuAvailable: 10000, gcl: 13966610.2, active: 0 })
        ]);
    }

    /**
        Stu a basic world by adding 9 plausible rooms with sources, minerals and controllers.
    */
    async stubWorld () {
        // Clear database
        await this.reset();
        // Utility functions
        const addRoom = (roomName, terrain, roomObjects) => Promise.all([
            this.addRoom(roomName),
            this.setTerrain(roomName, terrain),
            addRoomObjects(roomName, roomObjects)
        ]);
        const addRoomObjects = (roomName, objects) => Promise.all(
            objects.map(o => this.addRoomObject(roomName, o.type, o.x, o.y, o.attributes))
        );
        // Add rooms
        const rooms = require('../assets/rooms.json');
        await Promise.all(_.map(rooms, (data, roomName) => {
            const terrain = TerrainMatrix.unserialize(data.serial);
// console.log(roomName, data.serial, terrain.serialize())
            return addRoom(roomName, terrain, data.objects);
        }));
    }

    /**
        Get the roomObjects list for requested roomName
    */
    async roomObjects (roomName) {
        const { C, db, env } = await this.load();
        return db['rooms.objects'].find({ room: roomName });
    }

    /**
        Add a new user to the world
    */
    async addBot ({ username, room, x, y, gcl = 1, cpu = 100, cpuAvailable = 10000, active = 10000, spawnName = 'Spawn1', modules = {} }) {
        const { C, db, env, pubsub } = await this.load();
        // Insert user and update data
        const user = await db.users.insert({ username, cpu, cpuAvailable, gcl, active });
        await Promise.all([
            env.set(env.keys.MEMORY + user._id, '{}'),
            db.rooms.update({ _id: room }, { $set: { active: true } }),
            db['users.code'].insert({ user: user._id, branch: 'default', modules, activeWorld: true }),
            db['rooms.objects'].update({ room, type: 'controller' }, { $set: { user: user._id, level: 1, progress: 0, downgradeTime: null, safeMode: 20000 } }),
            db['rooms.objects'].insert({ room, type: 'spawn', x: 25, y: 25, user: user._id, name: spawnName, energy: C.SPAWN_ENERGY_START, energyCapacity: C.SPAWN_ENERGY_CAPACITY, hits: C.SPAWN_HITS, hitsMax: C.SPAWN_HITS, spawning: null, notifyWhenAttacked: true }),
        ]);
        // Subscribe to console notificaiton and return emitter
        return new User(this.server, user).init();
    }
}

module.exports = World;
