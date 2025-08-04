// sticker.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');

const router = express.Router();

const HIBOT_API_URL = 'https://pdn.api.hibot.us/api_external/message/send'; // Endpoint de envío de mensaje
const APP_ID = process.env.HIBOT_APP_ID || '6839c0a43dbadc3f4f3f33d7';
const APP_SECRET = process.env.HIBOT_APP_SECRET || '96b79ab9-b110-491e-a841-5226d232ac0e';
const CHANNEL_ID = process.env.HIBOT_CHANNEL_ID || '68485ab89cf2cfd9c9aa8332';

// Pega aquí la URL directa del sticker en Google Drive (.webp animado)
const STICKER_URL = process.env.STICKER_URL || 'https://drive.google.com/uc?export=download&id=TU_ID_DE_STICKER';

router.post('/api/enviar-sticker', async (req, res) => {
  const { numero } = req.body; // Formato: 593xxxxxxxxx

  if (!numero) {
    return res.status(400).json({ error: 'Falta el número de WhatsApp' });
  }

  try {
    // Payload ajustado según la documentación oficial de Hibot
    const payload = {
      channel_id: CHANNEL_ID,
      to: numero,
      type: 'image', // Cambia a 'sticker' si Hibot acepta ese tipo
      image: {
        url: STICKER_URL
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-app-id': APP_ID,
      'x-app-secret': APP_SECRET
    };

    const hibotResponse = await axios.post(HIBOT_API_URL, payload, { headers });

    res.json({
      estado: 'exito',
      respuesta: hibotResponse.data
    });
  } catch (error) {
    res.status(500).json({
      estado: 'error',
      mensaje: error.response?.data || error.message
    });
  }
});

module.exports = router;
