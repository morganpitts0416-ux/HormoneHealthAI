FROM node:20-alpine

# Install ffmpeg for audio transcription chunking (long recordings > 24 MB)
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files and install ALL dependencies (devDeps needed for build)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build frontend (vite → dist/public) and backend (esbuild → dist/index.js)
RUN npm run build

# Prune devDependencies to slim the final image
RUN npm prune --production

EXPOSE 8080

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "dist/index.js"]
