import React, { useRef, useState } from 'react';
import { UploadedVideo } from '../types';
import { MIN_VIDEO_DURATION_SEC } from '../constants';

interface VideoUploaderProps {
  onVideoSelected: (video: UploadedVideo) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({ onVideoSelected }) => {
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndLoadVideo = (file: File) => {
    setError(null);

    // Basic MIME type check
    if (!file.type.startsWith('video/')) {
      setError("Por favor, envie um arquivo de vídeo válido.");
      return;
    }

    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    const objectUrl = URL.createObjectURL(file);

    videoElement.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      const duration = videoElement.duration;
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;
      // const aspectRatio = width / height;

      // 1. Check Duration
      if (duration < MIN_VIDEO_DURATION_SEC) {
        setError(`O vídeo deve ter pelo menos 1 minuto. Este vídeo tem ${Math.floor(duration)} segundos.`);
        return;
      }

      // 2. Aspect Ratio Logic
      // We accept 16:9 (Landscape) now, but we will visually crop it to 9:16 in the app.
      // So no error is thrown for landscape videos.

      onVideoSelected({
        file,
        url: URL.createObjectURL(file), // Create a persistent URL for the app session
        duration,
        width,
        height
      });
    };

    videoElement.onerror = () => {
      setError("Erro ao ler o arquivo de vídeo.");
    };

    videoElement.src = objectUrl;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndLoadVideo(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndLoadVideo(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div 
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer bg-slate-800/50 ${
          isDragging ? 'border-blue-500 bg-slate-800' : 'border-slate-600 hover:border-slate-500'
        } ${error ? 'border-red-500/50 bg-red-900/10' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="video/*" 
          onChange={handleFileChange}
        />
        
        <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-white mb-2">Faça upload do seu Vídeo</h3>
        <p className="text-slate-400 mb-6">
          Arraste e solte ou clique para selecionar.<br/>
          <span className="text-xs opacity-70">Mínimo 1 minuto • Auto-crop para 9:16 se horizontal</span>
        </p>

        <button className="bg-slate-700 hover:bg-slate-600 text-white font-medium py-2 px-6 rounded-full transition-colors">
          Selecionar Arquivo
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-red-200 text-sm">{error}</span>
        </div>
      )}
    </div>
  );
};