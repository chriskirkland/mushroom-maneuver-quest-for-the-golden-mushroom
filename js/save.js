/*
 * Save/load progress using the browser's localStorage (no server persistence).
 */
(function (root) {
  'use strict';

  const L = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.MMLogic;
  const SAVE_KEY = 'mushroomManeuver.save.v1';
  const SAVE_VERSION = 1;

  function defaultStorage() {
    try { return root.localStorage || null; } catch (e) { return null; }
  }

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  function cleanBag(bag, catalog) {
    const out = {};
    if (!isObj(bag)) return out;
    Object.keys(bag).forEach((id) => {
      const n = Math.floor(Number(bag[id]));
      if (Object.prototype.hasOwnProperty.call(catalog, id) && n > 0) out[id] = n;
    });
    return out;
  }

  function num(v, fallback, min, max) {
    const n = Number(v);
    if (v === null || v === undefined || !Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.floor(n)));
  }

  /** Normalises untrusted saved data into a valid player object. */
  function normalizePlayer(data) {
    const p = L.createNewPlayer();
    if (!isObj(data)) return p;
    p.level = num(data.level, 1, 1, L.MAX_PLAYER_LEVEL);
    p.xp = p.level >= L.MAX_PLAYER_LEVEL ? 0 : num(data.xp, 0, 0, L.xpToNextLevel(p.level) - 1);
    p.coins = num(data.coins, p.coins, 0, Number.MAX_SAFE_INTEGER);
    p.stage = num(data.stage, 1, 1, 9999);
    p.inTown = data.inTown === true;
    p.minerals = cleanBag(data.minerals, L.MINERALS);
    p.items = cleanBag(data.items, L.ITEMS);
    p.enchant.weapon = num(data.enchant && data.enchant.weapon, 0, 0, L.ENCHANTMENTS.weapon.max);
    p.enchant.armor = num(data.enchant && data.enchant.armor, 0, 0, L.ENCHANTMENTS.armor.max);
    ['enemiesDefeated', 'mineralsMined', 'itemsCrafted'].forEach((k) => {
      p.stats[k] = num(data.stats && data.stats[k], 0, 0, Number.MAX_SAFE_INTEGER);
    });
    p.foundGoldenMushroom = data.foundGoldenMushroom === true;
    ['weapon', 'armor'].forEach((slot) => {
      const id = data.equipped && data.equipped[slot];
      if (Object.prototype.hasOwnProperty.call(L.ITEMS, id) && L.ITEMS[id].type === slot && p.items[id] > 0) {
        p.equipped[slot] = id;
      } else {
        const fallback = slot === 'weapon' ? 'twig_sword' : 'leaf_tunic';
        p.equipped[slot] = fallback;
        if (!p.items[fallback]) p.items[fallback] = 1;
      }
    });
    p.hp = num(data.hp, L.maxHp(p), 1, L.maxHp(p));
    return p;
  }

  function saveGame(player, storage) {
    storage = storage || defaultStorage();
    if (!storage) return false;
    try {
      storage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), player }));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadGame(storage) {
    storage = storage || defaultStorage();
    if (!storage) return null;
    try {
      const raw = storage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!isObj(parsed) || parsed.version !== SAVE_VERSION) return null;
      return normalizePlayer(parsed.player);
    } catch (e) {
      return null;
    }
  }

  function hasSave(storage) { return loadGame(storage) !== null; }

  function deleteSave(storage) {
    storage = storage || defaultStorage();
    if (storage) storage.removeItem(SAVE_KEY);
  }

  const api = { SAVE_KEY, saveGame, loadGame, hasSave, deleteSave, normalizePlayer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMSave = api;
})(typeof window !== 'undefined' ? window : globalThis);
