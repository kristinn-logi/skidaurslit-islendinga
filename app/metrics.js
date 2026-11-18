// The four factors of the comparison report, computed for any group of athletes.
// Each factor is measured over two periods: "all" (every season in ctx.seasons) and
// "last2" (the last two of them). An athlete's `place` is their rank within the group.
(function (root) {
  const INTL = ["EC", "WC", "WSC", "WJC", "OWG", "ANC", "NAC", "SAC", "EYOF", "UNI"];
  const DISCS = ["SL", "GS", "SG", "DH"];
  const r4 = v => Math.round(v * 1e4) / 1e4, r2 = v => Math.round(v * 100) / 100, r1 = v => Math.round(v * 10) / 10;
  // linear-interpolated quantile, as used by the charts
  const q = (xs, p) => {
    const s = xs.slice().sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i);
    return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
  };

  function stability(starts) {
    const ss = starts.filter(s => s.kind !== "dnq");  // reached the bottom, so not counted
    const fin = ss.filter(s => s.kind === "fin").length;
    const byDisc = {};
    ss.forEach(s => {
      const b = byDisc[s.disc] = byDisc[s.disc] || { starts: 0, fin: 0 };
      b.starts++;
      if (s.kind === "fin") b.fin++;
    });
    return {
      starts: ss.length, fin,
      dnf: ss.filter(s => s.kind === "dnf").length,
      dsq: ss.filter(s => s.kind === "dsq").length,
      run1: ss.filter(s => s.kind !== "fin" && /1$/.test(s.pos)).length,
      rate: ss.length ? r4(fin / ss.length) : null,
      byDisc,
    };
  }

  function consistency(starts) {
    const d = starts.filter(s => s.kind === "fin" && s.delta != null).map(s => s.delta);
    if (!d.length) return { n: 0, q1: null, med: null, q3: null, within10: null, iqr: null };
    const med = q(d, .5), q1 = q(d, .25), q3 = q(d, .75);
    return { n: d.length, q1: r2(q1), med: r2(med), q3: r2(q3),
      within10: r4(d.filter(v => Math.abs(v - med) <= 10).length / d.length), iqr: r2(q3 - q1) };
  }

  function progression(lists, fromSeason) {
    const ls = lists.filter(l => l.season >= fromSeason && l.level != null);
    if (!ls.length) return { start: null, end: null, pct: null, pts: null };
    const s = ls[0], e = lists.filter(l => l.level != null).at(-1);
    return { startList: s.listid, startDate: s.from, start: s.level, endList: e.listid, endDate: e.from,
      end: e.level, pct: r1((s.level - e.level) / s.level * 100), pts: r2(s.level - e.level) };
  }

  function success(starts, lists, seasons) {
    // world ranks from the lists of the period's own seasons (not the new season's recalculated lists)
    const bestByDisc = {};
    lists.filter(l => seasons.includes(l.season)).forEach(l => DISCS.forEach(d => {
      const rank = l[d + "r"];
      if (rank != null && (!bestByDisc[d] || rank < bestByDisc[d].rank)) bestByDisc[d] = { rank, pts: l[d], date: l.from };
    }));
    const best = Object.entries(bestByDisc).sort((a, b) => a[1].rank - b[1].rank)[0];
    const fin = starts.filter(s => s.kind === "fin" && /^\d+$/.test(s.pos));
    const intl = starts.filter(s => INTL.includes(s.cat));
    const bi = fin.filter(s => INTL.includes(s.cat)).sort((a, b) => +a.pos - +b.pos || a.date.localeCompare(b.date))[0];
    return {
      bestRank: best ? best[1].rank : null, bestDisc: best ? best[0] : null, bestByDisc,
      wins: fin.filter(s => +s.pos === 1).length, podiums: fin.filter(s => +s.pos <= 3).length,
      intlStarts: intl.length,
      bestIntl: bi ? { pos: bi.pos, cat: bi.cat, disc: bi.disc, place: bi.place, date: bi.date } : null,
    };
  }

  // higher is better for these, lower for bestRank; athletes without a value go last
  const SCORE = {
    stability: m => m.rate, consistency: m => m.within10, progression: m => m.pct,
    success: m => m.bestRank == null ? null : -m.bestRank,
  };

  function compute(athletes, ctx) {
    const periods = { all: ctx.seasons, last2: ctx.last2 };
    const out = new Map();
    athletes.forEach(a => {
      const m = {};
      for (const [p, seasons] of Object.entries(periods)) {
        const st = a.starts.filter(s => seasons.includes(s.season));
        m[p] = {
          stability: stability(st), consistency: consistency(st),
          progression: progression(a.lists, seasons[0]), success: success(st, a.lists, seasons),
        };
      }
      out.set(a.code, m);
    });
    for (const p of Object.keys(periods)) for (const k of Object.keys(SCORE)) {
      const ranked = athletes.slice().sort((a, b) => {
        const va = SCORE[k](out.get(a.code)[p][k]), vb = SCORE[k](out.get(b.code)[p][k]);
        return (vb ?? -Infinity) - (va ?? -Infinity);
      });
      ranked.forEach((a, i) => { out.get(a.code)[p][k].place = i + 1; });
    }
    return out;
  }

  const api = { compute, stability, consistency, progression, success, quantile: q, INTL };
  root.Metrics = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
