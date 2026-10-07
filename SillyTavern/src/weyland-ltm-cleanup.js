import fs from 'node:fs';
import path from 'node:path';

const EXTENSION_NAME = 'Weyland-LTM';
const COMPLETION_MARKER = '.weyland-ltm-duplicate-cleanup-v1.done';

function isLtmExtension(directory) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8').replace(/^\uFEFF/, ''));
    return manifest.display_name === EXTENSION_NAME && manifest.js === 'index.js'
        && fs.statSync(path.join(directory, 'index.js')).isFile();
}

/**
 * Retire only the known duplicate in default-user/extensions, after verifying the bundled
 * replacement. A persistent data-root marker makes this a one-time migration, including installs
 * with no duplicate. Failed cleanup stays pending. Memories/lorebooks/settings are untouched.
 */
export function removeDuplicateWeylandLtm({ serverRoot, dataRoot, logger = console }) {
    const marker = path.resolve(dataRoot, COMPLETION_MARKER);
    // Check completion before inspecting either extension. Reinstalling an old copy later
    // deliberately does not rerun this migration once it has succeeded.
    if (fs.existsSync(marker)) return 'completed';
    const duplicate = path.resolve(dataRoot, 'default-user', 'extensions', EXTENSION_NAME);
    try {
        if (!fs.existsSync(duplicate)) {
            fs.writeFileSync(marker, 'completed\n', { flag: 'wx' });
            return 'absent';
        }
        const root = fs.realpathSync(serverRoot);
        const bundled = path.join(root, 'public', 'scripts', 'extensions', EXTENSION_NAME);
        if (!fs.existsSync(bundled) || fs.realpathSync(bundled) !== bundled || !isLtmExtension(bundled)
            || !fs.statSync(path.join(bundled, 'style.css')).isFile()) {
            throw new Error('The bundled Weyland-LTM replacement is missing or invalid.');
        }

        // Verify the final absolute target before recursive removal. Refuse symlinks/junctions
        // anywhere below the configured data root, so cleanup cannot escape into another folder.
        const realDataRoot = fs.realpathSync(path.resolve(dataRoot));
        const expected = path.join(realDataRoot, 'default-user', 'extensions', EXTENSION_NAME);
        if (!fs.lstatSync(duplicate).isDirectory() || fs.lstatSync(duplicate).isSymbolicLink()
            || fs.realpathSync(duplicate) !== expected || !isLtmExtension(duplicate)) {
            throw new Error('The duplicate path is redirected or is not a recognized Weyland-LTM extension.');
        }
        fs.rmSync(expected, { recursive: true, force: true });
        // Mark only after successful removal; no settings.json rewrite or user prompt is needed.
        fs.writeFileSync(marker, 'completed\n', { flag: 'wx' });
        logger.info('[Weyland-LTM] Removed retired duplicate from default-user/extensions.');
        return 'removed';
    } catch (error) {
        logger.warn('[Weyland-LTM] Duplicate extension cleanup skipped:', error.message);
        return 'skipped';
    }
}
