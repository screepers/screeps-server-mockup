const stdout = process.stdout.write;
const stderr = process.stderr.write;

module.exports = {
  /*
        Hook stdout/stderr.write() and remove driver notifications.
    */
  hookStdWrite() {
    process.stdout.write = function (...args) {
      if (args[0].match(/connecting to storage/i)) {
        return 0;
      }
      return stdout.apply(this, args);
    };
    process.stderr.write = function (...args) {
      if (args[0].match(/storage connection lost/i)) {
        return 0;
      }
      return stdout.apply(this, args);
    };
  },

  /*
        Reset stdout/stderr.write() to default behavior.
    */
  resetStdWrite() {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
  },
};
