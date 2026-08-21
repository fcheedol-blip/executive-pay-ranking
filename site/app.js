(function () {
  const periodSelect = document.getElementById("periodSelect");
  const periodControl = document.getElementById("periodControl");
  const sectorTabs = document.getElementById("sectorTabs");
  const searchInput = document.getElementById("searchInput");
  const rankingEl = document.getElementById("ranking");
  const summaryEl = document.getElementById("summary");

  const DATA = typeof PAY_DATA !== "undefined" ? PAY_DATA : [];

  let activeSector = "전체";

  function fmtAmount(v) {
    return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function renderRows(records, getMeta) {
    rankingEl.innerHTML = "";
    if (records.length === 0) {
      rankingEl.innerHTML = '<li class="empty">해당 조건의 데이터가 없습니다.</li>';
      return;
    }
    records.forEach((r, i) => {
      const li = document.createElement("li");
      li.className = "row";
      li.innerHTML = `
        <div class="rank">${i + 1}</div>
        <div class="who">
          <div class="name">${escapeHtml(r.name)}</div>
          <div class="meta">${escapeHtml(r.position)} · ${escapeHtml(r.company)} · ${getMeta(r)}</div>
        </div>
        <div class="amount">${fmtAmount(r.amount_100m)}</div>
      `;
      rankingEl.appendChild(li);
    });
  }

  function bySectorFilter(r) {
    return activeSector === "전체" || r.sector === activeSector;
  }

  function renderPeriodView() {
    const period = DATA.find((p) => p.key === periodSelect.value);
    if (!period) {
      summaryEl.textContent = "";
      rankingEl.innerHTML = '<li class="empty">데이터가 없습니다.</li>';
      return;
    }
    const records = period.records.filter(bySectorFilter);
    const companyCount = new Set(records.map((r) => r.company)).size;
    summaryEl.textContent = `${period.label} · ${records.length}건 · ${companyCount}개사`;
    renderRows(records, () => period.label);
  }

  function renderSearchView(query) {
    const q = query.trim().toLowerCase();
    const matches = [];
    for (const period of DATA) {
      for (const r of period.records) {
        if (!bySectorFilter(r)) continue;
        if (r.name.toLowerCase().includes(q) || r.company.toLowerCase().includes(q)) {
          matches.push({ ...r, periodLabel: period.label, periodKey: period.key });
        }
      }
    }
    matches.sort((a, b) => {
      if (a.periodKey !== b.periodKey) return b.periodKey.localeCompare(a.periodKey);
      return b.amount_100m - a.amount_100m;
    });
    const companyCount = new Set(matches.map((r) => r.company)).size;
    const peopleCount = new Set(matches.map((r) => r.name)).size;
    summaryEl.textContent = `"${query}" 검색 결과 · ${matches.length}건 · ${peopleCount}명 · ${companyCount}개사 (전체 기간)`;
    renderRows(matches, (r) => r.periodLabel);
  }

  function render() {
    const query = searchInput.value;
    if (query.trim()) {
      periodControl.classList.add("disabled");
      renderSearchView(query);
    } else {
      periodControl.classList.remove("disabled");
      renderPeriodView();
    }
  }

  function init() {
    DATA.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.key;
      opt.textContent = p.label;
      periodSelect.appendChild(opt);
    });
    if (DATA.length) periodSelect.value = DATA[DATA.length - 1].key;

    periodSelect.addEventListener("change", render);
    searchInput.addEventListener("input", render);
    sectorTabs.addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      sectorTabs.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      btn.classList.add("active");
      activeSector = btn.dataset.sector;
      render();
    });

    render();
  }

  init();
})();
