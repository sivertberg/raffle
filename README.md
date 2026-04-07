> Based on [thomasahle/liars-dice](https://github.com/thomasahle/liars-dice)

# Raffle — Liar's Dice

Play Liar's Dice against an AI trained by self-play. The AI uses neural networks running client-side via ONNX Runtime Web — no backend needed.

## Getting started

```bash
npm install
npm run dev
```

## Project structure

```
src/
  app/            # Next.js App Router
  components/     # React game UI
  hooks/          # ONNX model loading hook
  lib/            # Game logic and state management
public/
  models/         # Pre-trained .onnx model files
training/         # Python scripts for model training
```

## Tech stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **AI inference**: ONNX Runtime Web (client-side)
- **Training**: Python, PyTorch
