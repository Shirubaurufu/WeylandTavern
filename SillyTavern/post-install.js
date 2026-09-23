/**
 * Scripts to be done before starting the server for the first time.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import yaml from 'yaml';
import chalk from 'chalk';
import { createRequire } from 'node:module';
import { addMissingConfigValues } from './src/config-init.js';

/**
 * Colorizes console output.
 */
const color = chalk;

/**
 * Converts the old config.conf file to the new config.yaml format.
 */
function convertConfig() {
    if (fs.existsSync('./config.conf')) {
        if (fs.existsSync('./config.yaml')) {
            console.log(color.yellow('Both config.conf and config.yaml exist. Please delete config.conf manually.'));
            return;
        }

        try {
            console.log(color.blue('Converting config.conf to config.yaml. Your old config.conf will be renamed to config.conf.bak'));
            fs.renameSync('./config.conf', './config.conf.cjs'); // Force loading as CommonJS
            const require = createRequire(import.meta.url);
            const config = require(path.join(process.cwd(), './config.conf.cjs'));
            fs.copyFileSync('./config.conf.cjs', './config.conf.bak');
            fs.rmSync('./config.conf.cjs');
            fs.writeFileSync('./config.yaml', yaml.stringify(config));
            console.log(color.green('Conversion successful. Please check your config.yaml and fix it if necessary.'));
        } catch (error) {
            console.error(color.red('FATAL: Config conversion failed. Please check your config.conf file and try again.'), error);
            return;
        }
    }
}

/**
 * Creates the default config files if they don't exist yet.
 */
function createDefaultFiles() {
    /**
     * @typedef DefaultItem
     * @type {object}
     * @property {'file' | 'directory'} type - Whether the item should be copied as a single file or merged into a directory structure.
     * @property {string} defaultPath - The path to the default item (typically in `default/`).
     * @property {string} productionPath - The path to the copied item for production use.
     */

    /** @type {DefaultItem[]} */
    const defaultItems = [
        {
            type: 'file',
            defaultPath: './default/config.yaml',
            productionPath: './config.yaml',
        },
        {
            type: 'directory',
            defaultPath: './default/content/worlds/',
            productionPath: './data/default-user/worlds/',
        },
        {
            type: 'directory',
            defaultPath: './default/content/themes/',
            productionPath: './data/default-user/themes/',
        },
        {
            type: 'file',
            defaultPath: './default/content/themes/Weyland.json',
            productionPath: './data/default-user/themes/Weyland.json',
        },
        {
            type: 'file',
            defaultPath: './default/content/Character.json',
            productionPath: './data/default-user/themes/Character.json',
        },
        {
            type: 'file',
            defaultPath: './default/content/worlds/Weyland.json',
            productionPath: './data/default-user/worlds/Weyland.json',
        },
        {
            type: 'file',
            defaultPath: './default/content/worlds/Weyland Characters.json',
            productionPath: './data/default-user/worlds/Weyland Characters.json',
        },
        {
            type: 'file',
            defaultPath: './default/content/themes/Aesthetica ~ Ratcherito Ver ~.json',
            productionPath: './data/default-user/themes/Aesthetica ~ Ratcherito Ver ~.json',
        },
        {
            type: 'file',
            defaultPath: './default/content/themes/Aesthetica.json',
            productionPath: './data/default-user/themes/Aesthetica.json',
        },
        {
            type: 'file',
            defaultPath: './default/content/settings.json',
            productionPath: './data/default-user/settings.json',
        },
        {
            type: 'directory',
            defaultPath: './default/public/',
            productionPath: './public/',
        },
    ];

    for (const defaultItem of defaultItems) {
        try {
            if (defaultItem.type === 'file') {
                if (defaultItem.productionPath.endsWith('worlds/Weyland.json')) {
                    // Always overwrite Weyland.json
                    fs.copyFileSync(defaultItem.defaultPath, defaultItem.productionPath);
                    console.log(color.green(`Overwritten file: ${defaultItem.productionPath}`));
                } else if (defaultItem.productionPath.endsWith('Weyland Characters.json')) {
                    // Always overwrite Weyland Characters.json
                    fs.copyFileSync(defaultItem.defaultPath, defaultItem.productionPath);
                    console.log(color.green(`Overwritten file: ${defaultItem.productionPath}`));
                } else if (!fs.existsSync(defaultItem.productionPath)) {
                    fs.copyFileSync(
                        defaultItem.defaultPath,
                        defaultItem.productionPath,
                    );
                    console.log(
                        color.green(`Created default file: ${defaultItem.productionPath}`),
                    );
                }
            } else if (defaultItem.type === 'directory') {
                fs.cpSync(defaultItem.defaultPath, defaultItem.productionPath, {
                    force: false, // Don't overwrite existing files!
                    recursive: true,
                });
                console.log(
                    color.green(`Synchronized missing files: ${defaultItem.productionPath}`),
                );
            } else {
                throw new Error(
                    'FATAL: Unexpected default file format in `post-install.js#createDefaultFiles()`.',
                );
            }
        } catch (error) {
            console.error(
                color.red(
                    `FATAL: Could not write default ${defaultItem.type}: ${defaultItem.productionPath}`,
                ),
                error,
            );
        }
    }
}

function removeDeprecatedFiles() {
    const filesToRemove = [
        './data/default-user/worlds/Walled City.json',
        // Retired with Lurkle's Chat Mode and the Storyline Engine. The backend installer
        // archives these too; this covers installs updated by overlaying files manually.
        './data/default-user/QuickReplies/Chat.json',
        './data/default-user/extensions/Weyland-StorylineEngine/README.md',
        './data/default-user/extensions/Weyland-StorylineEngine/index.js',
    ];
    // SillyTavern still "discovers" an empty extension folder and 404s on its manifest.
    const foldersToRemoveIfEmpty = [
        './data/default-user/extensions/Weyland-StorylineEngine',
    ];

    for (const filePath of filesToRemove) {
        try {
            if (fs.existsSync(filePath)) {
                fs.rmSync(filePath);
            }
        } catch (error) {
            console.error(color.red(`FATAL: Could not remove file: ${filePath}`), error);
        }
    }

    for (const folderPath of foldersToRemoveIfEmpty) {
        try {
            if (fs.existsSync(folderPath) && fs.readdirSync(folderPath).length === 0) {
                fs.rmdirSync(folderPath);
            }
        } catch (error) {
            console.error(color.red(`FATAL: Could not remove folder: ${folderPath}`), error);
        }
    }
}

/** Register Sam's World Info tag without replacing anyone's settings. */
function ensureSamTag(filePath) {
    if (!fs.existsSync(filePath)) return;
    const original = fs.readFileSync(filePath, 'utf8');
    const settings = JSON.parse(original);
    if (!Array.isArray(settings.tags) || settings.tags.some(tag => tag.id === '3b530486-b7fa-40c3-83b5-6a243dd0b289')) return;

    const tag = {
        id: '3b530486-b7fa-40c3-83b5-6a243dd0b289',
        name: 'Sam',
        folder_type: 'NONE',
        filter_state: 'UNDEFINED',
        sort_order: null,
        is_hidden_on_character_card: false,
        color: '',
        color2: '',
        create_date: 1790175160893,
    };
    const matches = [...original.matchAll(/"tags"\s*:\s*\[/g)];
    if (matches.length !== 1) throw new Error(`Could not safely locate tags in ${filePath}`);
    const insertionPoint = matches[0].index + matches[0][0].length;
    const updated = original.slice(0, insertionPoint)
        + JSON.stringify(tag) + (settings.tags.length ? ',' : '')
        + original.slice(insertionPoint);
    JSON.parse(updated);
    fs.copyFileSync(filePath, `${filePath}.pre-sam-tag.bak`, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(filePath, updated);
    console.log(color.green(`Registered Sam tag in ${filePath}`));
}

/**
 * "Use 1.1.1.1 for HelixMind" (src/weyland-dns.js) is on for NEW users only. New users' settings
 * are seeded once from default/content/settings.json, so the key goes there and nowhere else:
 * existing users' own settings.json is deliberately never touched, and a missing key means off.
 * Inserted as text right after "extension_settings": { so the rest of the file is left exactly
 * as it was; skipped if the key is already present.
 */
function ensureCloudflareDnsDefault(filePath) {
    if (!fs.existsSync(filePath)) return;
    const original = fs.readFileSync(filePath, 'utf8');
    const settings = JSON.parse(original);
    if (!settings.extension_settings || typeof settings.extension_settings !== 'object') return;
    if (settings.extension_settings.weylandNetwork) return;
    const matches = [...original.matchAll(/"extension_settings"\s*:\s*\{/g)];
    if (matches.length !== 1) throw new Error(`Could not safely locate extension_settings in ${filePath}`);
    const insertionPoint = matches[0].index + matches[0][0].length;
    const hasOtherKeys = Object.keys(settings.extension_settings).length > 0;
    const updated = original.slice(0, insertionPoint)
        + '"weylandNetwork":{"cloudflareDns":true}' + (hasOtherKeys ? ',' : '')
        + original.slice(insertionPoint);
    if (JSON.parse(updated).extension_settings?.weylandNetwork?.cloudflareDns !== true) throw new Error('weylandNetwork insert check failed');
    fs.writeFileSync(filePath, updated);
    console.log(color.green(`Enabled 1.1.1.1 for HelixMind by default for new users in ${filePath}`));
}

/**
 * Runs one additive settings patch in isolation. These run inside the main try below, and an
 * uncaught throw there would silently skip every later step (config values, deprecated-file
 * cleanup), so a patch that cannot apply safely is reported and skipped instead.
 */
function runSettingsPatch(label, fn) {
    try {
        fn();
    } catch (error) {
        console.error(color.red(`Skipped settings patch (${label}): ${error.message}`));
    }
}

try {
    // 0. Convert config.conf to config.yaml
    convertConfig();
    // Patch the new-user defaults BEFORE createDefaultFiles: on a brand-new install that step
    // copies default/content/settings.json into the first user's settings.json, and that user
    // should start with 1.1.1.1 on like every other new user. Existing users' files already exist
    // and are never overwritten, so they keep it off.
    runSettingsPatch('1.1.1.1 default for new users', () => ensureCloudflareDnsDefault('./default/content/settings.json'));
    // 1. Create default config files
    createDefaultFiles();
    runSettingsPatch('Sam tag, defaults', () => ensureSamTag('./default/content/settings.json'));
    runSettingsPatch('Sam tag, default user', () => ensureSamTag('./data/default-user/settings.json'));
    // 2. Add missing config values
    addMissingConfigValues(path.join(process.cwd(), './config.yaml'));
    removeDeprecatedFiles();
} catch (error) {
    console.error(error);
}
