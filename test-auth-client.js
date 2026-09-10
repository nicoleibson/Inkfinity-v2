const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get, query, orderByChild } = require("firebase/database");
const { getAuth, signInWithEmailAndPassword } = require("firebase/auth");

const firebaseConfig = {
  databaseURL: "https://inkfinity-2d470-default-rtdb.firebaseio.com",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Sign in with the known user (or just use signInAnonymously if enabled, but we don't know if it is).
// Let's create a fake user or just try to sign in with a known email?
