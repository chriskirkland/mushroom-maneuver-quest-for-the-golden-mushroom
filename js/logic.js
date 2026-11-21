/*
 * Mushroom Maneuver: Quest for the Golden Mushroom
 * Pure game rules & data (no DOM). Works in the browser (window.MMLogic)
 * and in Node (module.exports) so it can be unit tested.
 */
(function (root) {
  'use strict';

  const GAME_TITLE = 'Mushroom Maneuver: Quest for the Golden Mushroom';
  const MAX_PLAYER_LEVEL = 50;
  const GOLDEN_MUSHROOM_LEVEL = 10;

  const MINERALS = {
    copper: { name: 'Copper Ore', value: 6, xp: 4, minStage: 1, hits: 2, color: '#c87533' },
    iron: { name: 'Iron Ore', value: 14, xp: 8, minStage: 2, hits: 3, color: '#9aa0a6' },
    silver: { name: 'Silver Ore', value: 30, xp: 15, minStage: 4, hits: 4, color: '#e3e7ec' },
    gold: { name: 'Gold Ore', value: 60, xp: 28, minStage: 6, hits: 5, color: '#f2c230' },
    crystal: { name: 'Spore Crystal', value: 110, xp: 45, minStage: 8, hits: 6, color: '#b388ff' },
  };

  const ITEMS = {
    potion: { name: 'Health Potion', type: 'consumable', heal: 40, price: 20 },
    mega_potion: { name: 'Mega Potion', type: 'consumable', heal: 150, price: 70 },

    twig_sword: { name: 'Twig Sword', type: 'weapon', attack: 0, price: 10 },
    copper_sword: { name: 'Copper Sword', type: 'weapon', attack: 4, price: 70, recipe: { copper: 5 } },
    iron_sword: { name: 'Iron Sword', type: 'weapon', attack: 9, price: 170, recipe: { iron: 6, copper: 2 } },
    silver_sword: { name: 'Silver Sword', type: 'weapon', attack: 16, price: 380, recipe: { silver: 6, iron: 3 } },
    golden_blade: { name: 'Golden Blade', type: 'weapon', attack: 26, price: 850, recipe: { gold: 6, silver: 3 } },
    crystal_blade: { name: 'Crystal Blade', type: 'weapon', attack: 40, price: 1700, recipe: { crystal: 6, gold: 3 } },

    leaf_tunic: { name: 'Leaf Tunic', type: 'armor', defense: 0, price: 10 },
    copper_armor: { name: 'Copper Armor', type: 'armor', defense: 3, price: 70, recipe: { copper: 6 } },
    iron_armor: { name: 'Iron Armor', type: 'armor', defense: 6, price: 180, recipe: { iron: 7, copper: 2 } },
    silver_armor: { name: 'Silver Armor', type: 'armor', defense: 10, price: 400, recipe: { silver: 7, iron: 3 } },
    golden_armor: { name: 'Golden Armor', type: 'armor', defense: 15, price: 900, recipe: { gold: 7, silver: 3 } },
    crystal_armor: { name: 'Crystal Armor', type: 'armor', defense: 22, price: 1800, recipe: { crystal: 7, gold: 3 } },
  };

  const ENEMIES = {
    slug: { name: 'Slime Slug', hp: 20, atk: 6, speed: 40, xp: 6, coins: [2, 5], minStage: 1, w: 42, h: 24, color: '#7cb342' },
    beetle: { name: 'Bark Beetle', hp: 35, atk: 9, speed: 70, xp: 10, coins: [4, 9], minStage: 2, w: 40, h: 28, color: '#5d4037' },
    bat: { name: 'Spore Bat', hp: 28, atk: 10, speed: 90, xp: 12, coins: [5, 10], minStage: 3, w: 36, h: 24, color: '#6a1b9a', flying: true },
    goblin: { name: 'Rot Goblin', hp: 60, atk: 14, speed: 80, xp: 20, coins: [8, 16], minStage: 5, w: 34, h: 48, color: '#558b2f' },
    toad: { name: 'Toad Knight', hp: 110, atk: 20, speed: 60, xp: 35, coins: [15, 30], minStage: 7, w: 48, h: 52, color: '#2e7d32' },
  };

  const ENCHANTMENTS = {
    weapon: { name: 'Royal Edge', desc: '+3 attack per rank', perRank: 3, max: 10, baseCost: 100 },
    armor: { name: 'Royal Cap Ward', desc: '+2 defense per rank', perRank: 2, max: 10, baseCost: 100 },
  };

  // ---------- Player creation & progression ----------

  function createNewPlayer() {
    const p = {
      level: 1,
      xp: 0,
      coins: 25,
      hp: 0,
      stage: 1,
      inTown: false,
      minerals: {},
      items: { potion: 2, twig_sword: 1, leaf_tunic: 1 },
      equipped: { weapon: 'twig_sword', armor: 'leaf_tunic' },
      enchant: { weapon: 0, armor: 0 },
      stats: { enemiesDefeated: 0, mineralsMined: 0, itemsCrafted: 0 },
      foundGoldenMushroom: false,
    };
    p.hp = maxHp(p);
    return p;
  }

  function xpToNextLevel(level) {
    if (level >= MAX_PLAYER_LEVEL) return Infinity;
    return Math.round(15 * Math.pow(level, 1.6));
  }

  /** Adds XP, handling level ups and the level cap. Returns number of levels gained. */
  function addXp(player, amount) {
    if (player.level >= MAX_PLAYER_LEVEL) {
      player.xp = 0;
      return 0;
    }
    if (!(amount > 0)) return 0;
    let gained = 0;
    player.xp += Math.floor(amount);
    while (player.level < MAX_PLAYER_LEVEL && player.xp >= xpToNextLevel(player.level)) {
      player.xp -= xpToNextLevel(player.level);
      const oldMax = maxHp(player);
      player.level += 1;
      player.hp = Math.min(maxHp(player), player.hp + (maxHp(player) - oldMax));
      gained += 1;
    }
    if (player.level >= MAX_PLAYER_LEVEL) player.xp = 0;
    return gained;
  }

  function maxHp(player) {
    return 50 + (player.level - 1) * 10;
  }

  function attackPower(player) {
    const weapon = ITEMS[player.equipped.weapon];
    return 5 + (player.level - 1) * 2 + (weapon ? weapon.attack : 0) +
      player.enchant.weapon * ENCHANTMENTS.weapon.perRank;
  }

  function defensePower(player) {
    const armor = ITEMS[player.equipped.armor];
    return Math.floor((player.level - 1) / 2) + (armor ? armor.defense : 0) +
      player.enchant.armor * ENCHANTMENTS.armor.perRank;
  }

  function damageTaken(player, rawAttack) {
    return Math.max(1, Math.round(rawAttack - defensePower(player) * 0.6));
  }

  // ---------- World helpers ----------

  function mineralsForStage(stage) {
    return Object.keys(MINERALS).filter((id) => MINERALS[id].minStage <= stage);
  }

  function enemiesForStage(stage) {
    return Object.keys(ENEMIES).filter((id) => ENEMIES[id].minStage <= stage);
  }

  /** Picks a random mineral, weighting towards the more common (lower tier) ones. */
  function pickMineral(stage, rand) {
    const ids = mineralsForStage(stage);
    const weights = ids.map((_, i) => ids.length - i);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < ids.length; i++) {
      r -= weights[i];
      if (r < 0) return ids[i];
    }
    return ids[ids.length - 1];
  }

  function enemyStats(typeId, stage) {
    const base = ENEMIES[typeId];
    const s = stage - 1;
    return {
      name: base.name,
      maxHp: Math.round(base.hp * (1 + s * 0.25)),
      atk: Math.round(base.atk * (1 + s * 0.18)),
      xp: Math.round(base.xp * (1 + s * 0.2)),
      coins: [Math.round(base.coins[0] * (1 + s * 0.2)), Math.round(base.coins[1] * (1 + s * 0.2))],
      speed: base.speed,
    };
  }

  // ---------- Inventory ----------

  function count(bag, id) {
    return bag[id] || 0;
  }

  function addTo(bag, id, qty) {
    bag[id] = count(bag, id) + qty;
    if (bag[id] <= 0) delete bag[id];
  }

  function mineMineral(player, mineralId) {
    const m = MINERALS[mineralId];
    addTo(player.minerals, mineralId, 1);
    player.stats.mineralsMined += 1;
    const levels = addXp(player, m.xp);
    return { ok: true, xp: m.xp, levels };
  }

  function defeatEnemy(player, typeId, stage, rand) {
    const st = enemyStats(typeId, stage);
    const coins = st.coins[0] + Math.floor(rand() * (st.coins[1] - st.coins[0] + 1));
    player.coins += coins;
    player.stats.enemiesDefeated += 1;
    const levels = addXp(player, st.xp);
    return { ok: true, xp: st.xp, coins, levels };
  }

  // ---------- Economy ----------

  function mineralBuyPrice(id) { return MINERALS[id].value * 2; }
  function mineralSellPrice(id) { return MINERALS[id].value; }
  function itemSellPrice(id) { return Math.floor(ITEMS[id].price / 2); }

  function fail(message) { return { ok: false, message }; }

  function buyItem(player, id, qty) {
    qty = qty || 1;
    const item = ITEMS[id];
    if (!item) return fail('Unknown item.');
    const cost = item.price * qty;
    if (player.coins < cost) return fail('Not enough coins.');
    player.coins -= cost;
    addTo(player.items, id, qty);
    return { ok: true, message: `Bought ${qty} × ${item.name} for ${cost} coins.` };
  }

  function sellItem(player, id, qty) {
    qty = qty || 1;
    const item = ITEMS[id];
    if (!item) return fail('Unknown item.');
    const owned = count(player.items, id);
    if (owned < qty) return fail(`You don't have enough ${item.name}.`);
    const isEquipped = player.equipped.weapon === id || player.equipped.armor === id;
    if (isEquipped && owned - qty < 1) return fail(`Unequip ${item.name} before selling it.`);
    const gain = itemSellPrice(id) * qty;
    addTo(player.items, id, -qty);
    player.coins += gain;
    return { ok: true, message: `Sold ${qty} × ${item.name} for ${gain} coins.` };
  }

  function buyMineral(player, id, qty, stage) {
    qty = qty || 1;
    const m = MINERALS[id];
    if (!m) return fail('Unknown mineral.');
    if (stage !== undefined && m.minStage > stage) return fail(`${m.name} isn't sold here yet.`);
    const cost = mineralBuyPrice(id) * qty;
    if (player.coins < cost) return fail('Not enough coins.');
    player.coins -= cost;
    addTo(player.minerals, id, qty);
    return { ok: true, message: `Bought ${qty} × ${m.name} for ${cost} coins.` };
  }

  function sellMineral(player, id, qty) {
    qty = qty || 1;
    const m = MINERALS[id];
    if (!m) return fail('Unknown mineral.');
    if (count(player.minerals, id) < qty) return fail(`You don't have enough ${m.name}.`);
    const gain = mineralSellPrice(id) * qty;
    addTo(player.minerals, id, -qty);
    player.coins += gain;
    return { ok: true, message: `Sold ${qty} × ${m.name} for ${gain} coins.` };
  }

  // ---------- Crafting ----------

  function craftXp(id) {
    const recipe = ITEMS[id].recipe || {};
    return Object.keys(recipe).reduce((sum, m) => sum + recipe[m] * MINERALS[m].xp, 0) * 2;
  }

  function canCraft(player, id) {
    const item = ITEMS[id];
    if (!item || !item.recipe) return false;
    return Object.keys(item.recipe).every((m) => count(player.minerals, m) >= item.recipe[m]);
  }

  function craftItem(player, id) {
    const item = ITEMS[id];
    if (!item || !item.recipe) return fail('That cannot be crafted.');
    if (!canCraft(player, id)) return fail('Missing minerals.');
    Object.keys(item.recipe).forEach((m) => addTo(player.minerals, m, -item.recipe[m]));
    addTo(player.items, id, 1);
    player.stats.itemsCrafted += 1;
    const xp = craftXp(id);
    const levels = addXp(player, xp);
    return { ok: true, xp, levels, message: `Crafted ${item.name}! +${xp} XP` };
  }

  // ---------- Equipment & consumables ----------

  function equipItem(player, id) {
    const item = ITEMS[id];
    if (!item || (item.type !== 'weapon' && item.type !== 'armor')) return fail('That cannot be equipped.');
    if (count(player.items, id) < 1) return fail(`You don't own ${item.name}.`);
    player.equipped[item.type] = id;
    return { ok: true, message: `Equipped ${item.name}.` };
  }

  function usePotion(player, id) {
    id = id || (count(player.items, 'potion') > 0 ? 'potion' : 'mega_potion');
    const item = ITEMS[id];
    if (!item || item.type !== 'consumable' || count(player.items, id) < 1) return fail('No potions!');
    if (player.hp >= maxHp(player)) return fail('Already at full health.');
    addTo(player.items, id, -1);
    const before = player.hp;
    player.hp = Math.min(maxHp(player), player.hp + item.heal);
    return { ok: true, healed: player.hp - before, message: `Healed ${player.hp - before} HP.` };
  }

  // ---------- King's enchantments ----------

  function enchantCost(kind, rank) {
    return ENCHANTMENTS[kind].baseCost * (rank + 1) * (rank + 1);
  }

  function buyEnchantment(player, kind) {
    const ench = ENCHANTMENTS[kind];
    if (!ench) return fail('Unknown enchantment.');
    const rank = player.enchant[kind];
    if (rank >= ench.max) return fail(`${ench.name} is already at max rank.`);
    const cost = enchantCost(kind, rank);
    if (player.coins < cost) return fail('Not enough coins.');
    player.coins -= cost;
    player.enchant[kind] = rank + 1;
    return { ok: true, message: `The King grants ${ench.name} rank ${rank + 1}!` };
  }

  // ---------- Town ----------

  /** Called when the player reaches the town at the end of a level. */
  function enterTown(player) {
    player.inTown = true;
    player.hp = maxHp(player);
  }

  /** Called when the player leaves town to start the next level. */
  function leaveTown(player) {
    player.inTown = false;
    player.stage += 1;
  }

  const api = {
    GAME_TITLE, MAX_PLAYER_LEVEL, GOLDEN_MUSHROOM_LEVEL,
    MINERALS, ITEMS, ENEMIES, ENCHANTMENTS,
    createNewPlayer, xpToNextLevel, addXp, maxHp, attackPower, defensePower, damageTaken,
    mineralsForStage, enemiesForStage, pickMineral, enemyStats,
    mineMineral, defeatEnemy,
    mineralBuyPrice, mineralSellPrice, itemSellPrice,
    buyItem, sellItem, buyMineral, sellMineral,
    craftXp, canCraft, craftItem, equipItem, usePotion,
    enchantCost, buyEnchantment, enterTown, leaveTown,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MMLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
