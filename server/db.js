const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'cookbook.json');

function read() {
  const blank = { users: [], recipes: [], resetTokens: [], nextId: 1, nextUserId: 1 };
  if (!fs.existsSync(DB_PATH)) return blank;
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (!data.users) data.users = [];
    if (!data.nextUserId) data.nextUserId = 1;
    if (!data.resetTokens) data.resetTokens = [];
    return data;
  } catch {
    return blank;
  }
}

function write(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

module.exports = { read, write };
