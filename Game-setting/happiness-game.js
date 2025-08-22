// ====== Firebase Setup ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue, get, remove, update, runTransaction, serverTimestamp, onDisconnect } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ====== Game Config ======
const STEP_PERCENT       = 3;     // % added to group progress per valid shake
const SHAKE_COOLDOWN_MS  = 500;   // throttle per device
const SHAKE_THRESHOLD    = 15;    // motion strength threshold

// ====== Group Avatars (one cupid per group) ======
const cupidVariants = [
  "img/groom1.png",
  "img/groom2.png",
  "img/groom3.png",
  "img/groom4.png",
  "img/groom5.png",
  "img/groom6.png",
  "img/groom7.png"
];

// ====== DOM Refs ======
const els = {
  form:        document.getElementById("name-form"),
  nameInput:   document.getElementById("player-name"),
  groupSelect: document.getElementById("group-select"),
  playerList:  document.getElementById("player-list"),
  startBtn:    document.getElementById("start-game"),
  resetBtn:    document.getElementById("reset-players"),
  exitBtn:     document.getElementById("exit-game"),
  motionBtn:   document.getElementById("enable-motion"),
  setupScreen: document.getElementById("player-setup"),
  gameScreen:  document.querySelector(".game-container"),
  track:       document.getElementById("track"),
  rankList:    document.getElementById("ranking-list"),
  winnerPopup: document.getElementById("winner-popup"),
  winnerMsg:   document.getElementById("winner-message"),
  winnerExit:  document.getElementById("winner-exit"),
  phoneView:   document.getElementById("phone-view"),
  phoneCupid:  document.getElementById("phone-cupid"),
  phoneLabel:  document.getElementById("phone-label"),
};

let currentPlayerId = null;   // == auth.uid
let currentGroupId  = null;
let lastShakeTime   = 0;

// ====== UI helpers ======
function showSetup() {
  if (els.setupScreen) els.setupScreen.style.display = "block";
  if (els.gameScreen)  els.gameScreen.style.display  = "none";
  if (els.phoneView)   els.phoneView.style.display   = "none";
}
function showGame() {
  if (els.setupScreen) els.setupScreen.style.display = "none";
  if (els.gameScreen)  els.gameScreen.style.display  = "block";
  if (els.phoneView)   els.phoneView.style.display   = "none";
}
function showPhoneOnly() {
  if (els.setupScreen) els.setupScreen.style.display = "none";
  if (els.gameScreen)  els.gameScreen.style.display  = "none";
  if (els.phoneView)   els.phoneView.style.display   = "block";
}

// ====== Ensure Groups 1–6 exist (idempotent) ======
async function ensureGroups() {
  for (let i = 1; i <= 6; i++) {
    const gRef = ref(db, `groups/${i}`);
    const snap = await get(gRef);
    if (!snap.exists()) {
      await set(gRef, {
        name: i.toString(),
        members: {},
        shakes: 0,
        progress: 0,
        cupidIndex: (i - 1) % cupidVariants.length
      });
    }
  }
}

// ====== Render Track & Rankings (desktop) ======
function renderTrackAndRankings(groups) {
  if (!els.track || !els.rankList) return;

  els.track.innerHTML = "";
  els.rankList.innerHTML = "";

  // Fixed order lanes by group id
  Object.entries(groups).sort((a,b) => Number(a[0]) - Number(b[0])).forEach(([gid, group]) => {
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.dataset.groupId = gid;

    const cupidSrc = cupidVariants[group.cupidIndex ?? 0];

    lane.innerHTML = `
      <div class="lane-inner" style="position:relative;height:70px;">
        <span class="player-name" style="position:absolute;left:8px;top:6px;font-weight:bold;">Group ${group.name}</span>
        <img class="cupid" src="${cupidSrc}" style="height:50px;position:absolute;top:50%;transform:translateY(-50%);left:0%">
        <img class="goal" src="img/goal.png" style="height:50px;position:absolute;right:5px;top:50%;transform:translateY(-50%)">
        <span class="progress-label" style="position:absolute;top:-2px;right:10px;font-size:12px;font-weight:bold;color:#333">${Math.floor(group.progress||0)}%</span>
      </div>`;
    const cupid = lane.querySelector(".cupid");
    cupid.style.left = `${Math.min(group.progress || 0, 95)}%`;
    els.track.appendChild(lane);
  });

  // Rankings by progress desc
  Object.entries(groups)
    .sort(([,a],[,b]) => (b.progress||0) - (a.progress||0))
    .forEach(([gid, group], idx) => {
      const li = document.createElement("li");
      li.textContent = `${idx+1}️⃣ Group ${group.name}: ${Math.floor(group.progress||0)}%`;
      els.rankList.appendChild(li);
    });
}

// ====== Phone view label ======
function updatePhoneView(group) {
  if (!els.phoneLabel || !els.phoneCupid) return;
  const progress = Math.floor(group.progress || 0);
  els.phoneLabel.textContent = `Group ${group.name}: ${progress}%`;
}

// ====== Anonymous Auth ======
signInAnonymously(auth).catch(err => console.error("Anonymous sign-in failed:", err));
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentPlayerId = user.uid;
    // optional: attach disconnect cleanup if user has joined
    // (we attach after join because we need currentGroupId)
  }
});

// ====== Join Group ======
els.form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name    = (els.nameInput?.value || "").trim();
  const groupId = els.groupSelect?.value || "";
  if (!name || !groupId) return;

  // ensure group exists
  const groupRef = ref(db, `groups/${groupId}`);
  const snap = await get(groupRef);
  if (!snap.exists()) {
    await set(groupRef, {
      name: groupId.toString(),
      members: {},
      shakes: 0,
      progress: 0,
      cupidIndex: (Number(groupId)-1) % cupidVariants.length
    });
  }
  const group = (await get(groupRef)).val();

  // prevent duplicate names in same group
  const members = group.members || {};
  if (Object.values(members).some(m => m?.name === name)) {
    alert("Name already taken in this group!");
    return;
  }

  currentGroupId = groupId;

  // Add/Update member using auth.uid
  await update(groupRef, {
    [`members/${currentPlayerId}`]: { name, joinedAt: Date.now() }
  });

  // Clean up membership if this client disconnects
  try {
    onDisconnect(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`)).remove();
  } catch (_) {}

  els.nameInput.value = "";

  if (isPhone) {
    // Phone: minimal view
    if (els.startBtn) els.startBtn.style.display = "none";
    showPhoneOnly();
    // keep phone UI updated from GROUP progress
    onValue(groupRef, s => {
      const g = s.val() || {};
      updatePhoneView(g);
    });
  } else {
    // Desktop host: show full UI and roster for this group on the left
    showGame();
    onValue(groupRef, s => {
      const g = s.val() || {};
      if (els.playerList) {
        const list = Object.values(g.members || {}).map(m => `<li>${m.name}</li>`).join("");
        els.playerList.innerHTML = `<div class="group"><h3>Group ${g.name}</h3><ul>${list}</ul></div>`;
      }
    });
  }
});

// ====== Shake Handling ======
els.motionBtn?.addEventListener("click", () => {
  if (typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission().then(res => {
      if (res === "granted") window.addEventListener("devicemotion", handleMotion);
    }).catch(() => {});
  } else {
    window.addEventListener("devicemotion", handleMotion);
  }
});

function handleMotion(event) {
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;
  const strength = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2);
  if (strength > SHAKE_THRESHOLD && currentGroupId) {
    const now = Date.now();
    if (now - lastShakeTime > SHAKE_COOLDOWN_MS) {
      lastShakeTime = now;
      addGroupShakeTx(currentGroupId);
      animateCupidJump(currentGroupId);
    }
  }
}

// Use transaction to avoid race conditions across many devices
function addGroupShakeTx(groupId) {
  const groupRef = ref(db, `groups/${groupId}`);
  runTransaction(groupRef, (g) => {
    if (!g) return g;
    const shakes   = (g.shakes || 0) + 1;
    const progress = Math.min(100, (g.progress || 0) + STEP_PERCENT);
    return { ...g, shakes, progress };
  }).then(async (res) => {
    const g = res.snapshot?.val();
    if (g && g.progress >= 100) {
      await set(ref(db, "winner"), g.name || groupId.toString());
    }
  }).catch((err) => {
    console.error("Transaction failed:", err);
  });
}

// ====== Little animation on shake ======
function animateCupidJump(groupId) {
  const lane  = document.querySelector(`.lane[data-group-id="${groupId}"]`);
  const cupid = lane?.querySelector(".cupid");
  if (cupid) {
    cupid.classList.add("jump");
    setTimeout(() => cupid.classList.remove("jump"), 600);
  }
  if (els.phoneCupid && els.phoneView?.style.display === "block") {
    els.phoneCupid.classList.add("jump");
    setTimeout(() => els.phoneCupid.classList.remove("jump"), 600);
  }
}

// ====== Global Listeners ======
onValue(ref(db, "groups"), snap => {
  const groups = snap.val() || {};
  // Desktop renders the board
  if (!isPhone) {
    renderTrackAndRankings(groups);
    // keep cupid positions synced
    Object.entries(groups).forEach(([gid, g]) => {
      const lane  = document.querySelector(`.lane[data-group-id="${gid}"]`);
      const cupid = lane?.querySelector(".cupid");
      const label = lane?.querySelector(".progress-label");
      if (cupid) cupid.style.left = `${Math.min(g.progress || 0, 95)}%`;
      if (label) label.textContent = `${Math.floor(g.progress || 0)}%`;
    });
  }
});

onValue(ref(db, "gameState"), snap => {
  const state = snap.val() || "lobby";
  if (isPhone) {
    if (currentGroupId) showPhoneOnly();
    else showSetup();
  } else {
    state === "lobby" ? showSetup() : showGame();
  }
});

// === Winner Listener ===
import { get, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

onValue(ref(db, "winner"), async (snap) => {
  const winnerGroupId = snap.val();
  if (!els.winnerPopup || !els.winnerMsg) return;

  if (winnerGroupId) {
    els.winnerMsg.textContent = `🏆 Winner: Group ${winnerGroupId}!`;

    // 🔹 Get group info to pick its cupid
    try {
      const groupSnap = await get(ref(db, `groups/${winnerGroupId}`));
      const group = groupSnap.val() || {};
      const cupidIndex = group.cupidIndex || 0;
      const cupidSrc = cupidVariants[cupidIndex];

      // 🔹 Update winner scene images
      const winnerCupid = document.getElementById("winner-cupid");
      const winnerGoal  = document.getElementById("winner-goal");

      if (winnerCupid) {
        winnerCupid.src = cupidSrc;

        // reset animation if re-triggered
        winnerCupid.classList.remove("land");
        void winnerCupid.offsetWidth; // force reflow
        winnerCupid.classList.add("land");
      }
      if (winnerGoal) {
        winnerGoal.src = "img/goal.png";
      }

      // show popup
      els.winnerPopup.style.display = "flex";

    } catch (err) {
      console.error("Error fetching winner group:", err);
    }

  } else {
    els.winnerPopup.style.display = "none";
  }
});


els.winnerExit?.addEventListener("click", async () => {
  await remove(ref(db, "winner"));
  await set(ref(db, "gameState"), "lobby");
});

// ====== Start / Reset / Exit ======
function startGame() {
  set(ref(db, "gameState"), "playing");
}

if (isPhone) {
  if (els.startBtn) els.startBtn.style.display = "none";
} else {
  els.startBtn?.addEventListener("click", () => {
    const password = prompt("請輸入管理密碼才能開始遊戲:");
    if (password === "1234") startGame();
    else alert("密碼錯誤，無法開始遊戲！");
  });
}

els.resetBtn?.addEventListener("click", async () => {
  if (!confirm("Reset ALL groups and players?")) return;
  await ensureGroups(); // creates if missing
  for (let i = 1; i <= 6; i++) {
    await update(ref(db, `groups/${i}`), { shakes: 0, progress: 0, members: {} });
  }
  await remove(ref(db, "winner"));
  await set(ref(db, "gameState"), "lobby");
  currentGroupId = null;
  showSetup();
});

els.exitBtn?.addEventListener("click", async () => {
  if (currentPlayerId && currentGroupId) {
    await remove(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`));
  }
  currentGroupId = null;
  showSetup();
});

// ====== Boot ======
ensureGroups().then(() => {
  // Default to setup screen until gameState says otherwise
  showSetup();
});


