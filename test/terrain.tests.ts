import * as assert from 'assert';
import {Matrix} from '../src/terrainMatrix';

suite('TerrainMatrix tests', () => {
    test('Setting and getting values', async () => {
        // Define matrix
        const matrix = new Matrix();
        matrix.set(0, 1, 'wall');
        matrix.set(0, 1, 'swamp');
        matrix.set(0, 2, 'wall');
        // Test it
        assert.strictEqual(matrix.get(0, 0), 'plain');
        assert.strictEqual(matrix.get(0, 1), 'swamp');
        assert.strictEqual(matrix.get(0, 2), 'wall');
        assert.strictEqual(matrix.get(0, 3), 'plain');
    });

    test('Serializing and unserializing', async () => {
        // Define matrix
        let matrix = new Matrix();
        matrix.set(1, 0, 'swamp');
        matrix.set(2, 0, 'wall');
        // Test serialization
        const terrain: number[] = Array(50 * 50).fill(0);
        terrain[1] = 2;
        terrain[2] = 1;
        const serial = terrain.join('');
        assert.strictEqual(matrix.serialize(), serial);
        // Test unserialization
        matrix = Matrix.unserialize(serial);
        assert.strictEqual(matrix.get(0, 0), 'plain');
        assert.strictEqual(matrix.get(1, 0), 'swamp');
        assert.strictEqual(matrix.get(2, 0), 'wall');
        assert.strictEqual(matrix.get(3, 0), 'plain');
    });
});
