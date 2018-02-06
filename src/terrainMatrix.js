const _ = require('lodash');
const Promise = require('bluebird');

const TYPES = ['plain', 'wall', 'swamp'];

class Matrix {
    /**
        Constructor
    */
    constructor(server) {
        this.data = {};
    }

    /**
        Getters
    */
    get (x, y) {
        return _.get(this.data, `${x}:${y}`, 'plain');
    }

    /**
        Setters
    */
    set (x, y, value) {
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
    serialize () {
        let str = ''
        for (let x = 0; x < 50; x += 1) {
            for (let y = 0; y < 50; y += 1) {
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
    static unserialize (str) {
        const matrix = new Matrix();
        _.each(str.split(''), (mask, idx) => {
            const x = idx % 50;
            const y = Math.floor(idx / 50);
            const terrain = _.get(TYPES, mask);
            if (terrain != null) {
                _.set(matrix.data, `${x}:${y}`, terrain);
            } else {
                throw new Error(`invalid terrain mask: ${mask}`);
            }
        });
        return matrix;
    }
}

module.exports = Matrix;
