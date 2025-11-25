// ====== Firebase Setup ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getDatabase, ref, set, onValue, get, push, remove, update, runTransaction, onDisconnect 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isHost = !isPhone; // desktop can be host

// ====== Config ======
const STEP_PERCENT       = 3;
const SHAKE_COOLDOWN_MS  = 500;
const SHAKE_THRESHOLD    = 15;

const cupidVariants = [
  "img/pinkboat_0.png","img/blackboat_0.png","img/redboat_0.png",
  "img/whiteboat_0.png","img/yellowboat_0.png"
];

// ====== Custom Group Names ======
const customGroupNames = {
  1: "粉色蚵仔",
  2: "黑色蚵仔",
  3: "紅色蚵仔",
  4: "白色蚵仔",
  5: "黃色蚵仔",
};

// ====== DOM ======
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
  leaveBtn:    document.getElementById("leave-group-btn"),
  renameBtn:   document.getElementById("rename-group-btn"),
  qrEl:        document.getElementById("qr-code"),
  waitingMsg:  document.getElementById("waiting-msg"),
  rank:        document.querySelector(".ranking-panel"),
};

let currentPlayerId = null;
let currentGroupId   = null;
let lastShakeTime   = 0;

// ===== Block Android keyboard from triggering resize resets =====
let ignoreResize = false;
window.addEventListener("resize", () => {
  if (ignoreResize) return;
});

// When focusing input → ignore resize events
document.addEventListener("focusin", (e) => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
    ignoreResize = true;
  }
});

// When leaving input → allow resize again after a short delay
document.addEventListener("focusout", () => {
  setTimeout(() => { ignoreResize = false; }, 500);
});

// DEBUG: global error catcher + show element refs
window.addEventListener("error", e => console.error("Global error:", e.error || e.message || e));
console.log("DEBUG els:", {
  setupScreen: !!els.setupScreen,
  phoneView: !!els.phoneView,
  waitingMsg: !!els.waitingMsg,
  form: !!els.form,
  nameInput: !!els.nameInput,
  groupSelect: !!els.groupSelect
});


// ====== UI Helpers ======
if (isHost) {
  if (els.form) els.form.style.display = "none"; // hide the join form
  els.motionBtn.style.display = "none"; // hide the join form
  els.startBtn.style.display = "inline-block";   // show Start Game button
  els.resetBtn.style.display = "inline-block";   // show Reset button
} else {
  els.startBtn.style.display = "none"; // phone doesn't show start button
  els.resetBtn.style.display = "none";
}

function showSetup() {
  // HOST: show setup + game layout placeholders
  if (isHost) {
    els.setupScreen.style.display = "block";
    els.gameScreen.style.display  = "block";
  }

  // PHONE: show the join screen!
  if (isPhone) {
    els.setupScreen.style.display = "block";   // 👈 show join UI
    els.form.style.display = "block";          // 👈 show form (name + groups)
    els.phoneView.style.display = "none";      // 👈 hide phone shake UI until joined
    els.rank.style.display = "none";

    // Hide QR for phones
    if (els.qrEl) els.qrEl.style.display = "none";
  }

  // Desktop show QR
  if (!isPhone && els.qrEl) {
    els.qrEl.style.display = "block";
  }
}
if (isPhone && els.rank) {
  els.rank.style.display = "none"; // hide the entire ranking panel
}

function showGame() {
  els.gameScreen.style.display  = "block";
  els.phoneView.style.display   = "none";
}
function showPhoneOnly() {
  if (els.setupScreen) els.setupScreen.style.display = "none";
  if (els.gameScreen)  els.gameScreen.style.display  = "none";

  if (els.phoneView) {
    els.phoneView.style.display = "flex";   // center with flex (matches CSS)
  }

  if (els.qrEl)        els.qrEl.style.display       = "none";
  if (els.phoneLabel)  els.phoneLabel.style.display = "block";
  if (els.phoneCupid)  els.phoneCupid.style.display = "block";
  if (els.resetBtn)  els.resetBtn.style.display = "none";
  if (els.rank)  els.rank.style.display = "none"
}

async function removeExtraGroups() {
  const snap = await get(ref(db, "groups"));
  const groups = snap.val() || {};
  for (const gid of Object.keys(groups)) {
    if (Number(gid) > 5) {    // remove group IDs > 5
      console.log("Removing extra group:", gid);
      await remove(ref(db, `groups/${gid}`));
    }
  }
}
// ====== Ensure Groups ======
async function ensureGroups() {
  for (let i = 1; i <= 5; i++) {
    const gRef = ref(db, `groups/${i}`);
    const snap = await get(gRef);
    if (!snap.exists()) {
      await set(gRef, {
        name: customGroupNames[i] || i.toString(),
        members: {},
        shakes: 0,
        progress: 0,
        cupidIndex: (i - 1) % cupidVariants.length
      });
    }
  }
}

// ====== Render Groups as Avatar Buttons ======
async function renderGroupChoices() {
  const groupsSnap = await get(ref(db, "groups"));
  const groups = groupsSnap.val() || {};

  const container = document.getElementById("group-choices");
  container.innerHTML = "";

  Object.entries(groups)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([gid, group]) => {
      const idx = group.cupidIndex ?? 0;

      const btn = document.createElement("div");
      btn.className = "group-choice";
      btn.style.cssText = `
        cursor:pointer;
        text-align:center;
        padding:8px;
        border:2px solid transparent;
        border-radius:10px;
      `;

      btn.innerHTML = `
        <img src="${cupidVariants[idx]}" style="height:60px;"><br>
        ${customGroupNames[gid] || `Group ${group.name}`}
      `;

      btn.addEventListener("click", () => {
        // Highlight selection
        document.querySelectorAll(".group-choice").forEach(el => {
          el.style.borderColor = "transparent";
        });
        btn.style.borderColor = "#4f46e5"; // highlight border (purple)

        // Set hidden field
        document.getElementById("group-select").value = gid;
      });

      container.appendChild(btn);
    });
}


// ===== Add rename function =========
async function renameGroup(newName) {
  if (!currentGroupId || !currentPlayerId) return;

  // Get current player info
  const memberSnap = await get(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`));
  const member = memberSnap.val();

  // Only owner can rename
  if (!member || !member.isOwner) {
    alert("只有第一位玩家可以更改組別名稱！");
    return;
  }

  // Update group name
  await update(ref(db, `groups/${currentGroupId}`), { name: newName });

  // ✅ Show success feedback
  alert("組別名稱已更新！");
}

// ====== Phone View ======
async function updatePhoneView(group) {
  if (!group) return;

  // Show group name + progress
  const progressText = `組別「${group.name || currentGroupId}」進度: ${Math.floor(group.progress||0)}%`;

  // Build members list
  const members = group.members ? Object.values(group.members) : [];
  let membersHtml = "<div style='margin-top:8px; font-size:14px; text-align:left;'>";
  members.forEach(m => {
    membersHtml += `• ${m.name}${m.isOwner ? " 👑" : ""}<br>`;
  });
  membersHtml += "</div>";

  // Update phone label with group + members
  if (els.phoneLabel) els.phoneLabel.innerHTML = progressText + membersHtml;

  // Owner check → show/hide rename button
  if (currentGroupId && currentPlayerId) {
    const memberSnap = await get(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`));
    const member = memberSnap.val();
    if (els.renameBtn) els.renameBtn.style.display = member?.isOwner ? "block" : "none";
  }
  // Set phone cupid image based on group's cupidIndex
  if (els.phoneCupid) {
    const idx = group.cupidIndex ?? 0;
    els.phoneCupid.src = cupidVariants[idx];       // ← key fix
    els.phoneCupid.alt = `Cupid of group ${group.name || currentGroupId}`;
  }
}

// ====== Auth ======
signInAnonymously(auth).catch(err => console.error("Sign-in failed:", err));
onAuthStateChanged(auth,(user)=>{ if(user) currentPlayerId=user.uid; });

// ====== Prevent Samsung auto-submit glitch ======
document.getElementById("enable-motion").addEventListener("click", () => {
    console.log("Manual submit triggered");
    document.getElementById("name-form").dispatchEvent(new Event("submit", { cancelable: true }));
});

// ====== Join Group (debug & robust replacement) ======
if (!isHost) {
  els.form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    // tiny helper: visible debug box at top
    function showOverlayMsg(msg, timeout = 0) {
      let o = document.getElementById("debug-overlay");
      if (!o) {
        o = document.createElement("div");
        o.id = "debug-overlay";
        Object.assign(o.style, {
          position: "fixed",
          left: "50%",
          top: "6%",
          transform: "translateX(-50%)",
          zIndex: "200000",
          background: "rgba(0,0,0,0.85)",
          color: "white",
          padding: "10px 14px",
          borderRadius: "8px",
          fontSize: "15px",
          maxWidth: "90%",
          textAlign: "center",
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)"
        });
        document.body.appendChild(o);
      }
      o.textContent = msg;
      if (timeout > 0) setTimeout(() => { o.remove(); }, timeout);
      console.log("DEBUG-OVERLAY:", msg);
    }

    showOverlayMsg("Join clicked — running checks...");

    // gather values
    const name = (els.nameInput?.value || "").trim();
    let groupId = (els.groupSelect?.value || "").toString();

    // check required elements exist
    const required = ["setupScreen","phoneView","waitingMsg","form","nameInput","groupSelect"];
    const missing = required.filter(k => !els[k]);
    if (missing.length) {
      showOverlayMsg("Missing elements: " + missing.join(", ") + " — check IDs in HTML", 8000);
      console.error("Missing elements on page:", missing);
      return;
    }

    // ensure group selection defaults to 1
    if (!groupId) {
      groupId = "1";
      els.groupSelect.value = groupId;
      const firstChoice = document.querySelector("#group-choices .group-choice");
      if (firstChoice) firstChoice.style.borderColor = "#4f46e5";
    }

    if (!name) {
      showOverlayMsg("請輸入名字！", 3000);
      return;
    }

    // Wait for auth uid (short)
    const waitForPlayerId = (timeoutMs = 5000) => new Promise(resolve => {
      const start = Date.now();
      (function check() {
        if (currentPlayerId) return resolve(currentPlayerId);
        if (Date.now() - start > timeoutMs) return resolve(null);
        setTimeout(check, 100);
      })();
    });

    showOverlayMsg("等待登入 (auth)...");

    const uid = await waitForPlayerId(5000);
    if (!uid) {
      showOverlayMsg("Auth 未完成 — 請等一秒後重試，或重新整理頁面。", 6000);
      console.error("No currentPlayerId after waiting.");
      return;
    }

    showOverlayMsg("Auth OK. Joining group " + groupId + "...");

    // write to DB
    currentGroupId = groupId;
    const groupRef = ref(db, `groups/${groupId}`);
    let snap = await get(groupRef);
    let group = snap.val();

    if (!snap.exists()) {
      await set(groupRef, {
        name: groupId.toString(),
        members: {},
        shakes: 0,
        progress: 0,
        cupidIndex: (Number(groupId) - 1) % cupidVariants.length
      });
      group = (await get(groupRef)).val();
    }

    // checks
    const memberCount = group.members ? Object.keys(group.members).length : 0;
    if (memberCount >= 1) {
      showOverlayMsg("此組別已滿 1 人，請選擇其他組別！", 4000);
      return;
    }
    if (Object.values(group.members || {}).some(m => m?.name === name)) {
      showOverlayMsg("此名字已有人使用！", 3000);
      return;
    }
    const isFirstPlayer = !group.members || Object.keys(group.members).length === 0;

    try {
      await update(groupRef, {
        [`members/${uid}`]: {
          name,
          joinedAt: Date.now(),
          isOwner: isFirstPlayer
        }
      });
      onDisconnect(ref(db, `groups/${groupId}/members/${uid}`)).remove();
      els.nameInput.value = "";

      // move phoneView into body end (avoid being covered)
      if (els.phoneView && els.phoneView.parentNode !== document.body) {
        document.body.appendChild(els.phoneView);
      }

      // force show phone view and panel
      Object.assign(els.phoneView.style, {
        display: "flex",
        position: "fixed",
        inset: "0",
        zIndex: "200001",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)"
      });

      const phonePanel = document.getElementById("phone-panel") || els.phoneView.firstElementChild;
      if (phonePanel) {
        phonePanel.style.display = "block";
        phonePanel.style.zIndex = "200002";
      }

      if (els.setupScreen) els.setupScreen.style.display = "none";
      els.rank.style.display = "none";
      els.waitingMsg.style.display = "block";
      els.phoneLabel.style.display = "block";
      els.phoneLabel.textContent = "已加入 – 等待主持人開始";
      els.phoneCupid && (els.phoneCupid.style.display = "block");
      els.leaveBtn.style.display = "block";
      els.renameBtn.style.display = "block";

      // final verification: if still not visible, show fallback big overlay
      const phoneViewVisible = window.getComputedStyle(els.phoneView).display !== "none" &&
                                window.getComputedStyle(els.phoneView).visibility !== "hidden";
      if (!phoneViewVisible) {
        // fallback overlay
        let fb = document.getElementById("joined-fallback");
        if (!fb) {
          fb = document.createElement("div");
          fb.id = "joined-fallback";
          Object.assign(fb.style, {
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            zIndex: "300000",
            background: "#111",
            color: "#fff",
            padding: "18px 20px",
            borderRadius: "12px",
            textAlign: "center",
            fontSize: "16px",
            boxShadow: "0 8px 30px rgba(0,0,0,0.5)"
          });
          fb.innerHTML = `<div style="margin-bottom:10px;">已加入 ${groupId}！等待主持人開始。</div>
                          <button id="joined-fallback-leave" style="padding:8px 12px;border-radius:8px;border:none;background:#e74c3c;color:#fff;">離開組別</button>`;
          document.body.appendChild(fb);
          document.getElementById("joined-fallback-leave").addEventListener("click", async () => {
            try {
              await remove(ref(db, `groups/${currentGroupId}/members/${uid}`));
            } catch (err) { console.error(err); }
            fb.remove();
            // return UI
            if (els.phoneView) els.phoneView.style.display = "none";
            if (els.setupScreen) els.setupScreen.style.display = "block";
          });
        }
      } else {
        // show a short success message then remove debug overlay
        showOverlayMsg("已加入！等待主持人開始。", 2500);
        setTimeout(() => { const d = document.getElementById("debug-overlay"); if (d) d.remove(); }, 2600);
      }

      console.log("Joined group", groupId, "as", uid, name);
    } catch (err) {
      console.error("Failed to join group:", err);
      showOverlayMsg("加入組別失敗，請稍後再試。", 4000);
    }
    onValue(groupRef, s => updatePhoneView(s.val() || {}));
  });
}

if (isPhone && currentGroupId) {
  // keep alive: reset presence on reconnect
  onDisconnect(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`))
    .cancel(); // cancel auto-remove if they were the winner
}

// ====== Shake Handling ======
els.motionBtn?.addEventListener("click",()=>{
  if(typeof DeviceMotionEvent!=="undefined" &&
     typeof DeviceMotionEvent.requestPermission==="function") {
    DeviceMotionEvent.requestPermission().then(res=>{
      if(res==="granted") window.addEventListener("devicemotion",handleMotion);
    });
  } else window.addEventListener("devicemotion",handleMotion);
});

function handleMotion(e) {
  const acc=e.accelerationIncludingGravity;
  if(!acc) return;
  const strength=Math.sqrt((acc.x||0)**2+(acc.y||0)**2+(acc.z||0)**2);
  if(strength>SHAKE_THRESHOLD&&currentGroupId) {
    const now=Date.now();
    if(now-lastShakeTime>SHAKE_COOLDOWN_MS) {
      lastShakeTime=now;
      addGroupShakeTx(currentGroupId);
      animateCupidJump(currentGroupId);
    }
  }
}

function addGroupShakeTx(groupId) {
  const gRef = ref(db, `groups/${groupId}`);
  runTransaction(gRef, (g) => {
    if (!g) return g;

    const membersCount = g.members ? Object.keys(g.members).length : 1;
    const BASE_STEP = 5; // baseline shake progress

    // ✅ Adaptive fine-tuned pace: sqrt scaling
    const step = BASE_STEP / Math.sqrt(membersCount);

    return {
      ...g,
      shakes: (g.shakes || 0) + 1,
      progress: Math.min(100, (g.progress || 0) + step),
    };
  })
  .then((res) => {
    const g = res.snapshot?.val();
    if (g && g.progress >= 100) {
      // ✅ Winner detected
      set(ref(db, "winner"), groupId);
      set(ref(db, "gameState"), "finished");
    }
  })
  .catch((err) => {
    console.error("Shake transaction failed:", err);
  });
}

// ====== Animation ======
function animateCupidJump(groupId) {
  const lane = document.querySelector(`.lane[data-group-id="${groupId}"]`);
  const cupid = lane?.querySelector(".cupid");
  if (cupid) { cupid.classList.add("jump"); setTimeout(() => cupid.classList.remove("jump"), 600); }

  if (els.phoneCupid && els.phoneView && els.phoneView.style.display !== "none") {
    els.phoneCupid.classList.add("jump");
    setTimeout(() => els.phoneCupid.classList.remove("jump"), 600);
  }
}


// ===== Force stabilize layout for Samsung Android 9 =====
const isSamsungAndroid9 =
  /SM-G95/gi.test(navigator.userAgent) && /Android 9/gi.test(navigator.userAgent);

if (isSamsungAndroid9) {
  console.log("Samsung Android 9 detected — applying viewport fix");

  const freezeHeight = () => {
    const h = window.innerHeight;
    document.documentElement.style.height = h + "px";
    document.body.style.height = h + "px";
    document.getElementById("player-setup").style.height = h + "px";
    document.getElementById("player-setup").style.overflow = "auto";
  };

  const unfreezeHeight = () => {
    document.documentElement.style.height = "";
    document.body.style.height = "";
    document.getElementById("player-setup").style.height = "";
    document.getElementById("player-setup").style.overflow = "";
  };

  // When tapping input
  els.nameInput.addEventListener("focus", () => {
    freezeHeight();
    console.log("Freeze height (keyboard open)");
  });

  // When leaving input
  els.nameInput.addEventListener("blur", () => {
    setTimeout(() => {
      unfreezeHeight();
      console.log("Unfreeze height (keyboard closed)");
    }, 300);
  });
}

/* -------------------------------------------------
   SAMSUNG ANDROID 9 FIX
   Detect typing using touchstart (the ONLY event
   Samsung Android 9 always fires)
--------------------------------------------------- */
// ===== GLOBAL STATE =====
let currentGameState = "lobby";
let phoneTyping = false;

// your existing els = { ... } must be defined BEFORE onValue too

// Detect typing reliably on Samsung
if (els.nameInput) {
  els.nameInput.addEventListener("touchstart", () => {
    phoneTyping = true;
    console.log("DEBUG: Samsung typing start (touchstart)");
  });

  els.nameInput.addEventListener("focus", () => {
    phoneTyping = true;
    console.log("DEBUG: typing start (focus)");
  });

  els.nameInput.addEventListener("blur", () => {
    phoneTyping = false;
    console.log("DEBUG: typing ended (blur)");
  });
}

/* -------------------------------------------------
   GAME STATE LISTENER (fixed)
--------------------------------------------------- */
onValue(ref(db, "gameState"), snap => {
  currentGameState = snap.val() || "lobby";
  console.log("DEBUG gameState =", currentGameState, { isPhone, phoneTyping });

  const show = (el) => el && (el.style.display = "block");
  const hide = (el) => el && (el.style.display = "none");

  /* -------------------------------------------------
     QR CODE (top-right in lobby only)
  --------------------------------------------------- */
  if (els.qrEl) {
    if (currentGameState === "lobby") {
      show(els.qrEl);
    } else {
      hide(els.qrEl);
    }
  }

  /* -------------------------------------------------
     PHONE BEHAVIOR
  --------------------------------------------------- */
  if (isPhone) {

    // 🔥 FIX: Samsung keyboard must NEVER hide the lobby or form
    if (phoneTyping) {
      console.log("⛔ Samsung typing: freeze lobby UI");

      // Force lobby UI
      show(els.setupScreen);
      show(els.form);

      hide(els.phoneView);
      hide(els.waitingMsg);

      // STOP — do NOT go further
      return;
    }

    // ----- NORMAL LOBBY -----
    if (currentGameState === "lobby") {
      show(els.setupScreen);
      show(els.form);
      hide(els.qrEl);
      hide(els.phoneView);
      hide(els.waitingMsg);
      hide(els.phoneLabel);
      hide(els.phoneCupid);
      hide(els.leaveBtn);
      hide(els.renameBtn);

      renderGroupChoices().catch(console.warn);
      return;
    }

    // ----- PLAYING -----
    if (currentGameState === "playing") {
      hide(els.setupScreen);
      hide(els.form);
      hide(els.qrEl);

      if (currentGroupId) {
        show(els.phoneView);
        els.phoneLabel.textContent = "比賽開始！搖動手機！";
      } else {
        hide(els.phoneView);
      }
      return;
    }

    // fallback
    show(els.setupScreen);
    return;
  }

  /* -------------------------------------------------
     HOST / DESKTOP
  --------------------------------------------------- */
  if (!isPhone) {
    if (currentGameState === "lobby") {
      show(els.setupScreen);
      show(els.gameScreen);
    }

    if (currentGameState === "playing") {
      hide(els.setupScreen);
      show(els.gameScreen);
      if (typeof showGame === "function") showGame();
    }
  }
});


function updateRanking(groups) {
  const rankingList = document.getElementById("ranking-list");
  if (!rankingList) return;
  const sorted = Object.entries(groups)
    .sort((a,b) => (b[1].progress || 0) - (a[1].progress || 0));
  rankingList.innerHTML = sorted.map(([gid,g]) =>
    `<li>${g.name || `Group ${gid}`}: ${Math.round(g.progress||0)}%</li>`
  ).join("");
}


function renderGameScene(groups) {
  if (!els.track) return;

  // Hide setup, show game screen
  if (els.setupScreen) els.setupScreen.style.display = "none";
  if (els.gameScreen) {
    els.gameScreen.style.display = "flex";
    els.gameScreen.style.zIndex = "10";
  }

  // Clear track
  els.track.innerHTML = "";

  if (!groups || typeof groups !== "object") return;

  const activeGroups = Object.entries(groups)
    .filter(([_, g]) => g.members && Object.keys(g.members).length > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  if (activeGroups.length === 0) return;

  const total = activeGroups.length;
  const trackHeight = Math.max(100, Math.floor((window.innerHeight * 0.8) / total));

  Object.assign(els.track.style, {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-evenly",
    alignItems: "stretch",
    width: "100%",
    height: "80vh",
    overflow: "visible",
  });

  // LOOP
  activeGroups.forEach(([gid, g]) => {
    const groupName = g.name || customGroupNames[gid] || `Group ${gid}`;
    const memberNames = Object.values(g.members || {}).map(m => m.name).join("、");
    const cupidImg = cupidVariants[g.cupidIndex ?? 0];
    const progress = g.progress || 0;

    // Lane container
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.dataset.groupId = gid;
    lane.style.cssText = `
      position: relative;
      height: ${trackHeight}px;
      margin: 10px 0;
      border-radius: 60px;
      overflow: visible;
    `;

    // Groom
    const groom = document.createElement("img");
    groom.src = cupidImg;
    groom.className = "groom";
    groom.style.cssText = `
      position: absolute;
      top: 50%;
      left: ${progress}%;
      transform: translateY(-50%);
      height: 90px;
      transition: left 0.4s ease-out;
    `;

    // Label
    const label = document.createElement("div");
    label.className = "lane-label";
    label.innerHTML = `
      <strong style="font-size:18px;">${groupName}</strong><br>
      <span style="font-size:14px;">${memberNames}</span>
    `;
    label.style.cssText = `
      position: absolute;
      left: 20px;
      top: 10px;
      color: #fff;
      text-shadow: 1px 1px 2px #000;
      z-index: 3;
    `;

    lane.appendChild(groom);
    lane.appendChild(label);
    els.track.appendChild(lane);

    // ⭐ FIXED SHIMMER ANIMATION
    if (lane.dataset.prevProgress != progress) {
      lane.classList.add("active");
      setTimeout(() => lane.classList.remove("active"), 1500);
      lane.dataset.prevProgress = progress;
    }
  });

  // ⭐ BRIDE (only add once)
  let bride = document.querySelector(".bride");
  if (!bride) {
    bride = document.createElement("img");
    bride.src = "img/goal.png";
    bride.className = "bride";
    els.track.appendChild(bride);
  }

  Object.assign(bride.style, {
    position: "absolute",
    right: "60px",
    top: "50%",
    transform: "translateY(-50%)",
    height: "120px",
    zIndex: 10,
  });

  // ⭐ Update ranking
  updateRanking(groups);
}



window.addEventListener("resize", async () => {
  const snap = await get(ref(db, "groups"));
  const groups = snap.val() || {};
  renderGameScene(groups);
});

onValue(ref(db, "groups"), (snap) => {
  let groups = snap.val() || {};

  // ------ FIX: sanitize array-like groups ------
  if (Array.isArray(groups)) {
    const cleaned = {};
    groups.forEach((g, i) => {
      if (g && typeof g === "object") cleaned[i] = g;
    });
    groups = cleaned;
    console.log("FIXED groups:", groups);
  }
  // ---------------------------------------------

  if (!isHost) return;

  try {
    els.setupScreen.style.display = "none";
    els.gameScreen.style.display = "block";
    renderGameScene(groups);
  } catch (err) {
    console.error("renderGameScene crash:", err);
  }
});





// ====== Winner popup logic (with highlighted ranking and clean layout) ======
onValue(ref(db, "winner"), async (snap) => {
  const winnerId = snap.val();
  if (!winnerId) {
    if (els.winnerPopup) els.winnerPopup.style.display = "none";
    return;
  }

  try {
    const gSnap = await get(ref(db, `groups/${winnerId}`));
    const g = gSnap.val() || {};
    const name = g.name || `Group ${winnerId}`;

    // 🏆 Winner title
    if (els.winnerMsg) {
      els.winnerMsg.innerHTML = `
        <span style="font-size: 26px; font-weight: 700; color: #ffeb3b; text-shadow: 1px 1px 3px #000;">
          🏆 Winner: ${name}!
        </span>
      `;
    }

    // --- Cupid image ---
    const cupidSrc = cupidVariants[g.cupidIndex ?? 0];
    const winnerCupid = document.getElementById("winner-cupid");
    if (winnerCupid) {
      winnerCupid.src = cupidSrc;
      winnerCupid.classList.remove("land");
      void winnerCupid.offsetWidth;
      winnerCupid.classList.add("land");
    }

    if (els.winnerPopup) {
      els.winnerPopup.style.display = "flex";
      els.winnerPopup.style.flexDirection = "column";
      els.winnerPopup.style.alignItems = "center";
      els.winnerPopup.style.textAlign = "center";
      els.winnerPopup.style.color = "#fff";
    }

    // --- Member list ---
    let listContainer = document.getElementById("winner-members");
    if (!listContainer) {
      listContainer = document.createElement("div");
      listContainer.id = "winner-members";
      els.winnerPopup.appendChild(listContainer);
    }

    const members = g.members || {};
    let html = `
      <h3 style="margin-top:15px;font-size:20px;font-weight:600;color:#ffd54f;">👥 成員名單</h3>
      <ul style="list-style:none;padding:0;margin:6px 0;font-size:17px;">`;
    html +=
      Object.values(members)
        .map(
          (m) =>
            `<li style="margin:4px 0;">${
              m.name
            }${m.isOwner ? ' <span style="color:#fdd835;">👑</span>' : ""}</li>`
        )
        .join("") || `<li>（無成員資料）</li>`;
    html += `</ul>`;
    listContainer.innerHTML = html;

    // --- Winner history (no display) ---
    const historyRef = ref(db, "winnerHistory");
    const histSnap = await get(historyRef);
    const history = histSnap.val() || {};
    const alreadyExists = Object.values(history).some(
      (h) => h.groupId === winnerId
    );
    if (!alreadyExists) {
      await push(historyRef, { groupId: winnerId, name, timestamp: Date.now() });
    }

    // --- Ranking (Top 3) ---
    const groupsSnap = await get(ref(db, "groups"));
    const groups = groupsSnap.val() || {};
    const ranked = Object.entries(groups)
      .map(([id, g]) => ({
        id,
        name: g.name || `Group ${id}`,
        progress: g.progress || 0,
      }))
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 3);

    let rankContainer = document.getElementById("winner-ranking");
    if (!rankContainer) {
      rankContainer = document.createElement("div");
      rankContainer.id = "winner-ranking";
      els.winnerPopup.appendChild(rankContainer);
    }

    let rankHTML = `
      <h3 style="margin-top:20px;font-size:20px;font-weight:600;color:#4fc3f7;">🏁 最終排名</h3>
      <ul style="list-style:none;padding:0;margin:8px 0;">`;
    ranked.forEach((r, i) => {
      const medal =
        i === 0
          ? "🥇"
          : i === 1
          ? "🥈"
          : "🥉";
      const color =
        i === 0
          ? "#ffeb3b"
          : i === 1
          ? "#c0c0c0"
          : "#cd7f32";

      rankHTML += `
        <li style="
          margin:6px 0;
          font-size:18px;
          font-weight:600;
          color:${color};
          text-shadow:1px 1px 2px #000;
        ">
          ${medal} ${r.name} — <span style="color:#fff;">${r.progress}%</span>
        </li>`;
    });
    rankHTML += `</ul>`;
    rankContainer.innerHTML = rankHTML;
  } catch (err) {
    console.error("Winner fetch failed:", err);
  }
});




// ====== Winner Exit: full reset, everyone back to lobby ======
els.winnerExit?.addEventListener("click", async () => {
  try {
    // 1️⃣ Get all groups
    const snap = await get(ref(db, "groups"));
    const groups = snap.val() || {};

    // 2️⃣ Remove all groups (including the winner)
    const removePromises = Object.keys(groups).map((gid) =>
      remove(ref(db, `groups/${gid}`))
    );
    await Promise.all(removePromises);

    // 3️⃣ Clear winner and reset game state
    await remove(ref(db, "winner"));
    await set(ref(db, "gameState"), "lobby");

    // 4️⃣ Host UI back to lobby
    if (!isPhone) {
      els.winnerPopup?.style.setProperty("display", "none");
      els.gameScreen?.style.setProperty("display", "none");
      els.setupScreen?.style.setProperty("display", "block");
      console.log("🎮 All reset — host back to lobby.");
    }

    // 5️⃣ Phones also automatically return to lobby
    if (isPhone) {
      // Reset all phone UI to default lobby screen
      if (els.phoneView) els.phoneView.style.display = "none";
      if (els.setupScreen) els.setupScreen.style.display = "block";
      if (els.waitingMsg) els.waitingMsg.style.display = "none";
      if (els.phoneLabel) els.phoneLabel.textContent = "";
      if (els.phoneCupid) els.phoneCupid.style.display = "none";
      if (els.leaveBtn) els.leaveBtn.style.display = "none";

      currentGroupId = null; // clear phone’s group link
      console.log("📱 Phone also returned to lobby.");
    }

    alert("🏁 遊戲已完全重置！所有組別與玩家已返回大廳。");
  } catch (err) {
    console.error("Winner exit failed:", err);
    alert("⚠️ 重置過程出現錯誤，請稍後再試。");
  }
});


// ====== Start / Reset / Exit ======
async function startGame() {
  // Reset progress to 0 for all groups
  const snap = await get(ref(db,"groups"));
  const groups = snap.val() || {};
  const updates = {};
  for (const gid in groups) {
    updates[`groups/${gid}/progress`] = 0;
    updates[`groups/${gid}/shakes`] = 0;
  }
  await update(ref(db), updates);

  // Clear winner + set game state
  await remove(ref(db,"winner"));
  await set(ref(db,"gameState"),"playing");

  // Switch UI
  els.setupScreen.style.display = "none";
  els.gameScreen.style.display = "block";
  els.qrEl.style.display     = "none";
}

if (isHost) {
  els.startBtn?.addEventListener("click", async () => {
    const pw = prompt("請輸入管理密碼才能開始遊戲:");
    if (pw === "1234") {
      await startGame(); 
    } else {
      alert("密碼錯誤！");
    }
  });
}


if (isPhone) {
  // Show the join screen first on phones
  showSetup();
  els.startBtn.style.display = "none";
  els.resetBtn.style.display = "none";
  if (els.qrEl) els.qrEl.style.display = "none";
}

// If on desktop, enable Start Game immediately
if (!isPhone && els.startBtn) {
  els.startBtn.disabled = false;
}

els.leaveBtn?.addEventListener("click", async () => {
  if (!currentGroupId || !currentPlayerId) return;

  const memberRef = ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`);
  const memberSnap = await get(memberRef);
  const member = memberSnap.val();

  // 1️⃣ Remove this player
  await remove(memberRef);

  // 2️⃣ If this player was the owner → transfer ownership if members remain
  const groupMembersRef = ref(db, `groups/${currentGroupId}/members`);
  const groupSnap = await get(groupMembersRef);
  const members = groupSnap.val();

  if (member?.isOwner && members) {
    const firstKey = Object.keys(members)[0];
    if (firstKey) {
      await update(ref(db, `groups/${currentGroupId}/members/${firstKey}`), {
        isOwner: true
      });
    }
  }

 
  // 3️⃣ If no members left → reset group to default state (keep default name)
  if (!members || Object.keys(members).length === 0) {
    await update(ref(db, `groups/${currentGroupId}`), {
      name: customGroupNames[currentGroupId] || `Group ${currentGroupId}`,
      members: {},
      shakes: 0,
      progress: 0
    });
  }

  // 4️⃣ Reset local vars
  currentGroupId = null;

  // 5️⃣ Switch back to lobby view
  els.phoneView.style.display = "none";
  els.form.style.display = "block";
  els.setupScreen.style.display = "block";  // ✅ go back to lobby
  els.leaveBtn.style.display = "none";
  els.renameBtn.style.display = "none";
});

// ====== Reset Game (Host Only) ======
async function resetGame() {
  // Clear all groups
  const snap = await get(ref(db,"groups"));
  const groups = snap.val() || {};
  const updates = {};
  for (const gid in groups) {
    updates[`groups/${gid}/members`] = {};
    updates[`groups/${gid}/progress`] = 0;
    updates[`groups/${gid}/name`] = customGroupNames[gid] || `Group ${gid}`; // 👈 force reset to custom name
  }
  await update(ref(db), updates);

  // Clear winner + set gameState to lobby
  await remove(ref(db,"winner"));
  await set(ref(db,"gameState"),"lobby");

  // Switch UI (host side)
  els.gameScreen.style.display = "block";
  els.setupScreen.style.display = "block";
}

if (isHost) {
  els.resetBtn?.addEventListener("click", async () => {
    const pw = prompt("請輸入管理密碼才能重置遊戲:");
    if (pw === "123") {
      await resetGame();
    } else {
      alert("密碼錯誤！");
    }
  });
}

// ====== Exit for Phones ======
els.exitBtn?.addEventListener("click", async () => {
  const confirmExit = confirm("確定要結束遊戲並全部重置嗎？（所有玩家將被清除）");
  if (!confirmExit) return;

  // Optional password prompt to prevent accidental reset
  const pw = prompt("請輸入管理密碼才能重置遊戲:");
  if (pw !== "1234") {
    alert("密碼錯誤！");
    return;
  }

  await resetGame();
  await set(ref(db, "gameState"), "lobby");

  currentGroupId = null;
  if (els.phoneView) els.phoneView.style.display = "none";
  if (els.gameScreen) els.gameScreen.style.display = "block";
  if (els.setupScreen) els.setupScreen.style.display = "block";
  alert("遊戲已重置！");
});


// ====== rename the group for Phones ======
els.renameBtn?.addEventListener("click", async () => {
  const newName = prompt("請輸入新的組別名稱:");
  if (newName) {
    await renameGroup(newName);
  }
});


async function removeRedundantGroups() {
  // Wait a bit to ensure groups have loaded properly
  await new Promise(res => setTimeout(res, 1500));

  const snap = await get(ref(db, "groups"));
  const groups = snap.val() || {};

  for (const [gid, g] of Object.entries(groups)) {
    const members = g.members ? Object.keys(g.members) : [];
    const hasMembers = members.length > 0;
    const name = (g.name || "").trim();

    // Only remove groups that truly have no data
    if ((!hasMembers && name === "") || name === "null" || gid === "null") {
      console.log("🗑 Removing redundant group:", gid, g);
      await remove(ref(db, `groups/${gid}`));
    }
  }
}

// ====== Boot ======
(async function boot() {
  showSetup();
  await ensureGroups();                  // make sure groups exist
  await removeRedundantGroups();         // remove any empty/redundant groups
  await removeExtraGroups();       // remove any leftover 6th group
  if (!isHost) await renderGroupChoices();
})();














