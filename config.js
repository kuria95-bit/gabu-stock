// ============================================================
// GABU MTUMBA COLLECTION — STOCK SYSTEM CONFIG
// ============================================================
// Fill these in tonight when you have PC access. Nothing else
// in the app needs to change once these are correct.
//
// FIREBASE: console.firebase.google.com -> your Pro Tipsters
// project -> Project Settings -> General -> "Your apps" ->
// Web app -> copy the firebaseConfig object values below.
// (Reuses the same Firebase project as Pro Tipsters — safe,
// see notes in project README.)
//
// CLOUDINARY: cloudinary.com dashboard -> Cloud Name (top of
// page). Then Settings -> Upload -> "Upload presets" -> Add
// upload preset -> set Signing Mode to "Unsigned" -> save ->
// copy the preset name below.
// ============================================================

export const firebaseConfig = {
  apiKey: "TODO_PASTE_API_KEY",
  authDomain: "TODO_PASTE_AUTH_DOMAIN",
  projectId: "TODO_PASTE_PROJECT_ID",
  storageBucket: "TODO_PASTE_STORAGE_BUCKET",
  messagingSenderId: "TODO_PASTE_SENDER_ID",
  appId: "TODO_PASTE_APP_ID"
};

export const cloudinaryConfig = {
  cloudName: "TODO_PASTE_CLOUD_NAME",
  uploadPreset: "TODO_PASTE_UNSIGNED_PRESET_NAME"
};

// Shop identity — used across the UI
export const shopConfig = {
  name: "Gabu Mtumba Collection",
  shortName: "Gabu",
  mpesaTill: "6012928"
};
