// ============================================================
// GABU MTUMBA COLLECTION — STOCK SYSTEM
// Core app logic. Firestore = data. Cloudinary = shoe photos.
// ============================================================

import { firebaseConfig, cloudinaryConfig, shopConfig } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  collection, query, where, orderBy, limit, onSnapshot, getDocs,
  increment, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- Constants ----------

const CAPE_TYPES = [
  { key: "normal", label: "Normal capes" },
  { key: "standing", label: "Standing capes" },
  { key: "round", label: "Round standing" }
];
const HANDBAG_TYPES = [{ key: "total", label: "Handbags" }];

// ---------- Global state ----------

let currentUser = null;   // firebase auth user
let profile = null;       // { name, role, phone }
let activeTab = "overview";
let shoesCache = [];
let capesStock = { normal: 0, standing: 0, round: 0 };
let handbagsStock = { total: 0 };

const contentEl = document.getElementById("content");
const tabbarEl = document.getElementById("tabbar");
const whoNameEl = document.getElementById("who-name");
const whoRoleEl = document.getElementById("who-role");

// ---------- Auth guard ----------

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }
  profile = snap.data();
  whoNameEl.textContent = profile.name || "Staff";
  whoRoleEl.textContent = profile.role.toUpperCase();
  attachLiveListeners();
  render();
});

function isOwner() { return profile?.role === "owner"; }
function canEdit() { return profile?.role === "owner" || profile?.role === "editor"; }

// ---------- Live Firestore listeners ----------

function attachLiveListeners() {
  onSnapshot(query(collection(db, "shoes"), orderBy("dateAdded", "desc")), (snap) => {
    shoesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (activeTab === "shoes" || activeTab === "overview") render();
  });

  onSnapshot(doc(db, "stock", "capes"), (snap) => {
    capesStock = snap.exists() ? snap.data() : { normal: 0, standing: 0, round: 0 };
    if (activeTab === "stock" || activeTab === "overview" || activeTab === "variance") render();
  });

  onSnapshot(doc(db, "stock", "handbags"), (snap) => {
    handbagsStock = snap.exists() ? snap.data() : { total: 0 };
    if (activeTab === "stock" || activeTab === "overview" || activeTab === "variance") render();
  });
}

// ---------- Tab nav ----------

tabbarEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  activeTab = btn.dataset.tab;
  [...tabbarEl.children].forEach(b => b.classList.toggle("active", b === btn));
  render();
});

function render() {
  if (!profile) return;
  if (activeTab === "overview") renderOverview();
  else if (activeTab === "shoes") renderShoes();
  else if (activeTab === "stock") renderStock();
  else if (activeTab === "variance") renderVariance();
  else if (activeTab === "settings") renderSettings();
}

// ---------- Toast ----------

function toast(msg) {
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

// ---------- Modal ----------

function openModal(innerHtml) {
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "modal-overlay";
  overlay.innerHTML = `<div class="modal-sheet">${innerHtml}</div>`;
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}
function closeModal() {
  document.getElementById("modal-overlay")?.remove();
}

// ---------- Transaction log ----------

async function logTransaction(entry) {
  await addDoc(collection(db, "transactions"), {
    ...entry,
    by: currentUser.uid,
    byName: profile.name,
    timestamp: serverTimestamp()
  });
}

// ============================================================
// OVERVIEW
// ============================================================

function renderOverview() {
  const inStockShoes = shoesCache.filter(s => s.status === "in_stock").length;
  const totalCapes = capesStock.normal + capesStock.standing + capesStock.round;

  contentEl.innerHTML = `
    <div class="eyebrow">${shopConfig.name}</div>
    <h1>Today at a glance</h1>
    <p class="muted">Live stock across all categories.</p>

    <div class="row" style="margin-top:14px;">
      <div class="card" style="text-align:center;">
        <div class="mono" style="font-size:1.6rem; color:var(--green-deep);">${inStockShoes}</div>
        <div class="muted">Shoes in stock</div>
      </div>
      <div class="card" style="text-align:center;">
        <div class="mono" style="font-size:1.6rem; color:var(--green-deep);">${totalCapes}</div>
        <div class="muted">Capes total</div>
      </div>
      <div class="card" style="text-align:center;">
        <div class="mono" style="font-size:1.6rem; color:var(--green-deep);">${handbagsStock.total}</div>
        <div class="muted">Handbags</div>
      </div>
    </div>

    <h2 style="margin-top:18px;">Today's sales</h2>
    <div id="today-sales-box"><div class="loading-dots">Loading…</div></div>

    <div style="margin-top:18px;">
      <button class="btn btn-gold" id="eod-btn">View end-of-day summary</button>
    </div>
  `;

  loadTodaySales();
  document.getElementById("eod-btn").addEventListener("click", showEndOfDay);
}

async function loadTodaySales() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, "transactions"),
    where("type", "==", "sale"),
    where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
    orderBy("timestamp", "desc")
  );
  const snap = await getDocs(q);
  const box = document.getElementById("today-sales-box");
  if (!box) return;

  if (snap.empty) {
    box.innerHTML = `<p class="muted">No sales recorded yet today.</p>`;
    return;
  }

  let total = 0;
  let rows = "";
  snap.forEach(d => {
    const t = d.data();
    total += t.price || 0;
    rows += `
      <div class="ledger-row">
        <div>
          <div class="label">${categoryLabel(t.category, t.subtype)}</div>
          <div class="muted mono">Ksh ${t.price || 0} · ${t.byName || "—"}</div>
        </div>
        <div class="mono">${t.qty || 1}x</div>
      </div>`;
  });

  box.innerHTML = `
    <div class="alert alert-good">Ksh ${total.toLocaleString()} sold so far today</div>
    ${rows}
  `;
}

function categoryLabel(category, subtype) {
  if (category === "shoe") return "Shoes";
  if (category === "capes") return CAPE_TYPES.find(c => c.key === subtype)?.label || "Capes";
  if (category === "handbags") return "Handbags";
  return category;
}

async function showEndOfDay() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const q = query(
    collection(db, "transactions"),
    where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
    orderBy("timestamp", "desc")
  );
  const snap = await getDocs(q);

  let sales = 0, revenue = 0, restocks = 0;
  const byCategory = {};
  snap.forEach(d => {
    const t = d.data();
    if (t.type === "sale") {
      sales += t.qty || 1;
      revenue += t.price || 0;
      const key = categoryLabel(t.category, t.subtype);
      byCategory[key] = (byCategory[key] || 0) + (t.qty || 1);
    } else if (t.type === "restock") {
      restocks += t.qty || 1;
    }
  });

  const breakdownHtml = Object.entries(byCategory).map(([k, v]) =>
    `<div class="ledger-row"><div class="label">${k}</div><div class="mono">${v} sold</div></div>`
  ).join("") || `<p class="muted">No sales yet today.</p>`;

  openModal(`
    <div class="modal-head"><h2>End of day — ${new Date().toLocaleDateString()}</h2>
      <button class="modal-close" onclick="document.getElementById('modal-overlay').remove()">✕</button></div>
    <div class="alert alert-good mono">Ksh ${revenue.toLocaleString()} total revenue · ${sales} items sold</div>
    ${breakdownHtml}
    <p class="muted" style="margin-top:10px;">${restocks} item(s) restocked today.</p>
  `);
}

// ============================================================
// SHOES
// ============================================================

function renderShoes() {
  const inStock = shoesCache.filter(s => s.status === "in_stock");
  const sold = shoesCache.filter(s => s.status === "sold");

  contentEl.innerHTML = `
    <div class="eyebrow">Major stock</div>
    <h1>Shoes</h1>
    <p class="muted">${inStock.length} in stock · ${sold.length} sold</p>
    ${canEdit() ? `<button class="btn btn-primary" id="add-shoe-btn" style="margin-bottom:12px;">+ Add shoe to stock</button>` : ""}
    <div class="tag-grid" id="shoe-grid"></div>
  `;

  const grid = document.getElementById("shoe-grid");
  if (inStock.length === 0) {
    grid.innerHTML = `<p class="muted">No shoes in stock. ${canEdit() ? "Add your first pair above." : ""}</p>`;
  } else {
    grid.innerHTML = inStock.map(shoeTagHtml).join("");
  }

  document.getElementById("add-shoe-btn")?.addEventListener("click", openAddShoeModal);
  grid.querySelectorAll(".shoe-tag").forEach(el => {
    el.addEventListener("click", () => openSellShoeModal(el.dataset.id));
  });
}

function shoeTagHtml(shoe) {
  return `
    <div class="shoe-tag" data-id="${shoe.id}" style="cursor:pointer;">
      <span class="status-badge in-stock">In stock</span>
      <img class="photo" src="${shoe.imageUrl}" alt="Shoe size ${shoe.size}" loading="lazy" />
      <div class="info">
        <div class="size">Size ${shoe.size}</div>
        <div class="price-range">Ksh ${shoe.priceMin}–${shoe.priceMax}</div>
      </div>
    </div>
  `;
}

function openAddShoeModal() {
  openModal(`
    <div class="modal-head"><h2>Add shoe</h2>
      <button class="modal-close" id="close-modal">✕</button></div>
    <form id="add-shoe-form">
      <label for="shoe-photo">Photo</label>
      <input type="file" id="shoe-photo" accept="image/*" capture="environment" required />

      <label for="shoe-size">Size</label>
      <input type="text" id="shoe-size" placeholder="e.g. 42" required />

      <div class="row">
        <div>
          <label for="price-min">Price from (Ksh)</label>
          <input type="number" id="price-min" placeholder="1500" required />
        </div>
        <div>
          <label for="price-max">Price to (Ksh)</label>
          <input type="number" id="price-max" placeholder="1800" required />
        </div>
      </div>

      <div class="spacer"></div>
      <button type="submit" class="btn btn-primary" id="save-shoe-btn">Save to stock</button>
      <div class="error-msg" id="add-shoe-error"></div>
    </form>
  `);

  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("add-shoe-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById("shoe-photo");
    const size = document.getElementById("shoe-size").value.trim();
    const priceMin = Number(document.getElementById("price-min").value);
    const priceMax = Number(document.getElementById("price-max").value);
    const errorEl = document.getElementById("add-shoe-error");
    const saveBtn = document.getElementById("save-shoe-btn");

    if (!fileInput.files[0]) { errorEl.textContent = "Please choose a photo."; return; }

    saveBtn.disabled = true;
    saveBtn.textContent = "Uploading photo...";
    errorEl.textContent = "";

    try {
      const imageUrl = await uploadToCloudinary(fileInput.files[0]);
      saveBtn.textContent = "Saving...";
      await addDoc(collection(db, "shoes"), {
        imageUrl, size, priceMin, priceMax,
        status: "in_stock",
        dateAdded: serverTimestamp(),
        addedBy: currentUser.uid
      });
      toast("Shoe added to stock");
      closeModal();
    } catch (err) {
      errorEl.textContent = "Something went wrong. Check your connection and try again.";
      saveBtn.dis
