import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { db } from '../services/firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { X, Users, Trash2, Shield, UserPlus, Link, Copy, Check, Loader2, LogOut } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

interface Member {
  userId: string;
  role: 'admin' | 'member';
  name?: string;
  username?: string;
  joinedAt: any;
}

interface GroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  groupName: string;
  onLeftGroup: () => void;
}

const GroupInfoModal: React.FC<GroupInfoModalProps> = ({ isOpen, onClose, chatId, groupName, onLeftGroup }) => {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [groupDetails, setGroupDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteEnabled, setInviteEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Listen to members list in real-time
  useEffect(() => {
    if (!isOpen || !chatId) return;

    setMembersLoading(true);
    
    // 1. Fetch group metadata
    axios.get(`${API_URL}/chats/group/${chatId}/invite`).then(res => {
      setInviteCode(res.data.inviteCode);
      setInviteEnabled(res.data.inviteCodeEnabled);
    }).catch(() => { /* ignore if not admin */ });


    // Listen to group members subcollection
    const membersQuery = collection(db, 'groups', chatId, 'members');
    const unsubscribe = onSnapshot(membersQuery, async (snapshot) => {
      const list: Member[] = [];
      const userIds: string[] = [];

      snapshot.forEach((doc) => {
        const d = doc.data();
        list.push({
          userId: doc.id,
          role: d.role,
          joinedAt: d.joinedAt
        });
        userIds.push(doc.id);
      });

      // Fetch profiles for users in list
      if (userIds.length > 0) {
        try {
          const profilesRes = await axios.get(`${API_URL}/users`);
          const profilesMap = new Map(profilesRes.data.map((u: any) => [u.userId, u]));
          
          const enriched = list.map(m => {
            const profile: any = profilesMap.get(m.userId) || {};
            // Self check
            if (m.userId === user?.userId) {
              profile.name = user.name + ' (You)';
              profile.username = user.username;
            }
            return {
              ...m,
              name: profile.name || 'Anonymous User',
              username: profile.username || 'unknown'
            };
          });

          setMembers(enriched);
          const selfMember = enriched.find(m => m.userId === user?.userId);
          setIsAdmin(selfMember?.role === 'admin');
        } catch (err) {
          console.error(err);
        }
      }
      setMembersLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen, chatId, user]);

  const getGroupMeta = async () => {
    try {
      const snap = await axios.get(`${API_URL}/chats`);
      const matched = snap.data.find((c: any) => c.chatId === chatId);
      setGroupDetails(matched);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleInvite = async () => {
    try {
      const res = await axios.post(`${API_URL}/chats/group/${chatId}/invite`, {
        enabled: !inviteEnabled
      });
      setInviteCode(res.data.inviteCode);
      setInviteEnabled(res.data.inviteCodeEnabled);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyLink = () => {
    if (!inviteCode) return;
    const link = `http://localhost:5173/join/${inviteCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemoveMember = async (targetUserId: string) => {
    try {
      await axios.delete(`${API_URL}/chats/group/${chatId}/members/${targetUserId}`);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLeaveGroup = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await axios.delete(`${API_URL}/chats/group/${chatId}/members/${user.userId}`);
      onClose();
      onLeftGroup();
    } catch (err) {
      console.error(err);
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
            <h2 className="text-lg font-bold">{groupName}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-[#2e3b43] rounded-full text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 pr-3">
          
          {/* Invite Code Section (Admin only or if enabled) */}
          {isAdmin && (
            <div className="bg-[#202c33]/30 p-4 rounded-xl border border-[#202c33]/50 space-y-3">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="text-sm font-semibold text-[#efeae2]">Group Invite Link</h4>
                  <p className="text-[11px] text-[#8696a0]">Allow others to join using this code</p>
                </div>
                <button
                  onClick={handleToggleInvite}
                  className={`w-11 h-6 rounded-full transition-colors relative flex items-center px-1 ${inviteEnabled ? 'bg-[#00a884]' : 'bg-slate-600'}`}
                >
                  <span className={`w-4 h-4 rounded-full bg-white shadow-md transition-transform ${inviteEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              {inviteEnabled && inviteCode && (
                <div className="flex items-center gap-2 bg-[#111b21] p-2 rounded-lg border border-[#2e3b43]">
                  <span className="text-xs text-[#00a884] font-mono truncate flex-1">
                    {`http://localhost:5173/join/${inviteCode}`}
                  </span>
                  <button
                    onClick={handleCopyLink}
                    className="p-1.5 hover:bg-[#202c33] rounded text-slate-400 hover:text-white transition"
                    title="Copy invite link"
                  >
                    {copied ? <Check className="w-4 h-4 text-[#00a884]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Members List */}
          <div className="space-y-2">
            <h3 className="text-xs text-[#8696a0] font-semibold uppercase tracking-wider">
              Group Members ({members.length})
            </h3>

            <div className="border border-[#222e35] rounded-xl overflow-hidden bg-[#202c33]/10 max-h-[220px] overflow-y-auto">
              {membersLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
                </div>
              ) : (
                members.map((m) => (
                  <div
                    key={m.userId}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-[#202c33]/30 border-b border-[#222e35]/30 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center font-bold text-white uppercase text-xs">
                        {m.name?.[0] || 'U'}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#e9edef]">{m.name}</p>
                        <p className="text-[11px] text-[#8696a0]">@{m.username}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {m.role === 'admin' && (
                        <span className="flex items-center gap-0.5 text-[10px] bg-[#00a884]/10 border border-[#00a884]/30 text-[#00a884] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider">
                          <Shield className="w-2.5 h-2.5" /> Admin
                        </span>
                      )}

                      {/* Remove member button (Admin only, can't remove self) */}
                      {isAdmin && m.userId !== user?.userId && (
                        <button
                          onClick={() => handleRemoveMember(m.userId)}
                          className="p-1.5 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition"
                          title="Remove from group"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="h-[70px] bg-[#202c33]/40 border-t border-[#222e35] px-6 flex items-center justify-between shrink-0">
          <button
            onClick={handleLeaveGroup}
            disabled={loading}
            className="text-red-400 hover:text-red-300 text-sm font-semibold flex items-center gap-1.5 hover:bg-red-500/10 px-3 py-2 rounded-lg transition"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />} Leave Group
          </button>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#202c33] hover:bg-[#2e3b43] text-sm font-semibold rounded-lg transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default GroupInfoModal;
