const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

test('new player starts at level 1 with full HP and starter gear', () => {
  const p = L.createNewPlayer();
  assert.equal(p.level, 1);
  assert.equal(p.stage, 1);
  assert.equal(p.hp, L.maxHp(p));
  assert.equal(p.equipped.weapon, 'twig_sword');
  assert.equal(p.equipped.armor, 'leaf_tunic');
});

test('addXp levels up and carries over remaining XP', () => {
  const p = L.createNewPlayer();
  const need = L.xpToNextLevel(1);
  const gained = L.addXp(p, need + 3);
  assert.equal(gained, 1);
  assert.equal(p.level, 2);
  assert.equal(p.xp, 3);
});

test('player level is capped at 50', () => {
  const p = L.createNewPlayer();
  L.addXp(p, 1e12);
  assert.equal(p.level, L.MAX_PLAYER_LEVEL);
  assert.equal(p.level, 50);
  assert.equal(p.xp, 0);
  assert.equal(L.addXp(p, 1000), 0);
  assert.equal(p.level, 50);
});

test('mining a mineral adds it to inventory and grants XP', () => {
  const p = L.createNewPlayer();
  const r = L.mineMineral(p, 'copper');
  assert.equal(p.minerals.copper, 1);
  assert.equal(p.xp, L.MINERALS.copper.xp);
  assert.equal(r.xp, L.MINERALS.copper.xp);
  assert.equal(p.stats.mineralsMined, 1);
});

test('defeating a baddie grants coins and XP', () => {
  const p = L.createNewPlayer();
  const before = p.coins;
  const r = L.defeatEnemy(p, 'slug', 1, () => 0);
  assert.equal(p.coins, before + L.ENEMIES.slug.coins[0]);
  assert.equal(r.xp, L.ENEMIES.slug.xp);
  assert.equal(p.stats.enemiesDefeated, 1);
});

test('crafting consumes minerals, grants item and XP', () => {
  const p = L.createNewPlayer();
  assert.equal(L.craftItem(p, 'copper_sword').ok, false);
  p.minerals.copper = 6;
  const r = L.craftItem(p, 'copper_sword');
  assert.equal(r.ok, true);
  assert.equal(p.items.copper_sword, 1);
  assert.equal(p.minerals.copper, 1);
  assert.equal(r.xp, L.craftXp('copper_sword'));
  assert.ok(r.levels >= 1, 'crafting XP should level up a fresh player');
  assert.equal(p.stats.itemsCrafted, 1);
});

test('buying and selling items and minerals', () => {
  const p = L.createNewPlayer();
  p.coins = 100;
  assert.equal(L.buyItem(p, 'potion').ok, true);
  assert.equal(p.coins, 80);
  assert.equal(p.items.potion, 3);
  assert.equal(L.sellItem(p, 'potion').ok, true);
  assert.equal(p.coins, 90);

  assert.equal(L.buyMineral(p, 'copper', 2, 1).ok, true);
  assert.equal(p.minerals.copper, 2);
  assert.equal(p.coins, 90 - 2 * L.mineralBuyPrice('copper'));
  assert.equal(L.buyMineral(p, 'crystal', 1, 1).ok, false, 'crystal locked at stage 1');
  assert.equal(L.sellMineral(p, 'copper', 2).ok, true);
  assert.equal(p.minerals.copper, undefined);

  p.coins = 0;
  assert.equal(L.buyItem(p, 'potion').ok, false);
});

test('cannot sell the last copy of equipped gear', () => {
  const p = L.createNewPlayer();
  assert.equal(L.sellItem(p, 'twig_sword').ok, false);
  p.items.copper_sword = 1;
  L.equipItem(p, 'copper_sword');
  assert.equal(L.sellItem(p, 'twig_sword').ok, true);
});

test('equipment and King enchantments raise stats', () => {
  const p = L.createNewPlayer();
  const atk = L.attackPower(p);
  const def = L.defensePower(p);
  p.items.iron_sword = 1;
  p.items.iron_armor = 1;
  L.equipItem(p, 'iron_sword');
  L.equipItem(p, 'iron_armor');
  assert.equal(L.attackPower(p), atk + L.ITEMS.iron_sword.attack);
  assert.equal(L.defensePower(p), def + L.ITEMS.iron_armor.defense);

  p.coins = L.enchantCost('weapon', 0);
  assert.equal(L.buyEnchantment(p, 'weapon').ok, true);
  assert.equal(p.coins, 0);
  assert.equal(L.attackPower(p), atk + L.ITEMS.iron_sword.attack + L.ENCHANTMENTS.weapon.perRank);
  assert.equal(L.buyEnchantment(p, 'armor').ok, false);
  p.enchant.armor = L.ENCHANTMENTS.armor.max;
  p.coins = 1e9;
  assert.equal(L.buyEnchantment(p, 'armor').ok, false);
});

test('potions heal up to max HP', () => {
  const p = L.createNewPlayer();
  assert.equal(L.usePotion(p).ok, false);
  p.hp = 5;
  const r = L.usePotion(p);
  assert.equal(r.ok, true);
  assert.equal(p.hp, 45);
  assert.equal(p.items.potion, 1);
});

test('town entry heals; leaving advances the level', () => {
  const p = L.createNewPlayer();
  p.hp = 1;
  L.enterTown(p);
  assert.equal(p.inTown, true);
  assert.equal(p.hp, L.maxHp(p));
  L.leaveTown(p);
  assert.equal(p.inTown, false);
  assert.equal(p.stage, 2);
});

test('stage gating for minerals and enemies', () => {
  assert.deepEqual(L.mineralsForStage(1), ['copper']);
  assert.ok(L.mineralsForStage(10).includes('crystal'));
  assert.deepEqual(L.enemiesForStage(1), ['slug']);
  assert.equal(L.pickMineral(1, Math.random), 'copper');
  assert.ok(L.enemyStats('slug', 5).maxHp > L.enemyStats('slug', 1).maxHp);
});
