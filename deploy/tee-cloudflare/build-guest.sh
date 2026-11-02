#!/usr/bin/env bash
# Guest-only build of owner external source; never starts a coding agent/model.
set -euo pipefail
test "${VT_AUTHORIZED_GUEST_BUILD:-}" = "tee-cloudflare-trial"
cd /app/source/game
rustup toolchain install 1.94.0 --profile minimal
rustup target add --toolchain 1.94.0 wasm32-unknown-unknown
export CARGO_BUILD_JOBS=1 CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_OPT_LEVEL=2
cargo +1.94.0 build --locked --release -p client --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/teeworlds-rs.wasm teeworlds_rs.wasm
cargo +1.94.0 build --locked --release -p server --bin teeworlds-rs-server
cp target/release/teeworlds-rs-server /app/server
cp teeworlds_rs.wasm /app/game.wasm
mkdir -p /app/game
cp -R maps /app/game/maps
cd /app
cp /app/source/gateway-package.json package.json
npm install --omit=dev --ignore-scripts --no-audit --no-fund
cp -R /app/source/public /app/public
cp /app/source/tee-vm-gateway.mjs /app/tee-vm-gateway.mjs
cp /app/source/source-manifest.json /app/source-manifest.json
node - <<'JS'
const fs=require('fs'),crypto=require('crypto');
const m=JSON.parse(fs.readFileSync('/app/source-manifest.json'));
for(const [k,p] of Object.entries({serverSha256:'/app/server',wasmSha256:'/app/game.wasm'}))m[k]=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
m.builtAt=new Date().toISOString();m.transport='cloudflare-quick-tunnel';
fs.writeFileSync('/app/runtime-manifest.json',JSON.stringify(m));
JS
