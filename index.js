const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// Функция подписи запроса к Bybit
function generateSignature(apiSecret, timestamp, apiKey, queryString) {
  const paramStr = timestamp + apiKey + '5000' + queryString;
  return crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
}

// Маршрут для получения сделок
app.post('/api/trades', async (req, res) => {
  const { apiKey, apiSecret } = req.body;

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'API ключи не переданы' });
  }

  try {
    const timestamp = Date.now().toString();
    const queryString = 'category=spot&limit=50';
    const sign = generateSignature(apiSecret, timestamp, apiKey, queryString);

    const response = await axios.get(
      `https://api.bybit.com/v5/execution/list?${queryString}`,
      {
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': sign,
          'X-BAPI-RECV-WINDOW': '5000',
        },
      }
    );

    const trades = response.data.result?.list || [];

    // Группируем сделки по паре и считаем прибыль
    const journal = processTrades(trades);
    res.json({ success: true, journal });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Ошибка получения данных с Bybit' });
  }
});

function processTrades(trades) {
  const grouped = {};

  trades.forEach(trade => {
    const symbol = trade.symbol;
    if (!grouped[symbol]) grouped[symbol] = [];
    grouped[symbol].push(trade);
  });

  const result = [];

  Object.entries(grouped).forEach(([symbol, tradeList]) => {
    const buys = tradeList.filter(t => t.side === 'Buy');
    const sells = tradeList.filter(t => t.side === 'Sell');

    const avgBuyPrice = buys.length
      ? buys.reduce((s, t) => s + parseFloat(t.execPrice), 0) / buys.length
      : 0;

    const avgSellPrice = sells.length
      ? sells.reduce((s, t) => s + parseFloat(t.execPrice), 0) / sells.length
      : 0;

    const totalQty = buys.reduce((s, t) => s + parseFloat(t.execQty), 0);
    const totalCommission = tradeList.reduce((s, t) => s + parseFloat(t.execFee), 0);
    const buyAmount = avgBuyPrice * totalQty;
    const sellAmount = avgSellPrice * totalQty;
    const pnl = sellAmount - buyAmount - totalCommission;
    const pnlPercent = buyAmount > 0 ? ((pnl / buyAmount) * 100).toFixed(2) : 0;

    const times = tradeList.map(t => parseInt(t.execTime));
    const entryTime = new Date(Math.min(...times)).toLocaleString('ru-RU');
    const exitTime = new Date(Math.max(...times)).toLocaleString('ru-RU');
    const durationMs = Math.max(...times) - Math.min(...times);
    const durationMin = Math.round(durationMs / 60000);

    result.push({
      symbol,
      entryTime,
      exitTime,
      duration: durationMin < 60
        ? `${durationMin} мин`
        : `${Math.round(durationMin / 60)} ч`,
      quantity: totalQty.toFixed(4),
      entryPrice: avgBuyPrice.toFixed(4),
      exitPrice: avgSellPrice.toFixed(4),
      amount: buyAmount.toFixed(2),
      commission: totalCommission.toFixed(4),
      pnl: pnl.toFixed(2),
      pnlPercent,
    });
  });

  return result;
}

app.listen(3000, () => {
  console.log('✅ Сервер запущен на порту 3000');
});