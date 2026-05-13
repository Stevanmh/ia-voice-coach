const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Intentando habilitar pgvector en Supabase...');
  try {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
    console.log('✅ Extensión pgvector habilitada correctamente.');
  } catch (e) {
    console.error('❌ Error habilitando pgvector:', e);
    console.error('Mensaje completo:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
