# Usamos una imagen ligera de Node
FROM node:20-slim

# Instalamos FFmpeg (necesario para el audio)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos manifiestos de configuración del servidor
COPY package*.json tsconfig.json ./
RUN npm install

# --- COMPILACIÓN DEL FRONTEND (Mini App) ---
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# --- COMPILACIÓN DEL BACKEND ---
COPY src ./src
COPY prisma ./prisma
RUN npx prisma generate
RUN npm run build

# Iniciamos el bot
CMD ["npm", "start"]
