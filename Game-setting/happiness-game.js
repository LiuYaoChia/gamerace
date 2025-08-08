import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// Firebase config
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

// DOM Elements
const playerForm = document.getElementById("name-form");
const playerInput = document.getElementById("player-name");
const playerList = document.getElementById("player-list");
const startButton = document.getElementById("start-game");
const track = document.getElementById("track");
const rankList = document.getElementById("ranking-list");

let players = [];
let currentPlayerId = null;

// Handle player joining
playerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = playerInput.value.trim();
  if (name) {
    currentPlayerId = Date.now().toString(); // unique ID per session
    const playerData = { name, progress: 0 };
    await set(ref(db, `players/${currentPlayerId}`), playerData);
    playerInput.value = "";
    startButton.disabled = false;
  }
});

// Firebase listener
onValue(ref(db, "players"), (snapshot) => {
  const data = snapshot.val() || {};
  players = Object.entries(data).map(([id, val]) => ({ id, ...val }));
  updatePlayerList();
  renderTrack();
  updateRankings();
});

function updatePlayerList() {
  playerList.innerHTML = "";
  players.forEach((p, i) => {
    const li = document.createElement("li");
    li.textContent = `Player ${i + 1}: ${p.name}`;
    playerList.appendChild(li);
  });
}

startButton.addEventListener("click", () => {
  document.getElementById("player-setup").style.display = "none";
  document.querySelector(".game-container").style.display = "block";
});

// Render track
function renderTrack() {
  track.innerHTML = "";
  players.forEach((p) => {
    let lane = document.getElementById(`player${p.id}`);
    if (!lane) {
      lane = document.createElement("div");
      lane.className = "lane";
      lane.id = `player${p.id}`;
      const boat = document.createElement("span");
      boat.textContent = `🚤 ${p.name}`;
      lane.appendChild(boat);
      track.appendChild(lane);
    }
    updateBoatProgress(`player${p.id}`, p.progress);
  });
}

function updateBoatProgress(playerId, percent) {
  const lane = document.getElementById(playerId);
  if (!lane) return;
  const span = lane.querySelector("span");
  span.style.transform = `translateX(${Math.min(percent, 100)}%)`;
}

// Update rankings
function updateRankings() {
  const sorted = [...players].sort((a, b) => b.progress - a.progress);
  rankList.innerHTML = "";
  sorted.forEach((p, i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}️⃣ ${p.name} - ${Math.floor(p.progress)}%`;
    rankList.appendChild(li);
  });
}

// Shake Detection
let lastShake = 0;

function handleShake(e) {
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;

  const now = Date.now();
  const magnitude = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);

  if (magnitude > 18 && now - lastShake > 1000) {
    lastShake = now;
    console.log("Shake detected!", magnitude);
    onShake();
  }
}

// Request permission on iOS
if (typeof DeviceMotionEvent.requestPermission === 'function') {
  // iOS
  DeviceMotionEvent.requestPermission()
    .then((permissionState) => {
      if (permissionState === 'granted') {
        console.log("DeviceMotion permission granted");
        window.addEventListener("devicemotion", handleShake);
      } else {
        alert("Device motion permission denied. Please enable it in settings.");
      }
    })
    .catch((err) => {
      console.error("Permission error:", err);
    });
} else {
  // Android / Others
  window.addEventListener("devicemotion", handleShake);
}

// Simulate shake by pressing 's' key (for testing on desktop)
document.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "s") {
    console.log("Simulated shake with keyboard");
    onShake();
  }
});

// On shake, update progress
async function onShake() {
  if (!currentPlayerId) return;

  const player = players.find(p => p.id === currentPlayerId);
  if (player && player.progress < 100) {
    const newProgress = Math.min(100, player.progress + 5);
    await update(ref(db, `players/${currentPlayerId}`), { progress: newProgress });
  }
}
