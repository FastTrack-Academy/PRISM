import { analyze } from '../lib/engine';
import type { WorkerRequest, WorkerResponse } from '../lib/types';
const send = (message: WorkerResponse) => self.postMessage(message);
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type === 'CANCEL') {
    self.close();
    return;
  }
  try {
    const result = analyze(req.raster, req.pageNumber, req.textRegions, req.warnings, (message) =>
      send({ type: 'PAGE_PROGRESS', id: req.id, message }),
    );
    send({ type: 'PAGE_RESULT', id: req.id, result });
  } catch (error) {
    send({
      type: 'ERROR',
      id: req.id,
      message: error instanceof Error ? error.message : 'Analysis worker failed.',
    });
  }
};
