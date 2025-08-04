require('dotenv').config();
const axios = require('axios');

const API_URL = 'https://api.hibot.us/message/v1/send-message'; // O la que corresponda a tu cuenta

async function enviarMensajeHibot({ recipient, text }) {
  try {
    const res = await axios.post(
      API_URL,
      {
        recipient, // número destino
        message: text, // mensaje a enviar
        channelId: process.env.HIBOT_CHANNEL_ID // tu canal Hibot
      },
      {
        headers: {
          'App-Id': process.env.HIBOT_APP_ID,
          'App-Secret': process.env.HIBOT_APP_SECRET,
          'Content-Type': 'application/json'
        }
      }
    );
    return res.data;
  } catch (error) {
    return { error: error.message };
  }
}

module.exports = { enviarMensajeHibot };
