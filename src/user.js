const { EventEmitter } = require('events');
const _ = require('lodash');

class User extends EventEmitter {
    /**
        Constructor
    */
    constructor(server, data) {
        super();
        this._id = data._id;
        this._username = data.username;
        this._server = server;
        this.knownNotifications = [];
    }

    /**
        Getters
    */
    get id() {
        return this._id;
    }
    get username() {
        return this._username;
    }
    get cpu() {
        return this.getData('cpu');
    }
    get cpuAvailable() {
        return this.getData('cpuAvailable');
    }
    get gcl() {
        return this.getData('gcl');
    }
    get rooms() {
        return this.getData('rooms');
    }
    get lastUsedCpu() {
        return this.getData('lastUsedCpu');
    }
    get memory() {
        const { env } = this._server.common.storage;
        return env.get(env.keys.MEMORY + this.id);
    }
    get notifications() {
        const { db } = this._server.common.storage;
        return db['users.notifications'].find({ user: this.id }).then((list) => { // eslint-disable-line arrow-body-style
            return list.map(({ message, type, date, count, _id }) => {
                this.knownNotifications.push(_id);
                return { message, type, date, count, _id };
            });
        });
    }
    get newNotifications() {
        const known = _.clone(this.knownNotifications);
        return this.notifications.then(list => list.filter(notif => !known.includes(notif._id)));
    }
    get activeSegments() {
        return this.getData('activeSegments');
    }

    /**
        Return the content of user segments based on @list (the list of segments, ie: [0, 1, 2]).
    */
    async getSegments(list) {
        const { env } = this._server.common.storage;
        return env.hmget(env.keys.MEMORY_SEGMENTS + this._id, list);
    }

    /**
        Set a new console command to run next tick
    */
    async console(cmd) {
        const { db } = this._server.common.storage;
        return db['users.console'].insert({ user: this._id, expression: cmd, hidden: false });
    }

    /**
        Return the current value of the requested user data
    */
    async getData(name) {
        const { db } = this._server.common.storage;
        const data = await db.users.find({ _id: this._id });
        return _.get(_.first(data), name);
    }

    /**
        Initialise console events
    */
    async init() {
        const { pubsub } = this._server.common.storage;
        await pubsub.subscribe(`user:${this._id}/console`, (event) => {
            const { messages } = JSON.parse(event);
            const { log = [], results = [] } = messages || {};
            this.emit('console', log, results, this._id, this.username);
        });
        return this;
    }
}

module.exports = User;
