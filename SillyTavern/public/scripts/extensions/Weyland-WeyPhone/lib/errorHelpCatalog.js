// PromptOS -> Home -> Error Message Information. The copy lives here, apart from the renderer, so
// a card can be read and edited as plain writing.
//
// Copy rules (Lucky, 2026-10-09). Write like the Gemini Filter Guide: a friend from the support
// channel explaining it to a 20-something who isn't technical. Short paragraphs with one idea each,
// contractions, no em dashes, no stock AI cadence, and no advice nobody needs ("don't paste your
// API key here"). Two things matter most:
//   - Filters are the filter's problem. Weyland's characters carry real weight (grief, addiction,
//     trauma) on purpose, and a refusal says nothing bad about the player or their roleplay. When a
//     card asks them to test a tame chat, it says plainly that it's only a test.
//   - Cards never end in "contact support". Support is three people, and a support line lets a
//     big share of readers skip every step above it. The only mentions are true bugs a player
//     can't fix themselves (a button asking for a model that doesn't exist).
//
// Fields: `example` is what the player saw (real wording only, so they can match it). `route`
// shows where along You -> internet -> HelixMind -> model a problem usually is: a number 0-3, or
// [level, label] for a custom label. `match` / `specificMatch` / `aliases` are search plumbing and
// never shown. Paragraph lists (explanation, step text, note) may include `{ visual: name }`
// to place a picture there; the names are defined in errorHelp.js. `actions` are buttons: home (PromptOS Home), gemini (the filter guide), dns (the
// DNS Routing popup), registrar (the Registrar app).
import { COMMUNITY_MODEL_LIMIT_ARTICLE, COMMUNITY_MODEL_LIMIT_TITLE, COMMUNITY_MODEL_LIMIT_BODY } from '../../../weyland-error-notice.js';

const step = (title, text) => ({ title, text });
const warpDocs = ['Cloudflare: the WARP app and its modes', 'https://developers.cloudflare.com/warp-client/warp-modes/'];

export const ERROR_HELP_CARDS = [
    // --- Replies ---------------------------------------------------------------------------------
    {
        id: 'interrupted', group: 'Replies', title: 'Message Interrupted',
        summary: 'A blank reply, or one that stops partway through.',
        aliases: ['blank message', 'empty response', 'empty reply', 'cut off', 'analysis interrupted', 'reasoning', 'nothing came back', 'mobile data', 'spotty connection', 'bad signal'],
        match: /message interrupted|blank (?:message|reply)|empty (?:response|reply)/i,
        example: 'Message Interrupted\nThe AI was mid-analysis when it was interrupted, either by a content filter, API issue or your ISP.',
        explanation: [
            'The reply got stopped before it was finished.',
            'A few different things can do that. A content filter can cut the AI off, the API can hiccup, or your internet provider can drop the connection.',
            "The message can't tell which one it was, so the steps below go one at a time, starting with the easiest.",
            "If you're on mobile data or shaky Wi-Fi, keep that in mind the whole way through. A dropped connection looks exactly like a filter here, and the first step explains why.",
        ],
        route: { net: 1, helix: 1, model: [2, 'often, a filter'] },
        steps: [
            // First since 2026-10-17 (Lucky: check what they're on before asking them to change anything).
            // Players kept blaming filters for what turned out to be their signal. WeyTav's server cancels the
            // model request when the browser's connection closes (chat-completions.js, request.socket 'close'
            // -> controller.abort()), so a short drop is enough.
            step('On mobile data or spotty Wi-Fi? Try a steadier connection', [
                "This one fools a lot of people, because it looks exactly like a filter. If your connection drops while a reply is on its way, even for a couple of seconds, WeyTav stops waiting for it, and you get a blank or a half-finished message.",
                "It's about the device you're chatting on, not just the computer running WeyTav. A phone on patchy mobile data can cut replies off even when the computer's internet is perfect.",
                'Switch to Wi-Fi, or somewhere with better signal, and reroll. If it suddenly works, that was it.',
            ]),
            step('Reroll once', 'Plenty of interruptions are one-offs. Give it another go before you change anything.'),
            step('Using Gemini? Turn on Gemini Bypass', [
                "It's on PromptOS Home. Switch it on and reroll.",
                'If you got a message about "sensitive words" instead of a blank reply, that\'s a different filter. The Gemini Filter Guide covers that one.',
            ]),
            step('Turn Analysis off and reroll', [
                "Analysis is the planning the AI does before it writes your reply. Its switch is on PromptOS Home too.",
                'With it off, there\'s less for a filter or a shaky connection to interrupt. Once replies are working again, you can turn it back on and see if it holds.',
            ]),
            step('Let a different model take a turn', "Switch to another model and reroll. If it answers fine, the first model's filter was probably the problem. Let the new one write a message or two, then switch back."),
            step('Check your connection', [
                'If every model fails the same way, your connection is the more likely problem.',
                "Turn on DNS Routing: 1.1.1.1 with the button below and try again. If that doesn't do it, the network test guide walks you through trying another connection.",
            ]),
        ],
        note: 'Change one thing at a time and reroll after each. That way, when it starts working, you know what fixed it.',
        actions: ['home', 'gemini', 'dns'], related: ['filter', 'network-test', 'socket'],
    },
    {
        id: 'filter', group: 'Replies', title: 'The Provider Refused This Message',
        summary: 'The company running the AI turned the request down.',
        aliases: ['content filter', 'safety', 'moderation', 'refusal', 'refused', 'blocked response', 'provider refused', 'no reason given'],
        match: /provider refused|content filter|safety|moderation|blocked response/i,
        example: 'The provider refused this message\nNo reason given.',
        explanation: [
            'The company running the AI model looked at the request and declined to answer. Whatever is written under the title is their reason, in their words.',
            "Don't take it personally. These filters are overcautious, and they read your whole chat: the character, their history, older messages. Lots of completely normal roleplay gets refused.",
            "Weyland's characters deal with real things, like sexuality, grief, addiction and trauma. That's a big part of why they feel real, and it's also exactly what cautious filters flinch at. Sexual content is the most common trigger, but the rest can set one off even when the scene itself is calm.",
        ],
        route: { model: [3, 'right here'] },
        steps: [
            step('Reroll', "Refusals aren't consistent. The same request often goes through on the next try."),
            step('On Gemini, turn on Gemini Bypass', "It's on PromptOS Home, and this is what it's built for."),
            step('Turn Analysis off for a message or two', 'The planning step before the reply sometimes gets mistaken for something it isn\'t, especially on Claude. Turning it off often gets things moving again.'),
            step('Let a different model take a turn', 'Every provider draws the line in a different place. If one keeps refusing, let another model write the next couple of replies, then switch back.'),
        ],
        note: "DNS Routing and network changes won't help with this one. Your request got there fine. The provider just said no.",
        actions: ['home', 'gemini'], related: ['interrupted', 'gemini-filter', 'distillation'],
    },
    {
        id: 'gemini-filter', group: 'Replies', title: 'Gemini: "The Prompt Contains Sensitive Words"',
        summary: "Gemini's word filter. It has its own guide.",
        aliases: ['the prompt could not be submitted', 'sensitive words', 'generative ai prohibited use policy', 'Gemini filter'],
        match: /sensitive words|prompt could not be submitted|generative ai prohibited use/i,
        example: 'The prompt could not be submitted. The prompt contains sensitive words that violate Google\'s Generative AI Prohibited Use policy.',
        explanation: [
            'This is Gemini\'s word filter, and it has a whole guide of its own.',
            "The short version: don't reroll. It'll block you again every single time. Edit your last message instead.",
        ],
        steps: [step('Open the Gemini Filter Guide', 'It explains why this happens and shows exactly what to change, with examples.')],
        actions: ['gemini'], related: ['interrupted', 'filter'],
    },
    {
        id: 'distillation', group: 'Replies', title: "Claude's Distillation Protection",
        summary: 'An anti-copying check that misfires on roleplay a lot right now.',
        aliases: ['distillation', 'reverse engineering', 'duplicating model outputs', 'anti-distillation'],
        match: /distill|reverse engineering|duplicating model outputs/i,
        example: "Claude's distillation protection was triggered.",
        explanation: [
            'AI companies have added new rules to stop "distillation", which is when a competitor copies a model\'s answers to train their own AI.',
            "Those rules are very sensitive, and right now they misfire on normal roleplay pretty regularly. You weren't doing anything wrong.",
            "People all over the AI world are running into this at the moment, not only on Weyland. Lucky is working on ways to cut down the false alarms.",
        ],
        stepsEyebrow: "These help, but they won't always work",
        steps: [
            step('Reroll', 'Sometimes the next try gets through.'),
            step('Turn Analysis off', "These checks mostly trip on the planning the AI does before your reply. Analysis has its own switch on PromptOS Home."),
            step('Swap to a different prompt', 'Insert a different Promptcart on PromptOS Home and try again. Each one is worded differently, and one of them might not set it off.'),
            step('Switch models if nothing else works', 'Other models have their own checks. Let another one write a message or two, then switch back.'),
        ],
        actions: ['home'], related: ['filter'],
    },
    {
        id: 'world-info-budget', group: 'Replies', title: 'World Info Budget Reached',
        summary: 'Normal most of the time. WeyTav trimmed some extra lore.',
        aliases: ['world info budget reached after entries', 'world information', 'lorebook budget', 'lore budget', 'maximum lorebooks reached', 'registrar', 'custom character', '!Command'],
        match: /world\s*info(?:rmation)?\s+budget|lore(?:book)?\s+budget|maximum.*lorebooks?/i,
        specificMatch: /world\s*info(?:rmation)?\s+budget/i,
        noticeLabel: 'Notice',
        example: 'World info budget reached after 3 entries.',
        explanation: [
            "Your message triggered more lore than fits in one reply. Calling in a bunch of characters with their !Commands at once is the classic way to do it.",
            'WeyTav grabbed the most relevant entries first, then stopped. The other option was cutting into your chat history to make room, and your history matters more.',
            "Most of the time you won't notice a difference. What got left out was usually background the scene didn't need anyway. Seeing 10 or more entries listed is completely normal.",
        ],
        stepsTitle: 'If you see it on every message', stepsEyebrow: 'Only worth a look if it keeps happening',
        steps: [
            step('Check for a big Registrar or custom character', [
                'A large Registrar setup, or a custom character with a lot of lore attached, can eat most of the space by itself. Start there, especially if the number in the message is small.',
                'If you use the Registrar, open it, go to My World and tap Token cost. The bar at the top is the roster list that goes out with every message. Try to keep it under 15,000.',
                'Below that, each community character shows what they add when they show up in a scene. The ones at the top of that list cost the most.',
                'To see how much lore a reply actually used, tap the Prompt button above it and check the World Info number. Over 16,000 is a lot.',
                { visual: 'itemize-button' },
            ]),
            step("Only call in who's in the scene", "If you summoned the whole roster, try just the characters who are actually there. Even mentioning someone's name can pull in their lore."),
            step("If replies seem fine, you're fine", "This is only worth chasing if the AI starts forgetting things it should know, like who someone is or where you are."),
        ],
        note: "The number counts individual entries, not characters. One character's lorebook can hold lots of entries.",
        actions: ['registrar'], related: ['context'],
    },
    {
        id: 'context', group: 'Replies', title: 'Context Size / Request Too Large',
        summary: "There wasn't room for everything WeyTav needed to send.",
        aliases: ['context length exceeded', 'maximum context', 'mandatory prompts exceed the context size', 'too many tokens', '413', 'request too large', 'token limit'],
        match: /context.*(?:exceed|size|length)|too many tokens|\b413\b|request too large|token limit/i,
        example: 'Mandatory prompts exceed the context size.',
        explanation: [
            'Every time you send a message, WeyTav sends a lot more than what you typed: the instructions, the character, any lore that triggered, and as much of your chat history as fits.',
            "All of that has a size limit, called the context size. This error means it didn't fit.",
            'AI measures text in tokens. A token is roughly three quarters of a word, so 1,000 tokens is around 750 words.',
        ],
        steps: [
            // WeyTav's defaults (Lucky, 2026-10-09): 60K sent, 5K reply. Raising it causes its own problems.
            step('Keep the context size at the default', [
                "WeyTav is built around 60,000 tokens for what gets sent and 5,000 for the reply. Don't raise it unless someone on the team asks you to, because going higher can cause other problems.",
                "If it's been changed, put it back to those numbers.",
            ]),
            step("See what's taking up the room", [
                'On a recent reply, tap the Prompt button above the message. It opens the Prompt Itemization, which shows what went into that request.',
                { visual: 'itemize-button' },
                'Two numbers are the usual suspects: World Info over 16,000, or User Persona over 1,000. Either one is worth trimming.',
                { visual: 'itemize-chart' },
            ]),
            step('Trim the big one', [
                "World Info too big? If you use the Registrar, tap Token cost in its My World tab to see what your community characters are adding. Otherwise, check for a custom character with lots of lore, and only call in the characters who are actually in the scene.",
                "Persona too big? Cut it down to what the AI really needs to know about your character. Keep the full version saved somewhere if you're attached to it.",
            ]),
            step('Try a new chat with the same character', "If a fresh chat works, the old one probably has something oversized in it. You can still go back to your old chat whenever you want."),
        ],
        note: 'If you saw "Request Too Large" while uploading a file or picture, it\'s probably the file that\'s too big, not your chat.',
        actions: ['registrar'], related: ['world-info-budget', 'model'],
    },

    // --- Connection ------------------------------------------------------------------------------
    {
        id: 'socket', group: 'Connection', title: 'Socket Hang Up / ECONNRESET',
        summary: 'The connection got cut before the reply came back.',
        aliases: ['socket hang up', 'socket hangup', 'ECONNRESET', 'ECONN RESET', 'connection reset by peer', 'EPIPE', 'broken pipe'],
        match: /socket\s*hang\s*up|econn\s*reset|connection reset|\bepipe\b/i,
        example: 'request to https://helixmind.online/v1/chat/completions failed, reason: socket hang up',
        explanation: [
            'WeyTav was waiting on a reply from HelixMind when the connection just closed. "Hang up" is pretty literal here, like a phone call dropping.',
            "Sometimes it's a hiccup on HelixMind's side and clears up by itself. When it keeps happening, it's usually something between your computer and HelixMind, like your internet provider, your router or a VPN.",
        ],
        route: { net: [3, 'usually here'], helix: 1 },
        steps: [
            step('Wait a few seconds and reroll', "If it works, you're done. A one-off is nothing to worry about."),
            step('On mobile data or spotty Wi-Fi?', "A connection that drops for even a couple of seconds can hang up on a reply that's still coming in. That goes for the device you're chatting on too, not just the computer running WeyTav. Try Wi-Fi or a steadier spot and reroll."),
            step('Turn on DNS Routing: 1.1.1.1', [
                "It's a switch in WeyTav for when your internet provider gets in the way of HelixMind. Turn it on with the button below, then try again.",
                "It won't fix every cause, but it fixes a lot of them and takes a second.",
            ]),
            step('Check your VPN, or try one', [
                'If you already have a VPN on, try a different server, or turn it off and test again.',
                "If you don't use one, Cloudflare's free WARP app is a good test. The VPN guide below shows how to set it up.",
            ]),
            step('Try another network', "If you can, connect the computer running WeyTav to a phone hotspot and send one message. If it works there, your usual internet is the problem, and the network test guide explains what to look at."),        ],
        actions: ['dns'], related: ['dns-routing', 'vpn', 'network-test', 'spectrum'],
    },
    {
        id: 'tls', group: 'Connection', title: 'EPROTO / Wrong Version Number',
        summary: 'Something on your network is getting in the middle of the connection.',
        aliases: ['write EPROTO', 'SSL', 'TLS', 'ssl3_get_record', 'wrong version number', '0A00010B', 'handshake failure'],
        match: /\beproto\b|wrong[ _]+version[ _]+number|ssl3_get_record|handshake failure/i,
        example: 'write EPROTO\nSSL routines:ssl3_get_record:wrong version number',
        explanation: [
            "WeyTav talks to HelixMind over a secure, private connection. This error means something answered partway through, and it wasn't HelixMind.",
            "That's almost always the network. An internet provider's security filter, a block page, or hotel and public Wi-Fi that checks traffic can all do it. It's really common when you're somewhere new, like staying with family.",
            '"Wrong version number" sounds like you installed the wrong thing, but it\'s only talking about the connection. Your WeyTav install and your model are fine.',
        ],
        route: { net: [3, 'almost always'] },
        steps: [
            step('Turn on DNS Routing: 1.1.1.1', "Some providers quietly swap HelixMind for a block page. This switch gets around that. Turn it on below, then try again."),
            step('Try Cloudflare WARP', [
                "WARP is a free app from Cloudflare that sends your connection around whatever's interfering. It's fixed this one for a lot of people.",
                'Install it on the computer running WeyTav, and check that it actually says Connected. Some updates stop it connecting by itself.',
                "Use the full mode, not DNS only. The VPN guide explains which is which.",
            ]),
            step('Or try a different network', 'A phone hotspot is the quickest test. If WeyTav works there, you know the original Wi-Fi is the problem.'),
        ],
        actions: ['dns'], related: ['vpn', 'spectrum', 'network-test', 'certificate'], sources: [warpDocs],
    },
    {
        id: 'dns', group: 'Connection', title: 'ENOTFOUND / EAI_AGAIN',
        summary: "WeyTav couldn't look up where HelixMind is.",
        aliases: ['getaddrinfo', 'DNS lookup failed', 'ENOTFOUND', 'EAI_AGAIN', 'could not resolve host'],
        match: /enotfound|eai_again|getaddrinfo|could not resolve host|dns lookup failed/i,
        example: 'getaddrinfo ENOTFOUND helixmind.online',
        explanation: [
            "Before WeyTav can talk to HelixMind, it has to look up HelixMind's address, kind of like looking up a number in a phone book. That lookup is called DNS.",
            "This error means the lookup failed. Either your internet is down, or your provider's phone book won't hand over HelixMind's number. Some providers' security filters do exactly that.",
        ],
        route: { net: [3, 'the lookup'] },
        steps: [
            step("Make sure you're online", 'Check that other websites load on the computer running WeyTav.'),
            step('Turn on DNS Routing: 1.1.1.1', "This is the fix for exactly this error. It has WeyTav ask Cloudflare for HelixMind's address instead of your provider. Turn it on below and try again."),
            step('Still failing? Try another network', 'If it fails even with DNS Routing on, your network may be blocking more than the lookup. A phone hotspot will tell you.'),
        ],
        actions: ['dns'], related: ['dns-routing', 'spectrum', 'network-test'],
    },
    {
        id: 'timeout', group: 'Connection', title: 'Request Timed Out',
        summary: 'The reply took too long, so something gave up waiting.',
        aliases: ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'timeout', 'timed out', '504', 'gateway timeout'],
        match: /timed?\s*out|etimedout|esockettimedout|und_err_connect_timeout|\b504\b/i,
        example: 'Gateway Timeout (504)',
        explanation: [
            'Something along the way stopped waiting for the reply because it was taking too long.',
            'A busy model, a very long reply or a slow connection can all do it. If it only happens once, the model was probably just swamped.',
        ],
        route: { net: 1, helix: 1, model: [2, 'often busy'] },
        steps: [
            step('Wait a minute, then try once', 'Rerolling over and over while a model is busy tends to make it worse. Give it a minute.'),
            step('Try another model', 'If a different model answers right away, the first one is probably overloaded. Switch back later.'),
            step('Turn Analysis off', 'With Analysis on, the AI plans before it writes, which takes longer. Turning it off can get the reply in before the time runs out.'),
            step('If everything times out, check your connection', [
                'When every model times out, turn on DNS Routing: 1.1.1.1 and try the network test.',
                "On mobile data or patchy Wi-Fi, a long reply has more time to get caught by a drop in signal. Try a steadier connection before you blame the model.",
            ]),
        ],
        actions: ['home', 'dns'], related: ['server', 'network-test', 'interrupted'],
    },
    {
        id: 'certificate', group: 'Connection', title: 'Certificate Error',
        summary: "WeyTav couldn't confirm it was really talking to HelixMind.",
        aliases: ['certificate has expired', 'CERT_HAS_EXPIRED', 'self signed certificate', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID', 'unable to get local issuer certificate', 'secure connection'],
        match: /certificate|cert_has_expired|err_tls_cert|unable_to_verify_leaf_signature/i,
        example: 'certificate has expired',
        explanation: [
            "Websites prove who they are with something called a certificate. WeyTav checks it every time, to make sure it's really talking to HelixMind.",
            "This error means that check failed. Most of the time it's a wrong clock on your computer, Wi-Fi that wants you to sign in first, or antivirus software that inspects your connections.",
        ],
        route: { you: [2, 'check the clock'], net: 2 },
        steps: [
            step("Check your computer's date and time", "If the clock is off, even by a day, certificates look expired. Turn on automatic date and time in your computer's settings."),
            step('Sign in to the Wi-Fi', 'Hotel, airport, school and café Wi-Fi often wants you to accept a sign-in page first. Open any website in your browser and see if one pops up.'),
            step('Check your antivirus', 'Some antivirus apps have a "web shield" or "HTTPS scanning" feature that sits in the middle of connections. Pause it for a minute to test, then turn it back on.'),
            step('Try another network', 'If it works on a phone hotspot, the original network is the problem.'),
        ],
        related: ['tls', 'network-test', 'vpn'],
    },
    {
        id: 'local', group: 'Connection', title: 'Failed to Fetch / Connection Refused',
        summary: "A request couldn't reach where it was going.",
        aliases: ['failed to fetch', 'fetch failed', 'networkerror', 'ECONNREFUSED', 'ERR_CONNECTION_REFUSED', 'load failed', 'could not get a reply from API', 'localhost'],
        match: /failed to fetch|fetch failed|networkerror|econnrefused|err_connection_refused|load failed|could not get a reply/i,
        example: 'Failed to fetch',
        explanation: [
            'WeyTav tried to reach something and nothing answered.',
            "If the error mentions helixmind.online, it's HelixMind it couldn't reach. Otherwise, it's usually your browser losing touch with WeyTav itself.",
        ],
        route: { you: [2, 'often here'], net: 1, helix: 1 },
        steps: [
            step('Check that WeyTav is still running', "On the computer you launched it from, make sure the WeyTav window is still open and the computer hasn't gone to sleep."),
            step('Using it from your phone? Check that link', 'If you open WeyTav on your phone through Tailscale or something similar, make sure it\'s connected on both the phone and the computer.'),
            step('If it mentions HelixMind', 'Then WeyTav itself is fine and the trouble is reaching HelixMind. Turn on DNS Routing: 1.1.1.1, then follow the Socket Hang Up guide.'),
        ],
        actions: ['dns'], related: ['socket', 'network-test', 'save-data'],
    },

    // --- API key and account ---------------------------------------------------------------------
    {
        id: 'models', group: 'API key and account', title: 'The Model List Is Empty',
        summary: 'Your key says Valid, but there are no models to pick.',
        aliases: ['no models', 'missing models', 'model dropdown', 'green circle', 'model list empty', 'models not loading', 'valid'],
        match: /(?:no|missing) models|no model options|model list (?:is )?empty|model dropdown|models not loading/i,
        specificMatch: /no model options found/i,
        example: 'No model options found. Check your API settings.',
        explanation: [
            'The green Valid circle means your key was accepted. Loading the model list is a separate step, and that\'s the part that failed.',
            "Usually it just needs a nudge. If it doesn't, the real problem is often the connection, and there may be another error on screen telling you which one.",
        ],
        steps: [
            step("Reselect your key, even if it's the only one", [
                'Open the API panel, choose your key from the dropdown again and press Connect. Then open the model list.',
                "That loads the key back in, and it's fixed this for plenty of people.",
            ]),
            step('Look for another error', "If you see something like socket hang up or EPROTO when you connect, look that up here. That's the real problem, and re-entering your key won't fix it."),
            step('Turn on DNS Routing: 1.1.1.1', "If there's no other error, try this next, then press Connect again. You don't need to reinstall anything."),
        ],
        actions: ['dns'], related: ['tls', 'socket', 'key'],
    },
    {
        id: 'key', group: 'API key and account', title: 'API Key / Access Denied',
        summary: "Your key wasn't accepted, or it isn't the one selected.",
        aliases: ['401', '403', 'unauthorized', 'forbidden', 'invalid api key', 'expired key', 'authentication', 'no API key', 'entire key', 'helix-'],
        match: /\b40[13]\b|unauthorized|forbidden|(?:invalid|expired) (?:api )?key|key\s+(?:(?:is|was)\s+)?(?:invalid|expired)|key has expired|no api key|authentication/i,
        specificMatch: /copy the entire key/i,
        example: '401 Unauthorized',
        explanation: [
            "Your API key is how the service knows it's you. This error means the key is missing, expired, mistyped, or not the one that's selected right now.",
            '"Forbidden" can also mean your key works fine but doesn\'t include the model you picked.',
        ],
        steps: [
            step('Reselect your key and press Connect', [
                'Open the API panel, pick your key from the dropdown again (even if it\'s the only one) and hit Connect.',
                'This fixes it more often than you\'d think. Sometimes the key just needs loading back in.',
            ]),
            step('Make sure you copied the whole key', 'HelixMind keys start with helix-. Check that part made it in, with no extra space at the start or end.'),
            step('Check whether the key has expired', "If it has, you'll need a new one. Delete the old one from the dropdown so it can't get picked by accident."),
            step('Got "Forbidden"? Try another model', "Your key might not cover that model. Pick one from the list WeyTav shows after you connect."),
        ],
        related: ['models', 'model', 'credits'],
    },
    {
        id: 'credits', group: 'API key and account', title: 'Quota / Insufficient Credits',
        summary: 'Your account has hit its limit for now.',
        aliases: ['402', 'quota exceeded', 'insufficient_quota', 'insufficient credits', 'insufficient balance', 'budget', 'payment required', 'out of credits'],
        match: /\b402\b|quota|insufficient.*(?:credit|balance)|payment required|budget.*exceed/i,
        specificMatch: /insufficient[_ ]quota|quota exceeded|insufficient (?:credits|balance)/i,
        example: 'Insufficient credits',
        explanation: [
            "The service is turning down new requests because your account has used everything it's allowed for now.",
            "Rerolling won't help with this one. It's about the account, not the message.",
        ],
        steps: [
            step('Make sure the right key is selected', 'If you have more than one, check that the API panel is using the one you meant.'),
            step('Check your balance or usage', "Your provider's account page shows what's left and when it resets."),
            step('Wait for the reset, or top up', 'Once your allowance renews or your balance is back, everything works again with nothing else to change.'),
        ],
        related: ['rate', 'key'],
    },
    {
        // The shared daily pool (2026-10-17: Sonnet 4.5 has 2,000 a day, Gemini 4 Argon 500, rolling 24 hours).
        // Update the model names in the swap step when the lineup changes. Lucky doesn't want this card to
        // read as "keep trying", so it never suggests rerolling to catch a freed-up message.
        id: COMMUNITY_MODEL_LIMIT_ARTICLE, group: 'API key and account', title: COMMUNITY_MODEL_LIMIT_TITLE,
        summary: 'A shared model has used up its messages for everyone. Swap models.',
        aliases: ['rpd limit', 'rpd', 'requests per day', 'community limit', 'daily limit', 'daily request limit', 'model group', 'requests per 24 hours', 'shared model', 'model maxed out', 'grp:beta'],
        match: /community model maxed out|maximum usage for the day/i,
        // Beats the generic 429 card when someone pastes the raw text: the old "rate limit exceeded: ...rpd limit=2000"
        // or the 2026-10-18 'model group "beta" daily request limit exceeded (2000 requests per 24 hours)'.
        specificMatch: /\brpd\s*limit\b|\bmodel\s+group\b[^\n]*?\bdaily\s+request\s+limit\b|community model maxed out/i,
        example: `${COMMUNITY_MODEL_LIMIT_TITLE}\n${COMMUNITY_MODEL_LIMIT_BODY.replace('\n\n', ' ')}`,
        explanation: [
            "A few of our models come from a limited supply that the whole community shares. Each one only gets so many messages a day between all of us, and once they're used up, that model stops taking new ones for a while.",
            "This isn't your key, your account or anything you did. Everyone trying that model right now is getting the same message. If you saw the raw version with a long code in it, that code belongs to Weyland's plan, not to you.",
            "The limit runs on a rolling 24 hours, so it doesn't refill all at once at midnight. Messages free up bit by bit as older ones age out, which is why it can come back in a few hours.",
            "Lucky's announcement on the Discord explains the whole situation with these models. It's under Links at the bottom of this page.",
        ],
        route: { helix: [3, 'shared limit'] },
        steps: [
            step('Swap to another model', [
                'Open the API panel and pick something else. Right now the shared, limited ones are Sonnet 4.5 and Gemini 4 Argon, so anything outside those works.',
                "GLM 5 (the non-thinking one) and regular Sonnet 5 are both good picks while you wait.",
            ]),
            step('Using the Router?', "If the Router is on and has other models in its pool, it skips this one by itself and you'll probably never see this message. If you're seeing it anyway, the Router is likely off, or this model is the only one in your pool."),
            step("Check WeyPhone's model too", 'Texting, Copycat and app sync can each use their own model. If the phone is set to a shared model, swap it in WeyPhone Settings as well. Those features send a lot of messages, so they\'re better off on something else anyway.'),
            step('Come back to it in a few hours', "There's no need to babysit it. Play on another model and try this one again later."),
        ],
        note: "Please don't keep rerolling to try and sneak a message through. If multiple people roll the same message immediately as it is freed, it can sometimes simply error out, using up the message and not distributing it to anyone. Instead, wait a couple hours and try again.",
        related: ['rate', 'models', 'credits'],
        // The 2026-10-17 models announcement (Sonnet 4.5, GLM 5, Gemini 4 Argon). Swap it when a newer one replaces it.
        sources: [['The models announcement on Discord', 'https://discord.com/channels/1250835886216577034/1254241818200244314/1560732571866890242']],
    },
    {
        id: 'rate', group: 'API key and account', title: '429 / Too Many Requests',
        summary: 'Too many requests too fast. Slow down a little.',
        aliases: ['429', 'rate limit', 'too many requests', 'resource exhausted', 'RESOURCE_EXHAUSTED'],
        match: /\b429\b|rate.?limit|too many requests|resource.?exhausted/i,
        example: '429 Too Many Requests',
        explanation: [
            "The service is asking you to slow down. Either too many requests showed up at once, or the model is too busy right now to take another one.",
            'Some providers also send a 429 when you\'ve used up your allowance, so read the words after the number.',
        ],
        steps: [
            step('Wait a minute before trying again', 'If the message says how long to wait, wait that long. Rerolling straight away just adds another request to the pile.'),
            step('Let other requests finish', 'Other tabs, WeyPhone conversations and app syncs all share the same key. Let them finish before you try again.'),
            step('If it mentions quota or credits', "Then it's an account limit, not speed. The Quota guide covers that."),
            step('If it says "rpd limit" or "daily request limit"', "Then it's a shared model that's out of messages for everyone, and waiting a minute won't fix it. The Community Model Maxed Out guide covers that."),
            step('Try another model', "If one model is slammed, another one might not be."),
        ],
        related: ['credits', COMMUNITY_MODEL_LIMIT_ARTICLE, 'server'],
    },
    {
        id: 'server', group: 'API key and account', title: '500 / 502 / 503 / Service Unavailable',
        summary: "Something broke on the service's end, not yours.",
        aliases: ['500', '502', '503', '529', 'bad gateway', 'overloaded', 'internal server error', 'service unavailable', 'upstream error'],
        match: /\b(?:500|502|503|529)\b|bad gateway|overload|service unavailable|internal server error|upstream error/i,
        example: '503 Service Unavailable',
        explanation: [
            "This one's on them. A server handling your request had a problem or was too busy to answer.",
            "There's nothing wrong with your chat, your settings or your computer. These usually clear up on their own.",
        ],
        route: { helix: [2, 'often'], model: [2, 'often'] },
        steps: [
            step('Wait a little and try again', "Give it a minute or two. If it keeps happening, check the Discord's announcements in case there's an outage."),
            step('Try another model', 'If another model works, use it for now and switch back later.'),
        ],
        related: ['timeout', 'rate'],
    },
    {
        id: 'model', group: 'API key and account', title: 'Model Not Found / Unavailable',
        summary: "The model you picked isn't available right now.",
        aliases: ['404', 'model not found', 'no endpoints found', 'model unavailable', 'unknown model', 'unsupported model'],
        match: /\b404\b|model(?:\s+[\w.-]+)?\s+(?:not found|unavailable|unsupported)|(?:unknown|unsupported) model|no endpoints found|no model found with name/i,
        specificMatch: /no model found with name/i,
        example: 'Model not found',
        explanation: [
            "WeyTav asked for a model the service doesn't have, or doesn't offer on your key.",
            'Models get renamed and retired pretty often, so a model you picked a while ago can quietly stop existing.',
        ],
        steps: [
            step('Reconnect and pick from the list', 'In the API panel, press Connect, then choose a model from the fresh list.'),
            step("Check WeyPhone's model too", 'WeyPhone texting, Kressa and app sync can each use their own model. If only one phone feature is failing, check its model in WeyPhone Settings.'),
            step('If a button keeps asking for an old name', "Some buttons ask for a model by name. If picking it yourself works but the button still fails, that's a bug on our end. Let us know which button it was."),
        ],
        related: ['models', 'key'],
    },
    {
        id: 'model-control', group: 'API key and account', title: 'Model Select Control Not Found',
        summary: "A button couldn't find the model menu.",
        aliases: ['model select control not found', 'missing model selector', 'model button failed'],
        specificMatch: /model select control not found/i,
        example: 'Model select control not found',
        explanation: ["A button tried to switch your model for you, but couldn't find the model menu on the page. Your model is fine. The button just lost its way."],
        steps: [
            step('Pick the model yourself', 'Open the API panel and choose it from the list. It works the same.'),
            step('Reload the page', "Sometimes the menu hadn't finished loading yet. Copy any unsent text, reload, and try the button again."),
            step('If it keeps happening', "Then the button is probably broken. That's a bug on our end, so let us know which button it was."),
        ],
        related: ['models'],
    },
    {
        id: 'connection-profile', group: 'API key and account', title: 'No Connection Profile Available',
        summary: "WeyPhone doesn't know which connection to use.",
        aliases: ['no connection profile', 'none selected in WeyPhone settings', 'none active in SillyTavern', 'phone connection', 'no profile selected'],
        specificMatch: /no connection profile available/i,
        example: 'No Connection Profile available (none selected in WeyPhone settings and none active in SillyTavern)',
        explanation: [
            'WeyPhone needs a saved connection, called a connection profile, to know where to send its requests. It couldn\'t find one.',
        ],
        steps: [
            step('Save your connection as a profile', "In the API panel, connect like you normally would. Then save that setup as a connection profile at the top of the panel."),
            step('Pick it in WeyPhone Settings', "Choose that profile as the phone's connection. If this happened while making a memory, check that chat's memory settings too."),
            step('Try again', 'If you get a different error now, look that one up. It means the profile part is sorted.'),
        ],
        related: ['key', 'models', 'model'],
    },

    {
        id: 'ltm', group: 'API key and account', title: 'Long-Term Memory: "LTM generation failed"',
        summary: 'A memory would not generate. Usually a 429 or a 400.',
        aliases: ['ltm', 'long-term memory', 'long term memory', 'ltm generation failed', 'got response status', 'got response status 429', 'got response status 400', 'retrying on minimax-m3', 'ltm model failed', 'memory would not generate'],
        match: /\bLTM\b|long.?term memory/i,
        specificMatch: /ltm (?:generation|model) failed|weyland-ltm/i,
        example: 'LTM generation failed: Got response status 429\nLTM model failed, retrying on minimax-m3',
        explanation: [
            'Long-Term Memory writes a memory by sending the chat to a model, the same way a normal reply does. It uses your current connection, so anything that stops a reply can stop a memory too.',
            'The message only shows the status number it got back. The two you will see most are 429 and 400.',
            "The second pop-up, the one that says it's retrying on another model, is LTM trying its backup model after the first one failed. If that one fails too, you get the red message.",
        ],
        steps: [
            step('Try it again', [
                'Plenty of these are one-offs. A model can be busy for a moment, or the connection can blip.',
                'Wait a few seconds and press generate again before you change anything. If it works, you are done.',
            ]),
            step('Check your model', [
                'In the LTM settings, press "Use current" so LTM copies the model your chat is using right now.',
                'A model name from one provider usually means nothing to another. If you switched keys or providers recently, that is the most likely reason a memory suddenly stops working.',
                'On OpenRouter the name needs the full form, like anthropic/claude-haiku-5.5, not a short name like gemini-3.8-flash.',
            ]),
            step('Check the Fallback model box', "It's right under the model. LTM tries it when the first model fails, which is what the blue \"retrying on...\" message means. A short name there, like minimax-m3, won't work on OpenRouter, so clear it or put in a full OpenRouter name."),
            step('429: you may be out of allowance', [
                'A memory is a request like any other. If your daily messages are used up, or the model is swamped, it gets a 429 and so does your next reply.',
                'Wait for your allowance to reset, or try again in a few minutes. The 429 guide has the rest.',
            ]),
            step('400 on OpenRouter: update', "A 400 on OpenRouter was a bug in older versions, where LTM sent a setting OpenRouter doesn't accept. Updated copies don't do that, so if the model names above are right and it still fails, update and try again."),
            step('Not sure which key LTM is using?', 'It uses whatever the API panel is connected to right now. If you switched keys, switch the model too.'),
        ],
        related: ['rate', 'model', 'key'],
    },

    // --- WeyPhone --------------------------------------------------------------------------------
    {
        id: 'save', group: 'WeyPhone', title: 'WeyPhone Could Not Save',
        summary: "Your latest phone changes might not be saved yet.",
        aliases: ['WeyPhone could not save', 'phone save error', 'phone storage'],
        match: /weyphone[^\n]*(?:could not save|failed to save)/i,
        specificMatch: /weyphone could not save/i,
        example: 'WeyPhone could not save. Keep this tab open and check the server connection.',
        explanation: [
            "WeyPhone couldn't save to the computer running WeyTav. Usually that means the connection to it dropped for a moment.",
            "Your newest changes are probably still in this tab, so don't close or refresh it yet.",
        ],
        steps: [
            step('Leave this tab open', "If you wrote something you'd hate to lose, copy it somewhere first."),
            step('Check the computer running WeyTav', "Make sure it's awake and the WeyTav window is still open. If you're on your phone, check that you're still connected to it."),
            step('Try again', 'Once it\'s back, make a small change and check that it saves.'),
        ],
        related: ['save-data', 'local'],
    },
    {
        id: 'app-sync', group: 'WeyPhone', title: 'WeyPhone Returned No Usable Content',
        summary: "An app or profile update came back empty.",
        aliases: ['sync partially succeeded', 'no usable content', 'model did not return usable content', 'Chronicle', 'Chitter', 'Discorgi', 'Yip Yap', 'sync failed', 'profile generation'],
        specificMatch: /sync partially succeeded|model did not return usable content/i,
        example: 'The model did not return usable content this time.',
        explanation: [
            "WeyPhone asked the AI to update an app or a character's profile, but the reply came back empty or in a shape it couldn't use.",
            'If it says "Sync partially succeeded", the other apps updated fine. Only the ones it names kept their old content.',
        ],
        steps: [
            step('Try the sync again', "This is often a one-off. If you also got an error like socket hang up, look that one up first."),
            step('On mobile data?', "A sync is a long request, and a quick drop in signal partway through can leave it with nothing usable. If you're on patchy data, try again on Wi-Fi."),
            step('Try a different sync model', [
                'In WeyPhone Settings, find "Model for social-app Sync". That\'s the model doing this job, separate from your main chat model.',
                'Some models are better at it than others. If one keeps failing, swap it out.',
            ]),
        ],        related: ['model', 'socket', 'connection-profile'],
    },
    {
        id: 'phone-memory', group: 'WeyPhone', title: 'The Model Returned an Empty Memory',
        summary: 'WeyPhone asked for a memory and got nothing back.',
        aliases: ['empty memory', 'phone memory failed', 'memory generation'],
        specificMatch: /model returned an empty memory/i,
        example: 'The model returned an empty memory.',
        explanation: [
            'WeyPhone asked the AI for a memory and the reply came back blank.',
            'If you were redoing a memory you already had, the old one is still there.',
        ],
        steps: [
            step('Try once more', 'If an API error shows up as well, look that up. It\'s probably the reason.'),
            step('On mobile data?', "If your connection blips while the memory is being written, it can come back blank. Try again on Wi-Fi or somewhere with better signal."),
            step('Check the memory model', "Memories have their own model and connection, in that chat's memory settings. If that model keeps coming back empty, try another."),
            step('Write it yourself if you need to', 'You can always write or edit a memory by hand and keep chatting.'),
        ],
        related: ['connection-profile', 'model', 'socket'],
    },

    // --- Saving and loading ----------------------------------------------------------------------
    {
        id: 'save-data', group: 'Saving and loading', title: 'Chat or Settings Could Not Be Saved',
        summary: "Your latest changes might not be saved. Don't refresh yet.",
        aliases: ['chat could not be saved', 'settings could not be saved', 'group chat', 'failed to save preset', 'theme could not be saved', 'save error', 'disk full', 'ENOSPC'],
        match: /(?:chat|settings|preset|theme) could not be saved|failed to save (?:preset|movingui state)|\benospc\b|disk full/i,
        specificMatch: /(?:chat|settings|preset|theme) could not be saved|failed to save (?:preset|movingui state)/i,
        example: 'Chat could not be saved: Check the server connection and reload the page to prevent data loss.',
        explanation: [
            "WeyTav couldn't save, which usually means the page lost touch with the computer running it.",
            "The message says to reload, and you will. Grab anything you'd hate to lose first, though, because after the reload you'll only see what actually got saved.",
        ],
        steps: [
            step('Copy anything important', 'Copy new messages or edits somewhere safe, or screenshot any settings you changed.'),
            step('Check the computer running WeyTav', 'Make sure it\'s awake and the WeyTav window is open. If the error mentions ENOSPC or "disk full", that computer is out of storage space.'),
            step('Reload and check', 'Reload the page and see what made it. Add back anything that\'s missing.'),
        ],
        related: ['save', 'local', 'session'],
    },
    {
        id: 'load-data', group: 'Saving and loading', title: 'Chat or Settings Could Not Be Loaded',
        summary: "WeyTav couldn't open something it saved.",
        aliases: ['could not load chat data', 'settings could not be loaded', 'stats could not be loaded', 'chat missing', 'settings missing'],
        specificMatch: /could not load chat data|(?:settings|stats) could not be loaded/i,
        example: 'Could not load chat data. Try reloading the page.',
        explanation: [
            "WeyTav couldn't load that chat or your settings. Usually the connection to the computer running it dropped.",
            "This doesn't mean your chat is gone. It just couldn't be opened right then.",
        ],
        steps: [
            step('Check that WeyTav is still running', "Make sure the WeyTav window is open on your computer. If it just restarted, give it a moment to finish starting up."),
            step('Reload once', "Copy any unsent text first, then reload."),
            step('See how much is affected', "If only one chat won't open and everything else works, leave that chat alone for now. Don't delete or replace anything while you figure it out."),
        ],
        related: ['local', 'save-data', 'session'],
    },
    {
        id: 'session', group: 'Saving and loading', title: "Couldn't Get CSRF Token",
        summary: 'The page and WeyTav got out of sync. A refresh fixes it.',
        aliases: ['CSRF token', 'invalid csrf', 'session expired', 'refresh the page'],
        specificMatch: /csrf/i,
        example: "Couldn't get CSRF token. Please refresh the page.",
        explanation: [
            'This is a behind-the-scenes security check between your browser and WeyTav. It got out of sync, usually because WeyTav restarted while the page was still open.',
            'It has nothing to do with your API key.',
        ],
        steps: [
            step('Refresh the page', 'Copy any unsent text first. This fixes it nearly every time.'),
            step('Make sure WeyTav is running', "If refreshing doesn't help, check the WeyTav window on your computer. If you use it from your phone, make sure that connection is still up."),
        ],
        related: ['local', 'save-data'],
    },
    {
        id: 'chat-delete', group: 'Saving and loading', title: 'Chat Deletion Timed Out',
        summary: 'The delete command stopped waiting. Check whether it worked.',
        aliases: ['chat deletion timed out', 'delete chat', 'delchat'],
        specificMatch: /chat deletion timed out/i,
        example: 'Chat deletion timed out. Please try again.',
        explanation: ['The delete command gave up waiting. That can happen if you took a moment to pick the chat or confirm.'],
        steps: [
            step('Check the chat list', "If the chat's gone, it worked. If it's still there and you still want it gone, delete it again."),
        ],
        related: ['local'],
    },

    // --- Fixing your connection ------------------------------------------------------------------
    {
        id: 'network-test', group: 'Fixing your connection', title: 'Testing Another Network',
        summary: 'Find out whether your internet is the problem.',
        aliases: ['ISP', 'internet provider', 'hotspot', 'wifi', 'Wi-Fi', 'hotel', 'university', 'school', 'Tailscale', 'remote', 'network'],
        explanation: [
            "Lots of connection errors come down to the network you're on. The easiest way to find out is to try a different one and see whether the problem follows you.",
        ],
        steps: [
            step('Figure out which device actually connects', [
                'If WeyTav runs on your computer and you open it on your phone, the computer is the one talking to HelixMind.',
                "So for blocks and security filters, switching your phone to mobile data won't change anything. The computer is the one that needs a different network.",
                "There's one exception. If replies come back blank or cut off, your phone's own connection matters too, because WeyTav stops waiting for a reply as soon as the device you're chatting on drops off. Patchy mobile data can cause that even when the computer's internet is perfect.",
            ]),
            step('Put that device on another connection', [
                'A phone hotspot is the easiest option. Connect the computer to it and send one message.',
                "Make sure the hotspot has decent signal first. A weak one can drop out mid-reply and make it look like the test failed.",
            ]),
            step('Compare', [
                'Works on the hotspot? Your usual network is the problem. Turn on DNS Routing: 1.1.1.1, check the network for security filters, or try WARP.',
                "Fails on both? The network probably isn't it. A VPN or antivirus running on the computer can still be involved, so check those too.",
            ]),
        ],
        note: 'Hotel and public Wi-Fi are known for this. WARP often gets around them.',
        actions: ['dns'], related: ['dns-routing', 'vpn', 'spectrum'],
    },
    {
        id: 'dns-routing', group: 'Fixing your connection', title: 'DNS Routing: 1.1.1.1',
        summary: 'A one-tap fix for a lot of connection problems.',
        aliases: ['DNS', 'Cloudflare', '1.1.1.1', 'address lookup', 'shield', 'network button'],
        explanation: [
            "Before WeyTav can connect to HelixMind, it has to look up HelixMind's address. That's called DNS, and normally your internet provider handles it.",
            'Some providers block that lookup or send it to a warning page. DNS Routing has WeyTav ask Cloudflare\'s 1.1.1.1 instead, which doesn\'t.',
        ],
        steps: [
            step('Turn it on', 'Use the button below, or the shield icon in the API panel. Flip the switch, then try again. The shield turns green while it\'s on.'),
            step("If it didn't help", 'Leave it on and try the network test. Some networks block the connection itself, not just the lookup, and that needs a different fix, like WARP.'),
        ],
        note: 'It only changes how WeyTav finds HelixMind. Your computer, your other apps and your browsing all stay exactly the same.',
        actions: ['dns'], related: ['network-test', 'vpn'], sources: [['Cloudflare: what 1.1.1.1 is', 'https://one.one.one.one/']],
    },
    {
        id: 'spectrum', group: 'Fixing your connection', title: 'Spectrum Security Shield',
        summary: "Spectrum's security filter is known to block HelixMind.",
        aliases: ['Spectrum', 'Security Shield', 'Advanced WiFi', 'suspicious site blocked', 'parental control', 'ISP filter'],
        match: /spectrum|security shield|suspicious site blocked/i,
        explanation: [
            'Spectrum is a big internet provider in the US. Its Security Shield feature, which is on by default for a lot of customers, is known to block HelixMind.',
            "Other providers have filters like it under different names, so even if you're not on Spectrum, the same idea might apply.",
        ],
        steps: [
            step('Turn on DNS Routing: 1.1.1.1 first', 'This gets around it for a lot of people without touching the router at all.'),
            step('Check Security Shield in the My Spectrum app', [
                'Whoever owns the account can find it in the My Spectrum app, under the internet or WiFi settings, along with a list of sites it blocked.',
                "If HelixMind's address is on that list, you can allow it there. Spectrum's own instructions are linked below.",
            ]),
            step('Not on Spectrum?', 'Look in your router or your provider\'s app for anything called web protection, safe browsing or parental controls. Those are the usual suspects.'),
        ],
        actions: ['dns'], related: ['network-test', 'vpn'],
        sources: [['Spectrum: Security Shield', 'https://www.spectrum.net/support/internet/security-shield'], ['Spectrum: unblocking a website', 'https://www.spectrum.net/support/internet/how-unblock-website-security-shield']],
    },
    {
        id: 'vpn', group: 'Fixing your connection', title: 'VPNs and Cloudflare WARP',
        summary: 'A VPN can fix connection problems, or cause them.',
        aliases: ['VPN', 'WARP', 'Cloudflare app', '1.1.1.1 app', 'Flare', 'DNS only', 'Traffic and DNS'],
        match: /\bvpn\b|\bwarp\b|cloudflare app|\bflare\b/i,
        explanation: [
            "A VPN sends your connection a different way. That can get you around a network that's interfering with HelixMind.",
            'It can also be the problem. Some VPN servers get blocked, and some VPN apps have filters of their own.',
        ],
        steps: [
            step('Already using a VPN? Check it', [
                'Make sure it says Connected. Some apps stop connecting by themselves after an update.',
                'If your problems started while it was on, try a different server, or turn it off to compare.',
            ]),
            step('Want to try one? Cloudflare WARP is free', [
                'Get the 1.1.1.1 app from Cloudflare (link below). On newer versions, pick "Traffic and DNS". On older ones, it\'s called "1.1.1.1 with WARP".',
                "The DNS-only option won't help here. It only changes the address lookup, which DNS Routing in WeyTav already does.",
            ]),
            step('Put it on the right device', "It needs to run on the computer running WeyTav. A VPN on your phone won't change how the computer connects."),
            step('One VPN at a time', 'Turn off any other VPN before testing WARP. Two at once tends to break both.'),
        ],
        note: "A VPN can fix a blocked or tampered connection. It won't fix an expired key, a usage limit or a filter refusing your message.",
        related: ['network-test', 'dns-routing', 'tls'], sources: [['Get the 1.1.1.1 app (WARP)', 'https://one.one.one.one/'], warpDocs],
    },
];

export const getErrorHelpCard = id => ERROR_HELP_CARDS.find(card => card.id === id) ?? null;
const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Recognized app messages take precedence over generic fragments. "Chat deletion timed out"
 * must not inherit advice to reroll a reply; a partial app sync must not become a blank chat.
 * Unknown messages can still match connection codes, titles or the search aliases.
 */
export function searchErrorHelp(query = '') {
    const trimmed = query.trim();
    if (!trimmed) return ERROR_HELP_CARDS;
    const flat = normalize(trimmed);
    if (!flat) return [];
    // A URL can contain an unrelated error number (a port, path or query parameter).
    const message = trimmed.replace(/https?:\/\/\S+/gi, '');
    const specific = ERROR_HELP_CARDS.filter(card => card.specificMatch?.test(message));
    if (specific.length) return specific;
    const direct = ERROR_HELP_CARDS.filter(card => card.match?.test(message));
    const words = trimmed.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const rest = ERROR_HELP_CARDS.filter(card => {
        const fields = [card.title, card.summary, ...(card.aliases ?? [])];
        return fields.some(value => normalize(value).includes(flat))
            || words.every(word => fields.join(' ').toLowerCase().includes(word));
    });
    return [...new Set([...direct, ...rest])];
}
