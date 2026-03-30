import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "crm-funerarias-edep-v1";
const sampleRows = [{ id: "1", nombre: "Funeraria Ejemplo Álava", provincia: "Álava", email: "info@ejemploalava.es", web: "https://ejemploalava.es", telefono: "945 000 000", estadoContacto: "no_contactada", fechaContacto: "", demo: "no_hecha", interes: "pendiente", notas: "" }];

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function detectDelimiter(line) {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;

  for (const delimiter of candidates) {
    const escaped = delimiter === "\t" ? "\\t" : "\\" + delimiter;
    const count = (line.match(new RegExp(escaped, "g")) || []).length;

    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }

  return best;
}

function parseCsvLine(line, delimiter = ",") {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((v) => v.trim());
}
function csvToRows(csv) {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const idx = {
    nombre: headers.findIndex((h) => ["nombre", "nombre empresa", "empresa"].includes(h)),
    provincia: headers.findIndex((h) => ["provincia", "provincia/estado", "estado"].includes(h)),
    email: headers.findIndex((h) => ["email", "correo", "correo electronico", "e-mail"].includes(h)),
    web: headers.findIndex((h) => ["web", "website", "sitio web", "url"].includes(h)),
    telefono: headers.findIndex((h) => ["telefono", "teléfono", "phone"].includes(h)),
  };
  return lines.slice(1).map((line, i) => {
    const cols = parseCsvLine(line, delimiter);
    return {
      id: `${Date.now()}-${i}`,
      nombre: idx.nombre >= 0 ? cols[idx.nombre] || "" : "",
      provincia: idx.provincia >= 0 ? cols[idx.provincia] || "" : "",
      email: idx.email >= 0 ? cols[idx.email] || "" : "",
      web: idx.web >= 0 ? cols[idx.web] || "" : "",
      telefono: idx.telefono >= 0 ? cols[idx.telefono] || "" : "",
      estadoContacto: "no_contactada", fechaContacto: "", demo: "no_hecha", interes: "pendiente", notas: "",
    };
  }).filter((row) => row.nombre);
}
function rowsToCsv(rows) {
  const headers = ["Nombre","Provincia","Email","Web","Teléfono","Estado contacto","Fecha contacto","Demo","Interés","Notas"];
  const esc = (value) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const body = rows.map((row) => [row.nombre,row.provincia,row.email,row.web,row.telefono,row.estadoContacto,row.fechaContacto,row.demo,row.interes,row.notas].map(esc).join(","));
  return [headers.join(","), ...body].join("\n");
}
function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
export default function App() {
  const [rows, setRows] = useState(sampleRows);
  const [selectedProvince, setSelectedProvince] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(sampleRows[0].id);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length) { setRows(parsed); setSelectedId(parsed[0].id); } } catch {}
    }
  }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }, [rows]);

  const provinces = useMemo(() => [...new Set(rows.map((r) => r.provincia).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const okProvince = selectedProvince === "all" || row.provincia === selectedProvince;
    const okStatus = statusFilter === "all" || row.estadoContacto === statusFilter;
    const hayTexto = `${row.nombre} ${row.email} ${row.web} ${row.telefono} ${row.provincia}`.toLowerCase();
    const okSearch = hayTexto.includes(search.toLowerCase());
    return okProvince && okStatus && okSearch;
  }), [rows, selectedProvince, statusFilter, search]);
  const selected = filteredRows.find((r) => r.id === selectedId) || filteredRows[0] || null;

  useEffect(() => {
    if (filteredRows.length && !filteredRows.some((r) => r.id === selectedId)) setSelectedId(filteredRows[0].id);
  }, [filteredRows, selectedId]);

  const stats = useMemo(() => ({
    total: filteredRows.length,
    contactadas: filteredRows.filter((r) => r.estadoContacto === "contactada").length,
    demos: filteredRows.filter((r) => r.demo === "hecha").length,
    noInteresadas: filteredRows.filter((r) => r.estadoContacto === "descartada").length,
  }), [filteredRows]);

  function updateRow(id, patch) { setRows((prev) => prev.map((row) => row.id === id ? { ...row, ...patch } : row)); }
  async function handleCsvUpload(event) {
    const file = event.target.files?.[0]; if (!file) return;
    const text = await file.text(); const imported = csvToRows(text);
    if (imported.length) { setRows(imported); setSelectedId(imported[0].id); localStorage.setItem(STORAGE_KEY, JSON.stringify(imported)); alert(`Importadas ${imported.length} funerarias.`); }
    else { alert("No he podido leer el CSV. Revisa que tenga columnas tipo Nombre, Provincia, Email, Web y Teléfono."); }
    event.target.value = "";
  }
  function exportTrackingCsv() { downloadFile("funerarias_seguimiento.csv", rowsToCsv(rows), "text/csv;charset=utf-8;"); }
  function exportBackupJson() { downloadFile("funerarias_backup.json", JSON.stringify(rows, null, 2), "application/json"); }
  function resetData() {
    if (!window.confirm("Esto borrará los datos guardados en este navegador. ¿Seguro?")) return;
    localStorage.removeItem(STORAGE_KEY); setRows(sampleRows); setSelectedId(sampleRows[0].id);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>CRM funerarias</h1>
          <p>Filtra por provincia, revisa datos y marca el seguimiento comercial.</p>
        </div>
        <div className="topbar-actions">
          <label className="button secondary file-button">Importar CSV<input type="file" accept=".csv" onChange={handleCsvUpload} /></label>
          <button className="button secondary" onClick={exportTrackingCsv}>Exportar CSV</button>
          <button className="button secondary" onClick={exportBackupJson}>Backup JSON</button>
          <button className="button danger" onClick={resetData}>Reiniciar</button>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card"><span>Total visibles</span><strong>{stats.total}</strong></div>
        <div className="stat-card"><span>Contactadas</span><strong>{stats.contactadas}</strong></div>
        <div className="stat-card"><span>Demos hechas</span><strong>{stats.demos}</strong></div>
        <div className="stat-card"><span>No interesadas</span><strong>{stats.noInteresadas}</strong></div>
      </section>

      <section className="filters-card">
        <input className="input" placeholder="Buscar por nombre, email, web o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" value={selectedProvince} onChange={(e) => setSelectedProvince(e.target.value)}>
          <option value="all">Todas las provincias</option>
          {provinces.map((province) => <option key={province} value={province}>{province}</option>)}
        </select>
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">Todos los estados</option>
          <option value="no_contactada">No contactada</option>
          <option value="contactada">Contactada</option>
          <option value="descartada">No interesada</option>
        </select>
      </section>

      <main className="content-grid">
        <section className="panel list-panel">
          <div className="panel-header"><h2>Listado</h2></div>
          <div className="list-scroll">
            {filteredRows.length === 0 && <div className="empty-state">No hay funerarias que coincidan con el filtro.</div>}
            {filteredRows.map((row) => (
              <button key={row.id} className={`lead-card ${selected?.id === row.id ? "selected" : ""}`} onClick={() => setSelectedId(row.id)}>
                <div className="lead-top">
                  <div>
                    <div className="lead-name">{row.nombre}</div>
                    <div className="lead-province">{row.provincia || "Sin provincia"}</div>
                  </div>
                  <div className="lead-badges">
                    <span className={`badge ${row.estadoContacto}`}>{row.estadoContacto === "no_contactada" ? "No contactada" : row.estadoContacto === "contactada" ? "Contactada" : "No interesada"}</span>
                    <span className={`badge demo ${row.demo}`}>{row.demo === "hecha" ? "Demo hecha" : "Demo no hecha"}</span>
                  </div>
                </div>
                <div className="lead-meta">
                  <div><strong>Tel:</strong> {row.telefono || "—"}</div>
                  <div><strong>Email:</strong> {row.email || "—"}</div>
                  <div><strong>Web:</strong> {row.web || "—"}</div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel detail-panel">
          <div className="panel-header"><h2>Ficha</h2></div>
          {!selected ? <div className="empty-state">Selecciona una funeraria del listado.</div> : (
            <div className="detail-body">
              <div className="hero-card"><h3>{selected.nombre}</h3><p>{selected.provincia || "Sin provincia"}</p></div>
              <div className="info-grid">
                <div className="info-box"><span>Email</span><strong>{selected.email || "No disponible"}</strong></div>
                <div className="info-box"><span>Web</span><strong>{selected.web || "No disponible"}</strong></div>
                <div className="info-box"><span>Teléfono</span><strong>{selected.telefono || "No disponible"}</strong></div>
              </div>
              <div className="form-grid">
                <div>
                  <label>Estado de contacto</label>
                  <select className="input" value={selected.estadoContacto} onChange={(e) => updateRow(selected.id, { estadoContacto: e.target.value })}>
                    <option value="no_contactada">No contactada</option>
                    <option value="contactada">Contactada</option>
                    <option value="descartada">No interesada</option>
                  </select>
                </div>
                <div>
                  <label>Fecha de contacto</label>
                  <input className="input" type="date" value={selected.fechaContacto} onChange={(e) => updateRow(selected.id, { fechaContacto: e.target.value })} />
                </div>
                <div>
                  <label>Demo</label>
                  <select className="input" value={selected.demo} onChange={(e) => updateRow(selected.id, { demo: e.target.value })}>
                    <option value="no_hecha">No hecha</option>
                    <option value="hecha">Hecha</option>
                  </select>
                </div>
                <div>
                  <label>Interés</label>
                  <select className="input" value={selected.interes} onChange={(e) => updateRow(selected.id, { interes: e.target.value })}>
                    <option value="pendiente">Pendiente</option>
                    <option value="alto">Alto</option>
                    <option value="medio">Medio</option>
                    <option value="bajo">Bajo</option>
                  </select>
                </div>
              </div>
              <div>
                <label>Notas</label>
                <textarea className="textarea" value={selected.notas} onChange={(e) => updateRow(selected.id, { notas: e.target.value })} placeholder="Ejemplo: habló con recepción, volver a escribir el jueves, pidió una demo..." />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
