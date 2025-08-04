// index.js
require('dotenv').config();
const express = require('express');
const mikrowisp = require('./mikrowisp');

const app = express();
app.use(express.json());

// Endpoint para consultar por cédula (GET)
app.get('/api/cliente', async (req, res) => {
  const cedula = req.query.cedula;
  if (!cedula) {
    return res.status(400).json({ error: 'Cédula no proporcionada' });
  }
  try {
    const datos = await mikrowisp.consultarClientePorCedula(cedula);
    res.json(datos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener datos del cliente.' });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
