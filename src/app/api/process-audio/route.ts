import { NextRequest, NextResponse } from 'next/server';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';

// Utilise systématiquement @ffmpeg-installer/ffmpeg pour obtenir le binaire
async function getFfmpegBinaryPath(): Promise<string> {
  const mod = await import('@' + 'ffmpeg-installer/ffmpeg');
  return mod.default?.path || mod.path;
}

async function setFfmpegPath(): Promise<void> {
  const ffmpegBinaryPath = await getFfmpegBinaryPath();
  console.log("Chemin du binaire ffmpeg:", ffmpegBinaryPath);
  ffmpeg.setFfmpegPath(ffmpegBinaryPath);
}

// Initialisation du client OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration d'Azure Speech
const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY!,
  process.env.AZURE_SPEECH_REGION!
);
speechConfig.speechRecognitionLanguage = 'fr-FR';

async function convertToWavPCM16k(inputPath: string, outputPath: string): Promise<void> {
  await setFfmpegPath();
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-ar 16000',        // Échantillonnage à 16 kHz
        '-ac 1',            // Audio mono
        '-f wav',           // Format WAV
        '-acodec pcm_s16le' // Codec PCM signé 16 bits little-endian
      ])
      .on('end', () => resolve())
      .on('error', (err: unknown) => reject(err))
      .save(outputPath);
  });
}

async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  // Sauvegarder le fichier audio d'origine dans /tmp (en écriture sur Vercel)
  const inputPath = path.join('/tmp', 'input_audio');
  fs.writeFileSync(inputPath, audioBuffer);

  // Chemin du fichier converti
  const outputPath = path.join('/tmp', 'output_audio.wav');

  // Conversion avec ffmpeg
  await convertToWavPCM16k(inputPath, outputPath);

  // Lire le fichier WAV converti
  const wavBuffer = fs.readFileSync(outputPath);

  // Nettoyer : supprimer les fichiers temporaires
  fs.unlinkSync(inputPath);
  fs.unlinkSync(outputPath);

  return new Promise((resolve, reject) => {
    const audioConfig = sdk.AudioConfig.fromWavFileInput(wavBuffer);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

    recognizer.recognizeOnceAsync(
      result => {
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          resolve(result.text.trim());
        } else {
          reject(new Error(result.errorDetails || "La reconnaissance a échoué."));
        }
        recognizer.close();
      },
      error => {
        reject(error);
        recognizer.close();
      }
    );
  });
}

async function getLLMResponse(transcription: string, prompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "Vous êtes un assistant qui analyse des transcriptions audio."
      },
      {
        role: "user",
        content: `${prompt}\n\nTranscription: ${transcription}`
      }
    ],
    temperature: 0.7,
  });

  return completion.choices[0].message.content || "Désolé, je n'ai pas pu générer de réponse.";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const prompt = formData.get('prompt') as string;

    if (!audioFile) {
      return NextResponse.json({ error: 'Aucun fichier audio fourni' }, { status: 400 });
    }

    // Convertir le fichier audio en Buffer
    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // Convertir l'audio en WAV PCM 16kHz et obtenir la transcription
    const transcription = await transcribeAudio(buffer);

    // Obtenir la réponse du LLM via OpenAI
    const llmResponse = await getLLMResponse(transcription, prompt);

    return NextResponse.json({
      transcription,
      llmResponse,
    });
  } catch (error) {
    console.error('Erreur lors du traitement:', error);
    return NextResponse.json({ error: 'Erreur lors du traitement de la requête' }, { status: 500 });
  }
}
