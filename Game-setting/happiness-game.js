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
  els.setupScreen.style.display = "none";
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
function updatePhoneView(group) {
  els.phoneLabel.textContent = `Group ${group.name}: ${Math.floor(group.progress||0)}%`;
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
  await update(groupRef,{[`members/${currentPlayerId}`]:{name,joinedAt:Date.now()}});
  onDisconnect(ref(db,`groups/${currentGroupId}/members/${currentPlayerId}`)).remove();
  els.nameInput.value="";

  if (isPhone) {
  els.startBtn.style.display = "none";

  // ✅ Show a waiting message until the host starts the game
  document.getElementById("phone-label").textContent = "等待遊戲開始...";

  // Listen for game state changes
  onValue(ref(db, "gameState"), snap => {
    if (snap.val() === "playing") {
      showPhoneOnly();
      onValue(groupRef, s => updatePhoneView(s.val() || {}));
    }
  });
} else {
  els.startBtn.disabled = false; // enable Start Game on computer
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
onValue(ref(db,"groups"),snap=>{
  const groups=snap.val()||{};
  if(!isPhone) {
    renderTrackAndRankings(groups);

    // update player list (ALL groups with members)
    els.playerList.innerHTML="";
    Object.entries(groups).forEach(([gid,g])=>{
      const members=Object.values(g.members||{}).map(m=>`<li>${m.name}</li>`).join("");
      els.playerList.innerHTML+=`
        <div class="group">
          <h3>Group ${g.name}</h3>
          <ul>${members}</ul>
        </div>`;
    });
  }
});

onValue(ref(db,"gameState"),snap=>{
  const state=snap.val()||"lobby";
  if(isPhone) {
    if(currentGroupId) showPhoneOnly(); else showSetup();
  } else {
    state==="lobby"?showSetup():showGame();
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
function startGame(){ set(ref(db,"gameState"),"playing"); }

if(isPhone) els.startBtn.style.display="none";
else els.startBtn?.addEventListener("click",()=>{
  const pw=prompt("請輸入管理密碼才能開始遊戲:");
  if(pw==="1234") startGame(); else alert("密碼錯誤！");
});

els.resetBtn?.addEventListener("click",async()=>{
  if(!confirm("Reset ALL groups and players?")) return;
  await ensureGroups();
  for(let i=1;i<=6;i++) {
    await update(ref(db,`groups/${i}`),{shakes:0,progress:0,members:{}});
  }
  await remove(ref(db,"winner"));
  await set(ref(db,"gameState"),"lobby");
  currentGroupId=null;
  showSetup();
});

els.exitBtn?.addEventListener("click",async()=>{
  if(currentPlayerId&&currentGroupId) {
    await remove(ref(db,`groups/${currentGroupId}/members/${currentPlayerId}`));
  }
  currentGroupId=null; showSetup();
});

// ====== Boot ======
ensureGroups().then(showSetup);


