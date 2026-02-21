const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.get('/', function(req, res) {
  res.json({ status: 'ok' });
});
app.post('/api/trades', async function(req, res) {
  const apiKey = req.body.apiKey;
  const apiSecret = req.body.apiSecret;
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ error: 'Нет ключей' });
  }
  try {
    const timestamp = Date.now().toString();
    const queryString = 'category=spot&limit=50';
    const paramStr = timestamp + apiKey + '5000' + queryString;
    const sign = crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
    const response = await axios.get('https://api.bybit.com/v5/execution/list?' + queryString, {
      headers: {
        'X-BAPI-API-KEY': apiKey,
        'X-BAPI-TIMESTAMP': timestamp,
        'X-BAPI-SIGN': sign,
        'X-BAPI-RECV-WINDOW': '5000'
      }
    });
    const trades = response.data.result ? response.data.result.list : [];
    res.json({ success: true, journal: processTrades(trades) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
function processTrades(trades) {
  const grouped = {};
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    if (!grouped[t.symbol]) grouped[t.symbol] = [];
    grouped[t.symbol].push(t);
  }
  const result = [];
  const symbols = Object.keys(grouped);
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const list = grouped[symbol];
    let buySum = 0, buyCount = 0, sellSum = 0, sellCount = 0, qty = 0, fee = 0;
    const times = [];
    for (let j = 0; j < list.length; j++) {
      const t = list[j];
      times.push(parseInt(t.execTime));
      fee += parseFloat(t.execFee);
      if (t.side === 'Buy') {
        buySum += parseFloat(t.execPrice);
        buyCount++;
        qty += parseFloat(t.execQty);
      } else {
        sellSum += parseFloat(t.execPrice);
        sellCount++;
      }
    }
    const avgBuy = buyCount > 0 ? buySum / buyCount : 0;
    const avgSell = sellCount > 0 ? sellSum / sellCount : 0;
    const buyAmt = avgBuy * qty;
    const sellAmt = avgSell * qty;
    const pnl = sellAmt - buyAmt - fee;
    const pnlPct = buyAmt > 0 ? ((pnl / buyAmt) * 100).toFixed(2) : '0';
    const minT = Math.min.apply(null, times);
    const maxT = Math.max.apply(null, times);
    const dur = Math.round((maxT - minT) / 60000);
    result.push({
      symbol: symbol,
      entryTime: new Date(minT).toLocaleString('ru-RU'),
      exitTime: new Date(maxT).toLocaleString('ru-RU'),
      duration: dur < 60 ? dur + ' мин' : Math.round(dur / 60) + ' ч',
      quantity: qty.toFixed(4),
      entryPrice: avgBuy.toFixed(4),
      exitPrice: avgSell.toFixed(4),
      amount: buyAmt.toFixed(2),
      commission: fee.toFixed(4),
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPct
    });
  }
  return result;
}
const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
