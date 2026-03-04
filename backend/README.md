# Spin Wheel Payout Backend

This service signs and broadcasts **payout transactions** from a funded house wallet on **CKB testnet**.

## Setup

1. Install:

```bash
npm install
```

2. Create `backend/.env`:

```env
# Required: 32-byte secp256k1 private key hex (0x...)
HOUSE_PRIVATE_KEY=0x...

# Optional but recommended: protects the payout endpoint
PAYOUT_API_KEY=your_secret_key

# Optional: payout cap
MAX_PAYOUT_CKB=10000

# Optional: custom RPC
# CKB_RPC_URL=https://testnet.ckb.dev/

PORT=8787
```

3. Run:

```bash
npm run dev
```

## API

### POST `/api/payout`

Headers:
- `x-api-key: <PAYOUT_API_KEY>` (only if `PAYOUT_API_KEY` is set)

Body:
```json
{
  "toAddress": "ckt1...",
  "amountCkb": 10000,
  "betTxHash": "0x..." 
}
```

Response:
```json
{
  "payoutTxHash": "0x...",
  "toAddress": "ckt1...",
  "amountCkb": 10000,
  "betTxHash": "0x..."
}
```

## Security note
If you deploy this publicly **without** an API key or other auth, anyone can call payouts and drain the house wallet. Always secure this endpoint.
