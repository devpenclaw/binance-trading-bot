# Binance Trading Bot

A simple crypto trading bot with moving average crossover strategy, deployed on Vercel.

## Features

- 📊 Real-time price fetching from Binance
- 📈 Simple MA (Moving Average) crossover strategy
- 🔔 Trade signal notifications
- 📡 REST API for status and signals
- 🚀 Ready for Vercel deployment

## Quick Start

```bash
# Install dependencies
npm install

# Run locally
npm start
```

## Environment Variables

Create a `.env` file:

```
BINANCE_API_KEY=your_api_key
BINANCE_SECRET_KEY=your_secret_key
TELEGRAM_BOT_TOKEN=your_telegram_token
TELEGRAM_CHAT_ID=your_chat_id
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /api/price/:symbol` | Get current price (e.g., BTCUSDT) |
| `GET /api/signals` | Get current trading signals |
| `POST /api/trade` | Execute a trade |

## Deployment

### Vercel (Recommended)

```bash
npm i -g vercel
vercel login
vercel
```

Or connect your GitHub repo to Vercel for automatic deployments.

## Strategy

This bot uses a simple **Moving Average Crossover** strategy:

- **Buy Signal**: Fast MA crosses above Slow MA
- **Sell Signal**: Fast MA crosses below Slow MA

Default settings:
- Fast MA: 7 periods
- Slow MA: 25 periods
- Trading pair: BTCUSDT

## Disclaimer

⚠️ This is for educational purposes. Trading crypto involves risk. Use at your own risk.