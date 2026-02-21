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

    const trades = response.data.result ? response.data.result.list : [];
    const journal = processTrades(trades);
    res.json({ success: true, journal: journal });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
});

function processTrades(trades) {
  const grouped = {};

  for (let i = 0; i < trades.length; i++) {
    const trade = trades[i];
    if (!grouped[trade.symbol]) {
      grouped[trade.symbol] = [];
    }
    grouped[trade.symbol].push(trade);
  }

  const result = [];
  const symbols = Object.keys(grouped);

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const tradeList = grouped[symbol];

    let buySum = 0;
    let buyCount = 0;
    let sellSum = 0;
    let sellCount = 0;
    let totalQty = 0;
    let totalCommission = 0;
    const times = [];

    for (let j = 0; j < tradeList.length; j++) {
      const t = tradeList[j];
      times.push(parseInt(t.execTime));
      totalCommission += parseFloat(t.execFee);

      if (t.side === 'Buy') {
        buySum += parseFloat(t.execPrice);
        buyCount++;
        totalQty += parseFloat(t.execQty);
      } else {
        sellSum += parseFloat(t.execPrice);
        sellCount++;
      }
    }

    const avgBuy = buyCount > 0 ? buySum / buyCount : 0;
    const avgSell = sellCount > 0 ? sellSum / sellCount : 0;
    const buyAmount = avgBuy * totalQty;
    const sellAmount = avgSell * totalQty;
    const pnl = sellAmount - buyAmount - totalCommission;
    const pnlPercent = buyAmount > 0 ? ((pnl / buyAmount) * 100).toFixed(2) : '0';

    const minTime = Math.min.apply(null, times);
    const maxTime = Math.max.apply(null, times);
    const durationMin = Math.round((maxTime - minTime) / 60000);
    const duration = durationMin < 60
      ? durationMin + ' мин'
      : Math.round(durationMin / 60) + ' ч';

    result.push({
      symbol: symbol,
      entryTime: new Date(minTime).toLocaleString('ru-RU'),
      exitTime: new Date(maxTime).toLocaleString('ru-RU'),
      duration: duration,
      quantity: totalQty.toFixed(4),
      entryPrice: avgBuy.toFixed(4),
      exitPrice: avgSell.toFixed(4),
      amount: buyAmount.toFixed(2),
      commission: totalCommission.toFixed(4),
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPercent
    });
  }

  return result;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('Server running on port ' + PORT);
});
```

Нажми **"Commit changes"** → подожди 2 минуты → проверь в браузере:
```
https://bybit-journal-server-production.up.railway.app/
