const stdout = process.stdout.write;
const stderr = process.stderr.write;

module.exports = {
    /*
        Hook stdout/stderr.write() and remove driver notifications.
    */
    hookStdWrite: function() {
        process.stdout.write = function(str) {
            if (str.match(/connecting to storage/i)) return;
            else return stdout.apply(this, arguments);
        };
        process.stderr.write = function(str) {
            if (str.match(/storage connection lost/i)) return;
            else return stdout.apply(this, arguments);
        };
    },

    /*
        Reset stdout/stderr.write() to default behavior.
    */
    resetStdWrite: function() {
        process.stdout.write = stdout;
        process.stderr.write = stderr;
    },
}
