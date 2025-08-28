// ==================== Firebase Setup ====================
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const isPhone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ==================== Config ====================
const STEP_PERCENT = 3;
const SHAKE_COOLDOWN_MS = 500;
const SHAKE_THRESHOLD = 15;

const cupidVariants = [
  "img/groom1.png","img/groom2.png","img/groom3.png",
  "img/groom4.png","img/groom5.png","img/groom6.png","img/groom7.png"
];

// ==================== DOM Elements ====================
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
  phoneView: document.getElementById("phone-view"),
  phoneCupid: document.getElementById("phone-cupid"),
  phoneLabel: document.getElementById("phone-label"),
  leaveBtn: document.getElementById("leave-group-btn"),
  renameBtn: document.getElementById("rename-group-btn"),
  qrEl: document.getElementById("qr-code"),
};

let currentPlayerId = null;
let currentGroupId = null;
let lastShakeTime = 0;
let currentGameState = "lobby";

// ==================== UI Functions ====================
function showSetup() {
  els.setupScreen.style.display = "block";
  els.gameScreen.style.display = "none";
  els.phoneView.style.display = "none";
  if (!isPhone && els.qrEl) els.qrEl.style.display = "block";
  else if (els.qrEl) els.qrEl.style.display = "none";
}

function showGame() {
  els.gameScreen.style.display = "block";
  els.phoneView.style.display = "none";
}

function showPhoneOnly() {
  if (els.setupScreen) els.setupScreen.style.display = "none";
  if (els.gameScreen) els.gameScreen.style.display = "none";
  if (els.phoneView) els.phoneView.style.display = "flex";
  if (els.qrEl) els.qrEl.style.display = "none";
  if (els.phoneLabel) els.phoneLabel.style.display = "block";
  if (els.phoneCupid) els.phoneCupid.style.display = "block";
  if (els.resetBtn) els.resetBtn.style.display = "none";
  if (els.leaveBtn) els.leaveBtn.style.display = "block";
}

// ==================== Firebase Helpers ====================
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

async function renameGroup(newName) {
  if (!currentGroupId || !currentPlayerId) return;
  const memberSnap = await get(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`));
  const member = memberSnap.val();
  if (!member?.isOwner) return alert("只有第一位玩家可以更改組別名稱！");
  await update(ref(db, `groups/${currentGroupId}`), { name: newName });
  alert("組別名稱已更新！");
}

// ==================== Track & Ranking ====================
function renderTrackAndRankings(groups) {
  els.track.innerHTML = "";
  els.rankList.innerHTML = "";

  Object.entries(groups).sort((a,b)=>Number(a[0])-Number(b[0])).forEach(([gid, group]) => {
    const lane = document.createElement("div");
    lane.className = "lane";
    lane.dataset.groupId = gid;
    lane.innerHTML = `
      <div class="lane-inner" style="position:relative;height:70px;">
        <span class="player-name" style="position:absolute;left:8px;top:6px;font-weight:bold;">Group ${group.name}</span>
        <img class="cupid" src="${cupidVariants[group.cupidIndex ?? 0]}" style="height:50px;position:absolute;top:50%;transform:translateY(-50%);left:0%">
        <img class="goal" src="img/goal.png" style="height:50px;position:absolute;right:5px;top:50%;transform:translateY(-50%)">
        <span class="progress-label" style="position:absolute;top:-2px;right:10px;font-size:12px;font-weight:bold;color:#333">
        ${Math.floor(group.progress||0)}%</span>
      </div>`;
    lane.querySelector(".cupid").style.left = `${Math.min(group.progress||0,95)}%`;
    els.track.appendChild(lane);
  });

  Object.entries(groups).sort(([,a],[,b])=>(b.progress||0)-(a.progress||0)).forEach(([gid,group],idx)=>{
    const li = document.createElement("li");
    li.textContent = `${idx+1}️⃣ Group ${group.name}: ${Math.floor(group.progress||0)}%`;
    els.rankList.appendChild(li);
  });
}

// ==================== Phone View ====================
async function updatePhoneView(group) {
  if (!group) return;
  const progressText = `組別「${group.name || currentGroupId}」進度: ${Math.floor(group.progress||0)}%`;
  const members = group.members ? Object.values(group.members) : [];
  let membersHtml = "<div style='margin-top:8px;font-size:14px;text-align:left;'>";
  members.forEach(m=>membersHtml += `• ${m.name}${m.isOwner?" 👑":""}<br>`);
  membersHtml += "</div>";
  if (els.phoneLabel) els.phoneLabel.innerHTML = progressText + membersHtml;

  if (currentGroupId && currentPlayerId) {
    const memberSnap = await get(ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`));
    const member = memberSnap.val();
    if (els.renameBtn) els.renameBtn.style.display = member?.isOwner?"block":"none";
  }
  if (els.phoneCupid) {
    const idx = group.cupidIndex ?? 0;
    els.phoneCupid.src = cupidVariants[idx];
    els.phoneCupid.alt = `Cupid of group ${group.name || currentGroupId}`;
  }
}

// ==================== Authentication ====================
signInAnonymously(auth).catch(console.error);
onAuthStateChanged(auth, user=>{ if(user) currentPlayerId=user.uid; });

// ==================== Join Group (Phones) ====================
if(isPhone){
  els.form?.addEventListener("submit", async e=>{
    e.preventDefault();
    const name=(els.nameInput.value||"").trim();
    const groupId=els.groupSelect.value||"";
    if(!name||!groupId) return;

    const groupRef=ref(db,`groups/${groupId}`);
    const snap=await get(groupRef);
    if(!snap.exists()) await set(groupRef,{ name:groupId.toString(), members:{}, shakes:0, progress:0, cupidIndex:(Number(groupId)-1)%cupidVariants.length });
    const group=(await get(groupRef)).val();
    if(Object.values(group.members||{}).some(m=>m?.name===name)){ alert("Name already taken!"); return; }

    currentGroupId=groupId;
    const isOwner = !group.members || Object.keys(group.members).length===0;
    await update(groupRef, { [`members/${currentPlayerId}`]: { name, joinedAt:Date.now(), isOwner }});
    onDisconnect(ref(db,`groups/${currentGroupId}/members/${currentPlayerId}`)).remove();
    els.nameInput.value="";

    showPhoneOnly();
    els.phoneLabel.textContent = "等待遊戲開始...";
    onValue(groupRef, s=>updatePhoneView(s.val()||{}));
    onValue(ref(db,"gameState"), snap=>{ if(snap.val()==="playing") showPhoneOnly(); });
  });
}

// ==================== Shake Handling ====================
els.motionBtn?.addEventListener("click", ()=>{
  if(typeof DeviceMotionEvent!=="undefined" && typeof DeviceMotionEvent.requestPermission==="function") {
    DeviceMotionEvent.requestPermission().then(res=>{ if(res==="granted") window.addEventListener("devicemotion", handleMotion); });
  } else window.addEventListener("devicemotion", handleMotion);
});

function handleMotion(e){
  const acc=e.accelerationIncludingGravity;
  if(!acc||!currentGroupId) return;
  const strength=Math.sqrt((acc.x||0)**2+(acc.y||0)**2+(acc.z||0)**2);
  if(strength>SHAKE_THRESHOLD && Date.now()-lastShakeTime>SHAKE_COOLDOWN_MS){
    lastShakeTime=Date.now();
    addGroupShakeTx(currentGroupId);
    animateCupidJump(currentGroupId);
  }
}

function addGroupShakeTx(groupId){
  runTransaction(ref(db,`groups/${groupId}`), g=>{
    if(!g) return g;
    return {...g, shakes:(g.shakes||0)+1, progress:Math.min(100,(g.progress||0)+STEP_PERCENT)};
  }).then(async res=>{
    const g=res.snapshot?.val();
    if(g && g.progress>=100) await set(ref(db,"winner"),g.name||groupId.toString());
  });
}

// ==================== Animation ====================
function animateCupidJump(groupId){
  const lane=document.querySelector(`.lane[data-group-id="${groupId}"]`);
  const cupid=lane?.querySelector(".cupid");
  if(cupid){ cupid.classList.add("jump"); setTimeout(()=>cupid.classList.remove("jump"),600); }
  if(els.phoneCupid && els.phoneView?.style.display==="block"){ els.phoneCupid.classList.add("jump"); setTimeout(()=>els.phoneCupid.classList.remove("jump"),600); }
}

// ==================== Global Listeners ====================
onValue(ref(db,"gameState"), snap=>{
  currentGameState = snap.val() || "lobby";
  if(isPhone){ if(currentGroupId) showPhoneOnly(); else showSetup(); }
  else{ currentGameState==="lobby"? showSetup(): showGame(); }
});

onValue(ref(db,"groups"), snap=>{
  const groups=snap.val()||{};
  if(!isPhone){
    renderTrackAndRankings(groups);
    if(currentGameState==="lobby"){
      els.playerList.innerHTML="";
      Object.entries(groups).forEach(([gid,g])=>{
        const members=Object.values(g.members||{}).map(m=>`<li>${m.name}</li>`).join("");
        els.playerList.innerHTML+=`<div class="group"><h3>Group ${g.name}</h3><ul>${members}</ul></div>`;
      });
    } else els.playerList.innerHTML="";
  }
});

onValue(ref(db,"winner"), async snap=>{
  const winnerId = snap.val();
  if(!winnerId){ if(els.winnerPopup) els.winnerPopup.style.display="none"; return; }
  els.winnerMsg.textContent=`🏆 Winner: Group ${winnerId}!`;
  try{
    const g=(await get(ref(db,`groups/${winnerId}`))).val()||{};
    const cupidSrc=cupidVariants[g.cupidIndex||0];
    const winnerCupid=document.getElementById("winner-cupid");
    const winnerGoal=document.getElementById("winner-goal");
    if(winnerCupid){ winnerCupid.src=cupidSrc; winnerCupid.classList.remove("land"); void winnerCupid.offsetWidth; winnerCupid.classList.add("land"); }
    if(winnerGoal) winnerGoal.src="img/goal.png";
    if(els.winnerPopup) els.winnerPopup.style.display="flex";
  } catch(err){ console.error(err); }
});

els.winnerExit?.addEventListener("click", async ()=>{
  await remove(ref(db,"winner"));
  await set(ref(db,"gameState"),"lobby");
});

// ==================== Start Game ====================
async function startGame(){
  await ensureGroups();
  const snap = await get(ref(db,"groups"));
  const groups = snap.val()||{};
  for(const [gid,g] of Object.entries(groups)){
    const progress = Math.min(100, 10 + (g.members?Object.keys(g.members).length:0)*5);
    await update(ref(db,`groups/${gid}`),{ progress });
  }
  await set(ref(db,"gameState"),"playing");
  els.setupScreen.style.display="none";
  els.playerList.innerHTML="";
  if(els.qrEl) els.qrEl.style.display="none";
  if(isPhone) showPhoneOnly();
}

if(!isPhone){
  els.startBtn?.addEventListener("click", async ()=>{
    if(prompt("請輸入管理密碼:")==="1234") await startGame();
    else alert("密碼錯誤！");
  });
}

// If on desktop, enable Start Game immediately
if (!isPhone && els.startBtn) {
  els.startBtn.disabled = false;
}

// ==================== Leave / Reset / Exit ====================
els.leaveBtn?.addEventListener("click", async ()=>{
  if(!currentGroupId || !currentPlayerId) return;
  const memberRef = ref(db, `groups/${currentGroupId}/members/${currentPlayerId}`);
  const memberSnap = await get(memberRef);
  const member = memberSnap.val();
  await remove(memberRef);
  const groupMembersSnap = await get(ref(db, `groups/${currentGroupId}/members`));
  const members = groupMembersSnap.val();
  if(member?.isOwner && members){ const firstKey=Object.keys(members)[0]; if(firstKey) await update(ref(db, `groups/${currentGroupId}/members/${firstKey}`),{ isOwner:true }); }
  if(!members || Object.keys(members).length===0) await remove(ref(db, `groups/${currentGroupId}`));
  currentGroupId=null;
  showSetup();
  els.leaveBtn.style.display="none";
  els.renameBtn.style.display="none";
});

els.resetBtn?.addEventListener("click", async ()=>{
  if(!confirm("Reset ALL groups?")) return;
  await remove(ref(db,"groups")); await remove(ref(db,"winner")); await set(ref(db,"gameState"),"lobby");
  currentGroupId=null; showSetup();
});

els.exitBtn?.addEventListener("click", async ()=>{
  if(currentGroupId && currentPlayerId) await remove(ref(db,`groups/${currentGroupId}/members/${currentPlayerId}`));
  await set(ref(db,"gameState"),"lobby");
  currentGroupId=null; showSetup();
});

els.renameBtn?.addEventListener("click", async ()=>{
  const newName = prompt("請輸入新的組別名稱:");
  if(newName) await renameGroup(newName);
});

// ==================== Boot ====================
showSetup();



