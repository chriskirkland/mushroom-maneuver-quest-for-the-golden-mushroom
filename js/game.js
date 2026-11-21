/*
 * Mushroom Maneuver: Quest for the Golden Mushroom — main game loop, rendering & UI.
 */
(function () {
  'use strict';

  const L = window.MMLogic;
  const S = window.MMSave;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const GROUND_Y = 470;
  const GRAVITY = 1900;
  const MOVE_SPEED = 260;
  const JUMP_VELOCITY = -720;

  const menuEl = document.getElementById('menu');
  const townEl = document.getElementById('town');
  const townHeader = document.getElementById('town-header');
  const townBody = document.getElementById('town-body');
  const townMsg = document.getElementById('town-msg');
  const btnContinue = document.getElementById('btn-continue');
  const btnNew = document.getElementById('btn-new');
  const btnLeave = document.getElementById('btn-leave');

  let mode = 'title'; // title | level | town | dead
  let player = null; // persistent progress (saved)
  let world = null; // runtime state of the current level
  let townTab = 'market';
  let time = 0;
  let banner = null; // { text, t }

  // ---------- Input ----------
  const keys = {};
  const pressed = {};
  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
  window.addEventListener('keydown', (e) => {
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
    if (mode === 'level' && GAME_KEYS.includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { Object.keys(keys).forEach((k) => { keys[k] = false; }); });
  const down = (...codes) => codes.some((c) => keys[c]);
  const hit = (...codes) => codes.some((c) => pressed[c]);

  // ---------- Helpers ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function swingBox(hero) {
    return { x: hero.facing > 0 ? hero.x + hero.w - 4 : hero.x - 46, y: hero.y - 6, w: 50, h: hero.h + 10 };
  }

  function floatText(x, y, text, color) {
    world.floaters.push({ x, y, text, color: color || '#fff', t: 1.2 });
  }

  function showBanner(text) { banner = { text, t: 2.5 }; }

  function announceLevels(levels) {
    if (levels > 0) {
      showBanner(player.level >= L.MAX_PLAYER_LEVEL ? `MAX LEVEL ${player.level}!` : `LEVEL UP! Lv ${player.level}`);
    }
  }

  // ---------- Level generation ----------
  function buildLevel(stage) {
    const rand = mulberry32(stage * 9973 + 17);
    const length = 2600 + stage * 300;
    const platforms = [];
    for (let x = 500; x < length - 400; x += 260 + Math.floor(rand() * 260)) {
      if (rand() < 0.65) {
        platforms.push({ x, y: rand() < 0.5 ? 360 : 280, w: 120 + Math.floor(rand() * 110), h: 16 });
      }
    }

    const nodes = [];
    const nodeCount = 7 + stage;
    for (let i = 0; i < nodeCount; i++) {
      const type = L.pickMineral(stage, rand);
      let x = 300 + rand() * (length - 600);
      let y = GROUND_Y - 30;
      if (platforms.length && rand() < 0.35) {
        const p = platforms[Math.floor(rand() * platforms.length)];
        x = p.x + rand() * (p.w - 40);
        y = p.y - 30;
      }
      nodes.push({ type, x, y, w: 40, h: 30, hits: L.MINERALS[type].hits, shake: 0 });
    }

    const enemies = [];
    const types = L.enemiesForStage(stage);
    const enemyCount = 5 + Math.floor(stage * 1.5);
    for (let i = 0; i < enemyCount; i++) {
      // Favour newer enemy types a little as stages progress.
      const type = types[Math.min(types.length - 1, Math.floor(Math.pow(rand(), 0.8) * types.length))];
      const base = L.ENEMIES[type];
      const st = L.enemyStats(type, stage);
      const x = 600 + rand() * (length - 900);
      const y = base.flying ? 300 + rand() * 80 : GROUND_Y - base.h;
      enemies.push({
        type, x, y, baseY: y, w: base.w, h: base.h, hp: st.maxHp, maxHp: st.maxHp, atk: st.atk,
        speed: st.speed, dir: rand() < 0.5 ? -1 : 1, home: x, range: 120 + rand() * 120,
        hurt: 0, stun: 0, phase: rand() * Math.PI * 2,
      });
    }

    const bossType = L.bossForStage(stage);
    if (bossType) {
      const base = L.ENEMIES[bossType];
      const st = L.enemyStats(bossType, stage);
      const x = length - 160;
      const y = GROUND_Y - base.h;
      enemies.push({
        type: bossType, x, y, baseY: y, w: base.w, h: base.h, hp: st.maxHp, maxHp: st.maxHp, atk: st.atk,
        speed: st.speed, dir: -1, home: x, range: 80, hurt: 0, stun: 0, phase: 0,
      });
    }

    const golden = (stage === L.GOLDEN_MUSHROOM_LEVEL && !player.foundGoldenMushroom)
      ? { x: length - 220, y: GROUND_Y - 40, w: 32, h: 40 } : null;

    return {
      stage, length, platforms, nodes, enemies, golden,
      gate: { x: length, y: GROUND_Y - 140, w: 90, h: 140 },
      drops: [],
      floaters: [],
      camX: 0,
      rand,
      hero: {
        x: 60, y: GROUND_Y - 46, w: 34, h: 46, vx: 0, vy: 0, onGround: true, facing: 1,
        swing: 0, cooldown: 0, invuln: 0, swingHits: null, miningSwing: false,
      },
    };
  }

  // ---------- Mode transitions ----------
  function startLevel() {
    world = buildLevel(player.stage);
    mode = 'level';
    menuEl.classList.add('hidden');
    townEl.classList.add('hidden');
    showBanner(`Level ${player.stage}`);
  }

  function goToTown() {
    L.enterTown(player);
    const saved = S.saveGame(player);
    mode = 'town';
    townTab = 'market';
    townEl.classList.remove('hidden');
    renderTown(saved ? `Welcome! Progress saved. You rest at the inn and feel refreshed.` : 'Welcome! (Unable to save — storage unavailable.)');
  }

  function newGame() {
    if (S.hasSave() && !window.confirm('Start a new game? Your saved progress will be overwritten.')) return;
    S.deleteSave();
    player = L.createNewPlayer();
    startLevel();
  }

  function continueGame() {
    const loaded = S.loadGame();
    if (!loaded) return;
    player = loaded;
    menuEl.classList.add('hidden');
    if (player.inTown) goToTown();
    else startLevel();
  }

  function respawn() {
    const loaded = S.loadGame();
    if (loaded) {
      player = loaded;
      if (player.inTown) { goToTown(); return; }
    } else {
      player = L.createNewPlayer();
    }
    startLevel();
  }

  function showTitle() {
    mode = 'title';
    btnContinue.disabled = !S.hasSave();
    menuEl.classList.remove('hidden');
    townEl.classList.add('hidden');
  }

  btnNew.addEventListener('click', newGame);
  btnContinue.addEventListener('click', continueGame);
  btnLeave.addEventListener('click', () => {
    L.leaveTown(player);
    startLevel();
  });

  // ---------- Update ----------
  function updateLevel(dt) {
    const hero = world.hero;

    // Horizontal movement
    let dir = 0;
    if (down('ArrowLeft', 'KeyA')) dir -= 1;
    if (down('ArrowRight', 'KeyD')) dir += 1;
    hero.vx = dir * MOVE_SPEED;
    if (dir) hero.facing = dir;

    // Jump
    if (hit('ArrowUp', 'KeyW', 'Space') && hero.onGround) {
      hero.vy = JUMP_VELOCITY;
      hero.onGround = false;
    }

    // Swing (attack + mine)
    hero.cooldown -= dt;
    if (hit('KeyJ', 'KeyX') && hero.cooldown <= 0) {
      hero.swing = 0.2;
      hero.cooldown = 0.38;
      hero.swingHits = new Set();
      hero.miningSwing = world.nodes.some((n) => overlaps(swingBox(hero), n));
    }

    // Potion
    if (hit('KeyQ')) {
      const r = L.usePotion(player);
      floatText(hero.x, hero.y - 10, r.ok ? `+${r.healed} HP` : r.message, r.ok ? '#76ff03' : '#ffcdd2');
    }

    // Physics
    const prevBottom = hero.y + hero.h;
    hero.vy += GRAVITY * dt;
    hero.x += hero.vx * dt;
    hero.y += hero.vy * dt;
    hero.x = Math.max(0, Math.min(world.length + 60, hero.x));
    hero.onGround = false;
    if (hero.y + hero.h >= GROUND_Y) {
      hero.y = GROUND_Y - hero.h;
      hero.vy = 0;
      hero.onGround = true;
    } else if (hero.vy >= 0) {
      for (const p of world.platforms) {
        if (hero.x + hero.w > p.x && hero.x < p.x + p.w && prevBottom <= p.y && hero.y + hero.h >= p.y) {
          hero.y = p.y - hero.h;
          hero.vy = 0;
          hero.onGround = true;
          break;
        }
      }
    }

    // Swing resolution
    if (hero.swing > 0) {
      hero.swing -= dt;
      const box = swingBox(hero);
      for (const e of world.enemies) {
        if (hero.swingHits.has(e) || !overlaps(box, e)) continue;
        hero.swingHits.add(e);
        const atk = L.attackPower(player);
        const dmg = Math.max(1, Math.round(atk * (0.85 + world.rand() * 0.3)));
        e.hp -= dmg;
        e.hurt = 0.2;
        L.knockBackEnemy(e, hero, world.length);
        floatText(e.x + e.w / 2, e.y - 6, `-${dmg}`, '#ffeb3b');
      }
      for (const n of world.nodes) {
        if (hero.swingHits.has(n) || !overlaps(box, n)) continue;
        hero.swingHits.add(n);
        hero.miningSwing = true;
        n.hits -= 1;
        n.shake = 0.15;
        if (n.hits <= 0) {
          const r = L.mineMineral(player, n.type);
          floatText(n.x, n.y - 10, `+1 ${L.MINERALS[n.type].name}  +${r.xp} XP`, L.MINERALS[n.type].color);
          announceLevels(r.levels);
        }
      }
      world.nodes = world.nodes.filter((n) => n.hits > 0);
    }

    // Enemies
    hero.invuln -= dt;
    for (const e of world.enemies) {
      const base = L.ENEMIES[e.type];
      e.hurt -= dt;
      e.stun -= dt;
      const dx = (hero.x + hero.w / 2) - (e.x + e.w / 2);
      const chasing = Math.abs(dx) < 220 && Math.abs(hero.y - e.y) < 160;
      if (chasing) e.dir = Math.sign(dx) || e.dir;
      else if (e.x < e.home - e.range) e.dir = 1;
      else if (e.x > e.home + e.range) e.dir = -1;
      if (e.stun <= 0) e.x += e.dir * e.speed * (chasing ? 1.25 : 1) * dt;
      e.x = Math.max(0, Math.min(world.length - e.w, e.x));
      if (base.flying) {
        e.phase += dt * 3;
        e.y = e.baseY + Math.sin(e.phase) * 40 + (chasing ? Math.max(-60, Math.min(60, hero.y - e.baseY)) * 0.5 : 0);
      }
      if (e.hp > 0 && hero.invuln <= 0 && overlaps(hero, e)) {
        const dmg = L.damageTaken(player, e.atk);
        player.hp -= dmg;
        hero.invuln = 1.2;
        hero.vy = -380;
        hero.x += Math.sign(dx || 1) * 60;
        e.stun = 1;
        floatText(hero.x, hero.y - 10, `-${dmg}`, '#ff5252');
      }
    }

    // Defeated enemies
    for (const e of world.enemies.filter((en) => en.hp <= 0)) {
      const r = L.defeatEnemy(player, e.type, world.stage, world.rand);
      floatText(e.x, e.y - 20, `+${r.coins}¢  +${r.xp} XP`, '#ffd54f');
      announceLevels(r.levels);
      if (world.rand() < 0.12) world.drops.push({ x: e.x + e.w / 2 - 8, y: GROUND_Y - 22, w: 16, h: 22, item: 'potion' });
    }
    world.enemies = world.enemies.filter((e) => e.hp > 0);

    // Drops
    world.drops = world.drops.filter((d) => {
      if (!overlaps(hero, d)) return true;
      player.items[d.item] = (player.items[d.item] || 0) + 1;
      floatText(d.x, d.y - 10, `+1 ${L.ITEMS[d.item].name}`, '#80deea');
      return false;
    });

    // Golden Mushroom
    if (world.golden && overlaps(hero, world.golden)) {
      world.golden = null;
      player.foundGoldenMushroom = true;
      player.coins += 500;
      const levels = L.addXp(player, 500);
      showBanner('You found the GOLDEN MUSHROOM! +500¢ +500 XP');
      if (levels) setTimeout(() => announceLevels(levels), 2600);
    }

    // Floating texts
    world.floaters.forEach((f) => { f.t -= dt; f.y -= 30 * dt; });
    world.floaters = world.floaters.filter((f) => f.t > 0);

    // Death
    if (player.hp <= 0) {
      player.hp = 0;
      mode = 'dead';
      return;
    }

    // Town gate
    if (world.enemies.some((e) => L.ENEMIES[e.type].boss)) {
      hero.x = Math.min(hero.x, world.gate.x + 20 - hero.w);
    }
    if (hero.x + hero.w > world.gate.x + 20) {
      goToTown();
      return;
    }

    // Camera
    world.camX = Math.max(0, Math.min(world.length + 120 - W, hero.x - W * 0.35));
  }

  // ---------- Drawing ----------
  function drawMushroom(x, y, w, h, facing, opts) {
    opts = opts || {};
    const cx = x + w / 2;
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    // Stem (beige)
    const stemW = w * 0.62;
    const stemTop = y + h * 0.42;
    ctx.fillStyle = opts.stem || '#e8d8b0';
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 2;
    roundRect(cx - stemW / 2, stemTop, stemW, y + h - stemTop, 8);
    ctx.fill();
    ctx.stroke();
    // Eyes
    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.arc(cx + facing * 3 - 5, stemTop + 10, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + facing * 3 + 5, stemTop + 10, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Cap (red, button-mushroom dome)
    ctx.fillStyle = opts.cap || '#d32f2f';
    ctx.strokeStyle = opts.capStroke || '#8e1b1b';
    ctx.beginPath();
    ctx.ellipse(cx, stemTop + 2, w * 0.62, h * 0.46, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Cap shine
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx - w * 0.2, stemTop - h * 0.25, w * 0.14, h * 0.07, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSky(camX) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#81d4fa');
    g.addColorStop(1, '#e1f5fe');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Far hills
    ctx.fillStyle = '#a5d6a7';
    for (let i = -1; i < 8; i++) {
      const x = i * 260 - ((camX * 0.2) % 260);
      ctx.beginPath();
      ctx.ellipse(x, GROUND_Y, 200, 140, 0, Math.PI, 0);
      ctx.fill();
    }
    // Giant background mushrooms
    for (let i = -1; i < 6; i++) {
      const x = i * 340 - ((camX * 0.45) % 340) + 80;
      ctx.fillStyle = '#d7ccc8';
      ctx.fillRect(x - 10, GROUND_Y - 150, 20, 150);
      ctx.fillStyle = i % 2 ? '#ef9a9a' : '#ffcc80';
      ctx.beginPath();
      ctx.ellipse(x, GROUND_Y - 150, 70, 45, 0, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawGround(camX, length) {
    ctx.fillStyle = '#6d4c41';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#7cb342';
    ctx.fillRect(0, GROUND_Y, W, 10);
    ctx.fillStyle = '#5d4037';
    for (let x = -(camX % 60); x < W; x += 60) ctx.fillRect(x + 20, GROUND_Y + 30, 8, 6);
    if (length !== undefined && camX + W > length + 120) {
      ctx.fillStyle = '#3e2723';
      ctx.fillRect(length + 120 - camX, 0, W, H);
    }
  }

  function drawEnemy(e) {
    const base = L.ENEMIES[e.type];
    ctx.save();
    ctx.fillStyle = e.hurt > 0 ? '#ffffff' : base.color;
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 2;
    const { x, y, w, h } = e;
    switch (e.type) {
      case 'slug':
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h * 0.6, w / 2, h * 0.45, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + (e.dir > 0 ? w - 8 : 8), y + 8);
        ctx.lineTo(x + (e.dir > 0 ? w : 0), y - 6);
        ctx.stroke();
        break;
      case 'beetle':
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
        break;
      case 'bat': {
        const flap = Math.sin(time * 18) * 8;
        ctx.beginPath();
        ctx.moveTo(x, y + 6 + flap); ctx.lineTo(x + w / 2, y + h / 2); ctx.lineTo(x + w, y + 6 + flap);
        ctx.lineTo(x + w / 2, y + h); ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      }
      case 'goblin':
        roundRect(x, y + 12, w, h - 12, 6); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + w / 2, y + 10, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        break;
      case 'toad':
      case 'toad_king':
        ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.6, w / 2, h * 0.4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#9e9e9e';
        ctx.fillRect(x + w * 0.25, y, w * 0.5, h * 0.25); // helmet
        ctx.strokeRect(x + w * 0.25, y, w * 0.5, h * 0.25);
        if (base.boss) {
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.moveTo(x + w * 0.2, y);
          ctx.lineTo(x + w * 0.2, y - 16);
          ctx.lineTo(x + w * 0.4, y - 6);
          ctx.lineTo(x + w * 0.5, y - 20);
          ctx.lineTo(x + w * 0.6, y - 6);
          ctx.lineTo(x + w * 0.8, y - 16);
          ctx.lineTo(x + w * 0.8, y);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        break;
      default:
        ctx.fillRect(x, y, w, h);
    }
    // Eyes
    ctx.fillStyle = '#fff';
    const ex = e.dir > 0 ? x + w * 0.7 : x + w * 0.3;
    ctx.beginPath(); ctx.arc(ex, y + h * 0.35, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c62828';
    ctx.beginPath(); ctx.arc(ex + e.dir, y + h * 0.35, 2, 0, Math.PI * 2); ctx.fill();
    // HP bar
    if (e.hp < e.maxHp || base.boss) {
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y - 10, w, 5);
      ctx.fillStyle = '#e53935';
      ctx.fillRect(x, y - 10, w * Math.max(0, e.hp / e.maxHp), 5);
    }
    if (base.boss) {
      ctx.fillStyle = '#ffd700';
      ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(base.name, x + w / 2, y - 26);
    }
    ctx.restore();
  }

  function drawNode(n) {
    const m = L.MINERALS[n.type];
    const sx = n.shake > 0 ? Math.sin(time * 80) * 3 : 0;
    ctx.fillStyle = '#757575';
    ctx.strokeStyle = '#424242';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(n.x + sx, n.y + n.h);
    ctx.lineTo(n.x + 6 + sx, n.y + 6);
    ctx.lineTo(n.x + 20 + sx, n.y);
    ctx.lineTo(n.x + 36 + sx, n.y + 8);
    ctx.lineTo(n.x + n.w + sx, n.y + n.h);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = m.color;
    [[12, 12], [24, 18], [18, 24], [28, 10]].forEach(([gx, gy]) => {
      ctx.beginPath(); ctx.arc(n.x + gx + sx, n.y + gy, 3.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  function drawGate(g) {
    ctx.fillStyle = '#8d6e63';
    ctx.fillRect(g.x, g.y, 14, g.h);
    ctx.fillRect(g.x + g.w - 14, g.y, 14, g.h);
    ctx.fillStyle = '#a1887f';
    ctx.fillRect(g.x - 10, g.y - 10, g.w + 20, 26);
    ctx.fillStyle = '#fff8e1';
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(world.enemies.some((e) => L.ENEMIES[e.type].boss) ? 'BOSS FIRST' : 'TOWN ➜', g.x + g.w / 2, g.y + 8);
    // Little houses behind the gate
    for (let i = 0; i < 3; i++) {
      const hx = g.x + 120 + i * 70;
      ctx.fillStyle = '#ffe0b2';
      ctx.fillRect(hx, GROUND_Y - 50, 50, 50);
      ctx.fillStyle = '#c62828';
      ctx.beginPath(); ctx.moveTo(hx - 6, GROUND_Y - 50); ctx.lineTo(hx + 25, GROUND_Y - 80); ctx.lineTo(hx + 56, GROUND_Y - 50); ctx.fill();
    }
  }

  function drawGolden(g) {
    const bob = Math.sin(time * 3) * 4;
    ctx.save();
    ctx.shadowColor = '#ffd54f';
    ctx.shadowBlur = 25;
    drawMushroom(g.x, g.y + bob, g.w, g.h, 1, { cap: '#ffd700', capStroke: '#b8860b', stem: '#fff8e1' });
    ctx.restore();
  }

  function drawBar(x, y, w, h, frac, color, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 2, y + 2, (w - 4) * Math.max(0, Math.min(1, frac)), h - 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h - 4);
  }

  function drawHud() {
    const mhp = L.maxHp(player);
    ctx.fillStyle = 'rgba(62,39,35,0.75)';
    roundRect(8, 8, 330, 64, 8);
    ctx.fill();
    drawBar(16, 16, 200, 18, player.hp / mhp, '#e53935', `HP ${Math.max(0, Math.ceil(player.hp))}/${mhp}`);
    const need = L.xpToNextLevel(player.level);
    const xpLabel = player.level >= L.MAX_PLAYER_LEVEL ? 'XP MAX' : `XP ${player.xp}/${need}`;
    drawBar(16, 40, 200, 18, player.level >= L.MAX_PLAYER_LEVEL ? 1 : player.xp / need, '#7e57c2', xpLabel);
    ctx.fillStyle = '#fff8e1';
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    ctx.fillText(`Lv ${player.level}`, 226, 30);
    ctx.fillText(`¢ ${player.coins}`, 226, 54);
    ctx.fillText(`🧪${(player.items.potion || 0) + (player.items.mega_potion || 0)}`, 290, 30);

    // Right side: level & minerals
    ctx.fillStyle = 'rgba(62,39,35,0.75)';
    roundRect(W - 238, 8, 230, 64, 8);
    ctx.fill();
    ctx.fillStyle = '#fff8e1';
    ctx.textAlign = 'right';
    ctx.fillText(`Level ${world.stage}   ATK ${L.attackPower(player)}  DEF ${L.defensePower(player)}`, W - 16, 30);
    ctx.font = '12px "Trebuchet MS", sans-serif';
    const ores = Object.keys(L.MINERALS).filter((id) => player.minerals[id])
      .map((id) => `${L.MINERALS[id].name.split(' ')[0]} ${player.minerals[id]}`).join('  ');
    ctx.fillText(ores || 'No minerals yet', W - 16, 54);
  }

  function drawBanner() {
    if (!banner) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, banner.t);
    ctx.fillStyle = 'rgba(62,39,35,0.8)';
    roundRect(W / 2 - 260, 110, 520, 50, 10);
    ctx.fill();
    ctx.fillStyle = '#ffd54f';
    ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(banner.text, W / 2, 143);
    ctx.restore();
  }

  function drawLevel() {
    const camX = world.camX;
    drawSky(camX);
    drawGround(camX, world.length);
    ctx.save();
    ctx.translate(-camX, 0);

    for (const p of world.platforms) {
      ctx.fillStyle = '#8d6e63';
      roundRect(p.x, p.y, p.w, p.h, 6);
      ctx.fill();
      ctx.fillStyle = '#7cb342';
      ctx.fillRect(p.x + 4, p.y, p.w - 8, 4);
    }
    drawGate(world.gate);
    world.nodes.forEach(drawNode);
    if (world.golden) drawGolden(world.golden);
    for (const d of world.drops) {
      ctx.fillStyle = '#e91e63';
      roundRect(d.x, d.y + 6, d.w, d.h - 6, 4); ctx.fill();
      ctx.fillStyle = '#795548'; ctx.fillRect(d.x + 5, d.y, 6, 7);
    }
    world.enemies.forEach(drawEnemy);

    const hero = world.hero;
    const blink = hero.invuln > 0 && Math.floor(time * 20) % 2 === 0;
    drawMushroom(hero.x, hero.y, hero.w, hero.h, hero.facing, { alpha: blink ? 0.4 : 1 });
    if (hero.swing > 0) {
      const weapon = player.equipped.weapon;
      const colors = { twig_sword: '#8d6e63', copper_sword: '#c87533', iron_sword: '#9aa0a6', silver_sword: '#eceff1', golden_blade: '#ffd700', crystal_blade: '#b388ff' };
      ctx.strokeStyle = hero.miningSwing ? '#8d6e63' : colors[weapon] || '#fff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      const cx = hero.x + hero.w / 2;
      const cy = hero.y + hero.h * 0.55;
      const prog = 1 - hero.swing / 0.2;
      const start = hero.facing > 0 ? -1.3 : Math.PI + 1.3;
      const ang = start + hero.facing * prog * 2.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * 46, cy + Math.sin(ang) * 46);
      ctx.stroke();
      if (hero.miningSwing) {
        ctx.save();
        ctx.translate(cx + Math.cos(ang) * 40, cy + Math.sin(ang) * 40);
        ctx.rotate(ang);
        ctx.strokeStyle = '#cfd8dc';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-5, -17);
        ctx.quadraticCurveTo(9, 0, -5, 17);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.textAlign = 'center';
    ctx.font = 'bold 14px "Trebuchet MS", sans-serif';
    for (const f of world.floaters) {
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    drawHud();
  }

  function drawTitle() {
    drawSky(time * 40);
    drawGround(time * 40);
    drawMushroom(W / 2 - 50, GROUND_Y - 130 + Math.sin(time * 3) * 6, 100, 130, 1);
    ctx.save();
    ctx.shadowColor = '#ffd54f';
    ctx.shadowBlur = 20;
    drawMushroom(W / 2 + 160, GROUND_Y - 60, 46, 56, -1, { cap: '#ffd700', capStroke: '#b8860b', stem: '#fff8e1' });
    ctx.restore();
  }

  function drawTown() {
    drawSky(0);
    drawGround(0);
    // Castle on the hill
    ctx.fillStyle = '#bdbdbd';
    ctx.fillRect(40, GROUND_Y - 260, 220, 260);
    ctx.fillStyle = '#9e9e9e';
    for (let i = 0; i < 5; i++) ctx.fillRect(40 + i * 48, GROUND_Y - 280, 28, 22);
    ctx.fillRect(20, GROUND_Y - 330, 50, 330);
    ctx.fillRect(230, GROUND_Y - 330, 50, 330);
    ctx.fillStyle = '#d32f2f';
    [[20, 70], [230, 280]].forEach(([a, b]) => {
      ctx.beginPath(); ctx.moveTo(a - 6, GROUND_Y - 330); ctx.lineTo((a + b) / 2, GROUND_Y - 390); ctx.lineTo(b + 6, GROUND_Y - 330); ctx.fill();
    });
    ctx.fillStyle = '#5d4037';
    ctx.beginPath(); ctx.ellipse(150, GROUND_Y - 50, 34, 50, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(116, GROUND_Y - 50, 68, 50);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(140, GROUND_Y - 220, 20, 14);
    drawMushroom(170, GROUND_Y - 60, 46, 58, -1, { cap: '#7b1fa2', capStroke: '#4a148c' }); // the King
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(178, GROUND_Y - 78); ctx.lineTo(183, GROUND_Y - 92); ctx.lineTo(193, GROUND_Y - 80);
    ctx.lineTo(203, GROUND_Y - 92); ctx.lineTo(208, GROUND_Y - 78); ctx.closePath(); ctx.fill();
    drawMushroom(260, GROUND_Y - 46, 34, 46, 1, {});
    if (player.foundGoldenMushroom) {
      ctx.save();
      ctx.shadowColor = '#ffd54f'; ctx.shadowBlur = 20;
      drawMushroom(110, GROUND_Y - 300, 24, 30, 1, { cap: '#ffd700', capStroke: '#b8860b', stem: '#fff8e1' });
      ctx.restore();
    }
  }

  function drawDead() {
    drawLevel();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffcdd2';
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px "Trebuchet MS", sans-serif';
    ctx.fillText('Your mushroom wilted...', W / 2, H / 2 - 20);
    ctx.font = '20px "Trebuchet MS", sans-serif';
    ctx.fillText('Press Enter to return to your last town save', W / 2, H / 2 + 24);
  }

  // ---------- Town UI ----------
  function row(cells, btns) {
    return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}<td>${btns}</td></tr>`;
  }

  function btn(action, id, label, enabled) {
    return `<button data-action="${action}" data-id="${id}"${enabled ? '' : ' disabled'}>${label}</button>`;
  }

  function recipeText(recipe) {
    return Object.keys(recipe).map((m) => `${recipe[m]}× ${L.MINERALS[m].name} (${player.minerals[m] || 0})`).join(', ');
  }

  function renderTown(msg) {
    if (msg !== undefined) townMsg.textContent = msg;
    const need = L.xpToNextLevel(player.level);
    townHeader.innerHTML = `<h3>Town of Level ${player.stage} 🍄</h3>
      Lv <b>${player.level}</b>${player.level >= L.MAX_PLAYER_LEVEL ? ' (MAX)' : ` — XP ${player.xp}/${need}`}
      &nbsp;|&nbsp; HP ${player.hp}/${L.maxHp(player)} &nbsp;|&nbsp; ATK ${L.attackPower(player)} &nbsp;|&nbsp; DEF ${L.defensePower(player)}
      &nbsp;|&nbsp; <b>¢ ${player.coins}</b>${player.foundGoldenMushroom ? ' &nbsp;|&nbsp; ✨ Golden Mushroom found!' : ''}`;
    document.querySelectorAll('#town-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === townTab));
    btnLeave.textContent = `Leave town → Level ${player.stage + 1}`;

    let html = '';
    if (townTab === 'market') {
      html += '<h4>Buy items</h4><table>';
      Object.keys(L.ITEMS).filter((id) => L.ITEMS[id].price > 10).forEach((id) => {
        const it = L.ITEMS[id];
        const stat = it.type === 'weapon' ? `ATK +${it.attack}` : it.type === 'armor' ? `DEF +${it.defense}` : `Heals ${it.heal}`;
        html += row([it.name, stat, `¢${it.price}`], btn('buyItem', id, 'Buy', player.coins >= it.price));
      });
      html += '</table><h4>Buy minerals</h4><table>';
      L.mineralsForStage(player.stage).forEach((id) => {
        const price = L.mineralBuyPrice(id);
        html += row([L.MINERALS[id].name, `own ${player.minerals[id] || 0}`, `¢${price}`], btn('buyMineral', id, 'Buy', player.coins >= price));
      });
      html += '</table><h4>Sell</h4><table>';
      const ownedMinerals = Object.keys(L.MINERALS).filter((id) => player.minerals[id]);
      const ownedItems = Object.keys(L.ITEMS).filter((id) => player.items[id]);
      if (!ownedMinerals.length && !ownedItems.length) html += '<tr><td>Nothing to sell.</td></tr>';
      ownedMinerals.forEach((id) => {
        html += row([L.MINERALS[id].name, `×${player.minerals[id]}`, `¢${L.mineralSellPrice(id)} ea`],
          btn('sellMineral', id, 'Sell 1', true) + ' ' + btn('sellAllMineral', id, 'Sell all', true));
      });
      ownedItems.forEach((id) => {
        const eq = player.equipped.weapon === id || player.equipped.armor === id;
        const canSell = !eq || player.items[id] > 1;
        html += row([L.ITEMS[id].name + (eq ? ' (equipped)' : ''), `×${player.items[id]}`, `¢${L.itemSellPrice(id)} ea`],
          btn('sellItem', id, 'Sell 1', canSell));
      });
      html += '</table>';
    } else if (townTab === 'smith') {
      html += '<p>The blacksmith forges gear from your minerals. Crafting grants experience!</p><table>';
      Object.keys(L.ITEMS).filter((id) => L.ITEMS[id].recipe).forEach((id) => {
        const it = L.ITEMS[id];
        const stat = it.type === 'weapon' ? `ATK +${it.attack}` : `DEF +${it.defense}`;
        html += row([`<b>${it.name}</b> (${stat})<br><small>${recipeText(it.recipe)}</small>`, `+${L.craftXp(id)} XP`],
          btn('craft', id, 'Craft', L.canCraft(player, id)));
      });
      html += '</table>';
    } else if (townTab === 'castle') {
      html += `<p class="king-says">"Welcome, brave little mushroom! For a modest tribute of coin, I shall enchant your
        weapon and armor with royal spores. Bring me news of the Golden Mushroom — it is said to lie at the end of Level ${L.GOLDEN_MUSHROOM_LEVEL}."</p><table>`;
      Object.keys(L.ENCHANTMENTS).forEach((kind) => {
        const en = L.ENCHANTMENTS[kind];
        const rank = player.enchant[kind];
        const maxed = rank >= en.max;
        const cost = maxed ? '—' : `¢${L.enchantCost(kind, rank)}`;
        html += row([`<b>${en.name}</b> (${kind})<br><small>${en.desc}</small>`, `Rank ${rank}/${en.max}`, cost],
          btn('enchant', kind, maxed ? 'Maxed' : 'Enchant', !maxed && player.coins >= L.enchantCost(kind, rank)));
      });
      html += '</table>';
    } else if (townTab === 'satchel') {
      html += `<h4>Equipment</h4><p>Weapon: <b>${L.ITEMS[player.equipped.weapon].name}</b> (+${player.enchant.weapon} enchant)
        &nbsp; Armor: <b>${L.ITEMS[player.equipped.armor].name}</b> (+${player.enchant.armor} enchant)</p><table>`;
      Object.keys(L.ITEMS).filter((id) => player.items[id] && L.ITEMS[id].type !== 'consumable').forEach((id) => {
        const it = L.ITEMS[id];
        const eq = player.equipped[it.type] === id;
        const stat = it.type === 'weapon' ? `ATK +${it.attack}` : `DEF +${it.defense}`;
        html += row([it.name, stat, `×${player.items[id]}`], btn('equip', id, eq ? 'Equipped' : 'Equip', !eq));
      });
      html += '</table><h4>Consumables & minerals</h4><p>';
      const misc = Object.keys(L.ITEMS).filter((id) => player.items[id] && L.ITEMS[id].type === 'consumable')
        .map((id) => `${L.ITEMS[id].name} ×${player.items[id]}`)
        .concat(Object.keys(L.MINERALS).filter((id) => player.minerals[id]).map((id) => `${L.MINERALS[id].name} ×${player.minerals[id]}`));
      html += (misc.join(' · ') || 'Empty') + '</p>';
      html += `<h4>Journey</h4><p>Baddies defeated: ${player.stats.enemiesDefeated} · Minerals mined: ${player.stats.mineralsMined}
        · Items crafted: ${player.stats.itemsCrafted}</p>`;
    }
    townBody.innerHTML = html;
  }

  document.getElementById('town-tabs').addEventListener('click', (e) => {
    const tab = e.target.dataset && e.target.dataset.tab;
    if (tab) { townTab = tab; renderTown(''); }
  });

  townBody.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-action]');
    if (!b || b.disabled) return;
    const id = b.dataset.id;
    const level = player.level;
    let r;
    switch (b.dataset.action) {
      case 'buyItem': r = L.buyItem(player, id, 1); break;
      case 'sellItem': r = L.sellItem(player, id, 1); break;
      case 'buyMineral': r = L.buyMineral(player, id, 1, player.stage); break;
      case 'sellMineral': r = L.sellMineral(player, id, 1); break;
      case 'sellAllMineral': r = L.sellMineral(player, id, player.minerals[id] || 0); break;
      case 'craft': r = L.craftItem(player, id); break;
      case 'enchant': r = L.buyEnchantment(player, id); break;
      case 'equip': r = L.equipItem(player, id); break;
      default: return;
    }
    if (player.level > level) player.hp = L.maxHp(player);
    let msg = r.message;
    if (player.level > level) msg += ` LEVEL UP! You are now Lv ${player.level}.`;
    renderTown(msg);
  });

  // ---------- Main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }

    if (mode === 'level') {
      updateLevel(dt);
      if (mode === 'level') drawLevel();
    }
    if (mode === 'title') drawTitle();
    else if (mode === 'town') drawTown();
    else if (mode === 'dead') {
      drawDead();
      if (hit('Enter', 'NumpadEnter')) respawn();
    }
    drawBanner();
    Object.keys(pressed).forEach((k) => { pressed[k] = false; });
    requestAnimationFrame(frame);
  }

  // ---------- Fit the game to the window ----------
  const wrapEl = document.getElementById('wrap');
  function fitToWindow() {
    const scale = Math.min(window.innerWidth / wrapEl.offsetWidth, window.innerHeight / wrapEl.offsetHeight, 1.5);
    wrapEl.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', fitToWindow);
  fitToWindow();

  showTitle();
  requestAnimationFrame(frame);

  // Exposed for debugging in the browser console.
  window.MMGame = {
    get player() { return player; },
    get mode() { return mode; },
    get world() { return world; },
  };
})();
