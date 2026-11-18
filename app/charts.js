// Charts and sections of the comparison report (ported from comparison_is.html).
// renderReport(container, athletes, D, opt) draws the report for any group of 1–5
// athletes. Each athlete needs `bib` (1–5, their colour) and `m` (from Metrics.compute).
// opt.single: an athlete profile; hides the parts that only make sense for a group.
// opt.ghosts: other athletes drawn as thin grey context lines in the level chart.
(function (root) {
const NS = "http://www.w3.org/2000/svg";
const DISCS = ["SL", "GS", "SG", "DH"];
const DNAME = { SL: "Svig", GS: "Stórsvig", SG: "Risasvig", DH: "Brun", AC: "Alpatvíkeppni" };
const nf = (v, n = 2) => v == null ? "–" : v.toFixed(n).replace(".", ",");
const sl = s => `${s - 1}/${String(s).slice(2)}`;
const nm = a => `${a.first} ${a.last}`;
const first = a => a.first;
const pct = v => v == null ? "–" : `${Math.round(v * 100)}%`;
const f1 = v => v == null ? "–" : nf(Math.round(v * 10) / 10, 1);
const fmtDate = d => { if (!d) return "–"; const [y, m, dd] = d.split("-"); return `${+dd}. ${"jan. feb. mar. apr. maí jún. júl. ágú. sep. okt. nóv. des.".split(" ")[+m - 1]} ${y}`; };
const ordinal = n => `${n}.`;
// FIS status codes in Icelandic, e.g. DNF1 = did not finish the 1st run
const statusIs = x => {
  const run = x.pos.endsWith("2") ? "seinni" : x.pos.endsWith("1") ? "fyrri" : "";
  if (x.kind === "dsq") return `Vísað úr keppni${run ? ` í ${run} ferð` : ""}`;
  if (x.kind === "dnq") return "Komst ekki í seinni ferð";
  if (x.kind === "dns") return "Mætti ekki til leiks";
  return `Lauk ekki ${run ? `${run} ferð` : "keppni"}`;
};
// number words for small groups, e.g. "allir fjórir" / "allar fjórar"
const WORDS = { M: ["", "einn", "tveir", "þrír", "fjórir", "fimm"], W: ["", "ein", "tvær", "þrjár", "fjórar", "fimm"] };
const word = (n, g) => (WORDS[g] || WORDS.M)[n] || String(n);

// line style per bib, so identity never depends on colour
const LS = {
  1: { dash: "", w: 2.4, stroke: "var(--a1)" },
  2: { dash: "8 4", w: 2.2, stroke: "var(--a2)" },
  3: { dash: "0.5 4.5", w: 3, stroke: "var(--a3)", cap: "round" },
  4: { dash: "12 3 2 3", w: 2.2, stroke: "var(--a4)" },
  5: { dash: "", w: 2.2, stroke: "var(--a5)" },
};
const DS = { SL: "", GS: "6 3", SG: "0.5 3.5", DH: "10 3 2 3" };

function el(tag, attrs, parent, text) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}
function h(tag, attrs, parent, html) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}
const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
const logs = (d0, d1, r0, r1) => v => r0 + (Math.log(v) - Math.log(d0)) / (Math.log(d1) - Math.log(d0)) * (r1 - r0);
const t = d => new Date(d + "T00:00:00Z").getTime();
const AC = a => `var(--a${a.bib})`;
const dotHtml = a => `<span class="dot" style="background:${AC(a)}"></span>`;
function bibTag(g, x, y, bib) {
  el("circle", { cx: x, cy: y, r: 6, fill: `var(--a${bib})` }, g);
}
function lineSample(parent, style, w = 30) {
  const s = el("svg", { width: w, height: 10 }, parent);
  el("line", { x1: 0, x2: w, y1: 5, y2: 5, stroke: style.stroke, "stroke-width": style.w, "stroke-dasharray": style.dash, "stroke-linecap": style.cap || "butt" }, s);
  return s;
}

// tooltip: one shared #tip element in the page
function hover(node, html) {
  node.style.cursor = "default";
  node.addEventListener("mouseenter", e => { const tip = document.getElementById("tip"); tip.innerHTML = typeof html === "function" ? html() : html; tip.hidden = false; move(e); });
  node.addEventListener("mousemove", move);
  node.addEventListener("mouseleave", () => { document.getElementById("tip").hidden = true; });
}
function move(e) {
  const tip = document.getElementById("tip");
  const r = tip.getBoundingClientRect();
  const x = e.clientX + r.width + 30 > innerWidth ? e.clientX - r.width - 24 : e.clientX;
  const y = e.clientY + r.height + 30 > innerHeight ? e.clientY - r.height - 24 : e.clientY;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function table(id, head, rows) {
  const tb = document.getElementById(id);
  h("thead", {}, tb, "<tr>" + head.map(c => `<th>${c}</th>`).join("") + "</tr>");
  const body = h("tbody", {}, tb);
  rows.forEach(r => h("tr", {}, body, r.map(c => `<td>${c}</td>`).join("")));
}

function renderReport(container, A, D, opt = {}) {
const single = !!opt.single;
const S0 = D.seasons[0], S1 = D.seasons[D.seasons.length - 1];
const isL2 = s => D.last2.includes(s);
const PERIODS = { all: `4 tímabil · ${sl(S0)}–${sl(S1)}`, last2: `Síðustu 2 · ${sl(D.last2[0])}–${sl(D.last2[1])}` };
// best first on a factor (four-season place, then last-two place)
const byPlace = key => A.slice().sort((a, b) => a.m.all[key].place - b.m.all[key].place || a.m.last2[key].place - b.m.last2[key].place);
function verdict(id, key, fmt) {
  const box = document.getElementById(id);
  if (single) { box.remove(); return; }
  for (const p of ["all", "last2"]) {
    const a = A.find(a => a.m[p][key].place === 1);
    h("div", {}, box, `<span class="lab">Efst, ${PERIODS[p]}:</span> ${dotHtml(a)} <span class="who">${nm(a)}</span> <span class="val">· ${fmt(a.m[p][key])}</span>`);
  }
}
// head to head: the largest same-gender group, since men and women never meet
const byG = { M: A.filter(a => a.gender === "M"), W: A.filter(a => a.gender === "W") };
const G = byG.M.length >= byG.W.length ? "M" : "W";
const group = byG[G];
const gWord = G === "M" ? "karlarnir" : "konurnar";
container.innerHTML = template(A, D, { single, S0, S1, PERIODS, group, G, gWord });
const ALLG = group.length === 2 ? "bæði" : `${G === "M" ? "allir" : "allar"} ${word(group.length, G)}`;

const FKEYS = ["stability", "consistency", "progression", "success"];
const OVERALL = A.map(a => ({ a, avg: FKEYS.reduce((s, k) => s + a.m.all[k].place + a.m.last2[k].place, 0) / 8 })).sort((x, y) => x.avg - y.avg);

// ---------- result board ----------
if (!single) (function () {
  const F = [
    ["stability", "Áreiðanleiki", m => `${pct(m.rate)} klárað`],
    ["consistency", "Stöðugleiki", m => `${pct(m.within10)} nálægt`],
    ["progression", "Framfarir", m => `${Math.round(m.pct)}% betra`],
    ["success", "Árangur", m => `heimslisti #${m.bestRank}`],
  ];
  const tb = document.getElementById("board");
  let hd = `<thead><tr><th>Heild</th><th></th>${F.map(f => `<th colspan="2">${f[1]}</th><th class="gap"></th>`).join("")}</tr>`;
  hd += `<tr><th></th><th></th>${F.map(() => `<th>4 tímabil</th><th>Síðustu 2</th><th class="gap"></th>`).join("")}</tr></thead>`;
  const body = OVERALL.map(({ a }, i) => {
    const cells = F.map(([k, , fmt]) => ["all", "last2"].map(p => {
      const m = a.m[p][k];
      return `<td><div class="cell p${m.place}" title="${ordinal(m.place)} sæti af ${A.length}"><span class="p">${m.place}</span><span class="v">${fmt(m)}</span></div></td>`;
    }).join("") + `<td class="gap"></td>`).join("");
    return `<tr><td class="ov">${ordinal(i + 1)}</td><th>${dotHtml(a)}${nm(a)}</th>${cells}</tr>`;
  }).join("");
  tb.innerHTML = hd + `<tbody>${body}</tbody>`;
})();

// ---------- stability: run sheet ----------
(function () {
  verdict("stab-verdict", "stability", m => `${pct(m.rate)} kláruð · ${m.fin} af ${m.starts} ræsingum`);
  const lg = document.getElementById("stab-legend");
  const mk = (label, draw) => { const s = h("span", {}, lg); const v = el("svg", { width: 10, height: 10 }, s); draw(v); s.append(label); };
  mk("Kláraði", v => el("rect", { x: 1, y: 1, width: 8, height: 8, fill: "var(--fin)" }, v));
  mk("Lauk ekki keppni (DNF)", v => el("rect", { x: 1, y: 1, width: 8, height: 8, fill: "var(--bad)" }, v));
  mk("Vísað úr keppni (DSQ)", v => el("rect", { x: 1.6, y: 1.6, width: 6.8, height: 6.8, fill: "var(--paper)", stroke: "var(--bad)", "stroke-width": 1.6 }, v));
  mk("Komst ekki í seinni ferð (ekki talið)", v => el("rect", { x: 1, y: 1, width: 8, height: 8, fill: "var(--dnq)" }, v));

  const order = byPlace("stability");
  const svg = document.getElementById("runsheet");
  const W = 1000, L = 210, R = 110, sq = 8, gap = 2, st = sq + gap;
  const colW = (W - L - R) / D.seasons.length;
  const per = Math.floor((colW - 14) / st);
  let y = 40;
  const rowsY = [];
  order.forEach(a => {
    const max = Math.max(...D.seasons.map(s => a.starts.filter(x => x.season === s).length));
    const hRow = Math.max(36, Math.ceil(max / per) * st);
    rowsY.push([y, hRow]);
    y += hRow + 22;
  });
  const H = y;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const i0 = D.seasons.indexOf(D.last2[0]);
  el("rect", { x: L + i0 * colW - 6, y: 0, width: colW * 2 + 2, height: H - 8, fill: "var(--wash)" }, svg);
  el("text", { x: L + i0 * colW, y: 12, class: "small" }, svg, "Síðustu tvö tímabil");
  D.seasons.forEach((s, i) => el("text", { x: L + i * colW, y: 30, class: "axis" }, svg, sl(s)));
  el("text", { x: W - R + 12, y: 30, class: "axis" }, svg, "4 tímab. / síð. 2");
  order.forEach((a, ai) => {
    const [y0] = rowsY[ai];
    const g = el("g", {}, svg);
    bibTag(g, 10, y0 + 8, a.bib);
    el("text", { x: 26, y: y0 + 13, class: "lbl" }, g, nm(a));
    D.seasons.forEach((s, si) => {
      a.starts.filter(x => x.season === s).forEach((x, k) => {
        const cx = L + si * colW + (k % per) * st, cy = y0 + Math.floor(k / per) * st;
        const gg = el("g", {}, g);
        if (x.kind === "dsq") el("rect", { x: cx + .8, y: cy + .8, width: sq - 1.6, height: sq - 1.6, fill: "var(--paper)", stroke: "var(--bad)", "stroke-width": 1.6 }, gg);
        else el("rect", { x: cx, y: cy, width: sq, height: sq, fill: { fin: "var(--fin)", dnf: "var(--bad)", dnq: "var(--dnq)" }[x.kind] }, gg);
        el("rect", { x: cx - 1, y: cy - 1, width: st, height: st, fill: "transparent" }, gg);
        hover(gg, `<b>${fmtDate(x.date)}</b><br>${x.place} · ${x.cat}<br>${DNAME[x.disc] || x.disc}<br>${x.kind === "fin" ? `${x.pos}. sæti` : statusIs(x)}${x.pts != null ? `<br>${nf(x.pts)} keppnispunktar` : ""}`);
      });
    });
    const ma = a.m.all.stability, ml = a.m.last2.stability;
    el("text", { x: W - R + 12, y: y0 + 16, class: "big" }, g, pct(ma.rate));
    el("text", { x: W - R + 62, y: y0 + 16, class: "big" }, g, pct(ml.rate));
  });

  // finish rate: right is better
  const f = document.getElementById("finrate");
  const W2 = 1000, L2 = 210, H2 = 34 * A.length + 40;
  f.setAttribute("viewBox", `0 0 ${W2} ${H2}`);
  const x = lin(0.5, 1, L2, W2 - 40);
  for (let v = 0.5; v <= 1.001; v += 0.1) {
    el("line", { x1: x(v), x2: x(v), y1: 14, y2: H2 - 22, stroke: "var(--rule)" }, f);
    el("text", { x: x(v), y: H2 - 6, "text-anchor": "middle", class: "axis" }, f, pct(v));
  }
  el("text", { x: W2 - 40, y: 10, "text-anchor": "end", class: "small" }, f, "Hlutfall kláraðra ferða, betra →");
  order.forEach((a, i) => {
    const yy = 30 + i * 34, va = a.m.all.stability.rate, vl = a.m.last2.stability.rate;
    bibTag(f, 10, yy, a.bib);
    el("text", { x: 26, y: yy + 5, class: "lbl" }, f, nm(a));
    el("line", { x1: x(va), x2: x(vl), y1: yy, y2: yy, stroke: AC(a), "stroke-width": 2 }, f);
    const ca = el("circle", { cx: x(va), cy: yy, r: 6, fill: "var(--paper)", stroke: AC(a), "stroke-width": 2 }, f);
    const cl = el("circle", { cx: x(vl), cy: yy, r: 6, fill: AC(a), stroke: "var(--paper)", "stroke-width": 1.5 }, f);
    hover(ca, `<b>${nm(a)}</b><br>${PERIODS.all}<br>${pct(va)} · ${a.m.all.stability.fin}/${a.m.all.stability.starts}`);
    hover(cl, `<b>${nm(a)}</b><br>${PERIODS.last2}<br>${pct(vl)} · ${a.m.last2.stability.fin}/${a.m.last2.stability.starts}`);
    const d = Math.round((vl - va) * 100);
    el("text", { x: Math.max(x(va), x(vl)) + 12, y: yy + 4, class: "small" }, f, `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(d)} prósentustig`);
  });

  const rows = [];
  order.forEach(a => ["all", "last2"].forEach(p => {
    const m = a.m[p].stability;
    rows.push([p === "all" ? nm(a) : "", PERIODS[p], m.starts, m.fin, m.dnf, m.dsq, `${m.run1}/${m.starts - m.fin}`,
      ...["SL", "GS"].map(d => m.byDisc[d] ? `${pct(m.byDisc[d].fin / m.byDisc[d].starts)} (${m.byDisc[d].starts})` : "–"), pct(m.rate)]);
  }));
  table("stab-tbl", ["Keppandi", "Tímabil", "Ræsingar", "Kláraði", "DNF", "DSQ", "Úr leik í fyrri ferð", "Svig klárað", "Stórsvig klárað", "Hlutfall klárað"], rows);
})();

// ---------- consistency: strip plot, right = better than own ranking ----------
(function () {
  verdict("cons-verdict", "consistency", m => `${pct(m.within10)} af ${m.n} keppnum nálægt dæmigerðum árangri`);
  const lg = document.getElementById("cons-legend");
  lg.innerHTML = `<span><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--ink-3)" stroke-width="1.2"/></svg>Keppni ${sl(S0)}–${sl(D.last2[0] - 1)}</span>` +
    `<span><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="var(--a1)"/></svg>Keppni á síðustu tveimur tímabilum (litur keppanda)</span>` +
    `<span><svg width="34" height="10"><line x1="0" x2="34" y1="5" y2="5" stroke="var(--ink-3)" stroke-width="3"/></svg>Dæmigert ±10 punktar, 4 tímabil</span>` +
    `<span><svg width="34" height="10"><line x1="0" x2="34" y1="5" y2="5" stroke="var(--a1)" stroke-width="5"/></svg>Dæmigert ±10 punktar, síðustu 2</span>`;
  const order = byPlace("consistency");
  const svg = document.getElementById("strip");
  const W = 1000, L = 210, R = 110, rowH = 96, lo = -80, hi = 40;
  const H = 40 + A.length * rowH + 20;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = lin(lo, hi, L, W - R);
  for (let v = lo; v <= hi; v += 20) {
    el("line", { x1: x(v), x2: x(v), y1: 26, y2: H - 22, stroke: v === 0 ? "var(--ink)" : "var(--rule)", "stroke-width": v === 0 ? 1.2 : 1 }, svg);
    el("text", { x: x(v), y: H - 6, "text-anchor": "middle", class: "axis" }, svg, v > 0 ? `+${v}` : v);
  }
  el("text", { x: x(0) - 6, y: 18, "text-anchor": "end", class: "small" }, svg, "← verra en eigin punktar");
  el("text", { x: x(0) + 6, y: 18, class: "small" }, svg, "betra →");
  el("text", { x: W - R + 14, y: 18, class: "axis" }, svg, "4 tímab. / síð. 2");
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  order.forEach((a, i) => {
    const y0 = 34 + i * rowH, band = 50;
    const g = el("g", {}, svg);
    bibTag(g, 10, y0 + 10, a.bib);
    el("text", { x: 26, y: y0 + 15, class: "lbl" }, g, nm(a));
    const races = a.starts.filter(s => s.delta != null).sort((p, q) => isL2(p.season) - isL2(q.season));
    races.forEach(s => {
      const gain = -s.delta;  // points better than own ranking
      const v = Math.max(lo, Math.min(hi, gain)), cx = x(v), cy = y0 + 4 + rnd() * band;
      const recent = isL2(s.season);
      const c = el("circle", { cx, cy, r: 3.6, fill: recent ? AC(a) : "var(--paper)", stroke: recent ? "var(--paper)" : "var(--ink-3)", "stroke-width": recent ? 0.8 : 1.2 }, g);
      if (gain < lo || gain > hi) el("path", { d: gain < lo ? `M${cx - 6},${cy} l4,-3 v6z` : `M${cx + 6},${cy} l-4,-3 v6z`, fill: "var(--ink)" }, g);
      hover(c, `<b>${fmtDate(s.date)}</b><br>${s.place} · ${s.cat} · ${s.disc}<br>Keppni ${nf(s.pts)}, eigin punktar ${nf(s.own)}<br>${gain >= 0 ? `${nf(gain)} punktum betra` : `${nf(-gain)} punktum verra`} en eigin punktar`);
    });
    const ma = a.m.all.consistency, ml = a.m.last2.consistency;
    const yb = y0 + band + 16;
    [[ma, 0, "var(--ink-3)", 3], [ml, 10, AC(a), 5]].forEach(([m, off, c, w]) => {
      const mid = -m.med;
      el("line", { x1: x(mid - 10), x2: x(mid + 10), y1: yb + off, y2: yb + off, stroke: c, "stroke-width": w }, g);
      el("line", { x1: x(mid), x2: x(mid), y1: yb + off - 5, y2: yb + off + 5, stroke: c, "stroke-width": 2 }, g);
    });
    el("text", { x: W - R + 14, y: y0 + 40, class: "big" }, g, pct(ma.within10));
    el("text", { x: W - R + 60, y: y0 + 40, class: "big" }, g, pct(ml.within10));
    el("line", { x1: 0, x2: W, y1: y0 + rowH - 6, y2: y0 + rowH - 6, stroke: "var(--rule)" }, svg);
  });
  const rows = [];
  order.forEach(a => ["all", "last2"].forEach(p => {
    const m = a.m[p].consistency;
    rows.push([p === "all" ? nm(a) : "", PERIODS[p], m.n, f1(-m.med), f1(m.iqr), pct(m.within10)]);
  }));
  table("cons-tbl", ["Keppandi", "Tímabil", "Keppnir", "Dæmigert miðað við punkta", "Dreifing (IQR)", "Innan ±10 af dæmigerðu"], rows);
})();

// ---------- progression ----------
(function () {
  verdict("prog-verdict", "progression", m => `${f1(m.start)} → ${f1(m.end)} punktar · ${Math.round(m.pct)}% betra`);
  const order = byPlace("progression");
  const svg = document.getElementById("levelchart");
  const W = 1000, L = 56, R = 120, T = 30, B = 34, H = 440;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const tx0 = t(`${S0 - 1}-07-01`), tx1 = t(D.latestDate);
  const inAxis = e => e.level != null && t(e.from) >= tx0;
  const series = A.map(a => a.lists.filter(inAxis));
  const ghosts = (opt.ghosts || []).map(a => a.lists.filter(inAxis)).filter(s => s.length);
  const x = lin(tx0, tx1, L, W - R);
  const yMax = Math.max(60, Math.ceil(Math.max(...series.flat().map(e => e.level)) / 20) * 20);
  const y0 = logs(20, yMax, T, H - B), y = v => y0(Math.max(20, Math.min(yMax, v)));
  el("rect", { x: x(t(`${D.last2[0] - 1}-07-01`)), y: T - 12, width: x(t(`${S1}-06-30`)) - x(t(`${D.last2[0] - 1}-07-01`)), height: H - B - T + 12, fill: "var(--wash)" }, svg);
  el("text", { x: x(t(`${D.last2[0] - 1}-07-01`)) + 6, y: T - 2, class: "small" }, svg, "Síðustu tvö tímabil");
  for (const v of [20, 25, 30, 40, 50, 60, 80, 100, 120].filter(v => v <= yMax)) {
    el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: "var(--rule)" }, svg);
    el("text", { x: L - 8, y: y(v) + 4, "text-anchor": "end", class: "axis" }, svg, v);
  }
  el("text", { x: 4, y: T - 16, class: "small" }, svg, "FIS-punktar (lograkvarði), betra ↑");
  [...D.seasons, S1 + 1].forEach(s => {  // S1 + 1: the current season, lists only
    const xs = x(t(`${s - 1}-07-01`));
    el("line", { x1: xs, x2: xs, y1: T, y2: H - B + 4, stroke: "var(--ink-3)", "stroke-dasharray": "2 3" }, svg);
    el("text", { x: xs + 4, y: H - B + 18, class: "axis" }, svg, sl(s));
  });
  // other athletes as thin grey context lines, clamped to the axis
  ghosts.forEach(s => el("path", { d: s.map((e, k) => `${k ? "L" : "M"}${x(t(e.from)).toFixed(1)},${y(e.level).toFixed(1)}`).join(""), class: "ghost", fill: "none" }, svg));
  const groups = [];
  A.forEach((a, i) => {
    if (!series[i].length) return;
    const g = el("g", { "data-bib": a.bib }, svg);
    const st = LS[a.bib];
    const d = series[i].map((e, k) => `${k ? "L" : "M"}${x(t(e.from)).toFixed(1)},${y(e.level).toFixed(1)}`).join("");
    el("path", { d, fill: "none", stroke: "var(--paper)", "stroke-width": st.w + 3 }, g);
    el("path", { d, fill: "none", stroke: st.stroke, "stroke-width": st.w, "stroke-dasharray": st.dash, "stroke-linecap": st.cap || "butt", "stroke-linejoin": "round" }, g);
    const last = series[i].at(-1);
    groups.push({ g, a, ly: y(last.level), lx: x(t(last.from)) });
  });
  const tags = groups.slice().sort((p, q) => p.ly - q.ly);
  for (let k = 1; k < tags.length; k++) if (tags[k].ly - tags[k - 1].ly < 20) tags[k].ly = tags[k - 1].ly + 20;
  tags.forEach(({ g, a, ly, lx }) => {
    const ty = y(series[A.indexOf(a)].at(-1).level);
    el("line", { x1: lx, x2: W - R + 6, y1: ty, y2: ly, stroke: "var(--ink-3)", "stroke-width": .8 }, g);
    bibTag(g, W - R + 16, ly, a.bib);
    el("text", { x: W - R + 30, y: ly + 4, class: "small" }, g, first(a).split(" ")[0]);
  });
  const cross = el("line", { y1: T, y2: H - B, stroke: "var(--ink)", "stroke-width": 1, visibility: "hidden" }, svg);
  const dots = A.map(() => el("circle", { r: 4, fill: "var(--ink)", stroke: "var(--paper)", "stroke-width": 1.5, visibility: "hidden" }, svg));
  const hit = el("rect", { x: L, y: T, width: W - R - L, height: H - B - T, fill: "transparent" }, svg);
  const allDates = [...new Set(series.flat().map(e => e.from))].sort();
  hit.addEventListener("mousemove", e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    let best = allDates[0];
    for (const dd of allDates) if (Math.abs(x(t(dd)) - p.x) < Math.abs(x(t(best)) - p.x)) best = dd;
    const xx = x(t(best));
    cross.setAttribute("x1", xx); cross.setAttribute("x2", xx); cross.setAttribute("visibility", "visible");
    let html = `<b>Listi frá ${fmtDate(best)}</b>`;
    A.forEach((a, i) => {
      const e = series[i].find(z => z.from === best);
      dots[i].setAttribute("visibility", e ? "visible" : "hidden");
      if (e) { dots[i].setAttribute("cx", xx); dots[i].setAttribute("cy", y(e.level)); }
      html += `<br>${a.bib} ${first(a).split(" ")[0].padEnd(9, " ")} ${e ? nf(e.level) : "–"}`;
    });
    tip.innerHTML = html; tip.hidden = false; move(e);
  });
  hit.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("visibility", "hidden"); dots.forEach(d => d.setAttribute("visibility", "hidden")); });

  const chips = document.getElementById("prog-chips");
  let focus = null;
  if (chips) A.forEach(a => {
    const b = h("button", { class: "chip", type: "button", "aria-pressed": "false" }, chips);
    b.append(`${a.bib} ${first(a)}`);
    lineSample(b, LS[a.bib]);
    b.addEventListener("click", () => {
      focus = focus === a.bib ? null : a.bib;
      chips.querySelectorAll(".chip").forEach((c, k) => c.setAttribute("aria-pressed", String(A[k].bib === focus)));
      groups.forEach(({ g, a: aa }) => g.classList.toggle("dim", focus != null && aa.bib !== focus));
      groups.forEach(({ g, a: aa }) => { if (aa.bib === focus) svg.insertBefore(g, cross); });
    });
  });

  // start → end, better to the right
  const db = document.getElementById("dumbbell");
  const W2 = 1000, L2 = 210, R2 = 110, rowH = 50;
  const H2 = 40 + A.length * rowH;
  db.setAttribute("viewBox", `0 0 ${W2} ${H2}`);
  const xm = Math.max(60, Math.ceil(Math.max(...A.map(a => a.m.all.progression.start || 0)) / 20) * 20);
  const xd = lin(xm, 20, L2, W2 - R2);
  for (let v = 20; v <= xm; v += 20) {
    el("line", { x1: xd(v), x2: xd(v), y1: 14, y2: H2 - 22, stroke: "var(--rule)" }, db);
    el("text", { x: xd(v), y: H2 - 6, "text-anchor": "middle", class: "axis" }, db, v);
  }
  el("text", { x: W2 - R2, y: 10, "text-anchor": "end", class: "small" }, db, "FIS-punktar, betra →");
  el("text", { x: W2 - R2 + 14, y: 10, class: "axis" }, db, "Bæting");
  order.forEach((a, i) => {
    const y0 = 28 + i * rowH;
    bibTag(db, 10, y0 + 6, a.bib);
    el("text", { x: 26, y: y0 + 11, class: "lbl" }, db, nm(a));
    [["all", 0, "var(--ink-3)"], ["last2", 16, AC(a)]].forEach(([p, off, c]) => {
      const m = a.m[p].progression, yy = y0 + off;
      if (m.start == null) return;
      const x0 = xd(m.start), x1 = xd(m.end);
      const seg = el("g", {}, db);
      el("line", { x1: x0, x2: x1 - 6, y1: yy, y2: yy, stroke: c, "stroke-width": p === "all" ? 2 : 3 }, seg);
      el("path", { d: `M${x1},${yy} l-8,-5 v10z`, fill: c }, seg);
      el("circle", { cx: x0, cy: yy, r: 3.5, fill: "var(--paper)", stroke: c, "stroke-width": 1.5 }, seg);
      el("rect", { x: Math.min(x0, x1) - 4, y: yy - 7, width: Math.abs(x1 - x0) + 8, height: 14, fill: "transparent" }, seg);
      hover(seg, `<b>${nm(a)}</b><br>${PERIODS[p]}<br>${fmtDate(m.startDate)}: ${nf(m.start)}<br>${fmtDate(m.endDate)}: ${nf(m.end)}<br>${nf(m.pts)} punktar · ${f1(m.pct)}% betra`);
      el("text", { x: W2 - R2 + 14, y: yy + 4, class: p === "all" ? "small" : "", "font-size": 12, "font-weight": p === "all" ? 400 : 600 }, db, `${Math.round(m.pct)}%`);
    });
  });

  const dl = document.getElementById("disc-legend");
  DISCS.forEach(d => { const s = h("span", {}, dl); lineSample(s, { stroke: "var(--ink)", w: 1.8, dash: DS[d], cap: d === "SG" ? "round" : "butt" }); s.append(DNAME[d]); });
  const box = document.getElementById("multiples");
  const w = 320, hh = 190, l = 30, r = 30, tp = 10, bt = 22, cap = 160;
  const sx = lin(tx0, tx1, l, w - r), sy = lin(20, cap, tp, hh - bt);
  order.forEach(a => {
    const i = A.indexOf(a);
    const fig = h("figure", {}, box);
    h("figcaption", {}, fig, `${dotHtml(a)}${nm(a)}`);
    const s = el("svg", { viewBox: `0 0 ${w} ${hh}` }, fig);
    el("rect", { x: sx(t(`${D.last2[0] - 1}-07-01`)), y: tp, width: sx(tx1) - sx(t(`${D.last2[0] - 1}-07-01`)), height: hh - bt - tp, fill: "var(--wash)" }, s);
    [20, 60, 100, 140].forEach(v => { el("line", { x1: l, x2: w - r, y1: sy(v), y2: sy(v), stroke: "var(--rule)" }, s); el("text", { x: l - 4, y: sy(v) + 3, "text-anchor": "end", class: "axis", "font-size": 9 }, s, v); });
    D.seasons.forEach(se => el("text", { x: sx(t(`${se - 1}-07-01`)) + 2, y: hh - 6, class: "axis", "font-size": 9 }, s, `’${String(se).slice(2)}`));
    const ser = series[i];
    DISCS.forEach(d => {
      const pts = ser.filter(e => e[d] != null);
      if (!pts.length) return;
      const path = pts.map((e, k) => `${k ? "L" : "M"}${sx(t(e.from)).toFixed(1)},${sy(Math.min(cap, e[d])).toFixed(1)}`).join("");
      el("path", { d: path, fill: "none", stroke: "var(--ink)", "stroke-width": 1.8, "stroke-dasharray": DS[d], "stroke-linecap": d === "SG" ? "round" : "butt", "stroke-linejoin": "round" }, s);
      const lp = pts.at(-1);
      el("text", { x: sx(t(lp.from)) + 4, y: sy(Math.min(cap, lp[d])) + 3, "font-size": 9, "font-weight": 600 }, s, d);
    });
  });

  const rows = [];
  order.forEach(a => ["all", "last2"].forEach(p => {
    const m = a.m[p].progression;
    rows.push([p === "all" ? nm(a) : "", PERIODS[p], `${nf(m.start)} (${fmtDate(m.startDate)})`, `${nf(m.end)} (${fmtDate(m.endDate)})`, nf(m.pts), `${f1(m.pct)}%`]);
  }));
  table("prog-tbl", ["Keppandi", "Tímabil", "Getustig í upphafi", "Getustig í lok", "Punktabæting", "Bæting"], rows);
})();

// ---------- success ----------
(function () {
  verdict("succ-verdict", "success", m => m.bestRank ? `#${m.bestRank} á heimslista í ${DNAME[m.bestDisc].toLowerCase()}i` : "ekkert sæti á heimslista");
  document.getElementById("succ-legend").innerHTML =
    `<span><svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="var(--paper)" stroke="var(--ink)" stroke-width="1.4"/></svg>Besta sæti, 4 tímabil</span>` +
    `<span><svg width="16" height="16"><circle cx="8" cy="8" r="7" fill="var(--a1)"/></svg>Besta sæti, síðustu tvö tímabil (litur keppanda)</span>`;
  const order = byPlace("success");
  const svg = document.getElementById("rankplot");
  const W = 1000, L = 210, R = 40, rowH = 66;
  const H = 36 + A.length * rowH + 20;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = logs(3000, 50, L, W - R);
  [3000, 2000, 1000, 500, 300, 200, 100, 50].forEach(v => {
    el("line", { x1: x(v), x2: x(v), y1: 22, y2: H - 22, stroke: v === 100 ? "var(--ink-3)" : "var(--rule)" }, svg);
    el("text", { x: x(v), y: H - 6, "text-anchor": "middle", class: "axis" }, svg, `#${v}`);
  });
  el("text", { x: W - R, y: 14, "text-anchor": "end", class: "small" }, svg, "Sæti á heimslista, betra →");
  order.forEach((a, i) => {
    const y0 = 36 + i * rowH;
    bibTag(svg, 10, y0 + 8, a.bib);
    el("text", { x: 26, y: y0 + 13, class: "lbl" }, svg, nm(a));
    if (a.gender === "W") el("text", { x: 26, y: y0 + 28, class: "small" }, svg, "listi kvenna");
    [["all", 0], ["last2", 26]].forEach(([p, off]) => {
      const yy = y0 + 8 + off, filled = p === "last2";
      const bd = a.m[p].success.bestByDisc;
      el("text", { x: L - 10, y: yy + 4, "text-anchor": "end", class: "axis" }, svg, p === "all" ? "4 tímab." : "síð. 2");
      el("line", { x1: L, x2: W - R, y1: yy, y2: yy, stroke: "var(--rule)", "stroke-dasharray": "1 3" }, svg);
      const marks = Object.entries(bd).map(([d, v]) => ({ d, v, cx: x(Math.min(3000, v.rank)) })).sort((p, q) => p.cx - q.cx);
      marks.forEach((m, k) => { if (k && m.cx - marks[k - 1].cx < 24) m.cx = marks[k - 1].cx + 24; });
      marks.forEach(({ d, v, cx }) => {
        const g = el("g", {}, svg);
        el("circle", { cx, cy: yy, r: 11, fill: filled ? AC(a) : "var(--paper)", stroke: filled ? AC(a) : "var(--ink-3)", "stroke-width": 1.4 }, g);
        el("text", { x: cx, y: yy + 3.5, "text-anchor": "middle", "font-size": 9, "font-weight": 700, style: `fill:${filled ? "#111" : "var(--ink)"}` }, g, d);
        hover(g, `<b>${nm(a)}</b><br>${PERIODS[p]}<br>${DNAME[d]}: #${v.rank} á heimslista<br>${nf(v.pts)} punktar · listi frá ${fmtDate(v.date)}`);
      });
      const best = a.m[p].success;
      el("text", { x: marks.length ? Math.min(marks.at(-1).cx + 18, W - R - 30) : L + 8, y: yy + 4, class: "small" }, svg, marks.length ? `#${best.bestRank}` : "ekkert sæti á heimslista");
    });
  });

  // podium tally
  const pd = document.getElementById("podiums");
  const W2 = 1000, L2 = 210, R2 = 260, sq = 11, gp = 3, rowH2 = 52;
  const H2 = 30 + A.length * rowH2;
  pd.setAttribute("viewBox", `0 0 ${W2} ${H2}`);
  el("text", { x: L2, y: 14, class: "axis" }, pd, "Verðlaunasæti, 4 tímabil (með ramma: síðustu tvö tímabil)");
  el("text", { x: W2 - R2 + 20, y: 14, class: "axis" }, pd, "Besti alþjóðlegi árangur");
  order.forEach((a, i) => {
    const y0 = 30 + i * rowH2;
    bibTag(pd, 10, y0 + 8, a.bib);
    el("text", { x: 26, y: y0 + 13, class: "lbl" }, pd, nm(a));
    const pods = a.starts.filter(s => s.kind === "fin" && +s.pos <= 3);
    const perRow = Math.floor((W2 - R2 - L2) / (sq + gp));
    pods.forEach((s, k) => {
      const cx = L2 + (k % perRow) * (sq + gp), cy = y0 + Math.floor(k / perRow) * (sq + gp);
      const g = el("g", {}, pd);
      if (isL2(s.season)) el("rect", { x: cx - 1.5, y: cy - 1.5, width: sq + 3, height: sq + 3, fill: "none", stroke: "var(--ink)", "stroke-width": 1 }, g);
      el("rect", { x: cx, y: cy, width: sq, height: sq, rx: 1.5, fill: ["var(--gold)", "var(--silver)", "var(--bronze)"][+s.pos - 1] }, g);
      hover(g, `<b>${ordinal(+s.pos)} sæti · ${fmtDate(s.date)}</b><br>${s.place} · ${s.cat}<br>${DNAME[s.disc] || s.disc}${s.pts != null ? ` · ${nf(s.pts)} punktar` : ""}`);
    });
    const sa = a.m.all.success;
    el("text", { x: L2, y: y0 + 40, class: "small" }, pd, `${sa.wins} sigrar · ${sa.podiums} verðlaunasæti  |  síðustu 2: ${a.m.last2.success.wins} sigrar · ${a.m.last2.success.podiums} verðlaunasæti`);
    const bi = sa.bestIntl;
    if (bi) {
      el("text", { x: W2 - R2 + 20, y: y0 + 14, class: "big" }, pd, `${ordinal(+bi.pos)} sæti · ${bi.cat} ${bi.disc}`);
      el("text", { x: W2 - R2 + 20, y: y0 + 30, class: "small" }, pd, `${bi.place.length > 22 ? bi.place.slice(0, 21) + "…" : bi.place}, ${bi.date.slice(0, 4)}`);
    }
  });
  const rows = [];
  order.forEach(a => ["all", "last2"].forEach(p => {
    const m = a.m[p].success, bd = m.bestByDisc;
    rows.push([p === "all" ? nm(a) : "", PERIODS[p], m.bestRank ? `#${m.bestRank} ${m.bestDisc}` : "–", ...DISCS.map(d => bd[d] ? `#${bd[d].rank}` : "–"), m.wins, m.podiums, m.intlStarts, m.bestIntl ? `${m.bestIntl.pos}. ${m.bestIntl.cat} ${m.bestIntl.disc}` : "–"]);
  }));
  table("succ-tbl", ["Keppandi", "Tímabil", "Besta sæti", "SL", "GS", "SG", "DH", "Sigrar", "Verðlaunasæti", "Alþj. ræsingar", "Besti alþj. árangur"], rows);
})();

// ---------- head to head in depth: margins, races with all four, gap to the fastest ----------
const H2H_TX = { left: "← síðarnefndi fljótari", right: "fyrrnefndi fljótari →", winsBy: (a, v) => `${a} vinnur með ${v}%`, medGap: (a, v) => `miðgildi munar: ${a} ${v}% fljótari`, even: "miðgildi munar: jafnt", pc: v => nf(v, 2),
  duel: (s1, s2, a, b) => `<b>${fmtDate(s1.date)}</b> · ${s1.place} · ${DNAME[s1.disc] || s1.disc}<br>${a} ${s1.pos}. · ${b} ${s2.pos}.<br>munur ${nf(Math.abs(s2.behind - s1.behind), 2)}% af tíma sigurvegara`,
  groupCap: (n, m) => `Keppnir þar sem ${ALLG} ${gWord} ræstu: ${n}. Hver súla telur hversu oft keppandinn var fljótastur í hópnum, í hvaða sæti innan hópsins, eða hvort hann lauk ekki keppni. Í ${m} þessara keppna kláruðu ${ALLG}, svo það vegur þungt að klára ekki.`,
  places: () => ["Fljótastur í hópnum", ...group.slice(1).map((_, k) => `${k + 2}.`), "Lauk ekki keppni"], fastest: (k, n) => `fljótastur í ${k} af ${n}`, axis: "% á eftir þeim fljótasta í hópnum, betra ↑", gapTip: (a, se, v, n) => `<b>${nm(a)}</b><br>${sl(se)}: miðgildi ${nf(v, 2)}% á eftir<br>${n} keppnir` };
function h2hDepth(disc) {
  const TX = H2H_TX;
  const men = group;
  const short = a => a.first.split(" ")[0];
  const ok = s => s.season >= S0 && s.season <= S1 && (disc === "ALL" || s.disc === disc);
  const isFin = s => s.kind === "fin" && /^\d+$/.test(s.pos) && s.behind != null;
  const byRace = new Map();
  men.forEach(a => a.starts.filter(ok).forEach(s => {
    if (!byRace.has(s.race)) byRace.set(s.race, new Map());
    byRace.get(s.race).set(a.bib, s);
  }));
  const med = xs => { const s = xs.slice().sort((p, q) => p - q), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };

  // 1) margins per pair: margin > 0 means the first-named athlete (a) was faster
  const pairs = [];
  men.forEach((a, i) => men.slice(i + 1).forEach(b => {
    const ds = [];
    byRace.forEach(m => {
      const sa = m.get(a.bib), sb = m.get(b.bib);
      if (!sa || !sb || !isFin(sa) || !isFin(sb) || +sa.pos === +sb.pos) return;
      ds.push({ sa, sb, aWon: +sa.pos < +sb.pos, margin: sb.behind - sa.behind });
    });
    const aw = ds.filter(d => d.aWon).length;
    // name the athlete with the better record first
    pairs.push(aw >= ds.length - aw ? { a, b, ds } : { a: b, b: a, ds: ds.map(d => ({ sa: d.sb, sb: d.sa, aWon: !d.aWon, margin: -d.margin })) });
  }));
  pairs.sort((p, q) => q.ds.length - p.ds.length);
  const svg = document.getElementById("h2h-margins");
  svg.replaceChildren();
  const W = 1000, L = 230, R = 250, rowH = 70, H = 30 + pairs.length * rowH + 30, LIM = 4;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const x = lin(-LIM, LIM, L, W - R);
  for (let v = -LIM; v <= LIM; v++) {
    el("line", { x1: x(v), x2: x(v), y1: 20, y2: H - 26, stroke: v === 0 ? "var(--ink)" : "var(--rule)" }, svg);
    el("text", { x: x(v), y: H - 10, "text-anchor": "middle", class: "axis" }, svg, `${Math.abs(v)}%`);
  }
  el("text", { x: x(0) - 8, y: 14, "text-anchor": "end", class: "small" }, svg, TX.left);
  el("text", { x: x(0) + 8, y: 14, class: "small" }, svg, TX.right);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  pairs.forEach(({ a, b, ds }, i) => {
    const y0 = 34 + i * rowH, mid = y0 + 22;
    const aw = ds.filter(d => d.aWon), bw = ds.filter(d => !d.aWon);
    el("text", { x: 0, y: y0 + 14, class: "lbl" }, svg, `${short(a)} – ${short(b)}`);
    el("text", { x: 0, y: y0 + 32, class: "small" }, svg, `${aw.length}–${bw.length}`);
    el("line", { x1: L, x2: W - R, y1: y0 + rowH - 8, y2: y0 + rowH - 8, stroke: "var(--rule)" }, svg);
    ds.forEach(d => {
      const v = Math.max(-LIM, Math.min(LIM, d.margin));
      const c = el("circle", { cx: x(v), cy: mid - 16 + rnd() * 32, r: 3.8, fill: d.aWon ? AC(a) : AC(b), "fill-opacity": .75, stroke: "var(--paper)", "stroke-width": .8 }, svg);
      hover(c, TX.duel(d.sa, d.sb, short(a), short(b)));
    });
    const mw = med(aw.map(d => d.margin)), ml = med(bw.map(d => -d.margin)), mg = med(ds.map(d => d.margin));
    if (mw != null) el("line", { x1: x(Math.min(LIM, mw)), x2: x(Math.min(LIM, mw)), y1: mid - 22, y2: mid + 22, stroke: AC(a), "stroke-width": 3 }, svg);
    if (ml != null) el("line", { x1: x(-Math.min(LIM, ml)), x2: x(-Math.min(LIM, ml)), y1: mid - 22, y2: mid + 22, stroke: AC(b), "stroke-width": 3 }, svg);
    el("text", { x: W - R + 16, y: y0 + 10, class: "small" }, svg, mw != null ? TX.winsBy(short(a), TX.pc(mw)) : "");
    el("text", { x: W - R + 16, y: y0 + 26, class: "small" }, svg, ml != null ? TX.winsBy(short(b), TX.pc(ml)) : "");
    const gtxt = mg == null || Math.abs(mg) < 0.005 ? TX.even : mg > 0 ? TX.medGap(short(a), TX.pc(mg)) : TX.medGap(short(b), TX.pc(-mg));
    el("text", { x: W - R + 16, y: y0 + 44, class: "lbl", "font-size": 12 }, svg, gtxt);
  });

  if (!document.getElementById("h2h-group")) return;
  // 2) races where the whole group started: place within the group, or out
  const four = [...byRace.values()].filter(m => m.size === men.length);
  const allFin = four.filter(m => [...m.values()].every(isFin)).length;
  document.getElementById("h2h-group-cap").textContent = TX.groupCap(four.length, allFin);
  const ramp = [100, 62, 34, 14, 6].slice(0, men.length);
  const COLORS = [...ramp.map(k => k === 100 ? "var(--seq)" : `color-mix(in srgb, var(--seq) ${k}%, var(--paper))`), "var(--bad)"];
  const lg = document.getElementById("h2h-group-legend");
  lg.replaceChildren();
  TX.places().forEach((p, k) => { const s = h("span", {}, lg); const v = el("svg", { width: 12, height: 12 }, s); el("rect", { x: 0, y: 0, width: 12, height: 12, rx: 2, fill: COLORS[k] }, v); s.append(p); });
  const cnt = new Map(men.map(a => [a.bib, Array(men.length + 1).fill(0)]));
  four.forEach(m => {
    const fins = [...m.entries()].filter(([, s]) => isFin(s)).sort((p, q) => +p[1].pos - +q[1].pos);
    fins.forEach(([bib], k) => cnt.get(bib)[k]++);
    m.forEach((s, bib) => { if (!isFin(s)) cnt.get(bib)[men.length]++; });
  });
  const gOrder = men.slice().sort((p, q) => { const a = cnt.get(p.bib), b = cnt.get(q.bib); return (b[0] - a[0]) || (b[1] - a[1]) || (b[2] - a[2]); });
  const gs = document.getElementById("h2h-group");
  gs.replaceChildren();
  const GW = 1000, GL = 210, GR = 170, gRow = 38, GH = 20 + gOrder.length * gRow + 10;
  gs.setAttribute("viewBox", `0 0 ${GW} ${GH}`);
  const gx = lin(0, Math.max(1, four.length), GL, GW - GR);
  gOrder.forEach((a, i) => {
    const yy = 24 + i * gRow, c = cnt.get(a.bib);
    bibTag(gs, 10, yy, a.bib);
    el("text", { x: 26, y: yy + 5, class: "lbl" }, gs, nm(a));
    let acc = 0;
    c.forEach((n, k) => {
      if (!n) return;
      const x0 = gx(acc), x1 = gx(acc + n);
      el("rect", { x: x0, y: yy - 12, width: Math.max(0, x1 - x0 - 2), height: 24, fill: COLORS[k] }, gs);
      el("text", { x: (x0 + x1) / 2 - 1, y: yy + 4, "text-anchor": "middle", "font-size": 12, "font-weight": 700, style: `fill:${k === 0 || k === 1 || k === men.length ? "var(--on-color)" : "var(--ink)"}` }, gs, n);
      acc += n;
    });
    el("text", { x: GW - GR + 14, y: yy + 5, class: "small" }, gs, TX.fastest(c[0], four.length));
  });

  // 3) gap to the fastest of the group, median per season (races with 3+ of the group finished, 2+ in a group of 3)
  const MINFIN = men.length >= 4 ? 3 : 2;
  const gap = new Map(men.map(a => [a.bib, {}]));
  byRace.forEach(m => {
    const fins = [...m.entries()].filter(([, s]) => isFin(s));
    if (fins.length < MINFIN) return;
    const best = Math.min(...fins.map(([, s]) => s.behind));
    fins.forEach(([bib, s]) => { (gap.get(bib)[s.season] = gap.get(bib)[s.season] || []).push(s.behind - best); });
  });
  const ps = document.getElementById("h2h-gap");
  ps.replaceChildren();
  const PW = 1000, PL = 56, PR = 140, PT = 30, PB = 34, PH = 280, TOP = 2;
  ps.setAttribute("viewBox", `0 0 ${PW} ${PH}`);
  const px = i => PL + 40 + i * ((PW - PL - PR - 80) / (D.seasons.length - 1));
  const py = lin(0, TOP, PT, PH - PB), cyv = v => py(Math.min(TOP, v));
  for (let v = 0; v <= TOP; v += 0.5) {
    el("line", { x1: PL, x2: PW - PR, y1: py(v), y2: py(v), stroke: v === 0 ? "var(--ink-3)" : "var(--rule)" }, ps);
    el("text", { x: PL - 8, y: py(v) + 4, "text-anchor": "end", class: "axis" }, ps, `${TX.pc(v).replace(/[.,]?0+$/, "") || "0"}%`);
  }
  el("text", { x: 4, y: PT - 14, class: "small" }, ps, TX.axis);
  D.seasons.forEach((se, i) => {
    if (isL2(se)) el("rect", { x: px(i) - 30, y: PT - 8, width: 60, height: PH - PB - PT + 8, fill: "var(--wash)" }, ps);
    el("text", { x: px(i), y: PH - 10, "text-anchor": "middle", class: "axis" }, ps, sl(se));
  });
  const ends = [];
  men.forEach(a => {
    const st = LS[a.bib], off = (a.bib - 3) * 3;
    const vals = D.seasons.map(se => { const g = gap.get(a.bib)[se] || []; return g.length >= 3 ? { v: med(g), n: g.length, se } : null; });
    let d = "", prev = false;
    vals.forEach((c, i) => { if (c) { d += `${prev ? "L" : "M"}${(px(i) + off).toFixed(1)},${cyv(c.v).toFixed(1)}`; prev = true; } else prev = false; });
    if (d) el("path", { d, fill: "none", stroke: st.stroke, "stroke-width": st.w + .6, "stroke-dasharray": st.dash, "stroke-linecap": st.cap || "butt", "stroke-linejoin": "round" }, ps);
    vals.forEach((c, i) => {
      if (!c) return;
      const dot = el("circle", { cx: px(i) + off, cy: cyv(c.v), r: 5, fill: st.stroke, stroke: "var(--paper)", "stroke-width": 1.5 }, ps);
      hover(dot, TX.gapTip(a, c.se, c.v, c.n));
    });
    const last = vals.map((c, i) => c && [i, c]).filter(Boolean).at(-1);
    if (last) ends.push({ a, x: px(last[0]) + off, y: cyv(last[1].v), ty: cyv(last[1].v) });
  });
  ends.sort((p, q) => p.ty - q.ty);
  for (let k = 1; k < ends.length; k++) if (ends[k].ty - ends[k - 1].ty < 18) ends[k].ty = ends[k - 1].ty + 18;
  ends.forEach(e => {
    el("line", { x1: e.x + 6, x2: PW - PR + 8, y1: e.y, y2: e.ty, stroke: "var(--ink-3)", "stroke-width": .8 }, ps);
    bibTag(ps, PW - PR + 18, e.ty, e.a.bib);
    el("text", { x: PW - PR + 30, y: e.ty + 4, class: "small" }, ps, short(e.a));
  });
}

// ---------- head to head: duels between the men when both finished ----------
(function () {
  const TX = { tie: t => `${t} jafntefli`, all: "Allar greinar", won: (w, n) => `${w} af ${n} viðureignum unnar`, vs: "gegn", none: "engar viðureignir", tip: (a, b, w, l, split) => `<b>${nm(a)} gegn ${nm(b)}</b><br>${w}–${l} þegar báðir kláruðu${split ? "<br>" + split : ""}`, axis: "Vinningshlutfall, betra →", even: "jafnt" };
  if (!document.getElementById("h2h-bars")) return;
  const men = group;
  const inWin = s => s.season >= S0 && s.season <= S1 && s.kind === "fin" && /^\d+$/.test(s.pos);
  // finished races per athlete, keyed by race id
  const fin = new Map(men.map(a => [a.bib, new Map(a.starts.filter(inWin).map(s => [s.race, s]))]));
  const duels = (a, b, disc) => {
    let w = 0, l = 0, t = 0;
    const by = {};
    for (const [race, sa] of fin.get(a.bib)) {
      const sb = fin.get(b.bib).get(race);
      if (!sb || (disc !== "ALL" && sa.disc !== disc)) continue;
      if (+sa.pos === +sb.pos) { t++; continue; }  // tied place: not a win or a loss
      const win = +sa.pos < +sb.pos;
      win ? w++ : l++;
      by[sa.disc] = by[sa.disc] || [0, 0];
      by[sa.disc][win ? 0 : 1]++;
    }
    return { w, l, t, n: w + l, by };
  };
  const discs = ["ALL", ...["SL", "GS", "SG", "DH"].filter(d => men.some(a => men.some(b => a !== b && duels(a, b, d).n >= 5)))];
  let disc = "ALL";

  function render() {
    const tot = men.map(a => {
      let w = 0, n = 0;
      men.forEach(b => { if (a !== b) { const r = duels(a, b, disc); w += r.w; n += r.n; } });
      return { a, w, n, rate: n ? w / n : 0 };
    }).sort((p, q) => q.rate - p.rate);

    // bars: win rate, 50% marked
    const svg = document.getElementById("h2h-bars");
    svg.replaceChildren();
    const W = 1000, L = 210, R = 220, rowH = 34, H = 30 + tot.length * rowH + 24;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const x = lin(0, 1, L, W - R);
    [0, .25, .5, .75, 1].forEach(v => {
      el("line", { x1: x(v), x2: x(v), y1: 16, y2: H - 22, stroke: v === .5 ? "var(--ink-3)" : "var(--rule)", "stroke-dasharray": v === .5 ? "3 3" : "" }, svg);
      el("text", { x: x(v), y: H - 6, "text-anchor": "middle", class: "axis" }, svg, `${v * 100}%`);
    });
    el("text", { x: W - R, y: 10, "text-anchor": "end", class: "small" }, svg, TX.axis);
    tot.forEach((t, i) => {
      const yy = 30 + i * rowH;
      bibTag(svg, 10, yy, t.a.bib);
      el("text", { x: 26, y: yy + 5, class: "lbl" }, svg, nm(t.a));
      el("rect", { x: L, y: yy - 9, width: x(1) - L, height: 18, fill: "var(--wash)" }, svg);
      el("rect", { x: L, y: yy - 9, width: Math.max(0, x(t.rate) - L), height: 18, fill: AC(t.a) }, svg);
      el("text", { x: x(1) + 12, y: yy + 5, class: "lbl" }, svg, `${Math.round(t.rate * 100)}%`);
      el("text", { x: x(1) + 52, y: yy + 5, class: "small" }, svg, t.n ? TX.won(t.w, t.n) : TX.none);
    });

    // matrix: row athlete's record against column athlete
    const order = tot.map(t => t.a);
    const tb = document.getElementById("h2h-matrix");
    let html = `<thead><tr><th></th>${order.map(b => `<th>${TX.vs} ${b.first.split(" ")[0]}</th>`).join("")}</tr></thead><tbody>`;
    const tips = [];
    order.forEach(a => {
      html += `<tr><th class="l">${dotHtml(a)}${nm(a)}</th>`;
      order.forEach(b => {
        if (a === b) { html += `<td class="self">–</td>`; return; }
        const r = duels(a, b, disc);
        if (!r.n) { html += `<td class="self">${TX.none}</td>`; return; }
        const share = r.w / r.n, k = Math.round(90 * Math.min(1, Math.max(0, (share - 0.2) / 0.6)));  // 20% or less: pale, 80% or more: darkest
        const split = disc === "ALL" ? Object.entries(r.by).map(([d, [w, l]]) => `${DNAME[d] || d} ${w}–${l}`).join(" · ") : "";
        tips.push(TX.tip(a, b, r.w, r.l, [split, r.t ? TX.tie(r.t) : ""].filter(Boolean).join("<br>")));
        html += `<td data-tip="${tips.length - 1}" style="background:color-mix(in srgb, var(--seq) ${k}%, var(--paper));color:${k > 50 ? "var(--on-color)" : "var(--ink)"}"><b>${r.w}–${r.l}</b><span>${Math.round(share * 100)}%</span></td>`;
      });
      html += `</tr>`;
    });
    tb.innerHTML = html + "</tbody>";
    tb.querySelectorAll("td[data-tip]").forEach(td => hover(td, tips[+td.dataset.tip]));
    h2hDepth(disc);
  }

  const box = document.getElementById("h2h-disc");
  discs.forEach(d => {
    const b = h("button", { class: "chip", type: "button", "aria-pressed": String(d === disc) }, box);
    b.textContent = d === "ALL" ? TX.all : DNAME[d];
    b.addEventListener("click", () => {
      disc = d;
      box.querySelectorAll(".chip").forEach((c, k) => c.setAttribute("aria-pressed", String(discs[k] === disc)));
      render();
    });
  });
  render();
})();

// ---------- appendix: season medians per discipline, as small charts ----------
(function () {
  const TX = { groups: [["SL", "Svig", ["SL"]], ["GS", "Stórsvig", ["GS"]], ["SPD", "Hraðagreinar (risasvig + brun)", ["SG", "DH"]]], axis: "Miðgildi keppnispunkta, betra ↑", athlete: "Keppandi", change: "Breyting", races: "keppnir", n: "n", num: v => nf(v, 1), tip: (a, se, c) => `<b>${nm(a)}</b><br>${sl(se)}: miðgildi ${nf(c.med, 1)} punktar<br>miðhelmingur ${nf(c.q1, 1)}–${nf(c.q3, 1)} · ${c.n} keppnir` };
  const MIN = 3, LO = 20, HI = 160;
  const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
  // cell[group][bib][season] = { med, q1, q3, n }
  const cell = {};
  TX.groups.forEach(([g, , ds]) => {
    cell[g] = {};
    A.forEach(a => {
      cell[g][a.bib] = {};
      D.seasons.forEach(se => {
        const v = a.starts.filter(s => s.pts != null && s.season === se && ds.includes(s.disc)).map(s => s.pts);
        if (v.length >= MIN) cell[g][a.bib][se] = { med: q(v, .5), q1: q(v, .25), q3: q(v, .75), n: v.length };
      });
    });
  });

  // 1) small line charts, shared log scale, better up
  const lg = document.getElementById("sm-legend");
  A.forEach(a => { const s = h("span", {}, lg); lineSample(s, LS[a.bib]); s.append(nm(a)); });
  const box = document.getElementById("season-multiples");
  const w = 330, hh = 280, l = 38, r = 14, tp = 26, bt = 26;
  const sy = logs(LO, HI, tp, hh - bt), cy = v => sy(Math.max(LO, Math.min(HI, v)));
  const sx = i => l + 22 + i * ((w - l - r - 44) / (D.seasons.length - 1));
  TX.groups.forEach(([g, title]) => {
    const fig = h("figure", {}, box);
    h("figcaption", {}, fig, title);
    const s = el("svg", { viewBox: `0 0 ${w} ${hh}` }, fig);
    el("text", { x: 2, y: 12, class: "small", "font-size": 10 }, s, TX.axis);
    [20, 30, 40, 60, 80, 120, 160].forEach(v => {
      el("line", { x1: l, x2: w - r, y1: sy(v), y2: sy(v), stroke: "var(--rule)" }, s);
      el("text", { x: l - 5, y: sy(v) + 3, "text-anchor": "end", class: "axis", "font-size": 10 }, s, v);
    });
    D.seasons.forEach((se, i) => {
      if (isL2(se)) el("rect", { x: sx(i) - 20, y: tp - 6, width: 40, height: hh - bt - tp + 6, fill: "var(--wash)" }, s);
      el("text", { x: sx(i), y: hh - 8, "text-anchor": "middle", class: "axis", "font-size": 10 }, s, sl(se));
    });
    A.forEach(a => {
      const st = LS[a.bib], off = (a.bib - 3) * 4;
      const pts = D.seasons.map((se, i) => [i, cell[g][a.bib][se], se]);
      const gg = el("g", {}, s);
      // line through consecutive seasons that have data
      let d = "", prev = false;
      pts.forEach(([i, c]) => { if (c) { d += `${prev ? "L" : "M"}${(sx(i) + off).toFixed(1)},${cy(c.med).toFixed(1)}`; prev = true; } else prev = false; });
      if (d) el("path", { d, fill: "none", stroke: st.stroke, "stroke-width": st.w, "stroke-dasharray": st.dash, "stroke-linecap": st.cap || "butt", "stroke-linejoin": "round" }, gg);
      pts.forEach(([i, c, se]) => {
        if (!c) return;
        const px = sx(i) + off;
        el("line", { x1: px, x2: px, y1: cy(c.q1), y2: cy(c.q3), stroke: st.stroke, "stroke-width": 1.2, "stroke-opacity": .55 }, gg);
        const dot = el("circle", { cx: px, cy: cy(c.med), r: 4, fill: st.stroke, stroke: "var(--paper)", "stroke-width": 1.2 }, gg);
        const hit = el("circle", { cx: px, cy: cy(c.med), r: 9, fill: "transparent" }, gg);
        hover(hit, TX.tip(a, se, c));
      });
    });
  });

})();

// ---------- appendix: place within the field, as share of finishers ----------
(function () {
  const INTL = ["EC", "WC", "WSC", "WJC", "OWG", "ANC", "NAC", "SAC", "EYOF", "UNI"];
  const TOPCAT = ["WC", "WSC", "OWG", "EC", "NAC", "ANC", "SAC", "WJC"];  // strongest tier, by category not penalty
  const GROUPS = [["ALL", "Allar greinar", null], ["SL", "Svig", ["SL"]], ["GS", "Stórsvig", ["GS"]], ["SPD", "Hraðagreinar", ["SG", "DH"]]];
  const LEVELS = [["ALL", "Öll mót"], ["NAT", "FIS-mót og landsmót"], ["INTL", "Alþjóðleg mót"]];
  const BANDS = [[10, "Efstu 10%", 100], [25, "Efstu 25%", 62], [50, "Efri helmingur", 30]];
  const MIN = 3;  // fewer races than this: no median shown
  const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
  const top = s => s.pos / s.nfin * 100;  // top X% of finishers, lower is better
  const tp = v => `${v < 10 ? nf(Math.round(v * 10) / 10, 1) : Math.round(v)}%`;
  let disc = "ALL", level = "ALL";

  const races = a => {
    const ds = GROUPS.find(g => g[0] === disc)[2];
    return a.starts.filter(s => s.nfin && s.season >= S0 && s.season <= S1 && /^\d+$/.test(s.pos)
      && (!ds || ds.includes(s.disc))
      && (level === "ALL" || (level === "INTL") === INTL.includes(s.cat)))
      .map(s => ({ ...s, pos: +s.pos, top: top({ pos: +s.pos, nfin: s.nfin }) }));
  };
  const stats = rs => {
    const v = rs.map(s => s.top);
    return v.length ? { n: v.length, med: q(v, .5), q1: q(v, .25), q3: q(v, .75), ...Object.fromEntries(BANDS.map(([b]) => [b, v.filter(x => x <= b).length / v.length])) } : { n: 0 };
  };

  document.getElementById("field-legend").innerHTML =
    `<span><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="none" stroke="var(--ink-3)" stroke-width="1.2"/></svg>Keppni ${sl(S0)}–${sl(D.last2[0] - 1)}</span>` +
    `<span><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="var(--a1)"/></svg>Keppni á síðustu tveimur tímabilum (litur keppanda)</span>` +
    `<span><svg width="34" height="10"><line x1="0" x2="34" y1="5" y2="5" stroke="var(--ink-3)" stroke-width="3"/></svg>Miðhelmingur, 4 tímabil</span>`;
  const bl = document.getElementById("field-band-legend");
  BANDS.forEach(([, lab, k]) => h("span", {}, bl, `<svg width="14" height="10"><rect width="14" height="10" fill="color-mix(in srgb, var(--seq) ${k}%, var(--paper))"/></svg>${lab}`));

  function render() {
    const data = A.map(a => { const rs = races(a); return { a, rs, st: stats(rs), l2: stats(rs.filter(s => isL2(s.season))) }; })
      .sort((p, r) => (p.st.n >= MIN ? p.st.med : 1e3) - (r.st.n >= MIN ? r.st.med : 1e3));

    // 1) strip: every finished race, right = higher in the field
    const svg = document.getElementById("field-strip");
    svg.replaceChildren();
    const W = 1000, L = 210, R = 110, rowH = 96, H = 40 + data.length * rowH + 20;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const x = lin(100, 0, L, W - R);
    [100, 75, 50, 25, 10, 0].forEach(v => {
      el("line", { x1: x(v), x2: x(v), y1: 26, y2: H - 22, stroke: v === 50 ? "var(--ink-3)" : "var(--rule)", "stroke-dasharray": v === 50 ? "3 3" : "" }, svg);
      el("text", { x: x(v), y: H - 6, "text-anchor": "middle", class: "axis" }, svg, v === 0 ? "Sigur" : `Efstu ${v}%`);
    });
    el("text", { x: W - R, y: 18, "text-anchor": "end", class: "small" }, svg, "ofar í hópnum →");
    el("text", { x: W - R + 14, y: 18, class: "axis" }, svg, "Miðgildi");
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    data.forEach(({ a, rs, st }, i) => {
      const y0 = 34 + i * rowH, band = 50;
      const g = el("g", {}, svg);
      bibTag(g, 10, y0 + 10, a.bib);
      el("text", { x: 26, y: y0 + 15, class: "lbl" }, g, nm(a));
      el("text", { x: 26, y: y0 + 33, class: "small" }, g, `${st.n} ${st.n === 1 ? "keppni" : "keppnir"}`);
      rs.slice().sort((p, r) => isL2(p.season) - isL2(r.season)).forEach(s => {
        const recent = isL2(s.season);
        const c = el("circle", { cx: x(s.top), cy: y0 + 4 + rnd() * band, r: 3.6, fill: recent ? AC(a) : "var(--paper)", stroke: recent ? "var(--paper)" : "var(--ink-3)", "stroke-width": recent ? 0.8 : 1.2 }, g);
        hover(c, `<b>${fmtDate(s.date)}</b><br>${s.place} · ${s.cat} · ${DNAME[s.disc] || s.disc}<br>${s.pos}. sæti af ${s.nfin} sem kláruðu (${s.nstart} ræstu)<br>Efstu ${tp(s.top)}`);
      });
      if (st.n >= MIN) {
        const yb = y0 + band + 16;
        el("line", { x1: x(st.q1), x2: x(st.q3), y1: yb, y2: yb, stroke: "var(--ink-3)", "stroke-width": 3 }, g);
        el("line", { x1: x(st.med), x2: x(st.med), y1: yb - 5, y2: yb + 5, stroke: AC(a), "stroke-width": 2.4 }, g);
        el("text", { x: W - R + 14, y: y0 + 40, class: "big" }, g, tp(st.med));
      } else el("text", { x: W - R + 14, y: y0 + 40, class: "small" }, g, "of fáar");
      el("line", { x1: 0, x2: W, y1: y0 + rowH - 6, y2: y0 + rowH - 6, stroke: "var(--rule)" }, svg);
    });

    // 1b) place in field by race strength tier, all athletes in one chart, strongest tier on top
    const TIERS = [
      ["Heimsbikar, HM og Ólympíuleikar", "WC, WSC, OWG", s => ["WC", "WSC", "OWG"].includes(s.cat)],
      ["Evrópubikar, álfubikarar og HM unglinga", "EC, NAC, ANC, SAC, WJC", s => TOPCAT.includes(s.cat)],
      ["Sterk FIS-mót og landsmót", "refsing 23 eða lægri", s => s.pen <= 23.5],
      ["Miðlungs FIS-mót og landsmót", "refsing 23–40", s => s.pen <= 40],
      ["Veik mót", "refsing yfir 40", () => true],
    ];
    const tierOf = s => TIERS.findIndex(tr => tr[2](s));
    const ts = document.getElementById("field-tiers");
    ts.replaceChildren();
    const rowT = 20, headT = 48, gapT = 14, bandT = headT + data.length * rowT + gapT;
    const HT = 30 + TIERS.length * bandT + 20, RT = 150;
    ts.setAttribute("viewBox", `0 0 ${W} ${HT}`);
    const xt = lin(100, 0, L, W - RT);
    [100, 75, 50, 25, 10, 0].forEach(v => {
      el("line", { x1: xt(v), x2: xt(v), y1: 22, y2: HT - 22, stroke: v === 50 ? "var(--ink-3)" : "var(--rule)", "stroke-dasharray": v === 50 ? "3 3" : "" }, ts);
      el("text", { x: xt(v), y: HT - 6, "text-anchor": "middle", class: "axis" }, ts, v === 0 ? "Sigur" : `Efstu ${v}%`);
    });
    el("text", { x: W - RT, y: 14, "text-anchor": "end", class: "small" }, ts, "ofar í hópnum →");
    el("text", { x: W - RT + 14, y: 14, class: "axis" }, ts, "Miðgildi · keppnir");
    TIERS.forEach(([title, sub], ti) => {
      const y0 = 30 + ti * bandT;
      el("text", { x: 0, y: y0 + 14, class: "lbl" }, ts, title);
      el("text", { x: 0, y: y0 + 30, class: "small" }, ts, sub);
      data.forEach(({ a, rs }, i) => {
        const yy = y0 + headT + i * rowT;
        const tr = rs.filter(s => s.pen != null && tierOf(s) === ti);
        const st = stats(tr);
        const g = el("g", {}, ts);
        bibTag(g, 16, yy, a.bib);
        el("text", { x: 28, y: yy + 4, class: "small" }, g, nm(a));
        el("line", { x1: L, x2: W - RT, y1: yy, y2: yy, stroke: "var(--wash)", "stroke-width": rowT - 4 }, g);
        const tipTxt = s => `<b>${fmtDate(s.date)}</b><br>${s.place} · ${s.cat} · ${DNAME[s.disc] || s.disc}<br>${s.pos}. sæti af ${s.nfin} sem kláruðu · efstu ${tp(s.top)}<br>Refsing keppninnar ${nf(s.pen)}`;
        if (st.n >= MIN) {
          el("line", { x1: xt(st.q1), x2: xt(st.q3), y1: yy, y2: yy, stroke: AC(a), "stroke-width": 3, "stroke-opacity": .45 }, g);
          const c = el("circle", { cx: xt(st.med), cy: yy, r: 5.5, fill: AC(a), stroke: "var(--paper)", "stroke-width": 1.2 }, g);
          hover(c, `<b>${nm(a)}</b> · ${title}<br>Miðgildi efstu ${tp(st.med)} · miðhelmingur ${tp(st.q1)}–${tp(st.q3)}<br>${st.n} keppnir · efri helmingur í ${pct(st[50])}`);
          el("text", { x: W - RT + 14, y: yy + 4, class: "lbl" }, g, tp(st.med));
          el("text", { x: W - RT + 66, y: yy + 4, class: "small" }, g, st.n);
        } else {
          tr.forEach(s => hover(el("circle", { cx: xt(s.top), cy: yy, r: 4, fill: "var(--paper)", stroke: AC(a), "stroke-width": 1.6 }, g), tipTxt(s)));
          el("text", { x: W - RT + 14, y: yy + 4, class: "small" }, g, tr.length ? "of fáar" : "–");
          if (tr.length) el("text", { x: W - RT + 66, y: yy + 4, class: "small" }, g, tr.length);
        }
      });
      if (ti < TIERS.length - 1) el("line", { x1: 0, x2: W, y1: y0 + bandT - gapT / 2, y2: y0 + bandT - gapT / 2, stroke: "var(--rule)" }, ts);
    });

    // 2) nested bands: share of races in the top 10 / 25 / 50%
    const bs = document.getElementById("field-bands");
    bs.replaceChildren();
    const rowB = 34, HB = 30 + data.length * rowB + 24, RB = 220;
    bs.setAttribute("viewBox", `0 0 ${W} ${HB}`);
    const xb = lin(0, 1, L, W - RB);
    [0, .25, .5, .75, 1].forEach(v => {
      el("line", { x1: xb(v), x2: xb(v), y1: 16, y2: HB - 22, stroke: "var(--rule)" }, bs);
      el("text", { x: xb(v), y: HB - 6, "text-anchor": "middle", class: "axis" }, bs, `${v * 100}%`);
    });
    el("text", { x: W - RB, y: 10, "text-anchor": "end", class: "small" }, bs, "Hlutfall keppna, betra →");
    el("text", { x: xb(1) + 12, y: 10, class: "axis" }, bs, "efstu 10% · 25% · 50%");
    data.forEach(({ a, st }, i) => {
      const yy = 30 + i * rowB;
      bibTag(bs, 10, yy, a.bib);
      el("text", { x: 26, y: yy + 5, class: "lbl" }, bs, nm(a));
      el("rect", { x: L, y: yy - 9, width: xb(1) - L, height: 18, fill: "var(--wash)" }, bs);
      if (!st.n) return;
      BANDS.slice().reverse().forEach(([b, lab, k]) => {
        const r = el("rect", { x: L, y: yy - 9, width: Math.max(0, xb(st[b]) - L), height: 18, fill: `color-mix(in srgb, var(--seq) ${k}%, var(--paper))` }, bs);
        hover(r, `<b>${nm(a)}</b><br>${lab}: ${pct(st[b])} (${Math.round(st[b] * st.n)} af ${st.n} keppnum)`);
      });
      el("text", { x: xb(1) + 12, y: yy + 5, class: "lbl" }, bs, BANDS.map(([b]) => pct(st[b])).join(" · "));
    });

    // 3) numbers: both periods
    const tb = document.getElementById("field-tbl");
    tb.replaceChildren();
    const rows = [];
    data.forEach(({ a, st, l2 }) => [[PERIODS.all, st], [PERIODS.last2, l2]].forEach(([p, m], k) => {
      rows.push([k ? "" : nm(a), p, m.n, m.n >= MIN ? tp(m.med) : "–", m.n >= MIN ? `${tp(m.q1)}–${tp(m.q3)}` : "–", ...BANDS.map(([b]) => m.n ? pct(m[b]) : "–")]);
    }));
    table("field-tbl", ["Keppandi", "Tímabil", "Keppnir", "Miðgildi (efstu X%)", "Miðhelmingur", "Efstu 10%", "Efstu 25%", "Efri helmingur"], rows);
  }

  // filter chips
  [["field-disc", GROUPS, () => disc, v => disc = v], ["field-level", LEVELS, () => level, v => level = v]].forEach(([id, opts, get, set]) => {
    const box = document.getElementById(id);
    opts.forEach(([k, lab]) => {
      const b = h("button", { class: "chip", type: "button", "aria-pressed": String(k === get()) }, box);
      b.textContent = lab;
      b.addEventListener("click", () => {
        set(k);
        box.querySelectorAll(".chip").forEach((c, j) => c.setAttribute("aria-pressed", String(opts[j][0] === get())));
        render();
      });
    });
  });
  render();
})();

// ---------- notes ----------
document.getElementById("notes-body").innerHTML = [
  `<b>Heimild.</b> Úrslit og FIS-punktalistar af fis-ski.com. Úrslitin ná yfir ${sl(S0)} til ${sl(S1)} (FIS-tímabil er frá júlí til júní). Æfingamót (TRA) gefa enga FIS-punkta og eru hvergi tekin með.`,
  `<b>Tvö tímabil.</b> „4 tímabil“ eru síðustu fjögur tímabilin, ${sl(S0)}–${sl(S1)}. Það er ekki allur ferillinn. „Síðustu 2“ eru ${sl(D.last2[0])} og ${sl(D.last2[1])}.`,
  `<b>Stefna.</b> Í öllum gröfum er betra að vera lengra til hægri eða ofar, og keppendum er raðað frá þeim besta í hverjum þætti. FIS-punktar og sæti á heimslista lækka bæði eftir því sem skíðamaður bætir sig, svo á þeim ásum eru lægri tölur til hægri eða efst.`,
  `<b>Áreiðanleiki</b> er fjöldi kláraðra ferða deilt með fjölda ræsinga. DNF og DSQ teljast sem ekki klárað. DNS telst ekki sem ræsing. „Komst ekki í seinni ferð“ er ekki tekið með því keppandinn komst niður brautina.`,
  `<b>Stöðugleiki</b> ber hverja keppni saman við eigin punkta keppandans í greininni á punktalista þess dags, svo keppandi sem bætir sig hratt telst ekki óstöðugur. Einkunnin er hlutfall keppna innan 10 punkta frá miðgildi keppandans. Keppnir í grein þar sem keppandinn hefur ekki enn punkta eru ekki taldar með. Gildi utan −80 til +40 eru teiknuð við jaðarinn með ör; þau stafa yfirleitt af gömlum punktum í hraðagrein sem keppandinn keppir sjaldan í.`,
  `<b>Framfarir</b> nota meðaltal tveggja bestu greina á hverjum lista, svo sérhæfður keppandi er metinn á sínum greinum. Ungir keppendur sem byrja með háa punkta eiga meira inni, sem hyglir yngstu keppendunum þegar mælt er í prósentum.`,
  `<b>Árangur</b> notar sæti á heimslista því keppnispunktar úr litlum landsmótum ýtast í átt að lágmarksrefsingu, sem gerir bestu keppnispunkta að veikum mælikvarða á getu. Sæti kvenna og karla koma af aðskildum listum.`,
  `<b>Sæti innan keppnishópsins</b> er sæti deilt með fjölda þeirra sem kláruðu keppnina, samkvæmt úrslitasíðu FIS. Keppendur sem luku ekki keppni eða var vísað úr keppni teljast ekki í hópnum, svo mælikvarðinn segir til um hraða en ekki áreiðanleika. Keppnir á heimsmeistaramóti með undankeppni eru ekki með því þar er sætið reiknað yfir stærri hóp en þann sem kláraði aðalkeppnina. „Alþjóðleg mót“ eru heims- og Evrópubikar, álfubikarar, heimsmeistaramót, Ólympíuleikar, EYOF og háskólamót; annað telst FIS-mót eða landsmót. Hópurinn er misstór og missterkur eftir mótum, frá fámennum landsmótum til fjölmennra FIS-móta í Ölpunum, svo sama hlutfall er ekki jafn mikils virði á öllum mótum. <b>Styrkur keppni</b> er refsing hennar, lesin sem keppnispunktar sigurvegarans því sigurvegarinn fær 0 tímapunkta. Refsingin er reiknuð út frá FIS-punktum bestu keppendanna en fer aldrei undir lágmark hvers mótaflokks, svo hún greinir vel á milli mótaflokka og veikra móta en síður á milli sterkra FIS-móta sem öll lenda í lágmarkinu. Þess vegna eru tveir efstu styrkleikaflokkarnir skilgreindir eftir mótaflokki (heimsbikar, HM og Ólympíuleikar; Evrópubikar, álfubikarar og HM unglinga) en hinir eftir refsingu: 23 eða lægri (í eða undir lágmarki FIS-móta), 23–40 og yfir 40. Landsmót með lágmarksrefsingu 20 lenda því með sterkum FIS-mótum.`,
  single ? "" : `<b>Heildarröð</b> er meðaltal sætanna átta, þar sem allir þættir vega jafnt. Með annarri vigtun getur röðin breyst, til dæmis ef framfarir skipta meira máli en hlutfall kláraðra ferða fyrir ungan hóp.`,
].filter(Boolean).map(p => `<p>${p}</p>`).join("");
}

// Section markup. Wording follows comparison_is.html; group sizes and names are filled in.
function template(A, D, c) {
  const n = A.length, g = c.group, gn = g.length;
  const they = c.single ? "keppandinn" : "þau";
  const mixed = !c.single && A.some(a => a.gender === "W") && A.some(a => a.gender === "M");
  const newSeason = Math.max(0, ...A.flatMap(a => a.lists.map(l => l.season))) > c.S1
    ? ` Fyrstu listar tímabilsins ${sl(c.S1 + 1)} eru endurreiknaðir, svo punktar geta hækkað án þess að keppt hafi verið.` : "";
  const others = ["", "hinum keppandanum", "hinum tveimur", "hinum þremur", "hinum fjórum"][gn - 1] || "hinum";
  const sec = (id, k, title, q, body) => `<section id="${id}"><div class="sechead"><span class="k">${k}</span><h2>${title}</h2>${q ? `<span class="question">${q}</span>` : ""}</div>${body}</section>`;
  const ask = (plural, one) => c.single ? one : plural;
  let html = "";
  if (!c.single) html += sec("board-sec", "Niðurstöður", "Staðan", `Sæti 1–${n} í hverjum þætti. Dekkri blár er betra.`,
    `<div class="scroll"><table class="board" id="board"></table></div>
    <p class="cap">Heildarröðin er meðaltal sætanna átta, þar sem allir þættir vega jafnt. Hún er samantekt á þessum samanburði, ekki FIS-röðun.</p>`);
  html += sec("stability", "Þáttur 1", "Áreiðanleiki", ask("Hversu oft komast þau í mark?", "Hversu oft kemst keppandinn í mark?"),
    `<p class="explain">Hver ræsing er einn reitur, í tímaröð innan hvers tímabils. <b>Grár reitur</b> þýðir að keppandinn kláraði. <b>Rauður reitur</b> þýðir að hann lauk ekki keppni (DNF), og rauður rammi þýðir frávísun (DSQ). Keppnir þar sem keppandi mætti ekki til leiks og æfingamót eru ekki talin með. Ræsing sem endaði á „komst ekki í seinni ferð“ er sýnd en ekki talin með.</p>
    <div class="verdict" id="stab-verdict"></div>
    <div class="legend" id="stab-legend"></div>
    <div class="scroll"><svg id="runsheet"></svg></div>
    <h3>Hlutfall kláraðra ferða</h3>
    <p class="cap">Opinn hringur: öll fjögur tímabilin. Fylltur hringur: síðustu tvö tímabil. Línan sýnir breytinguna þar á milli.</p>
    <div class="scroll"><svg id="finrate"></svg></div>
    <details><summary>Tölur</summary><div class="scroll"><table class="tbl" id="stab-tbl"></table></div></details>`);
  html += sec("consistency", "Þáttur 2", "Stöðugleiki", ask("Skíða þau í samræmi við eigin getu, keppni eftir keppni?", "Skíðar keppandinn í samræmi við eigin getu, keppni eftir keppni?"),
    `<p class="explain">Hver depill er ein kláruð keppni, borin saman við eigin FIS-punkta keppandans í greininni á punktalistanum sem gilti þann dag. <b>Núll</b> þýðir að keppandinn skíðaði nákvæmlega í samræmi við punktana sína; hægra megin við núll er dagur betri en punktarnir segja til um. Þéttur hópur depla sýnir stöðugan skíðamann. Strikið undir hverri röð sýnir 20 punkta bil í kringum dæmigerðan árangur keppandans, og einkunnin er <b>hlutfall keppna sem lenda innan þess</b>. Hærra er betra.</p>
    <div class="verdict" id="cons-verdict"></div>
    <div class="legend" id="cons-legend"></div>
    <div class="scroll"><svg id="strip"></svg></div>
    <details><summary>Tölur</summary><div class="scroll"><table class="tbl" id="cons-tbl"></table></div></details>`);
  html += sec("progression", "Þáttur 3", "Framfarir", ask("Eru FIS-punktarnir þeirra að lækka?", "Eru FIS-punktarnir að lækka?"),
    `<p class="explain">Línan sýnir <b>getustig</b> ${c.single ? "keppandans" : "hvers keppanda"}: meðaltal tveggja bestu greina á hverjum FIS-punktalista. FIS-punktar lækka eftir því sem skíðamaður bætir sig, svo grafið er teiknað með færri punkta ofar: hækkandi lína þýðir að keppandinn er að bæta sig. Einkunnin er hversu mikið getustigið batnaði, í prósentum, frá fyrsta lista tímabilsins að nýjasta FIS-punktalistanum.${newSeason}${c.single ? " Mjóu gráu línurnar eru aðrir íslenskir keppendur af sama kyni, til samanburðar; gildi utan kvarðans eru teiknuð við jaðar hans." : ""}</p>
    <div class="verdict" id="prog-verdict"></div>
    ${c.single ? "" : `<div class="chips" id="prog-chips" role="group" aria-label="Auðkenna keppanda"></div>`}
    <div class="scroll"><svg id="levelchart"></svg></div>
    <h3>Frá upphafi til enda</h3>
    <p class="cap">Getustig í upphafi hvors tímabils og á nýjasta punktalistanum. Örin bendir þangað sem keppandinn endaði; lengri ör til hægri þýðir meiri framfarir.</p>
    <div class="scroll"><svg id="dumbbell"></svg></div>
    <h3>Eftir greinum</h3>
    <p class="cap">Punktar á punktalista í hverri grein, sami kvarði fyrir alla, skorið við 160 punkta. Hér er líka betra að vera ofar.</p>
    <div class="legend" id="disc-legend"></div>
    <div class="multiples" id="multiples"></div>
    <details><summary>Tölur</summary><div class="scroll"><table class="tbl" id="prog-tbl"></table></div></details>`);
  html += sec("success", "Þáttur 4", "Árangur", ask("Hversu hátt hafa þau náð?", "Hversu hátt hefur keppandinn náð?"),
    `<p class="explain">Einkunnin er <b>besta sæti á heimslista</b> sem keppandinn náði í einhverri grein á FIS-punktalista á tímabilinu. Grafið sýnir besta sæti í hverri grein á lograkvarða, þar sem hærra sæti á heimslista er lengra til hægri.${mixed ? " Konur og karlar eru á aðskildum heimslistum og keppendur á lista kvenna eru færri, svo sæti kvenna og karla eru ekki beint sambærileg." : ""}</p>
    <div class="verdict" id="succ-verdict"></div>
    <div class="legend" id="succ-legend"></div>
    <div class="scroll"><svg id="rankplot"></svg></div>
    <h3>Verðlaunasæti</h3>
    <p class="cap">Öll sæti á palli, á hvaða stigi sem er. Einn reitur fyrir hvert verðlaunasæti: gull fyrir sigur, silfur fyrir 2. sæti, brons fyrir 3. sæti. Dálkurinn til hægri sýnir besta árangur á alþjóðlegu móti.</p>
    <div class="scroll"><svg id="podiums"></svg></div>
    <details><summary>Tölur</summary><div class="scroll"><table class="tbl" id="succ-tbl"></table></div></details>`);
  if (!c.single && gn >= 2) {
    const all = gn === 2 ? "bæði" : `${c.G === "M" ? "allir" : "allar"} ${word(gn, c.G)}`;
    const excl = A.filter(a => !g.includes(a));
    html += sec("h2h", "Viðbót", "Innbyrðis viðureignir", "Hver vinnur þegar þau keppa hvert við annað?",
      `<p class="explain">Þegar ${gn === 2 ? "bæði" : "tveir"} klára sömu keppni vinnur sá sem endar ofar þá viðureign. Styrkur keppninnar, brautin og færið eru þá þau sömu fyrir báða, svo þetta er beinasti samanburðurinn. Ef annar hvor lýkur ekki keppni er hún ekki talin hér; áreiðanleikinn er metinn í kaflanum Áreiðanleiki.${excl.length ? ` ${excl.map(nm).join(" og ")} ${excl.length > 1 ? "keppa" : "keppir"} í ${c.G === "M" ? "kvennakeppnum" : "karlakeppnum"} og ${excl.length > 1 ? "eru" : "er"} því ekki með.` : ""} Þetta er ekki einn af fjórum þáttunum sem gefin er einkunn.</p>
      <div class="chips" id="h2h-disc" role="group" aria-label="Grein"></div>
      <h3>Vinningshlutfall gegn ${others}</h3>
      <p class="cap">Hlutfall unninna viðureigna. Lengra til hægri er betra; 50% er jafnt.</p>
      <div class="scroll"><svg id="h2h-bars"></svg></div>
      <h3>Allar viðureignir</h3>
      <p class="cap">Lesið lárétt: hver reitur er árangur keppandans í röðinni gegn keppandanum í dálkinum, sigrar–töp. Dekkri blár er betri árangur fyrir keppandann í röðinni. Færðu bendilinn yfir reit til að sjá skiptingu eftir greinum.</p>
      <div class="scroll"><table class="h2h" id="h2h-matrix"></table></div>
      <h3>Sigur- og tapmunur</h3>
      <p class="cap">Hver depill er ein viðureign, staðsett eftir tímamuninum á þeim tveimur sem hlutfalli af tíma sigurvegarans (1% er um ein sekúnda í 100 sekúndna ferð). Deplar hægra megin við miðlínuna eru viðureignir sem sá fyrrnefndi vann, deplar vinstra megin vann hinn. Stuttu strikin sýna miðgildi sigurmunar hvorum megin. Keppnir án skráðs tímamunar eru ekki með, svo hér getur munað frá töflunni að ofan.</p>
      <div class="scroll"><svg id="h2h-margins"></svg></div>
      ${gn >= 3 ? `<h3>Þegar ${all} ræstu</h3>
      <p class="cap" id="h2h-group-cap"></p>
      <div class="legend" id="h2h-group-legend"></div>
      <div class="scroll"><svg id="h2h-group"></svg></div>
      <h3>Munur á þeim fljótasta í hópnum</h3>
      <p class="cap">Í keppnum þar sem minnst ${gn >= 4 ? "þrír" : "tveir"} úr hópnum kláruðu: hversu langt á eftir þeim fljótasta þeirra hver keppandi var, sem miðgildi á tímabili, í % af tíma sigurvegarans. 0% þýðir að keppandinn var yfirleitt fljótastur í hópnum. Ofar er betra. Tímabil með færri en 3 slíkar keppnir eru ekki sýnd. Færðu bendilinn yfir depil til að sjá fjölda keppna.</p>
      <div class="scroll"><svg id="h2h-gap"></svg></div>` : ""}`);
  }
  html += sec("appendix", "Viðauki", "Úrslit eftir tímabilum", "Hvernig hafa keppnisúrslitin þróast?",
    `<p class="explain">Fyrir ${c.single ? "hverja" : "hvern keppanda,"} grein og tímabil: <b>miðgildi keppnispunkta</b> í kláruðum keppnum. Færri punktar eru betri, svo bestu úrslitin eru efst í gröfunum. Hraðagreinar eru risasvig og brun saman. Tímabil er aðeins sýnt ef keppandinn kláraði minnst 3 keppnir í greininni.</p>
    <h3>Miðgildi eftir tímabilum</h3>
    <p class="cap">${c.single ? "Hækkandi lína" : "Ein lína fyrir hvern keppanda; hækkandi lína"} þýðir að dæmigerð keppni er að batna. Mjóa lóðrétta strikið sýnir miðhelming keppnanna það tímabil. Öll þrjú gröfin nota sama lograkvarða.</p>
    <div class="legend" id="sm-legend"></div>
    <div class="multiples" id="season-multiples"></div>`);
  html += sec("field", "Viðauki", "Sæti innan keppnishópsins", ask("Hvar í hópnum enda þau?", "Hvar í hópnum endar keppandinn?"),
    `<p class="explain">Fyrir hverja kláraða keppni á síðustu fjórum tímabilum: sæti keppandans sem <b>hlutfall af þeim sem kláruðu</b>. 5. sæti af 50 sem kláruðu er efstu 10%. Sigur er alltaf efst í hópnum, sama hversu stór hann er. Keppnir sem keppandinn kláraði ekki eru ekki með; þær eru metnar í kaflanum Áreiðanleiki. Hópurinn er misstór og missterkur eftir mótum, svo hægt er að skoða alþjóðleg mót sér.</p>
    <div class="chips" id="field-disc" role="group" aria-label="Grein"></div>
    <div class="chips" id="field-level" role="group" aria-label="Mótastig"></div>
    <h3>Allar keppnir</h3>
    <p class="cap">Hver depill er ein kláruð keppni. Lengra til hægri er ofar í hópnum. Strikið undir hverri röð sýnir miðhelming keppnanna og lóðrétta strikið miðgildið. Talan til hægri er miðgildið: í dæmigerðri keppni endar keppandinn meðal efstu X%. Færðu bendilinn yfir depil til að sjá keppnina.</p>
    <div class="legend" id="field-legend"></div>
    <div class="scroll"><svg id="field-strip"></svg></div>
    <h3>Sæti í hópnum og styrkur keppninnar</h3>
    <p class="cap">Keppnunum er skipt í fimm styrkleikaflokka, sterkasti flokkurinn efst. Styrkur FIS-móta og landsmóta er metinn með <b>refsingu</b> keppninnar (keppnispunktum sigurvegarans): lægri refsing þýðir sterkari hóp. Depillinn sýnir miðgildið og strikið miðhelming keppnanna í flokknum; lengra til hægri er ofar í hópnum. Ef depillinn færist til vinstri eftir því sem ofar dregur missir keppandinn stöðu sína í sterkari hópum. Þar sem keppnir eru færri en 3 eru þær sýndar stakar sem opnir hringir.</p>
    <div class="scroll"><svg id="field-tiers"></svg></div>
    <h3>Hlutfall keppna ofarlega í hópnum</h3>
    <p class="cap">Hlutfall kláraðra keppna þar sem keppandinn endaði meðal efstu 10%, 25% og 50%. Hver litur nær yfir þann á undan, svo lengd súlunnar að enda ljósasta hlutans er hlutfall keppna í efri helmingi. Lengri súla er betri.</p>
    <div class="legend" id="field-band-legend"></div>
    <div class="scroll"><svg id="field-bands"></svg></div>
    <details><summary>Tölur</summary><div class="scroll"><table class="tbl" id="field-tbl"></table></div></details>`);
  html += sec("notes", "Aðferð", "Skýringar", "", `<div class="notes" id="notes-body"></div>`);
  return html;
}

root.renderReport = renderReport;
root.ReportUtil = { nf, sl, nm, fmtDate, statusIs, DNAME, DISCS, pct, ordinal, el, h, hover, lin, logs, t };
})(window);
