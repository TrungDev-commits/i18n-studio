const archiver = require('archiver');

/**
 * Escape chuỗi để đặt trong nháy đơn PHP '...'
 */
function escapePhp(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Gán giá trị vào object theo đường dẫn dot-notation (a.b.c)
 */
function setNestedKey(obj, path, value) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Sinh nội dung file PHP trả về mảng ngôn ngữ
 */
function generatePhpContent(langCode, entries, { includeReused = false } = {}) {
  let phpContent = `<?php\n\nreturn [\n`;
  for (const item of (entries || [])) {
    if (!item || !item.key) continue;
    if (!includeReused && item.isReused) continue;
    const cleanKey = item.key.replace(/^messages\./, '');
    const val = item[langCode] != null ? item[langCode] : (item.vi || '');
    phpContent += `    '${escapePhp(cleanKey)}' => '${escapePhp(val)}',\n`;
  }
  phpContent += `];\n`;
  return phpContent;
}

/**
 * Sinh nội dung file JSON ngôn ngữ (hỗ trợ flat hoặc nested)
 */
function generateJsonContent(langCode, entries, { includeReused = false, nested = false } = {}) {
  if (nested) {
    const root = {};
    for (const item of (entries || [])) {
      if (!item || !item.key) continue;
      if (!includeReused && item.isReused) continue;
      const cleanKey = item.key.replace(/^messages\./, '');
      const val = item[langCode] != null ? item[langCode] : (item.vi || '');
      setNestedKey(root, cleanKey, val);
    }
    return JSON.stringify(root, null, 2);
  } else {
    const flat = {};
    for (const item of (entries || [])) {
      if (!item || !item.key) continue;
      if (!includeReused && item.isReused) continue;
      const cleanKey = item.key.replace(/^messages\./, '');
      const val = item[langCode] != null ? item[langCode] : (item.vi || '');
      flat[cleanKey] = val;
    }
    return JSON.stringify(flat, null, 2);
  }
}

/**
 * Escape trường CSV chuẩn RFC 4180
 */
function escapeCsv(val) {
  if (val == null) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Sinh báo cáo kết quả quét dưới dạng CSV (kèm UTF-8 BOM cho Excel)
 */
function generateCsvReport(results, locales = []) {
  const entries = results?.newEntries || [];
  const occurrences = results?.occurrences || [];

  // Tạo map tra cứu vị trí xuất hiện theo key hoặc vi
  const occurrencesByKey = {};
  for (const occ of occurrences) {
    const k = occ.key || occ.vi;
    if (!occurrencesByKey[k]) occurrencesByKey[k] = [];
    const relFile = occ.file ? occ.file.replace(/\\/g, '/').split('/').slice(-3).join('/') : '';
    occurrencesByKey[k].push(`${relFile}:${occ.line || '?'}`);
  }

  const targetLocales = (locales || []).filter(l => !l.isSource);
  const headers = [
    'STT',
    'Khóa (Key)',
    'Trạng thái',
    'Gốc Tiếng Việt (VI)',
    ...targetLocales.map(l => `${l.name || l.code} (${l.code.toUpperCase()})`),
    'Số vị trí phát hiện',
    'Danh sách File:Dòng phát hiện'
  ];

  const rows = [headers.map(escapeCsv).join(',')];

  entries.forEach((item, idx) => {
    const key = item.key || '';
    const occList = occurrencesByKey[key] || occurrencesByKey[item.vi] || [];
    const fileLocs = occList.slice(0, 20).join('; ') + (occList.length > 20 ? ` (+${occList.length - 20} vị trí khác)` : '');

    const row = [
      idx + 1,
      key,
      item.isReused ? 'Tái sử dụng (Đã có sẵn)' : 'Khóa mới sinh',
      item.vi || '',
      ...targetLocales.map(l => item[l.code] || ''),
      occList.length,
      fileLocs
    ];
    rows.push(row.map(escapeCsv).join(','));
  });

  // UTF-8 BOM (\uFEFF) giúp Microsoft Excel hiển thị đúng tiếng Việt có dấu
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Sinh báo cáo JSON chi tiết kết quả quét
 */
function generateJsonReport(results, locales = []) {
  const data = {
    exportedAt: new Date().toISOString(),
    stats: results?.stats || {},
    locales: locales.map(l => ({ code: l.code, name: l.name, isSource: !!l.isSource })),
    entries: results?.newEntries || [],
    occurrences: results?.occurrences || [],
    reviews: results?.reviews || [],
    filesScanned: results?.files || []
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Sinh nội dung file config/translation.php cho quét động API
 */
function generateDynamicPhpConfig(mappedTables = {}) {
  let php = `<?php\n\nreturn [\n    'tables' => [\n`;
  for (const [tbl, rawFields] of Object.entries(mappedTables)) {
    const fields = [...new Set(rawFields)].sort();
    php += `        '${tbl}' => [\n`;
    php += `            'primary_key' => 'id',\n`;
    php += `            'fields' => [\n`;
    for (const f of fields) {
      php += `                '${escapePhp(f)}',\n`;
    }
    php += `            ],\n`;
    php += `        ],\n`;
  }
  php += `    ],\n];\n`;
  return php;
}

/**
 * Xuất file ZIP chứa toàn bộ các file ngôn ngữ
 */
function exportZipArchive(res, { locales = [], entries = [], format = 'php', includeReused = false, nested = false, filename = 'i18n_locales.zip' }) {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.on('error', (err) => {
    console.error('Lỗi nén ZIP:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  archive.pipe(res);

  // Đóng gói từng file ngôn ngữ
  for (const loc of locales) {
    let content = '';
    let filePathInZip = '';

    if (format === 'php') {
      content = generatePhpContent(loc.code, entries, { includeReused });
      filePathInZip = `resources/lang/${loc.code}/messages.php`;
    } else {
      content = generateJsonContent(loc.code, entries, { includeReused, nested });
      filePathInZip = `locales/${loc.code}.json`;
    }

    archive.append(content, { name: filePathInZip });
  }

  // Thêm file manifest.json ghi chú thông tin phiên export
  const manifest = {
    exportedAt: new Date().toISOString(),
    format,
    includeReused,
    nested: format === 'json' ? nested : undefined,
    localesCount: locales.length,
    locales: locales.map(l => l.code),
    totalEntries: entries.length,
    exportedEntries: includeReused ? entries.length : entries.filter(e => !e.isReused).length
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

  archive.finalize();
}

module.exports = {
  escapePhp,
  setNestedKey,
  generatePhpContent,
  generateJsonContent,
  generateCsvReport,
  generateJsonReport,
  generateDynamicPhpConfig,
  exportZipArchive
};
