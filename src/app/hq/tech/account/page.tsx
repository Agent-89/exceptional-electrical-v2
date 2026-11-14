import { requireHqUser, resolveSchedulingStaff } from '@/lib/hq-auth';
import { isTechnicianRole } from '@/lib/hq-roles';
import { redirect } from 'next/navigation';
import { logoutAction } from '../../actions';
import TechStyles from '../tech-styles';
import '../../hq.css';

export const dynamic = 'force-dynamic';

const SETUP_MESSAGES: Record<string, string> = {
  missing:
    'Your login is not linked to a scheduling staff profile. Ask office to set scheduling_staff.auth_user_id for your account.',
  inactive: 'Your scheduling staff profile is inactive. Ask office to reactivate it before field access is available.',
  duplicate:
    'Multiple scheduling staff rows are linked to your login. Ask office to keep a single active auth_user_id mapping.',
};

export default async function TechAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const user = await requireHqUser();
  if (!isTechnicianRole(user.role)) redirect('/hq');
  const { setup } = await searchParams;
  const link = await resolveSchedulingStaff(user.id);

  return (
    <main className="ee-tech">
      <TechStyles />
      <header className="ee-tech-head">
        <div className="hq-kicker">TECHNICIAN · ACCOUNT</div>
        <h1>Account</h1>
        <p>Signed in to Exceptional Electrical HQ.</p>
      </header>

      {setup && SETUP_MESSAGES[setup] ? (
        <p className="ee-tech-alert ee-tech-alert-error" role="alert">
          {SETUP_MESSAGES[setup]}
        </p>
      ) : null}

      {!link.ok && !setup ? (
        <p className="ee-tech-alert ee-tech-alert-error" role="alert">
          {SETUP_MESSAGES[link.reason]}
        </p>
      ) : null}

      <section className="ee-tech-panel ee-tech-account">
        <h2>Profile</h2>
        <p>
          <strong>{user.name}</strong>
          <br />
          <small>Staff name</small>
        </p>
        <p>
          <strong style={{ textTransform: 'capitalize' }}>{user.role}</strong>
          <br />
          <small>Role</small>
        </p>
        <p>
          <strong>{user.email || 'No email on account'}</strong>
          <br />
          <small>Email</small>
        </p>
        {link.ok ? (
          <p>
            <strong>{link.fullName}</strong>
            <br />
            <small>Scheduling identity</small>
          </p>
        ) : null}
      </section>

      <form action={logoutAction} className="ee-tech-logout">
        <button type="submit">Log out</button>
      </form>
    </main>
  );
}
