import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { listJobAttachments, listJobNotes, signAttachmentUrls } from '@/lib/tech-field';
import { listTimeEntriesForJob } from '@/lib/tech-time';
import { listTechWorkReportsForJob } from '@/lib/tech-work-reports';
import JobFieldActivity from './job-field-activity';

type AppointmentView = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  fieldStatus: string;
  followUp: boolean;
  followUpResolvedAt: string | null;
  followUpLinkedAppointmentId: string | null;
  followUpResolution: 'linked_visit' | 'office_cleared' | null;
  followUpResolutionNote: string | null;
  completionNote: string | null;
  outstanding: string | null;
  issues: string | null;
  electricianNames: string[];
  crew?: { id: string; name: string; avatarColor: string | null }[];
  scheduleNotes: string | null;
};

function staffName(names: Record<string, string>, staffId: string) {
  return names[staffId] ?? 'Technician';
}

function mapTechReports(
  techReports: Awaited<ReturnType<typeof listTechWorkReportsForJob>>,
) {
  return techReports.map((report) => ({
    id: report.id,
    appointmentId: report.appointmentId,
    staffId: report.staffId,
    technicianName: report.technicianName,
    workSummary: report.workSummary,
    outstandingWork: report.outstandingWork,
    issues: report.issues,
    followUpRequired: report.followUpRequired,
    progressStatus: report.progressStatus,
    updatedAt: report.updatedAt,
  }));
}

async function loadFieldBundle(jobId: string, options: { signPhotos: boolean }) {
  let timeEntries: Awaited<ReturnType<typeof listTimeEntriesForJob>> = [];
  let notes: Awaited<ReturnType<typeof listJobNotes>> = [];
  let photos: Awaited<ReturnType<typeof signAttachmentUrls>> = [];
  let techReports: Awaited<ReturnType<typeof listTechWorkReportsForJob>> = [];
  try {
    const [times, noteRows, attachmentRows, reports] = await Promise.all([
      listTimeEntriesForJob(jobId),
      listJobNotes({ jobId, includeOfficeOnly: true }),
      listJobAttachments({ jobId }),
      listTechWorkReportsForJob(jobId),
    ]);
    timeEntries = times;
    notes = noteRows;
    techReports = reports;
    photos = options.signPhotos ? await signAttachmentUrls(attachmentRows, 600) : [];
  } catch {
    // Milestone 2 tables may not be applied on hosted yet.
  }
  return { timeEntries, notes, photos, techReports };
}

function FieldFallback({ label }: { label: string }) {
  return (
    <section className="hq-panel ee-compact-panel" aria-busy="true">
      <p className="ee-muted" style={{ margin: 0 }}>
        Loading {label}…
      </p>
    </section>
  );
}

async function JobAttentionSection({
  jobId,
  appointments,
  staffNames,
}: {
  jobId: string;
  appointments: AppointmentView[];
  staffNames: Record<string, string>;
}) {
  const { timeEntries, techReports } = await loadFieldBundle(jobId, { signPhotos: false });
  return (
    <JobFieldActivity
      jobId={jobId}
      appointments={appointments}
      techReports={mapTechReports(techReports)}
      timeEntries={timeEntries.map((entry) => ({
        id: entry.id,
        staffName: staffName(staffNames, entry.staffId),
        technicianUserId: entry.technicianUserId,
        appointmentId: entry.appointmentId,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        breakMinutes: entry.breakMinutes,
        workedMinutes: entry.workedMinutes,
        billableMinutes: entry.billableMinutes,
        status: entry.status,
        note: entry.note,
        rejectionReason: entry.rejectionReason,
        correctionNote: entry.correctionNote,
      }))}
      notes={[]}
      photos={[]}
      section="attention"
    />
  );
}

async function JobTimeSection({
  jobId,
  appointments,
  staffNames,
}: {
  jobId: string;
  appointments: AppointmentView[];
  staffNames: Record<string, string>;
}) {
  const { timeEntries, techReports } = await loadFieldBundle(jobId, { signPhotos: false });
  return (
    <JobFieldActivity
      jobId={jobId}
      appointments={appointments}
      techReports={mapTechReports(techReports)}
      timeEntries={timeEntries.map((entry) => ({
        id: entry.id,
        staffName: staffName(staffNames, entry.staffId),
        technicianUserId: entry.technicianUserId,
        appointmentId: entry.appointmentId,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        breakMinutes: entry.breakMinutes,
        workedMinutes: entry.workedMinutes,
        billableMinutes: entry.billableMinutes,
        status: entry.status,
        note: entry.note,
        rejectionReason: entry.rejectionReason,
        correctionNote: entry.correctionNote,
      }))}
      notes={[]}
      photos={[]}
      section="time"
    />
  );
}

async function JobVisitsSection({
  jobId,
  appointments,
  scheduleForm,
}: {
  jobId: string;
  appointments: AppointmentView[];
  scheduleForm?: ReactNode;
}) {
  const { techReports } = await loadFieldBundle(jobId, { signPhotos: false });
  return (
    <JobFieldActivity
      jobId={jobId}
      appointments={appointments}
      techReports={mapTechReports(techReports)}
      timeEntries={[]}
      notes={[]}
      photos={[]}
      section="visits"
      scheduleForm={scheduleForm}
    />
  );
}

async function JobFilesSection({
  jobId,
  appointments,
  staffNames,
}: {
  jobId: string;
  appointments: AppointmentView[];
  staffNames: Record<string, string>;
}) {
  const { timeEntries, notes, photos, techReports } = await loadFieldBundle(jobId, {
    signPhotos: true,
  });
  return (
    <JobFieldActivity
      jobId={jobId}
      appointments={appointments}
      techReports={mapTechReports(techReports)}
      timeEntries={timeEntries.map((entry) => ({
        id: entry.id,
        staffName: staffName(staffNames, entry.staffId),
        technicianUserId: entry.technicianUserId,
        appointmentId: entry.appointmentId,
        startedAt: entry.startedAt,
        endedAt: entry.endedAt,
        breakMinutes: entry.breakMinutes,
        workedMinutes: entry.workedMinutes,
        billableMinutes: entry.billableMinutes,
        status: entry.status,
        note: entry.note,
        rejectionReason: entry.rejectionReason,
        correctionNote: entry.correctionNote,
      }))}
      notes={notes.map((note) => ({
        id: note.id,
        body: note.body,
        authorName: note.authorName,
        visibility: note.visibility,
        createdAt: note.createdAt,
      }))}
      photos={photos.map((photo) => ({
        id: photo.id,
        signedUrl: photo.signedUrl ?? null,
        caption: photo.caption,
        uploadedByName: photo.uploadedByName,
        contentType: photo.contentType,
        createdAt: photo.createdAt,
        jobNoteId: photo.jobNoteId ?? null,
      }))}
      section="files"
    />
  );
}

export function SuspendedJobAttention(props: {
  jobId: string;
  appointments: AppointmentView[];
  staffNames: Record<string, string>;
}) {
  return (
    <Suspense fallback={<FieldFallback label="field attention" />}>
      <JobAttentionSection {...props} />
    </Suspense>
  );
}

export function SuspendedJobTime(props: {
  jobId: string;
  appointments: AppointmentView[];
  staffNames: Record<string, string>;
}) {
  return (
    <Suspense fallback={<FieldFallback label="time entries" />}>
      <JobTimeSection {...props} />
    </Suspense>
  );
}

export function SuspendedJobFiles(props: {
  jobId: string;
  appointments: AppointmentView[];
  staffNames: Record<string, string>;
}) {
  return (
    <Suspense fallback={<FieldFallback label="notes and photos" />}>
      <JobFilesSection {...props} />
    </Suspense>
  );
}

export function SuspendedJobVisits(props: {
  jobId: string;
  appointments: AppointmentView[];
  scheduleForm?: ReactNode;
}) {
  return (
    <Suspense fallback={<FieldFallback label="visits" />}>
      <JobVisitsSection {...props} />
    </Suspense>
  );
}
