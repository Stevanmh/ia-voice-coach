import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export const downloadAndConvertAudio = async (fileUrl: URL, fileNameId: string): Promise<string> => {
  const oggPath = path.resolve(__dirname, `../../temp/${fileNameId}.ogg`);
  const mp3Path = path.resolve(__dirname, `../../temp/${fileNameId}.mp3`);

  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`HTTP Error downloading audio: ${response.status}`);
  
  const buffer = await response.arrayBuffer();
  await fs.promises.writeFile(oggPath, Buffer.from(buffer));

  return new Promise((resolve, reject) => {
    ffmpeg(oggPath)
      .outputOptions([
        '-ac 1',
        '-ar 16000'
      ])
      .toFormat('mp3')
      .on('end', () => resolve(mp3Path))
      .on('error', (err) => reject(err))
      .save(mp3Path);
  });
};
