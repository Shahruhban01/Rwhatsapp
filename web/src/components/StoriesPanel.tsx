import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import PostStoryModal from './PostStoryModal';
import { X, ArrowLeft, Plus, Play, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

interface Story {
  storyId: string;
  userId: string;
  type: 'text' | 'image' | 'video';
  content: string;
  mediaUrl: string | null;
  backgroundColor: string;
  textColor: string;
  caption: string;
  createdAt: any;
  viewCount: number;
}

interface UserGroup {
  user: {
    userId: string;
    name: string;
    username: string;
    profilePhotoUrl: string | null;
  };
  stories: Story[];
}

interface StoriesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const StoriesPanel: React.FC<StoriesPanelProps> = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPostStory, setShowPostStory] = useState(false);
  
  // Viewer state
  const [activeGroup, setActiveGroup] = useState<UserGroup | null>(null);
  const [activeStoryIdx, setActiveStoryIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (isOpen) {
      fetchStories();
    }
  }, [isOpen]);

  const fetchStories = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/stories`);
      setUserGroups(res.data);
    } catch (err) {
      console.error('Error fetching stories:', err);
    } finally {
      setLoading(false);
    }
  };

  // Status Player Progress Loop
  useEffect(() => {
    if (!activeGroup) return;

    setProgress(0);
    // Mark story as viewed
    const currentStory = activeGroup.stories[activeStoryIdx];
    axios.post(`${API_URL}/stories/${currentStory.storyId}/view`).catch(() => {});

    const duration = 4000; // 4 seconds per story
    const intervalTime = 100;
    const steps = duration / intervalTime;
    let stepCount = 0;

    const timer = setInterval(() => {
      stepCount++;
      setProgress((stepCount / steps) * 100);

      if (stepCount >= steps) {
        clearInterval(timer);
        handleNextStory();
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [activeGroup, activeStoryIdx]);

  const handleNextStory = () => {
    if (!activeGroup) return;
    if (activeStoryIdx < activeGroup.stories.length - 1) {
      setActiveStoryIdx(activeStoryIdx + 1);
    } else {
      // Find next user group in the list
      const currentIdx = userGroups.findIndex(g => g.user.userId === activeGroup.user.userId);
      if (currentIdx !== -1 && currentIdx < userGroups.length - 1) {
        setActiveGroup(userGroups[currentIdx + 1]);
        setActiveStoryIdx(0);
      } else {
        setActiveGroup(null);
      }
    }
  };

  const handlePrevStory = () => {
    if (!activeGroup) return;
    if (activeStoryIdx > 0) {
      setActiveStoryIdx(activeStoryIdx - 1);
    } else {
      // Find prev user group in the list
      const currentIdx = userGroups.findIndex(g => g.user.userId === activeGroup.user.userId);
      if (currentIdx > 0) {
        const prevGroup = userGroups[currentIdx - 1];
        setActiveGroup(prevGroup);
        setActiveStoryIdx(prevGroup.stories.length - 1);
      } else {
        setActiveStoryIdx(0); // restart first story
      }
    }
  };

  const formatStoryTime = (createdAt: any) => {
    if (!createdAt) return '';
    const d = new Date(createdAt._seconds * 1000 || createdAt);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  const myGroup = userGroups.find(g => g.user.userId === user?.userId);
  const otherGroups = userGroups.filter(g => g.user.userId !== user?.userId);

  return (
    <div className="absolute left-0 top-0 w-[30%] min-w-[340px] max-w-[420px] h-full bg-[#111b21] z-20 flex flex-col shadow-2xl border-r border-[#202c33] text-[#efeae2]">
      {/* Header */}
      <div className="h-[60px] bg-[#00a884] flex items-center gap-4 px-4 shrink-0">
        <button onClick={onClose} className="text-white/80 hover:text-white transition">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-white font-semibold text-base">Status</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        
        {/* My Status Section */}
        <div className="flex items-center justify-between bg-[#202c33]/20 p-3 rounded-xl border border-[#202c33]/30">
          <div 
            onClick={() => myGroup && (setActiveGroup(myGroup), setActiveStoryIdx(0))}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className={`w-11 h-11 rounded-full p-0.5 ${myGroup ? 'border-2 border-[#00a884]' : 'border border-dashed border-slate-500'} flex items-center justify-center shrink-0`}>
              <div className="w-full h-full rounded-full bg-[#00a884] flex items-center justify-center font-bold text-white uppercase text-sm">
                {user?.name?.[0] || 'U'}
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-sm text-[#e9edef]">My Status</h4>
              <p className="text-[11px] text-[#8696a0]">
                {myGroup ? `${myGroup.stories.length} updates published` : 'Tap to share a story'}
              </p>
            </div>
          </div>
          
          <button 
            onClick={() => setShowPostStory(true)}
            className="p-2 bg-[#00a884]/10 hover:bg-[#00a884]/20 rounded-full text-[#00a884] transition"
            title="Post a story"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Contacts Statuses */}
        <div className="space-y-2">
          <h3 className="text-xs text-[#8696a0] font-semibold uppercase tracking-wider pl-1">Recent Updates</h3>

          {loading ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent border-[#00a884]" />
            </div>
          ) : otherGroups.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs">
              No recent updates from your contacts.
            </div>
          ) : (
            <div className="space-y-1">
              {otherGroups.map((g) => (
                <div
                  key={g.user.userId}
                  onClick={() => { setActiveGroup(g); setActiveStoryIdx(0); }}
                  className="flex items-center gap-3 p-2.5 hover:bg-[#202c33]/40 rounded-xl cursor-pointer transition border-b border-[#202c33]/10 last:border-0"
                >
                  <div className="w-11 h-11 rounded-full p-0.5 border-2 border-[#00a884] flex items-center justify-center shrink-0">
                    <div className="w-full h-full rounded-full bg-slate-600 flex items-center justify-center font-bold text-white uppercase text-sm">
                      {g.user.name[0]}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-[#e9edef] truncate">{g.user.name}</h4>
                    <p className="text-[11px] text-[#8696a0] truncate">
                      Latest status · {formatStoryTime(g.stories[g.stories.length - 1].createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── STATUS FULLSCREEN PLAYER OVERLAY ─── */}
      {activeGroup && (
        <div className="fixed inset-0 z-50 bg-[#0b141a] flex flex-col justify-between items-center text-[#efeae2]">
          
          {/* Top Progress Bar & Header */}
          <div className="w-full max-w-[600px] p-4 space-y-3 z-10 shrink-0">
            {/* Story duration lines */}
            <div className="flex gap-1.5 w-full">
              {activeGroup.stories.map((st, idx) => (
                <div key={st.storyId} className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-[#00a884] transition-all duration-100"
                    style={{ 
                      width: idx < activeStoryIdx ? '100%' : idx === activeStoryIdx ? `${progress}%` : '0%' 
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Viewer Header */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center font-bold text-white uppercase text-sm">
                  {activeGroup.user.name[0]}
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-white">{activeGroup.user.name}</h4>
                  <p className="text-[10px] text-slate-300">
                    {formatStoryTime(activeGroup.stories[activeStoryIdx].createdAt)}
                  </p>
                </div>
              </div>
              
              <button 
                onClick={() => setActiveGroup(null)}
                className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Central Story Viewer (Text background layout) */}
          <div 
            className="flex-1 w-full max-w-[600px] flex items-center justify-center p-8 text-center relative"
            style={{ backgroundColor: activeGroup.stories[activeStoryIdx].backgroundColor }}
          >
            {/* Navigation taps */}
            <button 
              onClick={handlePrevStory}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            
            <button 
              onClick={handleNextStory}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white transition"
            >
              <ChevronRight className="w-8 h-8" />
            </button>

            {/* Story Text Content */}
            <div className="max-w-[320px] word-break break-words select-none">
              <h2 
                className="text-2xl font-bold leading-normal"
                style={{ color: activeGroup.stories[activeStoryIdx].textColor }}
              >
                {activeGroup.stories[activeStoryIdx].content}
              </h2>
            </div>
          </div>

          {/* Views count display footer (for own stories) */}
          {activeGroup.user.userId === user?.userId && (
            <div className="h-[60px] bg-black/40 w-full flex items-center justify-center gap-1.5 text-xs text-slate-300 shrink-0">
              <Eye className="w-4 h-4 text-[#00a884]" />
              <span>{activeGroup.stories[activeStoryIdx].viewCount} View{activeGroup.stories[activeStoryIdx].viewCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Write Story Composer */}
      <PostStoryModal
        isOpen={showPostStory}
        onClose={() => setShowPostStory(false)}
        onPosted={() => { fetchStories(); setShowPostStory(false); }}
      />
    </div>
  );
};

export default StoriesPanel;
