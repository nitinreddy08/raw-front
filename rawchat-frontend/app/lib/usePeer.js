'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Add TURN servers here if you have them
    // {
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'username',
    //   credential: 'password'
    // }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  sdpSemantics: 'unified-plan'
};

const waitForIceGathering = (peerConnection) => {
  return new Promise((resolve) => {
    if (peerConnection.iceGatheringState === 'complete') {
      resolve();
    } else {
      const checkState = () => {
        if (peerConnection.iceGatheringState === 'complete') {
          peerConnection.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };
      peerConnection.addEventListener('icegatheringstatechange', checkState);
    }
  });
};

export const usePeer = (socket, localStream) => {
  const peerRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerState, setPeerState] = useState('disconnected');
  const findNewPartnerRef = useRef(null);
  const iceTimeoutRef = useRef(null);
  
  // Track if we're in the middle of finding a new partner
  const isFindingPartnerRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Create a stable reference to the cleanup function
  const cleanup = useCallback((keepLocalTracks = false) => {
    console.log('[WebRTC] Cleaning up peer connection');
    
    // Clear any pending timeouts
    clearTimeout(iceTimeoutRef.current);
    
    if (peerRef.current) {
      try {
        // Remove all event listeners
        peerRef.current.ontrack = null;
        peerRef.current.onicecandidate = null;
        peerRef.current.oniceconnectionstatechange = null;
        peerRef.current.onsignalingstatechange = null;
        peerRef.current.onicegatheringstatechange = null;
        peerRef.current.onconnectionstatechange = null;
        
        // Close the connection
        peerRef.current.close();
      } catch (error) {
        console.error('[WebRTC] Error during cleanup:', error);
      } finally {
        peerRef.current = null;
      }
    }
    
    // Only clear remote stream if explicitly told to do so
    if (!keepLocalTracks) {
      setRemoteStream(null);
    }
  }, []);

  const createPeer = useCallback((partnerId, findNewPartner) => {
    // Don't create a new peer if we're already in the process of finding a partner
    if (isFindingPartnerRef.current) {
      console.log('[WebRTC] Already finding a partner, skipping new peer creation');
      return null;
    }
    
    // Store the findNewPartner function in a ref so we can call it from other callbacks
    findNewPartnerRef.current = findNewPartner;
    
    // Clean up any existing connection but keep the local tracks
    cleanup(true);
    
    console.log('[WebRTC] Creating new peer connection for partner:', partnerId);
    
    try {
      // Create a new RTCPeerConnection with optimized configuration
      const peer = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' }
        ],
        iceTransportPolicy: 'all',
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        sdpSemantics: 'unified-plan',
        iceCandidatePoolSize: 0 // Disable pre-gathering of ICE candidates
      });
      
      peerRef.current = peer;
      console.log('[WebRTC] New peer connection created');
      
      // Reset finding partner flag when connection is established
      isFindingPartnerRef.current = false;

      // Add local tracks if available
      if (localStream) {
        console.log('[WebRTC] Adding local tracks to peer connection');
        localStream.getTracks().forEach(track => {
          try {
            if (!peer.getSenders().some(sender => sender.track === track)) {
              console.log(`[WebRTC] Adding local track: ${track.kind} (${track.id})`);
              peer.addTrack(track, localStream);
            } else {
              console.log(`[WebRTC] Track ${track.kind} (${track.id}) already added`);
            }
          } catch (error) {
            console.error(`[WebRTC] Error adding track ${track.kind} (${track.id}):`, error);
          }
        });
      } else {
        console.warn('[WebRTC] No local stream available when creating peer');
      }

      // Create an offer if we're the initiator
      const createOffer = async () => {
        try {
          console.log('[WebRTC] Creating offer...');
          const offer = await peer.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          console.log('[WebRTC] Created offer, setting local description');
          await peer.setLocalDescription(offer);
          
          // Wait for ICE gathering to complete
          await waitForIceGathering(peer);
          
          // Send the offer to the other peer
          console.log('[WebRTC] Sending offer to', partnerId);
          socket.emit('signal', {
            to: partnerId,
            offer: peer.localDescription,
            type: 'offer'
          });
        } catch (error) {
          console.error('[WebRTC] Error creating/sending offer:', error);
        }
      };

      // Set up event listeners
      peer.onsignalingstatechange = () => {
        console.log(`[WebRTC] Signaling state: ${peer.signalingState}`);
      };

      // Handle ICE candidates
      peer.onicecandidate = (event) => {
        if (!peerRef.current) return;
        
        if (event.candidate) {
          const candidate = event.candidate.toJSON();
          console.log('[WebRTC] Sending ICE candidate');
          
          // Only send the candidate if we have a peer connection
          if (peerRef.current.connectionState !== 'closed' && 
              peerRef.current.iceConnectionState !== 'failed') {
            socket.emit('signal', { 
              to: partnerId,
              type: 'candidate', 
              candidate,
              sdpMLineIndex: candidate.sdpMLineIndex,
              sdpMid: candidate.sdpMid
            });
          }
          
          // Don't try to reconnect if we have a candidate
          clearTimeout(iceTimeoutRef.current);
        } else {
          console.log('[WebRTC] All ICE candidates sent');
          // Reset reconnect attempts on successful ICE gathering
          reconnectAttemptsRef.current = 0;
          
          // Set a longer timeout if we don't get connected
          iceTimeoutRef.current = setTimeout(() => {
            if (peerRef.current && 
                peerRef.current.iceConnectionState !== 'connected' && 
                peerRef.current.iceConnectionState !== 'completed' &&
                peerRef.current.connectionState !== 'connected') {
              
              reconnectAttemptsRef.current++;
              
              if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
                console.log('[WebRTC] Max reconnection attempts reached, finding new partner');
                if (findNewPartnerRef.current) {
                  isFindingPartnerRef.current = true;
                  findNewPartnerRef.current();
                }
              } else {
                console.log(`[WebRTC] ICE connection not established, attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
              }
            }
          }, 8000); // Check after 8 seconds
        }
      };

      // Handle connection state changes
      peer.onconnectionstatechange = () => {
        if (!peerRef.current) return;
        
        const state = peerRef.current.connectionState;
        console.log('[WebRTC] Connection state:', state);
        setPeerState(state);
        
        switch (state) {
          case 'connected':
            console.log('[WebRTC] Peer connection established');
            isFindingPartnerRef.current = false;
            reconnectAttemptsRef.current = 0;
            break;
            
          case 'failed':
            console.log('[WebRTC] Connection failed, attempting to recover...');
            if (findNewPartnerRef.current && !isFindingPartnerRef.current) {
              isFindingPartnerRef.current = true;
              // Small delay to prevent rapid reconnection attempts
              setTimeout(() => {
                if (findNewPartnerRef.current) {
                  findNewPartnerRef.current();
                }
              }, 2000);
            }
            break;
            
          case 'disconnected':
            console.log('[WebRTC] Connection disconnected, waiting for recovery...');
            // Give it some time to recover before trying to reconnect
            setTimeout(() => {
              if (peerRef.current && 
                  peerRef.current.connectionState === 'disconnected' &&
                  !isFindingPartnerRef.current) {
                console.log('[WebRTC] Connection still disconnected, finding new partner...');
                isFindingPartnerRef.current = true;
                if (findNewPartnerRef.current) {
                  findNewPartnerRef.current();
                }
              }
            }, 3000);
            break;
        }
      };
      
      // Handle ICE connection state changes
      peer.oniceconnectionstatechange = () => {
        if (!peerRef.current) return;
        
        const state = peerRef.current.iceConnectionState;
        console.log('[WebRTC] ICE connection state:', state);
        
        switch (state) {
          case 'connected':
          case 'completed':
            console.log('[WebRTC] ICE connection established');
            isFindingPartnerRef.current = false;
            reconnectAttemptsRef.current = 0;
            break;
            
          case 'disconnected':
            console.warn('[WebRTC] ICE connection disconnected, waiting to recover...');
            // Give it some time to recover
            setTimeout(() => {
              if (peerRef.current && 
                  peerRef.current.iceConnectionState === 'disconnected' && 
                  !isFindingPartnerRef.current) {
                console.warn('[WebRTC] ICE connection still disconnected, reconnecting...');
                isFindingPartnerRef.current = true;
                if (findNewPartnerRef.current) {
                  findNewPartnerRef.current();
                }
              }
            }, 5000);
            break;
            
          case 'failed':
            console.error('[WebRTC] ICE connection failed, reconnecting...');
            if (findNewPartnerRef.current && !isFindingPartnerRef.current) {
              isFindingPartnerRef.current = true;
              findNewPartnerRef.current();
            }
            break;
            
          case 'closed':
            console.log('[WebRTC] ICE connection closed');
            isFindingPartnerRef.current = false;
            break;
        }
      };

      peer.ontrack = (event) => {
        console.log('[WebRTC] Received remote tracks:', event.streams);
        if (event.streams && event.streams[0]) {
          const newRemoteStream = new MediaStream(event.streams[0].getTracks());
          console.log('[WebRTC] Setting remote stream with', newRemoteStream.getTracks().length, 'tracks');
          
          // Only update if we have actual tracks
          if (newRemoteStream.getTracks().length > 0) {
            setRemoteStream(newRemoteStream);
            // Reset finding partner flag once we have tracks
            isFindingPartnerRef.current = false;
            reconnectAttemptsRef.current = 0;
          } else {
            console.warn('[WebRTC] Received empty track, ignoring');
          }
        }
      };

      // Add local tracks if available
      if (localStream) {
        console.log('[WebRTC] Adding local tracks to peer connection');
        localStream.getTracks().forEach(track => {
          try {
            if (!peer.getSenders().some(sender => sender.track === track)) {
              console.log(`[WebRTC] Adding local track: ${track.kind} (${track.id})`);
              peer.addTrack(track, localStream);
            } else {
              console.log(`[WebRTC] Track ${track.kind} (${track.id}) already added`);
            }
          } catch (error) {
            console.error(`[WebRTC] Error adding track ${track.kind} (${track.id}):`, error);
          }
        });
      } else {
        console.warn('[WebRTC] No local stream available when creating peer');
      }

      // Start the connection process
      createOffer();

      return peer;
    } catch (error) {
      console.error('[WebRTC] Error creating peer connection:', error);
      console.error('[WebRTC] ICE connection failed, reconnecting...');
      if (findNewPartnerRef.current && !isFindingPartnerRef.current) {
        isFindingPartnerRef.current = true;
        findNewPartnerRef.current();
      }
      return null;
    }
  }, [socket, localStream]);

  // Queue for ICE candidates received before remote description is set
  const pendingCandidates = useRef([]);

  const processPendingCandidates = useCallback(async () => {
    if (!peerRef.current) return;
    
    while (pendingCandidates.current.length > 0) {
      const { candidate, from } = pendingCandidates.current.shift();
      try {
        console.log('[WebRTC] Processing queued ICE candidate');
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[WebRTC] Error processing queued ICE candidate:', error);
      }
    }
  }, []);

  // Handle incoming WebRTC signaling messages
  const handleSignal = useCallback(async (data) => {
    if (!peerRef.current) {
      console.warn('[WebRTC] No peer connection when handling signal');
      return;
    }

    console.log(`[WebRTC] Handling signal type: ${data.type || 'unknown'}, from: ${data.from}`);

    try {
      switch (data.type) {
        case 'offer':
          console.log('[WebRTC] Received offer, current signaling state:', peerRef.current.signalingState);
          
          // Set remote description
          await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          console.log('[WebRTC] Set remote description with offer');
          
          // Create and set local description
          console.log('[WebRTC] Creating answer');
          const answer = await peerRef.current.createAnswer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          console.log('[WebRTC] Created answer:', answer.type);
          
          await peerRef.current.setLocalDescription(answer);
          console.log('[WebRTC] Set local description with answer');
          
          // Process any pending ICE candidates
          await processPendingCandidates();
          
          // Send the answer with the complete local description
          console.log('[WebRTC] Sending answer to', data.from);
          if (socket && socket.connected) {
            socket.emit('signal', { 
              to: data.from, 
              answer: peerRef.current.localDescription,
              type: 'answer'
            });
          } else {
            console.warn('[WebRTC] Socket not connected, cannot send answer');
          }
          break;
          
        case 'answer':
          console.log('[WebRTC] Received answer, current signaling state:', peerRef.current.signalingState);
          
          if (peerRef.current.signalingState !== 'stable') {
            console.log('[WebRTC] Setting remote description with answer');
            await peerRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            console.log('[WebRTC] Set remote description with answer');
            
            // Process any pending ICE candidates
            await processPendingCandidates();
          } else {
            console.log('[WebRTC] Ignoring answer in stable state');
          }
          break;
          
        case 'candidate':
          // Queue candidate if remote description not set yet
          if (!peerRef.current.remoteDescription) {
            console.log('[WebRTC] Queuing ICE candidate (waiting for remote description)');
            pendingCandidates.current.push({
              candidate: data.candidate,
              from: data.from
            });
          } else {
            console.log('[WebRTC] Adding ICE candidate');
            try {
              await peerRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
              console.log('[WebRTC] Successfully added ICE candidate');
            } catch (error) {
              if (!error.toString().includes('does not match')) {
                console.error('[WebRTC] Error adding ICE candidate:', error);
              }
            }
          }
          break;
          
        default:
          console.warn(`[WebRTC] Unknown signal type: ${data.type}`);
      }
    } catch (error) {
      console.error('[WebRTC] Error handling signal:', error);
    }
  }, [socket, processPendingCandidates]);
  const cleanupPeer = useCallback(() => {
    if (peerRef.current) {
      console.log('[WebRTC] Cleaning up peer connection');
      // Close all senders
      if (peerRef.current.getSenders) {
        peerRef.current.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
          }
        });
      }
      // Close the connection
      peerRef.current.close();
      peerRef.current = null;
      setPeerState('disconnected');
      // Don't clear the remote stream here to avoid UI flicker
      // The parent component will handle stream cleanup
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);



  return {
    peer: peerRef.current,
    remoteStream,
    peerState,
    createPeer,
    handleSignal,
    cleanupPeer: cleanup
  };
};

export default usePeer;
