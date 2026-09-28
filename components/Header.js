import Link from 'next/link';

export default function Header({ member, cycleName }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Net Impact ATS
        </Link>
        {cycleName && <span className="cycle-name">{cycleName}</span>}
        <div className="topbar-right">
          {member && (
            <span className="who">
              {member.full_name || member.email}
              {member.role === 'admin' && <span className="badge">Admin</span>}
            </span>
          )}
          <form action="/auth/signout" method="post">
            <button className="btn btn-quiet" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
