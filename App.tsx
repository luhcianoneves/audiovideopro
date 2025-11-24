import React, { useState, useRef, useEffect } from 'react';
import { AppStep, UploadedVideo, AudioTrack, ProcessedResult } from './types';
import { LoginScreen } from './components/LoginScreen';
import { VideoUploader } from './components/VideoUploader';
import { AudioTrackItem } from './components/AudioTrackItem';
import { ProcessingModal } from './components/ProcessingModal';
import { ResultVideoPlayer } from './components/ResultVideoPlayer';

// Helper to fetch file as Uint8Array for FFmpeg 0.10.1
const getFileData = async (file: File): Promise<Uint8Array> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error("Failed to read file"));
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

// Icons
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
  </svg>
);

const RestartIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
);

const DownloadIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

function App() {
  const [step, setStep] = useState<AppStep>(AppStep.LOGIN);
  const [uploadedVideo, setUploadedVideo] = useState<UploadedVideo | null>(null);
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [results, setResults] = useState<ProcessedResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ffmpegRef = useRef<any>(null);

  // Initial check to ensure environment is sane
  useEffect(() => {
    console.log("AudioVideo Merger App Initialized");
  }, []);

  const handleLoginSuccess = () => {
    setStep(AppStep.UPLOAD_VIDEO);
  };

  const handleVideoSelected = (video: UploadedVideo) => {
    setUploadedVideo(video);
    setStep(AppStep.CONFIGURE_AUDIO);
    setErrorMsg(null);
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    if (!uploadedVideo) return;

    if (e.target.files) {
      Array.from(e.target.files).forEach((file: File) => {
        if (file.type.startsWith('audio/')) {
          const url = URL.createObjectURL(file);
          const audio = new Audio(url);
          
          audio.onloadedmetadata = () => {
             // CRITICAL: Audio must be at least as long as the video to allow an exact match cut.
             if (audio.duration < uploadedVideo.duration) {
                setErrorMsg(`O áudio "${file.name}" é muito curto (${Math.floor(audio.duration)}s). Precisa ser maior que o vídeo (${Math.floor(uploadedVideo.duration)}s).`);
                return;
             }

             setAudioTracks(prev => [
               ...prev,
               {
                 id: Math.random().toString(36).substr(2, 9),
                 file,
                 name: file.name,
                 duration: audio.duration,
                 startTime: 0,
                 url
               }
             ]);
          };
        }
      });
    }
    // Reset input
    e.target.value = '';
  };

  const updateAudioTrack = (id: string, updates: Partial<AudioTrack>) => {
    setAudioTracks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const removeAudioTrack = (id: string) => {
    setAudioTracks(prev => prev.filter(t => t.id !== id));
  };

  const startProcessing = async () => {
    if (!uploadedVideo || audioTracks.length === 0) return;
    
    setStep(AppStep.PROCESSING);
    setProgress(0);
    setProgressMessage("Carregando motor de vídeo...");
    setResults([]);

    // Delay slighty to allow UI to update
    setTimeout(async () => {
        try {
            // 1. Initialize FFmpeg (v0.10.1)
            if (!ffmpegRef.current) {
                if (!(window as any).FFmpeg) {
                    throw new Error("Componente FFmpeg não foi carregado. Verifique sua conexão.");
                }
                const { createFFmpeg } = (window as any).FFmpeg;
                // corePath not strictly needed for unpkg 0.10.1, but good practice if needed
                ffmpegRef.current = createFFmpeg({ log: true });
                await ffmpegRef.current.load();
            }
            
            const ffmpeg = ffmpegRef.current;
            const generatedResults: ProcessedResult[] = [];

            // 2. Write Base Video
            setProgressMessage("Lendo arquivo de vídeo...");
            const videoFileName = 'input_video.mp4';
            const videoData = await getFileData(uploadedVideo.file);
            ffmpeg.FS('writeFile', videoFileName, videoData);

            // 3. Process Each Track
            for (let i = 0; i < audioTracks.length; i++) {
                const track = audioTracks[i];
                setProgressMessage(`Renderizando vídeo ${i + 1} de ${audioTracks.length}...`);
                
                const audioFileName = `input_audio_${i}.mp3`;
                const outputFileName = `final_video_${i}.mp4`;

                // Write Audio
                const audioData = await getFileData(track.file);
                ffmpeg.FS('writeFile', audioFileName, audioData);

                // Determine Crop Filters
                let filterComplex = "";
                let needsReEncoding = false;
                
                // Crop Logic
                const currentAspectRatio = uploadedVideo.width / uploadedVideo.height;
                const targetAspectRatio = 9/16;
                const isLandscape = currentAspectRatio > targetAspectRatio + 0.01;
                
                // Downscale logic to prevent browser crash (Max 720p width for rendering speed)
                // If it's landscape, we scale height to something reasonable (e.g., 1280) then crop width
                const MAX_H = 1280; 

                if (isLandscape) {
                    needsReEncoding = true;
                    // Scale so height is MAX_H, then crop width to be 9/16 of height
                    // crop=w=h*(9/16):h=h:x=(in_w-out_w)/2:y=0
                    filterComplex = `scale=-2:${MAX_H},crop=ih*(9/16):ih:(iw-ow)/2:0`;
                } else if (uploadedVideo.height > MAX_H) {
                    needsReEncoding = true;
                    filterComplex = `scale=-2:${MAX_H}`;
                }

                // Construct Command
                const args = [
                    '-i', videoFileName,            // Input 0: Video
                    '-ss', track.startTime.toString(), // Seek Audio Input
                    '-i', audioFileName,            // Input 1: Audio
                    '-t', uploadedVideo.duration.toString(), // Trim to video duration
                    '-map', '0:v',                  // Map Video from Input 0
                    '-map', '1:a',                  // Map Audio from Input 1
                ];

                if (needsReEncoding) {
                    args.push('-vf', filterComplex);
                    args.push('-c:v', 'libx264');
                    args.push('-preset', 'ultrafast'); // Speed over size
                    args.push('-crf', '28');           // Reasonable quality
                } else {
                    args.push('-c:v', 'copy');
                }

                args.push('-c:a', 'aac');          // Re-encode audio to ensure compatibility
                args.push(outputFileName);

                console.log(`Running FFmpeg for track ${i}`, args);
                
                // EXECUTE
                await ffmpeg.run(...args);

                // READ OUTPUT
                const data = ffmpeg.FS('readFile', outputFileName);
                const blob = new Blob([data.buffer], { type: 'video/mp4' });
                const finalUrl = URL.createObjectURL(blob);

                generatedResults.push({
                    id: track.id,
                    audioTrackName: track.name,
                    videoUrl: finalUrl,
                    audioUrl: track.url, 
                    audioStartTime: track.startTime,
                    videoDuration: uploadedVideo.duration,
                    blob: blob,
                    createdAt: new Date()
                });

                // CLEANUP (Audio & Output)
                try { ffmpeg.FS('unlink', audioFileName); } catch(e) {}
                try { ffmpeg.FS('unlink', outputFileName); } catch(e) {}

                setProgress(i + 1);
            }

            // Final Cleanup
            try { ffmpeg.FS('unlink', videoFileName); } catch(e) {}

            setResults(generatedResults);
            setStep(AppStep.RESULTS);

        } catch (err) {
            console.error("Processing Error:", err);
            const msg = err instanceof Error ? err.message : "Erro desconhecido";
            setErrorMsg(`Erro: ${msg}. Tente usar arquivos menores ou recarregar.`);
            setStep(AppStep.CONFIGURE_AUDIO);
        }
    }, 500);
  };

  const resetApp = () => {
      // Revoke old URLs
      results.forEach(r => URL.revokeObjectURL(r.videoUrl));
      if (uploadedVideo) URL.revokeObjectURL(uploadedVideo.url);
      audioTracks.forEach(t => URL.revokeObjectURL(t.url));

      setUploadedVideo(null);
      setAudioTracks([]);
      setResults([]);
      setStep(AppStep.UPLOAD_VIDEO);
      setErrorMsg(null);
      // We don't reset ffmpeg instance to save reload time
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      
      {/* Header */}
      {step !== AppStep.LOGIN && (
        <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                  AV
               </div>
               <h1 className="font-bold text-lg tracking-tight">AudioVideo <span className="text-blue-500">Merger</span></h1>
            </div>
            <button 
                onClick={resetApp}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-full transition-colors border border-slate-700"
            >
                <RestartIcon /> Novo Projeto
            </button>
          </div>
        </header>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8">
        
        {step === AppStep.LOGIN && <LoginScreen onLoginSuccess={handleLoginSuccess} />}

        {step === AppStep.UPLOAD_VIDEO && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in">
             <VideoUploader onVideoSelected={handleVideoSelected} />
          </div>
        )}

        {step === AppStep.CONFIGURE_AUDIO && uploadedVideo && (
          <div className="animate-fade-in pb-20">
            <div className="flex flex-col md:flex-row gap-8">
                
                {/* Left: Video Preview */}
                <div className="w-full md:w-80 flex-shrink-0 mx-auto">
                    <div className="sticky top-24">
                        <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider text-center">Preview (9:16 Crop)</div>
                        <div className="aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl border border-slate-700 relative group mx-auto">
                             {/* Object-cover simulates the crop behavior for landscape videos */}
                             <video 
                                src={uploadedVideo.url} 
                                className="w-full h-full object-cover" 
                                controls 
                                muted // Always muted in preview
                             />
                             <div className="absolute top-2 left-2 bg-red-500/80 backdrop-blur-md px-2 py-1 rounded-md text-[10px] text-white border border-white/10 flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                                Som original removido
                             </div>
                             
                             {/* Crop Guides for context if video is wider than tall */}
                             {uploadedVideo.width > uploadedVideo.height && (
                                <div className="absolute inset-0 pointer-events-none border-2 border-yellow-500/20 z-10">
                                    <div className="absolute bottom-2 right-2 text-[9px] text-yellow-500/50">Auto-Cropped</div>
                                </div>
                             )}
                        </div>
                        <div className="mt-4 text-center">
                            <p className="text-sm text-slate-400">Duração: {Math.floor(uploadedVideo.duration)}s</p>
                            <p className="text-xs text-slate-500 mt-1">Este vídeo está mudo. Dê play nos áudios ao lado para testar.</p>
                        </div>
                    </div>
                </div>

                {/* Right: Audio Configuration */}
                <div className="flex-grow">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-white">Configurar Áudios</h2>
                        <label className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 px-4 rounded-lg cursor-pointer flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 active:scale-95">
                            <PlusIcon />
                            Adicionar MP3
                            <input 
                                type="file" 
                                className="hidden" 
                                accept="audio/mp3,audio/*" 
                                multiple 
                                onChange={handleAudioUpload}
                            />
                        </label>
                    </div>
                    
                    {errorMsg && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm flex items-center animate-pulse">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {errorMsg}
                        </div>
                    )}

                    {audioTracks.length === 0 ? (
                        <div className="text-center py-16 border-2 border-dashed border-slate-700 rounded-2xl bg-slate-800/30">
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 10l12-3" />
                                </svg>
                            </div>
                            <p className="text-slate-400 font-medium">Nenhum áudio selecionado.</p>
                            <p className="text-slate-500 text-sm mt-1">Adicione arquivos MP3 maiores que o vídeo para começar.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {audioTracks.map(track => (
                                <AudioTrackItem 
                                    key={track.id}
                                    track={track}
                                    videoDuration={uploadedVideo.duration}
                                    onUpdate={updateAudioTrack}
                                    onRemove={removeAudioTrack}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-md border-t border-slate-800 p-4 z-30">
                <div className="max-w-5xl mx-auto flex justify-between items-center">
                    <div className="text-sm text-slate-400">
                        {audioTracks.length} áudios configurados
                    </div>
                    <button
                        onClick={startProcessing}
                        disabled={audioTracks.length === 0}
                        className={`
                           py-3 px-8 rounded-xl font-bold text-lg shadow-xl transition-all
                           ${audioTracks.length > 0 
                             ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-105 hover:shadow-blue-500/25' 
                             : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
                        `}
                    >
                        Gerar {audioTracks.length} Vídeos
                    </button>
                </div>
            </div>
          </div>
        )}

        {step === AppStep.PROCESSING && (
            <ProcessingModal progress={progress} total={audioTracks.length} message={progressMessage} />
        )}

        {step === AppStep.RESULTS && (
            <div className="animate-fade-in pb-20">
                <h2 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    Galeria Pronta
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {results.map((result) => (
                        <div key={result.id} className="bg-slate-800 rounded-2xl overflow-hidden shadow-xl border border-slate-700 flex flex-col hover:border-slate-500 transition-colors">
                            {/* Uses the result video directly as it now contains the audio */}
                            {/* Using ResultVideoPlayer to ensure audio sync if it was merged, or just plain video if blob is ready */}
                            <div className="aspect-[9/16] bg-black">
                                <video 
                                    src={result.videoUrl} 
                                    controls 
                                    className="w-full h-full object-cover" 
                                />
                            </div>

                            <div className="p-4 flex flex-col gap-3 bg-slate-800">
                                <h3 className="font-medium text-white truncate text-sm" title={result.audioTrackName}>
                                    🎵 {result.audioTrackName}
                                </h3>
                                <div className="text-[10px] text-slate-400 mb-1">
                                    Arquivo pronto com áudio mixado.
                                </div>
                                <a 
                                    href={result.videoUrl} 
                                    download={`video-editado-${result.audioTrackName.replace(/\s+/g, '-')}.mp4`}
                                    className="w-full bg-slate-700 hover:bg-green-600 text-white text-sm font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 group"
                                >
                                    <DownloadIcon /> 
                                    <span>Salvar na Galeria</span>
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
                
                <div className="mt-12 text-center">
                    <button 
                        onClick={resetApp}
                        className="text-slate-400 hover:text-white underline decoration-slate-600 hover:decoration-white underline-offset-4 transition-all"
                    >
                        Criar novo projeto
                    </button>
                </div>
            </div>
        )}

      </main>
    </div>
  );
}

export default App;