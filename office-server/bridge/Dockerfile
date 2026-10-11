# The fingerprint and door bridge, running next to the server (optional profile "bridge").
FROM node:22-alpine
WORKDIR /bridge
COPY bridge/package.json bridge/package-lock.json ./
RUN npm ci --omit=dev
COPY bridge/core.mjs bridge/mawatheeq-bridge.mjs ./
CMD ["node", "mawatheeq-bridge.mjs"]
