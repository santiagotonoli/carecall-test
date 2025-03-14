import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import sdk from "microsoft-cognitiveservices-speech-sdk";
import dotenv from "dotenv";
import OpenAI from "openai";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());

// Configure multer pour enregistrer temporairement les fichiers dans /tmp
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "/tmp");
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// Configure fluent-ffmpeg pour utiliser le binaire ffmpeg
ffmpeg.setFfmpegPath(ffmpegStatic);

// Configuration d'Azure Speech
const speechConfig = sdk.SpeechConfig.fromSubscription(process.env.AZURE_SPEECH_KEY, process.env.AZURE_SPEECH_REGION);
speechConfig.speechRecognitionLanguage = "fr-FR";

// Configuration d'OpenAI (utilisation de l'import par défaut pour openai v3)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Convertit un fichier audio (n'importe quel format) en WAV PCM 16kHz mono.
 * @param {string} inputPath - chemin du fichier d'entrée
 * @param {string} outputPath - chemin du fichier WAV de sortie
 * @returns {Promise<void>}
 */
function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-ar",
        "16000", // Fréquence d'échantillonnage à 16 kHz
        "-ac",
        "1", // Audio mono
        "-f",
        "wav", // Format WAV
        "-acodec",
        "pcm_s16le", // Codec PCM signé 16 bits little-endian
      ])
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .save(outputPath);
  });
}

/**
 * Transcrit le fichier WAV en utilisant Azure Speech.
 * @param {Buffer} wavBuffer - Buffer du fichier WAV
 * @returns {Promise<string>} transcription
 */
function transcribeAudio(wavBuffer) {
  return new Promise((resolve, reject) => {
    const audioConfig = sdk.AudioConfig.fromWavFileInput(wavBuffer);
    const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);
    recognizer.recognizeOnceAsync(
      (result) => {
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          resolve(result.text.trim());
        } else {
          reject(new Error(result.errorDetails || "La reconnaissance a échoué."));
        }
        recognizer.close();
      },
      (error) => {
        reject(error);
        recognizer.close();
      }
    );
  });
}

/**
 * Interroge OpenAI avec la transcription et le prompt pour obtenir une réponse IA.
 * @param {string} transcription
 * @param {string} prompt
 * @returns {Promise<string>} réponse IA
 */
async function getLLMResponse(transcription, prompt) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content: "Vous êtes un assistant qui analyse des transcriptions audio.",
      },
      {
        role: "user",
        content: `${prompt}\n\nTranscription: ${transcription}`,
      },
    ],
    temperature: 0.7,
  });

  return completion.choices[0].message.content || "Désolé, je n'ai pas pu générer de réponse.";
}

// Route POST pour traiter l'audio
app.post("/process-audio", upload.single("audio"), async (req, res) => {
  try {
    const prompt = req.body.prompt;
    if (!req.file) {
      return res.status(400).json({ error: "Aucun fichier audio fourni" });
    }
    const inputPath = req.file.path;
    const outputPath = path.join("/tmp", "converted-" + req.file.filename + ".wav");

    // Conversion du fichier audio en WAV PCM 16kHz
    await convertToWav(inputPath, outputPath);

    // Lecture du fichier WAV converti
    const wavBuffer = fs.readFileSync(outputPath);

    // Transcription via Azure Speech
    const transcription = await transcribeAudio(wavBuffer);

    // Obtenir la réponse du LLM via OpenAI
    const llmResponse = await getLLMResponse(transcription, prompt);

    // Nettoyage des fichiers temporaires
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    res.json({ transcription, llmResponse });
  } catch (error) {
    console.error("Erreur lors du traitement:", error);
    res.status(500).json({ error: "Erreur lors du traitement de la requête" });
  }
});
