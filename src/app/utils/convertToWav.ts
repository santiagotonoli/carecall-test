import { FFmpeg } from '@ffmpeg/ffmpeg';

const ffmpeg = new FFmpeg();

export async function convertToWav(file: File): Promise<File> {
  if (!ffmpeg.loaded) {
    await ffmpeg.load();
  }
  // Écrire le fichier d'entrée dans la mémoire de ffmpeg
  const fileData = new Uint8Array(await file.arrayBuffer());
  await ffmpeg.writeFile('input.m4a', fileData);
  
  // Exécuter la commande de conversion :
  // -i input.m4a : fichier d'entrée
  // -ar 16000 : définir la fréquence d'échantillonnage à 16 kHz
  // -ac 1 : audio mono
  // -f wav : format WAV
  // -acodec pcm_s16le : codec PCM signé 16 bits little-endian
  await ffmpeg.exec(['-i', 'input.m4a', '-ar', '16000', '-ac', '1', '-f', 'wav', '-acodec', 'pcm_s16le', 'output.wav']);
  
  // Lire le fichier converti depuis la mémoire de ffmpeg
  const data = await ffmpeg.readFile('output.wav');
  // Créer un nouvel objet File pour le WAV converti
  return new File([data], 'output.wav', { type: 'audio/wav' });
}
