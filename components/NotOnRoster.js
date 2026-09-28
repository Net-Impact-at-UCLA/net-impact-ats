export default function NotOnRoster({ email }) {
  return (
    <main className="login">
      <div className="login-panel">
        <span className="brand-mark brand-mark-lg" aria-hidden="true" />
        <h1>You&apos;re not on the roster yet</h1>
        <p className="login-lede">
          You signed in as <strong>{email}</strong>, but that email isn&apos;t on the Net Impact
          member roster. Ask an admin to add it, then sign in again.
        </p>
        <form action="/auth/signout" method="post">
          <button className="btn btn-quiet" type="submit">Use a different account</button>
        </form>
      </div>
    </main>
  );
}
