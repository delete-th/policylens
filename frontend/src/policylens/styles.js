export const CSS = `
.pl, .pl * { box-sizing: border-box; }
.pl {
  position: fixed; inset: 0; width: 100vw; height: 100vh;
  --ink:      #101828; --ink-2: #667085; --ink-3: #98A2B3;
  --bg:       #F7F8FA; --surface: #FFFFFF;
  --line:     #E7E9EE; --line-2: #EFF1F5; --navy: #0F1B33;
  --danger:   #DC2626; --danger-bg: #FDEDED;
  --warn:     #D97B1F; --warn-bg:   #FDF3E7;
  --info:     #2563EB; --info-bg:   #EBF2FE;
  --ok:       #16A34A; --ok-bg:     #EAF7EE;
  --neutral:  #667085; --neutral-bg:#F0F1F4;
  --body: ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, system-ui, sans-serif;
  --data: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  font-family: var(--body); color: var(--ink); background: var(--bg);
  font-size: 13.5px; line-height: 1.5; -webkit-font-smoothing: antialiased;
}
.pl button { font: inherit; color: inherit; cursor: pointer; }
.pl input, .pl select, .pl textarea { font: inherit; color: inherit; }
.pl :focus-visible { outline: 2px solid var(--navy); outline-offset: 2px; border-radius: 4px; }
@media (prefers-reduced-motion: reduce) {
  .pl *, .pl *::before, .pl *::after { animation-duration:.001ms!important; transition-duration:.001ms!important; }
}
.pl-num { font-variant-numeric: tabular-nums; }

/* shell */
.pl-shell { display: flex; flex-direction: column; height: 100vh; }
.pl-topbar { display: flex; align-items: center; justify-content: space-between; height: 48px; padding: 0 16px; background: var(--surface); border-bottom: 1px solid var(--line); flex-shrink: 0; }
.pl-brand { display: flex; align-items: center; gap: 9px; }
.pl-brand-badge { width: 26px; height: 26px; border-radius: 6px; background: var(--navy); display: grid; place-items: center; color: #F2B84B; }
.pl-brand-name { font-weight: 700; font-size: 15px; letter-spacing: -.01em; }
.pl-avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--navy); color: #fff; display: grid; place-items: center; font-weight: 600; font-size: 12.5px; }
.pl-avatarwrap { display: flex; align-items: center; gap: 4px; }
.pl-body { flex: 1; display: flex; min-height: 0; }
.pl-sidebar { width: 96px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--line); display: flex; flex-direction: column; align-items: center; padding: 18px 0; }
.pl-side-top { display: flex; flex-direction: column; gap: 8px; }
.pl-side-bottom { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
.pl-sideitem { width: 80px; height: 60px; border-radius: 10px; border: 0; background: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--ink-3); font-size: 11.5px; font-weight: 500; }
.pl-sideitem:hover { background: var(--line-2); color: var(--ink-2); }
.pl-sideitem[aria-current="page"] { background: #EEF1FA; color: var(--navy); }
.pl-main { flex: 1; overflow-y: auto; }
.pl-page { padding: 16px 24px 18px; width: 100%; }

/* type */
.pl-h1 { font-size: 20px; font-weight: 700; letter-spacing: -.01em; margin: 0; }
.pl-h2 { font-size: 14.5px; font-weight: 700; margin: 0; }
.pl-sub { color: var(--ink-2); margin: 4px 0 0; max-width: 62ch; font-size: 13px; }
.pl-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); margin: 0 0 8px; }
.pl-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }

/* surfaces */
.pl-card { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
.pl-card-h { padding: 13px 15px; border-bottom: 1px solid var(--line-2); display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.pl-card-b { padding: 15px; }
.pl-grid { display: grid; gap: 16px; }
@media (min-width: 1000px) { .pl-grid-upload { grid-template-columns: 1.6fr 1fr; } }
@media (min-width: 1180px) { .pl-grid-review { grid-template-columns: 300px 1fr 270px; } }
@media (min-width: 900px)  { .pl-grid-final  { grid-template-columns: 240px 1fr 1fr; } }
@media (min-width: 900px)  { .pl-grid-policy { grid-template-columns: 1fr 300px; } }

/* controls */
.pl-btn { display: inline-flex; align-items: center; gap: 6px; justify-content: center; padding: 7px 12px; border-radius: 7px; border: 1px solid var(--line); background: var(--surface); font-weight: 600; font-size: 13px; white-space: nowrap; }
.pl-btn:hover:not(:disabled) { background: #FAFAFB; border-color: #D9DCE3; }
.pl-btn:disabled { opacity: .45; cursor: not-allowed; }
.pl-btn.pl-btn-primary { background: var(--navy); border-color: var(--navy); color: #fff; }
.pl-btn.pl-btn-primary:hover:not(:disabled) { background: #1A2C4E; border-color: #1A2C4E; }
.pl-btn.pl-btn-primary svg { color: #fff; }
.pl-btn-sm { padding: 5px 9px; font-size: 12.5px; border-radius: 6px; }
.pl-btn-icon { width: 30px; height: 30px; padding: 0; }
.pl-select, .pl-input { padding: 7px 9px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); width: 100%; }
.pl-toggle { position: relative; width: 36px; height: 20px; border-radius: 20px; background: var(--line); border: 0; flex-shrink: 0; transition: background .12s; }
.pl-toggle[aria-checked="true"] { background: var(--navy); }
.pl-toggle-dot { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .12s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
.pl-toggle[aria-checked="true"] .pl-toggle-dot { transform: translateX(16px); }
.pl-checkbox-row { display: flex; align-items: center; gap: 9px; padding: 7px 0; }

/* dropzone */
.pl-drop { border: 1.5px dashed #D3D6DE; border-radius: 12px; background: #FCFCFD; padding: 44px 20px; text-align: center; }
.pl-drop[data-over="true"] { border-color: var(--navy); background: #F5F6FA; }
.pl-drop-ico { width: 52px; height: 52px; border-radius: 12px; background: #EFF1F5; display: grid; place-items: center; margin: 0 auto 14px; color: var(--ink-2); }

/* table */
.pl-table { width: 100%; border-collapse: collapse; }
.pl-table th { text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); padding: 0 12px 8px; border-bottom: 1px solid var(--line-2); }
.pl-table td { padding: 10px 12px; border-bottom: 1px solid var(--line-2); vertical-align: middle; }
.pl-table tr:last-child td { border-bottom: 0; }
.pl-table tr.pl-row-click:hover { background: #FBFBFC; cursor: pointer; }
.pl-scroll { overflow-x: auto; }

/* chips */
.pl-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 20px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.pl-dot-status { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }

/* context search */
.pl-search-wrap { position: relative; }
.pl-search-wrap input { padding-left: 34px; }
.pl-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--ink-3); pointer-events: none; }
.pl-search-results { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
.pl-search-hit { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
.pl-search-hit-ref { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 4px; }
.pl-search-hit-text { font-size: 13px; color: var(--ink-2); line-height: 1.65; }
.pl-search-hit-text mark { background: #FEF3C7; color: var(--ink); border-radius: 2px; padding: 0 2px; font-style: normal; }
.pl-file-preview { display: flex; align-items: center; gap: 10px; padding: 10px 13px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); margin-bottom: 12px; }
.pl-file-preview-name { font-weight: 600; font-size: 13px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pl-file-preview-meta { font-size: 11.5px; color: var(--ink-3); }
.pl-upload-status { display: flex; align-items: center; gap: 8px; padding: 10px 13px; border-radius: 8px; font-size: 13px; font-weight: 600; }

/* review: findings */
.pl-findbar { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
.pl-searchbox { flex: 1; display: flex; align-items: center; gap: 7px; border: 1px solid var(--line); border-radius: 7px; padding: 6px 9px; color: var(--ink-3); }
.pl-searchbox input { border: 0; outline: 0; width: 100%; background: none; }
.pl-group { border-bottom: 1px solid var(--line-2); }
.pl-group-h { width: 100%; display: flex; align-items: center; gap: 8px; padding: 11px 14px; border: 0; background: none; text-align: left; font-weight: 700; font-size: 12.5px; }
.pl-group-count { margin-left: auto; font-size: 11px; font-weight: 700; color: var(--ink-2); }
.pl-finditem { width: 100%; text-align: left; border: 0; background: none; padding: 10px 14px 12px 34px; border-left: 2px solid transparent; display: block; }
.pl-finditem:hover { background: #FBFBFC; }
.pl-finditem[aria-current="true"] { background: var(--navy); border-left-color: #F2B84B; }
.pl-finditem[aria-current="true"] .pl-fi-title,
.pl-finditem[aria-current="true"] .pl-fi-page,
.pl-finditem[aria-current="true"] .pl-fi-reason { color: #fff; }
.pl-finditem[aria-current="true"] .pl-fi-reason { color: #C7CEDD; }
.pl-fi-title { font-weight: 700; font-size: 13px; }
.pl-fi-page { color: var(--ink-3); font-size: 11.5px; }
.pl-fi-reason { color: var(--ink-2); font-size: 12px; margin-top: 3px; }

/* review: detail */
.pl-detailhead { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--line-2); flex-wrap: wrap; }
.pl-navbtn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); display: grid; place-items: center; color: var(--ink-2); }
.pl-navbtn:disabled { opacity: .35; }
.pl-detailtitle { font-weight: 700; font-size: 15px; }
.pl-reasonline { padding: 10px 16px; color: var(--ink-2); font-size: 13px; border-bottom: 1px solid var(--line-2); }
.pl-tabs { display: flex; gap: 18px; padding: 0 16px; border-bottom: 1px solid var(--line-2); }
.pl-tabbtn { padding: 10px 0; border: 0; background: none; color: var(--ink-3); font-weight: 600; font-size: 12.5px; border-bottom: 2px solid transparent; }
.pl-tabbtn[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--navy); }
.pl-diffbar { display: flex; align-items: center; gap: 14px; padding: 12px 16px; flex-wrap: wrap; }
.pl-segbtn { display: flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
.pl-segbtn button { padding: 5px 11px; border: 0; background: var(--surface); font-size: 12px; font-weight: 600; color: var(--ink-2); }
.pl-segbtn button[aria-pressed="true"] { background: var(--navy); color: #fff; }
.pl-legend { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--ink-2); margin-left: auto; }
.pl-swatch { width: 11px; height: 11px; border-radius: 3px; display: inline-block; margin-right: 4px; vertical-align: -1px; }
.pl-diffcols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 0 16px 16px; }
.pl-diffcol-h { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 8px; }
.pl-diffbody { font-size: 13px; line-height: 1.75; color: var(--ink); }
.pl-diffbody p { margin: 0 0 10px; }
.pl-del { background: #FCE7E6; box-shadow: inset 0 -1px 0 #F3C7C3; padding: 1px 3px; border-radius: 3px; }
.pl-add { background: #E1F5E8; box-shadow: inset 0 -1px 0 #B9E5C6; padding: 1px 3px; border-radius: 3px; }
.pl-changesummary { border-top: 1px solid var(--line-2); }
.pl-changesummary-h { width: 100%; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border: 0; background: none; font-weight: 700; font-size: 12.5px; }

/* review: right rail */
.pl-doctitle { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
.pl-status-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; background: var(--warn-bg); color: var(--warn); }
.pl-metarow { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; font-size: 12.5px; border-bottom: 1px solid var(--line-2); }
.pl-metarow:last-child { border-bottom: 0; }
.pl-overviewbar { display: flex; height: 7px; border-radius: 5px; overflow: hidden; margin: 10px 0 12px; }
.pl-overviewlist { display: flex; flex-direction: column; gap: 7px; }
.pl-overviewitem { display: flex; align-items: center; gap: 7px; font-size: 12.5px; }
.pl-progresstrack { height: 6px; border-radius: 5px; background: var(--line-2); position: relative; overflow: hidden; margin: 8px 0; }
.pl-progressfill { position: absolute; inset: 0 auto 0 0; background: var(--navy); border-radius: 5px; }
.pl-footnote { display: flex; gap: 8px; align-items: flex-start; padding: 11px 12px; border-radius: 8px; background: #F5F6FA; font-size: 12px; color: var(--ink-2); }

/* final */
.pl-donut { width: 132px; height: 132px; margin: 6px auto; position: relative; }
.pl-donut svg { transform: rotate(-90deg); }
.pl-donutlabel { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.pl-donutlabel strong { font-size: 21px; font-weight: 800; }
.pl-donutlabel span { font-size: 11px; color: var(--ink-2); }
.pl-summarystat { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--line-2); font-size: 13px; }
.pl-summarystat:last-child { border-bottom: 0; }
.pl-preview { background: #FCFCFD; border-radius: 9px; padding: 16px 20px; font-size: 12.5px; line-height: 1.6; color: var(--ink); max-height: 360px; overflow-y: auto; }
.pl-preview h3 { font-size: 15px; text-align: center; letter-spacing: .02em; margin: 0 0 16px; }
.pl-preview h4 { font-size: 12px; font-weight: 700; margin: 18px 0 6px; }
.pl-tag-changed { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 700; color: var(--info); background: var(--info-bg); padding: 1px 7px; border-radius: 5px; margin-left: 6px; white-space: nowrap; }
.pl-final-confirm { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px; border-top: 1px solid var(--line-2); flex-wrap: wrap; }

/* policy center */
.pl-policytabs { display: flex; gap: 4px; padding: 4px; background: var(--line-2); border-radius: 9px; width: fit-content; margin-bottom: 16px; }
.pl-policytab { padding: 6px 13px; border-radius: 7px; border: 0; background: none; font-weight: 600; font-size: 12.5px; color: var(--ink-2); }
.pl-policytab[aria-selected="true"] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(16,24,40,.08); }
.pl-changelog-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line-2); }
.pl-changelog-item:last-child { border-bottom: 0; }
.pl-changelog-ico { width: 26px; height: 26px; border-radius: 7px; background: var(--line-2); display: grid; place-items: center; flex-shrink: 0; color: var(--ink-2); }
.pl-statgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
.pl-statbox { text-align: center; padding: 10px 6px; border-radius: 8px; background: var(--bg); }
.pl-statbox strong { display: block; font-size: 17px; font-weight: 800; }
.pl-statbox span { font-size: 10.5px; color: var(--ink-2); }

/* misc */
.pl-empty { text-align: center; padding: 44px 20px; }
.pl-empty-ico { width: 44px; height: 44px; border-radius: 10px; background: var(--line-2); display: grid; place-items: center; margin: 0 auto 12px; color: var(--ink-3); }
.pl-spin { animation: pl-rot 1s linear infinite; }
@keyframes pl-rot { to { transform: rotate(360deg); } }
`;

