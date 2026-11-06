(function () {
  'use strict';
  const KEY = 'budget.v1';
  const $ = (s) => document.querySelector(s);
  const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const E = (n) => { const v = Math.round((Number(n) || 0) * 100) / 100, [i, d] = Math.abs(v).toFixed(2).split('.'); return `${v < 0 ? '-' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d} €`; };
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => iso(new Date());
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
  const ddmm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const ddmmyyyy = (s) => `${ddmm(s)}/${s.slice(0, 4)}`;

  /* ---------- stato ---------- */
  let S = load();
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.version) return Object.assign(Core.emptyState(), s); } catch (e) { /* stato vuoto */ }
    return Core.emptyState();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { toast('Salvataggio non riuscito: memoria del browser piena o bloccata.'); }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- navigazione ---------- */
  const now = new Date();
  let cur = { y: now.getFullYear(), m: now.getMonth() + 1 }, ytd = false;
  document.querySelectorAll('.period button').forEach((b) => b.addEventListener('click', () => {
    ytd = b.dataset.p === 'y';
    document.querySelectorAll('.period button').forEach((x) => x.classList.toggle('on', x === b));
    renderMese();
  }));
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.v)));
  function show(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === id));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.v === id));
    window.scrollTo(0, 0);
  }
  $('#mPrev').onclick = () => { cur.m--; if (cur.m < 1) { cur.m = 12; cur.y--; } renderMese(); };
  $('#mNext').onclick = () => { cur.m++; if (cur.m > 12) { cur.m = 1; cur.y++; } renderMese(); };

  /* ---------- vista Mese ---------- */
  function daysSince(isoStr) { return isoStr ? Math.floor((Date.now() - new Date(isoStr).getTime()) / 864e5) : null; }

  function renderMese() {
    $('#mLabel').textContent = ytd ? (cur.m === 1 ? `Gennaio ${cur.y}` : `Gennaio–${Core.MESI[cur.m - 1]} ${cur.y}`) : `${Core.MESI[cur.m - 1]} ${cur.y}`;
    const body = $('#meseBody');
    if (!S.movimenti.length) {
      body.innerHTML = `<div class="empty"><p>Nessun movimento registrato. Se hai già il file Excel del budget, importalo: categorie, budget e movimenti arrivano tutti insieme.</p>
        <div class="stack"><button class="btn primary" data-go="import">Importa da Excel</button><button class="btn secondary" data-go="add">Aggiungi il primo movimento</button></div></div>`;
      return;
    }
    const st = ytd ? Core.periodStats(S, cur.y, 1, cur.m) : Core.monthStats(S, cur.y, cur.m);
    const perTxt = ytd ? 'da inizio anno' : 'nel mese';
    const prev = st.uscitePrev, eff = st.usciteEff, res = Core.round2(prev - eff);
    const pct = prev > 0 ? eff / prev : null;
    const gcls = pct === null ? '' : pct > 1 ? 'over' : pct >= 0.9 ? 'warn' : '';
    let hero;
    if (prev > 0) {
      hero = `<div class="cap">${res >= 0 ? 'Puoi ancora spendere' : 'Sei oltre il budget di'}</div>
        <div class="big ${res < 0 ? 'neg' : ''}">${E(Math.abs(res))}</div>
        <div class="gauge ${gcls}"><i style="width:${Math.max(0, Math.min(100, (pct || 0) * 100)).toFixed(1)}%"></i></div>
        <div class="sub">Spesi <b class="num">${E(eff)}</b> su <span class="num">${E(prev)}</span> di budget ${perTxt}</div>`;
    } else {
      hero = `<div class="cap">Speso ${perTxt}</div><div class="big">${E(eff)}</div>
        <div class="sub">Nessun budget uscite per ${ytd ? 'questo periodo' : 'questo mese'}</div>`;
    }
    const risp = Core.round2(st.entrateEff - st.usciteEff);
    let html = `<div class="hero">${hero}</div>
      <div class="pair"><div><span>Entrate</span><strong>${E(st.entrateEff)}</strong></div>
      <div><span>Risparmio</span><strong style="${risp < 0 ? 'color:var(--brick)' : ''}">${E(risp)}</strong></div></div>`;
    const ds = daysSince(S.lastExport);
    if (ds === null || ds > 14) {
      html += `<div class="banner"><span>${ds === null ? 'Non hai ancora esportato un Excel.' : `Ultimo Excel esportato ${ds} giorni fa.`} È anche il tuo backup.</span><button data-go="export">Esporta</button></div>`;
    }
    const catRow = (r) => {
      const p = r.budget > 0 ? r.effettivo / r.budget : null;
      const cls = r.tipo === 'Spesa' ? (p === null ? (r.effettivo > 0 ? 'over' : '') : p > 1 ? 'over' : p >= 0.9 ? 'warn' : '') : '';
      const flag = r.tipo === 'Spesa' && cls === 'over' ? '<span class="flag over">Sforato</span>' : cls === 'warn' ? '<span class="flag warn">Al limite</span>' : '';
      return `<button class="cat" style="display:block;width:100%;text-align:left" data-cat="${esc(r.nome)}">
        <div class="row"><span class="n">${esc(r.nome)}${flag}</span><span class="v"><b>${E(r.effettivo)}</b> / ${E(r.budget)}</span></div>
        <div class="gauge ${cls}"><i style="width:${Math.max(0, Math.min(100, (p === null ? (r.effettivo > 0 ? 1 : 0) : p) * 100)).toFixed(1)}%"></i></div></button>`;
    };
    const sp = st.righe.filter((r) => r.tipo === 'Spesa' && (r.budget > 0 || r.effettivo > 0));
    const en = st.righe.filter((r) => r.tipo === 'Entrata' && (r.budget > 0 || r.effettivo > 0));
    if (sp.length) html += `<h2>Uscite per categoria</h2><div class="catlist">${sp.map(catRow).join('')}</div>`;
    if (en.length) html += `<h2>Entrate</h2><div class="catlist">${en.map(catRow).join('')}</div>`;
    const inv = st.righe.filter((r) => r.tipo === 'Investimento' && (r.effettivo !== 0 || r.budget > 0));
    if (inv.length) html += `<h2>Investimenti ${ytd ? 'da inizio anno' : 'del mese'}: ${E(st.investEff)}${st.investPrev > 0 ? ` su ${E(st.investPrev)} di piano` : ''}</h2><div class="catlist inv">${inv.map((r) =>
      `<button class="cat" style="display:block;width:100%;text-align:left" data-cat="${esc(r.nome)}"><div class="row" style="margin:0"><span class="n">${esc(r.nome)}</span><span class="v num"><b>${E(r.effettivo)}</b>${r.budget > 0 ? ` / piano ${E(r.budget)}` : ''}</span></div></button>`).join('')}</div>
      <p class="hint">Fuori da entrate, uscite e risparmio: il piano si confronta solo con l'investito.</p>`;
    if (st.orfani.length) html += `<h2>Da sistemare</h2><div class="catlist">${st.orfani.map((o) => `<button class="cat" style="display:block;width:100%;text-align:left" data-cat="${esc(o)}"><div class="row"><span class="n">${esc(o)}<span class="flag over">Categoria inesistente</span></span></div></button>`).join('')}</div>`;
    body.innerHTML = html;
  }
  $('#meseBody').addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g) { if (g.dataset.go === 'import') $('#fImport').click(); else if (g.dataset.go === 'add') openEntry(); else doExport(g); return; }
    const c = e.target.closest('[data-cat]');
    if (c) { $('#q').value = c.dataset.cat; renderMov(); show('v-mov'); }
  });

  /* ---------- vista Movimenti ---------- */
  function renderMov() {
    const q = $('#q').value.trim().toLowerCase();
    const rows = S.movimenti.map((m, i) => [m, i])
      .filter(([m]) => !q || (m.descrizione || '').toLowerCase().includes(q) || (m.categoria || '').toLowerCase().includes(q))
      .sort((a, b) => (a[0].data < b[0].data ? 1 : a[0].data > b[0].data ? -1 : b[1] - a[1]))
      .slice(0, 600).map((x) => x[0]);
    if (!rows.length) {
      $('#movBody').innerHTML = `<div class="empty" style="margin-top:16px"><p>${q ? `Nessun movimento per “${esc(q)}”.` : 'Nessun movimento. Tocca + per aggiungerne uno.'}</p></div>`;
      return;
    }
    const groups = new Map();
    for (const m of rows) { const k = m.data.slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
    let html = '';
    for (const [k, list] of groups) {
      const out = Core.round2(list.filter((m) => Core.tipoOf(S, m.categoria) === 'Spesa').reduce((s, m) => s + m.importo, 0));
      html += `<div class="group"><h3><span>${Core.MESI[+k.slice(5) - 1]} ${k.slice(0, 4)}</span><span class="num">Uscite ${E(out)}</span></h3><div class="list">`;
      for (const m of list) {
        const ent = Core.tipoOf(S, m.categoria) === 'Entrata';
        html += `<button class="item" data-id="${esc(m.id)}"><span class="d">${ddmm(m.data)}</span>
          <span class="t"><div>${m.evid ? `<span class="hl">${esc(m.descrizione || m.categoria)}</span>` : esc(m.descrizione || m.categoria)}</div>${m.descrizione ? `<small>${esc(m.categoria)}</small>` : ''}</span>
          ${(() => { const w = ent ? m.importo : -m.importo; return `<span class="a ${w > 0 ? 'in' : ''}">${w >= 0 ? '+' : '−'}${E(Math.abs(m.importo))}</span>`; })()}</button>`;
      }
      html += '</div></div>';
    }
    $('#movBody').innerHTML = html;
  }
  $('#q').addEventListener('input', renderMov);
  $('#movBody').addEventListener('click', (e) => {
    const it = e.target.closest('[data-id]'); if (!it) return;
    const m = S.movimenti.find((x) => x.id === it.dataset.id); if (m) openEntry(m);
  });

  /* ---------- inserimento ---------- */
  let ent = null;
  const sheet = $('#sheet');
  $('#bAdd').onclick = () => openEntry();
  function openEntry(m) {
    ent = m ? { id: m.id, tipo: Core.tipoOf(S, m.categoria) || 'Spesa', amt: amtFromNum(Math.abs(m.importo)), neg: m.importo < 0, cat: m.categoria, date: m.data, desc: m.descrizione || '', evid: !!m.evid }
            : { id: null, tipo: 'Spesa', amt: '', neg: false, cat: null, date: today(), desc: '', evid: false };
    $('#shTitle').textContent = m ? 'Modifica movimento' : 'Nuovo movimento';
    $('#shDel').classList.toggle('hidden', !m);
    $('#desc').value = ent.desc;
    renderEntry();
    $('#toast').classList.remove('show');
    sheet.classList.add('open');
  }
  function closeEntry() { $('#desc').blur(); sheet.classList.remove('open'); ent = null; }
  $('#shClose').onclick = closeEntry;
  function amtFromNum(n) { const s = Core.round2(n).toFixed(2).replace('.', ','); return s.endsWith(',00') ? s.slice(0, -3) : s; }
  function amtValue() { return ent.amt ? Number(ent.amt.replace(',', '.')) : 0; }

  function usage() {
    const u = {};
    for (const m of S.movimenti) u[m.categoria] = (u[m.categoria] || 0) + 1;
    return u;
  }
  function renderEntry() {
    $('#tSpesa').classList.toggle('on', ent.tipo === 'Spesa');
    $('#tEntrata').classList.toggle('on', ent.tipo === 'Entrata');
    $('#tInvest').classList.toggle('on', ent.tipo === 'Investimento');
    renderAmt();
    const u = usage();
    let cats = S.categorie.map((c, i) => [c, i]).filter(([c]) => c.tipo === ent.tipo);
    cats.sort((a, b) => (u[b[0].nome] || 0) - (u[a[0].nome] || 0) || a[1] - b[1]);
    let names = cats.map(([c]) => c.nome);
    if (ent.cat && !names.includes(ent.cat) && !S.categorie.some((c) => c.nome === ent.cat)) names.unshift(ent.cat);
    $('#chips').innerHTML = names.map((n) => `<button class="chip ${n === ent.cat ? 'on' : ''}" data-c="${esc(n)}">${esc(n)}</button>`).join('');
    renderSugg(); renderDate(); validate();
    $('#dEvid').setAttribute('aria-pressed', ent.evid ? 'true' : 'false');
  }
  function renderAmt() {
    const el = $('#amt'), sg = ent.neg ? '−' : '';
    $('#bSign').setAttribute('aria-pressed', ent.neg ? 'true' : 'false');
    $('#negHint').textContent = !ent.neg ? '' : ent.tipo === 'Entrata' ? 'Negativo: riduce le entrate della categoria'
      : ent.tipo === 'Investimento' ? 'Negativo: disinvestimento o plusvalenza, riduce l\'investito' : 'Negativo: rientro, riduce le uscite della categoria';
    if (!ent.amt) { el.innerHTML = `<span class="ph">${sg}0</span><small>€</small>`; return; }
    const [i, d] = ent.amt.split(',');
    const intTxt = Number(i || '0').toLocaleString('it-IT');
    el.innerHTML = `${sg}${intTxt}${ent.amt.includes(',') ? ',' + d : ''}<small>€</small>`;
    el.style.fontSize = ent.amt.length > 9 ? '48px' : '';
  }
  function renderSugg() {
    const box = $('#sugg');
    if (!ent.cat) { box.innerHTML = ''; return; }
    const cnt = new Map();
    for (let k = S.movimenti.length - 1; k >= 0; k--) {
      const m = S.movimenti[k]; if (m.categoria !== ent.cat || !m.descrizione) continue;
      const key = m.descrizione.trim().toLowerCase();
      const v = cnt.get(key) || { t: m.descrizione.trim(), n: 0 }; v.n++; cnt.set(key, v);
    }
    const top = [...cnt.values()].sort((a, b) => b.n - a.n).slice(0, 6);
    box.innerHTML = top.map((v) => `<button data-s="${esc(v.t)}">${esc(v.t)}</button>`).join('');
  }
  function renderDate() {
    const t = today(), y = yesterday();
    $('#dOggi').classList.toggle('on', ent.date === t);
    $('#dIeri').classList.toggle('on', ent.date === y);
    const other = ent.date !== t && ent.date !== y;
    $('#dAltra').classList.toggle('on', other);
    $('#dAltraTxt').textContent = other ? ddmmyyyy(ent.date) : 'Altra data';
    $('#dPick').value = ent.date;
  }
  function validate() {
    const ok = amtValue() > 0 && !!ent.cat;
    const b = $('#shSave'); b.disabled = !ok;
    b.textContent = ent.id ? 'Salva modifiche' : ent.tipo === 'Entrata' ? 'Salva entrata' : ent.tipo === 'Investimento' ? 'Salva investimento' : 'Salva spesa';
  }
  $('#bSign').onclick = () => { ent.neg = !ent.neg; renderAmt(); };
  $('#tSpesa').onclick = () => { if (ent.tipo !== 'Spesa') { ent.tipo = 'Spesa'; ent.cat = null; renderEntry(); } };
  $('#tEntrata').onclick = () => { if (ent.tipo !== 'Entrata') { ent.tipo = 'Entrata'; ent.cat = null; renderEntry(); } };
  $('#tInvest').onclick = () => { if (ent.tipo !== 'Investimento') { ent.tipo = 'Investimento'; ent.cat = null; renderEntry(); } };
  $('#chips').addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]'); if (!c) return;
    ent.cat = c.dataset.c;
    document.querySelectorAll('#chips .chip').forEach((x) => x.classList.toggle('on', x === c));
    renderSugg(); validate();
  });
  $('#sugg').addEventListener('click', (e) => {
    const s = e.target.closest('[data-s]'); if (!s) return;
    ent.desc = s.dataset.s; $('#desc').value = ent.desc;
  });
  $('#desc').addEventListener('input', (e) => { ent.desc = e.target.value; });
  $('#desc').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('#dEvid').onclick = () => { ent.evid = !ent.evid; $('#dEvid').setAttribute('aria-pressed', ent.evid ? 'true' : 'false'); toast(ent.evid ? 'Sarà evidenziato in giallo nell\'Excel' : 'Evidenziazione tolta'); };
  $('#dOggi').onclick = () => { ent.date = today(); renderDate(); };
  $('#dIeri').onclick = () => { ent.date = yesterday(); renderDate(); };
  $('#dPick').addEventListener('change', (e) => { if (e.target.value) { ent.date = e.target.value; renderDate(); } });
  $('#pad').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const k = b.classList.contains('k-del') ? 'del' : b.textContent;
    let a = ent.amt;
    if (k === 'del') a = a.slice(0, -1);
    else if (k === ',') { if (!a.includes(',')) a = (a || '0') + ','; }
    else if (a.includes(',')) { if (a.split(',')[1].length >= 2) return; a += k; }
    else if (a === '0') a = k;
    else { if (a.length >= 7) return; a += k; }
    ent.amt = a; renderAmt(); validate();
  });
  $('#shSave').onclick = () => {
    const abs = Core.round2(amtValue()); if (!(abs > 0) || !ent.cat) return;
    const v = ent.neg ? -abs : abs;
    const desc = (ent.desc || '').trim();
    let msg;
    if (ent.id) {
      const m = S.movimenti.find((x) => x.id === ent.id);
      // la descrizione non toccata resta identica, spazi compresi
      Object.assign(m, { data: ent.date, categoria: ent.cat, descrizione: ent.desc === m.descrizione ? m.descrizione : desc, importo: v });
      if (ent.evid) m.evid = true; else delete m.evid; msg = 'Movimento aggiornato';
    } else {
      const nm = { id: Core.uid(), data: ent.date, categoria: ent.cat, descrizione: desc, importo: v };
      if (ent.evid) nm.evid = true; S.movimenti.push(nm);
      msg = ent.tipo === 'Entrata' ? 'Entrata salvata' : ent.tipo === 'Investimento' ? 'Investimento salvato' : 'Spesa salvata';
    }
    save(); closeEntry(); renderAll(); toast(`${msg}: ${E(v)}`);
  };
  $('#shDel').onclick = () => {
    if (!ent || !ent.id || !confirm('Eliminare questo movimento?')) return;
    S.movimenti = S.movimenti.filter((m) => m.id !== ent.id);
    save(); closeEntry(); renderAll(); toast('Movimento eliminato');
  };


  /* ---------- vista Analisi (Year to date sui soli mesi con spese) ---------- */
  const thisYear = now.getFullYear();
  let anaY = S.movimenti.some((m) => m.data && m.data.startsWith(String(thisYear))) ? thisYear : S.anno;
  $('#aPrev').onclick = () => { anaY--; renderAna(); };
  $('#aNext').onclick = () => { anaY++; renderAna(); };

  const K = (v) => { const a = Math.abs(v); const t = a >= 10000 ? Math.round(a / 1000) + 'k' : a >= 1000 ? (a / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(a)); return (v < 0 ? '−' : '') + t; };
  const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
  function periodText(months) {
    const runs = []; let st = months[0], pr = months[0];
    for (let i = 1; i <= months.length; i++) {
      const m = months[i];
      if (m === pr + 1) { pr = m; continue; }
      runs.push(st === pr ? Core.MESI[st - 1].toLowerCase() : `${Core.MESI[st - 1].toLowerCase()}–${Core.MESI[pr - 1].toLowerCase()}`);
      st = pr = m;
    }
    return runs.join(', ');
  }

  // barre raggruppate con asse zero (gestisce anche valori negativi)
  function barChart(labels, series, title) {
    const W = 340, H = 190, L = 34, B = 20, T = 16, n = labels.length;
    const all = series.flatMap((s) => s.values).concat(0);
    const hi = niceMax(Math.max(...all)), lo = Math.min(...all) < 0 ? -niceMax(-Math.min(...all)) : 0;
    const y = (v) => T + (H - T - B) * (hi - v) / (hi - lo);
    const gw = (W - L) / n, bw = Math.min(26, (gw * 0.7) / series.length);
    let g = '';
    for (const t of [lo, lo === 0 ? hi / 2 : 0, hi]) g += `<line class="grid" x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 5}" y="${y(t) + 3}" text-anchor="end">${K(t)}</text>`;
    labels.forEach((lab, i) => {
      const cx = L + gw * i + gw / 2, x0 = cx - (bw * series.length) / 2;
      series.forEach((s, j) => {
        const v = s.values[i], top = Math.min(y(v), y(0)), hgt = Math.max(1, Math.abs(y(v) - y(0)));
        const col = typeof s.color === 'function' ? s.color(v, i) : s.color;
        g += `<rect x="${x0 + j * bw + 1}" y="${top}" width="${bw - 2}" height="${hgt}" rx="3" style="fill:${col}"/>`;
        if (n <= 6) g += `<text class="val" x="${x0 + j * bw + bw / 2}" y="${v >= 0 ? top - 4 : top + hgt + 11}" text-anchor="middle">${K(v)}</text>`;
      });
      g += `<text class="ax" x="${cx}" y="${H - 5}" text-anchor="middle">${lab}</text>`;
    });
    const leg = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.legend || s.color}"></i>${s.name}</span>`).join('')}</div>` : '';
    return `<h2>${title}</h2><div class="chart">${leg}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}</svg></div>`;
  }

  function lineChart(labels, series, title) {
    const W = 340, H = 180, L = 34, B = 20, T = 16, n = labels.length;
    const hi = niceMax(Math.max(...series.flatMap((s) => s.values), 1));
    const y = (v) => T + (H - T - B) * (hi - Math.max(0, v)) / hi;
    const x = (i) => (n === 1 ? L + (W - L) / 2 : L + 14 + (W - L - 28) * i / (n - 1));
    let g = '';
    for (const t of [0, hi / 2, hi]) g += `<line class="grid" x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 5}" y="${y(t) + 3}" text-anchor="end">${K(t)}</text>`;
    labels.forEach((lab, i) => { g += `<text class="ax" x="${x(i)}" y="${H - 5}" text-anchor="middle">${lab}</text>`; });
    series.forEach((s) => {
      g += `<polyline points="${s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" style="fill:none;stroke:${s.color};stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round${s.dash ? ';stroke-dasharray:5 4' : ''}"/>`;
      s.values.forEach((v, i) => { g += `<circle cx="${x(i)}" cy="${y(v)}" r="3.5" style="fill:${s.color}"/>`; });
      const lv = s.values[n - 1]; g += `<text class="val" x="${x(n - 1)}" y="${y(lv) - 8}" text-anchor="middle">${K(lv)}</text>`;
    });
    const leg = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
    return `<h2>${title}</h2><div class="chart">${leg}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}</svg></div>`;
  }

  function renderAna() {
    $('#aLabel').textContent = `Year to date ${anaY}`;
    const a = Core.yearAnalysis(S, anaY), body = $('#anaBody');
    if (!a.months.length) {
      body.innerHTML = `<div class="empty"><p>Nessuna spesa registrata nel ${anaY}. L'analisi considera solo i mesi con almeno una spesa.</p></div>`;
      return;
    }
    const n = a.months.length, t = a.tot;
    const res = Core.round2(t.uscitePrev - t.usciteEff), pct = t.uscitePrev > 0 ? t.usciteEff / t.uscitePrev : null;
    const risp = Core.round2(t.entrateEff - t.usciteEff), tasso = t.entrateEff > 0 ? risp / t.entrateEff : null;
    const spese = a.cat.filter((c) => c.tipo === 'Spesa');
    const top = spese.filter((c) => c.effettivo > 0).sort((x, y) => y.effettivo - x.effettivo)[0];
    const inCorso = anaY === thisYear && a.months.includes(now.getMonth() + 1);
    const P = (v) => (v === null ? '—' : `${Math.round(v * 100)}%`);
    let html = `<p class="period-note">Periodo analizzato: <b>${periodText(a.months)}</b> (${n} ${n === 1 ? 'mese' : 'mesi'} con spese)${inCorso ? `. ${Core.MESI[now.getMonth()]} è ancora in corso, quindi il confronto con il suo budget è parziale.` : '.'}</p>`;
    html += `<div class="kpis">
      <div class="kpi"><span>Uscite</span><strong>${E(t.usciteEff)}</strong><small>budget ${E(t.uscitePrev)}</small></div>
      <div class="kpi"><span>Utilizzo budget</span><strong class="${pct !== null && pct > 1 ? 'neg' : ''}">${P(pct)}</strong><small class="${res < 0 ? 'neg' : ''}">${res < 0 ? 'sforato di ' + E(-res) : 'residuo ' + E(res)}</small></div>
      <div class="kpi"><span>Entrate</span><strong>${E(t.entrateEff)}</strong><small>previste ${E(t.entratePrev)}</small></div>
      <div class="kpi"><span>Risparmio</span><strong class="${risp < 0 ? 'neg' : ''}">${E(risp)}</strong><small>tasso di risparmio ${P(tasso)}</small></div>
      <div class="kpi"><span>Uscite medie al mese</span><strong>${E(t.usciteEff / n)}</strong><small>budget ${E(t.uscitePrev / n)}</small></div>
      <div class="kpi"><span>Prima voce di spesa</span><strong class="kname">${top ? esc(top.nome) : '—'}</strong><small>${top ? `${E(top.effettivo)} (${P(t.usciteEff > 0 ? top.effettivo / t.usciteEff : null)} delle uscite)` : ''}</small></div>
    </div>`;
    const labs = a.months.map((m) => Core.MESI_BREVI[m - 1]);
    html += barChart(labs, [
      { name: 'Effettivo', legend: 'var(--ledger)', values: a.perMonth.map((p) => p.usciteEff), color: (v, i) => (a.perMonth[i] && a.perMonth[i].usciteEff > a.perMonth[i].uscitePrev && a.perMonth[i].uscitePrev > 0 ? 'var(--brick)' : 'var(--ledger)') },
      { name: 'Budget', values: a.perMonth.map((p) => p.uscitePrev), color: 'var(--line)' }
    ], 'Uscite per mese');
    html += barChart(labs, [{ name: 'Risparmio', legend: 'var(--ledger)', values: a.perMonth.map((p) => Core.round2(p.entrateEff - p.usciteEff)), color: (v) => (v < 0 ? 'var(--brick)' : 'var(--ledger)') }], 'Risparmio per mese (entrate − uscite)');
    let ce = 0, cb = 0;
    html += lineChart(labs, [
      { name: 'Uscite cumulate', values: a.perMonth.map((p) => (ce = Core.round2(ce + p.usciteEff))), color: 'var(--ledger)' },
      { name: 'Budget cumulato', values: a.perMonth.map((p) => (cb = Core.round2(cb + p.uscitePrev))), color: 'var(--muted)', dash: true }
    ], 'Uscite cumulate e budget');
    const rows = spese.filter((c) => c.effettivo !== 0 || c.budget > 0).sort((x, y) => y.effettivo - x.effettivo);
    const scale = Math.max(1, ...rows.map((r) => Math.max(r.effettivo, r.budget)));
    html += `<h2>Uscite per categoria</h2><div class="chart" style="padding:4px 14px"><div class="legend" style="margin:10px 0 2px"><span><i style="background:var(--ledger)"></i>Effettivo</span><span><i style="background:var(--ink);opacity:.55;width:3px"></i>Budget</span></div>${rows.map((r) => {
      const p = r.budget > 0 ? r.effettivo / r.budget : null;
      const cls = p === null ? (r.effettivo > 0 ? 'over' : '') : p > 1 ? 'over' : p >= 0.9 ? 'warn' : '';
      return `<div class="hb"><div class="row"><span>${esc(r.nome)}</span><span class="v"><b>${E(r.effettivo)}</b> / ${E(r.budget)}</span></div>
        <div class="track"><i class="${cls}" style="width:${Math.max(0, r.effettivo / scale * 100).toFixed(1)}%"></i>${r.budget > 0 ? `<u style="left:calc(${(r.budget / scale * 100).toFixed(1)}% - 1px)"></u>` : ''}</div></div>`;
    }).join('')}</div>`;
    if (a.invCat.some((c) => c.effettivo !== 0 || c.budget > 0)) {
      html += `<h2>Investimenti ${anaY}</h2><p class="period-note" style="margin:-4px 0 12px">Stesso periodo, fuori dai KPI sopra: l'investito si confronta solo con il piano.</p>
        <div class="kpis"><div class="kpi"><span>Investito da inizio anno</span><strong>${E(t.investEff)}</strong><small>${t.investPrev > 0 ? `piano ${E(t.investPrev)}` : 'nel periodo analizzato'}</small></div>
        <div class="kpi"><span>Risparmio meno investito</span><strong class="${risp - t.investEff < 0 ? 'neg' : ''}">${E(risp - t.investEff)}</strong><small>stesso periodo</small></div></div>`;
      html += barChart(labs, [{ name: 'Investito', legend: 'var(--amber)', values: a.perMonth.map((p) => p.investEff), color: (v) => (v < 0 ? 'var(--brick)' : 'var(--amber)') },
        { name: 'Piano', values: a.perMonth.map((p) => p.investPrev), color: 'var(--line)' }], 'Investito per mese e piano');
      html += `<div class="chart" style="padding:4px 14px;margin-top:10px">${a.invCat.filter((c) => c.effettivo !== 0 || c.budget > 0).map((c) =>
        `<div class="hb"><div class="row" style="margin:0"><span>${esc(c.nome)}</span><span class="v"><b>${E(c.effettivo)}</b>${c.budget > 0 ? ` / piano ${E(c.budget)}` : ''}</span></div></div>`).join('')}</div>`;
    }
    body.innerHTML = html;
  }

  /* ---------- impostazioni ---------- */
  let ovSel = null;
  function renderSet() {
    const ds = daysSince(S.lastExport);
    $('#lastExp').textContent = ds === null ? 'Nessun Excel esportato finora.' : ds === 0 ? 'Ultimo Excel esportato oggi.' : `Ultimo Excel esportato ${ds === 1 ? 'ieri' : ds + ' giorni fa'}.`;
    $('#sAnno').value = S.anno;
    // categorie
    let h = S.categorie.map((c, i) => `<div class="ed" data-i="${i}">
      <div class="l1"><input data-k="nome" value="${esc(c.nome)}" aria-label="Nome categoria"><button class="x" data-act="del" aria-label="Elimina ${esc(c.nome)}">×</button></div>
      <div class="l2"><select data-k="tipo" aria-label="Tipo">${Core.TIPI.map((t) => `<option ${c.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input data-k="budget" class="num" inputmode="decimal" placeholder="${c.tipo === 'Investimento' ? 'Piano €' : 'Budget €'}" value="${c.budget === null || c.budget === undefined ? '' : String(c.budget).replace('.', ',')}" aria-label="${c.tipo === 'Investimento' ? 'Piano di investimento mensile' : 'Budget variabile mensile'}">
      <span class="hint num" style="margin:0;white-space:nowrap">${Core.fisseFor(S, c.nome) ? '+ fisse ' + E(Core.fisseFor(S, c.nome)) : ''}</span></div></div>`).join('');
    h += S.categorie.length < Core.MAX_CAT ? '<button class="addrow" data-act="add">Aggiungi categoria</button>' : `<p class="hint">Massimo ${Core.MAX_CAT} categorie (limite del file Excel).</p>`;
    $('#catEd').innerHTML = h;
    // spese fisse
    const opts = (sel) => S.categorie.map((c) => `<option ${c.nome === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('') + (sel && !S.categorie.some((c) => c.nome === sel) ? `<option selected>${esc(sel)}</option>` : '') + (!sel ? '<option value="" selected>Categoria…</option>' : '');
    let f = S.fisse.map((x, i) => `<div class="ed" data-i="${i}">
      <div class="l1"><input data-k="descrizione" value="${esc(x.descrizione)}" placeholder="Descrizione" aria-label="Descrizione"><button class="x" data-act="del" aria-label="Elimina spesa fissa">×</button></div>
      <div class="l2" style="grid-template-columns:1fr 110px"><select data-k="categoria" aria-label="Categoria">${opts(x.categoria)}</select>
      <input data-k="importo" class="num" inputmode="decimal" placeholder="€ / mese" value="${String(x.importo ?? '').replace('.', ',')}" aria-label="Importo mensile"></div>
      <input data-k="note" value="${esc(x.note || '')}" placeholder="Note" aria-label="Note"></div>`).join('');
    f += S.fisse.length < Core.MAX_FISSE ? '<button class="addrow" data-act="add">Aggiungi spesa fissa</button>' : `<p class="hint">Massimo ${Core.MAX_FISSE} spese fisse (limite del file Excel).</p>`;
    $('#fixEd').innerHTML = f;
    // budget per mese
    const budCats = S.categorie;
    if (!ovSel || !budCats.some((c) => c.nome === ovSel)) ovSel = budCats[0] ? budCats[0].nome : null;
    $('#ovCat').innerHTML = S.categorie.map((c) => `<option ${c.nome === ovSel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
    renderOv();
  }
  function renderOv() {
    if (!ovSel) { $('#ovBody').innerHTML = ''; return; }
    const o = S.override[ovSel] || {}, d = Core.defaultBudget(S, ovSel);
    const ph = String(Core.round2(d)).replace('.', ',');
    const any = Object.keys(o).length > 0;
    $('#ovBody').innerHTML = `<div class="months">${Core.MESI_BREVI.map((mb, i) => {
      const set = Object.prototype.hasOwnProperty.call(o, i + 1), v = o[i + 1];
      const shown = !set ? '' : v === null || v === '' ? '0' : String(v).replace('.', ',');
      return `<label>${mb}<input data-m="${i + 1}" inputmode="decimal" class="${set ? 'set' : ''}" placeholder="${ph}" value="${shown}"></label>`;
    }).join('')}</div>${any ? '<button class="addrow" data-act="clear">Usa il budget standard per tutti i mesi</button>' : ''}`;
  }

  $('#sAnno').addEventListener('change', (e) => {
    const n = parseInt(e.target.value, 10);
    if (n >= 2000 && n <= 2100) { S.anno = n; save(); renderAll(); toast('Anno aggiornato'); } else { e.target.value = S.anno; toast("Inserisci un anno tra 2000 e 2100."); }
  });
  $('#catEd').addEventListener('change', (e) => {
    const row = e.target.closest('.ed'); if (!row) return;
    const c = S.categorie[+row.dataset.i], k = e.target.dataset.k;
    if (k === 'nome') {
      const nv = e.target.value.trim();
      if (!nv || (nv !== c.nome && S.categorie.some((x) => x.nome === nv))) { e.target.value = c.nome; toast(nv ? 'Esiste già una categoria con questo nome.' : 'Il nome non può essere vuoto.'); return; }
      const old = c.nome; if (nv === old) return;
      let n = 0;
      S.movimenti.forEach((m) => { if (m.categoria === old) { m.categoria = nv; n++; } });
      S.fisse.forEach((f) => { if (f.categoria === old) f.categoria = nv; });
      if (S.override[old]) { S.override[nv] = S.override[old]; delete S.override[old]; }
      if (ovSel === old) ovSel = nv;
      c.nome = nv; toast(n ? `Categoria rinominata, ${n} movimenti aggiornati` : 'Categoria rinominata');
    } else if (k === 'tipo') c.tipo = e.target.value;
    else if (k === 'budget') { const v = Core.parseNum(e.target.value); c.budget = v === null ? null : Core.round2(v); }
    save(); renderAll();
  });
  $('#catEd').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'add') {
      let n = 1; while (S.categorie.some((c) => c.nome === `Nuova categoria ${n}`)) n++;
      S.categorie.push({ nome: `Nuova categoria ${n}`, tipo: 'Spesa', budget: null }); save(); renderAll();
      const ins = document.querySelectorAll('#catEd input[data-k="nome"]'); const last = ins[ins.length - 1]; last.focus(); last.select();
      return;
    }
    const c = S.categorie[+a.closest('.ed').dataset.i];
    const nm = S.movimenti.filter((m) => m.categoria === c.nome).length, nf = S.fisse.filter((f) => f.categoria === c.nome).length;
    if (nm || nf) { toast(`“${c.nome}” è usata da ${nm ? nm + ' movimenti' : ''}${nm && nf ? ' e ' : ''}${nf ? nf + ' spese fisse' : ''}: rinominala o spostali prima di eliminarla.`); return; }
    if (!confirm(`Eliminare la categoria “${c.nome}”?`)) return;
    S.categorie = S.categorie.filter((x) => x !== c); delete S.override[c.nome]; save(); renderAll(); toast('Categoria eliminata');
  });
  $('#fixEd').addEventListener('change', (e) => {
    const row = e.target.closest('.ed'); if (!row) return;
    const f = S.fisse[+row.dataset.i], k = e.target.dataset.k;
    if (k === 'importo') { const v = Core.parseNum(e.target.value); f.importo = v === null ? 0 : Core.round2(v); }
    else f[k] = e.target.value.trim();
    save(); renderAll();
  });
  $('#fixEd').addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'add') { S.fisse.push({ descrizione: '', categoria: '', importo: 0, note: '' }); save(); renderAll();
      const ins = document.querySelectorAll('#fixEd input[data-k="descrizione"]'); ins[ins.length - 1].focus(); return; }
    const i = +a.closest('.ed').dataset.i;
    if (!confirm(`Eliminare la spesa fissa “${S.fisse[i].descrizione || 'senza nome'}”?`)) return;
    S.fisse.splice(i, 1); save(); renderAll(); toast('Spesa fissa eliminata');
  });
  $('#ovCat').addEventListener('change', (e) => { ovSel = e.target.value; renderOv(); });
  $('#ovBody').addEventListener('change', (e) => {
    const m = e.target.dataset.m; if (!m) return;
    const v = Core.parseNum(e.target.value);
    if (v === null) { if (S.override[ovSel]) { delete S.override[ovSel][m]; if (!Object.keys(S.override[ovSel]).length) delete S.override[ovSel]; } }
    else (S.override[ovSel] = S.override[ovSel] || {})[m] = Core.round2(v);
    save(); renderOv(); renderMese();
  });
  $('#ovBody').addEventListener('click', (e) => {
    if (!e.target.closest('[data-act="clear"]')) return;
    delete S.override[ovSel]; save(); renderOv(); renderMese(); toast(`${ovSel}: budget standard per tutti i mesi`);
  });
  $('#bReset').onclick = () => {
    if (!confirm('Cancellare tutti i movimenti e le impostazioni dell\'app? Il file Excel che hai esportato non viene toccato.')) return;
    if (!confirm('Confermi? L\'operazione non si può annullare.')) return;
    S = Core.emptyState(); save(); renderAll(); show('v-mese'); toast('Dati cancellati');
  };

  /* ---------- export ---------- */
  let pending = null, tplCache = null;
  async function getTemplate() {
    if (!tplCache) { const r = await fetch('template.xlsx'); if (!r.ok) throw new Error('Stampo Excel non trovato: carica template.xlsx insieme agli altri file.'); tplCache = await r.arrayBuffer(); }
    return tplCache;
  }
  setTimeout(() => getTemplate().catch(() => {}), 1500);
  const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function markExported() { S.lastExport = new Date().toISOString(); save(); renderSet(); renderMese(); toast('Excel esportato'); }
  async function deliver(file) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] }); return;
    }
    const url = URL.createObjectURL(file), a = document.createElement('a');
    a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function doExport() {
    const btn = $('#bExport');
    if (pending) { // secondo tocco: il file è pronto, lo consegno subito
      const f = pending; pending = null; btn.textContent = 'Esporta Excel';
      try { await deliver(f); markExported(); } catch (e) { if (e.name !== 'AbortError') toast('Salvataggio non riuscito: ' + e.message); }
      return;
    }
    if (!window.JSZip) { toast('Il modulo Excel si sta ancora caricando: riprova tra un attimo.'); return; }
    btn.disabled = true; btn.textContent = 'Preparo il file…';
    let file;
    try {
      const bytes = await Core.buildFromTemplate(JSZip, await getTemplate(), S);
      file = new File([bytes], `Budget_Personale_${today()}.xlsx`, { type: XLSX_TYPE });
    } catch (e) { toast(e.message || 'Creazione del file non riuscita.'); btn.disabled = false; btn.textContent = 'Esporta Excel'; return; }
    btn.disabled = false; btn.textContent = 'Esporta Excel';
    try { await deliver(file); markExported(); }
    catch (e) {
      if (e.name === 'AbortError') return;
      pending = file; btn.textContent = 'File pronto: tocca per salvarlo';
      if (!$('#v-set').classList.contains('on')) show('v-set');
    }
  }
  $('#bExport').onclick = () => doExport();

  /* ---------- import ---------- */
  let imp = null;
  $('#bImport').onclick = () => $('#fImport').click();
  $('#fImport').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    if (!window.ExcelJS) { toast('Il modulo Excel si sta ancora caricando: riprova tra un attimo.'); return; }
    try {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const parsed = Core.parseWorkbook(wb), diff = Core.diffImport(S, parsed);
      imp = { parsed, diff }; openImport(file.name);
    } catch (err) { toast('Non riesco a leggere il file: ' + (err.message || err)); }
  });
  function openImport(name) {
    const { parsed, diff } = imp;
    $('#impFile').textContent = `${name}: ${parsed.movimenti.length} movimenti, ${parsed.categorie.length} categorie, ${parsed.fisse.length} spese fisse.`;
    const row = (n, label, id, on, dis) => `<div class="row"><span><b>${n}</b> ${label}</span>${id ? `<input type="checkbox" class="switch" id="${id}" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} aria-label="${label}">` : ''}</div>`;
    $('#impBody').innerHTML =
      row(diff.nuovi.length, 'movimenti nuovi da aggiungere', 'oNew', diff.nuovi.length > 0, !diff.nuovi.length) +
      row(diff.modificati.length, 'movimenti modificati nel file', 'oMod', diff.modificati.length > 0, !diff.modificati.length) +
      row(diff.soloApp.length, 'movimenti presenti solo nell\'app: eliminarli?', 'oDel', false, !diff.soloApp.length) +
      `<div class="row"><span>${diff.impostazioniCambiate ? 'Categorie, budget e spese fisse del file sono diversi: usare quelli del file?' : 'Categorie, budget e spese fisse sono uguali'}</span>${diff.impostazioniCambiate ? '<input type="checkbox" class="switch" id="oSet" checked aria-label="Usa le impostazioni del file">' : ''}</div>` +
      row(diff.uguali.length, 'movimenti già presenti, invariati');
    const w = parsed.warnings;
    $('#impWarn').innerHTML = w.length ? `<h2>Da controllare (${w.length})</h2><ul class="warns">${w.slice(0, 50).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
    $('#toast').classList.remove('show');
    $('#impSheet').classList.add('open');
  }
  $('#impClose').onclick = () => { $('#impSheet').classList.remove('open'); imp = null; };
  $('#impApply').onclick = () => {
    if (!imp) return;
    const on = (id) => { const el = document.getElementById(id); return !!(el && el.checked && !el.disabled); };
    const opt = { nuovi: on('oNew'), modificati: on('oMod'), eliminaSoloApp: on('oDel'), impostazioni: on('oSet') };
    if (opt.eliminaSoloApp && !confirm(`Eliminare dall'app ${imp.diff.soloApp.length} movimenti che non sono nel file?`)) return;
    S = Core.applyImport(S, imp.parsed, imp.diff, opt); save();
    const parts = [];
    if (opt.nuovi) parts.push(`${imp.diff.nuovi.length} aggiunti`);
    if (opt.modificati) parts.push(`${imp.diff.modificati.length} aggiornati`);
    if (opt.eliminaSoloApp) parts.push(`${imp.diff.soloApp.length} eliminati`);
    if (opt.impostazioni) parts.push('impostazioni aggiornate');
    $('#impSheet').classList.remove('open'); imp = null; renderAll(); show('v-mese');
    toast(parts.length ? 'Import: ' + parts.join(', ') : 'Nessuna modifica applicata');
  };

  /* ---------- avvio ---------- */
  function renderAll() { renderMese(); renderMov(); renderSet(); renderAna(); }
  renderAll();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
