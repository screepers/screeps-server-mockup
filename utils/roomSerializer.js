(function(roomName) {
    let str = '';
    for (let y = 0; y < 50; y += 1) {
        for (let x = 0; x < 50; x += 1) {
            const terrain = Game.map.getTerrainAt(x, y, roomName);
            str += ['plain', 'wall', 'swamp'].indexOf(terrain);
        }
    }
    return str;
})('W15S1');
