// ====== Firebase Setup ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCK4uNQlQwXk4LS9ZYB6_pkbZbrd1kj-vA",
  authDomain: "happiness-game-e6bf1.firebaseapp.com",
  databaseURL: "https://happiness-game-e6bf1-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "happiness-game-e6bf1",
  storageBucket: "happiness-game-e6bf1.appspot.com",
  messagingSenderId: "714276517910",
  appId: "1:714276517910:web:3fe25271b371e639fb1d37",
  measurementId: "G-3JL827HV8Q"
};

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
};

// ====== State ======
let players = [];
let currentPlayerId = null;
let lastShake = 0;

// ====== UI Helpers ======
function logToScreen(msg) {
  let box = document.getElementById("debug-log");
  if (!box) {
    box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed", bottom: "10px", left: "10px",
      background: "rgba(0,0,0,0.7)", color: "white",
      padding: "10px", zIndex: "9999", fontSize: "14px",
      maxWidth: "90vw", maxHeight: "150px", overflowY: "auto"
    });
    box.id = "debug-log";
    document.body.appendChild(box);
  }
  box.textContent = msg;
}

function showSetup() {
  els.setupScreen.style.display = "block";
  els.gameScreen.style.display = "none";
}

function showGame() {
  els.setupScreen.style.display = "none";
  els.gameScreen.style.display = "block";
}

function updatePlayerList() {
  els.playerList.innerHTML = players
    .map((p, i) => `<li>Player ${i + 1}: ${p.name}</li>`)
    .join("");
}

function updateTrack() {
  els.track.innerHTML = "";
  players.forEach((p) => {
    const lane = document.createElement("div");
    lane.className = "lane";
    Object.assign(lane.style, {
      position: "relative", height: "40px", marginBottom: "8px",
      background: "#e0f7fa", borderRadius: "6px", overflow: "hidden"
    });

    const boat = document.createElement("span");
    boat.textContent = `🚤 ${p.name}`;
    Object.assign(boat.style, {
      position: "absolute", top: "50%", left: "0",
      transform: "translateY(-50%)", transition: "transform 0.3s ease"
    });
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
    logToScreen(`Shake detected! Magnitude: ${magnitude.toFixed(2)}`);
    increaseProgress();
  }
}

async function increaseProgress() {
  if (!currentPlayerId) return;
  const player = players.find(p => p.id === currentPlayerId);
  if (player && player.progress < 100) {
    const newProgress = Math.min(100, player.progress + 5);
    await update(ref(db, `players/${currentPlayerId}`), { progress: newProgress });
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
  await set(ref(db, "gameState"), "race");
});

els.exitBtn.addEventListener("click", async () => {
  if (currentPlayerId) {
    await set(ref(db, `players/${currentPlayerId}`), null);
  }
  currentPlayerId = null;
  els.startBtn.disabled = true;
  showSetup();
});

els.motionBtn.addEventListener("click", () => {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission()
      .then((state) => {
        if (state === "granted") {
          window.addEventListener("devicemotion", handleShakeEvent);
          els.motionBtn.style.display = "none";
        } else {
          alert("Motion permission denied.");
        }
      })
      .catch(console.error);
  } else {
    window.addEventListener("devicemotion", handleShakeEvent);
    els.motionBtn.style.display = "none";
  }
});

document.addEventListener("keydown", (e) => {
  if ((e.key || "").toLowerCase() === "s") {
    logToScreen("Simulated shake");
    increaseProgress();
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
