import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertCircle, ArrowRight, Shield } from 'lucide-react';
import { login } from '@/lib/auth';
import { Button } from '@/components/ui';
import { copyright } from '@/lib/legal';
import { stagger } from '@/lib/motion';

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas p-4">
      {/* Backdrop. Achromatic, slow, and behind everything — it sets a mood
          without spending any of the colour budget that health signals need. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-3.5"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black, transparent)',
        }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-140 w-140 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(57,135,229,0.10) 0%, rgba(57,135,229,0) 65%)',
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        variants={stagger(0.08, 0.1)}
        initial="hidden"
        animate="show"
        className="relative z-10 w-full max-w-95"
      >
        <motion.div variants={item} className="mb-8 text-center">
          <div className="mb-5 inline-grid h-11 w-11 place-items-center rounded-xl border border-line bg-card">
            <Shield size={19} className="text-ink" />
          </div>
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-ink">
            Sentinel
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Sign in to the observability console.
          </p>
        </motion.div>

        <motion.form
          variants={item}
          onSubmit={handleSubmit}
          className="space-y-3.5 rounded-xl border border-line bg-panel p-6 shadow-2xl shadow-black/40"
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 overflow-hidden rounded-md px-3 py-2.5"
              style={{ background: 'rgba(208,59,59,0.12)', color: '#f0716f' }}
              role="alert"
            >
              <AlertCircle size={14} className="shrink-0" />
              <p className="text-[12px]">{error}</p>
            </motion.div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@sentinel.io"
              className="field"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[12px] font-medium text-ink-muted"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="field"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            className="mt-2 w-full py-2.5"
          >
            {loading ? 'Signing in…' : 'Sign in'}
            {!loading && <ArrowRight size={14} />}
          </Button>
        </motion.form>

        <motion.p variants={item} className="mt-5 text-center font-mono text-[11px] text-ink-subtle">
          admin@sentinel.io · sentinel123
        </motion.p>

        {/* Signing in is the moment the terms start applying, so this is the
            one place they have to be reachable without hunting for them. */}
        <motion.div
          variants={item}
          className="mt-7 space-y-1.5 text-center font-mono text-[10.5px] text-ink-subtle"
        >
          <p>
            By signing in you accept our{' '}
            <Link to="/terms" className="text-ink-muted underline underline-offset-2 hover:text-ink">
              Terms
            </Link>{' '}
            and{' '}
            <Link
              to="/privacy"
              className="text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Privacy Policy
            </Link>
            .
          </p>
          <p>{copyright()}</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
