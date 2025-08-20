// ====== Firebase Setup ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, remove, update } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCK4uNQlQwXk4LS9ZYB6_pkbZbrd1kj-vA",
  authDomain: "happiness-game-e6bf1.firebaseapp.com",
  databaseURL: "https://happiness-game-e6bf1-default-rtdb.asia-southeast1.firebasedatabase.app/", 
  projectId: "happiness-game-e6bf1",
  storageBucket: "happiness-game-e6bf1.firebasestorage.app",
  messagingSenderId: "714276517910",
  appId: "1:714276517910:web:3fe25271b371e639fb1d37",
  measurementId: "G-3JL827HV8Q"
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ====== Cupid Variants ======
const cupidVariants = [
  "images/cupid-redbow.png",
  "images/cupid-bluebow.png",
  "images/cupid-goldbow.png"
];

// ====== DOM Refs ======
const els = {
  form: document.getElementById("name-form"),
  nameInput: document.getElementById("player-name"),
  groupSelect: document.getElementById("group-select"),
  playerList: document.getElementById("player-list"),
  startBtn: document.getElementById("start-game"),
  resetBtn: document.getElementById("reset-players"),
  exitBtn: document.getElementById("exit-game"),
  motionBtn: document.getElementById("enable-motion"),
  setupScreen: document.getElementById("player-setup"),
  gameScreen: document.querySelector(".game-container"),
  track: document.getElementById("track"),
  rankList: document.getElementById("ranking-list"),
  winnerPopup: document.getElementById("winner-popup"),
  winnerMsg: document.getElementById("winner-message"),
  winnerExit: document.getElementById("winner-exit")
};

let players = [];
let currentPlayerId = null;
let currentGroupId = null;

// ====== Screen Helpers ======
function showSetup() {
  els.setupScreen.style.display = "block";
  els.gameScreen.style.display = "none";
}
function showGame() {
  els.setupScreen.style.display = "none";
  els.gameScreen.style.display = "block";
}

// ====== Init Groups (1–6) ======
for (let i = 1; i <= 6; i++) {
  set(ref(db, `groups/${i}`), { name: i.toString(), players: {} });
}

// ====== Track & Rankings (Grouped) ======
function updateTrackAndRankings(allGroups) {
  els.track.innerHTML = "";
  els.rankList.innerHTML = "";

  Object.entries(allGroups).forEach(([gid, group]) => {
    const groupPlayers = Object.entries(group.players || {}).map(([id, p]) => ({ id, ...p }));
    const groupTrack = document.createElement("div");
    groupTrack.className = "group-track";
    groupTrack.innerHTML = `<h3 style="margin:5px 0;">Group ${group.name}</h3>`;
    
    const trackLanes = document.createElement("div");
    trackLanes.className = "track-lanes";
    groupTrack.appendChild(trackLanes);

    const sorted = [...groupPlayers].sort((a, b) => b.progress - a.progress);
    sorted.forEach(p => {
      let lane = document.createElement("div");
      lane.className = "lane";
      lane.dataset.playerId = p.id;
      lane.innerHTML = `
        <img class="cupid" src="${cupidVariants[p.cupidIndex]}" style="height:50px;position:absolute;top:50%;transform:translateY(-50%)">
        <img class="goal" src="img/goal.png" style="height:50px;position:absolute;right:5px;top:50%;transform:translateY(-50%)">
        <span class="player-name" style="position:absolute;right:10px;font-weight:bold">${p.name}</span>
      `;
      trackLanes.appendChild(lane);

      const cupid = lane.querySelector(".cupid");
      cupid.style.left = `${Math.min(p.progress, 95)}%`;

      let lbl = lane.querySelector(".progress-label");
      if (!lbl) {
        lbl = document.createElement("span");
        lbl.className = "progress-label";
        lbl.style.cssText = "position:absolute;top:-20px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:bold;color:#333";
        lane.appendChild(lbl);
      }
      lbl.textContent = `${Math.floor(p.progress)}%`;
    });

    els.track.appendChild(groupTrack);

    const groupRank = document.createElement("li");
    groupRank.innerHTML = `
      <strong>${group.name} Rankings:</strong>
      <ul>${sorted.map((p, i) => `<li>${i + 1}️⃣ ${p.name} - ${Math.floor(p.progress)}%</li>`).join("")}</ul>
    `;
    els.rankList.appendChild(groupRank);
  });
}

// ====== Form: Join Player ======
els.form.addEventListener("submit", async e => {
  e.preventDefault();
  const name = els.nameInput.value.trim();
  const groupId = els.groupSelect.value;
  if (!name || !groupId) return;

  const snap = await get(ref(db, `groups/${groupId}/players`));
  if (Object.values(snap.val() || {}).some(p => p.name === name)) {
    alert("Name already taken in this group!");
    return;
  }

  currentPlayerId = Date.now().toString();
  currentGroupId = groupId;
  const cupidIndex = Math.floor(Math.random() * cupidVariants.length);

  await set(ref(db, `groups/${groupId}/players/${currentPlayerId}`), {
    name,
    progress: 0,
    cupidIndex
  });

  els.nameInput.value = "";
  els.startBtn.disabled = false;
  
  if (isPhone) {
    // 👉 Phone only: minimal UI
    document.getElementById("player-setup").style.display = "none";
    document.querySelector(".game-container").style.display = "none";
    document.getElementById("phone-view").style.display = "block";

    onValue(ref(db, `groups/${groupId}/players/${currentPlayerId}`), snap => {
      if (snap.exists()) updatePhoneView({ id: currentPlayerId, ...snap.val() });
    });
  }
});

// ====== Reset All ======
els.resetBtn.addEventListener("click", async () => {
  if (!confirm("Reset all players?")) return;
  for (let i = 1; i <= 6; i++) await set(ref(db, `groups/${i}/players`), {});
  await set(ref(db, "gameState"), "lobby");
  players = [];
  currentPlayerId = null;
  els.startBtn.disabled = true;
  showSetup();
});

// ====== Exit Game ======
els.exitBtn.addEventListener("click", async () => {
  if (currentPlayerId && currentGroupId) await remove(ref(db, `groups/${currentGroupId}/players/${currentPlayerId}`));
  currentPlayerId = null;
  els.startBtn.disabled = true;
  els.nameInput.removeAttribute("readonly");
  showSetup();
});

// ====== Motion / Shake Detection ======
let lastShakeTime = 0;
els.motionBtn.addEventListener("click", () => {
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission().then(res => {
      if (res === "granted") window.addEventListener("devicemotion", handleMotion);
    });
  } else {
    window.addEventListener("devicemotion", handleMotion);
  }
});

function handleMotion(event) {
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;
  const strength = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
  if (strength > 20) {
    const now = Date.now();
    if (now - lastShakeTime > 500 && currentPlayerId && currentGroupId) {
      lastShakeTime = now;
      updateProgress();
      animateCupidJump();
    }
  }
}

async function updateProgress() {
  if (!currentPlayerId || !currentGroupId) return;
  const playerRef = ref(db, `groups/${currentGroupId}/players/${currentPlayerId}`);
  const snap = await get(playerRef);
  if (snap.exists()) {
    let p = snap.val();
    if (p.progress >= 100) return;
    p.progress = Math.min(100, p.progress + 5);
    await set(playerRef, p);
    if (p.progress >= 100) await set(ref(db, "winner"), p.name);
  }
}

// ====== Cupid Jump Animation ======
function animateCupidJump() {
  const lane = document.querySelector(`.lane[data-player-id="${currentPlayerId}"]`);
  if (!lane) return;
  const cupid = lane.querySelector(".cupid");
  const me = players[currentPlayerId];
  if (!me || me.progress >= 100) return;
  cupid.classList.add("jump");
  setTimeout(() => cupid.classList.remove("jump"), 600);
}

// ====== Firebase Listeners ======
// ✅ new: only listen to the group you joined
onValue(ref(db, `groups/${currentGroupId}`), snap => {
  const group = snap.val() || {};
  els.playerList.innerHTML = `
    <div class="group">
      <h3>${group.name}</h3>
      <ul>${Object.values(group.players || {}).map(p => `<li>${p.name}</li>`).join("")}</ul>
    </div>
  `;
  updateTrackAndRankings({ [currentGroupId]: group });
});


onValue(ref(db, "gameState"), snap => {
  (snap.val() || "lobby") === "lobby" ? showSetup() : showGame();
});

onValue(ref(db, "winner"), snap => {
  const name = snap.val();
  if (name) {
    els.winnerMsg.textContent = `🏆 Winner: ${name}!`;
    els.winnerPopup.style.display = "flex";
  } else {
    els.winnerPopup.style.display = "none";
  }
});

els.winnerExit.addEventListener("click", async () => {
  await set(ref(db, "winner"), null);
  await set(ref(db, "gameState"), "lobby");
  if (currentPlayerId && currentGroupId) await remove(ref(db, `groups/${currentGroupId}/players/${currentPlayerId}`));
  currentPlayerId = null;
  showSetup();
});

// ====== Phone label update ======
function updatePhoneView(player) {
  if (!isPhone || player.id !== currentPlayerId) return;
  const cupid = document.getElementById("phone-cupid");
  const label = document.getElementById("phone-label");
  if (!cupid || !label) return;
  label.textContent = `${player.name}: ${Math.floor(player.progress)}%`;
  if (player.progress < 100) {
    cupid.classList.remove("jump");
    void cupid.offsetWidth;
    cupid.classList.add("jump");
  }
}

// ====== Start Game (password-protected on computer) ======
function startGame() {
  set(ref(db, "gameState"), "playing");
}

if (isPhone) {
  const startBtn = document.getElementById("start-game");
  if (startBtn) startBtn.style.display = "none";
} else {
  els.startBtn.addEventListener("click", async () => {
    const password = prompt("請輸入管理密碼才能開始遊戲:");
    if (password === "1234") {
      startGame();
    } else {
      alert("密碼錯誤，無法開始遊戲！");
    }
  });
}
