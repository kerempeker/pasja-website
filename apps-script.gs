// ════════════════════════════════════════════════════════════
//  PASJA — Google Apps Script (Menu + Admin)
//  Mevcut script'in tamamını SİL, bunu yapıştır.
//
//  Kurulum:
//   1) Bu kodu Apps Script editörüne yapıştır
//   2) Sol menüden "Project Settings" (dişli) → "Script Properties"
//      → "Edit" → Property: ADMIN_PASSWORD, Value: <şifren>
//   3) Üst menü: Deploy → Manage deployments → kalemden düzenle
//      → Version: New version → Deploy
//   4) URL aynı kalır. admin.html'i aç, şifreyle gir.
//   5) Ayarlar sayfası ilk tema seçiminde otomatik oluşur.
// ════════════════════════════════════════════════════════════

const SHEET_URUN   = 'Menu_Urunleri';
const SHEET_RENK   = 'Kategori_Renkleri';
const SHEET_KAT    = 'Kategori_Yonetimi';
const SHEET_AYAR   = 'Ayarlar';
const VERSION_CELL = 'A1';
const VALID_THEMES = ['cyber','apothecary','editorial','vintage','botanical'];

// ────────────────────────────────────────────
//  doGet — menüye veri sağlar
// ────────────────────────────────────────────
function doGet(e) {
  if (!e || !e.parameter) return json({ error: 'Parametre gerekli' });
  const action = e.parameter.action;
  try {
    if (action === 'version') return getMenuVersion();
    if (action === 'renkler') return getMarkaRenkleri();
    if (action === 'sirala')  return getKategoriSiralamasi();
    if (action === 'tema')    return getTema();
    if (!action)              return getMenuUrunleri();
    return json({ error: 'Bilinmeyen action: ' + action });
  } catch (err) {
    Logger.log('doGet hata: ' + err.message);
    return json({ error: 'Sunucu hatası: ' + err.message });
  }
}

// ────────────────────────────────────────────
//  doPost — admin panel CRUD
//  Body: text/plain, JSON: { action, password, ...payload }
// ────────────────────────────────────────────
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json({ error: 'Boş istek' });
    const body = JSON.parse(e.postData.contents);

    if (!checkPassword(body.password)) return json({ error: 'unauthorized' });

    const a = body.action;
    if (a === 'login')          return json({ ok: true });
    if (a === 'addUrun')        return addUrun(body.urun);
    if (a === 'updateUrun')     return updateUrun(body.original, body.urun);
    if (a === 'deleteUrun')     return deleteUrun(body.urun_adi, body.marka);
    if (a === 'addMarka')       return addMarka(body.marka, body.renk);
    if (a === 'updateMarka')    return updateMarka(body.original, body.marka, body.renk);
    if (a === 'deleteMarka')    return deleteMarka(body.marka);
    if (a === 'addKategori')    return addKategori(body.kategori);
    if (a === 'updateKategori') return updateKategori(body.original, body.kategori);
    if (a === 'deleteKategori') return deleteKategori(body.kategori);
    if (a === 'reorderKategoriler') return reorderKategoriler(body.items);
    if (a === 'setTema')        return setTema(body.tema);
    return json({ error: 'Bilinmeyen action: ' + a });
  } catch (err) {
    Logger.log('doPost hata: ' + err.message + '\n' + err.stack);
    return json({ error: 'Sunucu hatası: ' + err.message });
  }
}

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function checkPassword(pw) {
  const saved = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!saved) return false;
  return String(pw) === String(saved);
}

function getSheet(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Sayfa bulunamadı: ' + name);
  return sh;
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

function bumpVersion() {
  try {
    getSheet(SHEET_URUN).getRange(VERSION_CELL).setValue(new Date().toISOString());
  } catch (e) {}
}

// ════════════════════════════════════════════
//  GET — VERSION / MENU / RENKLER / SIRALA / TEMA
// ════════════════════════════════════════════
function getMenuVersion() {
  try {
    const v = getSheet(SHEET_URUN).getRange(VERSION_CELL).getValue();
    return json({ version: (v !== '' && v !== null) ? v : 'unknown' });
  } catch (err) { return json({ error: err.message }); }
}

function getMenuUrunleri() {
  try {
    const sh = getSheet(SHEET_URUN);
    const last = sh.getLastRow();
    if (last < 2) return json([]);
    const data = sh.getRange(2, 1, last - 1, 11).getValues();
    const headers = ['urun_adi','marka','ana_kategori','fiyat_1gr','thc_orani','fiyat_5gr','stok_var_mi','yeni_mi','korting','fiyat_4','pasja_speciaal'];
    const out = data.map(row => {
      const obj = {};
      headers.forEach((k, i) => obj[k] = row[i]);
      obj.stok_var_mi    = (row[6] === true || row[6] === 'TRUE');
      obj.yeni_mi        = (row[7] === true || row[7] === 'TRUE');
      obj.korting        = (row[8] === true || row[8] === 'TRUE');
      obj.pasja_speciaal = (row[10] === true || row[10] === 'TRUE');
      return obj;
    });
    return json(out);
  } catch (err) { return json({ error: err.message }); }
}

function getMarkaRenkleri() {
  try {
    const sh = getSheet(SHEET_RENK);
    const last = sh.getLastRow();
    if (last < 2) return json({});
    const data = sh.getRange(2, 1, last - 1, 2).getValues();
    const out = {};
    data.forEach(r => {
      const m = r[0] ? String(r[0]).trim() : '';
      const c = r[1] ? String(r[1]).trim() : '';
      if (m && c) out[m] = c;
    });
    return json(out);
  } catch (err) { return json({ error: err.message }); }
}

function getKategoriSiralamasi() {
  try {
    const sh = getSheet(SHEET_KAT);
    const last = sh.getLastRow();
    if (last < 2) return json([]);
    const data = sh.getRange(2, 1, last - 1, 7).getValues();
    const out = data.map(r => {
      const k = r[0] ? String(r[0]).trim() : null;
      const s = Number(r[1]);
      const n = Number(r[2]);
      if (!k || isNaN(s) || isNaN(n)) return null;
      return {
        kategori: k,
        sutun_no: s,
        sira_no: n,
        header_1: r[3] ? String(r[3]).trim() : '',
        header_2: r[4] ? String(r[4]).trim() : '',
        header_3: r[5] ? String(r[5]).trim() : '',
        header_4: r[6] ? String(r[6]).trim() : ''
      };
    }).filter(Boolean);
    return json(out);
  } catch (err) { return json({ error: err.message }); }
}

function getTema() {
  try {
    const sh = getOrCreateSheet(SHEET_AYAR, ['key','value']);
    const last = sh.getLastRow();
    if (last < 2) return json({ tema: 'cyber' });
    const data = sh.getRange(2, 1, last - 1, 2).getValues();
    const row = data.find(r => String(r[0]).trim().toLowerCase() === 'tema');
    return json({ tema: row ? String(row[1]).trim() : 'cyber' });
  } catch (err) { return json({ error: err.message }); }
}

// ════════════════════════════════════════════
//  ÜRÜN CRUD
// ════════════════════════════════════════════
function addUrun(u) {
  if (!u || !u.urun_adi || !u.marka || !u.ana_kategori) return json({ error: 'Eksik alan' });
  const sh = getSheet(SHEET_URUN);
  sh.appendRow(urunToRow(u));
  bumpVersion();
  return json({ ok: true });
}

function updateUrun(original, u) {
  if (!original || !original.urun_adi) return json({ error: 'original eksik' });
  const sh = getSheet(SHEET_URUN);
  const row = findUrunRow(sh, original.urun_adi, original.marka);
  if (row < 0) return json({ error: 'Ürün bulunamadı' });
  sh.getRange(row, 1, 1, 11).setValues([urunToRow(u)]);
  bumpVersion();
  return json({ ok: true });
}

function deleteUrun(urun_adi, marka) {
  const sh = getSheet(SHEET_URUN);
  const row = findUrunRow(sh, urun_adi, marka);
  if (row < 0) return json({ error: 'Ürün bulunamadı' });
  sh.deleteRow(row);
  bumpVersion();
  return json({ ok: true });
}

function findUrunRow(sh, urun_adi, marka) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const data = sh.getRange(2, 1, last - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    const ua = String(data[i][0]).trim();
    const mk = String(data[i][1]).trim();
    if (ua === String(urun_adi).trim() && (!marka || mk === String(marka).trim())) {
      return i + 2;
    }
  }
  return -1;
}

function urunToRow(u) {
  const num = (v) => (v === '' || v === undefined || v === null) ? '' : Number(v);
  return [
    u.urun_adi || '',
    u.marka || '',
    u.ana_kategori || '',
    num(u.fiyat_1gr),
    u.thc_orani || '',
    num(u.fiyat_5gr),
    u.stok_var_mi !== false,
    !!u.yeni_mi,
    !!u.korting,
    num(u.fiyat_4),
    !!u.pasja_speciaal
  ];
}

// ════════════════════════════════════════════
//  MARKA CRUD
// ════════════════════════════════════════════
function addMarka(marka, renk) {
  if (!marka || !renk) return json({ error: 'Eksik alan' });
  const sh = getSheet(SHEET_RENK);
  if (findMarkaRow(sh, marka) > 0) return json({ error: 'Marka zaten var' });
  sh.appendRow([marka, renk]);
  bumpVersion();
  return json({ ok: true });
}

function updateMarka(originalName, newName, newColor) {
  const sh = getSheet(SHEET_RENK);
  const row = findMarkaRow(sh, originalName);
  if (row < 0) return json({ error: 'Marka bulunamadı' });
  sh.getRange(row, 1, 1, 2).setValues([[newName, newColor]]);
  // İsim değiştiyse Menu_Urunleri'nde cascade
  if (originalName !== newName) {
    const us = getSheet(SHEET_URUN);
    const last = us.getLastRow();
    if (last >= 2) {
      const data = us.getRange(2, 2, last - 1, 1).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(originalName).trim()) {
          us.getRange(i + 2, 2).setValue(newName);
        }
      }
    }
  }
  bumpVersion();
  return json({ ok: true });
}

function deleteMarka(marka) {
  const sh = getSheet(SHEET_RENK);
  const row = findMarkaRow(sh, marka);
  if (row < 0) return json({ error: 'Marka bulunamadı' });
  sh.deleteRow(row);
  bumpVersion();
  return json({ ok: true });
}

function findMarkaRow(sh, marka) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const data = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(marka).trim()) return i + 2;
  }
  return -1;
}

// ════════════════════════════════════════════
//  KATEGORI CRUD
// ════════════════════════════════════════════
function addKategori(k) {
  if (!k || !k.kategori) return json({ error: 'Eksik alan' });
  const sh = getSheet(SHEET_KAT);
  if (findKategoriRow(sh, k.kategori) > 0) return json({ error: 'Kategori zaten var' });
  sh.appendRow([
    k.kategori,
    Number(k.sutun_no) || 1,
    Number(k.sira_no) || 1,
    k.header_1 || '',
    k.header_2 || '',
    k.header_3 || '',
    k.header_4 || ''
  ]);
  bumpVersion();
  return json({ ok: true });
}

function updateKategori(original, k) {
  if (!original || !original.kategori) return json({ error: 'original eksik' });
  const sh = getSheet(SHEET_KAT);
  const row = findKategoriRow(sh, original.kategori);
  if (row < 0) return json({ error: 'Kategori bulunamadı' });
  sh.getRange(row, 1, 1, 7).setValues([[
    k.kategori,
    Number(k.sutun_no),
    Number(k.sira_no),
    k.header_1 || '',
    k.header_2 || '',
    k.header_3 || '',
    k.header_4 || ''
  ]]);
  if (original.kategori !== k.kategori) {
    const us = getSheet(SHEET_URUN);
    const last = us.getLastRow();
    if (last >= 2) {
      const data = us.getRange(2, 3, last - 1, 1).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][0]).trim() === String(original.kategori).trim()) {
          us.getRange(i + 2, 3).setValue(k.kategori);
        }
      }
    }
  }
  bumpVersion();
  return json({ ok: true });
}

function deleteKategori(kategori) {
  const sh = getSheet(SHEET_KAT);
  const row = findKategoriRow(sh, kategori);
  if (row < 0) return json({ error: 'Kategori bulunamadı' });
  sh.deleteRow(row);
  bumpVersion();
  return json({ ok: true });
}

/**
 * Sıralama ve sütun değişikliklerini batch olarak günceller.
 * items: [{ kategori, sutun_no, sira_no }, ...]
 * Sadece B ve C sütunlarını yazar; başlıklar (D-G) korunur.
 */
function reorderKategoriler(items) {
  if (!Array.isArray(items) || items.length === 0) return json({ ok: true });
  const sh = getSheet(SHEET_KAT);
  const last = sh.getLastRow();
  if (last < 2) return json({ error: 'Kategori_Yonetimi boş' });

  const names = sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0] || '').trim());
  const updates = [];

  items.forEach(it => {
    if (!it || !it.kategori) return;
    const idx = names.indexOf(String(it.kategori).trim());
    if (idx < 0) return;
    updates.push({ row: idx + 2, sutun: Number(it.sutun_no), sira: Number(it.sira_no) });
  });

  updates.forEach(u => {
    sh.getRange(u.row, 2, 1, 2).setValues([[u.sutun, u.sira]]);
  });

  bumpVersion();
  return json({ ok: true, updated: updates.length });
}

function findKategoriRow(sh, kategori) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const data = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(kategori).trim()) return i + 2;
  }
  return -1;
}

// ════════════════════════════════════════════
//  TEMA
// ════════════════════════════════════════════
function setTema(tema) {
  if (!VALID_THEMES.includes(tema)) return json({ error: 'Geçersiz tema' });
  const sh = getOrCreateSheet(SHEET_AYAR, ['key','value']);
  const last = sh.getLastRow();
  let foundRow = -1;
  if (last >= 2) {
    const data = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim().toLowerCase() === 'tema') { foundRow = i + 2; break; }
    }
  }
  if (foundRow > 0) sh.getRange(foundRow, 2).setValue(tema);
  else sh.appendRow(['tema', tema]);
  return json({ ok: true });
}
