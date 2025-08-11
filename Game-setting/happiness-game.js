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
const exitButton = document.getElementById("exit-game");
const resetButton = document.getElementById("reset-players");

// NEW: Create and add the "Enable Motion Sensors" button dynamically
const enableMotionBtn = document.getElementById("enable-motion");

// Debug log on screen
function logToScreen(message) {
  let debugBox = document.getElementById("debug-log");
  if (!debugBox) {
    debugBox = document.createElement("div");
    debugBox.id = "debug-log";
    debugBox.style.position = "fixed";
    debugBox.style.bottom = "10px";
    debugBox.style.left = "10px";
    debugBox.style.background = "rgba(0,0,0,0.7)";
    debugBox.style.color = "white";
    debugBox.style.padding = "10px";
    debugBox.style.zIndex = "9999";
    debugBox.style.fontSize = "14px";
    debugBox.style.maxWidth = "90vw";
    debugBox.style.maxHeight = "150px";
    debugBox.style.overflowY = "auto";
    document.body.appendChild(debugBox);
  }
  debugBox.textContent = message;
}

let players = [];
let currentPlayerId = null;
let lastShake = 0;

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

// Reset players
resetButton.addEventListener("click", async () => {
  if (confirm("Are you sure you want to reset all players?")) {
    await set(ref(db, "players"), null); // This clears all player entries
    playerList.innerHTML = "";
    rankList.innerHTML = "";
    track.innerHTML = "";
    currentPlayerId = null;
    playerInput.value = "";
    startButton.disabled = true;
    document.querySelector(".game-container").style.display = "none";
    document.getElementById("player-setup").style.display = "block";
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

// Render track with boats styled nicely
function renderTrack() {
  track.innerHTML = "";
  players.forEach((p) => {
    let lane = document.getElementById(`player${p.id}`);
    if (!lane) {
      lane = document.createElement("div");
      lane.className = "lane";
      lane.id = `player${p.id}`;
      lane.style.position = "relative";
      lane.style.height = "40px";
      lane.style.marginBottom = "8px";
      lane.style.background = "#e0f7fa";
      lane.style.borderRadius = "6px";
      lane.style.overflow = "hidden";

      const boat = document.createElement("span");
      boat.textContent = `🚤 ${p.name}`;
      boat.style.position = "absolute";
      boat.style.left = "0";
      boat.style.top = "50%";
      boat.style.transform = "translateY(-50%)"; // vertically center initially
      boat.style.transition = "transform 0.3s ease"; // smooth movement
      lane.appendChild(boat);

      track.appendChild(lane);
    }
    updateBoatProgress(`player${p.id}`, p.progress);
  });
}

// Update the boat's horizontal progress with vertical centering
function updateBoatProgress(playerId, percent) {
  const lane = document.getElementById(playerId);
  if (!lane) return;
  const span = lane.querySelector("span");
  // Move boat horizontally by percent%, keep vertical centered (-50%)
  span.style.transform = `translate(${Math.min(percent, 100)}%, -50%)`;
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

// Shake detection handler
function handleShake(e) {
  const acc = e.accelerationIncludingGravity;
  if (!acc) return;

  const now = Date.now();
  const magnitude = Math.abs(acc.x) + Math.abs(acc.y) + Math.abs(acc.z);

  if (magnitude > 18 && now - lastShake > 1000) {
    lastShake = now;
    logToScreen(`Shake detected! Magnitude: ${magnitude.toFixed(2)}`);
    onShake();
  }
}

// Enable motion sensors on button click (iOS permission)
enableMotionBtn.addEventListener("click", () => {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === "granted") {
          logToScreen("Motion permission granted.");
          window.addEventListener("devicemotion", handleShake);
          enableMotionBtn.style.display = "none"; // hide button after granted
        } else {
          alert("Motion permission denied.");
        }
      })
      .catch(err => {
        console.error("Permission error:", err);
        alert("Motion permission error. See console.");
      });
  } else {
    // Non iOS or permission not required
    window.addEventListener("devicemotion", handleShake);
    logToScreen("Motion access granted or not needed.");
    enableMotionBtn.style.display = "none"; // hide button anyway
  }
});

// Simulate shake by pressing 's' (for desktop testing)
document.addEventListener("keydown", (e) => {
  if ((e.key || "").toLowerCase() === "s") {
    logToScreen("Simulated shake (keyboard)");
    onShake();
  }
});

// On shake, increase progress and update Firebase
async function onShake() {
  if (!currentPlayerId) return;

  const player = players.find(p => p.id === currentPlayerId);
  if (player && player.progress < 100) {
    const newProgress = Math.min(100, player.progress + 5);
    await update(ref(db, `players/${currentPlayerId}`), { progress: newProgress });
  }
}


// Exit game button
exitButton.addEventListener("click", async () => {
  if (currentPlayerId) {
    // Optional: Remove player from Firebase
    await set(ref(db, `players/${currentPlayerId}`), null);
  }

  // Reset UI
  document.querySelector(".game-container").style.display = "none";
  document.getElementById("player-setup").style.display = "block";
  playerInput.value = "";
  startButton.disabled = true;
  currentPlayerId = null;
});
