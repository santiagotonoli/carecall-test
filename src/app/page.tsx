"use client";
import { useState, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { FaMicrophone, FaStop, FaFileAudio, FaTrash, FaTimes } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [transcription, setTranscription] = useState("");
  const [llmResponse, setLlmResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("upload");
  const [isRecording, setIsRecording] = useState(false);
  const [selectedAudio, setSelectedAudio] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [showResults, setShowResults] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'audio/*': ['.mp3', '.wav', '.m4a'] },
    onDrop: (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        setSelectedAudio(acceptedFiles[0]);
        setTranscription("");
        setLlmResponse("");
      }
    }
  });

  // Création d'une URL pour l'aperçu de l'audio
  useEffect(() => {
    if (selectedAudio) {
      const url = URL.createObjectURL(selectedAudio);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl("");
    }
  }, [selectedAudio]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: "audio/webm;codecs=opus" };
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
        const audioFile = new File([audioBlob], "recording.webm", { type: "audio/webm" });
        setSelectedAudio(audioFile);
        setTranscription("");
        setLlmResponse("");
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const resetPage = () => {
    setPrompt("");
    setSelectedAudio(null);
    setTranscription("");
    setLlmResponse("");
    setShowResults(false);
    setActiveTab("upload");
    setIsLoading(false);
  };

  const processAudio = async () => {
    if (!prompt.trim()) {
      alert("Veuillez renseigner une instruction d'analyse avant de continuer.");
      return;
    }
    if (!selectedAudio) return;
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("audio", selectedAudio);
      formData.append("prompt", prompt);
      const response = await fetch("/api/process-audio", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("Erreur lors de l'analyse");
      }
      const data = await response.json();
      setTranscription(data.transcription);
      setLlmResponse(data.llmResponse);
      setShowResults(true);

      setSelectedAudio(null);
    } catch (error) {
      console.error("Erreur lors de l'analyse de l'audio:", error);
      alert("Une erreur est survenue lors de l'analyse de l'audio.");
      resetPage();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-900 to-blue-900 text-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-10"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600 mb-6">
              Analyse vocale par l&apos;IA
            </h1>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Vos audios n&apos;auront plus de secret pour vous !
            </p>
          </motion.div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {showResults ? (
          // Affichage de la grande card des résultats
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="relative bg-gray-800/40 p-6 rounded-xl shadow-lg">
            {/* Bouton de réinitialisation (petite croix en haut à droite) */}
            <button onClick={resetPage} className="absolute top-4 right-4 text-gray-300 hover:text-white">
              <FaTimes />
            </button>
            <div className="mb-4">
              <p className="text-lg text-gray-300">Instruction d&apos;analyse: {prompt}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-4 text-blue-400">Transcription de l&apos;audio</h2>
                <p className="text-gray-300">{transcription}</p>
              </div>
              <div className="p-4">
                <h2 className="text-xl font-semibold mb-4 text-purple-400">Analyse IA</h2>
                <p className="text-gray-300">{llmResponse}</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <>
            {/* Interface d'analyse et d'upload/enregistrement */}
            {/* Prompt Input (affiché uniquement si aucun résultat n'est présent) */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 mb-8">
              <label htmlFor="prompt" className="block text-lg font-medium text-gray-300">
                Quelle instruction d&apos;analyse souhaitez-vous&nbsp;?
              </label>
              <input
                id="prompt"
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex&nbsp;: Résume en 3 phrases"
                className="w-full p-4 rounded-xl bg-gray-800/50 border border-gray-700 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </motion.div>

            {/* Tab Bar */}
            <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex rounded-lg overflow-hidden mb-6 bg-gray-800/30 p-1">
              <button
                onClick={() => { setActiveTab("upload"); setSelectedAudio(null); }}
                className={`flex-1 py-3 px-4 rounded-lg transition-all ${activeTab === "upload" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                <FaFileAudio className="inline mr-2" /> Importer
              </button>
              <button
                onClick={() => { setActiveTab("record"); setSelectedAudio(null); }}
                className={`flex-1 py-3 px-4 rounded-lg transition-all ${activeTab === "record" ? "bg-blue-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                <FaMicrophone className="inline mr-2" /> Enregistrer
              </button>
            </motion.div>

            {/* Zone d'interaction selon l'onglet */}
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                {selectedAudio ? (
                  <div className="rounded-xl bg-gray-800/40 p-6 shadow-lg">
                    {isLoading ? (
                      <div className="flex flex-col items-center justify-center py-12">
                        <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                        <p className="mt-4 text-gray-300">Analyse en cours...</p>
                      </div>
                    ) : (
                      <>
                        <audio controls src={audioUrl} className="w-full mb-4" />
                        <div className="flex justify-around">
                          <button
                            onClick={() => setSelectedAudio(null)}
                            className="flex items-center bg-gray-700 hover:bg-gray-600 text-red-500 py-2 px-4 rounded-lg transition-all"
                          >
                            <FaTrash className="mr-2" /> Supprimer
                          </button>
                          <button
                            disabled={!prompt.trim()}
                            onClick={processAudio}
                            className={`flex items-center bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-all ${!prompt.trim() ? "opacity-50 cursor-not-allowed" : ""}`}
                          >
                            Analyser l&apos;audio
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  activeTab === "upload" ? (
                    <div
                      {...getRootProps()}
                      className="border-2 border-dashed border-gray-600 p-12 text-center cursor-pointer hover:border-blue-500 transition-all rounded-xl bg-gray-800/40"
                    >
                      <input {...getInputProps()} />
                      <div className="space-y-4">
                        <div className="w-16 h-16 mx-auto bg-gray-700 rounded-full flex items-center justify-center">
                          <FaFileAudio className="w-8 h-8 text-blue-400" />
                        </div>
                        <p className="text-lg">Glissez &amp; déposez un fichier audio ou cliquez pour sélectionner</p>
                        <p className="text-sm text-gray-400">Formats supportés : MP3, WAV, M4A</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-12 text-center bg-gray-800/40 shadow-lg">
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        className={`w-24 h-24 rounded-full transition-all ${isRecording ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
                      >
                        {isRecording ? <FaStop className="w-8 h-8 mx-auto" /> : <FaMicrophone className="w-8 h-8 mx-auto" />}
                      </button>
                      {isRecording && (
                        <motion.div
                          animate={{ scale: [1, 1.5, 1] }}
                          transition={{ duration: 1, repeat: Infinity }}
                          className="w-4 h-4 bg-red-600 rounded-full mt-4 mx-auto"
                        />
                      )}
                      <p className="mt-4 text-lg">
                        {isRecording
                          ? "Enregistrement en cours... Cliquez pour arrêter."
                          : "Cliquez pour démarrer l'enregistrement"}
                      </p>
                    </div>
                  )
                )}
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </main>
    </div>
  );
}
