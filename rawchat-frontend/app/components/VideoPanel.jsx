'use client';

import { useEffect, useRef, useState } from 'react';

const VideoPanel = ({ stream, isMuted, label }) => {
  const videoRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateVideoStream = () => {
      if (!stream) {
        console.log(`[VideoPanel] No stream provided for ${label}`);
        setHasVideo(false);
        video.srcObject = null;
        return;
      }

      console.log(`[VideoPanel] Setting up video stream for ${label} with ${stream.getTracks().length} tracks`);
      
      const onCanPlay = () => {
        console.log(`[VideoPanel] ${label} video can play`);
        video.play().catch(err => {
          console.error(`[VideoPanel] Error playing ${label} video:`, err);
        });
      };

      const onLoadedMetadata = () => {
        console.log(`[VideoPanel] ${label} video metadata loaded`);
        setHasVideo(stream.getVideoTracks().length > 0);
      };

      const onTrackEnded = () => {
        console.log(`[VideoPanel] ${label} track ended`);
        setHasVideo(stream.getVideoTracks().some(track => track.readyState === 'live'));
      };

      video.srcObject = stream;
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('ended', onTrackEnded);

      // Log track information
      const logTracks = () => {
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        
        console.log(`[VideoPanel] ${label} stream has ${videoTracks.length} video and ${audioTracks.length} audio tracks`);
        
        videoTracks.forEach((track, i) => {
          console.log(`[VideoPanel] Video track ${i + 1}:`, {
            id: track.id,
            kind: track.kind,
            label: track.label,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
            settings: track.getSettings()
          });
        });
      };

      logTracks();

      // Set up track event listeners
      const onTrack = (event) => {
        console.log(`[VideoPanel] ${label} track event:`, event.type, event.track);
        setHasVideo(stream.getVideoTracks().length > 0);
        logTracks();
      };

      stream.addEventListener('addtrack', onTrack);
      stream.addEventListener('removetrack', onTrack);

      // Initial check
      setHasVideo(stream.getVideoTracks().length > 0);

      return () => {
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('ended', onTrackEnded);
        stream.removeEventListener('addtrack', onTrack);
        stream.removeEventListener('removetrack', onTrack);
        
        // Don't stop the tracks here as they might be used elsewhere
        video.pause();
        video.srcObject = null;
      };
    };

    updateVideoStream();
  }, [stream, label]);

  return (
    <div className="relative w-full h-full bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className="w-full h-full object-cover"
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <p className="text-gray-400">Waiting for video...</p>
            {stream && (
              <p className="text-xs text-gray-600 mt-2">
                Tracks: {stream.getTracks().length} (
                Video: {stream.getVideoTracks().length}, 
                Audio: {stream.getAudioTracks().length})
              </p>
            )}
          </div>
        </div>
      )}
      <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white text-sm px-2 py-1 rounded">
        {label}
      </div>
    </div>
  );
};

export default VideoPanel;
