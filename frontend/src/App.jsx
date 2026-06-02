import React, { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { API_BASE, COGNITO_DOMAIN, LOGOUT_URI, OIDC_CONFIG } from "./config";
import "./App.css";

// Culori pentru pie chart
const PIE_COLORS = ["#0e7a6f", "#169989", "#3fb8ad", "#6fcfb0", "#b7efd9"];

function App() {
  const auth = useAuth();

  const [profile, setProfile] = useState(null);
  const [dataResponse, setDataResponse] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const idToken = auth.user?.id_token;

  useEffect(() => {
    if (!idToken) {
      setProfile(null);
      setDataResponse(null);
      return;
    }

    setError(null);

    // Apel catre /api/profile
    setLoadingProfile(true);
    fetch(`${API_BASE}/api/profile`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error calling /api/profile");
        return res.json();
      })
      .then((data) => setProfile(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingProfile(false));

    // Apel catre /api/data
    setLoadingData(true);
    fetch(`${API_BASE}/api/data`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error calling /api/data");
        return res.json();
      })
      .then((data) => setDataResponse(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingData(false));
  }, [idToken]);

  const signOutRedirect = () => {
    const clientId = OIDC_CONFIG.client_id;
    const logoutUri = LOGOUT_URI;
    const cognitoDomain = COGNITO_DOMAIN;
    auth.removeUser();
    window.location.href =
      `${cognitoDomain}/logout?client_id=${clientId}` +
      `&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  const copyToken = async () => {
    if (!idToken) return;
    try {
      await navigator.clipboard.writeText(idToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (copyError) {
      setError("Unable to copy token to clipboard.");
    }
  };

  if (auth.isLoading) {
    return (
      <div className="app-shell">
        <div className="status-panel">Loading authentication...</div>
      </div>
    );
  }

  if (auth.error) {
    return (
      <div className="app-shell">
        <div className="status-panel status-panel-error">
          Encountering error... {auth.error.message}
        </div>
      </div>
    );
  }

  // Datele pentru grafice — vin din /api/data
  const chartData = dataResponse?.data || [];

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-left" />
      <div className="bg-orb bg-orb-right" />
      <main className="app">
        <header className="hero">
          <p className="hero-kicker">Identity + Serverless</p>
          <h1>Cloud Computing App</h1>
          <p className="hero-subtitle">
            Secure frontend with Amazon Cognito authentication and Azure Functions APIs.
          </p>
        </header>

        {error && (
          <div className="alert">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Card login/logout */}
        <section className="card status-card">
          {auth.isAuthenticated ? (
            <>
              <p className="status-line">
                <span className="status-dot status-dot-online" />
                Logged in as <strong>{auth.user?.profile?.email || "(no email claim)"}</strong>
              </p>
              <button className="btn btn-secondary" onClick={signOutRedirect}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="status-line">
                <span className="status-dot" />
                Not logged in
              </p>
              <button className="btn" onClick={() => auth.signinRedirect()}>
                Sign in
              </button>
            </>
          )}
        </section>

        {auth.isAuthenticated && (
          <div className="grid">
            {/* Token */}
            <section className="card">
              <div className="section-head">
                <h2>Authentication Token</h2>
                <div className="actions">
                  <button
                    className="btn btn-small btn-ghost"
                    onClick={() => setShowToken((c) => !c)}
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                  <button className="btn btn-small btn-ghost" onClick={copyToken}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <pre className="code-block">
                ID Token: {showToken ? auth.user?.id_token : "••••••••••••••••••••"}
              </pre>
            </section>

            {/* Profile */}
            <section className="card">
              <h2>User Profile API Response</h2>
              {loadingProfile ? (
                <p className="muted">Loading profile...</p>
              ) : profile ? (
                <pre className="code-block">{JSON.stringify(profile, null, 2)}</pre>
              ) : (
                <p className="muted">No profile loaded yet.</p>
              )}
            </section>

            {/* Tabel cu datele */}
            <section className="card card-wide">
              <h2>Device Data Table</h2>
              {loadingData ? (
                <p className="muted">Loading data...</p>
              ) : chartData.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Device ID</th>
                      <th>Value</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row) => (
                      <tr key={row.device_id}>
                        <td>{row.device_id}</td>
                        <td>{row.value}</td>
                        <td>{row.location || "—"}</td>
                        <td>
                          <span className={`badge badge-${row.status}`}>{row.status || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="muted">No data available.</p>
              )}
            </section>

            {/* Grafic 1: Bar Chart - Value per Device */}
            <section className="card card-wide">
              <h2>Bar Chart — Value per Device</h2>
              {loadingData ? (
                <p className="muted">Loading chart...</p>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,48,83,0.1)" />
                    <XAxis dataKey="device_id" tick={{ fontSize: 13 }} />
                    <YAxis tick={{ fontSize: 13 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" fill="#0e7a6f" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="muted">No data for chart.</p>
              )}
            </section>

            {/* Grafic 2: Pie Chart - Distributia valorilor */}
            <section className="card card-wide">
              <h2>Pie Chart — Value Distribution</h2>
              {loadingData ? (
                <p className="muted">Loading chart...</p>
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="device_id"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ device_id, percent }) =>
                        `${device_id} (${(percent * 100).toFixed(0)}%)`
                      }
                    >
                      {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="muted">No data for chart.</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
