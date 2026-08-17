const fs = require('fs');
const path = require('path');
const compiler = require('vue-template-compiler');
const babel = require('@babel/parser');

const VN_RX = /[àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵÀẢÃÁẠĂẰẲẴẮẶÂẦẨẪẤẬĐÈẺẼÉẸÊỀỂỄẾỆÌỈĨÍỊÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢÙỦŨÚỤƯỪỬỮỨỰỲỶỸÝỴ]/;
const RUN_RX = /[A-Za-z0-9_À-ỹ][A-Za-z0-9_À-ỹ\s.,:;()&\-'/%\u2013\u2014\u2026\u2022]*/g;

function isTranslationCall(node) {
  if (!node || typeof node !== 'object' || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (!callee) return false;

  let funcName = '';
  if (callee.type === 'Identifier') {
    funcName = callee.name;
  } else if (callee.type === 'MemberExpression') {
    if (callee.property && callee.property.type === 'Identifier') {
      funcName = callee.property.name;
    }
  }

  const translationNames = new Set(['$t', 't', '$tc', '$te', 'trans', '__', 'i18n']);
  if (translationNames.has(funcName)) return true;

  if (callee.type === 'MemberExpression' && callee.object) {
    let objName = '';
    if (callee.object.type === 'Identifier') {
      objName = callee.object.name;
    } else if (callee.object.type === 'MemberExpression' && callee.object.property) {
      objName = callee.object.property.name;
    }
    if (['i18n', '$i18n', 'VueI18n'].includes(objName)) return true;
  }

  return false;
}

function hasTranslationCall(node) {
  if (!node || typeof node !== 'object') return false;
  if (isTranslationCall(node)) return true;

  for (const key of Object.keys(node)) {
    if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const el of v) {
        if (hasTranslationCall(el)) return true;
      }
    } else if (v && typeof v === 'object') {
      if (hasTranslationCall(v)) return true;
    }
  }
  return false;
}

function isNodeInside(target, parentNode) {
  if (!parentNode || typeof parentNode !== 'object') return false;
  if (target === parentNode) return true;
  if (typeof target.start === 'number' && typeof parentNode.start === 'number') {
    return target.start >= parentNode.start && target.end <= parentNode.end;
  }
  return false;
}

function isFallbackForTranslation(node, parent, ancestors = []) {
  const chain = [parent, ...ancestors].filter(Boolean);

  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];

    // 1. LogicalExpression: A || B or A ?? B or A && B
    if (current.type === 'LogicalExpression' && ['||', '??', '&&'].includes(current.operator)) {
      if (hasTranslationCall(current.left) && isNodeInside(node, current.right)) {
        return true;
      }
      if (hasTranslationCall(current.right) && isNodeInside(node, current.left)) {
        return true;
      }
    }

    // 2. ConditionalExpression: test ? consequent : alternate
    if (current.type === 'ConditionalExpression') {
      if (hasTranslationCall(current.test) || hasTranslationCall(current.consequent) || hasTranslationCall(current.alternate)) {
        if (hasTranslationCall(current.test) && (isNodeInside(node, current.consequent) || isNodeInside(node, current.alternate))) {
          return true;
        }
        if (hasTranslationCall(current.consequent) && isNodeInside(node, current.alternate)) {
          return true;
        }
      }
    }

    // 3. CallExpression: $t('key', 'default string') or $t('key', { default: 'default string' })
    if (isTranslationCall(current)) {
      const firstArg = current.arguments && current.arguments[0];
      if (firstArg && !isNodeInside(node, firstArg)) {
        return true;
      }
    }
  }

  return false;
}

function isRunInsideTemplateFallback(text, relStart, runLength) {
  const mustacheRegex = /\{\{([\s\S]*?)\}\}/g;
  let match;
  while ((match = mustacheRegex.exec(text)) !== null) {
    const exprStart = match.index + 2;
    const exprEnd = match.index + match[0].length - 2;
    const runEnd = relStart + runLength;

    if (relStart >= exprStart && runEnd <= exprEnd) {
      const exprStr = match[1];
      try {
        const ast = babel.parseExpression(exprStr, { allowReturnOutsideFunction: true });
        let isFallback = false;
        const walkExpr = (node, parent, ancestors = []) => {
          if (!node || typeof node !== 'object' || isFallback) return;
          if (Array.isArray(node)) {
            node.forEach(n => walkExpr(n, parent, ancestors));
            return;
          }
          if (node.type === 'StringLiteral') {
            const litStartInText = exprStart + node.start;
            const litEndInText = exprStart + node.end;
            if (relStart >= litStartInText && runEnd <= litEndInText) {
              if (isFallbackForTranslation(node, parent, ancestors)) {
                isFallback = true;
                return;
              }
            }
          }
          const nextAncestors = [node, ...ancestors];
          for (const key of Object.keys(node)) {
            if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
            const v = node[key];
            if (v && typeof v === 'object') walkExpr(v, node, nextAncestors);
          }
        };
        walkExpr(ast, null, []);
        if (isFallback) return true;
      } catch (e) {
        if (/(\$t|i18n|trans)\b/.test(exprStr) && (/\|\||\?\?|\?/.test(exprStr))) {
          return true;
        }
      }
    }
  }
  return false;
}

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
      try {
        const exprAst = babel.parseExpression(value.trim());
        if (hasTranslationCall(exprAst)) {
          return;
        }
      } catch (e) {}

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
        if (isRunInsideTemplateFallback(text, relStart, run.length)) return;
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

  const walk = (node, parent, ancestors = []) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, parent, ancestors));
      return;
    }
    if (node.type === 'StringLiteral') {
      if (isFallbackForTranslation(node, parent, ancestors)) return;
      handleLiteral(node, parent);
      return;
    }
    const wasFn = isFunctionLike(node);
    if (wasFn) state.inFunction++;
    const nextAncestors = [node, ...ancestors];
    for (const key of Object.keys(node)) {
      if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
      const v = node[key];
      if (v && typeof v === 'object') walk(v, node, nextAncestors);
    }
    if (wasFn) state.inFunction--;
  };
  walk(ast, null, []);
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

function unescapePhpString(str, quote) {
  if (quote === "'") {
    return str.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  } else {
    return str
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  }
}

function readExistingLang(filePath) {
  const keys = new Set();
  const keyValueMap = {};
  const valueKeyMap = {};

  if (!fs.existsSync(filePath)) {
    return { keys, keyValueMap, valueKeyMap };
  }

  const src = fs.readFileSync(filePath, 'utf8');
  // Loại bỏ comment dòng duy nhất và comment nhiều dòng
  const cleanSrc = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '')
    .replace(/#.*/g, '');

  const tokenRegex = /(['"])((?:[^\\]|\\.)*?)\1|=>|\[|\]|\barray\(|\)/g;
  const tokens = [];
  let m;
  while ((m = tokenRegex.exec(cleanSrc))) {
    if (m[1] !== undefined) {
      tokens.push({ type: 'string', value: unescapePhpString(m[2], m[1]) });
    } else {
      const raw = m[0];
      if (raw === '=>') tokens.push({ type: 'arrow' });
      else if (raw === '[' || raw.startsWith('array')) tokens.push({ type: 'array_start' });
      else if (raw === ']' || raw === ')') tokens.push({ type: 'array_end' });
    }
  }

  const arrayStack = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.type === 'array_start') {
      i++;
      continue;
    }

    if (token.type === 'array_end') {
      if (arrayStack.length > 0) {
        arrayStack.pop();
      }
      i++;
      continue;
    }

    if (token.type === 'string' && i + 1 < tokens.length && tokens[i + 1].type === 'arrow') {
      const keyName = token.value;
      const nextToken = tokens[i + 2];
      if (nextToken) {
        if (nextToken.type === 'array_start') {
          arrayStack.push(keyName);
          i += 3;
          continue;
        } else if (nextToken.type === 'string') {
          const fullKey = arrayStack.length > 0 ? `${arrayStack.join('.')}.${keyName}` : keyName;
          const val = nextToken.value;

          keys.add(fullKey);
          keys.add(`messages.${fullKey}`);
          if (fullKey.startsWith('messages.')) {
            keys.add(fullKey.replace(/^messages\./, ''));
          }

          keyValueMap[fullKey] = val;

          if (!valueKeyMap[val]) valueKeyMap[val] = fullKey;
          const trimmedVal = val.trim();
          if (!valueKeyMap[trimmedVal]) valueKeyMap[trimmedVal] = fullKey;
          const normVal = val.replace(/\s+/g, ' ').trim();
          if (!valueKeyMap[normVal]) valueKeyMap[normVal] = fullKey;

          i += 3;
          continue;
        }
      }
    }
    i++;
  }

  return { keys, keyValueMap, valueKeyMap };
}

function formatReplacement(occ, key) {
  const full = key.startsWith('messages.') ? key : `messages.${key}`;
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
