'use client';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';

export function AccountNav() {
  const router = useRouter(); const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api<{ user: { email: string } | null }>('/api/auth').then(result => { if (active) setEmail(result.user?.email ?? null); }).catch(() => undefined);
    return () => { active = false; };
  }, [pathname]);
  async function logout() {
    await api('/api/auth', { method: 'POST', body: { action: 'logout' } });
    setEmail(null); router.push('/quizzes'); router.refresh();
  }
  return email ? <span className="account-nav"><span title={email}>{email}</span><button type="button" onClick={logout}>Đăng xuất</button></span> : <Link href="/login">Đăng nhập</Link>;
}
