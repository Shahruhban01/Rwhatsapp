import React, { useState } from 'react';
import axios from 'axios';
import { X, Type, Send, Loader2 } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

const COLORS = [
  '#00a884', '#9c27b0', '#e91e63', '#3f51b5', '#00bcd4', 
  '#4caf50', '#ff9800', '#795548', '#607d8b', '#111b21'
];

interface PostStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPosted: () => void;
}

const PostStoryModal: React.FC<PostStoryModalProps> = ({ isOpen, onClose, onPosted }) => {
  const [content, setContent] = useState('');
  const [colorIndex, setColorIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await axios.post(`${API_URL}/stories`, {
        type: 'text',
        content: content.trim(),
        backgroundColor: COLORS[colorIndex],
        textColor: '#ffffff'
      });
      onPosted();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to post story');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div 
        className="w-full max-w-[500px] h-[500px] rounded-2xl shadow-2xl overflow-hidden flex flex-col relative transition-all duration-300 border border-[#222e35]/50"
        style={{ backgroundColor: COLORS[colorIndex] }}
      >
        {/* Header */}
        <div className="h-[60px] flex items-center justify-between px-6 z-10 text-white shrink-0">
          <span className="font-semibold text-sm">Write a Status Update</span>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input Form */}
        <form onSubmit={handlePost} className="flex-1 flex flex-col p-8 justify-center items-center text-center">
          {error && (
            <div className="absolute top-16 left-6 right-6 bg-red-500/20 border border-red-500/40 text-red-100 p-2.5 rounded-lg text-xs">
              {error}
            </div>
          )}

          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Type a status..."
            maxLength={200}
            required
            disabled={loading}
            className="w-full max-w-[320px] bg-transparent text-white text-2xl font-bold placeholder-white/40 focus:outline-none resize-none text-center outline-none h-40 caret-white"
          />

          {/* Color palette pickers */}
          <div className="absolute bottom-24 flex gap-2 overflow-x-auto max-w-[320px] p-2 bg-black/20 rounded-full border border-white/5 shrink-0 select-none">
            {COLORS.map((col, idx) => (
              <button
                key={col}
                type="button"
                onClick={() => setColorIndex(idx)}
                className={`w-6 h-6 rounded-full border-2 transition-transform ${colorIndex === idx ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                style={{ backgroundColor: col }}
              />
            ))}
          </div>

          {/* Post button */}
          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="absolute bottom-6 right-6 p-4 bg-[#00a884] hover:bg-[#008f72] disabled:bg-slate-700/50 disabled:text-slate-400 text-white rounded-full transition shadow-lg flex items-center justify-center shrink-0"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default PostStoryModal;
