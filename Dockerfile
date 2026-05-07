# Usamos una imagen ligera de Node
FROM node:20-slim

# Instalamos FFmpeg a nivel de sistema operativo dentro del contenedor
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos archivos de dependencias
COPY package*.json ./

# Instalamos dependencias de producción únicamente
RUN npm install --omit=dev

# Copiamos el código compilado (dist) y el esquema de Prisma
COPY dist ./dist
COPY prisma ./prisma

# Generamos el cliente de Prisma para el entorno Linux del contenedor
RUN npx prisma generate

# Exponemos el puerto si fuera necesario (opcional para bot de Telegram)
# EXPOSE 3000

CMD ["npm", "start"]
