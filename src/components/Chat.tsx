import React, { useState, useEffect, useRef, useContext } from 'react';
import { 
  MessageSquare, 
  Send, 
  Hash, 
  User, 
  Store, 
  Search, 
  ShieldAlert, 
  Megaphone, 
  Trash2, 
  Edit, 
  Check, 
  X,
  Plus,
  Compass,
  Paperclip,
  File,
  Download,
  Image,
  ChevronLeft,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Phone,
  Video,
  PhoneOff,
  Mic,
  MicOff,
  VideoOff,
  Volume2,
  VolumeX
} from 'lucide-react';
import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  updateDoc, 
  deleteDoc, 
  where,
  arrayUnion
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { AppContext } from '../App';
import { motion, AnimatePresence } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Chat Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ChatMessage {
  id: string;
  storeId: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  senderRole: string;
  message: string;
  timestamp: any;
  type: 'store' | 'broadcast' | 'direct';
  recipientId?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  attachmentData?: string;
  viewOnce?: boolean;
  opened?: boolean;
  openedBy?: string[];
  deletedFor?: string[];
}

interface ChatUser {
  uid: string;
  storeId: string;
  displayName: string;
  email: string;
  role: string;
}

interface ChatStore {
  id: string;
  name: string;
}

interface ChatCall {
  id: string;
  callerId: string;
  callerName: string;
  callerStoreId: string;
  receiverId: string;
  receiverName: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'accepted' | 'rejected' | 'ended';
  createdAt: any;
}

// Simple browser AudioContext synthesizer for telephony sounds
const playCallSound = (type: 'ringback' | 'incoming' | 'end') => {
  if (typeof window === 'undefined') return () => {};
  try {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return () => {};
    const audioCtx = new AudioCtxClass();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'ringback') {
      // Outgoing ringing: 440Hz sinus pulsed
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      osc.start();
      let state = true;
      const interval = setInterval(() => {
        state = !state;
        gainNode.gain.setValueAtTime(state ? 0.08 : 0, audioCtx.currentTime);
      }, 1200);
      return () => {
        clearInterval(interval);
        try { osc.stop(); audioCtx.close(); } catch(e){}
      };
    } else if (type === 'incoming') {
      // Incoming phone melody
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      gainNode.gain.setValueAtTime(0.12, audioCtx.currentTime);
      osc.start();
      let step = 0;
      const notes = [587.33, 659.25, 523.25, 392.00];
      const interval = setInterval(() => {
        step = (step + 1) % notes.length;
        osc.frequency.setValueAtTime(notes[step], audioCtx.currentTime);
        gainNode.gain.setValueAtTime(step % 2 === 0 ? 0.12 : 0.03, audioCtx.currentTime);
      }, 180);
      return () => {
        clearInterval(interval);
        try {
          osc.stop();
          audioCtx.close();
        } catch(e){}
      };
    } else if (type === 'end') {
      // End call sound: short slide down
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.start();
      setTimeout(() => {
        try { osc.stop(); audioCtx.close(); } catch(e){}
      }, 350);
      return () => {};
    }
  } catch(e) {
    console.warn("AudioContext ringtone playback failed", e);
  }
  return () => {};
};

export default function Chat() {
  const { userProfile, settings, language } = useContext(AppContext);
  const currentUser = auth.currentUser;
  const isSuperAdmin = ['anges.gildas@gmail.com', 'gildas@gmail.com'].includes((currentUser?.email || '').trim().toLowerCase());

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [stores, setStores] = useState<ChatStore[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selection states
  // We can select: Group channels, User Direct Messages, or Store General Chats (for superadmin)
  const [activeTab, setActiveTab] = useState<'store' | 'broadcast' | 'direct'>('store');
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'channels'>('chats');
  const [activeRecipient, setActiveRecipient] = useState<ChatUser | null>(null);
  const [activeStoreChat, setActiveStoreChat] = useState<ChatStore | null>(null);

  // Message compose states
  const [inputText, setInputText] = useState('');
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File loading/attachment states
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    type: string;
    size: number;
    base64: string;
  } | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; name: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState<ChatMessage | null>(null);

  // Audio & Video Call State
  const [incomingCall, setIncomingCall] = useState<ChatCall | null>(null);
  const [activeCall, setActiveCall] = useState<ChatCall | null>(null);
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callStatusMessage, setCallStatusMessage] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  // Initiate Call
  const handleInitiateCall = async (type: 'audio' | 'video') => {
    if (!currentUser || !activeRecipient) return;
    try {
      setCallStatusMessage("Appel en cours...");
      const callPayload = {
        callerId: currentUser.uid,
        callerName: userProfile?.displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'Utilisateur',
        callerStoreId: userProfile?.storeId || settings?.id || 'global',
        receiverId: activeRecipient.uid,
        receiverName: activeRecipient.displayName,
        type,
        status: 'ringing',
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, 'calls'), callPayload);
      setActiveCall({ id: docRef.id, ...callPayload } as ChatCall);
    } catch (err) {
      console.error("Error initiating call", err);
    }
  };

  // Accept Call
  const handleAcceptCall = async () => {
    if (!incomingCall) return;
    try {
      const docRef = doc(db, 'calls', incomingCall.id);
      await updateDoc(docRef, {
        status: 'accepted'
      });
      setActiveCall(incomingCall);
      setIncomingCall(null);
    } catch (err) {
      console.error("Error accepting call", err);
    }
  };

  // Reject Call
  const handleRejectCall = async () => {
    if (!incomingCall) return;
    try {
      const docRef = doc(db, 'calls', incomingCall.id);
      await updateDoc(docRef, {
        status: 'rejected'
      });
      setIncomingCall(null);
    } catch (err) {
      console.error("Error rejecting call", err);
    }
  };

  // End Call
  const handleEndCall = async () => {
    const callToClose = activeCall || incomingCall;
    if (!callToClose) return;
    try {
      const docRef = doc(db, 'calls', callToClose.id);
      await updateDoc(docRef, {
        status: 'ended'
      });
      // also delete it from storage
      await deleteDoc(docRef);
    } catch (err) {
      console.error("Error ending call", err);
    } finally {
      setActiveCall(null);
      setIncomingCall(null);
      setCallDuration(0);
      setCallStatusMessage(null);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
    }
  };

  // Listen for incoming calls for the current user
  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'calls'),
      where('receiverId', '==', currentUser.uid),
      where('status', '==', 'ringing')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0];
        setIncomingCall({ id: d.id, ...d.data() } as ChatCall);
      } else {
        setIncomingCall(null);
      }
    }, (err) => {
      console.error("Error querying incoming calls", err);
      handleFirestoreError(err, OperationType.LIST, 'calls');
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Listen to our active call document
  useEffect(() => {
    if (!activeCall?.id || !currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'calls', activeCall.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const updated = { id: snap.id, ...data } as ChatCall;
        
        if (updated.status === 'rejected') {
          setCallStatusMessage("Appel rejeté / Occupé");
          playCallSound('end');
          setTimeout(() => {
            setActiveCall(null);
            setCallStatusMessage(null);
          }, 2500);
        } else if (updated.status === 'ended') {
          playCallSound('end');
          setActiveCall(null);
          setCallDuration(0);
          setCallStatusMessage(null);
        } else {
          setActiveCall(updated);
        }
      } else {
        // Doc was deleted meaning call is finished
        setActiveCall(null);
        setCallDuration(0);
        setCallStatusMessage(null);
      }
    }, (err) => {
      console.error("Error observing active call", err);
    });
    return () => unsubscribe();
  }, [activeCall?.id, currentUser]);

  // Duration timer ticker
  useEffect(() => {
    if (activeCall?.status !== 'accepted') {
      setCallDuration(0);
      return;
    }
    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCall?.status]);

  // Track media options
  useEffect(() => {
    let streamOut: MediaStream | null = null;
    const getCam = async () => {
      if (activeCall?.status === 'accepted' && activeCall.type === 'video' && !isCameraOff) {
        try {
          streamOut = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          setLocalStream(streamOut);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = streamOut;
          }
        } catch (err) {
          console.warn("Camera hardware access denied:", err);
        }
      } else {
        if (localStream) {
          localStream.getTracks().forEach(t => t.stop());
          setLocalStream(null);
        }
      }
    };
    getCam();
    return () => {
      if (streamOut) {
        streamOut.getTracks().forEach(t => t.stop());
      }
    };
  }, [activeCall?.status, activeCall?.type, isCameraOff]);

  // Ringtone handlers
  useEffect(() => {
    let stopAudio: (() => void) | null = null;
    if (incomingCall) {
      stopAudio = playCallSound('incoming');
    }
    return () => {
      if (stopAudio) stopAudio();
    };
  }, [incomingCall?.id]);

  useEffect(() => {
    let stopAudio: (() => void) | null = null;
    if (activeCall && activeCall.status === 'ringing') {
      stopAudio = playCallSound('ringback');
    }
    return () => {
      if (stopAudio) stopAudio();
    };
  }, [activeCall?.id, activeCall?.status]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // File handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) { // 1 MB limit
      setErrorMessage("La taille du fichier dépasse la limite autorisée de 1 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile({
        name: file.name,
        type: file.type,
        size: file.size,
        base64: reader.result as string
      });
      setErrorMessage(null);
    };
    reader.onerror = () => {
      setErrorMessage("Erreur lors de la lecture du fichier.");
    };
    reader.readAsDataURL(file);
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
    
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      setErrorMessage("La taille du fichier dépasse la limite autorisée de 1 Mo.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedFile({
        name: file.name,
        type: file.type,
        size: file.size,
        base64: reader.result as string
      });
      setErrorMessage(null);
    };
    reader.onerror = () => {
      setErrorMessage("Erreur lors de l'importation du fichier.");
    };
    reader.readAsDataURL(file);
  };

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Read stores (if Super Admin)
  useEffect(() => {
    if (!isSuperAdmin) return;
    const q = query(collection(db, 'storeSettings'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || doc.id
      }));
      setStores(list);
    }, (err) => {
      console.error("Error reading stores settings", err);
    });
    return () => unsubscribe();
  }, [isSuperAdmin]);

  // Read users
  useEffect(() => {
    if (!currentUser) return;
    const storeIdToUse = userProfile?.storeId || settings?.id;
    if (!isSuperAdmin && !storeIdToUse) return;

    const unsubscribes: (() => void)[] = [];

    if (isSuperAdmin) {
      const q = query(collection(db, 'users'));
      const unsubscribe = onSnapshot(q, (snap) => {
        const list = snap.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            storeId: data.storeId || '',
            displayName: data.displayName || 'Utilisateur',
            email: data.email || '',
            role: data.role || 'cashier'
          } as ChatUser;
        });
        setUsers(list);
      }, (err) => {
        console.error("Error reading user profiles for superadmin:", err);
      });
      unsubscribes.push(unsubscribe);
    } else {
      let storeUsersList: ChatUser[] = [];
      let superAdminsList: ChatUser[] = [];

      const handleMergeUsers = () => {
        const seen = new Set<string>();
        const merged: ChatUser[] = [];
        [...storeUsersList, ...superAdminsList].forEach(u => {
          if (!seen.has(u.uid)) {
            seen.add(u.uid);
            merged.push(u);
          }
        });
        setUsers(merged);
      };

      const qStore = query(collection(db, 'users'), where('storeId', '==', storeIdToUse));
      const unsubStore = onSnapshot(qStore, (snap) => {
        storeUsersList = snap.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            storeId: data.storeId || '',
            displayName: data.displayName || 'Utilisateur',
            email: data.email || '',
            role: data.role || 'cashier'
          } as ChatUser;
        });
        handleMergeUsers();
      }, (err) => {
        console.error("Error reading store user profiles", err);
      });
      unsubscribes.push(unsubStore);

      // Only boutique admins (role === 'admin') can view/message super-admins
      if (userProfile?.role === 'admin') {
        const qSuper = query(collection(db, 'users'), where('role', '==', 'super-admin'));
        const unsubSuper = onSnapshot(qSuper, (snap) => {
          superAdminsList = snap.docs.map(doc => {
            const data = doc.data();
            return {
              uid: doc.id,
              storeId: 'global',
              displayName: data.displayName || 'Super Admin',
              email: data.email || '',
              role: 'super-admin'
            } as ChatUser;
          });
          
          // Ensure we have at least virtual entries in case query returns empty
          if (superAdminsList.length === 0) {
            superAdminsList = [
              {
                uid: 'superadmin_gildas',
                storeId: 'global',
                displayName: 'Gildas (Super Admin)',
                email: 'gildas@gmail.com',
                role: 'super-admin'
              },
              {
                uid: 'superadmin_anges',
                storeId: 'global',
                displayName: 'Anges Gildas (Super Admin)',
                email: 'anges.gildas@gmail.com',
                role: 'super-admin'
              }
            ];
          }
          handleMergeUsers();
        }, (err) => {
          console.warn("Could not query super admins, using fallback:", err);
          superAdminsList = [
            {
              uid: 'superadmin_gildas',
              storeId: 'global',
              displayName: 'Gildas (Super Admin)',
              email: 'gildas@gmail.com',
              role: 'super-admin'
            },
            {
              uid: 'superadmin_anges',
              storeId: 'global',
              displayName: 'Anges Gildas (Super Admin)',
              email: 'anges.gildas@gmail.com',
              role: 'super-admin'
            }
          ];
          handleMergeUsers();
        });
        unsubscribes.push(unsubSuper);
      }
    }

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [currentUser, userProfile?.storeId, userProfile?.role, settings?.id, isSuperAdmin]);

  // Subscribe to Chat messages in real time
  useEffect(() => {
    if (!currentUser) return;

    // Local store ID
    const storeIdToUse = userProfile?.storeId || settings?.id || 'none';

    // If not super admin and we don't have storeId yet, wait for it.
    if (!isSuperAdmin && storeIdToUse === 'none') {
      return;
    }

    const unsubscribes: (() => void)[] = [];

    if (isSuperAdmin) {
      // Super admin can get everything in one single query
      const q = query(collection(db, 'chatMessages'), orderBy('timestamp', 'asc'));
      const unsub = onSnapshot(q, (snap) => {
        const list = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ChatMessage));
        setMessages(list);
      }, (err) => {
        console.error("SuperAdmin subscription failed:", err);
        handleFirestoreError(err, OperationType.GET, 'chatMessages');
      });
      return () => unsub();
    } else {
      // Regular user: combine multiple restricted secure streams to comply with granular Security Rules
      let broadcastMsgs: ChatMessage[] = [];
      let storeMsgs: ChatMessage[] = [];
      let sentDMs: ChatMessage[] = [];
      let receivedDMs: ChatMessage[] = [];

      const handleUpdate = () => {
        const mergedMap: Record<string, ChatMessage> = {};
        [...broadcastMsgs, ...storeMsgs, ...sentDMs, ...receivedDMs].forEach(m => {
          mergedMap[m.id] = m;
        });
        const mergedList = Object.values(mergedMap);
        mergedList.sort((a, b) => {
          const tA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
          const tB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
          return tA - tB;
        });
        setMessages(mergedList);
      };

      // 1. Broadcast announcements
      const q1 = query(
        collection(db, 'chatMessages'),
        where('type', '==', 'broadcast')
      );
      unsubscribes.push(onSnapshot(q1, (snap) => {
        broadcastMsgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
        handleUpdate();
      }, (err) => {
        console.warn("Query1 Broadcast failed:", err);
      }));

      // 2. Active Store discussion channel
      const q2 = query(
        collection(db, 'chatMessages'),
        where('storeId', '==', storeIdToUse),
        where('type', '==', 'store')
      );
      unsubscribes.push(onSnapshot(q2, (snap) => {
        storeMsgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
        handleUpdate();
      }, (err) => {
        console.warn("Query2 StoreChat failed:", err);
      }));

      // 3. Sent Direct Messages
      const q3 = query(
        collection(db, 'chatMessages'),
        where('type', '==', 'direct'),
        where('senderId', '==', currentUser.uid)
      );
      unsubscribes.push(onSnapshot(q3, (snap) => {
        sentDMs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
        handleUpdate();
      }, (err) => {
        console.warn("Query3 Sent DMs failed:", err);
      }));

      // 4. Received Direct Messages
      const q4 = query(
        collection(db, 'chatMessages'),
        where('type', '==', 'direct'),
        where('recipientId', '==', currentUser.uid)
      );
      unsubscribes.push(onSnapshot(q4, (snap) => {
        receivedDMs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
        handleUpdate();
      }, (err) => {
        console.warn("Query4 Received DMs failed:", err);
      }));
    }

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [currentUser, isSuperAdmin, userProfile?.storeId, settings?.id]);

  // Get current store id to attach message to
  const localStoreId = userProfile?.storeId || settings?.id || 'none';

  // Filter messages based on active selection
  const filteredMessages = messages.filter(msg => {
    // Hide if message was deleted "pour moi" (deletedFor array contains current user's UID)
    if (msg.deletedFor && Array.isArray(msg.deletedFor) && currentUser && msg.deletedFor.includes(currentUser.uid)) {
      return false;
    }

    // 1. Broadcast channel
    if (activeTab === 'broadcast') {
      return msg.type === 'broadcast';
    }
    
    // 2. Direct message
    if (activeTab === 'direct' && activeRecipient) {
      return msg.type === 'direct' && (
        (msg.senderId === currentUser?.uid && msg.recipientId === activeRecipient.uid) ||
        (msg.senderId === activeRecipient.uid && msg.recipientId === currentUser?.uid)
      );
    }
    
    // 3. Store Group Chat (Général local store channel)
    if (activeTab === 'store') {
      if (isSuperAdmin && activeStoreChat) {
        // Superadmin viewing specific store's general channel
        return msg.type === 'store' && msg.storeId === activeStoreChat.id;
      }
      // General channel of my own store
      return msg.type === 'store' && msg.storeId === localStoreId;
    }

    return false;
  });

  // Users relevant to the view
  const myStoreUsers = users.filter(u => {
    if (u.uid === currentUser?.uid) return false; // hide myself
    if (isSuperAdmin) return true; // super admin can DM anyone
    
    // Is target super admin?
    const isTargetSuperAdmin = u.email === 'gildas@gmail.com' || u.email === 'anges.gildas@gmail.com' || u.role === 'super-admin' || u.storeId === 'global';
    if (isTargetSuperAdmin) {
      // Only boutique admins (role === 'admin') can see/message the super-admin
      return userProfile?.role === 'admin';
    }
    
    return u.storeId === localStoreId; // normal users can only DM their teammates
  });

  // Handlers
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || (!inputText.trim() && !selectedFile)) return;

    setErrorMessage(null);
    try {
      const payload: any = {
        senderId: currentUser.uid,
        senderName: userProfile?.displayName || currentUser.displayName || 'Admin',
        senderEmail: currentUser.email || '',
        senderRole: isSuperAdmin ? 'super-admin' : (userProfile?.role || 'cashier'),
        message: inputText.trim() || `Fichier envoyé : ${selectedFile?.name || ''}`,
        timestamp: serverTimestamp(),
        type: activeTab,
      };

      if (selectedFile) {
        payload.attachmentName = selectedFile.name;
        payload.attachmentType = selectedFile.type;
        payload.attachmentSize = selectedFile.size;
        payload.attachmentData = selectedFile.base64;
      }

      if (isViewOnce) {
        payload.viewOnce = true;
        payload.opened = false;
        payload.openedBy = [];
      }

      if (activeTab === 'broadcast') {
        payload.storeId = 'broadcast';
      } else if (activeTab === 'direct') {
        if (!activeRecipient) return;
        
        // Prevent non-admin users from messaging super admins
        const isTargetSuperAdmin = activeRecipient.email === 'gildas@gmail.com' || activeRecipient.email === 'anges.gildas@gmail.com' || activeRecipient.role === 'super-admin' || activeRecipient.storeId === 'global';
        if (isTargetSuperAdmin && userProfile?.role !== 'admin' && !isSuperAdmin) {
          setErrorMessage("Seul l'administrateur de la boutique est autorisé à envoyer des messages au Super Administrateur.");
          return;
        }

        payload.storeId = localStoreId;
        payload.recipientId = activeRecipient.uid;
      } else {
        // 'store' general channel
        payload.storeId = isSuperAdmin && activeStoreChat ? activeStoreChat.id : localStoreId;
      }

      await addDoc(collection(db, 'chatMessages'), payload);
      setInputText('');
      setSelectedFile(null);
      setIsViewOnce(false);
    } catch (err: any) {
      console.error("Error creating chat message", err);
      const errMsg = err?.message || "";
      if (selectedFile && (selectedFile.size > 1024 * 1024 || errMsg.includes("size") || errMsg.includes("exceeds"))) {
        setErrorMessage("Le fichier joint est trop volumineux pour être transmis directement dans le chat (le stockage maximum autorisé est de 1 Mo). Veuillez utiliser un fichier plus léger.");
      } else {
        setErrorMessage("Impossible d'envoyer le message. Veuillez vérifier votre connexion ou si le fichier ne dépasse pas la limite de 1 Mo.");
      }
    }
  };

  const handleUpdateMessage = async (msgId: string) => {
    if (!editText.trim()) return;
    try {
      const docRef = doc(db, 'chatMessages', msgId);
      await updateDoc(docRef, {
        message: editText.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingMessageId(null);
      setEditText('');
    } catch (err) {
      console.error("Error updating message", err);
    }
  };

  const handleDeleteForMe = async (msgId: string) => {
    if (!currentUser) return;
    try {
      const docRef = doc(db, 'chatMessages', msgId);
      await updateDoc(docRef, {
        deletedFor: arrayUnion(currentUser.uid)
      });
      setDeletingMessage(null);
    } catch (err) {
      console.error("Error hiding message for me", err);
    }
  };

  const handleDeleteForEveryone = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'chatMessages', msgId));
      setDeletingMessage(null);
    } catch (err) {
      console.error("Error deleting message for everyone", err);
    }
  };

  const handleClearConversation = async () => {
    if (!currentUser || filteredMessages.length === 0) return;
    if (!window.confirm("Voulez-vous vraiment vider cette conversation ? Tous les messages actuels seront masqués de votre côté, sans affecter l'affichage pour vos correspondants.")) return;
    try {
      const promises = filteredMessages.map(msg => 
        updateDoc(doc(db, 'chatMessages', msg.id), {
          deletedFor: arrayUnion(currentUser.uid)
        })
      );
      await Promise.all(promises);
    } catch (err) {
      console.error("Error clearing conversation", err);
    }
  };

  const hasOpenedViewOnce = (msg: ChatMessage) => {
    if (!currentUser) return false;
    if (msg.senderId === currentUser.uid) return false;
    if (msg.type === 'direct') {
      return msg.opened === true;
    }
    return msg.openedBy && Array.isArray(msg.openedBy) && msg.openedBy.includes(currentUser.uid);
  };

  const handleOpenViewOnce = async (msg: ChatMessage) => {
    if (!currentUser) return;
    try {
      const docRef = doc(db, 'chatMessages', msg.id);
      const updates: any = {};
      if (msg.type === 'direct') {
        updates.opened = true;
      }
      updates.openedBy = arrayUnion(currentUser.uid);
      await updateDoc(docRef, updates);

      // Trigger actual fullscreen preview or download once
      if (msg.attachmentData) {
        if (msg.attachmentType?.startsWith('image/')) {
          setFullscreenImage({ src: msg.attachmentData, name: msg.attachmentName || 'Image' });
        } else {
          const link = document.createElement('a');
          link.href = msg.attachmentData;
          link.download = msg.attachmentName || 'fichier';
          link.click();
        }
      }
    } catch (err) {
      console.error("Error opening view once message", err);
    }
  };

  // Helper to resolve role badges
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super-admin':
        return 'bg-gradient-to-r from-red-500 to-rose-600 text-white border-red-200';
      case 'admin':
        return 'bg-orange-500 text-white border-orange-200';
      case 'manager':
        return 'bg-[#151619] text-orange-400 border-gray-700';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  // Switch tab trigger helpers
  const selectStoreGeneral = () => {
    setActiveTab('store');
    setActiveRecipient(null);
    setShowMobileSidebar(false);
  };

  const selectBroadcast = () => {
    setActiveTab('broadcast');
    setActiveRecipient(null);
    setActiveStoreChat(null);
    setShowMobileSidebar(false);
  };

  const selectDirectMessage = (user: ChatUser) => {
    setActiveTab('direct');
    setActiveRecipient(user);
    setActiveStoreChat(null);
    setShowMobileSidebar(false);
  };

  return (
    <div id="integrated-chat-system" className="bg-white border text-normal-gray border-slate-200 rounded-2xl md:rounded-[32px] overflow-hidden flex h-[calc(100vh-8rem)] md:h-[calc(100vh-12rem)] shadow-2xl relative">
      
      {/* LEFT SIDEBAR: Channels & Direct Messages (WhatsApp Design Layout) */}
      <div className={`w-full lg:w-85 border-r border-slate-200 bg-white flex flex-col shrink-0 h-full ${showMobileSidebar ? 'flex' : 'hidden lg:flex'}`}>
        
        {/* Sidebar Header */}
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-xs ring-4 ring-orange-500/10">
                {currentUser?.email?.slice(0, 2).toUpperCase() || "MA"}
              </div>
              <div>
                <h2 className="text-xs font-black text-slate-900 uppercase tracking-widest">Messagerie Store</h2>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[9px] font-extrabold text-[#22c55e] uppercase">En Ligne</span>
                </div>
              </div>
            </div>
            {isSuperAdmin && (
              <span className="text-[8px] bg-rose-50 border border-rose-100 font-black px-1.5 py-0.5 rounded text-rose-600 uppercase tracking-wider">
                SUPER ADMIN
              </span>
            )}
          </div>
          
          <div className="relative flex items-center">
            <Search className="absolute left-3 text-slate-400 pointer-events-none" size={13} strokeWidth={2.5} />
            <input 
              type="text"
              placeholder="Rechercher des membres ou salons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.3rem' }}
              className="w-full text-xs pr-3 py-2 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-800 outline-none focus:bg-white focus:border-orange-500 transition-all font-sans"
            />
          </div>
        </div>

        {/* WhatsApp-style Sidebar Filter Tabs */}
        <div className="flex gap-1.5 px-5 pb-3.5 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setSidebarTab('chats')}
            className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-center transition-all ${
              sidebarTab === 'chats'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            Discussions DMs
          </button>
          <button
            type="button"
            onClick={() => setSidebarTab('channels')}
            className={`flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-center transition-all ${
              sidebarTab === 'channels'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            Groupes & Canaux
          </button>
        </div>

        {/* Sidebar Scrollable Sections */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          
          {sidebarTab === 'channels' ? (
            <div className="space-y-4">
              {/* Public Channels Section */}
              <div>
                <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-widest px-2.5 mb-2">Canaux Généraux</h3>
                <div className="space-y-1">
                  {/* General Local Chat button */}
                  <button 
                    onClick={selectStoreGeneral}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-all ${
                      activeTab === 'store' && !activeStoreChat ? 'bg-orange-500 text-white font-extrabold shadow-lg shadow-orange-500/10' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 text-xs">
                      <div className={`p-1.5 rounded-xl shrink-0 ${activeTab === 'store' && !activeStoreChat ? 'bg-white/20 text-white' : 'bg-slate-50 border text-slate-500'}`}>
                        <Hash size={13} />
                      </div>
                      <div className="text-left">
                        <p className="font-extrabold text-[11px] leading-tight">Discussion Générale</p>
                        <p className={`text-[8.5px] font-medium leading-none mt-0.5 ${activeTab === 'store' && !activeStoreChat ? 'text-white/80' : 'text-slate-400'}`}>Salon de votre boutique</p>
                      </div>
                    </div>
                    {!isSuperAdmin && (
                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0 ${
                        activeTab === 'store' && !activeStoreChat ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {settings?.name || 'Local'}
                      </span>
                    )}
                  </button>

                  {/* Broadcast Announcements button */}
                  <button 
                    onClick={selectBroadcast}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-2xl transition-all ${
                      activeTab === 'broadcast' ? 'bg-orange-500 text-white font-extrabold shadow-lg shadow-orange-500/10' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-bold'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 text-xs">
                      <div className={`p-1.5 rounded-xl shrink-0 ${activeTab === 'broadcast' ? 'bg-white/20 text-white' : 'bg-slate-50 border text-slate-500'}`}>
                        <Megaphone size={13} />
                      </div>
                      <div className="text-left">
                        <p className="font-extrabold text-[11px] leading-tight font-sans">Annonces Système</p>
                        <p className={`text-[8.5px] font-medium leading-none mt-0.5 ${activeTab === 'broadcast' ? 'text-white/80' : 'text-slate-400'}`}>Chaîne d'information globale</p>
                      </div>
                    </div>
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                      activeTab === 'broadcast' ? 'bg-white/20 text-white' : 'bg-orange-50 text-orange-600 border border-orange-100'
                    }`}>
                      MARKET PRO
                    </span>
                  </button>
                </div>
              </div>

              {/* Active Super Admin Store Rooms (Super Admin only) */}
              {isSuperAdmin && (
                <div>
                  <div className="flex items-center gap-1.5 justify-between px-2.5 mb-2">
                    <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                      Fils Discussions Boutiques
                    </h3>
                    <Compass size={11} className="text-orange-500" />
                  </div>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {stores.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic px-3">Aucune boutique disponible</p>
                    ) : (
                      stores.map(st => {
                        const isSelected = activeTab === 'store' && activeStoreChat?.id === st.id;
                        return (
                          <button
                            key={`stores-chat-channel-${st.id}`}
                            onClick={() => {
                              setActiveTab('store');
                              setActiveStoreChat(st);
                              setActiveRecipient(null);
                              setShowMobileSidebar(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs transition-all ${
                              isSelected ? 'bg-slate-900 text-white font-black' : 'text-slate-600 hover:bg-slate-50 font-bold'
                            }`}
                          >
                            <Store size={12} className={isSelected ? 'text-orange-400' : 'text-slate-400'} />
                            <span className="truncate flex-1 font-bold text-[11px]">{st.name}</span>
                            <span className="text-[7px] text-slate-400 font-mono scale-90 shrink-0">GO</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Chats Directs / Members List tab */
            <div>
              <h3 className="text-[9px] font-black uppercase text-slate-400 tracking-widest px-2.5 mb-2">Membres & Collaborateurs</h3>
              <div className="space-y-1">
                {myStoreUsers
                  .filter(u => u.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(u => {
                    const isSelected = activeTab === 'direct' && activeRecipient?.uid === u.uid;
                    return (
                      <button
                        key={`user-dm-${u.uid}`}
                        onClick={() => selectDirectMessage(u)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-left text-xs transition-all ${
                          isSelected ? 'bg-slate-900 text-white font-bold' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 border uppercase font-mono ${
                          isSelected ? 'bg-orange-500 border-orange-500/10 text-white' : 'bg-orange-50 text-orange-600 border-orange-100'
                        }`}>
                          {u.displayName.charAt(0)}
                        </div>
                        <div className="flex-1 truncate">
                          <p className="font-extrabold truncate text-[11px] leading-tight">{u.displayName}</p>
                          <p className={`text-[8.5px] truncate leading-none capitalize mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-400 font-medium'}`}>{u.role}</p>
                        </div>
                        {isSuperAdmin && (
                          <span className={`text-[7px] font-mono px-1 py-0.2 border rounded shrink-0 ${isSelected ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-50 text-gray-400'}`}>
                            {u.storeId.slice(-4)}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* RIGHT MESSAGE PANE */}
      <div className={`flex-1 flex flex-col h-full bg-[#f8fafc] relative ${!showMobileSidebar ? 'flex' : 'hidden lg:flex'}`}>
        
        {/* Chat Pane Header (WhatsApp-web Style) */}
        <div className="h-20 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back button for mobile */}
            <button
              type="button"
              onClick={() => setShowMobileSidebar(true)}
              className="lg:hidden p-2 -ml-1 rounded-xl text-slate-500 hover:bg-slate-100 active:scale-95 transition-all shrink-0"
              title="Retour aux conversations"
            >
              <ChevronLeft size={20} />
            </button>

            {activeTab === 'broadcast' ? (
              <>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-red-500 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Megaphone size={16} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-900 text-xs md:text-sm leading-tight truncate">
                    Annonces Système
                  </h3>
                  <p className="text-[9px] md:text-[10px] font-bold text-orange-500 truncate flex items-center gap-1 mt-0.5">
                    <span className="w-1 h-1 rounded-full bg-orange-500"></span> Diffusion MARKET PRO
                  </p>
                </div>
              </>
            ) : activeTab === 'direct' && activeRecipient ? (
              <>
                <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100 font-black shrink-0 text-xs md:text-sm">
                  {activeRecipient.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-900 text-[13px] md:text-sm leading-tight truncate">
                    {activeRecipient.displayName}
                  </h3>
                  <p className="text-[9px] md:text-[10px] text-emerald-500 font-extrabold capitalize leading-none truncate mt-0.5 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-[#22c55e]"></span> En ligne • Direct
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-slate-50 border text-slate-700 flex items-center justify-center shrink-0">
                  <Store size={15} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-extrabold text-slate-900 text-xs md:text-sm leading-tight truncate">
                    Discussion Générale
                  </h3>
                  <p className="text-[9px] md:text-[10px] text-slate-400 font-bold truncate mt-0.5">
                    Canal: <span className="text-orange-500">{activeStoreChat ? activeStoreChat.name : (settings?.name || "Boutique")}</span>
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {isSuperAdmin && (
              <span className="px-2 py-1 bg-rose-50 border border-rose-100 text-rose-600 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm hidden sm:inline-flex">
                <ShieldAlert size={10} /> Mode Super Admin
              </span>
            )}

            {/* Calling Tools for Direct user DMs */}
            {activeTab === 'direct' && activeRecipient && (
              <div className="flex items-center gap-1.5 border-r border-slate-150 pr-2">
                <button
                  type="button"
                  onClick={() => handleInitiateCall('audio')}
                  className="p-2 bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-600 border border-slate-100 hover:border-orange-100 rounded-xl transition-all active:scale-95"
                  title="Lancer l'appel audio"
                >
                  <Phone size={14} className="stroke-[2.5]" />
                </button>
                <button
                  type="button"
                  onClick={() => handleInitiateCall('video')}
                  className="p-2 bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-600 border border-slate-100 hover:border-orange-100 rounded-xl transition-all active:scale-95"
                  title="Lancer l'appel vidéo"
                >
                  <Video size={14} className="stroke-[2.5]" />
                </button>
              </div>
            )}

            {filteredMessages.length > 0 && (
              <button
                type="button"
                onClick={handleClearConversation}
                className="p-2 bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-500 border border-slate-100 hover:border-red-100 rounded-xl text-[10px] md:text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
                title="Vider l'historique de cette conversation"
              >
                <Trash2 size={13} className="shrink-0" />
                <span className="hidden sm:inline">Vider</span>
              </button>
            )}
          </div>
        </div>

        {/* Messaging Area */}
        <div 
          className={`flex-1 overflow-y-auto p-3 md:p-6 space-y-3.5 md:space-y-4 relative transition-all ${isDragging ? 'bg-orange-50/40 opacity-80' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 bg-orange-500/10 backdrop-blur-[2.5px] flex flex-col items-center justify-center border-4 border-dashed border-orange-400 rounded-3xl z-10 p-6 pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-orange-500 shadow-xl mb-3 animate-bounce">
                <Paperclip size={24} />
              </div>
              <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Glissez vos fichiers ici</p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">Limite autorisée : 1 Mo par fichier</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {filteredMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-60 px-6">
                <MessageSquare size={36} className="text-slate-350 mb-3" />
                <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Aucun message pour l'instant</p>
                <p className="text-[10px] text-slate-400 mt-1 max-w-[280px] font-medium leading-normal">
                  {activeTab === 'broadcast' 
                    ? "Les annonces publiées par le Super Administrateur s'afficheront ici."
                    : "Entamez la conversation en rédigeant votre premier message ou en y glissant un fichier."}
                </p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isMine = msg.senderId === currentUser?.uid;
                const formattedTime = msg.timestamp?.toDate()?.toLocaleTimeString('fr-FR', {
                  hour: '2-digit', minute: '2-digit'
                }) || 'Envoi...';

                const formattedDate = msg.timestamp?.toDate()?.toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'short'
                });

                return (
                  <motion.div 
                    key={`chat-msg-${msg.id}`}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex items-start gap-1.5 md:gap-3.5 max-w-[95%] sm:max-w-[85%] md:max-w-[80%] ${isMine ? 'ml-auto flex-row-reverse' : ''}`}
                  >
                    {/* User initial avatar */}
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-xl shrink-0 font-bold flex items-center justify-center text-white bg-slate-400 shadow-md transform text-[10px] md:text-[11px] uppercase tracking-wider">
                      {msg.senderName.slice(0, 2)}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      {/* Message Meta Info */}
                      <div className={`flex flex-wrap items-center gap-1.5 ${isMine ? 'justify-end md:justify-items-end' : ''}`}>
                        <span className="text-xs font-black text-slate-800 max-w-[120px] truncate">{msg.senderName}</span>
                        <span className={`text-[7px] font-black leading-none uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${getRoleBadge(msg.senderRole)}`}>
                          {msg.senderRole === 'super-admin' ? 'Super Admin' : msg.senderRole}
                        </span>
                        <span className="text-[8px] text-slate-400 font-mono shrink-0">{formattedDate ? `${formattedDate}, ` : ''}{formattedTime}</span>
                      </div>

                      {/* Msg text bubble */}
                      <div className={`p-3 md:p-4 rounded-2xl md:rounded-3xl text-xs relative group border shadow-sm ${
                        isMine 
                          ? 'bg-orange-500 text-white border-orange-500/10 rounded-tr-none' 
                          : 'bg-white text-slate-800 border-slate-200/80 rounded-tl-none'
                      }`}>
                        {editingMessageId === msg.id ? (
                          <div className="space-y-2 min-w-[200px]">
                            <textarea 
                              className="w-full text-xs p-2 rounded-xl bg-slate-50 border outline-none text-slate-900 border-slate-300 font-sans focus:border-orange-400 font-medium"
                              value={editText}
                              onChange={(e) => setEditText(e.target.value)}
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button 
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditText('');
                                }}
                                className="px-2 py-1 text-[8px] bg-slate-100 hover:bg-slate-200 rounded font-black text-slate-600 uppercase"
                              >
                                Annuler
                              </button>
                              <button 
                                onClick={() => handleUpdateMessage(msg.id)}
                                className="px-2 py-1 text-[8px] bg-orange-600 hover:bg-orange-700 text-white rounded font-black uppercase"
                              >
                                Sauver
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.viewOnce ? (
                              isMine ? (
                                <div className="flex flex-col gap-1 select-none font-sans min-w-[150px]">
                                  <div className="flex items-center gap-1.5 text-[9px] uppercase font-black tracking-widest text-[#fed7aa]">
                                    <Lock size={12} className="shrink-0 animate-pulse text-rose-200" /> Média à vue unique
                                  </div>
                                  <p className="text-[10px] italic font-bold text-white/95 leading-tight">
                                    {msg.type === 'direct' 
                                      ? (msg.opened ? "👁️ Ouvert par le destinataire" : "🔒 Envoyé en vue unique (Non ouvert)")
                                      : `🔒 Envoyé en vue unique (Lu par ${msg.openedBy?.length || 0} personne(s))`
                                    }
                                  </p>
                                </div>
                              ) : (
                                hasOpenedViewOnce(msg) ? (
                                  <div className="flex items-center gap-1.5 p-1 text-slate-400 select-none font-sans">
                                    <EyeOff size={12} className="shrink-0 text-slate-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Vue unique — Déjà ouvert</span>
                                  </div>
                                ) : (
                                  <div className="space-y-2 min-w-[200px] font-sans">
                                    <div className="flex items-center gap-2.5 p-2 bg-rose-50 border border-rose-100 rounded-xl text-rose-800">
                                      <Lock size={14} className="animate-pulse shrink-0 text-rose-500" />
                                      <div className="min-w-0">
                                        <p className="text-[9px] font-black uppercase tracking-wider leading-none">Média en vue unique</p>
                                        <p className="text-[8px] text-rose-500 mt-1 leading-tight font-bold">S'autodétruira après lecture.</p>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleOpenViewOnce(msg)}
                                      className="w-full py-1.5 bg-rose-500 hover:bg-rose-650 active:scale-95 text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 shadow-sm transition-all"
                                    >
                                      <Eye size={12} /> Dévoiler le contenu
                                    </button>
                                  </div>
                                )
                              )
                            ) : (
                              <>
                                {/* Attachment rendering */}
                                {msg.attachmentData && msg.attachmentType?.startsWith('image/') && (
                                  <div className="mb-2.5 rounded-2xl overflow-hidden border border-slate-250/50 max-w-[280px]">
                                    <img 
                                      src={msg.attachmentData} 
                                      alt={msg.attachmentName || 'Attachment'} 
                                      className="max-h-56 w-full object-cover cursor-pointer hover:opacity-90 transition-opacity" 
                                      onClick={() => setFullscreenImage({ src: msg.attachmentData!, name: msg.attachmentName || 'Image' })}
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                )}

                                {msg.attachmentData && !msg.attachmentType?.startsWith('image/') && (
                                  <div className={`mb-2.5 p-3 rounded-2xl flex items-center justify-between gap-3 border ${
                                    isMine 
                                      ? 'bg-[#c2410c] border-orange-400/20 text-white' 
                                      : 'bg-slate-50 border-slate-200 text-slate-800'
                                  }`}>
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      <div className={`p-2.5 rounded-xl shrink-0 ${isMine ? 'bg-[#ea580c] text-white' : 'bg-slate-200 text-slate-600'}`}>
                                        <File size={16} />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="font-extrabold text-[11px] truncate leading-tight">{msg.attachmentName}</p>
                                        <p className={`text-[9px] leading-tight mt-0.5 ${isMine ? 'text-orange-200' : 'text-slate-400'}`}>
                                          {msg.attachmentSize ? `${(msg.attachmentSize / 1024).toFixed(1)} KB` : 'Fichier'}
                                        </p>
                                      </div>
                                    </div>
                                    
                                    <a 
                                      href={msg.attachmentData}
                                      download={msg.attachmentName || 'download'}
                                      className={`p-2 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${
                                        isMine 
                                          ? 'bg-transparent text-white border-white/20 hover:bg-white/10' 
                                          : 'bg-white text-slate-700 border-slate-250 hover:bg-slate-55'
                                      }`}
                                      title="Télécharger"
                                    >
                                      <Download size={13} />
                                    </a>
                                  </div>
                                )}

                                {(!msg.message.startsWith('Fichier envoyé :') || !msg.attachmentData) && (
                                  <p className="whitespace-pre-wrap font-medium leading-relaxed pb-1">{msg.message}</p>
                                )}
                                <div className="flex items-center justify-end gap-1 select-none mt-1 leading-none">
                                  <span className={`text-[8px] font-mono ${isMine ? 'text-orange-150/90' : 'text-slate-400'}`}>
                                    {formattedTime}
                                  </span>
                                  {isMine && (
                                    <span className="text-[9px] text-orange-200 font-bold tracking-tighter" title="Reçu et lu">
                                      ✓✓
                                    </span>
                                  )}
                                </div>
                              </>
                            )}
                            
                            {/* Message actions (Edit / Delete) */}
                            <div className={`absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-all flex gap-1 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded-full border border-slate-200 shadow-sm ${
                              isMine ? '-translate-x-3' : 'translate-x-3'
                            }`}>
                              {isMine && (
                                <button 
                                  onClick={() => {
                                    setEditingMessageId(msg.id);
                                    setEditText(msg.message);
                                  }}
                                  className="p-1 hover:text-orange-500 text-slate-400 transition-colors"
                                  title="Modifier"
                                >
                                  <Edit size={10} />
                                </button>
                              )}
                              <button 
                                onClick={() => setDeletingMessage(msg)}
                                className="p-1 hover:text-red-500 text-slate-400 transition-colors"
                                title="Supprimer"
                              >
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer Panel */}
        <div className="p-3 md:p-6 bg-white border-t border-slate-200 shrink-0">
          {activeTab === 'broadcast' && !isSuperAdmin ? (
            <div className="text-center py-2.5 bg-orange-50 border border-orange-100 rounded-2xl text-[9px] font-black uppercase tracking-widest text-orange-600">
              🔒 Seul le Super Administrateur peut poster des messages globaux.
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="space-y-2">
              {setSelectedFile && selectedFile && (
                <div className="flex items-center justify-between p-2.5 md:p-3.5 bg-orange-50/50 border border-orange-100 rounded-xl md:rounded-2xl mb-2 text-xs">
                  <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
                    {selectedFile.type.startsWith('image/') ? (
                      <img 
                        src={selectedFile.base64} 
                        alt="Preview" 
                        className="w-8 h-8 md:w-10 md:h-10 object-cover rounded-lg md:rounded-xl border border-orange-200/50 shrink-0" 
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 md:w-10 md:h-10 bg-slate-100 border border-slate-200 flex items-center justify-center rounded-lg md:rounded-xl text-slate-500 shrink-0">
                        <File size={14} className="md:size-[16px]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-extrabold text-slate-800 truncate text-[10px] md:text-[11px] max-w-[150px] md:max-w-[200px]">{selectedFile.name}</p>
                      <p className="text-[8px] md:text-[9px] text-slate-450">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setSelectedFile(null)}
                    className="p-1 hover:bg-slate-205 rounded-full text-slate-500 hover:text-slate-700 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <div className="flex gap-2 md:gap-3 items-center">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-all active:scale-95 shrink-0 shadow-sm"
                  title="Ajouter un fichier (Tous types)"
                >
                  <Paperclip size={15} className="md:size-[16px]" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsViewOnce(!isViewOnce)}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center transition-all active:scale-95 shrink-0 shadow-sm border ${
                    isViewOnce 
                      ? 'bg-rose-500 text-white border-rose-500 hover:bg-rose-600' 
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border-slate-200'
                  }`}
                  title={isViewOnce ? "Envoi en vue unique : Activé 🔒" : "Activer l'envoi en vue unique (Vue unique) 👁️"}
                >
                  {isViewOnce ? <Lock size={15} className="md:size-[16px] animate-pulse" /> : <Eye size={15} className="md:size-[16px]" />}
                </button>
                
                <input 
                  type="text"
                  placeholder="Rédigez votre message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 px-3 py-2.5 md:px-4.5 md:py-3.5 bg-slate-50 border border-slate-200 rounded-xl md:rounded-2xl text-[11px] md:text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-orange-500 transition-all font-sans"
                />
                <button 
                  type="submit"
                  disabled={!inputText.trim() && !selectedFile}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center transition-all shadow-md shrink-0 ${
                    (inputText.trim() || selectedFile) 
                      ? 'bg-orange-500 hover:bg-orange-600 active:scale-95 text-white' 
                      : 'bg-slate-100 text-slate-450 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <Send size={15} />
                </button>
              </div>
              
              {isViewOnce && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-[9px] font-black uppercase tracking-widest w-fit animate-pulse">
                  <Lock size={10} /> Mode Vue Unique Activé : Ce message s’autodétruira après lecture
                </div>
              )}

              {errorMessage && (
                <p className="text-[10px] font-bold text-red-500 text-left mt-1 animate-pulse">● {errorMessage}</p>
              )}
            </form>
          )}
        </div>

      </div>

      {/* FULLSCREEN IMAGE LIGHTBOX MODAL */}
      <AnimatePresence>
        {fullscreenImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 z-50 pointer-events-auto"
            onClick={() => setFullscreenImage(null)}
          >
            <button 
              className="absolute top-6 right-6 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-transform active:scale-95 shadow-lg"
              onClick={() => setFullscreenImage(null)}
            >
              <X size={20} />
            </button>

            <motion.div 
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="max-w-4xl max-h-[80vh] flex flex-col items-center gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={fullscreenImage.src} 
                alt={fullscreenImage.name} 
                className="max-w-full max-h-[72vh] rounded-2xl shadow-2xl object-contain border border-white/10" 
                referrerPolicy="no-referrer"
              />
              <div className="flex items-center gap-4">
                <span className="text-white text-xs font-black bg-black/40 px-4 py-2 rounded-xl backdrop-blur border border-white/10 shrink max-w-[300px] truncate">
                  {fullscreenImage.name}
                </span>
                <a 
                  href={fullscreenImage.src} 
                  download={fullscreenImage.name}
                  className="bg-orange-500 hover:bg-orange-600 font-extrabold text-xs text-white px-5 py-2 rounded-xl shadow-lg flex items-center gap-2 transition"
                >
                  <Download size={14} /> Télécharger
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}

        {deletingMessage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 pointer-events-auto"
            onClick={() => setDeletingMessage(null)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4 text-slate-800">
                <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-650 flex items-center justify-center">
                  <Trash2 size={18} className="animate-bounce text-red-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm md:text-base leading-tight uppercase tracking-wider">Supprimer le message</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-bold">Choisissez vos options de suppression</p>
                </div>
              </div>

              <div className="space-y-2.5 mb-6">
                <button
                  type="button"
                  onClick={() => handleDeleteForMe(deletingMessage.id)}
                  className="w-full py-3 px-4 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-2xl text-xs font-bold text-left flex items-center gap-3 transition-all"
                >
                  <EyeOff size={15} className="text-slate-450 shrink-0" />
                  <div>
                    <p className="font-extrabold leading-none">Supprimer pour moi</p>
                    <p className="text-[9px] text-slate-400 mt-0.5 leading-tight font-medium">Masque ce message de votre historique local.</p>
                  </div>
                </button>

                {(deletingMessage.senderId === currentUser?.uid || isSuperAdmin) && (
                  <button
                    type="button"
                    onClick={() => handleDeleteForEveryone(deletingMessage.id)}
                    className="w-full py-3 px-4 bg-red-50 hover:bg-red-100 hover:border-red-200 text-red-600 hover:text-red-700 border border-red-100 rounded-2xl text-xs font-bold text-left flex items-center gap-3 transition-all"
                  >
                    <Trash2 size={15} className="shrink-0 text-red-500" />
                    <div>
                      <p className="font-extrabold leading-none font-bold">Supprimer pour tous</p>
                      <p className="text-[9px] text-red-400 mt-0.5 leading-tight font-medium">Supprime définitivement de la base pour tous.</p>
                    </div>
                  </button>
                )}
              </div>

              <div className="flex gap-2.5 justify-end">
                <button
                  type="button"
                  onClick={() => setDeletingMessage(null)}
                  className="px-4 py-2 text-xs font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl transition-all"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* INCOMING REGISTER RINGING MODAL */}
        {incomingCall && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6 z-[60]"
          >
            <div className="text-center max-w-sm w-full bg-white/10 p-8 rounded-[32px] border border-white/10 backdrop-blur-lg shadow-2xl flex flex-col items-center gap-6">
              {/* Dynamic pulse circle */}
              <div className="relative flex items-center justify-center w-24 h-24">
                <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500/40 animate-ping opacity-75"></span>
                <span className="absolute inline-flex h-[80%] w-[80%] rounded-full bg-orange-500/30 animate-pulse"></span>
                <div className="relative w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-extrabold text-2xl border-4 border-orange-500 shadow-xl">
                  {incomingCall.callerName.slice(0, 2).toUpperCase()}
                </div>
              </div>

              <div>
                <h4 className="text-white text-lg font-black tracking-wide font-sans">{incomingCall.callerName}</h4>
                <p className="text-orange-400 text-xs font-black uppercase tracking-wider mt-1.5 animate-pulse">
                  {incomingCall.type === 'video' ? 'Appel Vidéo Entrant...' : 'Appel Audio Entrant...'}
                </p>
                <div className="text-[10px] text-slate-350 mt-1 select-none font-bold">Boutique : {incomingCall.callerStoreId}</div>
              </div>

              <div className="flex gap-6 w-full mt-4 justify-center">
                <button
                  type="button"
                  onClick={handleRejectCall}
                  className="w-14 h-14 rounded-full bg-red-650 hover:bg-red-700 active:scale-95 flex items-center justify-center text-white shadow-lg transition-transform"
                  title="Refuser d'un clic"
                >
                  <PhoneOff size={20} />
                </button>
                <button
                  type="button"
                  onClick={handleAcceptCall}
                  className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-650 active:scale-95 flex items-center justify-center text-white ring-4 ring-emerald-500/20 shadow-lg transition-transform"
                  title="Accepter et répondre"
                >
                  <Phone size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ACTIVE CALL WORKSPACE OVERLAY SCREEN */}
        {activeCall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950 flex flex-col justify-between p-6 md:p-10 z-[60] text-white"
          >
            {/* Top info and duration timer */}
            <div className="flex justify-between items-start z-10 w-full max-w-5xl mx-auto">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 bg-orange-500/10 px-3 py-1.5 rounded-lg border border-orange-500/10 inline-block">
                  {activeCall.type === 'video' ? 'Vidéophonie active' : 'Audiophonie active'}
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 inline-block ml-2 select-none">
                  SÉCURISÉ LOCAL
                </span>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-extrabold text-slate-400 tracking-wider">COLLABORATEUR</p>
                <h4 className="text-sm font-black mt-0.5 select-none text-slate-200 uppercase tracking-widest">
                  {currentUser?.uid === activeCall.callerId ? activeCall.receiverName : activeCall.callerName}
                </h4>
              </div>
            </div>

            {/* Video preview or Call simulation screen */}
            <div className="flex-1 flex items-center justify-center relative p-4 max-w-4xl mx-auto w-full">
              {activeCall.type === 'video' ? (
                <div className="relative w-full h-full max-h-[60vh] rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
                  {activeCall.status === 'accepted' ? (
                    isCameraOff ? (
                      <div className="text-center p-6 bg-slate-950/80 rounded-2xl border border-white/5 backdrop-blur-sm">
                        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                          <VideoOff size={24} />
                        </div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Votre caméra est désactivée</p>
                      </div>
                    ) : (
                      <>
                        <video
                          ref={localVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        {/* Remote Simulated View inside corner */}
                        <div className="absolute bottom-4 right-4 w-28 h-36 md:w-36 md:h-48 rounded-2xl overflow-hidden bg-slate-950/90 border border-white/10 shadow-xl flex flex-col items-center justify-center p-3 text-center">
                          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse mb-2"></span>
                          <p className="text-[8px] font-extrabold uppercase text-slate-300">Flux Distant</p>
                          <p className="text-[7.5px] text-slate-500 leading-normal mt-1 max-w-[85px]">Flux vidéo simulé en arrière plan</p>
                        </div>
                      </>
                    )
                  ) : (
                    /* Ringing Outgoing Dial screen view */
                    <div className="text-center bg-slate-950/40 p-6 rounded-3xl">
                      <div className="relative flex items-center justify-center w-20 h-20 mx-auto mb-4">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400/20 animate-ping opacity-75"></span>
                        <div className="relative w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-orange-400 font-black border border-slate-700 text-lg">
                          {activeCall.receiverName.slice(0, 2).toUpperCase()}
                        </div>
                      </div>
                      <p className="text-sm font-black tracking-widest text-orange-400 uppercase animate-pulse">CONNEXION EN COURS...</p>
                      <p className="text-[10px] text-slate-500 mt-2 font-bold select-none">En attente d&apos;acceptation du destinataire</p>
                    </div>
                  )}
                </div>
              ) : (
                /* Audio calling simulation screen with waveform */
                <div className="text-center">
                  <div className="relative flex items-center justify-center w-24 h-24 mx-auto mb-6">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-orange-500/10 animate-ping opacity-75"></span>
                    <span className="absolute inline-flex h-4/5 w-4/5 rounded-full bg-orange-500/5 animate-pulse"></span>
                    <div className="relative w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-orange-400 font-extrabold text-2xl border-4 border-slate-700 shadow-2xl">
                      {(currentUser?.uid === activeCall.callerId ? activeCall.receiverName : activeCall.callerName).slice(0, 2).toUpperCase()}
                    </div>
                  </div>

                  <h3 className="text-lg font-black text-slate-100 tracking-wide font-sans">
                    {currentUser?.uid === activeCall.callerId ? activeCall.receiverName : activeCall.callerName}
                  </h3>

                  {activeCall.status === 'accepted' ? (
                    <div className="space-y-3 mt-3">
                      <p className="text-emerald-400 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5 select-none">
                        <span className="inline-flex h-2 w-2 rounded-full bg-[#22c55e] animate-ping"></span>
                        APPEL EN COURS
                      </p>
                      {/* Audio visualizer bar group */}
                      <div className="flex gap-1 justify-center py-2 h-6 items-end">
                        <span className="w-1 bg-orange-400 rounded-full animate-bounce h-5" style={{ animationDelay: '0.1s' }}></span>
                        <span className="w-1 bg-orange-500 rounded-full animate-bounce h-2" style={{ animationDelay: '0.3s' }}></span>
                        <span className="w-1 bg-orange-600 rounded-full animate-bounce h-6" style={{ animationDelay: '0.5s' }}></span>
                        <span className="w-1 bg-orange-400 rounded-full animate-bounce h-3" style={{ animationDelay: '0s' }}></span>
                        <span className="w-1 bg-orange-500 rounded-full animate-bounce h-4" style={{ animationDelay: '0.2s' }}></span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 mt-2">
                      <p className="text-orange-400 text-xs font-black uppercase tracking-wider animate-pulse">SONNERIE DE L&apos;APPEL...</p>
                      <p className="text-[10px] text-slate-500 font-serif font-semibold">Vérification de la disponibilité</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Controls and Duration Timer label */}
            <div className="text-center py-6 flex flex-col items-center gap-4 w-full max-w-md mx-auto">
              {activeCall.status === 'accepted' && (
                <div className="text-slate-300 text-xs font-black font-semibold select-none bg-white/5 py-1 px-4.5 rounded-full tracking-wider font-mono">
                  {Math.floor(callDuration / 60).toString().padStart(2, '0')}:{(callDuration % 60).toString().padStart(2, '0')}
                </div>
              )}

              <div className="flex gap-4 items-center">
                {activeCall.status === 'accepted' && (
                  <button
                    type="button"
                    onClick={() => setIsCallMuted(!isCallMuted)}
                    className={`p-3.5 rounded-full flex items-center justify-center transition-all ${
                      isCallMuted ? 'bg-red-650 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                    title={isCallMuted ? "Réactiver le micro" : "Couper le micro"}
                  >
                    {isCallMuted ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleEndCall}
                  className="p-4 rounded-full bg-red-600 hover:bg-red-750 text-white shadow-xl transition-all active:scale-90 flex items-center justify-center ring-4 ring-red-600/20"
                  title="Raccrocher"
                >
                  <PhoneOff size={22} className="stroke-[2.5]" />
                </button>

                {activeCall.status === 'accepted' && activeCall.type === 'video' && (
                  <button
                    type="button"
                    onClick={() => setIsCameraOff(!isCameraOff)}
                    className={`p-3.5 rounded-full flex items-center justify-center transition-all ${
                      isCameraOff ? 'bg-red-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                    title={isCameraOff ? "Activer la caméra" : "Couper la caméra"}
                  >
                    {isCameraOff ? <VideoOff size={18} /> : <Video size={18} />}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
