// utils/convertToWav.ts
import * as FFmpeg from "@ffmpeg/ffmpeg";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { createFFmpeg, fetchFile } = FFmpeg as any;

const ffmpeg = createFFmpeg({ log: true });

export async function convertToWav(file: File): Promise<File> {
  if (!ffmpeg.isLoaded()) {
    await ffmpeg.load();
  }
  // Écrire le fichier d'entrée dans l'espace de fichiers virtuel
  ffmpeg.FS("writeFile", "input", await fetchFile(file));
  // Exécuter la commande de conversion pour obtenir un WAV PCM 16kHz mono
  await ffmpeg.run("-i", "input", "-ar", "16000", "-ac", "1", "-f", "wav", "-acodec", "pcm_s16le", "output.wav");
  // Lire le fichier converti (retourne un Uint8Array)
  const data = ffmpeg.FS("readFile", "output.wav");
  // Supprimer les fichiers temporaires (optionnel)
  ffmpeg.FS("unlink", "input");
  ffmpeg.FS("unlink", "output.wav");
  // Créer le File à partir de l'Uint8Array (pas de .buffer)
  return new File([data], "output.wav", { type: "audio/wav" });
}
