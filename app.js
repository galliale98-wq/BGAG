(function () {
  'use strict';
  const KEY = 'budget.v1';
  const $ = (s) => document.querySelector(s);
  const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const E = (n) => eur.format(n || 0);
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
  let cur = { y: now.getFullYear(), m: now.getMonth() + 1 };
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
    $('#mLabel').textContent = `${Core.MESI[cur.m - 1]} ${cur.y}`;
    const body = $('#meseBody');
    if (!S.movimenti.length) {
      body.innerHTML = `<div class="empty"><p>Nessun movimento registrato. Se hai già il file Excel del budget, importalo: categorie, budget e movimenti arrivano tutti insieme.</p>
        <div class="stack"><button class="btn primary" data-go="import">Importa da Excel</button><button class="btn secondary" data-go="add">Aggiungi il primo movimento</button></div></div>`;
      return;
    }
    const st = Core.monthStats(S, cur.y, cur.m);
    const prev = st.uscitePrev, eff = st.usciteEff, res = Core.round2(prev - eff);
    const pct = prev > 0 ? eff / prev : null;
    const gcls = pct === null ? '' : pct > 1 ? 'over' : pct >= 0.9 ? 'warn' : '';
    let hero;
    if (prev > 0) {
      hero = `<div class="cap">${res >= 0 ? 'Puoi ancora spendere' : 'Sei oltre il budget di'}</div>
        <div class="big ${res < 0 ? 'neg' : ''}">${E(Math.abs(res))}</div>
        <div class="gauge ${gcls}"><i style="width:${Math.min(100, (pct || 0) * 100).toFixed(1)}%"></i></div>
        <div class="sub">Spesi <b class="num">${E(eff)}</b> su <span class="num">${E(prev)}</span> di budget</div>`;
    } else {
      hero = `<div class="cap">Speso nel mese</div><div class="big">${E(eff)}</div>
        <div class="sub">Nessun budget uscite per questo mese</div>`;
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
      const flag = r.tipo === 'Spesa' && cls === 'over' ? '<span class="flag over">Sforato</span>' : cls === 'warn' ? '<span class="flag warn">Quasi al limite</span>' : '';
      return `<button class="cat" style="display:block;width:100%;text-align:left" data-cat="${esc(r.nome)}">
        <div class="row"><span class="n">${esc(r.nome)}${flag}</span><span class="v"><b>${E(r.effettivo)}</b> / ${E(r.budget)}</span></div>
        <div class="gauge ${cls}"><i style="width:${Math.min(100, (p || (r.effettivo > 0 ? 1 : 0)) * 100).toFixed(1)}%"></i></div></button>`;
    };
    const sp = st.righe.filter((r) => r.tipo === 'Spesa' && (r.budget > 0 || r.effettivo > 0));
    const en = st.righe.filter((r) => r.tipo === 'Entrata' && (r.budget > 0 || r.effettivo > 0));
    if (sp.length) html += `<h2>Uscite per categoria</h2><div class="catlist">${sp.map(catRow).join('')}</div>`;
    if (en.length) html += `<h2>Entrate</h2><div class="catlist">${en.map(catRow).join('')}</div>`;
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
      const out = Core.round2(list.filter((m) => Core.tipoOf(S, m.categoria) !== 'Entrata').reduce((s, m) => s + m.importo, 0));
      html += `<div class="group"><h3><span>${Core.MESI[+k.slice(5) - 1]} ${k.slice(0, 4)}</span><span class="num">Uscite ${E(out)}</span></h3><div class="list">`;
      for (const m of list) {
        const ent = Core.tipoOf(S, m.categoria) === 'Entrata';
        html += `<button class="item" data-id="${esc(m.id)}"><span class="d">${ddmm(m.data)}</span>
          <span class="t"><div>${m.evid ? `<span class="hl">${esc(m.descrizione || m.categoria)}</span>` : esc(m.descrizione || m.categoria)}</div>${m.descrizione ? `<small>${esc(m.categoria)}</small>` : ''}</span>
          <span class="a ${ent ? 'in' : ''}">${ent ? '+' : '−'}${E(m.importo)}</span></button>`;
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
    ent = m ? { id: m.id, tipo: Core.tipoOf(S, m.categoria) || 'Spesa', amt: amtFromNum(m.importo), cat: m.categoria, date: m.data, desc: m.descrizione || '', evid: !!m.evid }
            : { id: null, tipo: 'Spesa', amt: '', cat: null, date: today(), desc: '', evid: false };
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
    const el = $('#amt');
    if (!ent.amt) { el.innerHTML = '<span class="ph">0</span><small>€</small>'; return; }
    const [i, d] = ent.amt.split(',');
    const intTxt = Number(i || '0').toLocaleString('it-IT');
    el.innerHTML = `${intTxt}${ent.amt.includes(',') ? ',' + d : ''}<small>€</small>`;
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
    b.textContent = ent.id ? 'Salva modifiche' : ent.tipo === 'Entrata' ? 'Salva entrata' : 'Salva spesa';
  }
  $('#tSpesa').onclick = () => { if (ent.tipo !== 'Spesa') { ent.tipo = 'Spesa'; ent.cat = null; renderEntry(); } };
  $('#tEntrata').onclick = () => { if (ent.tipo !== 'Entrata') { ent.tipo = 'Entrata'; ent.cat = null; renderEntry(); } };
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
    const v = Core.round2(amtValue()); if (!(v > 0) || !ent.cat) return;
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
      msg = ent.tipo === 'Entrata' ? 'Entrata salvata' : 'Spesa salvata';
    }
    save(); closeEntry(); renderAll(); toast(`${msg}: ${E(v)}`);
  };
  $('#shDel').onclick = () => {
    if (!ent || !ent.id || !confirm('Eliminare questo movimento?')) return;
    S.movimenti = S.movimenti.filter((m) => m.id !== ent.id);
    save(); closeEntry(); renderAll(); toast('Movimento eliminato');
  };

  /* ---------- impostazioni ---------- */
  let ovSel = null;
  function renderSet() {
    const ds = daysSince(S.lastExport);
    $('#lastExp').textContent = ds === null ? 'Nessun Excel esportato finora.' : ds === 0 ? 'Ultimo Excel esportato oggi.' : `Ultimo Excel esportato ${ds === 1 ? 'ieri' : ds + ' giorni fa'}.`;
    $('#sAnno').value = S.anno;
    // categorie
    let h = S.categorie.map((c, i) => `<div class="ed" data-i="${i}">
      <div class="l1"><input data-k="nome" value="${esc(c.nome)}" aria-label="Nome categoria"><button class="x" data-act="del" aria-label="Elimina ${esc(c.nome)}">×</button></div>
      <div class="l2"><select data-k="tipo" aria-label="Tipo"><option ${c.tipo === 'Spesa' ? 'selected' : ''}>Spesa</option><option ${c.tipo === 'Entrata' ? 'selected' : ''}>Entrata</option></select>
      <input data-k="budget" class="num" inputmode="decimal" placeholder="Budget €" value="${c.budget === null || c.budget === undefined ? '' : String(c.budget).replace('.', ',')}" aria-label="Budget variabile mensile">
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
    if (!ovSel || !S.categorie.some((c) => c.nome === ovSel)) ovSel = S.categorie[0] ? S.categorie[0].nome : null;
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
      if (!$('#v-xls').classList.contains('on')) show('v-xls');
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
  function renderAll() { renderMese(); renderMov(); renderSet(); }
  renderAll();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
