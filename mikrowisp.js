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

    // Filtramos todos los clientes asociados a esa cédula
    // Separar por estado
    const activos_o_suspendidos = clientes.filter(c =>
      c.estado && (c.estado.toUpperCase() === "ACTIVO" || c.estado.toUpperCase() === "SUSPENDIDO")
    );
    const retirados = clientes.filter(c =>
      c.estado && c.estado.toUpperCase() === "RETIRADO"
    );

    // Si NO hay ningún cliente ACTIVO ni SUSPENDIDO, y hay algún RETIRADO, mostrar "No existe..."
    // O si no hay absolutamente ningún cliente
    if ((activos_o_suspendidos.length === 0 && retirados.length > 0) || clientes.length === 0) {
      return {
        mensaje:
          "❗No existe un cliente registrado con esa cédula Por favor, verifique sus datos. Si cree que esto es un error, por favor contáctenos."
      };
    }

    // Si hay uno o más activos/suspendidos
    if (activos_o_suspendidos.length > 0) {
      let mensajeTotal = `Estimado/a cliente ud actualmente cuenta con ${activos_o_suspendidos.length} línea(s) activas con sus datos:\n`;

      // Para cada línea, genera el mensaje como lo tienes, SIN el 'Estimado/a'
      activos_o_suspendidos.forEach(cliente => {
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
