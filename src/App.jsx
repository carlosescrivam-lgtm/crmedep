import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import logoEdep from "./assets/logo-edep.png";


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
    pais: headers.findIndex((h) => ["pais", "país"].includes(h)),
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
      const cols = line.includes(";") ? line.split(";") : line.split(",");
      return {
        nombre: idx.nombre >= 0 ? cols[idx.nombre] || "" : "",
        direccion: idx.direccion >= 0 ? cols[idx.direccion] || "" : "",
         pais: idx.pais >= 0 ? cols[idx.pais] || "" : "",
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
const [showScript, setShowScript] = useState(false);
const [scriptSection, setScriptSection] = useState("apertura");
  const [selectedProvince, setSelectedProvince] = useState("all");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tipoEmpresaFilter, setTipoEmpresaFilter] = useState("all");
const [tipoGrupoFilter, setTipoGrupoFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
const [editDraft, setEditDraft] = useState(null);

  const [importing, setImporting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newFuneraria, setNewFuneraria] = useState({
  nombre: "",
  direccion: "",
  pais: "España",
  ciudad: "",
  provincia_estado: "",
  telefono: "",
  email: "",
  web: "",
  tipo_empresa: "Funeraria",
  tipo_grupo: "Independiente",
});

  const speechSections = {
  apertura: {
    titulo: "Apertura",
    texto: `Hola, Buenos dias, soy Pablo/Carlos Escriva de E-dep. Hablo con Funeraria XXX?

Que tal? Encantado. No se si eres tú el/la gerente o el/la responsable de compras... 

SI RESPONDE NO.. Me harías el favor de pasarme con él? 
SI RESPONDE Esta ocupado o no está... Me podrías decir, por favor cuando sería buen momento para llamarle?
Si responde SI....

No sé si ahora es buen momento, pero en un minuto te explico la idea y ves si puede encajaros.

Mira, Te llamo porque estamos trabajando con una nueva herramienta pensada para las familias y ofrecida por vosotros, las empresas funerarias, y es un libro de condolencias digital, supersencillo, automatizado y personalizado. Funciona a traves de QR Y enlace para compartir en grupos, estados en redes, etc...

`
  },
  explicacion: {
    titulo: "Explicación breve",
    texto: `La idea es dar a las familias un servicio adicional, moderno y  superfácil de usar, para que puedan recibir mensajes de condolencia de familiares y amigos aunque no estén cerca. Y sobre todo a todos aquellos que quieren dejar una muestra de cariño pero tampoco tienen tanta confianza como para acercarse al tanatorio..

La funeraria lo ofrece como un servicio mas que da valor añadido, sin complicarse técnicamente, junto con otros servicios, como esquelas en periodicos... y mejora mucho la experiencia de la familia en un momento delicado. Tienes alguna duda hasta ahora?
    
EXPLICACION TECNICA (SOLO SI LA PIDE)
Cuando os acepten este nuevo servicio, para la aplicacion solo necesitais Nombre del difunto, foto y un texto opcional y el e-mail de contacto donde quieran recibir el Pdf final con todas las condolencias. Se genera la pagina publica en 15 segundos y te devuelve un Enlace y un QR que envías a la familia y es lo que ellos comparten
En vuestro cuadro de mandos ya teneis todo el control de esa pagina aunque ya no hay que hacer nada mas.
Lo mejor sería verlo en una demo en unos minutos..`

},
  
  objeciones: {
    titulo: "Objeciones frecuentes",
    texto: `- "Ahora no es buen momento"
  → Sin problema, ¿cuándo te vendría mejor que te lo enseñe en 2 minutos?

- "Ya hacemos algo parecido"
  → Perfecto, justo por eso quizá podríasis verlo en 2 minutos y comparar una opción más sencilla y centrada en la experiencia de la familia.

- "No creemos que nos lo pidan"
  → Es normal pensarlo al principio, además esto es nuevo y no se conoce aun...pero precisamente funciona como un servicio diferencial que las familias que ya lo has usado han valorado mucho. Muchas personas cuando pierden a un familiar ya ponen en sus redes sociales alguna foto para participar su perdida.. Con esto además permiten que la gente les muestre su cariño y tienen todos los mensajes en un mismo sitio y luego lo reciben automaticamente en un PDF que pueden guardar como recuerdo"

- "Envíamelo por email"
  → Perfecto, te lo mando. ¿A qué correo te lo envío? Te parece si te llamo en unos dias y me dices que te ha parecido y si quieres quedamos para hacerte una demo por videollamada?`
  },
  cierre: {
    titulo: "Cierre",
    texto: `Lo que te propongo es muy simple: te enseño cómo funciona en una demo muy corta y así valoras si puede encajar en vuestra funeraria.

¿Te va mejor que lo veamos otro día o prefieres que te mande primero la información por email?`
  },

  precios: {
  titulo: "Precios",
  texto: `Trabajamos con un modelo muy sencillo:

Si os registrais ahora, teneis un periodo de 15 dias y 3 servicios totalmente gratis para probarlo y al final de ese período decidis uno de los planes en funcion de volumen
-Plan Inicio: [35€+iva (42,35€) / mes (30 dias naturales) y hasta 5 servicios disponibles durante ese período]
- Plan básico: [50€+iva (60,50€) / mes (30 dias naturales) y hasta 10 servicios disponibles durante ese período]
- Plan profesional: [85€+iva (102,85€) / mes (30 dias naturales) y hasta 20 servicios disponibles durante ese período]
- Plan ilimitado: [199€+iva (240,80€) / mes (30 dias naturales) y servicios ilimitados durante ese período]


Incluye:
- Numero de servicios al mes según plan
- Acceso al Dashboard para la funeraria con control de todas sus paginas
- Envío de PDF de forma automática al finalizar el período de prueba
- Soporte y configuración

Lo importante es que la funeraria puede ofrecerlo como un servicio adicional de valor para la familia. El precio que hemos estimado de un servicio es entre 50 y 100€ a vuestra elección

👉 En muchos casos se integra dentro del servicio aunque se puede repercutir fácilmente.
`


}
};

function startEditing(funeraria) {
  setIsEditing(true);
  setEditDraft({
    nombre: funeraria.nombre || "",
    direccion: funeraria.direccion || "",
    pais: funeraria.pais || "",
    ciudad: funeraria.ciudad || "",
    provincia_estado: funeraria.provincia_estado || "",
    telefono: funeraria.telefono || "",
    email: funeraria.email || "",
    web: funeraria.web || "",
    tipo_empresa: funeraria.tipo_empresa || "Funeraria",
tipo_grupo: funeraria.tipo_grupo || "Independiente",
  });
}

function cancelEditing() {
  setIsEditing(false);
  setEditDraft(null);
}

async function saveFunerariaDatos(id) {
  if (!editDraft) return;

  const dedupe_key = [
    editDraft.nombre?.trim()?.toLowerCase() || "",
    editDraft.pais?.trim()?.toLowerCase() || "",
    editDraft.ciudad?.trim()?.toLowerCase() || "",
    editDraft.provincia_estado?.trim()?.toLowerCase() || "",
    editDraft.telefono?.trim()?.toLowerCase() || "",
    editDraft.direccion?.trim()?.toLowerCase() || "",
  ].join("|");

  const finalPatch = {
    ...editDraft,
    dedupe_key,
  };

  const { error } = await supabase
    .from("crm_funerarias")
    .update(finalPatch)
    .eq("id", id);

  if (error) {
    alert(`Error guardando datos: ${error.message}`);
    return;
  }

  setRows((prev) =>
    prev.map((r) => (r.id === id ? { ...r, ...finalPatch } : r))
  );

  setIsEditing(false);
  setEditDraft(null);
}

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

  useEffect(() => {
  setIsEditing(false);
  setEditDraft(null);
}, [selectedId]);

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

  const pageSize = 1000;
  let from = 0;
  let allRows = [];
  let keepGoing = true;

  while (keepGoing) {
    const { data, error } = await supabase
      .from("crm_funerarias")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      alert(error.message);
      setLoadingRows(false);
      return;
    }

    allRows = allRows.concat(data || []);

    if (!data || data.length < pageSize) {
      keepGoing = false;
    } else {
      from += pageSize;
    }
  }

  setRows(allRows);
  if (allRows.length) {
    setSelectedId((prev) => prev || allRows[0].id);
  }
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

const countries = useMemo(
  () =>
    [...new Set(rows.map((r) => r.pais).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b)
    ),
  [rows]
);

 const filteredRows = useMemo(() => {
  return rows.filter((row) => {
    const okCountry =
      selectedCountry === "all" || row.pais === selectedCountry;

    const okProvince =
      selectedProvince === "all" || row.provincia_estado === selectedProvince;

    const okStatus =
      statusFilter === "all" || row.estado_contacto === statusFilter;

      const okTipoEmpresa =
  tipoEmpresaFilter === "all" || row.tipo_empresa === tipoEmpresaFilter;

const okTipoGrupo =
  tipoGrupoFilter === "all" || row.tipo_grupo === tipoGrupoFilter;

    const hayTexto = `${row.nombre} ${row.email} ${row.web} ${row.telefono} ${row.provincia_estado} ${row.ciudad} ${row.pais}`.toLowerCase();
    const okSearch = hayTexto.includes(search.toLowerCase());

    return okCountry && okProvince && okStatus && okTipoEmpresa && okTipoGrupo && okSearch;
  });
}, [rows, selectedCountry, selectedProvince, statusFilter, tipoEmpresaFilter, tipoGrupoFilter, search]);

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
  const paisDefault =
  window.prompt("País por defecto (si el CSV no lo trae)", "España") || "España";

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
  row.pais?.trim()?.toLowerCase() || "",
  row.ciudad?.trim()?.toLowerCase() || "",
  row.provincia_estado?.trim()?.toLowerCase() || "",
  row.telefono?.trim()?.toLowerCase() || "",
  row.direccion?.trim()?.toLowerCase() || "",
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
        pais: row.pais || paisDefault,
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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <img
    src={logoEdep}
    alt="EDEP"
    style={{ height: 32, objectFit: "contain" }}
  />
  <h1 style={{ margin: 0 }}>CRM</h1>
</div>
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
async function createFuneraria() {
  if (!newFuneraria.nombre.trim()) {
    alert("El nombre es obligatorio");
    return;
  }

  const dedupe_key = [
    newFuneraria.nombre?.trim()?.toLowerCase() || "",
    newFuneraria.pais?.trim()?.toLowerCase() || "",
    newFuneraria.ciudad?.trim()?.toLowerCase() || "",
    newFuneraria.provincia_estado?.trim()?.toLowerCase() || "",
    newFuneraria.telefono?.trim()?.toLowerCase() || "",
    newFuneraria.direccion?.trim()?.toLowerCase() || "",
  ].join("|");

  const payload = {
    nombre: newFuneraria.nombre || null,
    direccion: newFuneraria.direccion || null,
    pais: newFuneraria.pais || "España",
    ciudad: newFuneraria.ciudad || null,
    provincia_estado: newFuneraria.provincia_estado || null,
    telefono: newFuneraria.telefono || null,
    email: newFuneraria.email || null,
    web: newFuneraria.web || null,
    tipo_empresa: newFuneraria.tipo_empresa || "Funeraria",
    tipo_grupo: newFuneraria.tipo_grupo || "Independiente",
    estado_contacto: "no_contactada",
    demo: "no_hecha",
    interes: "pendiente",
    dedupe_key,
    origen: "Alta manual CRM",
  };

  const { data, error } = await supabase
    .from("crm_funerarias")
    .insert(payload)
    .select()
    .single();

  if (error) {
    alert(`Error creando funeraria: ${error.message}`);
    console.error("Error creando funeraria:", error);
    return;
  }

  setIsCreating(false);

  setNewFuneraria({
    nombre: "",
    direccion: "",
    pais: "España",
    ciudad: "",
    provincia_estado: "",
    telefono: "",
    email: "",
    web: "",
    tipo_empresa: "Funeraria",
    tipo_grupo: "Independiente",
  });

  await loadRows();

  if (data?.id) {
    setSelectedId(data.id);
  }
}

  async function deleteFuneraria(id, nombre) {
  const ok = window.confirm(`¿Seguro que quieres borrar la funeraria "${nombre}"?`);
  if (!ok) return;

  const { error } = await supabase
    .from("crm_funerarias")
    .delete()
    .eq("id", id);

  if (error) {
    alert(`Error borrando funeraria: ${error.message}`);
    return;
  }

  await loadRows();
}

async function deleteByCountry(country) {
  if (!country || country === "all") {
    alert("Selecciona un país concreto para borrar.");
    return;
  }

  const ok = window.confirm(`¿Seguro que quieres borrar TODAS las funerarias de ${country}?`);
  if (!ok) return;

  const { error } = await supabase
    .from("crm_funerarias")
    .delete()
    .eq("pais", country);

  if (error) {
    alert(`Error borrando país: ${error.message}`);
    return;
  }

  await loadRows();
}

async function deleteAllFunerarias() {
  const ok = window.confirm("¿Seguro que quieres borrar TODAS las funerarias del CRM?");
  if (!ok) return;

  const confirmText = window.prompt('Escribe BORRAR para confirmar');
  if (confirmText !== "BORRAR") return;

  const { error } = await supabase
    .from("crm_funerarias")
    .delete()
    .not("id", "is", null);

  if (error) {
    alert(`Error borrando todo: ${error.message}`);
    return;
  }

  await loadRows();
}

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <img
    src={logoEdep}
    alt="EDEP"
    style={{ height: 70, objectFit: "contain" }}
  />
  <h1 style={{ margin: 0 }}>CRM</h1>
</div>
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

  

  <button
    className="button danger"
    onClick={() => deleteByCountry(selectedCountry)}
  >
    Borrar país
  </button>

  <button
    className="button danger"
    onClick={deleteAllFunerarias}
  >
    Borrar todo
  </button>

  <button className="button danger" onClick={signOut}>
    Salir
  </button>

<button
  className="button secondary"
  onClick={() => setIsCreating(true)}
>
  Añadir funeraria
</button>

</div>
        
      </header>

      <section className="stats-grid">
        <div className="stat-card"><span>Total visibles</span><strong>{stats.total}</strong></div>
        <div className="stat-card"><span>Contactadas</span><strong>{stats.contactadas}</strong></div>
        <div className="stat-card"><span>Demos hechas</span><strong>{stats.demos}</strong></div>
        <div className="stat-card"><span>No interesadas</span><strong>{stats.noInteresadas}</strong></div>
      </section>

     <section className="filters-card filters-card-4">
  <input
    className="input"
    placeholder="Buscar por nombre, email, web o teléfono"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
  />

  <select
    className="input"
    value={selectedCountry}
    onChange={(e) => {
      setSelectedCountry(e.target.value);
      setSelectedProvince("all");
    }}
  >
    <option value="all">Todos los países</option>
    {countries.map((country) => (
      <option key={country} value={country}>{country}</option>
    ))}
  </select>

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

<select
  className="input"
  value={tipoEmpresaFilter}
  onChange={(e) => setTipoEmpresaFilter(e.target.value)}
>
  <option value="all">Todos los tipos</option>
  <option value="Tanatorio">Tanatorio</option>
  <option value="Funeraria">Funeraria</option>
  <option value="Tanatorio + Servicios funerarios">
    Tanatorio + Servicios funerarios
  </option>
</select>

<select
  className="input"
  value={tipoGrupoFilter}
  onChange={(e) => setTipoGrupoFilter(e.target.value)}
>
  <option value="all">Grupo / independiente</option>
  <option value="Grupo funerario">Grupo funerario</option>
  <option value="Independiente">Independiente</option>
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
                onClick={() => {
  setIsEditing(false);
  setEditDraft(null);
  setSelectedId(row.id);
}}
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

         {isCreating ? (
  <div className="detail-body">
    <div className="hero-card">
      <div className="hero-card-top">
        <div>
          <h3>Nueva funeraria</h3>
          <p>Alta manual desde CRM</p>
        </div>
      </div>
    </div>

    <div className="form-grid">
      <div>
        <label>Nombre</label>
        <input
          className="input"
          value={newFuneraria.nombre}
          onChange={(e) => setNewFuneraria({ ...newFuneraria, nombre: e.target.value })}
        />
      </div>

      <div>
        <label>País</label>
        <input
          className="input"
          value={newFuneraria.pais}
          onChange={(e) => setNewFuneraria({ ...newFuneraria, pais: e.target.value })}
        />
      </div>

      <div>
        <label>Ciudad</label>
        <input
          className="input"
          value={newFuneraria.ciudad}
          onChange={(e) => setNewFuneraria({ ...newFuneraria, ciudad: e.target.value })}
        />
      </div>

      <div>
        <label>Provincia/Estado</label>
        <input
          className="input"
          value={newFuneraria.provincia_estado}
          onChange={(e) => setNewFuneraria({ ...newFuneraria, provincia_estado: e.target.value })}
        />
      </div>

      <div>
        <label>Teléfono</label>
        <input
          className="input"
          value={newFuneraria.telefono}
          onChange={(e) => setNewFuneraria({ ...newFuneraria, telefono: e.target.value })}
        />
      </div>

      <div>
        <label>Email</label>
        <input
          className="input"
          value={newFuneraria.email}
          onChange={(e) => setNewFuneraria({ ...newFuneraria, email: e.target.value })}
        />
      </div>

      <div>
        <label>Web</label>
        <input
          className="input"
          value={newFuneraria.web}
          onChange={(e) => setNewFuneraria({ ...newFuneraria, web: e.target.value })}
        />
      </div>

      <div>
        <label>Dirección</label>
        <input
          className="input"
          value={newFuneraria.direccion}
          onChange={(e) => setNewFuneraria({ ...newFuneraria, direccion: e.target.value })}
        />
      </div>
    </div>

    <div className="topbar-actions">
      <button className="button" onClick={createFuneraria}>
        Guardar nueva funeraria
      </button>

      <button
        className="button secondary"
       onClick={() => {
  setIsEditing(false);
  setEditDraft(null);
  setSelectedId(row.id);
}}
        
      >
        Cancelar
      </button>
    </div>
  </div>
) : !selected ? (
  <div className="empty-state">Selecciona una funeraria del listado.</div>
) : (


            <div className="detail-body">
              
            

         <div className="hero-card">
  <div className="hero-card-top">
    <div>
      <h3>{selected.nombre}</h3>
      <p>
        {selected.ciudad || "Sin ciudad"}
        {selected.provincia_estado ? ` · ${selected.provincia_estado}` : ""}
        {selected.pais ? ` · ${selected.pais}` : ""}
      </p>
    </div>

    <div className="topbar-actions">
      {!isEditing ? (
        <button
          className="button secondary"
          onClick={() => startEditing(selected)}
        >
          Editar
        </button>
      ) : (
        <>
          <button
            className="button"
            onClick={() => saveFunerariaDatos(selected.id)}
          >
            Guardar cambios
          </button>
          <button
            className="button secondary"
            onClick={cancelEditing}
          >
            Cancelar
          </button>
        </>
      )}

      <button
        className="button danger"
        onClick={() => deleteFuneraria(selected.id, selected.nombre)}
      >
        Borrar funeraria
      </button>
    </div>
  </div>
</div>

{!isEditing ? (
  <div className="info-grid">
    <div className="info-box"><span>Nombre</span><strong>{selected.nombre || "No disponible"}</strong></div>
    <div className="info-box"><span>País</span><strong>{selected.pais || "No disponible"}</strong></div>
    <div className="info-box"><span>Ciudad</span><strong>{selected.ciudad || "No disponible"}</strong></div>
    <div className="info-box"><span>Provincia/Estado</span><strong>{selected.provincia_estado || "No disponible"}</strong></div>
    <div className="info-box"><span>Teléfono</span><strong>{selected.telefono || "No disponible"}</strong></div>
    <div className="info-box"><span>Email</span><strong>{selected.email || "No disponible"}</strong></div>
    <div className="info-box"><span>Web</span><strong>{selected.web || "No disponible"}</strong></div>
    <div className="info-box"><span>Dirección</span><strong>{selected.direccion || "No disponible"}</strong></div>
    <div className="info-box">
  <span>Tipo</span>
  <strong>{selected.tipo_empresa || "Sin clasificar"}</strong>
</div>

<div className="info-box">
  <span>Grupo</span>
  <strong>{selected.tipo_grupo || "Sin clasificar"}</strong>
</div>
    
  </div>
) : (
  <div className="form-grid">
    <div>
      <label>Nombre</label>
      <input
        className="input"
        value={editDraft?.nombre || ""}
        onChange={(e) => setEditDraft({ ...editDraft, nombre: e.target.value })}
      />
    </div>

    <div>
      <label>País</label>
      <input
        className="input"
        value={editDraft?.pais || ""}
        onChange={(e) => setEditDraft({ ...editDraft, pais: e.target.value })}
      />
    </div>

    <div>
      <label>Ciudad</label>
      <input
        className="input"
        value={editDraft?.ciudad || ""}
        onChange={(e) => setEditDraft({ ...editDraft, ciudad: e.target.value })}
      />
    </div>

    <div>
      <label>Provincia/Estado</label>
      <input
        className="input"
        value={editDraft?.provincia_estado || ""}
        onChange={(e) => setEditDraft({ ...editDraft, provincia_estado: e.target.value })}
      />
    </div>

    <div>
      <label>Teléfono</label>
      <input
        className="input"
        value={editDraft?.telefono || ""}
        onChange={(e) => setEditDraft({ ...editDraft, telefono: e.target.value })}
      />
    </div>

    <div>
      <label>Email</label>
      <input
        className="input"
        value={editDraft?.email || ""}
        onChange={(e) => setEditDraft({ ...editDraft, email: e.target.value })}
      />
    </div>

    <div>
      <label>Web</label>
      <input
        className="input"
        value={editDraft?.web || ""}
        onChange={(e) => setEditDraft({ ...editDraft, web: e.target.value })}
      />
    </div>

    <div>
      <label>Dirección</label>
      <input
        className="input"
        value={editDraft?.direccion || ""}
        onChange={(e) => setEditDraft({ ...editDraft, direccion: e.target.value })}
      />
    </div>
<div>
  <label>Tipo</label>
  <select
    className="input"
    value={editDraft?.tipo_empresa || "Funeraria"}
    onChange={(e) =>
      setEditDraft({ ...editDraft, tipo_empresa: e.target.value })
    }
  >
    <option value="Tanatorio">Tanatorio</option>
    <option value="Funeraria">Funeraria</option>
    <option value="Tanatorio + Servicios funerarios">
      Tanatorio + Servicios funerarios
    </option>
  </select>
</div>

<div>
  <label>Grupo / Independiente</label>
  <select
    className="input"
    value={editDraft?.tipo_grupo || "Independiente"}
    onChange={(e) =>
      setEditDraft({ ...editDraft, tipo_grupo: e.target.value })
    }
  >
    <option value="Grupo funerario">Grupo funerario</option>
    <option value="Independiente">Independiente</option>
  </select>
</div>

  </div>
)}


{showScript && (
  <div className="script-box">
    <div className="script-box-top">
      <h4>Guion de llamada</h4>
      <div className="script-tabs">
        <button
          className={`script-tab ${scriptSection === "apertura" ? "active" : ""}`}
          onClick={() => setScriptSection("apertura")}
        >
          Apertura
        </button>
        <button
          className={`script-tab ${scriptSection === "explicacion" ? "active" : ""}`}
          onClick={() => setScriptSection("explicacion")}
        >
          Explicación
        </button>
        <button
          className={`script-tab ${scriptSection === "objeciones" ? "active" : ""}`}
          onClick={() => setScriptSection("objeciones")}
        >
          Objeciones
        </button>
        <button
          className={`script-tab ${scriptSection === "cierre" ? "active" : ""}`}
          onClick={() => setScriptSection("cierre")}
        >
          Cierre
        </button>

        <button
          className={`script-tab ${scriptSection === "precios" ? "active" : ""}`}
          onClick={() => setScriptSection("precios")}
        >
          Precios
        </button>
      </div>
    </div>

    <div className="script-content">
      <div className="script-title">{speechSections[scriptSection].titulo}</div>
      <pre className="script-text">{speechSections[scriptSection].texto}</pre>
    </div>
  </div>
)}

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

<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
  <label style={{ margin: 0 }}>Notas</label>

  <button
    className="button secondary"
    onClick={() => setShowScript((prev) => !prev)}
    style={{ padding: "6px 10px", fontSize: 12 }}
  >
    {showScript ? "Ocultar guion" : "Guion Comercial"}
  </button>
</div>

                
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