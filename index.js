require('dotenv').config();
const express = require('express');
const mikrowisp = require('./mikrowisp');
const hibot = require('./hibot');
const { limpiarNumeroEcuador } = require('./utils');
const pkg = require('./package.json');

const app = express();
app.use(express.json());

// Helpers
function bad(res, msg, code = 400) { return res.status(code).json({ estado: 'error', mensaje: msg }); }
function ok(res, data = {}) { return res.json({ estado: 'exito', ...data }); }

// === Consulta por cédula (GET/POST) ===
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

app.post('/api/cliente', async (req, res) => {
  const { cedula } = req.body || {};
  if (!cedula) return bad(res, 'Cédula no proporcionada');
  try {
    const datos = await mikrowisp.consultarClientePorCedula(cedula);
    return res.json(datos);
  } catch (e) {
    return bad(res, 'Error interno consultando cliente', 500);
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

// === NUEVO: Enviar texto ===
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

// === Consulta y envía al número recibido (mejorado) ===
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

// === Probar cálculo de CORTE desde una idfactura (usa GetInvoice) ===
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


// === Health / Version ===
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), version: pkg.version }));
app.get('/api/version', (req, res) => res.json({ version: pkg.version }));

// Puerto
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
