/**
 * Weyland: "Use 1.1.1.1 for HelixMind".
 *
 * Why this exists: some ISPs (Spectrum most often) block HelixMind at the DNS level, so a user's
 * messages silently fail until they switch their whole device to Cloudflare's 1.1.1.1. That fix
 * works, but asking people to change device DNS reads as shady and many walk away. This does the
 * same thing for HelixMind only, inside Weyland's own server, and nothing else on the device
 * changes.
 *
 * How: every HelixMind call (chat, key checks, usage checks) is made by this Node server, through
 * either node-fetch or Node's built-in fetch. Both resolve hostnames through `dns.lookup`, so one
 * wrapper around it covers every call site, current and future. The wrapper only acts when
 * (a) the hostname is HelixMind's and (b) the user making the request has the setting on; every
 * other lookup goes straight to the original function untouched.
 *
 * Resolution order when on:
 *   1. DNS-over-HTTPS to https://1.1.1.1/dns-query. Addressed by IP, so it needs no lookup of its
 *      own, and it also gets past ISPs that intercept ordinary DNS traffic (which a device-level
 *      DNS change cannot).
 *   2. Plain DNS to 1.1.1.1 / 1.0.0.1, the same thing a device DNS change does.
 *   3. The system's normal lookup, so a network that blocks Cloudflare itself (some schools and
 *      workplaces) is never made worse than having the setting off.
 * Answers are cached for their TTL, capped at 5 minutes.
 *
 * The setting is per user: `extension_settings.weylandNetwork.cloudflareDns` in that user's
 * settings.json. New users get `true` from default/content/settings.json when their settings are
 * first seeded; existing users never have the key and so stay off unless they turn it on. A
 * missing key always means off - there is deliberately no "missing means on" default.
 *
 * This does not change device DNS, does not route traffic through Cloudflare (it is not WARP),
 * and cannot get past router-level or school/workplace filtering of HelixMind's addresses.
 */
import dns from 'node:dns';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { SETTINGS_FILE } from './constants.js';

/** Hostnames the setting applies to (and their subdomains). */
export const HELIX_HOSTS = Object.freeze(['helixmind.online']);
const CLOUDFLARE_DOH = 'https://1.1.1.1/dns-query';
const CLOUDFLARE_SERVERS = ['1.1.1.1', '1.0.0.1'];
const MAX_CACHE_MS = 5 * 60 * 1000;
const DOH_TIMEOUT_MS = 4000;

const requestContext = new AsyncLocalStorage();
const originalLookup = dns.lookup;
/** @type {Map<string, {expires: number, addresses: {address: string, family: number}[]}>} */
const answerCache = new Map();
/** @type {Map<string, {mtimeMs: number, enabled: boolean}>} */
const settingCache = new Map();
let installed = false;
/** Diagnostics for the popup's status line and for tests: how the last HelixMind lookup went. */
const status = { lastLookup: null, lastVia: null, cloudflareLookups: 0, systemFallbacks: 0 };
export function getWeylandDnsStatus() {
    return { ...status };
}

export function isHelixHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return HELIX_HOSTS.some(base => host === base || host.endsWith(`.${base}`));
}

/**
 * Reads a user's setting from their settings.json, re-parsing only when the file changes (the
 * client rewrites it often, and it can be large). Any read/parse problem means "off".
 * @param {string} rootDirectory the user's data root (request.user.directories.root)
 */
export function readCloudflareDnsSetting(rootDirectory) {
    if (!rootDirectory) return false;
    const file = path.join(rootDirectory, SETTINGS_FILE);
    try {
        const { mtimeMs } = fs.statSync(file);
        const cached = settingCache.get(file);
        if (cached && cached.mtimeMs === mtimeMs) return cached.enabled;
        const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
        const enabled = settings?.extension_settings?.weylandNetwork?.cloudflareDns === true;
        settingCache.set(file, { mtimeMs, enabled });
        return enabled;
    } catch {
        return false;
    }
}

async function resolveViaDoh(hostname, family) {
    const types = family === 6 ? ['AAAA'] : family === 4 ? ['A'] : ['A', 'AAAA'];
    const results = [];
    let ttl = MAX_CACHE_MS / 1000;
    for (const type of types) {
        const url = `${CLOUDFLARE_DOH}?name=${encodeURIComponent(hostname)}&type=${type}`;
        const response = await fetch(url, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(DOH_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`DoH HTTP ${response.status}`);
        const body = await response.json();
        if (body.Status !== 0) throw new Error(`DoH status ${body.Status}`);
        for (const answer of body.Answer || []) {
            if (answer.type === 1) results.push({ address: answer.data, family: 4 });
            if (answer.type === 28) results.push({ address: answer.data, family: 6 });
            if (answer.type === 1 || answer.type === 28) ttl = Math.min(ttl, Number(answer.TTL) || ttl);
        }
    }
    if (!results.length) throw new Error('DoH returned no addresses');
    return { addresses: results, ttl };
}

async function resolveViaPlainDns(hostname, family) {
    const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
    resolver.setServers(CLOUDFLARE_SERVERS);
    const results = [];
    if (family !== 6) {
        for (const address of await resolver.resolve4(hostname).catch(() => [])) results.push({ address, family: 4 });
    }
    if (family !== 4) {
        for (const address of await resolver.resolve6(hostname).catch(() => [])) results.push({ address, family: 6 });
    }
    if (!results.length) throw new Error('plain DNS returned no addresses');
    return { addresses: results, ttl: MAX_CACHE_MS / 1000 };
}

/** Cloudflare answer for a HelixMind hostname, or null when both Cloudflare paths fail. */
export async function resolveHelixViaCloudflare(hostname, family = 0) {
    const key = `${hostname}|${family}`;
    const cached = answerCache.get(key);
    if (cached && cached.expires > Date.now()) return cached.addresses;
    for (const attempt of [resolveViaDoh, resolveViaPlainDns]) {
        try {
            const { addresses, ttl } = await attempt(hostname, family);
            answerCache.set(key, { addresses, expires: Date.now() + Math.min(ttl * 1000, MAX_CACHE_MS) });
            return addresses;
        } catch (error) {
            console.debug(`[Weyland DNS] ${attempt.name} failed for ${hostname}: ${error.message}`);
        }
    }
    return null;
}

/** Orders addresses the way the system lookup would, honoring an explicit family request. */
function pickAddresses(addresses, family) {
    const wanted = family === 4 || family === 6 ? addresses.filter(a => a.family === family) : addresses;
    const order = dns.getDefaultResultOrder?.();
    if (order === 'ipv4first') return [...wanted].sort((a, b) => a.family - b.family);
    if (order === 'ipv6first') return [...wanted].sort((a, b) => b.family - a.family);
    return wanted;
}

function weylandLookup(hostname, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    const store = requestContext.getStore();
    if (!store?.cloudflareDns || !isHelixHost(hostname) || typeof callback !== 'function') {
        return originalLookup.call(dns, hostname, options, callback);
    }
    const opts = typeof options === 'number' ? { family: options } : (options || {});
    const family = Number(opts.family) || 0;
    const fallBack = () => {
        status.systemFallbacks++;
        Object.assign(status, { lastLookup: Date.now(), lastVia: 'system' });
        return originalLookup.call(dns, hostname, options, callback);
    };
    resolveHelixViaCloudflare(hostname, family).then(addresses => {
        const picked = addresses ? pickAddresses(addresses, family) : [];
        // Cloudflare unreachable or no usable answer: behave exactly like the setting is off.
        if (!picked.length) return fallBack();
        status.cloudflareLookups++;
        Object.assign(status, { lastLookup: Date.now(), lastVia: 'cloudflare' });
        if (opts.all) return callback(null, picked);
        return callback(null, picked[0].address, picked[0].family);
    }, fallBack);
}

/** Installs the lookup wrapper once per process. Safe to call more than once. */
export function installWeylandDns() {
    if (installed) return;
    installed = true;
    dns.lookup = weylandLookup;
}

/**
 * Express middleware (after setUserDataMiddleware): runs the rest of the request with the user's
 * setting in async context, so lookups made anywhere during that request can see it.
 */
export function weylandDnsMiddleware(request, _response, next) {
    const cloudflareDns = readCloudflareDnsSetting(request.user?.directories?.root);
    requestContext.run({ cloudflareDns }, next);
}

/**
 * GET status for the API panel popup: whether this user has the setting on and how the most
 * recent HelixMind lookup was resolved. Process-wide counters, which on a single-user local
 * install (the normal case) are this user's.
 */
export function weylandDnsStatusHandler(request, response) {
    response.json({
        enabled: readCloudflareDnsSetting(request.user?.directories?.root),
        ...getWeylandDnsStatus(),
    });
}

/** Test hook: run a function as if inside a request with the given setting. */
export function runWithCloudflareDns(enabled, fn) {
    return requestContext.run({ cloudflareDns: Boolean(enabled) }, fn);
}
