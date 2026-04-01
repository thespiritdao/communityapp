import Link from 'next/link';
import Image from 'next/image';
import { NotFoundReporter } from './not-found-client';

export default function NotFound() {
  return (
    <>
      <NotFoundReporter />
      <div style={styles.container}>
        <div style={styles.card}>
          <Image
            src="/images/404.png"
            alt="404"
            width={200}
            height={200}
            style={{ margin: '0 auto 16px', display: 'block' }}
          />
          <h1 style={styles.code}>404</h1>
          <h2 style={styles.heading}>Page Not Found</h2>
          <p style={styles.body}>
            This page doesn&apos;t exist or may have moved. Our team has been notified.
          </p>
          <div style={styles.actions}>
            <Link href="/" style={styles.primaryBtn}>
              Go Home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#F4F7F5',
    padding: '24px',
  },
  card: {
    background: '#FFFFFF',
    borderRadius: 16,
    padding: '48px 40px',
    maxWidth: 420,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    border: '1px solid #E0EDE8',
  },
  code: {
    fontSize: '5rem',
    fontWeight: 700,
    color: '#2F5D50',
    margin: '0 0 4px',
    lineHeight: 1,
  },
  heading: {
    fontSize: '1.4rem',
    fontWeight: 600,
    color: '#1A2B26',
    margin: '0 0 12px',
  },
  body: {
    fontSize: '0.95rem',
    color: '#556B64',
    lineHeight: 1.6,
    margin: '0 0 32px',
  },
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
  },
  primaryBtn: {
    display: 'inline-block',
    padding: '10px 24px',
    background: '#2F5D50',
    color: '#FFFFFF',
    borderRadius: 8,
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '0.95rem',
  },
};
