export const WEYPHONE_BACKUP_FORMAT = 'weyphone-backup';
export const WEYPHONE_BACKUP_VERSION = 1;
export const MAX_BACKUP_CHARACTERS = 25 * 1024 * 1024;

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function cloneSafeJson(value, depth = 0) {
    if (depth > 100) throw new Error('Backup data is nested too deeply.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('Backup contains an invalid number.');
        return value;
    }
    if (Array.isArray(value)) return value.map(item => cloneSafeJson(item, depth + 1));
    if (!isPlainObject(value)) throw new Error('Backup contains an unsupported value.');

    const clone = {};
    for (const [key, child] of Object.entries(value)) {
        if (BLOCKED_KEYS.has(key)) throw new Error(`Backup contains a blocked key: ${key}`);
        clone[key] = cloneSafeJson(child, depth + 1);
    }
    return clone;
}

export function createWeyPhoneBackup(settings, now = new Date()) {
    if (!isPlainObject(settings)) throw new Error('WeyPhone settings are unavailable.');
    const exportedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
    return {
        format: WEYPHONE_BACKUP_FORMAT,
        version: WEYPHONE_BACKUP_VERSION,
        exportedAt,
        settings: cloneSafeJson(settings),
    };
}

export function parseWeyPhoneBackup(text) {
    if (typeof text !== 'string' || text.length === 0) throw new Error('The backup file is empty.');
    if (text.length > MAX_BACKUP_CHARACTERS) throw new Error('The backup file is larger than 25 MB.');

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error('This is not valid JSON.');
    }
    if (!isPlainObject(parsed) || parsed.format !== WEYPHONE_BACKUP_FORMAT) {
        throw new Error('This is not a WeyPhone backup.');
    }
    if (parsed.version !== WEYPHONE_BACKUP_VERSION) {
        throw new Error(`Unsupported WeyPhone backup version: ${String(parsed.version)}.`);
    }
    if (!isPlainObject(parsed.settings)) throw new Error('The backup does not contain WeyPhone settings.');

    return {
        format: parsed.format,
        version: parsed.version,
        exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
        settings: cloneSafeJson(parsed.settings),
    };
}

/** Replace the live settings object in place so existing UI references remain valid. */
export function restoreWeyPhoneBackup(extensionSettings, importedSettings, moduleName = 'WeyPhone') {
    const fresh = cloneSafeJson(importedSettings);
    const current = extensionSettings[moduleName];
    if (!isPlainObject(current)) {
        extensionSettings[moduleName] = fresh;
        return fresh;
    }
    for (const key of Object.keys(current)) delete current[key];
    Object.assign(current, fresh);
    return current;
}
