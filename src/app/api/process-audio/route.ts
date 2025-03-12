import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Nouvelle fonction transcribeAudio utilisant un appel REST à l&apos;API Azure Speech
async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  // Sauvegarder le buffer dans un fichier temporaire
  const tempFilePath = path.join(process.cwd(), 'temp_audio.wav');
  fs.writeFileSync(tempFilePath, audioBuffer);

  const subscriptionKey = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  // URL de l&apos;API Azure Speech (adapter l&apos;endpoint si n&eacute;cessaire)
  const endpoint = `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=fr-FR`


  try {

    const audioData = fs.readFileSync(tempFilePath);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'audio/wav; codec=audio/pcm; samplerate=16000'
      },
      body: audioData
    });


    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur lors de la requ&ecirc;te: ${errorText}`);
    }

    const json = await response.json();

    return json.DisplayText;
  } finally {
    fs.unlinkSync(tempFilePath);
  }
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

  return completion.choices[0].message.content || "Désolé, je n&apos;ai pas pu générer de réponse.";
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const prompt = formData.get('prompt') as string;

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Aucun fichier audio fourni' },
        { status: 400 }
      );
    }

    // Convertir le fichier en buffer
    const buffer = Buffer.from(await audioFile.arrayBuffer());


    const transcription = await transcribeAudio(buffer);


    const llmResponse = await getLLMResponse(transcription, prompt);


    return NextResponse.json({
      transcription,
      llmResponse,
    });

  } catch (error) {
    console.error('Erreur lors du traitement:', error);
    return NextResponse.json(
      { error: 'Erreur lors du traitement de la requête' },
      { status: 500 }
    );
  }
}
