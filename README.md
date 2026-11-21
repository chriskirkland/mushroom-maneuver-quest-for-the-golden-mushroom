# Mushroom Maneuver: Quest for the Golden Mushroom

A simple browser-based side-scroller starring a cute button mushroom (beige stem, red cap).

## Gameplay

- **Explore levels** – run and jump through side-scrolling levels.
- **Mine minerals** – swing at ore rocks to collect Copper, Iron, Silver, Gold and Spore Crystals (rarer ores appear in later levels).
- **Fight baddies** – Slime Slugs, Bark Beetles, Spore Bats, Rot Goblins and Toad Knights drop coins (and sometimes potions).
- **Visit the town** at the end of each level:
  - 🏪 **Market** – buy & sell items and minerals.
  - 🔨 **Blacksmith** – craft weapons & armor from minerals.
  - 🏰 **Castle** – the King sells weapon & armor enchantments.
  - 🎒 **Satchel** – equip gear and review your journey.
- **Experience** is earned from crafting, mining and defeating baddies. Player level starts at 1 and caps at **50**.
- **Progress is saved** to the browser's `localStorage` every time you enter a town (no server needed). Dying returns you to your last town save.
- Legend says the **Golden Mushroom** waits at the end of Level 10…

### Controls

| Action | Keys |
| --- | --- |
| Move | ← → / A D |
| Jump | ↑ / W / Space |
| Swing (fight & mine) | J / X |
| Drink potion | Q |

## Running locally

It's a static site with no build step — open `index.html` in a browser, or serve the folder:

```sh
npm start            # serves on http://localhost:8080
```

## Tests

Game rules and save logic are unit tested with Node's built-in test runner:

```sh
npm test
```

## Deployment

`.github/workflows/pages.yml` runs the tests and deploys the site to GitHub Pages on every push to `main`
(repository **Settings → Pages → Source** must be set to **GitHub Actions**).
