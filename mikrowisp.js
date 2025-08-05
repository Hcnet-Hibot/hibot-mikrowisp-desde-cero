require('dotenv').config();
const axios = require('axios');
const https = require('https');

const apiUrl = process.env.MIKROWISP_API;
const token = process.env.MIKROWISP_TOKEN;
const agent = new https.Agent({ rejectUnauthorized: false });

async function consultarClientePorCedula(cedula) {
  try {
    const url = `${apiUrl}/GetClientsDetails`;
    const body = { token, cedula };
    const response = await axios.post(url, body, { httpsAgent: agent });
    const clientes = response.data.datos || [];

    // Filtra activos y suspendidos
    const activos = clientes.filter(c =>
      c.estado && c.estado.toUpperCase() === "ACTIVO"
    );
    const suspendidos = clientes.filter(c =>
      c.estado && c.estado.toUpperCase() === "SUSPENDIDO"
    );
    const activos_suspendidos = [...activos, ...suspendidos];
    const retirados = clientes.filter(c =>
      c.estado && c.estado.toUpperCase() === "RETIRADO"
    );

    // Si NO hay ningún cliente ACTIVO ni SUSPENDIDO, y hay algún RETIRADO, mostrar "No existe..."
    // O si no hay absolutamente ningún cliente
    if ((activos_suspendidos.length === 0 && retirados.length > 0) || clientes.length === 0) {
      return {
        mensaje:
          "❗No existe un cliente registrado con esa cédula Por favor, verifique sus datos. Si cree que esto es un error, por favor contáctenos."
      };
    }

    // Si sólo hay una línea activa o sólo una suspendida (el resto, si hay, son retirados)
    if (activos_suspendidos.length === 1) {
      const cliente = activos_suspendidos[0];
      const estadoServicio = (cliente.estado || '').toUpperCase();
      const facturasNoPagadas = cliente.facturacion?.facturas_nopagadas || 0;
      const totalFacturas = cliente.facturacion?.total_facturas || "0.00";
      const nombreCompleto = cliente.nombre || 'Usuario';

      let mensajeFinal = '';
      if (estadoServicio === 'SUSPENDIDO') {
        mensajeFinal =
          `🚫 ${nombreCompleto}, su servicio se encuentra suspendido. Debe cancelar lo antes posible. Tiene ${facturasNoPagadas} facturas pendientes, por un total de $${totalFacturas}. Si ya pagó, por favor, espere la reconexión o contacte soporte.`;
      } else if (estadoServicio === 'ACTIVO') {
        if (facturasNoPagadas === 0 || totalFacturas === "0.00") {
          mensajeFinal =
            `🌟 ${nombreCompleto}, su servicio está activo ✅ y no tiene facturas pendientes. ¡Gracias por confiar en nosotros!`;
        } else {
          mensajeFinal =
            `⚠️ ${nombreCompleto}, ya se le ha generado su factura. Puede pagar en cualquier momento. Su valor total es de $${totalFacturas}. 💳`;
        }
      }
      return { mensaje: mensajeFinal };
    }

    // Si hay dos o más líneas activas/suspendidas, mostrar el resumen general
    if (activos_suspendidos.length > 1) {
      let mensajeTotal = `Estimado/a cliente ud actualmente cuenta con ${activos_suspendidos.length} línea(s) activas con sus datos:\n`;
      activos_suspendidos.forEach(cliente => {
        const estadoServicio = (cliente.estado || '').toUpperCase();
        const facturasNoPagadas = cliente.facturacion?.facturas_nopagadas || 0;
        const totalFacturas = cliente.facturacion?.total_facturas || "0.00";
        const nombreCompleto = cliente.nombre || 'Usuario';

        let mensajeFinal = '';
        if (estadoServicio === 'SUSPENDIDO') {
          mensajeFinal =
            `🚫 ${nombreCompleto}, su servicio se encuentra suspendido. Debe cancelar lo antes posible. Tiene ${facturasNoPagadas} facturas pendientes, por un total de $${totalFacturas}. Si ya pagó, por favor, espere la reconexión o contacte soporte.`;
        } else if (estadoServicio === 'ACTIVO') {
          if (facturasNoPagadas === 0 || totalFacturas === "0.00") {
            mensajeFinal =
              `🌟 ${nombreCompleto}, su servicio está activo ✅ y no tiene facturas pendientes. ¡Gracias por confiar en nosotros!`;
          } else {
            mensajeFinal =
              `⚠️ ${nombreCompleto}, ya se le ha generado su factura. Puede pagar en cualquier momento. Su valor total es de $${totalFacturas}. 💳`;
          }
        }
        mensajeTotal += mensajeFinal + "\n\n";
      });

      return { mensaje: mensajeTotal.trim() };
    }

    // Si llega aquí, entonces no hay activos/suspendidos ni retirados (raro, pero cubrimos)
    return {
      mensaje:
        "❗No existe un cliente registrado con esa cédula Por favor, verifique sus datos. Si cree que esto es un error, por favor contáctenos."
    };
  } catch (error) {
    return { mensaje: 'Ocurrió un error procesando la consulta.' };
  }
}

module.exports = { consultarClientePorCedula };
