import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, setTokens, clearTokens } from '@/lib/api';

interface UnifiedUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'merchant' | 'customer';
  merchantId?: string;
  merchantName?: string;
}

interface AuthContextType {
  user: UnifiedUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UnifiedUser>;
  register: (name: string, email: string, password: string) => Promise<UnifiedUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UnifiedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('vault_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        // ignore
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<UnifiedUser> => {
    // Try admin login first
    try {
      const result = await api.adminLogin(email, password);
      const u: UnifiedUser = { id: result.user.id, email: result.user.email, name: result.user.name, role: 'admin' };
      setTokens(result.access_token, result.refresh_token, 'admin');
      setUser(u);
      localStorage.setItem('vault_user', JSON.stringify(u));
      return u;
    } catch (adminErr: any) {
      if (adminErr.message && !adminErr.message.includes('Unauthorized') && !adminErr.message.includes('Invalid credentials') && !adminErr.message.includes('API error: 401')) {
        throw adminErr;
      }
      // Try merchant login
      try {
        const result = await api.merchantLogin(email, password);
        const u: UnifiedUser = {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: 'merchant',
          merchantId: result.user.merchantId,
          merchantName: result.user.merchantName,
        };
        setTokens(result.access_token, result.refresh_token, 'merchant');
        setUser(u);
        localStorage.setItem('vault_user', JSON.stringify(u));
        return u;
      } catch (merchantErr: any) {
        if (merchantErr.message && !merchantErr.message.includes('Unauthorized') && !merchantErr.message.includes('Invalid credentials') && !merchantErr.message.includes('API error: 401')) {
          throw merchantErr;
        }
        // Try customer login
        const result = await api.customerLogin(email, password);
        const u: UnifiedUser = {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: 'customer',
          merchantId: result.user.merchantId,
        };
        setTokens(result.access_token, result.refresh_token, 'customer');
        setUser(u);
        localStorage.setItem('vault_user', JSON.stringify(u));
        return u;
      }
    }
  };

  const register = async (name: string, email: string, password: string): Promise<UnifiedUser> => {
    const result = await api.customerRegister(name, email, password);
    const u: UnifiedUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: 'customer',
      merchantId: result.user.merchantId,
    };
    setTokens(result.access_token, result.refresh_token, 'customer');
    setUser(u);
    localStorage.setItem('vault_user', JSON.stringify(u));
    return u;
  };

  const logout = () => {
    clearTokens();
    localStorage.removeItem('vault_user');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
