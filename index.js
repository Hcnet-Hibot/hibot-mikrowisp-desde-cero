require('dotenv').config();
const express = require('express');
const mikrowisp = require('./mikrowisp');
const hibot = require('./hibot');
const { limpiarNumeroEcuador } = require('./utils');
const pkg = require('./package.json');
const multer = require('multer');
const upload = multer();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helpers
function bad(res, msg, code = 400) {
  return res.status(code).json({ estado: 'error', mensaje: msg });
}
function ok(res, data = {}) {
  return res.json({ estado: 'exito', ...data });
}

/* -------------------------
 *  CONSULTAS POR CÉDULA
 * ------------------------- */

// GET informativo (devuelve 200 siempre; si no hay cliente vendrá notFound:true)
app.get('/api/cliente', async (req, res) => {
  const { cedula } = req.query;
  if (!cedula) return bad(res, 'Cédula no proporcionada');
  try {
    const datos = await mikrowisp.consultarClientePorCedula(cedula);
    return res.json(datos);
  } catch (e) {
    return bad(res, 'Error interno consultando cliente', 500);
  }
});

// POST para ramificar en Easyflow con 200/400
app.post('/api/cliente', async (req, res) => {
  const { cedula } = req.body || {};
  const ced = String(cedula || '').trim();
  if (!ced) return res.status(400).json({ error: 'CEDULA_VACIA' });

  try {
    const datos = await mikrowisp.consultarClientePorCedula(ced);
    if (datos?.notFound) {
      // Ruta clara de error para que tu flujo vaya al nodo "Repetir cédula"
      return res.status(400).json({ error: 'CLIENTE_NO_ENCONTRADO' });
    }
    return res.status(200).json(datos);
  } catch (e) {
    console.error('Error consultando cliente:', e);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// Evaluación estructurada para mapear variables en el flujo
app.post('/api/cliente-evaluar', async (req, res) => {
  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch { payload = {}; }
    }
    if (!payload || Object.keys(payload).length === 0) payload = req.query || {};

    const { cedula } = payload || {};
    if (!cedula) return bad(res, 'Cédula no proporcionada');

    const r = await mikrowisp.evaluarClientePorCedula(cedula);

    if (r?.notFound) {
      return res.status(400).json({ error: 'CLIENTE_NO_ENCONTRADO', ...r });
    }

    // ⬇️ Alias para Easyflow
    const v = Number(r.variosServiciosValidos || 0);
    return ok(res, {
      ...r,
      VARIOS_VALIDOS: v,                // cantidad de items listados
      VARIOS_VALIDOS_MAS_UNO: v + 1,    // para simular "≤"
      SERVICIOS_LISTA: r.serviciosTexto || ''
    });
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});


// Datos RAW (para debug)
app.get('/api/cliente/raw', async (req, res) => {
  const { cedula } = req.query;
  if (!cedula) return bad(res, 'Cédula no proporcionada');
  try {
    const datos = await mikrowisp.consultarClientePorCedulaRaw(cedula);
    return ok(res, { datos });
  } catch (e) {
    return bad(res, 'Error interno consultando cliente (raw)', 500);
  }
});

/* -------------------------
 *  UTILIDADES MENSAJERÍA
 * ------------------------- */

app.post('/api/enviar-imagen', async (req, res) => {
  const { numero, url } = req.body || {};
  const recipient = limpiarNumeroEcuador(numero);
  if (!recipient || !url) return bad(res, 'Falta el número (formato EC) o la URL de la imagen');
  try {
    const r = await hibot.enviarMensajeHibot({
      recipient,
      media: url,
      mediaType: 'IMAGE',
      mediaFileName: 'imagen.jpg'
    });
    return ok(res, { respuesta: r });
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});

app.post('/api/enviar-sticker', async (req, res) => {
  const { numero, url } = req.body || {};
  const recipient = limpiarNumeroEcuador(numero);
  if (!recipient || !url) return bad(res, 'Falta el número (formato EC) o la URL del sticker');
  try {
    const r = await hibot.enviarMensajeHibot({
      recipient,
      media: url,
      mediaType: 'STICKER',
      mediaFileName: 'sticker.webp'
    });
    return ok(res, { respuesta: r });
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});

app.post('/api/enviar-texto', async (req, res) => {
  const { numero, texto } = req.body || {};
  const recipient = limpiarNumeroEcuador(numero);
  if (!recipient || !texto) return bad(res, 'Falta el número (formato EC) o el texto');
  try {
    const r = await hibot.enviarTexto({ recipient, texto });
    return ok(res, { respuesta: r });
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});

// === Consulta y envía al número recibido (ajustado para 400 si no existe) ===
app.post('/api/cliente-enviar', async (req, res) => {
  const { cedula, numero } = req.body || {};
  const recipient = limpiarNumeroEcuador(numero);
  if (!cedula || !recipient) {
    return bad(res, 'Faltan datos requeridos (cedula y numero en formato EC)');
  }

  try {
    const datos = await mikrowisp.consultarClientePorCedula(cedula);

    // ⬇️ Cambio clave: si no existe el cliente, responde 400
    if (datos?.notFound) {
      return res.status(400).json({ error: 'CLIENTE_NO_ENCONTRADO' });
    }

    // Si existe, enviamos el texto normalmente (sin mensaje genérico de fallback)
    const texto = datos?.mensaje || '';
    await hibot.enviarTexto({ recipient, texto });

    return ok(res, { mensaje: '¡Listo! Consulta enviada a tu WhatsApp.' });
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});


/* -------------------------
 *  PROMESA DE PAGO
 * ------------------------- */

// Acepta JSON, x-www-form-urlencoded, multipart/form-data (sin archivos) y text/plain (JSON)
app.post(
  '/api/promesa-pago',
  upload.none(),
  express.text({ type: ['text/*', '*/*'] }),
  async (req, res) => {
    try {
      // Normalizar payload
      let payload = req.body;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = {}; }
      }
      if (!payload || Object.keys(payload).length === 0) payload = req.query || {};

      const { cedula, dias = 3, descripcion, seleccion } = payload || {};
      if (!cedula) return bad(res, 'Cédula no proporcionada');

      // 1) Traer servicios del cliente
      const clientes = await mikrowisp.consultarClientePorCedulaRaw(cedula);

      // Misma lógica/orden que usa evaluarClientePorCedula:
      const activos = clientes.filter(c => (c.estado || '').toUpperCase() === 'ACTIVO');
      const suspendidos = clientes.filter(c => (c.estado || '').toUpperCase() === 'SUSPENDIDO');
      const activos_suspendidos = [...activos, ...suspendidos];

      if (activos_suspendidos.length === 0) {
        return bad(res, 'No se encontraron servicios activos o suspendidos para esa cédula', 404);
      }

      // "Válidos": suspendidos o con deuda (coincide con la lista que ve el usuario)
      const validos = activos_suspendidos.filter(c => {
        const estado = (c.estado || '').toUpperCase();
        const nopag = Number(c?.facturacion?.facturas_nopagadas || 0);
        const total = Number(c?.facturacion?.total_facturas || 0);
        const conDeuda = nopag > 0 && total > 0;
        return estado === 'SUSPENDIDO' || conDeuda;
      });

    // 2) Seleccionar el servicio objetivo (VALIDACIÓN ESTRICTA)
let servicioObjetivo = null;

// ¿El flujo envió "seleccion" explícitamente?
const vieneSeleccion = typeof seleccion !== 'undefined' && String(seleccion).trim() !== '';

if (vieneSeleccion) {
  const selN = parseInt(seleccion, 10);

  // Si la selección no es un entero entre 1 y validos.length -> devolver 400
  if (!Number.isInteger(selN) || selN < 1 || selN > validos.length) {
    return res.status(400).json({
      error: 'SELECCION_INVALIDA',
      min: 1,
      max: validos.length
    });
  }

  // Selección válida: tomar ese servicio (1-based)
  servicioObjetivo = validos[selN - 1];
} else {
  // Sin selección explícita:
  // - si solo hay un válido, usarlo
  // - si hay varios, priorizar con deuda; si no, el primero
  if (validos.length === 1) {
    servicioObjetivo = validos[0];
  } else {
    servicioObjetivo =
      validos.find(c => Number(c?.facturacion?.facturas_nopagadas || 0) > 0) ||
      validos[0];
  }
}


      // 3) Buscar facturas NO PAGADAS del servicio seleccionado
      const idcliente =
        servicioObjetivo?.idcliente ??
        servicioObjetivo?.idCliente ??
        servicioObjetivo?.cliente_id ??
        servicioObjetivo?.IdCliente ??
        servicioObjetivo?.id;

      if (!idcliente) return bad(res, 'No se pudo determinar el ID del cliente para crear la promesa', 422);

      const facturasNoPagadas = await mikrowisp.obtenerFacturasPorCliente({ idcliente, estado: 1, limit: 25 });
      if (!Array.isArray(facturasNoPagadas) || facturasNoPagadas.length === 0) {
        return bad(res, 'El cliente no tiene facturas no pagadas para registrar promesa', 409);
      }

      // Elegir la factura con vencimiento más cercano
      const selFactura = [...facturasNoPagadas].sort((a, b) => {
        const va = (a?.vencimiento || '');
        const vb = (b?.vencimiento || '');
        return va.localeCompare(vb);
      })[0];

      // 4) Calcular fecha límite (hoy + N días, máx 20) -> 'YYYY-MM-DD'
      const n = Math.min(Math.max(parseInt(dias, 10) || 3, 1), 20);
      const hoy = new Date();
      const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
      const yyyy = limite.getFullYear();
      const mm = String(limite.getMonth() + 1).padStart(2, '0');
      const dd = String(limite.getDate()).padStart(2, '0');
      const fechalimite = `${yyyy}-${mm}-${dd}`;

      // 5) Crear promesa
const resp = await mikrowisp.crearPromesaPago({
  idfactura: selFactura.id,
  fechalimite,
  descripcion: descripcion || `Promesa ${n} día(s) vía Hibot`
});

// 👉 NUEVO: nombre del cliente/servicio seleccionado
const nombreCliente =
  servicioObjetivo?.nombre ??
  servicioObjetivo?.Cliente ??
  servicioObjetivo?.cliente ??
  servicioObjetivo?.nombres ??
  'Cliente';

return ok(res, {
  mensaje: resp?.mensaje || 'Promesa de pago registrada.',
  idfactura: selFactura.id,
  fechalimite,
  nombre: nombreCliente            // ← **esto es lo que mapearás**
});

    } catch (e) {
      return bad(res, e.response?.data || e.message, 500);
    }
  }
);

/* -------------------------
 *  OTROS ENDPOINTS
 * ------------------------- */

// Limpiar variable de cédula en HiBot
app.all('/api/limpiar-id', (_req, res) => {
  return res.json({ id: '', ID: '' });
});

// Probar cálculo de CORTE a partir de una factura (debug)
app.get('/api/factura-corte', async (req, res) => {
  try {
    const { idfactura } = req.query;
    if (!idfactura) return res.status(400).json({ estado: 'error', mensaje: 'Falta idfactura' });
    const factura = await mikrowisp.obtenerFacturaPorId(idfactura);
    const vencimiento = factura.vencimiento;
    const fecha_corte = mikrowisp.calcularFechaCorteDesdeVencimientoStr(vencimiento);
    return res.json({
      estado: 'exito',
      factura: { id: factura.id, total: factura.total, estado: factura.estado, vencimiento },
      fecha_corte
    });
  } catch (e) {
    return res.status(500).json({ estado: 'error', mensaje: e.response?.data || e.message });
  }
});

// Health / Version
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime(), version: pkg.version }));
app.get('/api/version', (_req, res) => res.json({ version: pkg.version }));

// Puerto
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
