import React, { useState, useEffect, useRef } from 'react';
import { 
  Languages, 
  Settings, 
  FileCode, 
  Database, 
  Play, 
  Terminal, 
  Download, 
  Plus, 
  Trash2, 
  RefreshCw, 
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('static'); // 'static' | 'dynamic' | 'config'
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState(null);
  const [dynamicResults, setDynamicResults] = useState(null);
  const [dynamicForm, setDynamicForm] = useState({
    apiUrl: 'https://bandoso-daklak.rynansaas.com/api-ui/quan-ly-gioi-thieu-xa-phuong/get-active-communes',
    tableName: 'gioi_thieu_xa_phuong'
  });

  const [options, setOptions] = useState({
    dryRun: true,
    autoRefactor: false
  });

  const logsEndRef = useRef(null);

  // Load config ban đầu
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.success) setConfig(data.data);
      })
      .catch(err => console.error('Lỗi load config:', err));

    // Lắng nghe SSE Logs Realtime
    const eventSource = new EventSource('/api/logs');
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setLogs(prev => [...prev, payload]);
      } catch (err) {}
    };

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
        alert('✅ Đã lưu cấu hình thành công!');
      }
    } catch (err) {
      alert('❌ Lỗi lưu cấu hình: ' + err.message);
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
        alert('Lỗi: ' + data.error);
      }
    } catch (err) {
      alert('Lỗi kết nối API: ' + err.message);
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
        alert('Lỗi: ' + data.error);
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
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
      alert('Lỗi download: ' + err.message);
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
      locales: [...prev.locales, { code: code.toLowerCase(), name: name || code.toUpperCase(), isSource: false }]
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

  if (!config) {
    return (
      <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: '#94a3b8' }}>
        <RefreshCw className="animate-spin" size={24} style={{ marginRight: 10 }} /> Đang tải cấu hình Studio...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ background: 'linear-gradient(135deg, #2563eb, #7c3aed)', padding: 12, borderRadius: 12 }}>
            <Languages size={28} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>i18n Translation Studio</h1>
            <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 2 }}>Dashboard tự động bóc tách & dịch thuật đa ngôn ngữ độc lập</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            className={`btn ${activeTab === 'static' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('static')}
          >
            <FileCode size={16} /> Quét Mã Nguồn (Vue/JS)
          </button>
          <button 
            className={`btn ${activeTab === 'dynamic' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('dynamic')}
          >
            <Database size={16} /> Quét API & DB
          </button>
          <button 
            className={`btn ${activeTab === 'config' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('config')}
          >
            <Settings size={16} /> Cấu hình Hệ thống
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 24 }}>
        {/* Left Column: Functionalities */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* TAB 1: STATIC SCAN */}
          {activeTab === 'static' && (
            <div className="card">
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileCode size={18} color="#60a5fa" /> Bóc tách Chuỗi Tĩnh & Refactor Tự động
              </h2>

              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input 
                    type="checkbox" 
                    checked={options.dryRun} 
                    onChange={e => setOptions(prev => ({ ...prev, dryRun: e.target.checked }))} 
                  />
                  <span>Chế độ Xem trước (Dry Run - không ghi đè file)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                  <input 
                    type="checkbox" 
                    checked={options.autoRefactor} 
                    onChange={e => setOptions(prev => ({ ...prev, autoRefactor: e.target.checked }))} 
                  />
                  <span>Tự động Refactor mã nguồn sang $t()</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <button 
                  className="btn btn-primary" 
                  onClick={handleRunStaticExtract} 
                  disabled={loading}
                  style={{ padding: '10px 20px', fontSize: 15 }}
                >
                  {loading ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                  Bắt đầu Thực thi Quét
                </button>
              </div>

              {/* Kết quả thống kê */}
              {results && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                    <div style={{ background: '#090d16', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Files phân tích</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#60a5fa' }}>{results.stats.totalFiles}</div>
                    </div>
                    <div style={{ background: '#090d16', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Vị trí phát hiện</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{results.stats.totalOccurrences}</div>
                    </div>
                    <div style={{ background: '#090d16', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Khóa mới sinh</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#10b981' }}>{results.stats.newKeysCount}</div>
                    </div>
                    <div style={{ background: '#090d16', padding: 12, borderRadius: 8, border: '1px solid #1e293b' }}>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>Cảnh báo duyệt</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{results.stats.reviewsCount}</div>
                    </div>
                  </div>

                  {/* Tải về các file */}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, background: '#090d16', padding: 12, borderRadius: 8 }}>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}><Download size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Tải file ngôn ngữ:</span>
                    {config.locales.map(loc => (
                      <button 
                        key={loc.code} 
                        className="btn btn-secondary" 
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => handleDownloadLang(loc.code)}
                      >
                        {loc.code.toUpperCase()} (.php)
                      </button>
                    ))}
                  </div>

                  {/* Bảng danh sách khóa dịch */}
                  <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid #1e293b', borderRadius: 8 }}>
                    <table className="table-custom">
                      <thead>
                        <tr>
                          <th>Khóa (Key)</th>
                          <th>Gốc (VI)</th>
                          <th>Dịch (EN)</th>
                          <th>Dịch (ZH)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.newEntries.map((row, idx) => (
                          <tr key={idx}>
                            <td style={{ color: '#38bdf8', fontWeight: 500 }}>{row.key}</td>
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
          )}

          {/* TAB 2: DYNAMIC API SCAN */}
          {activeTab === 'dynamic' && (
            <div className="card">
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Database size={18} color="#34d399" /> Phân Tích & Tự Động Thiết Lập Dịch API / Database
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Đường dẫn API URL kiểm tra:</label>
                  <input 
                    type="text" 
                    className="input-text" 
                    value={dynamicForm.apiUrl} 
                    onChange={e => setDynamicForm(prev => ({ ...prev, apiUrl: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Tên bảng Database tương ứng:</label>
                  <input 
                    type="text" 
                    className="input-text" 
                    value={dynamicForm.tableName} 
                    onChange={e => setDynamicForm(prev => ({ ...prev, tableName: e.target.value }))}
                  />
                </div>

                <button 
                  className="btn btn-success" 
                  style={{ alignSelf: 'flex-start', marginTop: 8 }}
                  onClick={handleRunDynamicExtract}
                  disabled={loading}
                >
                  {loading ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                  Quét & Phân Tích Cấu Trúc
                </button>
              </div>

              {dynamicResults && (
                <div style={{ marginTop: 20, background: '#090d16', padding: 16, borderRadius: 8, border: '1px solid #1e293b' }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: '#34d399', marginBottom: 12 }}>
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
          )}

          {/* TAB 3: CONFIGURATION */}
          {activeTab === 'config' && (
            <div className="card">
              <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} color="#fbbf24" /> Cấu hình Đường dẫn & Ngôn ngữ
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Thư mục Dự án Laravel (Project Root):</label>
                  <input 
                    type="text" 
                    className="input-text" 
                    value={config.projectRoot} 
                    onChange={e => setConfig(prev => ({ ...prev, projectRoot: e.target.value }))}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Tiền tố Khóa (Key Prefix):</label>
                    <input 
                      type="text" 
                      className="input-text" 
                      value={config.prefix} 
                      onChange={e => setConfig(prev => ({ ...prev, prefix: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4, display: 'block' }}>Tên file Ngôn ngữ (Language File):</label>
                    <input 
                      type="text" 
                      className="input-text" 
                      value={config.langFileName} 
                      onChange={e => setConfig(prev => ({ ...prev, langFileName: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Danh sách ngôn ngữ */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 13, color: '#94a3b8' }}>Danh sách Ngôn ngữ Hỗ trợ:</label>
                    <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={addLocale}>
                      <Plus size={14} /> Thêm ngôn ngữ
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {config.locales.map(loc => (
                      <div 
                        key={loc.code} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 6, 
                          background: '#090d16', 
                          padding: '6px 12px', 
                          borderRadius: 8, 
                          border: '1px solid #1e293b' 
                        }}
                      >
                        <span style={{ fontWeight: 600, color: loc.isSource ? '#60a5fa' : '#f8fafc' }}>{loc.code.toUpperCase()}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>({loc.name})</span>
                        {!loc.isSource && (
                          <Trash2 
                            size={14} 
                            color="#ef4444" 
                            style={{ cursor: 'pointer', marginLeft: 4 }} 
                            onClick={() => removeLocale(loc.code)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary" style={{ alignSelf: 'flex-start', marginTop: 10 }} onClick={handleSaveConfig}>
                  Lưu Cấu Hình
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Real-time Terminal Log */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Terminal size={18} color="#38bdf8" /> Realtime Terminal Output
            </h2>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '2px 8px', fontSize: 12 }}
              onClick={() => setLogs([])}
            >
              Xóa log
            </button>
          </div>

          <div className="terminal-box" style={{ height: 560 }}>
            {logs.length === 0 ? (
              <div style={{ color: '#475569', fontStyle: 'italic' }}>Chưa có nhật ký hoạt động nào. Hãy nhấn "Bắt đầu Thực thi" để chạy...</div>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} style={{ marginBottom: 4, lineHeight: 1.4 }}>
                  <span style={{ color: '#64748b', marginRight: 8 }}>[{log.timestamp}]</span>
                  <span style={{ color: log.type === 'error' ? '#ef4444' : log.message.startsWith('✅') ? '#34d399' : '#38bdf8' }}>
                    {log.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
