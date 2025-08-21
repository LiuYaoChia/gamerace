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

// ====== Config ======
const STEP_PERCENT = 3;          // each valid shake adds this % to the group's progress
const SHAKE_COOLDOWN_MS = 500;   // throttle shakes per device

// ====== Cupid Variants (used per group) ======
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
  winnerExit: document.getElementById("winner-exit"),
  // phone-only UI
  phoneView: document.getElementById("phone-view"),
  phoneCupid: document.getElementById("phone-cupid"),
  phoneLabel: document.getElementById("phone-label")
};

let currentPlayerId = null;
let currentGroupId = null;
let lastShakeTime = 0;

// ====== Screen Helpers ======
function showSetup() {
  els.setupScreen && (els.setupScreen.style.display = "block");
  els.gameScreen && (els.gameScreen.style.display = "none");
  if (els.phoneView) els.phoneView.style.display = "none";
}
function showGame() {
  els.setupScreen && (els.setupScreen.style.display = "none");
  els.gameScreen && (els.gameScreen.style.display = "block");
  if (els.phoneView) els.phoneView.style.display = "none";
}
function showPhoneOnly() {
  // phone minimal view: only label (text) above the picture
  els.setupScreen && (els.setupScreen.style.display = "none");
  els.gameScreen && (els.gameScreen.style.display = "none");
  if (els.phoneView) els.phoneView.style.display = "block";
}

// ====== Ensure Groups 1–6 exist ======
for (let i = 1; i <= 6; i++) {
  const groupRef = ref(db, `groups/${i}`);
  get(groupRef).then(snap => {
    if (!snap.exists()) {
      set(groupRef, { name: i.toString(), members: {}, shakes: 0, progress: 0, cupidIndex: (i - 1) % cupidVariants.length });
    }
  });
}

// ====== Render Track (one cupid per group) & Rankings ======
function renderTrackAndRankings(groups) {
  if (!els.track || !els.rankList) return;

  els.track.innerHTML = "";
  els.rankList.innerHTML = "";

  // sort groups by progress desc for ranking list
  const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => (b.progress || 0) - (a.progress || 0));

  // Build lanes in group ID order (1..6) for consistent track layout
  Object.entries(groups).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([gid, group]) => {
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.dataset.groupId = gid;

    const cupidSrc = cupidVariants[group.cupidIndex ?? 0];

    lane.innerHTML = `
      <div class="lane-inner" style="position:relative;height:70px;">
        <span class="player-name" style="position:absolute;left:8px;top:6px;font-weight:bold;">Group ${group.name}</span>
        <img class="cupid" src="${cupidSrc}" style="height:50px;position:absolute;top:50%;transform:translateY(-50%);left:0%">
        <img class="goal" src="img/goal.png" style="height:50px;position:absolute;right:5px;top:50%;transform:translateY(-50%)">
        <span class="progress-label" style="position:absolute;top:-2px;right:10px;font-size:12px;font-weight:bold;color:#333">${Math.floor(group.progress || 0)}%</span>
      </div>
    `;

    // position cupid by progress
    const cupid = lane.querySelector(".cupid");
    cupid.style.left = `${Math.min(group.progress || 0, 95)}%`;

    els.track.appendChild(lane);
  });

  // Rankings
  sortedGroups.forEach(([gid, group], i) => {
    const li = document.createElement("li");
    li.textContent = `${i + 1}️⃣  Group ${group.name}: ${Math.floor(group.progress || 0)}%`;
    els.rankList.appendChild(li);
  });
}

// ====== Join (Add Player to Group) ======
els.form?.addEventListener("submit", async e => {
  e.preventDefault();
  const name = (els.nameInput?.value || "").trim();
  const groupId = els.groupSelect?.value || "";
  if (!name || !groupId) return;

  const groupRef = ref(db, `groups/${groupId}`);
  const groupSnap = await get(groupRef);
  if (!groupSnap.exists()) {
    // create on the fly if not present
    await set(groupRef, { name: groupId.toString(), members: {}, shakes: 0, progress: 0, cupidIndex: (Number(groupId) - 1) % cupidVariants.length });
  }

  // prevent duplicate names within the same group
  const members = (groupSnap.val()?.members) || {};
  if (Object.values(members).some(m => m?.name === name)) {
    alert("Name already taken in this group!");
    return;
  }

  currentPlayerId = Date.now().toString();
  currentGroupId = groupId;

  await update(groupRef, {
    [`members/${currentPlayerId}`]: { name }
  });

  els.nameInput.value = "";

  if (isPhone) {
    // Phone: show only picture and label; hide start button entirely
    const startBtn = document.getElementById("start-game");
    if (startBtn) startBtn.style.display = "none";
    showPhoneOnly();

    // keep phone UI label updated from GROUP progress
    onValue(groupRef, snap => {
      const group = snap.val() || {};
      updatePhoneView(group);
    });
  } else {
    // Desktop: show full UI for the whole game
    showGame();

    // update only this group's roster panel (left)
    onValue(groupRef, snap => {
      const g = snap.val() || {};
      if (els.playerList) {
        const memberList = Object.values(g.members || {}).map(m => `<li>${m.name}</li>`).join("");
        els.playerList.innerHTML = `<div class="group"><h3>Group ${g.name}</h3><ul>${memberList}</ul></div>`;
      }
    });
  }
});

// ====== Reset All (desktop host) ======
els.resetBtn?.addEventListener("click", async () => {
  if (!confirm("Reset ALL groups and players?")) return;
  for (let i = 1; i <= 6; i++) {
    await set(ref(db, `groups/${i}`), { name: i.toString(), members: {}, shakes: 0, progress: 0, cupidIndex: (i - 1) % cupidVariants.length });
  }
  await remove(ref(db, "winner"));
  await set(ref(db, "gameState"), "lobby");
  currentPlayerId = null;
  showSetup();
});

// ====== Exit (leave current group) ======
els.exitBtn?.addEventListener("click", async () => {
  if (currentPlayerId && currentGroupId) {
    await remove(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`));
  }
  currentPlayerId = null;
  showSetup();
});

// ====== Motion / Shake Detection (phones tap to enable) ======
els.motionBtn?.addEventListener("click", () => {
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission().then(res => {
      if (res === "granted") window.addEventListener("devicemotion", handleMotion);
    }).catch(() => {});
  } else {
    // Android / older iOS (no permission prompt)
    window.addEventListener("devicemotion", handleMotion);
  }
});

function handleMotion(event) {
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;
  const strength = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
  if (strength > 15) {
    const now = Date.now();
    if (now - lastShakeTime > SHAKE_COOLDOWN_MS && currentGroupId) {
      lastShakeTime = now;
      addGroupShake(currentGroupId);
      animateCupidJump(currentGroupId);
    }
  }
}

async function addGroupShake(groupId) {
  const groupRef = ref(db, `groups/${groupId}`);
  const snap = await get(groupRef);
  if (!snap.exists()) return;
  const g = snap.val();
  const newShakes = (g.shakes || 0) + 1;
  const newProgress = Math.min(100, (g.progress || 0) + STEP_PERCENT);

  await update(groupRef, { shakes: newShakes, progress: newProgress });
  if (newProgress >= 100) {
    await set(ref(db, "winner"), g.name || groupId.toString());
  }
}

// ====== Cupid Jump Animation (both phone & desktop) ======
function animateCupidJump(groupId) {
  // desktop lane
  const lane = document.querySelector(`.lane[data-group-id="${groupId}"]`);
  if (lane) {
    const cupid = lane.querySelector(".cupid");
    if (cupid) {
      cupid.classList.add("jump");
      setTimeout(() => cupid.classList.remove("jump"), 600);
    }
  }
  // phone cupid
  if (els.phoneCupid && els.phoneView?.style.display === "block") {
    els.phoneCupid.classList.add("jump");
    setTimeout(() => els.phoneCupid.classList.remove("jump"), 600);
  }
}

// ====== Phone View: show label above picture ======
function updatePhoneView(group) {
  if (!els.phoneLabel || !els.phoneCupid) return;
  const progress = Math.floor(group.progress || 0);
  els.phoneLabel.textContent = `Group ${group.name}: ${progress}%`;
  // move phone cupid visually (if you have a track, else we just animate on shake)
  // You can also adjust left % if phone-view has a horizontal track.
}

// ====== Global Listeners ======
onValue(ref(db, "groups"), snap => {
  const groups = snap.val() || {};
  renderTrackAndRankings(groups);

  // also update lane cupid positions on desktop
  Object.entries(groups).forEach(([gid, g]) => {
    const lane = document.querySelector(`.lane[data-group-id="${gid}"]`);
    const cupid = lane?.querySelector(".cupid");
    const label = lane?.querySelector(".progress-label");
    if (cupid) cupid.style.left = `${Math.min(g.progress || 0, 95)}%`;
    if (label) label.textContent = `${Math.floor(g.progress || 0)}%`;
  });
});

onValue(ref(db, "gameState"), snap => {
  const state = snap.val() || "lobby";
  if (isPhone) {
    // phones stay in phone-only UI once joined
    if (currentGroupId) showPhoneOnly();
    else showSetup();
  } else {
    state === "lobby" ? showSetup() : showGame();
  }
});

onValue(ref(db, "winner"), snap => {
  const name = snap.val();
  if (els.winnerPopup && els.winnerMsg) {
    if (name) {
      els.winnerMsg.textContent = `🏆 Winner: Group ${name}!`;
      els.winnerPopup.style.display = "flex";
    } else {
      els.winnerPopup.style.display = "none";
    }
  }
});

els.winnerExit?.addEventListener("click", async () => {
  await remove(ref(db, "winner"));
  await set(ref(db, "gameState"), "lobby");
});

// ====== Start Game (password-protected on desktop) ======
function startGame() {
  set(ref(db, "gameState"), "playing");
}

if (isPhone) {
  // hide start button on phones
  if (els.startBtn) els.startBtn.style.display = "none";
} else {
  els.startBtn?.addEventListener("click", async () => {
    const password = prompt("請輸入管理密碼才能開始遊戲:");
    if (password === "1234") { // TODO: change to a secure secret in production
      startGame();
    } else {
      alert("密碼錯誤，無法開始遊戲！");
    }
  });
}
