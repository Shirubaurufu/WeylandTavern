import fetch from 'node-fetch';

const ROOT = 'https://registrar.weybooru.com';
const ROUTES = { character: 'data', location: 'loci', collection: 'coll' };
let cached;
let pending;

export function itemKey(item) {
    return `${item.kind}:${item.id}`;
}

export function parseList(value) {
    if (Array.isArray(value)) return value;
    try { const result = JSON.parse(value || '[]'); return Array.isArray(result) ? result : []; }
    catch { return []; }
}

export function decode(value) {
    try { return decodeURIComponent(value || ''); } catch { return String(value || ''); }
}

export function normalizeCatalog(parts) {
    return Object.entries(ROUTES).flatMap(([kind]) => (parts[kind] || [])
        .filter(row => row && !row.deletedAt && (row.status === 'public' || (kind === 'character' && row.status === 'wip')) && Number.isSafeInteger(Number(row[`${kind}Id`])) && row.name)
        .map(row => ({ ...row, kind, id: Number(row[`${kind}Id`]) })));
}

/** Only these three fixed public GET endpoints are reachable. No user URLs, cookies or keys. */
export async function getCatalog() {
    if (cached && Date.now() - cached.time < 5 * 60_000) return cached.items;
    if (pending) return pending;
    pending = (async () => {
        const parts = await Promise.all(Object.entries(ROUTES).map(async ([kind, route]) => {
            const response = await fetch(`${ROOT}/${route}/list`, {
                signal: AbortSignal.timeout(20_000), size: 20 * 1024 * 1024,
                redirect: 'error', headers: { Accept: 'application/json' },
            });
            if (!response.ok) throw new Error('The Registrar is unavailable. Please try again shortly.');
            const rows = await response.json();
            if (!Array.isArray(rows)) throw new Error('The Registrar returned an unexpected catalog.');
            return [kind, rows];
        }));
        const items = normalizeCatalog(Object.fromEntries(parts));
        cached = { items, time: Date.now() };
        return items;
    })();
    try { return await pending; } finally { pending = null; }
}

function searchFields(item) {
    const f = Object.fromEntries(Object.entries(item).filter(([, v]) => typeof v === 'string').map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]));
    Object.assign(f, {
        type: item.kind, owner: String(item.ownerName || '').toLowerCase(),
        name: `${item.name} ${item.surname || ''}`.toLowerCase(), handle: item.onlineHandle || '',
        age: String(item.baseAge || ''), year: String(item.schoolYear || '').slice(3) || '0',
        tokens: Number(item.tokens) > 2000 ? 'high' : Number(item.tokens) > 1000 ? 'medium' : 'low',
    });
    f.home = [f.dwelling, f.bathroomneighbours, f.room].join(' ');
    f.background = [f.backgroundkeywords, f.knownbackground, f.backgroundfriends, f.hiddenbackground].join(' ');
    f.behavior = [f.personality, f.speech, f.quirks, f.likes, f.dislikes, f.sexuality, f.relationships].join(' ');
    f.outfits = [f.outfitentries, f.casualoutfit, f.nightoutfit, f.chillingoutfit, f.winteroutfit, f.underwearoutfit].join(' ');
    f.master = Object.values(f).join(' ');
    return f;
}

/** Registrar's documented AND / OR / field / negation search, without executing regex input. */
export function matchesFilter(item, query, now = Date.now()) {
    const f = searchFields(item);
    const terms = String(query).match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return terms.every(raw => {
        const match = raw.match(/^(\w+):(!?)(.*)$/);
        const field = match ? match[1].toLowerCase() : 'master';
        const negate = match?.[2] === '!';
        const value = (match ? match[3] : raw).replace(/"/g, '').toLowerCase();
        const choices = value.split('|');
        let found;
        if (field === 'update') {
            found = choices.some(choice => {
                const m = choice.match(/^(\d+(?:\.\d+)?)(years?|yr|y|months?|mo|m|weeks?|wk|w|days?|d|hours?|hr|h|minutes?|min|mi|seconds?|sec|s)$/);
                if (!m) throw new Error('This collection has an unsupported date filter. Open it on the Registrar website.');
                const unit = m[2];
                const seconds = /^y/.test(unit) ? 31536000 : /^(m|mo|month|months)$/.test(unit) ? 2592000 : /^w/.test(unit) ? 604800 : /^d/.test(unit) ? 86400 : /^h/.test(unit) ? 3600 : /^m/.test(unit) ? 60 : 1;
                return new Date(item.updatedAt).getTime() > now - Number(m[1]) * seconds * 1000;
            });
        } else if (/^(expressions|clothedexpressions|underwearexpressions|nudeexpressions)$/.test(field)) {
            const counts = ['Clothed', 'Underwear', 'Nude'].map(type => parseList(item[`expressions${type}`]).length);
            const count = field === 'expressions' ? counts.reduce((a, b) => a + b, 0) : counts[['clothedexpressions', 'underwearexpressions', 'nudeexpressions'].indexOf(field)];
            found = count > Number(value);
        } else {
            // Unknown fields must not silently turn a narrow collection into the whole catalog.
            if (!(field in f)) return false;
            found = choices.some(choice => String(f[field]).toLowerCase().includes(choice));
        }
        return negate ? !found : found;
    });
}

export function collectionMembers(collection, catalog) {
    const selected = new Set(parseList(decode(collection.selectedCharacters)).map(String));
    const excluded = new Set(parseList(decode(collection.deselectedCharacters)).map(String));
    const filter = decode(collection.filter);
    return catalog.filter(item => {
        if (item.kind === 'collection') return false;
        const id = item.kind === 'location' ? `L${item.id}` : String(item.id);
        const included = collection.selectionMode === 'Static' ? selected.has(id) : !excluded.has(id);
        return included && matchesFilter(item, filter);
    });
}

export function publicItem(item, catalog = []) {
    const members = item.kind === 'collection' ? collectionMembers(item, catalog).map(itemKey) : undefined;
    return {
        key: itemKey(item), kind: item.kind, id: item.id, name: item.name, surname: item.surname || '',
        status: item.status,
        gender: item.gender || '',
        summary: item.summary || '', owner: item.ownerName || '', portrait: item.portrait || '',
        updatedAt: item.updatedAt, tokens: Number(item.tokens) || 0, tags: parseList(item.tags),
        species: item.species || '', major: item.major || '', age: item.baseAge || '', members,
        details: item.kind === 'character'
            ? { Personality: item.personality, Appearance: item.appearance, 'Communication style': item.speech, Relationships: item.relationships, Home: item.dwelling }
            : item.kind === 'location' ? { Description: item.description, Denizens: item.denizens, Events: item.events,
                'Sub-locations': parseList(item.subLocations).map(s => `${s.name}: ${s.description}`).join('\n\n') } : {},
    };
}
