const fs = require('fs');
const users = JSON.parse(fs.readFileSync('/tmp/users.json'));
let missingStatus = 0;
for (const uid in users) {
  if (!users[uid].status) {
    missingStatus++;
    console.log(`User ${uid} missing status`);
  }
}
console.log(`Total missing status: ${missingStatus}`);
