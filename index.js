const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = '8359704945:AAHrSO7pPq7ZWDxgFTSl49Ue4pS06TaAsIU';
const WEBAPP_URL = 'https://alishihovyakub-gif.github.io/bybit-journal-webapp/';

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '👋 Привет! Это твой личный дневник сделок с Bybit.\n\nНажми кнопку ниже чтобы открыть приложение:', {
    reply_markup: {
      inline_keyboard: [[
        {
          text: '📊 Открыть дневник',
          web_app: { url: WEBAPP_URL }
        }
      ]]
    }
  });
});

console.log('🤖 Бот запущен!');