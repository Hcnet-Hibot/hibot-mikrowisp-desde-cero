require('dotenv').config();
const axios = require('axios');

const appId = process.env.HIBOT_APP_ID;
const appSecret = process.env.HIBOT_APP_SECRET;
const channelId = process.env.HIBOT_CHANNEL_ID;

// Cache sencillo del token
let _cachedToken = null;
let _cachedTokenExp = 0; // epoch ms
const DEFAULT_TTL_S = Number(process.env.HIBOT_TOKEN_TTL_S || 600); // 10 min

async function obtenerTokenHibot() {
  const now = Date.now();
  if (_cachedToken && now < _cachedTokenExp) return _cachedToken;

  const url = 'https://pdn.api.hibot.us/api_external/login';
  const { data } = await axios.post(url, { appId, appSecret });
  _cachedToken = data.token;
  _cachedTokenExp = Date.now() + DEFAULT_TTL_S * 1000;
  return _cachedToken;
}

async function enviarMensajeHibot({ recipient, media, mediaType, mediaFileName, content }) {
  const token = await obtenerTokenHibot();
  const payload = [{
    channelId,
    recipient, // '593xxxxxxxxxx'
    ...(media ? { media } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(mediaFileName ? { mediaFileName } : {}),
    ...(content ? { content } : {})
  }];

  const { data } = await axios.post('https://pdn.api.hibot.us/api_external/messages', payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  });
  return data;
}

// Azúcar para enviar texto puro
async function enviarTexto({ recipient, texto }) {
  return enviarMensajeHibot({ recipient, content: texto });
}

module.exports = { enviarMensajeHibot, enviarTexto };
