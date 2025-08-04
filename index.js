require('dotenv').config();
const express = require('express');
const mikrowisp = require('./mikrowisp');
const hibot = require('./hibot');

const app = express();
app.use(express.json());

// === Endpoint GET para consulta por cédula ===
app.get('/api/cliente', async (req, res) => {
  const cedula = req.query.cedula;
  if (!cedula) return res.status(400).json({ mensaje: 'Cédula no proporcionada' });
  const datos = await mikrowisp.consultarClientePorCedula(cedula);
  res.json(datos);
});

// === Endpoint POST para consulta por cédula ===
app.post('/api/cliente', async (req, res) => {
  const { cedula } = req.body;
  if (!cedula) return res.status(400).json({ mensaje: 'Cédula no proporcionada' });
  const datos = await mikrowisp.consultarClientePorCedula(cedula);
  res.json(datos);
});

// === Endpoint para enviar imagen ===
app.post('/api/enviar-imagen', async (req, res) => {
  const { numero, url } = req.body;
  if (!numero || !url) return res.status(400).json({ mensaje: 'Falta el número o la URL de la imagen' });
  try {
    const resp = await hibot.enviarMensajeHibot({
      recipient: numero,
      media: url,
      mediaType: 'IMAGE',
      mediaFileName: 'imagen.jpg'
    });
    res.json({ estado: 'exito', respuesta: resp });
  } catch (error) {
    res.status(500).json({ mensaje: error.response?.data || error.message });
  }
});

// === Endpoint para enviar sticker ===
app.post('/api/enviar-sticker', async (req, res) => {
  const { numero, url } = req.body;
  if (!numero || !url) return res.status(400).json({ mensaje: 'Falta el número o la URL del sticker' });
  try {
    const resp = await hibot.enviarMensajeHibot({
      recipient: numero,
      media: url,
      mediaType: 'STICKER',
      mediaFileName: 'sticker.webp'
    });
    res.json({ estado: 'exito', respuesta: resp });
  } catch (error) {
    res.status(500).json({ mensaje: error.response?.data || error.message });
  }
});

// === NUEVO ENDPOINT: Consulta y envía mensaje directo al número recibido ===
app.post('/api/cliente-enviar', async (req, res) => {
  const { cedula, numero } = req.body;
  if (!cedula || !numero) return res.status(400).json({ estado: 'error', mensaje: 'Faltan datos requeridos (cedula y numero)' });

  const datos = await mikrowisp.consultarClientePorCedula(cedula);

  // Enviar el mensaje al número recibido
  await hibot.enviarMensajeHibot({
    recipient: numero,
    content: datos.mensaje
  });

  // Responder fijo a Hibot
  res.json({ estado: 'exito', mensaje: '¡Listo! Consulta enviada a tu WhatsApp.' });
});

// Puerto
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
