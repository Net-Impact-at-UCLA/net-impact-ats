import SignInButton from '@/components/SignInButton';

export const metadata = { title: 'Sign in · Net Impact ATS' };

export default async function LoginPage({ searchParams }) {
  const { error } = await searchParams;

  return (
    <main className="login">
      <div className="login-panel">
        <span className="brand-mark brand-mark-lg" aria-hidden="true" />
        <h1>Net Impact ATS</h1>
        <p className="login-lede">
          Review applicants, score interviews, and vote in deliberations for Net Impact at UCLA.
        </p>
        <SignInButton />
        {error && (
          <p className="form-error" role="alert">
            Sign-in didn&apos;t go through. Try again, and if it keeps failing, ask an admin to
            confirm your email is on the roster.
          </p>
        )}
        <p className="login-foot">
          Use the Google account the exec board added to the roster. <a href="/privacy">Privacy</a>
        </p>
      </div>
    </main>
  );
}
