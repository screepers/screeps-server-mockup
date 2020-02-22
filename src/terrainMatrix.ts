import * as _ from 'lodash';

const TYPES = ['plain', 'wall', 'swamp'];

export class Matrix {
    data: {}
    /**
        Constructor
    */
    constructor() {
        this.data = {};
    }

    /**
        Getters
    */
    get(x: number, y: number) {
        return _.get(this.data, `${x}:${y}`, 'plain');
    }

    /**
        Setters
    */
    set(x: number, y: number, value: string) {
        if (TYPES.includes(value)) {
            _.set(this.data, `${x}:${y}`, value);
        } else {
            throw new Error(`invalid value ${value}`);
        }
        return this;
    }

    /**
        Serialize the terrain for database storage
    */
    serialize() {
        let str = '';
        for (let y = 0; y < 50; y += 1) {
            for (let x = 0; x < 50; x += 1) {
                const terrain = this.get(x, y);
                const mask = TYPES.indexOf(terrain);
                if (mask !== -1) {
                    str += mask;
                } else {
                    throw new Error(`invalid terrain type: ${terrain}`);
                }
            }
        }
        return str;
    }

    /**
        Return a string representation of the matrix
    */
    static unserialize(str: string) {
        const matrix = new Matrix();
        _.each(str.split(''), (mask, idx) => {
            const x = idx % 50;
            const y = Math.floor(idx / 50);
            const terrain = _.get(TYPES, mask);
            if (terrain == null) {
                throw new Error(`invalid terrain mask: ${mask}`);
            } else if (terrain !== 'plain') {
                matrix.set(x, y, terrain);
            }
        });
        return matrix;
    }
}
