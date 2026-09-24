// Registrar export compatibility helpers, adapted from registrar.weybooru.com/base.js
// (inspected 2026-09-15). Keep prompt text, macros, selective keys and activation flags
// aligned with the website. No browser code is executed or downloaded at runtime.

/** Build subbots and location lore, never character cards or greetings. */
export function buildRegistrarBook(items) {
    const book = { entries: {} };
    const characters = items.filter(item => item.kind === 'character');
    const locations = items.filter(item => item.kind === 'location');
    let roster = "[CHARACTER ROSTER - FRESHMAN YEAR]\nThe following is a list of special named NPC's that live on and around the campus. If an NPC is 'not yet in college', they should NEVER appear on campus randomly, and should only appear in roleplay if {{char}} specifically looks for them.\n";
    characters.forEach((item, index) => {
        // Allocate locally instead of characterId*5: upstream IDs can otherwise collide
        // with the website's fixed 8000 location namespace in mixed collections.
        addLoreEntries(book, index * 5, item);
        const names = item.name.split(',').map(name => name.trim());
        const aliases = names.slice(1);
        roster += `${names[0]}: (${aliases.length ? `AKA: [${aliases.toString()}], ` : ''}${item.species}, ${item.roster ? `${item.roster}, ` : ''}${item.gender}, Username: ${item.onlineHandle}, {{getvar:${item.schoolYear}}},${item.major ? ` Major: ${item.major},` : ''} ${item.dwelling})\n`;
    });
    if (characters.length) book.entries[5000] = buildRosterEntry(5000, roster + '[END CHARACTER ROSTER]');
    let next = Math.max(8000, 5001 + characters.length * 5);
    const listId = next++;
    let list = '[LOCATIONS]\nThe following is a list of special named locations on and around the campus.\n';
    for (const item of locations) {
        const id = next++;
        addWorldEntries(book, id, item);
        const subs = parseLocationSubLocations(item);
        for (const sub of subs) addSubLocationEntry(book, next++, id, item.name, sub);
        book.entries[id].content = book.entries[id].content.replace('::SUBLOCS::', subs.length ? `\nSub-Locations:[\n${subs.map(sub => `- ${sub.name}\n`).join('')}]\n\n` : '');
        list += `${item.name}: (${item.summary})\n`;
    }
    if (locations.length) book.entries[listId] = buildLocationsEntry(listId, list + '[END LOCATIONS]');
    return book;
}

function parseCharacterOutfitEntries(raw) {
	if (raw == null) return null;
	let arr = raw;
	if (typeof raw === 'string') {
		try {
			arr = JSON.parse(raw);
		} catch (e) {
			return null;
		}
	}
	if (!Array.isArray(arr)) return null;
	return arr;
}

function buildLoreOutfitSection(inputData) {
	const raw = inputData.outfitEntries;
	if (raw != null) {
		const arr = parseCharacterOutfitEntries(raw);
		if (!arr || !arr.length) return '';
		let s = '';
		for (let i = 0; i < arr.length; i++) {
			const o = arr[i];
			if (!o || !o.description || !String(o.description).trim()) continue;
			const label = (o.name && String(o.name).trim()) ? String(o.name).trim() + ' Outfit' : 'Outfit';
			s += label + ': [\n' + o.description + '\n]\n\n';
		}
		return s;
	}
	let s = '';
	if (inputData.casualOutfit) s += 'Casual outfit: [\n' + inputData.casualOutfit + '\n]\n\n';
	if (inputData.nightOutfit) s += 'Night outfit: [\n' + inputData.nightOutfit + '\n]\n\n';
	if (inputData.chillingOutfit) s += 'Chilling outfit: [\n' + inputData.chillingOutfit + '\n]\n\n';
	if (inputData.underwearOutfit) s += 'Underwear: [\n' + inputData.underwearOutfit + '\n]\n\n';
	if (inputData.winterOutfit) s += 'Winter outfit: [\n' + inputData.winterOutfit + '\n]\n\n\n';
	return s;
}

function parseLocationSubLocations(location) {
	if (!location || location.subLocations == null) return [];
	try {
		const raw = location.subLocations;
		const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
		if (!Array.isArray(arr)) return [];
		return arr.filter(function (item) {
			return item && typeof item.name === 'string' && item.name.trim().length;
		});
	} catch (e) {
		return [];
	}
}

function addSubLocationEntry(book, id, locationId, locationName, subLocationData) {

	let keywords = [];
	keywords.push(subLocationData.name);
	keywords.push(subLocationData.name.toLowerCase());
	keywords = keywords.concat(cleanKeywords(subLocationData.extraKeys));

	const world = {entries: {}};
	world.entries[id] = {
		uid: id,
		key: book.entries[locationId].key,
		keysecondary: keywords,
		comment: `${locationName}, ${subLocationData.name}`,
		content: `[${locationName}, ${subLocationData.name} INFO]\nDescription: [\n${subLocationData.description}\n]\n[END ${locationName}, ${subLocationData.name} INFO] |`,
		vectorized: false,
		order: id,
		preventRecursion: true,
		scanDepth: 2,
		useGroupScoring: false,
		displayIndex: id
	}

	// Add boilerplate properties
	// Add entries to the book
	for (const entry in world.entries){
		book.entries[entry] = addBoilerplateProperties(world.entries[entry]);
	}

	return book;

}

function addWorldEntries(book, id, inputData) {
	let keywords = [
		inputData.name,
		inputData.name.toLowerCase(),
	].concat(cleanKeywords(inputData.extraKeys));

	const world = {entries: {}};
	world.entries[id] = {
		uid: id,
		key: keywords,
		keysecondary: [],
		comment: inputData.name,
		content: `[${inputData.name} INFO]\n${inputData.name}\n\nSummary: [\n${inputData.summary}\n]\n\nDescription: [\n${inputData.description}\n]\n\n${inputData.denizens ? `Frequently Appearing Characters: [\n${inputData.denizens}\n]\n\n` : ``}${inputData.events ? `Potential Events: [\n${inputData.events}\n]\n\n` : ``}::SUBLOCS::[END ${inputData.name} INFO] |`,
		vectorized: false,
		order: id,
		preventRecursion: true,
		scanDepth: 2,
		useGroupScoring: false,
		displayIndex: id
	}

	// Add boilerplate properties
	// Add entries to the book
	for (const entry in world.entries){
		book.entries[entry] = addBoilerplateProperties(world.entries[entry]);
	}

	return book;
}

function buildLocationsEntry(id, data) {

	return {
		key: [],
		keysecondary: [],
		comment: "Location List",
		content: data,
		constant: true,
		vectorized: false,
		selective: true,
		selectiveLogic: 0,
		addMemo: true,
		order: 8000,
		position: 1,
		disable: false,
		excludeRecursion: false,
		preventRecursion: true,
		delayUntilRecursion: false,
		probability: 100,
		useProbability: true,
		depth: 4,
		group: "",
		groupOverride: false,
		groupWeight: 100,
		scanDepth: null,
		caseSensitive: null,
		matchWholeWords: null,
		useGroupScoring: false,
		automationId: "Locations",
		role: null,
		sticky: 0,
		cooldown: 0,
		delay: 0,
		uid: id,
		displayIndex: id,
		extensions: {
			position: 1,
			exclude_recursion: false,
			display_index: id,
			probability: 100,
			useProbability: true,
			depth: 4,
			selectiveLogic: 0,
			group: "",
			group_override: false,
			group_weight: 100,
			prevent_recursion: true,
			delay_until_recursion: false,
			scan_depth: null,
			match_whole_words: null,
			use_group_scoring: false,
			case_sensitive: null,
			automation_id: "Freshman",
			role: 0,
			vectorized: false,
			sticky: 0,
			cooldown: 0,
			delay: 0
		}
	};
}

function addBoilerplateProperties(object) {

	const template = {
		constant: false,
		selective: true,
		selectiveLogic: 0,
		addMemo: true,
		position: 1,
		disable: false,
		excludeRecursion: false,
		delayUntilRecursion: false,
		probability: 100,
		useProbability: true,
		depth: 4,
		group: "",
		groupOverride: false,
		groupWeight: 100,
		caseSensitive: null,
		matchWholeWords: null,
		automationId: "",
		role: null,
		sticky: 0,
		cooldown: 0,
		delay: 0,
	};

	for (const prop in template) {
		object[prop] = template[prop];
	}

	return object;
}

function addLoreEntries(book, id, inputData) {
	// break out keywords/phrases
	const backgroundKeys = cleanKeywords(inputData.backgroundKeywords);

	const secretKeys = cleanKeywords(inputData.secretsKeywords);

	const roomKeys = [
		`${inputData.name}'s room`,
		`${inputData.dwelling}`,
		`dorm`,
		`apartment`,
		`home`,
		`room`,
	].concat(cleanKeywords(inputData.dwelling));

	const name = inputData.name.split(",")[0].trim();
	const pseudonyms = inputData.name.split(",").slice(1)?.map(p=>p.trim());

	const baseKey = [name].concat(pseudonyms)
		.filter(name => /[\w\d]+/.test(name))
		.flatMap(name => [
			`!${name}`,
			`/\\b${name}\\b(?!(?:\\s+[^\\r\\n]*?)??\\s+\\d{1,2}:\\d{2}\\s*(?:[APap][Mm])\\s+~)/`
		]);

	const lore = {entries: {}};
	lore.entries[id+5001] = {
		uid: id+5001,
		key: baseKey,
		keysecondary: [],
		comment: name,
		content: `[${name} INFO]\nIf user sends !${name}, begin roleplay as both *${name}* and {{char}}.\n\n${name} ${inputData.surname}, ${pseudonyms.length ? `AKA: [${pseudonyms.toString()}], ` : ``}${inputData.gender}, ${inputData.species}, {{getvar::${inputData.baseAge}YO}} years old${inputData.schoolYear === 'NonStudent' ? '' : ` , {{getvar::${inputData.schoolYear}}}`}.\n\nOnline Username: ${inputData.onlineHandle}\n\nSummary: [\n${inputData.summary}\n]\n\nAppearance: [\n${inputData.appearance}\n]\n\n${buildLoreOutfitSection(inputData)}Personality: [\n${inputData.personality}\n]\n\nTone: [\n${inputData.speech}\n]\n\n${inputData.quirks ? 'Quirks: [\n' + inputData.quirks + '\n]\n\n' : ''}${inputData.likes ? 'Likes: [\n' + inputData.likes + '\n]\n\n' : ''}${inputData.dislikes ? 'Dislikes: [\n' + inputData.dislikes + '\n]\n\n' : ''}${inputData.sexuality ? 'Sexuality: [\n' + inputData.sexuality + '\n]\n\n' : ''}Dorm Room/Housing: ${inputData.dwelling}\n${inputData.major ? 'Major: ' + inputData.major + '\n' : ''}${inputData.relationships ? 'Relationships: [\n' + inputData.relationships + '\n]\n\n' : ''}Always begin ${name}'s responses with "__${name}:__"\n\n |`,
		vectorized: false,
		order: id+5001,
		preventRecursion: true,
		scanDepth: 2,
		useGroupScoring: false,
		displayIndex: id+5001
	}
	if (inputData.knownBackground) {
		lore.entries[id+5002] = {
			uid: id+5002,
			key: baseKey,
			keysecondary: backgroundKeys,
			comment: `${name} Backstory/History`,
			content: `${name}'s Backstory:\n\nKnown history: [(${inputData.knownBackground})\n${inputData.backgroundFriends ? 'Friendships:(\n' + inputData.backgroundFriends + '\n' : ''}]\n\n${inputData.hiddenBackground ? 'Hidden history: [(' + inputData.hiddenBackground + ')\n]' : ''}`,
			vectorized: false,
			order: id+5002,
			preventRecursion: true,
			scanDepth: null,
			useGroupScoring: null,
			displayIndex: id+5002
		}
	}
	if (inputData.secrets) {
		lore.entries[id+5003] = {
			uid: id+5003,
			key: baseKey,
			keysecondary: secretKeys,
			comment: `${name} Secrets`,
			content: `${name}'s Secrets:\n\nSecrets About ${name}: These are secrets that ${name} has kept close to their chest and hasn't revealed to many if any at all:\n${inputData.secrets}`,
			vectorized: false,
			order: id+5003,
			preventRecursion: true,
			scanDepth: null,
			useGroupScoring: null,
			displayIndex: id+5003
		}
	}
	if (inputData.room) {
		lore.entries[id+5004] = {
			uid: id+5004,
			key: baseKey,
			keysecondary: roomKeys,
			comment: `${name} Dorm room/Housing`,
			content: `${inputData.dwelling}, ${inputData.bathroomNeighbours ? 'bathroom shared with ' + inputData.bathroomNeighbours : ''}\n${name}'s personal space [\n${inputData.room}\n]`,
			vectorized: false,
			order: id+5004,
			preventRecursion: true,
			scanDepth: null,
			useGroupScoring: null,
			displayIndex: id+5004
		}
	}
	lore.entries[id+5005] = {
		uid: id+5005,
		key: baseKey,
		keysecondary: [],
		comment: `${name} End Section`,
		content: `[END ${name} INFO]\n-----`,
		vectorized: false,
		order: id+5005,
		preventRecursion: true,
		scanDepth: 2,
		useGroupScoring: false,
		displayIndex: id+5005
	}

	// Add boilerplate properties
	// Add entries to the book
	for (const entry in lore.entries) {
		book.entries[entry] = addBoilerplateProperties(lore.entries[entry]);
	}

	return book;
}

function buildRosterEntry(id, data) {

	return {
		key: [],
		keysecondary: [],
		comment: "Character Roster",
		content: data,
		constant: true,
		vectorized: false,
		selective: true,
		selectiveLogic: 0,
		addMemo: true,
		order: 5000,
		position: 1,
		disable: false,
		excludeRecursion: false,
		preventRecursion: true,
		delayUntilRecursion: false,
		probability: 100,
		useProbability: true,
		depth: 4,
		group: "",
		groupOverride: false,
		groupWeight: 100,
		scanDepth: null,
		caseSensitive: null,
		matchWholeWords: null,
		useGroupScoring: false,
		automationId: "Roster",
		role: null,
		sticky: 0,
		cooldown: 0,
		delay: 0,
		uid: id,
		displayIndex: id,
		extensions: {
			position: 1,
			exclude_recursion: false,
			display_index: id,
			probability: 100,
			useProbability: true,
			depth: 4,
			selectiveLogic: 0,
			group: "",
			group_override: false,
			group_weight: 100,
			prevent_recursion: true,
			delay_until_recursion: false,
			scan_depth: null,
			match_whole_words: null,
			use_group_scoring: false,
			case_sensitive: null,
			automation_id: "Freshman",
			role: 0,
			vectorized: false,
			sticky: 0,
			cooldown: 0,
			delay: 0
		}
	};
}

function cleanKeywords(keywords) {
	if (!keywords) return [];
	return keywords
		.replace(/"/g,"") // Clean up all instances of `"`
		.split(`,`) // Split the string into an array pf clean phrases
		.map(s => s.trim()) // Trim the leading spaces of each phrase
		.filter(s => s); // Filter out empty strings
}
