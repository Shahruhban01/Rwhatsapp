import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { auth } from '../services/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import {
  QrCode, Key, ArrowRight, ShieldCheck, Laptop,
  Lock, RefreshCw, UserPlus, LogIn, ChevronLeft, User
} from 'lucide-react';

const API_URL = 'http://localhost:5000/api';

type Step =
  | 'entry'
  | 'key-choice'
  | 'register'
  | 'login-user'
  | 'qr'
  | 'loading';

const Login: React.FC = () => {
  const { listenToQrSession, requestQrSession, validateQrSession, user, setUserProfile } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('loading');
  const [accessKey, setAccessKey] = useState('');
  const [validatedKey, setValidatedKey] = useState('');

  const [regUsername, setRegUsername] = useState('');
  const [regName, setRegName] = useState('');
  const [regPin, setRegPin] = useState(['', '', '', '']);
  const [regPinConfirm, setRegPinConfirm] = useState(['', '', '', '']);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPin, setLoginPin] = useState(['', '', '', '']);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<'pending' | 'scanned' | 'confirmed' | 'expired' | 'idle'>('idle');

  const regPinRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const regConfirmRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const loginPinRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => {
    if (user) {
      if (!user.username) navigate('/setup-username');
      else navigate('/dashboard');
    }
  }, [user, navigate]);

  useEffect(() => {
    setStep('entry');
  }, []);

  useEffect(() => {
    if (step !== 'qr') { setQrCode(null); setQrStatus('idle'); return; }
    let unsubscribe: (() => void) | null = null;
    let timer: any = null;
    const initQr = async () => {
      try {
        setQrStatus('pending');
        const data = await requestQrSession();
        setQrCode(data.qrCodeBase64);
        setLinkCode(data.linkCode);
        unsubscribe = listenToQrSession(data.qrSessionId, async (status) => {
          if (status === 'scanned') setQrStatus('scanned');
          else if (status === 'confirmed') {
            setQrStatus('confirmed');
            try {
              const loggedUser = await validateQrSession(data.qrSessionId);
              if (!loggedUser.username) navigate('/setup-username');
              else navigate('/dashboard');
            } catch (err: any) {
              setError('QR confirmation failed: ' + err.message);
              setQrStatus('expired');
            }
          }
        });
        timer = setTimeout(() => { setQrStatus('expired'); if (unsubscribe) unsubscribe(); }, 60000);
      } catch {
        setError('Failed to load QR code. Please try again.');
        setQrStatus('idle');
      }
    };
    initQr();
    return () => { if (unsubscribe) unsubscribe(); if (timer) clearTimeout(timer); };
  }, [step]);

  const handlePinDigit = (
    index: number, value: string,
    arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>,
    refs: React.RefObject<HTMLInputElement | null>[]
  ) => {
    const char = value.slice(-1);
    if (!/^\d?$/.test(char)) return;
    const updated = [...arr]; updated[index] = char; setArr(updated);
    if (char && index < 3) refs[index + 1].current?.focus();
  };

  const handlePinKey = (
    index: number, e: React.KeyboardEvent,
    arr: string[], refs: React.RefObject<HTMLInputElement | null>[]
  ) => {
    if (e.key === 'Backspace' && !arr[index] && index > 0) refs[index - 1].current?.focus();
  };

  const pinStr = (arr: string[]) => arr.join('');
  const clearError = () => { setError(null); setFieldError({}); };

  const handleValidateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessKey.trim()) return;
    setLoading(true); clearError();
    try {
      await axios.post(`${API_URL}/auth/validate-key`, { accessKey });
      setValidatedKey(accessKey);
      setStep('key-choice');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid access key');
    } finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault(); clearError();
    const errs: Record<string, string> = {};
    if (!regUsername.trim() || !/^[a-z0-9_]{3,20}$/.test(regUsername.toLowerCase()))
      errs.username = 'Username: 3–20 chars, lowercase letters, numbers, underscores only';
    const p = pinStr(regPin); const pc = pinStr(regPinConfirm);
    if (p.length !== 4) errs.pin = 'Enter all 4 PIN digits';
    else if (p !== pc) errs.pinConfirm = 'PINs do not match';
    if (Object.keys(errs).length > 0) { setFieldError(errs); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/register`, {
        accessKey: validatedKey,
        username: regUsername.toLowerCase(),
        pin: p,
        name: regName.trim() || regUsername,
        deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Web Browser',
        platform: 'web',
      });
      const { jwt, refreshToken, firebaseToken, user: loggedUser } = res.data;
      if (firebaseToken) { await signInWithCustomToken(auth, firebaseToken); }
      localStorage.setItem('jwt', jwt);
      localStorage.setItem('refreshToken', refreshToken);
      setUserProfile(loggedUser);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally { setLoading(false); }
  };

  const handleLoginUser = async (e: React.FormEvent) => {
    e.preventDefault(); clearError();
    const errs: Record<string, string> = {};
    if (!loginUsername.trim()) errs.username = 'Username is required';
    const p = pinStr(loginPin);
    if (p.length !== 4) errs.pin = 'Enter all 4 PIN digits';
    if (Object.keys(errs).length > 0) { setFieldError(errs); return; }
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/login-user`, {
        accessKey: validatedKey,
        username: loginUsername.toLowerCase(),
        pin: p,
        deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile Browser' : 'Web Browser',
        platform: 'web',
      });
      const { jwt, refreshToken, firebaseToken, user: loggedUser } = res.data;
      if (firebaseToken) { await signInWithCustomToken(auth, firebaseToken); }
      localStorage.setItem('jwt', jwt);
      localStorage.setItem('refreshToken', refreshToken);
      setUserProfile(loggedUser);
      if (!loggedUser.username) navigate('/setup-username');
      else navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed');
      setLoginPin(['', '', '', '']);
      loginPinRefs[0].current?.focus();
    } finally { setLoading(false); }
  };

  const PinBoxes = ({
    arr, setArr, refs, autoFocus
  }: {
    arr: string[];
    setArr: React.Dispatch<React.SetStateAction<string[]>>;
    refs: React.RefObject<HTMLInputElement | null>[];
    autoFocus?: boolean;
  }) => (
    <div className="flex justify-center gap-3 my-3">
      {arr.map((digit, i) => (
        <input
          key={i} ref={refs[i]} type="password" inputMode="numeric" value={digit}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handlePinDigit(i, e.target.value, arr, setArr, refs)}
          onKeyDown={(e) => handlePinKey(i, e, arr, refs)}
          disabled={loading}
          className="w-[52px] h-[52px] text-center text-2xl font-bold bg-[#111b21] border-2 border-[#2e3b43] rounded-xl text-[#f0f2f5] focus:border-[#00a884] focus:outline-none transition-colors caret-transparent select-none"
        />
      ))}
    </div>
  );

  const BackBtn = ({ to, label }: { to: Step; label: string }) => (
    <button type="button" onClick={() => { clearError(); setStep(to); }}
      className="flex items-center gap-1.5 text-xs text-[#8696a0] hover:text-[#00a884] transition mb-5">
      <ChevronLeft className="w-3.5 h-3.5" /> {label}
    </button>
  );

  const FieldErr = ({ msg }: { msg?: string }) =>
    msg ? <p className="text-red-400 text-[11px] mt-1">{msg}</p> : null;

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-transparent border-[#00a884]" />
      </div>
    );
  }

  const leftContent: Record<string, React.ReactNode> = {
    entry: (
      <>
        <h2 className="text-xl font-medium mb-6 text-[#f0f2f5]">Use WhatsApp on your computer</h2>
        <ol className="space-y-4 text-sm text-[#8696a0] list-decimal list-inside pl-1">
          <li className="leading-relaxed">Open WhatsApp Clone on your mobile phone.</li>
          <li className="leading-relaxed">Tap <span className="font-semibold text-[#efeae2]">Menu</span> or <span className="font-semibold text-[#efeae2]">Settings</span> and select <span className="font-semibold text-[#efeae2]">Linked Devices</span>.</li>
          <li className="leading-relaxed">Tap on <span className="font-semibold text-[#efeae2]">Link a Device</span>.</li>
          <li className="leading-relaxed">Point your phone to this screen to capture the QR code.</li>
        </ol>
      </>
    ),
    'key-choice': (
      <>
        <h2 className="text-xl font-medium mb-3 text-[#f0f2f5]">Access key verified ?</h2>
        <p className="text-sm text-[#8696a0] leading-relaxed">Create a new account with a unique username and PIN, or sign in with your existing credentials.</p>
      </>
    ),
    register: (
      <>
        <h2 className="text-xl font-medium mb-3 text-[#f0f2f5]">Create your account</h2>
        <p className="text-sm text-[#8696a0] leading-relaxed">Choose a unique username that others can use to find you. Your PIN keeps your account secure.</p>
      </>
    ),
    'login-user': (
      <>
        <h2 className="text-xl font-medium mb-3 text-[#f0f2f5]">Welcome back</h2>
        <p className="text-sm text-[#8696a0] leading-relaxed">Enter your username and PIN to sign in to your existing account.</p>
      </>
    ),
    qr: (
      <>
        <h2 className="text-xl font-medium mb-3 text-[#f0f2f5]">Scan with your phone</h2>
        <p className="text-sm text-[#8696a0] leading-relaxed">Open the mobile app, go to Linked Devices and scan this QR code to log in instantly.</p>
      </>
    ),
  };

  return (
    <div className="min-h-screen bg-[#0b141a] flex flex-col items-center justify-center p-4">
      <div className="absolute top-0 left-0 w-full h-[220px] bg-[#00a884] z-0" />

      <div className="w-full max-w-[980px] bg-[#111b21] rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col md:flex-row border border-[#202c33]">

        {/* Left panel */}
        <div className="flex-1 p-8 md:p-12 text-[#efeae2] flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="bg-[#00a884] p-2.5 rounded-full text-white">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold tracking-wide">WHATSAPP CLONE</h1>
            </div>
            {leftContent[step]}
          </div>
          <div className="mt-8 pt-8 border-t border-[#202c33] flex items-center gap-3 text-xs text-[#8696a0]">
            <Laptop className="w-4 h-4 text-[#00a884]" />
            <span>Secure Web Session Management</span>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-full md:w-[420px] bg-[#202c33] p-8 md:p-10 flex flex-col justify-center border-l border-[#2e3b43]">
          {error && (
            <div className="bg-red-500/10 border border-red-500/40 text-red-300 p-3 rounded-lg mb-5 text-sm text-center">
              {error}
            </div>
          )}

          {/* ENTRY */}
          {step === 'entry' && (
            <form onSubmit={handleValidateKey} className="space-y-5">
              <div className="text-center mb-2">
                <div className="inline-block bg-[#00a884]/10 p-4 rounded-full text-[#00a884] mb-3">
                  <Key className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-[#f0f2f5]">Enter Access Key</h3>
                <p className="text-xs text-[#8696a0] mt-1">Authenticate using your shared secret key</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#8696a0] uppercase tracking-wider block">Access Key</label>
                <input
                  type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)}
                  placeholder="Enter pre-shared access key"
                  className="w-full bg-[#111b21] border border-[#2e303a] rounded-lg px-4 py-3 text-sm text-[#f0f2f5] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition"
                  required disabled={loading} autoFocus
                />
              </div>
              <button type="submit" disabled={loading || !accessKey.trim()}
                className="w-full bg-[#00a884] hover:bg-[#008f72] disabled:bg-[#00a884]/40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2 text-sm">
                {loading ? 'Verifying...' : 'Continue'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
              <div className="pt-3 border-t border-[#2e3b43] flex justify-center">
                <button type="button" onClick={() => { clearError(); setStep('qr'); }}
                  className="text-xs text-[#8696a0] hover:text-[#00a884] transition flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5" /> Log in via QR code instead
                </button>
              </div>
            </form>
          )}

          {/* KEY CHOICE */}
          {step === 'key-choice' && (
            <div className="space-y-4">
              <BackBtn to="entry" label="Back to Access Key" />
              <div className="text-center mb-2">
                <div className="inline-block bg-[#00a884]/10 p-4 rounded-full text-[#00a884] mb-3">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-[#f0f2f5]">Access Key Verified</h3>
                <p className="text-xs text-[#8696a0] mt-1">What would you like to do?</p>
              </div>
              <button onClick={() => { clearError(); setStep('register'); }}
                className="w-full flex items-center gap-4 bg-[#111b21] hover:bg-[#1a2730] border border-[#2e3b43] hover:border-[#00a884]/50 rounded-xl p-4 transition group text-left">
                <div className="w-10 h-10 rounded-full bg-[#00a884]/10 flex items-center justify-center text-[#00a884] shrink-0 group-hover:bg-[#00a884]/20 transition">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#f0f2f5]">Create New Account</p>
                  <p className="text-[11px] text-[#8696a0] mt-0.5">Set up a username and PIN for the first time</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#8696a0] group-hover:text-[#00a884] ml-auto transition" />
              </button>
              <button onClick={() => { clearError(); setStep('login-user'); }}
                className="w-full flex items-center gap-4 bg-[#111b21] hover:bg-[#1a2730] border border-[#2e3b43] hover:border-[#00a884]/50 rounded-xl p-4 transition group text-left">
                <div className="w-10 h-10 rounded-full bg-[#00a884]/10 flex items-center justify-center text-[#00a884] shrink-0 group-hover:bg-[#00a884]/20 transition">
                  <LogIn className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#f0f2f5]">Use Existing Account</p>
                  <p className="text-[11px] text-[#8696a0] mt-0.5">Sign in with your username and PIN</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#8696a0] group-hover:text-[#00a884] ml-auto transition" />
              </button>
            </div>
          )}

          {/* REGISTER */}
          {step === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <BackBtn to="key-choice" label="Back" />
              <div className="text-center mb-1">
                <div className="inline-block bg-[#00a884]/10 p-4 rounded-full text-[#00a884] mb-3">
                  <UserPlus className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-semibold text-[#f0f2f5]">Create Account</h3>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#8696a0] uppercase tracking-wider block">Username <span className="text-red-400">*</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0] text-sm">@</span>
                  <input type="text" value={regUsername}
                    onChange={(e) => { setRegUsername(e.target.value.toLowerCase()); setFieldError(f => ({ ...f, username: '' })); }}
                    placeholder="your_username" autoFocus disabled={loading}
                    className="w-full bg-[#111b21] border border-[#2e303a] rounded-lg pl-8 pr-4 py-2.5 text-sm text-[#f0f2f5] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition"
                  />
                </div>
                {fieldError.username && <p className="text-red-400 text-[11px] mt-1">{fieldError.username}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#8696a0] uppercase tracking-wider block">Display Name <span className="text-[#8696a0] font-normal normal-case">(optional)</span></label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0]"><User className="w-4 h-4" /></span>
                  <input type="text" value={regName} onChange={(e) => setRegName(e.target.value)}
                    placeholder="Your display name" disabled={loading}
                    className="w-full bg-[#111b21] border border-[#2e303a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#f0f2f5] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-[#8696a0] uppercase tracking-wider block mb-1">Set PIN <span className="text-red-400">*</span></label>
                <PinBoxes arr={regPin} setArr={setRegPin} refs={regPinRefs} />
                {fieldError.pin && <p className="text-red-400 text-[11px] text-center">{fieldError.pin}</p>}
              </div>
              <div>
                <label className="text-xs text-[#8696a0] uppercase tracking-wider block mb-1">Confirm PIN</label>
                <PinBoxes arr={regPinConfirm} setArr={setRegPinConfirm} refs={regConfirmRefs} />
                {fieldError.pinConfirm && <p className="text-red-400 text-[11px] text-center">{fieldError.pinConfirm}</p>}
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-[#00a884] hover:bg-[#008f72] disabled:bg-[#00a884]/40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2 text-sm mt-1">
                {loading ? 'Creating Account...' : 'Create Account'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {/* LOGIN USER */}
          {step === 'login-user' && (
            <form onSubmit={handleLoginUser} className="space-y-4">
              <BackBtn to="key-choice" label="Back" />
              <div className="text-center mb-1">
                <div className="inline-block bg-[#00a884]/10 p-4 rounded-full text-[#00a884] mb-3">
                  <LogIn className="w-7 h-7" />
                </div>
                <h3 className="text-lg font-semibold text-[#f0f2f5]">Sign In</h3>
                <p className="text-xs text-[#8696a0] mt-1">Enter your username and PIN</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-[#8696a0] uppercase tracking-wider block">Username</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8696a0] text-sm">@</span>
                  <input type="text" value={loginUsername}
                    onChange={(e) => { setLoginUsername(e.target.value.toLowerCase()); setFieldError(f => ({ ...f, username: '' })); }}
                    placeholder="your_username" autoFocus disabled={loading}
                    className="w-full bg-[#111b21] border border-[#2e303a] rounded-lg pl-8 pr-4 py-2.5 text-sm text-[#f0f2f5] placeholder-[#8696a0] focus:outline-none focus:border-[#00a884] transition"
                  />
                </div>
                {fieldError.username && <p className="text-red-400 text-[11px] mt-1">{fieldError.username}</p>}
              </div>
              <div>
                <label className="text-xs text-[#8696a0] uppercase tracking-wider block mb-1">PIN</label>
                <PinBoxes arr={loginPin} setArr={setLoginPin} refs={loginPinRefs} />
                {fieldError.pin && <p className="text-red-400 text-[11px] text-center">{fieldError.pin}</p>}
              </div>
              <button type="submit" disabled={loading || !loginUsername.trim() || pinStr(loginPin).length !== 4}
                className="w-full bg-[#00a884] hover:bg-[#008f72] disabled:bg-[#00a884]/40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2 text-sm">
                {loading ? 'Signing In...' : 'Sign In'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}

          {/* QR */}
          {step === 'qr' && (
            <div className="text-center space-y-5">
              <BackBtn to="entry" label="Back to Access Key" />
              <div>
                <h3 className="text-lg font-semibold text-[#f0f2f5]">Scan QR Code</h3>
                <p className="text-xs text-[#8696a0] mt-1">Scan this code using the mobile app scanner</p>
              </div>
              <div className="relative w-[220px] h-[220px] bg-white p-2 rounded-xl mx-auto flex items-center justify-center shadow-lg">
                {qrCode && qrStatus !== 'expired' ? (
                  <div className="relative w-full h-full">
                    <img src={qrCode} alt="Scan QR Code" className="w-full h-full" />
                    {qrStatus === 'scanned' && (
                      <div className="absolute inset-0 bg-[#111b21]/90 rounded flex flex-col items-center justify-center p-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent border-[#00a884] mb-3" />
                        <span className="text-xs font-semibold text-[#f0f2f5]">Scanned!</span>
                        <span className="text-[10px] text-[#8696a0] mt-1">Approve on your phone</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-slate-400">
                    {qrStatus === 'expired' ? (
                      <>
                        <span className="text-xs text-red-400 font-semibold">QR Code Expired</span>
                        <button onClick={() => { setStep('entry'); setTimeout(() => setStep('qr'), 50); }}
                          className="text-xs bg-[#00a884] text-white py-1.5 px-4 rounded-lg hover:bg-[#008f72] transition flex items-center gap-1.5">
                          <RefreshCw className="w-3 h-3" /> Refresh
                        </button>
                      </>
                    ) : (
                      <div className="animate-pulse bg-slate-200 w-[180px] h-[180px] rounded" />
                    )}
                  </div>
                )}
              </div>

              {linkCode && qrStatus !== 'expired' && (
                <div className="mt-4 p-3 bg-[#202c33] rounded-lg inline-block border border-slate-700/50">
                  <p className="text-[10px] text-[#8696a0] uppercase tracking-wider font-semibold">Link with Code</p>
                  <p className="text-xl font-bold text-[#00a884] tracking-widest mt-1 font-mono">{linkCode}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;

