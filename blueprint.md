# Project: Onosendai's Tool - Diablo 4 Database & Theorycraft Engine
You are an expert frontend developer. Your task is to build a comprehensive, lightning-fast Diablo 4 database and search utility. 

## Technical Constraints
* **Stack:** Strict vanilla HTML5, CSS3, and JavaScript (ES6). 
* **Architecture:** Single-Page Application (SPA) using vanilla JS DOM manipulation. No React, no Vue, no npm, and no build steps. Must be deployable directly to GitHub Pages.
* **Data Source:** All data must be dynamically fetched via JavaScript from the provided datamined JSON files located in the local `/data/` directory. 
  * You will need to ingest files from three specific subfolders: `/data/Item`, `/data/Power`, and `/data/StringList`.
* **Aesthetic:** Cyberpunk terminal meets dark fantasy (Ono-Sendai cyberspace deck UI). Deep charcoal and pure black backgrounds, neon amber/gold interactive highlights, grid-lines, and clean monospace fonts for raw data/stats. It should feel like a high-tech datapad.

## Core Features & Views

### 1. Global Navigation & Layout
* A persistent top HUD or sidebar navigation linking to: "Database", "Aspect Codex", and "Theorycraft Sandbox".
* Fast, client-side routing system (DOM toggling) so navigating between sections is instantaneous without page reloads.

### 2. The Search Engine (The Core)
* **Live Search Bar:** A global text input that filters the DOM in real-time as the user types, checking against item names, aspect names, and effect text.
* **Grid Layout:** Display items and aspects as styled, high-contrast data cards.
* **Filters:** Toggle pills to filter by: 
  * Class (Barbarian, Druid, Necromancer, Paladin, Rogue, Sorcerer, Spiritborn, Warlock)
  * Rarity (Unique, Legendary, Ancestral)
  * Gear Slot (Helm, Chest, Weapon, etc.)

### 3. Data Cross-Referencing & Tooltips
* **The String Mapping:** The JS engine must cross-reference the base JSONs in the `/Item` and `/Power` folders with the localized string dictionaries in the `/StringList` folder. You must extract and display the full, accurate in-game paragraph descriptions and math variables.
* **Hover State:** Hovering over a data card should trigger a stylized, floating in-game tooltip showing its complete stats, affixes, and the localized effect text.

## Development Tasks
1. Scaffold the `index.html`, `style.css`, and `app.js` files.
2. Write the Javascript `fetch()` logic to ingest and map the raw JSONs across the `/Item`, `/Power`, and `/StringList` folders.
3. Build the real-time search and filter algorithms.
4. Generate the Ono-Sendai terminal UI and wire up the tooltips.