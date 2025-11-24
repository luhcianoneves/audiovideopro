import React, { useState, useEffect, useRef } from 'react';
import { AudioTrack } from '../types';

interface AudioTrackItemProps {
  track: AudioTrack;
  videoDuration: number;
  onUpdate: (id: string, updates: Partial<AudioTrack>) => void;
  onRemove: (id: string) => void;
}

export const AudioTrackItem: React.FC<AudioTrackItemProps> = ({ 
  track, 
  videoDuration, 
  onUpdate, 
  onRemove 
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Format seconds to MM:SS
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStart = parseFloat(e.target.value);
    onUpdate(track.id, { startTime: newStart });
    
    // Preview audio from this point if playing
    if (audioRef.current && isPlaying) {
        audioRef.current.currentTime = newStart;
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.currentTime = track.startTime;
      audioRef.current.play();
      
      // Stop automatically after the video duration length is reached
      setTimeout(() => {
        if(audioRef.current && isPlaying) { // Check if still playing
           // Note: This timeout isn't perfect for stopping exactly, but good enough for UI preview
           // A real implementation handles 'timeupdate' event.
        }
      }, videoDuration * 1000);
    }
    setIsPlaying(!isPlaying);
  };

  // Ensure start time doesn't exceed possible range (Audio Duration - Video Duration)
  const maxStartTime = Math.max(0, track.duration - videoDuration);
  const endTime = Math.min(track.duration, track.startTime + videoDuration);

  // Percentage for visual bar
  const startPercent = (track.startTime / track.duration) * 100;
  const widthPercent = (videoDuration / track.duration) * 100;

  useEffect(() => {
    // Stop playing if component unmounts
    return () => {
      if(audioRef.current) audioRef.current.pause();
    };
  }, []);

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-sm transition-all hover:border-slate-600">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 10l12-3" />
            </svg>
          </div>
          <div className="min-w-0">
            <h4 className="text-white font-medium truncate text-sm" title={track.name}>{track.name}</h4>
            <p className="text-xs text-slate-400">Total: {formatTime(track.duration)}</p>
          </div>
        </div>
        <button 
          onClick={() => onRemove(track.id)}
          className="text-slate-500 hover:text-red-400 transition-colors p-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Interactive Timeline */}
      <div className="relative h-12 bg-slate-900 rounded-lg mb-2 overflow-hidden border border-slate-700 select-none">
         {/* Background pattern to simulate waveform */}
         <div className="absolute inset-0 opacity-20 flex items-center justify-around px-2">
            {Array.from({ length: 40 }).map((_, i) => (
                <div key={i} className="w-1 bg-white rounded-full" style={{ height: `${Math.random() * 80 + 20}%`}}></div>
            ))}
         </div>

         {/* Selected Range Highlight */}
         <div 
            className="absolute top-0 bottom-0 bg-indigo-500/30 border-l border-r border-indigo-500 backdrop-blur-sm z-10 pointer-events-none transition-all duration-75"
            style={{ 
                left: `${startPercent}%`, 
                width: `${widthPercent}%` 
            }}
         >
            <div className="absolute top-0 left-0 bg-indigo-500 text-[10px] px-1 text-white font-bold">
                IN
            </div>
            <div className="absolute bottom-0 right-0 bg-indigo-500 text-[10px] px-1 text-white font-bold">
                OUT
            </div>
         </div>

         {/* Range Input Slider */}
         <input
            type="range"
            min={0}
            max={maxStartTime}
            step={0.1}
            value={track.startTime}
            onChange={handleSliderChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
            disabled={maxStartTime <= 0}
         />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
           <button 
              onClick={togglePlay}
              className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {isPlaying ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Pause Preview
                  </>
              ) : (
                  <>
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-1.832a1 1 0 000-1.664l-3-1.832z" clipRule="evenodd" />
                     </svg>
                     Play Segment
                  </>
              )}
           </button>
           <audio 
             ref={audioRef} 
             src={track.url} 
             onEnded={() => setIsPlaying(false)}
             onTimeUpdate={(e) => {
                 // Force loop logic for preview if needed, or just stop at end of segment
                 if(e.currentTarget.currentTime >= endTime) {
                     e.currentTarget.pause();
                     setIsPlaying(false);
                     e.currentTarget.currentTime = track.startTime;
                 }
             }}
           />
        </div>
        <div>
            Trecho: <span className="text-white font-mono">{formatTime(track.startTime)} - {formatTime(endTime)}</span>
        </div>
      </div>
    </div>
  );
};