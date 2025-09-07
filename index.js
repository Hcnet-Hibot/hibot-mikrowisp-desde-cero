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
function bad(res, msg, code = 400) { return res.status(code).json({ estado: 'error', mensaje: msg }); }
function ok(res, data = {}) { return res.json({ estado: 'exito', ...data }); }

// === Consulta por cédula (GET/POST) ===
app.get('/api/cliente', async (req, res) => {
  const { cedula } = req.query;
  if (!cedula) return bad(res, 'Cédula no proporcionada');
  try {
    const datos = await mikrowisp.consultarClientePorCedula(cedula);
    // Para compatibilidad, GET devuelve 200 siempre con el objeto (usa notFound si procede)
    return res.json(datos);
  } catch (e) {
    return bad(res, 'Error interno consultando cliente', 500);
  }
});

// === Limpiar variable de cédula (Hibot) ===
app.all('/api/limpiar-id', (_req, res) => {
  return res.json({ id: '', ID: '' });
});

// === Consulta por cédula (POST) para ramificar en Easyflow (200/400) ===
app.post('/api/cliente', async (req, res) => {
  const { cedula } = req.body || {};
  const ced = String(cedula || '').trim();

  if (!ced) {
    return res.status(400).json({ error: 'CEDULA_VACIA' });
  }

  try {
    const datos = await mikrowisp.consultarClientePorCedula(ced);

    if (datos?.notFound) {
      // 👉 Easyflow tomará la rama 400 y mostrará TU nodo "Repetir cédula"
      return res.status(400).json({ error: 'CLIENTE_NO_ENCONTRADO' });
    }

    // ✅ Válido: seguirás recibiendo { mensaje: ... } con ACTIVO/SUSPENDIDO o listado
    return res.status(200).json(datos);

  } catch (e) {
    console.error('Error consultando cliente:', e);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

// === NUEVO: Datos RAW de MikroWisp ===
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

// === Enviar imagen ===
app.post('/api/enviar-imagen', async (req, res) => {
  const { numero, url } = req.body || {};
  const recipient = limpiarNumeroEcuador(numero);
  if (!recipient || !url) return bad(res, 'Falta el número (formato EC) o la URL de la imagen');
  try {
    const r = await hibot.enviarMensajeHibot({ recipient, media: url, mediaType: 'IMAGE', mediaFileName: 'imagen.jpg' });
    return ok(res, { respuesta: r });
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});

// === Enviar sticker ===
app.post('/api/enviar-sticker', async (req, res) => {
  const { numero, url } = req.body || {};
  const recipient = limpiarNumeroEcuador(numero);
  if (!recipient || !url) return bad(res, 'Falta el número (formato EC) o la URL del sticker');
  try {
    const r = await hibot.enviarMensajeHibot({ recipient, media: url, mediaType: 'STICKER', mediaFileName: 'sticker.webp' });
    return ok(res, { respuesta: r });
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});

// === Enviar texto ===
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

// === Consulta y envía al número recibido (mejorado)
app.post('/api/cliente-enviar', async (req, res) => {
  const { cedula, numero } = req.body || {};
  const recipient = limpiarNumeroEcuador(numero);
  if (!cedula || !recipient) return bad(res, 'Faltan datos requeridos (cedula y numero en formato EC)');
  try {
    const datos = await mikrowisp.consultarClientePorCedula(cedula);
    await hibot.enviarTexto({ recipient, texto: datos.mensaje || 'No se pudo generar el mensaje.' });
    return ok(res, { mensaje: '¡Listo! Consulta enviada a tu WhatsApp.' });
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});

// === Probar cálculo de CORTE desde una idfactura (usa GetInvoice)
app.get('/api/factura-corte', async (req, res) => {
  try {
    const { idfactura } = req.query;
    if (!idfactura) {
      return res.status(400).json({ estado: 'error', mensaje: 'Falta idfactura' });
    }
    const factura = await mikrowisp.obtenerFacturaPorId(idfactura);
    const vencimiento = factura.vencimiento; // "YYYY-MM-DD" según documentación
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

// === Evaluación estructurada para ramificar el flujo
app.post('/api/cliente-evaluar', async (req, res) => {
  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { payload = {}; }
    }
    if (!payload || Object.keys(payload).length === 0) payload = req.query || {};

    const { cedula } = payload || {};
    if (!cedula) return bad(res, 'Cédula no proporcionada');

    const r = await mikrowisp.evaluarClientePorCedula(cedula);

    // ⬇️ Clave: si no hay cliente, devolver 400 para que el flujo vaya a tu "Repetir cédula"
    if (r?.notFound) {
      return res.status(400).json({ error: 'CLIENTE_NO_ENCONTRADO', ...r });
    }

    // Si existe, 200 con todas las variables para mapear
    return ok(res, r);
  } catch (e) {
    return bad(res, e.response?.data || e.message, 500);
  }
});


// === Crear Promesa de Pago por cédula (3 días por defecto)
app.post(
  '/api/promesa-pago',
  upload.none(),
  express.text({ type: ['text/*', '*/*'] }),
  async (req, res) => {
    try {
      // Normalizar payload
      let payload = req.body;

      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (_) { payload = {}; }
      }
      if (!payload || Object.keys(payload).length === 0) {
        payload = req.query || {};
      }

      const { cedula, dias = 3, descripcion } = payload || {};
      if (!cedula) return bad(res, 'Cédula no proporcionada');

      // 1) Traer servicios del cliente
      const clientes = await mikrowisp.consultarClientePorCedulaRaw(cedula);
      const activos = clientes.filter(c => (c.estado || '').toUpperCase() === 'ACTIVO');
      const suspendidos = clientes.filter(c => (c.estado || '').toUpperCase() === 'SUSPENDIDO');
      const candidatos = [...suspendidos, ...activos]; // priorizamos suspendidos

      if (candidatos.length === 0) {
        return bad(res, 'No se encontraron servicios activos o suspendidos para esa cédula', 404);
      }

      // Tomar el primer servicio con deuda si es posible
      let servicioObjetivo = candidatos.find(c => Number(c?.facturacion?.facturas_nopagadas || 0) > 0) || candidatos[0];

      // 2) Buscar facturas NO PAGADAS del servicio
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

      // Elegir factura con vencimiento más cercano
      const sel = [...facturasNoPagadas].sort((a, b) => {
        const va = (a?.vencimiento || '');
        const vb = (b?.vencimiento || '');
        return va.localeCompare(vb);
      })[0];

      // 3) Calcular fecha límite (hoy + N días, máx 20) -> 'YYYY-MM-DD'
      const n = Math.min(Math.max(parseInt(dias, 10) || 3, 1), 20);
      const hoy = new Date();
      const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
      const yyyy = limite.getFullYear();
      const mm = String(limite.getMonth() + 1).padStart(2, '0');
      const dd = String(limite.getDate()).padStart(2, '0');
      const fechalimite = `${yyyy}-${mm}-${dd}`;

      // 4) Crear promesa
      const resp = await mikrowisp.crearPromesaPago({
        idfactura: sel.id,
        fechalimite,
        descripcion: descripcion || `Promesa ${n} día(s) vía Hibot`
      });

      return ok(res, {
        mensaje: resp?.mensaje || 'Promesa de pago registrada.',
        idfactura: sel.id,
        fechalimite
      });
    } catch (e) {
      return bad(res, e.response?.data || e.message, 500);
    }
  }
);

// === Health / Version ===
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime(), version: pkg.version }));
app.get('/api/version', (_req, res) => res.json({ version: pkg.version }));

// Puerto
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
