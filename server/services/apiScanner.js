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
          'X-Requested-With': 'XMLHttpRequest',
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
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/html, */*',
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
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP Error ${res.statusCode}: ${data.slice(0, 300)}`));
          }
          let parsedData = data;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            // Bỏ qua nếu phản hồi trả về HTML redirect
          }
          resolve({ data: parsedData, headers: res.headers, statusCode: res.statusCode });
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

function httpPostForm(url, bodyData, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const params = new URLSearchParams();
    for (const key of Object.keys(bodyData)) {
      if (bodyData[key] !== undefined && bodyData[key] !== null) {
        params.append(key, bodyData[key]);
      }
    }
    const postData = params.toString();

    const req = client.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'X-Requested-With': 'XMLHttpRequest',
          Accept: 'application/json, text/html, */*',
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
          if (res.statusCode >= 400) {
            return reject(new Error(`HTTP Error ${res.statusCode}: ${data.slice(0, 200)}`));
          }
          let parsedData = data;
          try {
            parsedData = JSON.parse(data);
          } catch (e) {
            // Bỏ qua nếu là HTML redirect
          }
          resolve({ data: parsedData, headers: res.headers, statusCode: res.statusCode });
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

function httpGetRaw(url, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'X-App-Locale': 'vi',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
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
          resolve({ body: data, headers: res.headers, statusCode: res.statusCode });
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.abort();
      reject(new Error('Request timeout khi khởi tạo session'));
    });
  });
}

function httpGetJsonWithHeaders(url, customHeaders = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'X-App-Locale': 'vi',
          'X-Requested-With': 'XMLHttpRequest',
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
            reject(new Error(`Không thể parse JSON: ${e.message}`));
          }
        });
      }
    );
    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.abort();
      reject(new Error('Request timeout'));
    });
  });
}

async function loginAndGetAuthHeaders(authConfig) {
  if (!authConfig || !authConfig.enabled || !authConfig.authUrl) {
    return {};
  }

  const { authUrl, username, password, tokenHeader = 'Authorization', tokenPrefix = 'Bearer ', authMethod = 'POST' } = authConfig;
  const method = (authMethod || 'POST').toUpperCase();
  let response;

  const base64Password = Buffer.from(password || '').toString('base64');

  const payload = {
    // Cách 1: Web Admin (/login hoặc /login-guess)
    UserCode: username,
    Password: base64Password,
    // Cách 2: Mobile / App API (/api/app/auth/login)
    username: username,
    email: username,
    password: password
  };

  // Bước 1: Khởi tạo Session Cookie (laravel_session & XSRF-TOKEN) bằng GET HTML trước khi gửi POST
  let preHeaders = {
    'X-Requested-With': 'XMLHttpRequest'
  };

  try {
    const initRes = await httpGetRaw(authUrl);

    // Lấy tất cả Cookie khởi tạo (laravel_session, XSRF-TOKEN...)
    if (initRes.headers && initRes.headers['set-cookie']) {
      const setCookies = initRes.headers['set-cookie'];
      preHeaders['Cookie'] = setCookies.map(c => c.split(';')[0]).join('; ');

      // Lấy XSRF-TOKEN từ Cookie nếu có
      const xsrfMatch = preHeaders['Cookie'].match(/XSRF-TOKEN=([^;]+)/);
      if (xsrfMatch) {
        const tokenVal = decodeURIComponent(xsrfMatch[1]);
        preHeaders['X-XSRF-TOKEN'] = tokenVal;
        preHeaders['X-CSRF-TOKEN'] = tokenVal;
        payload._token = tokenVal;
      }
    }

    // Trích xuất CSRF Token từ HTML meta/input nếu có
    if (initRes.body && typeof initRes.body === 'string') {
      const metaMatch = initRes.body.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
      const inputMatch = initRes.body.match(/<input\s+[^>]*name=["']_token["']\s+value=["']([^"']+)["']/i);
      const htmlCsrf = metaMatch ? metaMatch[1] : (inputMatch ? inputMatch[1] : null);
      if (htmlCsrf) {
        preHeaders['X-CSRF-TOKEN'] = htmlCsrf;
        preHeaders['X-XSRF-TOKEN'] = htmlCsrf;
        payload._token = htmlCsrf;
      }
    }
  } catch (initErr) {
    // Bỏ qua nếu GET khởi tạo session bị lỗi mạng
  }

  // Bước 2: Gửi request Đăng nhập kèm Session Cookie đã khởi tạo
  if (method === 'GET') {
    const urlObj = new URL(authUrl);
    if (username) {
      urlObj.searchParams.set('username', username);
      urlObj.searchParams.set('UserCode', username);
    }
    if (password) {
      urlObj.searchParams.set('password', password);
      urlObj.searchParams.set('Password', base64Password);
    }
    response = await httpGetJsonWithHeaders(urlObj.toString(), preHeaders);
  } else {
    try {
      // Ưu tiên gửi JSON
      response = await httpPostJson(authUrl, payload, preHeaders);
    } catch (err) {
      // Fallback sang x-www-form-urlencoded nếu JSON thất bại
      response = await httpPostForm(authUrl, payload, preHeaders);
    }
  }

  const resData = response.data;

  // Kiểm tra cờ success nếu phản hồi trả về JSON
  if (resData && typeof resData === 'object' && resData.success === false) {
    throw new Error(resData.message || resData.error || 'Đăng nhập không thành công (success = false)');
  }

  // Bước 3: Gom tất cả Header Xác thực (Cookie laravel_session + Token) cho các request tiếp theo
  const finalHeaders = {
    'X-Requested-With': 'XMLHttpRequest'
  };

  const allCookiesMap = {};
  if (preHeaders['Cookie']) {
    preHeaders['Cookie'].split('; ').forEach(c => {
      const [k, v] = c.split('=');
      if (k) allCookiesMap[k] = v;
    });
  }

  if (response.headers && response.headers['set-cookie']) {
    response.headers['set-cookie'].forEach(c => {
      const pair = c.split(';')[0];
      const [k, v] = pair.split('=');
      if (k) allCookiesMap[k] = v;
    });
  }

  const mergedCookieStr = Object.entries(allCookiesMap).map(([k, v]) => `${k}=${v}`).join('; ');
  if (mergedCookieStr) {
    finalHeaders['Cookie'] = mergedCookieStr;
  }

  // 1. Trích xuất Bearer Token (Mobile API)
  let token = null;
  if (typeof resData === 'string') {
    if (!resData.includes('<html')) {
      token = resData;
    }
  } else if (resData && typeof resData === 'object') {
    token =
      resData.access_token ||
      resData.token ||
      resData.jwt ||
      (resData.data && (resData.data.access_token || resData.data.token || resData.data.jwt || resData.data.api_token)) ||
      (resData.result && (resData.result.token || resData.result.access_token));
  }

  if (token) {
    const prefix = tokenPrefix !== undefined ? tokenPrefix : 'Bearer ';
    finalHeaders[tokenHeader || 'Authorization'] = `${prefix}${token}`.trim();
  }

  // 2. Trích xuất CSRF Token (Web Admin)
  const csrfToken = (resData && typeof resData === 'object')
    ? (resData.csrf_token || (resData.data && resData.data.csrf_token) || resData._token)
    : (preHeaders['X-CSRF-TOKEN'] || null);

  if (csrfToken) {
    finalHeaders['X-CSRF-TOKEN'] = csrfToken;
    finalHeaders['X-XSRF-TOKEN'] = csrfToken;
  }

  if (!token && !finalHeaders['Cookie'] && !csrfToken) {
    throw new Error('Đăng nhập thành công nhưng không tìm thấy token hoặc cookie laravel_session trong kết quả trả về');
  }

  return { headers: finalHeaders, token, csrfToken, rawResponse: resData };
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

