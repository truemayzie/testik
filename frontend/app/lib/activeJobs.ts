/**
 * In-memory store активных заданий генерации.
 * Живёт в рамках Node.js-процесса — не переживает перезапуск сервера.
 */

interface JobInfo {
  jobId:    string;
  topic:    string;
  pages:    number;
  workType: string;
}

const jobs = new Map<string, JobInfo>();

export const activeJobs = {
  set(userId: string, info: JobInfo) {
    jobs.set(userId, info);
  },
  get(userId: string): JobInfo | null {
    return jobs.get(userId) ?? null;
  },
  clear(userId: string) {
    jobs.delete(userId);
  },
};
