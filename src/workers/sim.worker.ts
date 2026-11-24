import { CVD_TYPES, simulateRgbaBuffer, type CvdType } from '../lib/pcci';

export type SimWorkerRequest = {
  id: string;
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

export type SimWorkerResponse =
  | {
      id: string;
      width: number;
      height: number;
      simulations: Record<CvdType, Uint8ClampedArray>;
    }
  | {
      id: string;
      error: string;
    };

self.onmessage = (event: MessageEvent<SimWorkerRequest>) => {
  const { id, width, height, data } = event.data;
  try {
    const simulations = {} as Record<CvdType, Uint8ClampedArray>;
    const transfer: Transferable[] = [];
    for (const cvdType of CVD_TYPES) {
      const buf = simulateRgbaBuffer(data, cvdType);
      simulations[cvdType] = buf;
      transfer.push(buf.buffer);
    }
    self.postMessage({ id, width, height, simulations }, { transfer });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : 'CVD simulation worker failed.',
    });
  }
};
