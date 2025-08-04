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
    const cliente = response.data.datos ? response.data.datos[0] : null;

    if (!cliente) {
      return {
        mensaje: "❗ No existe un cliente registrado con esa cédula. Por favor, revise sus datos o contacte a soporte."
      };
    }

    const estadoServicio = (cliente.estado || '').toUpperCase();
    const facturasNoPagadas = cliente.facturacion?.facturas_nopagadas || 0;
    const totalFacturas = cliente.facturacion?.total_facturas || "0.00";
    const nombreCompleto = cliente.nombre || 'Usuario';

    let mensajeFinal = '';

    if (estadoServicio === 'RETIRADO') {
      mensajeFinal = "😞 Lo sentimos, el cliente se ha retirado de nuestro servicio. Si cree que esto es un error, por favor contáctenos.";
    } else if (estadoServicio === 'SUSPENDIDO') {
      mensajeFinal = `🚫 Estimado/a ${nombreCompleto}, su servicio se encuentra suspendido. Debe cancelar lo antes posible. Tiene ${facturasNoPagadas} facturas pendientes, por un total de $${totalFacturas}. Si ya pagó, por favor, espere la reconexión o contacte soporte.`;
    } else if (estadoServicio === 'ACTIVO') {
      if (facturasNoPagadas === 0 || totalFacturas === "0.00") {
        mensajeFinal = `🌟 Estimado/a ${nombreCompleto}, su servicio está activo ✅ y no tiene facturas pendientes. ¡Gracias por confiar en nosotros!`;
      } else {
        mensajeFinal = `⚠️ Estimado/a ${nombreCompleto}, ya se le ha generado su factura. Puede pagar en cualquier momento. Su valor total es de $${totalFacturas}. 💳`;
      }
    } else {
      mensajeFinal = "❗ No se ha podido determinar el estado de su servicio. Por favor, contacte a soporte.";
    }

    return { mensaje: mensajeFinal };
  } catch (error) {
    return { mensaje: 'Ocurrió un error procesando la consulta.' };
  }
}

module.exports = { consultarClientePorCedula };
