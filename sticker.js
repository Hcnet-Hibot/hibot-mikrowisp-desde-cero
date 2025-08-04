require('dotenv').config();
const express = require('express');
const axios = require('axios');
const router = express.Router();

const HIBOT_API_URL = 'https://pdn.api.hibot.us/api_external/message/send';
const APP_ID = process.env.HIBOT_APP_ID;
const APP_SECRET = process.env.HIBOT_APP_SECRET;
const CHANNEL_ID = process.env.HIBOT_CHANNEL_ID;
const STICKER_URL = process.env.STICKER_URL;

router.post('/api/enviar-sticker', async (req, res) => {
  const { numero } = req.body;
  if (!numero) {
    return res.status(400).json({ error: 'Falta el número de WhatsApp' });
  }

  try {
    const payload = {
      channel_id: CHANNEL_ID,
      to: numero,
      type: 'image',
      image: {
        url: STICKER_URL
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'x-app-id': APP_ID,
      'x-app-secret': APP_SECRET
    };

    // Debug: muestra en consola las variables que llegan
    console.log("APP_ID:", APP_ID);
    console.log("APP_SECRET:", APP_SECRET);
    console.log("CHANNEL_ID:", CHANNEL_ID);

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
