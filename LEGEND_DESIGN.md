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
*Units 8-60 to be designed*
*Unlock levels for all units TBD*
