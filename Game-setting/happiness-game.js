// ====== Prevent iOS "Shake to Undo" ======
window.addEventListener("touchstart", () => {
  if (navigator.vibrate) navigator.vibrate(1); // optional small vibration to keep sensors active
}, { passive: true });

// ====== Firebase Setup ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = { /* ... same config as before ... */ };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ====== DOM References ======
const els = {
  form: document.getElementById("name-form"),
  nameInput: document.getElementById("player-name"),
  playerList: document.getElementById("player-list"),
  startBtn: document.getElementById("start-game"),
  track: document.getElementById("track"),
  rankList: document.getElementById("ranking-list"),
  exitBtn: document.getElementById("exit-game"),
  resetBtn: document.getElementById("reset-players"),
  motionBtn: document.getElementById("enable-motion"),
  setupScreen: document.getElementById("player-setup"),
  gameScreen: document.querySelector(".game-container"),
  winnerPopup: document.getElementById("winner-popup"),
  winnerMsg: document.getElementById("winner-message"),
  winnerExit: document.getElementById("winner-exit"),
};

let players = [];
let currentPlayerId = null;
let lastShake = 0;

// ====== UI Helpers ======
function showSetup() {
  els.setupScreen.style.display = "block";
  els.gameScreen.style.display = "none";
}
function showGame() {
  els.setupScreen.style.display = "none";
  els.gameScreen.style.display = "block";
}
function updatePlayerList() {
  els.playerList.innerHTML = players.map((p, i) => `<li>Player ${i + 1}: ${p.name}</li>`).join("");
}

function updateTrack() {
  const existingLanes = new Map(
    Array.from(els.track.children).map(lane => [lane.dataset.playerId, lane])
  );

  players.forEach((p) => {
    let lane = existingLanes.get(p.id);

    if (!lane) {
      // --- Create lane once ---
      lane = document.createElement("div");
      lane.className = "lane";
      lane.dataset.playerId = p.id;
      lane.style.cssText = `
        position:relative;
        height:60px;
        margin-bottom:8px;
        background:#e0f7fa;
        border-radius:6px;
        overflow:hidden;
        display:flex;
        align-items:center;
      `;

      // Cupid
      const cupid = document.createElement("img");
      cupid.src = "img/cuppid-player.png";
      cupid.className = "cupid";
      cupid.style.cssText = `
        height:50px;
        position:absolute;
        left:5px;
        top:50%;
        transform:translateY(-50%);
        transition: transform 0.15s ease;
      `;

      // Arrow
      const arrow = document.createElement("img");
      arrow.src = "img/Heart-Cupid-Arrow.png";
      arrow.className = "arrow-img";
      arrow.style.cssText = `
        height:30px;
        position:absolute;
        top:50%;
        left:40px;
        transform:translateY(-50%);
        transition: transform 0.3s ease; /* <-- default smooth move */
      `;

      // Label
      const label = document.createElement("span");
      label.className = "player-name";
      label.style.cssText = `
        position:absolute;
        right:10px;
        font-weight:bold;
      `;
      
      // Goal image
      const goal = document.createElement("img");
      goal.src = "img/goal.png"; // replace with your goal image
      goal.className = "goal";
      goal.style.cssText = `
        height:50px;
        position:absolute;
        right:5px;
        top:50%;
        transform:translateY(-50%);
      `;
      lane.appendChild(goal);
      
      label.textContent = p.name;

      lane.appendChild(cupid);
      lane.appendChild(arrow);
      lane.appendChild(label);
      els.track.appendChild(lane);

      // Save references for reuse
      p.arrowEl = arrow;
      p.cupidEl = cupid;
      p.labelEl = label;
      p._lastProgress = -1; // cache
    } else {
      // --- Reuse existing lane ---
      p.arrowEl = lane.querySelector(".arrow-img");
      p.cupidEl = lane.querySelector(".cupid");
      p.labelEl = lane.querySelector(".player-name");
      if (p.labelEl.textContent !== p.name) {
        p.labelEl.textContent = p.name;
      }
    }

    // Always update arrow position
    if (p.progress !== p._lastprogress) {
      setArrowProgress(p.arrowEl, p.progress);
      p._lastprogress = p.pprogress;
    }
    // Mark lane as still active
    existingLanes.delete(p.id);
  });

  // --- Remove lanes for players that disappeared ---
  existingLanes.forEach((lane) => lane.remove());
}

function setArrowProgress(arrowEl, percent) {
  if (!arrowEl) return;
  arrowEl.style.transform = `translate(${Math.min(percent, 90)}%, -50%)`;
}


function updateRankings() {
  els.rankList.innerHTML = [...players]
    .sort((a, b) => b.progress - a.progress)
    .map((p, i) => `<li>${i + 1}️⃣ ${p.name} - ${Math.floor(p.progress)}%</li>`)
    .join("");
}

// ====== Game Logic ======
function handleShakeEvent(e) {
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;
  const now = Date.now();
  const magnitude = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);
  if (magnitude > 18 && now - lastShake > 500) {
    lastShake = now;
    increaseProgress();
  }
}
function triggerShakeEffect(player) {
  if (!player) return;
  [player.cupidEl, player.arrowEl].forEach(el => {
    el.style.animation = "shake 0.3s ease";
    setTimeout(() => el.style.animation = "", 300);
  });
}

async function increaseProgress() {
  if (!currentPlayerId) return;
  const player = players.find(p => p.id === currentPlayerId);
  if (player && player.progress < 100) {
    const newProgress = Math.min(100, player.progress + 5);
    await update(ref(db, `players/${currentPlayerId}`), { progress: newProgress });
    if (newProgress >= 100) {
      const winnerSnap = await get(ref(db, "winner"));
      if (!winnerSnap.exists()) {
        await set(ref(db, "winner"), player.name);
      }
    }
  }
}

// ====== Event Listeners ======
els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = els.nameInput.value.trim();
  if (!name) return;
  currentPlayerId = Date.now().toString();
  await set(ref(db, `players/${currentPlayerId}`), { name, progress: 0 });
  els.nameInput.value = "";
  els.startBtn.disabled = false;
  if (players.some(p => p.name === name)) {
    alert("Name already taken!");
    return;
  }
});
els.resetBtn.addEventListener("click", async () => {
  if (!confirm("Reset all players?")) return;
  await set(ref(db, "players"), null);
  await set(ref(db, "gameState"), "lobby");
  players = [];
  currentPlayerId = null;
  els.startBtn.disabled = true;
  showSetup();
});
els.startBtn.addEventListener("click", async () => {
  document.activeElement?.blur();
  document.querySelectorAll("input, textarea").forEach(el => el.blur());
  els.nameInput.setAttribute("readonly", true);
  await set(ref(db, "gameState"), "race");
});
els.exitBtn.addEventListener("click", async () => {
  if (currentPlayerId) await set(ref(db, `players/${currentPlayerId}`), null);
  currentPlayerId = null;
  els.startBtn.disabled = true;
  els.nameInput.removeAttribute("readonly");
  showSetup();
});
els.motionBtn.addEventListener("click", () => {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission()
      .then((state) => {
        if (state === "granted") {
          window.addEventListener("devicemotion", handleShakeEvent);
          els.motionBtn.style.display = "none";
        } else alert("Motion permission denied.");
      })
      .catch(console.error);
  } else {
    window.addEventListener("devicemotion", handleShakeEvent);
    els.motionBtn.style.display = "none";
  }
});

// ====== Firebase Listeners ======
onValue(ref(db, "players"), (snapshot) => {
  const data = snapshot.val() || {};
  players = Object.entries(data).map(([id, val]) => ({ id, ...val }));
  updatePlayerList();
  updateTrack();
  updateRankings();
});
onValue(ref(db, "gameState"), (snapshot) => {
  const state = snapshot.val() || "lobby";
  state === "lobby" ? showSetup() : showGame();
});
onValue(ref(db, "winner"), (snapshot) => {
  const winnerName = snapshot.val();
  if (winnerName) {
    els.winnerMsg.textContent = `🏆 Winner: ${winnerName}!`;
    els.winnerPopup.style.display = "flex";
  } else {
    els.winnerPopup.style.display = "none";
  }
  setTimeout(() => {
    if (els.winnerPopup.style.display === "flex") {
      els.winnerExit.click();
    }
  }, 10000);
});
els.winnerExit.addEventListener("click", async () => {
  await set(ref(db, "winner"), null);
  if (currentPlayerId) await set(ref(db, `players/${currentPlayerId}`), null);
  await set(ref(db, "gameState"), "lobby");
  currentPlayerId = null;
  els.startBtn.disabled = true;
  els.nameInput.removeAttribute("readonly");
  els.winnerPopup.style.display = "none";
  showSetup();
});

function animateCupidShot(player) {
  if (!player || !player.arrowEl || !player.cupidEl) return;

  // Cupid animation: small scale back and release
  player.cupidEl.style.transition = "transform 0.15s ease";
  player.cupidEl.style.transform = "translateY(-50%) scale(0.9)";
  setTimeout(() => {
    player.cupidEl.style.transform = "translateY(-50%) scale(1)";
  }, 150);

   // Reset arrow back to cupid before shooting
  player.arrowEl.style.transition = "none";
  player.arrowEl.style.transform = "translate(40px, -50%)"; // back to cupid position

  // Arrow animation: shoot forward before settling
  const currentPercent = player.progress;
  const targetPercent = Math.min(100, currentPercent + 5);

  const arrow = player.arrowEl;
  arrow.style.transition = "transform 0.2s ease-out";
  arrow.style.transform = `translate(${Math.min(targetPercent + 5, 95)}%, -50%)`;
  
  // Small delay so reset is visible before shooting
  setTimeout(() => {
    // Pull back cupid slightly
    player.cupidEl.style.transition = "transform 0.15s ease";
    player.cupidEl.style.transform = "translateY(-50%) rotate(-5deg) scale(0.9)";

    setTimeout(() => {
      // Release bow
      player.cupidEl.style.transform = "translateY(-50%) rotate(0) scale(1)";

      // Shoot arrow forward
      const currentPercent = player.progress;
      const targetPercent = Math.min(100, currentPercent + 5);
      player.arrowEl.style.transition = "transform 0.25s ease-out";
      player.arrowEl.style.transform = `translate(${Math.min(targetPercent + 5, 95)}%, -50%)`;

      // Snap to actual progress after animation
      setTimeout(() => {
        setArrowProgress(player.arrowEl, targetPercent);
      }, 250);
    }, 150);
  }, 50);
}

    // Animate Cupid shot
    animateCupidShot(player);

    await update(ref(db, `players/${currentPlayerId}`), { progress: newProgress });

    if (newProgress >= 100) {
      const winnerSnap = await get(ref(db, "winner"));
      if (!winnerSnap.exists()) {
        await set(ref(db, "winner"), player.name);
      }
    }
  }
}




