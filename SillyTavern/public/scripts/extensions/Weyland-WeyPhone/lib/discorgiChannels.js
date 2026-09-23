/**
 * The real public Discorgi channel directory. This is deliberately an allowlist: both the
 * generator and the in-app directory consume this same data, so a made-up or intentionally
 * omitted channel cannot drift into one side without being explicitly added here.
 * `description` is prompt text (written for the model, so it can be blunt); `blurb` is the short
 * user-facing line shown on Discorgi's channel settings screen.
 */
export const DISCORGI_CHANNELS = Object.freeze([
    Object.freeze({
        name: '#student-art-guild',
        description: 'The busiest art channel: members share traditional art, digital art, and AI-generated art. Keep posts SFW or mildly suggestive, never explicit.',
        blurb: 'Traditional, digital and AI art sharing. SFW.',
    }),
    Object.freeze({
        name: '#nsfw-lounge',
        description: 'An adults-only channel for nude or explicit image generations, steamy roleplay talk, and candid discussion of smutty scenes. Explicit sexual language is welcome; speakers may naturally say pussy, cunt, fuck, and similar words.',
        blurb: 'Adults only: explicit art and steamy roleplay talk.',
    }),
    Object.freeze({
        name: '#dorm-commons',
        description: 'Everyday dorm conversation: plans, food, classes, complaints, jokes, and casual chatter.',
        blurb: 'Everyday dorm chatter: plans, food, classes, complaints.',
    }),
    Object.freeze({
        name: '#black-barrel-bar',
        description: 'Short Weyland-adjacent discussions and memes. Suggestive or NSFW-adjacent is fine, but no nudity or outright smut: if friends could discuss it over drinks at a bar, it belongs here.',
        blurb: 'Memes and bar-talk. Suggestive at most.',
    }),
    Object.freeze({
        name: '#weyland-lore-chat',
        description: 'Meta questions and discussions about Weyland characters and world lore. If selected, include @luckypaww answering at least one oddly specific or inane lore question.',
        blurb: 'Lore questions, with the occasional @luckypaww answer.',
    }),
    Object.freeze({
        name: '#paw-patrol-chat',
        description: 'A quieter, heartfelt safe place for cat pictures, personal venting, reassurance, and sincere check-ins.',
        blurb: 'Cat pictures, venting and sincere check-ins.',
    }),
    Object.freeze({
        name: '#cairos-esports-cafe',
        description: 'Gaming talk: matches, builds, competitive salt, co-op plans, esports, and new releases.',
        blurb: 'Gaming, matches, builds and esports.',
    }),
    Object.freeze({
        name: '#mikas-music-studio',
        description: 'Music discussion: practice, instruments, production, performances, playlists, and song recommendations.',
        blurb: 'Music, instruments, production and playlists.',
    }),
    Object.freeze({
        name: '#fur-hall',
        description: 'Furry art, fursonas, suits, characters, events, and community chatter.',
        blurb: 'Furry art, fursonas, suits and events.',
    }),
]);

function boundedRandom(randomFn) {
    const value = Number(randomFn());
    if (!Number.isFinite(value)) return 0;
    return Math.min(0.999999999999, Math.max(0, value));
}

/**
 * The channels a Sync may roll from: the directory minus whatever the user switched off in
 * Discorgi's settings. Stored as an EXCLUSION list on purpose, so a channel added to the directory
 * later joins everyone's rotation automatically instead of being silently missing from every saved
 * pool. Unknown names are ignored, and an exclusion list that would leave nothing falls back to the
 * whole directory - a Sync must always have somewhere to post.
 * @param {string[]} [excludedNames]
 * @returns {Array<{name: string, description: string, blurb: string}>}
 */
export function allowedDiscorgiChannels(excludedNames = []) {
    const excluded = new Set(Array.isArray(excludedNames) ? excludedNames : []);
    const allowed = DISCORGI_CHANNELS.filter(channel => !excluded.has(channel.name));
    return allowed.length ? allowed : [...DISCORGI_CHANNELS];
}

/**
 * Selects one or two distinct channels for a single Sync, from the user's allowed pool (see
 * allowedDiscorgiChannels). A pool of one always yields that one channel. Fisher-Yates makes this
 * deterministic when tests inject a seeded/random stub and avoids retry loops when that stub
 * returns a constant.
 * @param {() => number} [randomFn]
 * @param {string[]} [excludedNames] channels the user turned off in Discorgi settings
 * @returns {Array<{name: string, description: string}>}
 */
export function selectDiscorgiChannels(randomFn = Math.random, excludedNames = []) {
    const random = typeof randomFn === 'function' ? randomFn : Math.random;
    const pool = allowedDiscorgiChannels(excludedNames);
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(boundedRandom(random) * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const count = boundedRandom(random) < 0.5 ? 1 : 2;
    return pool.slice(0, count);
}
