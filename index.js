const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/trades', async (req, res) => {
  const { apiKey, apiSecret } = req.body;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'Нет ключей' });
  }
  try {
    const timestamp = Date.now().toString();
    const queryString = 'category=spot&limit=50';
    const paramStr = timestamp + apiKey + '5000' + queryString;
    const sign = crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');

    const response = await axios.get(
      'https://api.bybit.com/v5/execution/list?' + queryString,
      {
        headers: {
          'X-BAPI-API-KEY': apiKey,
          'X-BAPI-TIMESTAMP': timestamp,
          'X-BAPI-SIGN': sign,
          'X-BAPI-RECV-WINDOW': '5000'
        }
      }
    );

    const trades = response.data.result?.list || [];
    const journal = processTrades(trades);
    res.json({ success: true, journal });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

function processTrades(trades) {
  const grouped = {};
  trades.forEach(function(trade) {
    if (!grouped[trade.symbol]) grouped[trade.symbol] = [];
    grouped[trade.symbol].push(trade);
  });

  const result = [];
  Object.keys(grouped).forEach(function(symbol) {
    const tradeList = grouped[symbol];
    const buys = tradeList.filter(function(t) { return t.side === 'Buy'; });
    const sells = tradeList.filter(function(t) { return t.side === 'Sell'; });

    const avgBuyPrice = buys.length
      ? buys.reduce(function(s, t) { return s + parseFloat(t.execPrice); }, 0) / buys.length
      : 0;
    const avgSellPrice = sells.length
      ? sells.reduce(function(s, t) { return s + parseFloat(t.execPrice); }, 0) / sells.length
      : 0;

    const totalQty = buys.reduce(function(s, t) { return s + parseFloat(t.execQty); }, 0);
    const totalCommission = tradeList.reduce(function(s, t) { return s + parseFloat(t.execFee); }, 0);
    const buyAmount = avgBuyPrice * totalQty;
    const sellAmount = avgSellPrice * totalQty;
    const pnl = sellAmount - buyAmount - totalCommission;
    const pnlPercent = buyAmount > 0 ? ((pnl / buyAmount) * 100).toFixed(2) : 0;

    const times = tradeList.map(function(t) { return parseInt(t.execTime); });
    const minTime = Math.min.apply(null, times);
    const maxTime = Math.max.apply(null, times);
    const durationMin = Math.round((maxTime - minTime) / 60000);

    result.push({
      symbol: symbol,
      entryTime: new Date(minTime).toLocaleString('ru-RU'),
      exitTime: new Date(maxTime).toLocaleString('ru-RU'),
      duration: durationMin < 60 ? durationMin + ' мин' : Math.round(durationMin / 60) + ' ч',
      quantity: totalQty.toFixed(4),
      entryPrice: avgBuyPrice.toFixed(4),
      exitPrice: avgSellPrice.toFixed(4),
      amount: buyAmount.toFixed(2),
      commission: totalCommission.toFixed(4),
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPercent
    });
  });
  return result;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
