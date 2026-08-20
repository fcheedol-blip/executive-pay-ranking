// Dedupes records (same person can appear in both the director/auditor
// disclosure and the top-5-employee disclosure) and drops periods with
// no data (1Q/3Q are never disclosed under Korean rules).
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SITE_DIR = path.join(__dirname, "..", "site");

const periods = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "all_periods.json"), "utf-8"));

const stripSpaces = (s) => (s || "").replace(/\s+/g, "");

const cleaned = periods
  .filter((p) => p.records.length > 0)
  .map((p) => {
    const byKey = new Map();
    for (const raw of p.records) {
      const name = stripSpaces(raw.name);
      const position = stripSpaces(raw.position);
      if (!name || name === "-" || !raw.amount_100m || raw.amount_100m <= 0) continue;
      const r = { ...raw, name, position };
      const key = `${name}|${r.company}`;
      if (!byKey.has(key)) {
        byKey.set(key, { ...r, sources: [r.source] });
      } else {
        const existing = byKey.get(key);
        if (!existing.sources.includes(r.source)) existing.sources.push(r.source);
        if (r.amount_100m > existing.amount_100m) existing.amount_100m = r.amount_100m;
      }
    }
    const records = Array.from(byKey.values())
      .map(({ source, ...rest }) => rest)
      .sort((a, b) => b.amount_100m - a.amount_100m);
    return { ...p, records };
  });

fs.writeFileSync(path.join(DATA_DIR, "all_periods.json"), JSON.stringify(cleaned, null, 2), "utf-8");
fs.writeFileSync(path.join(SITE_DIR, "data.js"), `const PAY_DATA = ${JSON.stringify(cleaned)};\n`, "utf-8");

cleaned.forEach((p) => console.log(p.label, "-", p.records.length, "records"));
console.log("Wrote cleaned data/all_periods.json and site/data.js");
