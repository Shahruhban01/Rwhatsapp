import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { UserCheck, ShieldAlert, ArrowRight, User } from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

const UsernameSetup: React.FC = () => {
  const { user, setUserProfile } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If user is not logged in, redirect to login
  // If user already has a username, redirect to dashboard
  useEffect(() => {
    if (!user) {
      navigate('/login');
    } else if (user.username) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Debounced username check
  useEffect(() => {
    if (!username.trim() || username.length < 3) {
      setIsAvailable(null);
      setError(null);
      return;
    }

    const cleaned = username.replace(/^@/, '').toLowerCase();
    const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
    if (!USERNAME_REGEX.test(cleaned)) {
      setIsAvailable(false);
      setError('Username must be 3-20 characters, containing only lowercase letters, numbers, and underscores.');
      return;
    }

    setError(null);
    const delayDebounceFn = setTimeout(async () => {
      setChecking(true);
      try {
        const token = localStorage.getItem('jwt');
        const res = await axios.post(
          `${API_URL}/profile/username/check`,
          { username: cleaned },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setIsAvailable(res.data.available);
      } catch (err: any) {
        console.error('Check username error:', err);
      } finally {
        setChecking(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [username]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = username.replace(/^@/, '').toLowerCase();

    if (!isAvailable || checking) return;

    setSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem('jwt');
      const res = await axios.post(
        `${API_URL}/profile/username/reserve`,
        { username: cleaned },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data.success) {
        // Update user state locally
        setUserProfile({ username: cleaned });
        navigate('/dashboard');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Failed to claim username';
      setError(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b141a] flex flex-col items-center justify-center p-4">
      <div className="absolute top-0 left-0 w-full h-[220px] bg-[#00a884] z-0"></div>

      <div className="w-full max-w-[480px] bg-[#111b21] rounded-lg shadow-2xl overflow-hidden z-10 border border-[#202c33] p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-block bg-[#00a884]/10 p-4 rounded-full text-[#00a884] mb-4">
            <User className="w-10 h-10" />
          </div>
          <h1 className="text-xl font-semibold text-[#f0f2f5] tracking-wide">Choose Username</h1>
          <p className="text-sm text-[#8696a0] mt-2">
            Set up a unique username so other users can search for you.
          </p>
        </div>

        {error && (
          <div className="bg-[#ea0038]/15 border border-[#ea0038]/50 text-[#fca5a5] p-3 rounded mb-6 text-xs text-center flex items-center justify-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs text-[#8696a0] uppercase tracking-wider block font-semibold">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8696a0] font-medium text-sm">
                @
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                className="w-full bg-[#111b21] border border-[#2e303a] rounded pl-8 pr-12 py-3.5 text-sm text-[#f0f2f5] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition"
                required
                disabled={submitting}
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                {checking && (
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent border-[#00a884]"></div>
                )}
                {!checking && isAvailable === true && (
                  <span className="text-[#00a884] text-xs font-semibold flex items-center gap-1">
                    <UserCheck className="w-4 h-4" /> Available
                  </span>
                )}
                {!checking && isAvailable === false && !error && (
                  <span className="text-red-400 text-xs font-semibold">Taken</span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#202c33] p-4 rounded text-xs text-[#8696a0] leading-relaxed space-y-1.5 border-l-2 border-[#00a884]">
            <p className="font-semibold text-[#f0f2f5] mb-1">Username rules:</p>
            <p>• Only lowercase letters (a-z), numbers (0-9), and underscores (_)</p>
            <p>• Length must be between 3 and 20 characters</p>
            <p>• Must be globally unique</p>
          </div>

          <button
            type="submit"
            disabled={submitting || !isAvailable || checking}
            className="w-full bg-[#00a884] hover:bg-[#008f72] disabled:bg-[#00a884]/40 disabled:cursor-not-allowed text-white font-medium py-3.5 px-4 rounded transition flex items-center justify-center gap-2 text-sm shadow"
          >
            {submitting ? 'Claiming Username...' : 'Set Username'}
            {!submitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UsernameSetup;
