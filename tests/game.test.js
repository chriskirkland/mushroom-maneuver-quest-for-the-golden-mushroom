const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const L = require('../js/logic.js');

function startGame(stage = 1, weapon = 'twig_sword') {
  const player = L.createNewPlayer();
  player.stage = stage;
  player.equipped.weapon = weapon;
  const listeners = {};
  const elements = {};
  const strokes = [];
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'stroke') return () => strokes.push(target.strokeStyle);
      return () => {};
    },
  });
  function element(id) {
    if (!elements[id]) {
      elements[id] = {
        width: 960, height: 540, offsetWidth: 960, offsetHeight: 540,
        style: {}, classList: { add() {}, remove() {}, toggle() {} },
        addEventListener(event, callback) { listeners[`${id}:${event}`] = callback; },
        getContext() { return ctx; },
      };
    }
    return elements[id];
  }
  const window = {
    MMLogic: L,
    MMSave: { hasSave: () => true, loadGame: () => player, saveGame: () => true },
    innerWidth: 960, innerHeight: 540,
    addEventListener(event, callback) { listeners[event] = callback; },
  };
  let frame;
  let now = 0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/game.js'), 'utf8'), {
    window,
    document: { getElementById: element, querySelectorAll: () => [] },
    performance: { now: () => 0 },
    requestAnimationFrame(callback) { frame = callback; },
    setTimeout() {},
  });
  listeners['btn-continue:click']();
  return {
    game: window.MMGame,
    strokes,
    press(code) { listeners.keydown({ code, preventDefault() {} }); },
    release(code) { listeners.keyup({ code }); },
    tick() { now += 16; strokes.length = 0; frame(now); },
  };
}

test('every third level has exactly one boss near the town gate', () => {
  for (let stage = 1; stage <= 15; stage++) {
    const { game } = startGame(stage);
    const bosses = game.world.enemies.filter((e) => L.ENEMIES[e.type].boss);
    assert.equal(bosses.length, stage % 3 === 0 ? 1 : 0, `stage ${stage}`);
    if (bosses.length) {
      assert.ok(bosses[0].x >= game.world.gate.x - 200);
      assert.ok(bosses[0].maxHp > L.enemyStats('slug', stage).maxHp);
    }
  }
});

test('boss blocks town entry even when jumping, and its defeat unlocks the gate and grants rewards', () => {
  const run = startGame(3);
  const { game } = run;
  const world = game.world;
  const boss = world.enemies.find((e) => L.ENEMIES[e.type].boss);
  world.enemies = [boss];
  world.hero.x = world.gate.x + 40;
  world.hero.y = 250;
  run.tick();
  assert.equal(game.mode, 'level');
  assert.equal(world.hero.x + world.hero.w, world.gate.x + 20);
  const coins = game.player.coins;
  boss.hp = 0;
  run.press('ArrowRight');
  run.tick();
  assert.equal(game.mode, 'town');
  assert.equal(game.player.stats.enemiesDefeated, 1);
  assert.ok(game.player.coins > coins);
  assert.equal(game.player.inTown, true);
});

test('every equipped weapon knocks enemies away once per swing and briefly stops chasing', () => {
  for (const weapon of Object.keys(L.ITEMS).filter((id) => L.ITEMS[id].type === 'weapon')) {
    for (const facing of [-1, 1]) {
      const run = startGame(1, weapon);
      const world = run.game.world;
      const hero = world.hero;
      hero.x = 300;
      hero.facing = facing;
      const enemy = world.enemies[0];
      enemy.x = facing > 0 ? 340 : 255;
      enemy.hp = 1000;
      enemy.speed = 90;
      world.enemies = [enemy];
      world.nodes = [];
      const before = enemy.x;
      run.press('KeyJ');
      run.tick();
      assert.equal(enemy.x, before + facing * 24, weapon);
      assert.ok(enemy.stun > 0);
      const hp = enemy.hp;
      run.release('KeyJ');
      run.tick();
      assert.equal(enemy.x, before + facing * 24);
      assert.equal(enemy.hp, hp, 'one hit per swing');
    }
  }
});

test('mining renders a pickaxe through the final rock hit without changing equipment', () => {
  const run = startGame(1, 'crystal_blade');
  const world = run.game.world;
  world.enemies = [];
  world.hero.x = 300;
  world.nodes = [{ type: 'copper', x: 340, y: 440, w: 40, h: 30, hits: 1, shake: 0 }];
  run.press('KeyJ');
  run.tick();
  assert.equal(world.nodes.length, 0);
  assert.equal(run.game.player.minerals.copper, 1);
  assert.equal(run.game.player.equipped.weapon, 'crystal_blade');
  assert.ok(run.strokes.includes('#cfd8dc'), 'pickaxe head is drawn');
  assert.ok(!run.strokes.includes('#b388ff'), 'equipped blade is not drawn');
  run.release('KeyJ');
  for (let i = 0; i < 25; i++) run.tick();
  run.press('KeyJ');
  run.tick();
  assert.ok(run.strokes.includes('#b388ff'), 'non-mining swings draw the weapon again');
  assert.ok(!run.strokes.includes('#cfd8dc'));
});
