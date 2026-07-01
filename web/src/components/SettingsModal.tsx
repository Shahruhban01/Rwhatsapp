import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useChats } from '../context/ChatContext';
import { X, User, Shield, Laptop, Palette, LogOut, Check, Edit2, Loader2, Star, Trash2, Camera } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

interface Session {
  sessionId: string;
  deviceName: string;
  platform: string;
  ipAddress: string;
  createdAt: any;
  lastActiveAt: any;
}

interface BlockedUser {
  userId: string;
  name: string;
  username: string;
  profilePhotoUrl: string | null;
}

interface StarredMessage {
  messageId: string;
  chatId: string;
  senderId: string;
  content: string;
  type: string;
  mediaUrl: string | null;
  starredAt: any;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'profile' | 'linked-devices' | 'privacy' | 'starred' | 'theme';

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { user, setUserProfile } = useAuth();
  const { fetchStarredMessages, toggleStarMessage, fetchBlockedUsers, unblockUser } = useChats();
  
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // Profile fields
  const [displayName, setDisplayName] = useState(user?.name || '');
  const [aboutText, setAboutText] = useState(user?.about || '');
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingAbout, setIsEditingAbout] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Sessions list
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Privacy: Block List
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedLoading, setBlockedLoading] = useState(false);

  // Starred messages list
  const [starredMessages, setStarredMessages] = useState<StarredMessage[]>([]);
  const [starredLoading, setStarredLoading] = useState(false);

  // Theme states
  const [darkMode, setDarkMode] = useState(true);

  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.name);
      setAboutText(user.about);
    }
  }, [user]);

  // Load contextual active tab lists
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'linked-devices') fetchSessions();
    else if (activeTab === 'privacy') loadBlockedUsers();
    else if (activeTab === 'starred') loadStarredMessages();
  }, [activeTab, isOpen]);

  const fetchSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await axios.get(`${API_URL}/sessions`);
      setSessions(res.data);
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setSessionsLoading(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await axios.delete(`${API_URL}/sessions/${sessionId}`);
      setSessions(sessions.filter(s => s.sessionId !== sessionId));
    } catch (err) {
      console.error('Error revoking session:', err);
    }
  };

  const loadBlockedUsers = async () => {
    setBlockedLoading(true);
    try {
      const data = await fetchBlockedUsers();
      setBlockedUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setBlockedLoading(false);
    }
  };

  const handleUnblockUser = async (targetUserId: string) => {
    try {
      await unblockUser(targetUserId);
      setBlockedUsers(blockedUsers.filter(u => u.userId !== targetUserId));
    } catch (err) {
      console.error(err);
    }
  };

  const loadStarredMessages = async () => {
    setStarredLoading(true);
    try {
      const data = await fetchStarredMessages();
      setStarredMessages(data);
    } catch (err) {
      console.error(err);
    } finally {
      setStarredLoading(false);
    }
  };

  const handleUnstarMessage = async (msg: StarredMessage) => {
    try {
      await toggleStarMessage(msg.messageId);
      setStarredMessages(starredMessages.filter(m => m.messageId !== msg.messageId));
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async (field: 'name' | 'about') => {
    setProfileLoading(true);
    try {
      const body = field === 'name' ? { name: displayName } : { about: aboutText };
      await axios.put(`${API_URL}/profile`, body);
      setUserProfile(body);
      if (field === 'name') setIsEditingName(false);
      else setIsEditingAbout(false);
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setPhotoUploading(true);
    try {
      const uploadRes = await axios.post(`${API_URL}/storage/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const photoUrl = uploadRes.data.url;
      await axios.put(`${API_URL}/profile`, { profilePhotoUrl: photoUrl });
      setUserProfile({ profilePhotoUrl: photoUrl });
    } catch (err) {
      console.error('Error uploading profile picture:', err);
      alert('Failed to upload profile picture.');
    } finally {
      setPhotoUploading(false);
      if (profilePhotoInputRef.current) profilePhotoInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      
      {/* Hidden file input for profile image upload */}
      <input
        type="file"
        ref={profilePhotoInputRef}
        onChange={handlePhotoUpload}
        accept="image/*"
        className="hidden"
      />

      <div className="w-full max-w-[800px] h-[550px] bg-[#111b21] border border-[#222e35] rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row text-[#efeae2]">
        
        {/* Left Tabs Sidebar */}
        <div className="w-full md:w-[240px] bg-[#202c33]/40 border-r border-[#222e35] flex flex-col p-4 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold tracking-wide text-[#efeae2]">Settings</h2>
            <button onClick={onClose} className="md:hidden p-1.5 hover:bg-[#202c33] rounded-full text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-1.5 flex-1 select-none">
            <button
              onClick={() => setActiveTab('profile')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'profile' ? 'bg-[#00a884] text-white' : 'hover:bg-[#202c33]/60 text-slate-300 hover:text-white'}`}
            >
              <User className="w-4 h-4" /> Profile
            </button>
            <button
              onClick={() => setActiveTab('linked-devices')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'linked-devices' ? 'bg-[#00a884] text-white' : 'hover:bg-[#202c33]/60 text-slate-300 hover:text-white'}`}
            >
              <Laptop className="w-4 h-4" /> Linked Devices
            </button>
            <button
              onClick={() => setActiveTab('privacy')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'privacy' ? 'bg-[#00a884] text-white' : 'hover:bg-[#202c33]/60 text-slate-300 hover:text-white'}`}
            >
              <Shield className="w-4 h-4" /> Privacy & Blocking
            </button>
            <button
              onClick={() => setActiveTab('starred')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'starred' ? 'bg-[#00a884] text-white' : 'hover:bg-[#202c33]/60 text-slate-300 hover:text-white'}`}
            >
              <Star className="w-4 h-4" /> Starred Messages
            </button>
            <button
              onClick={() => setActiveTab('theme')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'theme' ? 'bg-[#00a884] text-white' : 'hover:bg-[#202c33]/60 text-slate-300 hover:text-white'}`}
            >
              <Palette className="w-4 h-4" /> Theme
            </button>
          </div>
        </div>

        {/* Right Tab Content Panel */}
        <div className="flex-1 flex flex-col p-6 min-w-0 bg-[#111b21] relative overflow-hidden">
          
          {/* Header (desktop close button) */}
          <div className="hidden md:flex justify-end absolute top-6 right-6 z-10">
            <button onClick={onClose} className="p-1.5 hover:bg-[#202c33] rounded-full text-slate-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 mt-4 md:mt-0 h-full">
            
            {/* 1. PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-[#f0f2f5] mb-1">Your Profile</h3>
                  <p className="text-xs text-[#8696a0]">Customize your public appearance on the messaging server.</p>
                </div>

                {/* Avatar Display with click to upload */}
                <div className="flex items-center gap-5 bg-[#202c33]/30 p-4 rounded-xl border border-[#202c33]/50 select-none">
                  <div
                    onClick={() => !photoUploading && profilePhotoInputRef.current?.click()}
                    className="w-16 h-16 rounded-full relative group cursor-pointer overflow-hidden shrink-0 border border-slate-700 flex items-center justify-center bg-[#202c33]"
                  >
                    {photoUploading ? (
                      <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
                    ) : user?.profilePhotoUrl ? (
                      <img src={user.profilePhotoUrl} className="w-full h-full object-cover" alt="Profile" />
                    ) : (
                      <span className="font-bold text-white uppercase text-2xl">{user?.name?.[0] || 'U'}</span>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition duration-150 flex items-center justify-center text-white">
                      <Camera className="w-4 h-4" />
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-[#e9edef]">{user?.name}</h4>
                    <p className="text-xs text-[#00a884] font-medium">@{user?.username}</p>
                    <p className="text-[10px] text-slate-400 mt-1">Click photo to update profile picture</p>
                  </div>
                </div>

                {/* Display Name Field */}
                <div className="space-y-2">
                  <label className="text-xs text-[#8696a0] font-semibold uppercase tracking-wider block">Display Name</label>
                  <div className="flex items-center gap-3">
                    {isEditingName ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="flex-1 bg-[#202c33] border border-[#2e3b43] rounded-lg px-3 py-2 text-sm text-[#f0f2f5] focus:outline-none focus:border-[#00a884]"
                          maxLength={30}
                        />
                        <button
                          onClick={() => handleUpdateProfile('name')}
                          disabled={profileLoading}
                          className="p-2 bg-[#00a884] hover:bg-[#008f72] rounded-lg text-white transition flex items-center justify-center"
                        >
                          {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center w-full bg-[#202c33]/30 rounded-lg px-3 py-2.5 border border-[#202c33]/30">
                        <span className="text-sm text-[#efeae2]">{displayName}</span>
                        <button onClick={() => setIsEditingName(true)} className="text-slate-400 hover:text-white transition">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* About Status Field */}
                <div className="space-y-2">
                  <label className="text-xs text-[#8696a0] font-semibold uppercase tracking-wider block">About Status</label>
                  <div className="flex items-center gap-3">
                    {isEditingAbout ? (
                      <div className="flex items-center gap-2 w-full">
                        <input
                          type="text"
                          value={aboutText}
                          onChange={(e) => setAboutText(e.target.value)}
                          className="flex-1 bg-[#202c33] border border-[#2e3b43] rounded-lg px-3 py-2 text-sm text-[#f0f2f5] focus:outline-none focus:border-[#00a884]"
                          maxLength={100}
                        />
                        <button
                          onClick={() => handleUpdateProfile('about')}
                          disabled={profileLoading}
                          className="p-2 bg-[#00a884] hover:bg-[#008f72] rounded-lg text-white transition flex items-center justify-center"
                        >
                          {profileLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center w-full bg-[#202c33]/30 rounded-lg px-3 py-2.5 border border-[#202c33]/30">
                        <span className="text-sm text-[#efeae2] truncate">{aboutText || 'No status set'}</span>
                        <button onClick={() => setIsEditingAbout(true)} className="text-slate-400 hover:text-white transition">
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 2. LINKED DEVICES TAB */}
            {activeTab === 'linked-devices' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-[#f0f2f5] mb-1">Linked Devices</h3>
                  <p className="text-xs text-[#8696a0]">Manage your active browser sessions across different platforms.</p>
                </div>

                <div className="space-y-3">
                  {sessionsLoading ? (
                    <div className="flex justify-center py-10">
                      <Loader2 className="w-8 h-8 animate-spin text-[#00a884]" />
                    </div>
                  ) : sessions.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      No other active sessions found.
                    </div>
                  ) : (
                    sessions.map((session) => (
                      <div key={session.sessionId} className="flex justify-between items-center bg-[#202c33]/30 p-4 rounded-xl border border-[#202c33]/50">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-[#00a884]/10 rounded-lg text-[#00a884]">
                            <Laptop className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm text-[#e9edef]">{session.deviceName}</h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">IP: {session.ipAddress} · Platform: {session.platform}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevokeSession(session.sessionId)}
                          title="Revoke session"
                          className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 3. PRIVACY & BLOCKING TAB */}
            {activeTab === 'privacy' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-[#f0f2f5] mb-1">Blocked Users</h3>
                  <p className="text-xs text-[#8696a0]">People in this list will be blocked from sending you one-to-one messages.</p>
                </div>

                <div className="space-y-3">
                  {blockedLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
                    </div>
                  ) : blockedUsers.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      You haven't blocked anyone yet.
                    </div>
                  ) : (
                    blockedUsers.map((u) => (
                      <div key={u.userId} className="flex justify-between items-center bg-[#202c33]/30 p-3 rounded-xl border border-[#202c33]/50">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center font-bold text-white uppercase text-xs">
                            {u.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#e9edef]">{u.name}</p>
                            <p className="text-[11px] text-slate-400">@{u.username}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleUnblockUser(u.userId)}
                          className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs font-semibold rounded-lg transition"
                        >
                          Unblock
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 4. STARRED MESSAGES TAB */}
            {activeTab === 'starred' && (
              <div className="space-y-6 flex flex-col h-full overflow-hidden">
                <div>
                  <h3 className="text-lg font-semibold text-[#f0f2f5] mb-1">Starred Messages</h3>
                  <p className="text-xs text-[#8696a0]">Review important messages you have starred in conversations.</p>
                </div>

                <div className="space-y-3 overflow-y-auto max-h-[350px] pr-2">
                  {starredLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
                    </div>
                  ) : starredMessages.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 text-xs">
                      No starred messages yet.
                    </div>
                  ) : (
                    starredMessages.map((m) => (
                      <div key={m.messageId} className="bg-[#202c33]/30 p-4 rounded-xl border border-[#202c33]/50 space-y-2 relative group/item">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] text-[#00a884] font-semibold uppercase tracking-wider bg-[#00a884]/10 px-1.5 py-0.5 rounded">
                            Starred Message
                          </span>
                          <button
                            onClick={() => handleUnstarMessage(m)}
                            className="p-1 hover:bg-[#202c33] rounded text-slate-400 hover:text-red-400 transition"
                            title="Unstar message"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-sm text-[#e9edef] pr-6 italic">"{m.content}"</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 5. THEME TAB */}
            {activeTab === 'theme' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-[#f0f2f5] mb-1">Visual Settings</h3>
                  <p className="text-xs text-[#8696a0]">Select your preferred appearance skin for the application.</p>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => setDarkMode(true)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition ${darkMode ? 'bg-[#00a884]/10 border-[#00a884] text-[#efeae2]' : 'bg-[#202c33]/30 border-[#202c33]/50 hover:bg-[#202c33]/50 text-slate-300'}`}
                  >
                    <div>
                      <span className="text-sm font-semibold block text-left">Dark Mode</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">Sleek, low-contrast dark system theme</span>
                    </div>
                    {darkMode && <Check className="w-5 h-5 text-[#00a884]" />}
                  </button>

                  <button
                    onClick={() => setDarkMode(false)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition ${!darkMode ? 'bg-[#00a884]/10 border-[#00a884] text-[#efeae2]' : 'bg-[#202c33]/30 border-[#202c33]/50 hover:bg-[#202c33]/50 text-slate-300'}`}
                  >
                    <div>
                      <span className="text-sm font-semibold block text-left">Light Mode</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">Classic high-contrast light theme</span>
                    </div>
                    {!darkMode && <Check className="w-5 h-5 text-[#00a884]" />}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;
