// ====== Firebase Setup ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getDatabase, ref, set, onValue, get, remove, update, runTransaction, onDisconnect 
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

// ====== Config ======
const STEP_PERCENT       = 3;
const SHAKE_COOLDOWN_MS  = 500;
const SHAKE_THRESHOLD    = 15;

const cupidVariants = [
  "img/groom1.png","img/groom2.png","img/groom3.png",
  "img/groom4.png","img/groom5.png","img/groom6.png","img/groom7.png"
];

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
  qrEl:        document.getElementById("qr-code");
};

let currentPlayerId = null;
let currentGroupId  = null;
let lastShakeTime   = 0;

// ====== UI Helpers ======
function showSetup() {
  els.setupScreen.style.display = "block";
  els.gameScreen.style.display  = "none";
  els.phoneView.style.display   = "none";
}
function showGame() {
  els.gameScreen.style.display  = "block";
  els.phoneView.style.display   = "none";
}
function showPhoneOnly() {
  els.setupScreen.style.display = "none";
  els.gameScreen.style.display  = "none";
  els.phoneView.style.display   = "block";
}

// ====== Ensure Groups ======
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

// ====== Render Track + Rankings (Desktop) ======
function renderTrackAndRankings(groups) {
  els.track.innerHTML = "";
  els.rankList.innerHTML = "";

  // lanes
  Object.entries(groups).sort((a,b)=>Number(a[0])-Number(b[0])).forEach(([gid, group]) => {
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.dataset.groupId = gid;

    lane.innerHTML = `
      <div class="lane-inner" style="position:relative;height:70px;">
        <span class="player-name" style="position:absolute;left:8px;top:6px;font-weight:bold;">Group ${group.name}</span>
        <img class="cupid" src="${cupidVariants[group.cupidIndex ?? 0]}" 
             style="height:50px;position:absolute;top:50%;transform:translateY(-50%);left:0%">
        <img class="goal" src="img/goal.png" 
             style="height:50px;position:absolute;right:5px;top:50%;transform:translateY(-50%)">
        <span class="progress-label" 
             style="position:absolute;top:-2px;right:10px;font-size:12px;font-weight:bold;color:#333">
             ${Math.floor(group.progress||0)}%</span>
      </div>`;
    lane.querySelector(".cupid").style.left = `${Math.min(group.progress||0,95)}%`;
    els.track.appendChild(lane);
  });

  // rankings
  Object.entries(groups)
    .sort(([,a],[,b])=>(b.progress||0)-(a.progress||0))
    .forEach(([gid,group],idx)=>{
      const li=document.createElement("li");
      li.textContent=`${idx+1}️⃣ Group ${group.name}: ${Math.floor(group.progress||0)}%`;
      els.rankList.appendChild(li);
    });
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
  els.phoneLabel.innerHTML = progressText + membersHtml;

  // Owner check → show/hide rename button
  if (currentGroupId && currentPlayerId) {
    const memberSnap = await get(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`));
    const member = memberSnap.val();
    els.renameBtn.style.display = member?.isOwner ? "block" : "none";
  }
}

// ====== Auth ======
signInAnonymously(auth).catch(err => console.error("Sign-in failed:", err));
onAuthStateChanged(auth,(user)=>{ if(user) currentPlayerId=user.uid; });

// ====== Join Group ======
els.form?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const name=(els.nameInput.value||"").trim();
  const groupId=els.groupSelect.value||"";
  if(!name||!groupId) return;

  const groupRef=ref(db,`groups/${groupId}`);
  const snap=await get(groupRef);
  if(!snap.exists()) {
    await set(groupRef,{
      name:groupId.toString(),members:{},shakes:0,progress:0,
      cupidIndex:(Number(groupId)-1)%cupidVariants.length
    });
  }
  const group=(await get(groupRef)).val();

  // prevent dup names
  if(Object.values(group.members||{}).some(m=>m?.name===name)) {
    alert("Name already taken in this group!");
    return;
  }

  currentGroupId=groupId;
  // Check if group is empty → first player = owner
  const isFirstPlayer = !group.members || Object.keys(group.members).length === 0;

  await update(groupRef, {
    [`members/${currentPlayerId}`]: {
      name,
      joinedAt: Date.now(),
      isOwner: isFirstPlayer // ✅ mark owner if first player
    }
  });
  onDisconnect(ref(db,`groups/${currentGroupId}/members/${currentPlayerId}`)).remove();
  els.nameInput.value="";

  if (isPhone) {
    els.startBtn.style.display = "none";
    els.leaveBtn.style.display = "block"; // show the leave button when joined

    // ✅ Immediately switch to phone view (hide form, show waiting screen)
    showPhoneOnly();
    els.phoneLabel.textContent = "等待遊戲開始...";

    // ✅ Always listen to your group → update name/progress/owner status
    onValue(groupRef, s => updatePhoneView(s.val() || {}));

    // ✅ Also listen for game state → if playing, keep phone view active
    onValue(ref(db, "gameState"), snap => {
      if (snap.val() === "playing") {
        showPhoneOnly();
      }
    });
  } else {
    els.startBtn.disabled = false; // enable Start Game on computer
  }
});

 
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
  const gRef=ref(db,`groups/${groupId}`);
  runTransaction(gRef,(g)=>{
    if(!g) return g;
    return {...g,
      shakes:(g.shakes||0)+1,
      progress:Math.min(100,(g.progress||0)+STEP_PERCENT)};
  }).then(async(res)=>{
    const g=res.snapshot?.val();
    if(g&&g.progress>=100) await set(ref(db,"winner"),g.name||groupId.toString());
  });
}

// ====== Animation ======
function animateCupidJump(groupId) {
  const lane=document.querySelector(`.lane[data-group-id="${groupId}"]`);
  const cupid=lane?.querySelector(".cupid");
  if(cupid) { cupid.classList.add("jump"); setTimeout(()=>cupid.classList.remove("jump"),600); }
  if(els.phoneCupid&&els.phoneView.style.display==="block") {
    els.phoneCupid.classList.add("jump");
    setTimeout(()=>els.phoneCupid.classList.remove("jump"),600);
  }
}

// ====== Global Listeners ======
let currentGameState = "lobby"; // track state

onValue(ref(db,"gameState"), snap=>{
  currentGameState = snap.val() || "lobby";
  if (isPhone) {
    if (currentGroupId) showPhoneOnly(); else showSetup();
  } else {
    if (currentGameState === "lobby") {
      showSetup();
      els.setupScreen.style.display = "block";// 👈 make sure it's visible
      els.gameContainer.style.display = "none";
      showSetup();
    } else if (currentGameState === "playing") {
      // ✅ show race view
      els.setupScreen.style.display = "none";// 👈 hide lobby box when playing
      els.gameContainer.style.display = "block";
      showGame();    
    }
  }
});

onValue(ref(db,"groups"),snap=>{
  const groups = snap.val() || {};

  if (!isPhone) {
    renderTrackAndRankings(groups);

    if (currentGameState === "lobby") {
      // show player list
      els.playerList.innerHTML = "";
      Object.entries(groups).forEach(([gid,g])=>{
        const members = Object.values(g.members||{}).map(m=>`<li>${m.name}</li>`).join("");
        els.playerList.innerHTML += `
          <div class="group">
            <h3>Group ${g.name}</h3>
            <ul>${members}</ul>
          </div>`;
      });
    } else {
      // clear player list when game started
      els.playerList.innerHTML = "";
    }
  }
});

// ====== Winner ======
onValue(ref(db,"winner"),async(snap)=>{
  const winnerId=snap.val();
  if(!winnerId) { els.winnerPopup.style.display="none"; return; }

  els.winnerMsg.textContent=`🏆 Winner: Group ${winnerId}!`;
  try {
    const g=(await get(ref(db,`groups/${winnerId}`))).val()||{};
    const cupidSrc=cupidVariants[g.cupidIndex||0];
    const winnerCupid=document.getElementById("winner-cupid");
    const winnerGoal=document.getElementById("winner-goal");
    if(winnerCupid) {
      winnerCupid.src=cupidSrc;
      winnerCupid.classList.remove("land"); void winnerCupid.offsetWidth;
      winnerCupid.classList.add("land");
    }
    if(winnerGoal) winnerGoal.src="img/goal.png";
    els.winnerPopup.style.display="flex";
  } catch(err) { console.error("Winner fetch failed:",err); }
});

els.winnerExit?.addEventListener("click",async()=>{
  await remove(ref(db,"winner"));
  await set(ref(db,"gameState"),"lobby");
});

// ====== Start / Reset / Exit ======
async function startGame() {
  // remove empty groups before starting
  const snap = await get(ref(db, "groups"));
  const groups = snap.val() || {};

  for (const [gid, g] of Object.entries(groups)) {
    if (!g.members || Object.keys(g.members).length === 0) {
      await remove(ref(db, `groups/${gid}`));
    }
  }

  // then start the game
  await set(ref(db, "gameState"), "playing");
   // ✅ hide the lobby/setup UI
  els.setupScreen.style.display = "none";  
  els.playerList.innerHTML = "";            // ✅ clear player list
  // ✅ hide QR code
  els.qrEl.style.display = "none";
  // ✅ hide phone QR view for all phones
  if (isPhone) showPhoneOnly(); // phone still sees the game but not QR
}

if (isPhone) {
  els.startBtn.style.display = "none";
} else {
  els.startBtn?.addEventListener("click", async () => {
    const pw = prompt("請輸入管理密碼才能開始遊戲:");
    if (pw === "1234") {
      await startGame(); 
    } else {
      alert("密碼錯誤！");
    }
  });
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

  // 3️⃣ If no members left → remove the whole group
  if (!members || Object.keys(members).length === 0) {
    await remove(ref(db, `groups/${currentGroupId}`));
  }

  // 4️⃣ Reset local vars
  currentGroupId = null;

  // 5️⃣ Switch back to lobby view
  els.phoneView.style.display = "none";
  els.form.style.display = "block";
  els.leaveBtn.style.display = "none";
  els.renameBtn.style.display = "none";
});

els.resetBtn?.addEventListener("click",async()=>{
  if(!confirm("Reset ALL groups and players?")) return;
  await remove(ref(db, "groups"));
  await remove(ref(db,"winner"));
  await set(ref(db,"gameState"),"lobby");
  currentGroupId=null;
  showSetup();
});

els.exitBtn?.addEventListener("click",async()=>{
  if(currentPlayerId&&currentGroupId) {
    await remove(ref(db,`groups/${currentGroupId}/members/${currentPlayerId}`));
  }
  await set(ref(db,"gameState"),"lobby");
  currentGroupId=null; showSetup();
});



els.renameBtn?.addEventListener("click", async () => {
  const newName = prompt("請輸入新的組別名稱:");
  if (newName) {
    await renameGroup(newName);
  }
});


// ====== Boot ======
showSetup();






