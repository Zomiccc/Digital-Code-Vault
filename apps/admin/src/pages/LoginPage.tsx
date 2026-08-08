import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Loader2, Lock, Mail, User, Store, Gift } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button, Input } from '@/components/ui';

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-1/4 -top-1/4 h-[600px] w-[600px] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -right-1/4 bottom-0 h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl shadow-primary/20">
            <Shield className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Digital Code Vault</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Sign in to your account' : 'Create a customer account'}
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="mt-6 flex rounded-xl border border-border bg-card/50 p-1">
          <button
            onClick={() => { setMode('login'); setError(''); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${mode === 'login' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('register'); setError(''); }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${mode === 'register' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Register as Customer
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-4 space-y-5 rounded-2xl border border-border bg-card/80 p-8 shadow-2xl backdrop-blur-sm"
        >
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              {error}
            </div>
          )}

          <div className="space-y-4">
            {mode === 'register' && (
              <Input
                label="Full Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                leftIcon={<User className="h-4 w-4" />}
                required
              />
            )}
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              leftIcon={<Mail className="h-4 w-4" />}
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="h-4 w-4" />}
              required
            />
          </div>

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>

          {mode === 'login' && (
            <p className="text-center text-xs text-muted-foreground">
              Admin, merchant, or customer credentials — we'll detect your role automatically
            </p>
          )}
          {mode === 'register' && (
            <p className="text-center text-xs text-muted-foreground">
              Register as a customer to browse and purchase digital codes. You can upgrade to merchant later.
            </p>
          )}
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protected by AES-256-GCM encryption and Argon2 password hashing
        </p>
      </div>
    </div>
  );
}
