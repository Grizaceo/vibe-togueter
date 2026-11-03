FROM rust:1.94-bookworm AS rust-build
WORKDIR /source
COPY game/ ./
ENV CARGO_BUILD_JOBS=1 CARGO_PROFILE_RELEASE_LTO=false CARGO_PROFILE_RELEASE_OPT_LEVEL=2
RUN rustup target add wasm32-unknown-unknown
RUN cargo build --locked --release -p client --target wasm32-unknown-unknown
RUN cp target/wasm32-unknown-unknown/release/teeworlds-rs.wasm teeworlds_rs.wasm
RUN cargo build --locked --release -p server --bin teeworlds-rs-server

FROM node:26.12.1-bookworm-slim
WORKDIR /app
COPY gateway-package.json ./package.json
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=rust-build /source/target/release/teeworlds-rs-server /app/server
COPY --from=rust-build /source/teeworlds_rs.wasm /app/game.wasm
COPY --from=rust-build /source/maps /app/game/maps
COPY public/ /app/public/
COPY tee-vm-gateway.mjs /app/tee-vm-gateway.mjs
COPY source-manifest.json /app/source-manifest.json
RUN node -e "const fs=require('fs'),c=require('crypto'),m=JSON.parse(fs.readFileSync('/app/source-manifest.json'));for(const [k,p]of Object.entries({serverSha256:'/app/server',wasmSha256:'/app/game.wasm'}))m[k]=c.createHash('sha256').update(fs.readFileSync(p)).digest('hex');m.builtAt=new Date().toISOString();fs.writeFileSync('/app/runtime-manifest.json',JSON.stringify(m))"
USER node
EXPOSE 8080
CMD ["node","/app/tee-vm-gateway.mjs"]
