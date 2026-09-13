import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, set, update, remove } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBp69Kb-QM4v9b67BtR4-1Ny6IeyyKNOQU",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "inkfinity-2d470.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://inkfinity-2d470-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "inkfinity-2d470",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "inkfinity-2d470.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "536683564289",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:536683564289:web:948d0fa5a49ddc9dcbfeb4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

async function purgeDatabase() {
    console.log("====================================================");
    console.log("     INKFINITY - HERRAMIENTA DE PURGA Y LIMPIEZA    ");
    console.log("====================================================");
    
    // Auth process skipped for local script simulation to avoid blocking UI
    // In real execution, we would prompt for credentials
    console.log("Este script debe ejecutarse localmente con credenciales.");
    console.log("Usa la interfaz web en /admin/cleanup para purgar la base de datos de manera segura.");
    process.exit(0);
}

purgeDatabase().catch(console.error);
