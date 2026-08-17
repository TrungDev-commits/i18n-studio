const http = require('http');
const https = require('https');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchOneGoogle(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      url,
      {
        headers: {
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
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          try {
            const json = JSON.parse(data);
            let joined = '';
            (json[0] || []).forEach((s) => {
              if (s && s[0]) joined += s[0];
            });
            resolve(joined);
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
  const target = targetLang === 'zh' ? 'zh-CN' : targetLang;
  const base = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=${target}&dt=t&q=`;
  const delim = '\n===DIV===\n';
  const out = {};

  if (!texts || texts.length === 0) return out;

  logCallback(`🌐 [Dịch sang ${targetLang.toUpperCase()}]: Bắt đầu dịch ${texts.length} chuỗi...`);

  for (let i = 0; i < texts.length; i += 15) {
    const chunk = texts.slice(i, i + 15);
    const progress = Math.min(i + 15, texts.length);
    logCallback(`   -> [${targetLang.toUpperCase()}] Đang xử lý ${i + 1} - ${progress} / ${texts.length}...`);

    const url = base + encodeURIComponent(chunk.join(delim));
    let success = false;

    try {
      await sleep(300);
      const joined = await fetchOneGoogle(url);
      const parts = joined.split(delim);
      if (parts.length === chunk.length) {
        chunk.forEach((t, idx) => {
          out[t] = parts[idx].trim() || t;
        });
        success = true;
      }
    } catch (e) {
      logCallback(`   ⚠️ Thử dịch nhóm lỗi (${e.message}), chuyển sang dịch từng từ đơn...`);
      for (const t of chunk) {
        try {
          await sleep(200);
          const singleJoined = await fetchOneGoogle(base + encodeURIComponent(t));
          out[t] = singleJoined.trim() || t;
        } catch (e2) {
          out[t] = t;
        }
      }
    }
  }

  logCallback(`✅ [${targetLang.toUpperCase()}] Hoàn thành dịch ${texts.length} chuỗi.`);
  return out;
}

module.exports = {
  translateTexts
};
