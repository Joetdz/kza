import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import { setPriority, tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { PrismaService } from '../prisma/prisma.service';

/** A compressed video's file name ends so: the backlog knows what is already done. */
const COMPRESSED_SUFFIX = '.kz720.mp4';
const BUCKET = 'products';
/** Waits after start-up before the backlog, so the API serves first. */
const BACKLOG_DELAY_MS = 60_000;
const BACKLOG_BATCH = 200;
/** Above this, a video is left as it is (and retried at the next start). */
const MAX_INPUT_BYTES = 300 * 1024 * 1024;
const FFMPEG_TIMEOUT_MS = 10 * 60_000;

/**
 * Re-encodes the store videos for the feed: 720p at most on the short side, H.264 + AAC,
 * the index at the start of the file (« faststart ») so playback starts before the whole
 * file is there. Uploads go straight from the browser to storage, so this runs after: new
 * videos as they are added, older ones from a backlog at start-up. One at a time, at low
 * priority, so the API keeps answering. Needs ffmpeg on the server (FFMPEG_PATH, or
 * `ffmpeg` on the PATH); without it, videos stay as uploaded.
 */
@Injectable()
export class VideoCompressorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(VideoCompressorService.name);
  private readonly ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
  private readonly queue: string[] = [];
  private available = false;
  private running = false;

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    this.available = await this.ffmpegWorks();
    if (!this.available) {
      this.logger.warn('ffmpeg introuvable : les vidéos ne sont pas compressées (installe-le : apt install ffmpeg).');
      return;
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      this.available = false;
      this.logger.warn('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants : les vidéos ne sont pas compressées.');
      return;
    }
    setTimeout(() => this.queueBacklog().catch(err => this.logger.warn(`backlog: ${err?.message}`)), BACKLOG_DELAY_MS).unref();
  }

  /** A video just added: compressed in the background. */
  enqueue(mediaId: string) {
    if (!this.available || this.queue.includes(mediaId)) return;
    this.queue.push(mediaId);
    void this.drain();
  }

  private async queueBacklog() {
    const rows = await this.prisma.productMedia.findMany({
      where: { type: 'video', NOT: { url: { endsWith: COMPRESSED_SUFFIX } } },
      orderBy: { createdAt: 'desc' },
      take: BACKLOG_BATCH,
      select: { id: true },
    });
    if (rows.length) this.logger.log(`${rows.length} vidéo(s) à compresser`);
    rows.forEach(r => this.enqueue(r.id));
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        await this.compress(id).catch(err => this.logger.warn(`vidéo ${id} non compressée : ${err?.message}`));
      }
    } finally {
      this.running = false;
    }
  }

  private async compress(mediaId: string) {
    const media = await this.prisma.productMedia.findUnique({ where: { id: mediaId }, select: { id: true, url: true, type: true } });
    if (!media || media.type !== 'video' || media.url.endsWith(COMPRESSED_SUFFIX)) return;

    const dir = await fs.mkdtemp(join(tmpdir(), 'kz-video-'));
    const input = join(dir, 'in');
    const output = join(dir, 'out.mp4');
    try {
      const res = await fetch(media.url);
      if (!res.ok || !res.body) throw new Error(`téléchargement ${res.status}`);
      if (Number(res.headers.get('content-length') ?? 0) > MAX_INPUT_BYTES) throw new Error('fichier trop lourd');
      await pipeline(Readable.fromWeb(res.body as any), createWriteStream(input));

      await this.run([
        '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
        // 720 on the short side at most, whatever the orientation; never enlarged.
        '-vf', "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '96k', '-ac', '2',
        '-movflags', '+faststart', '-threads', '2',
        output,
      ]);

      const [before, after] = await Promise.all([fs.stat(input), fs.stat(output)]);
      const path = `videos/${media.id}${COMPRESSED_SUFFIX}`;
      await this.upload(path, await fs.readFile(output));
      const url = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

      // Only if the video was not replaced meanwhile.
      const { count } = await this.prisma.productMedia.updateMany({ where: { id: media.id, url: media.url }, data: { url } });
      if (count === 0) return;
      // The original stays in storage: nothing is deleted.
      this.logger.log(`vidéo ${media.id} : ${mb(before.size)} → ${mb(after.size)}`);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private run(args: string[]) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      // Lowest priority: the API's own requests come first.
      try { if (child.pid) setPriority(child.pid, 19); } catch { /* not allowed here: normal priority */ }
      let stderr = '';
      child.stderr.on('data', d => { stderr = (stderr + d).slice(-2000); });
      const timer = setTimeout(() => child.kill('SIGKILL'), FFMPEG_TIMEOUT_MS);
      child.on('error', err => { clearTimeout(timer); reject(err); });
      child.on('close', code => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${stderr.trim().split('\n').pop()}`));
      });
    });
  }

  private ffmpegWorks() {
    return new Promise<boolean>(resolve => {
      const child = spawn(this.ffmpeg, ['-version'], { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('close', code => resolve(code === 0));
    });
  }

  private async upload(path: string, body: Buffer) {
    const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'video/mp4',
        'Cache-Control': '31536000',
        'x-upsert': 'true',
      },
      body: new Uint8Array(body),
    });
    if (!res.ok) throw new Error(`envoi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
