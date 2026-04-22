import { Router, type RequestHandler } from 'express';
import Busboy from 'busboy';
import { PassThrough } from 'node:stream';
import { config } from '../config.js';
import { Errors } from '../lib/errors.js';
import { createSha256Transform, createByteCounter } from '../lib/hash.js';
import { uploadToVt } from '../services/virustotal.js';
import { createScan, getScan } from '../services/scans.js';

export const scans = Router();

const MAX_BYTES = 32 * 1024 * 1024;

const uploadHandler: RequestHandler = (req, res, next) => {
  if (!req.headers['content-type']?.startsWith('multipart/form-data')) {
    return next(Errors.validation('Expected multipart/form-data'));
  }

  const contentLength = Number(req.headers['content-length'] ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES + 1024) {
    // Drain and reject early — prevents streaming a huge payload to VT.
    req.on('data', () => undefined);
    return next(Errors.tooLarge());
  }

  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_BYTES } });
  let handled = false;
  let sawFile = false;

  const fail = (err: Error): void => {
    if (handled) return;
    handled = true;
    req.unpipe(bb);
    req.on('data', () => undefined);
    next(err);
  };

  bb.on('file', (_name, stream, info) => {
    sawFile = true;
    stream.on('limit', () => fail(Errors.tooLarge()));

    void (async () => {
      try {
        const hasher = createSha256Transform();
        const counter = createByteCounter({ max: MAX_BYTES });
        const passthrough = new PassThrough();

        stream.pipe(hasher).pipe(counter).pipe(passthrough);
        counter.on('error', fail);
        passthrough.on('error', fail);

        const analysisId = await uploadToVt({
          apiKey: config.VT_API_KEY,
          filename: info.filename || 'upload.bin',
          stream: passthrough,
          contentType: info.mimeType,
        });

        const scan = createScan({
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

scans.post('/', uploadHandler);

scans.get('/:id', (req, res, next) => {
  const id = req.params.id;
  if (!id) return next(Errors.notFound('Scan'));
  const scan = getScan(id);
  if (!scan) return next(Errors.notFound('Scan'));
  res.json(scan);
});
