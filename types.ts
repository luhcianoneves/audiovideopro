export interface UploadedVideo {
  file: File;
  url: string;
  duration: number;
  width: number;
  height: number;
}

export interface AudioTrack {
  id: string;
  file: File;
  name: string;
  duration: number;
  startTime: number; // The point in the audio file where the video starts
  url: string;
}

export interface ProcessedResult {
  id: string;
  audioTrackName: string;
  videoUrl: string;
  audioUrl: string;
  audioStartTime: number;
  videoDuration: number;
  blob: Blob;
  createdAt: Date;
}

export enum AppStep {
  LOGIN = 'LOGIN',
  UPLOAD_VIDEO = 'UPLOAD_VIDEO',
  CONFIGURE_AUDIO = 'CONFIGURE_AUDIO',
  PROCESSING = 'PROCESSING',
  RESULTS = 'RESULTS'
}