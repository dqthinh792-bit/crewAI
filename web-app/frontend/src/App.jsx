import { useEffect, useState } from "react";
import {
  Activity, Bot, CheckCircle2, Clock3, Cpu, FileText, KeyRound,
  LayoutDashboard, LogOut, Play, RefreshCw, ShieldCheck, Sparkles,
  Users, Workflow, XCircle
} from "lucide-react";

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Có lỗi xảy ra.");
  return data;
}

function Login({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
      onLogin();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <main className="login-screen">
    <div className="login-card">
      <div className="brand-mark"><Bot size={27} /></div>
      <p className="eyebrow">MULTI-AGENT WORKSPACE</p>
      <h1>Welcome to <span>CrewAI Studio</span></h1>
      <p className="muted">Đăng nhập để quản lý và chạy quy trình AI Agent của bạn.</p>
      <form onSubmit={submit} className="login-form">
        <label>Tên đăng nhập<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required /></label>
        <label>Mật khẩu<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
        {error && <p className="error-text">{error}</p>}
        <button className="primary-button full" disabled={busy}>{busy ? "Đang đăng nhập..." : "Đăng nhập"}</button>
      </form>
      <p className="login-foot"><ShieldCheck size={14} /> Phiên đăng nhập được bảo vệ bằng cookie HTTP-only</p>
    </div>
  </main>;
}

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState("overview");
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState([]);
  const [topic, setTopic] = useState("");
  const [objective, setObjective] = useState("Tạo báo cáo dễ hiểu, nêu các phát hiện chính và đề xuất thực tế.");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [dash, records] = await Promise.all([api("/api/dashboard"), api("/api/history")]);
    setDashboard(dash); setHistory(records.items || []);
  }

  useEffect(() => {
    api("/api/auth/me").then(() => setAuthenticated(true)).catch(() => setAuthenticated(false)).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (authenticated) refresh().catch(err => setError(err.message));
  }, [authenticated]);

  async function runCrew(event) {
    event.preventDefault(); setBusy(true); setError(""); setResult("");
    try {
      const data = await api("/api/runs", { method: "POST", body: JSON.stringify({ topic, objective }) });
      setResult(data.result); await refresh(); setPage("workspace");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAuthenticated(false);
  }

  if (checking) return <div className="loading-screen"><div className="spinner" />Đang kiểm tra phiên đăng nhập...</div>;
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;

  const nav = [
    { id: "overview", label: "Tổng quan", icon: LayoutDashboard },
    { id: "workspace", label: "AI Workspace", icon: Workflow },
    { id: "agents", label: "AI Agents", icon: Users },
    { id: "history", label: "Lịch sử tác vụ", icon: Clock3 }
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark small"><Bot size={22} /></div><div><b>CrewAI Studio</b><small>AGENT PLATFORM</small></div></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav>{nav.map(item => <button key={item.id} className={page === item.id ? "nav-item active" : "nav-item"} onClick={() => setPage(item.id)}><item.icon size={18} />{item.label}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure-note"><ShieldCheck size={17} /><div><b>Local workspace</b><small>Backend protected</small></div></div><button className="nav-item logout" onClick={logout}><LogOut size={17} />Đăng xuất</button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div><span className="breadcrumb">Workspace</span><span className="slash">/</span><b>{nav.find(n => n.id === page)?.label}</b></div><div className="top-actions"><span className="status-dot" /> System online <button className="icon-button" onClick={() => refresh().catch(e => setError(e.message))} title="Làm mới"><RefreshCw size={17} /></button><div className="avatar">AD</div></div></header>

      {error && <div className="alert error"><XCircle size={17} />{error}<button onClick={() => setError("")}><XCircle size={15} /></button></div>}

      {page === "overview" && <section className="content">
        <div className="page-heading"><div><p className="eyebrow">YOUR AI CONTROL CENTER</p><h1>Xin chào, Admin <span className="wave">✦</span></h1><p className="muted">Theo dõi hoạt động và điều phối các AI Agent tại một nơi.</p></div><button className="primary-button" onClick={() => setPage("workspace")}><Play size={16} /> Chạy tác vụ mới</button></div>
        <div className="stats-grid">
          <Stat icon={Workflow} label="Tổng tác vụ" value={dashboard?.total_runs ?? "—"} tone="violet" />
          <Stat icon={CheckCircle2} label="Hoàn thành" value={dashboard?.completed_runs ?? "—"} tone="green" />
          <Stat icon={Bot} label="AI Agents" value="2" tone="blue" />
          <Stat icon={Cpu} label="Model đang dùng" value={dashboard?.model || "—"} tone="orange" compact />
        </div>
        <div className="overview-grid">
          <div className="panel"><div className="panel-head"><div><h3>Quy trình mẫu</h3><p className="muted">Research → Report generation</p></div><span className="pill success">Ready</span></div>
            <div className="flow-visual"><div className="agent-node"><div className="node-icon purple"><Activity /></div><b>Research Analyst</b><small>Thu thập & phân tích</small></div><div className="flow-line"><span /></div><div className="agent-node"><div className="node-icon blue"><FileText /></div><b>Report Writer</b><small>Tổng hợp báo cáo</small></div></div>
            <button className="text-button" onClick={() => setPage("workspace")}>Mở AI Workspace <span>→</span></button>
          </div>
          <div className="panel"><div className="panel-head"><div><h3>Cấu hình hệ thống</h3><p className="muted">Trạng thái kết nối dịch vụ</p></div><KeyRound size={19} className="muted" /></div>
            <div className="config-row"><span>Backend API</span><span className="pill success">Connected</span></div>
            <div className="config-row"><span>LLM Provider Key</span><span className={dashboard?.provider_key_configured ? "pill success" : "pill warning"}>{dashboard?.provider_key_configured ? "Configured" : "Chưa cấu hình"}</span></div>
            <div className="config-row"><span>Database</span><span className="pill success">SQLite ready</span></div>
            {!dashboard?.provider_key_configured && <p className="hint">Thêm OPENAI_API_KEY vào file <code>web-app/.env</code> rồi khởi động lại backend để chạy AI thật.</p>}
          </div>
        </div>
        <div className="panel"><div className="panel-head"><div><h3>Tác vụ gần đây</h3><p className="muted">Những lần chạy mới nhất</p></div><button className="text-button" onClick={() => setPage("history")}>Xem tất cả →</button></div><HistoryTable items={(dashboard?.recent_runs || [])} compact /></div>
      </section>}

      {page === "workspace" && <section className="content">
        <div className="page-heading"><div><p className="eyebrow">MULTI-AGENT EXECUTION</p><h1>AI Workspace</h1><p className="muted">Giao mục tiêu, để các Agent phối hợp xử lý.</p></div><span className="pill success"><span className="status-dot" /> Workflow ready</span></div>
        <div className="workspace-grid">
          <form className="panel run-form" onSubmit={runCrew}><div className="panel-head"><div><h3>Tạo tác vụ mới</h3><p className="muted">Hai agent sẽ làm việc tuần tự.</p></div><Sparkles size={20} className="accent-icon" /></div>
            <label>Chủ đề nghiên cứu<input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ví dụ: Ứng dụng AI trong giáo dục..." minLength={3} maxLength={500} required /></label>
            <label>Mục tiêu đầu ra<textarea value={objective} onChange={e => setObjective(e.target.value)} rows={4} minLength={10} maxLength={1000} required /></label>
            <div className="agent-assignment"><div className="mini-agent purple"><Activity size={17} /></div><div><b>Research Analyst</b><small>Phân tích chủ đề và tìm phát hiện chính</small></div><span>01</span></div>
            <div className="agent-assignment"><div className="mini-agent blue"><FileText size={17} /></div><div><b>Report Writer</b><small>Viết báo cáo dựa trên kết quả nghiên cứu</small></div><span>02</span></div>
            <button className="primary-button full" disabled={busy || !dashboard?.provider_key_configured}><Play size={16} />{busy ? "Agents đang làm việc..." : "Bắt đầu chạy Crew"}</button>
            {!dashboard?.provider_key_configured && <p className="hint">Cần cấu hình OPENAI_API_KEY ở backend trước khi chạy.</p>}
          </form>
          <div className="panel result-panel"><div className="panel-head"><div><h3>Kết quả thực thi</h3><p className="muted">Báo cáo sẽ xuất hiện tại đây</p></div><FileText size={19} className="muted" /></div>
            {busy ? <div className="empty-state"><div className="spinner" /><b>Đang điều phối các Agent</b><p>Quá trình có thể mất một chút thời gian tùy model.</p></div> : result ? <pre className="result-text">{result}</pre> : <div className="empty-state"><div className="empty-icon"><Workflow size={28} /></div><b>Chưa có kết quả</b><p>Nhập chủ đề và nhấn “Bắt đầu chạy Crew” để khởi động quy trình.</p></div>}
          </div>
        </div>
      </section>}

      {page === "agents" && <section className="content">
        <div className="page-heading"><div><p className="eyebrow">YOUR AI TEAM</p><h1>AI Agents</h1><p className="muted">Các agent được định nghĩa trong workflow mẫu.</p></div></div>
        <div className="agent-grid"><AgentCard icon={Activity} name="Research Analyst" role="Researcher" description="Phân tích chủ đề, tổng hợp thông tin, xác định điểm quan trọng và các giới hạn." color="purple" /><AgentCard icon={FileText} name="Report Writer" role="Writer" description="Chuyển kết quả nghiên cứu thành báo cáo rõ ràng, có cấu trúc và đề xuất." color="blue" /></div>
        <div className="panel note-panel"><ShieldCheck size={19} /><div><b>Thiết kế an toàn</b><p className="muted">Agent và cấu hình model hiện được khai báo ở backend. API key không được gửi xuống giao diện trình duyệt.</p></div></div>
      </section>}

      {page === "history" && <section className="content">
        <div className="page-heading"><div><p className="eyebrow">EXECUTION LOGS</p><h1>Lịch sử tác vụ</h1><p className="muted">Theo dõi các lần chạy đã được lưu trong SQLite.</p></div><button className="icon-button" onClick={() => refresh().catch(e => setError(e.message))}><RefreshCw size={17} /> Làm mới</button></div>
        <div className="panel"><HistoryTable items={history} /></div>
      </section>}
      <footer>CREWAI STUDIO <span>•</span> Standalone web interface for CrewAI</footer>
    </main>
  </div>;
}

function Stat({ icon: Icon, label, value, tone, compact }) {
  return <div className="stat-card"><div className={"stat-icon " + tone}><Icon size={19} /></div><div><p>{label}</p><strong className={compact ? "model-value" : ""}>{value}</strong></div></div>;
}
function AgentCard({ icon: Icon, name, role, description, color }) {
  return <div className="panel agent-card"><div className={"agent-large-icon " + color}><Icon size={23} /></div><span className="pill">{role}</span><h3>{name}</h3><p className="muted">{description}</p><div className="agent-meta"><span><span className="status-dot" /> Active in workflow</span><span>Sequential</span></div></div>;
}
function HistoryTable({ items, compact = false }) {
  if (!items.length) return <div className="empty-inline">Chưa có tác vụ nào. Hãy chạy tác vụ đầu tiên trong AI Workspace.</div>;
  return <div className="table-wrap"><table><thead><tr><th>Chủ đề</th><th>Trạng thái</th><th>Thời gian</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><b>{item.topic}</b></td><td><span className={"pill " + (item.status === "completed" ? "success" : item.status === "failed" ? "danger" : "warning")}>{item.status}</span></td><td>{new Date(item.created_at).toLocaleString("vi-VN")}</td></tr>)}</tbody></table></div>;
}

export default App;
