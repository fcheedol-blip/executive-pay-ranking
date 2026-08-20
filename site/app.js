(function () {
  const periodSelect = document.getElementById("periodSelect");
  const sectorTabs = document.getElementById("sectorTabs");
  const rankingEl = document.getElementById("ranking");
  const summaryEl = document.getElementById("summary");

  const DATA = typeof PAY_DATA !== "undefined" ? PAY_DATA : [];

  let activeSector = "전체";

  function fmtAmount(v) {
    return `${v.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억`;
  }

  function render() {
    const period = DATA.find((p) => p.key === periodSelect.value);
    rankingEl.innerHTML = "";
    if (!period) {
      summaryEl.textContent = "";
      rankingEl.innerHTML = '<li class="empty">데이터가 없습니다.</li>';
      return;
    }
    const records =
      activeSector === "전체"
        ? period.records
        : period.records.filter((r) => r.sector === activeSector);

    const companyCount = new Set(records.map((r) => r.company)).size;
    summaryEl.textContent = `${period.label} · ${records.length}건 · ${companyCount}개사`;

    if (records.length === 0) {
      rankingEl.innerHTML = '<li class="empty">해당 조건의 공시 데이터가 없습니다.</li>';
      return;
    }

    records.forEach((r, i) => {
      const li = document.createElement("li");
      li.className = "row";
      li.innerHTML = `
        <div class="rank">${i + 1}</div>
        <div class="who">
          <div class="name">${r.name}</div>
          <div class="meta">${r.position} · ${r.company} · ${period.label}</div>
        </div>
        <div class="amount">${fmtAmount(r.amount_100m)}</div>
      `;
      rankingEl.appendChild(li);
    });
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
