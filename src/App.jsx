import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
    direccion: headers.findIndex((h) => ["direccion", "dirección"].includes(h)),
    ciudad: headers.findIndex((h) => ["ciudad"].includes(h)),
    provincia: headers.findIndex((h) => ["provincia/estado", "provincia", "estado"].includes(h)),
    codigo_postal: headers.findIndex((h) => ["codigo postal", "código postal", "cp"].includes(h)),
    telefono: headers.findIndex((h) => ["telefono", "teléfono", "phone"].includes(h)),
    email: headers.findIndex((h) => ["email", "correo", "correo electronico", "e-mail"].includes(h)),
    web: headers.findIndex((h) => ["web", "website", "sitio web", "url"].includes(h)),
  };

  return lines
    .slice(1)
    .map((line) => {
      const cols = parseCsvLine(line, delimiter);
      return {
        nombre: idx.nombre >= 0 ? cols[idx.nombre] || "" : "",
        direccion: idx.direccion >= 0 ? cols[idx.direccion] || "" : "",
        ciudad: idx.ciudad >= 0 ? cols[idx.ciudad] || "" : "",
        provincia_estado: idx.provincia >= 0 ? cols[idx.provincia] || "" : "",
        codigo_postal: idx.codigo_postal >= 0 ? cols[idx.codigo_postal] || "" : "",
        telefono: idx.telefono >= 0 ? cols[idx.telefono] || "" : "",
        email: idx.email >= 0 ? cols[idx.email] || "" : "",
        web: idx.web >= 0 ? cols[idx.web] || "" : "",
      };
    })
    .filter((row) => row.nombre);
}

function rowsToCsv(rows) {
  const headers = [
    "Nombre",
    "Dirección",
    "Ciudad",
    "Provincia/Estado",
    "Código Postal",
    "Teléfono",
    "Email",
    "Web",
    "Estado contacto",
    "Fecha contacto",
    "Demo",
    "Interés",
    "Notas",
    "País",
  ];

  const esc = (value) => {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const body = rows.map((r) =>
    [
      r.nombre,
      r.direccion,
      r.ciudad,
      r.provincia_estado,
      r.codigo_postal,
      r.telefono,
      r.email,
      r.web,
      r.estado_contacto,
      r.fecha_contacto,
      r.demo,
      r.interes,
      r.notas,
      r.pais,
    ]
      .map(esc)
      .join(",")
  );

  return [headers.join(","), ...body].join("\n");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [emailLogin, setEmailLogin] = useState("");
  const [passwordLogin, setPasswordLogin] = useState("");

  const [rows, setRows] = useState([]);
  const [loadingRows, setLoadingRows] = useState(false);

  const [selectedProvince, setSelectedProvince] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const [importing, setImporting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoadingAuth(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sessionNow) => {
      setSession(sessionNow ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(e) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({
      email: emailLogin,
      password: passwordLogin,
    });
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function loadRows() {
    setLoadingRows(true);
    const { data, error } = await supabase
      .from("crm_funerarias")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      setLoadingRows(false);
      return;
    }

    setRows(data || []);
    if (data?.length) setSelectedId((prev) => prev || data[0].id);
    setLoadingRows(false);
  }

  useEffect(() => {
    if (session) loadRows();
  }, [session]);

  const provinces = useMemo(
    () =>
      [...new Set(rows.map((r) => r.provincia_estado).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b)
      ),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const okProvince =
        selectedProvince === "all" || row.provincia_estado === selectedProvince;
      const okStatus =
        statusFilter === "all" || row.estado_contacto === statusFilter;
      const hayTexto = `${row.nombre} ${row.email} ${row.web} ${row.telefono} ${row.provincia_estado} ${row.ciudad}`.toLowerCase();
      const okSearch = hayTexto.includes(search.toLowerCase());
      return okProvince && okStatus && okSearch;
    });
  }, [rows, selectedProvince, statusFilter, search]);

  const selected = filteredRows.find((r) => r.id === selectedId) || filteredRows[0] || null;

  useEffect(() => {
    if (filteredRows.length && !filteredRows.some((r) => r.id === selectedId)) {
      setSelectedId(filteredRows[0].id);
    }
  }, [filteredRows, selectedId]);

  const stats = useMemo(
    () => ({
      total: filteredRows.length,
      contactadas: filteredRows.filter((r) => r.estado_contacto === "contactada").length,
      demos: filteredRows.filter((r) => r.demo === "hecha").length,
      noInteresadas: filteredRows.filter((r) => r.estado_contacto === "descartada").length,
    }),
    [filteredRows]
  );

  async function updateRow(id, patch, activityType = "update") {
    const { error } = await supabase
      .from("crm_funerarias")
      .update(patch)
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

    await supabase.from("crm_actividad").insert({
      funeraria_id: id,
      user_id: session?.user?.id ?? null,
      tipo: activityType,
      detalle: patch,
    });
  }

 async function handleCsvUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const origen = window.prompt("Nombre del origen/importación", file.name) || file.name;
  const pais = window.prompt("País para esta importación", "Argentina") || "Argentina";

  const text = await file.text();
  const imported = csvToRows(text);

  if (!imported.length) {
    alert("No he podido leer el CSV.");
    return;
  }

  setImporting(true);

  try {
    const rowsToUpsert = imported.map((row) => {
      const dedupe_key = [
        row.nombre?.trim()?.toLowerCase() || "",
        row.ciudad?.trim()?.toLowerCase() || "",
        row.provincia_estado?.trim()?.toLowerCase() || "",
        row.telefono?.trim()?.toLowerCase() || "",
      ].join("|");

      return {
        nombre: row.nombre || null,
        direccion: row.direccion || null,
        ciudad: row.ciudad || null,
        provincia_estado: row.provincia_estado || null,
        codigo_postal: row.codigo_postal || null,
        telefono: row.telefono || null,
        email: row.email || null,
        web: row.web || null,
        pais: pais || "Argentina",
        origen: origen || file.name,
        dedupe_key,
      };
    });

    const { error } = await supabase
      .from("crm_funerarias")
      .upsert(rowsToUpsert, {
        onConflict: "dedupe_key",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error("Error importando CSV:", error);
      alert(`Error importando CSV: ${error.message}`);
      return;
    }

    await loadRows();
    alert(`Importación terminada. Filas procesadas: ${rowsToUpsert.length}`);
  } catch (err) {
    console.error("Error general importando CSV:", err);
    alert("Error general importando CSV");
  } finally {
    setImporting(false);
    event.target.value = "";
  }
}

  function exportTrackingCsv() {
    downloadFile(
      "crm_funerarias_export.csv",
      rowsToCsv(rows),
      "text/csv;charset=utf-8;"
    );
  }

  if (loadingAuth) {
    return <div style={{ padding: 24 }}>Cargando...</div>;
  }

  if (!session) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto", padding: 24 }}>
        <h1>CRM funerarias</h1>
        <p>Inicia sesión</p>
        <form onSubmit={signIn} style={{ display: "grid", gap: 12 }}>
          <input
            value={emailLogin}
            onChange={(e) => setEmailLogin(e.target.value)}
            placeholder="Email"
          />
          <input
            type="password"
            value={passwordLogin}
            onChange={(e) => setPasswordLogin(e.target.value)}
            placeholder="Contraseña"
          />
          <button type="submit">Entrar</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>CRM funerarias</h1>
          <p>Conectado a Supabase. Usuario: {session.user.email}</p>
        </div>
        <div className="topbar-actions">
          <label className="button secondary file-button">
            {importing ? "Importando..." : "Importar CSV"}
            <input type="file" accept=".csv" onChange={handleCsvUpload} disabled={importing} />
          </label>
          <button className="button secondary" onClick={exportTrackingCsv}>
            Exportar CSV
          </button>
          <button className="button secondary" onClick={loadRows}>
            Recargar
          </button>
          <button className="button danger" onClick={signOut}>
            Salir
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card"><span>Total visibles</span><strong>{stats.total}</strong></div>
        <div className="stat-card"><span>Contactadas</span><strong>{stats.contactadas}</strong></div>
        <div className="stat-card"><span>Demos hechas</span><strong>{stats.demos}</strong></div>
        <div className="stat-card"><span>No interesadas</span><strong>{stats.noInteresadas}</strong></div>
      </section>

      <section className="filters-card">
        <input
          className="input"
          placeholder="Buscar por nombre, email, web o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="input"
          value={selectedProvince}
          onChange={(e) => setSelectedProvince(e.target.value)}
        >
          <option value="all">Todas las provincias</option>
          {provinces.map((province) => (
            <option key={province} value={province}>{province}</option>
          ))}
        </select>

        <select
          className="input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
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
            {loadingRows && <div className="empty-state">Cargando funerarias...</div>}
            {!loadingRows && filteredRows.length === 0 && (
              <div className="empty-state">No hay funerarias que coincidan con el filtro.</div>
            )}

            {filteredRows.map((row) => (
              <button
                key={row.id}
                className={`lead-card ${selected?.id === row.id ? "selected" : ""}`}
                onClick={() => setSelectedId(row.id)}
              >
                <div className="lead-top">
                  <div>
                    <div className="lead-name">{row.nombre}</div>
                    <div className="lead-province">
                      {row.provincia_estado || "Sin provincia"} {row.pais ? `· ${row.pais}` : ""}
                    </div>
                  </div>
                  <div className="lead-badges">
                    <span className={`badge ${row.estado_contacto}`}>
                      {row.estado_contacto === "no_contactada"
                        ? "No contactada"
                        : row.estado_contacto === "contactada"
                        ? "Contactada"
                        : "No interesada"}
                    </span>
                    <span className={`badge demo ${row.demo}`}>
                      {row.demo === "hecha" ? "Demo hecha" : "Demo no hecha"}
                    </span>
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

          {!selected ? (
            <div className="empty-state">Selecciona una funeraria del listado.</div>
          ) : (
            <div className="detail-body">
              <div className="hero-card">
                <h3>{selected.nombre}</h3>
                <p>
                  {selected.ciudad || "Sin ciudad"}
                  {selected.provincia_estado ? ` · ${selected.provincia_estado}` : ""}
                  {selected.pais ? ` · ${selected.pais}` : ""}
                </p>
              </div>

              <div className="info-grid">
                <div className="info-box"><span>Email</span><strong>{selected.email || "No disponible"}</strong></div>
                <div className="info-box"><span>Web</span><strong>{selected.web || "No disponible"}</strong></div>
                <div className="info-box"><span>Teléfono</span><strong>{selected.telefono || "No disponible"}</strong></div>
                <div className="info-box"><span>Dirección</span><strong>{selected.direccion || "No disponible"}</strong></div>
              </div>

              <div className="form-grid">
                <div>
                  <label>Estado de contacto</label>
                  <select
                    className="input"
                    value={selected.estado_contacto}
                    onChange={(e) =>
                      updateRow(
                        selected.id,
                        { estado_contacto: e.target.value },
                        "update_estado"
                      )
                    }
                  >
                    <option value="no_contactada">No contactada</option>
                    <option value="contactada">Contactada</option>
                    <option value="descartada">No interesada</option>
                  </select>
                </div>

                <div>
                  <label>Fecha de contacto</label>
                  <input
                    className="input"
                    type="date"
                    value={selected.fecha_contacto || ""}
                    onChange={(e) =>
                      updateRow(
                        selected.id,
                        { fecha_contacto: e.target.value || null },
                        "update_fecha_contacto"
                      )
                    }
                  />
                </div>

                <div>
                  <label>Demo</label>
                  <select
                    className="input"
                    value={selected.demo}
                    onChange={(e) =>
                      updateRow(
                        selected.id,
                        { demo: e.target.value },
                        "update_demo"
                      )
                    }
                  >
                    <option value="no_hecha">No hecha</option>
                    <option value="hecha">Hecha</option>
                  </select>
                </div>

                <div>
                  <label>Interés</label>
                  <select
                    className="input"
                    value={selected.interes}
                    onChange={(e) =>
                      updateRow(
                        selected.id,
                        { interes: e.target.value },
                        "update_interes"
                      )
                    }
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="alto">Alto</option>
                    <option value="medio">Medio</option>
                    <option value="bajo">Bajo</option>
                  </select>
                </div>
              </div>

              <div>
                <label>Notas</label>
                <textarea
                  className="textarea"
                  value={selected.notas || ""}
                  onChange={(e) =>
                    setRows((prev) =>
                      prev.map((r) =>
                        r.id === selected.id ? { ...r, notas: e.target.value } : r
                      )
                    )
                  }
                  onBlur={(e) =>
                    updateRow(
                      selected.id,
                      { notas: e.target.value },
                      "update_notas"
                    )
                  }
                  placeholder="Ejemplo: habló con recepción, pidió una demo, volver a llamar..."
                />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}