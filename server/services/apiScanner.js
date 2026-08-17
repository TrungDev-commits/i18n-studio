const http = require('http');
const https = require('https');

const vnRx = /[àảãáạăằẳẵắặâầẩẫấậđèẻẽéẹêềểễếệìỉĩíịòỏõóọôồổỗốộơờởỡớợùủũúụưừửữứựỳỷỹýỵÀẢÃÁẠĂẰẲẴẮẶÂẦẨẪẤẬĐÈẺẼÉẸÊỀỂỄẾỆÌỈĨÍỊÒỎÕÓỌÔỒỔỖỐỘƠỜỞỠỚỢÙỦŨÚỤƯỪỬỮỨỰỲỶỸÝỴ]/;

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          'X-App-Locale': 'vi',
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
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

module.exports = {
  httpGetJson,
  mapFieldsToTablesWithoutDb
};
