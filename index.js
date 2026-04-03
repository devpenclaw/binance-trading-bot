require('dotenv').config();
const express = require('express');
const Binance = require('binance-api-node').default;

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Binance client (public for reading, private for trading)
const binance = Binance({
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_SECRET_KEY,
});

// Configuration
const CONFIG = {
  symbol: process.env.SYMBOL || 'BTCUSDT',
  interval: process.env.INTERVAL || '1h',
  fastMA: 7,
  slowMA: 25,
  quantity: parseFloat(process.env.QUANTITY || '0.001'),
};

// In-memory storage for signals
let lastSignal = null;
let priceData = [];

// Fetch klines (candlestick) data
async function getKlines(symbol, interval, limit = 100) {
  try {
    const klines = await binance.klines({
      symbol,
      interval,
      limit,
    });
    return klines.map(k => parseFloat(k.close));
  } catch (error) {
    console.error('Error fetching klines:', error.message);
    return [];
  }
}

// Calculate Simple Moving Average
function calculateSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Generate trading signal
function generateSignal(prices) {
  if (prices.length < CONFIG.slowMA) return null;

  const fastMA = calculateSMA(prices, CONFIG.fastMA);
  const slowMA = calculateSMA(prices, CONFIG.slowMA);

  if (!fastMA || !slowMA) return null;

  const currentPrice = prices[prices.length - 1];

  // Simple crossover strategy
  const prevPrices = prices.slice(0, -1);
  const prevFastMA = calculateSMA(prevPrices, CONFIG.fastMA);
  const prevSlowMA = calculateSMA(prevPrices, CONFIG.slowMA);

  let signal = null;

  if (prevFastMA <= prevSlowMA && fastMA > slowMA) {
    signal = 'BUY';
  } else if (prevFastMA >= prevSlowMA && fastMA < slowMA) {
    signal = 'SELL';
  }

  return {
    signal,
    price: currentPrice,
    fastMA: fastMA.toFixed(2),
    slowMA: slowMA.toFixed(2),
    timestamp: new Date().toISOString(),
  };
}

// Update signals
async function updateSignals() {
  const prices = await getKlines(CONFIG.symbol, CONFIG.interval, CONFIG.slowMA + 10);
  if (prices.length > 0) {
    priceData = prices;
    lastSignal = generateSignal(prices);
  }
}

// API Routes

// Health check - HTML UI
app.get('/', async (req, res) => {
  await updateSignals();
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Binance Trading Bot</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; background: #0d1117; color: #c9d1d9; }
    h1 { color: #58a6ff; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 20px; margin: 20px 0; }
    .signal { font-size: 24px; font-weight: bold; padding: 10px; border-radius: 4px; text-align: center; }
    .signal.buy { background: #238636; color: #fff; }
    .signal.sell { background: #da3633; color: #fff; }
    .signal.hold { background: #30363d; color: #8b949e; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #30363d; }
    .row:last-child { border-bottom: none; }
    .label { color: #8b949e; }
    .value { color: #58a6ff; font-weight: bold; }
    a { color: #58a6ff; }
    .error { background: #3d1d1d; border-color: #f85149; }
  </style>
</head>
<body>
  <h1>🤖 Binance Trading Bot</h1>
  <div class="card">
    <div class="row"><span class="label">Status</span><span class="value">Running</span></div>
    <div class="row"><span class="label">Symbol</span><span class="value">${CONFIG.symbol}</span></div>
    <div class="row"><span class="label">Strategy</span><span class="value">MA Crossover (${CONFIG.fastMA}/${CONFIG.slowMA})</span></div>
    <div class="row"><span class="label">Timeframe</span><span class="value">${CONFIG.interval}</span></div>
  </div>
  ${lastSignal ? `
  <div class="card">
    <div class="row"><span class="label">Price</span><span class="value">$${parseFloat(lastSignal.price).toLocaleString()}</span></div>
    <div class="row"><span class="label">Fast MA (${CONFIG.fastMA})</span><span class="value">$${lastSignal.fastMA}</span></div>
    <div class="row"><span class="label">Slow MA (${CONFIG.slowMA})</span><span class="value">$${lastSignal.slowMA}</span></div>
    <div class="row"><span class="label">Signal</span><span class="value">
      <div class="signal ${lastSignal.signal ? lastSignal.signal.toLowerCase() : 'hold'}">${lastSignal.signal || 'HOLD'}</div>
    </span></div>
    <div class="row"><span class="label">Updated</span><span class="value">${new Date(lastSignal.timestamp).toLocaleString()}</span></div>
  </div>
  ` : '<div class="card error"><p>⚠️ Unable to fetch market data. Check API access.</p></div>'}
  <p><a href="/api/signals">View JSON API</a> | <a href="/api/price/${CONFIG.symbol}">Price</a></p>
</body>
</html>`;
  
  res.send(html);
});

// Get current price
app.get('/api/price/:symbol?', async (req, res) => {
  try {
    const symbol = req.params.symbol || CONFIG.symbol;
    const price = await binance.prices({ symbol });
    res.json({ symbol, price: price[symbol] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trading signals
app.get('/api/signals', async (req, res) => {
  await updateSignals();
  res.json({
    symbol: CONFIG.symbol,
    config: {
      fastMA: CONFIG.fastMA,
      slowMA: CONFIG.slowMA,
    },
    signal: lastSignal,
  });
});

// Execute trade (requires API keys)
app.post('/api/trade', async (req, res) => {
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_SECRET_KEY) {
    return res.status(401).json({ error: 'API keys not configured' });
  }

  if (!lastSignal || !lastSignal.signal) {
    return res.status(400).json({ error: 'No trading signal available' });
  }

  try {
    const { signal } = lastSignal;
    const side = signal === 'BUY' ? 'BUY' : 'SELL';
    
    const order = await binance.order({
      symbol: CONFIG.symbol,
      side,
      quantity: CONFIG.quantity,
      type: 'MARKET',
    });

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Trading bot running on port ${PORT}`);
  console.log(`📈 Monitoring ${CONFIG.symbol} with ${CONFIG.fastMA}/${CONFIG.slowMA} MA crossover`);
  
  // Initial update
  updateSignals();
  
  // Update every 5 minutes
  setInterval(updateSignals, 5 * 60 * 1000);
});

module.exports = app;