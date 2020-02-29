/* eslint lines-between-class-members: "off" */

import { EventEmitter } from 'events';
import * as _ from 'lodash';
import { ScreepsServer } from './screepsServer';

type Notification = { message: string; type: string; date: number; count: number; _id: string }

export default class User extends EventEmitter {
    private knownNotifications: string[];
    private _id: string;
    private _username: string;
    private _server: ScreepsServer;

    /**
        Constructor
    */
    constructor(server: ScreepsServer, data: {_id: string; username: string}) {
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
    get cpu(): Promise<number> {
        return this.getData('cpu');
    }
    get cpuAvailable(): Promise<number> {
        return this.getData('cpuAvailable');
    }
    get gcl(): Promise<number> {
        return this.getData('gcl');
    }
    get rooms() {
        return this.getData('rooms');
    }
    get lastUsedCpu(): Promise<number> {
        return this.getData('lastUsedCpu');
    }
    get memory(): Promise<string> {
        const { env } = this._server.common.storage;
        return env.get(env.keys.MEMORY + this.id);
    }
    get notifications(): Promise<Notification[]> {
        const { db } = this._server.common.storage;
        return db['users.notifications']
            .find({ user: this.id })
            .then((list: any[]) => list.map(({ message, type, date, count, _id }) => {
                this.knownNotifications.push(_id);
                return { message, type, date, count, _id };
            }));
    }
    get newNotifications() {
        const known = _.clone(this.knownNotifications);
        return this.notifications.then(
            (list) => list.filter((notif) => !known.includes(notif._id))
        );
    }
    get activeSegments(): Promise<number[]> {
        return this.getData('activeSegments');
    }

    /**
        Return the content of user segments based on @list (the list of segments, ie: [0, 1, 2]).
    */
    async getSegments(list: number[]): Promise<any[]> {
        const { env } = this._server.common.storage;
        return env.hmget(env.keys.MEMORY_SEGMENTS + this._id, list);
    }

    /**
        Set a new console command to run next tick
    */
    async console(cmd: string) {
        const { db } = this._server.common.storage;
        return db['users.console'].insert({ user: this._id, expression: cmd, hidden: false });
    }

    /**
        Return the current value of the requested user data
    */
    async getData(name: string) {
        const { db } = this._server.common.storage;
        const data = await db.users.find({ _id: this._id });
        return _.get(_.first(data), name);
    }

    /**
        Initialise console events
    */
    async init() {
        const { pubsub } = this._server.common.storage;
        await pubsub.subscribe(`user:${this._id}/console`, (event: any) => {
            const { messages } = JSON.parse(event);
            const { log = [], results = [] } = messages || {};
            this.emit('console', log, results, this._id, this.username);
        });
        return this;
    }
}
