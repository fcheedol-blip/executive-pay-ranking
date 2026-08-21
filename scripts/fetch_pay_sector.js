// Fetches pay data for ONE sector only and merges it into the existing
// data/all_periods.json (used when adding a new sector without re-fetching
// everything already collected).
// Usage: node fetch_pay_sector.js <API_KEY> <SECTOR_NAME>
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SITE_DIR = path.join(__dirname, "..", "site");

const KEY = process.argv[2];
const SECTOR = process.argv[3];
if (!KEY || !SECTOR) {
  console.error("Usage: node fetch_pay_sector.js <API_KEY> <SECTOR_NAME>");
  process.exit(1);
}

const corpCodes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "corp_codes.json"), "utf-8"));
const periods = JSON.parse(fs.readFileSync(path.join(__dirname, "periods.json"), "utf-8"));

const companies = (corpCodes[SECTOR] || []).map((c) => ({ ...c, sector: SECTOR }));
if (companies.length === 0) {
  console.error(`No companies found for sector "${SECTOR}" in corp_codes.json`);
  process.exit(1);
}

const ENDPOINTS = [
  { url: "https://opendart.fss.or.kr/api/hmvAuditIndvdlBySttus.json", source: "임원(이사·감사)" },
  { url: "https://opendart.fss.or.kr/api/indvdlByPay.json", source: "직원 상위5인" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function toNumber(amtStr) {
  if (!amtStr) return 0;
  const n = Number(String(amtStr).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function fetchOne(endpoint, corp, period) {
  const params = new URLSearchParams({
    crtfc_key: KEY,
    corp_code: corp.corp_code,
    bsns_year: period.bsns_year,
    reprt_code: period.reprt_code,
  });
  const res = await fetch(`${endpoint.url}?${params.toString()}`);
  const json = await res.json();
  if (json.status !== "000" || !Array.isArray(json.list)) return [];
  return json.list.map((row) => ({
    name: row.nm,
    position: row.ofcps,
    company: row.corp_name,
    sector: corp.sector,
    amount_100m: Math.round((toNumber(row.mendng_totamt) / 1e8) * 10) / 10,
    source: endpoint.source,
    stlm_dt: row.stlm_dt,
    rcept_no: row.rcept_no,
  }));
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "all_periods.json"), "utf-8"));
  const byPeriodKey = new Map(existing.map((p) => [p.key, p]));

  let done = 0;
  const totalCalls = companies.length * periods.length * ENDPOINTS.length;

  for (const period of periods) {
    const key = `${period.bsns_year}_${period.reprt_code}`;
    const newRecords = [];
    for (const corp of companies) {
      for (const endpoint of ENDPOINTS) {
        try {
          const rows = await fetchOne(endpoint, corp, period);
          newRecords.push(...rows);
        } catch (e) {
          console.error(`  ! error ${corp.name} ${period.label} ${endpoint.source}: ${e.message}`);
        }
        done++;
        if (done % 20 === 0) console.log(`  progress: ${done}/${totalCalls}`);
        await sleep(120);
      }
    }
    console.log(`${period.label}: +${newRecords.length} new records for ${SECTOR}`);
    if (newRecords.length === 0) continue;

    if (byPeriodKey.has(key)) {
      byPeriodKey.get(key).records.push(...newRecords);
    } else {
      const p = { key, label: period.label, bsns_year: period.bsns_year, reprt_code: period.reprt_code, records: newRecords };
      byPeriodKey.set(key, p);
      existing.push(p);
    }
  }

  fs.writeFileSync(path.join(DATA_DIR, "all_periods.json"), JSON.stringify(existing, null, 2), "utf-8");
  fs.mkdirSync(SITE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SITE_DIR, "data.js"), `const PAY_DATA = ${JSON.stringify(existing)};\n`, "utf-8");

  console.log("Done. Merged into data/all_periods.json and site/data.js");
}

main();
