/* Budget — logica condivisa (calcoli, export/import Excel, confronto).
   Funziona sia nel browser (window.Core) sia in Node (require) per i test. */
(function (root) {
  'use strict';

  const MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const MESI_BREVI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const MAX_CAT = 30, MAX_FISSE = 20;

  const DEFAULT_CATEGORIE = [
    ['Stipendio','Entrata'],['Altre entrate','Entrata'],['Casa','Spesa'],['Utenze','Spesa'],
    ['Spesa alimentare','Spesa'],['Mangiare fuori','Spesa'],['Benzina e trasporti','Spesa'],
    ['Abbonamenti','Spesa'],['Salute e benessere','Spesa'],['Shopping','Spesa'],['Tempo libero','Spesa'],
    ['Viaggi e vacanze','Spesa'],['Regali e varie','Spesa'],['Investimenti','Spesa']
  ];

  function emptyState() {
    return {
      version: 1,
      anno: new Date().getFullYear(),
      categorie: DEFAULT_CATEGORIE.map(([nome, tipo]) => ({ nome, tipo, budget: null })),
      fisse: [],
      override: {},
      movimenti: [],
      lastExport: null
    };
  }

  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  /* ---------------- calcoli ---------------- */
  function fisseFor(state, cat) {
    return round2(state.fisse.filter(f => f.categoria === cat).reduce((s, f) => s + (Number(f.importo) || 0), 0));
  }
  function defaultBudget(state, cat) {
    const c = state.categorie.find(x => x.nome === cat);
    return round2((c && Number(c.budget)) || 0) + fisseFor(state, cat);
  }
  function budgetFor(state, cat, year, month) {
    const o = state.override[cat];
    if (year === state.anno && o && o[month] !== undefined && o[month] !== null && o[month] !== '') return Number(o[month]);
    return round2(defaultBudget(state, cat));
  }
  function tipoOf(state, cat) {
    const c = state.categorie.find(x => x.nome === cat);
    return c ? c.tipo : null;
  }
  function stato(tipo, budget, eff) {
    if (budget === 0 && eff === 0) return '—';
    const sc = tipo === 'Entrata' ? eff - budget : budget - eff;
    if (sc < 0) return tipo === 'Entrata' ? 'Sotto le attese' : 'Sforato';
    if (tipo === 'Spesa' && budget > 0 && eff / budget >= 0.9) return 'Attenzione';
    return 'OK';
  }
  function monthStats(state, year, month) {
    const pref = `${year}-${String(month).padStart(2, '0')}`;
    const eff = {};
    for (const m of state.movimenti) {
      if (m.data && m.data.startsWith(pref)) eff[m.categoria] = round2((eff[m.categoria] || 0) + Number(m.importo));
    }
    const righe = state.categorie.map(c => {
      const b = budgetFor(state, c.nome, year, month), e = eff[c.nome] || 0;
      return { nome: c.nome, tipo: c.tipo, budget: b, effettivo: e,
        scostamento: round2(c.tipo === 'Entrata' ? e - b : b - e), pct: b ? e / b : null, stato: stato(c.tipo, b, e) };
    });
    const sum = (tipo, k) => round2(righe.filter(r => r.tipo === tipo).reduce((s, r) => s + r[k], 0));
    const orfani = Object.keys(eff).filter(k => !state.categorie.some(c => c.nome === k));
    return {
      righe, orfani,
      entratePrev: sum('Entrata', 'budget'), entrateEff: sum('Entrata', 'effettivo'),
      uscitePrev: sum('Spesa', 'budget'), usciteEff: sum('Spesa', 'effettivo')
    };
  }

  /* ---------------- date ---------------- */
  function isoFromDate(d) { // Date letta da ExcelJS (UTC)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  function dateFromIso(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function parseDateAny(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return isoFromDate(v);
    if (typeof v === 'number' && v > 20000 && v < 80000) return isoFromDate(new Date(Math.round((v - 25569) * 86400000)));
    if (typeof v === 'string') {
      let m = v.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
      if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
        if (d.getUTCMonth() === +m[2] - 1) return isoFromDate(d); }
      m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    }
    return null;
  }
  function parseNum(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'string') {
      let s = v.replace(/[€\s]/g, '');
      if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
      const n = Number(s); return isFinite(n) && s !== '' ? n : null;
    }
    return null;
  }

  /* ---------------- lettura celle ExcelJS ---------------- */
  function cellRaw(cell) {
    let v = cell.value;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('result' in v) v = v.result;
      else if ('formula' in v || 'sharedFormula' in v) v = null;
      else if (v.richText) v = v.richText.map(t => t.text).join('');
      else if ('text' in v) v = v.text;
      else if (v.error) v = null;
    }
    return v === undefined ? null : v;
  }
  function cellText(cell) { const v = cellRaw(cell); return v === null ? '' : String(v).trim(); }
  function isFormula(cell) {
    const v = cell.value;
    return !!(v && typeof v === 'object' && !(v instanceof Date) && ('formula' in v || 'sharedFormula' in v));
  }

  /* ---------------- import ---------------- */
  function parseWorkbook(wb) {
    const warnings = [];
    const imp = wb.getWorksheet('Impostazioni');
    const mov = wb.getWorksheet('Movimenti');
    if (!imp || !mov) throw new Error('Il file deve contenere i fogli "Movimenti" e "Impostazioni".');

    const anno = parseNum(cellRaw(imp.getCell('C4'))) || new Date().getFullYear();
    const categorie = [], rowOfCat = {};
    for (let r = 9; r <= 38; r++) {
      const nome = cellText(imp.getCell(r, 2));
      if (!nome) continue;
      if (categorie.some(c => c.nome === nome)) { warnings.push(`Impostazioni riga ${r}: categoria "${nome}" duplicata, ignorata.`); continue; }
      let tipo = cellText(imp.getCell(r, 3));
      if (tipo !== 'Entrata' && tipo !== 'Spesa') { warnings.push(`Impostazioni riga ${r}: tipo di "${nome}" non valido, impostato a Spesa.`); tipo = 'Spesa'; }
      categorie.push({ nome, tipo, budget: parseNum(cellRaw(imp.getCell(r, 4))) });
      rowOfCat[nome] = r;
    }
    if (!categorie.length) throw new Error('Nessuna categoria trovata nel foglio Impostazioni (righe 9–38).');

    const fisse = [];
    for (let r = 43; r <= 62; r++) {
      const descrizione = cellText(imp.getCell(r, 2)), categoria = cellText(imp.getCell(r, 3));
      const importo = parseNum(cellRaw(imp.getCell(r, 4))), note = cellText(imp.getCell(r, 5));
      if (!descrizione && !categoria && importo === null) continue;
      if (categoria && !categorie.some(c => c.nome === categoria)) warnings.push(`Spesa fissa "${descrizione}": categoria "${categoria}" inesistente.`);
      fisse.push({ descrizione, categoria, importo: importo || 0, note });
    }

    const override = {};
    const bud = wb.getWorksheet('Budget');
    if (bud) {
      for (const c of categorie) {
        const r = rowOfCat[c.nome] - 4; // Impostazioni riga 9 ↔ Budget riga 5
        for (let m = 1; m <= 12; m++) {
          const cell = bud.getCell(r, 2 + m);
          if (isFormula(cell)) continue;
          const n = parseNum(cellRaw(cell));
          (override[c.nome] = override[c.nome] || {})[m] = n === null ? 0 : n;
        }
      }
    }

    // Movimenti: colonne trovate per intestazione
    let hdr = null, col = {};
    for (let r = 1; r <= 12 && !hdr; r++) {
      const row = mov.getRow(r), found = {};
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const t = cellText(cell).toLowerCase();
        if (t === 'data') found.data = c;
        else if (t === 'categoria') found.categoria = c;
        else if (t === 'descrizione') found.descrizione = c;
        else if (t.startsWith('importo')) found.importo = c;
        else if (t === 'id') found.id = c;
      });
      if (found.data && found.importo && found.categoria) { hdr = r; col = found; }
    }
    if (!hdr) throw new Error('Nel foglio Movimenti non trovo le intestazioni Data, Categoria e Importo.');

    const movimenti = [];
    const last = mov.actualRowCount ? mov.rowCount : hdr;
    for (let r = hdr + 1; r <= last; r++) {
      const g = (k) => col[k] ? mov.getCell(r, col[k]) : null;
      const dRaw = cellRaw(g('data')), cat = cellText(g('categoria'));
      const desc = col.descrizione ? cellText(g('descrizione')) : '';
      const iRaw = cellRaw(g('importo')), id = col.id ? cellText(g('id')) : '';
      if ((dRaw === null || dRaw === '') && !cat && !desc && (iRaw === null || iRaw === '')) continue;
      const data = parseDateAny(dRaw), importo = parseNum(iRaw);
      if (!data) { warnings.push(`Movimenti riga ${r}: data mancante o non valida, riga ignorata.`); continue; }
      if (importo === null) { warnings.push(`Movimenti riga ${r}: importo mancante o non numerico, riga ignorata.`); continue; }
      if (importo < 0) warnings.push(`Movimenti riga ${r}: importo negativo (${importo}). Il file usa importi senza segno.`);
      if (!cat) warnings.push(`Movimenti riga ${r}: categoria vuota.`);
      else if (!categorie.some(c => c.nome === cat)) warnings.push(`Movimenti riga ${r}: categoria "${cat}" non presente nelle Impostazioni.`);
      movimenti.push({ id: id || null, data, categoria: cat, descrizione: desc, importo: round2(importo) });
    }
    return { anno, categorie, fisse, override, movimenti, warnings };
  }

  const keyOf = (m) => [m.data, m.categoria, (m.descrizione || '').trim().toLowerCase(), round2(Number(m.importo))].join('|');
  const sameMov = (a, b) => a.data === b.data && a.categoria === b.categoria && (a.descrizione || '') === (b.descrizione || '') && round2(a.importo) === round2(b.importo);

  function diffImport(state, parsed) {
    const byId = new Map(state.movimenti.map(m => [m.id, m]));
    const fileIds = new Set();
    const nuovi = [], modificati = [], uguali = [];
    const appKeyCount = {};
    for (const m of state.movimenti) appKeyCount[keyOf(m)] = (appKeyCount[keyOf(m)] || 0) + 1;
    // gli ID già usati vanno tolti dal conteggio "senza ID"
    for (const fm of parsed.movimenti) if (fm.id && byId.has(fm.id)) {
      const k = keyOf(byId.get(fm.id)); appKeyCount[k]--;
    }
    for (const fm of parsed.movimenti) {
      if (fm.id && byId.has(fm.id)) {
        fileIds.add(fm.id);
        const am = byId.get(fm.id);
        if (sameMov(am, fm)) uguali.push(fm); else modificati.push({ prima: am, dopo: fm });
      } else {
        const k = keyOf(fm);
        if (appKeyCount[k] > 0) { appKeyCount[k]--; uguali.push(fm); // già presente (stessi dati, senza ID)
          const match = state.movimenti.find(m => keyOf(m) === k && !fileIds.has(m.id)); if (match) fileIds.add(match.id); }
        else nuovi.push(fm);
      }
    }
    const soloApp = state.movimenti.filter(m => !fileIds.has(m.id));
    const pick = (s) => JSON.stringify({ anno: s.anno, categorie: s.categorie, fisse: s.fisse, override: s.override });
    return { nuovi, modificati, uguali, soloApp, impostazioniCambiate: pick(state) !== pick(parsed) };
  }

  function applyImport(state, parsed, diff, opt) {
    const s = JSON.parse(JSON.stringify(state));
    if (opt.impostazioni) { s.anno = parsed.anno; s.categorie = parsed.categorie; s.fisse = parsed.fisse; s.override = parsed.override; }
    if (opt.modificati) for (const { prima, dopo } of diff.modificati) {
      const t = s.movimenti.find(m => m.id === prima.id); Object.assign(t, { data: dopo.data, categoria: dopo.categoria, descrizione: dopo.descrizione, importo: dopo.importo });
    }
    if (opt.eliminaSoloApp) { const del = new Set(diff.soloApp.map(m => m.id)); s.movimenti = s.movimenti.filter(m => !del.has(m.id)); }
    if (opt.nuovi) for (const fm of diff.nuovi) s.movimenti.push({ id: uid(), data: fm.data, categoria: fm.categoria, descrizione: fm.descrizione, importo: fm.importo });
    return s;
  }

  /* ---------------- export ---------------- */
  const C = { brown: 'FF7B3416', orange: 'FFD97A28', cream: 'FFFFF9EF', light: 'FFEFEAE4', sand: 'FFF7E0C8',
    white: 'FFFFFFFF', dark: 'FF3B3733', amber: 'FFB45309', muted: 'FF8A8078', grey: 'FF6B6259', line: 'FFE3D5C3' };
  const EUR = '#,##0.00" €";[Red]\\-#,##0.00" €"';
  const thin = { style: 'thin', color: { argb: C.line } };
  const BOX = { top: thin, left: thin, bottom: thin, right: thin };
  const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
  const font = (o = {}) => Object.assign({ name: 'Arial', size: 10, color: { argb: C.dark } }, o);

  function sty(cell, kind, extra) {
    const k = {
      title: { font: font({ size: 14, bold: true, color: { argb: C.white } }), fill: fill(C.brown), alignment: { vertical: 'middle', horizontal: 'center' } },
      head: { font: font({ bold: true, color: { argb: C.white } }), fill: fill(C.brown), alignment: { horizontal: 'center', vertical: 'middle', wrapText: true } },
      input: { font: font({ color: { argb: C.amber } }), fill: fill(C.cream), border: BOX },
      calc: { font: font(), fill: fill(C.light), border: BOX },
      link: { font: font({ color: { argb: C.grey } }) },
      plain: { font: font() },
      total: { font: font({ bold: true }), fill: fill(C.sand), border: BOX },
      note: { font: font({ italic: true, size: 9, color: { argb: C.muted } }) },
      section: { font: font({ bold: true, size: 11, color: { argb: C.white } }), fill: fill(C.orange) }
    }[kind];
    Object.assign(cell, k, extra || {});
    return cell;
  }
  const F = (formula, result) => (result === undefined ? { formula } : { formula, result });

  function buildWorkbook(ExcelJS, state) {
    if (state.categorie.length > MAX_CAT) throw new Error(`Il file Excel gestisce al massimo ${MAX_CAT} categorie.`);
    if (state.fisse.length > MAX_FISSE) throw new Error(`Il file Excel gestisce al massimo ${MAX_FISSE} spese fisse.`);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Budget app'; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    const nCat = state.categorie.length;
    const lastCatRow = 8 + nCat;

    /* --- Movimenti --- */
    const mv = wb.addWorksheet('Movimenti', { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
    [[2, 12], [3, 22], [4, 40], [5, 14], [6, 8], [7, 8], [8, 12], [9, 14]].forEach(([c, w]) => mv.getColumn(c).width = w);
    mv.getColumn(9).hidden = true;
    mv.mergeCells('B2:H2');
    sty(mv.getCell('B2'), 'title'); mv.getCell('B2').value = 'MOVIMENTI — Entrate/spese senza segno'; mv.getRow(2).height = 22;
    ['Data', 'Categoria', 'Descrizione', 'Importo (€)', 'Mese', 'Anno', 'Tipo', 'ID'].forEach((h, i) => sty(mv.getCell(4, 2 + i), 'head').value = h);
    mv.getRow(4).height = 20;
    const movs = state.movimenti.map((m, i) => [m, i]).sort((a, b) => a[0].data < b[0].data ? -1 : a[0].data > b[0].data ? 1 : a[1] - b[1]).map(x => x[0]);
    const lastMovRow = Math.max(504, 5 + movs.length + 200);
    for (let r = 5; r <= lastMovRow; r++) {
      const m = movs[r - 5];
      const tipo = m ? tipoOf(state, m.categoria) : null;
      sty(mv.getCell(r, 2), 'input', { numFmt: 'dd/mm/yyyy' }).value = m ? dateFromIso(m.data) : null;
      sty(mv.getCell(r, 3), 'input').value = m ? m.categoria : null;
      sty(mv.getCell(r, 4), 'input').value = m ? (m.descrizione || null) : null;
      sty(mv.getCell(r, 5), 'input', { numFmt: EUR }).value = m ? m.importo : null;
      sty(mv.getCell(r, 6), 'calc', { alignment: { horizontal: 'center' } }).value = F(`IF($B${r}="","",MONTH($B${r}))`, m ? +m.data.slice(5, 7) : '');
      sty(mv.getCell(r, 7), 'calc', { alignment: { horizontal: 'center' } }).value = F(`IF($B${r}="","",YEAR($B${r}))`, m ? +m.data.slice(0, 4) : '');
      sty(mv.getCell(r, 8), 'calc', { alignment: { horizontal: 'center' } }).value =
        F(`IF($C${r}="","",IFERROR(INDEX(Impostazioni!$C$9:$C$38,MATCH($C${r},Impostazioni!$B$9:$B$38,0)),"?? categoria non trovata"))`, m ? (tipo || '?? categoria non trovata') : '');
      mv.getCell(r, 9).value = m ? m.id : null;
      mv.getCell(r, 9).font = font({ color: { argb: C.muted }, size: 8 });
      mv.getCell(r, 3).dataValidation = { type: 'list', allowBlank: true, formulae: ['Categorie'], showErrorMessage: true,
        errorTitle: 'Categoria non valida', error: "Scegli una categoria dall'elenco delle Impostazioni." };
    }
    mv.autoFilter = `B4:I${lastMovRow}`; // include la colonna ID: ordinando, gli ID seguono le righe
    mv.addConditionalFormatting({ ref: `H5:H${lastMovRow}`, rules: [{ type: 'expression', priority: 1,
      formulae: ['ISNUMBER(SEARCH("non trovata",$H5))'],
      style: { font: { bold: true, color: { argb: 'FF9C2B0E' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF9D5C7' } } } }] });

    /* --- Impostazioni --- */
    const im = wb.addWorksheet('Impostazioni', { views: [{ showGridLines: false }] });
    [[1, 3], [2, 26], [3, 22], [4, 18], [5, 18], [6, 18], [9, 14]].forEach(([c, w]) => im.getColumn(c).width = w);
    im.mergeCells('B2:F2'); sty(im.getCell('B2'), 'title').value = 'IMPOSTAZIONI — categorie, budget e spese fisse'; im.getRow(2).height = 22;
    sty(im.getCell('B4'), 'plain').value = 'Anno di riferimento';
    sty(im.getCell('C4'), 'input').value = state.anno;
    sty(im.getCell('B6'), 'head', { alignment: { horizontal: 'left' } }).value = '1) CATEGORIE E BUDGET MENSILE';
    ['Categoria', 'Tipo', 'Budget variabile mensile (€)', 'Spese fisse (auto) (€)', 'BUDGET TOTALE MENSILE (€)'].forEach((h, i) => sty(im.getCell(8, 2 + i), 'head').value = h);
    im.getRow(8).height = 30;
    sty(im.getCell('I8'), 'section', { alignment: { horizontal: 'center' } }).value = 'Elenco mesi';
    for (let i = 0; i < 30; i++) {
      const r = 9 + i, c = state.categorie[i];
      sty(im.getCell(r, 2), 'input').value = c ? c.nome : null;
      sty(im.getCell(r, 3), 'input').value = c ? c.tipo : null;
      sty(im.getCell(r, 4), 'input', { numFmt: EUR }).value = c && c.budget !== null && c.budget !== undefined && c.budget !== '' ? Number(c.budget) : null;
      sty(im.getCell(r, 5), 'plain', { numFmt: EUR }).value = F(`IF($B${r}="","",SUMIF($C$43:$C$62,$B${r},$D$43:$D$62))`, c ? fisseFor(state, c.nome) : '');
      sty(im.getCell(r, 6), 'total', { numFmt: EUR }).value = F(`IF($B${r}="","",SUM($D${r}:$E${r}))`, c ? defaultBudget(state, c.nome) : '');
      im.getCell(r, 3).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Entrata,Spesa"'] };
    }
    MESI.forEach((m, i) => sty(im.getCell(9 + i, 9), 'plain').value = m);
    sty(im.getCell('I22'), 'note').value = 'Non modificare';
    sty(im.getCell('B40'), 'head', { alignment: { horizontal: 'left' } }).value = '2) SPESE FISSE MENSILI';
    ['Descrizione', 'Categoria', 'Importo mensile (€)', 'Note'].forEach((h, i) => sty(im.getCell(42, 2 + i), 'head').value = h);
    for (let i = 0; i < 20; i++) {
      const r = 43 + i, f = state.fisse[i];
      sty(im.getCell(r, 2), 'input').value = f ? f.descrizione || null : null;
      sty(im.getCell(r, 3), 'input').value = f ? f.categoria || null : null;
      sty(im.getCell(r, 4), 'input', { numFmt: EUR }).value = f ? Number(f.importo) || 0 : null;
      sty(im.getCell(r, 5), 'input').value = f ? f.note || null : null;
      im.getCell(r, 3).dataValidation = { type: 'list', allowBlank: true, formulae: ['Categorie'] };
    }
    sty(im.getCell('C64'), 'plain', { font: font({ bold: true }) }).value = 'TOTALE SPESE FISSE / MESE';
    sty(im.getCell('D64'), 'total', { numFmt: EUR }).value = F('SUM(D43:D62)', round2(state.fisse.reduce((s, f) => s + (Number(f.importo) || 0), 0)));

    /* --- Budget --- */
    const bu = wb.addWorksheet('Budget', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4, showGridLines: false }] });
    bu.getColumn(1).width = 24; bu.getColumn(2).width = 10;
    for (let c = 3; c <= 14; c++) bu.getColumn(c).width = 11;
    bu.getColumn(15).width = 14;
    bu.mergeCells('A1:O1'); sty(bu.getCell('A1'), 'title').value = 'BUDGET ANNUALE'; bu.getRow(1).height = 22;
    sty(bu.getCell('A2'), 'plain').value = 'Anno';
    sty(bu.getCell('B2'), 'link').value = F('Impostazioni!$C$4', state.anno);
    sty(bu.getCell('C2'), 'note').value = 'Ogni cella riprende il budget mensile delle Impostazioni. Per cambiare un solo mese (es. più regali a dicembre) scrivi il numero sopra la formula.';
    ['Categoria', 'Tipo', ...MESI_BREVI, 'TOTALE ANNO'].forEach((h, i) => sty(bu.getCell(4, 1 + i), 'head').value = h);
    for (let i = 0; i < 30; i++) {
      const r = 5 + i, ir = 9 + i, c = state.categorie[i];
      sty(bu.getCell(r, 1), 'link').value = F(`IF(Impostazioni!$B${ir}="","",Impostazioni!$B${ir})`, c ? c.nome : '');
      sty(bu.getCell(r, 2), 'link').value = F(`IF(Impostazioni!$B${ir}="","",Impostazioni!$C${ir})`, c ? c.tipo : '');
      let tot = 0;
      for (let m = 1; m <= 12; m++) {
        const cell = bu.getCell(r, 2 + m); sty(cell, 'plain', { numFmt: EUR });
        const o = c && state.override[c.nome] ? state.override[c.nome][m] : undefined;
        if (c && o !== undefined && o !== null && o !== '') {
          cell.value = Number(o); cell.font = font({ color: { argb: C.amber } }); cell.fill = fill(C.cream); tot += Number(o);
        } else { const v = c ? defaultBudget(state, c.nome) : ''; cell.value = F(`IF($A${r}="","",Impostazioni!$F${ir})`, v); if (c) tot += v; }
      }
      sty(bu.getCell(r, 15), 'total', { numFmt: EUR }).value = F(`IF($A${r}="","",SUM(C${r}:N${r}))`, c ? round2(tot) : '');
    }
    const totRow = (r, label, tipo) => {
      sty(bu.getCell(r, 1), 'total').value = label; sty(bu.getCell(r, 2), 'total');
      for (let c = 3; c <= 15; c++) {
        const L = String.fromCharCode(64 + c);
        sty(bu.getCell(r, c), 'total', { numFmt: EUR }).value = c < 15 ? F(`SUMIF($B$5:$B$34,"${tipo}",${L}$5:${L}$34)`) : F(`SUM(C${r}:N${r})`);
      }
    };
    totRow(36, 'TOTALE ENTRATE', 'Entrata'); totRow(37, 'TOTALE USCITE', 'Spesa');
    sty(bu.getCell(38, 1), 'head', { alignment: { horizontal: 'left' } }).value = 'RISPARMIO PREVISTO'; sty(bu.getCell(38, 2), 'head');
    for (let c = 3; c <= 15; c++) { const L = String.fromCharCode(64 + c);
      sty(bu.getCell(38, c), 'head', { numFmt: EUR }).value = c < 15 ? F(`${L}36-${L}37`) : F('SUM(C38:N38)'); }

    /* --- Riepilogo --- */
    const ri = wb.addWorksheet('Riepilogo', { views: [{ showGridLines: false }] });
    [[1, 3], [2, 24], [3, 18], [4, 16], [5, 16], [6, 16], [7, 16], [8, 18]].forEach(([c, w]) => ri.getColumn(c).width = w);
    sty(ri.getCell('B2'), 'title', { alignment: { horizontal: 'left' } }).value = 'RIEPILOGO MENSILE — budget vs effettivo';
    ri.mergeCells('B2:H2'); ri.getRow(2).height = 22;
    sty(ri.getCell('B4'), 'plain').value = 'Mese';
    sty(ri.getCell('C4'), 'input').value = MESI[new Date().getMonth()];
    ri.getCell('C4').dataValidation = { type: 'list', allowBlank: false, formulae: ['Mesi'] };
    sty(ri.getCell('D4'), 'note').value = '← scegli il mese dal menù a tendina';
    sty(ri.getCell('F4'), 'note').value = 'n. mese (auto)';
    sty(ri.getCell('G4'), 'calc').value = F('MATCH($C$4,Mesi,0)', new Date().getMonth() + 1);
    sty(ri.getCell('B5'), 'plain').value = 'Anno';
    sty(ri.getCell('C5'), 'link').value = F('Impostazioni!$C$4', state.anno);
    ['Entrate previste', 'Entrate effettive', 'Uscite previste', 'Uscite effettive', 'Risparmio previsto', 'Risparmio effettivo', 'Tasso di risparmio'].forEach((h, i) => sty(ri.getCell(7, 2 + i), 'head').value = h);
    const kp = ['SUMIF($C$11:$C$40,"Entrata",$D$11:$D$40)', 'SUMIF($C$11:$C$40,"Entrata",$E$11:$E$40)',
      'SUMIF($C$11:$C$40,"Spesa",$D$11:$D$40)', 'SUMIF($C$11:$C$40,"Spesa",$E$11:$E$40)', 'B8-D8', 'C8-E8', 'IF(C8=0,"",G8/C8)'];
    kp.forEach((f, i) => sty(ri.getCell(8, 2 + i), 'total', { numFmt: i === 6 ? '0.0%' : EUR }).value = F(f));
    ['Categoria', 'Tipo', 'Budget (€)', 'Effettivo (€)', 'Scostamento (€)', '% utilizzo', 'Stato'].forEach((h, i) => sty(ri.getCell(10, 2 + i), 'head').value = h);
    for (let i = 0; i < 30; i++) {
      const r = 11 + i, br = 5 + i;
      sty(ri.getCell(r, 2), 'link').value = F(`IF(Budget!$A${br}="","",Budget!$A${br})`);
      sty(ri.getCell(r, 3), 'link').value = F(`IF(Budget!$A${br}="","",Budget!$B${br})`);
      sty(ri.getCell(r, 4), 'plain', { numFmt: EUR }).value = F(`IF($B${r}="","",INDEX(Budget!$C$5:$N$34,${i + 1},$G$4))`);
      sty(ri.getCell(r, 5), 'plain', { numFmt: EUR }).value = F(`IF($B${r}="","",SUMIFS(Movimenti!$E$5:$E$5000,Movimenti!$C$5:$C$5000,$B${r},Movimenti!$F$5:$F$5000,$G$4,Movimenti!$G$5:$G$5000,$C$5))`);
      sty(ri.getCell(r, 6), 'plain', { numFmt: EUR }).value = F(`IF($B${r}="","",IF($C${r}="Entrata",$E${r}-$D${r},$D${r}-$E${r}))`);
      sty(ri.getCell(r, 7), 'plain', { numFmt: '0%' }).value = F(`IF(OR($B${r}="",$D${r}=0),"",$E${r}/$D${r})`);
      sty(ri.getCell(r, 8), 'plain', { alignment: { horizontal: 'center' } }).value =
        F(`IF($B${r}="","",IF(AND($D${r}=0,$E${r}=0),"—",IF($F${r}<0,IF($C${r}="Entrata","Sotto le attese","Sforato"),IF(AND($C${r}="Spesa",$D${r}>0,$E${r}/$D${r}>=0.9),"Attenzione","OK"))))`);
    }
    sty(ri.getCell('B41'), 'total').value = 'TOTALE USCITE'; sty(ri.getCell('C41'), 'total');
    sty(ri.getCell('D41'), 'total', { numFmt: EUR }).value = F('SUMIF($C$11:$C$40,"Spesa",$D$11:$D$40)');
    sty(ri.getCell('E41'), 'total', { numFmt: EUR }).value = F('SUMIF($C$11:$C$40,"Spesa",$E$11:$E$40)');
    sty(ri.getCell('F41'), 'total', { numFmt: EUR }).value = F('$D41-$E41');
    sty(ri.getCell('G41'), 'total', { numFmt: '0%' }).value = F('IF($D41=0,"",$E41/$D41)');
    const st = (txt, fg, bg) => ({ type: 'containsText', operator: 'containsText', text: txt,
      style: { font: { bold: true, color: { argb: fg } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: bg } } } });
    ri.addConditionalFormatting({ ref: 'H11:H40', rules: [
      Object.assign(st('Sforato', 'FF9C2B0E', 'FFF9D5C7'), { priority: 1 }), Object.assign(st('Sotto le attese', 'FF9C2B0E', 'FFF9D5C7'), { priority: 2 }),
      Object.assign(st('Attenzione', 'FF92400E', 'FFFBE3B0'), { priority: 3 }), Object.assign(st('OK', 'FF4A6B21', 'FFDDE8CD'), { priority: 4 })] });

    /* --- Annuale --- */
    const an = wb.addWorksheet('Annuale', { views: [{ showGridLines: false }] });
    [[1, 3], [2, 14], [3, 5], [4, 16], [5, 16], [6, 16], [7, 16], [8, 16], [9, 16], [10, 16]].forEach(([c, w]) => an.getColumn(c).width = w);
    an.mergeCells('B2:J2'); sty(an.getCell('B2'), 'title').value = 'ANDAMENTO ANNUALE — previsto vs effettivo'; an.getRow(2).height = 22;
    sty(an.getCell('B3'), 'plain').value = 'Anno'; sty(an.getCell('C3'), 'link').value = F('Impostazioni!$C$4', state.anno);
    ['Mese', 'n.', 'Entrate previste', 'Entrate effettive', 'Uscite previste', 'Uscite effettive', 'Risparmio previsto', 'Risparmio effettivo', 'Scostamento uscite'].forEach((h, i) => sty(an.getCell(5, 2 + i), 'head').value = h);
    for (let m = 1; m <= 12; m++) {
      const r = 5 + m;
      sty(an.getCell(r, 2), 'plain').value = MESI[m - 1];
      sty(an.getCell(r, 3), 'plain').value = m;
      const mf = (t) => `SUMIFS(Movimenti!$E$5:$E$5000,Movimenti!$F$5:$F$5000,$C${r},Movimenti!$G$5:$G$5000,$C$3,Movimenti!$H$5:$H$5000,"${t}")`;
      const bf = (t) => `SUMIF(Budget!$B$5:$B$34,"${t}",INDEX(Budget!$C$5:$N$34,0,$C${r}))`;
      [bf('Entrata'), mf('Entrata'), bf('Spesa'), mf('Spesa'), `$D${r}-$F${r}`, `$E${r}-$G${r}`, `$F${r}-$G${r}`]
        .forEach((f, i) => sty(an.getCell(r, 4 + i), 'plain', { numFmt: EUR }).value = F(f));
    }
    sty(an.getCell('B18'), 'total').value = 'TOTALE ANNO'; sty(an.getCell('C18'), 'total');
    for (let c = 4; c <= 10; c++) { const L = String.fromCharCode(64 + c); sty(an.getCell(18, c), 'total', { numFmt: EUR }).value = F(`SUM(${L}6:${L}17)`); }
    an.addConditionalFormatting({ ref: 'I6:J17', rules: [{ type: 'cellIs', operator: 'lessThan', formulae: ['0'], priority: 1,
      style: { font: { color: { argb: 'FF9C2B0E' }, bold: true } } }] });

    wb.definedNames.add(`Impostazioni!$B$9:$B$${Math.max(9, lastCatRow)}`, 'Categorie');
    wb.definedNames.add('Impostazioni!$I$9:$I$20', 'Mesi');
    return wb;
  }

  const Core = { MESI, MESI_BREVI, MAX_CAT, MAX_FISSE, emptyState, uid, round2, budgetFor, defaultBudget, fisseFor, tipoOf,
    monthStats, parseWorkbook, diffImport, applyImport, buildWorkbook, parseDateAny, parseNum };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : this);
