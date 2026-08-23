// ============================================================
// GABU MTUMBA COLLECTION — STOCK SYSTEM CONFIG
// ============================================================
// FIREBASE: reusing the same Firebase project as Pro Tipsters.
// CLOUDINARY: cloudinary.com dashboard -> Cloud Name (top of
// page). Then Settings -> Upload -> "Upload presets" -> Add
// upload preset -> set Signing Mode to "Unsigned" -> save ->
// copy the preset name below.
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAM8rbDtHmITlTF9ucEjbYuoyAiqB8UuZo",
  authDomain: "pro-tipsters-94171.firebaseapp.com",
  projectId: "pro-tipsters-94171",
  storageBucket: "pro-tipsters-94171.firebasestorage.app",
  messagingSenderId: "737923794509",
  appId: "1:737923794509:web:921f6a558c11786beebe04"
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
