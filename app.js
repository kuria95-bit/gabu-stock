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
  { key: "standing", label: "Standing capes", price: 350 },
  { key: "round", label: "Round standing", price: 400 }
];
const HANDBAG_TYPES = [{ key: "total", label: "Handbags", price: null }];

// ---------- Global state ----------

let currentUser = null;
let profile = null;
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
  `);

  document.getElementById("close-modal").addEventListener("click", closeModal);
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
    ${isOwner() ? `<h2 style="margin-top:16px;">Staff permissions</h2><div id="staff-list"><div class="loading-dots">Loading…</div></div>` : ""}
    <button class="btn btn-outline" id="logout-btn" style="margin-top:20px;">Log out</button>
  `;

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
