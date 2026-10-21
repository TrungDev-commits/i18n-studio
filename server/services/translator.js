const https = require('https');
const http = require('http');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Gửi request dịch 1 chuỗi qua Google Translate API (clients5)
 * @param {string} text 
 * @param {string} targetLang 
 * @param {number} timeoutMs 
 * @returns {Promise<string>}
 */
async function fetchGoogleTranslate(text, targetLang, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const target = targetLang === 'zh' ? 'zh-CN' : targetLang;
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=vi&tl=${target}&q=${encodeURIComponent(text)}`;
    const client = url.startsWith('https') ? https : http;

    const req = client.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          try {
            const json = JSON.parse(data);
            if (Array.isArray(json)) {
              const translated = typeof json[0] === 'string' ? json[0] : (json[0] && json[0][0]);
              resolve(translated || text);
            } else {
              resolve(text);
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(timeoutMs, () => {
      req.abort();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Dịch mảng văn bản sang ngôn ngữ đích
 * @param {Array<string>} texts 
 * @param {string} targetLang 
 * @param {Function} logCallback 
 */
async function translateTexts(texts, targetLang, logCallback = console.log) {
  const out = {};
  if (!texts || texts.length === 0) return out;

  logCallback(`🌐 [Dịch sang ${targetLang.toUpperCase()}]: Bắt đầu dịch ${texts.length} chuỗi...`);

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    logCallback(`   -> [${targetLang.toUpperCase()}] (${i + 1}/${texts.length}): "${t}"`);
    try {
      await sleep(100);
      const translated = await fetchGoogleTranslate(t, targetLang);
      out[t] = translated.trim() || t;
    } catch (e) {
      logCallback(`   ⚠️ Lỗi khi dịch "${t}": ${e.message}`);
      out[t] = t;
    }
  }

  logCallback(`✅ [${targetLang.toUpperCase()}] Hoàn thành dịch ${texts.length} chuỗi.`);
  return out;
}

module.exports = {
  translateTexts
};
