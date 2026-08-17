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
    apiUrl: 'https://bandoso-daklak.rynansaas.com/api-ui/quan-ly-gioi-thieu-xa-phuong/get-active-communes',
    tableName: 'gioi_thieu_xa_phuong'
  });

  const [options, setOptions] = useState({
    dryRun: true,
    autoRefactor: false
  });

  const logsEndRef = useRef(null);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setConfig(data.data);
          setServerOnline(true);
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

  const handleRunStaticExtract = async () => {
    setLoading(true);
    setResults(null);
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: '--- BẮT ĐẦU PHIÊN QUÉT TĨNH MỚI ---', type: 'info' }]);

    try {
      const res = await fetch('/api/extract/static', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          ...options
        })
      });
      const data = await res.json();
      if (data.success) {
        setResults(data);
      } else {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ ${data.error}`, type: 'error' }]);
      }
    } catch (err) {
      setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ Lỗi kết nối API: ${err.message}`, type: 'error' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleRunDynamicExtract = async () => {
    setLoading(true);
    setDynamicResults(null);
    setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: '--- BẮT ĐẦU QUÉT DỮ LIỆU ĐỘNG API ---', type: 'info' }]);

    try {
      const res = await fetch('/api/extract/dynamic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dynamicForm)
      });
      const data = await res.json();
      if (data.success) {
        setDynamicResults(data);
      } else {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ ${data.error}`, type: 'error' }]);
      }
    } catch (err) {
      setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: `❌ ${err.message}`, type: 'error' }]);
    } finally {
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

  const addLocale = () => {
    const code = prompt('Nhập mã ngôn ngữ mới (ví dụ: ja, ko, th, fr):');
    if (!code) return;
    const name = prompt('Nhập tên hiển thị (ví dụ: Japanese, Korean):', code.toUpperCase());
    if (config.locales.some(l => l.code === code.toLowerCase())) {
      alert('Mã ngôn ngữ này đã tồn tại!');
      return;
    }
    setConfig(prev => ({
      ...prev,
      locales: [...prev.locales, { code: code.toLowerCase(), name: name || code.toUpperCase(), isSource: false, filePath: '' }]
    }));
  };

  const removeLocale = (code) => {
    if (code === 'vi') {
      alert('Không thể xóa ngôn ngữ nguồn Tiếng Việt (VI)');
      return;
    }
    setConfig(prev => ({
      ...prev,
      locales: prev.locales.filter(l => l.code !== code)
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
    if (!activeModal || !results) return null;

    let title = '';
    let modalIcon = null;
    let content = null;

    const targetLocales = config.locales.filter(l => !l.isSource);

    if (activeModal === 'files') {
      title = 'Danh sách Files phân tích';
      modalIcon = <Files size={18} color="#38bdf8" />;
      
      const fileList = results.files || [];
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

      const occList = results.occurrences || [];
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

      const entries = (results.newEntries || []).filter(e => e.isReused === isReusedType);
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

      const reviewList = results.reviews || [];
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
            <button className="btn btn-secondary" onClick={() => setActiveModal(null)}>Đóng</button>
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

                  <button
                    className="btn btn-primary"
                    onClick={handleRunStaticExtract}
                    disabled={loading}
                    style={{ marginLeft: 'auto' }}
                  >
                    {loading ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                    {loading ? 'Đang chạy...' : 'Bắt đầu Thực thi Quét'}
                  </button>
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
                            <th>Dịch (EN)</th>
                            <th>Dịch (ZH)</th>
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
                              <td>{row.en || '-'}</td>
                              <td>{row.zh || '-'}</td>
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
                  <h2><Database size={19} color="#38bdf8" /> Phân Tích API / Database</h2>
                  <p>Gọi API thực tế để phát hiện các trường dữ liệu tiếng Việt cần dịch</p>
                </div>
              </div>

              <div className="card">
                <div style={{ display: 'grid', gap: 14 }}>
                  <div>
                    <label className="field-label">Đường dẫn API URL kiểm tra:</label>
                    <input
                      type="text"
                      className="input-text"
                      value={dynamicForm.apiUrl}
                      onChange={e => setDynamicForm(prev => ({ ...prev, apiUrl: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label">Tên bảng Database tương ứng:</label>
                    <input
                      type="text"
                      className="input-text"
                      value={dynamicForm.tableName}
                      onChange={e => setDynamicForm(prev => ({ ...prev, tableName: e.target.value }))}
                    />
                  </div>

                  <button
                    className="btn btn-primary"
                    style={{ justifySelf: 'flex-start', marginTop: 4 }}
                    onClick={handleRunDynamicExtract}
                    disabled={loading}
                  >
                    {loading ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                    {loading ? 'Đang quét...' : 'Quét & Phân Tích Cấu Trúc'}
                  </button>
                </div>

                {dynamicResults && (
                  <div style={{ marginTop: 20, background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: '#22c55e', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      ✅ Kết quả phát hiện các trường dữ liệu cần dịch:
                    </h3>
                    {Object.keys(dynamicResults.mappedTables).map(tbl => (
                      <div key={tbl} style={{ marginBottom: 10 }}>
                        <span className="badge badge-blue">Bảng: {tbl}</span>
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {dynamicResults.mappedTables[tbl].map(f => (
                            <span key={f} className="badge badge-green">{f}</span>
                          ))}
                        </div>
                      </div>
                    ))}
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
                      <button className="btn btn-secondary btn-sm" onClick={addLocale}>
                        <Plus size={14} /> Thêm ngôn ngữ
                      </button>
                    </div>
                    <div className="locale-list">
                      {config.locales.map((loc, i) => (
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
                              const locales = [...config.locales];
                              locales[i] = { ...locales[i], filePath: e.target.value };
                              setConfig(prev => ({ ...prev, locales }));
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