require('dotenv').config();
const axios = require('axios');

const appId = process.env.HIBOT_APP_ID;
const appSecret = process.env.HIBOT_APP_SECRET;
const channelId = process.env.HIBOT_CHANNEL_ID;

// Obtiene el token JWT de Hibot
async function obtenerTokenHibot() {
  const url = 'https://pdn.api.hibot.us/api_external/login';
  const res = await axios.post(url, {
    appId,
    appSecret
  });
  return res.data.token;
}

// Envía mensaje o sticker usando Hibot (mediaType: 'STICKER', 'IMAGE', 'TEXT')
async function enviarMensajeHibot({ recipient, media, mediaType, mediaFileName, content }) {
  const token = await obtenerTokenHibot();
  const payload = [
    {
      channelId,
      recipient, // ejemplo: '593986365165'
      ...(media ? { media } : {}),
      ...(mediaType ? { mediaType } : {}),
      ...(mediaFileName ? { mediaFileName } : {}),
      ...(content ? { content } : {})
    }
  ];

  const res = await axios.post('https://pdn.api.hibot.us/api_external/messages', payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return res.data;
}

module.exports = { enviarMensajeHibot };
