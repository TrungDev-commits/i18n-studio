const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { getConfig, saveConfig } = require('./services/configManager');
const { collectFiles, extractFile, readExistingLang, slugify, formatReplacement, migrateClassPropertiesToConstructor } = require('./services/scanner');
const { translateTexts } = require('./services/translator');
const { httpGetJson, mapFieldsToTablesWithoutDb, writeTranslationPhp, updateMiddlewareConfig, resolveTranslationFilePath, loginAndGetAuthHeaders } = require('./services/apiScanner');
const { scanAllMissingFallbacks, applyFallbacks } = require('./services/fallbackInjector');
const {
  escapePhp,
  generatePhpContent,
  generateJsonContent,
  generateCsvReport,
  generateJsonReport,
  generateDynamicPhpConfig,
  exportZipArchive
} = require('./services/exporter');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json({ limit: '200mb' }));

// Lưu danh sách clients SSE để stream log
let sseClients = [];

function broadcastLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const payload = JSON.stringify({ message, type, timestamp });
  sseClients.forEach(client => {
    client.res.write(`data: ${payload}\n\n`);
  });
}

// Endpoint SSE Realtime logs
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// Endpoint cấu hình
app.get('/api/config', (req, res) => {
  res.json({ success: true, data: getConfig() });
});

app.post('/api/config', (req, res) => {
  const saved = saveConfig(req.body);
  res.json({ success: saved });
});

// Endpoint quét tĩnh & dịch
app.post('/api/extract/static', async (req, res) => {
  try {
    const config = { ...getConfig(), ...req.body };
    const { projectRoot, scanPaths, skipDirs, locales, prefix, langFileName, dryRun, autoRefactor } = config;

    broadcastLog(`🚀 Bắt đầu quét mã nguồn tại: ${projectRoot}`);
    if (Array.isArray(scanPaths) && scanPaths.length > 0) {
      broadcastLog(`🔍 Các đường dẫn quét bổ sung: ${scanPaths.join(', ')}`);
    }

    const files = collectFiles(projectRoot, scanPaths, skipDirs);
    broadcastLog(`📁 Đã tìm thấy ${files.length} file (.vue, .js, .blade.php, .php) để phân tích.`);

    const occurrences = [];
    const reviews = [];
    for (const f of files) {
      extractFile(f, occurrences, reviews, dryRun);
    }

    broadcastLog(`🔎 Phát hiện ${occurrences.length} vị trí chuỗi tiếng Việt hardcode.`);

    // Đọc các file ngôn ngữ hiện có (theo path tùy chỉnh hoặc mặc định)
    const sourceLocale = locales.find(l => l.isSource) || { code: 'vi' };
    const localeFiles = locales.map(loc => {
      const p = (loc.filePath && String(loc.filePath).trim())
        ? String(loc.filePath).trim()
        : path.join(projectRoot, 'resources', 'lang', loc.code, langFileName || 'messages.php');
      return { ...loc, path: p, lang: readExistingLang(p) };
    });

    // Ưu tiên file ngôn ngữ nguồn trước khi tra cứu
    const sortedLocaleFiles = [...localeFiles].sort((a, b) => (a.code === sourceLocale.code ? -1 : b.code === sourceLocale.code ? 1 : 0));

    // Gom các key đã định nghĩa sẵn trong các file ngôn ngữ trước khi quét
    const existingLanguageKeys = new Set();
    sortedLocaleFiles.forEach(lf => lf.lang.keys.forEach(k => existingLanguageKeys.add(k)));

    const allKeys = new Set(existingLanguageKeys);

    const uniqueStrings = [];
    const viSet = new Set();
    const keyByVi = {};
    const isReusedByVi = {};
    let reusedCount = 0;

    for (const occ of occurrences) {
      const vi = occ.vi;
      const normVi = vi.replace(/\s+/g, ' ').trim();

      if (keyByVi[vi] || keyByVi[normVi]) {
        if (!keyByVi[vi]) keyByVi[vi] = keyByVi[normVi];
        continue;
      }

      if (!viSet.has(normVi)) {
        viSet.add(normVi);
        uniqueStrings.push(vi);
      }

      // 1. Kiểm tra nếu chuỗi đã được định nghĩa trong bất kỳ file ngôn ngữ nào → tái sử dụng key đã định nghĩa
      let existingKey = null;
      for (const lf of sortedLocaleFiles) {
        if (lf.lang.valueKeyMap) {
          if (lf.lang.valueKeyMap[vi]) {
            existingKey = lf.lang.valueKeyMap[vi];
            break;
          }
          if (lf.lang.valueKeyMap[vi.trim()]) {
            existingKey = lf.lang.valueKeyMap[vi.trim()];
            break;
          }
          if (lf.lang.valueKeyMap[normVi]) {
            existingKey = lf.lang.valueKeyMap[normVi];
            break;
          }
        }
      }

      if (existingKey) {
        keyByVi[vi] = existingKey;
        keyByVi[normVi] = existingKey;
        isReusedByVi[vi] = true;
        isReusedByVi[normVi] = true;
        reusedCount++;
        continue;
      }

      // 2. Kiểm tra nếu KEY sinh ra từ chuỗi (candidateKey hoặc rawBaseKey) đã có định nghĩa trong file ngôn ngữ → tái sử dụng key đã định nghĩa
      let base = slugify(vi);
      if (!base) base = 'chuoi';
      let candidateKey = (prefix || 'text_') + base;
      let rawBaseKey = base;

      let existingKeyByName = null;
      const variants = [
        candidateKey,
        rawBaseKey,
        'messages.' + candidateKey,
        'messages.' + rawBaseKey
      ];

      for (const v of variants) {
        if (existingLanguageKeys.has(v)) {
          existingKeyByName = v;
          break;
        }
      }

      if (existingKeyByName) {
        keyByVi[vi] = existingKeyByName;
        keyByVi[normVi] = existingKeyByName;
        isReusedByVi[vi] = true;
        isReusedByVi[normVi] = true;
        reusedCount++;
        continue;
      }

      // 3. Chưa có key hay chuỗi này trong định nghĩa → tạo key mới (tránh trùng với các key mới được tạo trong cùng phiên quét)
      let key = candidateKey;
      let n = 2;
      while (allKeys.has(key) || allKeys.has('messages.' + key)) {
        key = `${prefix || 'text_'}${base}_${n}`;
        n++;
      }
      allKeys.add(key);
      allKeys.add('messages.' + key);
      keyByVi[vi] = key;
      keyByVi[normVi] = key;
      isReusedByVi[vi] = false;
      isReusedByVi[normVi] = false;
    }

    broadcastLog(`✨ Tổng số chuỗi: ${uniqueStrings.length} (${reusedCount} đã có key - không khai báo lại, ${uniqueStrings.length - reusedCount} key mới).`);

    for (const occ of occurrences) {
      const normVi = occ.vi.replace(/\s+/g, ' ').trim();
      occ.key = keyByVi[occ.vi] || keyByVi[normVi];
    }

    // Dịch các ngôn ngữ đích (chỉ dịch chuỗi nào còn thiếu trong file của ngôn ngữ đó)
    const translations = {};
    translations[sourceLocale.code] = {};
    uniqueStrings.forEach(s => translations[sourceLocale.code][s] = s);

    const targetLocales = locales.filter(l => !l.isSource);
    if (!dryRun && uniqueStrings.length > 0) {
      for (const loc of targetLocales) {
        const lf = localeFiles.find(x => x.code === loc.code);
        const existingValues = {};
        const needTranslate = [];
        for (const vi of uniqueStrings) {
          const normVi = vi.replace(/\s+/g, ' ').trim();
          const key = keyByVi[vi] || keyByVi[normVi];
          const rawKey = key.replace(/^messages\./, '');
          if (lf.lang.keyValueMap && (lf.lang.keyValueMap[key] || lf.lang.keyValueMap[rawKey])) {
            existingValues[vi] = lf.lang.keyValueMap[key] || lf.lang.keyValueMap[rawKey];
          } else {
            needTranslate.push(vi);
          }
        }
        translations[loc.code] = { ...existingValues };
        if (needTranslate.length > 0) {
          broadcastLog(`🌐 Bắt đầu dịch sang [${loc.code.toUpperCase()}] (${needTranslate.length} chuỗi mới)...`);
          const translatedMap = await translateTexts(needTranslate, loc.code, (msg) => broadcastLog(msg));
          needTranslate.forEach(vi => translations[loc.code][vi] = translatedMap[vi]);
        }
      }
    }

    // Tổ chức danh sách kết quả
    const newEntries = uniqueStrings.map(vi => {
      const normVi = vi.replace(/\s+/g, ' ').trim();
      const key = keyByVi[vi] || keyByVi[normVi];
      const isReused = isReusedByVi[vi] || isReusedByVi[normVi] || false;
      const row = { key, vi, isReused };
      for (const loc of targetLocales) {
        row[loc.code] = translations[loc.code] ? (translations[loc.code][vi] || vi) : vi;
      }
      return row;
    });

    // Nếu không phải dryRun và bật autoRefactor
    if (!dryRun && autoRefactor) {
      broadcastLog(`🛠️ Đang cập nhật và refactor trực tiếp vào mã nguồn dự án...`);
      // Cập nhật các file messages.php: chỉ ghi thêm khóa còn thiếu trong từng file (không ghi đè/khai báo lại key đã trùng)
      for (const lf of localeFiles) {
        const p = lf.path;
        const missing = newEntries.filter(e => {
          if (e.isReused) return false;
          const k = e.key;
          const rawK = k.replace(/^messages\./, '');
          return !lf.lang.keys.has(k) && !lf.lang.keys.has(rawK) && !lf.lang.keys.has('messages.' + rawK);
        });

        if (missing.length === 0) continue;

        if (!fs.existsSync(p)) {
          const dir = path.dirname(p);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(p, `<?php\n\nreturn [\n];\n`, 'utf8');
        }
        const src = fs.readFileSync(p, 'utf8');
        const marker = '];';
        const idx = src.lastIndexOf(marker);
        if (idx >= 0) {
          const block = missing
            .map(e => {
              const cleanKey = e.key.replace(/^messages\./, '');
              return `    '${escapePhp(cleanKey)}' => '${escapePhp(e[lf.code] || e.vi)}',`;
            })
            .join('\n');
          const out = src.slice(0, idx) + block + '\n' + src.slice(idx);
          fs.writeFileSync(p, out, 'utf8');
          broadcastLog(`   -> Đã ghi thêm ${missing.length} khóa mới vào: ${p}`);
        }
      }

      // Refactor các file mã nguồn
      const filesToModify = new Map();
      for (const occ of occurrences) {
        if (!filesToModify.has(occ.file)) filesToModify.set(occ.file, []);
        filesToModify.get(occ.file).push(occ);
      }

      let refactoredFiles = 0;
      for (const [file, occs] of filesToModify) {
        let realSrc = fs.readFileSync(file, 'utf8');
        const ext = path.extname(file).toLowerCase();
        if (ext === '.php') {
          const migratedSrc = migrateClassPropertiesToConstructor(realSrc);
          if (migratedSrc !== realSrc) {
            realSrc = migratedSrc;
          }
        }
        const sorted = [...occs].sort((a, b) => b.start - a.start);
        let out = realSrc;
        let changed = 0;
        for (const occ of sorted) {
          const found = out.indexOf(occ.verifyOriginal, Math.max(0, occ.start - 2));
          if (found >= 0 && out.slice(found, found + occ.verifyOriginal.length) === occ.verifyOriginal) {
            out = out.slice(0, found) + formatReplacement(occ, occ.key) + out.slice(found + occ.verifyOriginal.length);
            changed++;
          }
        }
        if (changed || (ext === '.php' && realSrc !== fs.readFileSync(file, 'utf8'))) {
          fs.writeFileSync(file, out, 'utf8');
          refactoredFiles++;
        }
      }
      broadcastLog(`🎉 Đã refactor thành công ${refactoredFiles} file Vue/JS/PHP/Blade.`);
    }

    broadcastLog(`✅ Hoàn thành phân tích và xử lý.`);

    res.json({
      success: true,
      stats: {
        totalFiles: files.length,
        totalOccurrences: occurrences.length,
        newKeysCount: uniqueStrings.length - reusedCount,
        reusedKeysCount: reusedCount,
        reviewsCount: reviews.length
      },
      files,
      newEntries,
      occurrences, // Return all occurrences for full details
      reviews
    });

  } catch (err) {
    broadcastLog(`❌ Lỗi trong quá trình quét: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint kiểm tra đăng nhập Admin API
app.post('/api/auth/test-login', async (req, res) => {
  try {
    const authConfig = req.body;
    if (!authConfig.authUrl || !authConfig.username) {
      return res.status(400).json({ success: false, error: 'Thiếu URL Đăng nhập hoặc Tên tài khoản' });
    }
    broadcastLog(`🔐 Đang kiểm tra đăng nhập Admin API tại: ${authConfig.authUrl}...`);
    const { headers, token, csrfToken } = await loginAndGetAuthHeaders({ ...authConfig, enabled: true });
    
    const modeInfo = token ? `Bearer Token (${token.slice(0, 15)}...)` : `Session Cookie ${csrfToken ? '& CSRF Token' : ''}`;
    broadcastLog(`🔑 Đăng nhập thành công! Chế độ xác thực: ${modeInfo}`);
    
    res.json({
      success: true,
      token,
      csrfToken,
      headers
    });
  } catch (err) {
    broadcastLog(`❌ Đăng nhập thất bại: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint quét động API (Hỗ trợ quét nhiều URL, Bảng & Xác thực Admin)
app.post('/api/extract/dynamic', async (req, res) => {
  try {
    const config = { ...getConfig(), ...req.body };
    const { items: rawItems, apiUrl, tableName, writeToFile, translationFilePath, auth } = req.body;

    let items = Array.isArray(rawItems) ? rawItems : [];
    if (items.length === 0 && apiUrl && tableName) {
      items.push({ apiUrl, tableName });
    }

    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'Thiếu danh sách URL API và Tên bảng DB tương ứng' });
    }

    const authConfig = auth || config.auth;
    let authHeaders = {};
    if (authConfig && authConfig.enabled) {
      broadcastLog(`🔐 Đang đăng nhập Admin API tại [${authConfig.authUrl}]...`);
      try {
        const authRes = await loginAndGetAuthHeaders(authConfig);
        authHeaders = authRes.headers;
        broadcastLog(`🔑 Đăng nhập Admin thành công! Đã lấy Header xác thực: ${Object.keys(authHeaders).join(', ')}`);
      } catch (authErr) {
        broadcastLog(`❌ Lỗi đăng nhập Admin: ${authErr.message}. Tiếp tục quét không xác thực...`, 'error');
      }
    }

    broadcastLog(`🚀 Bắt đầu quét động API (${items.length} URL)...`);

    const combinedMappedTables = {};
    const rawSamples = {};
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const curUrl = item.apiUrl ? item.apiUrl.trim() : '';
      const curTable = item.tableName ? item.tableName.trim() : '';
      if (!curUrl || !curTable) continue;

      broadcastLog(`🌐 [${i + 1}/${items.length}] Đang gọi API: ${curUrl}...`);
      try {
        const json = await httpGetJson(curUrl, authHeaders);
        const targetData = (json && json.data) ? json.data : json;
        rawSamples[curTable] = targetData;

        broadcastLog(`🔎 Phân tích trường tiếng Việt cho bảng [${curTable}]...`);
        const mapped = mapFieldsToTablesWithoutDb(targetData, curTable);

        for (const tbl of Object.keys(mapped)) {
          if (!combinedMappedTables[tbl]) combinedMappedTables[tbl] = [];
          for (const f of mapped[tbl]) {
            if (!combinedMappedTables[tbl].includes(f)) {
              combinedMappedTables[tbl].push(f);
            }
          }
          broadcastLog(`   -> Bảng [${tbl}]: ${mapped[tbl].join(', ')}`);
        }
      } catch (err) {
        broadcastLog(`❌ Lỗi khi quét API (${curUrl}): ${err.message}`, 'error');
        errors.push({ apiUrl: curUrl, tableName: curTable, error: err.message });
      }
    }

    broadcastLog(`✅ Tổng hợp các bảng và trường dữ liệu phát hiện:`);
    for (const tbl of Object.keys(combinedMappedTables)) {
      broadcastLog(`   - Bảng [${tbl}]: ${combinedMappedTables[tbl].join(', ')}`);
    }

    let writeResult = null;
    let middlewareResult = null;
    if (writeToFile) {
      const targetPath = translationFilePath || resolveTranslationFilePath(config);
      broadcastLog(`📝 Đang tự động ghi/gộp kết quả vào file config: ${targetPath}...`);
      writeResult = writeTranslationPhp(targetPath, combinedMappedTables);
      broadcastLog(`🎉 Đã ghi thành công vào ${targetPath} (${writeResult.addedFieldsCount} trường mới trong ${writeResult.addedTablesCount} bảng mới).`);

      const allFields = [];
      for (const tbl of Object.keys(combinedMappedTables)) {
        allFields.push(...combinedMappedTables[tbl]);
      }
      middlewareResult = updateMiddlewareConfig(config.projectRoot, allFields);
      if (middlewareResult && middlewareResult.updated) {
        broadcastLog(`🎉 Đã tự động bổ sung ${middlewareResult.addedKeysCount} trường mới vào AutoTranslateResponseMiddleware.php!`);
      }
    }

    res.json({
      success: true,
      mappedTables: combinedMappedTables,
      rawSamples,
      writeResult,
      middlewareResult,
      errors
    });
  } catch (err) {
    broadcastLog(`❌ Lỗi khi quét API: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint ghi trực tiếp mappedTables vào config/translation.php & Middleware
app.post('/api/extract/dynamic/write', (req, res) => {
  try {
    const config = getConfig();
    const { mappedTables, translationFilePath } = req.body;
    if (!mappedTables || Object.keys(mappedTables).length === 0) {
      return res.status(400).json({ success: false, error: 'Không có danh sách bảng dữ liệu để ghi' });
    }

    const targetPath = translationFilePath || resolveTranslationFilePath(config);
    broadcastLog(`📝 Đang thực hiện ghi kết quả vào file config: ${targetPath}...`);
    const writeResult = writeTranslationPhp(targetPath, mappedTables);
    broadcastLog(`🎉 Đã ghi thành công vào ${targetPath} (${writeResult.addedFieldsCount} trường mới).`);

    const allFields = [];
    for (const tbl of Object.keys(mappedTables)) {
      allFields.push(...mappedTables[tbl]);
    }
    const middlewareResult = updateMiddlewareConfig(config.projectRoot, allFields);
    if (middlewareResult && middlewareResult.updated) {
      broadcastLog(`🎉 Đã tự động bổ sung ${middlewareResult.addedKeysCount} trường mới vào AutoTranslateResponseMiddleware.php!`);
    }

    res.json({
      success: true,
      writeResult,
      middlewareResult
    });
  } catch (err) {
    broadcastLog(`❌ Lỗi khi ghi file translation.php: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint xuất file ngôn ngữ đơn lẻ (PHP hoặc JSON)
app.post('/api/export/download-file', (req, res) => {
  try {
    const { langCode, entries, format = 'php', includeReused = false, nested = false } = req.body;
    if (!langCode) {
      return res.status(400).json({ success: false, error: 'Thiếu mã ngôn ngữ (langCode)' });
    }

    if (format === 'json') {
      const jsonContent = generateJsonContent(langCode, entries, { includeReused, nested });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${langCode}.json"`);
      return res.send(jsonContent);
    }

    const phpContent = generatePhpContent(langCode, entries, { includeReused });
    res.setHeader('Content-Type', 'application/x-httpd-php; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="messages_${langCode}.php"`);
    res.send(phpContent);
  } catch (err) {
    console.error('Lỗi download file:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint xuất file ZIP đóng gói toàn bộ các file ngôn ngữ
app.post('/api/export/download-all-zip', (req, res) => {
  try {
    const { locales, entries, format = 'php', includeReused = false, nested = false } = req.body;
    if (!Array.isArray(locales) || locales.length === 0) {
      return res.status(400).json({ success: false, error: 'Thiếu danh sách ngôn ngữ' });
    }

    exportZipArchive(res, {
      locales,
      entries: entries || [],
      format,
      includeReused,
      nested,
      filename: `i18n_locales_${format}.zip`
    });
  } catch (err) {
    console.error('Lỗi download ZIP:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint xuất file báo cáo kết quả quét (CSV kèm UTF-8 BOM hoặc JSON chi tiết)
app.post('/api/export/scan-report', (req, res) => {
  try {
    const { results, locales, format = 'csv' } = req.body;
    if (!results) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu kết quả quét' });
    }

    if (format === 'json') {
      const jsonReport = generateJsonReport(results, locales || []);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="i18n_scan_results.json"`);
      return res.send(jsonReport);
    }

    const csvContent = generateCsvReport(results, locales || []);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="i18n_scan_report.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Lỗi xuất báo cáo quét:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint tải file config kết quả quét động API (translation.php hoặc JSON)
app.post('/api/export/dynamic-config', (req, res) => {
  try {
    const { mappedTables, format = 'php' } = req.body;
    if (!mappedTables) {
      return res.status(400).json({ success: false, error: 'Thiếu dữ liệu bảng đã quét' });
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="mapped_tables.json"`);
      return res.send(JSON.stringify(mappedTables, null, 2));
    }

    const phpContent = generateDynamicPhpConfig(mappedTables);
    res.setHeader('Content-Type', 'application/x-httpd-php; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="translation.php"`);
    res.send(phpContent);
  } catch (err) {
    console.error('Lỗi tải config dynamic:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint quét các vị trí sử dụng song ngữ mà chưa có fallback
app.post('/api/fallback/scan', async (req, res) => {
  try {
    const config = { ...getConfig(), ...req.body };
    broadcastLog(`🔍 Bắt đầu quét các vị trí gọi song ngữ thiếu Fallback...`);
    const scanResult = scanAllMissingFallbacks(config);
    broadcastLog(`✨ Quét hoàn tất! Tìm thấy ${scanResult.totalOccurrences} vị trí thiếu Fallback trong ${scanResult.filesCount} file.`);
    res.json({
      success: true,
      ...scanResult
    });
  } catch (err) {
    broadcastLog(`❌ Lỗi quét Fallback: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint áp dụng thêm Fallback tự động
app.post('/api/fallback/apply', async (req, res) => {
  try {
    const { occurrences } = req.body;
    if (!Array.isArray(occurrences) || occurrences.length === 0) {
      return res.status(400).json({ success: false, error: 'Không có danh sách vị trí cần thêm fallback' });
    }
    broadcastLog(`⚡ Đang tiến hành thêm Fallback tự động vào ${occurrences.length} vị trí...`);
    const applyResult = applyFallbacks(occurrences);
    broadcastLog(`🎉 Đã thêm Fallback thành công cho ${applyResult.appliedOccurrencesCount} vị trí trong ${applyResult.modifiedFilesCount} file!`);
    res.json({
      success: true,
      ...applyResult
    });
  } catch (err) {
    broadcastLog(`❌ Lỗi khi áp dụng Fallback: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Serve frontend build if exists
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

function startServer({ port = PORT, host = '127.0.0.1', maxAttempts = 20 } = {}) {
  return new Promise((resolve, reject) => {
    const tryListen = (p, attempt) => {
      const server = app.listen(p, host, () => {
        const actual = server.address().port;
        console.log(`\n======================================================`);
        console.log(`🌐 i18n Studio Server đang chạy tại http://localhost:${actual}`);
        console.log(`======================================================\n`);
        resolve(server);
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
          tryListen(p + 1, attempt + 1);
        } else {
          reject(err);
        }
      });
    };
    tryListen(port, 0);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('❌ Không thể khởi động server:', err.message);
    process.exit(1);
  });
}

module.exports = { app, startServer, PORT };
