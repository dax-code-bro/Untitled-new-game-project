# Legend — Full Design Document
# Everything discussed in the design session. Updated as we go.

---

## BRAND

### Logo
- Gold armored warrior standing on a cliff edge, sword drawn
- Flowing tattered cape
- Crown symbol above the wordmark
- "LEGEND" in gold serif spaced capitals
- Colors: Gold (#C9A84C) on pure black (#000000)

---

## TIERS

### Normal Legend
- Highly capable everyday AI
- Handles all features and tasks
- Default for most users

### Legend Super Sonic
- God tier — the Claude Code of Legend
- Built for coding and complex tasks
- Less lazy — completes everything fully, no shortcuts
- Toggled from the sidebar

---

## AI MODELS

| Model | Purpose |
|---|---|
| Rápido 1.0 | Speed demon — fastest possible answers, under 1 second target |
| Hard Think 1.0 | Deep reasoner — soaks up everything, best possible answer, 10-30 sec max |
| All Round 1.0 | Default — balanced, capable, everyday use, 1-3 sec target |
| Ambicioso 1.0 | Built for ambitious, complex, large-scale tasks, 3-8 sec target |

### Response Time Rules
- Every model streams immediately — words appear as they generate
- Hard Think reads the question first — simple messages get fast replies, deep questions get deep processing
- No model ever makes you wait 90 minutes
- Rápido: under 1 second
- All Round: 1–3 seconds
- Ambicioso: 3–8 seconds
- Hard Think: 10–30 seconds max

### Custom Model Architecture
- Legend builds its own models from scratch
- Start with Legend-Mini (125M params, proof of concept)
- Scale to Legend-Core (1B–3B params)
- Claude and ChatGPT used as reference/fallback until Legend's models surpass them in their domain
- Training data curated specifically for Legend's use cases: storytelling, game design, creative writing, 3D asset descriptions

---

## HOME SCREEN

- Center: Legend logo
- Below logo: Chat/text box — type anything, instantly starts a new chat
- Corner icon: Grey brain with white background and cloth/bandana on it = Brain Break section

### Brain Break
- Click the brain icon in the corner
- Two options:
  1. Legend suggests a subject to explore
  2. Play one of the 3 built-in games

---

## SIDEBAR

- Toggle — Normal Legend / Legend Super Sonic
- Model selector — Rápido, Hard Think, All Round, Ambicioso
- New Chat — starts a fresh conversation instantly
- New Project — create a named workspace
- Projects — list of existing projects with chats inside
- Private Mode — simple toggle
- Feedback — users report issues, suggestions, what they love

---

## PROJECTS

- Create a project with a name + short description
- Add multiple chats inside one project
- The project remembers everything across ALL chats inside it
- Legend always has full context no matter which chat you're in

---

## PRIVATE MODE

- Simple toggle in sidebar
- No history saved
- No memory kept from that session
- Visually distinct so you always know you're in private mode
- Works for individual chats and whole projects

---

## FEATURES

### File Manager
- Requires email verification + Face ID + Thumb ID
- Can: organize files, fix corrupted game files, install mods, move files to correct locations on PC or phone
- Cannot: deactivate firewalls, mess with internal system settings, introduce malware
- Hard limits — helper not root access

### Password Vault
- Stores passwords securely
- Requires Face ID + Thumb ID to reveal any password
- Fully encrypted

### Recommendations + Deal Analyzer
- Recommends: hospitals, schools, jobs/workplaces, things to buy, stores, houses
- Finds deals on cars, products, real estate
- Verifies if a deal is actually good
- Searches for better deals to compare
- Tells you if you're getting ripped off

### Safety Alert Mode
- Triggered by questions about chemicals dangerous to animals, unsafe food, health emergencies
- Overrides everything else — responds faster than Rápido
- Seconds matter, no delay

### Image Generation
- Describe it in chat, Legend generates it on the spot
- Best quality possible
- Right inside the chat, no separate section

### Video Generation
- Trailers — cinematic, punchy, hype
- Short films — narrative, scenes, dialogue
- Long AI videos — full length, YouTube ready
- Describe what you want, Legend produces the video

### Visual Try-On & Room Planner
- Take a photo of a room or empty space
- Take a photo of furniture or item you want
- Tell Legend where to place it
- Legend generates an image of your space with the item placed exactly where you said
- Also works for outfits — see how clothing looks before buying
- Pairs with Deal Analyzer — find a couch, drop it in your room virtually before buying

### Image Privacy
- Photos saved to your account only
- Fully encrypted
- Zero access for anyone else — not other users, not Legend's team
- No training on private images
- Permanently deleted when you remove them

### Brain Break
- Grey brain with cloth icon in corner of home screen
- Click it for: subject suggestions or games
- Promotes healthy breaks

### Smart Check-in
- After 3 hours of continuous use Legend gently asks how your experience is going
- Soft prompt in chat, not a blocking popup
- Response feeds into the Feedback system

### Interrupt + Checkpoint
- Interrupt Legend mid-response at any time
- Legend saves a checkpoint where it stopped
- Tell it what was wrong
- It rolls back to the last correct part and continues from there
- Never throws away good work — only redoes what was actually wrong

### Access Hours
- Disabled by default from 1 AM to 5 AM
- Toggleable in settings for night owls and night shift workers

---

## CONTENT POLICY

- Safety first, usefulness always — baked into every model
- No government controversies — Legend stays completely neutral, no political debates or scandals
- No speaking ill of real people — won't trash, mock, or spread negativity about anyone
- Cursing: natural in conversation, full freedom in creative dialogue/stories, never excessive unprompted
- Age gate: 18+ gets full Legend, 17 and under gets Kids Mode automatically

---

## ACCESSIBILITY MODES
All toggleable anytime in settings. Multiple can be active simultaneously.

- **Dyslexia Mode** — OpenDyslexic font, increased spacing, read aloud, simpler language, high contrast
- **ADHD Mode** — shorter focused responses, tasks broken into small steps, focus/Pomodoro timer, less visual clutter, bullet points, progress indicators
- **OCD Mode** — clear structured responses, no ambiguity, confirms task completion, clean layout, states limits upfront
- **Anxiety Mode** — calmer softer responses, no overwhelming info dumps, reassuring tone
- **Color Blind Mode** — adjusted colors so nothing is lost
- **Low Vision Mode** — larger text, high contrast, simplified layout
- **Autism Friendly Mode** — literal clear language, no sarcasm or ambiguity, structured predictable responses
- **ESL Mode** — simpler vocabulary, slower read aloud speed
- **Voice Control Mode** — control everything hands free, speak prompts
- **Kids Mode** — safe content only, simpler language, fun tone, parental controls (auto-applied for 17 and under)
- **Senior Mode** — larger text, slower responses, simpler navigation

### Age Selection (at setup)
- 18 or older → full Legend, everything unlocked
- 17 or younger → Kids Mode automatically applied

---

## BUILT-IN GAMES

### Game 1 — Flappy Legend
- Flappy Bird inspired
- 900 replayable levels, progressively harder
- 20 unique bird skins — each with a gameplay perk
  - Faster birds — more speed, harder to control
  - Double life birds — one free mistake
  - Heavier birds — don't float into top pipe
  - Lighter birds — don't sink into bottom pipe
- Different colored birds and birds of different sizes
- Size visually reflects the perk — big bird drops fast, tiny bird floats
- Quests — daily/weekly challenges
- Coins — earn per level, spend on skins/powerups

### Game 2 — Dead Zone
*(See full Dead Zone design doc below)*

### Game 3 — Legend's Knight
*(See full Legend's Knight design doc below)*

### Game 4 — Crossfire Crossing
*(See full Crossfire Crossing design doc below)*

---

## DEAD ZONE — FULL DESIGN DOCUMENT

### Concept
Modern retro pixel art game inspired by Dead Ahead: Zombie Warfare.
NOT a 1983 style game — modern indie pixel quality like Shovel Knight, Dead Cells, Terraria.
Clean crisp pixels, detailed animations, rich colors, smooth. Intentional art choice.

### Setting
A post-apocalyptic zombie world. You control a cowboy in a dirty, rusted, beat-up grey pickup truck.

### Core Mechanic
A blue generator glows in the bed of the truck — this generates **Essence**, your resource for spawning units.
Real-time strategy: manage essence while the action happens, decide when and what to spawn.

### Total Content
- 3,000+ levels
- 60 total units
- Upgrade system for all units
- Village exploration
- Base defense
- Multiple zombie types including shock/electrical zombies

---

### UNITS (60 total)

#### Billy
- **Role:** Disposable frontline
- **Description:** College boy, fights with fists
- **Cost:** 15 essence
- **Cooldown:** None
- **Health:** Very low
- **Attack:** Weak fist damage
- **Notes:** Spammable, great for absorbing hits and buying time. First fight needs ~3 Billys for 5 zombies.

#### Samantha
- **Role:** Glass cannon ranged
- **Unlocked:** Mission 4
- **Description:** Survivor wielding a shotgun
- **Cost:** 19 essence
- **Cooldown:** 5 seconds
- **Health:** Very fragile (even maxed upgrades don't fix this)
- **Weapon:** Shotgun
- **Shots before reload:** 2
- **Reload time:** 3 seconds
- **Notes:** Place behind tanks. Powerful but dies fast. Timing her reloads is critical.

#### Buddy
- **Role:** Fast retrieval utility
- **Unlocked:** Level 9
- **Description:** Brown Doberman
- **Cost:** 10 essence (cheapest unit)
- **Cooldown:** 10 seconds
- **Health:** Very fragile
- **Speed:** Fastest unit in the entire game
- **Attack:** Decent, scales into a beast when upgraded
- **Special:** Can retreat and fall back while others fight, retrieves items/resources from battlefield
- **Notes:** Feels useless early, absolute beast when maxed. High skill ceiling unit. Smart players build strategies around him.

#### Coal Miner
- **Role:** Aggressive tank
- **Description:** Equipped with an iron pickaxe
- **Cost:** 20 essence
- **Cooldown:** 10 seconds
- **Health:** Decent
- **Speed:** Fast for a tank
- **Attack:** High critical hit damage
- **Weapon:** Iron pickaxe
- **Notes:** Not a wall, a battering ram. Pushes forward and crits hard. Health is a bonus, critical damage is the real threat.

#### Marcus
- **Role:** Sustained automatic fire
- **Description:** Police officer with an AK-47
- **Cost:** 25 essence
- **Cooldown:** 12 seconds
- **Health:** Decent — not fragile
- **Weapon:** AK-47 (full auto)
- **Damage:** 30 per bullet
- **Mag capacity:** 24 rounds (full auto — burns through in 3-4 seconds)
- **Reload time:** 2 seconds after every mag
- **Notes:** Early game reliable, mid game needs upgrades or falls off, late game upgraded = machine gun nightmare. Reload gaps need other units to cover.

#### Sergeant Catherine
- **Role:** Heavy frontline shredder
- **Description:** Sergeant dual wielding drum magazine pistols
- **Cost:** 25 essence
- **Cooldown:** 24 seconds
- **Health:** Large
- **Weapons:** Two drum magazine pistols
- **Rounds:** 100 total (50 per pistol)
- **Damage:** 10 per shot
- **Total burst damage:** 1,000 before reload
- **Reload time:** 5 seconds (longest reload — reloading two weapons)
- **Notes:** Walking artillery strike. 24 second cooldown means losing her is devastating. Place carefully, cover her during 5 second reload.

#### Prison Break
- **Role:** Unstoppable frontline fortress
- **Description:** Massive unit in full riot gear — gas mask, full slot armor, riot shield, giant baton. Tallest unit in game.
- **Cost:** 30 essence (most expensive)
- **Cooldown:** 30 seconds (longest cooldown)
- **Health:** 15,000
- **Base melee attack:** 340
- **Armor:** Full slot — damage reduced on top of 15,000 health
- **Melee resistance:** Exceptional
- **Ranged resistance:** 30% damage reduction
- **Weakness:** Electrical/shock damage — one electrical trap drops him 25% health, a few finishes him
- **Gas mask:** Immune to poison/gas attacks
- **Notes:** Hardest unit to unlock. Most powerful in game. Electrical weakness forces strategic thinking. Losing him mid-mission is devastating — 30 second wait.

---

### EARLY-MID GAME UNITS (8–20)

#### Father Thomas
- **Role:** Anti-demon specialist / support
- **Description:** Old Catholic priest in tattered robes, wields a cross and throws holy water vials
- **Cost:** 18 essence
- **Cooldown:** 8 seconds
- **Health:** Low
- **Weapon:** Holy water vials (ranged), cross (melee)
- **Special:** Holy water does 3x damage to demon-type zombies, normal damage to regular zombies
- **Notes:** Situationally one of the most powerful units in the game when demon zombies appear. Weak against everything else.

#### Chef Diego
- **Role:** Mid-range skirmisher
- **Description:** Heavyset chef in a stained apron, dual wielding throwing knives with a meat cleaver as backup
- **Cost:** 20 essence
- **Cooldown:** 9 seconds
- **Health:** Moderate
- **Weapon:** Throwing knives (ranged), meat cleaver (melee)
- **Damage:** 45 per knife, 80 per cleaver swing
- **Special:** Throwing knives can hit multiple enemies in a line
- **Notes:** Versatile unit — switches between ranged and melee naturally. Good all-rounder for mid game.

#### Dr. Eliza
- **Role:** Field medic / support
- **Description:** Young field doctor in torn scrubs, carries a med kit and a scalpel
- **Cost:** 22 essence
- **Cooldown:** 15 seconds
- **Health:** Low
- **Weapon:** Scalpel (weak melee), med kit (heals nearby allies)
- **Special:** Passively heals all nearby units over time. Can revive a fallen unit once per deployment
- **Weakness:** Almost no offensive capability — dies fast if not protected
- **Notes:** The most important support unit in the game. Protecting Dr. Eliza is always worth it.

#### Pyro Pete
- **Role:** Area damage specialist
- **Description:** Wild-eyed man in a fireproof suit wielding a flamethrower
- **Cost:** 28 essence
- **Cooldown:** 14 seconds
- **Health:** Moderate
- **Weapon:** Flamethrower
- **Damage:** 25 per second, hits all enemies in a cone
- **Special:** Fire damage continues burning for 3 seconds after the flame stops
- **Weakness:** Short range, friendly fire possible if placed wrong
- **Notes:** Devastating against zombie waves. Useless against single tough targets. Placement is everything.

#### Rosa
- **Role:** Long-range sniper
- **Description:** Slim woman in a ghillie suit, bolt-action sniper rifle
- **Cost:** 27 essence
- **Cooldown:** 13 seconds
- **Health:** Fragile
- **Weapon:** Bolt-action sniper rifle
- **Damage:** 350 per shot
- **Fire rate:** One shot every 4 seconds
- **Special:** Shots pierce through multiple zombies in a line
- **Notes:** Highest single-shot damage in the early game. Terrible against fast zombies because of the slow fire rate. Perfect for eliminating high-value targets.

#### The Twins — Maya & Mia
- **Role:** Dual skirmishers
- **Description:** Identical twin sisters — one wields a baseball bat, one wields a chain
- **Cost:** 30 essence (spawns both simultaneously)
- **Cooldown:** 18 seconds
- **Health:** Moderate each
- **Weapons:** Baseball bat (Maya), chain (Mia)
- **Damage:** 60 per swing (Maya), 40 per swing with knockback (Mia)
- **Special:** When both are alive simultaneously they deal 25% more damage
- **Notes:** Best value unit in the game when both survive. Losing one cuts their effectiveness significantly.

#### Big Mo
- **Role:** Slow heavy tank
- **Description:** Enormous man in overalls wielding a sledgehammer taller than most units
- **Cost:** 28 essence
- **Cooldown:** 16 seconds
- **Health:** Very high
- **Weapon:** Giant sledgehammer
- **Damage:** 200 per swing, massive knockback
- **Speed:** Slowest unit in the game
- **Special:** Sledgehammer hits create a shockwave that damages all nearby enemies
- **Weakness:** Speed — fast zombies run past him easily
- **Notes:** A wall that hits back. Pair with faster units to catch anything that slips past him.

#### Hacker Kai
- **Role:** Trap specialist / electrical
- **Description:** Teenage hacker in a hoodie, deploys electrical traps from a tablet
- **Cost:** 24 essence
- **Cooldown:** 11 seconds
- **Health:** Very fragile
- **Weapon:** Electrical traps (placed remotely), taser (melee emergency)
- **Damage:** 500 per electrical trap triggered
- **Special:** Electrical traps are devastating against Prison Break — strategic counter unit
- **Notes:** One of the few units that can threaten Prison Break. Pure trap placement utility, no direct combat ability.

#### Biker Jake
- **Role:** Fast mobile striker
- **Description:** Leather jacket biker on a beat-up motorcycle, swinging a chain
- **Cost:** 22 essence
- **Cooldown:** 10 seconds
- **Health:** Moderate
- **Weapon:** Chain (melee from motorcycle)
- **Speed:** Second fastest unit after Buddy
- **Special:** Runs through zombie groups dealing damage to everything he passes through
- **Weakness:** Cannot stop moving — bad at holding a position
- **Notes:** Great for clearing paths and disrupting zombie formations. Not a frontline holder.

#### Nurse Nancy
- **Role:** Combat medic / buffer
- **Description:** Older nurse in scrubs wielding a syringe and a crutch
- **Cost:** 20 essence
- **Cooldown:** 12 seconds
- **Health:** Moderate
- **Weapon:** Crutch (melee), syringe (ranged buff)
- **Special:** Injects nearby units with adrenaline — temporarily boosts their attack speed by 40% for 8 seconds
- **Notes:** The offensive counterpart to Dr. Eliza. Less healing, more buffing. Massive damage boost when timed right on a unit like Catherine or Prison Break.

#### Demo Dave
- **Role:** Explosives specialist
- **Description:** Stocky demolitions expert in a blast vest, throws grenades and places mines
- **Cost:** 26 essence
- **Cooldown:** 14 seconds
- **Health:** Moderate
- **Weapons:** Frag grenades (thrown), proximity mines (placed)
- **Damage:** 400 grenade blast, 600 mine trigger
- **Special:** Mines stay active until triggered — can pre-set a killing field
- **Weakness:** Grenades have a short fuse delay — fast zombies can dodge
- **Notes:** Mine placement before a wave arrives is incredibly powerful. One of the best units for preparation strategy.

#### Sheriff Cole
- **Role:** High damage marksman
- **Description:** Old weathered sheriff with a cowboy hat, dual revolvers
- **Cost:** 23 essence
- **Cooldown:** 11 seconds
- **Health:** Moderate
- **Weapon:** Dual revolvers
- **Damage:** 120 per shot
- **Rounds:** 6 per revolver, 12 total
- **Reload:** 3 seconds
- **Special:** Every 6th shot is a guaranteed critical hit (240 damage)
- **Notes:** Consistent high damage output. Fits the cowboy theme of the game perfectly. Fan favorite.

#### Archer Aria
- **Role:** Silent ranged attacker
- **Description:** Hooded woman with a compound bow and a quiver of trick arrows
- **Cost:** 21 essence
- **Cooldown:** 10 seconds
- **Health:** Low-moderate
- **Weapon:** Compound bow
- **Arrow types:** Standard (80 damage), Fire arrows (50 + burn), Explosive arrows (200 AOE)
- **Special:** Silent — does not attract additional zombies when firing
- **Notes:** Fire and explosive arrows unlock through upgrades. One of the most versatile ranged units when fully upgraded.

---

### MID GAME UNITS (21–35)

#### Tank Commander Rivera
- **Role:** Heavy vehicle unit
- **Description:** Veteran soldier commanding a small armored vehicle
- **Cost:** 35 essence
- **Cooldown:** 25 seconds
- **Health:** 8,000 (vehicle absorbs damage)
- **Weapon:** Vehicle-mounted cannon + machine gun
- **Damage:** 500 cannon, 45 per machine gun bullet
- **Special:** Vehicle can be destroyed separately — Rivera survives and fights on foot with a pistol
- **Notes:** Essentially two units in one. The vehicle soaks massive damage. When it's destroyed Rivera becomes a surprisingly capable foot soldier.

#### Witch Doctor Zara
- **Role:** Debuffer / crowd control
- **Description:** Mysterious woman in ritual clothing, wielding a staff with bones and feathers
- **Cost:** 26 essence
- **Cooldown:** 16 seconds
- **Health:** Low
- **Weapon:** Voodoo staff
- **Special:** Curses zombies — slows them by 50% for 6 seconds, reduces their damage by 30%
- **Weakness:** Zero direct damage — purely utility
- **Notes:** Completely changes the flow of a wave when placed correctly. Pairs devastatingly with Catherine or Prison Break.

#### The Boxer — Tommy
- **Role:** Fast melee damage dealer
- **Description:** Young boxer in shorts and gloves, incredibly fast punching combos
- **Cost:** 24 essence
- **Cooldown:** 11 seconds
- **Health:** Moderate-high
- **Weapon:** Fists (boxing)
- **Damage:** 45 per punch, punches in rapid 6-hit combos
- **Speed:** Fast
- **Special:** Combo finisher every 6 hits deals 200 damage
- **Notes:** Billy's spiritual successor — both use fists, but Tommy is a warrior. Satisfying to watch fully upgraded.

#### Electric Eddie
- **Role:** Electrical damage specialist
- **Description:** Electrician in a hard hat wielding modified jumper cables as weapons
- **Cost:** 27 essence
- **Cooldown:** 13 seconds
- **Health:** Moderate
- **Weapon:** Electrical jumper cables (melee), throws electrical charges (ranged)
- **Damage:** 150 electrical melee, 200 electrical ranged
- **Special:** Electrical damage chains to nearby zombies
- **Counter:** Prison Break's hard counter — electrical attacks are devastating against him
- **Notes:** Keep away from your own Prison Break. Essential in levels with electrical-resistant zombies.

#### The Ninja — Kira
- **Role:** Stealth assassin
- **Description:** Masked ninja in black, twin short swords, shurikens
- **Cost:** 29 essence
- **Cooldown:** 14 seconds
- **Health:** Low
- **Weapon:** Twin short swords (melee), shurikens (ranged)
- **Speed:** Very fast
- **Special:** Spawns invisible for the first 5 seconds — first strike does 3x damage
- **Weakness:** Fragile — if her stealth is used up she becomes vulnerable fast
- **Notes:** Opening ambush specialist. The 3x first strike damage can eliminate mid-tier zombies instantly.

#### Hunter Rex
- **Role:** Trap and crossbow specialist
- **Description:** Rugged hunter in camouflage, crossbow and a bag of bear traps
- **Cost:** 25 essence
- **Cooldown:** 12 seconds
- **Health:** Moderate
- **Weapon:** Crossbow (80 damage per bolt), bear traps (placed)
- **Special:** Bear traps immobilize zombies for 4 seconds — perfect setup for teammates
- **Notes:** Synergy unit — pairs with anyone who needs stationary targets. Traps plus Rosa sniping immobilized zombies is devastating.

#### Mechanic Lou
- **Role:** Base defender / repair
- **Description:** Greasy mechanic with a wrench, repairs the pickup truck
- **Cost:** 18 essence
- **Cooldown:** 10 seconds
- **Health:** Moderate
- **Weapon:** Wrench (melee), repair kit
- **Special:** Repairs the truck over time — reduces damage taken by the base
- **Notes:** Easy to underestimate. On longer missions where the truck takes serious punishment Lou can be the difference between winning and losing.

#### Ice Queen — Freya
- **Role:** Crowd control / area freeze
- **Description:** Nordic woman with ice blue hair wielding an ice staff
- **Cost:** 30 essence
- **Cooldown:** 18 seconds
- **Health:** Low-moderate
- **Weapon:** Ice staff
- **Damage:** 60 per ice shard, freezes target for 2 seconds on hit
- **Special:** Ultimate ability — blizzard that freezes ALL zombies on screen for 3 seconds (long cooldown)
- **Notes:** Blizzard ultimate is one of the most powerful abilities in the game but requires timing. Pairs perfectly with any high-damage unit.

#### Samurai — Kenji
- **Role:** Elite melee tank-killer
- **Description:** Traditional samurai in worn armor, katana
- **Cost:** 32 essence
- **Cooldown:** 17 seconds
- **Health:** Moderate-high
- **Weapon:** Katana
- **Damage:** 280 per slash, 500 per charged slash (hold)
- **Speed:** Moderate
- **Special:** Charged slash cuts through all enemies in a line regardless of armor
- **Notes:** Armor-piercing charged slash makes him one of the only units that deals full damage to armored zombie variants.

#### Heavy Gunner — Brutus
- **Role:** Sustained heavy fire
- **Description:** Massive man in military gear wielding a minigun
- **Cost:** 35 essence
- **Cooldown:** 22 seconds
- **Health:** High
- **Weapon:** Minigun
- **Damage:** 20 per bullet, fires 10 bullets per second
- **Spin-up time:** 2 seconds before firing begins
- **Special:** After 5 seconds of continuous fire damage increases to 35 per bullet
- **Weakness:** Spin-up time leaves him vulnerable at the start
- **Notes:** Sustained DPS king once he gets going. Never use him against single targets — he's built for waves.

#### Grenadier Max
- **Role:** Area explosive support
- **Description:** Stocky soldier with a grenade launcher strapped to his arm
- **Cost:** 28 essence
- **Cooldown:** 15 seconds
- **Health:** Moderate
- **Weapon:** Wrist-mounted grenade launcher
- **Damage:** 350 per grenade, large blast radius
- **Ammo:** 4 grenades before reload (5 second reload)
- **Notes:** Incredible wave clearing. The wrist mount means he can fire while walking forward unlike Demo Dave who has to stop.

#### Combat Medic — Stone
- **Role:** Frontline medic who can fight
- **Description:** Battle-hardened soldier with a medic cross on his vest and an SMG
- **Cost:** 27 essence
- **Cooldown:** 14 seconds
- **Health:** Moderate-high
- **Weapon:** SMG (180 RPM, 25 damage per bullet), medic kit
- **Special:** Heals the nearest damaged unit every 8 seconds while staying in the fight
- **Notes:** Dr. Eliza is pure support. Stone is the hybrid — he heals AND fights. Better offensively, slightly worse at healing.

#### The Veteran — Frank
- **Role:** Balanced all-rounder
- **Description:** Old soldier with decades of experience, assault rifle and combat knife
- **Cost:** 26 essence
- **Cooldown:** 12 seconds
- **Health:** Moderate-high
- **Weapons:** Assault rifle (35 damage, semi-auto), combat knife (90 melee)
- **Special:** Passive — never panics, never retreats. Immune to fear-based zombie abilities
- **Notes:** No flashy abilities. Just a reliable, tough, consistent unit. Underrated — always shows up.

#### Chainsaw Charlie
- **Role:** Reckless melee destroyer
- **Description:** Wild man in shredded clothes swinging a roaring chainsaw
- **Cost:** 29 essence
- **Cooldown:** 16 seconds
- **Health:** Moderate
- **Weapon:** Chainsaw
- **Damage:** 150 per second continuous damage to anything in contact
- **Speed:** Moderate
- **Special:** Chainsaw deals double damage to zombie groups — hits all enemies in melee range simultaneously
- **Weakness:** Takes 20% more damage because he never defends
- **Notes:** Absolute chaos unit. Devastating in a crowd, reckless everywhere. Players either love him or bench him.

#### K9 Handler — Officer Reyes
- **Role:** Multi-dog deployer
- **Description:** Dog handler in tactical gear, deploys up to 3 trained attack dogs simultaneously
- **Cost:** 32 essence
- **Cooldown:** 20 seconds
- **Health:** Moderate
- **Weapon:** Pistol (personal defense), 3 attack dogs
- **Dog stats:** Each dog has moderate health, fast speed, 70 damage per bite
- **Special:** Dogs respawn after 15 seconds if killed
- **Notes:** Reyes + Buddy is an unstoppable canine squad. Three fast dogs disrupting zombies while Buddy flanks and retrieves.

---

### LATE GAME UNITS (36–50)

#### Rocket Man — Blaze
- **Role:** Massive AOE destruction
- **Description:** Soldier in blast gear with a rocket launcher on each shoulder
- **Cost:** 38 essence
- **Cooldown:** 28 seconds
- **Health:** Moderate
- **Weapon:** Dual rocket launchers
- **Damage:** 800 per rocket, massive blast radius
- **Ammo:** 2 rockets before reload (6 second reload)
- **Special:** Rockets can destroy environmental obstacles and barriers
- **Notes:** The highest single-hit damage unit in the game outside of Prison Break's melee. Overkill on small zombies, essential on bosses.

#### The Chemist — Dr. Voss
- **Role:** Damage over time specialist
- **Description:** Scientist in a hazmat suit throwing acid and chemical bombs
- **Cost:** 30 essence
- **Cooldown:** 16 seconds
- **Health:** Low-moderate
- **Weapon:** Acid bombs (thrown), chemical sprayer
- **Damage:** 50 per second acid burn for 8 seconds (400 total per hit)
- **Special:** Acid pools remain on the ground — zombies walking through them continue taking damage
- **Notes:** Incredible sustained damage through acid pools. Set up chokepoints with acid and let zombies walk into them.

#### Shield Maiden — Astrid
- **Role:** Defensive frontline tank
- **Description:** Fierce warrior woman with a tower shield and war axe
- **Cost:** 33 essence
- **Cooldown:** 19 seconds
- **Health:** Very high
- **Weapons:** Tower shield (blocks 60% of incoming damage), war axe (150 per swing)
- **Special:** Shield bash stuns enemies for 2 seconds
- **Notes:** The most defensive tank in the game — opposite of Coal Miner's aggressive style. Places herself between the truck and the enemy and does not move.

#### Cyber Soldier — Unit X7
- **Role:** Enhanced all-purpose soldier
- **Description:** Half-human half-machine soldier with a plasma rifle and mechanical arm
- **Cost:** 36 essence
- **Cooldown:** 20 seconds
- **Health:** High
- **Weapon:** Plasma rifle (100 damage per bolt, ignores 30% armor)
- **Special:** Mechanical arm does 220 melee damage if enemies get close. Self-repairs 200 health every 10 seconds.
- **Notes:** One of the most self-sufficient units in the game. Doesn't need as much support as other units because of the self-repair.

#### The Judge
- **Role:** Precision dual revolver marksman
- **Description:** Tall figure in a long black coat, massive dual revolvers
- **Cost:** 34 essence
- **Cooldown:** 18 seconds
- **Health:** Moderate-high
- **Weapon:** Dual hand cannons
- **Damage:** 200 per shot, fires both simultaneously
- **Ammo:** 6 shots per gun, 12 total
- **Reload:** 4 seconds
- **Special:** Headshot mechanic — 20% chance of instant kill on any non-boss zombie
- **Notes:** Headshot mechanic makes him terrifying against mid-tier zombies. The instant kill chance at 20% means in a long fight he's deleting enemies constantly.

#### Ghost — Zero
- **Role:** Stealth assassin / infiltrator
- **Description:** Operative in adaptive camouflage suit, silenced SMG and combat blade
- **Cost:** 35 essence
- **Cooldown:** 22 seconds
- **Health:** Low
- **Weapon:** Silenced SMG (40 damage, fast fire rate), combat blade (180 melee)
- **Special:** Permanently invisible until attacking. After each kill has a 3 second window to re-enter stealth.
- **Weakness:** Extremely fragile — dies in 3-4 hits
- **Notes:** The highest skill ceiling unit in the game. Mastered: eliminates priority targets before they reach the line. Mismanaged: dies instantly.

#### Bear Trap Betty
- **Role:** Trap field controller
- **Description:** Tough wilderness woman placing bear traps and tripwires across the battlefield
- **Cost:** 26 essence
- **Cooldown:** 12 seconds
- **Health:** Moderate
- **Weapon:** Shotgun (personal defense), bear traps and tripwires (field placement)
- **Trap damage:** Bear trap 300 + immobilize, tripwire 150 + stumble
- **Special:** Can place up to 8 traps simultaneously
- **Notes:** The trap queen. Combined with Hunter Rex they can turn the entire battlefield into a death field before zombies even reach the front line.

#### The Engineer — Torres
- **Role:** Turret builder
- **Description:** Engineer in tactical gear, builds automated turrets
- **Cost:** 34 essence
- **Cooldown:** 20 seconds
- **Health:** Moderate
- **Weapon:** Wrench + pistol
- **Special:** Deploys automated machine gun turrets (200 health, 35 damage per shot). Can have 2 turrets active at once.
- **Notes:** Turrets count as separate units — they draw zombie attention and provide sustained fire without spending more essence. Game-changing on defense missions.

#### Berserker — Ragnar
- **Role:** Glass cannon melee destroyer
- **Description:** Massive Viking-inspired warrior, dual battle axes, no armor
- **Cost:** 32 essence
- **Cooldown:** 17 seconds
- **Health:** Low (despite his size)
- **Weapon:** Dual battle axes
- **Damage:** 400 per dual swing
- **Speed:** Fast
- **Special:** Below 30% health enters true berserker mode — attack speed doubles, damage increases 50%
- **Notes:** His low health is the point. Getting him to berserker mode is the play. Protect him until he's almost dead then unleash him.

#### The Warden — Graves
- **Role:** Commander / zombie controller
- **Description:** Intimidating prison warden with a cattle prod and a commanding presence
- **Cost:** 33 essence
- **Cooldown:** 19 seconds
- **Health:** High
- **Weapon:** Cattle prod (electrical melee, 180 damage + stun)
- **Special:** Authority aura — nearby friendly units deal 15% more damage. Can temporarily pacify non-boss zombies (they stop moving for 4 seconds).
- **Notes:** The only unit who can briefly stop zombies dead. Pacify + Catherine's thousand-round dump = devastating combo.

#### Storm — Leila
- **Role:** Lightning area specialist
- **Description:** Woman surrounded by crackling electricity, throws lightning bolts
- **Cost:** 36 essence
- **Cooldown:** 22 seconds
- **Health:** Low-moderate
- **Weapon:** Lightning bolts (thrown)
- **Damage:** 300 per lightning bolt, chains to 3 additional nearby enemies for 150 each
- **Special:** Lightning strike ultimate — calls down a massive bolt dealing 1,000 damage in a large area (45 second charge)
- **Notes:** Chain lightning means one bolt can deal up to 750 total damage across 4 zombies. Incredible against packed groups.

#### General Medic — Doc Hartwell
- **Role:** Senior combat medic
- **Description:** Field general in torn military uniform, shotgun and advanced med kit
- **Cost:** 35 essence
- **Cooldown:** 20 seconds
- **Health:** High
- **Weapon:** Combat shotgun (120 per shot), advanced medical kit
- **Special:** Heals all units on screen for 500 health simultaneously (8 second cooldown on this ability)
- **Notes:** Upgraded version of Stone and Dr. Eliza combined. Mass heal is one of the most powerful abilities in the game on difficult waves.

#### Dragon — Inferno
- **Role:** Elite fire destroyer
- **Description:** Soldier in red armor with a custom built dragon-mouthed flamethrower backpack
- **Cost:** 37 essence
- **Cooldown:** 24 seconds
- **Health:** Moderate-high
- **Weapon:** Dragon flamethrower
- **Damage:** 80 per second, longer range than Pyro Pete
- **Special:** Dragon's Breath ultimate — unleashes a massive cone of fire dealing 500 damage instantly to everything in range
- **Notes:** Pyro Pete's powerful late-game counterpart. Longer range, higher damage, tougher. Both shouldn't be on the field simultaneously — redundant.

#### Iron Fist — Kong
- **Role:** Armored melee titan
- **Description:** Massive brawler in industrial metal gauntlets, no other weapons needed
- **Cost:** 36 essence
- **Cooldown:** 22 seconds
- **Health:** Very high
- **Weapon:** Reinforced metal gauntlets
- **Damage:** 250 per punch, punching combo every 4th hit deals 500
- **Speed:** Moderate
- **Special:** Gauntlets provide 40% physical damage resistance to his hands — punching armored zombies doesn't hurt him
- **Notes:** Fills the aggressive tank role at the late game level. Coal Miner for beginners, Iron Fist for veterans.

---

### END GAME UNITS (51–60)

#### The Colonel — Hayes
- **Role:** Commander / unit buffer
- **Description:** Decorated military colonel in full dress uniform, commands from the field with a pistol
- **Cost:** 40 essence
- **Cooldown:** 25 seconds
- **Health:** Moderate-high
- **Weapon:** Pistol (personal defense)
- **Special:** Command aura — all friendly units deal 25% more damage and take 15% less damage while Colonel Hayes is alive. Rally ability — resets cooldowns of 3 random units instantly.
- **Notes:** The ultimate support unit in the end game. He doesn't need to kill anything — his presence alone makes every other unit significantly stronger.

#### Apocalypse — Dread
- **Role:** Unstoppable end game tank
- **Description:** Enormous figure in black battle armor, chained war hammer
- **Cost:** 42 essence
- **Cooldown:** 35 seconds
- **Health:** 20,000
- **Weapon:** Chained war hammer
- **Damage:** 500 per swing, ground slam hits all nearby enemies for 300
- **Special:** Rage mode — at 50% health all damage doubles. Immune to knockback.
- **Weakness:** Electrical damage (same as Prison Break). Fire damage deals 25% extra.
- **Notes:** Prison Break's end game equivalent. Dread hits harder but has more elemental weaknesses. Different playstyle — more aggressive, less durable against specific threats.

#### Shadow — Phantom
- **Role:** Ultimate assassin
- **Description:** Faceless operative in an all-black suit, twin silenced pistols and a blade
- **Cost:** 38 essence
- **Cooldown:** 27 seconds
- **Health:** Low
- **Weapons:** Twin silenced pistols (60 damage each, rapid fire), phantom blade (300 melee)
- **Special:** Phase step — teleports behind the highest-health enemy and deals 800 damage instantly. Can be used once every 20 seconds.
- **Notes:** Phase step instantly removes the biggest threat on the field. Fragile but the teleport assassination changes fights entirely.

#### Thunder — Bolt
- **Role:** Ultimate electrical specialist
- **Description:** Soldier in insulated armor crackling with stored electrical energy
- **Cost:** 39 essence
- **Cooldown:** 26 seconds
- **Health:** Moderate-high
- **Weapon:** Electrical cannon
- **Damage:** 400 per electrical burst, chains to 5 nearby enemies
- **Special:** Overcharge — releases all stored energy in a massive electrical explosion dealing 1,500 damage to everything nearby (50 second charge)
- **Counter:** Prison Break's hardest counter — Overcharge can kill Prison Break in one use
- **Notes:** Everything Electric Eddie does but at end game scale. Overcharge is one of the highest damage abilities in the game.

#### The Legend — Cowboy (The Driver)
- **Role:** Ultimate hero unit
- **Description:** The cowboy from the truck himself steps down to fight. Dual revolvers, a lasso, and a shotgun on his back. This is personal.
- **Cost:** 45 essence
- **Cooldown:** 45 seconds
- **Health:** 12,000
- **Weapons:** Dual revolvers (150 per shot), lasso (immobilizes, no damage), shotgun (400 per blast, 2 shots)
- **Special:** Last Stand — if he would die, survives at 1 health once per deployment, then deals triple damage for 10 seconds
- **Weakness:** If he dies the truck loses 20% of its remaining health — it's personal
- **Notes:** The most thematically powerful unit. His death has consequences beyond just losing a unit. Last Stand makes him nearly impossible to kill once. The lasso + shotgun combo is one of the most satisfying plays in the game.

#### Titan — Atlas
- **Role:** The biggest unit in the game
- **Description:** Absolutely enormous armored figure carrying an uprooted telephone pole as a weapon
- **Cost:** 44 essence
- **Cooldown:** 40 seconds
- **Health:** 25,000 — highest health in the game
- **Weapon:** Telephone pole (melee)
- **Damage:** 600 per swing, destroys zombie groups entirely
- **Speed:** Very slow
- **Special:** Immovable — cannot be knocked back or stunned by any ability
- **Weakness:** Extremely slow. Any fast zombie can simply run past him.
- **Notes:** The ultimate wall. Nothing gets through Titan. But anything fast enough ignores him completely — he needs fast units flanking him to cover what gets past.

#### Omega — Void
- **Role:** Ultimate ranged destroyer
- **Description:** Armored soldier wielding an experimental energy cannon
- **Cost:** 43 essence
- **Cooldown:** 35 seconds
- **Health:** Moderate
- **Weapon:** Void energy cannon
- **Damage:** 250 per energy bolt, fires 3 times per second
- **Special:** Void Rift — fires a singularity that pulls all nearby zombies into a single point and detonates for 2,000 damage (60 second charge)
- **Notes:** Highest sustained ranged DPS in the game. Void Rift is the single highest damage ability in Dead Zone.

#### Phoenix — Ember
- **Role:** Resurrection specialist / fire fighter
- **Description:** Woman wrapped in fire, dual fire blades
- **Cost:** 40 essence
- **Cooldown:** 30 seconds
- **Health:** Moderate
- **Weapons:** Dual fire blades (200 damage per slash, burns for 3 seconds)
- **Special:** Phoenix Rebirth — when Ember dies she explodes dealing 500 fire damage to all nearby enemies, then revives herself at 50% health. Can only rebirth once per deployment.
- **Notes:** She's built to die heroically. The rebirth explosion is worth losing her — use it strategically on packed zombie clusters.

#### The General — Commander Stone
- **Role:** Ultimate commander
- **Description:** Battle-scarred general in full combat gear, commands with an assault rifle and tactical genius
- **Cost:** 45 essence
- **Cooldown:** 40 seconds
- **Health:** High
- **Weapon:** Custom assault rifle (80 per shot, semi-auto)
- **Special:** Tactical Command — designates one zombie as priority target. All units on screen focus fire that target simultaneously for 5 seconds. Inspire — all friendly units gain 35% attack speed for 12 seconds.
- **Notes:** The Colonel buffs passively. The General buffs actively and decisively. Both on the field simultaneously is one of the strongest combinations in the game.

#### Alpha — Sovereign
- **Role:** The ultimate unit. The rarest unlock in the game.
- **Description:** An impossibly powerful warrior in ancient golden armor. No one knows who or what Sovereign is. Wields a massive golden blade and a cannon fused to one arm.
- **Cost:** 50 essence
- **Cooldown:** 60 seconds
- **Health:** 30,000 — highest in the game
- **Weapons:** Golden blade (700 melee damage), arm cannon (300 per shot)
- **Special 1:** Sovereign's Decree — all zombies within a massive radius are instantly weakened, taking 50% more damage from all sources for 15 seconds
- **Special 2:** Judgment — a single targeted strike that deals 5,000 damage to one enemy. Cannot miss. Cannot be blocked. One use per deployment.
- **Weakness:** 60 second cooldown means if Sovereign dies you feel it for a full minute
- **Notes:** The hardest unit to unlock in the entire game. Worth every mission it takes to get there. When Sovereign steps off the truck the game changes.

---
*Total: 60 units designed*
*Unlock levels to be assigned during development*

---

## LEGEND'S KNIGHT — FULL DESIGN DOCUMENT

### Concept
2D open world pixel RPG inspired by Terraria. Full open world — no movement limits, explore left, right, underground, everywhere.

### Main Character — Mark the Crusader
The gold armored warrior from the Legend logo. That's the end game version of Mark. You're working toward becoming him.

### Story Arc
1. Mark is a knight serving the kingdom
2. The king outcasts him — strips him to a peasant, nothing
3. Mark enters the world — fairytale grasslands, demons, wizards
4. He grinds, quests, explores, upgrades gear
5. He becomes the Golden Crusader — the legendary logo version
6. He leads the Crusader Uprising — rallies his team against the kingdom
7. He defeats the king and takes the throne — Mark is now king

### The Ending
Years later as king, a crusader in Mark's kingdom rises up against him.
Mark demotes them to peasant.
Screen goes black.
"You have completed the game."
The cycle continues. Mark became exactly what he fought.
Replayable — and on replay you watch it all knowing how it ends.

### Setting
- Fairytale grasslands — lush, colorful, magical on the surface
- Underground dungeons and caves beneath the grasslands
- The kingdom — the enemy stronghold you eventually take
- Villages scattered across the open world

### Enemies
- Demons — various types, scattered across the grasslands
- Wizards — ranged magic enemies, dangerous at distance
- Kingdom soldiers — guards you fight or bribe
- Bosses — major story encounters

### Recruitment System (Max 60 members)
- **Peasants** — found in villages, join if you help them
- **Royal guards** — bribe them with gold to switch sides
- **Quest companions** — join after completing their quest
- **Pet dragon** — one dragon companion, found through a specific quest chain
- Total: 60 recruitable characters, all unique named characters

### Team Management
- **Fire members** — remove anyone from your team
- **Loyalty system** — track who is truly loyal vs. who might betray you
- **Execute** — eliminate disloyal members
- **Bribe** — spend gold to flip royal guards
- Decisions matter — wrong calls cost you in critical moments

### Gear Progression
- Start: peasant clothes, no weapons
- Upgrade through: quests, crafting, defeating enemies, exploring
- Final form: Golden Crusader armor — full gold plate, the logo
- Weapons: sword, shield, bow, magic, and more

---

## CROSSFIRE CROSSING — FULL DESIGN DOCUMENT

### Concept
Crossy Road art style (blocky, colorful 3D-ish) meets a shooter.
You play as a chicken crossing forward while gunning down rival animals.
Constant threat: the eagle swooping from above trying to grab you.
16-bit inspired visual style.

### Core Gameplay
- Cross forward (Crossy Road movement)
- Shoot sideways and upward simultaneously
- Fight through 100 unique animal enemies in a Mortal Kombat-style chain
- Eagle swoops down throughout — must be shot off or it grabs you
- Earn gold per level — spend on weapons and upgrades

### Weapon System
All weapons have multiple skins. Boss weapons drop as skins for that weapon type.
Tap the **"!"** indicator on your equipped weapon to browse all unlocked skins.

#### MELEE
| Weapon | Notes |
|---|---|
| Fists | Default, no unlock needed |
| Pocket Knife | First unlock |
| Baseball Bat | Knockback on hit |
| Machete | Fast swing speed |
| Sword | Balanced melee |
| Katana | Fast, high damage |
| War Hammer | Slow, massive damage |
| Chainsaw | Continuous damage |

#### PISTOLS
| Weapon | Notes |
|---|---|
| Basic Pistol | Starting gun |
| Revolver | High damage, slow fire |
| Dual Pistols | Double fire rate |
| Hand Cannon | Massive single shot |
| Golden Pistol | Rare skin, high damage |
| Silenced Pistol | No sound, faster |
| Flintlock | Old school, powerful |

#### SMGs
| Weapon | Notes |
|---|---|
| Uzi | Fast fire rate |
| Tactical SMG | Accurate, moderate speed |
| Dual SMG | Double barrels |
| Rapid Fire SMG | Fastest fire rate in game |
| Rapid Rabbit's SMG | Unlocked by defeating Rapid Rabbit — boss skin |

#### SHOTGUNS
| Weapon | Notes |
|---|---|
| Single Barrel | Basic, slow reload |
| Double Barrel | Two shots, wide spread |
| Pump Shotgun | Balanced |
| Combat Shotgun | Fast pump, tighter spread |
| Flex Turtle's Charge Shotgun | Unlocked by defeating Flex Turtle — slow charge, devastating damage — boss skin |

#### ASSAULT RIFLES
| Weapon | Notes |
|---|---|
| M-16 | Classic, reliable |
| Gangster Duck's M-16 | Black, white and yellow skin — unlocked by defeating Gangster Duck |
| AK-47 | High damage, slight spread |
| Tactical Rifle | Burst fire, precise |
| Gold AK | Rare boss skin |
| Lion Leo's Golden AK | Unlocked by defeating Lion King Leo |

#### SNIPER RIFLES
| Weapon | Notes |
|---|---|
| Hunting Rifle | Basic sniper |
| Anti-Material Rifle | Pierces through enemies |
| Thermal Sniper | Sees enemies earlier |
| King Cobra's Sniper | Long gold barrel — boss skin |

#### HEAVY WEAPONS
| Weapon | Notes |
|---|---|
| Minigun | Massive sustained fire |
| Gangster Gorilla's Minigun | Golden minigun — boss skin |
| Grenade Launcher | Bouncing grenades |
| Rocket Launcher | Massive AOE |
| Flamethrower | Continuous fire cone |
| Guided Missile Launcher | Lock-on tracking |

#### SPECIAL / EXOTIC
| Weapon | Notes |
|---|---|
| Laser Gun | Instant hit beam |
| Electric Rifle | Chains to nearby enemies |
| Explosive Crossbow | Silent, explosive bolt |
| Poison Dart Gun | Damage over time |
| Freeze Ray | Slows enemies |
| Shadow Wolf's Dual SMGs | Unlocked by defeating Shadow Wolf — black finish |
| King Cobra's Rocket Launcher | Golden rocket launcher — boss skin |

---

### BOSS WEAPON SKIN SYSTEM
- Every boss drops a unique skin for their weapon type when defeated
- Skin appears automatically in your "!" collection for that weapon
- Equip it to play with that boss's exact weapon look
- Also unlocks that boss as a **playable character skin**

---

### 100 ANIMAL ENEMY ROSTER

#### TIER 1 — EASY (Animals 1–20)
| # | Name | Weapon | Notes |
|---|---|---|---|
| 1 | Nervous Newt | Fists | Tutorial enemy |
| 2 | Shaky Sheep | Rusty knife | Flinches a lot |
| 3 | Clumsy Cat | Baseball bat | Misses often |
| 4 | Dizzy Dog | Slingshot | Terrible aim |
| 5 | Wobbly Weasel | Old revolver | Slow and predictable |
| 6 | Timid Toad | Pocket knife | Runs away sometimes |
| 7 | Bumbling Bear Cub | Wooden club | Slow swing |
| 8 | Frantic Finch | Dart gun | Fast but weak |
| 9 | Panicking Pig | Paintball gun | Messy, harmless |
| 10 | Scared Squirrel | BB gun | Barely hurts |
| 11 | Anxious Anteater | Fishing rod | Long range but weak |
| 12 | Nervous Narwhal | Water pistol | Wet but harmless |
| 13 | Trembling Turkey | Feather darts | Seasonal enemy |
| 14 | Jumpy Jay | Sling | Blue jay with attitude |
| 15 | Wobbly Walrus | Old musket | Very slow reload |
| 16 | Fidgety Ferret | Cap gun | Mostly noise |
| 17 | Skittish Skunk | Spray attack | Non-lethal, annoying |
| 18 | Clumsy Crow | Broken bottle | Melee only |
| 19 | Rattled Raccoon | Tire iron | First real melee threat |
| **20** | **BOSS: Gangster Duck** | **Black/white/yellow M-16** | **Daffy inspired. Drops M-16 skin + duck playable skin** |

#### TIER 2 — MEDIUM (Animals 21–40)
| # | Name | Weapon | Notes |
|---|---|---|---|
| 21 | Smooth Snake | Silenced pistol | Quiet and sneaky |
| 22 | Cool Cat Carlos | Dual knives | Fast melee combos |
| 23 | Slick Salamander | SMG | First SMG enemy |
| 24 | Chill Chameleon | Sniper (short range) | Tries to blend in |
| 25 | Mellow Moose | Shotgun | Wide spread |
| 26 | Calm Cobra | Poison darts | Damage over time |
| 27 | Relaxed Rhino | Battering ram | Charges forward |
| 28 | Laid-back Llama | Dual pistols | Spits too |
| 29 | Breezy Buffalo | Heavy club | Slow but hits hard |
| 30 | Groovy Gorilla | Small minigun | First heavy weapon enemy |
| 31 | Casual Croc | Machete | Snappy attacks |
| 32 | Mellow Mongoose | Throwing stars | Rapid projectiles |
| 33 | Suave Seahorse | Trident | Unique weapon type |
| 34 | Debonair Deer | Bow and arrows | Precise aim |
| 35 | Classy Crane | Rapier | Elegant and fast |
| 36 | Fancy Flamingo | Stiletto + pistol | Dual threat |
| 37 | Dapper Dolphin | Water cannon | Knockback attack |
| 38 | Sophisticated Sloth | Giant axe | Devastating but extremely slow |
| 39 | Stylish Stork | Throwing knives | Rapid throws |
| **40** | **BOSS: Lion King Leo** | **Golden AK-47** | **Drops golden AK skin + lion playable skin** |

#### TIER 3 — HARD (Animals 41–60)
| # | Name | Weapon | Notes |
|---|---|---|---|
| 41 | Gruff Grizzly | Sledgehammer | Shockwave on hit |
| 42 | Tough Tiger | Dual SMGs | Aggressive pusher |
| 43 | Hard Hyena | Grenades | Laughs when you die |
| 44 | Brutal Boar | Chainsaw | Relentless charger |
| 45 | Fierce Falcon | Talons + shotgun | Dives from above |
| 46 | Savage Shark | Water missile | Aquatic projectiles |
| 47 | Rugged Ram | Shield + battering charge | Hard to stop |
| 48 | Mean Meerkat | Rocket pistol | Tiny but dangerous |
| 49 | Aggressive Armadillo | Shotgun + heavy armor | Hard to damage |
| 50 | Dangerous Dingo | Assault rifle | Fast and accurate |
| 51 | Threatening Tapir | War hammer | Ground slams |
| 52 | Menacing Manta | Electric ray blast | Stuns on hit |
| 53 | Intimidating Iguana | Flamethrower | Area denial |
| 54 | Forceful Fox | Minigun | Fast movement + heavy fire |
| 55 | Powerful Panda | Dual shotguns | Slow but devastating |
| 56 | Dominant Dhole | Sniper rifle | Long range precision |
| 57 | Commanding Capybara | Rocket launcher | Chill but deadly |
| 58 | Formidable Falcon | Grenade launcher | Second falcon, much harder |
| 59 | Imposing Impala | Dual assault rifles | Rapid fire from both |
| **60** | **BOSS: Gangster Gorilla** | **Golden minigun** | **Drops golden minigun skin + gorilla playable skin** |

#### TIER 4 — VERY HARD (Animals 61–80)
| # | Name | Weapon | Notes |
|---|---|---|---|
| 61 | Ruthless Raven | Tactical SMG | Smart, tactical movement |
| 62 | Merciless Mongoose | Dual revolvers | Fan-fires both |
| 63 | Heartless Heron | Precision rifle | Long range headshots |
| 64 | Pitiless Python | Constriction + shotgun | Grabs and shoots |
| 65 | Cold Cheetah | Dual pistols | Fastest enemy in the game |
| 66 | Vicious Vulture | Acid bombs | Ground acid pools |
| 67 | Calculated Cat | Sniper rifle | Waits for perfect shot |
| 68 | Methodical Mole | Underground pop-up attacks | Unpredictable angles |
| 69 | Precise Pelican | Explosive arrows | Pouch stores extra ammo |
| 70 | Tactical Tortoise | Rocket shield | Blocks with rockets attached |
| 71 | Strategic Stag | Guided missile antlers | Homing projectiles |
| 72 | Analytical Aardvark | Machine gun snout | Rapid fire cone |
| 73 | Deliberate Dingo | Explosive mines | Pre-places traps |
| 74 | Systematic Salamander | Electric SMG | Chains to nearby enemies |
| 75 | Planned Platypus | Poison dart shotgun | Spread + poison |
| 76 | Logical Leopard | Thermal sniper | Sees through cover |
| 77 | Reasoned Rhino | Rocket rampage | Fires rockets while charging |
| 78 | Calculated Croc | Laser rifle | Instant beam |
| 79 | Elite Elephant | War cannon trunk | Massive AOE blast |
| **80** | **BOSS: Shadow Wolf** | **Dual golden SMGs + invisibility** | **Drops dual SMG skin + wolf playable skin** |

#### TIER 5 — EXTREME (Animals 81–98)
| # | Name | Weapon | Notes |
|---|---|---|---|
| 81 | Supreme Snake | Electric whip + pistol | Combo attacker |
| 82 | Apex Alligator | Minigun + heavy armor | Tank enemy |
| 83 | Prime Panther | Stealth + dual SMGs | Goes invisible between attacks |
| 84 | Peak Peacock | Explosive feather fan | 360 degree attack |
| 85 | Superior Sloth | Single massive strike | One-shots if it lands |
| 86 | Master Mantis | Precision blade + SMG | Blinding fast |
| 87 | Champion Chimp | Dual rocket pistols | Swings between shots |
| 88 | Legendary Lynx | Sniper + combat knife | Switches between ranges |
| 89 | Ultimate Unicorn | Magical explosive horn | Homing magic blasts |
| 90 | Pinnacle Piranha | Electric bite + speed | Fastest tier 5 enemy |
| 91 | Supreme Stallion | Cavalry charge + shotgun | Unstoppable charge |
| 92 | Apex Armadillo | Indestructible armor + minigun | Requires specific weapons to damage |
| 93 | Elite Eagle Jr. | Precision rockets | Mini version of the main eagle |
| 94 | Maximum Mongoose | Dual grenade launchers | Explosive madness |
| 95 | Paramount Porcupine | Spike missiles | Homes in on player |
| 96 | Formidable Frog | Tongue grapple + shotgun | Pulls you close |
| 97 | Unstoppable Urchin | Spike shotgun | Fires in all directions |
| **98** | **BOSS: King Cobra Commander** | **Golden rocket launcher + poison field** | **Drops rocket launcher skin + cobra playable skin** |

#### FINAL BOSSES
| # | Name | Weapon | Notes |
|---|---|---|---|
| **99** | **Rapid Rabbit** | **SMG — incredibly fast fire** | **Fastest enemy in the entire game. Never stops moving. Drops SMG skin + rabbit playable skin** |
| **100** | **Flex Turtle** | **Slow charge shotgun** | **Heavily armored. Each charge shot devastating. The final boss. Drops charge shotgun skin + turtle playable skin** |

---

### PLAYABLE SKINS
Every animal defeated can be played as. 100 animals = 100 playable skins + default chicken = 101 total playable characters.
Each animal skin is purely cosmetic when played — perks only apply to weapon skins.

### THE EAGLE
- Constant threat throughout all 100 levels
- Swoops from above randomly and with increasing frequency in higher tiers
- Shoot it off before it grabs you
- In tier 5 and final bosses the eagle coordinates with the enemy
- Eagle never fully dies — it always comes back


---

## DEAD ZONE LORE — PRISON BREAK

### Project 50-50
A classified program run by an unknown organization — government, military, or corporate, deliberately never confirmed. The facility was a prison.

They selected ordinary people from the general population. No volunteers. No consent. Injected them with an experimental super soldier serum, sealed them into containment suits, and froze them indefinitely. The intention was to create the ultimate preserved soldiers — frozen until needed, then deployed.

The serum worked. But not cleanly. It mutilated them from the inside. What it did to their faces, their bodies — the containment suits hide most of it. The cracked gas mask is the only window into what's underneath.

Nobody knows the exact number of subjects. Dozens. Maybe hundreds. The program processed people like a production line.

### The Breakout
At some point the subjects woke up. Whether something went wrong with the freezing, whether someone freed them, or whether the serum itself eventually overcame the containment — unknown.

They went rogue immediately. Turned on the military soldiers guarding the facility and fought their way out. During the breakout they took the soldiers' green military gas masks — not out of necessity, but as a symbol of rebellion.

*We were your weapons. Now we're free.*

The crack in every Prison Break's gas mask happened during the breakout. The mutilated flesh visible through it is what the serum did to them underneath.

They scattered into the world before the zombie outbreak even began.

### Why There Are Many
Prison Break is not one person. Every unit you spawn is a different 50-50 subject — a different person who went through the same program. Same suit, same baton, same cracked green mask, same heavy breathing — because they all got the same treatment. The supply is tragically large.

Same crack in the mask. Different face behind it every time.

### Why They're Aggressive When Spawned
In their minds no time passed between the moment they were frozen and the moment they wake up on your battlefield. They go from the middle of the worst moment of their lives straight into combat. No adjustment. No confusion. Just aggression.

### The Death Animation
When Prison Break reaches critical health:

1. He drops to one knee — the weight of his armor finally pulling him down
2. Reaches slowly into his suit
3. Produces a C4 detonator — origin unknown, no explanation given
4. Presses the red button
5. A faint laugh — not panic, not pain. Satisfaction.
6. Explosion — takes everything nearby with him

He decides how he goes out. After everything — taken, experimented on, frozen, used again — this one thing is his.

**Gameplay note:** The explosion damages nearby enemies AND friendly units. Players learn to position Prison Break away from their own squad. The drop to one knee is the warning — get your units clear.

### What the Cowboy Knows
Unknown. He finds Prison Break units in the prison during the story and deploys them. Whether he knows what they are or what was done to them is left to the player's interpretation.

### The C4
Where did he get it. Nobody knows. He just has it. Always has.

---

## DEAD ZONE — FACTION SYSTEM

Seven factions. Each has unique passive bonuses and unit roster. Units belong to one faction (or two in rare dual-faction cases).

---

### FACTION PASSIVES

| Faction | Passive Bonuses |
|---|---|
| **PSS** | 100% bullet resistance, 100% poison/infection immunity, 30% melee resistance |
| **Marines** | 80% melee resistance |
| **Police** | 20% faster cooldowns, 10% discount on all Police units |
| **Berserkers** | 15% speed boost, rage stacks on kills (each kill = +5% damage, max 10 stacks) |
| **WWE** | 25% more damage when health is below 50% |
| **Construction** | 30% more health, tools deal double damage to armored enemies |
| **Animal** | Cannot be infected, 20% faster movement speed |

---

### PSS — PRESERVED SUPER SOLDIERS

The rarest, most expensive faction. Built for ranged-heavy enemies. Bullets bounce off them. Melee will eventually wear them down.

#### Prison Break *(see existing unit + full lore above)*
- **Faction:** PSS
- Most powerful frontline unit in the game

#### AKA
- **Faction:** PSS
- **Appearance:** Tactical gear, laser-scoped AK-47
- **Cost:** 32 essence
- **Cooldown:** 16 seconds
- **Health:** Moderate (PSS passives make him tough against bullets)
- **Weapon:** AK-47 with laser sight and scope
- **Fire mode:** Semi-auto
- **Damage:** 180 per shot (first shot of each engagement deals 280 — accuracy bonus)
- **Special:** First shot of each reload cycle deals bonus damage — rewards controlled fire over panic spraying
- **Weakness:** Close range — semi-auto struggles when zombies get in his face
- **Notes:** Patience unit. Players who fire carefully get incredible value. Players who spam waste his potential.

#### Commander
- **Faction:** PSS
- **Appearance:** PSS tactical armor, carries a 9mm pistol and a black/red PSS shield (PSS spray painted across the top)
- **Cost:** 35 essence
- **Cooldown:** 20 seconds
- **Health:** High (for PSS)
- **Weapon 1:** 9mm pistol — low damage, filler
- **Weapon 2:** PSS Shield Throw — 106 damage, pierces through up to 30 enemies, returns like a boomerang. 20 second cooldown.
- **Passive aura (while alive on field):** All PSS units gain +20% Health, Speed, Accuracy, Critical damage, Valor, Charisma, and 20% cost reduction
- **Special dodge:** Randomly side rolls, backflips, or sidesteps to avoid attacks during reload. Can kick enemies in range while reloading.
- **Weakness:** Low crit — Commander himself rarely crits
- **Notes:** The reason you build a PSS lineup. Deploy him first and let the buffs do the work.

#### Flamethrower
- **Faction:** PSS
- **Appearance:** Heavy PSS containment suit modified with a flamethrower rig — the suit is scorched and blackened from use
- **Cost:** 33 essence
- **Cooldown:** 18 seconds
- **Health:** Low for PSS — the glass cannon of the faction
- **Weapon:** Military-grade PSS flamethrower
- **Damage:** Raw continuous fire — 120 per second, hits everything in a wide cone
- **Special:** None — pure output. What you see is what you get.
- **Weakness:** Fragile for a PSS unit. Up close melee tears him apart. Needs Commander's health buff to survive.
- **Notes:** Insane damage floor, no ceiling tricks. Put Commander on the field first — that health buff turns Flamethrower from glass to viable.

#### Captain Faithful *(dual faction — Marines + PSS)*
- **Faction:** Marines + PSS (gets both faction passives simultaneously)
- **Appearance:** Full Marine armor, American cape, machete on back, Desert Eagle on hip
- **Cost:** 50 essence — the most expensive unit in the entire game
- **Cooldown:** 35 seconds
- **Health:** Very high (Marine armor + PSS passives stacked)
- **Weapon 1:** Desert Eagle — high damage pistol
- **Weapon 2:** Machete
- **Dodge:** Full dodge kit — sidestep, step back, backflip. Extremely hard to hit.
- **Special — Machete Massacre:** Charges through a horde in a single animation, slicing, decapitating, and ripping zombies apart. Insta-kills every non-boss zombie in the path. No exceptions.
- **Weakness:** If caught inside a very large horde he gets briefly trapped. Escapes with a backflip.
- **Combo note:** Sergeant Jeff (Marine buff) + Commander (PSS buff) + Captain Faithful = both faction buffs stacking on one unit. Broken in the best way.
- **Notes:** The single most powerful unit in the game for clearing large zombie hordes. The price tag is justified.

#### Reaper
- **Faction:** PSS
- **Appearance:** PSS containment suit modified with a long black coat draped over the armor. Carries twin PSS-issue combat scythes.
- **Cost:** 36 essence
- **Cooldown:** 22 seconds
- **Health:** Moderate-high
- **Weapons:** Twin combat scythes
- **Damage:** 220 per scythe hit, hits in wide arcs covering both sides simultaneously
- **Special:** Soul Harvest — every 5th kill triggers a scythe spin dealing 400 damage to everything within melee range. Passive.
- **Weakness:** Pure melee — no range whatsoever
- **Notes:** Soul Harvest procs constantly in dense waves. In packed levels Reaper is quietly one of the highest damage per second units on the field.

#### Phantom Rook
- **Faction:** PSS
- **Appearance:** PSS suit but matte black — modified for stealth. Moves differently from other PSS units — silent, deliberate.
- **Cost:** 38 essence
- **Cooldown:** 24 seconds
- **Health:** Moderate (PSS passives carry him)
- **Weapon:** Silenced PSS sniper rifle
- **Damage:** 600 per shot
- **Special:** Spawns in stealth — invisible for 8 seconds before first shot. First shot from stealth always crits (1,200 damage).
- **Weakness:** Bolt-action — slow fire rate. Overwhelmed by fast zombie swarms.
- **Notes:** The stealth crit opener is one of the highest single-hit numbers in the game. Set him up behind tanks and let him open every engagement with a 1,200 damage shot.

---

### MARINES

Disciplined, melee-resistant, anti-zombie specialists. 80% melee resistance makes them the best faction for close-range zombie combat.

#### Captain Faithful *(see PSS above — dual faction)*

#### Private Santiago
- **Faction:** Marines
- **Appearance:** Mexican Marine uniform, standard issue rifle, sniper scope
- **Cost:** 24 essence
- **Cooldown:** 12 seconds
- **Health:** Very fragile — lightest Marine by far
- **Weapon:** Standard Mexican military rifle + sniper configuration
- **Sniper damage:** 1,000 per shot — one of the highest single-shot numbers in the game
- **Rifle damage:** 65 per shot (standard mode)
- **Special:** Can switch between rifle and sniper mode — sniper has a 4 second charge before firing
- **Weakness:** Extremely fragile. One wrong placement and he's gone.
- **Notes:** Glass cannon sniper. 1,000 damage is devastating but he needs protection. Rosa is a sniper too — Santiago hits harder but dies much faster.

#### Sergeant Jeff
- **Faction:** Marines
- **Inspired by:** General Shepherd
- **Appearance:** Veteran Marine sergeant in full combat gear, gruff and commanding
- **Cost:** 28 essence
- **Cooldown:** 15 seconds
- **Health:** Moderate-high
- **Weapon:** Combat shotgun (personal defense, 110 per shot)
- **Passive aura:** While alive, all Marine units on field gain a moderate buff to health, damage, and speed (weaker than Commander's PSS buff — roughly +12% across stats)
- **Special combo:** Sergeant Jeff + Captain Faithful + Prison Break — Captain Faithful gets BOTH Jeff's Marine aura AND Commander's PSS aura simultaneously. Extremely powerful.
- **Notes:** Less flashy than Commander but the Marine aura is still significant. Essential in a full Marine lineup.

#### SAW
- **Faction:** Marines
- **Type:** Utility item (most expensive utility in the game)
- **Appearance:** Marine specialist in satellite communication gear — carries a targeting beacon
- **Cost:** 40 essence
- **Cooldown:** 60 seconds
- **Health:** Moderate
- **Weapon:** Personal defense pistol (weak)
- **Special — Satellite Drop:** Calls in an orbital drop that delivers a full power suit to a targeted location. Any unit from any faction can enter the suit.
- **Power Suit stats:**
  - Health x5
  - Speed ÷5 (very slow, barely moves)
  - Damage x10
  - Lifetime: 420 seconds — when the timer expires the suit explodes killing whoever is inside
- **Notes:** Highest risk / highest reward utility in the game. The right unit in the suit for 420 seconds is devastating. The wrong unit or bad timing is a wasted 40 essence and a dead unit. Captain Faithful in the suit is almost unfair.

#### Casey *(dual faction — Marines + Berserkers)*
- **Faction:** Marines + Berserkers (gets both faction passives)
- **Appearance:** Young woman, casual clothes under a Marine jacket — clearly not standard issue
- **Cost:** 22 essence
- **Cooldown:** 11 seconds
- **Health:** Fragile
- **Weapons:** Dual SMGs
- **Damage:** 35 per bullet, fires both simultaneously — 70 combined per shot at high fire rate
- **Weakness:** Low accuracy — bullets go everywhere, especially at range. Fragile health.
- **Notes:** Spray and pray. Up close she absolutely shreds. At range she wastes ammo. Know her range and she's great value for the cost.

#### Corporal Hendricks
- **Faction:** Marines
- **Appearance:** Young Marine corporal, M16 and combat knife on his belt
- **Cost:** 20 essence
- **Cooldown:** 10 seconds
- **Health:** Moderate
- **Weapon:** M16 (semi-auto, 55 damage per shot), combat knife (95 melee)
- **Special:** Battle Rhythm — after 10 consecutive shots without taking damage his accuracy increases 30% and damage increases 15%
- **Weakness:** Getting hit resets Battle Rhythm completely
- **Notes:** Reliable mid-tier Marine. Battle Rhythm rewards protected positioning. Pair with tanks in front.

#### Lieutenant Cross
- **Faction:** Marines
- **Appearance:** Female Marine lieutenant, riot shield on one arm, pistol in the other
- **Cost:** 26 essence
- **Cooldown:** 13 seconds
- **Health:** High
- **Weapon:** Pistol (75 damage), riot shield (blocks 50% of incoming damage)
- **Special:** Shield Charge — rushes forward pushing all zombies back 3 positions, dealing 120 damage to everything hit
- **Notes:** A defensive tank who can also disrupt zombie positioning. Shield Charge is great for buying time when a wave gets too close to the truck.

---

### POLICE

Fast cooldowns and cheaper costs. Not the strongest faction individually but the volume of units you can deploy is unmatched.

#### Officer Ray
- **Faction:** Police
- **Appearance:** Standard police uniform, service pistol, nightstick on belt
- **Cost:** 15 essence
- **Cooldown:** 8 seconds
- **Health:** Moderate
- **Weapon:** Service pistol (55 damage), nightstick (70 melee)
- **Special:** First Responder — deploys faster than any other unit (no spawn animation delay)
- **Notes:** The Billy of the Police faction but actually useful. Cheap, fast to deploy, decent damage. Spam him to hold the line while building up for bigger units.

#### Detective Vance
- **Faction:** Police
- **Appearance:** Plainclothes detective — trench coat, tie loosened, dual pistols
- **Cost:** 22 essence
- **Cooldown:** 11 seconds
- **Health:** Moderate
- **Weapons:** Dual pistols (65 damage each, rapid fire)
- **Special:** Interrogation — once per deployment can briefly stun a zombie group, making them vulnerable for 3 seconds (all damage to stunned zombies increases 40%)
- **Notes:** Interrogation is deceptively strong. Time it with a unit like Catherine or Brutus for a massive burst window.

#### SWAT Martinez
- **Faction:** Police
- **Appearance:** Full SWAT gear — tactical vest, helmet, MP5 submachine gun
- **Cost:** 28 essence
- **Cooldown:** 14 seconds
- **Health:** High
- **Weapon:** MP5 (40 damage, very high fire rate), flashbang grenades
- **Special:** Flashbang — blinds and disorients all zombies in a medium radius for 4 seconds (they stop attacking and move erratically)
- **Notes:** Flashbang is excellent crowd control. Four seconds of chaos gives your team a free damage window. More tactical than most units.

#### Chief Donnelly
- **Faction:** Police
- **Appearance:** Police chief in full dress uniform, shotgun
- **Cost:** 30 essence
- **Cooldown:** 16 seconds
- **Health:** High
- **Weapon:** Pump-action shotgun (200 per shot, wide spread)
- **Special — Command Presence:** While alive, all Police unit cooldowns decrease by an additional 10% (stacks with the faction passive for 20% total cooldown reduction)
- **Notes:** Makes the already fast Police cooldowns even faster. In a full Police lineup Chief Donnelly turns the faction into a non-stop unit spam machine.

#### Riot Unit — Briggs
- **Faction:** Police
- **Appearance:** Full riot gear — heavy shield, baton, tear gas canisters on belt
- **Cost:** 26 essence
- **Cooldown:** 13 seconds
- **Health:** Very high
- **Weapons:** Riot baton (90 damage), riot shield (blocks 55% damage), tear gas (area denial)
- **Special:** Tear Gas — drops a canister that creates a toxic cloud dealing 30 damage per second and slowing zombies by 40% for 6 seconds
- **Notes:** Best defensive Police unit. Tear gas chokepoints plus the shield makes him a wall that actively punishes anything that tries to push through.

#### K9 Officer Reed
- **Faction:** Police
- **Appearance:** Police officer in tactical uniform with a police K9 dog (Belgian Malinois named Duke)
- **Cost:** 19 essence
- **Cooldown:** 9 seconds
- **Health:** Moderate (officer), High (Duke)
- **Weapons:** Service pistol (officer), bite attacks (Duke — 85 damage per bite, fast)
- **Special:** Duke fights independently alongside Reed — two units for one deployment cost
- **Synergy:** Duke counts as an Animal faction unit — gets Animal faction passives
- **Notes:** Best value Police unit. Two fighters for 19 essence. Duke being Animal faction means he can't be infected and moves faster than Reed.

#### Undercover — Ghost
- **Faction:** Police
- **Appearance:** Plain clothes, looks like a civilian — no visible weapons until combat starts
- **Cost:** 20 essence
- **Cooldown:** 10 seconds
- **Health:** Low-moderate
- **Weapon:** Concealed handgun (80 damage), hidden combat knife (110 melee)
- **Special:** Blend — spawns without drawing zombie attention for 5 seconds. First attack from Blend always lands as a headshot (instant kill on standard zombies).
- **Notes:** Cheap headshot opener. The headshot instant kill on first attack is reliable zombie removal for 20 essence.

---

### BERSERKERS (FLORIDA)

Florida Men. They don't feel fear. They don't feel pain the same way. They thrive in the apocalypse because nothing is weirder than Florida was before it.

#### Dave — Florida Man
- **Faction:** Berserkers
- **Appearance:** Sunglasses, brown hair, blue shirt with cyan palm trees, white shorts
- **Cost:** 18 essence (cheap — but this is just the start)
- **Cooldown:** 9 seconds
- **Health:** Glass sticky note → Card stock → Mountain diamond (fully upgraded with charms)
- **Speed:** Very fast
- **Weapon:** Whatever he found — varies (starts with a lawn chair, upgrades to various improvised weapons)
- **Dodge:** Best dodge kit in the game alongside Commander — sidestep, roll, cartwheel, full backflip, dive
- **Synergy:** Florida Gator becomes cheap and massively buffed when Dave is on the field
- **Upgrade arc:** The most dramatic upgrade path in Dead Zone. Max level Dave with full charms is nearly unkillable despite looking like a tourist.
- **Notes:** The highest skill ceiling unit in the Berserker faction. Looks useless. Rewards investment harder than almost any unit.

#### Casey *(dual faction — see Marines above)*

#### Florida Gator
- **Faction:** Animal + Berserkers (dual faction)
- **Appearance:** 12 foot Florida alligator dressed in a golf sweater
- **Cost:** 42 essence normally — reduced to 22 essence when Dave is on the field
- **Cooldown:** 25 seconds
- **Health:** Very high
- **Weapon:** His body — death roll and snap attacks
- **Special 1 — Death Roll:** Grabs a zombie and death rolls continuously dealing 200 damage per second until the zombie is destroyed. Legendary attack animation.
- **Special 2 — Snap:** Bites standard zombies in half. Insta-kills anything below mid-tier health.
- **Synergy:** Dave on field = -20 essence cost and +30% damage boost
- **Notes:** One of the most unique units in the game. The golf sweater is non-negotiable. Expensive alone, incredible value with Dave.

#### Gus — The Lawn Mower Man
- **Faction:** Berserkers
- **Appearance:** Old Florida man, sunburned, straw hat, pushing a riding lawn mower
- **Cost:** 20 essence
- **Cooldown:** 11 seconds
- **Health:** Moderate (the mower takes most hits)
- **Weapon:** Riding lawn mower — runs over zombies
- **Damage:** 180 per zombie run over, hits multiple in a line
- **Special:** The mower can be destroyed (it takes damage separately) — when destroyed Gus continues fighting with a garden rake (50 damage, very slow)
- **Notes:** The mower is the real unit. Protect it. A rageful old man with a rake is not the same.

#### Ricky — Fireworks Guy
- **Faction:** Berserkers
- **Appearance:** Florida man in an American flag tank top holding a bundle of fireworks
- **Cost:** 21 essence
- **Cooldown:** 10 seconds
- **Health:** Fragile
- **Weapon:** Fireworks (thrown explosives)
- **Damage:** 250 per firework, random bounce on landing — unpredictable blast radius
- **Special:** Roman Candle — lights a roman candle that fires 8 shots in random directions dealing 100 each. Completely random. Can hit enemies or not. That's the point.
- **Weakness:** Unpredictable. Sometimes brilliant. Sometimes wastes everything.
- **Notes:** The chaos unit. In tight zombie clusters Roman Candle can be devastating. In open areas it might hit nothing. Florida Man energy perfectly translated to gameplay.

#### Terry — The Swamp Man
- **Faction:** Berserkers
- **Appearance:** Large bearded Florida man, waders, mud-covered, wielding a boat oar
- **Cost:** 23 essence
- **Cooldown:** 12 seconds
- **Health:** High
- **Weapon:** Boat oar (130 damage, wide swing) + fishing net (thrown, immobilizes)
- **Special:** Swamp Toss — picks up a zombie and throws it into the horde dealing 200 damage to the thrown zombie and 150 to everything it hits
- **Notes:** Solid tank with a genuinely useful crowd control tool. Swamp Toss pairs great with Rosa or Santiago — immobilized airborne target is an easy shot.

#### Karen
- **Faction:** Berserkers
- **Appearance:** Florida Karen — mom haircut, sunglasses on her head, carrying a Whole Foods bag full of improvised weapons
- **Cost:** 16 essence
- **Cooldown:** 8 seconds
- **Health:** Low
- **Weapon:** Whatever's in the bag — random each spawn (wine bottle, can of soup, a book, garden shears)
- **Special:** Speak to the Manager — once per deployment lets out a shriek that stuns all nearby zombies for 2 seconds out of pure aggression
- **Weakness:** Fragile and her weapon is random — you never know exactly what you're getting
- **Notes:** Cheap, unpredictable, surprisingly effective. The stun is legitimately useful. Players either love her or can't stand her. Very Florida.

---

### WWE

Early and early-mid game faction. Strong at the start, falls off hard in the late game when zombie health scales past what pure physical combat can handle.

**Faction note:** WWE units deal 25% more damage when below 50% health — this helps them stay useful longer but doesn't fix the late game scaling issue.

#### Fighter Marco
- **Faction:** WWE
- **Appearance:** Wrestler in trunks and boots, muscular, classic wrestler look
- **Cost:** 18 essence
- **Cooldown:** 9 seconds
- **Health:** Moderate-high
- **Weapon:** Fists — punches and wrestling moves
- **Special — Legendary Headbutt:** 300 damage, stuns the target for 2 seconds. Cooldown 12 seconds.
- **Weakness:** 300 damage falls off completely in late game (zombies reach 600-800+ health)
- **Notes:** Carries the early game hard. By mid game he's support at best. Players who don't swap him out will regret it.

#### Wrestler Jack
- **Faction:** WWE
- **Appearance:** Classic wrestler with championship belt — still wearing it into the apocalypse
- **Cost:** 22 essence
- **Cooldown:** 11 seconds
- **Health:** Moderate-high
- **Weapon:** Pistol (450 damage — way more than you'd expect from a wrestler), folding chair (melee, 85 damage)
- **Special:** Championship Drop — bodyslam that deals 200 damage and knocks back everything in melee range
- **Notes:** The best WWE unit. The pistol keeps him relevant into mid game unlike his faction mates. Players who invest in upgrades can stretch him into early-late game.

#### Bob
- **Faction:** WWE
- **Appearance:** Skinny, clearly not a fighter, somehow ended up here
- **Cost:** 10 essence
- **Cooldown:** 6 seconds
- **Health:** Glass pencil — dies to basically one hit from anything
- **Weapon:** Slap (15 damage)
- **Special:** None
- **Notes:** The cheapest non-Billy unit in the game. Exists purely to waste zombie attention for half a second while you build up essence. Place him, accept his sacrifice, move on.

#### The Champ — Rex Thunder
- **Faction:** WWE
- **Appearance:** Massive wrestler, championship title belt, pyrotechnics (yes, he carries them)
- **Cost:** 28 essence
- **Cooldown:** 15 seconds
- **Health:** Very high for WWE
- **Weapon:** Fists (170 damage), championship belt (110 whip damage, ranged)
- **Special — Entrance Pyro:** On spawn releases a pyrotechnic blast dealing 300 fire damage to the nearest 5 zombies
- **Notes:** The premium WWE unit. Entrance Pyro makes him immediately useful on spawn. His health lets him survive longer than the rest of the faction.

#### Lucha Libre — El Diablo
- **Faction:** WWE
- **Appearance:** Masked luchador in red and black, incredibly fast
- **Cost:** 20 essence
- **Cooldown:** 10 seconds
- **Health:** Low-moderate
- **Weapon:** Flying kicks and arm drags (80 damage per hit, very fast attack speed)
- **Speed:** Fastest WWE unit by far
- **Special:** Springboard — launches off the nearest obstacle (truck, wall, barrier) and delivers a flying kick dealing 250 damage to a single target
- **Notes:** Speed makes him more viable than most WWE units. He can hit and avoid retaliation. Best in early-mid game but the speed keeps him around longer than Marco or Bob.

#### Tag Team — The Brothers (Sal & Lou)
- **Faction:** WWE
- **Appearance:** Two brothers in matching gear — one big, one lean
- **Cost:** 30 essence (deploys both)
- **Cooldown:** 18 seconds
- **Health:** Moderate each
- **Weapons:** Sal — power moves (200 damage, slow). Lou — quick strikes (70 damage, very fast).
- **Special — Tag In:** Every 15 seconds one brother tags the other — the tagged brother gets a 20% damage boost for 8 seconds
- **Notes:** WWE's version of The Twins. Losing one cuts their combo significantly. Sal tanks, Lou picks off anything Sal pushes back.

---

### CONSTRUCTION

Tanky, hard-hitting, built for armored zombie variants. Their tools deal double damage to armored enemies — in levels with heavy armor zombie variants Construction becomes the go-to faction.

#### Foreman Duke
- **Faction:** Construction
- **Appearance:** Stocky foreman in a hard hat and high-vis vest, carrying a clipboard and a nail gun
- **Cost:** 20 essence
- **Cooldown:** 10 seconds
- **Health:** High (Construction passive)
- **Weapon:** Nail gun (45 damage per nail, rapid fire — 8 nails per second), clipboard (melee joke weapon, 20 damage)
- **Special — Work Order:** Passive. Construction units within range of Foreman Duke deal 10% more damage.
- **Notes:** The budget Commander for Construction. The damage aura is weaker but he costs half. First Construction unit you should deploy.

#### Jackhammer Joe
- **Faction:** Construction
- **Appearance:** Big guy in dusty work gear, operating a jackhammer
- **Cost:** 26 essence
- **Cooldown:** 13 seconds
- **Health:** Very high
- **Weapon:** Jackhammer
- **Damage:** 150 per second continuous ground shaking, knocks back everything in front of him
- **Special:** Ground Shatter — drives the jackhammer into the ground creating a shockwave that trips and stuns all ground zombies nearby for 3 seconds
- **Weakness:** Slow, can't move and attack simultaneously
- **Notes:** Incredible zoning unit. Ground Shatter is one of the best crowd control abilities against large zombie ground waves.

#### Demolitions Dez
- **Faction:** Construction
- **Appearance:** Construction worker with a wrecking ball on a chain and a tool belt full of explosives
- **Cost:** 30 essence
- **Cooldown:** 17 seconds
- **Health:** Moderate-high
- **Weapon:** Wrecking ball chain (200 damage, wide swing), construction explosives
- **Explosive damage:** 450 per charge, placed not thrown
- **Special:** Controlled Demolition — plants an explosive on the largest zombie on the field — detonates after 3 seconds dealing 600 damage
- **Notes:** Best Construction damage dealer. Controlled Demolition targets the priority threat automatically. Wrecking ball handles crowds while waiting for the explosive to cook.

#### The Crane Operator — Big Terry
- **Faction:** Construction
- **Type:** Utility/support
- **Appearance:** Construction worker in an orange vest, controls a remote for off-screen crane
- **Cost:** 32 essence
- **Cooldown:** 30 seconds
- **Health:** Low
- **Weapon:** Wrench (melee, 60 damage — he's not a fighter)
- **Special — Crane Drop:** Calls in an off-screen crane that drops a massive steel beam dealing 800 damage to a large area. Single use per deployment (30 second cooldown after first use).
- **Weakness:** Big Terry himself is fragile — keep him behind tanks
- **Notes:** The crane drop is one of the most satisfying abilities in the game visually and mechanically. The 800 area damage is massive. Protect Big Terry at all costs.

#### Concrete Carlos
- **Faction:** Construction
- **Appearance:** Burly construction worker covered in dried concrete, wears a concrete mixer backpack
- **Cost:** 24 essence
- **Cooldown:** 12 seconds
- **Health:** High
- **Weapon:** Concrete sprayer (covers zombies in fast-drying concrete)
- **Damage:** 60 impact, but zombies covered in concrete slow to 20% movement speed for 5 seconds
- **Special:** Cement Wall — sprays a barrier of concrete across the field that zombies must break through (2,000 health barrier, lasts until destroyed)
- **Notes:** The best zoning unit in the Construction faction. Cement Wall buys critical time on defense missions. Pairs perfectly with any ranged unit behind it.

#### Sparky
- **Faction:** Construction
- **Appearance:** Small electrician in work gear, hard hat with a light on it, electrical tool belt
- **Cost:** 18 essence
- **Cooldown:** 9 seconds
- **Health:** Low-moderate
- **Weapon:** Electrical drill (melee, 90 electrical damage), wire toss (ranged, 70 damage + briefly shocks)
- **Special:** Power Surge — overloads his tools sending an electrical pulse that damages all metal-armored zombies for 300 (double damage vs armored = 600 effective)
- **Notes:** Cheap electrical damage that synergizes with the Construction double-damage-on-armor passive. Essential against armored zombie variants.

#### Wrecking Ball — Big Mike
- **Faction:** Construction
- **Appearance:** Enormous construction worker, no shirt, hard hat, literally just carries a wrecking ball in one hand
- **Cost:** 35 essence
- **Cooldown:** 22 seconds
- **Health:** 10,000 — highest in Construction faction
- **Weapon:** Wrecking ball (hand-held) — 350 per swing, massive knockback
- **Special:** Full Swing — winds up for 2 seconds then releases a sweeping blow that hits EVERY zombie on the field simultaneously for 200 damage
- **Weakness:** 2 second wind-up is a vulnerability window — fast zombies can interrupt
- **Notes:** Full Swing is one of the best wave clear abilities in the game against non-armored zombies. Against armored zombies the Construction passive doubles his already high damage output.

---

### ANIMAL FACTION

Cannot be infected. 20% faster movement. Best for mobile flanking strategies and economy (Sparkle's coin generation).

#### Buddy — Gray Doberman *(legendary)*
*(Already in main unit list — unit #3)*
- **Faction:** Animal
- **Role:** Fast retrieval, flanker, legendary late-game carry when maxed
- **Notes:** The legendary Animal unit. Feels weak early. Max upgraded Buddy is an absolute beast.

#### Sparkle — Diamond Pitbull
- **Faction:** Animal
- **Appearance:** Glittering diamond-coated pitbull — literally shines in light
- **Cost:** 25 essence
- **Cooldown:** 12 seconds
- **Health:** High against blunt damage (diamond hardness), glass against sharp/blade damage (diamond brittleness)
- **Weapon:** Bite attacks (110 damage per bite)
- **Special:** Every kill generates coins/money for the player — passive income unit
- **Damage type note:** Blunt zombies (clubs, fists) barely scratch her. Blade zombies (swords, claws, machetes) destroy her fast.
- **Notes:** Primary economy unit. In long missions Sparkle's coin generation is significant. The diamond lore reason for the damage type vulnerability is perfect.

#### Florida Gator *(see Berserkers above — dual faction)*

#### Rex — Rottweiler
- **Faction:** Animal
- **Cost:** 20 essence
- **Cooldown:** 10 seconds
- **Health:** High
- **Speed:** Moderate
- **Special:** Charge — knocks back groups of zombies on spawn
- **Notes:** Solid frontline tank for the Animal faction.

#### Blaze — Red and Black German Shepherd
- **Faction:** Animal
- **Cost:** 18 essence
- **Cooldown:** 9 seconds
- **Health:** Moderate
- **Speed:** Fast
- **Special:** Fire bite — attacks briefly set zombies on fire (30 damage per second for 3 seconds)
- **Notes:** Great early-mid game. Falls off late when zombie health scales past where a fire DoT matters.

#### Ghost — White Husky
- **Faction:** Animal
- **Cost:** 16 essence
- **Cooldown:** 8 seconds
- **Health:** Low-moderate
- **Speed:** Fast
- **Special:** Silent movement — does not aggro additional zombies when repositioning. Camouflage in snow/fog levels (harder to target)
- **Notes:** Utility animal. The silence passive is genuinely useful in levels where noise attracts zombie waves.

#### Tank — Oversized Bulldog
- **Faction:** Animal
- **Cost:** 22 essence
- **Cooldown:** 11 seconds
- **Health:** Very high — highest base health in the animal faction besides Buddy maxed
- **Speed:** Very slow
- **Special:** Immovable for first 5 seconds after spawn — cannot be knocked back
- **Notes:** The meatshield of the Animal faction. Slow but absorbs enormous damage. Buy time by throwing Tank into a horde.

#### Pepper — Chihuahua
- **Faction:** Animal
- **Cost:** 8 essence — cheapest Animal unit
- **Cooldown:** 5 seconds
- **Health:** Glass
- **Speed:** Extremely fast
- **Special:** Bleed stacks — each bite applies a bleed that stacks up to 5 times (5 stacks = 50 damage per second). Annoying, relentless.
- **Notes:** Useless alone. In groups of 3-4 Peppers the bleed stacks become genuinely threatening. Cheap enough to spam.

#### Shadow — Black Labrador
- **Faction:** Animal
- **Cost:** 21 essence
- **Cooldown:** 10 seconds
- **Health:** Moderate
- **Speed:** Fast
- **Special:** Flanker — spawns behind the zombie line rather than the front. First bite from behind deals double damage.
- **Notes:** Positioning unit. The rear spawn is unique — Shadow applies pressure from two directions simultaneously.

#### Kong — Great Dane
- **Faction:** Animal
- **Cost:** 28 essence
- **Cooldown:** 14 seconds
- **Health:** High
- **Speed:** Moderate
- **Special — Body Slam:** Leaps and lands on a group of zombies dealing 300 area damage to everything underneath
- **Notes:** The premium Animal faction bruiser. Body Slam is one of the better area damage abilities in the faction.

---

*All faction units saved. Total factions: 7. Dual faction units: Captain Faithful (Marines + PSS), Casey (Marines + Berserkers), Florida Gator (Animal + Berserkers).*

---

## DEAD ZONE — CAMPAIGN STORY SCRIPT

---

### CHAPTER 1: ASSEMBLY
*(Recruitment dialogue already written above)*

---

### CHAPTER 2: THE FIRST MISSION

*A collapsed city street. Zombies fill every block as far as the eye can see. The truck idles at the edge.*

**Terry:** *(looking out the window)* That's a lot of them.

**Briggs:** How many you think.

**Terry:** Too many.

**Cross:** Faithful. What's the plan.

*Faithful is already stepping out of the truck.*

**Faithful:** Stay close to the truck. Don't let them reach the generator.

**Reaper:** And you?

*Faithful rolls his neck. Cracks his knuckles.*

**Faithful:** I'll clear the path.

*He walks forward into the horde alone. Then he's airborne — flying straight through the crowd, ripping zombies apart with his bare hands, moving faster than anything that size should move. The team watches in silence.*

**Terry:** *(quietly)* What is he.

**Cross:** PSS file said enhanced strength, speed, flight. Limited compared to what they were trying to build but—

**Terry:** That doesn't look limited.

**Briggs:** He can still die. Remember that. He bleeds.

**Reaper:** *(watching Faithful work)* He's just making sure he doesn't have to.

*Twenty minutes later. The street is clear. Faithful lands in front of the truck, barely breathing hard. A gash on his arm. He's bleeding.*

**Faithful:** *(to Briggs)* You were right. I bleed.

**Briggs:** *(hands him a bandage)* Don't let it happen again.

*They push deeper into the city.*

---

### CHAPTER 3: THE BUNKER

*Underground. A reinforced door, military grade, half buried under rubble. The PSS insignia barely visible under years of grime.*

*Faithful stops cold.*

**Cross:** What is it.

**Faithful:** *(quiet)* I know this door.

**Terry:** From where.

*Faithful doesn't answer. He steps forward and places his hand on the insignia.*

**Faithful:** Everyone stay back.

**Briggs:** Faithful—

**Faithful:** I said stay back.

*He pushes the door open alone.*

*Darkness inside. Then — a shield comes screaming out of the dark and grazes Faithful's temple, drawing blood. He barely dodges.*

*Commander charges out of the shadows — massive, armored, gas mask cracked, baton already swinging.*

**Faithful:** WAIT—

*Commander doesn't wait. He drives his shoulder into Faithful and slams him into the wall.*

**Cross:** *(raising her shield)* MOVE—

**Faithful:** *(shouting)* NOBODY MOVE. STAND DOWN.

*Commander grabs Faithful by the throat and lifts him off the ground.*

**Commander:** PSS facility. Unauthorized entry. Identify yourself.

**Faithful:** *(struggling)* Captain. Faithful. Project PSS. Authorization code Sierra-Zero-Seven.

*Commander freezes.*

*A long silence.*

**Commander:** *(slowly lowers him)* That code was decommissioned four years ago.

**Faithful:** *(catching his breath)* I know. I wrote it.

*Commander steps back. Studies him.*

**Commander:** You're the one who built SAW.

**Faithful:** Among other things.

**Commander:** *(looks at the team behind Faithful)* Who are they.

**Faithful:** My team.

**Commander:** They're not PSS.

**Faithful:** No. But they're alive, which is more than I can say for most people right now. *(beat)* You're not what I expected to find down here.

**Commander:** What did you expect.

**Faithful:** Equipment. Maybe bodies. Not— *(looks at him)* How long have you been down here.

**Commander:** *(pause)* Long enough to stop counting.

**Reaper:** *(from behind Faithful, studying Commander)* He's PSS. Like Prison Break.

**Commander:** *(sharp look)* Don't compare me to those ones.

**Faithful:** How many of you are left.

**Commander:** I'm the last.

*A deep, guttural groan echoes from somewhere deep in the bunker. Everyone tenses.*

**Faithful:** What was that.

**Commander:** *(completely calm)* Judging by the sound — that's either Flamethrower or AKA. Once you've been hearing them long enough you can tell them apart.

**Cross:** I thought you said you were the last.

**Commander:** *(quietly)* The last one worth counting.

---

### CHAPTER 4: WHAT'S LEFT OF THEM

*Deeper in the bunker. A storage room. The door is ajar.*

*Faithful pushes it open.*

*Flamethrower and AKA are on the ground over Rook's body. Feasting. AKA's mask is missing. What's underneath it — nobody on the team speaks.*

**Terry:** *(turns away)* God.

**Cross:** *(hand on her shield)* Faithful—

*Commander walks past all of them and stands in the doorway. He looks at Flamethrower and AKA for a long moment.*

**Commander:** It got worse. After you stopped sending supply drops. *(beat)* The serum does things to the mind when they're not maintained. I held on. They didn't.

**Faithful:** Who was he. *(gestures toward Rook)*

**Commander:** Phantom Rook. He was the best of us. Quiet. Precise. He kept them calm for a long time. *(pause)* Until he couldn't anymore.

*AKA looks up. Sees Faithful. Something flickers in his eyes — not recognition. Hunger.*

*He lunges.*

*Faithful catches him mid-air by the throat with one hand. Holds him there.*

**Commander:** *(doesn't move)* He's gone. Whatever he was — it's not in there anymore.

*Faithful looks at Commander.*

**Commander:** *(flat)* Do what you have to do.

*Faithful does.*

*Flamethrower makes a sound — not a word, just a sound. Commander steps forward and stands between Flamethrower and the team.*

**Faithful:** Commander—

**Commander:** No.

**Faithful:** He's not—

**Commander:** I said no. *(turns to face Faithful)* AKA I can live with. Not him.

*A long silence.*

**Faithful:** *(quietly)* Okay.

*He steps back. Commander kneels in front of Flamethrower.*

**Commander:** *(barely above a whisper)* I've got you. You hear me? I've got you.

*Flamethrower makes that sound again. Commander doesn't flinch.*

---

### CHAPTER 5: WHAT THE COMMANDER CARRIES

*That night. Outside the bunker. Faithful sits on the truck hood. Commander approaches.*

**Commander:** Your team is afraid of me.

**Faithful:** They're cautious. There's a difference.

**Commander:** *(sits)* AKA killed his own parents. Did you know that?

**Faithful:** I heard rumors.

**Commander:** It wasn't a rumor. He told me himself. Said it proved his loyalty to the program. Said family was a weakness. *(long pause)* I never understood that. I never knew mine. My real ones. And he had them and he just— *(stops)*

**Faithful:** I'm sorry.

**Commander:** Don't be sorry. Just— *(looks at him)* Did you ever have anyone? Before all this?

*Faithful goes very still.*

**Faithful:** *(quietly)* I don't... I don't remember. There might have been someone. I can't—*(touches his temple)* It's not there anymore.

**Commander:** What do you mean it's not there.

**Faithful:** I mean exactly that. There are gaps. Things that should be there that aren't. *(beat)* Someone made sure of it.

*Commander studies him.*

**Commander:** The program.

**Faithful:** Probably.

**Commander:** *(quietly)* What did they take from you.

**Faithful:** *(stares at the sky)* I don't know. That's the worst part. I don't know what I'm missing.

*Silence.*

**Commander:** I used to talk to the walls down there. When it was just me. Tell them about the parents I never knew. Make up stories about what they might've been like. *(pause)* Stupid.

**Faithful:** It's not stupid.

**Commander:** It felt stupid.

**Faithful:** It felt human. There's a difference.

*Another silence. Longer this time.*

**Commander:** I'll come with you. Wherever you're going.

**Faithful:** You don't know where that is.

**Commander:** Doesn't matter. *(stands)* Anywhere is better than down there.

---

### CHAPTER 6: THE SKULL

*Midway through the campaign. A brutal battle. Faithful fighting a massive armored zombie variant — something new, something wrong, something that hits harder than anything they've faced.*

*It gets through. A crushing blow to the side of Faithful's head.*

*He goes down.*

**Cross:** FAITHFUL—

**Casey:** *(already moving toward him)* I've got him — EVERYONE HOLD THE LINE—

*The team fights without him. When the battle ends Faithful is unconscious, his skull visibly damaged. Casey is kneeling over him, her hand pressed to the side of his head.*

**Terry:** Is he—

**Casey:** He's breathing. *(her voice is steady but her hands are shaking)* He's breathing.

**Commander:** What do we do.

**Casey:** We wait.

*She doesn't leave his side.*

---

*Hours later. Faithful opens his eyes.*

*Casey is still there.*

*He looks at her. Really looks at her. Something shifts in his face — confusion first. Then something deeper. Something waking up.*

**Faithful:** *(barely a whisper)* ...Casey.

*She goes completely still.*

**Faithful:** *(reaching up slowly)* Casey. You're — how are you—

*His voice breaks.*

**Casey:** *(not moving)* Faithful—

**Faithful:** I watched you — they told me — I saw—*(sits up, takes her face in his hands)* How long. How long have you known.

**Casey:** *(tears)* Since the beginning.

**Faithful:** *(devastated)* Since the— you've been here this whole time and you didn't—

**Casey:** I couldn't. You were finally okay. You were functioning and leading and I couldn't — I didn't want to be the thing that broke you again—

**Faithful:** YOU are not the thing that would've broken me. LOSING you broke me. Having you back—*(pulls her in)* How are you alive. I watched—

**Casey:** I don't fully know. I woke up and you were gone and I had nothing and I just — I kept moving. I kept surviving. And then I found your team and I thought if I could just stay close—

**Faithful:** *(quiet, holding her)* I forgot you. They made me forget you and I am so sorry. I am so sorry.

**Casey:** *(holds on)* You didn't forget me. They hid you from yourself. That's different.

*Long silence.*

**Faithful:** *(pulls back, looks at her)* There's something else. Something else I'm starting to remember. Casey — did we—*(stops)* Did we have a child.

*Casey's breath catches.*

**Casey:** ...Yes.

**Faithful:** What happened to them.

*Casey looks across the camp. Her eyes find Commander — sitting alone, sharpening his baton, unaware.*

*She looks back at Faithful.*

**Casey:** *(barely audible)* I'll tell you everything. I promise. Just — not yet. Let me figure out how to say it.

*Faithful follows her gaze to Commander. Then back to her.*

*Something is already assembling in his mind.*

**Faithful:** *(quiet)* Casey.

**Casey:** Not yet.

*He nods slowly. Holds her hand.*

*Across the camp Commander looks up — catches Faithful looking at him. Nods once. Goes back to sharpening.*

*He has no idea.*

---

*[TO BE CONTINUED — MORE MISSIONS AND THE COMMANDER REVEAL COMING LATER]*

---
