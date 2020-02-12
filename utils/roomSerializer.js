(function(roomName) {
    let str = '';
    const TYPES = ['plain', 'wall', 'swamp'];
    for (let y = 0; y < 50; y += 1) {
        for (let x = 0; x < 50; x += 1) {
            if (x === 0) { // <-------------------------------------| adjust condition to your needs
                str += TYPES.indexOf('wall'); //                    | in order to wall some exits
            } else {
                const terrain = Game.map.getTerrainAt(x, y, roomName);
                str += TYPES.indexOf(terrain);
            }
        }
    }
    return str;
})('W15S1'); // <---------------------------------------------------| adjust room name to your needs
