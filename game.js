const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const video = document.getElementById("inputVideo");
const cameraCanvas = document.getElementById("cameraCanvas");
const cameraCtx = cameraCanvas.getContext("2d");

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const statusEl = document.getElementById("status");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl = document.getElementById("overlayTitle");
const overlayTextEl = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");

const GAME_WIDTH = canvas.width;
const GAME_HEIGHT = canvas.height;

const LEVELS = [
  { rows: 4, cols: 8, speed: 320 },
  { rows: 5, cols: 10, speed: 360 },
  { rows: 6, cols: 10, speed: 420 }
];

const state = {
  phase: "loading",
  score: 0,
  level: 0,
  combo: 0,
  targetPaddleX: GAME_WIDTH / 2,
  handX: 0.5,
  handDetected: false,
  gesture: "none",
  canTriggerOpen: true,
  canTriggerFist: true,
  particles: [],
  clearEffects: [],
  flashTimer: 0,
  lastTime: 0,
  streamActive: false,
  trackerReady: false,
  trackingLoopStarted: false
};

let handTracker = null;

const paddle = {
  width: 150,
  height: 18,
  x: GAME_WIDTH / 2 - 75,
  y: GAME_HEIGHT - 52,
  speed: 11
};

const ball = {
  x: GAME_WIDTH / 2,
  y: GAME_HEIGHT - 90,
  radius: 11,
  speed: 320,
  vx: 220,
  vy: -320,
  glow: 0
};

let bricks = [];

function setStatus(text) {
  statusEl.textContent = text;
}

function setOverlay(title, text, buttonText = "开始游戏", showButton = true) {
  overlayTitleEl.textContent = title;
  overlayTextEl.textContent = text;
  startButton.textContent = buttonText;
  startButton.style.display = showButton ? "inline-flex" : "none";
  overlayEl.classList.remove("hidden");
}

function getCameraErrorMessage(error) {
  if (!error) {
    return "摄像头启动失败，请重试。";
  }

  const name = error.name || "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "浏览器没有获得摄像头权限。请点击地址栏附近的相机图标，将此站点的摄像头权限改为“允许”，然后重试。";
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "没有找到可用摄像头。请确认你的电脑已连接并启用了摄像头。";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "摄像头当前可能正被别的应用占用。请关闭微信、腾讯会议、相机等可能占用摄像头的软件后再试。";
  }

  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "当前摄像头分辨率请求不兼容，稍后我可以改成更宽松的兼容模式。";
  }

  if (name === "SecurityError") {
    return "当前页面环境不允许调用摄像头。请使用支持 HTTPS 的正常浏览器页面打开。";
  }

  return `${error.message || "未知摄像头错误"}。请重试。`;
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function createLevel(levelIndex) {
  const config = LEVELS[levelIndex];
  const marginX = 72;
  const topOffset = 88;
  const gap = 10;
  const totalWidth = GAME_WIDTH - marginX * 2;
  const brickWidth = (totalWidth - gap * (config.cols - 1)) / config.cols;
  const brickHeight = 24;
  const palette = ["#ff5c7a", "#ffd93d", "#52e3c2", "#4cc9ff", "#b388ff", "#ff9f68"];

  bricks = [];

  for (let row = 0; row < config.rows; row += 1) {
    for (let col = 0; col < config.cols; col += 1) {
      bricks.push({
        x: marginX + col * (brickWidth + gap),
        y: topOffset + row * (brickHeight + gap),
        width: brickWidth,
        height: brickHeight,
        color: palette[(row + col) % palette.length],
        alive: true
      });
    }
  }

  ball.speed = config.speed;
  resetBall(true);
  levelEl.textContent = String(levelIndex + 1);
}

function resetBall(centerOnly = false) {
  ball.x = paddle.x + paddle.width / 2;
  ball.y = paddle.y - ball.radius - 6;
  ball.vx = ball.speed * 0.7 * (Math.random() > 0.5 ? 1 : -1);
  ball.vy = -ball.speed;
  if (centerOnly) {
    ball.vx = ball.speed * 0.65;
  }
}

function startLevel(levelIndex, resumeExisting = false) {
  state.level = levelIndex;
  state.combo = 0;

  if (!resumeExisting) {
    createLevel(levelIndex);
  }

  state.phase = "playing";
  setStatus("PLAY");
  hideOverlay();
}

function startGame() {
  state.score = 0;
  scoreEl.textContent = "0";
  state.particles = [];
  state.clearEffects = [];
  createLevel(0);
  startLevel(0, true);
}

function pauseGame() {
  if (state.phase !== "playing") return;
  state.phase = "paused";
  setStatus("PAUSE");
  setOverlay("游戏暂停", "握拳已触发暂停。张开手或点击按钮继续。", "继续游戏");
}

function resumeGame() {
  if (state.phase === "ready" || state.phase === "loading") {
    startGame();
    return;
  }

  if (state.phase === "paused") {
    state.phase = "playing";
    setStatus("PLAY");
    hideOverlay();
  }
}

function nextLevel() {
  if (state.level >= LEVELS.length - 1) {
    winGame();
    return;
  }

  const next = state.level + 1;
  state.level = next;
  setStatus("CLEAR");
  setOverlay(`Level ${state.level + 1}`, "张开手或点击按钮进入下一关。", "下一关");
  createLevel(next);
  state.phase = "paused";
}

function winGame() {
  state.phase = "won";
  setStatus("WIN");
  setOverlay("恭喜通关！", `最终得分 ${state.score}。再来一局？`, "重新开始");
}

function loseGame() {
  state.phase = "lost";
  setStatus("LOSE");
  setOverlay("球掉出去了！", `本局得分 ${state.score}。张开手或点击按钮重开。`, "重新开始");
}

function updateScore(points) {
  state.score += points;
  scoreEl.textContent = String(state.score);
}

function emitParticles(x, y, color, count = 10) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 220,
      vy: (Math.random() - 0.5) * 220,
      life: 0.45 + Math.random() * 0.25,
      size: 4 + Math.random() * 5,
      color
    });
  }
}

function clearBrick(brick) {
  brick.alive = false;
  updateScore(10);
  state.combo += 1;
  state.flashTimer = 0.12;
  state.clearEffects.push({
    x: brick.x,
    y: brick.y,
    width: brick.width,
    height: brick.height,
    color: brick.color,
    life: 0.22
  });
  emitParticles(brick.x + brick.width / 2, brick.y + brick.height / 2, brick.color, 12);
}

function updatePaddle() {
  const desiredX = clamp(state.targetPaddleX - paddle.width / 2, 24, GAME_WIDTH - paddle.width - 24);
  paddle.x = lerp(paddle.x, desiredX, 0.18);
}

function updateBall(delta) {
  ball.x += ball.vx * delta;
  ball.y += ball.vy * delta;
  ball.glow = Math.max(0, ball.glow - delta * 3);

  if (ball.x - ball.radius <= 0) {
    ball.x = ball.radius;
    ball.vx = Math.abs(ball.vx);
    ball.glow = 1;
  } else if (ball.x + ball.radius >= GAME_WIDTH) {
    ball.x = GAME_WIDTH - ball.radius;
    ball.vx = -Math.abs(ball.vx);
    ball.glow = 1;
  }

  if (ball.y - ball.radius <= 0) {
    ball.y = ball.radius;
    ball.vy = Math.abs(ball.vy);
    ball.glow = 1;
  }

  if (
    ball.y + ball.radius >= paddle.y &&
    ball.y - ball.radius <= paddle.y + paddle.height &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.width &&
    ball.vy > 0
  ) {
    const hit = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    ball.y = paddle.y - ball.radius;
    ball.vx = hit * ball.speed * 1.1;
    ball.vy = -Math.abs(ball.speed * (0.82 + Math.abs(hit) * 0.18));
    ball.glow = 1;
    emitParticles(ball.x, ball.y, "#ffffff", 6);
  }

  for (const brick of bricks) {
    if (!brick.alive) continue;

    const closestX = clamp(ball.x, brick.x, brick.x + brick.width);
    const closestY = clamp(ball.y, brick.y, brick.y + brick.height);
    const dx = ball.x - closestX;
    const dy = ball.y - closestY;

    if (dx * dx + dy * dy <= ball.radius * ball.radius) {
      const overlapX = Math.min(Math.abs(ball.x - brick.x), Math.abs(ball.x - (brick.x + brick.width)));
      const overlapY = Math.min(Math.abs(ball.y - brick.y), Math.abs(ball.y - (brick.y + brick.height)));

      if (overlapX < overlapY) {
        ball.vx *= -1;
      } else {
        ball.vy *= -1;
      }

      clearBrick(brick);
      ball.glow = 1;
      break;
    }
  }

  if (ball.y - ball.radius > GAME_HEIGHT) {
    loseGame();
  }

  if (bricks.every((brick) => !brick.alive)) {
    nextLevel();
  }
}

function updateEffects(delta) {
  state.clearEffects = state.clearEffects.filter((effect) => {
    effect.life -= delta;
    return effect.life > 0;
  });

  state.particles = state.particles.filter((particle) => {
    particle.life -= delta;
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vx *= 0.98;
    particle.vy *= 0.98;
    return particle.life > 0;
  });

  state.flashTimer = Math.max(0, state.flashTimer - delta);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, "#1e4dd8");
  gradient.addColorStop(0.58, "#173283");
  gradient.addColorStop(1, "#09132e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  if (state.flashTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.flashTimer * 0.28})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + i * 0.005})`;
    ctx.fillRect(0, 70 + i * 70, GAME_WIDTH, 4);
  }
}

function drawBricks() {
  for (const brick of bricks) {
    if (!brick.alive) continue;
    ctx.fillStyle = brick.color;
    ctx.beginPath();
    ctx.roundRect(brick.x, brick.y, brick.width, brick.height, 8);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.roundRect(brick.x + 4, brick.y + 4, brick.width - 8, 6, 4);
    ctx.fill();
  }

  for (const effect of state.clearEffects) {
    const progress = effect.life / 0.22;
    const scale = 1 + (1 - progress) * 0.4;
    const width = effect.width * scale;
    const height = effect.height * scale;
    const x = effect.x - (width - effect.width) / 2;
    const y = effect.y - (height - effect.height) / 2;
    ctx.globalAlpha = progress;
    ctx.fillStyle = effect.color;
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawPaddle() {
  ctx.fillStyle = "#1b2339";
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y + 8, paddle.width, paddle.height, 12);
  ctx.fill();

  const gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x + paddle.width, paddle.y);
  gradient.addColorStop(0, "#52e3c2");
  gradient.addColorStop(0.5, "#ffffff");
  gradient.addColorStop(1, "#35d0ff");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 12);
  ctx.fill();
}

function drawBall() {
  const glowRadius = ball.radius + ball.glow * 18;
  const glow = ctx.createRadialGradient(ball.x, ball.y, ball.radius * 0.25, ball.x, ball.y, glowRadius);
  glow.addColorStop(0, "rgba(255,255,255,0.95)");
  glow.addColorStop(0.4, "rgba(255,217,61,0.85)");
  glow.addColorStop(1, "rgba(255,217,61,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff7cc";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawParticles() {
  for (const particle of state.particles) {
    ctx.globalAlpha = Math.max(0, particle.life * 1.8);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function drawHandHint() {
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.roundRect(28, GAME_HEIGHT - 110, 220, 68, 20);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.font = "700 18px Segoe UI";
  const label = !state.streamActive
    ? "Camera not ready"
    : state.handDetected
      ? "Hand detected"
      : "Show your hand";
  ctx.fillText(label, 44, GAME_HEIGHT - 72);

  ctx.fillStyle = "#dbeafe";
  ctx.font = "14px Segoe UI";
  const subLabel = !state.streamActive
    ? "Allow camera access first"
    : state.handDetected
      ? `Gesture: ${state.gesture}`
      : "Keep one hand inside the camera frame";
  ctx.fillText(subLabel, 44, GAME_HEIGHT - 48);
  ctx.restore();
}

function render() {
  drawBackground();
  drawBricks();
  drawPaddle();
  drawBall();
  drawParticles();
  drawHandHint();
}

function gameLoop(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }

  const delta = Math.min((timestamp - state.lastTime) / 1000, 0.02);
  state.lastTime = timestamp;

  updatePaddle();

  if (state.phase === "playing") {
    updateBall(delta);
  }

  updateEffects(delta);
  render();
  requestAnimationFrame(gameLoop);
}

function isFingerExtended(tip, pip, landmarks) {
  return landmarks[tip].y < landmarks[pip].y;
}

function classifyGesture(landmarks) {
  const extendedCount = [
    isFingerExtended(8, 6, landmarks),
    isFingerExtended(12, 10, landmarks),
    isFingerExtended(16, 14, landmarks),
    isFingerExtended(20, 18, landmarks)
  ].filter(Boolean).length;

  const thumbOpen = Math.abs(landmarks[4].x - landmarks[3].x) > 0.035;

  if (extendedCount >= 3 && thumbOpen) return "open";
  if (extendedCount === 0 && !thumbOpen) return "fist";
  return "move";
}

function updateGestureState(gesture) {
  state.gesture = gesture;

  if (gesture === "open") {
    if (state.canTriggerOpen) {
      if (state.phase === "ready" || state.phase === "loading") {
        startGame();
      } else if (state.phase === "paused") {
        resumeGame();
      } else if (state.phase === "won" || state.phase === "lost") {
        startGame();
      }
      state.canTriggerOpen = false;
    }
  } else {
    state.canTriggerOpen = true;
  }

  if (gesture === "fist") {
    if (state.canTriggerFist) {
      pauseGame();
      state.canTriggerFist = false;
    }
  } else {
    state.canTriggerFist = true;
  }
}

function handleHandResults(results) {
  cameraCtx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    state.handDetected = false;
    state.gesture = "none";
    return;
  }

  state.handDetected = true;
  const landmarks = results.multiHandLandmarks[0];

  drawConnectors(cameraCtx, landmarks, HAND_CONNECTIONS, {
    color: "#35d0ff",
    lineWidth: 4
  });
  drawLandmarks(cameraCtx, landmarks, {
    color: "#ffd93d",
    fillColor: "#ff4d8d",
    radius: 4
  });

  const palmX =
    (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) / 5;
  const normalizedX = clamp(1 - palmX, 0.06, 0.94);

  state.handX = normalizedX;
  state.targetPaddleX = normalizedX * GAME_WIDTH;
  updateGestureState(classifyGesture(landmarks));
}

async function startTrackingLoop(hands) {
  if (state.trackingLoopStarted) return;
  state.trackingLoopStarted = true;

  const tick = async () => {
    if (video.readyState >= 2) {
      await hands.send({ image: video });
    }
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

async function requestCameraStream() {
  return navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      facingMode: "user"
    },
    audio: false
  });
}

async function initCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("当前浏览器不支持摄像头调用。");
  }

  if (typeof Hands !== "function") {
    throw new Error("手部识别模型没有正确加载。");
  }

  handTracker = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  handTracker.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });

  handTracker.onResults(handleHandResults);
  state.trackerReady = true;

  const stream = await requestCameraStream();

  video.srcObject = stream;
  await video.play();
  state.streamActive = true;

  await startTrackingLoop(handTracker);
}

async function retryCamera() {
  state.phase = "loading";
  setStatus("LOADING");
  setOverlay("重新连接摄像头…", "请在浏览器弹窗中允许摄像头权限。", "连接中", false);

  try {
    await initCamera();
    state.phase = "ready";
    setStatus("READY");
    setOverlay("挥挥手，准备开打！", "允许摄像头后，张开手开始；握拳暂停；左右移动手来控制挡板。");
  } catch (error) {
    state.phase = "camera-error";
    setStatus("ERROR");
    setOverlay("摄像头启动失败", getCameraErrorMessage(error), "重试");
  }
}

function bindEvents() {
  startButton.addEventListener("click", () => {
    if (state.phase === "camera-error") {
      retryCamera();
    } else if (state.phase === "paused") {
      resumeGame();
    } else {
      startGame();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (state.phase === "playing") {
        pauseGame();
      } else if (state.phase === "paused" || state.phase === "ready") {
        resumeGame();
      }
    }
  });
}

async function init() {
  bindEvents();
  render();
  requestAnimationFrame(gameLoop);

  try {
    await initCamera();
    state.phase = "ready";
    setStatus("READY");
    setOverlay("挥挥手，准备开打！", "允许摄像头后，张开手开始；握拳暂停；左右移动手来控制挡板。");
  } catch (error) {
    state.phase = "camera-error";
    setStatus("ERROR");
    setOverlay("摄像头启动失败", getCameraErrorMessage(error), "重试");
  }
}

init();
