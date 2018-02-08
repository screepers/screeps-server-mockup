/* eslint prefer-arrow-callback: "off", global-require: "off", import/no-dynamic-require: "off" */

const { TerrainMatrix } = require('../');
const assert = require('assert');
const _ = require('lodash');

suite('TerrainMatrix tests', function () {
    test('Setting and getting values', async function () {
        // Define matrix
        const matrix = new TerrainMatrix();
        matrix.set(0, 1, 'wall');
        matrix.set(0, 1, 'swamp');
        matrix.set(0, 2, 'wall');
        // Test it
        assert.equal(matrix.get(0, 0), 'plain');
        assert.equal(matrix.get(0, 1), 'swamp');
        assert.equal(matrix.get(0, 2), 'wall');
        assert.equal(matrix.get(0, 3), 'plain');
    });

    test('Serializing and unserializing', async function () {
        // Define matrix
        let matrix = new TerrainMatrix();
        matrix.set(1, 0, 'swamp');
        matrix.set(2, 0, 'wall');
        // Test serialization
        let serial = Array(50 * 50).fill(0);
        serial[1] = 2;
        serial[2] = 1;
        serial = serial.join('');
        assert.equal(matrix.serialize(), serial);
        // Test unserialization
        matrix = TerrainMatrix.unserialize(serial);
        assert.equal(matrix.get(0, 0), 'plain');
        assert.equal(matrix.get(1, 0), 'swamp');
        assert.equal(matrix.get(2, 0), 'wall');
        assert.equal(matrix.get(3, 0), 'plain');
    });
});
