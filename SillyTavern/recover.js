import process from 'node:process';
import { setConfigFilePath } from './src/util.js';

const userAccount = process.argv[2];
const userPassword = process.argv[3];
const configPath = './config.yaml';

if (!userAccount) {
    process.exit(1);
}

async function main() {
    setConfigFilePath(configPath);
    const { recoverPassword } = await import('./src/recover-password.js');
    await recoverPassword(configPath, userAccount, userPassword);
}

main();
