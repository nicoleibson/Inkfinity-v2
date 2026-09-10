const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get, query, orderByChild, equalTo } = require("firebase/database");

const firebaseConfig = {
  databaseURL: "https://inkfinity-2d470-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const q = query(ref(db, 'artworks'), orderByChild('moderationStatus'), equalTo('pending_deletion'));
get(q).then(snapshot => {
  console.log("Success:", snapshot.val());
  process.exit(0);
}).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
