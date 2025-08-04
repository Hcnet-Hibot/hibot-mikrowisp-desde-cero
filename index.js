require('dotenv').config();
const express = require('express');
const mikrowisp = require('./mikrowisp');
const hibot = require('./hibot');

const app = express();
app.use(express.json());

// Consulta cliente por cédula (GET y POST)
app.get('/api/cliente', async (req, res) => {
  const cedula = req.query.cedula;
  if (!cedula) return res.status(400).json({ error: 'Cédula no proporcionada' });
  const datos = await mikrowisp.consultarClientePorCedula(cedula);
  res.json(datos);
});

app.post('/api/cliente', async (req, res) => {
  const { cedula } = req.body;
  if (!cedula) return res.status(400).json({ error: 'Cédula no proporcionada' });
  const datos = await mikrowisp.consultarClientePorCedula(cedula);
  res.json(datos);
});

// Endpoint para enviar sticker (ejemplo usando URL directa)
app.post('/api/enviar-sticker', async (req, res) => {
  const { numero, url } = req.body; // numero en formato internacional, url del .webp en Google Drive
  if (!numero || !url) return res.status(400).json({ error: 'Falta el número o la URL del sticker' });
  try {
    const resp = await hibot.enviarMensajeHibot({
      recipient: numero,
      media: url,
      mediaType: 'STICKER',
      mediaFileName: 'sticker.webp'
    });
    res.json({ estado: 'exito', respuesta: resp });
  } catch (error) {
    res.status(500).json({ estado: 'error', mensaje: error.response?.data || error.message });
  }
});

// Endpoint para enviar texto (ejemplo)
app.post('/api/enviar-texto', async (req, res) => {
  const { numero, content } = req.body;
  if (!numero || !content) return res.status(400).json({ error: 'Faltan datos' });
  try {
    const resp = await hibot.enviarMensajeHibot({
      recipient: numero,
      content,
      mediaType: 'TEXT'
    });
    res.json({ estado: 'exito', respuesta: resp });
  } catch (error) {
    res.status(500).json({ estado: 'error', mensaje: error.response?.data || error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
