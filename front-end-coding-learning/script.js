// 🔧 Import Firebase
import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  push,
  onChildAdded,
  onChildRemoved,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

localStorage.removeItem("firebase:previous_websocket_failure");

// ✅ Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCLm14rMw4cfu05Nr4UGke4PaHVExAqBPM",
  authDomain: "pinny-c0821.firebaseapp.com",
  projectId: "pinny-c0821",
  storageBucket: "pinny-c0821.firebasestorage.app",
  messagingSenderId: "267528625996",
  appId: "1:267528625996:web:349d83b09740046dbb79e9"
};

// 🔌 Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const messagesRef = ref(db, "messages");

// 🔧 DOM Elements
const form = document.getElementById("msg-form");
const list = document.getElementById("msg-list");
const nickInput = document.getElementById("nickname");
const textInput = document.getElementById("message");
const removeBtn = document.getElementById("remove-latest");

// 🧠 Track message keys for deletion
const msgKeyOrder = [];

// 📩 Listen for new messages
onChildAdded(messagesRef, snapshot => {
  const msg = snapshot.val();
  const key = snapshot.key;

  // Avoid duplicate rendering
  if (document.querySelector(`li[data-key="${key}"]`)) return;

  msgKeyOrder.push(key); // ✅ Track message key order
  renderMessage(msg, key);
});

// ❌ Listen for deletions
onChildRemoved(messagesRef, snapshot => {
  const key = snapshot.key;
  const li = document.querySelector(`li[data-key="${key}"]`);
  if (li) li.remove();

  // Remove from tracked keys
  const index = msgKeyOrder.indexOf(key);
  if (index !== -1) msgKeyOrder.splice(index, 1);
});

// ✅ Submit handler
form.addEventListener("submit", e => {
  e.preventDefault();
  const nick = nickInput.value.trim() || "匿名";
  const text = textInput.value.trim();
  if (!text) return;

  const msg = {
    nick,
    text,
    time: new Date().toLocaleTimeString(),
    color: randomColor()
  };

  push(messagesRef, msg);
  textInput.value = "";
});

// ❌ Remove latest message
removeBtn.addEventListener("click", async () => {
  const lastKey = msgKeyOrder[msgKeyOrder.length - 1];
  if (!lastKey) return;
  await remove(ref(db, `messages/${lastKey}`));
});

// 🧱 Render function
function renderMessage(msg, key) {
  const li = document.createElement("li");
  li.className = "msg-item";
  li.dataset.key = key;
  li.innerHTML = `
    <div class="msg-avatar" style="background-color: ${msg.color}">
      ${escapeHtml(msg.nick.charAt(0))}
    </div>
    <div class="msg-content">
      <div class="name">${escapeHtml(msg.nick)}</div>
      <div class="text">${escapeHtml(msg.text)}</div>
      <div class="time">${msg.time}</div>
    </div>
  `;
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
}

// 🎨 Generate pastel color
function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 70%, 60%)`;
}

// 🧼 Escape HTML
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

// 🧾 QR Code generator
setTimeout(() => {
  const qrCanvas = document.getElementById("qr-code");
  if (qrCanvas && window.QRious) {
    new QRious({
      element: qrCanvas,
      value: 'https://liuyaochia.github.io/pinny/front-end-coding-learning/pinny.html',
      size: 120
    });
    console.log("QR Code generated.");
  } else {
    console.warn("QRious not found or canvas missing");
  }
}, 100);
