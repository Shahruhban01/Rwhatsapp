import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useChats } from '../context/ChatContext';
import { X, ShieldAlert, ShieldCheck, MessageSquare, Loader2 } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

interface ContactInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  name: string;
  username: string;
  profilePhotoUrl: string | null;
}

const ContactInfoModal: React.FC<ContactInfoModalProps> = ({
  isOpen,
  onClose,
  userId,
  name,
  username,
  profilePhotoUrl
}) => {
  const { blockUser, unblockUser, fetchBlockedUsers } = useChats();
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [about, setAbout] = useState('Hey there! I am using WhatsApp.');

  useEffect(() => {
    if (isOpen && userId) {
      checkBlockStatus();
      fetchContactAbout();
    }
  }, [isOpen, userId]);

  const checkBlockStatus = async () => {
    try {
      const blockedList = await fetchBlockedUsers();
      const blocked = blockedList.some((u: any) => u.userId === userId);
      setIsBlocked(blocked);
    } catch (err) {
      console.error('Error checking block status:', err);
    }
  };

  const fetchContactAbout = async () => {
    try {
      const res = await axios.get(`${API_URL}/users`);
      const contact = res.data.find((u: any) => u.userId === userId);
      if (contact && contact.about) {
        setAbout(contact.about);
      }
    } catch (err) {
      console.error('Error fetching contact status:', err);
    }
  };

  const handleBlockToggle = async () => {
    setLoading(true);
    try {
      if (isBlocked) {
        await unblockUser(userId);
        setIsBlocked(false);
      } else {
        await blockUser(userId);
        setIsBlocked(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-[400px] bg-[#111b21] border border-[#222e35] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-[#efeae2]">
        
        {/* Header */}
        <div className="h-[60px] bg-[#202c33] flex items-center justify-between px-6 border-b border-[#222e35] shrink-0">
          <h2 className="text-base font-bold text-slate-200">Contact Info</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#2e3b43] rounded-full text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col items-center text-center space-y-5 overflow-y-auto">
          {/* Large Profile Photo */}
          <div className="relative group select-none">
            {profilePhotoUrl ? (
              <img
                src={profilePhotoUrl}
                alt={name}
                className="w-24 h-24 rounded-full object-cover border-2 border-[#00a884]"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-[#00a884] flex items-center justify-center font-bold text-white uppercase text-4xl border-2 border-[#00a884]/40">
                {name[0]}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-[#e9edef] leading-tight">{name}</h3>
            <p className="text-xs text-[#00a884] font-medium">@{username}</p>
          </div>

          {/* About Status Card */}
          <div className="w-full bg-[#202c33]/30 border border-[#202c33]/50 rounded-xl p-4 text-left">
            <label className="text-[10px] text-[#8696a0] font-bold uppercase tracking-wider block mb-1">About Status</label>
            <p className="text-sm text-[#efeae2] leading-relaxed break-words">{about}</p>
          </div>

          {/* Block / Unblock Controls */}
          <button
            onClick={handleBlockToggle}
            disabled={loading}
            className={`w-full py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 ${
              isBlocked
                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20'
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isBlocked ? (
              <>
                <ShieldCheck className="w-4 h-4" /> Unblock Contact
              </>
            ) : (
              <>
                <ShieldAlert className="w-4 h-4" /> Block Contact
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ContactInfoModal;
