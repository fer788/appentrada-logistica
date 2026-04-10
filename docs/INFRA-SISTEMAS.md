# AppEntrada Logística — Informe para sistemas

**Repositorio:** https://github.com/fer788/appentrada-logistica.git  
**Rama principal:** `master`  
**Fecha del documento:** documento vivo; revisar último commit en GitHub.

---

## 1. Propósito

Aplicación web interna de **calendario de entregas / logística**: grilla semanal (lunes a sábado), viajes por casilla, ABM de clientes, productos y choferes, exportación de datos, marcado de entregas realizadas, navegación por semanas del año, etc.

---

## 2. Arquitectura técnica

| Capa | Tecnología | Ubicación en el repo |
|------|------------|----------------------|
| Frontend | React 18, Vite 6 | `src/`, build en `dist/` |
| Backend API | Node.js, Express | `server/index.js` |
| Base de datos | **MySQL 8.x** | Esquema y migraciones en `server/db.js` |

### Flujo lógico (desarrollo típico)

1. El **navegador** carga la interfaz desde **Vite** (puerto **5173**).
2. Las peticiones a `/api/*` las recibe Vite y las **proxifica** al backend Express (**4000**).
3. Express persiste y consulta datos en **MySQL** (**3306**).

```
[Navegador] → http://<host>:5173  →  Vite (proxy /api)
                                    →  Express :4000  →  MySQL :3306
```

En **producción** sobre una misma VM, el mismo proceso Node puede servir la API y los archivos estáticos generados en `dist/` (ver sección 7).

---

## 3. Ubicación del código (referencia actual)

| Descripción | Ruta típica |
|-------------|-------------|
| Proyecto en disco de desarrollo | `C:\AiProjects\AppEntrada\logistica` |
| Copia en estructura local `aiprojects` | `C:\aiprojects\AppEntrada\dev\logistica` |

El **origen de verdad** del código versionado es el repositorio Git remoto indicado arriba.

---

## 4. Configuración y secretos

- Archivo **`.env`** en la raíz del proyecto (no se sube al repositorio).
- Plantilla de referencia: **`.env.example`**.

Variables relevantes:

| Variable | Uso |
|----------|-----|
| `PORT` | Puerto del servidor Express (por defecto **4000**) |
| `MYSQL_HOST` | Host de MySQL (ej. `127.0.0.1` o hostname de la VM) |
| `MYSQL_PORT` | Puerto MySQL (típicamente **3306**) |
| `MYSQL_USER` / `MYSQL_PASSWORD` | Credenciales |
| `MYSQL_DATABASE` | Nombre de la base (por defecto **`logistica_entregas`**) |

**Recomendación:** en producción usar usuario MySQL dedicado con permisos mínimos sobre esa base, no `root` sin contraseña.

---

## 5. Base de datos

- **Motor:** MySQL 8.x.
- **Base lógica:** `logistica_entregas` (configurable).
- **Tablas principales:** `clientes`, `choferes`, `productos`, `viajes` (el esquema evoluciona con migraciones al arrancar el servidor en `server/db.js`).

### Datos en disco (modo desarrollo Windows)

Si se usa el script `npm run mysql:start`, puede utilizarse un **datadir local** del proyecto:

- Carpeta: `logistica\.mysql-data\`

En un **servidor o VM corporativa** lo habitual es un **servicio MySQL** con datadir estándar; el proyecto solo requiere la conexión vía `.env`.

---

## 6. Puertos y acceso en red

| Servicio | Puerto | Notas |
|----------|--------|--------|
| Vite (solo desarrollo) | **5173** | UI; con `host: true` acepta conexiones LAN |
| Express API | **4000** | API REST; en dev el navegador suele ir solo a 5173 (proxy) |
| MySQL | **3306** | No exponer a internet; en LAN solo si hay requisito explícito |

**Acceso desde otras PCs en la misma red (modo desarrollo):**  
`http://<IPv4-del-servidor>:5173`  
El firewall del equipo servidor debe permitir **TCP 5173** (perfil de red **Privada**). Script de ayuda en el repo: `npm run lan:firewall` (ejecutar PowerShell **como administrador**).

---

## 7. Comandos operativos

| Comando | Descripción |
|---------|-------------|
| `npm install` | Dependencias |
| `npm run mysql:start` | Intenta levantar MySQL local (Windows; ver `scripts/start-mysql.js`) |
| `npm run dev` | API + frontend en modo desarrollo |
| `npm run build` | Genera `dist/` para producción |
| `npm start` | Servidor Node en modo producción (API + estáticos desde `dist/`) |

---

## 8. Automatización en la estación actual (referencia)

Puede existir en la PC de desarrollo (ajustar según lo instalado):

- Acceso directo en el **Inicio de sesión** de Windows que lanza MySQL + `npm run dev`.
- Tarea programada tipo **KeepAlive** que ejecuta periódicamente `scripts/ensure-stack.ps1` para reintentar el stack si se cae.

En la **VM de producción** conviene reemplazar esto por un **servicio** (Windows Service, PM2, NSSM, systemd en Linux, etc.) y supervisión estándar de la empresa.

---

## 9. Respaldo y recuperación

| Qué | Recomendación |
|-----|----------------|
| Base de datos | `mysqldump` periódico de `logistica_entregas` + política de retención |
| Código | GitHub + procedimientos internos de la organización |
| `.env` | Respaldo cifrado o en gestor de secretos; **no** en el repositorio |
| `.mysql-data` (si aplica) | Respaldo en frío con MySQL detenido, o confiar en dumps lógicos |

**Recuperación típica:** restaurar dump SQL, desplegar tag/commit acordado, colocar `.env` correcto, arrancar `npm start` o servicio equivalente.

---

## 10. Migración recomendada a máquina virtual (VM)

Objetivo: centralizar en un servidor accesible por el equipo (LAN/VPN según política).

1. **MySQL** como servicio en la VM; crear BD y usuario con permisos acotados.
2. **Node.js LTS** instalado en la VM.
3. Clonar el repositorio, configurar `.env` apuntando al MySQL de la VM.
4. `npm ci` → `npm run build` → ejecutar `npm start` (o servicio gestionado).
5. Opcional y recomendable: **proxy inverso** (IIS/nginx) con **HTTPS** y firewall mínimo.
6. MySQL **solo escuchando en localhost** de la VM salvo necesidad explícita de otro host.

---

## 11. Seguridad (resumen)

- No exponer MySQL a internet sin túnel/VPN y hardening.
- En producción, evitar depender del servidor de desarrollo Vite; usar build + `npm start` o contenedor.
- Revisar reglas de firewall y segmentación de red con el área de sistemas.

---

## 12. Contacto y mantenimiento

- **Código y issues:** repositorio GitHub del proyecto.
- **Versionado semántico / releases:** definir política interna (tags, changelog).

---

## Archivos en `docs/`

| Archivo | Uso |
|---------|-----|
| `INFRA-SISTEMAS.md` | Fuente editable (Markdown) |
| `INFRA-SISTEMAS.html` | Vista en navegador o **Imprimir → Guardar como PDF** |
| `INFRA-SISTEMAS.pdf` | PDF listo para compartir (regenerar con `npm run docs:pdf` en la raíz del proyecto) |

---

*Documento para compartir con el área de sistemas. Para la versión más actualizada, sincronizar con el repositorio.*
