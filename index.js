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

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'running', 
    bot: 'Binance Trading Bot',
    symbol: CONFIG.symbol,
    strategy: 'MA Crossover'
  });
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