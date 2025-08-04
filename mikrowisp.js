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
      return { estado: 'error', mensaje: 'No existe el cliente con la cédula indicada.' };
    }

    // Aquí puedes personalizar los datos que Hibot debe mostrar:
    return {
      estado: 'exito',
      datos: {
        nombre: cliente.nombre,
        cedula: cliente.cedula,
        estado: cliente.estado,
        facturas_nopagadas: cliente.facturacion?.facturas_nopagadas || 0,
        total_facturas: cliente.facturacion?.total_facturas || "0.00"
      }
    };
  } catch (error) {
    return { estado: 'error', mensaje: 'Error al obtener datos del cliente.' };
  }
}

module.exports = { consultarClientePorCedula };
