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

// === Crear Promesa de Pago por cédula (3 días por defecto) ===
app.post('/api/promesa-pago', async (req, res) => {
  try {
    const { cedula, dias = 3, descripcion } = req.body || {};
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

    // Elegimos la factura con vencimiento más cercano (formato 'YYYY-MM-DD')
    const sel = [...facturasNoPagadas].sort((a, b) => {
      const va = (a?.vencimiento || '');
      const vb = (b?.vencimiento || '');
      return va.localeCompare(vb);
    })[0];

    // 3) Calcular fecha límite = hoy + N días (tope 20) en formato 'YYYY-MM-DD'
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
});



// === Health / Version ===
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), version: pkg.version }));
app.get('/api/version', (req, res) => res.json({ version: pkg.version }));

// Puerto
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
