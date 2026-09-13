import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, update } from "firebase/database";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import readline from "readline";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBp69Kb-QM4v9b67BtR4-1Ny6IeyyKNOQU",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "inkfinity-2d470.firebaseapp.com",
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL || "https://inkfinity-2d470-default-rtdb.firebaseio.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "inkfinity-2d470",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "inkfinity-2d470.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "536683564289",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:536683564289:web:948d0fa5a49ddc9dcbfeb4",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const isExecute = process.argv.includes("--execute");

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function main() {
  console.log("====================================================");
  console.log("     INKFINITY - HERRAMIENTA DE PURGA Y LIMPIEZA    ");
  console.log("====================================================");
  console.log(`Modo: ${isExecute ? "EJECUCIÓN REAL (--execute)" : "DIAGNÓSTICO (Dry Run)"}`);
  console.log("----------------------------------------------------\n");

  console.log("[1/3] Escaneando Firebase Realtime Database...");
  const usersSnap = await get(ref(database, "users"));
  const users = usersSnap.exists() ? usersSnap.val() : {};
  const userEntries = Object.entries(users);

  const artworksSnap = await get(ref(database, "artworks"));
  const artworks = artworksSnap.exists() ? artworksSnap.val() : {};

  const usernamesSnap = await get(ref(database, "usernames"));
  const usernames = usernamesSnap.exists() ? usernamesSnap.val() : {};

  console.log(`✓ Usuarios encontrados: ${userEntries.length}`);
  console.log(`✓ Alias de usernames registrados: ${Object.keys(usernames).length}`);
  console.log(`✓ Obras de arte activas: ${Object.keys(artworks).length}\n`);

  let base64AvatarsCount = 0;
  const heavyAvatars = [];
  let obsoleteStorageCount = 0;
  let expiredTrialsCount = 0;
  const orphanedLikesByUser = [];
  const staleNotificationsByUser = [];

  for (const [uid, u] of userEntries) {
    if (typeof u.avatarUrl === "string" && u.avatarUrl.startsWith("data:")) {
      base64AvatarsCount++;
      heavyAvatars.push({
        name: u.name || uid,
        sizeKb: Math.round(u.avatarUrl.length / 1024),
      });
    }

    if (u.storageUsed !== undefined) {
      obsoleteStorageCount++;
    }

    if (u.trialEndsAt) {
      expiredTrialsCount++;
    }

    if (u.likedArtworks && typeof u.likedArtworks === "object") {
      let dlikes = 0;
      for (const artId of Object.keys(u.likedArtworks)) {
        if (!artworks[artId]) {
          dlikes++;
        }
      }
      if (dlikes > 0) {
        orphanedLikesByUser.push({ name: u.name || uid, count: dlikes });
      }
    }

    if (u.notifications && typeof u.notifications === "object") {
      const nCount = Object.keys(u.notifications).length;
      if (nCount > 0) {
        staleNotificationsByUser.push({ name: u.name || uid, count: nCount });
      }
    }
  }

  const activeUsernamesByUid = {};
  for (const [uid, u] of userEntries) {
    if (u.username) {
      activeUsernamesByUid[uid] = u.username.toLowerCase();
    }
  }

  const staleUsernameList = [];
  for (const [uname, mappedUid] of Object.entries(usernames)) {
    const activeForUid = activeUsernamesByUid[mappedUid];
    if (!activeForUid || activeForUid !== uname.toLowerCase()) {
      const actualUser = users[mappedUid];
      staleUsernameList.push({
        alias: uname,
        mappedUid,
        actualUsername: actualUser?.username || "Usuario no existente",
      });
    }
  }

  const missingUsernames = [];
  for (const [uid, activeUname] of Object.entries(activeUsernamesByUid)) {
    if (!usernames[activeUname]) {
      missingUsernames.push({ username: activeUname, uid });
    }
  }

  console.log("[2/3] RESUMEN DE ELEMENTOS DETECTADOS:");
  console.log("----------------------------------------------------");
  console.log(`• Avatares pesados en Base64: ${base64AvatarsCount}`);
  for (const h of heavyAvatars) {
    console.log(`   - [${h.name}]: ${h.sizeKb} KB en Base64`);
  }

  console.log(`• Alias de usernames obsoletos / huérfanos: ${staleUsernameList.length}`);
  for (const s of staleUsernameList) {
    console.log(`   - "${s.alias}" apunta a UID: ${s.mappedUid} (Username actual: ${s.actualUsername})`);
  }

  console.log(`• Usernames faltantes en /usernames: ${missingUsernames.length}`);
  for (const m of missingUsernames) {
    console.log(`   - Registrar "${m.username}" -> UID: ${m.uid}`);
  }

  console.log(`• Likes huérfanos a obras inexistentes: ${orphanedLikesByUser.length} usuarios afectados`);
  for (const l of orphanedLikesByUser) {
    console.log(`   - [${l.name}]: ${l.count} likes huérfanos`);
  }

  console.log(`• Notificaciones obsoletas: ${staleNotificationsByUser.length} usuarios afectados`);
  for (const n of staleNotificationsByUser) {
    console.log(`   - [${n.name}]: ${n.count} notificaciones`);
  }

  console.log(`• Campos obsoletos (storageUsed / trialEndsAt): ${obsoleteStorageCount + expiredTrialsCount}\n`);

  if (!isExecute) {
    console.log("----------------------------------------------------");
    console.log("Para ejecutar la purga real, ejecuta:");
    console.log("  npm run purge:execute");
    console.log("O proporciona las credenciales mediante variables:");
    console.log("  ADMIN_EMAIL=\"...\" ADMIN_PASSWORD=\"...\" npm run purge:execute");
    console.log("----------------------------------------------------");
    process.exit(0);
  }

  console.log("[3/3] AUTENTICACIÓN REQUERIDA PARA MODIFICAR FIREBASE");
  console.log("Debes iniciar sesión con una cuenta Administrator o Super-Administrator.");

  let email = process.env.ADMIN_EMAIL;
  let password = process.env.ADMIN_PASSWORD;

  if (!email) {
    email = await askQuestion("Ingresa email de Administrador: ");
  }
  if (!password) {
    password = await askQuestion("Ingresa contraseña: ");
  }

  console.log("\nAutenticando...");
  const creds = await signInWithEmailAndPassword(auth, email, password);
  console.log(`✓ Autenticado como UID: ${creds.user.uid}`);

  const adminSnap = await get(ref(database, `users/${creds.user.uid}`));
  const adminProfile = adminSnap.exists() ? adminSnap.val() : null;
  const role = adminProfile?.role;

  if (role !== "Administrator" && role !== "Super-Administrator") {
    console.error(`❌ Error: El usuario autenticado tiene rol "${role || "Client"}", se requiere Administrator.`);
    process.exit(1);
  }

  console.log(`✓ Rol verificado: ${role}. Iniciando purga...\n`);

  // 1. Limpieza de usuarios
  let usersUpdated = 0;
  for (const [uid, u] of userEntries) {
    const updates = {};
    if (typeof u.avatarUrl === "string" && u.avatarUrl.startsWith("data:")) {
      updates["avatarUrl"] = "";
    }
    if (u.storageUsed !== undefined) {
      updates["storageUsed"] = null;
    }
    if (u.trialEndsAt) {
      updates["trialEndsAt"] = null;
    }
    if (u.likedArtworks) {
      updates["likedArtworks"] = null;
    }
    if (u.bookings) {
      updates["bookings"] = null;
    }
    if (u.notifications) {
      updates["notifications"] = null;
    }

    if (u.chats && typeof u.chats === "object") {
      const validChats = {};
      let hadMalformed = false;
      for (const [chatKey, val] of Object.entries(u.chats)) {
        if (!chatKey.endsWith("_") && !chatKey.startsWith("_") && chatKey.includes("_")) {
          validChats[chatKey] = val;
        } else {
          hadMalformed = true;
        }
      }
      if (hadMalformed) {
        updates["chats"] = Object.keys(validChats).length > 0 ? validChats : null;
      }
    }

    if (Object.keys(updates).length > 0) {
      await update(ref(database, `users/${uid}`), updates);
      usersUpdated++;
      console.log(`✓ Usuario limpiado: ${u.name || uid}`);
    }
  }

  // 2. Limpieza y sincronización de /usernames
  const usernameUpdates = {};
  for (const s of staleUsernameList) {
    usernameUpdates[s.alias] = null;
    console.log(`✓ Eliminado alias obsoleto: "${s.alias}"`);
  }
  for (const m of missingUsernames) {
    usernameUpdates[m.username] = m.uid;
    console.log(`✓ Registrado username canónico: "${m.username}" -> ${m.uid}`);
  }

  if (Object.keys(usernameUpdates).length > 0) {
    await update(ref(database, "usernames"), usernameUpdates);
  }

  console.log("\n====================================================");
  console.log("       ¡PURGA Y LIMPIEZA FINALIZADA CON ÉXITO!      ");
  console.log("====================================================");
  console.log(`• Usuarios actualizados y aligerados: ${usersUpdated}`);
  console.log(`• Nombres de usuario re-sincronizados: ${Object.keys(usernameUpdates).length}`);
  console.log("Base de datos completamente optimizada.");
  process.exit(0);
}

main().catch((err) => {
  console.error("\n❌ Error en el proceso de purga:", err.message || err);
  process.exit(1);
});
