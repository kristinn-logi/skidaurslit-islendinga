# Style guide: reports on the Icelandic alpine team

This guide describes the style used by `report/comparison_is.html` (the screen
report) and `report/rodun_launasjodur.pdf` (the print report). Follow it for new
reports so they look like they belong to the same set.

The CSS lives in `report/template_is.html` (screen) and in the `CSS` string in
`build_order_report.py` (print). When they disagree, those files win and this
guide should be updated.

## 1. Principles

1. **Plain report, one column of reading.** White paper, black text, thin grey
   rules. No shadows, gradients, rounded cards or decorative images.
2. **Colour carries meaning only.** Each athlete has one colour, used the same
   way everywhere. Red is only for failures (DNF/DSQ). Everything else is ink or grey.
3. **Right or up is better.** Every chart is drawn so that the better result is
   further right or higher. FIS points (lower is better) are drawn on an inverted axis.
4. **Best first.** Lists, tables and legends are ordered best to worst, or by the
   report's ranking.
5. **Numbers are read, not decorated.** Tabular figures, right-aligned in tables,
   with the unit or context in small grey text under or next to them.
6. **Every chart and table explains itself.** A bold title above it and one or two
   grey sentences below saying how to read it and what "better" means.

## 2. Colour

Defined as CSS custom properties on `:root`.

| Token | Light | Use |
|---|---|---|
| `--paper` | `#ffffff` | Page background |
| `--ink` | `#111111` | Body text, headings, emphasis rule on the reason box |
| `--ink-2` | `#555555` | Secondary text: captions, labels, subtitles, notes |
| `--ink-3` | `#9a9a9a` | Table header rule, season separators in charts |
| `--rule` | `#e3e3e3` | Hairlines between rows and sections, chart gridlines, quote rule |
| `--wash` | `#f4f5f7` | Background of tiles, info boxes and the "missing" note |
| `--bad` | `#d03b3b` | DNF / DSQ only |
| `--seq` | `#1c5cab` | Sequential blue ramp for ranked cells (screen report) |
| `--gold` `--silver` `--bronze` | `#d9a400` `#9ea4ab` `#b8733a` | Podium places only |

Other athletes in a chart are drawn in neutral grey `#cfd2d6`.

### Athlete colours

The colour follows the athlete's bib, which is their row in `data/athletes.csv`.
It does not follow their place in a ranking, so an athlete keeps their colour when
the order changes.

| Bib | Token | Light | Dark | Athlete |
|---|---|---|---|---|
| 1 | `--a1` | `#2a78d6` blue | `#3987e5` | Bjarni Thor Hauksson |
| 2 | `--a2` | `#eb6834` orange | `#d95926` | Jón Erik Sigurðsson |
| 3 | `--a3` | `#1baf7a` green | `#199e70` | Gauti Guðmundsson |
| 4 | `--a4` | `#eda100` amber | `#c98500` | Hólmfríður Dóra Friðgeirsdóttir |
| 5 | `--a5` | `#e87ba4` pink | `#d55181` | Matthías Kristinsson |

Use an athlete's colour for their line or marks in charts, their rank badge and the
fill of their progress bars. Never use it for text or for backgrounds of large areas.

### Dark mode (screen only)

The HTML report follows the system setting under
`@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`,
and again under `:root[data-theme="dark"]`. Dark values: `--paper #141414`,
`--ink #f2f2f2`, `--ink-2 #b5b5b5`, `--ink-3 #777777`, `--rule #2c2c2c`,
`--wash #1d1f22`, plus the dark athlete colours above. The PDF is always light.

## 3. Typography

One family, the system sans-serif stack:

```css
--font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

All numbers use `font-variant-numeric: tabular-nums`.

| Role | Screen (HTML) | Print (PDF) | Weight / colour |
|---|---|---|---|
| Body | 15px / 1.55 | 10pt / 1.45 | 400, `--ink` |
| Title `h1` | 30px | 22pt | 700 |
| Section title `h2` | 22px | 15pt (athlete name 17pt) | 700 |
| Sub-heading `h3` | 16px | 10.5pt | 700 |
| Eyebrow label (`.k`, `.tk`) | 12px | 8pt | uppercase, letter-spacing .04–.05em, `--ink-2` |
| Lede under title | 15px | 10pt | `--ink-2`, max 72ch |
| Caption / chart note | 13px | 8–9pt | `--ink-2` |
| Big figure in a tile (`.tv`) | – | 16pt | 700 |
| Chart axis labels | 11px | 8.5px (SVG units) | `--ink-2` |

Keep line length at or under about 72–80 characters for running text.

## 4. Page layout

### Screen (HTML)
- Content column `max-width: 1040px`, centred, `padding-inline: 16px`.
- Sections separated by `padding-block: 36px 8px` and a 1px `--rule` bottom border.
- Must work at phone width with no horizontal page scroll. Wide charts go in a
  `.scroll` wrapper with a `min-width` on the SVG.

### Print (PDF)
- A4 portrait, margins `16mm 15mm`.
- `print-color-adjust: exact` on `html` so fills and colours print.
- Page 1: masthead, the ranking and the principles behind it.
- **One page per athlete** (`section.athlete { break-before: page; }`). If an
  athlete's content runs over, shorten the text rather than letting it spill.
- Last page: method notes (`.method { break-before: page; }`).

## 5. Components

### Masthead
```
Alpagreinar · Landslið Íslands · 29. september 2026     ← .meta, 9pt, --ink-2
Röðun fyrir Launasjóð                                   ← h1
One or two sentences on what the report is based on.    ← .lede, --ink-2
───────────────────────────────────────────────────────  ← 1px --rule
```

### Section heading
An uppercase eyebrow (`.k`) above a bold `h2`, e.g. `NIÐURSTAÐA` / **Röðunin**, or
`ÞÁTTUR 1` / **Áreiðanleiki**. In the screen report a grey question may follow the
title, e.g. *Hversu oft komast þau í mark?*

### Rank badge (`.rankno`)
A filled circle in the athlete's colour with the rank in white bold. 34px on the
athlete page, 24px (`.sm`) in tables.

### Ranking table (`table.order`)
- Columns: badge, name (bold 11pt), then numeric columns right-aligned at 11pt/600.
- Header: 8pt, `--ink-2`, weight 600, with a 1px `--ink-3` rule under it.
- Rows separated by 1px `--rule`. No vertical lines, no zebra stripes.
- A unit or discipline sits under a number in `.small` (8pt grey), e.g. `150.` / `svig`.
- Under the table, one `.note` paragraph (8.5pt grey) defines every column.

### Info boxes (`.basis`)
Three equal boxes on `--wash`, each a bold label on its own line and one or two
sentences. Use them for the principles behind a ranking.

### Athlete page
In this order:
1. **Header** (`.ahead`): badge + name (`h2`) + grey subtitle `Club · FIS code · karl/kona`, with a rule underneath.
2. **Reason box** (`.reason`): 3px `--ink` left rule, eyebrow `RÖKSTUÐNINGUR`, then one to three sentences at 10.5pt. It is the only place a black rule is used, so it reads first.
3. **Key-figure tiles** (`.tiles`): four `--wash` tiles in a row, each with an eyebrow label, one big figure, and at most one grey line of context. A rate can carry a 5px bar filled in the athlete's colour on a `#dfe1e5` track.
4. **Two columns** (`.cols`, 1 : 1.15):
   - Left, **Umsögn þjálfara**: the coach's text as a `blockquote` with a 3px `--rule` left border. The preparation paragraph starts with a bold lead-in, **Skíðaundirbúningur.** If there is no statement, show a `.missing` box in grey italics: *Umsögn þjálfara liggur ekki fyrir.*
   - Right, **Árangur**: a bullet list of five or six facts, then the chart.

### Highlights list (`ul.hl`)
- Each bullet is one fact with its number, place and date. Write "11. sæti í svigi á HM unglinga í Narvik í mars 2026", not "góður árangur á HM unglinga".
- Bold (`<b>`) only the key figure or event in a bullet, at most one or two phrases.
- Order: world ranking and progress, then championship results, then wins, then reliability.

## 6. Charts

Inline SVG, drawn by the build script. No chart libraries.

- **Direction:** better is up or right. FIS points use an inverted y-axis (20 at the top).
- **Shared scale:** every athlete's chart of the same kind uses the same axes, so pages can be compared side by side.
- **Focus + context:** the athlete in their colour (2.4px line); everyone else as thin grey lines (`.ghost`, 1.1px `#cfd2d6`) behind.
- **Gridlines:** horizontal only, 0.6px `--rule`. Season boundaries as 0.5px dashed `--ink-3` verticals. No chart border, no background.
- **Direct labelling:** label the last value at the end of the line (bold 10px) instead of using a legend. If a legend is needed, put it above or below the chart in 7.5–8pt grey.
- **Clipping:** clamp values to the axis range and say so in the caption.
- **Title and note:** a 9pt bold title (`.chead`) above, and an 8pt grey note (`.cnote`) below saying what the line is and that up is better.
- **Failures:** red `--bad` crosses on a separate row below the axis, never mixed into the data area.
- **Screen report extras:** the blue ramp (`--seq`, darker is better) for ranked cells; medal colours for podiums; hover tooltips are allowed on screen but the chart must be readable without them.

## 7. Writing and number conventions (Icelandic)

- **Language:** reports are written in Icelandic, in short, factual sentences. Say what the number is before saying what it means.
- **Decimals:** comma. `26,83 punktar`, `84%`.
- **Ordinals:** a number with a period. `150. sæti`, `2. sæti`, `13. listi`.
- **Dates:** `18. des. 2005`, `1. okt. 2025`, and months in full in running text ("í mars 2026").
- **Seasons:** `2025/26` in text, `25/26` in tight spaces. Season 2026 in the data is 2025/26.
- **FIS points:** always say whether a figure is **race points** (`keppnispunktar`) or **points-list points** (`punktar á FIS-lista`). Remind readers once per report that fewer points is better.
- **World ranking:** say which list it comes from, e.g. *nýjasti FIS-punktalisti (13. listi 2026/27)*.
- **Discipline names:** `svig`, `stórsvig`, `risasvig`, `brun`. The codes SL/GS/SG/DH are for the data only.
- **Competition names:** HM unglinga (WJC), HM (WSC), Ólympíuleikar (OWG), Evrópubikar (EC), Heimsbikar (WC), Suður- / Norður-Ameríkubikar (SAC / NAC), Heimsleikar háskólanema (UNI), Íslandsmót (NC).
- **Names:** full Icelandic spelling in reports (Jón Erik Sigurðsson), even though FIS stores them in ASCII (Jon Erik Sigurdsson).
- **Coach statements:** quote them as given. Correct only obvious spelling slips, never the wording.
- **Honesty:** don't state facts the data can't support, e.g. the reason an athlete hasn't raced.

## 8. Producing the PDF

The PDF is the HTML printed by headless Chrome, with no header or footer:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer --print-to-pdf=report/out.pdf file:///…/report/out.html
```

`build_order_report.py` does this for you. Before sending a report:

- [ ] Render the pages and check each athlete fits on one page.
- [ ] Every number in the text matches the data (`data/*.csv`) and the table.
- [ ] Every chart has a title, a "how to read" note, and up/right is better.
- [ ] Athlete colours match the bib table above.
- [ ] Red appears only for failures.

## 9. Word version

The Word version (`build_order_report_docx.py`) is deliberately simpler: Calibri, the
same text and order, tables with grey horizontal rules only, and a light grey header
row. It has no charts, colour badges or tiles. Use it when someone needs to edit the text.
