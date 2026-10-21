const fs = require('fs');
const path = require('path');
const compiler = require('vue-template-compiler');
const babel = require('@babel/parser');

const VN_RX = /[àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵÀẢÃÁẠĂẰẲẴẮẶÂẦẨẪẤẬĐÈẺẼÉẸÊỀỂỄẾỆÌỈĨÍỊÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢÙỦŨÚỤƯỪỬỮỨỰỲỶỸÝỴ]/;
const RUN_RX = /[A-Za-z0-9_À-ỹ][A-Za-z0-9_À-ỹ\s.,:;()&\-'/%\u2013\u2014\u2026\u2022]*/g;

const TRANSLATABLE_ATTRS = new Set([
  'title',
  'placeholder',
  'alt',
  'label',
  'aria-label',
  'arial-label',
  'data-title',
  'data-label',
  'data-tooltip',
  'tooltip',
  'hint',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  'vendor',
  'public',
  'storage',
  '.git',
  '.svn',
  '.idea',
  'dist',
  'build',
  'cache',
]);

const SKIP_FILES = new Set(['vue-i18n-locales.generated.js']);

const PHP_MESSAGE_KEYS = new Set([
  'message',
  'messages',
  'content',
  'msg',
  'msgs',
  'title',
  'error',
  'errors',
  'warning',
  'warnings',
  'alert',
  'notice',
  'notify',
  'notification',
  'notifications',
  'thongbao',
  'thong_bao',
  'thong_bao_loi',
  'description',
  'desc',
  'reason',
  'detail',
  'details',
  'err_msg',
  'errmsg',
  'error_msg',
  'errormessage',
  'error_message',
  'success_msg',
  'successmsg',
  'success_message',
  'status_text',
  'statustext',
  'summary',
  'prompt',
  'note',
  'tooltip',
  'hint',
  'heading',
  'subheading',
  'help',
  'text',
  'label',
  'body',
  'html',
]);

const PHP_VALIDATION_KEY_RX = /^(?:[a-zA-Z0-9_*\[\]\.-]+\.)?(required|required_if|required_unless|required_with|required_with_all|required_without|required_without_all|min|max|numeric|integer|string|email|unique|regex|date|date_format|exists|mimes|between|confirmed|in|not_in|url|digits|digits_between|image|file|accepted|after|before|gt|gte|lt|lte|alpha|alpha_num|alpha_dash|dimensions|distinct|filled|nullable|size|present|timezone|uuid|json|boolean|ip|ipv4|ipv6|active_url|different|same|ends_with|starts_with)$/i;

const PHP_MESSAGE_VAR_RX = /^\$(?:message|messages|msg|msgs|content|error|errors|err|errs|errMsg|errorMessage|error_msg|warning|warnings|thongBao|thongbao|thong_bao|thong_bao_loi|notification|notifications|notice|alert|statusText|status_text|successMsg|success_msg|title|desc|description|note|summary|prompt|failure|failures|log|logs|res|result|results|listError|listErrors|errorList|errorsList)$/i;

const PHP_DATA_KEYS_EXCLUDE = new Set([
  'levelname',
  'level',
  'provincecode',
  'provincename',
  'districtcode',
  'districtname',
  'wardcode',
  'wardname',
  'provinceparent',
  'districtparent',
  'id',
  'code',
  'type',
  'status',
  'name',
  'ten',
  'tencoso',
  'diachi',
  'diachicu',
  'dia_danh',
  'dia_danh_lap_don',
  'table',
  'field',
  'column',
  'key',
  'slug',
  'icon',
  'url',
  'path',
  'toado',
  'polygon',
  'lat',
  'lng',
  'latitude',
  'longitude',
  'header',
  'headers',
  'pathtemplate',
  'exportname',
  'view',
  'layout',
  'model',
  'foreign_key',
  'primary_key',
  'order_by',
]);

function calleeName(callee) {
  if (!callee) return '';
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'ThisExpression') return 'this';
  if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
    const obj = calleeName(callee.object);
    const prop = callee.computed || !callee.property ? '' : callee.property.name;
    return obj ? `${obj}.${prop}` : prop;
  }
  return '';
}

function getRootIdentifierName(node) {
  let curr = node;
  while (curr && (curr.type === 'MemberExpression' || curr.type === 'OptionalMemberExpression')) {
    curr = curr.object;
  }
  return (curr && curr.type === 'Identifier') ? curr.name : '';
}

function isTranslationCall(node) {
  if (!node || typeof node !== 'object') return false;
  let callee = node;
  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    callee = node.callee;
  }
  if (!callee || typeof callee !== 'object') return false;
  const name = calleeName(callee);
  if (name) {
    if (['$t', 't', '$tc', '$te', 'trans', '__', 'i18n', 'this.$t', 'this.$tc', 'this.$te'].includes(name)) return true;
    if (/\b(\$t|t|\$tc|\$te|trans|__)$/.test(name)) return true;
    if (/\.t$/.test(name) || /\.\$t$/.test(name) || /\.\$tc$/.test(name) || /\.\$te$/.test(name) || /\.trans$/.test(name) || /\.__$/.test(name)) return true;
  }
  if (callee.type === 'MemberExpression' || callee.type === 'OptionalMemberExpression') {
    const prop = callee.computed ? '' : (callee.property && callee.property.name);
    if (['$t', 't', '$tc', '$te', 'trans', '__'].includes(prop)) return true;
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

function hasTranslationKey(node) {
  if (!node || typeof node !== 'object') return false;

  if (node.type === 'StringLiteral') {
    const val = node.value;
    if (typeof val === 'string') {
      if (val.startsWith('messages.') || val.startsWith('trans.') || val.startsWith('lang.') || val.startsWith('validation.')) {
        return true;
      }
      if (/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(val)) {
        return true;
      }
    }
  }

  if (node.type === 'Identifier') {
    if (/(?:trans|translation|i18n|msg|message)?key$/i.test(node.name)) return true;
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    const root = getRootIdentifierName(node);
    if (root === 'messages' || root === 'trans' || root === 'i18n') return true;
    const prop = node.computed ? '' : (node.property && node.property.name);
    if (/(?:^|_)(?:key|msg_key|trans_key|title_key)$/i.test(prop)) return true;
  }

  for (const key of Object.keys(node)) {
    if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const el of v) {
        if (hasTranslationKey(el)) return true;
      }
    } else if (v && typeof v === 'object') {
      if (hasTranslationKey(v)) return true;
    }
  }

  return false;
}

function isApiResponseOrMessageNode(node) {
  if (!node || typeof node !== 'object') return false;

  if (node.type === 'TypeCastExpression' || node.type === 'TSAsExpression') {
    return isApiResponseOrMessageNode(node.expression);
  }

  if (node.type === 'LogicalExpression') {
    return isApiResponseOrMessageNode(node.left) || isApiResponseOrMessageNode(node.right);
  }

  if (node.type === 'Identifier') {
    return /^(?:res|response|err|error|errMsg|errorMessage|error_msg|msg|message|thongBao|thong_bao)$/i.test(node.name);
  }

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    const propName = node.computed ? '' : (node.property && node.property.name);
    const isMsgProp = /^(?:message|messages|msg|msgs|error|errors|errMsg|errmsg|errorMessage|error_msg|title|desc|description|detail|details|thongbao|thong_bao|thong_bao_loi|statusText|status_text|success_msg|successMsg|success_message|reason|note|content)$/i.test(propName);

    const rootName = getRootIdentifierName(node);
    const isResponseRoot = /^(?:res|response|err|error|e|exception|data|result|results|payload|xhr|axios)$/i.test(rootName);

    if (isMsgProp) return true;
    if (isResponseRoot && (isMsgProp || propName === 'data' || propName === 'result' || propName === 'body')) return true;
  }

  if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
    const name = calleeName(node.callee);
    if (/(?:error|message|msg|thongbao|thong_bao)/i.test(name)) return true;
  }

  for (const key of Object.keys(node)) {
    if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue;
    const v = node[key];
    if (Array.isArray(v)) {
      for (const el of v) {
        if (isApiResponseOrMessageNode(el)) return true;
      }
    } else if (v && typeof v === 'object') {
      if (isApiResponseOrMessageNode(v)) return true;
    }
  }

  return false;
}

function isFallbackCandidate(node) {
  if (!node || typeof node !== 'object') return false;
  return hasTranslationCall(node) || hasTranslationKey(node) || isApiResponseOrMessageNode(node);
}

function isNodeInside(target, parentNode) {
  if (!parentNode || typeof parentNode !== 'object') return false;
  if (target === parentNode) return true;
  if (typeof target.start === 'number' && typeof parentNode.start === 'number') {
    return target.start >= parentNode.start && target.end <= parentNode.end;
  }
  return false;
}

function isComparison(node, parent, ancestors = []) {
  if (!node) return false;
  const chain = [parent, ...ancestors].filter(Boolean);

  if (parent && parent.type === 'BinaryExpression' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(parent.operator)) {
    return true;
  }

  if (parent && parent.type === 'SwitchCase' && parent.test === node) {
    return true;
  }

  for (const ancestor of chain) {
    if (ancestor.type === 'BinaryExpression' && ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(ancestor.operator)) {
      if (isNodeInside(node, ancestor.left) || isNodeInside(node, ancestor.right)) {
        return true;
      }
    }
  }

  return false;
}

function isFallbackForTranslation(node, parent, ancestors = []) {
  const chain = [parent, ...ancestors].filter(Boolean);

  for (let i = 0; i < chain.length; i++) {
    const current = chain[i];

    if (current.type === 'LogicalExpression' && ['||', '??', '&&'].includes(current.operator)) {
      if (isFallbackCandidate(current.left) && isNodeInside(node, current.right)) return true;
      if (isFallbackCandidate(current.right) && isNodeInside(node, current.left)) return true;
    }

    if (current.type === 'ConditionalExpression') {
      if (isFallbackCandidate(current.test) && (isNodeInside(node, current.consequent) || isNodeInside(node, current.alternate))) {
        return true;
      }
      if (isFallbackCandidate(current.consequent) && isNodeInside(node, current.alternate)) {
        return true;
      }
    }

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
              if (isComparison(node, parent, ancestors) || isFallbackForTranslation(node, parent, ancestors)) {
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
        if (/(\$t|i18n|trans|__|message|error|data|===|!==|==|!=)\b/.test(exprStr) && (/\|\||\?\?|\?|===|!==|==|!=/.test(exprStr))) {
          return true;
        }
      }
    }
  }
  return false;
}

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
  const re = new RegExp(`(?:\\s|^)${escapeRegExp(name)}\\s*=\\s*["']${escapeRegExp(value)}["']`, 'g');
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
      const rawName = name.replace(/^(:|v-bind:)/, '');
      if (!TRANSLATABLE_ATTRS.has(rawName)) return;

      try {
        const exprAst = babel.parseExpression(value.trim());
        if (hasTranslationCall(exprAst) || hasTranslationKey(exprAst) || isApiResponseOrMessageNode(exprAst)) {
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
    if ((n.type === 3 || n.type === 2) && typeof n.text === 'string' && !n.isComment) {
      const text = n.text;
      if (!VN_RX.test(text)) return;
      const trimmedText = text.trim();
      if (!trimmedText) return;

      const re = new RegExp(escapeRegExp(trimmedText), 'g');
      const match = nearestMatch(findAllMatches(content, re), n.start || 0);
      if (!match) {
        findRuns(text, (run, relStart) => {
          if (isRunInsideTemplateFallback(text, relStart, run.length)) return;
          const runRe = new RegExp(escapeRegExp(run), 'g');
          const runMatch = nearestMatch(findAllMatches(content, runRe), (n.start || 0) + relStart);
          if (runMatch) {
            const abs = contentStart + runMatch.start;
            const absEnd = abs + run.length;
            if (parseSrc.slice(abs, absEnd) === run) {
              occurrences.push({ file, start: abs, end: absEnd, verifyOriginal: run, vi: run, kind: 'template-text' });
            }
          }
        });
        return;
      }
      const textStart = match.start;
      const offsetInTrimmed = text.indexOf(trimmedText);

      findRuns(text, (run, relStart) => {
        if (isRunInsideTemplateFallback(text, relStart, run.length)) return;
        const abs = contentStart + textStart + (relStart - offsetInTrimmed);
        const absEnd = abs + run.length;
        if (parseSrc.slice(abs, absEnd) !== run) return;
        occurrences.push({ file, start: abs, end: absEnd, verifyOriginal: run, vi: run, kind: 'template-text' });
      });
      return;
    }
    if (n.type === 1) {
      (n.attrsList || []).forEach(handleAttr);
      (n.children || []).forEach(walk);
      if (n.scopedSlots) {
        Object.keys(n.scopedSlots).forEach((key) => {
          walk(n.scopedSlots[key]);
        });
      }
    }
    (n.ifConditions || []).forEach((c) => c.block && c.block !== n && walk(c.block));
  };
  walk(compiled.ast);
}

function isExcludedParent(parent, node) {
  if (!parent) return false;
  if (parent.type === 'ObjectProperty' && !parent.computed && parent.key === node) return true;
  if (
    parent.type === 'ImportDeclaration' ||
    parent.type === 'ExportNamedDeclaration' ||
    parent.type === 'ExportAllDeclaration'
  ) {
    if (parent.source === node) return true;
  }
  if (parent.type === 'CallExpression' || parent.type === 'OptionalCallExpression') {
    if (parent.callee && isTranslationCall(parent.callee) && node === parent.arguments[0]) return true;
    if (parent.callee && calleeName(parent.callee) === 'require' && node === parent.arguments[0]) return true;
    if (parent.callee && parent.callee.type === 'Import' && node === parent.arguments[0]) return true;
  }
  if (parent.type === 'TaggedTemplateExpression') return true;
  return false;
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
    if (isExcludedParent(parent, node)) return;
    if (value.startsWith('messages.')) return;
    if (/\{[\sA-Za-z0-9_]+\}/.test(value)) {
      reviews.push({ file, msg: `Chuỗi có tham số {param} — duyệt thủ công: ${JSON.stringify(value)}` });
      return;
    }
    const raw = content.slice(node.start, node.end);
    const start = contentStart + node.start;
    if (parseSrc.slice(start, start + raw.length) !== raw) return;

    if (state.inFunction === 0 && file.endsWith('.vue')) {
      reviews.push({ file, msg: `Chuỗi ở phạm vi module (không tự refactor): ${JSON.stringify(value)}` });
      return;
    }

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
      if (isComparison(node, parent, ancestors)) return;
      if (isFallbackForTranslation(node, parent, ancestors)) return;
      handleLiteral(node, parent);
      return;
    }
    if (node.type === 'TemplateLiteral') {
      if (node.expressions && node.expressions.length === 0 && node.quasis && node.quasis.length === 1) {
        if (isComparison(node, parent, ancestors)) return;
        if (isFallbackForTranslation(node, parent, ancestors)) return;
        const val = node.quasis[0].value.cooked;
        handleLiteral(node, parent, val);
      }
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

function maskBlade(src) {
  let masked = src;
  const masks = [
    /<style[\s\S]*?<\/style>/gi,
    /<script[\s\S]*?<\/script>/gi,
    /<!--[\s\S]*?-->/g,
    /\{\{--[\s\S]*?--\}\}/g,
    /@php[\s\S]*?@endphp/g,
    /@\w+/g,
    /\{!![\s\S]*?!!\}/g,
    /\{\{[\s\S]*?\}\}/g,
  ];
  for (const re of masks) masked = masked.replace(re, (m) => '#'.repeat(m.length));
  return masked;
}

function bladeContext(src, idx) {
  for (let i = idx - 1; i >= 0; i--) {
    const c = src[i];
    if (c === '<' || c === '>') return c === '>' ? 'text' : 'attr';
  }
  return 'text';
}

function bladeAttrName(src, idx) {
  let quote = -1;
  for (let i = idx - 1; i >= 0; i--) {
    const c = src[i];
    if (c === '"' || c === "'") {
      quote = i;
      break;
    }
    if (c === '<' || c === '>') return null;
  }
  if (quote < 0) return null;
  const eq = src.lastIndexOf('=', quote - 1);
  if (eq < 0) return null;
  const m = /([A-Za-z][A-Za-z0-9_-]*)\s*$/.exec(src.slice(0, eq));
  return m ? m[1] : null;
}

function extractBlade(fileSrc, file, occurrences, reviews) {
  const masked = maskBlade(fileSrc);
  findRuns(masked, (run, relStart) => {
    const start = relStart;
    const end = start + run.length;
    if (fileSrc.slice(start, end) !== run) return;
    const ctx = bladeContext(masked, start);
    if (ctx === 'attr') {
      const name = bladeAttrName(masked, start);
      if (!name || !TRANSLATABLE_ATTRS.has(name)) return;
      occurrences.push({ file, start, end, verifyOriginal: run, vi: run, kind: 'blade-attr', attrName: name });
    } else {
      occurrences.push({ file, start, end, verifyOriginal: run, vi: run, kind: 'blade-text' });
    }
  });
}

function maskPhpComments(src) {
  let out = '';
  let i = 0;
  const len = src.length;
  while (i < len) {
    const c = src[i];
    if ((c === '/' && src[i + 1] === '/') || c === '#') {
      const startC = i;
      i += (c === '/' ? 2 : 1);
      while (i < len && src[i] !== '\n' && src[i] !== '\r') i++;
      out += ' '.repeat(i - startC);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const startC = i;
      i += 2;
      while (i < len && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += (i < len ? 2 : 0);
      out += ' '.repeat(i - startC);
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      out += c;
      i++;
      let escaped = false;
      while (i < len) {
        const ch = src[i];
        out += ch;
        if (escaped) {
          escaped = false;
        } else if (ch === '\\') {
          escaped = true;
        } else if (ch === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function getPhpTokensBefore(maskedSrc, fromIndex, maxTokens = 40) {
  const tokens = [];
  let i = fromIndex - 1;

  while (i >= 0 && tokens.length < maxTokens) {
    const c = maskedSrc[i];
    if (/\s/.test(c)) {
      i--;
      continue;
    }

    if (i > 0) {
      const two = maskedSrc.slice(i - 1, i + 1);
      if (['=>', '==', '!=', '<=', '>=', '.=', '+=', '-=', '->', '::', '??'].includes(two)) {
        tokens.push(two);
        i -= 2;
        continue;
      }
    }

    if ('=.,()[]{};?:<>!+-*/'.includes(c)) {
      tokens.push(c);
      i--;
      continue;
    }

    if (c === "'" || c === '"') {
      const q = c;
      const endQuote = i;
      i--;
      while (i >= 0) {
        if (maskedSrc[i] === q && maskedSrc[i - 1] !== '\\') break;
        i--;
      }
      const strLiteral = maskedSrc.slice(i, endQuote + 1);
      tokens.push(strLiteral);
      i--;
      continue;
    }

    if (/[a-zA-Z0-9_\x7f-\xff\$]/.test(c)) {
      const endWord = i;
      while (i >= 0 && /[a-zA-Z0-9_\x7f-\xff\$]/.test(maskedSrc[i])) i--;
      const word = maskedSrc.slice(i + 1, endWord + 1);
      tokens.push(word);
      continue;
    }

    i--;
  }

  return tokens;
}

function isPhpComparison(maskedSrc, startPos, endPos) {
  const beforeTokens = getPhpTokensBefore(maskedSrc, startPos, 5);
  if (beforeTokens.length > 0 && ['===', '!==', '==', '!=', '<=', '>=', '<', '>'].includes(beforeTokens[0])) {
    return true;
  }
  let i = endPos;
  while (i < maskedSrc.length && /\s/.test(maskedSrc[i])) i++;
  if (i < maskedSrc.length) {
    const afterTwo = maskedSrc.slice(i, i + 3);
    if (['===', '!=='].includes(afterTwo)) return true;
    const afterRel = maskedSrc.slice(i, i + 2);
    if (['==', '!=', '<=', '>='].includes(afterRel)) return true;
    if (['<', '>'].includes(maskedSrc[i])) return true;
  }
  return false;
}

function isPhpFallbackForTranslation(maskedSrc, startPos) {
  const tokens = getPhpTokensBefore(maskedSrc, startPos, 60);
  if (tokens[0] !== ':' || tokens[1] !== '?') return false;

  let parenDepth = 0;
  let tokenIndex = 2;
  for (; tokenIndex < tokens.length; tokenIndex++) {
    if (tokens[tokenIndex] === ')') parenDepth++;
    else if (tokens[tokenIndex] === '(') {
      parenDepth--;
      if (parenDepth === 0) {
        tokenIndex++;
        break;
      }
    }
  }

  return tokens[tokenIndex] === '__' || tokens[tokenIndex] === 'trans';
}

function isPhpMessageOrValidateContext(maskedSrc, startPos, value) {
  const vnMsgPattern = /(?:^Dòng[\s\d:]|Không tìm thấy|không tìm thấy|bắt buộc|khai báo|không hợp lệ|không được|đã tồn tại|thất bại|thành công|vượt quá|phải là|chưa được|không thể|không có quyền|vui lòng|loại|đối tượng)/i;
  if (value && vnMsgPattern.test(value)) {
    return true;
  }

  const tokens = getPhpTokensBefore(maskedSrc, startPos, 40);
  if (!tokens.length) return false;

  let tIdx = 0;
  let depthParen = 0;
  let depthBracket = 0;

  while (tIdx < tokens.length) {
    const tok = tokens[tIdx];

    if (tok === ';' || tok === '{' || tok === '}') break;

    if (tok === ')') {
      depthParen++;
      tIdx++;
      continue;
    }
    if (tok === '(') {
      if (depthParen > 0) {
        depthParen--;
        tIdx++;
        continue;
      } else {
        if (tIdx === 0) break;
        tIdx++;
        continue;
      }
    }

    if (tok === ']') {
      depthBracket++;
      tIdx++;
      continue;
    }
    if (tok === '[') {
      if (depthBracket > 0) {
        depthBracket--;
        tIdx++;
        continue;
      } else {
        break;
      }
    }

    if (depthParen > 0 || depthBracket > 0) {
      tIdx++;
      continue;
    }

    if (tok === '=>' || tok === '=' || tok === '.=' || tok === ',') break;
    tIdx++;
  }

  const rootTokens = tokens.slice(tIdx);
  if (!rootTokens.length) return false;

  if (rootTokens[0] === '=>') {
    const keyToken = rootTokens[1];
    if (keyToken) {
      const cleanKey = keyToken.replace(/^['"]|['"]$/g, '');
      const cleanKeyLower = cleanKey.toLowerCase();

      if (PHP_DATA_KEYS_EXCLUDE.has(cleanKeyLower)) return false;
      if (PHP_MESSAGE_KEYS.has(cleanKeyLower)) return true;
      if (PHP_VALIDATION_KEY_RX.test(cleanKey)) return true;
    }

    for (let k = 1; k < Math.min(rootTokens.length, 25); k++) {
      const tok = rootTokens[k];
      if (['messages', '$messages', '$customMessages', '$validationMessages', '$errors', '$error', '$err', '$errs'].includes(tok)) {
        return true;
      }
      if (tok === ';' || tok === '{') break;
    }

    return false;
  }

  if (rootTokens[0] === '=' || rootTokens[0] === '.=') {
    let varToken = rootTokens[1];
    if (varToken === ']') {
      let bIdx = 2;
      while (bIdx < rootTokens.length && rootTokens[bIdx] !== '[') bIdx++;
      if (bIdx + 1 < rootTokens.length) {
        varToken = rootTokens[bIdx + 1];
      }
    }
    if (varToken && PHP_MESSAGE_VAR_RX.test(varToken)) return true;
    return false;
  }

  let parenIdx = -1;
  for (let k = 0; k < Math.min(rootTokens.length, 10); k++) {
    if (rootTokens[k] === '(') {
      parenIdx = k;
      break;
    }
    if ([';', '}', '{', '=>'].includes(rootTokens[k])) break;
  }

  if (parenIdx !== -1) {
    const fnTokens = rootTokens.slice(parenIdx + 1);
    if (fnTokens.length > 0) {
      const callSignature = fnTokens.slice(0, 4).reverse().join('');

      if (
        callSignature.includes('CommonUtil::errorresponse') ||
        callSignature.includes('CommonUtil::errorResponse') ||
        callSignature.includes('CommonUtil::successResponse') ||
        callSignature.includes('CommonUtil::successresponse') ||
        callSignature.includes('CommonUtil::response') ||
        callSignature.includes('response') ||
        callSignature.includes('redirect') ||
        callSignature.includes('back')
      ) {
        return true;
      }

      if (callSignature.includes('thrownew') || callSignature.includes('Exception') || callSignature.includes('Error')) {
        return true;
      }

      if (['abort', 'abort_if', 'abort_unless'].includes(fnTokens[0])) return true;

      if (fnTokens[0] === 'with' && fnTokens[1] === '->') return true;

      if (['withErrors', 'withSuccess', 'flash'].includes(fnTokens[0])) return true;

      if (
        ['error', 'info', 'warn', 'warning', 'line', 'comment'].includes(fnTokens[0]) &&
        fnTokens[1] === '->'
      ) {
        return true;
      }

      if (fnTokens[0] === 'add' && fnTokens[1] === '->') return true;
    }
  }

  return false;
}

function extractPhp(fileSrc, file, occurrences, reviews) {
  const maskedSrc = maskPhpComments(fileSrc);
  let i = 0;
  const len = fileSrc.length;
  let phpScopeLevel = 0;

  while (i < len) {
    const c = fileSrc[i];

    if ((c === '/' && fileSrc[i + 1] === '/') || c === '#') {
      i += (c === '/' ? 2 : 1);
      while (i < len && fileSrc[i] !== '\n' && fileSrc[i] !== '\r') i++;
      continue;
    }

    if (c === '/' && fileSrc[i + 1] === '*') {
      i += 2;
      while (i < len && !(fileSrc[i] === '*' && fileSrc[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (c === "'" || c === '"') {
      const quote = c;
      const start = i;
      i++;
      let value = '';
      let escaped = false;
      let isComplexInterpolated = false;
      let braceDepth = 0;

      while (i < len) {
        const ch = fileSrc[i];
        if (escaped) {
          if (quote === "'") {
            if (ch === "'" || ch === '\\') value += ch;
            else value += '\\' + ch;
          } else {
            if (ch === 'n') value += '\n';
            else if (ch === 'r') value += '\r';
            else if (ch === 't') value += '\t';
            else if (ch === '"' || ch === '\\' || ch === '$') value += ch;
            else value += '\\' + ch;
          }
          escaped = false;
          i++;
          continue;
        }

        if (ch === '\\') {
          escaped = true;
          i++;
          continue;
        }

        if (quote === '"') {
          if (ch === '$') {
            isComplexInterpolated = true;
            value += ch;
            i++;
            continue;
          }

          if (ch === '{' && i > 0 && fileSrc[i - 1] === '$') {
            braceDepth++;
            value += ch;
            i++;
            continue;
          }

          if (braceDepth > 0) {
            if (ch === '}') {
              braceDepth--;
              value += ch;
              i++;
              continue;
            }

            if (ch === '"' || ch === "'") {
              const innerQuote = ch;
              value += ch;
              i++;
              let innerEscaped = false;
              while (i < len) {
                const innerCh = fileSrc[i];
                value += innerCh;
                if (innerEscaped) {
                  innerEscaped = false;
                } else if (innerCh === '\\') {
                  innerEscaped = true;
                } else if (innerCh === innerQuote) {
                  i++;
                  break;
                }
                i++;
              }
              continue;
            }
          }

          if (ch === '"' && braceDepth === 0) {
            break;
          }
        } else {
          if (ch === "'") {
            break;
          }
        }

        value += ch;
        i++;
      }

      if (i < len) i++;
      const end = i;
      const raw = fileSrc.slice(start, end);

      if (isPhpFallbackForTranslation(maskedSrc, start)) continue;
      if (isPhpComparison(maskedSrc, start, end)) continue;

      if (VN_RX.test(value) && phpScopeLevel <= 1) {
        reviews.push({ file, msg: `Chuỗi PHP ở thuộc tính lớp (class property) — chuyển vào constructor: ${JSON.stringify(raw)}` });
        continue;
      }

      if (isComplexInterpolated) {
        if (VN_RX.test(value) && isPhpMessageOrValidateContext(maskedSrc, start, value)) {
          const varRegex = /{\$([a-zA-Z0-9_]+)(?:\[['"]?([a-zA-Z0-9_]+)['"]?\]|->([a-zA-Z0-9_]+))?\}|\$([a-zA-Z0-9_]+)(?:\[['"]?([a-zA-Z0-9_]+)['"]?\]|->([a-zA-Z0-9_]+))?/g;
          let match;
          const varObjs = [];
          const seenNames = new Set();
          let finalVi = value;

          while ((match = varRegex.exec(raw))) {
            const fullMatch = match[0];
            const baseVar = match[1] || match[4];
            const arrayKey = match[2] || match[5];
            const propKey = match[3] || match[6];

            if (!baseVar) continue;

            let expr = `$${baseVar}`;
            let placeholderName = baseVar;

            if (arrayKey) {
              expr = `$${baseVar}['${arrayKey}']`;
              placeholderName = (baseVar === 'check' || baseVar === 'data' || baseVar === 'provinceCheck' || baseVar === 'checkWP') ? baseVar : `${baseVar}_${arrayKey}`;
            } else if (propKey) {
              expr = `$${baseVar}->${propKey}`;
              placeholderName = propKey;
            }

            let name = placeholderName;
            let count = 2;
            while (seenNames.has(name)) {
              name = `${placeholderName}_${count}`;
              count++;
            }
            seenNames.add(name);

            varObjs.push({ name, expr });
            finalVi = finalVi.split(fullMatch).join(':' + name);
          }

          if (varObjs.length > 0) {
            occurrences.push({
              file,
              start,
              end,
              verifyOriginal: raw,
              vi: finalVi,
              kind: 'php-interpolated',
              interpolatedVarObjs: varObjs,
              interpolatedVars: varObjs.map(v => v.name),
            });
          } else {
            reviews.push({ file, msg: `Chuỗi PHP double-quote có biến nội suy ($var) — duyệt thủ công: ${JSON.stringify(raw)}` });
          }
        }
        continue;
      }

      if (value.length < 2 || !VN_RX.test(value)) continue;

      let beforeIdx = start - 1;
      while (beforeIdx >= 0 && /\s/.test(fileSrc[beforeIdx])) beforeIdx--;
      if (beforeIdx >= 0 && fileSrc[beforeIdx] === '(') {
        let fnIdx = beforeIdx - 1;
        while (fnIdx >= 0 && /\s/.test(fileSrc[fnIdx])) fnIdx--;
        const fnEnd = fnIdx + 1;
        while (fnIdx >= 0 && /[a-zA-Z0-9_]/.test(fileSrc[fnIdx])) fnIdx--;
        const fnName = fileSrc.slice(fnIdx + 1, fnEnd);
        if (['__', 'trans', '@lang', 't', '$t'].includes(fnName)) continue;
      }

      if (value.startsWith('messages.')) continue;

      if (!isPhpMessageOrValidateContext(maskedSrc, start, value)) continue;

      if (/\{[\sA-Za-z0-9_]+\}/.test(value)) {
        reviews.push({ file, msg: `Chuỗi có tham số {param} — duyệt thủ công: ${JSON.stringify(value)}` });
        continue;
      }

      occurrences.push({
        file,
        start,
        end,
        verifyOriginal: raw,
        vi: value,
        kind: 'php-code',
      });

      continue;
    }

    if (c === '{') phpScopeLevel++;
    else if (c === '}') phpScopeLevel--;

    i++;
  }
}

function isI18nArrayProperty(propName, valExpr) {
  const knownI18nNames = /^(messages|customMessages|validationMessages|errorMessages|labels|attributes|customAttributes|niceNames)$/i;
  if (knownI18nNames.test(propName)) return true;
  if (/['"][a-zA-Z0-9_]+\.[a-zA-Z0-9_]+['"]\s*=>/.test(valExpr)) return true;
  if (/['"]messages\.[a-zA-Z0-9_]+['"]/.test(valExpr)) return true;
  return false;
}

function migrateClassPropertiesToConstructor(fileSrc) {
  const classBodyMatch = /class\s+\w+(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?\s*\{/.exec(fileSrc);
  if (!classBodyMatch) return fileSrc;

  const classBodyStart = classBodyMatch.index + classBodyMatch[0].length;
  const firstMethodMatch = /^\s+((?:abstract|final|static|public|protected|private)\s+)*function\s+\w+\s*\(/m.exec(fileSrc.slice(classBodyStart));
  const scanEnd = firstMethodMatch ? classBodyStart + firstMethodMatch.index : fileSrc.length;

  const propertySection = fileSrc.slice(classBodyStart, scanEnd);
  const propertiesToMigrate = [];

  let si = 0;
  const slen = propertySection.length;

  while (si < slen) {
    if ((propertySection[si] === '/' && propertySection[si + 1] === '/') || propertySection[si] === '#') {
      while (si < slen && propertySection[si] !== '\n') si++;
      continue;
    }
    if (propertySection[si] === '/' && propertySection[si + 1] === '*') {
      si += 2;
      while (si < slen && !(propertySection[si] === '*' && propertySection[si + 1] === '/')) si++;
      si += 2;
      continue;
    }

    const remaining = propertySection.slice(si);
    const propMatch = /^(\s*)(private|protected|public)\s+(?!static\s)\$([a-zA-Z0-9_]+)\s*=\s*/.exec(remaining);
    if (propMatch) {
      const fullMatchText = propMatch[0];
      const leadingWhitespace = propMatch[1];
      const modifier = propMatch[2];
      const propName = propMatch[3];
      const declStart = classBodyStart + si + leadingWhitespace.length;

      let vi = si + fullMatchText.length;
      const valStart = vi;
      let bracketCount = 0;
      let valEnd = -1;

      while (vi < slen) {
        const ch = propertySection[vi];
        if ((ch === '/' && propertySection[vi + 1] === '/') || ch === '#') {
          while (vi < slen && propertySection[vi] !== '\n') vi++;
          continue;
        }
        if (ch === '/' && propertySection[vi + 1] === '*') {
          vi += 2;
          while (vi < slen && !(propertySection[vi] === '*' && propertySection[vi + 1] === '/')) vi++;
          vi += 2;
          continue;
        }
        if (ch === "'" || ch === '"') {
          const q = ch;
          vi++;
          let esc = false;
          while (vi < slen) {
            const c2 = propertySection[vi];
            if (esc) esc = false;
            else if (c2 === '\\') esc = true;
            else if (c2 === q) break;
            vi++;
          }
          if (vi < slen) vi++;
          continue;
        }

        if (ch === '[' || ch === '(') bracketCount++;
        else if (ch === ']' || ch === ')') bracketCount--;
        else if (ch === ';' && bracketCount === 0) {
          valEnd = vi;
          break;
        }
        vi++;
      }

      if (valEnd !== -1) {
        const valExpr = propertySection.slice(valStart, valEnd).trim();
        const declEnd = classBodyStart + valEnd + 1;

        if (VN_RX.test(valExpr) && isI18nArrayProperty(propName, valExpr)) {
          const isArray = valExpr.startsWith('[') || valExpr.startsWith('array(');
          propertiesToMigrate.push({ modifier, name: propName, value: valExpr, start: declStart, end: declEnd, isArray });
        }
      }

      si = (valEnd !== -1 ? (valEnd + 1) : (si + fullMatchText.length));
      continue;
    }

    si++;
  }

  if (propertiesToMigrate.length === 0) return fileSrc;

  propertiesToMigrate.sort((a, b) => b.start - a.start);
  const propsInOrder = [...propertiesToMigrate].reverse();

  let newSrc = fileSrc;
  for (const prop of propertiesToMigrate) {
    const emptyDecl = prop.isArray ? `${prop.modifier} $${prop.name} = [];` : `${prop.modifier} $${prop.name};`;
    newSrc = newSrc.slice(0, prop.start) + emptyDecl + newSrc.slice(prop.end);
  }

  const assignmentBlocks = propsInOrder.map(prop => {
    const indent = '        ';
    const innerIndent = '            ';
    const lines = prop.value.split('\n');
    const indentedValue = lines.map((line, idx) => idx === 0 ? line.trimEnd() : innerIndent + line.trim()).join('\n');
    return `${indent}$this->${prop.name} = ${indentedValue};`;
  });
  const assignmentBlockStr = assignmentBlocks.join('\n');

  const constructRegex = /\bfunction\s+__construct\s*\([^)]*\)\s*\{/;
  const constructMatch = constructRegex.exec(newSrc);

  if (constructMatch) {
    const insertIdx = constructMatch.index + constructMatch[0].length;
    newSrc = newSrc.slice(0, insertIdx) + '\n' + assignmentBlockStr + '\n' + newSrc.slice(insertIdx);
  } else {
    const firstProp = propsInOrder[0];
    const firstPropEmptyDecl = firstProp.isArray
      ? `${firstProp.modifier} $${firstProp.name} = [];`
      : `${firstProp.modifier} $${firstProp.name};`;
    const declIdx = newSrc.indexOf(firstPropEmptyDecl);
    const newConstructor = `\n\n    /**\n     * Create a new controller instance.\n     * @param \\Illuminate\\Http\\Request $request\n     * @return void\n     */\n    public function __construct(\\Illuminate\\Http\\Request $request)\n    {\n${assignmentBlockStr}\n    }`;

    const insertIdx = declIdx !== -1 ? declIdx + firstPropEmptyDecl.length : newSrc.indexOf('{') + 1;
    newSrc = newSrc.slice(0, insertIdx) + newConstructor + newSrc.slice(insertIdx);
  }

  return newSrc;
}

function extractFile(file, occurrences, reviews, isDryRun = false) {
  let fileSrc = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.blade.php')) {
    extractBlade(fileSrc, file, occurrences, reviews);
    return;
  }
  const ext = path.extname(file).toLowerCase();
  if (ext === '.php') {
    const migratedSrc = migrateClassPropertiesToConstructor(fileSrc);
    if (migratedSrc !== fileSrc) {
      if (!isDryRun) {
        fs.writeFileSync(file, migratedSrc, 'utf8');
      }
      fileSrc = migratedSrc;
    }
    extractPhp(fileSrc, file, occurrences, reviews);
  } else if (ext === '.vue') {
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

function normalizePath(p) {
  if (!p) return '';
  let res = String(p).trim();
  if (res.startsWith('file:///')) {
    res = decodeURIComponent(res.slice(8));
  } else if (res.startsWith('file://')) {
    res = decodeURIComponent(res.slice(7));
  }
  if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(res)) {
    res = res.slice(1);
  }
  return res;
}

function isScannableExt(filePath) {
  const base = path.basename(filePath);
  if (base.endsWith('.blade.php')) return true;
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== '.vue' && ext !== '.js' && ext !== '.php') return false;
  if (SKIP_FILES.has(base)) return false;
  if (filePath.includes(path.sep + 'lang' + path.sep)) return false;
  return true;
}

function collectFiles(projectRoot, scanPaths, skipDirs) {
  const skipSet = new Set(skipDirs || []);
  const files = [];
  const seen = new Set();

  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipSet.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && isScannableExt(full) && !seen.has(full)) {
        seen.add(full);
        files.push(full);
      }
    }
  };

  const collectPath = (p) => {
    const cleanP = normalizePath(p);
    if (!cleanP || !fs.existsSync(cleanP)) return;
    const stat = fs.statSync(cleanP);
    if (stat.isDirectory()) {
      walk(cleanP);
    } else if (stat.isFile() && isScannableExt(cleanP) && !seen.has(cleanP)) {
      seen.add(cleanP);
      files.push(cleanP);
    }
  };

  const cleanProjectRoot = normalizePath(projectRoot);

  if (Array.isArray(scanPaths) && scanPaths.length > 0) {
    for (const p of scanPaths) {
      if (!p) continue;
      const cleanP = normalizePath(p);
      const absPath = path.isAbsolute(cleanP) ? cleanP : path.join(cleanProjectRoot || process.cwd(), cleanP);
      collectPath(absPath);
    }
  }

  if (cleanProjectRoot && fs.existsSync(cleanProjectRoot)) {
    const stat = fs.statSync(cleanProjectRoot);
    if (stat.isFile() && isScannableExt(cleanProjectRoot) && !seen.has(cleanProjectRoot)) {
      collectPath(cleanProjectRoot);
    } else if (files.length === 0 && stat.isDirectory()) {
      walk(cleanProjectRoot);
    }
  }

  return files.sort();
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
      if (arrayStack.length > 0) arrayStack.pop();
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
    case 'blade-text':
      return `{{ __('${full}') }}`;
    case 'blade-attr':
      return occ.attrName ? `${occ.attrName}="__('${full}')"` : `{{ __('${full}') }}`;
    case 'php-code':
      return `__('${full}')`;
    case 'php-interpolated':
      if (occ.interpolatedVarObjs && occ.interpolatedVarObjs.length > 0) {
        const arrayItems = occ.interpolatedVarObjs.map(v => `'${v.name}' => ${v.expr}`).join(', ');
        return `__('${full}', [${arrayItems}])`;
      }
      const arrayItems = (occ.interpolatedVars || []).map(v => `'${v}' => $${v}`).join(', ');
      return `__('${full}', [${arrayItems}])`;
    default:
      return `__('${full}')`;
  }
}

module.exports = {
  collectFiles,
  extractFile,
  extractPhp,
  extractBlade,
  migrateClassPropertiesToConstructor,
  readExistingLang,
  slugify,
  formatReplacement,
  escapePhp,
  isTranslationCall,
  calleeName,
};
