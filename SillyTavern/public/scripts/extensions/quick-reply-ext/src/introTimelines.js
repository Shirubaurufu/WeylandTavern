// src/introTimelines.js
//
// Which characters can switch their starting scenario mid-chat (PromptOS "Starting scenario"), and in what order the
// starts run through the story. Pure data plus two small helpers, no SillyTavern imports, so the WeyPhone tests load
// it directly. The part that talks to SillyTavern is the factory in src/introContext.js.
//
// FORWARD ONLY (Fox, 2026-11-16: "Party/Hot Tub -> Doorway/She's Gone -> Nothing"). Every start has a `tier`, its place
// on the character's timeline. A chat can only move to a LATER tier. Starts that share a tier are exclusive alternates
// of the same moment (Belle's party and hot tub, her doorway and "She's gone"), so neither is offered once the other
// is the current one, and everything earlier is greyed out. The order comes from the School Year quick reply
// (QuickReplies/Weyland.json), which already lists each character's later scenarios in timeline order; the tests check
// every character's records against the phrases that quick reply keys on.
//
// A start is found from its scenarios.js record BY CONTENT (`matches`), never by position, so a reordered card still gets
// the right label. Record N pairs with card greeting N, which is how Scenarios() picks one on a fresh chat.
import { BELLE_INTROS, BLAKE_INTROS, belleIntroId, blakeIntroId } from './introSwitch.js';

const has = (record, key) => String(record?.[key] ?? '').trim() !== '';
const text = (record, key) => String(record?.[key] ?? '');

/** @typedef {{id: string, label: string, description: string, tier: number, matches: (record: object) => boolean}} TimelineIntro */

/** @type {Record<string, {intros: TimelineIntro[]}>} */
export const INTRO_TIMELINES = {
    Belle: {
        intros: [
            { id: 'party', tier: 0, ...BELLE_INTROS.party, matches: record => belleIntroId(record) === 'party' },
            { id: 'hottub', tier: 0, ...BELLE_INTROS.hottub, matches: record => belleIntroId(record) === 'hottub' },
            // Lucky, 2026-11-16: she goes missing first, then comes home the same night, so the doorway follows "missing".
            { id: 'gone', tier: 1, ...BELLE_INTROS.gone, matches: record => belleIntroId(record) === 'gone' },
            { id: 'doorway', tier: 2, ...BELLE_INTROS.doorway, matches: record => belleIntroId(record) === 'doorway' },
        ],
    },
    Blake: {
        // Lucky, 2026-11-16: the festival leads straight into the hilltop (same night, a few hours on), so it can follow up.
        intros: [
            { id: 'movein', tier: 0, ...BLAKE_INTROS.movein, matches: record => blakeIntroId(record) === 'movein' },
            { id: 'drunk', tier: 1, ...BLAKE_INTROS.drunk, matches: record => blakeIntroId(record) === 'drunk' },
            { id: 'movie', tier: 2, ...BLAKE_INTROS.movie, matches: record => blakeIntroId(record) === 'movie' },
            { id: 'festival', tier: 3, ...BLAKE_INTROS.festival, matches: record => blakeIntroId(record) === 'festival' },
            { id: 'hilltop', tier: 4, ...BLAKE_INTROS.hilltop, matches: record => blakeIntroId(record) === 'hilltop' },
        ],
    },
    // Serra's three card starts are the School Year chain: a chat with none of its markers is the prequel, "comforted her after
    // she was viciously bullied" is Junior Year, "to live with Serra" is Moving In.
    Serra: {
        intros: [
            { id: 'prequel', tier: 0, label: 'Before you met', description: 'Freshman year. Serra has not met you yet. You walk in on her being bullied at the cafe.', matches: record => /has not yet met/i.test(text(record, 'Scenario')) },
            { id: 'junior', tier: 1, label: 'Junior year', description: 'You comforted her back then and she has a crush on you. Your usual morning at the cafe.', matches: record => /ROLEPLAY STARTING SCENARIO/i.test(text(record, 'Scenario')) },
            { id: 'moving-in', tier: 2, label: 'Moving in', description: 'Dating for three months. You moved out of the dorm to live with her above the cafe.', matches: record => /moved out of their student housing/i.test(text(record, 'Scenario')) },
        ],
    },
    // Spring at the observatory construction site, then Halloween on the way to the Black Barrel (the date order of the greetings).
    'Lyris & Vesper': {
        intros: [
            { id: 'construction', tier: 0, label: 'The construction site', description: 'Spring, outside the observatory construction site. Vesper has an "inspect our equipment" line ready.', matches: record => /Inspect our equipment/i.test(text(record, 'Scenario')) },
            { id: 'halloween', tier: 1, label: 'Halloween', description: 'Halloween night, in Lyris\'s truck on the way to the party at the Black Barrel.', matches: record => /HALLOWEEN AT THE BLACK BARREL/i.test(text(record, 'Scenario')) },
        ],
    },
    Summer: {
        intros: [
            { id: 'selfie', tier: 0, label: 'The selfie', description: 'Freshman year, Biology 101. Summer and the selfie.', matches: record => has(record, 'ConstantScenario') },
            { id: 'cheer', tier: 1, label: 'Cheerleader tryouts', description: 'The morning after she humiliated herself at tryouts in front of Rivera.', matches: record => /cheerleader/i.test(text(record, 'Scenario')) },
            { id: 'festival', tier: 2, label: 'Moonlight Festival', description: 'Sophomore year. She agreed to go with you, in her mother\'s old yukata.', matches: record => /Moonlight Festival/i.test(text(record, 'Scenario')) },
        ],
    },
    Jenn: {
        intros: [
            { id: 'movein', tier: 0, label: 'Move-in day', description: 'Your first day. Jenn lost her room to Kris and is looking for a new one.', matches: record => text(record, 'EarlyStart') === 'true' },
            { id: 'drunk', tier: 1, label: 'Drunken night', description: 'Her first college party. Jenn is drunk, adorable, and crushing on you. Her thoughts are on.', matches: record => text(record, 'SpecialThoughts') === 'true' },
            { id: 'festival', tier: 2, label: 'Moonlight Festival', description: 'Sophomore year, six months into dating. Jenn spent hours getting ready.', matches: record => /Moonlight Festival/i.test(text(record, 'Scenario')) },
        ],
    },
    Nix: {
        intros: [
            { id: 'stood-up', tier: 0, label: 'Stood up', description: 'Kris stood Nix up for their movie date. She is holding her tough exterior together.', matches: record => has(record, 'KrisDate') },
            { id: 'winter', tier: 1, label: 'Winter date', description: 'Months after the breakup. A cold day out, and Nix is a lot happier.', matches: record => /significant emotional growth/i.test(text(record, 'Scenario')) },
        ],
    },
    Willow: {
        intros: [
            { id: 'ant-hill', tier: 0, label: 'The ant hill', description: 'Late at night in the woods, Willow heads back to campus hungry.', matches: record => /ant hill/i.test(text(record, 'Scenario')) },
            { id: 'pastries', tier: 1, label: 'Rustwood pastries', description: 'Your weekly tradition at the Rustwood Cafe. Willow is crushing hard.', matches: record => /ongoing and new tradition/i.test(text(record, 'Scenario')) },
        ],
    },
    Hannah: {
        intros: [
            { id: 'nurse', tier: 0, label: 'The nurse', description: 'Sophomore year. Hannah has been your nurse for four hours after your appendectomy.', matches: record => /appendectomy/i.test(text(record, 'Scenario')) },
            { id: 'breaking', tier: 1, label: 'The Breaking', description: 'Junior year. Hannah, drunk and sobbing at the Black Barrel after a terrible morning.', matches: record => /life-rending/i.test(text(record, 'Scenario')) },
        ],
    },
    Indigo: {
        intros: [
            // Her first scene is "she will ACT LIKE THEY HAVE NEVER MET" (three months in); the library one is February 13th.
            { id: 'lecture', tier: 0, label: 'Calculus lecture', description: 'A Monday morning in the calculus lecture hall. Indigo is playing it cool.', matches: record => /ACT LIKE THEY HAVE NEVER MET/i.test(text(record, 'ConstantScenario')) },
            { id: 'library', tier: 1, label: 'Library meetup', description: 'February 13th at the Weyland library, six months of obsessing in.', matches: record => /February 13th/i.test(text(record, 'ConstantScenario')) },
        ],
    },
    Ellie: {
        intros: [
            { id: 'storm', tier: 0, label: 'Stormy night', description: 'Ellie works a slow night shift in a storm. It is 4 AM.', matches: record => /STORMY NIGHT/i.test(text(record, 'ConstantScenario')) },
            { id: 'japan', tier: 1, label: 'Japan trip', description: 'On the flight to Tokyo with Ellie, who has been quietly crushing on you for months.', matches: record => /Japan trip/i.test(text(record, 'ConstantScenario')) },
        ],
    },
    'Yue-Lin': {
        intros: [
            { id: 'rustwood', tier: 0, label: 'Rustwood encounter', description: 'Sophomore year. Yue-Lin and you at the Rustwood Cafe.', matches: record => /RUSTWOOD ENCOUNTER/i.test(text(record, 'ConstantScenario')) },
            { id: 'infusion', tier: 1, label: 'Infusion date', description: 'A month into a warm, playful relationship. A Sunday morning.', matches: record => /INFUSION/i.test(text(record, 'ConstantScenario')) },
            { id: 'breaking', tier: 2, label: 'The Breaking', description: 'Junior year, April. Back at your shared apartment.', matches: record => has(record, 'YueVisr') },
        ],
    },
    Vera: {
        intros: [
            { id: 'lecture', tier: 0, label: 'Lecture hall', description: 'A Monday afternoon lecture. You and Vera are only just meeting.', matches: record => has(record, 'VeraPost') },
            { id: 'dinner', tier: 1, label: 'Dinner date', description: 'Sophomore year. A dinner date out on Senaka Boulevard.', matches: record => /PUBLIC RELATIONSHIPS/i.test(text(record, 'ConstantScenario')) },
        ],
    },
};

/** The id of the group PromptOS draws for a character ("Yue-Lin" -> "yue-lin-start"; Belle's stays "belle-start"). */
export function timelineGroupId(charName) {
    return `${String(charName).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-start`;
}

/**
 * Which starts a chat may still move to. Only a strictly LATER tier is open; the current start stays selectable (it
 * is a no-op) and an unknown current start (an older chat whose text matches nothing) locks nothing.
 * @param {TimelineIntro[]} intros
 * @param {string} currentId
 * @returns {Map<string, boolean>} id -> locked
 */
export function lockedStarts(intros, currentId) {
    const now = intros.find(intro => intro.id === currentId);
    const locked = new Map();
    for (const intro of intros) locked.set(intro.id, Boolean(now) && intro.id !== now.id && intro.tier <= now.tier);
    return locked;
}

/** The confirmation PromptOS shows before a forward-only switch (Lucky, 2026-11-16): moving forward can't be undone. */
export const FORWARD_CONFIRM_TITLE = 'Move forward in the story?';
export function forwardConfirmText(label) {
    return `<p>Switching to <b>${String(label ?? 'this start').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))}</b> posts its opening as a new message and starts the story from there.</p>`
        + '<p>Once you move forward you can\'t move back. This start and every earlier one get locked in this chat.</p>';
}

/** Whether picking `optionId` in a forward-only group needs the confirmation: any real move, never "Off" or the current start. */
export function needsForwardConfirm(variant, optionId) {
    return Boolean(variant?.forwardOnly) && optionId !== variant.current && optionId !== 'off';
}

/** The note a locked start carries in its description. */
export const LOCKED_NOTE = 'Earlier in the story, so it is locked.';

/**
 * One group's options for PromptOS: the real starts in timeline order, the locked ones flagged `disabled`.
 * @param {TimelineIntro[]} intros only the starts this card actually has a record for
 * @param {string} currentId
 */
export function timelineOptions(intros, currentId) {
    const locked = lockedStarts(intros, currentId);
    return [...intros]
        .sort((a, b) => a.tier - b.tier)
        .map(intro => ({
            id: intro.id,
            label: intro.label,
            description: locked.get(intro.id) ? `${intro.description} ${LOCKED_NOTE}` : intro.description,
            disabled: locked.get(intro.id),
        }));
}
