// audio-processor.worklet.js
// Runs in the AudioWorklet thread — receives mic audio at native sample rate,
// accumulates samples, and sends 1-second chunks to the main thread.

class ChunkProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this._nativeSR  = options.processorOptions.nativeSR || 44100;
    this._accumBuf  = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    // Append new samples (typed-array concat — no spread crash)
    const merged = new Float32Array(this._accumBuf.length + input.length);
    merged.set(this._accumBuf, 0);
    merged.set(input, this._accumBuf.length);
    this._accumBuf = merged;

    // Every 1 second of native-rate audio → send to main thread
    if (this._accumBuf.length >= this._nativeSR) {
      const chunk = this._accumBuf.slice(0, this._nativeSR);
      this._accumBuf = this._accumBuf.slice(this._nativeSR);
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
    }
    return true; // keep alive
  }
}

registerProcessor("chunk-processor", ChunkProcessor);
