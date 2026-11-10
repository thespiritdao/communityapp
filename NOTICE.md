# Third-party notices

This project is released under the MIT License (see `LICENSE`). It contains or
derives from the following third-party work, each under its own license.

## OnchainKit (Coinbase)

This repository was forked from https://github.com/coinbase/onchainkit in
December 2023. Code under `src/core`, `src/wallet`, `src/token`, `src/network`,
`src/swap`, `src/frame`, `src/farcaster`, `src/fund`, `src/nft`,
`src/transaction`, `src/internal` and `src/styles`, and portions of the build
and test configuration, derive from that project.

```
MIT License

Copyright (c) 2023 Coinbase

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Hats Protocol

Contracts under `src/contracts/` that implement eligibility and toggle modules
build on the Hats Protocol module interfaces (https://github.com/Hats-Protocol),
MIT licensed.

## OpenZeppelin Contracts

Solidity sources import `@openzeppelin/contracts` (MIT), installed from npm.

## shadcn/ui

UI primitives under `src/components/ui` follow the shadcn/ui patterns (MIT).

## Everything installed from npm

All other dependencies are installed from the npm registry and carry their own
licenses as declared in their packages. Run `npx license-checker --summary`
for the current inventory.
