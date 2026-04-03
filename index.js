require('dotenv').config();
const express = require('express');
const Binance = require('binance-api-node').default;

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Binance client
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

let lastSignal = null;
let priceData = [];

async function getKlines(symbol, interval, limit = 100) {
  try {
    const klines = await binance.klines({ symbol, interval, limit });
    return klines.map(k => parseFloat(k.close));
  } catch (error) {
    console.error('Error fetching klines:', error.message);
    return [];
  }
}

function calculateSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function generateSignal(prices) {
  if (prices.length < CONFIG.slowMA) return null;

  const fastMA = calculateSMA(prices, CONFIG.fastMA);
  const slowMA = calculateSMA(prices, CONFIG.slowMA);
  if (!fastMA || !slowMA) return null;

  const currentPrice = prices[prices.length - 1];
  const prevPrices = prices.slice(0, -1);
  const prevFastMA = calculateSMA(prevPrices, CONFIG.fastMA);
  const prevSlowMA = calculateSMA(prevPrices, CONFIG.slowMA);

  let signal = null;
  if (prevFastMA <= prevSlowMA && fastMA > slowMA) signal = 'BUY';
  else if (prevFastMA >= prevSlowMA && fastMA < slowMA) signal = 'SELL';

  return {
    signal,
    price: currentPrice,
    fastMA: fastMA.toFixed(2),
    slowMA: slowMA.toFixed(2),
    timestamp: new Date().toISOString(),
  };
}

async function updateSignals() {
  const prices = await getKlines(CONFIG.symbol, CONFIG.interval, CONFIG.slowMA + 10);
  if (prices.length > 0) {
    priceData = prices;
    lastSignal = generateSignal(prices);
  }
}

// Health check - Industrial/Brutalist UI
app.get('/', async (req, res) => {
  await updateSignals();

  const signalColor = lastSignal?.signal === 'BUY' ? '#00ff88' : lastSignal?.signal === 'SELL' ? '#ff3366' : '#ffaa00';
  const signalGlow = lastSignal?.signal ? `0 0 30px ${signalColor}40` : 'none';
  
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ BTC TRADING BOT</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Space+Grotesk:wght@400;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #050505;
      --bg-secondary: #0a0a0a;
      --bg-card: #111111;
      --border: #222222;
      --text-primary: #f0f0f0;
      --text-secondary: #666666;
      --accent-buy: #00ff88;
      --accent-sell: #ff3366;
      --accent-hold: #ffaa00;
      --accent-blue: #0066ff;
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'JetBrains Mono', monospace;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      background-image: 
        linear-gradient(rgba(0,102,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,102,255,0.03) 1px, transparent 1px);
      background-size: 50px 50px;
    }

    .container {
      max-width: 520px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 32px;
      position: relative;
    }

    .header::before {
      content: '';
      position: absolute;
      top: -20px;
      left: 50%;
      transform: translateX(-50%);
      width: 60px;
      height: 3px;
      background: var(--accent-blue);
    }

    .logo {
      font-size: 14px;
      letter-spacing: 4px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .title {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -1px;
      background: linear-gradient(135deg, #fff 0%, #666 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* Status Badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 11px;
      color: var(--accent-buy);
      margin-top: 12px;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      background: var(--accent-buy);
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Main Card */
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 0;
      padding: 24px;
      margin-bottom: 16px;
      position: relative;
      overflow: hidden;
    }

    .card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 3px;
      height: 100%;
      background: var(--accent-blue);
    }

    /* Price Display */
    .price-section {
      text-align: center;
      padding: 32px 0;
    }

    .price-label {
      font-size: 11px;
      letter-spacing: 2px;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }

    .price {
      font-size: 48px;
      font-weight: 800;
      letter-spacing: -2px;
      font-family: 'Space Grotesk', sans-serif;
    }

    .price-change {
      font-size: 14px;
      margin-top: 8px;
      color: var(--accent-buy);
    }

    /* Signal Display */
    .signal-box {
      text-align: center;
      padding: 24px;
      border: 2px solid ${signalColor};
      background: ${signalColor}08;
      box-shadow: ${signalGlow};
      margin-top: 16px;
    }

    .signal-label {
      font-size: 11px;
      letter-spacing: 3px;
      color: var(--text-secondary);
      margin-bottom: 12px;
    }

    .signal-value {
      font-size: 36px;
      font-weight: 800;
      color: ${signalColor};
      letter-spacing: 4px;
      animation: signalPulse 1.5s infinite;
    }

    @keyframes signalPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }

    /* Data Grid */
    .data-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--border);
      border: 1px solid var(--border);
    }

    .data-cell {
      background: var(--bg-card);
      padding: 16px;
    }

    .data-label {
      font-size: 10px;
      letter-spacing: 1px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .data-value {
      font-size: 16px;
      font-weight: 700;
    }

    .data-value.green { color: var(--accent-buy); }
    .data-value.red { color: var(--accent-sell); }

    /* Config Section */
    .config-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
      font-size: 12px;
    }

    .config-row:last-child { border-bottom: none; }

    .config-label { color: var(--text-secondary); }
    .config-value { color: var(--text-primary); }

    /* Footer */
    .footer {
      text-align: center;
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }

    .footer a {
      color: var(--accent-blue);
      text-decoration: none;
      font-size: 12px;
      letter-spacing: 1px;
    }

    .footer a:hover { text-decoration: underline; }

    /* Timestamp */
    .timestamp {
      text-align: center;
      font-size: 10px;
      color: var(--text-secondary);
      margin-top: 16px;
      letter-spacing: 1px;
    }

    /* Error State */
    .error-card {
      background: #1a0a0a;
      border: 1px solid #ff336633;
      padding: 24px;
      text-align: center;
    }

    .error-card::before {
      content: '⚠';
      font-size: 24px;
      display: block;
      margin-bottom: 12px;
    }

    @media (max-width: 480px) {
      .price { font-size: 36px; }
      .signal-value { font-size: 28px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="logo">◆ AUTOMATED</div>
      <h1 class="title">BTC TRADING BOT</h1>
      <div class="status-badge">
        <span class="status-dot"></span>
        LIVE
      </div>
    </header>

    <div class="card">
      <div class="config-row">
        <span class="config-label">SYMBOL</span>
        <span class="config-value">${CONFIG.symbol}</span>
      </div>
      <div class="config-row">
        <span class="config-label">STRATEGY</span>
        <span class="config-value">MA ${CONFIG.fastMA}/${CONFIG.slowMA} CROSSOVER</span>
      </div>
      <div class="config-row">
        <span class="config-label">TIMEFRAME</span>
        <span class="config-value">${CONFIG.interval.toUpperCase()}</span>
      </div>
    </div>

    ${lastSignal ? `
    <div class="card">
      <div class="price-section">
        <div class="price-label">CURRENT PRICE</div>
        <div class="price">$${parseFloat(lastSignal.price).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
      </div>
      
      <div class="data-grid">
        <div class="data-cell">
          <div class="data-label">FAST MA (${CONFIG.fastMA})</div>
          <div class="data-value">$${lastSignal.fastMA}</div>
        </div>
        <div class="data-cell">
          <div class="data-label">SLOW MA (${CONFIG.slowMA})</div>
          <div class="data-value">$${lastSignal.slowMA}</div>
        </div>
      </div>

      <div class="signal-box">
        <div class="signal-label">SIGNAL</div>
        <div class="signal-value">${lastSignal.signal || 'HOLD'}</div>
      </div>

      <div class="timestamp">
        LAST UPDATED: ${new Date(lastSignal.timestamp).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC
      </div>
    </div>
    ` : `
    <div class="card error-card">
      <div style="color: #ff3366; font-weight: 700; margin-bottom: 8px;">CONNECTION ERROR</div>
      <div style="color: #666; font-size: 12px;">Unable to fetch market data from Binance</div>
    </div>
    `}

    <footer class="footer">
      <a href="/api/signals">📊 JSON API</a>
      &nbsp;&nbsp;•&nbsp;&nbsp;
      <a href="/api/price/${CONFIG.symbol}">💰 PRICE</a>
    </footer>
  </div>
</body>
</html>`;
  
  res.send(html);
});

app.get('/api/price/:symbol?', async (req, res) => {
  try {
    const symbol = req.params.symbol || CONFIG.symbol;
    const price = await binance.prices({ symbol });
    res.json({ symbol, price: price[symbol] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/signals', async (req, res) => {
  await updateSignals();
  res.json({ symbol: CONFIG.symbol, config: { fastMA: CONFIG.fastMA, slowMA: CONFIG.slowMA }, signal: lastSignal });
});

app.post('/api/trade', async (req, res) => {
  if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_SECRET_KEY) {
    return res.status(401).json({ error: 'API keys not configured' });
  }
  if (!lastSignal || !lastSignal.signal) {
    return res.status(400).json({ error: 'No trading signal available' });
  }
  try {
    const { signal } = lastSignal;
    const order = await binance.order({ symbol: CONFIG.symbol, side: signal === 'BUY' ? 'BUY' : 'SELL', quantity: CONFIG.quantity, type: 'MARKET' });
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🤖 Trading bot running on port ${PORT}`);
  console.log(`📈 Monitoring ${CONFIG.symbol} with ${CONFIG.fastMA}/${CONFIG.slowMA} MA crossover`);
  updateSignals();
  setInterval(updateSignals, 5 * 60 * 1000);
});

module.exports = app;