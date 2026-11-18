// Dashboard: athlete tables, athlete profiles, comparisons and the race feed.
// Routes: #/ (men) and #/konur (women), #/a/<fiscode>, #/c/<fiscode>,<fiscode>..., #/feed
(function () {
const { nf, sl, nm, fmtDate, statusIs, DNAME, DISCS, pct, h } = ReportUtil;
const byCode = new Map(D.athletes.map(a => [a.code, a]));
const view = document.getElementById("view");
const S0 = D.seasons[0], S1 = D.seasons.at(-1);
const listIs = s => s.replace(/^(\d+)\w+ FIS points list (\S+)$/, "$1. FIS-punktalisti $2");
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const MAXCMP = 5;
const FIS_BIO = code => `https://www.fis-ski.com/DB/general/athlete-biography.html?sectorcode=AL&fiscode=${code}`;
const gender = g => g === "W" ? "kona" : "karl";
const bestRank = a => Math.min(...DISCS.map(d => a.latest[d].rank ?? Infinity));
const hasPts = a => DISCS.some(d => a.latest[d].pts != null);

function mast(title, lede) {
  return `<header class="mast"><p class="meta">FIS alpagreinar · Ísland · ${esc(listIs(D.latestList))}, gildir frá ${fmtDate(D.latestDate)} · gögn sótt ${fmtDate(D.built)}</p>
    <h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ""}</header>`;
}

// ------------------------------------------------------------------ R1: athlete tables
const tableState = { sort: "best" };
function renderList(g) {
  const all = D.athletes.filter(a => a.gender === g);
  const counts = { M: D.athletes.filter(a => a.gender === "M").length, W: D.athletes.filter(a => a.gender === "W").length };
  const key = {
    best: a => bestRank(a), name: a => nm(a), year: a => -(a.year || 0),
    ...Object.fromEntries(DISCS.map(d => [d, a => a.latest[d].pts ?? Infinity])),
  }[tableState.sort];
  const rows = all.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (typeof ka === "string" ? ka.localeCompare(kb, "is") : ka - kb) || bestRank(a) - bestRank(b) || nm(a).localeCompare(nm(b), "is");
  });
  // shade each discipline's cell by quintile within this table; darker is better
  const shade = {};
  DISCS.forEach(d => {
    const v = all.map(a => a.latest[d].pts).filter(x => x != null).sort((p, q) => p - q);
    shade[d] = p => p == null ? null : [62, 38, 20, 8, 0][Math.min(4, Math.floor(v.indexOf(p) / v.length * 5))];
  });
  const th = (k, label) => `<th${tableState.sort === k ? ' aria-sort="ascending"' : ""}><button type="button" data-sort="${k}">${label}</button></th>`;
  view.innerHTML = mast("Keppendur",
    `Allir íslenskir keppendur á nýjasta FIS-punktalistanum, með punkta og sæti á heimslista í hverri grein. Færri punktar eru betri. Smelltu á keppanda til að sjá greiningu.`) +
    `<div class="seg" role="group" aria-label="Kyn">
      <button type="button" data-g="M" aria-pressed="${g === "M"}">Karlar (${counts.M})</button>
      <button type="button" data-g="W" aria-pressed="${g === "W"}">Konur (${counts.W})</button></div>
    <div class="scroll"><table class="order"><thead><tr>
      ${th("name", "Nafn")}${th("year", "Fæðingarár")}<th>Félag</th>${DISCS.map(d => th(d, DNAME[d])).join("")}${th("best", "Besta sæti")}
    </tr></thead><tbody>${rows.map(a => {
      const cells = DISCS.map(d => {
        const x = a.latest[d], k = shade[d](x.pts);
        if (x.pts == null) return `<td>–</td>`;
        const style = k ? ` style="background:color-mix(in srgb, var(--seq) ${k}%, var(--paper));${k > 50 ? "color:var(--on-color)" : ""}"` : "";
        return `<td><span class="cellrank"${style}><span class="pts">${nf(x.pts)}</span><span class="rk"${k > 50 ? ' style="color:inherit"' : ""}>${x.rank ? `#${x.rank}` : ""}</span></span></td>`;
      }).join("");
      const br = bestRank(a);
      return `<tr data-code="${a.code}" class="${hasPts(a) ? "" : "nopts"}"><td class="nm"><a href="#/a/${a.code}">${esc(nm(a))}</a></td>
        <td>${a.year ?? "–"}</td><td class="club">${esc(a.club)}</td>${cells}<td>${br < Infinity ? `#${br}` : "–"}</td></tr>`;
    }).join("")}</tbody></table></div>
    <p class="note">Punktar og sæti á heimslista (#) af ${esc(listIs(D.latestList))}. Litur reits sýnir stöðu innan íslenska hópsins í greininni: dekkri blár er betra. <b>Besta sæti</b> er besta sæti keppandans á heimslista í einhverri grein. Keppendur án punkta eru á listanum en hafa ekki náð FIS-punktum í neinni grein.</p>`;
  view.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => { location.hash = b.dataset.g === "W" ? "#/konur" : "#/"; }));
  view.querySelectorAll("th button").forEach(b => b.addEventListener("click", () => { tableState.sort = b.dataset.sort; renderList(g); }));
  view.querySelectorAll("tbody tr").forEach(tr => tr.addEventListener("click", e => { if (!e.target.closest("a")) location.hash = `#/a/${tr.dataset.code}`; }));
}

// ------------------------------------------------------------------ athlete picker
function picker(box, exclude, onPick) {
  box.innerHTML = `<div class="picker"><input type="search" placeholder="Leita að keppanda…" aria-label="Leita að keppanda" autocomplete="off"><ul role="listbox" hidden></ul></div>`;
  const input = box.querySelector("input"), ul = box.querySelector("ul");
  const fold = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ð/g, "d").replace(/þ/g, "th").replace(/æ/g, "ae").toLowerCase();
  let hits = [], sel = 0;
  const draw = () => {
    const q = fold(input.value.trim());
    hits = q ? D.athletes.filter(a => !exclude.includes(a.code) && fold(nm(a)).includes(q)).slice(0, 12) : [];
    ul.hidden = !hits.length;
    ul.innerHTML = hits.map((a, i) => `<li role="option" aria-selected="${i === sel}" data-i="${i}">${esc(nm(a))} <span class="sub">${gender(a.gender)}, f. ${a.year ?? "?"} · ${esc(a.club)}</span></li>`).join("");
  };
  input.addEventListener("input", () => { sel = 0; draw(); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { sel = Math.max(0, Math.min(hits.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1))); draw(); e.preventDefault(); }
    if (e.key === "Enter" && hits[sel]) onPick(hits[sel]);
    if (e.key === "Escape") { input.value = ""; draw(); }
  });
  ul.addEventListener("mousedown", e => { const li = e.target.closest("li"); if (li) { e.preventDefault(); onPick(hits[+li.dataset.i]); } });
  input.addEventListener("blur", () => { ul.hidden = true; });
  return input;
}

// ------------------------------------------------------------------ R2: athlete profile
function renderProfile(code) {
  const a0 = byCode.get(code);
  if (!a0) return notFound();
  const a = { ...a0, bib: 1 };
  a.m = Metrics.compute([a], D).get(code);
  const ghosts = D.athletes.filter(x => x.gender === a.gender && x.code !== code);
  const cur = a.lists.at(-1);
  const seasonStart = a.lists.filter(l => l.season === (cur && cur.season))[0];
  const br = bestRank(a), bd = DISCS.find(d => a.latest[d].rank === br);
  const m2 = a.m.last2.stability;
  const inPeriod = a.starts.filter(s => D.seasons.includes(s.season));
  const recent = a.starts.slice().reverse().slice(0, 8);

  view.innerHTML = `<div class="ahead"><span class="rankno" style="background:var(--a1)" aria-hidden="true"></span><div><h1>${esc(nm(a))}</h1>
      <div class="sub">${esc(a.club) || "Félag óskráð"} · FIS-kóði ${a.code} · ${gender(a.gender)} · f. ${a.year ?? "?"} · <a class="ext" href="${FIS_BIO(a.code)}" target="_blank" rel="noopener">Á vef FIS ↗</a></div></div></div>
    <div class="tiles">
      <div class="tile"><div class="tk">Besta sæti á heimslista</div><div class="tv">${br < Infinity ? `#${br}` : "–"}</div><div class="tc">${bd ? `${DNAME[bd].toLowerCase()} · nýjasti listi` : "engir punktar á nýjasta lista"}</div></div>
      <div class="tile"><div class="tk">Getustig</div><div class="tv">${cur && cur.level != null ? nf(cur.level) : "–"}</div><div class="tc">${cur && seasonStart && cur.level != null && seasonStart.level != null && seasonStart !== cur ? `${nf(seasonStart.level)} í upphafi ${sl(cur.season)}` : "punktar á FIS-lista, 2 bestu greinar"}</div></div>
      <div class="tile"><div class="tk">Kláraði, síðustu 2</div><div class="tv">${m2.starts ? pct(m2.rate) : "–"}</div><div class="tc">${m2.starts ? `${m2.fin} af ${m2.starts} ræsingum` : "engar ræsingar"}</div>${m2.starts ? `<div class="bar"><span style="width:${Math.round(m2.rate * 100)}%"></span></div>` : ""}</div>
      <div class="tile"><div class="tk">Ræsingar</div><div class="tv">${inPeriod.length}</div><div class="tc">${sl(S0)}–${sl(S1)}</div></div>
    </div>
    <h3>Nýjustu keppnir</h3>
    <div id="recent"></div>
    <h3>Bera saman við…</h3>
    <p class="cap">Veldu allt að ${MAXCMP - 1} keppendur til að bera saman við ${esc(a.first)}.</p>
    <div id="cmp-chips" class="chips"></div><div id="cmp-pick"></div>
    <p><button class="btn" id="cmp-go" type="button" disabled>Bera saman</button></p>
    <div id="report"></div>`;

  document.getElementById("recent").innerHTML = recent.length ? feedTable(recent.map(s => ({ ...s, code })), false, true) : `<div class="missing">Engar keppnir skráðar.</div>`;
  wireFeed(document.getElementById("recent"));

  // comparison picker
  const chosen = [];
  const chips = document.getElementById("cmp-chips"), go = document.getElementById("cmp-go");
  const redraw = () => {
    chips.innerHTML = chosen.map(c => `<button type="button" class="chip" data-code="${c}" aria-label="Fjarlægja ${esc(nm(byCode.get(c)))}">${esc(nm(byCode.get(c)))} <span class="x">×</span></button>`).join("");
    chips.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => { chosen.splice(chosen.indexOf(b.dataset.code), 1); redraw(); }));
    go.disabled = !chosen.length;
    const box = document.getElementById("cmp-pick");
    if (chosen.length < MAXCMP - 1) picker(box, [code, ...chosen], x => { chosen.push(x.code); redraw(); box.querySelector("input").focus(); });
    else box.innerHTML = `<p class="cap">Hámark ${MAXCMP} keppendur í samanburði.</p>`;
  };
  redraw();
  go.addEventListener("click", () => { location.hash = `#/c/${[code, ...chosen].join(",")}`; });

  const rep = document.getElementById("report");
  if (inPeriod.length) renderReport(rep, [a], D, { single: true, ghosts });
  else rep.innerHTML = `<div class="missing">Engar keppnir á tímabilunum ${sl(S0)}–${sl(S1)}, svo greiningin er ekki sýnd.</div>`;
}

// ------------------------------------------------------------------ R3: comparison
function renderCompare(codes) {
  const A = [...new Set(codes)].map(c => byCode.get(c)).filter(Boolean).slice(0, MAXCMP).map((a, i) => ({ ...a, bib: i + 1 }));
  if (!A.length) return notFound();
  const M = Metrics.compute(A, D);
  A.forEach(a => { a.m = M.get(a.code); });
  const n = A.length;
  view.innerHTML = mast("Samanburður",
    `Samanburður á ${n} ${n === 1 ? "keppanda" : "keppendum"} út frá fjórum spurningum: klára þau ferðirnar, skíða þau í samræmi við eigin getu, eru þau að bæta sig og hversu hátt hafa þau komist á heimslistanum. Hver þáttur er metinn tvisvar: yfir síðustu fjögur tímabil og yfir síðustu tvö.`) +
    `<p class="rule-note">Svona á að lesa gröfin: lengra til hægri eða ofar er alltaf betra, og sá besti er efstur. Hver keppandi hefur sama lit í öllum gröfum.</p>
    <div class="startlist" id="startlist"></div>
    <div class="chips" id="cmp-edit"></div><div id="cmp-pick"></div>
    <div id="report"></div>`;
  const sList = document.getElementById("startlist");
  A.forEach(a => {
    const cur = a.lists.at(-1);
    const top = cur ? DISCS.filter(d => cur[d] != null).sort((x, y) => cur[x] - cur[y]) : [];
    h("div", { class: "racer" }, sList,
      `<span class="dot" style="background:var(--a${a.bib})"></span><span><b><a href="#/a/${a.code}" style="color:inherit;text-decoration:none">${esc(nm(a))}</a></b> <span class="sub">${gender(a.gender)}, f. ${a.year ?? "?"}, ${esc(a.club)}${top.length ? ` · núverandi punktar: ${top.map(d => `${d} ${nf(cur[d])}`).join(", ")}` : ""}</span></span>`);
  });
  const edit = document.getElementById("cmp-edit");
  edit.innerHTML = A.length > 1 ? A.map(a => `<button type="button" class="chip" data-code="${a.code}" aria-label="Fjarlægja ${esc(nm(a))}">${esc(nm(a))} <span class="x">×</span></button>`).join("") : "";
  edit.querySelectorAll(".chip").forEach(b => b.addEventListener("click", () => { location.hash = `#/c/${A.map(a => a.code).filter(c => c !== b.dataset.code).join(",")}`; }));
  if (A.length < MAXCMP) picker(document.getElementById("cmp-pick"), A.map(a => a.code), x => { location.hash = `#/c/${[...A.map(a => a.code), x.code].join(",")}`; });
  renderReport(document.getElementById("report"), A, D, { single: A.length === 1 });
}

// ------------------------------------------------------------------ R4 + R5: race feed
const MEDAL = ["var(--gold)", "var(--silver)", "var(--bronze)"];
// Race points vs the athlete's points on the FIS list valid on race day, same discipline.
function gainCell(r) {
  if (r.kind !== "fin" || r.pts == null || !DISCS.includes(r.disc)) return "";
  if (r.own == null) return `<span class="gain up" title="Engir punktar í ${esc(DNAME[r.disc] || r.disc).toLowerCase()} á lista fyrir keppnina">▲ nýir</span>`;
  const d = r.pts - r.own, title = `Punktar á FIS-lista á keppnisdegi: ${nf(r.own)}`;
  return d < 0
    ? `<span class="gain up" title="${title}">▲ ${nf(-d)}</span>`
    : `<span class="gain" title="${title}">+${nf(d)}</span>`;
}
function feedTable(rows, withDays, oneAthlete) {
  let html = `<div class="scroll"><table class="feed"><thead><tr>${withDays ? "" : "<th>Dagsetning</th>"}${oneAthlete ? "" : "<th>Keppandi</th>"}<th>Land</th><th>Staður</th><th>Grein</th><th>Mót</th><th class="r">Sæti</th><th class="r">FIS-punktar</th><th class="r" title="Keppnispunktar miðað við punkta keppandans á FIS-lista á keppnisdegi">Bæting</th><th></th></tr></thead><tbody>`;
  let day = null;
  rows.forEach(r => {
    const a = byCode.get(r.code);
    if (withDays && r.date !== day) { day = r.date; html += `<tr class="day"><th colspan="9">${fmtDate(day)}</th></tr>`; }
    const res = r.kind === "fin"
      ? `${+r.pos <= 3 ? `<span class="med" style="background:${MEDAL[+r.pos - 1]}"></span>` : ""}${r.pos}.`
      : `<span class="${r.kind === "dnf" || r.kind === "dsq" ? "bad" : ""}" title="${esc(statusIs(r))}">${esc(r.pos)}</span>`;
    const url = `https://www.fis-ski.com/DB/general/results.html?sectorcode=AL&raceid=${r.race}`;
    html += `<tr class="race" data-url="${url}">${withDays ? "" : `<td>${fmtDate(r.date)}</td>`}
      ${oneAthlete ? "" : `<td><a class="ath" href="#/a/${r.code}">${esc(a ? nm(a) : r.code)}</a></td>`}<td>${esc(r.nation)}</td><td>${esc(r.place)}</td>
      <td>${esc(DNAME[r.disc] || r.disc)}</td><td>${esc(r.cat)}</td><td class="r">${res}</td><td class="r">${r.pts != null ? nf(r.pts) : "–"}</td><td class="r">${gainCell(r)}</td>
      <td><a class="ext" href="${url}" target="_blank" rel="noopener" aria-label="Úrslit á vef FIS">FIS ↗</a></td></tr>`;
  });
  return html + "</tbody></table></div>";
}
function wireFeed(box) {
  box.querySelectorAll("tr.race").forEach(tr => tr.addEventListener("click", e => {
    if (!e.target.closest("a")) window.open(tr.dataset.url, "_blank", "noopener");
  }));
}
const feedState = { g: "ALL" };
function renderFeed() {
  const rows = D.feed.filter(r => feedState.g === "ALL" || (byCode.get(r.code) || {}).gender === feedState.g);
  view.innerHTML = mast("Nýjustu úrslit",
    `Nýjustu keppnir íslenskra keppenda, nýjast efst. Smelltu á keppni til að opna úrslitin á vef FIS, eða á nafn til að sjá keppandann. FIS-punktar eru <b>keppnispunktar</b> úr keppninni; færri punktar eru betri. <b>Bæting</b> ber keppnispunktana saman við punkta keppandans í sömu grein á FIS-lista á keppnisdegi: ▲ merkir að keppnin var betri en listapunktarnir (og hve mörgum punktum munaði), grátt + að hún var verri.`) +
    `<div class="seg" role="group" aria-label="Kyn">${[["ALL", "Öll"], ["M", "Karlar"], ["W", "Konur"]].map(([k, l]) => `<button type="button" data-g="${k}" aria-pressed="${feedState.g === k}">${l}</button>`).join("")}</div>
    <div id="feed">${rows.length ? feedTable(rows, true) : `<div class="missing">Engin úrslit.</div>`}</div>
    <p class="note">Sæti: rautt merkir að keppandi lauk ekki keppni (DNF) eða var vísað úr keppni (DSQ); DNS merkir að hann mætti ekki til leiks. Mót eru flokkuð eftir FIS-mótaflokki, t.d. FIS, NJR (unglingamót), NC (landsmót), EC (Evrópubikar), WC (heimsbikar).</p>`;
  view.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => { feedState.g = b.dataset.g; renderFeed(); }));
  wireFeed(view);
}

function notFound() {
  view.innerHTML = mast("Fannst ekki", `Enginn keppandi með þennan FIS-kóða er á nýjasta punktalistanum. <a href="#/">Aftur á keppendalistann</a>.`);
}

// ------------------------------------------------------------------ router
function route() {
  const hash = location.hash.replace(/^#\/?/, "");
  const [page, arg] = hash.split("/");
  document.querySelectorAll(".nav [data-nav]").forEach(a => a.removeAttribute("aria-current"));
  const nav = page === "feed" ? "feed" : (page === "" || page === "konur") ? "list" : null;
  if (nav) document.querySelector(`.nav [data-nav="${nav}"]`).setAttribute("aria-current", "page");
  document.getElementById("tip").hidden = true;
  if (page === "a") renderProfile(arg);
  else if (page === "c") renderCompare((arg || "").split(",").filter(Boolean));
  else if (page === "feed") renderFeed();
  else renderList(page === "konur" ? "W" : "M");
  document.title = `${view.querySelector("h1")?.textContent || ""} · Íslenskir alpagreinakeppendur`;
  scrollTo(0, 0);
}
addEventListener("hashchange", route);
route();
})();
