import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

export class EmbeddingService {
    private static model = genAI.getGenerativeModel({ model: "text-embedding-004" });

    /**
     * Genera un vector numérico (768 dimensiones) a partir de un texto.
     */
    static async generate(text: string): Promise<number[]> {
        try {
            const result = await this.model.embedContent(text);
            return result.embedding.values;
        } catch (error) {
            console.error("❌ [Embedding Error]:", error);
            throw error;
        }
    }

    /**
     * Guarda una nueva memoria pedagógica para el usuario.
     */
    static async saveMemory(userId: string, content: string) {
        const embedding = await this.generate(content);
        
        // Usamos raw SQL porque Prisma no soporta el tipo 'vector' nativamente para inserciones
        await prisma.$executeRawUnsafe(
            `INSERT INTO "Memory" (id, "userId", content, embedding, "createdAt") 
             VALUES (gen_random_uuid(), $1, $2, $3::vector, NOW())`,
            userId,
            content,
            `[${embedding.join(',')}]`
        );
        
        console.log(`🧠 [Memory] Nueva memoria guardada para el usuario ${userId}`);
    }

    /**
     * Busca las memorias más relevantes basadas en similitud de coseno.
     */
    static async findRelevant(userId: string, context: string, limit: number = 3) {
        const queryEmbedding = await this.generate(context);
        const vectorStr = `[${queryEmbedding.join(',')}]`;

        // Búsqueda semántica usando el operador <=> (distancia de coseno)
        const memories = await prisma.$queryRawUnsafe<any[]>(
            `SELECT content, 1 - (embedding <=> $1::vector) as similarity
             FROM "Memory"
             WHERE "userId" = $2
             ORDER BY similarity DESC
             LIMIT $3`,
            vectorStr,
            userId,
            limit
        );

        return memories;
    }
}
