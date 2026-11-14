import 'server-only';
import { dbAdmin } from '@/lib/hq-auth';

export {
  ALLOWED_PHOTO_TYPES,
  FIELD_STATUSES,
  FIELD_STATUS_LABELS,
  MAX_PHOTO_BYTES,
  isFieldStatus,
  type FieldStatus,
} from '@/lib/tech-field-constants';

export type JobNoteRow = {
  id: string;
  jobId: string;
  appointmentId: string | null;
  authorId: string;
  authorName: string | null;
  visibility: 'shared' | 'office_only';
  body: string;
  createdAt: string;
  editedAt: string | null;
};

export type JobAttachmentRow = {
  id: string;
  jobId: string;
  appointmentId: string | null;
  uploadedBy: string;
  storagePath: string;
  contentType: string;
  byteSize: number;
  caption: string | null;
  createdAt: string;
  signedUrl?: string | null;
};

export async function listJobNotes(options: {
  jobId: string;
  appointmentId?: string | null;
  includeOfficeOnly: boolean;
}): Promise<JobNoteRow[]> {
  const db = dbAdmin();
  let query = db
    .from('job_notes')
    .select('id,job_id,appointment_id,author_id,visibility,body,created_at,edited_at')
    .eq('job_id', options.jobId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (options.appointmentId) query = query.eq('appointment_id', options.appointmentId);
  if (!options.includeOfficeOnly) query = query.eq('visibility', 'shared');

  const { data, error } = await query;
  if (error) throw new Error('Unable to load job notes.');
  const rows = data ?? [];
  const authorIds = [...new Set(rows.map((r) => r.author_id as string))];
  const { data: authors } = authorIds.length
    ? await db.from('staff_profiles').select('user_id,full_name').in('user_id', authorIds)
    : { data: [] as { user_id: string; full_name: string }[] };
  const nameMap = new Map((authors ?? []).map((a) => [a.user_id, a.full_name]));

  return rows.map((r) => ({
    id: r.id as string,
    jobId: r.job_id as string,
    appointmentId: (r.appointment_id as string | null) ?? null,
    authorId: r.author_id as string,
    authorName: nameMap.get(r.author_id as string) ?? null,
    visibility: r.visibility as 'shared' | 'office_only',
    body: r.body as string,
    createdAt: r.created_at as string,
    editedAt: (r.edited_at as string | null) ?? null,
  }));
}

export async function listJobAttachments(options: {
  jobId: string;
  appointmentId?: string | null;
}): Promise<JobAttachmentRow[]> {
  const db = dbAdmin();
  let query = db
    .from('job_attachments')
    .select('id,job_id,appointment_id,uploaded_by,storage_path,content_type,byte_size,caption,created_at')
    .eq('job_id', options.jobId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (options.appointmentId) query = query.eq('appointment_id', options.appointmentId);
  const { data, error } = await query;
  if (error) throw new Error('Unable to load job photos.');
  return (data ?? []).map((r) => ({
    id: r.id as string,
    jobId: r.job_id as string,
    appointmentId: (r.appointment_id as string | null) ?? null,
    uploadedBy: r.uploaded_by as string,
    storagePath: r.storage_path as string,
    contentType: r.content_type as string,
    byteSize: r.byte_size as number,
    caption: (r.caption as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

export async function signAttachmentUrls(
  attachments: JobAttachmentRow[],
  expiresIn = 300,
): Promise<JobAttachmentRow[]> {
  if (!attachments.length) return [];
  const db = dbAdmin();
  const signed = await Promise.all(
    attachments.map(async (a) => {
      const { data, error } = await db.storage
        .from('job-photos')
        .createSignedUrl(a.storagePath, expiresIn);
      if (error) return { ...a, signedUrl: null };
      return { ...a, signedUrl: data.signedUrl };
    }),
  );
  return signed;
}
