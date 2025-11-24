import React, { useRef, useState, useEffect } from 'react';

interface ResultVideoPlayerProps {
  videoUrl: string;
  audioUrl: string;
  audioStartTime: number;
  videoDuration: number;
}

export const ResultVideoPlayer: React.FC<ResultVideoPlayerProps> = ({
  videoUrl,
  audioUrl,
  audioStartTime,
  videoDuration
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = () => {
    if (!videoRef.current || !audioRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      audioRef.current.pause();
    } else {
      // Sync start
      audioRef.current.currentTime = audioStartTime + videoRef.current.currentTime;
      videoRef.current.play();
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      setProgress((current / videoDuration) * 100);
      
      // Loop or Stop logic
      if (current >= videoDuration) {
        setIsPlaying(false);
        videoRef.current.pause();
        if(audioRef.current) audioRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  };

  // Ensure strict synchronization when play/pause happens
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;

    const syncAudio = () => {
      if(v && a) {
         // The audio current time should be: Start Offset + Video Current Time
         a.currentTime = audioStartTime + v.currentTime;
      }
    };

    if (v) {
      v.addEventListener('play', syncAudio);
      v.addEventListener('seeking', syncAudio);
    }
    return () => {
      if (v) {
        v.removeEventListener('play', syncAudio);
        v.removeEventListener('seeking', syncAudio);
      }
    };
  }, [audioStartTime]);

  return (
    <div className="relative group bg-black aspect-[9/16] overflow-hidden">
      {/* Video is ALWAYS muted to discard original sound as requested */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-cover"
        muted
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
      />
      
      {/* Invisible Audio Player for the merged track */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
      />

      {/* Controls Overlay */}
      <div 
        className={`absolute inset-0 bg-black/30 flex items-center justify-center transition-opacity duration-300 ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
        onClick={togglePlay}
      >
        <button className="bg-white/20 backdrop-blur-md hover:bg-white/30 rounded-full p-4 transition-all transform hover:scale-110">
          {isPlaying ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white pl-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-1.832a1 1 0 000-1.664l-3-1.832z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div 
          className="h-full bg-blue-500 transition-all duration-100 ease-linear"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      
      {/* Mute Indicator */}
      <div className="absolute top-3 right-3 bg-black/60 backdrop-blur text-white text-[10px] px-2 py-1 rounded border border-white/10 opacity-70">
        Som Original Removido
      </div>
    </div>
  );
};