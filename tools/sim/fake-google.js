'use strict';
/*
 * Simulação LOCAL dos serviços do Google usados pelo Pulso v3, para rodar o
 * código real do Apps Script no Node. Serve para desenvolvimento e testes
 * automatizados. NÃO substitui o teste na implantação real.
 *
 * Imita dois comportamentos do Sheets que importam para a v3:
 *  - texto que começa com apóstrofo é gravado como texto, sem o apóstrofo;
 *  - texto com cara de data/decimal em coluna SEM formato '@' é convertido
 *    (é o que corrompeu a coluna Media da v2). Fórmulas viram '#FORMULA:'.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

class Range {
  constructor(sheet, r, c, nr = 1, nc = 1) { Object.assign(this, { sheet, r, c, nr, nc }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = this.sheet.rows[this.r - 1 + i] || [];
      const linha = [];
      for (let j = 0; j < this.nc; j++) {
        const v = row[this.c - 1 + j];
        linha.push(v === undefined || v === null ? '' : v);
      }
      out.push(linha);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    for (let i = 0; i < this.nr; i++) {
      while (this.sheet.rows.length < this.r + i) this.sheet.rows.push([]);
      const row = this.sheet.rows[this.r - 1 + i];
      for (let j = 0; j < this.nc; j++) {
        row[this.c - 1 + j] = this.sheet.converter(vals[i][j], this.sheet.formato(this.r + i, this.c + j));
      }
    }
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat(f) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.formatos[(this.r + i) + ':' + (this.c + j)] = f;
    for (let j = 0; j < this.nc; j++) if (this.nr >= 1000) this.sheet.formatosColuna[this.c + j] = f;
    return this;
  }
  setNumberFormats(fs2) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) this.sheet.formatos[(this.r + i) + ':' + (this.c + j)] = fs2[i][j];
    return this;
  }
}

class Sheet {
  constructor(name, rows) { this.name = name; this.rows = rows || []; this.formatos = {}; this.formatosColuna = {}; this.escritas = 0; }
  getName() { return this.name; }
  formato(r, c) { return this.formatos[r + ':' + c] || this.formatosColuna[c] || 'General'; }
  converter(v, fmt) {
    this.escritas++;
    if (typeof v !== 'string') return v;
    if (v.startsWith("'")) return v.slice(1);
    if (v.startsWith('=')) return '#FORMULA:' + v;
    if (fmt === '@') return v;
    // Comportamento da localidade pt_BR com formato automático:
    if (/^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v) || /^\d{1,2}\.\d{1,2}$/.test(v)) {
      return new Date('2000-01-01T00:00:00Z'); // virou data: o defeito da v2
    }
    if (/^-?\d+$/.test(v)) return Number(v);
    if (v === 'TRUE') return true;
    if (v === 'FALSE') return false;
    return v;
  }
  getLastRow() {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      if ((this.rows[i] || []).some(v => v !== '' && v !== undefined && v !== null)) return i + 1;
    }
    return 0;
  }
  getLastColumn() { return this.rows.reduce((m, r) => Math.max(m, (r || []).length), 0); }
  getRange(r, c, nr, nc) {
    if (r < 1 || c < 1) throw new Error('Range inválido');
    return new Range(this, r, c, nr || 1, nc || 1);
  }
  insertRowBefore(r) {
    this.rows.splice(r - 1, 0, []);
    const novos = {};
    for (const [k, f] of Object.entries(this.formatos)) {
      const [rr, cc] = k.split(':').map(Number);
      novos[(rr >= r ? rr + 1 : rr) + ':' + cc] = f;
    }
    this.formatos = novos;
  }
  setFrozenRows() {}
}

class Spreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(n) { return this.sheets.get(n) || null; }
  insertSheet(n) { const s = new Sheet(n); this.sheets.set(n, s); return s; }
}

function formatDate(date, tz, fmt) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(date).map(x => [x.type, x.value]));
  const H = p.hour === '24' ? '00' : p.hour;
  return fmt.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', H).replace('mm', p.minute);
}

function escapar(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/*
 * Carrega um projeto (pasta apps-script/publico ou /painel) num contexto
 * isolado com os serviços simulados. Retorna { ctx, estado }.
 */
function carregarProjeto(dir, estado) {
  const html = name => fs.readFileSync(path.join(dir, name + '.html'), 'utf8');
  function HtmlOutput(content) {
    this.content = content;
    this.getContent = () => this.content;
    this.setTitle = t => { this.title = t; return this; };
    this.addMetaTag = () => this;
  }
  const ctx = {
    console,
    SpreadsheetApp: { openById: id => { if (id !== estado.planilhaId) throw new Error('Planilha não encontrada: ' + id); return estado.ss; } },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => estado.props[k] || null }) },
    Session: { getActiveUser: () => ({ getEmail: () => estado.email || '' }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: k => estado.cache.get(k) || null, put: (k, v) => estado.cache.set(k, v) }) },
    Utilities: { formatDate: (d, tz, f) => formatDate(estado.agora ? estado.agora() : d, tz, f), getUuid: () => crypto.randomUUID() },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: s => ({ content: s, setMimeType(m) { this.mime = m; return this; } })
    },
    HtmlService: {
      createHtmlOutputFromFile: n => new HtmlOutput(html(n)),
      createHtmlOutput: s => new HtmlOutput(s),
      createTemplateFromFile: n => {
        const tpl = {};
        tpl.evaluate = () => {
          const fonte = html(n);
          const vars = Object.assign({}, tpl);
          delete vars.evaluate;
          const avaliar = expr => vm.runInContext('(function(v){with(v){return (' + expr + ');}})', ctx)(vars);
          const out = fonte
            .replace(/<\?!=([\s\S]*?)\?>/g, (_, e) => String(avaliar(e)))
            .replace(/<\?=([\s\S]*?)\?>/g, (_, e) => escapar(avaliar(e)));
          return new HtmlOutput(out);
        };
        return tpl;
      }
    },
    MailApp: { sendEmail: m => { (estado.emails = estado.emails || []).push(m); } },
    ScriptApp: {
      WeekDay: { MONDAY: 'MONDAY' },
      getProjectTriggers: () => (estado.gatilhos || []).map(g => ({ getHandlerFunction: () => g.fn, _g: g })),
      deleteTrigger: t => { estado.gatilhos = (estado.gatilhos || []).filter(g => g !== t._g); },
      newTrigger: fn => { const g = { fn }; const b = { timeBased: () => b, onWeekDay: d => { g.dia = d; return b; }, atHour: h => { g.hora = h; return b; }, inTimezone: z => { g.tz = z; return b; }, create: () => { (estado.gatilhos = estado.gatilhos || []).push(g); return g; } }; return b; }
    },
    Math, JSON, Date, Object, Array, String, Number, Error, RegExp, isFinite, parseInt
  };
  vm.createContext(ctx);
  const ordem = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  for (const f of ordem) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  return ctx;
}

function novoEstado() {
  return { planilhaId: 'PLANILHA_SIMULADA', ss: new Spreadsheet(), props: { PLANILHA_ID: 'PLANILHA_SIMULADA' }, cache: new Map(), email: '' };
}

module.exports = { carregarProjeto, novoEstado, Spreadsheet, Sheet, formatDate };
