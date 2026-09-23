// Curated SDXL appearance references supplied by WeyPhone's maintainer. These are intentionally
// kept separate from character cards: cards explain who somebody is, while this library preserves
// the precise booru-style visual tags that repeatedly reproduce difficult designs well.

const APPEARANCES = Object.freeze({
    Aethel: {
        tags: '(kemonomimi mode), medium breasts, cat girl, cat tail, white tail, cat ears, white animal ear fluff, dropped ears, ears folded back, ears tugged back, flat ears, folded ears, (grey hair:1.3), medium hair, swept bangs, messy bangs, long bangs, fanged bangs, hair between eyes, sidelocks, grey eyes, grey hoodie, pink athletic shorts, cozy casual clothes',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Aiko: {
        tags: 'kemonomimi mode, (near-black hair:1.4), very dark grey hair, almost pure black hair, long hair, crossed bangs, cat ears, cat tail, pale skin, blue eyes, (no pupils:1.3), (empty eyes:1.2), (large red bow:1.2), bow worn at back of head, gothic lolita, ghost, spirit, (see-through body:1.2), transparent body, semi-transparent, ethereal glow, (cool blue blush:1.2), vintage 1950s black gothic dress, ruffled dress, fitted bodice, full skirt, red corset lacing at waist, saddle shoes, gothic lolita fashion',
        note: 'A 1950s-era ghost nekomimi: mostly corporeal but with a subtle unsettling flicker, faintly see-through, hair drifting gently as if in an unseen wind. Her single oversized red bow sits low at the back of her head, not as twin pigtail bows. Her eyes have no pupils/iris (empty, glowing softly blue when excited) - never draw normal pupils. Her blush, when visible, is a soft cool blue, never pink or red. She can float, sit on ceilings, or appear partially incorporeal (fading legs, visible faint skeleton) when she chooses - only include these when the scene specifically calls for it.',
        avoid: 'white skin, pale white skin, iris, two bows, twin bows, pink blush, red blush, opaque, solid body, fully human, human ears, background ghosts, ghost cat, spirit animal, floating ghost cat, cat-shaped apparition, cat spirit, (human ears:1.2), (human ear:1.2), pointed ears, background characters, background monsters, background spirits, multiple spirits, 2girls, multiple girls, second ghost, extra ghost, elf ears',
        variants: [{
            label: 'Terrifying ghost form - use only when the scene calls for her horror side',
            tags: '(skeletal arm:1.3), exposed bone hand, torn clothes, wet hair, (glowing eyes:1.2), scary, spooky, horror atmosphere, unsettling presence, half closed eyes',
        }],
    },
    Ahset: {
        tags: 'nekomimi, cat ears, blonde cat ears, cat tail, blonde cat tail, blonde hair, crossed bangs, high ponytail, straight hair, blue eyes, cold stare, furrowed brow, athletic build, toned arms, Egyptian clothing, fitted white linen top, short white skirt, golden jewelry, golden arm bands, golden anklet, sheathed sword, jade dagger, weapon at hip, black sandals',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Astrid: {
        tags: 'broad shoulders, medium breasts, okamimimi, freckles, body freckles, freckles on ass, wolf ears, wolf tail, long black hair, messy bangs, blue eyes, off-shoulder black sweater top, dark jeans, well-groomed casual clothes',
        avoid: 'blue tail, dark blue tail, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Ava: {
        tags: 'white fox ears, white fox tail, white hair, crossed bangs, kemonomimi mode, short hair, light blue inner ear, light blue inner hair, animal ear fluff, dark skin, purple eyes, medium breasts, wide hips, white knitted sweater, grey jeans, blue choker, casual clothes',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Bap: {
        tags: 'short, round face, short hair, black hair, black cat tail, black cat ears, (red inner hair:1.3), red inner ear, (black animal ear fluff:1.5), medium breasts, swept bangs, messy bangs, wispy bangs, red eyes, black shirt, red shorts, casual clothes',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Bastet: {
        tags: 'kemonomimi mode, black cat ears, yellow inner ears, black cat tail, black hair, yellow inner hair, (white animal ear fluff:1.3), crossed bangs, long hair, ponytail, gold eyes, (light brown skin:1.2), warm skin tone, wide hips, medium breasts, gold jewelry, brown halter top, brown crossed top, thick golden clasp, gold chains, black cargo pants, low-rise pants, gold bracelet, gold necklace, usekh collar, belly chain, bare shoulders, midriff, cleavage',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears, (very dark skin:1.2), ebony skin',
    },
    Belle: {
        tags: 'kemonomimi mode, white wolf ears, red inner ears, (white wolf tail:1.4), two-toned hair, white hair, red inner hair, (white animal ear fluff:1.5), crossed bangs, long hair, messy hair, pink eyes, kind eyes, wide hips, medium breasts, black t-shirt, black ripped jeans, collar, studded bracelet, punk clothes',
        avoid: 'red tail, red wolf tail, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Bianca: {
        tags: 'raccoon tail, brown eye, medium breasts, light brown raccoon ears, raccoon girl, messy bangs, long bangs, hair over right eye, eyepatch on right eye, bangs covering eyepatch, hair over one eye, short hair, light brown hair, white tank top, cargo pants, necklace, black eyepatch, worn camera bag, comfort outfit',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Blake: {
        tags: 'kemonomimi mode, black wolf ears, red inner ears, wolf tail, two-toned hair, black hair, red inner hair, (white animal ear fluff:1.3), crossed bangs, long hair, messy hair, amber eyes, wide hips, medium breasts, gold wolf ear piercings, black crop top, black ripped jean shorts, black thighhighs, studded belt, black choker, fur-trimmed leather jacket, off-shoulder jacket, punk clothes',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Briar: {
        tags: 'kemonomimi, animal ears, brown hyena ears, hyena pattern hair, hyena tail, orange eyes, blonde hair, long hair, medium breasts, broad shoulders, (spotted hair:1.5), tan, tanned skin, black ears, freckles, animal ear fluff, red plaid shirt, torn shirt, black tank top, long sleeves, very long sleeves, cargo pants, bulging pockets, rocks protruding from pockets, black leather bracelet, hiking boots',
        note: 'If her nipples are visible, they are grey; if her vulva is visible, it is grey (matching her spotted hyena coloring) - only applies when actually exposed/nude, never implies nudity on its own.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Cairo: {
        tags: '(1boy:1.3), (male:1.3), thin, lanky, femboy, black wolf ears, black wolf tail, grey eyes, (red inner hair:1.2), red inner ears, (white animal ear fluff:1.3), medium hair, black hair, crossed bangs, messy hair, pale skin, long bangs, black hoodie, (hood up:1.5), jeans',
        avoid: '1girl, female, feminine features, breasts, penis, wide hips, female pubic mound, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Deredra: {
        tags: 'mature female, dark purple hair, long hair, intricate braids, hair ornament, hair jewelry, (purple horns:1.5), curled horns, green eyes, slit pupils, medium breasts, large breasts, gold necklace, gold bracelets, white layered top, off-shoulder top, halter top, layered top, grey fitted trousers, mesh chest',
        note: 'In her homeland, replace the fitted trousers with a long draped skirt.',
        avoid: 'pointed ears, elf ears',
    },
    Dash: {
        tags: 'medium breasts, black bracelets, kemonomimi, animal ears, cheetah ears, cheetah pattern hair, cheetah tail, cheetah girl, long tail, brown eyes, blonde hair, medium hair, crossed bangs, broad shoulders, (spotted hair:1.5), tan, tanned skin, black ears, freckles, animal ear fluff, excited, multiple ear piercings, grey tank top, brown cargo shorts',
        avoid: 'tanlines, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Ellie: {
        tags: 'fox ears, furrowed brow, long hair, blonde hair, beige hair, hair over one eye, red eyes, light blush, fox tail, broad shoulders, white animal ear fluff, black bolo tie, black waist belt, red dress, pinafore dress, white blouse top, rolled up sleeves, short dress',
        note: 'When nervous or shy (her default state around anyone she isn\'t fully comfortable with), she pins one fox ear flat down while the other stays perked straight up - an asymmetric ear tell. She almost never makes direct eye contact; her gaze is typically averted, downward, or to the side rather than at the viewer or her partner.',
        avoid: 'nightgown, lace dress, cleavage, transparent clothing, long dress, lingerie, extra ears, human ears, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Eve: {
        tags: 'hair over one eye, asymmetrical bangs, parted bangs, half-closed eyes, black to grey ombre tail, wolf tail, black nails, white animal ear fluff, black wolf ears, black ears, silver hair, hair swept to side, spiked black choker, necklace, bracelets, red eyes, ponytail, medium breasts, fishnet thighhighs, off-the-shoulder crop-top, midriff, black cargo shorts',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Fasti: {
        tags: '(1boy:1.3), (male:1.3), thin, lanky, femboy, red eyes, short hair, black hair, wavy hair, messy hair, very pale skin, pale skin, long bangs, red bracelets, black spade tail, black skull t-shirt, black pants',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, pointed ears, elf ears',
    },
    Fawne: {
        tags: 'broad shoulders, messy bangs, freckles, body freckles, freckles on ass, wolf ears, deep blush, wolf tail, black hair, short hair, blue eyes, ponytail, white animal ear fluff, blue cargo shorts, black and blue employee uniform, store clerk',
        note: 'These tags are her 7/11 uniform; use a concrete cozy outfit when the scene is not at work.',
        avoid: 'blue tail, dark blue tail, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Gem: {
        tags: 'short hair, grey hair, blue inner hair, blue inner ear, grey wolf tail, crossed bangs, blue hair streak, lavender eyes, glasses, flat chest, grey wolf ears, animal ear fluff, hairpin, cargo pants, black jacket, white t-shirt',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Gemini: {
        tags: '(1boy:1.3), (mature male:1.3), long hair, low-tied long hair, wolf ears, animal ear fluff, wolf tail, light brown hair, orange eyes, crossed bangs, arm tattoos, tribal tattoos, muscular, black shirt, black t-shirt, jeans',
        note: 'Unofficial reference.',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Hannah: {
        tags: 'large freckles, freckled face, long wavy hair, long brown hair, long brown wolf tail, gray eyes, medium breasts, wolf ears, swept bangs, messy bangs, wispy bangs, animal ear fluff, long bangs, brown cargo pants, black hoodie',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Indigo: {
        tags: 'long hair, (magenta hair:1.3), hair color hex #691d43, crossed bangs, (white animal ear tufts:1.2), (magenta-pink eyes:1.2), eye color hex #e0559d, wolf ears, wolf tail, medium breasts, sundress, black dress',
        note: 'Hair color is dark magenta, hex #691d43 — do not brighten it. Eyes are a brighter, more saturated magenta-pink (hex #e0559d), clearly lighter and more vivid than the hair color, not the same shade. Ear tufts are white, not the hair color.',
        avoid: 'eyes the same color as hair, multicolor hair, pink hair, dark purple hair, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Jenn: {
        tags: 'long hair, grey hair, (red inner hair:1.3), red inner ear, grey wolf tail, blue eyes, small breasts, swept bangs, messy bangs, wispy bangs, animal ear fluff, long bangs, wolf ears, red shirt, jeans',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Jericho: {
        tags: '(1boy:1.3), (mature male:1.3), burgundy eyes, (medium hair:1.8), black hair, (high ponytail, short ponytail:1.3), (no bangs, short bangs:1.0), (single sidelock:2.0), (stubble:2.8), (black goatee:1.3), multiple piercings, ear piercings, arm tattoo, sleeve tattoo, botanical tattoo, punk aesthetic, neck tattoo, (colorful tattoos:1.7), (tsurime:1.3), bags under eyes, (iridescent hair shine:0.9), silver ring, multiple rings, multiple ear piercings, brown apron, black dress shirt, black jeans, sleeves rolled up, three quarter sleeves',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, pointed ears, elf ears',
    },
    Kai: {
        tags: 'teal shark tail, (teal hair:1.5), medium hair, medium bangs, messy hair, pink eyes, wide hips, medium breasts, (hair over one eye:1.1), (abs:.2), black hoodie, cropped hoodie, jeans',
        avoid: 'pointed ears, elf ears, head fin, hair fin',
    },
    Karmen: {
        tags: 'kemonomimi mode, dark blue wolf ears, wolf tail, dark blue hair, animal ear fluff, crossed bangs, long hair, grey eyes, kind eyes, medium breasts, white button up shirt, blue pleated skirt',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Khepri: {
        tags: '(1boy:1.3), male focus, okamimimi, wolf boy, black wolf ears, gold ear fluff, gold inner ears, fluffy ear tufts, black wolf tail, long black hair, messy black hair, shoulder length hair, (dark-skinned male:1.3), bronze skin, golden eyes, slit pupils, smokey eyeliner, thick black eyeliner, kohl eyeliner, sharp features, angular face, strong jawline, handsome, ancient egyptian, gold trim, gold usekh collar, wide necklace, gold arm bands, gold jewelry, barefoot, black shendyt, wrapped skirt, bare chest',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Kiera: {
        tags: 'black fish tail, black tail, (toned female:.3), purple eyes, tall female, long hair, black hair, white inner hair, large breasts, crossed bangs, thick thighs, black sundress, short skirt, white dress shirt',
        avoid: 'pointed ears, elf ears',
    },
    Koshizu: {
        tags: 'cute face, red eyes, white hair, long hair, medium breasts, white dog ears, floppy ears, crossed bangs, white dog tail, light blush, (decora fashion:1.7), (decora:1.6), (harajuku fashion:1.5), (multiple hair clips:1.5), colorful hair clips, (layered ribbons:1.4), pastel colors, plastic beads, star hair clips, heart hair clips, decora, off-shoulder jacket, open jacket, white heart t-shirt, black shorts, holographic backpack',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Kressa: {
        tags: 'dark purple wolf tail, medium hair, dark purple hair, pink eyes, pink inner ear, two-tone hair, medium breasts, swept bangs, messy bangs, wispy bangs, (white animal ear fluff:1.1), pink inner hair, long bangs, round glasses, sidelocks:1.3, maroon shirt, black pleated skirt, fishnet pantyhose',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Kris: {
        tags: '(1boy:1.3), black cat tail, black cat ears, yellow eyes, broad shoulders, swept bangs, messy hair, medium hair, black hair, blue teardrop pendant, pendant, maroon shirt, maroon t-shirt, untucked shirt, black cargo pants',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, femboy, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Lentyl: {
        tags: '(1boy:1.3), (male:1.3), thin, mouse ears, mouse tail, orange eyes, short hair, pink hair, hair clip, (hair over one eye:1.1), messy hair, pale skin, long bangs, femboy, black hoodie, jean shorts',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Lucy: {
        tags: 'short, round face, short pink hair, pink cat tail, pink cat ears, medium breasts, swept bangs, messy bangs, wispy bangs, pink bracelets, pink choker, green eyes, blue hoodie, cargo pants',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Luna: {
        tags: 'medium hair, lavender hair, (messy hair:.2), deep blush, wolf tail, lavender eyes, medium breasts, wolf ears, long bangs, crossed bangs, wide hips, black t-shirt, black shorts, white hoodie, open hoodie, jacket',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Loona: {
        tags: 'anthro, helluva boss, loona, loona (/helluva_boss/), loona_(helluva_boss), silver hair, dense short matte white fur, visible fur texture, hair swept to side, (long snout:1.3), (blocky snout:1.2), snout, long canine muzzle, black nose, (canine philtrum:1.3), red sclera, digitigrade legs, paws, black paw pads, (long fluffy wolf tail:1.3), long tail, black tail, white understripe, black tail with white underside stripe, off-the-shoulder crop-top, toeless socks, stirrup legwear, stockings, fingerless gloves, black short shorts, hellhound',
        note: 'Conditional visual locks: if her head is visible, preserve her long canine snout, black nose, and visible canine philtrum. Every exposed part of her female torso, abdomen, hips, buttocks, and thighs remains covered in dense short matte white fur with visible fur texture and a soft furry silhouette, never glossy human skin. If her nipples are visible, they are grey; if her vulva is visible, it is grey. For oral sex, keep her long muzzle visible and her jaws naturally open around the penis; her canine lips pull backward rather than sealing around the shaft, leaving her small sharp teeth visible beside it and her tongue beneath it. Use a soft flustered expression with relaxed brows and half-lidded eyes. When her vulva is presented, render a plump closed vulva with closed labia; keep her hands away from it rather than spreading it. She is humanoid/anthro with ordinary human hands and thumbs. Only use paws/paw pad tags when the undersides of her feet are genuinely visible to the viewer in the shot (for example hugging her knees to her chest) — her paws are her feet (a product of her digitigrade dog-like leg structure), not her hands, and must not be written into a pose just because her legs or a surface her hand touches are in frame. In a face-only or close-up framed shot (POV close-up, portrait, mouth/face focus), her legs and feet are outside the crop entirely — do not include paws, paw pads, toeless socks, or stirrup legwear at all in that shot, and do not distort the framing or pull her legs/feet into view just to depict them; the locked-identity-tag rule does not override what the chosen framing can actually show. Her tail is long and fluffy, wolf-like, black on top/through the body with a white stripe running along its underside (an understripe, not a tip) - never a white-tipped tail, never short, stubby, rounded like a rabbit tail, or a single solid color.',
        avoid: '(grey skin:1.3), (white skin:1.3), human skin, hairless, human female, muzzle_(object), (multiple tails:1.4), extra tail, duplicate tail, two tails, second tail, tailless, short tail, rabbit tail, (human ears:1.2), elf ears, extreme crouch, contorted legs, spread labia, gaping pussy',
        variants: [{
            label: 'adult NSFW anatomy; use only when visibly exposed in the shot',
            tags: 'grey nipples, grey pussy',
        }],
    },
    Lurkle: {
        tags: 'silver hair, (red inner hair:1.3), red streaked hair, red eyes, :3, small breasts, crossed bangs, fully human, (hood up:1.5), hood, hooded, red hoodie, animal ear hoodie, (costume wolf ears sewn onto hood:1.3), red animal hood, graphic hoodie, white heart, black shorts',
        note: 'Lurkle is fully human. The pointed wolf ears are sewn onto her hoodie; she has no animal ears, tail, paws, fur, digitigrade legs, or other wolf anatomy.',
        avoid: 'wolfgirl, wolf girl, kemonomimi, real wolf ears, biological animal ears, animal ears on head, animal ear fluff, wolf tail, animal tail, tail, paws, digitigrade legs, fur, pointed ears, elf ears',
    },
    Lyris: {
        tags: 'short hair, orange hair, crossed bangs, wolf tail, green eyes, small breasts, wolf ears, long bangs, white t-shirt, overalls, tool belt, construction worker, knee pads',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Mika: {
        tags: 'short, cute, long hair, black hair, hair flaps, long bangs, center-flap bangs, orange eyes, glasses, black glasses, ahoge, small breasts, wolf girl, wolf ears, wolf tail, animal ear fluff, :3, skin fang, black clothes, black t-shirt, black shirt, black skinny jeans, black pants',
        note: 'Keep scenes solo or monogamous.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Miu: {
        tags: 'nekomimi, cat girl, long wavy red hair, messy braid, loose hair, red cat ears, lighter inner ears, animal ear fluff, red cat tail, tan skin, warm skin tone, red eyes, bright red eyes, medium breasts, curvy, soft body, black beaded veil, mesh veil covering mouth, face veil, transparent veil, eyes visible, half closed eyes, red top, red skirt, red halter top, short skirt, red linen wraps, loose wraps, comfortable clothing, midriff, tight skirt, ancient egyptian, gold jewelry, gold bracelets, gold animal ear earrings, black beaded face veil',
        note: 'Miu has warm bronze-tanned skin, not very dark or black skin.',
        avoid: 'very dark skin, ebony skin, black skin, pale skin, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Muse: {
        tags: 'indigo eyes, (slime girl:1.35), (slimegirl:1.35), (entire body made of warm rose-pink slime:1.5), (rose pink skin:1.4), (pink face:1.4), (rose-pink slime face:1.4), gelatinous face, colored skin, gelatinous body, smooth continuous self-supporting gel surface, glossy wet slime surface, liquid body, dripping slime, (slime hair:1.4), long liquid hair, tentacle hair, slime tentacles, (multiple rose-pink slime tentacles emerging directly from her back:1.4), distinct back tentacles separate from her hair, visible tentacle roots on shoulder blades and lower back, medium breasts, (semi-transparent rose-pink slime body:1.5), (translucent gelatinous body:1.5), see-through slime, light passing through limbs, translucent edges, subsurface glow, frilly dress',
        note: 'Every visible part of Muse is the same continuous warm rose-pink slime material, including her pink gelatinous face, neck, breasts, torso, arms, hands, pussy, hips, thighs, legs, feet, and liquid tentacle hair. Her reference body color centers around #D47E98. The gel surface is smooth and self-supporting, never a tight garment over skin. Several additional non-phallic slime tentacles emerge directly from her back, separate from her hair, and curl or wag behind her like an excited puppy tail.',
        avoid: 'human skin on female, flesh-colored female, human-colored female face, human-colored female breasts, human-colored female torso, pale female skin, peach female skin, beige female skin, normal female skin, opaque flesh body, body paint, pink hair on a human body, dark purple skin, deep purple body, black slime, latex, latex bodysuit, bodysuit, catsuit, tight suit, tight clothes, skin-tight clothing, leather, rubber suit, clothing wrinkles, fabric folds, cloth creases, seams, stitching, zipper, waistband, leotard, ahoge, huge ahoge, upright ahoge, antenna hair, head antenna, head tentacle, single tentacle on head, lanternfish lure, suu (monster musume), monster musume, penis tentacles, phallic tentacles, penis-shaped tentacles, tentacle penises, glans-shaped tentacle tips, pointed ears, elf ears',
    },
    Nara: {
        tags: 'okamimimi, maroon wolf ears, white ear tufts, maroon wolf tail, long maroon hair, wavy hair, messy hair, grey eyes, medium breasts, toned female, curvy, multiple ear piercings, black t-shirt, ripped t-shirt, ripped jeans, casual clothes',
        note: 'Nara needs glasses but vainly refuses to wear them; draw no glasses unless explicitly requested. Her retractable claws appear only when frightened, angry, or aroused. Her many adaptive social modes are all genuine parts of her.',
        avoid: 'glasses, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Nathan: {
        tags: '(1boy:1.3), wolf boy, dark blue wolf ears, dark blue wolf tail, medium hair, long hair, dark blue hair, swept bangs, heterochromia, blue eye, red eye, black watch, handsome, (toned male:1.3), expensive watch, black button shirt, untucked shirt, dark blue jeans',
        note: 'Unofficial reference.',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Nefara: {
        tags: 'monster girl, dark red hair, medium hair, snake hair, dark red snake hair, writhing snakes, long tail, snake tail, dark red tail, dark-skinned female, bronze skin, amber eyes, curvy, parted bangs, asymmetrical bangs, medium breasts, gold jewelry, gold ring bracelet, gold necklace, belly chain, ancient egyptian, brown halter top, brown top, crossed top, bare shoulders, midriff, sheer brown hip wrap',
        avoid: 'pointed ears, elf ears',
    },
    Neshe: {
        tags: 'okamimimi, broad shoulders, dark blue wolf ears, (black tail:1.3), wolf tail, (dark blue hair:1.4), short hair, medium hair, messy bangs, blue eyes, multiple ear piercings, freckles, body freckles, torn clothes, ripped jeans, black t-shirt, band t-shirt, combat boots, black shirt, off one shoulder, exposed shoulder, black tank top under, black undershirt',
        note: 'Neshe has dark-blue hair and wolf ears, but a black tail. She is a resourceful thief and self-taught repairer, not a mechanic or a student.',
        avoid: 'blue tail, dark blue tail, black hair, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Nix: {
        tags: '(black cat ears:1.5), black cat tail, (black hair:1.5), orange inner ear, kemonomimi mode, short hair, orange inner hair, medium bangs, messy bangs, (white animal ear fluff:1.5), orange eyes, (hair over one eye:1.1), small breasts, multiple ear piercings, black graphic t-shirt, jeans',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    'Professor Akiyama': {
        tags: 'long hair, crown braid, parted bangs, fluffy hair, pink hair, blue eyes, black-framed eyewear, semi-circular eyewear, fox ears, pink fox tail, white tail tip, single tail, one tail, leather bracelets, medium breasts, teal dirndl, medium dress, teacher, classroom, black bodice, knee boots',
        note: 'Professor Sayori Akiyama has one pink fox tail with a white tip and wears black semicircular glasses.',
        avoid: 'multiple tails, two tails, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
        aliases: ['Akiyama'],
    },
    Rein: {
        tags: 'kemonomimi mode, light blue wolf ears, wolf tail, light blue hair, white animal ear tuft, (yellow inner hair:1.5), long hair, crossed bangs, yellow eyes, medium breasts, mature female, shoulder tattoo, flower tattoo, black tattoo, wide hips, black denim shorts, white shirt, off-shoulder shirt, single bare shoulder',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Rivera: {
        tags: 'long hair, dark green hair, long dark green fox tail, medium breasts, large breasts, green fox ears, orange inner ear, orange eyes, (white animal ear fluff:1.3), wide hips, crossed bangs, cheerleader, green cheerleader outfit',
        note: 'Rivera is a single-tailed kitsune. Cheerleading is her role, not a permanent theme for every outfit.',
        avoid: 'multiple tails, two tails, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Rosa: {
        tags: 'hellhound, wolf ears, red animal ear fluff, wolf tail, black to red ombre tail, black hair, red hair streaks, long hair, asymmetrical bangs, hair swept to side, red eyes, medium breasts, black lips, sharp teeth, multiple piercings, black nails, full-body tattoo, leg tattoos, spiked black choker, sleeveless top, knee-high boots, corset, ripped band tee, damaged clothes, miniskirt, fishnets, t-shirt',
        note: 'Rosa is an occultism and religious-history student, and a genuine source of loud punk joy whose bravado also protects old spiritual wounds.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Serra: {
        tags: 'kemonomimi mode, black wolf ears, black wolf tail, black hair, low ponytail, crossed bangs, (cyan inner ear:1.1), light blue inner hair, white animal ear fluff, cyan eyes, small breasts, wide hips, black choker, nipple piercings, black tank top, brown shorts',
        note: 'Serra has a compulsive neurological stutter in every speaking context. It is not optional, situational, or a sign that she lacks wit.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Seth: {
        tags: '(1boy:1.3), (mature male:1.3), grey hair, medium hair, low ponytail, blue eyes, grey wolf ears, grey wolf tail, toned male, black shirt, jeans, green jacket, cargo jacket, fur-trimmed jacket',
        note: 'Seth is a 24-year-old male nurse. His Standard is his creator-supplied casual outfit; navy scrubs are a separate work outfit.',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Shani: {
        tags: 'broad shoulders, small breasts, medium hair, messy hair, brown hair, freckles, shark girl, sand tiger shark, shark tail, brown shark tail with stripes, (opaque brown blindfold:1.5), completely covered eyes, no visible eyes, blind, tan skin, warm skin tone, brown halter top, brown top, bare shoulders, shendyt, brown short skirt, gold jewelry, gold bracelets, gold anklet, barefoot',
        note: 'Shani is blind and always wears an opaque brown linen blindfold. Her eyes, pupils, and irises must never be visible in any outfit, pose, mode, or animation.',
        avoid: 'visible eyes, uncovered eyes, exposed eyes, pupils, irises, eye contact, looking at viewer, transparent blindfold, translucent blindfold, see-through blindfold, lifted blindfold, removed blindfold, blindfold off, sleep mask, tan lines, collar, necklace, usekh collar, very dark skin, ebony skin, black skin, pale skin, (human ears:1.2), (human ear:1.2), pointed ears, elf ears, head fin, hair fin, shark onesie',
    },
    Sobek: {
        tags: '(1boy:1.3), male focus, (dark-skinned male:1.3), gorgon, lamia, monster boy, medium hair, black snake hair, snake hair, gold undersides, long tail, snake tail, black and gold snake tail, coiled tail, bronze skin, amber eyes, sharp features, scars, chest scars, shoulder scars, arm scars, heavily scarred, muscular, powerful build, broad shoulders, ancient egyptian, egyptian collar, gold necklace, gold jewelry, sheathed khopesh at side, weapon visible, minimal coverage, bare chest, sheathed sword',
        note: 'Sobek is a male gorgon-lamia with a sixteen-foot serpentine lower body. Conventional trousers, underwear, and swim trunks do not fit his anatomy.',
        avoid: '1girl, female, feminine features, breasts, wide hips, female pubic mound, human legs, pants, trousers, shorts, swim trunks, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Sofya: {
        tags: 'sharp teeth, fangs, white hair, long hair, hime cut, hime bangs, bat ears, white ears, orange inner ears, black ear tips, white ear fluff, bat wings, orange wing membranes, low wings, orange eyes, ringed eyes, glowing eyes, kemonomimi, kohl eyeliner, thick eyeliner, black watch, large breasts, blue ribbon choker, black wide leg trousers, white peasant blouse, off shoulder, loose sleeves, (strappy bralette:1.4), chest harness, sternum strap',
        note: 'Sofya is a Koumenese desert-bat demihuman. Her low-mounted black wings have orange membranes and must remain visible through open-backed clothing. Do not call her a vampire.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears, vampire, hidden wings, missing wings',
    },
    Summer: {
        tags: 'long wavy hair, long red hair, deep blush, solid red wolf tail, red eyes, medium breasts, wolf ears, long bangs, pink t-shirt, gray pleated skirt',
        note: 'Summer is half okamimimi and half vampire. She is bubbly, sassy, teasing, defensive, and self-doubting—not secretly submissive merely because praise affects her.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears, white-tipped tail, white tail tip, cream tail tip, pale tail tip, multicolored tail',
    },
    Sunny: {
        tags: 'kemonomimi mode, cat ears, orange cat ears, animal ear fluff, cat tail, orange cat tail, (tabby stripes:1.3), striped hair, orange hair, white hair, two-toned hair, messy hair, shoulder-length hair, orange eyes, petite, small breasts, black band t-shirt, ripped jeans, black vans, punk aesthetic',
        note: 'Orange tabby markings - horizontal banding on her hair, ears and tail, never vertical tiger striping.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears, tiger stripes, vertical hair streaks',
    },
    Tawny: {
        tags: 'owl girl, fukuroumimi, (mature female:1.3), adult, feathered ear tufts, owl ears, feathered tail, short tail, layered tail feathers, banded tail tip, light brown hair, white hair tips, white bangs, long hair, amber eyes, (small pupils:1.2), thin, slim, small breasts, (mottled owl feather pattern:1.6), (owl feather pattern on head:1.5), owl feather markings, human hands, pale skin, long black nails, sharp black nails, (black nails:1.2), pale scars on arms, plain brown pleated dress, knee-length dress, (white turtleneck:1.2), fluffy sweater, long sleeves, brown shoes',
        note: 'Owl-pattern markings sit specifically on the crown of her hair and her feathered ear tufts - horizontal barring and mottling in the style of a tawny owl, not vertical streaks or tiger stripes. She has an ordinary human face and nose - no beak, ever. Her claws are non-retractable and always visible on every finger - never draw retracted or sheathed nails. Default resting posture holds her arms folded behind her back. Her tail is a broad layered fan of feathers (not a fur tail) matching her hair color and pattern, and it visibly reacts to her mood - flaring when startled, bobbing when happy, drooping when sad - include only when the scene calls for it.',
        avoid: 'beak, human ears, pointed ears, elf ears, vertical hair streaks, hair stripes, tiger stripes, gradient eyes, heterochromia, black hands',
    },
    Vera: {
        tags: 'purple hair, short hair, hair covering ears, crossed bangs, (red inner hair:1.5), multicolored hair, (red curled horns:1.2), red goat horns, (messy hair:1.5), hairpin, red dragon tail, orange eyes, medium breasts, wide hips, black leather bracelet, (backswept horns:1.3), horns curving backward, black graphic shirt, black shorts, punk, studded belt',
        note: 'Vera’s public smiles, giggles, apologies, and sweetness should look completely natural. She is privately bitter and suspicious, but trusted warmth and playful affection are also real.',
        avoid: 'miniskirt, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
        variants: [{
            label: 'girlfriend/date outfit with grown-out hair',
            tags: 'dark purple hair, (red inner hair:1.5), (red curled horns:1.2), (messy hair:1.5), medium hair, shoulder-length hair, asymmetrical bangs, multicolored hair, orange eyes, slit pupils, gold hair clip, red dragon tail, black sweater, (off-shoulders sweater:1.2), (sleeveless undershirt:1.3), layered clothing, purple pleated skirt, medium length skirt, (backswept horns:1.3), horns curving backward',
        }],
    },
    Vesper: {
        tags: 'medium red hair, crossed bangs, wolf tail, blue eyes, medium breasts, wolf ears, long bangs, (toned arms:.2), wide hips, white t-shirt, overalls, tool belt, construction worker, knee pads',
        note: 'Vesper works construction with her younger sister and does not attend Weyland University. Her strength and job should not become themes on every private garment.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    Vindica: {
        tags: 'long wavy hair, long red hair, wolf tail, red eyes, crossed bangs, glasses, royal braid, mature female, medium breasts, wolf ears, long bangs, grey skirt, pencil skirt, grey suit',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears, young, youthful, teen',
    },
    Warren: {
        tags: 'kemonomimi mode, white wolf ears, pink inner ears, wolf tail, two-toned hair, white hair, pink inner hair, white animal ear fluff, (hair over one eye:1.1), long hair, pink eyes, half closed eyes, pale skin, light blush, medium breasts, wide hips, white button up shirt, black pants, short pants',
        note: 'Warren is a 24-year-old psychology student and evening pianist at Sakurai Cafe. Her sleepy manner hides sharp observation, not indifference or incompetence.',
        avoid: '(human ears:1.2), (human ear:1.2), pointed ears, elf ears',
    },
    'Yue-Lin': {
        tags: 'yuelin_protogen, (protogen:1.1), protogenv2, (anthro:1.1), wolf, (no pupils:1.5), solid eyes, zigzag mouth, (grey chest_plate:1.4), (armor under clothes:1.4), (protogen armor:1.1), protogen visor, glossy black visor, (protogen shoulders:1.2), (robotic thighs:1.2), grey thigh armor, (organic furry belly:1.2), white fur on stomach, organic red hands, organic wolf ears, white paws, digitigrade legs, paws, maroon_red_fur, maroon fur, white_fur_highlights, red wolf tail, white under tail, white inner ears, white ruff, fluffy ruff, red sweater, off-shoulder sweater, (sweater worn over chest plate:1.3), exposed midriff, shoulder armor visible, thigh armor visible, furry belly, bare paws, black shorts',
        note: 'A living anthro wolf, not a robot or android. Her chest, shoulders and thighs carry fused protogen plating, and in place of a face she has a glossy black display in a gunmetal frame, shaped like an anthro snout rather than a flat dome. Thigh armor starts at the hip and extends to the knee. Below the knee, the digitigrade legs and paws are organic and furry. Her belly, hips, hands, paws and ears are organic fur and skin, and her clothing is worn over the plating.',
        avoid: '(pupils:1.4), (detailed eyes:1.4), elf ears, (bare breasts:1.5), (exposed breasts:1.5), cleavage, (shin armor:1.4), (armored boots:1.2), greaves, (armor over crotch:1.3), codpiece, teeth, tongue, (mechanical hands:1.2), (robot hands:1.2), mechanical arms, shoes, footwear',
        aliases: ['Yue'],
    },
    Zora: {
        tags: '(mature female:1.3), hyena ears, hyena tail, large ears, animal ear fluff, kemonomimi mode, amber eyes, sandy blonde hair, short messy hair, dark roots, (spotted hair:1.4), gold ear piercings, deep brown skin, heavyset, broad shoulders, curvy, large breasts, freckles, weathered face, grey tank top, worn apron, jeans, barefoot',
        note: 'Zora Adeyemi is a visibly mature 47-year-old hyena demihuman, broader, heavier, more weathered, and darker-skinned than her younger relatives. She owns and single-handedly operates the failing Mama’s Den dive bar.',
        avoid: 'young, youthful, teen, twenties, slim build, clean pristine hair, briar, (human ears:1.2), (human ear:1.2), pointed ears, elf ears',
        aliases: ['Zora Adeyemi', 'Mama'],
    },
});

function clean(value) {
    return String(value ?? '').trim();
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function namesFor(name, appearance) {
    return [name, ...(appearance.aliases ?? [])].sort((a, b) => b.length - a.length);
}

function mentionedIn(text, name) {
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(text);
}

/** Returns only curated cards whose names occur in the current three-message scene. */
export function resolvePawXaiAppearanceReferences(source = {}) {
    const explicitNames = new Set([
        clean(source.characterName),
        ...(source.contextMessages ?? []).map(entry => clean(entry?.name)),
    ].filter(Boolean).map(name => name.toLocaleLowerCase()));
    const sceneText = [
        clean(source.characterName),
        clean(source.message),
        ...(source.contextMessages ?? []).flatMap(entry => [clean(entry?.name), clean(entry?.message)]),
    ].filter(Boolean).join('\n');

    const matched = [];
    for (const [name, appearance] of Object.entries(APPEARANCES)) {
        const candidateNames = namesFor(name, appearance);
        const explicit = candidateNames.some(candidate => explicitNames.has(candidate.toLocaleLowerCase()));
        if (!explicit && !candidateNames.some(candidate => mentionedIn(sceneText, candidate))) continue;
        matched.push({
            name,
            tags: clean(appearance.tags),
            note: clean(appearance.note),
            avoid: clean(appearance.avoid),
            variants: (appearance.variants ?? []).map(variant => ({
                label: clean(variant.label),
                tags: clean(variant.tags),
            })),
        });
    }
    return matched;
}

export function formatPawXaiAppearanceReferences(source = {}) {
    const matches = resolvePawXaiAppearanceReferences(source);
    if (!matches.length) return '(No curated appearance reference matched this scene.)';
    return matches.map(match => {
        const lines = [`[${match.name}]`, `Base appearance / common outfit: ${match.tags}`];
        if (match.note) lines.push(`Note: ${match.note}`);
        if (match.avoid) lines.push(`Avoid these known mistakes: ${match.avoid}`);
        for (const variant of match.variants) lines.push(`Variant - ${variant.label}: ${variant.tags}`);
        return lines.join('\n');
    }).join('\n\n');
}

export const PAWXAI_CURATED_CHARACTER_NAMES = Object.freeze(Object.keys(APPEARANCES));

/**
 * A fresh, mutable copy of the curated library for callers that want to inspect or repackage the
 * raw entries (e.g. an admin/export screen) without risking a mutation reaching the frozen
 * APPEARANCES source used by resolvePawXaiAppearanceReferences.
 * @returns {Array<{name: string, tags: string, note: string, avoid: string, aliases: string[], variants: Array<{label: string, tags: string}>}>}
 */
export function getPawXaiAppearanceCatalog() {
    return Object.entries(APPEARANCES).map(([name, appearance]) => ({
        name,
        tags: clean(appearance.tags),
        note: clean(appearance.note),
        avoid: clean(appearance.avoid),
        aliases: [...(appearance.aliases ?? [])],
        variants: (appearance.variants ?? []).map(variant => ({
            label: clean(variant.label),
            tags: clean(variant.tags),
        })),
    }));
}
