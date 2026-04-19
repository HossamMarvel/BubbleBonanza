const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreValue = document.getElementById("scoreValue");
const comboValue = document.getElementById("comboValue");
const timeValue = document.getElementById("timeValue");
const bestValue = document.getElementById("bestValue");
const startButton = document.getElementById("startButton");
const muteButton = document.getElementById("muteButton");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayButton = document.getElementById("overlayButton");
const gameSection = document.getElementById("gameSection");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = HEIGHT - 94;
const STORAGE_KEY = "bubble-bonanza-best";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const random = (min, max) => Math.random() * (max - min) + min;

function roundedRect(x, y, width, height, radius) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    return;
  }

  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

const audio = {
  ctx: null,
  muted: false,
  ensure() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        this.muted = true;
        return null;
      }
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  },
  tone({ frequency, duration, type = "sine", volume = 0.04, slideTo }) {
    if (this.muted) return;
    const ctxInstance = this.ensure();
    if (!ctxInstance) return;

    const oscillator = ctxInstance.createOscillator();
    const gain = ctxInstance.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctxInstance.currentTime);
    if (slideTo) {
      oscillator.frequency.linearRampToValueAtTime(
        slideTo,
        ctxInstance.currentTime + duration,
      );
    }
    gain.gain.setValueAtTime(0.0001, ctxInstance.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      volume,
      ctxInstance.currentTime + 0.02,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      ctxInstance.currentTime + duration,
    );

    oscillator.connect(gain);
    gain.connect(ctxInstance.destination);
    oscillator.start();
    oscillator.stop(ctxInstance.currentTime + duration + 0.03);
  },
  catch(combo) {
    this.tone({
      frequency: 420 + combo * 35,
      slideTo: 620 + combo * 40,
      duration: 0.14,
      type: combo > 4 ? "triangle" : "sine",
      volume: 0.06,
    });
  },
  bonus() {
    this.tone({
      frequency: 620,
      slideTo: 880,
      duration: 0.18,
      type: "triangle",
      volume: 0.07,
    });
  },
  bad() {
    this.tone({
      frequency: 260,
      slideTo: 120,
      duration: 0.2,
      type: "sawtooth",
      volume: 0.05,
    });
  },
  gameOver() {
    this.tone({
      frequency: 340,
      slideTo: 200,
      duration: 0.35,
      type: "square",
      volume: 0.06,
    });
  },
};

const game = {
  running: false,
  score: 0,
  combo: 0,
  timeLeft: 60,
  best: Number(localStorage.getItem(STORAGE_KEY) || 0),
  spawnTimer: 0,
  difficultyTimer: 0,
  lastTick: 0,
  pointerActive: false,
  player: {
    x: WIDTH / 2,
    y: GROUND_Y,
    width: 126,
    height: 86,
    speed: 520,
    wobble: 0,
  },
  keys: { left: false, right: false },
  bubbles: [],
  particles: [],
  streaks: [],
};

bestValue.textContent = String(game.best);

function resetGame() {
  game.running = true;
  game.score = 0;
  game.combo = 0;
  game.timeLeft = 60;
  game.spawnTimer = 0.3;
  game.difficultyTimer = 0;
  game.bubbles = [];
  game.particles = [];
  game.streaks = [];
  game.player.x = WIDTH / 2;
  game.lastTick = performance.now();
  updateHud();
  hideOverlay();
}

function updateHud() {
  scoreValue.textContent = String(game.score);
  comboValue.textContent = `x${Math.max(1, game.combo)}`;
  timeValue.textContent = String(Math.ceil(game.timeLeft));
  bestValue.textContent = String(game.best);
}

function saveBest() {
  if (game.score > game.best) {
    game.best = game.score;
    localStorage.setItem(STORAGE_KEY, String(game.best));
  }
}

function showOverlay(title, text, buttonText) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayButton.textContent = buttonText;
  overlay.classList.add("visible");
}

function hideOverlay() {
  overlay.classList.remove("visible");
}

function spawnBubble() {
  const roll = Math.random();
  let type = "good";
  if (roll > 0.8 && roll <= 0.94) type = "gold";
  if (roll > 0.94) type = "bad";

  const radius = type === "gold" ? random(18, 28) : random(20, 34);
  const drift = random(-30, 30);
  const speed = random(135, 240) + game.difficultyTimer * 3.5;

  game.bubbles.push({
    x: random(radius + 24, WIDTH - radius - 24),
    y: -40,
    radius,
    speed,
    drift,
    swing: random(0, Math.PI * 2),
    type,
    rotation: random(0, Math.PI * 2),
  });
}

function emitPop(x, y, color, amount = 12) {
  for (let i = 0; i < amount; i += 1) {
    game.particles.push({
      x,
      y,
      vx: random(-160, 160),
      vy: random(-220, -30),
      life: random(0.4, 0.75),
      size: random(5, 12),
      color,
    });
  }
}

function addFloatingText(text, x, y, color) {
  game.streaks.push({
    text,
    x,
    y,
    color,
    life: 0.8,
    vy: -48,
  });
}

function catchBubble(index) {
  const bubble = game.bubbles[index];
  game.bubbles.splice(index, 1);

  if (bubble.type === "bad") {
    game.combo = 0;
    game.timeLeft = Math.max(0, game.timeLeft - 5);
    emitPop(bubble.x, bubble.y, "#ff5c76", 18);
    addFloatingText("-5s", bubble.x, bubble.y, "#d72654");
    audio.bad();
  } else {
    game.combo += 1;
    const comboMultiplier = 1 + Math.floor(game.combo / 4);
    const points = bubble.type === "gold" ? 30 * comboMultiplier : 10 * comboMultiplier;
    game.score += points;
    if (bubble.type === "gold") {
      game.timeLeft = Math.min(60, game.timeLeft + 2);
      emitPop(bubble.x, bubble.y, "#ffd55c", 22);
      addFloatingText(`+${points} / +2s`, bubble.x, bubble.y, "#de9f00");
      audio.bonus();
    } else {
      emitPop(bubble.x, bubble.y, "#59d6b1", 14);
      addFloatingText(`+${points}`, bubble.x, bubble.y, "#148b70");
      audio.catch(game.combo);
    }
  }

  updateHud();
}

function endGame() {
  game.running = false;
  saveBest();
  updateHud();
  audio.gameOver();
  const isBest = game.score >= game.best && game.score > 0;
  const title = isBest ? "رقم قياسي جديد!" : "انتهى الوقت";
  const text = isBest
    ? `جمعت ${game.score} نقطة وكسرت أفضل نتيجة. جرّب جولة أسرع وشوف هتوصل لفين.`
    : `جمعت ${game.score} نقطة. حاول تركز على الفقاعات الذهبية واهرب من الحمراء.`;
  showOverlay(title, text, "العب مرة ثانية");
}

function update(dt) {
  if (!game.running) return;

  game.timeLeft -= dt;
  game.difficultyTimer += dt;
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    endGame();
    return;
  }

  const move = (game.keys.right ? 1 : 0) - (game.keys.left ? 1 : 0);
  game.player.x += move * game.player.speed * dt;
  game.player.x = clamp(game.player.x, 90, WIDTH - 90);
  game.player.wobble += dt * 8;

  const spawnInterval = clamp(0.9 - game.difficultyTimer * 0.015, 0.26, 0.9);
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnBubble();
    game.spawnTimer = spawnInterval;
  }

  for (let i = game.bubbles.length - 1; i >= 0; i -= 1) {
    const bubble = game.bubbles[i];
    bubble.y += bubble.speed * dt;
    bubble.swing += dt * 2.2;
    bubble.x += Math.sin(bubble.swing) * bubble.drift * dt;
    bubble.rotation += dt * 0.8;

    const catcherLeft = game.player.x - game.player.width * 0.32;
    const catcherRight = game.player.x + game.player.width * 0.32;
    const catcherTop = game.player.y - game.player.height * 0.2;

    const insideX = bubble.x > catcherLeft && bubble.x < catcherRight;
    const insideY = bubble.y + bubble.radius > catcherTop && bubble.y < game.player.y + 12;

    if (insideX && insideY) {
      catchBubble(i);
      continue;
    }

    if (bubble.y - bubble.radius > HEIGHT + 8) {
      if (bubble.type !== "bad") {
        game.combo = 0;
      }
      game.bubbles.splice(i, 1);
      updateHud();
    }
  }

  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const particle = game.particles[i];
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 380 * dt;
    if (particle.life <= 0) {
      game.particles.splice(i, 1);
    }
  }

  for (let i = game.streaks.length - 1; i >= 0; i -= 1) {
    const streak = game.streaks[i];
    streak.life -= dt;
    streak.y += streak.vy * dt;
    if (streak.life <= 0) {
      game.streaks.splice(i, 1);
    }
  }

  updateHud();
}

function drawBackground() {
  const skyGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  skyGradient.addColorStop(0, "#93e2ff");
  skyGradient.addColorStop(0.55, "#8edbff");
  skyGradient.addColorStop(0.56, "#86ddaf");
  skyGradient.addColorStop(1, "#5ebb72");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(118, 98, 52, 0, Math.PI * 2);
  ctx.fill();

  drawHills();
  drawDecor();
}

function drawHills() {
  ctx.fillStyle = "#77cf88";
  ctx.beginPath();
  ctx.moveTo(0, 390);
  ctx.quadraticCurveTo(180, 300, 350, 385);
  ctx.quadraticCurveTo(520, 465, 700, 370);
  ctx.quadraticCurveTo(860, 290, WIDTH, 398);
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#4eae61";
  ctx.beginPath();
  ctx.moveTo(0, 430);
  ctx.quadraticCurveTo(140, 355, 280, 420);
  ctx.quadraticCurveTo(450, 500, 660, 415);
  ctx.quadraticCurveTo(850, 340, WIDTH, 438);
  ctx.lineTo(WIDTH, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.fill();
}

function drawDecor() {
  for (let i = 0; i < 6; i += 1) {
    const x = 90 + i * 160;
    const offset = Math.sin((performance.now() * 0.001) + i) * 5;

    ctx.fillStyle = "#377b4a";
    ctx.fillRect(x, 368 + offset, 10, 44);

    ctx.fillStyle = i % 2 === 0 ? "#ff8fb3" : "#ffd65b";
    ctx.beginPath();
    ctx.arc(x - 10, 370 + offset, 14, 0, Math.PI * 2);
    ctx.arc(x + 14, 362 + offset, 14, 0, Math.PI * 2);
    ctx.arc(x + 4, 350 + offset, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const { x, y, width, height, wobble } = game.player;
  const bounce = Math.sin(wobble) * 4;
  const basketY = y + bounce;

  ctx.save();
  ctx.translate(x, basketY);

  ctx.fillStyle = "#7b4a29";
  roundedRect(-width / 2, -height / 2, width, height * 0.58, 26);
  ctx.fill();

  ctx.fillStyle = "#99633a";
  roundedRect(-width / 2 + 10, -height / 2 + 10, width - 20, height * 0.18, 18);
  ctx.fill();

  ctx.strokeStyle = "#f7d38f";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, -height / 3, width * 0.23, Math.PI, 0);
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-16, -2, 12, 0, Math.PI * 2);
  ctx.arc(16, -2, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#17345a";
  ctx.beginPath();
  ctx.arc(-14 + Math.sin(wobble) * 1.5, -2, 5, 0, Math.PI * 2);
  ctx.arc(18 + Math.sin(wobble) * 1.5, -2, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#17345a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 14, 18, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.restore();
}

function drawBubble(bubble) {
  const palette = {
    good: ["#7ae8cf", "#2fb89d"],
    gold: ["#ffe687", "#ffbf38"],
    bad: ["#ff90aa", "#ff4f6f"],
  };
  const [from, to] = palette[bubble.type];
  const grad = ctx.createRadialGradient(
    bubble.x - bubble.radius * 0.3,
    bubble.y - bubble.radius * 0.4,
    bubble.radius * 0.2,
    bubble.x,
    bubble.y,
    bubble.radius,
  );
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.18, from);
  grad.addColorStop(1, to);

  ctx.save();
  ctx.translate(bubble.x, bubble.y);
  ctx.rotate(Math.sin(bubble.rotation) * 0.12);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, bubble.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.arc(-bubble.radius * 0.28, -bubble.radius * 0.25, bubble.radius * 0.26, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, bubble.radius * 0.72, Math.PI * 0.15, Math.PI * 0.8);
  ctx.stroke();

  if (bubble.type === "gold") {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(4, -2);
    ctx.lineTo(12, 0);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 12);
    ctx.lineTo(-4, 4);
    ctx.lineTo(-12, 0);
    ctx.lineTo(-4, -2);
    ctx.closePath();
    ctx.fill();
  }

  if (bubble.type === "bad") {
    ctx.strokeStyle = "rgba(130, 12, 33, 0.65)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-10, -8);
    ctx.lineTo(10, 8);
    ctx.moveTo(10, -8);
    ctx.lineTo(-10, 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawParticles() {
  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life * 1.4);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * particle.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 28px 'Trebuchet MS'";
  for (const streak of game.streaks) {
    ctx.globalAlpha = Math.max(0, streak.life * 1.2);
    ctx.fillStyle = streak.color;
    ctx.fillText(streak.text, streak.x, streak.y);
  }
  ctx.globalAlpha = 1;
}

function drawComboBadge() {
  if (game.combo < 4 || !game.running) return;
  const pulse = 1 + Math.sin(performance.now() * 0.008) * 0.06;
  ctx.save();
  ctx.translate(WIDTH - 124, 86);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  roundedRect(-72, -30, 144, 60, 28);
  ctx.fill();
  ctx.fillStyle = "#ff7a59";
  ctx.font = "800 24px 'Trebuchet MS'";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`COMBO x${game.combo}`, 0, 2);
  ctx.restore();
}

function drawScene() {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawBackground();
  for (const bubble of game.bubbles) drawBubble(bubble);
  drawPlayer();
  drawParticles();
  drawTexts();
  drawComboBadge();
}

function loop(now) {
  const dt = Math.min(0.033, (now - game.lastTick) / 1000 || 0);
  game.lastTick = now;
  update(dt);
  drawScene();
  requestAnimationFrame(loop);
}

function beginRound() {
  audio.ensure();
  resetGame();
}

function goToGameAndBegin() {
  beginRound();
  gameSection?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

function setMuted(muted) {
  audio.muted = muted;
  muteButton.setAttribute("aria-pressed", String(muted));
  muteButton.textContent = muted ? "الصوت مقفول" : "الصوت شغال";
}

function handlePointer(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * WIDTH;
  game.player.x = clamp(x, 90, WIDTH - 90);
}

startButton.addEventListener("click", goToGameAndBegin);
overlayButton.addEventListener("click", beginRound);
muteButton.addEventListener("click", () => setMuted(!audio.muted));

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") game.keys.left = true;
  if (event.key === "ArrowRight") game.keys.right = true;
  if (event.code === "Space" && !game.running) beginRound();
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft") game.keys.left = false;
  if (event.key === "ArrowRight") game.keys.right = false;
});

canvas.addEventListener("pointerdown", (event) => {
  game.pointerActive = true;
  handlePointer(event);
});

canvas.addEventListener("pointermove", (event) => {
  if (game.pointerActive) handlePointer(event);
});

window.addEventListener("pointerup", () => {
  game.pointerActive = false;
});

showOverlay(
  "اجمع أكبر عدد من الفقاعات",
  "الفقاعات الخضراء تزيد نقاطك، الذهبية تعطي نقاط ووقت إضافي، والحمراء تخصم من الوقت.",
  "ابدأ الجولة",
);
setMuted(false);
requestAnimationFrame(loop);
