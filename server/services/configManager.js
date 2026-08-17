const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');

const DEFAULT_CONFIG = {
  projectRoot: path.resolve(__dirname, '..', '..', '..'),
  locales: [
    { code: 'vi', name: 'Tiếng Việt', isSource: true, filePath: '' },
    { code: 'en', name: 'English (EN)', isSource: false, filePath: '' },
    { code: 'zh', name: 'Chinese (ZH)', isSource: false, filePath: '' },
    { code: 'ja', name: 'Japanese (JA)', isSource: false, filePath: '' },
    { code: 'ko', name: 'Korean (KO)', isSource: false, filePath: '' }
  ],
  scanPaths: [
    'src/modules',
    'src/views',
    'src/components',
    'resources/views'
  ],
  skipDirs: [
    'node_modules',
    'vendor',
    'public',
    'storage',
    '.git',
    '.svn',
    '.idea',
    'dist',
    'build',
    'cache'
  ],
  prefix: 'text_',
  langFileName: 'messages.php',
  defaultApiBaseUrl: 'https://bandoso-daklak.rynansaas.com'
};

function getConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

function saveConfig(newConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Lỗi khi lưu config:', e);
    return false;
  }
}

module.exports = {
  getConfig,
  saveConfig,
  DEFAULT_CONFIG
};
