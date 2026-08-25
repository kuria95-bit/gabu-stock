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

// ---------- On-screen error reporting (so problems are visible on phone) ----------
function showFatalError(message) {
  const el = document.getElementById("content");
  if (el) {
    el.innerHTML = `
      <div style="background:#F3DAD8; border:1px solid #B23A34; color:#B23A34; padding:14px; border-radius:10px; font-family:monospace; font-size:0.8rem; white-space:pre-wrap; word-break:break-word;">
        <strong>Something went wrong:</strong><br/>${message}
      </div>`;
  }
}
window.addEventListener("error", (e) => showFatalError(e.message || String(e.error)));
window.addEventListener("unhandledrejection", (e) => showFatalError(e.reason?.message || String(e.reason)));

let app, auth, db;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (err) {
  showFatalError("Firebase failed to start: " + err.message);
  throw err;
}

// ---------- Constants ----------

const CAPE_TYPES = [
  { key: "normal", label: "Normal capes", price: 300 },
  { key: "expensive", label: "Expensive normal", price: 350 },
  { key: "standing", label: "Standing capes", price: 350 },
  { key: "round", label: "Round standing", price: 400 }
];
const HANDBAG_TYPES = [{ key: "total", label: "Handbags", price: null }];

// ---------- Global state ----------

let currentUser = null;
let profile = null;
let activeTab = "overview";
let shoesCache = [];
let capesStock = { normal: 0, expensive: 0, standing: 0, round: 0 };
let handbagsStock = { total: 0 };

const contentEl = document.getElementById("content");
const tabbarEl = document.getElementById("tabbar");
const whoNameEl = document.getElementById("who-name");
const whoRoleEl = document.getElementById("who-role");

// ---------- Auth guard ----------

onAuthStateChanged(auth, async (user) => {
  try {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    currentUser = user;
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) {
      showFatalError("Logged in, but no profile document found at /users/" + user.uid + ". Check Firestore.");
      return;
    }
    profile = snap.data();
    whoNameEl.textContent = profile.name || "Staff";
    whoRoleEl.textContent = (profile.role || "").toUpperCase();
    attachLiveListeners();
    render();
  } catch (err) {
    showFatalError("Auth/profile load failed: " + err.message);
  }
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
    capesStock = snap.exists() ? snap.data() : { normal: 0, expensive: 0, standing: 0, round: 0 };
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
  else if (activeTab === "money") renderMoney();
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
  const totalCapes = capesStock.normal + capesStock.expensive + capesStock.standing + capesStock.round;

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
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="mono">${t.qty || 1}x</div>
          ${canEdit() ? `<button class="btn btn-outline btn-sm" data-undo-id="${d.id}">Undo</button>` : ""}
        </div>
      </div>`;
  });

  box.innerHTML = `
    <div class="alert alert-good">Ksh ${total.toLocaleString()} sold so far today</div>
    ${rows}
  `;

  box.querySelectorAll("[data-undo-id]").forEach(btn => {
    btn.addEventListener("click", () => undoSale(btn.dataset.undoId));
  });
}

async function undoSale(txId) {
  const ok = window.confirm("Undo this sale? This puts the item back in stock and removes it from today's sales.");
  if (!ok) return;

  const txSnap = await getDoc(doc(db, "transactions", txId));
  if (!txSnap.exists()) { toast("Already removed"); return; }
  const t = txSnap.data();

  try {
    if (t.category === "shoe" && t.shoeId) {
      await updateDoc(doc(db, "shoes", t.shoeId), { status: "in_stock" });
    } else if (t.category === "capes" || t.category === "handbags") {
      await updateDoc(doc(db, "stock", t.category), { [t.subtype]: increment(t.qty || 1) });
    }
    await deleteDoc(doc(db, "transactions", txId));
    toast("Sale undone");
    loadTodaySales();
  } catch (err) {
    toast("Couldn't undo: " + err.message);
  }
}

function categoryLabel(category, subtype) {
  if (category === "shoe") return "Shoes";
  if (category === "capes") return CAPE_TYPES.find(c => c.key === subtype)?.label || "Capes";
  if (category === "handbags") return "Handbags";
  return category;
}

async function showEndOfDay() {
  await showSalesForDate(new Date());
}

async function showSalesForDate(dateObj) {
  const startOfDay = new Date(dateObj);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateObj);
  endOfDay.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "transactions"),
    where("timestamp", ">=", Timestamp.fromDate(startOfDay)),
    where("timestamp", "<=", Timestamp.fromDate(endOfDay)),
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
  ).join("") || `<p class="muted">No sales that day.</p>`;

  openModal(`
    <div class="modal-head"><h2>${startOfDay.toLocaleDateString()}</h2>
      <button class="modal-close" onclick="document.getElementById('modal-overlay').remove()">✕</button></div>
    <div class="alert alert-good mono">Ksh ${revenue.toLocaleString()} total revenue · ${sales} items sold</div>
    ${breakdownHtml}
    <p class="muted" style="margin-top:10px;">${restocks} item(s) restocked that day.</p>
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
      saveBtn.disabled = false;
      saveBtn.textContent = "Save to stock";
    }
  });
}

function openSellShoeModal(shoeId) {
  const shoe = shoesCache.find(s => s.id === shoeId);
  if (!shoe) return;

  if (!canEdit()) {
    openModal(`
      <div class="modal-head"><h2>Size ${shoe.size}</h2>
        <button class="modal-close" id="close-modal">✕</button></div>
      <img class="photo" src="${shoe.imageUrl}" style="width:100%; border-radius:8px;" />
      <p class="muted">Asking range: Ksh ${shoe.priceMin}–${shoe.priceMax}</p>
    `);
    document.getElementById("close-modal").addEventListener("click", closeModal);
    return;
  }

  openModal(`
    <div class="modal-head"><h2>Sell — Size ${shoe.size}</h2>
      <button class="modal-close" id="close-modal">✕</button></div>
    <img class="photo" src="${shoe.imageUrl}" style="width:100%; border-radius:8px;" />
    <p class="muted">Asking range: Ksh ${shoe.priceMin}–${shoe.priceMax}</p>
    <form id="sell-shoe-form">
      <label for="sold-price">Price you sold it for (Ksh)</label>
      <input type="number" id="sold-price" placeholder="e.g. 1600" required />
      <div class="spacer"></div>
      <button type="submit" class="btn btn-primary">Mark as sold</button>
    </form>
    <div class="spacer"></div>
    <button class="btn btn-outline" id="remove-shoe-btn" style="border-color:var(--red); color:var(--red);">Remove listing (duplicate / mistake)</button>
  `);

  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("remove-shoe-btn").addEventListener("click", async () => {
    const ok = window.confirm("Remove this shoe listing? Use this only for duplicates or mistakes — not for sales.");
    if (!ok) return;
    await deleteDoc(doc(db, "shoes", shoeId));
    toast("Listing removed");
    closeModal();
  });
  document.getElementById("sell-shoe-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const soldPrice = Number(document.getElementById("sold-price").value);
    await updateDoc(doc(db, "shoes", shoeId), {
      status: "sold",
      soldPrice,
      dateSold: serverTimestamp(),
      soldBy: currentUser.uid
    });
    await logTransaction({ type: "sale", category: "shoe", subtype: shoe.size, qty: 1, price: soldPrice, shoeId });
    toast(`Sold for Ksh ${soldPrice}`);
    closeModal();
  });
}

async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", cloudinaryConfig.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/image/upload`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Cloudinary upload failed");
  const data = await res.json();
  return data.secure_url;
}

// ============================================================
// CAPES & HANDBAGS (bulk count stock)
// ============================================================

function renderStock() {
  contentEl.innerHTML = `
    <div class="eyebrow">Bulk-count stock</div>
    <h1>Capes &amp; Handbags</h1>
    <p class="muted">Tap + or − to sell or restock. Every change is logged.</p>

    <h3 style="margin-top:16px;">Capes</h3>
    <div id="capes-rows"></div>

    <h3 style="margin-top:16px;">Handbags</h3>
    <div id="handbags-rows"></div>
  `;

  const capesBox = document.getElementById("capes-rows");
  capesBox.innerHTML = CAPE_TYPES.map(t => stockRowHtml("capes", t.key, t.label, capesStock[t.key] || 0)).join("");

  const bagsBox = document.getElementById("handbags-rows");
  bagsBox.innerHTML = HANDBAG_TYPES.map(t => stockRowHtml("handbags", t.key, t.label, handbagsStock[t.key] || 0)).join("");

  contentEl.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", () => handleStockAdjust(btn.dataset.category, btn.dataset.subtype, btn.dataset.action));
  });
}

function stockRowHtml(category, subtype, label, count) {
  return `
    <div class="ledger-row">
      <div class="label">${label}</div>
      <div class="count-controls">
        ${canEdit() ? `<button data-action="dec" data-category="${category}" data-subtype="${subtype}">−</button>` : ""}
        <div class="count">${count}</div>
        ${canEdit() ? `<button data-action="inc" data-category="${category}" data-subtype="${subtype}">+</button>` : ""}
      </div>
    </div>
  `;
}

async function handleStockAdjust(category, subtype, action) {
  const currentVal = category === "capes" ? capesStock[subtype] : handbagsStock[subtype];

  if (action === "dec") {
    if ((currentVal || 0) <= 0) { toast("Already at zero"); return; }
    const typeList = category === "capes" ? CAPE_TYPES : HANDBAG_TYPES;
    const known = typeList.find(t => t.key === subtype)?.price;
    let price = window.prompt(
      `Price sold for (Ksh):`,
      known != null ? String(known) : ""
    );
    if (price === null) return; // cancelled
    price = price ? Number(price) : 0;
    await updateDoc(doc(db, "stock", category), { [subtype]: increment(-1) });
    await logTransaction({ type: "sale", category, subtype, qty: 1, price });
    toast("Recorded as sold");
  } else {
    const qtyStr = window.prompt("How many are you restocking?", "1");
    const qty = Number(qtyStr);
    if (!qty || qty <= 0) return;
    await updateDoc(doc(db, "stock", category), { [subtype]: increment(qty) });
    await logTransaction({ type: "restock", category, subtype, qty });
    toast(`Restocked +${qty}`);
  }
}

// ============================================================
// VARIANCE CHECK
// ============================================================

function renderVariance() {
  const inStockShoes = shoesCache.filter(s => s.status === "in_stock").length;

  contentEl.innerHTML = `
    <div class="eyebrow">Physical count vs system</div>
    <h1>Variance check</h1>
    <p class="muted">Count what's actually on the shelf, enter it below, and I'll flag any mismatch.</p>
    <div id="variance-list"></div>
  `;

  const items = [
    { category: "shoe", subtype: "all", label: "Shoes (all sizes)", expected: inStockShoes },
    ...CAPE_TYPES.map(t => ({ category: "capes", subtype: t.key, label: t.label, expected: capesStock[t.key] || 0 })),
    ...HANDBAG_TYPES.map(t => ({ category: "handbags", subtype: t.key, label: t.label, expected: handbagsStock[t.key] || 0 }))
  ];

  const list = document.getElementById("variance-list");
  list.innerHTML = items.map(item => `
    <div class="card">
      <div class="label">${item.label}</div>
      <div class="muted mono">System says: ${item.expected}</div>
      <div class="row" style="margin-top:8px;">
        <input type="number" placeholder="Actual count" id="count-${item.category}-${item.subtype}" />
        <button class="btn btn-outline btn-sm" data-check="${item.category}|${item.subtype}|${item.expected}|${item.label}">Check</button>
      </div>
      <div id="result-${item.category}-${item.subtype}"></div>
    </div>
  `).join("");

  list.querySelectorAll("[data-check]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [category, subtype, expected, label] = btn.dataset.check.split("|");
      runVarianceCheck(category, subtype, Number(expected), label);
    });
  });
}

async function runVarianceCheck(category, subtype, expected, label) {
  const input = document.getElementById(`count-${category}-${subtype}`);
  const actual = Number(input.value);
  const resultBox = document.getElementById(`result-${category}-${subtype}`);
  if (input.value === "") { toast("Enter the actual count first"); return; }

  const diff = actual - expected;

  await addDoc(collection(db, "variance_checks"), {
    category, subtype, expected, actual, diff,
    checkedBy: currentUser.uid, checkedByName: profile.name,
    timestamp: serverTimestamp()
  });

  if (diff === 0) {
    resultBox.innerHTML = `<div class="alert alert-good">Matches — no variance.</div>`;
  } else {
    const direction = diff > 0 ? "more than expected" : "missing";
    resultBox.innerHTML = `
      <div class="alert alert-danger">
        ${Math.abs(diff)} ${label} ${direction}. Flagged for review.
        ${isOwner() && category !== "shoe" ? `<button class="btn btn-danger btn-sm" style="margin-top:8px;" id="reconcile-${category}-${subtype}">Update system to match count</button>` : ""}
      </div>`;
    document.getElementById(`reconcile-${category}-${subtype}`)?.addEventListener("click", async () => {
      await updateDoc(doc(db, "stock", category), { [subtype]: actual });
      await logTransaction({ type: "variance_adjustment", category, subtype, qty: diff, note: `Adjusted ${expected} -> ${actual}` });
      toast("Stock count updated");
      resultBox.innerHTML = `<div class="alert alert-good">Updated to ${actual}.</div>`;
    });
  }
}

// ============================================================
// MONEY — expenses, wages owed, and a 7-day sales chart
// ============================================================

let revenueChartInstance = null;

async function renderMoney() {
  contentEl.innerHTML = `
    <div class="eyebrow">Business overview</div>
    <h1>Money</h1>
    <p class="muted">Revenue trend, shop expenses, and wages owed.</p>

    <h3 style="margin-top:16px;">Last 7 days — sales revenue</h3>
    <div class="card">
      <canvas id="revenue-chart" height="180"></canvas>
    </div>

    <h3 style="margin-top:16px;">Wages</h3>
    <div class="card" id="wages-card"><div class="loading-dots">Loading…</div></div>

    <h3 style="margin-top:16px;">Expenses</h3>
    <div class="card">
      ${canEdit() ? `
        <label for="exp-desc">What was it for?</label>
        <input type="text" id="exp-desc" placeholder="e.g. Soap, transport" />
        <label for="exp-amount">Amount (Ksh)</label>
        <input type="number" id="exp-amount" placeholder="e.g. 100" />
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-expense-btn">Add expense</button>
      ` : ""}
    </div>
    <div id="expenses-list"><div class="loading-dots">Loading…</div></div>
  `;

  document.getElementById("add-expense-btn")?.addEventListener("click", addExpense);
  loadRevenueChart();
  loadWages();
  loadExpenses();
}

async function loadRevenueChart() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const start = days[0];
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const q = query(
    collection(db, "transactions"),
    where("type", "==", "sale"),
    where("timestamp", ">=", Timestamp.fromDate(start)),
    where("timestamp", "<=", Timestamp.fromDate(end)),
    orderBy("timestamp", "asc")
  );
  const snap = await getDocs(q);

  const totals = days.map(() => 0);
  snap.forEach(docSnap => {
    const t = docSnap.data();
    if (!t.timestamp) return;
    const ts = t.timestamp.toDate();
    for (let i = 0; i < days.length; i++) {
      const dayEnd = new Date(days[i]);
      dayEnd.setHours(23, 59, 59, 999);
      if (ts >= days[i] && ts <= dayEnd) {
        totals[i] += t.price || 0;
        break;
      }
    }
  });

  const labels = days.map(d => d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }));
  const canvas = document.getElementById("revenue-chart");
  if (!canvas || typeof Chart === "undefined") return;

  if (revenueChartInstance) revenueChartInstance.destroy();
  revenueChartInstance = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Revenue (Ksh)",
        data: totals,
        backgroundColor: "#2F5233",
        borderRadius: 4
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

async function loadWages() {
  const box = document.getElementById("wages-card");
  const snap = await getDocs(query(collection(db, "wage_entries"), orderBy("timestamp", "desc")));
  let owed = 0;
  let rows = "";
  let count = 0;
  snap.forEach(d => {
    const w = d.data();
    owed += (w.amount || 0) - (w.paidAmount || 0);
    if (count < 10) {
      const dateStr = w.timestamp ? w.timestamp.toDate().toLocaleDateString() : "";
      rows += `
        <div class="ledger-row">
          <div class="label">${dateStr}</div>
          <div class="mono">Ksh ${w.paidAmount || 0} / ${w.amount || 0}</div>
        </div>`;
      count++;
    }
  });

  box.innerHTML = `
    <div class="alert ${owed > 0 ? "alert-danger" : "alert-good"} mono">
      ${owed > 0 ? `Ksh ${owed.toLocaleString()} owed to you` : "All caught up — nothing owed"}
    </div>
    ${canEdit() ? `<button class="btn btn-outline btn-sm" id="log-wage-btn" style="margin-top:8px;">Log today's wage</button>` : ""}
    <div style="margin-top:10px;">${rows || `<p class="muted">No wage entries yet.</p>`}</div>
  `;

  document.getElementById("log-wage-btn")?.addEventListener("click", logWage);
}

async function logWage() {
  const amountStr = window.prompt("How much of today's Ksh 300 wage was paid? (0-300)", "300");
  if (amountStr === null) return;
  const paidAmount = Math.max(0, Math.min(300, Number(amountStr) || 0));
  await addDoc(collection(db, "wage_entries"), {
    amount: 300,
    paidAmount,
    timestamp: serverTimestamp(),
    loggedBy: currentUser.uid
  });
  toast(paidAmount >= 300 ? "Marked as fully paid" : `Logged Ksh ${paidAmount} paid`);
  loadWages();
}

async function loadExpenses() {
  const box = document.getElementById("expenses-list");
  const snap = await getDocs(query(collection(db, "expenses"), orderBy("timestamp", "desc"), limit(20)));
  let total = 0;
  let rows = "";
  snap.forEach(d => {
    const e = d.data();
    total += e.amount || 0;
    const dateStr = e.timestamp ? e.timestamp.toDate().toLocaleDateString() : "";
    rows += `
      <div class="ledger-row">
        <div>
          <div class="label">${e.description || "Expense"}</div>
          <div class="muted mono">${dateStr} · ${e.byName || "—"}</div>
        </div>
        <div class="mono">Ksh ${e.amount || 0}</div>
      </div>`;
  });

  box.innerHTML = `
    <div class="alert alert-info mono">Ksh ${total.toLocaleString()} spent (last 20 entries)</div>
    ${rows || `<p class="muted">No expenses logged yet.</p>`}
  `;
}

async function addExpense() {
  const descEl = document.getElementById("exp-desc");
  const amtEl = document.getElementById("exp-amount");
  const description = descEl.value.trim();
  const amount = Number(amtEl.value);
  if (!description || !amount) { toast("Enter what it was for and the amount"); return; }

  await addDoc(collection(db, "expenses"), {
    description,
    amount,
    timestamp: serverTimestamp(),
    by: currentUser.uid,
    byName: profile.name
  });
  descEl.value = "";
  amtEl.value = "";
  toast("Expense added");
  loadExpenses();
}

// ============================================================
// SETTINGS / MORE
// ============================================================

function renderSettings() {
  contentEl.innerHTML = `
    <div class="eyebrow">Account</div>
    <h1>More</h1>
    <div class="card">
      <div class="label">${profile.name}</div>
      <div class="muted mono">${profile.role.toUpperCase()}</div>
    </div>

    <h2 style="margin-top:16px;">Sales history</h2>
    <div class="card">
      <label for="history-date">Pick a date</label>
      <input type="date" id="history-date" />
      <div class="spacer"></div>
      <button class="btn btn-outline" id="history-view-btn">View sales for this day</button>
    </div>

    ${isOwner() ? `<h2 style="margin-top:16px;">Staff permissions</h2><div id="staff-list"><div class="loading-dots">Loading…</div></div>` : ""}
    <button class="btn btn-outline" id="logout-btn" style="margin-top:20px;">Log out</button>
  `;

  document.getElementById("history-view-btn").addEventListener("click", () => {
    const val = document.getElementById("history-date").value;
    if (!val) { toast("Pick a date first"); return; }
    const [y, m, d] = val.split("-").map(Number);
    showSalesForDate(new Date(y, m - 1, d));
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });

  if (isOwner()) loadStaffList();
}

async function loadStaffList() {
  const snap = await getDocs(collection(db, "users"));
  const box = document.getElementById("staff-list");
  let rows = "";
  snap.forEach(d => {
    const u = d.data();
    // Skip anyone without a Gabu Stock role (e.g. Pro Tipsters accounts
    // living in the same shared users collection) and skip the owner.
    if (!u.role || u.role === "owner") return;
    const isEditor = u.role === "editor";
    rows += `
      <div class="ledger-row">
        <div class="label">${u.name}</div>
        <button class="btn btn-sm ${isEditor ? "btn-primary" : "btn-outline"}" data-uid="${d.id}" data-role="${u.role}">
          ${isEditor ? "Editor (tap to make viewer)" : "Viewer (tap to allow edits)"}
        </button>
      </div>`;
  });
  box.innerHTML = rows || `<p class="muted">No other staff accounts yet.</p>`;

  box.querySelectorAll("[data-uid]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newRole = btn.dataset.role === "editor" ? "viewer" : "editor";
      await updateDoc(doc(db, "users", btn.dataset.uid), { role: newRole });
      toast(`Access updated to ${newRole}`);
      loadStaffList();
    });
  });
}
