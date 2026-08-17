const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { getConfig, saveConfig } = require('./services/configManager');
const { collectFiles, extractFile, readExistingLang, slugify, formatReplacement, escapePhp } = require('./services/scanner');
const { translateTexts } = require('./services/translator');
const { httpGetJson, mapFieldsToTablesWithoutDb } = require('./services/apiScanner');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

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

    broadcastLog(`🚀 Bắt đầu quét mã nguồn tại thư mục: ${projectRoot}`);
    broadcastLog(`🔍 Các thư mục quét: ${scanPaths.join(', ')}`);

    const files = collectFiles(projectRoot, scanPaths, skipDirs);
    broadcastLog(`📁 Đã tìm thấy ${files.length} file .vue / .js để phân tích.`);

    const occurrences = [];
    const reviews = [];
    for (const f of files) {
      extractFile(f, occurrences, reviews);
    }

    broadcastLog(`🔎 Phát hiện ${occurrences.length} vị trí chuỗi tiếng Việt hardcode.`);

    // Đọc các file ngôn ngữ hiện có
    const sourceLocale = locales.find(l => l.isSource) || { code: 'vi' };
    const sourceLangPath = path.join(projectRoot, 'resources', 'lang', sourceLocale.code, langFileName || 'messages.php');
    const existingLang = readExistingLang(sourceLangPath);

    const uniqueStrings = [];
    const viSet = new Set();
    const keyByVi = {};

    for (const occ of occurrences) {
      const vi = occ.vi;
      if (existingLang.valueKeyMap && existingLang.valueKeyMap[vi]) {
        keyByVi[vi] = existingLang.valueKeyMap[vi];
        continue;
      }
      if (!viSet.has(vi)) {
        viSet.add(vi);
        uniqueStrings.push(vi);
      }
    }

    broadcastLog(`✨ Số chuỗi tiếng Việt mới cần tạo khóa: ${uniqueStrings.length}`);

    // Dịch các ngôn ngữ đích
    const translations = {};
    translations[sourceLocale.code] = {};
    uniqueStrings.forEach(s => translations[sourceLocale.code][s] = s);

    const targetLocales = locales.filter(l => !l.isSource);
    if (!dryRun && uniqueStrings.length > 0) {
      for (const loc of targetLocales) {
        broadcastLog(`🌐 Bắt đầu dịch sang [${loc.code.toUpperCase()}]...`);
        const translatedMap = await translateTexts(uniqueStrings, loc.code, (msg) => broadcastLog(msg));
        translations[loc.code] = translatedMap;
      }
    }

    // Sinh khóa key snake_case
    const existingKeys = new Set(existingLang.keys);
    for (const vi of uniqueStrings) {
      let base = slugify(vi);
      if (!base) base = 'chuoi';
      let key = (prefix || 'text_') + base;
      let n = 2;
      while (existingKeys.has(key)) {
        key = `${prefix || 'text_'}${base}_${n}`;
        n++;
      }
      existingKeys.add(key);
      keyByVi[vi] = key;
    }

    for (const occ of occurrences) {
      occ.key = keyByVi[occ.vi];
    }

    // Tổ chức danh sách kết quả
    const newEntries = uniqueStrings.map(vi => {
      const row = { key: keyByVi[vi], vi };
      for (const loc of targetLocales) {
        row[loc.code] = translations[loc.code] ? (translations[loc.code][vi] || vi) : vi;
      }
      return row;
    });

    // Nếu không phải dryRun và bật autoRefactor
    if (!dryRun && autoRefactor) {
      broadcastLog(`🛠️ Đang cập nhật và refactor trực tiếp vào mã nguồn dự án...`);
      // Cập nhật các file messages.php
      for (const loc of locales) {
        const p = path.join(projectRoot, 'resources', 'lang', loc.code, langFileName || 'messages.php');
        if (fs.existsSync(p)) {
          const src = fs.readFileSync(p, 'utf8');
          const marker = '];';
          const idx = src.lastIndexOf(marker);
          if (idx >= 0) {
            const block = newEntries
              .map(e => `    '${escapePhp(e.key)}' => '${escapePhp(e[loc.code] || e.vi)}',`)
              .join('\n');
            const out = src.slice(0, idx) + block + '\n' + src.slice(idx);
            fs.writeFileSync(p, out, 'utf8');
            broadcastLog(`   -> Đã ghi thêm ${newEntries.length} khóa vào: resources/lang/${loc.code}/${langFileName}`);
          }
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
        const realSrc = fs.readFileSync(file, 'utf8');
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
        if (changed) {
          fs.writeFileSync(file, out, 'utf8');
          refactoredFiles++;
        }
      }
      broadcastLog(`🎉 Đã refactor thành công ${refactoredFiles} file Vue/JS.`);
    }

    broadcastLog(`✅ Hoàn thành phân tích và xử lý.`);

    res.json({
      success: true,
      stats: {
        totalFiles: files.length,
        totalOccurrences: occurrences.length,
        newKeysCount: uniqueStrings.length,
        reviewsCount: reviews.length
      },
      newEntries,
      occurrences: occurrences.slice(0, 100), // Preview 100 item
      reviews
    });

  } catch (err) {
    broadcastLog(`❌ Lỗi trong quá trình quét: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint quét động API
app.post('/api/extract/dynamic', async (req, res) => {
  try {
    const { apiUrl, tableName } = req.body;
    if (!apiUrl || !tableName) {
      return res.status(400).json({ success: false, error: 'Thiếu API URL hoặc Tên bảng DB' });
    }

    broadcastLog(`🌐 Đang gọi API: ${apiUrl}...`);
    const json = await httpGetJson(apiUrl);
    const targetData = json.data || json;

    broadcastLog(`🔎 Đang phân tích các trường chứa tiếng Việt có dấu...`);
    const mappedTables = mapFieldsToTablesWithoutDb(targetData, tableName);

    broadcastLog(`✅ Đã tìm thấy các trường dữ liệu cần dịch:`);
    for (const tbl of Object.keys(mappedTables)) {
      broadcastLog(`   - Bảng [${tbl}]: ${mappedTables[tbl].join(', ')}`);
    }

    res.json({
      success: true,
      mappedTables,
      rawSample: targetData
    });
  } catch (err) {
    broadcastLog(`❌ Lỗi khi quét API: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint xuất file tải về
app.post('/api/export/download-file', (req, res) => {
  const { langCode, entries } = req.body;
  let phpContent = `<?php\n\nreturn [\n`;
  for (const item of (entries || [])) {
    const val = item[langCode] || item.vi || '';
    phpContent += `    '${escapePhp(item.key)}' => '${escapePhp(val)}',\n`;
  }
  phpContent += `];\n`;

  res.setHeader('Content-Type', 'application/x-httpd-php');
  res.setHeader('Content-Disposition', `attachment; filename=messages_${langCode}.php`);
  res.send(phpContent);
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
