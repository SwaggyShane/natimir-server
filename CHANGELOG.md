# Narmir Reborn — Pure. Damn. Evil.
## Changelog

---

### v1.1.0 — May 2026 (Current)

#### New Features
- **Certified Blueprints & Masonry Upgrades** — New certified blueprint system for advanced construction. Masonry upgrade tree unlocks enhanced wall and structure capabilities.
- **Full Spy System** — Tiered spy outcomes (surveillance, partial intel, full report). Alliance intel sharing — members can share spy reports with the alliance board. Spy report history panel with per-report share toggle.
- **Hero System** — Named hero units with unique abilities. Heroes gain XP from combat and turn activity. Hero bonuses apply to kingdom stats each turn. Idle heroes contribute passive bonuses.
- **World Fragments & Hybrid Blueprints** — Rare world fragment drops from expeditions. Hybrid blueprints combine two building types for unique bonuses. Assign hybrid blueprints for 500k gold + 100k mana.
- **Prestige / Rebirth** — Kingdoms at Level 50 can Rebirth for a permanent prestige level bonus. Rebirth resets the kingdom with carry-over advantages.
- **Lore & Achievements Collection** — Players discover and collect lore entries as they play. 200 total lore entries across 8 categories (Narmir world lore, general wisdom, and 6 race-specific histories). Achievements tracked and displayed in the Library panel.
- **Race Lore — 25 entries per race** — Deep narrative lore written for all 6 races plus Narmir world history and general wisdom entries. Visible in the Library as kingdoms unlock them through play.
- **Racial Gift Fanfare** — On first reaching unit Level 5, a 4-note ascending fanfare plays, a 6-second toast fires, and the racial gift badge pulses on the Training panel.
- **Attack Insult (MP3)** — `fart.mp3` plays when your kingdom is attacked. Replaces the old text-to-speech system. Test button in Admin → Manage.
- **Tax Rate Strip** — Tax %, Income/turn, Upkeep/turn, and Net/turn shown below the resource metrics strip on the status panel.

#### Fixes & Improvements
- **Colosseums removed** — `bld_colosseums` building type retired. Entertainment handled through Taverns.
- **Dwarf badge text added** — `RACIAL_BADGE_TEXT` now includes Dwarf (⚒️ Dwarven Mastery — war machines need only 1 engineer to crew).
- **Spell "undefined" fixed** — SCROLL_DEFS uses `label` not `name`. Both the main spell panel and warfare spell tab now use `sp.label` with safe fallbacks.
- **Racial gift badge state** — `syncUI` now correctly reads `racial_bonuses_unlocked` instead of the non-existent `racial_gift_active`.
- **state.loaded guard** — `syncUI` now bails early until `loadKingdom()` has fully populated state, preventing the countdown timer from overwriting correct values with defaults every second.
- **Kingdom header writes in syncUI** — Name, owner line, and turn number are now written inside `syncUI` using state, so they stay current across all updates not just on login.
- **Toast duration parameter** — `toast()` now accepts an optional duration argument (used for 6-second racial gift unlock message).
- **Alliance panel mobile** — Single column on mobile (<900px), two columns on desktop.
- **Studies/Defence/Economy grids** — All inner two-column grids collapse to single column on mobile (<600px).
- **Tab strips** — All panel tab strips now use `flex-wrap` so tabs wrap instead of overflowing on small screens. Tab font 15px mobile / 19px desktop.
- **Admin changelog** — Updated to include all features through v1.1.0.
- **Admin events panel** — 📅 Events tab: event log with kingdom/season filter, full event editor (create/edit/delete/toggle) with effect type dropdown.
- **Admin audio test** — 💨 Test attack insult button in Admin → Manage tab.
- **Flush locations button** — Admin → Manage → 🗺️ Flush all locations clears discovered_kingdoms and location_maps_wip for all players.

---

### v1.0.6 — April 2026

- **Seasons & Daily Events** — 13-day real-time cycle: Spring (3d) → Summer (5d) → Fall (2d) → Winter (3d). One event per kingdom per real day. 21 seeded events with seasonal and racial variants. Farm yield modified by season (Summer ×1.20, Winter ×0.70). Season badge on status panel.
- **Location System** — Kingdoms must be discovered before interaction. Scout expeditions 10–15% discovery chance. 10 scribes × 5 turns creates a location map (consumes 1 blank map). Auto-stored on being attacked or caught. Map theft covert action.
- **Smithy Overhaul** — Hammers (25 GC) and scaffolding (2,500 GC) purchased directly for gold. No more engineer allocation sliders. Max button fills to max affordable.
- **Warfare Panel** — Single panel replacing separate Attack/Spells/Covert nav items. War log at top, three tabs: ⚔️ Attack · ✨ Spells · 🕵️ Covert. All single-column mobile layout.
- **Hire Panel Rebuild** — Grid layout with unit name, count, price (race-adjusted), input + Hire/Fire buttons stacked right-justified. Variable prices per unit and race shown per row.
- **Shrine Clerics** — Studies shrine tab now has cleric allocation input and Save button wired to shrine-allocation route.
- **Tavern in Build Panel** — Tavern row added with ba-tavern input. Added to BUILD_FIELDS, BA_FIELDS, BUILDING_COST, BUILDING_COL, BUILDING_GOLD_COST in engine.
- **Turns to 400/day** — Regen: +7 turns every 25 minutes, max 400. Schema default updated.
- **Rankings fix** — loadRankings shows error message instead of silently bailing. Auto-retry after 500ms on auth error. Always force-refreshes on tab switch.
- **Resource strip hidden** — kd-top hidden on Warfare, News, Rankings, Exploration, Studies, Training, Alliances, Hire, Defence, Chat panels via CSS body class.
- **War Log fix** — Route now returns `{rows:[]}` format. Both loadWarLog and loadWarfarePanel handle both formats.

---

### v1.0.5 — April 2026

- WISH-LIST DELIVERIES — Trade System, Bounty Board, Direct Messaging, Mercenary Camp all shipped.
- INTERFACE PATCH — Library correctly houses scribes only. New badges (Siege, Racial Gift, Citadel). Rankings refresh. Market Clear Logs. Hire page rework.
- REGION CAPTURE & MASTERY — Alliances can contest and capture territories for +10% faction bonus.
- ALLIANCE LEADERBOARDS — Coalition total land / member rankings.
- BOUNTY BOARD — Gold bounties on rival kingdoms; first attacker to win claims the reward.
- DIRECT MESSAGING — Private 1-on-1 kingdom chat from rankings or profile.
- KINGDOM LORE/BIOS — Custom kingdom description on public profile.
- NARMIR REBORN — Aesthetic rebrand to "Pure. Damn. Evil."
- Racial Unit Bonuses (Lv 5+) — All 6 races implemented and verified.
- Persistent chat personalization — `/nick` and `/color` commands.
- Extended Protection — Newbie shield until Turn 400.
- Race Starting Buildings — Custom starting kits per race.

---

### Core Systems
- Registration, login, JWT auth with httpOnly cookie
- Turn system — +7 every 25 min, max 400, crash-safe boot catch-up
- 6 playable races with unique bonuses and penalties (Dwarf, High Elf, Orc, Dark Elf, Human, Dire Wolf)
- Kingdom status panel with resource tiles, XP bar, protection badge, season badge, tax strip
- Three-column desktop status layout (military, research, buildings)
- Newbie protection — kingdoms under Turn 400 cannot be attacked, spelled, or covert-targeted
- Active effects bar — fog, blight, silence, plague, shield displayed as pill badges

---

### Economy
- Race-adjusted gold production: Dwarf 457 · Orc 418 · High Elf/Human 399 · Dark Elf 342 · Dire Wolf 266 GC/turn baseline
- Tax slider with lock — persists server-side
- Markets and castles add flat gold bonuses per building
- Taverns provide entertainment bonus and mercenary board

---

### Buildings
- 13 building types (colosseums removed in v1.1.0)
- Build queue shows turn estimate per building type
- Building caps scale with kingdom level
- Blueprints — crafted by scribes, required for 100t+ buildings, drop from dungeons
- Hammers — 25 GC each, +5% build speed, degrade over use
- Scaffolding — 2,500 GC each, required for >100t buildings, single use
- Certified blueprints — advanced construction tier (v1.1.0)
- Masonry upgrades — wall and structure enhancement tree (v1.1.0)

---

### Units & Upkeep
- 9 hirable unit types: fighters, rangers, clerics, mages, thieves, ninjas, researchers, engineers, scribes
- Housing capacity by race (per house): Dire Wolf 700 · Dwarf 650 · Orc 600 · Human 500 · Dark Elf 450 · High Elf 350
- Support unit housing — researchers in schools, engineers in smithies, scribes in libraries
- Upkeep race multipliers: Dwarf ×0.85 · Human/High Elf ×1.00 · Dark Elf ×1.10 · Orc ×1.15 · Dire Wolf ×1.20
- Variable hire prices — race multipliers applied per unit type in hire panel

---

### Research
- 10 research disciplines
- Single discipline focus (Repository upgrade unlocks 2nd slot)
- Distribute evenly and Release all buttons

---

### Exploration
- Scout (10t), Deep (25t), Dungeon (50t) expedition types
- Race bonuses: Dire Wolf ×1.40 · Dark Elf ×1.25 · Human ×1.10 · Orc ×1.05 · High Elf ×0.95 · Dwarf ×0.90
- Ultra-rare drops including the unique Throne of Nazdreg Grishnak (0.1%, one per server)
- World Fragment drops → Hybrid Blueprint crafting (v1.1.0)

---

### Magic & Library
- 16 spells across 4 tiers — scroll-based casting with obscure option
- Mage tower mana production and upgrade tree
- Shrine morale, healing, and Divine Sanctuary auto-stabilise
- Library: scribes craft maps, blueprints, and blank scrolls
- Lore & Achievements collection panel (v1.1.0)

---

### Combat & Covert
- Military attack with power comparison and full battle report
- Bully ratio detection — morale penalty and public shame event at ×8
- Covert ops — spy (tiered reports), loot, assassinate, sabotage, trade route raiding
- Spy report history with alliance intel sharing (v1.1.0)
- Map theft covert action
- War log with full history

---

### Unit XP & Levelling
- All 9 units gain XP from activity. +0.5% effectiveness per level, max +50% at level 100
- Racial gift unlocked at unit level 5 — unique per-race passive bonus
- Fanfare sound + badge pulse + 6-second toast on first unlock (v1.1.0)

---

### Heroes (v1.1.0)
- Named hero units with unique passive abilities
- Heroes gain XP from combat participation
- Hero bonuses applied to kingdom stats each turn
- Hero status displayed on status/training panels

---

### Social & Communication
- Global chat with Socket.io — real-time, race icons, MOD badges
- IRC commands: `/me`, `/msg`, `/nick`, `/color`
- Moderator commands: `/kick`, `/ban`, `/unban`, `/delete`
- Alliance system — create, invite, dismiss, pledge, chat board, signal tower warnings
- Region capture and alliance leaderboards
- Direct messaging between kingdoms
- Rankings panel with win probability and action buttons
- News panel with type filters

---

### Admin
- Tab layout: ⚙️ Manage · 🏰 Kingdoms · 📅 Events · 📋 Changelog
- Full kingdom edit modal
- Promote/demote chat moderators
- Chat ban list with reasons
- AI kingdoms with race-aware behaviour
- Global announcement broadcast
- Events panel — log viewer + full event editor
- Flush all locations button
- Audio test button (💨)
- Admin notes (localStorage)

---

### Wishlist — Future Additions

**Gameplay**
- Spell casting target history
- Diplomacy — formal non-aggression pacts and tribute
- Named hero abilities tree expansion

**Combat**
- Alliance war — formal war declarations between alliances
- Siege mechanics — castle walls reduce land capture
- Battle replay — animated step-by-step report

**Economy**
- Variable commodity prices — supply/demand shifts ±30% hourly
- Prestige economy — permanent market bonuses after rebirth

**World**
- More races — Gnome (inventor), Vampire (undead mage), Troll (regenerating fighter)

**Polish**
- Custom kingdom banner/sigil generator
- iOS layout testing and fixes
- Email notifications — attacks and expedition return
- Tutorial / new player guide
- Dark/light theme toggle
