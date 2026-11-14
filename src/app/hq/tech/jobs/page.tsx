import Link from 'next/link';
import { requireTechnicianCrew } from '@/lib/hq-auth';
import { listTechnicianJobs } from '@/lib/tech-appointments';
import {
  formatJobNumber,
  formatPerthDate,
  formatPerthTime,
} from '@/lib/perth-day';
import { JOB_STATUS_LABELS } from '@/lib/job-statuses';
import TechStyles from '../tech-styles';
import '../../hq.css';

export const dynamic = 'force-dynamic';

export default async function TechJobsPage() {
  const crew = await requireTechnicianCrew();
  const jobs = await listTechnicianJobs(crew.staffId);

  return (
    <main className="ee-tech">
      <TechStyles />
      <header className="ee-tech-head">
        <div className="hq-kicker">TECHNICIAN · MY JOBS</div>
        <h1>My Jobs</h1>
        <p>Jobs with visits assigned to you.</p>
      </header>

      <section aria-label="Assigned jobs">
        {jobs.length ? (
          jobs.map((job) => (
            <article key={job.jobId} className="ee-tech-card">
              <div className="ee-tech-card-meta">
                <strong>{formatJobNumber(job.jobNumber)}</strong>
                <span className="ee-tech-status">
                  {JOB_STATUS_LABELS[job.jobStatus as keyof typeof JOB_STATUS_LABELS] ?? job.jobStatus}
                </span>
              </div>
              <h3>{job.title}</h3>
              <p>{job.customerName ?? 'Customer not assigned'}</p>
              <p className="ee-tech-muted">{job.siteAddress || 'Address needed'}</p>
              {job.nextVisit ? (
                <p className="ee-tech-muted">
                  Next visit: {formatPerthDate(job.nextVisit.startsAt)} ·{' '}
                  {formatPerthTime(job.nextVisit.startsAt)} – {formatPerthTime(job.nextVisit.endsAt)}
                </p>
              ) : (
                <p className="ee-tech-muted">{job.visitCount} visit{job.visitCount === 1 ? '' : 's'} on record</p>
              )}
              <div className="ee-tech-actions">
                {job.nextVisit ? (
                  <Link
                    className="ee-tech-btn ee-tech-btn-primary"
                    href={'/hq/tech/visits/' + job.nextVisit.appointmentId}
                  >
                    View next visit
                  </Link>
                ) : null}
                <Link className="ee-tech-btn ee-tech-btn-secondary" href={'/hq/tech/jobs/' + job.jobId}>
                  View job
                </Link>
              </div>
            </article>
          ))
        ) : (
          <div className="ee-tech-empty">
            <strong>No assigned jobs yet</strong>
            <p>When office schedules a visit with you on the crew, it will appear here.</p>
          </div>
        )}
      </section>
    </main>
  );
}
