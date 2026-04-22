import { Router, type RequestHandler } from 'express';
import Busboy from 'busboy';
import { PassThrough } from 'node:stream';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { Errors } from '../lib/errors.js';
import { createSha256Transform, createByteCounter } from '../lib/hash.js';
import { uploadToVt } from '../services/virustotal.js';
import { insertScan, getScanForUser, listScansForUser } from '../services/scans.js';

export const scans = Router();

const MAX_BYTES = 32 * 1024 * 1024;

const uploadHandler: RequestHandler = (req, res, next) => {
  if (!req.headers['content-type']?.startsWith('multipart/form-data')) {
    return next(Errors.validation('Expected multipart/form-data'));
  }

  // Fast reject if the client-declared Content-Length alone exceeds our limit
  // (plus a small multipart envelope tolerance). This avoids streaming a large
  // oversize body through to the remote VT endpoint. We drain the request body
  // so the response can be written cleanly without an RST.
  const declaredLen = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BYTES + 8 * 1024) {
    req.on('data', () => {
      /* drain */
    });
    req.on('end', () => next(Errors.tooLarge()));
    req.on('error', () => next(Errors.tooLarge()));
    return;
  }

  // Set busboy fileSize one byte above MAX_BYTES; our byte counter fires first
  // and rejects with Errors.tooLarge(), rather than busboy silently truncating.
  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES + 1 } });
  let handled = false;
  let sawFile = false;

  const fail = (err: Error): void => {
    if (handled) return;
    handled = true;
    req.unpipe(bb);
    next(err);
  };

  bb.on('file', (_name, stream, info) => {
    sawFile = true;
    const hasher = createSha256Transform();
    const counter = createByteCounter({ max: MAX_BYTES });
    const passthrough = new PassThrough();
    const onSize = (err: Error): void => {
      if (/file too large/i.test(err.message)) {
        fail(Errors.tooLarge());
      } else {
        fail(err);
      }
    };
    stream.on('limit', () => fail(Errors.tooLarge()));
    stream.pipe(hasher).pipe(counter).pipe(passthrough);
    counter.on('error', onSize);
    passthrough.on('error', fail);
    stream.on('error', fail);

    (async () => {
      try {
        const analysisId = await uploadToVt({
          apiKey: config.VT_API_KEY,
          filename: info.filename || 'upload.bin',
          stream: passthrough,
          contentType: info.mimeType,
        });

        const scan = await insertScan({
          userId: req.session.userId!,
          vtAnalysisId: analysisId,
          fileName: info.filename || 'upload.bin',
          fileSha256: hasher.digest(),
          fileSize: counter.bytes,
        });

        if (handled) return;
        handled = true;
        res.status(202).json({ scanId: scan.id, analysisId, status: 'queued' });
      } catch (err) {
        if (err instanceof Error && /file too large/i.test(err.message)) {
          return fail(Errors.tooLarge());
        }
        fail(err as Error);
      }
    })();
  });

  bb.on('error', fail);
  bb.on('close', () => {
    if (!handled && !sawFile) fail(Errors.validation('No file in upload'));
  });

  req.pipe(bb);
};

scans.post('/', requireAuth, uploadHandler);
scans.get('/', requireAuth, async (req, res, next) => {
  try {
    const list = await listScansForUser(req.session.userId!);
    res.json(
      list.map((s) => ({
        id: s.id,
        fileName: s.fileName,
        status: s.status,
        createdAt: s.createdAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});
scans.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return next(Errors.validation('Bad id'));
    const scan = await getScanForUser(id, req.session.userId!);
    if (!scan) return next(Errors.notFound('Scan'));
    res.json(scan);
  } catch (err) {
    next(err);
  }
});
