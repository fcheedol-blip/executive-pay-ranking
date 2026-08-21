// Fetches individual-compensation data by downloading and parsing the RAW
// disclosure document (document.xml) instead of OpenDART's structured
// summary API, which lags behind the raw filing by days to weeks.
// Usage: node fetch_pay_rawdoc.js <API_KEY> <bsns_year> <reprt_code> <period_label> <report_name_fragment> <fiscal_end e.g. 2026.06> [sector]
// If [sector] is given, only that sector's companies are (re-)fetched and
// merged into the existing period entry instead of replacing it wholesale.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { parseDocument } = require("./parse_raw_doc");

const DATA_DIR = path.join(__dirname, "..", "data");
const SITE_DIR = path.join(__dirname, "..", "site");

const [, , KEY, BSNS_YEAR, REPRT_CODE, PERIOD_LABEL, REPORT_FRAGMENT, FISCAL_END, SECTOR] = process.argv;
if (!KEY || !BSNS_YEAR || !REPRT_CODE || !PERIOD_LABEL || !REPORT_FRAGMENT || !FISCAL_END) {
  console.error(
    "Usage: node fetch_pay_rawdoc.js <API_KEY> <bsns_year> <reprt_code> <period_label> <report_name_fragment> <fiscal_end e.g. 2026.06> [sector]"
  );
  process.exit(1);
}

const corpCodes = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "corp_codes.json"), "utf-8"));
const companies = [];
for (const [sector, list] of Object.entries(corpCodes)) {
  if (SECTOR && sector !== SECTOR) continue;
  for (const c of list) companies.push({ ...c, sector });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findRceptNo(corp) {
  const params = new URLSearchParams({
    crtfc_key: KEY,
    corp_code: corp.corp_code,
    bgn_de: `${BSNS_YEAR}0101`,
    end_de: new Date().toISOString().slice(0, 10).replace(/-/g, ""),
    pblntf_ty: "A",
  });
  const res = await fetch(`https://opendart.fss.or.kr/api/list.json?${params.toString()}`);
  const json = await res.json();
  if (json.status !== "000" || !Array.isArray(json.list)) return null;
  const candidates = json.list.filter(
    (r) => r.report_nm.includes(REPORT_FRAGMENT) && r.report_nm.includes(FISCAL_END)
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.rcept_no.localeCompare(a.rcept_no));
  return candidates[0].rcept_no;
}

async function downloadAndParseOnce(rceptNo) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dartdoc-"));
  const zipPath = path.join(tmpDir, "doc.zip");
  const res = await fetch(
    `https://opendart.fss.or.kr/api/document.xml?crtfc_key=${KEY}&rcept_no=${rceptNo}`
  );
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(zipPath, buf);
  let xml;
  try {
    xml = execFileSync("unzip", ["-p", zipPath], { maxBuffer: 1024 * 1024 * 50 }).toString("utf-8");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return parseDocument(xml);
}

async function downloadAndParse(rceptNo, retries = 2) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await downloadAndParseOnce(rceptNo);
    } catch (e) {
      if (attempt > retries) throw e;
      await sleep(500 * attempt);
    }
  }
}

async function main() {
  const key = `${BSNS_YEAR}_${REPRT_CODE}`;
  const records = [];
  let ok = 0, noFiling = 0, errors = 0;

  for (const corp of companies) {
    try {
      const rceptNo = await findRceptNo(corp);
      if (!rceptNo) {
        noFiling++;
        console.log(`  - ${corp.name}: no matching filing found`);
        await sleep(150);
        continue;
      }
      const { directors, top5 } = await downloadAndParse(rceptNo);
      for (const row of directors) {
        records.push({
          name: row.name, position: row.position, company: corp.matched_name || corp.name,
          sector: corp.sector, amount_100m: row.amount_100m, source: "임원(이사·감사)",
          stlm_dt: `${FISCAL_END.replace(".", "-")}-30`, rcept_no: rceptNo,
        });
      }
      for (const row of top5) {
        records.push({
          name: row.name, position: row.position, company: corp.matched_name || corp.name,
          sector: corp.sector, amount_100m: row.amount_100m, source: "직원 상위5인",
          stlm_dt: `${FISCAL_END.replace(".", "-")}-30`, rcept_no: rceptNo,
        });
      }
      ok++;
      console.log(`  + ${corp.name}: ${directors.length + top5.length} rows (rcept ${rceptNo})`);
    } catch (e) {
      errors++;
      console.error(`  ! ${corp.name}: ${e.message}`);
    }
    await sleep(200);
  }

  console.log(`\nDone: ${ok} companies parsed, ${noFiling} no filing, ${errors} errors, ${records.length} total records`);

  const existing = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "all_periods.json"), "utf-8"));
  const idx = existing.findIndex((p) => p.key === key);
  if (idx === -1) {
    existing.push({ key, label: PERIOD_LABEL, bsns_year: BSNS_YEAR, reprt_code: REPRT_CODE, records });
  } else if (SECTOR) {
    // merge: keep every other sector's already-fetched records, replace only this one
    existing[idx].records = existing[idx].records.filter((r) => r.sector !== SECTOR).concat(records);
  } else {
    existing[idx] = { key, label: PERIOD_LABEL, bsns_year: BSNS_YEAR, reprt_code: REPRT_CODE, records };
  }

  fs.writeFileSync(path.join(DATA_DIR, "all_periods.json"), JSON.stringify(existing, null, 2), "utf-8");
  fs.mkdirSync(SITE_DIR, { recursive: true });
  fs.writeFileSync(path.join(SITE_DIR, "data.js"), `const PAY_DATA = ${JSON.stringify(existing)};\n`, "utf-8");
  console.log("Wrote data/all_periods.json and site/data.js");
}

main();
