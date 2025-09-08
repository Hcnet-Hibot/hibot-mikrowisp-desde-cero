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

// Crear Promesa de Pago
async function crearPromesaPago({ idfactura, fechalimite, descripcion }) {
  const body = {
    token,
    idfactura: Number(idfactura),
    fechalimite, // 'YYYY-MM-DD'
    ...(descripcion ? { descripcion } : {})
  };
  const data = await apiPost('PromesaPago', body);
  // La API devuelve: { estado: 'exito', mensaje: 'Promesa de pago registrado correctamente.' }
  if (data?.estado !== 'exito') {
    throw new Error(data?.mensaje || 'Error creando promesa de pago');
  }
  return data;
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

    // ⛔ NO ENCONTRADO: sin Activo/Suspendido (aunque haya Retirados) o lista vacía
    if ((activos_suspendidos.length === 0 && retirados.length > 0) || clientes.length === 0) {
      return { notFound: true };
    }

    // Un solo servicio
    if (activos_suspendidos.length === 1) {
      const c = activos_suspendidos[0];
      const estado = (c.estado || '').toUpperCase();
      const factNoPag = c.facturacion?.facturas_nopagadas ?? 0;
      const total = c.facturacion?.total_facturas ?? '0.00';
      const nombre = c.nombre || 'Usuario';

      if (estado === 'SUSPENDIDO') {
        // calcular vencimiento/corte para el servicio suspendido
        const { vencFmt, corteStr } = await obtenerVencimientoYCorteParaServicio(c);

        return {
          mensaje:
            `🚫 Estimado/a cliente *${nombre}*, Su servicio se encuentra suspendido *POR FALTA DE PAGO*. ` +
            `Tiene ${factNoPag} factura(s) pendiente(s) por un valor total a pagar de: $${total}. 💳` +
            (corteStr ? `\n⛔ *Su fecha de corte se realizó el día:* ${corteStr}AM` : '') +
            `\n\n¿Ya realizaste tu pago? \n Por favor envíe su comprobante a *"Ver Servicios"* → *"Pagar Servicios"*.`
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
            (corteStr ? `\n⛔ *Su fecha de corte es el día:* ${corteStr}AM` : '') +
            `\n\n¿Ya realizaste tu pago? \n Por favor envíe su comprobante a *"Ver Servicios"* → *"Pagar Servicios"*.`
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
                 (corteStr ? `\n⛔ *Su fecha de corte se realizó el día:* ${corteStr}AM` : '') +
                 `\n\n`;
        } else if (estado === 'ACTIVO') {
          if (Number(factNoPag) === 0 || String(total) === '0.00') {
            out += `✅ *${nombre}*: Este servicio se encuentra activo y no cuenta con facturas pendientes.\n\n`;
          } else {
            const { vencFmt, corteStr } = await obtenerVencimientoYCorteParaServicio(c);
            out += `⚠️ *${nombre}*: Ya se encuentra disponible su factura. El valor total a pagar es: $${total}. 💳` +
                   (corteStr ? `\n⛔ *Su fecha de corte es el día:* ${corteStr}AM` : '') +
                   `\n\n`;
          }
        }
      }
      return { mensaje: out.trim() };
    }

    // Residual: si nada calza, tratamos como no encontrado (sin mensaje)
    return { notFound: true };
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

// ---- Helper: ¿este servicio tiene deuda?
function servicioTieneDeuda(c) {
  const nopag = Number(c?.facturacion?.facturas_nopagadas || 0);
  const total = Number(c?.facturacion?.total_facturas || 0);
  return nopag > 0 && total > 0;
}

// ---- NUEVO helper: línea de listado
function lineaServicioParaLista(c, idx, vencFmt, corteStr) {
  const n = idx + 1;
  const nombre = c.nombre || `Servicio ${n}`;
  const estado = (c.estado || '').toUpperCase();
  const totalStr = c?.facturacion?.total_facturas ?? '0.00';
  const conDeuda = servicioTieneDeuda(c);

  if (estado === 'SUSPENDIDO') {
    return `*${n})* *${nombre}*: 🚫 Su servicio se encuentra suspendido *POR FALTA DE PAGO*. El valor total a pagar es: $${totalStr}. 💳` +
                 (corteStr ? `\n⛔ *Su fecha de corte se realizó el día:* ${corteStr}AM` : '');
  }
  if (conDeuda) {
    return `*${n})* *${nombre}*: ⚠️ Ya se encuentra disponible su factura. El valor total a pagar es: $${totalStr}. 💳 ` +
                   (corteStr ? `\n⛔ *Su fecha de corte es el día:* ${corteStr}AM` : '');
  }
  return `*${n})* *${nombre}*: ✅ Su servicio se encuentra activo y no cuenta con facturas pendientes. ¡Gracias por confiar en nosotros!`;
}


async function evaluarClientePorCedula(cedula) {
  try {
    const clientes = await consultarClientePorCedulaRaw(cedula);
    const activos = clientes.filter(c => (c.estado || '').toUpperCase() === 'ACTIVO');
    const suspendidos = clientes.filter(c => (c.estado || '').toUpperCase() === 'SUSPENDIDO');
    const retirados = clientes.filter(c => (c.estado || '').toUpperCase() === 'RETIRADO');
    const activos_suspendidos = [...activos, ...suspendidos];

    // Sin nada util
    if ((activos_suspendidos.length === 0 && retirados.length > 0) || clientes.length === 0) {
      return {
        notFound: true,
        tieneDeuda: false,
        variosServicios: 0,
        variosServiciosValidos: 0,
        serviciosTexto: '',
        recomendacion: 'cerrar',
        mensaje: '❗No existe un cliente registrado con esa cédula. Por favor verifique sus datos.'
      };
    }

    // Identificar servicios "válidos" (suspendidos o con deuda)
    const validos = [];
    for (const c of activos_suspendidos) {
      const estado = (c.estado || '').toUpperCase();
      const conDeuda = servicioTieneDeuda(c);
      if (estado === 'SUSPENDIDO' || conDeuda) validos.push(c);
    }

    // === Caso: exactamente 1 válido -> NO pedir número, ir directo a comprobante
    if (validos.length === 1) {
      const c = validos[0];
      const nombre = c.nombre || 'Usuario';
      const estado = (c.estado || '').toUpperCase();
      const totalStr = c?.facturacion?.total_facturas ?? '0.00';
      const factNoPag = Number(c?.facturacion?.facturas_nopagadas || 0);

      const { vencFmt, corteStr } = await obtenerVencimientoYCorteParaServicio(c);

      let mensaje = '';
      if (estado === 'SUSPENDIDO') {
        mensaje =
          `🚫 Estimado/a cliente *${nombre}*: Su servicio se encuentra suspendido *POR FALTA DE PAGO*. El valor total a pagar es: $${totalStr}. 💳` +
                 (corteStr ? `\n⛔ *Su fecha de corte se realizó el día:* ${corteStr}AM` : '\n');
      } else {
        mensaje =
          `⚠️ Estimado/a cliente*${nombre}*: Ya se encuentra disponible su factura. El valor total a pagar es: $${totalStr}. 💳 ` +
                   (corteStr ? `\n⛔ *Su fecha de corte es el día:* ${corteStr}AM` : '\n');
      }

      return {
        nombre,
        estado,
        total: totalStr,
        facturasPendientes: factNoPag,
        vencimiento: vencFmt || null,
        corte: corteStr || null,
        tieneDeuda: true,
        variosServicios: activos_suspendidos.length,
        variosServiciosValidos: 1,
        serviciosTexto: '', // no hace falta lista
        recomendacion: 'pedir_comprobante',
        mensaje
      };
    }

    // === Caso: varios válidos -> listar SOLO los que requieren acción
    if (validos.length > 1) {
      let serviciosTexto = '';
      for (let i = 0; i < validos.length; i++) {
        const c = validos[i];
        let vencFmt = null, corteStr = null;
        const r = await obtenerVencimientoYCorteParaServicio(c);
        vencFmt = r.vencFmt || null;
        corteStr = r.corteStr || null;
        serviciosTexto += lineaServicioParaLista(c, i, vencFmt, corteStr) + '\n';
      }

      const mensaje =
        `He encontrado ${validos.length} servicio(s) con pago pendiente a su nombre:\n\n` +
        `${serviciosTexto}`;

      return {
        variosServicios: activos_suspendidos.length,
        variosServiciosValidos: validos.length,
        serviciosTexto: serviciosTexto.trim(),
        tieneDeuda: true,
        recomendacion: 'pedir_comprobante', // seguirás pidiendo comprobante tras elegir
        mensaje
      };
    }

    // === Caso: ninguno válido (todos activos sin deuda)
    const cualquiera = activos_suspendidos[0];
    const nombre = cualquiera?.nombre || 'Usuario';
    return {
      nombre,
      estado: 'ACTIVO',
      total: '0.00',
      facturasPendientes: 0,
      vencimiento: null,
      corte: null,
      tieneDeuda: false,
      variosServicios: activos_suspendidos.length,
      variosServiciosValidos: 0,
      serviciosTexto: '',
      recomendacion: 'cerrar',
      mensaje: `🌟 Estimado/a cliente *${nombre}*, su servicio se encuentra activo ✅ y no cuenta con facturas pendientes. ¡Gracias por confiar en nosotros!\n`
    };
  } catch (e) {
    if (DEBUG) {
      return { mensaje: 'Ocurrió un error procesando la consulta.', detalle: { error: e.message } };
    }
    return { mensaje: 'Ocurrió un error procesando la consulta.' };
  }
}

module.exports = {
  consultarClientePorCedula,
  consultarClientePorCedulaRaw,
  obtenerFacturaPorId,
  obtenerFacturasPorCliente,
  crearPromesaPago,
  calcularFechaCorteDesdeVencimientoStr,
  evaluarClientePorCedula
};
