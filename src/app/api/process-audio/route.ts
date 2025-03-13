import { NextRequest, NextResponse } from "next/server";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import OpenAI from "openai";

// Initialisation du client OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuration d'Azure Speech
const speechConfig = sdk.SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_KEY!,
  process.env.AZURE_SPEECH_REGION!
);
speechConfig.speechRecognitionLanguage = "fr-FR";

/**
 * Transcrit le fichier WAV envoyé (qui doit être valide, avec un header RIFF)
 */
async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const audioConfig = sdk.AudioConfig.fromWavFileInput(audioBuffer);
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
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Envoie la transcription et le prompt à OpenAI pour générer la réponse IA
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
 * Handler POST : reçoit un fichier audio (WAV) et un prompt,
 * transcrit l'audio avec Azure Speech et génère une réponse avec OpenAI.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    const prompt = formData.get("prompt") as string;

    if (!audioFile) {
      return NextResponse.json({ error: "Aucun fichier audio fourni" }, { status: 400 });
    }

    // Convertir le fichier en Buffer
    const buffer = Buffer.from(await audioFile.arrayBuffer());

    // ATTENTION : ce backend s'attend à recevoir un fichier WAV valide (avec header RIFF)
    const transcription = await transcribeAudio(buffer);
    const llmResponse = await getLLMResponse(transcription, prompt);

    return NextResponse.json({
      transcription,
      llmResponse,
    });
  } catch (error) {
    console.error("Erreur lors du traitement:", error);
    return NextResponse.json({ error: "Erreur lors du traitement de la requête" }, { status: 500 });
  }
}
