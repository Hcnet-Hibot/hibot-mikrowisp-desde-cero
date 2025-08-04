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

// Enviar imagen por Hibot (funciona para JPG, PNG, GIF, etc)
app.post('/api/enviar-imagen', async (req, res) => {
  const { numero, url } = req.body;
  if (!numero || !url) return res.status(400).json({ error: 'Falta el número o la URL de la imagen' });
  try {
    const resp = await hibot.enviarMensajeHibot({
      recipient: numero,
      media: url,
      mediaType: 'IMAGE',
      mediaFileName: 'imagen.jpg'
    });
    res.json({ estado: 'exito', respuesta: resp });
  } catch (error) {
    res.status(500).json({ estado: 'error', mensaje: error.response?.data || error.message });
  }
});

// Enviar sticker por Hibot (.webp, cuando Hibot lo acepte)
app.post('/api/enviar-sticker', async (req, res) => {
  const { numero, url } = req.body;
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
