# CRM Funerarias para Netlify

## Qué hace
- Importar un CSV con funerarias
- Filtrar por provincia
- Buscar por nombre, email, web o teléfono
- Marcar contacto, fecha, demo, interés y notas
- Exportar seguimiento en CSV

## Formato recomendado del CSV
Cabeceras tipo:
- Nombre
- Provincia
- Email
- Web
- Teléfono

## Cómo probarlo en local
1. Instala Node.js
2. Abre esta carpeta en terminal
3. Ejecuta `npm install`
4. Ejecuta `npm run dev`

## Cómo subirlo a Netlify
1. Sube esta carpeta a GitHub
2. En Netlify, importa ese repositorio
3. Build command: `npm run build`
4. Publish directory: `dist`

## Importante
Los cambios se guardan en el navegador del dispositivo. Antes de cambiar de equipo, exporta el CSV o el backup JSON.
