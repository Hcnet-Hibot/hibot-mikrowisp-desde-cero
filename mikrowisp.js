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

    if (!cliente) return { mensaje: 'No existe el cliente con la cédula indicada.' };

    const estadoServicio = (cliente.estado || '').toUpperCase();
    const facturasNoPagadas = cliente.facturacion?.facturas_nopagadas || 0;
    const totalFacturas = cliente.facturacion?.total_facturas || "0.00";
    const nombreCompleto = cliente.nombre || 'Usuario';

    let mensajeFinal = '';
    if (estadoServicio === 'RETIRADO') {
      mensajeFinal = "Lo sentimos! El cliente se ha retirado de nuestro servicio.";
    } else {
      let mensajeEstado = '';
      if (estadoServicio === 'ACTIVO') {
        if (facturasNoPagadas === 0 || totalFacturas === "0.00") {
          mensajeEstado = "su servicio se encuentra activo, aún no se le han generado facturas pendientes.";
        } else {
          mensajeEstado = `ya se le ha generado su factura, puede pagar en cualquier momento. Su valor total es de $${totalFacturas}.`;
        }
      } else if (estadoServicio === 'SUSPENDIDO') {
        mensajeEstado = `su servicio se encuentra suspendido y debe cancelar lo antes posible. Tiene ${facturasNoPagadas} facturas pendientes, por un total de $${totalFacturas}.`;
      } else {
        mensajeEstado = "no se ha podido determinar el estado de su servicio, contacte soporte.";
      }
      mensajeFinal = `Estimado/a ${nombreCompleto}, ${mensajeEstado}`;
    }

    return { mensaje: mensajeFinal };
  } catch (error) {
    return { mensaje: 'Ocurrió un error procesando la consulta.' };
  }
}

module.exports = { consultarClientePorCedula };
