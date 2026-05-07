import fs from 'fs/promises';

export const cleanupFiles = async (filePaths: string[]) => {
  for (const filePath of filePaths) {
    try {
      await fs.unlink(filePath);
      console.log(`🧹 [Cleanup] Eliminado: ${filePath}`);
    } catch (error) {
      console.warn(`⚠️ [Cleanup] Fallo al eliminar ${filePath}:`, error);
    }
  }
};
