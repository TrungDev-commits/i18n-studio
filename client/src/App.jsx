import React, { useState, useEffect, useRef } from 'react';
import {
  Languages,
  FileCode,
  Database,
  Settings,
  Terminal,
  Play,
  RefreshCw,
  Download,
  Plus,
  Trash2,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  Files,
  Activity,
  SlidersHorizontal,
  AlertTriangle,
  Search,
  Copy,
  Check,
  Square,
} from 'lucide-react';

const VIEWS = {
  static: { label: 'Quét Mã Nguồn', sub: 'Vue / JS', icon: FileCode },
  dynamic: { label: 'Quét API & DB', sub: 'Dynamic', icon: Database },
  config: { label: 'Cấu hình', sub: 'Hệ thống', icon: Settings },
};

const NAV_GROUPS = [
  { label: 'Hoạt động', items: ['static', 'dynamic'] },
  { label: 'Hệ thống', items: ['config'] },
];

const SUPPORTED_LANGUAGES = [
  { code: 'zh', name: 'Tiếng Trung Giản thể (ZH)' },
  { code: 'zh-TW', name: 'Tiếng Trung Phồn thể (ZH-TW)' },
  { code: 'en', name: 'English (EN)' },
  { code: 'ja', name: 'Tiếng Nhật (JA)' },
  { code: 'ko', name: 'Tiếng Hàn (KO)' },
  { code: 'th', name: 'Tiếng Thái (TH)' },
  { code: 'lo', name: 'Tiếng Lào (LO)' },
  { code: 'km', name: 'Tiếng Khmer (KM)' },
  { code: 'fr', name: 'Tiếng Pháp (FR)' },
  { code: 'de', name: 'Tiếng Đức (DE)' },
  { code: 'es', name: 'Tiếng Tây Ban Nha (ES)' },
  { code: 'ru', name: 'Tiếng Nga (RU)' },
  { code: 'id', name: 'Tiếng Indonesia (ID)' },
  { code: 'ms', name: 'Tiếng Mã Lai (MS)' },
  { code: 'pt', name: 'Tiếng Bồ Đào Nha (PT)' },
  { code: 'it', name: 'Tiếng Ý (IT)' },
  { code: 'ar', name: 'Tiếng Ả Rập (AR)' },
  { code: 'hi', name: 'Tiếng Ấn Độ / Hindi (HI)' },
];

function logClass(message, type) {
  if (type === 'error' || message.includes('❌')) return 'error';
  if (message.includes('✅') || message.includes('🎉')) return 'success';
  if (message.includes('⚠️') || message.includes('🔎') || message.includes('🔍')) return 'warn';
  return 'info';
}

export default function App() {
  const [activeView, setActiveView] = useState('static');
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(null);
  const [dynamicResults, setDynamicResults] = useState(null);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [serverOnline, setServerOnline] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [modalSearch, setModalSearch] = useState('');
  const [copiedText, setCopiedText] = useState(null);
  const [newLocaleForm, setNewLocaleForm] = useState({ code: '', name: '' });
  const [selectedPreset, setSelectedPreset] = useState('');
  const [addLocaleError, setAddLocaleError] = useState('');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
      }
    };
    if (activeModal) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeModal]);

  const getRelativePath = (absolutePath) => {
    if (!absolutePath || !config?.projectRoot) return absolutePath;
    let relative = absolutePath;
    const root = config.projectRoot.replace(/\\/g, '/');
    const path = absolutePath.replace(/\\/g, '/');
    if (path.startsWith(root)) {
      relative = path.substring(root.length);
    }
    if (relative.startsWith('/')) {
      relative = relative.substring(1);
    }
    return relative;
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => {
      setCopiedText(null);
    }, 2000);
  };

  const [dynamicForm, setDynamicForm] = useState({
    items: [
      {
        id: '1',
        apiUrl: 'https://bandoso-daklak.rynansaas.com/api-ui/quan-ly-gioi-thieu-xa-phuong/get-active-communes',
        tableName: 'gioi_thieu_xa_phuong'
      }
    ],
    writeToFile: false,
    translationFilePath: 'D:\\H_SourceCode\\SAAS\\bandoso_daklak\\config\\translation.php',
    auth: {
      enabled: false,
      authUrl: 'https://bandoso-daklak.rynansaas.com/api/v1/auth/login',
      username: '',
      password: '',
      tokenHeader: 'Authorization',
      tokenPrefix: 'Bearer '
    }
  });

  const [testingLogin, setTestingLogin] = useState(false);
  const [loginTestResult, setLoginTestResult] = useState(null);

  const [options, setOptions] = useState({
    dryRun: true,
    autoRefactor: false
  });

  const logsEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setConfig(data.data);
          setServerOnline(true);
          setDynamicForm(prev => ({
            ...prev,
            items: (data.data.apiItems && Array.isArray(data.data.apiItems) && data.data.apiItems.length > 0) ? data.data.apiItems : prev.items,
            translationFilePath: data.data.translationFilePath || prev.translationFilePath,
            auth: data.data.auth ? { ...prev.auth, ...data.data.auth } : prev.auth
          }));
        }
      })
      .catch(err => console.error('Lỗi load config:', err));

    const eventSource = new EventSource('/api/logs');
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setLogs(prev => [...prev, payload]);
      } catch (err) {}
    };
    eventSource.onerror = () => setServerOnline(false);

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleAddApiItem = () => {
    setDynamicForm(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { id: String(Date.now()), apiUrl: '', tableName: '' }
      ]
    }));
  };

  const handleRemoveApiItem = (id) => {
    setDynamicForm(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const handleApiItemChange = (id, field, value) => {
    setDynamicForm(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  const handleAuthChange = (field, value) => {
    setDynamicForm(prev => ({
      ...prev,
      auth: {
        ...prev.auth,
        [field]: value
      }
    }));
  };

  const handleTestLogin = async () => {
    setTestingLogin(true);
    setLoginTestResult(null);
    try {
      const res = await fetch('/api/auth/test-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dynamicForm.auth)
      });
      const data = await res.json();
      if (data.success) {
        const info = data.token
          ? `JWT Bearer Token: ${data.token.slice(0, 25)}...`
          : `Session Cookie (laravel_session) ${data.csrfToken ? '+ CSRF Token' : ''}`;
        setLoginTestResult({
          success: true,
          message: `✅ Đăng nhập thành công! [${info}]`
        });
      } else {
        setLoginTestResult({ success: false, message: `❌ ${data.error}` });
      }
    } catch (err) {
      setLoginTestResult({ success: false, message: `❌ Lỗi kết nối API đăng nhập: ${err.message}` });
    } finally {
      setTestingLogin(false);
    }
  };

  const handleSaveApiItemsConfig = async () => {
    const newConfig = {
      ...config,
      apiItems: dynamicForm.items,
      translationFilePath: dynamicForm.translationFilePath,
      auth: dynamicForm.auth
    };
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      if (data.success) {
        setConfig(newConfig);
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: '💾 Đã lưu danh sách API, xác thực Admin và đường dẫn config translation.php thành công!', type: 'info' }]);
      }
    } catch (err) {
      setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ Lỗi lưu cấu hình: ${err.message}`, type: 'error' }]);
    }
  };

  const handleWriteTranslationFile = async () => {
    if (!dynamicResults || !dynamicResults.mappedTables) return;
    setLoading(true);
    try {
      const res = await fetch('/api/extract/dynamic/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mappedTables: dynamicResults.mappedTables,
          translationFilePath: dynamicForm.translationFilePath
        })
      });
      const data = await res.json();
      if (data.success) {
        setDynamicResults(prev => ({ ...prev, writeResult: data.writeResult }));
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `🎉 Đã ghi thành công vào file ${data.writeResult.filePath}!`, type: 'info' }]);
      } else {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ ${data.error}`, type: 'error' }]);
      }
    } catch (err) {
      setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ ${err.message}`, type: 'error' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: '✅ Đã lưu cấu hình thành công!', type: 'info' }]);
      }
    } catch (err) {
      setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ Lỗi lưu cấu hình: ${err.message}`, type: 'error' }]);
    }
  };

  const handleStopExtract = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  };

  const handleRunStaticExtract = async () => {
    setLoading(true);
    setResults(null);
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: '--- BẮT ĐẦU PHIÊN QUÉT TĨNH MỚI ---', type: 'info' }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/extract/static', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          ...options
        }),
        signal: controller.signal
      });
      const data = await res.json();
      if (data.success) {
        setResults(data);
      } else {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ ${data.error}`, type: 'error' }]);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: '🛑 Đã dừng tiến trình quét tĩnh theo yêu cầu.', type: 'warn' }]);
      } else {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ Lỗi kết nối API: ${err.message}`, type: 'error' }]);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleRunDynamicExtract = async () => {
    setLoading(true);
    setDynamicResults(null);
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: '--- BẮT ĐẦU QUÉT DỮ LIỆU ĐỘNG API ---', type: 'info' }]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch('/api/extract/dynamic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: dynamicForm.items,
          writeToFile: dynamicForm.writeToFile,
          translationFilePath: dynamicForm.translationFilePath,
          auth: dynamicForm.auth
        }),
        signal: controller.signal
      });
      const data = await res.json();
      if (data.success) {
        setDynamicResults(data);
      } else {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ ${data.error}`, type: 'error' }]);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: '🛑 Đã dừng tiến trình quét API theo yêu cầu.', type: 'warn' }]);
      } else {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ ${err.message}`, type: 'error' }]);
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleDownloadLang = async (langCode) => {
    if (!results || !results.newEntries) return;
    try {
      const res = await fetch('/api/export/download-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          langCode,
          entries: results.newEntries
        })
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `messages_${langCode}.php`;
      a.click();
    } catch (err) {
      setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ Lỗi download: ${err.message}`, type: 'error' }]);
    }
  };

  const openAddLocaleModal = () => {
    setNewLocaleForm({ code: '', name: '' });
    setSelectedPreset('');
    setAddLocaleError('');
    setActiveModal('addLocale');
  };

  const handleAddLocaleSubmit = () => {
    const code = newLocaleForm.code.trim().toLowerCase();
    const name = newLocaleForm.name.trim() || code.toUpperCase();

    if (!code) {
      setAddLocaleError('Vui lòng nhập mã ngôn ngữ!');
      return;
    }
    if (config?.locales?.some(l => l.code.trim().toLowerCase() === code)) {
      setAddLocaleError('Mã ngôn ngữ này đã tồn tại!');
      return;
    }

    setConfig(prev => ({
      ...prev,
      locales: [...prev.locales, { code, name, isSource: false, filePath: '' }]
    }));
    setActiveModal(null);
    setNewLocaleForm({ code: '', name: '' });
    setAddLocaleError('');
  };

  const removeLocale = (code) => {
    const targetCode = String(code).trim().toLowerCase();
    if (targetCode === 'vi') {
      alert('Không thể xóa ngôn ngữ nguồn Tiếng Việt (VI)');
      return;
    }
    setConfig(prev => ({
      ...prev,
      locales: prev.locales.filter(l => l.code.trim().toLowerCase() !== targetCode)
    }));
  };

  const selectView = (view) => {
    setActiveView(view);
    setSidebarOpen(false);
  };

  if (!config) {
    return (
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-logo"><Languages size={19} /></div>
            <div>
              <div className="brand-title">i18n Studio</div>
              <div className="brand-sub">Translation Studio</div>
            </div>
          </div>
        </aside>
        <div className="workspace" style={{ placeItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-muted)' }}>
            <RefreshCw className="animate-spin" size={22} /> Đang tải cấu hình Studio...
          </div>
        </div>
      </div>
    );
  }

  const renderModal = () => {
    if (!activeModal) return null;

    let title = '';
    let modalIcon = null;
    let content = null;

    const targetLocales = config.locales.filter(l => !l.isSource);

    if (activeModal === 'files') {
      title = 'Danh sách Files phân tích';
      modalIcon = <Files size={18} color="#38bdf8" />;
      
      const fileList = results?.files || [];
      const filteredFiles = fileList.filter(f => 
        getRelativePath(f).toLowerCase().includes(modalSearch.toLowerCase())
      );

      content = (
        <div>
          <div className="modal-search-wrapper" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="input-text"
                placeholder="Tìm kiếm file..."
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            </div>
          </div>

          <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {filteredFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)' }}>Không tìm thấy file nào.</div>
            ) : (
              filteredFiles.map((file, idx) => {
                const relPath = getRelativePath(file);
                return (
                  <div key={idx} className="modal-list-item">
                    <span className="modal-item-path">{relPath}</span>
                    <div className="modal-item-action">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleCopy(file)}
                        style={{ padding: 4 }}
                        title="Copy đường dẫn tuyệt đối"
                      >
                        {copiedText === file ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      );
    } else if (activeModal === 'occurrences') {
      title = 'Chi tiết Vị trí phát hiện';
      modalIcon = <Activity size={18} color="#f59e0b" />;

      const occList = results?.occurrences || [];
      const filteredOccs = occList.filter(occ => 
        (occ.vi || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
        (occ.key || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
        getRelativePath(occ.file).toLowerCase().includes(modalSearch.toLowerCase()) ||
        (occ.kind || '').toLowerCase().includes(modalSearch.toLowerCase())
      );

      content = (
        <div>
          <div className="modal-search-wrapper" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="input-text"
                placeholder="Tìm kiếm theo file, từ khóa, chuỗi gốc..."
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            </div>
          </div>

          <div className="table-wrap" style={{ maxHeight: '50vh' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>File / Vị trí</th>
                  <th style={{ width: '15%' }}>Loại</th>
                  <th style={{ width: '25%' }}>Chuỗi gốc (VI)</th>
                  <th style={{ width: '25%' }}>Khóa gán</th>
                </tr>
              </thead>
              <tbody>
                {filteredOccs.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)' }}>Không tìm thấy vị trí nào.</td>
                  </tr>
                ) : (
                  filteredOccs.map((occ, idx) => {
                    let badgeClass = 'badge-blue';
                    let kindLabel = occ.kind;
                    if (occ.kind === 'template-attr') {
                      badgeClass = 'badge-orange';
                      kindLabel = occ.attrName ? `attr: ${occ.attrName}` : 'attr';
                    } else if (occ.kind === 'template-text') {
                      badgeClass = 'badge-blue';
                      kindLabel = 'text';
                    } else if (occ.kind === 'vue-script' || occ.kind === 'js-script') {
                      badgeClass = 'badge-purple';
                      kindLabel = 'script';
                    }

                    return (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}>
                          <span style={{ color: 'var(--info)' }}>{getRelativePath(occ.file)}</span>
                          {occ.start !== undefined && (
                            <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>({occ.start}-{occ.end})</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`} style={{ fontSize: 10 }}>{kindLabel}</span>
                        </td>
                        <td style={{ wordBreak: 'break-all' }}>{occ.vi}</td>
                        <td className="key-cell" style={{ wordBreak: 'break-all' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span>{occ.key}</span>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleCopy(occ.key)}
                              style={{ padding: 3, flexShrink: 0 }}
                              title="Copy khóa"
                            >
                              {copiedText === occ.key ? <Check size={11} color="#22c55e" /> : <Copy size={11} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    } else if (activeModal === 'newKeys' || activeModal === 'reusedKeys') {
      const isReusedType = activeModal === 'reusedKeys';
      title = isReusedType ? 'Danh sách Khóa tái sử dụng' : 'Danh sách Khóa mới sinh';
      modalIcon = isReusedType ? <RefreshCw size={18} color="#c084fc" /> : <SlidersHorizontal size={18} color="#22c55e" />;

      const entries = (results?.newEntries || []).filter(e => e.isReused === isReusedType);
      const filteredEntries = entries.filter(e => 
        (e.key || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
        (e.vi || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
        targetLocales.some(loc => (e[loc.code] || '').toLowerCase().includes(modalSearch.toLowerCase()))
      );

      content = (
        <div>
          <div className="modal-search-wrapper" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="input-text"
                placeholder="Tìm kiếm theo khóa, dịch..."
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            </div>
          </div>

          <div className="table-wrap" style={{ maxHeight: '50vh' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Khóa (Key)</th>
                  <th>Gốc (VI)</th>
                  {targetLocales.map(loc => (
                    <th key={loc.code}>Dịch ({loc.code.toUpperCase()})</th>
                  ))}
                  <th style={{ width: 80, textHeading: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={3 + targetLocales.length} style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)' }}>Không tìm thấy bản ghi nào.</td>
                  </tr>
                ) : (
                  filteredEntries.map((row, idx) => (
                    <tr key={idx}>
                      <td className="key-cell" style={{ wordBreak: 'break-all' }}>{row.key}</td>
                      <td>{row.vi}</td>
                      {targetLocales.map(loc => (
                        <td key={loc.code}>{row[loc.code] || '-'}</td>
                      ))}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleCopy(row.key)}
                          style={{ padding: 4 }}
                          title="Copy khóa"
                        >
                          {copiedText === row.key ? <Check size={13} color="#22c55e" /> : <Copy size={13} />}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      );
    } else if (activeModal === 'reviews') {
      title = 'Cảnh báo duyệt';
      modalIcon = <AlertTriangle size={18} color="#ef4444" />;

      const reviewList = results?.reviews || [];
      const filteredReviews = reviewList.filter(rev => 
        (rev.msg || '').toLowerCase().includes(modalSearch.toLowerCase()) ||
        getRelativePath(rev.file).toLowerCase().includes(modalSearch.toLowerCase())
      );

      content = (
        <div>
          <div className="modal-search-wrapper" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="input-text"
                placeholder="Tìm kiếm lỗi/file..."
                value={modalSearch}
                onChange={e => setModalSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
              <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            </div>
          </div>

          <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
            {filteredReviews.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-faint)' }}>Không có cảnh báo duyệt nào.</div>
            ) : (
              filteredReviews.map((rev, idx) => (
                <div key={idx} className="modal-list-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="modal-item-path" style={{ fontWeight: 600 }}>{getRelativePath(rev.file)}</span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCopy(rev.file)}
                      style={{ padding: 4 }}
                      title="Copy file path"
                    >
                      {copiedText === rev.file ? <Check size={12} color="#22c55e" /> : <Copy size={12} />}
                    </button>
                  </div>
                  <div style={{ color: 'var(--danger)', fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                    <span>{rev.msg}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    } else if (activeModal === 'addLocale') {
      title = 'Thêm Ngôn Ngữ Mới';
      modalIcon = <Plus size={18} color="#22c55e" />;

      content = (
        <form onSubmit={(e) => { e.preventDefault(); handleAddLocaleSubmit(); }}>
          <div style={{ display: 'grid', gap: 14 }}>
            {addLocaleError && (
              <div style={{ color: 'var(--danger)', fontSize: 13, background: 'var(--danger-dim)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                ⚠️ {addLocaleError}
              </div>
            )}

            <div>
              <label className="field-label">Chọn ngôn ngữ hỗ trợ:</label>
              <select
                className="input-text"
                value={selectedPreset}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedPreset(val);
                  if (val === 'custom') {
                    setNewLocaleForm({ code: '', name: '' });
                  } else if (val) {
                    const lang = SUPPORTED_LANGUAGES.find(l => l.code === val);
                    if (lang) {
                      setNewLocaleForm({ code: lang.code, name: lang.name });
                    }
                  }
                  setAddLocaleError('');
                }}
              >
                <option value="">-- Chọn từ danh sách ngôn ngữ hỗ trợ --</option>
                {SUPPORTED_LANGUAGES.map(lang => {
                  const isAdded = config?.locales?.some(l => l.code.trim().toLowerCase() === lang.code.toLowerCase());
                  return (
                    <option key={lang.code} value={lang.code} disabled={isAdded}>
                      {lang.name} [{lang.code}] {isAdded ? '✓ (Đã có trong hệ thống)' : ''}
                    </option>
                  );
                })}
                <option value="custom">✏️ Nhập mã ngôn ngữ khác (Tùy chỉnh)...</option>
              </select>
            </div>

            <div className="form-grid">
              <div>
                <label className="field-label">Mã ngôn ngữ (Language Code):</label>
                <input
                  type="text"
                  className="input-text"
                  placeholder="ví dụ: zh, ja, ko, th..."
                  value={newLocaleForm.code}
                  onChange={e => {
                    setNewLocaleForm(prev => ({ ...prev, code: e.target.value }));
                    setSelectedPreset('custom');
                    setAddLocaleError('');
                  }}
                />
              </div>

              <div>
                <label className="field-label">Tên hiển thị (Display Name):</label>
                <input
                  type="text"
                  className="input-text"
                  placeholder="ví dụ: Tiếng Trung (ZH)"
                  value={newLocaleForm.name}
                  onChange={e => setNewLocaleForm(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </form>
      );
    }

    return (
      <div className="modal-overlay" onClick={() => setActiveModal(null)}>
        <div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              {modalIcon}
              <span>{title}</span>
            </div>
            <button className="modal-close" onClick={() => setActiveModal(null)} aria-label="Đóng">
              <X size={18} />
            </button>
          </div>
          <div className="modal-body">
            {content}
          </div>
          <div className="modal-footer">
            {activeModal === 'addLocale' ? (
              <>
                <button className="btn btn-secondary" style={{ marginRight: 8 }} onClick={() => setActiveModal(null)}>Hủy</button>
                <button className="btn btn-primary" onClick={handleAddLocaleSubmit}>Thêm Ngôn Ngữ</button>
              </>
            ) : (
              <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Đóng</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const ActiveIcon = VIEWS[activeView].icon;

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo"><Languages size={19} /></div>
          <div>
            <div className="brand-title">i18n Studio</div>
            <div className="brand-sub">Translation Studio</div>
          </div>
        </div>

        <nav className="nav-scroll">
          {NAV_GROUPS.map(group => (
            <React.Fragment key={group.label}>
              <div className="nav-group">{group.label}</div>
              {group.items.map(key => {
                const Icon = VIEWS[key].icon;
                return (
                  <div
                    key={key}
                    className={`nav-item ${activeView === key ? 'active' : ''}`}
                    onClick={() => selectView(key)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter') selectView(key); }}
                  >
                    <Icon size={17} />
                    <span>{VIEWS[key].label}</span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-line">
            <span className={`dot ${serverOnline ? 'online' : 'offline'}`} />
            <span className="s-label">{serverOnline ? 'Server đang chạy' : 'Server offline'}</span>
          </div>
          <div className="version">
            {window.i18nStudio?.isDesktop
              ? `Desktop · Electron ${window.i18nStudio?.versions?.electron || ''}`
              : 'Web · v1.0.0'}
          </div>
        </div>
      </aside>

      {/* Workspace */}
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <ActiveIcon size={18} color="#22c55e" />
            <div>
              <h1>{VIEWS[activeView].label}</h1>
              <p>{VIEWS[activeView].sub}</p>
            </div>
          </div>
          <div className="topbar-right">
            <span className="badge badge-green">
              {serverOnline ? '● Online' : '○ Offline'}
            </span>
            <button className="menu-toggle" onClick={() => setSidebarOpen(o => !o)} aria-label="Mở menu">
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </header>

        <main className="content">
          {/* TAB 1: STATIC SCAN */}
          {activeView === 'static' && (
            <div>
              <div className="view-head">
                <div>
                  <h2><FileCode size={19} color="#22c55e" /> Bóc tách Chuỗi Tĩnh & Refactor</h2>
                  <p>Quét chuỗi tiếng Việt hardcode trong file Vue/JS, sinh khóa và dịch tự động</p>
                </div>
              </div>

              <div className="card">
                <div className="options-row">
                  <label className="opt-check">
                    <input
                      type="checkbox"
                      checked={options.dryRun}
                      onChange={e => setOptions(prev => ({ ...prev, dryRun: e.target.checked }))}
                    />
                    Chế độ Xem trước (Dry Run — không ghi đè file)
                  </label>

                  <label className="opt-check">
                    <input
                      type="checkbox"
                      checked={options.autoRefactor}
                      onChange={e => setOptions(prev => ({ ...prev, autoRefactor: e.target.checked }))}
                    />
                    Tự động Refactor mã nguồn sang $t()
                  </label>

                  {loading ? (
                    <button
                      className="btn btn-danger"
                      onClick={handleStopExtract}
                      style={{ marginLeft: 'auto' }}
                    >
                      <Square size={14} fill="currentColor" /> Dừng Quét
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={handleRunStaticExtract}
                      style={{ marginLeft: 'auto' }}
                    >
                      <Play size={16} /> Bắt đầu Thực thi Quét
                    </button>
                  )}
                </div>

                {results && (
                  <div>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                      <div className="stat-card" onClick={() => { setActiveModal('files'); setModalSearch(''); }}>
                        <div className="stat-label"><Files size={13} /> Files phân tích</div>
                        <div className="stat-value" style={{ color: '#38bdf8' }}>{results.stats.totalFiles}</div>
                      </div>
                      <div className="stat-card" onClick={() => { setActiveModal('occurrences'); setModalSearch(''); }}>
                        <div className="stat-label"><Activity size={13} /> Vị trí phát hiện</div>
                        <div className="stat-value" style={{ color: '#f59e0b' }}>{results.stats.totalOccurrences}</div>
                      </div>
                      <div className="stat-card" onClick={() => { setActiveModal('newKeys'); setModalSearch(''); }}>
                        <div className="stat-label"><SlidersHorizontal size={13} /> Khóa mới sinh</div>
                        <div className="stat-value" style={{ color: '#22c55e' }}>{results.stats.newKeysCount}</div>
                      </div>
                      <div className="stat-card" onClick={() => { setActiveModal('reusedKeys'); setModalSearch(''); }}>
                        <div className="stat-label"><RefreshCw size={13} /> Khóa tái sử dụng</div>
                        <div className="stat-value" style={{ color: '#c084fc' }}>{results.stats.reusedKeysCount || 0}</div>
                      </div>
                      <div className="stat-card" onClick={() => { setActiveModal('reviews'); setModalSearch(''); }}>
                        <div className="stat-label"><AlertTriangle size={13} /> Cảnh báo duyệt</div>
                        <div className="stat-value" style={{ color: '#ef4444' }}>{results.stats.reviewsCount}</div>
                      </div>
                    </div>

                    <div className="download-bar">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Download size={14} /> Tải file ngôn ngữ mới:
                      </span>
                      {config.locales.map(loc => (
                        <button
                          key={loc.code}
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleDownloadLang(loc.code)}
                        >
                          {loc.code.toUpperCase()} (.php)
                        </button>
                      ))}
                    </div>

                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th style={{ width: '30%' }}>Khóa (Key)</th>
                            <th style={{ width: '15%' }}>Trạng thái</th>
                            <th>Gốc (VI)</th>
                            {config.locales.filter(l => !l.isSource).map(loc => (
                              <th key={loc.code}>Dịch ({loc.code.toUpperCase()})</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {results.newEntries.map((row, idx) => (
                            <tr key={idx}>
                              <td className="key-cell">{row.key}</td>
                              <td>
                                {row.isReused ? (
                                  <span className="badge badge-purple" style={{ fontSize: 11 }}>Tái sử dụng</span>
                                ) : (
                                  <span className="badge badge-green" style={{ fontSize: 11 }}>Khóa mới</span>
                                )}
                              </td>
                              <td>{row.vi}</td>
                              {config.locales.filter(l => !l.isSource).map(loc => (
                                <td key={loc.code}>{row[loc.code] || '-'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DYNAMIC API SCAN */}
          {activeView === 'dynamic' && (
            <div>
              <div className="view-head">
                <div>
                  <h2><Database size={19} color="#38bdf8" /> Phân Tích API & Database</h2>
                  <p>Gọi các API thực tế để phát hiện các trường tiếng Việt cần dịch và ghi vào config/translation.php</p>
                </div>
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
                    📋 Danh sách API URLs & Bảng DB tương ứng ({dynamicForm.items.length})
                  </h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={handleAddApiItem}>
                      <Plus size={14} /> Thêm URL API
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={handleSaveApiItemsConfig}>
                      Lưu cấu hình API
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {dynamicForm.items.map((item, idx) => (
                    <div key={item.id || idx} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', width: 20 }}>#{idx + 1}</span>
                      <input
                        type="text"
                        className="input-text"
                        placeholder="API URL (ví dụ: https://bandoso-daklak.rynansaas.com/api/v1/public/cay-trong)"
                        style={{ flex: 2 }}
                        value={item.apiUrl}
                        onChange={e => handleApiItemChange(item.id, 'apiUrl', e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-text"
                        placeholder="Tên bảng DB (ví dụ: nongnghiep_caytrong)"
                        style={{ flex: 1 }}
                        value={item.tableName}
                        onChange={e => handleApiItemChange(item.id, 'tableName', e.target.value)}
                      />
                      {dynamicForm.items.length > 1 && (
                        <button
                          className="btn btn-icon btn-danger-ghost"
                          title="Xóa URL này"
                          onClick={() => handleRemoveApiItem(item.id)}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'grid', gap: 14 }}>
                  <div style={{ background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={dynamicForm.auth.enabled}
                        onChange={e => handleAuthChange('enabled', e.target.checked)}
                      />
                      <span>🔐 Sử dụng Xác thực / Đăng nhập Admin (Dành cho API yêu cầu đăng nhập)</span>
                    </label>

                    {dynamicForm.auth.enabled && (
                      <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <div style={{ width: 110 }}>
                            <label className="field-label">Phương thức:</label>
                            <select
                              className="input-text"
                              value={dynamicForm.auth.authMethod || 'POST'}
                              onChange={e => handleAuthChange('authMethod', e.target.value)}
                            >
                              <option value="POST">POST</option>
                              <option value="GET">GET</option>
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <label className="field-label">URL API Đăng Nhập Admin (Auth Login URL):</label>
                            <input
                              type="text"
                              className="input-text"
                              placeholder="https://bandoso-daklak.rynansaas.com/api/v1/auth/login"
                              value={dynamicForm.auth.authUrl}
                              onChange={e => handleAuthChange('authUrl', e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-grid">
                          <div>
                            <label className="field-label">Tài khoản / Username / Email:</label>
                            <input
                              type="text"
                              className="input-text"
                              placeholder="admin"
                              value={dynamicForm.auth.username}
                              onChange={e => handleAuthChange('username', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="field-label">Mật khẩu / Password:</label>
                            <input
                              type="password"
                              className="input-text"
                              placeholder="••••••••"
                              value={dynamicForm.auth.password}
                              onChange={e => handleAuthChange('password', e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-grid">
                          <div>
                            <label className="field-label">Tên Header xác thực (Token Header):</label>
                            <input
                              type="text"
                              className="input-text"
                              placeholder="Authorization"
                              value={dynamicForm.auth.tokenHeader}
                              onChange={e => handleAuthChange('tokenHeader', e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="field-label">Tiền tố Token (Prefix):</label>
                            <input
                              type="text"
                              className="input-text"
                              placeholder="Bearer "
                              value={dynamicForm.auth.tokenPrefix}
                              onChange={e => handleAuthChange('tokenPrefix', e.target.value)}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleTestLogin}
                            disabled={testingLogin}
                          >
                            {testingLogin ? 'Đang kiểm tra...' : '🔑 Kiểm tra Đăng Nhập thử'}
                          </button>
                        </div>

                        {loginTestResult && (
                          <div style={{
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 12,
                            background: loginTestResult.success ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: loginTestResult.success ? '#22c55e' : '#ef4444',
                            border: `1px solid ${loginTestResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                          }}>
                            {loginTestResult.message}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="field-label">Đường dẫn file config translation PHP (config/translation.php):</label>
                    <input
                      type="text"
                      className="input-text"
                      placeholder="D:\H_SourceCode\SAAS\bandoso_daklak\config\translation.php"
                      value={dynamicForm.translationFilePath}
                      onChange={e => setDynamicForm(prev => ({ ...prev, translationFilePath: e.target.value }))}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={dynamicForm.writeToFile}
                      onChange={e => setDynamicForm(prev => ({ ...prev, writeToFile: e.target.checked }))}
                    />
                    <span>Tự động ghi/gộp kết quả vào file config/translation.php sau khi quét</span>
                  </label>

                  {loading ? (
                    <button
                      className="btn btn-danger"
                      style={{ justifySelf: 'flex-start', marginTop: 4 }}
                      onClick={handleStopExtract}
                    >
                      <Square size={14} fill="currentColor" /> Dừng Quét
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ justifySelf: 'flex-start', marginTop: 4 }}
                      onClick={handleRunDynamicExtract}
                    >
                      <Play size={16} /> Quét & Phân Tích Cấu Trúc ({dynamicForm.items.length} API)
                    </button>
                  )}
                </div>

                {dynamicResults && (
                  <div style={{ marginTop: 24, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, color: '#22c55e', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        ✅ Kết quả phát hiện các trường dữ liệu cần dịch:
                      </h3>
                      {dynamicResults.mappedTables && Object.keys(dynamicResults.mappedTables).length > 0 && (
                        <button className="btn btn-secondary btn-sm" onClick={handleWriteTranslationFile} disabled={loading}>
                          📝 Ghi vào config/translation.php
                        </button>
                      )}
                    </div>

                    {Object.keys(dynamicResults.mappedTables || {}).length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Không tìm thấy trường dữ liệu tiếng Việt nào mới.</p>
                    ) : (
                      Object.keys(dynamicResults.mappedTables).map(tbl => (
                        <div key={tbl} style={{ marginBottom: 12 }}>
                          <span className="badge badge-blue">Bảng: {tbl}</span>
                          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {dynamicResults.mappedTables[tbl].map(f => (
                              <span key={f} className="badge badge-green">{f}</span>
                            ))}
                          </div>
                        </div>
                      ))
                    )}

                    {dynamicResults.writeResult && (
                      <div style={{ marginTop: 16, padding: 12, borderRadius: 'var(--radius)', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', fontSize: 13 }}>
                        <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>
                          🎉 Đã cập nhật thành công file config/translation.php!
                        </div>
                        <div style={{ color: 'var(--text-main)', fontSize: 12 }}>
                          📁 Đường dẫn: <code>{dynamicResults.writeResult.filePath}</code><br />
                          ✨ Đã gộp {dynamicResults.writeResult.addedFieldsCount} trường mới vào {dynamicResults.writeResult.totalTables} bảng dữ liệu.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: CONFIGURATION */}
          {activeView === 'config' && (
            <div>
              <div className="view-head">
                <div>
                  <h2><Settings size={19} color="#f59e0b" /> Cấu hình Đường dẫn & Ngôn ngữ</h2>
                  <p>Thiết lập project root, quy tắc sinh khóa và danh sách ngôn ngữ hỗ trợ</p>
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label className="field-label">Thư mục / File Dự án (Project Root):</label>
                    <input
                      type="text"
                      className="input-text"
                      value={config.projectRoot}
                      onChange={e => setConfig(prev => ({ ...prev, projectRoot: e.target.value }))}
                    />
                  </div>

                  <div className="form-grid">
                    <div>
                      <label className="field-label">Tiền tố Khóa (Key Prefix):</label>
                      <input
                        type="text"
                        className="input-text"
                        value={config.prefix}
                        onChange={e => setConfig(prev => ({ ...prev, prefix: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="field-label">Tên file Ngôn ngữ (Language File):</label>
                      <input
                        type="text"
                        className="input-text"
                        value={config.langFileName}
                        onChange={e => setConfig(prev => ({ ...prev, langFileName: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label className="field-label" style={{ marginBottom: 0 }}>Danh sách Ngôn ngữ Hỗ trợ:</label>
                      <button className="btn btn-secondary btn-sm" onClick={openAddLocaleModal}>
                        <Plus size={14} /> Thêm ngôn ngữ
                      </button>
                    </div>
                    <div className="locale-list">
                      {config.locales.map((loc) => (
                        <div key={loc.code} className="locale-row">
                          <div className="locale-head">
                            <span className="chip">
                              <code>{loc.code.toUpperCase()}</code>
                              <small>({loc.name})</small>
                              {loc.isSource && <small style={{ color: 'var(--accent)' }}>nguồn</small>}
                            </span>
                            {!loc.isSource && (
                              <button className="btn btn-danger-ghost btn-sm" onClick={() => removeLocale(loc.code)}>
                                <Trash2 size={13} /> Xóa
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            className="input-text"
                            placeholder={`Mặc định: resources/lang/${loc.code}/${config.langFileName || 'messages.php'}`}
                            value={loc.filePath || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setConfig(prev => ({
                                ...prev,
                                locales: prev.locales.map(l => l.code === loc.code ? { ...l, filePath: val } : l)
                              }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <button className="btn btn-primary" onClick={handleSaveConfig}>
                      Lưu Cấu Hình
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Terminal */}
        <section className={`terminal ${terminalOpen ? '' : 'collapsed'}`}>
          <div className="terminal-head" onClick={() => setTerminalOpen(o => !o)}>
            <span className="t-title">
              <Terminal size={15} color="#38bdf8" /> Terminal
            </span>
            <span className="t-count">{logs.length} dòng</span>
            <div className="t-actions">
              {loading && (
                <button
                  className="btn btn-danger btn-sm"
                  style={{ padding: '3px 9px', marginRight: 4 }}
                  onClick={(e) => { e.stopPropagation(); handleStopExtract(); }}
                >
                  <Square size={12} fill="currentColor" /> Dừng
                </button>
              )}
              <button
                className="btn btn-secondary btn-sm"
                style={{ padding: '3px 9px' }}
                onClick={(e) => { e.stopPropagation(); setLogs([]); }}
              >
                Xóa log
              </button>
              {terminalOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
            </div>
          </div>
          <div className="terminal-body">
            {logs.length === 0 ? (
              <div className="terminal-empty">Chưa có nhật ký hoạt động nào. Hãy nhấn "Bắt đầu Thực thi" để chạy...</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="log-line">
                  <span className="log-time">[{log.timestamp}]</span>
                  <span className={`log-msg ${logClass(log.message, log.type)}`}>{log.message}</span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </section>
      </div>
      {renderModal()}
    </div>
  );
}