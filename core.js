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
    if (year === state.anno && o && Object.prototype.hasOwnProperty.call(o, month)) {
      const v = o[month]; return v === null || v === '' ? 0 : Number(v);
    }
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
  function cellStr(cell) { const v = cellRaw(cell); return v === null ? '' : String(v); } // testo così com'è, spazi compresi
  const PLAIN_FILLS = ['FFFFF9EF', 'FFFFFFFF', 'FFFFFFF', '00000000'];
  function isHighlighted(cell) {
    const f = cell.fill; if (!f || f.type !== 'pattern' || f.pattern !== 'solid' || !f.fgColor) return false;
    const a = (f.fgColor.argb || '').toUpperCase(); return a !== '' && !PLAIN_FILLS.includes(a);
  }
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
      const descrizione = cellStr(imp.getCell(r, 2)), categoria = cellText(imp.getCell(r, 3));
      const importo = parseNum(cellRaw(imp.getCell(r, 4))), note = cellStr(imp.getCell(r, 5));
      if (!descrizione.trim() && !categoria && importo === null) continue;
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
          (override[c.nome] = override[c.nome] || {})[m] = n; // null = cella lasciata vuota
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
      const dCell = col.descrizione ? g('descrizione') : null;
      const desc = dCell ? cellStr(dCell) : '';
      const evid = dCell ? isHighlighted(dCell) : false;
      const iRaw = cellRaw(g('importo')), id = col.id ? cellText(g('id')) : '';
      if ((dRaw === null || dRaw === '') && !cat && !desc.trim() && (iRaw === null || iRaw === '')) continue;
      const data = parseDateAny(dRaw), importo = parseNum(iRaw);
      if (!data) { warnings.push(`Movimenti riga ${r}: data mancante o non valida, riga ignorata.`); continue; }
      if (importo === null) { warnings.push(`Movimenti riga ${r}: importo mancante o non numerico, riga ignorata.`); continue; }
      if (importo < 0) warnings.push(`Movimenti riga ${r}: importo negativo (${importo}). Il file usa importi senza segno.`);
      if (!cat) warnings.push(`Movimenti riga ${r}: categoria vuota.`);
      else if (!categorie.some(c => c.nome === cat)) warnings.push(`Movimenti riga ${r}: categoria "${cat}" non presente nelle Impostazioni.`);
      const mo = { id: id || null, data, categoria: cat, descrizione: desc, importo: round2(importo) };
      if (evid) mo.evid = true;
      movimenti.push(mo);
    }
    return { anno, categorie, fisse, override, movimenti, warnings };
  }

  const keyOf = (m) => [m.data, m.categoria, (m.descrizione || '').trim().toLowerCase(), round2(Number(m.importo))].join('|');
  const sameMov = (a, b) => a.data === b.data && a.categoria === b.categoria && (a.descrizione || '') === (b.descrizione || '') && round2(a.importo) === round2(b.importo) && !!a.evid === !!b.evid;

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
      if (dopo.evid) t.evid = true; else delete t.evid;
    }
    if (opt.eliminaSoloApp) { const del = new Set(diff.soloApp.map(m => m.id)); s.movimenti = s.movimenti.filter(m => !del.has(m.id)); }
    if (opt.nuovi) for (const fm of diff.nuovi) {
      const m = { id: uid(), data: fm.data, categoria: fm.categoria, descrizione: fm.descrizione, importo: fm.importo };
      if (fm.evid) m.evid = true; s.movimenti.push(m);
    }
    return s;
  }

  /* ---------------- export: riempie lo stampo ricavato dal tuo file ---------------- */
  const xesc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const serial = (iso) => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
  const N = (v) => ({ t: 'n', v }), Str = (v) => ({ t: 's', v }), B = { t: 'b' }, Fm = (f) => ({ t: 'f', f });
  const txt = (v) => (v === null || v === undefined || v === '' ? B : Str(v));
  const nOrB = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)) ? B : N(round2(Number(v))));
  function cellXml(ref, st, c) {
    if (c.st) st = c.st;
    if (c.t === 'n') return `<c r="${ref}"${st}><v>${c.v}</v></c>`;
    if (c.t === 's') return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xesc(c.v)}</t></is></c>`;
    if (c.t === 'f') return `<c r="${ref}"${st}><f>${xesc(c.f)}</f></c>`;
    return `<c r="${ref}"${st}/>`;
  }
  function setCells(xml, up) {
    const rows = new Set([...up.keys()].map((k) => k.replace(/^[A-Z]+/, '')));
    const done = new Set();
    const out = xml.replace(/<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g, (all, r, attrs, body) => {
      if (!rows.has(r)) return all;
      body = body.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (c, ref, a) => {
        if (!up.has(ref)) return c;
        done.add(ref); const st = (a.match(/ s="\d+"/) || [''])[0];
        return cellXml(ref, st, up.get(ref));
      });
      return `<row r="${r}"${attrs}>${body}</row>`;
    });
    const missing = [...up.keys()].filter((k) => !done.has(k));
    if (missing.length) throw new Error('Stampo Excel non valido: celle mancanti ' + missing.slice(0, 5).join(', '));
    return out;
  }
  const descCell = (m) => Object.assign({}, txt(m.descrizione), m.evid ? { st: ' s="62"' } : {});
  const S_MOV = 'xl/worksheets/sheet1.xml', S_IMP = 'xl/worksheets/sheet2.xml', S_BUD = 'xl/worksheets/sheet3.xml', S_RIE = 'xl/worksheets/sheet4.xml';
  const movH = (r) => `IF($C${r}="","",IFERROR(INDEX(Impostazioni!$C$9:$C$38,MATCH($C${r},Impostazioni!$B$9:$B$38,0)),"?? categoria non trovata"))`;

  async function buildFromTemplate(JSZip, template, state, now) {
    now = now || new Date();
    if (state.categorie.length > MAX_CAT) throw new Error(`Il file Excel gestisce al massimo ${MAX_CAT} categorie.`);
    if (state.fisse.length > MAX_FISSE) throw new Error(`Il file Excel gestisce al massimo ${MAX_FISSE} spese fisse.`);
    if (state.movimenti.length > 4995) throw new Error('Il file Excel gestisce al massimo 4.995 movimenti.');
    const zip = await JSZip.loadAsync(template);
    const rd = (p) => zip.file(p).async('string');
    const wb = await rd('xl/workbook.xml');
    if (!/<sheet name="Movimenti" sheetId="1" r:id="rId1"\/><sheet name="Impostazioni"/.test(wb)) throw new Error('Stampo Excel non riconosciuto.');

    /* Movimenti, nell'ordine in cui sono stati inseriti */
    const movs = state.movimenti, n = movs.length, last = Math.max(504, 4 + n);
    const up = new Map(), extra = [];
    movs.forEach((m, i) => {
      const r = 5 + i;
      if (r <= 504) {
        up.set('B' + r, N(serial(m.data))); up.set('C' + r, txt(m.categoria)); up.set('D' + r, descCell(m));
        up.set('E' + r, N(round2(m.importo))); up.set('I' + r, txt(m.id));
      } else {
        extra.push(`<row r="${r}" spans="2:9" x14ac:dyDescent="0.3">` +
          cellXml('B' + r, ' s="57"', N(serial(m.data))) + cellXml('C' + r, ' s="5"', txt(m.categoria)) +
          cellXml('D' + r, ' s="5"', descCell(m)) + cellXml('E' + r, ' s="6"', N(round2(m.importo))) +
          cellXml('F' + r, ' s="7"', Fm(`IF($B${r}="","",MONTH($B${r}))`)) + cellXml('G' + r, ' s="7"', Fm(`IF($B${r}="","",YEAR($B${r}))`)) +
          cellXml('H' + r, ' s="7"', Fm(movH(r))) + cellXml('I' + r, '', txt(m.id)) + '</row>');
      }
    });
    let mv = setCells(await rd(S_MOV), up);
    if (extra.length) {
      mv = mv.replace('</sheetData>', extra.join('') + '</sheetData>')
        .replace('<dimension ref="B1:I504"/>', `<dimension ref="B1:I${last}"/>`)
        .replace('<autoFilter ref="B4:I504"', `<autoFilter ref="B4:I${last}"`)
        .replace('sqref="H5:H504"', `sqref="H5:H${last}"`).replace('sqref="C5:C504"', `sqref="C5:C${last}"`);
    }
    zip.file(S_MOV, mv);

    /* Impostazioni */
    const ui = new Map([['C4', N(state.anno)]]);
    for (let i = 0; i < 30; i++) {
      const r = 9 + i, c = state.categorie[i];
      ui.set('B' + r, c ? Str(c.nome) : B); ui.set('C' + r, c ? Str(c.tipo) : B); ui.set('D' + r, c ? nOrB(c.budget) : B);
    }
    for (let i = 0; i < 20; i++) {
      const r = 43 + i, f = state.fisse[i];
      ui.set('B' + r, f ? txt(f.descrizione) : B); ui.set('C' + r, f ? txt(f.categoria) : B);
      ui.set('D' + r, f ? N(round2(Number(f.importo) || 0)) : B); ui.set('E' + r, f ? txt(f.note) : B);
    }
    zip.file(S_IMP, setCells(await rd(S_IMP), ui));

    /* Budget: solo i mesi sovrascritti a mano; gli altri restano formula */
    const ub = new Map();
    state.categorie.forEach((c, i) => {
      const o = state.override[c.nome]; if (!o) return;
      for (let m = 1; m <= 12; m++) if (Object.prototype.hasOwnProperty.call(o, m)) ub.set(String.fromCharCode(66 + m) + (5 + i), nOrB(o[m]));
    });
    if (ub.size) zip.file(S_BUD, setCells(await rd(S_BUD), ub));

    /* Riepilogo: si apre sul mese corrente */
    zip.file(S_RIE, setCells(await rd(S_RIE), new Map([['C4', Str(MESI[now.getMonth()])]])));

    if (extra.length) zip.file('xl/workbook.xml', wb.replace('Movimenti!$B$4:$I$504', `Movimenti!$B$4:$I$${last}`));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  }

  const Core = { MESI, MESI_BREVI, MAX_CAT, MAX_FISSE, emptyState, uid, round2, budgetFor, defaultBudget, fisseFor, tipoOf,
    monthStats, parseWorkbook, diffImport, applyImport, buildFromTemplate, parseDateAny, parseNum };
  if (typeof module !== 'undefined' && module.exports) module.exports = Core; else root.Core = Core;
})(typeof window !== 'undefined' ? window : this);
