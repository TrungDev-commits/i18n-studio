const fs = require('fs');
const path = require('path');
const compiler = require('vue-template-compiler');
const babel = require('@babel/parser');

const VN_RX = /[àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵÀẢÃÁẠĂẰẲẴẮẶÂẦẨẪẤẬĐÈẺẼÉẸÊỀỂỄẾỆÌỈĨÍỊÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢÙỦŨÚỤƯỪỬỮỨỰỲỶỸÝỴ]/;
const RUN_RX = /[A-Za-z0-9_À-ỹ][A-Za-z0-9_À-ỹ\s.,:;()&\-'/%\u2013\u2014\u2026\u2022]*/g;

const TRANSLATABLE_ATTRS = new Set([
  'title', 'placeholder', 'alt', 'label', 'aria-label', 'arial-label',
  'data-title', 'data-label', 'data-tooltip', 'tooltip', 'hint'
]);

function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('_');
}

function escapePhp(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function findRuns(text, cb) {
  RUN_RX.lastIndex = 0;
  let m;
  while ((m = RUN_RX.exec(text))) {
    const run = m[0].trim();
    if (run.length < 2 || !VN_RX.test(run)) continue;
    const relStart = m.index + m[0].indexOf(run);
    cb(run, relStart);
  }
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAllMatches(str, re) {
  const out = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(str))) out.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  return out;
}

function nearestMatch(matches, approx) {
  let best = null;
  let bestDist = Infinity;
  for (const m of matches) {
    const d = Math.abs(m.start - approx);
    if (d < bestDist) {
      bestDist = d;
      best = m;
    }
  }
  return best;
}

function locateAttr(content, name, value, approx) {
  const re = new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*["']${escapeRegExp(value)}["']`, 'g');
  return nearestMatch(findAllMatches(content, re), approx);
}

function extractTemplate(tpl, parseSrc, file, occurrences, reviews) {
  if (!tpl || typeof tpl.start !== 'number') return;
  const contentStart = tpl.start;
  const content = typeof tpl.end === 'number' ? parseSrc.slice(contentStart, tpl.end) : tpl.content || '';
  if (!content.trim()) return;

  let compiled;
  try {
    compiled = compiler.compile(content, { outputSourceRange: true });
  } catch (e) {
    reviews.push({ file, msg: `Không compile được template: ${e.message}` });
    return;
  }
  if (compiled.errors && compiled.errors.length) {
    reviews.push({ file, msg: `Template có lỗi: ${compiled.errors[0].msg}` });
  }

  const handleAttr = (attr) => {
    const name = attr.name;
    const value = attr.value;
    if (!value || !VN_RX.test(value)) return;
    const isBound = name.startsWith(':') || name.startsWith('v-bind:');
    let vi;
    let attrName;
    if (isBound) {
      if (/^v-(html|text)$/.test(name)) return;
      const m = /^(['"])(.*)\1$/s.exec(value.trim());
      if (!m) {
        reviews.push({ file, msg: `Biểu thức thuộc tính ${name} phức tạp: ${JSON.stringify(value)}` });
        return;
      }
      vi = m[2];
      if (!VN_RX.test(vi)) return;
      attrName = name.replace(/^v-bind:/, ':');
    } else {
      if (!TRANSLATABLE_ATTRS.has(name)) return;
      vi = value;
      attrName = ':' + name;
    }
    if (/\{[\sA-Za-z0-9_]+\}/.test(vi)) {
      reviews.push({ file, msg: `Chuỗi thuộc tính có tham số: ${JSON.stringify(vi)}` });
      return;
    }
    const match = locateAttr(content, name, isBound ? value.trim() : value, attr.start);
    if (!match) return;
    occurrences.push({
      file,
      start: contentStart + match.start,
      end: contentStart + match.end,
      verifyOriginal: match.text,
      vi,
      kind: 'template-attr',
      attrName,
    });
  };

  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.type === 3 && typeof n.text === 'string' && !n.isComment) {
      const text = n.text;
      if (!VN_RX.test(text)) return;
      const re = new RegExp(escapeRegExp(text), 'g');
      const match = nearestMatch(findAllMatches(content, re), n.start || 0);
      if (!match) return;
      const textStart = match.start;
      findRuns(text, (run, relStart) => {
        const abs = contentStart + textStart + relStart;
        const absEnd = abs + run.length;
        if (parseSrc.slice(abs, absEnd) !== run) return;
        occurrences.push({ file, start: abs, end: absEnd, verifyOriginal: run, vi: run, kind: 'template-text' });
      });
      return;
    }
    if (n.type === 1) {
      (n.attrsList || []).forEach(handleAttr);
      (n.children || []).forEach(walk);
    }
    (n.ifConditions || []).forEach((c) => c.block && c.block !== n && walk(c.block));
  };
  walk(compiled.ast);
}

function isFunctionLike(node) {
  return (
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'ObjectMethod' ||
    node.type === 'ClassMethod' ||
    node.type === 'ClassPrivateMethod'
  );
}

function extractScript(block, parseSrc, file, occurrences, reviews) {
  const contentStart = typeof block.start === 'number' ? block.start : 0;
  const content = typeof block.end === 'number' ? parseSrc.slice(contentStart, block.end) : block.content || '';
  if (!content.trim()) return;

  let ast;
  try {
    ast = babel.parse(content, { sourceType: 'module', allowReturnOutsideFunction: true });
  } catch (e) {
    try {
      ast = babel.parse(content, { sourceType: 'script', allowReturnOutsideFunction: true });
    } catch (e2) {
      reviews.push({ file, msg: `Không parse được <script>: ${e2.message}` });
      return;
    }
  }

  const state = { inFunction: 0 };

  const handleLiteral = (node, parent, valueOverride) => {
    const value = valueOverride !== undefined ? valueOverride : node.value;
    if (typeof value !== 'string') return;
    if (value.length < 2 || !VN_RX.test(value)) return;
    if (value.startsWith('messages.')) return;
    const raw = content.slice(node.start, node.end);
    const start = contentStart + node.start;
    if (parseSrc.slice(start, start + raw.length) !== raw) return;

    occurrences.push({
      file,
      start,
      end: start + raw.length,
      verifyOriginal: raw,
      vi: value,
      kind: file.endsWith('.vue') ? 'vue-script' : 'js-script',
    });
  };

  const walk = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, parent));
      return;
    }
    if (node.type === 'StringLiteral') {
      handleLiteral(node, parent);
      return;
    }
    const wasFn = isFunctionLike(node);
    if (wasFn) state.inFunction++;
    const nextParent = node;
    for (const key of Object.keys(node)) {
      if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
      const v = node[key];
      if (v && typeof v === 'object') walk(v, nextParent);
    }
    if (wasFn) state.inFunction--;
  };
  walk(ast, null);
}

function extractFile(file, occurrences, reviews) {
  const fileSrc = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  if (ext === '.vue') {
    const parseSrc = fileSrc.replace(/\r\n/g, '\n');
    let sfc;
    try {
      sfc = compiler.parseComponent(parseSrc);
    } catch (e) {
      reviews.push({ file, msg: `Không parse được SFC: ${e.message}` });
      return;
    }
    if (sfc.template) extractTemplate(sfc.template, parseSrc, file, occurrences, reviews);
    if (sfc.script) extractScript(sfc.script, parseSrc, file, occurrences, reviews);
  } else if (ext === '.js') {
    const lfSrc = fileSrc.replace(/\r\n/g, '\n');
    extractScript({ start: 0, end: lfSrc.length }, lfSrc, file, occurrences, reviews);
  }
}

function collectFiles(projectRoot, scanPaths, skipDirs) {
  const skipSet = new Set(skipDirs);
  const files = [];
  const seen = new Set();

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipSet.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(full).toLowerCase();
        if ((ext === '.vue' || ext === '.js') && !seen.has(full)) {
          seen.add(full);
          files.push(full);
        }
      }
    }
  };

  const collectPath = (p) => {
    if (!fs.existsSync(p)) return;
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      walk(p);
    } else if (stat.isFile()) {
      const ext = path.extname(p).toLowerCase();
      if ((ext === '.vue' || ext === '.js') && !seen.has(p)) {
        seen.add(p);
        files.push(p);
      }
    }
  };

  for (const p of scanPaths) {
    const absPath = path.isAbsolute(p) ? p : path.join(projectRoot, p);
    collectPath(absPath);
  }

  // Nếu projectRoot tự thân là một file .vue/.js thì quét trực tiếp file đó
  if (fs.existsSync(projectRoot) && fs.statSync(projectRoot).isFile()) {
    collectPath(projectRoot);
  }

  // Nếu các scanPaths không trỏ tới đâu cả, quét luôn thư mục projectRoot
  if (files.length === 0 && fs.existsSync(projectRoot) && fs.statSync(projectRoot).isDirectory()) {
    walk(projectRoot);
  }

  return files;
}

function readExistingLang(filePath) {
  if (!fs.existsSync(filePath)) {
    return { keys: new Set(), keyValueMap: {}, valueKeyMap: {} };
  }
  const src = fs.readFileSync(filePath, 'utf8');
  const keys = new Set();
  const keyValueMap = {};
  const valueKeyMap = {};
  const re = /^\s*'([^']+)'\s*=>\s*(['"])((?:[^\\]|\\.)*?)\2,/gm;
  let m;
  while ((m = re.exec(src))) {
    const key = m[1];
    let val = m[3];
    if (m[2] === "'") {
      val = val.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    } else {
      val = val.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    keys.add(key);
    keyValueMap[key] = val;
    if (!valueKeyMap[val]) {
      valueKeyMap[val] = key;
    }
  }
  return { keys, keyValueMap, valueKeyMap };
}

function formatReplacement(occ, key) {
  const full = `messages.${key}`;
  switch (occ.kind) {
    case 'template-text':
      return `{{ $t('${full}') }}`;
    case 'template-attr':
      return `${occ.attrName}="$t('${full}')"`;
    case 'vue-script':
      return `this.$t('${full}')`;
    case 'js-script':
      return `window.i18n.t('${full}')`;
    default:
      return `{{ $t('${full}') }}`;
  }
}

module.exports = {
  collectFiles,
  extractFile,
  readExistingLang,
  slugify,
  formatReplacement,
  escapePhp
};
