// Checks app/metrics.js against the metrics embedded in comparison_is.html.
// Run: node tests/test_metrics.js
const fs = require("fs");
const path = require("path");
const Metrics = require("../app/metrics.js");

const html = fs.readFileSync(path.join(__dirname, "..", "comparison_is.html"), "utf8");
const src = html.slice(html.indexOf("const D = ") + 10, html.indexOf("const A = D.athletes;"));
const D = JSON.parse(src.trim().replace(/;$/, ""));

const got = Metrics.compute(D.athletes, { seasons: D.seasons, last2: D.last2 });
let fails = 0, checks = 0;
function cmp(where, want, have) {
  if (want && typeof want === "object") {
    for (const k of Object.keys(want)) cmp(`${where}.${k}`, want[k], have == null ? undefined : have[k]);
    return;
  }
  checks++;
  const ok = typeof want === "number" && typeof have === "number" ? Math.abs(want - have) <= 0.011 : want === have;
  if (!ok) { fails++; console.log(`MISMATCH ${where}: want ${JSON.stringify(want)} got ${JSON.stringify(have)}`); }
}
for (const a of D.athletes) cmp(a.code, a.m, got.get(a.code));
console.log(`${checks - fails}/${checks} values match`);
process.exit(fails ? 1 : 0);
