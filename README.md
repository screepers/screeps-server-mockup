# screeps-server-test

## Private server setup for testing

This is a project that runs the Screeps private server one tick at a time, 
this allows you to easily check data in between ticks and opens the
possibilities for testing bots in a fixed, known environment.

# Requirements

* node 6+
* mongodb
* redis

# Usage

1. Install via `npm install screepers/screeps-server-test`
2. Write a test script (See test.js for a sample)
3. Run test script!

NOTE: While the library itself works in node 6, the example.js file requires node 8 or transpiling due to using async/await
