const fs = require('fs');
const path = require('path');
const compiler = require('vue-template-compiler');
const babel = require('@babel/parser');
const { readExistingLang, collectFiles, isTranslationCall, calleeName } = require('./scanner');

function escapeJs(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

function escapePhp(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

/**
 * Kiểm tra xem CallExpression có đã được bọc Fallback hay chưa (||, ??, ?:, tham số mặc định)
 */
function isAlreadyGuardedWithFallback(node, ancestors = []) {
  if (!ancestors.length) return false;
  const parent = ancestors[ancestors.length - 1];

  // 1. Phép logic: call || 'Fallback' hoặc call ?? 'Fallback'
  if (parent.type === 'LogicalExpression' && ['||', '??'].includes(parent.operator)) {
    if (parent.left === node) return true;
  }

  // 2. Toán tử 3 ngôi dạng: $t('key') ? $t('key') : 'Fallback'
  if (parent.type === 'ConditionalExpression') {
    if (parent.test === node) return true;
    if (parent.test && (parent.test.type === 'CallExpression' || parent.test.type === 'OptionalCallExpression')) {
      if (isTranslationCall(parent.test) && parent.alternate && parent.alternate.type === 'StringLiteral') {
        return true;
      }
    }
  }

  // 3. Tham số fallback thứ 2 hoặc thứ 3: $t('key', 'Fallback')
  if (node.arguments && node.arguments.length >= 2) {
    const secondArg = node.arguments[1];
    if (secondArg && secondArg.type === 'StringLiteral' && secondArg.value) return true;
    const thirdArg = node.arguments[2];
    if (thirdArg && thirdArg.type === 'StringLiteral' && thirdArg.value) return true;
  }

  // 4. Kiểm tra chuỗi ancestor nếu có bọc biểu thức ngoặc đơn
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const anc = ancestors[i];
    if (anc.type === 'LogicalExpression' && ['||', '??'].includes(anc.operator)) {
      if (anc.left === node || (anc.left.start <= node.start && anc.left.end >= node.end)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Tra cứu giá trị tiếng Việt từ keyValueMap theo key (hỗ trợ cả có và không có 'messages.')
 */
function lookupVietnamese(key, keyValueMap) {
  if (!key || !keyValueMap) return null;
  const cleanKey = key.replace(/^messages\./, '');
  if (keyValueMap[key]) return keyValueMap[key];
  if (keyValueMap[cleanKey]) return keyValueMap[cleanKey];
  if (keyValueMap[`messages.${cleanKey}`]) return keyValueMap[`messages.${cleanKey}`];
  return null;
}

/**
 * Quét file JavaScript hoặc phần <script> của Vue
 */
function scanScriptCode(content, baseOffset, file, keyValueMap, occurrences, kind) {
  let ast;
  try {
    ast = babel.parse(content, { sourceType: 'module', allowReturnOutsideFunction: true });
  } catch (e) {
    try {
      ast = babel.parse(content, { sourceType: 'script', allowReturnOutsideFunction: true });
    } catch (e2) {
      return;
    }
  }

  const walk = (node, ancestors = []) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, ancestors));
      return;
    }

    if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
      if (isTranslationCall(node) && node.arguments && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (firstArg.type === 'StringLiteral') {
          const key = firstArg.value;
          if (!isAlreadyGuardedWithFallback(node, ancestors)) {
            const vi = lookupVietnamese(key, keyValueMap);
            if (vi) {
              const start = baseOffset + node.start;
              const end = baseOffset + node.end;
              const raw = content.slice(node.start, node.end);
              if (/^(?:this\.)?(?:\$t|trans|__|i18n\.t)\s*\(/.test(raw)) {
                occurrences.push({
                  file,
                  start,
                  end,
                  raw,
                  key,
                  vi,
                  kind,
                  replacement: `${raw} || '${escapeJs(vi)}'`
                });
              }
            }
          }
        }
      }
    }

    const nextAncestors = [node, ...ancestors];
    for (const k of Object.keys(node)) {
      if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(k)) continue;
      const val = node[k];
      if (val && typeof val === 'object') walk(val, nextAncestors);
    }
  };

  walk(ast, []);
}

/**
 * Quét phần template của Vue để tìm các vị trí gọi $t(...) chưa có fallback
 */
function scanVueTemplate(content, baseOffset, file, keyValueMap, occurrences) {
  // 1. Quét các khối mustache: {{ ... }}
  const mustacheRegex = /\{\{([\s\S]*?)\}\}/g;
  let match;
  while ((match = mustacheRegex.exec(content)) !== null) {
    const exprStart = match.index + 2;
    const exprEnd = match.index + match[0].length - 2;
    const exprStr = match[1];

    try {
      const ast = babel.parseExpression(exprStr, { allowReturnOutsideFunction: true });
      const walkExpr = (node, ancestors = []) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(n => walkExpr(n, ancestors));
          return;
        }

        if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
          if (isTranslationCall(node) && node.arguments && node.arguments.length > 0) {
            const firstArg = node.arguments[0];
            if (firstArg.type === 'StringLiteral') {
              const key = firstArg.value;
              if (!isAlreadyGuardedWithFallback(node, ancestors)) {
                const vi = lookupVietnamese(key, keyValueMap);
                if (vi) {
                  const nodeStartInContent = exprStart + node.start;
                  const nodeEndInContent = exprStart + node.end;
                  const raw = content.slice(nodeStartInContent, nodeEndInContent);
                  if (/^(?:this\.)?(?:\$t|trans|__|i18n\.t)\s*\(/.test(raw)) {
                    occurrences.push({
                      file,
                      start: baseOffset + nodeStartInContent,
                      end: baseOffset + nodeEndInContent,
                      raw,
                      key,
                      vi,
                      kind: 'vue-template',
                      replacement: `${raw} || '${escapeJs(vi)}'`
                    });
                  }
                }
              }
            }
          }
        }

        const nextAncestors = [node, ...ancestors];
        for (const k of Object.keys(node)) {
          if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(k)) continue;
          const val = node[k];
          if (val && typeof val === 'object') walkExpr(val, nextAncestors);
        }
      };

      walkExpr(ast, []);
    } catch (e) {
      // Bỏ qua lỗi parse biểu thức template phức tạp
    }
  }

  // 2. Quét các thuộc tính bound: :attr="$t('...')" hoặc v-bind:attr="$t('...')"
  const attrRegex = /(?::([a-zA-Z0-9_\.-]+)|v-bind:([a-zA-Z0-9_\.-]+))\s*=\s*(["'])([\s\S]*?)\3/g;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(content)) !== null) {
    const attrVal = attrMatch[4];
    if (!attrVal || !/\$t|i18n|trans|__/.test(attrVal)) continue;

    const quoteChar = attrMatch[3];
    const quoteIdx = attrMatch[0].indexOf(quoteChar);
    const valStartInContent = attrMatch.index + quoteIdx + 1;
    try {
      // Parse attrVal nguyên bản (không .trim()) để AST node.start/node.end khớp chính xác 100% với vị trí trong valStartInContent
      const ast = babel.parseExpression(attrVal, { allowReturnOutsideFunction: true });
      const walkAttr = (node, ancestors = []) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
          node.forEach(n => walkAttr(n, ancestors));
          return;
        }

        if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
          if (isTranslationCall(node) && node.arguments && node.arguments.length > 0) {
            const firstArg = node.arguments[0];
            if (firstArg.type === 'StringLiteral') {
              const key = firstArg.value;
              if (!isAlreadyGuardedWithFallback(node, ancestors)) {
                const vi = lookupVietnamese(key, keyValueMap);
                if (vi) {
                  const nodeStartInContent = valStartInContent + node.start;
                  const nodeEndInContent = valStartInContent + node.end;
                  const raw = content.slice(nodeStartInContent, nodeEndInContent);

                  // Kiểm tra an toàn: raw bắt buộc phải là biểu thức gọi hàm dịch hợp lệ
                  if (/^(?:this\.)?(?:\$t|trans|__|i18n\.t)\s*\(/.test(raw)) {
                    occurrences.push({
                      file,
                      start: baseOffset + nodeStartInContent,
                      end: baseOffset + nodeEndInContent,
                      raw,
                      key,
                      vi,
                      kind: 'vue-template-attr',
                      replacement: `${raw} || '${escapeJs(vi)}'`
                    });
                  }
                }
              }
            }
          }
        }

        const nextAncestors = [node, ...ancestors];
        for (const k of Object.keys(node)) {
          if (['start', 'end', 'loc', 'range', 'leadingComments', 'trailingComments'].includes(k)) continue;
          const val = node[k];
          if (val && typeof val === 'object') walkAttr(val, nextAncestors);
        }
      };

      walkAttr(ast, []);
    } catch (e) {
      // Bỏ qua lỗi parse biểu thức
    }
  }
}

/**
 * Quét file PHP hoặc Blade để tìm __('messages.xxx') hoặc trans('messages.xxx')
 */
function scanPhpCode(fileSrc, file, keyValueMap, occurrences) {
  // Regex tìm __('key') hoặc trans('key')
  const phpCallRegex = /\b(__|trans)\s*\(\s*(['"])(messages\.[a-zA-Z0-9_\.-]+|[a-zA-Z0-9_\.-]+)\2\s*(?:,\s*(\[[^\]]*\]|\$[a-zA-Z0-9_]+))?\s*\)/g;
  let match;

  while ((match = phpCallRegex.exec(fileSrc)) !== null) {
    const raw = match[0];
    const key = match[3];
    const afterIdx = match.index + raw.length;

    // Kiểm tra xem phía sau có toán tử ?: hoặc ?? hoặc || không
    const afterSlice = fileSrc.slice(afterIdx, afterIdx + 15).trimStart();
    if (afterSlice.startsWith('?:') || afterSlice.startsWith('??') || afterSlice.startsWith('||')) {
      continue;
    }

    // Kiểm tra xem có nằm trong Lang::has() không
    const beforeSlice = fileSrc.slice(Math.max(0, match.index - 30), match.index);
    if (/Lang::has\s*\([^)]*\)\s*\?\s*$/i.test(beforeSlice)) {
      continue;
    }

    const vi = lookupVietnamese(key, keyValueMap);
    if (!vi) continue;

    occurrences.push({
      file,
      start: match.index,
      end: match.index + raw.length,
      raw,
      key,
      vi,
      kind: 'php-code',
      replacement: `${raw} ?: '${escapePhp(vi)}'`
    });
  }

  // Quét riêng thẻ Blade: @lang('messages.xxx')
  if (file.endsWith('.blade.php')) {
    const bladeLangRegex = /@lang\s*\(\s*(['"])(messages\.[a-zA-Z0-9_\.-]+|[a-zA-Z0-9_\.-]+)\1\s*\)/g;
    let bMatch;
    while ((bMatch = bladeLangRegex.exec(fileSrc)) !== null) {
      const raw = bMatch[0];
      const key = bMatch[2];
      const vi = lookupVietnamese(key, keyValueMap);
      if (!vi) continue;

      occurrences.push({
        file,
        start: bMatch.index,
        end: bMatch.index + raw.length,
        raw,
        key,
        vi,
        kind: 'blade-lang',
        replacement: `{{ __('${key}') ?: '${escapePhp(vi)}' }}`
      });
    }
  }
}

/**
 * Quét 1 file cụ thể
 */
function scanFile(file, keyValueMap, occurrences) {
  if (!fs.existsSync(file)) return;
  const fileSrc = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();

  if (ext === '.vue') {
    const parseSrc = fileSrc.replace(/\r\n/g, '\n');
    let sfc;
    try {
      sfc = compiler.parseComponent(parseSrc);
    } catch (e) {
      return;
    }
    if (sfc.template && typeof sfc.template.start === 'number') {
      const tplContent = parseSrc.slice(sfc.template.start, sfc.template.end);
      scanVueTemplate(tplContent, sfc.template.start, file, keyValueMap, occurrences);
    }
    if (sfc.script && typeof sfc.script.start === 'number') {
      const scriptContent = parseSrc.slice(sfc.script.start, sfc.script.end);
      scanScriptCode(scriptContent, sfc.script.start, file, keyValueMap, occurrences, 'vue-script');
    }
  } else if (ext === '.js') {
    const lfSrc = fileSrc.replace(/\r\n/g, '\n');
    scanScriptCode(lfSrc, 0, file, keyValueMap, occurrences, 'js-script');
  } else if (ext === '.php' || file.endsWith('.blade.php')) {
    scanPhpCode(fileSrc, file, keyValueMap, occurrences);
  }
}

/**
 * Quét toàn bộ dự án để tìm các lời gọi song ngữ chưa có fallback
 */
function scanAllMissingFallbacks(config) {
  const projectRoot = config.projectRoot;
  const scanPaths = config.scanPaths || [];
  const skipDirs = config.skipDirs || [];

  // Tìm đường dẫn file messages.php tiếng Việt
  let viPath = null;
  if (Array.isArray(config.locales)) {
    const viLoc = config.locales.find(l => l.code === 'vi' || l.isSource);
    if (viLoc && viLoc.filePath) viPath = viLoc.filePath;
  }

  if (!viPath && projectRoot) {
    const defaultVi = path.join(projectRoot, 'resources', 'lang', 'vi', 'messages.php');
    if (fs.existsSync(defaultVi)) viPath = defaultVi;
  }

  if (!viPath || !fs.existsSync(viPath)) {
    throw new Error(`Không tìm thấy file ngôn ngữ tiếng Việt (resources/lang/vi/messages.php) tại: ${viPath || 'chưa cấu hình'}`);
  }

  const { keyValueMap } = readExistingLang(viPath);
  const files = collectFiles(projectRoot, scanPaths, skipDirs);
  const occurrences = [];

  for (const file of files) {
    scanFile(file, keyValueMap, occurrences);
  }

  // Thống kê theo file
  const filesMap = new Map();
  for (const occ of occurrences) {
    if (!filesMap.has(occ.file)) filesMap.set(occ.file, []);
    filesMap.get(occ.file).push(occ);
  }

  return {
    totalOccurrences: occurrences.length,
    filesCount: filesMap.size,
    occurrences,
    viPath,
    totalKeysInVi: Object.keys(keyValueMap).length
  };
}

/**
 * Thực thi áp dụng các Fallback vào trực tiếp file mã nguồn
 */
function applyFallbacks(occurrences) {
  const filesMap = new Map();
  for (const occ of occurrences) {
    if (!filesMap.has(occ.file)) filesMap.set(occ.file, []);
    filesMap.get(occ.file).push(occ);
  }

  let modifiedFilesCount = 0;
  let appliedOccurrencesCount = 0;

  for (const [file, occList] of filesMap.entries()) {
    if (!fs.existsSync(file)) continue;
    let content = fs.readFileSync(file, 'utf8');
    const isCrlf = content.includes('\r\n');
    if (isCrlf) {
      content = content.replace(/\r\n/g, '\n');
    }

    // Sắp xếp thứ tự từ dưới lên trên (giảm dần theo start) để việc thay thế không làm lệch offset
    const sorted = [...occList].sort((a, b) => b.start - a.start);
    let changed = 0;

    for (const occ of sorted) {
      const targetSlice = content.slice(occ.start, occ.end);
      if (targetSlice === occ.raw) {
        content = content.slice(0, occ.start) + occ.replacement + content.slice(occ.end);
        changed++;
        appliedOccurrencesCount++;
      } else {
        // Fallback: tìm theo chuỗi nếu offset bị lệch nhẹ
        const found = content.lastIndexOf(occ.raw, Math.min(content.length, occ.start + 50));
        if (found >= 0 && Math.abs(found - occ.start) < 100) {
          content = content.slice(0, found) + occ.replacement + content.slice(found + occ.raw.length);
          changed++;
          appliedOccurrencesCount++;
        }
      }
    }

    if (changed > 0) {
      if (isCrlf) {
        content = content.replace(/\n/g, '\r\n');
      }
      fs.writeFileSync(file, content, 'utf8');
      modifiedFilesCount++;
    }
  }

  return {
    modifiedFilesCount,
    appliedOccurrencesCount
  };
}

module.exports = {
  scanFile,
  scanAllMissingFallbacks,
  applyFallbacks,
  lookupVietnamese,
  escapeJs,
  escapePhp
};
