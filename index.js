require('dotenv').config();
const express = require('express');
const mikrowisp = require('./mikrowisp');
const hibot = require('./hibot');

const app = express();
app.use(express.json());

// Endpoint principal
app.post('/api/cliente', async (req, res) => {
  const { cedula } = req.body;
  if (!cedula) {
    return res.status(400).json({ mensaje: 'Cédula no proporcionada' });
  }

  const datos = await mikrowisp.consultarClientePorCedula(cedula);

  if (!datos) {
    return res.json({ mensaje: 'No existe el cliente con la cédula indicada.' });
  }

  // Envía el mensaje automático al WhatsApp del cliente
  if (datos.telefono && datos.mensaje) {
    await hibot.enviarMensajeHibot({
      recipient: datos.telefono,
      text: datos.mensaje
    });
  }

  // Devuelve solo un mensaje fijo al webhook de Hibot
  res.json({ mensaje: '¡Listo! Tu información fue enviada por WhatsApp.' });
});

// Puerto
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
