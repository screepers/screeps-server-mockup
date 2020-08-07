const stdout = process.stdout.write;
const stderr = process.stderr.write;

module.exports = {
    /*
        Monkey-patch stdout/stderr.write() to remove driver notifications.
    */
    hookWrite() {
        process.stdout.write = function (...args) {
            if (args[0].match(/connecting to storage/i)) {
                return 0;
            }
            return stdout.apply(this, args);
        };
        process.stderr.write = function (...args) {
            // if (args[0].match(/storage connection lost/i)) {
            //     return 0;
            // }
            return stdout.apply(this, args);
        };
    },

    /*
        Reset stdout/stderr.write() to default behavior.
    */
    resetWrite() {
        process.stdout.write = stdout;
        process.stderr.write = stderr;
    },
};
