// Parses a DART "document.xml" original-document file and extracts the
// "5억원 이상 개인별 보수현황" tables (directors/auditors + top-5 employees),
// returning only the current-period (당기) rows.
const fs = require("fs");

const DIRECTOR_MARK = "보수지급금액 5억원 이상인 이사";
const TOP5_MARK = "보수지급금액 5억원 이상 중 상위";

function lastIndexOfAll(text, needle) {
  return text.lastIndexOf(needle);
}

// DART sometimes tags the name/position/pay cells with ACODE (CMPK_NM,
// CMPK_LEV, CMPK_PAY for XBRL linking) and sometimes falls back to plain
// <TD> with no ACODE at all once a table has more rows than the standard
// template expects (seen e.g. on 유안타증권's 4th/5th top-earner rows).
// Rather than depend on ACODE, find each person block by its ROWSPAN="6"
// name cell (TE or TD, tagged or not), then read position/pay positionally
// from the first physical <TR> of that block: cell order is always
// [name, fiscal-year, position, pay, ...stock-option columns].
function extractPersonBlocks(section) {
  const nameRe = /<T[ED][^>]*ROWSPAN="6"[^>]*>([^<]*)<\/T[ED]>/g;
  const starts = [];
  let m;
  while ((m = nameRe.exec(section))) {
    starts.push({ index: m.index, name: m[1].trim() });
  }
  const blocks = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i].index;
    const end = i + 1 < starts.length ? starts[i + 1].index : section.length;
    blocks.push({ name: starts[i].name, text: section.slice(start, end) });
  }
  return blocks;
}

function firstLevPay(blockText) {
  const rowEnd = blockText.indexOf("</TR>");
  const row1 = rowEnd === -1 ? blockText : blockText.slice(0, rowEnd);
  const cellRe = /<T[ED][^>]*>([^<]*)<\/T[ED]>/g;
  const cells = [];
  let m;
  while ((m = cellRe.exec(row1))) cells.push(m[1].trim());
  // cells: [0]=name, [1]=fiscal year (당기/전기/전전기), [2]=position, [3]=pay
  return {
    position: cells[2] || "",
    payRaw: cells[3] !== undefined ? Number(cells[3].replace(/,/g, "")) : NaN,
  };
}

function detectWonScale(section) {
  // <TU ... AUNIT="WONSTOCK" AUNITVALUE="N" ...>(단위 : ...)</TU>
  // N=1 -> 원 (KRW 1), N=7 -> 백만원 (KRW 1,000,000); actual_won = value * 10^(N-1)
  const m = /AUNIT="WONSTOCK"\s+AUNITVALUE="(\d+)"/.exec(section);
  if (!m) return 1; // assume raw won if not found
  return Math.pow(10, Number(m[1]) - 1);
}

// Some companies (esp. banks disclosing retired employees) render each
// person as a separate mini-table, followed later by an unrelated
// explanatory table (e.g. "급여/퇴직소득 산정기준") that happens to reuse
// the same ROWSPAN="6" cell shape and would otherwise be misread as more
// people. A real person's name is plain Hangul/spacing; reject anything
// with digits or parenthesized fiscal-year labels like "제66기(전기)".
function looksLikeName(name) {
  if (!name || name === "-") return false;
  if (/\d/.test(name)) return false;
  return /^[가-힣\s·]+$/.test(name);
}

function parseSection(section, maxCount = Infinity) {
  if (!section) return [];
  const wonScale = detectWonScale(section);
  const blocks = extractPersonBlocks(section);
  const rows = [];
  for (const b of blocks) {
    if (rows.length >= maxCount) break;
    if (!looksLikeName(b.name)) continue;
    const { position, payRaw } = firstLevPay(b.text);
    if (!Number.isFinite(payRaw) || payRaw <= 0) continue;
    const won = payRaw * wonScale;
    const amount_100m = Math.round((won / 1e8) * 10) / 10;
    // sanity bound: catches unit-conversion bugs (e.g. a real 원-scale document
    // misread as 백만원 comes out ~10,000x too large), not real large bonuses —
    // 메리츠금융지주 disclosed a genuine 832.7억 stock-based payout in 2024, so
    // this must stay generous.
    if (amount_100m <= 0 || amount_100m > 10000) continue;
    rows.push({ name: b.name, position, amount_100m });
  }
  return rows;
}

function parseDocument(xmlText) {
  const dirIdx = lastIndexOfAll(xmlText, DIRECTOR_MARK);
  const top5Idx = lastIndexOfAll(xmlText, TOP5_MARK);
  if (dirIdx === -1 || top5Idx === -1 || top5Idx <= dirIdx) {
    return { directors: [], top5: [] };
  }
  const directorSection = xmlText.slice(dirIdx, top5Idx);
  const top5Section = xmlText.slice(top5Idx, top5Idx + 120000);
  return {
    directors: parseSection(directorSection), // no fixed cap: any number of directors can qualify
    top5: parseSection(top5Section, 5), // regulation caps this table at exactly 5 people
  };
}

module.exports = { parseDocument };

if (require.main === module) {
  const file = process.argv[2];
  const xml = fs.readFileSync(file, "utf-8");
  console.log(JSON.stringify(parseDocument(xml), null, 2));
}
