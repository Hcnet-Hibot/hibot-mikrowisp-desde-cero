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
      const msg = 'No existe el cliente con la cédula indicada.';
      return { mensaje: msg, text: msg, respuesta: msg };
    }

    const estadoServicio = (cliente.estado || '').toUpperCase();
    const facturasNoPagadas = cliente.facturacion?.facturas_nopagadas || 0;
    const totalFacturas = cliente.facturacion?.total_facturas || "0.00";

    let mensaje = '';
    if (estadoServicio === 'ACTIVO') {
      if (facturasNoPagadas === 0 || totalFacturas === "0.00") {
        mensaje = "Su servicio se encuentra activo, aún no se le han generado facturas pendientes.";
      } else {
        mensaje = `Ya se le ha generado su factura, puede pagar en cualquier momento. Su valor total es de $${totalFacturas}.`;
      }
    } else if (estadoServicio === 'SUSPENDIDO') {
      mensaje = `Su servicio se encuentra suspendido y debe cancelar lo antes posible. Tiene ${facturasNoPagadas} facturas pendientes, por un total de $${totalFacturas}.`;
    } else if (estadoServicio === 'RETIRADO') {
      mensaje = "Lo sentimos! El cliente se ha retirado de nuestro servicio.";
    } else {
      mensaje = "No se ha podido determinar el estado de su servicio, contacte soporte.";
    }

    // Devuelve el mensaje en varios campos
    return {
      mensaje,
      text: mensaje,
      respuesta: mensaje
    };
  } catch (error) {
    const msg = 'Error al obtener datos del cliente.';
    return { mensaje: msg, text: msg, respuesta: msg };
  }
}

module.exports = { consultarClientePorCedula };
