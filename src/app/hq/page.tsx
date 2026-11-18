import Link from 'next/link';
import {BriefcaseBusiness,FilePlus2,Receipt,UsersRound} from 'lucide-react';
import {requireOfficeUser} from '@/lib/hq-auth';
import {formatDashboardHours,loadHqDashboard} from '@/lib/hq-dashboard';
import './hq.css';

export const dynamic='force-dynamic';

function metricValue(value:number|null){
  return value===null?'—':String(value);
}

export default async function HQ(){
  await requireOfficeUser();
  const data=await loadHqDashboard();
  const {today,tomorrow,todayVisits,attention,activity,hasErrors}=data;
  const scheduleTodayHref=`/hq/schedule?week=${today.dayKey}`;
  const scheduleTomorrowHref=`/hq/schedule?week=${tomorrow.dayKey}`;

  return (
    <main className="hq-dashboard">
      <div className="hq-dashboard-inner">
        <div className="hq-dashboard-heading">
          <div className="hq-kicker">EXCEPTIONAL ELECTRICAL HQ · OPERATIONS</div>
          <h1>Home</h1>
        </div>

        {hasErrors?(
          <p className="hq-dashboard-alert" role="alert">
            Some dashboard data could not be loaded. Counts may be incomplete.
          </p>
        ):null}

        <section className="hq-dashboard-section" aria-labelledby="pulse-title">
          <div className="hq-dashboard-section-head">
            <div>
              <div className="hq-kicker">TODAY&apos;S PULSE</div>
              <h2 id="pulse-title">Schedule load</h2>
            </div>
            <Link href={scheduleTodayHref}>Open schedule →</Link>
          </div>
          <div className="hq-dashboard-pulse">
            <Link href={scheduleTodayHref} className="hq-dashboard-pulse-card">
              <span>Jobs today</span>
              <strong>{today.jobCount}</strong>
              <small>
                {today.visitCount===1?`1 visit`:`${today.visitCount} visits`}
                {' · '}
                {formatDashboardHours(today.hours)}
              </small>
            </Link>
            <Link href={scheduleTomorrowHref} className="hq-dashboard-pulse-card">
              <span>Jobs tomorrow</span>
              <strong>{tomorrow.jobCount}</strong>
              <small>
                {tomorrow.visitCount===1?`1 visit`:`${tomorrow.visitCount} visits`}
                {' · '}
                {formatDashboardHours(tomorrow.hours)}
              </small>
            </Link>
          </div>
        </section>

        <section className="hq-dashboard-section" aria-labelledby="today-jobs-title">
          <div className="hq-dashboard-section-head">
            <div>
              <div className="hq-kicker">ON THE BOARD</div>
              <h2 id="today-jobs-title">Today&apos;s jobs</h2>
            </div>
            <Link href={scheduleTodayHref}>Open schedule →</Link>
          </div>
          <div className="hq-dashboard-queue">
            <div className="hq-dashboard-queue-title">
              <h3>Scheduled visits</h3>
              <span>Chronological for today (Perth)</span>
            </div>
            {todayVisits.length?(
              todayVisits.map((visit)=>(
                <Link
                  key={visit.appointmentId}
                  href={visit.href}
                  className="hq-dashboard-queue-item hq-dashboard-visit-item"
                >
                  <div>
                    <strong>
                      {visit.jobNumberLabel} · {visit.title}
                    </strong>
                    <small>
                      {visit.timeRange} · {visit.customerName} · {visit.crewLabel}
                    </small>
                  </div>
                  <span>
                    {visit.statusLabel} <b aria-hidden="true">→</b>
                  </span>
                </Link>
              ))
            ):(
              <p className="hq-dashboard-empty">Nothing scheduled today. Open the schedule to book a visit.</p>
            )}
          </div>
        </section>

        <section className="hq-dashboard-section" aria-labelledby="quick-title">
          <div className="hq-dashboard-section-head">
            <div>
              <div className="hq-kicker">GET THINGS DONE</div>
              <h2 id="quick-title">Quick actions</h2>
            </div>
          </div>
          <div className="hq-dashboard-actions hq-dashboard-actions-4">
            <Link href="/hq/quotes/new">
              <span aria-hidden="true"><FilePlus2 size={22} strokeWidth={1.9}/></span>
              <strong>Create quote</strong>
              <small>Start a new quotation</small>
            </Link>
            <Link href="/hq/invoices/new">
              <span aria-hidden="true"><Receipt size={22} strokeWidth={1.9}/></span>
              <strong>Create invoice</strong>
              <small>Bill completed work</small>
            </Link>
            <Link href="/hq/jobs/new">
              <span aria-hidden="true"><BriefcaseBusiness size={22} strokeWidth={1.9}/></span>
              <strong>Create job</strong>
              <small>Open a new job card</small>
            </Link>
            <Link href="/hq/customers">
              <span aria-hidden="true"><UsersRound size={22} strokeWidth={1.9}/></span>
              <strong>Customers</strong>
              <small>Find or add a customer</small>
            </Link>
          </div>
        </section>

        <section className="hq-dashboard-section" aria-labelledby="attention-title">
          <div className="hq-dashboard-section-head">
            <div>
              <div className="hq-kicker">NEEDS ATTENTION</div>
              <h2 id="attention-title">Follow-ups</h2>
            </div>
            <Link href="/hq/enquiries">Open enquiries →</Link>
          </div>
          <div className={`hq-dashboard-metrics${attention.invoicesAvailable?' hq-dashboard-metrics-4':' hq-dashboard-metrics-2'}`}>
            <Link href="/hq/enquiries">
              <span>New enquiries</span>
              <strong>{metricValue(attention.newEnquiries)}</strong>
              <small>Review incoming requests →</small>
            </Link>
            <Link href="/hq/quotes">
              <span>Quotes awaiting approval</span>
              <strong>{metricValue(attention.pendingQuotes)}</strong>
              <small>Review quote register →</small>
            </Link>
            {attention.invoicesAvailable?(
              <>
                <Link href="/hq/invoices?status=draft">
                  <span>Draft invoices</span>
                  <strong>{metricValue(attention.draftInvoices)}</strong>
                  <small>Finish and send →</small>
                </Link>
                <Link href="/hq/invoices?status=overdue">
                  <span>Overdue invoices</span>
                  <strong>{metricValue(attention.overdueInvoices)}</strong>
                  <small>Chase payment →</small>
                </Link>
              </>
            ):null}
          </div>
        </section>

        <section className="hq-dashboard-section" aria-labelledby="activity-title">
          <div className="hq-dashboard-section-head">
            <div>
              <div className="hq-kicker">BUSINESS ACTIVITY</div>
              <h2 id="activity-title">Recently updated quotes</h2>
            </div>
            <Link href="/hq/quotes">All quotes →</Link>
          </div>
          <div className="hq-dashboard-queue">
            {activity.length?(
              activity.map((item)=>(
                <Link key={item.id} href={item.href} className="hq-dashboard-queue-item">
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </div>
                  <span>
                    {item.label} <b aria-hidden="true">→</b>
                  </span>
                </Link>
              ))
            ):(
              <p className="hq-dashboard-empty">No quotes yet. Create one to get started.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
