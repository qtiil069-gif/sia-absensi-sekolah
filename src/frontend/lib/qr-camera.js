(() => {
  const api = {
    createReader: () => {
      const reader = new window.SIA.vendors.BrowserQRCodeReader();
      const decode = reader.decodeFromCanvas.bind(reader);
      reader.decodeFromCanvas = (canvas) => {
        try { return decode(canvas); }
        catch (original) {
          // Some valid QR masks defeat ZXing's finder-pattern selection.
          // Independently decode the same local pixels before giving up.
          try {
            const image = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
            const result = window.SIA.vendors.jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' });
            if (result) return { getText: () => result.data };
          } catch { /* Preserve the primary decoder error for its scan loop. */ }
          throw original;
        }
      };
      return reader;
    },
    async start(video, facing, onResult) {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Kamera memerlukan HTTPS dan dukungan izin kamera browser.');
      return api.createReader().decodeFromConstraints({ audio: false, video: { facingMode: { ideal: facing } } }, video,
        (result) => { if (result) onResult(result.getText()); });
    },
    stop(video, controls) {
      const stream = video.srcObject;
      try { controls?.stop(); } catch { /* Still release tracks if a reader has already stopped. */ }
      if (stream?.getTracks) stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }
  };
  window.SIA.qrCamera = api;
})();
