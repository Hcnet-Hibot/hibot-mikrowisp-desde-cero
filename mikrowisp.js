require('dotenv').config();
const axios = require('axios');
const https = require('https');

const apiUrl = process.env.MIKROWISP_API;
const token = process.env.MIKROWISP_TOKEN;

const agent = new https.Agent({ rejectUnauthorized: false });

/**
 * Consulta detalles de cliente por cédula y arma un mensaje personalizado
 */
async function consultarClientePorCedula(cedula) {
  try {
    const url = `${apiUrl}/GetClientsDetails`;
    const body = { token, cedula };
    const response = await axios.post(url, body, { httpsAgent: agent });
    const cliente = response.data.datos ? response.data.datos[0] : null;

    if (!cliente) {
      return { estado: 'error', mensaje: 'No existe el cliente con la cédula indicada.' };
    }

    // Obtén datos clave
    const estadoServicio = cliente.estado;
    const facturasNoPagadas = cliente.facturacion?.facturas_nopagadas || 0;
    const totalFacturas = cliente.facturacion?.total_facturas || "0.00";

    // Lógica de mensajes personalizados
    let mensaje = '';
    if (estadoServicio === 'activo') {
      if (facturasNoPagadas === 0 || totalFacturas === "0.00") {
        mensaje = "Su servicio se encuentra activo, aún no se le han generado facturas pendientes.";
      } else {
        mensaje = `Ya se le ha generado su factura, puede pagar en cualquier momento. Su valor total es de $${totalFacturas}.`;
      }
    } else if (estadoServicio === 'suspendido' || estadoServicio === 'cortado') {
      mensaje = `Su servicio se encuentra suspendido y debe cancelar lo antes posible. Tiene ${facturasNoPagadas} facturas pendientes, por un total de $${totalFacturas}.`;
    } else {
      mensaje = "No se ha podido determinar el estado de su servicio, contacte soporte.";
    }

    // Respuesta estructurada para Hibot
    return {
      estado: 'exito',
      datos: {
        nombre: cliente.nombre,
        cedula: cliente.cedula,
        estado: estadoServicio,
        facturas_nopagadas: facturasNoPagadas,
        total_facturas: totalFacturas
      },
      mensaje // Mensaje listo para mostrar en Hibot
    };
  } catch (error) {
    return { estado: 'error', mensaje: 'Error al obtener datos del cliente.' };
  }
}

module.exports = { consultarClientePorCedula };
