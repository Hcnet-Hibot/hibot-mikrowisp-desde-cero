require('dotenv').config();
const express = require('express');
const mikrowisp = require('./mikrowisp');
const hibot = require('./hibot');

const app = express();
app.use(express.json());

app.get('/api/cliente', async (req, res) => {
  const cedula = req.query.cedula;
  if (!cedula) return res.status(400).json({ mensaje: 'Cédula no proporcionada', text: 'Cédula no proporcionada', respuesta: 'Cédula no proporcionada' });
  const datos = await mikrowisp.consultarClientePorCedula(cedula);
  res.json(datos);
});

app.post('/api/cliente', async (req, res) => {
  const { cedula } = req.body;
  if (!cedula) return res.status(400).json({ mensaje: 'Cédula no proporcionada', text: 'Cédula no proporcionada', respuesta: 'Cédula no proporcionada' });
  const datos = await mikrowisp.consultarClientePorCedula(cedula);
  res.json(datos);
});

// Opcionales: Endpoints para enviar imagen y sticker (por si los usas)
app.post('/api/enviar-imagen', async (req, res) => {
  const { numero, url } = req.body;
  if (!numero || !url) return res.status(400).json({ mensaje: 'Falta el número o la URL de la imagen', text: 'Falta el número o la URL de la imagen', respuesta: 'Falta el número o la URL de la imagen' });
  try {
    const resp = await hibot.enviarMensajeHibot({
      recipient: numero,
      media: url,
      mediaType: 'IMAGE',
      mediaFileName: 'imagen.jpg'
    });
    res.json({ estado: 'exito', respuesta: resp });
  } catch (error) {
    res.status(500).json({ mensaje: error.response?.data || error.message, text: error.response?.data || error.message, respuesta: error.response?.data || error.message });
  }
});

app.post('/api/enviar-sticker', async (req, res) => {
  const { numero, url } = req.body;
  if (!numero || !url) return res.status(400).json({ mensaje: 'Falta el número o la URL del sticker', text: 'Falta el número o la URL del sticker', respuesta: 'Falta el número o la URL del sticker' });
  try {
    const resp = await hibot.enviarMensajeHibot({
      recipient: numero,
      media: url,
      mediaType: 'STICKER',
      mediaFileName: 'sticker.webp'
    });
    res.json({ estado: 'exito', respuesta: resp });
  } catch (error) {
    res.status(500).json({ mensaje: error.response?.data || error.message, text: error.response?.data || error.message, respuesta: error.response?.data || error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
