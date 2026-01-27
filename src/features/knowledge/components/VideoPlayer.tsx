// src/features/knowledge/components/VideoPlayer.tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw } from 'lucide-react';
import type { KnowledgeItem } from '../types';

interface VideoPlayerProps {
  item: KnowledgeItem;
  onProgressUpdate: (progressSeconds: number, completed: boolean) => void;
  loadSavedProgress: () => Promise<number>;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  item,
  onProgressUpdate,
  loadSavedProgress,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);

  // Load saved progress when video is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video || hasLoadedProgress) return;

    const handleLoadedMetadata = async () => {
      setDuration(video.duration);

      // Load saved progress
      const savedProgress = await loadSavedProgress();
      if (savedProgress > 0 && savedProgress < video.duration - 5) {
        video.currentTime = savedProgress;
        setProgress(savedProgress);
      }
      setHasLoadedProgress(true);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [loadSavedProgress, hasLoadedProgress]);

  // Save progress periodically
  useEffect(() => {
    if (isPlaying) {
      progressIntervalRef.current = setInterval(() => {
        if (videoRef.current) {
          const currentTime = videoRef.current.currentTime;
          const totalDuration = videoRef.current.duration;
          const completed = currentTime >= totalDuration - 2; // Mark completed 2s before end

          onProgressUpdate(Math.floor(currentTime), completed);
        }
      }, 5000); // Save every 5 seconds
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [isPlaying, onProgressUpdate]);

  // Update progress display
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setProgress(video.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      onProgressUpdate(Math.floor(video.duration), true);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
    };
  }, [onProgressUpdate]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen();
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * video.duration;

    video.currentTime = newTime;
    setProgress(newTime);
  };

  const restartVideo = () => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = 0;
    setProgress(0);
    video.play();
    setIsPlaying(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        backgroundColor: '#000000',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(isPlaying ? false : true)}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={item.content_url || ''}
        style={{
          width: '100%',
          display: 'block',
          maxHeight: '70vh',
        }}
        onClick={togglePlay}
      />

      {/* Controls overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)',
          padding: '48px 16px 16px',
          opacity: showControls ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: showControls ? 'auto' : 'none',
        }}
      >
        {/* Progress bar */}
        <div
          onClick={handleProgressClick}
          style={{
            width: '100%',
            height: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            borderRadius: '3px',
            marginBottom: '12px',
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: `${duration > 0 ? (progress / duration) * 100 : 0}%`,
              height: '100%',
              backgroundColor: '#2F5D50',
              borderRadius: '3px',
              transition: 'width 0.1s linear',
            }}
          />
        </div>

        {/* Control buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Left controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={togglePlay}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <button
              onClick={restartVideo}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <RotateCcw size={20} />
            </button>

            <button
              onClick={toggleMute}
              style={{
                background: 'none',
                border: 'none',
                color: '#FFFFFF',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            <span style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: '500' }}>
              {formatTime(progress)} / {formatTime(duration)}
            </span>
          </div>

          {/* Right controls */}
          <button
            onClick={toggleFullscreen}
            style={{
              background: 'none',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Maximize size={20} />
          </button>
        </div>
      </div>

      {/* Center play button (when paused) */}
      {!isPlaying && (
        <div
          onClick={togglePlay}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 1)';
            e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
            e.currentTarget.style.transform = 'translate(-50%, -50%) scale(1)';
          }}
        >
          <Play size={32} style={{ color: '#2F5D50', marginLeft: '6px' }} />
        </div>
      )}
    </div>
  );
};
