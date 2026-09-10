const admin = require("firebase-admin");
const dbUrl = "https://inkfinity-2d470-default-rtdb.firebaseio.com";
admin.initializeApp({ databaseURL: dbUrl });
const db = admin.database();
db.getRules().then(rules => {
  console.log(rules);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
