(() => {
  "use strict";

  const data = window.REHAB_DATA || [];
  const $ = (selector) => document.querySelector(selector);
  const elements = {
    search: $("#searchInput"),
    heroSuggestions: $("#heroSuggestions"),
    district: $("#districtFilter"),
    type: $("#typeFilter"),
    verification: $("#verificationFilter"),
    sort: $("#sortFilter"),
    results: $("#results"),
    resultCount: $("#resultCount"),
    empty: $("#emptyState"),
    activeFilters: $("#activeFilters"),
    dialog: $("#detailDialog"),
    dialogContent: $("#dialogContent"),
    favoriteToggle: $("#favoriteToggle"),
    toast: $("#toast"),
  };

  function loadFavorites() {
    try {
      return JSON.parse(window.localStorage?.getItem("ulsan-rehab-favorites") || "[]").map(String);
    } catch {
      return [];
    }
  }

  const state = {
    query: "",
    district: "",
    type: "",
    verification: "",
    preset: "",
    favoritesOnly: false,
    favorites: new Set(loadFavorites()),
  };

  const VERIFIED = /HIRA|공식|공단|홈페이지 확인|개별확인/;
  const NEEDS_CALL = /확인필요|후보|전화확인/;
  const ABSENT = /해당없음|미확인|확인필요|^$/;
  const RECOVERY_ABSENT = /해당없음|^$/;
  const districtOrder = ["중구", "남구", "동구", "북구", "울주군"];

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));

  const normalize = (value) => String(value || "").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
  const isPhone = (phone) => /^(?:\d{2,4})-\d/.test(phone || "");
  const sourceUrls = (item) => String(item.sources || "").match(/https?:\/\/[^\s;]+/g) || [];
  const homepageUrl = (item) => sourceUrls(item).find((url) =>
    !/hira\.or\.kr|comwel\.or\.kr|karm\.or\.kr|nrc\.go\.kr|mohw\.go\.kr|kmspecialist\.org|ddoga\.co\.kr|caredoc\.kr/i.test(url)
  );
  const homepageSearchUrl = (item) =>
    `https://search.naver.com/search.naver?query=${encodeURIComponent(item.name)}`;
  const verifiedScore = (item) => {
    let score = 0;
    if (/공식|HIRA 확인|HIRA 개별확인|공단/.test(item.verification)) score += 4;
    else if (VERIFIED.test(item.verification)) score += 2;
    if (item.rehabDept === "있음") score += 2;
    if (!ABSENT.test(item.recovery)) score += 2;
    if (isPhone(item.phone)) score += 1;
    return score;
  };
  const mapUrl = (item) => `https://map.naver.com/p/search/${encodeURIComponent(`${item.name} ${item.district}`)}`;
  const kakaoMapUrl = (item) => `https://map.kakao.com/link/search/${encodeURIComponent(`${item.name} ${item.district}`)}`;
  const youtubeUrl = (item) => `https://www.youtube.com/results?search_query=${encodeURIComponent(item.name)}`;
  
  const getShareText = (item) => {
    return `[울산 재활기관 정보 공유]
■ 기관명: ${item.name} (${item.type})
■ 구·군: ${item.district}
■ 전문의: ${item.rehabDept === "있음" ? `재활의학과 있음 (${item.specialists})` : "확인필요"}
■ 형태: ${item.careType}
■ 대상/질환: ${item.conditions}
■ 지정/특화: ${item.specialty || "해당없음"}
■ 회복기 지정: ${item.recovery}
■ 산재/자보: ${item.workersComp} / ${item.autoInsurance}
■ 전화번호: ${item.phone || "확인필요"}
■ 주소: ${item.address}

* 네이버 지도: ${mapUrl(item)}
* 카카오맵: ${kakaoMapUrl(item)}
* 관련 유튜브: ${youtubeUrl(item)}`;
  };
  let activeDetailItem = null;

  function presetMatches(item, preset) {
    const text = normalize(Object.values(item).join(" "));
    const rules = {
      rehab: () => item.rehabDept === "있음" || /있음/.test(item.rehabDept),
      inpatient: () => /입원|요양입원/.test(item.careType),
      care: () => /요양병원/.test(item.type) || /요양재활|재활요양/.test(text),
      recovery: () => !RECOVERY_ABSENT.test(item.recovery),
      workers: () => /재활인증 확인|산재 재활인증|재활인증의료기관/.test(`${item.workersComp} ${item.specialty} ${item.notes}`),
      auto: () => /가능|확인|자동차보험|교통사고/.test(`${item.autoInsurance} ${item.conditions}`) && !/해당없음/.test(item.autoInsurance),
      oriental: () => /한의원|한방병원/.test(item.type) || /한방재활/.test(text),
      call: () => !isPhone(item.phone),
    };
    return !preset || rules[preset]?.();
  }

  function filterData() {
    const terms = String(state.query || "").toLocaleLowerCase("ko-KR").trim().split(/\s+/).filter(Boolean).map(normalize);
    const filtered = data.filter((item) => {
      const haystack = normalize(Object.values(item).join(" "));
      if (terms.some((term) => !haystack.includes(term))) return false;
      if (state.district && item.district !== state.district) return false;
      if (state.type && item.type !== state.type) return false;
      if (state.verification === "verified" && !VERIFIED.test(item.verification)) return false;
      if (state.verification === "call" && !NEEDS_CALL.test(`${item.verification} ${item.notes}`)) return false;
      if (!presetMatches(item, state.preset)) return false;
      if (state.favoritesOnly && !state.favorites.has(String(item.id))) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      if (elements.sort.value === "name") return a.name.localeCompare(b.name, "ko");
      if (elements.sort.value === "district") {
        return districtOrder.indexOf(a.district) - districtOrder.indexOf(b.district) || a.name.localeCompare(b.name, "ko");
      }
      return verifiedScore(b) - verifiedScore(a) || a.name.localeCompare(b.name, "ko");
    });
  }

  function tagsFor(item) {
    const tags = [];
    if (item.rehabDept === "있음" || /있음/.test(item.rehabDept)) tags.push("재활의학과");
    if (/입원/.test(item.careType)) tags.push("입원재활");
    if (!RECOVERY_ABSENT.test(item.recovery)) tags.push("회복기");
    if (/재활인증 확인|재활인증/.test(item.workersComp)) tags.push("산재 재활인증");
    if (/가능|확인필요/.test(item.autoInsurance)) tags.push("자동차보험");
    if (/운영 확인|가능성 높음|외래\/입원/.test(item.dayRehab)) tags.push("낮병동");
    return tags.slice(0, 4);
  }

  function verificationBadge(item) {
    if (/공식|HIRA 확인|HIRA 개별확인|공단/.test(item.verification)) return ["확인 자료", ""];
    if (VERIFIED.test(item.verification)) return ["홈페이지 확인", ""];
    return ["전화확인 권장", "warning"];
  }

  function cardTemplate(item) {
    const [verification, warningClass] = verificationBadge(item);
    const tags = tagsFor(item);
    const favorite = state.favorites.has(String(item.id));
    const phoneLink = isPhone(item.phone)
      ? `<a href="tel:${escapeHtml(item.phone)}" data-phone="${escapeHtml(item.phone)}" data-name="${escapeHtml(item.name)}">전화번호</a>`
      : ``;
    const homepage = homepageUrl(item);

    return `
      <article class="institution-card" data-id="${escapeHtml(item.id)}">
        <button class="favorite-button ${favorite ? "active" : ""}" data-action="favorite" aria-label="${escapeHtml(item.name)} 관심기관 ${favorite ? "해제" : "추가"}" title="관심기관">${favorite ? "★" : "☆"}</button>
        <div class="card-top">
          <span class="badge">${escapeHtml(item.district)}</span>
          <span class="badge type">${escapeHtml(item.type)}</span>
          <span class="badge ${warningClass}">${verification}</span>
        </div>
        <h3>${escapeHtml(item.name)}</h3>
        <p class="card-subtitle">${escapeHtml(item.specialty || item.inclusion)}</p>
        <div class="card-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("") || "<span>상세정보 확인</span>"}</div>
        <div class="card-meta">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
          <span>${escapeHtml(item.address)}</span>
        </div>
        <div class="card-actions">
          ${phoneLink}
          <a href="${mapUrl(item)}" target="_blank" rel="noopener">지도 보기</a>
          <a href="${escapeHtml(homepage || homepageSearchUrl(item))}" target="_blank" rel="noopener">${homepage ? "홈페이지" : "홈페이지 찾기"}</a>
          <button class="detail-button" data-action="detail">상세 보기</button>
        </div>
      </article>`;
  }

  function render() {
    const items = filterData();
    elements.resultCount.textContent = items.length.toLocaleString("ko-KR");
    elements.results.innerHTML = items.map(cardTemplate).join("");
    elements.results.hidden = items.length === 0;
    elements.empty.hidden = items.length !== 0;
    renderActiveFilters();
    renderHeroSuggestions(items);
  }

  function renderHeroSuggestions(items) {
    if (!state.query) {
      elements.heroSuggestions.hidden = true;
      elements.heroSuggestions.innerHTML = "";
      return;
    }
    const visible = items.slice(0, 5);
    elements.heroSuggestions.hidden = false;
    elements.heroSuggestions.innerHTML = visible.length ? `
      <div class="suggestion-summary">
        <span><strong>${items.length}</strong>개 기관 검색됨</span>
        <span>기관을 선택하면 상세정보가 열립니다</span>
      </div>
      <div class="suggestion-list">
        ${visible.map((item) => `
          <button class="suggestion-item" data-suggestion-id="${escapeHtml(item.id)}">
            <span>
              <span class="suggestion-name">${escapeHtml(item.name)}</span>
              <span class="suggestion-meta">${escapeHtml(item.district)} · ${escapeHtml(item.type)} · ${escapeHtml(item.phone)}</span>
            </span>
            <span class="suggestion-arrow">상세보기 ›</span>
          </button>`).join("")}
      </div>
      <button class="suggestion-more" data-suggestion-more>검색 결과 전체 보기 ↓</button>
    ` : `<div class="suggestion-empty">“${escapeHtml(state.query)}”에 해당하는 기관이 없습니다.</div>`;
  }

  function renderActiveFilters() {
    const chips = [];
    if (state.query) chips.push(["query", `검색: ${state.query}`]);
    if (state.district) chips.push(["district", state.district]);
    if (state.type) chips.push(["type", state.type]);
    if (state.verification) chips.push(["verification", state.verification === "verified" ? "확인자료 우선" : "전화확인 대상"]);
    if (state.preset) {
      const presetLabel = document.querySelector(`[data-preset="${state.preset}"]`)?.textContent;
      chips.push(["preset", presetLabel]);
    }
    if (state.favoritesOnly) chips.push(["favorites", "관심기관만"]);
    elements.activeFilters.innerHTML = chips.map(([key, label]) =>
      `<button class="filter-chip" data-remove="${key}" title="조건 해제">${escapeHtml(label)} ×</button>`
    ).join("");
  }

  function detailRows(item) {
    const fields = [
      ["재활의학과", `${item.rehabDept} · 전문의 ${item.specialists}`],
      ["재활 형태", item.careType],
      ["주요 질환·대상", item.conditions],
      ["지정·특화", item.specialty],
      ["회복기 재활기관", item.recovery],
      ["산재 지정·인증", item.workersComp],
      ["자동차보험", item.autoInsurance],
      ["낮병동·주간재활", item.dayRehab],
      ["주소", item.address],
      ["전화", item.phone],
      ["검증수준", item.verification],
      ["확인 메모", item.notes],
    ];
    return fields.map(([term, description]) =>
      `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(description || "정보 없음")}</dd>`
    ).join("");
  }

  function sourceLinks(sources) {
    const urls = String(sources || "").match(/https?:\/\/[^\s;]+/g) || [];
    return urls.length
      ? urls.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">출처 ${index + 1} ↗</a>`).join("")
      : "등록된 링크 없음";
  }

  function detailNotice(item) {
    if (item.recovery === "제3기 지정") {
      return '<span class="dialog-notice" style="background: var(--amber); color: var(--white); font-weight: 800; font-size: 11px; padding: 4px 10px; margin-bottom: 8px; display: inline-block; border-radius: 6px; letter-spacing: 0;">💡 보건복지부 지정 회복기 재활기관</span>';
    }
    if (/한방병원|한의원/.test(item.type)) {
      return '<span class="dialog-notice oriental">한방재활 후보 · 의과 재활의학과와 구분</span>';
    }
    if (item.rehabDept === "있음" || /있음/.test(item.rehabDept)) {
      return '<span class="dialog-notice">✓ 재활의학과 확인 기관</span>';
    }
    return '<span class="dialog-notice review">☎ 최신 진료·입원 운영 여부 전화 확인 권장</span>';
  }

  function openDetail(item) {
    activeDetailItem = item;
    const phoneAction = isPhone(item.phone)
      ? `<a href="tel:${escapeHtml(item.phone)}" data-phone="${escapeHtml(item.phone)}" data-name="${escapeHtml(item.name)}">☎ 전화번호 보기</a>`
      : ``;
    const homepage = homepageUrl(item);
    elements.dialogContent.innerHTML = `
      <div class="dialog-header">
        <div class="dialog-title-wrap">
          ${detailNotice(item)}
          <p>${escapeHtml(item.district)} · ${escapeHtml(item.type)}</p>
          <h2 id="dialogTitle">${escapeHtml(item.name)}</h2>
        </div>
        <button class="dialog-close" aria-label="닫기">×</button>
      </div>
      <div class="dialog-body">
        <div class="dialog-actions">
          ${phoneAction}
          <a href="${mapUrl(item)}" target="_blank" rel="noopener">네이버 지도 ↗</a>
          <a href="${kakaoMapUrl(item)}" target="_blank" rel="noopener">카카오맵 ↗</a>
          <a href="${escapeHtml(homepage || homepageSearchUrl(item))}" target="_blank" rel="noopener">${homepage ? "공식 홈페이지 ↗" : "홈페이지 찾기 ↗"}</a>
          <a href="${youtubeUrl(item)}" target="_blank" rel="noopener" style="background: #ffebeb; border-color: #ffd6d6; color: #e50914;">유튜브 검색 ↗</a>
          <button type="button" data-copy="${escapeHtml(item.address)}">주소 복사</button>
          <button type="button" data-share="${escapeHtml(item.id)}">정보 공유</button>
        </div>
        <dl class="detail-list">
          ${detailRows(item)}
          <dt>근거 자료</dt><dd class="source-links">${sourceLinks(item.sources)}</dd>
        </dl>
      </div>`;
    elements.dialog.showModal();
  }

  function saveFavorites() {
    try {
      window.localStorage?.setItem("ulsan-rehab-favorites", JSON.stringify([...state.favorites]));
    } catch {
      // 로컬 파일 보안 제한
    }
  }

  function resetAll() {
    Object.assign(state, { query: "", district: "", type: "", verification: "", preset: "", favoritesOnly: false });
    elements.search.value = "";
    elements.district.value = "";
    elements.type.value = "";
    elements.verification.value = "";
    elements.favoriteToggle.setAttribute("aria-pressed", "false");
    document.querySelectorAll("[data-preset]").forEach((button) => button.classList.remove("active"));
    render();
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => elements.toast.classList.remove("show"), 1700);
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function populateFilters() {
    [...new Set(data.map((item) => item.district))]
      .sort((a, b) => districtOrder.indexOf(a) - districtOrder.indexOf(b))
      .forEach((value) => elements.district.add(new Option(value, value)));
    [...new Set(data.map((item) => item.type))].sort((a, b) => a.localeCompare(b, "ko"))
      .forEach((value) => elements.type.add(new Option(value, value)));

    $("#totalStat").textContent = data.length;
    $("#districtStat").textContent = new Set(data.map((item) => item.district).filter(Boolean)).size;
    $("#confirmedStat").textContent = data.filter((item) => item.rehabDept === "있음" || /있음/.test(item.rehabDept)).length;
    $("#recoveryStat").textContent = data.filter((item) => !RECOVERY_ABSENT.test(item.recovery)).length;
  }

  elements.search.addEventListener("input", (event) => { state.query = event.target.value.trim(); render(); });
  elements.heroSuggestions.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-suggestion-id]");
    if (suggestion) {
      const item = data.find((record) => String(record.id) === suggestion.dataset.suggestionId);
      if (item) openDetail(item);
      return;
    }
    if (event.target.closest("[data-suggestion-more]")) {
      document.querySelector(".directory").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  elements.district.addEventListener("change", (event) => { state.district = event.target.value; render(); });
  elements.type.addEventListener("change", (event) => { state.type = event.target.value; render(); });
  elements.verification.addEventListener("change", (event) => { state.verification = event.target.value; render(); });
  elements.sort.addEventListener("change", render);
  $("#resetButton").addEventListener("click", resetAll);
  $("#emptyReset").addEventListener("click", resetAll);
  $("#printButton").addEventListener("click", () => window.print());

  document.querySelector(".quick-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (!button) return;
    state.preset = state.preset === button.dataset.preset ? "" : button.dataset.preset;
    document.querySelectorAll("[data-preset]").forEach((item) => item.classList.toggle("active", item.dataset.preset === state.preset));
    document.querySelector(".directory").scrollIntoView({ behavior: "smooth", block: "start" });
    render();
  });

  elements.favoriteToggle.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    elements.favoriteToggle.setAttribute("aria-pressed", String(state.favoritesOnly));
    render();
  });

  elements.activeFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    const key = button.dataset.remove;
    if (key === "query") { state.query = ""; elements.search.value = ""; }
    if (key === "district") { state.district = ""; elements.district.value = ""; }
    if (key === "type") { state.type = ""; elements.type.value = ""; }
    if (key === "verification") { state.verification = ""; elements.verification.value = ""; }
    if (key === "preset") {
      state.preset = "";
      document.querySelectorAll("[data-preset]").forEach((item) => item.classList.remove("active"));
    }
    if (key === "favorites") {
      state.favoritesOnly = false;
      elements.favoriteToggle.setAttribute("aria-pressed", "false");
    }
    render();
  });

  elements.results.addEventListener("click", (event) => {
    const card = event.target.closest("[data-id]");
    const action = event.target.closest("[data-action]");
    if (!card || !action) return;
    const item = data.find((record) => String(record.id) === card.dataset.id);
    if (!item) return;
    if (action.dataset.action === "detail") openDetail(item);
    if (action.dataset.action === "favorite") {
      const id = String(item.id);
      state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
      saveFavorites();
      showToast(state.favorites.has(id) ? "관심기관에 저장했습니다." : "관심기관에서 삭제했습니다.");
      render();
    }
  });

  elements.dialog.addEventListener("click", async (event) => {
    if (event.target === elements.dialog || event.target.closest(".dialog-close")) elements.dialog.close();
    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
      await copyText(copyButton.dataset.copy);
      showToast("주소를 복사했습니다.");
    }
    const shareButton = event.target.closest("[data-share]");
    if (shareButton) {
      const item = data.find((record) => String(record.id) === shareButton.dataset.share);
      if (item) {
        await copyText(getShareText(item));
        showToast("상세 정보를 복사했습니다. 필요한 곳에 붙여넣어 공유하세요!");
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      elements.search.focus();
    }
    if (event.key === "Escape" && elements.search.value && !elements.dialog.open) {
      state.query = "";
      elements.search.value = "";
      render();
    }
  });

  document.querySelector(".guide-tabs")?.addEventListener("click", (event) => {
    const tabBtn = event.target.closest(".guide-tab-btn");
    if (!tabBtn) return;
    const targetId = tabBtn.dataset.tab;
    
    document.querySelectorAll(".guide-tab-btn").forEach((btn) => btn.classList.remove("active"));
    tabBtn.classList.add("active");
    
    document.querySelectorAll(".guide-pane").forEach((pane) => pane.classList.remove("active"));
    document.getElementById(targetId)?.classList.add("active");
  });

  document.addEventListener("click", async (event) => {
    const phoneBtn = event.target.closest("[data-phone]");
    if (!phoneBtn) return;
    
    event.preventDefault();
    const phone = phoneBtn.dataset.phone;
    const name = phoneBtn.dataset.name || "기관";
    
    await copyText(phone);
    showToast("전화번호를 복사했습니다.");
    alert(`📞 ${name} 전화번호 안내\n\n▶ 전화번호: ${phone}\n\n확인을 누르면 번호가 클립보드에 자동 복사됩니다.`);
  });

  const legalData = {
    about: {
      title: "서비스 소개",
      subtitle: "About Ulsan Rehab Guide",
      content: `
        <div class="legal-content">
          <h3>울산 재활기관 찾기 가이드 소개</h3>
          <p>본 서비스는 울산광역시 내의 재활의학과 보유 종합병원, 요양병원, 전문 재활병원 및 한방 전문 재활기관의 유용한 데이터들을 시민들이 편리하게 통합 검색할 수 있는 <strong>공익 정보 검색 플랫폼</strong>입니다.</p>
          <h3>제작 취지 및 배경</h3>
          <p>뇌졸중, 뇌손상, 척수손상 등 집중적인 재활 치료가 필요한 시기(회복기 골든타임)의 환자와 보호자들은 적합한 재활병원을 찾는 데 큰 어려움을 겪습니다. 본 서비스는 여러 공공기관에 산재되어 있는 병원 정보를 한 곳에 통합하여, 사용자가 원하는 조건(지역, 입원 여부, 산재/자보 가능 여부, 낮병동 등)을 쉽고 간편하게 필터링할 수 있도록 돕기 위해 비영리로 제작되었습니다.</p>
          <h3>정보 취합 및 데이터 검증처</h3>
          <p>본 가이드의 모든 기본 정보는 다음 공공기관의 공식 데이터 포털 공시 자료를 바탕으로 상시 검증 및 업데이트됩니다.</p>
          <ul>
            <li><strong>보건복지부(mohw.go.kr)</strong>: 공식 재활의료기관(회복기 재활) 지정 현황</li>
            <li><strong>건강보험심사평가원(hira.or.kr)</strong>: 의료기관 종별, 재활의학과 개설 여부, 등록 전문의 수</li>
            <li><strong>근로복지공단(comwel.or.kr)</strong>: 산재보험 재활인증의료기관 지정 데이터</li>
            <li><strong>국립재활원(nrc.go.kr)</strong>: 권역재활 및 재활 관련 공공 의학 통계</li>
          </ul>
        </div>`
    },
    terms: {
      title: "서비스 이용약관",
      subtitle: "Terms of Service",
      content: `
        <div class="legal-content">
          <h3>제1조 (목적)</h3>
          <p>본 약관은 "울산 재활기관 찾기"(이하 "서비스")가 제공하는 모든 정보 서비스의 이용조건 및 절차, 이용자의 책임 등 필요한 기본 사항을 규정합니다.</p>
          <h3>제2조 (정보의 한계와 면책)</h3>
          <p>본 서비스는 신뢰할 수 있는 공공기관(심평원, 근로복지공단 등)의 공식 오픈데이터와 홈페이지 공고 등을 수집 및 가공하여 제공하고 있으나, 실시간 데이터 연동이 아니므로 실제 병원의 최신 병상 상태, 진료 가능 여부 등과 차이가 있을 수 있습니다. 따라서 이용자는 병원 방문 또는 치료 시작 전 해당 의료기관에 전화 문의를 거쳐 최종 확인을 행해야 할 책임이 있습니다.</p>
          <h3>제3조 (손해배상 및 책임 제한)</h3>
          <p>서비스 운영자는 무료로 제공되는 정보의 누락, 지연, 오류 등으로 인해 발생하는 사용자의 직간접적 손해(입원 지연, 진료 거부 등)에 대하여 법적인 책임 및 손해배상 책임을 지지 않습니다.</p>
          <h3>제4조 (지적재산권)</h3>
          <p>서비스의 디자인, 검색 로직 등은 공공의 목적으로 자유롭게 공유할 수 있으나, 상업적인 목적으로 무단 전재 또는 재배포하는 것은 금지됩니다.</p>
        </div>`
    },
    privacy: {
      title: "개인정보처리방침",
      subtitle: "Privacy Policy",
      content: `
        <div class="legal-content">
          <h3>1. 개인정보 수집 및 이용 목적</h3>
          <p>본 서비스는 회원가입 없이 누구나 무료로 이용할 수 있는 공개 웹사이트로, 사용자의 실명, 연락처 등 일체의 개인식별정보를 직접 수집하거나 서버에 저장하지 않는 것을 철칙으로 합니다.</p>
          <h3>2. 쿠키(Cookie) 수집 및 구글 애드센스 맞춤 광고 고지</h3>
          <p>본 사이트는 서비스 개선을 위한 접속 통계 분석 및 광고 게재를 위해 쿠키를 활용할 수 있습니다.</p>
          <ul>
            <li>Google 등의 제3자 광고 파트너는 사용자가 본 사이트 또는 다른 웹사이트를 방문한 기록을 바탕으로 맞춤형 광고를 제공하기 위해 쿠키를 사용합니다.</li>
            <li>맞춤 광고 노출을 원치 않으실 경우, 구글의 <a href="https://adssettings.google.com" target="_blank" rel="noopener">광고 설정 ↗</a> 페이지에서 맞춤 광고를 비활성화할 수 있습니다.</li>
            <li>또한, <a href="https://www.aboutads.info" target="_blank" rel="noopener">www.aboutads.info ↗</a>에 접속하여 제3자 업체의 쿠키 사용을 해제하실 수도 있습니다.</li>
          </ul>
          <h3>3. 브라우저 저장소(LocalStorage) 활용</h3>
          <p>이용자가 직접 선택하여 등록하는 "관심기관(즐겨찾기)" 목록은 서버로 전송되지 않고 이용자 본인의 스마트폰 또는 PC 브라우저 저장소인 로컬 스토리지(LocalStorage) 내에만 국한하여 임시 저장됩니다. 브라우저 쿠키/방문기록을 삭제할 경우 이 데이터도 함께 지워집니다.</p>
          <h3>4. 방침의 변경</h3>
          <p>본 방침은 구글 정책 변경 및 서비스 개선 등에 따라 변경될 수 있으며, 변경 사항은 본 지면을 통해 상시 업데이트되어 투명하게 확인하실 수 있습니다.</p>
        </div>`
    },
    disclaimer: {
      title: "책임한계 및 면책고지",
      subtitle: "Legal Disclaimer",
      content: `
        <div class="legal-content">
          <h3>1. 의료 진료 정보의 한계</h3>
          <p>본 서비스의 데이터(전문의 수, 개설 진료과목, 낮병동 등)는 건강보험심사평가원(HIRA)의 공시자료와 근로복지공단 산재재활 지정 공고자료 등을 취합하여 만든 자료입니다. 병원의 일시적인 휴진, 전문의 퇴사, 요양병원 병상 부족 등으로 인해 실시간 상황과 다를 수 있습니다.</p>
          <h3>2. 의료적 조언 배제</h3>
          <p>본 서비스에서 제공되는 모든 콘텐츠 및 검색 결과는 참고 목적으로만 제공되며, 의사의 전문적인 진단, 처방 및 의료적 판단을 대신할 수 없습니다. 환자의 구체적인 증상과 진료 계획은 전문의와 직접 상담하십시오.</p>
          <h3>3. 전화 문의 및 확인 권장</h3>
          <p>외래 또는 입원을 진행하기 전에, 반드시 가이드 상세화면에 표시된 <strong>'전화번호 보기'</strong>를 클릭하여 병원 접수처 또는 원무과 입원 상담실과 직접 유선 상담을 거친 후 예약을 확정하시길 다시 한번 강력히 권고해 드립니다.</p>
        </div>`
    }
  };

  function openLegal(key) {
    const page = legalData[key];
    if (!page) return;
    elements.dialogContent.innerHTML = `
      <div class="dialog-header" style="background: var(--teal-900);">
        <div class="dialog-title-wrap">
          <span class="dialog-notice" style="background: var(--mint); color: var(--white); font-weight: 800; font-size: 11px; padding: 4px 10px; margin-bottom: 8px; display: inline-block; border-radius: 6px; letter-spacing: 0;">📋 법적 안내 및 고지</span>
          <p>${escapeHtml(page.subtitle)}</p>
          <h2 id="dialogTitle">${escapeHtml(page.title)}</h2>
        </div>
        <button class="dialog-close" aria-label="닫기">×</button>
      </div>
      <div class="dialog-body" style="background: var(--white);">
        ${page.content}
        <div class="dialog-actions" style="grid-template-columns: 1fr; margin-top: 25px; margin-bottom: 0;">
          <button class="dialog-close" style="width: 100%; padding: 12px; font-weight: 800; border-radius: 12px; background: var(--teal-900); color: white; border: 0;">확인 및 닫기</button>
        </div>
      </div>
    `;
    elements.dialog.showModal();
  }

  $("#openAbout")?.addEventListener("click", (event) => { event.preventDefault(); openLegal("about"); });
  $("#openTerms")?.addEventListener("click", (event) => { event.preventDefault(); openLegal("terms"); });
  $("#openPrivacy")?.addEventListener("click", (event) => { event.preventDefault(); openLegal("privacy"); });
  $("#openDisclaimer")?.addEventListener("click", (event) => { event.preventDefault(); openLegal("disclaimer"); });

  populateFilters();
  render();
})();
