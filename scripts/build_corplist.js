// Parses data/CORPCODE.xml and matches names from companies.json.
// Usage: node build_corplist.js
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const xmlPath = path.join(DATA_DIR, "CORPCODE.xml");
const companiesPath = path.join(__dirname, "companies.json");

if (!fs.existsSync(xmlPath)) {
  console.error("CORPCODE.xml not found. Run fetch_corpcode.sh first.");
  process.exit(1);
}

const xml = fs.readFileSync(xmlPath, "utf-8");
const companies = JSON.parse(fs.readFileSync(companiesPath, "utf-8"));

// Simple regex parse of each <list>...</list> block
const entries = [];
const listRe = /<list>([\s\S]*?)<\/list>/g;
let m;
while ((m = listRe.exec(xml))) {
  const block = m[1];
  const get = (tag) => {
    const r = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
    const mm = r.exec(block);
    return mm ? mm[1].trim() : "";
  };
  entries.push({
    corp_code: get("corp_code"),
    corp_name: get("corp_name"),
    stock_code: get("stock_code"),
    modify_date: get("modify_date"),
  });
}

console.log(`Parsed ${entries.length} corp entries from DART.`);

const byName = new Map();
for (const e of entries) {
  if (!byName.has(e.corp_name)) byName.set(e.corp_name, []);
  byName.get(e.corp_name).push(e);
}

const result = {}; // sector -> [{name, corp_code, corp_cls, stock_code, matched}]
const notFound = [];

for (const [sector, names] of Object.entries(companies)) {
  result[sector] = [];
  for (const name of names) {
    let candidates = byName.get(name);
    if (!candidates || candidates.length === 0) {
      // fallback: loose substring match
      candidates = entries.filter((e) => e.corp_name.includes(name) || name.includes(e.corp_name));
    }
    if (!candidates || candidates.length === 0) {
      notFound.push(`${sector}/${name}`);
      continue;
    }
    // prefer listed (has stock_code) then most recently modified
    candidates.sort((a, b) => {
      const aListed = a.stock_code ? 1 : 0;
      const bListed = b.stock_code ? 1 : 0;
      if (aListed !== bListed) return bListed - aListed;
      return (b.modify_date || "").localeCompare(a.modify_date || "");
    });
    const c = candidates[0];
    result[sector].push({
      name,
      corp_code: c.corp_code,
      stock_code: c.stock_code,
      matched_name: c.corp_name,
    });
  }
}

fs.writeFileSync(
  path.join(DATA_DIR, "corp_codes.json"),
  JSON.stringify(result, null, 2),
  "utf-8"
);

console.log("Saved data/corp_codes.json");
if (notFound.length) {
  console.log("Not found in DART corp list (check spelling):");
  notFound.forEach((n) => console.log("  - " + n));
}
