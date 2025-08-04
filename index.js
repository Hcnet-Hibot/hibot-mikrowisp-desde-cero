require('dotenv').config();
const express = require('express');
const mikrowisp = require('./mikrowisp');
const hibot = require('./hibot');

const app = express();
app.use(express.json());

// Endpoint principal para integración Hibot
app.post('/api/cliente', async (req, res) => {
  const { cedula, numero } = req.body;
  if (!cedula || !numero) {
    return res.status(400).json({ mensaje: 'Faltan datos requeridos (cedula y numero).' });
  }

  const datos = await mikrowisp.consultarClientePorCedula(cedula);

  let mensaje;
  if (!datos) {
    mensaje = 'No existe el cliente con la cédula indicada.';
  } else {
    mensaje = datos.mensaje;
  }

  // Enviamos el mensaje al número recibido (del usuario que escribe en WhatsApp)
  await hibot.enviarMensajeHibot({
    recipient: numero,
    text: mensaje
  });

  // Devolvemos respuesta fija para Hibot
  res.json({ mensaje: '¡Listo! Consulta enviada a tu WhatsApp.' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
