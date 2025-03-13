import { NextRequest, NextResponse } from 'next/server';
import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

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

/**
 * Convertit un fichier audio en WAV PCM 16kHz mono en utilisant ffmpeg.
 */
async function convertToWavPCM16k(inputPath: string, outputPath: string): Promise<void> {
  const ffmpegBinaryPath = ffmpegInstaller.path;
  ffmpeg.setFfmpegPath(ffmpegBinaryPath);
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

/**
 * Convertit le fichier audio reçu (en Buffer) en WAV PCM 16kHz, puis utilise le SDK Azure Speech pour obtenir la transcription.
 */
async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  // Sauvegarde dans /tmp (accessible en écriture sur Vercel)
  const inputPath = path.join('/tmp', 'input_audio');
  fs.writeFileSync(inputPath, audioBuffer);

  const outputPath = path.join('/tmp', 'output_audio.wav');

  // Conversion avec ffmpeg
  await convertToWavPCM16k(inputPath, outputPath);

  // Lecture du fichier WAV converti
  const wavBuffer = fs.readFileSync(outputPath);

  // Nettoyage des fichiers temporaires
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

/**
 * Envoie la transcription et l'instruction à OpenAI pour obtenir la réponse du LLM.
 */
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

/**
 * Fonction API POST : reçoit un fichier audio et une instruction, convertit l'audio et renvoie la transcription et la réponse IA.
 */
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
