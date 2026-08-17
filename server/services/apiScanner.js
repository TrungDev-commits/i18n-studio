const http = require('http');
const https = require('https');

const vnRx = /[àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵÀẢÃÁẠĂẰẲẴẮẶÂẦẨẪẤẬĐÈẺẼÉẸÊỀỂỄẾỆÌỈĨÍỊÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢÙỦŨÚỤƯỪỬỮỨỰỲỶỸÝỴ]/;

function httpGetJson(url, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'X-App-Locale': 'vi',
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          ...customHeaders
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP Error ${res.statusCode}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Không thể parse JSON: ${e.message}`));
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.setTimeout(8000, () => {
      req.abort();
      reject(new Error('Request timeout'));
    });
  });
}

function httpPostJson(url, bodyData, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(bodyData);

    const req = client.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          ...customHeaders
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP Error ${res.statusCode}: ${data}`));
          }
          try {
            resolve({ data: JSON.parse(data), headers: res.headers });
          } catch (e) {
            reject(new Error(`Không thể parse JSON phản hồi đăng nhập: ${e.message}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.abort();
      reject(new Error('Request timeout khi gọi API đăng nhập'));
    });

    req.write(postData);
    req.end();
  });
}

async function loginAndGetAuthHeaders(authConfig) {
  if (!authConfig || !authConfig.enabled || !authConfig.authUrl || !authConfig.username) {
    return {};
  }

  const { authUrl, username, password, tokenHeader = 'Authorization', tokenPrefix = 'Bearer ' } = authConfig;

  const payload = {
    username: username,
    email: username,
    password: password
  };

  const response = await httpPostJson(authUrl, payload);
  const resData = response.data;

  let token = null;
  if (typeof resData === 'string') {
    token = resData;
  } else if (resData) {
    token =
      resData.access_token ||
      resData.token ||
      resData.jwt ||
      (resData.data && (resData.data.access_token || resData.data.token || resData.data.jwt || resData.data.api_token)) ||
      (resData.result && (resData.result.token || resData.result.access_token));
  }

  const headers = {};
  if (token) {
    const prefix = tokenPrefix !== undefined ? tokenPrefix : 'Bearer ';
    headers[tokenHeader || 'Authorization'] = `${prefix}${token}`.trim();
  }

  if (response.headers && response.headers['set-cookie']) {
    headers['Cookie'] = response.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
  }

  if (!token && !headers['Cookie']) {
    throw new Error('Đăng nhập thành công nhưng không tìm thấy token hoặc cookie xác thực trong kết quả trả về');
  }

  return { headers, token, rawResponse: resData };
}

function mapFieldsToTablesWithoutDb(jsonData, mainTable) {
  const mapped = {};
  let prefix = '';
  const parts = mainTable.split('_');
  if (parts.length > 1) {
    parts.pop();
    prefix = parts.join('_');
  }

  const scan = (data, currentTable) => {
    if (!data || typeof data !== 'object') return;

    for (const key of Object.keys(data)) {
      const val = data[key];
      if (val && typeof val === 'object') {
        let nextTable = currentTable;
        if (isNaN(key)) {
          const singular = key.endsWith('s') ? key.slice(0, -1) : key;
          const cleanSingular = singular.replace(/_/g, '');
          nextTable = prefix ? `${prefix}_${cleanSingular}` : cleanSingular;
        }
        scan(val, nextTable);
      } else if (typeof val === 'string' && vnRx.test(val)) {
        const ignored = ['id', 'created_at', 'updated_at', 'commune_code', 'image', 'images', 'album_images', 'tourism_images'];
        if (ignored.includes(key)) continue;

        if (!mapped[currentTable]) mapped[currentTable] = [];
        if (!mapped[currentTable].includes(key)) {
          mapped[currentTable].push(key);
        }
      }
    }
  };

  scan(jsonData, mainTable);
  return mapped;
}

function parseTranslationPhp(phpContent) {
  const tables = {};
  let isNested = /['"]tables['"]\s*=>\s*\[/.test(phpContent);

  const tableBlockRegex = /['"]([a-zA-Z0-9_]+)['"]\s*=>\s*\[([\s\S]*?)\]/g;
  let match;
  while ((match = tableBlockRegex.exec(phpContent)) !== null) {
    const tableName = match[1];
    if (tableName === 'tables') continue;
    const body = match[2];
    const fieldRegex = /['"]([a-zA-Z0-9_]+)['"]/g;
    let fieldMatch;
    const fields = [];
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      fields.push(fieldMatch[1]);
    }
    tables[tableName] = fields;
  }

  return { tables, isNested };
}

function writeTranslationPhp(filePath, newMappedTables) {
  const fs = require('fs');
  const path = require('path');
  let existingTables = {};
  let isNested = true;

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parseTranslationPhp(content);
      existingTables = parsed.tables;
      if (content.length > 0) {
        isNested = parsed.isNested;
      }
    } catch (e) {
      console.error(`Lỗi đọc file translation.php (${filePath}):`, e.message);
    }
  } else {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const mergedTables = { ...existingTables };
  let addedTablesCount = 0;
  let addedFieldsCount = 0;

  for (const [tbl, fields] of Object.entries(newMappedTables || {})) {
    if (!mergedTables[tbl]) {
      mergedTables[tbl] = [];
      addedTablesCount++;
    }
    for (const f of fields) {
      if (!mergedTables[tbl].includes(f)) {
        mergedTables[tbl].push(f);
        addedFieldsCount++;
      }
    }
  }

  let phpContent = `<?php\n\nreturn [\n`;
  if (isNested) {
    phpContent += `    'tables' => [\n`;
    for (const [tbl, fields] of Object.entries(mergedTables)) {
      phpContent += `        '${tbl}' => [\n`;
      for (const f of fields) {
        phpContent += `            '${f}',\n`;
      }
      phpContent += `        ],\n`;
    }
    phpContent += `    ],\n`;
  } else {
    for (const [tbl, fields] of Object.entries(mergedTables)) {
      phpContent += `    '${tbl}' => [\n`;
      for (const f of fields) {
        phpContent += `        '${f}',\n`;
      }
      phpContent += `    ],\n`;
    }
  }
  phpContent += `];\n`;

  fs.writeFileSync(filePath, phpContent, 'utf8');

  return {
    filePath,
    mergedTables,
    addedTablesCount,
    addedFieldsCount,
    totalTables: Object.keys(mergedTables).length
  };
}

function resolveTranslationFilePath(config) {
  const path = require('path');
  if (config && config.translationFilePath && String(config.translationFilePath).trim()) {
    return String(config.translationFilePath).trim();
  }
  const root = (config && config.projectRoot) ? config.projectRoot : '';
  let baseDir = root;
  const srcIdx = root.lastIndexOf(path.sep + 'src');
  if (srcIdx > 0) {
    baseDir = root.substring(0, srcIdx);
  }
  return path.join(baseDir, 'config', 'translation.php');
}

module.exports = {
  httpGetJson,
  httpPostJson,
  loginAndGetAuthHeaders,
  mapFieldsToTablesWithoutDb,
  parseTranslationPhp,
  writeTranslationPhp,
  resolveTranslationFilePath
};

