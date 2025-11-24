import React, { useState, useEffect, useRef } from 'react';
import { AppStep, UploadedVideo, AudioTrack, ProcessedResult } from './types';
import { LoginScreen } from './components/LoginScreen';
import { VideoUploader } from './components/VideoUploader';
import { AudioTrackItem } from './components/AudioTrackItem';
import { ProcessingModal } from './components/ProcessingModal';

// FFmpeg globals for version 0.11.x
declare const FFmpeg: {
  createFFmpeg: (options: any) => any;
  fetchFile: (file: File | string) => Promise<Uint8Array>;
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
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  const ffmpegRef = useRef<any>(null);

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

  const loadFFmpeg = async () => {
    if (ffmpegLoaded && ffmpegRef.current) return ffmpegRef.current;

    try {
        setProgressMessage("Carregando sistema de edição...");
        
        // Use 0.11.6 syntax
        const ffmpeg = FFmpeg.createFFmpeg({ 
            log: true,
            corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
        });
        
        await ffmpeg.load();
        
        ffmpegRef.current = ffmpeg;
        setFfmpegLoaded(true);
        return ffmpeg;
    } catch (error) {
        console.error("Failed to load FFmpeg", error);
        setErrorMsg("Erro ao carregar sistema de vídeo. Tente recarregar a página.");
        return null;
    }
  };

  const startProcessing = async () => {
    if (!uploadedVideo || audioTracks.length === 0) return;
    
    setStep(AppStep.PROCESSING);
    setProgress(0);
    setProgressMessage("Iniciando...");
    setResults([]);

    // Give UI a moment to show modal before potentially heavy work
    setTimeout(async () => {
      let ffmpeg = ffmpegRef.current;
      
      if (!ffmpeg) {
          ffmpeg = await loadFFmpeg();
      }

      if (!ffmpeg) {
          setStep(AppStep.CONFIGURE_AUDIO);
          return;
      }

      const generatedResults: ProcessedResult[] = [];

      try {
          // Write Video File once
          setProgressMessage("Preparando vídeo base...");
          const videoFileName = 'input_video.mp4';
          
          // FS Write (0.11.x syntax)
          ffmpeg.FS('writeFile', videoFileName, await FFmpeg.fetchFile(uploadedVideo.file));

          for (let i = 0; i < audioTracks.length; i++) {
              const track = audioTracks[i];
              setProgressMessage(`Processando vídeo ${i + 1} de ${audioTracks.length}...`);
              
              const audioFileName = `audio_${i}.mp3`;
              const outputFileName = `output_${i}.mp4`;

              // Write Audio File
              ffmpeg.FS('writeFile', audioFileName, await FFmpeg.fetchFile(track.file));

              // Determine logic
              let filterComplex = "";
              let needsVideoEncode = false;
              
              const currentAspectRatio = uploadedVideo.width / uploadedVideo.height;
              const targetAspectRatio = 9/16;
              const isLandscape = currentAspectRatio > targetAspectRatio + 0.01;

              // SAFETY SCALE: Downscale heavy 4k videos to 1080p equivalent
              const maxDim = 1280; // Safe for browser
              
              if (isLandscape) {
                  // Crop logic: scale height to maxDim, crop width to 9:16
                  needsVideoEncode = true;
                  filterComplex = `scale=-2:${maxDim},crop=ih*(9/16):ih:(iw-ow)/2:0`;
              } else if (uploadedVideo.height > maxDim) {
                  needsVideoEncode = true;
                  filterComplex = `scale=-2:${maxDim}`; 
              }

              const ffmpegArgs = [
                  '-i', videoFileName, // Input 0: Video
                  '-ss', track.startTime.toString(), // Seek Audio Input
                  '-i', audioFileName, // Input 1: Audio
                  '-t', uploadedVideo.duration.toString(), // Duration of output = duration of video
                  '-map', '0:v', // Use video from 0
                  '-map', '1:a', // Use audio from 1
              ];

              if (needsVideoEncode) {
                  ffmpegArgs.push('-vf', filterComplex);
                  ffmpegArgs.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28'); 
              } else {
                  ffmpegArgs.push('-c:v', 'copy'); 
              }

              // Re-encode audio to AAC to ensure proper cuts
              ffmpegArgs.push('-c:a', 'aac');
              
              // Output
              ffmpegArgs.push(outputFileName);

              console.log(`Run args ${i}:`, ffmpegArgs);
              
              // Run (0.11.x syntax uses run, not exec)
              await ffmpeg.run(...ffmpegArgs);

              // Read the result
              try {
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
              } catch (readErr) {
                console.error("Error reading output file", readErr);
              }
              
              // Cleanup loop files
              try { ffmpeg.FS('unlink', audioFileName); } catch(e) {}
              try { ffmpeg.FS('unlink', outputFileName); } catch(e) {}
              
              setProgress(i + 1);
          }

          // Cleanup video input
          try { ffmpeg.FS('unlink', videoFileName); } catch(e) {}

          setResults(generatedResults);
          setStep(AppStep.RESULTS);

      } catch (e: any) {
          console.error("FFmpeg Processing Error:", e);
          setErrorMsg("Erro durante o processamento. O navegador pode ter ficado sem memória ou o vídeo é muito pesado.");
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
                                muted // Always muted in preview as requested ("som do video deve ser descartado")
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
