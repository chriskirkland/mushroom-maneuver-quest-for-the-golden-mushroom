const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');
const S = require('../js/save.js');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

test('save and load round-trip', () => {
  const storage = memoryStorage();
  assert.equal(S.loadGame(storage), null);
  assert.equal(S.hasSave(storage), false);

  const p = L.createNewPlayer();
  p.minerals.iron = 4;
  p.items.iron_sword = 1;
  L.equipItem(p, 'iron_sword');
  p.coins = 321;
  p.stage = 3;
  p.enchant.weapon = 2;
  L.enterTown(p);
  assert.equal(S.saveGame(p, storage), true);

  const loaded = S.loadGame(storage);
  assert.deepEqual(loaded, p);
  assert.equal(S.hasSave(storage), true);

  S.deleteSave(storage);
  assert.equal(S.loadGame(storage), null);
});

test('corrupt or foreign save data is rejected', () => {
  const storage = memoryStorage();
  storage.setItem(S.SAVE_KEY, '{not json');
  assert.equal(S.loadGame(storage), null);
  storage.setItem(S.SAVE_KEY, JSON.stringify({ version: 999, player: {} }));
  assert.equal(S.loadGame(storage), null);
});

test('loaded data is sanitised', () => {
  const p = S.normalizePlayer({
    level: 999,
    xp: 'abc',
    coins: -50,
    hp: 1e9,
    minerals: { copper: 3, unobtainium: 10, iron: -2 },
    items: { __proto__: null, potion: 1 },
    equipped: { weapon: 'golden_blade', armor: 'potion' },
    enchant: { weapon: 99 },
  });
  assert.equal(p.level, 50);
  assert.equal(p.xp, 0);
  assert.equal(p.coins, 0);
  assert.equal(p.hp, L.maxHp(p));
  assert.deepEqual(p.minerals, { copper: 3 });
  assert.equal(p.equipped.weapon, 'twig_sword', 'unowned weapon is not equipped');
  assert.equal(p.equipped.armor, 'leaf_tunic');
  assert.equal(p.items.twig_sword, 1);
  assert.equal(p.enchant.weapon, L.ENCHANTMENTS.weapon.max);
});

test('saveGame returns false without storage', () => {
  assert.equal(S.saveGame(L.createNewPlayer(), null), false);
});
