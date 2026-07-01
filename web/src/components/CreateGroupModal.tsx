import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { X, Users, Check, Loader2 } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

interface UserRecord {
  userId: string;
  username: string;
  name: string;
  profilePhotoUrl: string | null;
  about: string;
}

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (chatId: string) => void;
}

const CreateGroupModal: React.FC<CreateGroupModalProps> = ({ isOpen, onClose, onCreated }) => {
  const { user } = useAuth();
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingUsers, setFetchingUsers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
      setGroupName('');
      setDescription('');
      setSelectedUserIds([]);
      setError(null);
    }
  }, [isOpen]);

  const fetchUsers = async () => {
    setFetchingUsers(true);
    try {
      const res = await axios.get(`${API_URL}/users`);
      setUsers(res.data);
    } catch (err) {
      console.error('Error fetching users for group:', err);
    } finally {
      setFetchingUsers(false);
    }
  };

  const handleToggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API_URL}/chats/group`, {
        name: groupName.trim(),
        description: description.trim(),
        memberIds: selectedUserIds,
      });
      onCreated(res.data.chatId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-[500px] h-[550px] bg-[#111b21] border border-[#222e35] rounded-2xl shadow-2xl overflow-hidden flex flex-col text-[#efeae2]">
        
        {/* Header */}
        <div className="h-[60px] bg-[#202c33] flex items-center justify-between px-6 border-b border-[#222e35] shrink-0">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-[#00a884]" />
            <h2 className="text-lg font-bold">Create Group Chat</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#2e3b43] rounded-full text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleCreate} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4 pr-3">
            {error && (
              <div className="bg-red-500/10 border border-red-500/40 text-red-300 p-3 rounded-lg text-sm text-center">
                {error}
              </div>
            )}

            {/* Group Name */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#8696a0] font-semibold uppercase tracking-wider block">Group Name *</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Enter group name"
                className="w-full bg-[#202c33] border border-[#2e3b43] rounded-lg px-4 py-2.5 text-sm text-[#f0f2f5] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition"
                required
                disabled={loading}
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs text-[#8696a0] font-semibold uppercase tracking-wider block">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Group purpose or rules..."
                className="w-full bg-[#202c33] border border-[#2e3b43] rounded-lg px-4 py-2 text-sm text-[#f0f2f5] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition h-20 resize-none"
                disabled={loading}
              />
            </div>

            {/* Select Members */}
            <div className="space-y-2">
              <label className="text-xs text-[#8696a0] font-semibold uppercase tracking-wider block">
                Select Members ({selectedUserIds.length})
              </label>

              <div className="border border-[#222e35] rounded-xl overflow-hidden bg-[#202c33]/10 max-h-[180px] overflow-y-auto">
                {fetchingUsers ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs">
                    No other users available to add.
                  </div>
                ) : (
                  users.map((u) => {
                    const isSelected = selectedUserIds.includes(u.userId);
                    return (
                      <div
                        key={u.userId}
                        onClick={() => handleToggleUser(u.userId)}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-[#202c33]/50 cursor-pointer transition border-b border-[#222e35]/30 last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#00a884] flex items-center justify-center font-bold text-white uppercase text-xs">
                            {u.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-[#e9edef]">{u.name}</p>
                            <p className="text-[11px] text-[#8696a0]">@{u.username}</p>
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-[#00a884] border-[#00a884] text-white' : 'border-[#8696a0]'}`}>
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3px]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="h-[70px] bg-[#202c33]/40 border-t border-[#222e35] px-6 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold hover:bg-[#202c33] rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !groupName.trim()}
              className="px-5 py-2 bg-[#00a884] hover:bg-[#008f72] disabled:bg-[#00a884]/40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating...
                </>
              ) : (
                'Create Group'
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};

export default CreateGroupModal;
