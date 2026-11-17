import Link from 'next/link';
import {dbAdmin,requireOfficeUser} from '@/lib/hq-auth';
import {JOB_STATUSES,JOB_STATUS_LABELS,isJobStatus} from '@/lib/job-statuses';
import '../hq.css';

export const dynamic='force-dynamic';

type JobRow={
  id:string;
  job_number:number;
  title:string;
  status:string;
  priority:string;
  updated_at:string;
  customer_id:string|null;
  scheduled_start:string|null;
  next_action_at:string|null;
  source:string;
  customers:{name:string}|{name:string}[]|null;
};

const PAGE_SIZE=80;

const SORT_OPTIONS=[
  {id:'job_number',label:'Job number'},
  {id:'updated_at',label:'Updated'},
  {id:'priority',label:'Priority'},
  {id:'next_visit',label:'Next visit'},
] as const;

type SortId=(typeof SORT_OPTIONS)[number]['id'];

const PRIORITY_RANK:Record<string,number>={urgent:0,high:1,normal:2,low:3};

function isSortId(value:string):value is SortId{
  return SORT_OPTIONS.some(option=>option.id===value);
}

function customerName(row:JobRow):string{
  const c=row.customers;
  if(!c)return 'Customer not assigned';
  if(Array.isArray(c))return c[0]?.name||'Customer not assigned';
  return c.name||'Customer not assigned';
}

function sanitizeSearch(raw:string){
  return raw.replace(/[%_,]/g,' ').slice(0,80).trim();
}

export default async function JobsPage({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string;sort?:string}>}){
  await requireOfficeUser();
  const params=await searchParams;
  const db=dbAdmin();
  const qRaw=(params.q??'').trim();
  const q=sanitizeSearch(qRaw);
  const filter=params.status&&isJobStatus(params.status)?params.status:'all';
  const sort=isSortId(params.sort??'')?(params.sort as SortId):'job_number';
  const page=Math.max(1,Number.parseInt(params.page??'1',10)||1);
  const from=(page-1)*PAGE_SIZE;
  const to=from+PAGE_SIZE-1;

  let jobsQuery=db
    .from('jobs')
    .select('id,job_number,title,status,priority,updated_at,customer_id,scheduled_start,next_action_at,source,customers(name)',{count:'exact'})
    .range(from,to);

  if(sort==='job_number'){
    jobsQuery=jobsQuery.order('job_number',{ascending:false});
  }else if(sort==='priority'){
    // Alphabetical priority is imperfect; refine within the page below.
    jobsQuery=jobsQuery.order('priority',{ascending:true}).order('updated_at',{ascending:false});
  }else if(sort==='next_visit'){
    jobsQuery=jobsQuery.order('scheduled_start',{ascending:true,nullsFirst:false}).order('updated_at',{ascending:false});
  }else{
    jobsQuery=jobsQuery.order('updated_at',{ascending:false});
  }

  if(filter!=='all'){
    jobsQuery=jobsQuery.eq('status',filter);
  }

  if(q){
    const asNumber=Number.parseInt(q.replace(/\D/g,''),10);
    const looksLikeJobNumber=Number.isFinite(asNumber)&&asNumber>0&&/^\d+$/.test(q.replace(/^jb/i,'').trim());
    const {data:matchedCustomers}=await db
      .from('customers')
      .select('id')
      .ilike('name',`%${q}%`)
      .limit(40);
    const customerIds=(matchedCustomers??[]).map(row=>row.id);
    const clauses=[`title.ilike.%${q}%`];
    if(looksLikeJobNumber)clauses.push(`job_number.eq.${asNumber}`);
    if(customerIds.length)clauses.push(`customer_id.in.(${customerIds.join(',')})`);
    jobsQuery=jobsQuery.or(clauses.join(','));
  }

  const {data:jobs,error,count}=await jobsQuery;
  let list=((jobs??[]) as JobRow[]);

  const jobIds=list.map(j=>j.id);
  const nextVisit=new Map<string,string>();
  if(jobIds.length){
    const {data:appointments}=await db
      .from('job_appointments')
      .select('job_id,starts_at')
      .eq('status','scheduled')
      .in('job_id',jobIds)
      .gte('ends_at',new Date().toISOString())
      .order('starts_at',{ascending:true});
    for(const a of appointments??[])if(!nextVisit.has(a.job_id))nextVisit.set(a.job_id,a.starts_at);
  }

  if(sort==='priority'){
    list=[...list].sort((a,b)=>{
      const rankA=PRIORITY_RANK[a.priority]??99;
      const rankB=PRIORITY_RANK[b.priority]??99;
      if(rankA!==rankB)return rankA-rankB;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }else if(sort==='next_visit'){
    list=[...list].sort((a,b)=>{
      const aVisit=nextVisit.get(a.id)??a.scheduled_start??'';
      const bVisit=nextVisit.get(b.id)??b.scheduled_start??'';
      if(!aVisit&&!bVisit)return b.updated_at.localeCompare(a.updated_at);
      if(!aVisit)return 1;
      if(!bVisit)return -1;
      return aVisit.localeCompare(bVisit);
    });
  }

  const total=count??list.length;
  const showingLabel=`Showing ${list.length} of ${total}`;

  const qs=(extra:Record<string,string>)=>{
    const sp=new URLSearchParams();
    if(qRaw)sp.set('q',qRaw);
    if(filter&&filter!=='all')sp.set('status',filter);
    if(sort&&sort!=='job_number')sp.set('sort',sort);
    for(const [k,v] of Object.entries(extra))if(v)sp.set(k,v);
    const s=sp.toString();
    return s?'?'+s:'';
  };

  return <main className="hq-detail"><div className="hq-detail-inner ee-jobs-page">
 <div className="ee-jobs-heading"><div><div className="hq-kicker">OPERATIONS</div><h1>Jobs</h1></div><div className="ee-jobs-heading-actions"><Link href="/hq/schedule" className="ee-jobs-schedule-link">Schedule</Link><Link href="/hq/jobs/new" className="hq-detail-action-primary">+ New job</Link></div></div>
 <section className="hq-panel ee-jobs-register"><div className="ee-jobs-register-heading"><span className="ee-jobs-register-count">{showingLabel}</span></div>
 <form method="get" className="ee-jobs-filters">
  <input name="q" defaultValue={qRaw} placeholder="Search jobs, job number, or customer" aria-label="Search jobs"/>
  <div className="ee-jobs-filter-row">
   <label className="ee-jobs-field">
    <span className="ee-jobs-field-label">Filter</span>
    <select name="status" defaultValue={filter} aria-label="Filter by status">
     <option value="all">All jobs</option>
     {JOB_STATUSES.map(v=><option key={v} value={v}>{JOB_STATUS_LABELS[v]}</option>)}
    </select>
   </label>
   <label className="ee-jobs-field">
    <span className="ee-jobs-field-label">Sort by</span>
    <select name="sort" defaultValue={sort} aria-label="Sort jobs">
     {SORT_OPTIONS.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
    </select>
   </label>
   <button type="submit">Apply</button>
  </div>
 </form>
 {error?<p role="alert">Unable to load jobs.</p>:list.length?<div className="ee-jobs-list">{list.map(j=><Link key={j.id} href={'/hq/jobs/'+j.id}><div><small>JB{String(j.job_number).padStart(5,'0')} · {customerName(j)}</small><strong>{j.title}</strong><span>{nextVisit.has(j.id)?'Next visit: '+new Date(nextVisit.get(j.id)!).toLocaleString('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}):'No upcoming visit'}</span></div><div className="ee-job-trailing"><span className={'ee-job-status ee-status-'+j.status}>{JOB_STATUS_LABELS[j.status as keyof typeof JOB_STATUS_LABELS]??j.status}</span>{j.priority==='urgent'||j.priority==='high'?<small>{j.priority} priority</small>:null}</div></Link>)}</div>:<div className="ee-jobs-empty"><strong>{q||filter!=='all'?'No matching jobs':'Ready for your first job'}</strong><p>{q||filter!=='all'?'Try another search or filter.':'Create a work order to start managing your team’s work.'}</p>{!q&&filter==='all'&&<Link href="/hq/jobs/new">Create a job →</Link>}</div>}
 {total>PAGE_SIZE&&<div className="ee-jobs-pagination" style={{display:'flex',gap:12,marginTop:16,alignItems:'center'}}>
  {page>1&&<Link href={'/hq/jobs'+qs({page:String(page-1)})}>← Previous</Link>}
  <span style={{color:'#718398',fontSize:13}}>Page {page}</span>
  {from+list.length<total&&<Link href={'/hq/jobs'+qs({page:String(page+1)})}>Next →</Link>}
 </div>}
 </section></div><style>{`
.ee-jobs-page{max-width:1240px}.ee-jobs-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:12px 0 22px}.ee-jobs-heading-actions{display:flex;align-items:center;gap:12px}.ee-jobs-schedule-link{color:#0875c9;font-weight:700;text-decoration:none}.ee-jobs-heading h1{margin:5px 0;font-size:clamp(30px,5vw,40px)}.ee-jobs-register{padding:20px}.ee-jobs-register-heading{display:flex;align-items:center;justify-content:flex-end;gap:10px;min-height:20px}.ee-jobs-register-count{color:var(--hq-muted,#718398);font-size:13px}.ee-jobs-filters{display:flex;flex-direction:column;gap:8px;margin:12px 0 16px;max-width:960px}.ee-jobs-filter-row{display:flex;align-items:flex-end;gap:8px}.ee-jobs-field{display:grid;gap:5px;flex:1 1 0;min-width:0}.ee-jobs-field-label{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--hq-muted,#718398)}.ee-jobs-filters input[name="q"]{width:100%;height:46px;box-sizing:border-box}.ee-jobs-filters select{width:100%;min-width:0;height:46px;box-sizing:border-box}.ee-jobs-filters button{flex:0 0 auto;height:46px;display:inline-flex;align-items:center;justify-content:center}.ee-jobs-filters input,.ee-jobs-filters select,.ee-jobs-filters button{margin:0;line-height:22px;vertical-align:middle;appearance:auto;border:1px solid #cdd9e5;border-radius:10px;padding:11px;font-size:16px;background:var(--hq-card,#fff);color:inherit}.ee-jobs-list>a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 2px;border-bottom:1px solid var(--hq-border,#dce5ee);text-decoration:none;color:inherit}.ee-jobs-list>a>div:first-child{display:grid;gap:5px}.ee-jobs-list strong{font-size:15px}.ee-jobs-list small,.ee-jobs-list span{font-size:12px;color:var(--hq-muted,#718398)}.ee-job-trailing{display:grid;align-content:center;justify-items:end;gap:6px}.ee-job-status{padding:6px 9px;border-radius:20px;background:#e8f0fa;color:#194f7d!important;white-space:nowrap}.ee-status-completed{background:#e4f6eb;color:#17633b!important}.ee-status-unassigned,.ee-status-on_hold{background:#fff1db;color:#8c520b!important}.ee-status-assigned{background:#efe9fb;color:#58379a!important}.ee-status-scheduled{background:#e3f1ff;color:#0b5fa8!important}.ee-status-in_progress{background:#dff5f2;color:#0d6b62!important}.ee-status-to_invoice{background:#efe9fb;color:#58379a!important}.ee-status-tafe{background:#edf0f4;color:#596b7c!important}.ee-status-cancelled{background:#edf0f4;color:#596b7c!important;text-decoration:line-through}.ee-jobs-empty{text-align:center;padding:38px 10px}.ee-jobs-empty p{color:var(--hq-muted,#718398)}@media(min-width:1000px){.ee-jobs-register{padding:26px 30px}.ee-jobs-list>a{padding:17px 8px}}@media(max-width:700px){.ee-jobs-heading{align-items:flex-start}.ee-jobs-heading-actions{gap:8px}.ee-jobs-schedule-link{font-size:13px}.ee-jobs-heading .hq-detail-action-primary{white-space:nowrap;font-size:13px;padding:11px}.ee-jobs-register{padding:16px}.ee-jobs-filter-row{flex-wrap:wrap}.ee-jobs-field{flex:1 1 calc(50% - 4px)}.ee-jobs-filters button{flex:1 1 100%}}
`}</style></main>;
}
