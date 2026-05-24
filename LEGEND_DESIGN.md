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
- 900 levels, progressively harder
- Multiple skins to unlock
- Quests — daily/weekly challenges
- Coins — earn and spend on skins/powerups

### Game 2 — Dead Zone
*(See full Dead Zone design doc below)*

### Game 3 — Legend's Knight
- Pixel RPG
- You play as the gold armored warrior from the Legend logo
- Setting: Fairytale grasslands — lush, colorful, magical
- Enemies: Demons and wizards
- Full RPG: level up, gear, skills, story quest

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
