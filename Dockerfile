# Usamos una imagen ligera de Node
FROM node:20-slim

# Instalamos FFmpeg (necesario para el audio)
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos manifiestos de configuración
COPY package*.json tsconfig.json ./

# Instalamos TODAS las dependencias (necesarias para compilar TypeScript)
RUN npm install

# Copiamos el código fuente y el esquema de base de datos
COPY src ./src
COPY prisma ./prisma

# Generamos el cliente de Prisma para Linux
RUN npx prisma generate

# Compilamos el código de TypeScript a JavaScript (crea la carpeta dist)
RUN npm run build

# Iniciamos el bot
CMD ["npm", "start"]
