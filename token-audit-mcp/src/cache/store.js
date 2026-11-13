import { mkdir, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export class JobStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  async _ensureDir() {
    try {
      await stat(this.baseDir);
    } catch {
      await mkdir(this.baseDir, { recursive: true });
    }
  }

  _jobPath(jobId) {
    return join(this.baseDir, jobId);
  }

  async set(jobId, meta) {
    await this._ensureDir();
    const jobDir = this._jobPath(jobId);
    await mkdir(jobDir, { recursive: true });
    await writeFile(join(jobDir, 'meta.json'), JSON.stringify(meta, null, 2));
    
    // Also save common artifacts at root level for easier access
    if (meta.report_json_path) {
      await writeFile(join(jobDir, 'report.json'), JSON.stringify(meta.report || {}, null, 2));
    }
    if (meta.declarations) {
      await writeFile(join(jobDir, 'declarations.json'), JSON.stringify(meta.declarations, null, 2));
    }
  }

  async get(jobId) {
    try {
      const metaPath = join(this._jobPath(jobId), 'meta.json');
      const content = await readFile(metaPath, 'utf8');
      
      let meta = JSON.parse(content);
      
      // Auto-load related files if they exist
      const jobDir = this._jobPath(jobId);
      
      try {
        const reportPath = join(jobDir, 'report.json');
        const reportStat = await stat(reportPath);
        if (reportStat.size > 0) {
          const reportContent = await readFile(reportPath, 'utf8');
          meta.report = JSON.parse(reportContent);
        }
      } catch { /* ignore */ }
      
      try {
        const declPath = join(jobDir, 'declarations.json');
        const declStat = await stat(declPath);
        if (declStat.size > 0) {
          const declContent = await readFile(declPath, 'utf8');
          meta.declarations = JSON.parse(declContent);
        }
      } catch { /* ignore */ }
      
      return meta;
    } catch {
      return null;
    }
  }

  async delete(jobId) {
    try {
      const jobDir = this._jobPath(jobId);
      const stats = await stat(jobDir);
      
      // Calculate total size
      let size = 0;
      const files = await readdir(jobDir);
      for (const file of files) {
        const fStat = await stat(join(jobDir, file));
        size += fStat.size;
        if (fStat.isDirectory()) {
          const subFiles = await readdir(join(jobDir, file));
          for (const subFile of subFiles) {
            const subStat = await stat(join(jobDir, file, subFile));
            size += subStat.size || 0;
          }
        }
      }
      
      await rm(jobDir, { recursive: true, force: true });
      return { deleted: true, freed_bytes: size };
    } catch {
      return { deleted: false, error: 'not found' };
    }
  }

  async list({ limit = 50, older_than_days = null, status = null } = {}) {
    try {
      await stat(this.baseDir);
    } catch {
      return { jobs: [], total: 0 };
    }

    const entries = await readdir(this.baseDir);
    const jobs = [];

    for (const jobId of entries) {
      const metaPath = join(this.baseDir, jobId, 'meta.json');
      try {
        const content = await readFile(metaPath, 'utf8');
        const meta = JSON.parse(content);
        
        if (status && meta.status !== status) continue;
        
        if (older_than_days) {
          const ageDays = (Date.now() - new Date(meta.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (ageDays > older_than_days) continue;
        }

        jobs.push({
          jobId,
          target: meta.target,
          created_at: meta.created_at,
          status: meta.status || 'pending',
          findings_count: meta.summary?.total || 0,
          size_bytes: 0
        });
      } catch {
        // Skip corrupted entries
        continue;
      }
    }

    return {
      jobs: jobs.slice(0, limit),
      total: jobs.length
    };
  }
}
