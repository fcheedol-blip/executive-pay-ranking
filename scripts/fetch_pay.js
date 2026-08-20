// Fetches individual compensation data (>=500M KRW) from OpenDART for the
// companies in data/corp_codes.json across the periods in periods.json.
// Usage: node fetch_pay.js <API_KEY>
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const SITE_DIR = path.join(__dirname, "..", "site");

const KEY = process.argv[2];
if (!KEY) {
  console.error("Usage: node fetch_pay.js <API_KEY>");
  process.exit(1);
}

const corpCodes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "corp_codes.json"), "utf-8"));
const periods = JSON.parse(fs.readFileSync(path.join(__dirname, "periods.json"), "utf-8"));

// flatten companies with sector tag
const companies = [];
for (const [sector, list] of Object.entries(corpCodes)) {
  for (const c of list) companies.push({ ...c, sector });
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
    amount_100m: Math.round((toNumber(row.mendng_totamt) / 1e8) * 10) / 10, // 억원 단위
    source: endpoint.source,
    stlm_dt: row.stlm_dt,
    rcept_no: row.rcept_no,
  }));
}

async function main() {
  const allPeriods = [];
  let totalCalls = companies.length * periods.length * ENDPOINTS.length;
  let done = 0;

  for (const period of periods) {
    const records = [];
    for (const corp of companies) {
      for (const endpoint of ENDPOINTS) {
        try {
          const rows = await fetchOne(endpoint, corp, period);
          records.push(...rows);
        } catch (e) {
          console.error(`  ! error ${corp.name} ${period.label} ${endpoint.source}: ${e.message}`);
        }
        done++;
        if (done % 50 === 0) console.log(`  progress: ${done}/${totalCalls}`);
        await sleep(120);
      }
    }
    records.sort((a, b) => b.amount_100m - a.amount_100m);
    console.log(`${period.label}: ${records.length} records`);
    allPeriods.push({
      key: `${period.bsns_year}_${period.reprt_code}`,
      label: period.label,
      bsns_year: period.bsns_year,
      reprt_code: period.reprt_code,
      records,
    });
  }

  fs.writeFileSync(
    path.join(DATA_DIR, "all_periods.json"),
    JSON.stringify(allPeriods, null, 2),
    "utf-8"
  );

  fs.mkdirSync(SITE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(SITE_DIR, "data.js"),
    `const PAY_DATA = ${JSON.stringify(allPeriods)};\n`,
    "utf-8"
  );

  console.log("Done. Wrote data/all_periods.json and site/data.js");
}

main();
