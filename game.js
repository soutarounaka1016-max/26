(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const ui = {
    score: document.getElementById("score"),
    best: document.getElementById("best"),
    finalScore: document.getElementById("finalScore"),
    meterFill: document.getElementById("meterFill"),
    meterLabel: document.getElementById("meterLabel"),
    message: document.getElementById("message"),
    startScreen: document.getElementById("startScreen"),
    gameOverScreen: document.getElementById("gameOverScreen"),
    recordMessage: document.getElementById("recordMessage"),
    startButton: document.getElementById("startButton"),
    retryButton: document.getElementById("retryButton"),
    soundButton: document.getElementById("soundButton"),
  };

  const CONFIG = Object.freeze({
    laneCount: 3,
    warpDuration: 0.18,
    warpCooldown: 1.12,
    startSpeed: 225,
    maxSpeed: 470,
    spawnMin: 0.74,
    spawnMax: 1.38,
    nearMissRange: 155,
  });

  const state = {
    mode: "ready",
    width: 0,
    height: 0,
    dpr: 1,
    time: 0,
    score: 0,
    displayScore: -1,
    best: readBest(),
    speed: CONFIG.startSpeed,
    spawnTimer: 1,
    obstacles: [],
    particles: [],
    stars: [],
    shake: 0,
    flash: 0,
    sound: true,
    lastFrame: performance.now(),
    audio: null,
    player: {
      lane: 1,
      fromLane: 1,
      targetLane: 1,
      warpTime: 0,
      cooldown: 0,
      invulnerable: false,
    },
  };

  function readBest() {
    try { return Number(localStorage.getItem("ketsu-warp-best")) || 0; }
    catch (_) { return 0; }
  }

  function writeBest(value) {
    try { localStorage.setItem("ketsu-warp-best", String(value)); }
    catch (_) { /* Storage can be unavailable in private contexts. */ }
  }

  function formatScore(value) {
    return Math.floor(value).toString().padStart(4, "0");
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    state.dpr = Math.min(window.devicePixelRatio || 1, 2);
    state.width = rect.width;
    state.height = rect.height;
    canvas.width = Math.max(1, Math.round(rect.width * state.dpr));
    canvas.height = Math.max(1, Math.round(rect.height * state.dpr));
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    createStars();
  }

  function createStars() {
    const count = Math.max(32, Math.floor((state.width * state.height) / 9000));
    state.stars = Array.from({ length: count }, (_, i) => ({
      x: (i * 83.17) % Math.max(1, state.width),
      y: (i * 47.31) % Math.max(1, state.height),
      r: 0.4 + (i % 3) * 0.35,
      a: 0.12 + (i % 5) * 0.06,
    }));
  }

  function laneY(lane) {
    const top = state.height * 0.17;
    const bottom = state.height * 0.81;
    return top + (bottom - top) * (lane / (CONFIG.laneCount - 1));
  }

  function playerX() {
    return Math.max(72, state.width * 0.22);
  }

  function playerSize() {
    return Math.max(38, Math.min(58, state.height * 0.095, state.width * 0.11));
  }

  function resetGame() {
    state.mode = "playing";
    state.time = 0;
    state.score = 0;
    state.displayScore = -1;
    state.speed = CONFIG.startSpeed;
    state.spawnTimer = 1.25;
    state.obstacles.length = 0;
    state.particles.length = 0;
    state.shake = 0;
    state.flash = 0;
    Object.assign(state.player, { lane: 1, fromLane: 1, targetLane: 1, warpTime: 0, cooldown: 0, invulnerable: false });
    ui.startScreen.classList.remove("visible");
    ui.gameOverScreen.classList.remove("visible");
    updateUI();
    playTone(210, 0.08, "square", 0.035);
    setTimeout(() => playTone(330, 0.1, "square", 0.03), 90);
  }

  function startAudio() {
    if (!state.audio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) state.audio = new AudioContext();
    }
    if (state.audio?.state === "suspended") state.audio.resume();
  }

  function playTone(frequency, duration, type = "sine", volume = 0.04, slide = 0) {
    if (!state.sound) return;
    startAudio();
    if (!state.audio) return;
    const now = state.audio.currentTime;
    const osc = state.audio.createOscillator();
    const gain = state.audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(state.audio.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function showMessage(text) {
    ui.message.textContent = text;
    ui.message.classList.remove("pop");
    void ui.message.offsetWidth;
    ui.message.classList.add("pop");
  }

  function requestWarp(targetLane) {
    if (state.mode !== "playing") return;
    const p = state.player;
    if (p.cooldown > 0 || p.warpTime > 0 || targetLane === p.lane) {
      if (p.cooldown > 0) playTone(90, 0.05, "square", 0.015);
      return;
    }

    const closeObstacle = state.obstacles.some(o => !o.passed && o.lanes.includes(p.lane) && o.x > playerX() && o.x - playerX() < CONFIG.nearMissRange);
    p.fromLane = p.lane;
    p.targetLane = targetLane;
    p.warpTime = CONFIG.warpDuration;
    p.cooldown = CONFIG.warpCooldown;
    p.invulnerable = true;
    spawnPortal(playerX(), laneY(p.lane), "out");
    playTone(310, 0.16, "sawtooth", 0.035, 520);

    if (closeObstacle) {
      state.score += 120;
      state.flash = 0.16;
      showMessage("超ケツワープ！ +120");
      playTone(660, 0.12, "square", 0.035, 460);
      if (navigator.vibrate) navigator.vibrate([18, 20, 30]);
    } else if (navigator.vibrate) {
      navigator.vibrate(16);
    }
  }

  function spawnPortal(x, y, phase) {
    const color = phase === "in" ? "#67e8f9" : "#9a67ff";
    for (let i = 0; i < 22; i++) {
      const angle = (Math.PI * 2 * i) / 22;
      const speed = 45 + (i % 6) * 13;
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.48,
        life: 0.28 + (i % 4) * 0.045,
        maxLife: 0.45,
        size: 1.6 + (i % 3),
        color,
      });
    }
  }

  function spawnObstacle() {
    const difficulty = Math.min(1, state.time / 55);
    const roll = Math.random();
    let lanes;
    let type;
    if (roll < 0.23 + difficulty * 0.16) {
      const safeLane = Math.floor(Math.random() * 3);
      lanes = [0, 1, 2].filter(lane => lane !== safeLane);
      type = "barrier";
    } else {
      lanes = [Math.floor(Math.random() * 3)];
      type = roll > 0.78 ? "drone" : "crate";
    }
    state.obstacles.push({
      x: state.width + 70,
      lanes,
      type,
      width: type === "barrier" ? 38 : type === "drone" ? 46 : 44,
      passed: false,
      pulse: Math.random() * Math.PI * 2,
    });
  }

  function update(dt) {
    if (state.mode !== "playing") return;
    state.time += dt;
    state.speed = Math.min(CONFIG.maxSpeed, CONFIG.startSpeed + state.time * 4.2);
    state.score += dt * (10 + state.speed * 0.022);
    state.flash = Math.max(0, state.flash - dt);
    state.shake = Math.max(0, state.shake - dt * 2.8);

    const p = state.player;
    if (p.cooldown > 0) p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.warpTime > 0) {
      const wasAboveHalf = p.warpTime > CONFIG.warpDuration * 0.5;
      p.warpTime = Math.max(0, p.warpTime - dt);
      if (wasAboveHalf && p.warpTime <= CONFIG.warpDuration * 0.5) {
        p.lane = p.targetLane;
        spawnPortal(playerX(), laneY(p.lane), "in");
      }
      if (p.warpTime === 0) {
        p.invulnerable = false;
        playTone(520, 0.1, "triangle", 0.03, -180);
      }
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      spawnObstacle();
      const difficulty = Math.min(1, state.time / 60);
      state.spawnTimer = CONFIG.spawnMax - difficulty * 0.35 + Math.random() * (CONFIG.spawnMax - CONFIG.spawnMin) * 0.58;
    }

    const px = playerX();
    const size = playerSize();
    for (const obstacle of state.obstacles) {
      obstacle.x -= state.speed * dt;
      obstacle.pulse += dt * 4;
      if (!obstacle.passed && obstacle.x + obstacle.width * 0.5 < px - size * 0.25) {
        obstacle.passed = true;
        state.score += obstacle.lanes.length === 2 ? 50 : 30;
      }
      const hitsX = Math.abs(obstacle.x - px) < obstacle.width * 0.45 + size * 0.3;
      if (!p.invulnerable && hitsX && obstacle.lanes.includes(p.lane)) {
        endGame();
        return;
      }
    }
    state.obstacles = state.obstacles.filter(o => o.x > -90);

    for (const particle of state.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
    }
    state.particles = state.particles.filter(particle => particle.life > 0);
    updateUI();
  }

  function endGame() {
    state.mode = "over";
    state.shake = 0.35;
    state.flash = 0.22;
    const final = Math.floor(state.score);
    const isRecord = final > state.best;
    if (isRecord) {
      state.best = final;
      writeBest(final);
    }
    updateUI();
    ui.finalScore.textContent = formatScore(final);
    ui.recordMessage.textContent = isRecord ? "NEW RECORD！最高記録を更新" : `最高記録 ${formatScore(state.best)}`;
    playTone(170, 0.2, "sawtooth", 0.05, -100);
    setTimeout(() => playTone(92, 0.28, "square", 0.035, -45), 120);
    if (navigator.vibrate) navigator.vibrate([45, 35, 75]);
    setTimeout(() => ui.gameOverScreen.classList.add("visible"), 420);
  }

  function updateUI() {
    const score = Math.floor(state.score);
    if (score !== state.displayScore) {
      state.displayScore = score;
      ui.score.textContent = formatScore(score);
    }
    ui.best.textContent = formatScore(state.best);
    const ready = 1 - Math.min(1, state.player.cooldown / CONFIG.warpCooldown);
    ui.meterFill.style.transform = `scaleX(${ready})`;
    ui.meterLabel.textContent = ready >= 1 ? "READY" : `${Math.ceil(state.player.cooldown * 10) / 10}s`;
    ui.meterLabel.style.color = ready >= 1 ? "#67e8f9" : "#9398aa";
  }

  function roundedRect(x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
    gradient.addColorStop(0, "#17152c");
    gradient.addColorStop(0.5, "#10162b");
    gradient.addColorStop(1, "#090d1c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, state.width, state.height);

    for (const star of state.stars) {
      ctx.globalAlpha = star.a;
      ctx.fillStyle = "#cfd9ff";
      ctx.beginPath();
      ctx.arc((star.x - state.time * state.speed * 0.035) % (state.width + 10), star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const horizon = state.height * 0.52;
    ctx.fillStyle = "rgba(17, 25, 47, .85)";
    for (let i = 0; i < 12; i++) {
      const w = 44 + (i % 4) * 22;
      const h = 38 + (i % 5) * 24;
      const x = ((i * 103 - state.time * state.speed * 0.08) % (state.width + 140)) - 70;
      ctx.fillRect(x, horizon - h, w, h);
      ctx.fillStyle = "rgba(103,232,249,.07)";
      ctx.fillRect(x + 8, horizon - h + 10, 3, 8);
      ctx.fillStyle = "rgba(17, 25, 47, .85)";
    }

    const top = laneY(0) - state.height * 0.1;
    const bottom = laneY(2) + state.height * 0.1;
    ctx.fillStyle = "rgba(6, 10, 23, .66)";
    ctx.fillRect(0, top, state.width, bottom - top);

    for (let lane = 0; lane < 3; lane++) {
      const y = laneY(lane);
      const dangerous = state.obstacles.some(o => o.lanes.includes(lane) && o.x > playerX() && o.x < state.width * 0.68);
      ctx.strokeStyle = dangerous ? `rgba(255,59,77,${0.16 + Math.sin(state.time * 8) * 0.05})` : "rgba(255,255,255,.065)";
      ctx.lineWidth = dangerous ? 2 : 1;
      ctx.setLineDash([9, 14]);
      ctx.lineDashOffset = state.time * -state.speed * 0.16;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(state.width, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = dangerous ? "rgba(255,59,77,.6)" : "rgba(255,255,255,.18)";
      ctx.font = "700 9px 'Roboto Mono', monospace";
      ctx.fillText(`0${lane + 1}`, 14, y - 9);
    }

    const vignette = ctx.createRadialGradient(state.width * .5, state.height * .5, state.height * .2, state.width * .5, state.height * .5, state.width * .72);
    vignette.addColorStop(0, "transparent");
    vignette.addColorStop(1, "rgba(0,0,0,.48)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  function drawPortal(x, y, alpha, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale * 0.42);
    ctx.globalAlpha = alpha;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i === 1 ? "#67e8f9" : "#9a67ff";
      ctx.lineWidth = 3.5 - i * .7;
      ctx.shadowBlur = 18;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(0, 0, 30 + i * 6 + Math.sin(state.time * 14 + i) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAgent() {
    const p = state.player;
    let y = laneY(p.lane);
    let alpha = 1;
    let scale = 1;
    if (p.warpTime > 0) {
      const progress = 1 - p.warpTime / CONFIG.warpDuration;
      alpha = Math.max(0.06, Math.abs(progress - 0.5) * 2);
      scale = Math.max(0.15, alpha);
      drawPortal(playerX(), progress < .5 ? laneY(p.fromLane) : laneY(p.targetLane), .9, 1.15 - alpha * .25);
      y = progress < .5 ? laneY(p.fromLane) : laneY(p.targetLane);
    }

    const x = playerX();
    const s = playerSize();
    const bob = Math.sin(state.time * 13) * 2.1;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(0,0,0,.65)";
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 8;

    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.beginPath();
    ctx.ellipse(0, s * .42, s * .44, s * .12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";

    ctx.strokeStyle = "#151724";
    ctx.lineWidth = s * .13;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * .15, s * .18);
    ctx.lineTo(-s * .18, s * .43);
    ctx.moveTo(s * .13, s * .18);
    ctx.lineTo(s * .19, s * .43);
    ctx.stroke();

    const bodyGradient = ctx.createLinearGradient(-s * .4, 0, s * .4, 0);
    bodyGradient.addColorStop(0, "#771526");
    bodyGradient.addColorStop(.47, "#e04453");
    bodyGradient.addColorStop(1, "#651222");
    ctx.fillStyle = bodyGradient;
    roundedRect(-s * .34, -s * .2, s * .68, s * .58, s * .17);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.2)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#252738";
    ctx.fillRect(-s * .34, s * .22, s * .68, s * .11);
    ctx.fillStyle = "#c9a15e";
    ctx.fillRect(-s * .05, s * .22, s * .1, s * .11);

    ctx.fillStyle = "#b97855";
    ctx.beginPath();
    ctx.arc(0, -s * .36, s * .22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#18141b";
    ctx.beginPath();
    ctx.arc(0, -s * .41, s * .22, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-s * .22, -s * .42, s * .44, s * .08);
    ctx.fillStyle = "#1d1520";
    ctx.beginPath();
    ctx.arc(-s * .075, -s * .34, s * .018, 0, Math.PI * 2);
    ctx.arc(s * .075, -s * .34, s * .018, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.5)";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-s * .07, -s * .26);
    ctx.quadraticCurveTo(0, -s * .22, s * .08, -s * .27);
    ctx.stroke();

    ctx.strokeStyle = "#a86e4f";
    ctx.lineWidth = s * .11;
    ctx.beginPath();
    ctx.moveTo(s * .25, -s * .1);
    ctx.lineTo(s * .43, s * .09);
    ctx.stroke();
    ctx.fillStyle = "#141b2d";
    roundedRect(s * .34, -s * .07, s * .2, s * .34, s * .04);
    ctx.fill();
    ctx.strokeStyle = "#8ea0bb";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#67e8f9";
    ctx.fillRect(s * .38, -s * .02, s * .12, s * .2);

    if (p.warpTime > 0) {
      ctx.fillStyle = "rgba(255,155,71,.85)";
      ctx.font = `900 ${s * .2}px sans-serif`;
      ctx.fillText("↯", -s * .52, s * .08);
    }
    ctx.restore();
  }

  function drawObstacle(obstacle) {
    const colors = {
      crate: ["#d87535", "#7e351d"],
      barrier: ["#f4c542", "#7b5c12"],
      drone: ["#65d7e5", "#174a58"],
    };
    for (const lane of obstacle.lanes) {
      const y = laneY(lane);
      const w = obstacle.width;
      const h = obstacle.type === "barrier" ? playerSize() * 1.03 : playerSize() * .76;
      ctx.save();
      ctx.translate(obstacle.x, y);
      ctx.shadowBlur = 16;
      ctx.shadowColor = obstacle.type === "drone" ? "rgba(103,232,249,.4)" : "rgba(255,59,77,.24)";
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, colors[obstacle.type][0]);
      g.addColorStop(1, colors[obstacle.type][1]);
      ctx.fillStyle = g;

      if (obstacle.type === "drone") {
        roundedRect(-w * .34, -h * .23, w * .68, h * .46, 8);
        ctx.fill();
        ctx.strokeStyle = "#9ef3ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-w * .52, -h * .12);
        ctx.lineTo(-w * .23, 0);
        ctx.lineTo(-w * .52, h * .12);
        ctx.moveTo(w * .52, -h * .12);
        ctx.lineTo(w * .23, 0);
        ctx.lineTo(w * .52, h * .12);
        ctx.stroke();
        ctx.fillStyle = Math.sin(obstacle.pulse) > 0 ? "#ff3b4d" : "#4a1019";
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        roundedRect(-w / 2, -h / 2, w, h, obstacle.type === "barrier" ? 5 : 8);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.28)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = obstacle.type === "barrier" ? "#252013" : "rgba(255,215,165,.55)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-w * .36, h * .38);
        ctx.lineTo(w * .36, -h * .38);
        ctx.moveTo(-w * .08, h * .48);
        ctx.lineTo(w * .48, -h * .12);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function render() {
    ctx.save();
    if (state.shake > 0) ctx.translate((Math.random() - .5) * 8 * state.shake, (Math.random() - .5) * 8 * state.shake);
    drawBackground();
    state.obstacles.forEach(drawObstacle);
    drawAgent();
    drawParticles();
    ctx.restore();

    if (state.flash > 0) {
      ctx.fillStyle = `rgba(154,103,255,${Math.min(.24, state.flash)})`;
      ctx.fillRect(0, 0, state.width, state.height);
    }
  }

  function loop(now) {
    const dt = Math.min(0.035, (now - state.lastFrame) / 1000 || 0);
    state.lastFrame = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function laneFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const y = event.clientY - rect.top;
    let closest = 0;
    let distance = Infinity;
    for (let lane = 0; lane < 3; lane++) {
      const d = Math.abs(y - laneY(lane));
      if (d < distance) { closest = lane; distance = d; }
    }
    return closest;
  }

  canvas.addEventListener("pointerdown", event => {
    event.preventDefault();
    requestWarp(laneFromPointer(event));
  });
  ui.startButton.addEventListener("click", () => { startAudio(); resetGame(); });
  ui.retryButton.addEventListener("click", () => { startAudio(); resetGame(); });
  ui.soundButton.addEventListener("click", () => {
    state.sound = !state.sound;
    ui.soundButton.setAttribute("aria-pressed", String(state.sound));
    ui.soundButton.textContent = state.sound ? "♪" : "×";
    if (state.sound) playTone(440, .08, "sine", .04);
  });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    state.lastFrame = performance.now();
  });
  window.addEventListener("keydown", event => {
    const map = { ArrowUp: 0, ArrowLeft: 0, "1": 0, ArrowDown: 2, ArrowRight: 2, "3": 2, "2": 1, " ": 1 };
    if (event.key in map) {
      event.preventDefault();
      requestWarp(map[event.key]);
    }
  });

  resize();
  updateUI();
  requestAnimationFrame(loop);
})();
