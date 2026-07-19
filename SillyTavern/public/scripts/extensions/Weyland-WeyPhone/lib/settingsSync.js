// WeyPhone can be open in several browsers at once (desktop, phone over Tailscale, another tab).
// SillyTavern normally saves one complete settings snapshot, so a stale tab can otherwise replace
// a newer WeyPhone wholesale. These helpers describe only the paths changed by the current tab and
// replay those changes onto the newest server copy before it is saved.

const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function cloneValue(value) {
    return value === undefined ? undefined : structuredClone(value);
}

function jsonEqual(left, right) {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) && Array.isArray(right)) {
        return left.length === right.length && left.every((value, index) => jsonEqual(value, right[index]));
    }
    if (isPlainObject(left) && isPlainObject(right)) {
        const leftKeys = Object.keys(left).filter(key => !BLOCKED_KEYS.has(key));
        const rightKeys = Object.keys(right).filter(key => !BLOCKED_KEYS.has(key));
        return leftKeys.length === rightKeys.length
            && leftKeys.every(key => Object.hasOwn(right, key) && jsonEqual(left[key], right[key]));
    }
    return false;
}

/**
 * Produces JSON-safe set/remove operations for everything changed between two local snapshots.
 * Arrays are intentionally atomic. This makes edits, deletes, and reordering deterministic while
 * still allowing unrelated paths (for example a wallpaper and a newly-created DM) to merge.
 */
export function createSettingsPatch(base, current, path = []) {
    if (jsonEqual(base, current)) return [];
    if (isPlainObject(base) && isPlainObject(current)) {
        const operations = [];
        const keys = new Set([...Object.keys(base), ...Object.keys(current)]);
        for (const key of keys) {
            if (BLOCKED_KEYS.has(key)) continue;
            const childPath = [...path, key];
            if (!Object.hasOwn(current, key) || current[key] === undefined) {
                operations.push({ type: 'remove', path: childPath });
            } else if (!Object.hasOwn(base, key)) {
                operations.push({ type: 'set', path: childPath, value: cloneValue(current[key]) });
            } else {
                operations.push(...createSettingsPatch(base[key], current[key], childPath));
            }
        }
        return operations;
    }
    return [{ type: 'set', path: [...path], value: cloneValue(current) }];
}

function ensureParent(root, path) {
    let cursor = root;
    for (const key of path) {
        if (BLOCKED_KEYS.has(key)) throw new Error(`Blocked settings path: ${key}`);
        if (!isPlainObject(cursor[key])) cursor[key] = {};
        cursor = cursor[key];
    }
    return cursor;
}

/** Applies a patch to a clone of the newest server settings, preserving unknown remote fields. */
export function applySettingsPatch(latest, operations) {
    let result = isPlainObject(latest) ? cloneValue(latest) : {};
    for (const operation of operations) {
        if (!Array.isArray(operation?.path) || operation.path.some(key => BLOCKED_KEYS.has(key))) continue;
        if (operation.path.length === 0) {
            result = operation.type === 'remove' ? {} : cloneValue(operation.value);
            continue;
        }
        const parent = ensureParent(result, operation.path.slice(0, -1));
        const key = operation.path.at(-1);
        if (operation.type === 'remove') delete parent[key];
        else parent[key] = cloneValue(operation.value);
    }
    return result;
}

/** Replays only local changes onto a newer remote WeyPhone snapshot. */
export function mergeWeyPhoneSettings(base, local, remote) {
    return applySettingsPatch(remote, createSettingsPatch(base, local));
}

/**
 * A settings refresh reads the server asynchronously. The response is unsafe to apply if this
 * tab changed locally while that read was in flight, or if a save completed and advanced the
 * baseline before the older response returned.
 */
export function settingsChangedDuringRefresh(baselineAtStart, currentBaseline, live) {
    return createSettingsPatch(baselineAtStart, currentBaseline).length > 0
        || createSettingsPatch(currentBaseline, live).length > 0;
}

/** Keeps the live object identity held by existing UI code while replacing its contents. */
export function replaceSettingsInPlace(target, source) {
    if (!isPlainObject(target) || !isPlainObject(source)) return source;
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, cloneValue(source));
    return target;
}

