import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { ref, onValue, off } from 'firebase/database';
import { rtdb, auth } from '../services/firebase';
import { signInWithCustomToken } from 'firebase/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export interface User {
  userId: string;
  username: string;
  name: string;
  about: string;
  profilePhotoUrl: string | null;
}

interface AuthContextType {
  user: User | null;
  jwt: string | null;
  loading: boolean;
  error: string | null;
  loginWithAccessKey: (accessKey: string) => Promise<User>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  requestQrSession: () => Promise<{ qrSessionId: string; qrCodeBase64: string; expiresAt: string }>;
  listenToQrSession: (qrSessionId: string, onStatusChange: (status: string) => void) => () => void;
  validateQrSession: (qrSessionId: string) => Promise<User>;
  setUserProfile: (userOrUpdates: User | Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Silent re-auth on startup
  useEffect(() => {
    const checkAuth = async () => {
      const storedRefreshToken = localStorage.getItem('refreshToken');
      if (!storedRefreshToken) {
        setLoading(false);
        return;
      }

      try {
        // Request new JWT using refresh token
        const res = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken: storedRefreshToken,
        });
        const { jwt: newJwt, firebaseToken } = res.data;
        
        if (firebaseToken) {
          await signInWithCustomToken(auth, firebaseToken);
        }
        
        setJwt(newJwt);
        localStorage.setItem('jwt', newJwt);

        // Fetch user profile
        const profileRes = await axios.get(`${API_URL}/profile`, {
          headers: { Authorization: `Bearer ${newJwt}` },
        });
        setUser(profileRes.data);
      } catch (err: any) {
        console.error('Silent re-auth failed:', err);
        // Clear expired tokens
        localStorage.removeItem('jwt');
        localStorage.removeItem('refreshToken');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // 2. Token refresh interceptor for Axios
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('jwt');
        if (token && !config.headers.Authorization) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, []);

  // 3. Login with Access Key
  const loginWithAccessKey = async (accessKey: string): Promise<User> => {
    setError(null);
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/access-key`, {
        accessKey,
        deviceName: 'Chrome on Windows',
        platform: 'web',
      });
      const { jwt: token, refreshToken, user: loggedUser } = res.data;

      setJwt(token);
      setUser(loggedUser);
      localStorage.setItem('jwt', token);
      localStorage.setItem('refreshToken', refreshToken);

      return loggedUser;
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Login failed';
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // 4. Logout
  const logout = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout`, {});
    } catch (err) {
      console.error('Failed to log out from server:', err);
    } finally {
      setUser(null);
      setJwt(null);
      localStorage.removeItem('jwt');
      localStorage.removeItem('refreshToken');
    }
  };

  // 5. Logout all devices
  const logoutAll = async () => {
    try {
      await axios.post(`${API_URL}/auth/logout-all`, {});
    } catch (err) {
      console.error('Failed to log out all devices from server:', err);
    } finally {
      setUser(null);
      setJwt(null);
      localStorage.removeItem('jwt');
      localStorage.removeItem('refreshToken');
    }
  };

  // 6. Request QR code session
  const requestQrSession = async () => {
    try {
      const res = await axios.post(`${API_URL}/auth/qr/request`);
      return res.data;
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Failed to request QR session';
      throw new Error(errMsg);
    }
  };

  // 7. Listen to QR Live state in Realtime Database
  const listenToQrSession = (qrSessionId: string, onStatusChange: (status: string) => void): (() => void) => {
    const qrRef = ref(rtdb, `qrLive/${qrSessionId}`);
    
    const unsubscribe = onValue(qrRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.status) {
        onStatusChange(data.status);
      }
    });

    // Return cleanup unsubscribe function
    return () => {
      off(qrRef, 'value', unsubscribe);
    };
  };

  // 8. Validate/complete QR scan to fetch tokens
  const validateQrSession = async (qrSessionId: string): Promise<User> => {
    setError(null);
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/auth/qr/validate`, { qrSessionId });
      const { jwt: token, refreshToken } = res.data;

      setJwt(token);
      localStorage.setItem('jwt', token);
      localStorage.setItem('refreshToken', refreshToken);

      // Fetch profile using retrieved token
      const profileRes = await axios.get(`${API_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const loggedUser = profileRes.data;
      setUser(loggedUser);
      
      return loggedUser;
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'QR validation failed';
      setError(errMsg);
      throw new Error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const setUserProfile = (userOrUpdates: User | Partial<User>) => {
    if ('userId' in userOrUpdates && userOrUpdates.userId) {
      // Full user object — set directly (used after login/register)
      setUser(userOrUpdates as User);
    } else if (user) {
      // Partial updates — merge with existing
      setUser({ ...user, ...userOrUpdates });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        jwt,
        loading,
        error,
        loginWithAccessKey,
        logout,
        logoutAll,
        requestQrSession,
        listenToQrSession,
        validateQrSession,
        setUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
