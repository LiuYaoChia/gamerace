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
  els.track.innerHTML = "";
  players.forEach((p) => {
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.style.cssText = "position:relative;height:40px;margin-bottom:8px;background:#e0f7fa;border-radius:6px;overflow:hidden";
    const boat = document.createElement("span");
    boat.textContent = `🚤 ${p.name}`;
    boat.style.cssText = "position:absolute;top:50%;left:0;transform:translateY(-50%);transition:transform 0.3s ease";
    lane.appendChild(boat);
    els.track.appendChild(lane);
    setBoatProgress(boat, p.progress);
  });
}
function setBoatProgress(boatEl, percent) {
  boatEl.style.transform = `translate(${Math.min(percent, 100)}%, -50%)`;
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
  if (magnitude > 18 && now - lastShake > 1000) {
    lastShake = now;
    increaseProgress();
  }
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
