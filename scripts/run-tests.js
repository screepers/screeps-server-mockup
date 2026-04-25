const { spawnSync } = require('child_process');

const EXPECTED_NODE_MAJOR = 24;

function run(command, args) {
    const result = spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) {
        if (result.error.code === 'ENOENT') {
            return null;
        }
        throw result.error;
    }
    return result.status === null ? 1 : result.status;
}

const major = Number(process.versions.node.split('.')[0]);

if (major !== EXPECTED_NODE_MAJOR) {
    const status = run('mise', ['exec', `node@${EXPECTED_NODE_MAJOR}`, '--', 'npm', 'run', 'test:inner']);
    if (status === null) {
        console.error(
            `npm test requires Node ${EXPECTED_NODE_MAJOR}. Current runtime: ${process.version}. `
            + `Switch to Node ${EXPECTED_NODE_MAJOR} or run \`mise exec node@${EXPECTED_NODE_MAJOR} -- npm test\`.`,
        );
        process.exit(1);
    }
    process.exit(status);
}

process.exit(run('npm', ['run', 'test:inner']));