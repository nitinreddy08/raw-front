'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getSocket } from '../lib/signalling';
import { usePeer } from '../lib/usePeer';
import VideoPanel from '../components/VideoPanel';
import Controls from '../components/Controls';
import ReportModal from '../components/ReportModal';
import ChatPanel from '../components/ChatPanel';

const ChatPage = () => {
  const router = useRouter();
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [status, setStatus] = useState('Connecting...');
  const [isReportModalOpen, setReportModalOpen] = useState(false);
  const [isBanned, setBanned] = useState(false);
  const [toast, setToast] = useState(null);

  const [connectionStatus, setConnectionStatus] = useState('Connecting...');
  const partnerIdRef = useRef(null);
  const peerSignalRef = useRef(null);
  
  // Create a stable reference to the socket
  const socketRef = useRef(null);
  
  // Initialize peer with socket, localStream, and findNewPartner function
  const { peer, remoteStream, peerState, createPeer, handleSignal: peerHandleSignal, cleanupPeer } = usePeer(socketRef.current, localStream);
  
  // Keep the signal handler ref updated
  useEffect(() => {
    peerSignalRef.current = peerHandleSignal;
  }, [peerHandleSignal]);

  const showToast = useCallback((message) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);
  
  // Create a ref to hold the findNewPartner function
  const findNewPartnerRef = useRef(() => {
    console.warn('findNewPartner not initialized yet');
  });

  // Define findNewPartner with useCallback
  const findNewPartner = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[Chat] Finding new partner...');
      cleanupPeer();
      setStatus('Searching for a partner...');
      setConnectionStatus('searching');
      socketRef.current.emit('find_partner', {});
    } else {
      console.warn('[Chat] Socket not connected, cannot find partner');
      setStatus('Not connected to server. Trying to reconnect...');
      setConnectionStatus('connecting');
      // Try to reconnect after a delay if socket is not connected
      setTimeout(() => {
        if (socketRef.current) {
          socketRef.current.connect();
        }
      }, 2000);
    }
  }, [cleanupPeer]);

  // Update the ref when findNewPartner changes
  useEffect(() => {
    findNewPartnerRef.current = findNewPartner;
  }, [findNewPartner]);

  // Update status based on peer state changes
  useEffect(() => {
    console.log('[Chat] Peer state changed:', peerState);
    
    switch (peerState) {
      case 'connected':
        setStatus('Video call connected');
        setConnectionStatus('connected');
        break;
      case 'audio_only':
        setStatus('Audio connected (video unavailable)');
        setConnectionStatus('audio_only');
        break;
      case 'disconnected':
      case 'failed':
      case 'closed':
        setStatus('Connection lost. Finding a new partner...');
        setConnectionStatus('disconnected');
        // Use the ref to avoid dependency cycle
        findNewPartnerRef.current();
        break;
      case 'connecting':
        setStatus('Establishing connection...');
        setConnectionStatus('connecting');
        break;
      default:
        setStatus(`Status: ${peerState}`);
    }
  }, [peerState]);

  const handlePartnerFound = useCallback((data) => {
    console.log('[Chat] Partner found:', data.partner_id);
    partnerIdRef.current = data.partner_id;
    setStatus('Establishing connection...');
    setConnectionStatus('connecting');
    // Pass the findNewPartner function to createPeer
    createPeer(data.partner_id, findNewPartner);
  }, [createPeer, findNewPartner]);
  
  const handlePartnerDisconnected = useCallback(() => {
    console.log('[Chat] Partner disconnected');
    setStatus('Partner disconnected. Finding a new partner...');
    setConnectionStatus('disconnected');
    findNewPartner();
  }, [findNewPartner]);
  
  const handleBanned = useCallback((data) => {
    console.log('[Chat] Banned:', data.reason);
    setBanned(true);
    setConnectionStatus('banned');
    setStatus(`You are banned: ${data.reason}`);
  }, []);
  
  const handleReportReceived = useCallback(() => {
    showToast('Thank you for your report. We will review it shortly.');
  }, [showToast]);
  
  const handleSignal = useCallback((data) => {
    console.log('[Chat] Received signal type:', data.type || 'unknown');
    if (peerSignalRef.current) {
      peerSignalRef.current(data);
    } else {
      console.warn('[Chat] No signal handler available');
    }
  }, []);

  // Initialize socket and media stream
  useEffect(() => {
    let isMounted = true;
    let mediaStream = null;

    const initialize = async () => {
      // Check for age verification cookie
      if (!document.cookie.includes('ageVerified=true')) {
        router.push('/');
        return;
      }

      const deviceId = localStorage.getItem('deviceId');
      if (!deviceId) {
        router.push('/');
        return;
      }

      try {
        // Initialize socket first
        const newSocket = getSocket(deviceId);
        socketRef.current = newSocket;
        setSocket(newSocket);

        // Get user media
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
          });
          if (isMounted) {
            setLocalStream(mediaStream);
          }
        } catch (err) {
          console.error('Error getting user media:', err);
          if (isMounted) {
            setStatus('Could not access camera/mic. Please grant permissions.');
          }
        }
      } catch (error) {
        console.error('Initialization error:', error);
        if (isMounted) {
          setStatus('Initialization failed. Please refresh the page.');
        }
      }
    };

    initialize();

    // Cleanup function
    return () => {
      isMounted = false;
      
      // Clean up media stream
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }
      
      // Clean up peer connection
      cleanupPeer();
    };
  }, [router, cleanupPeer]);

  // Socket effect
  useEffect(() => {
    if (!socketRef.current || !localStream) return;

    const currentSocket = socketRef.current;
    currentSocket.connect();

    // Set up socket event listeners
    currentSocket.on('partner_found', handlePartnerFound);
    currentSocket.on('signal', handleSignal);
    currentSocket.on('partner_disconnected', handlePartnerDisconnected);
    currentSocket.on('banned', handleBanned);
    currentSocket.on('report_received', handleReportReceived);

    // Connection status handlers
    const handleConnect = () => {
      console.log('[Socket] Connected to server');
      findNewPartner();
    };

    const handleConnectError = (error) => {
      console.error('[Socket] Connection error:', error);
      setStatus('Connection error. Trying to reconnect...');
      setConnectionStatus('error');
    };

    const handleDisconnect = (reason) => {
      console.log(`[Socket] Disconnected: ${reason}`);
      if (reason === 'io server disconnect') {
        setStatus('Disconnected from server. Please refresh the page.');
        setConnectionStatus('disconnected');
      }
    };

    currentSocket.on('connect', handleConnect);
    currentSocket.on('connect_error', handleConnectError);
    currentSocket.on('disconnect', handleDisconnect);

    // Initial connection check
    if (currentSocket.connected) {
      findNewPartner();
    }
    
    return () => {
      // Clean up event listeners
      currentSocket.off('partner_found', handlePartnerFound);
      currentSocket.off('signal', handleSignal);
      currentSocket.off('partner_disconnected', handlePartnerDisconnected);
      currentSocket.off('banned', handleBanned);
      currentSocket.off('report_received', handleReportReceived);
      currentSocket.off('connect', handleConnect);
      currentSocket.off('connect_error', handleConnectError);
      currentSocket.off('disconnect', handleDisconnect);
      
      // Only disconnect if we're the last reference
      currentSocket.disconnect();
    };
  }, [localStream, findNewPartner, handlePartnerFound, handlePartnerDisconnected, handleBanned, handleReportReceived, handleSignal]);

  const handleNext = () => {
    showToast('Searching for next partner...');
    findNewPartner();
  };

  const handleStop = () => {
    router.push('/');
  };

  const handleReport = () => {
    setReportModalOpen(true);
  };

  const confirmReport = () => {
    if (partnerIdRef.current) {
      socket.emit('report_user', { reason: 'inappropriate behavior' });
    }
    setReportModalOpen(false);
    showToast('User reported. Finding new partner...');
    findNewPartner();
  };

  if (isBanned) {
    return (
      <div className="flex flex-col h-screen bg-gray-900 text-white">
        {/* Status Bar */}
        <div className={`p-2 text-center text-sm font-medium ${
          connectionStatus === 'connected' ? 'bg-green-800' : 
          connectionStatus === 'audio_only' ? 'bg-yellow-800' : 
          connectionStatus === 'searching' ? 'bg-blue-800' :
          'bg-gray-800'
        }`}>
          <div className="flex items-center justify-center space-x-2">
            {connectionStatus === 'connected' && (
              <span className="flex h-2 w-2 rounded-full bg-green-400"></span>
            )}
            {connectionStatus === 'audio_only' && (
              <span className="flex h-2 w-2 rounded-full bg-yellow-400"></span>
            )}
            {connectionStatus === 'searching' && (
              <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
            )}
            {!['connected', 'audio_only', 'searching'].includes(connectionStatus) && (
              <span className="flex h-2 w-2 rounded-full bg-red-400 animate-pulse"></span>
            )}
            <span>{status}</span>
          </div>
        </div>
        <div className="text-center p-8">
          <h1 className="text-3xl text-rose-500 font-bold mb-4">You have been banned.</h1>
          <p>Due to multiple reports, your access has been temporarily restricted for 24 hours.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-gray-900">
      {/* Status Bar */}
      <div className={`p-2 text-center text-sm font-medium ${
        connectionStatus === 'connected' ? 'bg-green-800' : 
        connectionStatus === 'audio_only' ? 'bg-yellow-800' : 
        connectionStatus === 'searching' ? 'bg-blue-800' :
        'bg-gray-800'
      }`}>
        <div className="flex items-center justify-center space-x-2">
          {connectionStatus === 'connected' && (
            <span className="flex h-2 w-2 rounded-full bg-green-400"></span>
          )}
          {connectionStatus === 'audio_only' && (
            <span className="flex h-2 w-2 rounded-full bg-yellow-400"></span>
          )}
          {connectionStatus === 'searching' && (
            <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
          )}
          {!['connected', 'audio_only', 'searching'].includes(connectionStatus) && (
            <span className="flex h-2 w-2 rounded-full bg-red-400 animate-pulse"></span>
          )}
          <span>{status}</span>
        </div>
      </div>
      
      <div className="flex-grow p-4 gap-4 flex flex-col">
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
            {toast}
          </div>
        )}
        
        <main className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="w-full h-full">
            {remoteStream ? (
              <VideoPanel stream={remoteStream} isMuted={false} label="Partner" />
            ) : (
              <div className="w-full h-full bg-black rounded-lg flex items-center justify-center">
                <p className="text-gray-400">{status}</p>
              </div>
            )}
          </div>
          <div className="w-full h-full">
            {localStream ? (
              <VideoPanel stream={localStream} isMuted={true} label="You" />
            ) : (
              <div className="w-full h-full bg-black rounded-lg flex items-center justify-center">
                <p className="text-gray-400">Waiting for camera access...</p>
              </div>
            )}
          </div>
        </main>
        
        <footer className="h-32">
          <ChatPanel />
        </footer>
      </div>
      
      <Controls 
        onNext={handleNext} 
        onStop={handleStop} 
        onReport={handleReport} 
        isPartnered={connectionStatus === 'connected' || connectionStatus === 'audio_only'}
      />
      <ReportModal 
        isOpen={isReportModalOpen} 
        onClose={() => setReportModalOpen(false)} 
        onConfirm={confirmReport} 
      />
    </div>
  );
};

export default ChatPage;
