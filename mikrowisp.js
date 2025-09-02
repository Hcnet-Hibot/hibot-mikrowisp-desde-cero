require('dotenv').config();
const axios = require('axios');
const https = require('https');

const apiUrl = process.env.MIKROWISP_API;   // ej: https://demo.mikrosystem.net/api/v1
const token = process.env.MIKROWISP_TOKEN;  // ej: Smx2SVdkbUZIdjlCUlkxdFo1cUNMQT09
const DEBUG = String(process.env.DEBUG_MIKROWISP || '').trim() === '1';

const agent = new https.Agent({ rejectUnauthorized: false });

// ================== Utilidades ==================
function logDebug(...args) {
  if (DEBUG) console.error('[mikrowisp]', ...args);
}

function apiUrlJoin(path) {
  if (!apiUrl) throw new Error('MIKROWISP_API no está definido');
  if (apiUrl.endsWith('/')) return apiUrl + path.replace(/^\//, '');
  return apiUrl + '/' + path.replace(/^\//, '');
}

async function apiPost(path, body) {
  const url = apiUrlJoin(path);
  try {
    const { data } = await axios.post(url, body, { httpsAgent: agent });
    return data;
  } catch (e) {
    const status = e.response?.status;
    const rdata = e.response?.data;
    logDebug('Fallo POST', { url, status, rdata, message: e.message });
    const err = new Error(`Fallo API POST ${path}${status ? ' [' + status + ']' : ''}`);
    err._status = status;
    err._rdata = rdata;
    throw err;
  }
}

// ================== Fechas ==================
function parseFechaFlexible(s) {
  if (!s) return null;
  const t = String(s).trim();
  // YYYY-MM-DD (opcionalmente con T…)
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const [y, m, d] = t.split('T')[0].split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(+dt) ? null : dt;
  }
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(t)) {
    const [d, m, y] = t.split('/').map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(+dt) ? null : dt;
  }
  return null;
}

function formatDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function calcularFechaCorteDesdeVencimientoStr(vencimientoStr) {
  const venc = parseFechaFlexible(vencimientoStr);
  if (!venc) return null;
  const dia = venc.getDate();
  const gracia = (dia === 1) ? 6 : 3; // 1 -> +6 (día 7), 15 -> +3 (día 18), otros -> +3
  const corte = new Date(venc.getFullYear(), venc.getMonth(), venc.getDate() + gracia);
  return `${formatDDMMYYYY(corte)} 00:00`;
}

function calcularVencimientoDesdeDiaPago(diaPago) {
  const d = Number(diaPago);
  if (!Number.isInteger(d) || d < 1 || d > 28) return null; // evitamos meses cortos
  const hoy = new Date();
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), d);
  if (hoy > base) return new Date(hoy.getFullYear(), hoy.getMonth() + 1, d);
  return base;
}

// idcliente robusto
function getIdCliente(c) {
  return (
    c?.idcliente ??
    c?.idCliente ??
    c?.cliente_id ??
    c?.IdCliente ??
    c?.id ??
    null
  );
}

// ================== Llamadas API ==================
async function consultarClientePorCedulaRaw(cedula) {
  const data = await apiPost('GetClientsDetails', { token, cedula });
  return Array.isArray(data?.datos) ? data.datos : [];
}

// Factura por id (para pruebas)
async function obtenerFacturaPorId(idfactura) {
  const data = await apiPost('GetInvoice', { token, idfactura: Number(idfactura) });
  if (!data || !data.factura) throw new Error('Factura no encontrada');
  return data.factura;
}

// Facturas por cliente (0=pagadas, 1=no pagadas, 2=anuladas, vacío=cualquiera)
async function obtenerFacturasPorCliente({ idcliente, estado = null, limit = 25 }) {
  const body = { token, idcliente: Number(idcliente), limit: Number(limit) };
  if (estado !== null) body.estado = Number(estado);
  const data = await apiPost('GetInvoices', body);
  return Array.isArray(data?.facturas) ? data.facturas : [];
}

function escogerVencimientoMasCercano(facturas) {
  const fechas = facturas
    .map(f => parseFechaFlexible(f.vencimiento))
    .filter(Boolean)
    .sort((a, b) => a - b);
  return fechas.length ? fechas[0] : null;
}

// Intenta obtener vencimiento/corte para un servicio sin romper si falla algo
async function obtenerVencimientoYCorteParaServicio(c) {
  try {
    // 1) campos directos
    let vencimientoStr =
      c?.facturacion?.vencimiento ||
      c?.facturacion?.fecha_vencimiento ||
      c?.facturacion?.proximo_pago ||
      c?.facturacion?.prox_pago ||
      null;

    // 2) GetInvoices (1 = No pagadas)
    if (!vencimientoStr) {
      const idcliente = getIdCliente(c);
      if (idcliente) {
        try {
          const facturasNoPagadas = await obtenerFacturasPorCliente({ idcliente, estado: 1, limit: 25 });
          const fechaMasCercana = escogerVencimientoMasCercano(facturasNoPagadas);
          if (fechaMasCercana) vencimientoStr = formatDDMMYYYY(fechaMasCercana);
        } catch (e) {
          // No interrumpimos el flujo por un fallo en GetInvoices
          logDebug('GetInvoices falló para idcliente', idcliente, e._status, e._rdata || e.message);
        }
      }
    }

    // 3) día de pago
    if (!vencimientoStr) {
      const diaPago = c?.facturacion?.dia_pago ?? c?.facturacion?.diapago ?? null;
      const vencCalc = calcularVencimientoDesdeDiaPago(diaPago);
      if (vencCalc) vencimientoStr = formatDDMMYYYY(vencCalc);
    }

    const parsed = vencimientoStr ? parseFechaFlexible(vencimientoStr) : null;
    const vencFmt = parsed ? formatDDMMYYYY(parsed) : (vencimientoStr || null);
    const corteStr = calcularFechaCorteDesdeVencimientoStr(vencimientoStr);

    return { vencFmt, corteStr };
  } catch (e) {
    logDebug('obtenerVencimientoYCorteParaServicio error:', e.message);
    return { vencFmt: null, corteStr: null };
  }
}

// ================== Lógica principal ==================
async function consultarClientePorCedula(cedula) {
  try {
    const clientes = await consultarClientePorCedulaRaw(cedula);

    const activos = clientes.filter(c => (c.estado || '').toUpperCase() === 'ACTIVO');
    const suspendidos = clientes.filter(c => (c.estado || '').toUpperCase() === 'SUSPENDIDO');
    const retirados = clientes.filter(c => (c.estado || '').toUpperCase() === 'RETIRADO');
    const activos_suspendidos = [...activos, ...suspendidos];

    if ((activos_suspendidos.length === 0 && retirados.length > 0) || clientes.length === 0) {
      return { mensaje: '❗No existe un cliente registrado con esa cédula. Por favor verifique sus datos. Si cree que esto es un error, contáctenos.' };
    }

    // Un solo servicio
    if (activos_suspendidos.length === 1) {
      const c = activos_suspendidos[0];
      const estado = (c.estado || '').toUpperCase();
      const factNoPag = c.facturacion?.facturas_nopagadas ?? 0;
      const total = c.facturacion?.total_facturas ?? '0.00';
      const nombre = c.nombre || 'Usuario';

      if (estado === 'SUSPENDIDO') {
        // también podríamos mostrar fechas aquí si quieres; por ahora mensaje clásico
        return {
          mensaje:
            `🚫 Estimado/a cliente *${nombre}*, Su servicio se encuentra suspendido *POR FALTA DE PAGO*. ` +
            `Tiene ${factNoPag} factura(s) pendiente(s) por un valor total a pagar de: $${total}. ` +
            (corteStr ? `\n⛔ *Su fecha de corte se realizó el día:* ${corteStr}-` : '') +
            `Si ya realizó su pago, por favor envíe su comprobante.`
        };
      }

      if (estado === 'ACTIVO') {
        if (Number(factNoPag) === 0 || String(total) === '0.00') {
          return { mensaje: `🌟 Estimado/a cliente *${nombre}*, su servicio se encuentra activo ✅ y no cuenta con facturas pendientes. ¡Gracias por confiar en nosotros!` };
        }

        const { vencFmt, corteStr } = await obtenerVencimientoYCorteParaServicio(c);
        return {
          mensaje:
            `⚠️ Estimado/a cliente *${nombre}*, Ya se encuentra disponible su factura. El valor total a pagar es: $${total}. 💳` +
            (corteStr ? `\n⛔ *Su fecha de corte es el día:* ${corteStr}` : '')
        };
      }
    }

    // Varios servicios
    if (activos_suspendidos.length > 1) {
      let out = `Estimado/a cliente, actualmente cuenta con ${activos_suspendidos.length} servicios contratados:\n\n`;

      for (const c of activos_suspendidos) {
        const estado = (c.estado || '').toUpperCase();
        const factNoPag = c.facturacion?.facturas_nopagadas ?? 0;
        const total = c.facturacion?.total_facturas ?? '0.00';
        const nombre = c.nombre || 'Usuario';

        if (estado === 'SUSPENDIDO') {
          // Mostrar fechas también en suspendidos
          const { vencFmt, corteStr } = await obtenerVencimientoYCorteParaServicio(c);
          out += `🚫 *${nombre}*: Su servicio se encuentra suspendido *POR FALTA DE PAGO*. El valor total a pagar es: $${total}. 💳` +
                 (corteStr ? `\n⛔ *Su fecha de corte se realizó el día:* ${corteStr}-` : '') +
                 `\n\n`;
        } else if (estado === 'ACTIVO') {
          if (Number(factNoPag) === 0 || String(total) === '0.00') {
            out += `✅ *${nombre}*: Activo y sin deudas.\n\n`;
          } else {
            const { vencFmt, corteStr } = await obtenerVencimientoYCorteParaServicio(c);
            out += `⚠️ *${nombre}*: Ya se encuentra disponible su factura. El valor total a pagar es: $${total}.` +
                   (corteStr ? `\n⛔ *Su fecha de corte es el día:* ${corteStr}` : '') +
                   `\n\n`;
          }
        }
      }
      return { mensaje: out.trim() };
    }

    // Residual
    return { mensaje: '❗No existe un cliente registrado con esa cédula. Por favor verifique sus datos. Si cree que esto es un error, contáctenos.' };
  } catch (e) {
    // Modo silencioso por defecto; con DEBUG=1 mostramos más info
    if (DEBUG) {
      return {
        mensaje: 'Ocurrió un error procesando la consulta.',
        detalle: {
          error: e.message,
          status: e._status || null,
          respuesta_api: e._rdata || null
        }
      };
    }
    return { mensaje: 'Ocurrió un error procesando la consulta.' };
  }
}

module.exports = {
  consultarClientePorCedula,
  consultarClientePorCedulaRaw,
  obtenerFacturaPorId,
  obtenerFacturasPorCliente
};
